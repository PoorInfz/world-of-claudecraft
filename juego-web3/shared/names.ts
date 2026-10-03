/**
 * Validacion de nombres de personaje. Se ejecuta en el cliente (respuesta
 * rapida) y SIEMPRE en el servidor (autoridad).
 */
const NAME_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,12}$/;

/** Lista minima de terminos prohibidos (se ampliara con un filtro real). */
const BANNED = ['admin', 'moderador', 'gm', 'puta', 'mierda', 'nazi', 'fuck', 'shit'];

/** Normaliza: primera letra mayuscula, resto minusculas. */
export function normalizeName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase('es') + s.slice(1).toLocaleLowerCase('es');
}

export function validateName(raw: string): { ok: true; name: string } | { ok: false } {
  const name = normalizeName(raw);
  if (!NAME_RE.test(name)) return { ok: false };
  const lower = name.toLocaleLowerCase('es');
  if (BANNED.some((b) => lower.includes(b))) return { ok: false };
  // Evita repeticiones absurdas tipo "Aaaaaa".
  if (/(.)\1\1/i.test(name)) return { ok: false };
  return { ok: true, name };
}
