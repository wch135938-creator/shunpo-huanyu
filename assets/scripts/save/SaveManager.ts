// ============================================================
// SaveManager — 项目唯一存档入口
// 职责：存档读写编排 / 版本管理 / 自动保存 / 数据聚合
// 位置：Save 层
// 规范：
//   · 所有存档操作必须经过 SaveManager
//   · 业务模块禁止直接操作 LocalStorage / ISaveAdapter
//   · 禁止 any 类型、禁止硬编码业务逻辑
//   · 不直接依赖 UI（通过 EventManager 通知）
//
// Phase6-Step5: 集成 SaveMigrationSystem / SaveValidator / SaveBackup
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { ISaveAdapter } from './ISaveAdapter';
import { SaveContainer, createDefaultSaveContainer, createDefaultGrowthData, CURRENT_SAVE_VERSION } from './SaveContainer';
import { SaveMigrationSystem, type MigrationResult } from './SaveMigrationSystem';
import { SaveValidator, type ValidationResult } from './SaveValidator';
import { SaveBackup } from './SaveBackup';
import { PowerRecalculateOnMigration, type PowerRecalculateResult } from './PowerRecalculateOnMigration';
import { SaveV2Migrator } from './SaveV2Migrator';
import type { SaveContainerV8 } from './SaveContainerV8';
import { createDefaultSaveContainerV8 } from './SaveContainerV8';
import type { HeroSaveData } from './HeroSaveData';
import type { SkillSaveData } from './SkillSaveData';
import type { FormationSaveData } from './FormationSaveData';
import type { ChapterSaveData } from './ChapterSaveData';
import type { TutorialSaveData } from './TutorialSaveData';
import type { GrowthSaveData } from './GrowthSaveData';
import type { HeroProgressData } from '../data/hero_progress_data';
import type { PlayerProgressData } from '../data/player_progress_data';
import type { PlayerEquipmentData } from '../data/equipment_data';
import type { DungeonSaveData } from './DungeonSaveData';
import type { DropSaveData } from './DropSaveData';
import { createDefaultDropSaveData } from './DropSaveData';
import type { DropHistoryEntry, DropHistoryRecord } from '../data/drop_types';
import type { HeroTalentSaveData } from './HeroTalentSaveData';
import { createDefaultHeroTalentSaveData } from './HeroTalentSaveData';
import type { HeroTalentSaveEntry } from './HeroTalentSaveData';
import { createDefaultChapterEventSaveData } from '../chapter/ChapterEventTypes';
import type { EquipmentSaveDataV2 } from '../equipment/EquipmentLoadoutData';
import { createDefaultEquipmentSaveDataV2 } from '../equipment/EquipmentLoadoutData';

// ---- 存档 Key 前缀 ----
const SAVE_KEY_PREFIX = 'game_save_v';

export class SaveManager extends BaseManager {

  // ==================== 静态常量 ====================

  /** 存档 Key（版本号拼入，未来升级可区分） */
  static readonly SAVE_KEY = `${SAVE_KEY_PREFIX}${CURRENT_SAVE_VERSION}`;

  /** 自动保存防抖延迟 (ms) */
  private static readonly AUTO_SAVE_DELAY = 3000;

  // ==================== 内部状态 ====================

  /** 存储适配器（初始化时注入） */
  private _adapter: ISaveAdapter | null = null;

  /** 当前内存中的存档数据 */
  private _data: SaveContainer | null = null;

  /** 脏标记：true 时表示内存数据有未落盘变更 */
  private _dirty = false;

  /** 自动保存定时器 ID */
  private _autoSaveTimerId: number | null = null;

  /** 保存中锁：防止并发 save */
  private _saving = false;

  /** 是否已完成 initialize */
  private _initialized = false;

  /** Phase6-Step5: 迁移后是否需要战力重算 */
  private _needsPowerRecalc = false;

  /** Phase6-Step5: 最近一次迁移结果 */
  private _lastMigrationResult: MigrationResult | null = null;

  /** Phase6-Step5: 最近一次校验结果 */
  private _lastValidationResult: ValidationResult | null = null;

  // ==================== 初始化 ====================

  /**
   * 初始化存档系统
   *
   * Phase6-Step5 初始化流程：
   * 1. 注入适配器
   * 2. 读取旧存档
   * 3. 创建备份
   * 4. 执行迁移
   * 5. 验证存档
   * 6. 迁移失败时回滚
   *
   * @param adapter  存储适配器（微信环境传 LocalStorageAdapter）
   * @returns        是否存在旧存档
   */
  init(adapter: ISaveAdapter): boolean {
    if (this._initialized) {
      console.warn('[SaveManager] 已初始化，跳过重复 init');
      return this.hasSave();
    }

    this._adapter = adapter;

    // Phase6-Step5: 初始化备份系统
    SaveBackup.getInstance().init(adapter);

    const hasOldSave = adapter.exists(SaveManager.SAVE_KEY);

    if (hasOldSave) {
      const loaded = adapter.read(SaveManager.SAVE_KEY);
      if (loaded) {
        // Phase6-Step5: 完整的迁移流程
        this._data = this._migrateWithBackup(loaded);
        console.log('[SaveManager] 读取旧存档成功, version:', this._data.saveVersion);

        // 迁移后立即落盘（确保结构变更不丢失）
        if (this._lastMigrationResult && this._lastMigrationResult.stepsExecuted > 0) {
          this.save();
        }
      } else {
        // 读取失败（数据损坏等），回退到 V8 默认
        this._data = createDefaultSaveContainerV8() as unknown as SaveContainer;
        console.warn('[SaveManager] 存档读取失败，使用默认数据');
      }
    } else {
      this._data = createDefaultSaveContainerV8() as unknown as SaveContainer;
      console.log('[SaveManager] 无旧存档，创建新存档容器（V8）');
    }

    this._initialized = true;

    // 新存档首次落盘
    if (!hasOldSave) {
      this.save();
    }

    // Phase9-Step6: 发射 V8 加载完成事件
    EventManager.getInstance().emit(EventManager.SAVE_V8_LOADED, {
      version: this._data?.saveVersion,
      timestamp: this._data?.timestamp,
    });

    return hasOldSave;
  }

