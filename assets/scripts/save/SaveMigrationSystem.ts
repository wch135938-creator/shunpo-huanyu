// ============================================================
// SaveMigrationSystem — Phase6-Step5 存档迁移系统
// 职责：注册迁移步骤 / 按版本链顺序执行迁移 / 记录迁移历史
// 边界：不操作存储、不加载配置、不修改业务系统运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type { SaveContainer } from './SaveContainer';
import { CURRENT_SAVE_VERSION, createDefaultGrowthData } from './SaveContainer';
import type { GrowthSaveData } from './GrowthSaveData';
import { createDefaultRoguelikeSaveData } from '../data/roguelike_types';
import { createEmptyPitySnapshot } from '../data/drop_types';
import { createDefaultDropSaveData } from './DropSaveData';
import { createDefaultPowerFormulaSnapshot } from '../data/power_types';
import type { PowerFormulaSnapshot } from '../data/power_types';
import type { HeroProgressData } from '../data/hero_progress_data';
import { SaveV2Migrator } from './SaveV2Migrator';

// ---- 类型定义 ----

/** 单步迁移操作签名 */
export type MigrationFn = (container: SaveContainer) => SaveContainer;

/** 迁移步骤定义 */
export interface MigrationStep {
  /** 迁移前版本号 */
  fromVersion: number;
  /** 迁移后版本号 */
  toVersion: number;
  /** 迁移步骤描述 */
  description: string;
  /** 迁移执行函数 */
  migrate: MigrationFn;
}

/** 迁移执行结果 */
export interface MigrationResult {
  /** 本次迁移是否成功 */
  success: boolean;
  /** 迁移前的存档版本号 */
  originalVersion: number;
  /** 迁移后的存档版本号 */
  finalVersion: number;
  /** 实际执行的迁移步数 */
  stepsExecuted: number;
  /** 是否需要战力重算 */
  needsPowerRecalc: boolean;
  /** 执行过的步骤描述列表 */
  executedSteps: string[];
  /** 错误信息列表 */
  errors: string[];
}

/** 迁移前存档快照（用于审计） */
export interface MigrationRecord {
  /** 迁移时间戳 */
  timestamp: number;
  /** 迁移前版本 */
  fromVersion: number;
  /** 迁移后版本 */
  toVersion: number;
  /** 执行步骤数 */
  stepsExecuted: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  errors: string[];
}

// ---- 常量 ----

/** 迁移记录最大保留数 */
const MAX_MIGRATION_RECORDS = 20;

export class SaveMigrationSystem extends BaseSystem {

  // ==================== 内部状态 ====================

  /** 已注册的迁移步骤（按 fromVersion 升序排列） */
  private _steps: MigrationStep[] = [];

  /** 迁移历史记录 */
  private _migrationHistory: MigrationRecord[] = [];

  /** 是否已注册默认迁移步骤 */
  private _defaultStepsRegistered = false;

  // ==================== 初始化 ====================

  /**
   * 注册默认迁移步骤（V0→V1 等）。
   *
   * 调用方在 SaveManager 初始化阶段调用一次。
   */
  registerDefaultSteps(): void {
    if (this._defaultStepsRegistered) {
      return;
    }

    // ---- V0 → V1：初始版本规范化 ----
    // 确保所有子模块字段存在且结构正确
    this.registerStep({
      fromVersion: 0,
      toVersion: 1,
      description: 'V0→V1: 规范化存档结构，确保所有子模块字段存在',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV0ToV1(container);
      },
    });

