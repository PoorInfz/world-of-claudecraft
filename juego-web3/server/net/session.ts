import type { WebSocket } from 'ws';
import { MAX_MSGS_PER_SEC, TICK_RATE } from '../../shared/constants.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../shared/protocol.ts';
import { parseClientMessage } from '../../shared/validate.ts';
import type { AuthService } from '../auth/auth_service.ts';
import type { OnlineRegistry } from '../characters/online.ts';
import type { Store } from '../db/store.ts';
import type { Zone } from '../zone/zone.ts';

export interface SessionDeps {
  zone: Zone;
  store: Store;
  auth: AuthService;
  online: OnlineRegistry;
}

/**
 * Una conexion WebSocket. Antes del 'join' solo acepta 'join' y 'ping'.
 * El 'join' lleva el token de sesion y el id del personaje: el servidor
 * comprueba que el personaje es de esa cuenta, que no esta ya conectado y lo
 * carga desde la base de datos. Al cerrar, guarda su estado.
 */
export class Session {
  private playerId: number | null = null;
  private charId: number | null = null;
  private joining = false;
  private closed = false;
  private windowStart = Date.now();
  private windowCount = 0;
  private strikes = 0;

  constructor(
    private readonly ws: WebSocket,
    private readonly deps: SessionDeps,
  ) {
    ws.on('message', (data, isBinary) => {
      if (isBinary) this.kick();
      else this.onMessage(data.toString());
    });
    ws.on('close', () => this.onClose());
    ws.on('error', () => this.onClose());
  }

  private send(msg: ServerMsg): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private reject(code: ErrorCode): void {
    this.send({ t: 'reject', code });
  }

  private kick(): void {
    this.ws.close(1008, 'protocolo');
  }

  /** Ventana de 1 s; demasiados excesos cierran la conexion. */
  private allow(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (++this.windowCount <= MAX_MSGS_PER_SEC) return true;
    if (++this.strikes > 200) this.kick();
    return false;
  }

  private onMessage(raw: string): void {
    if (!this.allow()) return;
    const msg = parseClientMessage(raw);
    if (!msg) {
      if (++this.strikes > 50) this.kick();
      return;
    }
    const { zone } = this.deps;
    if (msg.t === 'ping') {
      this.send({ t: 'pong', c: msg.c, tick: zone.tick });
      return;
    }
    if (this.playerId === null) {
      if (msg.t === 'join' && !this.joining) void this.join(msg);
      return;
    }
    if (msg.t === 'join') return;
    zone.queue(this.playerId, msg);
  }

  private async join(msg: Extract<ClientMsg, { t: 'join' }>): Promise<void> {
    this.joining = true;
    const { zone, store, auth, online } = this.deps;
    try {
      const accountId = await auth.accountFor(msg.token);
      if (accountId === null) return this.reject('sesion_invalida');
      const rec = await store.getCharacter(accountId, msg.char);
      if (!rec) return this.reject('personaje_no_encontrado');
      if (!(await online.claim(rec.id))) return this.reject('personaje_en_uso');
      // Pudo cerrarse mientras esperabamos a la base de datos.
      if (this.closed) {
        await online.release(null, rec.id);
        return;
      }
      // Se recarga tras esperar posibles guardados pendientes de la sesion anterior.
      const fresh = (await store.getCharacter(accountId, msg.char)) ?? rec;
      const cls = CLASSES[fresh.cls];
      const p = zone.addPlayer(
        {
          charId: fresh.id,
          name: fresh.name,
          cls,
          faction: fresh.faction,
          appearance: fresh.appearance,
          level: fresh.level,
          x: fresh.zone === zone.id ? fresh.x : null,
          y: fresh.zone === zone.id ? fresh.y : null,
          gold: fresh.gold,
          inventory: fresh.inventory,
        },
        { send: (m) => this.send(m) },
      );
      this.playerId = p.id;
      this.charId = fresh.id;
      if (this.closed) {
        this.onClose();
        return;
      }
      this.send({
        t: 'welcome',
        id: p.id,
        zone: zone.id,
        tick: zone.tick,
        tickRate: TICK_RATE,
        x: p.x,
        y: p.y,
      });
    } catch (e) {
      console.error('[join]', e);
      this.reject('sesion_invalida');
    } finally {
      this.joining = false;
    }
  }

  private onClose(): void {
    this.closed = true;
    const { zone, online } = this.deps;
    if (this.playerId !== null && this.charId !== null) {
      const p = zone.entities.get(this.playerId);
      const progress = p && p.kind === 'player' ? zone.progressOf(p) : null;
      zone.removePlayer(this.playerId);
      void online.release(progress, this.charId).catch((e) => console.error('[guardar]', e));
    }
    this.playerId = null;
    this.charId = null;
  }
}
