(() => {
  "use strict";

  const AIPU = window.AIPU;

  let lastTimestamp = performance.now();

  function frame(now) {
    const dt = (now - lastTimestamp) / 1000;
    lastTimestamp = now;

    AIPU.systems.update(dt);
    AIPU.render.draw();

    requestAnimationFrame(frame);
  }

  AIPU.share.shareUI.bindEvents();
  if (AIPU.dom.overlayRestartBtn) {
    AIPU.dom.overlayRestartBtn.addEventListener("click", () => {
      AIPU.systems.requestRestart();
    });
  }

  AIPU.systems.toTitle();
  requestAnimationFrame(frame);
})();
