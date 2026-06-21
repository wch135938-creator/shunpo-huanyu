// ============================================================
// BattleResult.ts — 战斗结算数据结构
// 职责：定义 BattleReward / BattleExecutionResult / BattleResult
// 位置：battle/ 层
// 依赖：BattleTypes (BattleResultType), drop_config (ItemType)
// 规范：零 any / 仅接口定义 / 不实现逻辑
// ============================================================

import { BattleResultType } from './BattleTypes';
import type { ItemType } from '../config/drop_config';

// ==================== BattleReward ====================

/** 奖励来源 */
export type RewardSource = 'drop' | 'first_clear' | 'ad';

/**
 * 单条战斗奖励
 *
 * 由 BattleManager 根据 DropConfig 掉落判定生成。
 * 一组 BattleReward[] 构成一场战斗的完整掉落列表。
 *
 * 使用示例：
 *   const reward: BattleReward = {
 *     itemId: 'ITEM_HEALING_PILL',
 *     itemType: 'material',
 *     count: 3,
 *     source: 'drop',
 *   };
 */
export interface BattleReward {
  /** 物品 ID
   *   - 货币类: "GOLD", "EXP", "DIAMOND"
   *   - 装备类: "EQUIP_XXX"
   *   - 材料类: "ITEM_XXX"
   *   - 抽卡券: "GACHA_TICKET", "GACHA_FRAG_XXX" */
  itemId: string;
  /** 物品类型，复用 DropConfig.ItemType */
  itemType: ItemType;
  /** 获得数量 */
  count: number;
  /** 来源标识（MVP 阶段均为 'drop'） */
  source: RewardSource;
}

// ==================== BattleExecutionResult ====================

/**
 * 战斗执行结果（BattleSystem 原始输出）
 *
 * BattleSystem 只返回战斗中实际发生的数据，
 * 不包含任何奖励 / 掉落 / 结算逻辑。
 *
 * BattleManager 收到此数据后，结合 DropConfig 组装最终 BattleResult。
 */
export interface BattleExecutionResult {
  /** 关卡 ID */
  stageId: string;
  /** 终局类型 */
  resultType: BattleResultType;
  /** 战斗耗时（毫秒） */
  elapsedTimeMs: number;
  /** 总回合数 */
  round: number;
  /** 被击杀的敌人 configId 列表 */
  killedEnemyIds: string[];
}

// ==================== BattleResult ====================

/**
 * 最终战斗结算结果（BattleManager 组装输出）
 *
 * 由 BattleManager 在收到 BattleExecutionResult 后，
 * 结合 DropConfig 掉落判定组装而成。
 *
 * 消费者：
 *   - SaveManager    → 持久化奖励变更
 *   - 结算 UI        → 展示奖励弹窗
 *   - 关卡系统       → 解锁下一关
 *   - 成长系统       → 计算战力变化 / 经验累计
 *
 * 使用示例：
 *   const result: BattleResult = {
 *     stageId: 'STAGE_005',
 *     isVictory: true,
 *     resultType: BattleResultType.Victory,
 *     elapsedTimeMs: 45320,
 *     round: 12,
 *     killedEnemyIds: ['ENEMY_SLIME_01', 'ENEMY_SLIME_02'],
 *     rewards: [...],
 *     expGain: 150,
 *     goldGain: 200,
 *     powerGain: 0,
 *   };
 */
export interface BattleResult {
  /** 关卡 ID */
  stageId: string;
  /** 是否胜利（便捷字段：resultType === Victory） */
  isVictory: boolean;
  /** 终局类型 */
  resultType: BattleResultType;
  /** 战斗耗时（毫秒） */
  elapsedTimeMs: number;
  /** 总回合数 */
  round: number;
  /** 被击杀的敌人 configId 列表 */
  killedEnemyIds: string[];
  /** 战斗奖励列表（由 BattleManager 根据 DropConfig 组装） */
  rewards: BattleReward[];
  /** 经验总收益（rewards 中 exp 类型数量合计） */
  expGain: number;
  /** 金币总收益（rewards 中 gold 类型数量合计） */
  goldGain: number;
  /** 战力变化（MVP 阶段暂为 0，Phase 4 成长系统实现后由 BattleManager 计算） */
  powerGain: number;
}
