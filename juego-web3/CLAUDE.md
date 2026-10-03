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
  `client/gfx/characters.ts` (8 direcciones x 24 fotogramas de 32x40).
- Toda lógica de oro, botín y (más adelante) claim lleva tests; ninguna operación
  puede crear o duplicar oro.

## Comandos
- `npm run dev`: servidor (:8790) + cliente (:5180).
- `npm test`, `npm run typecheck`, `npm run build`.
