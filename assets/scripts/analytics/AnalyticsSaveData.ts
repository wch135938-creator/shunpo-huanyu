// ============================================================
// AnalyticsSaveData — Phase9-Step10 分析存档数据结构
// 职责：定义分析模块的持久化数据结构
// 位置：analytics/ 层，零 any / 所有字段可序列化
// ============================================================

import type { AnalyticsSession } from './AnalyticsTypes';

// ==================== 分析存档数据 ====================

/**
 * 分析模块存档数据。
 *
 * 通过 SaveManager 的 saveAnalyticsData / loadAnalyticsData
 * 方法对接到 SaveContainerV8.analytics 字段。
 *
 * 持久化的是累计统计 + 最近会话列表，
 * 事件缓存（maxEventBuffer）只在内存中，不落盘。
 */
export interface AnalyticsSaveData {
  /** 总会话数 */
  totalSessions: number;
  /** 累计游玩时长（ms） */
  totalPlayTimeMs: number;
  /** 累计战斗次数 */
  totalBattles: number;
  /** 累计战斗胜利次数 */
  totalBattlesWon: number;
  /** 累计完成章节数 */
  totalChaptersCompleted: number;
  /** 累计完成地牢数 */
  totalDungeonsCompleted: number;
  /** 累计广告观看次数 */
  totalAdsWatched: number;
  /** 最近 N 次已完成会话列表 */
  recentSessions: AnalyticsSession[];
  /** 事件类型计数：type → count */
  eventCountByType: Record<string, number>;
  /** 存档版本号（用于将来迁移） */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

// ==================== 工厂函数 ====================

/** 创建默认分析存档数据 */
export function createDefaultAnalyticsSaveData(): AnalyticsSaveData {
  return {
    totalSessions: 0,
    totalPlayTimeMs: 0,
    totalBattles: 0,
    totalBattlesWon: 0,
    totalChaptersCompleted: 0,
    totalDungeonsCompleted: 0,
    totalAdsWatched: 0,
    recentSessions: [],
    eventCountByType: {},
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}
