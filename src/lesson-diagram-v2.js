(function initLessonDiagramV2(global) {
  "use strict";

  const AIPU = (global.AIPU = global.AIPU || {});

  const LAYOUT_BUCKET = 96;
  const LAYOUT_MARGIN = 28;
  const ACTIVE_STAGE_SECONDS = 1.15;
  const SCHEMA_VERSION = "lesson_v2_20260302";

  const DEFAULT_TOKENS = {
    ink: "#1f2937",
    white: "#f8fafc",
    fog: "#e2e8f0",
    yellow: "#f4d66d",
    blue: "#89b6ff",
    mint: "#90dec9",
    pink: "#f4accd",
    accent: "#c084fc"
  };
  const FONT_FAMILY = "Inter, sans-serif";

  const TEXT_PRESETS = {
    nodePrimary: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: "0.2px",
      color: "ink",
      bgChip: true,
      bgTone: "fog",
      chipPaddingX: 8,
      chipPaddingY: 3.8,
      chipRadius: 12,
      maxWidth: 112,
      alignment: "center",
      purpose: "nodePrimary"
    },
    nodeSecondary: {
      fontSize: 10.5,
      fontWeight: "600",
      letterSpacing: "0.15px",
      color: "ink",
      bgChip: true,
      bgTone: "fog",
      chipPaddingX: 7,
      chipPaddingY: 3.2,
      chipRadius: 10,
      maxWidth: 94,
      alignment: "center",
      purpose: "nodeSecondary"
    },
    edgeChip: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: "0.08px",
      color: "ink",
      bgChip: true,
      bgTone: "fog",
      chipPaddingX: 6.5,
      chipPaddingY: 2.6,
      chipRadius: 9,
      maxWidth: 68,
      alignment: "center",
      purpose: "edgeChip"
    },
    edgeTiny: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: "0.02px",
      color: "ink",
      bgChip: true,
      bgTone: "fog",
      chipPaddingX: 6,
      chipPaddingY: 2.4,
      chipRadius: 8,
      maxWidth: 56,
      alignment: "center",
      purpose: "edgeTiny"
    },
    heading: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: "0.2px",
      color: "ink",
      bgChip: true,
      bgTone: "fog",
      chipPaddingX: 10,
      chipPaddingY: 4.6,
      chipRadius: 12,
      maxWidth: 150,
      alignment: "center",
      purpose: "heading"
    },
    caption: {
      fontSize: 13,
      fontWeight: "500",
      letterSpacing: "0.02px",
      color: "ink",
      bgChip: true,
      bgTone: "fog",
      chipPaddingX: 11,
      chipPaddingY: 4.8,
      chipRadius: 12,
      maxWidth: 190,
      alignment: "left",
      purpose: "caption"
    }
  };

  const SCENE_TEXT_PRESETS = {
    network_basic: {
      nodePrimary: { tone: "ink", bgTone: "fog" },
      edgeChip: { maxWidth: 60, fontSize: 10 }
    },
    inputs_nodes: {
      nodePrimary: { tone: "ink", maxWidth: 76 },
      nodeSecondary: { tone: "inkSoft" },
      edgeChip: { maxWidth: 62, fontSize: 9.8, chipPaddingY: 2.2 }
    },
    weights_knobs: {
      edgeChip: { tone: "blue", chipPaddingX: 6, maxWidth: 62 }
    },
    sum_bias: {
      nodePrimary: { tone: "ink", bgTone: "fog" },
      nodeSecondary: { fontSize: 10.2, maxWidth: 72 },
      edgeChip: { maxWidth: 52, fontSize: 9.6, chipPaddingY: 2.2, tone: "ink" }
    },
    activation_gate: {
      heading: { tone: "ink", maxWidth: 120 },
      nodeSecondary: { tone: "ink", maxWidth: 70 },
      edgeChip: { fontSize: 9.6, maxWidth: 64, tone: "ink" }
    },
    layers_stack: {
      caption: { tone: "ink", maxWidth: 108, fontSize: 11.8 },
      heading: { tone: "ink", fontSize: 11.4, maxWidth: 72 },
      nodePrimary: { fontSize: 10.8, maxWidth: 76, tone: "ink" }
    },
    loss_meter: {
      heading: { tone: "ink", fontSize: 13.4, chipPaddingY: 5 },
      nodeSecondary: { tone: "fog", maxWidth: 80 },
      nodePrimary: { tone: "ink", fontSize: 11 },
      edgeTiny: { tone: "ink", maxWidth: 48, fontSize: 8.6 }
    },
    backprop_arrows: {
      edgeChip: { maxWidth: 62, tone: "blue", fontSize: 9.4 },
      nodeSecondary: { tone: "ink", maxWidth: 70 }
    },
    generalize_explain: {
      caption: { tone: "ink", maxWidth: 176, fontSize: 12.2 },
      nodePrimary: { tone: "ink", fontSize: 10.6 },
      nodeSecondary: { tone: "inkMuted", fontSize: 10, maxWidth: 88 }
    }
  };

  const NODE_STYLE = {
    input: { radius: 15, fillAlpha: 0.95, strokeWidth: 2, colorMix: 0.08 },
    hidden: { radius: 14, fillAlpha: 0.92, strokeWidth: 2, colorMix: 0.2 },
    operator: { radius: 17, fillAlpha: 0.95, strokeWidth: 2, colorMix: 0.3 },
    output: { radius: 16, fillAlpha: 0.95, strokeWidth: 2, colorMix: 0.4 },
    metric: { radius: 16, fillAlpha: 0.95, strokeWidth: 2, colorMix: 0.35 },
    split: { radius: 13, fillAlpha: 0.9, strokeWidth: 2, colorMix: 0.18 }
  };

  const state = {
    renderer: null,
    stage: null,
    diagramLayer: null,
    particleLayer: null,
    view: null,
    width: 0,
    height: 0,
    snapshotCanvas: null,
    snapshotWidth: 0,
    snapshotHeight: 0,
    cachedLayoutKey: "",
    elk: null,
    elkEnabled: false,
    layoutCache: Object.create(null),
    layoutPending: Object.create(null),
    activeLayoutKey: "",
    activeLayoutSource: "manual",
    emitter: null,
    emitterContainer: null,
    emitterFailed: false,
    debug: {
      mode: "network_basic",
      layoutVersion: "manual",
      activeStage: 0,
      fallbackUsed: true,
      legacyFallbackUsed: false,
      activeLayoutSource: "manual",
      activeRenderMode: "none",
      pixiAvailable: false,
      elkAvailable: false,
      emitterAvailable: false,
      cachedFrameAvailable: false,
      lastFailure: null,
      lastFailurePhase: null,
      lastFailureAt: 0,
      failureCount: 0,
      schemaVersion: SCHEMA_VERSION
    },
    pixiWebglUnavailable: null
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeFailure(error) {
    if (!error) {
      return "unknown";
    }
    if (typeof error === "string") {
      return error;
    }
    const msg = typeof error.message === "string" ? error.message : "";
    const name = typeof error.name === "string" ? error.name : "Error";
    return msg ? `${name}: ${msg}` : String(error);
  }

  function setFailure(phase, error) {
    state.debug.lastFailure = normalizeFailure(error);
    state.debug.lastFailurePhase = phase;
    state.debug.lastFailureAt = Date.now();
    state.debug.failureCount = Number(state.debug.failureCount || 0) + 1;
  }

  function clearFailure() {
    state.debug.lastFailure = null;
    state.debug.lastFailurePhase = null;
    state.debug.lastFailureAt = 0;
    state.debug.failureCount = 0;
  }

  function buildDebugState(fields) {
    const safe = fields || {};
    return {
      mode: typeof safe.mode === "string" ? safe.mode : state.debug.mode,
      layoutVersion: safe.layoutVersion || "manual",
      activeStage: Number.isFinite(safe.activeStage) ? safe.activeStage : 0,
      activeLayoutSource: state.debug.activeLayoutSource,
      activeRenderMode: safe.activeRenderMode || state.debug.activeRenderMode || "none",
      legacyFallbackUsed: !!safe.legacyFallbackUsed,
      fallbackUsed: !!safe.fallbackUsed,
      pixiAvailable: !!safe.pixiAvailable,
      elkAvailable: !!safe.elkAvailable,
      emitterAvailable: !!safe.emitterAvailable,
      cachedFrameAvailable: !!state.debug.cachedFrameAvailable,
      lastFailure: state.debug.lastFailure,
      lastFailurePhase: state.debug.lastFailurePhase,
      lastFailureAt: Number.isFinite(state.debug.lastFailureAt) ? state.debug.lastFailureAt : 0,
      failureCount: Number.isFinite(state.debug.failureCount) ? state.debug.failureCount : 0,
      schemaVersion: SCHEMA_VERSION
    };
  }

  function withSnapshotCanvas(width, height) {
    if (!global.document || typeof global.document.createElement !== "function") {
      return null;
    }
    let snapshot = state.snapshotCanvas;
    const targetW = Math.max(1, Math.floor(width));
    const targetH = Math.max(1, Math.floor(height));
    if (!snapshot) {
      snapshot = global.document.createElement("canvas");
      state.snapshotCanvas = snapshot;
    }
    if (snapshot.width !== targetW || snapshot.height !== targetH) {
      snapshot.width = targetW;
      snapshot.height = targetH;
      state.snapshotWidth = targetW;
      state.snapshotHeight = targetH;
    }
    return snapshot;
  }

  function cachedFrameAvailableFor(layoutKey) {
    return (
      !!state.debug.cachedFrameAvailable &&
      state.cachedLayoutKey === layoutKey &&
      !!state.snapshotCanvas
    );
  }

  function invalidateCachedFrame() {
    state.debug.cachedFrameAvailable = false;
    state.cachedLayoutKey = "";
  }

  function cacheCurrentFrame(width, height) {
    if (!state.activeLayoutKey) {
      return;
    }
    const snapshot = withSnapshotCanvas(width, height);
    if (!snapshot || !state.view || !state.view.getContext) {
      return;
    }
    const snapshotCtx = snapshot.getContext("2d");
    if (!snapshotCtx) {
      return;
    }
    const targetW = Math.max(1, Math.floor(width));
    const targetH = Math.max(1, Math.floor(height));
    snapshotCtx.clearRect(0, 0, targetW, targetH);
    try {
      snapshotCtx.drawImage(state.view, 0, 0, targetW, targetH);
      state.debug.cachedFrameAvailable = true;
      state.cachedLayoutKey = state.activeLayoutKey;
      state.debug.failureCount = 0;
    } catch (error) {
      state.debug.cachedFrameAvailable = false;
      setFailure("cacheFrame", error);
    }
  }

  function drawCachedFrame(ctx, rect, layoutKey) {
    if (!cachedFrameAvailableFor(layoutKey)) {
      state.debug.cachedFrameAvailable = false;
      return false;
    }
    const snapshot = state.snapshotCanvas;
    if (!snapshot || !state.debug.cachedFrameAvailable) {
      return false;
    }
    if (!ctx || typeof ctx.drawImage !== "function") {
      return false;
    }
    if (rect.w <= 0 || rect.h <= 0) {
      return false;
    }
    try {
      ctx.drawImage(snapshot, rect.x, rect.y, rect.w, rect.h);
      return true;
    } catch (error) {
      state.debug.cachedFrameAvailable = false;
      setFailure("drawCachedFrame", error);
      return false;
    }
  }

  function getTokens() {
    const base = AIPU.constants && AIPU.constants.TOKENS ? AIPU.constants.TOKENS : null;
    const palette = base && typeof base.palette === "object" ? base.palette : base;
    return {
      ink: (palette && palette.ink) || DEFAULT_TOKENS.ink,
      inkSoft: (palette && (palette.inkSoft || palette.soft)) || "#2f3647",
      inkMuted: (palette && palette.inkMuted) || "#546078",
      white: (palette && palette.white) || DEFAULT_TOKENS.white,
      fog: (palette && palette.fog) || DEFAULT_TOKENS.fog,
      yellow: (palette && palette.yellow) || DEFAULT_TOKENS.yellow,
      blue: (palette && palette.blue) || DEFAULT_TOKENS.blue,
      mint: (palette && palette.mint) || DEFAULT_TOKENS.mint,
      pink: (palette && palette.pink) || DEFAULT_TOKENS.pink,
      accent: (palette && (palette.accent || palette.pink || DEFAULT_TOKENS.accent)) || DEFAULT_TOKENS.accent
    };
  }

  function normalizeMode(mode) {
    if (typeof mode !== "string" || !mode.trim()) {
      return "network_basic";
    }
    return mode.trim();
  }

  function bucketSize(value) {
    const numeric = Math.max(96, Math.floor(Number(value) || 96));
    return Math.max(LAYOUT_BUCKET, Math.round(numeric / LAYOUT_BUCKET) * LAYOUT_BUCKET);
  }

  function parseHexColor(hex, fallbackInt) {
    if (typeof hex !== "string") {
      return fallbackInt;
    }
    const trimmed = hex.trim();
    const normalized = trimmed[0] === "#" ? trimmed.slice(1) : trimmed;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return fallbackInt;
    }
    return parseInt(normalized, 16);
  }

  function toRgb(hex) {
    const parsed = parseHexColor(hex, 0xc084fc);
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  function rgbToHexInt(rgb) {
    const r = clamp(Math.round(rgb.r), 0, 255);
    const g = clamp(Math.round(rgb.g), 0, 255);
    const b = clamp(Math.round(rgb.b), 0, 255);
    return (r << 16) + (g << 8) + b;
  }

  function rgbToRgba(rgb, alpha) {
    const safeRgb = rgb || { r: 0, g: 0, b: 0 };
    return `rgba(${clamp(Math.round(safeRgb.r), 0, 255)}, ${clamp(Math.round(safeRgb.g), 0, 255)}, ${clamp(Math.round(safeRgb.b), 0, 255)}, ${clamp(alpha, 0, 1)})`;
  }

  function mixRgb(a, b, t) {
    const clamped = clamp(t, 0, 1);
    return {
      r: a.r + (b.r - a.r) * clamped,
      g: a.g + (b.g - a.g) * clamped,
      b: a.b + (b.b - a.b) * clamped
    };
  }

  function getNodeStyle(kind) {
    return NODE_STYLE[kind] || NODE_STYLE.hidden;
  }

  function createNode(id, label, kind, tier, labelTone, labelLayout, labelPurpose, labelMaxWidth) {
    return {
      id,
      label,
      kind,
      tier,
      labelTone,
      labelLayout,
      labelPurpose,
      labelMaxWidth
    };
  }

  function createEdge(id, source, target, label, emphasis = 0.5, labelTone, labelLayout, labelPurpose, labelMaxWidth) {
    return {
      id,
      source,
      target,
      label,
      emphasis,
      labelTone,
      labelLayout,
      labelPurpose,
      labelMaxWidth
    };
  }

  function buildTextSpec(sceneMode, purpose, source = null) {
    const normalizedPurpose = TEXT_PRESETS[purpose] ? purpose : "nodeSecondary";
    const base = TEXT_PRESETS[normalizedPurpose];
    const sceneOverrides = SCENE_TEXT_PRESETS[sceneMode] || {};
    const scenePurposeOverrides = sceneOverrides[normalizedPurpose] || {};
    const sourceOverrides = source && typeof source === "object" ? source : null;
    const toneOverride = sourceOverrides && (sourceOverrides.labelTone || sourceOverrides.tone);

    const merged = Object.assign({}, base, scenePurposeOverrides, sourceOverrides || {});
    const colorTone = toneOverride || merged.color || "ink";
    return Object.assign({}, merged, {
      purpose: merged.purpose || normalizedPurpose,
      color: colorTone,
      fontFamily: FONT_FAMILY
    });
  }

  function clampColor(color) {
    return parseHexColor(color, 0x1f2937);
  }

  function normalizeToneColor(tone, tokens) {
    const fallback = tokens.ink || DEFAULT_TOKENS.ink;
    if (tone === "inkSoft") {
      return tokens.inkSoft || fallback;
    }
    if (tone === "inkMuted") {
      return tokens.inkMuted || fallback;
    }
    if (tone === "white") {
      return tokens.white || "#ffffff";
    }
    if (tone === "yellow" || tone === "blue" || tone === "mint" || tone === "pink" || tone === "fog" || tone === "accent") {
      return tokens[tone] || fallback;
    }
    return parseHexColor(tone, clampColor(fallback));
  }

  function normalizeTextTone(textTone, specTone, tokens) {
    return normalizeToneColor(textTone || specTone || "ink", tokens);
  }

  function buildEdgeLabelMeta(scene, positions) {
    const incoming = Object.create(null);
    const slotMap = Object.create(null);
    const countMap = Object.create(null);
    for (let i = 0; i < scene.edges.length; i += 1) {
      const edge = scene.edges[i];
      if (!edge.label) {
        continue;
      }
      if (!incoming[edge.target]) {
        incoming[edge.target] = [];
      }
      incoming[edge.target].push(edge);
    }
    const targetIds = Object.keys(incoming);
    for (let i = 0; i < targetIds.length; i += 1) {
      const targetId = targetIds[i];
      const group = incoming[targetId];
      group.sort((a, b) => {
        const ay = positions[a.source] ? positions[a.source].y : 0;
        const by = positions[b.source] ? positions[b.source].y : 0;
        return ay - by;
      });
      countMap[targetId] = group.length;
      for (let j = 0; j < group.length; j += 1) {
        slotMap[group[j].id] = j;
      }
    }
    return { incoming, slotMap, countMap };
  }

  function resolveEdgeLabelPosition(edge, source, target, groupSize, slot, mode) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const nx = -dy / length;
    const ny = dx / length;
    const directionSign = dx >= 0 ? 1 : -1;
    const crowdCount = Math.max(1, groupSize);
    const isCrowded = crowdCount > 1;
    const baseT = isCrowded ? 0.45 : 0.39;
    const sideScale =
      edge.labelLayout === "forwardLane" ? directionSign * 1 : edge.labelLayout === "feedbackLane" ? -directionSign * 1 : 1;
    const slotOffset = isCrowded ? (slot - (crowdCount - 1) * 0.5) * 12 : 0;
    const laneOffset =
      edge.labelLayout === "forwardLane"
        ? -11 * sideScale
        : edge.labelLayout === "feedbackLane"
          ? 11 * sideScale
          : mode === "activation_gate" && edge.labelPurpose === "edgeChip"
            ? 4
            : (mode === "inputs_nodes" ? -10 : -9);
    return {
      x: source.x + dx * baseT + nx * slotOffset,
      y: source.y + dy * baseT + ny * slotOffset + laneOffset,
      anchorY: "middle"
    };
  }

  function splitLabelTextToLines(text, measureFn, maxWidth) {
    const safeText = String(text == null ? "" : text);
    if (!safeText.trim()) {
      return [""];
    }
    const parts = safeText.split(/\s+/);
    const lines = [];
    let current = "";
    for (let i = 0; i < parts.length; i += 1) {
      const token = parts[i];
      const attempt = current ? `${current} ${token}` : token;
      if (measureFn(attempt) <= maxWidth) {
        current = attempt;
      } else if (!current) {
        lines.push(token);
      } else {
        lines.push(current);
        current = token;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines.length > 0 ? lines : [safeText];
  }

  function renderLabelCard(context, text, x, y, spec, tokens, mode, options) {
    if (!context || !spec || !tokens) {
      return;
    }
    const safeText = String(text == null ? "" : text);
    const safeSpec = spec || {};
    const textColor = normalizeTextTone(safeSpec.color, safeSpec.color, tokens);
    const chipFill = normalizeTextTone(safeSpec.bgTone || "fog", "fog", tokens);
    const chipStroke = clampColor(normalizeTextTone("ink", "ink", tokens));
    const fontSize = Math.max(8, Math.min(16, Number(safeSpec.fontSize) || 10));
    const fontWeight = safeSpec.fontWeight || "600";
    const maxWidth = Math.max(44, Number(safeSpec.maxWidth) || 90);
    const paddingX = Number(safeSpec.chipPaddingX) || 7;
    const paddingY = Number(safeSpec.chipPaddingY) || 3;
    const radius = Number(safeSpec.chipRadius) || 10;
    const lineHeight = fontSize * 1.2;
    const letterSpacing = safeSpec.letterSpacing || "0px";
    const alignment = safeSpec.alignment || "center";
    const oldFont = context.font;

    context.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
    context.textBaseline = "middle";
    context.textAlign = alignment === "left" ? "left" : "center";

    const measure = (line) => context.measureText(line).width + (line.length - 1) * 0;
    const rawMaxWidth = Math.max(24, maxWidth - paddingX * 2);
    const lines = splitLabelTextToLines(safeText, measure, rawMaxWidth);
    let widest = 0;
    for (let i = 0; i < lines.length; i += 1) {
      widest = Math.max(widest, context.measureText(lines[i]).width);
    }

    const chipWidth = Math.max(rawMaxWidth, widest) + paddingX * 2;
    const chipHeight = lines.length * lineHeight + paddingY * 2;
    let chipX = x;
    let chipY = y - chipHeight * 0.5;
    if (alignment === "left") {
      chipX -= paddingX;
    } else {
      chipX -= chipWidth * 0.5;
    }
    if (safeSpec.bgChip !== false) {
      context.fillStyle = rgbToRgba(toRgb("#" + chipFill.toString(16).padStart(6, "0")), 0.95);
      context.strokeStyle = rgbToRgba(toRgb("#" + chipStroke.toString(16).padStart(6, "0")), 0.84);
      context.lineWidth = 1;
      roundRectPath(context, chipX, chipY, chipWidth, chipHeight, radius);
      context.fill();
      context.stroke();
    }
    context.fillStyle = rgbToRgba(toRgb("#" + textColor.toString(16).padStart(6, "0")), 1);
    const baselineTop = chipY + paddingY + lineHeight * 0.55;
    const lineGap = lineHeight;
    for (let i = 0; i < lines.length; i += 1) {
      const lineX = alignment === "left" ? chipX + paddingX : x;
      const lineY = baselineTop + i * lineGap;
      context.fillText(lines[i], lineX, lineY);
    }
    context.font = oldFont;
  }

  function renderPixiLabelCard(root, text, x, y, spec, tokens) {
    if (!global.PIXI || !global.PIXI.Graphics || !global.PIXI.Text || !global.PIXI.TextStyle) {
      return;
    }
    const safeText = String(text == null ? "" : text);
    const safeSpec = spec || {};
    const fontSize = Math.max(8, Math.min(16, Number(safeSpec.fontSize) || 10));
    const maxWidth = Math.max(40, Number(safeSpec.maxWidth) || 100);
    const textColor = normalizeTextTone(safeSpec.color, safeSpec.color, tokens);
    const chipFill = normalizeTextTone(safeSpec.bgTone || "fog", "fog", tokens);
    const chipStroke = normalizeTextTone("ink", "ink", tokens);
    const style = new global.PIXI.TextStyle({
      fontFamily: FONT_FAMILY,
      fontSize,
      fontWeight: safeSpec.fontWeight || "600",
      fill: "#" + textColor.toString(16).padStart(6, "0"),
      align: safeSpec.alignment === "left" ? "left" : "center",
      lineHeight: fontSize * 1.2,
      breakWords: true,
      wordWrap: true,
      wordWrapWidth: maxWidth
    });
    const letterSpacing = Number.parseFloat(String(safeSpec.letterSpacing || "0"));
    style.letterSpacing = Number.isFinite(letterSpacing) ? letterSpacing : 0;

    const label = new global.PIXI.Text(safeText, style);
    label.anchor.set(safeSpec.alignment === "left" ? 0 : 0.5, 0.5);
    const textWidth = Math.max(20, label.width);
    const textHeight = Math.max(fontSize + 2, label.height);
    const paddingX = Number(safeSpec.chipPaddingX) || 7;
    const paddingY = Number(safeSpec.chipPaddingY) || 3;
    const radius = Number(safeSpec.chipRadius) || 10;
    const chipWidth = Math.max(maxWidth * 0.25, textWidth + paddingX * 2);
    const chipHeight = textHeight + paddingY * 2;
    if (safeSpec.bgChip !== false) {
      const chip = new global.PIXI.Graphics();
      const chipX = safeSpec.alignment === "left" ? x : x - chipWidth / 2;
      const chipY = y - chipHeight / 2;
      chip.beginFill(chipFill, 0.95);
      chip.drawRoundedRect(chipX, chipY, chipWidth, chipHeight, radius);
      chip.lineStyle(1, chipStroke, 0.78);
      chip.drawRoundedRect(chipX, chipY, chipWidth, chipHeight, radius);
      chip.endFill();
      root.addChild(chip);
      label.x = safeSpec.alignment === "left" ? chipX + paddingX : x;
    } else {
      label.x = x;
    }
    label.y = y;
    root.addChild(label);
  }

  function getLabelTone(mode, tone, fallbackTone) {
    return String(tone || fallbackTone || "ink");
  }

  function shouldRenderNodeLabel(sceneMode, node) {
    if (!node || !node.label) {
      return false;
    }
    const safeMode = normalizeMode(sceneMode || "");
    if (safeMode !== "layers_stack") {
      return true;
    }
    if (node.id === "i1" || node.id === "o1") {
      return false;
    }
    const tier = Number(node.tier);
    if (node.kind === "hidden" || tier === 1 || tier === 2) {
      return false;
    }
    return true;
  }

  function resolveNodeLabelPlacement(node, position, mode, spec) {
    const radius = spec && spec.radius ? Number(spec.radius) : 14;
    const layout = String(node.labelLayout || (mode === "network_basic" ? "nodePill" : "nodeCenter")).trim();
    const x = position.x;
    if (layout === "nodePill" || layout === "nodeHeader" || mode === "network_basic" || mode === "layers_stack") {
      return { x, y: position.y - radius - 15, anchor: 0.5 };
    }
    if (layout === "nodeTopHeader") {
      return { x, y: position.y - radius - 18, anchor: 0.5 };
    }
    return { x, y: position.y, anchor: 0.5 };
  }

  function buildSceneSpec(mode) {
    const resolved = normalizeMode(mode);
    switch (resolved) {
      case "inputs_nodes":
        return {
          mode: resolved,
          nodes: [
            createNode("sensor_1", "pixel", "input", 0, "ink", "nodeTopHeader"),
            createNode("sensor_2", "click", "input", 0, "ink", "nodeTopHeader"),
            createNode("sensor_3", "time", "input", 0, "ink", "nodeTopHeader"),
            createNode("embed", "encode", "hidden", 1, "ink", "nodePill"),
            createNode("feature", "feature", "hidden", 2, "ink", "nodePill"),
            createNode("out", "guess", "output", 3, "ink", "nodeTopHeader")
          ],
          edges: [
            createEdge("e_s1", "sensor_1", "embed", "x1", 0.6, "blue", "edgeChip", "edgeChip"),
            createEdge("e_s2", "sensor_2", "embed", "x2", 0.6, "blue", "edgeChip", "edgeChip"),
            createEdge("e_s3", "sensor_3", "embed", "x3", 0.6, "blue", "edgeChip", "edgeChip"),
            createEdge("e_s4", "embed", "feature", "", 0.7),
            createEdge("e_s5", "feature", "out", "y", 0.75, "blue", "edgeChip", "edgeChip")
          ],
          stages: [["sensor_1", "sensor_2", "sensor_3"], ["embed"], ["feature"], ["out"]]
        };
      case "weights_knobs":
        return {
          mode: resolved,
          nodes: [
            createNode("x1", "x1", "input", 0),
            createNode("x2", "x2", "input", 0),
            createNode("x3", "x3", "input", 0),
            createNode("z", "sum", "operator", 1),
            createNode("y", "output", "output", 2)
          ],
          edges: [
            createEdge("w1", "x1", "z", "0.9", 0.8, "blue", "edgeLane"),
            createEdge("w2", "x2", "z", "0.2", 0.5, "blue", "edgeLane"),
            createEdge("w3", "x3", "z", "0.6", 0.7, "blue", "edgeLane"),
            createEdge("w4", "z", "y", "", 0.85)
          ],
          stages: [["x1", "x2", "x3"], ["z"], ["y"]]
        };
      case "sum_bias":
        return {
          mode: resolved,
          nodes: [
            createNode("x1", "x1", "input", 0),
            createNode("x2", "x2", "input", 0),
            createNode("x3", "x3", "input", 0),
            createNode("b", "+b", "operator", 1),
            createNode("sigma", "Σ", "operator", 2),
            createNode("z", "z", "hidden", 3),
            createNode("f", "f", "operator", 4),
            createNode("y", "y", "output", 5)
          ],
          edges: [
            createEdge("sb1", "x1", "sigma", "w1", 0.75),
            createEdge("sb2", "x2", "sigma", "w2", 0.6),
            createEdge("sb3", "x3", "sigma", "w3", 0.68),
            createEdge("sb4", "b", "sigma", "+ b", 0.9, "fog", "edgeChip", "edgeChip"),
            createEdge("sb5", "sigma", "z", "Σ", 0.85, "ink", "edgeChip", "edgeTiny"),
            createEdge("sb6", "z", "f", "gate", 0.86),
            createEdge("sb7", "f", "y", "output", 0.88, "ink", "edgeChip")
          ],
          stages: [["x1", "x2", "x3", "b"], ["sigma"], ["z"], ["f"], ["y"]]
        };
      case "activation_gate":
        return {
          mode: resolved,
          nodes: [
            createNode("x", "signal", "input", 0),
            createNode("sum", "Σ", "operator", 1),
            createNode("gate", "ReLU", "operator", 2),
            createNode("active", "active", "output", 3),
            createNode("off", "clipped", "split", 3)
          ],
          edges: [
            createEdge("ag1", "x", "sum", "", 0.6),
            createEdge("ag2", "sum", "gate", "", 0.7),
            createEdge("ag3", "gate", "active", "active", 0.85, "blue", "forwardLane", "edgeChip"),
            createEdge("ag4", "gate", "off", "blocked", 0.5, "blue", "feedbackLane", "edgeChip")
          ],
          captions: [
            { text: "ReLU gate", tone: "ink", purpose: "heading", layout: "top", maxWidth: 104 },
            { text: "▶ forward", tone: "blue", purpose: "caption", layout: "rightTop", maxWidth: 80 },
            { text: "◀ feedback", tone: "ink", purpose: "caption", layout: "rightBottom", maxWidth: 84 }
          ],
          stages: [["x"], ["sum"], ["gate"], ["active", "off"]]
        };
      case "layers_stack":
        return {
          mode: resolved,
          nodes: [
            createNode("i1", "x1", "input", 0),
            createNode("i2", "x2", "input", 0),
            createNode("h1", "h1", "hidden", 1),
            createNode("h2", "h2", "hidden", 1),
            createNode("h3", "h3", "hidden", 2),
            createNode("h4", "h4", "hidden", 2),
            createNode("o1", "class A", "output", 3),
            createNode("o2", "class B", "output", 3)
          ],
          edges: [
            createEdge("ls1", "i1", "h1", "", 0.56),
            createEdge("ls2", "i1", "h2", "", 0.56),
            createEdge("ls3", "i2", "h1", "", 0.56),
            createEdge("ls4", "i2", "h2", "", 0.56),
            createEdge("ls5", "h1", "h3", "", 0.7),
            createEdge("ls6", "h1", "h4", "", 0.7),
            createEdge("ls7", "h2", "h3", "", 0.7),
            createEdge("ls8", "h2", "h4", "", 0.7),
            createEdge("ls9", "h3", "o1", "", 0.78),
            createEdge("ls10", "h4", "o2", "", 0.78)
          ],
          captions: [
            { text: "Input", tone: "ink", purpose: "heading", layout: "layerMarker", tier: 0, maxWidth: 60 },
            { text: "Hidden 1", tone: "ink", purpose: "heading", layout: "layerMarker", tier: 1, maxWidth: 60 },
            { text: "Hidden 2", tone: "ink", purpose: "heading", layout: "layerMarker", tier: 2, maxWidth: 60 },
            { text: "Output", tone: "ink", purpose: "heading", layout: "layerMarker", tier: 3, maxWidth: 60 }
          ],
          stages: [["i1", "i2"], ["h1", "h2"], ["h3", "h4"], ["o1", "o2"]]
        };
      case "loss_meter":
        return {
          mode: resolved,
          nodes: [
            createNode("pred", "y^", "output", 0),
            createNode("truth", "y", "input", 0),
            createNode("diff", "|y^-y|", "operator", 1),
            createNode("loss", "Loss", "metric", 2, "ink", "nodeTopHeader", "heading"),
            createNode("goal", "minimize", "output", 3)
          ],
          edges: [
            createEdge("lm1", "pred", "diff", "", 0.72),
            createEdge("lm2", "truth", "diff", "", 0.72),
            createEdge("lm3", "diff", "loss", "error", 0.9, "ink", "forwardLane", "edgeChip"),
            createEdge("lm4", "loss", "goal", "", 0.85, "ink", "forwardLane", "edgeChip")
          ],
          stages: [["pred", "truth"], ["diff"], ["loss"], ["goal"]]
        };
      case "backprop_arrows":
        return {
          mode: resolved,
          nodes: [
            createNode("x", "x", "input", 0),
            createNode("h", "hidden", "hidden", 1),
            createNode("yhat", "y^", "output", 2),
            createNode("loss", "L", "metric", 3),
            createNode("grad2", "∂L/∂w2", "operator", 2),
            createNode("grad1", "∂L/∂w1", "operator", 1)
          ],
          edges: [
            createEdge("bp1", "x", "h", "forward", 0.62, "blue", "forwardLane", "edgeChip"),
            createEdge("bp2", "h", "yhat", "forward", 0.66, "blue", "forwardLane", "edgeChip"),
            createEdge("bp3", "yhat", "loss", "forward", 0.78, "blue", "forwardLane", "edgeChip"),
            createEdge("bp4", "loss", "grad2", "feedback", 0.92, "ink", "feedbackLane", "edgeChip"),
            createEdge("bp5", "grad2", "grad1", "feedback", 0.9, "ink", "feedbackLane", "edgeChip")
          ],
          captions: [
            { text: "forward", tone: "blue", purpose: "heading", layout: "top", maxWidth: 74 },
            { text: "feedback", tone: "ink", purpose: "heading", layout: "bottom", maxWidth: 80 }
          ],
          stages: [["x", "h", "yhat"], ["loss"], ["grad2"], ["grad1"]]
        };
      case "generalize_explain":
        return {
          mode: resolved,
          nodes: [
            createNode("train", "train", "input", 0),
            createNode("test", "test", "input", 0),
            createNode("model", "model", "hidden", 1),
            createNode("score", "score", "metric", 2),
            createNode("explain", "why", "operator", 2),
            createNode("ship", "ship", "output", 3)
          ],
          edges: [
            createEdge("ge1", "train", "model", "train", 0.7, "ink", "edgeChip"),
            createEdge("ge2", "test", "model", "test", 0.63, "ink", "edgeChip"),
            createEdge("ge3", "model", "score", "", 0.8),
            createEdge("ge4", "model", "explain", "", 0.8),
            createEdge("ge5", "score", "ship", "", 0.85, "blue", "forwardLane", "edgeChip"),
            createEdge("ge6", "explain", "ship", "", 0.85, "blue", "feedbackLane", "edgeChip")
          ],
          captions: [
            { text: "🟢 train set", tone: "ink", purpose: "caption", layout: "leftTop", maxWidth: 130 },
            { text: "🟡 test set", tone: "ink", purpose: "caption", layout: "leftBottom", maxWidth: 130 }
          ],
          stages: [["train", "test"], ["model"], ["score", "explain"], ["ship"]]
        };
      case "network_basic":
      default:
        return {
          mode: "network_basic",
          nodes: [
            createNode("in1", "x1", "input", 0),
            createNode("in2", "x2", "input", 0),
            createNode("in3", "x3", "input", 0),
            createNode("hid1", "h1", "hidden", 1),
            createNode("hid2", "h2", "hidden", 1),
            createNode("out", "y", "output", 2)
          ],
          edges: [
            createEdge("nb1", "in1", "hid1", "", 0.57),
            createEdge("nb2", "in1", "hid2", "", 0.57),
            createEdge("nb3", "in2", "hid1", "", 0.57),
            createEdge("nb4", "in2", "hid2", "", 0.57),
            createEdge("nb5", "in3", "hid1", "", 0.57),
            createEdge("nb6", "in3", "hid2", "", 0.57),
            createEdge("nb7", "hid1", "out", "", 0.8),
            createEdge("nb8", "hid2", "out", "", 0.8)
          ],
          stages: [["in1", "in2", "in3"], ["hid1", "hid2"], ["out"]]
        };
    }
  }

  function getNodeRadius(node) {
    const style = getNodeStyle(node.kind);
    return style.radius;
  }

  function fitPositionsToViewport(scene, inputPositions, width, height) {
    const safeWidth = Math.max(32, Number(width) || 32);
    const safeHeight = Math.max(32, Number(height) || 32);
    const padLeft = LAYOUT_MARGIN + 24;
    const padRight = LAYOUT_MARGIN + 56;
    const padTop = LAYOUT_MARGIN + 16;
    const padBottom = LAYOUT_MARGIN + 24;
    const availW = Math.max(1, safeWidth - padLeft - padRight);
    const availH = Math.max(1, safeHeight - padTop - padBottom);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i];
      const pos = inputPositions[node.id];
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        continue;
      }
      const r = getNodeRadius(node) + 3;
      minX = Math.min(minX, pos.x - r);
      minY = Math.min(minY, pos.y - r);
      maxX = Math.max(maxX, pos.x + r);
      maxY = Math.max(maxY, pos.y + r);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return inputPositions;
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min(availW / spanX, availH / spanY);
    const usedW = spanX * scale;
    const usedH = spanY * scale;
    const extraX = (availW - usedW) * 0.5;
    const extraY = (availH - usedH) * 0.5;
    const baseX = padLeft + extraX;
    const baseY = padTop + extraY;

    const output = Object.create(null);
    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i];
      const pos = inputPositions[node.id];
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        continue;
      }
      output[node.id] = {
        x: baseX + (pos.x - minX) * scale,
        y: baseY + (pos.y - minY) * scale
      };
    }
    return output;
  }

  function buildManualLayout(scene, width, height) {
    const tiers = Object.create(null);
    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i];
      const key = String(Math.max(0, Math.floor(node.tier)));
      if (!tiers[key]) {
        tiers[key] = [];
      }
      tiers[key].push(node);
    }

    const tierKeys = Object.keys(tiers)
      .map((key) => Number(key))
      .sort((a, b) => a - b);
    const maxTier = tierKeys.length > 0 ? tierKeys[tierKeys.length - 1] : 0;
    const minX = LAYOUT_MARGIN;
    const maxX = Math.max(minX + 1, width - LAYOUT_MARGIN);
    const minY = LAYOUT_MARGIN;
    const maxY = Math.max(minY + 1, height - LAYOUT_MARGIN);
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    const positions = Object.create(null);
    for (let ti = 0; ti < tierKeys.length; ti += 1) {
      const tier = tierKeys[ti];
      const nodes = tiers[String(tier)];
      const x = minX + (maxTier <= 0 ? 0.5 : tier / maxTier) * spanX;
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i];
        const y = minY + ((i + 1) / (nodes.length + 1)) * spanY;
        positions[n.id] = { x, y };
      }
    }
    return fitPositionsToViewport(scene, positions, width, height);
  }

  function getElkCtor() {
    if (typeof global.ELK === "function") {
      return global.ELK;
    }
    if (global.elk && typeof global.elk.ELK === "function") {
      return global.elk.ELK;
    }
    return null;
  }

  function getElkInstance() {
    if (state.elk) {
      return state.elk;
    }
    const Ctor = getElkCtor();
    if (!Ctor) {
      return null;
    }
    try {
      state.elk = new Ctor();
      state.elkEnabled = true;
      return state.elk;
    } catch (error) {
      void error;
      state.elkEnabled = false;
      return null;
    }
  }

  function buildElkGraph(scene) {
    const children = [];
    const edges = [];
    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i];
      const radius = getNodeRadius(node);
      children.push({
        id: node.id,
        width: radius * 2 + 12,
        height: radius * 2 + 12
      });
    }
    for (let i = 0; i < scene.edges.length; i += 1) {
      const edge = scene.edges[i];
      edges.push({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target]
      });
    }
    return {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "POLYLINE",
        "elk.layered.spacing.nodeNodeBetweenLayers": "68",
        "elk.spacing.nodeNode": "34",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP"
      },
      children,
      edges
    };
  }

  function normalizeElkLayout(scene, elkResult, width, height) {
    if (!elkResult || !Array.isArray(elkResult.children) || elkResult.children.length === 0) {
      return null;
    }
    const byId = Object.create(null);
    for (let i = 0; i < elkResult.children.length; i += 1) {
      const child = elkResult.children[i];
      if (child && typeof child.id === "string") {
        byId[child.id] = child;
      }
    }

    const rawCenters = Object.create(null);

    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i];
      const child = byId[node.id];
      if (!child) {
        return null;
      }
      const cx = Number(child.x) + Number(child.width) * 0.5;
      const cy = Number(child.y) + Number(child.height) * 0.5;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        return null;
      }
      rawCenters[node.id] = { x: cx, y: cy };
    }
    return fitPositionsToViewport(scene, rawCenters, width, height);
  }

  function getLayoutKey(mode, width, height) {
    return normalizeMode(mode) + "|" + bucketSize(width) + "|" + bucketSize(height);
  }

  function requestElkLayout(mode, width, height) {
    const key = getLayoutKey(mode, width, height);
    if (state.layoutPending[key]) {
      return;
    }
    const elk = getElkInstance();
    if (!elk || typeof elk.layout !== "function") {
      return;
    }
    const scene = buildSceneSpec(mode);
    const graph = buildElkGraph(scene);
    state.layoutPending[key] = true;
    Promise.resolve(elk.layout(graph))
      .then((layoutResult) => {
        const normalized = normalizeElkLayout(scene, layoutResult, bucketSize(width), bucketSize(height));
        if (!normalized) {
          return;
        }
        const entry = state.layoutCache[key];
        if (!entry || !entry.scene || entry.scene.mode !== scene.mode) {
          return;
        }
        entry.elkPositions = normalized;
      })
      .catch((error) => {
        void error;
      })
      .finally(() => {
        delete state.layoutPending[key];
      });
  }

  function getSceneLayout(mode, width, height) {
    const scene = buildSceneSpec(mode);
    const key = getLayoutKey(mode, width, height);
    const cached = state.layoutCache[key];
    if (cached && cached.scene.mode === scene.mode) {
      requestElkLayout(scene.mode, width, height);
      return cached;
    }
    state.layoutCache[key] = {
      scene,
      manualPositions: buildManualLayout(scene, bucketSize(width), bucketSize(height)),
      elkPositions: null
    };
    requestElkLayout(scene.mode, width, height);
    return state.layoutCache[key];
  }

  function clearPixiSurface() {
    if (!state.diagramLayer) {
      return;
    }
    const oldChildren = state.diagramLayer.removeChildren();
    for (let i = 0; i < oldChildren.length; i += 1) {
      const child = oldChildren[i];
      if (child && typeof child.destroy === "function") {
        child.destroy({ children: true });
      }
    }
  }

  function destroyEmitter() {
    if (state.emitter && typeof state.emitter.destroy === "function") {
      try {
        state.emitter.destroy();
      } catch (error) {
        void error;
      }
    }
    state.emitter = null;
    state.emitterContainer = null;
    state.emitterFailed = false;
    state.emitterRetryAfterMs = 0;
  }

  function destroyRenderer() {
    destroyEmitter();
    if (state.renderer && typeof state.renderer.destroy === "function") {
      state.renderer.destroy(true);
    }
    if (state.stage && typeof state.stage.destroy === "function") {
      state.stage.destroy({
        children: true,
        texture: false,
        baseTexture: false
      });
    }
    state.renderer = null;
    state.stage = null;
    state.diagramLayer = null;
    state.particleLayer = null;
    state.view = null;
    state.width = 0;
    state.height = 0;
    invalidateCachedFrame();
  }

  function isPixiRendererAvailable() {
    const pixi = global.PIXI;
    if (!pixi || typeof pixi !== "object") {
      return false;
    }

    if (state.pixiWebglUnavailable === true) {
      return false;
    }

    if (typeof pixi.utils !== "object" || typeof pixi.utils.isWebGLSupported !== "function") {
      return true;
    }

    try {
      const supported = !!pixi.utils.isWebGLSupported();
      if (!supported) {
        state.pixiWebglUnavailable = true;
      }
      return supported;
    } catch (error) {
      state.pixiWebglUnavailable = true;
      return false;
    }
  }

  function ensureRenderer(width, height) {
    if (!global.PIXI || typeof global.PIXI !== "object") {
      return false;
    }

    if (!isPixiRendererAvailable()) {
      if (state.debug.activeRenderMode !== "canvas-fallback") {
        setFailure(
          "ensureRenderer",
          "WebGL is unavailable; using deterministic 2D canvas diagram fallback"
        );
        state.debug.activeRenderMode = "canvas-fallback";
      }
      return false;
    }

    const PIXI = global.PIXI;
    const view = typeof document !== "undefined" ? document.createElement("canvas") : null;

    function createRendererWithMode(mode) {
      if (mode === "auto" && typeof PIXI.autoDetectRenderer === "function") {
        return {
          mode: "auto",
          renderer: PIXI.autoDetectRenderer({
            view,
            width,
            height,
            antialias: true,
            backgroundAlpha: 0
          })
        };
      }
      if (mode === "renderer-webgl" && typeof PIXI.Renderer === "function") {
        return {
          mode: "renderer-webgl",
          renderer: new PIXI.Renderer({
            view,
            width,
            height,
            antialias: true,
            backgroundAlpha: 0
          })
        };
      }
      if (mode === "renderer-canvas-forced" && typeof PIXI.Renderer === "function") {
        return {
          mode: "renderer-canvas-forced",
          renderer: new PIXI.Renderer({
            view,
            width,
            height,
            antialias: true,
            backgroundAlpha: 0,
            forceCanvas: true
          })
        };
      }
      if (mode === "canvas" && typeof PIXI.CanvasRenderer === "function") {
        return {
          mode: "canvas",
          renderer: new PIXI.CanvasRenderer({
            view,
            width,
            height,
            antialias: true,
            backgroundAlpha: 0,
            forceCanvas: true
          })
        };
      }
      return null;
    }

    if (
      state.renderer &&
      state.stage &&
      state.diagramLayer &&
      state.particleLayer &&
      state.view &&
      state.diagramLayer.parent === state.stage &&
      state.particleLayer.parent === state.stage
    ) {
      if (state.width !== width || state.height !== height) {
        state.width = width;
        state.height = height;
        if (typeof state.renderer.resize === "function") {
          state.renderer.resize(width, height);
        }
        if (state.view) {
          state.view.width = width;
          state.view.height = height;
        }
      }
      return true;
    }

    try {
      if (!view) {
        return false;
      }
      const candidates = ["auto", "renderer-webgl", "renderer-canvas-forced"];
      let renderer = null;
      let created = null;
      let lastError = null;
      for (let i = 0; i < candidates.length; i += 1) {
        const mode = candidates[i];
        let current = null;
        try {
          current = createRendererWithMode(mode);
        } catch (error) {
          current = null;
          lastError = error;
        }
        if (!current || !current.renderer || typeof current.renderer.render !== "function") {
          continue;
        }
        renderer = current.renderer;
        created = current.mode;
        break;
      }
      if (!renderer) {
        if (lastError) {
          setFailure("ensureRenderer", lastError);
        }
        return false;
      }
      if (!renderer || typeof renderer.render !== "function") {
        state.debug.activeRenderMode = "none";
        return false;
      }

      state.renderer = renderer;
      state.stage = new PIXI.Container();
      state.diagramLayer = new PIXI.Container();
      state.particleLayer = new PIXI.Container();
      state.stage.addChild(state.diagramLayer, state.particleLayer);
      state.view = view;
      state.width = width;
      state.height = height;
      state.debug.activeRenderMode = created || "unknown";
      state.debug.pixiAvailable = true;
      clearFailure();
      return true;
    } catch (error) {
      setFailure("ensureRenderer", error);
      destroyRenderer();
      state.debug.pixiAvailable = false;
      return false;
    }
  }

  function resolveParticleEmitterCtor() {
    const maybePixiParticles = global.PIXI && global.PIXI.particles && global.PIXI.particles.Emitter;
    if (typeof maybePixiParticles === "function") {
      return maybePixiParticles;
    }
    if (typeof global.Emitter === "function") {
      return global.Emitter;
    }
    if (global.particles && typeof global.particles.Emitter === "function") {
      return global.particles.Emitter;
    }
    return null;
  }

  function ensureParticleEmitter(container, accent) {
    if (!container || !global.PIXI || !global.PIXI.Texture) {
      return null;
    }
    if (state.emitterFailed && Date.now() < state.emitterRetryAfterMs) {
      return null;
    }
    if (state.emitter && state.emitterContainer === container) {
      return state.emitter;
    }
    destroyEmitter();
    const EmitterCtor = resolveParticleEmitterCtor();
    if (!EmitterCtor) {
      return null;
    }
    const colorRgb = toRgb(accent);
    const startColor =
      "#" +
      [colorRgb.r, colorRgb.g, colorRgb.b]
        .map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, "0"))
        .join("");
    const config = {
      lifetime: { min: 0.2, max: 0.45 },
      frequency: 0.03,
      emitterLifetime: -1,
      maxParticles: 120,
      addAtBack: false,
      pos: { x: 0, y: 0 },
      behaviors: [
        { type: "alpha", config: { alpha: { list: [{ time: 0, value: 0.7 }, { time: 1, value: 0 }] } } },
        { type: "scale", config: { scale: { list: [{ time: 0, value: 0.12 }, { time: 1, value: 0.02 }] } } },
        { type: "color", config: { color: { list: [{ time: 0, value: startColor }, { time: 1, value: "#ffffff" }] } } },
        { type: "speed", config: { speed: { list: [{ time: 0, value: 80 }, { time: 1, value: 12 }] } } },
        { type: "rotationStatic", config: { min: 0, max: 360 } },
        { type: "spawnShape", config: { type: "circle", data: { x: 0, y: 0, r: 8 } } },
        { type: "textureSingle", config: { texture: "white" } }
      ]
    };

    try {
      let emitter = null;
      try {
        emitter = new EmitterCtor(container, config);
      } catch (firstError) {
        void firstError;
        emitter = new EmitterCtor(container, [global.PIXI.Texture.WHITE], config);
      }
      if (!emitter) {
        return null;
      }
      emitter.emit = true;
      state.emitter = emitter;
      state.emitterContainer = container;
      state.emitterFailed = false;
      state.emitterRetryAfterMs = 0;
      state.debug.emitterAvailable = true;
      return emitter;
    } catch (error) {
      setFailure("ensureParticleEmitter", error);
      state.emitterFailed = true;
      state.emitterRetryAfterMs = Date.now() + 700;
      state.debug.emitterAvailable = false;
      return null;
    }
  }

  function drawArrow(graphics, from, to, color, alpha) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / dist;
    const uy = dy / dist;
    const arrowLen = 11;
    const spread = 4.6;
    const tipX = to.x - ux * 12;
    const tipY = to.y - uy * 12;
    const leftX = tipX - ux * arrowLen - uy * spread;
    const leftY = tipY - uy * arrowLen + ux * spread;
    const rightX = tipX - ux * arrowLen + uy * spread;
    const rightY = tipY - uy * arrowLen - ux * spread;
    graphics.beginFill(color, alpha);
    graphics.moveTo(tipX, tipY);
    graphics.lineTo(leftX, leftY);
    graphics.lineTo(rightX, rightY);
    graphics.lineTo(tipX, tipY);
    graphics.endFill();
  }

  function resolveStage(scene, time, reducedMotion) {
    const safeStages = Array.isArray(scene.stages) ? scene.stages : [];
    if (safeStages.length <= 0) {
      return 0;
    }
    if (reducedMotion) {
      return 0;
    }
    const safeTime = Number.isFinite(time) ? time : 0;
    return Math.floor(Math.max(0, safeTime) / ACTIVE_STAGE_SECONDS) % safeStages.length;
  }

  function addEdgeLabels(root, scene, positions, mode, tokens) {
    if (!global.PIXI || !global.PIXI.Text || !global.PIXI.TextStyle) {
      return;
    }
    const { countMap, slotMap } = buildEdgeLabelMeta(scene, positions);

    for (let i = 0; i < scene.edges.length; i += 1) {
      const edge = scene.edges[i];
      if (!edge.label) {
        continue;
      }
      const source = positions[edge.source];
      const target = positions[edge.target];
      if (!source || !target) {
        continue;
      }
      const groupSize = countMap[edge.target] || 1;
      const slot = slotMap[edge.id] || 0;
      const placement = resolveEdgeLabelPosition(edge, source, target, groupSize, slot, mode);
      const purpose = edge.labelPurpose || (groupSize > 1 ? "edgeChip" : "edgeTiny");
      const spec = buildTextSpec(mode, purpose, {
        labelTone: edge.labelTone,
        labelPurpose: edge.labelPurpose,
        labelLayout: edge.labelLayout,
        maxWidth: edge.labelMaxWidth
      });
      renderPixiLabelCard(root, edge.label, placement.x, placement.y, spec, tokens);
    }
  }

  function drawPulses(root, scene, positions, stageIndex, accentInt, reducedMotion, time) {
    if (reducedMotion || !global.PIXI || !global.PIXI.Graphics) {
      return;
    }
    const stageGroups = Array.isArray(scene.stages) ? scene.stages : [];
    const currentGroup = stageGroups[stageIndex] || [];
    const activeNodeSet = new Set(currentGroup);
    const pulseGraphics = new global.PIXI.Graphics();
    for (let i = 0; i < scene.edges.length; i += 1) {
      const edge = scene.edges[i];
      if (!activeNodeSet.has(edge.target)) {
        continue;
      }
      const from = positions[edge.source];
      const to = positions[edge.target];
      if (!from || !to) {
        continue;
      }
      const progress = ((time * 0.75 + i * 0.17) % 1 + 1) % 1;
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      pulseGraphics.beginFill(accentInt, 0.92);
      pulseGraphics.drawCircle(x, y, 2.8);
      pulseGraphics.endFill();
      pulseGraphics.beginFill(0xffffff, 0.36);
      pulseGraphics.drawCircle(x, y, 5.6);
      pulseGraphics.endFill();
    }
    root.addChild(pulseGraphics);
  }

  function drawNode(root, node, position, accentInt, tokens, sceneMode) {
    if (!global.PIXI || !global.PIXI.Graphics || !global.PIXI.Text || !global.PIXI.TextStyle) {
      return;
    }
    const style = getNodeStyle(node.kind);
    const accentRgb = toRgb("#" + accentInt.toString(16).padStart(6, "0"));
    const fogRgb = toRgb(tokens.fog);
    const fillRgb = mixRgb(fogRgb, accentRgb, style.colorMix);
    const fillColor = rgbToHexInt(fillRgb);
    const strokeColor = parseHexColor(tokens.ink, 0x1f2937);
    const radius = style.radius;

    const shape = new global.PIXI.Graphics();
    shape.lineStyle(style.strokeWidth, strokeColor, 0.9);
    shape.beginFill(fillColor, style.fillAlpha);
    if (node.kind === "operator" || node.kind === "metric") {
      shape.drawRoundedRect(position.x - radius, position.y - radius, radius * 2, radius * 2, 6);
    } else {
      shape.drawCircle(position.x, position.y, radius);
    }
    shape.endFill();
    root.addChild(shape);

    if (shouldRenderNodeLabel(sceneMode, node)) {
      const spec = buildTextSpec(sceneMode, node.labelPurpose || "nodePrimary", node);
      const labelPlacement = resolveNodeLabelPlacement(node, position, sceneMode, { radius, mode: sceneMode });
      renderPixiLabelCard(root, node.label, labelPlacement.x, labelPlacement.y, spec, tokens);
    }
  }

  function drawSceneGraph(root, scene, positions, accent, stageIndex, reducedMotion, time) {
    if (!global.PIXI || !global.PIXI.Graphics) {
      return;
    }

    const tokens = getTokens();
    const accentInt = parseHexColor(accent || tokens.accent, 0xc084fc);
    const inkInt = parseHexColor(tokens.ink, 0x1f2937);

    const bg = new global.PIXI.Graphics();
    bg.beginFill(parseHexColor(tokens.fog, 0xe2e8f0), 0.3);
    bg.drawRoundedRect(8, 8, Math.max(24, state.width - 16), Math.max(24, state.height - 16), 14);
    bg.endFill();
    root.addChild(bg);

    const edgeGraphics = new global.PIXI.Graphics();
    const stageGroups = Array.isArray(scene.stages) ? scene.stages : [];
    const activeNodeSet = new Set(stageGroups[stageIndex] || []);
    for (let i = 0; i < scene.edges.length; i += 1) {
      const edge = scene.edges[i];
      const source = positions[edge.source];
      const target = positions[edge.target];
      if (!source || !target) {
        continue;
      }
      const isActive = activeNodeSet.has(edge.target);
      const alpha = isActive ? 0.88 : 0.36 + edge.emphasis * 0.2;
      const width = isActive ? 2.6 : 1.6;
      const color = isActive ? accentInt : inkInt;
      edgeGraphics.lineStyle(width, color, alpha);
      edgeGraphics.moveTo(source.x, source.y);
      edgeGraphics.lineTo(target.x, target.y);
      drawArrow(edgeGraphics, source, target, color, alpha);
    }
    root.addChild(edgeGraphics);

    drawLayerCaptions(root, scene, positions, "pixi", tokens);
    addEdgeLabels(root, scene, positions, scene.mode, tokens);

    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i];
      const pos = positions[node.id];
      if (!pos) {
        continue;
      }
      drawNode(root, node, pos, accentInt, tokens, scene.mode);
    }

    drawPulses(root, scene, positions, stageIndex, accentInt, reducedMotion, Number.isFinite(time) ? time : 0);
  }

  function drawLayerCaptions(root, scene, positions, mode, tokens) {
    const captions = Array.isArray(scene.captions) ? scene.captions : [];
    if (!captions.length || !tokens) {
      return;
    }
    const safeMode = normalizeMode(mode || "");
    const sceneMode = scene && scene.mode ? scene.mode : safeMode;
    if (!global.PIXI || !global.PIXI.Graphics || !global.PIXI.Text || !global.PIXI.TextStyle || !positions) {
      return;
    }
    for (let i = 0; i < captions.length; i += 1) {
      const caption = captions[i];
      if (!caption || !caption.text) {
        continue;
      }
      if (caption.layout === "layerMarker") {
        const tier = Number(caption.tier);
        if (!Number.isFinite(tier)) {
          continue;
        }
        const nodesInTier = scene.nodes.filter((node) => Number(node.tier) === tier);
        if (!nodesInTier.length) {
          continue;
        }
        let sumX = 0;
        let minY = Infinity;
        let maxY = -Infinity;
        let count = 0;
        for (let n = 0; n < nodesInTier.length; n += 1) {
          const nId = nodesInTier[n].id;
          const pos = positions[nId];
          if (!pos) {
            continue;
          }
          sumX += pos.x;
          const nodeStyle = getNodeStyle(nodesInTier[n].kind);
          const nodeRadius = nodeStyle ? nodeStyle.radius : 14;
          minY = Math.min(minY, pos.y - nodeRadius - 6);
          maxY = Math.max(maxY, pos.y + nodeRadius + 6);
          count += 1;
        }
        if (!count) {
          continue;
        }
        const avgX = sumX / count;
        const spec = buildTextSpec(sceneMode, caption.purpose || "heading", caption);
        const markerWidth = Math.max(48, spec.chipPaddingX * 2 + 26);
        const markerHeight = Math.max(44, (maxY - minY) + 20);
        const markerX = avgX - markerWidth * 0.5;
        const markerY = minY - 12;
        const marker = new global.PIXI.Graphics();
        const markerFillAlpha = sceneMode === "layers_stack" ? 0.16 : 0.28;
        const markerStrokeAlpha = sceneMode === "layers_stack" ? 0.48 : 0.65;
        marker.beginFill(parseHexColor(tokens.fog, 0xe2e8f0), markerFillAlpha);
        marker.drawRoundedRect(markerX, markerY, markerWidth, markerHeight, 20);
        marker.lineStyle(1, parseHexColor(tokens.ink, 0x1f2937), markerStrokeAlpha);
        marker.drawRoundedRect(markerX, markerY, markerWidth, markerHeight, 20);
        marker.endFill();
        root.addChild(marker);
        let labelY = markerY + markerHeight * 0.45;
        if (sceneMode === "layers_stack") {
          labelY = Math.max(14, markerY - 26);
        }
        renderPixiLabelCard(root, caption.text, avgX, labelY, spec, tokens);
        continue;
      }
      const spec = buildTextSpec(sceneMode, caption.purpose || "caption", caption);
      let x = 0;
      let y = 0;
      const sceneW = state.width;
      const sceneH = state.height;
      if (caption.layout === "top") {
        x = sceneW * 0.5;
        y = 16;
      } else if (caption.layout === "rightTop") {
        x = sceneW * 0.82;
        y = Math.max(22, 10 + i * 30);
      } else if (caption.layout === "rightBottom") {
        x = sceneW * 0.84;
        y = sceneH - 38 - i * 16;
      } else if (caption.layout === "leftTop") {
        x = 18;
        y = 16 + i * 32;
      } else if (caption.layout === "leftBottom") {
        x = 18;
        y = sceneH - 28 - i * 28;
      } else if (caption.layout === "bottom") {
        x = sceneW * 0.5;
        y = sceneH - 28;
      } else {
        x = 18;
        y = 16;
      }
      renderPixiLabelCard(root, caption.text, x, y, spec, tokens);
    }
  }

  function drawFallbackSparks(root, positions, stageNodes, accentInt, time) {
    if (!global.PIXI || !global.PIXI.Graphics || !Array.isArray(stageNodes) || stageNodes.length <= 0) {
      return;
    }
    const spark = new global.PIXI.Graphics();
    for (let i = 0; i < stageNodes.length; i += 1) {
      const id = stageNodes[i];
      const center = positions[id];
      if (!center) {
        continue;
      }
      const spread = 11;
      for (let p = 0; p < 4; p += 1) {
        const angle = time * 1.8 + p * (Math.PI * 0.5);
        const radius = spread + Math.sin(time * 2.2 + p) * 2.5;
        const x = center.x + Math.cos(angle) * radius;
        const y = center.y + Math.sin(angle) * radius;
        spark.beginFill(accentInt, 0.32);
        spark.drawCircle(x, y, 1.9);
        spark.endFill();
      }
    }
    root.addChild(spark);
  }

  function roundRectPath(context, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
    if (typeof context.roundRect === "function") {
      context.beginPath();
      context.roundRect(x, y, width, height, safeRadius);
      return;
    }
    const left = x;
    const top = y;
    const right = x + width;
    const bottom = y + height;
    const r = safeRadius;
    context.beginPath();
    context.moveTo(left + r, top);
    context.lineTo(right - r, top);
    context.quadraticCurveTo(right, top, right, top + r);
    context.lineTo(right, bottom - r);
    context.quadraticCurveTo(right, bottom, right - r, bottom);
    context.lineTo(left + r, bottom);
    context.quadraticCurveTo(left, bottom, left, bottom - r);
    context.lineTo(left, top + r);
    context.quadraticCurveTo(left, top, left + r, top);
    context.closePath();
  }

  function drawCanvasArrow(context, from, to, color, alpha, width) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / dist;
    const uy = dy / dist;
    const arrowLen = 11;
    const spread = 4.6;
    const tipX = to.x - ux * 12;
    const tipY = to.y - uy * 12;
    const leftX = tipX - ux * arrowLen - uy * spread;
    const leftY = tipY - uy * arrowLen + ux * spread;
    const rightX = tipX - ux * arrowLen + uy * spread;
    const rightY = tipY - uy * arrowLen - ux * spread;
    const strokeWidth = Math.max(1, Number(width) || 1.2);
    const safeAlpha = clamp(alpha, 0, 1);

    context.strokeStyle = color;
    context.fillStyle = color;
    context.globalAlpha = safeAlpha;
    context.lineWidth = strokeWidth;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(leftX, leftY);
    context.lineTo(rightX, rightY);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
  }

  function drawCanvasDiagram(context, rect, scene, positions, accent, stageIndex, reducedMotion, time) {
    if (!context || !rect || !scene || !positions) {
      return false;
    }
    const sceneSafe = scene;
    const stageGroups = Array.isArray(sceneSafe.stages) ? sceneSafe.stages : [];
    const activeNodeSet = new Set(stageGroups[stageIndex] || []);
    const tokens = getTokens();
    const accentInt = parseHexColor(accent || tokens.accent, 0xc084fc);
    const inkInt = parseHexColor(tokens.ink, 0x1f2937);
    const fogInt = parseHexColor(tokens.fog, 0xe2e8f0);
    const panelX = Number(rect.x) || 0;
    const panelY = Number(rect.y) || 0;
    const panelW = Math.max(1, Number(rect.w) || 0);
    const panelH = Math.max(1, Number(rect.h) || 0);
    const safeTime = Number.isFinite(time) ? time : 0;

    context.save();
    context.beginPath();
    context.rect(panelX, panelY, panelW, panelH);
    context.clip();

    context.fillStyle = rgbToRgba(toRgb("#" + fogInt.toString(16).padStart(6, "0")), 0.3);
    roundRectPath(context, panelX + 8, panelY + 8, Math.max(24, panelW - 16), Math.max(24, panelH - 16), 14);
    context.fill();

    const { countMap, slotMap } = buildEdgeLabelMeta(sceneSafe, positions);

    for (let i = 0; i < sceneSafe.edges.length; i += 1) {
      const edge = sceneSafe.edges[i];
      const source = positions[edge.source];
      const target = positions[edge.target];
      if (!source || !target) {
        continue;
      }
      const isActive = activeNodeSet.has(edge.target);
      const alpha = isActive ? 0.88 : 0.36 + (Number(edge.emphasis) || 0.5) * 0.2;
      const width = isActive ? 2.6 : 1.6;
      const colorInt = isActive ? accentInt : inkInt;
      const lineColor = rgbToRgba(toRgb("#" + colorInt.toString(16).padStart(6, "0")), alpha);
      drawCanvasArrow(
        context,
        { x: panelX + source.x, y: panelY + source.y },
        { x: panelX + target.x, y: panelY + target.y },
        lineColor,
        alpha,
        width
      );
    }

    for (let i = 0; i < sceneSafe.edges.length; i += 1) {
      const edge = sceneSafe.edges[i];
      if (!edge.label) {
        continue;
      }
      const source = positions[edge.source];
      const target = positions[edge.target];
      if (!source || !target) {
        continue;
      }
      const groupSize = countMap[edge.target] || 1;
      const slot = slotMap[edge.id] || 0;
      const placement = resolveEdgeLabelPosition(edge, source, target, groupSize, slot, scene.mode || "network_basic");
      const spec = buildTextSpec(sceneSafe.mode, edge.labelPurpose || (groupSize > 1 ? "edgeChip" : "edgeTiny"), edge);
      const labelX = panelX + placement.x;
      const labelY = panelY + placement.y;
      renderLabelCard(context, edge.label, labelX, labelY, spec, tokens, sceneSafe.mode);
    }

    drawCanvasLayerCaptions(context, rect, sceneSafe, positions, tokens, sceneSafe.mode);

    for (let i = 0; i < sceneSafe.nodes.length; i += 1) {
      const node = sceneSafe.nodes[i];
      const pos = positions[node.id];
      if (!pos) {
        continue;
      }
      const style = getNodeStyle(node.kind);
      const accentRgb = toRgb("#" + accentInt.toString(16).padStart(6, "0"));
      const fogRgb = toRgb(tokens.fog);
      const fillRgb = mixRgb(fogRgb, accentRgb, style.colorMix);
      const fillColor = rgbToHexInt(fillRgb);
      const strokeColor = parseHexColor(tokens.ink, 0x1f2937);
      const radius = style.radius;
      const x = panelX + pos.x;
      const y = panelY + pos.y;

      context.beginPath();
      context.fillStyle = rgbToRgba(toRgb("#" + fillColor.toString(16).padStart(6, "0")), style.fillAlpha);
      context.strokeStyle = rgbToRgba(toRgb("#" + strokeColor.toString(16).padStart(6, "0")), 0.9);
      context.lineWidth = style.strokeWidth;
      if (node.kind === "operator" || node.kind === "metric") {
        roundRectPath(context, x - radius, y - radius, radius * 2, radius * 2, 6);
      } else {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
      }
      context.fill();
      context.stroke();

      if (shouldRenderNodeLabel(sceneSafe.mode, node)) {
        const spec = buildTextSpec(sceneSafe.mode, node.labelPurpose || "nodePrimary", node);
        const labelPlacement = resolveNodeLabelPlacement(node, { x, y }, sceneSafe.mode || "network_basic", { radius });
        renderLabelCard(context, node.label, labelPlacement.x, labelPlacement.y, spec, tokens, sceneSafe.mode);
      }
    }

    if (!reducedMotion) {
      for (let i = 0; i < sceneSafe.edges.length; i += 1) {
        const edge = sceneSafe.edges[i];
        if (!activeNodeSet.has(edge.target)) {
          continue;
        }
        const from = positions[edge.source];
        const to = positions[edge.target];
        if (!from || !to) {
          continue;
        }
        const progress = ((safeTime * 0.75 + i * 0.17) % 1 + 1) % 1;
        const x = panelX + from.x + (to.x - from.x) * progress;
        const y = panelY + from.y + (to.y - from.y) * progress;
        context.fillStyle = rgbToRgba(toRgb("#" + accentInt.toString(16).padStart(6, "0")), 0.32);
        context.beginPath();
        context.arc(x, y, 2.8, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = rgbToRgba(toRgb("#ffffff"), 0.36);
        context.beginPath();
        context.arc(x, y, 5.6, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.restore();
    return true;
  }

  function drawCanvasLayerCaptions(context, rect, scene, positions, tokens, mode) {
    const safeMode = normalizeMode(mode || "network_basic");
    const captions = Array.isArray(scene.captions) ? scene.captions : [];
    if (!captions.length) {
      return;
    }
    const safeRect = rect || { x: 0, y: 0, w: 0, h: 0 };
    const panelX = Number(safeRect.x) || 0;
    const panelY = Number(safeRect.y) || 0;
    const panelW = Math.max(1, Number(safeRect.w) || 0);
    const panelH = Math.max(1, Number(safeRect.h) || 0);
    for (let i = 0; i < captions.length; i += 1) {
      const caption = captions[i];
      if (!caption || !caption.text) {
        continue;
      }
      if (caption.layout === "layerMarker") {
        const tier = Number(caption.tier);
        if (!Number.isFinite(tier)) {
          continue;
        }
        const layerNodes = scene.nodes.filter((node) => Number(node.tier) === tier);
        let sumX = 0;
        let minY = Infinity;
        let maxY = -Infinity;
        let count = 0;
        for (let n = 0; n < layerNodes.length; n += 1) {
          const pos = positions[layerNodes[n].id];
          if (!pos) {
            continue;
          }
          const style = getNodeStyle(layerNodes[n].kind);
          const radius = style ? style.radius : 14;
          sumX += pos.x;
          minY = Math.min(minY, pos.y - radius - 4);
          maxY = Math.max(maxY, pos.y + radius + 4);
          count += 1;
        }
        if (!count) {
          continue;
        }
        const avgX = sumX / count;
        const spec = buildTextSpec(safeMode, caption.purpose || "heading", caption);
        const markerW = Math.max(44, spec.chipPaddingX * 2 + 20);
        const markerH = Math.max(42, maxY - minY + 18);
        const markerX = panelX + avgX - markerW * 0.5;
        const markerY = panelY + minY - 12;
        const markerFillAlpha = safeMode === "layers_stack" ? 0.16 : 0.28;
        const markerStrokeAlpha = safeMode === "layers_stack" ? 0.48 : 0.65;
        context.fillStyle = rgbToRgba(toRgb("#" + (tokens.fog || "#e2e8f0").replace("#", "")), markerFillAlpha);
        context.strokeStyle = rgbToRgba(toRgb("#" + (tokens.ink || "#1f2937").replace("#", "")), markerStrokeAlpha);
        context.lineWidth = 1;
        roundRectPath(context, markerX, markerY, markerW, markerH, 20);
        context.fill();
        context.stroke();
        let labelY = markerY + markerH * 0.45;
        if (safeMode === "layers_stack") {
          labelY = Math.max(panelY + 14, markerY - 26);
        }
        renderLabelCard(
          context,
          caption.text,
          panelX + avgX,
          labelY,
          spec,
          tokens,
          safeMode
        );
        continue;
      }

      const spec = buildTextSpec(safeMode, caption.purpose || "caption", caption);
      let x = 0;
      let y = 0;
      if (caption.layout === "top") {
        x = panelX + panelW * 0.5;
        y = panelY + 16;
      } else if (caption.layout === "rightTop") {
        x = panelX + panelW * 0.84;
        y = panelY + 20 + i * 28;
      } else if (caption.layout === "rightBottom") {
        x = panelX + panelW * 0.84;
        y = panelY + panelH - 36 - i * 16;
      } else if (caption.layout === "leftTop") {
        x = panelX + 18;
        y = panelY + 16 + i * 28;
      } else if (caption.layout === "leftBottom") {
        x = panelX + 18;
        y = panelY + panelH - 30 - i * 26;
      } else if (caption.layout === "bottom") {
        x = panelX + panelW * 0.5;
        y = panelY + panelH - 24;
      } else {
        x = panelX + 18;
        y = panelY + 16;
      }
      renderLabelCard(context, caption.text, x, y, spec, tokens, safeMode);
    }
  }

  function updateParticleEmitter(stageNodes, positions, accent, reducedMotion, deltaSec) {
    if (reducedMotion || !Array.isArray(stageNodes) || stageNodes.length <= 0) {
      if (state.emitter) {
        state.emitter.emit = false;
      }
      return;
    }
    const pivot = positions[stageNodes[0]];
    if (!pivot || !state.particleLayer || !state.diagramLayer) {
      return;
    }
    const emitter = ensureParticleEmitter(state.particleLayer, accent);
    if (emitter && typeof emitter.update === "function") {
      emitter.emit = true;
      if (typeof emitter.updateOwnerPos === "function") {
        emitter.updateOwnerPos(pivot.x, pivot.y);
      } else if (emitter.ownerPos) {
        emitter.ownerPos.x = pivot.x;
        emitter.ownerPos.y = pivot.y;
      }
      try {
        emitter.update(Math.max(0.001, deltaSec));
      } catch (error) {
        setFailure("updateParticleEmitter", error);
        destroyEmitter();
        state.emitterFailed = true;
        state.emitterRetryAfterMs = Date.now() + 700;
        state.debug.emitterAvailable = false;
        drawFallbackSparks(state.diagramLayer, positions, stageNodes, parseHexColor(accent, 0xc084fc), Math.max(0.001, deltaSec));
      }
      return;
    }
    drawFallbackSparks(state.diagramLayer, positions, stageNodes, parseHexColor(accent, 0xc084fc), deltaSec);
  }

  function renderTo(ctx, rect, mode, accent, time, reducedMotion) {
    const safeRect = rect && typeof rect === "object" ? rect : null;
    if (!safeRect || safeRect.w <= 0 || safeRect.h <= 0 || !ctx || typeof ctx.drawImage !== "function") {
      state.debug = buildDebugState({
        mode: normalizeMode(mode),
        layoutVersion: "manual",
        activeStage: 0,
        fallbackUsed: true,
        legacyFallbackUsed: true,
        activeRenderMode: "none",
        pixiAvailable: !!global.PIXI,
        elkAvailable: !!getElkCtor(),
        emitterAvailable: !!state.emitter && !state.emitterFailed
      });
      return false;
    }
    const width = Math.max(32, Math.floor(safeRect.w));
    const height = Math.max(32, Math.floor(safeRect.h));
    const resolvedMode = normalizeMode(mode);
    const layoutKey = getLayoutKey(resolvedMode, width, height);
    if (!cachedFrameAvailableFor(layoutKey)) {
      invalidateCachedFrame();
    }

    if (!ensureRenderer(width, height)) {
      const layoutEntry = getSceneLayout(resolvedMode, width, height);
      const stageGroups = Array.isArray(layoutEntry.scene && layoutEntry.scene.stages) ? layoutEntry.scene.stages : [];
      const stageIndex = resolveStage(layoutEntry.scene, time, !!reducedMotion);
      const positions = layoutEntry.scene ? (layoutEntry.elkPositions ? layoutEntry.elkPositions : layoutEntry.manualPositions) : null;
      if (positions && drawCanvasDiagram(ctx, safeRect, layoutEntry.scene, positions, accent, stageIndex, !!reducedMotion, Number(time) || 0)) {
        state.debug = buildDebugState({
          mode: resolvedMode,
          layoutVersion: "manual",
          activeStage: stageIndex,
          legacyFallbackUsed: true,
          fallbackUsed: true,
          activeRenderMode: "canvas-fallback",
          pixiAvailable: !!global.PIXI,
          elkAvailable: !!getElkCtor(),
          emitterAvailable: false
        });
        return true;
      }
      if (drawCachedFrame(ctx, safeRect, layoutKey)) {
        state.debug = buildDebugState({
          mode: resolvedMode,
          layoutVersion: "manual",
          activeStage: 0,
          activeRenderMode: "cached-frame",
          legacyFallbackUsed: false,
          fallbackUsed: false,
          pixiAvailable: !!global.PIXI,
          elkAvailable: !!getElkCtor(),
          emitterAvailable: !!state.emitter && !state.emitterFailed
        });
        return true;
      }
      state.debug = buildDebugState({
        mode: resolvedMode,
        layoutVersion: "manual",
        activeStage: 0,
        legacyFallbackUsed: true,
        activeRenderMode: "canvas-fallback",
        fallbackUsed: true,
        pixiAvailable: !!global.PIXI,
        elkAvailable: !!getElkCtor(),
        emitterAvailable: false
      });
      return false;
    }

    try {
      const layoutEntry = getSceneLayout(resolvedMode, width, height);
      const scene = layoutEntry.scene;
      const resolvedLayoutSource = layoutEntry.elkPositions ? "elk" : "manual";
      if (state.activeLayoutKey !== layoutKey || state.activeLayoutSource !== resolvedLayoutSource) {
        state.activeLayoutKey = layoutKey;
        state.activeLayoutSource = resolvedLayoutSource;
      }
      const useElk = state.activeLayoutSource === "elk" && !!layoutEntry.elkPositions;
      const positions = useElk ? layoutEntry.elkPositions : layoutEntry.manualPositions;
      if (!positions) {
        if (drawCachedFrame(ctx, safeRect, layoutKey)) {
          state.debug = buildDebugState({
            mode: resolvedMode,
            layoutVersion: "manual",
            activeStage: 0,
            legacyFallbackUsed: false,
            fallbackUsed: false,
            activeRenderMode: state.debug.activeRenderMode,
            pixiAvailable: true,
            elkAvailable: !!getElkCtor(),
            emitterAvailable: !!state.emitter && !state.emitterFailed
          });
          return true;
        }
        state.debug = buildDebugState({
          mode: resolvedMode,
          layoutVersion: "manual",
          activeStage: 0,
          legacyFallbackUsed: true,
          fallbackUsed: true,
          activeRenderMode: "canvas-fallback",
          pixiAvailable: true,
          elkAvailable: !!getElkCtor(),
          emitterAvailable: !!state.emitter && !state.emitterFailed
        });
        return false;
      }
      const stageIndex = resolveStage(scene, time, !!reducedMotion);
      const stageNodes = Array.isArray(scene.stages) ? scene.stages[stageIndex] || [] : [];
      const deltaSec = ACTIVE_STAGE_SECONDS / 60;

      clearPixiSurface();
      if (!state.diagramLayer) {
        state.debug = buildDebugState({
          mode: resolvedMode,
          layoutVersion: useElk ? "elk" : "manual",
          activeStage: 0,
          legacyFallbackUsed: true,
          activeRenderMode: state.debug.activeRenderMode,
          fallbackUsed: true,
          pixiAvailable: true,
          elkAvailable: !!getElkCtor(),
          emitterAvailable: !!state.emitter && !state.emitterFailed
        });
        return false;
      }
      drawSceneGraph(state.diagramLayer, scene, positions, accent || DEFAULT_TOKENS.accent, stageIndex, !!reducedMotion, Number(time) || 0);
      updateParticleEmitter(stageNodes, positions, accent || DEFAULT_TOKENS.accent, !!reducedMotion, deltaSec);

      state.renderer.render(state.stage);
      ctx.drawImage(state.view, safeRect.x, safeRect.y, safeRect.w, safeRect.h);
      cacheCurrentFrame(width, height);
      clearFailure();

      state.debug = buildDebugState({
        mode: resolvedMode,
        layoutVersion: useElk ? "elk" : "manual",
        activeRenderMode: state.debug.activeRenderMode,
        legacyFallbackUsed: false,
        activeStage: stageIndex,
        fallbackUsed: false,
        pixiAvailable: true,
        elkAvailable: !!getElkCtor(),
        emitterAvailable: !!state.emitter && !state.emitterFailed
      });
      return true;
    } catch (error) {
      setFailure("renderTo", error);
      if (drawCachedFrame(ctx, safeRect, layoutKey)) {
        state.debug = buildDebugState({
          mode: resolvedMode,
          layoutVersion: "manual",
          activeStage: 0,
          activeRenderMode: state.debug.activeRenderMode,
          legacyFallbackUsed: false,
          fallbackUsed: false,
          pixiAvailable: true,
          elkAvailable: !!getElkCtor(),
          emitterAvailable: !!state.emitter && !state.emitterFailed
        });
        return true;
      }
      state.debug = buildDebugState({
        mode: resolvedMode,
        layoutVersion: "manual",
        activeStage: 0,
        activeRenderMode: "none",
        legacyFallbackUsed: false,
        fallbackUsed: true,
        pixiAvailable: true,
        elkAvailable: !!getElkCtor(),
        emitterAvailable: false
      });
      return false;
    }
  }

  function init() {
    state.debug.pixiAvailable = !!global.PIXI;
    state.debug.elkAvailable = !!getElkCtor();
    state.debug.emitterAvailable = !!resolveParticleEmitterCtor();
    return {
      pixiAvailable: state.debug.pixiAvailable,
      elkAvailable: state.debug.elkAvailable,
      emitterAvailable: state.debug.emitterAvailable,
      schemaVersion: SCHEMA_VERSION
    };
  }

  function getDebugState() {
    return {
      mode: state.debug.mode,
      layoutVersion: state.debug.layoutVersion,
      activeStage: state.debug.activeStage,
      activeLayoutSource: state.debug.activeLayoutSource,
      activeRenderMode: state.debug.activeRenderMode,
      legacyFallbackUsed: !!state.debug.legacyFallbackUsed,
      fallbackUsed: !!state.debug.fallbackUsed,
      pixiAvailable: !!state.debug.pixiAvailable,
      elkAvailable: !!state.debug.elkAvailable,
      emitterAvailable: !!state.debug.emitterAvailable,
      cachedFrameAvailable: !!state.debug.cachedFrameAvailable,
      lastFailure: state.debug.lastFailure,
      lastFailurePhase: state.debug.lastFailurePhase,
      lastFailureAt: Number.isFinite(state.debug.lastFailureAt) ? state.debug.lastFailureAt : 0,
      failureCount: Number.isFinite(state.debug.failureCount) ? state.debug.failureCount : 0,
      schemaVersion: SCHEMA_VERSION
    };
  }

  AIPU.lessonDiagramV2 = {
    init,
    renderTo,
    getDebugState
  };

  init();
})(typeof window !== "undefined" ? window : globalThis);
