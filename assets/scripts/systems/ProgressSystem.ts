// ============================================================
// ProgressSystem — Phase4A 角色经验与升级系统 / Phase7-Step5 多轨成长
// 职责：读取等级配置，发放角色经验，处理连续升级，联动战力并写入成长存档
//        Phase7-Step5: 新增 applyExp / applyExpBatch / recalculateHeroProgress 多轨成长接口
// 边界：不接入战斗、不实现装备、不实现 UI
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { PowerSystem } from './PowerSystem';
import { SaveManager } from '../save/SaveManager';
import { DomainEventBus } from './DomainEventBus';
import { DomainEventType, generateCorrelationId } from '../data/roguelike_types';
import type { HeroConfig, HeroListData } from '../config/hero_config';
import type { LevelConfig, LevelConfigData } from '../config/level_config';
import type { HeroProgressData } from '../data/hero_progress_data';
import type { PlayerProgressData } from '../data/player_progress_data';
import type {
  HeroProgressStateV2,
  ProgressTrackState,
} from '../data/roguelike_types';
import type {
  ApplyExpInput,
  ApplyExpBatchInput,
  RecalculateProgressInput,
  ProgressResult,
  ProgressTrackResult,
  ProgressTrackConfig,
} from '../data/progress_types';
import {
  createDefaultProgressTrackState,
  createDefaultHeroProgressStateV2,
} from '../data/progress_types';
import type { AccountLevelConfig, AccountLevelEntry } from '../config/account_level_config';

/** 角色获得经验事件数据 */
export interface HeroExpGainedEventData {
  heroId: string;
  expGain: number;
  currentLevel: number;
  currentExp: number;
}

/** 单次升级事件数据 */
export interface HeroLevelUpEventData {
  heroId: string;
  oldLevel: number;
  newLevel: number;
  remainingExp: number;
}

/** addHeroExp 的返回结果 */
export interface AddHeroExpResult {
  heroId: string;
  expGain: number;
  oldLevel: number;
  newLevel: number;
  currentExp: number;
  oldPower: number;
  newPower: number;
  oldTotalPower: number;
  newTotalPower: number;
  levelUpCount: number;
  levelUpEvents: HeroLevelUpEventData[];
}

/** 单角色战力变化事件数据 */
export interface HeroPowerChangedEventData {
  heroId: string;
  oldPower: number;
  newPower: number;
  powerDelta: number;
}

/** 阵容总战力变化事件数据 */
export interface TotalPowerChangedEventData {
  oldTotalPower: number;
  newTotalPower: number;
  powerDelta: number;
}

/** 账号等级变化结果 */
export interface PlayerLevelChangeResult {
  oldLevel: number;
  newLevel: number;
  oldExp: number;
  newExp: number;
  levelsGained: number;
  expAdded: number;
  reachedMaxLevel: boolean;
  source: string;
}

/** 账号等级变化事件数据 */
export interface PlayerLevelChangedEventData {
  oldLevel: number;
  newLevel: number;
  levelsGained: number;
  remainingExp: number;
  source: string;
}

export class ProgressSystem extends BaseSystem {
  static readonly HERO_EXP_GAINED = 'hero:expGained';
  static readonly HERO_LEVEL_UP = 'hero:levelUp';
  static readonly HERO_POWER_CHANGED = 'hero:powerChanged';
  static readonly TOTAL_POWER_CHANGED = 'hero:totalPowerChanged';
  static readonly PLAYER_LEVEL_CHANGED = 'player:levelChanged';

  private static readonly LEVEL_CONFIG_PATH = `${ConfigManager.DIR_SYSTEMS}/level_config`;
  private static readonly HERO_CONFIG_PATH = `${ConfigManager.DIR_CARDS}/hero_list`;
  private static readonly ACCOUNT_LEVEL_CONFIG_PATH = `${ConfigManager.DIR_SYSTEMS}/account_level_config`;

  private _heroProgressMap: Map<string, HeroProgressData> = new Map();
  private _levelConfigMap: Map<number, LevelConfig> = new Map();
  private _heroConfigMap: Map<string, HeroConfig> = new Map();
  private _playerProgressData: PlayerProgressData = this._createDefaultPlayerProgressData();

  // ---- C1.5.9-G-B1-A7: 账号等级配置 ----
  private _accountLevelConfig: AccountLevelConfig | null = null;
  private _accountLevelMap: Map<number, AccountLevelEntry> = new Map();
  private _accountLevelConfigLoaded = false;

  // ---- Phase7-Step5: V2 多轨成长数据 ----
  /** 英雄多轨成长状态（V2） */
  private _heroProgressV2Map: Map<string, HeroProgressStateV2> = new Map();
  /** 成长轨道配置映射 */
  private _trackConfigs: Map<string, ProgressTrackConfig> = new Map();
  /** trackId → maxLevel 快速检索 */
  private _trackMaxLevelMap: Map<string, number> = new Map();

  /**
   * 加载成长依赖配置。
   *
   * 调用方应在 addHeroExp / checkLevelUp 前执行一次。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const [levelConfig, heroConfig] = await Promise.all([
      configManager.loadConfig<LevelConfigData>(ProgressSystem.LEVEL_CONFIG_PATH),
      configManager.loadConfig<HeroListData>(ProgressSystem.HERO_CONFIG_PATH),
      PowerSystem.getInstance().loadConfig(),
    ]);

    this._levelConfigMap = this._buildLevelConfigMap(levelConfig);
    this._heroConfigMap = this._buildHeroConfigMap(heroConfig);
    this.restoreFromSaveManager();
  }

  /** 是否已经加载成长依赖配置 */
  isConfigLoaded(): boolean {
    return this._levelConfigMap.size > 0
      && this._heroConfigMap.size > 0
      && PowerSystem.getInstance().isConfigLoaded();
  }

