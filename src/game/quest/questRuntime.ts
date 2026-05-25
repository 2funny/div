import { advanceTutorial } from "../tutorial/tutorial";
import {
  adjustFactionLeaning,
  adjustMerchantTrust,
  adjustRelation,
  endingQuestRewardBonus,
  narrativeBranchMilestone,
  questImpactText,
  questRelationId,
  questOutcomeKey,
  recordQuestOutcome,
  recordRescuedNpc,
  relationLabel,
  relationRewardBonus
} from "./narrative";
import { choice } from "../random";
import { ASSETS, CLASSES, RUNES } from "../constants";
import { QUEST_DEFS } from "./quests";
import { escapeHtml } from "../render/html";

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
    const questSource = source || currentQuestSource("questNpc");
    const def = questDefFromSource("questNpc", questSource);
    openQuestDialogue(questSource);
  }

  function openQuestDialogue(source = null, step = 0) {
    const def = questDefFromSource("questNpc", source);
    if (!def) {
      showEvent("暂无任务", "<p>这里暂时没有新的委托。</p>", "离开");
      return;
    }
    const quest = questState(def.id, state.floor, def.roomId);
    const name = def.giverName || source?.npcName || "委托人";
    const dialogue = questDialogueState(def, quest, step);
    const actions = [];
    if (!quest) {
      if (dialogue.hasNext) {
        actions.push({
          text: "继续",
          action: () => openQuestDialogue(source, dialogue.nextStep)
        });
      } else {
        actions.push({
          text: "查看委托",
          action: () => openQuestFromGiver("questNpc", source)
        });
      }
    } else if (quest.completed && !quest.claimed) {
      actions.push({
        text: "查看报酬",
        action: () => openQuestFromGiver("questNpc", source)
      });
    }
    actions.push({ text: "离开", action: closeModal });
    showModal(
      "对话",
      `
      <div class="npc-dialogue-scene">
        <div class="npc-portrait left muted">${portraitMarkup(heroPortraitSrc(), CLASSES[state.classId || "warrior"]?.name || "你")}</div>
        <div class="npc-dialogue-bubble">
          <span class="npc-dialogue-speaker">${escapeHtml(name)}</span>
          <p>${escapeHtml(dialogueLineText(dialogue.text))}</p>
          ${dialogue.hint ? `<small>${escapeHtml(dialogue.hint)}</small>` : ""}
        </div>
        <div class="npc-portrait right speaking">${portraitMarkup(ASSETS.questNpc, name)}</div>
      </div>
    `,
      actions
    );
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
    const relationId = relationForQuest(def);
    const relationMultiplier = 1 + relationRewardBonus(state, relationId) + endingQuestRewardBonus(state, relationId);
    return Math.max(0, Math.round(base * multiplier * relationMultiplier));
  }

  function relationForQuest(def) {
    return questRelationId(def);
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
      .map((part) => escapeHtml(String(part)))
      .join("<br>");
    const safeGiverName = escapeHtml(def.giverName);
    const safeTitle = escapeHtml(def.title);
    const safeDesc = escapeHtml(def.desc);
    const safeLocation = escapeHtml(location);
    const safeBackground = escapeHtml(questBackgroundText(def));
    const progressText = `进度 ${progress.kills}/${def.target}${
      remaining ? `，还差 ${remaining} 个` : progress.completed ? "，可以领取奖励" : "，去确认被困者安全"
    }`;
    const body = `
    <div class="quest-contract-shell">
      <article class="quest-contract quest-contract-board">
        <header class="quest-contract-head">
          <div class="quest-contract-kicker">
            <span class="quest-contract-giver">委托</span>
            <span>任务摘要</span>
          </div>
          <b class="quest-contract-title">${safeTitle}</b>
          <small>${safeDesc}</small>
        </header>
        <div class="quest-contract-meta">
          <span><b>委托人</b><strong>${safeGiverName}</strong></span>
          <span><b>地点</b><strong>${safeLocation}</strong></span>
        </div>
        <section class="quest-contract-background">
          <b>背景</b>
          <span>${safeBackground}</span>
        </section>
        <div class="quest-contract-grid quest-contract-brief">
          <section>
            <b>目标</b>
            <small>${safeLocation}</small>
            <span>${escapeHtml(progressText)}</span>
          </section>
          <section class="quest-contract-reward">
            <b>报酬</b>
            <span>${rewardParts}</span>
          </section>
        </div>
      </article>
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
    showModal("委托详情", body, actions);
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
              giverName: "钥匙保管人诺维"
            }
          : QUEST_DEFS[id];
    if (!def || !quest || !quest.completed || quest.claimed) return;
    const rewardGold = questRewardGold(def, quest.floor);
    quest.claimed = true;
    recordQuestOutcome(state, questOutcomeKey(quest), "completed");
    const relationId = relationForQuest(def);
    adjustRelation(state, relationId, def.id === "rescueRoom" ? 2 : 1);
    if (relationId === "merchants") adjustMerchantTrust(state, 1);
    if (relationId === "survivors") adjustFactionLeaning(state, "survivors", 1);
    if (relationId === "wardens") adjustFactionLeaning(state, "wardens", 1);
    if (relationId === "runebound") adjustFactionLeaning(state, "runebound", 1);
    const milestone = narrativeBranchMilestone(state, relationId);
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
    const impactText = questImpactText(state, def);
    if (def.rewardPotion) {
      state.inventory = state.inventory || [];
      state.inventory.push(
        def.rewardPotion === "mp" ? potion("小型法力药水", "mp", 12) : potion("小型生命药水", "hp", 18)
      );
    }
    if (def.chainFlag) markQuestChain(def.chainFlag);
    log(`${impactText}${milestone ? ` ${milestone}` : ""}`);
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
        .join("<br>")}</p><p>${relationLabel(state, relationId)}。</p>${milestone ? `<p class="quest-impact">${milestone}</p>` : ""}`,
      "收下"
    );
    playSound("quest");
    render();
  }

  function potionRewardText(kind) {
    return kind === "mp" ? "小型法力药水 +1" : "小型生命药水 +1";
  }

  function questDialogueText(def) {
    return questDialogueCopy(def).lines[0] || "";
  }

  function questBackgroundText(def) {
    return questDialogueCopy(def).background;
  }

  function questDialogueCopy(def) {
    const room = def.roomName || def.targetRoomName || "目标房间";
    const rescue = def.rescueName || "被困者";
    const rescueName = rescueStoryName(rescue);
    const copies = {
      rescueRoom: {
        lines: [
          `${room}里被困的应该是${rescue}。我在门外听见了他留下的敲墙暗号。`,
          `${rescueName}几天前外出采矿后就失踪了，我们沿着矿灯灰一路追到这里。`,
          "我带人试着靠近过，门缝里全是怪物拖行铁器的声音。",
          "先把里面清出来，再和人确认安全。只要还有回应，我就不能把人留在那里。"
        ],
        background: `卡尔的救援队在${room}外听见求救暗号，但门后怪物太密，贸然开门会把${rescue}推到更危险的位置。先清掉房间里的威胁，再和${rescue}确认安全；这条线会接到伊芙的幸存者暗记支线。`
      },
      wardenErrand: {
        lines: [
          "我昨夜巡灯时少了三盏，它们全灭在同一段路上。",
          "那不是灯油的问题，是怪物学会了等我们换岗。",
          "你把那段路重新压住，我就把符文钥匙交给你，赛拉那边也能收到这层的灯号。"
        ],
        background: "罗恩负责浅层巡夜线，赛拉负责把这些灯号接到更深层封印。清理本层目标可以恢复巡逻路线，并让后续巡夜接力、封印巡检更容易出现。"
      },
      eliteBounty: {
        lines: [
          "我把这只精英标成了红线目标，它一直沿着巡夜界线走。",
          "它不是迷路，它是在记我们什么时候会退。",
          "请把它处理掉。等它带着其他东西冲过来，赛拉的封印点会先被撕开。"
        ],
        background: "罗恩的悬赏名单只记录会组织反扑的精英目标。处理它能削弱本层压力，保护赛拉后续封印巡检的路线。"
      },
      roomPurge: {
        lines: [
          `我看到${room}的门楣一直在跳字，像有人在里面反复写同一句话。`,
          "我的测绘笔一靠近那里就会自己改线，地图回路已经偏了。",
          "清干净那里，我才能回收异常残响，后面的符文测绘才有基准。"
        ],
        background: "缇雅先记录异常房间，再把残响送去校准装备符文槽。净化房间能稳定该区域，并衔接符文测绘、符文校准支线。"
      },
      lockedRoomKey: {
        lines: [
          `我封住了${room}。门后不是没有东西，是东西太多了。`,
          "如果现在开门，外面的怪物会一起涌进去，里面的东西也会出来。",
          "先清理附近，我再把专用钥匙交给你；玛拉偶尔也能弄到万能钥匙，但别指望每次都有。"
        ],
        background: `诺维保管${room}的专用符文钥匙，他只在门外威胁被压住后交钥匙。完成委托后可获得这道门的专用钥匙；商队管事玛拉的万能钥匙也能作为替代路线。`
      },
      runeSurvey: {
        lines: [
          "你听见墙里那种低声重复了吗？我敢说那不是风，是符文回声。",
          "我的测绘笔已经画出三条互相矛盾的路，再画下去会把后来的人带错。",
          "清出一段安静区域，我才能把回路重新测下来。"
        ],
        background: "缇雅用测绘资料判断地牢回路何时改写，但回声目标会让记录失真。清理干扰源后，测绘结果会转化为技能资源，并推进缇雅的符文校准支线。"
      },
      wardenSeal: {
        lines: [
          "我刚检查过封条，边缘开始冒黑灰，说明下面有东西在顶它。",
          "守卫被这股气息引来，不处理掉，封印会越裂越大。",
          "帮我巡检这段封条，别让罗恩刚补回来的巡夜线在今晚断开。"
        ],
        background: "赛拉负责深层封印巡检，她会根据罗恩的浅层灯号判断哪里需要加固。完成后会奖励钥匙和技能点，并让巡夜路线继续向深层推进。"
      },
      wardenRelay: {
        lines: [
          "我在等上一盏前哨灯，可它到现在都没有亮。",
          "我要把罗恩的浅层情报送到封印点，不能让后面的人盲着眼往深处走。",
          "你打通这一段，下一名传令员才能接上路线。"
        ],
        background: "赛拉的巡夜接力把罗恩的浅层情报送往深层封印点。完成它会推进巡夜人任务链，后续更容易触发封印巡检和精英悬赏。"
      },
      survivorTrace: {
        lines: [
          "墙上的三道短痕是我教给幸存者的记号，不是旧划痕。",
          "暗记到前面突然断了，说明留下它的人开始被追。",
          "把追踪者清掉，后面的人才敢沿这条线走，卡尔救出来的人也会认得它。"
        ],
        background: "伊芙整理幸存者留下的暗记，卡尔救出的人会沿这些记号撤离。追踪者会反向寻找暗记源头，清理它们能让幸存者路线更可靠，并衔接撤离掩护支线。"
      },
      survivorEscort: {
        lines: [
          "我留下的这条撤离暗记已经被怪物闻到了，它们开始沿着记号回头找。",
          "我知道后面还有人会照着它走，如果不挡住追来的东西，他们会直接撞进死路。",
          "替我们守住这段路，至少撑到暗记被改掉。"
        ],
        background: "伊芙的撤离掩护保护的是一整条临时安全线，不是单个人。完成后幸存者会在后续事件中留下更多补给和路线线索。"
      },
      runeCalibration: {
        lines: [
          "我发现有些怪物身上挂着符文回声，像把坏掉的钟带在骨头里。",
          "它们倒下时会留下短暂频率，正好能校准装备上的符文槽。",
          "击败这些目标，我就能把那段频率收回来。"
        ],
        background: "缇雅先测绘回路，再用战斗残留校准符文槽频率。完成该委托后，可以更稳定地获得符文和技能尘。"
      },
      merchantRoute: {
        lines: [
          "我的补给车不怕路远，怕的是路每晚都变。",
          "这段商路附近又有怪物靠过来，搬药的人不敢进。",
          "你把路清出来，后面的补给才跟得上。"
        ],
        background: "商队管事玛拉依靠短距离安全路线搬运药水和信标。帮她清路能恢复补给通道，并让后续交易和补给回收支线更稳定。"
      },
      merchantCache: {
        lines: [
          "我有批补给箱被怪物压在岔路口，那里面不是普通药水。",
          "里面有信标配件和法力补给，是往深层走的人最缺的东西。",
          "拿回来，我给你更适合远行的工具，也会把你的名字记进商队账本。"
        ],
        background: "玛拉的补给回收会恢复商队深层库存。完成后商队能提供信标、法力补给和其他远行资源。"
      }
    };
    return copies[def.id] || {
      lines: [
        "我这里有份委托，有点棘手。",
        "事情不是今天才开始，只是现在终于压不住了。",
        "报酬已经备好，你愿意听听细节吗？"
      ],
      background: "这是一份临时委托，完成后会推进对应支线，并改变后续部分事件回应。"
    };
  }

  function questDialogueState(def, quest = null, step = 0) {
    if (!quest) {
      const lines = questDialogueCopy(def).lines.filter(Boolean);
      const safeStep = Math.max(0, Math.min(lines.length - 1, Number(step) || 0));
      return {
        text: lines[safeStep] || questDialogueText(def),
        hint: "",
        hasNext: safeStep < lines.length - 1,
        nextStep: safeStep + 1
      };
    }
    if (quest.claimed) {
      return {
        text: "谢谢你。刚才那条路已经安静下来了，后面的人会记住这份人情。",
        hint: "这个委托已经完成并领取报酬。"
      };
    }
    if (quest.completed) {
      return {
        text: "辛苦了，我已经听见那边安静下来。来，把约好的报酬拿上。",
        hint: "委托已经完成，可以领取报酬。"
      };
    }
    return {
      text: `请继续，目标还没有清完。现在是 ${quest.kills || 0}/${quest.target || def.target}。`,
      hint: "已接受的委托会在任务页继续追踪。"
    };
  }

  function dialogueLineText(text = "") {
    return String(text).replace(/[“”]/g, "");
  }

  function rescueStoryName(name = "") {
    return String(name).replace(/^(矿工|斥候|学徒|商贩|巡夜人|记录员)/u, "") || String(name) || "他";
  }

  function portraitMarkup(src, alt) {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" draggable="false"><span class="npc-nameplate">${escapeHtml(alt)}</span>`;
  }

  function heroPortraitSrc() {
    if (state.classId === "mage") return ASSETS.mage;
    if (state.classId === "ranger") return ASSETS.ranger;
    return ASSETS.warrior;
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
