const { test, expect } = require('@playwright/test');

const targetUrl = process.env.QA_TARGET_URL || "http://127.0.0.1:4173";

const getBootDebug = async (page) =>
  page.evaluate(() => {
    const renderText = typeof window.render_game_to_text === "function" ? window.render_game_to_text() : "{}";
    let renderDebug;
    try {
      renderDebug = JSON.parse(renderText);
    } catch (_error) {
      renderDebug = null;
    }

    const game = window.AIPU?.state?.game || {};
    const runtime = window.AIPU?.state?.runtime || {};
    return {
      renderTitle: renderDebug && renderDebug.debug && renderDebug.debug.title ? renderDebug.debug.title : null,
      gameState: game.state || "",
      titleIntroTime: Number.isFinite(game.titleIntroTime) ? game.titleIntroTime : 0,
      bootLogoActive: !!game.bootLogoActive,
      bootLogoTimer: Number.isFinite(game.bootLogoTimer) ? game.bootLogoTimer : 0,
      bootLogoDuration: Number.isFinite(game.bootLogoDuration) ? game.bootLogoDuration : 0,
      bootLogoSeenThisSession: !!runtime.bootLogoSeenThisSession,
      renderGameError: renderDebug && renderDebug.error ? renderDebug.error : null
    };
  });

