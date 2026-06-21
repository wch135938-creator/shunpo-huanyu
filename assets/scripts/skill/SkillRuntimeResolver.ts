// ============================================================
// SkillRuntimeResolver — Phase9 技能运行时解析器
// 职责：将 SkillConfig + 技能等级解析为 SkillRuntimeSnapshot，
//       生成 CompiledSkillEffect 供 BattleUnitFactory / BattleSystem 使用
// 边界：纯计算逻辑，不修改任何系统状态，不依赖 UI
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { SkillRepository } from './SkillRepository';
import type {
  SkillConfig,
  SkillRuntimeSnapshot,
  SkillEffectConfig,
  CompiledSkillEffect,
} from './SkillTypes';

export class SkillRuntimeResolver extends BaseSystem {

  // ==================== 快照解析 ====================

  /**
   * 解析技能快照。
   *
   * 流程：
   * 1. 获取 SkillConfig
   * 2. 根据等级编译效果列表
   * 3. 组装 SkillRuntimeSnapshot
   *
   * @param skillId  技能 ID
   * @param level    技能当前等级
   * @returns        技能运行时快照，配置不存在时返回 null
   */
  resolveSkillSnapshot(skillId: string, level: number): SkillRuntimeSnapshot | null {
    const repository = SkillRepository.getInstance();
    const config = repository.getSkillConfig(skillId);
    if (!config) {
      console.error(`[SkillRuntimeResolver] 技能配置不存在: skillId=${skillId}`);
      return null;
    }

    const safeLevel = Math.max(1, Math.min(level, config.maxLevel));

    // 编译效果列表
    const compiledEffects = this._compileEffects(config.effects, safeLevel);

    const snapshot: SkillRuntimeSnapshot = {
      skillId: config.id,
      name: config.name,
      type: config.type,
      targetType: config.targetType,
      damageType: config.damageType,
      level: safeLevel,
      cooldownMs: config.cooldownMs,
      energyCost: config.energyCost,
      effects: compiledEffects,
      capturedAt: Date.now(),
    };

    return snapshot;
  }

  /**
   * 批量解析技能快照。
   *
   * @param skillLevels  技能 ID 与等级映射
   * @returns            技能快照数组（null 值已过滤）
   */
  resolveSkillSnapshots(skillLevels: Array<{ skillId: string; level: number }>): SkillRuntimeSnapshot[] {
    const snapshots: SkillRuntimeSnapshot[] = [];

    for (const entry of skillLevels) {
      const snapshot = this.resolveSkillSnapshot(entry.skillId, entry.level);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  // ==================== 纯计算方法（静态，可单独测试） ====================

  /**
   * 编译单个技能效果。
   *
   * 公式：
   * - value = baseValue + valuePerLevel × (level - 1)
   *
   * @param config  效果配置
   * @param level   技能等级
   * @returns       编译后的效果
   */
  static compileEffect(config: SkillEffectConfig, level: number): CompiledSkillEffect {
    const safeLevel = Math.max(1, level);
    const levelOffset = safeLevel - 1;

    return {
      effectId: config.effectId,
      effectType: config.effectType,
      value: config.baseValue + config.valuePerLevel * levelOffset,
      durationMs: config.durationMs,
    };
  }

  /**
   * 编译单个效果值（只返回数值，用于测试和外部计算）。
   *
   * @param config  效果配置
   * @param level   技能等级
   * @returns       编译后的数值
   */
  static compileEffectValue(config: SkillEffectConfig, level: number): number {
    const safeLevel = Math.max(1, level);
    return config.baseValue + config.valuePerLevel * (safeLevel - 1);
  }

  /**
   * 编译效果列表。
   *
   * @param effects  效果配置列表
   * @param level    技能等级
   * @returns        编译后的效果列表
   */
  static compileEffects(effects: SkillEffectConfig[], level: number): CompiledSkillEffect[] {
    return effects.map((eff) => SkillRuntimeResolver.compileEffect(eff, level));
  }

  // ==================== 工具方法 ====================

  /**
   * 获取技能在指定等级下的总伤害倍率（damage 类型效果的数值之和）。
   *
   * @param skillId  技能 ID
   * @param level    技能等级
   * @returns        总伤害倍率，技能不存在时返回 0
   */
  getTotalDamageMultiplier(skillId: string, level: number): number {
    const repository = SkillRepository.getInstance();
    const config = repository.getSkillConfig(skillId);
    if (!config) return 0;

    let total = 0;
    for (const eff of config.effects) {
      if (eff.effectType === 'damage') {
        total += SkillRuntimeResolver.compileEffectValue(eff, level);
      }
    }
    return total;
  }

  /**
   * 获取技能在指定等级下的总治疗倍率（heal 类型效果的数值之和）。
   *
   * @param skillId  技能 ID
   * @param level    技能等级
   * @returns        总治疗倍率，技能不存在时返回 0
   */
  getTotalHealMultiplier(skillId: string, level: number): number {
    const repository = SkillRepository.getInstance();
    const config = repository.getSkillConfig(skillId);
    if (!config) return 0;

    let total = 0;
    for (const eff of config.effects) {
      if (eff.effectType === 'heal' || eff.effectType === 'shield') {
        total += SkillRuntimeResolver.compileEffectValue(eff, level);
      }
    }
    return total;
  }

  // ==================== 内部方法 ====================

  /** 编译效果列表（实例方法） */
  private _compileEffects(effects: SkillEffectConfig[], level: number): CompiledSkillEffect[] {
    return SkillRuntimeResolver.compileEffects(effects, level);
  }
}
