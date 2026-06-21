// ============================================================
// BattleData.ts — 战斗容器运行时数据结构
// 职责： 定义 BattleData 接口，承载整场战斗的完整状态
// 位置： battle/ 层
// 依赖： BattleTypes (BattleState), BattleUnit (BattleUnit)
// 规范： 零 any / 仅接口定义 / 不实现逻辑
// ============================================================

import { BattleState } from './BattleTypes';
import { BattleUnit } from './BattleUnit';

// ==================== BattleData ====================

/**
 * 战斗容器 — 描述一场战斗的完整运行时数据
 *
 * 生命周期：
 *   1. BattleSystem 创建 BattleData { stageId, playerUnits, enemyUnits }
 *   2. battleState: Ready → Fighting
 *   3. 每回合 round++, elapsedTimeMs 递增
 *   4. 一方全灭 → Victory / Defeat
 *   5. BattleData 回收（对象池）
 *
 * 使用示例：
 *   const data: BattleData = {
 *     stageId: "STAGE_005",
 *     playerUnits: [...5 heroes],
 *     enemyUnits: [...3 enemies],
 *     battleState: BattleState.Ready,
 *     round: 0,
 *     elapsedTimeMs: 0,
 *   };
 */
export interface BattleData {
  // ===== 关卡关联 =====

  /** 关卡 ID，引用 StageConfig.id */
  stageId: string;

  // ===== 战斗阵容 =====

  /** 我方战斗单元（5 个） */
  playerUnits: BattleUnit[];
  /** 敌方战斗单元（2~4 个，含 Boss） */
  enemyUnits: BattleUnit[];

  // ===== 状态机 =====

  /** 当前战斗状态 */
  battleState: BattleState;

  // ===== 进度 =====

  /** 当前回合数（从 0 开始，首轮递增为 1） */
  round: number;
  /** 已用时间（毫秒） */
  elapsedTimeMs: number;
}
