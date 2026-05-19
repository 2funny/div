# 符文地牢项目设计文档

## 1. 项目概览

符文地牢是一个基于 Vite、TypeScript、原生 DOM、CSS 和 Web Audio 的浏览器 RPG。项目不依赖前端框架，运行时由 `src/main.ts` 启动，静态页面骨架在 `index.html`，样式集中在 `src/styles.css`，游戏逻辑按领域拆分在 `src/game/`。

核心循环：

1. 选择剑士、法师或游侠创建角色。
2. 在 23x23 到 31x31 的半随机地牢楼层中探索。
3. 遭遇怪物、宝箱、陷阱、祭坛、商人、合成台、任务 NPC、救援目标和楼梯。
4. 通过战斗、任务、宝箱和楼层事件获得经验、金币、装备、符文、钥匙和材料。
5. 通过装备、强化、符文、属性点、技能升级和职业机制成长。
6. 推进到第 66 层并挑战最终 Boss。

技术边界：

- 构建工具：Vite。
- 语言：TypeScript。
- UI：原生 DOM 渲染和原生 CSS。
- 存储：浏览器 `localStorage`，支持多存档槽。
- 音频：Web Audio API。
- 测试：Vite 测试入口打包后由 Node 脚本执行行为回归测试。

## 2. 运行与验证

常用命令：

```powershell
npm install
npm run dev
npm run build
npm test
npm run test:coverage
```

脚本含义：

- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：执行 TypeScript 检查并构建前端产物。
- `npm run build:test-harness`：使用 `vite.test.config.ts` 打包测试运行时。
- `npm test`：依次运行地图、装备 UI、玩法行为三类回归测试。
- `npm run test:coverage`：生成轻量覆盖率摘要。
- `npm run preview`：预览构建产物。

CI 当前使用 Node 22，流程为 `npm ci`、`npm run build`、`npm test`、`npm run test:coverage`，随后部署 Pages。

## 3. 当前架构

项目采用“主运行时装配器 + 领域运行时工厂”的结构。`src/game/runtime.ts` 持有核心 `state`、临时 UI 状态和跨模块 API，各领域通过 `create*Runtime()` 接收上下文与回调，避免把玩法、渲染、存档和交互堆到同一个文件。

主要目录：

- `src/main.ts`：应用入口，绑定事件并触发初始渲染。
- `index.html`：固定 DOM 骨架。
- `src/styles.css`：布局、地图、战斗、背包、弹窗、天气和响应式样式。
- `src/game/runtime.ts`：运行时组合、状态初始化、浏览器调试/事件 API 暴露。
- `src/game/types/`：核心状态、地图、物品、战斗、任务、UI 类型。
- `src/game/constants/`：职业、资产、装备标签、系统常量、主题、楼层效果。
- `src/game/floor/`：楼层生成、地图几何、房间、特殊地形。
- `src/game/interaction/`：移动、视野、格子交互。
- `src/game/combat/`：战斗结算、敌人、词缀、元素、战斗特效状态。
- `src/game/inventory/`：背包、装备穿脱、商店、合成、强化、物品使用。
- `src/game/equipment/`：装备工厂、初始装备、武器规则、名称字典、装备评分。
- `src/game/render/`：主 UI、地图、战斗、侧栏、弹窗、天气画布、HTML 转义工具。
- `src/game/quest/`：任务定义、任务运行时、剧情文本。
- `src/game/save/`：存档槽、存档 key、存档索引、持久化兼容。
- `src/game/audio/`：短音效、地牢 BGM、战斗 BGM 和 Web Audio 底层工具。
- `src/game/random.ts`：可注入、可播种的随机数工具。
- `src/ui/dom.ts`：`byId` 和 `requiredById`。
- `src/ui/bindEvents.ts`：静态按钮和全局输入事件绑定。
- `tests/*.test.js`：Node 行为测试。

