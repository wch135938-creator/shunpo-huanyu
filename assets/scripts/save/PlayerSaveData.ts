// ============================================================
// PlayerSaveData — 玩家存档数据结构
// 职责：定义玩家核心数据的持久化字段
// 位置：Save 层
// ============================================================

export interface PlayerSaveData {
  /** 当前玩家等级 */
  level: number;
  /** 当前经验值 */
  exp: number;
  /** 当前关卡 ID */
  stageId: number;
  /** 战力 */
  combatPower: number;
}
