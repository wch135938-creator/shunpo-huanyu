// ============================================================
// DungeonGameplay — Phase6-Step6 地牢玩法逻辑层
// 职责：层数推进 / 战斗模拟 / 层掉落生成 / 运行状态管理
// 边界：不实现 UI、不直接修改装备、不直接操作存档
//
// 架构位置：
//   DungeonGameplay（本系统）
//     ├── DungeonSystem   — 进入/通关/失败/体力/历史
//     ├── DropSystem      — 层掉落生成与领取
//     ├── ProgressSystem  — 战力读取（战斗模拟）
//     └── EventManager    — 事件派发
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { DungeonSystem } from './DungeonSystem';
import { DropSystem } from './DropSystem';
import { ProgressSystem } from './ProgressSystem';
import type {
  DungeonGameplayState,
  LayerBattleResult,
  LayerAdvanceResult,
  LayerPowerConfig,
} from '../data/dungeon_gameplay_types';
import {
  createDefaultGameplayState,
  createDefaultLayerPowerConfig,
} from '../data/dungeon_gameplay_types';
import type { DropResultData } from '../data/drop_types';
import type { DungeonRewardData } from '../data/dungeon_data';

// ---- 常量 ----

/** 默认玩家 ID */
const DEFAULT_PLAYER_ID = 'player_001';

// ---- 事件接口 ----

/** 跑团开始事件 */
export interface GameplayRunStartedEvent {
  dungeonId: number;
  playerId: string;
  totalLayers: number;
  startTime: number;
}

/** 层战斗模拟完成事件 */
export interface GameplayBattleResolvedEvent {
  dungeonId: number;
  layerIndex: number;
  battleResult: LayerBattleResult;
}

/** 层清除事件 */
export interface GameplayLayerClearedEvent {
  dungeonId: number;
  layerIndex: number;
  drop: DropResultData | null;
  isLastLayer: boolean;
}

/** 层失败事件 */
export interface GameplayLayerFailedEvent {
  dungeonId: number;
  layerIndex: number;
  battleResult: LayerBattleResult;
  reason: string;
}

/** 跑团完成事件 */
export interface GameplayRunCompletedEvent {
  dungeonId: number;
  playerId: string;
  rewards: DungeonRewardData;
  totalLayers: number;
  duration: number;
}

/** 跑团失败事件 */
export interface GameplayRunFailedEvent {
  dungeonId: number;
  playerId: string;
  failedLayer: number;
  reason: string;
  partialRewards: DungeonRewardData | null;
}

export class DungeonGameplay extends BaseSystem {
  // ==================== 事件常量 ====================

  static readonly RUN_STARTED = 'dungeonGameplay:runStarted';
  static readonly BATTLE_RESOLVED = 'dungeonGameplay:battleResolved';
  static readonly LAYER_CLEARED = 'dungeonGameplay:layerCleared';
  static readonly LAYER_FAILED = 'dungeonGameplay:layerFailed';
  static readonly RUN_COMPLETED = 'dungeonGameplay:runCompleted';
  static readonly RUN_FAILED = 'dungeonGameplay:runFailed';

  // ==================== 内部状态 ====================

  /** 当前活跃的游戏状态（按 dungeonId 索引） */
  private _activeRuns: Map<number, DungeonGameplayState> = new Map();

  /** 层数战力配置 */
  private _powerConfig: LayerPowerConfig = createDefaultLayerPowerConfig();

  /** 各依赖系统引用 */
  private _dungeonSystem: DungeonSystem;
  private _dropSystem: DropSystem;
  private _progressSystem: ProgressSystem;
  private _eventManager: EventManager;

  // ==================== 构造 ====================

  constructor() {
    super();
    this._dungeonSystem = DungeonSystem.getInstance();
    this._dropSystem = DropSystem.getInstance();
    this._progressSystem = ProgressSystem.getInstance();
    this._eventManager = EventManager.getInstance();
  }

  // ==================== 初始化 ====================

