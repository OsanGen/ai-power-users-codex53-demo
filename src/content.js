(() => {
  "use strict";

  const AIPU = window.AIPU;
  const { clamp } = AIPU.utils;

  const N = window.AI_POWER_USER_NARRATIVE || null;
  console.log("[narrative] loaded:", !!window.AI_POWER_USER_NARRATIVE);

  function pickNarrativeText(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function getNarrativeTitleCard() {
    const gameTitle = pickNarrativeText(N && N.gameTitle, "AI POWER USERS");
    const tagline = pickNarrativeText(N && N.tagline, "Codex 5.3 Tech Demo");
    const fallbackBlurb = [
      "Follow one builder into the AI tooling rabbit hole, then emerge as an AI power user with repeatable workflows."
    ];
    const lines = Array.isArray(N && N.titleBlurb)
      ? N.titleBlurb.filter((line) => typeof line === "string" && line.trim()).slice(0, 3).map((line) => line.trim())
      : [];

    return {
      gameTitle,
      tagline,
      blurbLines: lines.length > 0 ? lines : fallbackBlurb
    };
  }

  function getNarrativeFloorCopy(floor) {
    const floorFallbackTitle = floor && floor.overlayTitle ? floor.overlayTitle : floor && floor.name ? floor.name : "";
    const floorFallbackSubtitle = floor && floor.overlaySubtitle ? floor.overlaySubtitle : "";
    const floorList = Array.isArray(N && N.floors) ? N.floors : [];
    const index = floor && Number.isFinite(floor.id) ? floor.id - 1 : -1;
    const entry = index >= 0 && index < floorList.length ? floorList[index] : null;

    return {
      title: pickNarrativeText(entry && entry.title, floorFallbackTitle),
      subtitle: pickNarrativeText(entry && entry.subtitle, floorFallbackSubtitle)
    };
  }

  function getNarrativeOutcomeCopy(isVictory) {
    if (isVictory) {
      const block = N && N.victory;
      return {
        title: pickNarrativeText(block && block.title, "Run Complete"),
        subtitle: pickNarrativeText(block && block.subtitle, "You completed the AI tooling climb and finalized a stable build.")
      };
    }

    const block = N && N.gameOver;
    return {
      title: pickNarrativeText(block && block.title, "Run Failed"),
      subtitle: pickNarrativeText(block && block.subtitle, "The run ended before the build fully stabilized.")
    };
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
    pickNarrativeText,
    getNarrativeTitleCard,
    getNarrativeFloorCopy,
    getNarrativeOutcomeCopy,
    getThreatGlossaryRows
  };
})();
