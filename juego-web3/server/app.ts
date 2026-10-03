import { AuthService } from './auth/auth_service.ts';
import { CharacterService } from './characters/character_service.ts';
import { OnlineRegistry } from './characters/online.ts';
import type { Store } from './db/store.ts';
import { apiRoutes } from './http/api.ts';
import { type RunningServer, startServer } from './net/server.ts';
import type { Zone } from './zone/zone.ts';

/** Segundos entre autoguardados de los personajes conectados. */
export const AUTOSAVE_SECONDS = 30;

export interface App {
  server: RunningServer;
  online: OnlineRegistry;
  /** Guarda a todos los conectados (autoguardado y cierre). */
  saveAll(): Promise<void>;
  close(): Promise<void>;
}

/** Monta un proceso de zona completo: API REST + WebSocket + autoguardado. */
export async function createApp(
  zone: Zone,
  store: Store,
  port: number,
  staticDir: string | null,
  opts: { rateScale?: number } = {},
): Promise<App> {
  await store.init();
  const auth = new AuthService(store);
  const chars = new CharacterService(store);
  const online = new OnlineRegistry(store);
  const server = await startServer(
    { zone, store, auth, online },
    apiRoutes(auth, chars, online),
    port,
    staticDir,
    opts.rateScale,
  );
  const saveAll = async (): Promise<void> => {
    await Promise.allSettled([...zone.players()].map((p) => online.save(zone.progressOf(p))));
  };
  const timer = setInterval(() => {
    void saveAll();
  }, AUTOSAVE_SECONDS * 1000);
  return {
    server,
    online,
    saveAll,
    close: async () => {
      clearInterval(timer);
      await saveAll();
      await server.close();
      await online.flush();
      await store.close();
    },
  };
}
