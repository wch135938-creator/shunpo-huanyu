# Phase10-Step12A 主玩法闭环 GPT 规划交接

更新时间：2026-07-04  
项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
语言：TypeScript  
工程路径：`D:\My Project\TestGame`

## 一、交接目的

后续协作方式调整为：

```text
GPT：负责架构判断、拆分计划、风险控制、验收结论
Claude Code：只执行已经确认的、小范围、低歧义代码修改
用户：运行 Cocos Creator Preview，提供日志和截图，决定是否进入下一步
```

本文记录当前稳定基线、只读审查结论和待 GPT 决策的问题。

当前尚未进入 Phase10-Step12A 代码实现阶段。不要把本文中的“建议方案”视为已经批准的实现指令。

## 二、当前 Git 状态

只读审查开始时确认：

```text
branch: master
HEAD: a0de255 fix: localize equipment summary labels
remote: origin/master
worktree: clean
```

最近五个提交：

```text
a0de255 fix: localize equipment summary labels
ba31d11 fix: repair legacy missing qingfeng sword save
f2b7282 fix: wait for equipment config before preview
ad8d9f9 fix: stop sending redeem receipt mail
929fb47 fix: persist preview save data
```

本次审查没有修改任何代码、场景或 Prefab。新增的只有本交接文档。

未经用户运行确认，不允许推送 GitHub。

## 三、已通过人工验收的稳定基线

以下功能已经完成并通过人工验收，不要重新实现、回退或借 Step12A 名义重构：

- 初始青锋剑、布衣、铜戒正常发放。
- 装备主面板、背包、详情、升级、强化正常。
- 邮箱附件、兑换码、每日登录奖励跨 Preview 幂等，不能重复领取。
- 兑换码直接到账并显示奖励明细弹窗，不再生成邮件。
- 控制台无红字，Step12F 日志链正常。
- `Phase10Main.scene` 373 个对象、无重复 UUID。
- Creator 缓存与源码结构一致。

本轮重新做了静态检查：

```text
Phase10Main.scene objects: 373
non-empty _id: 363
duplicate _id groups: 0
```

本轮没有重新运行 Preview，因此运行时稳定性仍以用户已经通过的人工验收为准。

## 四、强制文档与优先级

本轮已经完整读取以下文档。后续 GPT 规划和 Claude Code 执行仍必须遵守：

1. `docs/00-project-vision.md`
2. `docs/瞬破寰宇 Step12 AI工程SOP启动系统.md`
3. `docs/AI-OS-v1-Step12.md`
4. `docs/ai-rules/Phase10-UI-Screenshot-Acceptance.md`
5. `docs/01-core-gameplay.md`
6. `docs/10-tech-architecture.md`
7. `docs/15-development-rules.md`
8. `docs/16-mvp-development-roadmap.md`
9. `docs/Phase10-Step12-Development-Pipeline-V2.md`

核心目标：

```text
战斗 → 奖励 → 成长 → 战力刷新 → 更高挑战
```

## 五、不可突破的边界

- 主验证场景只能使用 `assets/scenes/Phase10Main.scene`。
- 禁止恢复或使用 `Phase8Main.scene`、`Phase10Main-Clean.scene`。
- 禁止修改：
  - UIEngine
  - UILayoutEngine
  - UIRenderSync
  - UIDiffEngine
  - UIRenderVM
  - Frame-0 Flush
  - Phase10MainBootstrap
- 未经用户确认的计划，不修改 Scene 或 Prefab 结构。
- 不新建第二套奖励、资产、成长、存档或活动真相源。
- 奖励必须走 `RewardSystem → InventoryService → SaveV2`。
- 复用现有 Battle、Chapter、Dungeon、Reward、Inventory、Hero、Formation、Equipment、Save、Result UI。
- 不做大型重构，不修改已有 public 方法签名。
- 所有新增数值、ID、路径优先走配置，禁止散落硬编码。
- 保留 Step12F 稳定状态；`START` 或 `START_FALLBACK` 均可接受。
- 单功能提交；用户 Preview 确认前不推送。

## 六、Phase10-Step12A 目标

目标闭环：

```text
关卡或副本入口
→ BattleManager 启动真实战斗
→ 战斗结果
→ RewardSystem 统一结算
→ Inventory / Hero / Equipment 成长
→ Power 刷新
→ Chapter 或 Dungeon 进度推进
→ SaveV2 持久化
→ Result UI 可见反馈
```

当前推荐先实现一个可玩的最短闭环，不一次接通全部章节和地牢内容。

## 七、现有真实调用链审查

### 7.1 启动链

