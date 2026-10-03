import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, hashToken, verifyPassword } from '../server/auth/password.ts';
import { MemoryStore } from '../server/db/memory_store.ts';
import { PgStore } from '../server/db/pg_store.ts';
import type { NewCharacter, Store } from '../server/db/store.ts';
import { defaultAppearance } from '../shared/appearance.ts';

/**
 * Pruebas de contrato: el almacen en memoria y PostgreSQL deben comportarse
 * igual. La parte de PostgreSQL se ejecuta si existe TEST_DATABASE_URL.
 */

describe('contrasenas', () => {
  it('hash con sal y verificacion', async () => {
    const h1 = await hashPassword('secreto123');
    const h2 = await hashPassword('secreto123');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('secreto123', h1)).toBe(true);
    expect(await verifyPassword('secreto124', h1)).toBe(false);
    expect(await verifyPassword('secreto123', 'basura')).toBe(false);
  });
});

const newChar = (accountId: number, name: string): NewCharacter => ({
  accountId,
  name,
  cls: 'guerrero',
  race: 'humano',
  sex: 'm',
  faction: 'luz',
  appearance: defaultAppearance('humano', 'm'),
  zone: 'valle_alba',
});

function contract(label: string, make: () => Promise<Store>, uniq: string) {
  describe(`almacen: ${label}`, () => {
    let s: Store;
    beforeAll(async () => {
      s = await make();
      await s.init();
    });
    afterAll(async () => {
      await s.close();
    });

    it('cuentas unicas sin distinguir mayusculas', async () => {
      const a = await s.createAccount(`Ana${uniq}`, 'h');
      expect(a).not.toBe('taken');
      expect(await s.createAccount(`ana${uniq}`, 'h')).toBe('taken');
      expect((await s.findAccount(`ANA${uniq}`))?.passwordHash).toBe('h');
      expect(await s.findAccount(`nadie${uniq}`)).toBeNull();
    });

    it('sesiones con caducidad', async () => {
      const a = await s.createAccount(`ses${uniq}`, 'h');
      if (a === 'taken') throw new Error('taken');
      const now = new Date();
      await s.createSession(hashToken(`t1${uniq}`), a.id, new Date(now.getTime() + 60_000));
      await s.createSession(hashToken(`t2${uniq}`), a.id, new Date(now.getTime() - 1));
      expect(await s.sessionAccount(hashToken(`t1${uniq}`), now)).toBe(a.id);
      expect(await s.sessionAccount(hashToken(`t2${uniq}`), now)).toBeNull();
      await s.deleteSession(hashToken(`t1${uniq}`));
      expect(await s.sessionAccount(hashToken(`t1${uniq}`), now)).toBeNull();
    });

    it('personajes: nombre unico, limite, propiedad y guardado', async () => {
      const a = await s.createAccount(`pj${uniq}`, 'h');
      const b = await s.createAccount(`pk${uniq}`, 'h');
      if (a === 'taken' || b === 'taken') throw new Error('taken');
      const c = await s.createCharacter(newChar(a.id, `Rocio${uniq}`), 2);
      if (typeof c === 'string') throw new Error(c);
      expect(c).toMatchObject({ level: 1, gold: 0, x: null, inventory: [] });
      expect(await s.createCharacter(newChar(b.id, `ROCIO${uniq}`), 2)).toBe('name_taken');
      await s.createCharacter(newChar(a.id, `Sara${uniq}`), 2);
      expect(await s.createCharacter(newChar(a.id, `Tere${uniq}`), 2)).toBe('limit');
      expect((await s.listCharacters(a.id)).map((x) => x.name)).toEqual([
        `Rocio${uniq}`,
        `Sara${uniq}`,
      ]);
      expect(await s.getCharacter(b.id, c.id)).toBeNull();

      await s.saveProgress({
        id: c.id,
        zone: 'valle_alba',
        x: 12.5,
        y: 7.25,
        level: 1,
        xp: 0,
        gold: 98765,
        inventory: [{ item: 'hueso_antiguo', qty: 2 }],
      });
      const back = await s.getCharacter(a.id, c.id);
      expect(back).toMatchObject({
        x: 12.5,
        y: 7.25,
        gold: 98765,
        inventory: [{ item: 'hueso_antiguo', qty: 2 }],
      });
      expect(back?.appearance).toEqual(defaultAppearance('humano', 'm'));
      await expect(
        s.saveProgress({
          id: c.id,
          zone: 'z',
          x: 0,
          y: 0,
          level: 1,
          xp: 0,
          gold: -5,
          inventory: [],
        }),
      ).rejects.toThrow();

      expect(await s.deleteCharacter(b.id, c.id)).toBe(false);
      expect(await s.deleteCharacter(a.id, c.id)).toBe(true);
      // El nombre queda libre tras borrar.
      expect(typeof (await s.createCharacter(newChar(b.id, `Rocio${uniq}`), 2))).toBe('object');
    });
  });
}

const uniq = String(Date.now() % 1e6);
contract('memoria', async () => new MemoryStore(), uniq);
const pgUrl = process.env.TEST_DATABASE_URL;
if (pgUrl) contract('postgres', async () => new PgStore(pgUrl), `p${uniq}`);
else describe.skip('almacen: postgres (sin TEST_DATABASE_URL)', () => it('omitido', () => {}));
