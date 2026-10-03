import type { CharacterProgress, Store } from '../db/store.ts';

/**
 * Personajes conectados y guardados en curso. Garantiza que un personaje
 * solo esta en el mundo una vez y que, al reconectar, se carga DESPUES de
 * que termine el guardado de la sesion anterior (sin perder ni duplicar oro).
 */
export class OnlineRegistry {
  private online = new Set<number>();
  private saving = new Map<number, Promise<void>>();

  constructor(private readonly store: Store) {}

  /** Reserva el personaje; false si ya esta conectado. */
  async claim(charId: number): Promise<boolean> {
    if (this.online.has(charId)) return false;
    this.online.add(charId);
    const pending = this.saving.get(charId);
    if (pending) await pending.catch(() => {});
    return true;
  }

  isOnline(charId: number): boolean {
    return this.online.has(charId);
  }

  /** Guarda sin soltar la reserva (autoguardado). */
  save(p: CharacterProgress): Promise<void> {
    const prev = this.saving.get(p.id) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => this.store.saveProgress(p))
      .finally(() => {
        if (this.saving.get(p.id) === next) this.saving.delete(p.id);
      });
    this.saving.set(p.id, next);
    return next;
  }

  /** Guarda el estado final y libera la reserva. */
  release(p: CharacterProgress | null, charId: number): Promise<void> {
    this.online.delete(charId);
    return p ? this.save(p) : Promise.resolve();
  }

  /** Espera a que terminen todos los guardados (cierre ordenado). */
  async flush(): Promise<void> {
    await Promise.allSettled([...this.saving.values()]);
  }
}