test('AIPU UI bootstrap smoke check', async ({ page }) => {
  const target = targetUrl;

  await page.goto(target, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();

  const smoke = await page.evaluate(() => {
    const payload = window.__AIPU_UI_BOOTSTRAP || {};
    return {
      ok: !!payload.ok,
      missingTokens: Array.isArray(payload.missingTokens) ? payload.missingTokens : [],
      missingClasses: Array.isArray(payload.missingClasses) ? payload.missingClasses : [],
      missingDomElements: Array.isArray(payload.missingDomElements) ? payload.missingDomElements : [],
      requiredDomIdsCount: Number.isFinite(payload.requiredDomIdsCount) ? payload.requiredDomIdsCount : 0
    };
  });

  expect(smoke.ok, "window.__AIPU_UI_BOOTSTRAP.ok must be true").toBeTruthy();
  expect(smoke.missingTokens.length, "all required UI tokens should resolve").toBe(0);
  expect(smoke.missingClasses.length, "all required UI classes should resolve").toBe(0);
  expect(smoke.missingDomElements.length, "all required DOM ids should resolve").toBe(0);
  expect(smoke.requiredDomIdsCount, "required DOM id contract should be populated").toBeGreaterThan(0);
});

test('boot logo intro runs once per session from TITLE', async ({ page }) => {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();

  const initial = await getBootDebug(page);
  expect(initial.renderGameError, "render_game_to_text should serialize title diagnostics").toBeNull();
  expect(initial.gameState, "boot contract: fresh state is TITLE").toBe("TITLE");
  expect(initial.bootLogoActive, "boot-logo intro should start active on first load").toBe(true);
  expect(initial.bootLogoSeenThisSession, "fresh session should not have seen boot logo yet").toBe(false);
  expect(initial.bootLogoTimer, "timer should start near zero").toBeLessThan(0.2);

  await page.evaluate(() => window.advanceTime(700));
  const mid = await getBootDebug(page);
  expect(mid.bootLogoActive, "boot-logo intro should still be active before duration").toBe(true);
  expect(mid.bootLogoTimer, "boot-logo timer should advance while active").toBeGreaterThan(0);
  expect(mid.titleIntroTime, "title cinematic should remain paused while logo runs").toBe(0);

  await page.evaluate(() => window.advanceTime(900));
  const finished = await getBootDebug(page);
  expect(finished.bootLogoActive, "logo should auto-complete after duration").toBe(false);
  expect(finished.bootLogoSeenThisSession, "session flag should set when logo completes").toBe(true);
  expect(finished.gameState, "still in TITLE after logo completes").toBe("TITLE");
  expect(finished.titleIntroTime, "title cinematic should start from near-zero after logo completion").toBeLessThan(0.25);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();
  const freshStart = await getBootDebug(page);
  expect(freshStart.gameState, "reload starts fresh runtime boot flow").toBe("TITLE");
  expect(freshStart.bootLogoActive, "logo intro should be active on fresh page load").toBe(true);
  expect(freshStart.bootLogoSeenThisSession, "fresh load should start with session unseen flag false").toBe(false);

  await page.keyboard.press(" ");
  const afterSkip = await getBootDebug(page);
  expect(afterSkip.gameState, "single-space from active logo should leave TITLE flow immediately").not.toBe("TITLE");

  await page.evaluate(() => {
    if (window.AIPU?.systems?.toTitle) {
      window.AIPU.systems.toTitle();
    }
  });
  const afterReturn = await getBootDebug(page);
  expect(afterReturn.gameState, "toTitle() should return to TITLE").toBe("TITLE");
  expect(afterReturn.bootLogoActive, "subsequent toTitle() in session should not reactivate logo").toBe(false);
  expect(afterReturn.bootLogoSeenThisSession, "boot flag should remain persisted in session").toBe(true);
});

test('diagnose input/sprite/audio states', async ({ page }) => {
  const target = targetUrl;
  const readAudioState = async () => page.evaluate(() => {
    const state = window.AIPU?.audio?.getState?.() || null;
    if (!state) {
      return null;
    }
    return {
      musicMuted: !!(state.musicMuted || state.muted),
      sfxMuted: !!state.sfxMuted,
      hasAudio: state.hasAudio !== false
    };
  });

  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('canvas')).toBeVisible();

  const boot = await page.evaluate(() => ({
    state: window.AIPU?.state?.game?.state,
    floor: window.AIPU?.state?.game?.currentFloorIndex
  }));
  expect(boot.state).toBe('TITLE');

  const musicButton = page.locator("#appFooterMusicHintBtn");
  await expect(musicButton).toBeVisible();

  const initialAudio = await readAudioState();
  expect(typeof initialAudio?.musicMuted, "audio state should expose musicMuted").toBe("boolean");
  expect(typeof initialAudio?.sfxMuted, "audio state should expose sfxMuted").toBe("boolean");

  const controlsHint = page.locator("#appFooterControlStrip");
  await expect(controlsHint).toBeVisible();
  const controlsText = (await controlsHint.textContent()) || "";
  expect(controlsText).toMatch(/Spacebar/i);
  expect(controlsText).toMatch(/\bM\b.*music/i);
  expect(controlsText).toMatch(/\bE\b.*sound effects/i);

  await page.evaluate(() => {
    localStorage.setItem("MUSIC_MUTED_V1", "1");
    localStorage.removeItem("MUSIC_MUTED_V2");
    localStorage.removeItem("SFX_MUTED_V2");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState('networkidle');
  await expect(page.locator("canvas")).toBeVisible();
  const legacyAudio = await readAudioState();
  expect(legacyAudio.musicMuted, "legacy migration should map V1 into both channels").toBe(true);
  expect(legacyAudio.sfxMuted, "legacy migration currently maps V1 only to music state").toBe(false);

  await page.evaluate(() => {
    localStorage.removeItem("MUSIC_MUTED_V1");
    localStorage.removeItem("MUSIC_MUTED_V2");
    localStorage.removeItem("SFX_MUTED_V2");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState('networkidle');
  await expect(page.locator("canvas")).toBeVisible();
  const resetAudio = await readAudioState();
  expect(resetAudio.musicMuted, "fresh state without storage should default musicMuted false").toBe(false);
  expect(resetAudio.sfxMuted, "fresh state without storage should default sfxMuted false").toBe(false);

  const postResetAudio = await readAudioState();
  expect(postResetAudio.musicMuted, "post-migration cleanup resets storage defaults").toBe(resetAudio.musicMuted);
  expect(postResetAudio.sfxMuted, "post-migration cleanup resets storage defaults").toBe(resetAudio.sfxMuted);

  await page.keyboard.press("m");
  const afterMusicMute = await readAudioState();
  expect(afterMusicMute.musicMuted, "M should toggle music mute").toBe(!initialAudio.musicMuted);
  expect(afterMusicMute.sfxMuted, "M should not affect sfx mute").toBe(initialAudio.sfxMuted);

  await page.keyboard.press("e");
  const afterSfxMute = await readAudioState();
  expect(afterSfxMute.sfxMuted, "E should toggle sfx mute").toBe(!afterMusicMute.sfxMuted);
  expect(afterSfxMute.musicMuted, "E should not affect music mute").toBe(afterMusicMute.musicMuted);

  await musicButton.click();
  const afterMusicButton = await readAudioState();
  expect(afterMusicButton.musicMuted, "music footer button should toggle music").toBe(!afterSfxMute.musicMuted);
  expect(afterMusicButton.sfxMuted, "music button should not affect sfx mute").toBe(afterSfxMute.sfxMuted);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('canvas')).toBeVisible();
  const persistedAudio = await readAudioState();
  expect(persistedAudio.musicMuted, "music mute should persist across reload").toBe(afterMusicButton.musicMuted);
  expect(persistedAudio.sfxMuted, "sfx mute should persist across reload").toBe(afterSfxMute.sfxMuted);

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
