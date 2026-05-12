const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = {
  assert,
  console,
  document: { getElementById: () => ({}) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  window: { crypto: { randomUUID: () => "test-id" } }
};
context.window.window = context.window;
context.window.document = context.document;

vm.createContext(context);
vm.runInContext(fs.readFileSync("js/data.js", "utf8"), context);
vm.runInContext(fs.readFileSync("js/game.js", "utf8"), context);
vm.runInContext(`
  const empty = emptyEquipment();
  assert(SLOTS.every((slot) => empty[slot] === null), "new heroes should start with empty equipment slots");
  assert.strictEqual(starterInventory("warrior").filter((entry) => entry.kind === "equip").length, Object.values(starterEquipment("warrior")).filter(Boolean).length, "starter gear should be placed in inventory");

  const seenMonster = { x: 1, y: 1, terrain: "floor", seen: true, visible: false, object: { type: "monster" } };
  assert.strictEqual(shouldShowMapObject(seenMonster), true, "seen monsters should remain visible while they are still on the main viewport");

  const hiddenTrap = { x: 1, y: 2, terrain: "floor", seen: true, visible: true, object: { type: "trap" } };
  assert.strictEqual(shouldShowMapObject(hiddenTrap), false, "untriggered traps should stay hidden");

  state = {
    floor: 2,
    hp: 100,
    gold: 0,
    stats: { luk: 0 },
    map: {
      cells: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
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
`, context);
