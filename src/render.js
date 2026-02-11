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
    BOMB_BRIEFING_ACCEPT_COUNT
  } =
    AIPU.constants;
  const { game, player } = AIPU.state;
  const {
    FLOORS,
    TITLE_SEQUENCE,
    getNarrativeTitleCard,
    getNarrativeFloorCopy,
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

  let activeWaves = [];
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let pickups = [];
  let particles = [];

  const BOMB_BRIEFING_FALLBACK = {
    abilityName: "Escalation Pulse",
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

  function hasDynamicFloorVisuals(floor) {
    const id = floor && floor.id;
    return id === 1 || id === 2 || id === 3 || id === 4 || id === 8 || id === 9;
  }

  function drawEnvironment(floor, accent) {
    if (!RENDER_CACHE_ENABLED || !renderCacheState) {
      drawBackdrop(accent);
      drawCorridor(floor, accent);
      return;
    }

    markRenderCacheFloor(floor && floor.id, floor && floor.accent);

    if (!ensureRenderLayerCanvases()) {
      renderCacheState.stats.misses += 1;
      drawBackdrop(accent);
      drawCorridor(floor, accent);
      return;
    }

    if (renderCacheState.dirty) {
      rebuildFloorStaticLayer(floor, accent);
    }
    if (renderCacheState.staticCanvas) {
      ctx.drawImage(renderCacheState.staticCanvas, 0, 0);
    }

    updateDynamicLayer(floor, accent);
    if (renderCacheState.dynamicCanvas) {
      ctx.drawImage(renderCacheState.dynamicCanvas, 0, 0);
    }
    renderCacheState.stats.hits += 1;
  }

  function rebuildFloorStaticLayer(floor, accent) {
    if (!renderCacheState || !renderCacheState.staticCtx) {
      return;
    }

    withRenderContext(renderCacheState.staticCtx, () => {
      clearCurrentContext();
      drawBackdrop(accent);
      drawCorridorStaticLayer(floor, accent);
    });

    renderCacheState.dirty = false;
    renderCacheState.dynamicDirty = true;
    renderCacheState.dynamicTimer = 0;
    renderCacheState.stats.staticRebuilds += 1;
  }

  function updateDynamicLayer(floor, accent) {
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
        drawCorridorDynamicLayer(floor, accent);
      }
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

    if (game.state === GameState.BOMB_BRIEFING) {
      drawBackdrop(accent);
      drawBombBriefing(floor, accent);
      return;
    }

    if (deathShake) {
      ctx.save();
      ctx.translate(deathShake.x, deathShake.y);
    }

    drawEnvironment(floor, accent);

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

    ctx.fillStyle = rgba(accent, 0.22);
    fillRoundRect(panelX + 26, panelY + 26, panelW - 52, 10, 999);

    const floorCopy = getNarrativeFloorCopy(floor);
    const pickTitle = getNarrativeUiText("upgradePickTitle", "Pick an upgrade");
    const pickSubtitle = getNarrativeUiText("upgradePickSubtitle", "Stack small power. Keep control.");
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
      ctx.fillText(fitCanvasText(`Floor ${floor.id}: ${floorLesson}`, panelW - 68), panelX + 34, panelY + 174);

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
        const teachPanelLabel = getNarrativeUiText("teachCardTitlePrefix", "Teach Card");
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

      const footerText = "1-3 pick • Enter confirm • Esc disabled";
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
      ctx.fillText("Choose one to continue.", panelX + panelW - 258, panelY + panelH - 66);
    }
  }

  function drawBombBriefing(floor, accent) {
    const copy = typeof getBombBriefingCopy === "function" ? getBombBriefingCopy() : BOMB_BRIEFING_FALLBACK;
    const enterGoal = Math.max(1, BOMB_BRIEFING_ACCEPT_COUNT || 3);
    const accepted = clamp(game.bombBriefingEnterCount, 0, enterGoal);
    const nextStep = clamp(accepted + 1, 1, enterGoal);
    const baseCta = typeof copy.cta === "function" ? copy.cta(nextStep, enterGoal) : `Press Enter to accept (${nextStep}/${enterGoal})`;
    const ctaLine1 = accepted >= enterGoal ? "Accepted. Loading floor..." : baseCta;
    const ctaLine2 = accepted >= enterGoal ? "Use Space in PLAYING to clear screen." : "Then press Space in PLAYING";

    const panelW = 1060;
    const panelH = 566;
    const panelX = (WIDTH - panelW) * 0.5;
    const panelY = (HEIGHT - panelH) * 0.5;

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

    const panelPad = 30;
    const zoneGap = 18;
    const headerH = 64;
    const ctaH = 94;
    const bodyGap = 20;
    const rightW = 344;
    const contentX = panelX + panelPad;
    const contentW = panelW - panelPad * 2;
    const headerY = panelY + 44;
    const ctaY = panelY + panelH - panelPad - ctaH;
    const bodyY = headerY + headerH + zoneGap;
    const bodyH = Math.max(214, ctaY - zoneGap - bodyY);

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
    const lessonTag = `Floor ${floor.id} power lesson`;
    const badgeText = copy.abilityName || "Escalation Pulse";

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = '700 17px "Inter", sans-serif';
    ctx.fillText(fitCanvasText(lessonTag, contentW - 290), contentX, headerY + 8);

    const badgeFont = fitFontSizeForLine(badgeText, 268, 48, 18, '700 ${size}px "Sora", "Inter", sans-serif');
    ctx.font = `700 ${badgeFont}px "Sora", "Inter", sans-serif`;
    const badgeW = clamp(Math.ceil(ctx.measureText(badgeText).width) + 52, 196, 286);
    const badgeH = 66;
    const badgeX = contentX + contentW - badgeW;
    const badgeY = headerY;
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
    const leftInnerH = leftRect.h - 28;

    const keyCalloutH = 76;
    const actionStripH = 40;
    const bulletLineH = 21;
    const visibleBulletCount = Math.min(3, bullets.length);
    const bulletAreaH = Math.max(48, visibleBulletCount * bulletLineH + 6);
    const blockGap = 10;
    const reservedBottom = keyCalloutH + actionStripH + bulletAreaH + blockGap * 3;
    const topTextH = Math.max(88, leftInnerH - reservedBottom);

    withClipRect(leftInnerX, leftInnerY, leftInnerW, leftInnerH, () => {
      withClipRect(leftInnerX, leftInnerY, leftInnerW, topTextH, () => {
        let textY = leftInnerY;
        const headingSize = fitHeadingFontSize(title, leftInnerW, 74, 42, 2);
        ctx.fillStyle = TOKENS.ink;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.font = `700 ${headingSize}px "Sora", "Inter", sans-serif`;
        textY = drawWrappedText(title, leftInnerX, textY, leftInnerW, Math.round(headingSize * 1.04), { maxLines: 2 });
        textY += 6;
        ctx.font = '600 18px "Inter", sans-serif';
        drawWrappedText(subtitle, leftInnerX, textY, leftInnerW, 24, { maxLines: 2 });
      });

      const keyY = leftInnerY + topTextH + blockGap;
      const keyW = Math.min(338, leftInnerW);
      ctx.fillStyle = rgba(accent, 0.22);
      fillRoundRect(leftInnerX + 9, keyY + 7, keyW, keyCalloutH, 18);
      ctx.fillStyle = accent;
      fillRoundRect(leftInnerX, keyY, keyW, keyCalloutH, 18);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 3;
      strokeRoundRect(leftInnerX, keyY, keyW, keyCalloutH, 18);

      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '700 54px "Sora", "Inter", sans-serif';
      ctx.fillText("SPACE", leftInnerX + keyW * 0.5, keyY + 31);
      ctx.font = '700 15px "Inter", sans-serif';
      ctx.fillText("Use during PLAYING", leftInnerX + keyW * 0.5, keyY + 58);

      const actionY = keyY + keyCalloutH + blockGap;
      ctx.fillStyle = TOKENS.white;
      fillRoundRect(leftInnerX, actionY, leftInnerW, actionStripH, 12);
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = 2;
      strokeRoundRect(leftInnerX, actionY, leftInnerW, actionStripH, 12);
      ctx.fillStyle = TOKENS.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = '700 20px "Inter", sans-serif';
      ctx.fillText(fitCanvasText("Clears all enemies + enemy bullets", leftInnerW - 24), leftInnerX + 14, actionY + 9);

      const bulletY = actionY + actionStripH + blockGap;
      withClipRect(leftInnerX, bulletY, leftInnerW, bulletAreaH, () => {
        ctx.fillStyle = TOKENS.ink;
        ctx.font = '600 16px "Inter", sans-serif';
        let lineY = bulletY;
        const maxBullets = Math.min(visibleBulletCount, Math.max(1, Math.floor(bulletAreaH / bulletLineH)));
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
      const stepCardH = Math.max(72, Math.floor((rightInnerH - stepGap * (enterGoal - 1)) / enterGoal));
      let stepY = rightInnerY;

      for (let i = 0; i < enterGoal; i += 1) {
        const isDone = i < accepted;
        const label = steps[i] || `Step ${i + 1}`;
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
        ctx.font = '700 17px "Inter", sans-serif';
        drawWrappedText(`Enter ${i + 1}: ${label}`, cardX + 16, cardY + 16, cardW - markerGutter - 26, 22, { maxLines: 2 });

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

    const ctaLine1Size = fitFontSizeForLine(ctaLine1, ctaW - 44, 42, 22, '700 ${size}px "Sora", "Inter", sans-serif');
    const ctaLine2Size = fitFontSizeForLine(ctaLine2, ctaW - 44, 24, 16, '700 ${size}px "Inter", sans-serif');

    ctx.fillStyle = TOKENS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `700 ${ctaLine1Size}px "Sora", "Inter", sans-serif`;
    ctx.fillText(fitCanvasText(ctaLine1, ctaW - 44), ctaX + ctaW * 0.5, ctaY + 15);
    ctx.font = `700 ${ctaLine2Size}px "Inter", sans-serif`;
    ctx.fillText(fitCanvasText(ctaLine2, ctaW - 44), ctaX + ctaW * 0.5, ctaY + ctaH - 32);

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
      ctx.fillText("SELECTED", badgeX + 7, badgeY + 2);
    }

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
    const footerHint = `Start floor: ${checkpointFloor} • R: reset to Floor 1`;
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

  function drawCorridorStaticLayer(floor, accent) {
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

    drawFloorSkinStatic(floor, accent, wallLeft, wallRight);

    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 3;
    strokeRoundRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, 18);

    ctx.fillStyle = rgba(accent, 0.35);
    fillRoundRect(WORLD.x + 18, WORLD.y - 10, WORLD.w - 36, 6, 999);
    fillRoundRect(WORLD.x + 18, WORLD.y + WORLD.h + 4, WORLD.w - 36, 6, 999);
  }

  function drawCorridorDynamicLayer(floor, accent) {
    drawFloorSkinDynamic(floor, accent);
  }

  function drawFloorSkinStatic(floor, accent, wallLeft, wallRight) {
    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    drawWorldGridLines();

    if (floor.id === 1) {
      drawWordBlocks(accent);
    } else if (floor.id === 5) {
      drawKitchenPanels(accent);
    } else if (floor.id === 6) {
      drawDoorLoop(accent);
    } else if (floor.id === 7) {
      drawCracksAndFrames(accent);
    }

    ctx.restore();
    drawWallDecor(floor, accent, wallLeft, wallRight);
  }

  function drawFloorSkinDynamic(floor, accent) {
    const progress = game.floorDuration > 0 ? clamp(game.floorElapsed / game.floorDuration, 0, 1) : 0;

    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    if (floor.id === 1) {
      drawMotifFlicker(accent);
    } else if (floor.id === 2) {
      drawTileToWoodTransition(accent, progress);
    } else if (floor.id === 3) {
      drawLoadingBars(accent);
      drawFloatingIcons(accent);
    } else if (floor.id === 4) {
      drawWaveBands(accent);
    } else if (floor.id === 8) {
      drawThresholdBands(accent, progress);
    } else if (floor.id === 9) {
      drawEvolutionDissolve(accent, progress);
    }

    ctx.restore();
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

  function drawFloorSkin(floor, accent, wallLeft, wallRight) {
    const progress = game.floorDuration > 0 ? clamp(game.floorElapsed / game.floorDuration, 0, 1) : 0;

    ctx.save();
    ctx.beginPath();
    roundRectPath(WORLD.x + 1, WORLD.y + 1, WORLD.w - 2, WORLD.h - 2, 16);
    ctx.clip();

    drawWorldGridLines();

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
      ctx.fillStyle = rgba(accent, 0.22);
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

    const bombCopy = typeof getBombBriefingCopy === "function" ? getBombBriefingCopy() : BOMB_BRIEFING_FALLBACK;
    const bombAbilityName = bombCopy && bombCopy.abilityName ? bombCopy.abilityName : BOMB_BRIEFING_FALLBACK.abilityName;
    const bombText = !game.bombUsedThisFloor ? `Space: ${bombAbilityName} Ready` : `Space: ${bombAbilityName} Used`;
    ctx.font = '700 12px "Inter", sans-serif';
    const bombBoxW = clamp(Math.ceil(ctx.measureText(bombText).width) + 42, 184, 286);
    const bombBoxH = 30;
    const bombBoxX = timerBoxX - bombBoxW - 18;
    const bombBoxY = timerBoxY;
    const bombReady = !game.bombUsedThisFloor;

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(bombBoxX, bombBoxY, bombBoxW, bombBoxH, 999);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = 2;
    strokeRoundRect(bombBoxX, bombBoxY, bombBoxW, bombBoxH, 999);

    ctx.fillStyle = rgba(accent, bombReady ? 0.34 : 0.18);
    fillRoundRect(bombBoxX + 10, bombBoxY + 7, 7, bombBoxH - 14, 999);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 12px "Inter", sans-serif';
    ctx.fillText(fitCanvasText(bombText, bombBoxW - 34), bombBoxX + 24, bombBoxY + 18);

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
      ctx.fillText(fitCanvasText(rows[i], panelW - 28), panelX + 14, panelY + 41 + i * 19);
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
    ctx.fillText(fitCanvasText(debugText, panelW - 24), panelX + 12, panelY + 21);
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
      footer = "Press Enter to skip intro";
    } else if (game.state === GameState.FLOOR_CLEAR) {
      title = getNarrativeUiText("floorClearTitle", "Floor cleared");
      body = getNarrativeUiText("floorClearSubtitle", "Raw data -> weights -> concepts -> prediction.");
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

    const titleFont = fitHeadingFontSize(title, panelW - 90, 30, 24, 2);
    ctx.font = `700 ${titleFont}px "Sora", "Inter", sans-serif`;
    const titleBottom = drawWrappedText(title, WIDTH * 0.5, panelY + 44, panelW - 90, Math.round(titleFont * 1.15), {
      maxLines: 2
    });

    ctx.font = '500 20px "Inter", sans-serif';
    const bodyStartY = titleBottom + 10;
    const bodyLineHeight = 30;
    const bodyBottomLimit = footer ? panelY + panelH - 48 : panelY + panelH - 26;
    const bodyMaxLines = Math.max(1, Math.floor((bodyBottomLimit - bodyStartY) / bodyLineHeight));
    drawWrappedText(body, WIDTH * 0.5, bodyStartY, panelW - 80, bodyLineHeight, { maxLines: Math.min(3, bodyMaxLines) });

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
    const learnedBullets = (typeof getWhatYouLearnedBullets === "function" ? getWhatYouLearnedBullets() : [])
      .filter((line) => typeof line === "string" && line.trim())
      .slice(0, 3);

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
    const titleFont = fitHeadingFontSize(title, panelW - 100, 36, 28, 2);
    ctx.font = `700 ${titleFont}px "Sora", "Inter", sans-serif`;
    const titleBottom = drawWrappedText(title, WIDTH * 0.5, panelY + 44, panelW - 100, Math.round(titleFont * 1.14), {
      maxLines: 2
    });

    ctx.font = '500 20px "Inter", sans-serif';
    const bodyBottom = drawWrappedText(body, WIDTH * 0.5, titleBottom + 10, panelW - 70, 30, { maxLines: 2 });
    ctx.textAlign = "left";

    const pillY = Math.max(panelY + 142, bodyBottom + 10);
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
    ctx.fillText(fitCanvasText(`Floors cleared: ${floorsCleared}`, pillW - 26), panelX + 68, pillY + 11);
    ctx.fillText(fitCanvasText(`Upgrades taken: ${totalTaken}`, pillW - 26), panelX + 305, pillY + 11);

    const learnedX = panelX + 48;
    const learnedY = pillY + 54;
    const learnedW = panelW - 96;
    const learnedH = 90;

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(learnedX, learnedY, learnedW, learnedH, 14);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(learnedX, learnedY, learnedW, learnedH, 14);

    ctx.fillStyle = TOKENS.ink;
    ctx.font = '700 18px "Sora", "Inter", sans-serif';
    ctx.fillText("What you learned", learnedX + 14, learnedY + 10);
    ctx.font = '600 14px "Inter", sans-serif';
    for (let i = 0; i < learnedBullets.length; i += 1) {
      const y = learnedY + 38 + i * 16;
      ctx.fillText(`• ${fitCanvasText(learnedBullets[i], learnedW - 30)}`, learnedX + 16, y);
    }

    const listX = panelX + 48;
    const listY = learnedY + learnedH + 12;
    const listW = panelW - 96;
    const listBottom = panelY + panelH - 52;
    const listH = Math.max(80, listBottom - listY);

    ctx.fillStyle = TOKENS.fog;
    fillRoundRect(listX, listY, listW, listH, 14);
    ctx.strokeStyle = TOKENS.ink;
    strokeRoundRect(listX, listY, listW, listH, 14);

    withClipRect(listX + 2, listY + 2, listW - 4, listH - 4, () => {
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
      ctx.fillText(fitCanvasText("Run build", sectionW), runSectionX, contentTop);
      ctx.fillText(fitCanvasText("Threat glossary", sectionW), glossarySectionX, contentTop);

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
    });

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
    isTitleSequenceComplete
  };
})();
