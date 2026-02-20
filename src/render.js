(() => {
  "use strict";

  const AIPU = window.AIPU;
  const mainCtx = AIPU.ctx;
  let ctx = mainCtx;
  const {
    TOKENS,
    GameState,
    WIDTH,
    HEIGHT,
    CORRIDOR,
    WALL_WIDTH,
    WORLD,
    RENDER_CACHE_ENABLED,
    DYNAMIC_FX_FPS,
    BOMB_BRIEFING_ACCEPT_COUNT,
    HOMING_MISSILE_ATTACK_DISABLE_SECONDS
  } =
    AIPU.constants;
  const { game, player } = AIPU.state;
  const {
    FLOORS,
    TITLE_SEQUENCE,
    getNarrativeTitleCard,
    getNarrativeFloorCopy,
    getNarrativeTeachCard,
    getDeathLessonCard,
    getNarrativeOutcomeCopy,
    getNarrativeUiText,
    getWhatYouLearnedBullets,
    getThreatGlossaryRows,
    getBombBriefingCopy
  } =
    AIPU.content;
  const upgrades = AIPU.upgrades;
  const systems = AIPU.systems;
  const { clamp, easeOutCubic, easeInOutSine, rgba, accentColor } = AIPU.utils;
  const renderCacheState = game.renderCache || null;

  // FX PIPELINE INSERTION POINTS:
  // - draw()
  // - drawEnvironment()
  // - drawFloorSkinStatic()
  // - drawFloorSkinDynamic()
  // - drawBullets()
  // - drawEnemies()
  // - drawParticles()

  let activeWaves = [];
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let pickups = [];
  let particles = [];
  const bulletTrailHistory = new Map();
  const enemyBulletTrailHistory = new Map();
  const fxActiveEnemyIds = new Set();
  const activeBulletTrailKeys = new Set();
  const activeEnemyTrailKeys = new Set();
  let fxDistortionCanvas = null;
  let fxDistortionCtx = null;

  const BOMB_BRIEFING_FALLBACK = {
    abilityName: "Escalation Pulse",
    chargeCount: 1,
    title: "Press Space: Escalation Pulse",
    subtitle: "In gameplay, Space clears enemies and enemy bullets.",
    bullets: [
      "Space works only during gameplay.",
      "Pulse clears all enemies and enemy bullets.",
      "You can use it once per floor."
    ],
    steps: ["Key: Space", "Effect: Clear screen", "Limit: Once per floor"],
    cta: (step, total) => `Press Enter to accept (${step}/${total})`
  };

  const FX_QUALITY_CAPS = Object.freeze({
    low: Object.freeze({
      particleDensity: 0.55,
      trailLength: 0.55,
      vignetteStrength: 0.75,
      distortionAmount: 0.55,
      cameraShake: 0.7,
      parallax: 0.75
    }),
    medium: Object.freeze({
      particleDensity: 1,
      trailLength: 1,
      vignetteStrength: 1,
      distortionAmount: 1,
      cameraShake: 1,
      parallax: 1
    }),
    high: Object.freeze({
      particleDensity: 1.25,
      trailLength: 1.15,
      vignetteStrength: 1.1,
      distortionAmount: 1.1,
      cameraShake: 1.2,
      parallax: 1.15
    })
  });

  const FX_CONFIG = {
    enabled: true,
    quality: "medium",
    respectReducedMotion: true,
    toggles: {
      parallax: true,
      distortion: true,
      trails: true,
      chroma: false,
      particles: true,
      camera: true,
      vignette: true,
      grain: false,
      audioReactive: false
    }
  };
  const REDUCED_MOTION_BACKGROUND_SCALE = 0.4;

  const fxState = {
    shotPulse: 0,
    hitPulse: 0,
    bombPulse: 0,
    danger: 0,
    progress: 0,
    intensity: 0,
    cameraShakeX: 0,
    cameraShakeY: 0,
    cameraZoom: 1,
    lastFireCooldown: 0,
    lastKills: 0,
    lastEnemyHurt: new Map()
  };
  const FX_PARTICLE_CAPS = Object.freeze({
    low: 150,
    medium: 350,
    high: 700
  });
  const fxParticles = [];
  const fxParticlePool = [];
  const fxParticleMeta = {
    lastRenderTime: 0,
    renderAccent: TOKENS.yellow,
    activeFloorId: 1
  };
  const CHARACTER_ART_CACHE_BUST = "v=20260222-4";
  const glfxWorldFxState = {
    api: null,
    fxCanvas: null,
    texture: null,
    sourceCanvas: null,
    sourceCtx: null,
    lastWidth: 0,
    lastHeight: 0,
    failed: false,
    lastStatus: "idle",
    lastError: ""
  };
  const fxPreviousEnemyIds = new Set();
  const fxEnemyPositions = new Map();
  const PLAYER_PRIMARY_MOVEMENT_FRAMES = Object.freeze({
    front: "Front.png",
    back: "back.png",
    left: "left.png",
    right: "right.png"
  });

  const PLAYER_PRIMARY_SHOOT_FRAMES = Object.freeze({
    front: "Down_Shoot.png",
    back: "UP_shoot.png",
    left: "Left_shoot.png",
    right: "Right_shoot.png"
  });

  const CHARACTER_ART = Object.freeze({
    player: Object.freeze({
      bucketDir: "./assets/characters/player/main",
      frames: PLAYER_PRIMARY_MOVEMENT_FRAMES,
      dualFrames: Object.freeze(["DUAL.png", "dual.png"]),
      shootFrames: PLAYER_PRIMARY_SHOOT_FRAMES,
      legacy: Object.freeze({
        front: "./ChatGPT Image Feb 16, 2026, 05_58_49 PM.png",
        left: "./ChatGPT Image Feb 16, 2026, 05_47_55 PM (1).png",
        right: "./ChatGPT Image Feb 16, 2026, 05_58_25 PM.png",
        back: "./ChatGPT Image Feb 16, 2026, 05_46_16 PM.png"
      })
    }),
    enemy: Object.freeze({
      bucketDir: "./assets/characters/enemies",
      idle: "idle.png",
      fallback: "default.png"
    })
  });
  const ENEMY_SPRITE_SCALE = Object.freeze({
    minWidthScale: 0.8,
    maxWidthScale: 3.2,
    heightScale: 2.2
  });
  const PLAYER_SPRITE_ALPHA_THRESHOLD = 10;
  const PLAYER_SPRITE_HEIGHT_SCALE = 5;
  const PLAYER_SPRITE_WIDTH_SCALE = {
    min: 1.7,
    max: 4.2,
    topOffset: 0.76
  };
  const PLAYER_SPRITE_STANCE_SCALE = Object.freeze({
    front: 1.02,
    back: 1.02,
    left: 1.04,
    right: 1.04
  });
  const playerSpriteMeasureCanvas = typeof document === "undefined" ? null : document.createElement("canvas");
  const playerSpriteMeasureCtx = playerSpriteMeasureCanvas && playerSpriteMeasureCanvas.getContext("2d");
  const characterSpriteCache = Object.create(null);
  const PLAYER_SHOOT_KEYS = Object.freeze(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  const PLAYER_SPRITE_DIRECTIONS = Object.freeze(["front", "back", "left", "right"]);
  const PLAYER_SHOOT_KEY_DIRECTIONS = Object.freeze({
    ArrowUp: "back",
    ArrowDown: "front",
    ArrowLeft: "left",
    ArrowRight: "right"
  });
  const PLAYER_FRAME_FALLBACKS = Object.freeze({
    front: Object.freeze(["front.png", "Front.png", "FRONT.png"]),
    back: Object.freeze(["back.png", "Back.png", "BACK.png"]),
    left: Object.freeze(["left.png", "Left.png", "LEFT.png"]),
    right: Object.freeze(["right.png", "Right.png", "RIGHT.png"])
  });
  const PLAYER_ANIMATION_MODE_SWITCH_FRAMES = 2;
  const PLAYER_SHOOT_FRAME_FALLBACKS = Object.freeze({
    front: Object.freeze([
      "shoot_front.png",
      "Shoot_front.png",
      "shoot_down.png",
      "Shoot_down.png",
      "down_shoot.png",
      "Down_shoot.png",
      "Down_Shoot.png"
    ]),
    back: Object.freeze([
      "shoot_back.png",
      "Shoot_back.png",
      "shoot_up.png",
      "Shoot_up.png",
      "up_shoot.png",
      "Up_shoot.png",
      "UP_shoot.png",
      "UP_Shoot.png"
    ]),
    left: Object.freeze([
      "shoot_left.png",
      "Shoot_left.png",
      "shoot_a.png",
      "shoot_A.png",
      "left_shoot.png",
      "Left_shoot.png",
      "LEFT_shoot.png",
      "Left_Shoot.png"
    ]),
    right: Object.freeze([
      "shoot_right.png",
      "Shoot_right.png",
      "shoot_d.png",
      "shoot_D.png",
      "right_shoot.png",
      "Right_shoot.png",
      "RIGHT_shoot.png",
      "Right_Shoot.png"
    ])
  });
  let playerFacingDirection = "front";
  const playerSpriteLastReadyByMode = {
    move: Object.create(null),
    shoot: Object.create(null),
    dual: Object.create(null),
    omni: Object.create(null)
  };
  const playerSpriteModeState = {
    requestedMode: "move",
    requestedDirection: "front",
    activeMode: "move",
    activeDirection: "front",
    holdFrames: PLAYER_ANIMATION_MODE_SWITCH_FRAMES
  };
  let playerSpriteCachePrimed = false;

  function resetPlayerSpriteState() {
    playerFacingDirection = "front";
    playerSpriteModeState.requestedMode = "move";
    playerSpriteModeState.requestedDirection = "front";
    playerSpriteModeState.activeMode = "move";
    playerSpriteModeState.activeDirection = "front";
    playerSpriteModeState.holdFrames = 0;
    playerSpriteCachePrimed = false;
    const resetModeKeys = Object.keys(playerSpriteLastReadyByMode);
    for (let i = 0; i < resetModeKeys.length; i += 1) {
      const mode = resetModeKeys[i];
      playerSpriteLastReadyByMode[mode] = Object.create(null);
    }
  }

  function getPlayerSpriteModeLabel(spriteMode) {
    if (spriteMode === "dual" || spriteMode === "omni") {
      return "dual";
    }
    if (spriteMode === "shoot") {
      return "shoot";
    }
    return "move";
  }

  function cachePlayerSpriteFrame(modeLabel, direction, state) {
    if (!playerSpriteLastReadyByMode[modeLabel]) {
      return;
    }
    playerSpriteLastReadyByMode[modeLabel][direction] = state || null;
  }

  function getCachedPlayerSpriteFrame(modeLabel, direction) {
    const cacheBucket = playerSpriteLastReadyByMode[modeLabel];
    if (!cacheBucket) {
      return null;
    }
    return cacheBucket[direction] || null;
  }

  function isDrawablePlayerSpriteState(state) {
    if (!state || state.status !== "ready" || !state.image || !state.trimRect) {
      return false;
    }
    if (!state.image.naturalWidth || !state.image.naturalHeight) {
      return false;
    }
    return true;
  }

  function getActivePlayerShootDirection() {
    const input = AIPU.input || {};
    const keys = input && input.keys;
    if (!keys) {
      return "";
    }

    const shootPressOrder = Array.isArray(input.shootPressOrder) ? input.shootPressOrder : [];
    for (let i = shootPressOrder.length - 1; i >= 0; i -= 1) {
      const shootKey = shootPressOrder[i];
      const shootDirection = PLAYER_SHOOT_KEY_DIRECTIONS[shootKey];
      if (shootDirection && keys[shootKey]) {
        return shootDirection;
      }
    }

    for (let i = 0; i < PLAYER_SHOOT_KEYS.length; i += 1) {
      const shootKey = PLAYER_SHOOT_KEYS[i];
      if (keys[shootKey]) {
        const shootDirection = PLAYER_SHOOT_KEY_DIRECTIONS[shootKey];
        if (shootDirection) {
          return shootDirection;
        }
      }
    }

    const lastShootKey = AIPU.input && typeof AIPU.input.lastShootKey === "string" ? AIPU.input.lastShootKey : "";
    if (keys[lastShootKey]) {
      const lastShootDirection = PLAYER_SHOOT_KEY_DIRECTIONS[lastShootKey];
      if (lastShootDirection) {
        return lastShootDirection;
      }
    }
    return "";
  }

  function getActivePlayerMoveDirection() {
    const inputKeys = (AIPU.input && AIPU.input.keys) || null;
    if (!inputKeys || typeof inputKeys !== "object") {
      return "";
    }

    const moveX = (inputKeys.KeyD ? 1 : 0) - (inputKeys.KeyA ? 1 : 0);
    const moveY = (inputKeys.KeyS ? 1 : 0) - (inputKeys.KeyW ? 1 : 0);
    if (!moveX && !moveY) {
      return "";
    }

    if (Math.abs(moveX) >= Math.abs(moveY)) {
      return moveX < 0 ? "left" : "right";
    }
    return moveY < 0 ? "back" : "front";
  }

  function isPlayerShootInputActive() {
    if (!game || game.state !== GameState.PLAYING) {
      return false;
    }
    return !!getActivePlayerShootDirection();
  }

  function normalizeDirection(direction) {
    return CHARACTER_ART.player.frames[direction] ? direction : "front";
  }

  function normalizeEnemyType(enemyType) {
    return typeof enemyType === "string" ? enemyType.trim() : "";
  }

  function dedupePaths(paths) {
    const seen = new Set();
    const unique = [];
    for (let i = 0; i < paths.length; i += 1) {
      const value = typeof paths[i] === "string" ? paths[i].trim() : "";
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      unique.push(value);
    }
    return unique;
  }

  function arePathListsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  function buildPlayerSpriteCandidates(direction, useShootFrameSet = false, useDualFrame = false) {
    const resolvedDirection = normalizeDirection(direction);
    const preferredDualFrame = useDualFrame ? CHARACTER_ART.player.dualFrames : "";
    const preferredFrameSet = useShootFrameSet ? CHARACTER_ART.player.shootFrames : CHARACTER_ART.player.frames;
    const preferredFrame = preferredFrameSet && preferredFrameSet[resolvedDirection] ? preferredFrameSet[resolvedDirection] : null;
    const aliasFrames = useShootFrameSet
      ? PLAYER_SHOOT_FRAME_FALLBACKS[resolvedDirection]
      : PLAYER_FRAME_FALLBACKS[resolvedDirection];
    const moveFallbackFrames = useShootFrameSet ? PLAYER_FRAME_FALLBACKS[resolvedDirection] : null;
    const candidates = [];

    if (Array.isArray(preferredDualFrame)) {
      for (let i = 0; i < preferredDualFrame.length; i += 1) {
        if (preferredDualFrame[i]) {
          candidates.push(`${CHARACTER_ART.player.bucketDir}/${preferredDualFrame[i]}`);
        }
      }
    }

    if (preferredFrame) {
      candidates.push(`${CHARACTER_ART.player.bucketDir}/${preferredFrame}`);
    }

    if (Array.isArray(aliasFrames)) {
      for (let i = 0; i < aliasFrames.length; i += 1) {
        const aliasFrame = aliasFrames[i];
        if (aliasFrame && aliasFrame !== preferredFrame) {
          candidates.push(`${CHARACTER_ART.player.bucketDir}/${aliasFrame}`);
        }
      }
    }

    if (Array.isArray(moveFallbackFrames)) {
      for (let i = 0; i < moveFallbackFrames.length; i += 1) {
        const moveFrame = moveFallbackFrames[i];
        if (moveFrame) {
          candidates.push(`${CHARACTER_ART.player.bucketDir}/${moveFrame}`);
        }
      }
    }

    return candidates.concat([
      CHARACTER_ART.player.legacy[resolvedDirection]
    ]);
  }

  function buildEnemySpriteCandidates(enemyType) {
    const normalizedType = normalizeEnemyType(enemyType);
    if (!normalizedType) {
      return [];
    }

    const enemyBase = `${CHARACTER_ART.enemy.bucketDir}/${normalizedType}`;
    return [
      `${enemyBase}/${CHARACTER_ART.enemy.idle}`,
      `${enemyBase}/${CHARACTER_ART.enemy.fallback}`
    ];
  }

  function getCharacterSpriteState(cacheKey, candidatePaths, useTrimmedBounds) {
    let entry = characterSpriteCache[cacheKey];
    const paths = dedupePaths(candidatePaths);
    const shouldReset = !entry || !arePathListsEqual(entry.paths, paths);

    if (!entry) {
      entry = {
        key: cacheKey,
        cacheKey,
        status: "idle",
        paths,
        path: "",
        pathWithVersion: "",
        failed: false,
        image: null,
        trimRect: null,
        trimAspect: 1,
        naturalWidth: 0,
        naturalHeight: 0,
        errorPaths: [],
        nextPathIndex: 0,
        useTrimmedBounds,
        objectUrl: ""
      };
      characterSpriteCache[cacheKey] = entry;
    }

    if (shouldReset) {
      if (entry.objectUrl && typeof URL === "object" && URL && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(entry.objectUrl);
      }
      entry.paths = paths;
      entry.path = "";
      entry.pathWithVersion = "";
      entry.failed = false;
      entry.image = null;
      entry.trimRect = null;
      entry.trimAspect = 1;
      entry.naturalWidth = 0;
      entry.naturalHeight = 0;
      entry.errorPaths = [];
      entry.nextPathIndex = 0;
      entry.objectUrl = "";
      if (paths.length === 0) {
        entry.status = "missing";
        entry.failed = true;
        entry.errorPaths.push("path-unresolved");
        return entry;
      }
      entry.status = "idle";
    }

    if (entry.useTrimmedBounds !== useTrimmedBounds) {
      entry.useTrimmedBounds = useTrimmedBounds;
      if (entry.status === "ready" && entry.trimRect && !entry.useTrimmedBounds && entry.image) {
        const naturalWidth = Number.isFinite(entry.image.naturalWidth) ? entry.image.naturalWidth : 0;
        const naturalHeight = Number.isFinite(entry.image.naturalHeight) ? entry.image.naturalHeight : 0;
        const fallbackRect = naturalWidth > 0 && naturalHeight > 0
          ? { x: 0, y: 0, w: naturalWidth, h: naturalHeight, aspect: naturalWidth / naturalHeight }
          : null;
        entry.trimRect = fallbackRect;
        entry.trimAspect = fallbackRect && fallbackRect.w > 0 && fallbackRect.h > 0
          ? fallbackRect.w / fallbackRect.h
          : 1;
      }
    }

    if (entry.status === "idle" && entry.paths.length > 0) {
      loadNextSpriteCandidate(entry);
    }
    return entry;
  }

  function getPlayerSpriteState(direction, useShootFrameSet = false, useDualFrame = false) {
    const resolvedDirection = normalizeDirection(direction);
    const mode = useDualFrame ? "dual" : useShootFrameSet ? "shoot" : "move";
    const cacheKey = `player:${mode}:${resolvedDirection}`;
    return getCharacterSpriteState(cacheKey, buildPlayerSpriteCandidates(resolvedDirection, useShootFrameSet, useDualFrame), true);
  }

  function getEnemySpriteState(enemyType) {
    const normalizedType = normalizeEnemyType(enemyType);
    return getCharacterSpriteState(`enemy:${normalizedType}`, buildEnemySpriteCandidates(normalizedType), false);
  }

  function primePlayerSpriteCacheIfNeeded() {
    if (playerSpriteCachePrimed) {
      return;
    }

    for (let i = 0; i < PLAYER_SPRITE_DIRECTIONS.length; i += 1) {
      const direction = PLAYER_SPRITE_DIRECTIONS[i];
      getPlayerSpriteState(direction, false, false);
      getPlayerSpriteState(direction, true, false);
      getPlayerSpriteState(direction, false, true);
    }

    playerSpriteCachePrimed = true;
  }

  function revokeEntryObjectUrl(entry) {
    if (!entry || !entry.objectUrl) {
      return;
    }
    if (typeof URL === "object" && URL && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(entry.objectUrl);
    }
    entry.objectUrl = "";
  }

  function loadNextSpriteCandidate(entry) {
    if (!entry || entry.paths.length === 0) {
      revokeEntryObjectUrl(entry);
      entry.status = "missing";
      entry.failed = true;
      return;
    }
    if (entry.status === "loading" || entry.status === "ready") {
      return;
    }

    const path = entry.paths[entry.nextPathIndex];
    if (typeof path !== "string" || !path) {
      entry.status = "missing";
      entry.failed = true;
      return;
    }

    function advanceToNextCandidateOrMissing() {
      revokeEntryObjectUrl(entry);
      entry.nextPathIndex += 1;
      if (entry.nextPathIndex < entry.paths.length) {
        entry.status = "idle";
        loadNextSpriteCandidate(entry);
        return;
      }
      entry.status = "missing";
      entry.failed = true;
      entry.image = null;
    }

    const image = new Image();
    image.decoding = "async";
    const expectedPath = path;
    const pathWithVersion = `${path}?${CHARACTER_ART_CACHE_BUST}`;
    entry.path = path;
    entry.pathWithVersion = pathWithVersion;
    entry.image = image;
    entry.status = "loading";
    entry.failed = false;
    const candidateIndex = entry.nextPathIndex;

    image.onload = () => {
      if (entry.status !== "loading" || entry.path !== expectedPath || entry.nextPathIndex !== candidateIndex) {
        return;
      }

      const measuredTrim = entry.useTrimmedBounds ? computeTrimmedSpriteRect(image) : null;
      const naturalWidth = Number.isFinite(image.naturalWidth) ? image.naturalWidth : 0;
      const naturalHeight = Number.isFinite(image.naturalHeight) ? image.naturalHeight : 0;
      const fallbackRect = naturalWidth > 0 && naturalHeight > 0
        ? { x: 0, y: 0, w: naturalWidth, h: naturalHeight, aspect: naturalWidth / naturalHeight }
        : null;

      entry.naturalWidth = naturalWidth;
      entry.naturalHeight = naturalHeight;
      entry.trimRect = measuredTrim || fallbackRect;
      entry.trimAspect = entry.trimRect && entry.trimRect.w > 0 && entry.trimRect.h > 0
        ? entry.trimRect.w / entry.trimRect.h
        : 1;
      if (!entry.trimRect || entry.naturalWidth <= 0 || entry.naturalHeight <= 0) {
        entry.errorPaths.push(path);
        advanceToNextCandidateOrMissing();
        return;
      }

      entry.status = "ready";
      entry.failed = false;
    };

    image.onerror = () => {
      if (entry.status !== "loading" || entry.path !== expectedPath || entry.nextPathIndex !== candidateIndex) {
        return;
      }

      entry.errorPaths.push(path);
      advanceToNextCandidateOrMissing();
    };

    const encodedPathWithVersion = encodeURI(pathWithVersion);
    const canFetchSafely =
      typeof fetch === "function" &&
      typeof URL === "object" &&
      URL &&
      typeof URL.createObjectURL === "function";

    if (!canFetchSafely) {
      image.src = encodedPathWithVersion;
      return;
    }

    fetch(encodedPathWithVersion, { cache: "force-cache" })
      .then((response) => {
        if (entry.status !== "loading" || entry.path !== expectedPath || entry.nextPathIndex !== candidateIndex) {
          return null;
        }
        if (!response || !response.ok) {
          throw new Error(`http-${response ? response.status : "error"}`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (!blob) {
          return;
        }
        if (entry.status !== "loading" || entry.path !== expectedPath || entry.nextPathIndex !== candidateIndex) {
          return;
        }
        revokeEntryObjectUrl(entry);
        entry.objectUrl = URL.createObjectURL(blob);
        image.src = entry.objectUrl;
      })
      .catch(() => {
        if (entry.status !== "loading" || entry.path !== expectedPath || entry.nextPathIndex !== candidateIndex) {
          return;
        }
        entry.errorPaths.push(path);
        advanceToNextCandidateOrMissing();
      });
  }

  function computeTrimmedSpriteRect(image) {
    if (!playerSpriteMeasureCanvas || !playerSpriteMeasureCtx || !image) {
      return null;
    }
    const imageWidth = Number.isFinite(image.naturalWidth) ? Math.floor(image.naturalWidth) : 0;
    const imageHeight = Number.isFinite(image.naturalHeight) ? Math.floor(image.naturalHeight) : 0;
    if (imageWidth <= 1 || imageHeight <= 1) {
      return null;
    }

    playerSpriteMeasureCanvas.width = imageWidth;
    playerSpriteMeasureCanvas.height = imageHeight;
    playerSpriteMeasureCtx.setTransform(1, 0, 0, 1, 0, 0);
    playerSpriteMeasureCtx.clearRect(0, 0, imageWidth, imageHeight);
    playerSpriteMeasureCtx.drawImage(image, 0, 0, imageWidth, imageHeight);

    const imageData = playerSpriteMeasureCtx.getImageData(0, 0, imageWidth, imageHeight).data;
    let minX = imageWidth;
    let minY = imageHeight;
    let maxX = -1;
    let maxY = -1;
    const threshold = PLAYER_SPRITE_ALPHA_THRESHOLD;
    for (let y = 0; y < imageHeight; y += 1) {
      const rowBase = y * imageWidth * 4;
      for (let x = 0; x < imageWidth; x += 1) {
        const alpha = imageData[rowBase + x * 4 + 3];
        if (alpha > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    const trimWidth = maxX - minX + 1;
    const trimHeight = maxY - minY + 1;
    if (trimWidth <= 0 || trimHeight <= 0) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      w: trimWidth,
      h: trimHeight,
      aspect: trimWidth / trimHeight
    };
  }

  function getPlayerDirectionFromMotion() {
    if (isPlayerShootInputActive()) {
      const shootDirection = getActivePlayerShootDirection();
      if (shootDirection) {
        playerFacingDirection = shootDirection;
        return playerFacingDirection;
      }
    }

    const activeMoveDirection = getActivePlayerMoveDirection();
    if (activeMoveDirection) {
      playerFacingDirection = activeMoveDirection;
      return playerFacingDirection;
    }

    const resolvedFacing = normalizeDirection(playerFacingDirection);
    playerFacingDirection = resolvedFacing;
    return resolvedFacing;
  }

  function getPlayerSpriteModeFallbackLabels(spriteMode) {
    const modeLabel = getPlayerSpriteModeLabel(spriteMode);
    const fallbackModeLabels = [modeLabel];
    if (modeLabel === "dual") {
      fallbackModeLabels.push("shoot", "move");
    } else if (modeLabel === "shoot") {
      fallbackModeLabels.push("move");
    }
    return fallbackModeLabels;
  }

  function hasRenderablePlayerSpriteForMode(direction, spriteMode) {
    const resolvedDirection = normalizeDirection(direction);
    const useShootFrameSet = spriteMode === "shoot";
    const useDualFrame = spriteMode === "dual" || spriteMode === "omni";
    const order = resolvedDirection === "front" ? ["front"] : [resolvedDirection, "front"];

    for (let i = 0; i < order.length; i += 1) {
      const state = getPlayerSpriteState(order[i], useShootFrameSet, useDualFrame);
      if (isDrawablePlayerSpriteState(state)) {
        return true;
      }
    }

    const modeLabels = getPlayerSpriteModeFallbackLabels(spriteMode);
    for (let i = 0; i < modeLabels.length; i += 1) {
      const modeLabel = modeLabels[i];
      for (let j = 0; j < order.length; j += 1) {
        const cached = getCachedPlayerSpriteFrame(modeLabel, order[j]);
        if (isDrawablePlayerSpriteState(cached)) {
          return true;
        }
      }
    }

    return false;
  }

  function getDirectionalBurstMode() {
    if (!isPlayerShootInputActive()) {
      return "normal";
    }

    if (!systems || typeof systems.getDirectionalBurstStatus !== "function") {
      return "normal";
    }

    try {
      const burstStatus = systems.getDirectionalBurstStatus();
      const mode = burstStatus && typeof burstStatus.mode === "string" ? burstStatus.mode : "normal";
      return mode === "dual" || mode === "omni" ? mode : "normal";
    } catch (error) {
      void error;
      return "normal";
    }
  }

  function resolvePlayerSpriteMode() {
    if (!isPlayerShootInputActive()) {
      return "move";
    }
    const burstMode = getDirectionalBurstMode();
    return burstMode === "dual" || burstMode === "omni" ? burstMode : "shoot";
  }

  function resolvePlayerSpriteFrameState() {
    const direction = getPlayerDirectionFromMotion();
    const targetMode = resolvePlayerSpriteMode();
    const targetDirection = direction;
    const safeHoldFrames = Math.max(1, Math.floor(PLAYER_ANIMATION_MODE_SWITCH_FRAMES));
    const hasModeChange = playerSpriteModeState.activeMode !== targetMode;
    const hasDirectionChange = playerSpriteModeState.activeDirection !== targetDirection;
    const hasChange = hasModeChange || hasDirectionChange;

    playerSpriteModeState.requestedMode = targetMode;
    playerSpriteModeState.requestedDirection = targetDirection;

    if (!hasChange) {
      playerSpriteModeState.holdFrames = 0;
      return {
        mode: playerSpriteModeState.activeMode,
        direction: playerSpriteModeState.activeDirection
      };
    }

    const canSwitchImmediately = hasRenderablePlayerSpriteForMode(targetDirection, targetMode);
    if (canSwitchImmediately) {
      playerSpriteModeState.holdFrames = 0;
      playerSpriteModeState.activeMode = targetMode;
      playerSpriteModeState.activeDirection = targetDirection;
      return {
        mode: playerSpriteModeState.activeMode,
        direction: playerSpriteModeState.activeDirection
      };
    }

    if (playerSpriteModeState.holdFrames <= 0) {
      playerSpriteModeState.holdFrames = safeHoldFrames;
      return {
        mode: playerSpriteModeState.activeMode,
        direction: playerSpriteModeState.activeDirection
      };
    }

    playerSpriteModeState.holdFrames -= 1;
    if (playerSpriteModeState.holdFrames > 0) {
      return {
        mode: playerSpriteModeState.activeMode,
        direction: playerSpriteModeState.activeDirection
      };
    }

    playerSpriteModeState.activeMode = targetMode;
    playerSpriteModeState.activeDirection = targetDirection;

    return {
      mode: playerSpriteModeState.activeMode,
      direction: playerSpriteModeState.activeDirection
    };
  }

  function drawPlayerSprite(direction, accent, spriteMode = "move", visualTheme = null) {
    const order = direction === "front" ? ["front"] : [direction, "front"];
    const resolvedDirection = normalizeDirection(direction);
    const useShootFrameSet = spriteMode === "shoot";
    const useDualFrame = spriteMode === "dual" || spriteMode === "omni";
    const modeLabel = getPlayerSpriteModeLabel(spriteMode);

    for (let i = 0; i < order.length; i += 1) {
      const candidateDirection = normalizeDirection(order[i]);
      const state = getPlayerSpriteState(candidateDirection, useShootFrameSet, useDualFrame);
      if (!isDrawablePlayerSpriteState(state)) {
        continue;
      }
      cachePlayerSpriteFrame(modeLabel, candidateDirection, state);
      const image = state.image;
      const stanceScale = PLAYER_SPRITE_STANCE_SCALE[candidateDirection] || 1.02;
      const playerRadius = Number.isFinite(player.radius) && player.radius > 0 ? player.radius : 14;
      const spriteHeight = playerRadius * PLAYER_SPRITE_HEIGHT_SCALE * stanceScale;
      const spriteWidth = clamp(
        playerRadius * (state.trimAspect || 1) * PLAYER_SPRITE_HEIGHT_SCALE * stanceScale,
        playerRadius * PLAYER_SPRITE_WIDTH_SCALE.min,
        playerRadius * PLAYER_SPRITE_WIDTH_SCALE.max
      );

      const x = player.x - spriteWidth * 0.5;
      const y = player.y - spriteHeight * PLAYER_SPRITE_WIDTH_SCALE.topOffset;
      const prevSmoothing = ctx.imageSmoothingEnabled;
      const sx = state.trimRect.x;
      const sy = state.trimRect.y;
      const sw = state.trimRect.w;
      const sh = state.trimRect.h;

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, sx, sy, sw, sh, x, y, spriteWidth, spriteHeight);
      ctx.imageSmoothingEnabled = prevSmoothing;
      return true;
    }

    const fallbackCandidates = order;
    const fallbackModeLabels = getPlayerSpriteModeFallbackLabels(spriteMode);

    for (let i = 0; i < fallbackModeLabels.length; i += 1) {
      const fallbackModeLabel = fallbackModeLabels[i];
      for (let j = 0; j < fallbackCandidates.length; j += 1) {
        const fallbackDirectionForMode = normalizeDirection(fallbackCandidates[j]);
        const fallbackState = getCachedPlayerSpriteFrame(fallbackModeLabel, fallbackDirectionForMode);
        if (isDrawablePlayerSpriteState(fallbackState)) {
          const fallbackImage = fallbackState.image;
          const fallbackTrimRect = fallbackState.trimRect;
          const fallbackStanceScale = PLAYER_SPRITE_STANCE_SCALE[fallbackDirectionForMode] || 1.02;
          const playerRadius = Number.isFinite(player.radius) && player.radius > 0 ? player.radius : 14;
          const spriteHeight = playerRadius * PLAYER_SPRITE_HEIGHT_SCALE * fallbackStanceScale;
          const spriteWidth = clamp(
            playerRadius * (fallbackState.trimAspect || 1) * PLAYER_SPRITE_HEIGHT_SCALE * fallbackStanceScale,
            playerRadius * PLAYER_SPRITE_WIDTH_SCALE.min,
            playerRadius * PLAYER_SPRITE_WIDTH_SCALE.max
          );
          const x = player.x - spriteWidth * 0.5;
          const y = player.y - spriteHeight * PLAYER_SPRITE_WIDTH_SCALE.topOffset;
          const prevSmoothing = ctx.imageSmoothingEnabled;
          const sx = fallbackTrimRect.x;
          const sy = fallbackTrimRect.y;
          const sw = fallbackTrimRect.w;
          const sh = fallbackTrimRect.h;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(fallbackImage, sx, sy, sw, sh, x, y, spriteWidth, spriteHeight);
          ctx.imageSmoothingEnabled = prevSmoothing;
          return true;
        }
      }
    }

    return false;
  }

  function drawPlayerCogGlyph(cx, cy, radius, accent, visualTheme = null) {
    const pulse = (Math.sin((typeof game.globalTime === "number" ? game.globalTime : 0) * 1.8) + 1) * 0.5;
    const support = visualTheme && Array.isArray(visualTheme.support) && visualTheme.support.length > 0
      ? visualTheme.support[0]
      : TOKENS.ink;
    const spin = (typeof game.globalTime === "number" ? game.globalTime : 0) * 0.8 + fxState.shotPulse * 0.45 + fxState.intensity * 0.9;
    const teeth = 9;
    const outerR = radius * 1.05;
    const innerR = radius * 0.67;
    const hubR = radius * 0.54;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);

    ctx.fillStyle = rgba(accent, clamp(0.7 + pulse * 0.08, 0.7, 0.96));
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = TOKENS.ink;
    for (let i = 0; i < teeth; i += 1) {
      const a = (Math.PI * 2 * i) / teeth;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(dx * innerR * 0.72, dy * innerR * 0.72);
      ctx.lineTo(dx * outerR, dy * outerR);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = Math.max(0.7, radius * 0.12);
      ctx.stroke();

      const px = dx * innerR;
      const py = dy * innerR;
      const qx = dx * (outerR + radius * 0.08);
      const qy = dy * (outerR + radius * 0.08);
      ctx.fillStyle = rgba(accent, 0.9);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + radius * 0.18, py - radius * 0.11);
      ctx.lineTo(qx, qy);
      ctx.lineTo(px - radius * 0.18, py + radius * 0.11);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = TOKENS.white;
    ctx.lineWidth = Math.max(1, radius * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.74, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = rgba(support, 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(-radius * 0.12, -radius * 0.12, radius * 0.24, radius * 0.24);

    ctx.restore();
    return true;
  }

  function drawPlayerProceduralSprite(direction, accent, visualTheme = null) {
    const x = player.x;
    const y = player.y;
    const playerRadius = Number.isFinite(player.radius) && player.radius > 0 ? player.radius : 14;
    const directionSign = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    const supportColor = visualTheme && Array.isArray(visualTheme.support) && visualTheme.support.length > 0
      ? visualTheme.support[0]
      : TOKENS.ink;
    const isSide = directionSign !== 0;
    const isBack = direction === "back";
    const bodyW = playerRadius * (isSide ? 1.72 : 1.45);
    const bodyH = playerRadius * 1.88;
    const stride = Math.sin((typeof game.globalTime === "number" ? game.globalTime : 0) * 5 + x * 0.15) * (playerRadius * 0.07);
    const bodyX = x - bodyW * 0.5;
    const bodyY = y - bodyH * 0.5 + Math.min(stride, playerRadius * 0.12);
    const headR = playerRadius * 0.73;
    const shoulderGap = bodyW * 0.28;
    const torsoInset = playerRadius * 0.22;
    const hipW = playerRadius * 0.95;
    const footW = playerRadius * 0.9;
    const footH = playerRadius * 0.34;
    const legLift = Math.abs(stride);

    ctx.save();
    if (directionSign < 0) {
      ctx.translate(x + bodyW * 0.5, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(x + bodyW * 0.5), 0);
    }
    if (isBack) {
      ctx.translate(0, 0.8);
    }

    // Boots
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(bodyX + bodyW * 0.12, y - footH + legLift * 0.38, footW * 0.46, footH);
    ctx.fillRect(bodyX + bodyW * 0.42, y - footH - legLift * 0.38, footW * 0.46, footH);
    ctx.fillStyle = TOKENS.white;
    ctx.fillRect(bodyX + bodyW * 0.2, y - footH * 0.78 + legLift * 0.38, footW * 0.26, footH * 0.72);
    ctx.fillRect(bodyX + bodyW * 0.54, y - footH * 0.78 - legLift * 0.38, footW * 0.26, footH * 0.72);

    // Torso and core
    ctx.fillStyle = TOKENS.white;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    fillRoundRect(bodyX, bodyY, bodyW, bodyH, 10);
    strokeRoundRect(bodyX, bodyY, bodyW, bodyH, 10);

    ctx.fillStyle = accent;
    fillRoundRect(bodyX + torsoInset, bodyY + 3, bodyW - torsoInset * 2, bodyH - 6, 8);
    if (isSide) {
      ctx.fillStyle = rgba(supportColor, 0.16);
      fillRoundRect(bodyX + 2.5 + shoulderGap, bodyY + 4, bodyW - 5.2 - shoulderGap * 2, bodyH - 18, 7);
    }

    if (!isBack) {
      ctx.fillStyle = TOKENS.ink;
      fillRoundRect(bodyX + bodyW * 0.38, bodyY + bodyH - 1, bodyW * 0.24, 9.4, 4);
      fillRoundRect(bodyX + bodyW * 0.6, bodyY + bodyH - 1, bodyW * 0.24, 9.4, 4);
    } else {
      fillRoundRect(bodyX + bodyW * 0.56, bodyY + bodyH - 2.6, bodyW * 0.12, 8.8, 4);
      fillRoundRect(bodyX + bodyW * 0.32, bodyY + bodyH - 2.6, bodyW * 0.12, 8.8, 4);
    }

    ctx.fillStyle = TOKENS.ink;
    fillRoundRect(bodyX + bodyW * 0.38, bodyY + 3, bodyW * 0.24, 10.5, 3);
    fillRoundRect(bodyX + bodyW * 0.38, bodyY + bodyH - 13, bodyW * 0.24, 6, 3);

    if (isBack) {
      ctx.fillStyle = rgba(supportColor, 0.28);
      fillRoundRect(bodyX + bodyW * 0.18, bodyY + bodyH * 0.34, bodyW * 0.64, bodyH * 0.22, 7);
    }

    ctx.save();
    const coreY = bodyY + bodyH * 0.54;
    const coreX = bodyX + bodyW * 0.5;
    ctx.translate(coreX + (isSide ? directionSign * playerRadius * 0.14 : 0), coreY);
    ctx.fillStyle = TOKENS.ink;
    fillRoundRect(-hipW * 0.5, -footH * 0.35, hipW, footH * 0.7, 2.8);

    ctx.restore();

    // Arms
    if (isSide) {
      ctx.fillStyle = TOKENS.white;
      const armY = bodyY + bodyH * 0.36;
      const armLength = bodyW * 0.28;
      fillRoundRect(bodyX + bodyW * (directionSign < 0 ? 0.08 : 0.64), armY, armLength, playerRadius * 0.22, 2.2);
      ctx.fillStyle = accent;
      fillRoundRect(bodyX + bodyW * (directionSign < 0 ? 0.14 : 0.70), armY + 4, armLength, playerRadius * 0.11, 1.5);
    }

    // Head/cog module
    const headY = bodyY - headR * 0.32 + (isBack ? 0.8 : 0);
    drawPlayerCogGlyph(x, headY, headR, accent, visualTheme);

    // Goggles and direction accents
    ctx.fillStyle = accent;
    if (isBack) {
      ctx.fillStyle = TOKENS.ink;
      fillRoundRect(x - headR * 0.8, headY - headR * 0.95, headR * 0.5, headR * 0.28, 1.6);
      fillRoundRect(x + headR * 0.3, headY - headR * 0.95, headR * 0.5, headR * 0.28, 1.6);
      ctx.fillStyle = TOKENS.white;
      fillRoundRect(x - headR * 0.3, headY - headR * 0.4, headR * 0.6, headR * 0.21, 2);
    } else {
      ctx.fillStyle = TOKENS.white;
      fillRoundRect(x - headR * 0.62, headY - headR * 0.76, headR * 0.42, headR * 0.17, 2);
      fillRoundRect(x + headR * 0.2, headY - headR * 0.76, headR * 0.42, headR * 0.17, 2);
      ctx.fillStyle = TOKENS.ink;
      fillRoundRect(x - headR * 0.12, headY - headR * 0.22, headR * 0.24, headR * 0.18, 2);
      if (isSide) {
        fillRoundRect(x - headR * 0.46, headY + headR * 0.12, headR * 0.24, headR * 0.17, 2);
      } else {
        fillRoundRect(x - headR * 0.12, headY - headR * 0.45, headR * 0.06, headR * 0.19, 1);
        fillRoundRect(x + headR * 0.06, headY - headR * 0.45, headR * 0.06, headR * 0.19, 1);
      }
    }

    // Core line accents
    ctx.save();
    ctx.translate(x, headY - headR * 0.08);
    ctx.fillStyle = TOKENS.ink;
    ctx.globalAlpha = clamp(0.3 + fxState.intensity * 0.12, 0.25, 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, headR * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    if (!isSide && directionSign === 0) {
      // subtle chest detail for front-facing reads
      ctx.fillStyle = rgba(supportColor, 0.24);
      fillRoundRect(x - headR * 0.72, bodyY + bodyH * 0.44, headR * 1.44, playerRadius * 0.18, 5);
    }

    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW * 0.48, bodyY + bodyH * 0.22);
    ctx.lineTo(bodyX + bodyW * 0.52, bodyY + bodyH * 0.22 + playerRadius * 0.26);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 1.7;
    ctx.stroke();

    if (direction === "left" || direction === "right") {
      ctx.fillStyle = TOKENS.ink;
      ctx.beginPath();
      ctx.arc(x + directionSign * headR * 0.32, headY + headR * 0.22, headR * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return true;
  }

  function getFxQualityCaps() {
    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    return FX_QUALITY_CAPS[quality] || FX_QUALITY_CAPS.medium;
  }

  function getFxParticleCapacity() {
    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    return FX_PARTICLE_CAPS[quality] || FX_PARTICLE_CAPS.medium;
  }

  function ensureFxParticlePool() {
    const target = getFxParticleCapacity();
    const available = fxParticlePool.length + fxParticles.length;
    const missing = target - available;
    if (missing <= 0) {
      return;
    }

    for (let i = 0; i < missing; i += 1) {
      fxParticlePool.push({
        kind: "spark",
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size: 0,
        alpha: 0,
        color: TOKENS.ink,
        speed: 0,
        radius: 0,
        radiusDelta: 0,
        age: 0,
        segments: 10,
        angleOffset: 0
      });
    }
  }

  function applyGlfxPassForTier(pipeline, quality, intensity, trippy, _time) {
    if (!pipeline || typeof pipeline.bulgePinch !== "function") {
      return pipeline;
    }

    const clampedIntensity = clamp(Number(intensity) || 0, 0, 1);
    const trippyScale = clamp(Number(trippy) || 0, 0, 1);
    const reduced = isReducedMotion();
    const intensityScale = reduced ? 0.08 : 1;
    const centerX = WORLD.x + WORLD.w * 0.5;
    const centerY = WORLD.y + WORLD.h * 0.5;
    const localRadius = Math.min(WORLD.w, WORLD.h) * (0.46 + trippyScale * 0.08);
    const bulgeStrength = (quality === "high" ? 0.16 : quality === "medium" ? 0.1 : 0.07) * clampedIntensity * intensityScale;

    let next = pipeline.bulgePinch(centerX, centerY, localRadius, bulgeStrength);

    if (quality === "medium" || quality === "high") {
      if (typeof next.swirl === "function") {
        const angle = clampedIntensity * (quality === "high" ? 0.35 : 0.25) * intensityScale;
        next = next.swirl(centerX, centerY, localRadius, angle);
      }
    }

    if (quality === "high" && !reduced) {
      if (typeof next.noise === "function") {
        next = next.noise(clamp(0.01 + clampedIntensity * 0.05 + trippyScale * 0.03, 0, 0.08));
      }
      if (typeof next.vignette === "function") {
        next = next.vignette(clamp(0.03 + clampedIntensity * 0.06 + trippyScale * 0.02, 0, 0.12));
      }
    }

    return next;
  }

  function applyGlfxWorldPass(visualTheme = null) {
    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    const intensity = clamp(fxState.intensity || 0, 0, 1);
    const reduced = isReducedMotion();
    const reducedIntensity = reduced ? intensity * 0.09 : intensity;
    if (reducedIntensity <= 0.002) {
      glfxWorldFxState.lastStatus = "idle";
      return;
    }
    if (quality === "low" && reducedIntensity <= 0.01) {
      glfxWorldFxState.lastStatus = "idle";
      return;
    }

    const glfx = initGlfxWorldFx();
    if (!glfx || !glfx.fxCanvas || !glfx.sourceCanvas || !glfx.sourceCtx) {
      glfxWorldFxState.lastStatus = isFxToggleEnabled("distortion") ? "fallback" : "disabled";
      return;
    }

    try {
      const trippy = visualTheme && Number.isFinite(visualTheme.trippyLevel)
        ? clamp(visualTheme.trippyLevel / 5, 0, 1)
        : 0;
      const sourceCanvas = glfx.sourceCanvas;
      const sourceCtx = glfx.sourceCtx;
      sourceCtx.setTransform(1, 0, 0, 1, 0, 0);
      sourceCtx.clearRect(0, 0, WIDTH, HEIGHT);
      sourceCtx.drawImage(ctx.canvas, 0, 0);

      let texture = glfx.texture;
      if (texture && typeof texture.loadContentsOf === "function") {
        texture.loadContentsOf(sourceCanvas);
      } else {
        if (texture && typeof texture.destroy === "function") {
          texture.destroy();
        }
        texture = glfx.api.texture(sourceCanvas);
      }
      if (!texture) {
        glfxWorldFxState.lastStatus = "error";
        glfxWorldFxState.lastError = "glfx texture unavailable";
        return;
      }
      glfx.texture = texture;

      let pipeline = glfx.fxCanvas.draw(texture);
      pipeline = applyGlfxPassForTier(pipeline, quality, reducedIntensity, trippy, performance.now() / 1000);
      if (!pipeline || typeof pipeline.update !== "function") {
        glfxWorldFxState.lastStatus = "error";
        glfxWorldFxState.lastError = "glfx pipeline build failed";
        return;
      }
      pipeline.update();

      ctx.save();
      ctx.beginPath();
      ctx.rect(WORLD.x, WORLD.y, WORLD.w, WORLD.h);
      ctx.clip();
      ctx.drawImage(
        glfx.fxCanvas,
        WORLD.x,
        WORLD.y,
        WORLD.w,
        WORLD.h,
        WORLD.x,
        WORLD.y,
        WORLD.w,
        WORLD.h
      );
      ctx.restore();

      glfxWorldFxState.lastStatus = "applied";
    } catch (err) {
      glfxWorldFxState.lastStatus = "error";
      glfxWorldFxState.lastError = err && err.message ? String(err.message) : "glfx runtime error";
      if (glfx.texture && typeof glfx.texture.destroy === "function") {
        glfx.texture.destroy();
      }
      glfx.texture = null;
    }
  }

  function acquireFxParticle() {
    if (!isFxEnabled()) {
      return null;
    }
    if (fxParticlePool.length <= 0) {
      return null;
    }
    return fxParticlePool.pop();
  }

  function releaseFxParticle(particle) {
    if (!particle) {
      return;
    }
    fxParticlePool.push(particle);
  }

  function spawnFxParticle(definition = null) {
    if (!definition || !isFxToggleEnabled("particles")) {
      return;
    }

    const max = getFxParticleCapacity();
    if (fxParticles.length >= max) {
      return;
    }

    const particle = acquireFxParticle();
    if (!particle) {
      return;
    }

    particle.kind = definition.kind || "spark";
    particle.x = Number.isFinite(definition.x) ? definition.x : 0;
    particle.y = Number.isFinite(definition.y) ? definition.y : 0;
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.vx = Number.isFinite(definition.vx) ? definition.vx : 0;
    particle.vy = Number.isFinite(definition.vy) ? definition.vy : 0;
    particle.life = Number.isFinite(definition.life) ? definition.life : 0;
    particle.maxLife = Number.isFinite(definition.maxLife) ? Math.max(0.05, definition.maxLife) : 0.12;
    particle.size = Number.isFinite(definition.size) ? clamp(definition.size, 1, 5) : 1.8;
    particle.alpha = Number.isFinite(definition.alpha) ? clamp(definition.alpha, 0, 1) : 0.7;
    particle.color = definition.color || TOKENS.ink;
    particle.speed = Number.isFinite(definition.speed) ? definition.speed : 0;
    particle.radius = Number.isFinite(definition.radius) ? definition.radius : 0;
    particle.radiusDelta = Number.isFinite(definition.radiusDelta) ? definition.radiusDelta : 0;
    particle.age = 0;
    particle.segments = Number.isFinite(definition.segments) ? Math.max(8, Math.floor(definition.segments)) : 12;
    particle.angleOffset = definition.angleOffset || 0;

    fxParticles.push(particle);
  }

  function spawnFxImpactSparks(x, y) {
    if (!isFxToggleEnabled("particles")) {
      return;
    }

    const count = 6 + Math.floor(Math.random() * 9);
    const reducedScale = isReducedMotion() ? 0.4 : 1;
    const accentBoostChance = 0.18;
    for (let i = 0; i < count; i += 1) {
      const amp = reducedScale * (0.8 + Math.random() * 1.6);
      const angle = Math.random() * Math.PI * 2;
      const speed = 44 + Math.random() * 64;
      const isAccent = i < 2 && Math.random() < accentBoostChance;
      spawnFxParticle({
        kind: "spark",
        x,
        y,
        vx: Math.cos(angle) * speed * amp,
        vy: Math.sin(angle) * speed * amp,
        life: 0.12 + Math.random() * 0.1,
        maxLife: 0.2 + Math.random() * 0.08,
        size: 1.2 + Math.random() * 1.4,
        alpha: 0.18 + Math.random() * 0.1,
        color: isAccent ? fxParticleMeta.renderAccent : TOKENS.ink
      });
    }
  }

  function spawnFxDeathDissolve(x, y) {
    if (!isFxToggleEnabled("particles")) {
      return;
    }

    const accentChance = 0.2;
    const ringLife = 0.5 + Math.random() * 0.1;
    spawnFxParticle({
      kind: "deathRing",
      x,
      y,
      vx: 0,
      vy: 0,
      life: ringLife,
      maxLife: ringLife,
      size: 1.3,
      alpha: 0.42,
      radius: 3 + Math.random() * 2,
      radiusDelta: 45 + Math.random() * 35,
      segments: 10 + Math.floor(Math.random() * 3),
      color: TOKENS.ink
    });

    const shardCount = 3 + Math.floor(Math.random() * 3);
    const reducedScale = isReducedMotion() ? 0.35 : 1;
    for (let i = 0; i < shardCount; i += 1) {
      const angle = (Math.PI * 2 * i) / shardCount + Math.random() * 0.6;
      const speed = 55 + Math.random() * 35;
      const isAccent = Math.random() < accentChance;
      spawnFxParticle({
        kind: "deathShard",
        x,
        y,
        vx: Math.cos(angle) * speed * reducedScale,
        vy: Math.sin(angle) * speed * reducedScale,
        life: 0.16 + Math.random() * 0.12,
        maxLife: 0.32 + Math.random() * 0.1,
        size: 1.2 + Math.random() * 1,
        alpha: 0.2 + Math.random() * 0.1,
        color: isAccent ? fxParticleMeta.renderAccent : TOKENS.ink,
        speed
      });
    }
  }

  function isReducedMotion() {
    return !!(FX_CONFIG.respectReducedMotion && AIPU.input && AIPU.input.prefersReducedMotion);
  }

  function getAttackDisableSnapshot() {
    if (systems && typeof systems.getAttackDisableState === "function") {
      try {
        const state = systems.getAttackDisableState();
        if (state && typeof state === "object") {
          const durationSeconds = Math.max(
            0.001,
            Number.isFinite(state.durationSeconds) ? state.durationSeconds : HOMING_MISSILE_ATTACK_DISABLE_SECONDS
          );
          const secondsRemaining = Math.max(0, Number(state.secondsRemaining) || 0);
          return {
            active: !!state.active && secondsRemaining > 0,
            secondsRemaining,
            durationSeconds,
            progress: clamp(secondsRemaining / durationSeconds, 0, 1)
          };
        }
      } catch (error) {
        void error;
      }
    }

    const durationSeconds = Math.max(
      0.001,
      Number.isFinite(HOMING_MISSILE_ATTACK_DISABLE_SECONDS) ? HOMING_MISSILE_ATTACK_DISABLE_SECONDS : 3
    );
    const secondsRemaining = Math.max(0, Number(player.attackDisableTimer) || 0);
    return {
      active: secondsRemaining > 0,
      secondsRemaining,
      durationSeconds,
      progress: clamp(secondsRemaining / durationSeconds, 0, 1)
    };
  }

  function getHomingLockoutRatioForFx() {
    if (isReducedMotion()) {
      return 0;
    }
    const lockout = getAttackDisableSnapshot();
    return lockout.active ? lockout.progress : 0;
  }

  function getGlfxLibrary() {
    if (typeof fx === "object" && fx && typeof fx.canvas === "function") {
      return fx;
    }
    if (typeof window === "object" && window && typeof window.fx === "object" && window.fx && typeof window.fx.canvas === "function") {
      return window.fx;
    }
    return null;
  }

  function initGlfxWorldFx() {
    return tryCreateGlfxWorldFx();
  }

  function tryCreateGlfxWorldFx() {
    if (!isFxEnabled() || !isFxToggleEnabled("distortion")) {
      glfxWorldFxState.lastStatus = "disabled";
      glfxWorldFxState.lastError = "";
      return null;
    }
    if (glfxWorldFxState.failed) {
      glfxWorldFxState.lastStatus = "fallback";
      return null;
    }
    if (!glfxWorldFxState.api) {
      glfxWorldFxState.api = getGlfxLibrary();
    }
    if (!glfxWorldFxState.api || typeof glfxWorldFxState.api.canvas !== "function") {
      glfxWorldFxState.lastStatus = "unavailable";
      glfxWorldFxState.lastError = "glfx library unavailable";
      return null;
    }

    try {
      if (!glfxWorldFxState.fxCanvas) {
        glfxWorldFxState.fxCanvas = glfxWorldFxState.api.canvas();
      }
      if (!glfxWorldFxState.sourceCanvas || !glfxWorldFxState.sourceCtx) {
        const built = createLayerCanvasWithContext();
        glfxWorldFxState.sourceCanvas = built.canvas;
        glfxWorldFxState.sourceCtx = built.layerCtx;
      }
      if (!glfxWorldFxState.fxCanvas || !glfxWorldFxState.sourceCanvas || !glfxWorldFxState.sourceCtx) {
        glfxWorldFxState.fxCanvas = null;
        glfxWorldFxState.sourceCanvas = null;
        glfxWorldFxState.sourceCtx = null;
        glfxWorldFxState.lastStatus = "unavailable";
        glfxWorldFxState.lastError = "glfx layer init failure";
        return null;
      }

      if (glfxWorldFxState.lastWidth !== WIDTH || glfxWorldFxState.lastHeight !== HEIGHT) {
        glfxWorldFxState.fxCanvas.width = WIDTH;
        glfxWorldFxState.fxCanvas.height = HEIGHT;
        glfxWorldFxState.sourceCanvas.width = WIDTH;
        glfxWorldFxState.sourceCanvas.height = HEIGHT;
        glfxWorldFxState.lastWidth = WIDTH;
        glfxWorldFxState.lastHeight = HEIGHT;
        glfxWorldFxState.texture = null;
      }

      glfxWorldFxState.lastStatus = "ready";
      glfxWorldFxState.lastError = "";

      return glfxWorldFxState;
    } catch (err) {
      glfxWorldFxState.failed = true;
      glfxWorldFxState.fxCanvas = null;
      glfxWorldFxState.texture = null;
      glfxWorldFxState.sourceCanvas = null;
      glfxWorldFxState.sourceCtx = null;
      glfxWorldFxState.lastStatus = "error";
      glfxWorldFxState.lastError = err && err.message ? String(err.message) : "glfx init error";
      return null;
    }
  }

  function isFxEnabled() {
    return !!FX_CONFIG.enabled;
  }

  function isFxToggleEnabled(toggleName) {
    if (!isFxEnabled()) {
      return false;
    }
    if (!FX_CONFIG.toggles || !Object.prototype.hasOwnProperty.call(FX_CONFIG.toggles, toggleName)) {
      return false;
    }
    if (isReducedMotion() && (toggleName === "trails" || toggleName === "chroma" || toggleName === "grain")) {
      return false;
    }
    return !!FX_CONFIG.toggles[toggleName];
  }

  function getReducedMotionScale() {
    return isReducedMotion() ? 0.25 : 1;
  }

  function getReducedMotionBackgroundScale() {
    return isReducedMotion() ? REDUCED_MOTION_BACKGROUND_SCALE : 1;
  }

  function approach(current, target, step) {
    if (current < target) return Math.min(current + step, target);
    if (current > target) return Math.max(current - step, target);
    return target;
  }

  function updateFxState() {
    const floorProgress = game.floorDuration > 0 ? clamp(game.floorElapsed / game.floorDuration, 0, 1) : 0;
    const threat = (enemies && enemies.length ? enemies.length : 0) + (enemyBullets && enemyBullets.length ? enemyBullets.length : 0);
    fxState.progress = floorProgress;
    fxState.danger = clamp(threat / 12, 0, 1);
    ensureFxParticlePool();

    if (player && fxState.lastFireCooldown <= 0 && player.fireCooldown > 0) {
      fxState.shotPulse = 1;
    }
    fxState.lastFireCooldown = player && Number.isFinite(player.fireCooldown) ? player.fireCooldown : 0;

    fxState.bombPulse = game.bombFlashTimer > 0 ? 1 : fxState.bombPulse * 0.85;

    const hitThreshold = 0.15;
    fxActiveEnemyIds.clear();
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy) {
        continue;
      }

      const enemyId = enemy.id;
      if (!enemyId && enemyId !== 0) {
        continue;
      }
      const key = String(enemyId);
      fxActiveEnemyIds.add(key);

      const previousHurt = fxState.lastEnemyHurt.get(key) || 0;
      const currentHurt = Number.isFinite(enemy.hurtFlash) ? enemy.hurtFlash : 0;
      if (currentHurt > hitThreshold && currentHurt > previousHurt) {
        fxState.hitPulse = 1;
        spawnFxImpactSparks(enemy.x, enemy.y);
      }

      const lastPos = fxEnemyPositions.get(key);
      if (lastPos) {
        lastPos.x = enemy.x;
        lastPos.y = enemy.y;
      } else {
        fxEnemyPositions.set(key, { x: enemy.x, y: enemy.y });
      }

      fxState.lastEnemyHurt.set(key, currentHurt);
    }

    for (const key of fxPreviousEnemyIds) {
      if (!fxActiveEnemyIds.has(key)) {
        const position = fxEnemyPositions.get(key);
        if (position) {
          spawnFxDeathDissolve(position.x, position.y);
        }
        fxEnemyPositions.delete(key);
      }
    }

    fxPreviousEnemyIds.clear();
    for (const key of fxActiveEnemyIds) {
      fxPreviousEnemyIds.add(key);
    }

    for (const key of fxState.lastEnemyHurt.keys()) {
      if (!fxActiveEnemyIds.has(key)) {
        fxState.lastEnemyHurt.delete(key);
      }
    }

    fxState.hitPulse *= 0.85;
    fxState.shotPulse *= 0.85;
    const intensityMix = (fxState.progress + fxState.danger) * 0.5;
    fxState.intensity = clamp(intensityMix + 0.4 * fxState.hitPulse + 0.25 * fxState.shotPulse + 0.6 * fxState.bombPulse, 0, 1);
  }

  function getTrailSegmentCount() {
    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    if (quality === "low") {
      return 1;
    }
    if (quality === "high") {
      return 3;
    }
    return 2;
  }

  function getTrailKey(bullet, fallbackIndex) {
    if (!bullet || typeof bullet !== "object") {
      return `fallback:${fallbackIndex}:${Number(bullet && bullet.x) || 0}:${Number(bullet && bullet.y) || 0}`;
    }
    if (bullet.id !== undefined && bullet.id !== null) {
      return bullet.id;
    }
    return bullet;
  }

  function renderBulletTrailFor(bullet, index, trailMap, accentColorValue, isEnemyBullet) {
    if (!bullet) {
      return;
    }
    const key = getTrailKey(bullet, index);
    if (!isFxToggleEnabled("trails")) {
      trailMap.delete(key);
      return;
    }
    if (isReducedMotion()) {
      trailMap.delete(key);
      return;
    }

    const maxSegments = getTrailSegmentCount();
    const now = {
      x: bullet.x,
      y: bullet.y
    };
    const history = trailMap.get(key) || [];

    history.push(now);
    if (history.length > maxSegments + 1) {
      history.shift();
    }

    if (history.length <= 1) {
      trailMap.set(key, history);
      return;
    }

    for (let i = 1; i < history.length; i += 1) {
      const from = history[i - 1];
      const to = history[i];
      const alpha = clamp(isEnemyBullet ? 0.08 * (i / history.length) : 0.12 * (i / history.length), 0, 0.12);
      if (alpha <= 0) {
        continue;
      }

      if (isEnemyBullet) {
        ctx.strokeStyle = rgba(TOKENS.ink, clamp(alpha * 1.1, 0.01, 0.12));
        ctx.fillStyle = rgba(TOKENS.white, clamp(alpha * 0.6, 0.01, 0.06));
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = rgba(accentColorValue, alpha * 0.9);
        ctx.lineWidth = 2;
      }

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      if (!isEnemyBullet) {
        ctx.strokeStyle = rgba(TOKENS.ink, clamp(alpha * 0.45, 0.01, 0.12));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(to.x, to.y, Math.max(1, (bullet.radius || 2) * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    trailMap.set(key, history);
  }

  function pruneBulletTrails(bulletsCollection, trailMap, activeKeys) {
    const active = activeKeys || new Set();
    if (activeKeys) {
      active.clear();
    }
    for (let i = 0; i < bulletsCollection.length; i += 1) {
      const bullet = bulletsCollection[i];
      if (!bullet) {
        continue;
      }
      const key = getTrailKey(bullet, i);
      active.add(key);
    }
    for (const key of trailMap.keys()) {
      if (!active.has(key)) {
        trailMap.delete(key);
      }
    }
  }

  function ensureFxDistortionCanvas() {
    if (fxDistortionCanvas && fxDistortionCtx && fxDistortionCanvas.width === WIDTH && fxDistortionCanvas.height === HEIGHT) {
      return true;
    }

    const built = createLayerCanvasWithContext();
    if (!built.canvas || !built.layerCtx) {
      fxDistortionCanvas = null;
      fxDistortionCtx = null;
      return false;
    }

    fxDistortionCanvas = built.canvas;
    fxDistortionCtx = built.layerCtx;
    return true;
  }

  function applyStripWarpDistortion(visualTheme, floor) {
    if (!renderCacheState || !renderCacheState.dynamicCtx || !ensureFxDistortionCanvas()) {
      return;
    }

    if (!isFxEnabled() || !FX_CONFIG.toggles.distortion) {
      return;
    }

    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    if (quality === "low") {
      return;
    }

    const fxPack = resolveFloorFxPack(floor);
    const distortionMode = fxPack && fxPack.distortionMode ? fxPack.distortionMode : "horizontal";
    const reducedMotionScale = getReducedMotionScale();
    const backgroundMotionScale = getReducedMotionBackgroundScale();
    const qualityCaps = getFxQualityCaps();
    const distScale = Number(qualityCaps.distortionAmount) || 1;
    const maxDistortion = isReducedMotion() ? 1 : (quality === "high" ? 6 : 3);
    const minDistortion = isReducedMotion() ? 0.03 : 0.2;
    const intensity = clamp(fxState.intensity || 0, 0, 1);
    const trippy = visualTheme && Number.isFinite(visualTheme.trippyLevel) ? visualTheme.trippyLevel : 0;
    const lockoutRatio = getHomingLockoutRatioForFx();
    const ampRaw = (0.3 + intensity * 2.8 + trippy * 0.22 + lockoutRatio * 0.95) * distScale * reducedMotionScale;
    const amp = clamp(ampRaw, minDistortion, maxDistortion);
    if (amp <= 0.01) {
      return;
    }

    const floorId = floor && floor.id != null ? Number.parseInt(floor.id, 10) : 1;
    const horizontal = distortionMode === "horizontal";
    const useEdgeMode = distortionMode === "edge";
    const time = typeof game.globalTime === "number" ? game.globalTime : performance.now() / 1000;
    const freq = (1.1 + intensity * 2.4 + trippy * 0.24 + lockoutRatio * 0.7) * backgroundMotionScale;
    const phase = 0.55 + trippy * 0.18;
    const centerBias = useEdgeMode ? 0.55 : 0.25;
    const freqBias = (floorId % 2 === 0 ? 1 : 0.92);
    const stripHeight = clamp(Math.floor(WORLD.h / 20), 4, 20);
    const stripWidth = clamp(Math.floor(WORLD.w / 20), 4, 20);

    fxDistortionCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxDistortionCtx.clearRect(0, 0, WIDTH, HEIGHT);
    fxDistortionCtx.drawImage(renderCacheState.dynamicCanvas, 0, 0);

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.beginPath();
    ctx.rect(WORLD.x, WORLD.y, WORLD.w, WORLD.h);
    ctx.clip();

    if (horizontal) {
      const halfHeight = WORLD.h * 0.5;
      for (let y = 0; y < WORLD.h; y += stripHeight) {
        const drawH = Math.min(stripHeight, WORLD.h - y);
        const localY = y + drawH * 0.5;
        const centerScale = clamp(1 - Math.abs(localY - halfHeight) / Math.max(1, halfHeight), 0, 1);
        const localAmp = amp * (centerBias + (1 - centerScale) * (1 - centerBias));
        const offset = Math.sin(time * freq * freqBias + (y * 0.18) * phase) * localAmp;
        ctx.drawImage(
          fxDistortionCanvas,
          WORLD.x,
          WORLD.y + y,
          WORLD.w,
          drawH,
          WORLD.x + offset,
          WORLD.y + y,
          WORLD.w,
          drawH
        );
      }
    } else {
      const halfWidth = WORLD.w * 0.5;
      for (let x = 0; x < WORLD.w; x += stripWidth) {
        const drawW = Math.min(stripWidth, WORLD.w - x);
        const localX = x + drawW * 0.5;
        const centerScale = clamp(1 - Math.abs(localX - halfWidth) / Math.max(1, halfWidth), 0, 1);
        const localAmp = amp * (centerBias + (1 - centerScale) * (1 - centerBias));
        const offset = Math.sin(time * (freq * 0.9) * freqBias + (x * 0.18) * phase) * localAmp;
        ctx.drawImage(
          fxDistortionCanvas,
          WORLD.x + x,
          WORLD.y,
          drawW,
          WORLD.h,
          WORLD.x + x,
          WORLD.y + offset,
          drawW,
          WORLD.h
        );
      }
    }

    ctx.restore();
  }

  function applyCameraTransformBeforeWorld() {
    const reducedMotion = isReducedMotion();
    if (!isFxEnabled()) {
      fxState.cameraZoom = 1;
      fxState.cameraShakeX = 0;
      fxState.cameraShakeY = 0;
      return false;
    }

    const qualityCaps = getFxQualityCaps();
    const reducedMotionBackgroundScale = getReducedMotionBackgroundScale();
    const qualityScale = clamp(Number(qualityCaps.cameraShake) || 1, 0.5, 1.6);
    const intensity = clamp(fxState.intensity || 0, 0, 1);
    const strength = 0.35 + 0.65 * intensity;
    const floorMix = intensity;
    const backgroundMotionScale = reducedMotion ? reducedMotionBackgroundScale : 1;

    const shotAmp = fxState.shotPulse * 1.2 * qualityScale * strength;
    const hitAmp = fxState.hitPulse * 2.2 * qualityScale * strength;
    const bombAmp = fxState.bombPulse * 4.0 * qualityScale * strength * floorMix;

    const time = typeof game.globalTime === "number" ? game.globalTime : performance.now() / 1000;
    const targetShakeX = reducedMotion
      ? (Math.sin(time * 31) * shotAmp +
        Math.cos(time * 23 + 1.25) * hitAmp * 0.7 +
        Math.sin(time * 17 + 2.1) * bombAmp * 0.45) * backgroundMotionScale
      : Math.sin(time * 31) * shotAmp +
        Math.cos(time * 23 + 1.25) * hitAmp * 0.7 +
        Math.sin(time * 17 + 2.1) * bombAmp * 0.45;
    const targetShakeY = reducedMotion
      ? (Math.cos(time * 29) * shotAmp * 0.9 +
        Math.sin(time * 19 + 2.8) * hitAmp * 0.7 +
        Math.cos(time * 11 + 5.4) * bombAmp * 0.45) * backgroundMotionScale
      : Math.cos(time * 29) * shotAmp * 0.9 +
        Math.sin(time * 19 + 2.8) * hitAmp * 0.7 +
        Math.cos(time * 11 + 5.4) * bombAmp * 0.45;

    const pulseZoom =
      (0.004 * (fxState.shotPulse + fxState.hitPulse) + 0.006 * fxState.bombPulse) * qualityScale * floorMix;
    const targetZoom = reducedMotion
      ? 1 + (clamp(1 + floorMix * 0.008 * qualityScale + pulseZoom, 0.988, 1.012) - 1) * reducedMotionBackgroundScale
      : clamp(1 + floorMix * 0.008 * qualityScale + pulseZoom, 0.988, 1.012);

    const shakeLerp = easeOutCubic(0.22);
    const zoomLerp = easeOutCubic(0.15);

    fxState.cameraShakeX = approach(fxState.cameraShakeX, targetShakeX, Math.abs(targetShakeX - fxState.cameraShakeX) * shakeLerp + 0.001);
    fxState.cameraShakeY = approach(fxState.cameraShakeY, targetShakeY, Math.abs(targetShakeY - fxState.cameraShakeY) * shakeLerp + 0.001);
    const reducedZoom = reducedMotion ? Math.min(targetZoom, 1.004) : targetZoom;
    fxState.cameraZoom = approach(fxState.cameraZoom, reducedZoom, Math.abs(reducedZoom - fxState.cameraZoom) * zoomLerp + 0.001);

    const maxZoom = clamp(fxState.cameraZoom, 0.988, 1.012);
    const maxShakeX = shotAmp + hitAmp + bombAmp;
    const maxShakeY = maxShakeX;
    fxState.cameraShakeX = clamp(fxState.cameraShakeX, -maxShakeX, maxShakeX);
    fxState.cameraShakeY = clamp(fxState.cameraShakeY, -maxShakeY, maxShakeY);

    if (fxState.cameraZoom === 1 && fxState.cameraShakeX === 0 && fxState.cameraShakeY === 0) {
      return false;
    }

    ctx.save();
    ctx.setTransform(maxZoom, 0, 0, maxZoom, fxState.cameraShakeX, fxState.cameraShakeY);
    return true;
  }

  function restoreAfterWorld(applied) {
    if (applied) {
      ctx.restore();
    }
  }

  function applyChromaEdgeSplit(visualTheme = null) {
    if (!isFxToggleEnabled("chroma") || !FX_QUALITY_CAPS) {
      return;
    }

    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    if (quality !== "high" || isReducedMotion()) {
      return;
    }

    const bandWidth = 14;
    const edgeAlpha = 0.02;
    const supports = visualTheme && visualTheme.support && visualTheme.support.length > 0 ? visualTheme.support : [];
    const splitColor = supports.length > 0 ? supports[0] : TOKENS.blue;

    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    ctx.globalAlpha = edgeAlpha;
    ctx.fillStyle = rgba(splitColor, 1);
    const hOffsets = [-1, 1];
    const vOffsets = [-1, 1];
    for (let i = 0; i < hOffsets.length; i += 1) {
      const dx = hOffsets[i];
      ctx.fillRect(WORLD.x + dx, WORLD.y, bandWidth, WORLD.h);
      ctx.fillRect(WORLD.x + WORLD.w - bandWidth + dx, WORLD.y, bandWidth, WORLD.h);
    }
    for (let i = 0; i < vOffsets.length; i += 1) {
      const dy = vOffsets[i];
      ctx.fillRect(WORLD.x, WORLD.y + dy, WORLD.w, bandWidth);
      ctx.fillRect(WORLD.x, WORLD.y + WORLD.h - bandWidth + dy, WORLD.w, bandWidth);
    }

    ctx.restore();
  }

  function uiText(key, fallback) {
    return typeof getNarrativeUiText === "function" ? getNarrativeUiText(key, fallback) : fallback;
  }

  function formatUiText(key, fallback, values = null) {
    let text = uiText(key, fallback);
    if (!values || typeof values !== "object") {
      return text;
    }
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  const LEAD_TINT_ALPHA_MAX = 0.22;
  const SUPPORT_TINT_ALPHA_MAX = 0.14;
  const COG_COLORS = Object.freeze({
    yellow: TOKENS.yellow,
    blue: TOKENS.blue,
    mint: TOKENS.mint,
    pink: TOKENS.pink
  });
  const FLOOR_VISUAL_THEME = Object.freeze({
    1: Object.freeze({ lead: "yellow", support: Object.freeze(["blue"]), trippyLevel: 1 }),
    2: Object.freeze({ lead: "blue", support: Object.freeze(["mint", "yellow"]), trippyLevel: 2 }),
    3: Object.freeze({ lead: "mint", support: Object.freeze(["pink", "blue"]), trippyLevel: 2 }),
    4: Object.freeze({ lead: "pink", support: Object.freeze(["mint", "yellow"]), trippyLevel: 3 }),
    5: Object.freeze({ lead: "yellow", support: Object.freeze(["blue", "mint"]), trippyLevel: 3 }),
    6: Object.freeze({ lead: "blue", support: Object.freeze(["mint", "yellow"]), trippyLevel: 4 }),
    7: Object.freeze({ lead: "mint", support: Object.freeze(["pink", "blue"]), trippyLevel: 4 }),
    8: Object.freeze({ lead: "pink", support: Object.freeze(["yellow", "mint"]), trippyLevel: 5 }),
    9: Object.freeze({ lead: "yellow", support: Object.freeze(["pink", "blue", "mint"]), trippyLevel: 5 }),
    10: Object.freeze({ lead: "blue", support: Object.freeze(["yellow"]), trippyLevel: 4 }),
    11: Object.freeze({ lead: "mint", support: Object.freeze(["pink", "blue"]), trippyLevel: 4 }),
    12: Object.freeze({ lead: "pink", support: Object.freeze(["mint", "yellow"]), trippyLevel: 5 }),
    13: Object.freeze({ lead: "yellow", support: Object.freeze(["blue", "pink"]), trippyLevel: 5 })
  });
  const FLOOR_FX_PACKS = Object.freeze({
    1: Object.freeze({
      id: 1,
      lead: "yellow",
      distortionMode: "horizontal",
      motif: "glyphs",
      parallaxCount: 10,
      latticeCount: 12,
      support: Object.freeze(["blue"]),
      trippyLevel: 1
    }),
    2: Object.freeze({
      id: 2,
      lead: "blue",
      distortionMode: "vertical",
      motif: "mesh",
      parallaxCount: 12,
      latticeCount: 14,
      support: Object.freeze(["mint", "yellow"]),
      trippyLevel: 2
    }),
    3: Object.freeze({
      id: 3,
      lead: "mint",
      distortionMode: "horizontal",
      motif: "circuit",
      parallaxCount: 14,
      latticeCount: 10,
      support: Object.freeze(["pink", "blue"]),
      trippyLevel: 2
    }),
    4: Object.freeze({
      id: 4,
      lead: "pink",
      distortionMode: "vertical",
      motif: "wave",
      parallaxCount: 16,
      latticeCount: 16,
      support: Object.freeze(["mint", "yellow"]),
      trippyLevel: 3
    }),
    5: Object.freeze({
      id: 5,
      lead: "yellow",
      distortionMode: "horizontal",
      motif: "kitchen",
      parallaxCount: 18,
      latticeCount: 18,
      support: Object.freeze(["blue", "mint"]),
      trippyLevel: 3
    }),
    6: Object.freeze({
      id: 6,
      lead: "blue",
      distortionMode: "vertical",
      motif: "door",
      parallaxCount: 20,
      latticeCount: 12,
      support: Object.freeze(["mint", "yellow"]),
      trippyLevel: 4
    }),
    7: Object.freeze({
      id: 7,
      lead: "mint",
      distortionMode: "edge",
      motif: "fracture",
      parallaxCount: 22,
      latticeCount: 12,
      support: Object.freeze(["pink", "blue"]),
      trippyLevel: 4
    }),
    8: Object.freeze({
      id: 8,
      lead: "pink",
      distortionMode: "horizontal",
      motif: "threshold",
      parallaxCount: 24,
      latticeCount: 16,
      support: Object.freeze(["yellow", "mint"]),
      trippyLevel: 5
    }),
    9: Object.freeze({
      id: 9,
      lead: "yellow",
      distortionMode: "edge",
      motif: "evolution",
      parallaxCount: 26,
      latticeCount: 18,
      support: Object.freeze(["pink", "blue", "mint"]),
      trippyLevel: 5
    }),
    10: Object.freeze({
      id: 10,
      lead: "blue",
      distortionMode: "horizontal",
      motif: "wireline_reactor",
      parallaxCount: 20,
      latticeCount: 24,
      support: Object.freeze(["yellow"]),
      trippyLevel: 3
    }),
    11: Object.freeze({
      id: 11,
      lead: "mint",
      distortionMode: "vertical",
      motif: "bloom_lattice",
      parallaxCount: 22,
      latticeCount: 26,
      support: Object.freeze(["mint", "blue"]),
      trippyLevel: 4
    }),
    12: Object.freeze({
      id: 12,
      lead: "pink",
      distortionMode: "edge",
      motif: "orbital_truss",
      parallaxCount: 24,
      latticeCount: 28,
      support: Object.freeze(["pink", "mint"]),
      trippyLevel: 4
    }),
    13: Object.freeze({
      id: 13,
      lead: "yellow",
      distortionMode: "horizontal",
      motif: "singularity_chorale",
      parallaxCount: 30,
      latticeCount: 32,
      support: Object.freeze(["mint", "yellow"]),
      trippyLevel: 5
    }),
    14: Object.freeze({
      id: 14,
      lead: "yellow",
      distortionMode: "vertical",
      motif: "quiet",
      parallaxCount: 8,
      latticeCount: 8,
      support: Object.freeze([]),
      trippyLevel: 0
    }),
    15: Object.freeze({
      id: 15,
      lead: "blue",
      distortionMode: "edge",
      motif: "quiet",
      parallaxCount: 8,
      latticeCount: 8,
      support: Object.freeze([]),
      trippyLevel: 0
    })
  });
  const WATER_WRAPPER_FLOOR_MIN = 1;
  const WATER_WRAPPER_FLOOR_MAX = 8;
  const WATER_WRAPPER_ALPHA_CAP = 0.33;
  const EARLY_WATER_FLOOR_ALPHA_BOOST = 0.028;
  const WATER_WASH_LAYER_ALPHA = 0.54;
  const WATER_WRAPPER_PROFILE_BY_FLOOR = Object.freeze({
    1: Object.freeze({ rippleBands: 8, rippleAmp: 1.0, flowSpeed: 0.66, causticDensity: 9, alphaBase: 0.056 }),
    2: Object.freeze({ rippleBands: 9, rippleAmp: 1.18, flowSpeed: 0.74, causticDensity: 11, alphaBase: 0.06 }),
    3: Object.freeze({ rippleBands: 10, rippleAmp: 1.34, flowSpeed: 0.82, causticDensity: 13, alphaBase: 0.066 }),
    4: Object.freeze({ rippleBands: 11, rippleAmp: 1.52, flowSpeed: 0.9, causticDensity: 15, alphaBase: 0.074 }),
    5: Object.freeze({ rippleBands: 12, rippleAmp: 1.74, flowSpeed: 0.98, causticDensity: 17, alphaBase: 0.082 }),
    6: Object.freeze({ rippleBands: 13, rippleAmp: 1.98, flowSpeed: 1.06, causticDensity: 19, alphaBase: 0.09 }),
    7: Object.freeze({ rippleBands: 14, rippleAmp: 2.2, flowSpeed: 1.14, causticDensity: 22, alphaBase: 0.098 }),
    8: Object.freeze({ rippleBands: 15, rippleAmp: 2.44, flowSpeed: 1.24, causticDensity: 25, alphaBase: 0.11 })
  });

  if (renderCacheState && !renderCacheState.stats) {
    renderCacheState.stats = { hits: 0, misses: 0, staticRebuilds: 0, dynamicRebuilds: 0 };
  }

  function syncCollections() {
    const c = systems.getCollections();
    activeWaves = c.activeWaves;
    bullets = c.bullets;
    enemyBullets = c.enemyBullets;
    enemies = c.enemies;
    pickups = c.pickups;
    particles = c.particles;
  }

  function withRenderContext(targetCtx, drawFn) {
    const previousCtx = ctx;
    ctx = targetCtx || mainCtx;
    try {
      drawFn();
    } finally {
      ctx = previousCtx;
    }
  }

  function createLayerCanvasWithContext() {
    let canvas = null;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    } else {
      canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
    }

    if (!canvas || typeof canvas.getContext !== "function") {
      return { canvas: null, layerCtx: null };
    }

    const layerCtx = canvas.getContext("2d");
    return { canvas, layerCtx };
  }

  function ensureRenderLayerCanvases() {
    if (!renderCacheState) {
      return false;
    }

    const needsStatic =
      !renderCacheState.staticCanvas ||
      !renderCacheState.staticCtx ||
      renderCacheState.staticCanvas.width !== WIDTH ||
      renderCacheState.staticCanvas.height !== HEIGHT;
    if (needsStatic) {
      const built = createLayerCanvasWithContext();
      renderCacheState.staticCanvas = built.canvas;
      renderCacheState.staticCtx = built.layerCtx;
      renderCacheState.dirty = true;
    }

    const needsDynamic =
      !renderCacheState.dynamicCanvas ||
      !renderCacheState.dynamicCtx ||
      renderCacheState.dynamicCanvas.width !== WIDTH ||
      renderCacheState.dynamicCanvas.height !== HEIGHT;
    if (needsDynamic) {
      const built = createLayerCanvasWithContext();
      renderCacheState.dynamicCanvas = built.canvas;
      renderCacheState.dynamicCtx = built.layerCtx;
      renderCacheState.dynamicDirty = true;
    }

    return !!(renderCacheState.staticCanvas && renderCacheState.staticCtx && renderCacheState.dynamicCanvas && renderCacheState.dynamicCtx);
  }

  function clearCurrentContext() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
  }

  function colorByName(name, fallback = TOKENS.blue) {
    return COG_COLORS[name] || fallback;
  }

  function resolveFloorId(value) {
    const raw = value && value.id != null ? value.id : value;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 1;
  }

  function resolveFloorFxPack(floor) {
    const floorId = resolveFloorId(floor);
    return FLOOR_FX_PACKS[floorId] || FLOOR_FX_PACKS[1];
  }

  function resolveFloorVisualTheme(floor, accent) {
    const id = resolveFloorId(floor);
    const pack = resolveFloorFxPack({ id });
    const base = FLOOR_VISUAL_THEME[id] || FLOOR_VISUAL_THEME[1];
    const leadName = typeof pack.lead === "string"
      ? pack.lead
      : typeof base.lead === "string"
        ? base.lead
        : "blue";
    const supportSource = Array.isArray(pack.support) ? pack.support : base.support;
    const supportNames = Array.isArray(supportSource) ? supportSource.filter((name) => !!COG_COLORS[name]) : [];
    const trippyLevel = clamp(Number(pack.trippyLevel != null ? pack.trippyLevel : base.trippyLevel) || 0, 0, 5);
    const floorDepth = id >= WATER_WRAPPER_FLOOR_MIN && id <= WATER_WRAPPER_FLOOR_MAX
      ? clamp((id - WATER_WRAPPER_FLOOR_MIN) / (WATER_WRAPPER_FLOOR_MAX - WATER_WRAPPER_FLOOR_MIN), 0, 1)
      : 0;
    const leadAlphaCap = clamp(LEAD_TINT_ALPHA_MAX + floorDepth * 0.02, 0, 0.24);
    const supportAlphaCap = clamp(SUPPORT_TINT_ALPHA_MAX + floorDepth * 0.015, 0, 0.16);
    return {
      leadName,
      lead: colorByName(leadName, accent || TOKENS.blue),
      supportNames,
      support: supportNames.map((name) => colorByName(name)),
      trippyLevel,
      motionScale: 1 + trippyLevel * 0.16,
      densityScale: 1 + trippyLevel * 0.14,
      leadAlphaMax: leadAlphaCap,
      supportAlphaMax: supportAlphaCap
    };
  }

  function resolveWaterWrapperState(floor, visualTheme = null, progress = 0) {
    const floorId = resolveFloorId(floor);
    if (floorId < WATER_WRAPPER_FLOOR_MIN || floorId > WATER_WRAPPER_FLOOR_MAX) {
      return null;
    }

    const profile = WATER_WRAPPER_PROFILE_BY_FLOOR[floorId] || WATER_WRAPPER_PROFILE_BY_FLOOR[WATER_WRAPPER_FLOOR_MIN];
    if (!profile) {
      return null;
    }

    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const isFirstWaterFloor = floorId === WATER_WRAPPER_FLOOR_MIN;
    const floorRamp = clamp(
      (floorId - WATER_WRAPPER_FLOOR_MIN) / (WATER_WRAPPER_FLOOR_MAX - WATER_WRAPPER_FLOOR_MIN),
      0,
      1
    );
    const floorFloorContribution = clamp(0.45 + floorRamp * 0.55, 0, 1);
    const trippy = visualTheme && Number.isFinite(visualTheme.trippyLevel)
      ? clamp(visualTheme.trippyLevel / 5, 0, 1)
      : 0;
    const danger = clamp(Number(fxState.danger) || 0, 0, 1);
    const floorBias = isFirstWaterFloor ? 0.08 : 0;
    const compound = clamp(
      floorFloorContribution * 0.72 + danger * 0.2 + trippy * 0.08 + floorBias,
      0,
      1
    );
    const speedScale = (0.86 + escalation.speedScale * 0.55) * reducedMotionScale;
    const motionIntensity = clamp(
      1 + trippy * 0.22 + floorRamp * 0.24 + (isFirstWaterFloor ? 0.12 : 0),
      0.88,
      1.58
    );
    return {
      floorId,
      profile,
      compound,
      speedScale,
      dynamicAmp: profile.rippleAmp * (0.9 + compound * 1.05) * motionIntensity * reducedMotionScale,
      staticBands: Math.max(6, Math.floor(profile.rippleBands * (0.9 + compound * 0.36))),
      dynamicBands: Math.max(7, Math.floor(profile.rippleBands * (1 + compound * 0.66))),
      causticCount: Math.max(7, Math.floor(profile.causticDensity * (0.9 + compound * 0.82))),
      alpha: clamp(profile.alphaBase + compound * 0.14 + floorBias * EARLY_WATER_FLOOR_ALPHA_BOOST, 0.03, WATER_WRAPPER_ALPHA_CAP),
      floorProgress: floorRamp,
      motionIntensity,
      floorIdIsEarly: isFirstWaterFloor
    };
  }

  function leadTint(visualTheme, alpha, fallbackColor = TOKENS.blue) {
    const cap = visualTheme ? visualTheme.leadAlphaMax : LEAD_TINT_ALPHA_MAX;
    const color = visualTheme && visualTheme.lead ? visualTheme.lead : fallbackColor;
    return rgba(color, clamp(alpha, 0, cap));
  }

  function supportTint(visualTheme, index, alpha, fallbackColor = TOKENS.blue) {
    if (!visualTheme || !visualTheme.support || visualTheme.support.length === 0) {
      return rgba(fallbackColor, clamp(alpha, 0, SUPPORT_TINT_ALPHA_MAX));
    }
    const supportColor = visualTheme.support[Math.abs(index) % visualTheme.support.length];
    return rgba(supportColor, clamp(alpha, 0, visualTheme.supportAlphaMax));
  }

  function supportColorAt(visualTheme, index, fallbackColor = TOKENS.blue) {
    if (!visualTheme || !visualTheme.support || visualTheme.support.length === 0) {
      return fallbackColor;
    }
    return visualTheme.support[Math.abs(index) % visualTheme.support.length];
  }

  function getDynamicEscalation(progress) {
    const p = easeInOutSine(clamp(Number(progress) || 0, 0, 1));
    const danger = easeOutCubic(clamp(Number(fxState.danger) || 0, 0, 1));
    const reducedMotionScale = getReducedMotionScale();
    const backgroundMotionScale = getReducedMotionBackgroundScale();
    const intensity = clamp(p * 0.45 + danger * 0.55, 0, 1) * reducedMotionScale;
    return {
      progress: p,
      danger,
      densityScale: 1 + 0.55 * intensity,
      speedScale: 0.75 + 1.1 * intensity,
      edgeScale: 0.55 + 0.45 * intensity,
      backgroundMotionScale,
      reducedMotionScale,
      intensity
    };
  }

  function getEdgePressure(axis, coord) {
    if (!Number.isFinite(coord)) {
      return 0;
    }
    if (axis === "x") {
      const ratio = (coord - WORLD.x) / WORLD.w;
      return clamp(Math.abs(ratio - 0.5) * 2, 0, 1);
    }
    const ratio = (coord - WORLD.y) / WORLD.h;
    return clamp(Math.abs(ratio - 0.5) * 2, 0, 1);
  }

  function edgeBlend(base, axis, coord) {
    const pressure = getEdgePressure(axis, coord);
    return base * (0.35 + 0.65 * pressure);
  }

  function hasDynamicFloorVisuals(floor) {
    const safeId = resolveFloorId(floor);
    return Number.isFinite(safeId) && safeId >= 1 && safeId <= 15;
  }

  function drawEnvironment(floor, accent, visualTheme = null) {
    if (!RENDER_CACHE_ENABLED || !renderCacheState) {
      drawBackdrop(accent, visualTheme);
      drawCorridor(floor, accent, visualTheme);
      return;
    }

    markRenderCacheFloor(floor && floor.id, floor && floor.accent);

    if (!ensureRenderLayerCanvases()) {
      renderCacheState.stats.misses += 1;
      drawBackdrop(accent, visualTheme);
      drawCorridor(floor, accent, visualTheme);
      return;
    }

    if (renderCacheState.dirty) {
      rebuildFloorStaticLayer(floor, accent, visualTheme);
    }
    if (renderCacheState.staticCanvas) {
      ctx.drawImage(renderCacheState.staticCanvas, 0, 0);
    }

    updateDynamicLayer(floor, accent, visualTheme);
    if (renderCacheState.dynamicCanvas) {
      ctx.drawImage(renderCacheState.dynamicCanvas, 0, 0);
    }
    renderCacheState.stats.hits += 1;
  }

  function rebuildFloorStaticLayer(floor, accent, visualTheme = null) {
    if (!renderCacheState || !renderCacheState.staticCtx) {
      return;
    }

    withRenderContext(renderCacheState.staticCtx, () => {
      clearCurrentContext();
      drawBackdrop(accent, visualTheme);
      drawCorridorStaticLayer(floor, accent, visualTheme);
    });

    renderCacheState.dirty = false;
    renderCacheState.dynamicDirty = true;
    renderCacheState.dynamicTimer = 0;
    renderCacheState.stats.staticRebuilds += 1;
  }

  function updateDynamicLayer(floor, accent, visualTheme = null) {
    if (!renderCacheState || !renderCacheState.dynamicCtx) {
      return;
    }

    const dynamicActive = hasDynamicFloorVisuals(floor);
    const now = performance.now();
    if (!renderCacheState.lastDrawTime) {
      renderCacheState.lastDrawTime = now;
    }
    const elapsed = Math.min((now - renderCacheState.lastDrawTime) / 1000, 0.25);
    renderCacheState.lastDrawTime = now;
    renderCacheState.dynamicTimer += elapsed;

    const interval = DYNAMIC_FX_FPS > 0 ? 1 / DYNAMIC_FX_FPS : 0;
    const shouldRebuild =
      renderCacheState.dynamicDirty || (dynamicActive && (interval === 0 || renderCacheState.dynamicTimer >= interval));
    if (!shouldRebuild) {
      return;
    }

    withRenderContext(renderCacheState.dynamicCtx, () => {
      clearCurrentContext();
      if (dynamicActive) {
        drawCorridorDynamicLayer(floor, accent, visualTheme);
      }
      applyStripWarpDistortion(visualTheme, floor);
    });

    renderCacheState.dynamicDirty = false;
    renderCacheState.dynamicTimer = 0;
    renderCacheState.stats.dynamicRebuilds += 1;
  }

  function draw() {
    syncCollections();
    ctx = mainCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    const floor = FLOORS[game.currentFloorIndex] || FLOORS[0];
    const accent = accentColor(floor.accent);
    const floorId = resolveFloorId(floor);
    fxParticleMeta.renderAccent = accent;
    fxParticleMeta.activeFloorId = Number.isFinite(floorId) ? floorId : 1;
    const visualTheme = resolveFloorVisualTheme(floor, accent);
    updateFxState();
    const deathShake = game.state === GameState.DEATH_ANIM ? systems.getDeathShakeOffset() : null;
    systems.syncOverlayRestartButton();

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (game.state === GameState.TITLE) {
      drawTitleCinematic();
      return;
    }

    if (game.state === GameState.UPGRADE_SELECT) {
      drawBackdrop(accent, visualTheme);
      drawUpgradeSelect(floor, accent);
      return;
    }

    if (game.state === GameState.BOMB_BRIEFING) {
      drawBackdrop(accent, visualTheme);
      drawBombBriefing(floor, accent);
      return;
    }

    if (game.state === GameState.LESSON_SLIDE) {
      drawBackdrop(accent, visualTheme);
      drawLessonSlideOverlay(floor, accent);
      return;
    }

    if (game.state === GameState.DEATH_LESSON) {
      drawBackdrop(accent, visualTheme);
      drawDeathLessonOverlay(floor, accent);
      return;
    }

    if (deathShake) {
      ctx.save();
      ctx.translate(deathShake.x, deathShake.y);
    }

    const worldCameraApplied = applyCameraTransformBeforeWorld();

    drawEnvironment(floor, accent, visualTheme);

    drawPickups(accent);
    drawBullets(accent);
    drawEnemies(accent);
    drawPlayer(accent, visualTheme);
    drawParticles();
    drawFxParticles();
    applyChromaEdgeSplit(visualTheme);

    restoreAfterWorld(worldCameraApplied);
    applyGlfxWorldPass(visualTheme);

    drawHud(floor, accent);
    drawStateOverlay(floor, accent);

    if (deathShake) {
      ctx.restore();
    }

    if (game.state === GameState.DEATH_ANIM) {
      drawDeathAnim();
    }

    if (game.bombFlashTimer > 0) {
      drawBombFlash(accent);
    }
  }

  function drawDeathAnim() {
    const death = game.deathAnim;
    if (!death) {
      return;
    }

    const t = death.t;
    const impactEnd = 0.25;
    const burstEnd = 0.9;
    const resolveStart = 0.9;

    const impactProgress = clamp(t / impactEnd, 0, 1);
    if (impactProgress < 1) {
      const ringRadius = 14 + impactProgress * 156;
      const ringAlpha = 0.82 - impactProgress * 0.58;
      const lineWidth = 3.1 - impactProgress * 1.7;

      ctx.strokeStyle = rgba(TOKENS.ink, clamp(ringAlpha, 0.15, 0.82));
      ctx.lineWidth = Math.max(1.1, lineWidth);
      ctx.beginPath();
      ctx.arc(death.originX, death.originY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (t >= 0.24) {
      const burstFade = 1 - clamp((t - burstEnd) / Math.max(0.001, death.duration - burstEnd), 0, 1);
      for (const shard of death.shards) {
        if (t < shard.delay) {
          continue;
        }

        const local = t - shard.delay;
        const drag = 1 - clamp(local * 0.38, 0, 0.7);
        const distance = shard.speed * local * drag;
        const px = death.originX + Math.cos(shard.angle) * distance;
        const py = death.originY + Math.sin(shard.angle) * distance + local * local * 135;
        const alpha = clamp((1 - local / 1.28) * burstFade, 0, 1);

        if (alpha <= 0) {
          continue;
        }

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(shard.rotation + shard.spin * local);
        ctx.fillStyle = rgba(death.accent, alpha * 0.92);
        fillRoundRect(-shard.width * 0.5, -shard.height * 0.5, shard.width, shard.height, 2);
        ctx.strokeStyle = rgba(TOKENS.ink, alpha);
        ctx.lineWidth = 1;
        strokeRoundRect(-shard.width * 0.5, -shard.height * 0.5, shard.width, shard.height, 2);
        ctx.restore();
      }
    }

    if (t >= resolveStart) {
      const fade = clamp((t - resolveStart) / Math.max(0.001, death.duration - resolveStart), 0, 1);
      ctx.fillStyle = rgba(TOKENS.white, 0.08 + fade * 0.86);
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  function drawBombFlash(accent) {
    const flashDuration = 0.22;
    const progress = clamp(game.bombFlashTimer / flashDuration, 0, 1);
    if (progress <= 0) {
      return;
    }

    const pulse = 1 - progress;
    const ringRadius = 90 + pulse * 420;

    ctx.save();
    ctx.fillStyle = rgba(accent, 0.12 * progress);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = rgba(TOKENS.ink, 0.52 * progress);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(WIDTH * 0.5, HEIGHT * 0.5, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = rgba(accent, 0.2 * progress);
    fillRoundRect(WIDTH * 0.5 - 72, HEIGHT * 0.5 - 7, 144, 14, 999);
    ctx.restore();
  }

  function drawUpgradeSelect(floor, accent) {
    const panelX = 84;
    const panelY = 70;
    const panelW = WIDTH - 168;
    const panelH = HEIGHT - 140;

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 22);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(panelX + 26, panelY + 26, panelW - 52, 10, 999);

    const floorCopy = getNarrativeFloorCopy(floor);
    const pickTitle = uiText("upgradePickTitle", "Pick an upgrade");
    const pickSubtitle = uiText("upgradePickSubtitle", "Stack small power. Keep control.");
    const floorLesson = floorCopy && floorCopy.title ? floorCopy.title : `Floor ${floor.id}`;
    const selectedOption = game.upgradeOptions[game.upgradeSelectedIndex] || game.upgradeOptions[0] || null;
    const teachCardRaw =
      selectedOption && typeof AIPU.content.buildTeachCardForUpgrade === "function"
        ? AIPU.content.buildTeachCardForUpgrade(selectedOption.id, floor.id)
        : null;
    const teachCard = {
      title:
        teachCardRaw && typeof teachCardRaw.title === "string" && teachCardRaw.title.trim()
          ? teachCardRaw.title.trim()
          : "Model loop",
      oneLiner:
        teachCardRaw && typeof teachCardRaw.oneLiner === "string" && teachCardRaw.oneLiner.trim()
          ? teachCardRaw.oneLiner.trim()
          : "Inputs become signals, then one score.",
      bullets:
        teachCardRaw && Array.isArray(teachCardRaw.bullets)
          ? teachCardRaw.bullets.filter((line) => typeof line === "string" && line.trim()).slice(0, 3)
          : ["Read the loop.", "Find strong signals.", "Explain the score."]
    };

    const contentTop = panelY + 198;
    const contentBottom = panelY + panelH - 76;
    const contentH = Math.max(220, contentBottom - contentTop);
    const contentX = panelX + 34;
    const contentW = panelW - 68;
    const splitGap = 20;
    const teachW = Math.floor(clamp(contentW * 0.33, 312, 368));
    const cardsW = contentW - teachW - splitGap;
    const cardsX = contentX;
    const teachX = cardsX + cardsW + splitGap;
    const teachY = contentTop;

    const cardRects = computeUpgradeCardRects(cardsX, contentTop, cardsW, game.upgradeOptions.length, {
      gap: 16,
      cardH: 236
    });
    game.upgradeCardRects = cardRects;
    normalizeUpgradeSelection();

    withClipRect(panelX + 8, panelY + 8, panelW - 16, panelH - 16, () => {
      ctx.fillStyle = TOKENS.ink;
      ctx.textBaseline = "top";
      const floorTitleFontSize = fitFontSizeForLine(
        pickTitle,
        panelW - 68,
        38,
        30,
        '700 ${size}px "Sora", "Inter", sans-serif'
      );
      ctx.font = `700 ${floorTitleFontSize}px "Sora", "Inter", sans-serif`;
      ctx.fillText(fitCanvasText(pickTitle, panelW - 68), panelX + 34, panelY + 50);

      ctx.font = '500 20px "Inter", sans-serif';
      drawWrappedText(pickSubtitle, panelX + 34, panelY + 104, panelW - 68, 30, { maxLines: 2 });

      ctx.font = '600 17px "Inter", sans-serif';
      ctx.fillStyle = TOKENS.ink;
      const floorLessonLabel = formatUiText("upgradeFloorLesson", "Floor {floor}: {lesson}", {
        floor: floor.id,
        lesson: floorLesson
      });
      ctx.fillText(fitCanvasText(floorLessonLabel, panelW - 68), panelX + 34, panelY + 174);

      for (let i = 0; i < game.upgradeOptions.length; i += 1) {
        const option = game.upgradeOptions[i];
        const rect = cardRects[i];
        const selected = i === game.upgradeSelectedIndex;
        drawUpgradeCard(option, rect, selected, accent);
      }

      ctx.fillStyle = TOKENS.fog;
      fillRoundRect(teachX, teachY, teachW, contentH, 16);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(teachX, teachY, teachW, contentH, 16);

      ctx.fillStyle = rgba(accent, 0.24);
      fillRoundRect(teachX + 12, teachY + 10, teachW - 24, 7, 999);

      withClipRect(teachX + 10, teachY + 10, teachW - 20, contentH - 20, () => {
        const innerX = teachX + 16;
        const innerW = teachW - 32;
        let y = teachY + 24;

        ctx.fillStyle = TOKENS.ink;
        ctx.font = '700 14px "Inter", sans-serif';
        const teachPanelLabel = uiText("teachCardTitlePrefix", "Teach Card");
        ctx.fillText(fitCanvasText(teachPanelLabel, innerW), innerX, y);
        y += 24;

        const teachTitleSize = fitHeadingFontSize(teachCard.title, innerW, 30, 24, 2);
        ctx.font = `700 ${teachTitleSize}px "Sora", "Inter", sans-serif`;
        y = drawWrappedText(teachCard.title, innerX, y, innerW, Math.round(teachTitleSize * 1.13), { maxLines: 2 });

        y += 6;
        ctx.font = '600 17px "Inter", sans-serif';
        y = drawWrappedText(teachCard.oneLiner, innerX, y, innerW, 23, { maxLines: 2 });

        y += 8;
        ctx.font = '600 15px "Inter", sans-serif';
        for (let i = 0; i < teachCard.bullets.length; i += 1) {
          const bulletText = `• ${teachCard.bullets[i]}`;
          y = drawWrappedText(bulletText, innerX, y, innerW, 20, { maxLines: 1 });
        }
      });

      const footerText = uiText("upgradePanelFooter", "1-3 pick • Enter confirm • Esc disabled");
      ctx.font = '600 17px "Inter", sans-serif';
      ctx.fillStyle = TOKENS.ink;
      ctx.fillText(fitCanvasText(footerText, panelW - 68), panelX + 34, panelY + panelH - 56);
    });

    if (game.upgradeNoticeTimer > 0) {
      ctx.fillStyle = rgba(accent, 0.18);
      fillRoundRect(panelX + panelW - 282, panelY + panelH - 74, 246, 32, 999);
      ctx.strokeStyle = TOKENS.ink;
      strokeRoundRect(panelX + panelW - 282, panelY + panelH - 74, 246, 32, 999);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 15px "Inter", sans-serif';
      ctx.fillText(uiText("upgradePanelNoticeChooseOne", "Choose one to continue."), panelX + panelW - 258, panelY + panelH - 66);
    }
  }

  function drawBombBriefing(floor, accent) {
    const briefingMode =
      game.bombBriefingMode === "upgrade_final"
        ? "upgrade_final"
        : game.bombBriefingMode === "upgrade"
          ? "upgrade"
          : "intro";
    const copy = typeof getBombBriefingCopy === "function" ? getBombBriefingCopy(briefingMode) : BOMB_BRIEFING_FALLBACK;
    const chargeCount = clamp(Number.parseInt(String(copy.chargeCount || 1), 10) || 1, 1, 3);
    const showChargeDetails = chargeCount > 1;
    const enterGoal = Math.max(1, BOMB_BRIEFING_ACCEPT_COUNT || 3);
    const accepted = clamp(game.bombBriefingEnterCount, 0, enterGoal);
    const nextStep = clamp(accepted + 1, 1, enterGoal);
    const baseCta =
      typeof copy.cta === "function"
        ? copy.cta(nextStep, enterGoal)
        : formatUiText("bombBriefingCta", "Press Enter to accept ({step}/{total})", { step: nextStep, total: enterGoal });
    const ctaLine1 = accepted >= enterGoal ? uiText("bombBriefingAcceptedCta", "Accepted. Loading floor...") : baseCta;
    const ctaLine2 =
      accepted >= enterGoal
        ? uiText("bombBriefingAcceptedHint", "Use Space in PLAYING to clear screen.")
        : uiText("bombBriefingPendingHint", "Then press Space in PLAYING");

    const safeMarginX = Math.round(WIDTH * 0.06);
    const safeMarginY = Math.round(HEIGHT * 0.06);
    const panelX = safeMarginX;
    const panelY = safeMarginY;
    const panelW = WIDTH - safeMarginX * 2;
    const panelH = HEIGHT - safeMarginY * 2;

    ctx.fillStyle = rgba(accent, 0.2);
    fillRoundRect(panelX + 10, panelY + 14, panelW, panelH, 26);
    ctx.strokeStyle = rgba(TOKENS.ink, 0.24);
    ctx.lineWidth = 2;
    strokeRoundRect(panelX + 10, panelY + 14, panelW, panelH, 26);

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(panelX, panelY, panelW, panelH, 26);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 26);

    ctx.fillStyle = rgba(accent, 0.24);
    fillRoundRect(panelX + 24, panelY + 22, panelW - 48, 10, 999);

    const panelPad = 28;
    const zoneGap = 14;
    const headerH = 72;
    const ctaH = 92;
    const bodyGap = 18;
    const rightW = 360;
    const contentX = panelX + panelPad;
    const contentW = panelW - panelPad * 2;
    const headerY = panelY + 40;
    const ctaY = panelY + panelH - panelPad - ctaH;
    const bodyY = headerY + headerH + zoneGap;
    const bodyBottom = ctaY - zoneGap;
    const bodyH = Math.max(220, bodyBottom - bodyY);

    const leftRect = { x: contentX, y: bodyY, w: contentW - rightW - bodyGap, h: bodyH };
    const rightRect = { x: leftRect.x + leftRect.w + bodyGap, y: bodyY, w: rightW, h: bodyH };

    const title = copy.title || "Press Space: Escalation Pulse";
    const subtitle = copy.subtitle || "In gameplay, Space clears enemies and enemy bullets.";
    const bullets = Array.isArray(copy.bullets)
      ? copy.bullets.filter((line) => typeof line === "string" && line.trim()).slice(0, 3)
      : [];
    const steps = Array.isArray(copy.steps)
      ? copy.steps.filter((line) => typeof line === "string" && line.trim()).slice(0, enterGoal)
      : [];
    const lessonTag = formatUiText("bombBriefingLessonTag", "Floor {floor} power lesson", { floor: floor.id });
    const badgeText = copy.abilityName || "Escalation Pulse";

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = '700 17px "Inter", sans-serif';
    ctx.fillText(fitCanvasText(lessonTag, contentW - 340), contentX, headerY + 8);

    const badgeFont = fitFontSizeForLine(badgeText, 280, 48, 18, '700 ${size}px "Sora", "Inter", sans-serif');
    ctx.font = `700 ${badgeFont}px "Sora", "Inter", sans-serif`;
    const badgeW = clamp(Math.ceil(ctx.measureText(badgeText).width) + 54, 204, 296);
    const badgeH = 62;
    const badgeX = contentX + contentW - badgeW;
    const badgeY = headerY + 4;
    ctx.fillStyle = rgba(accent, 0.2);
    fillRoundRect(badgeX + 8, badgeY + 6, badgeW, badgeH, 999);
    ctx.fillStyle = accent;
    fillRoundRect(badgeX, badgeY, badgeW, badgeH, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(badgeX, badgeY, badgeW, badgeH, 999);
    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + badgeW * 0.5, badgeY + badgeH * 0.5 + 1);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(leftRect.x, leftRect.y, leftRect.w, leftRect.h, 18);
    fillRoundRect(rightRect.x, rightRect.y, rightRect.w, rightRect.h, 18);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(leftRect.x, leftRect.y, leftRect.w, leftRect.h, 18);
    strokeRoundRect(rightRect.x, rightRect.y, rightRect.w, rightRect.h, 18);

    const leftInnerX = leftRect.x + 18;
    const leftInnerY = leftRect.y + 16;
    const leftInnerW = leftRect.w - 36;
    const leftInnerH = leftRect.h - 32;
    const keyCalloutH = 64;
    const actionStripH = 40;
    const chargeRowH = showChargeDetails ? 34 : 0;
    const bulletLineH = 20;
    const blockGap = 10;
    const maxBulletCount = Math.min(2, bullets.length);
    const bulletAreaH = maxBulletCount > 0 ? maxBulletCount * bulletLineH + 6 : 0;
    const chargeRowBudget = chargeRowH > 0 ? chargeRowH + blockGap : 0;
    const reservedBottom = keyCalloutH + actionStripH + chargeRowBudget + bulletAreaH + blockGap * 3;
    const topTextH = Math.max(108, leftInnerH - reservedBottom);

    withClipRect(leftInnerX, leftInnerY, leftInnerW, leftInnerH, () => {
      const topCopyRect = { x: leftInnerX, y: leftInnerY, w: leftInnerW, h: topTextH };
      const keyRect = { x: leftInnerX, y: topCopyRect.y + topCopyRect.h + blockGap, w: Math.min(338, leftInnerW), h: keyCalloutH };
      const actionRect = { x: leftInnerX, y: keyRect.y + keyRect.h + blockGap, w: leftInnerW, h: actionStripH };
      const chargeRect = chargeRowH
        ? { x: leftInnerX, y: actionRect.y + actionRect.h + blockGap, w: leftInnerW, h: chargeRowH }
        : null;
      const bulletsRect = {
        x: leftInnerX,
        y: chargeRect ? chargeRect.y + chargeRect.h + blockGap : actionRect.y + actionRect.h + blockGap,
        w: leftInnerW,
        h: Math.max(0, leftInnerY + leftInnerH - (chargeRect ? chargeRect.y + chargeRect.h + blockGap : actionRect.y + actionRect.h + blockGap))
      };

      withClipRect(topCopyRect.x, topCopyRect.y, topCopyRect.w, topCopyRect.h, () => {
        let textY = leftInnerY;
        const headingMaxH = Math.max(64, topCopyRect.h - 34);
        const headingSize = fitHeadingFontSizeForBox(title, leftInnerW, headingMaxH, 58, 30, 2, 1.04);
        ctx.fillStyle = TOKENS.ink;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.font = `700 ${headingSize}px "Sora", "Inter", sans-serif`;
        const headingLineH = Math.round(headingSize * 1.04);
        const headingLines = getWrappedLines(title, leftInnerW, 2);
        for (let i = 0; i < headingLines.length; i += 1) {
          ctx.fillText(headingLines[i], leftInnerX, textY + i * headingLineH);
        }
        textY += headingLines.length * headingLineH;
        textY += 6;
        const subtitleMaxH = Math.max(20, topCopyRect.y + topCopyRect.h - textY);
        let subtitleSize = topCopyRect.h >= 130 ? 17 : 15;
        let subtitleLineH = Math.round(subtitleSize * 1.24);
        let subtitleLines = getWrappedLines(subtitle, leftInnerW, topCopyRect.h >= 130 ? 2 : 1);
        while (subtitleSize > 14) {
          ctx.font = `600 ${subtitleSize}px "Inter", sans-serif`;
          subtitleLineH = Math.round(subtitleSize * 1.24);
          subtitleLines = getWrappedLines(subtitle, leftInnerW, topCopyRect.h >= 130 ? 2 : 1);
          if (subtitleLines.length * subtitleLineH <= subtitleMaxH) {
            break;
          }
          subtitleSize -= 1;
        }
        ctx.font = `600 ${subtitleSize}px "Inter", sans-serif`;
        for (let i = 0; i < subtitleLines.length; i += 1) {
          ctx.fillText(subtitleLines[i], leftInnerX, textY + i * subtitleLineH);
        }
      });

      ctx.fillStyle = rgba(accent, 0.22);
      fillRoundRect(keyRect.x + 9, keyRect.y + 7, keyRect.w, keyRect.h, 18);
      ctx.fillStyle = accent;
      fillRoundRect(keyRect.x, keyRect.y, keyRect.w, keyRect.h, 18);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 3;
      strokeRoundRect(keyRect.x, keyRect.y, keyRect.w, keyRect.h, 18);

      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const keyLabel = uiText("bombBriefingKeyLabel", "SPACE");
      const keyWordSize = fitHeadingFontSizeForBox(keyLabel, keyRect.w - 24, Math.max(28, keyRect.h - 32), 54, 34, 1, 1.02);
      ctx.font = `700 ${keyWordSize}px "Sora", "Inter", sans-serif`;
      ctx.fillText(keyLabel, keyRect.x + keyRect.w * 0.5, keyRect.y + keyRect.h * 0.45);
      ctx.font = '700 15px "Inter", sans-serif';
      ctx.fillText(uiText("bombBriefingUseWindow", "Use during PLAYING"), keyRect.x + keyRect.w * 0.5, keyRect.y + keyRect.h - 20);

      ctx.fillStyle = TOKENS.white;
      fillRoundRect(actionRect.x, actionRect.y, actionRect.w, actionRect.h, 12);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(actionRect.x, actionRect.y, actionRect.w, actionRect.h, 12);
      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const actionLine = uiText("bombBriefingActionLine", "Clears all enemies + enemy bullets");
      const actionTextSize = fitFontSizeForLine(
        actionLine,
        actionRect.w - 24,
        34,
        16,
        '700 ${size}px "Inter", sans-serif'
      );
      ctx.font = `700 ${actionTextSize}px "Inter", sans-serif`;
      const actionLineH = Math.round(actionTextSize * 1.15);
      const actionTextY = actionRect.y + Math.round((actionRect.h - actionLineH) * 0.5);
      ctx.fillText(fitCanvasText(actionLine, actionRect.w - 24), actionRect.x + 12, actionTextY);

      if (chargeRect) {
        const chipGap = 12;
        const chipW = Math.floor((chargeRect.w - chipGap * (chargeCount - 1)) / chargeCount);
        for (let i = 0; i < chargeCount; i += 1) {
          const chipX = chargeRect.x + i * (chipW + chipGap);
          ctx.fillStyle = rgba(accent, 0.24);
          fillRoundRect(chipX, chargeRect.y, chipW, chargeRect.h, 999);
          ctx.strokeStyle = TOKENS.ink;
          ctx.lineWidth = 2;
          strokeRoundRect(chipX, chargeRect.y, chipW, chargeRect.h, 999);
          ctx.fillStyle = TOKENS.ink;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = '700 14px "Inter", sans-serif';
          ctx.fillText(
            formatUiText("bombBriefingChargeChip", "SPACE #{index}", { index: i + 1 }),
            chipX + chipW * 0.5,
            chargeRect.y + chargeRect.h * 0.5 + 1
          );
        }
      }

      withClipRect(bulletsRect.x, bulletsRect.y, bulletsRect.w, bulletsRect.h, () => {
        ctx.fillStyle = TOKENS.ink;
        ctx.font = '600 16px "Inter", sans-serif';
        let lineY = bulletsRect.y;
        const maxBullets = Math.min(maxBulletCount, Math.max(0, Math.floor(bulletsRect.h / bulletLineH)));
        for (let i = 0; i < maxBullets; i += 1) {
          lineY = drawWrappedText(`• ${bullets[i]}`, leftInnerX, lineY, leftInnerW, bulletLineH, { maxLines: 1 });
        }
      });
    });

    const rightInnerX = rightRect.x + 16;
    const rightInnerY = rightRect.y + 16;
    const rightInnerW = rightRect.w - 32;
    const rightInnerH = rightRect.h - 32;

    withClipRect(rightInnerX, rightInnerY, rightInnerW, rightInnerH, () => {
      const stepGap = 12;
      const upgradeBadgeH = showChargeDetails ? 52 : 0;
      const upgradeBadgeGap = showChargeDetails ? 10 : 0;
      let stepY = rightInnerY;
      let stepAreaH = rightInnerH;

      if (showChargeDetails) {
        ctx.fillStyle = rgba(accent, 0.24);
        fillRoundRect(rightInnerX, rightInnerY, rightInnerW, upgradeBadgeH, 14);
        ctx.strokeStyle = TOKENS.ink;
        ctx.lineWidth = 2;
        strokeRoundRect(rightInnerX, rightInnerY, rightInnerW, upgradeBadgeH, 14);
        ctx.fillStyle = TOKENS.ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = '700 28px "Sora", "Inter", sans-serif';
        ctx.fillText(
          formatUiText("bombBriefingChargeCount", "{count} CHARGES", { count: chargeCount }),
          rightInnerX + rightInnerW * 0.5,
          rightInnerY + upgradeBadgeH * 0.5 + 1
        );
        stepY += upgradeBadgeH + upgradeBadgeGap;
        stepAreaH -= upgradeBadgeH + upgradeBadgeGap;
      }

      const stepCardH = Math.max(78, Math.floor((stepAreaH - stepGap * (enterGoal - 1)) / enterGoal));

      for (let i = 0; i < enterGoal; i += 1) {
        const isDone = i < accepted;
        const label = steps[i] || formatUiText("bombBriefingStepFallback", "Step {step}", { step: i + 1 });
        const stepLine = formatUiText("bombBriefingStepLine", "Enter {step}: {label}", { step: i + 1, label });
        const cardX = rightInnerX;
        const cardY = stepY;
        const cardW = rightInnerW;
        const markerGutter = 32;

        ctx.fillStyle = isDone ? rgba(accent, 0.28) : rgba(TOKENS.white, 0.9);
        fillRoundRect(cardX, cardY, cardW, stepCardH, 14);
        ctx.strokeStyle = TOKENS.ink;
        ctx.lineWidth = isDone ? 3 : 2;
        strokeRoundRect(cardX, cardY, cardW, stepCardH, 14);

        ctx.fillStyle = TOKENS.ink;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        let stepFont = 17;
        let stepLineH = 22;
        let stepLines = getWrappedLines(stepLine, cardW - markerGutter - 26, 2);
        const stepTextHLimit = Math.max(26, stepCardH - 24);
        while (stepFont > 14) {
          ctx.font = `700 ${stepFont}px "Inter", sans-serif`;
          stepLineH = Math.round(stepFont * 1.22);
          stepLines = getWrappedLines(stepLine, cardW - markerGutter - 26, 2);
          if (stepLines.length * stepLineH <= stepTextHLimit) {
            break;
          }
          stepFont -= 1;
        }
        ctx.font = `700 ${stepFont}px "Inter", sans-serif`;
        const stepTextY = cardY + Math.max(10, Math.floor((stepCardH - stepLines.length * stepLineH) * 0.5));
        for (let j = 0; j < stepLines.length; j += 1) {
          ctx.fillText(stepLines[j], cardX + 16, stepTextY + j * stepLineH);
        }

        ctx.fillStyle = isDone ? TOKENS.ink : rgba(TOKENS.ink, 0.45);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = '700 30px "Inter", sans-serif';
        ctx.fillText(isDone ? "✓" : "•", cardX + cardW - 20, cardY + stepCardH * 0.5 + 1);

        stepY += stepCardH + stepGap;
      }
    });

    const ctaW = contentW - 118;
    const ctaX = contentX + (contentW - ctaW) * 0.5;
    ctx.fillStyle = rgba(accent, 0.24);
    fillRoundRect(ctaX - 7, ctaY - 5, ctaW + 14, ctaH + 10, 999);
    ctx.fillStyle = accent;
    fillRoundRect(ctaX, ctaY, ctaW, ctaH, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(ctaX, ctaY, ctaW, ctaH, 999);

    const ctaInnerW = ctaW - 44;
    const ctaLine1Size = fitHeadingFontSizeForBox(ctaLine1, ctaInnerW, 38, 40, 22, 1, 1.08);
    const ctaLine2Size = fitHeadingFontSizeForBox(
      ctaLine2,
      ctaInnerW,
      26,
      22,
      15,
      1,
      1.2,
      '700 ${size}px "Inter", sans-serif'
    );

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `700 ${ctaLine1Size}px "Sora", "Inter", sans-serif`;
    const ctaLine1Y = ctaY + 11;
    ctx.fillText(fitCanvasText(ctaLine1, ctaInnerW), ctaX + ctaW * 0.5, ctaLine1Y);
    ctx.font = `700 ${ctaLine2Size}px "Inter", sans-serif`;
    const ctaLine2Y = ctaY + ctaH - Math.round(ctaLine2Size * 1.2) - 5;
    ctx.fillText(fitCanvasText(ctaLine2, ctaInnerW), ctaX + ctaW * 0.5, ctaLine2Y);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function drawLessonSlideOverlay(floor, accent) {
    const card =
      typeof getNarrativeTeachCard === "function"
        ? getNarrativeTeachCard(floor && floor.id ? floor.id : 1)
        : {
            title: `Floor ${(floor && floor.id) || 1}: Neural-net concept`,
            oneLiner: "A neural net turns numbers into one guess.",
            bullets: ["Inputs are numbers.", "Weights set importance."],
            tryThis: "Say: inputs -> weights -> neurons -> output.",
            visualMode: "network_basic"
          };
    const title = typeof card.title === "string" && card.title.trim() ? card.title.trim() : "Neural-net concept";
    const oneLiner = typeof card.oneLiner === "string" && card.oneLiner.trim()
      ? card.oneLiner.trim()
      : "A neural net turns numbers into one guess.";
    const tryThis = typeof card.tryThis === "string" && card.tryThis.trim()
      ? card.tryThis.trim()
      : "Say: inputs -> weights -> neurons -> output.";
    const visualMode = typeof card.visualMode === "string" && card.visualMode.trim() ? card.visualMode.trim() : "network_basic";
    const bullets = Array.isArray(card.bullets)
      ? card.bullets.filter((line) => typeof line === "string" && line.trim()).slice(0, 2)
      : ["Inputs are numbers.", "Weights set importance."];
    const panelW = Math.min(920, WIDTH - 52);
    const panelH = Math.min(520, HEIGHT - 52);
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;

    ctx.fillStyle = rgba(accent, 0.2);
    fillRoundRect(panelX + 10, panelY + 12, panelW, panelH, 24);
    ctx.fillStyle = TOKENS.white;
    fillRoundRect(panelX, panelY, panelW, panelH, 24);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 24);

    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 24, panelY + 24, panelW - 48, 10, 999);

    const innerX = panelX + 28;
    const innerY = panelY + 50;
    const innerW = panelW - 56;
    const innerH = panelH - 96;
    const rightW = Math.max(286, Math.min(360, Math.floor(innerW * 0.42)));
    const gap = 18;
    const leftW = innerW - rightW - gap;
    const rightX = innerX + leftW + gap;

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(rightX, innerY, rightW, innerH, 16);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(rightX, innerY, rightW, innerH, 16);

    const lessonTextPad = 10;
    const lessonPanelW = Math.max(120, leftW - 6);
    const lessonTextX = innerX + lessonTextPad;
    const lessonTextY = innerY + lessonTextPad;
    const lessonTextW = lessonPanelW - lessonTextPad * 2;
    withRectClip(lessonTextX, lessonTextY, lessonTextW, innerH - lessonTextPad * 2, () => {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      let y = lessonTextY;
      const titleSize = fitHeadingFontSize(title, lessonTextW, 34, 24, 2);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = `700 ${titleSize}px "Sora", "Inter", sans-serif`;
      y = drawWrappedText(title, lessonTextX, y, lessonTextW, Math.round(titleSize * 1.15), { maxLines: 2 });
      y += 10;

      ctx.font = '600 20px "Inter", sans-serif';
      y = drawWrappedText(oneLiner, lessonTextX, y, lessonTextW, 28, { maxLines: 2 });
      y += 10;

      ctx.font = '600 17px "Inter", sans-serif';
      for (let i = 0; i < bullets.length; i += 1) {
        y = drawWrappedText(`• ${bullets[i]}`, lessonTextX, y, lessonTextW, 24, { maxLines: 2 });
      }

      y += 12;
      const tryThisY = Math.min(y, innerY + innerH - 74);
      ctx.fillStyle = rgba(accent, 0.2);
      fillRoundRect(lessonTextX, tryThisY, lessonTextW, 64, 12);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(lessonTextX, tryThisY, lessonTextW, 64, 12);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 17px "Inter", sans-serif';
      drawWrappedText(tryThis, lessonTextX + 12, tryThisY + 12, lessonTextW - 24, 22, { maxLines: 2 });
    });

    drawLessonSlideDiagram(
      { x: rightX + 12, y: innerY + 12, w: rightW - 24, h: innerH - 24 },
      accent,
      visualMode
    );

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 16px "Inter", sans-serif';
    ctx.fillText(uiText("lessonSlideContinue", "Enter or Space: continue"), WIDTH * 0.5, panelY + panelH - 32);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function drawLessonSlideDiagram(rect, accent, visualMode) {
    const reducedMotion = !!AIPU.input.prefersReducedMotion;
    const pulse = reducedMotion ? 0 : Math.sin(game.globalTime * 2.2) * 0.5 + 0.5;
    const mode = typeof visualMode === "string" ? visualMode : "network_basic";
    const highlightLayer =
      mode === "inputs_nodes" || mode === "weights_knobs"
        ? 0
        : mode === "sum_bias" || mode === "activation_gate" || mode === "layers_stack"
          ? 1
          : 2;

    ctx.save();
    withClipRect(rect.x, rect.y, rect.w, rect.h, () => {
      const brainCx = rect.x + rect.w * 0.28;
      const brainCy = rect.y + rect.h * 0.45;
      const brainOffset = reducedMotion ? 0 : Math.sin(game.globalTime * 1.8) * 2;

      ctx.fillStyle = rgba(accent, 0.18);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(brainCx - 24, brainCy + brainOffset, 46, 54, 0, 0, Math.PI * 2);
      ctx.ellipse(brainCx + 24, brainCy - brainOffset, 46, 54, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(brainCx, brainCy - 56);
      ctx.lineTo(brainCx, brainCy + 56);
      ctx.stroke();

      const layerX = [rect.x + rect.w * 0.58, rect.x + rect.w * 0.72, rect.x + rect.w * 0.86];
      const layerY = [
        [rect.y + 58, rect.y + rect.h * 0.5, rect.y + rect.h - 58],
        [rect.y + 78, rect.y + rect.h * 0.5, rect.y + rect.h - 78],
        [rect.y + rect.h * 0.5]
      ];

      ctx.strokeStyle = rgba(TOKENS.ink, 0.45);
      ctx.lineWidth = 2;
      for (let li = 0; li < layerY.length - 1; li += 1) {
        for (let i = 0; i < layerY[li].length; i += 1) {
          for (let j = 0; j < layerY[li + 1].length; j += 1) {
            ctx.beginPath();
            ctx.moveTo(layerX[li], layerY[li][i]);
            ctx.lineTo(layerX[li + 1], layerY[li + 1][j]);
            ctx.stroke();
          }
        }
      }

      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      for (let li = 0; li < layerY.length; li += 1) {
        for (let i = 0; i < layerY[li].length; i += 1) {
          const x = layerX[li];
          const y = layerY[li][i];
          const radius = 11 + (!reducedMotion && li === highlightLayer ? pulse * 2 : 0);
          ctx.fillStyle = li === highlightLayer ? rgba(accent, 0.45) : TOKENS.white;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(brainCx + 58, brainCy);
      ctx.lineTo(layerX[0] - 18, layerY[0][1]);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawDeathLessonOverlay(floor, accent) {
    const floorId = floor && Number.isFinite(floor.id) ? floor.id : Math.max(1, game.currentFloorIndex + 1);
    const card =
      typeof getDeathLessonCard === "function"
        ? getDeathLessonCard(floorId, game.deathLessonIndex)
        : {
            title: "Neural-net lesson",
            oneLiner: "Use numbers to make one guess.",
            bullets: ["Inputs feed the model.", "Weights set influence."],
            tryThis: "Say: inputs -> weights -> output.",
            visualMode: "network_basic"
          };
    const title = typeof card.title === "string" && card.title.trim() ? card.title.trim() : "Neural-net lesson";
    const oneLiner = typeof card.oneLiner === "string" && card.oneLiner.trim()
      ? card.oneLiner.trim()
      : "Use numbers to make one guess.";
    const tryThis = typeof card.tryThis === "string" && card.tryThis.trim()
      ? card.tryThis.trim()
      : "Say: inputs -> weights -> output.";
    const bullets = Array.isArray(card.bullets)
      ? card.bullets.filter((line) => typeof line === "string" && line.trim()).slice(0, 2)
      : ["Inputs feed the model.", "Weights set influence."];
    const reducedMotion = !!AIPU.input.prefersReducedMotion;
    const phase = reducedMotion ? 0 : game.globalTime;

    for (let i = 0; i < 12; i += 1) {
      const y = 86 + i * 48;
      const wave = Math.sin(phase * 1.4 + i * 0.9) * (reducedMotion ? 0 : 10);
      ctx.strokeStyle = rgba(TOKENS.ink, 0.08);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(90, y + wave);
      ctx.lineTo(WIDTH - 90, y - wave);
      ctx.stroke();
    }

    for (let i = 0; i < 18; i += 1) {
      const x = 110 + i * 60;
      const wobble = Math.cos(phase * 1.8 + i * 0.6) * (reducedMotion ? 0 : 8);
      ctx.fillStyle = rgba(accent, 0.14);
      fillRoundRect(x, 76 + wobble, 30, 8, 999);
      fillRoundRect(WIDTH - x - 30, HEIGHT - 86 - wobble, 30, 8, 999);
    }

    const panelW = Math.min(860, WIDTH - 52);
    const panelH = Math.min(430, HEIGHT - 52);
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;
    ctx.fillStyle = rgba(TOKENS.white, 0.92);
    fillRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 22, panelY + 20, panelW - 44, 10, 999);

    const contentX = panelX + 30;
    const contentY = panelY + 46;
    const contentW = panelW - 60;
    const contentH = panelH - 86;
    const contentTextPad = 10;
    const contentTextX = contentX + contentTextPad;
    const contentTextY = contentY + contentTextPad;
    const contentTextW = contentW - contentTextPad * 2;
    const contentTextH = contentH - contentTextPad * 2;
    withRectClip(contentTextX, contentTextY, contentTextW, contentTextH, () => {
      const titleSize = fitHeadingFontSize(title, contentTextW, 34, 24, 2);
      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `700 ${titleSize}px "Sora", "Inter", sans-serif`;
      let y = drawWrappedText(title, contentTextX, contentTextY, contentTextW, Math.round(titleSize * 1.14), { maxLines: 2 });
      y += 8;
      ctx.font = '600 20px "Inter", sans-serif';
      y = drawWrappedText(oneLiner, contentTextX, y, contentTextW, 28, { maxLines: 2 });
      y += 10;
      ctx.font = '600 17px "Inter", sans-serif';
      for (let i = 0; i < bullets.length; i += 1) {
        y = drawWrappedText(`• ${bullets[i]}`, contentTextX, y, contentTextW, 24, { maxLines: 2 });
      }

      y += 14;
      const tryThisY = Math.min(y, contentTextY + contentTextH - 74);
      ctx.fillStyle = TOKENS.fog;
      fillRoundRect(contentTextX, tryThisY, contentTextW, 70, 14);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(contentTextX, tryThisY, contentTextW, 70, 14);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 17px "Inter", sans-serif';
      drawWrappedText(tryThis, contentTextX + 12, tryThisY + 14, contentTextW - 24, 22, { maxLines: 2 });
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 16px "Inter", sans-serif';
    ctx.fillText(uiText("deathLessonContinue", "Enter or Space: continue"), WIDTH * 0.5, panelY + panelH - 28);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function computeUpgradeCardRects(areaX, areaY, areaW, optionCount, options = {}) {
    if (optionCount <= 0) {
      return [];
    }

    const gap = Number.isFinite(options.gap) ? options.gap : 20;
    const cardH = Number.isFinite(options.cardH) ? options.cardH : 230;

    if (optionCount === 3 && areaW < 640) {
      const cardW = Math.floor((areaW - gap) / 2);
      const stackedH = Math.max(160, Math.min(cardH, 178));
      return [
        { x: areaX, y: areaY, w: cardW, h: stackedH },
        { x: areaX + cardW + gap, y: areaY, w: cardW, h: stackedH },
        { x: areaX + Math.floor((areaW - cardW) * 0.5), y: areaY + stackedH + gap, w: cardW, h: stackedH }
      ];
    }

    const cardW = Math.floor((areaW - gap * (optionCount - 1)) / optionCount);
    const rects = [];
    for (let i = 0; i < optionCount; i += 1) {
      rects.push({ x: areaX + i * (cardW + gap), y: areaY, w: cardW, h: cardH });
    }
    return rects;
  }

  function drawUpgradeCard(option, rect, selected, accent) {
    const isStackless = !!option.stackless || !!option.fallbackBaseId;
    const stack = isStackless ? 0 : upgrades.getStack(option.id);
    const nextStack = isStackless ? 0 : Math.min(stack + 1, option.maxStacks);
    const tags = option.tags.join(" / ");

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(rect.x, rect.y, rect.w, rect.h, 16);

    ctx.strokeStyle = selected ? accent : TOKENS.ink;
    ctx.lineWidth = selected ? 4 : 2;
    strokeRoundRect(rect.x, rect.y, rect.w, rect.h, 16);

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.font = '700 24px "Sora", "Inter", sans-serif';
    const badgeReserve = selected ? 94 : 0;
    const titleWidth = Math.max(96, rect.w - 32 - badgeReserve);
    const titleLineHeight = 30;
    const titleBottom = drawWrappedText(option.name, rect.x + 16, rect.y + 16, titleWidth, titleLineHeight, {
      maxLines: 2
    });

    ctx.font = '500 16px "Inter", sans-serif';
    const descTop = titleBottom + 8;
    const footerTop = rect.y + rect.h - 84;
    const descSpace = Math.max(24, footerTop - descTop - 8);
    const descLineHeight = 24;
    const descMaxLines = Math.max(1, Math.floor(descSpace / descLineHeight));
    drawWrappedText(option.desc, rect.x + 16, descTop, rect.w - 32, descLineHeight, { maxLines: descMaxLines });

    if (selected) {
      const badgeW = 78;
      const badgeH = 18;
      const badgeX = rect.x + rect.w - badgeW - 12;
      const badgeY = rect.y + 12;
      ctx.fillStyle = accent;
      fillRoundRect(badgeX, badgeY, badgeW, badgeH, 999);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 12px "Inter", sans-serif';
      ctx.textBaseline = "top";
      ctx.fillText(uiText("upgradeCardSelected", "SELECTED"), badgeX + 7, badgeY + 2);
    }

    ctx.fillStyle = rgba(accent, 0.18);
    fillRoundRect(rect.x + 16, rect.y + rect.h - 84, rect.w - 32, 28, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(rect.x + 16, rect.y + rect.h - 84, rect.w - 32, 28, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 14px "Inter", sans-serif';
    ctx.fillText(formatUiText("upgradeCardTags", "Tags: {tags}", { tags }), rect.x + 26, rect.y + rect.h - 76);

    ctx.font = '600 16px "Inter", sans-serif';
    if (isStackless) {
      ctx.fillText(uiText("upgradeCardInstantEffect", "Instant effect (no stacks)"), rect.x + 16, rect.y + rect.h - 42);
    } else {
      ctx.fillText(
        formatUiText("upgradeCardStacks", "Stacks: {stack} -> {nextStack}", { stack, nextStack }),
        rect.x + 16,
        rect.y + rect.h - 42
      );
    }
  }

  function isTitleSequenceComplete() {
    return game.titleIntroTime >= TITLE_SEQUENCE.finish;
  }

  function normalizeUpgradeSelection() {
    if (game.upgradeOptions.length === 0) {
      game.upgradeSelectedIndex = 0;
      return;
    }
    game.upgradeSelectedIndex = clamp(game.upgradeSelectedIndex, 0, game.upgradeOptions.length - 1);
  }

  function drawTitleCinematic() {
    const t = game.titleIntroTime;
    const accent = accentColor("yellow");

    drawBackdrop(accent);

    if (AIPU.input.prefersReducedMotion) {
      drawTitleFinalFrame({
        panelAppear: 1,
        verticalOffset: 0,
        panelAlpha: 1,
        promptAlpha: 1,
        animatePrompt: false
      });
      return;
    }

    const fadeIn = easeOutCubic(clamp(t / TITLE_SEQUENCE.fadeInEnd, 0, 1));
    const panelAppear = easeOutCubic(
      clamp((t - TITLE_SEQUENCE.panelInStart) / (TITLE_SEQUENCE.panelInEnd - TITLE_SEQUENCE.panelInStart), 0, 1)
    );
    const sweepProgress = easeInOutSine(
      clamp((t - TITLE_SEQUENCE.accentSweepStart) / (TITLE_SEQUENCE.accentSweepEnd - TITLE_SEQUENCE.accentSweepStart), 0, 1)
    );

    if (fadeIn < 1) {
      ctx.fillStyle = rgba(TOKENS.ink, 1 - fadeIn);
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const railX = 112;
    const railY = 132;
    const railW = WIDTH - railX * 2;
    const sweepW = 220;
    const sweepX = railX + (railW - sweepW) * sweepProgress;

    ctx.fillStyle = rgba(accent, 0.12);
    fillRoundRect(railX, railY, railW, 8, 999);
    ctx.fillStyle = rgba(accent, 0.26);
    fillRoundRect(sweepX, railY - 2, sweepW, 12, 999);

    const verticalOffset = (1 - panelAppear) * 30 + Math.sin(game.globalTime * 1.3) * 2.4 * panelAppear;
    const promptAlpha = 0.76 + (Math.sin(game.globalTime * 2.3) * 0.5 + 0.5) * 0.24;

    drawTitleFinalFrame({
      panelAppear,
      verticalOffset,
      panelAlpha: clamp(0.68 + panelAppear * 0.32, 0, 1),
      promptAlpha,
      animatePrompt: true
    });
  }

  function drawTitleFinalFrame(options = {}) {
    const accent = accentColor("yellow");
    const titleCard = getNarrativeTitleCard();
    const panelAppear = options.panelAppear ?? 1;
    const verticalOffset = options.verticalOffset ?? 0;
    const panelAlpha = options.panelAlpha ?? 1;
    const promptAlpha = options.promptAlpha ?? 1;
    const animatePrompt = options.animatePrompt !== false;
    const panelX = 152;
    const panelY = 164 + verticalOffset;
    const panelW = WIDTH - 304;
    const panelH = HEIGHT - 268;
    const footerReserved = 132;

    ctx.save();
    ctx.globalAlpha = clamp(panelAlpha, 0, 1);

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 22);

    ctx.fillStyle = rgba(accent, 0.24);
    fillRoundRect(panelX + 24, panelY + 24, panelW - 48, 10, 999);

    withClipRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, () => {
      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const titleMaxWidth = panelW - 96;
      const titleFontSize = fitHeadingFontSize(titleCard.gameTitle, titleMaxWidth, 58, 40, 2);
      ctx.font = `700 ${titleFontSize}px "Sora", "Inter", sans-serif`;
      const titleLineHeight = Math.round(titleFontSize * 1.08);
      const titleTop = panelY + 54 + (1 - panelAppear) * 8;
      const titleBottom = drawWrappedText(titleCard.gameTitle, WIDTH * 0.5, titleTop, titleMaxWidth, titleLineHeight, {
        maxLines: 2
      });

      const taglineMaxWidth = panelW - 120;
      const taglineFontSize = fitFontSizeForLine(
        titleCard.tagline,
        taglineMaxWidth,
        24,
        20,
        '700 ${size}px "Inter", sans-serif'
      );
      ctx.font = `700 ${taglineFontSize}px "Inter", sans-serif`;
      const taglineLineHeight = Math.round(taglineFontSize * 1.18);
      const taglineBottom = drawWrappedText(
        titleCard.tagline,
        WIDTH * 0.5,
        titleBottom + 12 + (1 - panelAppear) * 6,
        taglineMaxWidth,
        taglineLineHeight,
        { maxLines: 2 }
      );

      ctx.font = '500 20px "Inter", sans-serif';
      const blurbMaxY = panelY + panelH - footerReserved;
      let blurbY = taglineBottom + 18 + (1 - panelAppear) * 4;
      for (let i = 0; i < titleCard.blurbLines.length; i += 1) {
        if (blurbY > blurbMaxY) {
          break;
        }
        const maxLines = Math.max(1, Math.floor((blurbMaxY - blurbY) / 30) + 1);
        blurbY = drawWrappedText(titleCard.blurbLines[i], WIDTH * 0.5, blurbY, panelW - 96, 30, { maxLines });
      }
    });

    // Title copy is drawn in a clipped context. Re-apply prompt anchors after clip restore.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const prompt = titleCard.footerHint || "Enter: start";
    ctx.font = '700 18px "Inter", sans-serif';
    const promptWidth = ctx.measureText(prompt).width;
    const promptH = 38;
    const footerGap = 8;
    const footerBottomPadding = 22;
    const checkpointFloor = typeof systems.getCheckpointFloor === "function" ? systems.getCheckpointFloor() : 1;
    const footerHint = formatUiText("titleStartFloorHint", "Start floor: {floor} • R: reset to Floor 1", {
      floor: checkpointFloor
    });
    const footerHintSize = fitFontSizeForLine(
      footerHint,
      panelW - 120,
      14,
      12,
      '600 ${size}px "Inter", sans-serif'
    );
    const detailsLineHeight = Math.round(footerHintSize * 1.25);
    const footerBlockH = promptH + footerGap + detailsLineHeight;
    const footerTop = panelY + panelH - footerBottomPadding - footerBlockH;
    const promptY = Math.max(panelY + panelH - footerBlockH - footerBottomPadding, footerTop);

    ctx.fillStyle = rgba(accent, 0.2 + clamp(promptAlpha, 0, 1) * 0.18);
    fillRoundRect(WIDTH * 0.5 - promptWidth * 0.5 - 20, promptY, promptWidth + 40, promptH, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(WIDTH * 0.5 - promptWidth * 0.5 - 20, promptY, promptWidth + 40, promptH, 999);

    ctx.save();
    ctx.globalAlpha = animatePrompt ? clamp(promptAlpha, 0.65, 1) : 1;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(prompt, WIDTH * 0.5, promptY + promptH * 0.5 + 1);
    ctx.restore();

    ctx.textBaseline = "top";
    ctx.fillStyle = TOKENS.ink;
    ctx.font = `600 ${footerHintSize}px "Inter", sans-serif`;
    const footerHintY = promptY + promptH + footerGap;
    ctx.fillText(fitCanvasText(footerHint, panelW - 120), WIDTH * 0.5, footerHintY);

    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawBackdrop(accent, visualTheme = null) {
    ctx.fillStyle = TOKENS.fog;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const motifColor = visualTheme ? visualTheme.lead : accent;
    const motifAlpha = visualTheme ? visualTheme.leadAlphaMax : 0.26;
    drawCornerMotif(28, 24, motifColor, true, motifAlpha);
    drawCornerMotif(WIDTH - 210, HEIGHT - 130, motifColor, false, motifAlpha);

    if (!visualTheme || visualTheme.support.length === 0) {
      return;
    }

    const markerCount = Math.min(6, visualTheme.support.length * 2);
    const markerWidth = 56;
    for (let i = 0; i < markerCount; i += 1) {
      const xTop = 26 + i * 68;
      const yTop = 10 + (i % 2) * 6;
      const xBottom = WIDTH - 82 - i * 68;
      const yBottom = HEIGHT - 20 - (i % 2) * 6;
      ctx.fillStyle = supportTint(visualTheme, i, 0.08 + visualTheme.trippyLevel * 0.008, motifColor);
      fillRoundRect(xTop, yTop, markerWidth, 5, 999);
      fillRoundRect(xBottom, yBottom, markerWidth, 5, 999);
    }
  }

  function drawCorridor(floor, accent, visualTheme = null) {
    ctx.fillStyle = rgba(TOKENS.ink, 0.08);
    fillRoundRect(CORRIDOR.x + 8, CORRIDOR.y + 10, CORRIDOR.w, CORRIDOR.h, 24);

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(CORRIDOR.x, CORRIDOR.y, CORRIDOR.w, CORRIDOR.h, 24);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(CORRIDOR.x, CORRIDOR.y, CORRIDOR.w, CORRIDOR.h, 24);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, 18);

    const wallLeft = { x: CORRIDOR.x + 20, y: WORLD.y, w: WALL_WIDTH - 20, h: WORLD.h };
    const wallRight = { x: WORLD.x + WORLD.w, y: WORLD.y, w: WALL_WIDTH - 20, h: WORLD.h };

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(wallLeft.x, wallLeft.y, wallLeft.w, wallLeft.h, 14);
    fillRoundRect(wallRight.x, wallRight.y, wallRight.w, wallRight.h, 14);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(wallLeft.x, wallLeft.y, wallLeft.w, wallLeft.h, 14);
    strokeRoundRect(wallRight.x, wallRight.y, wallRight.w, wallRight.h, 14);

    drawFloorSkin(floor, accent, wallLeft, wallRight, visualTheme);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, 18);

    ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.22, accent) : rgba(accent, 0.35);
    fillRoundRect(WORLD.x + 18, WORLD.y - 10, WORLD.w - 36, 6, 999);

    ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.22, accent) : rgba(accent, 0.35);
    fillRoundRect(WORLD.x + 18, WORLD.y + WORLD.h + 4, WORLD.w - 36, 6, 999);

    if (visualTheme && visualTheme.support.length > 0) {
      const supportCount = Math.min(5, 2 + visualTheme.trippyLevel);
      for (let i = 0; i < supportCount; i += 1) {
        const x = WORLD.x + 42 + i * 140;
        ctx.fillStyle = supportTint(visualTheme, i, 0.09 + visualTheme.trippyLevel * 0.005, accent);
        fillRoundRect(x, WORLD.y - 8, 42, 4, 999);
        fillRoundRect(x + 10, WORLD.y + WORLD.h + 6, 42, 4, 999);
      }
    }
  }

  function drawCorridorStaticLayer(floor, accent, visualTheme = null) {
    ctx.fillStyle = rgba(TOKENS.ink, 0.08);
    fillRoundRect(CORRIDOR.x + 8, CORRIDOR.y + 10, CORRIDOR.w, CORRIDOR.h, 24);

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(CORRIDOR.x, CORRIDOR.y, CORRIDOR.w, CORRIDOR.h, 24);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(CORRIDOR.x, CORRIDOR.y, CORRIDOR.w, CORRIDOR.h, 24);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, 18);

    const wallLeft = { x: CORRIDOR.x + 20, y: WORLD.y, w: WALL_WIDTH - 20, h: WORLD.h };
    const wallRight = { x: WORLD.x + WORLD.w, y: WORLD.y, w: WALL_WIDTH - 20, h: WORLD.h };

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(wallLeft.x, wallLeft.y, wallLeft.w, wallLeft.h, 14);
    fillRoundRect(wallRight.x, wallRight.y, wallRight.w, wallRight.h, 14);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(wallLeft.x, wallLeft.y, wallLeft.w, wallLeft.h, 14);
    strokeRoundRect(wallRight.x, wallRight.y, wallRight.w, wallRight.h, 14);

    drawFloorSkinStatic(floor, accent, wallLeft, wallRight, visualTheme);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, 18);

    ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.22, accent) : rgba(accent, 0.35);
    fillRoundRect(WORLD.x + 18, WORLD.y - 10, WORLD.w - 36, 6, 999);
    fillRoundRect(WORLD.x + 18, WORLD.y + WORLD.h + 4, WORLD.w - 36, 6, 999);

    if (visualTheme && visualTheme.support.length > 0) {
      const supportCount = Math.min(5, 2 + visualTheme.trippyLevel);
      for (let i = 0; i < supportCount; i += 1) {
        const x = WORLD.x + 42 + i * 140;
        ctx.fillStyle = supportTint(visualTheme, i, 0.09 + visualTheme.trippyLevel * 0.005, accent);
        fillRoundRect(x, WORLD.y - 8, 42, 4, 999);
        fillRoundRect(x + 10, WORLD.y + WORLD.h + 6, 42, 4, 999);
      }
    }
  }

  function drawCorridorDynamicLayer(floor, accent, visualTheme = null) {
    drawFloorSkinDynamic(floor, accent, visualTheme);
  }

  function drawWaterStaticBase(accent, visualTheme, waterState) {
    if (!waterState) {
      return;
    }

    const bandCount = waterState.staticBands;
    const top = WORLD.y + 16;
    const usableHeight = WORLD.h - 32;
    const intensity = clamp(Number(waterState.motionIntensity) || 1, 0.9, 1.58);
    const floorRamp = clamp(Number(waterState.floorProgress) || 0, 0, 1);
    const floorAmpBias = waterState.floorIdIsEarly ? 1.22 : 1;
    const waveAmp = waterState.dynamicAmp * (0.31 + floorRamp * 0.09) * intensity * floorAmpBias;
    const leadAlpha = clamp(waterState.alpha * (0.58 + floorRamp * 0.12), 0.02, WATER_WRAPPER_ALPHA_CAP * 0.84);
    ctx.lineWidth = 1;
    ctx.strokeStyle = visualTheme ? leadTint(visualTheme, leadAlpha, accent) : rgba(accent, leadAlpha);

    for (let i = 0; i < bandCount; i += 1) {
      const t = bandCount > 1 ? i / (bandCount - 1) : 0;
      const y = top + usableHeight * t;
      const edgeAmp = edgeBlend(2.8, "y", y);
      const wobble = 0.55 + t * 0.45;
      ctx.beginPath();
      for (let x = WORLD.x + 8; x <= WORLD.x + WORLD.w - 8; x += 22) {
        const offset = Math.sin(x * 0.012 + i * 0.74) * waveAmp * wobble * edgeAmp;
        if (x === WORLD.x + 8) {
          ctx.moveTo(x, y + offset);
        } else {
          ctx.lineTo(x, y + offset);
        }
      }
      ctx.stroke();
    }

    const rowCount = Math.max(2, Math.floor(waterState.causticCount * 0.24));
    const colCount = Math.max(3, Math.floor(waterState.causticCount * 0.35));
    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < colCount; col += 1) {
        const x = WORLD.x + 18 + col * ((WORLD.w - 36) / Math.max(1, colCount - 1));
        const y = WORLD.y + 20 + row * ((WORLD.h - 40) / Math.max(1, rowCount - 1));
        const edge = edgeBlend(2.3, "x", x) * edgeBlend(2.3, "y", y);
        if (edge < 0.12) {
          continue;
        }
        const width = 5 + ((row + col) % 3) * 1.5;
        const alpha = clamp(waterState.alpha * 0.42 * edge * (0.92 + floorRamp * 0.2), 0.02, 0.12);
        ctx.fillStyle = visualTheme
          ? supportTint(visualTheme, row + col, alpha, accent)
          : rgba(accent, alpha);
        fillRoundRect(x - width * 0.5, y - 1, width, 1.8, 999);
      }
    }
  }

  function drawWaterDynamicOverlay(accent, visualTheme, waterState, progress = 0) {
    if (!waterState) {
      return;
    }

    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const time = (Number.isFinite(game.globalTime) ? game.globalTime : 0) * waterState.speedScale;
    const bandCount = waterState.dynamicBands;
    const rowStep = Math.max(16, Math.floor((WORLD.h - 26) / Math.max(1, bandCount)));
    const intensity = clamp(Number(waterState.motionIntensity) || 1, 0.84, 1.42);
    const floorRamp = clamp(Number(waterState.floorProgress) || 0, 0, 1);
    const ampBase = waterState.dynamicAmp * (0.94 + escalation.intensity * 0.72) * reducedMotionScale * intensity;

    for (let i = 0; i < bandCount; i += 1) {
      const y = WORLD.y + 14 + i * rowStep;
      if (y > WORLD.y + WORLD.h - 12) {
        break;
      }
      const t = bandCount > 1 ? i / (bandCount - 1) : 0;
      const edgeY = edgeBlend(3.2, "y", y);
      const alpha = clamp(
        waterState.alpha * (0.68 + t * 0.42) * (0.94 + floorRamp * 0.16)
          + escalation.intensity * 0.034,
        0.03,
        WATER_WRAPPER_ALPHA_CAP
      );
      ctx.lineWidth = 1 + escalation.intensity * 0.4;
      ctx.strokeStyle = visualTheme ? leadTint(visualTheme, alpha, accent) : rgba(accent, alpha);
      ctx.beginPath();
      for (let x = WORLD.x + 6; x <= WORLD.x + WORLD.w - 6; x += 14) {
        const edgeX = edgeBlend(3.8, "x", x);
        const phase = time * (0.8 + t * 0.62) + i * 0.47 + x * 0.016;
        const offset = Math.sin(phase) * ampBase * edgeX * edgeY;
        if (x === WORLD.x + 6) {
          ctx.moveTo(x, y + offset);
        } else {
          ctx.lineTo(x, y + offset);
        }
      }
      ctx.stroke();

      if (visualTheme && visualTheme.support.length > 0 && i % 2 === 0) {
        const supportAlpha = clamp(alpha * 0.63, 0.02, 0.11);
        ctx.strokeStyle = supportTint(visualTheme, i, supportAlpha, accent);
        ctx.beginPath();
        for (let x = WORLD.x + 10; x <= WORLD.x + WORLD.w - 10; x += 18) {
          const edgeX = edgeBlend(3.2, "x", x);
          const phase = time * 0.54 + i * 0.39 + x * 0.012 + 1.4;
          const offset = Math.cos(phase) * ampBase * 0.58 * edgeX * edgeY;
          if (x === WORLD.x + 10) {
            ctx.moveTo(x, y + offset);
          } else {
            ctx.lineTo(x, y + offset);
          }
        }
        ctx.stroke();
      }
    }

    const causticCount = waterState.causticCount;
    for (let i = 0; i < causticCount; i += 1) {
      const t = (i / Math.max(1, causticCount)) * Math.PI * 2;
      const orbit = 0.12 + (i % 5) * 0.07;
      const x = WORLD.x + WORLD.w * 0.5 + Math.cos(t + time * 0.45) * WORLD.w * orbit;
      const y = WORLD.y + WORLD.h * 0.5 + Math.sin(t * 1.25 + time * 0.58) * WORLD.h * (orbit * 0.72);
      const edge = edgeBlend(3.2, "x", x) * edgeBlend(3.2, "y", y);
      if (edge < 0.18) {
        continue;
      }
      const size = 1.8 + (i % 3) * 0.7;
      const alpha = clamp(
        waterState.alpha * 0.52 * edge * (0.92 + floorRamp * 0.2) * (waterState.floorIdIsEarly ? 1.2 : 1),
        0.022,
        0.11
      );
      ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, alpha, accent) : rgba(accent, alpha);
      fillRoundRect(x - size * 0.6, y - size * 0.35, size, size * 0.68, 999);
    }
  }

  function drawWaterWashLayer(visualTheme, waterState, progress = 0) {
    if (!waterState) {
      return;
    }

    const floorRamp = clamp(Number(waterState.floorProgress) || 0, 0, 1);
    const globalTime = Number.isFinite(game.globalTime) ? game.globalTime : 0;
    const floorPulse = Math.sin(globalTime * 0.28 + Number(waterState.floorId) * 0.22 + Number(progress) * Math.PI * 2);
    const washBase = clamp(waterState.alpha * WATER_WASH_LAYER_ALPHA, 0.02, 0.18);
    const washAlpha = clamp(washBase * (0.58 + floorRamp * 0.26 + floorPulse * 0.12), 0.022, 0.11);
    const blendAlpha = clamp(washAlpha * (waterState.floorIdIsEarly ? 1.3 : 1), 0.022, 0.13);

    const swirlX = WORLD.x + WORLD.w * (0.45 + floorRamp * 0.1) + Math.sin(globalTime * 0.06 + 0.4) * WORLD.w * 0.04;
    const swirlY = WORLD.y + WORLD.h * (0.46 - floorRamp * 0.06) + Math.cos(globalTime * 0.045 + 0.8) * WORLD.h * 0.035;
    const gradient = ctx.createRadialGradient(
      swirlX,
      swirlY,
      10,
      WORLD.x + WORLD.w * 0.5,
      WORLD.y + WORLD.h * 0.5,
      Math.max(WORLD.w, WORLD.h) * 0.66
    );

    gradient.addColorStop(0, rgba(TOKENS.mint, clamp(blendAlpha * 0.92, 0, 0.18)));
    gradient.addColorStop(0.5, rgba(TOKENS.blue, clamp(blendAlpha * 0.66, 0, 0.12)));
    gradient.addColorStop(1, rgba(TOKENS.blue, clamp(blendAlpha * 0.26, 0, 0.04)));
    ctx.fillStyle = gradient;
    ctx.fillRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h);

    const bandCount = Math.max(6, Math.floor(12 + floorRamp * 10 + (Number(waterState.dynamicAmp) || 0) * 1.5));
    const stripeAlpha = clamp(blendAlpha * 0.34, 0.013, 0.09);
    if (stripeAlpha > 0.01) {
      ctx.strokeStyle = rgba(TOKENS.mint, stripeAlpha);
      for (let i = 0; i < bandCount; i += 1) {
        const y = WORLD.y + 8 + i * ((WORLD.h - 16) / Math.max(1, bandCount));
        const waveScale = clamp(0.7 + floorRamp * 0.25 + floorPulse * 0.1, 0.58, 1.2);
        ctx.beginPath();
        for (let x = WORLD.x + 4; x <= WORLD.x + WORLD.w - 4; x += 16) {
          const phase = x * 0.02 + (globalTime * 0.7) + i * 0.44 + (waterState.floorId || 0) * 0.11;
          const offset = Math.sin(phase) * Number(waterState.dynamicAmp) * 0.33 * waveScale;
          const yPos = y + offset;
          if (x === WORLD.x + 4) {
            ctx.moveTo(x, yPos);
          } else {
            ctx.lineTo(x, yPos);
          }
        }
        ctx.stroke();
      }
    }
  }

  function drawFloorSkinStatic(floor, accent, wallLeft, wallRight, visualTheme = null) {
    const pack = resolveFloorFxPack(floor);
    const lead = visualTheme ? visualTheme.lead : accent;
    const isPostNine = pack && Number.isFinite(pack.id) && pack.id >= 10 && pack.id <= 13;
    const waterState = resolveWaterWrapperState(pack, visualTheme, 0);

    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    drawWorldGridLines();
    if (waterState) {
      drawWaterWashLayer(visualTheme, waterState, 0);
    }
    if (waterState) {
      drawWaterStaticBase(lead, visualTheme, waterState);
    }
    if (pack && pack.id >= 1 && pack.id <= 13) {
      drawFloorStaticIdentityByPack(pack, lead, visualTheme);
      if (isPostNine) {
        drawPostNineStaticOverlays(lead, visualTheme, pack);
      }
    }

    ctx.restore();

    if (pack && pack.id >= 1 && pack.id <= 13) {
      drawWallDecor(floor, lead, wallLeft, wallRight, visualTheme);
    }
  }

  function drawFloorSkinDynamic(floor, accent, visualTheme = null) {
    const lead = visualTheme ? visualTheme.lead : accent;
    const progress = game.floorDuration > 0 ? clamp(game.floorElapsed / game.floorDuration, 0, 1) : 0;
    const pack = resolveFloorFxPack(floor);
    const isPostNine = pack && Number.isFinite(pack.id) && pack.id >= 10 && pack.id <= 13;
    const waterState = resolveWaterWrapperState(pack, visualTheme, progress);

    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    if (pack && pack.id >= 1 && pack.id <= 13) {
      drawFloorDynamicIdentityByPack(pack, lead, progress, visualTheme);
      if (waterState) {
        drawWaterWashLayer(visualTheme, waterState, progress);
        drawWaterDynamicOverlay(lead, visualTheme, waterState, progress);
      }
      if (isPostNine) {
        drawPostNineDynamicOverlays(lead, progress, visualTheme, pack);
      }
    }

    ctx.restore();
  }

  function drawFloorStaticIdentityByPack(pack, lead, visualTheme) {
    if (!pack || typeof pack.id !== "number") {
      return;
    }
    if (pack.id === 1) {
      drawStaticGlyphField(lead, visualTheme, pack);
    } else if (pack.id === 2) {
      drawStaticMeshField(lead, visualTheme, pack);
    } else if (pack.id === 3) {
      drawStaticCircuitField(lead, visualTheme, pack);
    } else if (pack.id === 4) {
      drawStaticWaveField(lead, visualTheme, pack);
    } else if (pack.id === 5) {
      drawKitchenPanels(lead, visualTheme);
      drawWordmarkMarkers(lead, visualTheme, pack);
    } else if (pack.id === 6) {
      drawDoorLoop(lead, visualTheme);
      drawStaticDoorShell(lead, visualTheme, pack);
    } else if (pack.id === 7) {
      drawCracksAndFrames(lead, visualTheme);
      drawStaticFractureField(lead, visualTheme, pack);
    } else if (pack.id === 8) {
      drawStaticThresholdField(lead, visualTheme, pack);
    } else if (pack.id === 9) {
      drawStaticEvolutionShell(lead, visualTheme, pack);
    } else if (pack.id === 10) {
      drawStaticWirelineReactor(lead, visualTheme, pack);
    } else if (pack.id === 11) {
      drawStaticBloomLattice(lead, visualTheme, pack);
    } else if (pack.id === 12) {
      drawStaticOrbitalTruss(lead, visualTheme, pack);
    } else if (pack.id === 13) {
      drawStaticSingularityEdgeField(lead, visualTheme, pack);
    } else if (pack.id >= 14) {
      drawFloorStaticNoOpPlaceholder(lead, visualTheme, pack);
    }
  }

  function drawFloorDynamicIdentityByPack(pack, lead, progress, visualTheme = null) {
    if (!pack || typeof pack.id !== "number") {
      return;
    }
    if (pack.id === 1) {
      drawMotifFlicker(lead, visualTheme);
      drawWordmarkMarkers(lead, visualTheme, pack);
      drawLoadingBars(lead, visualTheme, progress);
    } else if (pack.id === 2) {
      drawTileToWoodTransition(lead, progress, visualTheme);
    } else if (pack.id === 3) {
      drawLoadingBars(lead, visualTheme, progress);
      drawFloatingIcons(lead, visualTheme, progress);
    } else if (pack.id === 4) {
      drawWaveBands(lead, visualTheme, progress);
    } else if (pack.id === 5) {
      drawKitchenInterleaveOverlay(visualTheme, progress);
    } else if (pack.id === 6) {
      drawDoorPhaseRibbons(visualTheme, progress);
    } else if (pack.id === 7) {
      drawMirroredShardDrift(visualTheme, progress);
    } else if (pack.id === 8) {
      drawThresholdBands(lead, progress, visualTheme);
    } else if (pack.id === 9) {
      drawEvolutionDissolve(lead, progress, visualTheme);
    } else if (pack.id === 10) {
      drawDynamicWirelineReactor(lead, progress, visualTheme, pack);
    } else if (pack.id === 11) {
      drawDynamicBloomLattice(lead, progress, visualTheme, pack);
    } else if (pack.id === 12) {
      drawDynamicOrbitalTruss(lead, progress, visualTheme, pack);
    } else if (pack.id === 13) {
      drawDynamicSingularityChoir(lead, progress, visualTheme, pack);
    } else if (pack.id >= 14) {
      drawFloorDynamicNoOpPlaceholder(lead, visualTheme, pack, progress);
    }
  }

  function drawFloorStaticNoOpPlaceholder() {}

  function drawFloorDynamicNoOpPlaceholder() {}

  function drawPostNineStaticOverlays(lead, visualTheme = null, pack = null) {
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const wireDensity = Math.max(10, Math.floor((Number(pack && pack.latticeCount) || 12) * 0.8));
    const wireAmp = clamp(1.2 + trippy * 2.8, 1.2, 3.4);
    const segment = Math.max(18, Math.floor((WORLD.h - 24) / wireDensity));

    for (let i = 0; i < wireDensity; i += 1) {
      const y = WORLD.y + 12 + i * segment;
      const edgeFade = edgeBlend(1.6, "y", y);
      const x1 = WORLD.x + 16 + edgeFade * 5;
      const x2 = WORLD.x + WORLD.w - 16 - edgeFade * 5;
      ctx.strokeStyle = visualTheme ? supportTint(visualTheme, i, 0.06 + trippy * 0.08, lead) : rgba(lead, 0.06 + trippy * 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      const anchor = WORLD.x + WORLD.w * (0.2 + 0.6 * (i / Math.max(1, wireDensity - 1)));
      const jitter = ((i % 2) * 1.5 - 0.75) * wireAmp;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.08 + trippy * 0.06, lead) : rgba(lead, 0.08 + trippy * 0.06);
      fillRoundRect(anchor, y - 1, 2, 2, 999);
      fillRoundRect(anchor + 4 + jitter, y + jitter, 1.4, 1.4, 999);
    }
  }

  function drawPostNineDynamicOverlays(lead, progress, visualTheme = null, pack = null) {
    const escalation = getDynamicEscalation(progress);
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const waveDensity = Math.max(5, Math.floor((12 + trippy * 8) * escalation.densityScale));
    const pulseBase = 2 + trippy * 2.2 + escalation.intensity * 1.8;
    const time = (typeof game.globalTime === "number" ? game.globalTime : performance.now() / 1000) * escalation.speedScale;
    const sweep = game.floorElapsed * 0.3 * reducedMotionScale;

    for (let i = 0; i < waveDensity; i += 1) {
      const y = WORLD.y + 14 + ((i + 0.5) * WORLD.h) / waveDensity;
      const laneAmp = 1.6 + edgeBlend(2, "y", y) * 2.2;
      const phase = time + i * 0.9 + progress * Math.PI * 0.4;
      const alpha = 0.07 + 0.11 * escalation.intensity + 0.06 * trippy;

      ctx.strokeStyle = visualTheme ? leadTint(visualTheme, alpha, lead) : rgba(lead, alpha);
      ctx.lineWidth = 1 + escalation.intensity * 1.1;
      ctx.beginPath();
      for (let x = WORLD.x + 12; x <= WORLD.x + WORLD.w - 12; x += 10) {
        const wave = Math.sin((x * 0.024) + phase + (i % 2 ? 1 : -1) * 0.7) * (pulseBase + laneAmp * escalation.densityScale) * reducedMotionScale;
        const drift = Math.sin(sweep * 1.9 + x * 0.01 + i) * 0.5 * reducedMotionScale;
        if (x === WORLD.x + 12) {
          ctx.moveTo(x, y + wave + drift);
        } else {
          ctx.lineTo(x, y + wave + drift);
        }
      }
      ctx.stroke();

      if (i % 2 === 0 && visualTheme && visualTheme.support.length > 0) {
        for (let p = 0; p < 2; p += 1) {
          const travel = (sweep * 1.4 + i * 20 + p * 8) % (WORLD.w - 20);
          const x = WORLD.x + 18 + travel;
          const edge = edgeBlend(1.8, "x", x);
          const shardAlpha = clamp(0.03 + 0.09 * escalation.intensity + 0.03 * trippy, 0.03, 0.09);
          ctx.fillStyle = supportTint(visualTheme, i + p, shardAlpha, lead);
          fillRoundRect(x, y + (p ? -1.5 : 1.5), 1.4 + edge * 0.08, 1.4, 999);
        }
      }
    }
  }

  function drawStaticGlyphField(accent, visualTheme, pack) {
    const latticeCount = Math.max(2, Number(pack.latticeCount) || 10);
    const supportTintColor = visualTheme ? supportTint(visualTheme, 0, 0.06, accent) : rgba(accent, 0.06);
    for (let i = 0; i < 2; i += 1) {
      const x = WORLD.x + 28 + i * (WORLD.w - 56);
      fillRoundRect(x, WORLD.y + 12, 20, 14, 8);
    }
    for (let i = 0; i < latticeCount; i += 1) {
      const x = WORLD.x + 12 + i * (WORLD.w - 24) / Math.max(1, latticeCount - 1);
      ctx.fillStyle = supportTintColor;
      fillRoundRect(x, WORLD.y + WORLD.h - 16, 10, 4, 999);
    }
    drawWordBlocks(accent, visualTheme);
  }

  function drawStaticMeshField(accent, visualTheme, pack) {
    const lines = Math.max(6, Number(pack.latticeCount) || 10);
    const lineAlpha = 0.06;
    for (let y = WORLD.y + 22; y < WORLD.y + WORLD.h - 18; y += 16) {
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.11, accent) : rgba(accent, 0.11);
      fillRoundRect(WORLD.x + 16, y, WORLD.w - 32, 2, 999);
    }
    for (let i = 0; i < lines; i += 1) {
      const x = WORLD.x + WORLD.w * 0.18 + (WORLD.w * 0.64 * i) / Math.max(1, lines - 1);
      ctx.strokeStyle = visualTheme ? supportTint(visualTheme, i, lineAlpha, accent) : rgba(accent, lineAlpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, WORLD.y + 16);
      ctx.lineTo(x, WORLD.y + WORLD.h - 16);
      ctx.stroke();
    }
  }

  function drawStaticCircuitField(accent, visualTheme, pack) {
    const rails = Math.max(4, Math.floor((Number(pack.parallaxCount) || 10) * 0.75));
    for (let i = 0; i < 3; i += 1) {
      const y = WORLD.y + WORLD.h * 0.26 + i * 56;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.08, accent) : rgba(accent, 0.08);
      fillRoundRect(WORLD.x + 18, y, WORLD.w - 36, 3, 999);
    }
    for (let i = 0; i < rails; i += 1) {
      const x = WORLD.x + 24 + (WORLD.w - 48) * i / Math.max(1, rails - 1);
      ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, 0.09, accent) : rgba(accent, 0.09);
      fillRoundRect(x, WORLD.y + 18, 6, WORLD.h - 36, 3);
      if (i % 3 === 0) {
        fillRoundRect(x - 6, WORLD.y + WORLD.h * 0.5, 18, 4, 999);
      }
    }
  }

  function drawStaticWaveField(accent, visualTheme, pack) {
    const count = Math.max(7, Math.floor((Number(pack.latticeCount) || 10) * 0.6));
    ctx.strokeStyle = visualTheme ? leadTint(visualTheme, 0.16, accent) : rgba(accent, 0.16);
    for (let i = 0; i < count; i += 1) {
      const y = WORLD.y + 30 + i * ((WORLD.h - 60) / Math.max(1, count - 1));
      ctx.lineWidth = i % 3 === 0 ? 2 : 1;
      ctx.beginPath();
      for (let x = WORLD.x + 14; x <= WORLD.x + WORLD.w - 14; x += 12) {
        const offset = Math.sin((x * 0.018) + i * 0.5) * 3.5;
        if (x === WORLD.x + 14) {
          ctx.moveTo(x, y + offset);
        } else {
          ctx.lineTo(x, y + offset);
        }
      }
      ctx.stroke();
    }
  }

  function drawStaticDoorShell(accent, visualTheme, pack) {
    const layers = Math.max(2, Math.floor((Number(pack.latticeCount) || 12) * 0.5));
    for (let i = 0; i < layers; i += 1) {
      const y = WORLD.y + 16 + i * 36;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.08, accent) : rgba(accent, 0.08);
      fillRoundRect(WORLD.x + 28, y, WORLD.w - 56, 4, 999);
      ctx.fillStyle = visualTheme ? supportTint(visualTheme, i + 3, 0.06, accent) : rgba(accent, 0.06);
      fillRoundRect(WORLD.x + 28, y + 8, WORLD.w - 56, 2, 999);
    }
  }

  function drawStaticFractureField(accent, visualTheme, pack) {
    const count = Math.max(5, Number(pack.parallaxCount) || 12);
    for (let i = 0; i < count; i += 1) {
      const x = WORLD.x + 22 + ((i % 4) * 74);
      const y = WORLD.y + 26 + (i * 55) % (WORLD.h - 60);
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.11, accent) : rgba(accent, 0.11);
      fillRoundRect(x, y, 12, 12, 2);
      if (i % 2 === 0) {
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, 0.07, accent) : rgba(accent, 0.07);
        fillRoundRect(x - 4, y - 4, 6, 6, 1);
      }
    }
  }

  function drawStaticThresholdField(accent, visualTheme, pack) {
    const bands = Math.max(2, Math.floor((Number(pack.latticeCount) || 10) * 0.75));
    for (let i = 0; i < bands; i += 1) {
      const y = WORLD.y + 18 + (WORLD.h - 36) * (i / Math.max(1, bands - 1));
      const alpha = 0.06 + (i % 2) * 0.03;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, alpha, accent) : rgba(accent, alpha);
      fillRoundRect(WORLD.x + 2, y - 1, WORLD.w - 4, 2, 999);
      if (i % 2 === 0) {
        const inset = 10 + (i * 4);
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, 0.06, accent) : rgba(accent, 0.06);
        fillRoundRect(WORLD.x + inset, y + 4, WORLD.w - inset * 2, 2, 999);
      }
    }
  }

  function drawStaticEvolutionShell(accent, visualTheme, pack) {
    const ringCount = Math.max(3, Math.floor((Number(pack.latticeCount) || 10) * 0.5));
    for (let i = 0; i < ringCount; i += 1) {
      const y = WORLD.y + WORLD.h * (0.28 + i * 0.18);
      const alpha = 0.06 + (i * 0.02);
      const width = WORLD.w * (0.2 + i * 0.1);
      const x = WORLD.x + WORLD.w * 0.5 - width / 2;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, alpha, accent) : rgba(accent, alpha);
      fillRoundRect(x, y, width, 3, 999);
      ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, 0.05, accent) : rgba(accent, 0.05);
      fillRoundRect(x + 4, y + 6, Math.max(16, width - 8), 2, 999);
    }
  }

  function drawStaticWirelineReactor(accent, visualTheme, pack) {
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const railLeftOuter = WORLD.x + 22;
    const railLeftMid = WORLD.x + WORLD.w * 0.24;
    const railRightMid = WORLD.x + WORLD.w * 0.76;
    const railRightOuter = WORLD.x + WORLD.w - 22;
    const segStep = clamp(12 - trippy * 2, 8, 16);
    const segCount = Math.floor((WORLD.h - 30) / segStep);
    const segHeight = 7;
    const pairCount = 2;

    const railColors = [0.07, 0.06, 0.06, 0.07];
    const rails = [railLeftOuter, railLeftMid, railRightMid, railRightOuter];
    for (let i = 0; i < rails.length; i += 1) {
      const railX = rails[i];
      const railColor = visualTheme ? leadTint(visualTheme, railColors[i], accent) : rgba(accent, railColors[i]);
      ctx.fillStyle = railColor;
      for (let s = 0; s <= segCount; s += 1) {
        const y = WORLD.y + 14 + s * segStep;
        const segW = 2.6 + ((i + s) % 3) * 0.4;
        const amp = s % 2 === 0 ? 1 : 0.9;
        fillRoundRect(railX - segW * 0.5, y, segW, segHeight * amp, 999);
      }
    }

    const connectors = Math.max(3, Math.floor((Number(pack && pack.latticeCount) || 8) * (0.35 + trippy * 0.15)));
    for (let pair = 0; pair < pairCount; pair += 1) {
      const leftRail = rails[pair];
      const rightRail = rails[rails.length - 1 - pair];
      for (let i = 0; i < connectors; i += 1) {
        const progress = i / Math.max(1, connectors - 1);
        const y = WORLD.y + 24 + (WORLD.h - 48) * progress;
        const edgeFade = edgeBlend(3, "x", leftRail + WORLD.w * 0.4 * (pair + 0.2));
        const railFade = edgeFade * (0.75 + 0.25 * pair);
        ctx.strokeStyle = visualTheme ? leadTint(visualTheme, 0.11 + railFade * 0.05, accent) : rgba(accent, 0.11 + railFade * 0.05);
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(leftRail, y);
        const yPhase = (pair * 0.85 + i * 0.4) * Math.PI * 0.7;
        const centerY = WORLD.y + WORLD.h * 0.5 + Math.sin(yPhase) * 4;
        const centerX = WORLD.x + WORLD.w * 0.5 + Math.sin(progress * 3.8 + pair) * 2.4;
        const xPeak = Math.min(leftRail + 14, centerX);
        const xPeak2 = Math.max(rightRail - 14, centerX);
        ctx.quadraticCurveTo(xPeak, centerY, centerX, centerY - 2 + (i % 2) * 4);
        ctx.quadraticCurveTo(xPeak2, centerY + 1, rightRail, y + (pair % 2 === 0 ? 1 : -1));
        ctx.stroke();
      }
    }

    const nodeCount = 6 + Math.floor(trippy * 12);
    for (let i = 0; i < nodeCount; i += 1) {
      const t = i / Math.max(1, nodeCount - 1);
      const y = WORLD.y + 16 + t * (WORLD.h - 32);
      const x = WORLD.x + WORLD.w * 0.5 + Math.sin(t * 6.9 + game.globalTime * 0.85 + t * 1.3) * 14 * trippy;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.04 + trippy * 0.08, accent) : rgba(accent, 0.04 + trippy * 0.08);
      fillRoundRect(x - 1.6, y - 1.6, 3.2, 3.2, 999);
    }
  }

  function drawStaticBloomLattice(accent, visualTheme, pack) {
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const rows = Math.max(5, Math.floor((Number(pack.latticeCount) || 12) * 0.45));
    const edgePadding = 14;
    const rowSpan = Math.max(12, WORLD.h - 36);
    const maxSpan = WORLD.w * 0.42;
    const minSpan = WORLD.w * 0.24;

    for (let i = 0; i < rows; i += 1) {
      const rowT = rows > 1 ? i / (rows - 1) : 0;
      const y = WORLD.y + 18 + rowT * rowSpan;
      const span = minSpan + (Math.sin(i * 0.74) + 1) * 0.5 * (maxSpan - minSpan);
      const alpha = 0.05 + 0.025 * rowT;
      const phase = rowT * Math.PI * 2 + i * 0.43;
      drawBloomPetal(
        WORLD.x + edgePadding,
        y,
        span,
        1,
        phase,
        visualTheme,
        accent,
        alpha
      );
      drawBloomPetal(
        WORLD.x + WORLD.w - edgePadding,
        y + Math.cos(i * 0.51) * 2,
        span,
        -1,
        phase + 0.92,
        visualTheme,
        accent,
        alpha + 0.01
      );

      if (i % 2 === 0) {
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, 0.05 + rowT * 0.02, accent) : rgba(accent, 0.05 + rowT * 0.02);
        fillRoundRect(WORLD.x + (i % 2 === 0 ? 0 : 4) + edgePadding + 2, y - 2, 3, 3, 999);
        fillRoundRect(WORLD.x + WORLD.w - edgePadding - 3 + (i % 2 ? -3 : 0), y - 2, 3, 3, 999);
      }

      if (i % 3 === 0 && trippy > 0.2) {
        const ringY = y + Math.sin(game.globalTime * 0.6 + i) * 2 * trippy;
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, i + 4, 0.04 + trippy * 0.06, accent) : rgba(accent, 0.04 + trippy * 0.06);
        fillRoundRect(WORLD.x + WORLD.w * 0.5 - 2, ringY, 4, 4, 999);
      }
    }
  }

  function drawStaticOrbitalTruss(lead, visualTheme, pack) {
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const frames = Math.max(4, Math.floor((Number(pack.latticeCount) || 12) * 0.45));
    const centerX = WORLD.x + WORLD.w * 0.5;
    const centerY = WORLD.y + WORLD.h * 0.52;
    const topRange = WORLD.h * 0.62;
    let prevLeft = null;
    let prevRight = null;
    let prevTip = null;

    for (let i = 0; i < frames; i += 1) {
      const t = frames > 1 ? i / (frames - 1) : 0;
      const topY = WORLD.y + WORLD.h * 0.18 + topRange * (1 - Math.pow(1 - t, 1.4));
      const width = WORLD.w * (0.24 + t * 0.18);
      const rise = WORLD.h * (0.16 + t * 0.08);
      const alpha = 0.06 + t * 0.06;
      const left = centerX - width;
      const right = centerX + width;
      const tip = topY - WORLD.h * (0.05 + t * 0.06);

      ctx.strokeStyle = visualTheme ? leadTint(visualTheme, alpha, lead) : rgba(lead, alpha);
      ctx.lineWidth = 1.1 + t * 0.4;
      ctx.beginPath();
      ctx.moveTo(left, topY);
      ctx.lineTo(centerX, tip);
      ctx.lineTo(right, topY);
      ctx.lineTo(centerX + width * 0.58, topY + rise);
      ctx.lineTo(centerX - width * 0.58, topY + rise);
      ctx.closePath();
      ctx.stroke();

      if (i > 0) {
        const prevLeftLocal = prevLeft;
        const prevRightLocal = prevRight;
        const prevTipLocal = prevTip;
        if (prevLeftLocal !== null && prevRightLocal !== null && prevTipLocal !== null) {
          ctx.strokeStyle = visualTheme ? leadTint(visualTheme, Math.min(0.05 + alpha, 0.1), lead) : rgba(lead, Math.min(0.05 + alpha, 0.1));
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(prevLeftLocal, topY);
          ctx.lineTo(left, topY);
          ctx.lineTo(tip, topY + rise);
          ctx.lineTo(prevTipLocal, WORLD.y + WORLD.h * 0.52);
          ctx.lineTo(prevRightLocal, topY);
          ctx.stroke();
        }
      }

      prevLeft = left;
      prevRight = right;
      prevTip = tip;
    }

    if (trippy > 0) {
      const arcAlpha = clamp(0.06 + trippy * 0.08, 0.06, 0.14);
      ctx.strokeStyle = visualTheme ? leadTint(visualTheme, arcAlpha, lead) : rgba(lead, arcAlpha);
      ctx.lineWidth = 1;
      for (let i = 0; i < 20; i += 1) {
        const t = i / Math.max(1, 19);
        const nodeX = WORLD.x + 14 + t * (WORLD.w - 28);
        const nodeY = WORLD.y + WORLD.h * 0.56 + Math.cos(game.globalTime * 0.42 + i * 0.45) * WORLD.h * (0.025 * trippy);
        fillRoundRect(nodeX - 1, nodeY - 1, 2, 2, 999);
      }
    }
  }

  function drawStaticSingularityEdgeField(accent, visualTheme, pack) {
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const rings = Math.max(3, Math.floor((Number(pack.latticeCount) || 10) * 0.45));
    const baseAlpha = visualTheme ? 0.07 : 0.08;
    const cornerSpan = Math.max(10, WORLD.h * 0.06);

    for (let ring = 0; ring < rings; ring += 1) {
      const inset = 10 + ring * 5;
      const left = WORLD.x + inset;
      const right = WORLD.x + WORLD.w - inset;
      const top = WORLD.y + inset;
      const bottom = WORLD.y + WORLD.h - inset;
      const alpha = baseAlpha - ring * 0.012;
      const stroke = visualTheme
        ? leadTint(visualTheme, clamp(alpha, 0.02, 0.09), accent)
        : rgba(accent, clamp(alpha, 0.02, 0.09));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = ring % 2 === 0 ? 1.05 : 0.85;

      ctx.beginPath();
      for (let x = left + 4; x <= right - 4; x += 6) {
        const wave = Math.sin((x - left) * 0.045 + ring * 0.6) * (1.2 + ring * 0.2);
        const edgeBoost = edgeBlend(1 + ring * 0.08, "x", x);
        const y = top + wave * edgeBoost;
        if (x === left + 4) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let x = right - 4; x >= left + 4; x -= 6) {
        const wave = Math.sin((x - left) * 0.045 + ring * 0.6 + Math.PI) * (1.2 + ring * 0.2);
        const edgeBoost = edgeBlend(1 + ring * 0.08, "x", x);
        const y = bottom - wave * edgeBoost;
        if (x === right - 4) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let y = top + 4; y <= bottom - 4; y += 6) {
        const wave = Math.sin((y - top) * 0.05 + ring * 0.9) * (1.15 + ring * 0.17);
        const edgeBoost = edgeBlend(1 + ring * 0.08, "y", y);
        const x = left + cornerSpan + wave * edgeBoost;
        if (y === top + 4) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      for (let y = bottom - 4; y >= top + 4; y -= 6) {
        const wave = Math.sin((y - top) * 0.05 + ring * 0.9 + Math.PI) * (1.15 + ring * 0.17);
        const edgeBoost = edgeBlend(1 + ring * 0.08, "y", y);
        const x = right - cornerSpan + wave * edgeBoost;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      const cornerGlow = visualTheme ? supportTint(visualTheme, ring, 0.05 + trippy * 0.05, accent) : rgba(accent, 0.05 + trippy * 0.05);
      ctx.fillStyle = cornerGlow;
      fillRoundRect(left + 2, top + 2, 2, 2, 999);
      fillRoundRect(right - 4, top + 2, 2, 2, 999);
      fillRoundRect(left + 2, bottom - 4, 2, 2, 999);
      fillRoundRect(right - 4, bottom - 4, 2, 2, 999);
    }
  }

  function drawBloomPetal(anchorX, anchorY, span, direction, phase, visualTheme, accent, alpha) {
    const crest = Math.max(4, span * 0.48);
    const tilt = Math.sin(phase + anchorY * 0.013) * 0.6;
    const pulse = Math.cos(phase * 0.9 + direction) * 1.35;
    const control1X = anchorX + direction * crest * 0.34 + tilt * 2.2;
    const control1Y = anchorY - 6 - pulse;
    const control2X = anchorX + direction * crest * 0.82 + tilt * 2.8;
    const control2Y = anchorY + 6 - pulse * 0.4;

    ctx.strokeStyle = visualTheme ? leadTint(visualTheme, alpha, accent) : rgba(accent, alpha);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.quadraticCurveTo(control1X, control1Y, anchorX + direction * crest * 0.62, anchorY - pulse * 0.35);
    ctx.quadraticCurveTo(control2X, control2Y, anchorX, anchorY + pulse * 0.1);
    ctx.stroke();
  }

  function drawWordmarkMarkers(accent, visualTheme, pack) {
    const markerCount = Math.max(3, Math.floor((Number(pack.parallaxCount) || 8) * 0.7));
    const reducedMotionScale = getReducedMotionScale();
    for (let i = 0; i < markerCount; i += 1) {
      const x = WORLD.x + WORLD.w * 0.18 + (WORLD.w * 0.64 * i) / Math.max(1, markerCount - 1);
      const y = WORLD.y + WORLD.h * (0.72 + 0.08 * Math.sin(i + game.floorElapsed * 0.8 * reducedMotionScale));
      ctx.fillStyle = visualTheme ? supportTint(visualTheme, i + 2, 0.08, accent) : rgba(accent, 0.08);
      fillRoundRect(x, y, 8, 5, 999);
    }
  }

  function drawWorldGridLines() {
    ctx.strokeStyle = rgba(TOKENS.ink, 0.16);
    ctx.lineWidth = 1;
    for (let y = WORLD.y + 24; y < WORLD.y + WORLD.h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 14, y);
      ctx.lineTo(WORLD.x + WORLD.w - 14, y);
      ctx.stroke();
    }
  }

  function drawFloorSkin(floor, accent, wallLeft, wallRight, visualTheme = null) {
    drawFloorSkinStatic(floor, accent, wallLeft, wallRight, visualTheme);
    drawFloorSkinDynamic(floor, accent, visualTheme);
  }

  function drawMotifFlicker(accent, visualTheme = null) {
    const reducedMotionScale = getReducedMotionScale();
    for (let i = 0; i < 12; i += 1) {
      const y = WORLD.y + 12 + i * 40;
      const pulse = (Math.sin(game.globalTime * 5 * reducedMotionScale + i * 0.4) + 1) * 0.5;
      const alpha = 0.08 + 0.04 * pulse;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, alpha, accent) : rgba(accent, alpha);
      ctx.fillRect(WORLD.x + 12, y, 10, 3);
      ctx.fillRect(WORLD.x + WORLD.w - 22, y + 7, 10, 3);
    }
  }

  function drawWordBlocks(accent, visualTheme = null) {
    ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.14, accent) : rgba(accent, 0.14);
    const step = 120;
    for (let x = WORLD.x + 32; x < WORLD.x + WORLD.w - 100; x += step) {
      fillRoundRect(x, WORLD.y + 40, 82, 22, 8);
    }

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '600 11px "Sora", "Inter", sans-serif';
    for (let x = WORLD.x + 40; x < WORLD.x + WORLD.w - 100; x += step) {
      ctx.fillText(uiText("worldMotifWord", "AI"), x, WORLD.y + 54);
    }
  }

  function drawTileToWoodTransition(accent, progress, visualTheme = null) {
    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const transitionX = WORLD.x + WORLD.w * (0.31 + escalation.progress * 0.48 + escalation.danger * 0.09);
    const rowStep = clamp(Math.floor(22 / escalation.densityScale), 8, 24);
    const colStep = clamp(Math.floor(22 / escalation.densityScale), 8, 24);

    const baseAlpha = 0.14 + escalation.intensity * 0.12;
    ctx.strokeStyle = rgba(TOKENS.ink, baseAlpha);
    for (let x = WORLD.x + 14; x < transitionX; x += rowStep) {
      ctx.beginPath();
      ctx.moveTo(x, WORLD.y + 12);
      ctx.lineTo(x, WORLD.y + WORLD.h - 12);
      ctx.stroke();
    }

    for (let y = WORLD.y + 14; y < WORLD.y + WORLD.h - 10; y += colStep) {
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 10, y);
      ctx.lineTo(transitionX, y);
      ctx.stroke();
    }

    const leadAlpha = 0.12 + escalation.intensity * 0.14;
    ctx.fillStyle = visualTheme ? leadTint(visualTheme, leadAlpha, accent) : rgba(accent, leadAlpha);
    fillRoundRect(transitionX - 4, WORLD.y + 18, 8, WORLD.h - 36, 8);

    const railAlpha = baseAlpha * 0.8;
    ctx.strokeStyle = rgba(TOKENS.ink, railAlpha);
    for (let y = WORLD.y + 16; y < WORLD.y + WORLD.h - 12; y += Math.max(10, Math.floor(28 / escalation.densityScale))) {
      ctx.beginPath();
      const edgeAmp = edgeBlend(2.4, "y", y);
      const edgeOffset = Math.sin(game.globalTime * 2.2 * escalation.speedScale * reducedMotionScale) * edgeAmp * reducedMotionScale;
      ctx.moveTo(transitionX + 8 + edgeOffset, y);
      ctx.lineTo(WORLD.x + WORLD.w - 12, y + 8);
      ctx.stroke();
    }

    if (visualTheme && visualTheme.support.length > 0) {
      const columnCount = 7;
      for (let i = 0; i < columnCount; i += 1) {
        const y = WORLD.y + 28 + i * 72;
        const edgeAmp = edgeBlend(0.1 + escalation.intensity * 0.08, "y", y);
        ctx.fillStyle = supportTint(visualTheme, i, edgeAmp, accent);
        fillRoundRect(transitionX + 10 + (i % 2) * 10, y, 10, 34, 4);
      }
    }
  }

  function drawLoadingBars(accent, visualTheme = null, progress = 0) {
    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const bars = Math.max(5, Math.floor(7 * escalation.densityScale));
    const baseHeight = 12;
    const baseWidth = 74;
    for (let i = 0; i < bars; i += 1) {
      const x = WORLD.x + 44 + i * 120;
      const y = WORLD.y + 38 + ((i % 2) * 26);
      const width = baseWidth + Math.floor(12 * escalation.intensity);
      ctx.fillStyle = rgba(TOKENS.ink, 0.08);
      fillRoundRect(x, y, width, baseHeight, 999);
      const pulse = (Math.sin(game.globalTime * 2.4 * escalation.speedScale * reducedMotionScale + i) + 1) * 0.5;
      const fillW = (width - 2) * (0.22 + 0.78 * pulse) * (0.75 + 0.25 * escalation.progress);
      const edgeAlpha = edgeBlend(0.2 + escalation.intensity * 0.12, "x", x + width * 0.5);
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, edgeAlpha, accent) : rgba(accent, clamp(0.22 + escalation.intensity * 0.2, 0.22, 0.42));
      fillRoundRect(x + 1, y + 1, fillW, baseHeight - 2, 999);
      if (visualTheme && visualTheme.support.length > 0) {
        ctx.fillStyle = supportTint(visualTheme, i, 0.11 + escalation.intensity * 0.06, accent);
        fillRoundRect(x + width - 10, y + 3, 6, 6, 999);
      }
    }
  }

  function drawFloatingIcons(accent, visualTheme = null, progress = 0) {
    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    ctx.strokeStyle = visualTheme ? leadTint(visualTheme, 0.2, accent) : rgba(accent, 0.45);
    ctx.lineWidth = 1 + escalation.intensity * 1.2;

    const symbols = Math.floor(18 * escalation.densityScale);
    for (let i = 0; i < symbols; i += 1) {
      const x = WORLD.x + 40 + ((i * 67 * escalation.densityScale) % (WORLD.w - 80));
      const drift = Math.sin(game.globalTime * 1.6 * escalation.speedScale * reducedMotionScale + i) * (2.5 * escalation.speedScale * reducedMotionScale);
      const xShift = Math.sin(i * 0.21 + game.globalTime * 0.9 * escalation.speedScale * reducedMotionScale) * (6 * reducedMotionScale);
      const y = WORLD.y + 110 + ((i * 49 + Math.floor(game.globalTime * 10 * escalation.speedScale * reducedMotionScale)) % (WORLD.h - 150));
      const size = 8 + (i % 4);
      const rectX = x + xShift + edgeBlend(2, "x", x);
      strokeRoundRect(rectX, y + drift, size * 2, size * 2, 4);
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(rectX + 5, y + 5);
        ctx.lineTo(rectX + size + 4, y + size + drift);
        ctx.lineTo(rectX + 5, y + size + 5);
        ctx.closePath();
        ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.14, accent) : rgba(accent, 0.25);
        ctx.fill();
      }
    }
  }

  function drawWaveBands(accent, visualTheme = null, progress = 0) {
    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    ctx.strokeStyle = visualTheme ? leadTint(visualTheme, 0.2 + escalation.intensity * 0.08, accent) : rgba(accent, 0.34);
    ctx.lineWidth = 1.2 + escalation.intensity * 1.3;

    const rowStep = clamp(Math.floor(28 / escalation.densityScale), 18, 34);
    for (let y = WORLD.y + 26; y < WORLD.y + WORLD.h - 20; y += rowStep) {
      ctx.beginPath();
      for (let x = WORLD.x + 8; x <= WORLD.x + WORLD.w - 8; x += 18) {
        const edgeAmp = edgeBlend(6, "y", y);
        const baseAmp = (3 + 6 * escalation.intensity) * reducedMotionScale;
        const offset =
          Math.sin(x * 0.02 + y * 0.04 + game.globalTime * 3.2 * escalation.speedScale * reducedMotionScale) *
          (baseAmp + edgeAmp * reducedMotionScale);
        if (x === WORLD.x + 8) {
          ctx.moveTo(x, y + offset);
        } else {
          ctx.lineTo(x, y + offset);
        }
      }
      ctx.stroke();
    }

    if (visualTheme && visualTheme.support.length > 0) {
      for (let y = WORLD.y + 44; y < WORLD.y + WORLD.h - 28; y += 84) {
      ctx.beginPath();
        const extraAlpha = 0.08 + 0.12 * escalation.intensity;
        ctx.strokeStyle = supportTint(visualTheme, y, extraAlpha, accent);
        for (let x = WORLD.x + 8; x <= WORLD.x + WORLD.w - 8; x += 22) {
          const edgeAmp = edgeBlend(4 + visualTheme.trippyLevel, "x", x);
          const offset =
            Math.sin(x * 0.018 + y * 0.036 + game.globalTime * 2.2 * escalation.speedScale * reducedMotionScale) *
            edgeAmp *
            escalation.speedScale *
            reducedMotionScale;
          if (x === WORLD.x + 8) {
            ctx.moveTo(x, y + offset);
          } else {
            ctx.lineTo(x, y + offset);
          }
        }
        ctx.stroke();
      }
    }
  }

  function drawKitchenPanels(accent, visualTheme = null) {
    for (let i = 0; i < 14; i += 1) {
      const x = WORLD.x + 24 + i * 66;
      const panelH = 22 + (i % 3) * 8;
      ctx.fillStyle = i % 2 === 0
        ? visualTheme
          ? leadTint(visualTheme, 0.12, accent)
          : rgba(accent, 0.12)
        : rgba(TOKENS.ink, 0.08);
      fillRoundRect(x, WORLD.y + WORLD.h - 40 - panelH, 48, panelH, 6);

      ctx.strokeStyle = rgba(TOKENS.ink, 0.2);
      ctx.strokeRect(x + 18, WORLD.y + 24, 12, 22);
      ctx.strokeRect(x + 14, WORLD.y + 46, 20, 4);
      if (visualTheme && visualTheme.support.length > 0) {
        ctx.fillStyle = supportTint(visualTheme, i, 0.1, accent);
        fillRoundRect(x + 6, WORLD.y + WORLD.h - 24 - panelH * 0.5, 9, 5, 999);
      }
    }
  }

  function drawDoorLoop(accent, visualTheme = null) {
    for (let i = 0; i < 8; i += 1) {
      const y = WORLD.y + 18 + i * 60;
      const leftX = WORLD.x + 28 + (i % 2) * 7;
      const rightX = WORLD.x + WORLD.w - 66 - (i % 3) * 7;

      ctx.strokeStyle = rgba(TOKENS.ink, 0.3);
      strokeRoundRect(leftX, y, 40, 48, 8);
      strokeRoundRect(rightX, y + 8, 40, 48, 8);

      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.15, accent) : rgba(accent, 0.15);
      fillRoundRect(leftX + 5, y + 8, 7, 7, 999);
      fillRoundRect(rightX + 27, y + 16, 7, 7, 999);
      if (visualTheme && visualTheme.support.length > 0) {
        ctx.fillStyle = supportTint(visualTheme, i, 0.11, accent);
        fillRoundRect(leftX + 26, y + 35, 8, 5, 999);
        fillRoundRect(rightX + 6, y + 43, 8, 5, 999);
      }
    }
  }

  function drawCracksAndFrames(accent, visualTheme = null) {
    ctx.strokeStyle = rgba(TOKENS.ink, 0.22);
    ctx.lineWidth = 2;
    for (let i = 0; i < 11; i += 1) {
      const sx = WORLD.x + 32 + i * 80;
      const sy = WORLD.y + 28 + (i % 4) * 102;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 16, sy + 10);
      ctx.lineTo(sx + 7, sy + 22);
      ctx.lineTo(sx + 24, sy + 30);
      ctx.stroke();
    }

    for (let i = 0; i < 5; i += 1) {
      const x = WORLD.x + 120 + i * 150;
      const y = WORLD.y + 40 + (i % 2) * 40;
      ctx.save();
      ctx.translate(x + 30, y + 18);
      ctx.rotate((i % 2 === 0 ? -1 : 1) * 0.08);
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.15, accent) : rgba(accent, 0.15);
      fillRoundRect(-30, -18, 60, 36, 8);
      ctx.strokeStyle = rgba(TOKENS.ink, 0.3);
      strokeRoundRect(-30, -18, 60, 36, 8);
      ctx.restore();
    }

    if (visualTheme && visualTheme.support.length > 0) {
      for (let i = 0; i < 14; i += 1) {
        const x = WORLD.x + 28 + (i * 73) % (WORLD.w - 60);
        const y = WORLD.y + 20 + (i * 37) % (WORLD.h - 42);
        ctx.fillStyle = supportTint(visualTheme, i, 0.1, accent);
        fillRoundRect(x, y, 8, 8, 3);
      }
    }
  }

  function drawKitchenInterleaveOverlay(visualTheme, progress) {
    if (!visualTheme || visualTheme.trippyLevel < 1) {
      return;
    }

    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const laneCount = Math.floor(8 + (visualTheme.densityScale + escalation.intensity * 0.8) * 6 * escalation.densityScale);
    const laneStep = (WORLD.h - 64) / Math.max(1, laneCount);
    for (let i = 0; i < laneCount; i += 1) {
      const y = WORLD.y + 30 + i * laneStep;
      const wobble =
        Math.sin(
          game.floorElapsed * visualTheme.motionScale * 2 * escalation.speedScale * reducedMotionScale + i * 0.7 + progress * 6
        ) * (3 + escalation.intensity * 4 + visualTheme.trippyLevel * escalation.densityScale) * reducedMotionScale;
      const edgeAmp = edgeBlend(2.5, "x", WORLD.x + 24);
      const isSupportLane = i % 2 === 0;
      const alpha = isSupportLane ? 0.11 : 0.18;
      ctx.fillStyle = isSupportLane ? supportTint(visualTheme, i, alpha * escalation.densityScale, visualTheme.lead) : leadTint(visualTheme, alpha + escalation.intensity * 0.08, visualTheme.lead);
      fillRoundRect(WORLD.x + 24 + wobble + edgeAmp, y, WORLD.w - 48, 2 + Math.max(1, escalation.intensity * 4), 999);
    }
  }

  function drawDoorPhaseRibbons(visualTheme, progress) {
    if (!visualTheme || visualTheme.trippyLevel < 2) {
      return;
    }

    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const lanes = Math.floor(4 + visualTheme.trippyLevel * 1.4 + escalation.intensity * 4);
    const amp = (6 + visualTheme.trippyLevel * 2) * escalation.speedScale * reducedMotionScale;
    for (let i = 0; i < lanes; i += 1) {
      const y = WORLD.y + 36 + i * ((WORLD.h - 72) / Math.max(1, lanes - 1));
      ctx.lineWidth = 1.5 + escalation.intensity * 0.8;
      const edgeAlpha = 0.2 + edgeBlend(0.08, "y", y);
      ctx.strokeStyle = i % 2 === 0 ? leadTint(visualTheme, edgeAlpha, visualTheme.lead) : supportTint(visualTheme, i, 0.12 + escalation.intensity * 0.1, visualTheme.lead);
      ctx.beginPath();
      for (let x = WORLD.x + 12; x <= WORLD.x + WORLD.w - 12; x += 20) {
        const edgeAmp = edgeBlend(amp, "x", x);
        const offset =
          Math.sin(
            x * 0.018 +
              i * 0.5 +
              game.floorElapsed * visualTheme.motionScale * 2.1 * escalation.speedScale * reducedMotionScale +
              progress * 5.2 * escalation.densityScale
          ) * edgeAmp;
        if (x === WORLD.x + 12) {
          ctx.moveTo(x, y + offset);
        } else {
          ctx.lineTo(x, y + offset);
        }
      }
      ctx.stroke();
    }
  }

  function drawMirroredShardDrift(visualTheme, progress) {
    if (!visualTheme || visualTheme.trippyLevel < 3) {
      return;
    }

    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const shardCount = Math.floor((14 + visualTheme.densityScale * 12) * escalation.densityScale);
    const centerX = WORLD.x + WORLD.w * 0.5;
    const span = WORLD.w * 0.42;
    for (let i = 0; i < shardCount; i += 1) {
      const travel =
        ((i * 47 + game.floorElapsed * 30 * visualTheme.motionScale * escalation.speedScale * reducedMotionScale) % span);
      const y =
        WORLD.y + 20 + ((i * 53 + game.floorElapsed * 24 * escalation.speedScale * reducedMotionScale) % (WORLD.h - 40));
      const size = 6 + (i % 4) * 2;
      const edgeAmp = edgeBlend(0.05 + escalation.intensity * 0.1, "y", y);
      const tilt = ((i % 2 === 0 ? -1 : 1) * (edgeAmp + progress * 0.1));
      const colorStyle = i % 3 === 0 ? supportTint(visualTheme, i, 0.12, visualTheme.lead) : leadTint(visualTheme, 0.18, visualTheme.lead);
      const leftX = centerX - 24 - travel;
      const rightX = centerX + 24 + travel * 0.95;

      ctx.save();
      ctx.translate(leftX, y);
      ctx.rotate(tilt);
      ctx.fillStyle = colorStyle;
      ctx.globalAlpha = clamp(0.35 + escalation.intensity * 0.5, 0.35, 0.9);
      fillRoundRect(-size * 0.5, -size * 0.5, size, size, 3);
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.save();
      ctx.translate(rightX, y);
      ctx.rotate(-tilt);
      ctx.fillStyle = colorStyle;
      ctx.globalAlpha = clamp(0.35 + escalation.intensity * 0.5, 0.35, 0.9);
      fillRoundRect(-size * 0.5, -size * 0.5, size, size, 3);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function drawThresholdBands(accent, progress, visualTheme = null) {
    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const top = WORLD.y;
    const oneThird = WORLD.h / 3;

    const topColor = visualTheme ? supportColorAt(visualTheme, 0, TOKENS.blue) : TOKENS.blue;
    ctx.fillStyle = rgba(topColor, visualTheme ? clamp(0.08 + (1 - escalation.progress) * 0.06 + escalation.intensity * 0.08, 0.06, SUPPORT_TINT_ALPHA_MAX) : 0.1 + (1 - escalation.progress) * 0.08);
    fillRoundRect(WORLD.x + 2, top + 2, WORLD.w - 4, oneThird - 2, 10);

    ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.2 + escalation.progress * 0.16, accent) : rgba(accent, 0.2 + escalation.progress * 0.08);
    fillRoundRect(WORLD.x + 2, top + oneThird + 2, WORLD.w - 4, oneThird - 2, 8);

    ctx.fillStyle = rgba(TOKENS.ink, 0.07 + escalation.progress * 0.1 + escalation.intensity * 0.04);
    fillRoundRect(WORLD.x + 2, top + oneThird * 2 + 2, WORLD.w - 4, oneThird - 4, 8);

    ctx.strokeStyle = rgba(TOKENS.ink, 0.18);
    const waveCount = Math.floor(12 + escalation.intensity * 8);
    for (let i = 0; i < waveCount; i += 1) {
      const y = WORLD.y + 16 + i * 28;
      ctx.beginPath();
      const edgeAmp = edgeBlend(4 * escalation.intensity, "y", y);
      ctx.moveTo(WORLD.x + 10, y);
      const offset = Math.sin(i + game.globalTime * 2 * escalation.speedScale * reducedMotionScale) * edgeAmp * reducedMotionScale;
      ctx.lineTo(WORLD.x + WORLD.w - 10, y + offset);
      ctx.stroke();
    }

    if (visualTheme && visualTheme.support.length > 0) {
      const extraLines = Math.floor((8 + visualTheme.trippyLevel) * escalation.densityScale);
      for (let i = 0; i < extraLines; i += 1) {
        const y = WORLD.y + 22 + i * ((WORLD.h - 44) / Math.max(1, extraLines - 1));
        ctx.lineWidth = 1 + escalation.intensity * 1.5;
        const edgeAlpha = 0.1 + escalation.intensity * 0.06;
        ctx.strokeStyle = supportTint(visualTheme, i, edgeAlpha + escalation.progress * 0.03, accent);
        ctx.beginPath();
        for (let x = WORLD.x + 10; x <= WORLD.x + WORLD.w - 10; x += 26) {
          const edgeAmp = edgeBlend(3 + visualTheme.trippyLevel, "x", x);
          const offset =
            Math.sin(game.globalTime * 2.3 * escalation.speedScale * reducedMotionScale + x * 0.015 + i * 0.4) *
            (2 + edgeAmp) *
            reducedMotionScale;
          if (x === WORLD.x + 10) {
            ctx.moveTo(x, y + offset);
          } else {
            ctx.lineTo(x, y + offset);
          }
        }
        ctx.stroke();
      }
    }
  }

  function drawEvolutionDissolve(accent, progress, visualTheme = null) {
    const splitY = WORLD.y + WORLD.h * 0.56;
    const escalation = getDynamicEscalation(progress);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;

    ctx.fillStyle = rgba(TOKENS.white, 0.6);
    fillRoundRect(WORLD.x + 2, splitY, WORLD.w - 4, WORLD.h - (splitY - WORLD.y) - 2, 8);

    const microCount = Math.floor(40 * escalation.densityScale);
    const baseAlpha = 0.12 + escalation.progress * 0.08 + escalation.intensity * 0.1;
    ctx.fillStyle = visualTheme ? leadTint(visualTheme, baseAlpha, accent) : rgba(accent, baseAlpha);
    for (let i = 0; i < microCount; i += 1) {
      const x = WORLD.x + ((i * 47 + game.floorElapsed * 22 * escalation.speedScale * reducedMotionScale) % (WORLD.w - 20));
      const y = WORLD.y + ((i * 29) % Math.max(20, splitY - WORLD.y - 20));
      const edgeAmp = edgeBlend(1 + escalation.intensity * 3, "x", x);
      const s = (6 + (i % 4) * 2) * (0.6 + 0.4 * escalation.densityScale);
      fillRoundRect(x, y, s, s, 3);
      if (i % 2 === 0 && edgeAmp > 0.5) {
        ctx.fillRect(x + WORLD.w * 0.03, y + WORLD.h * 0.03, s * 0.6, s * 0.6);
      }
    }

    ctx.strokeStyle = rgba(TOKENS.ink, 0.2);
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 12 + i * 95, WORLD.y + 20);
      ctx.lineTo(WORLD.x + 26 + i * 95, WORLD.y + WORLD.h * 0.52);
      ctx.stroke();
    }

    if (visualTheme && visualTheme.trippyLevel >= 4) {
      const latticeCount = Math.floor(5 + visualTheme.trippyLevel * 2);
      for (let i = 0; i < latticeCount; i += 1) {
        const baseX = WORLD.x + 18 + i * ((WORLD.w - 36) / Math.max(1, latticeCount - 1));
        const edgeAmp = edgeBlend(10, "x", baseX);
        const sway =
          Math.sin(game.floorElapsed * visualTheme.motionScale * escalation.speedScale * reducedMotionScale + i * 0.6) *
          edgeAmp *
          reducedMotionScale;
        ctx.strokeStyle = i % 2 === 0 ? supportTint(visualTheme, i, 0.11, accent) : leadTint(visualTheme, 0.18, accent);
        ctx.beginPath();
        ctx.moveTo(baseX - 14 + sway, WORLD.y + 14);
        ctx.lineTo(baseX + 12 - sway, WORLD.y + WORLD.h * 0.54);
        ctx.lineTo(baseX - 8 + sway, WORLD.y + WORLD.h - 18);
        ctx.stroke();
      }
    }
  }

  function drawDynamicWirelineReactor(accent, progress, visualTheme = null, pack = null) {
    const escalation = getDynamicEscalation(progress);
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const railLeftOuter = WORLD.x + 22;
    const railLeftMid = WORLD.x + WORLD.w * 0.24;
    const railRightMid = WORLD.x + WORLD.w * 0.76;
    const railRightOuter = WORLD.x + WORLD.w - 22;
    const flow = game.floorElapsed * 1.95 * escalation.speedScale * reducedMotionScale;
    const rails = [railLeftOuter, railLeftMid, railRightMid, railRightOuter];
    const linkCount = Math.max(4, Math.floor((6 + trippy * 4) * escalation.densityScale));

    for (let r = 0; r < rails.length; r += 1) {
      const rail = rails[r];
      const phase = flow + r * 0.7 + game.globalTime * 0.5 * reducedMotionScale;
      const pulse = 0.14 + escalation.intensity * 0.22;
      ctx.strokeStyle = visualTheme ? leadTint(visualTheme, 0.15 + pulse * 0.3, accent) : rgba(accent, 0.15 + pulse * 0.3);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let y = WORLD.y + 12; y <= WORLD.y + WORLD.h - 12; y += 8) {
        const edgeAmp = edgeBlend(3.6, "y", y);
        const x = rail + Math.sin(phase + y * 0.075 + (r % 2) * 0.8) * (1.6 + edgeAmp * 1.8) * reducedMotionScale;
        if (y === WORLD.y + 12) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      const packetCount = Math.max(2, Math.floor(2 * escalation.densityScale + 1));
      const leadAlpha = 0.1 + escalation.intensity * 0.15;
      ctx.fillStyle = visualTheme ? leadTint(visualTheme, leadAlpha, accent) : rgba(accent, leadAlpha);
      for (let p = 0; p < packetCount; p += 1) {
        const packetProgress = ((flow * 0.25 + p * 0.6) % 1 + 1) % 1;
        const y = WORLD.y + 14 + packetProgress * (WORLD.h - 28);
        const x = rail + Math.sin(flow * 0.8 + r + p * 0.9) * (2.2 + edgeBlend(2.4, "y", y) * 1.4);
        fillRoundRect(x - 1.8, y - 1.8, 3.6, 3.6, 999);
      }
    }

    for (let pair = 0; pair < 2; pair += 1) {
      const leftRail = rails[pair];
      const rightRail = rails[3 - pair];
      const pairStrength = 0.1 + escalation.intensity * 0.12;
      for (let step = 0; step < linkCount; step += 1) {
        const t = step / Math.max(1, linkCount - 1);
        const y = WORLD.y + 20 + (WORLD.h - 40) * t;
        const edgeAmp = edgeBlend(2.8, "y", y);
        const drift = Math.sin(flow * 0.9 + pair * 0.8 + t * Math.PI * 2 + progress * 3) * edgeAmp * reducedMotionScale;
        const core = WORLD.x + WORLD.w * 0.5 + drift * 0.9;
        const yJitter = drift * 0.35;
        const leftColor = visualTheme ? leadTint(visualTheme, 0.08 + pairStrength, accent) : rgba(accent, 0.08 + pairStrength);
        ctx.strokeStyle = leftColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftRail, y + yJitter);
        ctx.quadraticCurveTo(
          core - 22 - pair,
          y - 4 + drift * 0.45,
          rightRail,
          y - yJitter
        );
        ctx.stroke();
      }
    }

    if (trippy > 0.2) {
      const ringCount = Math.max(2, Math.floor(4 + trippy * 5));
      for (let j = 0; j < ringCount; j += 1) {
        const t = (j / Math.max(1, ringCount - 1)) * Math.PI * 2 + game.globalTime * 0.3;
        const y = WORLD.y + WORLD.h * (0.24 + j * 0.18);
        const amp = 0.8 + trippy * 1.4;
        const width = WORLD.w * (0.24 + j * 0.08);
        const leftX = WORLD.x + WORLD.w * 0.5 - width;
        const rightX = WORLD.x + WORLD.w * 0.5 + width;
        const jitter = Math.sin(t + game.floorElapsed * 0.02) * amp;
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, j, 0.05 + trippy * 0.06, accent) : rgba(accent, 0.05 + trippy * 0.06);
        fillRoundRect(leftX, y + jitter, rightX - leftX, 1.4, 999);
      }
    }
  }

  function drawDynamicBloomLattice(accent, progress, visualTheme = null, pack = null) {
    const escalation = getDynamicEscalation(progress);
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const rows = Math.max(5, Math.floor((11 + Math.floor(4 * trippy)) * escalation.densityScale));
    const inversion = Math.sin(game.floorElapsed * 0.22 + progress * 2.2) >= 0;
    const phaseBase = game.globalTime * 1.35 * escalation.speedScale * reducedMotionScale;

    for (let i = 0; i < rows; i += 1) {
      const t = rows > 1 ? i / (rows - 1) : 0;
      const y = WORLD.y + 16 + t * (WORLD.h - 32);
      const span = WORLD.w * (0.22 + 0.17 * Math.sin(t * Math.PI) * 0.4);
      const phase = phaseBase + t * 2.4 + i * 0.53;
      const alpha = 0.06 + 0.05 * escalation.intensity + t * 0.03;
      const leftAnchor = WORLD.x + 14;
      const rightAnchor = WORLD.x + WORLD.w - 14;

      drawBloomPetal(
        inversion ? rightAnchor : leftAnchor,
        y + Math.sin(t * 5 + phase) * 1.8,
        span,
        inversion ? -1 : 1,
        phase,
        visualTheme,
        accent,
        alpha
      );
      drawBloomPetal(
        inversion ? leftAnchor : rightAnchor,
        y + Math.cos(t * 4 + phase) * 1.5,
        span,
        inversion ? 1 : -1,
        phase + 0.64,
        visualTheme,
        accent,
        alpha + 0.01
      );

      const chordY = WORLD.y + 24 + (WORLD.h - 48) * t + Math.sin(phase) * 4 * reducedMotionScale;
      const lineAlpha = visualTheme
        ? leadTint(visualTheme, 0.07 + escalation.intensity * 0.12 + t * 0.02, accent)
        : rgba(accent, 0.07 + escalation.intensity * 0.12 + t * 0.02);
      const edgeAmp = edgeBlend(1.3, "y", chordY);
      ctx.strokeStyle = lineAlpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = WORLD.x + 24; x <= WORLD.x + WORLD.w - 24; x += 10) {
        const offset = Math.sin(x * 0.022 + phase + t * 1.6) * (2 + escalation.intensity * 3) * edgeAmp * reducedMotionScale;
        if (x === WORLD.x + 24) {
          ctx.moveTo(x, chordY + offset);
        } else {
          ctx.lineTo(x, chordY + offset);
        }
      }
      ctx.stroke();

      if (i % 2 === 0) {
        const nodeCount = Math.max(2, Math.floor(3 * escalation.densityScale));
        for (let n = 0; n < nodeCount; n += 1) {
          const nodeT = n / Math.max(1, nodeCount);
          const nodeX = WORLD.x + 20 + nodeT * (WORLD.w - 40);
          const nodeY = chordY + Math.sin(phase + n * 1.9) * (1.6 + escalation.intensity * 2);
          ctx.fillStyle = visualTheme ? supportTint(visualTheme, n, 0.09, accent) : rgba(accent, 0.09);
          fillRoundRect(nodeX - 1, nodeY - 1, 2.2, 2.2, 999);
        }
      }
    }

    if (trippy > 0.25) {
      const bandCount = Math.max(2, Math.floor(3 + trippy * 4));
      for (let i = 0; i < bandCount; i += 1) {
        const bandY = WORLD.y + WORLD.h * (0.28 + i * 0.18);
        const width = WORLD.w * (0.14 + i * 0.06);
        const xAmp = edgeBlend(1.6 + trippy * 1.2, "x", WORLD.x + WORLD.w * 0.5);
        ctx.strokeStyle = visualTheme
          ? leadTint(visualTheme, 0.05 + trippy * 0.05, accent)
          : rgba(accent, 0.05 + trippy * 0.05);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = WORLD.x + 16; x <= WORLD.x + WORLD.w - 16; x += 8) {
          const y = bandY + Math.sin(x * 0.022 + progress * 8 + i * 0.9) * (2 + trippy * 1.8 + escalation.intensity * 2) * xAmp * reducedMotionScale;
          if (x === WORLD.x + 16) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
  }

  function drawDynamicOrbitalTruss(accent, progress, visualTheme = null, pack = null) {
    const escalation = getDynamicEscalation(progress);
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const centerX = WORLD.x + WORLD.w * 0.5;
    const centerY = WORLD.y + WORLD.h * 0.58;
    const orbitCount = 3;

    for (let ring = 0; ring < orbitCount; ring += 1) {
      const ringProgress = (ring + 1) / Math.max(1, orbitCount);
      const radiusX = WORLD.w * (0.12 + ringProgress * 0.18);
      const radiusY = WORLD.h * (0.09 + ringProgress * 0.06);
      const phase = game.globalTime * 0.55 * escalation.speedScale * reducedMotionScale + ring * 0.9;
      const segments = Math.max(8, Math.floor((12 + ring * 6) * escalation.densityScale));
      const ringAlpha = 0.08 + escalation.intensity * 0.16 + ring * 0.01;
      ctx.strokeStyle = visualTheme ? leadTint(visualTheme, ringAlpha, accent) : rgba(accent, ringAlpha);
      ctx.lineWidth = 1 + ring * 0.2;
      ctx.beginPath();
      for (let s = 0; s <= segments; s += 1) {
        const t = s / segments;
        const theta = t * Math.PI * 2 + phase;
        const x = centerX + Math.cos(theta) * radiusX;
        const y = centerY + Math.sin(theta * 1.35) * radiusY;
        const edge = edgeBlend(2.1 + ring * 0.3, "x", x);
        const yOffset = Math.cos(theta * 2 + progress * 2) * 1.6 * edge * reducedMotionScale;
        if (s === 0) {
          ctx.moveTo(x, y + yOffset);
        } else {
          ctx.lineTo(x, y + yOffset);
        }
      }
      ctx.stroke();

      const shardCount = Math.max(4, Math.floor((segments * (0.45 + trippy * 0.3)) * escalation.densityScale));
      const shardAlpha = visualTheme ? leadTint(visualTheme, 0.1 + escalation.intensity * 0.1, accent) : rgba(accent, 0.1 + escalation.intensity * 0.1);
      const markColor = shardAlpha;
      ctx.strokeStyle = markColor;
      for (let i = 0; i < shardCount; i += 1) {
        const t = i / Math.max(1, shardCount);
        const theta = phase * 0.65 + t * Math.PI * 2;
        const x = centerX + Math.cos(theta) * (radiusX * 1.02);
        const y = centerY + Math.sin(theta * 1.17) * (radiusY * 1.05);
        const markSize = 2.1 + (ring % 2) * 0.5;
        const edge = edgeBlend(2.8, "x", x);
        if (edge < 0.18) {
          continue;
        }
        ctx.fillStyle = shardAlpha;
        fillRoundRect(x - markSize * 0.5, y - markSize * 0.5, markSize, markSize, 999);
      }
    }

    if (trippy > 0.2) {
      const nodeCount = 10 + Math.floor(trippy * 14);
      for (let i = 0; i < nodeCount; i += 1) {
        const t = i / Math.max(1, nodeCount - 1);
        const theta = game.globalTime * 0.42 * (1 + trippy * 0.45) + t * Math.PI * 2;
        const radiusX = WORLD.w * 0.28;
        const radiusY = WORLD.h * 0.12;
        const x = centerX + Math.cos(theta + (Math.PI * t)) * radiusX * (0.2 + t * 0.9);
        const y = WORLD.y + WORLD.h * 0.36 + Math.sin(theta * 1.4) * (radiusY * (0.5 + t * 0.5));
        const nodeSize = 1.4 + (i % 3) * 0.5;
        const nodeAlpha = clamp(0.05 + trippy * 0.04 + (1 - t) * 0.03, 0.05, 0.13);
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, i, nodeAlpha, accent) : rgba(accent, nodeAlpha);
        fillRoundRect(x - nodeSize * 0.5, y - nodeSize * 0.5, nodeSize, nodeSize, 999);
      }
    }
  }

  function drawDynamicSingularityChoir(accent, progress, visualTheme = null, pack = null) {
    const escalation = getDynamicEscalation(progress);
    const trippy = clamp((Number(pack && pack.trippyLevel) || 0) / 5, 0, 1);
    const reducedMotionScale = isReducedMotion() ? escalation.backgroundMotionScale : 1;
    const baseRingCount = 4;
    const ringCount = Math.max(4, Math.floor(baseRingCount + trippy * 4));
    const phase = game.globalTime * 0.47 * escalation.speedScale * reducedMotionScale + progress * 2;
    const pulse = (Math.sin(game.floorElapsed * 1.05 * escalation.speedScale * reducedMotionScale + progress * Math.PI) * 0.5 + 0.5);

    for (let ring = 0; ring < ringCount; ring += 1) {
      const inset = 10 + ring * 7;
      const left = WORLD.x + inset;
      const right = WORLD.x + WORLD.w - inset;
      const top = WORLD.y + inset;
      const bottom = WORLD.y + WORLD.h - inset;
      const trippyAmp = 1 + trippy * 0.45;
      const waveAmp = (1.2 + ring * 0.42 + escalation.intensity * 2.2) * trippyAmp;
      const edgeAlpha = 0.06 + escalation.intensity * 0.22 + ring * 0.008 + trippy * 0.04;
      const edgeStyle = visualTheme ? leadTint(visualTheme, edgeAlpha, accent) : rgba(accent, edgeAlpha);
      ctx.strokeStyle = edgeStyle;
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let x = left + 4; x <= right - 4; x += 6) {
        const edgeAmp = edgeBlend(2 + ring * 0.2, "x", x);
        const y = top + (Math.sin((x - left) * 0.043 + phase + ring * 0.8) * waveAmp * edgeAmp + (1 - pulse) * ring * 0.2);
        if (x === left + 4) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let x = right - 4; x >= left + 4; x -= 6) {
        const edgeAmp = edgeBlend(2 + ring * 0.2, "x", x);
        const y = bottom - (Math.sin((x - left) * 0.043 + phase + ring * 0.8 + Math.PI) * waveAmp * edgeAmp + pulse * ring * 0.15);
        if (x === right - 4) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let y = top + 4; y <= bottom - 4; y += 6) {
        const edgeAmp = edgeBlend(2 + ring * 0.2, "y", y);
        const x = left + 14 + (Math.sin((y - top) * 0.043 + phase * 0.8 + ring * 0.4) * waveAmp * edgeAmp);
        if (y === top + 4) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let y = bottom - 4; y >= top + 4; y -= 6) {
        const edgeAmp = edgeBlend(2 + ring * 0.2, "y", y);
        const x = right - 14 - (Math.sin((y - top) * 0.043 + phase * 0.9 + ring * 0.6) * waveAmp * edgeAmp);
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      const markerCount = Math.max(4, Math.floor((6 + trippy * 6) * escalation.densityScale));
      for (let i = 0; i < markerCount; i += 1) {
        const markT = i / Math.max(1, markerCount);
        const edge = i % 4;
        const jitter = Math.sin(phase * 1.2 + markT * 9 + ring) * (1 + ring * 0.25);
        const markX =
          edge === 0
            ? left + 16 + jitter * reducedMotionScale
            : edge === 1
              ? right - 16 - jitter * reducedMotionScale
              : WORLD.x + WORLD.w * 0.5 + (edge - 1.5) * WORLD.w * 0.05;
        const markY =
          edge === 2
            ? top + 16 + jitter * reducedMotionScale
            : edge === 3
              ? bottom - 16 - jitter * reducedMotionScale
              : WORLD.y + WORLD.h * (0.3 + markT * 0.4);
        const markerAlpha = visualTheme ? supportTint(visualTheme, i, 0.07 + escalation.intensity * 0.12, accent) : rgba(accent, 0.07 + escalation.intensity * 0.12);
        const markerSize = 1.8 + (ring % 2) * 0.45;
        ctx.fillStyle = markerAlpha;
        fillRoundRect(
          markX + (edge === 2 ? 1 : edge === 3 ? -1 : 0),
          markY - markerSize * 0.5,
          markerSize,
          markerSize,
          999
        );
      }
    }

    if (trippy > 0.2) {
      const ringBandCount = Math.max(2, Math.floor(3 + trippy * 4));
      for (let i = 0; i < ringBandCount; i += 1) {
        const y = WORLD.y + WORLD.h * (0.16 + i * 0.18);
        const xSpan = WORLD.w * (0.16 + i * 0.07);
        const edge = WORLD.x + (WORLD.w - xSpan) * 0.5;
        const alpha = 0.04 + trippy * 0.03;
        ctx.strokeStyle = visualTheme ? leadTint(visualTheme, alpha, accent) : rgba(accent, alpha);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(edge, y);
        for (let x = edge; x <= edge + xSpan; x += 6) {
          const wave = Math.sin(x * 0.033 + game.floorElapsed * 0.9 + i * 0.8) * (1.4 + trippy * 1.2);
          if (x === edge) {
            ctx.moveTo(x, y + wave);
          } else {
            ctx.lineTo(x, y + wave);
          }
        }
        ctx.stroke();
      }
    }
  }

  function drawWallDecor(floor, accent, wallLeft, wallRight, visualTheme = null) {
    const loops = 8;
    const floorId = resolveFloorId(floor);
    const postNine = Number.isFinite(floorId) && floorId >= 10 && floorId <= 13;
    const wallPulse = Math.sin(game.globalTime * 0.8) * 0.04;
    for (let i = 0; i < loops; i += 1) {
      const y = wallLeft.y + 22 + i * 58;
      const xL = wallLeft.x + 12;
      const xR = wallRight.x + 12;
      const rightOffsetY = y + ((i + floor.id) % 2) * 8;

      ctx.fillStyle = visualTheme ? leadTint(visualTheme, 0.12, accent) : rgba(accent, 0.12);
      fillRoundRect(xL, y, wallLeft.w - 24, 18, 8);
      ctx.fillStyle =
        visualTheme && visualTheme.support.length > 0
          ? supportTint(visualTheme, i, 0.11, accent)
          : visualTheme
            ? leadTint(visualTheme, 0.12, accent)
            : rgba(accent, 0.12);
      fillRoundRect(xR, rightOffsetY, wallRight.w - 24, 18, 8);

      ctx.strokeStyle = rgba(TOKENS.ink, 0.3);
      strokeRoundRect(xL, y, wallLeft.w - 24, 18, 8);
      strokeRoundRect(xR, rightOffsetY, wallRight.w - 24, 18, 8);

      if (postNine) {
        ctx.fillStyle = visualTheme ? supportTint(visualTheme, i + 2, 0.05 + wallPulse, accent) : rgba(accent, 0.05 + wallPulse);
        fillRoundRect(xL + 12, y + (i % 2 ? 8 : 10), 1.6, 1.6, 999);
        fillRoundRect(xR + 7, rightOffsetY + (i % 2 ? 11 : 9), 1.6, 1.6, 999);
      }
    }
  }

  function drawPickups(accent) {
    const reducedMotionScale = getReducedMotionScale();
    for (const pickup of pickups) {
      const bob = Math.sin(pickup.wobble) * (2 * reducedMotionScale);
      drawHeartIcon(pickup.x, pickup.y + bob, pickup.type, accent, 1);
    }
  }

  function drawBullets(accent) {
    pruneBulletTrails(bullets, bulletTrailHistory, activeBulletTrailKeys);
    pruneBulletTrails(enemyBullets, enemyBulletTrailHistory, activeEnemyTrailKeys);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;

    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      if (!bullet) {
        continue;
      }
      renderBulletTrailFor(bullet, i, bulletTrailHistory, accent, false);
      ctx.fillStyle = bullet.color || accent;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.strokeStyle = TOKENS.ink;
    for (let i = 0; i < enemyBullets.length; i += 1) {
      const bullet = enemyBullets[i];
      if (!bullet) {
        continue;
      }
      renderBulletTrailFor(bullet, i, enemyBulletTrailHistory, TOKENS.white, true);
      ctx.fillStyle = bullet.color || TOKENS.white;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawEnemies(accent) {
    for (const enemy of enemies) {
      if (drawEnemySprite(enemy)) {
        continue;
      }

      if (isHomingMissileEnemy(enemy)) {
        drawHomingMissileEnemyProcedural(enemy, accent);
        continue;
      }

      const alpha = enemy.hurtFlash > 0 ? 1 : 0.98;
      const enemyType = typeof enemy.type === "string" ? enemy.type : "";
      const body = enemy.hurtFlash > 0 ? TOKENS.white : rgba(accent, alpha);
      const outline = TOKENS.ink;

      ctx.fillStyle = body;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;

      const x = enemy.x;
      const y = enemy.y;
      const r = enemy.radius;

      if (enemyType === "notification_swarm") {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 4);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 4);
        ctx.fillStyle = TOKENS.ink;
        ctx.fillRect(x - 3, y - 4, 6, 8);
      } else if (enemyType === "flank_drone") {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
        ctx.stroke();
      } else if (enemyType === "speaker_wraith") {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 8);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 8);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      } else if (enemyType === "chair_knight") {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 6);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 6);
        ctx.strokeRect(x - r * 0.55, y - r * 1.15, r * 1.1, r * 0.45);
      } else if (enemyType === "reach_shadow") {
        ctx.fillStyle = rgba(TOKENS.ink, 0.85);
        fillRoundRect(x - r, y - r, r * 2, r * 2, 999);
        ctx.strokeStyle = TOKENS.white;
        ctx.strokeRect(x - 4, y - 4, 8, 8);
      } else if (enemyType === "double") {
        ctx.fillStyle = TOKENS.ink;
        fillRoundRect(x - r, y - r, r * 2, r * 2, 8);
        ctx.strokeStyle = accent;
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 8);
      } else if (enemyType.includes("rabbit")) {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 10);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 10);
        ctx.fillStyle = TOKENS.white;
        fillRoundRect(x - r * 0.58, y - r * 1.5, r * 0.38, r * 0.8, 5);
        fillRoundRect(x + r * 0.2, y - r * 1.5, r * 0.38, r * 0.8, 5);
        ctx.strokeStyle = TOKENS.ink;
        strokeRoundRect(x - r * 0.58, y - r * 1.5, r * 0.38, r * 0.8, 5);
        strokeRoundRect(x + r * 0.2, y - r * 1.5, r * 0.38, r * 0.8, 5);
      } else {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 999);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 999);
      }

      ctx.fillStyle = TOKENS.ink;
      ctx.fillRect(x - 6, y - 2, 3, 3);
      ctx.fillRect(x + 3, y - 2, 3, 3);
    }
  }

  function isHomingMissileEnemy(enemy) {
    return !!enemy && (enemy.type === "dual" || enemy.behavior === "homing_missile");
  }

  function drawHomingMissileEnemyProcedural(enemy, accent) {
    const x = Number.isFinite(enemy.x) ? enemy.x : 0;
    const y = Number.isFinite(enemy.y) ? enemy.y : 0;
    const r = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
    const vx = Number.isFinite(enemy.vx) ? enemy.vx : 0;
    const vy = Number.isFinite(enemy.vy) ? enemy.vy : 0;
    const localSeed = Number.isFinite(enemy.localSeed) ? enemy.localSeed : 0;
    const dirX = (Math.abs(vx) + Math.abs(vy)) > 0.02
      ? vx
      : (Number.isFinite(player.x) ? player.x - x : 0);
    const dirY = (Math.abs(vx) + Math.abs(vy)) > 0.02
      ? vy
      : (Number.isFinite(player.y) ? player.y - y : 0);
    const dirLength = Math.hypot(dirX, dirY) || 1;
    const angle = Math.atan2(dirY, dirX);
    const speed = Math.hypot(vx, vy);
    const speedPulse = clamp(speed / Math.max(r * 8, 1), 0.08, 1);
    const tail = r * (2.15 + speedPulse * 1.4);
    const body = r * 0.64;
    const tip = r * 0.52;
    const core = Math.max(r * 0.4, 2);
    const now = Number.isFinite(game.globalTime) ? game.globalTime : 0;
    const jitterSeed = localSeed + now * 16 + x * 0.001 + y * 0.001;
    const jitterX = Math.sin(jitterSeed) * (0.35 + speedPulse * 1.15);
    const jitterY = Math.cos(jitterSeed * 1.14) * (0.22 + speedPulse * 0.95);
    const skinPulse = (Math.sin(now * 24 + localSeed * 4) + 1) * 0.5;
    const headPulse = (Math.sin(now * 31 + localSeed * 2 + x * 0.02) + 1) * 0.5;
    const trailPulse = (Math.sin(now * 28 + localSeed * 2.2) + 1) * 0.5;
    const fearPulse = (Math.sin(now * 46 + localSeed * 3.3) + 1) * 0.5;
    const fracturePulse = (Math.sin(now * 41 + localSeed * 1.7) + 1) * 0.5;

    ctx.save();
    ctx.translate(x + jitterX, y + jitterY);
    ctx.rotate(angle);

    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(TOKENS.pink, clamp(0.18 + trailPulse * 0.28 + speedPulse * 0.18 + fearPulse * 0.12, 0.18, 0.62));
    fillRoundRect(-tail * 1.05, -body * 1.05, tail + body * 1.05, body * 2.05, body * 0.72);

    for (let i = 0; i < 10; i += 1) {
      const t = i / 9;
      const seamX = -tail * (0.04 + t * 0.8);
      const seamY = Math.sin(now * 48 + localSeed * 2.4 + t * 7.1) * (core * (0.28 + speedPulse * 0.12));
      const seamW = Math.max(0.9, core * (0.22 + t * 0.21));
      const seamH = core * (0.34 + t * 0.1);
      ctx.fillStyle = rgba(i % 2 === 0 ? TOKENS.ink : accent, clamp(0.28 - t * 0.12, 0.08, 0.42));
      fillRoundRect(seamX, seamY - seamH * 0.55, seamW, seamH * 0.45, seamH * 0.2);
    }

    for (let i = 0; i < 6; i += 1) {
      const t = i / 5;
      const finX = -tail * (0.1 + t * 0.72);
      const finY = (-1 + (i % 2) * 2) * (core * (0.56 - t * 0.19) + Math.sin(now * 38 + localSeed * 1.9 + t * 2.3) * core * 0.13);
      const finW = core * (0.65 + t * 0.45);
      const finH = core * 0.26 * (1 + fracturePulse * 0.4);
      ctx.strokeStyle = rgba(TOKENS.ink, clamp(0.13 + t * 0.08 + skinPulse * 0.2, 0.11, 0.34));
      ctx.lineWidth = clamp(0.4 + 0.18 * i, 0.5, 1.3);
      ctx.beginPath();
      ctx.moveTo(finX, finY);
      ctx.lineTo(finX - finW, finY + (i % 2 === 0 ? 0.12 : -0.12) * core);
      ctx.lineTo(finX - finW * 0.64, finY + finH);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = rgba(TOKENS.pink, clamp(0.12 + fearPulse * 0.21, 0.12, 0.39));
    for (let i = 0; i < 8; i += 1) {
      const t = i / 7;
      const emberX = -tail * (0.2 + t * 0.74);
      const emberY = Math.cos(now * 56 + localSeed * 2.8 + t * 5.5) * (core * (0.18 + speedPulse * 0.1));
      const emberW = Math.max(0.6, core * 0.18 * (1 - t * 0.35));
      const emberH = emberW * 0.75;
      fillRoundRect(emberX, emberY - emberH * 0.5, emberW, emberH, emberW * 0.36);
    }

    ctx.fillStyle = rgba(TOKENS.ink, 0.2);
    fillRoundRect(-tail * 1.08, -body * 1.2, tail * 1.02, body * 1.85, body * 0.22);

    ctx.fillStyle = rgba(TOKENS.pink, clamp(0.06 + fracturePulse * 0.2, 0.06, 0.22));
    fillRoundRect(-tail * 0.95, -core * 1.1, tail * 0.6, core * 0.18, core * 0.08);

    ctx.strokeStyle = rgba(accent, clamp(0.14 + skinPulse * 0.26, 0.14, 0.38));
    ctx.lineWidth = clamp(0.4 + trailPulse * 0.4, 0.4, 0.9);
    ctx.beginPath();
    ctx.moveTo(-tail * 0.55, -body * 0.14);
    ctx.lineTo(body * 0.72, -core * 0.08);
    ctx.lineTo(-tail * 0.52, -body * 0.02);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = rgba(TOKENS.pink, clamp(0.18 + speedPulse * 0.3, 0.15, 0.44));
    ctx.lineWidth = clamp(0.45 + speedPulse * 0.55, 0.45, 1.1);
    ctx.beginPath();
    ctx.moveTo(-tail * 0.3, 0);
    ctx.lineTo(body * 0.83, 0.09);
    ctx.lineTo(-tail * 0.26, 0.22);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = rgba(TOKENS.pink, clamp(0.18 + trailPulse * 0.28 + speedPulse * 0.16, 0.15, 0.52));
    fillRoundRect(-tail * 1.05, -body * 0.92, tail + body * 1.02, body * 1.85, body * 0.68);

    ctx.fillStyle = rgba(accent, 0.98);
    fillRoundRect(-tail * 0.8, -body * (0.28 + speedPulse * 0.1), tail * 0.9 + body * 0.52, body * (0.54 + speedPulse * 0.15), body * (0.31 + speedPulse * 0.2));

    ctx.fillStyle = TOKENS.pink;
    fillRoundRect(-body * 0.44, -core * 0.68, body * 0.88, core * 1.37, core * 0.56);
    const pulse = skinPulse;
    for (let i = 0; i < 6; i += 1) {
      const t = i / 4;
      const ringX = -tail * (0.06 + t * 0.62);
      const ringR = Math.max(1.6, core * (0.35 + t * 0.15));
      const ringAlpha = clamp(0.07 + pulse * 0.15 + t * 0.04 + speedPulse * 0.08, 0.07, 0.38);
      ctx.fillStyle = rgba(TOKENS.pink, ringAlpha);
      fillRoundRect(ringX - ringR * 0.5, -ringR * 0.2, ringR, ringR * 0.4, ringR);
    }

    ctx.strokeStyle = rgba(TOKENS.ink, clamp(0.18 + speedPulse * 0.22, 0.18, 0.56));
    ctx.lineWidth = clamp(0.75 + speedPulse * 0.7, 0.8, 2.4);
    ctx.beginPath();
    ctx.moveTo(body + core, -core * 0.85);
    ctx.lineTo(body + tip * 1.66, -core * 0.15);
    ctx.lineTo(body + core, core * 0.85);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(body + tip + core * 0.26, 0);
    ctx.lineTo(body + core * 0.55, -core * (0.42 + headPulse * 0.2));
    ctx.lineTo(body - body * 0.1, -core * (0.22 + headPulse * 0.08));
    ctx.lineTo(body + core * 0.55, core * (0.42 + headPulse * 0.2));
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(body + tip * 1.45, 0);
    ctx.lineTo(body + tip * 0.86, -tip * (0.52 + headPulse * 0.12));
    ctx.lineTo(body + tip * 0.44, 0);
    ctx.lineTo(body + tip * 0.86, tip * (0.52 + headPulse * 0.12));
    ctx.closePath();
    ctx.fillStyle = TOKENS.white;
    ctx.fill();

    ctx.fillStyle = rgba(TOKENS.pink, clamp(0.3 + headPulse * 0.5, 0.35, 0.86));
    const eyeOffset = core * 0.34;
    ctx.fillRect(-core * 0.24, -eyeOffset, 2.2, eyeOffset * 0.9);
    ctx.fillRect(core * 0.12, -eyeOffset, 2.2, eyeOffset * 0.9);

    ctx.restore();
  }

  function drawPlayer(accent, visualTheme = null) {
    primePlayerSpriteCacheIfNeeded();
    const frameState = resolvePlayerSpriteFrameState();
    const blink = player.invuln > 0 && Math.floor(game.globalTime * 24) % 2 === 0;
    if (blink) {
      return;
    }

    const direction = frameState.direction;
    const drewSprite = drawPlayerSprite(direction, accent, frameState.mode, visualTheme);
    if (!drewSprite) {
      drawPlayerProceduralSprite(direction, accent, visualTheme);
    }
    if (isPlayerShootInputActive()) {
      drawPlayerAimLine();
    }
  }

  function drawEnemySprite(enemy) {
    const enemyType = normalizeEnemyType(enemy && enemy.type);
    const state = getEnemySpriteState(enemyType);
    if (!state || state.status !== "ready" || !state.image || !state.trimRect) {
      return false;
    }

    const image = state.image;
    if (!image.naturalWidth || !image.naturalHeight) {
      return false;
    }

    const x = Number.isFinite(enemy.x) ? enemy.x : 0;
    const y = Number.isFinite(enemy.y) ? enemy.y : 0;
    const r = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
    const spriteHeight = r * ENEMY_SPRITE_SCALE.heightScale;
    const spriteWidth = clamp(
      spriteHeight * state.trimAspect,
      r * ENEMY_SPRITE_SCALE.minWidthScale,
      r * ENEMY_SPRITE_SCALE.maxWidthScale
    );
    const drawX = x - spriteWidth * 0.5;
    const drawY = y - spriteHeight * 0.5;
    const sx = state.trimRect.x;
    const sy = state.trimRect.y;
    const sw = state.trimRect.w;
    const sh = state.trimRect.h;

    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, sx, sy, sw, sh, drawX, drawY, spriteWidth, spriteHeight);
    ctx.imageSmoothingEnabled = prevSmoothing;
    return true;
  }

  function drawPlayerAimLine() {
    const x = player.x;
    const y = player.y;
    const aimX = Number.isFinite(player.lastAimX) ? player.lastAimX : 0;
    const aimY = Number.isFinite(player.lastAimY) ? player.lastAimY : -1;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + aimX * 14, y + aimY * 14 - 3);
    ctx.stroke();
  }

  function drawPlayerCog(accent, visualTheme = null) {
    const x = player.x;
    const y = player.y;
    const bodyW = player.radius * 1.65;
    const bodyH = player.radius * 1.95;
    const bodyX = x - bodyW * 0.5;
    const bodyY = y - bodyH * 0.4;
    const headRadius = player.radius * 0.7;
    const headY = bodyY - headRadius - 8;

    ctx.fillStyle = TOKENS.white;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;

    fillRoundRect(bodyX, bodyY, bodyW, bodyH, 10);
    strokeRoundRect(bodyX, bodyY, bodyW, bodyH, 10);

    ctx.fillStyle = accent;
    fillRoundRect(bodyX + 3, bodyY + 3, bodyW - 6, bodyH - 6, 8);

    ctx.fillStyle = TOKENS.ink;
    fillRoundRect(bodyX + 6, bodyY + bodyH - 6, bodyW * 0.28, 16, 6);
    fillRoundRect(bodyX + bodyW - 6 - bodyW * 0.28, bodyY + bodyH - 6, bodyW * 0.28, 16, 6);

    const headTime = typeof game.globalTime === "number" ? game.globalTime : 0;
    const secondaryColor = visualTheme && Array.isArray(visualTheme.support) && visualTheme.support.length > 0
      ? visualTheme.support[0]
      : TOKENS.ink;
    const pulse = (Math.sin(headTime * 1.2 + x * 0.015 + y * 0.008) + 1) * 0.5;
    const spin = headTime * 0.7 + fxState.shotPulse * 0.4;
    const gearTeeth = 10;
    const outerRadius = headRadius * 1.05;
    const innerRadius = headRadius * 0.72;

    ctx.save();
    ctx.translate(x, headY);
    ctx.rotate(spin);

    ctx.fillStyle = rgba(accent, clamp(0.62 + pulse * 0.24 + fxState.intensity * 0.1, 0.64, 0.94));
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < gearTeeth; i += 1) {
      const angle = (Math.PI * 2 * i) / gearTeeth;
      const sx = Math.cos(angle) * innerRadius;
      const sy = Math.sin(angle) * innerRadius;
      const tx = Math.cos(angle) * outerRadius;
      const ty = Math.sin(angle) * outerRadius;

      const toothWidth = headRadius * 0.38;
      const toothHeight = headRadius * 0.28;
      ctx.beginPath();
      const toothAngle = angle - Math.PI / gearTeeth;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(toothAngle);
      ctx.fillStyle = rgba(accent, clamp(0.9 - fxState.intensity * 0.15, 0.72, 0.98));
      ctx.fillRect(toothWidth * 0.45, -toothHeight * 0.5, toothWidth * 0.55, toothHeight);
      ctx.restore();

      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = TOKENS.ink;
    ctx.fill();

    ctx.fillStyle = rgba(secondaryColor, clamp(0.08 + pulse * 0.06 + fxState.intensity * 0.07, 0.08, 0.24));
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(-2, -2, 4, 2);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-4, -1, 4.5, Math.PI * 1.15, Math.PI * 0.24, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, 1, 3.8, Math.PI * 1.1, Math.PI * 0.24, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 2.5, 4.5, Math.PI * 1.1, Math.PI * 2, false);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    if (!isFxToggleEnabled("particles")) {
      return;
    }
    const grainEnabled = isFxToggleEnabled("grain");
    for (const particle of particles) {
      if (!grainEnabled && particle && (particle.type === "grain" || particle.type === "noise")) {
        continue;
      }
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = rgba(particle.color, alpha);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
  }

  function drawFxParticles() {
    if (!isFxToggleEnabled("particles")) {
      return;
    }

    const now = performance.now();
    const prev = Number(fxParticleMeta.lastRenderTime) || now;
    const dt = clamp((now - prev) / 1000, 0.001, 0.033);
    fxParticleMeta.lastRenderTime = now;
    const reduced = getReducedMotionScale();

    for (let i = fxParticles.length - 1; i >= 0; i -= 1) {
      const particle = fxParticles[i];
      if (!particle) {
        fxParticles.splice(i, 1);
        releaseFxParticle(particle);
        continue;
      }

      particle.age += dt;
      particle.prevX = particle.x;
      particle.prevY = particle.y;
      particle.x += particle.vx * dt * reduced;
      particle.y += particle.vy * dt * reduced;

      const drag = particle.kind === "deathRing" ? 1 - dt * 1.5 : 1 - dt * 2.8;
      const damp = clamp(drag, 0.64, 0.98);
      particle.vx *= damp;
      particle.vy *= damp;
      particle.life -= dt;

      if (particle.life <= 0) {
        fxParticles.splice(i, 1);
        releaseFxParticle(particle);
        continue;
      }

      const localProgress = clamp(particle.age / Math.max(particle.maxLife, 0.001), 0, 1);
      const localFade = clamp(1 - localProgress, 0, 1);
      const baseAlpha = clamp(particle.alpha * localFade, 0, 1);

      if (particle.kind === "deathRing") {
        const radius = clamp(particle.radius + particle.radiusDelta * localProgress, 0, particle.radius + particle.radiusDelta);
        const segments = particle.segments;
        const localLineWidth = Math.max(0.8, particle.size * 0.8);
        ctx.strokeStyle = rgba(particle.color, baseAlpha * 0.7);
        ctx.lineWidth = localLineWidth;
        ctx.beginPath();
        for (let s = 0; s < segments; s += 1) {
          const t0 = (Math.PI * 2 * s) / segments + particle.angleOffset;
          const t1 = t0 + Math.PI * 2 / (segments * 2);
          const x0 = particle.x + Math.cos(t0) * radius;
          const y0 = particle.y + Math.sin(t0) * radius;
          const x1 = particle.x + Math.cos(t1) * radius;
          const y1 = particle.y + Math.sin(t1) * radius;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        continue;
      }

      const drawColor = rgba(particle.color, clamp(baseAlpha * 0.9, 0, 1));
      const lineW = clamp(particle.size * 0.8, 0.6, 2.1);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(particle.prevX, particle.prevY);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();

      ctx.fillStyle = drawColor;
      ctx.fillRect(
        particle.x - particle.size * 0.4,
        particle.y - particle.size * 0.4,
        Math.max(1, particle.size * 0.85),
        Math.max(1, particle.size * 0.85)
      );
    }
  }

  function drawHud(floor, accent) {
    const hudX = 70;
    const hudY = 18;

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(hudX, hudY, WIDTH - hudX * 2, 70, 18);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(hudX, hudY, WIDTH - hudX * 2, 70, 18);

    ctx.font = '700 20px "Sora", "Inter", sans-serif';
    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "middle";

    for (let i = 0; i < player.maxHearts; i += 1) {
      const fill = i < player.hearts ? 1 : 0;
      drawHeartIcon(120 + i * 34, 52, floor.heartType, accent, fill);
    }

    ctx.font = '600 14px "Inter", sans-serif';
    ctx.fillText(uiText("hudHpLabel", "HP"), 92, 52);

    if (player.shieldCharges > 0) {
      const shieldX = 252;
      const shieldY = 36;
      ctx.fillStyle = rgba(accent, 0.22);
      fillRoundRect(shieldX, shieldY, 118, 30, 999);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(shieldX, shieldY, 118, 30, 999);

      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 14px "Inter", sans-serif';
      ctx.fillText(formatUiText("hudShieldLabel", "Shield {count}", { count: player.shieldCharges }), shieldX + 14, shieldY + 18);
    }

    const timerText = `${Math.ceil(game.floorTimer)}s`;
    const timerBoxX = WIDTH - 370;
    const timerBoxY = 33;
    const timerW = 250;
    const timerH = 30;

    ctx.font = '700 14px "Inter", sans-serif';
    ctx.fillText(uiText("hudSurviveLabel", "Survive"), timerBoxX, 27);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(timerBoxX, timerBoxY, timerW, timerH, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(timerBoxX, timerBoxY, timerW, timerH, 999);

    const ratio = game.floorDuration > 0 ? clamp(game.floorTimer / game.floorDuration, 0, 1) : 0;
    ctx.fillStyle = rgba(accent, 0.9);
    fillRoundRect(timerBoxX + 3, timerBoxY + 3, (timerW - 6) * ratio, timerH - 6, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 16px "Inter", sans-serif';
    ctx.fillText(timerText, timerBoxX + timerW + 14, timerBoxY + timerH * 0.5 + 1);

    const bombCopy = typeof getBombBriefingCopy === "function" ? getBombBriefingCopy() : BOMB_BRIEFING_FALLBACK;
    const bombAbilityName = bombCopy && bombCopy.abilityName ? bombCopy.abilityName : BOMB_BRIEFING_FALLBACK.abilityName;
    const totalCharges = Math.max(0, Number.isFinite(game.bombChargesPerFloor) ? game.bombChargesPerFloor : 0);
    const remainingCharges = clamp(
      Number.isFinite(game.bombChargesRemaining) ? game.bombChargesRemaining : totalCharges,
      0,
      totalCharges
    );
    const bombText = formatUiText("hudBombLabel", "Space: {ability} {remaining}/{total}", {
      ability: bombAbilityName,
      remaining: remainingCharges,
      total: totalCharges
    });
    ctx.font = '700 12px "Inter", sans-serif';
    let bombBoxW = clamp(Math.ceil(ctx.measureText(bombText).width) + 42, 140, 286);
    const bombBoxH = 30;
    let bombBoxX = timerBoxX - bombBoxW - 18;
    const bombBoxY = timerBoxY;

    const floorLabel = formatUiText("hudFloorLabel", "Floor {floor} / {maxFloors}", {
      floor: floor.id,
      maxFloors: FLOORS.length
    });
    ctx.font = '700 20px "Sora", "Inter", sans-serif';
    const floorLabelWidth = ctx.measureText(floorLabel).width;
    let floorBoxW = clamp(floorLabelWidth + 28, 104, 200);

    const hpAreaRight = 120 + player.maxHearts * 34 + 12;
    const shieldAreaRight = player.shieldCharges > 0 ? 252 + 118 + 12 : 0;
    const leftHudBoundary = Math.max(300, hpAreaRight, shieldAreaRight) + 10;
    const rightHudBoundary = timerBoxX - 12;
    const floorGap = 10;
    const minFloorW = 92;
    const minBombW = 118;
    const middleW = Math.max(0, rightHudBoundary - leftHudBoundary);

    if (middleW > 0) {
      let requiredW = floorBoxW + floorGap + bombBoxW;
      if (requiredW > middleW) {
        let overflow = requiredW - middleW;
        const bombReducible = Math.max(0, bombBoxW - minBombW);
        const bombReduce = Math.min(bombReducible, overflow);
        bombBoxW -= bombReduce;
        overflow -= bombReduce;
        const floorReducible = Math.max(0, floorBoxW - minFloorW);
        const floorReduce = Math.min(floorReducible, overflow);
        floorBoxW -= floorReduce;
        overflow -= floorReduce;
        if (overflow > 0) {
          bombBoxW = Math.max(minBombW, middleW - floorGap - floorBoxW);
          if (bombBoxW < minBombW) {
            floorBoxW = Math.max(minFloorW, middleW - floorGap - minBombW);
            bombBoxW = Math.max(minBombW, middleW - floorGap - floorBoxW);
          }
        }
      }
    }

    const floorBoxX = leftHudBoundary;
    bombBoxX = floorBoxX + floorBoxW + floorGap;
    const floorTextX = floorBoxX + 14;

    ctx.fillStyle = rgba(accent, 0.28);
    fillRoundRect(floorBoxX, 34, floorBoxW, 36, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(floorBoxX, 34, floorBoxW, 36, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(fitCanvasText(floorLabel, floorBoxW - 24), floorTextX, 52);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(bombBoxX, bombBoxY, bombBoxW, bombBoxH, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(bombBoxX, bombBoxY, bombBoxW, bombBoxH, 999);

    const meterSegmentGap = 3;
    const meterSegmentW = 8;
    const meterX = bombBoxX + 10;
    const meterY = bombBoxY + 7;
    const meterH = bombBoxH - 14;
    for (let i = 0; i < totalCharges; i += 1) {
      const segmentX = meterX + i * (meterSegmentW + meterSegmentGap);
      const isActive = i < remainingCharges;
      ctx.fillStyle = rgba(accent, isActive ? 0.34 : 0.12);
      fillRoundRect(segmentX, meterY, meterSegmentW, meterH, 999);
      ctx.strokeStyle = rgba(TOKENS.ink, 0.45);
      ctx.lineWidth = 1;
      strokeRoundRect(segmentX, meterY, meterSegmentW, meterH, 999);
    }

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 12px "Inter", sans-serif';
    const meterW = totalCharges * meterSegmentW + Math.max(0, totalCharges - 1) * meterSegmentGap;
    ctx.fillText(fitCanvasText(bombText, bombBoxW - (meterW + 28)), bombBoxX + 16 + meterW, bombBoxY + 18);

    drawBurstStatusHud(accent);
    drawAttackDisableHud(accent);
    drawMusicToggleHud(accent);
    drawRearShotHint(accent);
    drawUpgradeHudPanel(accent);
    drawDebugStatsLine(accent);
  }

  function drawBurstStatusHud(accent) {
    if (game.state !== GameState.PLAYING || !systems || typeof systems.getDirectionalBurstStatus !== "function") {
      return;
    }

    const burst = systems.getDirectionalBurstStatus();
    if (!burst) {
      return;
    }

    const panelX = 70;
    const panelY = 134;
    const panelW = 292;
    const panelH = 58;

    ctx.fillStyle = rgba(TOKENS.white, 0.95);
    fillRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 10, panelY + 8, panelW - 20, 6, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = '700 14px "Sora", "Inter", sans-serif';
    ctx.fillText(formatUiText("hudBurstLabel", "Burst: {label}", { label: burst.label }), panelX + 12, panelY + 18);

    const detail =
      typeof burst.detailOverride === "string" && burst.detailOverride.trim()
        ? burst.detailOverride
        : burst.mode === "omni"
          ? uiText("hudBurstAllDirections", "All directions active")
          : formatUiText("hudBurstNext", "Next {nextLabel} in {seconds}s", {
              nextLabel: burst.nextLabel,
              seconds: burst.secondsToNext.toFixed(1)
            });
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.fillText(detail, panelX + 12, panelY + 35);

    const meterX = panelX + 158;
    const meterY = panelY + 34;
    const meterW = panelW - 170;
    const meterH = 12;
    ctx.fillStyle = rgba(TOKENS.ink, 0.11);
    fillRoundRect(meterX, meterY, meterW, meterH, 999);
    ctx.fillStyle = rgba(accent, 0.8);
    fillRoundRect(meterX + 1, meterY + 1, Math.max(0, (meterW - 2) * burst.progressToNext), meterH - 2, 999);
    ctx.strokeStyle = rgba(TOKENS.ink, 0.5);
    ctx.lineWidth = 1;
    strokeRoundRect(meterX, meterY, meterW, meterH, 999);
  }

  function drawAttackDisableHud(accent) {
    if (game.state !== GameState.PLAYING) {
      return;
    }

    const lockout = getAttackDisableSnapshot();
    if (!lockout.active) {
      return;
    }

    const panelX = 70;
    const panelY = 198;
    const panelW = 292;
    const panelH = 54;
    const recoveryProgress = clamp(1 - lockout.progress, 0, 1);

    ctx.fillStyle = rgba(TOKENS.white, 0.95);
    fillRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 10, panelY + 8, panelW - 20, 5, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = '700 14px "Sora", "Inter", sans-serif';
    ctx.fillText("Shooting disabled", panelX + 12, panelY + 15);
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.fillText(`Recovering in ${lockout.secondsRemaining.toFixed(1)}s`, panelX + 12, panelY + 31);

    const meterX = panelX + 172;
    const meterY = panelY + 34;
    const meterW = panelW - 184;
    const meterH = 10;
    ctx.fillStyle = rgba(TOKENS.ink, 0.11);
    fillRoundRect(meterX, meterY, meterW, meterH, 999);
    ctx.fillStyle = rgba(accent, 0.78);
    fillRoundRect(meterX + 1, meterY + 1, Math.max(0, (meterW - 2) * recoveryProgress), meterH - 2, 999);
    ctx.strokeStyle = rgba(TOKENS.ink, 0.45);
    ctx.lineWidth = 1;
    strokeRoundRect(meterX, meterY, meterW, meterH, 999);
  }

  function drawMusicToggleHud(accent) {
    if (
      game.state !== GameState.PLAYING &&
      game.state !== GameState.FLOOR_INTRO &&
      game.state !== GameState.FLOOR_CLEAR
    ) {
      return;
    }

    let isMuted = false;
    let hasAudio = true;
    if (AIPU.audio && typeof AIPU.audio.getState === "function") {
      try {
        const audioState = AIPU.audio.getState();
        isMuted = !!(audioState && audioState.muted);
        hasAudio = !(audioState && audioState.hasAudio === false);
      } catch (error) {
        void error;
      }
    }

    const statusText = !hasAudio ? "M: Music unavailable" : isMuted ? "M: Music Off" : "M: Music On";
    const panelX = 70;
    const panelY = 258;
    const panelW = 292;
    const panelH = 38;

    ctx.fillStyle = rgba(TOKENS.white, 0.95);
    fillRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.fillStyle = rgba(accent, 0.16);
    fillRoundRect(panelX + 10, panelY + 8, panelW - 20, 4, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = '700 12px "Inter", sans-serif';
    ctx.fillText(statusText, panelX + 12, panelY + panelH * 0.5 + 1);
  }

  function drawRearShotHint(accent) {
    if (game.state !== GameState.PLAYING || game.rearShotHintTimer <= 0) {
      return;
    }

    const hintMode = game.rearShotHintMode === "omni" ? "omni" : "dual";
    const heading =
      hintMode === "omni"
        ? uiText("rearHintOmniTitle", "Omni burst unlocked")
        : uiText("rearHintDualTitle", "Dual burst unlocked");
    const body =
      hintMode === "omni"
        ? uiText("rearHintOmniBody", "10s hold: shots fire in all 4 directions.")
        : uiText("rearHintDualBody", "2s hold: shots fire forward and backward.");

    const hintDuration = Math.max(0.001, AIPU.constants.REAR_SHOT_NOTICE_DURATION || 4.2);
    const visibility = clamp(game.rearShotHintTimer / hintDuration, 0, 1);
    const alpha = visibility > 0.15 ? 1 : visibility / 0.15;
    const panelW = 566;
    const panelH = 58;
    const panelX = Math.floor((WIDTH - panelW) * 0.5);
    const panelY = 98;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgba(TOKENS.white, 0.95);
    fillRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX, panelY, panelW, panelH, 12);
    ctx.fillStyle = rgba(accent, 0.26);
    fillRoundRect(panelX + 10, panelY + 8, panelW - 20, 6, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = '700 15px "Sora", "Inter", sans-serif';
    ctx.fillText(heading, panelX + 14, panelY + 17);
    ctx.font = '600 13px "Inter", sans-serif';
    ctx.fillText(body, panelX + 14, panelY + 37);
    ctx.restore();
  }

  function drawUpgradeHudPanel(accent) {
    const rows = upgrades.getUpgradeHudRows(5);
    const panelX = WIDTH - 342;
    const panelY = 98;
    const panelW = 272;
    const panelH = 34 + rows.length * 19;

    ctx.fillStyle = rgba(TOKENS.white, 0.95);
    fillRoundRect(panelX, panelY, panelW, panelH, 14);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX, panelY, panelW, panelH, 14);

    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 12, panelY + 10, panelW - 24, 7, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 14px "Sora", "Inter", sans-serif';
    ctx.fillText(uiText("hudUpgradesTitle", "Upgrades"), panelX + 14, panelY + 20);

    ctx.font = '600 13px "Inter", sans-serif';
    for (let i = 0; i < rows.length; i += 1) {
      ctx.fillText(fitCanvasText(rows[i], panelW - 28), panelX + 14, panelY + 41 + i * 19);
    }
  }

  function drawDebugStatsLine(accent) {
    if (!game.showDebugStats) {
      return;
    }

    const quality = typeof FX_CONFIG.quality === "string" ? FX_CONFIG.quality.toLowerCase() : "medium";
    const cacheStats = renderCacheState && renderCacheState.stats ? renderCacheState.stats : null;
    const fxStatus = glfxWorldFxState && typeof glfxWorldFxState.lastStatus === "string" ? glfxWorldFxState.lastStatus : "idle";
    const particleCount = particles ? particles.length : 0;
    const fxParticleCount = fxParticles ? fxParticles.length : 0;
    const cacheHits = cacheStats ? cacheStats.hits : 0;
    const cacheMisses = cacheStats ? cacheStats.misses : 0;
    const debugText =
      "dbg fx " + quality + " | glfx " + fxStatus + " | particles " + particleCount + "+" + fxParticleCount + " | cache " + cacheHits + "/" + cacheMisses;

    const panelX = 70;
    const panelY = 98;
    const panelW = 620;
    const panelH = 30;

    ctx.fillStyle = rgba(TOKENS.white, 0.95);
    fillRoundRect(panelX, panelY, panelW, panelH, 10);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX, panelY, panelW, panelH, 10);

    ctx.fillStyle = rgba(accent, 0.18);
    fillRoundRect(panelX + 8, panelY + 8, panelW - 16, 5, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.fillText(debugText, panelX + 12, panelY + 21);
  }

  function drawStateOverlay(floor, accent) {
    if (
      game.state === GameState.PLAYING ||
      game.state === GameState.TITLE ||
      game.state === GameState.UPGRADE_SELECT ||
      game.state === GameState.BOMB_BRIEFING ||
      game.state === GameState.DEATH_ANIM
    ) {
      return;
    }

    if (game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) {
      drawRunSummaryOverlay(floor, accent);
      return;
    }

    let title = "";
    let body = "";
    let footer = "";
    const floorCopy = getNarrativeFloorCopy(floor);

    if (game.state === GameState.FLOOR_INTRO) {
      title = floorCopy.title;
      body = floorCopy.subtitle;
      footer = uiText("introSkipFooter", "Press Enter or Space to skip intro");
    } else if (game.state === GameState.FLOOR_CLEAR) {
      title = uiText("floorClearTitle", "Floor cleared");
      body = uiText("floorClearSubtitle", "Inputs → weights → neurons → layers → guess.");
      const floorId = resolveFloorId(floor);
      footer = floorId < FLOORS.length ? uiText("floorTransitioningFooter", "Transitioning...") : "";
    }

    const panelW = 760;
    const panelH = 220;
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;
    const contentPadX = 45;
    const contentPadY = 44;
    const contentW = panelW - contentPadX * 2;
    const contentH = panelH - (footer ? 70 : 50);

    ctx.fillStyle = rgba(TOKENS.white, 0.94);
    fillRoundRect(panelX, panelY, panelW, panelH, 20);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 20);

    ctx.fillStyle = rgba(accent, 0.2);
    fillRoundRect(panelX + 18, panelY + 18, panelW - 36, 10, 999);

    withRectClip(panelX + contentPadX, panelY + 12, contentW, contentH, () => {
      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const titleFont = fitHeadingFontSize(title, contentW, 30, 24, 2);
      ctx.font = `700 ${titleFont}px "Sora", "Inter", sans-serif`;
      const titleBottom = drawWrappedText(title, WIDTH * 0.5, panelY + contentPadY, contentW, Math.round(titleFont * 1.15), {
        maxLines: 2
      });

      ctx.font = '500 20px "Inter", sans-serif';
      const bodyStartY = titleBottom + 10;
      const bodyLineHeight = 30;
      const bodyBottomLimit = footer ? panelY + panelH - 48 : panelY + panelH - 26;
      const bodyMaxLines = Math.max(1, Math.floor((bodyBottomLimit - bodyStartY) / bodyLineHeight));
      drawWrappedText(body, WIDTH * 0.5, bodyStartY, contentW, bodyLineHeight, { maxLines: Math.min(3, bodyMaxLines) });
    });

    if (footer) {
      ctx.font = '700 16px "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, WIDTH * 0.5, panelY + panelH - 38);
    }

    ctx.textAlign = "left";
  }

  function drawRunSummaryOverlay(floor, accent) {
    const isVictory = game.state === GameState.VICTORY;
    const outcomeCopy = getNarrativeOutcomeCopy(isVictory);
    const title = outcomeCopy.title;
    const body = outcomeCopy.subtitle;
    const footer = uiText("runSummaryRestartFooter", "Press R to restart");
    const floorsCleared = upgrades.getFloorsClearedCount();
    const totalTaken = upgrades.upgradeState.history.length;
    const buildEntries = upgrades.getRunBuildEntries();
    const learnedBullets = (typeof getWhatYouLearnedBullets === "function" ? getWhatYouLearnedBullets() : [])
      .filter((line) => typeof line === "string" && line.trim())
      .slice(0, 3);
    const threatRows = (typeof getThreatGlossaryRows === "function" ? getThreatGlossaryRows(2, true) : [])
      .filter((line) => typeof line === "string" && line.trim())
      .slice(0, 2);
    const learnedTitle = uiText("runSummaryWhatLearned", "What you learned");

    const panelW = Math.max(280, Math.min(920, WIDTH - 24));
    const panelH = Math.max(420, Math.min(520, HEIGHT - 30));
    const isCompact = panelW < 650;
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;
    const padX = isCompact ? 24 : 32;
    const padY = isCompact ? 30 : 38;
    const contentW = panelW - padX * 2;
    const cardH = isCompact ? 36 : 38;

    function drawResultBadge(x, y, text, isVictory) {
      const label = String(typeof text === "string" ? text : "Run summary");
      const badgeFont = isCompact ? '600 11px "Inter", sans-serif' : '600 12px "Inter", sans-serif';
      const minW = isCompact ? 104 : 118;
      const h = isCompact ? 20 : 22;

      ctx.save();
      ctx.font = badgeFont;
      const measured = ctx.measureText(label);
      const w = clamp(Math.ceil(measured.width) + (isCompact ? 16 : 18), minW, panelW - 24);
      const x0 = Math.round(x - w * 0.5);
      const y0 = y;

      ctx.shadowColor = rgba(TOKENS.ink, 0.1);
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = TOKENS.fog;
      fillRoundRect(x0, y0, w, h, 999);
      ctx.restore();

      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 1.5;
      strokeRoundRect(x0, y0, w, h, 999);

      if (isVictory) {
        ctx.fillStyle = rgba(accent, 0.24);
        fillRoundRect(x0 + 10, y0 + Math.floor((h - 6) / 2), 6, 6, 999);
      }

      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = badgeFont;
      ctx.fillText(label, x0 + (isVictory ? 24 : 16), y0 + h * 0.5);
    }

    function drawSummaryDivider(y, x, width) {
      const dividerX = clamp(Math.floor(x), panelX + 12, panelX + panelW - 12);
      const dividerW = clamp(Math.floor(width), 0, panelX + panelW - dividerX - 12);
      if (dividerW <= 10) {
        return;
      }

      const startX = dividerX;
      const endX = dividerX + dividerW;
      const markerY = Math.round(y);
      const markerW = 4;
      const markerH = 4;
      const capY = markerY - 2;
      const inset = isCompact ? 16 : 20;
      const sideCapW = 12;

      ctx.save();
      ctx.strokeStyle = rgba(TOKENS.ink, 0.18);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(startX, markerY);
      ctx.lineTo(endX, markerY);
      ctx.stroke();

      ctx.fillStyle = TOKENS.fog;
      fillRoundRect(startX, capY, markerW, markerH, 999);
      fillRoundRect(endX - markerW, capY, markerW, markerH, 999);

      if (dividerW >= 84) {
        ctx.fillStyle = rgba(TOKENS.ink, 0.2);
        fillRoundRect(startX + inset, markerY - 1.5, sideCapW, 3, 999);
        fillRoundRect(endX - inset - sideCapW, markerY - 1.5, sideCapW, 3, 999);
      }
      ctx.restore();
    }

    function drawSummaryChrome() {
      const frameInset = isCompact ? 10 : 12;
      const frameRadius = isCompact ? 16 : 18;
      const markLength = isCompact ? 12 : 14;
      const markThickness = isCompact ? 2 : 2.2;

      ctx.save();
      ctx.strokeStyle = rgba(TOKENS.ink, 0.11);
      ctx.lineWidth = 1.1;
      strokeRoundRect(
        panelX + frameInset,
        panelY + frameInset,
        panelW - frameInset * 2,
        panelH - frameInset * 2,
        frameRadius
      );

      ctx.fillStyle = rgba(TOKENS.ink, 0.16);
      fillRoundRect(panelX + 12, panelY + 12, markLength, markThickness, markThickness);
      fillRoundRect(panelX + 12, panelY + 12, markThickness, markLength, markThickness);

      fillRoundRect(panelX + panelW - 12 - markLength, panelY + 12, markLength, markThickness, markThickness);
      fillRoundRect(panelX + panelW - 12 - markThickness, panelY + 12, markThickness, markLength, markThickness);

      fillRoundRect(panelX + 12, panelY + panelH - 12 - markThickness, markLength, markThickness, markThickness);
      fillRoundRect(panelX + 12, panelY + panelH - 12 - markLength, markThickness, markLength, markThickness);
      fillRoundRect(panelX + panelW - 12 - markLength, panelY + panelH - 12 - markThickness, markLength, markThickness, markThickness);
      fillRoundRect(
        panelX + panelW - 12 - markThickness,
        panelY + panelH - 12 - markLength,
        markThickness,
        markLength,
        markThickness
      );
      ctx.restore();
    }

    function runSummaryBuildRows() {
      if (buildEntries.length === 0) {
        return [uiText("runSummaryNoUpgrades", "No upgrades collected.")];
      }

      const visibleBuildRows = buildEntries.slice(0);
      const rows = [];
      for (let i = 0; i < visibleBuildRows.length; i += 1) {
        const entry = visibleBuildRows[i];
        const name =
          entry && entry.def && typeof entry.def.name === "string" && entry.def.name.trim() ? entry.def.name.trim() : "Upgrade";
        const stack = Number.isFinite(entry && entry.stack) ? entry.stack : 1;
        rows.push(`${i + 1}. ${name} x${stack}`);
      }
      return rows;
    }

    function drawSummaryCard(x, y, w, h, heading, rows) {
      ctx.save();
      ctx.shadowColor = rgba(TOKENS.ink, 0.08);
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = TOKENS.fog;
      fillRoundRect(x, y, w, h, 16);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(x, y, w, h, 16);
      ctx.restore();

      const innerX = x + 14;
      const innerY = y + 12;
      const innerW = w - 28;
      const innerH = h - 24;
      const headingY = innerY + 2;
      const firstRowY = innerY + 26;
      const rowH = isCompact ? 18 : 19;
      const rowWidth = Math.max(140, innerW);
      const headingCapW = Math.min(44, innerW);
      const maxRows = Math.max(1, Math.floor((innerH - 40) / rowH));
      const visibleCapacity = Math.max(0, maxRows - 1);
      const hasOverflow = rows.length > maxRows;
      const rowsToRender = rows.slice(0, hasOverflow ? visibleCapacity : maxRows);
      if (hasOverflow) {
        rowsToRender.push(
          formatUiText("runSummaryMore", "+{count} more", { count: Math.max(1, rows.length - rowsToRender.length) })
        );
      }

      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = '700 15px "Sora", "Inter", sans-serif';
      ctx.fillText(fitCanvasText(heading, rowWidth), innerX, headingY);
      ctx.fillStyle = rgba(TOKENS.ink, 0.22);
      fillRoundRect(innerX, headingY + 21, headingCapW, 2, 999);
      ctx.fillStyle = TOKENS.ink;

      ctx.font = '500 12px "Inter", sans-serif';
      const bodyX = innerX + 1;
      const markerX = bodyX + 1;
      const markerW = 3;
      const markerInset = 8;
      for (let i = 0; i < rowsToRender.length; i += 1) {
        const isSummaryMore = hasOverflow && i === rowsToRender.length - 1;
        const rowValue = rowsToRender[i];
        const hasExplicitMarker = rowValue.startsWith("•");
        const isLeadRow = i === 0;
        const isRunListRow = !isSummaryMore && !hasExplicitMarker;
        const isOverflowRow = isSummaryMore;
        const rowText = fitCanvasText(rowValue, innerW - 4 - (isRunListRow ? markerInset : 0));
        const rowY = firstRowY + rowH * i;
        if (rowY > innerY + innerH - rowH - 2) {
          break;
        }
        if (isOverflowRow) {
          ctx.fillStyle = rgba(TOKENS.ink, 0.55);
          ctx.font = '600 11px "Inter", sans-serif';
        } else if (isLeadRow) {
          ctx.fillStyle = TOKENS.ink;
          ctx.font = '600 12px "Inter", sans-serif';
        } else {
          ctx.fillStyle = TOKENS.ink;
          ctx.font = '500 12px "Inter", sans-serif';
        }
        if (isRunListRow) {
          const markerSize = isLeadRow ? 4 : markerW;
          const markerColor = isLeadRow ? rgba(TOKENS.ink, 0.35) : rgba(TOKENS.ink, 0.26);
          ctx.fillStyle = markerColor;
          fillRoundRect(markerX, rowY + Math.max(2, Math.floor(rowH * 0.47)), markerSize, markerSize, markerSize);
          ctx.fillStyle = isSummaryMore ? rgba(TOKENS.ink, 0.55) : TOKENS.ink;
        }
        ctx.fillText(rowText, isRunListRow ? bodyX + markerInset : bodyX, rowY);
      }
    }

    function drawStatChip(x, y, w, h, count, label) {
      const chipText = String(Number.isFinite(count) ? count : 0);
      const labelText = fitCanvasText(label, Math.max(40, w - 24));
      const labelY = y + 6;
      const valueY = y + (isCompact ? 22 : 24);
      const valueFont = clamp(Math.floor(Math.min(28, w * 0.16)), isCompact ? 16 : 18, 30);

      ctx.save();
      ctx.shadowColor = rgba(TOKENS.ink, 0.08);
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = TOKENS.fog;
      fillRoundRect(x, y, w, h, 999);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(x, y, w, h, 999);
      ctx.restore();

      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${valueFont}px "Sora", "Inter", sans-serif`;
      ctx.fillText(fitCanvasText(chipText, w - 28), x + 16, valueY);
      ctx.font = isCompact ? '600 11px "Inter", sans-serif' : '600 12px "Inter", sans-serif';
      ctx.fillText(labelText, x + 16, labelY);
    }

    ctx.save();
    const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGradient.addColorStop(0, TOKENS.white);
    panelGradient.addColorStop(0.48, rgba(TOKENS.white, 0.98));
    panelGradient.addColorStop(1, rgba(TOKENS.fog, 0.95));
    ctx.shadowColor = rgba(TOKENS.ink, 0.16);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = panelGradient;
    fillRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.restore();
    ctx.save();
    const panelSheen = ctx.createLinearGradient(panelX + 8, panelY + 8, panelX + 8, panelY + panelH - 12);
    panelSheen.addColorStop(0, rgba(TOKENS.white, 0.26));
    panelSheen.addColorStop(0.55, rgba(TOKENS.white, 0.07));
    panelSheen.addColorStop(0.9, rgba(TOKENS.ink, 0.03));
    ctx.fillStyle = panelSheen;
    fillRoundRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, 18);
    ctx.restore();
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.save();
    ctx.fillStyle = rgba(TOKENS.ink, 0.03);
    fillRoundRect(panelX + 3, panelY + 3, panelW - 6, panelH * 0.42, 20);
    const panelRim = ctx.createLinearGradient(panelX + panelW * 0.5, panelY, panelX + panelW * 0.5, panelY + panelH);
    panelRim.addColorStop(0, rgba(TOKENS.white, 0.16));
    panelRim.addColorStop(0.5, rgba(TOKENS.ink, 0.0));
    panelRim.addColorStop(1, rgba(TOKENS.ink, 0.11));
    ctx.strokeStyle = panelRim;
    ctx.lineWidth = 1;
    strokeRoundRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 21.5);
    ctx.restore();
    ctx.strokeStyle = rgba(accent, 0.2);
    ctx.lineWidth = 1;
    strokeRoundRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2, 21);

    ctx.fillStyle = rgba(TOKENS.white, 0.6);
    fillRoundRect(panelX + 14, panelY + panelH - 16, panelW - 28, 2, 999);

    ctx.fillStyle = rgba(TOKENS.fog, 0.9);
    fillRoundRect(panelX + 10, panelY + panelH - 10, panelW - 20, 4, 999);

    const railHeight = isCompact ? 4 : 5;
    const railY = panelY + 28;
    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(panelX + 20, railY, panelW - 40, railHeight, 999);
    ctx.fillStyle = rgba(accent, 0.28);
    fillRoundRect(panelX + 20, railY + (isCompact ? 1 : 0.5), Math.max(72, Math.floor(panelW * 0.12)), railHeight / (isCompact ? 2.1 : 1.6), 999);
    drawSummaryChrome();

    drawResultBadge(panelX + panelW * 0.5, panelY + 10, isVictory ? uiText("runSummaryResultBadge", "VICTORY") : uiText("runSummaryResultBadge", "RUN COMPLETE"), isVictory);

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const titleFont = fitHeadingFontSize(title, contentW, 40, 30, 2);
    ctx.font = `700 ${titleFont}px "Sora", "Inter", sans-serif`;
    const titleBottom = drawWrappedText(title, WIDTH * 0.5, panelY + padY + 8, contentW, Math.round(titleFont * 1.13), {
      maxLines: 2
    });

    ctx.font = '500 20px "Inter", sans-serif';
    const bodyBottom = drawWrappedText(body, WIDTH * 0.5, titleBottom + 8, contentW, 28, { maxLines: 2 });

    const dividerY = Math.min(panelY + panelH - 120, bodyBottom + 16);
    drawSummaryDivider(dividerY, panelX + padX, contentW);

    const chipY = Math.max(panelY + 142, dividerY + 10);
    const chipGap = isCompact ? 10 : 12;
    const chipW = Math.floor((contentW - chipGap) / 2);
    const chipX = panelX + padX;
    const summaryCardsTop = chipY + cardH + 20;

    drawStatChip(chipX, chipY, chipW, cardH, floorsCleared, uiText("runSummaryFloorsCleared", "Floors cleared"));
    drawStatChip(
      chipX + chipW + chipGap,
      chipY,
      chipW,
      cardH,
      totalTaken,
      uiText("runSummaryUpgradesTaken", "Upgrades taken")
    );

    const cardsY = summaryCardsTop;
    const cardsH = panelY + panelH - cardsY - 46;
    const useTwoCol = contentW >= 640;
    const cardGap = isCompact ? 10 : 12;
    const buildRows = runSummaryBuildRows();
    const learnRows = [...learnedBullets.map((item) => `• ${item}`)];
    if (threatRows.length > 0) {
      learnRows.push(uiText("runSummaryThreatGlossary", "Threat glossary"));
      for (let i = 0; i < threatRows.length; i += 1) {
        learnRows.push(`• ${threatRows[i]}`);
      }
    } else {
      learnRows.push(uiText("runSummaryThreatGlossaryUnavailable", "Threat glossary unavailable."));
    }

    if (useTwoCol) {
      const sectionW = Math.floor((contentW - cardGap) / 2);
      const runBuildX = panelX + padX;
      const learnX = runBuildX + sectionW + cardGap;
      drawSummaryCard(runBuildX, cardsY, sectionW, cardsH, uiText("runSummaryRunBuild", "Run build"), buildRows);
      drawSummaryCard(learnX, cardsY, sectionW, cardsH, learnedTitle, learnRows);
    } else {
      const sectionW = contentW;
      const summaryH = Math.floor(cardsH / 2) - cardGap * 0.5;
      const runBuildX = panelX + padX;
      const learnX = runBuildX;
      const learnY = cardsY + summaryH + cardGap;
      drawSummaryCard(runBuildX, cardsY, sectionW, summaryH, uiText("runSummaryRunBuild", "Run build"), buildRows);
      drawSummaryCard(learnX, learnY, sectionW, cardsH - summaryH - cardGap, learnedTitle, learnRows);
    }

    drawSummaryDivider(panelY + panelH - 66, panelX + (isCompact ? 26 : 32), panelW - (isCompact ? 52 : 64));

    ctx.textAlign = "center";
    const footerButtonW = Math.min(248, panelW - 120);
    const footerButtonH = 34;
    const footerButtonX = panelX + Math.max(16, (panelW - footerButtonW) / 2);
    const footerButtonY = panelY + panelH - 42;
    const footerFill = TOKENS.fog;
    const footerInnerPad = isCompact ? 14 : 16;
    const keyPillW = isCompact ? 18 : 20;
    const footerFont = isCompact ? '700 13px "Inter", sans-serif' : '700 14px "Inter", sans-serif';
    const keyPillFont = isCompact ? '600 11px "Inter", sans-serif' : '600 12px "Inter", sans-serif';
    ctx.font = footerFont;
    const footerText = fitCanvasText(footer, footerButtonW - 24 - (keyPillW + footerInnerPad + 4));
    const footerTextW = ctx.measureText(footerText).width;
    const footerContentW = keyPillW + footerInnerPad + footerTextW;
    const contentStartX = clamp(Math.round(footerButtonX + (footerButtonW - footerContentW) * 0.5), footerButtonX + 10, footerButtonX + Math.max(10, footerButtonW - footerContentW - 10));
    const keyPillX = contentStartX;
    const keyPillY = Math.round(footerButtonY + footerButtonH * 0.5 - 7.5);
    const footerTextX = keyPillX + keyPillW + footerInnerPad;
    const footerTextDividerX = keyPillX + keyPillW + Math.round(Math.max(4, footerInnerPad * 0.6));
    const footerBase = rgba(TOKENS.white, 0.98);
    const footerDepth = rgba(TOKENS.fog, 0.94);
    const footerGradient = ctx.createLinearGradient(footerButtonX, footerButtonY, footerButtonX, footerButtonY + footerButtonH);
    footerGradient.addColorStop(0, footerBase);
    footerGradient.addColorStop(0.4, footerBase);
    footerGradient.addColorStop(1, footerDepth);

    ctx.save();
    ctx.fillStyle = rgba(TOKENS.ink, 0.02);
    fillRoundRect(footerButtonX + 0.7, footerButtonY + 0.7, footerButtonW - 1.4, footerButtonH * 0.65, 999);
    ctx.shadowColor = rgba(TOKENS.ink, 0.12);
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = footerFill;
    fillRoundRect(footerButtonX - 1, footerButtonY - 1, footerButtonW + 2, footerButtonH + 2, 999);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = footerGradient;
    fillRoundRect(footerButtonX, footerButtonY, footerButtonW, footerButtonH, 999);
    ctx.restore();

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(footerButtonX + 2, footerButtonY + 2, footerButtonW - 4, footerButtonH * 0.18, 999);
    ctx.fillStyle = rgba(TOKENS.ink, 0.03);
    fillRoundRect(footerButtonX + 2, footerButtonY + footerButtonH - 5, footerButtonW - 4, 2.4, 999);
    ctx.fillStyle = rgba(TOKENS.ink, 0.07);
    fillRoundRect(footerButtonX + 2, footerButtonY + 2, footerButtonW - 4, 1.8, 999);
    ctx.fillStyle = rgba(TOKENS.ink, 0.05);
    fillRoundRect(footerButtonX + 2, footerButtonY + footerButtonH - 1.3, footerButtonW - 4, 1.2, 999);
    ctx.fillStyle = rgba(TOKENS.ink, 0.06);
    ctx.fillRect(footerButtonX + 2, footerButtonY + 2, footerButtonW - 4, footerButtonH * 0.22);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(footerButtonX, footerButtonY, footerButtonW, footerButtonH, 999);
    ctx.strokeStyle = rgba(accent, 0.18);
    ctx.lineWidth = 1;
    strokeRoundRect(footerButtonX + 1.2, footerButtonY + 1.2, footerButtonW - 2.4, footerButtonH - 2.4, 998);
    ctx.beginPath();
    ctx.strokeStyle = rgba(TOKENS.white, 0.4);
    ctx.lineWidth = 1;
    ctx.setLineDash([2.5, 3]);
    ctx.lineDashOffset = 1.2;
    ctx.beginPath();
    ctx.arc(footerButtonX + footerButtonW - 12, footerButtonY + footerButtonH * 0.5, 2.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(TOKENS.ink, 0.08);
    fillRoundRect(footerTextDividerX, keyPillY + 1.8, 1, 11.4, 999);

    ctx.save();
    const keyPillGradient = ctx.createLinearGradient(keyPillX, keyPillY, keyPillX, keyPillY + 15);
    keyPillGradient.addColorStop(0, TOKENS.white);
    keyPillGradient.addColorStop(0.5, rgba(TOKENS.white, 0.93));
    keyPillGradient.addColorStop(1, rgba(TOKENS.fog, 0.78));
    ctx.shadowColor = rgba(TOKENS.ink, 0.18);
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = keyPillGradient;
    fillRoundRect(keyPillX, keyPillY, keyPillW, 15, 4);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 1.1;
    strokeRoundRect(keyPillX, keyPillY, keyPillW, 15, 4);
    ctx.fillStyle = rgba(TOKENS.ink, 0.12);
    fillRoundRect(keyPillX + 1, keyPillY + 1, keyPillW - 2, 2, 4);
    ctx.fillStyle = rgba(accent, 0.34);
    fillRoundRect(keyPillX + 1, keyPillY + 12, keyPillW - 2, 1.8, 4);
    ctx.fillStyle = rgba(TOKENS.ink, 0.1);
    fillRoundRect(keyPillX + 2, keyPillY + 3, keyPillW - 4, 1.2, 4);
    ctx.font = keyPillFont;
    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", keyPillX + keyPillW * 0.5, Math.round(keyPillY + 7.5));
    ctx.restore();

    ctx.font = footerFont;
    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(footerText, footerTextX, footerButtonY + footerButtonH * 0.5);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function drawHeartIcon(x, y, type, accent, fillRatio) {
    const alpha = fillRatio ? 1 : 0.24;
    const fill = type === "final" ? TOKENS.white : accent;

    ctx.fillStyle = rgba(fill, alpha);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.bezierCurveTo(x - 9, y - 5, x - 17, y + 8, x, y + 18);
    ctx.bezierCurveTo(x + 17, y + 8, x + 9, y - 5, x, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (type === "memory") {
      ctx.strokeStyle = TOKENS.ink;
      ctx.strokeRect(x - 5, y + 4, 10, 8);
    } else if (type === "checkpoint") {
      ctx.strokeStyle = TOKENS.ink;
      strokeRoundRect(x - 5, y + 3, 10, 12, 3);
    } else if (type === "mirror") {
      ctx.strokeStyle = TOKENS.ink;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x, y + 15);
      ctx.stroke();
    } else if (type === "noise_cancel") {
      ctx.fillStyle = TOKENS.white;
      ctx.fillRect(x - 4, y + 6, 8, 5);
      ctx.strokeStyle = TOKENS.ink;
      ctx.strokeRect(x - 4, y + 6, 8, 5);
    } else if (type === "table") {
      ctx.beginPath();
      ctx.arc(x, y + 9, 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === "bloom") {
      ctx.beginPath();
      ctx.arc(x, y + 8, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCornerMotif(x, y, accent, flip, accentAlpha = 0.26) {
    ctx.save();
    if (flip) {
      ctx.translate(x + 180, y + 98);
      ctx.rotate(Math.PI);
      x = 0;
      y = 0;
    }

    ctx.strokeStyle = rgba(TOKENS.ink, 0.18);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 88);
    ctx.lineTo(x + 56, y + 88);
    ctx.lineTo(x + 56, y + 38);
    ctx.stroke();

    ctx.fillStyle = rgba(accent, clamp(accentAlpha, 0, 1));
    fillRoundRect(x + 68, y + 20, 98, 18, 999);
    fillRoundRect(x + 105, y + 52, 61, 13, 999);

    ctx.restore();
  }

  function drawWrappedText(text, textX, startY, maxWidth, lineHeight, options = {}) {
    const maxLines = Number.isFinite(options.maxLines) ? Math.max(1, Math.floor(options.maxLines)) : Infinity;
    const lines = getWrappedLines(text, maxWidth, maxLines);
    const count = Math.max(lines.length, 1);

    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], textX, startY + i * lineHeight);
    }

    return startY + count * lineHeight;
  }

  function getWrappedLines(text, maxWidth, maxLines = Infinity) {
    const normalized = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
    if (!normalized) {
      return [];
    }

    const words = normalized.split(" ");
    const lines = [];
    let line = "";

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      const testLine = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(testLine).width > maxWidth) {
        lines.push(fitCanvasText(line, maxWidth));
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) {
      lines.push(fitCanvasText(line, maxWidth));
    }

    if (lines.length <= maxLines) {
      return lines;
    }

    const clipped = lines.slice(0, maxLines);
    const lastIndex = clipped.length - 1;
    const withEllipsis = clipped[lastIndex].endsWith("...") ? clipped[lastIndex] : `${clipped[lastIndex]}...`;
    clipped[lastIndex] = fitCanvasText(withEllipsis, maxWidth);
    return clipped;
  }

  function fitHeadingFontSize(text, maxWidth, startPx, minPx, maxLines) {
    for (let size = startPx; size >= minPx; size -= 1) {
      ctx.font = `700 ${size}px "Sora", "Inter", sans-serif`;
      const lines = getWrappedLines(text, maxWidth, Infinity);
      if (lines.length <= maxLines) {
        return size;
      }
    }
    return minPx;
  }

  function fitHeadingFontSizeForBox(
    text,
    maxWidth,
    maxHeight,
    startPx,
    minPx,
    maxLines,
    lineFactor = 1.08,
    fontPattern = '700 ${size}px "Sora", "Inter", sans-serif'
  ) {
    const pattern =
      typeof fontPattern === "string" && fontPattern.includes("${size}")
        ? fontPattern
        : '700 ${size}px "Sora", "Inter", sans-serif';
    const safeHeight = Math.max(1, maxHeight);
    for (let size = startPx; size >= minPx; size -= 1) {
      ctx.font = pattern.replace("${size}", String(size));
      const lines = getWrappedLines(text, maxWidth, Infinity);
      const lineHeight = Math.round(size * lineFactor);
      if (lines.length <= maxLines && lines.length * lineHeight <= safeHeight) {
        return size;
      }
    }
    return minPx;
  }

  function fitFontSizeForLine(text, maxWidth, startPx, minPx, fontPattern) {
    const pattern = typeof fontPattern === "string" && fontPattern.includes("${size}") ? fontPattern : '600 ${size}px "Inter", sans-serif';
    const value = typeof text === "string" ? text : "";
    let chosen = minPx;
    for (let size = startPx; size >= minPx; size -= 1) {
      ctx.font = pattern.replace("${size}", String(size));
      if (ctx.measureText(value).width <= maxWidth) {
        chosen = size;
        break;
      }
    }
    return chosen;
  }

  function withClipRect(x, y, w, h, drawFn) {
    if (typeof drawFn !== "function" || w <= 0 || h <= 0) {
      return;
    }

    ctx.save();
    roundRectPath(x, y, w, h, 12);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function withRectClip(x, y, w, h, drawFn) {
    if (typeof drawFn !== "function" || w <= 0 || h <= 0) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function fitCanvasText(text, maxWidth) {
    let value = typeof text === "string" ? text.trim() : "";
    if (!value) {
      return "";
    }

    if (ctx.measureText(value).width <= maxWidth) {
      return value;
    }

    const ellipsis = "...";
    while (value.length > 1 && ctx.measureText(`${value}${ellipsis}`).width > maxWidth) {
      value = value.slice(0, -1);
    }
    return `${value}${ellipsis}`;
  }

  function fillRoundRect(x, y, w, h, r) {
    roundRectPath(x, y, w, h, r);
    ctx.fill();
  }

  function strokeRoundRect(x, y, w, h, r) {
    roundRectPath(x, y, w, h, r);
    ctx.stroke();
  }

  function roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function invalidateRenderCache(reason = "manual") {
    if (!renderCacheState) {
      return;
    }
    renderCacheState.dirty = true;
    renderCacheState.dynamicDirty = true;
    renderCacheState.dynamicTimer = 0;
    renderCacheState.lastDrawTime = 0;
    renderCacheState.lastReason = reason;
  }

  function markRenderCacheFloor(floorId, accentName) {
    if (!renderCacheState) {
      return;
    }

    const nextFloorId = Number.isFinite(floorId) ? floorId : null;
    const nextAccent = typeof accentName === "string" ? accentName : "";
    if (renderCacheState.floorId === nextFloorId && renderCacheState.accent === nextAccent) {
      return;
    }

    renderCacheState.floorId = nextFloorId;
    renderCacheState.accent = nextAccent;
    invalidateRenderCache(`floor:${nextFloorId ?? "none"}`);
  }

  function getRenderCacheStats() {
    if (!renderCacheState) {
      return {
        enabled: false,
        hits: 0,
        misses: 0,
        staticRebuilds: 0,
        dynamicRebuilds: 0,
        dirty: false,
        dynamicDirty: false,
        floorId: null,
        reason: "unavailable"
      };
    }

    return {
      enabled: !!RENDER_CACHE_ENABLED,
      hits: renderCacheState.stats.hits,
      misses: renderCacheState.stats.misses,
      staticRebuilds: renderCacheState.stats.staticRebuilds,
      dynamicRebuilds: renderCacheState.stats.dynamicRebuilds,
      dirty: !!renderCacheState.dirty,
      dynamicDirty: !!renderCacheState.dynamicDirty,
      floorId: renderCacheState.floorId,
      reason: renderCacheState.lastReason
    };
  }

  function getSpriteLoadState() {
    const entries = Object.values(characterSpriteCache);
    const byCharacter = Object.create(null);
    let ready = 0;
    let loading = 0;
    let missing = 0;
    let failed = 0;
    let idle = 0;
    const missingPaths = [];

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const status = entry.status || "idle";
      switch (status) {
        case "ready":
          ready += 1;
          break;
        case "loading":
          loading += 1;
          break;
        case "missing":
          missing += 1;
          break;
        case "idle":
          idle += 1;
          break;
        default:
          break;
      }

      if (entry.failed) {
        failed += 1;
      }
      if (entry.errorPaths && entry.errorPaths.length > 0) {
        missingPaths.push({
          key: entry.key || "",
          paths: entry.errorPaths.slice(0)
        });
      }

      byCharacter[entry.key] = {
        status,
        path: entry.path || "",
        paths: entry.paths.slice(0),
        failed: !!entry.failed,
        imageLoaded: !!entry.image
      };
    }

    return {
      cacheBust: CHARACTER_ART_CACHE_BUST,
      total: entries.length,
      ready,
      loading,
      missing,
      idle,
      failed,
      missingPaths,
      byCharacter
    };
  }

  function roundTo(value, digits = 2) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const power = Math.pow(10, Math.max(0, Math.floor(digits)));
    return Math.round(numeric * power) / power;
  }

  function getRenderCollectionsForText() {
    if (systems && typeof systems.getCollections === "function") {
      const resolved = systems.getCollections();
      if (resolved && typeof resolved === "object") {
        return resolved;
      }
    }
    return {
      activeWaves,
      bullets,
      enemyBullets,
      enemies,
      pickups,
      particles
    };
  }

  function buildRenderGameTextState(sampleLimit = 8) {
    const maxItems = Math.max(1, Math.floor(Number(sampleLimit) || 8));
    const floor = systems && typeof systems.currentFloor === "function" ? systems.currentFloor() : null;
    const collections = getRenderCollectionsForText();
    const safeState = game && typeof game === "object" ? game : {};
    const safePlayer = player && typeof player === "object" ? player : {};
    const safeEnemies = Array.isArray(collections.enemies) ? collections.enemies : [];
    const safeBullets = Array.isArray(collections.bullets) ? collections.bullets : [];
    const safeEnemyBullets = Array.isArray(collections.enemyBullets) ? collections.enemyBullets : [];
    const safePickups = Array.isArray(collections.pickups) ? collections.pickups : [];
    const isPlayingState = safeState.state === GameState.PLAYING;
    const floorId = floor && Number.isFinite(floor.id) ? floor.id : null;
    const floorVisualTheme = floor
      ? resolveFloorVisualTheme(floor, TOKENS.blue)
      : resolveFloorVisualTheme(1, TOKENS.blue);
    const floorPack = floor
      ? resolveFloorFxPack(floor)
      : resolveFloorFxPack({ id: 1 });
    const floorElapsed = Number(safeState.floorElapsed);
    const floorDuration = Number(safeState.floorDuration);
    const floorProgress = (Number.isFinite(floorElapsed) && Number.isFinite(floorDuration) && floorDuration > 0)
      ? clamp(floorElapsed / floorDuration, 0, 1)
      : 0;
    const debugWaterState = resolveWaterWrapperState(
      floorPack && Number.isFinite(floorPack.id) ? floorPack : floorId,
      floorVisualTheme,
      floorProgress
    );
    const debugWaterStateInfo = debugWaterState ? {
      floorId: debugWaterState.floorId,
      isFirstWaterFloor: debugWaterState.floorIdIsEarly || false,
      compound: roundTo(debugWaterState.compound, 3),
      alpha: roundTo(debugWaterState.alpha, 3),
      dynamicAmp: roundTo(debugWaterState.dynamicAmp, 3),
      floorProgress: roundTo(floorProgress, 3),
      speedScale: roundTo(debugWaterState.speedScale, 3),
      staticBands: debugWaterState.staticBands,
      dynamicBands: debugWaterState.dynamicBands,
      causticCount: debugWaterState.causticCount,
      floorRamp: roundTo(debugWaterState.floorProgress, 3),
      motionIntensity: roundTo(debugWaterState.motionIntensity, 3)
    } : null;
    const waterStateMissing = isPlayingState
      && Number.isFinite(floorId)
      && floorId >= WATER_WRAPPER_FLOOR_MIN
      && floorId <= WATER_WRAPPER_FLOOR_MAX
      && !debugWaterState;

    const enemySample = [];
    for (let i = 0; i < safeEnemies.length && i < maxItems; i += 1) {
      const enemy = safeEnemies[i];
      enemySample.push({
        type: normalizeEnemyType(enemy && enemy.type),
        x: roundTo(enemy && enemy.x, 2),
        y: roundTo(enemy && enemy.y, 2),
        hp: roundTo(enemy && enemy.hp, 2),
        radius: roundTo(enemy && enemy.radius, 2)
      });
    }

    const bulletSample = [];
    for (let i = 0; i < safeBullets.length && i < maxItems; i += 1) {
      const bullet = safeBullets[i];
      bulletSample.push({
        x: roundTo(bullet && bullet.x, 2),
        y: roundTo(bullet && bullet.y, 2),
        vx: roundTo(bullet && bullet.vx, 2),
        vy: roundTo(bullet && bullet.vy, 2)
      });
    }

    const enemyBulletSample = [];
    for (let i = 0; i < safeEnemyBullets.length && i < maxItems; i += 1) {
      const bullet = safeEnemyBullets[i];
      enemyBulletSample.push({
        x: roundTo(bullet && bullet.x, 2),
        y: roundTo(bullet && bullet.y, 2),
        vx: roundTo(bullet && bullet.vx, 2),
        vy: roundTo(bullet && bullet.vy, 2)
      });
    }

    const pickupSample = [];
    for (let i = 0; i < safePickups.length && i < maxItems; i += 1) {
      const pickup = safePickups[i];
      pickupSample.push({
        x: roundTo(pickup && pickup.x, 2),
        y: roundTo(pickup && pickup.y, 2),
        radius: roundTo(pickup && pickup.radius, 2)
      });
    }

    let audioState = null;
    if (AIPU.audio && typeof AIPU.audio.getState === "function") {
      try {
        audioState = AIPU.audio.getState();
      } catch (error) {
        void error;
        audioState = { error: "audio_state_unavailable" };
      }
    }

    return {
      schemaVersion: 1,
      coordinateSystem: "origin-top-left,+x-right,+y-down",
      mode: safeState.state || "",
      floor: {
        index: Number.isFinite(safeState.currentFloorIndex) ? safeState.currentFloorIndex : 0,
        id: floor && Number.isFinite(floor.id) ? floor.id : null,
        timer: roundTo(safeState.floorTimer, 3),
        elapsed: roundTo(safeState.floorElapsed, 3)
      },
      player: {
        x: roundTo(safePlayer.x, 2),
        y: roundTo(safePlayer.y, 2),
        vx: roundTo(safePlayer.vx, 2),
        vy: roundTo(safePlayer.vy, 2),
        radius: roundTo(safePlayer.radius, 2),
        hearts: roundTo(safePlayer.hearts, 2),
        maxHearts: roundTo(safePlayer.maxHearts, 2),
        invuln: roundTo(safePlayer.invuln, 3),
        fireCooldown: roundTo(safePlayer.fireCooldown, 3),
        aim: {
          x: roundTo(safePlayer.lastAimX, 3),
          y: roundTo(safePlayer.lastAimY, 3)
        }
      },
      collections: {
        enemies: { count: safeEnemies.length, sample: enemySample },
        bullets: { count: safeBullets.length, sample: bulletSample },
        enemyBullets: { count: safeEnemyBullets.length, sample: enemyBulletSample },
        pickups: { count: safePickups.length, sample: pickupSample },
        particles: { count: Array.isArray(collections.particles) ? collections.particles.length : 0 },
        activeWaves: { count: Array.isArray(collections.activeWaves) ? collections.activeWaves.length : 0 }
      },
      debug: {
        renderCache: getRenderCacheStats(),
        sprites: getSpriteLoadState(),
        visualState: {
          floorId,
          floorPack: floorPack && floorPack.id != null ? {
            id: floorPack.id,
            lead: floorPack.lead,
            motif: floorPack.motif,
            trippyLevel: Number.isFinite(floorPack.trippyLevel) ? floorPack.trippyLevel : 0,
            distortionMode: floorPack.distortionMode
          } : null,
          theme: floorVisualTheme ? {
            leadName: floorVisualTheme.leadName,
            trippyLevel: floorVisualTheme.trippyLevel,
            supportNames: floorVisualTheme.supportNames,
            motionScale: floorVisualTheme.motionScale,
            densityScale: floorVisualTheme.densityScale
          } : null,
          waterState: debugWaterStateInfo,
          waterStateMissingInPlayingFloorRange: waterStateMissing,
          reducedMotion: isReducedMotion()
        },
        playerSprite: {
          facingDirection: playerFacingDirection,
          requestedMode: playerSpriteModeState.requestedMode,
          requestedDirection: playerSpriteModeState.requestedDirection,
          activeMode: playerSpriteModeState.activeMode,
          activeDirection: playerSpriteModeState.activeDirection,
          holdFrames: playerSpriteModeState.holdFrames
        },
        audio: audioState
      }
    };
  }

  function renderGameToText() {
    try {
      return JSON.stringify(buildRenderGameTextState());
    } catch (error) {
      void error;
      return JSON.stringify({
        schemaVersion: 1,
        mode: game && game.state ? game.state : "",
        error: "render_game_to_text_failed"
      });
    }
  }

  AIPU.renderCache = {
    invalidate: invalidateRenderCache,
    markFloor: markRenderCacheFloor,
    getStats: getRenderCacheStats
  };

  AIPU.render = {
    draw,
    drawTitleCinematic,
    drawTitleFinalFrame,
    drawUpgradeSelect,
    drawStateOverlay,
    drawRunSummaryOverlay,
    drawWrappedText,
    fillRoundRect,
    strokeRoundRect,
    roundRectPath,
    isTitleSequenceComplete,
    getSpriteLoadState,
    renderGameToText,
    resetPlayerSpriteState
  };
})();
