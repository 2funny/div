# 符文地牢项目设计文档

## 1. 项目概览

符文地牢是一个基于 Vite、Vanilla TypeScript 和原生 CSS 的纯前端半随机地牢闯关 RPG。应用由 `index.html` 承载页面骨架，`src/main.ts` 负责启动，`src/styles.css` 提供全局样式，静态资源放在 `public/assets`。游戏状态存储在浏览器 `localStorage` 中，支持四个存档槽和当前存档槽记录。

核心玩法循环：

1. 选择剑士、法师或游侠创建角色。
2. 在 23x23 到 31x31 之间随机尺寸的半随机地牢楼层中探索。
3. 触发怪物、宝箱、祭坛、商人、合成台、任务 NPC、楼梯和陷阱。
4. 遭遇普通楼层或带雨雪、熔岩等特效的特殊楼层。
5. 通过战斗、任务和宝箱获得经验、金币、装备、符文、钥匙和材料。
6. 通过装备、强化、符文、属性点和技能升级提升角色强度。
7. 推进到第 66 层并挑战最终 Boss。

技术边界：

- 构建工具：Vite。
- 语言：TypeScript。
- UI：原生 DOM 渲染和原生 CSS。
- 存储：浏览器 `localStorage`。
- 音频：Web Audio API。
- 测试：Vite 测试入口打包后由 Node 脚本执行回归测试。

## 2. 运行与验证

常用命令：

```powershell
npm install
npm run dev
npm run build
npm test
```

脚本含义：

- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：执行 TypeScript 检查并构建前端产物。
- `npm run build:test-harness`：使用 `vite.test.config.ts` 打包测试运行时。
- `npm test`：依次运行地图、装备 UI、玩法行为三类回归测试。
- `npm run preview`：预览构建产物。

回归测试入口：

- `tests/map-generation.test.js`：地图生成、楼梯、房间和可达性。
- `tests/equipment-ui.test.js`：装备、背包、纸娃娃、文案和 UI 行为。
- `tests/gameplay-behavior.test.js`：移动、战斗、任务、楼层推进和存档相关行为。
- `tests/harness/runtimeHarness.ts`：把运行时和静态配置暴露给 Node 测试脚本。

## 3. 当前架构

项目采用“主运行时装配器 + 领域运行时工厂”的结构。`src/game/runtime.ts` 持有核心状态、UI 临时状态和跨模块接口，各领域运行时通过 `create*Runtime()` 工厂接收上下文和回调，避免把所有玩法逻辑集中到一个文件里。

主要协作方式：

- `runtime.ts` 创建 `audioRuntime`、`modalRuntime`、`floorRuntime`、`questRuntime`、`interactionRuntime`、`combatRuntime`、`inventoryRuntime`、`renderRuntime` 和 `saveRuntime`。
- `state` 是游戏的核心状态源，领域运行时通过 `getState()` 获取当前状态。
- `uiState` 包装当前标签页、背包子标签、装备筛选、选中格子和存档槽。
- `battleState` 包装战斗输入锁定时间。
- `runtimeApi` 汇总跨领域调用，并通过 `exposeRuntime()` 挂到 `window`，供 HTML 内联事件、调试和测试使用。

模块依赖原则：

- 静态配置放在 `data.ts`。
- 纯工具函数放在 `random.ts`、`mapGeometry.ts`、`audioEngine.ts` 等文件。
- 领域行为放在对应 `*Runtime.ts` 文件。
- DOM 查询集中在 `src/ui/dom.ts`。
- 事件绑定集中在 `src/ui/bindEvents.ts`。
- 测试依赖运行时导出的稳定 API，调整 `runtimeApi` 时同步检查 `tests/harness/runtimeHarness.ts`。

## 4. 工程目录

```text
.
├─ index.html
├─ public/assets/
├─ src/
│  ├─ main.ts
│  ├─ styles.css
│  ├─ game/
│  └─ ui/
├─ tests/
├─ vite.config.ts
├─ vite.test.config.ts
├─ tsconfig.json
└─ package.json
```

入口文件：

