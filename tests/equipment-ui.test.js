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
  state = {
    equipment: {
      weapon: { id: "old", kind: "equip", name: "Old Sword", slot: "weapon", quality: "普通", stats: { atk: 5 }, runeSlots: 0, runes: [], level: 0 }
    },
    inventory: [],
    log: []
  };

  const upgrade = { id: "new", kind: "equip", name: "New Sword", slot: "weapon", quality: "优秀", stats: { atk: 8 }, runeSlots: 0, runes: [], level: 0 };
  const compare = equipmentCompareText(upgrade);
  assert(compare.includes("评分 +"), "inventory equipment should show positive score delta");
  assert(compare.includes("攻击 +3"), "inventory equipment should compare changed stats");
  assert(equippedStateBadge(), "equipment rows should have an equipped badge");
  assert.strictEqual(canUnequipSlot("weapon"), true, "equipped slot can be unequipped");
  state.inventory.push(
    { id: "potion", kind: "potion", name: "Potion", effect: "hp", amount: 20 },
    upgrade
  );
  state.materials = { "强化石": 2, "魔尘": 1 };
  state.runes = { "火焰1": 3 };
  const inventory = inventoryGroupMarkup();
  assert(inventory.includes('inventory-subtabs'), "inventory should use a second-level category menu");
  assert(inventory.includes('data-inventory-tab="potions"'), "inventory menu should include potions");
  assert(inventory.includes('data-inventory-tab="equipment"'), "inventory menu should include equipment");
  assert(inventory.includes('data-inventory-tab="materials"'), "inventory menu should include materials");
  assert(inventory.includes('data-inventory-tab="runes"'), "inventory menu should include runes");
  assert(inventory.includes('inventory-group-equipment'), "inventory should show the active equipment group");
  state.map = { size: 27, cells: [] };
  state.player = { x: 8, y: 8 };
  const mainBounds = mapViewBounds();
  assert.strictEqual(mainBounds.size, 15, "main map should render a large local viewport");
  assert(mainBounds.x > 0 && mainBounds.y > 0, "main map viewport should pan as the player moves");
  const overview = minimapOverviewBounds(mainBounds);
  assert.strictEqual(overview.size, 27, "minimap should cover the full floor");
  assert(overview.viewSize < 100, "full-floor minimap should show a smaller viewport frame");
  state.map = {
    size: 9,
    cells: Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => ({
      x, y, terrain: "floor", object: null, seen: false, visible: false
    })))
  };
  state.player = { x: 4, y: 4 };
  updateVisibility();
  assert.strictEqual(state.map.cells[4][4].seen, true, "player cell should be explored");
  assert.strictEqual(state.map.cells[0][0].seen, false, "far cells should remain unexplored");

  render = () => {};
  unequipItem("weapon");
  assert.strictEqual(state.equipment.weapon, null, "unequip clears the slot");
  assert(state.inventory.some((entry) => entry.id === "old"), "unequip returns item to inventory");
`, context);
