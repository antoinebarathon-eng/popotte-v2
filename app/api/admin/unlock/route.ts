import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  isAdminUnlocked,
  readSession,
  setSessionCookie,
  withAdminUnlock,
} from '@/lib/session';
import { clientKey, rateLimit, resetRateLimit } from '@/lib/rateLimit';

/*
 * Déverrouille le panneau d'administration.
 *
 * Le code n'existe plus côté navigateur : il est envoyé ici et comparé au
 * serveur. Sans POPOTTE_ADMIN_CODE dans l'environnement, la route refuse
 * tout le monde — il n'y a plus de valeur par défaut devinable.
 */

function codesMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const session = readSession(request);

  if (!session) {
    return NextResponse.json(
      { error: 'Connecte-toi avant d’accéder à l’administration.' },
      { status: 401 }
    );
  }

  const expected = process.env.POPOTTE_ADMIN_CODE;

  if (!expected) {
    console.error("POPOTTE_ADMIN_CODE n'est pas défini : administration inaccessible.");

    return NextResponse.json(
      { error: "L'administration n'est pas configurée sur ce serveur." },
      { status: 503 }
    );
  }

  const key = clientKey(request, 'admin-unlock');
  const limit = rateLimit(key, 5, 15 * 60);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessaie dans quelques minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const code = String(body?.code || '');

  if (!code || !codesMatch(code, expected)) {
    return NextResponse.json({ error: 'Code incorrect.' }, { status: 401 });
  }

  resetRateLimit(key);

  const response = NextResponse.json({ ok: true });

  return setSessionCookie(response, withAdminUnlock(session));
}

/** Permet à la page admin de savoir si elle est déjà déverrouillée. */
export async function GET(request: NextRequest) {
  const session = readSession(request);

  return NextResponse.json(
    { unlocked: isAdminUnlocked(session), connected: Boolean(session) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
