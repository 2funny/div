# 符文地牢项目设计文档

> 迁移说明：项目当前运行入口已经迁移为 Vite + Vanilla TypeScript + 原生 CSS。页面由 `index.html` 加载 `src/main.ts`，样式入口是 `src/styles.css`，静态资源位于 `public/assets`。旧版 `js/data.js`、`js/game.js`、`js/bootstrap.js`、根目录 `styles.css` 和根目录 `assets/` 已不再作为运行或测试入口保留。

## 0. 当前工程结构

- `index.html`：Vite 页面入口，保留原有 DOM 骨架。
- `src/main.ts`：应用启动入口，导入样式、绑定事件、渲染开始界面。
- `src/styles.css`：原生 CSS 样式入口。
- `src/game/data.ts`：职业、主题、地图尺寸、资源路径、图例、全局常量等静态配置。
- `src/game/runtime.ts`：迁移期主运行时，仍承载大部分原游戏逻辑。后续继续按职责拆到 `map.ts`、`combat.ts`、`inventory.ts`、`save.ts`、`player.ts` 等文件。
- `src/game/types.ts`：核心类型定义，如 `GameState`、`Player`、`Enemy`、`Room`、`Cell`、`Item`。
- `src/game/save.ts`：存档槽配置、localStorage index 读写、时间格式化，并导出运行时存档入口。
- `src/game/audioProfiles.ts`、`src/game/audioEngine.ts`：短音效配置和 Web Audio 底层合成。
- `src/game/combatFx.ts`：战斗飘字和动画状态。
- `src/ui/bindEvents.ts`：键盘、按钮、标签页、声音、保存等事件绑定。
- `src/ui/renderMap.ts`、`src/ui/renderPanel.ts`：地图和面板渲染入口，后续承接从 `runtime.ts` 拆出的 UI 实现。
- `public/assets`：Vite 静态资源目录，构建后会复制到 `dist/assets`。
- `tests/`：Node 回归测试。`npm test` 会先用 Vite 打包 `tests/harness/runtimeHarness.ts`，再验证 TypeScript 运行时和 `src/styles.css`。

常用命令：

```powershell
npm run dev
npm run build
npm test
```

## 1. 项目定位

这是一个纯前端的半随机地牢闯关 RPG。项目使用 Vite 作为开发和打包工具，使用 Vanilla TypeScript 组织游戏逻辑，并继续使用原生 CSS。`index.html` 加载 `src/main.ts` 后启动游戏，Vite 负责打包 `src/styles.css`、`src/game`、`src/ui` 和 `public/assets`。游戏状态存储在浏览器 `localStorage` 中，刷新页面后可以继续读取同一份存档。

核心玩法循环是：

1. 选择职业并创建角色。
2. 在 27x27 的随机地牢中探索。
3. 触发怪物、宝箱、祭坛、商人、合成台、任务 NPC、楼梯等地图物件。
4. 通过战斗、任务和宝箱获得经验、金币、装备、符文和材料。
5. 使用装备、强化、符文和技能升级提升角色强度。
6. 逐层推进到第 66 层最终 Boss。

## 2. 文件职责

### `index.html`

页面结构固定在这里，主要提供三个区域：

- 左侧 `hero-panel`：玩家头像、生命/法力/经验条、属性、纸娃娃装备。
- 中间 `map-wrap`：楼层标题、主地图、小地图、图例，战斗时也会在这里切换成战斗面板。
- 右侧 `action-panel`：上下文行动、背包/技能/任务标签页、冒险日志。

如果要新增一个固定 UI 容器，例如“成就栏”“设置面板”，优先从这里增加 DOM 节点，再在 `src/ui` 或对应 `src/game` 模块里新增渲染函数。

### `src/styles.css`

所有布局、地图格子、战斗面板、背包列表、纸娃娃、弹窗和提示层样式都在这里。游戏逻辑不依赖 CSS 变量之外的样式状态，通常可以独立调整视觉。

常见修改点：

- 地图大小显示、格子样式：搜索 `.map`、`.tile`、`.minimap`。
- 战斗界面：搜索 `.battle-stage`、`.battle-board`、`.battle-command-panel`。
- 背包装备卡片：搜索 `.item-row`、`.equipment-card`、`.equipment-compare`。
- 弹窗和 toast：搜索 `.modal`、`.toast`。

