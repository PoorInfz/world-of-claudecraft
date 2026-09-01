// Real-browser coverage for the two storage purchase surfaces that do not live
// on the Personal bank pane: the locked/stocked Materials Vault and Strongbox
// Charters. The Node suites own state-machine detail; this file proves the real
// painters, shipped CSS, modal chrome, and detached result fit on both supported
// short landscape profiles and expose non-vacuous WCAG trees.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { BankWindow, type BankWindowDeps } from '../../src/ui/bank_window';
import { DailyRewardsWindow, type DailyRewardsWindowDeps } from '../../src/ui/daily_rewards_window';
import { StoreDecisionPrompts } from '../../src/ui/store_decision_prompt';
import type { WocStoreItemInput } from '../../src/ui/woc_store_view';
import type { BankInfo, IWorld, VaultInfo } from '../../src/world_api';
import { axeSeriousViolations, cleanup, formatViolations, host, stubDeps } from './_harness';

const EPSILON = 1;
const TOUCH_FLOOR = 40;
const PROFILES = [
  { label: '844x390', width: 844, height: 390 },
  { label: '740x360', width: 740, height: 360 },
] as const;
const mountedWindows: Array<{ close(): void }> = [];

function personalInfo(): BankInfo {
  return {
    slots: [],
    capacity: 24,
    purchasedSlots: 0,
    bonusSlots: 0,
    nextExpansionCost: 500,
    bonusSources: [],
    socketsUnlocked: 0,
    socketBags: [null, null, null, null],
    nextSocketCost: 1_000_000,
    generalCapacity: 24,
    materialsCapacity: 0,
    generalUsed: 0,
    materialsUsed: 0,
  };
}

function mountVault(info: VaultInfo): { root: HTMLElement; win: BankWindow } {
  const root = host('bank-window');
  const stack = document.createElement('div');
  stack.id = 'prompt-stack';
  document.body.appendChild(stack);
  const world = {
    bankInfo: personalInfo(),
    guildBankInfo: null,
    vaultInfo: info,
    inventory: [],
    bags: [null, null, null, null],
    copper: 100_000,
    player: { dead: false },
  };
  const win = new BankWindow(
    stubDeps({
      root: () => root,
      world: () => world as unknown as IWorld,
      itemIcon: () => '<span class="item-icon"></span>',
      moneyHtml: (copper: number) => `<span class="money-inline">${copper}</span>`,
      itemTooltip: () => '',
      captureFocus: () => null,
      consumePeek: () => false,
    }) as BankWindowDeps,
  );
  mountedWindows.push(win);
  win.open();
  root.querySelector<HTMLButtonElement>('.bank-tab[data-tab="vault"]')?.click();
  return { root, win };
}

const CHARTER_ITEMS: WocStoreItemInput[] = [
  {
    itemId: 'strongbox_charter_1',
    name: 'catalog-owned-name',
    kind: 'storage',
    costClaudium: 500,
    owned: false,
  },
];
const SIGNED_VAULT_COPY = {
  itemId: 'iron_ore',
  count: 1,
  instance: { signer: 'A deliberately long artisan signature for compact-layout coverage' },
};

function mountCharterStore(waitForSpend: Promise<void>): {
  root: HTMLElement;
  win: DailyRewardsWindow;
} {
  const root = host('daily-rewards-window');
  root.style.display = 'none';
  const stack = document.createElement('div');
  stack.id = 'prompt-stack';
  document.body.appendChild(stack);
  const world = {
    player: { templateId: 'warrior', mainhandItemId: null },
    accountCosmetics: { weaponSkinIds: [], weaponSkinLoadout: {} },
    bankPurchasedSlots: 0,
  };
  const deps: DailyRewardsWindowDeps = {
    root: () => root,
    world: () => world as unknown as IWorld,
    closeOthers: () => undefined,
    captureFocus: () => null,
    restoreFocus: () => undefined,
    storeEnabled: () => true,
    storeSnapshot: async () => ({ available: true, balance: 5_000, items: CHARTER_ITEMS }),
    spendStoreItem: async () => {
      await waitForSpend;
      return { granted: true, balance: 4_500, costClaudium: 500, reason: null };
    },
  };
  const win = new DailyRewardsWindow(deps);
  mountedWindows.push(win);
  win.openStore();
  return { root, win };
}

