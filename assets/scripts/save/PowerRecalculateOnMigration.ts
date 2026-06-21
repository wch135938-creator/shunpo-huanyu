// ============================================================
// PowerRecalculateOnMigration — Phase6-Step5 迁移后战力重算
// 职责：存档迁移后强制重算所有英雄战力与总战力
// 边界：依赖 PowerSystem/ProgressSystem/EquipmentSystem 配置已加载
// 注意：此模块是"协调者"，不包含战力公式本身
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { SaveManager } from './SaveManager';
import { PowerSystem } from '../systems/PowerSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import type { SaveContainer } from './SaveContainer';

// ---- 类型定义 ----

/** 单个英雄战力重算结果 */
export interface HeroPowerRecalcEntry {
  heroId: string;
  oldPower: number;
  newPower: number;
  powerDelta: number;
  level: number;
  exp: number;
}

/** 战力重算结果 */
export interface PowerRecalculateResult {
  /** 是否全部成功 */
  success: boolean;
  /** 重算的英雄数量 */
  heroCount: number;
  /** 各英雄重算详情 */
  heroResults: HeroPowerRecalcEntry[];
  /** 旧总战力 */
  oldTotalPower: number;
  /** 新总战力 */
  newTotalPower: number;
  /** 总战力变化 */
  totalPowerDelta: number;
  /** 错误信息列表 */
  errors: string[];
  /** 跳过的英雄数（配置缺失等） */
  skippedCount: number;
}

export class PowerRecalculateOnMigration extends BaseSystem {

  // ==================== 核心：重算所有英雄战力 ====================

  /**
   * 迁移后强制重算所有英雄战力与总战力。
   *
   * 前置条件：
   * - PowerSystem.loadConfig() 已完成
   * - ProgressSystem.loadConfig() 已完成
   * - EquipmentSystem.loadConfig() 已完成
   *
   * 流程：
   * 1. 从 ProgressSystem 获取所有英雄进度数据
   * 2. 为每英雄通过 EquipmentSystem.calculateFullHeroPower() 计算完整战力
   * 3. 更新 ProgressSystem 中的战力缓存
   * 4. 计算总战力并更新 playerProgress
   * 5. 写入 SaveManager
   *
   * @returns  重算结果
   */
  recalculateAll(): PowerRecalculateResult {
    const result: PowerRecalculateResult = {
      success: true,
      heroCount: 0,
      heroResults: [],
      oldTotalPower: 0,
      newTotalPower: 0,
      totalPowerDelta: 0,
      errors: [],
      skippedCount: 0,
    };

    // 前置条件检查
    if (!this._checkPrerequisites(result)) {
      result.success = false;
      return result;
    }

    const progressSystem = ProgressSystem.getInstance();
    const equipmentSystem = EquipmentSystem.getInstance();
    const powerSystem = PowerSystem.getInstance();

    // 获取当前玩家进度数据
    const playerProgress = progressSystem.getPlayerProgressData();
    result.oldTotalPower = playerProgress.totalPower;

    // 获取所有英雄进度 ID 列表
    let allHeroIds: string[] = [];
    try {
      // 通过 equipmentSystem 的内部 heroConfigMap 获取所有英雄 ID
      const internalMap = (equipmentSystem as unknown as Record<string, unknown>)['_heroConfigMap'] as
        Map<string, unknown> | undefined;
      if (internalMap && internalMap.size > 0) {
        allHeroIds = Array.from(internalMap.keys());
      }
    } catch {
      // 无法获取英雄列表，尝试从 ProgressSystem 的 heroProgressMap 获取
      try {
        const progressMap = (progressSystem as unknown as Record<string, unknown>)['_heroProgressMap'] as
          Map<string, unknown> | undefined;
        if (progressMap && progressMap.size > 0) {
          allHeroIds = Array.from(progressMap.keys());
        }
      } catch {
        result.errors.push('无法获取英雄 ID 列表');
        result.success = false;
        return result;
      }
    }

    if (allHeroIds.length === 0) {
      result.errors.push('英雄 ID 列表为空，无可重算的英雄');
      result.success = false;
      return result;
    }

    // 逐英雄重算战力
    const heroPowers: number[] = [];

    for (const heroId of allHeroIds) {
      try {
        // 获取重算前的进度数据
        const oldProgress = progressSystem.getHeroProgress(heroId);
        const oldPower = oldProgress.power;

        // 通过 EquipmentSystem 计算含装备的完整战力
        const fullPower = equipmentSystem.calculateFullHeroPower(heroId);

        // 更新 ProgressSystem 中的战力缓存
        oldProgress.power = fullPower;
        progressSystem.setHeroProgress(oldProgress);

        heroPowers.push(fullPower);

        result.heroResults.push({
          heroId,
          oldPower,
          newPower: fullPower,
          powerDelta: fullPower - oldPower,
          level: oldProgress.level,
          exp: oldProgress.exp,
        });

        result.heroCount += 1;

        // 保存到 SaveManager
        SaveManager.getInstance().saveHeroProgressData(oldProgress);
      } catch (e) {
        // 单个英雄失败不影响其他英雄
        const errorMsg = `英雄 ${heroId} 战力重算失败: ${e}`;
        console.warn(`[PowerRecalculateOnMigration] ${errorMsg}`);
        result.skippedCount += 1;
        result.errors.push(errorMsg);

        // 尝试回退：保留旧战力
        try {
          const fallbackProgress = progressSystem.getHeroProgress(heroId);
          heroPowers.push(fallbackProgress.power);
        } catch {
          heroPowers.push(0);
        }
      }
    }

    // 计算总战力
    const newTotalPower = powerSystem.calculateTotalPower(heroPowers);
    result.newTotalPower = newTotalPower;
    result.totalPowerDelta = newTotalPower - result.oldTotalPower;

    // 更新 playerProgress
    playerProgress.totalPower = newTotalPower;
    playerProgress.lastGrowthAt = Date.now();
    progressSystem.setPlayerProgressData(playerProgress);
    SaveManager.getInstance().savePlayerProgressData(playerProgress);

    console.log(
      `[PowerRecalculateOnMigration] 战力重算完成: ${result.heroCount} 英雄, ` +
      `总战力 ${result.oldTotalPower} → ${result.newTotalPower} ` +
      `(${result.totalPowerDelta >= 0 ? '+' : ''}${result.totalPowerDelta}), ` +
      `跳过 ${result.skippedCount}`,
    );

    return result;
  }

