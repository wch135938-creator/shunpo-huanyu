// ============================================================
// reward_types.ts — Phase8-Step4 奖励动画与多来源结算类型定义
// 职责：定义奖励序列动画、飞字、保底可视化、多来源排序、一致性校验等类型
// 规范：仅定义数据结构，不包含业务逻辑
// ============================================================

import type { RewardDisplayItem } from './phase8_ui_types';
import type { RewardGrant, RewardSource } from './roguelike_types';

// ==================== 多来源排序 ====================

/**
 * 奖励来源优先级映射。
 *
 * 用于多来源奖励结算时按优先级排序，保证 Boss 奖励最先结算、Event 次之。
 * 数值越大优先级越高。
 */
export const RewardSourcePriority: Record<string, number> = {
  dungeon_boss: 100,
  dungeon_event: 80,
  dungeon_node: 60,
  quest: 40,
  achievement: 30,
  shop: 20,
  compensation: 10,
  season: 5,
};

/** 带排序信息的奖励来源 */
export interface RewardSourceOrdered extends RewardSource {
  /** 排序优先级（数值越大越优先） */
  priority: number;
  /** 排序后位置（0-based） */
  orderIndex: number;
}

/** 对奖励来源数组按优先级排序 */
export function orderRewardSources(sources: RewardSource[]): RewardSourceOrdered[] {
  const sorted = [...sources].sort((a, b) => {
    const pa = RewardSourcePriority[a.sourceType] ?? 0;
    const pb = RewardSourcePriority[b.sourceType] ?? 0;
    return pb - pa; // 降序：高优先级在前
  });

  return sorted.map((s, i) => ({
    ...s,
    priority: RewardSourcePriority[s.sourceType] ?? 0,
    orderIndex: i,
  }));
}

// ==================== 飞字动画 ====================

/** 飞字动画配置 */
export interface FlyTextConfig {
  /** 显示文本（如 "+100 金币"） */
  text: string;
  /** 起始世界坐标 */
  worldPosition: { x: number; y: number };
  /** 动画持续时长（秒） */
  duration: number;
  /** 文本颜色（hex 字符串，如 "#FFD700"） */
  color?: string;
  /** 字体大小 */
  fontSize?: number;
  /** 起始透明度 */
  startOpacity?: number;
}

/** 创建默认飞字配置 */
export function createDefaultFlyTextConfig(): FlyTextConfig {
  return {
    text: '',
    worldPosition: { x: 0, y: 0 },
    duration: 0.5,
  };
}

// ==================== 奖励序列动画 ====================

/** 奖励序列动画数据 */
export interface RewardSequenceEvent {
  /** 按优先级排序后的奖励列表 */
  rewards: RewardDisplayItem[];
  /** 对应的飞字配置列表 */
  flyTextConfigs: FlyTextConfig[];
  /** 本次结算是否触发了保底 */
  pityTriggered: boolean;
  /** 保底触发的奖励（pityTriggered=true 时有效） */
  pityReward?: RewardDisplayItem;
  /** 保底规则 ID（pityTriggered=true 时有效） */
  pityRuleId?: string;
  /** 所属运行 ID */
  runId: string;
  /** 结算来源数量 */
  sourceCount: number;
}

/** 奖励序列播放配置（所有动画时长从配置读取，提供默认值兜底） */
export interface RewardSequenceConfig {
  /** 奖励项入场交错延迟（秒） */
  staggerDelay: number;
  /** 入场缩放动画时长（秒） */
  scaleInDuration: number;
  /** 飞字飞行距离（像素） */
  flyDistance: number;
  /** 飞字淡入时长（秒） */
  fadeInDuration: number;
  /** 飞字飞行+淡出时长（秒） */
  flyDuration: number;
  /** 计数器缓动时长（秒） */
  counterDuration: number;
  /** 增量光效脉冲缩放倍率 */
  glowPulseScale: number;
  /** 增量光效脉冲时长（秒） */
  glowPulseDuration: number;
}