当前 Phase10 启动链：

```text
Phase10MainBootstrap
→ SaveManager
→ Phase9Bootstrap.initialize()
→ HeroSystem
→ SkillSystem
→ FormationSystem
→ ChapterSystem
→ BattleManager
→ Phase9Bootstrap.restoreFromSave()
→ InventoryService
→ EquipmentService
→ Equipment UI
```

`Phase10MainBootstrap` 只完成现有系统初始化，没有 Main Gameplay Coordinator、玩法入口或 ResultPanel 路由。

### 7.2 Battle

核心文件：

```text
assets/scripts/managers/BattleManager.ts
assets/scripts/battle/BattleSystem.ts
assets/scripts/battle/BattleResult.ts
assets/scripts/battle/BattleUnitFactory.ts
```

当前链路：

```text
FormationSystem.generateTeamSnapshot('pve')
→ BattleManager.setPlayerFormation(snapshot, slots)
→ BattleManager.startStageBattle(stageId)
→ BattleSystem.initBattle()
→ BattleSystem.startBattle()
→ BattleManager.updateBattle(deltaMs)
→ BattleSystem.BATTLE_ENDED
→ BattleManager.STAGE_BATTLE_FINISHED
```

已确认问题：

1. 正式 Phase10 运行环境没有组件逐帧调用 `BattleManager.updateBattle()`。
2. 只有调试和验证脚本主动推进战斗。
3. BattleManager 在收到战斗结束后，当前会直接调用 InventoryService 发金币、材料和装备。
4. 经验只统计到 `BattleResult.expGain`，没有进入 HeroSystem。
5. `BattleResult.powerGain` 当前固定为 0。

### 7.3 Reward

核心文件：

```text
assets/scripts/reward/RewardSettlement.ts
assets/scripts/reward/RewardSystem.ts
assets/scripts/reward/RewardRepository.ts
```

现有规范链路：

```text
RewardSettlement
→ RewardSystem.grantRewardWithTransaction()
→ RewardSystem.REWARD_GRANTED
→ InventoryService
```

已确认问题：

1. `RewardSettlement.settleBattleReward()` 尚未接到 BattleManager 的结束事件。
2. BattleManager 已直接发资产；如果再接 RewardSettlement，会双发。
3. 当前战斗事务 ID 使用 `Date.now()` 和随机数生成，重复处理同一战斗时无法复用同一事务 ID。
4. RewardSystem 会先写奖励历史并发事件，但不会读取 Inventory 的执行结果。

### 7.4 Inventory

核心文件：

```text
assets/scripts/inventory/InventoryService.ts
assets/scripts/inventory/InventoryTransaction.ts
assets/scripts/inventory/InventorySaveData.ts
assets/scripts/inventory/InventoryDomain.ts
```

优点：

- `InventoryTransaction` 已支持基于 transactionId 的幂等。
- 已处理事务会写入 `inventoryData.claimStates`。
- 同一 transactionId 重复调用会返回 `isDuplicate=true`，不会重复增加资产。
- 资产修改后会标记 SaveManager dirty。

已确认问题：

1. InventoryService 当前会把 RewardSystem 的所有 rawRewards 都转成资产。
2. `exp` 会被当成背包物品，而目标闭环要求它进入 HeroSystem。
3. Battle 掉落使用 `ITEM_EQUIP_N_001` 等品质型 ID；Inventory 装备使用 `ITEM_EQ_WEAPON_001` 等实例型 ID，必须复用现有映射。

### 7.5 Hero、Formation 与 Power

新战斗链使用：

```text
HeroSystem
→ HeroSnapshotBuilder
→ TeamSnapshotBuilder
→ FormationSystem
→ BattleUnitFactory
```

现有能力：

- `HeroSystem.addHeroExp()` 支持经验和连续升级。
- `FormationSystem.generateTeamSnapshot('pve')` 可生成战斗快照。
- `FormationSystem.recalculatePower()` / `recalculateAllPower()` 可刷新阵容战力。

已确认问题：

1. Battle 奖励经验没有调用 HeroSystem。
2. 新 V8 默认存档的 `heroes.heroStates` 为空，HeroSystem 创建的默认状态全部是 `unlocked=false`。
3. 没有已解锁英雄时，默认 PVE 阵容为空，BattleManager 无法开战。
4. 项目另有旧链 `ProgressSystem → PowerSystem`，主要被 DungeonLoopController 使用。
5. Step12A 不应把旧 Progress 数据和新 Hero/Formation 数据混成一个真相源。

### 7.6 Chapter

核心文件：

