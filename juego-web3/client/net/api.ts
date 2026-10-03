import type { AppearanceWire } from '../../shared/appearance.ts';
import type { ClassId } from '../../shared/data/types.ts';

/** Personaje tal como lo devuelve GET /api/personajes. */
export interface CharacterSummary {
  id: number;
  name: string;
  cls: ClassId;
  race: string;
  sex: string;
  faction: string;
  appearance: AppearanceWire;
  level: number;
  zone: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const TOKEN_KEY = 'luzysombra.token';

/** Cliente REST de cuentas y personajes. El token se recuerda en este navegador. */
export class Api {
  token: string | null = null;

  constructor() {
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  private remember(token: string | null): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Navegacion privada o almacenamiento bloqueado: solo dura esta pestana.
    }
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!r.ok) {
      if (r.status === 401 && path !== '/api/sesion') this.remember(null);
      throw new ApiError(String(data.error ?? 'error_interno'), r.status);
    }
    return data as T;
  }

  async register(usuario: string, clave: string): Promise<void> {
    const r = await this.call<{ token: string }>('POST', '/api/cuentas', { usuario, clave });
    this.remember(r.token);
  }

  async login(usuario: string, clave: string): Promise<void> {
    const r = await this.call<{ token: string }>('POST', '/api/sesion', { usuario, clave });
    this.remember(r.token);
  }

  async logout(): Promise<void> {
    await this.call('DELETE', '/api/sesion').catch(() => {});
    this.remember(null);
  }

  characters(): Promise<{ personajes: CharacterSummary[]; max: number }> {
    return this.call('GET', '/api/personajes');
  }

  async createCharacter(
    nombre: string,
    clase: ClassId,
    apariencia: AppearanceWire,
  ): Promise<CharacterSummary> {
    const r = await this.call<{ personaje: CharacterSummary }>('POST', '/api/personajes', {
      nombre,
      clase,
      apariencia,
    });
    return r.personaje;
  }

  async deleteCharacter(id: number): Promise<void> {
    await this.call('DELETE', `/api/personajes/${id}`);
  }
}
