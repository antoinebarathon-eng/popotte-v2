import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isNextResponse, requireAdmin } from '@/lib/adminGuard';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (isNextResponse(guard)) return guard;

  try {
    const [
      { data: products, error: productsError },
      { data: categories, error: categoriesError },
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

      supabaseAdmin.from('categories').select('*').order('nom'),

      supabaseAdmin
        .from('users')
        .select('id, username, email, solde_compte, is_admin, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),

      // Les comptes supprimés restent dans la table users, marqués par
      // deleted_at : les supprimer pour de bon échouait dès que la personne
      // avait passé une commande, et aurait effacé l'historique des ventes.
      supabaseAdmin
        .from('users')
        .select('id, username, email, solde_compte, created_at, deleted_at')
        .not('deleted_at', 'is', null)
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
      // La colonne deleted_at n'existe pas si la migration 0002 n'est pas passée.
      console.warn('Lecture des comptes supprimés impossible:', deletedUsersError);
    }

    if (categoriesError) {
      // La table categories n'existe pas si la migration 0003 n'est pas passée.
      console.warn('Lecture des catégories impossible:', categoriesError);
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
        categories: categories || [],
        users: users || [],
        deletedUsers: (deletedUsers || []).map((user) => ({
          ...user,
          original_user_id: user.id,
        })),
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

    if (action === 'add_category') {
      const nom = String(body.nom || '').trim();

      if (!nom) {
        return NextResponse.json(
          { error: 'Le nom de la catégorie est obligatoire.' },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('categories')
        .insert({ nom })
        .select('*')
        .single();

      if (error) {
        // Contrainte unique sur nom.
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Cette catégorie existe déjà.' },
            { status: 400 }
          );
        }

        throw error;
      }

      return NextResponse.json({ ok: true, category: data });
    }

    /*
     * Renommer une catégorie renomme aussi la catégorie de tous les
     * produits qui la portaient : sinon la fiche produit et la liste des
     * catégories auraient deux noms différents pour la même chose.
     */
    if (action === 'rename_category') {
      const id = String(body.id || '').trim();
      const nom = String(body.nom || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID catégorie manquant.' },
          { status: 400 }
        );
      }

      if (!nom) {
        return NextResponse.json(
          { error: 'Le nom de la catégorie est obligatoire.' },
          { status: 400 }
        );
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from('categories')
        .select('id, nom')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existing) {
        return NextResponse.json(
          { error: 'Catégorie introuvable.' },
          { status: 404 }
        );
      }

      if (existing.nom === nom) {
        return NextResponse.json({ ok: true, category: existing });
      }

      const { data: renamed, error: renameError } = await supabaseAdmin
        .from('categories')
        .update({ nom })
        .eq('id', id)
        .select('*')
        .single();

      if (renameError) {
        if (renameError.code === '23505') {
          return NextResponse.json(
            { error: 'Cette catégorie existe déjà.' },
            { status: 400 }
          );
        }

        throw renameError;
      }

      const { error: productsUpdateError } = await supabaseAdmin
        .from('products')
        .update({ categorie: nom })
        .eq('categorie', existing.nom);

      if (productsUpdateError) throw productsUpdateError;

      return NextResponse.json({ ok: true, category: renamed });
    }

    /*
     * Suppression d'une catégorie. Refusée tant qu'un produit l'utilise
     * encore, pour ne pas laisser des produits avec une catégorie qui
     * n'existe plus dans la liste (elle resterait affichée sur la fiche
     * produit, mais introuvable dans le formulaire d'ajout).
     */
    if (action === 'delete_category') {
      const id = String(body.id || '').trim();

      if (!id) {
        return NextResponse.json(
          { error: 'ID catégorie manquant.' },
          { status: 400 }
        );
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from('categories')
        .select('id, nom')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existing) {
        return NextResponse.json(
          { error: 'Catégorie introuvable.' },
          { status: 404 }
        );
      }

      const { count, error: countError } = await supabaseAdmin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('categorie', existing.nom);

      if (countError) throw countError;

      if ((count || 0) > 0) {
        return NextResponse.json(
          {
            error: `${count} produit${count && count > 1 ? 's' : ''} ${
              count && count > 1 ? 'utilisent' : 'utilise'
            } encore « ${existing.nom} ». Change leur catégorie avant de la supprimer.`,
          },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true });
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

      if (error) {
        // Un produit déjà commandé est référencé par order_items : le
        // supprimer casserait l'historique des commandes (erreur 23503,
        // violation de clé étrangère). On le désactive à la place, comme
        // pour un compte utilisateur déjà utilisé.
        if (error.code === '23503') {
          const { error: deactivateError } = await supabaseAdmin
            .from('products')
            .update({ active: false })
            .eq('id', id);

          if (deactivateError) throw deactivateError;

          return NextResponse.json({ ok: true, deactivated: true });
        }

        throw error;
      }

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
     * La ligne est conservée et marquée supprimée, pas effacée. Effacer
     * échouait dès que la personne avait passé une commande (orders et
     * transactions pointent vers elle) et aurait fait disparaître son nom
     * de l'historique des ventes.
     *
     * Un compte en dette ne peut pas être supprimé : l'argent dû
     * disparaîtrait des totaux sans que personne ne l'ait réglé.
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
        .select('id, username, solde_compte, deleted_at')
        .eq('id', id)
        .maybeSingle();

      if (userError) throw userError;

      if (!user) {
        return NextResponse.json(
          { error: 'Utilisateur introuvable.' },
          { status: 404 }
        );
      }

      if (user.deleted_at) {
        return NextResponse.json(
          { error: 'Ce compte est déjà supprimé.' },
          { status: 400 }
        );
      }

      const dette = Math.max(-Number(user.solde_compte || 0), 0);

      if (dette > 0) {
        return NextResponse.json(
          {
            error: `${user.username} doit encore ${dette.toFixed(2)} €. Règle la dette avant de supprimer le compte.`,
          },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ deleted_at: new Date().toISOString(), is_admin: false })
        .eq('id', id);

      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        username: user.username,
        message: 'Compte supprimé. Son historique de commandes est conservé.',
      });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (error) {
    console.error('Admin POST:', error);

    // Le message brut de Postgres peut révéler la structure de la base.
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