当前 `src/game` 代码已移除 `// @ts-nocheck`。新增或修改运行时代码时应补齐局部类型，而不是重新引入全局跳过检查。

## 4. 状态与存档

`GameState` 是完整游戏状态。新游戏由 `startGame(classId, slotId)` 初始化，存档由 `saveRuntime.ts` 写入 `localStorage`。

关键字段：

- `classId`、`floor`、`level`、`xp`、`xpNext`：角色与进度。
- `gold`、`keys`、`materials`、`runes`：资源。
- `hp`、`maxHp`、`mp`、`maxMp`、`stats`：基础生存与属性。
- `statPoints`、`skillPoints`、`skillDust`、`skillLevels`、`skillCooldowns`：成长与技能状态。
- `inventory`、`equipment`：背包与装备。
- `map`、`floorStates`、`player`、`facing`：地图缓存、位置和朝向。
- `currentEnemy`：当前战斗敌人。
- `quest`、`quests`：任务兼容字段和任务状态。
- `log`：冒险日志。

存档槽规则：

- `SAVE_SLOT_LIMIT` 当前为 8。
- 槽位 id 为 `slot-1` 到 `slot-8`。
- `SAVE_INDEX_KEY` 存储存档摘要索引。
- 单槽数据 key 为 `${SAVE_KEY}-${slotId}`。

兼容与体积控制：

- `loadGame()` 会补齐旧存档缺失字段，例如 `facing`、资源、任务、技能等级、技能冷却和楼层缓存。
- `floorStates` 用于楼层回访和传送目标，但会压缩到最近的有限楼层，当前上限为 12 个楼层缓存，避免存档体积无限增长。
- 读取楼层缓存时会恢复保存的玩家位置和朝向；缓存缺失或地图尺寸不匹配时会重新生成楼层。

修改 `GameState` 时，需要同步检查 `startGame()` 初始化、`loadGame()` 字段补齐、测试 harness 归一化逻辑和相关测试。

## 5. 地图与楼层

楼层生成在 `src/game/floor/floorRuntime.ts`，地图由 `Cell[][]` 组成。每个格子包含坐标、地形、对象、可见性、探索状态和房间信息。

普通楼层生成流程：

1. 创建全墙地图。
2. 生成入口到远端的主路径。
3. 扩宽主路径。
4. 生成分支房间和结构化房间。
5. 删除入口不可达区域。
6. 标记房间名称和威胁等级。
7. 根据楼层决定是否附加暴雨、霜雪、熔岩等特殊效果。
8. 放置宝箱、怪物、任务点、陷阱、祭坛、商人和合成台。
9. 调整室外物件密度。
10. 规范房门。
11. 放置上行和下行楼梯。
12. 为部分下行楼梯设置封印和封印守卫。
13. 初始化视野。

最终楼层：

- 第 66 层使用 Boss 楼层规则。
- 中心区域固定开阔。
- 中心放置最终 Boss。
- 角落放置祭坛和合成台。
- 不生成下行楼梯。

随机数：

- 玩法随机应优先使用 `src/game/random.ts` 的工具，便于测试注入和复现。
- 地图、掉落、装备、敌人、事件等逻辑不应直接散落 `Math.random()`。

## 6. 探索与交互

探索逻辑在 `src/game/interaction/interactionRuntime.ts`，移动入口是 `move(dx, dy)`。

移动流程：

1. 更新玩家朝向。
2. 计算目标格。
3. 墙体、栅栏和不可通行格阻止移动。
4. 危险敌人触发确认。
5. 商人、合成台、委托人、救援目标、门栅和上锁宝箱优先交互。
6. 移动玩家坐标。
7. 播放脚步或危险音效。
8. 更新视野。
9. 调用 `resolveCell(cell)` 处理格子对象。
10. 重新渲染。

常见对象分发：

