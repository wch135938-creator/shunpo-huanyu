# Phase7-Step6-PowerSystem-Recalculate-Implementation-Report

## 概述

**日期**: 2026-06-03  
**模块**: PowerSystem 批量战力重算  
**版本**: Phase7-Step6  
**原则**: 所有新增字段 optional，Phase4A~Phase7-Step5 接口不变

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `assets/scripts/data/power_types.ts` | **新增** | HeroPowerInputV2 / HeroPowerResult / TeamPowerInputV2 / TeamPowerResult / PowerRecalculateBatchInput / PowerRecalculateBatchResult / FormulaCompareInput / FormulaCompareResult / PowerFormulaSnapshot 类型定义 |
| `assets/scripts/systems/PowerSystem.ts` | **修改** | 新增 V2 方法：loadFormulaConfigs / calculateHeroPowerV2 / calculateHeroPowerV2WithVersion / calculateTeamPowerV2 / recalculateBatch / recalculateBatchFull / compareFormulaVersions |
| `assets/scripts/validation/ConfigValidator.ts` | **修改** | 增强 validatePowerFormulas（新增 modifiers 校验、有效格式检查、effectiveFromSaveVersion 校验、未知 stat 警告）；新增 validatePowerFormulaConfig 别名 |
| `assets/scripts/validation/RuntimeValidator.ts` | **修改** | 新增 validatePowerCalculation / validateTeamPowerCalculation / validateBatchRecalculation |
| `assets/scripts/save/SaveContainer.ts` | **修改** | CURRENT_SAVE_VERSION 5→6；SaveContainer 新增 powerFormulaSnapshot?: PowerFormulaSnapshot；createDefaultSaveContainer 初始化该字段 |
| `assets/scripts/save/SaveMigrationSystem.ts` | **修改** | 注册 V5→V6 迁移步骤；新增 _migrateV5ToV6 方法 |
| `assets/scripts/debug/Phase7Step6DebugRunner.ts` | **新增** | 15 组测试覆盖所有新增功能 |

---

## 1. 新增类型 (power_types.ts)

### 核心类型

```typescript
// 单英雄战力计算输入（V2）
interface HeroPowerInputV2 {
  heroId: string;
  heroProgress: HeroProgressStateV2;  // 多轨成长状态
  equipmentPower: number;             // 装备战力（外部传入）
}

// 单英雄战力计算结果
interface HeroPowerResult {
  heroId: string;
  power: number;
  formulaVersion: number;
  inputSummary: Record<string, number>;
  outputSummary: Record<string, number>;
  delta?: number;
}

// 团队战力计算输入
interface TeamPowerInputV2 {
  heroIds: string[];
  heroProgressMap: Record<string, HeroProgressStateV2>;
  equipmentPowerMap: Record<string, number>;
}

// 团队战力计算结果
interface TeamPowerResult {
  totalPower: number;
  individualResults: HeroPowerResult[];
  correlationId: CorrelationId;
}

// 批量战力重算输入
interface PowerRecalculateBatchInput {
  heroIds?: string[];
  reason: PowerRecalculateReason;     // migration | formula_version_change | equipment_change | hero_progress_change | manual | lazy_recalc
  correlationId?: CorrelationId;
  forceLatestFormula?: boolean;
}

// 批量战力重算结果
interface PowerRecalculateBatchResult {
  success: boolean;
  heroCount: number;
  heroResults: HeroPowerResult[];
  oldTotalPower?: number;
  newTotalPower: number;
  totalPowerDelta?: number;
  skippedCount: number;
  skippedHeroIds: string[];
  errors: string[];
  formulaVersion: number;
  correlationId: CorrelationId;
  reason: PowerRecalculateReason;
}

// 公式版本对比输入/结果
interface FormulaCompareInput { heroId, heroProgress, equipmentPower, versions[] }
interface FormulaCompareResult { heroId, versionResults[], highestPowerVersion, lowestPowerVersion, diffs[], baseInputSummary }
```

### 存档快照类型

```typescript
interface PowerFormulaSnapshot {
  activeFormulaVersion: number;
  formulas: PowerFormulaConfigV2[];
  savedAt: number;
}
```

---

## 2. PowerSystem V2 扩展

### 公式配置管理

```
loadFormulaConfigs(formulas: PowerFormulaConfigV2[]): void
  → 加载公式配置列表，自动将最高版本设为活跃版本
  → 空列表时使用内置默认公式（V1）

restoreFormulaConfigsFromSnapshot(formulas, activeVersion): void
  → 从存档快照恢复公式配置（迁移后调用）

getActiveFormulaVersion(): number
getFormulaConfig(version?: number): PowerFormulaConfigV2
getFormulaConfigs(): PowerFormulaConfigV2[]
isFormulaConfigsLoaded(): boolean
```

