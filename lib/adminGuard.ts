import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdminUnlocked, readSession, type SessionPayload } from '@/lib/session';

/*
 * Contrôle d'accès à l'administration.
 *
 * Avant, la seule barrière était un en-tête x-admin-code comparé à une
 * constante écrite en clair dans la page — donc envoyée à tous les
 * visiteurs — et dont la valeur par défaut côté serveur était "1664".
 *
 * Maintenant il faut deux choses : une session valide, et soit le drapeau
 * is_admin en base, soit le code d'accès saisi et vérifié côté serveur
 * dans les deux dernières heures.
 */

export type AdminContext = { session: SessionPayload };

export async function requireAdmin(
  request: NextRequest
): Promise<AdminContext | NextResponse> {
  const session = readSession(request);

  if (!session) {
    return NextResponse.json(
      { error: 'Session expirée. Reconnecte-toi.', reason: 'no_session' },
      { status: 401 }
    );
  }

  if (isAdminUnlocked(session)) {
    return { session };
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', session.uid)
    .maybeSingle();

  if (error) {
    console.error('Vérification admin:', error);

    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  if (user?.is_admin) {
    return { session };
  }

  return NextResponse.json(
    { error: "Code d'accès requis.", reason: 'code_required' },
    { status: 403 }
  );
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
