import type {
  AccountRecord,
  CharacterProgress,
  CharacterRecord,
  NewCharacter,
  Store,
} from './store.ts';

/** Almacen en memoria: mismo contrato que PgStore. Se pierde al reiniciar. */
export class MemoryStore implements Store {
  private accounts = new Map<string, AccountRecord>();
  private sessions = new Map<string, { accountId: number; expiresAt: Date }>();
  private characters = new Map<number, CharacterRecord>();
  private nextAccount = 1;
  private nextChar = 1;

  async init(): Promise<void> {}

  async createAccount(username: string, passwordHash: string): Promise<AccountRecord | 'taken'> {
    const key = username.toLowerCase();
    if (this.accounts.has(key)) return 'taken';
    const a = { id: this.nextAccount++, username: key, passwordHash };
    this.accounts.set(key, a);
    return { ...a };
  }

  async findAccount(username: string): Promise<AccountRecord | null> {
    const a = this.accounts.get(username.toLowerCase());
    return a ? { ...a } : null;
  }

  async createSession(tokenHash: string, accountId: number, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { accountId, expiresAt });
  }

  async sessionAccount(tokenHash: string, now: Date): Promise<number | null> {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expiresAt <= now) return null;
    return s.accountId;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async listCharacters(accountId: number): Promise<CharacterRecord[]> {
    return [...this.characters.values()]
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => a.id - b.id)
      .map(clone);
  }

  async createCharacter(
    c: NewCharacter,
    maxPerAccount: number,
  ): Promise<CharacterRecord | 'name_taken' | 'limit'> {
    const lower = c.name.toLocaleLowerCase('es');
    for (const o of this.characters.values())
      if (o.name.toLocaleLowerCase('es') === lower) return 'name_taken';
    if (
      [...this.characters.values()].filter((o) => o.accountId === c.accountId).length >=
      maxPerAccount
    )
      return 'limit';
    const rec: CharacterRecord = {
      ...clone(c as CharacterRecord),
      id: this.nextChar++,
      level: 1,
      xp: 0,
      x: null,
      y: null,
      gold: 0,
      inventory: [],
    };
    this.characters.set(rec.id, rec);
    return clone(rec);
  }

  async getCharacter(accountId: number, id: number): Promise<CharacterRecord | null> {
    const c = this.characters.get(id);
    return c && c.accountId === accountId ? clone(c) : null;
  }

  async deleteCharacter(accountId: number, id: number): Promise<boolean> {
    const c = this.characters.get(id);
    if (!c || c.accountId !== accountId) return false;
    this.characters.delete(id);
    return true;
  }

  async saveProgress(p: CharacterProgress): Promise<void> {
    const c = this.characters.get(p.id);
    if (!c) return;
    if (!Number.isInteger(p.gold) || p.gold < 0) throw new Error('oro invalido');
    Object.assign(c, {
      zone: p.zone,
      x: p.x,
      y: p.y,
      level: p.level,
      xp: p.xp,
      gold: p.gold,
      inventory: structuredClone(p.inventory),
    });
  }

  async close(): Promise<void> {}
}

function clone<T>(v: T): T {
  return structuredClone(v);
}