```text
assets/scripts/chapter/ChapterSystem.ts
assets/scripts/chapter/ChapterRepository.ts
assets/scripts/chapter/ChapterTypes.ts
assets/resources/config/chapters/chapter_data.json
```

现有能力：

- 首章节默认解锁。
- `completeStage(stageId)` 已具备重复完成保护。
- 可推进 `currentStageId` 并解锁下一关。
- 可通过 `Phase9Bootstrap.saveAll()` 写入 SaveV8。

关键断点：

```text
Chapter 首关 ID：chapter_001_stage_01
Battle 首关 ID：STAGE_001
```

两套配置的关卡数量也不一致：Chapter 每章目前 6 关，Battle `stage_data` 每章目前 5 关。

禁止根据字符串或序号自动猜测所有映射。第一轮只能显式配置一个已确认的首关桥接，后续映射需单独规划。

### 7.7 Dungeon

核心文件：

```text
assets/scripts/systems/DungeonLoopController.ts
assets/scripts/systems/DungeonGameplay.ts
assets/scripts/systems/DropSystem.ts
assets/scripts/ui/DungeonPanel.ts
assets/scripts/ui/DungeonNodeMapPanel.ts
```

当前 DungeonNode 链路：

```text
DungeonPanel
→ RoguelikeSystem.enterNode()
→ DungeonLoopController.simulateBattle()
→ DropSystem.settleBatch()
→ ProgressSystem
→ Dungeon Result UI
```

不适合作为首个 Step12A 规范闭环的原因：

- 明确使用轻量模拟战斗，不调用 BattleManager。
- 使用旧 ProgressSystem，而不是 HeroSystem。
- DropSystem 与 RewardSystem 职责重叠。
- 金币和道具存在只统计、不统一写 Inventory 的路径。
- 直接修 Dungeon 会同时触碰更多历史系统。

建议首轮不改 Dungeon，等 Chapter 首关闭环通过后再做 DungeonNodeMap 集成。

### 7.8 SaveV2

核心文件：

```text
assets/scripts/save/SaveManager.ts
assets/scripts/save/SaveContainerV8.ts
assets/scripts/systems/Phase9Bootstrap.ts
```

现有字段足够，不需要升级 Save Version：

```text
inventoryData.claimStates
inventoryData.transactions
inventoryData.stackItems
inventoryData.instanceItems
rewardData.recentRewards
saveMetaV2.lastRewardTransactionId
heroes.heroStates
formations.presets
chapters.chapterProgress
chapters.currentChapterId
equipmentData
```

注意：

- Inventory/Reward 修改的是 SaveContainer 内存引用。
- Hero/Formation/Chapter 运行时数据必须先通过 `Phase9Bootstrap.saveAll()` 同步回 SaveManager。
- 最后必须调用一次 `SaveManager.save()` 完整落盘。
- 当前没有跨 Inventory、Hero、Chapter 的真正事务回滚能力。

### 7.9 Result UI 与场景

现有资源：

```text
assets/scripts/ui/ResultPanel.ts
assets/prefabs/panels/ResultPanel.prefab
assets/prefabs/items/RewardItem.prefab
```

当前 Phase10Main 场景只有：

```text
Equipment UI
OperationsMenu
Mail/Redeem/Login UI
Phase10MainBootstrap
```

不存在：

```text
DungeonPanel
DungeonNodeMapPanel
ResultPanel
Chapter entry
Battle entry
MainGameplayCoordinator
```

ResultPanel Prefab 的脚本组件目前没有序列化完整字段引用。Phase8 是由 `Phase8SceneBuilder` 在运行时绑定节点和 RewardItem Prefab。

因此不能简单把 ResultPanel Prefab 拖入 Phase10Main 后就假设可用。需要 GPT 在以下两个方案中选择最小且稳定的一个：

1. ResultPanel 增加自绑定方法，由 Coordinator 在实例化、加入场景前完成绑定。
2. 在 Creator 中修正 Prefab 的 Inspector 引用，再把实例加入 Phase10Main。

方案 1 改动更集中，方案 2 更符合编辑器原生工作流但更容易触碰 Prefab/UUID 稳定基线。

## 八、推荐的第一个可玩闭环

推荐选择 Chapter 首关，而不是 Dungeon：

```text
挑战首关按钮
→ chapter_001_stage_01 显式映射 STAGE_001
→ 生成 PVE TeamSnapshot
→ BattleManager.startStageBattle('STAGE_001')
→ Coordinator.update(dt) 推进真实战斗
→ STAGE_BATTLE_FINISHED
→ RewardSettlement / RewardSystem 单次结算
→ InventoryService 幂等入库
→ HeroSystem 增加经验
→ FormationSystem 刷新战力
→ ChapterSystem.completeStage('chapter_001_stage_01')
→ Phase9Bootstrap.saveAll()
→ SaveManager.save()
→ ResultPanel 展示胜负、奖励和成长
```

