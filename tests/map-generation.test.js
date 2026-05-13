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

  state = {
    floor: 3,
    facing: "down",
    player: { x: 1, y: 1 }
  };
  generateFloor();
  const generated = state.map.cells;
  const generatedCells = generated.flat();
  const floorCells = generatedCells.filter((cell) => cell.terrain === "floor");
  const passableCells = generatedCells.filter((cell) => ["floor", "door"].includes(cell.terrain));
  const mainPathCells = generatedCells.filter((cell) => cell.mainPath);
  const stairsDown = generatedCells.find((cell) => cell.object?.type === "stairsDown");
  const stairsUp = generatedCells.find((cell) => cell.object?.type === "stairsUp");
  assert(floorCells.length / generatedCells.length < .58, "generated floor should not be an open field");
  assert(floorCells.length / generatedCells.length > .24, "generated floor should still have enough playable space");
  assert(mainPathCells.length >= MAP_SIZE + 8, "generated floor should have a clear main trunk path");
  assert.strictEqual(reachableFloorCount(generated, generated[1][1]), passableCells.length, "all playable floor cells should connect to the main route");
  assert(stairsDown, "generated floor should include a downstairs tile before the final floor");
  assert(stairsUp, "generated floors after the first should include an upstairs tile");
  assert.notDeepStrictEqual([stairsDown.x, stairsDown.y], [MAP_SIZE - 2, MAP_SIZE - 2], "downstairs should not be fixed in the lower-right corner");
  assert.notDeepStrictEqual([stairsUp.x, stairsUp.y], [1, 1], "upstairs should not be fixed in the upper-left corner");
  assert(distance(stairsDown, { x: 1, y: 1 }) >= 10, "downstairs should not be discoverable immediately from the starting area");
  assert(stairsDown.roomId || floorNeighborCount(generated, stairsDown.x, stairsDown.y) <= 1, "downstairs should prefer a room or route endpoint");
  assert(generatedCells.some((cell) => cell.terrain === "door"), "generated floor should include room doors");
  for (const door of generatedCells.filter((cell) => cell.terrain === "door")) {
    assert(door.roomId, "room doors should belong to a labelled room");
    assert(validRoomDoor(generated, door, door.roomId), "room doors should connect a room interior to an outside corridor through the wall");
  }
  assert(generatedCells.some((cell) => cell.roomId && cell.terrain === "floor"), "generated floor should include enclosed room interiors");
  assert(generatedCells.some((cell) => cell.object?.type === "questNpc"), "generated floor should include a neutral quest NPC");
  assert(state.map.rooms.length >= 4, "generated floor should label multiple meaningful rooms");
  assert(state.map.rooms.length <= 10, "generated floor should avoid excessive labelled filler rooms");
  assert(generatedCells.some((cell) => cell.object?.type === "rescueNpc"), "generated floor should include a rescue target NPC");
  const rescueGiver = generatedCells.find((cell) => cell.object?.questId === "rescueRoom" && cell.object?.type === "questNpc");
  assert(rescueGiver?.object.roomName, "rescue quest giver should name the target room");
  const rescueRoomId = rescueGiver.object.roomId;
  assert(generatedCells.some((cell) => cell.object?.roomId === rescueRoomId && ["monster", "elite"].includes(cell.object.type)), "rescue room should start with monsters to clear");
  const outdoorFeatureTypes = new Set(["monster", "elite", "chest", "lockedChest", "altar"]);
  const outdoorFeatures = generatedCells.filter((cell) => !cell.roomId && outdoorFeatureTypes.has(cell.object?.type));
  for (const feature of outdoorFeatures) {
    const crowdedNeighbor = cellsWithin(generated, feature.x, feature.y, 1)
      .some((cell) => cell !== feature && !cell.roomId && outdoorFeatureTypes.has(cell.object?.type));
    assert.strictEqual(crowdedNeighbor, false, "outdoor monsters, treasure, and altars should not pile up next to each other");
  }

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
  assert(finalCells.some((cell) => cell.object?.type === "boss"), "final floor should contain the final boss");
  assert(!finalCells.some((cell) => cell.object?.type === "stairsDown"), "final floor should not contain downstairs");
`, context);
