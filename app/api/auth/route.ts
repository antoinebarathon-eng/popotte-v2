import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminCode = process.env.POPOTTE_ADMIN_CODE || '1664';

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function checkAdmin(request: NextRequest) {
  const code = request.headers.get('x-admin-code');
  return code === adminCode;
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

    const [{ data: products, error: productsError }, { data: users, error: usersError }] =
      await Promise.all([
        supabase
          .from('products')
          .select('*')
          .order('categorie')
          .order('nom'),
        supabase
          .from('users')
          .select('id, username, email, solde_compte, created_at')
          .order('created_at', { ascending: false }),
      ]);

    if (productsError) throw productsError;
    if (usersError) throw usersError;

    return NextResponse.json({
      products: products || [],
      users: users || [],
    });
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

    if (action === 'add_product') {
      const nom = String(body.nom || '').trim();
      const description = String(body.description || '').trim();
      const prix = Number(body.prix);
      const categorie = String(body.categorie || 'boisson');
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

      return NextResponse.json({ product: data });
    }

    if (action === 'delete_product') {
      const id = String(body.id || '');

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    if (action === 'toggle_product') {
      const id = String(body.id || '');
      const active = Boolean(body.active);

      const { error } = await supabase
        .from('products')
        .update({ active })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    if (action === 'update_user_balance') {
      const id = String(body.id || '');
      const solde = Number(body.solde);

      if (!Number.isFinite(solde) || solde < 0) {
        return NextResponse.json(
          { error: 'Le solde doit être un nombre positif.' },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from('users')
        .update({ solde_compte: solde })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    if (action === 'recharge_user') {
      const id = String(body.id || '');
      const montant = Number(body.montant);

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

      const nouveauSolde =
        Number(user.solde_compte || 0) + montant;

      const { error } = await supabase
        .from('users')
        .update({ solde_compte: nouveauSolde })
        .eq('id', id);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        username: user.username,
        nouveauSolde,
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