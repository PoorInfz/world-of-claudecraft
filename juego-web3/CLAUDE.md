# juego-web3 (Luz y Sombra)

Proyecto autónomo: MMORPG 2D pixel art con servidor autoritativo y cliente Phaser 3.
No comparte código ni dependencias con el juego principal del repo; tiene su propio
`package.json` (instala con `pnpm install` dentro de esta carpeta).

## Reglas locales
- `shared/` no importa nada de `client/` ni `server/`, ni usa DOM o APIs de Node.
- Toda la lógica de juego vive en el servidor (`server/zone/`); el cliente solo envía
  intenciones (`shared/protocol.ts`) y refleja instantáneas.
- Aleatoriedad de juego solo con `Rng` (`shared/rng.ts`), nunca `Math.random`.
- Contenido nuevo (habilidad, aura, enemigo, objeto, zona) = un registro en
  `shared/data/`, no código nuevo en la zona.
- Textos visibles: en `client/i18n.ts` o en los campos `name`/`description` de los datos.
  El servidor envía códigos (`ErrorCode`), nunca frases.
- Arte: los placeholders se generan en `client/gfx/` con la rejilla de
  `client/gfx/pose.ts` (8 direcciones x 24 fotogramas de 32x40).
- Toda lógica de oro, botín y (más adelante) claim lleva tests; ninguna operación
  puede crear o duplicar oro.
- Persistencia solo a través del contrato `server/db/store.ts`; cualquier cambio se
  implementa en `PgStore` y `MemoryStore` y se cubre en `tests/store.test.ts`
  (`npm run test:pg` lo ejecuta contra PostgreSQL). Esquema: solo cambios aditivos.
- Personajes jugadores: capas en `client/gfx/paperdoll/`, todas desde `geometry()`.
  Colores dependientes de la apariencia, solo con las claves de `palette.ts`.

## Comandos
- `npm run dev`: servidor (:8790, almacén en memoria) + cliente (:5180).
- `npm run db:up` y `npm run dev:pg`: lo mismo con PostgreSQL en Docker.
- `npm test`, `npm run typecheck`, `npm run build`.
