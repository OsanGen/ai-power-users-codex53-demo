(() => {
  "use strict";

  const AIPU = window.AIPU;
  const {
    gameFrame,
    canvas,
    shareModalEl,
    shareFloorEl,
    shareTextEl,
    shareCardPreviewEl,
    shareCopyBtn,
    shareLinkedInBtn,
    shareDownloadBtn,
    shareCloseBtn,
    shareDontAskEl
  } = AIPU.dom;
  const { TOKENS, SHARE_DONT_ASK_KEY } = AIPU.constants;
  const N = AIPU.content && AIPU.content.N ? AIPU.content.N : null;
  const getNarrativeUiText =
    AIPU.content && typeof AIPU.content.getNarrativeUiText === "function" ? AIPU.content.getNarrativeUiText : null;
  const shareTitleEl = document.getElementById("shareTitle");
  const shareSummaryEl = shareModalEl ? shareModalEl.querySelector(".modal-summary") : null;
  const shareTextLabelEl = document.getElementById("shareTextLabel");
  const shareDontAskTextEl = document.getElementById("shareDontAskText");
  const shareModalNoteEl = document.getElementById("shareModalNote");

  const CANONICAL_SHARE_URL = "";

  function uiText(key, fallback) {
    return typeof getNarrativeUiText === "function" ? getNarrativeUiText(key, fallback) : fallback;
  }

  function formatUiText(key, fallback, values = null) {
    let text = uiText(key, fallback);
    if (!values || typeof values !== "object") {
      return text;
    }
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  function isHttpShareUrl(value) {
    if (typeof value !== "string") {
      return false;
    }
    return /^https?:\/\//i.test(value.trim());
  }

  function resolveShareUrl() {
    const canonical = (CANONICAL_SHARE_URL || "").trim();
    if (isHttpShareUrl(canonical)) {
      return canonical;
    }

    const current = window.location && typeof window.location.href === "string" ? window.location.href : "";
    if (isHttpShareUrl(current)) {
      return current;
    }

    return "";
  }

  function buildShareCopy(data) {
    const floorReached = Math.max(1, Number(data.floorReached) || 1);
    const maxFloors = Math.max(floorReached, Number(data.maxFloors) || floorReached);
    const upgradesSummary = typeof data.upgradesSummary === "string" ? data.upgradesSummary.trim() : "";
    const shareUrl = typeof data.shareUrl === "string" ? data.shareUrl.trim() : "";
    const narrativeShare = N && N.share && typeof N.share === "object" ? N.share : null;
    const buildPost = narrativeShare && narrativeShare.buildPost && typeof narrativeShare.buildPost === "object"
      ? narrativeShare.buildPost
      : null;
    const urlValue = isHttpShareUrl(shareUrl) ? shareUrl : "";
    const replaceVars = (line) =>
      String(line)
        .replace(/\{floor\}/g, String(floorReached))
        .replace(/\{maxFloors\}/g, String(maxFloors))
        .replace(/\{url\}/g, urlValue);

    const templatedLines = [];
    const lineKeys = ["line1", "line2", "line3", "line4"];
    for (let i = 0; i < lineKeys.length; i += 1) {
      const raw = buildPost ? buildPost[lineKeys[i]] : "";
      if (typeof raw !== "string" || !raw.trim()) {
        continue;
      }
      if (raw.includes("{url}") && !urlValue) {
        continue;
      }
      const replaced = replaceVars(raw).trim();
      if (replaced) {
        templatedLines.push(replaced);
      }
    }

    const lines =
      templatedLines.length > 0
        ? templatedLines
        : [
            formatUiText("shareFallbackLine1", "I reached Floor {floor} of {maxFloors}.", {
              floor: floorReached,
              maxFloors
            }),
            uiText("shareFallbackLine2", "Neural nets: inputs -> weights -> concepts -> prediction.")
          ];

    if (upgradesSummary) {
      lines.push(formatUiText("shareRunBuildLine", "Run build: {upgrades}.", { upgrades: upgradesSummary }));
    }

    lines.push(uiText("shareDisclosureLine", "AI-assisted; reviewed by humans; results vary."));
    return lines.join("\n");
  }

  function buildRunCardDataUrl(data) {
    const width = 1200;
    const height = 627;
    const cardCanvas = document.createElement("canvas");
    cardCanvas.width = width;
    cardCanvas.height = height;

    const cardCtx = cardCanvas.getContext("2d");
    if (!cardCtx) {
      return "";
    }

    const accent = data && data.accent ? data.accent : TOKENS.pink;
    const floorReached = Math.max(1, Number(data && data.floorReached) || 1);
    const maxFloors = Math.max(floorReached, Number(data && data.maxFloors) || floorReached);
    const upgradeLines = Array.isArray(data && data.upgradeLines) ? data.upgradeLines.slice(0, 3) : [];
    const shareUrl = data && typeof data.shareUrl === "string" ? data.shareUrl : "";

    const roundRectPathOn = (context, x, y, w, h, r) => {
      const radius = Math.min(r, w * 0.5, h * 0.5);
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + w - radius, y);
      context.quadraticCurveTo(x + w, y, x + w, y + radius);
      context.lineTo(x + w, y + h - radius);
      context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      context.lineTo(x + radius, y + h);
      context.quadraticCurveTo(x, y + h, x, y + h - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
    };

    const fillRoundRectOn = (context, x, y, w, h, r) => {
      roundRectPathOn(context, x, y, w, h, r);
      context.fill();
    };

    const strokeRoundRectOn = (context, x, y, w, h, r) => {
      roundRectPathOn(context, x, y, w, h, r);
      context.stroke();
    };

    const fitLine = (context, text, maxWidth) => {
      let value = (text || "").trim();
      if (!value) {
        return "";
      }
      if (context.measureText(value).width <= maxWidth) {
        return value;
      }

      const ellipsis = "...";
      while (value.length > 1 && context.measureText(`${value}${ellipsis}`).width > maxWidth) {
        value = value.slice(0, -1);
      }
      return `${value}${ellipsis}`;
    };

    const framePad = 30;
    const innerPad = 72;

    cardCtx.fillStyle = TOKENS.white;
    cardCtx.fillRect(0, 0, width, height);

    cardCtx.strokeStyle = TOKENS.ink;
    cardCtx.lineWidth = 4;
    strokeRoundRectOn(cardCtx, framePad, framePad, width - framePad * 2, height - framePad * 2, 20);

    cardCtx.fillStyle = accent;
    fillRoundRectOn(cardCtx, innerPad, 82, width - innerPad * 2, 10, 999);

    cardCtx.fillStyle = TOKENS.ink;
    cardCtx.textAlign = "left";
    cardCtx.textBaseline = "top";
    cardCtx.font = '700 82px "Sora", "Inter", sans-serif';
    cardCtx.fillText(
      formatUiText("shareFloorLabel", "Floor {floor} of {maxFloors}", { floor: floorReached, maxFloors }),
      innerPad,
      124
    );

    const titleScreen = N && N.titleScreen && typeof N.titleScreen === "object" ? N.titleScreen : null;
    const cardTitle =
      titleScreen && typeof titleScreen.title === "string" && titleScreen.title.trim()
        ? titleScreen.title.trim()
        : uiText("shareCardTitleFallback", "Neural Nets: Learn the Loop");
    cardCtx.font = '700 36px "Inter", sans-serif';
    cardCtx.fillText(fitLine(cardCtx, cardTitle, width - innerPad * 2), innerPad, 232);

    const buildPanelY = 300;
    const buildPanelH = 228;
    cardCtx.fillStyle = TOKENS.fog;
    fillRoundRectOn(cardCtx, innerPad, buildPanelY, width - innerPad * 2, buildPanelH, 16);
    cardCtx.strokeStyle = TOKENS.ink;
    cardCtx.lineWidth = 2;
    strokeRoundRectOn(cardCtx, innerPad, buildPanelY, width - innerPad * 2, buildPanelH, 16);

    cardCtx.fillStyle = TOKENS.ink;
    cardCtx.font = '700 30px "Inter", sans-serif';
    cardCtx.fillText(uiText("shareCardRunBuildTitle", "Run build"), innerPad + 30, buildPanelY + 28);

    cardCtx.font = '600 33px "Inter", sans-serif';
    if (upgradeLines.length === 0) {
      cardCtx.fillText(uiText("shareCardNoUpgrades", "No upgrades stacked this run."), innerPad + 30, buildPanelY + 84);
    } else {
      for (let i = 0; i < Math.min(3, upgradeLines.length); i += 1) {
        const line = fitLine(cardCtx, `${i + 1}. ${upgradeLines[i]}`, width - innerPad * 2 - 70);
        cardCtx.fillText(line, innerPad + 30, buildPanelY + 84 + i * 48);
      }
    }

    if (isHttpShareUrl(shareUrl)) {
      cardCtx.fillStyle = TOKENS.ink;
      cardCtx.font = '600 22px "Inter", sans-serif';
      const line = fitLine(
        cardCtx,
        formatUiText("shareCardTryItLine", "Try it: {url}", { url: shareUrl }),
        width - innerPad * 2
      );
      cardCtx.fillText(line, innerPad, height - 66);
    }

    return cardCanvas.toDataURL("image/png");
  }

  const shareUI = {
    _bound: false,
    _statusTimer: 0,
    _statusEl: null,
    _data: null,
    _cardDataUrl: "",
    _nativeShareBtn: null,

    _getDontAsk() {
      try {
        return localStorage.getItem(SHARE_DONT_ASK_KEY) === "1";
      } catch (error) {
        return false;
      }
    },

    _setDontAsk(value) {
      try {
        if (value) {
          localStorage.setItem(SHARE_DONT_ASK_KEY, "1");
        } else {
          localStorage.removeItem(SHARE_DONT_ASK_KEY);
        }
      } catch (error) {
        void error;
      }
    },

    isOpen() {
      return !!shareModalEl && !shareModalEl.classList.contains("hidden");
    },

    shouldSuppress() {
      return this._getDontAsk();
    },

    _setStatus(message, durationMs = 0) {
      if (!this._statusEl) {
        return;
      }

      if (this._statusTimer) {
        window.clearTimeout(this._statusTimer);
        this._statusTimer = 0;
      }

      this._statusEl.textContent = message || "";
      this._statusEl.style.display = message ? "block" : "none";

      if (message && durationMs > 0) {
        this._statusTimer = window.setTimeout(() => {
          if (!this._statusEl) {
            return;
          }
          this._statusEl.textContent = "";
          this._statusEl.style.display = "none";
        }, durationMs);
      }
    },

    _getLinkedInShareTarget() {
      const shareUrl = this._data && isHttpShareUrl(this._data.shareUrl) ? this._data.shareUrl : "";
      if (!shareUrl) {
        return "https://www.linkedin.com/feed/";
      }
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    },

    async _copyText(text) {
      if (!text) {
        return false;
      }

      if (navigator.clipboard && window.isSecureContext && typeof navigator.clipboard.writeText === "function") {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (error) {
          void error;
        }
      }

      if (!shareTextEl) {
        return false;
      }

      shareTextEl.focus();
      shareTextEl.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }

      if (!copied) {
        return false;
      }

      shareTextEl.setSelectionRange(0, 0);
      return true;
    },

    setData(data = {}) {
      if (!shareModalEl) {
        return;
      }

      this._data = { ...(data || {}) };
      this._cardDataUrl = typeof data.cardDataUrl === "string" ? data.cardDataUrl : "";

      if (shareFloorEl) {
        shareFloorEl.textContent = data.floorLabel || uiText("shareDefaultFloorLabel", "Floor 1");
      }

      const narrativeShare = N && N.share && typeof N.share === "object" ? N.share : null;
      if (shareTitleEl) {
        const nextTitle =
          narrativeShare && typeof narrativeShare.title === "string" && narrativeShare.title.trim()
            ? narrativeShare.title.trim()
            : uiText("shareTitleFallback", "Share what you learned");
        shareTitleEl.textContent = nextTitle;
      }
      if (shareSummaryEl) {
        const oneLiner =
          narrativeShare && typeof narrativeShare.oneLiner === "string" && narrativeShare.oneLiner.trim()
            ? narrativeShare.oneLiner.trim()
            : uiText("shareOneLinerFallback", "Post your floor and the neural net loop.");
        const floorLabel = data.floorLabel || uiText("shareDefaultFloorLabel", "Floor 1");
        shareSummaryEl.textContent = "";
        shareSummaryEl.appendChild(document.createTextNode(`${oneLiner} (`));
        if (shareFloorEl) {
          shareFloorEl.textContent = floorLabel;
          shareSummaryEl.appendChild(shareFloorEl);
        } else {
          shareSummaryEl.appendChild(document.createTextNode(floorLabel));
        }
        shareSummaryEl.appendChild(document.createTextNode(")"));
      }

      if (shareTextEl) {
        shareTextEl.value = data.text || "";
      }

      if (shareDontAskEl) {
        shareDontAskEl.checked = this._getDontAsk();
      }

      if (data.accent) {
        shareModalEl.style.setProperty("--share-accent", data.accent);
      } else {
        shareModalEl.style.removeProperty("--share-accent");
      }

      if (shareCardPreviewEl) {
        shareCardPreviewEl.alt = uiText("shareCardPreviewAlt", "Neural net run card preview");
        if (this._cardDataUrl) {
          shareCardPreviewEl.src = this._cardDataUrl;
          shareCardPreviewEl.style.display = "block";
        } else {
          shareCardPreviewEl.removeAttribute("src");
          shareCardPreviewEl.style.display = "none";
        }
      }

      this._setStatus("", 0);
    },

    open(data) {
      if (!shareModalEl || this._getDontAsk()) {
        return;
      }

      this.setData(data || {});
      shareModalEl.classList.remove("hidden");
      shareModalEl.setAttribute("aria-hidden", "false");

      const focusTarget = shareCopyBtn || shareLinkedInBtn || shareCloseBtn || shareTextEl;
      if (focusTarget && typeof focusTarget.focus === "function") {
        focusTarget.focus();
      }
    },

    close(options = {}) {
      if (!shareModalEl) {
        return;
      }

      const persistChoice = options.persistChoice !== false;
      const restoreFocus = options.restoreFocus !== false;
      const wasOpen = this.isOpen();

      if (persistChoice && shareDontAskEl) {
        this._setDontAsk(!!shareDontAskEl.checked);
      }

      shareModalEl.classList.add("hidden");
      shareModalEl.setAttribute("aria-hidden", "true");
      this._setStatus("", 0);
      this._cardDataUrl = "";

      if (wasOpen && restoreFocus) {
        const focusTarget = gameFrame || canvas;
        if (focusTarget && typeof focusTarget.focus === "function") {
          focusTarget.focus();
        }
      }
    },

    _handleTabTrap(event) {
      if (!shareModalEl || event.key !== "Tab" || !this.isOpen()) {
        return;
      }

      const focusables = Array.from(
        shareModalEl.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusables.length === 0) {
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },

    bindEvents() {
      if (this._bound || !shareModalEl) {
        return;
      }

      this._bound = true;
      const actionsEl = shareModalEl.querySelector(".modal-actions");
      const panelEl = shareModalEl.querySelector(".modal-panel");

      if (panelEl && !this._statusEl) {
        const statusEl = document.createElement("p");
        statusEl.setAttribute("aria-live", "polite");
        statusEl.className = "modal-status";
        this._statusEl = statusEl;
        if (actionsEl && actionsEl.parentNode === panelEl) {
          panelEl.insertBefore(statusEl, actionsEl.nextSibling);
        } else {
          panelEl.appendChild(statusEl);
        }
      }

      if (shareTextLabelEl) {
        shareTextLabelEl.textContent = uiText("shareTextLabel", "Suggested post copy");
      }

      if (shareDontAskTextEl) {
        shareDontAskTextEl.textContent = uiText("shareDontAskText", "Don't ask again");
      }

      if (shareModalNoteEl) {
        shareModalNoteEl.textContent = uiText("shareModalNote", "You can re-enable in settings.");
      }

      if (shareCopyBtn) {
        shareCopyBtn.textContent = uiText("shareCopyButton", "Copy text");
      }

      if (shareLinkedInBtn) {
        shareLinkedInBtn.textContent = uiText("shareLinkedInButton", "Open LinkedIn");
      }

      if (shareDownloadBtn) {
        shareDownloadBtn.textContent = uiText("shareDownloadButton", "Download card");
      }

      if (shareCloseBtn) {
        shareCloseBtn.textContent = uiText("shareCloseButton", "Not now");
      }

      if (shareCopyBtn) {
        shareCopyBtn.addEventListener("click", async () => {
          const text = shareTextEl ? shareTextEl.value : "";
          if (!text) {
            return;
          }

          const copied = await this._copyText(text);
          if (copied) {
            this._setStatus(uiText("shareStatusCopied", "Copied"), 1200);
          } else {
            this._setStatus(
              uiText("shareStatusCopyFailed", "Copy failed. Select the text and copy manually."),
              1800
            );
          }
        });
      }

      if (shareLinkedInBtn) {
        shareLinkedInBtn.addEventListener("click", () => {
          const target = this._getLinkedInShareTarget();
          window.open(target, "_blank", "noopener,noreferrer");
          this._setStatus(uiText("shareStatusLinkedIn", "Paste the copied text, then Post."), 2200);
        });
      }

      if (shareDownloadBtn) {
        shareDownloadBtn.addEventListener("click", () => {
          if (!this._cardDataUrl) {
            this._setStatus(uiText("shareStatusCardUnavailable", "Card unavailable right now."), 1400);
            return;
          }

          const floorReached = this._data && this._data.floorReached ? this._data.floorReached : 1;
          const fileName = `ai-power-users-floor-${floorReached}-run-card.png`;
          const link = document.createElement("a");
          link.href = this._cardDataUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          this._setStatus(uiText("shareStatusCardDownloaded", "Card downloaded."), 1200);
        });
      }

      const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
      const isCompactViewport =
        typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 860px)").matches : window.innerWidth <= 860;
      const isTouchDevice =
        (typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0) ||
        "ontouchstart" in window;

      if (actionsEl && canNativeShare && (isCompactViewport || isTouchDevice) && !this._nativeShareBtn) {
        const nativeBtn = document.createElement("button");
        nativeBtn.type = "button";
        nativeBtn.className = "btn";
        nativeBtn.textContent = uiText("shareNativeButton", "Share...");
        if (shareCloseBtn) {
          actionsEl.insertBefore(nativeBtn, shareCloseBtn);
        } else {
          actionsEl.appendChild(nativeBtn);
        }
        this._nativeShareBtn = nativeBtn;

        nativeBtn.addEventListener("click", async () => {
          const text = shareTextEl ? shareTextEl.value : "";
          const shareUrl = this._data && isHttpShareUrl(this._data.shareUrl) ? this._data.shareUrl : "";
          const payload = { text };
          if (shareUrl) {
            payload.url = shareUrl;
          }

          try {
            await navigator.share(payload);
          } catch (error) {
            void error;
          }
        });
      }

      if (shareCloseBtn) {
        shareCloseBtn.addEventListener("click", () => {
          this.close();
        });
      }

      if (shareDontAskEl) {
        shareDontAskEl.addEventListener("change", () => {
          this._setDontAsk(!!shareDontAskEl.checked);
        });
      }

      shareModalEl.addEventListener("keydown", (event) => {
        if (!this.isOpen()) {
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.close();
          return;
        }

        if (event.key === "Tab") {
          this._handleTabTrap(event);
        }
      });
    }
  };

  AIPU.share = {
    CANONICAL_SHARE_URL,
    isHttpShareUrl,
    resolveShareUrl,
    buildShareCopy,
    buildRunCardDataUrl,
    shareUI
  };
})();