  // ==================== Phase6-Step5: 迁移、备份、校验 ====================

  /**
   * 带备份的迁移流程。
   *
   * 流程：
   * 1. 深拷贝当前存档作为"迁移前快照"
   * 2. 创建备份
   * 3. 执行迁移
   * 4. 验证迁移结果
   * 5. 迁移失败则回滚到备份
   * 6. 记录迁移结果
   *
   * @param container  已加载的存档容器
   * @returns          迁移后的存档容器
   */
  private _migrateWithBackup(container: SaveContainer): SaveContainer {
    const migrationSystem = SaveMigrationSystem.getInstance();
    const validator = SaveValidator.getInstance();
    const backup = SaveBackup.getInstance();

    const originalVersion = container.saveVersion ?? 0;

    // 版本号已是最新，仅做基础校验
    if (originalVersion === CURRENT_SAVE_VERSION) {
      console.log('[SaveManager] 存档版本已是最新，跳过迁移');
      this._runPostMigrationValidation(container);
      return container;
    }

    console.log(
      `[SaveManager] 检测到旧版本存档 V${originalVersion}，` +
      `当前版本 V${CURRENT_SAVE_VERSION}，开始迁移...`,
    );

    // Step 1: 创建备份
    const backupKey = backup.createBackup(container, 'pre-migration');
    if (!backupKey) {
      console.warn('[SaveManager] 备份创建失败，仍将继续迁移（无回滚能力）');
    }

    // Step 2: 执行迁移
    const migrationResult = migrationSystem.migrate(container);
    this._lastMigrationResult = migrationResult;

    if (!migrationResult.success) {
      console.error(
        `[SaveManager] 存档迁移失败: V${originalVersion} → V${CURRENT_SAVE_VERSION}, ` +
        `错误: ${migrationResult.errors.join('; ')}`,
      );

      // Step 3: 迁移失败 → 回滚
      if (backupKey) {
        console.log(`[SaveManager] 尝试从备份回滚: ${backupKey}`);
        const restoreResult = backup.restoreBackup(backupKey);
        if (restoreResult.success && restoreResult.container) {
          console.log('[SaveManager] 回滚成功，使用迁移前版本');
          return restoreResult.container;
        }
        console.error('[SaveManager] 回滚失败，使用默认存档');
        return createDefaultSaveContainer();
      }

      // 无备份可回滚，使用默认存档
      console.warn('[SaveManager] 无可用备份，使用默认存档');
      return createDefaultSaveContainer();
    }

    // Step 4: 迁移成功 → 校验
    this._needsPowerRecalc = migrationResult.needsPowerRecalc;

    console.log(
      `[SaveManager] 存档迁移成功: V${originalVersion} → V${migrationResult.finalVersion}, ` +
      `执行步骤: ${migrationResult.stepsExecuted}, ` +
      `需要战力重算: ${migrationResult.needsPowerRecalc}`,
    );

    // Phase9-Step6: 发射迁移完成事件
    EventManager.getInstance().emit(EventManager.SAVE_MIGRATED, {
      fromVersion: originalVersion,
      toVersion: migrationResult.finalVersion,
      stepsExecuted: migrationResult.stepsExecuted,
      executedSteps: migrationResult.executedSteps,
    });

    // Step 5: 执行迁移后校验
    this._runPostMigrationValidation(container);

    // Step 6: 迁移后立即落盘
    container.timestamp = Date.now();
    container.saveVersion = CURRENT_SAVE_VERSION;

    return container;
  }

  /**
   * 迁移后校验（同步：结构校验 + 战力合理性检查）。
   */
  private _runPostMigrationValidation(container: SaveContainer): void {
    const validator = SaveValidator.getInstance();

    // 结构校验
    const validationResult = validator.validate(container);
    this._lastValidationResult = validationResult;

    if (!validationResult.valid) {
      console.warn(
        `[SaveManager] 存档校验发现 ${validationResult.errorCount} 个错误, ` +
        `${validationResult.warningCount} 个警告`,
      );

      for (const issue of validationResult.issues) {
        if (issue.severity === 'error') {
          console.error(`[SaveManager]   [ERROR] ${issue.path}: ${issue.message}`);
        }
      }
    } else if (validationResult.warningCount > 0) {
      console.log(
        `[SaveManager] 存档校验通过，但有 ${validationResult.warningCount} 个警告`,
      );
    } else {
      console.log('[SaveManager] 存档校验全部通过');
    }

    // 战力合理性检查（离线模式）
    const sanityResult = PowerRecalculateOnMigration.checkPowerSanity(container);
    if (!sanityResult.sane) {
      console.warn(`[SaveManager] 战力合理性检查发现问题:`);
      for (const issue of sanityResult.issues) {
        console.warn(`[SaveManager]   - ${issue}`);
      }
      this._needsPowerRecalc = true;
    }
  }

