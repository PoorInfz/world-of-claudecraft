/**
 * Cambio de paleta (palette swap). Las capas que dependen de la apariencia
 * (piel, pelo, ojos) se dibujan con COLORES CLAVE que no aparecen en ningun
 * otro sitio; al componer el personaje se sustituyen por los colores reales
 * con una tabla. Asi un mismo peinado sirve para los 16 colores de pelo y un
 * mismo cuerpo para los 10 tonos de piel, sin una hoja por combinacion.
 */

/** Rampa de 3 tonos: claro, medio, oscuro. */
export type Ramp = [string, string, string];

export const KEY = {
  skin: ['#ff00fe', '#e000de', '#c000be'] as Ramp,
  hair: ['#00fffe', '#00d0ce', '#00a09e'] as Ramp,
  eyes: '#fefe01',
} as const;

export function shade(hex: string, amt: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Rampa a partir del tono medio. */
export function rampOf(mid: string): Ramp {
  return [shade(mid, 22), mid, shade(mid, -30)];
}

function rgb(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

export interface PaletteMap {
  /** rgb clave -> rgb destino */
  map: Map<number, number>;
}

export function buildPalette(skin: string, hair: string, eyes: string): PaletteMap {
  const map = new Map<number, number>();
  const s = rampOf(skin);
  const h = rampOf(hair);
  for (let i = 0; i < 3; i++) {
    map.set(rgb(KEY.skin[i] as string), rgb(s[i] as string));
    map.set(rgb(KEY.hair[i] as string), rgb(h[i] as string));
  }
  map.set(rgb(KEY.eyes), rgb(eyes));
  return { map };
}

/** Sustituye en el lienzo los colores clave por los de la paleta (pixeles opacos). */
export function applyPalette(data: Uint8ClampedArray, pal: PaletteMap): void {
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] as number) === 0) continue;
    const key =
      ((data[i] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i + 2] as number);
    const to = pal.map.get(key);
    if (to === undefined) continue;
    data[i] = to >> 16;
    data[i + 1] = (to >> 8) & 255;
    data[i + 2] = to & 255;
  }
}
