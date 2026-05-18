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
  assert.strictEqual(starterInventory("warrior").filter((entry) => entry.kind === "equip").length, Object.values(starterEquipment("warrior")).filter(Boolean).length, "starter gear should be placed in inventory");
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
  assert.strictEqual(state.skillCooldowns.heavy, 1, "skills should keep turn-based cooldown after the enemy response");
  attackEnemy("skill", "heavy", true);
  Date.now = realDateNowForCooldown;
  Math.random = randomBeforeCombatRules;
  assert.strictEqual(state.mp, mpAfterHeavy, "skills on cooldown should not spend mp again");

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

  state.map.rooms = [{ id: "room-8-1", name: "12号房" }];
  assert.strictEqual(roomDoorLabel({ terrain: "door", roomId: "room-8-1" }), "12", "room doors should expose only the compact room number");
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
  Math.random = randomBeforeElementTest;

  Math.random = () => 0.1;
  state = { floor: 8 };
  const skilledEnemy = makeEnemy(true);
  assert(skilledEnemy.element, "generated enemies should carry an elemental identity");
  assert(Array.isArray(skilledEnemy.weaknesses) && skilledEnemy.weaknesses.length > 0, "enemy elements should expose weaknesses");
  assert(skilledEnemy.skills?.length > 0, "mid-floor elite enemies should have monster skills");
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
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "elite enemies above 60% win rate should be eligible for auto battle");
  state.currentEnemy = { type: "monster", name: "Armored Guard", hp: 20, maxHp: 20, atk: 4, def: 1, affix: { id: "armored", name: "坚甲" } };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "affixed enemies above 60% win rate should be eligible for auto battle");
  state.currentEnemy = { type: "monster", name: "Skilled Guard", hp: 20, maxHp: 20, atk: 4, def: 1, skills: [{ id: "harden", name: "Harden", type: "guard" }] };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, true, "skilled enemies above 60% win rate should be eligible for auto battle");
  state.currentEnemy = { type: "monster", name: "Overwhelming Guard", hp: 240, maxHp: 240, atk: 46, def: 20 };
  assert.strictEqual(autoBattlePolicy(state.currentEnemy).allowed, false, "auto battle should stop when the win rate is 60% or lower");
  state.currentEnemy = { type: "monster", name: "Armored Guard", hp: 20, maxHp: 20, atk: 4, def: 1, affix: { id: "armored", name: "坚甲" } };
  autoBattle();
  assert(modalState().body.includes("胜率"), "auto battle confirmation should show the estimated win rate");
  assert(modalState().actions.some((action) => action.text.includes("开始一键战斗")), "auto battle should be available above 60% win rate");

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
  state.gold = 58;
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
  state.quest = { id: "wardenErrand", floor: 1, kills: 1, target: 2, claimed: false };
  state.quests = [];
  const rewards = [];
  recordQuestKill({ type: "monster", name: "Slime" }, rewards);
  assert.strictEqual(state.quest.kills, 1, "legacy quest should not progress before being accepted into the quest list");

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
  const unlockedLore = unlockLoreChaptersForFloor(state);
  assert.strictEqual(unlockedLore[0]?.id, "threshold", "new adventures should unlock the opening lore chapter");
  const firstPage = discoverLorePage(state, "chest");
  assert.strictEqual(firstPage?.id, "threshold-scratch", "chests should be able to reveal eligible lore pages");
  const loreList = renderQuestList();
  assert(loreList.includes("地牢残页"), "task tab should include the lore archive");
  assert(loreList.includes("入口刻痕"), "discovered lore pages should render in the task tab");

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
  assert(waitingAfterPlayerAction.includes("battle-turn-banner waiting enemy"), "battle command panel should switch to the enemy turn after player damage");
  assert(waitingAfterPlayerAction.includes("准备反击"), "battle command panel should tell the player that the enemy is preparing to respond");
  assert(waitingAfterPlayerAction.includes("disabled title="), "battle actions should be disabled right after the player action ends");
`,
  context
);
