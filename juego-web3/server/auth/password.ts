import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Hash de contrasenas con scrypt (incluido en Node). Formato:
 * scrypt$N$r$p$salBase64$hashBase64
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, fail) => {
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? fail(err) : ok(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash as string, 'base64');
  const key = await derive(
    password,
    Buffer.from(salt as string, 'base64'),
    Number(n),
    Number(r),
    Number(p),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Token de sesion opaco para el cliente; en la base de datos solo se guarda su hash. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
