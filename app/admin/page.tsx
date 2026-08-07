'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';

type Product = {
  id: string;
  nom: string;
  description: string;
  prix: number;
  categorie: string;
  stock_quantity: number;
  active: boolean;
};

type User = {
  id: string;
  username: string;
  email: string;
  solde_compte: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<'products' | 'users'>('products');
  const [loading, setLoading] = useState(false);

  const [newProduct, setNewProduct] = useState({
    nom: '',
    description: '',
    prix: '',
    categorie: 'boisson',
    stock_quantity: '',
  });

  useEffect(() => {
    const checkAuth = () => {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        router.push('/auth/login');
      }
    };
    checkAuth();
  }, [router]);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminCode === '1664') {
      setAuthenticated(true);
      loadProducts();
      loadUsers();
    } else {
      alert('Code incorrect!');
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('categorie');

      if (!error && data) {
        setProducts(data);
      }
    } catch (err) {
      console.error('Erreur chargement produits:', err);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, solde_compte')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setUsers(data);
      }
    } catch (err) {
      console.error('Erreur chargement utilisateurs:', err);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('products')
        .insert([{
          id: uuidv4(),
          nom: newProduct.nom,
          description: newProduct.description,
          prix: parseFloat(newProduct.prix),
          categorie: newProduct.categorie,
          stock_quantity: parseInt(newProduct.stock_quantity),
          active: true,
        }]);

      if (error) throw error;

      setNewProduct({
        nom: '',
        description: '',
        prix: '',
        categorie: 'boisson',
        stock_quantity: '',
      });

      await loadProducts();
      alert('✅ Produit ajouté!');
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Êtes-vous sûr?')) return;

    try {
      await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      await loadProducts();
      alert('✅ Produit supprimé!');
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleToggleProduct = async (product: Product) => {
    try {
      await supabase
        .from('products')
        .update({ active: !product.active })
        .eq('id', product.id);

      await loadProducts();
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleUpdateUserSolde = async (userId: string, newSolde: string) => {
    try {
      await supabase
        .from('users')
        .update({ solde_compte: parseFloat(newSolde) })
        .eq('id', userId);

      await loadUsers();
      alert('✅ Solde mis à jour!');
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-8 text-red-600">🔐 Admin Panel</h1>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code d'accès
              </label>
              <input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="Entrer le code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              Accéder à l'admin
            </button>
          </form>

          <Link href="/dashboard" className="mt-6 text-center block text-blue-600 hover:underline">
            Retour au dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">⚙️ Admin Panel</h1>
          <Link href="/dashboard" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-bold">
            ← Dashboard
          </Link>
        </div>

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setTab('products')}
            className={`px-6 py-3 rounded-lg font-bold transition ${
              tab === 'products'
                ? 'bg-blue-600'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            📦 Produits ({products.length})
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-6 py-3 rounded-lg font-bold transition ${
              tab === 'users'
                ? 'bg-blue-600'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            👥 Utilisateurs ({users.length})
          </button>
        </div>

        {tab === 'products' && (
          <div className="space-y-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Ajouter un produit</h2>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={newProduct.nom}
                    onChange={(e) => setNewProduct({ ...newProduct, nom: e.target.value })}
                    placeholder="Nom du produit"
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <input
                    type="text"
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                    placeholder="Description"
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={newProduct.prix}
                    onChange={(e) => setNewProduct({ ...newProduct, prix: e.target.value })}
                    placeholder="Prix (€)"
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <input
                    type="number"
                    value={newProduct.stock_quantity}
                    onChange={(e) => setNewProduct({ ...newProduct, stock_quantity: e.target.value })}
                    placeholder="Stock"
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <select
                    value={newProduct.categorie}
                    onChange={(e) => setNewProduct({ ...newProduct, categorie: e.target.value })}
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="boisson">🥤 Boisson</option>
                    <option value="friandise">🍫 Friandise</option>
                    <option value="alcool">🍺 Alcool</option>
                    <option value="chips">🍟 Chips</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg font-bold disabled:opacity-50"
                >
                  {loading ? 'Ajout...' : '✅ Ajouter le produit'}
                </button>
              </form>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Produits ({products.length})</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {products.map(product => (
                  <div key={product.id} className="bg-gray-700 rounded-lg p-4 flex justify-between items-center">
                    <div className="flex-1">
                      <p className="font-bold text-lg">{product.nom}</p>
                      <p className="text-gray-400 text-sm">{product.categorie} • {product.prix.toFixed(2)}€ • Stock: {product.stock_quantity}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleProduct(product)}
                        className={`px-4 py-2 rounded-lg font-bold ${
                          product.active
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                      >
                        {product.active ? '✅ Actif' : '❌ Inactif'}
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Utilisateurs ({users.length})</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {users.map(user => (
                <div key={user.id} className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="font-bold text-lg">{user.username}</p>
                      <p className="text-gray-400 text-sm">{user.email}</p>
                    </div>
                    <p className="text-green-400 font-bold text-lg">{user.solde_compte.toFixed(2)}€</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={user.solde_compte}
                      placeholder="Nouveau solde"
                      id={`solde-${user.id}`}
                      className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded text-sm"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById(`solde-${user.id}`) as HTMLInputElement;
                        handleUpdateUserSolde(user.id, input.value);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-sm"
                    >
                      Mettre à jour
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}