  /**
   * 验证所有依赖系统配置已加载。
   *
   * DungeonGameplay 本身不需要加载配置文件，
   * 但依赖 DungeonSystem / DropSystem / ProgressSystem 均已初始化。
   */
  isReady(): boolean {
    return this._dungeonSystem.isConfigLoaded()
      && this._dropSystem.isConfigLoaded()
      && this._progressSystem.isConfigLoaded();
  }

  /**
   * 设置层数战力配置（可选，覆盖默认值）。
   *
   * 所有数值从外部传入，禁止硬编码。
   */
  setLayerPowerConfig(config: Partial<LayerPowerConfig>): void {
    this._powerConfig = { ...this._powerConfig, ...config };
  }

  /** 获取当前战力配置（只读） */
  getLayerPowerConfig(): Readonly<LayerPowerConfig> {
    return { ...this._powerConfig };
  }

  // ==================== 核心 API：startRun ====================

  /**
   * 开始一次地牢挑战。
   *
   * 流程：
   * 1. 校验地牢可进入（通过 DungeonSystem）
   * 2. 调用 DungeonSystem.enterDungeon() 消耗体力、创建运行记录
   * 3. 初始化 DungeonGameplayState
   * 4. 派发 dungeonGameplay:runStarted 事件
   *
   * @param dungeonId  地牢 ID
   * @param playerId   玩家 ID
   * @returns          游戏状态；进入失败时返回 null
   */
  startRun(
    dungeonId: number,
    playerId: string = DEFAULT_PLAYER_ID,
  ): DungeonGameplayState | null {
    this._requireReady();

    // 检查是否已有进行中的 run
    if (this._activeRuns.has(dungeonId)) {
      console.warn(`[DungeonGameplay] 地牢 ${dungeonId} 已有进行中的挑战`);
      return null;
    }

    // 获取地牢配置
    const dungeonInfo = this._dungeonSystem.getDungeonInfo(dungeonId);
    if (!dungeonInfo) {
      console.warn(`[DungeonGameplay] 地牢 ${dungeonId} 配置不存在`);
      return null;
    }

    // 调用 DungeonSystem 进入（校验 + 消耗体力 + 创建记录）
    const enterResult = this._dungeonSystem.enterDungeon(dungeonId, playerId);
    if (!enterResult.canEnter) {
      console.warn(`[DungeonGameplay] 无法进入地牢 ${dungeonId}: ${enterResult.blockReason}`);
      return null;
    }

    // 创建游戏状态
    const state = createDefaultGameplayState(
      dungeonId,
      playerId,
      dungeonInfo.config.totalLayers,
    );

    // Boss 层标记
    state.currentLayerIsBoss = dungeonInfo.config.bossConfig !== undefined
      && state.currentLayer === state.totalLayers;

    this._activeRuns.set(dungeonId, state);

    // 派发事件
    this._emitRunStarted({
      dungeonId,
      playerId,
      totalLayers: state.totalLayers,
      startTime: state.runStartTime,
    });

    return state;
  }

  // ==================== 核心 API：advanceLayer ====================