- `index.html`：页面骨架，包含顶部操作、职业选择、游戏主视图、弹窗和 toast。
- `src/main.ts`：导入样式，调用 `exposeRuntime()`、`bindEvents()`、`renderStartScreen()`、`updateSoundButton()` 和 `render()`。
- `src/styles.css`：布局、地图、战斗、背包、纸娃娃、弹窗、toast 和响应式样式。
- `public/assets`：Vite 静态资源目录，游戏图片路径以 `assets/...` 形式引用。

`src/ui`：

- `bindEvents.ts`：键盘、按钮、声音、保存和返回首页事件。
- `dom.ts`：DOM 获取工具。
- `renderMap.ts`：导出地图相关运行时入口。
- `renderPanel.ts`：导出面板相关运行时入口。

`src/game` 静态与工具模块：

- `data.ts`：职业、楼层主题、符文、装备槽、属性名、地图尺寸、最大楼层、资源路径和图例。
- `types.ts`：核心类型，如 `GameState`、`GameMap`、`Cell`、`Enemy`、`Item`、`QuestState`。
- `random.ts`：随机数和 id 工具。
- `mapGeometry.ts`：邻居、范围、距离、房门合法性等地图几何工具。
- `map.ts`：地图相关导出门面。
- `inventory.ts`：物品、药水、初始装备、传送信标和背包相关导出门面。
- `save.ts`：存档槽 key、索引读写、时间格式化和存档运行时导出门面。
- `state.ts`：活动状态和活动面板标签的轻量门面。
- `combatFx.ts`：战斗飘字和动画状态。
- `audioProfiles.ts`：短音效配置。
- `audioEngine.ts`：Web Audio 底层合成。
- `quests.ts`：任务定义。
- `enemies.ts`：敌人词缀定义。
- `events.ts`、`combat.ts`、`player.ts`、`index.ts`：面向外部导出的聚合入口。

`src/game` 领域运行时：

- `runtime.ts`：主运行时装配器、核心状态持有者和运行时 API 汇总。
- `audioRuntime.ts`：声音开关、音效播放、探索音乐和战斗音乐。
- `modalRuntime.ts`：弹窗、确认框、事件弹窗和 toast。
- `floorRuntime.ts`：楼层地图、房间、宝藏、任务点、怪物、楼梯和封印生成。
- `interactionRuntime.ts`：玩家移动、视野、格子触发、宝箱、陷阱和门栅。
- `combatRuntime.ts`：回合制战斗、技能、掉落、升级、死亡、一键战斗和任务击杀进度。
- `inventoryRuntime.ts`：属性点、装备穿脱、出售、分解、药水、传送、符文、强化、商店和合成台。
- `questRuntime.ts`：任务状态、接取、奖励、任务 NPC 和救援 NPC。
- `renderRuntime.ts`：开始页、存档页、角色栏、地图、小地图、战斗、背包、技能、任务和日志渲染。
- `saveRuntime.ts`：多槽存档、存档摘要、读取、保存、删除、返回首页和存档字段补齐。

## 5. 页面与 UI 结构

`index.html` 提供固定 DOM 容器，运行时按需填充内容。

主区域：

- `topbar`：标题、副标题、声音、保存和返回首页。
- `classSelect`：开始页、职业选择和存档列表。
- `gameView`：游戏主界面。

游戏主界面：

- 左侧 `hero-panel`：头像、职业名、生命/法力/经验条、属性、资源、纸娃娃装备。
- 中间 `map-wrap`：楼层标题、主题、主地图、小地图和图例。战斗时同一区域切换为战斗面板。
- 右侧 `action-panel`：上下文行动、背包/装备/技能/任务标签页和冒险日志。

全局浮层：

- `modal`：确认、任务、商店、合成、装备详情、存档等弹窗。
- `toast`：短提示。

输入行为：

- 方向键和 WASD 控制移动。
- 弹窗打开时空格关闭弹窗。
- 战斗中方向键、WASD、空格和 Enter 不触发地图移动。
- 顶部按钮控制声音、保存和返回首页。
- 右侧标签按钮切换背包、装备、技能和任务面板。

## 6. 状态模型

