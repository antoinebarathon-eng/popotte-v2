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

type Category = {
  id: string;
  nom: string;
};

// Émojis connus pour les catégories historiques ; toute catégorie ajoutée
// depuis l'admin (donc absente d'ici) retombe sur 🛒 au lieu de planter.
const categoryEmojis: Record<string, string> = {
  boisson: '🥤',
  friandise: '🍬',
  chips: '🍟',
  alcool: '🍺',
};

function categoryEmoji(categorie: string) {
  return categoryEmojis[categorie] ?? '🛒';
}

function categoryLabel(categorie: string) {
  const nom = categorie.charAt(0).toUpperCase() + categorie.slice(1);
  return `${categoryEmoji(categorie)} ${nom}`;
}

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

  return categoryEmoji(category);
}

function plural(count: number, singular: string, plural_: string) {
  return count >= 2 ? plural_ : singular;
}

export default function DashboardPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, saveCart] = useCart();

  const [username, setUsername] = useState('');
  const [balanceCents, setBalanceCents] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('tous');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // Les catégories viennent de la table dédiée (gérée depuis l'admin) et
  // non plus d'une liste figée dans le code : une catégorie ajoutée ou
  // renommée dans l'admin apparaît ici sans redéploiement.
  const loadCategories = useCallback(async () => {
    try {
      const { data, error: categoriesError } = await supabase
        .from('categories')
        .select('id, nom')
        .order('nom');

      if (categoriesError) throw categoriesError;

      setCategories(data || []);
    } catch (err) {
      // Non bloquant : les produits restent utilisables sans les filtres.
      console.error(err);
    }
  }, []);

  useEffect(() => {
    // Fonction asynchrone locale : un appel direct dans le corps de l'effet
    // déclenche une cascade de rendus.
    const charger = async () => {
      await Promise.all([loadProfile(), loadProducts(), loadCategories()]);
    };

    charger();
  }, [loadProfile, loadProducts, loadCategories]);

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

            <p className="text-gray-400 text-[10px] font-black tracking-[0.18em] mt-2">
              BTA SAINT-MÉDARD-EN-JALLES
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Le lien admin était affiché à tout le monde. */}
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Administration"
                className="w-12 h-12 rounded-xl bg-[#14161b] border border-white/10 flex items-center justify-center text-xl active:scale-95 transition"
              >
                <span aria-hidden="true">⚙️</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className="w-12 h-12 rounded-xl bg-[#14161b] border border-white/10 flex items-center justify-center text-xl active:scale-95 transition"
            >
              <span aria-hidden="true">⏻</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/cart')}
              aria-label={`Voir le panier, ${cartCount} ${plural(cartCount, 'article', 'articles')}`}
              className="relative w-12 h-12 rounded-xl bg-[#14161b] border border-white/10 hover:bg-white/5 flex items-center justify-center text-xl active:scale-95 transition"
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
            <div className="min-w-0 flex flex-col gap-1">
              <p className="text-gray-400 text-xs">Bonjour</p>

              <p className="text-lg font-black truncate">
                {username || 'Utilisateur'}
              </p>
            </div>

            <div className="text-right border-l border-white/10 pl-5 flex flex-col gap-1">
              <p className="text-gray-400 text-xs">
                {debtCents > 0 ? 'Ma dette' : 'Mon solde'}
              </p>

              {/* La dette s'affichait en vert, comme un solde positif. */}
              <p
                className={`text-2xl font-black ${
                  debtCents > 0 ? 'text-red-400' : 'text-white'
                }`}
              >
                {formatEuros(debtCents > 0 ? debtCents : balanceCents)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-[0.2em] font-black text-gray-400">
            Catégories
          </h2>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('tous')}
              aria-pressed={selectedCategory === 'tous'}
              className={`shrink-0 px-5 py-3 rounded-xl bg-[#14161b] border font-black text-sm transition ${
                selectedCategory === 'tous'
                  ? 'border-white/40 text-white'
                  : 'border-white/10 text-gray-400'
              }`}
            >
              Tous
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.nom)}
                aria-pressed={selectedCategory === category.nom}
                className={`shrink-0 px-5 py-3 rounded-xl bg-[#14161b] border font-black text-sm transition ${
                  selectedCategory === category.nom
                    ? 'border-white/40 text-white'
                    : 'border-white/10 text-gray-400'
                }`}
              >
                {categoryLabel(category.nom)}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7 flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xs uppercase tracking-[0.2em] font-black text-gray-400">
              Produits
            </h2>

            <p className="text-gray-400 text-xs shrink-0">
              {filteredProducts.length}{' '}
              {plural(filteredProducts.length, 'produit', 'produits')}{' '}
              {plural(filteredProducts.length, 'disponible', 'disponibles')}
            </p>
          </div>

          {loading && (
            <div className="text-center py-16 text-gray-400 text-sm">
              Chargement des produits...
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="bg-red-950/40 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm"
            >
              {error}
            </div>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <div className="bg-[#14161b] border border-white/10 rounded-3xl p-8 text-center text-gray-400 text-sm">
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
                  className="bg-[#14161b] border border-white/10 rounded-3xl p-5 overflow-hidden flex flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 shrink-0 rounded-xl bg-[#0d0f13] flex items-center justify-center text-2xl">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image_url}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <span aria-hidden="true">
                          {getEmoji(product.categorie, product.nom)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex flex-col gap-1">
                      <h3 className="text-lg font-black">{product.nom}</h3>

                      <p className="text-gray-400 text-sm">
                        {product.description || product.nom}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-lg font-black text-white">
                      {formatEuros(toCents(product.prix))}
                    </p>

                    <p className="text-gray-400 text-xs">
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
                      aria-label={available ? `Ajouter ${product.nom}` : undefined}
                      onClick={() => addProduct(product)}
                      className="w-full bg-white hover:bg-gray-200 text-black disabled:bg-white/10 disabled:text-gray-500 py-3.5 rounded-xl font-black text-base transition active:scale-[0.98]"
                    >
                      {available ? 'Ajouter' : 'Rupture de stock'}
                    </button>
                  ) : (
                    <div className="w-full bg-white text-black rounded-xl overflow-hidden flex items-center">
                      <button
                        type="button"
                        aria-label={`Retirer un ${product.nom}`}
                        onClick={() => removeProduct(product)}
                        className="w-14 h-12 text-xl font-black hover:bg-gray-200 transition"
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
                        className="w-14 h-12 text-xl font-black hover:bg-gray-200 disabled:opacity-40 transition"
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
          className="fixed bottom-5 left-4 right-4 z-50 max-w-lg mx-auto bg-white hover:bg-gray-200 text-black rounded-xl px-5 py-4 shadow-2xl shadow-black/40 flex items-center justify-between gap-4 active:scale-[0.98] transition"
        >
          <span className="font-black">
            Voir mon panier · {cartCount}{' '}
            {plural(cartCount, 'article', 'articles')}
          </span>

          <span className="font-black">{formatEuros(cartTotalCents)}</span>
        </button>
      )}
    </main>
  );
}
