/**
 * Constantes compartidas por cliente y servidor. Cambiar una de estas cambia
 * el comportamiento en ambos lados a la vez, que es justo lo que queremos.
 */

/** Frecuencia de simulacion del servidor (ticks por segundo). */
export const TICK_RATE = 20;
/** Duracion de un tick en segundos. */
export const DT = 1 / TICK_RATE;

/** Resolucion base del render en pixeles de juego (se escala a enteros). */
export const BASE_WIDTH = 640;
export const BASE_HEIGHT = 360;

/** Tamano de una baldosa isometrica (rombo) en pixeles. */
export const TILE_W = 32;
export const TILE_H = 16;

/** Lado de una celda de interes (AOI) en baldosas. */
export const AOI_CELL = 16;
/** Celdas vecinas visibles en cada direccion (1 = rejilla de 3x3 celdas). */
export const AOI_RADIUS = 1;

/** Retardo de interpolacion de entidades remotas en el cliente (ms). */
export const INTERP_DELAY_MS = 100;

/** Distancia maxima (baldosas) para recoger un botin. */
export const LOOT_RANGE = 2;
/** Distancia de ataque cuerpo a cuerpo (baldosas). */
export const MELEE_RANGE = 1.4;

/** Limite de mensajes por segundo que acepta el servidor de un cliente. */
export const MAX_MSGS_PER_SEC = 40;

/** Segundos hasta reaparecer en el cementerio tras morir. */
export const RESPAWN_SECONDS = 5;

/** Ruta del WebSocket del juego. */
export const WS_PATH = '/ws';
/** Puerto por defecto del servidor de zona. */
export const DEFAULT_PORT = 8790;
