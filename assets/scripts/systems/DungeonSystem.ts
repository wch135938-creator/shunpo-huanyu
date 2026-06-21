// ============================================================
// DungeonSystem — Phase6 地牢系统
// 职责：地牢进入 / 通关 / 失败 / 奖励结算 / 数据记录
// 边界：不实现 UI、不实现战斗逻辑、不实现 StaminaSystem
//
// Phase6-Step3: 接入 DropSystem
//   - 移除内部奖励生成逻辑（_generateRewards 等）
//   - completeDungeon / failDungeon 统一通过 DropSystem.rollDrop + claimDrop
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { EquipmentSystem } from './EquipmentSystem';
import { DropSystem } from './DropSystem';
import type { DungeonConfigEntry, DungeonConfigData } from '../data/dungeon_config';
import {
  createDefaultPlayerDungeonData,
  createDefaultDungeonInstanceData,
  createEmptyDungeonRewardData,
} from '../data/dungeon_data';
import type {
  PlayerDungeonData,
  DungeonInstanceData,
  DungeonRunData,
  DungeonRewardData,
} from '../data/dungeon_data';
import type { EquipmentInstanceData } from '../data/equipment_data';

/** 地牢进入事件数据 */
export interface DungeonEnterEventData {
  dungeonId: number;
  playerId: string;
  startTime: number;
}

/** 地牢通关事件数据 */
export interface DungeonCompletedEventData {
  dungeonId: number;
  playerId: string;
  rewards: DungeonRewardData;
  duration: number;
}

/** 地牢失败事件数据 */
export interface DungeonFailedEventData {
  dungeonId: number;
  playerId: string;
  reason: string;
  partialRewards: DungeonRewardData | null;
}

/** 地牢信息返回结构 */
export interface DungeonInfo {
  config: DungeonConfigEntry;
  instance: DungeonInstanceData;
  todayAttempts: number;
  maxAttemptsPerDay: number;
  canEnter: boolean;
  blockReason?: string;
}

/** 地牢进入验证结果 */
export interface DungeonValidateResult {
  canEnter: boolean;
  blockReason?: string;
}

// ---- 常量 ----

/** 每次体力恢复所需时间 (ms)，默认 5 分钟 */
const STAMINA_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/** 默认玩家 ID（单人游戏） */
const DEFAULT_PLAYER_ID = 'player_001';

/** 失败奖励比例（0~1），默认保留 30% */
const FAIL_REWARD_RATIO = 0.3;

export class DungeonSystem extends BaseSystem {
  // ==================== 事件常量 ====================

  static readonly DUNGEON_ENTERED = 'dungeon:entered';
  static readonly DUNGEON_COMPLETED = 'dungeon:completed';
  static readonly DUNGEON_FAILED = 'dungeon:failed';
  static readonly DUNGEON_DATA_CHANGED = 'dungeon:dataChanged';

  // ==================== 配置路径常量 ====================

  private static readonly DUNGEON_CONFIG_PATH = `${ConfigManager.DIR_SYSTEMS}/dungeon_config`;

  // ==================== 内部状态 ====================

  /** 地牢配置缓存：dungeonId → DungeonConfigEntry */
  private _configMap: Map<number, DungeonConfigEntry> = new Map();

  /** 玩家地牢总数据（运行时主数据） */
  private _playerData: PlayerDungeonData = createDefaultPlayerDungeonData();

  /** 活跃运行记录（进行中的挑战） */
  private _activeRuns: Map<number, DungeonRunData> = new Map();

  /** 配置是否已加载 */
  private _configLoaded = false;

  /** 体力恢复定时器 ID */
  private _staminaRecoveryTimerId: ReturnType<typeof setInterval> | null = null;

  // ==================== 初始化 ====================

