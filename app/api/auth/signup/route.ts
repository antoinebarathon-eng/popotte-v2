import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { newSession, setSessionCookie } from '@/lib/session';
import { clientKey, rateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(clientKey(request, 'signup'), 10, 60 * 60);

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de créations de compte. Réessaie plus tard.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

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

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
        },
        { status: 400 }
      );
    }

    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', nom)
      .maybeSingle();

    if (existingError) {
      console.error('Vérification du compte:', existingError);

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

    const { data: user, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        username: nom,
        nom: nom,
        grade: grade,
        password_hash: await hashPassword(password),
        solde_compte: 0,
        is_admin: false,
      })
      .select('id, username, nom, grade, email, solde_compte, is_admin')
      .single();

    if (insertError) {
      console.error('Création du compte:', insertError);

      return NextResponse.json(
        { error: 'Impossible de créer le compte.' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ ok: true, user }, { status: 201 });

    return setSessionCookie(response, newSession(String(user.id)));
  } catch (error) {
    console.error('Création du compte:', error);

    return NextResponse.json(
      { error: 'Erreur lors de la création du compte.' },
      { status: 500 }
    );
  }
}
