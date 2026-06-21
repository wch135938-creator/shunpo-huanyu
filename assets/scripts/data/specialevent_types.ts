// ============================================================
// specialevent_types.ts — Phase7-Step7 特殊事件系统类型定义
// 职责：定义 SpecialEventConfig / SpecialEventState / EventTriggerType 等核心类型
// 规范：仅定义数据结构，不包含业务逻辑；所有字段为 optional 兼容
// ============================================================

// ---- EventCondition ----

/**
 * 特殊事件触发条件。
 *
 * 与 event_types.EventCondition 互补，专用于 SpecialEvent 的条件判断。
 */
export interface SpecialEventCondition {
  /** 条件类型 */
  type:
    | 'minLevel'
    | 'maxLevel'
    | 'minPower'
    | 'hasHero'
    | 'hasItem'
    | 'dungeonClear'
    | 'loginCount'
    | 'custom';
  /** 条件参数 */
  params: Record<string, number | string>;
}

// ---- EventTriggerType ----

/** 特殊事件触发类型 */
export type EventTriggerType =
  | 'login'
  | 'battle'
  | 'dungeon'
  | 'boss'
  | 'liveops';

/** 有效的触发类型值 */
export const VALID_TRIGGER_TYPES: EventTriggerType[] = [
  'login', 'battle', 'dungeon', 'boss', 'liveops',
];

// ---- SpecialEventConfig ----

/**
 * 特殊事件配置。
 *
 * 特殊事件由特定触发器（登录、战斗、地牢、Boss、运营活动）激活。
 * rewardSourceRefs 指向奖励来源，由 DropSystem 统一结算。
 * conditions 为可选触发条件。
 */
export interface SpecialEventConfig {
  /** 事件唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 触发类型 */
  triggerType: EventTriggerType;
  /** 奖励来源引用列表 */
  rewardSourceRefs: string[];
  /** 触发条件列表（可选，全部满足才触发） */
  conditions?: SpecialEventCondition[];
}

// ---- SpecialEventState ----

/**
 * 特殊事件运行时状态。
 *
 * 持久化到存档中，记录各事件是否已完成。
 */
export interface SpecialEventState {
  /** 事件 ID（对应 SpecialEventConfig.id） */
  eventId: string;
  /** 是否已完成 */
  completed: boolean;
  /** 完成时间戳（可选） */
  completedAt?: number;
}

// ---- 工厂函数 ----

/** 创建默认的 SpecialEventState */
export function createDefaultSpecialEventState(eventId: string): SpecialEventState {
  return {
    eventId,
    completed: false,
  };
}
