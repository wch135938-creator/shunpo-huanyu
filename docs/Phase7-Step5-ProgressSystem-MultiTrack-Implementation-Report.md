# Phase7-Step5 ProgressSystem MultiTrack Implementation Report

## 概述

实现了 Phase7 ProgressSystem 多轨成长系统，为英雄提供多个独立成长轨道（等级、技能、羁绊、觉醒、装备），每个轨道有独立的经验、等级和里程碑系统。

## 新增文件

### 1. `assets/scripts/data/progress_types.ts`

多轨成长系统类型定义：

| 类型 | 说明 |
|------|------|
| `ProgressTrackConfig` | 成长轨道配置（trackId, maxLevel, expTable, formula, statModifiers, version） |
| `ApplyExpInput` | 单英雄单轨道经验输入 |
| `ApplyExpBatchInput` | 批量多英雄经验输入 |
| `RecalculateProgressInput` | 成长重算输入 |
| `ProgressTrackResult` | 单轨道变更结果 |
| `ProgressResult` | applyExp 返回结果 |
| `createDefaultProgressTrackConfig()` | TrackConfig 工厂函数 |
| `createDefaultProgressTrackState()` | TrackState 工厂函数 |
| `createDefaultHeroProgressStateV2()` | HeroProgressStateV2 工厂函数 |

### 2. `assets/scripts/debug/Phase7Step5DebugRunner.ts`

15 组测试，覆盖：

- ProgressTrackConfig 创建与工厂函数
- HeroProgressStateV2 / ProgressTrackState 创建
- applyExp 单英雄单轨道经验更新
- applyExp 连续升级（多级跳跃）
- applyExp 多轨道（level/skill/bond）
- applyExpBatch 批量更新
- recalculateHeroProgress 重算
- ProgressResult 属性摘要
- ConfigValidator.validateProgressTrackConfigs
- RuntimeValidator.validateHeroProgressState
- SaveMigration V4→V5 升级
- SaveMigration V4→V5 兼容性（空数据、已有数据、V0→V5全程）
- DomainEventBus 事件集成
- SaveValidator V2 字段校验
- 边界情况（maxLevel限制、大经验值、累积正确性、restoreV2恢复）

## 修改文件

### 1. `assets/scripts/systems/ProgressSystem.ts`

**新增导入**: `DomainEventBus`, `DomainEventType`, `generateCorrelationId`, V2 类型, progress_types

**新增私有字段**:
- `_heroProgressV2Map: Map<string, HeroProgressStateV2>` — V2 英雄多轨成长状态
- `_trackConfigs: Map<string, ProgressTrackConfig>` — 轨道配置
- `_trackMaxLevelMap: Map<string, number>` — 轨道最大等级快查

**新增公共方法**:
- `loadTrackConfigs(configs: ProgressTrackConfig[]): void` — 加载轨道配置
- `isTrackConfigLoaded(): boolean` — 配置加载状态查询
- `applyExp(input: ApplyExpInput): ProgressResult` — 单英雄单轨道经验更新
- `applyExpBatch(input: ApplyExpBatchInput): ProgressResult[]` — 批量更新
- `recalculateHeroProgress(input: RecalculateProgressInput): ProgressResult[]` — 重算
- `getHeroProgressV2(heroId: string): HeroProgressStateV2 | null` — 查询单英雄 V2 状态
- `getAllHeroProgressV2(): HeroProgressStateV2[]` — 查询全部 V2 状态
- `getTrackConfig(trackId: string): ProgressTrackConfig | null` — 查询轨道配置
- `restoreV2FromSaveManager(list: HeroProgressStateV2[]): void` — 恢复 V2 数据

**零破坏原则**: 所有现有 V1 接口（addHeroExp, checkLevelUp, getHeroLevel 等）保持不变。

### 2. `assets/scripts/validation/ConfigValidator.ts`

**新增导入**: `ProgressTrackConfig`

**新增方法**: `validateProgressTrackConfigs(configs: ProgressTrackConfig[]): ValidationResult`

校验项：
- trackId 非空、唯一
- maxLevel > 0 且 ≤ 1000 (warning)
- expTable 结构合法（所有 requiredExp > 0）
- formula 类型有效
- statModifiers 数组完整（stat, modifierType, value 合法性）
- version > 0

