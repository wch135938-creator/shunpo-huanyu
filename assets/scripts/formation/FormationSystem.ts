// ============================================================
// FormationSystem — Phase9 阵容管理系统
// 职责：阵容创建 / 修改 / 删除 / 激活 / 校验 / TeamSnapshot 生成
// 边界：不修改 BattleSystem / DungeonSystem / DropSystem / Roguelike
//       不修改 HeroSystem / SkillSystem（只读）
//       SaveV2 升级待 Phase9-Step6 统一处理
//       当前使用内存存储，通过 restore(saveData) / save() 与 SaveManager 解耦
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { FormationValidator } from './FormationValidator';
import { TeamSnapshotBuilder } from './TeamSnapshotBuilder';
import { HeroSystem } from '../hero/HeroSystem';
import { SkillSystem } from '../skill/SkillSystem';
import type {
  FormationPreset,
  FormationSlot,
  FormationMode,
  FormationValidationResult,
  TeamSnapshot,
} from './FormationTypes';
import {
  createDefaultFormationPreset,
  createEmptySlots,
  CORE_FORMATION_MODES,
  FORMATION_SLOT_COUNT,
} from './FormationTypes';
import type { FormationSaveData } from '../save/FormationSaveData';

// ==================== 事件数据接口 ====================

/** 阵容创建事件数据 */
export interface FormationCreatedEventData {
  presetId: string;
}

/** 阵容变更事件数据 */
export interface FormationChangedEventData {
  presetId: string;
  mode: FormationMode;
}

/** 阵容校验事件数据 */
export interface FormationValidatedEventData {
  presetId: string;
  result: FormationValidationResult;
}

/** 阵容激活变更事件数据 */
export interface FormationActiveChangedEventData {
  mode: FormationMode;
  previousPresetId: string;
  currentPresetId: string;
}

/** 阵容战力变更事件数据 */
export interface FormationPowerChangedEventData {
  presetId: string;
  mode: FormationMode;
  oldPower: number;
  newPower: number;
}

export class FormationSystem extends BaseSystem {

  // ==================== 事件常量 ====================

  static readonly FORMATION_CREATED = 'formation:created';
  static readonly FORMATION_CHANGED = 'formation:changed';
  static readonly FORMATION_VALIDATED = 'formation:validated';
  static readonly FORMATION_ACTIVE_CHANGED = 'formation:activeChanged';
  static readonly FORMATION_POWER_CHANGED = 'formation:powerChanged';

  // ==================== 内部状态 ====================

  /** 所有阵容预设：presetId → FormationPreset */
  private _presets: Map<string, FormationPreset> = new Map();

  /** 各模式的激活阵容 ID：mode → presetId */
  private _activePresetIds: Map<FormationMode, string> = new Map();

