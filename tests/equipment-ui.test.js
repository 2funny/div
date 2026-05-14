const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { createTestContext } = require("./helpers/test-context");

const storage = {};
const context = createTestContext(assert, storage);

vm.createContext(context);
vm.runInContext(fs.readFileSync("tests/.generated/runtime-harness.js", "utf8"), context);
vm.runInContext(
  `
  assert.strictEqual(audioEnabled, false, "audio should be muted by default on first open");
  assert.strictEqual(saveSlots().length, 4, "start screen should expose multiple save slots");
  assert(saveSlotCard({ id: "slot-2", label: "存档 2", meta: null }).includes("空存档"), "empty save slots should invite new games");
  assert(CLASSES.warrior.hp < 60 && CLASSES.mage.hp < 40, "classes should start from a low-value baseline");
  assert(CLASSES.warrior.role && CLASSES.mage.primary && CLASSES.ranger.growth?.primary, "classes should expose clear role, primary stat, and growth identity");
  state = {
    classId: "warrior",
    floor: 1,
    level: 1,
    hp: 40,
    maxHp: 46,
    mp: 10,
    maxMp: 12,
    equipment: {
      weapon: { id: "old", kind: "equip", name: "Old Sword", slot: "weapon", quality: "普通", stats: { atk: 5 }, runeSlots: 0, runes: [], level: 0 }
    },
    inventory: [],
    log: []
  };
  currentSaveSlot = "slot-2";
  saveGame(false);
  assert(localStorage.getItem(saveSlotKey("slot-2")), "saving should write the active slot instead of only a single global save");
  assert(saveSlots().find((slot) => slot.id === "slot-2").meta, "saving should update the slot list metadata");
  const savedState = state;
  state = null;
  assert.strictEqual(loadGame("slot-2"), true, "loading a selected slot should restore that save");
  assert.strictEqual(currentSaveSlot, "slot-2", "loading a slot should make it the active save target");
  assert.strictEqual(state.classId, savedState.classId, "loading should restore the selected slot state");
  state = null;
  getElement("map").innerHTML = "";
  continueSavedGame("slot-2");
  assert.strictEqual(state.classId, savedState.classId, "continue should restore the selected slot in one click");
  assert(getElement("map").innerHTML.length > 0, "continue should render the game view immediately after loading");

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
  assert(inventory.includes("equipment-compare score-only-compare inline-equipment-compare"), "inventory equipment rows should show compact score-only comparison");
  assert(inventory.includes("equipment-compare-corner"), "inventory equipment comparison should live in the row corner");
  assert(inventory.includes("compare-badge compare-badge-up"), "better equipment should show a persistent green up badge");
  assert(inventory.includes("compare-arrow"), "equipment comparison badge should include a directional arrow mark");
  assert(!inventory.includes("攻击差 +3"), "full stat deltas should stay out of compact inventory rows");
  assert(inventory.includes("inventory-filter"), "equipment inventory should include a type filter");
  assert(inventory.includes('<option value="weapon"'), "equipment filter should include weapon slot");
  activeEquipmentFilter = "armor";
  assert(!inventoryGroupMarkup().includes("New Sword"), "equipment filter should hide other slots");
  activeEquipmentFilter = "all";
  assert(inventory.includes('inventory-subtabs'), "inventory should use a second-level category menu");
  assert(inventory.includes('data-inventory-tab="potions"'), "inventory menu should include potions");
  assert(inventory.includes('data-inventory-tab="equipment"'), "inventory menu should include equipment");
  assert(inventory.includes('data-inventory-tab="materials"'), "inventory menu should include materials");
  assert(inventory.includes('data-inventory-tab="runes"'), "inventory menu should include runes");
  assert(inventory.includes('inventory-group-equipment'), "inventory should show the active equipment group");
  activeInventoryTab = "materials";
  const materialsMarkup = inventoryGroupMarkup();
  assert(materialsMarkup.includes('<span class="item-quantity">x2</span>'), "material counts should render at the row edge");
  assert(!materialsMarkup.includes("数量 2"), "material counts should not be written into the attribute text");
  activeInventoryTab = "runes";
  const runesMarkup = inventoryGroupMarkup();
  assert(runesMarkup.includes('<span class="item-quantity">x3</span>'), "rune counts should render at the row edge");
  assert(runesMarkup.indexOf('<span class="item-quantity">x3</span>') < runesMarkup.indexOf("confirmCraftRune"), "rune counts should sit before the craft action");
  assert(!runesMarkup.includes("数量 3"), "rune counts should not be written into the attribute text");
  activeInventoryTab = "equipment";
  assert(!inventory.includes("confirmDisassembleEquipment"), "inventory equipment rows should not keep a persistent disassemble action");
  assert(inventory.includes("confirmSellEquipment"), "inventory equipment rows should support selling");
  render = () => {};
  showEvent = (title, body) => { eventTitle = title; eventBody = body; };
  let eventTitle = "";
  let eventBody = "";
  const junk = { id: "junk", kind: "equip", name: "Junk Ring", slot: "ring", quality: "普通", stats: { luk: 1 }, runeSlots: 0, runes: [], level: 0 };
  state.inventory.push(junk);
  state.map = {
    size: 3,
    cells: [
      [{ x: 0, y: 0, terrain: "floor", object: null }, { x: 1, y: 0, terrain: "floor", object: null }, { x: 2, y: 0, terrain: "floor", object: null }],
      [{ x: 0, y: 1, terrain: "floor", object: null }, { x: 1, y: 1, terrain: "floor", object: null }, { x: 2, y: 1, terrain: "floor", object: null }],
      [{ x: 0, y: 2, terrain: "floor", object: null }, { x: 1, y: 2, terrain: "floor", object: null }, { x: 2, y: 2, terrain: "floor", object: null }]
    ]
  };
  state.player = { x: 1, y: 1 };
  const goldBeforeSell = state.gold || 0;
  sellEquipment("junk");
  assert.strictEqual(state.gold || 0, goldBeforeSell, "selling away from merchant should not grant gold");
  assert(state.inventory.some((entry) => entry.id === "junk"), "selling away from merchant should keep equipment");
  assert(getElement("modalTitle").textContent.includes("商人"), "selling away from merchant should explain the merchant requirement");
  state.map = {
    size: 3,
    cells: [
      [{ x: 0, y: 0, terrain: "floor", object: null }, { x: 1, y: 0, terrain: "floor", object: null }, { x: 2, y: 0, terrain: "floor", object: null }],
      [{ x: 0, y: 1, terrain: "floor", object: null }, { x: 1, y: 1, terrain: "floor", object: null }, { x: 2, y: 1, terrain: "floor", object: { type: "shop" } }],
      [{ x: 0, y: 2, terrain: "floor", object: null }, { x: 1, y: 2, terrain: "floor", object: null }, { x: 2, y: 2, terrain: "floor", object: null }]
    ]
  };
  state.player = { x: 1, y: 1 };
  sellEquipment("junk");
  assert((state.gold || 0) > goldBeforeSell, "selling beside a merchant should grant gold");
  assert(!state.inventory.some((entry) => entry.id === "junk"), "sold equipment should leave inventory");
  const scrap = { id: "scrap", kind: "equip", name: "Scrap Armor", slot: "armor", quality: "稀有", stats: { def: 4 }, runeSlots: 1, runes: [], level: 1 };
  state.inventory.push(scrap);
  const dustBefore = state.materials["魔尘"] || 0;
  disassembleEquipment("scrap");
  assert((state.materials["魔尘"] || 0) > dustBefore, "disassembling equipment should grant material dust");
  assert(!state.inventory.some((entry) => entry.id === "scrap"), "disassembled equipment should leave inventory");
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
  state.map = {
    size: 5,
    rooms: [{ id: "room-1-0", name: "1号房" }],
    cells: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
      x, y, terrain: "floor", object: null, seen: true, visible: true
    })))
  };
  state.map.cells[2][1].terrain = "door";
  state.map.cells[2][1].roomId = "room-1-0";
  state.map.cells[2][2].roomId = "room-1-0";
  state.map.cells[2][3].terrain = "door";
  state.map.cells[2][3].roomId = "room-1-0";
  state.map.cells[2][3].object = { type: "lockedDoor", keyId: "door-a", keyName: "1号房钥匙", roomName: "1号房" };
  state.player = { x: 0, y: 0 };
  state.classId = "warrior";
  renderMinimap();
  const miniMarkup = getElement("minimap").innerHTML;
  assert(miniMarkup.includes("mini-room-label"), "minimap should stamp explored rooms with compact room numbers");
  assert(miniMarkup.includes("mini-door"), "minimap should mark normal room doors");
  assert(miniMarkup.includes("mini-locked-door"), "minimap should mark locked room doors");

  state.classId = "warrior";
  state.mp = 0;
  const battleSkills = renderSkillActionButtons("battle");
  assert(battleSkills.includes("battle-skill-card"), "battle skills should render as dedicated skill cards");
  assert(battleSkills.includes("MP不足"), "battle skill cards should explain when MP is insufficient");
  assert(battleSkills.includes("skill-preview"), "battle skills should show direct outcome previews");
  assert(!battleSkills.includes("倍率"), "skill UI should avoid exposing internal multiplier wording");
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
  state.inventory = [
    potion("Small Potion", "hp", 40),
    potion("Small Potion", "hp", 40),
    potion("Small Mana", "mp", 25)
  ];
  const battleSupplies = renderBattleCommandPanel(32);
  assert(battleSupplies.includes("battle-consumable-panel"), "battle commands should include a dedicated consumable panel");
  assert(battleSupplies.includes("useBattlePotion"), "battle potion shortcuts should be usable directly from combat");
  assert(battleSupplies.includes("Small Potion"), "battle potion shortcuts should show potion names");
  assert(battleSupplies.includes("x2"), "battle potion shortcuts should stack duplicate potion names");
  activeInventoryTab = "potions";
  const potionMarkup = inventoryGroupMarkup();
  assert(potionMarkup.includes("inventory-card"), "inventory rows should use compact card styling");
  assert(potionMarkup.includes("item-tags"), "inventory consumables should show structured stat tags");
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
`,
  context
);

