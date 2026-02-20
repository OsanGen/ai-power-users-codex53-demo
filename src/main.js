(() => {
  "use strict";

  const AIPU = window.AIPU;
  const FIXED_STEP_SECONDS = 1 / 60;
  const MAX_FRAME_DT_SECONDS = 0.25;

  let lastTimestamp = performance.now();
  let manualStepping = false;
  const runtimeState = {
    ok: true,
    phase: "idle",
    consecutiveErrors: 0,
    totalErrors: 0,
    lastError: null,
    lastErrorAt: 0
  };

  function formatRuntimeError(error) {
    const err = error instanceof Error ? error : null;
    return {
      name: err && err.name ? err.name : "Error",
      message: err && err.message ? err.message : "unknown",
      stack: err && err.stack ? err.stack : ""
    };
  }

  function recordFrameError(phase, error, context = {}) {
    const snapshot = formatRuntimeError(error);
    runtimeState.ok = false;
    runtimeState.phase = phase;
    runtimeState.consecutiveErrors += 1;
    runtimeState.totalErrors += 1;
    runtimeState.lastError = {
      phase,
      message: snapshot.message,
      name: snapshot.name,
      stack: snapshot.stack,
      context,
      at: typeof performance === "object" && performance !== null && typeof performance.now === "function" ? performance.now() : Date.now()
    };
    runtimeState.lastErrorAt = runtimeState.lastError.at;
    window.__AIPU_RUNTIME = {
      ...runtimeState
    };
  }

  function clearFrameError() {
    runtimeState.ok = true;
    runtimeState.phase = "ok";
    runtimeState.consecutiveErrors = 0;
    runtimeState.lastError = null;
    window.__AIPU_RUNTIME = {
      ...runtimeState
    };
  }

  function runUiBootstrapSmoke() {
    const tokens = AIPU && AIPU.constants ? AIPU.constants.TOKENS : null;
    const components = AIPU && AIPU.constants ? AIPU.constants.UI_COMPONENT_CLASS : null;
    const tokenKeys = ["yellow", "blue", "mint", "pink", "ink", "white", "fog"];
    const missingTokens = [];

    for (let i = 0; i < tokenKeys.length; i += 1) {
      const key = tokenKeys[i];
      if (!tokens || typeof tokens[key] !== "string" || !tokens[key].trim()) {
        missingTokens.push(`TOKENS.${key}`);
      }
    }

    const componentKeys = ["appShell", "appHeader", "appFooter", "gameFrame", "modal", "modalPanel", "button"];
    const missingClasses = [];
    for (let i = 0; i < componentKeys.length; i += 1) {
      const key = componentKeys[i];
      if (!components || typeof components[key] !== "string" || !components[key].trim()) {
        missingClasses.push(`UI_COMPONENT_CLASS.${key}`);
      }
    }

    return {
      ok: missingTokens.length === 0 && missingClasses.length === 0,
      missingTokens,
      missingClasses
    };
  }

  const uiBootstrapSmoke = runUiBootstrapSmoke();
  AIPU.uiBootstrapSmoke = uiBootstrapSmoke;
  window.__AIPU_UI_BOOTSTRAP = uiBootstrapSmoke;
  if (!uiBootstrapSmoke.ok) {
    console.warn("AIPU UI bootstrap smoke check failed", uiBootstrapSmoke);
  }
  if (typeof window.__AIPU_RUNTIME === "undefined") {
    window.__AIPU_RUNTIME = runtimeState;
  }

  function runTick(dt) {
    const safeDt = Math.max(0, Math.min(MAX_FRAME_DT_SECONDS, Number.isFinite(dt) ? dt : 0));
    try {
      AIPU.systems.update(safeDt);
    } catch (error) {
      recordFrameError("systems.update", error, { dt: safeDt });
      return;
    }

    try {
      AIPU.render.draw();
    } catch (error) {
      recordFrameError("render.draw", error, { dt: safeDt });
      return;
    }

    clearFrameError();
  }

  function frame(now) {
    if (manualStepping) {
      lastTimestamp = now;
      requestAnimationFrame(frame);
      return;
    }

    const dt = (now - lastTimestamp) / 1000;
    lastTimestamp = now;
    runTick(dt);
    requestAnimationFrame(frame);
  }

  window.advanceTime = (ms) => {
    const totalMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
    if (totalMs === 0) {
      runTick(0);
      return 0;
    }

    const stepMs = FIXED_STEP_SECONDS * 1000;
    const stepCount = Math.max(1, Math.round(totalMs / stepMs));
    let hadUpdateError = false;
    manualStepping = true;
    for (let i = 0; i < stepCount; i += 1) {
      try {
        AIPU.systems.update(FIXED_STEP_SECONDS);
      } catch (error) {
        recordFrameError("systems.update (manual)", error, { stepIndex: i + 1, stepCount });
        hadUpdateError = true;
        break;
      }
    }
    try {
      AIPU.render.draw();
      if (!hadUpdateError) {
        clearFrameError();
      }
    } catch (error) {
      recordFrameError("render.draw (manual)", error, { stepCount });
    }
    lastTimestamp = performance.now();
    manualStepping = false;
    return stepCount;
  };

  window.render_game_to_text = () =>
    AIPU.render && typeof AIPU.render.renderGameToText === "function"
      ? AIPU.render.renderGameToText()
      : JSON.stringify({ mode: AIPU.state && AIPU.state.game ? AIPU.state.game.state : "UNKNOWN" });

  AIPU.share.shareUI.bindEvents();
  if (AIPU.dom.overlayRestartBtn) {
    AIPU.dom.overlayRestartBtn.addEventListener("click", () => {
      AIPU.systems.requestRestart();
    });
  }

  AIPU.systems.toTitle();
  requestAnimationFrame(frame);
})();
