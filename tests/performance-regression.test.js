const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { performance } = require("perf_hooks");
const { createTestContext } = require("./helpers/test-context");

const context = createTestContext(assert);
const FLOOR_GENERATION_BUDGET_MS = 7000;

vm.createContext(context);
vm.runInContext(fs.readFileSync("tests/.generated/runtime-harness.js", "utf8"), context, {
  filename: "tests/.generated/runtime-harness.js"
});
const started = performance.now();
vm.runInContext(
  `
  for (let floor = 1; floor <= MAX_FLOOR; floor += 5) {
    state = {
      floor,
      classId: "warrior",
      player: { x: 1, y: 1 },
      facing: "down",
      quests: [],
      lore: { chapters: [], pages: [] },
      narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
      floorStates: {},
      log: []
    };
    generateFloor();
    assert(state.map?.cells?.length, "performance sample should generate a playable map");
    assert(state.map.cells.flat().some((cell) => cell.object), "performance sample should place interactive objects");
  }
`,
  context
);
const elapsed = performance.now() - started;
assert(
  elapsed < FLOOR_GENERATION_BUDGET_MS,
  "representative floor generation samples should stay under a generous runtime budget"
);
