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
- `src/game/save/`：存档槽、存档 key、存档索引和持久化读写。
- `src/game/audio/`：短音效、地牢 BGM、战斗 BGM 和 Web Audio 底层工具。
- `src/game/random.ts`：可注入、可播种的随机数工具。
- `src/game/progression.ts`：等级经验、推荐楼层等级、等级压制经验衰减和技能点获取节奏。
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
- `statPoints`、`skillPoints`、`skillDust`、`skillLevels`、`skillBranches`、`skillCooldowns`、`learnedSkillIds`、`equippedSkillIds`：成长与技能状态。
- `inventory`、`equipment`：背包与装备。
- `map`、`floorStates`、`player`、`facing`：地图缓存、位置和朝向。
- `currentEnemy`：当前战斗敌人。
- `quests`：任务状态列表。
- `log`：冒险日志。

存档槽规则：

- `SAVE_SLOT_LIMIT` 当前为 8。
- 槽位 id 为 `slot-1` 到 `slot-8`。
- `SAVE_INDEX_KEY` 存储存档摘要索引。
- 单槽数据 key 为 `${SAVE_KEY}-${slotId}`。

存档体积控制：

- `loadGame()` 只读取当前存档结构，不迁移旧字段，也不补齐旧数据。
- `floorStates` 用于楼层回访和传送目标，但会压缩到最近的有限楼层，当前上限为 12 个楼层缓存，避免存档体积无限增长。
- 读取楼层缓存时会恢复保存的玩家位置和朝向；缓存缺失或地图尺寸不匹配时会重新生成楼层。

修改 `GameState` 时，需要同步检查 `startGame()` 初始化、保存/读取结构、测试 harness 归一化逻辑和相关测试。

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
- 新增属性时同步检查 `totals()`、装备评分、UI 文案、存档结构和测试。

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

## 11. 成长、任务与技能设计

本节记录当前成长、任务和技能系统的设计意图。这里的目标不是把所有数值写死，而是说明为什么这些规则存在，以及后续调参时应该守住哪些边界。

### 11.1 等级与经验节奏

成长曲线集中在 `src/game/progression.ts`，战斗胜利结算在 `src/game/combat/combatRuntime.ts` 调用这些函数。

核心规则：

- `xpForNextLevel(level)` 负责升级所需经验。
- 基础曲线为 `16 + level * 8`。
- 8 级以后追加二次压力：`floor((level - 8) ** 2 * 0.22)`。
- `recommendedLevelForFloor(floor)` 当前为 `floor + 12`，用于判断玩家是否明显超出当前楼层。
- `overlevelXpMultiplier(level, floor)` 对普通怪经验做等级压制衰减。
- 超出推荐等级后，每高 1 级经验约降低 `4.5%`。
- 普通怪经验最低保留 `35%`，避免回头清怪完全没有收益。
- Boss 经验不受等级压制，保证关键节点奖励稳定。

设计目标：

- 前期升级要频繁，让玩家快速看到职业差异、技能和属性点。
- 中期升级速度逐渐放缓，鼓励通过装备、符文、任务和技能来源成长。
- 后期不能因为全清普通怪而无限滚雪球，因此用经验衰减压住过度刷怪收益。
- 通关等级允许因探索程度产生差异：直奔主线低一些，中度探索适中，全清会更高，但不会无限拉开。

当前粗略预期：

- 快速推进：约 Lv.50 左右进入终局。
- 中等探索：约 Lv.65 到 Lv.75。
- 高度全清：可能到 Lv.80 以上，但会受到经验衰减和技能等级上限限制。

### 11.2 技能点、技能尘与技能升级

技能成长由三种资源共同限制：

- 技能点：主要来自升级和少量任务奖励。
- 技能尘：来自战斗掉落、任务奖励、装备分解等。
- 技能书/导师/任务：用于解锁职业新技能。

技能点规则：

- `skillPointGainForLevel(level)` 当前为偶数等级获得 1 点。
- 部分特殊任务可额外奖励 `rewardSkillPoints`。
- 不再每级都给技能点，避免后期把全部技能轻易升满。

技能升级规则：

- 技能升级入口在 `inventoryRuntime.ts`，实际数值由 `combatRuntime.ts` 的 `upgradedSkill()` 统一转换。
- 每升 1 级消耗 `1` 点技能点。
- 技能尘消耗等于下一级等级，例如升到 Lv.4 消耗 4 点技能尘。
- 当前技能等级上限为 `MAX_SKILL_LEVEL = 8`。
- 技能满级后 UI 显示“已满级”，不再继续消耗资源。

技能升级收益：

- 技能倍率每级约提升 `7.5%`。
- 技能基础伤害随等级小幅提高。
- 部分技能在 Lv.3 选择分支，分支通过 `skillBranches` 持久化。
- 分支可改变伤害、MP 消耗、冷却、元素、持续状态或穿透抗性。