  /** C1.5.9-G-B1-A7: 加载并校验账号等级配置 */
  async loadAccountLevelConfig(): Promise<void> {
    if (this._accountLevelConfigLoaded) {
      console.log('[ProgressSystem][A7] 账号等级配置已加载，跳过');
      return;
    }

    const configManager = ConfigManager.getInstance();
    try {
      const config = await configManager.loadConfig<AccountLevelConfig>(
        ProgressSystem.ACCOUNT_LEVEL_CONFIG_PATH,
      );

      this._validateAccountLevelConfig(config);
      this._accountLevelConfig = config;
      this._accountLevelMap = this._buildAccountLevelMap(config);

      // A7-A2: 仅恢复账号进度，不触碰英雄数据
      this._restorePlayerProgressFromSaveManager();

      // 配置加载成功后规范化恢复数据
      this._normalizePlayerData();

      // 全部成功后标记已加载（用于重复调用安全）
      this._accountLevelConfigLoaded = true;

      console.log(
        `[ProgressSystem][A7] 账号等级配置加载完成: ` +
        `levels=${config.levels.length}, maxLevel=${this.getMaxAccountLevel()}`,
      );
    } catch (err) {
      console.error('[ProgressSystem][A7] 账号等级配置加载失败:', err);
      this._accountLevelConfig = null;
      this._accountLevelMap.clear();
      this._accountLevelConfigLoaded = false;
      throw err;
    }
  }

  /** 是否已加载账号等级配置 */
  isAccountLevelConfigLoaded(): boolean {
    return this._accountLevelConfigLoaded;
  }

  /** 获取账号等级上限（配置驱动，map 非空时从键值计算，不再硬编码 10） */
  getMaxAccountLevel(): number {
    if (this._accountLevelMap.size > 0) {
      return Math.max(...this._accountLevelMap.keys());
    }
    return 1; // map 为空时返回安全初始值 1
  }

  /**
   * C1.5.9-G-B1-A7: 发放账号经验。
   *
   * 规则：
   * - 仅 ProgressSystem 有写入权
   * - amount 非有限 / NaN / Infinity / <=0 → 不修改
   * - 满级后不再累计经验
   * - 支持单次跨多级
   * - 同步 SaveManager 内存，不落盘
   *
   * @param amount  经验值（执行 Math.floor）
   * @param source  来源标识（用于日志和事件）
   * @returns       结构化结果
   */
  addPlayerExp(amount: number, source: string): PlayerLevelChangeResult {
    if (!this._accountLevelConfigLoaded) {
      console.error('[ProgressSystem][A7] addPlayerExp: 账号等级配置未加载，拒绝操作');
      return this._createNoPlayerLevelChangeResult();
    }

    // 校验 source
    let safeSource = (source ?? '').trim();
    if (safeSource === '') {
      safeSource = 'unknown';
      console.warn('[ProgressSystem][A7] addPlayerExp: source 为空，使用 unknown');
    }

    // 校验 amount
    if (!Number.isFinite(amount) || amount <= 0) {
      if (!Number.isFinite(amount)) {
        console.warn(`[ProgressSystem][A7] addPlayerExp: amount 无效 (${amount})，不修改`);
      }
      return {
        oldLevel: this._playerProgressData.playerLevel,
        newLevel: this._playerProgressData.playerLevel,
        oldExp: this._playerProgressData.playerExp,
        newExp: this._playerProgressData.playerExp,
        levelsGained: 0,
        expAdded: 0,
        reachedMaxLevel: this._playerProgressData.playerLevel >= this.getMaxAccountLevel(),
        source: safeSource,
      };
    }

    const safeExp = Math.floor(amount);
    const maxLevel = this.getMaxAccountLevel();
    const oldLevel = this._playerProgressData.playerLevel;
    const oldExp = this._playerProgressData.playerExp;

    // 满级检查：已满级时修正脏经验并返回 expAdded=0
    if (oldLevel >= maxLevel) {
      const realOldExp = this._playerProgressData.playerExp;
      // 满级时 playerExp 必须为 0，如有脏数据则真正归零
      if (this._playerProgressData.playerExp !== 0) {
        this._playerProgressData.playerExp = 0;
        SaveManager.getInstance().savePlayerProgressData(this._playerProgressData);
        console.log(
          `[ProgressSystem][A7] addPlayerExp: 满级脏经验修正 oldExp=${realOldExp} → 0`,
        );
      }
      console.log(
        `[ProgressSystem][A7] addPlayerExp: 已满级 (Lv${oldLevel})，不增加经验`,
      );
      return {
        oldLevel,
        newLevel: oldLevel,
        oldExp: realOldExp,
        newExp: 0,
        levelsGained: 0,
        expAdded: 0,
        reachedMaxLevel: true,
        source: safeSource,
      };
    }

    // 应用经验（使用 pool 变量便于精确追踪实际接纳值）
    let pool = oldExp + safeExp;
    let levelsGained = 0;
    let reachedMaxLevel = false;
    let consumedInLevelUps = 0;

    while (this._playerProgressData.playerLevel < maxLevel) {
      const entry = this._accountLevelMap.get(this._playerProgressData.playerLevel);
      if (!entry || entry.requiredExpToNext <= 0) {
        // 到达满级：丢弃 pool 中剩余经验
        pool = 0;
        this._playerProgressData.playerExp = 0;
        reachedMaxLevel = true;
        break;
      }

      if (pool < entry.requiredExpToNext) {
        // 经验不足以升级
        this._playerProgressData.playerExp = pool;
        break;
      }

      // 升级：扣除所需经验
      pool -= entry.requiredExpToNext;
      consumedInLevelUps += entry.requiredExpToNext;
      this._playerProgressData.playerLevel += 1;
      levelsGained += 1;

      // 检查是否已达满级：丢弃 pool 中剩余经验（溢出不储存）
      if (this._playerProgressData.playerLevel >= maxLevel) {
        pool = 0;
        this._playerProgressData.playerExp = 0;
        reachedMaxLevel = true;
        break;
      }
    }

    const newLevel = this._playerProgressData.playerLevel;
    const newExp = this._playerProgressData.playerExp;

    // expAdded = 本次真正被账号等级系统接纳的经验（不含溢出丢弃部分）
    // 公式：(newExp - oldExp) + consumedInLevelUps
    let expAdded = (newExp - oldExp) + consumedInLevelUps;
    if (expAdded > safeExp) expAdded = safeExp;
    if (expAdded < 0) expAdded = 0;

    // 同步 SaveManager 内存（不落盘）
    SaveManager.getInstance().savePlayerProgressData(this._playerProgressData);

    // 发射等级变化事件（仅升级时）
    if (newLevel > oldLevel) {
      this._emitPlayerLevelChanged({
        oldLevel,
        newLevel,
        levelsGained,
        remainingExp: newExp,
        source: safeSource,
      });
    }

    console.log(
      `[ProgressSystem][A7] addPlayerExp: amount=${safeExp}, expAdded=${expAdded}, source=${safeSource}, ` +
      `Lv${oldLevel}(${oldExp}exp) → Lv${newLevel}(${newExp}exp), ` +
      `levelsGained=${levelsGained}, reachedMax=${reachedMaxLevel}`,
    );

    return {
      oldLevel,
      newLevel,
      oldExp,
      newExp,
      levelsGained,
      expAdded,
      reachedMaxLevel,
      source: safeSource,
    };
  }

