import type { Appearance } from '../../shared/appearance.ts';
import type { RaceId, Sex } from '../../shared/data/races.ts';
import type { ClassId, FactionId } from '../../shared/data/types.ts';
import type { InventoryItem } from '../../shared/protocol.ts';

/**
 * Contrato de persistencia. Hay dos implementaciones con el MISMO
 * comportamiento: PostgreSQL (produccion) y memoria (tests y desarrollo
 * sin base de datos). Los tests de contrato corren contra ambas.
 */

export interface AccountRecord {
  id: number;
  username: string;
  passwordHash: string;
}

export interface CharacterRecord {
  id: number;
  accountId: number;
  name: string;
  cls: ClassId;
  race: RaceId;
  sex: Sex;
  faction: FactionId;
  appearance: Appearance;
  level: number;
  xp: number;
  zone: string;
  /** Null hasta la primera partida: aparece en el punto de inicio. */
  x: number | null;
  y: number | null;
  /** Cobre. Nunca negativo. */
  gold: number;
  inventory: InventoryItem[];
}

export type NewCharacter = Omit<
  CharacterRecord,
  'id' | 'level' | 'xp' | 'x' | 'y' | 'gold' | 'inventory'
>;

/** Estado de partida que se guarda al salir y periodicamente. */
export interface CharacterProgress {
  id: number;
  zone: string;
  x: number;
  y: number;
  level: number;
  xp: number;
  gold: number;
  inventory: InventoryItem[];
}

export interface Store {
  init(): Promise<void>;
  createAccount(username: string, passwordHash: string): Promise<AccountRecord | 'taken'>;
  findAccount(username: string): Promise<AccountRecord | null>;
  createSession(tokenHash: string, accountId: number, expiresAt: Date): Promise<void>;
  /** Cuenta de una sesion no caducada, o null. */
  sessionAccount(tokenHash: string, now: Date): Promise<number | null>;
  deleteSession(tokenHash: string): Promise<void>;
  listCharacters(accountId: number): Promise<CharacterRecord[]>;
  /** Crea respetando el limite por cuenta y la unicidad del nombre (sin distinguir mayusculas). */
  createCharacter(
    c: NewCharacter,
    maxPerAccount: number,
  ): Promise<CharacterRecord | 'name_taken' | 'limit'>;
  getCharacter(accountId: number, id: number): Promise<CharacterRecord | null>;
  deleteCharacter(accountId: number, id: number): Promise<boolean>;
  saveProgress(p: CharacterProgress): Promise<void>;
  close(): Promise<void>;
}
