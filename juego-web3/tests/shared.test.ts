import { describe, expect, it } from 'vitest';
import {
  armorReduction,
  maxHpFor,
  maxResourceFor,
  rageConversion,
  rollMelee,
} from '../shared/combat.ts';
import { CLASSES } from '../shared/data/classes.ts';
import { dirFromWorldDelta, screenToWorld, worldToScreen } from '../shared/iso.ts';
import { formatCoins, splitCoins } from '../shared/money.ts';
import { validateName } from '../shared/names.ts';
import { findPath, hasLineOfSight } from '../shared/pathfinding.ts';
import { Rng } from '../shared/rng.ts';
import { parseClientMessage } from '../shared/validate.ts';
import { makeMap } from './helpers.ts';

describe('proyeccion isometrica', () => {
  it('ida y vuelta mundo <-> pantalla', () => {
    for (const [x, y] of [
      [0, 0],
      [3.25, 7.5],
      [50, 12],
    ]) {
      const s = worldToScreen(x as number, y as number);
      const w = screenToWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(x as number, 9);
      expect(w.y).toBeCloseTo(y as number, 9);
    }
  });

  it('direcciones de pantalla', () => {
    expect(dirFromWorldDelta(1, 1)).toBe(0); // +x+y = abajo en pantalla = S
    expect(dirFromWorldDelta(-1, -1)).toBe(4); // N
    expect(dirFromWorldDelta(1, -1)).toBe(6); // E
    expect(dirFromWorldDelta(-1, 1)).toBe(2); // O
    expect(dirFromWorldDelta(1, 0)).toBe(7); // SE
    expect(dirFromWorldDelta(0, 0, 3)).toBe(3);
  });
});

describe('busqueda de caminos', () => {
  it('rodea un muro sin cortar esquinas', () => {
    const walls: [number, number][] = [];
    for (let y = 0; y < 9; y++) walls.push([5, y]);
    const map = makeMap(12, 12, walls);
    const path = findPath(map, 2.5, 2.5, 8.5, 2.5);
    expect(path).not.toBeNull();
    const last = path?.[path.length - 1];
    expect(last?.x).toBeCloseTo(8.5);
    expect(last?.y).toBeCloseTo(2.5);
    // Ningun punto de la ruta cae en un muro y debe bajar hasta y >= 9 para rodearlo.
    expect(path?.some((p) => p.y >= 9)).toBe(true);
    for (const p of path ?? []) expect(map.blocked[Math.floor(p.y) * 12 + Math.floor(p.x)]).toBe(0);
  });

  it('null si el destino es inalcanzable', () => {
    const walls: [number, number][] = [];
    for (let y = 0; y < 12; y++) walls.push([5, y]);
    const map = makeMap(12, 12, walls);
    expect(findPath(map, 2.5, 2.5, 8.5, 2.5)).toBeNull();
  });

  it('la linea de vision la cortan los obstaculos', () => {
    const map = makeMap(10, 10, [[5, 5]]);
    expect(hasLineOfSight(map, 2.5, 5.5, 8.5, 5.5)).toBe(false);
    expect(hasLineOfSight(map, 2.5, 2.5, 8.5, 2.5)).toBe(true);
  });
});

describe('formulas de combate', () => {
  it('reduccion por armadura clasica', () => {
    // 400 de armadura contra nivel 1: 400 / (400 + 400 + 85) = 45.2%
    expect(armorReduction(400, 1)).toBeCloseTo(400 / 885, 6);
    expect(armorReduction(0, 10)).toBe(0);
    expect(armorReduction(1e6, 1)).toBe(0.75);
  });

  it('constante de ira a nivel 60 ~ 230.6', () => {
    expect(rageConversion(60)).toBeCloseTo(230.6, 0);
  });

  it('vida y recurso derivados de atributos', () => {
    const g = CLASSES.guerrero;
    expect(maxHpFor(g, g.base)).toBe(60 + 20 + 2 * 10);
    expect(maxResourceFor(g, g.base)).toBe(100);
    const m = CLASSES.mago;
    expect(maxResourceFor(m, m.base)).toBe(100 + 20 + 3 * 15);
  });

  it('la tabla de golpes respeta las probabilidades', () => {
    const rng = new Rng(7);
    const n = 20000;
    const counts = { miss: 0, dodge: 0, hit: 0, crit: 0 };
    for (let i = 0; i < n; i++) counts[rollMelee(rng, 1, 1, 0.1, true)]++;
    expect(counts.miss / n).toBeCloseTo(0.05, 1);
    expect(counts.dodge / n).toBeCloseTo(0.05, 1);
    expect(counts.crit / n).toBeCloseTo(0.1, 1);
  });
});

describe('dinero', () => {
  it('divide el cobre en oro, plata y cobre', () => {
    expect(splitCoins(123456)).toEqual({ gold: 12, silver: 34, copper: 56 });
    expect(formatCoins(7)).toBe('7c');
    expect(formatCoins(10007)).toBe('1o 0p 7c');
  });
});

describe('nombres', () => {
  it('acepta nombres validos y normaliza', () => {
    expect(validateName('aRiadna')).toEqual({ ok: true, name: 'Ariadna' });
    expect(validateName('Íñigo')).toEqual({ ok: true, name: 'Íñigo' });
  });
  it('rechaza nombres invalidos', () => {
    for (const bad of [
      'ab',
      'Nombredemasiadolargo',
      'Con espacio',
      'Num3ro',
      'Aaaron',
      'ElAdmin',
    ]) {
      expect(validateName(bad).ok).toBe(false);
    }
  });
});

describe('validacion de mensajes', () => {
  it('acepta mensajes bien formados', () => {
    expect(parseClientMessage('{"t":"move","x":3,"y":4}')).toEqual({ t: 'move', x: 3, y: 4 });
    expect(parseClientMessage('{"t":"cast","ab":"bola_fuego","id":7}')).toEqual({
      t: 'cast',
      ab: 'bola_fuego',
      id: 7,
    });
  });
  it('descarta basura y campos fuera de rango', () => {
    for (const bad of [
      'no json',
      '[]',
      '{"t":"move","x":"3","y":4}',
      '{"t":"move","x":1e9,"y":4}',
      '{"t":"attack","id":-1}',
      '{"t":"attack","id":1.5}',
      '{"t":"cast","ab":"no_existe"}',
      '{"t":"join","name":"Ana","cls":"paladin","fac":"luz"}',
      '{"t":"join","name":"Ana","cls":"mago","fac":"neutral"}',
      '{"t":"darme_oro","c":1000}',
      `{"t":"move","x":1,"y":1,"pad":"${'a'.repeat(600)}"}`,
    ]) {
      expect(parseClientMessage(bad)).toBeNull();
    }
  });
});
