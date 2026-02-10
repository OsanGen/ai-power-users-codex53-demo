(() => {
  "use strict";

  const AIPU = (window.AIPU = window.AIPU || {});

  const dom = {
    canvas: document.getElementById("game"),
    gameFrame: document.getElementById("gameFrame"),
    shareModalEl: document.getElementById("shareModal"),
    shareFloorEl: document.getElementById("shareFloor"),
    shareTextEl: document.getElementById("shareText"),
    shareCardPreviewEl: document.getElementById("shareCardPreview"),
    shareCopyBtn: document.getElementById("shareCopyBtn"),
    shareLinkedInBtn: document.getElementById("shareLinkedInBtn"),
    shareDownloadBtn: document.getElementById("shareDownloadBtn"),
    shareCloseBtn: document.getElementById("shareCloseBtn"),
    shareDontAskEl: document.getElementById("shareDontAsk"),
    overlayRestartBtn: document.getElementById("overlayRestartBtn")
  };

  const ctx = dom.canvas.getContext("2d");

  const constants = {
    WIDTH: dom.canvas.width,
    HEIGHT: dom.canvas.height,
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
      FLOOR_INTRO: "FLOOR_INTRO",
      PLAYING: "PLAYING",
      DEATH_ANIM: "DEATH_ANIM",
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
    BASE_INVULN_TIME: 0.8,
    MAX_INVULN_TIME: 1.35,
    MAX_FLOOR_SHIELD_CHARGES: 2,
    FALLBACK_IFRAME_BONUS: 0.05,
    MAX_FALLBACK_IFRAME_BONUS: 0.15
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
      showDebugStats: false,
      deathAnim: null,
      gameOverEntryHandled: false
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
    lastShootKey: "ArrowUp",
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
    if (!list || list.length === 0) {
      return null;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffleArray(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function unitVector(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  function circleHit(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const radius = ar + br;
    return dx * dx + dy * dy <= radius * radius;
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function getMouseCanvasPosition(event) {
    const rect = dom.canvas.getBoundingClientRect();
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
    return { x: 0, y: -1 };
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const int = Number.parseInt(value, 16);
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

  AIPU.dom = dom;
  AIPU.ctx = ctx;
  AIPU.constants = constants;
  AIPU.state = state;
  AIPU.input = input;
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