- 怪物：`handleEnemyEncounter()`。
- 普通宝箱：`openChest()`。
- 上锁宝箱：`openLockedChest()`。
- 陷阱：`triggerTrap()`。
- 祭坛：`useAltar()`。
- 商人：`openMerchant()`。
- 合成台：`openForge()`。
- 委托人：`openQuestNpc()`。
- 救援目标：`openRescueNpc()`。
- 门栅：`openFenceGate()`。
- 楼梯：`nextFloor()` 或 `previousFloor()`。

## 7. 职业差异

职业定义在 `src/game/constants/classes.ts`，职业差异主要来自初始属性、成长曲线、技能组、资源消耗和战斗节奏。职业类只提供配置，不直接计算普通攻击伤害；普通攻击、暴击、防御减伤、元素结算和技能冷却由战斗模块统一处理。

| 职业 | 定位 | 主属性倾向 | 战斗特点 | 策略重点 |
| --- | --- | --- | --- | --- |
| 剑士 | 前排压制 | 攻击、防御、生命 | 普通攻击稳定，技能偏高额物理伤害、格挡反击和削弱敌人 | 依靠高生命和防御承压，适合稳扎稳打；技能冷却期仍能靠基础攻击维持输出 |
| 法师 | 元素爆发 | 魔法、抗性、法力 | 技能倍率高，依赖火焰、冰霜、护盾等效果处理战斗 | 管理 MP 和技能冷却，利用元素克制打爆发；生存依赖护盾、抗性和战斗节奏 |
| 游侠 | 高速游击 | 速度、幸运、攻击 | 普通攻击可按速度触发额外普通攻击，技能可触发追击或状态强化 | 依靠先手、闪避、连击和暴击获得主动权；速度提高机会而不是直接提高普通攻击伤害 |

职业设计边界：

- 剑士的优势是容错、承伤和稳定物理输出，不应通过过高爆发覆盖法师定位。
- 法师的优势是元素技能和爆发窗口，需要明显依赖 MP 与冷却管理。
- 游侠的优势是行动顺序、闪避、普通攻击连击和技能附加效果，不通过 `spd` 直接增加普通攻击伤害。
- 幸运只影响暴击率，因此游侠的幸运成长体现为更高暴击机会，而不是额外掉落或装备品质收益。
- 新增职业时，应同时检查 `CLASSES`、初始装备、职业资产、技能 UI、战斗测试和设计文档。

## 8. 战斗系统

战斗逻辑在 `src/game/combat/combatRuntime.ts`，敌人和词缀在 `src/game/combat/enemies.ts`，元素克制在 `src/game/combat/elements.ts`。

普通攻击：

- 普通攻击伤害由统一战斗模块计算。
- 基础公式：`damage = atk * 1 - enemy.def * 0.45`。
- 速度不再增加普通攻击伤害。
- 敌人防御减伤和元素克制机制继续保留在统一结算链路中。

暴击与幸运：

- 暴击率：`critRate = 0.06 + luk * 0.008`。
- 暴击率上限为 `95%`，避免高幸运后变成必定暴击。
- 暴击倍率：`1.7`。
- 幸运只影响暴击率，不再影响掉落、商店、装备品质或其他非暴击收益。

速度作用：

- 决定战斗先手。
- 提高普通攻击连击概率。
- 提高闪避概率：`dodge = baseDodge + spd * 0.005`。
- 闪避率上限为 `95%`，避免高速度后变成必定闪避。
- 高速度可以提高技能附加效果或追击概率，但不增加普通攻击伤害。

技能机制：

- 技能消耗 MP。
- 技能有回合制冷却，状态保存在 `state.skillCooldowns`。
- 冷却在回合推进中递减，UI 会展示冷却状态并禁用不可用技能。
- 技能触发连击时只产生额外效果，例如额外普通攻击、元素伤害加成、状态效果强化；不重复施放同一个技能。
- 自动战斗会避开 MP 不足或冷却中的技能。

持续状态：

