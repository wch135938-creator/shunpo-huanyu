// ============================================================
// HeroSnapshotBuilder — Phase9 英雄快照构建器
// 职责：整合 HeroConfig + HeroRuntimeState → HeroSnapshot + BattleReadyStats
// 整合：HeroRepository / EquipmentSystem / PowerSystem（只读，不修改）
// 输出：BattleReadyStats, HeroSnapshot
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { HeroRepository } from './HeroRepository';
import type {
  HeroConfig,
  HeroRuntimeState,
  HeroSnapshot,
  HeroBaseStats,
  HeroGrowthStats,
  BattleReadyStats,
} from './HeroTypes';

/**
 * 属性加成（与 PowerSystem.PowerAttributeBonus 兼容）。
 * 从 EquipmentSystem、Buff 等外部系统汇总。
 */
export interface SnapshotAttributeBonus {
  hp?: number;
  atk?: number;
  def?: number;
  speed?: number;
  /** 装备独立战力 */
  equipmentPower?: number;
}

/**
 * 属性计算结果。
 */
export interface ComputedAttributes {
  hp: number;
  atk: number;
  def: number;
  speed: number;
  critRate: number;
  critDamage: number;
}

/**
 * 简易战力计算配置。
 */
interface PowerCalcConfig {
  hpWeight: number;
  atkWeight: number;
  defWeight: number;
  speedWeight: number;
  /** 品质倍率 */
  qualityMultipliers: Record<string, number>;
}

/** 默认战力计算权重 */
const DEFAULT_POWER_CONFIG: PowerCalcConfig = {
  hpWeight: 0.5,
  atkWeight: 2.0,
  defWeight: 1.0,
  speedWeight: 0.3,
  qualityMultipliers: {
    N: 1.0,
    R: 1.2,
    SR: 1.5,
    SSR: 2.0,
    UR: 3.0,
  },
};

/** 默认暴击率（按职业） */
const DEFAULT_CRIT_RATE: Record<string, number> = {
  '战士': 0.10,
  '法师': 0.15,
  '刺客': 0.25,
  '坦克': 0.05,
  '辅助': 0.10,
};

/** 默认暴击倍率（按职业） */
const DEFAULT_CRIT_DAMAGE: Record<string, number> = {
  '战士': 1.5,
  '法师': 1.8,
  '刺客': 2.0,
  '坦克': 1.3,
  '辅助': 1.5,
};

export class HeroSnapshotBuilder extends BaseSystem {

  /** 战力计算配置（可外部注入） */
  private _powerConfig: PowerCalcConfig = { ...DEFAULT_POWER_CONFIG };

  /** 外部属性加成提供者（由调用方设置，如装备系统） */
  private _bonusProvider: ((heroId: string) => SnapshotAttributeBonus) | null = null;

  // ==================== 配置 ====================

  /**
   * 设置战力计算配置。
   */
  setPowerConfig(config: Partial<PowerCalcConfig>): void {
    this._powerConfig = { ...this._powerConfig, ...config };
  }

  /**
   * 注册外部属性加成提供者。
   *
   * 典型的提供者是 EquipmentSystem，提供装备属性加成。
   *
   * @param provider  返回 SnapshotAttributeBonus 的函数
   */
  setBonusProvider(provider: (heroId: string) => SnapshotAttributeBonus): void {
    this._bonusProvider = provider;
  }

  // ==================== 快照构建 ====================

  /**
   * 构建单个英雄快照。
   *
   * 流程：
   * 1. 获取 HeroConfig
   * 2. 计算基础属性（baseStats + growthStats × (level - 1)）
   * 3. 获取外部属性加成（装备等）
   * 4. 计算 BattleReadyStats
   * 5. 组装 HeroSnapshot
   *
   * @param heroId  英雄 ID
   * @param state   英雄运行时状态
   * @returns       英雄快照，配置不存在时返回 null
   */
  buildHeroSnapshot(heroId: string, state: HeroRuntimeState): HeroSnapshot | null {
    const repository = HeroRepository.getInstance();
    const config = repository.getHeroConfig(heroId);
    if (!config) {
      console.error(`[HeroSnapshotBuilder] 英雄配置不存在: heroId=${heroId}`);
      return null;
    }

    // 计算基础属性
    const baseAttributes = this._computeBaseAttributes(config.baseStats, config.growthStats, state.level);

    // 获取外部加成（装备等）
    const bonus = this._getBonus(heroId);

    // 计算战斗就绪属性
    const battleReady = this._computeBattleReadyStats(
      config,
      baseAttributes,
      bonus,
    );

    // 组装快照
    const snapshot: HeroSnapshot = {
      heroId,
      name: config.name,
      quality: config.quality,
      faction: config.faction,
      profession: config.profession,
      element: config.element,
      level: state.level,
      star: state.star,
      breakthrough: state.breakthrough,
      skillIds: [...config.defaultSkillIds],
      battleReady,
      capturedAt: Date.now(),
    };

    return snapshot;
  }

