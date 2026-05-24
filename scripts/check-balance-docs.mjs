import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

const outDir = resolve("tmp/balance-doc-check");
const outFile = resolve(outDir, "balance.mjs");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  logLevel: "error",
  configFile: false,
  build: {
    lib: {
      entry: resolve("src/game/constants/balance.ts"),
      formats: ["es"],
      fileName: () => "balance.mjs"
    },
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      external: []
    }
  }
});

const { BALANCE_CONFIG } = await import(pathToFileURL(outFile).href);
const documented = JSON.parse(readFileSync("docs/balance-data.json", "utf8"));
const failures = [];

compare("startingResources", documented.startingResources, BALANCE_CONFIG.startingResources);
compare("bossPhaseThresholds", documented.bossPhaseThresholds, BALANCE_CONFIG.bossPhaseThresholds);
compare("classGrowth", documented.classGrowth, BALANCE_CONFIG.classGrowth);
compare("skillDustCostByTargetLevel.1", documented.skillDustCostByTargetLevel["1"], BALANCE_CONFIG.skillDustCostByTargetLevel[1]);
compare("skillDustCostByTargetLevel.2", documented.skillDustCostByTargetLevel["2"], BALANCE_CONFIG.skillDustCostByTargetLevel[2]);
compare("skillDustCostByTargetLevel.3", documented.skillDustCostByTargetLevel["3"], BALANCE_CONFIG.skillDustCostByTargetLevel[3]);
compare("skillDustCostByTargetLevel.4+", documented.skillDustCostByTargetLevel["4+"], BALANCE_CONFIG.skillDustCostByTargetLevel.default);

for (const [classId, presets] of Object.entries(BALANCE_CONFIG.openingBuildPresets)) {
  compare(
    `openingBuildPresets.${classId}`,
    documented.openingBuildPresets?.[classId],
    presets.map((entry) => entry.id)
  );
}

for (const [quality, config] of Object.entries(BALANCE_CONFIG.equipmentQuality)) {
  const documentedQuality = documented.equipmentQuality?.[quality] || {};
  for (const key of [
    "dropBonus",
    "score",
    "runeSlots",
    "weaponElementChance",
    "elementResistanceChance",
    "merchantPriceBonus"
  ]) {
    compare(`equipmentQuality.${quality}.${key}`, documentedQuality[key], config[key]);
  }
  compare(`enhanceCostFormula.qualityTier.${quality}`, documented.enhanceCostFormula?.qualityTier?.[quality], config.enhanceTier);
}

const cost = BALANCE_CONFIG.enhanceCost;
compare(
  "enhanceCostFormula.gold",
  documented.enhanceCostFormula?.gold,
  `${cost.baseGold} + ${cost.goldPerLevel} * nextLevel + ${cost.goldPerQualityTier} * qualityTier`
);
compare(
  "enhanceCostFormula.stones",
  documented.enhanceCostFormula?.stones,
  `${cost.baseStones} + floor((nextLevel + 1) / ${cost.stoneLevelDivisor})`
);
compare("equipmentSell", documented.equipmentSell, BALANCE_CONFIG.equipmentSell);
compare("equipmentSalvage", documented.equipmentSalvage, BALANCE_CONFIG.equipmentSalvage);
compare("shopGoods", documented.shopGoods, BALANCE_CONFIG.shopGoods);
compare(
  "merchantUniversalKeyChance",
  documented.merchantUniversalKeyChance,
  BALANCE_CONFIG.merchantUniversalKeyChance
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Balance docs match BALANCE_CONFIG.");

function compare(path, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${path}: documented ${JSON.stringify(actual)} !== runtime ${JSON.stringify(expected)}`);
  }
}
