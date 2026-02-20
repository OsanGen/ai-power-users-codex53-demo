(() => {
  "use strict";

  const AIPU = window.AIPU;
  const { BASE_PLAYER_SPEED, BASE_FIRE_COOLDOWN, BASE_BULLET_RADIUS, BASE_BULLET_SPEED, BASE_BULLET_PIERCE } =
    AIPU.constants;
  const {
    BASE_MAX_HP,
    BASE_INVULN_TIME,
    MAX_INVULN_TIME,
    MAX_FLOOR_SHIELD_CHARGES,
    FALLBACK_IFRAME_BONUS,
    MAX_FALLBACK_IFRAME_BONUS
  } = AIPU.constants;
  const { game, player } = AIPU.state;
  const { clamp, randomFrom, shuffleArray } = AIPU.utils;
  const { N } = AIPU.content;

  const UPGRADE_DEFS = [
    {
      id: "comfy_soles",
      name: "Comfy Soles",
      desc: "+6% move speed per stack.",
      tags: ["utility"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.moveSpeedMult *= Math.pow(1.06, stack);
      }
    },
    {
      id: "quick_trigger",
      name: "Quick Trigger",
      desc: "-6% shot cooldown per stack.",
      tags: ["offense"],
      maxStacks: 6,
      apply: null,
      modifier: (stats, stack) => {
        stats.fireCooldownMult *= Math.pow(0.94, stack);
      }
    },
    {
      id: "wide_shots",
      name: "Wide Shots",
      desc: "+10% bullet radius per stack.",
      tags: ["offense"],
      maxStacks: 6,
      apply: null,
      modifier: (stats, stack) => {
        stats.bulletRadiusMult *= Math.pow(1.1, stack);
      }
    },
    {
      id: "fast_rounds",
      name: "Fast Rounds",
      desc: "+8% bullet speed per stack.",
      tags: ["offense"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.bulletSpeedMult *= Math.pow(1.08, stack);
      }
    },
    {
      id: "ghost_rounds",
      name: "Ghost Rounds",
      desc: "+1 bullet pierce per stack.",
      tags: ["offense"],
      maxStacks: 3,
      apply: null,
      modifier: (stats, stack) => {
        stats.bulletPierceBonus += stack;
      }
    },
    {
      id: "heart_container",
      name: "Heart Container",
      desc: "+1 max HP per stack and heal +1 immediately.",
      tags: ["defense"],
      maxStacks: 3,
      apply: () => {
        syncPlayerMaxHP(false);
        player.hearts = clamp(player.hearts + 1, 0, player.maxHearts);
      },
      modifier: (stats, stack) => {
        stats.maxHpBonus += stack;
      }
    },
    {
      id: "bubble_shield",
      name: "Bubble Shield",
      desc: "Start each floor with +1 shield charge per stack.",
      tags: ["defense"],
      maxStacks: 2,
      apply: null,
      modifier: (stats, stack) => {
        stats.floorShieldCharges += stack;
      }
    },
    {
      id: "grace_frames",
      name: "Grace Frames",
      desc: "+0.10s post-hit invulnerability per stack.",
      tags: ["defense"],
      maxStacks: 4,
      apply: null,
      modifier: (stats, stack) => {
        stats.invulnBonus += 0.1 * stack;
      }
    },
    {
      id: "magnet_hands",
      name: "Magnet Hands",
      desc: "+40px pickup magnet radius per stack.",
      tags: ["utility"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.pickupMagnetBonus += 40 * stack;
      }
    },
    {
      id: "slowmo_aura",
      name: "Slowmo Aura",
      desc: "Enemy bullet speed x0.93 per stack.",
      tags: ["utility", "defense"],
      maxStacks: 5,
      apply: null,
      modifier: (stats, stack) => {
        stats.enemyBulletSpeedMult *= Math.pow(0.93, stack);
      }
    }
  ];

  const FALLBACK_UPGRADE_DEFS = [
    {
      id: "fallback_heal",
      name: "Patch Job",
      desc: "Heal +1 immediately.",
      tags: ["utility"],
      stackless: true
    },
    {
      id: "fallback_gold",
      name: "Breathe",
      desc: "+0.05s iFrames this floor.",
      tags: ["defense", "utility"],
      stackless: true
    }
  ];

  const upgradeState = {
    stacks: Object.create(null),
    history: [],
    lastTakenSerial: Object.create(null),
    serial: 0
  };

  const derivedCache = {
    dirty: true,
    value: null
  };

  function invalidateDerivedStats() {
    derivedCache.dirty = true;
  }

  function applyNarrativeUpgradeRename() {
    if (!N || typeof N !== "object" || !N.upgradeRename || typeof N.upgradeRename !== "object") {
      return;
    }

    for (const upgrade of UPGRADE_DEFS) {
      const renamed = N.upgradeRename[upgrade.id];
      if (!renamed || typeof renamed !== "object") {
        continue;
      }

      if (typeof renamed.name === "string" && renamed.name.trim()) {
        upgrade.name = renamed.name.trim();
      }
      if (typeof renamed.desc === "string" && renamed.desc.trim()) {
        upgrade.desc = renamed.desc.trim();
      }
    }
  }

  function resetUpgradeRun() {
    upgradeState.stacks = Object.create(null);
    upgradeState.history = [];
    upgradeState.lastTakenSerial = Object.create(null);
    upgradeState.serial = 0;
    invalidateDerivedStats();
  }

  function getUpgradeDef(id) {
    return UPGRADE_DEFS.find((upgrade) => upgrade.id === id) || null;
  }

  function getStack(id) {
    return upgradeState.stacks[id] || 0;
  }

  function canTakeUpgrade(id) {
    const def = getUpgradeDef(id);
    return !!def && getStack(id) < def.maxStacks;
  }

  function getFallbackDef(id) {
    return FALLBACK_UPGRADE_DEFS.find((fallback) => fallback.id === id) || null;
  }

  function buildFallbackOffer(slotIndex, usedIds) {
    if (FALLBACK_UPGRADE_DEFS.length === 0) {
      return null;
    }

    const primaryPool = FALLBACK_UPGRADE_DEFS.filter((fallback) => !usedIds.has(fallback.id));
    const base =
      primaryPool.length > 0
        ? randomFrom(primaryPool)
        : FALLBACK_UPGRADE_DEFS[slotIndex % FALLBACK_UPGRADE_DEFS.length];

    let offerId = base.id;
    let suffix = 1;
    while (usedIds.has(offerId)) {
      offerId = `${base.id}_${slotIndex + suffix}`;
      suffix += 1;
    }

    return {
      ...base,
      id: offerId,
      fallbackBaseId: base.id
    };
  }

  function applyFallbackUpgrade(option) {
    const baseId = option.fallbackBaseId || option.id;
    const fallback = getFallbackDef(baseId);
    if (!fallback) {
      return null;
    }

    if (baseId === "fallback_heal") {
      const before = player.hearts;
      player.hearts = clamp(player.hearts + 1, 0, player.maxHearts);
      const healed = player.hearts - before;
      return {
        fallback,
        effectText: healed > 0 ? `heal +${healed}` : "HP already full"
      };
    }

    if (baseId === "fallback_gold") {
      const before = game.floorFallbackInvulnBonus;
      game.floorFallbackInvulnBonus = clamp(
        game.floorFallbackInvulnBonus + FALLBACK_IFRAME_BONUS,
        0,
        MAX_FALLBACK_IFRAME_BONUS
      );
      invalidateDerivedStats();
      const gained = game.floorFallbackInvulnBonus - before;
      return {
        fallback,
        effectText: gained > 0 ? `+${gained.toFixed(2)}s iFrames (floor)` : "iFrames already capped"
      };
    }

    return null;
  }

  function applyUpgrade(id) {
    const def = getUpgradeDef(id);
    if (!def || !canTakeUpgrade(id)) {
      return null;
    }

    const newStack = getStack(id) + 1;
    upgradeState.stacks[id] = newStack;
    upgradeState.serial += 1;
    upgradeState.lastTakenSerial[id] = upgradeState.serial;
    upgradeState.history.push({
      id,
      floor: (AIPU.systems && AIPU.systems.currentFloor() && AIPU.systems.currentFloor().id) || game.currentFloorIndex + 1,
      stack: newStack,
      serial: upgradeState.serial
    });

    invalidateDerivedStats();

    if (typeof def.apply === "function") {
      def.apply({ game, player, newStack });
    }

    return { def, newStack };
  }

  function applyUpgradeChoice(option) {
    if (!option) {
      return null;
    }

    if (option.fallbackBaseId) {
      const fallbackResult = applyFallbackUpgrade(option);
      if (!fallbackResult) {
        return null;
      }
      return {
        type: "fallback",
        option,
        effectText: fallbackResult.effectText
      };
    }

    const upgradeResult = applyUpgrade(option.id);
    if (!upgradeResult) {
      return null;
    }

    return {
      type: "upgrade",
      option,
      newStack: upgradeResult.newStack,
      maxStacks: upgradeResult.def.maxStacks
    };
  }

  function rollUpgradeOptions(_floorIndex, count = 3) {
    const eligible = UPGRADE_DEFS.filter((upgrade) => canTakeUpgrade(upgrade.id));
    const picks = [];
    const usedIds = new Set();
    const offense = eligible.filter((upgrade) => upgrade.tags.includes("offense"));
    const defenseOrUtility = eligible.filter(
      (upgrade) => upgrade.tags.includes("defense") || upgrade.tags.includes("utility")
    );

    if (offense.length > 0) {
      const rolledOffense = randomFrom(offense.filter((upgrade) => !usedIds.has(upgrade.id)));
      if (rolledOffense) {
        picks.push(rolledOffense);
        usedIds.add(rolledOffense.id);
      }
    }

    if (defenseOrUtility.length > 0) {
      const supportPool = defenseOrUtility.filter((upgrade) => !usedIds.has(upgrade.id));
      if (supportPool.length > 0) {
        const rolledSupport = randomFrom(supportPool);
        if (rolledSupport) {
          picks.push(rolledSupport);
          usedIds.add(rolledSupport.id);
        }
      }
    }

    let remaining = shuffleArray(eligible.filter((upgrade) => !usedIds.has(upgrade.id)));

    while (picks.length < count && remaining.length > 0) {
      const rolled = remaining.shift();
      if (!rolled || usedIds.has(rolled.id)) {
        continue;
      }
      picks.push(rolled);
      usedIds.add(rolled.id);
    }

    let fallbackSlot = 0;
    while (picks.length < count) {
      const fallbackOffer = buildFallbackOffer(fallbackSlot, usedIds);
      if (!fallbackOffer) {
        break;
      }
      picks.push(fallbackOffer);
      usedIds.add(fallbackOffer.id);
      fallbackSlot += 1;
    }

    return picks.slice(0, count);
  }

  function computeDerivedStats() {
    if (!derivedCache.dirty && derivedCache.value) {
      return derivedCache.value;
    }

    const derived = {
      moveSpeedMult: 1,
      fireCooldownMult: 1,
      bulletRadiusMult: 1,
      bulletSpeedMult: 1,
      bulletPierceBonus: 0,
      maxHpBonus: 0,
      floorShieldCharges: 0,
      invulnBonus: 0,
      pickupMagnetBonus: 0,
      enemyBulletSpeedMult: 1
    };

    for (const upgrade of UPGRADE_DEFS) {
      const stack = getStack(upgrade.id);
      if (stack <= 0 || typeof upgrade.modifier !== "function") {
        continue;
      }
      upgrade.modifier(derived, stack, game.currentFloorIndex);
    }

    derived.floorShieldCharges = clamp(derived.floorShieldCharges, 0, MAX_FLOOR_SHIELD_CHARGES);
    derived.invulnBonus = clamp(derived.invulnBonus, 0, MAX_INVULN_TIME - BASE_INVULN_TIME);

    derivedCache.value = derived;
    derivedCache.dirty = false;
    return derived;
  }

  function getPlayerSpeed() {
    const stats = computeDerivedStats();
    return BASE_PLAYER_SPEED * stats.moveSpeedMult;
  }

  function getFireCooldown() {
    const stats = computeDerivedStats();
    return BASE_FIRE_COOLDOWN * stats.fireCooldownMult;
  }

  function getBulletRadius() {
    const stats = computeDerivedStats();
    return BASE_BULLET_RADIUS * stats.bulletRadiusMult;
  }

  function getBulletSpeed() {
    const stats = computeDerivedStats();
    return BASE_BULLET_SPEED * stats.bulletSpeedMult;
  }

  function getBulletPierce() {
    const stats = computeDerivedStats();
    return BASE_BULLET_PIERCE + stats.bulletPierceBonus;
  }

  function getPlayerMaxHP() {
    const stats = computeDerivedStats();
    return BASE_MAX_HP + stats.maxHpBonus;
  }

  function getShieldChargesPerFloor() {
    const stats = computeDerivedStats();
    return clamp(Math.round(stats.floorShieldCharges), 0, MAX_FLOOR_SHIELD_CHARGES);
  }

  function getInvulnDuration() {
    const stats = computeDerivedStats();
    return clamp(BASE_INVULN_TIME + stats.invulnBonus + game.floorFallbackInvulnBonus, 0.25, MAX_INVULN_TIME);
  }

  function getPickupMagnetRadius() {
    const stats = computeDerivedStats();
    return stats.pickupMagnetBonus;
  }

  function getEnemyBulletSpeedMultiplier() {
    const stats = computeDerivedStats();
    return stats.enemyBulletSpeedMult;
  }

  function syncPlayerMaxHP(healToFull = false) {
    invalidateDerivedStats();
    player.maxHearts = getPlayerMaxHP();
    if (healToFull) {
      player.hearts = player.maxHearts;
      return;
    }
    player.hearts = clamp(player.hearts, 0, player.maxHearts);
  }

  function getCollectedUpgradeEntries() {
    return UPGRADE_DEFS.map((def) => ({
      def,
      stack: getStack(def.id),
      lastSerial: upgradeState.lastTakenSerial[def.id] || 0
    }))
      .filter((entry) => entry.stack > 0)
      .sort((a, b) => {
        if (b.stack !== a.stack) return b.stack - a.stack;
        if (b.lastSerial !== a.lastSerial) return b.lastSerial - a.lastSerial;
        return a.def.name.localeCompare(b.def.name);
      });
  }

  function getUpgradeHudRows(maxRows = 5) {
    const entries = getCollectedUpgradeEntries();
    if (entries.length === 0) {
      return ["None yet"];
    }

    const rows = entries.slice(0, maxRows).map((entry) => `${entry.def.name} x${entry.stack}`);
    if (entries.length > maxRows) {
      rows.push(`+${entries.length - maxRows} more`);
    }
    return rows;
  }

  function getRunBuildEntries() {
    const seen = new Set();
    const ordered = [];

    for (const record of upgradeState.history) {
      if (seen.has(record.id)) {
        continue;
      }
      seen.add(record.id);
      const def = getUpgradeDef(record.id);
      if (!def) {
        continue;
      }
      ordered.push({ def, stack: getStack(record.id), firstFloor: record.floor });
    }

    return ordered;
  }

  function getFloorsClearedCount() {
    if (game.state === AIPU.constants.GameState.VICTORY) {
      return AIPU.content.FLOORS.length;
    }
    return clamp(game.currentFloorIndex, 0, AIPU.content.FLOORS.length);
  }

  applyNarrativeUpgradeRename();

  AIPU.upgrades = {
    UPGRADE_DEFS,
    FALLBACK_UPGRADE_DEFS,
    upgradeState,
    applyNarrativeUpgradeRename,
    invalidateDerivedStats,
    resetUpgradeRun,
    getUpgradeDef,
    getStack,
    canTakeUpgrade,
    getFallbackDef,
    buildFallbackOffer,
    applyFallbackUpgrade,
    applyUpgrade,
    applyUpgradeChoice,
    rollUpgradeOptions,
    computeDerivedStats,
    getPlayerSpeed,
    getFireCooldown,
    getBulletRadius,
    getBulletSpeed,
    getBulletPierce,
    getPlayerMaxHP,
    getShieldChargesPerFloor,
    getInvulnDuration,
    getPickupMagnetRadius,
    getEnemyBulletSpeedMultiplier,
    syncPlayerMaxHP,
    getCollectedUpgradeEntries,
    getUpgradeHudRows,
    getRunBuildEntries,
    getFloorsClearedCount
  };
})();
