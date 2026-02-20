(() => {
  "use strict";

  const AIPU = (window.AIPU = window.AIPU || {});

  function toFinite(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function getElementById(id) {
    return typeof document !== "undefined" ? document.getElementById(id) : null;
  }

  const dom = {
    canvas: getElementById("game"),
    gameFrame: getElementById("gameFrame"),
    textModalEl: getElementById("textModal"),
    lessonTextInputEl: getElementById("lessonTextInput"),
    lessonTextSaveBtn: getElementById("lessonTextSaveBtn"),
    lessonTextSampleBtn: getElementById("lessonTextSampleBtn"),
    lessonTextCloseBtn: getElementById("lessonTextCloseBtn"),
    shareModalEl: getElementById("shareModal"),
    shareFloorEl: getElementById("shareFloor"),
    shareTextEl: getElementById("shareText"),
    shareCardPreviewEl: getElementById("shareCardPreview"),
    shareCopyBtn: getElementById("shareCopyBtn"),
    shareLinkedInBtn: getElementById("shareLinkedInBtn"),
    shareDownloadBtn: getElementById("shareDownloadBtn"),
    shareCloseBtn: getElementById("shareCloseBtn"),
    shareDontAskEl: getElementById("shareDontAsk"),
    overlayRestartBtn: getElementById("overlayRestartBtn")
  };

  const canvasWidth = toFinite(dom.canvas && dom.canvas.width, 1024);
  const canvasHeight = toFinite(dom.canvas && dom.canvas.height, 768);
  const ctx = dom.canvas && typeof dom.canvas.getContext === "function" ? dom.canvas.getContext("2d") : null;

  const constants = {
    WIDTH: canvasWidth,
    HEIGHT: canvasHeight,
    SHARE_DONT_ASK_KEY: "dontAskShare",
    TOKENS: {
      yellow: "#f4d66d",
      blue: "#89b6ff",
      mint: "#90dec9",
      pink: "#f4accd",
      ink: "#1f2430",
      white: "#ffffff",
      fog: "#f2f5f8"
    },
    GameState: {
      TITLE: "TITLE",
      UPGRADE_SELECT: "UPGRADE_SELECT",
      BOMB_BRIEFING: "BOMB_BRIEFING",
      LESSON_SLIDE: "LESSON_SLIDE",
      FLOOR_INTRO: "FLOOR_INTRO",
      PLAYING: "PLAYING",
      DEATH_ANIM: "DEATH_ANIM",
      DEATH_LESSON: "DEATH_LESSON",
      FLOOR_CLEAR: "FLOOR_CLEAR",
      GAME_OVER: "GAME_OVER",
      VICTORY: "VICTORY"
    },
    CORRIDOR: { x: 132, y: 104, w: 1016, h: 560 },
    WALL_WIDTH: 92,
    BASE_PLAYER_SPEED: 238,
    BASE_FIRE_COOLDOWN: 0.14,
    BASE_BULLET_RADIUS: 4,
    BASE_BULLET_SPEED: 528,
    BASE_BULLET_PIERCE: 0,
    BASE_MAX_HP: 3,
    REAR_SHOT_TRIGGER_SECONDS: 2,
    ALL_DIRECTION_SHOT_TRIGGER_SECONDS: 10,
    DUAL_SHOT_UNLOCK_FLOOR: 2,
    OMNI_SHOT_UNLOCK_FLOOR: 8,
    BOMB_UNLOCK_FLOOR: 2,
    HOMING_MISSILE_ATTACK_DISABLE_SECONDS: 3,
    REAR_SHOT_NOTICE_DURATION: 4.2,
    BASE_INVULN_TIME: 0.8,
    MAX_INVULN_TIME: 1.35,
    MAX_FLOOR_SHIELD_CHARGES: 2,
    FALLBACK_IFRAME_BONUS: 0.05,
    MAX_FALLBACK_IFRAME_BONUS: 0.15,
    BOMB_BRIEFING_ACCEPT_COUNT: 3,
    BOMB_CHARGES_BASE: 1,
    BOMB_CHARGES_UPGRADED: 2,
    BOMB_CHARGES_FINAL: 3,
    BOMB_CHARGES_UPGRADE_FLOOR: 5,
    BOMB_CHARGES_FINAL_FLOOR: 7,
    RENDER_CACHE_ENABLED: true,
    DYNAMIC_FX_FPS: 20,
    CACHE_MAX_LAYERS: 1
  };

  constants.WORLD = {
    x: constants.CORRIDOR.x + constants.WALL_WIDTH,
    y: constants.CORRIDOR.y + 34,
    w: constants.CORRIDOR.w - constants.WALL_WIDTH * 2,
    h: constants.CORRIDOR.h - 66
  };

  const state = {
    game: {
      state: constants.GameState.TITLE,
      currentFloorIndex: 0,
      floorTimer: 0,
      floorDuration: 0,
      floorElapsed: 0,
      introTimer: 0,
      clearTimer: 0,
      globalTime: 0,
      kills: 0,
      beatCount: 0,
      titleIntroTime: 0,
      upgradeOptions: [],
      upgradeSelectedIndex: 0,
      upgradeConfirmCooldown: 0,
      upgradeNoticeTimer: 0,
      upgradeCardRects: [],
      floorFallbackInvulnBonus: 0,
      bombChargesPerFloor: 1,
      bombChargesRemaining: 1,
      bombFlashTimer: 0,
      bombBriefingSeenIntroThisRun: false,
      bombBriefingSeenUpgradeThisRun: false,
      bombBriefingSeenFinalUpgradeThisRun: false,
      bombBriefingMode: "intro",
      bombBriefingEnterCount: 0,
      lessonSlideSeenThisFloor: false,
      lessonSlideEnterCount: 0,
      deathLessonBucket: "",
      deathLessonIndex: 0,
      rearShotDirectionKey: "",
      rearShotHoldTime: 0,
      rearShotHintMode: "",
      rearShotDualHintSeen: false,
      rearShotOmniHintSeen: false,
      rearShotHintTimer: 0,
      showDebugStats: false,
      deathAnim: null,
      gameOverEntryHandled: false,
      renderCache: {
        floorId: null,
        accent: "",
        staticCanvas: null,
        staticCtx: null,
        dynamicCanvas: null,
        dynamicCtx: null,
        dirty: true,
        dynamicDirty: true,
        dynamicTimer: 0,
        lastDrawTime: 0,
        lastReason: "init",
        stats: {
          hits: 0,
          misses: 0,
          staticRebuilds: 0,
          dynamicRebuilds: 0
        }
      }
    },
    player: {
      x: constants.WORLD.x + constants.WORLD.w * 0.5,
      y: constants.WORLD.y + constants.WORLD.h * 0.84,
      vx: 0,
      vy: 0,
      radius: 14,
      maxHearts: constants.BASE_MAX_HP,
      hearts: constants.BASE_MAX_HP,
      invuln: 0,
      fireCooldown: 0,
      attackDisableTimer: 0,
      lastAimX: 0,
      lastAimY: -1,
      shieldCharges: 0,
      shieldBreakFlash: 0
    },
    enemyIdCounter: 0,
    activeWaves: [],
    bullets: [],
    enemyBullets: [],
    enemies: [],
    pickups: [],
    particles: []
  };

  const input = {
    keys: Object.create(null),
    lastShootKey: "",
    shootPressOrder: [],
    reducedMotionQuery:
      typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null,
    prefersReducedMotion: false
  };

  input.prefersReducedMotion = input.reducedMotionQuery ? input.reducedMotionQuery.matches : false;

  if (input.reducedMotionQuery) {
    const onReducedMotionChange = (event) => {
      input.prefersReducedMotion = !!event.matches;
    };
    if (typeof input.reducedMotionQuery.addEventListener === "function") {
      input.reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    } else if (typeof input.reducedMotionQuery.addListener === "function") {
      input.reducedMotionQuery.addListener(onReducedMotionChange);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    const x = clamp(t, 0, 1);
    return 1 - Math.pow(1 - x, 3);
  }

  function easeInOutSine(t) {
    const x = clamp(t, 0, 1);
    return -(Math.cos(Math.PI * x) - 1) * 0.5;
  }

  function approach(value, target, step) {
    if (value < target) return Math.min(value + step, target);
    if (value > target) return Math.max(value - step, target);
    return target;
  }

  function randomFrom(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffleArray(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    const copy = [...list];
    if (copy.length < 2) {
      return copy;
    }
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function rand(min, max) {
    const minValue = toFinite(min, 0);
    const maxValue = toFinite(max, minValue);
    const lo = Math.min(minValue, maxValue);
    const hi = Math.max(minValue, maxValue);
    return lo + Math.random() * (hi - lo);
  }

  function unitVector(x, y) {
    const vx = Number(x);
    const vy = Number(y);
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      return { x: 0, y: 0 };
    }
    const len = Math.hypot(vx, vy);
    if (!len || !Number.isFinite(len)) {
      return { x: 0, y: 0 };
    }
    return { x: vx / len, y: vy / len };
  }

  function circleHit(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const radius = ar + br;
    return dx * dx + dy * dy <= radius * radius;
  }

  function pointInRect(x, y, rect) {
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return false;
    }
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.w) || !Number.isFinite(rect.h)) {
      return false;
    }
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function getMouseCanvasPosition(event) {
    if (!dom.canvas || !event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return {
        x: 0,
        y: 0
      };
    }
    const rect = dom.canvas.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return {
        x: event.clientX,
        y: event.clientY
      };
    }
    const scaleX = constants.WIDTH / rect.width;
    const scaleY = constants.HEIGHT / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function arrowKeyToVector(keyName) {
    if (keyName === "ArrowUp") return { x: 0, y: -1 };
    if (keyName === "ArrowDown") return { x: 0, y: 1 };
    if (keyName === "ArrowLeft") return { x: -1, y: 0 };
    if (keyName === "ArrowRight") return { x: 1, y: 0 };
    if (keyName === "KeyW") return { x: 0, y: -1 };
    if (keyName === "KeyS") return { x: 0, y: 1 };
    if (keyName === "KeyA") return { x: -1, y: 0 };
    if (keyName === "KeyD") return { x: 1, y: 0 };
    return { x: 0, y: 0 };
  }

  function hexToRgb(hex) {
    if (typeof hex !== "string") {
      return { r: 0, g: 0, b: 0 };
    }
    const clean = hex.replace("#", "");
    const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const int = Number.parseInt(value, 16);
    if (Number.isNaN(int)) {
      return { r: 0, g: 0, b: 0 };
    }
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255
    };
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function accentColor(name) {
    if (name === "yellow") return constants.TOKENS.yellow;
    if (name === "blue") return constants.TOKENS.blue;
    if (name === "mint") return constants.TOKENS.mint;
    if (name === "pink") return constants.TOKENS.pink;
    return constants.TOKENS.blue;
  }

  const QA_MODULE_GRAPH = Object.freeze({
    core: Object.freeze({
      writes: Object.freeze(["AIPU.dom", "AIPU.ctx", "AIPU.constants", "AIPU.state", "AIPU.input", "AIPU.utils"]),
      reads: Object.freeze(["window", "document"])
    }),
    content: Object.freeze({
      writes: Object.freeze(["AIPU.content"]),
      reads: Object.freeze(["AIPU.utils", "AIPU.state", "AIPU.upgrades", "window.AI_POWER_USER_NARRATIVE"])
    }),
    upgrades: Object.freeze({
      writes: Object.freeze(["AIPU.upgrades", "AIPU.state.player", "AIPU.state.game"]),
      reads: Object.freeze(["AIPU.constants", "AIPU.content", "AIPU.utils"])
    }),
    share: Object.freeze({
      writes: Object.freeze(["AIPU.share"]),
      reads: Object.freeze(["AIPU.dom", "AIPU.constants", "AIPU.content"])
    }),
    systems: Object.freeze({
      writes: Object.freeze(["AIPU.systems", "AIPU.state", "AIPU.input.keys"]),
      reads: Object.freeze(["AIPU.dom", "AIPU.constants", "AIPU.content", "AIPU.upgrades", "AIPU.share", "AIPU.utils"])
    }),
    render: Object.freeze({
      writes: Object.freeze(["AIPU.render", "AIPU.renderCache"]),
      reads: Object.freeze(["AIPU.constants", "AIPU.state", "AIPU.content", "AIPU.upgrades", "AIPU.systems", "AIPU.utils"])
    }),
    main: Object.freeze({
      writes: Object.freeze(["window.advanceTime", "window.render_game_to_text"]),
      reads: Object.freeze(["AIPU.systems", "AIPU.render", "AIPU.share"])
    })
  });

  function toSafeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function buildCollectionSummary(collection, limit = 6, mapper = null) {
    const list = Array.isArray(collection) ? collection : [];
    const safeLimit = Math.max(0, Math.floor(toSafeNumber(limit, 6)));
    const sample = [];
    for (let i = 0; i < list.length && i < safeLimit; i += 1) {
      if (typeof mapper === "function") {
        sample.push(mapper(list[i], i));
      } else {
        sample.push(list[i]);
      }
    }
    return { count: list.length, sample };
  }

  function getQaCollections(limit = 6) {
    const systems = AIPU.systems;
    const fromSystems = systems && typeof systems.getCollections === "function" ? systems.getCollections() : null;
    const active = fromSystems || {
      activeWaves: state.activeWaves || [],
      bullets: state.bullets || [],
      enemyBullets: state.enemyBullets || [],
      enemies: state.enemies || [],
      pickups: state.pickups || [],
      particles: state.particles || []
    };

    return {
      activeWaves: buildCollectionSummary(active.activeWaves, limit, (wave) => ({
        enemyType: wave && typeof wave.enemyType === "string" ? wave.enemyType : "",
        startTime: toSafeNumber(wave && wave.startTime, 0),
        endTime: toSafeNumber(wave && wave.endTime, 0)
      })),
      bullets: buildCollectionSummary(active.bullets, limit, (bullet) => ({
        x: toSafeNumber(bullet && bullet.x, 0),
        y: toSafeNumber(bullet && bullet.y, 0),
        vx: toSafeNumber(bullet && bullet.vx, 0),
        vy: toSafeNumber(bullet && bullet.vy, 0)
      })),
      enemyBullets: buildCollectionSummary(active.enemyBullets, limit, (bullet) => ({
        x: toSafeNumber(bullet && bullet.x, 0),
        y: toSafeNumber(bullet && bullet.y, 0),
        vx: toSafeNumber(bullet && bullet.vx, 0),
        vy: toSafeNumber(bullet && bullet.vy, 0)
      })),
      enemies: buildCollectionSummary(active.enemies, limit, (enemy) => ({
        type: enemy && typeof enemy.type === "string" ? enemy.type : "",
        x: toSafeNumber(enemy && enemy.x, 0),
        y: toSafeNumber(enemy && enemy.y, 0),
        hp: toSafeNumber(enemy && enemy.hp, 0)
      })),
      pickups: buildCollectionSummary(active.pickups, limit, (pickup) => ({
        x: toSafeNumber(pickup && pickup.x, 0),
        y: toSafeNumber(pickup && pickup.y, 0)
      })),
      particles: buildCollectionSummary(active.particles, limit)
    };
  }

  function getQaStateSnapshot(limit = 6) {
    const gameState = state && state.game ? state.game : {};
    const playerState = state && state.player ? state.player : {};
    const floor = AIPU.systems && typeof AIPU.systems.currentFloor === "function" ? AIPU.systems.currentFloor() : null;
    return {
      coordinateSystem: "origin-top-left,+x-right,+y-down",
      game: {
        state: gameState.state || "",
        floorIndex: toSafeNumber(gameState.currentFloorIndex, 0),
        floorId: floor && Number.isFinite(floor.id) ? floor.id : null,
        floorTimer: toSafeNumber(gameState.floorTimer, 0),
        floorElapsed: toSafeNumber(gameState.floorElapsed, 0),
        kills: toSafeNumber(gameState.kills, 0),
        globalTime: toSafeNumber(gameState.globalTime, 0)
      },
      player: {
        x: toSafeNumber(playerState.x, 0),
        y: toSafeNumber(playerState.y, 0),
        vx: toSafeNumber(playerState.vx, 0),
        vy: toSafeNumber(playerState.vy, 0),
        hearts: toSafeNumber(playerState.hearts, 0),
        maxHearts: toSafeNumber(playerState.maxHearts, 0),
        invuln: toSafeNumber(playerState.invuln, 0),
        fireCooldown: toSafeNumber(playerState.fireCooldown, 0)
      },
      collections: getQaCollections(limit)
    };
  }

  AIPU.dom = dom;
  AIPU.ctx = ctx;
  AIPU.constants = constants;
  AIPU.state = state;
  AIPU.input = input;
  AIPU.qa = Object.freeze({
    getModuleGraph: () => QA_MODULE_GRAPH,
    getCollections: (limit = 6) => getQaCollections(limit),
    getStateSnapshot: (limit = 6) => getQaStateSnapshot(limit)
  });
  AIPU.utils = {
    clamp,
    lerp,
    easeOutCubic,
    easeInOutSine,
    approach,
    randomFrom,
    shuffleArray,
    rand,
    unitVector,
    circleHit,
    pointInRect,
    getMouseCanvasPosition,
    arrowKeyToVector,
    hexToRgb,
    rgba,
    accentColor
  };
})();
