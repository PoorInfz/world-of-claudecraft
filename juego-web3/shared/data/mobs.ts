import type { MobDef } from './types.ts';

/**
 * Enemigos de la Fase 1: tres arquetipos con IA distinta (cuerpo a cuerpo
 * en manada, arquero que mantiene la distancia y lanzador que sana aliados).
 */
export const MOBS: Record<string, MobDef> = {
  lobo_gris: {
    id: 'lobo_gris',
    name: 'Lobo gris',
    family: 'bestia',
    ai: 'melee',
    level: 2,
    hp: 72,
    armor: 40,
    damage: { min: 3, max: 6, speed: 2.0, school: 'fisico' },
    range: 1.3,
    speed: 4.6,
    aggroRadius: 5,
    social: true,
    respawn: 25,
    loot: {
      copper: [3, 9],
      items: [
        { item: 'colmillo_lobo', chance: 0.55 },
        { item: 'piel_raida', chance: 0.35 },
        { item: 'botas_cazador', chance: 0.04 },
      ],
    },
    look: { body: 'quadruped', palette: 'lobo' },
  },
  esqueleto_arquero: {
    id: 'esqueleto_arquero',
    name: 'Esqueleto arquero',
    family: 'no_muerto',
    ai: 'ranged',
    level: 2,
    hp: 64,
    armor: 60,
    damage: { min: 4, max: 7, speed: 2.4, school: 'fisico' },
    range: 8,
    speed: 3.2,
    aggroRadius: 7,
    social: false,
    keepDistance: 4,
    respawn: 30,
    loot: {
      copper: [5, 12],
      items: [
        { item: 'hueso_antiguo', chance: 0.6 },
        { item: 'arco_astillado', chance: 0.12 },
        { item: 'amuleto_ambar', chance: 0.015 },
      ],
    },
    look: { body: 'humanoid', palette: 'esqueleto' },
  },
  cultista_vacio: {
    id: 'cultista_vacio',
    name: 'Cultista del vacío',
    family: 'humanoide',
    ai: 'caster',
    level: 3,
    hp: 80,
    armor: 30,
    damage: { min: 3, max: 5, speed: 2.2, school: 'fisico' },
    range: 9,
    speed: 3.4,
    aggroRadius: 6,
    social: true,
    spells: ['descarga_sombria', 'rezo_oscuro'],
    respawn: 30,
    loot: {
      copper: [8, 18],
      items: [
        { item: 'espada_oxidada', chance: 0.1 },
        { item: 'tunica_cultista', chance: 0.08 },
        { item: 'amuleto_ambar', chance: 0.02 },
      ],
    },
    look: { body: 'humanoid', palette: 'cultista' },
  },
};
