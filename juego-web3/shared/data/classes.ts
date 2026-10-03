import type { ClassDef, ClassId } from './types.ts';

/**
 * Clases jugables. Valores base inspirados en los de nivel 1 de los MMO
 * clasicos (vida base, atributos iniciales, arma inicial).
 */
export const CLASSES: Record<ClassId, ClassDef> = {
  guerrero: {
    id: 'guerrero',
    name: 'Guerrero',
    description: 'Combatiente cuerpo a cuerpo con armadura pesada. Tanque o daño. Usa ira.',
    resource: 'ira',
    maxResource: 100,
    base: { str: 23, agi: 20, sta: 22, int: 20, spi: 20, armor: 60 },
    baseHp: 60,
    weapon: { min: 5, max: 9, speed: 2.4, range: 1.4, school: 'fisico' },
    abilities: [
      'tajo_brutal',
      'carga',
      'torbellino',
      'tajo_tendon',
      'grito_guerra',
      'defensa_ferrea',
    ],
    speed: 4,
  },
  mago: {
    id: 'mago',
    name: 'Mago',
    description:
      'Lanzador a distancia de fuego, escarcha y arcano. Controla a sus enemigos. Usa maná.',
    resource: 'mana',
    maxResource: 100,
    base: { str: 20, agi: 20, sta: 20, int: 23, spi: 22, armor: 20 },
    baseHp: 50,
    weapon: { min: 3, max: 6, speed: 2.9, range: 1.4, school: 'fisico' },
    abilities: [
      'bola_fuego',
      'descarga_escarcha',
      'nova_escarcha',
      'explosion_arcana',
      'parpadeo',
      'armadura_escarcha',
    ],
    speed: 4,
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
