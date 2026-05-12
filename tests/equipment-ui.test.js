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
  assert(compare.includes("装备对比"), "equipment comparison should be labeled as a comparison");
  assert(compare.includes("评分差"), "score delta should be labeled as a delta instead of item score");
  assert(compare.includes("评分差 +"), "inventory equipment should show positive score delta");
  assert(compare.includes("攻击差 +3"), "inventory equipment should compare changed stats");
  assert(equippedStateBadge(), "equipment rows should have an equipped badge");
  assert.strictEqual(canUnequipSlot("weapon"), true, "equipped slot can be unequipped");
  state.inventory.push(
    { id: "potion", kind: "potion", name: "Potion", effect: "hp", amount: 20 },
    upgrade
  );
  state.materials = { "强化石": 2, "魔尘": 1 };
  state.runes = { "火焰1": 3 };
  assert(runeEffectText("火焰1").includes("攻击"), "rune effect text should describe the stat bonus");
  const inventory = inventoryGroupMarkup();
  assert(inventory.includes("equipment-compare inline-equipment-compare"), "inventory equipment rows should directly show comparison deltas");
  assert(inventory.includes("equipment-compare-corner"), "inventory equipment comparison should live in the row corner");
  assert(inventory.includes("compare-badge compare-badge-up"), "better equipment should show a persistent green up badge");
  assert(inventory.includes("compare-arrow"), "equipment comparison badge should include a directional arrow mark");
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

  state.classId = "warrior";
  state.mp = 0;
  const battleSkills = renderSkillActionButtons("battle");
  assert(battleSkills.includes("battle-skill-card"), "battle skills should render as dedicated skill cards");
  assert(battleSkills.includes("MP不足"), "battle skill cards should explain when MP is insufficient");
  state.hp = 120;
  state.stats = { ...CLASSES.warrior.stats };
  state.equipment = {
    ...emptyEquipment(),
    weapon: { id: "old", kind: "equip", name: "Old Sword", slot: "weapon", quality: "普通", stats: { atk: 5 }, runeSlots: 0, runes: [], level: 0 }
  };
  state.currentEnemy = { type: "monster", name: "Slime", hp: 24, maxHp: 24, atk: 8, def: 3 };
  const battleCommands = renderBattleCommandPanel(32);
  assert(battleCommands.includes("battle-auto-panel"), "auto battle should live in a separate tactics panel");
  assert(!battleCommands.includes("battle-action primary"), "normal attack should not be styled as the recommended action");
  assert(battleCommands.includes("battle-win-rate"), "auto battle action should show the current win rate beside the button");
  assert(battleCommands.includes("%"), "auto battle win rate should be shown as a percentage");
  assert(ASSETS.shop.includes("merchant"), "merchant map icon should use a dedicated dungeon character sprite");
  assert(ASSETS.questNpc && ASSETS.questNpc !== ASSETS.shop, "quest NPC should not reuse the merchant icon");
  assert(ASSETS.ranger.includes("ranger") && !ASSETS.ranger.endsWith("player-ranger.png"), "ranger should use a refreshed dungeon character icon");
  assert(ASSETS.floor && ASSETS.wall, "floor and wall should have dedicated dungeon texture assets");
  assert.strictEqual(objectSprite({ type: "questNpc" }).includes(ASSETS.questNpc), true, "quest NPC sprite should render its own asset");
  const downgrade = { id: "bad", kind: "equip", name: "Bad Sword", slot: "weapon", quality: "普通", stats: { atk: 1 }, runeSlots: 0, runes: [], level: 0 };
  const worseCompare = equipmentCompareText(downgrade, "inline-equipment-compare");
  assert(worseCompare.includes("compare-badge compare-badge-down"), "worse equipment should show a persistent red down badge");
  assert(worseCompare.includes("↓"), "worse equipment should use a down arrow");

  render = () => {};
  unequipItem("weapon");
  assert.strictEqual(state.equipment.weapon, null, "unequip clears the slot");
  assert(state.inventory.some((entry) => entry.id === "old"), "unequip returns item to inventory");
`, context);

const css = fs.readFileSync("styles.css", "utf8");
const gameSource = fs.readFileSync("js/game.js", "utf8");
assert(!css.includes(".tile.reachable::after"), "movable tiles should not render a persistent reachable highlight dot");
assert(!css.includes("better-equipment:hover::after"), "equipment upgrade markers should not be hover-only");
assert(css.includes(".door::after"), "door art should include a layered dark dungeon overlay");
assert(css.includes("bottom: 24px"), "interaction toasts should be anchored low instead of crowding the top edge");
assert(!gameSource.includes('title="${label}"'), "map object hints should avoid native browser tooltips that crowd the upper corner");
