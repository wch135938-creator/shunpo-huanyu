# Phase10-Step12A-B 首关配置与 Coordinator 主闭环 — 修复报告

**日期**：2026-07-04  
**分支**：master (Step12A-A 未提交 + 本轮新增)  
**修改范围**：5 个修改 + 1 个新增文件  
**引擎**：Cocos Creator 3.8.8  
**语言**：TypeScript  

---

## 一、修改文件清单

| 文件 | 类型 | 行数 | 说明 |
|---|---|---|---|
| `assets/scripts/chapter/ChapterTypes.ts` | 修改 | +7 | `StageConfig` 新增 `battleStageId?: string` |
| `assets/resources/config/chapters/chapter_data.json` | 修改 | +1 | 首关 `chapter_001_stage_01` 新增 `battleStageId: "STAGE_001"` |
| `assets/scripts/config/global_config.ts` | 修改 | +6 | `GlobalPlayerEntry` 新增 `initialHeroId: string` |
| `assets/resources/config/systems/global_const.json` | 修改 | +1 | `GLOBAL_PLAYER` 新增 `initialHeroId: "hero_001"` |
| `assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts` | **新建** | 708 | 完整 Coordinator 状态机实现 |
| **Scene / Prefab / UIEngine / Dungeon 等** | **零修改** | 0 | — |

---

## 二、十大任务逐一核对

### ✅ 任务一：首关 battleStageId 配置

- `ChapterTypes.StageConfig` 新增可选字段 `battleStageId?: string`，带 JSDoc，**旧配置完全兼容**
- 仅在 `chapter_data.json` 的 `chapter_001_stage_01` 上新增 `"battleStageId": "STAGE_001"`
- 验证：全文搜索 `battleStageId` 在 `chapter_data.json` 中出现 **1 次**，仅首关
- Coordinator 在 `_getFirstChapterStageConfig()` 读取后，若 `!stageConfig.battleStageId` 则返回 `ERR_NO_BATTLE_MAPPING`，拒绝启动，**不自动推算**

### ✅ 任务二：初始英雄 fallback

- `global_config.ts` `GlobalPlayerEntry` 新增 `initialHeroId: string`
- `global_const.json` `GLOBAL_PLAYER` 新增 `"initialHeroId": "hero_001"`（剑无极 — `hero_data.json` 中真实存在的 heroId）
- Coordinator `_ensurePlayableFormation()` 逻辑：
  1. 先检查 `HeroSystem.getUnlockedHeroes()` → 有英雄则直接 `FormationSystem.refillEmptyPresets()` 回填
  2. 无英雄 → 从 `global_const` 读取 `initialHeroId` → 调用 `HeroSystem.unlockHero(initialHeroId)` → `FormationSystem.refillEmptyPresets()` 回填
  3. 最终通过 `_verifyFormationNonEmpty()` 确认 PVE 阵容至少有一个非空槽位
- 使用 `HeroSystem.unlockHero()` 公开 API，**不直接改 Save 数据结构**
- 使用 `FormationSystem.refillEmptyPresets()` 公开 API，**不手写第二套阵容真相源**

### ✅ 任务三：Coordinator 新建

- 文件：[Phase10MainGameplayCoordinator.ts](assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts)，708 行
- 类型：`@ccclass('Phase10MainGameplayCoordinator')` 继承 `Component`，预留挂到 Scene 节点
- **状态机**：

```
idle → running → settling → settled
  ↓                ↓
failed ←───────────┘
```

| 状态 | 含义 | 操作限制 |
|---|---|---|
| `idle` | 就绪 | 可调用 challengeFirstStage |
| `running` | 战斗中 | 禁止重复启动，update 推进 |
| `settling` | 结算中 | 禁止重复结算 / 重复启动 |
| `settled` | 结算完成 | 可再次 challenge（新 attemptId） |
| `failed` | 失败 | 可再次 challenge（新 attemptId） |

- `challengeFirstStage()` 防重入：非 idle/settled/failed 时返回 `ERR_BUSY`
- 每次 challenge 生成新 `attemptId` 和新 `transactionId`

### ✅ 任务四：战斗启动

