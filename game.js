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

  const keys = Object.create(null);
  let lastShootKey = "ArrowUp";

  window.addEventListener("keydown", (event) => {
    keys[event.key] = true;

    if (
      event.key === " " ||
      event.key.startsWith("Arrow") ||
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
      startRun();
    } else if (game.state === GameState.FLOOR_INTRO && (event.key === " " || event.key === "Enter")) {
      game.introTimer = 0;
    } else if ((game.state === GameState.GAME_OVER || game.state === GameState.VICTORY) && lower === "r") {
      toTitle();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.key] = false;
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
      overlayTitle: "Floor 1 - Invocation Corridor",
      overlaySubtitle: "WONDERLAND pulses in the walls. The hallway waits for a verdict.",
      heartType: "anchor",
      heartSpawn: { initialCount: 2, baseRate: 0.1, clutchBoostStart: 10 },
      enemyWaves: [
        wave("death_echo", 0, 48, 0.55, 1.15, 0.92, 1.18),
        wave("death_echo", 28, 48, 0.2, 0.55, 1.0, 1.2, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 2,
      name: "Bathroom Run",
      durationSeconds: 52,
      accent: "blue",
      overlayTitle: "Floor 2 - Bathroom Run",
      overlaySubtitle: "The rabbit lives in your peripheral vision. The bedroom lies.",
      heartType: "refuge",
      heartSpawn: { initialCount: 2, baseRate: 0.1, clutchBoostStart: 9 },
      enemyWaves: [
        wave("rabbit_glimpse", 0, 52, 0.6, 1.35, 0.95, 1.28),
        wave("death_echo", 8, 30, 0.15, 0.5, 1.0, 1.2),
        wave("rabbit_glimpse", 35, 52, 0.7, 1.55, 1.08, 1.36, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 3,
      name: "Glitch Feed",
      durationSeconds: 56,
      accent: "mint",
      overlayTitle: "Floor 3 - Glitch Feed",
      overlaySubtitle: "Your name stutters on the screen while danger keeps refreshing.",
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
      name: "Distortion Lane",
      durationSeconds: 60,
      accent: "pink",
      overlayTitle: "Floor 4 - Distortion Lane",
      overlaySubtitle: "Every step upward makes the corridor hum louder.",
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
      name: "Kitchen Crawl",
      durationSeconds: 64,
      accent: "yellow",
      overlayTitle: "Floor 5 - Kitchen Crawl",
      overlaySubtitle: "Every chair looks pre-arranged for your panic.",
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
      name: "First Loop",
      durationSeconds: 70,
      accent: "blue",
      overlayTitle: "Floor 6 - First Loop",
      overlaySubtitle: "You pass the same door again. The blood is older than memory.",
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
      name: "Mirror March",
      durationSeconds: 76,
      accent: "mint",
      overlayTitle: "Floor 7 - Mirror March",
      overlaySubtitle: "Something ahead dodges exactly like you.",
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
      name: "Threshold Cut",
      durationSeconds: 84,
      accent: "pink",
      overlayTitle: "Floor 8 - Threshold Cut",
      overlaySubtitle: "Cells wake up while the machete picks its landing.",
      heartType: "bloom",
      heartSpawn: { initialCount: 1, baseRate: 0.075, clutchBoostStart: 16 },
      enemyWaves: [
        wave("machete_rabbit", 0, 84, 0.22, 0.72, 1.0, 1.24),
        wave("cell_blob", 8, 84, 0.45, 1.1, 0.95, 1.26, ["canSplit"]),
        wave("speaker_wraith", 28, 84, 0.2, 0.62, 1.05, 1.3)
      ]
    },
    {
      id: 9,
      name: "Evolution Corridor",
      durationSeconds: 92,
      accent: "yellow",
      overlayTitle: "Floor 9 - Evolution Corridor",
      overlaySubtitle: "You wake in your own hallway. The rabbit stays.",
      heartType: "final",
      heartSpawn: { initialCount: 1, baseRate: 0.07, clutchBoostStart: 18 },
      enemyWaves: [
        wave("choke_shadow", 0, 92, 0.35, 0.92, 1.0, 1.22),
        wave("evolution_rabbit", 8, 92, 0.09, 0.22, 1.0, 1.14),
        wave("decay_mote", 30, 92, 0.45, 1.45, 1.05, 1.36),
        wave("loop_ghost", 42, 92, 0.22, 0.72, 1.08, 1.34, ["spawnsBehindPlayer"])
      ]
    }
  ];

  const CHAPTER_ONE_INTRO = {
    title: "Chapter 1. Title / Invocation",
    sections: [
      {
        heading: "Narrative",
        bullets: [
          "Black screen.",
          'Text on black: "WONDERLAND" for 1 second, then black again.',
          'Uneven strobe montage: color flashes with "WONDERLAND" each hit.',
          "Audio: silence to low drone under strobe, then cut to silence."
        ]
      },
      {
        heading: "Technical",
        bullets: [
          "Build strobe in edit with text layers plus color flashes.",
          "Use one white text frame for 1 second, then black, then strobe.",
          "Layer a low drone and automate volume spikes with each flash."
        ]
      },
      {
        heading: "Audience Impact",
        bullets: [
          "Priming ritual: visual assault seizes attention. Silence after strobe increases expectancy."
        ]
      }
    ]
  };

  const ENEMY_DEFS = {
    death_echo: { hp: 2, size: 15, speed: 82, behavior: "chase", touchDamage: 1 },
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
    machete_rabbit: { hp: 6, size: 17, speed: 126, behavior: "charge", touchDamage: 2 },
    cell_blob: { hp: 2, size: 11, speed: 88, behavior: "blob", touchDamage: 1 },
    choke_shadow: { hp: 3, size: 13, speed: 0, behavior: "wallhand", touchDamage: 2 },
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
    beatCount: 0
  };

  const player = {
    x: WORLD.x + WORLD.w * 0.5,
    y: WORLD.y + WORLD.h * 0.84,
    vx: 0,
    vy: 0,
    radius: 14,
    maxHearts: 3,
    hearts: 3,
    invuln: 0,
    fireCooldown: 0,
    lastAimX: 0,
    lastAimY: -1
  };

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
    bullets = [];
    enemyBullets = [];
    enemies = [];
    pickups = [];
    particles = [];
    player.hearts = player.maxHearts;
    resetPlayerPosition();
  }

  function startRun() {
    game.kills = 0;
    startFloor(0);
  }

  function startFloor(index) {
    game.currentFloorIndex = index;
    const floor = currentFloor();

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

    player.hearts = player.maxHearts;
    player.invuln = 0;
    player.fireCooldown = 0;
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

    updateParticles(dt);

    if (game.state === GameState.TITLE) {
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
    const targetX = (moveX / length) * 238;
    const targetY = (moveY / length) * 238;

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

    const bulletSpeed = 528;
    bullets.push({
      x: player.x + dir.x * (player.radius + 9),
      y: player.y + dir.y * (player.radius + 9),
      vx: dir.x * bulletSpeed,
      vy: dir.y * bulletSpeed,
      radius: 4,
      life: 0.95
    });

    player.fireCooldown = 0.14;
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
    if (enemyType === "choke_shadow") {
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
    enemyBullets.push({
      x,
      y,
      vx: dirX * speed,
      vy: dirY * speed,
      damage,
      radius: 6,
      life: 2.3
    });
  }

  function updatePickups(dt) {
    for (const pickup of pickups) {
      pickup.wobble += dt * 2.2;
    }
  }

  function handleCollisions() {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      let hitIndex = -1;

      for (let j = 0; j < enemies.length; j += 1) {
        if (circleHit(bullet.x, bullet.y, bullet.radius, enemies[j].x, enemies[j].y, enemies[j].radius)) {
          hitIndex = j;
          break;
        }
      }

      if (hitIndex >= 0) {
        const enemy = enemies[hitIndex];
        enemy.hp -= 1;
        enemy.hurtFlash = 1;
        bullets.splice(i, 1);
        emitBurst(enemy.x, enemy.y, currentAccent(), 7, 145);

        if (enemy.hp <= 0) {
          onEnemyDefeated(enemy);
          enemies.splice(hitIndex, 1);
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

    player.hearts -= amount;
    player.invuln = 0.9;

    const away = unitVector(player.x - sourceX, player.y - sourceY);
    player.x += away.x * 18;
    player.y += away.y * 18;
    player.x = clamp(player.x, WORLD.x + player.radius, WORLD.x + WORLD.w - player.radius);
    player.y = clamp(player.y, WORLD.y + player.radius, WORLD.y + WORLD.h - player.radius);

    emitBurst(player.x, player.y, TOKENS.white, 14, 200);

    if (player.hearts <= 0) {
      player.hearts = 0;
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
    const accent = game.state === GameState.TITLE ? accentColor("blue") : accentColor(floor.accent);

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBackdrop(accent);
    if (game.state !== GameState.TITLE) {
      drawCorridor(floor, accent);

      drawPickups(accent);
      drawBullets(accent);
      drawEnemies(accent);
      drawPlayer(accent);
      drawParticles();

      drawHud(floor, accent);
    }
    drawStateOverlay(floor, accent);
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
      ctx.fillText("WONDER", x, WORLD.y + 54);
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
      } else if (enemy.type === "choke_shadow") {
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

    ctx.fillStyle = TOKENS.white;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;

    fillRoundRect(x - player.radius, y - player.radius, player.radius * 2, player.radius * 2, 10);
    strokeRoundRect(x - player.radius, y - player.radius, player.radius * 2, player.radius * 2, 10);

    ctx.fillStyle = accent;
    fillRoundRect(x - player.radius + 3, y - player.radius + 3, player.radius * 2 - 6, player.radius * 2 - 6, 8);

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(x - 6, y - player.radius - 9, 12, 10, 5);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(x - 6, y - player.radius - 9, 12, 10, 5);

    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(x - 4, y - player.radius - 5, 2, 2);
    ctx.fillRect(x + 2, y - player.radius - 5, 2, 2);

    const aimX = player.lastAimX;
    const aimY = player.lastAimY;
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + aimX * 14, y + aimY * 14);
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
  }

  function drawStateOverlay(floor, accent) {
    if (game.state === GameState.PLAYING) {
      return;
    }

    if (game.state === GameState.TITLE) {
      drawChapterOneIntroCard(accent);
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
    } else if (game.state === GameState.GAME_OVER) {
      title = "Run Failed";
      body = "The corridor closed before the climb was complete.";
      footer = "Press R to restart";
    } else if (game.state === GameState.VICTORY) {
      title = "Run Complete";
      body = "You survived all nine floors of Wonderland's timeline.";
      footer = "Press R to play again";
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

  function drawChapterOneIntroCard(accent) {
    const panelX = 96;
    const panelY = 62;
    const panelW = WIDTH - 192;
    const panelH = HEIGHT - 124;

    ctx.save();

    ctx.fillStyle = TOKENS.white;
    fillRoundRect(panelX, panelY, panelW, panelH, 22);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(panelX, panelY, panelW, panelH, 22);

    ctx.strokeStyle = rgba(TOKENS.ink, 0.24);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(panelX + 24, panelY + 26);
    ctx.lineTo(panelX + panelW - 24, panelY + 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(panelX + 24, panelY + panelH - 26);
    ctx.lineTo(panelX + panelW - 24, panelY + panelH - 26);
    ctx.stroke();

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 52px "Sora", "Inter", sans-serif';
    ctx.textBaseline = "top";
    ctx.fillText(CHAPTER_ONE_INTRO.title, panelX + 44, panelY + 44);

    drawChapterIcon(panelX + panelW - 136, panelY + 48, accent);

    let cursorY = panelY + 132;
    const contentX = panelX + 44;
    const contentW = panelW - 88;

    for (const section of CHAPTER_ONE_INTRO.sections) {
      cursorY = drawChapterSection(section, contentX, cursorY, contentW, accent);
      cursorY += 8;
    }

    const promptText = "Press Enter or Space to begin";
    ctx.font = '700 18px "Inter", sans-serif';
    const promptWidth = ctx.measureText(promptText).width;
    const promptX = panelX + panelW - promptWidth - 82;
    const promptY = panelY + panelH - 62;

    ctx.fillStyle = rgba(accent, 0.24);
    fillRoundRect(promptX - 18, promptY - 6, promptWidth + 36, 34, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(promptX - 18, promptY - 6, promptWidth + 36, 34, 999);
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(promptText, promptX, promptY);

    ctx.restore();
  }

  function drawChapterIcon(x, y, accent) {
    ctx.save();
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, 76, 46);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x + 9, y + 40, 31, Math.PI * 1.5, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 9, y + 40, 23, Math.PI * 1.5, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 9, y + 40, 15, Math.PI * 1.5, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawChapterSection(section, x, y, width, accent) {
    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 34px "Sora", "Inter", sans-serif';
    ctx.fillText(section.heading, x, y);

    ctx.font = '500 19px "Inter", sans-serif';
    let cursorY = y + 42;

    for (const bullet of section.bullets) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + 9, cursorY + 12, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = TOKENS.ink;
      cursorY = drawWrappedText(bullet, x + 24, cursorY, width - 24, 28) + 4;
    }

    return cursorY + 8;
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