  /** 设置或覆盖单个角色成长数据，供后续 SaveManager 接入时恢复数据 */
  setHeroProgress(data: HeroProgressData): void {
    this._heroProgressMap.set(data.heroId, { ...data });
  }

  /** 批量设置角色成长数据 */
  setHeroProgressList(list: HeroProgressData[]): void {
    for (const data of list) {
      this.setHeroProgress(data);
    }
  }

  /** 从 SaveManager 恢复成长数据到 ProgressSystem 运行时内存 */
  restoreFromSaveManager(): void {
    const saveManager = SaveManager.getInstance();
    const playerProgress = saveManager.loadPlayerProgressData();

    if (playerProgress) {
      this._playerProgressData = { ...playerProgress };
    }

    const heroProgressList = saveManager.loadHeroProgressList();
    if (heroProgressList.length > 0) {
      this.setHeroProgressList(heroProgressList);
    }
  }

  /**
   * A7-A2: 仅恢复玩家账号进度，不触碰英雄数据。
   *
   * 与 restoreFromSaveManager() 的区别：
   * - 只恢复 PlayerProgressData（playerLevel / playerExp / totalPower / highestStageId）
   * - 不读取 heroProgressList
   * - 不调用 SaveManager.save()
   * - 不发事件
   * - 仅供 loadAccountLevelConfig() 使用
   */
  private _restorePlayerProgressFromSaveManager(): void {
    const saveManager = SaveManager.getInstance();
    const playerProgress = saveManager.loadPlayerProgressData();

    if (playerProgress) {
      this._playerProgressData = { ...playerProgress };
    }
  }

  /** 获取账号成长、最高关卡、总战力缓存数据副本 */
  getPlayerProgressData(): PlayerProgressData {
    return { ...this._playerProgressData };
  }

  /** 设置账号成长、最高关卡、总战力缓存数据。配置已可用时自动规范化。 */
  setPlayerProgressData(data: PlayerProgressData): void {
    this._playerProgressData = { ...data };
    // 配置已可用时执行规范化（满级 playerExp 归零、超上限等级压回等）
    if (this._accountLevelMap.size > 0) {
      this._normalizePlayerData();
    }
  }

  /** 获取单个角色成长数据副本 */
  getHeroProgress(heroId: string): HeroProgressData {
    this._requireLevelConfig();

    const data = this._getOrCreateHeroProgress(heroId);
    return { ...data };
  }

  /** 发放角色经验，并自动处理连续升级 */
  addHeroExp(heroId: string, exp: number): AddHeroExpResult {
    this._requireConfig();

    if (!Number.isFinite(exp) || exp <= 0) {
      return this._createNoChangeResult(heroId);
    }

    const data = this._getOrCreateHeroProgress(heroId);
    const oldLevel = data.level;
    const oldPower = data.power;
    const oldTotalPower = this._playerProgressData.totalPower;
    const safeExp = Math.floor(exp);

    data.exp += safeExp;

    this._emitHeroExpGained({
      heroId,
      expGain: safeExp,
      currentLevel: data.level,
      currentExp: data.exp,
    });

    const levelUpEvents = this._processLevelUp(data);
    const linkageResult = this._syncPowerAndSave(data, levelUpEvents.length > 0);

    return {
      heroId,
      expGain: safeExp,
      oldLevel,
      newLevel: data.level,
      currentExp: data.exp,
      oldPower,
      newPower: linkageResult.newPower,
      oldTotalPower,
      newTotalPower: linkageResult.newTotalPower,
      levelUpCount: levelUpEvents.length,
      levelUpEvents,
    };
  }

  /** 获取角色等级 */
  getHeroLevel(heroId: string): number {
    this._requireLevelConfig();

    return this._getOrCreateHeroProgress(heroId).level;
  }

  /** 获取角色当前经验 */
  getHeroExp(heroId: string): number {
    this._requireLevelConfig();

    return this._getOrCreateHeroProgress(heroId).exp;
  }

  /** 检查并处理角色当前经验是否可升级 */
  checkLevelUp(heroId: string): AddHeroExpResult {
    this._requireConfig();

    const data = this._getOrCreateHeroProgress(heroId);
    const oldLevel = data.level;
    const oldPower = data.power;
    const oldTotalPower = this._playerProgressData.totalPower;
    const levelUpEvents = this._processLevelUp(data);
    const linkageResult = this._syncPowerAndSave(data, levelUpEvents.length > 0);

    return {
      heroId,
      expGain: 0,
      oldLevel,
      newLevel: data.level,
      currentExp: data.exp,
      oldPower,
      newPower: linkageResult.newPower,
      oldTotalPower,
      newTotalPower: linkageResult.newTotalPower,
      levelUpCount: levelUpEvents.length,
      levelUpEvents,
    };
  }