const css = fs.readFileSync("src/styles.css", "utf8");
const runtimeSource = fs.readFileSync("src/game/runtime.ts", "utf8");
const bindEventsSource = fs.readFileSync("src/ui/bindEvents.ts", "utf8");
const audioRuntimeSource = fs.readFileSync("src/game/audioRuntime.ts", "utf8");
const audioSource = fs.readFileSync("src/game/audioProfiles.ts", "utf8");
const weatherSource = fs.readFileSync("src/game/weatherCanvas.ts", "utf8");
assert(
  !css.includes(".tile.reachable::after"),
  "movable tiles should not render a persistent reachable highlight dot"
);
assert(
  !css.includes("better-equipment:hover::after"),
  "equipment upgrade markers should not be hover-only"
);
assert(css.includes(".door::after"), "door art should include a layered dark dungeon overlay");
assert(
  css.includes("bottom: 24px"),
  "interaction toasts should be anchored low instead of crowding the top edge"
);
assert(
  !runtimeSource.includes('title="${label}"'),
  "map object hints should avoid native browser tooltips that crowd the upper corner"
);
assert(
  audioSource.includes("export const MASTER_VOLUME = 0.92") ||
    fs.readFileSync("src/game/data.ts", "utf8").includes("MASTER_VOLUME = 0.92"),
  "master audio should be louder than the previous quiet mix"
);
assert(
  audioRuntimeSource.includes("function startBattleMusic"),
  "game audio should include a separate battle music layer"
);
assert(
  audioRuntimeSource.includes('musicMode === "battle"'),
  "music should switch into battle mode during encounters"
);
assert(
  audioRuntimeSource.includes("scheduleDungeonMotif"),
  "dungeon BGM should include an audible repeating motif instead of only low ambience"
);
assert(
  audioRuntimeSource.includes("playDungeonChord"),
  "dungeon BGM should play an audible entrance chord outside battle"
);
assert(
  css.includes(".item-side"),
  "inventory cards should keep counts and actions in a stable right rail"
);
assert(
  css.includes(".save-slot-grid"),
  "start screen should present save slots as a clear selectable grid"
);
assert(css.includes(".start-hero"), "start screen should have a dedicated save hub header");
assert(
  css.includes(".map-stage.effect-rain::before"),
  "rainy special floors should render a weather overlay"
);
assert(
  css.includes(".map-stage.effect-snow::before"),
  "snowy special floors should render a weather overlay"
);
assert(
  css.includes(".map-stage.effect-lava::before"),
  "lava special floors should render a heat overlay"
);
assert(css.includes(".weather-canvas"), "special floors should mount a canvas weather layer");
assert(
  weatherSource.includes("drawRain"),
  "rainy special floors should draw rain as particles instead of CSS stripes"
);
assert(
  weatherSource.includes("drawSnow"),
  "snowy special floors should draw drifting snow particles"
);
assert(weatherSource.includes("drawLava"), "lava special floors should draw heat glow and embers");
assert(!css.includes("@keyframes weatherRain"), "rain should not rely on old stripe animation");
assert(
  css.includes(".effect-snow .floor"),
  "snowy special floors should visually frost floor tiles"
);
assert(css.includes(".effect-snow .wall"), "snowy special floors should visually frost wall tiles");
assert(css.includes(".lava"), "lava special floors should render dedicated lava terrain");
assert(css.includes("@keyframes lavaTileFlow"), "lava terrain should have a subtle animated glow");
assert(css.includes(".admin-panel"), "admin mode should have a dedicated panel layout");
assert(
  css.includes(".admin-floating-button"),
  "admin mode should create a temporary floating entry button after unlock"
);
assert(
  runtimeSource.includes("function openAdminPanel"),
  "runtime should expose a hidden admin panel"
);
assert(
  runtimeSource.includes("adminApplyFloorEffect"),
  "admin panel should be able to change the current floor effect"
);
assert(
  bindEventsSource.includes("import.meta.env.DEV"),
  "admin mode should only be reachable in dev builds"
);
assert(
  bindEventsSource.includes("unlockAdminButton"),
  "typing the hidden admin code should unlock a session-only button"
);
assert(
  bindEventsSource.includes("document.body.appendChild(button)"),
  "admin button should be created dynamically instead of persisted"
);
assert(
  !bindEventsSource.includes('"runeadmin"'),
  "admin code should not be written as a plaintext string"
);
