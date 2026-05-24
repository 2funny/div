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
  const empty = emptyEquipment();
  assert(SLOTS.every((slot) => empty[slot] === null), "new heroes should start with empty equipment slots");
  assert.strictEqual(starterInventory("warrior").filter((entry) => entry.kind === "equip").length, 0, "starter gear should not be placed in inventory");
  assert(Object.values(starterEquipment("warrior")).filter(Boolean).length > 0, "starter gear should be provided as equipped items");
  startGame("warrior", "slot-1");
  assert.strictEqual(state.statPoints, 3, "new heroes should start with a small pool of allocatable stat points");
  assert.strictEqual(state.skillPoints, 1, "new heroes should be able to upgrade one starter skill early");
  assert.strictEqual(state.skillDust, 1, "new heroes should have enough skill dust for the first upgrade");
  upgradeSkill("heavy");
  assert.strictEqual(state.skillLevels.heavy, 1, "starter resources should pay for the first skill upgrade");
  assert.strictEqual(state.skillDust, 0, "the first skill upgrade should spend one skill dust");
  state.skillPoints = 1;
  state.skillDust = 2;
  state.skillLevels.heavy = 2;
  upgradeSkill("heavy", "cleave");
  assert.strictEqual(state.skillLevels.heavy, 3, "branch-level upgrades should be affordable with the softened early dust curve");
  startGame("warrior", "slot-1", "vanguard");
  assert.strictEqual(state.statPoints, 0, "opening build presets should spend the starter stat points");
  assert.strictEqual(state.stats.def, CLASSES.warrior.stats.def + 2, "vanguard opening should apply its defense bonus");
  assert.strictEqual(state.stats.atk, CLASSES.warrior.stats.atk + 1, "vanguard opening should apply its attack bonus");
  assert.strictEqual(state.initialBuildId, "vanguard", "opening build preset choice should be recorded");
  const setWeapon = item("誓印铁剑", "weapon", "优秀", { atk: 2 });
  const setArmor = item("誓印旧甲", "armor", "优秀", { def: 2 });
  setWeapon.setId = "warden";
  setWeapon.setName = "巡夜誓印";
  setArmor.setId = "warden";
  setArmor.setName = "巡夜誓印";
  state.equipment = { ...emptyEquipment(), weapon: setWeapon, armor: setArmor };
  assert(effectiveMaxHp() >= state.maxHp + 10, "equipping two matching set pieces should add the set vitality bonus");
  assert.strictEqual(setWeapon.setName, "巡夜誓印", "set drops should retain their set identity for equipment UI");
  setRandomSeed("stable-seed");
  const seededRolls = [rand(1, 100), rand(1, 100), rand(1, 100)];
  setRandomSeed("stable-seed");
  assert.deepStrictEqual([rand(1, 100), rand(1, 100), rand(1, 100)], seededRolls, "seeded RNG should make core random helpers reproducible");
  resetRandomSource();

  const seenMonster = { x: 1, y: 1, terrain: "floor", seen: true, visible: false, object: { type: "monster" } };
  assert.strictEqual(shouldShowMapObject(seenMonster), true, "seen monsters should remain visible while they are still on the main viewport");

  const hiddenTrap = { x: 1, y: 2, terrain: "floor", seen: true, visible: true, object: { type: "trap" } };
  assert.strictEqual(shouldShowMapObject(hiddenTrap), false, "untriggered traps should stay hidden");

  state = {
    floor: 2,
    hp: 100,
    currentEnemy: null,
    gold: 0,
    stats: { luk: 0 },
    map: {
      size: 23,
      cells: Array.from({ length: 23 }, (_, y) => Array.from({ length: 23 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  const trapCell = state.map.cells[2][2];
  trapCell.object = { type: "trap" };
  showEvent = () => {};
  render = () => {};
  triggerTrap(trapCell);
  assert.strictEqual(trapCell.object, null, "triggered trap should be consumed");
  assert(state.hp < 100, "trap should still damage the player");
  assert(state.map.cells.flat().some((cell) => ["monster", "elite"].includes(cell.object?.type)), "trap should summon or alert a nearby guard");
  assert(["monster", "elite"].includes(state.currentEnemy?.type), "trap-summoned guards should force an immediate battle");
  assert(state._battleCell, "trap-summoned battle should remember the guard's map cell");
  const trapGuardCell = state.map.cells[state._battleCell.y][state._battleCell.x];
  assert(["monster", "elite"].includes(trapGuardCell.object?.type), "tracked trap guard cell should still contain the guard before victory");
  state.currentEnemy.hp = 1;
  state.stats.atk = 50;
  const realDateNowForTrapBattle = Date.now;
  Date.now = () => realDateNowForTrapBattle() + 1000;
  attackEnemy("attack", null, true);
  Date.now = realDateNowForTrapBattle;
  assert.strictEqual(trapGuardCell.object, null, "defeated trap-summoned guards should be cleared from their original cell");
  assert.strictEqual(state.currentEnemy, null, "trap-summoned battle should end after the guard is defeated");

  let lastEvent = null;
  showEvent = (title, body) => { lastEvent = { title, body }; };
  state.keys = 0;
  state.inventory = [];
  state.materials = {};
  state.runes = {};
  const lockedCell = state.map.cells[1][1];
  lockedCell.object = { type: "lockedChest" };
  openLockedChest(lockedCell);
  assert.strictEqual(lockedCell.object?.type, "lockedChest", "locked chest should remain closed without a key");
  assert.strictEqual(state.keys, 0, "failed locked chest attempt should not change key count");

  state.keys = 1;
  openLockedChest(lockedCell);
  assert.strictEqual(lockedCell.object, null, "locked chest should open when a key is available");
  assert.strictEqual(state.keys, 0, "opening a locked chest should consume one key");
  assert(state.inventory.length > 0, "locked chest should grant equipment");

  const originalRandom = Math.random;
  try {
    state = { classId: "warrior", floor: 1, keys: 1, inventory: [], runes: {}, gold: 0, stats: { luk: 0 }, log: [] };
    Math.random = () => 0.01;
    openLockedChest({ object: { type: "lockedChest" } });
    const starterLoot = state.inventory[0];
    assert.strictEqual(starterLoot.name, "木剑", "common equipment names should use material plus concrete item type");
    assert(!starterLoot.name.includes(starterLoot.quality), "equipment names should not repeat the quality label");
    assert(!starterLoot.name.includes(SLOT_NAMES[starterLoot.slot]), "equipment names should not repeat the UI slot label");

    state = { classId: "warrior", floor: 12, keys: 1, inventory: [], runes: {}, gold: 0, stats: { luk: 0 }, log: [] };
    Math.random = () => 0.99;
    openLockedChest({ object: { type: "lockedChest" } });
    const legendaryLoot = state.inventory[0];
    assert.strictEqual(legendaryLoot.quality, "传说", "high rolls should still produce legendary gear");
    assert.strictEqual(legendaryLoot.name, "星陨先知符", "legendary equipment should use special named loot");
    assert(!legendaryLoot.name.includes(legendaryLoot.quality), "legendary names should not repeat the quality label");
  } finally {
    Math.random = originalRandom;
  }

  const lockedDoorCell = { terrain: "door", object: { type: "lockedDoor", keyId: "door-a", keyName: "1号房钥匙", roomName: "1号房" } };
  state.doorKeys = {};
  state.doorKeyNames = {};
  state.universalKeys = 0;
  openLockedDoor(lockedDoorCell);
  assert.strictEqual(lockedDoorCell.object?.type, "lockedDoor", "locked room door should stay shut without a matching key");
  state.doorKeys["door-a"] = 1;
  openLockedDoor(lockedDoorCell);
  assert.strictEqual(lockedDoorCell.object, null, "locked room door should open with its specific quest key");
  assert.strictEqual(state.doorKeys["door-a"], undefined, "specific room key should be consumed after opening the door");

  const universalDoorCell = { terrain: "door", object: { type: "lockedDoor", keyId: "door-b", keyName: "2号房钥匙", roomName: "2号房" } };
  state.universalKeys = 1;
  openLockedDoor(universalDoorCell);
  assert.strictEqual(universalDoorCell.object, null, "universal key should open a locked room door");
  assert.strictEqual(state.universalKeys, 0, "universal key should be consumed after opening a locked room door");

  maybeDrop({ type: "elite", roomBoss: true, dropsKey: true, name: "Key Guardian" });
  assert.strictEqual(state.keys, 1, "key guardian drops should add one key");
  assert.strictEqual(state.materials["首领印记"], 1, "room boss drops should add a boss trophy material");
  assert(
    (state.materials["强化石"] || 0) + (state.skillDust || 0) > 0,
    "room boss drops should include at least one upgrade resource"
  );
  state = {
    hp: 80,
    maxHp: 100,
    mp: 20,
    maxMp: 30,
    stats: { atk: 0, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [item("Vital Armor", "armor", "普通", { hp: 20, mp: 10 })],
    log: []
  };
  render = () => {};
  equipItem(state.inventory[0].id);
  assert.strictEqual(effectiveMaxHp(), 120, "equipping vitality gear should raise max hp");
  assert.strictEqual(state.hp, 100, "equipping vitality gear should preserve missing hp instead of leaving the bar lower");
  assert.strictEqual(effectiveMaxMp(), 40, "equipping mana gear should raise max mp");
  assert.strictEqual(state.mp, 30, "equipping mana gear should preserve missing mp");
  unequipItem("armor");
  assert.strictEqual(effectiveMaxHp(), 100, "unequipping vitality gear should lower max hp");
  assert.strictEqual(state.hp, 80, "unequipping vitality gear should preserve missing hp");
  assert.strictEqual(effectiveMaxMp(), 30, "unequipping mana gear should lower max mp");
  assert.strictEqual(state.mp, 20, "unequipping mana gear should preserve missing mp");

  state = {
    hp: 90,
    maxHp: 100,
    mp: 25,
    maxMp: 30,
    stats: { atk: 0, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: { ...emptyEquipment(), armor: item("Vital Armor", "armor", "普通", { hp: 20, mp: 10 }) },
    inventory: [potion("Large Potion", "hp", 50), potion("Large Mana", "mp", 50)],
    log: []
  };
  useItem(state.inventory[0].id);
  assert.strictEqual(state.hp, 120, "healing potions should respect equipment-adjusted max hp");
  useItem(state.inventory[0].id);
  assert.strictEqual(state.mp, 40, "mana potions should respect equipment-adjusted max mp");

  state = {
    floor: 2,
    hp: 50,
    maxHp: 100,
    mp: 20,
    maxMp: 30,
    stats: { atk: 12, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [potion("Battle Potion", "hp", 40)],
    currentEnemy: { type: "monster", name: "Slime", hp: 30, maxHp: 30, atk: 8, def: 2 },
    log: []
  };
  playSound = () => {};
  render = () => {};
  Math.random = () => 0.99;
  useBattlePotion(state.inventory[0].id, true);
  assert.strictEqual(state.inventory.length, 0, "battle potion use should consume the potion");
  assert(state.hp > 50, "battle potion should heal before the enemy response");
  assert(state.hp < 90, "battle potion should spend the player action and allow an enemy response");

  state = {
    classId: "warrior",
    floor: 2,
    hp: 90,
    maxHp: 100,
    mp: 12,
    maxMp: 20,
    stats: { atk: 14, mag: 0, def: 8, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    skillLevels: {},
    skillBranches: {},
    currentEnemy: { type: "monster", name: "Skill Dummy", hp: 40, maxHp: 40, atk: 1, def: 0 },
    log: []
  };
  const realDateNowForSkill = Date.now;
  Date.now = () => realDateNowForSkill() + 1000;
  attackEnemy("skill", "heavy", true);
  Date.now = realDateNowForSkill;
  assert(state.mp < 12, "battle skills should spend mp when invoked by skill id");
  assert(state.currentEnemy.hp < 40, "battle skills invoked by id should damage the enemy");

  const randomBeforeDeepSkill = Math.random;
  try {
    state = {
      classId: "warrior",
      floor: 60,
      hp: 120,
      maxHp: 120,
      mp: 20,
      maxMp: 20,
      stats: { atk: 14, mag: 0, def: 20, res: 0, spd: 0, luk: 0 },
      equipment: emptyEquipment(),
      inventory: [],
      skillLevels: {},
      skillBranches: {},
      skillCooldowns: {},
      currentEnemy: { type: "monster", name: "Deep Skill Dummy", hp: 100, maxHp: 100, atk: 1, def: 0 },
      log: []
    };
    Math.random = () => 0.99;
    Date.now = () => realDateNowForSkill() + 1000;
    attackEnemy("skill", "heavy", true);
    Date.now = realDateNowForSkill;
    assert(state.currentEnemy.hp > 50, "deep-floor skill damage should use a softened floor bonus instead of adding the full floor value");
  } finally {
    Math.random = randomBeforeDeepSkill;
    Date.now = realDateNowForSkill;
  }

  const randomBeforeCombatRules = Math.random;
  try {
    Math.random = () => 0.99;
    state = {
      classId: "warrior",
      floor: 1,
      hp: 100,
      maxHp: 100,
      mp: 20,
      maxMp: 20,
      stats: { atk: 20, mag: 0, def: 30, res: 0, spd: 100, luk: 0 },
      equipment: emptyEquipment(),
      inventory: [],
      currentEnemy: { type: "monster", name: "Attack Dummy", hp: 20, maxHp: 20, atk: 1, def: 0 },
      log: []
    };
    const realDateNowForAttackFormula = Date.now;
    Date.now = () => realDateNowForAttackFormula() + 1000;
    attackEnemy("attack", null, true);
    Date.now = realDateNowForAttackFormula;
    assert.strictEqual(state.currentEnemy, null, "normal attack damage should come from atk and enemy def, not speed scaling");

    const comboRolls = [0.99, 0.01, 0.99, 0.99];
    Math.random = () => comboRolls.shift() ?? 0.99;
    state = {
      classId: "ranger",
      floor: 1,
      hp: 100,
      maxHp: 100,
      mp: 20,
      maxMp: 20,
      stats: { atk: 10, mag: 0, def: 30, res: 0, spd: 40, luk: 0 },
      equipment: emptyEquipment(),
      inventory: [],
      currentEnemy: { type: "monster", name: "Combo Dummy", hp: 50, maxHp: 50, atk: 1, def: 0 },
      log: []
    };
    Date.now = () => realDateNowForAttackFormula() + 1000;
    attackEnemy("attack", null, true);
    Date.now = realDateNowForAttackFormula;
    assert.strictEqual(state.currentEnemy.hp, 30, "ranger normal attacks should be able to trigger one extra normal attack");
  } finally {
    Math.random = randomBeforeCombatRules;
  }

  const randomBeforeClampRules = Math.random;
  const realDateNowForClampRules = Date.now;
  try {
    state = {
      classId: "ranger",
      floor: 1,
      hp: 100,
      maxHp: 100,
      mp: 20,
      maxMp: 20,
      stats: { atk: 10, mag: 0, def: 0, res: 0, spd: 1000, luk: 200 },
      equipment: emptyEquipment(),
      inventory: [],
      currentEnemy: { type: "monster", name: "Cap Dummy", hp: 500, maxHp: 500, atk: 1, def: 0 },
      log: []
    };
    Math.random = () => 0.96;
    Date.now = () => realDateNowForClampRules() + 1000;
    attackEnemy("attack", null, true);
    Date.now = realDateNowForClampRules;
    Math.random = randomBeforeClampRules;
    assert.strictEqual(state.currentEnemy.hp, 490, "crit and combo chances should be capped below a guaranteed trigger");

    state = {
      classId: "ranger",
      floor: 1,
      hp: 100,
      maxHp: 100,
      mp: 20,
      maxMp: 20,
      stats: { atk: 1, mag: 0, def: 0, res: 0, spd: 1000, luk: 0 },
      equipment: emptyEquipment(),
      inventory: [],
      currentEnemy: { type: "monster", name: "Dodge Cap Dummy", hp: 20, maxHp: 20, atk: 10, def: 0 },
      log: []
    };
    Math.random = () => 0.96;
    enemyTurn(state.currentEnemy);
    Math.random = randomBeforeClampRules;
    assert(state.hp < 100, "extreme speed dodge chance should still cap below guaranteed evasion");

    state = {
      classId: "warrior",
      floor: 1,
      hp: 46,
      maxHp: 46,
      mp: 12,
      maxMp: 12,
      stats: { atk: 4, mag: 1, def: 5, res: 2, spd: 2, luk: 1 },
      equipment: emptyEquipment(),
      inventory: [],
      currentEnemy: { type: "monster", name: "Opening Slime", hp: 15, maxHp: 15, atk: 3, def: 0 },
      log: []
    };
    Math.random = () => 0.99;
    enemyTurn(state.currentEnemy);
    Math.random = randomBeforeClampRules;
    assert(state.hp <= 40, "opening monsters should pressure a warrior by a meaningful hp percentage");
  } finally {
    Math.random = randomBeforeClampRules;
    Date.now = realDateNowForClampRules;
  }

  const randomBeforeEvadeCap = Math.random;
  try {
    state = {
      classId: "ranger",
      floor: 1,
      hp: 100,
      maxHp: 100,
      mp: 20,
      maxMp: 20,
      stats: { atk: 1, mag: 0, def: 0, res: 0, spd: 1000, luk: 0 },
      equipment: emptyEquipment(),
      inventory: [],
      skillLevels: {},
      skillBranches: {},
      skillCooldowns: {},
      currentEnemy: { type: "monster", name: "Evade Cap Dummy", hp: 20, maxHp: 20, atk: 10, def: 0 },
      log: []
    };
    Math.random = () => 0.9;
    Date.now = () => realDateNowForClampRules() + 1000;
    attackEnemy("skill", "step", true);
    Date.now = realDateNowForClampRules;
    assert(state.hp < 100, "evade stance should still cap below guaranteed evasion");
  } finally {
    Math.random = randomBeforeEvadeCap;
    Date.now = realDateNowForClampRules;
  }

  state = {
    classId: "warrior",
    floor: 2,
    hp: 90,
    maxHp: 100,
    mp: 12,
    maxMp: 20,
    stats: { atk: 14, mag: 0, def: 80, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    skillLevels: {},
    skillBranches: {},
    skillCooldowns: {},
    currentEnemy: { type: "monster", name: "Cooldown Dummy", hp: 200, maxHp: 200, atk: 1, def: 0 },
    log: []
  };
  Math.random = () => 0.99;
  const realDateNowForCooldown = Date.now;
  Date.now = () => realDateNowForCooldown() + 1000;
  attackEnemy("skill", "heavy", true);
  const mpAfterHeavy = state.mp;
  assert.strictEqual(state.skillCooldowns.heavy, 2, "the casting turn should not count toward skill cooldown");
  attackEnemy("skill", "heavy", true);
  assert.strictEqual(state.skillCooldowns.heavy, 2, "failed cooldown casts should not advance cooldown");
  attackEnemy("attack", null, true);
  assert.strictEqual(state.skillCooldowns.heavy, 1, "only a later complete action round should reduce cooldown");
  Date.now = realDateNowForCooldown;
  Math.random = randomBeforeCombatRules;
  assert.strictEqual(state.mp, mpAfterHeavy, "skills on cooldown should not spend mp again");

  Math.random = () => 0.99;
  state = {
    classId: "mage",
    floor: 2,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    stats: { atk: 0, mag: 10, def: 80, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    skillLevels: {},
    skillBranches: {},
    skillCooldowns: {},
    currentEnemy: { type: "monster", name: "Burn Dummy", hp: 100, maxHp: 100, atk: 1, def: 0 },
    log: []
  };
  Date.now = () => realDateNowForCooldown() + 1000;
  attackEnemy("skill", "fireball", true);
  const hpAfterBurnCast = state.currentEnemy.hp;
  assert.strictEqual(state.currentEnemy.statuses?.burn?.turns, 2, "burn skills should leave a continuing status after the first tick");
  attackEnemy("attack", null, true);
  Date.now = realDateNowForCooldown;
  assert(state.currentEnemy.hp < hpAfterBurnCast - 2, "burn should keep damaging the enemy on later turns");

  state = {
    classId: "ranger",
    floor: 1,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    stats: { atk: 10, mag: 0, def: 80, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    skillLevels: { step: 3 },
    skillBranches: { step: "counter-step" },
    skillCooldowns: {},
    currentEnemy: { type: "monster", name: "Step Dummy", hp: 100, maxHp: 100, atk: 1, def: 0 },
    log: []
  };
  Date.now = () => realDateNowForCooldown() + 1000;
  attackEnemy("skill", "step", true);
  assert(state._nextDamageBonus > 0, "upgraded evade should store its power as next-damage bonus");
  attackEnemy("attack", null, true);
  Date.now = realDateNowForCooldown;
  Math.random = randomBeforeCombatRules;
  assert.strictEqual(state.currentEnemy.hp, 87, "upgraded evade should make the next attack hit harder");

  const randomBeforeRangerSkill = Math.random;
  try {
    const followupRolls = [0.99, 0.01, 0.99, 0.99];
    Math.random = () => followupRolls.shift() ?? 0.99;
    state = {
      classId: "ranger",
      floor: 1,
      hp: 100,
      maxHp: 100,
      mp: 20,
      maxMp: 20,
      stats: { atk: 10, mag: 0, def: 80, res: 0, spd: 40, luk: 0 },
      equipment: emptyEquipment(),
      inventory: [],
      skillLevels: {},
      skillBranches: {},
      skillCooldowns: {},
      currentEnemy: { type: "monster", name: "Followup Dummy", hp: 100, maxHp: 100, atk: 1, def: 0 },
      log: []
    };
    Date.now = () => realDateNowForCooldown() + 1000;
    attackEnemy("skill", "double", true);
    Date.now = realDateNowForCooldown;
    assert.strictEqual(state.currentEnemy.hp, 80, "ranger skill follow-up should add one normal attack, not recursively cast the skill");
    assert(state.log.some((entry) => entry.includes("追击")), "ranger skill follow-up should be logged as a follow-up effect");
  } finally {
    Math.random = randomBeforeRangerSkill;
  }

  state = {
    classId: "warrior",
    floor: 1,
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    stats: { atk: 10, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    skillLevels: { heavy: 3 },
    skillBranches: {},
    skillCooldowns: {},
    log: []
  };
  const baseHeavy = CLASSES.warrior.skills.find((skill) => skill.id === "heavy");
  const upgradedHeavy = upgradedSkill(baseHeavy);
  assert(upgradedHeavy.baseDamage > baseHeavy.baseDamage, "skill upgrades should increase base damage");
  assert(upgradedHeavy.atkMultiplier > baseHeavy.atkMultiplier, "skill upgrades should increase stat multiplier");
  state.currentEnemy = { type: "monster", name: "Guard Dummy", hp: 100, maxHp: 100, atk: 1, def: 0 };
  state.stats.def = 10;
  state.skillLevels = { guard: 0 };
  state.skillBranches = {};
  state.learnedSkillIds = ["guard"];
  state.equippedSkillIds = ["guard"];
  const baseGuardPreview = renderSkillActionButtons("battle");
  state.skillLevels = { guard: 3 };
  state.skillBranches = { guard: "bulwark" };
  const branchedGuardPreview = renderSkillActionButtons("battle");
  assert(baseGuardPreview.includes("格挡 21"), "guard skills should scale mitigation from defense and skill power");
  assert(branchedGuardPreview.includes("格挡 23"), "guard branches should visibly improve mitigation preview");

  state = {
    classId: "warrior",
    floor: 8,
    level: 8,
    hp: 90,
    maxHp: 90,
    mp: 30,
    maxMp: 30,
    stats: { atk: 8, mag: 0, def: 8, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    skillLevels: {},
    skillBranches: {},
    skillCooldowns: {},
    learnedSkillIds: ["heavy", "guard", "roar"],
    equippedSkillIds: ["heavy", "guard", "roar"],
    log: []
  };
  ensureSkillState();
  assert(classSkills().length >= 10, "each class should expose a broad skill pool");
  assert.strictEqual(canLearnSkill("execution"), false, "late skills should stay locked behind level and stat requirements");
  assert(skillRequirementText(skillById("execution")).includes("等级 14"), "locked skills should explain their level requirement");
  renderSkills();
  const skillMarkup = document.getElementById("tabBody").innerHTML;
  assert(skillMarkup.includes("skill-row inventory-card locked unmet"), "unmet skills should render as greyed locked rows");
  assert(skillMarkup.includes("skill-requirement unmet"), "unmet skill prerequisites should render with warning styling");
  assert.strictEqual(learnSkill("shieldBash", "导师训练"), true, "eligible mentor training should unlock a new skill");
  assert(state.learnedSkillIds.includes("shieldBash"), "learned skills should be persisted on state");
  assert(state.equippedSkillIds.includes("shieldBash"), "new skills should auto-equip when there is room");
  state.inventory = [{ id: "scroll-aimed", kind: "skillScroll", name: "瞄准射击卷轴", skillId: "aimedShot", classId: "ranger" }];
  useItem("scroll-aimed");
  assert(state.inventory.length === 1, "wrong-class skill scrolls should not be consumed");

  state = {
    classId: "ranger",
    floor: 8,
    level: 8,
    hp: 80,
    maxHp: 80,
    mp: 30,
    maxMp: 30,
    stats: { atk: 8, mag: 0, def: 0, res: 0, spd: 12, luk: 6 },
    equipment: emptyEquipment(),
    inventory: [{ id: "scroll-aimed", kind: "skillScroll", name: "瞄准射击卷轴", skillId: "aimedShot", classId: "ranger" }],
    skillLevels: {},
    skillBranches: {},
    skillCooldowns: {},
    learnedSkillIds: ["double", "step", "poison"],
    equippedSkillIds: ["double", "step", "poison"],
    log: []
  };
  useItem("scroll-aimed");
  assert(state.learnedSkillIds.includes("aimedShot"), "matching skill scrolls should unlock the skill");
  assert.strictEqual(state.inventory.length, 0, "learned skill scrolls should be consumed");
  assert(state.equippedSkillIds.length <= 4, "battle skill loadout should stay capped");

  state = {
    floor: 3,
    facing: "down",
    player: { x: 1, y: 1 },
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    stats: { atk: 0, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    floorStates: {},
    log: []
  };
  generateFloor();
  const originalTheme = state.map.theme;
  state.map.cells[2][2].object = { type: "chest", marker: "persistent" };
  state.player = { x: 4, y: 5 };
  state.facing = "left";
  saveCurrentFloor();
  state.floor = 4;
  generateFloor();
  state.floor = 3;
  enterFloor("up");
  assert.strictEqual(state.map.theme, originalTheme, "returning to an explored floor should restore its saved map");
  assert.strictEqual(state.map.cells[2][2].object?.marker, "persistent", "returning to an explored floor should preserve objects");
  assert.deepStrictEqual(state.player, { x: 4, y: 5 }, "returning to an explored floor should restore the saved player position");
  assert.strictEqual(state.facing, "left", "returning to an explored floor should restore the saved facing");

  state = {
    floor: 8,
    player: { x: 2, y: 2 },
    facing: "down",
    currentEnemy: null,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    stats: { atk: 0, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    floorStates: {},
    map: {
      size: 5,
      cells: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  state.map.cells[2][2].object = { type: "stairsDown", locked: true, sealId: "seal-test", seal: { type: "guardian", targetName: "封印守卫" } };
  let sealedEvent = null;
  showEvent = (title, body) => { sealedEvent = { title, body }; };
  saveGame = () => {};
  showToast = () => {};
  nextFloor();
  assert.strictEqual(state.floor, 8, "sealed downstairs should not move to the next floor");
  assert(modalState().body.includes("封印守卫"), "sealed downstairs should explain the unlock target");
  completeStairSeal({ sealId: "seal-test", name: "封印守卫" });
  assert.strictEqual(state.map.cells[2][2].object.locked, false, "defeating a seal guardian should unlock the downstairs");

  state.floor = 25;
  state.hp = 60;
  state.mp = 20;
  state.map.cells[2][2].object.locked = false;
  nextFloor();
  assert.strictEqual(state.floor, 26, "unsealed downstairs should move to the next floor");
  assert.strictEqual(state.hp, 60, "deep floors should stop granting stair hp recovery");
  assert.strictEqual(state.mp, 20, "deep floors should stop granting stair mp recovery");

  state.map.rooms = [{ id: "room-8-1", name: "12号房" }];
  assert.strictEqual(roomDoorLabel({ terrain: "door", roomId: "room-8-1" }), "12", "room doors should expose only the compact room number");
  assert.strictEqual(roomDoorLabel({ terrain: "floor", roomId: "room-8-1" }), "", "unlocked room doors should not add a compact room-number badge");
  assert(tileLabel({ seen: true, terrain: "floor", object: { type: "roomEntrance", roomId: "room-8-1", roomName: "12号房" } }).includes("未上锁入口"), "unlocked room door labels should remain available for accessibility");
  state.map.rooms = [{ id: "room-8-2", name: "13号房", threat: "danger" }];
  assert.strictEqual(roomDoorLabel({ terrain: "door", roomId: "room-8-2" }), "13", "room doors should not show suffixes or threat markers beside the room number");

  state = { floor: 3 };
  const elite = makeEnemy(true);
  assert.strictEqual(Number.isInteger(elite.hp), true, "enemy hp should be an integer");
  assert.strictEqual(Number.isInteger(elite.maxHp), true, "enemy max hp should be an integer");
  assert(elite.affix, "elite enemies should carry a tactical affix");
  assert(enemyAffixText(elite).length > 0, "enemy affixes should have visible text");

  const randomBeforeElementTest = Math.random;
  Math.random = () => 0.99;
  state = {
    floor: 8,
    classId: "mage",
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    stats: { atk: 10, mag: 20, def: 5, res: 5, spd: 5, luk: 0 },
    equipment: emptyEquipment(),
    currentEnemy: { type: "monster", name: "Ice Dummy", hp: 50, maxHp: 50, atk: 4, def: 1, element: "ice", weaknesses: ["fire"], resistances: ["ice"] },
    log: []
  };
  dealDamage(state.currentEnemy, 10, "Element Probe", "fire");
  assert.strictEqual(state.currentEnemy.hp, 35, "mage advantage should add a modest bonus on elemental weakness hits");
  document.querySelector = (selector) => selector === ".map-wrap" ? getElement("mapWrap") : selector === ".map-stage" ? getElement("mapStage") : null;
  renderBattleView();
  assert(getElement("battleStage").innerHTML.includes("fx-element-fire"), "elemental damage should render a matching battle effect class");
  assert(getElement("battleStage").innerHTML.includes("combat-fx-element-fire"), "elemental damage float text should carry a matching effect class");
  assert(renderBattleCommandPanel().includes("150%"), "battle skill cards should surface elemental matchup strength against the current enemy");
  state.currentEnemy = { type: "boss", name: "Phase Dummy", hp: 70, maxHp: 100, atk: 4, def: 0 };
  const phaseShiftText = dealDamage(state.currentEnemy, 10, "Phase Probe");
  assert(phaseShiftText.includes("转阶段"), "boss damage should announce the mid-health phase transition");
  assert(state.currentEnemy.skills.some((skill) => skill.id.includes("phase-pressure")), "boss phase shift should inject a pressure script skill");
  const crisisText = dealDamage(state.currentEnemy, 30, "Phase Probe");
  assert(crisisText.includes("濒危阶段"), "boss damage should announce the low-health phase transition");
  assert(state.currentEnemy.skills.some((skill) => skill.id.includes("last-rite")), "boss crisis phase should inject a crisis script skill");
  state.currentEnemy = { type: "boss", bossProfile: "ember", name: "Ember Script Dummy", hp: 70, maxHp: 100, atk: 4, def: 0, element: "fire" };
  dealDamage(state.currentEnemy, 10, "Phase Probe");
  assert(state.currentEnemy.skills.some((skill) => skill.id === "ember-shift-script" && skill.type === "damage"), "theme bosses should use profile-specific phase scripts");
  assert.strictEqual(state.currentEnemy._bossNextIntent, "damage", "theme boss phase shifts should prime a profile-specific next action intent");
  state.hp = 100;
  state.currentEnemy._lastSkillId = "";
  Math.random = () => 0.99;
  enemyTurn(state.currentEnemy);
  assert.strictEqual(state.currentEnemy._lastSkillId, "ember-shift-script", "primed ember bosses should spend their next turn on the scripted burst");
  assert.strictEqual(state.currentEnemy._bossNextIntent, "", "boss next-action intent should be consumed after one turn");
  state.currentEnemy = { type: "boss", bossProfile: "mine", name: "Mine Script Dummy", hp: 70, maxHp: 100, atk: 4, def: 3, element: "lightning" };
  dealDamage(state.currentEnemy, 10, "Phase Probe");
  enemyTurn(state.currentEnemy);
  assert.strictEqual(state.currentEnemy._lastSkillId, "mine-shift-script", "primed mine bosses should answer phase shifts with their shield script");
  assert(state.currentEnemy._guard > 0, "mine boss shield script should create a guard value");
  Math.random = randomBeforeElementTest;

  Math.random = () => 0.1;
  state = { floor: 8 };
  const skilledEnemy = makeEnemy(true);
  assert(skilledEnemy.element, "generated enemies should carry an elemental identity");
  assert(Array.isArray(skilledEnemy.weaknesses) && skilledEnemy.weaknesses.length > 0, "enemy elements should expose weaknesses");
  assert(skilledEnemy.skills?.length > 0, "mid-floor elite enemies should have monster skills");
  state = {
    floor: 12,
    classId: "warrior",
    hp: 120,
    maxHp: 120,
    mp: 20,
    maxMp: 20,
    stats: { atk: 15, mag: 1, def: 8, res: 4, spd: 2, luk: 1 },
    equipment: emptyEquipment(),
    currentEnemy: {
      type: "elite",
      name: "Skill Reader",
      hp: 20,
      maxHp: 80,
      atk: 8,
      def: 5,
      spd: 4,
      roomBoss: true,
      skills: [
        { id: "reader-guard", name: "Reader Guard", type: "guard", power: 1, chance: 0.36 },
        { id: "reader-drain", name: "Reader Drain", type: "drain", power: 1, chance: 0.28 }
      ]
    },
    log: []
  };
  showCurrentEnemyDetail();
  assert(modalState().body.includes("防御") && modalState().body.includes("汲取"), "enemy detail should describe monster skill intent");
  assert(modalState().body.includes("濒危"), "boss-like enemy detail should surface the current phase hint");
  assert(modalState().body.includes("保留爆发"), "enemy detail should surface tactical counters for recovery-heavy kits");
  state = {
    floor: 12,
    classId: "warrior",
    hp: 120,
    maxHp: 120,
    mp: 20,
    maxMp: 20,
    stats: { atk: 15, mag: 1, def: 8, res: 4, spd: 2, luk: 1 },
    equipment: emptyEquipment(),
    currentEnemy: {
      type: "elite",
      name: "Guard Tactician",
      hp: 80,
      maxHp: 80,
      atk: 8,
      def: 5,
      skills: [
        { id: "tactical-guard", name: "Tactical Guard", type: "guard", power: 1, chance: 0.01 },
        { id: "tactical-hit", name: "Tactical Hit", type: "damage", power: 1, chance: 0.01 }
      ]
    },
    log: []
  };
  Math.random = () => 0.99;
  enemyTurn(state.currentEnemy);
  assert(state.currentEnemy._guard > 0, "elite enemies should prioritize an opening guard when their kit supports it");
  state.currentEnemy._guard = 0;
  enemyTurn(state.currentEnemy);
  assert.strictEqual(state.currentEnemy._lastSkillId, "", "elite enemies should not repeat the same priority guard every turn");

  state.currentEnemy = {
    type: "boss",
    name: "Wounded Boss",
    hp: 20,
    maxHp: 100,
    atk: 8,
    def: 3,
    skills: [
      { id: "boss-heal", name: "Boss Heal", type: "heal", power: 0.2, chance: 0.01 },
      { id: "boss-hit", name: "Boss Hit", type: "damage", power: 1, chance: 0.01 }
    ]
  };
  enemyTurn(state.currentEnemy);
  assert(state.currentEnemy.hp > 20, "boss enemies should prioritize recovery when badly wounded");

  state.currentEnemy = {
    type: "boss",
    name: "Phase Boss",
    hp: 60,
    maxHp: 100,
    atk: 8,
    def: 3,
    skills: [
      { id: "phase-curse", name: "Phase Curse", type: "weaken", power: 1, chance: 0.01 },
      { id: "phase-hit", name: "Phase Hit", type: "damage", power: 1, chance: 0.01 }
    ]
  };
  state.hp = 120;
  Math.random = () => 0.99;
  enemyTurn(state.currentEnemy);
  assert.strictEqual(state.currentEnemy._lastSkillId, "phase-curse", "mid-health bosses should prioritize pressure skills during phase shift");
  state = { floor: 20 };
  const fungalEnemy = makeEnemy(false);
  assert(
    ["孢子行者", "菌毯潜伏者", "腐木守卫"].some((name) => fungalEnemy.name.includes(name)),
    "mid-run floor themes should use their own enemy prototypes"
  );
  assert(fungalEnemy.weaknesses.includes("fire"), "fungal enemies should expose theme-specific elemental counters");
  Math.random = randomBeforeElementTest;

  state = {
    floor: 8,
    hp: 180,
    maxHp: 200,
    mp: 60,
    maxMp: 70,
    stats: { atk: 35, mag: 18, def: 28, res: 18, spd: 20, luk: 5 },
    equipment: emptyEquipment(),
    currentEnemy: { type: "monster", name: "Weak Slime", hp: 20, maxHp: 20, atk: 4, def: 1 },
    log: []
  };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "safe ordinary monsters should be eligible for auto battle");
  state.hp = 110;
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "auto battle should follow win rate instead of a fixed hp reserve");
  state.hp = 180;
  state.mp = 18;
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "auto battle should follow win rate instead of a fixed mp reserve");
  state.mp = 60;
  state.currentEnemy = { type: "elite", name: "Elite Guard", hp: 20, maxHp: 20, atk: 4, def: 1 };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "elite enemies above 68% win rate should be eligible for auto battle");
  state.currentEnemy = { type: "monster", name: "Armored Guard", hp: 20, maxHp: 20, atk: 4, def: 1, affix: { id: "armored", name: "坚甲" } };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "affixed enemies above 68% win rate should be eligible for auto battle");
  state.currentEnemy = { type: "monster", name: "Skilled Guard", hp: 20, maxHp: 20, atk: 4, def: 1, skills: [{ id: "harden", name: "Harden", type: "guard" }] };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "skilled enemies above 68% win rate should be eligible for auto battle");
  state.currentEnemy = { type: "monster", name: "Overwhelming Guard", hp: 240, maxHp: 240, atk: 46, def: 20 };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, false, "auto battle should stop when the win rate is 68% or lower");
  state.currentEnemy = { type: "monster", name: "Armored Guard", hp: 20, maxHp: 20, atk: 4, def: 1, affix: { id: "armored", name: "坚甲" } };
  autoBattle();
  assert(modalState().body.includes("胜率"), "auto battle confirmation should show the estimated win rate");
  assert(modalState().actions.some((action) => action.text.includes("开始一键战斗")), "auto battle should be available above 68% win rate");

  state = {
    floor: 1,
    currentEnemy: null,
    map: { cells: [] },
    log: []
  };
  let modalCallCount = 0;
  showModal = () => { modalCallCount++; };
  render = () => {};
  const monsterEncounter = { type: "monster", name: "Slime", hp: 10, maxHp: 10, atk: 3, def: 1 };
  resolveCell({ object: monsterEncounter });
  assert.strictEqual(state.currentEnemy, monsterEncounter, "normal monsters should enter battle immediately");
  assert.strictEqual(modalCallCount, 0, "normal monsters should not show an encounter confirmation modal");

  state.currentEnemy = null;
  const deadMonsterCell = { object: { type: "monster", name: "Old Slime", hp: 0, maxHp: 10, atk: 3, def: 1 } };
  resolveCell(deadMonsterCell);
  assert.strictEqual(deadMonsterCell.object, null, "defeated monsters should be cleared instead of entering battle");
  assert.strictEqual(state.currentEnemy, null, "defeated monsters should not trigger a battle view");

  state.currentEnemy = null;
  let dangerModal = null;
  closeModal = () => {};
  showModal = (title, body, actions) => { dangerModal = { title, body, actions }; };
  state.hp = 120;
  state.maxHp = 120;
  state.stats = { atk: 35, mag: 0, def: 28, res: 12, spd: 20, luk: 5 };
  const eliteEncounter = { type: "elite", name: "Elite Guard", hp: 40, maxHp: 40, atk: 12, def: 4 };
  resolveCell({ object: eliteEncounter });
  assert.strictEqual(state.currentEnemy, eliteEncounter, "ordinary elite monsters should enter battle immediately");
  assert.strictEqual(dangerModal, null, "ordinary elite monsters should not show an encounter confirmation modal");

  state.currentEnemy = null;
  const overwhelmingElite = { type: "elite", name: "Overwhelming Elite", hp: 300, maxHp: 300, atk: 60, def: 18 };
  resolveCell({ object: overwhelmingElite });
  assert.strictEqual(state.currentEnemy, overwhelmingElite, "non-special elite monsters should enter battle even when dangerous");
  assert.strictEqual(dangerModal, null, "risk score alone should not trigger an encounter confirmation modal");

  state.currentEnemy = null;
  const keyGuardianEncounter = { type: "elite", name: "Key Guardian", hp: 120, maxHp: 120, atk: 28, def: 10, roomBoss: true };
  resolveCell({ object: keyGuardianEncounter });
  assert.strictEqual(state.currentEnemy, null, "special elite monsters should wait for confirmation before battle");
  assert(modalState().title.includes("危险"), "special elite encounter modal should warn about danger");
  assert(modalState().actions.some((action) => action.text.includes("进入战斗")), "special elite encounter modal should offer battle confirmation");
  modalState().actions.find((action) => action.text.includes("进入战斗")).action();
  assert.strictEqual(state.currentEnemy, keyGuardianEncounter, "confirming a special elite encounter should enter battle");

  state = {
    floor: 1,
    player: { x: 2, y: 1 },
    facing: "left",
    currentEnemy: null,
    map: {
      size: 3,
      cells: Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  dangerModal = null;
  state.map.cells[1][1].object = eliteEncounter;
  move(-1, 0);
  assert.deepStrictEqual(state.player, { x: 1, y: 1 }, "ordinary elite movement should enter the tile immediately");

  state.currentEnemy = { type: "monster", name: "Stale Slime", hp: 0, maxHp: 10, atk: 2, def: 0 };
  state.player = { x: 1, y: 1 };
  state.map.cells[1][2].object = null;
  move(1, 0);
  assert.deepStrictEqual(state.player, { x: 2, y: 1 }, "movement should recover from a stale defeated current enemy instead of freezing");
  assert.strictEqual(state.currentEnemy, null, "stale defeated current enemy should be cleared during movement recovery");

  state = {
    floor: 1,
    player: { x: 2, y: 1 },
    facing: "left",
    currentEnemy: null,
    map: {
      cells: Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  dangerModal = null;
  state.map.cells[1][1].object = { type: "elite", name: "Key Guardian", hp: 120, maxHp: 120, atk: 28, def: 10, roomBoss: true };
  move(-1, 0);
  assert.deepStrictEqual(state.player, { x: 1, y: 1 }, "special elite movement should resolve consistently after the encounter flow");

  state = {
    floor: 1,
    player: { x: 2, y: 1 },
    facing: "left",
    currentEnemy: null,
    map: {
      cells: Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  state.map.cells[1][1].object = { type: "shop" };
  const realOpenMerchant = openMerchant;
  render = () => {};
  move(-1, 0);
  assert(modalState().title.includes("商队"), "moving into a merchant should open the merchant interaction");
  state.gold = merchantPurchasePreview("universalKey").price;
  state.universalKeys = 0;
  state.map.cells[1][1].object = { type: "shop", sellsUniversalKey: true };
  buy("universalKey");
  assert.strictEqual(state.universalKeys, 1, "lucky merchants should sell one universal key");
  assert.strictEqual(state.map.cells[1][1].object.universalKeySold, true, "merchant universal key stock should be marked sold after purchase");

  state = {
    floor: 1,
    player: { x: 2, y: 1 },
    facing: "left",
    currentEnemy: null,
    keys: 0,
    gold: 0,
    stats: { luk: 0 },
    inventory: [],
    materials: {},
    runes: {},
    map: {
      cells: Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  state.map.cells[1][1].object = { type: "lockedChest" };
  showEvent = () => {};
  render = () => {};
  openLockedChest(state.map.cells[1][1]);
  assert.strictEqual(state.map.cells[1][1].object?.type, "lockedChest", "locked chest without a key should remain on the map");
  state.facing = "right";
  move(0, 1);
  assert.strictEqual(state.facing, "right", "vertical movement should not override an existing horizontal facing");
  state.player = { x: 2, y: 1 };

  state.keys = 1;
  openLockedChest(state.map.cells[1][1]);
  assert.strictEqual(state.map.cells[1][1].object, null, "opened locked chest should be removed from the map");

  const gateCell = { terrain: "floor", object: { type: "fenceGate" } };
  let eventTitle = null;
  let eventBody = null;
  showEvent = (title, body) => { eventTitle = title; eventBody = body; };
  state.keys = 0;
  openFenceGate(gateCell);
  assert.strictEqual(gateCell.object?.type, "fenceGate", "fence gate should remain closed without a key");
  assert(modalState().body.includes("钥匙守卫") && modalState().body.includes("委托人"), "locked fence hint should explain key sources");
  state.keys = 1;
  openFenceGate(gateCell);
  assert.strictEqual(gateCell.object, null, "fence gate should open when the player has a key");
  assert.strictEqual(state.keys, 1, "opening the gate should reveal the chest path without spending the chest key");
  assert(tileLabel({ seen: true, terrain: "floor", object: { type: "lockedChest" } }).includes("钥匙守卫"), "locked chest label should hint at the key guardian");
  assert.strictEqual(tileLabel({ seen: true, terrain: "floor", object: null, roomId: "room-1-0" }), "地面：可通行", "empty corridor or room floor labels should not claim the selected tile is a room");

  state.floor = 1;
  state.quests = [];
  let questModal = null;
  showModal = (title, body, actions) => { questModal = { title, body, actions }; };
  openQuestNpc();
  assert(modalState().actions.some((action) => action.text.includes("接受")), "quest NPC should offer an accept action");
  modalState().actions.find((action) => action.text.includes("接受")).action();
  assert.strictEqual(state.quests.length, 1, "accepting from an NPC should add an active quest to the quest list");
  assert.strictEqual(state.quests[0].accepted, true, "accepted quest should be marked active");
  assert.strictEqual(state.quests[0].kills, 0, "accepted quest starts with fresh tracked progress");

  const acceptedRewards = [];
  recordQuestKill({ type: "monster", name: "Slime" }, acceptedRewards);
  assert.strictEqual(state.quests[0].kills, 1, "accepted quest kill progress should advance on monster defeat");
  assert(acceptedRewards.some((entry) => entry.includes("1/2")), "accepted quest progress should be shown in battle rewards");
  recordQuestKill({ type: "monster", name: "Bat" }, acceptedRewards);
  assert.strictEqual(state.quests[0].completed, true, "quest should be marked complete when the target is met");
  openQuestNpc();
  modalState().actions.find((action) => action.text.includes("领取")).action();
  assert.strictEqual(state.quests[0].claimed, true, "quest NPC should mark completed rewards as claimed");
  assert.strictEqual(state.keys, 2, "quest NPC should reward a rune key");

  const questList = renderQuestList();
  assert(questList.includes("quest-list"), "task tab should render a quest list");
  assert(questList.includes("已领取"), "claimed quests should remain visible in the task list");

  state = { floor: 1, lore: { chapters: [], pages: [] }, quests: [], log: [] };
  const unlockedLore = unlockLoreChaptersForFloor(state, { skipOpening: true });
  assert.strictEqual(unlockedLore.length, 0, "new adventures should not auto-unlock the opening lore chapter");
  assert(renderQuestList().includes("寻找入口引路人"), "task tab should pin the opening main quest");
  state.map = { rooms: [], cells: [[{ x: 0, y: 0, terrain: "floor", object: { type: "guideNpc", npcName: "旧灯引路人" }, seen: true }]] };
  openGuideNpc(state.map.cells[0][0]);
  assert(modalState().body.includes("符文地牢会移动入口"), "opening guide should explain the dungeon premise");
  modalState().actions.find((action) => action.text.includes("收下残页")).action();
  assert(state.lore.chapters.includes("threshold"), "opening guide should grant the first lore page");
  assert.strictEqual(state.introGuideMet, true, "opening guide should be marked as met");
  const firstPage = discoverLorePage(state, "chest");
  assert.strictEqual(firstPage?.id, "threshold-scratch", "chests should be able to reveal eligible lore pages");
  const loreList = renderQuestList();
  assert(!loreList.includes("openLoreArchive"), "task tab should keep lore archive controls out of quest tracking");
  assert(!loreList.includes("入口刻痕"), "discovered lore pages should open from the archive instead of rendering inline");
  state.map.cells[0][0].object = null;
  state.tutorial = { step: "move", completed: [] };
  renderContext();
  assert(document.getElementById("contextBody").innerHTML.includes("当前目标"), "action panel should surface the current tutorial objective");
  assert(document.getElementById("contextBody").innerHTML.includes("迈出第一步"), "tutorial objective should show readable step copy");
  assert(document.getElementById("contextBody").innerHTML.includes("地牢残页"), "action panel should expose the lore archive shortcut");
  openLoreArchive();
  assert(modalState().body.includes("第一章：入口不会记人"), "lore archive should open the first discovered entry");
  modalState().actions.find((action) => action.text.includes("下一页")).action();
  assert(modalState().body.includes("入口刻痕"), "lore archive should page through discovered lore entries");

  const rescueSource = { type: "questNpc", questId: "rescueRoom", npcName: "救援斥候卡尔", roomId: "room-1-0", roomName: "1号房", rescueName: "矿工托兰", target: 1 };
  state.floor = 1;
  state.quests = [];
  state.map = { rooms: [{ id: "room-1-0", name: "1号房" }], cells: [[{ x: 0, y: 0, terrain: "floor", object: null, seen: true }]] };
  state.player = { x: 0, y: 0 };
  const rescueQuest = acceptQuest("rescueRoom", rescueSource);
  assert.strictEqual(rescueQuest.roomName, "1号房", "rescue quests should preserve the target room label");
  const rescueRewards = [];
  recordQuestKill({ type: "monster", name: "Guard", roomId: "room-1-0" }, rescueRewards);
  assert.strictEqual(rescueQuest.roomCleared, true, "rescue quest should mark the room cleared after target kills");
  assert.strictEqual(rescueQuest.completed, false, "rescue quest should still require checking on the trapped NPC");
  openRescueNpc({ type: "rescueNpc", npcName: "矿工托兰", roomId: "room-1-0" });
  assert.strictEqual(rescueQuest.completed, true, "talking to the rescued NPC should complete the rescue quest");

  state.floor = 2;
  state.quests = [];
  const crossFloorQuest = acceptQuest("wardenErrand", { type: "questNpc", questId: "wardenErrand", targetFloor: 3 });
  const crossRewards = [];
  recordQuestKill({ type: "monster", name: "Wrong Floor" }, crossRewards);
  assert.strictEqual(crossFloorQuest.kills, 0, "cross-floor quests should not progress on the wrong floor");
  state.floor = 3;
  recordQuestKill({ type: "monster", name: "Target Floor" }, crossRewards);
  assert.strictEqual(crossFloorQuest.kills, 1, "cross-floor quests should progress on their target floor");
  assert(renderQuestList().includes("目标第 3 层"), "quest list should show the target floor when it differs from the giver floor");

  state.floor = 6;
  state.quests = [];
  state.gold = 0;
  state.skillDust = 0;
  state.narrative = { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} };
  const surveyQuest = acceptQuest("runeSurvey", {
    type: "questNpc",
    questId: "runeSurvey",
    npcName: "符文测绘员",
    targetFloor: 6
  });
  assert(renderQuestList().includes("符文测绘"), "quest list should render the rune survey branch");
  const surveyRewards = [];
  recordQuestKill({ type: "monster", name: "Echo" }, surveyRewards);
  assert.strictEqual(surveyQuest.completed, true, "rune survey quests should complete through the shared kill progress path");
  claimQuestReward("runeSurvey");
  assert.strictEqual(state.skillDust, 2, "rune survey quests should reward skill dust");
  assert.strictEqual(state.narrative.relations.runebound, 1, "rune survey quests should strengthen runebound relations");
  assert.strictEqual(state.narrative.factionLeanings.runebound, 1, "rune survey quests should update runebound faction leaning");

  state.floor = 8;
  state.quests = [];
  state.runes = {};
  state.questChains = {};
  const calibrationQuest = acceptQuest("runeCalibration", {
    type: "questNpc",
    questId: "runeCalibration",
    npcName: "回声校准师",
    targetFloor: 8
  });
  const calibrationRewards = [];
  recordQuestKill({ type: "monster", name: "Plain Target" }, calibrationRewards);
  assert.strictEqual(calibrationQuest.kills, 0, "rune calibration should ignore non-runic targets");
  recordQuestKill({ type: "monster", name: "Echo Target", affix: "burning" }, calibrationRewards);
  recordQuestKill({ type: "elite", name: "Elite Echo" }, calibrationRewards);
  assert.strictEqual(calibrationQuest.completed, true, "rune calibration should progress from runic or elite targets");
  claimQuestReward("runeCalibration");
  assert(Object.values(state.runes).some((count) => count > 0), "rune calibration should reward a rune");
  assert.strictEqual(state.questChains.runeCalibration, 1, "chain quests should record completion counts");

  state.floor = 10;
  state.quests = [];
  const bountyQuest = acceptQuest("eliteBounty", {
    type: "questNpc",
    questId: "eliteBounty",
    npcName: "悬赏巡夜人",
    targetFloor: 10
  });
  const bountyRewards = [];
  recordQuestKill({ type: "monster", name: "Normal Target" }, bountyRewards);
  assert.strictEqual(bountyQuest.kills, 0, "elite bounty should ignore ordinary monsters");
  recordQuestKill({ type: "elite", name: "Bounty Target" }, bountyRewards);
  assert.strictEqual(bountyQuest.completed, true, "elite bounty should complete from elite kills");

  state = {
    floor: 2,
    player: { x: 1, y: 1 },
    facing: "down",
    inventory: [{ id: "beacon", kind: "teleport", name: "商路信标" }],
    floorStates: {
      1: {
        map: {
          size: 5,
          cells: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
            x, y, terrain: "floor", object: null, seen: true, visible: true
          })))
        },
        player: { x: 1, y: 1 },
        facing: "down"
      }
    },
    map: {
      size: 5,
      cells: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
        x, y, terrain: "floor", object: null, seen: true, visible: true
      })))
    },
    log: []
  };
  state.floorStates[1].map.cells[2][2].object = { type: "questNpc", npcName: "巡夜人" };
  state.map.cells[3][3].object = { type: "shop" };
  const teleportTargets = knownTeleportTargets();
  assert(teleportTargets.some((target) => target.floor === 1 && target.label.includes("巡夜人")), "teleport beacon should find explored quest NPCs on saved floors");
  assert(teleportTargets.some((target) => target.floor === 2 && target.label.includes("商人")), "teleport beacon should find merchants on the current floor");
  saveCurrentFloor = () => {};
  render = () => {};
  closeModal = () => {};
  teleportToTarget("beacon", teleportTargets.find((target) => target.floor === 1));
  assert.strictEqual(state.floor, 1, "teleporting to a saved-floor target should switch floors");
  assert.strictEqual(state.inventory.length, 0, "teleporting should consume the beacon");
  assert(["floor", "door"].includes(state.map.cells[state.player.y][state.player.x].terrain), "teleporting should land on a passable tile");

  state = {
    floor: 1,
    gold: 40,
    keys: 0,
    inventory: [{ id: "merchant-scrap", kind: "equip", name: "Merchant Scrap", slot: "armor", quality: "common", stats: { def: 1 }, runeSlots: 0, runes: [], level: 0 }],
    quests: [],
    log: []
  };
  let merchantModal = null;
  showModal = (title, body, actions) => { merchantModal = { title, body, actions }; };
  openMerchant = realOpenMerchant;
  openMerchant();
  assert(modalState().actions.some((action) => action.text.includes("商店")), "merchant with a task should keep a shop action");
  assert(modalState().actions.some((action) => action.text.includes("售出")), "merchant dialogue should expose equipment selling");
  assert(modalState().actions.some((action) => action.text.includes("任务")), "merchant with a task should offer a task action");
  modalState().actions.find((action) => action.text.includes("任务")).action();
  assert(modalState().actions.some((action) => action.text.includes("接受")), "merchant task action should open an accept flow");
  openMerchantShop();
  assert(modalState().body.includes("merchant-salvage-list"), "merchant shop should include an equipment salvage list");
  assert(modalState().body.includes("confirmDisassembleEquipment"), "merchant shop should offer equipment disassembly");
  openMerchantSell();
  assert(modalState().body.includes("confirmSellEquipment"), "merchant sell view should offer equipment selling");

  state = {
    floor: 4,
    hp: 60,
    maxHp: 100,
    mp: 10,
    maxMp: 20,
    gold: 0,
    keys: 0,
    inventory: [],
    materials: {},
    runes: {},
    map: { cells: [[{ x: 0, y: 0, terrain: "floor", object: null, seen: true, visible: true }]] },
    player: { x: 0, y: 0 },
    log: []
  };
  const roomEventCell = { object: { type: "roomEvent", eventId: "cracked_altar", name: "裂纹祭坛" } };
  resolveCell(roomEventCell);
  assert(modalState().body.includes(roomEventMetaText(roomEventsForFloor(2)[0])), "room event modal should show event category and risk");
  assert(modalState().actions.some((action) => action.text.includes("刮取")), "room events should expose event choices");
  modalState().actions.find((action) => action.text.includes("刮取")).action();
  assert.strictEqual(roomEventCell.object, null, "resolved room events should be consumed");
  assert.strictEqual(state.materials["魔尘"], 1, "room event rewards should apply through the event definition");
  assert.strictEqual(state.narrative.relations.wardens, 1, "room event choices should leave persistent relationship changes");
  assert.strictEqual(state.narrative.flags.altar_salvaged, true, "room event choices should set persistent narrative flags");
  assert.strictEqual(state.narrative.eventChoices.cracked_altar, "salvage_altar_dust", "room event choices should be recorded for later consequences");
  assert.strictEqual(state.narrative.factionLeanings.wardens, 1, "room event choices should update long-term faction leaning");
  state.narrative.relations.wardens = 7;
  state.narrative.factionLeanings.wardens = 3;
  const wardenSealCell = { object: { type: "roomEvent", eventId: "warden_seal", name: "warden seal" } };
  state.materials["榄斿皹"] = 1;
  resolveCell(wardenSealCell);
  modalState().actions[0].action();
  assert(state.narrative.milestones.includes("wardens:locked"), "room event choices should immediately record branch milestones after relationship changes");
  assert(roomEventsForFloor(8).length >= 7, "room event pools should have enough varied mid-run events");
  assert(roomEventsForFloor(12).length >= 9, "room event pools should expand with mid-run relationship events");

  state = {
    floor: 8,
    hp: 70,
    maxHp: 100,
    mp: 10,
    maxMp: 20,
    gold: 0,
    keys: 0,
    inventory: [],
    materials: {},
    runes: {},
    narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: ["1:room-1-0:矿工托兰"], merchantTrust: 0, factionLeanings: {} },
    map: { cells: [[{ x: 0, y: 0, terrain: "floor", object: null, seen: true, visible: true }]] },
    player: { x: 0, y: 0 },
    log: []
  };
  const survivorMarkCell = { object: { type: "roomEvent", eventId: "survivor_mark", name: "幸存者暗记" } };
  resolveCell(survivorMarkCell);
  assert(modalState().actions.some((action) => action.text.includes("按暗记")), "rescued NPC history should unlock survivor follow-up room event rewards");
  modalState().actions.find((action) => action.text.includes("按暗记")).action();
  assert.strictEqual(survivorMarkCell.object, null, "survivor follow-up room event should be consumed");
  assert(state.gold > 0, "survivor follow-up should grant a material reward");
  assert(state.inventory.some((entry) => entry.kind === "potion"), "survivor follow-up should leave a supply item");
  assert.strictEqual(state.narrative.factionLeanings.survivors, 1, "survivor follow-up should update faction leaning");

  state = {
    floor: 12,
    hp: 80,
    maxHp: 100,
    mp: 20,
    maxMp: 30,
    gold: 0,
    keys: 0,
    universalKeys: 0,
    inventory: [],
    materials: {},
    runes: {},
    narrative: { relations: { merchants: 4 }, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 3, factionLeanings: {} },
    map: { cells: [[{ x: 0, y: 0, terrain: "floor", object: null, seen: true, visible: true }]] },
    player: { x: 0, y: 0 },
    log: []
  };
  const merchantLedgerCell = { object: { type: "roomEvent", eventId: "merchant_ledger", name: "商路账簿" } };
  resolveCell(merchantLedgerCell);
  assert(modalState().actions.some((action) => action.text.includes("兑现")), "merchant trust should unlock ledger credit choices");
  modalState().actions.find((action) => action.text.includes("兑现")).action();
  assert.strictEqual(merchantLedgerCell.object, null, "merchant ledger event should be consumed");
  assert.strictEqual(state.universalKeys, 1, "merchant ledger credit should grant one universal key");
  assert.strictEqual(state.narrative.factionLeanings.merchants, 1, "merchant ledger credit should update merchant faction leaning");
  state.narrative.factionLeanings.merchants = 4;
  state.lore = { chapters: ["threshold"], pages: [] };
  state.quests = [];
  assert(renderQuestList().includes("剧情倾向：流动商队路线升温"), "main quest row should surface mid-run narrative branch direction");

  state = {
    floor: 4,
    gold: 0,
    keys: 0,
    inventory: [],
    quests: [{
      id: "wardenErrand",
      giver: "questNpc",
      floor: 4,
      targetFloor: 4,
      kills: 2,
      target: 2,
      accepted: true,
      completed: true,
      claimed: false
    }],
    narrative: { relations: { wardens: 6 }, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: { wardens: 3 } },
    log: []
  };
  claimQuestReward("wardenErrand");
  assert.strictEqual(state.gold, 31, "trusted quest givers should pay a relationship bonus");
  assert.strictEqual(state.narrative.relations.wardens, 7, "claiming a quest should strengthen the related long-term relationship");
  assert.strictEqual(state.narrative.factionLeanings.wardens, 4, "claiming a warden quest should improve the related faction leaning");
  assert(state.narrative.milestones.includes("wardens:leaning"), "mid-run quest branches should record newly visible route milestones");
  assert(modalState().body.includes("巡夜人信赖"), "quest reward modal should surface relationship consequences");
  assert(modalState().body.includes("巡夜人路线开始显现"), "quest reward modal should explain mid-run branch consequences");
  assert(state.log.some((entry) => entry.includes("影响：") && entry.includes("奖励 +18%")), "quest completion log should explain long-term relationship impact");

  state = {
    narrative: {
      relations: { wardens: 8, merchants: 1, survivors: 0, runebound: 0 },
      flags: {},
      eventChoices: { warden_seal: "reinforce_warden_seal", cracked_altar: "salvage_altar_dust" },
      rescuedNpcIds: [],
      merchantTrust: 0,
      factionLeanings: { wardens: 3 }
    }
  };
  const wardenEnding = determineEnding();
  assert.strictEqual(wardenEnding.id, "seal_kept", "warden-heavy long-term choices should produce the sealed ending");
  assert.strictEqual(state.narrative.endingId, "seal_kept", "ending resolution should be recorded in narrative state");
  assert.strictEqual(state.narrative.endingScores.wardens, wardenEnding.score.wardens, "ending scores should be stored for save summaries and review");
  state.floor = 4;
  state.gold = 0;
  state.keys = 0;
  state.inventory = [];
  state.quests = [{
    id: "wardenErrand",
    giver: "questNpc",
    floor: 4,
    targetFloor: 4,
    kills: 2,
    target: 2,
    accepted: true,
    completed: true,
    claimed: false
  }];
  claimQuestReward("wardenErrand");
  assert.strictEqual(state.gold, 34, "sealed ending should stack with relationship bonuses for matching warden quest payouts");

  state = {
    narrative: {
      relations: { wardens: 5, merchants: 6, survivors: 4, runebound: 5 },
      flags: {},
      eventChoices: { merchant_ledger: "redeem_ledger_credit", survivor_mark: "claim_survivor_cache" },
      rescuedNpcIds: ["1:room-a:矿工", "2:room-b:斥候"],
      merchantTrust: 4,
      factionLeanings: { wardens: 2, merchants: 2, survivors: 2, runebound: 2 }
    }
  };
  const compactEnding = determineEnding();
  assert.strictEqual(compactEnding.id, "shared_compact", "balanced faction support should unlock the shared compact ending");
  assert(compactEnding.highlights.some((entry) => entry.includes("救援 2 人")), "ending highlights should include rescued survivors");

  state = {
    classId: "mage",
    quests: [{
      id: "rescueRoom",
      giver: "questNpc",
      floor: 7,
      targetFloor: 7,
      kills: 0,
      target: 2,
      roomId: "room-7-1",
      accepted: true,
      completed: false,
      claimed: false
    }],
    narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} }
  };
  const failedEnding = determineEnding();
  assert(state.narrative.failedQuestIds.includes("rescueRoom:7:room-7-1"), "unfinished accepted quests should be recorded as ending failures");
  assert(failedEnding.highlights.some((entry) => entry.includes("未竟委托 1 件")), "ending highlights should surface failed quest consequences");
  assert(state.narrative.endingClassText.includes("法师后果"), "ending resolution should record class-specific consequence text");

  state.floor = MAX_FLOOR;
  state.narrative = {
    relations: { wardens: 5, merchants: 6, survivors: 4, runebound: 5 },
    flags: {},
    eventChoices: { merchant_ledger: "redeem_ledger_credit", survivor_mark: "claim_survivor_cache" },
    rescuedNpcIds: ["1:room-a:矿工", "2:room-b:斥候"],
    merchantTrust: 4,
    factionLeanings: { wardens: 2, merchants: 2, survivors: 2, runebound: 2 }
  };
  state.quests = [];
  state.classId = "warrior";
  state.stats = { atk: 200, mag: 0, def: 0, res: 0, spd: 0, luk: 0 };
  state.equipment = emptyEquipment();
  state.skillCooldowns = {};
  state.currentEnemy = { type: "boss", name: "Ending Boss", hp: 1, maxHp: 100, atk: 1, def: 0, xp: 1, gold: 1 };
  state.xp = 0;
  state.xpNext = 999;
  state.gold = 0;
  state.keys = 0;
  state.inventory = [];
  state.materials = {};
  state.runes = {};
  state.map = { cells: [[{ x: 0, y: 0, terrain: "floor", object: state.currentEnemy }]] };
  document.querySelector = () => null;
  attackEnemy("attack");
  assert.strictEqual(state.narrative.endingId, "shared_compact", "final boss victory should resolve and record the ending");
  assert.strictEqual(modalState().title, "结局：共管誓约", "final boss victory should show the resolved ending title");
  assert(modalState().body.includes("ending-panel"), "final boss victory should show ending consequences");

  state = {
    floor: 4,
    gold: 0,
    keys: 0,
    inventory: [],
    quests: [{
      id: "merchantRoute",
      giver: "shop",
      floor: 4,
      targetFloor: 4,
      kills: 2,
      target: 2,
      accepted: true,
      completed: true,
      claimed: false
    }],
    narrative: { relations: { merchants: 2 }, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 2, factionLeanings: {} },
    log: []
  };
  claimQuestReward("merchantRoute");
  assert.strictEqual(state.narrative.merchantTrust, 3, "merchant quests should build long-term merchant trust");

  state = {
    floor: 6,
    gold: 0,
    keys: 0,
    inventory: [],
    quests: [{
      id: "merchantCache",
      giver: "shop",
      floor: 6,
      targetFloor: 6,
      kills: 2,
      target: 2,
      accepted: true,
      completed: true,
      claimed: false
    }],
    questChains: {},
    narrative: { relations: { merchants: 0 }, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
    log: []
  };
  claimQuestReward("merchantCache");
  assert(state.inventory.some((entry) => entry.kind === "teleport"), "merchant cache should reward a teleport beacon");
  assert(state.inventory.some((entry) => entry.effect === "mp"), "merchant cache should reward a mana potion");
  assert.strictEqual(state.questChains.merchantCache, 1, "merchant cache should record chain progress");

  state = {
    floor: 2,
    gold: 200,
    player: { x: 1, y: 1 },
    map: { cells: [[{ x: 1, y: 1, terrain: "floor", object: { type: "shop", sellsUniversalKey: true } }]] },
    inventory: [],
    equipment: emptyEquipment(),
    stats: { atk: 0, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    narrative: { relations: { merchants: 6 }, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 6, factionLeanings: {} },
    log: []
  };
  openMerchant();
  assert(modalState().body.includes("信任 6"), "merchant dialogue should surface long-term merchant trust");

  state = {
    floor: 1,
    classId: "warrior",
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    stats: { atk: 0, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    quests: [{ id: "rescueRoom", giver: "questNpc", floor: 1, roomId: "room-1-0", accepted: true, completed: false, claimed: false, kills: 1, target: 1, roomCleared: true }],
    narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
    log: []
  };
  openRescueNpc({ type: "rescueNpc", npcName: "矿工托兰", roomId: "room-1-0" });
  assert(state.narrative.rescuedNpcIds.length > 0, "rescue completion should persist the rescued npc id");

  state = {
    floor: 1,
    classId: "warrior",
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    stats: { atk: 1, mag: 0, def: 20, res: 10, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    currentEnemy: { type: "monster", name: "Turn Dummy", hp: 200, maxHp: 200, atk: 1, def: 0 },
    log: []
  };
  render = () => {};
  const realDateNowForTurnLock = Date.now;
  Date.now = () => realDateNowForTurnLock() + 3000;
  attackEnemy("attack");
  const waitingAfterPlayerAction = renderBattleCommandPanel();
  Date.now = realDateNowForTurnLock;
  state.currentEnemy = null;
  assert(waitingAfterPlayerAction.includes("battle-timeline-node enemy"), "battle command panel should switch to enemy timeline state after player damage");
  assert(waitingAfterPlayerAction.includes("预备"), "battle command panel should show a useful enemy intent state");
  assert(waitingAfterPlayerAction.includes("disabled title="), "battle actions should be disabled right after the player action ends");

  state = {
    floor: 1,
    classId: "warrior",
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    stats: { atk: 1, mag: 0, def: 0, res: 0, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    currentEnemy: { type: "monster", name: "Skill Dummy", hp: 40, maxHp: 40, atk: 12, def: 0, skills: [{ id: "slam", name: "重击", type: "damage", power: 1, chance: 1 }] },
    log: []
  };
  Math.random = () => 0.99;
  enemyTurn(state.currentEnemy);
  Math.random = randomBeforeCombatRules;
  const enemyActionFeed = renderBattleCommandPanel();
  assert(enemyActionFeed.includes("battle-timeline-node enemy"), "battle command panel should include enemy action timeline nodes");
  assert(enemyActionFeed.includes("Skill Dummy使用重击"), "enemy action timeline should show the skill the enemy used");
  assert(enemyActionFeed.includes("造成"), "enemy action timeline should show the result of the enemy action");

  const tutorialMap = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
    x,
    y,
    terrain: x === 0 || y === 0 || x === 4 || y === 4 ? "wall" : "floor",
    object: null,
    seen: true,
    visible: true
  })));
  state = {
    floor: 1,
    classId: "warrior",
    player: { x: 1, y: 1 },
    facing: "down",
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    gold: 0,
    keys: 0,
    universalKeys: 0,
    stats: { atk: 60, mag: 0, def: 20, res: 10, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    materials: {},
    runes: {},
    quests: [],
    lore: { chapters: [], pages: [] },
    map: { size: 5, cells: tutorialMap },
    currentEnemy: null,
    tutorial: { step: "move", completed: [] },
    log: []
  };
  showEvent = () => {};
  showModal = () => {};
  render = () => {};
  playSound = () => {};
  syncMusicToGame = () => {};
  move(1, 0);
  assert.strictEqual(state.tutorial.step, "loot", "tutorial should advance after the first successful move");
  const realRandomForTutorial = Math.random;
  try {
    Math.random = () => 0.5;
    resolveCell({ object: { type: "chest" } });
  } finally {
    Math.random = realRandomForTutorial;
  }
  assert.strictEqual(state.tutorial.step, "battle", "tutorial should advance after opening a chest");
  state.tutorial.step = "equip";
  state.tutorial.completed.push("battle");
  state.inventory = [item("Tutorial Sword", "weapon", "普通", { atk: 1 })];
  equipItem(state.inventory[0].id);
  assert.strictEqual(state.tutorial.step, "quest", "tutorial should advance after equipping loot");
  acceptQuest("wardenErrand", { type: "questNpc", questId: "wardenErrand", targetFloor: 1 });
  assert.strictEqual(state.tutorial.step, "done", "tutorial should complete after accepting a quest");

  state = {
    floor: 24,
    classId: "warrior",
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    gold: 0,
    keys: 0,
    stats: { atk: 20, mag: 0, def: 8, res: 4, spd: 0, luk: 0 },
    equipment: emptyEquipment(),
    inventory: [],
    quests: [],
    narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
    log: []
  };
  const sealQuest = acceptQuest("wardenSeal", { type: "questNpc", questId: "wardenSeal", targetFloor: 24 });
  assert.strictEqual(sealQuest.target, 2, "warden seal branch should create a normal kill objective");
  sealQuest.kills = 2;
  sealQuest.completed = true;
  claimQuestReward("wardenSeal");
  assert.strictEqual(state.keys, 1, "warden seal branch should reward a rune key");
  assert.strictEqual(state.narrative.factionLeanings.wardens, 1, "warden seal branch should affect warden leaning");

  state = {
    floor: 42,
    classId: "ranger",
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    gold: 0,
    keys: 0,
    stats: { atk: 20, mag: 0, def: 8, res: 4, spd: 12, luk: 8 },
    equipment: emptyEquipment(),
    inventory: [],
    quests: [],
    narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
    lore: { chapters: [], pages: [] },
    log: []
  };
  const traceQuest = acceptQuest("survivorTrace", { type: "questNpc", questId: "survivorTrace", targetFloor: 42 });
  traceQuest.kills = 2;
  traceQuest.completed = true;
  claimQuestReward("survivorTrace");
  assert(state.inventory.some((entry) => entry.kind === "potion"), "survivor trace branch should pay out supplies");
  assert.strictEqual(state.narrative.factionLeanings.survivors, 1, "survivor trace branch should affect survivor leaning");
  const discoveredPages = [];
  for (let i = 0; i < 8; i++) {
    const page = discoverLorePage(state, i % 2 === 0 ? "elite" : "lockedChest");
    if (page) discoveredPages.push(page.id);
  }
  assert(discoveredPages.includes("class-echoes"), "mid-run lore should include class echo storytelling");
  assert(discoveredPages.includes("survivor-cairn"), "mid-run lore should include survivor route storytelling");
`,
  context
);