### `src/game/data.ts`

这里放静态配置，不负责状态变化。

主要配置：

- `CLASSES`：职业、初始属性、生命法力、技能。
- `THEMES`：楼层主题、墙体比例和 CSS 主题 class。
- `RUNES`：符文基础名称。
- `SLOTS`、`SLOT_NAMES`：装备槽位。
- `STAT_NAMES`：属性显示名。
- `SAVE_KEY`：localStorage 存档 key。
- `MAX_FLOOR`：最大楼层，当前为 66 层。
- `MAP_SIZE`、`MAP_VIEW_SIZE`、`VISION_RADIUS`：地图尺寸、可视窗口和视野半径。
- `ASSETS`：图片资源路径。
- `LEGEND_ITEMS`：地图图例。

如果只改数值、职业、技能名称、资源路径，优先改这个文件。

### `src/game/runtime.ts`

这是迁移期主运行时文件，仍包含大部分原游戏逻辑：全局状态、地图生成、探索、战斗、任务、装备、渲染、存档和弹窗。后续继续按职责迁出到 `map.ts`、`combat.ts`、`inventory.ts`、`save.ts`、`player.ts`、`renderMap.ts`、`renderPanel.ts` 等模块。

全局变量：

- `state`：完整游戏状态，保存角色、地图、背包、装备、任务、战斗、日志等。
- `activeTab`、`activeInventoryTab`、`activeEquipmentFilter`：右侧面板当前标签和筛选状态。
- `selectedTile`：当前被点击的小地图或主地图格子。
- 战斗飘字和动画状态：已迁到 `src/game/combatFx.ts`。
- `statDraft`：属性点分配弹窗的临时草稿。
- `audioState`、`audioEnabled`：音频上下文和开关状态。

### `src/ui/bindEvents.ts`

只负责事件绑定和启动：

- 键盘方向键、WASD 移动。
- 点击弹窗遮罩关闭弹窗。
- 点击按钮后移除焦点。
- 方向按钮、标签页、声音、保存、新游戏按钮。
- 首次进入时渲染开始界面。

如果要改“玩家输入方式”，例如增加快捷键、手柄按钮、移动按钮行为，优先看这里。

### `tests/`

测试使用 Node 脚本直接加载前端 JS。当前有三类测试：

- `map-generation.test.js`：地图生成相关行为。
- `gameplay-behavior.test.js`：移动、战斗、楼层、任务等玩法行为。
- `equipment-ui.test.js`：装备、背包、UI 文案和操作行为。

改逻辑后建议至少运行对应测试；只改注释和文档时可以运行 `node --check` 做语法验证。

## 3. 状态结构

`state` 是整个游戏的唯一核心状态。创建角色时由 `startGame(classId)` 初始化，保存时通过 `saveGame()` 写入 localStorage。

常用字段：

- `classId`：职业 id，对应 `CLASSES`。
- `floor`：当前楼层。
- `level`、`xp`、`xpNext`：等级和经验。
- `gold`、`keys`：金币和符文钥匙。
- `hp`、`maxHp`、`mp`、`maxMp`：当前生命法力和基础上限。
- `stats`：基础属性，装备和符文不会直接写入这里。
- `statPoints`、`skillPoints`、`skillDust`：成长资源。
- `inventory`：背包，包含药水、装备和传送道具。
- `materials`：强化石、魔尘、首领印记等材料。
- `runes`：符文库存，格式如 `火焰1`。
- `equipment`：当前装备，key 来自 `SLOTS`。
- `map`：当前楼层地图。
- `floorStates`：已经访问过的楼层缓存。
- `player`：玩家地图坐标。
- `currentEnemy`：当前战斗敌人，非空时进入战斗模式。
- `quests`：任务列表。
- `log`：冒险日志。

注意：装备和符文属性通过 `totals()` 动态汇总，不直接改写 `state.stats`。修改属性计算时优先看 `totals()`、`applyRune()`、`effectiveMaxHp()`、`effectiveMaxMp()`。

## 4. 地图生成设计

入口方法是 `generateFloor()`。

普通楼层流程：

