const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { createTestContext } = require("./helpers/test-context");

const context = createTestContext(assert);

vm.createContext(context);
vm.runInContext(fs.readFileSync("tests/.generated/runtime-harness.js", "utf8"), context, {
  filename: "tests/.generated/runtime-harness.js"
});
vm.runInContext(
  `
  function buildHero(classId, floor) {
    const cls = CLASSES[classId];
    const state = {
      classId,
      floor,
      level: 1,
      xp: 0,
      xpNext: 20,
      hp: cls.hp,
      maxHp: cls.hp,
      mp: cls.mp,
      maxMp: cls.mp,
      stats: { ...cls.stats },
      equipment: starterEquipment(classId),
      inventory: [
        potion("生命药水", "hp", 32 + floor),
        potion("法力药水", "mp", 18 + Math.ceil(floor * 0.5))
      ],
      materials: {},
      runes: {},
      quests: [],
      lore: { chapters: [], pages: [] },
      narrative: {
        relations: {},
        flags: {},
        eventChoices: {},
        rescuedNpcIds: [],
        merchantTrust: 0,
        factionLeanings: {}
      },
      floorStates: {},
      skillLevels: {},
      skillBranches: {},
      skillCooldowns: {},
      statPoints: 0,
      skillPoints: 0,
      skillDust: 0,
      log: []
    };
    for (let level = 2; level <= Math.max(1, Math.floor(floor / 3) + 1); level++) {
      state.level = level;
      setState(state);
      applyClassLevelGrowth();
    }
    state.hp = effectiveMaxHp();
    state.mp = effectiveMaxMp();
    return state;
  }

  function enemyForFloor(floor) {
    return {
      type: "monster",
      name: "Balance Dummy " + floor,
      hp: Math.round(12 + floor * 3),
      maxHp: Math.round(12 + floor * 3),
      atk: Math.round(2 + floor * 0.52),
      def: Math.round(floor * 0.08),
      spd: Math.round(2 + floor * 0.35)
    };
  }

  function runCombatSample(classId, floor) {
    const sample = buildHero(classId, floor);
    sample.currentEnemy = enemyForFloor(floor);
    setState(sample);
    const realDateNow = Date.now;
    const realRandom = Math.random;
    try {
      Math.random = () => 0.99;
      for (let turn = 0; turn < 4 && state.currentEnemy && state.hp > 0; turn++) {
        const skill = CLASSES[classId].skills.find((entry) => entry.type !== "guard" && entry.type !== "evade");
        Date.now = () => realDateNow() + 1000 + turn;
        if (skill && state.mp >= skill.mp && (state.skillCooldowns?.[skill.id] || 0) <= 0) {
          attackEnemy("skill", skill.id, true);
        } else {
          attackEnemy("attack", null, true);
        }
      }
    } finally {
      Date.now = realDateNow;
      Math.random = realRandom;
    }
    return {
      enemyHpRatio: state.currentEnemy ? state.currentEnemy.hp / state.currentEnemy.maxHp : 0,
      heroHpRatio: state.hp / effectiveMaxHp(),
      policy: autoBattlePolicy(state.currentEnemy || enemyForFloor(floor))
    };
  }

  function runOpeningSkillSample(classId, floor) {
    const sample = buildHero(classId, floor);
    sample.currentEnemy = enemyForFloor(floor);
    setState(sample);
    const skill = CLASSES[classId].skills.find((entry) => entry.type !== "guard" && entry.type !== "evade");
    const realDateNow = Date.now;
    const realRandom = Math.random;
    try {
      Math.random = () => 0.99;
      Date.now = () => realDateNow() + 1000;
      attackEnemy("skill", skill.id, false);
    } finally {
      Date.now = realDateNow;
      Math.random = realRandom;
    }
    return state.currentEnemy ? state.currentEnemy.hp / state.currentEnemy.maxHp : 0;
  }

  function encounterEnemyForFloor(floor, type) {
    const base = enemyForFloor(floor);
    if (type === "elite") {
      return {
        ...base,
        type: "elite",
        name: "Elite Balance Dummy " + floor,
        hp: Math.round(base.hp * 1.85),
        maxHp: Math.round(base.maxHp * 1.85),
        atk: Math.round(base.atk * 1.34 + 2),
        def: Math.round(base.def * 1.55 + 1),
        skills: [{ id: "elite-pressure", name: "Elite Pressure", type: "damage", power: 1.08, chance: 0.34 }]
      };
    }
    if (type === "boss") {
      return {
        ...base,
        type: "boss",
        name: "Boss Balance Dummy " + floor,
        hp: Math.round(base.hp * 4.4),
        maxHp: Math.round(base.maxHp * 4.4),
        atk: Math.round(base.atk * 1.75 + 5),
        def: Math.round(base.def * 2.2 + 2),
        skills: [
          { id: "boss-strike", name: "Boss Strike", type: "damage", power: 1.18, chance: 0.38 },
          { id: "boss-drain", name: "Boss Drain", type: "drain", power: 0.94, chance: 0.22 }
        ]
      };
    }
    return base;
  }

  function firstUsableDamageSkill(classId) {
    return CLASSES[classId].skills.find((entry) => entry.type !== "guard" && entry.type !== "evade");
  }

  function runEncounterProfile(classId, floor, enemyType, maxTurns) {
    const sample = buildHero(classId, floor);
    sample.currentEnemy = encounterEnemyForFloor(floor, enemyType);
    setState(sample);
    const startingEnemyHp = state.currentEnemy.maxHp;
    const realDateNow = Date.now;
    const realRandom = Math.random;
    const rolls = [0.99, 0.45, 0.72, 0.18, 0.63, 0.31, 0.84, 0.52, 0.27, 0.91, 0.36, 0.68];
    let rollIndex = 0;
    let turns = 0;
    try {
      Math.random = () => rolls[rollIndex++ % rolls.length];
      for (; turns < maxTurns && state.currentEnemy && state.hp > 0; turns++) {
        const skill = firstUsableDamageSkill(classId);
        Date.now = () => realDateNow() + 1000 + turns;
        if (skill && state.mp >= skill.mp && (state.skillCooldowns?.[skill.id] || 0) <= 0) {
          attackEnemy("skill", skill.id, true);
        } else {
          attackEnemy("attack", null, true);
        }
      }
    } finally {
      Date.now = realDateNow;
      Math.random = realRandom;
    }
    const enemyHp = state.currentEnemy ? state.currentEnemy.hp : 0;
    return {
      classId,
      floor,
      enemyType,
      turns,
      defeated: !state.currentEnemy,
      enemyHpRatio: enemyHp / startingEnemyHp,
      progress: 1 - enemyHp / startingEnemyHp,
      heroHpRatio: state.hp / effectiveMaxHp(),
      heroMpRatio: state.mp / effectiveMaxMp()
    };
  }

  function runOpeningBurstProfile(classId, floor, enemyType, casts) {
    const sample = buildHero(classId, floor);
    const enemy = encounterEnemyForFloor(floor, enemyType);
    setState(sample);
    const skill = firstUsableDamageSkill(classId);
    const t = localTotals(sample);
    let enemyHp = enemy.hp;
    for (let i = 0; i < casts && enemyHp > 0; i++) {
      enemyHp = Math.max(0, enemyHp - Math.round(localSkillDamage(skill, t, enemy, floor, sample.maxHp)));
    }
    return enemyHp / enemy.maxHp;
  }

  function localTotals(sample) {
    const total = { ...(sample.stats || {}) };
    for (const eq of Object.values(sample.equipment || {})) {
      if (!eq?.stats) continue;
      for (const [key, value] of Object.entries(eq.stats)) {
        total[key] = (total[key] || 0) + Number(value || 0);
      }
    }
    return total;
  }

  function localSkillDamage(skill, t, enemy, floor, maxHp) {
    const hasMultiScale =
      skill.atkMultiplier != null ||
      skill.magMultiplier != null ||
      skill.hpMultiplier != null ||
      skill.defMultiplier != null ||
      skill.baseDamage != null;
    const raw = hasMultiScale
      ? Number(skill.baseDamage || 0) +
        (t.atk || 0) * Number(skill.atkMultiplier || 0) +
        (t.mag || 0) * Number(skill.magMultiplier || 0) +
        (maxHp || 0) * Number(skill.hpMultiplier || 0) +
        (t.def || 0) * Number(skill.defMultiplier || 0)
      : (skill.scale === "mag" ? t.mag : t.atk) * skill.power;
    const physicalWeight = skill.magMultiplier && !skill.atkMultiplier ? 0.18 : 0.3;
    return Math.max(2, raw + floor * 0.35 - (enemy.def || 0) * physicalWeight);
  }

  function equipmentScoreSamples(floor, count) {
    state = { classId: "warrior", floor, inventory: [], stats: { luk: 0 }, log: [] };
    const realRandom = Math.random;
    const scores = [];
    try {
      setRandomSeed("score-" + floor);
      for (let i = 0; i < count; i++) {
        scores.push(localEquipmentScore(randomEquipment()));
      }
    } finally {
      resetRandomSource();
      Math.random = realRandom;
    }
    scores.sort((a, b) => a - b);
    const average = scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length);
    return {
      min: scores[0],
      max: scores[scores.length - 1],
      average,
      p90: scores[Math.floor(scores.length * 0.9)]
    };
  }

  function localEquipmentScore(entry) {
    const stats = Object.entries(entry.stats || {});
    return stats.reduce((sum, pair) => {
      const key = pair[0];
      const value = Number(pair[1] || 0);
      const weight = key === "hp" || key === "mp" ? 0.28 : 1;
      return sum + value * weight;
    }, 0);
  }

  function qualitySamples(floor, count) {
    state = { classId: "warrior", floor, inventory: [], stats: { luk: 0 }, log: [] };
    const realRandom = Math.random;
    const counts = { "普通": 0, "优秀": 0, "稀有": 0, "史诗": 0, "传说": 0 };
    try {
      setRandomSeed("quality-" + floor);
      for (let i = 0; i < count; i++) {
        counts[randomEquipment().quality]++;
      }
    } finally {
      resetRandomSource();
      Math.random = realRandom;
    }
    return counts;
  }

  function lootEconomySamples(floor, enemyType, count) {
    state = {
      classId: "warrior",
      floor,
      level: Math.max(1, Math.floor(floor / 3) + 1),
      hp: 120,
      maxHp: 120,
      mp: 30,
      maxMp: 30,
      stats: { atk: 20, mag: 4, def: 12, res: 6, spd: 8, luk: 2 },
      equipment: starterEquipment("warrior"),
      inventory: [],
      materials: {},
      runes: {},
      gold: 0,
      keys: 0,
      quests: [],
      lore: { chapters: [], pages: [] },
      narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
      floorStates: {},
      skillLevels: {},
      skillBranches: {},
      skillCooldowns: {},
      statPoints: 0,
      skillPoints: 0,
      skillDust: 0,
      log: []
    };
    const realRandom = Math.random;
    try {
      setRandomSeed("loot-" + floor + "-" + enemyType);
      for (let i = 0; i < count; i++) {
        maybeDrop(encounterEnemyForFloor(floor, enemyType));
      }
    } finally {
      resetRandomSource();
      Math.random = realRandom;
    }
    return {
      gold: state.gold || 0,
      equipment: state.inventory.filter((entry) => entry.kind === "equip").length,
      runeTotal: Object.values(state.runes || {}).reduce((sum, count) => sum + Number(count || 0), 0),
      materialTotal: Object.values(state.materials || {}).reduce((sum, count) => sum + Number(count || 0), 0),
      skillDust: state.skillDust || 0
    };
  }

  const earlyQuality = qualitySamples(6, 300);
  const deepQuality = qualitySamples(45, 300);
  assert(earlyQuality["传说"] <= 14, "early-mid equipment samples should keep legendary drops rare");
  assert(deepQuality["传说"] <= 20, "deep equipment samples should keep legendary drops bounded");
  assert(deepQuality["史诗"] + deepQuality["传说"] < 80, "deep equipment samples should not flood high-tier gear");

  const earlyScores = equipmentScoreSamples(6, 240);
  const midScores = equipmentScoreSamples(30, 240);
  const deepScores = equipmentScoreSamples(60, 240);
  assert(midScores.average > earlyScores.average, "mid-run equipment scores should improve over early drops");
  assert(deepScores.average > midScores.average, "deep equipment scores should improve over mid-run drops");
  assert(deepScores.p90 < earlyScores.p90 * 8, "deep equipment score growth should stay bounded instead of exploding");

  const earlyLoot = lootEconomySamples(8, "monster", 120);
  const midLoot = lootEconomySamples(30, "monster", 120);
  const deepLoot = lootEconomySamples(60, "monster", 120);
  assert(midLoot.gold > earlyLoot.gold, "mid-run bonus gold drops should grow over early floors");
  assert(deepLoot.gold > midLoot.gold, "deep bonus gold drops should grow over mid floors");
  assert(deepLoot.equipment >= earlyLoot.equipment * 0.65, "deep normal enemies should not collapse equipment access");
  assert(deepLoot.runeTotal + deepLoot.materialTotal + deepLoot.skillDust > 0, "deep loot should keep feeding rune/material/skill resources");

  const midEliteLoot = lootEconomySamples(30, "elite", 90);
  const midNormalLoot = lootEconomySamples(30, "monster", 90);
  assert(midEliteLoot.equipment >= midNormalLoot.equipment, "elite enemies should be at least as equipment-rich as normal enemies");
  assert(
    midEliteLoot.skillDust + midEliteLoot.materialTotal >= midNormalLoot.skillDust + midNormalLoot.materialTotal,
    "elite enemies should better support upgrade resources than normal enemies"
  );

  for (const floor of [10, 30, 60]) {
    for (const classId of ["warrior", "mage", "ranger"]) {
      const result = runCombatSample(classId, floor);
      assert(result.heroHpRatio > 0, classId + " should survive a representative floor " + floor + " normal encounter sample");
      assert(result.enemyHpRatio < 0.95, classId + " should make progress against a representative floor " + floor + " normal encounter sample");
    }
  }

  for (const floor of [10, 30, 60]) {
    const profiles = ["warrior", "mage", "ranger"].map((classId) =>
      runEncounterProfile(classId, floor, "monster", 6)
    );
    for (const profile of profiles) {
      assert(profile.heroHpRatio > 0, profile.classId + " should survive a " + floor + "F normal pacing sample");
      assert(profile.progress >= 0.45, profile.classId + " should remove meaningful HP from a " + floor + "F normal enemy within six turns");
    }
    const averageProgress = profiles.reduce((sum, entry) => sum + entry.progress, 0) / profiles.length;
    assert(averageProgress >= 0.62, "normal battle pacing should stay brisk on floor " + floor);
  }

  for (const floor of [30, 60]) {
    for (const classId of ["warrior", "mage", "ranger"]) {
      const profile = runEncounterProfile(classId, floor, "elite", 8);
      assert(profile.heroHpRatio > 0, classId + " should survive a representative " + floor + "F elite pressure sample");
      assert(profile.progress >= 0.28, classId + " should make visible progress against a representative " + floor + "F elite");
    }
  }

  for (const classId of ["warrior", "mage", "ranger"]) {
    const bossHpRatio = runOpeningBurstProfile(classId, 60, "boss", 2);
    assert(bossHpRatio > 0.15, classId + " should not erase a late boss profile with two opening skills");
  }

  const rangerMid = runCombatSample("ranger", 30);
  assert(rangerMid.enemyHpRatio < 0.7, "ranger should have a stable mid-run damage channel after follow-up tuning");

  const mageOpening = runOpeningSkillSample("mage", 60);
  assert(mageOpening > 0.05, "mage deep-floor opening skill should not erase representative enemies immediately");

  const deepWarrior = buildHero("warrior", 60);
  const deepMage = buildHero("mage", 60);
  const deepRanger = buildHero("ranger", 60);
  assert(
    deepWarrior.maxHp > deepRanger.maxHp && deepRanger.maxHp > deepMage.maxHp,
    "deep class health curves should keep warrior, ranger, and mage survival identities separated"
  );
  assert(
    deepMage.maxMp > deepRanger.maxMp && deepRanger.maxMp > deepWarrior.maxMp,
    "deep class mana curves should keep mage, ranger, and warrior resource identities separated"
  );
  assert(
    deepWarrior.stats.atk > deepRanger.stats.atk && deepMage.stats.mag > deepWarrior.stats.mag && deepRanger.stats.spd > deepMage.stats.spd,
    "deep class primary stat curves should remain distinct across long-run floors"
  );
`,
  context
);