  /**
   * 推进一层：模拟战斗 → 生成掉落 → 更新状态。
   *
   * 流程：
   * 1. 获取当前层战力配置
   * 2. 模拟层战斗（simulateLayerBattle）
   * 3. 若胜利：生成层掉落 → 领取 → 更新进度
   *    - 若已清除所有层：自动触发 completeRun()
   * 4. 若失败：触发 failRun()
   *
   * @param dungeonId  地牢 ID
   * @returns          层推进结果；run 不存在时返回 null
   */
  advanceLayer(dungeonId: number): LayerAdvanceResult | null {
    this._requireReady();

    const state = this._activeRuns.get(dungeonId);
    if (!state) {
      console.warn(`[DungeonGameplay] 地牢 ${dungeonId} 无进行中的 run`);
      return null;
    }

    if (!state.isActive) {
      console.warn(`[DungeonGameplay] 地牢 ${dungeonId} 的 run 已结束`);
      return null;
    }

    const currentLayer = state.currentLayer;
    const isLastLayer = currentLayer >= state.totalLayers;

    // ---- Step 1: 模拟层战斗 ----
    const battleResult = this.simulateLayerBattle(dungeonId, currentLayer);
    state.layerResults.push(battleResult);

    this._emitBattleResolved({
      dungeonId,
      layerIndex: currentLayer,
      battleResult,
    });

    // ---- Step 2: 处理战斗结果 ----
    if (!battleResult.victory) {
      // 失败 → 触发 failRun
      const reason = `第 ${currentLayer} 层战斗失败（我方战力=${battleResult.playerPower}, 敌方战力=${battleResult.enemyPower}）`;
      const partialRewards = this.failRun(dungeonId, reason);

      return {
        canContinue: false,
        battleResult,
        layerDrop: null,
        isLastLayer,
      };
    }

    // ---- Step 3: 胜利 → 生成层掉落 ----
    const layerDrop = this._generateLayerDrop(dungeonId, currentLayer, state.playerId);

    // 领取层掉落
    if (layerDrop) {
      this._dropSystem.claimDrop(layerDrop, state.playerId);
      state.claimedDrops.push(layerDrop);
    }

    // ---- Step 4: 更新状态 ----
    state.clearedLayers.push(currentLayer);

    this._emitLayerCleared({
      dungeonId,
      layerIndex: currentLayer,
      drop: layerDrop,
      isLastLayer,
    });

    // ---- Step 5: 检查是否通关 ----
    if (isLastLayer) {
      // 所有层已清除，触发完整通关
      const rewards = this.completeRun(dungeonId);

      return {
        canContinue: false,
        battleResult,
        layerDrop,
        isLastLayer: true,
      };
    }

    // 推进到下一层
    state.currentLayer = currentLayer + 1;

    // 检查下一层是否为 Boss 层
    const dungeonConfig = this._dungeonSystem.getDungeonConfig(dungeonId);
    state.currentLayerIsBoss = dungeonConfig?.bossConfig !== undefined
      && state.currentLayer === state.totalLayers;

    return {
      canContinue: true,
      battleResult,
      layerDrop,
      isLastLayer: false,
    };
  }

  // ==================== 核心 API：simulateLayerBattle ====================

  /**
   * 模拟单层战斗。
   *
   * 战力对比公式：
   *   enemyPower = playerPower × baseEnemyPowerRatio × (1+layerGrowthRate)^(layer-1) × bossMultiplier
   *   ratio = playerPower / enemyPower
   *   ratio ≥ guaranteedWinRatio  → 必定胜利
   *   ratio ≤ guaranteedLossRatio  → 必定失败
   *   否则以 ratio 为中心 ± randomVariance 判定
   *
   * @param dungeonId   地牢 ID
   * @param layerIndex  层序号（1-based）
   * @returns           战斗模拟结果
   */
  simulateLayerBattle(dungeonId: number, layerIndex: number): LayerBattleResult {
    const cfg = this._powerConfig;

    // 获取我方战力（从 ProgressSystem 读取总战力）
    const playerData = this._progressSystem.getPlayerProgressData();
    const playerPower = playerData.totalPower;

    // 计算敌方战力
    const dungeonConfig = this._dungeonSystem.getDungeonConfig(dungeonId);
    const isBossLayer = dungeonConfig?.bossConfig !== undefined
      && layerIndex === (dungeonConfig?.totalLayers ?? 999);

    let layerMultiplier = cfg.baseEnemyPowerRatio
      * Math.pow(1 + cfg.layerGrowthRate, layerIndex - 1);

    if (isBossLayer) {
      layerMultiplier *= cfg.bossPowerMultiplier;
    }

    const enemyPower = Math.round(playerPower * layerMultiplier);

    // 判定战斗结果
    const powerRatio = enemyPower > 0 ? playerPower / enemyPower : 999;

    let victory: boolean;
    let damageDealtRatio: number;
    let damageTakenRatio: number;

    if (powerRatio >= cfg.guaranteedWinRatio) {
      // 必定胜利
      victory = true;
      damageDealtRatio = 1.0;
      damageTakenRatio = this._randomRange(0.05, 0.3);
    } else if (powerRatio <= cfg.guaranteedLossRatio) {
      // 必定失败
      victory = false;
      damageDealtRatio = this._randomRange(0.1, 0.5);
      damageTakenRatio = 1.0;
    } else {
      // 随机判定：在 powerRatio 附近波动
      const variance = (Math.random() * 2 - 1) * cfg.randomVariance;
      const effectiveRatio = powerRatio + variance;

      if (effectiveRatio >= 1.0) {
        victory = true;
        damageDealtRatio = 1.0;
        // 越接近 1.0 受伤越重
        const closeness = Math.max(0, (effectiveRatio - 1.0) / (cfg.guaranteedWinRatio - 1.0));
        damageTakenRatio = this._randomRange(0.1, 1.0 - closeness * 0.7);
      } else {
        victory = false;
        damageDealtRatio = this._randomRange(0.2, effectiveRatio);
        damageTakenRatio = 1.0;
      }
    }

    // 计算模拟回合数
    const roundsSimulated = victory
      ? this._randomInt(3, Math.max(3, Math.ceil(10 / Math.max(0.5, powerRatio))))
      : this._randomInt(5, 15);

    return {
      layerIndex,
      victory,
      playerPower,
      enemyPower,
      damageDealtRatio: Math.round(damageDealtRatio * 100) / 100,
      damageTakenRatio: Math.round(damageTakenRatio * 100) / 100,
      roundsSimulated,
      isBossLayer,
    };
  }

