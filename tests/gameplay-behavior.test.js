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
  saveCurrentFloor();
  state.floor = 4;
  generateFloor();
  state.floor = 3;
  enterFloor("up");
  assert.strictEqual(state.map.theme, originalTheme, "returning to an explored floor should restore its saved map");
  assert.strictEqual(state.map.cells[2][2].object?.marker, "persistent", "returning to an explored floor should preserve objects");

  state = { floor: 3 };
  const elite = makeEnemy(true);
  assert.strictEqual(Number.isInteger(elite.hp), true, "enemy hp should be an integer");
  assert.strictEqual(Number.isInteger(elite.maxHp), true, "enemy max hp should be an integer");

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
  let dangerModal = null;
  closeModal = () => {};
  showModal = (title, body, actions) => { dangerModal = { title, body, actions }; };
  const eliteEncounter = { type: "elite", name: "Elite Guard", hp: 40, maxHp: 40, atk: 12, def: 4 };
  resolveCell({ object: eliteEncounter });
  assert.strictEqual(state.currentEnemy, null, "elite monsters should wait for confirmation before battle");
  assert(dangerModal.title.includes("危险"), "elite encounter modal should warn about danger");
  assert(dangerModal.actions.some((action) => action.text.includes("进入战斗")), "elite encounter modal should offer battle confirmation");
  dangerModal.actions.find((action) => action.text.includes("进入战斗")).action();
  assert.strictEqual(state.currentEnemy, eliteEncounter, "confirming an elite encounter should enter battle");

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
  state.map.cells[1][1].object = eliteEncounter;
  move(-1, 0);
  assert.deepStrictEqual(state.player, { x: 2, y: 1 }, "elite confirmation should not move onto the enemy tile before approval");
  dangerModal.actions.find((action) => action.text.includes("进入战斗")).action();
  assert.deepStrictEqual(state.player, { x: 1, y: 1 }, "confirming an elite encounter should move onto the enemy tile");

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
  let merchantOpened = false;
  const realOpenMerchant = openMerchant;
  openMerchant = () => { merchantOpened = true; };
  render = () => {};
  move(-1, 0);
  assert.strictEqual(merchantOpened, true, "moving into a merchant should open the merchant interaction");
  assert.deepStrictEqual(state.player, { x: 2, y: 1 }, "merchant should block movement instead of sharing the player tile");

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
  move(-1, 0);
  assert.deepStrictEqual(state.player, { x: 2, y: 1 }, "locked chest without a key should block movement");
  state.facing = "right";
  move(0, 1);
  assert.strictEqual(state.facing, "right", "vertical movement should not override an existing horizontal facing");
  state.player = { x: 2, y: 1 };
  assert.strictEqual(state.map.cells[1][1].object?.type, "lockedChest", "blocked locked chest should remain on the map");

  state.keys = 1;
  move(-1, 0);
  assert.deepStrictEqual(state.player, { x: 1, y: 1 }, "locked chest with a key should allow movement after opening");
  assert.strictEqual(state.map.cells[1][1].object, null, "opened locked chest should be removed from the map");

  const gateCell = { terrain: "floor", object: { type: "fenceGate" } };
  let eventTitle = null;
  let eventBody = null;
  showEvent = (title, body) => { eventTitle = title; eventBody = body; };
  state.keys = 0;
  openFenceGate(gateCell);
  assert.strictEqual(gateCell.object?.type, "fenceGate", "fence gate should remain closed without a key");
  assert(eventBody.includes("钥匙守卫") && eventBody.includes("委托人"), "locked fence hint should explain key sources");
  state.keys = 1;
  openFenceGate(gateCell);
  assert.strictEqual(gateCell.object, null, "fence gate should open when the player has a key");
  assert.strictEqual(state.keys, 1, "opening the gate should reveal the chest path without spending the chest key");
  assert(tileLabel({ seen: true, terrain: "floor", object: { type: "lockedChest" } }).includes("钥匙守卫"), "locked chest label should hint at the key guardian");

  state.floor = 1;
  state.quest = { id: "wardenErrand", floor: 1, kills: 1, target: 2, claimed: false };
  state.quests = [];
  const rewards = [];
  recordQuestKill({ type: "monster", name: "Slime" }, rewards);
  assert.strictEqual(state.quest.kills, 1, "legacy quest should not progress before being accepted into the quest list");

  let questModal = null;
  showModal = (title, body, actions) => { questModal = { title, body, actions }; };
  openQuestNpc();
  assert(questModal.actions.some((action) => action.text.includes("接受")), "quest NPC should offer an accept action");
  questModal.actions.find((action) => action.text.includes("接受")).action();
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
  questModal.actions.find((action) => action.text.includes("领取")).action();
  assert.strictEqual(state.quests[0].claimed, true, "quest NPC should mark completed rewards as claimed");
  assert.strictEqual(state.keys, 2, "quest NPC should reward a rune key");

  const questList = renderQuestList();
  assert(questList.includes("quest-list"), "task tab should render a quest list");
  assert(questList.includes("已领取"), "claimed quests should remain visible in the task list");

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

  state = {
    floor: 1,
    gold: 40,
    keys: 0,
    inventory: [],
    quests: [],
    log: []
  };
  let merchantModal = null;
  showModal = (title, body, actions) => { merchantModal = { title, body, actions }; };
  openMerchant = realOpenMerchant;
  openMerchant();
  assert(merchantModal.actions.some((action) => action.text.includes("商店")), "merchant with a task should keep a shop action");
  assert(merchantModal.actions.some((action) => action.text.includes("任务")), "merchant with a task should offer a task action");
  merchantModal.actions.find((action) => action.text.includes("任务")).action();
  assert(merchantModal.actions.some((action) => action.text.includes("接受")), "merchant task action should open an accept flow");
`, context);