  /**
   * 批量构建英雄快照。
   *
   * @param states  英雄运行时状态数组
   * @returns       英雄快照数组（null 值已过滤）
   */
  buildHeroSnapshots(states: HeroRuntimeState[]): HeroSnapshot[] {
    const snapshots: HeroSnapshot[] = [];

    for (const state of states) {
      const snapshot = this.buildHeroSnapshot(state.heroId, state);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  // ==================== 纯计算方法（静态，可单独测试） ====================

  /**
   * 计算基础属性。
   *
   * 公式：
   * - attr = baseStat + growthStat × (level - 1)
   *
   * @param baseStats    基础属性
   * @param growthStats  成长属性
   * @param level        当前等级
   * @returns            计算后的基础属性
   */
  static computeBaseAttributes(
    baseStats: HeroBaseStats,
    growthStats: HeroGrowthStats,
    level: number,
  ): ComputedAttributes {
    const levelOffset = Math.max(0, level - 1);

    return {
      hp: baseStats.hp + growthStats.hp * levelOffset,
      atk: baseStats.atk + growthStats.atk * levelOffset,
      def: baseStats.def + growthStats.def * levelOffset,
      speed: baseStats.speed,
      critRate: 0,
      critDamage: 0,
    };
  }

  /**
   * 计算战斗就绪属性（含装备加成 + 战力）。
   *
   * 公式：
   * - finalAttr = computedAttr + bonus
   * - power = Σ(finalAttr × weight) × qualityMultiplier
   *
   * @param config      英雄配置
   * @param computed    已计算的基础属性
   * @param bonus       外部属性加成
   * @param powerConfig 战力计算配置（可选）
   * @returns           BattleReadyStats
   */
  static computeBattleReadyStats(
    config: HeroConfig,
    computed: ComputedAttributes,
    bonus: SnapshotAttributeBonus,
    powerConfig?: PowerCalcConfig,
  ): BattleReadyStats {
    const pc = powerConfig ?? DEFAULT_POWER_CONFIG;

    // 合并属性
    const finalHp = computed.hp + (bonus.hp ?? 0);
    const finalAtk = computed.atk + (bonus.atk ?? 0);
    const finalDef = computed.def + (bonus.def ?? 0);
    const finalSpeed = computed.speed + (bonus.speed ?? 0);

    // 暴击属性
    const critRate = DEFAULT_CRIT_RATE[config.profession] ?? 0.10;
    const critDamage = DEFAULT_CRIT_DAMAGE[config.profession] ?? 1.5;

    // 战力计算
    const rawPower =
      finalHp * pc.hpWeight
      + finalAtk * pc.atkWeight
      + finalDef * pc.defWeight
      + finalSpeed * pc.speedWeight;

    const qualityMultiplier = pc.qualityMultipliers[config.quality] ?? 1.0;
    const power = Math.round(rawPower * qualityMultiplier) + Math.max(0, bonus.equipmentPower ?? 0);

    return {
      hp: Math.max(0, Math.round(finalHp)),
      atk: Math.max(0, Math.round(finalAtk)),
      def: Math.max(0, Math.round(finalDef)),
      speed: Math.max(0, Math.round(finalSpeed)),
      critRate,
      critDamage,
      power: Math.max(0, power),
    };
  }

  // ==================== 内部方法 ====================

  /** 计算基础属性（实例方法，支持未来覆盖） */
  private _computeBaseAttributes(
    baseStats: HeroBaseStats,
    growthStats: HeroGrowthStats,
    level: number,
  ): ComputedAttributes {
    return HeroSnapshotBuilder.computeBaseAttributes(baseStats, growthStats, level);
  }

  /** 计算战斗就绪属性（实例方法） */
  private _computeBattleReadyStats(
    config: HeroConfig,
    computed: ComputedAttributes,
    bonus: SnapshotAttributeBonus,
  ): BattleReadyStats {
    return HeroSnapshotBuilder.computeBattleReadyStats(
      config,
      computed,
      bonus,
      this._powerConfig,
    );
  }

  /** 获取外部属性加成 */
  private _getBonus(heroId: string): SnapshotAttributeBonus {
    if (this._bonusProvider) {
      try {
        return this._bonusProvider(heroId);
      } catch (e) {
        console.warn(`[HeroSnapshotBuilder] 获取外部加成失败: heroId=${heroId}`, e);
      }
    }
    return {};
  }
}