1. 创建全墙地图。
2. `carveMainRoute()` 从左上入口挖到右下出口。
3. `widenMainRoute()` 扩宽主路。
4. `carveSideRooms()` 生成分支房间。
5. `carveStructuredRooms()` 生成带门和 roomId 的结构化房间。
6. `pruneDisconnectedFloors()` 删除入口不可达区域。
7. `assignRoomLabels()` 给房间生成展示名。
8. `placeTreasureEncounters()` 放置宝箱遭遇。
9. `scatter()` 散布普通怪、陷阱、祭坛、商人和合成台。
10. `placeRescueQuest()` 或 `placeQuestNpc()` 放置任务内容。
11. `resolveOutdoorFeatureCrowding()` 调整室外物件密度。
12. `placeFloorStairs()` 在远离入口的房间或路线尽头放置上下楼梯。
13. `maybeSealDownstairs()` 偶尔给下行楼梯添加封印，并在附近生成封印守卫。
14. `updateVisibility()` 初始化视野。

第 66 层是特殊 Boss 层：中心区域固定开阔，中心放最终 Boss，角落放祭坛和合成台，不再生成下行楼梯。

上下楼规则：

- 第 1 层没有上行楼梯，玩家从 `1,1` 附近开始探索。
- 第 2 层以后，上行楼梯也会放在真实地图格上，不再固定左上角。
- 下行楼梯优先选择远离入口的房间、门后区域或路线尽头，避免开局很快找到。
- `state.map.stairsUp` 和 `state.map.stairsDown` 记录楼梯位置，`enterFloor()` 根据上下楼方向把玩家放到对应楼梯处。
- 如果下行楼梯带 `locked: true`，`nextFloor()` 会阻止下楼，并提示要击败封印守卫。
- 击败带 `sealId` 的封印守卫后，`completeStairSeal()` 会解除对应下楼梯封印。

房间威胁：

- `assignRoomLabels()` 会给房间分配轻量威胁等级：安静、危险、封印、宝藏。
- `roomDoorLabel()` 会在门牌上显示威胁标记，例如 `13号险`。
- 危险/封印房间里的怪物更容易生成精英，用于制造“要不要现在进去”的探索选择。

手动修改建议：

- 想改地图尺寸：改 `src/game/data.ts` 的 `MAP_SIZE`，同时确认样式和测试。
- 想改最大楼层：改 `MAX_FLOOR`，再检查最终 Boss、主题和数值曲线。
- 想改玩家视野：改 `VISION_RADIUS`，逻辑在 `updateVisibility()`。
- 想改每层怪物数量：看 `generateFloor()` 里 `scatter(map, "monster", ...)`。
- 想改宝箱数量：看 `placeTreasureEncounters(map, 5)`。
- 想改商人/合成台出现频率：看 `state.floor % 3` 的判断。
- 想改楼梯距离、偏好和封印频率：看 `chooseStairCell()`、`stairScore()`、`maybeSealDownstairs()`。
- 想增加新地图物件：先在 `ASSETS`、`LEGEND_ITEMS` 加配置，再补 `resolveCell()`、`objectSprite()`、`badgeForObject()`、`tileLabel()`。

## 5. 探索与交互

玩家移动入口是 `move(dx, dy)`。

移动流程：

1. 更新朝向。
2. 计算目标格。
3. 如果是墙或栅栏，阻止移动。
4. 如果是危险敌人，先调用 `promptDangerousEnemy()` 确认。
5. 如果是商人、合成台、委托人、救援目标、门栅或未解锁宝箱，先交互不移动。
6. 移动玩家坐标。
7. 播放脚步或危险音效。
8. 更新视野。
9. 调用 `resolveCell(cell)` 触发格子物件。
10. 重新渲染。

`resolveCell()` 是地图物件分发中心：

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
- 楼梯或传送门：`nextFloor()` / `previousFloor()`。

## 6. 战斗系统

战斗入口是 `enterBattle(enemy)`，它把敌人写入 `state.currentEnemy`，渲染时 `renderBattleView()` 会把地图区域切换为战斗面板。

玩家行动入口是 `attackEnemy(mode, skill)`：

- `attack`：普通攻击，使用 `dealDamage()` 计算伤害和暴击。
- `skill`：先检查 MP，再用 `castSkill()` 执行技能效果。
- `defend`：设置 `state._guard`，敌人回合会扣减伤害。

敌人回合由 `enemyTurn(enemy)` 处理：

- 速度和闪避技能影响闪避概率。
- 防御状态会抵扣伤害。
- 生命小于等于 0 时触发 `death()`。

胜利结算由 `winBattle(enemy)` 处理：