  /** 获取指定等级配置 */
  getLevelConfig(level: number): LevelConfig | null {
    return this._levelConfigMap.get(level) ?? null;
  }

  /** 获取当前已加载的最高等级 */
  getMaxLevel(): number {
    this._requireLevelConfig();
    return Math.max(...this._levelConfigMap.keys());
  }

  /** 清空运行时成长数据，不影响配置缓存 */
  clearProgress(): void {
    this._heroProgressMap.clear();
  }

  // ==================== Phase7-Step5: 多轨成长接口 ====================

  /**
   * 加载成长轨道配置。
   *
   * @param configs  成长轨道配置列表
   */
  loadTrackConfigs(configs: ProgressTrackConfig[]): void {
    this._trackConfigs.clear();
    this._trackMaxLevelMap.clear();

    for (const config of configs) {
      this._trackConfigs.set(config.trackId, config);
      this._trackMaxLevelMap.set(config.trackId, config.maxLevel);
    }
  }

  /** 是否已加载轨道配置 */
  isTrackConfigLoaded(): boolean {
    return this._trackConfigs.size > 0;
  }

  /**
   * 单英雄单轨道经验更新。
   *
   * 流程：
   * 1. 校验输入
   * 2. 查找或创建 HeroProgressStateV2 / ProgressTrackState
   * 3. 应用经验，处理连续升级
   * 4. 检查里程碑解锁
   * 5. 通过 DomainEventBus 发布事件供 PowerSystem 战力重算
   * 6. 返回 ProgressResult
   *
   * @param input  经验更新输入
   * @returns      ProgressResult
   */
  applyExp(input: ApplyExpInput): ProgressResult {
    this._requireTrackConfig();

    const correlationId = input.correlationId ?? generateCorrelationId();
    const heroId = input.heroId;
    const trackId = input.trackId;

    if (!Number.isFinite(input.exp) || input.exp <= 0) {
      return this._createEmptyProgressResult(heroId, correlationId);
    }

    const safeExp = Math.floor(input.exp);

    // 获取或创建英雄 V2 状态
    const heroState = this._getOrCreateHeroProgressV2(heroId);

    // 获取或创建轨道状态
    const trackState = this._getOrCreateTrackState(heroState, trackId);
    const trackConfig = this._getTrackConfig(trackId);
    const oldLevel = trackState.level;
    const oldExp = trackState.exp;

    // 应用经验
    trackState.exp += safeExp;
    heroState.totalExpReceived += safeExp;

    // 处理升级
    const { newLevel, levelUps, milestonesUnlocked } = this._processTrackLevelUp(
      trackState,
      trackConfig,
    );

    heroState.updatedAt = Date.now();

    // 构建轨道结果
    const trackResult: ProgressTrackResult = {
      trackId,
      oldLevel,
      newLevel,
      expChange: safeExp,
      milestonesUnlocked,
    };

    // 通过 DomainEventBus 发布多轨更新事件
    this._publishTrackUpdateEvent(heroId, trackId, correlationId, trackResult);

    // 计算属性变化摘要
    const attributeSummary = this._computeAttributeSummary(
      trackConfig,
      oldLevel,
      newLevel,
    );

    return {
      heroId,
      correlationId,
      expApplied: safeExp,
      tracks: [trackResult],
      levelUpCount: levelUps,
      totalMilestonesUnlocked: milestonesUnlocked.length,
      attributeSummary,
      totalExpReceived: heroState.totalExpReceived,
      updatedAt: heroState.updatedAt,
    };
  }

  /**
   * 批量更新多英雄经验。
   *
   * 流程：
   * 1. 按 trackId 排序分组处理
   * 2. 每个条目调用 applyExp 处理
   * 3. 聚合所有 ProgressResult
   * 4. 通过 DomainEventBus 发布批量事件
   *
   * @param input  批量更新输入
   * @returns      ProgressResult 数组
   */
  applyExpBatch(input: ApplyExpBatchInput): ProgressResult[] {
    this._requireTrackConfig();

    const correlationId = input.correlationId ?? generateCorrelationId();
    const results: ProgressResult[] = [];

    if (!input.entries || input.entries.length === 0) {
      return results;
    }

    // 按 trackId 排序，确保同一轨道连续处理
    const sorted = [...input.entries].sort((a, b) => a.trackId.localeCompare(b.trackId));

    for (const entry of sorted) {
      const result = this.applyExp({
        heroId: entry.heroId,
        trackId: entry.trackId,
        exp: entry.exp,
        correlationId,
      });
      results.push(result);
    }

    // 发布批量更新完成事件
    const domainBus = DomainEventBus.getInstance();
    const totalHeroes = new Set(results.map((r) => r.heroId)).size;
    domainBus.publish(
      DomainEventType.HERO_EXP_APPLIED,
      {
        batchSize: results.length,
        totalHeroes,
        totalExpApplied: results.reduce((sum, r) => sum + r.expApplied, 0),
        totalLevelUps: results.reduce((sum, r) => sum + r.levelUpCount, 0),
      },
      'progress',
      'player_global',
      correlationId,
    );

    return results;
  }

