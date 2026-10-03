import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_CATEGORIES,
  type AppearanceCategory,
  classAllowed,
  coerceAppearance,
  decodeAppearance,
  defaultAppearance,
  encodeAppearance,
  isValidAppearance,
  optionCount,
  optionIndex,
  randomizeAppearance,
  withOption,
} from '../shared/appearance.ts';
import { FACTION_IDS } from '../shared/data/factions.ts';
import { HAIR_COLORS, HAIR_STYLES, RACE_IDS, RACES, SEXES } from '../shared/data/races.ts';
import { Rng } from '../shared/rng.ts';

describe('datos de razas', () => {
  it('cada faccion tiene al menos una raza y cubre todas las clases', () => {
    for (const f of FACTION_IDS) {
      const races = RACE_IDS.map((r) => RACES[r]).filter((r) => r.faction === f);
      expect(races.length).toBeGreaterThan(0);
      const classes = new Set(races.flatMap((r) => r.classes));
      expect(classes).toEqual(new Set(['guerrero', 'mago']));
    }
  });

  it('rangos de opciones del documento de diseno', () => {
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(12);
    for (const id of RACE_IDS) {
      const r = RACES[id];
      expect(r.skinTones.length).toBeGreaterThanOrEqual(8);
      expect(r.faces).toBeGreaterThanOrEqual(5);
      for (const s of SEXES) {
        expect(r.hairStyles[s].length).toBeGreaterThanOrEqual(10);
        for (const h of r.hairStyles[s]) expect(HAIR_STYLES.some((x) => x.id === h)).toBe(true);
        expect(r.features[s][0]).toBe('ninguno');
      }
    }
  });
});

describe('apariencia', () => {
  it('codifica y decodifica sin perdida', () => {
    const a = {
      ...defaultAppearance('orco', 'f'),
      skin: 5,
      hairColor: 9,
      face: 3,
      feature: 2,
      eyes: 4,
    };
    expect(decodeAppearance(encodeAppearance(a))).toEqual(a);
  });

  it('rechaza IDs fuera de rango o no disponibles para la raza/sexo', () => {
    const ok = encodeAppearance(defaultAppearance('humano', 'm'));
    expect(decodeAppearance(ok)).not.toBeNull();
    for (let i = 2; i < 8; i++) {
      const bad = [...ok];
      bad[i] = 99;
      expect(decodeAppearance(bad)).toBeNull();
    }
    expect(decodeAppearance([0, 0, 0, 7, 0, 0, 0, 0])).toBeNull(); // mono: solo mujeres humanas
    expect(decodeAppearance([0, 1, 0, 7, 0, 0, 0, 0])).not.toBeNull();
    expect(decodeAppearance([5, 0, 0, 1, 0, 0, 0, 0])).toBeNull();
    expect(decodeAppearance([0, 0, 0, 1.5, 0, 0, 0, 0])).toBeNull();
    expect(decodeAppearance('0,0,0')).toBeNull();
  });

  it('withOption recorre las opciones de forma circular', () => {
    const a = defaultAppearance('humano', 'f');
    for (const cat of APPEARANCE_CATEGORIES) {
      const n = optionCount(a, cat);
      expect(optionIndex(withOption(a, cat, n), cat)).toBe(0);
      expect(optionIndex(withOption(a, cat, -1), cat)).toBe(n - 1);
      expect(isValidAppearance(withOption(a, cat, n - 1))).toBe(true);
    }
  });

  it('al cambiar de sexo se recoloca lo que deja de ser valido', () => {
    const f = withOption(
      defaultAppearance('humano', 'f'),
      'hair',
      RACES.humano.hairStyles.f.indexOf(7),
    );
    expect(f.hair).toBe(7);
    const m = coerceAppearance({ ...f, sex: 'm' });
    expect(isValidAppearance(m)).toBe(true);
    expect(m.hairColor).toBe(f.hairColor);
  });

  it('aleatorizar respeta las categorias bloqueadas y siempre da algo valido', () => {
    const rng = new Rng(3);
    const base = defaultAppearance('orco', 'm');
    const locked = new Set<AppearanceCategory>(['hairColor', 'eyes']);
    for (let i = 0; i < 200; i++) {
      const r = randomizeAppearance(base, locked, rng);
      expect(isValidAppearance(r)).toBe(true);
      expect(r.hairColor).toBe(base.hairColor);
      expect(r.eyes).toBe(base.eyes);
    }
  });

  it('combinaciones raza/clase', () => {
    expect(classAllowed('humano', 'mago')).toBe(true);
    expect(classAllowed('orco', 'guerrero')).toBe(true);
  });
});