1. 发放金币和经验。
2. 清除当前格子的敌人。
3. 调用 `recordQuestKill()` 推进任务。
4. 调用 `maybeDrop()` 抽掉落。
5. 循环调用 `levelUp()` 处理升级。
6. 如果击败 Boss，显示通关弹窗。

一键战斗：

- `battleRisk(enemy)` 估算玩家胜率。
- `autoBattlePolicy(enemy)` 是一键战斗准入策略，只允许资源充足时清理低风险普通怪。
- `autoBattle()` 在风险过高、生命低、法力低、敌人是精英/守卫/Boss、敌人带词缀时阻止自动结算。
- `executeAutoBattle()` 最多连续结算 3 回合，仍然复用普通战斗流程，回合后如果不再满足安全线会中止。

敌人词缀：

- `maybeApplyEnemyAffix(enemy, eliteOrBoss)` 会给精英、特殊守卫和部分中后期普通怪添加词缀。
- `enemyAffixText(enemy)` 生成战斗面板和地图提示中使用的词缀说明。
- 当前词缀包括 `坚甲`、`破盾`、`汲取`、`迅捷`。词缀敌人禁用一键战斗，需要玩家手动处理。

难度目标：

- 普通怪：装备正常时可以处理，资源充足且胜率高时允许一键战斗。
- 精英怪：首次遭遇通常需要手动判断技能、药水和防御。
- 封印守卫：用于锁楼梯，应当逼玩家确认状态再打。
- Boss：不应靠一键战斗解决。

手动修改建议：

- 改普通攻击公式：看 `attackEnemy()` 中 `dealDamage(enemy, ...)` 的入参。
- 改暴击概率和倍率：看 `dealDamage()`。
- 改敌人伤害：看 `enemyTurn()`。
- 改技能效果：看 `castSkill()` 和 `src/game/data.ts` 的 `CLASSES.skills`。
- 改敌人数值成长：看 `makeEnemy()`。
- 改敌人词缀：看 `ENEMY_AFFIXES`、`maybeApplyEnemyAffix()`、`enemyAffixText()`。
- 改一键战斗门槛：看 `autoBattlePolicy()`。
- 改掉落概率：看 `maybeDrop()`。
- 改升级曲线：看 `levelUp()`。

## 7. 装备、符文和成长

装备结构由 `item()` 创建：

- `kind: "equip"`。
- `slot`：装备槽位。
- `quality`：普通、优秀、稀有、史诗、传说。
- `stats`：属性加成。
- `runeSlots`：符文槽数量。
- `runes`：已镶嵌符文列表。
- `level`：强化等级。

装备掉落由 `randomEquipment()` 创建，品质由 `qualityRoll()` 决定，基础属性预算由 `qualityBonus()` 决定。

装备相关入口：

- `equipItem(id)`：穿装备，并把旧装备放回背包。
- `unequipItem(slot)`：拆下装备。
- `enhance(slot)`：消耗金币和强化石强化装备。
- `sellEquipment(id)`：在商人附近出售装备。
- `disassembleEquipment(id)`：分解装备获得魔尘和强化石。
- `itemScore(item)`：装备评分，用于排序和对比。

符文相关入口：

- `craftRune(name)`：三个同级同名符文合成下一级。
- `applyRune(total, rune)`：把符文效果写入汇总属性。
- `runeEffectText(rune)`：生成符文说明文案。

属性成长：

- `openStatAllocator()`、`adjustStatDraft()`、`applyStatDraft()` 控制批量分配属性点。
- `upgradeSkill(skillId)` 控制技能升级。
- `skillUpgradeCost(skillId)` 控制技能升级成本。
- `upgradedSkill(skill)` 控制技能升级后的倍率和耗蓝。

手动修改建议：

- 新增装备槽：改 `SLOTS`、`SLOT_NAMES`，再检查 `starterEquipment()`、`emptyEquipment()`、纸娃娃和 CSS。
- 改装备品质概率：改 `qualityRoll()`。
- 改品质数值强度：改 `qualityBonus()`。
- 改强化成本：改 `confirmEnhance()` 文案、`canEnhance()` 条件和 `enhance()` 扣费。
- 改符文效果：改 `applyRune()` 和 `runeEffectText()`。
- 改装备评分：改 `itemScore()`。

## 8. 任务系统