- 公开方法：`challengeFirstStage(): ChallengeResult`
- 完整流程：
  1. 状态校验（busy 检查）
  2. `_getFirstChapterStageConfig()` 读取首关配置
  3. 验证 `battleStageId` 存在 → 拒绝无映射关卡
  4. `_ensurePlayableFormation()` → 初始英雄 fallback
  5. `FormationSystem.generateTeamSnapshot('pve')` 生成快照
  6. `BattleManager.setPlayerFormation(snapshot, slots)` 注入阵容
  7. 记录 `powerBefore`、`expBefore`
  8. 生成 `transactionId = txn_battle_${battleStageId}_${attemptId}`
  9. `BattleManager.startStageBattle('STAGE_001')` 启动
  10. 状态 → `running`
- 前置条件失败返回结构化 `ChallengeResult { success, state, errorCode, message }`，`console.warn`，不崩溃

### ✅ 任务五：update 推进

```typescript
update(deltaTime: number): void {
  if (this._state !== 'running') return;
  this._battleManager.updateBattle(deltaTime * 1000);
}
```

- 仅 `running` 状态下推进
- Cocos `update` deltaTime 为秒，BattleManager 期望毫秒 → `× 1000`
- 无 `setInterval` / `setTimeout` / 异步模拟 / 第二套 battle loop
- update 内无每帧日志（不刷屏）

### ✅ 任务六：战斗结束监听

- `onLoad()` → `_registerBattleEndedListener()` 订阅 `BattleManagerEvent.STAGE_BATTLE_FINISHED`
- `onDestroy()` → `_unregisterBattleEndedListener()` 取消订阅
- 收到事件时三层校验：
  1. `result.stageId !== this._currentBattleStageId` → 忽略（日志记录）
  2. `this._state !== 'running'` → 忽略重复事件
  3. 通过后 → `state = settling`

**胜利流程**：
1. `RewardSettlement.settleBattleReward(result, { transactionId })`
2. 若 `isDuplicate` → 不加经验、不推进章节、记录 duplicate lastResult
3. 提取 `result.expGain` → `_distributeExpToFormation()` 均分给 PVE 上阵英雄
4. `FormationSystem.recalculateAllPower()` 刷新战力
5. `ChapterSystem.completeStage('chapter_001_stage_01')`（自带重复完成保护）
6. `Phase9Bootstrap.saveAll()` + `SaveManager.save()` 完整落盘
7. 构建 `_lastResult` → `state = settled`

**失败/非胜利**：不结算、不发奖、不推进章节

### ✅ 任务七：lastResult

- 接口 `GameplayLastResult` 定义在 Coordinator 文件中，字段完整：
  `success, isDuplicate, chapterStageId, battleStageId, transactionId, goldGain, expGain, rewardSummary, powerBefore, powerAfter, expBefore, expAfter, chapterCompleted, nextStageUnlocked, message`
- 通过 `getLastResult()` 公开查询，供 Step12A-C UI 消费
- 不接 ResultPanel，不改 `phase8_ui_types.ts`

### ✅ 任务八：日志

| 前缀 | 使用位置 |
|---|---|
| `[Step12A-B][Coordinator]` | challenge 启动/成功/失败、阵容非空、txn、战斗结束、settlement 结果、exp 分配、power、chapter complete、saveAll |
| `[Step12A-B][ChapterConfig]` | battleStageId 映射读取 |
| `[Step12A-B][InitialHero]` | 初始英雄解锁 |

update 内无日志，关键节点全部覆盖，不刷屏。

### ✅ 任务九：安全边界

**本轮绝对没改**：
- `assets/scenes/Phase10Main.scene` → `git diff` 零输出
- 无 Prefab 修改
- 无 DungeonPanel / DungeonNodeMapPanel
- 无 DropSystem / ProgressSystem
- 无邮件 / 兑换码 / 登录奖励
- 无 UIEngine / UILayoutEngine / UIRenderSync
- 无 mock 奖励 / mock 战斗 / mock 存档
- BattleManager 事件名未改
- 全文搜索 Coordinator 中无 `DungeonLoopController|DropSystem|ProgressSystem` ✅

### ✅ 任务十：验证

- **TypeScript 静态检查**：`tsc --noEmit` 对修改文件零新增错误
- **全文搜索**：
  - `battleStageId` 在 chapter_data.json 中仅 1 处 ✅
  - `InventoryService` 在 BattleManager.ts 中仅注释中 ✅
  - Coordinator 不引用 DungeonLoopController/DropSystem/ProgressSystem ✅
  - Scene/Prefab/UIEngine 零 diff ✅

---

## 三、架构设计说明

### transactionId 生成规则

```
txn_battle_{battleStageId}_{attemptId}
例: txn_battle_STAGE_001_attempt_1717000000000_a3f2
```

