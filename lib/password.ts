import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/*
 * Hachage des mots de passe.
 *
 * Avant, la colonne password_hash contenait le mot de passe en clair et la
 * connexion le comparait avec ===. scrypt fait partie de Node, donc aucune
 * dépendance à installer et rien à compiler au déploiement.
 *
 * Format stocké : scrypt$<sel en hex>$<empreinte en hex>
 */

const PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);

  return `${PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Un mot de passe encore stocké en clair, hérité de l'ancienne version. */
export function isLegacyPlaintext(stored: string): boolean {
  return !stored.startsWith(`${PREFIX}$`);
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;

  if (isLegacyPlaintext(stored)) {
    // Comptes créés avant le hachage : on accepte la comparaison en clair
    // une dernière fois, l'appelant se charge de re-hacher juste après.
    const a = Buffer.from(password, 'utf8');
    const b = Buffer.from(stored, 'utf8');

    return a.length === b.length && timingSafeEqual(a, b);
  }

  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
