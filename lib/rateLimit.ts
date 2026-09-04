/*
 * Limiteur de tentatives, en mémoire.
 *
 * Volontairement simple : il freine les essais répétés sur le code admin et
 * sur la connexion. En mémoire signifie qu'il se remet à zéro à chaque
 * redémarrage et qu'il ne se partage pas entre plusieurs instances — pour
 * une popotte de brigade c'est suffisant, pour un service exposé il
 * faudrait le déporter (Redis, table Postgres).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return {
    allowed: true,
    remaining: limit - bucket.count,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Identifie l'appelant du mieux possible derrière un proxy. */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim() || 'inconnu';

  return `${scope}:${ip}`;
}
