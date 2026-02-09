(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const TOKENS = {
    yellow: "#f4d66d",
    blue: "#89b6ff",
    mint: "#90dec9",
    pink: "#f4accd",
    ink: "#1f2430",
    white: "#ffffff",
    fog: "#f2f5f8"
  };

  const GameState = {
    TITLE: "TITLE",
    UPGRADE_SELECT: "UPGRADE_SELECT",
    FLOOR_INTRO: "FLOOR_INTRO",
    PLAYING: "PLAYING",
    FLOOR_CLEAR: "FLOOR_CLEAR",
    GAME_OVER: "GAME_OVER",
    VICTORY: "VICTORY"
  };

  const CORRIDOR = { x: 132, y: 104, w: 1016, h: 560 };
  const WALL_WIDTH = 92;
  const WORLD = {
    x: CORRIDOR.x + WALL_WIDTH,
    y: CORRIDOR.y + 34,
    w: CORRIDOR.w - WALL_WIDTH * 2,
    h: CORRIDOR.h - 66
  };

  const BASE_PLAYER_SPEED = 238;
  const BASE_FIRE_COOLDOWN = 0.14;
  const BASE_BULLET_RADIUS = 4;
  const BASE_BULLET_SPEED = 528;
  const BASE_BULLET_PIERCE = 0;
  const BASE_MAX_HP = 3;
  const BASE_INVULN_TIME = 0.9;

  const keys = Object.create(null);
  let lastShootKey = "ArrowUp";

  window.addEventListener("keydown", (event) => {
    keys[event.key] = true;

    if (
      event.key === " " ||
      event.key === "Enter" ||
      event.key.startsWith("Arrow") ||
      event.key === "1" ||
      event.key === "2" ||
      event.key === "3" ||
      event.key.toLowerCase() === "w" ||
      event.key.toLowerCase() === "a" ||
      event.key.toLowerCase() === "s" ||
      event.key.toLowerCase() === "d"
    ) {
      event.preventDefault();
    }

    if (event.key.startsWith("Arrow")) {
      lastShootKey = event.key;
    }

    const lower = event.key.toLowerCase();
    if (game.state === GameState.TITLE && (event.key === " " || event.key === "Enter")) {
      if (isTitleSequenceComplete()) {
        startRun();
      } else {
        game.titleIntroTime = TITLE_SEQUENCE.finish;
      }
    } else if (game.state === GameState.UPGRADE_SELECT) {
      if (event.key === "1") {
        confirmUpgradeSelection(0);
      } else if (event.key === "2") {
        confirmUpgradeSelection(1);
      } else if (event.key === "3") {
        confirmUpgradeSelection(2);
      } else if (event.key === "ArrowLeft" || lower === "a") {
        shiftUpgradeSelection(-1);
      } else if (event.key === "ArrowRight" || lower === "d") {
        shiftUpgradeSelection(1);
      } else if (event.key === "Enter" || event.key === " ") {
        confirmUpgradeSelection(game.upgradeSelectedIndex);
      } else if (event.key === "Escape") {
        game.upgradeNoticeTimer = 1.2;
      }
    } else if (game.state === GameState.FLOOR_INTRO && (event.key === " " || event.key === "Enter")) {
      game.introTimer = 0;
    } else if ((game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) && lower === "r") {
      toTitle();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.key] = false;
  });

  canvas.addEventListener("mousemove", (event) => {
    if (game.state !== GameState.UPGRADE_SELECT) {
      return;
    }

    const mouse = getMouseCanvasPosition(event);
    const hoverIndex = getUpgradeCardIndexAt(mouse.x, mouse.y);
    if (hoverIndex >= 0) {
      game.upgradeSelectedIndex = hoverIndex;
    }
  });

  canvas.addEventListener("click", (event) => {
    if (game.state !== GameState.UPGRADE_SELECT) {
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

  function wave(
    enemyType,
    startTime,
    endTime,
    spawnRateStart,
    spawnRateEnd,
    speedMultiplierStart,
    speedMultiplierEnd,
    specialFlags = []
  ) {
    return {
      enemyType,
      startTime,
      endTime,
      spawnRateStart,
      spawnRateEnd,
      speedMultiplierStart,
      speedMultiplierEnd,
      specialFlags
    };
  }

  const FLOORS = [
    {
      id: 1,
      name: "Invocation Corridor",
      durationSeconds: 48,
      accent: "yellow",
      overlayTitle: "Floor 1 - AI Power Users",
      overlaySubtitle: "AI POWER USERS pulses in the walls. The rabbit hole opens.",
      heartType: "anchor",
      heartSpawn: { initialCount: 2, baseRate: 0.1, clutchBoostStart: 10 },
      enemyWaves: [
        wave("signal_echo", 0, 48, 0.55, 1.15, 0.92, 1.18),
        wave("signal_echo", 28, 48, 0.2, 0.55, 1.0, 1.2, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 2,
      name: "Tool Discovery Run",
      durationSeconds: 52,
      accent: "blue",
      overlayTitle: "Floor 2 - Tool Discovery",
      overlaySubtitle: "New tools appear quickly. The rabbit stays just ahead.",
      heartType: "refuge",
      heartSpawn: { initialCount: 2, baseRate: 0.1, clutchBoostStart: 9 },
      enemyWaves: [
        wave("rabbit_glimpse", 0, 52, 0.6, 1.35, 0.95, 1.28),
        wave("signal_echo", 8, 30, 0.15, 0.5, 1.0, 1.2),
        wave("rabbit_glimpse", 35, 52, 0.7, 1.55, 1.08, 1.36, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 3,
      name: "Prompt Loop Feed",
      durationSeconds: 56,
      accent: "mint",
      overlayTitle: "Floor 3 - Prompt Loop",
      overlaySubtitle: "Prompts, docs, and context windows keep refreshing in sync.",
      heartType: "memory",
      heartSpawn: { initialCount: 1, baseRate: 0.09, clutchBoostStart: 12 },
      enemyWaves: [
        wave("notification_swarm", 0, 56, 0.95, 2.2, 0.95, 1.25),
        wave("name_glitch_shade", 10, 56, 0.2, 0.75, 0.95, 1.22),
        wave("notification_swarm", 28, 56, 0.4, 1.3, 1.05, 1.35)
      ]
    },
    {
      id: 4,
      name: "Workflow Sync Lane",
      durationSeconds: 60,
      accent: "pink",
      overlayTitle: "Floor 4 - Workflow Sync",
      overlaySubtitle: "Agents and apps begin coordinating in a steady rhythm.",
      heartType: "noise_cancel",
      heartSpawn: { initialCount: 1, baseRate: 0.09, clutchBoostStart: 12 },
      enemyWaves: [
        wave("speaker_wraith", 0, 60, 0.45, 1.0, 0.95, 1.2),
        wave("notification_swarm", 6, 34, 0.4, 1.15, 0.95, 1.18),
        wave("name_glitch_shade", 24, 60, 0.3, 0.95, 1.0, 1.24)
      ]
    },
    {
      id: 5,
      name: "Stack Builder Hall",
      durationSeconds: 64,
      accent: "yellow",
      overlayTitle: "Floor 5 - Stack Builder",
      overlaySubtitle: "Your stack begins to click: tools, memory, and execution.",
      heartType: "table",
      heartSpawn: { initialCount: 1, baseRate: 0.085, clutchBoostStart: 13 },
      enemyWaves: [
        wave("chair_knight", 0, 64, 0.35, 0.9, 0.95, 1.2),
        wave("rabbit_glimpse", 5, 30, 0.35, 0.9, 1.0, 1.2),
        wave("hammer_rabbit", 24, 64, 0.2, 0.55, 1.0, 1.22),
        wave("chair_knight", 35, 64, 0.25, 0.85, 1.08, 1.28)
      ]
    },
    {
      id: 6,
      name: "Automation Loop",
      durationSeconds: 70,
      accent: "blue",
      overlayTitle: "Floor 6 - Automation Loop",
      overlaySubtitle: "You pass the same workflow again, now faster and cleaner.",
      heartType: "checkpoint",
      heartSpawn: { initialCount: 1, baseRate: 0.082, clutchBoostStart: 14 },
      enemyWaves: [
        wave("loop_ghost", 0, 70, 0.55, 1.2, 0.95, 1.25, ["spawnsBehindPlayer"]),
        wave("name_glitch_shade", 15, 60, 0.2, 0.7, 1.0, 1.2),
        wave("loop_ghost", 38, 70, 0.45, 1.35, 1.05, 1.35, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 7,
      name: "Mirror Workflow",
      durationSeconds: 76,
      accent: "mint",
      overlayTitle: "Floor 7 - Mirror Workflow",
      overlaySubtitle: "A mirrored agent runs your process with your precision.",
      heartType: "mirror",
      heartSpawn: { initialCount: 1, baseRate: 0.08, clutchBoostStart: 14 },
      enemyWaves: [
        wave("decay_mote", 0, 76, 1.0, 2.35, 0.95, 1.32),
        wave("loop_ghost", 8, 56, 0.3, 0.85, 1.0, 1.25),
        wave("double", 48, 76, 0.1, 0.4, 1.0, 1.2, ["mirrorsPlayer"])
      ]
    },
    {
      id: 8,
      name: "Integration Threshold",
      durationSeconds: 84,
      accent: "pink",
      overlayTitle: "Floor 8 - Integration Threshold",
      overlaySubtitle: "Integrations wake up across your stack as flows stay stable.",
      heartType: "bloom",
      heartSpawn: { initialCount: 1, baseRate: 0.075, clutchBoostStart: 16 },
      enemyWaves: [
        wave("apex_rabbit", 0, 84, 0.22, 0.72, 1.0, 1.24),
        wave("cell_blob", 8, 84, 0.45, 1.1, 0.95, 1.26, ["canSplit"]),
        wave("speaker_wraith", 28, 84, 0.2, 0.62, 1.05, 1.3)
      ]
    },
    {
      id: 9,
      name: "Power User Emergence",
      durationSeconds: 92,
      accent: "yellow",
      overlayTitle: "Floor 9 - Power User Emergence",
      overlaySubtitle: "You return from the rabbit hole with power-user clarity.",
      heartType: "final",
      heartSpawn: { initialCount: 1, baseRate: 0.07, clutchBoostStart: 18 },
      enemyWaves: [
        wave("reach_shadow", 0, 92, 0.35, 0.92, 1.0, 1.22),
        wave("evolution_rabbit", 8, 92, 0.09, 0.22, 1.0, 1.14),
        wave("decay_mote", 30, 92, 0.45, 1.45, 1.05, 1.36),
        wave("loop_ghost", 42, 92, 0.22, 0.72, 1.08, 1.34, ["spawnsBehindPlayer"])
      ]
    }
  ];

  const TITLE_SEQUENCE = {
    textOnStart: 0.9,
    textOnEnd: 1.9,
    blackGapEnd: 2.35,
    strobeStart: 2.35,
    strobeEnd: 5.45,
    finish: 6.2,
    flashWindows: [
      { time: 2.38, length: 0.07, color: "yellow" },
      { time: 2.56, length: 0.09, color: "pink" },
      { time: 2.77, length: 0.06, color: "blue" },
      { time: 3.02, length: 0.08, color: "mint" },
      { time: 3.31, length: 0.07, color: "pink" },
      { time: 3.48, length: 0.05, color: "yellow" },
      { time: 3.76, length: 0.1, color: "blue" },
      { time: 4.02, length: 0.06, color: "mint" },
      { time: 4.27, length: 0.07, color: "yellow" },
      { time: 4.51, length: 0.11, color: "pink" },
      { time: 4.81, length: 0.07, color: "blue" },
      { time: 5.08, length: 0.08, color: "mint" },
      { time: 5.29, length: 0.07, color: "yellow" }
    ]
  };

  const ENEMY_DEFS = {
    signal_echo: { hp: 2, size: 15, speed: 82, behavior: "chase", touchDamage: 1 },
    rabbit_glimpse: { hp: 1, size: 12, speed: 128, behavior: "dash", touchDamage: 1 },
    notification_swarm: { hp: 1, size: 10, speed: 104, behavior: "swarm", touchDamage: 1 },
    name_glitch_shade: { hp: 2, size: 14, speed: 88, behavior: "phase", touchDamage: 1 },
    speaker_wraith: {
      hp: 3,
      size: 15,
      speed: 78,
      behavior: "ranged",
      touchDamage: 1,
      projectileSpeed: 180
    },
    chair_knight: { hp: 4, size: 17, speed: 72, behavior: "tank", touchDamage: 1 },
    hammer_rabbit: { hp: 5, size: 16, speed: 108, behavior: "charge", touchDamage: 1 },
    loop_ghost: { hp: 2, size: 13, speed: 98, behavior: "chase", touchDamage: 1 },
    decay_mote: { hp: 1, size: 8, speed: 152, behavior: "swarm", touchDamage: 1 },
    double: { hp: 5, size: 15, speed: 116, behavior: "mirror", touchDamage: 1 },
    apex_rabbit: { hp: 6, size: 17, speed: 126, behavior: "charge", touchDamage: 2 },
    cell_blob: { hp: 2, size: 11, speed: 88, behavior: "blob", touchDamage: 1 },
    reach_shadow: { hp: 3, size: 13, speed: 0, behavior: "wallhand", touchDamage: 2 },
    evolution_rabbit: { hp: 10, size: 19, speed: 122, behavior: "boss", touchDamage: 2 }
  };

  const game = {
    state: GameState.TITLE,
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
    upgradeCardRects: []
  };

  const player = {
    x: WORLD.x + WORLD.w * 0.5,
    y: WORLD.y + WORLD.h * 0.84,
    vx: 0,
    vy: 0,
    radius: 14,
    maxHearts: BASE_MAX_HP,
    hearts: BASE_MAX_HP,
    invuln: 0,
    fireCooldown: 0,
    lastAimX: 0,
    lastAimY: -1,
    shieldCharges: 0,
    shieldBreakFlash: 0
  };

  const UPGRADE_DEFS = [
    {
      id: "comfy_soles",
      name: "Comfy Soles",
      desc: "+6% move speed per stack.",
      tags: ["utility"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.moveSpeedMult *= Math.pow(1.06, stack);
      }
    },
    {
      id: "quick_trigger",
      name: "Quick Trigger",
      desc: "-6% shot cooldown per stack.",
      tags: ["offense"],
      maxStacks: 6,
      apply: null,
      modifier: (stats, stack) => {
        stats.fireCooldownMult *= Math.pow(0.94, stack);
      }
    },
    {
      id: "wide_shots",
      name: "Wide Shots",
      desc: "+10% bullet radius per stack.",
      tags: ["offense"],
      maxStacks: 6,
      apply: null,
      modifier: (stats, stack) => {
        stats.bulletRadiusMult *= Math.pow(1.1, stack);
      }
    },
    {
      id: "fast_rounds",
      name: "Fast Rounds",
      desc: "+8% bullet speed per stack.",
      tags: ["offense"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.bulletSpeedMult *= Math.pow(1.08, stack);
      }
    },
    {
      id: "ghost_rounds",
      name: "Ghost Rounds",
      desc: "+1 bullet pierce per stack.",
      tags: ["offense"],
      maxStacks: 3,
      apply: null,
      modifier: (stats, stack) => {
        stats.bulletPierceBonus += stack;
      }
    },
    {
      id: "heart_container",
      name: "Heart Container",
      desc: "+1 max HP per stack and heal +1 immediately.",
      tags: ["defense"],
      maxStacks: 3,
      apply: () => {
        syncPlayerMaxHP(false);
        player.hearts = clamp(player.hearts + 1, 0, player.maxHearts);
      },
      modifier: (stats, stack) => {
        stats.maxHpBonus += stack;
      }
    },
    {
      id: "bubble_shield",
      name: "Bubble Shield",
      desc: "Start each floor with +1 shield charge per stack.",
      tags: ["defense"],
      maxStacks: 3,
      apply: null,
      modifier: (stats, stack) => {
        stats.floorShieldCharges += stack;
      }
    },
    {
      id: "grace_frames",
      name: "Grace Frames",
      desc: "+0.12s post-hit invulnerability per stack.",
      tags: ["defense"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.invulnBonus += 0.12 * stack;
      }
    },
    {
      id: "magnet_hands",
      name: "Magnet Hands",
      desc: "+40px pickup magnet radius per stack.",
      tags: ["utility"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.pickupMagnetBonus += 40 * stack;
      }
    },
    {
      id: "slowmo_aura",
      name: "Slowmo Aura",
      desc: "Enemy bullet speed x0.93 per stack.",
      tags: ["utility", "defense"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.enemyBulletSpeedMult *= Math.pow(0.93, stack);
      }
    }
  ];

  const upgradeState = {
    stacks: Object.create(null),
    history: [],
    lastTakenSerial: Object.create(null),
    serial: 0
  };

  function resetUpgradeRun() {
    upgradeState.stacks = Object.create(null);
    upgradeState.history = [];
    upgradeState.lastTakenSerial = Object.create(null);
    upgradeState.serial = 0;
  }

  function getUpgradeDef(id) {
    return UPGRADE_DEFS.find((upgrade) => upgrade.id === id) || null;
  }

  function getStack(id) {
    return upgradeState.stacks[id] || 0;
  }

  function canTakeUpgrade(id) {
    const def = getUpgradeDef(id);
    return !!def && getStack(id) < def.maxStacks;
  }

  function applyUpgrade(id) {
    const def = getUpgradeDef(id);
    if (!def || !canTakeUpgrade(id)) {
      return null;
    }

    const newStack = getStack(id) + 1;
    upgradeState.stacks[id] = newStack;
    upgradeState.serial += 1;
    upgradeState.lastTakenSerial[id] = upgradeState.serial;
    upgradeState.history.push({
      id,
      floor: (currentFloor() && currentFloor().id) || game.currentFloorIndex + 1,
      stack: newStack,
      serial: upgradeState.serial
    });

    if (typeof def.apply === "function") {
      def.apply({ game, player, newStack });
    }

    return { def, newStack };
  }

  function rollUpgradeOptions(floorIndex, count = 3) {
    void floorIndex;
    const eligible = UPGRADE_DEFS.filter((upgrade) => canTakeUpgrade(upgrade.id));
    if (eligible.length <= count) {
      return shuffleArray([...eligible]).slice(0, count);
    }

    const picks = [];
    const offense = eligible.filter((upgrade) => upgrade.tags.includes("offense"));
    const defenseOrUtility = eligible.filter(
      (upgrade) => upgrade.tags.includes("defense") || upgrade.tags.includes("utility")
    );

    if (offense.length > 0) {
      picks.push(randomFrom(offense));
    }

    if (defenseOrUtility.length > 0) {
      const supportPool = defenseOrUtility.filter((upgrade) => !picks.some((pick) => pick.id === upgrade.id));
      if (supportPool.length > 0) {
        picks.push(randomFrom(supportPool));
      }
    }

    let remaining = eligible.filter((upgrade) => !picks.some((pick) => pick.id === upgrade.id));

    while (picks.length < count && remaining.length > 0) {
      const rolled = randomFrom(remaining);
      picks.push(rolled);
      remaining = remaining.filter((upgrade) => upgrade.id !== rolled.id);
    }

    return picks.slice(0, count);
  }

  function computeDerivedStats() {
    const derived = {
      moveSpeedMult: 1,
      fireCooldownMult: 1,
      bulletRadiusMult: 1,
      bulletSpeedMult: 1,
      bulletPierceBonus: 0,
      maxHpBonus: 0,
      floorShieldCharges: 0,
      invulnBonus: 0,
      pickupMagnetBonus: 0,
      enemyBulletSpeedMult: 1
    };

    for (const upgrade of UPGRADE_DEFS) {
      const stack = getStack(upgrade.id);
      if (stack <= 0 || typeof upgrade.modifier !== "function") {
        continue;
      }
      upgrade.modifier(derived, stack, game.currentFloorIndex);
    }

    return derived;
  }

  function getPlayerSpeed() {
    const stats = computeDerivedStats();
    return BASE_PLAYER_SPEED * stats.moveSpeedMult;
  }

  function getFireCooldown() {
    const stats = computeDerivedStats();
    return BASE_FIRE_COOLDOWN * stats.fireCooldownMult;
  }

  function getBulletRadius() {
    const stats = computeDerivedStats();
    return BASE_BULLET_RADIUS * stats.bulletRadiusMult;
  }

  function getBulletSpeed() {
    const stats = computeDerivedStats();
    return BASE_BULLET_SPEED * stats.bulletSpeedMult;
  }

  function getBulletPierce() {
    const stats = computeDerivedStats();
    return BASE_BULLET_PIERCE + stats.bulletPierceBonus;
  }

  function getPlayerMaxHP() {
    const stats = computeDerivedStats();
    return BASE_MAX_HP + stats.maxHpBonus;
  }

  function getShieldChargesPerFloor() {
    const stats = computeDerivedStats();
    return stats.floorShieldCharges;
  }

  function getInvulnDuration() {
    const stats = computeDerivedStats();
    return BASE_INVULN_TIME + stats.invulnBonus;
  }

  function getPickupMagnetRadius() {
    const stats = computeDerivedStats();
    return stats.pickupMagnetBonus;
  }

  function getEnemyBulletSpeedMultiplier() {
    const stats = computeDerivedStats();
    return stats.enemyBulletSpeedMult;
  }

  function syncPlayerMaxHP(healToFull = false) {
    player.maxHearts = getPlayerMaxHP();
    if (healToFull) {
      player.hearts = player.maxHearts;
      return;
    }
    player.hearts = clamp(player.hearts, 0, player.maxHearts);
  }

  function getCollectedUpgradeEntries() {
    return UPGRADE_DEFS.map((def) => ({
      def,
      stack: getStack(def.id),
      lastSerial: upgradeState.lastTakenSerial[def.id] || 0
    }))
      .filter((entry) => entry.stack > 0)
      .sort((a, b) => {
        if (b.stack !== a.stack) return b.stack - a.stack;
        if (b.lastSerial !== a.lastSerial) return b.lastSerial - a.lastSerial;
        return a.def.name.localeCompare(b.def.name);
      });
  }

  function getUpgradeHudRows(maxRows = 5) {
    const entries = getCollectedUpgradeEntries();
    if (entries.length === 0) {
      return ["None yet"];
    }

    const rows = entries.slice(0, maxRows).map((entry) => `${entry.def.name} x${entry.stack}`);
    if (entries.length > maxRows) {
      rows.push(`+${entries.length - maxRows} more`);
    }
    return rows;
  }

  function getRunBuildEntries() {
    const seen = new Set();
    const ordered = [];

    for (const record of upgradeState.history) {
      if (seen.has(record.id)) {
        continue;
      }
      seen.add(record.id);
      const def = getUpgradeDef(record.id);
      if (!def) {
        continue;
      }
      ordered.push({ def, stack: getStack(record.id), firstFloor: record.floor });
    }

    return ordered;
  }

  function getFloorsClearedCount() {
    if (game.state === GameState.VICTORY) {
      return FLOORS.length;
    }
    return clamp(game.currentFloorIndex, 0, FLOORS.length);
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
    const result = applyUpgrade(option.id);
    if (!result) {
      game.upgradeNoticeTimer = 1.2;
      return;
    }

    console.log(
      `[upgrade] floor ${currentFloor().id}: picked ${option.name} (stack ${result.newStack}/${option.maxStacks})`
    );

    game.upgradeConfirmCooldown = 0.18;
    game.upgradeNoticeTimer = 0;
    beginCurrentFloor();
  }

  let activeWaves = [];
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let pickups = [];
  let particles = [];

  let enemyIdCounter = 0;

  function currentFloor() {
    return FLOORS[game.currentFloorIndex];
  }

  function toTitle() {
    game.state = GameState.TITLE;
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
    resetUpgradeRun();
    bullets = [];
    enemyBullets = [];
    enemies = [];
    pickups = [];
    particles = [];
    player.maxHearts = BASE_MAX_HP;
    player.hearts = BASE_MAX_HP;
    player.shieldCharges = 0;
    player.shieldBreakFlash = 0;
    resetPlayerPosition();
  }

  function startRun() {
    game.kills = 0;
    resetUpgradeRun();
    startFloor(0);
  }

  function startFloor(index) {
    game.currentFloorIndex = index;
    game.floorDuration = 0;
    game.floorTimer = 0;
    game.floorElapsed = 0;
    game.introTimer = 0;
    game.clearTimer = 0;
    game.beatCount = 0;
    game.state = GameState.UPGRADE_SELECT;

    bullets = [];
    enemyBullets = [];
    enemies = [];
    pickups = [];
    particles = [];

    game.upgradeOptions = rollUpgradeOptions(index, 3);
    game.upgradeSelectedIndex = 0;
    game.upgradeConfirmCooldown = 0;
    game.upgradeNoticeTimer = 0;
    game.upgradeCardRects = [];
    normalizeUpgradeSelection();
    syncPlayerMaxHP(false);
    player.invuln = 0;
    player.fireCooldown = 0;
    player.shieldBreakFlash = 0;
    resetPlayerPosition();
  }

  function beginCurrentFloor() {
    const floor = currentFloor();
    if (!floor) {
      return;
    }

    game.floorDuration = floor.durationSeconds;
    game.floorTimer = floor.durationSeconds;
    game.floorElapsed = 0;
    game.introTimer = 2.8;
    game.clearTimer = 0;
    game.beatCount = 0;
    game.state = GameState.FLOOR_INTRO;

    bullets = [];
    enemyBullets = [];
    enemies = [];
    pickups = [];
    particles = [];

    activeWaves = floor.enemyWaves.map((w) => ({ ...w, _accum: 0 }));
    syncPlayerMaxHP(true);
    player.shieldCharges = getShieldChargesPerFloor();
    player.shieldBreakFlash = 0;
    player.invuln = 0;
    player.fireCooldown = 0;
    game.upgradeConfirmCooldown = 0;
    resetPlayerPosition();

    spawnInitialHearts(floor);
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
    const dt = Math.min(deltaTime, 1 / 30);

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

    if (player.shieldBreakFlash > 0) {
      player.shieldBreakFlash = Math.max(0, player.shieldBreakFlash - dt);
    }

    updateParticles(dt);

    if (game.state === GameState.TITLE) {
      game.titleIntroTime += dt;
      return;
    }

    if (game.state === GameState.UPGRADE_SELECT) {
      return;
    }

    if (game.state === GameState.FLOOR_INTRO) {
      updateGameplay(dt, false);
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
          game.state = GameState.VICTORY;
        }
      }
      return;
    }

    if (game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) {
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

  function updatePlayerMovement(dt) {
    const moveX = (isMoveRight() ? 1 : 0) - (isMoveLeft() ? 1 : 0);
    const moveY = (isMoveDown() ? 1 : 0) - (isMoveUp() ? 1 : 0);

    const length = Math.hypot(moveX, moveY) || 1;
    const speed = getPlayerSpeed();
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

  function updatePlayerShooting() {
    const dir = getShootDirection();
    if (!dir) {
      return;
    }

    player.lastAimX = dir.x;
    player.lastAimY = dir.y;

    if (player.fireCooldown > 0 || game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) {
      return;
    }

    const bulletSpeed = getBulletSpeed();
    const bulletRadius = getBulletRadius();
    const bulletPierce = getBulletPierce();
    bullets.push({
      x: player.x + dir.x * (player.radius + 9),
      y: player.y + dir.y * (player.radius + 9),
      vx: dir.x * bulletSpeed,
      vy: dir.y * bulletSpeed,
      radius: bulletRadius,
      pierce: bulletPierce,
      life: 0.95,
      hitEnemyIds: new Set()
    });

    player.fireCooldown = getFireCooldown();
  }

  function getShootDirection() {
    if (keys[lastShootKey]) {
      return arrowKeyToVector(lastShootKey);
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

    const spawnPoint = findSpawnPoint(flags, waveCfg.enemyType);

    enemies.push({
      id: ++enemyIdCounter,
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
      shootCooldown: rand(0.55, 1.45),
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
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
    }

    bullets = bullets.filter(
      (b) =>
        b.life > 0 &&
        b.x > WORLD.x - 30 &&
        b.x < WORLD.x + WORLD.w + 30 &&
        b.y > WORLD.y - 30 &&
        b.y < WORLD.y + WORLD.h + 30
    );
  }

  function updateEnemyBullets(dt) {
    for (const bullet of enemyBullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
    }

    enemyBullets = enemyBullets.filter(
      (b) =>
        b.life > 0 &&
        b.x > WORLD.x - 40 &&
        b.x < WORLD.x + WORLD.w + 40 &&
        b.y > WORLD.y - 40 &&
        b.y < WORLD.y + WORLD.h + 40
    );
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

        if (canAttack) {
          enemy.shootCooldown -= dt;
          if (enemy.shootCooldown <= 0) {
            const shot = unitVector(player.x - enemy.x, player.y - enemy.y);
            spawnEnemyBullet(enemy.x, enemy.y, shot.x, shot.y, ENEMY_DEFS[enemy.type].projectileSpeed || 180, 1);
            enemy.shootCooldown = rand(0.9, 1.55);
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
    const speedMultiplier = getEnemyBulletSpeedMultiplier();
    const adjustedSpeed = speed * speedMultiplier;
    enemyBullets.push({
      x,
      y,
      vx: dirX * adjustedSpeed,
      vy: dirY * adjustedSpeed,
      damage,
      radius: 6,
      life: 2.3
    });
  }

  function updatePickups(dt) {
    const magnetRadius = getPickupMagnetRadius();
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
          id: ++enemyIdCounter,
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
      game.state === GameState.GAME_OVER ||
      game.state === GameState.VICTORY ||
      game.state === GameState.FLOOR_CLEAR
    ) {
      return;
    }

    const invulnDuration = getInvulnDuration();
    if (player.shieldCharges > 0) {
      player.shieldCharges -= 1;
      player.shieldBreakFlash = 0.22;
      player.invuln = invulnDuration;
      emitBurst(player.x, player.y, accentColor("blue"), 10, 175);
      return;
    }

    player.hearts = clamp(player.hearts - amount, 0, player.maxHearts);
    player.invuln = invulnDuration;

    const away = unitVector(player.x - sourceX, player.y - sourceY);
    player.x += away.x * 18;
    player.y += away.y * 18;
    player.x = clamp(player.x, WORLD.x + player.radius, WORLD.x + WORLD.w - player.radius);
    player.y = clamp(player.y, WORLD.y + player.radius, WORLD.y + WORLD.h - player.radius);

    emitBurst(player.x, player.y, TOKENS.white, 14, 200);

    if (player.hearts <= 0) {
      game.state = GameState.GAME_OVER;
    }
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
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vx *= 0.9;
      particle.vy *= 0.9;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function draw() {
    const floor = FLOORS[game.currentFloorIndex] || FLOORS[0];
    const accent = accentColor(floor.accent);

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (game.state === GameState.TITLE) {
      drawTitleCinematic();
      return;
    }

    if (game.state === GameState.UPGRADE_SELECT) {
      drawBackdrop(accent);
      drawUpgradeSelect(floor, accent);
      return;
    }

    drawBackdrop(accent);
    drawCorridor(floor, accent);

    drawPickups(accent);
    drawBullets(accent);
    drawEnemies(accent);
    drawPlayer(accent);
    drawParticles();

    drawHud(floor, accent);
    drawStateOverlay(floor, accent);
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

    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 26, panelY + 26, panelW - 52, 10, 999);

    const rawFloorTitle = floor.overlayTitle || floor.name;
    const normalizedFloorTitle = rawFloorTitle.replace(/^Floor\\s*\\d+\\s*-\\s*/i, "");

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.font = '700 38px "Sora", "Inter", sans-serif';
    ctx.fillText(`Floor ${floor.id}: ${normalizedFloorTitle}`, panelX + 34, panelY + 50);

    ctx.font = '500 20px "Inter", sans-serif';
    drawWrappedText(floor.overlaySubtitle, panelX + 34, panelY + 104, panelW - 68, 30);

    ctx.font = '600 18px "Inter", sans-serif';
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText("Choose 1 upgrade to begin this floor.", panelX + 34, panelY + 174);

    const cardRects = computeUpgradeCardRects(panelX, panelY, panelW, panelH, game.upgradeOptions.length);
    game.upgradeCardRects = cardRects;
    normalizeUpgradeSelection();

    for (let i = 0; i < game.upgradeOptions.length; i += 1) {
      const option = game.upgradeOptions[i];
      const rect = cardRects[i];
      const selected = i === game.upgradeSelectedIndex;
      drawUpgradeCard(option, rect, selected, accent);
    }

    const footerText = "1-3 to pick • Enter to confirm • Esc to skip (NOT allowed)";
    ctx.font = '600 17px "Inter", sans-serif';
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(footerText, panelX + 34, panelY + panelH - 56);

    if (game.upgradeNoticeTimer > 0) {
      ctx.fillStyle = rgba(accent, 0.18);
      fillRoundRect(panelX + panelW - 282, panelY + panelH - 74, 246, 32, 999);
      ctx.strokeStyle = TOKENS.ink;
      strokeRoundRect(panelX + panelW - 282, panelY + panelH - 74, 246, 32, 999);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 15px "Inter", sans-serif';
      ctx.fillText("Choose one to continue.", panelX + panelW - 258, panelY + panelH - 66);
    }
  }

  function computeUpgradeCardRects(panelX, panelY, panelW, panelH, optionCount) {
    if (optionCount <= 0) {
      return [];
    }

    const innerX = panelX + 34;
    const innerY = panelY + 210;
    const innerW = panelW - 68;
    const gap = 20;

    if (optionCount === 3 && innerW < 800) {
      const cardW = Math.floor((innerW - gap) / 2);
      const cardH = 148;
      return [
        { x: innerX, y: innerY, w: cardW, h: cardH },
        { x: innerX + cardW + gap, y: innerY, w: cardW, h: cardH },
        { x: innerX + Math.floor((innerW - cardW) * 0.5), y: innerY + cardH + gap, w: cardW, h: cardH }
      ];
    }

    const cardW = Math.floor((innerW - gap * (optionCount - 1)) / optionCount);
    const cardH = 230;
    const rects = [];
    for (let i = 0; i < optionCount; i += 1) {
      rects.push({ x: innerX + i * (cardW + gap), y: innerY, w: cardW, h: cardH });
    }
    return rects;
  }

  function drawUpgradeCard(option, rect, selected, accent) {
    const stack = getStack(option.id);
    const nextStack = Math.min(stack + 1, option.maxStacks);
    const tags = option.tags.join(" / ");

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(rect.x, rect.y, rect.w, rect.h, 16);

    ctx.strokeStyle = selected ? accent : TOKENS.ink;
    ctx.lineWidth = selected ? 4 : 2;
    strokeRoundRect(rect.x, rect.y, rect.w, rect.h, 16);

    if (selected) {
      ctx.fillStyle = accent;
      fillRoundRect(rect.x + rect.w - 86, rect.y + 12, 70, 16, 999);
      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 12px "Inter", sans-serif';
      ctx.fillText("SELECTED", rect.x + rect.w - 80, rect.y + 14);
    }

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 24px "Sora", "Inter", sans-serif';
    drawWrappedText(option.name, rect.x + 16, rect.y + 16, rect.w - 32, 30);

    ctx.font = '500 16px "Inter", sans-serif';
    drawWrappedText(option.desc, rect.x + 16, rect.y + 78, rect.w - 32, 24);

    ctx.fillStyle = rgba(accent, 0.18);
    fillRoundRect(rect.x + 16, rect.y + rect.h - 84, rect.w - 32, 28, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(rect.x + 16, rect.y + rect.h - 84, rect.w - 32, 28, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 14px "Inter", sans-serif';
    ctx.fillText(`Tags: ${tags}`, rect.x + 26, rect.y + rect.h - 76);

    ctx.font = '600 16px "Inter", sans-serif';
    ctx.fillText(`Stacks: ${stack} -> ${nextStack}`, rect.x + 16, rect.y + rect.h - 42);
  }

  function isTitleSequenceComplete() {
    return game.titleIntroTime >= TITLE_SEQUENCE.finish;
  }

  function drawTitleCinematic() {
    const t = game.titleIntroTime;
    const titleText = "AI POWER USERS";

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (t < TITLE_SEQUENCE.textOnStart) {
      return;
    }

    if (t <= TITLE_SEQUENCE.textOnEnd) {
      drawTitleCenterText(titleText, TOKENS.white, 78);
      return;
    }

    if (t < TITLE_SEQUENCE.blackGapEnd) {
      return;
    }

    if (t <= TITLE_SEQUENCE.strobeEnd) {
      const flash = activeStrobeFlash(t);
      if (flash) {
        const flashColor = accentColor(flash.color);
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawTitleCenterText(titleText, TOKENS.ink, 78);
      }
      return;
    }

    drawTitleFinalFrame();
  }

  function activeStrobeFlash(time) {
    for (const flash of TITLE_SEQUENCE.flashWindows) {
      if (time >= flash.time && time <= flash.time + flash.length) {
        return flash;
      }
    }
    return null;
  }

  function drawTitleCenterText(text, color, size) {
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${size}px "Sora", "Inter", sans-serif`;
    ctx.fillText(text, WIDTH * 0.5, HEIGHT * 0.5);
    ctx.textAlign = "left";
  }

  function drawTitleFinalFrame() {
    const accent = accentColor("yellow");
    const panelX = 152;
    const panelY = 164;
    const panelW = WIDTH - 304;
    const panelH = HEIGHT - 268;

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 22);

    ctx.fillStyle = rgba(accent, 0.24);
    fillRoundRect(panelX + 24, panelY + 24, panelW - 48, 10, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = '700 58px "Sora", "Inter", sans-serif';
    ctx.fillText("AI POWER USERS", WIDTH * 0.5, panelY + 54);

    ctx.font = '700 24px "Inter", sans-serif';
    ctx.fillText("Codex 5.3 Tech Demo", WIDTH * 0.5, panelY + 130);

    ctx.font = '500 20px "Inter", sans-serif';
    drawWrappedText(
      "Follow one builder into the AI tooling rabbit hole, then emerge as an AI power user with repeatable workflows.",
      WIDTH * 0.5,
      panelY + 186,
      panelW - 96,
      30
    );

    const prompt = "Press Enter or Space to start";
    ctx.font = '700 18px "Inter", sans-serif';
    const promptWidth = ctx.measureText(prompt).width;
    ctx.fillStyle = rgba(accent, 0.26);
    fillRoundRect(WIDTH * 0.5 - promptWidth * 0.5 - 20, panelY + panelH - 68, promptWidth + 40, 38, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(WIDTH * 0.5 - promptWidth * 0.5 - 20, panelY + panelH - 68, promptWidth + 40, 38, 999);
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(prompt, WIDTH * 0.5, panelY + panelH - 58);

    ctx.textAlign = "left";
  }

  function drawBackdrop(accent) {
    ctx.fillStyle = TOKENS.fog;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawCornerMotif(28, 24, accent, true);
    drawCornerMotif(WIDTH - 210, HEIGHT - 130, accent, false);
  }

  function drawCorridor(floor, accent) {
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

    drawFloorSkin(floor, accent, wallLeft, wallRight);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, 18);

    ctx.fillStyle = rgba(accent, 0.35);
    fillRoundRect(WORLD.x + 18, WORLD.y - 10, WORLD.w - 36, 6, 999);

    ctx.fillStyle = rgba(accent, 0.35);
    fillRoundRect(WORLD.x + 18, WORLD.y + WORLD.h + 4, WORLD.w - 36, 6, 999);
  }

  function drawFloorSkin(floor, accent, wallLeft, wallRight) {
    const progress = game.floorDuration > 0 ? clamp(game.floorElapsed / game.floorDuration, 0, 1) : 0;

    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    ctx.strokeStyle = rgba(TOKENS.ink, 0.16);
    ctx.lineWidth = 1;
    for (let y = WORLD.y + 24; y < WORLD.y + WORLD.h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 14, y);
      ctx.lineTo(WORLD.x + WORLD.w - 14, y);
      ctx.stroke();
    }

    if (floor.id === 1) {
      drawMotifFlicker(accent);
      drawWordBlocks(accent);
    } else if (floor.id === 2) {
      drawTileToWoodTransition(accent, progress);
    } else if (floor.id === 3) {
      drawLoadingBars(accent);
      drawFloatingIcons(accent);
    } else if (floor.id === 4) {
      drawWaveBands(accent);
    } else if (floor.id === 5) {
      drawKitchenPanels(accent);
    } else if (floor.id === 6) {
      drawDoorLoop(accent);
    } else if (floor.id === 7) {
      drawCracksAndFrames(accent);
    } else if (floor.id === 8) {
      drawThresholdBands(accent, progress);
    } else if (floor.id === 9) {
      drawEvolutionDissolve(accent, progress);
    }

    ctx.restore();

    drawWallDecor(floor, accent, wallLeft, wallRight);
  }

  function drawMotifFlicker(accent) {
    for (let i = 0; i < 12; i += 1) {
      const y = WORLD.y + 12 + i * 40;
      const alpha = 0.08 + 0.1 * ((i + Math.floor(game.globalTime * 5)) % 2);
      ctx.fillStyle = rgba(accent, alpha);
      ctx.fillRect(WORLD.x + 12, y, 10, 3);
      ctx.fillRect(WORLD.x + WORLD.w - 22, y + 7, 10, 3);
    }
  }

  function drawWordBlocks(accent) {
    ctx.fillStyle = rgba(accent, 0.14);
    const step = 120;
    for (let x = WORLD.x + 32; x < WORLD.x + WORLD.w - 100; x += step) {
      fillRoundRect(x, WORLD.y + 40, 82, 22, 8);
    }

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '600 11px "Sora", "Inter", sans-serif';
    for (let x = WORLD.x + 40; x < WORLD.x + WORLD.w - 100; x += step) {
      ctx.fillText("AI", x, WORLD.y + 54);
    }
  }

  function drawTileToWoodTransition(accent, progress) {
    const transitionX = WORLD.x + WORLD.w * (0.35 + progress * 0.4);

    ctx.strokeStyle = rgba(TOKENS.ink, 0.18);
    for (let x = WORLD.x + 14; x < transitionX; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, WORLD.y + 12);
      ctx.lineTo(x, WORLD.y + WORLD.h - 12);
      ctx.stroke();
    }

    for (let y = WORLD.y + 14; y < WORLD.y + WORLD.h - 10; y += 22) {
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 10, y);
      ctx.lineTo(transitionX, y);
      ctx.stroke();
    }

    ctx.fillStyle = rgba(accent, 0.16);
    fillRoundRect(transitionX - 4, WORLD.y + 18, 8, WORLD.h - 36, 8);

    ctx.strokeStyle = rgba(TOKENS.ink, 0.16);
    for (let y = WORLD.y + 16; y < WORLD.y + WORLD.h - 12; y += 28) {
      ctx.beginPath();
      ctx.moveTo(transitionX + 8, y);
      ctx.lineTo(WORLD.x + WORLD.w - 12, y + 8);
      ctx.stroke();
    }
  }

  function drawLoadingBars(accent) {
    for (let i = 0; i < 7; i += 1) {
      const x = WORLD.x + 44 + i * 120;
      const y = WORLD.y + 38 + ((i % 2) * 26);
      const width = 74;
      ctx.fillStyle = rgba(TOKENS.ink, 0.08);
      fillRoundRect(x, y, width, 12, 999);
      ctx.fillStyle = rgba(accent, 0.35);
      fillRoundRect(x + 1, y + 1, (width - 2) * ((Math.sin(game.globalTime * 2.4 + i) + 1) * 0.5), 10, 999);
    }
  }

  function drawFloatingIcons(accent) {
    ctx.strokeStyle = rgba(accent, 0.45);
    ctx.lineWidth = 2;

    for (let i = 0; i < 18; i += 1) {
      const x = WORLD.x + 40 + ((i * 67) % (WORLD.w - 80));
      const y = WORLD.y + 110 + ((i * 49 + Math.floor(game.globalTime * 10)) % (WORLD.h - 150));
      const size = 8 + (i % 4);
      strokeRoundRect(x, y, size * 2, size * 2, 4);
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 5);
        ctx.lineTo(x + size + 4, y + size);
        ctx.lineTo(x + 5, y + size + 5);
        ctx.closePath();
        ctx.fillStyle = rgba(accent, 0.25);
        ctx.fill();
      }
    }
  }

  function drawWaveBands(accent) {
    ctx.strokeStyle = rgba(accent, 0.34);
    ctx.lineWidth = 2;

    for (let y = WORLD.y + 26; y < WORLD.y + WORLD.h - 20; y += 28) {
      ctx.beginPath();
      for (let x = WORLD.x + 8; x <= WORLD.x + WORLD.w - 8; x += 18) {
        const offset = Math.sin((x * 0.02) + y * 0.04 + game.globalTime * 3.2) * 6;
        if (x === WORLD.x + 8) {
          ctx.moveTo(x, y + offset);
        } else {
          ctx.lineTo(x, y + offset);
        }
      }
      ctx.stroke();
    }
  }

  function drawKitchenPanels(accent) {
    for (let i = 0; i < 14; i += 1) {
      const x = WORLD.x + 24 + i * 66;
      const panelH = 22 + ((i % 3) * 8);
      ctx.fillStyle = i % 2 === 0 ? rgba(accent, 0.12) : rgba(TOKENS.ink, 0.08);
      fillRoundRect(x, WORLD.y + WORLD.h - 40 - panelH, 48, panelH, 6);

      ctx.strokeStyle = rgba(TOKENS.ink, 0.2);
      ctx.strokeRect(x + 18, WORLD.y + 24, 12, 22);
      ctx.strokeRect(x + 14, WORLD.y + 46, 20, 4);
    }
  }

  function drawDoorLoop(accent) {
    for (let i = 0; i < 8; i += 1) {
      const y = WORLD.y + 18 + i * 60;
      const leftX = WORLD.x + 28 + (i % 2) * 7;
      const rightX = WORLD.x + WORLD.w - 66 - (i % 3) * 7;

      ctx.strokeStyle = rgba(TOKENS.ink, 0.3);
      strokeRoundRect(leftX, y, 40, 48, 8);
      strokeRoundRect(rightX, y + 8, 40, 48, 8);

      ctx.fillStyle = rgba(accent, 0.15);
      fillRoundRect(leftX + 5, y + 8, 7, 7, 999);
      fillRoundRect(rightX + 27, y + 16, 7, 7, 999);
    }
  }

  function drawCracksAndFrames(accent) {
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
      ctx.fillStyle = rgba(accent, 0.15);
      fillRoundRect(-30, -18, 60, 36, 8);
      ctx.strokeStyle = rgba(TOKENS.ink, 0.3);
      strokeRoundRect(-30, -18, 60, 36, 8);
      ctx.restore();
    }
  }

  function drawThresholdBands(accent, progress) {
    const top = WORLD.y;
    const oneThird = WORLD.h / 3;

    ctx.fillStyle = rgba(TOKENS.blue, 0.1 + (1 - progress) * 0.08);
    fillRoundRect(WORLD.x + 2, top + 2, WORLD.w - 4, oneThird - 2, 10);

    ctx.fillStyle = rgba(accent, 0.2 + progress * 0.08);
    fillRoundRect(WORLD.x + 2, top + oneThird + 2, WORLD.w - 4, oneThird - 2, 8);

    ctx.fillStyle = rgba(TOKENS.ink, 0.07 + progress * 0.1);
    fillRoundRect(WORLD.x + 2, top + oneThird * 2 + 2, WORLD.w - 4, oneThird - 4, 8);

    ctx.strokeStyle = rgba(TOKENS.ink, 0.18);
    for (let i = 0; i < 16; i += 1) {
      const y = WORLD.y + 16 + i * 28;
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 10, y);
      ctx.lineTo(WORLD.x + WORLD.w - 10, y + Math.sin(i + game.globalTime * 2) * 4);
      ctx.stroke();
    }
  }

  function drawEvolutionDissolve(accent, progress) {
    const splitY = WORLD.y + WORLD.h * 0.56;

    ctx.fillStyle = rgba(TOKENS.white, 0.6);
    fillRoundRect(WORLD.x + 2, splitY, WORLD.w - 4, WORLD.h - (splitY - WORLD.y) - 2, 8);

    ctx.fillStyle = rgba(accent, 0.12 + progress * 0.08);
    for (let i = 0; i < 45; i += 1) {
      const x = WORLD.x + ((i * 47 + game.floorElapsed * 22) % (WORLD.w - 20));
      const y = WORLD.y + ((i * 29) % Math.max(20, splitY - WORLD.y - 20));
      const s = 6 + (i % 4) * 2;
      fillRoundRect(x, y, s, s, 3);
    }

    ctx.strokeStyle = rgba(TOKENS.ink, 0.2);
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.moveTo(WORLD.x + 12 + i * 95, WORLD.y + 20);
      ctx.lineTo(WORLD.x + 26 + i * 95, WORLD.y + WORLD.h * 0.52);
      ctx.stroke();
    }
  }

  function drawWallDecor(floor, accent, wallLeft, wallRight) {
    const loops = 8;
    for (let i = 0; i < loops; i += 1) {
      const y = wallLeft.y + 22 + i * 58;
      const xL = wallLeft.x + 12;
      const xR = wallRight.x + 12;

      ctx.fillStyle = rgba(accent, 0.12);
      fillRoundRect(xL, y, wallLeft.w - 24, 18, 8);
      fillRoundRect(xR, y + ((i + floor.id) % 2) * 8, wallRight.w - 24, 18, 8);

      ctx.strokeStyle = rgba(TOKENS.ink, 0.3);
      strokeRoundRect(xL, y, wallLeft.w - 24, 18, 8);
      strokeRoundRect(xR, y + ((i + floor.id) % 2) * 8, wallRight.w - 24, 18, 8);
    }
  }

  function drawPickups(accent) {
    for (const pickup of pickups) {
      const bob = Math.sin(pickup.wobble) * 2;
      drawHeartIcon(pickup.x, pickup.y + bob, pickup.type, accent, 1);
    }
  }

  function drawBullets(accent) {
    ctx.fillStyle = accent;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;

    for (const bullet of bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = TOKENS.white;
    ctx.strokeStyle = TOKENS.ink;
    for (const bullet of enemyBullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = TOKENS.white;
    }
  }

  function drawEnemies(accent) {
    for (const enemy of enemies) {
      const alpha = enemy.hurtFlash > 0 ? 1 : 0.98;
      const body = enemy.hurtFlash > 0 ? TOKENS.white : rgba(accent, alpha);
      const outline = TOKENS.ink;

      ctx.fillStyle = body;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;

      const x = enemy.x;
      const y = enemy.y;
      const r = enemy.radius;

      if (enemy.type === "notification_swarm") {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 4);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 4);
        ctx.fillStyle = TOKENS.ink;
        ctx.fillRect(x - 3, y - 4, 6, 8);
      } else if (enemy.type === "speaker_wraith") {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 8);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 8);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      } else if (enemy.type === "chair_knight") {
        fillRoundRect(x - r, y - r, r * 2, r * 2, 6);
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 6);
        ctx.strokeRect(x - r * 0.55, y - r * 1.15, r * 1.1, r * 0.45);
      } else if (enemy.type === "reach_shadow") {
        ctx.fillStyle = rgba(TOKENS.ink, 0.85);
        fillRoundRect(x - r, y - r, r * 2, r * 2, 999);
        ctx.strokeStyle = TOKENS.white;
        ctx.strokeRect(x - 4, y - 4, 8, 8);
      } else if (enemy.type === "double") {
        ctx.fillStyle = TOKENS.ink;
        fillRoundRect(x - r, y - r, r * 2, r * 2, 8);
        ctx.strokeStyle = accent;
        strokeRoundRect(x - r, y - r, r * 2, r * 2, 8);
      } else if (enemy.type.includes("rabbit")) {
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

  function drawPlayer(accent) {
    const blink = player.invuln > 0 && Math.floor(game.globalTime * 24) % 2 === 0;
    if (blink) {
      return;
    }

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

    ctx.fillStyle = TOKENS.yellow;
    ctx.beginPath();
    ctx.arc(x, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = TOKENS.ink;
    ctx.stroke();

    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(x - 5, headY - 3, 2, 2);
    ctx.fillRect(x + 3, headY - 3, 2, 2);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x - 4, headY - 1, 6, Math.PI * 1.25, Math.PI * 0.1, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 4, headY + 1, 5.5, Math.PI * 1.1, Math.PI * 0.1, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, headY + 4, 6, Math.PI * 1.05, Math.PI * 2, false);
    ctx.stroke();

    const aimX = player.lastAimX;
    const aimY = player.lastAimY;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + aimX * 14, y + aimY * 14 - 3);
    ctx.stroke();
  }

  function drawParticles() {
    for (const particle of particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = rgba(particle.color, alpha);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
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
    ctx.fillText("HP", 92, 52);

    if (player.shieldCharges > 0) {
      const shieldX = 252;
      const shieldY = 36;
      ctx.fillStyle = rgba(accentColor("blue"), 0.22);
      fillRoundRect(shieldX, shieldY, 118, 30, 999);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(shieldX, shieldY, 118, 30, 999);

      ctx.fillStyle = TOKENS.ink;
      ctx.font = '700 14px "Inter", sans-serif';
      ctx.fillText(`Shield ${player.shieldCharges}`, shieldX + 14, shieldY + 18);
    }

    const floorLabel = `Floor ${floor.id} / 9`;
    ctx.font = '700 20px "Sora", "Inter", sans-serif';
    const floorLabelWidth = ctx.measureText(floorLabel).width;
    const centerX = WIDTH * 0.5 - floorLabelWidth * 0.5;

    ctx.fillStyle = rgba(accent, 0.28);
    fillRoundRect(centerX - 14, 34, floorLabelWidth + 28, 36, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(centerX - 14, 34, floorLabelWidth + 28, 36, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(floorLabel, centerX, 52);

    const timerText = `${Math.ceil(game.floorTimer)}s`;
    const timerBoxX = WIDTH - 370;
    const timerBoxY = 33;
    const timerW = 250;
    const timerH = 30;

    ctx.font = '700 14px "Inter", sans-serif';
    ctx.fillText("Survive", timerBoxX, 27);

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

    drawUpgradeHudPanel(accent);
  }

  function drawUpgradeHudPanel(accent) {
    const rows = getUpgradeHudRows(5);
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
    ctx.fillText("Upgrades", panelX + 14, panelY + 20);

    ctx.font = '600 13px "Inter", sans-serif';
    for (let i = 0; i < rows.length; i += 1) {
      ctx.fillText(rows[i], panelX + 14, panelY + 41 + i * 19);
    }
  }

  function drawStateOverlay(floor, accent) {
    if (game.state === GameState.PLAYING || game.state === GameState.TITLE || game.state === GameState.UPGRADE_SELECT) {
      return;
    }

    if (game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) {
      drawRunSummaryOverlay(floor, accent);
      return;
    }

    let title = "";
    let body = "";
    let footer = "";

    if (game.state === GameState.FLOOR_INTRO) {
      title = floor.overlayTitle;
      body = floor.overlaySubtitle;
      footer = "Press Enter to skip intro";
    } else if (game.state === GameState.FLOOR_CLEAR) {
      title = `Floor ${floor.id} Survived`;
      body = floor.id < 9 ? "The corridor shifts. Hold your shape for the next chapter." : "The hallway finally releases its grip.";
      footer = floor.id < 9 ? "Transitioning..." : "";
    }

    const panelW = 760;
    const panelH = 220;
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;

    ctx.fillStyle = rgba(TOKENS.white, 0.94);
    fillRoundRect(panelX, panelY, panelW, panelH, 20);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 20);

    ctx.fillStyle = rgba(accent, 0.2);
    fillRoundRect(panelX + 18, panelY + 18, panelW - 36, 10, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    ctx.font = '700 30px "Sora", "Inter", sans-serif';
    ctx.fillText(title, WIDTH * 0.5, panelY + 44);

    ctx.font = '500 20px "Inter", sans-serif';
    drawWrappedText(body, WIDTH * 0.5, panelY + 96, panelW - 80, 30);

    if (footer) {
      ctx.font = '700 16px "Inter", sans-serif';
      ctx.fillText(footer, WIDTH * 0.5, panelY + panelH - 38);
    }

    ctx.textAlign = "left";
  }

  function drawRunSummaryOverlay(floor, accent) {
    const isVictory = game.state === GameState.VICTORY;
    const title = isVictory ? "Run Complete" : "Run Failed";
    const body = isVictory
      ? "You completed the AI tooling climb and finalized a stable build."
      : "The run ended before the build fully stabilized.";
    const footer = "Press R to restart";
    const floorsCleared = getFloorsClearedCount();
    const totalTaken = upgradeState.history.length;
    const buildEntries = getRunBuildEntries();

    const panelW = 920;
    const panelH = 460;
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;

    ctx.fillStyle = rgba(TOKENS.white, 0.96);
    fillRoundRect(panelX, panelY, panelW, panelH, 20);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 20);

    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 20, panelY + 20, panelW - 40, 10, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = '700 36px "Sora", "Inter", sans-serif';
    ctx.fillText(title, WIDTH * 0.5, panelY + 44);

    ctx.font = '500 20px "Inter", sans-serif';
    drawWrappedText(body, WIDTH * 0.5, panelY + 94, panelW - 70, 30);
    ctx.textAlign = "left";

    const pillY = panelY + 142;
    const pillW = 212;
    const pillH = 40;

    ctx.fillStyle = rgba(accent, 0.18);
    fillRoundRect(panelX + 48, pillY, pillW, pillH, 999);
    fillRoundRect(panelX + 286, pillY, pillW, pillH, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(panelX + 48, pillY, pillW, pillH, 999);
    strokeRoundRect(panelX + 286, pillY, pillW, pillH, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 17px "Inter", sans-serif';
    ctx.fillText(`Floors cleared: ${floorsCleared}`, panelX + 68, pillY + 11);
    ctx.fillText(`Upgrades taken: ${totalTaken}`, panelX + 305, pillY + 11);

    const listX = panelX + 48;
    const listY = panelY + 208;
    const listW = panelW - 96;
    const listH = panelH - 292;

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(listX, listY, listW, listH, 14);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(listX, listY, listW, listH, 14);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 20px "Sora", "Inter", sans-serif';
    ctx.fillText("Run build", listX + 16, listY + 12);

    if (buildEntries.length === 0) {
      ctx.font = '600 16px "Inter", sans-serif';
      ctx.fillText("No upgrades collected.", listX + 16, listY + 50);
    } else {
      const columns = 2;
      const colGap = 24;
      const colW = Math.floor((listW - 32 - colGap) / columns);
      const rowH = 28;
      const maxRows = Math.floor((listH - 52) / rowH);

      ctx.font = '600 15px "Inter", sans-serif';
      for (let i = 0; i < buildEntries.length; i += 1) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        if (row >= maxRows) {
          const remaining = buildEntries.length - i;
          ctx.fillText(`+${remaining} more`, listX + 16 + col * (colW + colGap), listY + 50 + row * rowH);
          break;
        }

        const entry = buildEntries[i];
        const label = `${i + 1}. ${entry.def.name} x${entry.stack}`;
        ctx.fillText(label, listX + 16 + col * (colW + colGap), listY + 50 + row * rowH);
      }
    }

    ctx.textAlign = "center";
    ctx.font = '700 16px "Inter", sans-serif';
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(footer, WIDTH * 0.5, panelY + panelH - 36);

    ctx.textAlign = "left";
  }

  function drawHeartIcon(x, y, type, accent, fillRatio) {
    const size = 18;
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

  function drawCornerMotif(x, y, accent, flip) {
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

    ctx.fillStyle = rgba(accent, 0.26);
    fillRoundRect(x + 68, y + 20, 98, 18, 999);
    fillRoundRect(x + 105, y + 52, 61, 13, 999);

    ctx.restore();
  }

  function drawWrappedText(text, centerX, startY, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let y = startY;

    for (let i = 0; i < words.length; i += 1) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, centerX, y);
        line = words[i];
        y += lineHeight;
      } else {
        line = test;
      }
    }

    if (line) {
      ctx.fillText(line, centerX, y);
    }

    return y + lineHeight;
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

  function currentAccent() {
    return accentColor(currentFloor().accent);
  }

  function accentColor(name) {
    if (name === "yellow") return TOKENS.yellow;
    if (name === "blue") return TOKENS.blue;
    if (name === "mint") return TOKENS.mint;
    if (name === "pink") return TOKENS.pink;
    return TOKENS.blue;
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
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

  function isMoveUp() {
    return !!(keys.w || keys.W);
  }

  function isMoveLeft() {
    return !!(keys.a || keys.A);
  }

  function isMoveDown() {
    return !!(keys.s || keys.S);
  }

  function isMoveRight() {
    return !!(keys.d || keys.D);
  }

  function arrowKeyToVector(keyName) {
    if (keyName === "ArrowUp") return { x: 0, y: -1 };
    if (keyName === "ArrowDown") return { x: 0, y: 1 };
    if (keyName === "ArrowLeft") return { x: -1, y: 0 };
    if (keyName === "ArrowRight") return { x: 1, y: 0 };
    return { x: 0, y: -1 };
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

  function getUpgradeCardIndexAt(x, y) {
    for (let i = 0; i < game.upgradeCardRects.length; i += 1) {
      if (pointInRect(x, y, game.upgradeCardRects[i])) {
        return i;
      }
    }
    return -1;
  }

  function getMouseCanvasPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function unitVector(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
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

  let lastTimestamp = performance.now();

  function frame(now) {
    const dt = (now - lastTimestamp) / 1000;
    lastTimestamp = now;

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  toTitle();
  requestAnimationFrame(frame);
})();