  /** 校验器 */
  private _validator: FormationValidator = new FormationValidator();

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 FormationSystem。
   *
   * 流程：
   * 1. 确保 HeroSystem 已初始化
   * 2. 为所有核心模式创建默认阵容预设
   * 3. 使用已拥有英雄填充默认预设（不足时留空）
   *
   * 注意：此方法幂等，重复调用不会重复创建默认预设。
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[FormationSystem] 已初始化，跳过重复 initialize');
      return true;
    }

    const heroSystem = HeroSystem.getInstance();
    if (!heroSystem.isInitialized()) {
      console.warn('[FormationSystem] HeroSystem 尚未初始化，将在自身初始化前等待...');
      await heroSystem.initialize();
    }

    // 检查 SkillSystem
    const skillSystem = SkillSystem.getInstance();
    if (!skillSystem.isInitialized()) {
      console.warn('[FormationSystem] SkillSystem 尚未初始化，将在自身初始化前等待...');
      await skillSystem.initialize();
    }

    // 为每个核心模式创建默认预设（如果尚不存在）
    const defaultPresetNames: Record<string, string> = {
      pve: '默认推图队',
      dungeon: '默认副本队',
      roguelike: '默认Roguelike队',
      boss: '默认Boss队',
    };

    for (const mode of CORE_FORMATION_MODES) {
      const defaultId = `default_${mode}`;
      if (!this._presets.has(defaultId)) {
        const preset = createDefaultFormationPreset(
          defaultId,
          defaultPresetNames[mode] ?? `默认阵容`,
          mode,
        );
        // 使用已有英雄填充
        this._fillPresetWithOwnedHeroes(preset, heroSystem);
        this._presets.set(defaultId, preset);

        // 设置为该模式的激活阵容
        this._activePresetIds.set(mode, defaultId);
      }
    }

    this._initialized = true;
    console.log(
      `[FormationSystem] 初始化完成，共 ${this._presets.size} 个预设, ` +
      `${this._activePresetIds.size} 个模式已激活`,
    );
    return true;
  }

  /**
   * 从存档数据恢复阵容状态。
   *
   * Phase9-Step3: 接受 FormationSaveData，恢复到内存。
   * Phase9-Step6: 将由此方法对接 SaveManager。
   *
   * ★ 当 saveData 为空 或 恢复后 default_pve 预设为空时，
   *   自动从 HeroSystem 获取已解锁英雄填充阵容。
   *
   * @param saveData  阵容存档数据（null/空时自动使用默认填充）
   */
  restore(saveData: FormationSaveData): void {
    this._requireInitialized();

    if (!saveData || !saveData.presets) {
      console.warn('[FormationSystem] restore: saveData 为空，自动填充默认阵容');
      this._refillAllEmptyPresets();
      return;
    }

    // 恢复预设
    for (const [presetId, preset] of Object.entries(saveData.presets)) {
      this._presets.set(presetId, {
        ...preset,
        slots: preset.slots.map((s) => ({ ...s })),
      });
    }

    // 恢复激活状态
    if (saveData.activePresetIds) {
      for (const [mode, presetId] of Object.entries(saveData.activePresetIds)) {
        if (presetId) {
          this._activePresetIds.set(mode as FormationMode, presetId);
        }
      }
    }

    // ★ 恢复后检查 default_pve 是否为空，空则自动填充
    const defaultPve = this._presets.get('default_pve');
    if (!defaultPve || defaultPve.slots.every((s) => s.heroId === null)) {
      console.warn('[FormationSystem] restore: default_pve 预设为空，自动填充');
      this._refillAllEmptyPresets();
    }

    console.log(
      `[FormationSystem] 恢复完成，` +
      `从存档恢复 ${Object.keys(saveData.presets).length} 个预设, ` +
      `${Object.keys(saveData.activePresetIds ?? {}).length} 个激活状态`,
    );
  }

  /**
   * 导出当前阵容存档数据。
   *
   * Phase9-Step3: 返回 FormationSaveData 供调用方自行持久化。
   * Phase9-Step6: 将改为直接写入 SaveManager。
   *
   * @returns  当前完整的阵容存档数据
   */
  save(): FormationSaveData {
    const presets: Record<string, FormationPreset> = {};
    for (const [presetId, preset] of this._presets.entries()) {
      presets[presetId] = {
        ...preset,
        slots: preset.slots.map((s) => ({ ...s })),
      };
    }

    const activePresetIds: Partial<Record<FormationMode, string>> = {};
    for (const [mode, presetId] of this._activePresetIds.entries()) {
      activePresetIds[mode] = presetId;
    }

    return {
      presets,
      activePresetIds,
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== 阵容预设 CRUD ====================

  /**
   * 创建新阵容预设。
   *
   * 验证：
   * - presetId 唯一
   * - 模式合法
   *
   * @param preset  阵容预设数据
   * @returns       是否创建成功
   */
  createPreset(preset: FormationPreset): boolean {
    this._requireInitialized();

    if (!preset || !preset.id) {
      console.error('[FormationSystem] createPreset: preset 或 preset.id 为空');
      return false;
    }

    if (this._presets.has(preset.id)) {
      console.warn(`[FormationSystem] createPreset: 预设已存在 presetId=${preset.id}`);
      return false;
    }

    // 深拷贝存储
    const stored: FormationPreset = {
      ...preset,
      slots: preset.slots ? preset.slots.map((s) => ({ ...s })) : createEmptySlots(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this._presets.set(stored.id, stored);

    this._emit(FormationSystem.FORMATION_CREATED, {
      presetId: stored.id,
    } as FormationCreatedEventData);

    return true;
  }

  /**
   * 删除阵容预设。
   *
   * 验证：
   * - 预设存在
   * - 不能删除当前激活的预设（需先切换激活）
   *
   * @param presetId  预设 ID
   * @returns         是否删除成功
   */
  deletePreset(presetId: string): boolean {
    this._requireInitialized();

    if (!presetId) {
      console.warn('[FormationSystem] deletePreset: presetId 为空');
      return false;
    }

    if (!this._presets.has(presetId)) {
      console.warn(`[FormationSystem] deletePreset: 预设不存在 presetId=${presetId}`);
      return false;
    }

    // 检查是否为某个模式的激活预设
    for (const [mode, activeId] of this._activePresetIds.entries()) {
      if (activeId === presetId) {
        console.warn(
          `[FormationSystem] deletePreset: 无法删除激活中的预设 presetId=${presetId} mode=${mode}`,
        );
        return false;
      }
    }

    this._presets.delete(presetId);

    this._emit(FormationSystem.FORMATION_CHANGED, {
      presetId,
      mode: 'pve', // 泛用事件，删除不涉及具体模式
    } as FormationChangedEventData);

    return true;
  }

  /**
   * 更新阵容预设。
   *
   * 只更新提供的字段（增量更新）。
   * 更新后重新计算战力。
   *
   * @param presetId  预设 ID
   * @param updates   要更新的字段
   * @returns         是否更新成功
   */
  updatePreset(
    presetId: string,
    updates: Partial<Pick<FormationPreset, 'name' | 'slots'>>,
  ): boolean {
    this._requireInitialized();

    if (!presetId) {
      console.warn('[FormationSystem] updatePreset: presetId 为空');
      return false;
    }

    const preset = this._presets.get(presetId);
    if (!preset) {
      console.warn(`[FormationSystem] updatePreset: 预设不存在 presetId=${presetId}`);
      return false;
    }

    // 更新名称
    if (updates.name !== undefined) {
      preset.name = updates.name;
    }

    // 更新槽位
    if (updates.slots !== undefined) {
      preset.slots = updates.slots.map((s) => ({ ...s }));
    }

    // 重新计算战力
    const oldPower = preset.teamPower;
    const key = TeamSnapshotBuilder.getInstance();
    const snapshot = key.buildTeamSnapshot(preset);
    preset.teamPower = snapshot ? snapshot.teamPower : 0;
    preset.updatedAt = Date.now();

    // 事件
    if (preset.teamPower !== oldPower) {
      this._emit(FormationSystem.FORMATION_POWER_CHANGED, {
        presetId,
        mode: preset.mode,
        oldPower,
        newPower: preset.teamPower,
      } as FormationPowerChangedEventData);
    }

    this._emit(FormationSystem.FORMATION_CHANGED, {
      presetId,
      mode: preset.mode,
    } as FormationChangedEventData);

    return true;
  }

  /**
   * 设置指定模式的激活阵容。
   *
   * @param mode      阵容模式
   * @param presetId  预设 ID
   * @returns         是否设置成功
   */
  setActivePreset(mode: FormationMode, presetId: string): boolean {
    this._requireInitialized();

    if (!mode || !presetId) {
      console.warn('[FormationSystem] setActivePreset: mode 或 presetId 为空');
      return false;
    }

    const preset = this._presets.get(presetId);
    if (!preset) {
      console.warn(`[FormationSystem] setActivePreset: 预设不存在 presetId=${presetId}`);
      return false;
    }

    if (preset.mode !== mode) {
      console.warn(
        `[FormationSystem] setActivePreset: 模式不匹配 ` +
        `preset.mode=${preset.mode} target.mode=${mode}`,
      );
      return false;
    }

    const previous = this._activePresetIds.get(mode) ?? '';
    if (previous === presetId) {
      return false;
    }

    this._activePresetIds.set(mode, presetId);

    this._emit(FormationSystem.FORMATION_ACTIVE_CHANGED, {
      mode,
      previousPresetId: previous,
      currentPresetId: presetId,
    } as FormationActiveChangedEventData);

    return true;
  }

  // ==================== 阵容查询 ====================

  /**
   * 获取指定预设。
   *
   * @param presetId  预设 ID
   * @returns         预设副本，不存在时返回 null
   */
  getPreset(presetId: string): FormationPreset | null {
    const preset = this._presets.get(presetId);
    if (!preset) return null;
    return {
      ...preset,
      slots: preset.slots.map((s) => ({ ...s })),
    };
  }

  /**
   * 获取所有阵容预设。
   *
   * @returns  预设副本数组
   */
  getAllPresets(): FormationPreset[] {
    return Array.from(this._presets.values()).map((p) => ({
      ...p,
      slots: p.slots.map((s) => ({ ...s })),
    }));
  }

  /**
   * 获取指定模式的所有预设。
   *
   * @param mode  阵容模式
   * @returns     预设副本数组
   */
  getPresetsByMode(mode: FormationMode): FormationPreset[] {
    return Array.from(this._presets.values())
      .filter((p) => p.mode === mode)
      .map((p) => ({
        ...p,
        slots: p.slots.map((s) => ({ ...s })),
      }));
  }

  /**
   * 获取指定模式的激活阵容。
   *
   * @param mode  阵容模式
   * @returns     激活的预设副本，不存在时返回 null
   */
  getActivePreset(mode: FormationMode): FormationPreset | null {
    const presetId = this._activePresetIds.get(mode);
    if (!presetId) return null;
    return this.getPreset(presetId);
  }

  /**
   * 获取指定模式的激活阵容 ID。
   *
   * @param mode  阵容模式
   * @returns     激活的预设 ID，不存在时返回空字符串
   */
  getActivePresetId(mode: FormationMode): string {
    return this._activePresetIds.get(mode) ?? '';
  }

  /**
   * 获取所有模式的激活预设 ID 映射。
   *
   * @returns  mode → presetId 的副本
   */
  getActivePresetIds(): Map<FormationMode, string> {
    return new Map(this._activePresetIds);
  }

  /**
   * 获取预设数量。
   */
  getPresetCount(): number {
    return this._presets.size;
  }

  /**
   * 判断预设是否存在。
   * @param presetId  预设 ID
   */
  hasPreset(presetId: string): boolean {
    return this._presets.has(presetId);
  }

  // ==================== 阵容校验 ====================

  /**
   * 校验阵容预设。
   *
   * 委托 FormationValidator 执行完整校验，并通过事件发布结果。
   *
   * @param presetId  预设 ID
   * @returns         校验结果，预设不存在时返回错误
   */
  validatePreset(presetId: string): FormationValidationResult {
    this._requireInitialized();

    if (!presetId) {
      return { valid: false, errors: ['presetId 为空'], warnings: [] };
    }

    const preset = this._presets.get(presetId);
    if (!preset) {
      return {
        valid: false,
        errors: [`预设不存在: ${presetId}`],
        warnings: [],
      };
    }

    const heroSystem = HeroSystem.getInstance();
    const ownershipChecker = FormationValidator.createOwnershipChecker(heroSystem);

    const result = this._validator.validatePreset(preset, ownershipChecker);

    this._emit(FormationSystem.FORMATION_VALIDATED, {
      presetId,
      result,
    } as FormationValidatedEventData);

    return result;
  }

  /**
   * 获取校验器实例（用于外部直接调用校验方法）。
   */
  getValidator(): FormationValidator {
    return this._validator;
  }

  // ==================== TeamSnapshot 生成 ====================

  /**
   * 生成阵容快照。
   *
   * 委托 TeamSnapshotBuilder 组装完整快照。
   * 只对激活阵容生成快照。
   *
   * @param mode  阵容模式
   * @returns     TeamSnapshot，激活阵容不存在或生成失败时返回 null
   */
  generateTeamSnapshot(mode: FormationMode): TeamSnapshot | null {
    this._requireInitialized();

    const presetId = this._activePresetIds.get(mode);
    if (!presetId) {
      console.warn(`[FormationSystem] generateTeamSnapshot: 模式无激活阵容 mode=${mode}`);
      return null;
    }

    const preset = this._presets.get(presetId);
    if (!preset) {
      console.warn(`[FormationSystem] generateTeamSnapshot: 预设不存在 presetId=${presetId}`);
      return null;
    }

    // ★ 安全网：如果预设所有槽位为空，自动从 HeroSystem 回填
    // 处理英雄在 FormationSystem 初始化之后才解锁的时序问题
    const filledSlots = preset.slots.filter((s) => s.heroId !== null).length;
    if (filledSlots === 0) {
      const heroSystem = HeroSystem.getInstance();
      const ownedHeroes = heroSystem.getUnlockedHeroes();
      if (ownedHeroes.length > 0) {
        console.log(
          `[FormationSystem] generateTeamSnapshot: 预设 ${presetId} 槽位为空, ` +
          `自动回填 ${Math.min(ownedHeroes.length, FORMATION_SLOT_COUNT)} 名英雄`,
        );
        this._fillPresetWithOwnedHeroes(preset, heroSystem);

        // 更新战力缓存
        const builder = TeamSnapshotBuilder.getInstance();
        const snapshot = builder.buildTeamSnapshot(preset);
        preset.teamPower = snapshot ? snapshot.teamPower : 0;
        preset.updatedAt = Date.now();
      }
    }

    const builder = TeamSnapshotBuilder.getInstance();
    return builder.buildTeamSnapshot(preset);
  }

  // ==================== 战力更新 ====================

  /**
   * 重新计算指定预设的战力。
   *
   * @param presetId  预设 ID
   */
  recalculatePower(presetId: string): void {
    const preset = this._presets.get(presetId);
    if (!preset) return;

    const oldPower = preset.teamPower;
    const builder = TeamSnapshotBuilder.getInstance();
    const snapshot = builder.buildTeamSnapshot(preset);
    const newPower = snapshot ? snapshot.teamPower : 0;

    if (oldPower !== newPower) {
      preset.teamPower = newPower;
      preset.updatedAt = Date.now();

      this._emit(FormationSystem.FORMATION_POWER_CHANGED, {
        presetId,
        mode: preset.mode,
        oldPower,
        newPower,
      } as FormationPowerChangedEventData);
    }
  }

  /**
   * 重新计算所有预设的战力。
   */
  recalculateAllPower(): void {
    for (const presetId of this._presets.keys()) {
      this.recalculatePower(presetId);
    }
  }

  // ==================== 状态查询 ====================

  /** 判断是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  /** 清空运行时数据（调试用） */
  clearData(): void {
    this._presets.clear();
    this._activePresetIds.clear();
    this._initialized = false;
  }

  // ==================== 内部方法 ====================

  /**
   * 使用已拥有英雄填充预设槽位。
   *
   * 规则：
   * - 优先读取已拥有英雄
   * - 不足时允许空槽
   * - 不得自动创建英雄
   *
   * @param preset      待填充的预设
   * @param heroSystem  HeroSystem 实例
   */
  private _fillPresetWithOwnedHeroes(
    preset: FormationPreset,
    heroSystem: HeroSystem,
  ): void {
    const ownedHeroes = heroSystem.getUnlockedHeroes();

    if (ownedHeroes.length === 0) {
      // 没有已拥有英雄，全部留空
      preset.slots = createEmptySlots();
      return;
    }

    // 按战力降序排列已拥有英雄
    ownedHeroes.sort((a, b) => b.power - a.power);

    const slots = createEmptySlots();
    for (let i = 0; i < Math.min(ownedHeroes.length, FORMATION_SLOT_COUNT); i++) {
      slots[i].heroId = ownedHeroes[i].heroId;
    }

    preset.slots = slots;
  }

  /**
   * 重新填充所有空阵容预设。
   *
   * 遍历所有预设，对非空槽位数为 0 的预设调用 _fillPresetWithOwnedHeroes。
   * 用于 restore() 无存档数据 或 default_pve 为空时的自动回填。
   *
   * 填充后重新计算 preset.teamPower 并更新 updatedAt。
   */
  private _refillAllEmptyPresets(): void {
    const heroSystem = HeroSystem.getInstance();
    const ownedHeroes = heroSystem.getUnlockedHeroes();

    if (ownedHeroes.length === 0) {
      console.warn('[FormationSystem] refillAllEmptyPresets: 无已解锁英雄，阵容保持空');
      return;
    }

    let refilledCount = 0;
    for (const preset of this._presets.values()) {
      const filledCount = preset.slots.filter((s) => s.heroId !== null).length;
      if (filledCount === 0) {
        this._fillPresetWithOwnedHeroes(preset, heroSystem);

        // 更新战力缓存
        const builder = TeamSnapshotBuilder.getInstance();
        const snapshot = builder.buildTeamSnapshot(preset);
        preset.teamPower = snapshot ? snapshot.teamPower : 0;
        preset.updatedAt = Date.now();

        refilledCount += 1;
      }
    }

    if (refilledCount > 0) {
      console.log(
        `[FormationSystem] refillAllEmptyPresets: 已重新填充 ${refilledCount} 个空预设, ` +
        `使用 ${Math.min(ownedHeroes.length, FORMATION_SLOT_COUNT)} 名英雄`,
      );
    }
  }

  /**
   * 公开接口：从 HeroSystem 重新填充所有空阵容预设。
   *
   * 调用时机：
   *   - 英雄解锁后，需要刷新阵容
   *   - restore() 后预设仍为空
   *   - 外部系统（如 BattleManager）在生成快照前确保阵容非空
   *
   * @returns 本次重新填充的预设数量
   */
  refillEmptyPresets(): number {
    this._requireInitialized();

    const before = Array.from(this._presets.values())
      .filter((p) => p.slots.filter((s) => s.heroId !== null).length === 0)
      .length;

    this._refillAllEmptyPresets();

    const after = Array.from(this._presets.values())
      .filter((p) => p.slots.filter((s) => s.heroId !== null).length === 0)
      .length;

    return before - after;
  }

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[FormationSystem] 未初始化，请先调用 initialize()');
    }
  }

  /** 发送事件 */
  private _emit(event: string, data: Record<string, unknown>): void {
    EventManager.getInstance().emit(event, data);
  }
}
