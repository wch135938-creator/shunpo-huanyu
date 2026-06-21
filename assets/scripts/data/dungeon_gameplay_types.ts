// ============================================================
// dungeon_gameplay_types.ts — Phase6-Step6 DungeonGameplay 类型定义
// 职责：定义层数挑战、战斗模拟、运行状态等数据结构
// 规范：仅定义数据结构，不包含业务逻辑
// ============================================================

import type { DropResultData } from './drop_types';
import type { DungeonRewardData } from './dungeon_data';

// ---- 层数战斗模拟结果 ----

/** 单层战斗模拟结果 */
export interface LayerBattleResult {
  /** 层数序号（1-based） */
  layerIndex: number;
  /** 是否胜利 */
  victory: boolean;
  /** 我方战力 */
  playerPower: number;
  /** 敌方战力 */
  enemyPower: number;
  /** 造成的伤害比（0~1，1=击杀全部敌人） */
  damageDealtRatio: number;
  /** 承受的伤害比（0~1，1=全灭） */
  damageTakenRatio: number;
  /** 模拟回合数 */
  roundsSimulated: number;
  /** 是否触发 Boss 战 */
  isBossLayer: boolean;
}

// ---- 层数结算结果 ----

/** 推进一层的结算结果 */
export interface LayerAdvanceResult {
  /** 是否可继续推进 */
  canContinue: boolean;
  /** 战斗结果 */
  battleResult: LayerBattleResult;
  /** 本层掉落（胜利时有效） */
  layerDrop: DropResultData | null;
  /** 是否为最后一层 */
  isLastLayer: boolean;
}

// ---- DungeonGameplay 运行状态 ----

/** 单个地牢的玩法运行状态 */
export interface DungeonGameplayState {
  /** 地牢 ID */
  dungeonId: number;
  /** 玩家 ID */
  playerId: string;
  /** 当前层数（1-based，0=未开始） */
  currentLayer: number;
  /** 总层数 */
  totalLayers: number;
  /** 已清除的层数列表 */
  clearedLayers: number[];
  /** 各层战斗结果 */
  layerResults: LayerBattleResult[];
  /** 各层已领取的掉落（已通过 DropSystem.claimDrop 发放） */
  claimedDrops: DropResultData[];
  /** 运行开始时间戳 */
  runStartTime: number;
  /** 是否为 Boss 层（当前层） */
  currentLayerIsBoss: boolean;
  /** 是否激活 */
  isActive: boolean;
  /** 是否已完成（通关） */
  isCompleted: boolean;
  /** 是否已失败 */
  isFailed: boolean;
  /** 失败原因 */
  failReason?: string;
}

// ---- 战力对比配置 ----

/** 层数战力对比配置 */
export interface LayerPowerConfig {
  /** 基础敌我战力比（敌方战力 = 我方战力 × 此系数） */
  baseEnemyPowerRatio: number;
  /** 每层敌方战力增长系数（累乘：baseEnemyPowerRatio × (1 + layerGrowthRate)^(layer-1)） */
  layerGrowthRate: number;
  /** Boss 层战力加成倍率（在第 totalLayers 层应用） */
  bossPowerMultiplier: number;
  /** 战斗结果随机波动范围（0~1，如 0.15 = ±15%） */
  randomVariance: number;
  /** 我方战力高于敌方此倍数时必定胜利 */
  guaranteedWinRatio: number;
  /** 敌方战力高于我方此倍数时必定失败 */
  guaranteedLossRatio: number;
}

// ---- 工厂函数 ----

/** 创建默认层数战力配置 */
export function createDefaultLayerPowerConfig(): LayerPowerConfig {
  return {
    baseEnemyPowerRatio: 1.0,
    layerGrowthRate: 0.12,
    bossPowerMultiplier: 2.0,
    randomVariance: 0.15,
    guaranteedWinRatio: 1.5,
    guaranteedLossRatio: 0.4,
  };
}

/** 创建默认 DungeonGameplayState */
export function createDefaultGameplayState(
  dungeonId: number,
  playerId: string,
  totalLayers: number,
): DungeonGameplayState {
  return {
    dungeonId,
    playerId,
    currentLayer: 1,
    totalLayers,
    clearedLayers: [],
    layerResults: [],
    claimedDrops: [],
    runStartTime: Date.now(),
    currentLayerIsBoss: totalLayers <= 1,
    isActive: true,
    isCompleted: false,
    isFailed: false,
  };
}
