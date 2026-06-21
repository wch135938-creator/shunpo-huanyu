// ============================================================
// player_progress_data.ts — Phase4A 账号成长与汇总数据定义
// 职责：保存账号等级、最高关卡、总战力缓存与最近成长时间
// 规范：playerLevel 暂不参与战斗属性计算
// ============================================================

/**
 * 账号级成长与汇总状态。
 *
 * 说明：
 * - PlayerProgressData 不是角色属性成长主数据。
 * - totalPower 是阵容总战力缓存。
 * - playerLevel 暂作为账号等级或展示字段，不参与战斗属性计算。
 */
export interface PlayerProgressData {
  /** 账号等级或展示等级，Phase4A 暂不参与战斗属性计算 */
  playerLevel: number;
  /** 账号经验，预留给后续账号等级成长 */
  playerExp: number;
  /** 阵容总战力缓存，由 PowerSystem 汇总 */
  totalPower: number;
  /** 当前最高关卡 ID */
  highestStageId: string;
  /** 最近一次成长时间戳，毫秒 */
  lastGrowthAt: number;
}

