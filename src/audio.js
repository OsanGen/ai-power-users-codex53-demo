(() => {
  "use strict";

  const AIPU = window.AIPU = window.AIPU || {};
  const floorAudio =
    typeof document === "object" && document !== null && typeof document.createElement === "function"
      ? document.createElement("audio")
      : null;

  const audioState = {
    currentFloorId: null,
    currentSrc: "",
    isMuted: false,
    isPlaying: false,
    errorCount: 0,
    lastError: null,
    requestId: 0,
    candidatePaths: [],
    activeCandidateIndex: -1
  };

  let isAudioAvailable = Boolean(floorAudio && typeof floorAudio.play === "function");

  if (isAudioAvailable) {
    floorAudio.loop = true;
    floorAudio.preload = "auto";

    floorAudio.addEventListener("error", () => {
      if (!isAudioAvailable) {
        return;
      }
      fallbackToNextCandidate("audio-error", audioState.requestId);
    });
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
    audioState.currentSrc = "";
    audioState.activeCandidateIndex = -1;
  }

  function fallbackToNextCandidate(reason, requestId) {
    if (!isAudioAvailable || !floorAudio || requestId !== audioState.requestId) {
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
    floorAudio.muted = !!audioState.isMuted;

    try {
      floorAudio.src = encodeURI(path);
      floorAudio.load();
      const playback = floorAudio.play();
      if (playback && typeof playback.then === "function") {
        playback
          .then(() => {
            if (requestId !== audioState.requestId) {
              return;
            }
            audioState.isPlaying = true;
          })
          .catch((error) => {
              if (requestId !== audioState.requestId) {
                return;
              }
              audioState.errorCount += 1;
            audioState.lastError = getErrorMessage(error);
            fallbackToNextCandidate("play-rejected", requestId);
          });
      } else {
        audioState.isPlaying = !floorAudio.paused;
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
    const candidates = getSongCandidates(floorIdOrLabel);
    audioState.requestId += 1;
    audioState.currentFloorId = floorId;
    audioState.candidatePaths = candidates;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      stop();
      return;
    }

    if (audioState.currentSrc === candidates[0] && audioState.isPlaying) {
      return;
    }

    const firstPath = candidates[0];
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
    if (!isAudioAvailable || !floorAudio) {
      return;
    }

    floorAudio.muted = audioState.isMuted;
  }

  function getState() {
    return {
      currentFloorId: audioState.currentFloorId,
      activeSrc: audioState.currentSrc,
      currentSrc: audioState.currentSrc,
      isPlaying: audioState.isPlaying,
      muted: audioState.isMuted,
      errorCount: audioState.errorCount,
      lastError: audioState.lastError,
      hasAudio: isAudioAvailable
    };
  }

  AIPU.audio = {
    playForFloor,
    stop,
    setMuted,
    getState
  };

  if (typeof window === "object" && window !== null && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", () => {
      stop();
    });
  }
})();
