import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isNextResponse, requireAdmin } from '@/lib/adminGuard';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (isNextResponse(guard)) return guard;

  try {
    const [
      { data: products, error: productsError },
      { data: users, error: usersError },
      { data: deletedUsers, error: deletedUsersError },
      { data: orders, error: ordersError },
      { data: orderItems, error: orderItemsError },
      { data: transactions, error: transactionsError },
      { data: allOrderTotals, error: allOrderTotalsError },
    ] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('*')
        .order('categorie')
        .order('nom'),

      supabaseAdmin
        .from('users')
        .select('id, username, email, solde_compte, is_admin, created_at')
        .order('created_at', { ascending: false }),

      // L'onglet « Utilisateurs supprimés » restait vide : l'API n'a jamais
      // renvoyé cette table, alors que la suppression y archive bien le compte.
      supabaseAdmin
        .from('deleted_users')
        .select('id, original_user_id, username, email, solde_compte, created_at, deleted_at')
        .order('deleted_at', { ascending: false }),

      supabaseAdmin
        .from('orders')
        .select('id, user_id, montant, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500),

      supabaseAdmin
        .from('order_items')
        .select('id, order_id, product_id, nom_produit, prix_unitaire, quantite, created_at')
        .order('created_at', { ascending: false })
        .limit(2000),

      supabaseAdmin
        .from('transactions')
        .select('id, user_id, montant, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),

      // Les listes ci-dessus sont tronquées pour l'affichage. Les totaux,
      // eux, doivent porter sur tout l'historique : la page additionnait
      // les 500 dernières commandes et présentait ça comme le chiffre
      // d'affaires global.
      supabaseAdmin.from('orders').select('montant, status'),
    ]);

    if (productsError) throw productsError;
    if (usersError) throw usersError;
    if (ordersError) throw ordersError;
    if (orderItemsError) throw orderItemsError;
    if (transactionsError) throw transactionsError;
    if (allOrderTotalsError) throw allOrderTotalsError;

    if (deletedUsersError) {
      // La table peut ne pas exister si la migration n'a pas été passée.
      console.warn('Lecture de deleted_users impossible:', deletedUsersError);
    }

    const dettes = (users || []).reduce((sum, user) => {
      const solde = Number(user.solde_compte || 0);
      return sum + Math.max(-solde, 0);
    }, 0);

    const facturables = (allOrderTotals || []).filter(
      (order) => order.status !== 'annulee'
    );

    const ventes = facturables.reduce(
      (sum, order) => sum + Number(order.montant || 0),
      0
    );

    return NextResponse.json(
      {
        products: products || [],
        users: users || [],
        deletedUsers: deletedUsers || [],
        orders: orders || [],
        orderItems: orderItems || [],
        transactions: transactions || [],
        stats: {
          ventes: Number(ventes.toFixed(2)),
          dettes: Number(dettes.toFixed(2)),
          commandes: facturables.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Admin GET:', error);

    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (isNextResponse(guard)) return guard;

  try {
    const body = await request.json();
    const action = body?.action;

    if (action === 'settle_debt') {
      const id = String(body.id || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID utilisateur manquant.' },
          { status: 400 }
        );
      }

      const { data: user, error: userError } = await supabaseAdmin
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

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ solde_compte: 0 })
        .eq('id', id);

      if (updateError) throw updateError;

      const { error: transactionError } = await supabaseAdmin
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
        return NextResponse.json({ error: 'Prix invalide.' }, { status: 400 });
      }

      if (!Number.isInteger(stock_quantity) || stock_quantity < 0) {
        return NextResponse.json({ error: 'Stock invalide.' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
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

      const { error } = await supabaseAdmin
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

      const { error } = await supabaseAdmin
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
        return NextResponse.json({ error: 'Solde invalide.' }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from('users')
        .update({ solde_compte: Number(solde.toFixed(2)) })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true, solde: Number(solde.toFixed(2)) });
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

      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, username, solde_compte')
        .eq('id', id)
        .single();

      if (userError) throw userError;

      const ancienSolde = Number(user.solde_compte || 0);
      const nouveauSolde = Number((ancienSolde + montant).toFixed(2));

      const { error } = await supabaseAdmin
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
     * Suppression d'un compte.
     *
     * Le compte est d'abord archivé dans deleted_users pour garder le nom
     * dans l'historique des commandes, puis retiré de la liste active.
     */
    if (action === 'delete_user') {
      const id = String(body.id || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID utilisateur manquant.' },
          { status: 400 }
        );
      }

      const { data: user, error: userError } = await supabaseAdmin
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

      const { error: archiveError } = await supabaseAdmin
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
              "La table deleted_users n'existe pas encore. Passe la migration supabase/migrations/0001_popotte_hardening.sql avant de supprimer un compte.",
          },
          { status: 500 }
        );
      }

      const { error: deleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', id);

      if (deleteError) {
        // On retire l'archive créée juste avant pour éviter un doublon.
        await supabaseAdmin
          .from('deleted_users')
          .delete()
          .eq('original_user_id', id);

        throw deleteError;
      }

      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

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

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (error) {
    console.error('Admin POST:', error);

    // Le message brut de Postgres peut révéler la structure de la base.
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
