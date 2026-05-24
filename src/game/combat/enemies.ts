export const ENEMY_AFFIXES = [
  { id: "armored", name: "坚甲", desc: "防御提高，普通攻击效率降低" },
  { id: "shatter", name: "破盾", desc: "防御姿态减伤降低" },
  { id: "drain", name: "汲取", desc: "造成伤害后恢复生命" },
  { id: "swift", name: "迅捷", desc: "更容易避开攻击" },
  { id: "warded", name: "符盾", desc: "抗性与生命提高，适合用克制属性突破" },
  { id: "volatile", name: "躁焰", desc: "攻击更高但防御较低，战斗节奏更快" },
  { id: "hunter", name: "猎手", desc: "速度提高，反击压力更强" }
] as const;