任务定义在 `QUEST_DEFS`，任务状态保存在 `state.quests`。任务发布楼层记录在 `floor`，目标楼层记录在 `targetFloor`。普通委托可以指向当前层或相邻楼层，跨度不应过大；任务列表会显示“目标第 N 层”。

任务类型：

- `wardenErrand`：巡夜人清怪任务。
- `merchantRoute`：商人路线清理任务。
- `rescueRoom`：房间救援任务，会动态绑定房间、被困者和任务发布者。

关键方法：

- `placeRescueQuest(map, rooms)`：地图生成时选择远处房间，放置被困者和房间怪物。
- `placeQuestNpc(map, source)`：放置任务发布者。
- `questDefFromSource(giver, source)`：根据任务来源合成动态任务定义。
- `acceptQuest(id, source)`：接受任务。
- `recordQuestKill(enemy, rewards)`：击杀怪物后推进任务。
- `openQuestFromGiver(giver, source)`：展示任务弹窗。
- `claimQuestReward(id, roomId)`：领取奖励。
- `renderQuestList()`：右侧任务列表。

手动修改建议：

- 新增固定任务：在 `QUEST_DEFS` 加定义，再确认对应发布者 `giver`。
- 修改奖励：改任务定义里的 `rewardGold`、`rewardKeys`、`rewardPotion`。
- 修改救援任务流程：看 `placeRescueQuest()`、`openRescueNpc()`、`recordQuestKill()`。
- 修改任务列表展示：看 `renderQuestList()`。

## 9. 传送道具

`商路信标` 是一种消耗道具，商人处可以购买。使用后会扫描当前楼层和 `floorStates` 中已经探索过的楼层，列出可传送目标：

- 商人。
- 委托人。
- 被困者。
- 合成台。

关键方法：

- `teleportBeacon()`：创建商路信标物品。
- `openTeleportBeacon(id)`：打开传送目标弹窗。
- `knownTeleportTargets()`：从当前楼层和楼层缓存收集可传送目标。
- `landingNear(map, x, y)`：寻找目标附近可落脚格，避免直接站到阻挡型 NPC 或设施上。
- `teleportToTarget(id, target)`：消耗信标并切换楼层、移动玩家。

手动修改建议：

- 想调整传送目标类型：改 `knownTeleportTargets()` 中允许的 `object.type`。
- 想调整价格：改 `buy("beacon")` 和 `confirmBuy()`。
- 想让信标通过掉落获得：在 `maybeDrop()` 或 `openChest()` 里加入 `teleportBeacon()`。

## 10. 渲染设计

渲染入口是 `render()`。它会：

1. 如果没有 `state`，显示职业选择/开始界面。
2. 如果地图不存在或尺寸过期，重新生成地图。
3. 修正当前生命法力不超过有效上限。
4. 渲染左侧角色、主地图、小地图、图例、战斗面板、右侧上下文、标签页和日志。
5. 自动把当前状态写入 localStorage。

主要渲染方法：

- `renderHero()`：左侧角色信息和纸娃娃。
- `renderMap()`：主地图。
- `renderMinimap()`：小地图。
- `renderLegend()`：图例。
- `renderBattleView()`：战斗区域。
- `renderContext()`：右侧上下文行动。
- `renderTab()`：侧边栏标签。
- `renderInventory()`：背包。
- `renderSkills()`：技能。
- `renderQuestList()`：任务。
- `renderLog()`：日志。

地图格子的说明和视觉由这些方法共同决定：

- `shouldShowMapObject()`：未探索或陷阱是否显示。
- `tileLabel()`：格子的可读说明。
- `objectSprite()`：物件图片。
- `badgeForObject()`：短标签。
- `roomDoorLabel()`：房间门上的短编号，例如 `12号`。
- `assetForClass()`：职业图片。

手动修改建议：

- 想改地图上显示的图标：看 `objectSprite()`、`enemySprite()`、`ASSETS`。
- 想改地图按钮文案：看 `tileLabel()`。
- 想改房间编号显示：看 `roomDoorLabel()` 和 `.room-label` 样式。
- 想改右侧行动提示：看 `renderContext()`。
- 想改背包分组：看 `inventoryGroupMarkup()`、`inventorySubtabs()`。
- 想改装备详情：看 `equipmentDetailMarkup()`。
- 想改战斗按钮布局：看 `renderBattleCommandPanel()`。

