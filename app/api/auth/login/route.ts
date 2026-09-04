import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      return NextResponse.json(
        {
          error: 'Nom et mot de passe obligatoires.',
        },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(
        'id, username, nom, grade, email, password_hash, solde_compte, is_admin'
      )
      .eq('username', username)
      .maybeSingle();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          error: 'Erreur lors de la connexion.',
        },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          error: 'Utilisateur non trouvé.',
        },
        { status: 401 }
      );
    }

    if (user.password_hash !== password) {
      return NextResponse.json(
        {
          error: 'Mot de passe incorrect.',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,

      user: {
        id: user.id,
        username: user.username,
        nom: user.nom,
        grade: user.grade,
        email: user.email,
        solde_compte: user.solde_compte ?? 0,
        is_admin: user.is_admin ?? false,
      },
    });

  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Erreur de connexion.',
      },
      { status: 500 }
    );
  }
}
