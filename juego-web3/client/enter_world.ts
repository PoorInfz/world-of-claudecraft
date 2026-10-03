import type Phaser from 'phaser';
import { decodeAppearance, defaultAppearance } from '../shared/appearance.ts';
import type { FactionId } from '../shared/data/types.ts';
import { ERRORS, T } from './i18n.ts';
import type { Api, CharacterSummary } from './net/api.ts';
import { Connection } from './net/connection.ts';
import { ClientWorld } from './net/world.ts';
import type { GameSession } from './session.ts';
import { loadZoneMap } from './zone_map.ts';

/**
 * Conecta al proceso de zona con un personaje y arranca el mundo y el HUD.
 * Devuelve un mensaje de error para la pantalla de seleccion, o null.
 */
export async function enterWorld(
  scene: Phaser.Scene,
  api: Api,
  ch: CharacterSummary,
): Promise<string | null> {
  if (!api.token) return ERRORS.sesion_invalida;
  const conn = new Connection();
  try {
    await conn.opened();
  } catch {
    return T.disconnected;
  }
  const map = loadZoneMap(ch.zone);
  const faction = ch.faction as FactionId;
  const world = new ClientWorld(map, ch.cls, faction);
  const result = await new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(T.disconnected), 8000);
    const off = conn.onMessage((m) => {
      if (m.t === 'reject') {
        window.clearTimeout(timer);
        off();
        resolve(ERRORS[m.code]);
      } else if (m.t === 'welcome') {
        window.clearTimeout(timer);
        off();
        world.apply(m, performance.now(), conn.rtt);
        resolve(null);
      }
    });
    conn.send({ t: 'join', token: api.token as string, char: ch.id });
  });
  if (result) {
    conn.close();
    return result;
  }
  conn.onMessage((msg) => world.apply(msg, performance.now(), conn.rtt));
  const session: GameSession = {
    conn,
    world,
    map,
    zoneId: ch.zone,
    name: ch.name,
    cls: ch.cls,
    faction,
    charId: ch.id,
    appearance: decodeAppearance(ch.appearance) ?? defaultAppearance('humano', 'm'),
  };
  scene.registry.set('session', session);
  const mgr = scene.scene.manager;
  conn.onClose(() => {
    if (mgr.isActive('game')) {
      mgr.stop('hud');
      mgr.stop('game');
      mgr.start('select', { error: session.leaving ? '' : T.disconnected, select: ch.id });
    }
  });
  scene.scene.start('game');
  scene.scene.launch('hud');
  return null;
}
