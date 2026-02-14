(() => {
  "use strict";

  const AIPU = window.AIPU;
  const {
    canvas,
    gameFrame,
    overlayRestartBtn,
    textModalEl,
    lessonTextInputEl,
    lessonTextSaveBtn,
    lessonTextSampleBtn,
    lessonTextCloseBtn
  } = AIPU.dom;
  const {
    TOKENS,
    GameState,
    WORLD,
    BASE_MAX_HP,
    REAR_SHOT_TRIGGER_SECONDS,
    ALL_DIRECTION_SHOT_TRIGGER_SECONDS,
    DUAL_SHOT_UNLOCK_FLOOR,
    OMNI_SHOT_UNLOCK_FLOOR,
    REAR_SHOT_NOTICE_DURATION,
    BOMB_BRIEFING_ACCEPT_COUNT,
    BOMB_CHARGES_BASE,
    BOMB_CHARGES_UPGRADED,
    BOMB_CHARGES_FINAL,
    BOMB_CHARGES_UPGRADE_FLOOR,
    BOMB_CHARGES_FINAL_FLOOR
  } = AIPU.constants;
  const { game, player } = AIPU.state;
  const { keys } = AIPU.input;
  const { FLOORS, ENEMY_DEFS, getNarrativeUiText } = AIPU.content;
  const upgrades = AIPU.upgrades;
  const { shareUI, resolveShareUrl, buildShareCopy, buildRunCardDataUrl } = AIPU.share;
  const {
    clamp,
    lerp,
    approach,
    rand,
    unitVector,
    circleHit,
    pointInRect,
    getMouseCanvasPosition,
    arrowKeyToVector,
    accentColor
  } = AIPU.utils;

  let activeWaves = [];
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let pickups = [];
  let particles = [];
  let simAccumulator = 0;
  const SIM_STEP = 1 / 60;
  const MAX_ACCUMULATED_TIME = 0.25;
  const BOMB_FLASH_DURATION = 0.22;
  const OVERLAY_ADVANCE_LOCK_MS = 120;
  const CHECKPOINT_FLOOR_KEY = "checkpoint_floor_v1";
  const LESSON_TEXT_KEY = "LESSON_TEXT_V1";
  const LESSON_TEXT_MAX_CHARS = 4000;
  const LESSON_TEXT_SAMPLE =
    "Inputs are numbers like counts and signals. Weights scale each input, then gates combine them to produce one guess. A tiny input change can flip a prediction.";
  const COGSEC_BULLET_COLORS = [TOKENS.yellow, TOKENS.blue, TOKENS.mint, TOKENS.pink];
  let bulletColorCycleIndex = 0;
  let lessonSlideAdvanceLockUntil = 0;
  let deathLessonAdvanceLockUntil = 0;

  function isShareModalOpen() {
    return !!shareUI && shareUI.isOpen();
  }

  function isTextModalOpen() {
    return !!textModalEl && !textModalEl.classList.contains("hidden");
  }

  function isAnyModalOpen() {
    return isShareModalOpen() || isTextModalOpen();
  }

  function clearInputState() {
    for (const key in keys) {
      if (Object.prototype.hasOwnProperty.call(keys, key)) {
        keys[key] = false;
      }
    }
  }

  function formatUiText(key, fallback, values = null) {
    let text = typeof getNarrativeUiText === "function" ? getNarrativeUiText(key, fallback) : fallback;
    if (!values || typeof values !== "object") {
      return text;
    }
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  function nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function isSpaceKey(event) {
    const key = typeof event.key === "string" ? event.key : "";
    const code = typeof event.code === "string" ? event.code : "";
    return key === " " || key === "Spacebar" || key === "Space" || code === "Space";
  }

  function isEnterKey(event) {
    const key = typeof event.key === "string" ? event.key : "";
    const code = typeof event.code === "string" ? event.code : "";
    return key === "Enter" || code === "Enter" || code === "NumpadEnter";
  }

  function isEscapeKey(event) {
    const key = typeof event.key === "string" ? event.key : "";
    const code = typeof event.code === "string" ? event.code : "";
    return key === "Escape" || code === "Escape";
  }

  function isArrowKey(event) {
    const key = typeof event.key === "string" ? event.key : "";
    const code = typeof event.code === "string" ? event.code : "";
    return key.startsWith("Arrow") || code.startsWith("Arrow");
  }

  function isSinglePress(event) {
    return !event.repeat;
  }

  function isMovementCode(code) {
    return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
  }

  function setInputKeyState(event, isDown) {
    const key = typeof event.key === "string" ? event.key : "";
    const code = typeof event.code === "string" ? event.code : "";

    if (isMovementCode(code)) {
      keys[code] = isDown;
      const movementLetter = code.slice(-1);
      keys[movementLetter] = isDown;
      keys[movementLetter.toLowerCase()] = isDown;
      return;
    }

    if (key) {
      keys[key] = isDown;
    }
  }

  function normalizeCheckpointFloor(value) {
    const maxFloors = Math.max(1, FLOORS.length);
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return clamp(parsed, 1, maxFloors);
  }

  function getCheckpointFloor() {
    try {
      const raw = localStorage.getItem(CHECKPOINT_FLOOR_KEY);
      if (raw == null) {
        return 1;
      }
      return normalizeCheckpointFloor(raw);
    } catch (error) {
      return 1;
    }
  }

  function setCheckpointFloor(n) {
    const floor = normalizeCheckpointFloor(n);
    try {
      localStorage.setItem(CHECKPOINT_FLOOR_KEY, String(floor));
    } catch (error) {
      void error;
    }
    return floor;
  }

  function clearCheckpointFloor() {
    try {
      localStorage.removeItem(CHECKPOINT_FLOOR_KEY);
    } catch (error) {
      void error;
    }
  }

  function normalizeLessonText(value) {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.slice(0, LESSON_TEXT_MAX_CHARS);
  }

  function readStoredLessonText() {
    try {
      const raw = localStorage.getItem(LESSON_TEXT_KEY);
      return normalizeLessonText(raw);
    } catch (error) {
      return "";
    }
  }

  function writeStoredLessonText(value) {
    const normalized = normalizeLessonText(value);
    try {
      localStorage.setItem(LESSON_TEXT_KEY, normalized);
    } catch (error) {
      void error;
    }
    return normalized;
  }

  function setLessonTextValue(value, options = {}) {
    const normalized = normalizeLessonText(value);
    if (options.commit !== false) {
      game.lessonSourceText = normalized;
    }
    if (lessonTextInputEl) {
      lessonTextInputEl.value = normalized;
    }
    return normalized;
  }

  function openTextModal() {
    if (!textModalEl) {
      return;
    }
    const floor = currentFloor();
    textModalEl.style.setProperty("--share-accent", accentColor((floor && floor.accent) || "yellow"));
    clearInputState();
    setLessonTextValue(game.lessonSourceText || "", { commit: false });
    textModalEl.classList.remove("hidden");
    textModalEl.setAttribute("aria-hidden", "false");
    if (lessonTextInputEl && typeof lessonTextInputEl.focus === "function") {
      lessonTextInputEl.focus();
      lessonTextInputEl.setSelectionRange(lessonTextInputEl.value.length, lessonTextInputEl.value.length);
    }
  }

  function closeTextModal(options = {}) {
    if (!textModalEl) {
      return;
    }
    const save = !!options.save;
    if (save) {
      const value = lessonTextInputEl ? lessonTextInputEl.value : "";
      const normalized = writeStoredLessonText(value);
      setLessonTextValue(normalized);
    }
    textModalEl.classList.add("hidden");
    textModalEl.setAttribute("aria-hidden", "true");
    clearInputState();
    const focusTarget = gameFrame || canvas;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }

  function initializeLessonTextModal() {
    const stored = readStoredLessonText();
    setLessonTextValue(stored);

    if (lessonTextSaveBtn) {
      lessonTextSaveBtn.addEventListener("click", () => {
        closeTextModal({ save: true });
      });
    }

    if (lessonTextSampleBtn) {
      lessonTextSampleBtn.addEventListener("click", () => {
        setLessonTextValue(LESSON_TEXT_SAMPLE, { commit: false });
        if (lessonTextInputEl && typeof lessonTextInputEl.focus === "function") {
          lessonTextInputEl.focus();
          lessonTextInputEl.setSelectionRange(0, 0);
        }
      });
    }

    if (lessonTextCloseBtn) {
      lessonTextCloseBtn.addEventListener("click", () => {
        closeTextModal({ save: false });
      });
    }

    if (textModalEl) {
      textModalEl.addEventListener("keydown", (event) => {
        if (!isTextModalOpen()) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeTextModal({ save: false });
        }
      });
    }
  }

  function applyNarrativeStaticUiLabels() {
    const appShellEl = document.getElementById("appShell");
    if (appShellEl) {
      appShellEl.setAttribute(
        "aria-label",
        formatUiText("appShellAriaLabel", "Neural net learning game container")
      );
    }

    const appTitleEl = document.getElementById("appTitle");
    if (appTitleEl) {
      appTitleEl.textContent = formatUiText("appTitle", "Neural Nets: Learn the Loop");
    }

    const appSubtitleEl = document.getElementById("appSubtitle");
    if (appSubtitleEl) {
      appSubtitleEl.textContent = formatUiText(
        "appSubtitle",
        "Move with WASD. Shoot with Arrow Keys. Learn one concept per floor."
      );
    }

    if (canvas) {
      canvas.setAttribute("aria-label", formatUiText("gameCanvasAriaLabel", "Neural net game canvas"));
    }

    if (overlayRestartBtn) {
      overlayRestartBtn.textContent = formatUiText("overlayRestartButton", "Restart lesson");
    }

    const appFooterGoalEl = document.getElementById("appFooterGoal");
    if (appFooterGoalEl) {
      appFooterGoalEl.textContent = formatUiText("appFooterGoal", "Survive each timer and learn the loop.");
    }

    const appFooterRestartEl = document.getElementById("appFooterRestart");
    if (appFooterRestartEl) {
      appFooterRestartEl.textContent = formatUiText("appFooterRestart", "Restart run: R");
    }

    const textModalTitleEl = document.getElementById("textModalTitle");
    if (textModalTitleEl) {
      textModalTitleEl.textContent = formatUiText("textModalTitle", "Lesson source text");
    }

    const textModalNoteEl = document.getElementById("textModalNote");
    if (textModalNoteEl) {
      textModalNoteEl.textContent = formatUiText("textModalNote", "Edit the source text used in lesson cards.");
    }

    const lessonTextLabelEl = document.getElementById("lessonTextLabel");
    if (lessonTextLabelEl) {
      lessonTextLabelEl.textContent = formatUiText("textModalInputLabel", "Lesson source text");
    }

    if (lessonTextInputEl) {
      lessonTextInputEl.setAttribute(
        "aria-label",
        formatUiText("textModalInputLabel", "Lesson source text")
      );
    }

    if (lessonTextSaveBtn) {
      lessonTextSaveBtn.textContent = formatUiText("textModalSaveButton", "Save text");
    }

    if (lessonTextSampleBtn) {
      lessonTextSampleBtn.textContent = formatUiText("textModalSampleButton", "Use sample");
    }

    if (lessonTextCloseBtn) {
      lessonTextCloseBtn.textContent = formatUiText("textModalCloseButton", "Close");
    }
  }

  initializeLessonTextModal();
  applyNarrativeStaticUiLabels();

  window.addEventListener("keydown", (event) => {
    if (isTextModalOpen()) {
      if (isEscapeKey(event)) {
        event.preventDefault();
        closeTextModal({ save: false });
      }
      return;
    }

    if (isShareModalOpen()) {
      return;
    }

    const key = typeof event.key === "string" ? event.key : "";
    const code = typeof event.code === "string" ? event.code : "";
    const lower = key.toLowerCase();

    setInputKeyState(event, true);

    if (isArrowKey(event)) {
      const arrow = key.startsWith("Arrow") ? key : code;
      if (arrow.startsWith("Arrow")) {
        AIPU.input.lastShootKey = arrow;
      }
    }

    if (key === "`" || key === "~") {
      game.showDebugStats = !game.showDebugStats;
      return;
    }

    if (
      isSpaceKey(event) ||
      isEnterKey(event) ||
      isArrowKey(event) ||
      key === "1" ||
      key === "2" ||
      key === "3" ||
      lower === "w" ||
      lower === "a" ||
      lower === "s" ||
      lower === "d"
    ) {
      event.preventDefault();
    }

    if (game.state === GameState.TITLE) {
      if (isSpaceKey(event) || isEnterKey(event)) {
        if (!(AIPU.render && typeof AIPU.render.isTitleSequenceComplete === "function" && AIPU.render.isTitleSequenceComplete())) {
          game.titleIntroTime = AIPU.content.TITLE_SEQUENCE.finish;
        }
        startRun();
      } else if (lower === "t") {
        openTextModal();
      } else if (lower === "r") {
        clearCheckpointFloor();
        startRun(1);
      }
    } else if (game.state === GameState.BOMB_BRIEFING) {
      if (isEnterKey(event) && !event.repeat) {
        game.bombBriefingEnterCount = clamp(game.bombBriefingEnterCount + 1, 0, BOMB_BRIEFING_ACCEPT_COUNT);
        if (game.bombBriefingEnterCount >= BOMB_BRIEFING_ACCEPT_COUNT) {
          if (game.bombBriefingMode === "upgrade_final") {
            game.bombBriefingSeenFinalUpgradeThisRun = true;
          } else if (game.bombBriefingMode === "upgrade") {
            game.bombBriefingSeenUpgradeThisRun = true;
          } else {
            game.bombBriefingSeenIntroThisRun = true;
          }
          game.bombBriefingMode = "";
          enterLessonSlide();
        }
      }
    } else if (
      game.state === GameState.LESSON_SLIDE &&
      (isSpaceKey(event) || isEnterKey(event)) &&
      isSinglePress(event) &&
      nowMs() >= lessonSlideAdvanceLockUntil
    ) {
      game.lessonSlideEnterCount += 1;
      beginCurrentFloor();
    } else if (
      game.state === GameState.DEATH_LESSON &&
      (isSpaceKey(event) || isEnterKey(event)) &&
      isSinglePress(event) &&
      nowMs() >= deathLessonAdvanceLockUntil
    ) {
      game.gameOverEntryHandled = false;
      enterGameOver(currentFloor());
    } else if (game.state === GameState.UPGRADE_SELECT) {
      if (key === "1") {
        confirmUpgradeSelection(0);
      } else if (key === "2") {
        confirmUpgradeSelection(1);
      } else if (key === "3") {
        confirmUpgradeSelection(2);
      } else if (key === "ArrowLeft" || code === "ArrowLeft" || lower === "a") {
        shiftUpgradeSelection(-1);
      } else if (key === "ArrowRight" || code === "ArrowRight" || lower === "d") {
        shiftUpgradeSelection(1);
      } else if (isEnterKey(event) || isSpaceKey(event)) {
        confirmUpgradeSelection(game.upgradeSelectedIndex);
      } else if (isEscapeKey(event)) {
        game.upgradeNoticeTimer = 1.2;
      }
    } else if (game.state === GameState.PLAYING && isSpaceKey(event) && isSinglePress(event)) {
      triggerBomb();
    } else if (game.state === GameState.FLOOR_INTRO && (isSpaceKey(event) || isEnterKey(event)) && isSinglePress(event)) {
      game.introTimer = 0;
    } else if ((game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) && lower === "r") {
      requestRestart();
    }
  });

  window.addEventListener("keyup", (event) => {
    setInputKeyState(event, false);
  });

  window.addEventListener("blur", () => {
    clearInputState();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInputState();
    }
  });

  canvas.style.touchAction = "none";

  canvas.addEventListener("mousemove", (event) => {
    if (game.state !== GameState.UPGRADE_SELECT || isAnyModalOpen()) {
      return;
    }

    const mouse = getMouseCanvasPosition(event);
    const hoverIndex = getUpgradeCardIndexAt(mouse.x, mouse.y);
    if (hoverIndex >= 0) {
      game.upgradeSelectedIndex = hoverIndex;
    }
  });

  canvas.addEventListener("click", (event) => {
    if (game.state !== GameState.UPGRADE_SELECT || isAnyModalOpen()) {
      return;
    }

    const mouse = getMouseCanvasPosition(event);
    const hitIndex = getUpgradeCardIndexAt(mouse.x, mouse.y);
    if (hitIndex >= 0) {
      confirmUpgradeSelection(hitIndex);
    } else {
      game.upgradeNoticeTimer = 1.2;
    }
  });

  function getUpgradeCardIndexAt(x, y) {
    for (let i = 0; i < game.upgradeCardRects.length; i += 1) {
      if (pointInRect(x, y, game.upgradeCardRects[i])) {
        return i;
      }
    }
    return -1;
  }

  function currentFloor() {
    return FLOORS[game.currentFloorIndex];
  }

  function resetDeathAnim() {
    game.deathAnim = null;
  }

  function currentAccent() {
    return accentColor((currentFloor() && currentFloor().accent) || "blue");
  }

  function resetCollections() {
    bullets = [];
    enemyBullets = [];
    enemies = [];
    pickups = [];
    particles = [];
  }

  function getCollections() {
    return {
      activeWaves,
      bullets,
      enemyBullets,
      enemies,
      pickups,
      particles
    };
  }

  function startDeathAnim() {
    const floor = currentFloor() || FLOORS[0];
    const accent = accentColor((floor && floor.accent) || "yellow");
    const shardCount = AIPU.input.prefersReducedMotion ? 30 : 48;
    const duration = AIPU.input.prefersReducedMotion ? 1.35 : 1.55;
    const shards = [];

    for (let i = 0; i < shardCount; i += 1) {
      shards.push({
        angle: rand(0, Math.PI * 2),
        speed: rand(140, 360),
        delay: rand(0.24, 0.56),
        width: rand(5, 12),
        height: rand(3, 7),
        rotation: rand(0, Math.PI * 2),
        spin: rand(-6.8, 6.8)
      });
    }

    game.deathAnim = {
      t: 0,
      duration,
      originX: player.x,
      originY: player.y,
      accent,
      floorId: floor.id,
      floorName: floor.name,
      floorAccent: floor.accent,
      shards,
      shake: 5.2,
      shakeSeedX: rand(0, Math.PI * 2),
      shakeSeedY: rand(0, Math.PI * 2)
    };

    player.vx = 0;
    player.vy = 0;
    player.fireCooldown = 0;
    player.invuln = 0;
    player.shieldBreakFlash = 0;
    game.state = GameState.DEATH_ANIM;
  }

  function updateDeathAnim(dt) {
    const death = game.deathAnim;
    const floorSnapshot = death
      ? { id: death.floorId, name: death.floorName, accent: death.floorAccent }
      : null;
    if (!death) {
      enterDeathLesson(floorSnapshot);
      return;
    }

    death.t += dt;
    death.shake = death.t < 0.25 ? 5.2 * (1 - death.t / 0.25) : 0;

    if (death.t >= death.duration) {
      death.shake = 0;
      enterDeathLesson(floorSnapshot);
    }
  }

  function getDeathShakeOffset() {
    const death = game.deathAnim;
    if (!death || death.shake <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: Math.sin(death.t * 63 + death.shakeSeedX) * death.shake,
      y: Math.cos(death.t * 57 + death.shakeSeedY) * death.shake * 0.62
    };
  }

  function getShareRunData(floorOverride = null) {
    const floor = floorOverride || currentFloor() || FLOORS[Math.max(0, Math.min(game.currentFloorIndex, FLOORS.length - 1))];
    const floorId = floor ? floor.id : game.currentFloorIndex + 1;
    const maxFloors = FLOORS.length;
    const floorLabel = formatUiText("shareFloorLabel", "Floor {floor} of {maxFloors}", {
      floor: floorId,
      maxFloors
    });
    const buildEntries = upgrades.getRunBuildEntries();
    const upgradeLines = buildEntries.slice(0, 3).map((entry) => `${entry.def.name} x${entry.stack}`);
    const upgradesSummary = upgradeLines.join(", ");
    const shareUrl = resolveShareUrl();
    const text = buildShareCopy({
      floorReached: floorId,
      maxFloors,
      upgradesSummary,
      shareUrl
    });
    const accent = floor ? accentColor(floor.accent) : accentColor("pink");
    const cardDataUrl = buildRunCardDataUrl({
      floorReached: floorId,
      maxFloors,
      upgradeLines,
      accent,
      shareUrl
    });

    return {
      floorLabel,
      floorReached: floorId,
      maxFloors,
      upgradesSummary,
      upgradeLines,
      accent,
      text,
      shareUrl,
      cardDataUrl
    };
  }

  function enterGameOver(floorOverride = null) {
    game.state = GameState.GAME_OVER;
    if (game.gameOverEntryHandled) {
      return;
    }

    game.gameOverEntryHandled = true;
    shareUI.open(getShareRunData(floorOverride));
  }

  function resolveDeathLessonBucket(floorId) {
    const safeFloor = Math.max(1, Number.parseInt(String(floorId), 10) || 1);
    if (safeFloor <= 3) {
      return "early";
    }
    if (safeFloor <= 6) {
      return "mid";
    }
    return "late";
  }

  function enterDeathLesson(floorOverride = null) {
    const floor =
      floorOverride ||
      currentFloor() ||
      FLOORS[Math.max(0, Math.min(game.currentFloorIndex, FLOORS.length - 1))] ||
      { id: Math.max(1, game.currentFloorIndex + 1), accent: "blue" };
    game.state = GameState.DEATH_LESSON;
    game.deathLessonBucket = resolveDeathLessonBucket(floor.id);
    game.deathLessonIndex = Math.abs(Math.floor(game.globalTime * 1000) + game.kills + floor.id * 31);
    game.gameOverEntryHandled = false;
    deathLessonAdvanceLockUntil = nowMs() + OVERLAY_ADVANCE_LOCK_MS;
    resetDeathAnim();
    clearInputState();
  }

  function requestRestart() {
    shareUI.close({ persistChoice: false, restoreFocus: false });
    toTitle();
  }

  function syncOverlayRestartButton() {
    if (!overlayRestartBtn) {
      return;
    }
    const show = game.state === GameState.GAME_OVER && !shareUI.isOpen();
    overlayRestartBtn.classList.toggle("hidden", !show);
  }

  function toTitle() {
    game.state = GameState.TITLE;
    simAccumulator = 0;
    if (AIPU.renderCache && typeof AIPU.renderCache.invalidate === "function") {
      AIPU.renderCache.invalidate("toTitle");
    }
    game.currentFloorIndex = 0;
    game.floorTimer = 0;
    game.floorDuration = 0;
    game.floorElapsed = 0;
    game.introTimer = 0;
    game.clearTimer = 0;
    game.kills = 0;
    game.titleIntroTime = 0;
    game.upgradeOptions = [];
    game.upgradeSelectedIndex = 0;
    game.upgradeConfirmCooldown = 0;
    game.upgradeNoticeTimer = 0;
    game.upgradeCardRects = [];
    game.floorLessonUpgradeId = "";
    game.floorFallbackInvulnBonus = 0;
    game.bombChargesPerFloor = BOMB_CHARGES_BASE;
    game.bombChargesRemaining = BOMB_CHARGES_BASE;
    game.bombFlashTimer = 0;
    game.bombBriefingSeenIntroThisRun = false;
    game.bombBriefingSeenUpgradeThisRun = false;
    game.bombBriefingSeenFinalUpgradeThisRun = false;
    game.bombBriefingMode = "intro";
    game.bombBriefingEnterCount = 0;
    game.lessonSlideSeenThisFloor = false;
    game.lessonSlideEnterCount = 0;
    game.deathLessonBucket = "";
    game.deathLessonIndex = 0;
    game.rearShotDirectionKey = "";
    game.rearShotHoldTime = 0;
    game.rearShotHintMode = "";
    game.rearShotDualHintSeen = false;
    game.rearShotOmniHintSeen = false;
    game.rearShotHintTimer = 0;
    bulletColorCycleIndex = 0;
    lessonSlideAdvanceLockUntil = 0;
    deathLessonAdvanceLockUntil = 0;
    game.gameOverEntryHandled = false;
    upgrades.invalidateDerivedStats();
    shareUI.close({ persistChoice: false, restoreFocus: false });
    resetDeathAnim();
    upgrades.resetUpgradeRun();
    resetCollections();
    player.maxHearts = BASE_MAX_HP;
    player.hearts = BASE_MAX_HP;
    player.shieldCharges = 0;
    player.shieldBreakFlash = 0;
    resetPlayerPosition();
  }

  function startRun(forcedStartFloor = null) {
    game.kills = 0;
    game.gameOverEntryHandled = false;
    game.bombBriefingSeenIntroThisRun = false;
    game.bombBriefingSeenUpgradeThisRun = false;
    game.bombBriefingSeenFinalUpgradeThisRun = false;
    game.bombBriefingMode = "intro";
    game.bombBriefingEnterCount = 0;
    game.lessonSlideSeenThisFloor = false;
    game.lessonSlideEnterCount = 0;
    game.deathLessonBucket = "";
    game.deathLessonIndex = 0;
    game.rearShotDirectionKey = "";
    game.rearShotHoldTime = 0;
    game.rearShotHintMode = "";
    game.rearShotDualHintSeen = false;
    game.rearShotOmniHintSeen = false;
    game.rearShotHintTimer = 0;
    bulletColorCycleIndex = 0;
    lessonSlideAdvanceLockUntil = 0;
    deathLessonAdvanceLockUntil = 0;
    upgrades.resetUpgradeRun();
    const checkpointFloor = forcedStartFloor == null ? getCheckpointFloor() : normalizeCheckpointFloor(forcedStartFloor);
    startFloor(checkpointFloor - 1);
  }

  function startFloor(index) {
    game.currentFloorIndex = index;
    simAccumulator = 0;
    const nextFloor = FLOORS[index] || null;
    if (AIPU.renderCache && typeof AIPU.renderCache.markFloor === "function" && nextFloor) {
      AIPU.renderCache.markFloor(nextFloor.id, nextFloor.accent);
    }
    game.floorDuration = 0;
    game.floorTimer = 0;
    game.floorElapsed = 0;
    game.introTimer = 0;
    game.clearTimer = 0;
    game.beatCount = 0;

    resetCollections();

    game.upgradeOptions = upgrades.rollUpgradeOptions(index, 3);
    game.upgradeSelectedIndex = 0;
    game.upgradeConfirmCooldown = 0;
    game.upgradeNoticeTimer = 0;
    game.upgradeCardRects = [];
    game.floorLessonUpgradeId = "";
    game.floorFallbackInvulnBonus = 0;
    game.bombChargesPerFloor = BOMB_CHARGES_BASE;
    game.bombChargesRemaining = BOMB_CHARGES_BASE;
    game.bombFlashTimer = 0;
    game.bombBriefingEnterCount = 0;
    game.lessonSlideSeenThisFloor = false;
    game.lessonSlideEnterCount = 0;
    game.deathLessonBucket = "";
    game.deathLessonIndex = 0;
    game.rearShotDirectionKey = "";
    game.rearShotHoldTime = 0;
    game.rearShotHintMode = "";
    game.rearShotHintTimer = 0;
    lessonSlideAdvanceLockUntil = 0;
    deathLessonAdvanceLockUntil = 0;
    game.gameOverEntryHandled = false;
    upgrades.invalidateDerivedStats();
    shareUI.close({ persistChoice: false, restoreFocus: false });
    resetDeathAnim();
    normalizeUpgradeSelection();
    upgrades.syncPlayerMaxHP(false);
    player.invuln = 0;
    player.fireCooldown = 0;
    player.shieldBreakFlash = 0;
    resetPlayerPosition();
    game.state = GameState.UPGRADE_SELECT;
  }

  function beginCurrentFloor() {
    const floor = currentFloor();
    if (!floor) {
      return;
    }
    if (AIPU.renderCache && typeof AIPU.renderCache.markFloor === "function") {
      AIPU.renderCache.markFloor(floor.id, floor.accent);
    }

    game.floorDuration = floor.durationSeconds;
    game.floorTimer = floor.durationSeconds;
    game.floorElapsed = 0;
    game.introTimer = 2.8;
    game.clearTimer = 0;
    game.beatCount = 0;
    game.state = GameState.FLOOR_INTRO;

    resetCollections();

    activeWaves = floor.enemyWaves.map((w) => ({ ...w, _accum: 0 }));
    upgrades.invalidateDerivedStats();
    upgrades.syncPlayerMaxHP(false);
    player.hearts = clamp(player.hearts + 1, 0, player.maxHearts);
    player.shieldCharges = upgrades.getShieldChargesPerFloor();
    player.shieldBreakFlash = 0;
    player.invuln = 0;
    player.fireCooldown = 0;
    game.bombChargesPerFloor =
      floor.id >= BOMB_CHARGES_FINAL_FLOOR
        ? BOMB_CHARGES_FINAL
        : floor.id >= BOMB_CHARGES_UPGRADE_FLOOR
          ? BOMB_CHARGES_UPGRADED
          : BOMB_CHARGES_BASE;
    game.bombChargesRemaining = game.bombChargesPerFloor;
    game.bombFlashTimer = 0;
    game.upgradeConfirmCooldown = 0;
    game.rearShotDirectionKey = "";
    game.rearShotHoldTime = 0;
    game.rearShotHintMode = "";
    game.rearShotHintTimer = 0;
    resetPlayerPosition();

    spawnInitialHearts(floor);
  }

  function enterLessonSlide() {
    game.state = GameState.LESSON_SLIDE;
    game.lessonSlideSeenThisFloor = true;
    game.lessonSlideEnterCount = 0;
    lessonSlideAdvanceLockUntil = nowMs() + OVERLAY_ADVANCE_LOCK_MS;
    clearInputState();
  }

  function resetPlayerPosition() {
    player.x = WORLD.x + WORLD.w * 0.5;
    player.y = WORLD.y + WORLD.h * 0.86;
    player.vx = 0;
    player.vy = 0;
  }

  function spawnInitialHearts(floor) {
    const count = floor.heartSpawn.initialCount ?? 1;
    for (let i = 0; i < count; i += 1) {
      const px = rand(WORLD.x + 48, WORLD.x + WORLD.w - 48);
      const py = rand(WORLD.y + 54, WORLD.y + WORLD.h - 120);
      pickups.push({
        x: px,
        y: py,
        radius: 11,
        type: floor.heartType,
        wobble: rand(0, Math.PI * 2)
      });
    }
  }

  function update(deltaTime) {
    const frameDt = Math.max(0, Math.min(deltaTime, MAX_ACCUMULATED_TIME));
    simAccumulator = Math.min(simAccumulator + frameDt, MAX_ACCUMULATED_TIME);

    while (simAccumulator >= SIM_STEP) {
      stepSimulation(SIM_STEP);
      simAccumulator -= SIM_STEP;
    }
  }

  function stepSimulation(dt) {
    game.globalTime += dt;

    if (player.invuln > 0) {
      player.invuln = Math.max(0, player.invuln - dt);
    }

    if (player.fireCooldown > 0) {
      player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    }

    if (game.upgradeConfirmCooldown > 0) {
      game.upgradeConfirmCooldown = Math.max(0, game.upgradeConfirmCooldown - dt);
    }

    if (game.upgradeNoticeTimer > 0) {
      game.upgradeNoticeTimer = Math.max(0, game.upgradeNoticeTimer - dt);
    }

    if (game.bombFlashTimer > 0) {
      game.bombFlashTimer = Math.max(0, game.bombFlashTimer - dt);
    }

    if (game.rearShotHintTimer > 0) {
      game.rearShotHintTimer = Math.max(0, game.rearShotHintTimer - dt);
    }

    if (player.shieldBreakFlash > 0) {
      player.shieldBreakFlash = Math.max(0, player.shieldBreakFlash - dt);
    }

    if (game.state !== GameState.DEATH_ANIM) {
      updateParticles(dt);
    }

    if (game.state === GameState.TITLE) {
      game.titleIntroTime += dt;
      return;
    }

    if (game.state === GameState.UPGRADE_SELECT) {
      return;
    }

    if (game.state === GameState.BOMB_BRIEFING) {
      return;
    }

    if (game.state === GameState.LESSON_SLIDE) {
      return;
    }

    if (game.state === GameState.DEATH_LESSON) {
      return;
    }

    if (game.state === GameState.DEATH_ANIM) {
      updateDeathAnim(dt);
      return;
    }

    if (game.state === GameState.FLOOR_INTRO) {
      updateGameplay(dt, false);
      if (game.state === GameState.DEATH_ANIM) {
        updateDeathAnim(dt);
        return;
      }
      game.introTimer -= dt;
      if (game.introTimer <= 0) {
        game.state = GameState.PLAYING;
      }
      return;
    }

    if (game.state === GameState.PLAYING) {
      game.floorElapsed += dt;
      game.floorTimer = Math.max(0, game.floorDuration - game.floorElapsed);

      updateGameplay(dt, true);
      if (game.state === GameState.DEATH_ANIM) {
        updateDeathAnim(dt);
        return;
      }

      if (game.floorTimer <= 0) {
        game.state = GameState.FLOOR_CLEAR;
        game.clearTimer = 2.2;
      }
      return;
    }

    if (game.state === GameState.FLOOR_CLEAR) {
      updateGameplay(dt, false);
      game.clearTimer -= dt;
      if (game.clearTimer <= 0) {
        if (game.currentFloorIndex < FLOORS.length - 1) {
          startFloor(game.currentFloorIndex + 1);
        } else {
          clearCheckpointFloor();
          game.state = GameState.VICTORY;
        }
      }
      return;
    }

    if (game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) {
      if (game.state === GameState.GAME_OVER && !game.gameOverEntryHandled) {
        enterGameOver();
      }
      updateBullets(dt);
      updateEnemyBullets(dt);
      updateEnemies(dt, false);
    }
  }

  function updateGameplay(dt, allowSpawns) {
    updatePlayerMovement(dt);
    updatePlayerShooting(dt);

    updateBullets(dt);
    updateEnemyBullets(dt);

    if (allowSpawns) {
      updateSpawns(dt);
    }

    updateEnemies(dt, true);
    updatePickups(dt);
    handleCollisions();
  }

  function triggerBomb() {
    if (game.state !== GameState.PLAYING || game.bombChargesRemaining <= 0) {
      return;
    }

    const removedEnemies = enemies.length;
    if (removedEnemies > 0) {
      game.kills += removedEnemies;
    }

    game.bombChargesRemaining = Math.max(0, game.bombChargesRemaining - 1);
    game.bombFlashTimer = BOMB_FLASH_DURATION;

    const flashAccent = currentAccent();
    emitBurst(WORLD.x + WORLD.w * 0.5, WORLD.y + WORLD.h * 0.5, flashAccent, 16, 180);
    emitBurst(player.x, player.y, flashAccent, 10, 210);

    enemies = [];
    enemyBullets = [];
  }

  function updatePlayerMovement(dt) {
    const moveX = (isMoveRight() ? 1 : 0) - (isMoveLeft() ? 1 : 0);
    const moveY = (isMoveDown() ? 1 : 0) - (isMoveUp() ? 1 : 0);

    const length = Math.hypot(moveX, moveY) || 1;
    const speed = upgrades.getPlayerSpeed();
    const targetX = (moveX / length) * speed;
    const targetY = (moveY / length) * speed;

    if (moveX !== 0 || moveY !== 0) {
      player.vx = approach(player.vx, targetX, 1880 * dt);
      player.vy = approach(player.vy, targetY, 1880 * dt);
    } else {
      player.vx = approach(player.vx, 0, 2280 * dt);
      player.vy = approach(player.vy, 0, 2280 * dt);
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, WORLD.x + player.radius, WORLD.x + WORLD.w - player.radius);
    player.y = clamp(player.y, WORLD.y + player.radius, WORLD.y + WORLD.h - player.radius);
  }

  function updatePlayerShooting(dt) {
    const dir = getShootDirection();
    updateRearShotTracking(dir, dt);
    if (!dir) {
      return;
    }

    player.lastAimX = dir.x;
    player.lastAimY = dir.y;

    if (player.fireCooldown > 0 || game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) {
      return;
    }

    const bulletSpeed = upgrades.getBulletSpeed();
    const bulletRadius = upgrades.getBulletRadius();
    const bulletPierce = upgrades.getBulletPierce();
    const burstMode =
      game.state === GameState.PLAYING ? resolveDirectionalBurstMode(game.rearShotHoldTime) : "normal";
    const volleyDirections = getPlayerVolleyDirections(dir, burstMode);
    const volleyColors = takeCogsecVolleyColors(volleyDirections.length);

    for (let i = 0; i < volleyDirections.length; i += 1) {
      spawnPlayerBullet(volleyDirections[i], bulletSpeed, bulletRadius, bulletPierce, volleyColors[i]);
    }

    if (game.state === GameState.PLAYING) {
      maybeShowDirectionalBurstHint(burstMode);
    }

    player.fireCooldown = upgrades.getFireCooldown();
  }

  function updateRearShotTracking(dir, dt) {
    if (game.state !== GameState.PLAYING || !dir) {
      game.rearShotDirectionKey = "";
      game.rearShotHoldTime = 0;
      return;
    }

    const directionKey = `${dir.x},${dir.y}`;
    if (game.rearShotDirectionKey === directionKey) {
      game.rearShotHoldTime += dt;
      return;
    }

    game.rearShotDirectionKey = directionKey;
    game.rearShotHoldTime = dt;
  }

  function resolveDirectionalBurstMode(holdSeconds = game.rearShotHoldTime, floorId = null) {
    const hold = Math.max(0, Number(holdSeconds) || 0);
    const fallbackFloorId = Math.max(1, game.currentFloorIndex + 1);
    const activeFloorId = floorId == null ? (currentFloor() && currentFloor().id) || fallbackFloorId : Math.max(1, Number(floorId) || fallbackFloorId);

    if (activeFloorId < DUAL_SHOT_UNLOCK_FLOOR) {
      return "normal";
    }

    if (activeFloorId < OMNI_SHOT_UNLOCK_FLOOR) {
      if (hold >= REAR_SHOT_TRIGGER_SECONDS) {
        return "dual";
      }
      return "normal";
    }

    if (hold >= ALL_DIRECTION_SHOT_TRIGGER_SECONDS) {
      return "omni";
    }
    if (hold >= REAR_SHOT_TRIGGER_SECONDS) {
      return "dual";
    }
    return "normal";
  }

  function getDirectionalBurstStatus() {
    const holdSeconds = Math.max(0, Number(game.rearShotHoldTime) || 0);
    const floor = currentFloor();
    const floorId = floor && Number.isFinite(floor.id) ? floor.id : Math.max(1, game.currentFloorIndex + 1);
    const dualUnlocked = floorId >= DUAL_SHOT_UNLOCK_FLOOR;
    const omniUnlocked = floorId >= OMNI_SHOT_UNLOCK_FLOOR;
    const dualThreshold = Math.max(0.001, REAR_SHOT_TRIGGER_SECONDS);
    const omniThreshold = Math.max(dualThreshold, ALL_DIRECTION_SHOT_TRIGGER_SECONDS);
    const mode = resolveDirectionalBurstMode(holdSeconds, floorId);
    const label = mode === "omni" ? "Omni" : mode === "dual" ? "Dual" : "Normal";

    if (!dualUnlocked) {
      return {
        mode: "normal",
        label: "Normal",
        holdSeconds,
        dualThreshold,
        omniThreshold,
        nextLabel: "Dual",
          secondsToNext: 0,
          progressToNext: 0,
          detailOverride: formatUiText("burstUnlockFloor", "Unlocks on Floor {floor}", {
            floor: DUAL_SHOT_UNLOCK_FLOOR
          })
        };
    }

    if (mode === "normal") {
      return {
        mode,
        label,
        holdSeconds,
        dualThreshold,
        omniThreshold,
        nextLabel: "Dual",
        secondsToNext: Math.max(0, dualThreshold - holdSeconds),
        progressToNext: clamp(holdSeconds / dualThreshold, 0, 1)
      };
    }

    if (mode === "dual") {
      if (!omniUnlocked) {
        return {
          mode,
          label,
          holdSeconds,
          dualThreshold,
          omniThreshold,
          nextLabel: "Omni",
          secondsToNext: 0,
          progressToNext: 1,
          detailOverride: formatUiText("burstOmniUnlockFloor", "Omni unlocks on Floor {floor}", {
            floor: OMNI_SHOT_UNLOCK_FLOOR
          })
        };
      }

      const span = Math.max(0.001, omniThreshold - dualThreshold);
      return {
        mode,
        label,
        holdSeconds,
        dualThreshold,
        omniThreshold,
        nextLabel: "Omni",
        secondsToNext: Math.max(0, omniThreshold - holdSeconds),
        progressToNext: clamp((holdSeconds - dualThreshold) / span, 0, 1)
      };
    }

    return {
      mode,
      label,
      holdSeconds,
      dualThreshold,
      omniThreshold,
      nextLabel: "",
      secondsToNext: 0,
      progressToNext: 1
    };
  }

  function getPlayerVolleyDirections(primaryDir, burstMode) {
    if (burstMode === "normal") {
      return [primaryDir];
    }

    if (burstMode === "dual") {
      return [primaryDir, { x: -primaryDir.x, y: -primaryDir.y }];
    }

    return [
      primaryDir,
      { x: -primaryDir.x, y: -primaryDir.y },
      { x: -primaryDir.y, y: primaryDir.x },
      { x: primaryDir.y, y: -primaryDir.x }
    ];
  }

  function nextCogsecBulletColor() {
    if (COGSEC_BULLET_COLORS.length === 0) {
      return TOKENS.yellow;
    }
    const color = COGSEC_BULLET_COLORS[bulletColorCycleIndex % COGSEC_BULLET_COLORS.length];
    bulletColorCycleIndex = (bulletColorCycleIndex + 1) % COGSEC_BULLET_COLORS.length;
    return color || TOKENS.yellow;
  }

  function takeCogsecVolleyColors(count) {
    const colors = [];
    for (let i = 0; i < count; i += 1) {
      colors.push(nextCogsecBulletColor());
    }
    return colors;
  }

  function maybeShowDirectionalBurstHint(burstMode) {
    if (burstMode === "omni" && !game.rearShotOmniHintSeen) {
      game.rearShotOmniHintSeen = true;
      game.rearShotHintMode = "omni";
      game.rearShotHintTimer = REAR_SHOT_NOTICE_DURATION;
      return;
    }

    if (burstMode === "dual" && !game.rearShotDualHintSeen) {
      game.rearShotDualHintSeen = true;
      game.rearShotHintMode = "dual";
      game.rearShotHintTimer = REAR_SHOT_NOTICE_DURATION;
    }
  }

  function spawnPlayerBullet(dir, bulletSpeed, bulletRadius, bulletPierce, colorOverride = "") {
    const spawnDistance = player.radius + 9;
    bullets.push({
      x: player.x + dir.x * spawnDistance,
      y: player.y + dir.y * spawnDistance,
      vx: dir.x * bulletSpeed,
      vy: dir.y * bulletSpeed,
      radius: bulletRadius,
      pierce: bulletPierce,
      life: 0.95,
      color: colorOverride || nextCogsecBulletColor(),
      hitEnemyIds: new Set()
    });
  }

  function getShootDirection() {
    if (keys[AIPU.input.lastShootKey]) {
      return arrowKeyToVector(AIPU.input.lastShootKey);
    }

    if (keys.ArrowUp) return { x: 0, y: -1 };
    if (keys.ArrowDown) return { x: 0, y: 1 };
    if (keys.ArrowLeft) return { x: -1, y: 0 };
    if (keys.ArrowRight) return { x: 1, y: 0 };

    return null;
  }

  function updateSpawns(dt) {
    if (enemies.length > 58) {
      return;
    }

    for (const waveCfg of activeWaves) {
      if (game.floorElapsed < waveCfg.startTime || game.floorElapsed > waveCfg.endTime) {
        continue;
      }

      const span = Math.max(0.001, waveCfg.endTime - waveCfg.startTime);
      const phase = clamp((game.floorElapsed - waveCfg.startTime) / span, 0, 1);
      const spawnRate = lerp(waveCfg.spawnRateStart, waveCfg.spawnRateEnd, phase);

      waveCfg._accum += spawnRate * dt;

      while (waveCfg._accum >= 1) {
        spawnEnemyFromWave(waveCfg, phase);
        waveCfg._accum -= 1;
      }
    }
  }

  function spawnEnemyFromWave(waveCfg, phase) {
    const def = ENEMY_DEFS[waveCfg.enemyType];
    if (!def) {
      return;
    }

    const flags = new Set(waveCfg.specialFlags || []);
    const speedMultiplier = lerp(waveCfg.speedMultiplierStart, waveCfg.speedMultiplierEnd, phase);
    const shootCooldownOpenMin = Number.isFinite(def.shootCooldownOpenMin) ? def.shootCooldownOpenMin : 0.55;
    const shootCooldownOpenMax = Number.isFinite(def.shootCooldownOpenMax) ? def.shootCooldownOpenMax : 1.45;
    const shootCooldownMin = Number.isFinite(def.shootCooldownMin) ? def.shootCooldownMin : 0.9;
    const shootCooldownMax = Number.isFinite(def.shootCooldownMax) ? def.shootCooldownMax : 1.55;
    const firstShotDelay = Number.isFinite(def.firstShotDelay) ? def.firstShotDelay : 0;

    const spawnPoint = findSpawnPoint(flags, waveCfg.enemyType);

    enemies.push({
      id: ++AIPU.state.enemyIdCounter,
      type: waveCfg.enemyType,
      behavior: def.behavior,
      x: spawnPoint.x,
      y: spawnPoint.y,
      side: spawnPoint.side,
      radius: def.size,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed * speedMultiplier,
      touchDamage: def.touchDamage,
      vx: 0,
      vy: 0,
      age: 0,
      hurtFlash: 0,
      flags,
      shootCooldown: rand(shootCooldownOpenMin, shootCooldownOpenMax),
      shootCooldownMin,
      shootCooldownMax,
      firstShotDelay,
      chargeState: "idle",
      chargeTimer: rand(0.3, 1.1),
      chargeDirX: 0,
      chargeDirY: 0,
      splitRemaining: flags.has("canSplit") || waveCfg.enemyType === "cell_blob" ? 1 : 0,
      localSeed: rand(0, 999)
    });
  }

  function findSpawnPoint(flags, enemyType) {
    if (enemyType === "reach_shadow") {
      const side = Math.random() < 0.5 ? -1 : 1;
      return {
        x: side < 0 ? WORLD.x + 10 : WORLD.x + WORLD.w - 10,
        y: rand(WORLD.y + 36, WORLD.y + WORLD.h - 36),
        side
      };
    }

    if (flags.has("spawnsBehindPlayer") && Math.random() < 0.42) {
      const px = clamp(player.x + rand(-210, 210), WORLD.x + 24, WORLD.x + WORLD.w - 24);
      const py = clamp(player.y + rand(140, 250), WORLD.y + 24, WORLD.y + WORLD.h - 24);
      return { x: px, y: py, side: 0 };
    }

    const roll = Math.random();

    if (roll < 0.5) {
      return { x: rand(WORLD.x + 20, WORLD.x + WORLD.w - 20), y: WORLD.y + 10, side: 0 };
    }

    if (roll < 0.75) {
      return { x: WORLD.x + 12, y: rand(WORLD.y + 18, WORLD.y + WORLD.h - 18), side: -1 };
    }

    return { x: WORLD.x + WORLD.w - 12, y: rand(WORLD.y + 18, WORLD.y + WORLD.h - 18), side: 1 };
  }

  function updateBullets(dt) {
    let write = 0;
    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      const alive =
        bullet.life > 0 &&
        bullet.x > WORLD.x - 30 &&
        bullet.x < WORLD.x + WORLD.w + 30 &&
        bullet.y > WORLD.y - 30 &&
        bullet.y < WORLD.y + WORLD.h + 30;
      if (!alive) {
        continue;
      }
      bullets[write] = bullet;
      write += 1;
    }
    bullets.length = write;
  }

  function updateEnemyBullets(dt) {
    let write = 0;
    for (let i = 0; i < enemyBullets.length; i += 1) {
      const bullet = enemyBullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      const alive =
        bullet.life > 0 &&
        bullet.x > WORLD.x - 40 &&
        bullet.x < WORLD.x + WORLD.w + 40 &&
        bullet.y > WORLD.y - 40 &&
        bullet.y < WORLD.y + WORLD.h + 40;
      if (!alive) {
        continue;
      }
      enemyBullets[write] = bullet;
      write += 1;
    }
    enemyBullets.length = write;
  }

  function updateEnemies(dt, canAttack) {
    const floor = currentFloor();
    const floorPhase = game.floorDuration > 0 ? clamp(game.floorElapsed / game.floorDuration, 0, 1) : 0;

    for (const enemy of enemies) {
      enemy.age += dt;
      enemy.hurtFlash = Math.max(0, enemy.hurtFlash - dt * 5.4);

      const chase = unitVector(player.x - enemy.x, player.y - enemy.y);

      if (enemy.behavior === "chase" || enemy.behavior === "tank") {
        const turn = enemy.behavior === "tank" ? 3 : 5;
        enemy.vx = lerp(enemy.vx, chase.x * enemy.speed, clamp(turn * dt, 0, 1));
        enemy.vy = lerp(enemy.vy, chase.y * enemy.speed, clamp(turn * dt, 0, 1));
      } else if (enemy.behavior === "swarm") {
        const orbit = Math.sin(game.globalTime * 5.2 + enemy.localSeed) * 0.45;
        const tangentX = -chase.y;
        const tangentY = chase.x;
        enemy.vx = lerp(enemy.vx, (chase.x + tangentX * orbit) * enemy.speed, clamp(6 * dt, 0, 1));
        enemy.vy = lerp(enemy.vy, (chase.y + tangentY * orbit) * enemy.speed, clamp(6 * dt, 0, 1));
      } else if (enemy.behavior === "dash") {
        updateDasher(enemy, chase, dt, 2.45);
      } else if (enemy.behavior === "charge") {
        const lateBoost = 1 + floorPhase * 0.22;
        updateDasher(enemy, chase, dt, 3.0 * lateBoost);
      } else if (enemy.behavior === "phase") {
        const drift = Math.sin(enemy.age * 4.5 + enemy.localSeed) * 0.5;
        enemy.vx = lerp(enemy.vx, (chase.x + drift * 0.35) * enemy.speed, clamp(4.6 * dt, 0, 1));
        enemy.vy = lerp(enemy.vy, (chase.y - drift * 0.35) * enemy.speed, clamp(4.6 * dt, 0, 1));
      } else if (enemy.behavior === "mirror") {
        const mirroredX = player.vx * 0.8 + chase.x * enemy.speed * 0.35;
        const mirroredY = player.vy * 0.8 + chase.y * enemy.speed * 0.35;
        enemy.vx = lerp(enemy.vx, mirroredX, clamp(7 * dt, 0, 1));
        enemy.vy = lerp(enemy.vy, mirroredY, clamp(7 * dt, 0, 1));
      } else if (enemy.behavior === "blob") {
        const wobble = Math.sin(enemy.age * 6 + enemy.localSeed) * 0.28;
        enemy.vx = lerp(enemy.vx, (chase.x + wobble) * enemy.speed, clamp(3.8 * dt, 0, 1));
        enemy.vy = lerp(enemy.vy, (chase.y - wobble) * enemy.speed, clamp(3.8 * dt, 0, 1));
      } else if (enemy.behavior === "ranged") {
        const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        const desired = distance > 210 ? 1 : distance < 145 ? -1 : 0;
        enemy.vx = lerp(enemy.vx, chase.x * enemy.speed * desired, clamp(4 * dt, 0, 1));
        enemy.vy = lerp(enemy.vy, chase.y * enemy.speed * desired, clamp(4 * dt, 0, 1));

        if (canAttack && enemy.age >= (enemy.firstShotDelay || 0)) {
          enemy.shootCooldown -= dt;
          if (enemy.shootCooldown <= 0) {
            const shot = unitVector(player.x - enemy.x, player.y - enemy.y);
            spawnEnemyBullet(enemy.x, enemy.y, shot.x, shot.y, ENEMY_DEFS[enemy.type].projectileSpeed || 180, 1);
            enemy.shootCooldown = rand(enemy.shootCooldownMin || 0.9, enemy.shootCooldownMax || 1.55);
          }
        }
      } else if (enemy.behavior === "wallhand") {
        const reach = 22 + 36 * floorPhase + Math.sin(enemy.age * 2.8 + enemy.localSeed) * 18;
        const side = enemy.side < 0 ? -1 : 1;
        enemy.x = side < 0 ? WORLD.x + 10 + reach : WORLD.x + WORLD.w - 10 - reach;
        const targetY = player.y + Math.sin(enemy.age * 1.7 + enemy.localSeed) * 32;
        enemy.y = lerp(enemy.y, clamp(targetY, WORLD.y + enemy.radius, WORLD.y + WORLD.h - enemy.radius), clamp(5 * dt, 0, 1));
      } else if (enemy.behavior === "boss") {
        const pattern = floorPhase > 0.62 ? 1.45 : 1;
        updateDasher(enemy, chase, dt, 3.2 * pattern);

        if (canAttack) {
          enemy.shootCooldown -= dt;
          if (enemy.shootCooldown <= 0) {
            const burst = floorPhase > 0.62 ? 5 : 3;
            for (let i = 0; i < burst; i += 1) {
              const angle = Math.atan2(chase.y, chase.x) + (-0.26 + (0.52 * i) / Math.max(1, burst - 1));
              spawnEnemyBullet(enemy.x, enemy.y, Math.cos(angle), Math.sin(angle), 210 + floor.id * 4, 1);
            }
            enemy.shootCooldown = floorPhase > 0.62 ? rand(0.85, 1.1) : rand(1.25, 1.8);
          }
        }
      }

      if (enemy.behavior !== "wallhand") {
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
      }

      enemy.x = clamp(enemy.x, WORLD.x + enemy.radius, WORLD.x + WORLD.w - enemy.radius);
      enemy.y = clamp(enemy.y, WORLD.y + enemy.radius, WORLD.y + WORLD.h - enemy.radius);
    }
  }

  function updateDasher(enemy, chase, dt, dashMultiplier) {
    enemy.chargeTimer -= dt;

    if (enemy.chargeState === "idle") {
      enemy.vx = lerp(enemy.vx, chase.x * enemy.speed * 0.68, clamp(6 * dt, 0, 1));
      enemy.vy = lerp(enemy.vy, chase.y * enemy.speed * 0.68, clamp(6 * dt, 0, 1));
      if (enemy.chargeTimer <= 0) {
        enemy.chargeState = "warmup";
        enemy.chargeTimer = rand(0.22, 0.38);
        enemy.chargeDirX = chase.x;
        enemy.chargeDirY = chase.y;
      }
      return;
    }

    if (enemy.chargeState === "warmup") {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      if (enemy.chargeTimer <= 0) {
        enemy.chargeState = "dash";
        enemy.chargeTimer = rand(0.16, 0.28);
        enemy.vx = enemy.chargeDirX * enemy.speed * dashMultiplier;
        enemy.vy = enemy.chargeDirY * enemy.speed * dashMultiplier;
      }
      return;
    }

    if (enemy.chargeState === "dash" && enemy.chargeTimer <= 0) {
      enemy.chargeState = "idle";
      enemy.chargeTimer = rand(0.75, 1.35);
    }
  }

  function spawnEnemyBullet(x, y, dirX, dirY, speed, damage) {
    const speedMultiplier = upgrades.getEnemyBulletSpeedMultiplier();
    const adjustedSpeed = speed * speedMultiplier;
    enemyBullets.push({
      x,
      y,
      vx: dirX * adjustedSpeed,
      vy: dirY * adjustedSpeed,
      damage,
      radius: 6,
      life: 2.3,
      color: nextCogsecBulletColor()
    });
  }

  function updatePickups(dt) {
    const magnetRadius = upgrades.getPickupMagnetRadius();
    for (const pickup of pickups) {
      pickup.wobble += dt * 2.2;

      if (magnetRadius <= 0) {
        continue;
      }

      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (distance >= magnetRadius) {
        continue;
      }

      const intensity = 1 - distance / magnetRadius;
      const pull = 85 + intensity * 260;
      pickup.x += (dx / distance) * pull * dt;
      pickup.y += (dy / distance) * pull * dt;

      pickup.x = clamp(pickup.x, WORLD.x + pickup.radius, WORLD.x + WORLD.w - pickup.radius);
      pickup.y = clamp(pickup.y, WORLD.y + pickup.radius, WORLD.y + WORLD.h - pickup.radius);
    }
  }

  function handleCollisions() {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      let hitIndex = -1;

      for (let j = 0; j < enemies.length; j += 1) {
        if (bullet.hitEnemyIds && bullet.hitEnemyIds.has(enemies[j].id)) {
          continue;
        }
        if (circleHit(bullet.x, bullet.y, bullet.radius, enemies[j].x, enemies[j].y, enemies[j].radius)) {
          hitIndex = j;
          break;
        }
      }

      if (hitIndex >= 0) {
        const enemy = enemies[hitIndex];
        enemy.hp -= 1;
        enemy.hurtFlash = 1;
        if (bullet.hitEnemyIds) {
          bullet.hitEnemyIds.add(enemy.id);
        }
        emitBurst(enemy.x, enemy.y, currentAccent(), 7, 145);

        if (enemy.hp <= 0) {
          onEnemyDefeated(enemy);
          enemies.splice(hitIndex, 1);
        }

        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          bullets.splice(i, 1);
        }
      }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = enemyBullets[i];
      if (circleHit(player.x, player.y, player.radius, bullet.x, bullet.y, bullet.radius)) {
        enemyBullets.splice(i, 1);
        applyPlayerDamage(bullet.damage, bullet.x, bullet.y);
      }
    }

    for (const enemy of enemies) {
      if (circleHit(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) {
        applyPlayerDamage(enemy.touchDamage || 1, enemy.x, enemy.y);
      }
    }

    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const pickup = pickups[i];
      if (circleHit(player.x, player.y, player.radius + 2, pickup.x, pickup.y, pickup.radius + 2)) {
        pickups.splice(i, 1);
        player.hearts = clamp(player.hearts + 1, 0, player.maxHearts);
        emitBurst(player.x, player.y, TOKENS.white, 10, 170);
      }
    }
  }

  function onEnemyDefeated(enemy) {
    game.kills += 1;

    const floor = currentFloor();

    if ((enemy.flags.has("canSplit") || enemy.type === "cell_blob") && enemy.splitRemaining > 0 && enemy.radius > 7) {
      for (let i = 0; i < 2; i += 1) {
        const angle = rand(0, Math.PI * 2);
        enemies.push({
          id: ++AIPU.state.enemyIdCounter,
          type: "cell_blob",
          behavior: "blob",
          x: enemy.x + Math.cos(angle) * 12,
          y: enemy.y + Math.sin(angle) * 12,
          side: 0,
          radius: Math.max(7, enemy.radius - 2),
          hp: 1,
          maxHp: 1,
          speed: ENEMY_DEFS.cell_blob.speed * 1.25,
          touchDamage: 1,
          vx: Math.cos(angle) * 120,
          vy: Math.sin(angle) * 120,
          age: 0,
          hurtFlash: 0,
          flags: new Set(),
          shootCooldown: rand(0.9, 1.5),
          chargeState: "idle",
          chargeTimer: rand(0.45, 1.2),
          chargeDirX: 0,
          chargeDirY: 0,
          splitRemaining: 0,
          localSeed: rand(0, 999)
        });
      }
    }

    const chance = heartDropChance(floor);
    if (Math.random() < chance && player.hearts < player.maxHearts) {
      pickups.push({
        x: enemy.x,
        y: enemy.y,
        radius: 11,
        type: floor.heartType,
        wobble: rand(0, Math.PI * 2)
      });
    }
  }

  function heartDropChance(floor) {
    let chance = floor.heartSpawn.baseRate;
    if (floor.heartSpawn.clutchBoostStart && game.floorTimer <= floor.heartSpawn.clutchBoostStart) {
      chance += 0.08;
    }
    return clamp(chance, 0.05, 0.34);
  }

  function applyPlayerDamage(amount, sourceX, sourceY) {
    if (
      player.invuln > 0 ||
      game.state === GameState.DEATH_ANIM ||
      game.state === GameState.GAME_OVER ||
      game.state === GameState.VICTORY ||
      game.state === GameState.FLOOR_CLEAR
    ) {
      return;
    }

    const invulnDuration = upgrades.getInvulnDuration();
    if (player.shieldCharges > 0) {
      player.shieldCharges -= 1;
      player.shieldBreakFlash = 0.22;
      player.invuln = invulnDuration;
      emitBurst(player.x, player.y, currentAccent(), 10, 175);
      return;
    }

    player.hearts = clamp(player.hearts - amount, 0, player.maxHearts);
    if (player.hearts <= 0) {
      player.hearts = 0;
      const deathFloor = currentFloor();
      setCheckpointFloor((deathFloor && deathFloor.id) || game.currentFloorIndex + 1);
      startDeathAnim();
      return;
    }

    player.invuln = invulnDuration;

    const away = unitVector(player.x - sourceX, player.y - sourceY);
    player.x += away.x * 18;
    player.y += away.y * 18;
    player.x = clamp(player.x, WORLD.x + player.radius, WORLD.x + WORLD.w - player.radius);
    player.y = clamp(player.y, WORLD.y + player.radius, WORLD.y + WORLD.h - player.radius);

    emitBurst(player.x, player.y, TOKENS.white, 14, 200);
  }

  function emitBurst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const velocity = rand(speed * 0.35, speed);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(0.12, 0.32),
        maxLife: rand(0.12, 0.32),
        size: rand(2, 4),
        color
      });
    }
  }

  function updateParticles(dt) {
    let write = 0;
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vx *= 0.9;
      particle.vy *= 0.9;
      if (particle.life <= 0) {
        continue;
      }
      particles[write] = particle;
      write += 1;
    }
    particles.length = write;
  }

  function isMoveUp() {
    return !!keys.KeyW;
  }

  function isMoveLeft() {
    return !!keys.KeyA;
  }

  function isMoveDown() {
    return !!keys.KeyS;
  }

  function isMoveRight() {
    return !!keys.KeyD;
  }

  function normalizeUpgradeSelection() {
    if (game.upgradeOptions.length === 0) {
      game.upgradeSelectedIndex = 0;
      return;
    }
    game.upgradeSelectedIndex = clamp(game.upgradeSelectedIndex, 0, game.upgradeOptions.length - 1);
  }

  function shiftUpgradeSelection(delta) {
    if (game.state !== GameState.UPGRADE_SELECT || game.upgradeOptions.length === 0) {
      return;
    }

    const total = game.upgradeOptions.length;
    game.upgradeSelectedIndex = (game.upgradeSelectedIndex + delta + total) % total;
  }

  function shouldOpenBombBriefing() {
    const floor = currentFloor();
    if (!floor) {
      return "";
    }
    if (floor.id === 1 && !game.bombBriefingSeenIntroThisRun) {
      return "intro";
    }
    if (floor.id === BOMB_CHARGES_UPGRADE_FLOOR && !game.bombBriefingSeenUpgradeThisRun) {
      return "upgrade";
    }
    if (floor.id === BOMB_CHARGES_FINAL_FLOOR && !game.bombBriefingSeenFinalUpgradeThisRun) {
      return "upgrade_final";
    }
    return "";
  }

  function confirmUpgradeSelection(index) {
    if (game.state !== GameState.UPGRADE_SELECT) {
      return;
    }

    if (game.upgradeConfirmCooldown > 0) {
      return;
    }

    const option = game.upgradeOptions[index];
    if (!option) {
      game.upgradeNoticeTimer = 1.2;
      return;
    }

    game.upgradeSelectedIndex = index;
    const result = upgrades.applyUpgradeChoice(option);
    if (!result) {
      game.upgradeNoticeTimer = 1.2;
      return;
    }

    if (game.showDebugStats) {
      if (result.type === "fallback") {
        console.log(`[upgrade] floor ${currentFloor().id}: picked ${option.name} (${result.effectText})`);
      } else {
        console.log(`[upgrade] floor ${currentFloor().id}: picked ${option.name} (stack ${result.newStack}/${result.maxStacks})`);
      }
    }

    game.upgradeConfirmCooldown = 0.18;
    game.upgradeNoticeTimer = 0;
    game.floorLessonUpgradeId = option.fallbackBaseId || option.id;
    const bombBriefingMode = shouldOpenBombBriefing();
    if (bombBriefingMode) {
      game.state = GameState.BOMB_BRIEFING;
      game.bombBriefingMode = bombBriefingMode;
      game.bombBriefingEnterCount = 0;
      return;
    }
    enterLessonSlide();
  }

  AIPU.systems = {
    currentFloor,
    getCollections,
    resolveDirectionalBurstMode,
    getDirectionalBurstStatus,
    resetCollections,
    getUpgradeCardIndexAt,
    startDeathAnim,
    updateDeathAnim,
    getDeathShakeOffset,
    getShareRunData,
    enterGameOver,
    requestRestart,
    getCheckpointFloor,
    setCheckpointFloor,
    clearCheckpointFloor,
    syncOverlayRestartButton,
    toTitle,
    startRun,
    startFloor,
    beginCurrentFloor,
    update,
    updateGameplay,
    triggerBomb,
    emitBurst
  };
})();
