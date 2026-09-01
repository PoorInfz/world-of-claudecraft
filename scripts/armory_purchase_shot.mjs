// One-off local capture tool for the Armory purchase decision: opens the WOC
// Store, inspects a purchasable weapon skin (the body-level armory inspect
// overlay, z 90), clicks its Purchase Skin action, and shoots the full frame on
// desktop and mobile landscape. This is the evidence pair for the v0.41.0
// regression where the Store decision mounted into #prompt-stack (inside #ui, a
// fixed z-index 10 stacking context) and so opened invisibly UNDER the
// inspector while the Store and the inspector both sat inert: the before frame
// shows a dark, frozen-looking overlay with no dialog, the after frame shows
// the confirm painted above it.
//
// Same stub rationale as scripts/charter_store_shot.mjs: the WOC Store does not
// exist offline (src/main.ts builds claudiumHooks inside its `if (online)` arm),
// so the rig attaches stub hooks itself; the decision consumes only the balance
// and store snapshot, and no spend is ever confirmed.
//
// Dev-only, not wired into any npm script or CI gate. Needs a vite dev client.
// Captures on the LOW graphics preset (standing repo rule for screenshots).
//
// Usage:
//   GAME_URL=http://localhost:5173 node scripts/armory_purchase_shot.mjs
//   SHOT_PREFIX=before  names the frames for the base-commit capture
//   (default 'after'); SHOTS_DIR overrides the output directory.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { dismissEntryOverlays, enterOfflineGame } from './enter_offline_game.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';

const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5173';
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Screenshot-only CLI input is not a Turbo task dependency.
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots/armory-purchase-decision';
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Screenshot-only CLI input is not a Turbo task dependency.
const PREFIX = process.env.SHOT_PREFIX ?? 'after';
fs.mkdirSync(OUT, { recursive: true });

const uniq = Date.now().toString(36).slice(-6);

const MOBILE_VIEWPORT = {
  width: 844,
  height: 390,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

async function launchBrowser(mobile) {
  return puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 180000,
    userDataDir: `/tmp/claude-1000/armory-shot-profile-${uniq}-${mobile ? 'm' : 'd'}`,
    args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: mobile ? MOBILE_VIEWPORT : { width: 1600, height: 900, deviceScaleFactor: 1 },
  });
}

/** Seed the LOW graphics preset before any app code runs (the pr_shot_targets
 *  idiom): graphicsPreset 1 is LOW, and graphicsDefaultApplied stops the
 *  first-boot auto-detect from overwriting it. */
async function seedLowGraphics(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      const s = JSON.parse(localStorage.getItem('woc_settings') || '{}');
      s.graphicsPreset = 1;
      s.graphicsDefaultApplied = true;
      localStorage.setItem('woc_settings', JSON.stringify(s));
    } catch {}
  });
}

async function awaitWorldPainted(page) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('loading-screen');
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
    },
    { timeout: 120000 },
  );
}

/** Same dismissal as the charter rig: the compulsory tutorial greeting paints
 *  over the store and is unrelated to what this rig evidences. */
async function dismissTutorialDialog(page) {
  await page.evaluate(() => {
    const dlg = document.getElementById('tutorial-greeting');
    if (!dlg || getComputedStyle(dlg).display === 'none') return;
    const btn = [...dlg.querySelectorAll('button')].at(-1);
    if (btn) btn.click();
    else dlg.style.display = 'none';
  });
  await new Promise((r) => setTimeout(r, 400));
}

/** Attach stub ClaudiumHooks pricing every painted skin, so the armory shows a
 *  healthy purchasable catalog (the charter rig's two-pass idiom). */
async function attachStubHooks(page, skinIds) {
  await page.evaluate((skins) => {
    const storeItems = skins.map((itemId, i) => ({
      itemId,
      name: itemId,
      kind: 'skin',
      costClaudium: 200 + i * 50,
      owned: false,
    }));
    window.__game.hud.attachClaudium({
      balance: async () => 900,
      storeSnapshot: async () => ({ available: true, balance: 900, storeItems }),
      snapshot: async () => ({ available: false, packs: [], rails: [] }),
      buy: async () => {},
      // Never reached: the rig stops at the open decision and confirms nothing.
      spend: async () => ({
        granted: false,
        balance: 900,
        costClaudium: null,
        reason: 'unavailable',
      }),
    });
  }, skinIds);
}

