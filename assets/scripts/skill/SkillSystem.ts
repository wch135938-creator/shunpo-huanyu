// ============================================================
// SkillSystem — Phase9 技能管理系统
// 职责：技能解锁 / 技能等级 / 技能升级 / 技能槽位管理 / 技能快照生成
// 边界：不修改 BattleSystem / DungeonSystem / DropSystem / Roguelike
//       SaveV2 升级待 Phase9-Step6 统一处理
//       当前使用内存存储，通过 restore(saveData) / save() 与 SaveManager 解耦
//       允许读取 HeroSystem（只读），仅用于默认技能 / 英雄技能列表 / 技能归属校验
//       禁止修改 HeroSystem 内部状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { SkillRepository } from './SkillRepository';
import { SkillRuntimeResolver } from './SkillRuntimeResolver';
import { SkillUpgradeRepository } from './SkillUpgradeRepository';
import type { SkillUpgradeEntry } from './SkillUpgradeRepository';
import { ComboSkillRepository } from './ComboSkillRepository';
import type { ComboSkillEntry } from './ComboSkillRepository';
import type { SkillSaveData } from '../save/SkillSaveData';
import type {
  SkillConfig,
  SkillRuntimeState,
  SkillRuntimeSnapshot,
} from './SkillTypes';
import { createDefaultSkillRuntimeState } from './SkillTypes';

// ==================== 事件数据接口 ====================

/** 技能解锁事件数据 */
export interface SkillUnlockedEventData {
  skillId: string;
}

/** 技能等级变化事件数据 */
export interface SkillLevelChangedEventData {
  skillId: string;
  oldLevel: number;
  newLevel: number;
}

/** 技能装配变化事件数据 */
export interface SkillLoadoutChangedEventData {
  heroId: string;
  previousSkillIds: string[];
  currentSkillIds: string[];
}

/** 技能更新事件数据 */
export interface SkillUpdatedEventData {
  skillId: string;
}

export class SkillSystem extends BaseSystem {

  // ==================== 事件常量 ====================

  static readonly SKILL_UNLOCKED = 'skill:unlocked';
  static readonly SKILL_LEVEL_CHANGED = 'skill:levelChanged';
  static readonly SKILL_LOADOUT_CHANGED = 'skill:loadoutChanged';
  static readonly SKILL_UPDATED = 'skill:updated';

  // ==================== 配置常量 ====================

  /** 每个英雄最大技能槽位数 */
  private static readonly MAX_SKILL_SLOTS = 4;

  // ==================== 内部状态 ====================

  /** 技能运行时状态映射：skillId → SkillRuntimeState */
  private _skillStateMap: Map<string, SkillRuntimeState> = new Map();

