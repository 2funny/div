import { choice, random } from "../random";
import type { SlotKey } from "../types";

type EquipmentNameDef = {
  base: string;
  materials: Record<string, string[]>;
  epic: string[];
  legendary: string[];
};

const WEAPON_NAME_POOLS: Record<string, EquipmentNameDef> = {
  sword: {
    base: "剑",
    materials: {
      普通: ["木", "铜", "铁"],
      优秀: ["钢", "精铁", "银"],
      稀有: ["秘银", "霜银", "符文钢"],
      史诗: ["龙骨", "炎纹", "月辉"],
      传说: ["星陨", "圣辉", "永恒"]
    },
    epic: ["王庭圣剑", "月辉裁决剑", "炎龙骑士剑"],
    legendary: ["精灵王的圣剑", "星陨王权剑", "黎明誓约之剑"]
  },
  axe: {
    base: "战斧",
    materials: {
      普通: ["石", "铜", "铁"],
      优秀: ["钢", "精铁", "黑铁"],
      稀有: ["秘银", "山脉", "符文钢"],
      史诗: ["龙骨", "雷铸", "巨人"],
      传说: ["星陨", "裂地", "王者"]
    },
    epic: ["雷铸碎山斧", "巨人断峰斧", "黑曜开路斧"],
    legendary: ["裂地王的战斧", "远古泰坦之斧", "群山终誓"]
  },
  greatsword: {
    base: "重剑",
    materials: {
      普通: ["铁", "厚铜", "旧钢"],
      优秀: ["钢", "精铁", "骑士"],
      稀有: ["秘银", "符文钢", "霜银"],
      史诗: ["龙骨", "狮心", "炎纹"],
      传说: ["星陨", "王者", "永恒"]
    },
    epic: ["狮心断罪重剑", "炎纹守誓重剑", "龙骨破阵剑"],
    legendary: ["不落王城的重剑", "星陨裁决者", "永恒守誓之刃"]
  },
  staff: {
    base: "法杖",
    materials: {
      普通: ["橡木", "松木", "铜环"],
      优秀: ["白蜡木", "银枝", "水晶"],
      稀有: ["秘银", "星纹", "月桂"],
      史诗: ["龙骨", "星辉", "贤者"],
      传说: ["星陨", "圣辉", "世界树"]
    },
    epic: ["贤者星辉法杖", "龙骨秘仪杖", "月桂大法杖"],
    legendary: ["世界树之枝", "星界大法师的权杖", "圣辉晨星杖"]
  },
  tome: {
    base: "魔书",
    materials: {
      普通: ["羊皮", "铜扣", "学徒"],
      优秀: ["银页", "秘文", "钢封"],
      稀有: ["秘银", "星纹", "古代"],
      史诗: ["龙语", "贤者", "禁典"],
      传说: ["星陨", "圣辉", "创世"]
    },
    epic: ["贤者禁典", "龙语魔导书", "星纹秘法书"],
    legendary: ["创世残章", "星界贤者之书", "圣辉启示录"]
  },
  orb: {
    base: "法珠",
    materials: {
      普通: ["玻璃", "铜芯", "水晶"],
      优秀: ["银芯", "辉石", "精钢"],
      稀有: ["秘银", "星纹", "月石"],
      史诗: ["龙晶", "星辉", "虚空"],
      传说: ["星陨", "圣辉", "永恒"]
    },
    epic: ["虚空凝视法珠", "龙晶星辉珠", "月石预言珠"],
    legendary: ["永恒星核", "星陨天穹珠", "圣辉命运之眼"]
  },
  bow: {
    base: "弓",
    materials: {
      普通: ["木", "猎人", "短木"],
      优秀: ["橡木", "钢弦", "银叶"],
      稀有: ["秘银", "风纹", "月桂"],
      史诗: ["龙筋", "星辉", "风暴"],
      传说: ["星陨", "圣辉", "精灵王"]
    },
    epic: ["风暴猎弓", "龙筋逐星弓", "月桂穿云弓"],
    legendary: ["精灵王的长弓", "星陨逐日弓", "圣辉猎神弓"]
  },
  crossbow: {
    base: "弩",
    materials: {
      普通: ["木", "铜机", "铁臂"],
      优秀: ["钢臂", "精铁", "银机"],
      稀有: ["秘银", "风纹", "符文钢"],
      史诗: ["龙骨", "雷机", "星辉"],
      传说: ["星陨", "圣辉", "永恒"]
    },
    epic: ["雷机连发弩", "龙骨破甲弩", "星辉狙击弩"],
    legendary: ["永恒机簧", "星陨审判弩", "圣辉破晓弩"]
  },
  dagger: {
    base: "短刃",
    materials: {
      普通: ["铜", "铁", "猎人"],
      优秀: ["钢", "银", "精铁"],
      稀有: ["秘银", "影纹", "霜银"],
      史诗: ["龙牙", "夜幕", "星辉"],
      传说: ["星陨", "圣辉", "影王"]
    },
    epic: ["夜幕双刃", "龙牙迅刃", "星辉穿喉刃"],
    legendary: ["影王的短刃", "星陨无声刃", "圣辉破影刃"]
  }
};

