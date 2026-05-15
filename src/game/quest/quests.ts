export const QUEST_DEFS = {
  rescueRoom: {
    id: "rescueRoom",
    giver: "questNpc",
    title: "房间救援",
    giverName: "救援斥候卡尔",
    desc: "清理指定房间的怪物，救出被困的冒险者。",
    target: 2,
    rewardGold: (floor: number) => 18 + floor * 4,
    rewardKeys: 1,
    type: "rescueRoom"
  },
  wardenErrand: {
    id: "wardenErrand",
    giver: "questNpc",
    title: "巡夜人委托",
    giverName: "巡夜人",
    desc: "清掉本层游荡怪物，换取打开符文锁的钥匙。",
    target: 2,
    rewardGold: (floor: number) => 14 + floor * 3,
    rewardKeys: 1
  },
  lockedRoomKey: {
    id: "lockedRoomKey",
    giver: "questNpc",
    title: "房门钥匙委托",
    giverName: "钥匙保管人",
    desc: "清理附近游荡怪物，换取指定房间的钥匙。",
    target: 2,
    rewardGold: (floor: number) => 8 + floor * 2,
    rewardDoorKey: true
  },
  merchantRoute: {
    id: "merchantRoute",
    giver: "shop",
    title: "商路清理",
    giverName: "流动商队",
    desc: "帮商人扫清附近怪物，换取补给和金币。",
    target: 2,
    rewardGold: (floor: number) => 10 + floor * 3,
    rewardPotion: "hp"
  }
} as const;
