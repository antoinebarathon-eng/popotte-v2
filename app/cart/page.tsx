'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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

type CartItem = {
  id: string;
  nom: string;
  prix: number;
  quantite: number;
};

export default function CartPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [solde, setSolde] = useState(0);

  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [dette, setDette] = useState(0);

  useEffect(() => {
    const userId = localStorage.getItem('user_id');

    if (!userId) {
      router.replace('/auth/login');
      return;
    }

    loadData(userId);
  }, [router]);

  async function loadData(userId: string) {
    try {
      const savedCart = localStorage.getItem('popotte_cart');

      if (savedCart) {
        try {
          const parsed = JSON.parse(savedCart);

          if (Array.isArray(parsed)) {
            setCart(parsed);
          } else {
            setCart([]);
          }
        } catch {
          setCart([]);
          localStorage.removeItem('popotte_cart');
        }
      }

      const { data: productsData, error: productsError } =
        await supabase
          .from('products')
          .select('*')
          .eq('active', true)
          .order('created_at', { ascending: true });

      if (productsError) throw productsError;

      setProducts(productsData || []);

      const { data: userData, error: userError } =
        await supabase
          .from('users')
          .select('solde_compte')
          .eq('id', userId)
          .maybeSingle();

      if (userError) throw userError;

      const balance = Number(userData?.solde_compte || 0);

      setSolde(balance);
      localStorage.setItem('solde_compte', String(balance));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Impossible de charger le panier.');
    } finally {
      setLoading(false);
    }
  }

  function saveCart(nextCart: CartItem[]) {
    setCart(nextCart);
    localStorage.setItem('popotte_cart', JSON.stringify(nextCart));
  }

  function updateQuantity(productId: string, quantity: number) {
    const product = products.find(p => p.id === productId);

    if (!product) return;

    if (quantity <= 0) {
      saveCart(cart.filter(item => item.id !== productId));
      return;
    }

    if (quantity > product.stock_quantity) {
      setError(`Stock insuffisant pour ${product.nom}.`);
      return;
    }

    setError('');

    saveCart(
      cart.map(item =>
        item.id === productId
          ? { ...item, quantite: quantity }
          : item
      )
    );
  }

  const cartItems = useMemo(() => {
    return cart
      .map(item => {
        const product = products.find(p => p.id === item.id);

        if (!product) return null;

        return {
          product,
          quantity: item.quantite,
        };
      })
      .filter(Boolean) as {
        product: Product;
        quantity: number;
      }[];
  }, [cart, products]);

  const total = useMemo(() => {
    return cartItems.reduce(
      (sum, item) =>
        sum + Number(item.product.prix) * item.quantity,
      0
    );
  }, [cartItems]);

  const totalItems = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
  }, [cartItems]);

  async function handleOrder() {
    const userId = localStorage.getItem('user_id');

    if (!userId) {
      router.replace('/auth/login');
      return;
    }

    if (cartItems.length === 0) {
      setError('Ton panier est vide.');
      return;
    }

    setOrdering(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          items: cartItems.map(item => ({
            product_id: item.product.id,
            quantite: item.quantity,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || 'Impossible de valider la commande.'
        );
      }

      const nouveauSolde = Number(result.nouveauSolde ?? 0);
      const montantDette = Number(result.montantDette ?? 0);

      setSolde(nouveauSolde);
      setDette(montantDette);

      localStorage.setItem(
        'solde_compte',
        String(nouveauSolde)
      );

      localStorage.removeItem('popotte_cart');
      setCart([]);

      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message ||
        'Une erreur est survenue lors de la commande.'
      );
    } finally {
      setOrdering(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#090a0d] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🛒</div>
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

          <h1 className="text-xl md:text-2xl font-black">
            🛒 panier
          </h1>

          <div className="text-sm text-gray-400">
            {totalItems} article{totalItems > 1 ? 's' : ''}
          </div>

        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">

        <section className="rounded-3xl border border-white/10 bg-[#191b21] p-5 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">
              Solde disponible
            </span>

            <strong
              className={`text-2xl font-black ${
                solde < 0
                  ? 'text-red-400'
                  : 'text-emerald-400'
              }`}
            >
              {solde.toFixed(2)} €
            </strong>
          </div>
        </section>

        {error && (
          <div className="mb-6 bg-red-950/40 border border-red-500/40 text-red-200 px-5 py-4 rounded-2xl">
            {error}
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className="text-center py-24">

            <div className="text-7xl mb-6">🛒</div>

            <h2 className="text-2xl font-black mb-3">
              Ton panier est vide
            </h2>

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
                        <h2 className="text-xl font-black">
                          {product.nom}
                        </h2>

                        <p className="text-gray-400 text-sm mt-1">
                          {product.description || product.nom}
                        </p>

                        <p className="text-emerald-400 font-black text-xl mt-3">
                          {Number(product.prix).toFixed(2)} €
                        </p>
                      </div>

                      <strong className="text-xl font-black">
                        {(Number(product.prix) * quantity).toFixed(2)} €
                      </strong>

                    </div>

                    <div className="flex items-center justify-between">

                      <button
                        type="button"
                        disabled={ordering}
                        onClick={() =>
                          updateQuantity(product.id, quantity - 1)
                        }
                        className="w-12 h-12 rounded-xl bg-[#292c33] font-black text-xl"
                      >
                        −
                      </button>

                      <span className="text-xl font-black">
                        {quantity}
                      </span>

                      <button
                        type="button"
                        disabled={
                          ordering ||
                          quantity >= product.stock_quantity
                        }
                        onClick={() =>
                          updateQuantity(product.id, quantity + 1)
                        }
                        className="w-12 h-12 rounded-xl bg-blue-600 font-black text-xl disabled:opacity-40"
                      >
                        +
                      </button>

                    </div>

                    <button
                      type="button"
                      disabled={ordering}
                      onClick={() =>
                        updateQuantity(product.id, 0)
                      }
                      className="text-red-400 text-sm font-bold text-left"
                    >
                      Supprimer
                    </button>

                  </div>

                </article>

              ))}

            </div>

            <section className="mt-8 bg-[#191b21] border border-white/10 rounded-3xl p-5">

              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-lg">
                  Total
                </span>

                <span className="text-3xl font-black text-emerald-400">
                  {total.toFixed(2)} €
                </span>
              </div>

              {solde < total && (
                <div className="mt-5 bg-red-950/40 border border-red-500/30 rounded-2xl p-4">
                  <p className="text-red-300 font-black">
                    ⚠️ Solde insuffisant
                  </p>

                  <p className="text-red-200 text-sm mt-2">
                    La commande sera quand même acceptée.
                  </p>

                  <p className="text-red-200 text-sm mt-2">
                    Dette après commande :{' '}
                    <strong>
                      {(total - solde).toFixed(2)} €
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
                  : `Valider ma commande — ${total.toFixed(2)} €`}
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

      {success && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4">

          <div className="w-full max-w-md bg-[#191b21] border border-emerald-500/30 rounded-3xl p-7 text-center">

            <div className="text-6xl mb-4">
              ✅
            </div>

            <p className="text-emerald-400 font-black">
              COMMANDE CONFIRMÉE
            </p>

            <h2 className="text-2xl font-black mt-2">
              Merci pour ta commande !
            </h2>

            <p className="text-gray-400 mt-4">
              Total : {total.toFixed(2)} €
            </p>

            {dette > 0 && (
              <p className="text-red-400 font-black mt-3">
                Dette créée : {dette.toFixed(2)} €
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setSuccess(false);
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
