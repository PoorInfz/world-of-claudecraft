import type { PlayerEntity } from '../server/zone/entities.ts';
import type { Zone } from '../server/zone/zone.ts';
import { defaultAppearance } from '../shared/appearance.ts';
import { CLASSES } from '../shared/data/classes.ts';
import type { ClassId, SpawnDef } from '../shared/data/types.ts';
import type { MapData } from '../shared/map.ts';
import type { ServerMsg } from '../shared/protocol.ts';

/** Mapa sintetico abierto con muros opcionales (coordenadas de baldosa). */
export function makeMap(
  w: number,
  h: number,
  walls: [number, number][] = [],
  spawns: SpawnDef[] = [],
): MapData {
  const n = w * h;
  const blocked = new Uint8Array(n);
  const opaque = new Uint8Array(n);
  for (const [x, y] of walls) {
    blocked[y * w + x] = 1;
    opaque[y * w + x] = 1;
  }
  return {
    width: w,
    height: h,
    ground: new Int16Array(n),
    deco: new Int16Array(n).fill(-1),
    blocked,
    opaque,
    playerSpawn: { x: 5.5, y: 5.5, radius: 0 },
    graveyard: { x: 2.5, y: 2.5 },
    spawns,
  };
}

/** Observador que guarda todo lo recibido. */
export class Recorder {
  msgs: ServerMsg[] = [];
  send(m: ServerMsg): void {
    this.msgs.push(m);
  }
  snaps(): Extract<ServerMsg, { t: 'snap' }>[] {
    return this.msgs.filter((m): m is Extract<ServerMsg, { t: 'snap' }> => m.t === 'snap');
  }
  events() {
    return this.snaps().flatMap((s) => s.ev ?? []);
  }
  last() {
    const s = this.snaps();
    return s[s.length - 1];
  }
}

let nextChar = 1;

export function addPlayer(
  z: Zone,
  name = 'Prueba',
  cls: ClassId = 'guerrero',
): { p: PlayerEntity; rec: Recorder } {
  const rec = new Recorder();
  const p = z.addPlayer(
    {
      charId: nextChar++,
      name,
      cls: CLASSES[cls],
      faction: 'luz',
      appearance: defaultAppearance('humano', 'm'),
      level: 1,
      x: null,
      y: null,
      gold: 0,
      inventory: [],
    },
    rec,
  );
  return { p, rec };
}

export function run(z: Zone, seconds: number, until?: () => boolean): void {
  const ticks = Math.round(seconds * 20);
  for (let i = 0; i < ticks; i++) {
    z.step();
    if (until?.()) return;
  }
}

export function mobs(z: Zone) {
  return [...z.entities.values()].filter((e) => e.kind === 'mob');
}
