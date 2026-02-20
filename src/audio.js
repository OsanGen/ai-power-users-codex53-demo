(() => {
  "use strict";

  const AIPU = window.AIPU = window.AIPU || {};
  const MUSIC_CACHE_BUST = "v=20260221-20";
  const MUSIC_MUTED_STORAGE_KEY = "MUSIC_MUTED_V1";
  const SFX_CACHE_BUST = "v=20260222-1";
  const SFX_DEFS = Object.freeze({
    shoot: Object.freeze({
      path: "./assets/audio/sfx/shoot_soft.wav",
      gain: 0.12,
      cooldownMs: 55,
      synth: Object.freeze({
        wave: "square",
        startHz: 820,
        endHz: 560,
        attackSeconds: 0.002,
        decaySeconds: 0.08,
        level: 0.2
      })
    }),
    damage: Object.freeze({
      path: "./assets/audio/sfx/damage_soft.wav",
      gain: 0.18,
      cooldownMs: 180,
      synth: Object.freeze({
        wave: "triangle",
        startHz: 220,
        endHz: 120,
        attackSeconds: 0.003,
        decaySeconds: 0.14,
        level: 0.23
      })
    })
  });
  const floorAudio =
    typeof document === "object" && document !== null && typeof document.createElement === "function"
      ? document.createElement("audio")
      : null;

  function readStoredMutedPreference() {
    try {
      const raw = localStorage.getItem(MUSIC_MUTED_STORAGE_KEY);
      if (raw == null) {
        return false;
      }
      const normalized = String(raw).trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    } catch (error) {
      void error;
      return false;
    }
  }

  function writeStoredMutedPreference(nextMuted) {
    try {
      localStorage.setItem(MUSIC_MUTED_STORAGE_KEY, nextMuted ? "1" : "0");
    } catch (error) {
      void error;
    }
  }

  const audioState = {
    currentFloorId: null,
    currentSrc: "",
    isMuted: readStoredMutedPreference(),
    isPlaying: false,
    errorCount: 0,
    lastError: null,
    autoplayPending: false,
    pendingCandidateIndex: -1,
    requestId: 0,
    candidatePaths: [],
    activeCandidateIndex: -1,
    sfxErrorCount: 0,
    sfxLastError: null,
    sfxLoaded: Object.create(null),
    sfxLoadStatus: Object.create(null),
    sfxLastPlayAt: Object.create(null)
  };

  let isAudioAvailable = Boolean(floorAudio && typeof floorAudio.play === "function");
  let sfxContext = null;
  let sfxMasterGain = null;
  let sfxPreloadPromise = null;
  const sfxBuffers = Object.create(null);
  const sfxLoadPromises = Object.create(null);

  const sfxIds = Object.keys(SFX_DEFS);
  for (let i = 0; i < sfxIds.length; i += 1) {
    const id = sfxIds[i];
    audioState.sfxLoaded[id] = false;
    audioState.sfxLoadStatus[id] = "idle";
    audioState.sfxLastPlayAt[id] = 0;
  }

  if (isAudioAvailable) {
    floorAudio.loop = true;
    floorAudio.preload = "auto";
    floorAudio.muted = !!audioState.isMuted;
    floorAudio.setAttribute("playsinline", "true");
    floorAudio.playsInline = true;

    floorAudio.addEventListener("error", () => {
      if (!isAudioAvailable) {
        return;
      }

      const candidateCount = Array.isArray(audioState.candidatePaths) ? audioState.candidatePaths.length : 0;
      if (candidateCount === 0 || audioState.activeCandidateIndex < 0) {
        return;
      }

      fallbackToNextCandidate("audio-error", audioState.requestId);
    });

    if (typeof document === "object" && document !== null) {
      const mountAudio = () => {
        if (!floorAudio.parentNode && document.body) {
          floorAudio.style.display = "none";
          document.body.appendChild(floorAudio);
        }
      };

      if (document.body) {
        mountAudio();
      } else if (typeof document.addEventListener === "function") {
        document.addEventListener("DOMContentLoaded", mountAudio, { once: true });
      }
    }
  }

  function isAutoplayBlockedError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }
    const name = typeof error.name === "string" ? error.name.toLowerCase() : "";
    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
    const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
    if (name === "notallowederror" || name === "notallowed") {
      return true;
    }
    if (code === "notallowederror" || code === "notallowed") {
      return true;
    }
    return message.includes("not allowed") || message.includes("autoplay");
  }

  function clearPendingAutoplayRetry() {
    audioState.autoplayPending = false;
    audioState.pendingCandidateIndex = -1;
  }

  function requestAutoplayRetry() {
    if (!audioState.isMuted) {
      const context = ensureSfxContext();
      if (context && context.state === "suspended" && typeof context.resume === "function") {
        context.resume().catch((error) => {
          void error;
        });
      }
      if (!sfxPreloadPromise) {
        preloadSfx();
      }
    }

    if (!isAudioAvailable || !floorAudio || !audioState.autoplayPending) {
      return;
    }
    if (audioState.isPlaying) {
      clearPendingAutoplayRetry();
      return;
    }
    const paths = Array.isArray(audioState.candidatePaths) ? audioState.candidatePaths : [];
    if (paths.length === 0) {
      clearPendingAutoplayRetry();
      return;
    }
    const candidateIndex = Math.max(0, Math.min(audioState.pendingCandidateIndex, paths.length - 1));
    const candidatePath = paths[candidateIndex];
    if (!candidatePath) {
      clearPendingAutoplayRetry();
      return;
    }
    playCandidate(candidateIndex, candidatePath, audioState.requestId);
  }

  if (typeof window === "object" && window !== null && typeof window.addEventListener === "function") {
    const gestureEvents = ["pointerdown", "mousedown", "keydown", "touchstart", "touchend", "click", "focus"];
    for (let i = 0; i < gestureEvents.length; i += 1) {
      const eventType = gestureEvents[i];
      window.addEventListener(eventType, requestAutoplayRetry, {
        capture: false,
        passive: true
      });
    }
  }

  function resolveFloorId(floorIdOrLabel) {
    const candidate = floorIdOrLabel && Number.isFinite(Number(floorIdOrLabel.id))
      ? Number(floorIdOrLabel.id)
      : Number(floorIdOrLabel);
    if (!Number.isFinite(candidate)) {
      return null;
    }
    return Math.floor(candidate);
  }

  function getSongCandidates(floorIdOrLabel) {
    const resolver = AIPU.content && typeof AIPU.content.getSongPathCandidatesForFloor === "function"
      ? AIPU.content.getSongPathCandidatesForFloor
      : null;
    const candidates = resolver ? resolver(floorIdOrLabel) : [];
    return Array.isArray(candidates) ? candidates : [];
  }

  function addMusicCacheBuster(path) {
    const candidate = typeof path === "string" ? path.trim() : "";
    if (!candidate) {
      return "";
    }
    if (candidate.includes("?")) {
      return `${candidate}&${MUSIC_CACHE_BUST}`;
    }
    return `${candidate}?${MUSIC_CACHE_BUST}`;
  }

  function addSfxCacheBuster(path) {
    const candidate = typeof path === "string" ? path.trim() : "";
    if (!candidate) {
      return "";
    }
    if (candidate.includes("?")) {
      return `${candidate}&${SFX_CACHE_BUST}`;
    }
    return `${candidate}?${SFX_CACHE_BUST}`;
  }

  function nowMs() {
    if (typeof performance === "object" && performance !== null && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function createSfxContext() {
    if (typeof window !== "object" || window === null) {
      return null;
    }
    const ContextCtor = window.AudioContext || window.webkitAudioContext;
    if (typeof ContextCtor !== "function") {
      return null;
    }
    try {
      return new ContextCtor();
    } catch (error) {
      void error;
      return null;
    }
  }

  function ensureSfxContext() {
    if (!sfxContext) {
      sfxContext = createSfxContext();
    }
    if (!sfxContext) {
      return null;
    }

    if (!sfxMasterGain && typeof sfxContext.createGain === "function") {
      sfxMasterGain = sfxContext.createGain();
      sfxMasterGain.gain.value = audioState.isMuted ? 0 : 1;
      sfxMasterGain.connect(sfxContext.destination);
    }

    return sfxContext;
  }

  function syncSfxMuteState() {
    if (!sfxMasterGain || !sfxContext) {
      return;
    }
    const now = sfxContext.currentTime;
    sfxMasterGain.gain.cancelScheduledValues(now);
    sfxMasterGain.gain.setValueAtTime(audioState.isMuted ? 0 : 1, now);
  }

  function resolveSfxPath(effectId) {
    const def = SFX_DEFS[effectId];
    if (!def || typeof def.path !== "string" || !def.path.trim()) {
      return "";
    }
    return encodeURI(addSfxCacheBuster(def.path));
  }

  function isSfxKnown(effectId) {
    return typeof effectId === "string" && Object.prototype.hasOwnProperty.call(SFX_DEFS, effectId);
  }

  function canPlaySfx(effectId) {
    const def = SFX_DEFS[effectId];
    if (!def) {
      return false;
    }
    const now = nowMs();
    const last = Number(audioState.sfxLastPlayAt[effectId]) || 0;
    const cooldownMs = Number.isFinite(def.cooldownMs) ? Math.max(0, def.cooldownMs) : 0;
    if (now - last < cooldownMs) {
      return false;
    }
    audioState.sfxLastPlayAt[effectId] = now;
    return true;
  }

  function playSynthSfx(effectId) {
    const context = ensureSfxContext();
    const def = SFX_DEFS[effectId];
    if (!context || !def || !def.synth || !sfxMasterGain) {
      return false;
    }

    const synth = def.synth;
    const now = context.currentTime;
    const wave = typeof synth.wave === "string" ? synth.wave : "square";
    const startHz = Number.isFinite(synth.startHz) ? Math.max(50, synth.startHz) : 440;
    const endHz = Number.isFinite(synth.endHz) ? Math.max(35, synth.endHz) : 220;
    const attackSeconds = Number.isFinite(synth.attackSeconds) ? Math.max(0.001, synth.attackSeconds) : 0.003;
    const decaySeconds = Number.isFinite(synth.decaySeconds) ? Math.max(0.02, synth.decaySeconds) : 0.1;
    const level = Number.isFinite(synth.level) ? Math.max(0.01, synth.level) : 0.2;

    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(endHz, now + decaySeconds);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(level, now + attackSeconds);
    env.gain.exponentialRampToValueAtTime(0.0001, now + decaySeconds);
    osc.connect(env);
    env.connect(sfxMasterGain);
    osc.start(now);
    osc.stop(now + decaySeconds + 0.02);
    return true;
  }

  function playBufferedSfx(effectId, buffer) {
    const context = ensureSfxContext();
    const def = SFX_DEFS[effectId];
    if (!context || !sfxMasterGain || !def || !buffer) {
      return false;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const gainNode = context.createGain();
    const level = Number.isFinite(def.gain) ? Math.max(0.01, def.gain) : 0.12;
    gainNode.gain.setValueAtTime(level, context.currentTime);

    source.connect(gainNode);
    gainNode.connect(sfxMasterGain);
    source.start(0);
    return true;
  }

  function loadSfxBuffer(effectId) {
    if (!isSfxKnown(effectId)) {
      return Promise.resolve(null);
    }
    if (sfxBuffers[effectId]) {
      audioState.sfxLoaded[effectId] = true;
      audioState.sfxLoadStatus[effectId] = "ready";
      return Promise.resolve(sfxBuffers[effectId]);
    }
    if (audioState.sfxLoadStatus[effectId] === "error") {
      return Promise.resolve(null);
    }
    if (sfxLoadPromises[effectId]) {
      return sfxLoadPromises[effectId];
    }

    const context = ensureSfxContext();
    if (!context || typeof fetch !== "function") {
      return Promise.resolve(null);
    }

    const path = resolveSfxPath(effectId);
    if (!path) {
      audioState.sfxLoadStatus[effectId] = "error";
      audioState.sfxLoaded[effectId] = false;
      return Promise.resolve(null);
    }

    audioState.sfxLoadStatus[effectId] = "loading";
    sfxLoadPromises[effectId] = fetch(path, { cache: "force-cache" })
      .then((response) => {
        if (!response || !response.ok) {
          throw new Error(`SFX ${effectId} fetch failed (${response ? response.status : "unknown"})`);
        }
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes.slice(0)))
      .then((decodedBuffer) => {
        if (!decodedBuffer) {
          throw new Error(`SFX ${effectId} decode failed`);
        }
        sfxBuffers[effectId] = decodedBuffer;
        audioState.sfxLoaded[effectId] = true;
        audioState.sfxLoadStatus[effectId] = "ready";
        audioState.sfxLastError = null;
        return decodedBuffer;
      })
      .catch((error) => {
        audioState.sfxErrorCount += 1;
        audioState.sfxLastError = getErrorMessage(error);
        audioState.sfxLoaded[effectId] = false;
        audioState.sfxLoadStatus[effectId] = "error";
        return null;
      })
      .finally(() => {
        delete sfxLoadPromises[effectId];
      });

    return sfxLoadPromises[effectId];
  }

  function preloadSfx() {
    if (sfxPreloadPromise) {
      return sfxPreloadPromise;
    }
    const context = ensureSfxContext();
    if (!context) {
      return Promise.resolve(false);
    }
    if (context.state === "suspended" && typeof context.resume === "function") {
      context.resume().catch((error) => {
        void error;
      });
    }

    const ids = Object.keys(SFX_DEFS);
    sfxPreloadPromise = Promise.allSettled(ids.map((id) => loadSfxBuffer(id))).then((results) =>
      results.some((entry) => entry.status === "fulfilled" && !!entry.value)
    );
    return sfxPreloadPromise;
  }

  function playSfx(effectId) {
    if (!isSfxKnown(effectId) || audioState.isMuted || !canPlaySfx(effectId)) {
      return false;
    }

    const context = ensureSfxContext();
    if (!context) {
      return false;
    }

    if (context.state === "suspended" && typeof context.resume === "function") {
      context.resume().catch((error) => {
        void error;
      });
    }

    const cachedBuffer = sfxBuffers[effectId];
    if (cachedBuffer) {
      return playBufferedSfx(effectId, cachedBuffer);
    }

    if (audioState.sfxLoadStatus[effectId] !== "error") {
      loadSfxBuffer(effectId);
    }
    return playSynthSfx(effectId);
  }

  function getErrorMessage(error) {
    if (!error || typeof error !== "object") {
      return "Unknown audio error";
    }

    const message = error.message || error.code || "Audio error";
    return String(message);
  }

  function stopAudioCore() {
    if (!isAudioAvailable || !floorAudio) {
      return;
    }
    if (typeof floorAudio.pause === "function") {
      floorAudio.pause();
    }
    try {
      floorAudio.currentTime = 0;
    } catch (error) {
      void error;
    }
    try {
      floorAudio.src = "";
    } catch (error) {
      void error;
    }
    audioState.isPlaying = false;
    clearPendingAutoplayRetry();
    audioState.currentSrc = "";
    audioState.activeCandidateIndex = -1;
  }

  function fallbackToNextCandidate(reason, requestId) {
    if (!isAudioAvailable || !floorAudio || requestId !== audioState.requestId) {
      return;
    }

    if (!Array.isArray(audioState.candidatePaths) || audioState.candidatePaths.length === 0 || audioState.activeCandidateIndex < 0) {
      if (reason && reason !== "manual-stop") {
        audioState.errorCount += 1;
      }
      audioState.lastError = reason || "No playable candidate";
      stopAudioCore();
      return;
    }

    const nextIndex = audioState.activeCandidateIndex + 1;
    const nextPath = audioState.candidatePaths[nextIndex];
    if (!nextPath) {
      if (reason && reason !== "manual-stop") {
        audioState.errorCount += 1;
      }
      audioState.lastError = reason || "No playable candidate";
      stopAudioCore();
      return;
    }

    playCandidate(nextIndex, nextPath, requestId);
  }

  function playCandidate(candidateIndex, path, requestId) {
    if (!isAudioAvailable || !floorAudio || requestId !== audioState.requestId) {
      return;
    }

    if (typeof path !== "string" || path.length === 0) {
      fallbackToNextCandidate("invalid-path", requestId);
      return;
    }

    audioState.activeCandidateIndex = candidateIndex;
    audioState.currentSrc = path;
    audioState.lastError = null;
    audioState.isPlaying = false;
    floorAudio.muted = !!audioState.isMuted;

    try {
      const pathWithVersion = addMusicCacheBuster(path);
      floorAudio.src = encodeURI(pathWithVersion);
      const playback = floorAudio.play();
      if (playback && typeof playback.then === "function") {
      playback
        .then(() => {
          if (requestId !== audioState.requestId) {
            return;
          }
          audioState.isPlaying = true;
          clearPendingAutoplayRetry();
        })
        .catch((error) => {
          if (requestId !== audioState.requestId) {
            return;
          }
          audioState.errorCount += 1;
          audioState.lastError = getErrorMessage(error);
          if (isAutoplayBlockedError(error)) {
            audioState.autoplayPending = true;
            audioState.pendingCandidateIndex = candidateIndex;
            return;
          }
          fallbackToNextCandidate("play-rejected", requestId);
        });
      } else {
        audioState.isPlaying = !floorAudio.paused;
        clearPendingAutoplayRetry();
      }
    } catch (error) {
      audioState.errorCount += 1;
      audioState.lastError = getErrorMessage(error);
      fallbackToNextCandidate("play-exception", requestId);
    }
  }

  function playForFloor(floorIdOrLabel) {
    if (!isAudioAvailable || !floorAudio) {
      return;
    }

    const floorId = resolveFloorId(floorIdOrLabel);
    if (!Number.isFinite(floorId)) {
      stop();
      return;
    }
    const candidates = getSongCandidates(floorIdOrLabel);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      stop();
      return;
    }

    const firstPath = candidates[0];
    const isCandidateMatch = candidates.indexOf(audioState.currentSrc) >= 0;
    const isCurrentTrack = isCandidateMatch;
    const isCurrentFloor = audioState.currentFloorId === floorId && floorId !== null;
    if (isCurrentTrack && isCurrentFloor && (audioState.isPlaying || audioState.autoplayPending)) {
      return;
    }

    audioState.requestId += 1;
    audioState.currentFloorId = floorId;
    audioState.lastError = null;
    clearPendingAutoplayRetry();
    audioState.candidatePaths = candidates;

    playCandidate(0, firstPath, audioState.requestId);
  }

  function stop() {
    audioState.requestId += 1;
    audioState.currentFloorId = null;
    audioState.currentSrc = "";
    audioState.activeCandidateIndex = -1;
    audioState.candidatePaths = [];
    stopAudioCore();
  }

  function setMuted(nextMuted) {
    audioState.isMuted = !!nextMuted;
    writeStoredMutedPreference(audioState.isMuted);
    if (!isAudioAvailable || !floorAudio) {
      syncSfxMuteState();
      return;
    }

    floorAudio.muted = audioState.isMuted;
    syncSfxMuteState();
  }

  function toggleMuted() {
    const nextMuted = !audioState.isMuted;
    setMuted(nextMuted);
    return nextMuted;
  }

  function getState() {
    return {
      currentFloorId: audioState.currentFloorId,
      activeSrc: audioState.currentSrc,
      currentSrc: audioState.currentSrc,
      isPlaying: audioState.isPlaying,
      muted: audioState.isMuted,
      autoplayPending: audioState.autoplayPending,
      pendingFloorId: audioState.currentFloorId,
      errorCount: audioState.errorCount,
      lastError: audioState.lastError,
      activeCandidateIndex: audioState.activeCandidateIndex,
      candidateCount: Array.isArray(audioState.candidatePaths) ? audioState.candidatePaths.length : 0,
      hasAudio: isAudioAvailable,
      sfxLoaded: { ...audioState.sfxLoaded },
      sfxLoadStatus: { ...audioState.sfxLoadStatus },
      sfxErrorCount: audioState.sfxErrorCount,
      sfxLastError: audioState.sfxLastError
    };
  }

  AIPU.audio = {
    playForFloor,
    playSfx,
    preloadSfx,
    stop,
    setMuted,
    toggleMuted,
    getState
  };

  if (typeof window === "object" && window !== null && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", () => {
      stop();
    });
  }
})();
