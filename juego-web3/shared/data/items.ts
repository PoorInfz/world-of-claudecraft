import type { ItemDef, Rarity } from './types.ts';

/** Objetos de la Fase 1 (botin basico). El equipo visible llega en la Fase 3. */
export const ITEMS: Record<string, ItemDef> = {
  colmillo_lobo: {
    id: 'colmillo_lobo',
    name: 'Colmillo de lobo',
    rarity: 'comun',
    slot: 'ninguno',
    value: 12,
    description: 'Lo compran los mercaderes.',
    icon: 'colmillo',
  },
  piel_raida: {
    id: 'piel_raida',
    name: 'Piel raída',
    rarity: 'comun',
    slot: 'ninguno',
    value: 8,
    icon: 'piel',
  },
  hueso_antiguo: {
    id: 'hueso_antiguo',
    name: 'Hueso antiguo',
    rarity: 'comun',
    slot: 'ninguno',
    value: 10,
    icon: 'hueso',
  },
  arco_astillado: {
    id: 'arco_astillado',
    name: 'Arco astillado',
    rarity: 'comun',
    slot: 'arma',
    value: 25,
    stats: { agi: 1 },
    icon: 'arco',
  },
  espada_oxidada: {
    id: 'espada_oxidada',
    name: 'Espada oxidada',
    rarity: 'comun',
    slot: 'arma',
    value: 30,
    stats: { str: 1 },
    icon: 'espada',
  },
  tunica_cultista: {
    id: 'tunica_cultista',
    name: 'Túnica de cultista',
    rarity: 'poco_comun',
    slot: 'pecho',
    value: 85,
    stats: { int: 3, spi: 2 },
    icon: 'tunica',
  },
  botas_cazador: {
    id: 'botas_cazador',
    name: 'Botas de cazador furtivo',
    rarity: 'poco_comun',
    slot: 'pies',
    value: 70,
    stats: { agi: 2, sta: 2 },
    icon: 'botas',
  },
  amuleto_ambar: {
    id: 'amuleto_ambar',
    name: 'Amuleto de ámbar viejo',
    rarity: 'raro',
    slot: 'ninguno',
    value: 400,
    stats: { sta: 3, spi: 3 },
    description: 'Late con un calor tenue.',
    icon: 'amuleto',
  },
};

/** Colores de rareza (texto y bordes). */
export const RARITY_COLORS: Record<Rarity, number> = {
  comun: 0xe6e6e6,
  poco_comun: 0x3ed34a,
  raro: 0x3f8cff,
  epico: 0xb05cff,
  legendario: 0xff9a1f,
};
