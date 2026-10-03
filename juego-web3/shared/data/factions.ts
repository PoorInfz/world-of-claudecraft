import type { FactionDef, FactionId } from './types.ts';

/**
 * Facciones. Los nombres son PROVISIONALES y se cambian aqui sin tocar la
 * logica: todo el codigo usa el id ('luz' | 'sombra').
 */
export const FACTIONS: Record<FactionId, FactionDef> = {
  luz: {
    id: 'luz',
    name: 'Luz',
    motto: 'Proteger, sanar y guardar el orden.',
    colors: { primary: 0xf2c14e, secondary: 0xfff4d6, accent: 0x4f8fe0, dark: 0x6b4a12 },
  },
  sombra: {
    id: 'sombra',
    name: 'Sombra',
    motto: 'Conquistar, corromper y romper las cadenas.',
    colors: { primary: 0x7b3fa0, secondary: 0x2a1631, accent: 0xa02a3a, dark: 0x120a18 },
  },
};

export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

/** Dos entidades son hostiles si pertenecen a facciones distintas. */
export function factionsHostile(a: FactionId, b: FactionId): boolean {
  return a !== b;
}
