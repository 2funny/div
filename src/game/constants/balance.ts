export const BALANCE_CONFIG = {
  startingResources: {
    statPoints: 3,
    skillPoints: 1,
    skillDust: 1
  },
  skillDustCostByTargetLevel: {
    1: 1,
    2: 1,
    3: 2,
    default: "targetLevel"
  },
  bossPhaseThresholds: {
    shift: 0.65,
    crisis: 0.35
  },
  classGrowth: {
    warrior: {
      hp: 4,
      mp: 1,
      primary: "atk",
      primaryEvery: 2,
      secondary: "def",
      secondaryEvery: 4
    },
    mage: {
      hp: 2,
      mp: 4,
      primary: "mag",
      primaryEvery: 2,
      secondary: "res",
      secondaryEvery: 4
    },
    ranger: {
      hp: 3,
      mp: 2,
      primary: "spd",
      primaryEvery: 2,
      secondary: "luk",
      secondaryEvery: 4
    }
  },
  equipmentQuality: {
    普通: {
      dropBonus: 1,
      score: 0,
      runeSlots: 0,
      weaponElementChance: 0.08,
      elementResistanceChance: 0.08,
      merchantPriceBonus: 0,
      enhanceTier: 0
    },
    优秀: {
      dropBonus: 2,
      score: 8,
      runeSlots: 1,
      weaponElementChance: 0.18,
      elementResistanceChance: 0.16,
      merchantPriceBonus: 8,
      enhanceTier: 1
    },
    稀有: {
      dropBonus: 3,
      score: 18,
      runeSlots: 2,
      weaponElementChance: 0.32,
      elementResistanceChance: 0.28,
      merchantPriceBonus: 22,
      enhanceTier: 2
    },
    史诗: {
      dropBonus: 4,
      score: 32,
      runeSlots: 2,
      weaponElementChance: 0.48,
      elementResistanceChance: 0.42,
      merchantPriceBonus: 48,
      enhanceTier: 3
    },
    传说: {
      dropBonus: 6,
      score: 50,
      runeSlots: 2,
      weaponElementChance: 0.7,
      elementResistanceChance: 0.58,
      merchantPriceBonus: 90,
      enhanceTier: 4
    }
  },
  enhanceCost: {
    baseGold: 20,
    goldPerLevel: 12,
    goldPerQualityTier: 8,
    baseStones: 1,
    stoneLevelDivisor: 3
  },
  equipmentSell: {
    minGold: 6,
    scoreMultiplier: 0.55,
    goldPerLevel: 8
  },
  equipmentSalvage: {
    dustByQuality: {
      普通: 1,
      优秀: 1,
      稀有: 2,
      史诗: 3,
      传说: 4
    },
    levelDustDivisor: 2,
    stoneQualities: ["史诗", "传说"]
  },
  shopGoods: {
    hp: {
      name: "小型生命药水",
      effect: "hp",
      amount: 18,
      price: 12,
      desc: "恢复 18 HP"
    },
    mp: {
      name: "小型法力药水",
      effect: "mp",
      amount: 12,
      price: 12,
      desc: "恢复 12 MP"
    },
    beacon: {
      name: "商路信标",
      effect: "teleport",
      amount: 0,
      price: 45,
      desc: "传送到已探索设施"
    },
    universalKey: {
      name: "万能钥匙",
      effect: "key",
      amount: 1,
      basePrice: 58,
      minPrice: 42,
      desc: "打开任意上锁房门"
    }
  },
  merchantUniversalKeyChance: {
    base: 0.08,
    perFloor: 0.006,
    perTrust: 0.012,
    max: 0.28
  },
  openingBuildPresets: {
    warrior: [
      { id: "vanguard", name: "盾线", desc: "防御 +2，攻击 +1", stats: { def: 2, atk: 1 } },
      { id: "duelist", name: "决斗", desc: "攻击 +2，速度 +1", stats: { atk: 2, spd: 1 } }
    ],
    mage: [
      { id: "ember", name: "余火", desc: "法强 +2，抗性 +1", stats: { mag: 2, res: 1 } },
      { id: "ward", name: "秘壁", desc: "抗性 +2，法强 +1", stats: { res: 2, mag: 1 } }
    ],
    ranger: [
      { id: "skirmish", name: "游击", desc: "速度 +2，幸运 +1", stats: { spd: 2, luk: 1 } },
      { id: "marksman", name: "准星", desc: "攻击 +2，幸运 +1", stats: { atk: 2, luk: 1 } }
    ]
  }
} as const;