  /** 是否需要迁移后战力重算 */
  needsPowerRecalc(): boolean {
    return this._needsPowerRecalc;
  }

  /** 设置战力重算标记 */
  setNeedsPowerRecalc(value: boolean): void {
    this._needsPowerRecalc = value;
  }

  /** 清除战力重算标记（重算完成后由调用方调用） */
  clearPowerRecalcFlag(): void {
    this._needsPowerRecalc = false;
  }

  /**
   * Phase6-Step5: 执行迁移后战力重算。
   *
   * 调用时机：所有系统（PowerSystem, ProgressSystem, EquipmentSystem）loadConfig 完成后。
   *
   * @returns  重算结果，不需要重算时返回 null
   */
  runPowerRecalculation(): PowerRecalculateResult | null {
    if (!this._needsPowerRecalc) {
      return null;
    }

    const recalcSystem = PowerRecalculateOnMigration.getInstance();
    const result = recalcSystem.recalculateAll();

    if (result.success) {
      this._needsPowerRecalc = false;
      // 立即落盘重算后的数据
      this.save();
    }

    return result;
  }

  /** 获取最近一次迁移结果 */
  getLastMigrationResult(): MigrationResult | null {
    return this._lastMigrationResult;
  }

  /** 获取最近一次校验结果 */
  getLastValidationResult(): ValidationResult | null {
    return this._lastValidationResult;
  }

  // ==================== 读写 ====================

  /**
   * 保存存档（完整落盘）
   * @returns 是否成功
   */
  save(): boolean {
    if (!this._ensureReady()) return false;
    if (this._saving) {
      console.warn('[SaveManager] 正在保存中，忽略重复 save');
      return false;
    }

    this._saving = true;

    try {
      const container = this._data!;
      container.timestamp = Date.now();
      container.saveVersion = CURRENT_SAVE_VERSION;

      // Phase6-Step5: 保存前校验（仅 warning 级别不阻塞）
      const validator = SaveValidator.getInstance();
      const quickOk = validator.quickValidate(container);
      if (!quickOk) {
        console.error('[SaveManager] 快速校验失败，存档可能已损坏，仍尝试写入');
      }

      const ok = this._adapter!.write(SaveManager.SAVE_KEY, container);
      if (ok) {
        this._dirty = false;
        EventManager.getInstance().emit(EventManager.SAVE_COMPLETE, container.timestamp);
      } else {
        EventManager.getInstance().emit('save:error', '写入失败');
      }
      return ok;
    } catch (e) {
      console.error('[SaveManager] save 异常', e);
      EventManager.getInstance().emit('save:error', String(e));
      return false;
    } finally {
      this._saving = false;
    }
  }

  /**
   * 读取存档（从磁盘重新加载，覆盖内存）
   * @returns 存档容器，无存档时返回 null
   */
  load(): SaveContainer | null {
    if (!this._adapter) {
      console.error('[SaveManager] load 失败：未初始化');
      return null;
    }

    const loaded = this._adapter.read(SaveManager.SAVE_KEY);
    if (loaded) {
      this._data = this._migrateWithBackup(loaded);
      this._dirty = false;
    }
    return this._data;
  }

  // ==================== 泛型数据读写（操作内存，不立即落盘）====================

  /**
   * 写入子模块数据到内存
   *
   * @param key   子模块名称（如 'player' / 'cards' / 'settings'）
   * @param data  数据对象
   */
  saveData<T>(key: keyof SaveContainer, data: T): void {
    if (!this._ensureReady()) return;

    (this._data as Record<string, unknown>)[key as string] = data;
    this._dirty = true;
  }

  /**
   * 从内存读取子模块数据
   *
   * @param key  子模块名称
   * @returns    数据对象，未初始化时返回 null
   */
  loadData<T>(key: keyof SaveContainer): T | null {
    if (!this._data) return null;
    return (this._data[key] as unknown) as T;
  }

  // ==================== Phase4A 成长数据读写 ====================

  /** 保存完整成长数据到内存，不立即落盘 */
  saveGrowthData(data: GrowthSaveData): void {
    if (!this._ensureReady()) return;

    this._data!.growth = this._cloneGrowthData(data);
    this._dirty = true;
  }

  /** 读取完整成长数据副本 */
  loadGrowthData(): GrowthSaveData | null {
    if (!this._data) return null;
    return this._cloneGrowthData(this._data.growth);
  }

  /** 保存账号成长、最高关卡、总战力缓存数据到内存 */
  savePlayerProgressData(data: PlayerProgressData): void {
    if (!this._ensureReady()) return;

    this._data!.growth.playerProgress = { ...data };
    this._dirty = true;
  }