- 灼烧和中毒不是一次性伤害，而是直接伤害后附加持续状态。
- 命中时先结算技能本体伤害，再给敌人写入 `statuses.burn` 或 `statuses.poison`。
- 持续状态默认结算 `3` 次，当前常量为 `DAMAGE_STATUS_TURNS = 3`。
- 玩家行动结束时会立刻结算一次敌方持续状态伤害，因此刚施加后剩余回合会从 `3` 变为 `2`。
- 后续每次玩家行动结束继续结算，直到回合归零或敌人死亡。
- 再次施加同类状态会刷新该状态的伤害和剩余结算次数。

游侠机制：

- 普通攻击有概率触发一次额外普通攻击，概率与速度挂钩。
- 游侠技能可触发追击或附加效果，但追击不是递归技能。
- 游侠输出依赖速度带来的先手、闪避和连击机会，而不是速度直接加伤。

敌人系统：

- `makeEnemy()` 按楼层生成敌人。
- `makeEnemyWithVariant()` 生成带变体敌人。
- `makeKeyGuardian()` 生成封印守卫。
- `maybeApplyEnemyAffix()` 添加词缀。
- 敌人拥有速度属性，用于先手和闪避相关计算。

## 9. 装备、背包与成长

背包和成长逻辑在 `src/game/inventory/inventoryRuntime.ts`，基础物品工厂在 `src/game/equipment/inventory.ts`。

主要能力：

- 穿脱、出售、分解装备。
- 药水和传送信标使用。
- 装备强化、符文镶嵌与符文合成。
- 属性点分配。
- 技能升级。
- 商店购买与商人分解/出售入口。

装备相关入口：

- 装备工厂：`item()`、`potion()`、`teleportBeacon()`。
- 初始装备：`starterEquipment()` 直接安装到角色装备栏，`starterInventory()` 只提供初始消耗品。
- 装备评分：`itemScore()`、`equipmentCompareText()`。
- 武器规则：`src/game/equipment/equipmentRules.ts`。
- 名称字典：`src/game/equipment/equipmentNames.ts`。

设计边界：

- 装备、符文和强化只提供属性与规则数据，不直接驱动渲染。
- 幸运不参与装备品质、商店或掉落概率，除非后续设计明确改回。
- 新增属性时同步检查 `totals()`、装备评分、UI 文案、存档兼容和测试。

## 10. 任务与传送

任务定义在 `src/game/quest/quests.ts`，运行时逻辑在 `src/game/quest/questRuntime.ts`，剧情文本在 `src/game/quest/lore.ts`。

任务类型：

- `rescueRoom`：清理指定房间并救出被困者。
- `wardenErrand`：清理本层怪物换取钥匙。
- `merchantRoute`：帮助商人清理附近怪物换取补给和金币。

传送信标：

- 由 `teleportBeacon()` 创建。
- 目标来自当前楼层和 `floorStates` 中已缓存楼层。
- 目标类型包括商人、委托人、被困者和合成台。
- `knownTeleportTargets()` 收集目标，`landingNear()` 寻找落点，`teleportToTarget()` 消耗信标并移动玩家。

## 11. 渲染与 UI

渲染逻辑集中在 `src/game/render/renderRuntime.ts`，入口 `render()` 根据状态显示开始页、地图视图或战斗视图，并在完整渲染后静默保存当前游戏。

主要渲染入口：

- `renderStartScreen()`：开始页和存档列表。
- `renderClassSelect(slotId)`：职业选择。
- `renderContinueSlots()`：继续游戏列表。
- `renderHero()`：左侧角色信息。
- `renderPaperdoll()`：纸娃娃装备。
- `renderMap()`：主地图。
- `renderMinimap()`：小地图。
- `renderLegend()`：图例。
- `renderBattleView()`：战斗视图。
- `renderBattleCommandPanel()`：战斗指令。
- `renderContext()`：右侧上下文行动。
- `renderTab()`：右侧标签页内容。
- `renderInventory()`、`renderEquipment()`、`renderCraft()`、`renderSkills()`、`renderQuestList()`、`renderLog()`。