设计边界：

- 技能升级应该让玩家感到投入有效，但不能让 4 个携带技能无限堆叠后碾压终局。
- 技能点是战略选择，不是最终全满的线性资源。
- 技能尘负责控制升级频率，避免只靠等级就把技能拉满。
- 技能上限保护后期平衡，也让多技能学习和换装搭配更有意义。

### 11.3 战斗技能携带限制

角色可以学会多个职业技能，但战斗中最多携带 `BATTLE_SKILL_LIMIT = 4` 个。

规则：

- 初始技能会自动学习并填入技能栏。
- 新学技能如果技能栏未满，会自动携带。
- 技能栏满时，学习仍可成功，但需要玩家手动卸下旧技能再携带新技能。
- 至少保留 1 个战斗技能，避免玩家误操作导致技能栏为空。
- 战斗中只能释放已携带技能。

设计目标：

- 学习更多技能提供配装和策略选择，而不是让所有技能同时进入战斗循环。
- 携带上限让职业有“流派构筑”：清怪、Boss、保命、持续伤害、元素克制可以选择不同组合。
- 后期技能来源变多后，玩家仍需要取舍。

### 11.4 技能学习来源

当前技能来源由多条路线组成，避免所有技能只靠升级自动获得。

1. 职业初始技能

- 定义在 `CLASSES[classId].skills`，带 `starter: true`。
- 新角色会自动学习初始技能。
- `ensureSkillState()` 负责维持当前运行中技能状态一致，例如初始技能、已学技能和携带技能栏。

2. 角色成长解锁

- 非初始技能带 `requires` 前置。
- 前置可以包含等级、楼层、攻击、法强、防御、抗性、速度、幸运、生命上限、法力上限和已学技能。
- `canLearnSkill()` 和 `skillRequirementText()` 统一判断并展示这些条件。

3. 技能卷轴

- 类型为 `kind: "skillScroll"`。
- 使用卷轴时会校验职业、技能是否已学、前置是否满足。
- 不满足条件或职业不匹配时不消耗卷轴。
- 满足条件后调用 `learnSkill()` 学会对应技能。

4. 商人低概率刷新

- 商人货架由 `ensureMerchantStock()` 生成。
- 第 4 层后有低概率刷新技能卷轴。
- 刷新概率受楼层和商人信任影响，但保持低概率，避免商店成为主要技能来源。
- 商店只会刷玩家未学、且不明显超前当前楼层的技能。

5. Boss 或房间守卫掉落

- Boss 掉落技能卷轴概率高，用作关键进度奖励。
- 房间守卫或封印守卫有较低概率掉落。
- 卷轴候选池来自当前职业未学技能，并受楼层前置限制。

6. 职业导师

- 楼层生成会在中后期有条件投放职业导师。
- 导师名称按职业变化，例如剑术导师、秘法导师、游侠导师。
- 导师弹窗优先展示当前可学技能。
- 导师教学直接调用 `learnSkill(skillId, "导师训练")`。

7. 特殊 NPC 与任务奖励

- 部分任务通过 `rewardSkillScroll` 发放技能卷轴。
- 部分任务通过 `rewardSkillPoints` 直接给技能点。
- 符文、巡夜人、幸存者等不同任务线可以绑定不同奖励倾向。

设计边界：

- 强力技能不能过早通过商店或随机掉落获得。
- 卷轴可以提前出现一点点，但使用时必须满足前置。
- 导师是稳定学习来源，但仍受前置限制。
- Boss 掉落负责制造惊喜和阶段推进，但不应让玩家跳过构筑过程。

### 11.5 职业技能池设计

每个职业当前拥有初始技能和后续可学技能，技能设计要保持职业身份。

剑士：

- 初始方向：重斩、格挡、战吼。
- 后续方向：盾击、钢铁意志、旋身斩、挑衅、处决、裂地斩。
- 设计关键词：攻击、防御、生命、格挡、削弱、稳定承伤。
- 终盘技能允许高伤害，但应依赖攻击和防御双成长，避免纯攻击一条线最优。

法师：

- 初始方向：火球术、寒冰箭、奥术护盾。
- 后续方向：雷光术、法力壁垒、奥术针、虚空脉冲、陨星术、星牢。
- 设计关键词：法强、法力、抗性、元素、护盾、持续状态。
- 法师可以有爆发窗口，但要受 MP、冷却和生存压力约束。

游侠：

- 初始方向：连射、闪避步、毒箭。
- 后续方向：瞄准射击、烟雾步、标记射击、锯齿箭、风暴箭、幻影连射。
- 设计关键词：速度、幸运、连击、追击、闪避、持续伤害。
- 速度提供先手、闪避、连击概率和追击概率，不直接增加普通攻击伤害。

