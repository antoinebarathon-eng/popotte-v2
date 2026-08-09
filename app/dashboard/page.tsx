'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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

type CartItem = {
  id: string;
  nom: string;
  prix: number;
  quantite: number;
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

  if (category === 'chips') {
    return '🍟';
  }

  if (category === 'boisson') {
    return '🥤';
  }

  return '🍬';
}

export default function DashboardPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [username, setUsername] = useState('');
  const [grade, setGrade] = useState('');
  const [balance, setBalance] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState('tous');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showRespect, setShowRespect] = useState(false);

  useEffect(() => {
    const savedUsername =
      localStorage.getItem('username') || '';

    const savedGrade =
      localStorage.getItem('grade') || '';

    const savedBalance =
      Number(localStorage.getItem('solde_compte') || 0);

    setUsername(savedUsername);
    setGrade(savedGrade);
    setBalance(savedBalance);

    const savedCart =
      localStorage.getItem('popotte_cart');

    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);

        if (Array.isArray(parsed)) {
          setCart(parsed);
        }
      } catch {
        localStorage.removeItem('popotte_cart');
      }
    }

    if (savedGrade && localStorage.getItem('popotte_respect_shown') !== '1') {
      setShowRespect(true);
      localStorage.setItem('popotte_respect_shown', '1');

      const timer = setTimeout(() => {
        setShowRespect(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: productsError } = await supabase
        .from('products')
        .select(
          'id, nom, description, prix, categorie, image_url, stock_quantity, active'
        )
        .eq('active', true)
        .order('created_at', {
          ascending: true,
        });

      if (productsError) {
        throw productsError;
      }

      setProducts(data || []);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message ||
          'Impossible de charger les produits.'
      );
    } finally {
      setLoading(false);
    }
  };

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem(
      'popotte_cart',
      JSON.stringify(newCart)
    );
  };

  const getQuantity = (productId: string) => {
    const item = cart.find(
      (item) => item.id === productId
    );

    return item?.quantite || 0;
  };

  const addProduct = (product: Product) => {
    const currentQuantity =
      getQuantity(product.id);

    if (
      product.stock_quantity <= 0 ||
      currentQuantity >= product.stock_quantity
    ) {
      return;
    }

    const existing = cart.find(
      (item) => item.id === product.id
    );

    let newCart: CartItem[];

    if (existing) {
      newCart = cart.map((item) =>
        item.id === product.id
          ? {
              ...item,
              quantite: item.quantite + 1,
            }
          : item
      );
    } else {
      newCart = [
        ...cart,
        {
          id: product.id,
          nom: product.nom,
          prix: Number(product.prix),
          quantite: 1,
        },
      ];
    }

    saveCart(newCart);
  };

  const removeProduct = (product: Product) => {
    const existing = cart.find(
      (item) => item.id === product.id
    );

    if (!existing) {
      return;
    }

    if (existing.quantite <= 1) {
      saveCart(
        cart.filter(
          (item) => item.id !== product.id
        )
      );
      return;
    }

    saveCart(
      cart.map((item) =>
        item.id === product.id
          ? {
              ...item,
              quantite: item.quantite - 1,
            }
          : item
      )
    );
  };

  const cartCount = useMemo(() => {
    return cart.reduce(
      (total, item) => total + item.quantite,
      0
    );
  }, [cart]);

  const cartTotal = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total + item.prix * item.quantite,
      0
    );
  }, [cart]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'tous') {
      return products;
    }

    return products.filter(
      (product) =>
        product.categorie === selectedCategory
    );
  }, [products, selectedCategory]);

  const debt = balance < 0
    ? Math.abs(balance)
    : 0;

  return (
    <main className="min-h-screen bg-[#090a0d] text-white pb-10">

      {/* MESSAGE MES RESPECTS */}

      {showRespect && grade && (
        <div className="fixed top-5 left-4 right-4 z-[100] flex justify-center pointer-events-none">

          <div className="w-full max-w-md bg-[#191b21] border border-blue-500/40 rounded-2xl px-5 py-4 shadow-2xl shadow-blue-900/30">

            <p className="text-blue-400 font-black text-lg">
              Mes respects {grade}
            </p>

            <p className="text-gray-300 text-sm mt-1">
              Comment allez vous ?
            </p>

          </div>

        </div>
      )}

      {/* HEADER */}

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

            {/* ADMIN */}

            <Link
              href="/admin"
              className="w-12 h-12 rounded-2xl bg-[#191b21] border border-white/10 flex items-center justify-center text-xl active:scale-95 transition"
              title="Administration"
            >
              ⚙️
            </Link>

            {/* PANIER */}

            <button
              type="button"
              onClick={() => router.push('/cart')}
              className="relative w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-xl active:scale-95 transition"
            >
              🛒

              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-white text-black text-[11px] font-black flex items-center justify-center">
                  {cartCount}
                </span>
              )}

            </button>

          </div>

        </div>

      </header>

      {/* CONTENU */}

      <div className="max-w-5xl mx-auto px-5">

        {/* UTILISATEUR */}

        <section className="mt-5 bg-[#14161b] border border-white/10 rounded-3xl p-5">

          <div className="flex items-center justify-between gap-4">

            <div className="min-w-0">

              <p className="text-gray-500 text-sm">
                Bonjour
              </p>

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

              <p className="text-gray-500 text-xs">
                Ma dette
              </p>

              <p className="text-2xl font-black text-emerald-400">
                {debt.toFixed(2)} €
              </p>

              <span className="inline-block mt-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase">
                {debt > 0 ? 'À régler' : 'À jour'}
              </span>

            </div>

          </div>

        </section>

        {/* CATEGORIES */}

        <section className="mt-7">

          <h2 className="text-xs uppercase tracking-[0.2em] font-black text-gray-400 mb-3">
            NOS CATÉGORIES
          </h2>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">

            <button
              type="button"
              onClick={() => setSelectedCategory('tous')}
              className={`shrink-0 px-5 py-3 rounded-2xl font-black text-sm transition ${
                selectedCategory === 'tous'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#191b21] text-gray-300 border border-white/10'
              }`}
            >
              ▦ Tous
            </button>

            {Object.entries(categoryLabels).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(key)
                  }
                  className={`shrink-0 px-5 py-3 rounded-2xl font-black text-sm transition ${
                    selectedCategory === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#191b21] text-gray-300 border border-white/10'
                  }`}
                >
                  {label}
                </button>
              )
            )}

          </div>

        </section>

        {/* PRODUITS */}

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

              <p className="text-gray-500 text-sm mt-1">
                {filteredProducts.length}{' '}
                produit
                {filteredProducts.length > 1
                  ? 's'
                  : ''}{' '}
                disponible
                {filteredProducts.length > 1
                  ? 's'
                  : ''}
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
            <div className="text-center py-16 text-gray-500">
              Chargement des produits...
            </div>
          )}

          {error && (
            <div className="bg-red-950/50 border border-red-500/30 text-red-300 rounded-2xl p-4 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <div className="bg-[#14161b] border border-white/10 rounded-3xl p-8 text-center text-gray-500">
              Aucun produit dans cette catégorie.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {filteredProducts.map((product) => {

              const quantity =
                getQuantity(product.id);

              const available =
                product.stock_quantity > quantity;

              return (
                <article
                  key={product.id}
                  className="bg-[#14161b] border border-white/10 rounded-3xl p-5 overflow-hidden"
                >

                  <div className="flex items-start gap-3">

                    <div className="w-16 h-16 shrink-0 rounded-2xl bg-[#101114] flex items-center justify-center text-3xl">

                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.nom}
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (
                        getEmoji(
                          product.categorie,
                          product.nom
                        )
                      )}

                    </div>

                    <div className="min-w-0">

                      <h3 className="text-xl font-black">
                        {product.nom}
                      </h3>

                      <p className="text-gray-500 text-sm mt-1">
                        {product.description ||
                          product.nom}
                      </p>

                    </div>

                  </div>

                  <div className="mt-5">

                    <p className="text-3xl font-black text-emerald-400">
                      {Number(product.prix).toFixed(2)} €
                    </p>

                    <p className="text-gray-600 text-xs mt-1">
                      {product.stock_quantity > 0
                        ? `${product.stock_quantity} disponible${
                            product.stock_quantity > 1
                              ? 's'
                              : ''
                          }`
                        : 'Rupture de stock'}
                    </p>

                  </div>

                  {/* CONTROLES */}

                  {quantity === 0 ? (

                    <button
                      type="button"
                      disabled={!available}
                      onClick={() =>
                        addProduct(product)
                      }
                      className="w-full mt-5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 py-3.5 rounded-2xl font-black text-base transition active:scale-[0.98]"
                    >
                      {available
                        ? '+ Ajouter'
                        : 'Rupture de stock'}
                    </button>

                  ) : (

                    <div className="w-full mt-5 bg-blue-600 rounded-2xl overflow-hidden flex items-center">

                      <button
                        type="button"
                        onClick={() =>
                          removeProduct(product)
                        }
                        className="w-14 h-12 text-xl font-black hover:bg-blue-500 transition"
                      >
                        −
                      </button>

                      <div className="flex-1 text-center font-black">
                        {quantity}
                      </div>

                      <button
                        type="button"
                        disabled={!available}
                        onClick={() =>
                          addProduct(product)
                        }
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

      {/* PANIER FLOTTANT */}

      {cartCount > 0 && (
        <button
          type="button"
          onClick={() => router.push('/cart')}
          className="fixed bottom-5 left-4 right-4 z-50 max-w-lg mx-auto bg-blue-600 hover:bg-blue-500 rounded-2xl px-5 py-4 shadow-2xl shadow-blue-900/40 flex items-center justify-between active:scale-[0.98] transition"
        >

          <div className="flex items-center gap-3">

            <span className="text-xl">
              🛒
            </span>

            <div className="text-left">

              <p className="font-black">
                {cartCount} article
                {cartCount > 1 ? 's' : ''}
              </p>

              <p className="text-xs text-blue-100">
                Voir ma commande
              </p>

            </div>

          </div>

          <span className="text-lg font-black">
            {cartTotal.toFixed(2)} €
          </span>

        </button>
      )}

    </main>
  );
}

