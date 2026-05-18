import { rmSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const COVERAGE_DIR = resolve("coverage", "v8");
const MIN_COVERAGE = 35;
const TEST_COMMANDS = [
  ["npm", ["run", "build:test-harness"]],
  ["node", ["tests/map-generation.test.js"]],
  ["node", ["tests/equipment-ui.test.js"]],
  ["node", ["tests/gameplay-behavior.test.js"]]
];

rmSync(COVERAGE_DIR, { recursive: true, force: true });
mkdirSync(COVERAGE_DIR, { recursive: true });

for (const [command, args] of TEST_COMMANDS) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, NODE_V8_COVERAGE: COVERAGE_DIR }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const totals = { covered: 0, total: 0 };
for (const file of readdirSync(COVERAGE_DIR)) {
  if (!file.endsWith(".json")) continue;
  const report = JSON.parse(readFileSync(join(COVERAGE_DIR, file), "utf8"));
  for (const entry of report.result || []) {
    if (!isSourceEntry(entry.url)) continue;
    for (const fn of entry.functions || []) {
      for (const range of fn.ranges || []) {
        const size = Math.max(0, range.endOffset - range.startOffset);
        totals.total += size;
        if (range.count > 0) totals.covered += size;
      }
    }
  }
}

const percent = totals.total ? (totals.covered / totals.total) * 100 : 0;
console.log(`V8 runtime coverage: ${percent.toFixed(2)}%`);
if (percent < MIN_COVERAGE) {
  console.error(`Coverage ${percent.toFixed(2)}% is below the ${MIN_COVERAGE}% threshold.`);
  process.exit(1);
}

function isSourceEntry(url) {
  const normalized = url.replace(/\\/g, "/");
  return /\/src\/game\//.test(normalized) || /(^|\/)tests\/\.generated\/runtime-harness\.js$/.test(normalized);
}
