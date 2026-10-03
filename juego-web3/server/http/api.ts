import type { AuthService } from '../auth/auth_service.ts';
import { type CharacterService, MAX_CHARACTERS } from '../characters/character_service.ts';
import type { OnlineRegistry } from '../characters/online.ts';
import type { Ctx, Reply, Route } from './router.ts';

/**
 * Rutas REST de cuentas y personajes:
 *   POST   /api/cuentas            registro            -> { token }
 *   POST   /api/sesion             inicio de sesion    -> { token }
 *   DELETE /api/sesion             cierre de sesion
 *   GET    /api/personajes         lista de la cuenta  -> { personajes, max }
 *   POST   /api/personajes         crear               -> { personaje }
 *   DELETE /api/personajes/:id     borrar
 */
export function apiRoutes(
  auth: AuthService,
  chars: CharacterService,
  online: OnlineRegistry,
): Route[] {
  const field = (body: unknown, k: string): unknown =>
    body && typeof body === 'object' ? (body as Record<string, unknown>)[k] : undefined;

  const credentials = (ctx: Ctx): { u: string; p: string } | null => {
    const u = field(ctx.body, 'usuario');
    const p = field(ctx.body, 'clave');
    return typeof u === 'string' && typeof p === 'string' ? { u, p } : null;
  };

  const authed =
    (fn: (ctx: Ctx, accountId: number) => Promise<Reply>) =>
    async (ctx: Ctx): Promise<Reply> => {
      const acc = await auth.accountFor(ctx.token);
      if (acc === null) return { status: 401, body: { error: 'no_autorizado' } };
      return fn(ctx, acc);
    };

  return [
    {
      method: 'POST',
      path: '/api/cuentas',
      rate: 10,
      handler: async (ctx) => {
        const c = credentials(ctx);
        if (!c) return { status: 400, body: { error: 'peticion_invalida' } };
        const r = await auth.register(c.u, c.p);
        if ('error' in r) return { status: r.error === 'usuario_en_uso' ? 409 : 400, body: r };
        return { status: 201, body: r };
      },
    },
    {
      method: 'POST',
      path: '/api/sesion',
      rate: 20,
      handler: async (ctx) => {
        const c = credentials(ctx);
        if (!c) return { status: 400, body: { error: 'peticion_invalida' } };
        const r = await auth.login(c.u, c.p);
        if ('error' in r) return { status: 401, body: r };
        return { status: 200, body: r };
      },
    },
    {
      method: 'DELETE',
      path: '/api/sesion',
      handler: async (ctx) => {
        if (ctx.token) await auth.logout(ctx.token);
        return { status: 204 };
      },
    },
    {
      method: 'GET',
      path: '/api/personajes',
      handler: authed(async (_ctx, acc) => ({
        status: 200,
        body: { personajes: await chars.list(acc), max: MAX_CHARACTERS },
      })),
    },
    {
      method: 'POST',
      path: '/api/personajes',
      rate: 30,
      handler: authed(async (ctx, acc) => {
        const r = await chars.create(acc, {
          name: field(ctx.body, 'nombre'),
          cls: field(ctx.body, 'clase'),
          appearance: field(ctx.body, 'apariencia'),
        });
        if ('error' in r) return { status: r.error === 'nombre_en_uso' ? 409 : 400, body: r };
        return { status: 201, body: { personaje: r } };
      }),
    },
    {
      method: 'DELETE',
      path: '/api/personajes/:id',
      rate: 30,
      handler: authed(async (ctx, acc) => {
        const id = Number(ctx.params.id);
        if (!Number.isInteger(id) || id <= 0)
          return { status: 400, body: { error: 'peticion_invalida' } };
        if (online.isOnline(id)) return { status: 409, body: { error: 'personaje_en_uso' } };
        return (await chars.delete(acc, id))
          ? { status: 204 }
          : { status: 404, body: { error: 'no_encontrado' } };
      }),
    },
  ];
}