安全与 DOM 规则：

- 保存名、日志、弹窗行动文案等可能来自状态或存档的数据，应使用 `src/game/render/html.ts` 的 `escapeHtml()` 转义后再进入 `innerHTML`。
- `requiredById()` 只用于 `index.html` 中必须存在的静态节点。
- 渲染过程中动态创建的元素使用 `document.getElementById()` 或 `byId()`，缺失时由渲染函数创建。
- 不要假设 render-only 节点已经存在。

## 12. 音频系统

音频由 `src/game/audio/audioRuntime.ts`、`audioProfiles.ts` 和 `audioEngine.ts` 组成。

- `audioProfiles.ts`：短音效的振荡器、包络、滤波参数。
- `audioEngine.ts`：Web Audio 节点创建、调度和播放工具。
- `audioRuntime.ts`：AudioContext、声音开关、短音效、探索音乐和战斗音乐。

主要入口：

- `initAudio(playReady)`。
- `toggleAudio()`。
- `setAudioEnabled(enabled, playReady)`。
- `updateSoundButton()`。
- `playSound(kind)`。
- `syncMusicToGame()`。
- `startDungeonMusic()`。
- `startBattleMusic()`。

## 13. 测试范围

测试入口：

- `tests/map-generation.test.js`：地图生成、楼梯、房间、可达性。
- `tests/equipment-ui.test.js`：装备、背包、纸娃娃、文案和 UI 行为。
- `tests/gameplay-behavior.test.js`：移动、战斗、任务、楼层推进、存档行为。
- `tests/harness/runtimeHarness.ts`：把运行时和静态配置暴露给 Node 测试。

建议验证：

- 文档或注释修改：`npm run build`。
- 地图、背包、战斗、存档或导出运行时修改：`npm test`。
- CI 或覆盖率相关修改：`npm run test:coverage`。
- 大范围跨模块修改：`npm run build`、`npm test`、`npm run test:coverage`。

## 14. 常见修改索引

| 目标 | 优先查看 |
| --- | --- |
| 新增职业 | `src/game/constants/classes.ts`、`starterEquipment()`、`starterInventory()`、`assetForClass()`、`ASSETS` |
| 修改职业技能 | `CLASSES.skills`、`castSkill()`、`upgradedSkill()`、`renderSkills()`、`renderBattleCommandPanel()` |
| 修改普通攻击/暴击 | `src/game/combat/combatRuntime.ts` |
| 修改游侠连击 | `src/game/combat/combatRuntime.ts`、`src/game/constants/classes.ts` |
| 修改敌人 | `src/game/combat/enemies.ts`、`src/game/combat/elements.ts` |
| 修改元素克制 | `src/game/combat/elements.ts` |
| 修改一键战斗 | `autoBattlePolicy()`、`executeAutoBattle()` |
| 修改地图尺寸 | `MAP_SIZE`、`MAP_SIZE_MIN`、`MAP_SIZE_MAX`、`MAP_VIEW_SIZE`、`renderMap()`、地图测试 |
| 修改楼层主题 | `THEMES`、`themeForFloor()`、CSS 主题 class |
| 修改特殊楼层 | `FLOOR_EFFECTS`、`chooseFloorEffect()`、`floorEffectReward()`、`.effect-*` 样式 |
| 修改楼梯/封印 | `placeFloorStairs()`、`maybeSealDownstairs()`、`completeStairSeal()` |
| 修改地图物件 | `LEGEND_ITEMS`、`ASSETS`、`resolveCell()`、`objectSprite()`、`tileLabel()` |
| 修改掉落/宝箱 | `openChest()`、`openLockedChest()`、`maybeDrop()`、`randomEquipment()` |
| 修改装备系统 | `src/game/equipment/`、`src/game/inventory/inventoryRuntime.ts` |
| 修改强化/符文 | `enhance()`、`confirmEnhance()`、`craftRune()`、`applyRune()` |
| 修改属性点 | `openStatAllocator()`、`adjustStatDraft()`、`applyStatDraft()` |
| 修改任务 | `QUEST_DEFS`、`placeQuestNpc()`、`placeRescueQuest()`、`recordQuestKill()` |
| 修改商人/合成台 | `openMerchant()`、`openMerchantShop()`、`buy()`、`openForge()`、`renderCraft()` |
| 修改传送信标 | `teleportBeacon()`、`knownTeleportTargets()`、`teleportToTarget()` |
| 修改存档 | `src/game/save/`、`startGame()`、`loadGame()`、测试 harness |
| 修改 UI | `index.html`、`src/game/render/renderRuntime.ts`、`src/styles.css` |
| 修改弹窗 | `src/game/render/modalRuntime.ts`、`.modal` 样式 |
| 修改音频 | `src/game/audio/audioProfiles.ts`、`audioRuntime.ts`、`audioEngine.ts` |
| 修改随机性 | `src/game/random.ts` 和对应领域测试 |

