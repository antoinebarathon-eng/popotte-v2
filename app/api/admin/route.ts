import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminCode = process.env.POPOTTE_ADMIN_CODE || '1664';

function getAdminClient() {
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

function checkAdmin(request: NextRequest) {
  return request.headers.get('x-admin-code') === adminCode;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json(
      { error: 'Accès administrateur refusé.' },
      { status: 401 }
    );
  }

  try {
    const supabase = getAdminClient();

    const [
      { data: products, error: productsError },
      { data: users, error: usersError },
      { data: orders, error: ordersError },
      { data: orderItems, error: orderItemsError },
      { data: transactions, error: transactionsError },
    ] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .order('categorie')
        .order('nom'),

      supabase
        .from('users')
        .select('id, username, email, solde_compte, created_at')
        .order('created_at', { ascending: false }),

      supabase
        .from('orders')
        .select('id, user_id, montant, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500),

      supabase
        .from('order_items')
        .select(
          'id, order_id, product_id, nom_produit, prix_unitaire, quantite, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(2000),

      supabase
        .from('transactions')
        .select('id, user_id, montant, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (productsError) throw productsError;
    if (usersError) throw usersError;
    if (ordersError) throw ordersError;
    if (orderItemsError) throw orderItemsError;
    if (transactionsError) throw transactionsError;

    const detteActuelle = (users || []).reduce((sum, user) => {
      const solde = Number(user.solde_compte || 0);
      return sum + Math.max(-solde, 0);
    }, 0);

    const ventes = (orders || [])
      .filter((order) => order.status !== 'annulee')
      .reduce((sum, order) => sum + Number(order.montant || 0), 0);

    return NextResponse.json(
      {
        products: products || [],
        users: users || [],
        orders: orders || [],
        orderItems: orderItems || [],
        transactions: transactions || [],
        stats: {
          ventes: Number(ventes.toFixed(2)),
          dettes: Number(detteActuelle.toFixed(2)),
          commandes: (orders || []).filter(
            (order) => order.status !== 'annulee'
          ).length,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: any) {
    console.error('Admin GET:', error);

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json(
      { error: 'Accès administrateur refusé.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const action = body?.action;
    const supabase = getAdminClient();

    if (action === 'settle_debt') {
      const id = String(body.id || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID utilisateur manquant.' },
          { status: 400 }
        );
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, username, solde_compte')
        .eq('id', id)
        .single();

      if (userError) throw userError;

      const ancienSolde = Number(user.solde_compte || 0);
      const dette = Math.max(-ancienSolde, 0);

      if (dette <= 0) {
        return NextResponse.json({
          ok: true,
          username: user.username,
          dette: 0,
          nouveauSolde: ancienSolde,
          message: 'Aucune dette à régler.',
        });
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ solde_compte: 0 })
        .eq('id', id);

      if (updateError) throw updateError;

      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: id,
          montant: dette,
          status: 'dette_reglee',
        });

      if (transactionError) {
        console.warn(
          'Historique règlement dette non enregistré:',
          transactionError
        );
      }

      return NextResponse.json({
        ok: true,
        username: user.username,
        dette,
        ancienSolde,
        nouveauSolde: 0,
      });
    }

    if (action === 'add_product') {
      const nom = String(body.nom || '').trim();
      const description = String(body.description || '').trim();
      const prix = Number(body.prix);
      const categorie = String(body.categorie || 'boisson').trim();
      const stock_quantity = Number(body.stock_quantity);

      if (!nom) {
        return NextResponse.json(
          { error: 'Le nom du produit est obligatoire.' },
          { status: 400 }
        );
      }

      if (!Number.isFinite(prix) || prix < 0) {
        return NextResponse.json(
          { error: 'Prix invalide.' },
          { status: 400 }
        );
      }

      if (!Number.isInteger(stock_quantity) || stock_quantity < 0) {
        return NextResponse.json(
          { error: 'Stock invalide.' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('products')
        .insert({
          nom,
          description,
          prix,
          categorie,
          stock_quantity,
          active: true,
        })
        .select('*')
        .single();

      if (error) throw error;

      return NextResponse.json({ ok: true, product: data });
    }

    if (action === 'delete_product') {
      const id = String(body.id || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID produit manquant.' },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    if (action === 'toggle_product') {
      const id = String(body.id || '').trim();
      const active = Boolean(body.active);

      if (!id) {
        return NextResponse.json(
          { error: 'ID produit manquant.' },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from('products')
        .update({ active })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true, active });
    }

    if (action === 'update_user_balance') {
      const id = String(body.id || '').trim();
      const solde = Number(body.solde);

      if (!id) {
        return NextResponse.json(
          { error: 'ID utilisateur manquant.' },
          { status: 400 }
        );
      }

      if (!Number.isFinite(solde)) {
        return NextResponse.json(
          { error: 'Solde invalide.' },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from('users')
        .update({ solde_compte: solde })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true, solde });
    }

    if (action === 'recharge_user') {
      const id = String(body.id || '').trim();
      const montant = Number(body.montant);

      if (!id) {
        return NextResponse.json(
          { error: 'ID utilisateur manquant.' },
          { status: 400 }
        );
      }

      if (!Number.isFinite(montant) || montant <= 0) {
        return NextResponse.json(
          { error: 'Le montant doit être supérieur à 0 €.' },
          { status: 400 }
        );
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, username, solde_compte')
        .eq('id', id)
        .single();

      if (userError) throw userError;

      const ancienSolde = Number(user.solde_compte || 0);
      const nouveauSolde = Number((ancienSolde + montant).toFixed(2));

      const { error } = await supabase
        .from('users')
        .update({ solde_compte: nouveauSolde })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        username: user.username,
        ancienSolde,
        montant,
        nouveauSolde,
      });
    }

    /*
     * SUPPRESSION D'UN COMPTE
     *
     * IMPORTANT :
     * Pour garder le nom original dans un onglet "Utilisateurs supprimés"
     * sans casser l'historique, la base doit disposer d'une table
     * "deleted_users". Cette action l'utilise si elle existe.
     */
    if (action === 'delete_user') {
      const id = String(body.id || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID utilisateur manquant.' },
          { status: 400 }
        );
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, username, email, solde_compte, created_at')
        .eq('id', id)
        .single();

      if (userError || !user) {
        return NextResponse.json(
          { error: 'Utilisateur introuvable.' },
          { status: 404 }
        );
      }

      const { error: archiveError } = await supabase
        .from('deleted_users')
        .insert({
          original_user_id: user.id,
          username: user.username,
          email: user.email,
          solde_compte: user.solde_compte,
          created_at: user.created_at,
          deleted_at: new Date().toISOString(),
        });

      if (archiveError) {
        console.error('Archivage utilisateur supprimé:', archiveError);

        return NextResponse.json(
          {
            error:
              'La table deleted_users n’existe pas encore dans Supabase. Ne supprime rien pour éviter de perdre le nom et l’historique.',
          },
          { status: 500 }
        );
      }

      // On retire le compte de la liste des utilisateurs actifs.
      // Si une contrainte FK empêche la suppression, l'API renvoie
      // l'erreur au lieu de supprimer l'historique.
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (deleteError) {
        // On tente de retirer l'archive créée juste avant afin
        // d'éviter un doublon si la suppression échoue.
        await supabase
          .from('deleted_users')
          .delete()
          .eq('original_user_id', id);

        throw deleteError;
      }

      const { error: authError } =
        await supabase.auth.admin.deleteUser(id);

      if (authError) {
        console.warn(
          'Compte Auth non supprimé après suppression users:',
          authError
        );
      }

      return NextResponse.json({
        ok: true,
        username: user.username,
        message: 'Compte archivé puis supprimé.',
      });
    }

    return NextResponse.json(
      { error: 'Action inconnue.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Admin POST:', error);

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur.' },
      { status: 500 }
    );
  }
}