  /**
   * 重算英雄成长轨。
   *
   * 用途：迁移、补偿或历史数据重算。
   * 保留原有事件 correlationId 用于追踪。
   *
   * @param input  重算输入
   * @returns      ProgressResult 数组
   */
  recalculateHeroProgress(input: RecalculateProgressInput): ProgressResult[] {
    this._requireTrackConfig();

    const correlationId = input.correlationId ?? generateCorrelationId();
    const results: ProgressResult[] = [];

    // 确定需要重算的英雄列表
    const heroIds = input.heroIds ?? Array.from(this._heroProgressV2Map.keys());

    for (const heroId of heroIds) {
      const heroState = this._heroProgressV2Map.get(heroId);
      if (!heroState) {
        continue;
      }

      for (const trackId of Object.keys(heroState.tracks)) {
        const trackState = heroState.tracks[trackId];
        const trackConfig = this._trackConfigs.get(trackId);
        if (!trackConfig) {
          continue;
        }

        const oldLevel = trackState.level;

        // 基于当前经验重新计算等级和里程碑
        const { newLevel, milestonesUnlocked } = this._recalculateTrackLevel(
          trackState,
          trackConfig,
        );

        if (oldLevel !== newLevel || milestonesUnlocked.length > 0) {
          trackState.level = newLevel;
          trackState.version = trackConfig.version;
          heroState.updatedAt = Date.now();

          const trackResult: ProgressTrackResult = {
            trackId,
            oldLevel,
            newLevel,
            expChange: 0,
            milestonesUnlocked,
          };

          const attributeSummary = this._computeAttributeSummary(
            trackConfig,
            oldLevel,
            newLevel,
          );

          results.push({
            heroId,
            correlationId,
            expApplied: 0,
            tracks: [trackResult],
            levelUpCount: newLevel > oldLevel ? 1 : 0,
            totalMilestonesUnlocked: milestonesUnlocked.length,
            attributeSummary,
            totalExpReceived: heroState.totalExpReceived,
            updatedAt: heroState.updatedAt,
          });
        }
      }
    }

    return results;
  }

  /** 获取单个英雄 V2 多轨成长状态副本 */
  getHeroProgressV2(heroId: string): HeroProgressStateV2 | null {
    const state = this._heroProgressV2Map.get(heroId);
    if (!state) return null;

    return {
      heroId: state.heroId,
      tracks: { ...state.tracks },
      totalExpReceived: state.totalExpReceived,
      updatedAt: state.updatedAt,
    };
  }

  /** 获取所有英雄 V2 多轨成长状态列表 */
  getAllHeroProgressV2(): HeroProgressStateV2[] {
    return Array.from(this._heroProgressV2Map.values()).map((state) => ({
      heroId: state.heroId,
      tracks: { ...state.tracks },
      totalExpReceived: state.totalExpReceived,
      updatedAt: state.updatedAt,
    }));
  }

  /** 获取指定轨道的配置 */
  getTrackConfig(trackId: string): ProgressTrackConfig | null {
    return this._trackConfigs.get(trackId) ?? null;
  }

  /** 从 SaveManager 恢复 V2 多轨成长数据 */
  restoreV2FromSaveManager(list: HeroProgressStateV2[]): void {
    for (const state of list) {
      const cloned = {
        heroId: state.heroId,
        tracks: { ...state.tracks },
        totalExpReceived: state.totalExpReceived,
        updatedAt: state.updatedAt,
      };
      this._heroProgressV2Map.set(state.heroId, cloned);
    }
  }

  // ==================== Phase7-Step5: 内部方法 ====================

  /** 获取或创建英雄 V2 状态 */
  private _getOrCreateHeroProgressV2(heroId: string): HeroProgressStateV2 {
    let state = this._heroProgressV2Map.get(heroId);
    if (state) {
      return state;
    }

    state = createDefaultHeroProgressStateV2(heroId);
    this._heroProgressV2Map.set(heroId, state);
    return state;
  }

  /** 获取或创建轨道状态 */
  private _getOrCreateTrackState(
    heroState: HeroProgressStateV2,
    trackId: string,
  ): ProgressTrackState {
    if (heroState.tracks[trackId]) {
      return heroState.tracks[trackId];
    }

    const config = this._trackConfigs.get(trackId);
    const version = config?.version ?? 1;
    const trackState = createDefaultProgressTrackState(trackId, version);
    heroState.tracks[trackId] = trackState;
    return trackState;
  }

  /** 获取轨道配置（带校验） */
  private _getTrackConfig(trackId: string): ProgressTrackConfig {
    const config = this._trackConfigs.get(trackId);
    if (!config) {
      throw new Error(`[ProgressSystem] 缺少轨道配置: trackId=${trackId}`);
    }
    return config;
  }

  /**
   * 处理轨道经验升级。
   *
   * @returns 新等级、升级次数、解锁的里程碑 ID 列表
   */
  private _processTrackLevelUp(
    trackState: ProgressTrackState,
    config: ProgressTrackConfig,
  ): { newLevel: number; levelUps: number; milestonesUnlocked: string[] } {
    let levelUps = 0;
    const milestonesUnlocked: string[] = [];
    const maxLevel = config.maxLevel;

    while (trackState.level < maxLevel) {
      const requiredExp = config.expTable[trackState.level];
      if (typeof requiredExp !== 'number' || requiredExp <= 0) {
        // 经验表不完整，无法继续升级
        break;
      }

      if (trackState.exp < requiredExp) {
        break;
      }

      trackState.exp -= requiredExp;
      trackState.level += 1;
      levelUps += 1;

      // 检查里程碑解锁（里程碑以 m_<trackId>_<level> 格式标识）
      const milestoneId = `m_${config.trackId}_${trackState.level}`;
      if (!trackState.unlockedMilestoneIds.includes(milestoneId)) {
        trackState.unlockedMilestoneIds.push(milestoneId);
        milestonesUnlocked.push(milestoneId);
      }
    }

    return { newLevel: trackState.level, levelUps, milestonesUnlocked };
  }

  /**
   * 基于当前总经验重算轨道等级（不回退经验）。
   *
   * 用于补偿和迁移场景。
   */
  private _recalculateTrackLevel(
    trackState: ProgressTrackState,
    config: ProgressTrackConfig,
  ): { newLevel: number; milestonesUnlocked: string[] } {
    const milestonesUnlocked: string[] = [];
    let level = 1;
    let remainingExp = trackState.exp;
    const maxLevel = config.maxLevel;

    // 从等级 1 开始，按经验表逐级计算可达等级
    if (trackState.level > 1) {
      // 保留现有等级作为起点
      level = trackState.level;
    }

    while (level < maxLevel) {
      const requiredExp = config.expTable[level];
      if (typeof requiredExp !== 'number' || requiredExp <= 0) {
        break;
      }

      if (remainingExp < requiredExp) {
        break;
      }

      remainingExp -= requiredExp;
      level += 1;

      const milestoneId = `m_${config.trackId}_${level}`;
      if (!trackState.unlockedMilestoneIds.includes(milestoneId)) {
        milestonesUnlocked.push(milestoneId);
      }
    }

    return { newLevel: level, milestonesUnlocked };
  }