### 核心计算 (V2)

```
calculateHeroPowerV2(input: HeroPowerInputV2): HeroPowerResult
  流程：
  1. 从 heroProgress.tracks 提取输入属性（hp/atk/def/speed）
  2. 使用 statWeights 计算 rawPower = Σ(stat × weight)
  3. 应用 modifiers（flat/multiply/cap）
  4. 使用 rounding（floor/round/ceil）取整
  5. 加上装备战力
  6. 发布 HERO_POWER_RECALCULATED 领域事件

calculateHeroPowerV2WithVersion(input, version): HeroPowerResult
  → 指定公式版本计算（用于版本对比）

calculateTeamPowerV2(input: TeamPowerInputV2): TeamPowerResult
  → 多英雄聚合计算，统一 correlationId 追踪

recalculateBatchFull(heroInputs, reason, oldPowers?, correlationId?): PowerRecalculateBatchResult
  → 批量重算，计算 delta，发布事件，关联上下文

compareFormulaVersions(input: FormulaCompareInput): FormulaCompareResult
  → 多版本对比，计算差异对 (diffs)
```

### 属性提取逻辑

从 `HeroProgressStateV2` 多轨状态提取基础属性：

| 轨道 | 影响属性 | 公式 |
|------|----------|------|
| level | hp, atk, def, speed | 100/20/10/5 + (level-1)×50/10/5/1 |
| skill | atk | +(level-1)×3 |
| bond | hp, def | +(level-1)×20/3 |
| awakening | atk, speed | +(level-1)×5/2 |
| equipment | 不产生基础属性 | 由 equipmentPower 单独传入 |

---

## 3. Validator 扩展

### ConfigValidator

```
validatePowerFormulas(formulas, currentSaveVersion?): ValidationResult
  增强检查（Phase7-Step6）：
  - ✅ ID 唯一性（新增）
  - ✅ 版本号唯一性
  - ✅ 版本号 > 0
  - ✅ effectiveFromSaveVersion ≥ 0（新增）
  - ✅ effectiveFromSaveVersion vs currentSaveVersion 一致性（新增 warning）
  - ✅ statWeights 非空
  - ✅ 权重 ≥ 0（新增附加 checks：>100 warning，非数字 error）
  - ✅ 未知 stat 产生 warning（新增）
  - ✅ modifiers type 合法性：flat/multiply/cap（新增）
  - ✅ modifiers stat/value 有效性（新增）
  - ✅ modifiers 数量限制（新增）
  - ✅ rounding ∈ {floor, round, ceil}
  - ✅ 全局版本号连续性检查（新增 warning）

validatePowerFormulaConfig(formulas, currentSaveVersion?): ValidationResult
  → validatePowerFormulas 的语义别名
```

### RuntimeValidator

```
validatePowerCalculation(result, activeFormulaVersion?): ValidationResult
  检查项：
  - heroId 非空
  - power ≥ 0（非负数、有限数）
  - power 合理性上限（> 99999999 warning）
  - formulaVersion > 0
  - formulaVersion 与活跃版本一致性（warning）
  - inputSummary 结构完整（非空、成员数值有效）
  - outputSummary 结构完整（非空、成员数值有效）
  - delta 合理性（可选的，超出范围 warning）

validateTeamPowerCalculation(result, activeFormulaVersion?): ValidationResult
  - 除以上外，增加：
  - correlationId 非空
  - totalPower 与 individualResults 幂和一致性交叉校验

validateBatchRecalculation(result): ValidationResult
  - correlationId 非空
  - heroCount 与 heroResults.length 一致性
  - newTotalPower ≥ 0
  - totalPowerDelta 合理性（可选）
  - formulaVersion > 0
  - 错误数与跳过数一致性
```

---

## 4. SaveMigration V5→V6

### 迁移逻辑

```
_migrateV5ToV6(container):
  1. 确保 powerFormulaSnapshot 存在
     - 不存在：创建默认快照（V1）
     - 已存在：校验并补全各字段
       - activeFormulaVersion → 修正为 ≥ 1
       - formulas → 补全每条公式的必需字段
       - savedAt → 修正为当前时间戳

  2. 可选：为 heroProgressList 中的英雄添加 __powerFormulaVersion 标记
     - 0 表示需要重算

  3. 更新时间戳
```

### 默认快照结构

```typescript
{
  activeFormulaVersion: 1,
  formulas: [{
    id: 'POWER_FORMULA_DEFAULT',
    version: 1,
    effectiveFromSaveVersion: 0,
    statWeights: { hp: 0.5, atk: 2.0, def: 1.0, speed: 0.3 },
    modifiers: [],
    rounding: 'round'
  }],
  savedAt: Date.now()
}
```