async function setMobileViewport(width: number, height: number): Promise<void> {
  await page.viewport(width, height);
  document.body.className = 'mobile-touch game-active bank-open hud-mobile-compact';
  document.documentElement.style.setProperty('--app-vw', `${width}px`);
  document.documentElement.style.setProperty('--app-vh', `${height}px`);
  document.documentElement.style.setProperty('--ui-scale', '1');
}

function expectViewportBox(element: Element | null, label: string): HTMLElement {
  expect(element, `${label} must mount`).not.toBeNull();
  const html = element as HTMLElement;
  const rect = html.getBoundingClientRect();
  expect(rect.width, `${label} width`).toBeGreaterThan(0);
  expect(rect.height, `${label} height`).toBeGreaterThan(0);
  expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(-EPSILON);
  expect(rect.right, `${label} right`).toBeLessThanOrEqual(window.innerWidth + EPSILON);
  expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(-EPSILON);
  expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(window.innerHeight + EPSILON);
  return html;
}

function expectReachable(
  container: HTMLElement,
  element: Element | null,
  label: string,
): HTMLElement {
  expect(element, `${label} must mount`).not.toBeNull();
  const html = element as HTMLElement;
  html.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const outer = container.getBoundingClientRect();
  const inner = html.getBoundingClientRect();
  expect(inner.width, `${label} width`).toBeGreaterThan(0);
  expect(inner.height, `${label} height`).toBeGreaterThan(0);
  expect(inner.left, `${label} left`).toBeGreaterThanOrEqual(Math.max(0, outer.left) - EPSILON);
  expect(inner.right, `${label} right`).toBeLessThanOrEqual(
    Math.min(window.innerWidth, outer.right) + EPSILON,
  );
  expect(inner.top, `${label} top`).toBeGreaterThanOrEqual(Math.max(0, outer.top) - EPSILON);
  expect(inner.bottom, `${label} bottom`).toBeLessThanOrEqual(
    Math.min(window.innerHeight, outer.bottom) + EPSILON,
  );
  return html;
}

async function expectClean(element: HTMLElement): Promise<void> {
  const violations = await axeSeriousViolations(element);
  expect(violations, formatViolations(violations)).toEqual([]);
}

afterEach(() => {
  for (const window of mountedWindows.splice(0)) window.close();
  cleanup();
  document.body.className = '';
  for (const property of ['--app-vw', '--app-vh', '--ui-scale']) {
    document.documentElement.style.removeProperty(property);
  }
});

