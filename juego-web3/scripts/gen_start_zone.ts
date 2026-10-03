/**
 * Genera maps/valle_alba.tmj: un mapa Tiled isometrico valido (se puede abrir
 * y editar en Tiled). Es un generador de placeholder: cuando haya un mapa
 * dibujado a mano, se guarda encima y este script deja de usarse.
 *
 * Uso: npm run map
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_H, TILE_W } from '../shared/constants.ts';
import { Rng } from '../shared/rng.ts';
import { TILE, TILE_COUNT } from '../shared/tiles.ts';

const W = 96;
const H = 96;
const rng = new Rng(20240611);

const ground = new Array<number>(W * H).fill(TILE.hierba);
const deco = new Array<number>(W * H).fill(-1);
const solid = new Array<boolean>(W * H).fill(false);
/** Celdas reservadas (caminos, plazas): sin decoracion aleatoria. */
const reserved = new Array<boolean>(W * H).fill(false);

const idx = (x: number, y: number): number => y * W + x;
const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;

function setGround(x: number, y: number, t: number): void {
  if (inside(x, y)) ground[idx(x, y)] = t;
}
function reserve(x: number, y: number): void {
  if (inside(x, y)) reserved[idx(x, y)] = true;
}
function place(x: number, y: number, t: number, blocks = true): void {
  if (!inside(x, y)) return;
  deco[idx(x, y)] = t;
  if (blocks) solid[idx(x, y)] = true;
}
function rect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fn: (x: number, y: number) => void,
): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
}

// Variedad de hierba.
rect(0, 0, W - 1, H - 1, (x, y) => {
  const r = rng.next();
  if (r < 0.18) setGround(x, y, TILE.hierba2);
  else if (r < 0.22) setGround(x, y, TILE.hierba_flores);
});

// Rio serpenteante de norte a sur.
const riverX = (y: number): number => Math.round(50 + 3 * Math.sin(y / 9));
const bridges = [20, 48, 78];
for (let y = 0; y < H; y++) {
  const cx = riverX(y);
  for (let dx = -1; dx <= 1; dx++) {
    if (bridges.some((b) => Math.abs(b - y) <= 1)) {
      setGround(cx + dx, y, TILE.tierra);
      reserve(cx + dx, y);
    } else {
      setGround(cx + dx, y, TILE.agua);
    }
  }
  setGround(cx - 2, y, TILE.arena);
  setGround(cx + 2, y, TILE.arena);
}

// Caminos de tierra.
function path(ax: number, ay: number, bx: number, by: number): void {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / steps);
    const y = Math.round(ay + ((by - ay) * i) / steps);
    for (let d = 0; d <= 1; d++) {
      if (ground[idx(x + d, y)] !== TILE.agua) setGround(x + d, y, TILE.tierra);
      reserve(x + d, y);
      reserve(x + d, y + 1);
    }
  }
}
path(34, 48, 70, 48); // aldea -> pradera (puente central)
path(30, 44, 30, 20);
path(30, 20, 70, 18); // -> ruinas (puente norte)
path(30, 52, 30, 78);
path(30, 78, 70, 78); // -> campamento (puente sur)

// Aldea del Alba: plaza de piedra, casas, hoguera.
rect(25, 43, 35, 53, (x, y) => {
  setGround(x, y, TILE.piedra);
  reserve(x, y);
});
for (const [x, y] of [
  [23, 42],
  [37, 42],
  [23, 54],
  [37, 54],
  [27, 40],
  [33, 40],
  [27, 56],
  [33, 56],
]) {
  place(x as number, y as number, TILE.casa);
}
place(30, 48, TILE.hoguera);

// Cementerio al noroeste de la aldea.
rect(18, 36, 22, 39, (x, y) => {
  setGround(x, y, TILE.hierba_oscura);
  reserve(x, y);
});
for (const [x, y] of [
  [18, 36],
  [20, 36],
  [22, 36],
  [18, 38],
  [22, 38],
]) {
  place(x as number, y as number, TILE.lapida);
}

// Ruinas del norte: losas rotas y columnas.
rect(60, 8, 86, 26, (x, y) => {
  if (rng.chance(0.55)) setGround(x, y, TILE.piedra);
});
for (let i = 0; i < 26; i++) {
  const x = rng.int(61, 85);
  const y = rng.int(9, 25);
  if (!reserved[idx(x, y)]) place(x, y, TILE.columna);
}

// Campamento del sur: hierba oscura, tiendas y hogueras.
rect(60, 68, 88, 90, (x, y) => {
  if (rng.chance(0.7)) setGround(x, y, TILE.hierba_oscura);
});
for (const [x, y] of [
  [64, 72],
  [70, 70],
  [78, 72],
  [84, 76],
  [66, 84],
  [76, 86],
  [84, 84],
]) {
  place(x as number, y as number, TILE.tienda);
}
place(72, 78, TILE.hoguera);
place(80, 80, TILE.hoguera);

