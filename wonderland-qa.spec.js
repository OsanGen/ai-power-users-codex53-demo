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
  const target = process.env.QA_TARGET_URL || "http://127.0.0.1:4173";
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

  const musicButton = page.locator("#musicMuteBtn");
  await expect(musicButton).toBeVisible();

  const initialAudio = await readAudioState();
  expect(typeof initialAudio?.musicMuted, "audio state should expose musicMuted").toBe("boolean");
  expect(typeof initialAudio?.sfxMuted, "audio state should expose sfxMuted").toBe("boolean");

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
  expect(legacyAudio.sfxMuted, "legacy migration should map V1 into sfx state when V2 keys are absent").toBe(true);

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
