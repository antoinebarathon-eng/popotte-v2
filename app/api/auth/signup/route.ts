import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const grade = String(body?.grade || '').trim();
    const nom = String(body?.nom || '').trim();
    const password = String(body?.password || '');

    if (!grade) {
      return NextResponse.json(
        { error: 'Le grade est obligatoire.' },
        { status: 400 }
      );
    }

    if (!nom) {
      return NextResponse.json(
        { error: 'Le nom est obligatoire.' },
        { status: 400 }
      );
    }

    if (!password || password.length < 4) {
      return NextResponse.json(
        {
          error:
            'Le mot de passe doit contenir au moins 4 caractères.',
        },
        { status: 400 }
      );
    }

    const { data: existingUser, error: existingError } =
      await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', nom)
        .maybeSingle();

    if (existingError) {
      console.error(existingError);

      return NextResponse.json(
        { error: 'Erreur lors de la vérification du compte.' },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'Ce nom est déjà utilisé.' },
        { status: 409 }
      );
    }

    const { data: user, error: insertError } =
      await supabaseAdmin
        .from('users')
        .insert({
          username: nom,
          nom: nom,
          grade: grade,
          password_hash: password,
          solde_compte: 0,
          is_admin: false,
        })
        .select(
          'id, username, nom, grade, email, solde_compte, is_admin'
        )
        .single();

    if (insertError) {
      console.error(insertError);

      return NextResponse.json(
        {
          error:
            insertError.message ||
            'Impossible de créer le compte.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        user,
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Erreur lors de la création du compte.',
      },
      { status: 500 }
    );
  }
}