  /** 读取账号成长、最高关卡、总战力缓存数据副本 */
  loadPlayerProgressData(): PlayerProgressData | null {
    if (!this._data) return null;
    return { ...this._data.growth.playerProgress };
  }

  /** 保存角色成长主数据列表到内存 */
  saveHeroProgressList(list: HeroProgressData[]): void {
    if (!this._ensureReady()) return;

    this._data!.growth.heroProgressList = list.map((item) => ({ ...item }));
    this._dirty = true;
  }

  /** 读取角色成长主数据列表副本 */
  loadHeroProgressList(): HeroProgressData[] {
    if (!this._data) return [];
    return this._data.growth.heroProgressList.map((item) => ({ ...item }));
  }

  /** 保存单个角色成长主数据到内存 */
  saveHeroProgressData(data: HeroProgressData): void {
    if (!this._ensureReady()) return;

    const list = this._data!.growth.heroProgressList;
    const index = list.findIndex((item) => item.heroId === data.heroId);
    const nextData = { ...data };

    if (index >= 0) {
      list[index] = nextData;
    } else {
      list.push(nextData);
    }

    this._dirty = true;
  }

  /** 读取单个角色成长主数据副本 */
  loadHeroProgressData(heroId: string): HeroProgressData | null {
    if (!this._data) return null;

    const data = this._data.growth.heroProgressList.find((item) => item.heroId === heroId);
    return data ? { ...data } : null;
  }

  // ==================== Phase4B 装备数据读写 ====================

  /** 保存装备总数据到内存 */
  savePlayerEquipmentData(data: PlayerEquipmentData): void {
    if (!this._ensureReady()) return;

    this._data!.equipment = {
      instances: { ...data.instances },
      heroEquipment: { ...data.heroEquipment },
    };
    this._dirty = true;
  }

  /** 读取装备总数据副本 */
  loadPlayerEquipmentData(): PlayerEquipmentData | null {
    if (!this._data) return null;

    return {
      instances: { ...this._data.equipment.instances },
      heroEquipment: { ...this._data.equipment.heroEquipment },
    };
  }

  // ==================== Phase10-Step6 装备穿戴关系数据（V2） ====================

  /**
   * 保存 EquipmentSaveDataV2 到内存。
   *
   * 保存到 SaveContainerV8.equipmentData 字段。
   * 只包含穿戴关系（heroId → slotId → equipmentUniqueId），不包含完整装备实例。
   */
  saveEquipmentDataV2(data: EquipmentSaveDataV2): void {
    if (!this._ensureReady()) return;

    const v8 = this._data as import('./SaveContainerV8').SaveContainerV8;
    v8.equipmentData = {
      version: data.version,
      loadouts: data.loadouts.map((e) => ({
        heroId: e.heroId,
        slots: { ...e.slots },
      })),
      meta: { ...data.meta, dirtyFlags: { ...data.meta.dirtyFlags } },
    };
    this._dirty = true;
  }

  /**
   * 读取 EquipmentSaveDataV2 副本。
   *
   * @returns EquipmentSaveDataV2 深拷贝，或 null（如果数据不存在）
   */
  loadEquipmentDataV2(): EquipmentSaveDataV2 | null {
    if (!this._data) return null;

    const v8 = this._data as import('./SaveContainerV8').SaveContainerV8;
    if (!v8.equipmentData) {
      return null;
    }

    return {
      version: v8.equipmentData.version,
      loadouts: v8.equipmentData.loadouts.map((e) => ({
        heroId: e.heroId,
        slots: { ...e.slots },
      })),
      meta: { ...v8.equipmentData.meta, dirtyFlags: { ...v8.equipmentData.meta.dirtyFlags } },
    };
  }

  // ==================== Phase6 地牢数据读写 ====================

  /** 保存地牢总数据到内存 */
  savePlayerDungeonData(data: DungeonSaveData): void {
    if (!this._ensureReady()) return;

    this._data!.dungeon = {
      instances: { ...data.instances },
      runHistory: data.runHistory.map((r) => ({ ...r })),
      todayAttempts: { ...data.todayAttempts },
      lastAttemptDate: data.lastAttemptDate,
      currentStamina: data.currentStamina,
      maxStamina: data.maxStamina,
    };
    this._dirty = true;
  }

  /** 读取地牢总数据副本 */
  loadPlayerDungeonData(): DungeonSaveData | null {
    if (!this._data) return null;

    return {
      instances: { ...this._data.dungeon.instances },
      runHistory: this._data.dungeon.runHistory.map((r) => ({ ...r })),
      todayAttempts: { ...this._data.dungeon.todayAttempts },
      lastAttemptDate: this._data.dungeon.lastAttemptDate,
      currentStamina: this._data.dungeon.currentStamina,
      maxStamina: this._data.dungeon.maxStamina,
    };
  }

  /** 获取当前内存中的完整存档容器（只读参考） */
  getData(): SaveContainer | null {
    return this._data;
  }

  // ==================== 查询与清理 ====================

  /** 是否存在已落盘的存档 */
  hasSave(): boolean {
    if (!this._adapter) return false;
    return this._adapter.exists(SaveManager.SAVE_KEY);
  }

