(function attachNeuralGlassModule() {
  "use strict";

  const INPUT_DEFS = [
    { id: "logins", label: "Logins", min: 0, max: 30, step: 1 },
    { id: "tickets", label: "Tickets", min: 0, max: 20, step: 1 },
    { id: "tenure", label: "Tenure", min: 0, max: 36, step: 1 },
    { id: "features", label: "Features", min: 0, max: 10, step: 1 }
  ];

  const HIDDEN_KEYS = ["loyal", "frustrated", "engaged"];
  const HIDDEN_LABELS = {
    loyal: "LOYAL",
    frustrated: "FRUSTRATED",
    engaged: "ENGAGED"
  };

  const INPUT_TO_HIDDEN_WEIGHTS = {
    loyal: [3.0, -3.0, 2.0, 0.0],
    frustrated: [-2.0, 3.5, 0.0, -1.0],
    engaged: [2.0, -2.0, 0.0, 2.5]
  };

  const HIDDEN_TO_OUTPUT_WEIGHTS = {
    loyal: -2.7,
    frustrated: 2.2,
    engaged: -0.8
  };

  const PULSE_DURATION = 0.3;
  const BASE_NODE_RADIUS = 18;
  const RISK_LOW_MAX = 29;
  const RISK_HIGH_MIN = 71;

  const DEFAULT_TOKENS = {
    INK: "#1f2430",
    WHITE: "#ffffff",
    FOG: "#f2f5f8",
    COG_MINT: "#90dec9",
    COG_YELLOW: "#f4d66d",
    COG_PINK: "#f4accd"
  };

  const state = {
    initialized: false,
    tokens: { ...DEFAULT_TOKENS },
    lesson: null,
    prefersReducedMotion: false,
    sliders: INPUT_DEFS.map((input) => ({ ...input, value: defaultSliderValue(input) })),
    selectedSlider: 0,
    draggingSlider: -1,
    sliderTrackRects: [],
    pulseRemaining: 0,
    challengeRule: null,
    challengeComplete: false,
    derived: {
      loyal: 0,
      frustrated: 0,
      engaged: 0,
      dominantKey: "loyal",
      risk: 0,
      riskPct: 0,
      bucket: "LOW",
      accent: DEFAULT_TOKENS.COG_MINT
    },
    layout: null,
    presetsUsed: {
      happy: false,
      atRisk: false
    }
  };

  function defaultSliderValue(input) {
    return Math.round((input.min + input.max) * 0.4);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizedSliderValue(slider, value) {
    if (!slider) {
      return 0;
    }
    const min = Number.isFinite(slider.min) ? slider.min : 0;
    const max = Number.isFinite(slider.max) ? slider.max : min;
    const step = Number.isFinite(slider.step) && slider.step > 0 ? slider.step : 1;
    const stepped = min + Math.round((Number(value) - min) / step) * step;
    return clamp(stepped, min, max);
  }

  function clampSliderValue(slider) {
    if (!slider) {
      return;
    }
    slider.value = normalizedSliderValue(slider, slider.value);
  }

  function clampAllSliders() {
    for (let i = 0; i < state.sliders.length; i += 1) {
      clampSliderValue(state.sliders[i]);
    }
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
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

  function fillRoundRect(ctx, x, y, w, h, r, color) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeRoundRect(ctx, x, y, w, h, r, color, lineWidth) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function withClipRect(ctx, x, y, w, h, drawFn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function fitFontSize(ctx, text, maxWidth, maxSize, minSize, template) {
    let size = Math.max(minSize, maxSize);
    for (; size > minSize; size -= 1) {
      ctx.font = template.replace("${size}", String(size));
      if (ctx.measureText(text).width <= maxWidth) {
        return size;
      }
    }
    return minSize;
  }

  function truncateText(ctx, text, maxWidth) {
    const safeText = String(text || "").trim();
    if (!safeText) {
      return "";
    }
    if (ctx.measureText(safeText).width <= maxWidth) {
      return safeText;
    }
    const ellipsis = "...";
    let output = safeText;
    while (output.length > 0 && ctx.measureText(output + ellipsis).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return output ? output + ellipsis : ellipsis;
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines, align) {
    const safeText = String(text || "").trim();
    if (!safeText) {
      return y;
    }

    const words = safeText.split(/\s+/);
    const lines = [];
    let current = "";

    for (let i = 0; i < words.length; i += 1) {
      const candidate = current ? `${current} ${words[i]}` : words[i];
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }
      current = words[i];

      if (lines.length >= maxLines) {
        break;
      }
    }

    if (lines.length < maxLines && current) {
      lines.push(current);
    }

    if (lines.length > maxLines) {
      lines.length = maxLines;
    }

    const originalAlign = ctx.textAlign;
    ctx.textAlign = align || "left";
    for (let i = 0; i < lines.length; i += 1) {
      const isLastVisibleLine = i === lines.length - 1;
      let lineText = truncateText(ctx, lines[i], maxWidth);
      if (isLastVisibleLine && words.join(" ") !== lines.join(" ")) {
        lineText = truncateText(ctx, lineText, maxWidth);
      }
      ctx.fillText(lineText, x, y + i * lineHeight);
    }
    ctx.textAlign = originalAlign;

    return y + lines.length * lineHeight;
  }

  function rgba(hex, alpha) {
    const safeHex = String(hex || "").replace("#", "");
    if (safeHex.length !== 6) {
      return `rgba(0,0,0,${clamp(alpha, 0, 1)})`;
    }
    const r = parseInt(safeHex.slice(0, 2), 16);
    const g = parseInt(safeHex.slice(2, 4), 16);
    const b = parseInt(safeHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  function sliderValueById(id) {
    const slider = state.sliders.find((s) => s.id === id);
    return slider ? slider.value : 0;
  }

  function normalizeInputs() {
    return {
      ln: sliderValueById("logins") / 30,
      tn: sliderValueById("tickets") / 20,
      te: sliderValueById("tenure") / 36,
      fn: sliderValueById("features") / 10
    };
  }

  function computeDerived() {
    clampAllSliders();
    const { ln, tn, te, fn } = normalizeInputs();

    const loyal = sigmoid(3.0 * ln + 2.0 * te - 3.0 * tn - 0.5);
    const frustrated = sigmoid(3.5 * tn - 2.0 * ln - 1.0 * fn - 0.5);
    const engaged = sigmoid(2.5 * fn + 2.0 * ln - 2.0 * tn - 0.5);
    const risk = sigmoid(2.2 * frustrated - 2.7 * loyal - 0.8 * engaged + 0.9);
    const riskPct = Math.round(risk * 100);

    let dominantKey = "loyal";
    let dominantVal = loyal;
    if (frustrated > dominantVal) {
      dominantVal = frustrated;
      dominantKey = "frustrated";
    }
    if (engaged > dominantVal) {
      dominantVal = engaged;
      dominantKey = "engaged";
    }

    let bucket = "LOW";
    let accent = state.tokens.COG_MINT;
    if (riskPct >= RISK_HIGH_MIN) {
      bucket = "HIGH";
      accent = state.tokens.COG_PINK;
    } else if (riskPct > RISK_LOW_MAX) {
      bucket = "MED";
      accent = state.tokens.COG_YELLOW;
    }

    state.derived = {
      loyal,
      frustrated,
      engaged,
      dominantKey,
      risk,
      riskPct,
      bucket,
      accent
    };

    state.challengeComplete = evaluateChallenge();
  }

  function challengeRuleFromLesson(lesson) {
    const text = String((lesson && lesson.microChallenge) || "").toLowerCase();
    if (!text) return null;
    if (text.includes("engaged dominant")) return "engaged_dominant";
    if (text.includes("risk above 70")) return "risk_above_70";
    if (text.includes("press 1 then 2") || text.includes("press 1 then 2.")) return "preset_flip";
    return null;
  }

  function evaluateChallenge() {
    switch (state.challengeRule) {
      case "engaged_dominant":
        return state.derived.dominantKey === "engaged";
      case "risk_above_70":
        return state.derived.riskPct > 70;
      case "preset_flip":
        return state.presetsUsed.happy && state.presetsUsed.atRisk;
      default:
        return false;
    }
  }

  function markPulse() {
    if (!state.prefersReducedMotion) {
      state.pulseRemaining = PULSE_DURATION;
    }
  }

  function setSliderByIndex(index, nextValue) {
    const slider = state.sliders[index];
    if (!slider) return;
    const clamped = normalizedSliderValue(slider, nextValue);
    if (clamped === slider.value) return;
    slider.value = clamped;
    markPulse();
    computeDerived();
  }

  function applyPreset(kind) {
    const presetValues =
      kind === "happy"
        ? { logins: 26, tickets: 1, tenure: 28, features: 8 }
        : { logins: 3, tickets: 17, tenure: 4, features: 1 };

    for (let i = 0; i < state.sliders.length; i += 1) {
      const slider = state.sliders[i];
      slider.value = normalizedSliderValue(slider, presetValues[slider.id]);
    }
    state.presetsUsed[kind === "happy" ? "happy" : "atRisk"] = true;
    markPulse();
    computeDerived();
  }

  function sliderIndexFromPoint(x, y) {
    for (let i = 0; i < state.sliderTrackRects.length; i += 1) {
      const rect = state.sliderTrackRects[i];
      if (!rect) {
        continue;
      }
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y - 12 && y <= rect.y + rect.h + 12) {
        return i;
      }
    }
    return -1;
  }

  function setSliderFromPointer(index, pointerX) {
    const rect = state.sliderTrackRects[index];
    if (!rect) return;
    const ratio = clamp((pointerX - rect.x) / rect.w, 0, 1);
    const slider = state.sliders[index];
    const value = slider.min + ratio * (slider.max - slider.min);
    setSliderByIndex(index, value);
  }

  function drawNode(ctx, x, y, label, opts) {
    const token = state.tokens;
    const accent = opts.accent;
    const highlight = !!opts.highlight;
    const showDominantBadge = !!opts.showDominantBadge;
    const showLabel = opts.showLabel !== false;
    const showValue = opts.showValue !== false;
    const radius = opts.radius || BASE_NODE_RADIUS;
    const valueText = opts.valueText == null ? "" : String(opts.valueText);

    ctx.save();
    ctx.fillStyle = token.WHITE;
    ctx.strokeStyle = highlight ? accent : token.INK;
    ctx.lineWidth = highlight ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (showLabel && label) {
      ctx.fillStyle = token.INK;
      ctx.font = `700 ${Math.max(11, Math.round(radius * 0.72))}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, x, y - radius - 7);
    }

    if (showValue && valueText) {
      ctx.font = `600 ${Math.max(10, Math.round(radius * 0.64))}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(valueText, x, y + radius + 6);
    }

    if (showDominantBadge) {
      const badgeW = Math.max(66, Math.round(radius * 4));
      const badgeH = Math.max(18, Math.round(radius * 1.1));
      fillRoundRect(ctx, x - badgeW * 0.5, y - radius - badgeH - 10, badgeW, badgeH, 10, accent);
      strokeRoundRect(ctx, x - badgeW * 0.5, y - radius - badgeH - 10, badgeW, badgeH, 10, token.INK, 1.5);
      ctx.fillStyle = token.INK;
      ctx.font = `700 ${Math.max(10, Math.round(radius * 0.56))}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText("DOMINANT", x, y - radius - badgeH * 0.5 - 10);
    }
    ctx.restore();
  }

  function drawChip(ctx, x, y, w, h, text, options) {
    const token = state.tokens;
    const accent = (options && options.accent) || state.derived.accent;
    const active = !!(options && options.active);
    const textAlign = (options && options.align) || "center";
    const fill = active ? rgba(accent, 0.34) : rgba(token.WHITE, 0.94);
    const stroke = active ? accent : token.INK;

    fillRoundRect(ctx, x, y, w, h, Math.min(12, Math.round(h * 0.5)), fill);
    strokeRoundRect(ctx, x, y, w, h, Math.min(12, Math.round(h * 0.5)), stroke, 2);

    ctx.fillStyle = token.INK;
    ctx.font = "700 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textBaseline = "middle";
    if (textAlign === "left") {
      ctx.textAlign = "left";
      ctx.fillText(truncateText(ctx, text, w - 18), x + 10, y + h * 0.5 + 1);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(truncateText(ctx, text, w - 16), x + w * 0.5, y + h * 0.5 + 1);
    }
  }

  function drawWeightLine(ctx, ax, ay, bx, by, weight, maxAbsWeight, pulseT) {
    const token = state.tokens;
    const accent = state.derived.accent;
    const absWeight = Math.abs(weight);
    const thickness = 1.2 + (absWeight / maxAbsWeight) * 5.5;

    ctx.save();
    ctx.strokeStyle = rgba(token.INK, 0.15 + (absWeight / maxAbsWeight) * 0.55);
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    if (pulseT >= 0 && !state.prefersReducedMotion) {
      ctx.strokeStyle = rgba(accent, 0.35);
      ctx.lineWidth = Math.max(1.5, thickness * 0.45);
      ctx.setLineDash([8, 12]);
      ctx.lineDashOffset = -pulseT * 46;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function drawSlider(ctx, slider, index, panel, metrics) {
    const token = state.tokens;
    const selected = index === state.selectedSlider;
    const accent = state.derived.accent;
    const rowH = metrics.rowHeight;
    const top = panel.y + metrics.topPad + index * rowH;
    const trackY = top + metrics.labelFontSize + metrics.labelGap;
    const trackX = panel.x + metrics.contentPad;
    const trackW = panel.w - metrics.contentPad * 2;
    const trackH = metrics.trackHeight;
    const ratio = (slider.value - slider.min) / Math.max(1, slider.max - slider.min);
    const knobX = trackX + ratio * trackW;

    state.sliderTrackRects[index] = { x: trackX, y: trackY, w: trackW, h: trackH };

    ctx.fillStyle = token.INK;
    ctx.font = `700 ${metrics.labelFontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${slider.label}: ${slider.value}`, trackX, top);

    fillRoundRect(ctx, trackX, trackY, trackW, trackH, 8, token.FOG);
    strokeRoundRect(ctx, trackX, trackY, trackW, trackH, 8, token.INK, selected ? 2.5 : 1.5);
    fillRoundRect(ctx, trackX, trackY, Math.max(8, trackW * ratio), trackH, 8, rgba(accent, 0.32));

    ctx.beginPath();
    ctx.arc(knobX, trackY + trackH * 0.5, metrics.knobRadius, 0, Math.PI * 2);
    ctx.fillStyle = token.WHITE;
    ctx.fill();
    ctx.strokeStyle = selected ? accent : token.INK;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
  }

  function drawRiskPill(ctx, x, y, riskPct, bucket, accent, width) {
    ctx.save();
    const token = state.tokens;
    const label = `${riskPct}% ${bucket}`;
    const w = clamp(Math.round(width || 126), 108, 160);
    const h = 34;
    fillRoundRect(ctx, x, y, w, h, 17, accent);
    strokeRoundRect(ctx, x, y, w, h, 17, token.INK, 2);
    ctx.fillStyle = token.INK;
    ctx.font = "800 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w * 0.5, y + h * 0.5);
    ctx.restore();
  }

  function draw(ctx, rect) {
    if (!ctx) return;
    ctx.save();
    const token = state.tokens;
    const panelRect = rect || { x: 0, y: 0, w: 1280, h: 720 };
    const accent = state.derived.accent;
    const lesson = state.lesson || {};

    const panel = {
      x: panelRect.x + 16,
      y: panelRect.y + 16,
      w: panelRect.w - 32,
      h: panelRect.h - 32
    };

    state.layout = panel;

    fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18, token.WHITE);
    strokeRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18, token.INK, 3);
    fillRoundRect(ctx, panel.x + 16, panel.y + 16, panel.w - 32, 10, 5, rgba(accent, 0.35));

    const innerX = panel.x + 24;
    const innerW = panel.w - 48;

    const floorNumber = Number.isFinite(lesson.floor) ? lesson.floor : 1;
    const progressText = `Teach Card ${floorNumber}/9`;
    const challengeBadgeText = state.challengeComplete ? "Challenge ✓" : "Challenge";
    ctx.font = "700 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const headerH = clamp(Math.round(panel.h * 0.34), 208, 250);
    const footerH = clamp(Math.round(panel.h * 0.19), 108, 132);
    const header = { x: innerX, y: panel.y + 24, w: innerW, h: headerH };
    const footer = { x: innerX, y: panel.y + panel.h - footerH - 20, w: innerW, h: footerH };
    const bodyY = header.y + header.h + 12;
    const bodyH = Math.max(210, footer.y - bodyY - 12);
    const body = { x: innerX, y: bodyY, w: innerW, h: bodyH };

    const chipH = 32;
    const progressW = Math.max(146, Math.min(260, Math.round(ctx.measureText(progressText).width + 26)));
    drawChip(ctx, header.x, header.y, progressW, chipH, progressText, { active: false, align: "left" });
    drawChip(ctx, header.x + header.w - 156, header.y, 156, chipH, challengeBadgeText, { active: state.challengeComplete });

    const titleText = String(lesson.title || "Teach Card");
    const oneLiner = String(lesson.oneLiner || "Neural net teaching view.");
    const bullets = Array.isArray(lesson.bullets) ? lesson.bullets.slice(0, 3) : [];
    const headerCopyY = header.y + chipH + 14;
    const headerCopyH = header.h - chipH - 16;

    withClipRect(ctx, header.x, headerCopyY, header.w, headerCopyH, () => {
      let textY = headerCopyY;
      const titleFontSize = fitFontSize(
        ctx,
        titleText,
        header.w,
        56,
        34,
        '800 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      );
      ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.fillStyle = token.INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      textY = drawWrappedText(ctx, titleText, header.x, textY, header.w, Math.round(titleFontSize * 1.08), 2, "left");

      const oneLinerFontSize = fitFontSize(
        ctx,
        oneLiner,
        header.w,
        25,
        18,
        '600 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      );
      ctx.font = `600 ${oneLinerFontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      textY = drawWrappedText(ctx, oneLiner, header.x, textY + 6, header.w, Math.round(oneLinerFontSize * 1.24), 2, "left");

      ctx.font = "500 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      for (let i = 0; i < bullets.length; i += 1) {
        const line = truncateText(ctx, `- ${bullets[i]}`, header.w);
        ctx.fillText(line, header.x, textY + 8 + i * 21);
      }
    });

    const cardGap = 16;
    const leftW = Math.round((body.w - cardGap) * 0.58);
    const leftBox = { x: body.x, y: body.y, w: leftW, h: body.h };
    const rightBox = { x: leftBox.x + leftBox.w + cardGap, y: body.y, w: body.w - leftW - cardGap, h: body.h };

    fillRoundRect(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 14, token.FOG);
    strokeRoundRect(ctx, leftBox.x, leftBox.y, leftBox.w, leftBox.h, 14, token.INK, 2);
    fillRoundRect(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 14, token.FOG);
    strokeRoundRect(ctx, rightBox.x, rightBox.y, rightBox.w, rightBox.h, 14, token.INK, 2);

    const midCueW = 166;
    drawChip(ctx, body.x + Math.round(body.w * 0.5) - Math.round(midCueW * 0.5), body.y - 15, midCueW, 30, "Then check risk", {
      active: false
    });

    const nodeRadius = clamp(Math.round(Math.min(leftBox.w, leftBox.h) * 0.043), 14, BASE_NODE_RADIUS);
    withClipRect(ctx, leftBox.x + 2, leftBox.y + 2, leftBox.w - 4, leftBox.h - 4, () => {
      const leftPad = 14;
      const stripY = leftBox.y + 10;
      const stripH = 34;

      ctx.fillStyle = token.INK;
      ctx.textBaseline = "middle";
      ctx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Inputs", leftBox.x + leftPad, stripY + stripH * 0.5 + 1);
      ctx.textAlign = "center";
      ctx.fillText("Concepts", leftBox.x + leftBox.w * 0.5, stripY + stripH * 0.5 + 1);
      ctx.textAlign = "right";
      ctx.fillText("Output", leftBox.x + leftBox.w - leftPad, stripY + stripH * 0.5 + 1);

      const cueW = Math.min(206, leftBox.w - 28);
      drawChip(ctx, leftBox.x + leftBox.w - cueW - 12, stripY + 40, cueW, 26, "Observe network flow", { active: false });

      const netArea = {
        x: leftBox.x + leftPad,
        y: stripY + 74,
        w: leftBox.w - leftPad * 2,
        h: leftBox.h - 92
      };

      const inputX = netArea.x + Math.round(netArea.w * 0.1);
      const hiddenX = netArea.x + Math.round(netArea.w * 0.52);
      const outputX = netArea.x + netArea.w - Math.round(netArea.w * 0.1);
      const nodeTop = netArea.y + 26;
      const nodeBottom = netArea.y + netArea.h - 28;

      const inputNodes = [];
      for (let i = 0; i < INPUT_DEFS.length; i += 1) {
        const t = i / (INPUT_DEFS.length - 1);
        inputNodes.push({ x: inputX, y: nodeTop + (nodeBottom - nodeTop) * t, key: INPUT_DEFS[i].id, label: INPUT_DEFS[i].label });
      }

      const hiddenNodes = [];
      for (let i = 0; i < HIDDEN_KEYS.length; i += 1) {
        const t = (i + 1) / (HIDDEN_KEYS.length + 1);
        hiddenNodes.push({ x: hiddenX, y: nodeTop + (nodeBottom - nodeTop) * t, key: HIDDEN_KEYS[i], label: HIDDEN_LABELS[HIDDEN_KEYS[i]] });
      }
      const outputNode = { x: outputX, y: (nodeTop + nodeBottom) * 0.5, key: "risk", label: "RISK" };

      const pulseT = state.pulseRemaining > 0 && !state.prefersReducedMotion ? 1 - state.pulseRemaining / PULSE_DURATION : -1;

      let maxAbsWeight = 0;
      for (let h = 0; h < HIDDEN_KEYS.length; h += 1) {
        const key = HIDDEN_KEYS[h];
        const list = INPUT_TO_HIDDEN_WEIGHTS[key];
        for (let i = 0; i < list.length; i += 1) {
          maxAbsWeight = Math.max(maxAbsWeight, Math.abs(list[i]));
        }
        maxAbsWeight = Math.max(maxAbsWeight, Math.abs(HIDDEN_TO_OUTPUT_WEIGHTS[key]));
      }
      maxAbsWeight = Math.max(0.001, maxAbsWeight);

      for (let h = 0; h < hiddenNodes.length; h += 1) {
        const hidden = hiddenNodes[h];
        const hiddenWeights = INPUT_TO_HIDDEN_WEIGHTS[hidden.key];
        for (let i = 0; i < inputNodes.length; i += 1) {
          drawWeightLine(
            ctx,
            inputNodes[i].x + nodeRadius,
            inputNodes[i].y,
            hidden.x - nodeRadius,
            hidden.y,
            hiddenWeights[i],
            maxAbsWeight,
            pulseT
          );
        }
        drawWeightLine(
          ctx,
          hidden.x + nodeRadius,
          hidden.y,
          outputNode.x - nodeRadius,
          outputNode.y,
          HIDDEN_TO_OUTPUT_WEIGHTS[hidden.key],
          maxAbsWeight,
          pulseT
        );
      }

      for (let i = 0; i < inputNodes.length; i += 1) {
        drawNode(ctx, inputNodes[i].x, inputNodes[i].y, "", {
          highlight: i === state.selectedSlider,
          showDominantBadge: false,
          showLabel: false,
          showValue: false,
          accent,
          radius: nodeRadius
        });
      }

      drawNode(ctx, hiddenNodes[0].x, hiddenNodes[0].y, "", {
        highlight: state.derived.dominantKey === "loyal",
        showDominantBadge: false,
        showLabel: false,
        showValue: false,
        accent,
        radius: nodeRadius
      });
      drawNode(ctx, hiddenNodes[1].x, hiddenNodes[1].y, "", {
        highlight: state.derived.dominantKey === "frustrated",
        showDominantBadge: false,
        showLabel: false,
        showValue: false,
        accent,
        radius: nodeRadius
      });
      drawNode(ctx, hiddenNodes[2].x, hiddenNodes[2].y, "", {
        highlight: state.derived.dominantKey === "engaged",
        showDominantBadge: false,
        showLabel: false,
        showValue: false,
        accent,
        radius: nodeRadius
      });
      drawNode(ctx, outputNode.x, outputNode.y, "", {
        highlight: true,
        showDominantBadge: false,
        showLabel: false,
        showValue: false,
        accent,
        radius: nodeRadius
      });

      ctx.fillStyle = token.INK;
      ctx.textBaseline = "bottom";
      ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      for (let i = 0; i < inputNodes.length; i += 1) {
        const slider = state.sliders[i];
        const tx = inputNodes[i].x - nodeRadius - 12;
        ctx.textAlign = "right";
        ctx.fillText(inputNodes[i].label, tx, inputNodes[i].y - 4);
        ctx.textBaseline = "top";
        ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText(`${slider.value}`, tx, inputNodes[i].y + 3);
        ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.textBaseline = "bottom";
      }

      const hiddenValues = [state.derived.loyal, state.derived.frustrated, state.derived.engaged];
      ctx.textAlign = "center";
      for (let i = 0; i < hiddenNodes.length; i += 1) {
        const hidden = hiddenNodes[i];
        ctx.textBaseline = "bottom";
        ctx.fillText(hidden.label, hidden.x, hidden.y - nodeRadius - 6);
        ctx.textBaseline = "top";
        ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText(`${Math.round(hiddenValues[i] * 100)}%`, hidden.x, hidden.y + nodeRadius + 4);
        ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      }

      const dominantIndex = HIDDEN_KEYS.indexOf(state.derived.dominantKey);
      if (dominantIndex >= 0) {
        const domNode = hiddenNodes[dominantIndex];
        drawChip(ctx, domNode.x + nodeRadius + 10, domNode.y - 13, 102, 26, "DOMINANT", { active: true });
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("RISK", outputNode.x, outputNode.y - nodeRadius - 6);
      ctx.textBaseline = "top";
      ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(`${state.derived.riskPct}%`, outputNode.x, outputNode.y + nodeRadius + 4);
    });

    withClipRect(ctx, rightBox.x + 2, rightBox.y + 2, rightBox.w - 4, rightBox.h - 4, () => {
      ctx.fillStyle = token.INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const controlsTitle = "Adjust inputs";
      const controlsHint = "A/D select. Arrows change. 1/2 presets.";
      const controlsTitleSize = fitFontSize(
        ctx,
        controlsTitle,
        rightBox.w - 32,
        56,
        34,
        '700 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      );

      const textX = rightBox.x + 16;
      const controlsTop = rightBox.y + 12;
      ctx.font = `700 ${controlsTitleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      const controlsTitleBottom = drawWrappedText(
        ctx,
        controlsTitle,
        textX,
        controlsTop,
        rightBox.w - 32,
        Math.round(controlsTitleSize * 1.02),
        2,
        "left"
      );

      ctx.font = "600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const controlsHintBottom = drawWrappedText(
        ctx,
        controlsHint,
        textX,
        controlsTitleBottom + 2,
        rightBox.w - 32,
        19,
        2,
        "left"
      );

      const cueW = Math.min(180, rightBox.w - 32);
      const cueY = controlsHintBottom + 6;
      drawChip(ctx, textX, cueY, cueW, 26, "Adjust one input", { active: true, align: "left" });

      const sliderTopPad = Math.max(88, Math.round(cueY + 34 - rightBox.y));
      const sliderAreaHeight = Math.max(0, rightBox.h - sliderTopPad - 12);
      const baseRowHeight = Math.floor(sliderAreaHeight / state.sliders.length);

      const metrics = {
        contentPad: 16,
        topPad: sliderTopPad,
        rowHeight: clamp(baseRowHeight, 24, 72),
        labelFontSize: 16,
        labelGap: 8,
        trackHeight: 12,
        knobRadius: 11
      };

      metrics.labelFontSize = clamp(Math.round(metrics.rowHeight * 0.4), 11, 22);
      metrics.labelGap = clamp(Math.round(metrics.rowHeight * 0.14), 3, 12);
      metrics.trackHeight = clamp(Math.round(metrics.rowHeight * 0.22), 7, 13);
      metrics.knobRadius = clamp(metrics.trackHeight + 1, 9, 12);

      state.sliderTrackRects = [];
      for (let i = 0; i < state.sliders.length; i += 1) {
        drawSlider(ctx, state.sliders[i], i, rightBox, metrics);
      }
    });

    fillRoundRect(ctx, footer.x, footer.y, footer.w, footer.h, 12, token.FOG);
    strokeRoundRect(ctx, footer.x, footer.y, footer.w, footer.h, 12, token.INK, 2);

    let riskPillW = 132;
    const leftPad = 14;
    const summaryY = footer.y + 20;
    const topSummaryH = 28;
    const availableW = footer.w - leftPad * 2;
    const gapMid = 10;
    const minLeftZone = 180;
    const minRightZone = 180;
    let leftZoneW = Math.floor(availableW * 0.35);
    leftZoneW = clamp(leftZoneW, minLeftZone, Math.max(minLeftZone, availableW - minRightZone - riskPillW - gapMid * 2));
    let rightZoneW = availableW - leftZoneW - riskPillW - gapMid * 2;

    if (rightZoneW < minRightZone) {
      const missing = minRightZone - rightZoneW;
      riskPillW = clamp(riskPillW - missing, 110, 156);
      rightZoneW = availableW - leftZoneW - riskPillW - gapMid * 2;
    }
    if (rightZoneW < minRightZone) {
      leftZoneW = clamp(availableW - minRightZone - riskPillW - gapMid * 2, minLeftZone, availableW);
      rightZoneW = availableW - leftZoneW - riskPillW - gapMid * 2;
    }
    rightZoneW = Math.max(120, rightZoneW);

    const leftZoneX = footer.x + leftPad;
    const riskX = leftZoneX + leftZoneW + gapMid;
    const rightZoneX = riskX + riskPillW + gapMid;

    ctx.fillStyle = token.INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "700 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const dominantText = `Dominant concept: ${HIDDEN_LABELS[state.derived.dominantKey]}`;
    withClipRect(ctx, leftZoneX, summaryY - 12, leftZoneW, topSummaryH, () => {
      ctx.fillText(truncateText(ctx, dominantText, leftZoneW), leftZoneX, summaryY);
    });

    drawRiskPill(ctx, riskX, summaryY - 17, state.derived.riskPct, state.derived.bucket, accent, riskPillW);

    const challengeText = (lesson && lesson.microChallenge) || "No challenge.";
    const challengeMarker = state.challengeComplete ? "[ok]" : "[ ]";
    ctx.fillStyle = state.challengeComplete ? accent : token.INK;
    withClipRect(ctx, rightZoneX, summaryY - 12, rightZoneW, topSummaryH, () => {
      ctx.fillText(truncateText(ctx, `${challengeMarker} ${challengeText}`, rightZoneW), rightZoneX, summaryY);
    });

    const ctaW = Math.min(420, footer.w - 28);
    const ctaH = 36;
    const ctaX = footer.x + Math.round((footer.w - ctaW) * 0.5);
    const ctaY = footer.y + 46;
    drawChip(ctx, ctaX, ctaY, ctaW, ctaH, "Press Enter to continue", { active: true });

    ctx.fillStyle = token.INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const footerHint = "1 happy • 2 at-risk • A/D select • arrows adjust";
    ctx.fillText(truncateText(ctx, footerHint, footer.w - 24), footer.x + footer.w * 0.5, footer.y + footer.h - 16);
    ctx.restore();
  }

  function init(tokens) {
    state.tokens = { ...DEFAULT_TOKENS, ...(tokens || {}) };
    state.initialized = true;
    state.sliderTrackRects = [];
    state.draggingSlider = -1;
    state.pulseRemaining = 0;
    clampAllSliders();
    computeDerived();
  }

  function setLesson(lesson, opts) {
    state.lesson = lesson || null;
    state.prefersReducedMotion = !!(opts && opts.prefersReducedMotion);
    if (state.prefersReducedMotion) {
      state.pulseRemaining = 0;
    }
    state.challengeRule = challengeRuleFromLesson(state.lesson);
    state.challengeComplete = false;
    state.presetsUsed.happy = false;
    state.presetsUsed.atRisk = false;
    clampAllSliders();
    computeDerived();
  }

  function update(dt) {
    clampAllSliders();
    if (state.prefersReducedMotion) {
      state.pulseRemaining = 0;
      return;
    }
    const delta = Number.isFinite(dt) ? dt : 0;
    if (state.pulseRemaining > 0) {
      state.pulseRemaining = Math.max(0, state.pulseRemaining - delta);
    }
  }

  function onKeyDown(eventOrKey) {
    const rawKey = typeof eventOrKey === "string" ? eventOrKey : eventOrKey && eventOrKey.key;
    const key = String(rawKey || "");
    if (!key) return false;

    if (key === "1") {
      applyPreset("happy");
      return true;
    }
    if (key === "2") {
      applyPreset("atRisk");
      return true;
    }

    if (key === "a" || key === "A") {
      state.selectedSlider = (state.selectedSlider - 1 + state.sliders.length) % state.sliders.length;
      return true;
    }
    if (key === "d" || key === "D") {
      state.selectedSlider = (state.selectedSlider + 1) % state.sliders.length;
      return true;
    }

    if (key === "ArrowLeft" || key === "ArrowDown") {
      const current = state.sliders[state.selectedSlider];
      setSliderByIndex(state.selectedSlider, current.value - current.step);
      return true;
    }
    if (key === "ArrowRight" || key === "ArrowUp") {
      const current = state.sliders[state.selectedSlider];
      setSliderByIndex(state.selectedSlider, current.value + current.step);
      return true;
    }

    return false;
  }

  function onPointerDown(x, y) {
    const index = sliderIndexFromPoint(x, y);
    if (index < 0) return false;
    state.selectedSlider = index;
    state.draggingSlider = index;
    setSliderFromPointer(index, x);
    return true;
  }

  function onPointerMove(x) {
    if (state.draggingSlider < 0) return false;
    setSliderFromPointer(state.draggingSlider, x);
    return true;
  }

  function onPointerUp() {
    if (state.draggingSlider < 0) return false;
    state.draggingSlider = -1;
    return true;
  }

  function getState() {
    return {
      lesson: state.lesson,
      selectedSlider: state.selectedSlider,
      challengeComplete: state.challengeComplete,
      sliders: state.sliders.map((slider) => ({
        id: slider.id,
        label: slider.label,
        min: slider.min,
        max: slider.max,
        value: slider.value
      })),
      derived: { ...state.derived }
    };
  }

  window.NeuralGlass = {
    init,
    setLesson,
    update,
    draw,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    getState
  };
})();
