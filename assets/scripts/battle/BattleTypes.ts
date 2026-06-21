// ============================================================
// BattleTypes.ts — 战斗系统基础枚举与轻量类型
// 职责： BattleUnitType / BattlePosition / BattleState
// 位置： battle/ 层，零依赖
// 规范： TypeScript enum + interface，禁止 any
// ============================================================

// ==================== 战斗单元类型 ====================

/**
 * 战斗单元类型
 *
 * Hero  — 我方角色（HeroConfig → BattleUnit）
 * Enemy — 敌方普通/精英（EnemyConfig.enemyType = 'normal' | 'elite'）
 * Boss  — 敌方 Boss（EnemyConfig.enemyType = 'boss'）
 */
export enum BattleUnitType {
  Hero = 'Hero',
  Enemy = 'Enemy',
  Boss = 'Boss',
}

// ==================== 站位 ====================

/**
 * 战斗站位
 *
 * 阵型定义（对齐 04-combat-system.md）：
 *   前排 (row = 0):  2 槽位 (column = 0, 1) → 坦克 + 战士
 *   后排 (row = 1):  3 槽位 (column = 0, 1, 2) → 法师 + 辅助 + 刺客
 *
 *   index: 全局槽位索引 0~4，按 (row, column) 展开:
 *     (0,0) → 0,  (0,1) → 1,
 *     (1,0) → 2,  (1,1) → 3,  (1,2) → 4
 */
export interface BattlePosition {
  /** 行：0 = 前排, 1 = 后排 */
  row: number;
  /** 列：0 ~ 2 */
  column: number;
  /** 全局槽位索引：0 ~ 4 */
  index: number;
}

// ==================== 战斗状态 ====================

/**
 * 战斗状态机
 *
 * Ready → Fighting → Victory  (→ 下一关)
 *                  → Defeat   (→ 结算)
 *        Fighting → Paused    (→ 暂停/广告)
 *        Paused   → Fighting  (→ 继续)
 */
export enum BattleState {
  /** 准备中（加载资源/初始化） */
  Ready = 'Ready',
  /** 战斗中 */
  Fighting = 'Fighting',
  /** 暂停（切后台/广告） */
  Paused = 'Paused',
  /** 胜利 */
  Victory = 'Victory',
  /** 失败 */
  Defeat = 'Defeat',
}

// ==================== 辅助类型 ====================

/** 目标选择标记 */
export type TargetSide = 'player' | 'enemy';

/** 行动类型（预留，供后续技能系统使用） */
export type ActionType = 'attack' | 'skill' | 'idle';

// ==================== 战斗结算结果类型 ====================

/**
 * 战斗结算结果类型
 *
 * 与 BattleState 的关系（两者语义不同）：
 *   BattleState       — 运行时状态机（Ready → Fighting → Victory/Defeat/Paused）
 *   BattleResultType  — 终局分类（结算 UI / SaveManager / 关卡系统 使用）
 *
 * 映射：
 *   BattleState.Victory                             → Victory
 *   BattleState.Defeat + 玩家全灭                    → Defeat
 *   BattleState.Defeat + 超时 (maxBattleDurationMs)  → Timeout
 *   玩家手动终止 / stopBattle()                        → ManualStop
 */
export enum BattleResultType {
  /** 胜利 — 敌方全灭 */
  Victory = 'Victory',
  /** 败北 — 我方全灭 */
  Defeat = 'Defeat',
  /** 超时 — 超过 maxBattleDurationMs 强制判负 */
  Timeout = 'Timeout',
  /** 手动终止 — 玩家主动退出 / 切后台终止 */
  ManualStop = 'ManualStop',
}