  /**
   * 加载地牢依赖配置。
   *
   * 调用方应在使用地牢系统前执行一次。
   * 注意：掉落表由 DropSystem 独立加载，DungeonSystem 不再持有掉落表引用。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const dungeonConfig = await configManager.loadConfig<DungeonConfigData>(
      DungeonSystem.DUNGEON_CONFIG_PATH,
    );

    this._configMap = this._buildDungeonConfigMap(dungeonConfig);
    this._restoreFromSave();
    this._resetDailyIfNeeded();
    this._startStaminaRecovery();
    this._configLoaded = true;
  }

  /** 是否已加载配置 */
  isConfigLoaded(): boolean {
    return this._configLoaded;
  }

  /** 停止体力恢复定时器（组件销毁时调用） */
  destroy(): void {
    this._stopStaminaRecovery();
  }

  // ==================== 地牢操作 ====================

  /**
   * 进入地牢。
   *
   * 校验规则：
   * 1. 地牢配置存在
   * 2. 体力 ≥ 消耗
   * 3. 今日挑战次数未达上限
   *
   * @param dungeonId  地牢 ID
   * @returns          验证结果（成功进入时包含 DungeonRunData）
   */
  enterDungeon(dungeonId: number, playerId: string = DEFAULT_PLAYER_ID): {
    canEnter: boolean;
    blockReason?: string;
    runData?: DungeonRunData;
  } {
    this._requireConfig();

    // 每日重置检查
    this._resetDailyIfNeeded();

    // 校验
    const validation = this._validateEnter(dungeonId);
    if (!validation.canEnter) {
      return { canEnter: false, blockReason: validation.blockReason };
    }

    const config = this._getRequiredConfig(dungeonId);

    // 消耗体力
    this._playerData.currentStamina = Math.max(
      0,
      this._playerData.currentStamina - config.staminaCost,
    );

    // 增加今日挑战次数
    const currentAttempts = this._playerData.todayAttempts[dungeonId] ?? 0;
    this._playerData.todayAttempts[dungeonId] = currentAttempts + 1;

    // 创建运行记录
    const now = Date.now();
    const runData: DungeonRunData = {
      playerId,
      dungeonId,
      startTime: now,
      endTime: 0,
      isCleared: false,
      rewardSettled: false,
    };

    // 记录活跃运行
    this._activeRuns.set(dungeonId, runData);

    // 创建或更新地牢实例
    let instance = this._playerData.instances[dungeonId];
    if (!instance) {
      instance = createDefaultDungeonInstanceData(dungeonId);
      this._playerData.instances[dungeonId] = instance;
    }

    // 存档
    this._save();

    // 派发事件
    this._emitDungeonEntered({
      dungeonId,
      playerId,
      startTime: now,
    });

    return { canEnter: true, runData };
  }

  /**
   * 完成地牢通关。
   *
   * Phase6-Step3 联动流程：
   * Dungeon Complete → DropSystem.rollDrop() → DropResultData
   * → DropSystem.claimDrop() → 发放奖励 + 写历史
   * → 转换为 DungeonRewardData → 更新地牢状态 → 存档 → 派发事件
   *
   * @param dungeonId  地牢 ID
   * @param playerId   玩家 ID
   * @returns          奖励数据，地牢不存在或未在挑战中返回 null
   */
  completeDungeon(
    dungeonId: number,
    playerId: string = DEFAULT_PLAYER_ID,
  ): DungeonRewardData | null {
    this._requireConfig();

    const config = this._getRequiredConfig(dungeonId);
    const activeRun = this._activeRuns.get(dungeonId);
    if (!activeRun) {
      console.warn(`[DungeonSystem] 地牢 ${dungeonId} 无活跃运行记录，无法结算`);
      return null;
    }

    // ---- Phase6-Step3: 通过 DropSystem 生成并领取奖励 ----
    const sourceId = `dungeon_${dungeonId}`;
    const dropSystem = DropSystem.getInstance();

    if (!dropSystem.isConfigLoaded()) {
      console.warn('[DungeonSystem] DropSystem 配置未加载，无法生成掉落奖励');
      return this._finalizeCompletion(
        dungeonId, playerId, createEmptyDungeonRewardData(), activeRun, config,
      );
    }

    // Step 1: 生成掉落（装备实例已在 EquipmentSystem 中创建）
    const dropResult = dropSystem.rollDrop(config.dropTableId, sourceId, playerId);
    if (!dropResult) {
      console.warn(`[DungeonSystem] 地牢 ${dungeonId} 掉落生成失败`);
      return this._finalizeCompletion(
        dungeonId, playerId, createEmptyDungeonRewardData(), activeRun, config,
      );
    }

    // Step 2: 领取掉落（发放经验、记录金币、写掉落历史）
    const claimResult = dropSystem.claimDrop(dropResult, playerId);

    // Step 3: 转换为 DungeonRewardData
    const rewards: DungeonRewardData = {
      gold: claimResult.goldClaimed,
      exp: claimResult.expClaimed,
      equipmentList: dropResult.equipmentList,
      itemList: dropResult.itemList.map((item) => ({
        itemId: item.itemId,
        itemName: item.itemId,
        count: item.quantity,
      })),
    };

    return this._finalizeCompletion(dungeonId, playerId, rewards, activeRun, config);
  }

