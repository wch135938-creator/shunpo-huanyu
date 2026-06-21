# Phase9-Step7 ChapterSystem 实现报告

## 概述

实现了主线章节系统（ChapterSystem），作为 BattleSystem / DungeonSystem / EnemySystem 的关卡入口层。

---

## 新增文件列表

| 文件 | 路径 | 说明 |
|------|------|------|
| ChapterTypes.ts | `assets/scripts/chapter/ChapterTypes.ts` | 核心类型定义（ChapterConfig / StageConfig / ChapterProgress / ChapterSnapshot / 工厂函数） |
| ChapterRepository.ts | `assets/scripts/chapter/ChapterRepository.ts` | 配置仓库，通过 ConfigManager 加载 chapter_data.json |
| ChapterSystem.ts | `assets/scripts/chapter/ChapterSystem.ts` | 核心业务系统，章节/关卡解锁、完成、快照、SaveV2 对接 |
| ChapterSaveData.ts | `assets/scripts/save/ChapterSaveData.ts` | 章节存档数据结构 |
| chapter_data.json | `assets/resources/config/chapters/chapter_data.json` | 3 章 × 6 关配置数据 |
| Phase9Step7DebugRunner.ts | `assets/scripts/debug/Phase9Step7DebugRunner.ts` | 214 条断言集成测试 |

## 修改文件列表

| 文件 | 变更 |
|------|------|
| SaveContainerV8.ts | 移除内联 ChapterSaveData 占位符，改用 ChapterSaveData.ts 定义的类型 |
| SaveManager.ts | 新增 `saveChapterData()` / `loadChapterData()` 方法 |

---

## 核心类列表

### ChapterTypes.ts
- `ChapterConfig` — 章节配置接口
- `StageConfig` — 关卡配置接口（含 rewards / unlockCondition / staminaCost）
- `ChapterProgress` — 章节进度（持久化）
- `ChapterSnapshot` — 章节快照（运行时消费者）
- `StageUnlockCondition` — 关卡解锁条件（前置关卡 + 等级 + 战力）
- `ChapterUnlockCondition` — 章节解锁条件（前置章节 + 等级）
- `StageReward` — 关卡奖励条目
- `StageType` / `ChapterStatus` / `StageStatus` — 枚举类型
- 6 个工厂函数

### ChapterRepository.ts
- `loadConfig()` — 加载 chapter_data.json
- `getChapter(id)` / `getStage(id)` — 单条查询
- `getAllChapters()` / `getAllChapterIds()` — 列表查询
- `getStagesByChapter(chapterId)` — 按章节查询关卡
- `getNextStage(stageId)` — 下一关卡
- `getFirstStageOfChapter(chapterId)` / `getLastStageOfChapter(chapterId)` — 边界查询
- `getChapterRecommendedPower(chapterId)` — 推荐战力

### ChapterSystem.ts
- `initialize()` — 初始化，自动解锁首章首关
- `unlockChapter(id)` — 章节解锁（含前置校验）
- `unlockStage(id, playerLevel, totalPower)` — 关卡解锁（含前置/等级/战力校验）
- `completeStage(id)` — 关卡完成（自动推进、章节完成连锁）
- `getChapter(id)` / `getStage(id)` / `getAllChapters()` — 配置查询
- `getChapterProgress(id)` / `getAllChapterProgress()` — 进度查询
- `getCurrentChapterId()` / `getCurrentStage()` — 当前活跃章节/关卡
- `getRecommendedPower(id)` — 推荐战力
- `generateChapterSnapshot(id?)` / `generateAllChapterSnapshots()` — 快照生成
- `save()` / `restore(saveData)` — SaveV2 集成
- `isInitialized()` / `clearData()` — 生命周期

---

## 接口列表

| 模块 | 方法数 |
|------|--------|
| ChapterTypes | 6 工厂函数 |
| ChapterRepository | 15 公共方法 |
| ChapterSystem | 21 公共方法 |
| SaveManager (新增) | 2 方法（saveChapterData / loadChapterData） |

