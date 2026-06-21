// ============================================================
// AnalyticsTypes.ts — Phase9-Step10 分析系统核心类型定义
// 职责：定义分析事件/会话/快照的数据结构与枚举
// 位置：analytics/ 层，零 any / 所有字段可序列化
// ============================================================

// ==================== 分析事件类型枚举 ====================

/**
 * 分析事件类型。
 *
 * 覆盖所有自动事件 + 一个自定义类型用于扩展。
 */
export enum AnalyticsEventType {
  /** 游戏启动 */
  GAME_START = 'game_start',
  /** 游戏退出 */
  GAME_EXIT = 'game_exit',
  /** 战斗开始 */
  BATTLE_START = 'battle_start',
  /** 战斗结束 */
  BATTLE_END = 'battle_end',
  /** 章节完成 */
  CHAPTER_COMPLETE = 'chapter_complete',
  /** 地牢完成 */
  DUNGEON_COMPLETE = 'dungeon_complete',
  /** 新手引导完成 */
  TUTORIAL_COMPLETE = 'tutorial_complete',
  /** 广告观看 */
  AD_WATCH = 'ad_watch',
  /** 自定义事件 */
  CUSTOM = 'custom',
}

// ==================== 分析事件 ====================

/**
 * 单个分析事件。
 *
 * 每个事件有唯一 ID、类型、时间戳、会话绑定和自定义负载。
 * 所有事件均可序列化为 JSON。
 */
export interface AnalyticsEvent {
  /** 事件唯一 ID（UUID v4 格式） */
  id: string;
  /** 事件类型 */
  type: AnalyticsEventType;
  /** 事件发生时间戳（Unix ms） */
  timestamp: number;
  /** 所属会话 ID */
  sessionId: string;
  /** 事件负载（类型相关数据） */
  data: Record<string, unknown>;
}

// ==================== 分析会话 ====================

/**
 * 分析会话。
 *
 * 每次游戏启动到退出为一次会话。
 * 记录会话期间的累计统计数据。
 */
export interface AnalyticsSession {
  /** 会话唯一 ID */
  sessionId: string;
  /** 会话开始时间戳（Unix ms） */
  startTime: number;
  /** 会话结束时间戳（Unix ms，进行中则为 0） */
  endTime: number;
  /** 会话持续时长（ms） */
  durationMs: number;
  /** 会话内事件总数 */
  eventCount: number;
  /** 会话内战斗次数 */
  battleCount: number;
  /** 会话内战斗胜利次数 */
  battlesWon: number;
  /** 会话内完成章节数 */
  chaptersCompleted: number;
  /** 会话内完成地牢数 */
  dungeonsCompleted: number;
  /** 会话内广告观看次数 */
  adsWatched: number;
}

// ==================== 分析快照 ====================

/**
 * 分析快照。
 *
 * 某一时刻的累计统计数据视图。
 * 供调试分析 / 未来 SDK 上报使用。
 */
export interface AnalyticsSnapshot {
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
  /** 当前会话（进行中则为当前会话，无则为 null） */
  currentSession: AnalyticsSession | null;
  /** 最近 N 次已完成会话列表 */
  recentSessions: AnalyticsSession[];
  /** 事件类型计数：type → count */
  eventCountByType: Record<string, number>;
  /** 快照生成时间戳 */
  generatedAt: number;
}

// ==================== 分析系统配置 ====================

/**
 * 分析系统内部配置。
 *
 * 所有数值从外部注入，AnalyticsSystem 本身不硬编码。
 */
export interface AnalyticsSystemConfig {
  /** 内存中事件缓存上限 */
  maxEventBuffer: number;
  /** 快照中保留的最近会话数 */
  maxRecentSessions: number;
  /** 是否启用自动事件监听 */
  autoListenEnabled: boolean;
}

/** 创建默认分析系统配置 */
export function createDefaultAnalyticsSystemConfig(): AnalyticsSystemConfig {
  return {
    maxEventBuffer: 500,
    maxRecentSessions: 20,
    autoListenEnabled: true,
  };
}

// ==================== 工厂函数 ====================

/** 创建 UUID v4 格式的字符串（简化实现） */
export function generateAnalyticsUuid(): string {
  const hex = '0123456789abcdef';
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let result = '';
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (c === 'x') {
      result += hex[Math.floor(Math.random() * 16)];
    } else if (c === 'y') {
      result += hex[(Math.floor(Math.random() * 4)) + 4]; // 4 + random(4 bits)
    } else {
      result += c;
    }
  }
  return result;
}

/** 创建默认分析事件 */
export function createDefaultAnalyticsEvent(
  type: AnalyticsEventType,
  sessionId: string,
  data?: Record<string, unknown>,
): AnalyticsEvent {
  return {
    id: generateAnalyticsUuid(),
    type,
    timestamp: Date.now(),
    sessionId,
    data: data ?? {},
  };
}

/** 创建默认分析会话 */
export function createDefaultAnalyticsSession(sessionId?: string): AnalyticsSession {
  return {
    sessionId: sessionId ?? generateAnalyticsUuid(),
    startTime: Date.now(),
    endTime: 0,
    durationMs: 0,
    eventCount: 0,
    battleCount: 0,
    battlesWon: 0,
    chaptersCompleted: 0,
    dungeonsCompleted: 0,
    adsWatched: 0,
  };
}

/** 创建空分析快照 */
export function createEmptyAnalyticsSnapshot(): AnalyticsSnapshot {
  return {
    totalSessions: 0,
    totalPlayTimeMs: 0,
    totalBattles: 0,
    totalBattlesWon: 0,
    totalChaptersCompleted: 0,
    totalDungeonsCompleted: 0,
    totalAdsWatched: 0,
    currentSession: null,
    recentSessions: [],
    eventCountByType: {},
    generatedAt: Date.now(),
  };
}
