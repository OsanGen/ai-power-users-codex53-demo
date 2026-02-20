const { test, expect } = require('@playwright/test');

test('AIPU UI bootstrap smoke check', async ({ page }) => {
  const target = process.env.QA_TARGET_URL || "http://127.0.0.1:4173";

  await page.goto(target, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();

  const smoke = await page.evaluate(() => {
    const payload = window.__AIPU_UI_BOOTSTRAP || {};
    return {
      ok: !!payload.ok,
      missingTokens: Array.isArray(payload.missingTokens) ? payload.missingTokens : [],
      missingClasses: Array.isArray(payload.missingClasses) ? payload.missingClasses : []
    };
  });

  expect(smoke.ok, "window.__AIPU_UI_BOOTSTRAP.ok must be true").toBeTruthy();
  expect(smoke.missingTokens.length, "all required UI tokens should resolve").toBe(0);
  expect(smoke.missingClasses.length, "all required UI classes should resolve").toBe(0);
});

test('diagnose input/sprite/audio states', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('canvas')).toBeVisible();

  const boot = await page.evaluate(() => ({
    state: window.AIPU?.state?.game?.state,
    floor: window.AIPU?.state?.game?.currentFloorIndex
  }));
  expect(boot.state).toBe('TITLE');

  await page.keyboard.press('Space');
  await page.waitForTimeout(120);

  const afterStart = await page.evaluate(() => ({
    state: window.AIPU?.state?.game?.state,
    floorIndex: window.AIPU?.state?.game?.currentFloorIndex,
    floorId: window.AIPU?.content?.FLOORS?.[window.AIPU?.state?.game?.currentFloorIndex]?.id || null,
    songs1: window.AIPU?.content?.getSongPathCandidatesForFloor?.(1)?.slice(0, 3) || [],
    songs2: window.AIPU?.content?.getSongPathCandidatesForFloor?.(2)?.slice(0, 3) || [],
    audioState: window.AIPU?.audio?.getState?.() || null
  }));
  expect(afterStart.state).not.toBe('TITLE');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(80);
  const arrowOnly = await page.evaluate(() => ({
    state: window.AIPU?.state?.game?.state,
    keys: {
      ArrowRight: !!window.AIPU?.input?.keys?.ArrowRight,
      KeyD: !!window.AIPU?.input?.keys?.KeyD
    },
    shootMode: typeof window.AIPU?.systems?.getDirectionalBurstStatus === 'function'
      ? window.AIPU.systems.getDirectionalBurstStatus()
      : null
  }));
  await page.keyboard.up('ArrowRight');

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(80);
  const wasdOnly = await page.evaluate(() => ({
    keys: {
      ArrowRight: !!window.AIPU?.input?.keys?.ArrowRight,
      KeyD: !!window.AIPU?.input?.keys?.KeyD
    }
  }));
  await page.keyboard.up('KeyD');

  const floorBomb = await page.evaluate(() => ({
    canTrigger: typeof window.AIPU?.systems?.shouldTriggerBombNow === 'function' ? window.AIPU.systems.shouldTriggerBombNow() : null,
    floorId: window.AIPU?.content?.FLOORS?.[window.AIPU?.state?.game?.currentFloorIndex]?.id || null,
    audio: window.AIPU?.audio?.getState?.() || null
  }));

  return { boot, afterStart, arrowOnly, wasdOnly, floorBomb };
});