  /** 清除存档（磁盘 + 内存重置为默认） */
  clear(): boolean {
    if (!this._adapter) {
      console.error('[SaveManager] clear 失败：未初始化');
      return false;
    }

    const ok = this._adapter.delete(SaveManager.SAVE_KEY);
    if (ok) {
      this._data = createDefaultSaveContainerV8() as unknown as SaveContainer;
      this._dirty = false;
    }
    return ok;
  }

  // ==================== 自动保存 ====================

  /**
   * 标记脏数据（业务模块修改数据后调用）
   * 触发 3 秒防抖自动保存
   */
  markDirty(): void {
    if (!this._initialized) return;

    this._dirty = true;
    this._scheduleAutoSave();
  }

  /**
   * 自动保存执行（由定时器触发，不手动调用）
   */
  autoSave(): void {
    if (!this._dirty) return;
    if (this._saving) return;

    this.save();
  }

  /** 取消待执行的自动保存定时器 */
  private _cancelAutoSave(): void {
    if (this._autoSaveTimerId !== null) {
      clearTimeout(this._autoSaveTimerId);
      this._autoSaveTimerId = null;
    }
  }

  /** 调度自动保存（防抖：每次 markDirty 重置计时器） */
  private _scheduleAutoSave(): void {
    this._cancelAutoSave();
    this._autoSaveTimerId = setTimeout(() => {
      this._autoSaveTimerId = null;
      this.autoSave();
    }, SaveManager.AUTO_SAVE_DELAY) as unknown as number;
  }

  // ==================== 版本迁移（Phase6-Step5: 委托给 SaveMigrationSystem）====================

  /**
   * 检查并执行版本迁移。
   *
   * Phase6-Step5: 委托给 SaveMigrationSystem 处理。
   * 保留此方法以兼容旧调用路径（load() 等）。
   */
  private _migrateIfNeeded(container: SaveContainer): SaveContainer {
    // 委托给迁移系统
    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(container);

    if (!result.success) {
      console.error(
        `[SaveManager] _migrateIfNeeded 失败: ${result.errors.join('; ')}`,
      );
    }

    if (result.needsPowerRecalc) {
      this._needsPowerRecalc = true;
    }

    this._lastMigrationResult = result;

    return container;
  }

  /** 兼容旧存档：缺失 growth 字段时补默认成长数据（委托给迁移系统） */
  private _ensureGrowthData(container: SaveContainer): void {
    // Phase6-Step5: 此逻辑已整合到 SaveMigrationSystem._migrateV0ToV1
    // 保留方法以兼容现有调用
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'growth'>>;

    if (!target.growth) {
      target.growth = this._createDefaultGrowthDataFromLegacy(container);
      return;
    }

    if (!target.growth.playerProgress) {
      target.growth.playerProgress = this._createDefaultGrowthDataFromLegacy(container).playerProgress;
    }

    if (!Array.isArray(target.growth.heroProgressList)) {
      target.growth.heroProgressList = [];
    }
  }

  private _createDefaultGrowthDataFromLegacy(container: SaveContainer): GrowthSaveData {
    const growth = createDefaultGrowthData();
    const legacyStageId = Number.isFinite(container.player.stageId) ? container.player.stageId : 1;
    const stageId = Math.max(1, Math.floor(legacyStageId));

    growth.playerProgress = {
      playerLevel: container.player.level,
      playerExp: container.player.exp,
      totalPower: container.player.combatPower,
      highestStageId: `STAGE_${String(stageId).padStart(3, '0')}`,
      lastGrowthAt: 0,
    };

    return growth;
  }

  private _cloneGrowthData(data: GrowthSaveData): GrowthSaveData {
    return {
      playerProgress: { ...data.playerProgress },
      heroProgressList: data.heroProgressList.map((item) => ({ ...item })),
    };
  }

  /** 兼容旧存档：缺失 dungeon 字段时补默认地牢数据 */
  private _ensureDungeonData(container: SaveContainer): void {
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'dungeon'>>;

    if (!target.dungeon) {
      target.dungeon = {
        instances: {},
        runHistory: [],
        todayAttempts: {},
        lastAttemptDate: '',
        currentStamina: 100,
        maxStamina: 100,
      };
      return;
    }

    if (!target.dungeon.instances) {
      target.dungeon.instances = {};
    }

    if (!Array.isArray(target.dungeon.runHistory)) {
      target.dungeon.runHistory = [];
    }

    if (!target.dungeon.todayAttempts) {
      target.dungeon.todayAttempts = {};
    }

    if (typeof target.dungeon.currentStamina !== 'number') {
      target.dungeon.currentStamina = 100;
    }

    if (typeof target.dungeon.maxStamina !== 'number') {
      target.dungeon.maxStamina = 100;
    }
  }

  /** 兼容旧存档：缺失 dropHistory 字段时补默认掉落历史数据 */
  private _ensureDropHistoryData(container: SaveContainer): void {
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'dropHistory'>>;

    if (!target.dropHistory) {
      target.dropHistory = createDefaultDropSaveData();
      return;
    }

    if (!Array.isArray(target.dropHistory.history)) {
      target.dropHistory.history = [];
    }

    // Phase8-Step4: 确保 Phase7 字段也存在（兼容旧存档升级）
    if (!Array.isArray(target.dropHistory.dropHistoryRecords)) {
      target.dropHistory.dropHistoryRecords = [];
    }
    if (!target.dropHistory.pitySnapshot) {
      target.dropHistory.pitySnapshot = { pityCounters: {}, lastResetAt: 0 };
    }
    if (!Array.isArray(target.dropHistory.pityRules)) {
      target.dropHistory.pityRules = [];
    }
  }