`GameState` 是完整游戏状态。创建新游戏时由 `startGame(classId, slotId)` 初始化，保存时序列化到 `localStorage`。

核心字段：

- `classId`：职业 id，对应 `CLASSES`。
- `floor`：当前楼层。
- `level`、`xp`、`xpNext`：等级和经验。
- `gold`、`keys`：金币和符文钥匙。
- `hp`、`maxHp`、`mp`、`maxMp`：当前生命法力和基础上限。
- `stats`：基础属性。
- `statPoints`、`skillPoints`、`skillDust`：成长资源。
- `inventory`：背包物品。
- `materials`：强化石、魔尘、首领印记等材料。
- `runes`：符文库存。
- `equipment`：当前装备，key 来自 `SLOTS`。
- `map`：当前楼层地图。
- `floorStates`：已访问楼层缓存。
- `player`：玩家坐标。
- `facing`：玩家朝向。
- `currentEnemy`：当前战斗敌人。
- `quest`、`quests`：任务状态。
- `skillLevels`：技能等级。
- `log`：冒险日志。

属性计算：

- `state.stats` 保存基础属性。
- 装备、强化和符文属性通过 `totals()` 动态汇总。
- 生命和法力有效上限通过 `effectiveMaxHp()`、`effectiveMaxMp()` 计算。
- 符文效果由 `applyRune(total, rune)` 写入汇总结果。

楼层缓存：

- 离开楼层前，`saveCurrentFloor()` 保存当前地图、玩家坐标、任务、背包和其他必要状态。
- `enterFloor(direction)` 根据目标楼层恢复缓存或生成新地图。
- `entryPositionForDirection(direction)` 根据上下楼方向把玩家放到对应楼梯附近。

## 7. 静态配置

`src/game/data.ts` 是静态配置中心。

主要配置：

- `CLASSES`：剑士、法师、游侠的描述、初始属性、生命法力、成长和技能。
- `THEMES`：楼层主题、名称、墙体比例和 CSS 主题 class。
- `FLOOR_EFFECTS`：特殊楼层效果，包括雨、雪、熔岩及对应难度和奖励倍率。
- `RUNES`：符文基础名称。
- `SLOTS`、`SLOT_NAMES`：装备槽位和展示名。
- `STAT_NAMES`：属性展示名。
- `SAVE_KEY`：localStorage 存档前缀。
- `DEFAULT_CLASS_ID`：默认职业。
- `MASTER_VOLUME`：音频主音量。
- `MAX_FLOOR`：最大楼层，当前为 66。
- `MAP_SIZE`：地图默认尺寸，当前为 27。
- `MAP_SIZE_MIN`、`MAP_SIZE_MAX`：随机地图尺寸范围，当前为 23 到 31。
- `MAP_VIEW_SIZE`：主地图视口尺寸，当前为 15。
- `VISION_RADIUS`：玩家视野半径，当前为 3。
- `ASSETS`：图片资源路径。
- `LEGEND_ITEMS`：地图图例。

修改数值、职业、技能文案、地图尺寸或资源路径时，优先检查这个文件。

## 8. 地图与楼层

地图由 `floorRuntime.ts` 生成，入口是 `generateFloor()`。地图由二维 `Cell[][]` 组成，每个格子包含坐标、地形、物件、可见性和房间信息。

普通楼层生成流程：

1. 创建全墙地图。
2. 生成从入口到远端的主路径。
3. 扩宽主路径。
4. 生成分支房间和结构化房间。
5. 删除入口不可达区域。
6. 标记房间名称和威胁等级。
7. 根据楼层决定是否附加特殊效果，如暴雨层、霜雪层或熔岩层。
8. 放置宝箱遭遇、怪物、任务点、陷阱、祭坛、商人和合成台。
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

楼梯规则：

- 第 1 层没有上行楼梯。
- 第 2 层起，上行楼梯放在真实地图格上。
- 下行楼梯优先选择远离入口的位置。
- 下行楼梯可能带 `locked: true` 和 `sealId`。
- 击败对应封印守卫后，`completeStairSeal()` 解除封印。

房间规则：