技能设计注意：

- `atkMultiplier`、`magMultiplier`、`defMultiplier`、`hpMultiplier` 让技能与装备和属性搭配产生差异。
- `baseDamage` 适合保证低属性阶段技能手感，但不能过高。
- 终盘技能应有更高 MP 和冷却，且至少绑定一个前置技能或关键属性。
- 状态技能的持续伤害由 `statusDamageAmount()` 控制，不能无限随楼层放大。

### 11.6 任务设计与奖励结构

任务定义在 `src/game/quest/quests.ts`，运行时在 `src/game/quest/questRuntime.ts`。

任务通用字段：

- `id`：任务唯一标识。
- `giver`：来源，例如 `questNpc` 或 `shop`。
- `title`、`giverName`、`desc`：展示文案。
- `target`：目标数量。
- `rewardGold(floor)`：按楼层计算金币。
- `rewardKeys`、`rewardDoorKey`、`rewardPotion`：物品和钥匙奖励。
- `rewardSkillPoints`：技能点奖励。
- `rewardSkillDust`：技能尘奖励。
- `rewardSkillScroll`：技能卷轴奖励。
- `relation`：叙事关系阵营。

当前任务类型：

- `rescueRoom`：清理指定房间并救出被困者，偏探索和救援。
- `wardenErrand`：巡夜人委托，清理本层怪物，奖励钥匙。
- `lockedRoomKey`：钥匙保管人委托，奖励指定房间钥匙。
- `runeSurvey`：符文测绘任务，奖励技能点、技能尘和技能卷轴。
- `wardenSeal`：封印巡检任务，奖励钥匙和技能点。
- `survivorTrace`：幸存者暗记任务，奖励药水、技能点和技能卷轴。
- `merchantRoute`：商路清理任务，奖励补给和金币，并提升商人信任。

任务设计目标：

- 任务不只给金币，还应承担技能来源、钥匙来源、叙事关系和探索引导。
- 早期任务主要降低入门压力，例如钥匙、药水、金币。
- 中期任务开始提供技能尘、技能卷轴和技能点。
- 后期任务可以作为构筑补全手段，但不能替代 Boss、导师和探索奖励。

叙事关系：

- `state.narrative.relations` 记录长期关系。
- `state.narrative.factionLeanings` 记录阵营倾向。
- 任务奖励可提升对应阵营关系，例如巡夜人、商队、幸存者、符文回声。
- 部分房间事件和任务后续会读取这些关系，解锁不同选项或奖励。

### 11.7 后期平衡目标

后期平衡要同时考虑等级、装备、强化、符文、技能点和任务奖励。

当前调参目标：

- 普通怪：后期合理构筑下 1 到 3 回合解决，不拖节奏。
- 精英：后期合理构筑下 2 到 5 回合解决，会造成明显资源消耗。
- 最终 Boss：合理装备和满级携带技能下约 4 到 7 回合，不应被 2 回合稳定秒杀。
- 剑士应该最稳，法师输出高但更脆，游侠依赖速度、闪避和连击稳定性。

当前保护手段：

- 技能点不是每级获得。
- 技能等级上限为 8。
- 技能每级成长从高倍率压到中等倍率。
- 36 层后怪物有额外深层成长。
- Boss 不受经验衰减，但普通怪受等级压制，避免刷级滚雪球。
- 战斗技能携带上限强制玩家做技能取舍。

调参建议：

- 如果后期过难，优先小幅提高任务补给、药水、精英掉落或 Boss 弱点，而不是直接提高玩家技能倍率。
- 如果后期过简单，优先提高深层精英和 Boss 血量、攻击、技能压力，或收紧技能尘/技能点获取。
- 不建议移除技能等级上限，否则携带上限会退化成“把 4 个技能堆满”的线性最优。
- 不建议让 `spd` 直接增加普通攻击伤害，否则游侠会同时拥有先手、闪避、连击和直接增伤，后期很容易失控。

## 12. 渲染与 UI

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

## 13. 音频系统

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

## 14. 测试范围

测试入口：

- `tests/map-generation.test.js`：地图生成、楼梯、房间、可达性。
- `tests/equipment-ui.test.js`：装备、背包、纸娃娃、文案和 UI 行为。
- `tests/gameplay-behavior.test.js`：移动、战斗、任务、楼层推进、存档行为。
- `tests/balance-regression.test.js`：职业成长、装备品质、代表性战斗和后期平衡回归。
- `tests/harness/runtimeHarness.ts`：把运行时和静态配置暴露给 Node 测试。

建议验证：

- 文档或注释修改：`npm run build`。
- 地图、背包、战斗、存档或导出运行时修改：`npm test`。
- CI 或覆盖率相关修改：`npm run test:coverage`。
- 大范围跨模块修改：`npm run build`、`npm test`、`npm run test:coverage`。