  /**
   * 计算属性变化摘要。
   *
   * 根据轨道配置的 statModifiers，计算从 oldLevel 到 newLevel 的属性累计变化。
   */
  private _computeAttributeSummary(
    config: ProgressTrackConfig,
    oldLevel: number,
    newLevel: number,
  ): Record<string, number> {
    const summary: Record<string, number> = {};

    if (newLevel <= oldLevel || config.statModifiers.length === 0) {
      return summary;
    }

    const levelDiff = newLevel - oldLevel;

    for (const modifier of config.statModifiers) {
      const statName = modifier.stat;

      switch (modifier.modifierType) {
        case 'flat':
          summary[statName] = (summary[statName] ?? 0) + modifier.value * levelDiff;
          break;
        case 'multiply':
          // 乘法修正在摘要中不直接累加，记录倍率
          summary[statName] = (summary[statName] ?? 0) + modifier.value * levelDiff;
          break;
        case 'percent':
          summary[statName] = (summary[statName] ?? 0) + modifier.value * levelDiff;
          break;
        default:
          break;
      }
    }

    return summary;
  }

  /** 通过 DomainEventBus 发布多轨更新事件 */
  private _publishTrackUpdateEvent(
    heroId: string,
    trackId: string,
    correlationId: string,
    trackResult: ProgressTrackResult,
  ): void {
    const domainBus = DomainEventBus.getInstance();

    // 发布经验应用事件
    domainBus.publish(
      DomainEventType.HERO_EXP_APPLIED,
      {
        heroId,
        trackId,
        expChange: trackResult.expChange,
        oldLevel: trackResult.oldLevel,
        newLevel: trackResult.newLevel,
        milestonesUnlocked: trackResult.milestonesUnlocked,
      },
      heroId,
      'player_global',
      correlationId,
    );

    // 如果等级发生变化，发布等级变化事件
    if (trackResult.newLevel > trackResult.oldLevel) {
      domainBus.publish(
        DomainEventType.HERO_LEVEL_CHANGED,
        {
          heroId,
          trackId,
          oldLevel: trackResult.oldLevel,
          newLevel: trackResult.newLevel,
          levelDiff: trackResult.newLevel - trackResult.oldLevel,
        },
        heroId,
        'player_global',
        correlationId,
      );

      // 发布多轨进度更新事件（供 PowerSystem 战力重算）
      domainBus.publish(
        DomainEventType.HERO_PROGRESS_TRACK_UPDATED,
        {
          heroId,
          trackId,
          level: trackResult.newLevel,
          milestonesUnlocked: trackResult.milestonesUnlocked,
        },
        heroId,
        'player_global',
        correlationId,
      );
    }
  }

  /** 创建空 ProgressResult（无效经验输入时使用） */
  private _createEmptyProgressResult(heroId: string, correlationId: string): ProgressResult {
    const heroState = this._getOrCreateHeroProgressV2(heroId);

    return {
      heroId,
      correlationId,
      expApplied: 0,
      tracks: [],
      levelUpCount: 0,
      totalMilestonesUnlocked: 0,
      attributeSummary: {},
      totalExpReceived: heroState.totalExpReceived,
      updatedAt: heroState.updatedAt,
    };
  }

  /** 确保轨道配置已加载 */
  private _requireTrackConfig(): void {
    if (this._trackConfigs.size === 0) {
      throw new Error('[ProgressSystem] 轨道配置未加载，请先调用 loadTrackConfigs()');
    }
  }

  // ==================== C1.5.9-G-B1-A7: 账号等级内部方法 ====================

  /** 校验账号等级配置合法性 */
  private _validateAccountLevelConfig(config: AccountLevelConfig): void {
    if (!config || !Array.isArray(config.levels) || config.levels.length === 0) {
      throw new Error('[ProgressSystem][A7] account_level_config: levels 为空或缺失');
    }

    const levels = [...config.levels].sort((a, b) => a.level - b.level);

    // 必须从 level 1 开始
    if (levels[0].level !== 1) {
      throw new Error(
        `[ProgressSystem][A7] account_level_config: 第一个等级必须为 1，实际为 ${levels[0].level}`,
      );
    }

    // 必须连续递增且不重复
    for (let i = 0; i < levels.length; i++) {
      // level 不重复检查
      if (i > 0 && levels[i].level === levels[i - 1].level) {
        throw new Error(
          `[ProgressSystem][A7] account_level_config: level ${levels[i].level} 重复`,
        );
      }
      // 连续递增检查
      if (i > 0 && levels[i].level !== levels[i - 1].level + 1) {
        throw new Error(
          `[ProgressSystem][A7] account_level_config: level 不连续，` +
          `${levels[i - 1].level} → ${levels[i].level}`,
        );
      }
    }

    const lastLevel = levels[levels.length - 1];

    // 最后一级 requiredExpToNext 必须为 0（满级标记，不再硬编码具体等级）
    if (lastLevel.requiredExpToNext !== 0) {
      throw new Error(
        `[ProgressSystem][A7] account_level_config: 最后一级 Lv${lastLevel.level} requiredExpToNext 必须为 0`,
      );
    }

    // 1~9 级 requiredExpToNext 必须为正整数
    for (let i = 0; i < levels.length - 1; i++) {
      const entry = levels[i];
      if (
        !Number.isFinite(entry.requiredExpToNext) ||
        entry.requiredExpToNext <= 0 ||
        !Number.isInteger(entry.requiredExpToNext)
      ) {
        throw new Error(
          `[ProgressSystem][A7] account_level_config: Lv${entry.level} ` +
          `requiredExpToNext 必须为正整数，实际为 ${entry.requiredExpToNext}`,
        );
      }
    }

    // 只有最后一级 requiredExpToNext 可以为 0
    for (let i = 0; i < levels.length - 1; i++) {
      if (levels[i].requiredExpToNext === 0) {
        throw new Error(
          `[ProgressSystem][A7] account_level_config: Lv${levels[i].level} 不是最后一级，` +
          `requiredExpToNext 不得为 0`,
        );
      }
    }

    console.log(
      `[ProgressSystem][A7] account_level_config 校验通过: ` +
      `${levels.length} 级, Lv1→Lv${lastLevel.level}, 总经验=` +
      `${levels.filter((l) => l.level < lastLevel.level)
        .reduce((s, l) => s + l.requiredExpToNext, 0)}`,
    );
  }