## 11. 存档和兼容

存档 key 是 `SAVE_KEY = "rune-dungeon-save-v1"`。

保存入口：

- `saveGame(show = true)`：手动保存或静默保存。
- `render()`：每次完整渲染后自动保存一次。

读取入口：

- `loadGame()`：从 localStorage 读取，并补齐新版字段。
- `continueSavedGame()`：开始界面点击继续冒险。

兼容处理：

- `loadGame()` 会补齐 `skillPoints`、`skillDust`、`keys`、`quests`、`floorStates`、`skillLevels`。
- 如果地图尺寸变化，会重新生成地图。
- 如果探索版本不是 2，会调用 `resetExploration()` 重置视野字段。

如果改了 `state` 结构，要同步检查 `loadGame()`，否则老存档可能缺字段。

## 12. 音频系统

音频逻辑分布在 `src/game/audioProfiles.ts`、`src/game/audioEngine.ts` 和 `src/game/runtime.ts`：

- `initAudio()`：创建 AudioContext，并处理浏览器交互后才能播放的限制。
- `setAudioEnabled()`：切换声音开关并保存到 localStorage。
- `startDungeonMusic()`、`scheduleDungeonAmbience()`、`playAmbientTone()`：地牢氛围声。
- `playSound(kind)`：短音效。

新增音效时，在 `playSound()` 的 `tones` 对象里加新 key，然后在事件发生处调用 `playSound("新key")`。

## 13. 常见修改索引

| 目标 | 优先查看 |
| --- | --- |
| 新增职业 | `src/game/data.ts` 的 `CLASSES`、`starterEquipment()`、`assetForClass()`、`ASSETS` |
| 修改最大楼层 | `MAX_FLOOR`、`isFinalFloor()`、`makeEnemy()`、`nextFloor()` |
| 修改技能 | `CLASSES.skills`、`castSkill()`、`upgradedSkill()` |
| 修改怪物强度 | `makeEnemy()`、`makeKeyGuardian()` |
| 修改敌人词缀 | `ENEMY_AFFIXES`、`maybeApplyEnemyAffix()`、`enemyAffixText()` |
| 修改一键战斗 | `autoBattlePolicy()`、`autoBattle()`、`executeAutoBattle()` |
| 修改地图尺寸 | `MAP_SIZE`、`MAP_VIEW_SIZE`、`renderMap()`、CSS 地图样式、测试 |
| 修改楼梯位置 | `placeFloorStairs()`、`chooseStairCell()`、`entryPositionForDirection()` |
| 修改楼梯封印 | `maybeSealDownstairs()`、`currentStairsDown()`、`completeStairSeal()` |
| 修改地图物件 | `resolveCell()`、`objectSprite()`、`badgeForObject()`、`tileLabel()`、`LEGEND_ITEMS` |
| 修改掉落 | `openChest()`、`openLockedChest()`、`maybeDrop()`、`randomEquipment()` |
| 修改装备系统 | `item()`、`randomEquipment()`、`equipItem()`、`enhance()`、`itemScore()` |
| 修改符文系统 | `RUNES`、`craftRune()`、`applyRune()`、`runeEffectText()` |
| 修改任务 | `QUEST_DEFS`、`placeRescueQuest()`、`openQuestFromGiver()`、`recordQuestKill()` |
| 修改传送道具 | `teleportBeacon()`、`knownTeleportTargets()`、`teleportToTarget()` |
| 修改商人 | `openMerchant()`、`openMerchantShop()`、`buy()`、`merchantSalvageRows()` |
| 修改合成台 | `openForge()`、`enhance()`、`canEnhance()`、`enhanceDisabledReason()` |
| 修改存档兼容 | `SAVE_KEY`、`saveGame()`、`loadGame()` |
| 修改输入 | `src/ui/bindEvents.ts` |
| 修改主 UI 布局 | `index.html`、`render()`、`src/styles.css` |

## 14. 修改后的验证建议

只改注释或文档：

```powershell
npm run build
npm test
```

改地图生成：

```powershell
node tests\map-generation.test.js
```

改战斗、移动、任务、楼层：

```powershell
node tests\gameplay-behavior.test.js
```

改装备、背包、UI 操作：

```powershell
node tests\equipment-ui.test.js
```

如果修改影响多个系统，建议三个测试脚本都跑一遍。
