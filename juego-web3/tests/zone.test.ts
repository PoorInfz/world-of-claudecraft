import { describe, expect, it } from 'vitest';
import { LEASH_RANGE } from '../server/zone/ai.ts';
import type { LootEntity, MobEntity } from '../server/zone/entities.ts';
import { INVENTORY_SLOTS, STACK_SIZE } from '../server/zone/player.ts';
import { addToInventory, PLAYER_RESPAWN, Zone } from '../server/zone/zone.ts';
import { AURAS } from '../shared/data/abilities.ts';
import { MOBS } from '../shared/data/mobs.ts';
import type { EntityInit } from '../shared/protocol.ts';
import { addPlayer, makeMap, mobs, run } from './helpers.ts';

const wolfAt = (x: number, y: number) => ({ mob: 'lobo_gris', x, y, count: 1, radius: 0 });

function zoneWithWolf(x = 15.5, y = 5.5, size = 60): Zone {
  return new Zone('test', makeMap(size, size, [], [wolfAt(x, y)]), 42);
}

describe('movimiento autoritativo', () => {
  it('el jugador llega al destino a su velocidad', () => {
    const z = new Zone('test', makeMap(30, 30), 1);
    const { p } = addPlayer(z);
    z.queue(p.id, { t: 'move', x: 13.5, y: 5.5 });
    run(z, 1);
    // 4 baldosas/s durante ~1 s (el primer tick procesa la orden).
    expect(p.x).toBeGreaterThan(8.8);
    expect(p.x).toBeLessThan(9.6);
    run(z, 2);
    expect(p.x).toBeCloseTo(13.5, 5);
    expect(p.y).toBeCloseTo(5.5, 5);
  });

  it('enraizado no puede moverse', () => {
    const z = new Zone('test', makeMap(30, 30), 1);
    const { p, rec } = addPlayer(z);
    p.auras.push({ def: AURAS.congelado as never, left: 5, srcId: 0, tickAcc: 0 });
    z.queue(p.id, { t: 'move', x: 13.5, y: 5.5 });
    run(z, 1);
    expect(p.x).toBe(5.5);
    expect(rec.events()).toContainEqual({ e: 'err', code: 'no_puedes_ahora' });
  });

  it('no atraviesa muros (destino dentro de un muro -> casilla libre cercana)', () => {
    const walls: [number, number][] = [];
    for (let y = 0; y < 20; y++) walls.push([10, y]);
    const z = new Zone('test', makeMap(30, 30, walls), 1);
    const { p } = addPlayer(z);
    z.queue(p.id, { t: 'move', x: 15.5, y: 5.5 });
    run(z, 10);
    expect(p.x).toBeGreaterThan(10);
  });
});

