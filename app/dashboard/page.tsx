'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatEuros, toCents } from '@/lib/money';
import { addToCart, countItems, useCart, type CartLine } from '@/lib/cart';

type Product = {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  categorie: string;
  image_url: string | null;
  stock_quantity: number;
  active: boolean;
};

const categoryLabels: Record<string, string> = {
  boisson: '🥤 Boissons',
  friandise: '🍬 Friandises',
  chips: '🍟 Chips',
};

function getEmoji(category: string, name: string) {
  const n = name.toLowerCase();

  if (n.includes('coca') || n.includes('fanta')) {
    return '🥤';
  }

  if (
    n.includes('mars') ||
    n.includes('twix') ||
    n.includes('mms') ||
    n.includes('bonbon')
  ) {
    return '🍫';
  }

  if (category === 'chips') return '🍟';
  if (category === 'boisson') return '🥤';

  return '🍬';
}

function plural(count: number, singular: string, plural_: string) {
  return count >= 2 ? plural_ : singular;
}

export default function DashboardPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, saveCart] = useCart();

  const [username, setUsername] = useState('');
  const [grade, setGrade] = useState('');
  const [balanceCents, setBalanceCents] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('tous');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showRespect, setShowRespect] = useState(false);

  // Le solde et la dette venaient du localStorage, figés à la connexion :
  // après un remboursement enregistré par l'admin, l'utilisateur voyait
  // toujours son ancienne dette. Ils sont désormais relus au montage.
  const loadProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });

      if (response.status === 401) {
        router.replace('/auth/login');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Impossible de lire ton compte.');
      }

      setUsername(data.user.nom || data.user.username || '');
      setGrade(data.user.grade || '');
      setBalanceCents(toCents(data.user.solde_compte));
      setIsAdmin(Boolean(data.user.is_admin));
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Impossible de lire ton compte.'
      );
    }
  }, [router]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: productsError } = await supabase
        .from('products')
        .select(
          'id, nom, description, prix, categorie, image_url, stock_quantity, active'
        )
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (productsError) throw productsError;

      setProducts(data || []);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les produits.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fonction asynchrone locale : un appel direct dans le corps de l'effet
    // déclenche une cascade de rendus.
    const charger = async () => {
      await Promise.all([loadProfile(), loadProducts()]);
    };

    charger();
  }, [loadProfile, loadProducts]);

  // La connexion écrivait « popotte_show_respect » et le tableau de bord
  // lisait « popotte_respect_shown » : le message ne s'affichait qu'une
  // seule fois par navigateur. Même clé des deux côtés, et on la consomme.
  useEffect(() => {
    if (!grade) return;
    if (localStorage.getItem('popotte_show_respect') !== '1') return;

    localStorage.removeItem('popotte_show_respect');

    // Lecture d'un système extérieur (le stockage) vers l'affichage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowRespect(true);

    const timer = setTimeout(() => setShowRespect(false), 3000);

    return () => clearTimeout(timer);
  }, [grade]);

  const getQuantity = useCallback(
    (productId: string) =>
      cart.find((line) => line.id === productId)?.quantite || 0,
    [cart]
  );

  function addProduct(product: Product) {
    if (getQuantity(product.id) >= product.stock_quantity) return;

    saveCart(addToCart(cart, product.id));
  }

  function removeProduct(product: Product) {
    const existing = cart.find((line) => line.id === product.id);

    if (!existing) return;

    if (existing.quantite <= 1) {
      saveCart(cart.filter((line) => line.id !== product.id));
      return;
    }

    saveCart(
      cart.map((line: CartLine) =>
        line.id === product.id
          ? { ...line, quantite: line.quantite - 1 }
          : line
      )
    );
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.clear();
    router.replace('/auth/login');
  }

  const cartCount = useMemo(() => countItems(cart), [cart]);

  // Le total se calcule depuis le catalogue, comme dans la page panier :
  // le prix enregistré à l'ajout devenait faux dès qu'il changeait.
  const cartTotalCents = useMemo(
    () =>
      cart.reduce((total, line) => {
        const product = products.find((p) => p.id === line.id);
        return product ? total + toCents(product.prix) * line.quantite : total;
      }, 0),
    [cart, products]
  );

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'tous') return products;

    return products.filter((product) => product.categorie === selectedCategory);
  }, [products, selectedCategory]);

  const debtCents = balanceCents < 0 ? Math.abs(balanceCents) : 0;

  return (
    <main className="min-h-screen bg-[#090a0d] text-white pb-10">
      {showRespect && grade && (
        <div className="fixed top-5 left-4 right-4 z-[100] flex justify-center pointer-events-none">
          <div className="w-full max-w-md bg-[#191b21] border border-blue-500/40 rounded-2xl px-5 py-4 shadow-2xl shadow-blue-900/30">
            <p className="text-blue-400 font-black text-lg">
              Mes respects {grade}
            </p>

            <p className="text-gray-300 text-sm mt-1">Comment allez vous ?</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-[#090a0d]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <h1
              className="text-4xl leading-none text-white"
              style={{
                fontFamily:
                  'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
              }}
            >
              POPOTTE
            </h1>

            <p className="text-gray-500 text-[10px] font-black tracking-[0.18em] mt-2">
              BTA SAINT-MÉDARD-EN-JALLES
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Le lien admin était affiché à tout le monde. */}
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Administration"
                className="w-12 h-12 rounded-2xl bg-[#191b21] border border-white/10 flex items-center justify-center text-xl active:scale-95 transition"
              >
                <span aria-hidden="true">⚙️</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className="w-12 h-12 rounded-2xl bg-[#191b21] border border-white/10 flex items-center justify-center text-xl active:scale-95 transition"
            >
              <span aria-hidden="true">⏻</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/cart')}
              aria-label={`Voir le panier, ${cartCount} ${plural(cartCount, 'article', 'articles')}`}
              className="relative w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-xl active:scale-95 transition"
            >
              <span aria-hidden="true">🛒</span>

              {cartCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-white text-black text-[11px] font-black flex items-center justify-center"
                >
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5">
        <section className="mt-5 bg-[#14161b] border border-white/10 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-gray-400 text-sm">Bonjour</p>

              <p className="text-xl font-black truncate">
                {username || 'Utilisateur'}
              </p>

              {grade && (
                <div className="mt-3 inline-flex px-3 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/30">
                  <span className="text-blue-400 text-xs font-black">
                    {grade}
                  </span>
                </div>
              )}
            </div>

            <div className="text-right border-l border-white/10 pl-5">
              <p className="text-gray-400 text-xs">
                {debtCents > 0 ? 'Ma dette' : 'Mon solde'}
              </p>

              {/* La dette s'affichait en vert, comme un solde positif. */}
              <p
                className={`text-2xl font-black ${
                  debtCents > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {formatEuros(debtCents > 0 ? debtCents : balanceCents)}
              </p>

              <span
                className={`inline-block mt-1 px-2 py-1 rounded-full text-[9px] font-black uppercase ${
                  debtCents > 0
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}
              >
                {debtCents > 0 ? 'À régler' : 'À jour'}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-7">
          <h2 className="text-xs uppercase tracking-[0.2em] font-black text-gray-400 mb-3">
            NOS CATÉGORIES
          </h2>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('tous')}
              aria-pressed={selectedCategory === 'tous'}
              className={`shrink-0 px-5 py-3 rounded-2xl font-black text-sm transition ${
                selectedCategory === 'tous'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#191b21] text-gray-300 border border-white/10'
              }`}
            >
              ▦ Tous
            </button>

            {Object.entries(categoryLabels).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedCategory(key)}
                aria-pressed={selectedCategory === key}
                className={`shrink-0 px-5 py-3 rounded-2xl font-black text-sm transition ${
                  selectedCategory === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#191b21] text-gray-300 border border-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2
                className="text-3xl text-white"
                style={{
                  fontFamily:
                    'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                }}
              >
                NOS PRODUITS
              </h2>

              <p className="text-gray-400 text-sm mt-1">
                {filteredProducts.length}{' '}
                {plural(filteredProducts.length, 'produit', 'produits')}{' '}
                {plural(filteredProducts.length, 'disponible', 'disponibles')}
              </p>
            </div>

            {cartCount > 0 && (
              <button
                type="button"
                onClick={() => router.push('/cart')}
                className="text-blue-400 font-black text-sm"
              >
                Voir le panier →
              </button>
            )}
          </div>

          {loading && (
            <div className="text-center py-16 text-gray-400">
              Chargement des produits...
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="bg-red-950/50 border border-red-500/30 text-red-300 rounded-2xl p-4 text-sm"
            >
              {error}
            </div>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <div className="bg-[#14161b] border border-white/10 rounded-3xl p-8 text-center text-gray-400">
              Aucun produit dans cette catégorie.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredProducts.map((product) => {
              const quantity = getQuantity(product.id);
              const available = product.stock_quantity > quantity;

              return (
                <article
                  key={product.id}
                  className="bg-[#14161b] border border-white/10 rounded-3xl p-5 overflow-hidden"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 shrink-0 rounded-2xl bg-[#101114] flex items-center justify-center text-3xl">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image_url}
                          alt=""
                          width={64}
                          height={64}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (
                        <span aria-hidden="true">
                          {getEmoji(product.categorie, product.nom)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-xl font-black">{product.nom}</h3>

                      <p className="text-gray-400 text-sm mt-1">
                        {product.description || product.nom}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-3xl font-black text-emerald-400">
                      {formatEuros(toCents(product.prix))}
                    </p>

                    <p className="text-gray-400 text-xs mt-1">
                      {product.stock_quantity > 0
                        ? `${product.stock_quantity} ${plural(
                            product.stock_quantity,
                            'disponible',
                            'disponibles'
                          )}`
                        : 'Rupture de stock'}
                    </p>
                  </div>

                  {quantity === 0 ? (
                    <button
                      type="button"
                      disabled={!available}
                      onClick={() => addProduct(product)}
                      className="w-full mt-5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 py-3.5 rounded-2xl font-black text-base transition active:scale-[0.98]"
                    >
                      {available
                        ? `+ Ajouter ${product.nom}`
                        : 'Rupture de stock'}
                    </button>
                  ) : (
                    <div className="w-full mt-5 bg-blue-600 rounded-2xl overflow-hidden flex items-center">
                      <button
                        type="button"
                        aria-label={`Retirer un ${product.nom}`}
                        onClick={() => removeProduct(product)}
                        className="w-14 h-12 text-xl font-black hover:bg-blue-500 transition"
                      >
                        −
                      </button>

                      <div className="flex-1 text-center font-black">
                        <span className="sr-only">Quantité : </span>
                        {quantity}
                      </div>

                      <button
                        type="button"
                        disabled={!available}
                        aria-label={`Ajouter un ${product.nom}`}
                        onClick={() => addProduct(product)}
                        className="w-14 h-12 text-xl font-black hover:bg-blue-500 disabled:opacity-40 transition"
                      >
                        +
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {cartCount > 0 && (
        <button
          type="button"
          onClick={() => router.push('/cart')}
          className="fixed bottom-5 left-4 right-4 z-50 max-w-lg mx-auto bg-blue-600 hover:bg-blue-500 rounded-2xl px-5 py-4 shadow-2xl shadow-blue-900/40 flex items-center justify-between active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">
              🛒
            </span>

            <div className="text-left">
              <p className="font-black">
                {cartCount} {plural(cartCount, 'article', 'articles')}
              </p>

              <p className="text-xs text-blue-100">Voir ma commande</p>
            </div>
          </div>

          <span className="text-lg font-black">
            {formatEuros(cartTotalCents)}
          </span>
        </button>
      )}
    </main>
  );
}