- `assignRoomLabels()` 给房间分配名称和威胁等级。
- `roomDoorLabel(cell)` 在门牌上只显示房间编号。
- 危险和封印房间更容易出现精英敌人。

特殊楼层规则：

- 第 4 层后有概率出现特殊楼层，当前包括暴雨层、霜雪层和熔岩层。
- 特殊楼层会在地图区域显示天气或热浪特效。
- 特殊楼层敌人的生命、攻击和防御会获得温和提升。
- 特殊楼层的经验、金币、宝箱、掉落和任务金币奖励会获得温和提升。
- 第 66 层固定为熔岩效果的最终 Boss 楼层。

地图修改入口：

- 地图尺寸：`MAP_SIZE`、`MAP_SIZE_MIN`、`MAP_SIZE_MAX`、`MAP_VIEW_SIZE`、`src/styles.css` 地图样式和地图测试。
- 特殊楼层：`FLOOR_EFFECTS`、`chooseFloorEffect()`、`applyFloorEffectToEnemy()`、`floorEffectReward()` 和 `.effect-*` 样式。
- 视野半径：`VISION_RADIUS` 和 `updateVisibility()`。
- 普通怪数量：`monsterCountForFloor()`。
- 宝箱数量：`treasureCountForFloor()`。
- 陷阱数量：`trapCountForFloor()`。
- 房间数量：`sideRoomCountForFloor()` 和结构化房间生成参数。
- 商人/合成台频率：`state.floor % 3` 判断。
- 楼梯位置：`placeFloorStairs()`、`chooseStairCell()`、`stairScore()`。
- 楼梯封印：`maybeSealDownstairs()`、`placeGuardNear()`、`completeStairSeal()`。
- 新地图物件：`ASSETS`、`LEGEND_ITEMS`、`resolveCell()`、`objectSprite()`、`badgeForObject()`、`tileLabel()`。

## 9. 探索与交互

探索逻辑由 `interactionRuntime.ts` 处理，移动入口是 `move(dx, dy)`。

移动流程：

1. 更新玩家朝向。
2. 计算目标格。
3. 墙和栅栏阻止移动。
4. 危险敌人触发确认。
5. 商人、合成台、委托人、救援目标、门栅和上锁宝箱优先交互。
6. 移动玩家坐标。
7. 播放脚步或危险音效。
8. 更新视野。
9. 调用 `resolveCell(cell)` 处理格子物件。
10. 重新渲染。

格子物件分发：

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

视野规则：

- `updateVisibility()` 根据 `VISION_RADIUS` 标记当前可见格。
- 可见格会同步标记为已探索。
- 未探索格隐藏物件信息。
- 陷阱按显示规则决定是否暴露。

## 10. 战斗系统

战斗逻辑由 `combatRuntime.ts` 处理。`enterBattle(enemy)` 将敌人写入 `state.currentEnemy`，渲染层根据该字段切换战斗视图。

玩家行动：

- `attackEnemy("attack")`：普通攻击。
- `attackEnemy("skill", skill)`：释放技能。
- `attackEnemy("defend")`：防御。
- `useBattlePotion(id)`：战斗中使用药水。
- `autoBattle()`：尝试一键战斗。

战斗结算：

- `dealDamage(enemy, amount, label)` 处理伤害、暴击和飘字。
- `castSkill(enemy, skill, totals)` 处理技能效果。
- `enemyTurn(enemy)` 处理敌人回合。
- `winBattle(enemy)` 处理奖励、掉落、任务击杀进度和升级。
- `death()` 处理玩家死亡。

敌人系统：

- `makeEnemy(eliteOrBoss)` 按楼层生成敌人。
- `makeEnemyWithVariant(eliteOrBoss)` 生成带变体的敌人。
- `makeKeyGuardian()` 生成封印守卫。
- `maybeApplyEnemyAffix(enemy, eliteOrBoss)` 添加词缀。
- `enemyAffixText(enemy)` 生成词缀说明。

当前敌人词缀：

- `坚甲`：防御提高，普通攻击效率降低。
- `破盾`：防御姿态减伤降低。
- `汲取`：造成伤害后恢复生命。
- `迅捷`：更容易避开攻击。

