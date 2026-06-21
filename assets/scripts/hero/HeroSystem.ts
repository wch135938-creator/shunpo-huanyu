// ============================================================
// HeroSystem — Phase9 英雄管理系统
// Phase10-Step1 扩展：成长路线 / 天赋系统
// 职责：英雄解锁 / 等级 / 经验 / 星级 / 突破 / 快照 / 存档 / 天赋
// 边界：不修改 BattleSystem / DungeonSystem / DropSystem / Roguelike
//       SaveV2 升级待 Phase9-Step6 统一处理
//       当前使用内存存储，通过 restore(saveData) / save() 与 SaveManager 解耦
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { HeroRepository } from './HeroRepository';
import { HeroSnapshotBuilder } from './HeroSnapshotBuilder';
import { ConfigManager } from '../core/ConfigManager';
import type { HeroSaveData } from '../save/HeroSaveData';
import type {
  HeroConfig,
  HeroRuntimeState,
  HeroSnapshot,
} from './HeroTypes';
import { createDefaultHeroRuntimeState } from './HeroTypes';
import type {
  GrowthRouteConfig,
  TalentConfig,
  HeroGrowthDataList,
  HeroTalentDataList,
  HeroTalentBonus,
} from './HeroTalentTypes';
import { createDefaultHeroTalentBonus } from './HeroTalentTypes';
import type { HeroTalentSaveData, HeroTalentSaveEntry } from '../save/HeroTalentSaveData';
import {
  createDefaultHeroTalentSaveData,
  getOrCreateHeroTalentEntry,
} from '../save/HeroTalentSaveData';

// ==================== 事件数据接口 ====================

/** 英雄解锁事件数据 */
export interface HeroUnlockedEventData {
  heroId: string;
}

/** 英雄状态更新事件数据 */
export interface HeroUpdatedEventData {
  heroId: string;
}

/** 英雄等级变化事件数据 */
export interface HeroLevelChangedEventData {
  heroId: string;
  oldLevel: number;
  newLevel: number;
}

/** 英雄星级变化事件数据 */
export interface HeroStarChangedEventData {
  heroId: string;
  oldStar: number;
  newStar: number;
}

/** 英雄战力变化事件数据 */
export interface HeroPowerChangedEventData {
  heroId: string;
  oldPower: number;
  newPower: number;
}

/** 英雄经验增加事件数据 */
export interface HeroExpGainedEventData {
  heroId: string;
  expGain: number;
  currentLevel: number;
  currentExp: number;
}

export class HeroSystem extends BaseSystem {

  // ==================== 事件常量 ====================

  static readonly HERO_UNLOCKED = 'hero:unlocked';
  static readonly HERO_UPDATED = 'hero:updated';
  static readonly HERO_LEVEL_CHANGED = 'hero:levelChanged';
  static readonly HERO_STAR_CHANGED = 'hero:starChanged';
  static readonly HERO_POWER_CHANGED = 'hero:powerChanged';
  static readonly HERO_EXP_GAINED = 'hero:expGained';

  /** Phase10-Step1: 天赋解锁事件 */
  static readonly TALENT_UNLOCKED = 'hero:talentUnlocked';
  /** Phase10-Step1: 成长路线选择事件 */
  static readonly ROUTE_SELECTED = 'hero:routeSelected';

  // ==================== 配置常量 ====================

  /** 最高星级 */
  private static readonly MAX_STAR = 7;

  /** 最高突破次数 */
  private static readonly MAX_BREAKTHROUGH = 6;

  /** 每级基础经验需求（公式：level × EXP_PER_LEVEL） */
  private static readonly EXP_PER_LEVEL = 100;

  // ==================== 内部状态 ====================

  /** 英雄运行时状态映射：heroId → HeroRuntimeState */
  private _heroStateMap: Map<string, HeroRuntimeState> = new Map();

  /** Phase10-Step1: 成长路线配置缓存：heroId → GrowthRouteConfig[] */
  private _growthConfigMap: Map<string, GrowthRouteConfig[]> = new Map();

  /** Phase10-Step1: 天赋配置缓存：talentId → TalentConfig */
  private _talentConfigMap: Map<string, TalentConfig> = new Map();

