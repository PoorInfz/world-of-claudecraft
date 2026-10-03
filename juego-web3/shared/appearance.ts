import { CLASSES } from './data/classes.ts';
import {
  EYE_COLORS,
  HAIR_COLORS,
  RACE_IDS,
  RACES,
  type RaceId,
  SEXES,
  type Sex,
} from './data/races.ts';
import type { ClassId } from './data/types.ts';
import type { Rng } from './rng.ts';

/**
 * Apariencia de un personaje como un conjunto compacto de IDs. Es lo unico
 * que viaja por la red y lo que se guarda en la base de datos: los sprites
 * se componen en el cliente a partir de estos numeros (y de la clase).
 */
export interface Appearance {
  race: RaceId;
  sex: Sex;
  /** Indice en race.skinTones. */
  skin: number;
  /** Id de HAIR_STYLES (debe estar en race.hairStyles[sex]). */
  hair: number;
  /** Indice en HAIR_COLORS. */
  hairColor: number;
  /** 0..race.faces-1 */
  face: number;
  /** Indice en race.features[sex]. */
  feature: number;
  /** Indice en EYE_COLORS. */
  eyes: number;
}

/** Formato de red: [raza, sexo, piel, pelo, colorPelo, cara, rasgo, ojos]. */
export type AppearanceWire = [number, number, number, number, number, number, number, number];

export function encodeAppearance(a: Appearance): AppearanceWire {
  return [
    RACE_IDS.indexOf(a.race),
    SEXES.indexOf(a.sex),
    a.skin,
    a.hair,
    a.hairColor,
    a.face,
    a.feature,
    a.eyes,
  ];
}

export function decodeAppearance(w: unknown): Appearance | null {
  if (!Array.isArray(w) || w.length !== 8 || !w.every((n) => Number.isInteger(n))) return null;
  const race = RACE_IDS[w[0] as number];
  const sex = SEXES[w[1] as number];
  if (!race || !sex) return null;
  const a: Appearance = {
    race,
    sex,
    skin: w[2] as number,
    hair: w[3] as number,
    hairColor: w[4] as number,
    face: w[5] as number,
    feature: w[6] as number,
    eyes: w[7] as number,
  };
  return isValidAppearance(a) ? a : null;
}

const inRange = (n: unknown, max: number): boolean =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < max;

/** Comprueba que cada ID existe para esa raza y sexo. */
export function isValidAppearance(a: unknown): a is Appearance {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  const race = RACES[o.race as RaceId];
  if (!race || !SEXES.includes(o.sex as Sex)) return false;
  const sex = o.sex as Sex;
  return (
    inRange(o.skin, race.skinTones.length) &&
    Number.isInteger(o.hair) &&
    race.hairStyles[sex].includes(o.hair as number) &&
    inRange(o.hairColor, HAIR_COLORS.length) &&
    inRange(o.face, race.faces) &&
    inRange(o.feature, race.features[sex].length) &&
    inRange(o.eyes, EYE_COLORS.length)
  );
}

export function classAllowed(race: RaceId, cls: ClassId): boolean {
  return !!CLASSES[cls] && RACES[race].classes.includes(cls);
}

/** Categorias que el creador puede bloquear antes de aleatorizar. */
export type AppearanceCategory = 'skin' | 'hair' | 'hairColor' | 'face' | 'feature' | 'eyes';
export const APPEARANCE_CATEGORIES: AppearanceCategory[] = [
  'skin',
  'hair',
  'hairColor',
  'face',
  'feature',
  'eyes',
];

/** Opciones disponibles de una categoria para una raza y sexo. */
export function optionCount(a: Pick<Appearance, 'race' | 'sex'>, cat: AppearanceCategory): number {
  const r = RACES[a.race];
  switch (cat) {
    case 'skin':
      return r.skinTones.length;
    case 'hair':
      return r.hairStyles[a.sex].length;
    case 'hairColor':
      return HAIR_COLORS.length;
    case 'face':
      return r.faces;
    case 'feature':
      return r.features[a.sex].length;
    case 'eyes':
      return EYE_COLORS.length;
  }
}

/** Posicion (0..n-1) del valor actual dentro de las opciones de la categoria. */
export function optionIndex(a: Appearance, cat: AppearanceCategory): number {
  return cat === 'hair' ? RACES[a.race].hairStyles[a.sex].indexOf(a.hair) : a[cat];
}

/** Devuelve una copia con la opcion n-esima de la categoria. */
export function withOption(a: Appearance, cat: AppearanceCategory, n: number): Appearance {
  const count = optionCount(a, cat);
  const i = ((n % count) + count) % count;
  const value = cat === 'hair' ? (RACES[a.race].hairStyles[a.sex][i] as number) : i;
  return { ...a, [cat]: value };
}

/** Apariencia por defecto de una raza y sexo. */
export function defaultAppearance(race: RaceId, sex: Sex): Appearance {
  const r = RACES[race];
  return {
    race,
    sex,
    skin: 2,
    hair: r.hairStyles[sex][0] as number,
    hairColor: 2,
    face: 0,
    feature: 0,
    eyes: 0,
  };
}

/**
 * Ajusta una apariencia tras cambiar de raza o sexo: conserva lo que siga
 * siendo valido y recoloca el resto en la primera opcion.
 */
export function coerceAppearance(a: Appearance): Appearance {
  const r = RACES[a.race];
  const out = { ...a };
  if (!inRange(out.skin, r.skinTones.length)) out.skin = 0;
  if (!r.hairStyles[a.sex].includes(out.hair)) out.hair = r.hairStyles[a.sex][0] as number;
  if (!inRange(out.face, r.faces)) out.face = 0;
  if (!inRange(out.feature, r.features[a.sex].length)) out.feature = 0;
  return out;
}

/** Aleatoriza las categorias no bloqueadas. */
export function randomizeAppearance(
  a: Appearance,
  locked: ReadonlySet<AppearanceCategory>,
  rng: Rng,
): Appearance {
  let out = { ...a };
  for (const cat of APPEARANCE_CATEGORIES) {
    if (locked.has(cat)) continue;
    out = withOption(out, cat, rng.int(0, optionCount(out, cat) - 1));
  }
  return out;
}