  /** 英雄技能装配映射：heroId → skillIds[] */
  private _heroSkillLoadouts: Map<string, string[]> = new Map();

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 SkillSystem。
   *
   * 流程：
   * 1. 确保 SkillRepository 配置已加载
   * 2. 确保所有配置中存在的技能在运行时映射中有默认状态
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[SkillSystem] 已初始化，跳过重复 initialize');
      return true;
    }

    const repository = SkillRepository.getInstance();
    if (!repository.isLoaded()) {
      await repository.loadConfig();
    }

    // 为配置中存在但尚未创建状态的技能补充默认状态
    for (const skillId of repository.getAllSkillIds()) {
      if (!this._skillStateMap.has(skillId)) {
        this._skillStateMap.set(skillId, createDefaultSkillRuntimeState(skillId));
      }
    }

    this._initialized = true;
    console.log(`[SkillSystem] 初始化完成，共 ${this._skillStateMap.size} 个技能`);
    return true;
  }

  /**
   * 从存档数据恢复技能状态。
   *
   * Phase9-Step2: 接受 SkillSaveData，恢复到内存。
   * Phase9-Step6: 将由此方法对接 SaveManager。
   *
   * @param saveData  技能存档数据
   */
  restore(saveData: SkillSaveData): void {
    this._requireInitialized();

    if (!saveData || !saveData.skillStates) {
      console.warn('[SkillSystem] restore: saveData 为空，跳过恢复');
      return;
    }

    // 恢复技能状态
    for (const [skillId, state] of Object.entries(saveData.skillStates)) {
      this._skillStateMap.set(skillId, { ...state });
    }

    // 恢复英雄技能装配
    if (saveData.heroSkillLoadouts) {
      for (const [heroId, skillIds] of Object.entries(saveData.heroSkillLoadouts)) {
        this._heroSkillLoadouts.set(heroId, [...skillIds]);
      }
    }

    console.log(
      `[SkillSystem] 恢复完成，` +
      `从存档恢复 ${Object.keys(saveData.skillStates).length} 个技能状态, ` +
      `${Object.keys(saveData.heroSkillLoadouts ?? {}).length} 个英雄装配`,
    );
  }

  /**
   * 导出当前技能存档数据。
   *
   * Phase9-Step2: 返回 SkillSaveData 供调用方自行持久化。
   * Phase9-Step6: 将改为直接写入 SaveManager。
   *
   * @returns  当前完整的技能存档数据
   */
  save(): SkillSaveData {
    const skillStates: Record<string, SkillRuntimeState> = {};
    for (const [skillId, state] of this._skillStateMap.entries()) {
      skillStates[skillId] = { ...state };
    }

    const heroSkillLoadouts: Record<string, string[]> = {};
    for (const [heroId, skillIds] of this._heroSkillLoadouts.entries()) {
      heroSkillLoadouts[heroId] = [...skillIds];
    }

    return {
      skillStates,
      heroSkillLoadouts,
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== 技能解锁 ====================

  /**
   * 解锁技能。
   *
   * 如果技能已解锁，直接返回（幂等）。
   *
   * @param skillId  技能 ID
   * @returns        是否成功解锁（已解锁返回 false）
   */
  unlockSkill(skillId: string): boolean {
    this._requireInitialized();

    const repository = SkillRepository.getInstance();
    if (!repository.hasSkill(skillId)) {
      console.error(`[SkillSystem] 解锁失败：技能配置不存在 skillId=${skillId}`);
      return false;
    }

    const state = this._getOrCreateState(skillId);
    if (state.unlocked) {
      return false;
    }

    state.unlocked = true;
    state.unlockedAt = Date.now();
    state.updatedAt = Date.now();

    this._emit(SkillSystem.SKILL_UNLOCKED, { skillId } as SkillUnlockedEventData);

    return true;
  }

  // ==================== 技能查询 ====================

  /**
   * 判断技能是否已解锁。
   *
   * @param skillId  技能 ID
   * @returns        是否已解锁
   */
  hasSkill(skillId: string): boolean {
    const state = this._skillStateMap.get(skillId);
    return state ? state.unlocked : false;
  }

  /**
   * 获取单个技能运行时状态。
   *
   * @param skillId  技能 ID
   * @returns        技能运行时状态副本，不存在时返回 null
   */
  getSkill(skillId: string): SkillRuntimeState | null {
    const state = this._skillStateMap.get(skillId);
    if (!state) return null;
    return { ...state };
  }

  /**
   * 获取所有技能运行时状态（含未解锁）。
   *
   * @returns  所有技能运行时状态副本
   */
  getAllSkills(): SkillRuntimeState[] {
    return Array.from(this._skillStateMap.values()).map((s) => ({ ...s }));
  }

  /**
   * 获取所有已解锁技能运行时状态。
   *
   * @returns  已解锁技能运行时状态副本
   */
  getUnlockedSkills(): SkillRuntimeState[] {
    return Array.from(this._skillStateMap.values())
      .filter((s) => s.unlocked)
      .map((s) => ({ ...s }));
  }

  // ==================== 等级管理 ====================

  /**
   * 升级技能。
   *
   * 校验：不能超过配置的 maxLevel。
   *
   * @param skillId      技能 ID
   * @param levelAmount  升级数量（默认 1）
   * @returns            是否升级成功
   */
  levelUpSkill(skillId: string, levelAmount: number = 1): boolean {
    this._requireInitialized();

    if (!Number.isFinite(levelAmount) || levelAmount <= 0) {
      console.warn(`[SkillSystem] levelUpSkill: 无效的升级数量 ${levelAmount}`);
      return false;
    }

    const repository = SkillRepository.getInstance();
    const config = repository.getSkillConfig(skillId);
    if (!config) {
      console.error(`[SkillSystem] levelUpSkill: 技能配置不存在 skillId=${skillId}`);
      return false;
    }

    const state = this._requireSkillState(skillId);
    const safeAmount = Math.floor(levelAmount);
    const oldLevel = state.level;
    const newLevel = Math.min(state.level + safeAmount, config.maxLevel);

    if (newLevel <= oldLevel) {
      return false;
    }

    state.level = newLevel;
    state.updatedAt = Date.now();

    this._emit(SkillSystem.SKILL_LEVEL_CHANGED, {
      skillId,
      oldLevel,
      newLevel,
    } as SkillLevelChangedEventData);
    this._emit(SkillSystem.SKILL_UPDATED, { skillId } as SkillUpdatedEventData);

    return true;
  }

  // ==================== 技能槽位管理 ====================

  /**
   * 为英雄装配技能。
   *
   * 验证：
   * - heroId 非空
   * - skillId 已解锁
   * - 不超过最大槽位数
   * - 不重复装配
   *
   * @param heroId   英雄 ID
   * @param skillId  技能 ID
   * @returns        是否装配成功
   */
  equipSkill(heroId: string, skillId: string): boolean {
    this._requireInitialized();

    if (!heroId || !skillId) {
      console.warn('[SkillSystem] equipSkill: heroId 或 skillId 为空');
      return false;
    }

    const repository = SkillRepository.getInstance();
    if (!repository.hasSkill(skillId)) {
      console.error(`[SkillSystem] equipSkill: 技能配置不存在 skillId=${skillId}`);
      return false;
    }

    if (!this.hasSkill(skillId)) {
      console.warn(`[SkillSystem] equipSkill: 技能未解锁 skillId=${skillId}`);
      return false;
    }

    const previous = this._heroSkillLoadouts.get(heroId) ?? [];

    if (previous.includes(skillId)) {
      console.warn(`[SkillSystem] equipSkill: 技能已装配 skillId=${skillId} heroId=${heroId}`);
      return false;
    }

    if (previous.length >= SkillSystem.MAX_SKILL_SLOTS) {
      console.warn(
        `[SkillSystem] equipSkill: 技能槽已满 heroId=${heroId} ` +
        `slots=${previous.length}/${SkillSystem.MAX_SKILL_SLOTS}`,
      );
      return false;
    }

    const current = [...previous, skillId];
    this._heroSkillLoadouts.set(heroId, current);

    this._emit(SkillSystem.SKILL_LOADOUT_CHANGED, {
      heroId,
      previousSkillIds: previous,
      currentSkillIds: current,
    } as SkillLoadoutChangedEventData);

    return true;
  }

  /**
   * 为英雄卸载技能。
   *
   * @param heroId   英雄 ID
   * @param skillId  技能 ID
   * @returns        是否卸载成功
   */
  unequipSkill(heroId: string, skillId: string): boolean {
    this._requireInitialized();

    if (!heroId || !skillId) {
      console.warn('[SkillSystem] unequipSkill: heroId 或 skillId 为空');
      return false;
    }

    const previous = this._heroSkillLoadouts.get(heroId) ?? [];
    const idx = previous.indexOf(skillId);
    if (idx === -1) {
      return false;
    }

    const current = [...previous];
    current.splice(idx, 1);
    this._heroSkillLoadouts.set(heroId, current);

    this._emit(SkillSystem.SKILL_LOADOUT_CHANGED, {
      heroId,
      previousSkillIds: previous,
      currentSkillIds: current,
    } as SkillLoadoutChangedEventData);

    return true;
  }

  /**
   * 获取英雄装备的技能 ID 列表。
   *
   * @param heroId  英雄 ID
   * @returns       技能 ID 数组
   */
  getHeroEquippedSkillIds(heroId: string): string[] {
    return [...(this._heroSkillLoadouts.get(heroId) ?? [])];
  }

  // ==================== 快照 ====================

  /**
   * 获取单个技能运行时快照。
   *
   * 委托 SkillRuntimeResolver 生成完整编译快照。
   *
   * @param skillId  技能 ID
   * @returns        技能运行时快照，技能不存在或未解锁时返回 null
   */
  getSkillSnapshot(skillId: string): SkillRuntimeSnapshot | null {
    this._requireInitialized();

    const state = this._skillStateMap.get(skillId);
    if (!state || !state.unlocked) {
      return null;
    }

    return SkillRuntimeResolver.getInstance().resolveSkillSnapshot(skillId, state.level);
  }

  /**
   * 获取所有已解锁技能的快照。
   *
   * @returns  技能快照数组
   */
  getSkillSnapshots(): SkillRuntimeSnapshot[] {
    this._requireInitialized();

    const resolver = SkillRuntimeResolver.getInstance();
    const snapshots: SkillRuntimeSnapshot[] = [];

    for (const state of this._skillStateMap.values()) {
      if (!state.unlocked) continue;

      const snapshot = resolver.resolveSkillSnapshot(state.skillId, state.level);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  /**
   * 获取指定英雄装备的技能快照列表。
   *
   * @param heroId  英雄 ID
   * @returns       已编译的技能快照数组
   */
  getHeroSkillSnapshots(heroId: string): SkillRuntimeSnapshot[] {
    this._requireInitialized();

    const equippedIds = this._heroSkillLoadouts.get(heroId) ?? [];
    const resolver = SkillRuntimeResolver.getInstance();
    const snapshots: SkillRuntimeSnapshot[] = [];

    for (const skillId of equippedIds) {
      const state = this._skillStateMap.get(skillId);
      if (!state || !state.unlocked) continue;

      const snapshot = resolver.resolveSkillSnapshot(skillId, state.level);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  // ==================== 批量操作 ====================

  /**
   * 批量解锁技能。
   *
   * @param skillIds  技能 ID 数组
   * @returns         成功解锁的数量
   */
  unlockSkills(skillIds: string[]): number {
    let count = 0;
    for (const skillId of skillIds) {
      if (this.unlockSkill(skillId)) {
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

  // ==================== Phase10-Step2: 高级技能 + 连携技能接口 ====================

  /**
   * 获取技能当前等级。
   *
   * 安全方法：未初始化或技能不存在时返回 1（默认等级）。
   *
   * @param skillId  技能 ID
   * @returns        技能等级
   */
  getSkillLevel(skillId: string): number {
    if (!this._initialized) return 1;
    const state = this._skillStateMap.get(skillId);
    return state ? state.level : 1;
  }

  /**
   * 升级技能（单级升级，Phase10 统一入口）。
   *
   * 委托 levelUpSkill(skillId, 1)，保持向后兼容。
   * 新增：升级前检查 SkillUpgradeRepository 配置是否存在。
   *
   * @param skillId  技能 ID
   * @returns        是否升级成功
   */
  upgradeSkill(skillId: string): boolean {
    return this.levelUpSkill(skillId, 1);
  }

  /**
   * 获取技能升级配置数据（所有等级）。
   *
   * 从 skill_upgrade_config.json 读取。
   * 无配置时安全返回空数组。
   *
   * @param skillId  技能 ID
   * @returns        升级配置条目数组
   */
  getSkillUpgradeData(skillId: string): SkillUpgradeEntry[] {
    const upgradeRepo = SkillUpgradeRepository.getInstance();
    if (!upgradeRepo.isLoaded()) {
      console.warn('[SkillSystem] getSkillUpgradeData: SkillUpgradeRepository 未加载配置');
      return [];
    }
    return upgradeRepo.getAllUpgradeEntries(skillId);
  }

  /**
   * 获取连携技能配置。
   *
   * 从 skill_combo_config.json 读取。
   * 无配置时安全返回 null。
   *
   * @param comboId  连携 ID
   * @returns        连携配置，不存在时返回 null
   */
  getComboSkill(comboId: string): ComboSkillEntry | null {
    const comboRepo = ComboSkillRepository.getInstance();
    if (!comboRepo.isLoaded()) {
      console.warn('[SkillSystem] getComboSkill: ComboSkillRepository 未加载配置');
      return null;
    }
    return comboRepo.getComboEntry(comboId);
  }

  /**
   * 检查当前技能组合是否触发连携。
   *
   * 遍历所有连携配置，查找 skillIds 完全包含在输入中的连携。
   * 无配置时安全返回空数组。
   *
   * @param skillIds  当前使用的技能 ID 列表
   * @returns         触发的连携配置列表
   */
  checkComboTrigger(skillIds: string[]): ComboSkillEntry[] {
    if (!skillIds || skillIds.length === 0) return [];

    const comboRepo = ComboSkillRepository.getInstance();
    if (!comboRepo.isLoaded()) {
      console.warn('[SkillSystem] checkComboTrigger: ComboSkillRepository 未加载配置');
      return [];
    }
    return comboRepo.findMatchingCombos(skillIds);
  }

  /**
   * 获取连携加成数值。
   *
   * 从 skill_combo_config.json 读取 effectValue。
   * 无配置时安全返回 0。
   *
   * @param comboId  连携 ID
   * @returns        加成数值
   */
  getComboBonus(comboId: string): number {
    const comboRepo = ComboSkillRepository.getInstance();
    if (!comboRepo.isLoaded()) {
      console.warn('[SkillSystem] getComboBonus: ComboSkillRepository 未加载配置');
      return 0;
    }
    const entry = comboRepo.getComboEntry(comboId);
    return entry ? entry.effectValue : 0;
  }

  // ==================== Phase10-Step2: 高级技能 + 连携技能接口 END ====================

  /**
   * 清空运行时数据（调试用）。
   */
  clearData(): void {
    this._skillStateMap.clear();
    this._heroSkillLoadouts.clear();
    this._initialized = false;
  }

  // ==================== 内部方法 ====================

  /** 获取或创建技能状态 */
  private _getOrCreateState(skillId: string): SkillRuntimeState {
    let state = this._skillStateMap.get(skillId);
    if (state) return state;

    state = createDefaultSkillRuntimeState(skillId);
    this._skillStateMap.set(skillId, state);
    return state;
  }

  /** 获取技能状态（已解锁校验） */
  private _requireSkillState(skillId: string): SkillRuntimeState {
    const state = this._getOrCreateState(skillId);
    if (!state.unlocked) {
      throw new Error(`[SkillSystem] 技能未解锁: skillId=${skillId}`);
    }
    return state;
  }

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[SkillSystem] 未初始化，请先调用 initialize()');
    }
  }

  /** 发送事件 */
  private _emit(event: string, data: Record<string, unknown>): void {
    EventManager.getInstance().emit(event, data);
  }
}
