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
        (dialogue.choices || []).forEach((option, index) => {
          actions.push({
            text: option.text,
            action: () => openQuestDialogueChoice(source, index)
          });
        });
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
    showModal("对话", dialogueSceneMarkup(dialogue, name), actions);
  }

  function openQuestDialogueChoice(source = null, choiceIndex = 0, phase = "hero") {
    const def = questDefFromSource("questNpc", source);
    if (!def) {
      showEvent("暂无任务", "<p>这里暂时没有新的委托。</p>", "离开");
      return;
    }
    const name = def.giverName || source?.npcName || "委托人";
    const option = questDialogueChoice(def, choiceIndex);
    const speaker = phase === "npc" && option.followup ? "npc" : "hero";
    const text = speaker === "npc" ? option.followup : option.reply;
    const actions = [];
    if (speaker === "hero" && option.followup) {
      actions.push({
        text: "继续",
        action: () => openQuestDialogueChoice(source, choiceIndex, "npc")
      });
    } else {
      actions.push({
        text: "查看委托",
        action: () => openQuestFromGiver("questNpc", source)
      });
    }
    actions.push({ text: "离开", action: closeModal });
    showModal("对话", dialogueSceneMarkup({ speaker, text, hint: "" }, name), actions);
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
    return dialogueEntryText(questDialogueCopy(def).lines[0]) || "";
  }

  function questBackgroundText(def) {
    return questDialogueCopy(def).background;
  }

  function questDialogueCopy(def) {
    const room = def.roomName || def.targetRoomName || "目标房间";
    const rescue = def.rescueName || "被困者";
    const rescueName = rescueStoryName(rescue);
    const npc = (text) => ({ speaker: "npc", text });
    const hero = (text) => ({ speaker: "hero", text });
    const copies = {
      rescueRoom: {
        lines: [
          npc(`${room}里被困的应该是${rescue}。我在门外听见了他留下的敲墙暗号。`),
          npc(`${rescueName}几天前外出采矿后就失踪了，我们沿着矿灯灰一路追到这里。`),
          hero("我听见了。只要里面还有回应，我会进去确认，不会只把门口清干净就走。"),
          npc("小心些。门缝里全是怪物拖行铁器的声音，像是在等外面的人先慌。"),
          npc("先把里面清出来，再和人确认安全。救出来的人会沿伊芙的暗记撤走，别让这条线断在这里。")
        ],
        choices: [
          {
            text: "追问暗号",
            reply: "这些敲墙暗号和伊芙的暗记是一套东西？我需要知道救出来的人该往哪里走。",
            followup:
              "卡尔点头。三短一长是还活着，墙角双痕是撤离方向。你救出人，伊芙会接住后面的路。"
          },
          {
            text: "先救人",
            reply: "我先进去。等我把人带出来，再谈这条撤离线还欠谁一个名字。",
            followup: "卡尔握紧斥候刀。好，我守门外。只要你敲三下，我就知道里面还有人能走。"
          }
        ],
        background: `卡尔的救援队在${room}外听见求救暗号，但门后怪物太密，贸然开门会把${rescue}推到更危险的位置。先清掉房间里的威胁，再和${rescue}确认安全；救出的人会被伊芙的幸存者暗记接走，也会成为后续撤离线的证词。`
      },
      wardenErrand: {
        lines: [
          npc("我昨夜巡灯时少了三盏，它们全灭在同一段路上。"),
          npc("那不是灯油的问题，是怪物学会了等我们换岗，等巡夜线出现空隙。"),
          hero("如果我把这段路夺回来，你们的灯号就能接到更深处？"),
          npc("能。赛拉会沿着这盏灯往下找封条，玛拉也敢把补给车推近一点。"),
          npc("你把那段路重新压住，我把符文钥匙交给你。后面的黑暗，我们一段一段算。")
        ],
        choices: [
          {
            text: "追问灯号",
            reply: "我想知道这盏灯会交到谁手里。别让我只替一张地图擦亮边角。",
            followup: "罗恩把手指按在地图的断线处。下一段会到赛拉那里，她守的是封印，不只是路。"
          },
          {
            text: "应下巡夜",
            reply: "我会把路压回去。钥匙准备好，等我回来别让灯再灭。",
            followup: "罗恩短促地笑了一下。只要你回来，我就让这层每一盏灯都替你亮着。"
          }
        ],
        background:
          "罗恩负责浅层巡夜线，赛拉负责把灯号接到更深层封印，玛拉的商队则等着安全路段恢复后推进补给。清理本层目标会让巡夜接力、封印巡检和商路补给在同一条线路上重新接通。"
      },
      eliteBounty: {
        lines: [
          npc("我把这只精英标成了红线目标，它一直沿着巡夜界线走。"),
          npc("它不是迷路，它是在记我们什么时候会退，什么时候只剩一盏灯。"),
          hero("也就是说，它盯上的不是我，是你们整条防线。"),
          npc("对。它一旦带着别的东西冲过来，赛拉的封印点会先被撕开。"),
          npc("请把它处理掉。你不是替我拿悬赏，是替后面的每一次巡检买时间。")
        ],
        choices: [
          {
            text: "询问弱点",
            reply: "它沿界线走，一定也在躲什么。告诉我它最怕哪段路。",
            followup: "罗恩指向一枚熄灭的灯钉。它怕光重新连起来。把它逼回这段灯线，别让它进封印区。"
          },
          {
            text: "接受悬赏",
            reply: "我会截住它。悬赏归悬赏，封印点不能先碎在我身后。",
            followup: "罗恩把红线标记交给你。好。等赛拉看见这道红线断掉，她会知道路还守得住。"
          }
        ],
        background:
          "罗恩的悬赏名单只记录会组织反扑的精英目标。处理它能削弱本层压力，保护赛拉封印巡检的路线，也让玛拉的补给车不必绕开整片巡夜区。"
      },
      roomPurge: {
        lines: [
          npc(`我看到${room}的门楣一直在跳字，像有人在里面反复写同一句话。`),
          npc("我的测绘笔一靠近那里就会自己改线，地图回路已经偏了。"),
          hero("如果地图会被它改写，后面进来的人看到的路就不一定是真的。"),
          npc("所以要先净化房间。残响收回来后，我才能把测绘图交给赛拉和伊芙校对。"),
          npc("清干净那里，后面的符文测绘才有基准，你装备上的符文槽也能少一些杂音。")
        ],
        choices: [
          {
            text: "追问残响",
            reply: "门楣上的字如果在重复旧命令，那它是在提醒我们，还是在诱导我们？",
            followup: "缇雅把测绘笔收进袖口。两者都有。先让它安静，我们才知道哪一句是真路标。"
          },
          {
            text: "确认净化",
            reply: "我去把房间清出来。你负责把剩下的回声写成我看得懂的路。",
            followup: "缇雅轻轻点头。我会把它写进图里，也写进你下一次看见的符文槽里。"
          }
        ],
        background:
          "缇雅先记录异常房间，再把残响送去校准装备符文槽。净化房间能稳定该区域，避免伊芙的暗记和赛拉的封条被错误地图误导，并衔接符文测绘、符文校准支线。"
      },
      lockedRoomKey: {
        lines: [
          npc(`我封住了${room}。门后不是没有东西，是东西太多了。`),
          npc("如果现在开门，外面的怪物会一起涌进去，里面的东西也会出来。"),
          hero("专用钥匙在你手里，万能钥匙在玛拉手里。两条路，代价不一样。"),
          npc("没错。我的钥匙只开这扇门，玛拉的钥匙会欠商队一个人情。"),
          npc("先清理附近，我再把专用钥匙交给你。至少这一次，我们按封条的规矩来。")
        ],
        choices: [
          {
            text: "追问钥匙",
            reply: "如果我用玛拉的万能钥匙绕过你，这扇门后会少一道保险吗？",
            followup: "诺维皱起眉。能开，不代表该开。万能钥匙管入口，专用钥匙会让里面的封条认得你。"
          },
          {
            text: "按规矩来",
            reply: "我会先清掉附近的东西。你把钥匙留在手边，别让封条先认输。",
            followup: "诺维把钥匙盒贴回胸口。好，按规矩来的人，在地牢里通常能多活一段路。"
          }
        ],
        background: `诺维保管${room}的专用符文钥匙，他只在门外威胁被压住后交钥匙。完成委托后可获得这道门的专用钥匙；商队管事玛拉的万能钥匙也能作为替代路线，但会把探索更明显地引向商队支线。`
      },
      runeSurvey: {
        lines: [
          npc("你听见墙里那种低声重复了吗？我敢说那不是风，是符文回声。"),
          npc("我的测绘笔已经画出三条互相矛盾的路，再画下去会把后来的人带错。"),
          hero("我不想跟着一张会说谎的地图走。你需要一段不会回声的空白。"),
          npc("对。清出安静区域，我才能把真实回路重新测下来。"),
          npc("等这段线稳定，罗恩的灯、伊芙的暗记和你的符文槽都会少走一次弯路。")
        ],
        choices: [
          {
            text: "追问回声",
            reply: "这些回声像是在学我们走路。它们只是噪音，还是地牢在改写自己？",
            followup:
              "缇雅的笔尖停了一下。也许两者一样。我们先找出它改写的方向，再决定要不要顺着走。"
          },
          {
            text: "清出空白",
            reply: "我去清出一段安静。你把真正的路画下来，别让我回来时找不到你。",
            followup: "缇雅笑得很轻。我会在原地，除非地图先背叛我。"
          }
        ],
        background:
          "缇雅用测绘资料判断地牢回路何时改写，但回声目标会让记录失真。清理干扰源后，测绘结果会转化为技能资源，并为符文校准提供基准；这些资料也会让巡夜灯号和幸存者暗记不再互相冲突。"
      },
      wardenSeal: {
        lines: [
          npc("我刚检查过封条，边缘开始冒黑灰，说明下面有东西在顶它。"),
          npc("守卫被这股气息引来，不处理掉，封印会越裂越大。"),
          hero("罗恩补回来的灯线会把我带到这里，但封条要靠你判断。"),
          npc("也要靠你动手。灯线告诉我哪里裂，剑和法术才能让裂缝闭嘴。"),
          npc("帮我巡检这段封条，别让今晚刚亮起的路又断回黑暗里。")
        ],
        choices: [
          {
            text: "追问封条",
            reply: "这些封条是在困住怪物，还是在困住地牢自己的记忆？",
            followup: "赛拉看了你一眼。现在，两者都困着。等你走得更深，也许你会想亲手改答案。"
          },
          {
            text: "协助巡检",
            reply: "我先处理守卫。封条要不要继续压住，等我看见它下面是什么再说。",
            followup: "赛拉收起封蜡。很好。巡夜人需要手，也需要会怀疑的人。"
          }
        ],
        background:
          "赛拉负责深层封印巡检，她会根据罗恩的浅层灯号判断哪里需要加固。完成后会奖励钥匙和技能点，并让巡夜路线继续向深层推进；若你更偏向缇雅的回声研究，封条背后的真相会变得更难回避。"
      },
      wardenRelay: {
        lines: [
          npc("我在等上一盏前哨灯，可它到现在都没有亮。"),
          npc("我要把罗恩的浅层情报送到封印点，不能让后面的人盲着眼往深处走。"),
          hero("如果我打通这里，你们传下去的不只是位置，还有这层发生过什么。"),
          npc("对。卡尔的救援名单、缇雅的回路图、玛拉的补给点，都要靠这条线送出去。"),
          npc("你打通这一段，下一名传令员才能接上路线，赛拉也能知道该守哪一道封条。")
        ],
        choices: [
          {
            text: "确认情报",
            reply: "我要知道这条接力会带走哪些名字。别让被救的人只变成地图上的点。",
            followup:
              "赛拉放低声音。卡尔给我名单，伊芙给我撤离暗记，罗恩给我灯号。你的名字会写在中间。"
          },
          {
            text: "打通路线",
            reply: "我会把这一段打通。下一盏灯亮起来时，让后面的人知道不是幻觉。",
            followup: "赛拉把前哨灯交给你。它不会替你照亮全部路，但会证明你刚刚来过。"
          }
        ],
        background:
          "赛拉的巡夜接力把罗恩的浅层情报送往深层封印点，也把卡尔的救援名单、伊芙的撤离暗记和缇雅的回路图串成一条可追踪的主线。完成它会推进巡夜人任务链，后续更容易触发封印巡检和精英悬赏。"
      },
      survivorTrace: {
        lines: [
          npc("墙上的三道短痕是我教给幸存者的记号，不是旧划痕。"),
          npc("暗记到前面突然断了，说明留下它的人开始被追。"),
          hero("卡尔救出来的人会沿这些记号撤，追踪者也会沿它们找回来。"),
          npc("所以这不是一面墙的问题。它连着每一个还没走出地牢的人。"),
          npc("把追踪者清掉，后面的人才敢沿这条线走。等路稳了，玛拉的补给也能送到安全点。")
        ],
        choices: [
          {
            text: "追问暗记",
            reply: "这些记号如果被怪物读懂，继续留下它们是不是也会害人？",
            followup: "伊芙抿住嘴。所以我要改写路线。先清掉追踪者，活人才能有时间学新记号。"
          },
          {
            text: "保护路线",
            reply: "我会把追踪者清掉。让卡尔救出来的人知道，墙上的记号还没有背叛他们。",
            followup: "伊芙把一枚炭笔递给你。回来时在墙角留一道短痕，我会知道这段路还能走。"
          }
        ],
        background:
          "伊芙整理幸存者留下的暗记，卡尔救出的人会沿这些记号撤离。追踪者会反向寻找暗记源头，清理它们能让幸存者路线更可靠，并衔接撤离掩护支线；商队补给也会优先送往被暗记确认的安全点。"
      },
      survivorEscort: {
        lines: [
          npc("我留下的这条撤离暗记已经被怪物闻到了，它们开始沿着记号回头找。"),
          npc("我知道后面还有人会照着它走，如果不挡住追来的东西，他们会直接撞进死路。"),
          hero("那就不是护送一个人，是替还没出现的人守住出口。"),
          npc("是。卡尔负责把人从房间里拉出来，我负责让他们不在路上再丢一次。"),
          npc("替我们守住这段路，至少撑到暗记被改掉。")
        ],
        choices: [
          {
            text: "追问撤离线",
            reply: "如果我守住这里，下一批人会往哪走？我不想只替他们争取几分钟。",
            followup:
              "伊芙指向墙根。三短痕后接斜线，去玛拉的旧补给点；那里有水，也有能继续走的理由。"
          },
          {
            text: "留下记号",
            reply: "我会守住这段路。等我回来，你教我怎么把安全写在墙上。",
            followup: "伊芙把炭笔放到你掌心。先活着回来。活着的人，才有资格改路标。"
          }
        ],
        background:
          "伊芙的撤离掩护保护的是一整条临时安全线，不是单个人。完成后幸存者会在后续事件中留下更多补给和路线线索，卡尔救出的被困者也更容易被送往玛拉能触达的补给点。"
      },
      runeCalibration: {
        lines: [
          npc("我发现有些怪物身上挂着符文回声，像把坏掉的钟带在骨头里。"),
          npc("它们倒下时会留下短暂频率，正好能校准装备上的符文槽。"),
          hero("所以我不是只在清怪，也是在替你的地图收集答案。"),
          npc("也是替你自己的武器。回声如果被正确收束，符文槽会变得更听话。"),
          npc("击败这些目标，我就能把那段频率收回来，下一次测绘不会再从零开始。")
        ],
        choices: [
          {
            text: "追问频率",
            reply: "如果这些频率来自地牢自己的记忆，我们校准的是装备，还是我的选择？",
            followup: "缇雅没有立刻回答。也许都有。符文从不只记录力量，它也记录谁愿意听见它。"
          },
          {
            text: "收回回声",
            reply: "我会击败这些目标。你把频率留好，别让它们再乱改我的路。",
            followup: "缇雅把空白符纸折好。回来时把残响交给我，我会让它们变成能用的东西。"
          }
        ],
        background:
          "缇雅先测绘回路，再用战斗残留校准符文槽频率。完成该委托后，可以更稳定地获得符文和技能尘；这条支线会逐步回答封印到底是在压住怪物，还是在压住符文回声本身。"
      },
      merchantRoute: {
        lines: [
          npc("我的补给车不怕路远，怕的是路每晚都变。"),
          npc("这段商路附近又有怪物靠过来，搬药的人不敢进。"),
          hero("你要的不是一条发财路，是一条能让人回头补给的路。"),
          npc("说得漂亮，但账本也要活着才能算。你把路清出来，后面的补给才跟得上。"),
          npc("罗恩的灯亮到哪里，伊芙的暗记留到哪里，我的车就能试着靠近哪里。")
        ],
        choices: [
          {
            text: "询问账本",
            reply: "如果我替你清路，账本上写的是交易，还是欠我的人情？",
            followup: "玛拉笑了笑。先写交易，等你第三次活着回来，我再把它改成人情。"
          },
          {
            text: "清出商路",
            reply: "我会把路清出来。药水、信标和活人，总得有一样先抵达深处。",
            followup: "玛拉把补给绳结递给你。带着它回来，我就知道车该往哪推。"
          }
        ],
        background:
          "商队管事玛拉依靠短距离安全路线搬运药水、信标和钥匙。帮她清路能恢复补给通道，并让后续交易和补给回收支线更稳定；她会参考罗恩的灯号、伊芙的暗记和你走过的房间来决定下一处补给点。"
      },
      merchantCache: {
        lines: [
          npc("我有批补给箱被怪物压在岔路口，那里面不是普通药水。"),
          npc("里面有信标配件和法力补给，是往深层走的人最缺的东西。"),
          hero("如果信标回到你手里，卡尔和伊芙的人也能找到补给点。"),
          npc("没错。商队赚活人的钱，不赚死路的钱。拿回来，我给你更适合远行的工具。"),
          npc("你的名字也会进账本。到那时，商队看到你，不只会问你买什么。")
        ],
        choices: [
          {
            text: "谈谈信任",
            reply: "你把名字写进账本，是方便收债，还是方便以后把补给送到我前面？",
            followup: "玛拉把账本合上。两者都是。地牢里能活下来的关系，从来不只靠好心。"
          },
          {
            text: "回收补给",
            reply: "我会把箱子拿回来。下一次我需要退路时，希望你的信标真的亮着。",
            followup: "玛拉朝你伸出手。只要你把路走出来，我就有办法让它亮。"
          }
        ],
        background:
          "玛拉的补给回收会恢复商队深层库存。完成后商队能提供信标、法力补给和其他远行资源；若你同时推进救援和撤离线，这些补给会成为幸存者能否穿过深层的关键。"
      }
    };
    return (
      copies[def.id] || {
        lines: [
          npc("我这里有份委托，有点棘手。"),
          hero("听起来不像临时麻烦，更像旧账终于翻到我面前。"),
          npc("事情不是今天才开始，只是现在终于压不住了。报酬已经备好，你愿意听听细节吗？")
        ],
        choices: defaultQuestChoices(def),
        background: "这是一份临时委托，完成后会推进对应支线，并改变后续部分事件回应。"
      }
    );
  }

  function questDialogueState(def, quest = null, step = 0) {
    if (!quest) {
      const copy = questDialogueCopy(def);
      const lines = copy.lines.filter((line) => dialogueEntryText(line));
      const safeStep = Math.max(0, Math.min(lines.length - 1, Number(step) || 0));
      const hasNext = safeStep < lines.length - 1;
      const entry = lines[safeStep];
      return {
        speaker: dialogueEntrySpeaker(entry),
        text: dialogueEntryText(entry) || questDialogueText(def),
        hint: "",
        hasNext,
        nextStep: safeStep + 1,
        choices: hasNext ? [] : questDialogueChoicesFromCopy(copy, def)
      };
    }
    if (quest.claimed) {
      return {
        speaker: "npc",
        text: "谢谢你。刚才那条路已经安静下来了，后面的人会记住这份人情。",
        hint: "这个委托已经完成并领取报酬。"
      };
    }
    if (quest.completed) {
      return {
        speaker: "npc",
        text: "辛苦了，我已经听见那边安静下来。来，把约好的报酬拿上。",
        hint: "委托已经完成，可以领取报酬。"
      };
    }
    return {
      speaker: "npc",
      text: `请继续，目标还没有清完。现在是 ${quest.kills || 0}/${quest.target || def.target}。`,
      hint: "已接受的委托会在任务页继续追踪。"
    };
  }

  function dialogueEntryText(entry) {
    if (typeof entry === "string") return entry;
    return entry?.text || "";
  }

  function dialogueEntrySpeaker(entry) {
    return entry?.speaker === "hero" ? "hero" : "npc";
  }

  function questDialogueChoicesFromCopy(copy, def) {
    const choices = Array.isArray(copy.choices)
      ? copy.choices.filter((choice) => choice?.text && choice?.reply)
      : [];
    return choices.length ? choices : defaultQuestChoices(def);
  }

  function questDialogueChoice(def, index = 0) {
    const choices = questDialogueChoicesFromCopy(questDialogueCopy(def), def);
    return (
      choices[Math.max(0, Math.min(choices.length - 1, Number(index) || 0))] ||
      defaultQuestChoices(def)[0]
    );
  }

  function defaultQuestChoices(def) {
    return [
      {
        text: "追问线索",
        reply: "这些委托彼此牵着线，我不想只看见眼前这一段。告诉我它会接向哪里。",
        followup: `${def.giverName || "委托人"}点点头，把更深处的风险压低了声音说给你听。`
      },
      {
        text: "表明态度",
        reply: "我会先把眼前的危险处理掉。至于这条路最后属于谁，等我活着走到更深处再说。",
        followup: "那就从这里开始。地牢会记住犹豫，也会记住行动。"
      }
    ];
  }

  function dialogueSceneMarkup(dialogue, npcName) {
    const speaker = dialogue?.speaker === "hero" ? "hero" : "npc";
    const heroName = "你";
    const heroPortraitName = CLASSES[state.classId || "warrior"]?.name || heroName;
    const speakerName = speaker === "hero" ? heroName : npcName;
    const heroState = speaker === "hero" ? "speaking" : "muted";
    const npcState = speaker === "hero" ? "muted" : "speaking";
    return `
      <div class="npc-dialogue-scene ${speaker === "hero" ? "hero-speaking" : "npc-speaking"}">
        <div class="npc-portrait left ${heroState}">${portraitMarkup(heroPortraitSrc(), heroPortraitName)}</div>
        <div class="npc-dialogue-bubble">
          <span class="npc-dialogue-speaker">${escapeHtml(speakerName)}</span>
          <p>${escapeHtml(dialogueLineText(dialogue?.text || ""))}</p>
          ${dialogue?.hint ? `<small>${escapeHtml(dialogue.hint)}</small>` : ""}
        </div>
        <div class="npc-portrait right ${npcState}">${portraitMarkup(ASSETS.questNpc, npcName)}</div>
      </div>
    `;
  }

  function dialogueLineText(text = "") {
    return String(text).replace(/[“”]/g, "");
  }

  function rescueStoryName(name = "") {
    return (
      String(name).replace(/^(矿工|斥候|学徒|商贩|巡夜人|记录员)/u, "") || String(name) || "他"
    );
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