一键战斗规则：

- `battleRisk(enemy)` 估算风险。
- `autoBattlePolicy(enemy)` 判断是否允许自动结算。
- 精英、守卫、Boss、带词缀敌人、资源不足或风险较高时不允许一键战斗。
- `executeAutoBattle()` 最多连续结算 3 回合，并复用普通战斗流程。

战斗修改入口：

- 普通攻击和暴击：`dealDamage()`。
- 技能效果：`castSkill()` 和 `CLASSES.skills`。
- 敌人回合：`enemyTurn()`。
- 掉落：`maybeDrop()`。
- 升级：`levelUp()` 和 `applyClassLevelGrowth()`。
- 一键战斗阈值：`autoBattlePolicy()` 和 `battleRisk()`。
- 战斗 UI：`renderBattleView()`、`renderBattleCommandPanel()`、`renderSkillActionButtons()`。

## 11. 装备、背包与成长

背包和成长逻辑由 `inventoryRuntime.ts` 处理，基础物品工厂在 `inventory.ts`。

物品类型：

- 药水：`potion(name, kind, amount)` 创建，`kind` 为 `hp` 或 `mp`。
- 装备：`item(name, slot, quality, stats, runeSlots, runes)` 创建。
- 传送道具：`teleportBeacon()` 创建商路信标。

装备结构：

- `kind: "equip"`。
- `slot`：装备槽位。
- `quality`：普通、优秀、稀有、史诗、传说。
- `stats`：属性加成。
- `runeSlots`：符文槽数量。
- `runes`：已镶嵌符文。
- `level`：强化等级。

装备入口：

- `equipItem(id)`：穿戴装备。
- `unequipItem(slot)`：卸下装备。
- `sellEquipment(id)`：出售装备。
- `disassembleEquipment(id)`：分解装备。
- `enhance(slot)`：强化装备。
- `itemScore(item)`：计算装备评分。
- `equipmentCompareText(item)`：生成装备对比文本。

成长入口：

- `openStatAllocator(preferredKey)`：打开属性点分配弹窗。
- `adjustStatDraft(key, delta)`：调整属性点草稿。
- `applyStatDraft()`：应用属性点分配。
- `upgradeSkill(skillId)`：升级技能。
- `skillUpgradeCost(skillId)`：计算技能升级成本。
- `upgradedSkill(skill)`：计算升级后的技能效果。

符文入口：

- `craftRune(name)`：三个同级同名符文合成下一级。
- `applyRune(total, rune)`：把符文效果写入汇总属性。
- `runeEffectText(rune)`：展示符文效果。

商店和合成台：

- `openMerchant()`：打开商人对话。
- `openMerchantShop()`：打开商店购买界面。
- `buy(kind)`：购买药水、钥匙或商路信标。
- `merchantSalvageRows()`：商人处分解/出售入口。
- `openForge()`：打开合成台，提供强化和符文合成。

装备修改入口：

- 装备槽：`SLOTS`、`SLOT_NAMES`、`emptyEquipment()`、`starterEquipment()`、纸娃娃渲染和 CSS。
- 品质概率：`qualityRoll()`。
- 品质强度：`qualityBonus()`。
- 装备评分：`itemScore()`。
- 强化成本：`canEnhance()`、`enhanceDisabledReason()`、`enhance()`、`confirmEnhance()`。
- 符文效果：`applyRune()` 和 `runeEffectText()`。

## 12. 任务系统

任务定义在 `quests.ts`，运行时逻辑在 `questRuntime.ts`。任务状态保存在 `state.quests`，部分兼容字段保存在 `state.quest`。

任务类型：

- `rescueRoom`：房间救援，清理指定房间并救出被困者。
- `wardenErrand`：巡夜人委托，清理本层怪物换取钥匙。
- `merchantRoute`：商路清理，帮商人扫清附近怪物换取补给和金币。

任务入口：

