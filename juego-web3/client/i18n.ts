import type { ErrorCode } from '../shared/protocol.ts';

/**
 * Textos de la interfaz. Todo texto visible sale de aqui (o de los datos de
 * shared/data) para poder traducir el juego sin tocar la logica.
 */
export const ERRORS: Record<ErrorCode, string> = {
  fuera_alcance: 'Fuera de alcance',
  demasiado_cerca: 'Demasiado cerca',
  sin_recurso: 'No tienes suficiente recurso',
  en_reutilizacion: 'Aún no está listo',
  sin_objetivo: 'No tienes objetivo',
  objetivo_invalido: 'Objetivo no válido',
  no_puedes_ahora: 'No puedes hacer eso ahora',
  sin_linea: 'No está en tu línea de visión',
  botin_ajeno: 'Ese botín no es tuyo',
  inventario_lleno: 'Inventario lleno',
  nombre_invalido: 'Nombre no válido (3 a 12 letras)',
  nombre_en_uso: 'Ese nombre ya está en uso',
  clase_invalida: 'Clase no válida',
};

export const T = {
  resource: { ira: 'ira', mana: 'maná' } as Record<string, string>,
  instant: 'Instantáneo',
  castTime: (s: string) => `${s} s de lanzamiento`,
  cooldown: (s: string) => `Reutilización: ${s}`,
  range: (n: number) => `Alcance: ${n} baldosas`,
  meleeRange: 'Cuerpo a cuerpo',
  cost: (n: number, res: string) => `${n} de ${res}`,
  level: (n: number) => `Nivel ${n}`,
  miss: 'Fallo',
  dodge: 'Esquiva',
  received: (what: string) => `Recibes: ${what}`,
  coins: (s: string) => `Recibes ${s}`,
  dead: 'Has muerto',
  respawnIn: (s: number) => `Reapareces en ${s} s`,
  inventory: 'Bolsa',
  sellValue: (s: string) => `Valor de venta: ${s}`,
  zoneKind: {
    luz: 'Territorio de la Luz',
    sombra: 'Territorio de la Sombra',
    disputada: 'Zona disputada',
    jcj: 'Zona JcJ',
    neutral: 'Zona neutral',
  } as Record<string, string>,
  slot: {
    arma: 'Arma',
    cabeza: 'Cabeza',
    pecho: 'Pecho',
    piernas: 'Piernas',
    pies: 'Pies',
    manos: 'Manos',
    ninguno: '',
  } as Record<string, string>,
  stat: {
    str: 'Fuerza',
    agi: 'Agilidad',
    sta: 'Aguante',
    int: 'Intelecto',
    spi: 'Espíritu',
    armor: 'Armadura',
  } as Record<string, string>,
  minutes: (n: number) => `${n} min`,
  seconds: (n: string) => `${n} s`,
  ping: (ms: number) => `${ms} ms`,
  disconnected: 'Conexión perdida. Recarga la página para volver a entrar.',
  connecting: 'Conectando...',
  enter: 'Entrar al mundo',
  loot: 'Botín',
};

/** Numero con coma decimal (es-ES), sin ceros inutiles. */
export function fmt(n: number, decimals = 1): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals }).format(n);
}