  /** Phase10-Step1: 天赋运行时状态：heroId → HeroTalentSaveEntry */
  private _talentStateMap: Map<string, HeroTalentSaveEntry> = new Map();

  /** Phase10-Step1: 成长配置是否已加载 */
  private _growthConfigLoaded = false;

  /** Phase10-Step1: 天赋配置是否已加载 */
  private _talentConfigLoaded = false;

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 HeroSystem。
   *
   * 流程：
   * 1. 确保 HeroRepository 配置已加载
   * 2. 确保所有配置中存在的英雄在运行时映射中有默认状态
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[HeroSystem] 已初始化，跳过重复 initialize');
      return true;
    }

    const repository = HeroRepository.getInstance();
    if (!repository.isLoaded()) {
      await repository.loadConfig();
    }

    // 为配置中存在但尚未创建状态的英雄补充默认状态
    for (const heroId of repository.getAllHeroIds()) {
      if (!this._heroStateMap.has(heroId)) {
        this._heroStateMap.set(heroId, createDefaultHeroRuntimeState(heroId));
      }
    }

    // Phase10-Step1: 加载成长路线配置
    await this._loadGrowthConfig();

    // Phase10-Step1: 加载天赋配置
    await this._loadTalentConfig();

    this._initialized = true;
    console.log(`[HeroSystem] 初始化完成，共 ${this._heroStateMap.size} 个英雄, ` +
      `${this._growthConfigMap.size} 个英雄有成长路线, ` +
      `${this._talentConfigMap.size} 个天赋节点`);
    return true;
  }

  /**
   * 从存档数据恢复英雄状态。
   *
   * Phase9-Step1: 接受 HeroSaveData，恢复到内存。
   * Phase9-Step6: 将由此方法对接 SaveManager。
   *
   * @param saveData  英雄存档数据
   */
  restore(saveData: HeroSaveData): void {
    this._requireInitialized();

    if (!saveData || !saveData.heroStates) {
      console.warn('[HeroSystem] restore: saveData 为空，跳过恢复');
      return;
    }

    for (const [heroId, state] of Object.entries(saveData.heroStates)) {
      this._heroStateMap.set(heroId, { ...state });
    }

    console.log(`[HeroSystem] 恢复完成，从存档恢复 ${Object.keys(saveData.heroStates).length} 个英雄状态`);
  }

  /**
   * 导出当前英雄存档数据。
   *
   * Phase9-Step1: 返回 HeroSaveData 供调用方自行持久化。
   * Phase9-Step6: 将改为直接写入 SaveManager。
   *
   * @returns  当前完整的英雄存档数据
   */
  save(): HeroSaveData {
    const heroStates: Record<string, HeroRuntimeState> = {};
    for (const [heroId, state] of this._heroStateMap.entries()) {
      heroStates[heroId] = { ...state };
    }

    return {
      heroStates,
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== Phase10-Step1: 天赋数据存取 ====================

  /**
   * 从存档数据恢复天赋状态。
   *
   * @param data  天赋存档数据
   */
  restoreTalentData(data: HeroTalentSaveData): void {
    this._requireInitialized();

    if (!data || !data.heroTalentMap) {
      console.warn('[HeroSystem] restoreTalentData: data 为空，跳过恢复');
      return;
    }

    for (const [heroId, entry] of Object.entries(data.heroTalentMap)) {
      this._talentStateMap.set(heroId, {
        unlockedTalentIds: [...entry.unlockedTalentIds],
        selectedRouteId: entry.selectedRouteId ?? '',
        talentPoints: Number.isFinite(entry.talentPoints) ? entry.talentPoints : 0,
      });
    }

    console.log(`[HeroSystem] 天赋数据恢复完成，${Object.keys(data.heroTalentMap).length} 个英雄`);
  }

  /**
   * 导出当前天赋存档数据。
   *
   * @returns  当前完整的天赋存档数据
   */
  saveTalentData(): HeroTalentSaveData {
    const heroTalentMap: Record<string, HeroTalentSaveEntry> = {};
    for (const [heroId, entry] of this._talentStateMap.entries()) {
      heroTalentMap[heroId] = {
        unlockedTalentIds: [...entry.unlockedTalentIds],
        selectedRouteId: entry.selectedRouteId,
        talentPoints: entry.talentPoints,
      };
    }

    return {
      heroTalentMap,
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== Phase10-Step1: 成长路线查询 ====================

  /**
   * 获取指定英雄的成长路线列表。
   *
   * @param heroId  英雄 ID
   * @returns       成长路线配置数组，不存在时返回空数组
   */
  getHeroGrowthRoutes(heroId: string): GrowthRouteConfig[] {
    this._requireInitialized();
    const routes = this._growthConfigMap.get(heroId);
    if (!routes) return [];
    return routes.map((r) => ({ ...r }));
  }

  /**
   * 获取所有成长路线配置。
   *
   * @returns  heroId → GrowthRouteConfig[] 映射
   */
  getAllGrowthRoutes(): Map<string, GrowthRouteConfig[]> {
    this._requireInitialized();
    const result = new Map<string, GrowthRouteConfig[]>();
    for (const [heroId, routes] of this._growthConfigMap.entries()) {
      result.set(heroId, routes.map((r) => ({ ...r })));
    }
    return result;
  }

  // ==================== Phase10-Step1: 天赋查询 ====================

  /**
   * 获取指定英雄的所有天赋配置。
   *
   * @param heroId  英雄 ID
   * @returns       天赋配置数组，不存在时返回空数组
   */
  getHeroTalents(heroId: string): TalentConfig[] {
    this._requireInitialized();
    const talents: TalentConfig[] = [];
    for (const talent of this._talentConfigMap.values()) {
      if (talent.heroId === heroId) {
        talents.push({ ...talent });
      }
    }
    return talents;
  }

  /**
   * 获取指定英雄指定路线的天赋配置。
   *
   * @param heroId   英雄 ID
   * @param routeId  路线 ID
   * @returns        天赋配置数组
   */
  getHeroTalentsByRoute(heroId: string, routeId: string): TalentConfig[] {
    return this.getHeroTalents(heroId).filter((t) => t.routeId === routeId);
  }

  /**
   * 获取指定英雄已解锁的天赋配置。
   *
   * @param heroId  英雄 ID
   * @returns       已解锁天赋配置数组
   */
  getUnlockedTalents(heroId: string): TalentConfig[] {
    this._requireInitialized();
    const entry = this._getOrCreateTalentEntry(heroId);
    const unlocked: TalentConfig[] = [];
    for (const talentId of entry.unlockedTalentIds) {
      const config = this._talentConfigMap.get(talentId);
      if (config) {
        unlocked.push({ ...config });
      }
    }
    return unlocked;
  }

  /**
   * 获取指定英雄的当前选中路线 ID。
   *
   * @param heroId  英雄 ID
   * @returns       路线 ID，未选择时返回空字符串
   */
  getSelectedRouteId(heroId: string): string {
    this._requireInitialized();
    const entry = this._getOrCreateTalentEntry(heroId);
    return entry.selectedRouteId;
  }

  /**
   * 获取指定英雄的当前天赋点数。
   *
   * @param heroId  英雄 ID
   * @returns       天赋点数
   */
  getHeroTalentPoints(heroId: string): number {
    this._requireInitialized();
    const entry = this._getOrCreateTalentEntry(heroId);
    return entry.talentPoints;
  }

  // ==================== Phase10-Step1: 天赋操作 ====================

  /**
   * 解锁天赋节点。
   *
   * 校验：
   * - 天赋配置存在
   * - 英雄已解锁
   * - 天赋所属路线必须是英雄当前选中路线
   * - 英雄等级满足解锁要求
   * - 天赋尚未解锁
   * - 天赋点数足够
   * - 前置天赋已解锁（如果有的话，按配置中 nextTalentId 反向查找）
   *
   * @param heroId    英雄 ID
   * @param talentId  天赋 ID
   * @returns         是否解锁成功
   */
  unlockTalent(heroId: string, talentId: string): boolean {
    this._requireInitialized();

    const talentConfig = this._talentConfigMap.get(talentId);
    if (!talentConfig) {
      console.error(`[HeroSystem] unlockTalent: 天赋配置不存在 talentId=${talentId}`);
      return false;
    }

    if (talentConfig.heroId !== heroId) {
      console.error(`[HeroSystem] unlockTalent: 天赋不属于该英雄 heroId=${heroId} talentId=${talentId}`);
      return false;
    }

    const heroState = this._heroStateMap.get(heroId);
    if (!heroState || !heroState.unlocked) {
      console.warn(`[HeroSystem] unlockTalent: 英雄未解锁 heroId=${heroId}`);
      return false;
    }

    // 检查天赋所属路线是否为当前选中路线
    const entry = this._getOrCreateTalentEntry(heroId);
    if (entry.selectedRouteId !== talentConfig.routeId) {
      console.warn(`[HeroSystem] unlockTalent: 天赋路线不匹配，` +
        `当前路线=${entry.selectedRouteId} 天赋路线=${talentConfig.routeId}`);
      return false;
    }

    // 检查等级要求
    if (heroState.level < talentConfig.unlockLevel) {
      console.warn(`[HeroSystem] unlockTalent: 等级不足，` +
        `当前=${heroState.level} 需要=${talentConfig.unlockLevel}`);
      return false;
    }

    // 检查是否已解锁
    if (entry.unlockedTalentIds.includes(talentId)) {
      return false; // 已解锁，幂等返回 false
    }

    // 检查前置天赋（查找 nextTalentId 指向此天赋的节点）
    const prerequisiteId = this._findPrerequisiteTalentId(talentId);
    if (prerequisiteId && !entry.unlockedTalentIds.includes(prerequisiteId)) {
      console.warn(`[HeroSystem] unlockTalent: 前置天赋未解锁 prerequisiteId=${prerequisiteId}`);
      return false;
    }

    // 检查天赋点数
    const cost = talentConfig.cost;
    if (entry.talentPoints < cost) {
      console.warn(`[HeroSystem] unlockTalent: 天赋点数不足，` +
        `当前=${entry.talentPoints} 需要=${cost}`);
      return false;
    }

    // 执行解锁
    entry.talentPoints -= cost;
    entry.unlockedTalentIds.push(talentId);

    this._emit(HeroSystem.TALENT_UNLOCKED, { heroId, talentId });

    return true;
  }

  /**
   * 选择成长路线。
   *
   * 只能选择已解锁的路线（通过英雄等级判断）。
   *
   * @param heroId   英雄 ID
   * @param routeId  路线 ID
   * @returns        是否选择成功
   */
  selectGrowthRoute(heroId: string, routeId: string): boolean {
    this._requireInitialized();

    const routes = this._growthConfigMap.get(heroId);
    if (!routes || routes.length === 0) {
      console.warn(`[HeroSystem] selectGrowthRoute: 英雄无成长路线配置 heroId=${heroId}`);
      return false;
    }

    const route = routes.find((r) => r.routeId === routeId);
    if (!route) {
      console.error(`[HeroSystem] selectGrowthRoute: 路线不存在 routeId=${routeId}`);
      return false;
    }

    const heroState = this._heroStateMap.get(heroId);
    if (!heroState || !heroState.unlocked) {
      console.warn(`[HeroSystem] selectGrowthRoute: 英雄未解锁 heroId=${heroId}`);
      return false;
    }

    // 检查等级是否满足路线解锁要求
    if (heroState.level < route.unlockLevel) {
      console.warn(`[HeroSystem] selectGrowthRoute: 等级不足，` +
        `当前=${heroState.level} 需要=${route.unlockLevel}`);
      return false;
    }

    const entry = this._getOrCreateTalentEntry(heroId);
    if (entry.selectedRouteId === routeId) {
      return false; // 已选中同一路线
    }

    entry.selectedRouteId = routeId;

    this._emit(HeroSystem.ROUTE_SELECTED, { heroId, routeId });

    return true;
  }

  /**
   * 为英雄增加天赋点数。
   *
   * @param heroId  英雄 ID
   * @param points  增加点数（默认 1）
   * @returns       是否成功
   */
  addTalentPoints(heroId: string, points: number = 1): boolean {
    this._requireInitialized();

    if (!Number.isFinite(points) || points <= 0) {
      return false;
    }

    const heroState = this._heroStateMap.get(heroId);
    if (!heroState || !heroState.unlocked) {
      console.warn(`[HeroSystem] addTalentPoints: 英雄未解锁 heroId=${heroId}`);
      return false;
    }

    const entry = this._getOrCreateTalentEntry(heroId);
    const safePoints = Math.floor(points);
    entry.talentPoints += safePoints;

    return true;
  }

  // ==================== Phase10-Step1: 天赋加成计算 ====================

  /**
   * 计算英雄天赋总加成。
   *
   * 遍历英雄所有已解锁天赋，按效果类型汇总加成值。
   *
   * @param heroId  英雄 ID
   * @returns       天赋加成结果
   */
  getHeroTalentBonus(heroId: string): HeroTalentBonus {
    this._requireInitialized();

    const bonus = createDefaultHeroTalentBonus(heroId);
    const entry = this._getOrCreateTalentEntry(heroId);

    bonus.selectedRouteId = entry.selectedRouteId;
    bonus.talentPoints = entry.talentPoints;
    bonus.unlockedTalentIds = [...entry.unlockedTalentIds];
    bonus.unlockedTalentCount = entry.unlockedTalentIds.length;

    for (const talentId of entry.unlockedTalentIds) {
      const config = this._talentConfigMap.get(talentId);
      if (!config) continue;

      bonus.bonuses.push({
        effectType: config.effectType,
        sourceTalentId: config.talentId,
        value: config.effectValue,
      });

      const currentSum = bonus.bonusSummary[config.effectType] ?? 0;
      bonus.bonusSummary[config.effectType] = currentSum + config.effectValue;
    }

    return bonus;
  }

  // ==================== Phase10-Step1: 调试方法 ====================

  /** 判断成长配置是否已加载 */
  isGrowthConfigLoaded(): boolean {
    return this._growthConfigLoaded;
  }

  /** 判断天赋配置是否已加载 */
  isTalentConfigLoaded(): boolean {
    return this._talentConfigLoaded;
  }

  // ==================== 英雄解锁 ====================

  /**
   * 解锁英雄。
   *
   * 如果英雄已解锁，直接返回（幂等）。
   *
   * @param heroId  英雄 ID
   * @returns       是否成功解锁（已解锁返回 false）
   */
  unlockHero(heroId: string): boolean {
    this._requireInitialized();

    const repository = HeroRepository.getInstance();
    if (!repository.hasHero(heroId)) {
      console.error(`[HeroSystem] 解锁失败：英雄配置不存在 heroId=${heroId}`);
      return false;
    }

    const state = this._getOrCreateState(heroId);
    if (state.unlocked) {
      return false;
    }

    state.unlocked = true;
    state.unlockedAt = Date.now();
    state.updatedAt = Date.now();

    this._emit(HeroSystem.HERO_UNLOCKED, { heroId } as HeroUnlockedEventData);

    return true;
  }

  // ==================== 英雄查询 ====================

  /**
   * 判断英雄是否已解锁。
   *
   * @param heroId  英雄 ID
   * @returns       是否已解锁
   */
  hasHero(heroId: string): boolean {
    const state = this._heroStateMap.get(heroId);
    return state ? state.unlocked : false;
  }

  /**
   * 获取单个英雄运行时状态。
   *
   * @param heroId  英雄 ID
   * @returns       英雄运行时状态副本，不存在时返回 null
   */
  getHero(heroId: string): HeroRuntimeState | null {
    const state = this._heroStateMap.get(heroId);
    if (!state) return null;
    return { ...state };
  }

  /**
   * 获取所有英雄运行时状态（含未解锁）。
   *
   * @returns  所有英雄运行时状态副本
   */
  getAllHeroes(): HeroRuntimeState[] {
    return Array.from(this._heroStateMap.values()).map((s) => ({ ...s }));
  }

  /**
   * 获取所有已解锁英雄运行时状态。
   *
   * @returns  已解锁英雄运行时状态副本
   */
  getUnlockedHeroes(): HeroRuntimeState[] {
    return Array.from(this._heroStateMap.values())
      .filter((s) => s.unlocked)
      .map((s) => ({ ...s }));
  }

  // ==================== 等级管理 ====================

  /**
   * 升级英雄（直接升级，不消耗经验）。
   *
   * 校验：不能超过配置的 maxLevel。
   *
   * @param heroId      英雄 ID
   * @param levelAmount 升级数量（默认 1）
   * @returns           是否升级成功
   */
  levelUpHero(heroId: string, levelAmount: number = 1): boolean {
    this._requireInitialized();

    if (!Number.isFinite(levelAmount) || levelAmount <= 0) {
      console.warn(`[HeroSystem] levelUpHero: 无效的升级数量 ${levelAmount}`);
      return false;
    }

    const repository = HeroRepository.getInstance();
    const config = repository.getHeroConfig(heroId);
    if (!config) {
      console.error(`[HeroSystem] levelUpHero: 英雄配置不存在 heroId=${heroId}`);
      return false;
    }

    const state = this._requireHeroState(heroId);
    const safeAmount = Math.floor(levelAmount);
    const oldLevel = state.level;
    const newLevel = Math.min(state.level + safeAmount, config.maxLevel);

    if (newLevel <= oldLevel) {
      return false;
    }

    state.level = newLevel;
    state.updatedAt = Date.now();

    this._emit(HeroSystem.HERO_LEVEL_CHANGED, {
      heroId,
      oldLevel,
      newLevel,
    } as HeroLevelChangedEventData);
    this._emit(HeroSystem.HERO_UPDATED, { heroId } as HeroUpdatedEventData);

    return true;
  }

  // ==================== 经验管理 ====================

  /**
   * 增加英雄经验。
   *
   * 自动处理连续升级：当经验超过当前等级所需时自动升级。
   * 公式：每级所需经验 = level × 100。
   *
   * @param heroId  英雄 ID
   * @param exp     增加的经验值
   * @returns       本次操作的升级次数
   */
  addHeroExp(heroId: string, exp: number): number {
    this._requireInitialized();

    if (!Number.isFinite(exp) || exp <= 0) {
      return 0;
    }

    const repository = HeroRepository.getInstance();
    const config = repository.getHeroConfig(heroId);
    if (!config) {
      console.error(`[HeroSystem] addHeroExp: 英雄配置不存在 heroId=${heroId}`);
      return 0;
    }

    const state = this._requireHeroState(heroId);
    if (!state.unlocked) {
      console.warn(`[HeroSystem] addHeroExp: 英雄未解锁 heroId=${heroId}`);
      return 0;
    }

    const safeExp = Math.floor(exp);
    let levelUps = 0;
    const originalLevel = state.level;

    state.exp += safeExp;

    // 连续升级处理
    while (state.level < config.maxLevel) {
      const requiredExp = state.level * HeroSystem.EXP_PER_LEVEL;
      if (state.exp < requiredExp) break;

      state.exp -= requiredExp;
      state.level += 1;
      levelUps += 1;
    }

    state.updatedAt = Date.now();

    // 发送事件
    this._emit(HeroSystem.HERO_EXP_GAINED, {
      heroId,
      expGain: safeExp,
      currentLevel: state.level,
      currentExp: state.exp,
    } as HeroExpGainedEventData);

    if (levelUps > 0) {
      this._emit(HeroSystem.HERO_LEVEL_CHANGED, {
        heroId,
        oldLevel: originalLevel,
        newLevel: state.level,
      } as HeroLevelChangedEventData);
    }

    this._emit(HeroSystem.HERO_UPDATED, { heroId } as HeroUpdatedEventData);

    return levelUps;
  }

  // ==================== 星级管理 ====================

  /**
   * 提升英雄星级。
   *
   * @param heroId       英雄 ID
   * @param starAmount   提升星级数（默认 1）
   * @returns            是否成功
   */
  addStar(heroId: string, starAmount: number = 1): boolean {
    this._requireInitialized();

    if (!Number.isFinite(starAmount) || starAmount <= 0) {
      return false;
    }

    const state = this._requireHeroState(heroId);
    const safeAmount = Math.floor(starAmount);
    const oldStar = state.star;
    const newStar = Math.min(state.star + safeAmount, HeroSystem.MAX_STAR);

    if (newStar <= oldStar) {
      return false;
    }

    state.star = newStar;
    state.updatedAt = Date.now();

    this._emit(HeroSystem.HERO_STAR_CHANGED, {
      heroId,
      oldStar,
      newStar,
    } as HeroStarChangedEventData);
    this._emit(HeroSystem.HERO_UPDATED, { heroId } as HeroUpdatedEventData);

    return true;
  }

  /**
   * 获取英雄星级。
   *
   * @param heroId  英雄 ID
   * @returns       当前星级，不存在时返回 0
   */
  getHeroStar(heroId: string): number {
    const state = this._heroStateMap.get(heroId);
    return state ? state.star : 0;
  }

  // ==================== 突破管理 ====================

  /**
   * 增加英雄突破次数。
   *
   * @param heroId  英雄 ID
   * @returns       是否成功
   */
  addBreakthrough(heroId: string): boolean {
    this._requireInitialized();

    const state = this._requireHeroState(heroId);

    if (state.breakthrough >= HeroSystem.MAX_BREAKTHROUGH) {
      return false;
    }

    state.breakthrough += 1;
    state.updatedAt = Date.now();

    this._emit(HeroSystem.HERO_UPDATED, { heroId } as HeroUpdatedEventData);

    return true;
  }

  /**
   * 获取英雄突破次数。
   *
   * @param heroId  英雄 ID
   * @returns       当前突破次数，不存在时返回 0
   */
  getHeroBreakthrough(heroId: string): number {
    const state = this._heroStateMap.get(heroId);
    return state ? state.breakthrough : 0;
  }

  // ==================== 快照 ====================

  /**
   * 获取单个英雄快照。
   *
   * 委托 HeroSnapshotBuilder 生成完整快照。
   *
   * @param heroId  英雄 ID
   * @returns       英雄快照，英雄不存在或未解锁时返回 null
   */
  getHeroSnapshot(heroId: string): HeroSnapshot | null {
    this._requireInitialized();

    const state = this._heroStateMap.get(heroId);
    if (!state || !state.unlocked) {
      return null;
    }

    return HeroSnapshotBuilder.getInstance().buildHeroSnapshot(heroId, state);
  }

  /**
   * 获取所有已解锁英雄的快照。
   *
   * @returns  英雄快照数组
   */
  getHeroSnapshots(): HeroSnapshot[] {
    this._requireInitialized();

    const builder = HeroSnapshotBuilder.getInstance();
    const snapshots: HeroSnapshot[] = [];

    for (const state of this._heroStateMap.values()) {
      if (!state.unlocked) continue;

      const snapshot = builder.buildHeroSnapshot(state.heroId, state);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  // ==================== 战力更新 ====================

  /**
   * 更新英雄战力缓存。
   *
   * 由外部系统（如 HeroSnapshotBuilder）在重新计算战力后调用。
   *
   * @param heroId    英雄 ID
   * @param newPower  新战力值
   */
  updateHeroPower(heroId: string, newPower: number): void {
    const state = this._heroStateMap.get(heroId);
    if (!state) return;

    const oldPower = state.power;
    if (oldPower === newPower) return;

    state.power = newPower;
    state.updatedAt = Date.now();

    this._emit(HeroSystem.HERO_POWER_CHANGED, {
      heroId,
      oldPower,
      newPower,
    } as HeroPowerChangedEventData);
  }

  // ==================== 批量操作 ====================

  /**
   * 批量解锁英雄。
   *
   * @param heroIds  英雄 ID 数组
   * @returns        成功解锁的数量
   */
  unlockHeroes(heroIds: string[]): number {
    let count = 0;
    for (const heroId of heroIds) {
      if (this.unlockHero(heroId)) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * 判断是否已初始化。
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 清空运行时数据（调试用）。
   */
  clearData(): void {
    this._heroStateMap.clear();
    this._talentStateMap.clear();
    this._growthConfigMap.clear();
    this._talentConfigMap.clear();
    this._growthConfigLoaded = false;
    this._talentConfigLoaded = false;
    this._initialized = false;
  }

  // ==================== Phase10-Step1: 内部配置加载 ====================

  /** 成长路线配置路径 */
  private static readonly GROWTH_CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/hero/hero_growth_config`;

  /** 天赋配置路径 */
  private static readonly TALENT_CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/hero/hero_talent_config`;

  /**
   * 加载成长路线配置。
   */
  private async _loadGrowthConfig(): Promise<void> {
    if (this._growthConfigLoaded) return;

    try {
      const configManager = ConfigManager.getInstance();
      const data = await configManager.loadConfig<HeroGrowthDataList>(
        HeroSystem.GROWTH_CONFIG_PATH,
      );

      this._growthConfigMap.clear();
      for (const entry of data.data) {
        this._growthConfigMap.set(entry.heroId, entry.growthRoutes.map((r) => ({ ...r })));
      }

      this._growthConfigLoaded = true;
      console.log(`[HeroSystem] 成长路线配置加载完成，${this._growthConfigMap.size} 个英雄`);
    } catch (e) {
      console.error(`[HeroSystem] 成长路线配置加载失败: ${e}`);
      // 不阻塞初始化，使用空配置
      this._growthConfigLoaded = true;
    }
  }

  /**
   * 加载天赋配置。
   */
  private async _loadTalentConfig(): Promise<void> {
    if (this._talentConfigLoaded) return;

    try {
      const configManager = ConfigManager.getInstance();
      const data = await configManager.loadConfig<HeroTalentDataList>(
        HeroSystem.TALENT_CONFIG_PATH,
      );

      this._talentConfigMap.clear();
      for (const entry of data.data) {
        this._talentConfigMap.set(entry.talentId, { ...entry });
      }

      this._talentConfigLoaded = true;
      console.log(`[HeroSystem] 天赋配置加载完成，${this._talentConfigMap.size} 个节点`);
    } catch (e) {
      console.error(`[HeroSystem] 天赋配置加载失败: ${e}`);
      // 不阻塞初始化，使用空配置
      this._talentConfigLoaded = true;
    }
  }

  // ==================== Phase10-Step1: 内部辅助方法 ====================

  /** 获取或创建英雄天赋状态条目 */
  private _getOrCreateTalentEntry(heroId: string): HeroTalentSaveEntry {
    let entry = this._talentStateMap.get(heroId);
    if (!entry) {
      entry = {
        unlockedTalentIds: [],
        selectedRouteId: '',
        talentPoints: 0,
      };
      this._talentStateMap.set(heroId, entry);
    }
    return entry;
  }

  /**
   * 查找某天赋的前置天赋 ID。
   *
   * 遍历所有天赋配置，找到 nextTalentId 指向 targetTalentId 的天赋。
   * 返回第一个匹配项（通常只有一个前置）。
   *
   * @param targetTalentId  目标天赋 ID
   * @returns               前置天赋 ID，无前置时返回空字符串
   */
  private _findPrerequisiteTalentId(targetTalentId: string): string {
    for (const talent of this._talentConfigMap.values()) {
      if (talent.nextTalentId === targetTalentId) {
        return talent.talentId;
      }
    }
    return '';
  }

  // ==================== 内部方法 ====================

  /** 获取或创建英雄状态 */
  private _getOrCreateState(heroId: string): HeroRuntimeState {
    let state = this._heroStateMap.get(heroId);
    if (state) return state;

    state = createDefaultHeroRuntimeState(heroId);
    this._heroStateMap.set(heroId, state);
    return state;
  }

  /** 获取英雄状态（已解锁校验） */
  private _requireHeroState(heroId: string): HeroRuntimeState {
    const state = this._getOrCreateState(heroId);
    if (!state.unlocked) {
      throw new Error(`[HeroSystem] 英雄未解锁: heroId=${heroId}`);
    }
    return state;
  }

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[HeroSystem] 未初始化，请先调用 initialize()');
    }
  }

  /** 发送事件 */
  private _emit(event: string, data: Record<string, unknown>): void {
    EventManager.getInstance().emit(event, data);
  }
}
