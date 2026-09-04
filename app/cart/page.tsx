'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatEuros, toCents } from '@/lib/money';
import { clearCart, useCart, type CartLine } from '@/lib/cart';

type Product = {
  id: string;
  nom: string;
  description?: string | null;
  prix: number;
  categorie?: string | null;
  image_url?: string | null;
  stock_quantity: number;
  active: boolean;
};

type OrderSummary = {
  totalCents: number;
  detteCents: number;
};

export default function CartPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, saveCart] = useCart();
  const [soldeCents, setSoldeCents] = useState(0);

  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState<OrderSummary | null>(null);

  // setOrdering est asynchrone : un double clic rapide passait deux fois
  // avant le premier rendu. Le verrou ci-dessous est immédiat.
  const orderInFlight = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const meResponse = await fetch('/api/auth/me', { cache: 'no-store' });

      if (meResponse.status === 401) {
        router.replace('/auth/login');
        return;
      }

      const me = await meResponse.json();

      if (!meResponse.ok) {
        throw new Error(me?.error || 'Impossible de lire ton compte.');
      }

      setSoldeCents(toCents(me.user.solde_compte));

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (productsError) throw productsError;

      setProducts(productsData || []);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Impossible de charger le panier.'
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Passer par une fonction asynchrone locale : un appel direct dans le
    // corps de l'effet déclenche une cascade de rendus.
    const charger = async () => {
      await loadData();
    };

    charger();
  }, [loadData]);

  // Un produit désactivé ou supprimé disparaissait du panier sans un mot,
  // et le stockage gardait la ligne fantôme.
  useEffect(() => {
    if (loading || products.length === 0 || cart.length === 0) return;

    const orphans = cart.filter(
      (line) => !products.some((product) => product.id === line.id)
    );

    if (orphans.length === 0) return;

    saveCart(cart.filter((line: CartLine) => !orphans.includes(line)));

    // On synchronise ici un système extérieur (le stockage du navigateur)
    // vers l'affichage : c'est le cas d'usage prévu pour un effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice(
      orphans.length === 1
        ? "Un produit n'est plus disponible, il a été retiré de ton panier."
        : `${orphans.length} produits ne sont plus disponibles, ils ont été retirés de ton panier.`
    );
  }, [cart, products, loading, saveCart]);

  function updateQuantity(productId: string, quantity: number) {
    const product = products.find((p) => p.id === productId);

    if (!product) return;

    if (quantity <= 0) {
      setError('');
      saveCart(cart.filter((line) => line.id !== productId));
      return;
    }

    if (quantity > product.stock_quantity) {
      setError(`Stock insuffisant pour ${product.nom}.`);
      return;
    }

    setError('');

    saveCart(
      cart.map((line) =>
        line.id === productId ? { ...line, quantite: quantity } : line
      )
    );
  }

  const cartItems = useMemo(() => {
    return cart
      .map((line) => {
        const product = products.find((p) => p.id === line.id);
        return product ? { product, quantity: line.quantite } : null;
      })
      .filter((item): item is { product: Product; quantity: number } =>
        Boolean(item)
      );
  }, [cart, products]);

  const totalCents = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + toCents(item.product.prix) * item.quantity,
        0
      ),
    [cartItems]
  );

  const totalItems = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  async function handleOrder() {
    if (orderInFlight.current) return;
    if (cartItems.length === 0) {
      setError('Ton panier est vide.');
      return;
    }

    orderInFlight.current = true;
    setOrdering(true);
    setError('');

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Si la requête part deux fois, le serveur rejoue la même
          // réponse au lieu de passer une deuxième commande.
          'x-idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            product_id: item.product.id,
            quantite: item.quantity,
          })),
        }),
      });

      const result = await response.json();

      if (response.status === 401) {
        router.replace('/auth/login');
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error || 'Impossible de valider la commande.');
      }

      // Le montant vient de la réponse : la fenêtre de confirmation
      // recalculait le total à partir d'un panier déjà vidé et affichait
      // donc toujours « Total : 0.00 € ».
      setSummary({
        totalCents: toCents(result.total),
        detteCents: toCents(result.montantDette),
      });

      setSoldeCents(toCents(result.nouveauSolde));

      clearCart();
      setNotice('');

      // Les stocks affichés viennent de changer.
      loadData();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue lors de la commande.'
      );
    } finally {
      orderInFlight.current = false;
      setOrdering(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#090a0d] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4" aria-hidden="true">
            🛒
          </div>
          <p className="text-gray-400">Chargement du panier...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090a0d] text-white pb-10">
      <header className="sticky top-0 z-40 bg-[#101114]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-gray-300 hover:text-white font-medium"
          >
            ← Retour
          </Link>

          <h1 className="text-xl md:text-2xl font-black">🛒 panier</h1>

          <div className="text-sm text-gray-400">
            {totalItems} article{totalItems >= 2 ? 's' : ''}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <section className="rounded-3xl border border-white/10 bg-[#191b21] p-5 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Solde disponible</span>

            <strong
              className={`text-2xl font-black ${
                soldeCents < 0 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {formatEuros(soldeCents)}
            </strong>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mb-6 bg-red-950/40 border border-red-500/40 text-red-200 px-5 py-4 rounded-2xl"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-6 bg-amber-950/40 border border-amber-500/40 text-amber-200 px-5 py-4 rounded-2xl"
          >
            {notice}
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-7xl mb-6" aria-hidden="true">
              🛒
            </div>

            <h2 className="text-2xl font-black mb-3">Ton panier est vide</h2>

            <p className="text-gray-400 mb-8">
              Ajoute des produits depuis le catalogue.
            </p>

            <Link
              href="/dashboard"
              className="inline-flex bg-blue-600 hover:bg-blue-500 px-7 py-4 rounded-2xl font-black"
            >
              Voir les produits
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {cartItems.map(({ product, quantity }) => (
                <article
                  key={product.id}
                  className="bg-[#191b21] border border-white/10 rounded-3xl p-5"
                >
                  <div className="flex flex-col gap-5">
                    <div className="flex justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-black">{product.nom}</h2>

                        <p className="text-gray-400 text-sm mt-1">
                          {product.description || product.nom}
                        </p>

                        <p className="text-emerald-400 font-black text-xl mt-3">
                          {formatEuros(toCents(product.prix))}
                        </p>
                      </div>

                      <strong className="text-xl font-black">
                        {formatEuros(toCents(product.prix) * quantity)}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        disabled={ordering}
                        aria-label={`Retirer un ${product.nom}`}
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        className="w-12 h-12 rounded-xl bg-[#292c33] font-black text-xl"
                      >
                        −
                      </button>

                      <span className="text-xl font-black">
                        <span className="sr-only">Quantité : </span>
                        {quantity}
                      </span>

                      <button
                        type="button"
                        disabled={ordering || quantity >= product.stock_quantity}
                        aria-label={`Ajouter un ${product.nom}`}
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        className="w-12 h-12 rounded-xl bg-blue-600 font-black text-xl disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={ordering}
                      onClick={() => updateQuantity(product.id, 0)}
                      className="text-red-400 text-sm font-bold text-left"
                    >
                      Supprimer {product.nom}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <section className="mt-8 bg-[#191b21] border border-white/10 rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-lg">Total</span>

                <span className="text-3xl font-black text-emerald-400">
                  {formatEuros(totalCents)}
                </span>
              </div>

              {soldeCents < totalCents && (
                <div className="mt-5 bg-red-950/40 border border-red-500/30 rounded-2xl p-4">
                  <p className="text-red-300 font-black">⚠️ Solde insuffisant</p>

                  <p className="text-red-200 text-sm mt-2">
                    La commande sera quand même acceptée.
                  </p>

                  <p className="text-red-200 text-sm mt-2">
                    Dette après commande :{' '}
                    <strong>
                      {formatEuros(totalCents - Math.max(soldeCents, 0))}
                    </strong>
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleOrder}
                disabled={ordering || cartItems.length === 0}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 px-6 py-4 rounded-2xl font-black text-lg"
              >
                {ordering
                  ? 'Commande en cours...'
                  : `Valider ma commande — ${formatEuros(totalCents)}`}
              </button>

              <Link
                href="/dashboard"
                className="block text-center mt-4 text-gray-400 text-sm"
              >
                ← Continuer mes achats
              </Link>
            </section>
          </>
        )}
      </div>

      {summary && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-titre"
            className="w-full max-w-md bg-[#191b21] border border-emerald-500/30 rounded-3xl p-7 text-center"
          >
            <div className="text-6xl mb-4" aria-hidden="true">
              ✅
            </div>

            <p className="text-emerald-400 font-black">COMMANDE CONFIRMÉE</p>

            <h2 id="confirmation-titre" className="text-2xl font-black mt-2">
              Merci pour ta commande !
            </h2>

            <p className="text-gray-400 mt-4">
              Total : {formatEuros(summary.totalCents)}
            </p>

            {summary.detteCents > 0 && (
              <p className="text-red-400 font-black mt-3">
                Dette créée : {formatEuros(summary.detteCents)}
              </p>
            )}

            <button
              type="button"
              autoFocus
              onClick={() => {
                setSummary(null);
                router.push('/dashboard');
              }}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-500 px-6 py-4 rounded-2xl font-black"
            >
              Continuer
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
