import type { Appearance } from '../shared/appearance.ts';
import type { ClassId, FactionId } from '../shared/data/types.ts';
import type { MapData } from '../shared/map.ts';
import type { Connection } from './net/connection.ts';
import type { ClientWorld } from './net/world.ts';

/** Lo que comparten las escenas de una partida. */
export interface GameSession {
  conn: Connection;
  world: ClientWorld;
  map: MapData;
  zoneId: string;
  name: string;
  cls: ClassId;
  faction: FactionId;
  charId: number;
  appearance: Appearance;
  /** Salida voluntaria (no mostrar error de desconexion). */
  leaving?: boolean;
}