## 15. 已知保留项

- License 暂未处理。
- `renderRuntime.ts` 仍承担较多 UI 拼装职责，后续可按地图、战斗、侧栏继续拆分。
- 仍有部分 `innerHTML` 拼接，新增可变文本时必须先转义；后续可逐步改成更多 DOM API。
- 项目已完成 `src/game` 类型化清理，但可以继续收紧外部测试 harness 和浏览器全局 API 类型。

## 16. 参考报告调整对照

基于 `deep-research-report (1).md` 的优先改进表，当前代码侧对照如下：

| 调整项 | 是否调整 | 当前落点 |
| --- | --- | --- |
| 首局 10 分钟分步目标链：移动、开箱、战斗、装备、接任务 | 已调整 | `src/game/tutorial/tutorial.ts` 定义目标链；`runtime.ts` 初始化；移动、宝箱、战斗胜利、装备和接任务节点会推进教程；`renderRuntime.ts` 在上下文区渲染教程卡片；旧存档加载时补齐教程状态。 |
| 任务与房间事件模板扩展，增加 6 到 10 个分支事件 | 已调整 | `src/game/events/roomEvents.ts` 定义 6 个房间事件；`floorRuntime.ts` 投放事件；`interactionRuntime.ts` 弹出事件选择并结算奖励/风险；测试覆盖事件池数量与结算。 |
| 66 层纵深需要更多主题敌人与局部机制 | 已调整 | `floorRuntime.ts` 已按主题提供多段敌人池、主题元素弱点和敌人技能；中后期敌人原型随楼层主题变化。后续仍可继续补小首领和专属房间机制。 |
| 叙事需要持续关系与分支后果 | 部分调整 | 已有章节、残页、救援和多任务状态；尚未形成常驻 NPC 关系线或选择影响后续奖励/剧情的长期系统。 |
| 强化战斗反馈：命中冲击、敌我状态、Buff/Debuff 时间线、关键音效层次 | 已调整 | `combatRuntime.ts` 写入 battle FX 与敌方锁定阶段；`renderRuntime.ts` 展示战斗回合横幅、状态标签和飘字；`styles.css` 提供命中震动、元素 FX 和回合状态样式。 |
| `render()` 直接保存改为脏标记 + 1 到 2 秒防抖保存 | 已调整 | `runtime.ts` 提供 `markAutosaveDirty()`，`renderRuntime.ts` 在完整渲染后标脏并防抖调用 `saveGame(false)`；楼层缓存保存前压缩到 12 层。 |
| 跨局元进度、图鉴、永久 relic、职业挑战和主题 modifier | 未调整 | 当前仍以单局成长和多存档为主，尚未加入跨局永久进度。 |
