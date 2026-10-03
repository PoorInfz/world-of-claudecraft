import {
  type AppearanceWire,
  classAllowed,
  decodeAppearance,
  encodeAppearance,
} from '../../shared/appearance.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import { RACES } from '../../shared/data/races.ts';
import type { ClassId } from '../../shared/data/types.ts';
import { validateName } from '../../shared/names.ts';
import type { CharacterRecord, Store } from '../db/store.ts';

/** Ranuras de personaje por cuenta. */
export const MAX_CHARACTERS = 6;

export type CharacterError =
  | 'nombre_invalido'
  | 'nombre_en_uso'
  | 'apariencia_invalida'
  | 'clase_invalida'
  | 'limite_personajes';

/** Lo que ve la pantalla de seleccion (sin datos internos). */
export interface CharacterSummary {
  id: number;
  name: string;
  cls: ClassId;
  race: string;
  sex: string;
  faction: string;
  appearance: AppearanceWire;
  level: number;
  zone: string;
}

export function summarize(c: CharacterRecord): CharacterSummary {
  return {
    id: c.id,
    name: c.name,
    cls: c.cls,
    race: c.race,
    sex: c.sex,
    faction: c.faction,
    appearance: encodeAppearance(c.appearance),
    level: c.level,
    zone: c.zone,
  };
}

export class CharacterService {
  constructor(private readonly store: Store) {}

  async list(accountId: number): Promise<CharacterSummary[]> {
    return (await this.store.listCharacters(accountId)).map(summarize);
  }

  /**
   * Crea un personaje. La faccion NO la elige el cliente: se deriva de la
   * raza. Todo se valida aqui aunque el cliente ya lo haya validado.
   */
  async create(
    accountId: number,
    input: { name: unknown; cls: unknown; appearance: unknown },
  ): Promise<CharacterSummary | { error: CharacterError }> {
    if (typeof input.name !== 'string') return { error: 'nombre_invalido' };
    const v = validateName(input.name);
    if (!v.ok) return { error: 'nombre_invalido' };
    const appearance = decodeAppearance(input.appearance);
    if (!appearance) return { error: 'apariencia_invalida' };
    if (typeof input.cls !== 'string' || !(input.cls in CLASSES))
      return { error: 'clase_invalida' };
    const cls = input.cls as ClassId;
    if (!classAllowed(appearance.race, cls)) return { error: 'clase_invalida' };
    const race = RACES[appearance.race];
    const rec = await this.store.createCharacter(
      {
        accountId,
        name: v.name,
        cls,
        race: race.id,
        sex: appearance.sex,
        faction: race.faction,
        appearance,
        zone: race.startZone,
      },
      MAX_CHARACTERS,
    );
    if (rec === 'name_taken') return { error: 'nombre_en_uso' };
    if (rec === 'limit') return { error: 'limite_personajes' };
    return summarize(rec);
  }

  delete(accountId: number, id: number): Promise<boolean> {
    return this.store.deleteCharacter(accountId, id);
  }
}
