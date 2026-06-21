// ============================================================
// progress_types.ts — Phase7-Step5 多轨成长系统类型定义
// 职责：定义 ApplyExpInput、ProgressResult、ProgressTrackConfig 等新类型
// 规范：所有类型为 optional 兼容，不破坏现有接口
// ============================================================

import type { ProgressTrackState, HeroProgressStateV2, StatModifierRule } from './roguelike_types';

// ==================== 配置类型 ====================

/**
 * 成长轨道配置。
 *
 * 每个轨道定义了最大等级、经验表和属性修正规则。
 * ProgressSystem 使用此配置驱动多轨成长计算。
 */
export interface ProgressTrackConfig {
  /** 轨道唯一 ID */
  trackId: string;
  /** 最大等级 */
  maxLevel: number;
  /** 经验表：level（当前等级）→ requiredExp（升至下一级所需经验） */
  expTable: Record<number, number>;
  /** 公式引用（公式驱动时使用） */
  formula?: string;
  /** 每级属性修正规则 */
  statModifiers: StatModifierRule[];
  /** 轨道配置版本号 */
  version: number;
}

// ==================== 输入类型 ====================

/**
 * 单英雄单轨道经验更新输入。
 */
export interface ApplyExpInput {
  /** 英雄 ID */
  heroId: string;
  /** 轨道 ID */
  trackId: string;
  /** 经验增量 */
  exp: number;
  /** 关联 ID（可选，不提供则自动生成） */
  correlationId?: string;
}

/**
 * 批量经验更新输入。
 */
export interface ApplyExpBatchInput {
  /** 批量更新条目列表 */
  entries: ApplyExpInput[];
  /** 关联 ID（可选，不提供则自动生成） */
  correlationId?: string;
}

/**
 * 成长重算输入。
 */
export interface RecalculateProgressInput {
  /** 需要重算的英雄 ID 列表（可选，不提供则重算全部） */
  heroIds?: string[];
  /** 关联 ID（可选，用于追踪） */
  correlationId?: string;
}

// ==================== 输出类型 ====================

/**
 * 单轨道变更结果。
 */
export interface ProgressTrackResult {
  /** 轨道 ID */
  trackId: string;
  /** 变更前等级 */
  oldLevel: number;
  /** 变更后等级 */
  newLevel: number;
  /** 经验变化量 */
  expChange: number;
  /** 本次解锁的里程碑 ID 列表 */
  milestonesUnlocked: string[];
}

/**
 * applyExp 返回结果。
 */
export interface ProgressResult {
  /** 英雄 ID */
  heroId: string;
  /** 关联 ID */
  correlationId: string;
  /** 本次应用的经验总量 */
  expApplied: number;
  /** 各轨道变更结果 */
  tracks: ProgressTrackResult[];
  /** 总升级次数 */
  levelUpCount: number;
  /** 总解锁里程碑数 */
  totalMilestonesUnlocked: number;
  /** 属性变化摘要（stat → delta） */
  attributeSummary: Record<string, number>;
  /** 英雄累计获得总经验 */
  totalExpReceived: number;
  /** 更新时间戳 */
  updatedAt: number;
}

// ==================== 工厂函数 ====================

/**
 * 创建默认的 ProgressTrackConfig。
 */
export function createDefaultProgressTrackConfig(
  trackId: string,
  overrides?: Partial<ProgressTrackConfig>,
): ProgressTrackConfig {
  return {
    trackId,
    maxLevel: 100,
    expTable: {},
    statModifiers: [],
    version: 1,
    ...overrides,
  };
}

/**
 * 创建默认的 ProgressTrackState。
 */
export function createDefaultProgressTrackState(
  trackId: string,
  version: number = 1,
): ProgressTrackState {
  return {
    trackId,
    level: 1,
    exp: 0,
    unlockedMilestoneIds: [],
    version,
  };
}

/**
 * 创建默认的 HeroProgressStateV2。
 */
export function createDefaultHeroProgressStateV2(heroId: string): HeroProgressStateV2 {
  return {
    heroId,
    tracks: {},
    totalExpReceived: 0,
    updatedAt: Date.now(),
  };
}
