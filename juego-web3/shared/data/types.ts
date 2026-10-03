/**
 * Tipos del contenido data-driven. Todo el contenido del juego (facciones,
 * clases, habilidades, enemigos, objetos, zonas) se declara en este directorio
 * como datos; la logica del servidor y el cliente solo lo interpreta.
 */

export type FactionId = 'luz' | 'sombra';
export type ClassId = 'guerrero' | 'mago';
export type ResourceKind = 'ira' | 'mana';
export type School = 'fisico' | 'fuego' | 'hielo' | 'sombra' | 'naturaleza' | 'arcano';
export type Rarity = 'comun' | 'poco_comun' | 'raro' | 'epico' | 'legendario';

export interface FactionDef {
  id: FactionId;
  /** Nombre visible, editable sin tocar la logica. */
  name: string;
  /** Descripcion corta de su moral. */
  motto: string;
  /** Colores RGB (0xRRGGBB) de la identidad visual. */
  colors: { primary: number; secondary: number; accent: number; dark: number };
}

export interface BaseStats {
  str: number;
  agi: number;
  sta: number;
  int: number;
  spi: number;
  armor: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Resumen del rol para el creador de personajes. */
  description: string;
  resource: ResourceKind;
  /** Ira: maximo fijo. Mana: mana base antes del intelecto. */
  maxResource: number;
  base: BaseStats;
  /** Vida base a nivel 1 antes del aguante. */
  baseHp: number;
  /** Arma inicial: dano min/max y velocidad (segundos por golpe). */
  weapon: { min: number; max: number; speed: number; range: number; school: School };
  /** Habilidades en la barra de accion, en orden de tecla (1..6). */
  abilities: string[];
  /** Velocidad de movimiento en baldosas por segundo. */
  speed: number;
}

/** Efecto de una habilidad. Las habilidades combinan varios efectos. */
export type EffectDef =
  | { kind: 'damage'; school: School; min: number; max: number; weaponMult?: number }
  | { kind: 'heal'; min: number; max: number }
  | { kind: 'aura'; aura: string }
  | { kind: 'resource'; amount: number }
  | { kind: 'charge' }
  | { kind: 'blink'; distance: number };

export type TargetMode =
  | 'enemy' // requiere objetivo enemigo
  | 'ally' // aliado herido (lo usa la IA sanadora)
  | 'self' // sobre uno mismo
  | 'self_aoe' // area centrada en el lanzador
  | 'point'; // punto del suelo (p. ej. parpadeo)

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: TargetMode;
  cost: number;
  /** Tiempo de lanzamiento en segundos (0 = instantaneo). */
  castTime: number;
  cooldown: number;
  /** Alcance maximo en baldosas. */
  range: number;
  /** Alcance minimo (carga). */
  minRange?: number;
  /** Radio del area (self_aoe). */
  radius?: number;
  /** Si viaja como proyectil, su velocidad en baldosas por segundo. */
  projectileSpeed?: number;
  /** Activa el tiempo de reutilizacion global (1.5 s). */
  gcd: boolean;
  effects: EffectDef[];
  /** Amenaza extra generada. */
  threat?: number;
}

/** Aura (beneficio o perjuicio) temporal. */
export interface AuraDef {
  id: string;
  name: string;
  description: string;
  duration: number;
  harmful: boolean;
  /** Multiplicador de velocidad de movimiento (0.5 = ralentiza un 50%). */
  speedMult?: number;
  /** Impide moverse. */
  root?: boolean;
  /** Impide moverse, atacar y lanzar. */
  stun?: boolean;
  /** Poder de ataque plano. */
  attackPower?: number;
  /** Armadura plana. */
  armor?: number;
  /** Multiplicador de dano recibido (0.8 = -20%). */
  damageTakenMult?: number;
  /** Dano periodico cada 'tickEvery' segundos. */
  dot?: { school: School; amount: number; tickEvery: number };
}

export type MobAi = 'melee' | 'ranged' | 'caster';

export interface MobDef {
  id: string;
  name: string;
  family: 'bestia' | 'no_muerto' | 'humanoide';
  ai: MobAi;
  level: number;
  hp: number;
  armor: number;
  /** Dano por golpe y velocidad. */
  damage: { min: number; max: number; speed: number; school: School };
  /** Alcance del ataque basico en baldosas. */
  range: number;
  speed: number;
  /** Radio de agresion en baldosas. */
  aggroRadius: number;
  /** Ayuda a aliados cercanos de su misma especie. */
  social: boolean;
  /** Habilidades especiales (ids de AbilityDef) que usa la IA. */
  spells?: string[];
  /** Distancia que intenta mantener (arqueros). */
  keepDistance?: number;
  respawn: number;
  loot: LootTable;
  /** Paleta y forma del placeholder. */
  look: { body: 'quadruped' | 'humanoid'; palette: string };
}

export interface LootTable {
  /** Monedas en cobre (min, max). */
  copper: [number, number];
  /** Objetos con probabilidad independiente. */
  items: { item: string; chance: number }[];
}

export type ItemSlot = 'arma' | 'cabeza' | 'pecho' | 'piernas' | 'pies' | 'manos' | 'ninguno';

export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  slot: ItemSlot;
  /** Valor de venta en cobre. */
  value: number;
  stats?: Partial<BaseStats>;
  description?: string;
  icon: string;
}

export interface SpawnDef {
  mob: string;
  x: number;
  y: number;
  count: number;
  radius: number;
}