## 15. 常见修改索引

| 目标 | 优先查看 |
| --- | --- |
| 新增职业 | `src/game/constants/classes.ts`、`starterEquipment()`、`starterInventory()`、`assetForClass()`、`ASSETS` |
| 修改职业技能 | `CLASSES.skills`、`castSkill()`、`upgradedSkill()`、`renderSkills()`、`renderBattleCommandPanel()` |
| 修改技能学习来源 | `learnSkill()`、`skillScrollItem()`、`maybeDropSkillScroll()`、`openSkillTrainer()`、`merchantSkillScrollItem()`、`QUEST_DEFS` |
| 修改技能携带上限/升级上限 | `BATTLE_SKILL_LIMIT`、`MAX_SKILL_LEVEL`、`toggleBattleSkill()`、`canUpgradeSkill()`、`renderSkills()` |
| 修改等级/经验曲线 | `src/game/progression.ts`、`levelUp()`、`enemyXpReward()`、`xpForNextLevel()` |
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
| 修改任务 | `QUEST_DEFS`、`placeQuestNpc()`、`placeRescueQuest()`、`recordQuestKill()`、`claimQuestReward()` |
| 修改商人/合成台 | `openMerchant()`、`openMerchantShop()`、`buy()`、`openForge()`、`renderCraft()` |
| 修改传送信标 | `teleportBeacon()`、`knownTeleportTargets()`、`teleportToTarget()` |
| 修改存档 | `src/game/save/`、`startGame()`、`loadGame()`、测试 harness |
| 修改 UI | `index.html`、`src/game/render/renderRuntime.ts`、`src/styles.css` |
| 修改弹窗 | `src/game/render/modalRuntime.ts`、`.modal` 样式 |
| 修改音频 | `src/game/audio/audioProfiles.ts`、`audioRuntime.ts`、`audioEngine.ts` |
| 修改随机性 | `src/game/random.ts` 和对应领域测试 |

## 16. 已知保留项

- License 暂未处理。
- `renderRuntime.ts` 仍承担较多 UI 拼装职责，后续可按地图、战斗、侧栏继续拆分。
- 仍有部分 `innerHTML` 拼接，新增可变文本时必须先转义；后续可逐步改成更多 DOM API。
- 项目已完成 `src/game` 类型化清理，但可以继续收紧外部测试 harness 和浏览器全局 API 类型。

## 17. 参考报告调整对照

基于 `deep-research-report (1).md` 的优先改进表，当前代码侧对照如下：

| 调整项 | 是否调整 | 当前落点 |
| --- | --- | --- |
| 首局 10 分钟分步目标链：移动、开箱、战斗、装备、接任务 | 已调整 | `src/game/tutorial/tutorial.ts` 定义目标链；`runtime.ts` 初始化；移动、宝箱、战斗胜利、装备和接任务节点会推进教程；`renderRuntime.ts` 在上下文区渲染教程卡片。 |
| 任务与房间事件模板扩展，增加 6 到 10 个分支事件 | 已调整 | `src/game/events/roomEvents.ts` 定义 6 个房间事件；`floorRuntime.ts` 投放事件；`interactionRuntime.ts` 弹出事件选择并结算奖励/风险；测试覆盖事件池数量与结算。 |
| 66 层纵深需要更多主题敌人与局部机制 | 已调整 | `floorRuntime.ts` 已按主题提供多段敌人池、主题元素弱点和敌人技能；中后期敌人原型随楼层主题变化。后续仍可继续补小首领和专属房间机制。 |
| 叙事需要持续关系与分支后果 | 已调整 | 新增 `state.narrative` 记录关系、旗标和事件选择；房间事件选项会改变巡夜人、商队、被困者和符文回声关系；任务弹窗展示关系状态，任务奖励会受相关关系影响并继续推进关系。 |
| 强化战斗反馈：命中冲击、敌我状态、Buff/Debuff 时间线、关键音效层次 | 已调整 | `combatRuntime.ts` 写入 battle FX 与敌方锁定阶段；`renderRuntime.ts` 展示战斗回合横幅、状态标签和飘字；`styles.css` 提供命中震动、元素 FX 和回合状态样式。 |
| `render()` 直接保存改为脏标记 + 1 到 2 秒防抖保存 | 已调整 | `runtime.ts` 提供 `markAutosaveDirty()`，`renderRuntime.ts` 在完整渲染后标脏并防抖调用 `saveGame(false)`；楼层缓存保存前压缩到 12 层。 |
| 跨局元进度、图鉴、永久 relic、职业挑战和主题 modifier | 未调整 | 当前仍以单局成长和多存档为主，尚未加入跨局永久进度。 |