  /**
   * 对单个存档容器进行战力估算（离线模式，不依赖运行时系统）。
   *
   * 用途：在 SaveManager.init() 阶段，系统配置尚未加载时，
   * 对 SaveContainer 进行基础战力合理性检查。
   *
   * 注意：此方法不修改数据，仅返回检查结果。
   *
   * @param container  存档容器
   * @returns          检查结果
   */
  static checkPowerSanity(container: SaveContainer): {
    sane: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!container.growth?.playerProgress) {
      return { sane: false, issues: ['growth.playerProgress 缺失'] };
    }

    const totalPower = container.growth.playerProgress.totalPower;
    const heroList = container.growth.heroProgressList ?? [];

    if (typeof totalPower !== 'number' || !Number.isFinite(totalPower) || totalPower < 0) {
      issues.push('totalPower 无效');
    }

    // 检查英雄战力总和是否大致匹配总战力（粗略检查）
    if (heroList.length > 0) {
      const heroPowerSum = heroList.reduce((sum, hp) => {
        const power = typeof hp.power === 'number' && Number.isFinite(hp.power) ? hp.power : 0;
        return sum + power;
      }, 0);

      if (totalPower >= 0 && heroPowerSum >= 0) {
        const diff = Math.abs(totalPower - heroPowerSum);
        // 允许一定误差（装备独立战力加成可能导致总和略有差异）
        const tolerance = Math.max(100, totalPower * 0.1);
        if (diff > tolerance) {
          issues.push(
            `总战力 (${totalPower}) 与英雄战力总和 (${heroPowerSum}) 差异过大 (${diff}), ` +
            '建议迁移后重算',
          );
        }
      }
    }

    return { sane: issues.length === 0, issues };
  }

  // ==================== 内部方法 ====================

  /**
   * 检查前置条件是否满足。
   */
  private _checkPrerequisites(result: PowerRecalculateResult): boolean {
    let ok = true;

    try {
      if (!PowerSystem.getInstance().isConfigLoaded()) {
        result.errors.push('PowerSystem 配置未加载');
        ok = false;
      }
    } catch {
      result.errors.push('PowerSystem 实例不可用');
      ok = false;
    }

    try {
      if (!ProgressSystem.getInstance().isConfigLoaded()) {
        result.errors.push('ProgressSystem 配置未加载');
        ok = false;
      }
    } catch {
      result.errors.push('ProgressSystem 实例不可用');
      ok = false;
    }

    try {
      if (!EquipmentSystem.getInstance().isConfigLoaded()) {
        result.errors.push('EquipmentSystem 配置未加载');
        ok = false;
      }
    } catch {
      result.errors.push('EquipmentSystem 实例不可用');
      ok = false;
    }

    return ok;
  }
}