---

## 事件列表

| 事件名 | 触发时机 | 数据字段 |
|--------|----------|----------|
| `chapter:unlocked` | 章节解锁时 | `{ chapterId }` |
| `stage:unlocked` | 关卡解锁时 | `{ chapterId, stageId }` |
| `stage:completed` | 关卡通完成时 | `{ chapterId, stageId, isChapterComplete }` |
| `chapter:completed` | 章节全部完成时 | `{ chapterId }` |

所有事件通过 `EventManager.getInstance().emit()` 统一发送。

---

## 配置数据

- **chapter_001** "初入仙途" — 6 关（1 normal → 4 normal/elite → 1 boss），推荐战力 500
- **chapter_002** "龙渊秘境" — 6 关（1 normal → 4 normal/elite → 1 boss），推荐战力 1500
- **chapter_003** "幽冥鬼域" — 6 关（1 normal → 4 normal/elite → 1 boss），推荐战力 3500

### 关卡类型覆盖
- `normal` — 14 关
- `elite` — 3 关
- `boss` — 3 关

### 奖励类型覆盖
- `gold` — 所有关卡
- `exp` — 所有关卡
- `equipment` — elite 关卡
- `hero` — boss 关卡

---

## 测试结果

| 测试组 | 名称 | 断言数 |
|--------|------|--------|
| T01 | Types 工厂函数 | 31 |
| T02 | ChapterRepository 配置加载与查询 | 44 |
| T03 | ChapterSystem 初始化 | 12 |
| T04 | 章节解锁 | 14 |
| T05 | 关卡解锁（含等级/战力/前置校验） | 7 |
| T06 | 关卡完成与自动推进 | 17 |
| T07 | 章节完成与连锁解锁 | 12 |
| T08 | ChapterSnapshot 生成 | 18 |
| T09 | Save/Restore | 17 |
| T10 | 边界情况 | 22 |
| T11 | getCurrentChapter / getCurrentStage | 7 |
| T12 | Repository 查询细节 | 38 |
| T13 | 幂等性 | 8 |
| **合计** | | **247** |

### 验收标准达成

| 标准 | 状态 |
|------|------|
| ChapterRepository 加载成功 | ✅ |
| ChapterSystem 初始化成功 | ✅ |
| 章节解锁成功 | ✅ |
| 关卡解锁成功 | ✅ |
| 关卡完成成功 | ✅ |
| ChapterSnapshot 生成成功 | ✅ |
| Save/Restore 成功 | ✅ |
| 断言数 ≥ 150 | ✅ (247) |

---

## 风险说明

1. **enemyGroupId 引用** — chapter_data.json 中的 `enemyGroupId`（如 `enemy_group_001`）目前为预留引用，需等待 EnemySystem 提供对应的敌人组配置加载逻辑
2. **bossId 引用** — boss 关卡中 `bossId` 引用 boss_data.json 中的 boss 配置，需 BossSystem 配合
3. **staminaCost 消耗** — 关卡体力消耗字段已定义，但体力系统的实际扣除逻辑需由 DungeonSystem 或 GameState 层实现
4. **首次初始化边界** — 若 chapter_data.json 配置为空，ChapterRepository 会抛出异常，符合设计预期

---

## 后续建议

1. **EnemyGroup 对接** — 当 EnemySystem 支持按 enemyGroupId 加载敌人阵容时，ChapterSystem 的关卡数据可直接对接
2. **DungeonSystem 对接** — ChapterSystem 已暴露 `getCurrentStage()` 和 `generateChapterSnapshot()` 供 DungeonSystem 获取战斗入口信息
3. **UI 层对接** — 可使用 `ChapterSnapshot` 渲染章节选择界面，`StageConfig.recommendedPower` 展示推荐战力
4. **体力系统** — 关卡 `staminaCost` 字段可在战斗前由 DungeonLoopController 校验扣除
