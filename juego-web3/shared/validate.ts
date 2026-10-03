import { ABILITIES } from './data/abilities.ts';
import { CLASSES } from './data/classes.ts';
import { FACTIONS } from './data/factions.ts';
import type { ClassId, FactionId } from './data/types.ts';
import type { ClientMsg } from './protocol.ts';

/**
 * Validacion estructural de los mensajes del cliente. Cualquier cosa que no
 * encaje exactamente se descarta (null). La validacion de reglas de juego
 * (alcance, costes, reutilizacion...) la hace la zona.
 */

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function coord(v: unknown): v is number {
  return num(v) && v >= -1 && v <= 4096;
}

function id(v: unknown): v is number {
  return num(v) && Number.isInteger(v) && v > 0 && v < 2 ** 31;
}

export function parseClientMessage(raw: string): ClientMsg | null {
  if (raw.length > 512) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'join':
      if (typeof o.name !== 'string' || o.name.length > 32) return null;
      if (typeof o.cls !== 'string' || !(o.cls in CLASSES)) return null;
      if (typeof o.fac !== 'string' || !(o.fac in FACTIONS)) return null;
      return { t: 'join', name: o.name, cls: o.cls as ClassId, fac: o.fac as FactionId };
    case 'move':
      if (!coord(o.x) || !coord(o.y)) return null;
      return { t: 'move', x: o.x, y: o.y };
    case 'attack':
      if (!id(o.id)) return null;
      return { t: 'attack', id: o.id };
    case 'cast': {
      if (typeof o.ab !== 'string' || !(o.ab in ABILITIES)) return null;
      const msg: ClientMsg = { t: 'cast', ab: o.ab };
      if (o.id !== undefined) {
        if (!id(o.id)) return null;
        msg.id = o.id;
      }
      if (o.x !== undefined || o.y !== undefined) {
        if (!coord(o.x) || !coord(o.y)) return null;
        msg.x = o.x;
        msg.y = o.y;
      }
      return msg;
    }
    case 'target':
      if (o.id === null) return { t: 'target', id: null };
      if (!id(o.id)) return null;
      return { t: 'target', id: o.id };
    case 'pickup':
      if (!id(o.id)) return null;
      return { t: 'pickup', id: o.id };
    case 'stop':
      return { t: 'stop' };
    case 'ping':
      if (!num(o.c)) return null;
      return { t: 'ping', c: o.c };
    default:
      return null;
  }
}