  /**
   * 地牢挑战失败。
   *
   * Phase6-Step3 联动流程：
   * Dungeon Fail → DropSystem.rollDrop() → 移除装备实例 →
   * 缩减奖励至 FAIL_REWARD_RATIO → DropSystem.claimDrop() →
   * 转换为 DungeonRewardData → 更新地牢状态 → 存档 → 派发事件
   *
   * @param dungeonId  地牢 ID
   * @param reason     失败原因
   * @param playerId   玩家 ID
   * @returns          部分奖励（null 表示无奖励）
   */
  failDungeon(
    dungeonId: number,
    reason: string,
    playerId: string = DEFAULT_PLAYER_ID,
  ): DungeonRewardData | null {
    this._requireConfig();

    const config = this._getRequiredConfig(dungeonId);
    const activeRun = this._activeRuns.get(dungeonId);

    // 通过 DropSystem 生成掉落
    const sourceId = `dungeon_${dungeonId}`;
    const dropSystem = DropSystem.getInstance();

    if (!dropSystem.isConfigLoaded()) {
      console.warn('[DungeonSystem] DropSystem 配置未加载，无法生成失败奖励');
      return this._finalizeFailure(dungeonId, playerId, reason, null, activeRun);
    }

    const dropResult = dropSystem.rollDrop(config.dropTableId, sourceId, playerId);
    if (!dropResult) {
      return this._finalizeFailure(dungeonId, playerId, reason, null, activeRun);
    }

    // 失败：移除所有装备实例（rollDrop 已在 EquipmentSystem 中创建它们）
    this._removeEquipmentInstances(dropResult.equipmentList);
    dropResult.equipmentList.length = 0;

    // 缩减金币/经验为 FAIL_REWARD_RATIO
    dropResult.gold = Math.floor(dropResult.gold * FAIL_REWARD_RATIO);
    dropResult.exp = Math.floor(dropResult.exp * FAIL_REWARD_RATIO);

    // 缩减物品（至少保留 1）
    for (const item of dropResult.itemList) {
      item.quantity = Math.max(1, Math.floor(item.quantity * FAIL_REWARD_RATIO));
    }

    // 领取缩减后的奖励
    const claimResult = dropSystem.claimDrop(dropResult, playerId);

    const partialRewards: DungeonRewardData = {
      gold: claimResult.goldClaimed,
      exp: claimResult.expClaimed,
      equipmentList: [], // 失败不保留装备
      itemList: dropResult.itemList.map((item) => ({
        itemId: item.itemId,
        itemName: item.itemId,
        count: item.quantity,
      })),
    };

    return this._finalizeFailure(dungeonId, playerId, reason, partialRewards, activeRun);
  }

  // ==================== 查询方法 ====================

  /**
   * 获取地牢完整信息（配置 + 玩家进度）。
   *
   * @param dungeonId  地牢 ID
   * @returns          地牢信息，配置不存在时返回 null
   */
  getDungeonInfo(dungeonId: number): DungeonInfo | null {
    this._requireConfig();

    const config = this._configMap.get(dungeonId);
    if (!config) {
      return null;
    }

    this._resetDailyIfNeeded();

    const instance = this._getOrCreateInstance(dungeonId);
    const todayAttempts = this._playerData.todayAttempts[dungeonId] ?? 0;
    const validation = this._validateEnter(dungeonId);

    return {
      config,
      instance,
      todayAttempts,
      maxAttemptsPerDay: config.maxAttemptsPerDay,
      canEnter: validation.canEnter,
      blockReason: validation.blockReason,
    };
  }