  // ==================== 核心 API：completeRun ====================

  /**
   * 完成地牢通关（所有层已清除后调用）。
   *
   * 流程：
   * 1. 调用 DungeonSystem.completeDungeon() 生成最终奖励
   * 2. 更新 GameplayState 为已完成
   * 3. 清除活跃运行
   * 4. 派发 dungeonGameplay:runCompleted 事件
   *
   * @param dungeonId  地牢 ID
   * @returns          最终奖励数据
   */
  completeRun(dungeonId: number): DungeonRewardData | null {
    const state = this._activeRuns.get(dungeonId);
    if (!state) {
      console.warn(`[DungeonGameplay] completeRun: 地牢 ${dungeonId} 无进行中的 run`);
      return null;
    }

    // 调用 DungeonSystem 完成通关（生成最终 Boss 掉落 → 派发 dungeon:completed）
    const rewards = this._dungeonSystem.completeDungeon(dungeonId, state.playerId);

    // 更新状态
    state.currentLayer = state.totalLayers;
    state.isActive = false;
    state.isCompleted = true;
    state.isFailed = false;

    // 清除活跃运行
    this._activeRuns.delete(dungeonId);

    // 派发事件
    const duration = Date.now() - state.runStartTime;
    this._emitRunCompleted({
      dungeonId,
      playerId: state.playerId,
      rewards: rewards ?? { gold: 0, exp: 0, equipmentList: [], itemList: [] },
      totalLayers: state.totalLayers,
      duration,
    });

    return rewards;
  }

  // ==================== 核心 API：failRun ====================

  /**
   * 地牢挑战失败。
   *
   * 流程：
   * 1. 调用 DungeonSystem.failDungeon() 生成部分奖励
   * 2. 更新 GameplayState 为已失败
   * 3. 清除活跃运行
   * 4. 派发 dungeonGameplay:runFailed 事件
   *
   * @param dungeonId  地牢 ID
   * @param reason     失败原因
   * @returns          部分奖励
   */
  failRun(dungeonId: number, reason: string): DungeonRewardData | null {
    const state = this._activeRuns.get(dungeonId);
    const playerId = state?.playerId ?? DEFAULT_PLAYER_ID;
    const failedLayer = state?.currentLayer ?? 0;

    // 调用 DungeonSystem 处理失败
    const partialRewards = this._dungeonSystem.failDungeon(dungeonId, reason, playerId);

    // 更新状态
    if (state) {
      state.isActive = false;
      state.isCompleted = false;
      state.isFailed = true;
      state.failReason = reason;
    }

    // 清除活跃运行
    this._activeRuns.delete(dungeonId);

    // 派发事件
    this._emitRunFailed({
      dungeonId,
      playerId,
      failedLayer,
      reason,
      partialRewards,
    });

    return partialRewards;
  }