const SLOT_NAME_POOLS: Partial<Record<SlotKey, EquipmentNameDef>> = {
  armor: {
    base: "甲",
    materials: {
      普通: ["旧皮", "铜片", "铁环"],
      优秀: ["钢鳞", "精铁", "银纹"],
      稀有: ["秘银", "霜银", "符文钢"],
      史诗: ["龙鳞", "守誓", "星辉"],
      传说: ["圣辉", "永恒", "王者"]
    },
    epic: ["龙鳞守卫甲", "星辉骑士甲", "守誓壁垒甲"],
    legendary: ["不破王庭战甲", "圣辉庇护甲", "永恒壁垒"]
  },
  boots: {
    base: "靴",
    materials: {
      普通: ["皮", "行者", "铁扣"],
      优秀: ["软钢", "银线", "疾行"],
      稀有: ["秘银", "风纹", "霜羽"],
      史诗: ["龙鳞", "逐风", "星辉"],
      传说: ["圣辉", "永恒", "逐星"]
    },
    epic: ["逐风者长靴", "星辉旅者靴", "龙鳞踏火靴"],
    legendary: ["逐星者之靴", "永恒远行靴", "圣辉踏云靴"]
  },
  ring: {
    base: "戒指",
    materials: {
      普通: ["铜", "铁", "骨"],
      优秀: ["银", "精金", "辉石"],
      稀有: ["秘银", "星纹", "月石"],
      史诗: ["龙晶", "贤者", "命运"],
      传说: ["圣辉", "永恒", "星陨"]
    },
    epic: ["贤者龙晶戒", "命运星纹戒", "月石誓约戒"],
    legendary: ["星陨命运之戒", "圣辉王权戒", "永恒誓约"]
  },
  amulet: {
    base: "护符",
    materials: {
      普通: ["木刻", "铜", "旧银"],
      优秀: ["银纹", "辉石", "精金"],
      稀有: ["秘银", "星纹", "月石"],
      史诗: ["龙心", "圣印", "星辉"],
      传说: ["圣辉", "永恒", "星陨"]
    },
    epic: ["圣印守心符", "龙心护符", "星辉旅者符"],
    legendary: ["圣辉王冠护符", "永恒庇护符", "星陨先知符"]
  }
};

export function equipmentName(slot: SlotKey, quality: string, weaponType = ""): string {
  const def =
    slot === "weapon"
      ? WEAPON_NAME_POOLS[weaponType] || WEAPON_NAME_POOLS.sword
      : SLOT_NAME_POOLS[slot] || SLOT_NAME_POOLS.armor;
  if (quality === "传说") return choice(def.legendary);
  if (quality === "史诗" && random() < 0.65) return choice(def.epic);
  const material = choice(materialsForQuality(def, quality));
  return `${material}${def.base}`;
}

function materialsForQuality(def: EquipmentNameDef, quality: string): string[] {
  return def.materials[quality] || def.materials.普通;
}
