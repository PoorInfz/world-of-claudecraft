import { WS_PATH } from '../../shared/constants.ts';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';

/** WebSocket del juego con medicion de latencia (ping cada 2 s). */
export class Connection {
  private ws: WebSocket;
  private handlers: ((m: ServerMsg) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  private pingTimer = 0;
  /** Ida y vuelta suavizada en ms. */
  rtt = 100;

  constructor(url = defaultUrl()) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      if (msg.t === 'pong') {
        const sample = performance.now() - msg.c;
        this.rtt = this.rtt * 0.7 + sample * 0.3;
      }
      for (const h of this.handlers) h(msg);
    });
    this.ws.addEventListener('close', () => {
      window.clearInterval(this.pingTimer);
      for (const h of this.closeHandlers) h();
    });
    this.ws.addEventListener('open', () => {
      this.pingTimer = window.setInterval(
        () => this.send({ t: 'ping', c: performance.now() }),
        2000,
      );
    });
  }

  opened(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((ok, fail) => {
      this.ws.addEventListener('open', () => ok(), { once: true });
      this.ws.addEventListener('error', () => fail(new Error('ws')), { once: true });
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  onMessage(h: (m: ServerMsg) => void): () => void {
    this.handlers.push(h);
    return () => {
      this.handlers = this.handlers.filter((x) => x !== h);
    };
  }

  onClose(h: () => void): void {
    this.closeHandlers.push(h);
  }
}

function defaultUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${WS_PATH}`;
}
