// Buddy feature smoke test (manual verification run, not committed to the
// gate): summon, follow-trailing, visual swap, dismiss, console errors.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text());
});

console.log('navigating...');
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('nav done, waiting for #btn-offline...');
await page.waitForSelector('#btn-offline', { timeout: 30000 });
console.log('#btn-offline present, clicking through offline entry...');
await page.evaluate(() => document.querySelector('#btn-offline').click());
await new Promise((r) => setTimeout(r, 200));
await page.type('#char-name', 'BuddyTester');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
console.log('start-offline clicked, waiting for window.__game...');
await page.waitForFunction(() => !!window.__game && !!window.__game.sim && !!window.__game.sim.player, {
  timeout: 60000,
  polling: 250,
});
console.log('window.__game ready');

// /dev buddies: grant every catalog whistle in one shot.
const grant = await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.chat('/dev buddies');
  return sim.ownedBuddies();
});
console.log('/dev buddies granted:', JSON.stringify(grant));

const summonResult = await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.useItem('whistle_ember_fox');
  return { buddyKey: sim.player.buddyKey };
});
console.log('summon ember_fox:', JSON.stringify(summonResult));

// Let a few frames run so the visual attaches.
await new Promise((r) => setTimeout(r, 500));

const afterAttach = await page.evaluate(() => {
  const g = window.__game;
  const p = g.sim.player;
  const v = g.renderer.views.get(p.id);
  const hasVisual = !!v.buddyVisual;
  const buddyPos = hasVisual
    ? { x: v.buddyVisual.root.position.x, y: v.buddyVisual.root.position.y, z: v.buddyVisual.root.position.z }
    : null;
  const ownerPos = { x: v.group.position.x, y: v.group.position.y, z: v.group.position.z };
  const dist = buddyPos ? Math.hypot(buddyPos.x - ownerPos.x, buddyPos.z - ownerPos.z) : null;
  return { hasVisual, buddyVisualKey: v.buddyVisualKey, buddyPos, ownerPos, dist };
});
console.log('after attach:', JSON.stringify(afterAttach));
await page.screenshot({ path: 'tmp/buddy_1_idle.png' });

// Teleport the player far away (a big pos jump), then poll: the buddy should
// visibly lag then close the gap (trailing behavior), never teleport with it.
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.pos.x += 25;
  p.pos.z += 10;
  p.prevPos.x = p.pos.x;
  p.prevPos.z = p.pos.z;
});
const samples = [];
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 150));
  const s = await page.evaluate(() => {
    const g = window.__game;
    const p = g.sim.player;
    const v = g.renderer.views.get(p.id);
    const bp = v.buddyVisual.root.position;
    const op = v.group.position;
    return Math.hypot(bp.x - op.x, bp.z - op.z);
  });
  samples.push(Number(s.toFixed(2)));
}
console.log('distance samples while chasing (should start large, settle near ~2.3):', JSON.stringify(samples));
await page.screenshot({ path: 'tmp/buddy_2_chasing.png' });

// Swap to a different owned buddy: instant visual key change, no dismiss step.
const swap = await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.useItem('whistle_moss_hare');
  return { buddyKey: sim.player.buddyKey };
});
await new Promise((r) => setTimeout(r, 400));
const afterSwap = await page.evaluate(() => {
  const g = window.__game;
  const v = g.renderer.views.get(g.sim.player.id);
  return { buddyVisualKey: v.buddyVisualKey, hasVisual: !!v.buddyVisual };
});
console.log('swap to moss_hare:', JSON.stringify(swap), JSON.stringify(afterSwap));
await page.screenshot({ path: 'tmp/buddy_3_swapped.png' });

// Dismiss: click the whistle you're currently using again.
const dismiss = await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.useItem('whistle_moss_hare');
  return { buddyKey: sim.player.buddyKey };
});
await new Promise((r) => setTimeout(r, 400));
const afterDismiss = await page.evaluate(() => {
  const g = window.__game;
  const v = g.renderer.views.get(g.sim.player.id);
  return { buddyVisualKey: v.buddyVisualKey, hasVisual: !!v.buddyVisual };
});
console.log('dismiss:', JSON.stringify(dismiss), JSON.stringify(afterDismiss));
await page.screenshot({ path: 'tmp/buddy_4_dismissed.png' });

// Sweep every catalog buddy: summon each in turn and confirm its rig actually
// attaches (visualKey resolves, root exists), catching a bad GLB path/clip
// name the manifest entry alone can't catch.
const sweep = await page.evaluate(async (keys) => {
  const g = window.__game;
  const sim = g.sim;
  const results = [];
  for (const key of keys) {
    sim.useItem(`whistle_${key}`);
    await new Promise((r) => setTimeout(r, 300));
    const v = g.renderer.views.get(sim.player.id);
    results.push({
      key,
      buddyKey: sim.player.buddyKey,
      visualKey: v.buddyVisualKey,
      hasVisual: !!v.buddyVisual,
    });
    sim.useItem(`whistle_${key}`); // dismiss before the next one
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}, ['frog', 'crimson_claw_crab', 'golden_sentinel', 'nightfang', 'tuskhorn_boar', 'emerald_wolf', 'tiger', 'cate_coin', 'dragon']);
console.log('full catalog sweep:', JSON.stringify(sweep, null, 2));
await page.screenshot({ path: 'tmp/buddy_5_sweep_last.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page/console errors');
await browser.close();
