import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type User = {
  id: string;
  username: string;
  email: string;
  solde_compte: number;
  is_admin: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  nom: string;
  description: string;
  prix: number;
  categorie: 'boisson' | 'friandise' | 'alcool' | 'chips';
  image_url?: string;
  stock_quantity: number;
  active: boolean;
  created_at: string;
};

export type CartItem = {
  id: string;
  user_id: string;
  product_id: string;
  quantite: number;
  product: Product;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  montant: number;
  type_paiement: 'lydia' | 'compte_interne';
  status: 'payé' | 'en attente';
  created_at: string;
};