- 同一场战斗从 start → ended 复用同一个 transactionId
- 同一结束事件重复触发 → 状态机拦截 + InventoryService 幂等拦截，不重复发资产/经验/章节
- 新一次合法重打 → 新 `attemptId` → 新 `transactionId` → 可获得正常重复奖励

### exp 分配规则

- 总 exp = `BattleResult.expGain`
- 只分给当前 PVE 阵容上阵英雄（`FormationSlot.heroId !== null`）
- **均分**：`perHero = floor(totalExp / heroCount)`，余数给第一个上阵英雄
- 调用 `HeroSystem.addHeroExp(heroId, exp)` 公开 API
- expBefore / expAfter 记录所有上阵英雄 `heroRuntimeState.exp` 之和

### power 刷新

- `FormationSystem.recalculateAllPower()` → 遍历所有预设重新计算 `teamPower`
- powerBefore / powerAfter 取自 `getActivePreset('pve').teamPower`
- 经验未升级时 power delta 允许为 0

### Chapter 推进

- `ChapterSystem.completeStage('chapter_001_stage_01')` — 自带幂等保护（重复完成返回 false）
- 成功后 ChapterSystem 自动解锁下一关卡 `chapter_001_stage_02`
- lastResult.nextStageUnlocked 记录新解锁的关卡 ID

### Save 落盘

- `Phase9Bootstrap.saveAll()` — 收集 Hero / Skill / Formation / Chapter / Tutorial / Analytics 写入 SaveManager
- `SaveManager.save()` — 强制落盘到适配器

---

## 四、数据流

```
challengeFirstStage()
  ├─ ChapterRepository.getStage('chapter_001_stage_01')
  │   └─ battleStageId: "STAGE_001" ✅
  ├─ _ensurePlayableFormation()
  │   ├─ HeroSystem.getUnlockedHeroes() → 0 ?
  │   │   └─ ConfigManager → initialHeroId: "hero_001"
  │   │       └─ HeroSystem.unlockHero("hero_001")
  │   └─ FormationSystem.refillEmptyPresets()
  ├─ FormationSystem.generateTeamSnapshot('pve') → TeamSnapshot
  ├─ BattleManager.setPlayerFormation(snapshot, slots)
  └─ BattleManager.startStageBattle('STAGE_001') → state=running

update(dt)
  └─ BattleManager.updateBattle(dt * 1000) [running only]

_onBattleFinished(result)
  ├─ 校验 stageId / state
  ├─ RewardSettlement.settleBattleReward(result, { transactionId })
  │   └─ InventoryService._processRewardGrant [exp filtered]
  │       └─ InventoryService.addAssets() [idempotent]
  ├─ _distributeExpToFormation(expGain)
  │   └─ HeroSystem.addHeroExp(heroId, exp) × N
  ├─ FormationSystem.recalculateAllPower()
  ├─ ChapterSystem.completeStage('chapter_001_stage_01')
  ├─ Phase9Bootstrap.saveAll()
  └─ SaveManager.save()
```

---

## 五、风险与后续建议

### ⚠ 风险

1. **Coordinator 不接 Scene 不挂组件** — 当前 `@ccclass` Component 只定义代码，未挂到 Phase10Main.scene 的节点上。在 Step12A-C 需要在 Scene 中实际挂载此 Component 才能通过 Cocos 生命周期（onLoad/update/onDestroy）驱动。

2. **exp 分配依赖公开 API `getActivePreset('pve')`** — 如果 FormationSystem 的 default_pve 预设因初始化时序被清除或未正确激活，exp 分配可能跳过。当前有 `_ensurePlayableFormation` 保护。

3. **经验均分余数给第一英雄** — 简单策略，后续可提升为按英雄等级/战力加权分配。

### ➡️ 建议进入 Step12A-C

Step12A-C 应实现：
- 将 Coordinator Component 挂到 Phase10Main.scene 节点
- 创建 ResultPanel 接入 `getLastResult()` 展示结算
- 创建按钮调用 `challengeFirstStage()`
- 接入 Phase10MainBootstrap 初始化流程

### 不推送 / 不提交

本轮修改仅本地完成，未推送 GitHub，未提交。

---

## 六、Diff 摘要

```
 chapter_data.json              |   3 +-
 global_const.json              |   3 +-
 ChapterTypes.ts                |   7 ++
 global_config.ts               |   6 ++
 Phase10MainGameplayCoordinator.ts | 708 +++++++++++ (新文件)

 5 modified + 1 new = 6 files
 Total: +728 / -5 (不含 Step12A-A 的已有 diff)
```
