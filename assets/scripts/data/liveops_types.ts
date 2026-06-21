// ============================================================
// liveops_types.ts — Phase7-Step7 运营活动系统类型定义
// 职责：定义 LiveOpsConfig / LiveOpsState 等核心类型
// 规范：仅定义数据结构，不包含业务逻辑；所有字段为 optional 兼容
// ============================================================

// ---- LiveOpsConfig ----

/**
 * 运营活动配置。
 *
 * 运营活动有明确的开始/结束时间。
 * eventPoolRefs 指向活动期间可用的事件池。
 * rewardPoolRefs 指向活动期间可用的奖励池。
 */
export interface LiveOpsConfig {
  /** 活动唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 活动开始时间戳（Unix） */
  startTime: number;
  /** 活动结束时间戳（Unix） */
  endTime: number;
  /** 事件池引用列表 */
  eventPoolRefs: string[];
  /** 奖励池引用列表 */
  rewardPoolRefs: string[];
  /** 标签（用于分组过滤） */
  tags?: string[];
}

// ---- LiveOpsState ----

/**
 * 运营活动运行时状态。
 *
 * 持久化到存档中，记录当前活跃的活动 ID 列表。
 */
export interface LiveOpsState {
  /** 当前活跃的活动 ID 列表 */
  activeEventIds: string[];
  /** 上次刷新时间戳（Unix） */
  lastRefreshAt: number;
}

// ---- 工厂函数 ----

/** 创建默认的 LiveOpsState */
export function createDefaultLiveOpsState(): LiveOpsState {
  return {
    activeEventIds: [],
    lastRefreshAt: 0,
  };
}