  /** 构建账号等级映射 */
  private _buildAccountLevelMap(config: AccountLevelConfig): Map<number, AccountLevelEntry> {
    const map = new Map<number, AccountLevelEntry>();
    for (const entry of config.levels) {
      map.set(entry.level, { ...entry });
    }
    return map;
  }

  /**
   * 恢复后账号数据规范化。
   *
   * 要求 account_level_config 已加载。
   */
  private _normalizePlayerData(): void {
    const maxLevel = this.getMaxAccountLevel();
    let changed = false;

    // playerLevel 规范化
    if (!Number.isFinite(this._playerProgressData.playerLevel) || this._playerProgressData.playerLevel < 1) {
      console.warn(
        `[ProgressSystem][A7] 恢复规范化: playerLevel 非法 ` +
        `(${this._playerProgressData.playerLevel}) → 修复为 1`,
      );
      this._playerProgressData.playerLevel = 1;
      changed = true;
    }

    if (this._playerProgressData.playerLevel > maxLevel) {
      console.warn(
        `[ProgressSystem][A7] 恢复规范化: playerLevel 超出上限 ` +
        `(${this._playerProgressData.playerLevel} > ${maxLevel}) → 修复为 ${maxLevel}`,
      );
      this._playerProgressData.playerLevel = maxLevel;
      changed = true;
    }

    // 整数化
    if (!Number.isInteger(this._playerProgressData.playerLevel)) {
      this._playerProgressData.playerLevel = Math.floor(this._playerProgressData.playerLevel);
      changed = true;
    }

    // playerExp 规范化
    if (!Number.isFinite(this._playerProgressData.playerExp) || this._playerProgressData.playerExp < 0) {
      console.warn(
        `[ProgressSystem][A7] 恢复规范化: playerExp 非法 ` +
        `(${this._playerProgressData.playerExp}) → 修复为 0`,
      );
      this._playerProgressData.playerExp = 0;
      changed = true;
    }

    // 整数化
    if (!Number.isInteger(this._playerProgressData.playerExp)) {
      this._playerProgressData.playerExp = Math.floor(this._playerProgressData.playerExp);
      changed = true;
    }

    // 达到满级时 playerExp 强制为 0
    if (this._playerProgressData.playerLevel >= maxLevel) {
      if (this._playerProgressData.playerExp !== 0) {
        this._playerProgressData.playerExp = 0;
        changed = true;
      }
      if (changed) {
        SaveManager.getInstance().savePlayerProgressData(this._playerProgressData);
        console.log('[ProgressSystem][A7] 恢复规范化: 数据已修正并同步 SaveManager');
      }
      return;
    }

    // Lv1~9: 规范化经验（while 规则连续升级）
    let levelUpDuringNormalize = false;
    while (this._playerProgressData.playerLevel < maxLevel) {
      const entry = this._accountLevelMap.get(this._playerProgressData.playerLevel);
      if (!entry || entry.requiredExpToNext <= 0) {
        break;
      }

      if (this._playerProgressData.playerExp < entry.requiredExpToNext) {
        break;
      }

      this._playerProgressData.playerExp -= entry.requiredExpToNext;
      this._playerProgressData.playerLevel += 1;
      levelUpDuringNormalize = true;

      if (this._playerProgressData.playerLevel >= maxLevel) {
        this._playerProgressData.playerExp = 0;
        break;
      }
    }

    if (levelUpDuringNormalize) {
      changed = true;
      console.log(
        `[ProgressSystem][A7] 恢复规范化: 连续升级后 playerLevel=${this._playerProgressData.playerLevel}, ` +
        `playerExp=${this._playerProgressData.playerExp}`,
      );
    }

    if (changed) {
      SaveManager.getInstance().savePlayerProgressData(this._playerProgressData);
      console.log('[ProgressSystem][A7] 恢复规范化: 数据已修正并同步 SaveManager');
    }
  }

  /** 发射账号等级变化事件 */
  private _emitPlayerLevelChanged(data: PlayerLevelChangedEventData): void {
    EventManager.getInstance().emit(ProgressSystem.PLAYER_LEVEL_CHANGED, data);
  }

  /** 创建无变化结果 */
  private _createNoPlayerLevelChangeResult(): PlayerLevelChangeResult {
    const maxLevel = this.getMaxAccountLevel();
    return {
      oldLevel: this._playerProgressData.playerLevel,
      newLevel: this._playerProgressData.playerLevel,
      oldExp: this._playerProgressData.playerExp,
      newExp: this._playerProgressData.playerExp,
      levelsGained: 0,
      expAdded: 0,
      reachedMaxLevel: this._playerProgressData.playerLevel >= maxLevel,
      source: '',
    };
  }

  private _processLevelUp(data: HeroProgressData): HeroLevelUpEventData[] {
    const events: HeroLevelUpEventData[] = [];

    while (this._canLevelUp(data)) {
      const currentConfig = this._getRequiredLevelConfig(data.level);
      const oldLevel = data.level;

      data.exp -= currentConfig.requiredExp;
      data.level += 1;

      const eventData: HeroLevelUpEventData = {
        heroId: data.heroId,
        oldLevel,
        newLevel: data.level,
        remainingExp: data.exp,
      };

      events.push(eventData);
      this._emitHeroLevelUp(eventData);
    }

    return events;
  }

