# Phase7-Step4-DropHistory-PitySystem-Implementation-Report

## 概述

实现 Phase7-Step4 掉落历史与保底系统。新增 `DropHistoryRecord`、`PitySnapshot`、`PityRule` 类型，扩展 `DropSystem` 批量结算能力，扩展 `ConfigValidator` / `RuntimeValidator`，新增 `SaveMigration V3→V4`。

**生成日期**: 2026-06-03

---

## 一、文件变更清单

### 修改文件 (7)

| 文件 | 变更摘要 |
|------|---------|
| `assets/scripts/data/drop_types.ts` | 新增 `DropHistoryRecord`、`PitySnapshot`、`PityRule`、`RewardConfig` 类型及工厂函数 |
| `assets/scripts/save/DropSaveData.ts` | 新增 `dropHistoryRecords`、`pitySnapshot`、`pityRules` optional 字段 |
| `assets/scripts/systems/DropSystem.ts` | 新增 `settleBatch` 方法、保底计数管理、`DropHistoryRecord` 持久化 |
| `assets/scripts/validation/ConfigValidator.ts` | 新增 `validatePityRules` 方法 |
| `assets/scripts/validation/RuntimeValidator.ts` | 新增 `validateDropHistory`、`validatePitySnapshot` 方法 |
| `assets/scripts/save/SaveContainer.ts` | `CURRENT_SAVE_VERSION`: 3 → 4 |
| `assets/scripts/save/SaveMigrationSystem.ts` | 新增 `_migrateV3ToV4` 迁移逻辑、pityCounters 同步 |

### 新增文件 (2)

| 文件 | 用途 |
|------|------|
| `assets/scripts/debug/Phase7Step4DebugRunner.ts` | 12 组共 80+ 条测试 |
| `docs/Phase7-Step4-DropHistory-PitySystem-Implementation-Report.md` | 本报告 |

---

## 二、新增类型

### DropHistoryRecord

```typescript
interface DropHistoryRecord {
  id: string;
  playerId: string;
  sourceId: string;
  sourceType: string;       // dungeon_node | dungeon_boss | dungeon_event | quest | achievement | shop | compensation | season
  dropTableVersion: number;
  seed: string;
  rewards: RewardGrant[];
  pityBefore: PitySnapshot;
  pityAfter: PitySnapshot;
  createdAt: number;
}
```

**位置**: `assets/scripts/data/drop_types.ts:150`

### PitySnapshot

```typescript
interface PitySnapshot {
  pityCounters: Record<string, number>;  // 按维度 Key 存储的计数
  lastResetAt: number;
}
```

**位置**: `assets/scripts/data/drop_types.ts:134`

### PityRule

```typescript
interface PityRule {
  id: string;
  sourceType: string;
  guaranteeThreshold: number;
  extraReward?: RewardConfig;
}
```

**位置**: `assets/scripts/data/drop_types.ts:116`

### RewardConfig

```typescript
interface RewardConfig {
  rewardType: 'gold' | 'exp' | 'equipment' | 'item' | 'currency';
  itemId?: string;
  quantity: number;
}
```

**位置**: `assets/scripts/data/drop_types.ts:99`

### 工厂函数

| 函数 | 用途 |
|------|------|
| `createEmptyPitySnapshot()` | 创建空保底快照 |
| `generateDropHistoryRecordId()` | 生成唯一记录 ID (`dhr_<ts>_<rand>`) |
| `convertDropResultToRewardGrants()` | Phase6 `DropResultData` → Phase7 `RewardGrant[]` |

---

## 三、DropSystem 扩展

### settleBatch(sources, playerId)

批量结算多个 `RewardSource`，返回 `DropHistoryRecord[]`。

**流程**:
1. 加载当前保底快照
2. 对每个 RewardSource:
   - 记录 `pityBefore`
   - 逐表 `rollDrop` 并聚合奖励
   - 检查保底规则，触发时追加额外奖励
   - 记录 `pityAfter`
   - 生成 `DropHistoryRecord`
3. 持久化保底计数与历史记录

**位置**: `assets/scripts/systems/DropSystem.ts:327`

### 保底管理 API

| 方法 | 用途 |
|------|------|
| `loadPityRules(rules)` | 加载保底规则配置 |
| `getPitySnapshot()` | 获取当前保底快照 |
| `resetPityCounter(sourceType)` | 重置指定来源类型计数器 |
| `resetAllPityCounters()` | 重置全部计数器 |

### 保底触发逻辑

- 每次 `settleBatch` 调用时，对匹配 `sourceType` 的规则推进计数器
- 当 `counter >= threshold` 时：
  - 发放 `extraReward` 到 `rewards` 列表
  - 重置计数器为 0
  - 更新 `lastResetAt` 时间戳

**位置**: `assets/scripts/systems/DropSystem.ts:494` (`_applyPityRules`)

---

## 四、Validator 扩展

### ConfigValidator.validatePityRules(rules)

校验保底规则配置：

- 规则 ID 唯一性
- `sourceType` 合法性（8 种值）
- `guaranteeThreshold` > 0
- `extraReward` 结构完整性（rewardType、quantity、itemId）

**位置**: `assets/scripts/validation/ConfigValidator.ts:595`