第一轮只保证一个首关闭环。首关完成后，如果第二关没有显式 battleStageId，入口应禁用并提示“后续关卡尚未接入”，不能自动猜测。

## 九、建议事务策略

建议每次点击挑战时生成一次 attemptId，并在整场战斗中保持不变：

```text
transactionId = txn_battle_<battleStageId>_<attemptId>
```

规则：

1. 同一战斗的重复结束事件必须使用同一个 transactionId。
2. 新一次合法重打生成新的 attemptId，可以再次获得普通奖励。
3. 不使用 `RewardSystem.markClaimed('battle', stageId)`，因为普通战斗可重复挑战。
4. 结算前先检查 `InventoryService.isTransactionClaimed(transactionId)`。
5. Coordinator 再维护 `idle/running/settling/settled` 内存状态，阻止同帧重入。
6. Inventory claimState 是持久化防重真相源。
7. ChapterSystem.completeStage 只负责首次进度推进，不负责判断普通战斗奖励是否可重复获得。

已知风险：如果 Inventory 已成功写入内存，但随后 Hero 或 Chapter 发生异常，当前架构没有跨模块自动回滚。实现前应完成全部前置校验，结算阶段保持同步、小范围、无异步插入，最后一次完整落盘。

## 十、待 GPT 决策的问题

GPT 在下发 Claude Code 指令前，需要明确回答：

1. Chapter 与 Battle 首关映射放在哪里？
   - 建议：`ChapterTypes.StageConfig` 增加可选 `battleStageId`，只为首关配置 `STAGE_001`。
   - 不建议：依赖 ID 大小写和序号自动推算。

2. 新存档没有已解锁英雄时如何保证可玩？
   - 建议：在现有 `GLOBAL_PLAYER` 配置增加 `initialHeroId`，仅在没有任何已解锁英雄时调用现有 HeroSystem 解锁，再调用 FormationSystem 回填阵容。
   - 需要确认这是否纳入 Step12A，或拆成前置小任务。

3. 战斗经验如何分配？
   - 可选：当前 PVE 阵容均分、全员获得完整经验、只给主位英雄。
   - 项目文档目前没有明确规则。
   - 旧 DungeonLoopController 采用均分，但它属于旧 Progress 链，不能自动视为最终规则。

4. Power 验收标准是什么？
   - 建议：必须执行战力重算并显示 before/after。
   - 若经验未跨级，允许 delta=0，但必须显示经验增长。
   - 若发生升级，powerAfter 必须大于 powerBefore。

5. BattleManager 是否彻底停止直接写 Inventory？
   - 建议：是。BattleManager 只生成 BattleResult，唯一资产变更通过 RewardSystem 事件进入 InventoryService。

6. `exp` 是否应从 Inventory reward listener 中排除？
   - 建议：是。经验交给 HeroSystem；RewardSystem 仍保留完整奖励摘要供历史和 UI 使用。

7. ResultPanel 如何绑定？
   - 建议优先自绑定 + Coordinator 动态实例化，减少直接编辑现有 Prefab。
   - Scene 仍需增加一个挑战按钮和 Coordinator 组件，必须先经用户确认。

8. Runtime Validator 是否与首个功能提交一起实现？
   - Pipeline V2 最终要求 `Phase10Step12RuntimeValidator`。
   - 为降低首轮复杂度，可先实现被动断言和日志，不让 Validator 自己发奖励或建立第二条测试链。

## 十一、建议的最小文件范围

以下只是供 GPT 审核的候选范围，尚未获得用户代码修改确认。

### 预计新增

```text
assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts
assets/scripts/validation/Phase10Step12RuntimeValidator.ts
```

### 预计修改

```text
assets/scripts/managers/BattleManager.ts
assets/scripts/reward/RewardSettlement.ts
assets/scripts/inventory/InventoryService.ts
assets/scripts/chapter/ChapterTypes.ts
assets/resources/config/chapters/chapter_data.json
assets/scripts/config/global_config.ts                  # 若纳入初始英雄
assets/resources/config/systems/global_const.json       # 若纳入初始英雄
assets/scripts/data/phase8_ui_types.ts
assets/scripts/ui/ResultPanel.ts
assets/scenes/Phase10Main.scene                         # 必须用户先确认
```

### 明确不修改