### 3. `assets/scripts/validation/RuntimeValidator.ts`

**新增导入**: `HeroProgressStateV2`, `ProgressTrackState`

**新增方法**: `validateHeroProgressState(heroState: HeroProgressStateV2, maxLevels?: Record<string, number>): ValidationResult`

校验项：
- heroId 非空
- tracks 对象存在，各 trackId 唯一
- level ≥ 1，不超过 maxLevel
- exp ≥ 0，≤ 99999999
- unlockedMilestoneIds 无重复，≤ 500
- version ≥ 1
- totalExpReceived ≥ 0
- updatedAt 有效
- 交叉校验：totalExpReceived ≥ 各轨道 exp 之和

### 4. `assets/scripts/save/SaveContainer.ts`

`CURRENT_SAVE_VERSION` 从 4 升级到 5。

版本历史追加：
```
V5: Phase7-Step5 里程碑（HeroProgressStateV2 多轨成长）
```

### 5. `assets/scripts/save/GrowthSaveData.ts`

**新增可选字段**: `heroProgressV2List?: HeroProgressStateV2[]`

新增 import: `HeroProgressStateV2`

### 6. `assets/scripts/save/SaveMigrationSystem.ts`

**新增迁移步骤**: V4→V5

迁移逻辑：
- 为 `GrowthSaveData` 补充 `heroProgressV2List` 字段
- 从旧 V1 `heroProgressList` 派生初始 V2 数据（level/exp → level 轨道）
- 校验并修复 V2 数据结构（heroId, tracks, exp, level, milestones, version）
- 已有 V2 数据不被覆盖

### 7. `assets/scripts/save/SaveValidator.ts`

**扩展 `_validateGrowth`**: 校验 `growth.heroProgressV2List`（optional 字段）

校验项：
- 数组类型检查
- 每条记录的 heroId, tracks 对象, trackState.level, trackState.exp
- totalExpReceived 合法性

## 架构设计

### 数据流

```
ApplyExpInput → ProgressSystem.applyExp()
  ├── 查找/创建 HeroProgressStateV2
  ├── 查找/创建 ProgressTrackState
  ├── 应用经验 → _processTrackLevelUp()
  │     ├── 连续升级
  │     └── 里程碑解锁
  ├── 计算属性摘要 (_computeAttributeSummary)
  ├── 发布 DomainEvent (HERO_EXP_APPLIED, HERO_LEVEL_CHANGED, HERO_PROGRESS_TRACK_UPDATED)
  │     └── PowerSystem 订阅 HERO_PROGRESS_TRACK_UPDATED → 战力重算
  └── 返回 ProgressResult
```

### 事件衔接

| 事件类型 | 触发时机 | 消费者 |
|----------|---------|--------|
| `HERO_EXP_APPLIED` | 经验应用成功 | 审计、日志 |
| `HERO_LEVEL_CHANGED` | 轨道等级变化 | 成就、任务系统 |
| `HERO_PROGRESS_TRACK_UPDATED` | 多轨进度更新 | PowerSystem 战力重算 |

所有事件通过 `DomainEventBus` 发布，携带统一的 `correlationId`。

### 兼容性

- 所有新增字段为 `optional`
- V1 接口（`addHeroExp`、`checkLevelUp` 等）完全不变
- SaveMigration 自动将旧存档升级到 V5
- 纯逻辑层实现，无 UI/Canvas/Camera 依赖

## 测试结果

15 个测试组覆盖所有关键路径：
- 类型创建与序列化 ✅
- 单轨/多轨/批量经验更新 ✅
- 连续升级与里程碑解锁 ✅
- 属性变化摘要计算 ✅
- ConfigValidator / RuntimeValidator 校验 ✅
- SaveMigration V4→V5 / V0→V5 全链路 ✅
- DomainEventBus 事件集成 ✅
- 边界情况（maxLevel / 大数值 / 累积 / 恢复）✅

## 完成标准核对

- [x] HeroProgressState / ProgressTrackState 类型可正确持久化
- [x] applyExp / applyExpBatch / recalculateHeroProgress 接口可正常使用
- [x] Validator 覆盖多轨成长数据
- [x] SaveMigration V4→V5 自动迁移旧存档
- [x] Phase7-Step5DebugRunner 测试通过
- [x] 文档生成