- `placeQuestNpc(map, source)`：在地图上放置任务 NPC。
- `placeRescueQuest(map, rooms)`：生成救援房间、被困者和相关敌人。
- `questDefFromSource(giver, source)`：由地图物件合成任务定义。
- `acceptQuest(id, source)`：接取任务。
- `recordQuestKill(enemy, rewards)`：战斗胜利后推进任务。
- `openQuestFromGiver(giver, source)`：打开任务弹窗。
- `openRescueNpc(obj)`：处理救援目标交互。
- `claimQuestReward(id, roomId)`：领取任务奖励。
- `renderQuestList()`：渲染右侧任务列表。

任务修改入口：

- 新任务定义：`QUEST_DEFS`。
- 新任务 NPC：`placeQuestNpc()` 和地图投放规则。
- 救援任务流程：`placeRescueQuest()`、`openRescueNpc()`、`recordQuestKill()`。
- 任务奖励：`questRewardGold()` 和任务定义中的奖励字段。
- 任务展示：`renderQuestList()` 和 `questLocationText()`。

## 13. 传送道具

商路信标是一次性传送道具，由 `teleportBeacon()` 创建。玩家可在商人处购买，使用后列出已知可传送目标。

目标来源：

- 当前楼层。
- `floorStates` 中已缓存的楼层。

目标类型：

- 商人。
- 委托人。
- 被困者。
- 合成台。

关键入口：

- `openTeleportBeacon(id)`：打开目标列表。
- `knownTeleportTargets()`：收集可传送目标。
- `landingNear(map, x, y)`：寻找目标附近可落脚格。
- `teleportToTarget(id, target)`：消耗信标并移动玩家。

修改入口：

- 目标类型：`knownTeleportTargets()`。
- 传送落点：`landingNear()`。
- 道具价格：`buy("beacon")` 和 `confirmBuy()`。
- 掉落来源：`maybeDrop()` 或 `openChest()`。

## 14. 渲染系统

渲染逻辑集中在 `renderRuntime.ts`。入口 `render()` 根据当前状态决定显示开始页、地图视图或战斗视图，并在完整渲染后静默保存当前游戏。

渲染流程：

1. 没有活动游戏时显示开始页。
2. 地图为空或尺寸不匹配时生成地图。
3. 修正生命法力不超过有效上限。
4. 根据 `state.currentEnemy` 渲染地图或战斗区域。
5. 渲染角色栏、图例、右侧上下文、标签页和日志。
6. 同步音乐状态。
7. 静默保存。

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
- `renderContext()`：右侧上下文行动。
- `renderTab()`：右侧标签页内容。
- `renderInventory()`：背包。
- `renderEquipment()`：装备页。
- `renderCraft()`：合成页。
- `renderSkills()`：技能页。
- `renderQuestList()`：任务页。
- `renderLog()`：冒险日志。

地图展示入口：

- `shouldShowMapObject(cell)`：判断物件是否显示。
- `objectSprite(obj)`：物件图片。
- `enemySprite(enemy)`：敌人图片。
- `badgeForObject(type)`：格子短标签。
- `tileLabel(cell, isPlayer, reveal)`：格子可读文案。
- `roomDoorLabel(cell)`：房间门牌。
- `assetForClass(classId)`：职业图片。
- `clickTile(x, y)`：点击地图格。
- `applyFloorEffectClass(effect)`：给地图区域挂载雨、雪、熔岩等特殊楼层 class。

渲染修改入口：

- 主布局：`index.html` 和 `src/styles.css`。
- 地图格：`renderMap()`、`tileLabel()`、`objectSprite()`、`.tile`。
- 小地图：`renderMinimap()`、`minimapMarker()`、`.minimap`。
- 战斗面板：`renderBattleView()`、`renderBattleCommandPanel()`、`.battle-*`。
- 背包列表：`inventoryGroupMarkup()`、`inventorySubtabs()`、`equipmentInventoryRow()`。
- 装备详情：`equipmentDetailMarkup()`、`equipmentCompareText()`。
- 右侧上下文：`renderContext()`。
- 弹窗：`modalRuntime.ts` 和 `.modal`。

## 15. 存档系统

存档逻辑由 `saveRuntime.ts` 处理，存档槽工具在 `save.ts`。

