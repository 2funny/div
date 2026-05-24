import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createTestContext } = require("../tests/helpers/test-context");

const build = spawnSync("npm", ["run", "build:test-harness"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (build.status !== 0) process.exit(build.status || 1);

const context = createTestContext(console.assert);
vm.createContext(context);
vm.runInContext(readFileSync("tests/.generated/runtime-harness.js", "utf8"), context, {
  filename: "tests/.generated/runtime-harness.js"
});

vm.runInContext(
  `
  function sampleState(floor) {
    return {
      classId: "warrior",
      floor,
      level: Math.max(1, Math.floor(floor / 3) + 1),
      hp: 120,
      maxHp: 120,
      mp: 30,
      maxMp: 30,
      stats: { atk: 20, mag: 4, def: 12, res: 6, spd: 8, luk: 2 },
      equipment: starterEquipment("warrior"),
      inventory: [],
      materials: {},
      runes: {},
      gold: 0,
      keys: 0,
      quests: [],
      lore: { chapters: [], pages: [] },
      narrative: { relations: {}, flags: {}, eventChoices: {}, rescuedNpcIds: [], merchantTrust: 0, factionLeanings: {} },
      floorStates: {},
      skillLevels: {},
      skillBranches: {},
      skillCooldowns: {},
      statPoints: 0,
      skillPoints: 0,
      skillDust: 0,
      log: []
    };
  }

  function enemyForFloor(floor, type) {
    const base = {
      type: "monster",
      name: "Report Dummy " + floor,
      hp: Math.round(12 + floor * 3),
      maxHp: Math.round(12 + floor * 3),
      atk: Math.round(2 + floor * 0.52),
      def: Math.round(floor * 0.08),
      spd: Math.round(2 + floor * 0.35),
      xp: Math.round(4 + floor * 1.25),
      gold: Math.round(4 + floor)
    };
    if (type === "elite") {
      return {
        ...base,
        type: "elite",
        name: "Elite Report Dummy " + floor,
        hp: Math.round(base.hp * 1.85),
        maxHp: Math.round(base.maxHp * 1.85),
        atk: Math.round(base.atk * 1.34 + 2),
        def: Math.round(base.def * 1.55 + 1)
      };
    }
    if (type === "boss") {
      return {
        ...base,
        type: "boss",
        name: "Boss Report Dummy " + floor,
        hp: Math.round(base.hp * 4.4),
        maxHp: Math.round(base.maxHp * 4.4),
        atk: Math.round(base.atk * 1.75 + 5),
        def: Math.round(base.def * 2.2 + 2),
        xp: Math.round(130 + floor * 6),
        gold: Math.round(220 + floor * 7)
      };
    }
    return base;
  }

  function qualityReport(floor, count) {
    state = sampleState(floor);
    setRandomSeed("report-quality-" + floor);
    const counts = { "普通": 0, "优秀": 0, "稀有": 0, "史诗": 0, "传说": 0 };
    const statBudgets = [];
    for (let i = 0; i < count; i++) {
      const entry = randomEquipment();
      counts[entry.quality]++;
      statBudgets.push(Object.values(entry.stats || {}).reduce((sum, value) => sum + Number(value || 0), 0));
    }
    resetRandomSource();
    return {
      floor,
      count,
      counts,
      averageStatBudget: Number((statBudgets.reduce((sum, value) => sum + value, 0) / count).toFixed(2)),
      p90StatBudget: statBudgets.sort((a, b) => a - b)[Math.floor(count * 0.9)]
    };
  }

  function lootReport(floor, type, count) {
    state = sampleState(floor);
    setRandomSeed("report-loot-" + floor + "-" + type);
    for (let i = 0; i < count; i++) {
      maybeDrop(enemyForFloor(floor, type));
    }
    resetRandomSource();
    return {
      floor,
      type,
      count,
      gold: state.gold || 0,
      equipment: state.inventory.filter((entry) => entry.kind === "equip").length,
      scrolls: state.inventory.filter((entry) => entry.kind === "skillScroll").length,
      materials: Object.values(state.materials || {}).reduce((sum, value) => sum + Number(value || 0), 0),
      runes: Object.values(state.runes || {}).reduce((sum, value) => sum + Number(value || 0), 0),
      skillDust: state.skillDust || 0,
      keys: state.keys || 0
    };
  }

  globalThis.__balanceReport = {
    generatedAt: new Date().toISOString(),
    quality: [6, 30, 60].map((floor) => qualityReport(floor, 300)),
    loot: [8, 30, 60].flatMap((floor) => [
      lootReport(floor, "monster", 120),
      lootReport(floor, "elite", 90),
      lootReport(floor, "boss", 30)
    ])
  };
`,
  context
);

const report = context.__balanceReport;
mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/balance-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync("tmp/balance-report.md", renderMarkdown(report), "utf8");
console.log("Balance report written to tmp/balance-report.md and tmp/balance-report.json");

function renderMarkdown(report) {
  return `# Rune Dungeon Balance Report

Generated: ${report.generatedAt}

## Equipment Quality

| Floor | Samples | Common | Fine | Rare | Epic | Legendary | Avg Stat Budget | P90 Stat Budget |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.quality
  .map(
    (entry) =>
      `| ${entry.floor} | ${entry.count} | ${entry.counts["普通"]} | ${entry.counts["优秀"]} | ${entry.counts["稀有"]} | ${entry.counts["史诗"]} | ${entry.counts["传说"]} | ${entry.averageStatBudget} | ${entry.p90StatBudget} |`
  )
  .join("\n")}

## Loot Economy

| Floor | Type | Samples | Gold | Equipment | Scrolls | Materials | Runes | Skill Dust | Keys |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.loot
  .map(
    (entry) =>
      `| ${entry.floor} | ${entry.type} | ${entry.count} | ${entry.gold} | ${entry.equipment} | ${entry.scrolls} | ${entry.materials} | ${entry.runes} | ${entry.skillDust} | ${entry.keys} |`
  )
  .join("\n")}
`;
}
