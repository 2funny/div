import { advanceTutorial } from "../tutorial/tutorial";
import {
  adjustFactionLeaning,
  adjustMerchantTrust,
  adjustRelation,
  recordRescuedNpc,
  relationLabel,
  relationRewardBonus
} from "./narrative";
import { choice } from "../random";
import { RUNES } from "../constants";
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
  const grantSkillScrollReward = (...args) => api.grantSkillScrollReward?.(...args);
  const canLearnSkill = (...args) => api.canLearnSkill?.(...args);
  const classSkills = (...args) => api.classSkills?.(...args) || [];
  const isSkillLearned = (...args) => api.isSkillLearned?.(...args);
  const learnSkill = (...args) => api.learnSkill?.(...args);
  const skillRequirementText = (...args) => api.skillRequirementText?.(...args) || "";
  const teleportBeacon = (...args) => api.teleportBeacon?.(...args);
  function openQuestNpc(source = null) {
    if (source?.trainer) {
      openSkillTrainer(source);
      return;
    }
    openQuestFromGiver("questNpc", source || currentQuestSource("questNpc"));
  }

  function openSkillTrainer(source = null) {
    const name = source?.npcName || "职业导师";
    const skills = classSkills()
      .filter((skill) => !isSkillLearned(skill.id))
      .sort((a, b) => Number(canLearnSkill(b.id)) - Number(canLearnSkill(a.id)));
    const learnable = skills.filter((skill) => canLearnSkill(skill.id));
    const rows = skills
      .slice(0, 6)
      .map((skill) => {
        const ready = canLearnSkill(skill.id);
        return `<article class="quest-row skill-row inventory-card ${ready ? "learnable" : "locked unmet"}"><div><b>${skill.name}</b><small class="${ready ? "" : "skill-requirement unmet"}">${ready ? skill.desc : skillRequirementText(skill)}</small><span class="item-tags"><i>${skillRequirementText(skill)}</i></span></div><span class="quest-state ${ready ? "" : "danger"}">${ready ? "可学习" : "未满足"}</span></article>`;
      })
      .join("");
    const actions = [
      ...learnable.slice(0, 6).map((skill) => ({
        text: `学习${skill.name}`,
        action: () => {
          closeModal();
          learnSkill(skill.id, "导师训练");
          source.trained = true;
        }
      })),
      { text: "离开", action: closeModal }
    ];
    showModal(
      name,
      `<div class="quest-panel"><b>${name}</b><p>导师会教授当前职业已经满足前置的新技能；战斗仍最多携带 4 个技能。</p></div><section class="quest-list">${rows || "<p>暂时没有可教授的新技能。</p>"}</section>`,
      actions
    );
  }

  // 读取当前格子上的任务来源物件，供任务弹窗生成动态文案。
  function currentQuestSource(type) {
    const obj = state?.map?.cells?.[state.player?.y]?.[state.player?.x]?.object;
    return obj?.type === type ? obj : null;
  }

  // 根据 NPC 或商人来源合成任务定义，救援任务会补入房间信息。
  function questDefFromSource(giver, source = null) {
    const id = source?.questId || (giver === "shop" ? merchantQuestId() : null);
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
      return {
        ...base,
        giverName: source?.npcName || base.giverName,
        target: source?.target || base.target,
        targetFloor,
        targetRoomName
      };
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

  // 获取某类任务发布者可提供的任务定义。
  function questDefinitionsForGiver(giver) {
    return Object.values(QUEST_DEFS).filter((quest) => quest.giver === giver) as any[];
  }

  function merchantQuestId() {
    const chain = state?.questChains || {};
    if ((state.floor || 1) >= 6 && Number(chain.merchantCache || 0) <= Number(chain.merchantRoute || 0)) {
      return "merchantCache";
    }
    return "merchantRoute";
  }

  // 读取当前任务列表。
  function ensureQuestList() {
    return state.quests;
  }

  // 计算任务金币奖励，支持固定值和按楼层动态计算两种定义写法。
  function questRewardGold(def, floor = state.floor) {
    const base = typeof def.rewardGold === "function" ? def.rewardGold(floor) : def.rewardGold || 0;
    const multiplier = floor === state.floor ? floorEffectReward() : 1;
    const relationMultiplier = 1 + relationRewardBonus(state, relationForQuest(def));
    return Math.max(0, Math.round(base * multiplier * relationMultiplier));
  }

  function relationForQuest(def) {
    if (def.relation) return def.relation;
    if (def.id === "merchantRoute" || def.giver === "shop") return "merchants";
    if (def.id === "rescueRoom") return "survivors";
    return "wardens";
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

  // 接受任务并写入任务列表。
  function acceptQuest(id, source = null) {
    const def = source ? questDefFromSource(source.type || "questNpc", source) : QUEST_DEFS[id];
    if (!def) return null;
    let quest = questState(id, state.floor, def.roomId);
    if (!quest) {
      quest = createQuestState(def);
      ensureQuestList().push(quest);
    }
    quest.accepted = true;
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
    const relationText = relationLabel(state, relationForQuest(def));
    const rewardParts = [
      def.rewardKeys ? `符文钥匙 +${def.rewardKeys}` : "",
      def.rewardDoorKey ? `${def.doorKeyName || progress.doorKeyName || "房门钥匙"} +1` : "",
      rewardGold ? `金币 +${rewardGold}` : "",
      def.rewardSkillPoints ? `技能点 +${def.rewardSkillPoints}` : "",
      def.rewardSkillDust ? `技能尘 +${def.rewardSkillDust}` : "",
      def.rewardSkillScroll ? "职业技能卷轴" : "",
      def.rewardRune ? "随机符文 +1" : "",
      def.rewardBeacon ? "商路信标 +1" : "",
      def.rewardUniversalKey ? "万能钥匙 +1" : "",
      def.rewardPotion ? potionRewardText(def.rewardPotion) : ""
    ]
      .filter(Boolean)
      .join("<br>");
    const body = `
    <div class="quest-panel">
      <b>${def.giverName}</b>
      <p>${def.desc}</p>
      <div class="event-tags"><span>${relationText}</span></div>
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
    const relationId = relationForQuest(def);
    adjustRelation(state, relationId, def.id === "rescueRoom" ? 2 : 1);
    if (relationId === "merchants") adjustMerchantTrust(state, 1);
    if (relationId === "survivors") adjustFactionLeaning(state, "survivors", 1);
    if (relationId === "wardens") adjustFactionLeaning(state, "wardens", 1);
    if (relationId === "runebound") adjustFactionLeaning(state, "runebound", 1);
    state.keys = (state.keys || 0) + (def.rewardKeys || 0);
    if (def.rewardDoorKey && quest.doorKeyId) {
      state.doorKeys = state.doorKeys || {};
      state.doorKeyNames = state.doorKeyNames || {};
      state.doorKeys[quest.doorKeyId] = (state.doorKeys[quest.doorKeyId] || 0) + 1;
      state.doorKeyNames[quest.doorKeyId] = quest.doorKeyName || def.doorKeyName || "房门钥匙";
    }
    state.gold += rewardGold;
    state.skillPoints = (state.skillPoints || 0) + (def.rewardSkillPoints || 0);
    state.skillDust = (state.skillDust || 0) + (def.rewardSkillDust || 0);
    const scrollReward = def.rewardSkillScroll ? grantSkillScrollReward(def.giverName) : "";
    const runeReward = grantRuneReward(def);
    const beaconReward = grantBeaconReward(def);
    const universalKeyReward = grantUniversalKeyReward(def);
    if (def.rewardPotion) {
      state.inventory = state.inventory || [];
      state.inventory.push(
        def.rewardPotion === "mp" ? potion("小型法力药水", "mp", 12) : potion("小型生命药水", "hp", 18)
      );
    }
    if (def.chainFlag) markQuestChain(def.chainFlag);
    log(`完成任务：${def.title}。`);
    showEvent(
      "任务完成",
      `<p>${def.giverName}交付了报酬。</p><p>${[
        def.rewardKeys ? `符文钥匙 +${def.rewardKeys}` : "",
        def.rewardDoorKey && quest.doorKeyId
          ? `${quest.doorKeyName || def.doorKeyName || "房门钥匙"} +1`
          : "",
        rewardGold ? `金币 +${rewardGold}` : "",
        def.rewardSkillPoints ? `技能点 +${def.rewardSkillPoints}` : "",
        def.rewardSkillDust ? `技能尘 +${def.rewardSkillDust}` : "",
        scrollReward,
        runeReward,
        beaconReward,
        universalKeyReward,
        def.rewardPotion ? potionRewardText(def.rewardPotion) : ""
      ]
        .filter(Boolean)
        .join("<br>")}</p><p>${relationLabel(state, relationId)}。</p>`,
      "收下"
    );
    playSound("quest");
    render();
  }

  function potionRewardText(kind) {
    return kind === "mp" ? "小型法力药水 +1" : "小型生命药水 +1";
  }

  function grantRuneReward(def) {
    if (!def.rewardRune) return "";
    const rune = `${choice(RUNES)}1`;
    state.runes = state.runes || {};
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    return `${rune}符文 +1`;
  }

  function grantBeaconReward(def) {
    if (!def.rewardBeacon || !teleportBeacon) return "";
    state.inventory = state.inventory || [];
    state.inventory.push(teleportBeacon());
    return "商路信标 +1";
  }

  function grantUniversalKeyReward(def) {
    if (!def.rewardUniversalKey) return "";
    state.universalKeys = (state.universalKeys || 0) + 1;
    return "万能钥匙 +1";
  }

  function markQuestChain(flag) {
    state.questChains = state.questChains || {};
    state.questChains[flag] = Number(state.questChains[flag] || 0) + 1;
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
    adjustRelation(state, "survivors", 2);
    adjustFactionLeaning(state, "survivors", 2);
    recordRescuedNpc(state, `${state.floor}:${obj.roomId}:${name}`);
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