/** 创建默认奖励序列播放配置 */
export function createDefaultRewardSequenceConfig(): RewardSequenceConfig {
  return {
    staggerDelay: 0.08,
    scaleInDuration: 0.2,
    flyDistance: 80,
    fadeInDuration: 0.15,
    flyDuration: 0.5,
    counterDuration: 0.3,
    glowPulseScale: 1.15,
    glowPulseDuration: 0.15,
  };
}

// ==================== 保底可视化 ====================

/** 单条保底计数器可视化数据 */
export interface PityCounterVisualData {
  /** 来源类型 */
  sourceType: string;
  /** 当前计数 */
  current: number;
  /** 触发阈值 */
  threshold: number;
  /** 完成百分比（0~100） */
  percentage: number;
}

/** 保底可视化完整数据 */
export interface PityVisualData {
  /** 所有活跃的保底计数器 */
  counters: PityCounterVisualData[];
  /** 最近触发的保底规则 ID */
  lastTriggeredRule?: string;
  /** 最近触发时间戳 */
  lastTriggeredAt?: number;
}

// ==================== 奖励一致性校验 ====================

/** 单条一致性校验结果 */
export interface RewardConsistencyCheck {
  /** 期望值（从 SettlementResult 聚合） */
  expected: number;
  /** 实际值（从 DropHistoryRecord.rewards 聚合） */
  actual: number;
  /** 来源标识 */
  sourceId: string;
  /** 校验字段（如 "gold", "exp", "equipment", "items"） */
  field: string;
  /** 是否通过 */
  passed: boolean;
  /** 差异描述（未通过时填充） */
  reason?: string;
}

/** 奖励一致性校验完整结果 */
export interface RewardVerificationResult {
  /** 所有校验条目 */
  checks: RewardConsistencyCheck[];
  /** 是否全部通过 */
  allPassed: boolean;
  /** 校验执行时间戳 */
  timestamp: number;
  /** 总奖励条目数 */
  totalRewards: number;
  /** 总校验条目数 */
  totalChecks: number;
}

/** 创建空校验结果 */
export function createEmptyRewardVerificationResult(): RewardVerificationResult {
  return {
    checks: [],
    allPassed: true,
    timestamp: Date.now(),
    totalRewards: 0,
    totalChecks: 0,
  };
}

// ==================== 保底触发数据 ====================

/** 保底触发通知数据（供 UI 层消费） */
export interface PityTriggerData {
  /** 来源类型 */
  sourceType: string;
  /** 保底规则 ID */
  ruleId: string;
  /** 触发时的计数 */
  triggerCount: number;
  /** 保底额外奖励 */
  bonusReward: RewardGrant;
  /** 触发时间戳 */
  triggeredAt: number;
}

// ==================== 奖励动画状态 ====================

/** 奖励动画播放状态 */
export enum RewardAnimationState {
  /** 等待播放 */
  Idle = 'idle',
  /** 正在播放奖励序列 */
  Playing = 'playing',
  /** 正在播放飞字 */
  FlyingText = 'flyingText',
  /** 正在播放保底特效 */
  PityEffect = 'pityEffect',
  /** 播放完成 */
  Completed = 'completed',
}

/** HUD 计数器动画状态 */
export interface HUDCounterState {
  /** 当前显示的金币值 */
  displayedGold: number;
  /** 当前显示的经验值 */
  displayedExp: number;
  /** 目标金币值 */
  targetGold: number;
  /** 目标经验值 */
  targetExp: number;
  /** 是否正在播放金币动画 */
  goldAnimating: boolean;
  /** 是否正在播放经验动画 */
  expAnimating: boolean;
}

/** 创建默认 HUD 计数器状态 */
export function createDefaultHUDCounterState(): HUDCounterState {
  return {
    displayedGold: 0,
    displayedExp: 0,
    targetGold: 0,
    targetExp: 0,
    goldAnimating: false,
    expAnimating: false,
  };
}