describe('combate, muerte y botin', () => {
  it('matar un lobo deja un botin del jugador; recogerlo traslada el oro exacto', () => {
    const z = zoneWithWolf();
    const { p, rec } = addPlayer(z);
    p.hp = p.mhp = 10000; // que el lobo no lo mate
    const wolf = mobs(z)[0] as MobEntity;
    z.queue(p.id, { t: 'attack', id: wolf.id });
    run(z, 120, () => wolf.dead);
    expect(wolf.dead).toBe(true);
    expect(rec.events().some((e) => e.e === 'die' && e.id === wolf.id)).toBe(true);
    const loot = [...z.entities.values()].find((e) => e.kind === 'loot') as LootEntity | undefined;
    expect(loot).toBeDefined();
    if (!loot) return;
    expect(loot.ownerId).toBe(p.id);
    const copper = loot.copper;
    expect(copper).toBeGreaterThanOrEqual(MOBS.lobo_gris?.loot.copper[0] ?? 0);
    const before = p.gold;
    z.queue(p.id, { t: 'pickup', id: loot.id });
    run(z, 5, () => !z.entities.has(loot.id));
    expect(z.entities.has(loot.id)).toBe(false);
    expect(p.gold - before).toBe(copper);
    expect(rec.events()).toContainEqual(expect.objectContaining({ e: 'loot', c: copper }));
    // Recoger otra vez el mismo id no da nada.
    z.queue(p.id, { t: 'pickup', id: loot.id });
    run(z, 1);
    expect(p.gold - before).toBe(copper);
  });

  it('nadie puede recoger el botin de otro', () => {
    const z = zoneWithWolf();
    const { p } = addPlayer(z, 'Duena');
    const { p: thief, rec: thiefRec } = addPlayer(z, 'Ladron');
    p.hp = p.mhp = 10000;
    thief.hp = thief.mhp = 10000;
    const wolf = mobs(z)[0] as MobEntity;
    z.queue(p.id, { t: 'attack', id: wolf.id });
    run(z, 120, () => wolf.dead);
    const loot = [...z.entities.values()].find((e) => e.kind === 'loot') as LootEntity;
    z.teleport(thief, loot.x, loot.y);
    z.queue(thief.id, { t: 'pickup', id: loot.id });
    run(z, 1);
    expect(thief.gold).toBe(0);
    expect(z.entities.has(loot.id)).toBe(true);
    expect(thiefRec.events()).toContainEqual({ e: 'err', code: 'botin_ajeno' });
  });

  it('el jugador muerto reaparece en el cementerio con la vida llena', () => {
    const z = zoneWithWolf(7.5, 5.5);
    const { p } = addPlayer(z);
    p.hp = 1;
    run(z, 30, () => p.dead);
    expect(p.dead).toBe(true);
    run(z, PLAYER_RESPAWN + 0.2);
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(p.mhp);
    expect(p.x).toBeCloseTo(z.map.graveyard.x);
    expect(p.y).toBeCloseTo(z.map.graveyard.y);
  });

  it('el enemigo abandona la persecucion lejos de casa y vuelve curado', () => {
    const z = zoneWithWolf(10.5, 5.5, 80);
    const { p } = addPlayer(z);
    p.hp = p.mhp = 100000;
    const wolf = mobs(z)[0] as MobEntity;
    z.queue(p.id, { t: 'attack', id: wolf.id });
    run(z, 3);
    expect(wolf.state).toBe('combat');
    wolf.hp = 10;
    // Huir lejos (teletransporte de prueba, mas alla de la correa).
    z.teleport(p, 10.5 + LEASH_RANGE + 20, 70);
    z.queue(p.id, { t: 'stop' });
    run(z, 30, () => wolf.state === 'idle');
    expect(wolf.state).toBe('idle');
    expect(wolf.hp).toBe(wolf.mhp);
    expect(Math.hypot(wolf.x - wolf.homeX, wolf.y - wolf.homeY)).toBeLessThan(1.6);
  });

  it('el enemigo reaparece tras su tiempo de respawn', () => {
    const z = zoneWithWolf();
    const wolf = mobs(z)[0] as MobEntity;
    z.kill(wolf, null);
    run(z, (MOBS.lobo_gris?.respawn ?? 0) + 1);
    const alive = mobs(z).filter((m) => !(m as MobEntity).dead);
    expect(alive.length).toBe(1);
    expect(alive[0]?.id).not.toBe(wolf.id);
  });
});

describe('habilidades', () => {
  it('un guerrero no puede usar hechizos de mago', () => {
    const z = zoneWithWolf(8.5, 5.5);
    const { p, rec } = addPlayer(z);
    z.queue(p.id, { t: 'cast', ab: 'bola_fuego', id: mobs(z)[0]?.id });
    run(z, 0.2);
    expect(rec.events()).toContainEqual({ e: 'err', code: 'objetivo_invalido' });
  });

  it('sin recurso suficiente no se lanza', () => {
    const z = zoneWithWolf(8.5, 5.5);
    const { p, rec } = addPlayer(z);
    p.res = 0; // ira a cero
    z.queue(p.id, { t: 'cast', ab: 'torbellino' });
    run(z, 0.2);
    expect(rec.events()).toContainEqual({ e: 'err', code: 'sin_recurso' });
  });

  it('la bola de fuego viaja, hace dano y aplica la quemadura; el mana se gasta', () => {
    const z = zoneWithWolf(12.5, 5.5);
    const { p, rec } = addPlayer(z, 'Maga', 'mago');
    const wolf = mobs(z)[0] as MobEntity;
    const mana = p.res;
    z.queue(p.id, { t: 'cast', ab: 'bola_fuego', id: wolf.id });
    run(z, 0.3);
    expect(p.cast?.ability.id).toBe('bola_fuego');
    run(z, 2.5, () => rec.events().some((e) => e.e === 'dmg' && e.ab === 'bola_fuego'));
    expect(p.res).toBe(mana - 30);
    const hit = rec.events().find((e) => e.e === 'dmg' && e.ab === 'bola_fuego');
    expect(hit).toBeDefined();
    if (hit && hit.e === 'dmg' && hit.r !== 'miss') {
      expect(wolf.hp).toBeLessThan(wolf.mhp);
      expect(wolf.auras.some((a) => a.def.id === 'quemadura')).toBe(true);
    }
  });

  it('moverse cancela el lanzamiento y no gasta mana', () => {
    const z = zoneWithWolf(12.5, 5.5);
    const { p } = addPlayer(z, 'Maga', 'mago');
    const wolf = mobs(z)[0] as MobEntity;
    const mana = p.res;
    z.queue(p.id, { t: 'cast', ab: 'bola_fuego', id: wolf.id });
    run(z, 0.5);
    z.queue(p.id, { t: 'move', x: 5.5, y: 9.5 });
    run(z, 2);
    expect(p.cast).toBeNull();
    expect(p.res).toBe(mana);
    expect(wolf.hp).toBe(wolf.mhp);
  });

  it('la reutilizacion impide repetir la nova', () => {
    const z = zoneWithWolf(7, 5.5);
    const { p, rec } = addPlayer(z, 'Maga', 'mago');
    z.queue(p.id, { t: 'cast', ab: 'nova_escarcha' });
    run(z, 2);
    z.queue(p.id, { t: 'cast', ab: 'nova_escarcha' });
    run(z, 0.2);
    expect(rec.events()).toContainEqual({ e: 'err', code: 'en_reutilizacion' });
    const wolf = mobs(z)[0] as MobEntity;
    expect(wolf.auras.some((a) => a.def.id === 'congelado') || wolf.hp === wolf.mhp).toBe(true);
  });

  it('fuera de alcance, el jugador se acerca solo y lanza', () => {
    const z = zoneWithWolf(25.5, 5.5);
    const { p, rec } = addPlayer(z, 'Maga', 'mago');
    const wolf = mobs(z)[0] as MobEntity;
    z.queue(p.id, { t: 'cast', ab: 'bola_fuego', id: wolf.id });
    run(z, 8, () => p.cast !== null);
    expect(p.cast?.ability.id).toBe('bola_fuego');
    expect(Math.hypot(p.x - wolf.x, p.y - wolf.y)).toBeLessThanOrEqual(11.01);
    expect(rec.events().some((e) => e.e === 'err')).toBe(false);
  });

  it('el parpadeo no atraviesa muros', () => {
    const walls: [number, number][] = [];
    for (let y = 0; y < 20; y++) walls.push([8, y]);
    const z = new Zone('test', makeMap(30, 30, walls), 1);
    const { p } = addPlayer(z, 'Maga', 'mago');
    z.queue(p.id, { t: 'cast', ab: 'parpadeo', x: 11.5, y: 5.5 });
    run(z, 0.2);
    expect(p.x).toBeLessThan(8);
    expect(p.x).toBeGreaterThan(7.5);
  });
});

