import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, isLegacyPlaintext, verifyPassword } from '@/lib/password';
import { newSession, setSessionCookie } from '@/lib/session';
import { clientKey, rateLimit, resetRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const key = clientKey(request, 'login');
    const limit = rateLimit(key, 20, 15 * 60);

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessaie dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    const body = await request.json();

    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Nom et mot de passe obligatoires.' },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, nom, grade, email, password_hash, solde_compte, is_admin')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      console.error('Connexion:', error);

      return NextResponse.json(
        { error: 'Erreur lors de la connexion.' },
        { status: 500 }
      );
    }

    // Un seul message pour "compte inconnu" et "mot de passe faux" :
    // deux messages différents permettaient de deviner quels comptes existent.
    const passwordOk = user
      ? await verifyPassword(password, user.password_hash)
      : false;

    if (!user || !passwordOk) {
      return NextResponse.json(
        { error: 'Nom ou mot de passe incorrect.' },
        { status: 401 }
      );
    }

    // Compte créé avant le hachage : on le convertit maintenant, en silence.
    if (isLegacyPlaintext(user.password_hash || '')) {
      const { error: upgradeError } = await supabaseAdmin
        .from('users')
        .update({ password_hash: await hashPassword(password) })
        .eq('id', user.id);

      if (upgradeError) {
        console.warn('Passage du mot de passe au hachage impossible:', upgradeError);
      }
    }

    resetRateLimit(key);

    const response = NextResponse.json({
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

    // L'identité vit désormais dans un cookie signé, illisible et non
    // modifiable depuis le navigateur.
    return setSessionCookie(response, newSession(String(user.id)));
  } catch (error) {
    console.error('Connexion:', error);

    return NextResponse.json(
      { error: 'Erreur de connexion.' },
      { status: 500 }
    );
  }
}
