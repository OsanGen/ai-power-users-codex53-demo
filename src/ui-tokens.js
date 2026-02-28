(() => {
  "use strict";

  const AIPU = (window.AIPU = window.AIPU || {});

  const UI_TOKENS = Object.freeze({
    palette: Object.freeze({
      yellow: "#f4d66d",
      blue: "#89b6ff",
      mint: "#90dec9",
      pink: "#f4accd",
      ink: "#1f2430",
      white: "#ffffff",
      fog: "#f2f5f8",
      inkSoft: "#2f3647",
      inkMuted: "#546078",
      chipDot: "#89b6ff"
    }),
    focus: "#27395a",
    surface: Object.freeze({
      panelBorderColor: "#1f2430",
      panelShadow: "0 12px 30px rgba(31, 36, 48, 0.1)",
      panelShadowSoft: "0 8px 18px rgba(31, 36, 48, 0.06)",
      panelShadowTight: "0 6px 16px rgba(31, 36, 48, 0.08)",
      shellShadow: "0 10px 24px rgba(31, 36, 48, 0.1)",
      overlayBackdrop: "rgba(242, 245, 248, 0.74)"
    }),
    spacing: Object.freeze({
      1: "0.5rem",
      2: "0.75rem",
      3: "1rem",
      4: "1.25rem",
      5: "1.5rem"
    }),
    radius: Object.freeze({
      soft: "18px",
      large: "24px"
    }),
    motion: Object.freeze({
      duration: "120ms",
      easing: "cubic-bezier(0.2, 0.9, 0.2, 1)"
    }),
    componentClasses: Object.freeze({
      shell: "app-shell",
      header: "app-header",
      footer: "app-footer",
      gameFrame: "game-frame",
      canvas: "game-canvas",
      overlayRestart: "overlay-restart",
      modal: "modal",
      modalPanel: "modal-panel",
      modalAccent: "modal-accent",
      modalSummary: "modal-summary",
      modalActions: "modal-actions",
      modalNote: "modal-note",
      modalStatus: "modal-status",
      modalCheck: "modal-check",
      button: "btn",
      buttonPrimary: "btn-primary",
      statusGrid: "status-grid",
      statusChip: "status-chip",
      skipLink: "skip-link",
      shareText: "share-text",
      shareCardWrap: "share-card-wrap",
      shareCardPreview: "share-card-preview"
    })
  });

  const UI_ELEMENT_IDS = Object.freeze({
    appShell: "appShell",
    appTitle: "appTitle",
    appPrimaryControlHints: "appPrimaryControlHints",
    appMoveHintText: "appMoveHintText",
    appShootHintText: "appShootHintText",
    appFooterControlStrip: "appFooterControlStrip",
    appFooterBombHintBtn: "appFooterBombHintBtn",
    appFooterBombHintKey: "appFooterBombHintKey",
    appFooterBombHintAction: "appFooterBombHintAction",
    appFooterBombHintState: "appFooterBombHintState",
    appFooterMusicHintBtn: "appFooterMusicHintBtn",
    appFooterMusicHintKey: "appFooterMusicHintKey",
    appFooterMusicHintAction: "appFooterMusicHintAction",
    appFooterMusicHintState: "appFooterMusicHintState",
    appFooterSfxHintBtn: "appFooterSfxHintBtn",
    appFooterSfxHintKey: "appFooterSfxHintKey",
    appFooterSfxHintAction: "appFooterSfxHintAction",
    appFooterSfxHintState: "appFooterSfxHintState",
    textModal: "textModal",
    textModalTitle: "textModalTitle",
    textModalNote: "textModalNote",
    lessonTextLabel: "lessonTextLabel",
    lessonTextInput: "lessonTextInput",
    lessonTextSaveBtn: "lessonTextSaveBtn",
    lessonTextSampleBtn: "lessonTextSampleBtn",
    lessonTextCloseBtn: "lessonTextCloseBtn",
    shareModal: "shareModal",
    shareTitle: "shareTitle",
    shareFloor: "shareFloor",
    shareCardPreview: "shareCardPreview",
    shareText: "shareText",
    shareTextLabel: "shareTextLabel",
    shareCopyBtn: "shareCopyBtn",
    shareLinkedInBtn: "shareLinkedInBtn",
    shareDownloadBtn: "shareDownloadBtn",
    shareCloseBtn: "shareCloseBtn",
    shareDontAsk: "shareDontAsk",
    shareDontAskText: "shareDontAskText",
    shareModalNote: "shareModalNote",
    gameFrame: "gameFrame",
    gameCanvas: "game",
    overlayRestartBtn: "overlayRestartBtn"
  });

  const REQUIRED_DOM_IDS = Object.freeze([
    "appShell",
    "appTitle",
    "appPrimaryControlHints",
    "appMoveHintText",
    "appShootHintText",
    "appFooterControlStrip",
    "appFooterMusicHintBtn",
    "appFooterMusicHintKey",
    "appFooterMusicHintAction",
    "appFooterMusicHintState",
    "appFooterSfxHintBtn",
    "appFooterSfxHintKey",
    "appFooterSfxHintAction",
    "appFooterSfxHintState",
    "appFooterBombHintBtn",
    "appFooterBombHintKey",
    "appFooterBombHintAction",
    "appFooterBombHintState",
    "gameFrame",
    "game",
    "textModal",
    "textModalTitle",
    "textModalNote",
    "lessonTextLabel",
    "lessonTextInput",
    "lessonTextSaveBtn",
    "lessonTextSampleBtn",
    "lessonTextCloseBtn",
    "shareModal",
    "shareTitle",
    "shareFloor",
    "shareCardPreview",
    "shareText",
    "shareTextLabel",
    "shareCopyBtn",
    "shareLinkedInBtn",
    "shareDownloadBtn",
    "shareCloseBtn",
    "shareDontAsk",
    "shareDontAskText",
    "shareModalNote",
    "overlayRestartBtn"
  ]);

  const UI_COMPONENTS = Object.freeze({
    status: Object.freeze({
      goalId: "",
      restartId: "",
      shellId: "appShell"
    }),
    modal: Object.freeze({
      shareId: "shareModal",
      lessonTextId: "textModal",
      textInputId: "lessonTextInput"
    }),
    elementIds: UI_ELEMENT_IDS,
    requiredElementIds: REQUIRED_DOM_IDS,
    classes: UI_TOKENS.componentClasses
  });

  AIPU.uiTokens = UI_TOKENS;
  AIPU.uiComponents = UI_COMPONENTS;
  AIPU.ui = Object.assign({}, AIPU.ui || {}, {
    tokens: UI_TOKENS,
    components: UI_COMPONENTS
  });
})();