  // ==================== Phase6-Step2 掉落历史数据读写 ====================

  /** 保存掉落历史数据到内存（Phase8-Step4: 完整深拷贝所有字段） */
  saveDropHistoryData(data: DropSaveData): void {
    if (!this._ensureReady()) return;

    this._data!.dropHistory = {
      history: data.history.map((entry) => ({
        ...entry,
        result: { ...entry.result },
      })),
      dropHistoryRecords: Array.isArray(data.dropHistoryRecords)
        ? data.dropHistoryRecords.map((r) => this._cloneDropHistoryRecord(r))
        : [],
      pitySnapshot: data.pitySnapshot
        ? { pityCounters: { ...data.pitySnapshot.pityCounters }, lastResetAt: data.pitySnapshot.lastResetAt }
        : { pityCounters: {}, lastResetAt: 0 },
      pityRules: Array.isArray(data.pityRules)
        ? data.pityRules.map((r) => ({ ...r }))
        : [],
    };
    this._dirty = true;
  }

  /** 读取掉落历史数据副本（Phase8-Step4: 完整深拷贝所有字段） */
  loadDropHistoryData(): DropSaveData | null {
    if (!this._data) return null;

    const dh = this._data.dropHistory;
    return {
      history: dh.history.map((entry) => ({
        ...entry,
        result: { ...entry.result },
      })),
      dropHistoryRecords: Array.isArray(dh.dropHistoryRecords)
        ? dh.dropHistoryRecords.map((r) => this._cloneDropHistoryRecord(r))
        : [],
      pitySnapshot: dh.pitySnapshot
        ? { pityCounters: { ...dh.pitySnapshot.pityCounters }, lastResetAt: dh.pitySnapshot.lastResetAt }
        : { pityCounters: {}, lastResetAt: 0 },
      pityRules: Array.isArray(dh.pityRules)
        ? dh.pityRules.map((r) => ({ ...r }))
        : [],
    };
  }

  /** Phase8-Step4: 深拷贝单个 DropHistoryRecord */
  private _cloneDropHistoryRecord(r: DropHistoryRecord): DropHistoryRecord {
    return {
      id: r.id,
      playerId: r.playerId,
      sourceId: r.sourceId,
      sourceType: r.sourceType,
      dropTableVersion: r.dropTableVersion,
      seed: r.seed,
      rewards: Array.isArray(r.rewards) ? r.rewards.map((g) => ({ ...g })) : [],
      pityBefore: r.pityBefore
        ? { pityCounters: { ...r.pityBefore.pityCounters }, lastResetAt: r.pityBefore.lastResetAt }
        : { pityCounters: {}, lastResetAt: 0 },
      pityAfter: r.pityAfter
        ? { pityCounters: { ...r.pityAfter.pityCounters }, lastResetAt: r.pityAfter.lastResetAt }
        : { pityCounters: {}, lastResetAt: 0 },
      createdAt: r.createdAt,
    };
  }

  /** 追加单条掉落历史记录到内存 */
  appendDropHistoryEntry(entry: DropHistoryEntry): void {
    if (!this._ensureReady()) return;

    // 限制最多保存 200 条，超出时裁剪旧记录
    const MAX_HISTORY = 200;
    if (this._data!.dropHistory.history.length >= MAX_HISTORY) {
      this._data!.dropHistory.history = this._data!.dropHistory.history.slice(0, MAX_HISTORY - 1);
    }

    this._data!.dropHistory.history.unshift({
      ...entry,
      result: { ...entry.result },
    });
    this._dirty = true;
  }

  // ==================== Phase9-Step6: SaveV2 统一升级 ====================

  /**
   * 检查并执行版本迁移（公共入口）。
   *
   * 供外部系统在配置加载完成后调用，确保存档版本与代码版本一致。
   *
   * @returns  是否执行了迁移
   */
  migrateIfNeeded(): boolean {
    if (!this._ensureReady()) return false;

    const container = this._data;
    if (!container) return false;

    const originalVersion = container.saveVersion ?? 0;
    if (originalVersion >= CURRENT_SAVE_VERSION) {
      return false;
    }

    console.log(
      `[SaveManager] migrateIfNeeded: V${originalVersion} → V${CURRENT_SAVE_VERSION}`,
    );

    this._data = this._migrateWithBackup(container);
    this.save();

    return true;
  }

  /**
   * Phase9-Step6: 延迟技能迁移。
   *
   * 在 HeroRepository 配置加载完成后调用，使用 hero_data.json 的
   * defaultSkillIds 填充 skills 存档数据。
   *
   * 要求：HeroRepository 已通过 ConfigManager 加载 hero_data.json。
   *
   * @param heroDefaultSkillMap  heroId → defaultSkillIds[] 映射
   * @returns                    迁移的技能数量
   */
  deferredSkillMigration(heroDefaultSkillMap: Map<string, string[]>): number {
    if (!this._ensureReady()) return 0;
    if (!heroDefaultSkillMap || heroDefaultSkillMap.size === 0) return 0;

    const v8 = this._data as SaveContainerV8;
    if (!v8 || !v8.heroes) return 0;

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(
      this._data!,
      heroDefaultSkillMap,
    );

    if (result.skillsMigrated > 0) {
      this._dirty = true;
      this.save();
    }

    return result.skillsMigrated;
  }