  private _canLevelUp(data: HeroProgressData): boolean {
    const currentConfig = this._levelConfigMap.get(data.level);
    if (!currentConfig) {
      return false;
    }

    if (currentConfig.requiredExp <= 0) {
      return false;
    }

    return data.exp >= currentConfig.requiredExp
      && this._levelConfigMap.has(data.level + 1);
  }

  private _getOrCreateHeroProgress(heroId: string): HeroProgressData {
    let data = this._heroProgressMap.get(heroId);
    if (data) {
      return data;
    }

    const initialLevel = this._getInitialLevel();
    data = {
      heroId,
      level: initialLevel,
      exp: 0,
      power: 0,
    };
    this._heroProgressMap.set(heroId, data);
    return data;
  }

  private _syncPowerAndSave(data: HeroProgressData, shouldRecalculatePower: boolean): {
    newPower: number;
    newTotalPower: number;
  } {
    if (shouldRecalculatePower) {
      this._recalculateHeroPower(data);
    }

    this._recalculateTotalPower();
    SaveManager.getInstance().saveHeroProgressData(data);
    SaveManager.getInstance().savePlayerProgressData(this._playerProgressData);

    return {
      newPower: data.power,
      newTotalPower: this._playerProgressData.totalPower,
    };
  }

  private _recalculateHeroPower(data: HeroProgressData): void {
    const heroConfig = this._getRequiredHeroConfig(data.heroId);
    const levelConfig = this._getRequiredLevelConfig(data.level);
    const oldPower = data.power;
    const newPower = PowerSystem.getInstance().calculateHeroPowerFromProgress(
      heroConfig,
      data,
      levelConfig,
    );

    data.power = newPower;

    if (oldPower !== newPower) {
      this._emitHeroPowerChanged({
        heroId: data.heroId,
        oldPower,
        newPower,
        powerDelta: newPower - oldPower,
      });
    }
  }

  private _recalculateTotalPower(): void {
    const oldTotalPower = this._playerProgressData.totalPower;
    const heroPowers = Array.from(this._heroProgressMap.values()).map((item) => item.power);
    const newTotalPower = PowerSystem.getInstance().calculateTotalPower(heroPowers);

    this._playerProgressData.totalPower = newTotalPower;
    this._playerProgressData.lastGrowthAt = Date.now();

    if (oldTotalPower !== newTotalPower) {
      this._emitTotalPowerChanged({
        oldTotalPower,
        newTotalPower,
        powerDelta: newTotalPower - oldTotalPower,
      });
    }
  }

  private _getInitialLevel(): number {
    this._requireLevelConfig();
    return Math.min(...this._levelConfigMap.keys());
  }

  private _getRequiredLevelConfig(level: number): LevelConfig {
    const config = this._levelConfigMap.get(level);
    if (!config) {
      throw new Error(`[ProgressSystem] 缺少等级配置: level=${level}`);
    }

    return config;
  }

  private _buildLevelConfigMap(config: LevelConfigData): Map<number, LevelConfig> {
    const map = new Map<number, LevelConfig>();

    for (const entry of config.data) {
      map.set(entry.level, entry);
    }

    if (map.size === 0) {
      throw new Error('[ProgressSystem] level_config 未包含任何等级配置');
    }

    return map;
  }

  private _buildHeroConfigMap(config: HeroListData): Map<string, HeroConfig> {
    const map = new Map<string, HeroConfig>();

    for (const entry of config.data) {
      map.set(entry.id, entry);
    }

    if (map.size === 0) {
      throw new Error('[ProgressSystem] hero_list 未包含任何角色配置');
    }

    return map;
  }

  private _getRequiredHeroConfig(heroId: string): HeroConfig {
    const config = this._heroConfigMap.get(heroId);
    if (!config) {
      throw new Error(`[ProgressSystem] 缺少角色配置: heroId=${heroId}`);
    }

    return config;
  }

  private _requireLevelConfig(): void {
    if (this._levelConfigMap.size === 0) {
      throw new Error('[ProgressSystem] 等级配置未加载，请先调用 loadConfig()');
    }
  }

  private _requireConfig(): void {
    this._requireLevelConfig();

    if (this._heroConfigMap.size === 0) {
      throw new Error('[ProgressSystem] 角色配置未加载，请先调用 loadConfig()');
    }

    if (!PowerSystem.getInstance().isConfigLoaded()) {
      throw new Error('[ProgressSystem] 战力配置未加载，请先调用 loadConfig()');
    }
  }

  private _createNoChangeResult(heroId: string): AddHeroExpResult {
    const data = this._getOrCreateHeroProgress(heroId);
    const totalPower = this._playerProgressData.totalPower;

    return {
      heroId,
      expGain: 0,
      oldLevel: data.level,
      newLevel: data.level,
      currentExp: data.exp,
      oldPower: data.power,
      newPower: data.power,
      oldTotalPower: totalPower,
      newTotalPower: totalPower,
      levelUpCount: 0,
      levelUpEvents: [],
    };
  }

  private _createDefaultPlayerProgressData(): PlayerProgressData {
    return {
      playerLevel: 1,
      playerExp: 0,
      totalPower: 0,
      highestStageId: 'STAGE_001',
      lastGrowthAt: 0,
    };
  }

  private _emitHeroExpGained(data: HeroExpGainedEventData): void {
    EventManager.getInstance().emit(ProgressSystem.HERO_EXP_GAINED, data);
  }

  private _emitHeroLevelUp(data: HeroLevelUpEventData): void {
    EventManager.getInstance().emit(ProgressSystem.HERO_LEVEL_UP, data);
  }

  private _emitHeroPowerChanged(data: HeroPowerChangedEventData): void {
    EventManager.getInstance().emit(ProgressSystem.HERO_POWER_CHANGED, data);
  }

  private _emitTotalPowerChanged(data: TotalPowerChangedEventData): void {
    EventManager.getInstance().emit(ProgressSystem.TOTAL_POWER_CHANGED, data);
  }
}