describe('area de interes', () => {
  it('solo se envian las entidades cercanas', () => {
    const z = new Zone('test', makeMap(200, 200), 1);
    const { p: a, rec: recA } = addPlayer(z, 'Cerca');
    const { p: b } = addPlayer(z, 'Lejos');
    const { p: c } = addPlayer(z, 'Vecina');
    z.teleport(b, 150, 150);
    z.teleport(c, 8, 8);
    run(z, 0.1);
    const added = recA.snaps().flatMap((s) => s.add ?? []) as EntityInit[];
    const ids = added.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(b.id);
    // Al alejarse, la vecina se da de baja.
    const before = recA.snaps().length;
    z.teleport(c, 150, 140);
    run(z, 0.1);
    const rems = recA
      .snaps()
      .slice(before)
      .flatMap((s) => s.rem ?? []);
    expect(rems).toContain(c.id);
  });

  it('las entidades quietas no se reenvian', () => {
    const z = new Zone('test', makeMap(40, 40), 1);
    const { rec } = addPlayer(z, 'Quieta');
    run(z, 0.5);
    const last = rec.last();
    expect(last?.upd).toBeUndefined();
    expect(last?.me).toBeDefined();
  });
});

describe('inventario', () => {
  it('apila y nunca anade a medias', () => {
    const inv: { item: string; qty: number }[] = [];
    expect(addToInventory(inv, 'colmillo_lobo', 25)).toBe(true);
    expect(inv).toEqual([
      { item: 'colmillo_lobo', qty: STACK_SIZE },
      { item: 'colmillo_lobo', qty: 25 - STACK_SIZE },
    ]);
    while (inv.length < INVENTORY_SLOTS) inv.push({ item: 'hueso_antiguo', qty: STACK_SIZE });
    const snapshot = JSON.stringify(inv);
    // Quedan 15 huecos en la pila de colmillos: 16 no caben y no se toca nada.
    expect(addToInventory(inv, 'colmillo_lobo', 16)).toBe(false);
    expect(JSON.stringify(inv)).toBe(snapshot);
    expect(addToInventory(inv, 'colmillo_lobo', 15)).toBe(true);
  });
});

describe('determinismo', () => {
  it('misma semilla y mismas ordenes = mismo resultado', () => {
    const play = (): string => {
      const z = zoneWithWolf(9.5, 5.5);
      const { p } = addPlayer(z);
      const wolf = mobs(z)[0] as MobEntity;
      z.queue(p.id, { t: 'attack', id: wolf.id });
      run(z, 20);
      return JSON.stringify({
        p: [p.x, p.y, p.hp, p.res, p.gold],
        w: [wolf.x, wolf.y, wolf.hp, wolf.dead],
      });
    };
    expect(play()).toBe(play());
  });
});
