'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

type CartItem = {
  id: string;
  product_id: string;
  quantite: number;
  product: {
    nom: string;
    prix: number;
    categorie: string;
  };
};

export default function CartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [solde, setSolde] = useState(0);
  const [loading, setLoading] = useState(true);
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      const userId = localStorage.getItem('user_id');
      const storedSolde = localStorage.getItem('solde_compte');

      if (!userId) {
        router.push('/auth/login');
        return;
      }

      setSolde(parseFloat(storedSolde || '0'));
      await loadCart();
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const loadCart = async () => {
    const userId = localStorage.getItem('user_id');
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('*, product:products(*)')
        .eq('user_id', userId);

      if (!error && data) {
        setCartItems(data);
        
        const total = data.reduce((sum, item) => {
          return sum + (item.product.prix * item.quantite);
        }, 0);
        setTotalPrice(total);
      }
    } catch (err) {
      console.error('Erreur chargement panier:', err);
    }
  };

  const handleRemoveItem = async (cartItemId: string) => {
    try {
      await supabase
        .from('cart_items')
        .delete()
        .eq('id', cartItemId);

      await loadCart();
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  };

  const handleUpdateQuantity = async (cartItemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      await handleRemoveItem(cartItemId);
      return;
    }

    try {
      await supabase
        .from('cart_items')
        .update({ quantite: newQuantity })
        .eq('id', cartItemId);

      await loadCart();
    } catch (err) {
      console.error('Erreur mise à jour:', err);
    }
  };

  const handleCheckout = async () => {
    const userId = localStorage.getItem('user_id');
    if (!userId || totalPrice > solde) {
      alert('Solde insuffisant!');
      return;
    }

    try {
      await supabase
        .from('transactions')
        .insert([{
          user_id: userId,
          montant: totalPrice,
          type_paiement: 'compte_interne',
          status: 'payé',
        }])
        .select()
        .single();

      const newSolde = solde - totalPrice;
      await supabase
        .from('users')
        .update({ solde_compte: newSolde })
        .eq('id', userId);

      await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId);

      localStorage.setItem('solde_compte', newSolde.toString());

      alert('✅ Paiement réussi!');
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Erreur paiement:', err);
      alert('Erreur lors du paiement');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <div className="text-xl">Chargement...</div>
      </div>
    );
  }

  const categoryEmojis: { [key: string]: string } = {
    boisson: '🥤',
    friandise: '🍫',
    alcool: '🍺',
    chips: '🍟',
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-blue-400 hover:text-blue-300 mb-6 inline-block">
          ← Retour au catalogue
        </Link>

        <h1 className="text-4xl font-bold mb-8">🛒 Mon Panier</h1>

        {cartItems.length === 0 ? (
          <div className="bg-zinc-800 rounded-lg p-8 text-center">
            <p className="text-xl text-gray-400 mb-4">Votre panier est vide</p>
            <Link href="/dashboard" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-bold inline-block">
              Continuer les achats
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-8">
              {cartItems.map(item => (
                <div key={item.id} className="bg-zinc-800 rounded-lg p-4 flex justify-between items-center">
                  <div className="flex-1">
                    <p className="font-bold text-lg">
                      {categoryEmojis[item.product.categorie]} {item.product.nom}
                    </p>
                    <p className="text-gray-400">{item.product.prix.toFixed(2)}€ x {item.quantite}</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-zinc-700 rounded-lg p-2">
                      <button onClick={() => handleUpdateQuantity(item.id, item.quantite - 1)} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded">-</button>
                      <span className="px-4">{item.quantite}</span>
                      <button onClick={() => handleUpdateQuantity(item.id, item.quantite + 1)} className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded">+</button>
                    </div>
                    
                    <p className="font-bold text-green-400 min-w-24 text-right">{(item.product.prix * item.quantite).toFixed(2)}€</p>
                    
                    <button onClick={() => handleRemoveItem(item.id)} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold">🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-800 rounded-lg p-6 space-y-4 mb-8">
              <div className="flex justify-between text-lg">
                <span>Sous-total</span>
                <span className="font-bold">{totalPrice.toFixed(2)}€</span>
              </div>
              
              <div className="border-t border-zinc-700 pt-4 flex justify-between text-xl">
                <span>Total</span>
                <span className="font-bold text-green-400">{totalPrice.toFixed(2)}€</span>
              </div>

              <div className="border-t border-zinc-700 pt-4">
                <p className="text-gray-400 text-sm mb-2">Solde compte: <span className="text-green-400 font-bold">{solde.toFixed(2)}€</span></p>
                {solde < totalPrice && (
                  <p className="text-red-400 font-bold">⚠️ Solde insuffisant!</p>
                )}
              </div>
            </div>

            <button onClick={handleCheckout} disabled={solde < totalPrice} className={w-full py-3 rounded-lg font-bold text-lg transition \}>
              💳 Valider la commande
            </button>
          </>
        )}
      </div>
    </main>
  );
}
