(() => {
  "use strict";

  const AIPU = window.AIPU = window.AIPU || {};
  const MUSIC_CACHE_BUST = "v=20260221-20";
  const MUSIC_MUTED_STORAGE_KEY = "MUSIC_MUTED_V1";
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
    activeCandidateIndex: -1
  };

  let isAudioAvailable = Boolean(floorAudio && typeof floorAudio.play === "function");

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
      return;
    }

    floorAudio.muted = audioState.isMuted;
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
      hasAudio: isAudioAvailable
    };
  }

  AIPU.audio = {
    playForFloor,
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
