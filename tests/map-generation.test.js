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
    const key = (cell) => cell.x + "," + cell.y;
    const visited = new Set([key(start)]);
    const queue = [start];
    while (queue.length) {
      const cell = queue.shift();
      for (const next of cardinalNeighbors(map, cell.x, cell.y)) {
        if (next.terrain !== "floor" || visited.has(key(next))) continue;
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
  const mainPathCells = generatedCells.filter((cell) => cell.mainPath);
  assert(floorCells.length / generatedCells.length < .58, "generated floor should not be an open field");
  assert(floorCells.length / generatedCells.length > .24, "generated floor should still have enough playable space");
  assert(mainPathCells.length >= MAP_SIZE + 8, "generated floor should have a clear main trunk path");
  assert.strictEqual(reachableFloorCount(generated, generated[1][1]), floorCells.length, "all playable floor cells should connect to the main route");

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
  const keyGuardian = cellsWithin(map, lockedChest.x, lockedChest.y, 2)
    .find((cell) => cell.object?.dropsKey);
  assert(keyGuardian, "locked chest room should have a key guardian nearby");
  assert.strictEqual(keyGuardian.object.roomBoss, true, "key guardian should be marked as a room boss");
`, context);
