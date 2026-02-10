(() => {
  "use strict";

  const AIPU = window.AIPU;
  const { canvas, overlayRestartBtn } = AIPU.dom;
  const { TOKENS, GameState, WORLD, BASE_MAX_HP } = AIPU.constants;
  const { game, player } = AIPU.state;
  const { keys } = AIPU.input;
  const { FLOORS, ENEMY_DEFS } = AIPU.content;
  const upgrades = AIPU.upgrades;
  const { shareUI, resolveShareUrl, buildShareCopy, buildRunCardDataUrl } = AIPU.share;
  const {
    clamp,
    lerp,
    approach,
    randomFrom,
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

  function isShareModalOpen() {
    return !!shareUI && shareUI.isOpen();
  }

  function clearInputState() {
    for (const key in keys) {
      if (Object.prototype.hasOwnProperty.call(keys, key)) {
        keys[key] = false;
      }
    }
  }

  window.addEventListener("keydown", (event) => {
    keys[event.key] = true;

    if (event.key.startsWith("Arrow")) {
      AIPU.input.lastShootKey = event.key;
    }

    if (event.key === "`" || event.key === "~") {
      game.showDebugStats = !game.showDebugStats;
      return;
    }

    if (isShareModalOpen()) {
      return;
    }

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

    const lower = event.key.toLowerCase();
    if (game.state === GameState.TITLE && (event.key === " " || event.key === "Enter")) {
      if (AIPU.render && typeof AIPU.render.isTitleSequenceComplete === "function" && AIPU.render.isTitleSequenceComplete()) {
        startRun();
      } else {
        game.titleIntroTime = AIPU.content.TITLE_SEQUENCE.finish;
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
      requestRestart();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.key] = false;
  });

  window.addEventListener("blur", () => {
    clearInputState();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInputState();
    }
  });

  canvas.addEventListener("mousemove", (event) => {
    if (game.state !== GameState.UPGRADE_SELECT || isShareModalOpen()) {
      return;
    }

    const mouse = getMouseCanvasPosition(event);
    const hoverIndex = getUpgradeCardIndexAt(mouse.x, mouse.y);
    if (hoverIndex >= 0) {
      game.upgradeSelectedIndex = hoverIndex;
    }
  });

  canvas.addEventListener("click", (event) => {
    if (game.state !== GameState.UPGRADE_SELECT || isShareModalOpen()) {
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
      enterGameOver(floorSnapshot);
      return;
    }

    death.t += dt;
    death.shake = death.t < 0.25 ? 5.2 * (1 - death.t / 0.25) : 0;

    if (death.t >= death.duration) {
      death.shake = 0;
      enterGameOver(floorSnapshot);
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
    const floorLabel = `Floor ${floorId} of ${maxFloors}`;
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
    game.floorFallbackInvulnBonus = 0;
    game.gameOverEntryHandled = false;
    upgrades.invalidateDerivedStats();
    shareUI.close({ persistChoice: false, restoreFocus: false });
    resetDeathAnim();
    upgrades.resetUpgradeRun();
    resetCollections();
    player.maxHearts = AIPU.constants.BASE_MAX_HP;
    player.hearts = AIPU.constants.BASE_MAX_HP;
    player.shieldCharges = 0;
    player.shieldBreakFlash = 0;
    resetPlayerPosition();
  }

  function startRun() {
    game.kills = 0;
    game.gameOverEntryHandled = false;
    upgrades.resetUpgradeRun();
    startFloor(0);
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
    game.state = GameState.UPGRADE_SELECT;

    resetCollections();

    game.upgradeOptions = upgrades.rollUpgradeOptions(index, 3);
    game.upgradeSelectedIndex = 0;
    game.upgradeConfirmCooldown = 0;
    game.upgradeNoticeTimer = 0;
    game.upgradeCardRects = [];
    game.floorFallbackInvulnBonus = 0;
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

    const bulletSpeed = upgrades.getBulletSpeed();
    const bulletRadius = upgrades.getBulletRadius();
    const bulletPierce = upgrades.getBulletPierce();
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

    player.fireCooldown = upgrades.getFireCooldown();
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
    const speedMultiplier = upgrades.getEnemyBulletSpeedMultiplier();
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
      emitBurst(player.x, player.y, accentColor("blue"), 10, 175);
      return;
    }

    player.hearts = clamp(player.hearts - amount, 0, player.maxHearts);
    if (player.hearts <= 0) {
      player.hearts = 0;
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
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vx *= 0.9;
      particle.vy *= 0.9;
    }
    particles = particles.filter((p) => p.life > 0);
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
    const result = upgrades.applyUpgradeChoice(option);
    if (!result) {
      game.upgradeNoticeTimer = 1.2;
      return;
    }

    if (result.type === "fallback") {
      console.log(`[upgrade] floor ${currentFloor().id}: picked ${option.name} (${result.effectText})`);
    } else {
      console.log(`[upgrade] floor ${currentFloor().id}: picked ${option.name} (stack ${result.newStack}/${result.maxStacks})`);
    }

    game.upgradeConfirmCooldown = 0.18;
    game.upgradeNoticeTimer = 0;
    beginCurrentFloor();
  }

  AIPU.systems = {
    currentFloor,
    getCollections,
    resetCollections,
    getUpgradeCardIndexAt,
    startDeathAnim,
    updateDeathAnim,
    getDeathShakeOffset,
    getShareRunData,
    enterGameOver,
    requestRestart,
    syncOverlayRestartButton,
    toTitle,
    startRun,
    startFloor,
    beginCurrentFloor,
    update,
    updateGameplay,
    emitBurst
  };
})();