    // ---- V1 → V2：Phase7 Roguelike 核心框架字段 ----
    // 确保 roguelikeState 字段存在，为 Phase7 地牢图节点系统做准备
    this.registerStep({
      fromVersion: 1,
      toVersion: 2,
      description: 'V1→V2: 新增 roguelikeState 字段（Phase7 Roguelike 核心框架）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV1ToV2(container);
      },
    });

    // ---- V2 → V3：Phase7-Step3 地牢事件历史字段 ----
    // 确保 DungeonRunState 中的 eventHistory 字段存在
    this.registerStep({
      fromVersion: 2,
      toVersion: 3,
      description: 'V2→V3: 新增 eventHistory 字段（Phase7-Step3 地牢事件历史）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV2ToV3(container);
      },
    });

    // ---- V3 → V4：Phase7-Step4 DropHistory + PitySystem ----
    // 确保 DropSaveData 包含 dropHistoryRecords / pitySnapshot / pityRules 字段
    this.registerStep({
      fromVersion: 3,
      toVersion: 4,
      description: 'V3→V4: 新增 dropHistoryRecords + pitySnapshot + pityRules 字段（Phase7-Step4 保底系统）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV3ToV4(container);
      },
    });

    // ---- V4 → V5：Phase7-Step5 ProgressSystem MultiTrack ----
    // 确保 GrowthSaveData 包含 heroProgressV2List 字段
    this.registerStep({
      fromVersion: 4,
      toVersion: 5,
      description: 'V4→V5: 新增 heroProgressV2List 字段（Phase7-Step5 多轨成长）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV4ToV5(container);
      },
    });

    // ---- V5 → V6：Phase7-Step6 PowerSystem Recalculate ----
    // 确保存档包含 PowerFormulaSnapshot（战力公式配置快照）
    this.registerStep({
      fromVersion: 5,
      toVersion: 6,
      description: 'V5→V6: 新增 powerFormulaSnapshot 字段（Phase7-Step6 战力公式快照）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV5ToV6(container);
      },
    });

    // ---- V7 → V8：Phase9-Step6 SaveV2（heroes / skills / formations / SaveMetaV2）----
    // Phase9 系统模块正式接入存档，从 V7 cards + growth 迁移数据
    this.registerStep({
      fromVersion: 7,
      toVersion: 8,
      description: 'V7→V8: Phase9 SaveV2 升级（heroes / skills / formations / SaveMetaV2）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV7ToV8(container);
      },
    });

    // ---- V6 → V7：Phase7-Step7 Artifact + LiveOps + SpecialEvent ----
    // 确保存档包含 artifactInventory / liveOpsState / specialEventStates
    this.registerStep({
      fromVersion: 6,
      toVersion: 7,
      description: 'V6→V7: 新增 ArtifactInventory + LiveOpsState + SpecialEventStates（Phase7-Step7 神器/运营/特殊事件）',
      migrate: (container: SaveContainer): SaveContainer => {
        return this._migrateV6ToV7(container);
      },
    });

    this._defaultStepsRegistered = true;
  }

  // ==================== 步骤管理 ====================

  /**
   * 注册一个迁移步骤。
   *
   * 步骤按 fromVersion 升序自动排列。
   * 相同 fromVersion 的步骤会被拒绝（防止冲突）。
   *
   * @param step  迁移步骤定义
   */
  registerStep(step: MigrationStep): void {
    if (step.fromVersion >= step.toVersion) {
      console.error(
        `[SaveMigrationSystem] 迁移步骤版本号无效: from=${step.fromVersion}, to=${step.toVersion}`,
      );
      return;
    }

    // 检查是否已存在相同 fromVersion 的步骤
    const existing = this._steps.find((s) => s.fromVersion === step.fromVersion);
    if (existing) {
      console.error(
        `[SaveMigrationSystem] 已存在 fromVersion=${step.fromVersion} 的迁移步骤，` +
        `已有: ${existing.description}, 新: ${step.description}`,
      );
      return;
    }

    this._steps.push(step);
    this._steps.sort((a, b) => a.fromVersion - b.fromVersion);
  }

  /** 获取所有已注册的迁移步骤（按版本升序） */
  getMigrationSteps(): MigrationStep[] {
    return [...this._steps];
  }

  /** 获取迁移历史记录 */
  getMigrationHistory(): MigrationRecord[] {
    return [...this._migrationHistory];
  }

  // ==================== 核心：执行迁移 ====================

  /**
   * 按版本链顺序执行存档迁移。
   *
   * 流程：
   * 1. 确定存档当前版本
   * 2. 找到从当前版本到 CURRENT_SAVE_VERSION 的所有步骤
   * 3. 依次执行，任一步失败则终止并记录错误
   * 4. 更新 container.saveVersion
   * 5. 记录迁移历史
   *
   * @param container  待迁移的存档容器（原地修改）
   * @returns          迁移结果
   */
  migrate(container: SaveContainer): MigrationResult {
    const originalVersion = container.saveVersion ?? 0;
    const targetVersion = CURRENT_SAVE_VERSION;

    const result: MigrationResult = {
      success: true,
      originalVersion,
      finalVersion: originalVersion,
      stepsExecuted: 0,
      needsPowerRecalc: false,
      executedSteps: [],
      errors: [],
    };

    // 版本号已是当前版本，无需迁移
    if (originalVersion === targetVersion) {
      return result;
    }

    // 版本号高于当前版本（不应发生，但做防御）
    if (originalVersion > targetVersion) {
      console.warn(
        `[SaveMigrationSystem] 存档版本 ${originalVersion} 高于当前 ${targetVersion}，` +
        '尝试按当前版本处理',
      );
      container.saveVersion = targetVersion;
      result.finalVersion = targetVersion;
      return result;
    }

    // 注册默认步骤（如果尚未注册）
    this.registerDefaultSteps();

    // 找到需要执行的步骤链
    const requiredSteps = this._findMigrationPath(originalVersion, targetVersion);

    if (requiredSteps.length === 0) {
      // 没有匹配的迁移步骤，尝试直接跳到目标版本
      console.warn(
        `[SaveMigrationSystem] 未找到从 ${originalVersion} 到 ${targetVersion} 的迁移路径，` +
        '将直接更新版本号',
      );
      container.saveVersion = targetVersion;
      result.finalVersion = targetVersion;
      result.needsPowerRecalc = true;
      return result;
    }

    // 依次执行迁移步骤
    for (const step of requiredSteps) {
      try {
        console.log(
          `[SaveMigrationSystem] 执行迁移: ${step.description} ` +
          `(V${step.fromVersion} → V${step.toVersion})`,
        );

        step.migrate(container);
        container.saveVersion = step.toVersion;
        result.stepsExecuted += 1;
        result.executedSteps.push(step.description);
        result.finalVersion = step.toVersion;
      } catch (e) {
        const errorMsg = `迁移步骤失败 [${step.description}]: ${e}`;
        console.error(`[SaveMigrationSystem] ${errorMsg}`);
        result.success = false;
        result.errors.push(errorMsg);
        // 终止后续步骤执行
        break;
      }
    }

    // 标记是否需要战力重算（结构有变化时）
    if (result.stepsExecuted > 0) {
      result.needsPowerRecalc = true;
    }

    // 记录迁移历史
    this._recordMigration(result);

    return result;
  }

  // ==================== 版本兼容性查询 ====================

  /**
   * 检查存档是否可以迁移到当前版本。
   *
   * @param container  存档容器
   * @returns          是否可迁移
   */
  canMigrate(container: SaveContainer): boolean {
    const version = container.saveVersion ?? 0;
    if (version === CURRENT_SAVE_VERSION) return true;
    if (version > CURRENT_SAVE_VERSION) return false;

    this.registerDefaultSteps();
    const path = this._findMigrationPath(version, CURRENT_SAVE_VERSION);
    return path.length > 0 || version > 0;
  }

  /** 清空迁移历史记录 */
  clearHistory(): void {
    this._migrationHistory = [];
  }

  // ==================== 内部：V0→V1 迁移逻辑 ====================

  /**
   * V0→V1 迁移：确保所有子模块字段存在。
   *
   * 这是最关键的首次迁移，兼容所有 V0（无版本号或版本号为 0）的旧存档。
   */
  private _migrateV0ToV1(container: SaveContainer): SaveContainer {
    // 1. 确保 player 子模块字段完整
    this._ensurePlayerData(container);

    // 2. 确保 cards 字段为数组
    this._ensureCardsData(container);

    // 3. 确保 equipment 子模块
    this._ensureEquipmentData(container);

    // 4. 确保 settings 子模块
    this._ensureSettingsData(container);

    // 5. 确保 ad 子模块
    this._ensureAdData(container);

    // 6. 确保 growth 子模块（含 Legacy 数据迁移）
    this._ensureGrowthData(container);

    // 7. 确保 dungeon 子模块
    this._ensureDungeonData(container);

    // 8. 确保 dropHistory 子模块
    this._ensureDropHistoryData(container);

    // 9. 更新时间戳
    this._ensureTimestamp(container);

    return container;
  }

  // ==================== 内部：V1→V2 迁移逻辑 ====================

  /**
   * V1→V2 迁移：新增 roguelikeState 字段。
   *
   * Phase7 Roguelike 核心框架要求存档中包含 roguelikeState，
   * 用于存储活跃运行状态、运行历史和保底计数器。
   */
  private _migrateV1ToV2(container: SaveContainer): SaveContainer {
    // 确保 roguelikeState 字段存在
    if (!container.roguelikeState) {
      container.roguelikeState = createDefaultRoguelikeSaveData();
      console.log('[SaveMigrationSystem] V1→V2: 已添加 roguelikeState 默认字段');
    }

    // 更新时间戳
    container.timestamp = Date.now();

    return container;
  }

  // ==================== 内部：V2→V3 迁移逻辑 ====================

  /**
   * V2→V3 迁移：新增 eventHistory 字段。
   *
   * Phase7-Step3 地牢事件系统要求 DungeonRunState 包含 eventHistory。
   * 此迁移确保现有活跃运行和历史记录都有 eventHistory 字段。
   */
  private _migrateV2ToV3(container: SaveContainer): SaveContainer {
    if (!container.roguelikeState) {
      container.roguelikeState = createDefaultRoguelikeSaveData();
    }

    // 确保活跃运行有 eventHistory
    if (container.roguelikeState.activeRun) {
      if (!container.roguelikeState.activeRun.eventHistory) {
        container.roguelikeState.activeRun.eventHistory = [];
        console.log('[SaveMigrationSystem] V2→V3: 已为 activeRun 添加 eventHistory');
      }
    }

    // 确保历史运行有 eventHistory
    if (container.roguelikeState.runHistory) {
      for (let i = 0; i < container.roguelikeState.runHistory.length; i++) {
        const run = container.roguelikeState.runHistory[i];
        if (!run.eventHistory) {
          run.eventHistory = [];
        }
      }
      if (container.roguelikeState.runHistory.length > 0) {
        console.log(
          `[SaveMigrationSystem] V2→V3: 已为 ${container.roguelikeState.runHistory.length} 条 runHistory 添加 eventHistory`,
        );
      }
    }

    // 更新时间戳
    container.timestamp = Date.now();

    return container;
  }

  // ==================== 内部：V3→V4 迁移逻辑 ====================

  /**
   * V3→V4 迁移：新增 DropHistoryRecord + PitySnapshot + PityRules 字段。
   *
   * Phase7-Step4 掉落保底系统要求 DropSaveData 包含：
   * - dropHistoryRecords: 新版掉落历史（含保底状态）
   * - pitySnapshot: 保底计数器快照
   * - pityRules: 保底规则配置
   *
   * 此迁移确保现有存档的 DropSaveData 包含这些字段，保持向后兼容。
   */
  private _migrateV3ToV4(container: SaveContainer): SaveContainer {
    // 1. 确保 DropSaveData 包含 Phase7-Step4 新增字段
    this._ensureDropHistoryV4Fields(container);

    // 2. 确保 RoguelikeSaveData 中现有 pityCounters 同步到 DropSaveData
    this._syncPityCountersToDropSave(container);

    // 3. 更新时间戳
    container.timestamp = Date.now();

    console.log('[SaveMigrationSystem] V3→V4: 已添加 dropHistoryRecords / pitySnapshot / pityRules 字段');

    return container;
  }

  /**
   * 确保 DropSaveData 包含 V4 新增字段。
   */
  private _ensureDropHistoryV4Fields(container: SaveContainer): void {
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'dropHistory'>>;

    if (!target.dropHistory) {
      target.dropHistory = createDefaultDropSaveData();
      return;
    }

    if (!Array.isArray(target.dropHistory.dropHistoryRecords)) {
      target.dropHistory.dropHistoryRecords = [];
      console.log('[SaveMigrationSystem] V3→V4: 已添加 dropHistoryRecords 空数组');
    }

    if (!target.dropHistory.pitySnapshot) {
      target.dropHistory.pitySnapshot = createEmptyPitySnapshot();
      console.log('[SaveMigrationSystem] V3→V4: 已添加 pitySnapshot 默认值');
    }

    if (!Array.isArray(target.dropHistory.pityRules)) {
      target.dropHistory.pityRules = [];
      console.log('[SaveMigrationSystem] V3→V4: 已添加 pityRules 空数组');
    }
  }

  /**
   * 从 RoguelikeSaveData.pityCounters 同步到 DropSaveData.pitySnapshot。
   *
   * Phase7-Step1 已在 RoguelikeSaveData 中定义了 pityCounters: Record<string, number>。
   * V3→V4 迁移时，如果 RoguelikeSaveData 中已有保底计数数据，将其合并到 DropSaveData 的 pitySnapshot 中，
   * 避免旧保底数据丢失。
   */
  private _syncPityCountersToDropSave(container: SaveContainer): void {
    const roguelike = container.roguelikeState;
    if (!roguelike || !roguelike.pityCounters) return;

    const roguelikeCounters = roguelike.pityCounters;
    if (Object.keys(roguelikeCounters).length === 0) return;

    const dropSave = container.dropHistory;
    if (!dropSave) return;

    if (!dropSave.pitySnapshot) {
      dropSave.pitySnapshot = createEmptyPitySnapshot();
    }

    // 合并 RoguelikeSaveData 的保底计数到 DropSaveData
    for (const [key, count] of Object.entries(roguelikeCounters)) {
      if (typeof count === 'number' && count > 0) {
        dropSave.pitySnapshot.pityCounters[key] = count;
      }
    }

    console.log(
      `[SaveMigrationSystem] V3→V4: 已同步 ${Object.keys(roguelikeCounters).length} 个保底计数器到 DropSaveData`,
    );
  }

  // ==================== 内部：V4→V5 迁移逻辑 ====================

  /**
   * V4→V5 迁移：新增 heroProgressV2List 字段。
   *
   * Phase7-Step5 多轨成长系统要求 GrowthSaveData 包含：
   * - heroProgressV2List: 英雄多轨成长状态列表
   *
   * 此迁移从旧 V1 heroProgressList 派生初始 V2 数据：
   * - 将 heroProgressList 中每个英雄的 level/exp 映射到 "level" 轨道
   * - 保留 totalExpReceived 为 exp 值
   *
   * 兼容旧存档：如果 heroProgressList 为空，初始化空 heroProgressV2List。
   */
  private _migrateV4ToV5(container: SaveContainer): SaveContainer {
    // 1. 确保 growth 存在
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'growth'>>;
    if (!target.growth) {
      target.growth = {
        playerProgress: {
          playerLevel: 1,
          playerExp: 0,
          totalPower: 0,
          highestStageId: 'STAGE_001',
          lastGrowthAt: 0,
        },
        heroProgressList: [],
      };
    }

    // 2. 确保 heroProgressV2List 存在
    if (!Array.isArray(target.growth.heroProgressV2List)) {
      // 从旧 V1 heroProgressList 派生 V2 数据
      const v1List = target.growth.heroProgressList ?? [];
      const v2List = v1List.map((hp) => ({
        heroId: hp.heroId,
        tracks: {
          level: {
            trackId: 'level',
            level: hp.level || 1,
            exp: hp.exp || 0,
            unlockedMilestoneIds: [] as string[],
            version: 1,
          },
        },
        totalExpReceived: hp.exp || 0,
        updatedAt: Date.now(),
      }));

      target.growth.heroProgressV2List = v2List.length > 0 ? v2List : [];
      console.log(
        `[SaveMigrationSystem] V4→V5: 已从 heroProgressList 派生 ${v2List.length} 条 heroProgressV2List`,
      );
    }

    // 3. 校验 heroProgressV2List 结构
    if (Array.isArray(target.growth.heroProgressV2List)) {
      for (const hpv2 of target.growth.heroProgressV2List) {
        if (!hpv2.heroId || typeof hpv2.heroId !== 'string') {
          hpv2.heroId = 'UNKNOWN';
        }
        if (!hpv2.tracks || typeof hpv2.tracks !== 'object') {
          hpv2.tracks = {};
        }
        if (typeof hpv2.totalExpReceived !== 'number' || hpv2.totalExpReceived < 0) {
          hpv2.totalExpReceived = 0;
        }
        if (typeof hpv2.updatedAt !== 'number' || hpv2.updatedAt <= 0) {
          hpv2.updatedAt = Date.now();
        }

        // 校验每个轨道
        for (const trackId of Object.keys(hpv2.tracks)) {
          const track = hpv2.tracks[trackId];
          if (!track || typeof track !== 'object') {
            hpv2.tracks[trackId] = {
              trackId,
              level: 1,
              exp: 0,
              unlockedMilestoneIds: [],
              version: 1,
            };
            continue;
          }
          if (!track.trackId || typeof track.trackId !== 'string') {
            track.trackId = trackId;
          }
          if (typeof track.level !== 'number' || track.level < 1) {
            track.level = 1;
          }
          if (typeof track.exp !== 'number' || track.exp < 0) {
            track.exp = 0;
          }
          if (!Array.isArray(track.unlockedMilestoneIds)) {
            track.unlockedMilestoneIds = [];
          }
          if (typeof track.version !== 'number' || track.version < 1) {
            track.version = 1;
          }
        }
      }
    }

    // 4. 更新时间戳
    container.timestamp = Date.now();

    console.log('[SaveMigrationSystem] V4→V5: 迁移完成');
    return container;
  }

  // ==================== 内部：V5→V6 迁移逻辑 ====================

  /**
   * V5→V6 迁移：新增 PowerFormulaSnapshot 字段。
   *
   * Phase7-Step6 战力公式版本控制系统要求存档中包含：
   * - powerFormulaSnapshot: 战力公式配置快照
   *   - activeFormulaVersion: 当前活跃的公式版本号
   *   - formulas: 公式配置数组完整快照
   *   - savedAt: 快照保存时间戳
   *
   * 兼容旧存档：
   * - 如果存档中无 powerFormulaSnapshot，创建默认快照（V1）。
   * - 如果存档中已有 powerFormulaSnapshot 但结构不完整，修正并补全。
   * - 可选地为 heroProgressList 中每个英雄补充 HeroPowerResult 缓存。
   *
   * 迁移后需要触发一次战力重算以同步公式变更。
   */
  private _migrateV5ToV6(container: SaveContainer): SaveContainer {
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'powerFormulaSnapshot'>>;

    // 1. 确保 powerFormulaSnapshot 存在
    if (!target.powerFormulaSnapshot) {
      target.powerFormulaSnapshot = createDefaultPowerFormulaSnapshot();
      console.log('[SaveMigrationSystem] V5→V6: 已添加 powerFormulaSnapshot 默认快照');
    } else {
      // 校验并补全现有快照
      const snapshot = target.powerFormulaSnapshot;
      if (typeof snapshot.activeFormulaVersion !== 'number' || snapshot.activeFormulaVersion < 1) {
        snapshot.activeFormulaVersion = 1;
      }
      if (!Array.isArray(snapshot.formulas) || snapshot.formulas.length === 0) {
        snapshot.formulas = createDefaultPowerFormulaSnapshot().formulas;
      } else {
        // 校验每条公式配置
        for (const formula of snapshot.formulas) {
          if (typeof formula.version !== 'number' || formula.version < 1) {
            formula.version = 1;
          }
          if (!formula.id || typeof formula.id !== 'string') {
            formula.id = `POWER_FORMULA_V${formula.version}`;
          }
          if (!formula.statWeights || typeof formula.statWeights !== 'object') {
            formula.statWeights = { hp: 0.5, atk: 2.0, def: 1.0, speed: 0.3 };
          }
          if (typeof formula.effectiveFromSaveVersion !== 'number') {
            formula.effectiveFromSaveVersion = 0;
          }
          if (!Array.isArray(formula.modifiers)) {
            formula.modifiers = [];
          }
          if (!formula.rounding || !['floor', 'round', 'ceil'].includes(formula.rounding)) {
            formula.rounding = 'round';
          }
        }
      }
      if (typeof snapshot.savedAt !== 'number' || snapshot.savedAt <= 0) {
        snapshot.savedAt = Date.now();
      }
      console.log('[SaveMigrationSystem] V5→V6: 已校验并补全 powerFormulaSnapshot');
    }

    // 2. 可选：为旧 heroProgressList 添加战力缓存（格式：添加 __powerResultVersion 标记）
    // 注：实际 HeroPowerResult 在运行时由 PowerSystem 计算，
    // 此处仅标记需要重算，不存储完整 result 快照
    if (container.growth && Array.isArray(container.growth.heroProgressList)) {
      for (const hp of container.growth.heroProgressList) {
        // 为旧 V1 数据添加公式版本标记（通过 Record 扩展）
        const hpExtended = hp as HeroProgressData & { __powerFormulaVersion?: number };
        if (hpExtended.__powerFormulaVersion === undefined) {
          hpExtended.__powerFormulaVersion = 0; // 0 表示需要重算
        }
      }
    }

    // 3. 更新时间戳
    container.timestamp = Date.now();

    console.log('[SaveMigrationSystem] V5→V6: 迁移完成（powerFormulaSnapshot 已添加）');
    return container;
  }

  // ==================== 内部：V6→V7 迁移逻辑 ====================

  /**
   * V6→V7 迁移：新增 ArtifactInventory + LiveOpsState + SpecialEventStates 字段。
   *
   * Phase7-Step7 神器/运营/特殊事件框架要求存档包含：
   * - artifactInventory: 神器背包（初始为空）
   * - liveOpsState: 运营活动状态（初始为空）
   * - specialEventStates: 特殊事件状态列表（初始为空数组）
   *
   * 兼容旧存档：
   * - 所有新增字段均为 optional，旧存档缺失时初始化为默认空值。
   * - 不修改任何现有字段。
   */
  private _migrateV6ToV7(container: SaveContainer): SaveContainer {
    // 1. 确保 artifactInventory 存在
    if (!container.artifactInventory) {
      container.artifactInventory = {
        artifacts: [],
        activeArtifactId: null,
      };
      console.log('[SaveMigrationSystem] V6→V7: 已添加 artifactInventory 默认字段');
    }

    // 2. 确保 liveOpsState 存在
    if (!container.liveOpsState) {
      container.liveOpsState = {
        activeEventIds: [],
        lastRefreshAt: 0,
      };
      console.log('[SaveMigrationSystem] V6→V7: 已添加 liveOpsState 默认字段');
    }

    // 3. 确保 specialEventStates 存在
    if (!Array.isArray(container.specialEventStates)) {
      container.specialEventStates = [];
      console.log('[SaveMigrationSystem] V6→V7: 已添加 specialEventStates 空数组');
    }

    // 4. 更新时间戳
    container.timestamp = Date.now();

    console.log('[SaveMigrationSystem] V6→V7: 迁移完成（Artifact/LiveOps/SpecialEvent 框架已添加）');
    return container;
  }

  // ==================== 内部：V7→V8 迁移逻辑 ====================

  /**
   * V7→V8 迁移：SaveV2 升级（heroes / skills / formations / SaveMetaV2）。
   *
   * Phase9-Step6: 将 V7 旧数据结构（cards + growth）迁移到 Phase9 模块数据结构。
   *
   * 委托 SaveV2Migrator 执行详细的子迁移：
   * - cards + growth.heroProgressList → heroes
   * - 创建空 skills（SkillSystem.initialize() 将从配置补全）
   * - 从已拥有英雄创建 default_pve 阵容
   * - 初始化 SaveMetaV2 元数据
   *
   * 配置依赖（hero_data.json defaultSkillIds）在迁移时可能未加载，
   * 因此 skills 初始化为空，由 SkillSystem.initialize() 补全默认状态。
   */
  private _migrateV7ToV8(container: SaveContainer): SaveContainer {
    const migrator = new SaveV2Migrator();

    // 执行迁移（不传 heroDefaultSkillMap — 让 SkillSystem 在初始化时补全）
    const result = migrator.migrateV7ToV8(container);

    if (!result.success) {
      console.error(
        `[SaveMigrationSystem] V7→V8 迁移失败: ${result.errors.join('; ')}`,
      );
    }

    if (result.warnings.length > 0) {
      console.log(
        `[SaveMigrationSystem] V7→V8 迁移警告 (${result.warnings.length}):`,
      );
      for (const w of result.warnings) {
        console.log(`[SaveMigrationSystem]   - ${w}`);
      }
    }

    console.log(
      `[SaveMigrationSystem] V7→V8: 迁移完成 ` +
      `(${result.heroesMigrated} heroes, ${result.skillsMigrated} skills, ` +
      `${result.formationsCreated} formations)`,
    );

    // 更新时间戳
    container.timestamp = Date.now();

    return container;
  }

  // ==================== 内部：V0→V1 迁移辅助 ====================

  private _ensurePlayerData(container: SaveContainer): void {
    if (!container.player) {
      container.player = { level: 1, exp: 0, stageId: 1, combatPower: 0 };
      return;
    }

    const p = container.player;
    if (typeof p.level !== 'number' || !Number.isFinite(p.level) || p.level < 1) {
      p.level = 1;
    }
    if (typeof p.exp !== 'number' || !Number.isFinite(p.exp) || p.exp < 0) {
      p.exp = 0;
    }
    if (typeof p.stageId !== 'number' || !Number.isFinite(p.stageId) || p.stageId < 1) {
      p.stageId = 1;
    }
    if (typeof p.combatPower !== 'number' || !Number.isFinite(p.combatPower) || p.combatPower < 0) {
      p.combatPower = 0;
    }
  }

  private _ensureCardsData(container: SaveContainer): void {
    if (!Array.isArray(container.cards)) {
      container.cards = [];
      return;
    }

    // 校验每条卡牌数据的字段完整性
    for (const card of container.cards) {
      if (typeof card.cardId !== 'number') card.cardId = 0;
      if (typeof card.level !== 'number' || card.level < 1) card.level = 1;
      if (typeof card.star !== 'number' || card.star < 0) card.star = 0;
      if (typeof card.exp !== 'number' || card.exp < 0) card.exp = 0;
    }
  }

  private _ensureEquipmentData(container: SaveContainer): void {
    if (!container.equipment) {
      container.equipment = { instances: {}, heroEquipment: {} };
      return;
    }

    if (!container.equipment.instances || typeof container.equipment.instances !== 'object') {
      container.equipment.instances = {};
    }

    if (!container.equipment.heroEquipment || typeof container.equipment.heroEquipment !== 'object') {
      container.equipment.heroEquipment = {};
    }

    // 校验实例数据完整性
    for (const uid of Object.keys(container.equipment.instances)) {
      const inst = container.equipment.instances[uid];
      if (!inst || typeof inst !== 'object') {
        delete container.equipment.instances[uid];
        continue;
      }
      if (!inst.uid || typeof inst.uid !== 'string') inst.uid = uid;
      if (!inst.configId || typeof inst.configId !== 'string') inst.configId = 'UNKNOWN';
    }

    // 校验英雄装备数据完整性
    for (const heroId of Object.keys(container.equipment.heroEquipment)) {
      const he = container.equipment.heroEquipment[heroId];
      if (!he || typeof he !== 'object') {
        delete container.equipment.heroEquipment[heroId];
        continue;
      }
      if (!he.heroId || typeof he.heroId !== 'string') he.heroId = heroId;
      if (he.weaponId !== null && typeof he.weaponId !== 'string') he.weaponId = null;
      if (he.armorId !== null && typeof he.armorId !== 'string') he.armorId = null;
      if (he.accessoryId !== null && typeof he.accessoryId !== 'string') he.accessoryId = null;
    }
  }

  private _ensureSettingsData(container: SaveContainer): void {
    if (!container.settings) {
      container.settings = { musicVolume: 80, sfxVolume: 80 };
      return;
    }

    const clampVolume = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

    if (typeof container.settings.musicVolume !== 'number' || !Number.isFinite(container.settings.musicVolume)) {
      container.settings.musicVolume = 80;
    } else {
      container.settings.musicVolume = clampVolume(container.settings.musicVolume);
    }

    if (typeof container.settings.sfxVolume !== 'number' || !Number.isFinite(container.settings.sfxVolume)) {
      container.settings.sfxVolume = 80;
    } else {
      container.settings.sfxVolume = clampVolume(container.settings.sfxVolume);
    }
  }

  private _ensureAdData(container: SaveContainer): void {
    if (!container.ad) {
      container.ad = { totalWatched: 0, todayWatched: 0, lastWatchDate: '' };
      return;
    }

    if (typeof container.ad.totalWatched !== 'number' || container.ad.totalWatched < 0) {
      container.ad.totalWatched = 0;
    }
    if (typeof container.ad.todayWatched !== 'number' || container.ad.todayWatched < 0) {
      container.ad.todayWatched = 0;
    }
    if (typeof container.ad.lastWatchDate !== 'string') {
      container.ad.lastWatchDate = '';
    }
  }

  private _ensureGrowthData(container: SaveContainer): void {
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'growth'>>;

    if (!target.growth) {
      target.growth = this._createGrowthDataFromLegacy(container);
      return;
    }

    if (!target.growth.playerProgress) {
      target.growth.playerProgress = this._createGrowthDataFromLegacy(container).playerProgress;
    }

    // 校验 playerProgress 字段
    const pp = target.growth.playerProgress;
    if (typeof pp.playerLevel !== 'number' || pp.playerLevel < 1) pp.playerLevel = 1;
    if (typeof pp.playerExp !== 'number' || pp.playerExp < 0) pp.playerExp = 0;
    if (typeof pp.totalPower !== 'number' || pp.totalPower < 0) pp.totalPower = 0;
    if (!pp.highestStageId || typeof pp.highestStageId !== 'string') pp.highestStageId = 'STAGE_001';
    if (typeof pp.lastGrowthAt !== 'number') pp.lastGrowthAt = 0;

    if (!Array.isArray(target.growth.heroProgressList)) {
      target.growth.heroProgressList = [];
    }

    // 校验每条 heroProgress 数据完整性
    for (const hp of target.growth.heroProgressList) {
      if (!hp.heroId || typeof hp.heroId !== 'string') hp.heroId = 'UNKNOWN';
      if (typeof hp.level !== 'number' || hp.level < 1) hp.level = 1;
      if (typeof hp.exp !== 'number' || hp.exp < 0) hp.exp = 0;
      if (typeof hp.power !== 'number' || hp.power < 0) hp.power = 0;
    }
  }

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

    if (!target.dungeon.instances || typeof target.dungeon.instances !== 'object') {
      target.dungeon.instances = {};
    }

    if (!Array.isArray(target.dungeon.runHistory)) {
      target.dungeon.runHistory = [];
    }

    if (!target.dungeon.todayAttempts || typeof target.dungeon.todayAttempts !== 'object') {
      target.dungeon.todayAttempts = {};
    }

    if (typeof target.dungeon.lastAttemptDate !== 'string') {
      target.dungeon.lastAttemptDate = '';
    }

    if (typeof target.dungeon.currentStamina !== 'number' || !Number.isFinite(target.dungeon.currentStamina)) {
      target.dungeon.currentStamina = 100;
    }

    if (typeof target.dungeon.maxStamina !== 'number' || !Number.isFinite(target.dungeon.maxStamina)) {
      target.dungeon.maxStamina = 100;
    }
  }

  private _ensureDropHistoryData(container: SaveContainer): void {
    const target = container as SaveContainer & Partial<Pick<SaveContainer, 'dropHistory'>>;

    if (!target.dropHistory) {
      target.dropHistory = { history: [] };
      return;
    }

    if (!Array.isArray(target.dropHistory.history)) {
      target.dropHistory.history = [];
    }
  }

  private _ensureTimestamp(container: SaveContainer): void {
    if (typeof container.timestamp !== 'number' || !Number.isFinite(container.timestamp)) {
      container.timestamp = Date.now();
    }
  }

  /**
   * 从 Legacy 玩家数据构建 GrowthSaveData。
   *
   * 用于 V0 存档中缺少 growth 模块时，从 player 字段推断初始成长数据。
   */
  private _createGrowthDataFromLegacy(container: SaveContainer): GrowthSaveData {
    const growth = createDefaultGrowthData();
    const p = container.player;

    if (p) {
      growth.playerProgress = {
        playerLevel: typeof p.level === 'number' && p.level > 0 ? p.level : 1,
        playerExp: typeof p.exp === 'number' && p.exp >= 0 ? p.exp : 0,
        totalPower: typeof p.combatPower === 'number' && p.combatPower >= 0 ? p.combatPower : 0,
        highestStageId: typeof p.stageId === 'number'
          ? `STAGE_${String(Math.max(1, Math.floor(p.stageId))).padStart(3, '0')}`
          : 'STAGE_001',
        lastGrowthAt: 0,
      };
    }

    return growth;
  }

  // ==================== 内部：迁移路径查找 ====================

  /**
   * 从已注册步骤中查找从 fromVersion 到 toVersion 的最短路径。
   *
   * 使用贪心：每一步选择 toVersion 最大的路径。
   * 如果步骤链有缺口，返回已找到的步骤（最多可执行部分）。
   */
  private _findMigrationPath(fromVersion: number, toVersion: number): MigrationStep[] {
    const path: MigrationStep[] = [];
    let current = fromVersion;

    // 最多尝试 CURRENT_SAVE_VERSION * 2 次（防止死循环）
    const maxIterations = CURRENT_SAVE_VERSION * 2;
    let iterations = 0;

    while (current < toVersion && iterations < maxIterations) {
      iterations += 1;

      // 找到所有以 current 为起点的步骤，取 toVersion 最大的
      const candidates = this._steps.filter((s) => s.fromVersion === current);
      if (candidates.length === 0) {
        // 无可用步骤，终止
        break;
      }

      // 选择 toVersion 最大的步骤（跳过可能存在的中间版本）
      const best = candidates.reduce((a, b) => (a.toVersion > b.toVersion ? a : b));

      path.push(best);
      current = best.toVersion;
    }

    return path;
  }

  /** 记录迁移历史 */
  private _recordMigration(result: MigrationResult): void {
    const record: MigrationRecord = {
      timestamp: Date.now(),
      fromVersion: result.originalVersion,
      toVersion: result.finalVersion,
      stepsExecuted: result.stepsExecuted,
      success: result.success,
      errors: [...result.errors],
    };

    this._migrationHistory.unshift(record);

    // 限制最大记录数
    if (this._migrationHistory.length > MAX_MIGRATION_RECORDS) {
      this._migrationHistory = this._migrationHistory.slice(0, MAX_MIGRATION_RECORDS);
    }
  }
}
