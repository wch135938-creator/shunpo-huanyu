// ============================================================
// power_types.ts — Phase7-Step6 战力重算系统类型定义
// 职责：定义 HeroPowerInput/HeroPowerResult / TeamPowerInput/TeamPowerResult /
//        PowerRecalculateBatchInput/Result / FormulaCompareInput/Result 等 V2 类型
// 规范：所有类型与现有 PowerSystem / DomainEventBus / SaveMigration 兼容
// ============================================================

import type { HeroProgressStateV2, PowerFormulaConfigV2 } from './roguelike_types';
import type { CorrelationId } from './roguelike_types';

// ==================== 单英雄战力计算 ====================

/**
 * 单英雄战力计算输入（V2）。
 *
 * 与 Phase4A HeroPowerInput 的关键区别：
 * - 使用 HeroProgressStateV2（多轨）替代 levelConfig
 * - 装备战力由外部（EquipmentSystem）提供，不内嵌
 */
export interface HeroPowerInputV2 {
  /** 英雄 ID */
  heroId: string;
  /** 英雄多轨成长状态 */
  heroProgress: HeroProgressStateV2;
  /** 装备战力汇总（由 EquipmentSystem 计算后传入） */
  equipmentPower: number;
}

/**
 * 单英雄战力计算结果（V2）。
 */
export interface HeroPowerResult {
  /** 英雄 ID */
  heroId: string;
  /** 计算出的战力值 */
  power: number;
  /** 使用的公式版本号 */
  formulaVersion: number;
  /** 输入属性摘要（stat → value） */
  inputSummary: Record<string, number>;
  /** 输出属性摘要（stat → weighted value） */
  outputSummary: Record<string, number>;
  /** 与上次计算结果的差异（重算场景） */
  delta?: number;
}

// ==================== 团队战力计算 ====================

/**
 * 团队战力计算输入（V2）。
 */
export interface TeamPowerInputV2 {
  /** 英雄 ID 列表 */
  heroIds: string[];
  /** 英雄 ID → 多轨成长状态 */
  heroProgressMap: Record<string, HeroProgressStateV2>;
  /** 英雄 ID → 装备战力 */
  equipmentPowerMap: Record<string, number>;
}

/**
 * 团队战力计算结果（V2）。
 */
export interface TeamPowerResult {
  /** 团队总战力 */
  totalPower: number;
  /** 各英雄单独计算结果 */
  individualResults: HeroPowerResult[];
  /** 关联 ID（用于事件追踪） */
  correlationId: CorrelationId;
}

// ==================== 批量战力重算 ====================

/**
 * 批量战力重算输入。
 *
 * 用途：
 * - 迁移后全量重算（recalculateAll）
 * - 懒重算（lazy recalc，仅重算标记为脏的英雄）
 * - 指定英雄批量重算
 */
export interface PowerRecalculateBatchInput {
  /** 需要重算的英雄 ID 列表（可选，不提供则重算全部） */
  heroIds?: string[];
  /** 重算原因（用于审计） */
  reason: PowerRecalculateReason;
  /** 关联 ID（可选，用于事件追踪） */
  correlationId?: CorrelationId;
  /** 是否强制使用最新公式版本重算（默认 true） */
  forceLatestFormula?: boolean;
}

/** 战力重算原因 */
export type PowerRecalculateReason =
  | 'migration'
  | 'formula_version_change'
  | 'equipment_change'
  | 'hero_progress_change'
  | 'manual'
  | 'lazy_recalc';

/**
 * 批量战力重算结果。
 */
export interface PowerRecalculateBatchResult {
  /** 是否全部成功 */
  success: boolean;
  /** 重算的英雄数量 */
  heroCount: number;
  /** 各英雄重算结果 */
  heroResults: HeroPowerResult[];
  /** 重算前总战力（如果提供） */
  oldTotalPower?: number;
  /** 重算后总战力 */
  newTotalPower: number;
  /** 总战力变化 */
  totalPowerDelta?: number;
  /** 跳过的英雄数（配置缺失等） */
  skippedCount: number;
  /** 跳过的英雄 ID 列表 */
  skippedHeroIds: string[];
  /** 错误信息列表 */
  errors: string[];
  /** 使用的公式版本号 */
  formulaVersion: number;
  /** 关联 ID */
  correlationId: CorrelationId;
  /** 重算原因 */
  reason: PowerRecalculateReason;
}

// ==================== 公式版本对比 ====================

/**
 * 公式版本对比输入。
 */
export interface FormulaCompareInput {
  /** 英雄 ID */
  heroId: string;
  /** 英雄多轨成长状态 */
  heroProgress: HeroProgressStateV2;
  /** 装备战力 */
  equipmentPower: number;
  /** 需要对比的公式版本列表 */
  versions: number[];
}

/**
 * 单个公式版本的战力计算结果摘要。
 */
export interface FormulaVersionSummary {
  /** 公式版本号 */
  formulaVersion: number;
  /** 战力值 */
  power: number;
  /** 输入属性摘要 */
  inputSummary: Record<string, number>;
  /** 输出属性摘要 */
  outputSummary: Record<string, number>;
}

/**
 * 公式版本对比结果。
 */
export interface FormulaCompareResult {
  /** 英雄 ID */
  heroId: string;
  /** 各版本计算结果 */
  versionResults: FormulaVersionSummary[];
  /** 最高战力版本 */
  highestPowerVersion: number;
  /** 最低战力版本 */
  lowestPowerVersion: number;
  /** 版本间差异摘要 */
  diffs: FormulaVersionDiff[];
  /** 使用的输入属性摘要（所有版本共用） */
  baseInputSummary: Record<string, number>;
}

/** 公式版本间差异 */
export interface FormulaVersionDiff {
  /** 版本 A */
  versionA: number;
  /** 版本 B */
  versionB: number;
  /** 战力差异（A.power - B.power） */
  powerDelta: number;
  /** 差异百分比（相对于 B） */
  powerDeltaPercent: number;
}

// ==================== 公式配置快照（存档用） ====================

/**
 * 战力公式配置快照。
 *
 * 存储在 SaveContainer 中，用于：
 * - 迁移时确定应使用的公式版本
 * - 审计历史战力计算
 * - 懒重算时判断是否需要更新
 */
export interface PowerFormulaSnapshot {
  /** 当前活跃的公式版本号 */
  activeFormulaVersion: number;
  /** 公式配置数组完整快照 */
  formulas: PowerFormulaConfigV2[];
  /** 快照保存时间戳 */
  savedAt: number;
}

// ==================== 工厂函数 ====================

/**
 * 创建默认的战力公式配置快照。
 */
export function createDefaultPowerFormulaSnapshot(): PowerFormulaSnapshot {
  const defaultFormula: PowerFormulaConfigV2 = {
    id: 'POWER_FORMULA_DEFAULT',
    version: 1,
    effectiveFromSaveVersion: 0,
    statWeights: {
      hp: 0.5,
      atk: 2.0,
      def: 1.0,
      speed: 0.3,
    },
    modifiers: [],
    rounding: 'round',
  };

  return {
    activeFormulaVersion: 1,
    formulas: [defaultFormula],
    savedAt: Date.now(),
  };
}

/**
 * 创建空的 TeamPowerResult。
 */
export function createEmptyTeamPowerResult(correlationId: CorrelationId): TeamPowerResult {
  return {
    totalPower: 0,
    individualResults: [],
    correlationId,
  };
}
