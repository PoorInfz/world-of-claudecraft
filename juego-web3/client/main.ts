import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH } from '../shared/constants.ts';
import { API_ERRORS, T } from './i18n.ts';
import { Api, ApiError } from './net/api.ts';
import { BootScene } from './scenes/boot_scene.ts';
import { CreatorScene } from './scenes/creator_scene.ts';
import { GameScene } from './scenes/game_scene.ts';
import { SelectScene } from './scenes/select_scene.ts';
import type { GameSession } from './session.ts';
import { HudScene } from './ui/hud_scene.ts';

/**
 * Entrada del cliente: inicio de sesion (formulario HTML, para que funcionen
 * los gestores de contrasenas) y arranque de Phaser con escalado entero.
 * Despues todo es pixel art: seleccion, creador, mundo y HUD.
 */

const api = new Api();
const form = document.getElementById('login') as HTMLFormElement;
const errEl = document.getElementById('err') as HTMLElement;
const userEl = document.getElementById('usuario') as HTMLInputElement;
const passEl = document.getElementById('clave') as HTMLInputElement;
const loginBtn = document.getElementById('b-login') as HTMLButtonElement;
const registerBtn = document.getElementById('b-register') as HTMLButtonElement;

for (const [id, value] of [
  ['sub', T.loginSubtitle],
  ['b-login', T.login],
  ['b-register', T.register],
  ['help', T.loginHelp],
] as const) {
  (document.getElementById(id) as HTMLElement).textContent = value;
}

/** Mayor factor entero que cabe; el lienzo cubre la ventana sin bandas. */
function fitScreen(): { w: number; h: number; zoom: number } {
  const zoom = Math.max(
    1,
    Math.floor(Math.min(innerWidth / BASE_WIDTH, innerHeight / BASE_HEIGHT)),
  );
  return { w: Math.ceil(innerWidth / zoom), h: Math.ceil(innerHeight / zoom), zoom };
}

function startGame(): void {
  form.classList.add('hidden');
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
    scene: [BootScene, SelectScene, CreatorScene, GameScene, HudScene],
  });
  game.registry.set('api', api);
  // Gancho para las pruebas E2E en desarrollo (no existe en la build de produccion).
  if (import.meta.env.DEV) {
    const w = window as unknown as { __game: Phaser.Game; __session?: GameSession };
    w.__game = game;
    game.registry.events.on('changedata-session', (_: unknown, s: GameSession) => {
      w.__session = s;
    });
    game.registry.events.on('setdata', (_: unknown, key: string, s: GameSession) => {
      if (key === 'session') w.__session = s;
    });
  }
  addEventListener('resize', () => {
    const n = fitScreen();
    game.scale.resize(n.w, n.h);
    game.scale.setZoom(n.zoom);
  });
}

async function auth(kind: 'login' | 'register'): Promise<void> {
  errEl.textContent = '';
  loginBtn.disabled = registerBtn.disabled = true;
  try {
    if (kind === 'login') await api.login(userEl.value, passEl.value);
    else await api.register(userEl.value, passEl.value);
    startGame();
  } catch (e) {
    errEl.textContent = API_ERRORS[e instanceof ApiError ? e.code : 'red'] ?? '';
  } finally {
    loginBtn.disabled = registerBtn.disabled = false;
  }
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  void auth('login');
});
registerBtn.addEventListener('click', () => {
  if (form.reportValidity()) void auth('register');
});

// Sesion recordada: directo a la seleccion de personajes.
if (api.token) {
  api.characters().then(
    () => startGame(),
    () => form.classList.remove('hidden'),
  );
} else {
  form.classList.remove('hidden');
}