  /** 获取所有地牢配置列表 */
  getAllDungeonConfigs(): DungeonConfigEntry[] {
    this._requireConfig();
    return Array.from(this._configMap.values());
  }

  /** 获取各地牢的简要信息 */
  getAllDungeonInfos(): DungeonInfo[] {
    this._requireConfig();
    this._resetDailyIfNeeded();

    const infos: DungeonInfo[] = [];
    for (const [dungeonId, config] of this._configMap) {
      const instance = this._getOrCreateInstance(dungeonId);
      const todayAttempts = this._playerData.todayAttempts[dungeonId] ?? 0;
      const validation = this._validateEnter(dungeonId);

      infos.push({
        config,
        instance,
        todayAttempts,
        maxAttemptsPerDay: config.maxAttemptsPerDay,
        canEnter: validation.canEnter,
        blockReason: validation.blockReason,
      });
    }

    return infos;
  }

  /** 获取玩家地牢总数据副本 */
  getPlayerDungeonData(): PlayerDungeonData {
    return {
      instances: { ...this._playerData.instances },
      runHistory: this._playerData.runHistory.map((r) => ({ ...r })),
      todayAttempts: { ...this._playerData.todayAttempts },
      lastAttemptDate: this._playerData.lastAttemptDate,
      currentStamina: this._playerData.currentStamina,
      maxStamina: this._playerData.maxStamina,
    };
  }

  /** 获取所有活跃运行记录 */
  getActiveRuns(): DungeonRunData[] {
    return Array.from(this._activeRuns.values());
  }

  /** 获取地牢配置 */
  getDungeonConfig(dungeonId: number): DungeonConfigEntry | null {
    return this._configMap.get(dungeonId) ?? null;
  }

  /** 获取当前体力 */
  getStamina(): { current: number; max: number } {
    this._resetDailyIfNeeded();
    return {
      current: this._playerData.currentStamina,
      max: this._playerData.maxStamina,
    };
  }

  /** 验证是否可以进入指定地牢 */
  canEnterDungeon(dungeonId: number): DungeonValidateResult {
    this._requireConfig();
    this._resetDailyIfNeeded();
    return this._validateEnter(dungeonId);
  }

  // ==================== 数据管理 ====================

  /** 清空运行时地牢数据（不影响配置缓存） */
  clearData(): void {
    this._playerData = createDefaultPlayerDungeonData();
    this._activeRuns.clear();
  }

  /** 手动触发体力恢复计算（通常由定时器驱动） */
  recoverStamina(): void {
    if (this._playerData.currentStamina >= this._playerData.maxStamina) {
      return;
    }

    // 简单恢复：每次调用恢复 1 点体力
    this._playerData.currentStamina = Math.min(
      this._playerData.maxStamina,
      this._playerData.currentStamina + 1,
    );
  }

  // ==================== 内部方法：通关/失败收尾 ====================

  /**
   * 完成通关的收尾工作：更新运行记录、实例数据、存档、派发事件。
   *
   * @param dungeonId   地牢 ID
   * @param playerId    玩家 ID
   * @param rewards     奖励数据（已由 DropSystem 生成并领取）
   * @param activeRun   活跃运行记录
   * @param config      地牢配置
   * @returns           奖励数据
   */
  private _finalizeCompletion(
    dungeonId: number,
    playerId: string,
    rewards: DungeonRewardData,
    activeRun: DungeonRunData,
    config: DungeonConfigEntry,
  ): DungeonRewardData {
    // 更新活跃运行记录
    activeRun.endTime = Date.now();
    activeRun.isCleared = true;
    activeRun.rewardSettled = true;

    // 存入历史
    this._playerData.runHistory.push({ ...activeRun });
    this._activeRuns.delete(dungeonId);

    // 更新地牢实例
    const instance = this._getOrCreateInstance(dungeonId);
    instance.droppedRewards.push(rewards);

    // 标记所有层为已完成
    for (let layer = 1; layer <= config.totalLayers; layer++) {
      if (!instance.completedLayers.includes(layer)) {
        instance.completedLayers.push(layer);
      }
    }
    instance.completedLayers.sort((a, b) => a - b);
    instance.currentLayer = config.totalLayers;

    // 存档
    this._save();

    // 派发事件
    const duration = activeRun.endTime - activeRun.startTime;
    this._emitDungeonCompleted({
      dungeonId,
      playerId,
      rewards,
      duration,
    });

    return rewards;
  }

