// ============================================================
// dungeon_types.ts — Phase6 地牢系统枚举定义
// 职责：定义 DungeonDifficulty、DungeonRewardType 枚举
// 规范：仅定义枚举，不包含业务逻辑
// ============================================================

/** 地牢难度等级 */
export enum DungeonDifficulty {
  Normal = 'Normal',
  Hard = 'Hard',
  Expert = 'Expert',
}

/** 地牢奖励类型 */
export enum DungeonRewardType {
  Gold = 'Gold',
  Exp = 'Exp',
  Equipment = 'Equipment',
}
