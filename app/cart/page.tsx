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