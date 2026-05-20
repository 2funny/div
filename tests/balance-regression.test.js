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

  const earlyQuality = qualitySamples(6, 300);
  const deepQuality = qualitySamples(45, 300);
  assert(earlyQuality["传说"] <= 14, "early-mid equipment samples should keep legendary drops rare");
  assert(deepQuality["传说"] <= 20, "deep equipment samples should keep legendary drops bounded");
  assert(deepQuality["史诗"] + deepQuality["传说"] < 80, "deep equipment samples should not flood high-tier gear");

  for (const floor of [10, 30, 60]) {
    for (const classId of ["warrior", "mage", "ranger"]) {
      const result = runCombatSample(classId, floor);
      assert(result.heroHpRatio > 0, classId + " should survive a representative floor " + floor + " normal encounter sample");
      assert(result.enemyHpRatio < 0.95, classId + " should make progress against a representative floor " + floor + " normal encounter sample");
    }
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
