import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variables Supabase serveur manquantes.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = String(body.user_id || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur manquant.' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'Panier vide.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // On récupère l'utilisateur et son solde actuel.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, solde_compte')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // On relit les produits depuis Supabase pour ne jamais faire confiance
    // au prix envoyé par le navigateur.
    const productIds = items.map((item: any) => String(item.product_id || '')).filter(Boolean);

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, nom, prix, stock_quantity, active')
      .in('id', productIds);

    if (productsError) throw productsError;

    const productMap = new Map((products || []).map((product) => [product.id, product]));

    let total = 0;
    const finalItems: Array<{
      product_id: string;
      nom_produit: string;
      prix_unitaire: number;
      quantite: number;
    }> = [];

    for (const rawItem of items) {
      const productId = String(rawItem.product_id || '');
      const quantity = Number(rawItem.quantite);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json({ error: 'Quantité invalide.' }, { status: 400 });
      }

      const product = productMap.get(productId);

      if (!product) {
        return NextResponse.json({ error: 'Produit introuvable.' }, { status: 400 });
      }

      if (!product.active) {
        return NextResponse.json(
          { error: `Le produit "${product.nom}" n'est plus disponible.` },
          { status: 400 }
        );
      }

      if (product.stock_quantity < quantity) {
        return NextResponse.json(
          { error: `Stock insuffisant pour "${product.nom}".` },
          { status: 400 }
        );
      }

      const prix = Number(product.prix);
      total += prix * quantity;

      finalItems.push({
        product_id: product.id,
        nom_produit: product.nom,
        prix_unitaire: prix,
        quantite: quantity,
      });
    }

    total = Number(total.toFixed(2));

    const ancienSolde = Number(user.solde_compte || 0);

    // Partie réellement couverte par l'argent disponible.
    const montantPaye = Number(Math.min(Math.max(ancienSolde, 0), total).toFixed(2));

    // Partie réellement impayée.
    // Si le compte est déjà négatif, toute la nouvelle commande devient une dette.
    const montantDette = Number(Math.max(total - montantPaye, 0).toFixed(2));

    // Le solde conserve le comportement voulu :
    // un utilisateur peut passer sous 0 €.
    const nouveauSolde = Number((ancienSolde - total).toFixed(2));

    // Création de la commande immédiatement : aucune validation admin.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        montant: total,
        status: 'en_attente',
      })
      .select('id, user_id, montant, status, created_at')
      .single();

    if (orderError) throw orderError;

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(
        finalItems.map((item) => ({
          order_id: order.id,
          product_id: item.product_id,
          nom_produit: item.nom_produit,
          prix_unitaire: item.prix_unitaire,
          quantite: item.quantite,
        }))
      );

    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id);
      throw itemsError;
    }

    // Mise à jour des stocks.
    for (const item of finalItems) {
      const product = productMap.get(item.product_id)!;
      const newStock = product.stock_quantity - item.quantite;

      const { error: stockError } = await supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', item.product_id);

      if (stockError) throw stockError;
    }

    // Mise à jour du compte utilisateur.
    const { error: balanceError } = await supabase
      .from('users')
      .update({ solde_compte: nouveauSolde })
      .eq('id', userId);

    if (balanceError) throw balanceError;

    // IMPORTANT :
    // On enregistre uniquement la partie réellement impayée.
    // Une commande de 2 € avec 1 € de solde => dette = 1 €, pas 2 €.
    if (montantDette > 0) {
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
      montant: montantDette,
      status: 'dette',
      type_paiement: 'compte_interne',
        });

      if (transactionError) throw transactionError;
    }

    return NextResponse.json({
      ok: true,
      order,
      total,
      montantPaye,
      montantDette,
      ancienSolde,
      nouveauSolde,
    });
  } catch (error: any) {
    console.error('Erreur création commande:', error);

    return NextResponse.json(
      { error: error?.message || 'Erreur lors de la commande.' },
      { status: 500 }
    );
  }
}

