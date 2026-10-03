import type { WebSocket } from 'ws';
import { MAX_MSGS_PER_SEC, TICK_RATE } from '../../shared/constants.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import { validateName } from '../../shared/names.ts';
import type { ServerMsg } from '../../shared/protocol.ts';
import { parseClientMessage } from '../../shared/validate.ts';
import type { Zone } from '../zone/zone.ts';

/**
 * Una conexion WebSocket. Valida y limita los mensajes entrantes y los
 * encola en la zona; envia lo que la zona produce. Antes del 'join' solo se
 * acepta 'join' y 'ping'.
 */
export class Session {
  private playerId: number | null = null;
  private windowStart = Date.now();
  private windowCount = 0;
  private strikes = 0;

  constructor(
    private readonly ws: WebSocket,
    private readonly zone: Zone,
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

  private kick(): void {
    this.ws.close(1008, 'protocolo');
  }

  /** Ventana deslizante de 1 s; demasiados excesos cierran la conexion. */
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
    if (msg.t === 'ping') {
      this.send({ t: 'pong', c: msg.c, tick: this.zone.tick });
      return;
    }
    if (this.playerId === null) {
      if (msg.t !== 'join') return;
      const v = validateName(msg.name);
      if (!v.ok) {
        this.send({ t: 'reject', code: 'nombre_invalido' });
        return;
      }
      if (this.zone.isNameOnline(v.name)) {
        this.send({ t: 'reject', code: 'nombre_en_uso' });
        return;
      }
      const cls = CLASSES[msg.cls];
      if (!cls) {
        this.send({ t: 'reject', code: 'clase_invalida' });
        return;
      }
      const p = this.zone.addPlayer(v.name, cls, msg.fac, { send: (m) => this.send(m) });
      this.playerId = p.id;
      this.send({
        t: 'welcome',
        id: p.id,
        zone: this.zone.id,
        tick: this.zone.tick,
        tickRate: TICK_RATE,
        x: p.x,
        y: p.y,
      });
      return;
    }
    if (msg.t === 'join') return;
    this.zone.queue(this.playerId, msg);
  }

  private onClose(): void {
    if (this.playerId !== null) this.zone.removePlayer(this.playerId);
    this.playerId = null;
  }
}