存储 key：

- `SAVE_KEY`：`rune-dungeon-save-v1`。
- `SAVE_INDEX_KEY`：`${SAVE_KEY}-index-v2`。
- 单个槽位：`${SAVE_KEY}-${slotId}`。
- 当前槽位：`${SAVE_KEY}-current`。

存档槽：

- `SAVE_SLOT_LIMIT` 当前为 4。
- 槽位 id 格式为 `slot-1` 到 `slot-4`。
- `saveSlots()` 返回槽位列表和摘要信息。
- `saveSlotLabel(slotId)` 生成展示名。

保存入口：

- `saveGame(show, slotId)`：保存完整 `state`。
- `saveGameToSlot(slotId)`：保存弹窗确认后的写入。
- `openSaveSlotPicker()`：打开保存槽选择。
- `updateSaveSlotMeta(slotId, snapshot)`：更新存档摘要。

读取入口：

- `loadGame(slotId)`：读取槽位并补齐当前状态字段。
- `continueSavedGame(slotId)`：从开始页继续游戏。
- `renderContinueSlots()`：渲染可继续的存档槽。

删除和返回：

- `deleteSaveSlot(slotId)`：删除指定槽位和摘要。
- `returnHome()`：保存当前状态，退出到开始页。
- `newGamePrompt()`：打开新游戏/存档列表选择。

兼容处理：

- `migrateLegacySave()` 把单槽存档数据归入 `slot-1`。
- `loadGame()` 补齐 `facing`、`skillPoints`、`skillDust`、`keys`、`quest`、`quests`、`floorStates` 和 `skillLevels`。
- 地图尺寸不匹配时重新生成地图。
- 探索版本不匹配时重置视野字段。

修改 `GameState` 字段时，同步检查 `startGame()` 初始化、`loadGame()` 字段补齐、`tests/harness/runtimeHarness.ts` 归一化逻辑和相关测试。

## 16. 音频系统

音频逻辑由 `audioRuntime.ts`、`audioProfiles.ts` 和 `audioEngine.ts` 组成。

职责划分：

- `audioProfiles.ts`：定义短音效的振荡器、包络、滤波等参数。
- `audioEngine.ts`：提供音频节点创建、调度和播放工具。
- `audioRuntime.ts`：管理 AudioContext、声音开关、短音效、探索音乐和战斗音乐。

主要入口：

- `initAudio(playReady)`：初始化 AudioContext。
- `toggleAudio()`：切换声音开关。
- `setAudioEnabled(enabled, playReady)`：设置声音状态并写入 localStorage。
- `updateSoundButton()`：同步按钮文案和 `aria-pressed`。
- `playSound(kind)`：播放短音效。
- `syncMusicToGame()`：根据当前是否战斗切换音乐层。
- `startDungeonMusic()`：启动探索氛围。
- `startBattleMusic()`：启动战斗音乐。

修改入口：

- 新短音效：`audioProfiles.ts`。
- 新播放时机：对应领域运行时调用 `playSound("key")`。
- 音乐层行为：`syncMusicToGame()`、`startDungeonMusic()`、`startBattleMusic()`。
- 声音按钮：`updateSoundButton()` 和 `index.html` 的 `soundBtn`。

## 17. 开发调试面板

开发调试面板仅在开发环境启用，用于手动验证楼层特效、奖励倍率和物品系统。正式构建不会响应调试入口，公开文档也不记录暗号。开发环境输入调试暗号后，会在本次页面会话右上角显示临时调试按钮；刷新页面后按钮消失。

当前能力：

- 切换当前地图为无效果、暴雨层、霜雪层或熔岩层。
- 调整当前地图的难度倍率，范围限制为 0.80 到 1.50。
- 调整当前地图的奖励倍率，范围限制为 0.80 到 2.00。
- 增加金币、符文钥匙、强化石和技能尘。
- 回满生命和法力。
- 添加随机装备、生命药水、法力药水、商路信标和指定一级符文。

相关入口只保留在开发源码中，正式构建产物不暴露调试入口。

## 18. 常见修改索引