  // ==================== 辅助 API ====================

  /** 获取当前运行状态 */
  getRunState(dungeonId: number): DungeonGameplayState | null {
    return this._activeRuns.get(dungeonId) ?? null;
  }

  /** 获取所有活跃运行 */
  getAllActiveRuns(): DungeonGameplayState[] {
    return Array.from(this._activeRuns.values());
  }

  /** 是否有活跃运行 */
  hasActiveRun(dungeonId: number): boolean {
    return this._activeRuns.has(dungeonId);
  }

  /**
   * 放弃当前运行（不触发 failRun 的奖励逻辑）。
   *
   * 仅清除 DungeonGameplay 的运行状态，不操作 DungeonSystem。
   * 适用于玩家主动退出场景。
   */
  abandonRun(dungeonId: number): void {
    const state = this._activeRuns.get(dungeonId);
    if (state) {
      state.isActive = false;
      state.isFailed = true;
      state.failReason = '玩家主动放弃';
    }
    this._activeRuns.delete(dungeonId);
  }

  /** 清除所有运行时状态（不影响 DungeonSystem / 存档） */
  clearAllRuns(): void {
    this._activeRuns.clear();
  }

  /** 获取玩家当前总战力（便捷方法） */
  getPlayerTotalPower(): number {
    return this._progressSystem.getPlayerProgressData().totalPower;
  }

  // ==================== 内部方法 ====================

  /**
   * 为指定层生成掉落。
   *
   * 层掉落使用 DungeonSystem 中地牢的 dropTableId，
   * 但缩小为层奖励（减少数量）。
   *
   * 最后一层（Boss 层）不做层掉落——由 DungeonSystem.completeDungeon 处理。
   */
  private _generateLayerDrop(
    dungeonId: number,
    layerIndex: number,
    playerId: string,
  ): DropResultData | null {
    const dungeonConfig = this._dungeonSystem.getDungeonConfig(dungeonId);
    if (!dungeonConfig) return null;

    const dropSystem = this._dropSystem;
    if (!dropSystem.isConfigLoaded()) return null;

    const sourceId = `dungeon_${dungeonId}_layer_${layerIndex}`;
    const dropTableId = dungeonConfig.dropTableId;

    // 层奖励：使用地牢掉落表，由 DropSystem 的概率机制自然产生变化
    return dropSystem.rollDrop(dropTableId, sourceId, playerId);
  }

  /** 确保所有依赖系统已就绪 */
  private _requireReady(): void {
    if (!this._dungeonSystem.isConfigLoaded()) {
      throw new Error('[DungeonGameplay] DungeonSystem 配置未加载');
    }
    if (!this._dropSystem.isConfigLoaded()) {
      throw new Error('[DungeonGameplay] DropSystem 配置未加载');
    }
    if (!this._progressSystem.isConfigLoaded()) {
      throw new Error('[DungeonGameplay] ProgressSystem 配置未加载');
    }
  }

  // ==================== 辅助：随机数 ====================

  private _randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private _randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  // ==================== 事件派发 ====================

  private _emitRunStarted(data: GameplayRunStartedEvent): void {
    this._eventManager.emit(DungeonGameplay.RUN_STARTED, data);
  }

  private _emitBattleResolved(data: GameplayBattleResolvedEvent): void {
    this._eventManager.emit(DungeonGameplay.BATTLE_RESOLVED, data);
  }

  private _emitLayerCleared(data: GameplayLayerClearedEvent): void {
    this._eventManager.emit(DungeonGameplay.LAYER_CLEARED, data);
  }

  private _emitLayerFailed(data: GameplayLayerFailedEvent): void {
    this._eventManager.emit(DungeonGameplay.LAYER_FAILED, data);
  }

  private _emitRunCompleted(data: GameplayRunCompletedEvent): void {
    this._eventManager.emit(DungeonGameplay.RUN_COMPLETED, data);
  }

  private _emitRunFailed(data: GameplayRunFailedEvent): void {
    this._eventManager.emit(DungeonGameplay.RUN_FAILED, data);
  }
}
