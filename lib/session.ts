import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

/*
 * Session signée, stockée dans un cookie httpOnly.
 *
 * Avant, l'identité de l'utilisateur tenait dans le localStorage du
 * navigateur : n'importe qui pouvait y écrire l'identifiant d'un autre
 * compte et commander à sa place. Le cookie ci-dessous est signé côté
 * serveur, illisible et non modifiable depuis le navigateur.
 */

export const SESSION_COOKIE = 'popotte_session';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
const ADMIN_MAX_AGE = 60 * 60 * 2; // 2 heures

export type SessionPayload = {
  /** Identifiant de l'utilisateur connecté. */
  uid: string;
  /** Date (secondes epoch) jusqu'à laquelle le panneau admin est déverrouillé. */
  adminUntil?: number;
  /** Expiration de la session elle-même. */
  exp: number;
};

function getSecret(): Buffer {
  const secret = process.env.POPOTTE_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "POPOTTE_SESSION_SECRET est manquant ou trop court (32 caractères minimum). Génère-le avec : node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  return Buffer.from(secret, 'utf8');
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function sign(data: string): string {
  return base64url(createHmac('sha256', getSecret()).update(data).digest());
}

export function signSession(payload: SessionPayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(body);

  // Comparaison à durée constante : une comparaison classique laisse
  // deviner la signature caractère par caractère.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;

  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload?.uid !== 'string' || !payload.uid) return null;
  if (typeof payload?.exp !== 'number' || payload.exp < nowInSeconds()) return null;

  return payload;
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function newSession(userId: string): SessionPayload {
  return { uid: userId, exp: nowInSeconds() + SESSION_MAX_AGE };
}

export function withAdminUnlock(payload: SessionPayload): SessionPayload {
  return { ...payload, adminUntil: nowInSeconds() + ADMIN_MAX_AGE };
}

export function isAdminUnlocked(payload: SessionPayload | null): boolean {
  return Boolean(payload?.adminUntil && payload.adminUntil > nowInSeconds());
}

/** Lit et vérifie la session portée par la requête. */
export function readSession(request: NextRequest): SessionPayload | null {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(
  response: NextResponse,
  payload: SessionPayload
): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: signSession(payload),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.max(payload.exp - nowInSeconds(), 0),
  });

  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}

/** Utilisé une seule fois, pour aider à générer un secret en développement. */
export function suggestSecret(): string {
  return randomBytes(32).toString('hex');
}
