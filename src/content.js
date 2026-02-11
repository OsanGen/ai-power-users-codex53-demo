(() => {
  "use strict";

  const AIPU = window.AIPU;
  const { clamp } = AIPU.utils;

  const N = window.AI_POWER_USER_NARRATIVE || null;
  console.log("[narrative] loaded:", !!window.AI_POWER_USER_NARRATIVE);
  const LESSON_TEXT_KEY = "LESSON_TEXT_V1";
  const LESSON_TEXT_MAX_CHARS = 4000;
  const LESSON_TEXT_FALLBACK =
    "A churn model starts with input numbers like logins and tickets. Weights scale each input. Hidden concepts combine those weighted signals. The model outputs one churn-risk score.";
  const LESSON_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "we",
    "with",
    "you",
    "your",
    "they",
    "their",
    "then",
    "than",
    "into",
    "one",
    "can"
  ]);
  const UPGRADE_TEACH_MAP = {
    comfy_soles: {
      title: "More input reps",
      oneLiner: "More practice gives more useful examples.",
      bullets: ["Collect more cases.", "Patterns appear faster.", "Practice improves guesses."]
    },
    quick_trigger: {
      title: "Fast feedback",
      oneLiner: "Quick results help you adjust sooner.",
      bullets: ["Short delay helps learning.", "Fix errors faster.", "Fast loops teach quicker."]
    },
    wide_shots: {
      title: "Decision line",
      oneLiner: "Boundaries separate classes like yes or no.",
      bullets: ["Boundary splits outcomes.", "Near cases can flip.", "Small shifts matter."]
    },
    fast_rounds: {
      title: "Training rounds",
      oneLiner: "More rounds means more chances to learn.",
      bullets: ["More tries per second.", "See patterns sooner.", "Keep control while scaling."]
    },
    ghost_rounds: {
      title: "Hidden path",
      oneLiner: "Extra paths help signal keep moving.",
      bullets: ["Signal is less lost.", "Deep stacks stay trainable.", "More paths, same goal."]
    },
    heart_container: {
      title: "Error budget",
      oneLiner: "Some mistakes are okay while learning.",
      bullets: ["Absorb a bad step.", "Recover and continue.", "Limits still matter."]
    },
    bubble_shield: {
      title: "Guardrail",
      oneLiner: "Guardrails block one bad mistake.",
      bullets: ["Safety prevents collapse.", "One hit is absorbed.", "Stable systems learn better."]
    },
    grace_frames: {
      title: "Stability time",
      oneLiner: "A short pause reduces noisy swings.",
      bullets: ["Pause after impact.", "Reset before next step.", "Less noise, clearer signal."]
    },
    magnet_hands: {
      title: "Useful data",
      oneLiner: "Better sampling pulls useful examples closer.",
      bullets: ["Collect helpful cases.", "Spend less time on noise.", "Better data, better output."]
    },
    slowmo_aura: {
      title: "Noise control",
      oneLiner: "Slower noise gives cleaner decisions.",
      bullets: ["Reduce fast noise.", "Gain reaction time.", "Cleaner signal wins."]
    },
    fallback_heal: {
      title: "Quick fix",
      oneLiner: "Small fixes keep learning on track.",
      bullets: ["Repair one mistake.", "Keep run stable.", "Then continue learning."]
    },
    fallback_gold: {
      title: "Pause step",
      oneLiner: "A short pause prevents bad jumps.",
      bullets: ["Add brief safety.", "Avoid unstable updates.", "Choose control first."]
    },
    default: {
      title: "Model loop",
      oneLiner: "Inputs become signals, then one score.",
      bullets: ["Read the example.", "Find strong signals.", "Explain the score."]
    }
  };
  const UPGRADE_HELP_BULLETS = {
    comfy_soles: "This upgrade helps you test more cases.",
    quick_trigger: "This upgrade gives faster feedback.",
    wide_shots: "This upgrade makes hit decisions easier.",
    fast_rounds: "This upgrade increases practice rounds.",
    ghost_rounds: "This upgrade keeps signal moving.",
    heart_container: "This upgrade gives room for mistakes.",
    bubble_shield: "This upgrade adds a safety layer.",
    grace_frames: "This upgrade gives reset time.",
    magnet_hands: "This upgrade pulls in useful data.",
    slowmo_aura: "This upgrade slows noisy pressure.",
    fallback_heal: "This effect helps recover and continue.",
    fallback_gold: "This effect gives a safer pause.",
    default: "This choice supports the learning loop."
  };

  function pickNarrativeText(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function normalizeLessonSourceText(value) {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.slice(0, LESSON_TEXT_MAX_CHARS);
  }

  function getLessonSourceText() {
    const game = AIPU.state && AIPU.state.game ? AIPU.state.game : null;
    const stateText = game && typeof game.lessonSourceText === "string" ? game.lessonSourceText : "";
    if (stateText.trim()) {
      return normalizeLessonSourceText(stateText);
    }

    let stored = "";
    try {
      stored = localStorage.getItem(LESSON_TEXT_KEY) || "";
    } catch (error) {
      stored = "";
    }
    const normalizedStored = normalizeLessonSourceText(stored);
    if (normalizedStored) {
      if (game) {
        game.lessonSourceText = normalizedStored;
      }
      return normalizedStored;
    }

    if (game) {
      game.lessonSourceText = LESSON_TEXT_FALLBACK;
    }
    return LESSON_TEXT_FALLBACK;
  }

  function setLessonSourceText(text) {
    const normalized = normalizeLessonSourceText(text);
    const nextText = normalized || LESSON_TEXT_FALLBACK;
    if (AIPU.state && AIPU.state.game) {
      AIPU.state.game.lessonSourceText = nextText;
    }
    try {
      localStorage.setItem(LESSON_TEXT_KEY, nextText);
    } catch (error) {
      void error;
    }
  }

  function getLessonSnippet(floorId) {
    const sourceText = getLessonSourceText();
    const sentenceMatches = sourceText.match(/[^.!?]+[.!?]?/g);
    const sentences = Array.isArray(sentenceMatches) ? sentenceMatches.map((sentence) => sentence.trim()).filter(Boolean) : [];

    if (sentences.length > 0) {
      const safeFloor = Math.max(1, Number.parseInt(String(floorId), 10) || 1);
      const index = (safeFloor - 1) % sentences.length;
      const selected = sentences[index] || sentences[0];
      return selected.slice(0, 220).trim();
    }

    return sourceText.slice(0, 220).trim();
  }

  function extractKeywords(snippet, max = 6) {
    const normalized = String(snippet || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ");
    const words = normalized.split(/\s+/).filter(Boolean);
    const counts = new Map();

    for (const word of words) {
      if (word.length < 2 || LESSON_STOPWORDS.has(word)) {
        continue;
      }
      counts.set(word, (counts.get(word) || 0) + 1);
    }

    const ranked = Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, Math.max(1, max))
      .map((entry) => entry[0]);

    return ranked;
  }

  function resolveTeachUpgradeKey(upgradeId) {
    if (UPGRADE_TEACH_MAP[upgradeId]) {
      return upgradeId;
    }
    if (typeof upgradeId === "string" && upgradeId.startsWith("fallback_heal")) {
      return "fallback_heal";
    }
    if (typeof upgradeId === "string" && upgradeId.startsWith("fallback_gold")) {
      return "fallback_gold";
    }
    return "default";
  }

  function buildTeachCardForUpgrade(upgradeId, floorId) {
    const key = resolveTeachUpgradeKey(upgradeId);
    const cards = Array.isArray(N && N.teachCards) ? N.teachCards : [];
    const safeFloor = Math.max(1, Number.parseInt(String(floorId), 10) || 1);
    const floorCard = cards.find((card) => card && Number(card.floor) === safeFloor) || null;
    const fallbackTeach = UPGRADE_TEACH_MAP.default;
    const helperBullet = UPGRADE_HELP_BULLETS[key] || UPGRADE_HELP_BULLETS.default;

    const title = pickNarrativeText(
      floorCard && floorCard.title,
      `Step ${safeFloor}: ${fallbackTeach.title}`
    );
    const oneLiner = pickNarrativeText(
      floorCard && floorCard.oneLiner,
      fallbackTeach.oneLiner
    );
    const floorBullets = Array.isArray(floorCard && floorCard.bullets)
      ? floorCard.bullets.filter((line) => typeof line === "string" && line.trim()).slice(0, 2)
      : [];
    const fallbackBullets = Array.isArray(fallbackTeach.bullets)
      ? fallbackTeach.bullets.filter((line) => typeof line === "string" && line.trim())
      : [];
    const bullets = [...floorBullets, helperBullet];
    let fallbackIndex = 0;
    while (bullets.length < 3 && fallbackIndex < fallbackBullets.length) {
      bullets.push(fallbackBullets[fallbackIndex]);
      fallbackIndex += 1;
    }

    return {
      title,
      oneLiner,
      bullets: bullets.slice(0, 3),
      exampleLabel: "",
      exampleText: ""
    };
  }

  function limitWords(text, maxWords = 12) {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return "";
    }
    const words = normalized.split(" ");
    if (words.length <= maxWords) {
      return normalized;
    }
    return `${words.slice(0, maxWords).join(" ")}...`;
  }

  function getNarrativeTitleCard() {
    const titleScreen = N && typeof N.titleScreen === "object" ? N.titleScreen : null;
    const gameTitle = pickNarrativeText(titleScreen && titleScreen.title, "Neural Glass: Neural Nets");
    const tagline = pickNarrativeText(titleScreen && titleScreen.subtitle, "Drag inputs. Watch concepts. Predict churn.");
    const fallbackBlurb = ["Neural nets learn signal vs noise.", "They learn weights from data.", "They output one prediction."];
    const lines = Array.isArray(titleScreen && titleScreen.bullets)
      ? titleScreen.bullets.filter((line) => typeof line === "string" && line.trim()).slice(0, 3).map((line) => line.trim())
      : [];
    const footerHint = pickNarrativeText(titleScreen && titleScreen.footerHint, "Enter: start");

    return {
      gameTitle,
      tagline,
      blurbLines: lines.length > 0 ? lines : fallbackBlurb,
      footerHint
    };
  }

  function getNarrativeFloorCopy(floor) {
    const cards = Array.isArray(N && N.teachCards) ? N.teachCards : [];
    const floorId = floor && Number.isFinite(floor.id) ? floor.id : 1;
    const entry = cards.find((card) => card && Number(card.floor) === floorId) || null;
    const floorFallbackTitle = `Floor ${floorId}`;
    const floorFallbackSubtitle = "Input -> weight -> concept -> output.";
    const lessonUpgradeId =
      AIPU.state &&
      AIPU.state.game &&
      typeof AIPU.state.game.floorLessonUpgradeId === "string" &&
      AIPU.state.game.floorLessonUpgradeId
        ? AIPU.state.game.floorLessonUpgradeId
        : "";

    if (lessonUpgradeId) {
      const teach = buildTeachCardForUpgrade(lessonUpgradeId, floorId);
      return {
        title: limitWords(pickNarrativeText(teach.title, floorFallbackTitle), 12),
        subtitle: limitWords(pickNarrativeText(teach.oneLiner, floorFallbackSubtitle), 12)
      };
    }

    return {
      title: pickNarrativeText(entry && entry.title, floorFallbackTitle),
      subtitle: pickNarrativeText(entry && entry.oneLiner, floorFallbackSubtitle)
    };
  }

  function getNarrativeOutcomeCopy(isVictory) {
    const ui = N && N.ui && typeof N.ui === "object" ? N.ui : null;
    if (isVictory) {
      return {
        title: pickNarrativeText(ui && ui.victoryTitle, "You can explain a neural net."),
        subtitle: pickNarrativeText(ui && ui.victorySubtitle, "You learned the loop, not magic.")
      };
    }

    return {
      title: pickNarrativeText(ui && ui.gameOverTitle, "Run ended. Lesson stays."),
      subtitle: pickNarrativeText(ui && ui.gameOverSubtitle, "Try again. Watch the dominant concept.")
    };
  }

  function getNarrativeUiText(key, fallback) {
    const ui = N && N.ui && typeof N.ui === "object" ? N.ui : null;
    return pickNarrativeText(ui && ui[key], fallback);
  }

  function getWhatYouLearnedBullets() {
    const generic = ["Inputs are numbers.", "Weights set importance.", "Concepts drive the score."];
    const upgradeState = AIPU.upgrades && AIPU.upgrades.upgradeState ? AIPU.upgrades.upgradeState : null;
    const history = upgradeState && Array.isArray(upgradeState.history) ? upgradeState.history : [];
    if (history.length === 0) {
      return generic;
    }

    const seenConcepts = new Set();
    const bullets = [];

    for (const record of history) {
      const conceptKey = resolveTeachUpgradeKey(record && record.id ? record.id : "");
      if (seenConcepts.has(conceptKey)) {
        continue;
      }
      seenConcepts.add(conceptKey);

      const teach = UPGRADE_TEACH_MAP[conceptKey] || UPGRADE_TEACH_MAP.default;
      const conceptTitle = limitWords(teach.title, 6);
      bullets.push(`${conceptTitle} shape model outcomes.`);
      if (bullets.length >= 3) {
        break;
      }
    }

    let genericIndex = 0;
    while (bullets.length < 3 && genericIndex < generic.length) {
      bullets.push(generic[genericIndex]);
      genericIndex += 1;
    }

    return bullets.slice(0, 3);
  }

  function wave(
    enemyType,
    startTime,
    endTime,
    spawnRateStart,
    spawnRateEnd,
    speedMultiplierStart,
    speedMultiplierEnd,
    specialFlags = []
  ) {
    return {
      enemyType,
      startTime,
      endTime,
      spawnRateStart,
      spawnRateEnd,
      speedMultiplierStart,
      speedMultiplierEnd,
      specialFlags
    };
  }

  const FLOORS = [
    {
      id: 1,
      name: "Invocation Corridor",
      durationSeconds: 48,
      accent: "yellow",
      overlayTitle: "Floor 1 - AI Power Users",
      overlaySubtitle: "AI POWER USERS pulses in the walls. The rabbit hole opens.",
      heartType: "anchor",
      heartSpawn: { initialCount: 2, baseRate: 0.1, clutchBoostStart: 10 },
      enemyWaves: [
        wave("signal_echo", 0, 48, 0.55, 1.15, 0.92, 1.18),
        wave("signal_echo", 28, 48, 0.2, 0.55, 1.0, 1.2, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 2,
      name: "Tool Discovery Run",
      durationSeconds: 52,
      accent: "blue",
      overlayTitle: "Floor 2 - Tool Discovery",
      overlaySubtitle: "New tools appear quickly. The rabbit stays just ahead.",
      heartType: "refuge",
      heartSpawn: { initialCount: 2, baseRate: 0.1, clutchBoostStart: 9 },
      enemyWaves: [
        wave("rabbit_glimpse", 0, 52, 0.6, 1.35, 0.95, 1.28),
        wave("signal_echo", 8, 30, 0.15, 0.5, 1.0, 1.2),
        wave("rabbit_glimpse", 35, 52, 0.7, 1.55, 1.08, 1.36, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 3,
      name: "Prompt Loop Feed",
      durationSeconds: 56,
      accent: "mint",
      overlayTitle: "Floor 3 - Prompt Loop",
      overlaySubtitle: "Prompts, docs, and context windows keep refreshing in sync.",
      heartType: "memory",
      heartSpawn: { initialCount: 1, baseRate: 0.09, clutchBoostStart: 12 },
      enemyWaves: [
        wave("notification_swarm", 0, 56, 0.95, 2.2, 0.95, 1.25),
        wave("name_glitch_shade", 10, 56, 0.2, 0.75, 0.95, 1.22),
        wave("notification_swarm", 28, 56, 0.4, 1.3, 1.05, 1.35)
      ]
    },
    {
      id: 4,
      name: "Workflow Sync Lane",
      durationSeconds: 60,
      accent: "pink",
      overlayTitle: "Floor 4 - Workflow Sync",
      overlaySubtitle: "Agents and apps begin coordinating in a steady rhythm.",
      heartType: "noise_cancel",
      heartSpawn: { initialCount: 1, baseRate: 0.09, clutchBoostStart: 12 },
      enemyWaves: [
        wave("speaker_wraith", 0, 60, 0.45, 1.0, 0.95, 1.2),
        wave("notification_swarm", 6, 34, 0.4, 1.15, 0.95, 1.18),
        wave("name_glitch_shade", 24, 60, 0.3, 0.95, 1.0, 1.24)
      ]
    },
    {
      id: 5,
      name: "Stack Builder Hall",
      durationSeconds: 64,
      accent: "yellow",
      overlayTitle: "Floor 5 - Stack Builder",
      overlaySubtitle: "Your stack begins to click: tools, memory, and execution.",
      heartType: "table",
      heartSpawn: { initialCount: 1, baseRate: 0.085, clutchBoostStart: 13 },
      enemyWaves: [
        wave("chair_knight", 0, 64, 0.35, 0.9, 0.95, 1.2),
        wave("rabbit_glimpse", 5, 30, 0.35, 0.9, 1.0, 1.2),
        wave("hammer_rabbit", 24, 64, 0.2, 0.55, 1.0, 1.22),
        wave("chair_knight", 35, 64, 0.25, 0.85, 1.08, 1.28)
      ]
    },
    {
      id: 6,
      name: "Automation Loop",
      durationSeconds: 70,
      accent: "blue",
      overlayTitle: "Floor 6 - Automation Loop",
      overlaySubtitle: "You pass the same workflow again, now faster and cleaner.",
      heartType: "checkpoint",
      heartSpawn: { initialCount: 1, baseRate: 0.082, clutchBoostStart: 14 },
      enemyWaves: [
        wave("loop_ghost", 0, 70, 0.55, 1.2, 0.95, 1.25, ["spawnsBehindPlayer"]),
        wave("name_glitch_shade", 15, 60, 0.2, 0.7, 1.0, 1.2),
        wave("loop_ghost", 38, 70, 0.45, 1.35, 1.05, 1.35, ["spawnsBehindPlayer"])
      ]
    },
    {
      id: 7,
      name: "Mirror Workflow",
      durationSeconds: 76,
      accent: "mint",
      overlayTitle: "Floor 7 - Mirror Workflow",
      overlaySubtitle: "A mirrored agent runs your process with your precision.",
      heartType: "mirror",
      heartSpawn: { initialCount: 1, baseRate: 0.08, clutchBoostStart: 14 },
      enemyWaves: [
        wave("decay_mote", 0, 76, 1.0, 2.35, 0.95, 1.32),
        wave("loop_ghost", 8, 56, 0.3, 0.85, 1.0, 1.25),
        wave("double", 48, 76, 0.1, 0.4, 1.0, 1.2, ["mirrorsPlayer"])
      ]
    },
    {
      id: 8,
      name: "Integration Threshold",
      durationSeconds: 84,
      accent: "pink",
      overlayTitle: "Floor 8 - Integration Threshold",
      overlaySubtitle: "Integrations wake up across your stack as flows stay stable.",
      heartType: "bloom",
      heartSpawn: { initialCount: 1, baseRate: 0.075, clutchBoostStart: 16 },
      enemyWaves: [
        wave("apex_rabbit", 0, 84, 0.22, 0.72, 1.0, 1.24),
        wave("cell_blob", 8, 84, 0.45, 1.1, 0.95, 1.26, ["canSplit"]),
        wave("speaker_wraith", 28, 84, 0.2, 0.62, 1.05, 1.3)
      ]
    },
    {
      id: 9,
      name: "Power User Emergence",
      durationSeconds: 92,
      accent: "yellow",
      overlayTitle: "Floor 9 - Power User Emergence",
      overlaySubtitle: "You return from the rabbit hole with power-user clarity.",
      heartType: "final",
      heartSpawn: { initialCount: 1, baseRate: 0.07, clutchBoostStart: 18 },
      enemyWaves: [
        wave("reach_shadow", 0, 92, 0.35, 0.92, 1.0, 1.22),
        wave("evolution_rabbit", 8, 92, 0.09, 0.22, 1.0, 1.14),
        wave("decay_mote", 30, 92, 0.45, 1.45, 1.05, 1.36),
        wave("loop_ghost", 42, 92, 0.22, 0.72, 1.08, 1.34, ["spawnsBehindPlayer"])
      ]
    }
  ];

  const TITLE_SEQUENCE = {
    fadeInEnd: 1.2,
    panelInStart: 0.4,
    panelInEnd: 2.5,
    accentSweepStart: 0.9,
    accentSweepEnd: 3.6,
    finish: 6.2
  };

  const ENEMY_DEFS = {
    signal_echo: { hp: 2, size: 15, speed: 82, behavior: "chase", touchDamage: 1 },
    rabbit_glimpse: { hp: 1, size: 12, speed: 128, behavior: "dash", touchDamage: 1 },
    notification_swarm: { hp: 1, size: 10, speed: 104, behavior: "swarm", touchDamage: 1 },
    name_glitch_shade: { hp: 2, size: 14, speed: 88, behavior: "phase", touchDamage: 1 },
    speaker_wraith: {
      hp: 3,
      size: 15,
      speed: 78,
      behavior: "ranged",
      touchDamage: 1,
      projectileSpeed: 180
    },
    chair_knight: { hp: 4, size: 17, speed: 72, behavior: "tank", touchDamage: 1 },
    hammer_rabbit: { hp: 5, size: 16, speed: 108, behavior: "charge", touchDamage: 1 },
    loop_ghost: { hp: 2, size: 13, speed: 98, behavior: "chase", touchDamage: 1 },
    decay_mote: { hp: 1, size: 8, speed: 152, behavior: "swarm", touchDamage: 1 },
    double: { hp: 5, size: 15, speed: 116, behavior: "mirror", touchDamage: 1 },
    apex_rabbit: { hp: 6, size: 17, speed: 126, behavior: "charge", touchDamage: 2 },
    cell_blob: { hp: 2, size: 11, speed: 88, behavior: "blob", touchDamage: 1 },
    reach_shadow: { hp: 3, size: 13, speed: 0, behavior: "wallhand", touchDamage: 2 },
    evolution_rabbit: { hp: 10, size: 19, speed: 122, behavior: "boss", touchDamage: 2 }
  };

  function getThreatGlossaryRows(maxRows = 4, namesOnly = false) {
    const lore = N && N.enemyLore && typeof N.enemyLore === "object" ? N.enemyLore : null;
    if (!lore) {
      return [];
    }

    const rows = [];
    const enemyIds = Object.keys(ENEMY_DEFS);
    for (const id of enemyIds) {
      const entry = lore[id];
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const means = typeof entry.means === "string" ? entry.means.trim() : "";
      if (!name) {
        continue;
      }

      rows.push(namesOnly || !means ? name : `${name}: ${means}`);
      if (rows.length >= clamp(maxRows, 1, 12)) {
        break;
      }
    }

    return rows;
  }

  AIPU.content = {
    N,
    FLOORS,
    TITLE_SEQUENCE,
    ENEMY_DEFS,
    LESSON_TEXT_KEY,
    pickNarrativeText,
    getLessonSourceText,
    setLessonSourceText,
    getLessonSnippet,
    extractKeywords,
    buildTeachCardForUpgrade,
    getNarrativeTitleCard,
    getNarrativeFloorCopy,
    getNarrativeOutcomeCopy,
    getNarrativeUiText,
    getWhatYouLearnedBullets,
    getThreatGlossaryRows
  };
})();
