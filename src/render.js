(() => {
  "use strict";

  const AIPU = window.AIPU;
  const ctx = AIPU.ctx;
  const { TOKENS, GameState, WIDTH, HEIGHT, CORRIDOR, WALL_WIDTH, WORLD } = AIPU.constants;
  const { game, player } = AIPU.state;
  const { FLOORS, TITLE_SEQUENCE, getNarrativeTitleCard, getNarrativeFloorCopy, getNarrativeOutcomeCopy, getThreatGlossaryRows } =
    AIPU.content;
  const upgrades = AIPU.upgrades;
  const systems = AIPU.systems;
  const { clamp, easeOutCubic, easeInOutSine, rgba, accentColor } = AIPU.utils;

  let activeWaves = [];
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let pickups = [];
  let particles = [];

  function syncCollections() {
    const c = systems.getCollections();
    activeWaves = c.activeWaves;
    bullets = c.bullets;
    enemyBullets = c.enemyBullets;
    enemies = c.enemies;
    pickups = c.pickups;
    particles = c.particles;
  }

  function draw() {
    syncCollections();

    const floor = FLOORS[game.currentFloorIndex] || FLOORS[0];
    const accent = accentColor(floor.accent);
    const deathShake = game.state === GameState.DEATH_ANIM ? systems.getDeathShakeOffset() : null;
    systems.syncOverlayRestartButton();

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

    if (deathShake) {
      ctx.save();
      ctx.translate(deathShake.x, deathShake.y);
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

    if (deathShake) {
      ctx.restore();
    }

    if (game.state === GameState.DEATH_ANIM) {
      drawDeathAnim();
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

    const floorCopy = getNarrativeFloorCopy(floor);

    ctx.fillStyle = TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.font = '700 38px "Sora", "Inter", sans-serif';
    ctx.fillText(floorCopy.title, panelX + 34, panelY + 50);

    ctx.font = '500 20px "Inter", sans-serif';
    drawWrappedText(floorCopy.subtitle, panelX + 34, panelY + 104, panelW - 68, 30);

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
    const isStackless = !!option.stackless || !!option.fallbackBaseId;
    const stack = isStackless ? 0 : upgrades.getStack(option.id);
    const nextStack = isStackless ? 0 : Math.min(stack + 1, option.maxStacks);
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
    if (isStackless) {
      ctx.fillText("Instant effect (no stacks)", rect.x + 16, rect.y + rect.h - 42);
    } else {
      ctx.fillText(`Stacks: ${stack} -> ${nextStack}`, rect.x + 16, rect.y + rect.h - 42);
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

    ctx.save();
    ctx.globalAlpha = clamp(panelAlpha, 0, 1);

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
    ctx.fillText(titleCard.gameTitle, WIDTH * 0.5, panelY + 54 + (1 - panelAppear) * 8);

    ctx.font = '700 24px "Inter", sans-serif';
    ctx.fillText(titleCard.tagline, WIDTH * 0.5, panelY + 130 + (1 - panelAppear) * 6);

    ctx.font = '500 20px "Inter", sans-serif';
    let blurbY = panelY + 186 + (1 - panelAppear) * 4;
    for (let i = 0; i < titleCard.blurbLines.length; i += 1) {
      blurbY = drawWrappedText(titleCard.blurbLines[i], WIDTH * 0.5, blurbY, panelW - 96, 30);
    }

    const prompt = "Press Enter or Space to start";
    ctx.font = '700 18px "Inter", sans-serif';
    const promptWidth = ctx.measureText(prompt).width;
    ctx.fillStyle = rgba(accent, 0.2 + clamp(promptAlpha, 0, 1) * 0.18);
    fillRoundRect(WIDTH * 0.5 - promptWidth * 0.5 - 20, panelY + panelH - 68, promptWidth + 40, 38, 999);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(WIDTH * 0.5 - promptWidth * 0.5 - 20, panelY + panelH - 68, promptWidth + 40, 38, 999);

    ctx.save();
    ctx.globalAlpha = animatePrompt ? clamp(promptAlpha, 0.65, 1) : 1;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(prompt, WIDTH * 0.5, panelY + panelH - 58);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.restore();
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
        const offset = Math.sin(x * 0.02 + y * 0.04 + game.globalTime * 3.2) * 6;
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
      const panelH = 22 + (i % 3) * 8;
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
    drawDebugStatsLine(accent);
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
    ctx.fillText("Upgrades", panelX + 14, panelY + 20);

    ctx.font = '600 13px "Inter", sans-serif';
    for (let i = 0; i < rows.length; i += 1) {
      ctx.fillText(rows[i], panelX + 14, panelY + 41 + i * 19);
    }
  }

  function drawDebugStatsLine(accent) {
    if (!game.showDebugStats) {
      return;
    }

    const stats = upgrades.computeDerivedStats();
    const speed = AIPU.constants.BASE_PLAYER_SPEED * stats.moveSpeedMult;
    const cooldown = AIPU.constants.BASE_FIRE_COOLDOWN * stats.fireCooldownMult;
    const bulletRadius = AIPU.constants.BASE_BULLET_RADIUS * stats.bulletRadiusMult;
    const enemyBulletMult = stats.enemyBulletSpeedMult;
    const invuln = upgrades.getInvulnDuration();
    const debugText =
      `dbg speed ${speed.toFixed(0)} | cooldown ${cooldown.toFixed(3)} | radius ${bulletRadius.toFixed(2)} | ` +
      `enemyBullet ${enemyBulletMult.toFixed(2)} | iFrames ${invuln.toFixed(2)}`;

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
      footer = "Press Enter to skip intro";
    } else if (game.state === GameState.FLOOR_CLEAR) {
      title = `Floor ${floor.id} Survived`;
      body = floor.id < 9 ? "Hold shape. Next floor in 2 seconds." : "Final floor cleared.";
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
    const outcomeCopy = getNarrativeOutcomeCopy(isVictory);
    const title = outcomeCopy.title;
    const body = outcomeCopy.subtitle;
    const footer = "Press R to restart";
    const floorsCleared = upgrades.getFloorsClearedCount();
    const totalTaken = upgrades.upgradeState.history.length;
    const buildEntries = upgrades.getRunBuildEntries();

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

    const sectionGap = 24;
    const sectionW = Math.floor((listW - 32 - sectionGap) / 2);
    const runSectionX = listX + 16;
    const glossarySectionX = runSectionX + sectionW + sectionGap;
    const contentTop = listY + 12;
    const rowsTop = listY + 50;
    const rowH = 24;
    const maxRows = Math.max(1, Math.floor((listH - 56) / rowH));
    const namesOnlyGlossary = sectionW < 290;
    const glossaryRows = getThreatGlossaryRows(6, namesOnlyGlossary).slice(0, 4);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 20px "Sora", "Inter", sans-serif';
    ctx.fillText("Run build", runSectionX, contentTop);
    ctx.fillText("Threat glossary", glossarySectionX, contentTop);

    ctx.font = '600 15px "Inter", sans-serif';
    if (buildEntries.length === 0) {
      ctx.fillText("No upgrades collected.", runSectionX, rowsTop);
    } else {
      const visibleBuildRows = Math.min(buildEntries.length, maxRows);
      for (let i = 0; i < visibleBuildRows; i += 1) {
        const entry = buildEntries[i];
        const label = `${i + 1}. ${entry.def.name} x${entry.stack}`;
        ctx.fillText(fitCanvasText(label, sectionW), runSectionX, rowsTop + i * rowH);
      }

      if (buildEntries.length > visibleBuildRows) {
        const remaining = buildEntries.length - visibleBuildRows;
        const overflowY = rowsTop + (visibleBuildRows - 1) * rowH;
        ctx.fillText(`+${remaining} more`, runSectionX, overflowY);
      }
    }

    if (glossaryRows.length === 0) {
      ctx.fillText("Threat glossary unavailable.", glossarySectionX, rowsTop);
    } else {
      const visibleGlossaryRows = Math.min(glossaryRows.length, maxRows);
      for (let i = 0; i < visibleGlossaryRows; i += 1) {
        ctx.fillText(fitCanvasText(glossaryRows[i], sectionW), glossarySectionX, rowsTop + i * rowH);
      }
    }

    ctx.textAlign = "center";
    ctx.font = '700 16px "Inter", sans-serif';
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(footer, WIDTH * 0.5, panelY + panelH - 36);

    ctx.textAlign = "left";
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
    const normalized = typeof text === "string" ? text : "";
    const words = normalized.split(" ");
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
    isTitleSequenceComplete
  };
})();
