import Phaser from 'phaser';
import mapRaw from '../maps/valle_alba.tmj?raw';
import { BASE_HEIGHT, BASE_WIDTH } from '../shared/constants.ts';
import { CLASS_IDS, CLASSES } from '../shared/data/classes.ts';
import { FACTION_IDS, FACTIONS } from '../shared/data/factions.ts';
import type { ClassId, FactionId } from '../shared/data/types.ts';
import { parseTiledMap, type TiledMap } from '../shared/map.ts';
import { validateName } from '../shared/names.ts';
import { ERRORS, T } from './i18n.ts';
import { Connection } from './net/connection.ts';
import { ClientWorld } from './net/world.ts';
import { BootScene } from './scenes/boot_scene.ts';
import { GameScene } from './scenes/game_scene.ts';
import type { GameSession } from './session.ts';
import { HudScene } from './ui/hud_scene.ts';

/**
 * Entrada del cliente: formulario de entrada (provisional hasta el creador
 * de personajes de la Fase 2), conexion y arranque de Phaser con escalado
 * por enteros.
 */

const form = document.getElementById('join') as HTMLFormElement;
const errEl = document.getElementById('err') as HTMLElement;
const nameEl = document.getElementById('name') as HTMLInputElement;

function radios(container: string, name: string, items: { id: string; label: string }[]): void {
  const el = document.getElementById(container) as HTMLElement;
  items.forEach((it, i) => {
    const l = document.createElement('label');
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = name;
    r.value = it.id;
    r.checked = i === 0;
    l.append(r, document.createTextNode(it.label));
    el.append(l);
  });
}
radios(
  'factions',
  'fac',
  FACTION_IDS.map((id) => ({ id, label: FACTIONS[id].name })),
);
radios(
  'classes',
  'cls',
  CLASS_IDS.map((id) => ({ id, label: CLASSES[id].name })),
);
nameEl.value = new URLSearchParams(location.search).get('nombre') ?? '';

/** Mayor factor entero que cabe; el lienzo cubre la ventana sin bandas. */
function fitScreen(): { w: number; h: number; zoom: number } {
  const zoom = Math.max(
    1,
    Math.floor(Math.min(innerWidth / BASE_WIDTH, innerHeight / BASE_HEIGHT)),
  );
  return { w: Math.ceil(innerWidth / zoom), h: Math.ceil(innerHeight / zoom), zoom };
}

function startGame(session: GameSession): void {
  const f = fitScreen();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: f.w,
    height: f.h,
    backgroundColor: '#0c0a10',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.NONE, zoom: f.zoom },
    fps: { target: 60 },
    scene: [BootScene, GameScene, HudScene],
  });
  game.registry.set('session', session);
  // Gancho para las pruebas E2E en desarrollo (no existe en la build de produccion).
  if (import.meta.env.DEV) (window as unknown as { __session: GameSession }).__session = session;
  addEventListener('resize', () => {
    const n = fitScreen();
    game.scale.resize(n.w, n.h);
    game.scale.setZoom(n.zoom);
  });
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  errEl.textContent = '';
  const v = validateName(nameEl.value);
  if (!v.ok) {
    errEl.textContent = ERRORS.nombre_invalido;
    return;
  }
  const fd = new FormData(form);
  const cls = String(fd.get('cls')) as ClassId;
  const faction = String(fd.get('fac')) as FactionId;
  const btn = document.getElementById('enter') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = T.connecting;
  const map = parseTiledMap(JSON.parse(mapRaw) as TiledMap);
  const conn = new Connection();
  const world = new ClientWorld(map, cls, faction);
  try {
    await conn.opened();
  } catch {
    errEl.textContent = T.disconnected;
    btn.disabled = false;
    btn.textContent = T.enter;
    return;
  }
  const off = conn.onMessage((m) => {
    if (m.t === 'reject') {
      errEl.textContent = ERRORS[m.code];
      btn.disabled = false;
      btn.textContent = T.enter;
      off();
      return;
    }
    if (m.t === 'welcome') {
      off();
      form.classList.add('hidden');
      world.apply(m, performance.now(), conn.rtt);
      conn.onMessage((msg) => world.apply(msg, performance.now(), conn.rtt));
      startGame({ conn, world, map, zoneId: m.zone, name: v.name, cls, faction });
    }
  });
  conn.onClose(() => {
    errEl.textContent = T.disconnected;
    form.classList.remove('hidden');
  });
  conn.send({ t: 'join', name: v.name, cls, fac: faction });
});