for (const profile of PROFILES) {
  describe(`storage purchase surfaces at ${profile.label}`, () => {
    it('keeps the locked Vault offer and its confirmation reachable', async () => {
      await setMobileViewport(profile.width, profile.height);
      const { root } = mountVault({
        stock: {},
        special: [],
        upgrades: 0,
        perMaterialCap: 0,
        nextUpgradeCost: 20_000,
      });
      expect(root.querySelector('.vault-pane'), 'the Vault tab must be selected').not.toBeNull();
      expectReachable(root, root.querySelector('.vault-locked-intro'), 'locked Vault explanation');
      const buy = expectReachable(
        root,
        root.querySelector('.vault-unlock-btn'),
        'Vault unlock button',
      ) as HTMLButtonElement;
      expect(buy.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      buy.click();
      const prompt = expectViewportBox(
        document.querySelector('.vault-buy-prompt'),
        'Vault confirmation',
      );
      expect(prompt.querySelectorAll('button')).toHaveLength(2);
    });

    it('keeps stocked Vault rows and both footer actions reachable without horizontal loss', async () => {
      await setMobileViewport(profile.width, profile.height);
      const { root } = mountVault({
        stock: { iron_ore: 17 },
        special: [SIGNED_VAULT_COPY],
        upgrades: 1,
        perMaterialCap: 40,
        nextUpgradeCost: 50_000,
      });
      expect(root.querySelector('.vault-pane'), 'the Vault tab must be selected').not.toBeNull();
      expect(
        root.querySelectorAll('.vault-row'),
        'both stock kinds must really render',
      ).toHaveLength(2);
      expectReachable(root, root.querySelector('.vault-row'), 'stocked material row');
      expectReachable(root, root.querySelector('.vault-row-special'), 'signed special row');
      const deposit = expectReachable(
        root,
        root.querySelector('.vault-deposit-all'),
        'Vault deposit-all',
      );
      const upgrade = expectReachable(
        root,
        root.querySelector('.vault-upgrade-btn'),
        'Vault upgrade',
      );
      expect(deposit.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(upgrade.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + EPSILON);
    });

    it('keeps a Strongbox card, confirmation, and detached named result reachable', async () => {
      await setMobileViewport(profile.width, profile.height);
      let releaseSpend = (): void => undefined;
      const waitForSpend = new Promise<void>((resolve) => (releaseSpend = resolve));
      const { root, win } = mountCharterStore(waitForSpend);
      await vi.waitFor(() => {
        expect(root.querySelectorAll('.charter-card')).toHaveLength(4);
      });
      const strip = root.querySelector('.woc-store-tabs') as HTMLElement;
      expect(strip).not.toBeNull();
      const tablist = root.querySelector('.woc-store-tablist') as HTMLElement;
      expect(tablist).not.toBeNull();
      expect(getComputedStyle(strip).display).toBe('flex');
      expect(getComputedStyle(tablist).display).toBe('flex');
      const tabButtons = [...tablist.querySelectorAll('button')];
      expect(tabButtons).toHaveLength(2);
      const tabTops = tabButtons.map((button) => button.getBoundingClientRect().top);
      expect(Math.max(...tabTops) - Math.min(...tabTops)).toBeLessThanOrEqual(EPSILON);
      const body = root.querySelector('.woc-store-body') as HTMLElement;
      const buy = root.querySelector(
        '[data-charter-buy="strongbox_charter_1"]',
      ) as HTMLButtonElement;
      expect(body).not.toBeNull();
      expect(buy).not.toBeNull();
      expectReachable(body, buy.closest('.charter-card'), 'Strongbox card');
      expect(buy.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      buy.click();
      const prompt = expectViewportBox(
        document.querySelector('.woc-store-prompt'),
        'Strongbox confirmation',
      );
      expect(prompt.textContent).toContain('Lesser Strongbox Charter');
      prompt.querySelector<HTMLButtonElement>('[data-store-prompt-confirm]')?.click();
      await Promise.resolve();
      win.close();
      releaseSpend();
      await vi.waitFor(() => {
        expect(document.querySelector('.woc-store-global-result')).not.toBeNull();
      });
      const result = expectViewportBox(
        document.querySelector('.woc-store-global-result'),
        'detached Strongbox result',
      );
      await vi.waitFor(() => {
        expect(result.textContent).toContain('Lesser Strongbox Charter');
        expect(result.textContent).toContain('strongbox_charter_1');
      });
    });
  });
}

describe('the store decision over a body-level armory inspect overlay', () => {
  it('paints above the overlay under the production #ui hierarchy (desktop)', async () => {
    await page.viewport(1280, 720);
    document.documentElement.style.setProperty('--app-vw', '1280px');
    document.documentElement.style.setProperty('--app-vh', '720px');
    document.documentElement.style.setProperty('--ui-scale', '1');
    // The REAL entry hierarchy, which the other suites in this file flatten:
    // #prompt-stack lives inside #ui, and base.css makes #ui a position:fixed
    // z-index:10 stacking context, while the armory inspect overlay mounts on
    // document.body at z-index 90. A decision hosted anywhere inside #ui paints
    // UNDER that overlay whatever z-index it carries; that was the v0.41.0
    // desktop Purchase Skin freeze (the confirm opened invisibly while the
    // Store and the inspector both sat inert).
    const ui = document.createElement('div');
    ui.id = 'ui';
    const stack = document.createElement('div');
    stack.id = 'prompt-stack';
    ui.appendChild(stack);
    const storeRoot = document.createElement('section');
    ui.appendChild(storeRoot);
    document.body.appendChild(ui);
    const overlay = document.createElement('div');
    overlay.className = 'armory-inspect-overlay open';
    document.body.appendChild(overlay);

    const prompts = new StoreDecisionPrompts(() => storeRoot);
    try {
      const opened = prompts.open({
        title: 'Confirm purchase',
        body: 'Buy the skin?',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        closeText: 'Close',
        onConfirm: () => undefined,
      });
      expect(opened, 'the decision must open').toBe(true);
      expect(overlay.inert, 'open() must make the inspector inert').toBe(true);
      // Lift inert for the probe only: inert strips hit testing, so with it in
      // place elementFromPoint would skip the overlay and mask the stacking
      // defect. The assertion is about PAINT order, which inert never changes.
      overlay.inert = false;
      const box = expectViewportBox(
        document.querySelector('.woc-store-prompt'),
        'store decision over the inspector',
      );
      const confirm = box.querySelector<HTMLElement>('[data-store-prompt-confirm]');
      expect(confirm, 'confirm control must mount').not.toBeNull();
      const rect = (confirm as HTMLElement).getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      expect(
        box.contains(hit),
        'the decision must paint above the body-level inspect overlay (z 90)',
      ).toBe(true);
    } finally {
      prompts.dismiss(false);
      prompts.unregister();
    }
  });
});

describe('axe: mounted Vault and Strongbox purchase states', () => {
  it.each(PROFILES)(
    'audits the locked Vault and its live confirmation at $label',
    async (profile) => {
      await setMobileViewport(profile.width, profile.height);
      const { root } = mountVault({
        stock: {},
        special: [],
        upgrades: 0,
        perMaterialCap: 0,
        nextUpgradeCost: 20_000,
      });
      expect(root.querySelector('.vault-locked-intro')).not.toBeNull();
      const buy = root.querySelector<HTMLButtonElement>('.vault-unlock-btn');
      expect(buy).not.toBeNull();
      await expectClean(root);
      buy?.click();
      expect(document.querySelector('.vault-buy-prompt')).not.toBeNull();
      await expectClean(document.body);
    },
  );

  it('audits a genuinely stocked Vault with its row and footer actions', async () => {
    await setMobileViewport(844, 390);
    const { root } = mountVault({
      stock: { iron_ore: 17 },
      special: [SIGNED_VAULT_COPY],
      upgrades: 1,
      perMaterialCap: 40,
      nextUpgradeCost: 50_000,
    });
    expect(root.querySelectorAll('.vault-row')).toHaveLength(2);
    expect(root.querySelector('.vault-row-special')).not.toBeNull();
    expect(root.querySelector('.vault-deposit-all')).not.toBeNull();
    expect(root.querySelector('.vault-upgrade-btn')).not.toBeNull();
    await expectClean(root);
  });

  it('audits the Strongbox card, confirmation, and detached result in turn', async () => {
    await setMobileViewport(844, 390);
    let releaseSpend = (): void => undefined;
    const waitForSpend = new Promise<void>((resolve) => (releaseSpend = resolve));
    const { root, win } = mountCharterStore(waitForSpend);
    await vi.waitFor(() => expect(root.querySelectorAll('.charter-card')).toHaveLength(4));
    const buy = root.querySelector<HTMLButtonElement>('[data-charter-buy="strongbox_charter_1"]');
    expect(buy).not.toBeNull();
    await expectClean(root);

    buy?.click();
    const prompt = document.querySelector<HTMLElement>('.woc-store-prompt');
    expect(prompt).not.toBeNull();
    expect(prompt?.querySelector('[data-store-prompt-confirm]')).not.toBeNull();
    await expectClean(document.body);

    prompt?.querySelector<HTMLButtonElement>('[data-store-prompt-confirm]')?.click();
    await Promise.resolve();
    win.close();
    releaseSpend();
    await vi.waitFor(() => {
      expect(document.querySelector('.woc-store-global-result')).not.toBeNull();
    });
    const result = document.querySelector<HTMLElement>('.woc-store-global-result');
    expect(result?.querySelector('[data-store-result-text]')).not.toBeNull();
    await vi.waitFor(() => expect(result?.textContent).toContain('strongbox_charter_1'));
    await expectClean(document.body);
  });
});