export type EquipmentQuality = keyof typeof BALANCE_CONFIG.equipmentQuality;
export type ClassGrowthId = keyof typeof BALANCE_CONFIG.classGrowth;
export type ShopGoodId = keyof typeof BALANCE_CONFIG.shopGoods;

export function skillDustCostForTargetLevel(targetLevel: number) {
  return (
    BALANCE_CONFIG.skillDustCostByTargetLevel[
      targetLevel as keyof typeof BALANCE_CONFIG.skillDustCostByTargetLevel
    ] || targetLevel
  );
}

export function equipmentQualityConfig(quality: string | null | undefined) {
  return (
    BALANCE_CONFIG.equipmentQuality[quality as EquipmentQuality] ||
    BALANCE_CONFIG.equipmentQuality.优秀
  );
}

export function classGrowthConfig(classId: string) {
  const growth =
    BALANCE_CONFIG.classGrowth[classId as ClassGrowthId] ||
    BALANCE_CONFIG.classGrowth.warrior;
  return { ...growth };
}

export function equipmentRuneSlotsForQuality(quality: string | null | undefined) {
  return equipmentQualityConfig(quality).runeSlots;
}

export function enhanceCostForEquipment(eq: { quality?: string; level?: number } | null | undefined) {
  const qualityTier = equipmentQualityConfig(eq?.quality).enhanceTier;
  const nextLevel = Number(eq?.level || 0);
  const cost = BALANCE_CONFIG.enhanceCost;
  return {
    gold: cost.baseGold + cost.goldPerLevel * nextLevel + cost.goldPerQualityTier * qualityTier,
    stones: cost.baseStones + Math.floor((nextLevel + 1) / cost.stoneLevelDivisor)
  };
}

export function equipmentSellValueFromScore(score: number, level = 0) {
  const config = BALANCE_CONFIG.equipmentSell;
  return Math.max(
    config.minGold,
    Math.round(Number(score || 0) * config.scoreMultiplier + Number(level || 0) * config.goldPerLevel)
  );
}

export function equipmentSalvageValueForEquipment(eq: { quality?: string; level?: number } | null | undefined) {
  const config = BALANCE_CONFIG.equipmentSalvage;
  const quality = String(eq?.quality || "普通");
  const level = Number(eq?.level || 0);
  const dust = config.dustByQuality[quality as keyof typeof config.dustByQuality] || 1;
  const stones = level > 0 || (config.stoneQualities as readonly string[]).includes(quality) ? 1 : 0;
  return {
    dust: dust + Math.floor(level / config.levelDustDivisor),
    stones
  };
}

export function shopGoodConfig(kind: string) {
  return BALANCE_CONFIG.shopGoods[kind as ShopGoodId] || BALANCE_CONFIG.shopGoods.hp;
}

export function merchantUniversalKeyPrice(priceFactor = 1) {
  const goods = BALANCE_CONFIG.shopGoods.universalKey;
  return Math.max(goods.minPrice, Math.round(goods.basePrice * priceFactor));
}

export function merchantUniversalKeyChance(floor = 1, trust = 0) {
  const config = BALANCE_CONFIG.merchantUniversalKeyChance;
  return Math.min(
    config.max,
    config.base + Number(floor || 1) * config.perFloor + Math.max(0, Number(trust || 0)) * config.perTrust
  );
}