  /**
   * 完成失败的收尾工作：更新运行记录、存档、派发事件。
   *
   * @param dungeonId       地牢 ID
   * @param playerId        玩家 ID
   * @param reason          失败原因
   * @param partialRewards  部分奖励（已由 DropSystem 生成并领取），null 表示无奖励
   * @param activeRun       活跃运行记录（可能为 undefined）
   * @returns               部分奖励
   */
  private _finalizeFailure(
    dungeonId: number,
    playerId: string,
    reason: string,
    partialRewards: DungeonRewardData | null,
    activeRun: DungeonRunData | undefined,
  ): DungeonRewardData | null {
    // 更新活跃运行记录
    if (activeRun) {
      activeRun.endTime = Date.now();
      activeRun.isCleared = false;
      activeRun.failReason = reason;
      activeRun.rewardSettled = true;

      this._playerData.runHistory.push({ ...activeRun });
      this._activeRuns.delete(dungeonId);
    }

    // 记录奖励到实例
    if (partialRewards) {
      const instance = this._getOrCreateInstance(dungeonId);
      instance.droppedRewards.push(partialRewards);
    }

    // 存档
    this._save();

    // 派发事件
    this._emitDungeonFailed({
      dungeonId,
      playerId,
      reason,
      partialRewards,
    });

    return partialRewards;
  }

  /**
   * 从 EquipmentSystem 中移除一组装备实例。
   *
   * 用于失败场景：rollDrop 会在 EquipmentSystem 中创建装备实例，
   * 但失败时不应保留装备奖励，因此需要移除。
   *
   * @param equipList  待移除的装备实例列表
   */
  private _removeEquipmentInstances(equipList: EquipmentInstanceData[]): void {
    if (equipList.length === 0) return;

    try {
      const equipSystem = EquipmentSystem.getInstance();
      for (const equip of equipList) {
        equipSystem.removeInstance(equip.uid);
      }
    } catch (e) {
      console.warn(`[DungeonSystem] 移除失败奖励装备实例时出错: ${e}`);
    }
  }

  // ==================== 内部方法：校验 ====================

  /** 校验进入地牢条件 */
  private _validateEnter(dungeonId: number): DungeonValidateResult {
    const config = this._configMap.get(dungeonId);
    if (!config) {
      return { canEnter: false, blockReason: `地牢 ${dungeonId} 配置不存在` };
    }

    // 检查体力
    if (this._playerData.currentStamina < config.staminaCost) {
      return {
        canEnter: false,
        blockReason: `体力不足: 当前${this._playerData.currentStamina}, 需要${config.staminaCost}`,
      };
    }

    // 检查今日挑战次数
    const todayAttempts = this._playerData.todayAttempts[dungeonId] ?? 0;
    if (todayAttempts >= config.maxAttemptsPerDay) {
      return {
        canEnter: false,
        blockReason: `今日挑战次数已用尽: ${todayAttempts}/${config.maxAttemptsPerDay}`,
      };
    }

    return { canEnter: true };
  }

  /** 获取或创建地牢实例 */
  private _getOrCreateInstance(dungeonId: number): DungeonInstanceData {
    let instance = this._playerData.instances[dungeonId];
    if (!instance) {
      instance = createDefaultDungeonInstanceData(dungeonId);
      this._playerData.instances[dungeonId] = instance;
    }
    return instance;
  }

