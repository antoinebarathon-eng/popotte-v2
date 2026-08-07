'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Header from '@/app/components/Header';
import ProductCard from '@/app/components/ProductCard';
import Link from 'next/link';

type Product = {
  id: string;
  nom: string;
  prix: number;
  categorie: string;
  description: string;
  image_url?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [username, setUsername] = useState('');
  const [solde, setSolde] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const userId = localStorage.getItem('user_id');
      const storedUsername = localStorage.getItem('username');
      const storedSolde = localStorage.getItem('solde_compte');

      if (!userId) {
        router.push('/auth/login');
        return;
      }

      setUsername(storedUsername || '');
      setSolde(parseFloat(storedSolde || '0'));

      await loadProducts();
      await loadCartCount();
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('categorie');

      if (!error && data) {
        setProducts(data);
        setFilteredProducts(data);
      }
    } catch (err) {
      console.error('Erreur chargement produits:', err);
    }
  };

  const loadCartCount = async () => {
    const userId = localStorage.getItem('user_id');
    if (!userId) return;

    try {
      const { count } = await supabase
        .from('cart_items')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      setCartCount(count || 0);
    } catch (err) {
      console.error('Erreur chargement panier:', err);
    }
  };

  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(category);
    if (category === 'all') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter(p => p.categorie === category));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('solde_compte');
    router.push('/auth/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <div className="text-xl">Chargement...</div>
      </div>
    );
  }

  const categories = ['all', 'boisson', 'friandise', 'alcool', 'chips'];

  return (
    <main className="min-h-screen bg-zinc-900 text-white">
      <Header />

      <div className="bg-zinc-800 border-b border-zinc-700 py-4 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex justify-between items-center flex-wrap gap-4">
          <div>
            <p className="text-gray-400">Bienvenue</p>
            <p className="text-2xl font-bold">{username}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-right">
              <p className="text-gray-400 text-sm">Solde compte</p>
              <p className="text-2xl font-bold text-green-400">{solde.toFixed(2)}€</p>
            </div>
            <Link href="/cart" className="relative bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold transition">
              🛒 Panier
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold transition"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800 py-4 px-4 md:px-8 border-b border-zinc-700">
        <div className="max-w-6xl mx-auto flex gap-2 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryFilter(cat)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-blue-600'
                  : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              {cat === 'all' ? '📦 Tous' : cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={async () => {
                const userId = localStorage.getItem('user_id');
                if (!userId) {
                  router.push('/auth/login');
                  return;
                }

                try {
                  const { data: existing } = await supabase
                    .from('cart_items')
                    .select('id, quantite')
                    .eq('user_id', userId)
                    .eq('product_id', product.id)
                    .single();

                  if (existing) {
                    await supabase
                      .from('cart_items')
                      .update({ quantite: existing.quantite + 1 })
                      .eq('id', existing.id);
                  } else {
                    await supabase
                      .from('cart_items')
                      .insert([{
                        user_id: userId,
                        product_id: product.id,
                        quantite: 1,
                      }]);
                  }

                  await loadCartCount();
                } catch (err) {
                  console.error('Erreur ajout panier:', err);
                }
              }}
            />
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">Aucun produit disponible</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 right-4">
        <Link href="/admin" className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-bold transition">
          ⚙️ Admin
        </Link>
      </div>
    </main>
  );
}