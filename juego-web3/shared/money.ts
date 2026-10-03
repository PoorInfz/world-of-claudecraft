/**
 * Dinero: el servidor guarda todo en cobre (entero). 100 cobre = 1 plata,
 * 100 plata = 1 oro. El "oro" es la unidad que en la Fase 7 se podra
 * reclamar como token.
 */
export const COPPER_PER_SILVER = 100;
export const COPPER_PER_GOLD = 10000;

export interface Coins {
  gold: number;
  silver: number;
  copper: number;
}

export function splitCoins(totalCopper: number): Coins {
  const t = Math.max(0, Math.floor(totalCopper));
  return {
    gold: Math.floor(t / COPPER_PER_GOLD),
    silver: Math.floor((t % COPPER_PER_GOLD) / COPPER_PER_SILVER),
    copper: t % COPPER_PER_SILVER,
  };
}

/** Texto compacto: "1o 2p 3c" (omite las unidades a cero por delante). */
export function formatCoins(totalCopper: number): string {
  const c = splitCoins(totalCopper);
  const parts: string[] = [];
  if (c.gold) parts.push(`${c.gold}o`);
  if (c.gold || c.silver) parts.push(`${c.silver}p`);
  parts.push(`${c.copper}c`);
  return parts.join(' ');
}
