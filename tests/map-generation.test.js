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
  function reachableFloorCount(map, start) {
    const passable = (cell) => ["floor", "door"].includes(cell.terrain);
    const key = (cell) => cell.x + "," + cell.y;
    const visited = new Set([key(start)]);
    const queue = [start];
    while (queue.length) {
      const cell = queue.shift();
      for (const next of cardinalNeighbors(map, cell.x, cell.y)) {
        if (!passable(next) || visited.has(key(next))) continue;
        visited.add(key(next));
        queue.push(next);
      }
    }
    return visited.size;
  }

  const themeCoverage = new Map();
  for (const theme of THEMES) {
    assert(theme.name && theme.colorClass, "floor themes should define display names and map color classes");
    for (const floor of theme.floors) {
      assert(!themeCoverage.has(floor), "floor themes should not overlap floor ranges");
      themeCoverage.set(floor, theme);
    }
  }
  assert.strictEqual(themeCoverage.size, MAX_FLOOR, "floor themes should cover every configured floor");
  assert.strictEqual(themeCoverage.get(MAX_FLOOR).name, "符文王座", "final floor should keep the throne theme");
  assert(new Set(THEMES.map((theme) => theme.name)).size >= 8, "long runs should use varied floor theme names");

  state = {
    floor: 3,
    facing: "down",
    player: { x: 1, y: 1 }
  };
  generateFloor();
  const generated = state.map.cells;
  const mapSize = state.map.size;
  const generatedCells = generated.flat();
  const floorCells = generatedCells.filter((cell) => cell.terrain === "floor");
  const passableCells = generatedCells.filter((cell) => ["floor", "door"].includes(cell.terrain));
  const mainPathCells = generatedCells.filter((cell) => cell.mainPath);
  const stairsDown = generatedCells.find((cell) => cell.object?.type === "stairsDown");
  const stairsUp = generatedCells.find((cell) => cell.object?.type === "stairsUp");
  assert(mapSize >= MAP_SIZE_MIN && mapSize <= MAP_SIZE_MAX, "generated floor size should stay within the configured range");
  assert.strictEqual(generated.length, mapSize, "generated floor row count should match the map size");
  assert(floorCells.length / generatedCells.length < .58, "generated floor should not be an open field");
  assert(floorCells.length / generatedCells.length > .24, "generated floor should still have enough playable space");
  assert(mainPathCells.length >= mapSize + 8, "generated floor should have a clear main trunk path");
  assert.strictEqual(reachableFloorCount(generated, generated[1][1]), passableCells.length, "all playable floor cells should connect to the main route");
  assert(stairsDown, "generated floor should include a downstairs tile before the final floor");
  assert(stairsUp, "generated floors after the first should include an upstairs tile");
  assert.notDeepStrictEqual([stairsDown.x, stairsDown.y], [mapSize - 2, mapSize - 2], "downstairs should not be fixed in the lower-right corner");
  assert.notDeepStrictEqual([stairsUp.x, stairsUp.y], [1, 1], "upstairs should not be fixed in the upper-left corner");
  assert(distance(stairsDown, { x: 1, y: 1 }) >= 10, "downstairs should not be discoverable immediately from the starting area");
  assert(stairsDown.roomId || floorNeighborCount(generated, stairsDown.x, stairsDown.y) <= 1, "downstairs should prefer a room or route endpoint");
  const lockedDoors = generatedCells.filter((cell) => cell.object?.type === "lockedDoor");
  const roomEntrances = generatedCells.filter((cell) => cell.object?.type === "roomEntrance");
  assert(lockedDoors.length >= 1, "generated floors should include at least one quest-locked room door");
  assert(lockedDoors.every((cell) => cell.object.keyId && cell.object.keyName), "locked room doors should carry a specific key id and display name");
  assert(roomEntrances.length >= 1, "generated floors should mark unlocked room entrances");
  assert(roomEntrances.every((cell) => cell.terrain === "floor" && cell.object.roomId), "unlocked room entrances should stay passable and carry room metadata");
  assert(generatedCells.some((cell) => cell.object?.questId === "lockedRoomKey"), "locked room doors should have a matching key quest giver");
  for (const door of generatedCells.filter((cell) => cell.terrain === "door")) {
    assert(door.roomId, "room doors should belong to a labelled room");
    assert.strictEqual(door.object?.type, "lockedDoor", "visible room doors should always be locked");
    assert(validRoomDoor(generated, door, door.roomId), "room doors should connect a room interior to an outside corridor through the wall");
  }
  const lockedRoomIds = new Set(lockedDoors.map((cell) => cell.roomId));
  assert.strictEqual(lockedRoomIds.size, lockedDoors.length, "each locked room should have one visible locked door");
  assert(
    generatedCells
      .filter((cell) => cell.object?.type === "questNpc" && cell.object?.questId === "lockedRoomKey")
      .every((cell) => !lockedRoomIds.has(cell.roomId)),
    "room key quest givers should be reachable outside locked rooms"
  );
  assert(generatedCells.some((cell) => cell.roomId && cell.terrain === "floor"), "generated floor should include enclosed room interiors");
  assert(generatedCells.some((cell) => cell.object?.type === "questNpc"), "generated floor should include a neutral quest NPC");
  assert(state.map.rooms.length >= 4, "generated floor should label multiple meaningful rooms");
  assert(state.map.rooms.length <= 10, "generated floor should avoid excessive labelled filler rooms");
  const roomNumbers = state.map.rooms.map((room) => Number(room.name.match(/\\d+/)?.[0]));
  assert.deepStrictEqual(roomNumbers, state.map.rooms.map((_, index) => index + 1), "room names should stay bounded to the generated room count");
  assert(generatedCells.some((cell) => cell.object?.type === "rescueNpc"), "generated floor should include a rescue target NPC");
  const rescueGiver = generatedCells.find((cell) => cell.object?.questId === "rescueRoom" && cell.object?.type === "questNpc");
  assert(rescueGiver?.object.roomName, "rescue quest giver should name the target room");
  const rescueRoomId = rescueGiver.object.roomId;
  assert(generatedCells.some((cell) => cell.object?.roomId === rescueRoomId && ["monster", "elite"].includes(cell.object.type)), "rescue room should start with monsters to clear");
  const outdoorFeatureTypes = new Set(["monster", "elite", "chest", "lockedChest", "altar"]);
  const outdoorFeatures = generatedCells.filter((cell) => !cell.roomId && outdoorFeatureTypes.has(cell.object?.type));
  const startSafeObjects = new Set(["monster", "elite", "boss", "trap", "chest", "lockedChest", "altar", "shop", "forge", "questNpc", "rescueNpc", "roomEvent"]);
  const doorBlockingObjects = new Set(["shop", "forge", "guideNpc", "questNpc", "rescueNpc", "roomEvent"]);
  const isRoomDoorMarker = (cell) => cell?.terrain === "door" || ["lockedDoor", "roomEntrance"].includes(cell?.object?.type);
  const isDoorAccessCell = (cell) => isRoomDoorMarker(cell) || cardinalNeighbors(generated, cell.x, cell.y).some(isRoomDoorMarker);
  assert(generatedCells.some((cell) => cell.object?.type === "roomEvent"), "generated floors should include at least one room event");
  assert(
    !generatedCells.some((cell) => startSafeObjects.has(cell.object?.type) && distance(cell, { x: 1, y: 1 }) <= 4),
    "generated floors should keep the starting area clear of encounters and interactables"
  );
  assert(
    !generatedCells.some((cell) => doorBlockingObjects.has(cell.object?.type) && isDoorAccessCell(cell)),
    "generated floors should keep NPCs and permanent interactables off room door approaches"
  );
  for (const feature of outdoorFeatures) {
    const crowdedNeighbor = cellsWithin(generated, feature.x, feature.y, 1)
      .some((cell) => cell !== feature && !cell.roomId && outdoorFeatureTypes.has(cell.object?.type));
    assert.strictEqual(crowdedNeighbor, false, "outdoor monsters, treasure, and altars should not pile up next to each other");
  }

  state = {
    floor: 1,
    facing: "down",
    player: { x: 1, y: 1 },
    introGuideMet: false
  };
  generateFloor();
  const firstFloorCells = state.map.cells.flat();
  const guideNpc = firstFloorCells.find((cell) => cell.object?.type === "guideNpc");
  assert(guideNpc, "first floor should include an opening guide NPC");
  assert(distance(guideNpc, { x: 1, y: 1 }) <= 3, "opening guide should be near the entrance");

  const chokeMap = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({
    x,
    y,
    terrain: "wall",
    object: null,
    seen: false,
    visible: false
  })));
  for (const [x, y] of [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [4, 2], [5, 2], [4, 4], [5, 4]]) {
    chokeMap[y][x].terrain = "floor";
  }
  chokeMap[3][3].object = { type: "questNpc", npcName: "堵门测试员" };
  state = { floor: 3, map: { cells: chokeMap } };
  repairDoorAccessBlockers(chokeMap);
  assert.strictEqual(chokeMap[3][3].object, null, "door repair should move NPCs off one-tile room approaches");
  assert(chokeMap.flat().some((cell) => cell.object?.type === "questNpc"), "door repair should preserve the relocated NPC");

  state = { floor: 3 };
  const size = 17;
  const map = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => ({
    x, y,
    terrain: x === 0 || y === 0 || x === size - 1 || y === size - 1 ? "wall" : "floor",
    object: null,
    seen: false,
    visible: false
  })));
  map[1][1].object = { type: "stairsUp" };
  map[size - 2][size - 2].object = { type: "stairsDown" };

  placeTreasureEncounters(map, 4);

  const treasure = map.flat().filter((cell) => ["chest", "lockedChest"].includes(cell.object?.type));
  assert.strictEqual(treasure.length, 4, "treasure placement should create requested treasure count");
  assert(treasure.some((cell) => cell.object?.type === "lockedChest"), "treasure placement should include a locked chest room");
  for (const chest of treasure) {
    const nearbyGuard = cellsWithin(map, chest.x, chest.y, 2)
      .some((cell) => ["monster", "elite"].includes(cell.object?.type));
    assert(nearbyGuard, "each chest should be guarded");
    assert.notDeepStrictEqual([chest.x, chest.y], [1, 1], "chest should not occupy upstairs");
    assert.notDeepStrictEqual([chest.x, chest.y], [size - 2, size - 2], "chest should not occupy downstairs");
  }
  const lockedChest = treasure.find((cell) => cell.object?.type === "lockedChest");
  assert(cardinalNeighbors(map, lockedChest.x, lockedChest.y).some((cell) => cell.terrain === "fence"), "locked chest should be protected by a fence ring");
  assert(cardinalNeighbors(map, lockedChest.x, lockedChest.y).some((cell) => cell.object?.type === "fenceGate"), "locked chest fence ring should include a gate");
  const keyGuardian = cellsWithin(map, lockedChest.x, lockedChest.y, 2)
    .find((cell) => cell.object?.dropsKey);
  assert(keyGuardian, "locked chest room should have a key guardian nearby");
  assert.strictEqual(keyGuardian.object.roomBoss, true, "key guardian should be marked as a room boss");

  state = {
    floor: MAX_FLOOR,
    facing: "down",
    player: { x: 1, y: 1 }
  };
  generateFloor();
  const finalCells = state.map.cells.flat();
  assert.strictEqual(state.map.effect?.id, "lava", "final floor should carry the lava special floor effect");
  assert(finalCells.some((cell) => cell.terrain === "lava"), "lava special floors should place blocking lava terrain");
  assert(finalCells.some((cell) => cell.object?.type === "boss"), "final floor should contain the final boss");
  const finalBoss = finalCells.find((cell) => cell.object?.type === "boss")?.object;
  assert.strictEqual(finalBoss.bossProfile, "throne", "final boss should use the throne theme boss profile");
  assert(finalBoss.skills.some((skill) => skill.id === "memory-decree"), "theme boss should include a throne-specific skill");
  assert(finalBoss.resistances.includes("dark"), "theme boss should carry profile-specific resistances");
  assert(!finalCells.some((cell) => cell.object?.type === "stairsDown"), "final floor should not contain downstairs");
`,
  context
);