---

## 5. DebugRunner 测试覆盖

`Phase7Step6DebugRunner.ts` — 15 组测试:

| # | 测试 | 覆盖场景 |
|---|------|----------|
| 1 | 公式加载 | 加载/获取/版本/回退/空列表 |
| 2 | calculateHeroPowerV2 | 基础计算/高低等级/装备加成/多轨道 |
| 3 | calculateHeroPowerV2WithVersion | V1/V2/V3 版本分别计算，验证权重差异 |
| 4 | calculateTeamPowerV2 | 多英雄/缺失英雄/空列表，验证聚合正确性 |
| 5 | recalculateBatchFull | 批量重算/delta/空列表/跳过计数 |
| 6 | compareFormulaVersions | 3版本对比/diffs对数/版本升序/单版本 |
| 7 | ConfigValidator | 合法/重复版本/负版本/无效rounding/负权重/空权重/超前版本/未知stat/无效modifier/别名 |
| 8 | RuntimeValidator PowerCalculation | 合法/null/缺失heroId/负power/版本不一致/空摘要/delta/过大power |
| 9 | RuntimeValidator TeamPower | 合法/null/缺失correlationId/幂和不匹配 |
| 10 | RuntimeValidator Batch | 合法/null/计数不一致/负totalPower/缺失correlationId |
| 11 | SaveMigration V5→V6 | 步骤注册/迁移成功/快照字段/V6无需迁移 |
| 12 | V5→V6 兼容性 | 空heroProgress/部分快照补全/V0→V6全程/重算标记 |
| 13 | DomainEventBus | HERO_POWER_RECALCULATED 事件/团队事件/correlationId追踪/getRecentEvents |
| 14 | SaveValidator V6 | V6合法容器/快照存在/版本号超限warning |
| 15 | 边界情况 | Lv1000/50英雄批量/无轨道英雄/负数装备/快照恢复/大对比 |

---

## 6. 兼容性声明

- ✅ **Phase4A PowerSystem V1 接口不变**：`calculateHeroPower(input: HeroPowerInput): number` 保持不变
- ✅ **Phase7-Step5 ProgressSystem 接口不变**：多轨成长接口不受影响
- ✅ **所有新增字段 optional**：`powerFormulaSnapshot?` 在 SaveContainer 中为可选
- ✅ **旧存档自动升级**：V5 及以下存档自动迁移至 V6
- ✅ **纯逻辑层实现**：无 UI/Canvas/Camera 依赖，Portrait 竖版兼容
- ✅ **DomainEventBus 事件兼容**：事件发布失败不影响主流程

---

## 7. 使用方式

### 初始化（应用启动时）

```typescript
// 1. 加载 V2 公式配置
const powerSystem = PowerSystem.getInstance();
powerSystem.loadFormulaConfigs([
  { id: 'POWER_FORMULA_V1', version: 1, effectiveFromSaveVersion: 0,
    statWeights: { hp: 0.5, atk: 2.0, def: 1.0, speed: 0.3 },
    modifiers: [], rounding: 'round' },
]);

// 2. 或从存档恢复
powerSystem.restoreFormulaConfigsFromSnapshot(
  container.powerFormulaSnapshot.formulas,
  container.powerFormulaSnapshot.activeFormulaVersion,
);
```

### 计算英雄战力

```typescript
const result = powerSystem.calculateHeroPowerV2({
  heroId: 'hero_001',
  heroProgress: progressSystem.getHeroProgressV2('hero_001'),
  equipmentPower: equipmentSystem.calculateFullHeroPower('hero_001'),
});
console.log(result.power, result.inputSummary);
```

### 对比公式版本

```typescript
const compare = powerSystem.compareFormulaVersions({
  heroId: 'hero_001',
  heroProgress: state,
  equipmentPower: 200,
  versions: [1, 2, 3],
});
console.log(compare.diffs); // 版本间差异
```

### 运行测试

```
Phase7Step6DebugRunner.runAll()
```

---

## 版本链更新

```
V0 → V1 → V2 → V3 → V4 → V5 → V6
                                ↑
                  Phase7-Step6 新增
                  powerFormulaSnapshot
```

---

**完成标准检查**:
- ✅ calculateHeroPowerV2 / calculateTeamPowerV2 / recalculateBatchFull 可正常使用
- ✅ Validator 覆盖 PowerCalculation
- ✅ SaveMigration V5→V6 自动迁移旧存档
- ✅ Phase7Step6DebugRunner 15组测试就绪
- ✅ 文档已生成
