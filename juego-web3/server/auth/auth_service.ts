import type { Store } from '../db/store.ts';
import { hashPassword, hashToken, newToken, verifyPassword } from './password.ts';

export const SESSION_DAYS = 7;
const USER_RE = /^[a-z0-9_]{3,20}$/;

export type AuthError = 'usuario_invalido' | 'clave_invalida' | 'usuario_en_uso' | 'credenciales';

/** Hash fijo para igualar el tiempo de respuesta cuando el usuario no existe. */
let dummyHash: Promise<string> | null = null;

/** Registro, inicio y cierre de sesion. Sin estado propio: todo va al Store. */
export class AuthService {
  constructor(private readonly store: Store) {}

  static validUsername(u: string): boolean {
    return USER_RE.test(u);
  }

  static validPassword(p: string): boolean {
    return p.length >= 8 && p.length <= 72;
  }

  async register(
    username: string,
    password: string,
  ): Promise<{ token: string } | { error: AuthError }> {
    const u = username.trim().toLowerCase();
    if (!AuthService.validUsername(u)) return { error: 'usuario_invalido' };
    if (!AuthService.validPassword(password)) return { error: 'clave_invalida' };
    const acc = await this.store.createAccount(u, await hashPassword(password));
    if (acc === 'taken') return { error: 'usuario_en_uso' };
    return { token: await this.openSession(acc.id) };
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ token: string } | { error: AuthError }> {
    const u = username.trim().toLowerCase();
    const acc = AuthService.validUsername(u) ? await this.store.findAccount(u) : null;
    if (!acc) {
      dummyHash ??= hashPassword('contrasena-de-relleno');
      await verifyPassword(password, await dummyHash);
      return { error: 'credenciales' };
    }
    if (!(await verifyPassword(password, acc.passwordHash))) return { error: 'credenciales' };
    return { token: await this.openSession(acc.id) };
  }

  async accountFor(token: string | null | undefined): Promise<number | null> {
    if (!token || token.length > 100) return null;
    return this.store.sessionAccount(hashToken(token), new Date());
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(hashToken(token));
  }

  private async openSession(accountId: number): Promise<string> {
    const token = newToken();
    await this.store.createSession(
      hashToken(token),
      accountId,
      new Date(Date.now() + SESSION_DAYS * 86400_000),
    );
    return token;
  }
}
