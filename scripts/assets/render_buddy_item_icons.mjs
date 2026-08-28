// Renders the bag-icon WebP for every buddy whistle item straight from the
// buddy's own shipped GLB (public/models/buddies/*.glb, or the shared
// Quaternius fox.glb tinted per species for ember_fox/moss_hare) — no
// text-to-image generation, no internet reference art. Reuses the
// asset-pipeline's generic headless preview renderer (hero turntable view:
// auto-framed bounding sphere, no weapon-specific tilt).
//
// preview_entry.js's GLTFLoader has no KTX2Loader wired, so every
// KTX2-compressed buddy GLB (public/models/CLAUDE.md's compression truth)
// gets ktxdecompress'd to a throwaway temp copy first; the committed .glb
// files themselves are never touched.
//
// Usage: node scripts/assets/render_buddy_item_icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { closePreview, renderThumb } from '../asset_pipeline/lib/preview.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/ui/items');
const TMP_DIR = path.join(ROOT, 'tmp/buddy_icons');
mkdirSync(TMP_DIR, { recursive: true });

export const BUDDY_ICON_BATCH = [
  { itemId: 'whistle_ember_fox', glb: 'public/models/creatures/fox.glb', tint: [0xd9, 0x66, 0x2b] },
  { itemId: 'whistle_moss_hare', glb: 'public/models/creatures/fox.glb', tint: [0x6f, 0x8f, 0x5a] },
  { itemId: 'whistle_frog', glb: 'public/models/buddies/frog.glb' },
  { itemId: 'whistle_crimson_claw_crab', glb: 'public/models/buddies/crimson_claw_crab.glb' },
  { itemId: 'whistle_golden_sentinel', glb: 'public/models/buddies/golden_sentinel.glb' },
  { itemId: 'whistle_nightfang', glb: 'public/models/buddies/nightfang.glb' },
  { itemId: 'whistle_tuskhorn_boar', glb: 'public/models/buddies/tuskhorn_boar.glb' },
  { itemId: 'whistle_emerald_wolf', glb: 'public/models/buddies/emerald_wolf.glb' },
  { itemId: 'whistle_tiger', glb: 'public/models/buddies/tiger.glb' },
  { itemId: 'whistle_cate_coin', glb: 'public/models/buddies/cate_coin.glb' },
  { itemId: 'whistle_dragon', glb: 'public/models/buddies/dragon.glb' },
  { itemId: 'whistle_alon', glb: 'public/models/buddies/alon.glb' },
  { itemId: 'whistle_trollface', glb: 'public/models/buddies/trollface.glb' },
  { itemId: 'whistle_ansem', glb: 'public/models/buddies/ansem.glb' },
  { itemId: 'whistle_triple_t', glb: 'public/models/buddies/triple_t.glb' },
  { itemId: 'whistle_kekius', glb: 'public/models/buddies/kekius.glb' },
  { itemId: 'whistle_solbot', glb: 'public/models/buddies/solbot.glb' },
  { itemId: 'whistle_frostfire', glb: 'public/models/buddies/frostfire.glb' },
  { itemId: 'whistle_rocky', glb: 'public/models/buddies/rocky.glb' },
];

async function renderOne({ itemId, glb, tint }) {
  const needsKtxDecode = glb.includes('/buddies/'); // fox.glb ships uncompressed
  const sourceGlb = path.join(ROOT, glb);
  let renderSource = sourceGlb;
  if (needsKtxDecode) {
    renderSource = path.join(TMP_DIR, `${itemId}_decoded.glb`);
    execFileSync(
      'npx',
      ['--no-install', 'gltf-transform', 'ktxdecompress', sourceGlb, renderSource],
      { stdio: 'inherit', shell: true },
    );
  }
  const tmpPng = path.join(TMP_DIR, `${itemId}.png`);
  await renderThumb(renderSource, tmpPng, { size: 320 });
  let img = sharp(tmpPng).resize(128, 128, { fit: 'cover' });
  if (tint) img = img.tint({ r: tint[0], g: tint[1], b: tint[2] });
  const dest = path.join(OUT_DIR, `${itemId}.webp`);
  await img.webp({ quality: 90 }).toFile(dest);
  console.log(`✓ ${itemId}.webp`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  for (const entry of BUDDY_ICON_BATCH) await renderOne(entry);
  await closePreview();
  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`\nrendered ${BUDDY_ICON_BATCH.length} buddy icons -> ${OUT_DIR}`);
}
