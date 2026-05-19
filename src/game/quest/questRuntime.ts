import { advanceTutorial } from "../tutorial/tutorial";
import { QUEST_DEFS } from "./quests";

// 任务运行时维护任务定义到进度状态的转换、领取奖励和救援任务推进。
export function createQuestRuntime(ctx) {
  const { api } = ctx;
  let state = ctx.getState();
  const syncState = () => {
    state = ctx.getState();
    return state;
  };

  const closeModal = (...args) => api.closeModal(...args);
  const log = (...args) => api.log(...args);
  const playSound = (...args) => api.playSound(...args);
  const potion = (...args) => api.potion(...args);
  const render = (...args) => api.render(...args);
  const roomName = (...args) => api.roomName(...args);
  const showEvent = (...args) => api.showEvent(...args);
  const showModal = (...args) => api.showModal(...args);
  function openQuestNpc(source = null) {
    openQuestFromGiver("questNpc", source || currentQuestSource("questNpc"));
  }

  // 读取当前格子上的任务来源物件，供任务弹窗生成动态文案。
  function currentQuestSource(type) {
    const obj = state?.map?.cells?.[state.player?.y]?.[state.player?.x]?.object;
    return obj?.type === type ? obj : null;
  }

  // 根据 NPC 或商人来源合成任务定义，救援任务会补入房间信息。
  function questDefFromSource(giver, source = null) {
    const id = source?.questId;
    const base =
      QUEST_DEFS[id] ||
      questDefinitionsForGiver(giver).find((quest) => quest.type !== "rescueRoom") ||
      questDefinitionsForGiver(giver)[0];
    if (!base) return null;
    if (base.id === "lockedRoomKey") {
      const targetFloor = source?.targetFloor || state.floor;
      const roomNameText = source?.roomName || roomName(source?.roomId);
      return {
        ...base,
        title: `${roomNameText}钥匙委托`,
        giverName: source?.npcName || base.giverName,
        desc: `清理附近游荡怪物，换取打开${roomNameText}的专用钥匙。万能钥匙也可以打开这道门。`,
        target: source?.target || base.target,
        targetFloor,
        targetRoomName: source?.targetRoomName || null,
        roomId: source?.roomId || null,
        roomName: roomNameText,
        doorKeyId: source?.doorKeyId,
        doorKeyName: source?.doorKeyName || `${roomNameText}钥匙`
      };
    }
    if (base.type !== "rescueRoom") {
      const targetFloor = source?.targetFloor || state.floor;
      const targetRoomName = source?.targetRoomName || source?.roomName || null;
      return { ...base, targetFloor, targetRoomName };
    }
    return {
      ...base,
      title: `${source?.roomName || roomName(source?.roomId)}救援`,
      giverName: source?.npcName || base.giverName,
      desc: `${source?.rescueName || "被困者"}被困在${source?.roomName || roomName(source?.roomId)}。清理房间内的怪物后，与被困者交谈确认安全。`,
      target: source?.target || base.target,
      roomId: source?.roomId,
      roomName: source?.roomName || roomName(source?.roomId),
      rescueName: source?.rescueName || "被困者",
      targetFloor: source?.targetFloor || state.floor,
      targetRoomName: source?.roomName || roomName(source?.roomId)
    };
  }

  // 确保旧版单任务字段存在，兼容早期存档结构。
  function ensureQuest() {
    if (!state.quest || state.quest.floor !== state.floor) {
      state.quest = { id: "wardenErrand", floor: state.floor, kills: 0, target: 2, claimed: false };
    }
    return state.quest;
  }

  // 获取某类任务发布者可提供的任务定义。
  function questDefinitionsForGiver(giver) {
    return Object.values(QUEST_DEFS).filter((quest) => quest.giver === giver) as any[];
  }

  // 确保新版多任务列表存在，兼容旧存档。
  function ensureQuestList() {
    state.quests = Array.isArray(state.quests) ? state.quests : [];
    return state.quests;
  }

  // 计算任务金币奖励，兼容固定值和按楼层动态计算两种写法。
  function questRewardGold(def, floor = state.floor) {
    const base = typeof def.rewardGold === "function" ? def.rewardGold(floor) : def.rewardGold || 0;
    const multiplier = floor === state.floor ? floorEffectReward() : 1;
    return Math.max(0, Math.round(base * multiplier));
  }

  function floorEffectReward() {
    return state?.map?.effect?.reward || 1;
  }

  // 根据任务定义创建当前楼层的任务进度状态。
  function createQuestState(def, floor = state.floor) {
    return {
      id: def.id,
      giver: def.giver,
      floor,
      targetFloor: def.targetFloor || floor,
      kills: 0,
      target: def.target,
      roomId: def.roomId || null,
      roomName: def.roomName || null,
      targetRoomName: def.targetRoomName || def.roomName || null,
      rescueName: def.rescueName || null,
      doorKeyId: def.doorKeyId || null,
      doorKeyName: def.doorKeyName || null,
      roomCleared: false,
      rescued: false,
      accepted: true,
      completed: false,
      claimed: false
    };
  }

  // 从任务列表中查找指定楼层、房间的任务状态。
  function questState(id, floor = state.floor, roomId = null) {
    return ensureQuestList().find(
      (quest) => quest.id === id && quest.floor === floor && (!roomId || quest.roomId === roomId)
    );
  }

  function questLocationText(questOrDef) {
    const targetFloor = questOrDef.targetFloor || questOrDef.floor || state.floor;
    const room = questOrDef.targetRoomName || questOrDef.roomName || "";
    return `第 ${targetFloor} 层${room ? ` · ${room}` : ""}`;
  }

  // 接受任务并写入任务列表，旧版巡夜人任务同步到 state.quest。
  function acceptQuest(id, source = null) {
    const def = source ? questDefFromSource(source.type || "questNpc", source) : QUEST_DEFS[id];
    if (!def) return null;
    let quest = questState(id, state.floor, def.roomId);
    if (!quest) {
      quest = createQuestState(def);
      ensureQuestList().push(quest);
    }
    quest.accepted = true;
    if (id === "wardenErrand") state.quest = quest;
    advanceTutorial(state, "quest");
    log(`接受任务：${def.title}。`);
    render();
    return quest;
  }

  // 打开任务发布者弹窗，展示任务进度、奖励和可执行操作。
  function openQuestFromGiver(giver, source = null) {
    const def = questDefFromSource(giver, source);
    if (!def) {
      showEvent("暂无任务", "<p>这里暂时没有新的委托。</p>", "离开");
      return;
    }
    const quest = questState(def.id, state.floor, def.roomId);
    const progress = quest || { ...createQuestState(def), accepted: false };
    const remaining = Math.max(0, def.target - progress.kills);
    const location = questLocationText(progress);
    const rewardGold = questRewardGold(def, progress.floor);
    const rewardParts = [
      def.rewardKeys ? `符文钥匙 +${def.rewardKeys}` : "",
      def.rewardDoorKey ? `${def.doorKeyName || progress.doorKeyName || "房门钥匙"} +1` : "",
      rewardGold ? `金币 +${rewardGold}` : "",
      def.rewardPotion ? "小型生命药水 +1" : ""
    ]
      .filter(Boolean)
      .join("<br>");
    const body = `
    <div class="quest-panel">
      <b>${def.giverName}</b>
      <p>${def.desc}</p>
      <small>目标：${location} · 进度：${progress.kills}/${def.target}${remaining ? `，还差 ${remaining} 个。` : progress.completed ? "，可以领取奖励。" : "，去确认被困者安全。"}</small>
      <div class="quest-reward">${rewardParts}</div>
    </div>
  `;
    const actions = [];
    if (!quest) {
      actions.push({
        text: "接受任务",
        action: () => {
          closeModal();
          acceptQuest(def.id, source);
        }
      });
    } else if (quest.completed && !quest.claimed) {
      actions.push({
        text: "领取奖励",
        action: () => {
          closeModal();
          claimQuestReward(def.id, def.roomId);
        }
      });
    } else {
      actions.push({ text: quest.claimed ? "已领取" : "继续任务", action: closeModal });
    }
    actions.push({ text: "离开", action: closeModal });
    showModal(def.title, body, actions);
  }

  // 发放任务奖励，并把任务标记为已领取。
  function claimQuestReward(id, roomId = null) {
    const quest = questState(id, state.floor, roomId);
    const def =
      quest?.id === "rescueRoom"
        ? {
            ...QUEST_DEFS.rescueRoom,
            roomId: quest.roomId,
            roomName: quest.roomName,
            rescueName: quest.rescueName,
            target: quest.target,
            giverName: "救援斥候卡尔"
          }
        : quest?.id === "lockedRoomKey"
          ? {
              ...QUEST_DEFS.lockedRoomKey,
              roomId: quest.roomId,
              roomName: quest.roomName,
              doorKeyId: quest.doorKeyId,
              doorKeyName: quest.doorKeyName,
              title: `${quest.roomName || "房门"}钥匙委托`,
              giverName: "钥匙保管人"
            }
          : QUEST_DEFS[id];
    if (!def || !quest || !quest.completed || quest.claimed) return;
    const rewardGold = questRewardGold(def, quest.floor);
    quest.claimed = true;
    state.keys = (state.keys || 0) + (def.rewardKeys || 0);
    if (def.rewardDoorKey && quest.doorKeyId) {
      state.doorKeys = state.doorKeys || {};
      state.doorKeyNames = state.doorKeyNames || {};
      state.doorKeys[quest.doorKeyId] = (state.doorKeys[quest.doorKeyId] || 0) + 1;
      state.doorKeyNames[quest.doorKeyId] = quest.doorKeyName || def.doorKeyName || "房门钥匙";
    }
    state.gold += rewardGold;
    if (def.rewardPotion) {
      state.inventory = state.inventory || [];
      state.inventory.push(potion("小型生命药水", "hp", 18));
    }
    log(`完成任务：${def.title}。`);
    showEvent(
      "任务完成",
      `<p>${def.giverName}交付了报酬。</p><p>${[
        def.rewardKeys ? `符文钥匙 +${def.rewardKeys}` : "",
        def.rewardDoorKey && quest.doorKeyId
          ? `${quest.doorKeyName || def.doorKeyName || "房门钥匙"} +1`
          : "",
        rewardGold ? `金币 +${rewardGold}` : "",
        def.rewardPotion ? "小型生命药水 +1" : ""
      ]
        .filter(Boolean)
        .join("<br>")}</p>`,
      "收下"
    );
    playSound("quest");
    render();
  }

  // 与救援目标对话，按房间清理状态推进救援任务。
  function openRescueNpc(obj) {
    const quest = questState("rescueRoom", state.floor, obj.roomId);
    const name = obj.npcName || "被困者";
    if (!quest?.accepted) {
      showEvent(
        name,
        `<p>${name}被困在${roomName(obj.roomId)}，需要先找到救援斥候接下委托。</p>`,
        "知道了"
      );
      return;
    }
    if (!quest.roomCleared) {
      showEvent(
        name,
        `<p>${name}低声提醒：房间里还有怪物。先清理${quest.roomName || roomName(obj.roomId)}。</p>`,
        "继续"
      );
      return;
    }
    quest.rescued = true;
    quest.completed = true;
    log(`${name}已经安全，回到${quest.giverName || "救援斥候卡尔"}处领取报酬。`);
    playSound("quest");
    showEvent("救援完成", `<p>${name}已经安全。回到救援斥候卡尔处领取报酬。</p>`, "继续");
    render();
  }

  // 随机生成装备掉落，包含部位、品质、属性和符文槽数量。
  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    acceptQuest: withState(acceptQuest),
    claimQuestReward: withState(claimQuestReward),
    createQuestState,
    currentQuestSource: withState(currentQuestSource),
    ensureQuest: withState(ensureQuest),
    ensureQuestList: withState(ensureQuestList),
    openQuestFromGiver: withState(openQuestFromGiver),
    openQuestNpc: withState(openQuestNpc),
    openRescueNpc: withState(openRescueNpc),
    questDefFromSource: withState(questDefFromSource),
    questDefinitionsForGiver,
    questLocationText,
    questRewardGold,
    questState: withState(questState)
  };
}
