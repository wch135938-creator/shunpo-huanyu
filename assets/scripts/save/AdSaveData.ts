// ============================================================
// AdSaveData — 广告数据存档数据结构
// 职责：定义广告观看记录的持久化字段
// 位置：Save 层
// ============================================================

export interface AdSaveData {
  /** 总观看次数 */
  totalWatched: number;
  /** 今日观看次数 */
  todayWatched: number;
  /** 最后观看日期 'YYYY-MM-DD'（用于跨日重置 todayWatched） */
  lastWatchDate: string;
}
