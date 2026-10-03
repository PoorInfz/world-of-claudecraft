import type { BaseStats, ClassId, FactionId } from './types.ts';

/**
 * Razas jugables y opciones de apariencia. La faccion la decide la raza.
 * Fase 2: una raza por faccion (humanos para la Luz, orcos para la Sombra);
 * el resto de razas de la Fase 4 se anaden aqui como nuevos registros.
 */

export type RaceId = 'humano' | 'orco';
export type Sex = 'm' | 'f';
export const SEXES: Sex[] = ['m', 'f'];

export interface RaceDef {
  id: RaceId;
  name: string;
  /** Nombre en plural para textos ("Humanos"). */
  plural: string;
  faction: FactionId;
  description: string;
  passive: { name: string; description: string; stats: Partial<BaseStats> };
  classes: ClassId[];
  /** Tonos de piel (hex). */
  skinTones: string[];
  /** Ids de HAIR_STYLES disponibles por sexo. */
  hairStyles: Record<Sex, number[]>;
  /** Numero de variantes de cara. */
  faces: number;
  /** Ids de FEATURES disponibles por sexo (el primero siempre es 'ninguno'). */
  features: Record<Sex, string[]>;
  /** Proporciones del cuerpo base (0 = normal, 1 = corpulento). */
  bulk: Record<Sex, number>;
  /** Zona inicial propia (de momento todas comparten el Valle del Alba). */
  startZone: string;
}

/** Catalogo de peinados. Cada raza elige cuales ofrece por sexo. */
export const HAIR_STYLES: { id: number; name: string }[] = [
  { id: 0, name: 'Rapado' },
  { id: 1, name: 'Corto' },
  { id: 2, name: 'Despeinado' },
  { id: 3, name: 'Raya al lado' },
  { id: 4, name: 'Media melena' },
  { id: 5, name: 'Melena larga' },
  { id: 6, name: 'Coleta' },
  { id: 7, name: 'Moño' },
  { id: 8, name: 'Trenzas' },
  { id: 9, name: 'Cresta' },
  { id: 10, name: 'Pinchos' },
  { id: 11, name: 'Flequillo' },
  { id: 12, name: 'Dos coletas' },
  { id: 13, name: 'Cola alta' },
  { id: 14, name: 'Calvo' },
];

/** Colores de pelo compartidos por todas las razas. */
export const HAIR_COLORS: { name: string; hex: string }[] = [
  { name: 'Negro', hex: '#1d1a17' },
  { name: 'Castaño oscuro', hex: '#3b2414' },
  { name: 'Castaño', hex: '#6a3d1e' },
  { name: 'Avellana', hex: '#8a5a2b' },
  { name: 'Rubio oscuro', hex: '#a07a3a' },
  { name: 'Rubio', hex: '#d8b45a' },
  { name: 'Rubio platino', hex: '#ece0b0' },
  { name: 'Pelirrojo', hex: '#b2441e' },
  { name: 'Cobrizo', hex: '#d0702a' },
  { name: 'Canoso', hex: '#9a9a9a' },
  { name: 'Blanco', hex: '#e8e8e8' },
  { name: 'Azul noche', hex: '#26305a' },
  { name: 'Verde musgo', hex: '#3e5a2a' },
  { name: 'Violeta', hex: '#5a2a6a' },
  { name: 'Rojo sangre', hex: '#7a1414' },
  { name: 'Ceniza', hex: '#5a5650' },
];

export const EYE_COLORS: { name: string; hex: string }[] = [
  { name: 'Marrón', hex: '#5a3418' },
  { name: 'Azul', hex: '#2b5aa0' },
  { name: 'Verde', hex: '#2a7a3a' },
  { name: 'Gris', hex: '#7a8088' },
  { name: 'Ámbar', hex: '#c88a1a' },
  { name: 'Rojo', hex: '#c0302a' },
  { name: 'Violeta', hex: '#7a3ab0' },
  { name: 'Negro', hex: '#141414' },
];

/** Rasgos raciales (barba, colmillos, pinturas...). */
export const FEATURES: Record<string, { name: string }> = {
  ninguno: { name: 'Ninguno' },
  bigote: { name: 'Bigote' },
  barba_corta: { name: 'Barba corta' },
  barba_larga: { name: 'Barba larga' },
  perilla: { name: 'Perilla' },
  patillas: { name: 'Patillas' },
  pecas: { name: 'Pecas' },
  lunar: { name: 'Lunar' },
  cicatriz: { name: 'Cicatriz' },
  colmillos: { name: 'Colmillos' },
  colmillos_grandes: { name: 'Colmillos grandes' },
  pintura_guerra: { name: 'Pintura de guerra' },
  aro_nariz: { name: 'Aro en la nariz' },
  barba_trenzada: { name: 'Barba trenzada' },
};

export const RACES: Record<RaceId, RaceDef> = {
  humano: {
    id: 'humano',
    name: 'Humano',
    plural: 'Humanos',
    faction: 'luz',
    description: 'Tenaces y adaptables, los humanos levantan murallas y sanan a los suyos.',
    passive: {
      name: 'Voluntad firme',
      description: '+2 Espíritu y +1 Intelecto.',
      stats: { spi: 2, int: 1 },
    },
    classes: ['guerrero', 'mago'],
    skinTones: [
      '#f6dcc4',
      '#f0c9a0',
      '#e8b98e',
      '#d9a274',
      '#c68a5c',
      '#a8704a',
      '#8a5636',
      '#6e4128',
      '#54301c',
      '#3e2214',
    ],
    hairStyles: {
      m: [1, 2, 3, 4, 5, 6, 9, 10, 11, 0, 14],
      f: [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13],
    },
    faces: 6,
    features: {
      m: [
        'ninguno',
        'bigote',
        'barba_corta',
        'barba_larga',
        'perilla',
        'patillas',
        'cicatriz',
        'pecas',
      ],
      f: ['ninguno', 'pecas', 'lunar', 'cicatriz'],
    },
    bulk: { m: 0, f: 0 },
    startZone: 'valle_alba',
  },
  orco: {
    id: 'orco',
    name: 'Orco',
    plural: 'Orcos',
    faction: 'sombra',
    description: 'Forjados en la guerra, los orcos no se arrodillan ante nadie.',
    passive: {
      name: 'Fuerza bruta',
      description: '+2 Fuerza y +1 Aguante.',
      stats: { str: 2, sta: 1 },
    },
    classes: ['guerrero', 'mago'],
    skinTones: [
      '#8ab05a',
      '#7aa356',
      '#6f9a4a',
      '#5e8a40',
      '#4e7a36',
      '#3f6a2e',
      '#7a8a5a',
      '#8a7a4e',
      '#6a5a3a',
      '#9a5a3a',
    ],
    hairStyles: { m: [0, 1, 2, 5, 6, 8, 9, 10, 13, 14], f: [2, 4, 5, 6, 7, 8, 9, 12, 13, 1] },
    faces: 6,
    features: {
      m: [
        'ninguno',
        'colmillos',
        'colmillos_grandes',
        'pintura_guerra',
        'aro_nariz',
        'cicatriz',
        'barba_trenzada',
      ],
      f: ['ninguno', 'colmillos', 'pintura_guerra', 'aro_nariz', 'cicatriz'],
    },
    bulk: { m: 1, f: 0 },
    startZone: 'valle_alba',
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];

export function racesOfFaction(f: FactionId): RaceDef[] {
  return RACE_IDS.map((id) => RACES[id]).filter((r) => r.faction === f);
}