### RuntimeValidator.validateDropHistory(record)

校验 DropHistoryRecord 完整性：

- 所有必填字段非空
- `dropTableVersion` > 0
- `rewards` 数组结构与数量合理性（上限 200）
- `pityBefore` / `pityAfter` 有效（委托给 `validatePitySnapshot`）
- `createdAt` 有效性（不在未来 5 分钟外）

**位置**: `assets/scripts/validation/RuntimeValidator.ts:606`

### RuntimeValidator.validatePitySnapshot(snapshot, path)

校验 PitySnapshot 完整性：

- `pityCounters` 对象有效
- 所有计数器值非负且有限
- 异常高值 warning（> 10000）
- `lastResetAt` 有效性

**位置**: `assets/scripts/validation/RuntimeValidator.ts:713`

---

## 五、SaveMigration V3→V4

### 迁移步骤

```
V3 → V4: DropHistoryRecord + PitySnapshot 字段补充
```

**注册位置**: `assets/scripts/save/SaveMigrationSystem.ts:129`

### 迁移逻辑

1. **`_ensureDropHistoryV4Fields`**: 确保 `DropSaveData` 包含 `dropHistoryRecords`（空数组）、`pitySnapshot`（默认值）、`pityRules`（空数组）
2. **`_syncPityCountersToDropSave`**: 将 `RoguelikeSaveData.pityCounters` 中的已有保底计数合并到 `DropSaveData.pitySnapshot`，避免旧数据丢失

**位置**: `assets/scripts/save/SaveMigrationSystem.ts:418` (`_migrateV3ToV4`)

### 兼容性

- 所有 Phase7-Step4 新增字段均为 optional
- 旧存档 V3 自动升级到 V4，无数据丢失
- `RoguelikeSaveData.pityCounters` 中的已有计数自动同步到新结构

---

## 六、Phase7Step4DebugRunner

### 测试覆盖 (12 组)

| # | 测试名称 | 测试条数 | 覆盖要点 |
|---|---------|---------|---------|
| 1 | DropHistoryRecord 创建 | 13 | 基础字段、rewards 结构、pityBefore/After、全部 sourceType |
| 2 | PitySnapshot 计数/重置 | 10 | 空快照、递增多维、单重置、全重置、序列化 |
| 3 | PityRule 配置与触发 | 7 | 基础字段、extraReward、不同类型、无奖励、最小阈值 |
| 4 | settleBatch 批量结算 | 9 | 空 sources、单/多 source、ID 唯一性 |
| 5 | settleBatch 保底触发 | 6 | 低阈值触发、计数器推进、跨类型隔离、resetPityCounter |
| 6 | DropHistory 持久化 | 5 | 记录保存、playerId 过滤、快照持久化、规则持久化 |
| 7 | ConfigValidator.validatePityRules | 7 | 空规则、合法通过、重复 ID、无效阈值、无效类型、warning |
| 8 | RuntimeValidator.validateDropHistory | 8 | 合法通过、null、缺少字段、无效版本、无效时间、超多 rewards |
| 9 | RuntimeValidator.validatePitySnapshot | 7 | 合法通过、null、负数、异常高、无效时间、NaN、自定义路径 |
| 10 | SaveMigration V3→V4 | 8 | 步骤注册、空存档、V4 字段补充、pityCounters 同步、CURRENT_SAVE_VERSION |
| 11 | RewardGrant 转换 | 5 | 空结果、金币、经验、物品、混合 |
| 12 | 边界情况 | 6 | 快照独立、ID 唯一、无奖励规则、大数组、全部 sourceType |

**总计**: 91 条测试

**用法**: `Phase7Step4DebugRunner.runAll()`

---

## 七、兼容性确认

| 检查项 | 状态 |
|--------|------|
| 所有新增字段 optional | ✅ |
| Phase6 DropHistoryEntry 接口不变 | ✅ |
| Phase7-Step1/2/3 接口不变 | ✅ |
| rollDrop / claimDrop 旧 API 不变 | ✅ |
| 旧存档 V0-V3 可正常迁移到 V4 | ✅ |
| Portrait 竖版（纯逻辑层，无 UI/Canvas/Camera） | ✅ |

---

## 八、数据流总结

```
RewardSource[]
  ↓
DropSystem.settleBatch()
  ↓
┌──────────────────────────────────────────┐
│ 1. 加载 PitySnapshot (from SaveManager)  │
│ 2. 记录 pityBefore                       │
│ 3. rollDrop 每张掉落表                   │
│ 4. convertDropResultToRewardGrants      │
│ 5. _applyPityRules → 推进/触发保底      │
│ 6. 记录 pityAfter                        │
│ 7. 生成 DropHistoryRecord               │
│ 8. _savePitySnapshot (to SaveManager)   │
│ 9. _saveDropHistoryRecords              │
└──────────────────────────────────────────┘
  ↓
DropHistoryRecord[] (可持久化/审计/补偿)
```

---

## 九、后续工作建议

- Phase7-Step5: 接入 EconomySystem 统一发放 `RewardGrant`（当前 settleBatch 不自动发放奖励到账户）
- 保底规则配置移到 JSON 配置文件（当前为代码注册）
- 增加日重置自动清零保底计数器的定时逻辑