  // ==================== Phase9-Step6: Hero / Skill / Formation 数据读写 ====================

  /** 保存英雄模块存档数据到内存 */
  saveHeroData(data: HeroSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.heroes = {
      heroStates: { ...data.heroStates },
      saveVersion: data.saveVersion,
      updatedAt: data.updatedAt,
    };
    this._dirty = true;
  }

  /** 读取英雄模块存档数据副本 */
  loadHeroData(): HeroSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.heroes) return null;
    return {
      heroStates: { ...v8.heroes.heroStates },
      saveVersion: v8.heroes.saveVersion,
      updatedAt: v8.heroes.updatedAt,
    };
  }

  /** 保存技能模块存档数据到内存 */
  saveSkillData(data: SkillSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.skills = {
      skillStates: { ...data.skillStates },
      heroSkillLoadouts: { ...data.heroSkillLoadouts },
      saveVersion: data.saveVersion,
      updatedAt: data.updatedAt,
    };
    this._dirty = true;
  }

  /** 读取技能模块存档数据副本 */
  loadSkillData(): SkillSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.skills) return null;
    return {
      skillStates: { ...v8.skills.skillStates },
      heroSkillLoadouts: { ...v8.skills.heroSkillLoadouts },
      saveVersion: v8.skills.saveVersion,
      updatedAt: v8.skills.updatedAt,
    };
  }

  /** 保存阵容模块存档数据到内存 */
  saveFormationData(data: FormationSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.formations = {
      presets: { ...data.presets },
      activePresetIds: { ...data.activePresetIds },
      saveVersion: data.saveVersion,
      updatedAt: data.updatedAt,
    };
    this._dirty = true;
  }

  /** 读取阵容模块存档数据副本 */
  loadFormationData(): FormationSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.formations) return null;
    return {
      presets: { ...v8.formations.presets },
      activePresetIds: { ...v8.formations.activePresetIds },
      saveVersion: v8.formations.saveVersion,
      updatedAt: v8.formations.updatedAt,
    };
  }

  // ==================== Phase9-Step7: 章节数据读写 ====================

  /** 保存章节模块存档数据到内存 */
  saveChapterData(data: ChapterSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.chapters = {
      chapterProgress: { ...data.chapterProgress },
      currentChapterId: data.currentChapterId,
      saveVersion: data.saveVersion,
      updatedAt: data.updatedAt,
    };
    this._dirty = true;
  }

  /** 读取章节模块存档数据副本 */
  loadChapterData(): ChapterSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.chapters) return null;
    return {
      chapterProgress: { ...v8.chapters.chapterProgress },
      currentChapterId: v8.chapters.currentChapterId,
      saveVersion: v8.chapters.saveVersion,
      updatedAt: v8.chapters.updatedAt,
    };
  }

  // ==================== Phase9-Step9: 引导数据读写 ====================

  /** 保存引导模块存档数据到内存 */
  saveTutorialData(data: TutorialSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.tutorial = {
      snapshot: data.snapshot ? {
        currentGroupId: data.snapshot.currentGroupId,
        currentStepId: data.snapshot.currentStepId,
        completedGroupIds: [...data.snapshot.completedGroupIds],
        completedStepIds: [...data.snapshot.completedStepIds],
        skippedGroupIds: [...data.snapshot.skippedGroupIds],
        isComplete: data.snapshot.isComplete,
        snapshotAt: data.snapshot.snapshotAt,
      } : null,
      saveVersion: data.saveVersion,
      updatedAt: data.updatedAt,
    };
    this._dirty = true;
  }

  /** 读取引导模块存档数据副本 */
  loadTutorialData(): TutorialSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.tutorial) return null;
    const t = v8.tutorial;
    return {
      snapshot: t.snapshot ? {
        currentGroupId: t.snapshot.currentGroupId,
        currentStepId: t.snapshot.currentStepId,
        completedGroupIds: [...t.snapshot.completedGroupIds],
        completedStepIds: [...t.snapshot.completedStepIds],
        skippedGroupIds: [...t.snapshot.skippedGroupIds],
        isComplete: t.snapshot.isComplete,
        snapshotAt: t.snapshot.snapshotAt,
      } : null,
      saveVersion: t.saveVersion,
      updatedAt: t.updatedAt,
    };
  }

  // ==================== Phase9-Step10: 分析数据读写 ====================

  /** 保存分析模块存档数据到内存 */
  saveAnalyticsData(data: import('../analytics/AnalyticsSaveData').AnalyticsSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.analytics = {
      totalSessions: data.totalSessions,
      totalPlayTimeMs: data.totalPlayTimeMs,
      totalBattles: data.totalBattles,
      totalBattlesWon: data.totalBattlesWon,
      totalChaptersCompleted: data.totalChaptersCompleted,
      totalDungeonsCompleted: data.totalDungeonsCompleted,
      totalAdsWatched: data.totalAdsWatched,
      recentSessions: Array.isArray(data.recentSessions)
        ? data.recentSessions.map((s) => ({ ...s }))
        : [],
      eventCountByType: data.eventCountByType ? { ...data.eventCountByType } : {},
      saveVersion: data.saveVersion ?? 1,
      updatedAt: data.updatedAt ?? Date.now(),
    };
    this._dirty = true;
  }

  /** 读取分析模块存档数据副本 */
  loadAnalyticsData(): import('../analytics/AnalyticsSaveData').AnalyticsSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.analytics) return null;
    const a = v8.analytics;
    return {
      totalSessions: a.totalSessions ?? 0,
      totalPlayTimeMs: a.totalPlayTimeMs ?? 0,
      totalBattles: a.totalBattles ?? 0,
      totalBattlesWon: a.totalBattlesWon ?? 0,
      totalChaptersCompleted: a.totalChaptersCompleted ?? 0,
      totalDungeonsCompleted: a.totalDungeonsCompleted ?? 0,
      totalAdsWatched: a.totalAdsWatched ?? 0,
      recentSessions: Array.isArray(a.recentSessions)
        ? a.recentSessions.map((s) => ({ ...s }))
        : [],
      eventCountByType: a.eventCountByType ? { ...a.eventCountByType } : {},
      saveVersion: a.saveVersion ?? 1,
      updatedAt: a.updatedAt ?? Date.now(),
    };
  }

  // ==================== Phase10-Step3: 章节事件数据读写 ====================

  /** 保存章节事件存档数据到内存 */
  saveChapterEventData(data: import('../chapter/ChapterEventTypes').ChapterEventSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.chapterData = {
      lastEventId: data.lastEventId ?? '',
      eventHistory: Array.isArray(data.eventHistory)
        ? data.eventHistory.map((r) => ({ ...r }))
        : [],
      saveVersion: data.saveVersion ?? 1,
      updatedAt: data.updatedAt ?? Date.now(),
    };
    this._dirty = true;
  }

  /** 读取章节事件存档数据副本 */
  loadChapterEventData(): import('../chapter/ChapterEventTypes').ChapterEventSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.chapterData) {
      // 旧存档自动补全（不触发迁移）
      v8.chapterData = createDefaultChapterEventSaveData();
    }
    return {
      lastEventId: v8.chapterData.lastEventId ?? '',
      eventHistory: Array.isArray(v8.chapterData.eventHistory)
        ? v8.chapterData.eventHistory.map((r) => ({ ...r }))
        : [],
      saveVersion: v8.chapterData.saveVersion ?? 1,
      updatedAt: v8.chapterData.updatedAt ?? Date.now(),
    };
  }

  // ==================== Phase10-Step1: 天赋数据读写 ====================

  /** 保存英雄天赋模块存档数据到内存 */
  saveHeroTalentData(data: HeroTalentSaveData): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    v8.heroTalentData = {
      heroTalentMap: { ...data.heroTalentMap },
      saveVersion: data.saveVersion,
      updatedAt: data.updatedAt,
    };
    this._dirty = true;
  }

  /** 读取英雄天赋模块存档数据副本 */
  loadHeroTalentData(): HeroTalentSaveData | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.heroTalentData) {
      // Phase9 旧存档兼容：自动初始化天赋数据
      v8.heroTalentData = createDefaultHeroTalentSaveData();
    }
    return {
      heroTalentMap: { ...v8.heroTalentData.heroTalentMap },
      saveVersion: v8.heroTalentData.saveVersion,
      updatedAt: v8.heroTalentData.updatedAt,
    };
  }

  /** 保存单个英雄的天赋存档条目到内存 */
  saveHeroTalentEntry(heroId: string, entry: HeroTalentSaveEntry): void {
    if (!this._ensureReady()) return;
    const v8 = this._data as SaveContainerV8;
    if (!v8.heroTalentData) {
      v8.heroTalentData = createDefaultHeroTalentSaveData();
    }
    v8.heroTalentData.heroTalentMap[heroId] = {
      unlockedTalentIds: [...entry.unlockedTalentIds],
      selectedRouteId: entry.selectedRouteId,
      talentPoints: Number.isFinite(entry.talentPoints) ? entry.talentPoints : 0,
    };
    v8.heroTalentData.updatedAt = Date.now();
    this._dirty = true;
  }

  /** 读取单个英雄的天赋存档条目副本 */
  loadHeroTalentEntry(heroId: string): HeroTalentSaveEntry | null {
    if (!this._data) return null;
    const v8 = this._data as SaveContainerV8;
    if (!v8.heroTalentData) return null;
    const entry = v8.heroTalentData.heroTalentMap[heroId];
    if (!entry) return null;
    return {
      unlockedTalentIds: [...entry.unlockedTalentIds],
      selectedRouteId: entry.selectedRouteId,
      talentPoints: Number.isFinite(entry.talentPoints) ? entry.talentPoints : 0,
    };
  }

  // ==================== 内部工具 ====================

  /** 确保已初始化 + adapter 已注入，未就绪时打印警告并返回 false */
  private _ensureReady(): boolean {
    if (!this._initialized) {
      console.error('[SaveManager] 操作失败：未调用 init()');
      return false;
    }
    if (!this._adapter) {
      console.error('[SaveManager] 操作失败：adapter 为空');
      return false;
    }
    return true;
  }
}