async function openStore(page) {
  await page.evaluate(() => window.__game.hud.toggleDailyRewards());
}

async function paintedSkinIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#daily-rewards-window [data-armory-skin]')]
      .map((el) => el.getAttribute('data-armory-skin'))
      .filter((id) => !!id),
  );
}

async function waitForStorePaint(page) {
  await page.waitForFunction(
    () => !!document.querySelector('#daily-rewards-window [data-armory-skin]'),
    { timeout: 30000 },
  );
  await new Promise((r) => setTimeout(r, 1500));
}

/** Open the inspect overlay on the first card whose action row offers an
 *  enabled Purchase action, then click it. Loud failure over a partial shot. */
async function openPurchaseDecision(page) {
  const state = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const cards = [...document.querySelectorAll('#daily-rewards-window [data-armory-skin]')];
    for (const card of cards) {
      card.click();
      // The inspect overlay builds its preview on the click; give it a beat.
      for (let i = 0; i < 50 && !document.querySelector('.armory-inspect-overlay'); i++) {
        await wait(100);
      }
      const overlay = document.querySelector('.armory-inspect-overlay');
      if (!overlay) return { err: 'inspect overlay never mounted' };
      for (let i = 0; i < 20 && !overlay.querySelector('[data-armory-buy]'); i++) await wait(100);
      const buy = overlay.querySelector('[data-armory-buy]');
      if (buy instanceof HTMLElement && !buy.disabled) {
        buy.click();
        await wait(300);
        const prompt = document.querySelector('.woc-store-prompt');
        return {
          err: null,
          skin: card.getAttribute('data-armory-skin'),
          promptMounted: !!prompt,
          promptParent: prompt?.parentElement?.id || prompt?.parentElement?.tagName || 'none',
        };
      }
      overlay.querySelector('[data-armory-close]')?.click();
      await wait(200);
    }
    return { err: 'no purchasable armory card found' };
  });
  if (state.err) throw new Error(state.err);
  return state;
}

async function runStage(mobile) {
  const browser = await launchBrowser(mobile);
  try {
    const page = await browser.newPage();
    await seedLowGraphics(page);
    await suppressGpuNotice(page);
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
    await enterOfflineGame(page, { settleMs: 4000 });
    await page.waitForFunction(() => !!window.__game?.hud?.attachClaudium, { timeout: 120000 });
    await awaitWorldPainted(page);
    if (mobile) {
      await page.evaluate(() => document.body.classList.add('mobile-touch'));
    }
    // Pass one names the skin ids the armory paints; pass two prices them.
    await attachStubHooks(page, []);
    await openStore(page);
    await waitForStorePaint(page);
    const skinIds = await paintedSkinIds(page);
    await attachStubHooks(page, skinIds);
    await openStore(page);
    await openStore(page);
    await waitForStorePaint(page);
    await awaitWorldPainted(page);
    await dismissEntryOverlays(page);
    await dismissTutorialDialog(page);
    const decision = await openPurchaseDecision(page);
    await new Promise((r) => setTimeout(r, 600));
    const file = `${OUT}/${PREFIX}-${mobile ? 'mobile' : 'desktop'}.png`;
    // Full frame ON PURPOSE: the evidence is the layering of the body-level
    // inspect overlay and the decision, not any one window's chrome.
    await page.screenshot({ path: file });
    console.log(
      `${file}: skin=${decision.skin} promptMounted=${decision.promptMounted} promptParent=${decision.promptParent}`,
    );
  } finally {
    await browser.close();
  }
}

// biome-ignore lint/suspicious/noUndeclaredEnvVars: Screenshot-only CLI input is not a Turbo task dependency.
const set = process.env.SHOT_SET ?? 'all';
if (set !== 'all' && set !== 'desktop' && set !== 'mobile') {
  throw new Error(`unknown SHOT_SET ${set}`);
}
if (set !== 'mobile') await runStage(false);
if (set !== 'desktop') await runStage(true);
console.log('done');