```text
assets/scripts/bootstrap/Phase10MainBootstrap.ts
assets/scripts/ui/UIEngine.ts
UILayoutEngine / UIRenderSync / UIDiffEngine / UIRenderVM
Frame-0 Flush 相关文件
assets/scenes/Phase8Main.scene
assets/scenes/Phase10Main-Clean.scene
现有 Equipment UI 结构
现有 Operations 奖励幂等逻辑
SaveContainer 版本号
```

## 十二、建议给 Claude Code 的执行方式

不要一次把全部文件交给 Claude Code。建议 GPT 拆成以下小步骤，每步完成后先做静态检查，再决定是否继续：

### 步骤 A：奖励所有权收口

只改：

```text
BattleManager.ts
RewardSettlement.ts
InventoryService.ts
```

目标：

- BattleManager 不再直接发资产。
- RewardSettlement 接受稳定 transactionId 并先查重。
- InventoryService 不把 exp 当背包物品。
- 不接 Scene，不做 UI。

完成后先做 TypeScript/静态测试和现有奖励幂等回归。

### 步骤 B：首关配置与 Coordinator 逻辑

只改：

```text
ChapterTypes.ts
chapter_data.json
Phase10MainGameplayCoordinator.ts
必要时 global_config.ts / global_const.json
```

目标：

- 只接首关。
- 准备阵容并驱动 BattleManager。
- 胜利后执行 Reward、Hero、Power、Chapter、Save。
- 暂时提供可调用入口或调试调用，不改 Scene。

完成后先验证日志链和重复事务。

### 步骤 C：Result UI 与最小 Scene 入口

只改：

```text
phase8_ui_types.ts
ResultPanel.ts
Phase10Main.scene
```

目标：

- OperationsMenu 增加一个挑战按钮。
- ResultPanel 可见展示。
- 不调整 Equipment UI。
- Scene 修改后立即检查对象数量、重复 UUID、Missing Script。

完成后必须由用户运行 Preview 和截图验收。

### 步骤 D：Validator 与报告

只在真实闭环人工通过后添加：

```text
Phase10Step12RuntimeValidator.ts
docs/Phase10-Step12-Main-Gameplay-Loop-Implementation-Report.md
```

Validator 只验证正式链路，禁止自己模拟另一套奖励或进度。

## 十三、人工验收清单

### Step12F 稳定性

- 只运行 `assets/scenes/Phase10Main.scene`。
- 出现 `START` 或 `START_FALLBACK`。
- 出现：
  - `[SOP-UI-01] PREFAB_INIT`
  - `[SOP-UI-03] LAYOUT_COMPUTE`
  - `[SOP-UI-05] FRAME_0_FORCE_FLUSH`
  - `[SOP-UI-03] RENDER_FLUSH`
- 无红字。
- 无重复 UUID。
- 无 `Maximum call stack size exceeded`。
- `UIRoot` 黄字残留仍可接受，但需记录。

### 主闭环

- 挑战按钮可见且可点击。
- 战斗中按钮禁用，不能同时开两场。
- Formation snapshot 非空。
- BattleManager 启动真实战斗并正常结束。
- 失败时不发奖励、不推进章节。
- 胜利时 RewardSystem 只结算一次。
- Inventory 增量与 Result UI 一致。
- 同一 transactionId 重放时 `isDuplicate=true`，资产、经验、章节均不再变化。
- 新一次挑战使用新 transactionId，可获得正常重复奖励。
- 英雄经验变化正确。
- 执行战力刷新；发生升级时战力必须上升。
- 首关只完成一次，下一关正常解锁。
- `Phase9Bootstrap.saveAll()` 和 `SaveManager.save()` 成功。
- 重新 Preview 后资产、英雄和章节进度仍存在。
- 若掉落装备，EquipmentBagPanel 中可见。

### 稳定基线回归

- 青锋剑、布衣、铜戒仍正常。
- 装备、卸下、升级、强化、分解仍正常。
- 邮件、兑换码、登录奖励仍跨 Preview 幂等。
- 兑换码仍直接到账，不生成邮件。
- 首帧及交互后截图继续满足 Phase10 UI 截图验收文档。

## 十四、当前结论

项目不是缺少单独系统，而是缺少唯一、稳定、可见的协调链。

当前最小正确方向是：

```text
先接通一个 Chapter 首关
先收口 Battle 奖励所有权
先证明事务只结算一次
先证明 Hero/Power/Chapter/Save/Result UI 全部连通
再扩展 DungeonNodeMap 和后续关卡
```

不要先重构 DropSystem、Dungeon、SaveManager 或 UIEngine，也不要一次性把所有旧链统一。