  /** 每日重置检查 */
  private _resetDailyIfNeeded(): void {
    const today = this._getTodayDateString();
    if (this._playerData.lastAttemptDate !== today) {
      this._playerData.todayAttempts = {};
      this._playerData.lastAttemptDate = today;
      // 每日重置时恢复满体力
      this._playerData.currentStamina = this._playerData.maxStamina;
    }
  }

  /** 获取今日日期字符串 YYYY-MM-DD */
  private _getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** 启动体力恢复定时器 */
  private _startStaminaRecovery(): void {
    if (this._staminaRecoveryTimerId !== null) return;

    this._staminaRecoveryTimerId = setInterval(() => {
      this.recoverStamina();
    }, STAMINA_RECOVERY_INTERVAL_MS);
  }

  /** 停止体力恢复定时器 */
  private _stopStaminaRecovery(): void {
    if (this._staminaRecoveryTimerId !== null) {
      clearInterval(this._staminaRecoveryTimerId);
      this._staminaRecoveryTimerId = null;
    }
  }

  /** 从 SaveManager 恢复地牢数据 */
  private _restoreFromSave(): void {
    const saveManager = SaveManager.getInstance();
    const savedData = saveManager.loadData<PlayerDungeonData>('dungeon' as keyof any);

    if (savedData && savedData.instances) {
      this._playerData = {
        instances: { ...savedData.instances },
        runHistory: Array.isArray(savedData.runHistory)
          ? savedData.runHistory.map((r) => ({ ...r }))
          : [],
        todayAttempts: savedData.todayAttempts ? { ...savedData.todayAttempts } : {},
        lastAttemptDate: savedData.lastAttemptDate ?? '',
        currentStamina: typeof savedData.currentStamina === 'number'
          ? savedData.currentStamina
          : this._playerData.maxStamina,
        maxStamina: typeof savedData.maxStamina === 'number'
          ? savedData.maxStamina
          : 100,
      };
    }
  }

  /** 保存地牢数据到 SaveManager */
  private _save(): void {
    const saveManager = SaveManager.getInstance();
    saveManager.saveData('dungeon' as keyof any, {
      instances: { ...this._playerData.instances },
      runHistory: this._playerData.runHistory.map((r) => ({ ...r })),
      todayAttempts: { ...this._playerData.todayAttempts },
      lastAttemptDate: this._playerData.lastAttemptDate,
      currentStamina: this._playerData.currentStamina,
      maxStamina: this._playerData.maxStamina,
    });
  }

  /** 构建地牢配置映射 */
  private _buildDungeonConfigMap(config: DungeonConfigData): Map<number, DungeonConfigEntry> {
    const map = new Map<number, DungeonConfigEntry>();

    for (const entry of config.data) {
      map.set(entry.dungeonId, entry);
    }

    if (map.size === 0) {
      throw new Error('[DungeonSystem] dungeon_config 未包含任何地牢配置');
    }

    return map;
  }

  /** 获取必需的地牢配置，不存在时抛错 */
  private _getRequiredConfig(dungeonId: number): DungeonConfigEntry {
    const config = this._configMap.get(dungeonId);
    if (!config) {
      throw new Error(`[DungeonSystem] 缺少地牢配置: dungeonId=${dungeonId}`);
    }

    return config;
  }

  /** 确保配置已加载 */
  private _requireConfig(): void {
    if (this._configMap.size === 0) {
      throw new Error('[DungeonSystem] 地牢配置未加载，请先调用 loadConfig()');
    }
  }

  // ==================== 事件派发 ====================

  private _emitDungeonEntered(data: DungeonEnterEventData): void {
    EventManager.getInstance().emit(DungeonSystem.DUNGEON_ENTERED, data);
  }

  private _emitDungeonCompleted(data: DungeonCompletedEventData): void {
    EventManager.getInstance().emit(DungeonSystem.DUNGEON_COMPLETED, data);
  }

  private _emitDungeonFailed(data: DungeonFailedEventData): void {
    EventManager.getInstance().emit(DungeonSystem.DUNGEON_FAILED, data);
  }
}