// Borde de bosque infranqueable.
rect(0, 0, W - 1, H - 1, (x, y) => {
  const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
  if (edge < 2 || (edge < 4 && rng.chance(0.6))) {
    if (ground[idx(x, y)] !== TILE.agua) place(x, y, rng.chance(0.5) ? TILE.pino : TILE.roble);
    solid[idx(x, y)] = true;
  }
});

// Decoracion dispersa.
rect(4, 4, W - 5, H - 5, (x, y) => {
  const i = idx(x, y);
  if (reserved[i] || deco[i] >= 0 || ground[i] === TILE.agua || ground[i] === TILE.arena) return;
  const r = rng.next();
  if (r < 0.035) place(x, y, rng.chance(0.5) ? TILE.pino : TILE.roble);
  else if (r < 0.045) place(x, y, TILE.roca);
  else if (r < 0.07) place(x, y, TILE.arbusto, false);
});

// Despeja las zonas de aparicion para que no queden encerradas.
interface Spawn {
  mob: string;
  x: number;
  y: number;
  count: number;
  radius: number;
}
const spawns: Spawn[] = [
  { mob: 'lobo_gris', x: 14, y: 66, count: 2, radius: 3 },
  { mob: 'lobo_gris', x: 66, y: 40, count: 3, radius: 3 },
  { mob: 'lobo_gris', x: 78, y: 50, count: 3, radius: 3 },
  { mob: 'lobo_gris', x: 70, y: 58, count: 3, radius: 3 },
  { mob: 'esqueleto_arquero', x: 66, y: 14, count: 2, radius: 3 },
  { mob: 'esqueleto_arquero', x: 76, y: 20, count: 2, radius: 3 },
  { mob: 'esqueleto_arquero', x: 82, y: 12, count: 2, radius: 3 },
  { mob: 'cultista_vacio', x: 68, y: 76, count: 2, radius: 3 },
  { mob: 'cultista_vacio', x: 78, y: 78, count: 2, radius: 3 },
  { mob: 'cultista_vacio', x: 72, y: 86, count: 2, radius: 3 },
];
for (const s of spawns) {
  rect(s.x - s.radius, s.y - s.radius, s.x + s.radius, s.y + s.radius, (x, y) => {
    const i = idx(x, y);
    if (deco[i] === TILE.tienda || deco[i] === TILE.hoguera) return;
    if (deco[i] >= 0) deco[i] = -1;
    solid[i] = false;
  });
}

const gid = (t: number): number => (t < 0 ? 0 : t + 1);
const objects = [
  {
    id: 1,
    name: 'inicio',
    type: 'inicio',
    x: 31.5 * TILE_H,
    y: 50.5 * TILE_H,
    point: true,
    properties: [{ name: 'radio', type: 'float', value: 2 }],
  },
  {
    id: 2,
    name: 'cementerio',
    type: 'cementerio',
    x: 20.5 * TILE_H,
    y: 40.5 * TILE_H,
    point: true,
  },
  ...spawns.map((s, i) => ({
    id: 3 + i,
    name: s.mob,
    type: 'enemigos',
    x: (s.x + 0.5) * TILE_H,
    y: (s.y + 0.5) * TILE_H,
    point: true,
    properties: [
      { name: 'mob', type: 'string', value: s.mob },
      { name: 'cantidad', type: 'int', value: s.count },
      { name: 'radio', type: 'float', value: s.radius },
    ],
  })),
];

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'isometric',
  renderorder: 'right-down',
  width: W,
  height: H,
  tilewidth: TILE_W,
  tileheight: TILE_H,
  infinite: false,
  nextlayerid: 5,
  nextobjectid: objects.length + 1,
  tilesets: [
    {
      firstgid: 1,
      name: 'placeholders',
      // Imagen de referencia para Tiled; el cliente genera las baldosas por
      // codigo con los mismos indices (shared/tiles.ts).
      image: '../client/assets/tiles_placeholder.png',
      imagewidth: TILE_W * TILE_COUNT,
      imageheight: 64,
      tilewidth: TILE_W,
      tileheight: 64,
      tilecount: TILE_COUNT,
      columns: TILE_COUNT,
      margin: 0,
      spacing: 0,
    },
  ],
  layers: [
    {
      id: 1,
      name: 'suelo',
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: ground.map(gid),
    },
    {
      id: 2,
      name: 'decoracion',
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: deco.map(gid),
    },
    {
      id: 3,
      name: 'colision',
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 0.4,
      visible: false,
      data: solid.map((s) => (s ? gid(TILE.bloqueo) : 0)),
    },
    {
      id: 4,
      name: 'objetos',
      type: 'objectgroup',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      draworder: 'topdown',
      objects,
    },
  ],
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'maps', 'valle_alba.tmj');
writeFileSync(out, `${JSON.stringify(map)}\n`);
console.log(`Mapa escrito en ${out}`);