| 目标 | 优先查看 |
| --- | --- |
| 新增职业 | `CLASSES`、`starterEquipment()`、`starterInventory()`、`assetForClass()`、`ASSETS` |
| 修改职业技能 | `CLASSES.skills`、`castSkill()`、`upgradedSkill()`、`renderSkills()` |
| 修改地图尺寸 | `MAP_SIZE`、`MAP_SIZE_MIN`、`MAP_SIZE_MAX`、`MAP_VIEW_SIZE`、`renderMap()`、`renderMinimap()`、`src/styles.css`、地图测试 |
| 修改最大楼层 | `MAX_FLOOR`、`isFinalFloor()`、`themeForFloor()`、`makeEnemy()`、`nextFloor()` |
| 修改楼层主题 | `THEMES`、`themeForFloor()`、CSS 主题 class |
| 修改楼梯规则 | `placeFloorStairs()`、`chooseStairCell()`、`entryPositionForDirection()` |
| 修改楼梯封印 | `maybeSealDownstairs()`、`placeGuardNear()`、`completeStairSeal()` |
| 修改地图物件 | `LEGEND_ITEMS`、`ASSETS`、`resolveCell()`、`objectSprite()`、`badgeForObject()`、`tileLabel()` |
| 修改特殊楼层 | `FLOOR_EFFECTS`、`chooseFloorEffect()`、`floorEffectReward()`、`applyFloorEffectToEnemy()`、`.effect-*` |
| 修改怪物数值 | `makeEnemy()`、`makeEnemyWithVariant()`、`makeKeyGuardian()` |
| 修改敌人词缀 | `ENEMY_AFFIXES`、`maybeApplyEnemyAffix()`、`enemyAffixText()` |
| 修改战斗公式 | `dealDamage()`、`enemyTurn()`、`castSkill()` |
| 修改一键战斗 | `battleRisk()`、`autoBattlePolicy()`、`executeAutoBattle()` |
| 修改掉落 | `openChest()`、`openLockedChest()`、`maybeDrop()`、`randomEquipment()` |
| 修改装备系统 | `item()`、`randomEquipment()`、`equipItem()`、`unequipItem()`、`itemScore()` |
| 修改强化 | `canEnhance()`、`enhanceDisabledReason()`、`enhance()`、`confirmEnhance()` |
| 修改符文 | `RUNES`、`craftRune()`、`applyRune()`、`runeEffectText()` |
| 修改属性点 | `openStatAllocator()`、`adjustStatDraft()`、`applyStatDraft()` |
| 修改任务 | `QUEST_DEFS`、`placeQuestNpc()`、`placeRescueQuest()`、`recordQuestKill()`、`renderQuestList()` |
| 修改商人 | `openMerchant()`、`openMerchantShop()`、`buy()`、`merchantSalvageRows()` |
| 修改合成台 | `openForge()`、`renderCraft()`、`enhance()`、`craftRune()` |
| 修改传送道具 | `teleportBeacon()`、`openTeleportBeacon()`、`knownTeleportTargets()`、`teleportToTarget()` |
| 修改存档 | `save.ts`、`saveRuntime.ts`、`startGame()`、`loadGame()`、测试 harness |
| 修改开发调试面板 | `src/ui/bindEvents.ts`、`src/game/runtime.ts`、`src/styles.css` |
| 修改输入 | `src/ui/bindEvents.ts` |
| 修改主 UI | `index.html`、`renderRuntime.ts`、`src/styles.css` |
| 修改音频 | `audioProfiles.ts`、`audioRuntime.ts`、`audioEngine.ts` |

## 19. 验证范围

文档或注释修改：

```powershell
npm run build
```

地图生成、楼梯、房间、视野、地图物件修改：

```powershell
npm run build:test-harness
node tests\map-generation.test.js
```

装备、背包、装备对比、纸娃娃和 UI 文案修改：

```powershell
npm run build:test-harness
node tests\equipment-ui.test.js
```

移动、战斗、任务、楼层推进、存档行为修改：

```powershell
npm run build:test-harness
node tests\gameplay-behavior.test.js
```

跨系统修改：

```powershell
npm run build
npm test
```
