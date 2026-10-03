/** Zonas del mundo. La Fase 1 solo tiene la zona inicial de pruebas. */
export interface ZoneDef {
  id: string;
  name: string;
  /** Archivo Tiled (.tmj) en maps/. */
  map: string;
  levelRange: [number, number];
  kind: 'luz' | 'sombra' | 'disputada' | 'jcj' | 'neutral';
}

export const ZONES: Record<string, ZoneDef> = {
  valle_alba: {
    id: 'valle_alba',
    name: 'Valle del Alba',
    map: 'valle_alba.tmj',
    levelRange: [1, 10],
    kind: 'disputada',
  },
};

export const START_ZONE = 'valle_alba';
