import type { BaseStats, ClassDef, School } from './data/types.ts';
import type { Rng } from './rng.ts';

/**
 * Formulas de combate puras (sin estado), inspiradas en las de los MMO
 * clasicos. Las usan el servidor (autoritativo) y el cliente (tooltips).
 */

export type HitResult = 'miss' | 'dodge' | 'hit' | 'crit';

/** Reduccion de dano por armadura: armadura / (armadura + 400 + 85 * nivel atacante), max 75%. */
export function armorReduction(armor: number, attackerLevel: number): number {
  if (armor <= 0) return 0;
  const r = armor / (armor + 400 + 85 * attackerLevel);
  return Math.min(0.75, r);
}

/** Constante de conversion de ira por nivel. */
export function rageConversion(level: number): number {
  return 0.0091107836 * level * level + 3.225598133 * level + 4.2652911;
}

/** Ira generada al infligir dano cuerpo a cuerpo. */
export function rageFromDealt(damage: number, level: number): number {
  return (7.5 * damage) / rageConversion(level);
}

/** Ira generada al recibir dano. */
export function rageFromTaken(damage: number, level: number): number {
  return (2.5 * damage) / rageConversion(level);
}

/** Vida maxima: los primeros 20 de aguante dan 1 de vida cada uno, el resto 10. */
export function maxHpFor(cls: ClassDef, stats: BaseStats): number {
  const sta = stats.sta;
  const fromSta = sta <= 20 ? sta : 20 + (sta - 20) * 10;
  return cls.baseHp + fromSta;
}

/** Mana maximo: los primeros 20 de intelecto dan 1, el resto 15. Ira siempre 100. */
export function maxResourceFor(cls: ClassDef, stats: BaseStats): number {
  if (cls.resource !== 'mana') return cls.maxResource;
  const int = stats.int;
  const fromInt = int <= 20 ? int : 20 + (int - 20) * 15;
  return cls.maxResource + fromInt;
}

/** Poder de ataque cuerpo a cuerpo segun la clase. */
export function attackPowerFor(cls: ClassDef, stats: BaseStats, level: number): number {
  if (cls.id === 'guerrero') return Math.max(0, level * 3 + stats.str * 2 - 20);
  return Math.max(0, stats.str - 10);
}

/** Dano de un golpe de arma con poder de ataque: base + PA / 14 * velocidad. */
export function weaponHit(rng: Rng, min: number, max: number, speed: number, ap: number): number {
  return rng.int(min, max) + (ap / 14) * speed;
}

/** Regeneracion de mana cada 2 s fuera de la regla de los 5 segundos. */
export function manaRegenPer2s(spi: number): number {
  return 13 + spi / 4;
}

/** Regeneracion de vida cada 2 s fuera de combate. */
export function hpRegenPer2s(spi: number, level: number): number {
  return Math.max(1, spi / 4 + level);
}

/** Tirada sobre la tabla de golpes cuerpo a cuerpo (o a distancia fisico). */
export function rollMelee(
  rng: Rng,
  attackerLevel: number,
  defenderLevel: number,
  critChance: number,
  defenderCanDodge: boolean,
): HitResult {
  const levelGap = Math.max(0, defenderLevel - attackerLevel);
  const miss = 0.05 + levelGap * 0.005;
  const dodge = defenderCanDodge ? 0.05 + levelGap * 0.005 : 0;
  const r = rng.next();
  if (r < miss) return 'miss';
  if (r < miss + dodge) return 'dodge';
  if (r < miss + dodge + critChance) return 'crit';
  return 'hit';
}

/** Tirada de hechizo: fallo base 4% + 1% por nivel de diferencia, critico 5%. */
export function rollSpell(rng: Rng, attackerLevel: number, defenderLevel: number): HitResult {
  const miss = Math.min(0.4, 0.04 + Math.max(0, defenderLevel - attackerLevel) * 0.01);
  const r = rng.next();
  if (r < miss) return 'miss';
  if (r < miss + 0.05) return 'crit';
  return 'hit';
}

/** Probabilidad de critico cuerpo a cuerpo: 5% + agilidad / 20 %. */
export function meleeCritChance(agi: number): number {
  return 0.05 + agi / 20 / 100;
}

/** Multiplicador de critico. */
export function critMultiplier(school: School): number {
  return school === 'fisico' ? 2 : 1.5;
}

/** Aplica la armadura solo al dano fisico. */
export function mitigate(
  damage: number,
  school: School,
  armor: number,
  attackerLevel: number,
): number {
  if (school !== 'fisico') return damage;
  return damage * (1 - armorReduction(armor, attackerLevel));
}
