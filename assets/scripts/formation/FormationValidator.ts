// ============================================================
// FormationValidator — Phase9 阵容合法性校验器
// 职责：校验阵容预设、槽位、英雄归属的合法性
// 边界：只读 HeroSystem（所有权检查），不修改任何系统状态
//       纯逻辑类，无副作用，所有方法接受外部依赖注入以便测试
// ============================================================

import type { FormationPreset, FormationSlot, FormationValidationResult, FormationMode } from './FormationTypes';
import { createEmptyValidationResult, isValidSlotIndex, FORMATION_SLOT_COUNT } from './FormationTypes';
import type { HeroSystem } from '../hero/HeroSystem';

/**
 * 英雄所有权检查函数类型。
 * 接收 heroId，返回是否已拥有该英雄。
 */
export type HeroOwnershipChecker = (heroId: string) => boolean;

export class FormationValidator {

  // ==================== 静态工具方法 ====================

  /**
   * 创建 HeroSystem 所有权检查器。
   *
   * 从 HeroSystem 实例创建可注入的所有权检查函数。
   *
   * @param heroSystem  HeroSystem 实例
   * @returns           HeroOwnershipChecker 函数
   */
  static createOwnershipChecker(heroSystem: HeroSystem): HeroOwnershipChecker {
    return (heroId: string): boolean => heroSystem.hasHero(heroId);
  }

  // ==================== 阵容预设校验 ====================

  /**
   * 校验阵容预设的完整合法性。
   *
   * 检查项：
   * 1. 模式合法性
   * 2. 槽位数量正确
   * 3. 槽位索引合法
   * 4. 无重复英雄
   * 5. 英雄所有权（如果提供了 ownershipChecker）
   *
   * @param preset             待校验阵容预设
   * @param ownershipChecker   可选：英雄所有权检查函数
   * @returns                  FormationValidationResult
   */
  validatePreset(
    preset: FormationPreset,
    ownershipChecker?: HeroOwnershipChecker,
  ): FormationValidationResult {
    const result = createEmptyValidationResult();

    if (!preset) {
      result.valid = false;
      result.errors.push('阵容预设为 null');
      return result;
    }

    // 1. 模式校验
    this._validateMode(preset.mode, result);

    // 2. 槽位校验
    this.validateSlots(preset.slots, result);

    // 3. 英雄所有权校验
    if (ownershipChecker) {
      this.validateHeroOwnership(preset.slots, ownershipChecker, result);
    }

    // 4.  ID 和名称非空
    if (!preset.id || preset.id.trim().length === 0) {
      result.valid = false;
      result.errors.push('阵容预设 ID 为空');
    }

    if (!preset.name || preset.name.trim().length === 0) {
      result.warnings.push('阵容预设名称为空');
    }

    return result;
  }

  // ==================== 槽位校验 ====================

  /**
   * 校验阵容槽位。
   *
   * 检查项：
   * - 槽位数量正确（必须为 FORMATION_SLOT_COUNT）
   * - 每个槽位索引合法
   * - 无重复英雄
   *
   * @param slots   槽位数组
   * @param result  校验结果（会被修改）
   * @returns       修改后的校验结果
   */
  validateSlots(
    slots: FormationSlot[],
    result?: FormationValidationResult,
  ): FormationValidationResult {
    const r = result ?? createEmptyValidationResult();

    if (!slots) {
      r.valid = false;
      r.errors.push('阵容槽位为 null');
      return r;
    }

    // 槽位数量
    if (slots.length !== FORMATION_SLOT_COUNT) {
      r.valid = false;
      r.errors.push(
        `阵容槽位数量不正确: 期望 ${FORMATION_SLOT_COUNT}, 实际 ${slots.length}`,
      );
      return r;
    }

    // 槽位索引
    const seenIndices = new Set<number>();
    for (const slot of slots) {
      if (!isValidSlotIndex(slot.slotIndex)) {
        r.valid = false;
        r.errors.push(`非法槽位索引: ${slot.slotIndex}`);
        continue;
      }

      if (seenIndices.has(slot.slotIndex)) {
        r.valid = false;
        r.errors.push(`重复槽位索引: ${slot.slotIndex}`);
      }
      seenIndices.add(slot.slotIndex);
    }

    // 重复英雄
    const heroIds = slots
      .filter((s) => s.heroId !== null && s.heroId !== '')
      .map((s) => s.heroId as string);

    const seenHeroes = new Set<string>();
    for (const heroId of heroIds) {
      if (seenHeroes.has(heroId)) {
        r.valid = false;
        r.errors.push(`重复英雄: ${heroId}`);
      }
      seenHeroes.add(heroId);
    }

    // 空槽位并非错误（允许空槽），但记录警告
    const filledCount = heroIds.length;
    if (filledCount === 0) {
      r.warnings.push('阵容所有槽位为空');
    }

    return r;
  }

  // ==================== 英雄所有权校验 ====================

  /**
   * 校验阵容中所有英雄的归属。
   *
   * 检查每个非空槽位的英雄是否已被玩家拥有。
   *
   * @param slots             槽位数组
   * @param ownershipChecker  英雄所有权检查函数
   * @param result            校验结果（会被修改）
   * @returns                 修改后的校验结果
   */
  validateHeroOwnership(
    slots: FormationSlot[],
    ownershipChecker: HeroOwnershipChecker,
    result?: FormationValidationResult,
  ): FormationValidationResult {
    const r = result ?? createEmptyValidationResult();

    if (!ownershipChecker) {
      r.warnings.push('未提供英雄所有权检查函数，跳过所有权校验');
      return r;
    }

    if (!slots) {
      return r;
    }

    for (const slot of slots) {
      if (slot.heroId === null || slot.heroId === '') continue;

      if (!ownershipChecker(slot.heroId)) {
        r.valid = false;
        r.errors.push(`未拥有英雄: ${slot.heroId} (槽位 ${slot.slotIndex})`);
      }
    }

    return r;
  }

  // ==================== 模式校验 ====================

  /**
   * 校验阵容模式字符串。
   *
   * @param mode    阵容模式
   * @param result  校验结果（会被修改）
   * @returns       修改后的校验结果
   */
  validateMode(
    mode: FormationMode,
    result?: FormationValidationResult,
  ): FormationValidationResult {
    return this._validateMode(mode, result);
  }

  // ==================== 空槽位分析 ====================

  /**
   * 获取阵容中的空槽位数量。
   *
   * @param slots  槽位数组
   * @returns      空槽位数量
   */
  countEmptySlots(slots: FormationSlot[]): number {
    return slots.filter((s) => s.heroId === null || s.heroId === '').length;
  }

  /**
   * 获取阵容中已填充的英雄 ID 列表。
   *
   * @param slots  槽位数组
   * @returns      已填充的英雄 ID 数组
   */
  getFilledHeroIds(slots: FormationSlot[]): string[] {
    return slots
      .filter((s) => s.heroId !== null && s.heroId !== '')
      .map((s) => s.heroId as string);
  }

  // ==================== 内部方法 ====================

  /** 内部模式校验 */
  private _validateMode(
    mode: FormationMode,
    result?: FormationValidationResult,
  ): FormationValidationResult {
    const r = result ?? createEmptyValidationResult();

    const validModes: FormationMode[] = [
      'pve', 'dungeon', 'roguelike', 'boss',
      'pvp_attack', 'pvp_defense', 'world_boss', 'guild_boss',
    ];

    if (!mode || !validModes.includes(mode)) {
      r.valid = false;
      r.errors.push(`非法阵容模式: ${mode}`);
    }

    return r;
  }
}
