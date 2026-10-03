import pg from 'pg';
import type { Appearance } from '../../shared/appearance.ts';
import type { InventoryItem } from '../../shared/protocol.ts';
import type {
  AccountRecord,
  CharacterProgress,
  CharacterRecord,
  NewCharacter,
  Store,
} from './store.ts';

/**
 * Esquema idempotente: se aplica en cada arranque. Solo cambios aditivos
 * (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS cuentas (
  id BIGSERIAL PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL,
  creada TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  cuenta_id BIGINT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  expira TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_cuenta ON sesiones (cuenta_id);
CREATE TABLE IF NOT EXISTS personajes (
  id BIGSERIAL PRIMARY KEY,
  cuenta_id BIGINT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  clase TEXT NOT NULL,
  raza TEXT NOT NULL,
  sexo TEXT NOT NULL,
  faccion TEXT NOT NULL,
  apariencia JSONB NOT NULL,
  nivel INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  zona TEXT NOT NULL,
  x REAL,
  y REAL,
  oro BIGINT NOT NULL DEFAULT 0 CHECK (oro >= 0),
  inventario JSONB NOT NULL DEFAULT '[]',
  creado TIMESTAMPTZ NOT NULL DEFAULT now(),
  guardado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personajes_nombre_unico ON personajes (lower(nombre));
CREATE INDEX IF NOT EXISTS personajes_cuenta ON personajes (cuenta_id);
`;

interface CharRow {
  id: string;
  cuenta_id: string;
  nombre: string;
  clase: string;
  raza: string;
  sexo: string;
  faccion: string;
  apariencia: Appearance;
  nivel: number;
  xp: number;
  zona: string;
  x: number | null;
  y: number | null;
  oro: string;
  inventario: InventoryItem[];
}

function toRecord(r: CharRow): CharacterRecord {
  return {
    id: Number(r.id),
    accountId: Number(r.cuenta_id),
    name: r.nombre,
    cls: r.clase as CharacterRecord['cls'],
    race: r.raza as CharacterRecord['race'],
    sex: r.sexo as CharacterRecord['sex'],
    faction: r.faccion as CharacterRecord['faction'],
    appearance: r.apariencia,
    level: r.nivel,
    xp: r.xp,
    zone: r.zona,
    x: r.x,
    y: r.y,
    gold: Number(r.oro),
    inventory: r.inventario,
  };
}

const CHAR_COLS =
  'id, cuenta_id, nombre, clase, raza, sexo, faccion, apariencia, nivel, xp, zona, x, y, oro, inventario';

/** Almacen PostgreSQL. Todas las consultas van parametrizadas. */
export class PgStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10, statement_timeout: 5000 });
  }

  async init(): Promise<void> {
    const c = await this.pool.connect();
    try {
      // Bloqueo consultivo: varios procesos de zona pueden arrancar a la vez.
      await c.query('SELECT pg_advisory_lock(424242)');
      await c.query(SCHEMA);
    } finally {
      await c.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
      c.release();
    }
  }

  async createAccount(username: string, passwordHash: string): Promise<AccountRecord | 'taken'> {
    const r = await this.pool.query<{ id: string }>(
      'INSERT INTO cuentas (usuario, clave_hash) VALUES ($1, $2) ON CONFLICT (usuario) DO NOTHING RETURNING id',
      [username.toLowerCase(), passwordHash],
    );
    const row = r.rows[0];
    if (!row) return 'taken';
    return { id: Number(row.id), username: username.toLowerCase(), passwordHash };
  }

  async findAccount(username: string): Promise<AccountRecord | null> {
    const r = await this.pool.query<{ id: string; usuario: string; clave_hash: string }>(
      'SELECT id, usuario, clave_hash FROM cuentas WHERE usuario = $1',
      [username.toLowerCase()],
    );
    const row = r.rows[0];
    return row ? { id: Number(row.id), username: row.usuario, passwordHash: row.clave_hash } : null;
  }

  async createSession(tokenHash: string, accountId: number, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES ($1, $2, $3)',
      [tokenHash, accountId, expiresAt],
    );
    // Limpieza oportunista de sesiones caducadas de esta cuenta (crecimiento acotado).
    await this.pool.query('DELETE FROM sesiones WHERE cuenta_id = $1 AND expira < now()', [
      accountId,
    ]);
  }

  async sessionAccount(tokenHash: string, now: Date): Promise<number | null> {
    const r = await this.pool.query<{ cuenta_id: string }>(
      'SELECT cuenta_id FROM sesiones WHERE token_hash = $1 AND expira > $2',
      [tokenHash, now],
    );
    const row = r.rows[0];
    return row ? Number(row.cuenta_id) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sesiones WHERE token_hash = $1', [tokenHash]);
  }

  async listCharacters(accountId: number): Promise<CharacterRecord[]> {
    const r = await this.pool.query<CharRow>(
      `SELECT ${CHAR_COLS} FROM personajes WHERE cuenta_id = $1 ORDER BY id`,
      [accountId],
    );
    return r.rows.map(toRecord);
  }

  async createCharacter(
    c: NewCharacter,
    maxPerAccount: number,
  ): Promise<CharacterRecord | 'name_taken' | 'limit'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa las creaciones de una misma cuenta para respetar el limite.
      await client.query('SELECT id FROM cuentas WHERE id = $1 FOR UPDATE', [c.accountId]);
      const n = await client.query<{ n: string }>(
        'SELECT count(*) AS n FROM personajes WHERE cuenta_id = $1',
        [c.accountId],
      );
      if (Number(n.rows[0]?.n ?? 0) >= maxPerAccount) {
        await client.query('ROLLBACK');
        return 'limit';
      }
      const r = await client.query<CharRow>(
        `INSERT INTO personajes (cuenta_id, nombre, clase, raza, sexo, faccion, apariencia, zona)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ((lower(nombre))) DO NOTHING
         RETURNING ${CHAR_COLS}`,
        [
          c.accountId,
          c.name,
          c.cls,
          c.race,
          c.sex,
          c.faction,
          JSON.stringify(c.appearance),
          c.zone,
        ],
      );
      const row = r.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return 'name_taken';
      }
      await client.query('COMMIT');
      return toRecord(row);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async getCharacter(accountId: number, id: number): Promise<CharacterRecord | null> {
    const r = await this.pool.query<CharRow>(
      `SELECT ${CHAR_COLS} FROM personajes WHERE id = $1 AND cuenta_id = $2`,
      [id, accountId],
    );
    const row = r.rows[0];
    return row ? toRecord(row) : null;
  }

  async deleteCharacter(accountId: number, id: number): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM personajes WHERE id = $1 AND cuenta_id = $2', [
      id,
      accountId,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  async saveProgress(p: CharacterProgress): Promise<void> {
    if (!Number.isInteger(p.gold) || p.gold < 0) throw new Error('oro invalido');
    await this.pool.query(
      `UPDATE personajes SET zona = $2, x = $3, y = $4, nivel = $5, xp = $6, oro = $7, inventario = $8, guardado = now()
       WHERE id = $1`,
      [p.id, p.zone, p.x, p.y, p.level, p.xp, p.gold, JSON.stringify(p.inventory)],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
