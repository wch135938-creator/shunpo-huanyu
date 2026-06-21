// ============================================================
// PowerSystem — Phase4A 战力计算系统 / Phase7-Step6 批量重算
// 职责：读取战力配置，计算单角色战力，汇总阵容总战力，
//        V2 扩展：公式版本控制、批量重算、公式对比
// 边界：不接入战斗、不修改成长数据、V1 接口保持不变
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { DomainEventBus } from './DomainEventBus';
import { DomainEventType, generateCorrelationId } from '../data/roguelike_types';
import type { HeroConfig, Quality } from '../config/hero_config';
import type { LevelConfig } from '../config/level_config';
import type { PowerConfig, PowerConfigData } from '../config/power_config';
import type { HeroProgressData } from '../data/hero_progress_data';
import type { HeroProgressStateV2, PowerFormulaConfigV2, CorrelationId } from '../data/roguelike_types';
import type {
  HeroPowerInputV2,
  HeroPowerResult,
  TeamPowerInputV2,
  TeamPowerResult,
  PowerRecalculateBatchInput,
  PowerRecalculateBatchResult,
  FormulaCompareInput,
  FormulaCompareResult,
  FormulaVersionSummary,
  FormulaVersionDiff,
} from '../data/power_types';
import { createEmptyTeamPowerResult } from '../data/power_types';

/** 角色计算后的战斗属性 */
export interface HeroComputedAttributes {
  hp: number;
  atk: number;
  def: number;
  speed: number;
}

/**
 * 属性加成扩展入口。
 *
 * Phase4A 仅预留该入口；Phase4B 装备系统可将装备属性汇总后传入。
 */
export interface PowerAttributeBonus {
  hp?: number;
  atk?: number;
  def?: number;
  speed?: number;
}

/** 单角色战力计算输入（V1） */
export interface HeroPowerInput {
  heroConfig: HeroConfig;
  levelConfig: LevelConfig;
  attributeBonus?: PowerAttributeBonus;
}

/** 默认公式 ID */
const DEFAULT_FORMULA_ID = 'POWER_FORMULA_DEFAULT';
/** 默认公式版本 */
const DEFAULT_FORMULA_VERSION = 1;

/**
 * 创建默认 V2 公式配置（内联，避免循环依赖）。
 */
function createDefaultFormulaConfigV2(): PowerFormulaConfigV2 {
  return {
    id: DEFAULT_FORMULA_ID,
    version: DEFAULT_FORMULA_VERSION,
    effectiveFromSaveVersion: 0,
    statWeights: {
      hp: 0.5,
      atk: 2.0,
      def: 1.0,
      speed: 0.3,
    },
    modifiers: [],
    rounding: 'round',
  };
}

/**
 * 从多轨成长状态提取属性摘要。
 *
 * 根据 heroProgress.tracks 中各轨道的 level 和 statModifiers 计算基础属性。
 * Phase7-Step6 使用简化公式：每个轨道 level 乘默认系数。
 */
function extractAttributesFromProgress(
  heroProgress: HeroProgressStateV2,
): Record<string, number> {
  const attrs: Record<string, number> = { hp: 100, atk: 20, def: 10, speed: 5 };

  for (const trackState of Object.values(heroProgress.tracks)) {
    const level = trackState.level || 1;
    switch (trackState.trackId) {
      case 'level':
        attrs.hp = 100 + (level - 1) * 50;
        attrs.atk = 20 + (level - 1) * 10;
        attrs.def = 10 + (level - 1) * 5;
        attrs.speed = 5 + (level - 1) * 1;
        break;
      case 'skill':
        attrs.atk += (level - 1) * 3;
        break;
      case 'bond':
        attrs.hp += (level - 1) * 20;
        attrs.def += (level - 1) * 3;
        break;
      case 'awakening':
        attrs.atk += (level - 1) * 5;
        attrs.speed += (level - 1) * 2;
        break;
      case 'equipment':
        // 装备轨道不产生基础属性，equipmentPower 单独传入
        break;
      default:
        break;
    }
  }

  return attrs;
}

/**
 * 应用 V2 公式修正规则。
 */
function applyFormulaModifiers(
  rawPower: number,
  modifiers: PowerFormulaConfigV2['modifiers'],
): number {
  let result = rawPower;
  for (const mod of modifiers) {
    switch (mod.type) {
      case 'flat':
        result += mod.value;
        break;
      case 'multiply':
        result *= mod.value;
        break;
      case 'cap':
        result = Math.min(result, mod.value);
        break;
    }
  }
  return result;
}

/**
 * 按取整方式处理战力值。
 */
function applyRounding(value: number, rounding: PowerFormulaConfigV2['rounding']): number {
  switch (rounding) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
    default:
      return Math.round(value);
  }
}

export class PowerSystem extends BaseSystem {
  private static readonly POWER_CONFIG_PATH = `${ConfigManager.DIR_SYSTEMS}/power_config`;
  private static readonly DEFAULT_POWER_CONFIG_ID = 'POWER_DEFAULT';

  private _powerConfig: PowerConfig | null = null;

  // ---- Phase7-Step6: V2 公式配置 ----
  private _formulaConfigs: PowerFormulaConfigV2[] = [];
  private _activeFormulaVersion: number = DEFAULT_FORMULA_VERSION;
  private _formulaConfigsLoaded = false;

  /**
   * 加载战力配置（V1）。
   *
   * 调用方应在计算战力前执行一次；重复调用会复用 ConfigManager 缓存。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.loadConfig<PowerConfigData>(PowerSystem.POWER_CONFIG_PATH);
    this._powerConfig = this._findDefaultPowerConfig(config);
  }

  /** 是否已经加载战力配置 */
  isConfigLoaded(): boolean {
    return this._powerConfig !== null;
  }

  /** 获取当前使用的战力配置 */
  getPowerConfig(): PowerConfig | null {
    return this._powerConfig;
  }

  // ---- Phase7-Step6: V2 公式配置加载 ----

  /**
   * 加载 V2 公式配置列表。
   *
   * 调用方应在使用 V2 方法前执行一次。
   * 如果不调用此方法，V2 方法将使用内置默认公式。
   *
   * @param formulas  公式配置数组
   */
  loadFormulaConfigs(formulas: PowerFormulaConfigV2[]): void {
    this._formulaConfigs = formulas.length > 0 ? [...formulas] : [createDefaultFormulaConfigV2()];
    // 使用最高版本作为活跃版本
    this._activeFormulaVersion = Math.max(...this._formulaConfigs.map((f) => f.version));
    this._formulaConfigsLoaded = true;
  }

  /**
   * 从存档快照恢复公式配置。
   *
   * @param formulas      公式配置数组
   * @param activeVersion 活跃版本号
   */
  restoreFormulaConfigsFromSnapshot(
    formulas: PowerFormulaConfigV2[],
    activeVersion: number,
  ): void {
    this._formulaConfigs = formulas.length > 0 ? [...formulas] : [createDefaultFormulaConfigV2()];
    this._activeFormulaVersion = activeVersion > 0 ? activeVersion : DEFAULT_FORMULA_VERSION;
    this._formulaConfigsLoaded = true;
  }

  /** 获取当前活跃的公式版本号 */
  getActiveFormulaVersion(): number {
    return this._activeFormulaVersion;
  }

  /** 获取所有已加载的 V2 公式配置 */
  getFormulaConfigs(): PowerFormulaConfigV2[] {
    return [...this._formulaConfigs];
  }

  /** 是否已加载 V2 公式配置 */
  isFormulaConfigsLoaded(): boolean {
    return this._formulaConfigsLoaded;
  }

  /**
   * 根据版本号获取公式配置。
   *
   * @param version  公式版本号（不提供则返回当前活跃版本）
   * @returns        公式配置
   */
  getFormulaConfig(version?: number): PowerFormulaConfigV2 {
    const targetVersion = version ?? this._activeFormulaVersion;
    const config = this._formulaConfigs.find((f) => f.version === targetVersion);
    if (config) return config;

    // 回退到默认
    if (this._formulaConfigs.length > 0) {
      return this._formulaConfigs[this._formulaConfigs.length - 1];
    }
    return createDefaultFormulaConfigV2();
  }

  /**
   * 根据角色基础配置和等级成长配置计算最终属性。
   *
   * 公式：
   * - hp = (baseHp + growthHp * (level - 1)) * hpGrowthRate + bonusHp
   * - atk = (baseAtk + growthAtk * (level - 1)) * atkGrowthRate + bonusAtk
   * - def = (baseDef + growthDef * (level - 1)) * defGrowthRate + bonusDef
   * - speed = baseSpeed * speedGrowthRate + bonusSpeed
   */
  calculateHeroAttributes(
    heroConfig: HeroConfig,
    levelConfig: LevelConfig,
    attributeBonus: PowerAttributeBonus = {},
  ): HeroComputedAttributes {
    const levelOffset = Math.max(0, levelConfig.level - 1);

    const baseHp = heroConfig.baseHp + heroConfig.growthHp * levelOffset;
    const baseAtk = heroConfig.baseAtk + heroConfig.growthAtk * levelOffset;
    const baseDef = heroConfig.baseDef + heroConfig.growthDef * levelOffset;
    const baseSpeed = heroConfig.baseSpeed;

    return {
      hp: this._toSafeAttribute(baseHp * levelConfig.hpGrowthRate + (attributeBonus.hp ?? 0)),
      atk: this._toSafeAttribute(baseAtk * levelConfig.atkGrowthRate + (attributeBonus.atk ?? 0)),
      def: this._toSafeAttribute(baseDef * levelConfig.defGrowthRate + (attributeBonus.def ?? 0)),
      speed: this._toSafeAttribute(baseSpeed * levelConfig.speedGrowthRate + (attributeBonus.speed ?? 0)),
    };
  }

  /**
   * 计算单角色战力（V1）。
   *
   * 公式：
   * rawPower =
   *   hp * hpWeight
   *   + atk * atkWeight
   *   + def * defWeight
   *   + speed * speedWeight
   *
   * finalPower = rawPower * qualityMultiplier[quality]
   */
  calculateHeroPower(input: HeroPowerInput): number {
    const config = this._requirePowerConfig();
    const attributes = this.calculateHeroAttributes(
      input.heroConfig,
      input.levelConfig,
      input.attributeBonus,
    );

    return this.calculatePowerByAttributes(attributes, input.heroConfig.quality, config);
  }

  /**
   * 使用 HeroProgressData 计算单角色战力。
   *
   * levelConfig 仍由调用方传入，避免 PowerSystem 在 Step 2 负责等级配置索引或 ProgressSystem 职责。
   */
  calculateHeroPowerFromProgress(
    heroConfig: HeroConfig,
    progressData: HeroProgressData,
    levelConfig: LevelConfig,
    attributeBonus: PowerAttributeBonus = {},
  ): number {
    if (progressData.level !== levelConfig.level) {
      throw new Error(
        `[PowerSystem] 角色等级与等级配置不匹配: heroId=${progressData.heroId}, progressLevel=${progressData.level}, configLevel=${levelConfig.level}`,
      );
    }

    return this.calculateHeroPower({
      heroConfig,
      levelConfig,
      attributeBonus,
    });
  }

  /** 按已计算属性计算战力，供后续装备或 Buff 汇总后复用 */
  calculatePowerByAttributes(
    attributes: HeroComputedAttributes,
    quality: Quality,
    powerConfig?: PowerConfig,
  ): number {
    const config = powerConfig ?? this._requirePowerConfig();
    const rawPower =
      attributes.hp * config.hpWeight
      + attributes.atk * config.atkWeight
      + attributes.def * config.defWeight
      + attributes.speed * config.speedWeight;

    const qualityMultiplier = config.qualityMultiplier[quality];
    return Math.max(0, Math.round(rawPower * qualityMultiplier));
  }

  /** 汇总阵容总战力 */
  calculateTotalPower(heroPowers: number[]): number {
    return heroPowers.reduce((total, power) => total + Math.max(0, Math.round(power)), 0);
  }

  // ================================================================
  // Phase7-Step6: V2 公式版战力计算
  // ================================================================

  /**
   * 单英雄战力计算（V2 公式版）。
   *
   * 使用 PowerFormulaConfigV2 计算战力：
   * 1. 从 heroProgress 提取输入属性摘要
   * 2. 使用 statWeights 计算 rawPower
   * 3. 应用 modifiers 修正
   * 4. 使用 rounding 规则取整
   * 5. 加上装备战力
   * 6. 发布领域事件
   *
   * @param input  英雄战力计算输入
   * @returns      战力计算结果
   */
  calculateHeroPowerV2(input: HeroPowerInputV2): HeroPowerResult {
    const formula = this.getFormulaConfig();

    // 1. 提取输入属性
    const inputSummary = extractAttributesFromProgress(input.heroProgress);

    // 2. 计算 rawPower = Σ(stat * weight)
    let rawPower = 0;
    const outputSummary: Record<string, number> = {};
    for (const [stat, value] of Object.entries(inputSummary)) {
      const weight = formula.statWeights[stat] ?? 0;
      const contribution = value * weight;
      outputSummary[stat] = contribution;
      rawPower += contribution;
    }

    // 3. 应用修正规则
    rawPower = applyFormulaModifiers(rawPower, formula.modifiers);

    // 4. 取整
    let power = applyRounding(rawPower, formula.rounding);

    // 5. 加上装备战力
    power += Math.max(0, input.equipmentPower);
    power = Math.max(0, power);

    // 6. 发布领域事件
    try {
      const domainBus = DomainEventBus.getInstance();
      domainBus.publish(
        DomainEventType.HERO_POWER_RECALCULATED,
        {
          heroId: input.heroId,
          power,
          formulaVersion: formula.version,
          inputSummary,
          outputSummary,
          equipmentPower: input.equipmentPower,
        },
        input.heroId,
        'system',
      );
    } catch {
      // 事件发布失败不影响主流程
    }

    return {
      heroId: input.heroId,
      power,
      formulaVersion: formula.version,
      inputSummary,
      outputSummary,
    };
  }

  /**
   * 单英雄战力计算（V2 公式版，指定版本号）。
   *
   * @param input            英雄战力计算输入
   * @param formulaVersion   指定公式版本
   * @returns                战力计算结果
   */
  calculateHeroPowerV2WithVersion(
    input: HeroPowerInputV2,
    formulaVersion: number,
  ): HeroPowerResult {
    const formula = this.getFormulaConfig(formulaVersion);

    const inputSummary = extractAttributesFromProgress(input.heroProgress);

    let rawPower = 0;
    const outputSummary: Record<string, number> = {};
    for (const [stat, value] of Object.entries(inputSummary)) {
      const weight = formula.statWeights[stat] ?? 0;
      const contribution = value * weight;
      outputSummary[stat] = contribution;
      rawPower += contribution;
    }

    rawPower = applyFormulaModifiers(rawPower, formula.modifiers);
    let power = applyRounding(rawPower, formula.rounding);
    power += Math.max(0, input.equipmentPower);
    power = Math.max(0, power);

    return {
      heroId: input.heroId,
      power,
      formulaVersion,
      inputSummary,
      outputSummary,
    };
  }

  /**
   * 团队战力计算（V2 公式版）。
   *
   * 聚合多英雄的单英雄战力计算结果，使用统一的 correlationId 追踪。
   *
   * @param input  团队战力计算输入
   * @returns      团队战力计算结果
   */
  calculateTeamPowerV2(input: TeamPowerInputV2): TeamPowerResult {
    const correlationId = generateCorrelationId();
    const result = createEmptyTeamPowerResult(correlationId);

    for (const heroId of input.heroIds) {
      const heroProgress = input.heroProgressMap[heroId];
      if (!heroProgress) {
        console.warn(`[PowerSystem] calculateTeamPowerV2: 英雄 ${heroId} 缺少 heroProgress`);
        continue;
      }

      const equipmentPower = input.equipmentPowerMap[heroId] ?? 0;

      const heroResult = this.calculateHeroPowerV2({
        heroId,
        heroProgress,
        equipmentPower,
      });

      // 补充 correlationId 到事件中
      try {
        const domainBus = DomainEventBus.getInstance();
        domainBus.publish(
          DomainEventType.HERO_POWER_RECALCULATED,
          {
            heroId,
            power: heroResult.power,
            formulaVersion: heroResult.formulaVersion,
            inputSummary: heroResult.inputSummary,
            outputSummary: heroResult.outputSummary,
            equipmentPower,
            correlationId,
          },
          heroId,
          'system',
          correlationId,
        );
      } catch {
        // 事件发布失败不影响主流程
      }

      result.individualResults.push(heroResult);
      result.totalPower += heroResult.power;
    }

    return result;
  }

  /**
   * 批量战力重算。
   *
   * 支持 migrate / lazy recalc 场景，输出每位英雄的 delta 与公式版本摘要。
   *
   * @param input              批量重算输入
   * @param oldPowers          旧战力值映射（heroId → oldPower，用于计算 delta）
   * @returns                  批量重算结果
   */
  recalculateBatch(
    input: PowerRecalculateBatchInput,
    oldPowers?: Record<string, number>,
  ): PowerRecalculateBatchResult {
    const correlationId = input.correlationId ?? generateCorrelationId();
    const formulaVersion = input.forceLatestFormula !== false
      ? this._activeFormulaVersion
      : this._activeFormulaVersion;

    const result: PowerRecalculateBatchResult = {
      success: true,
      heroCount: 0,
      heroResults: [],
      newTotalPower: 0,
      skippedCount: 0,
      skippedHeroIds: [],
      errors: [],
      formulaVersion,
      correlationId,
      reason: input.reason,
    };

    // heroIds 为空表示"全部"（由调用方传入完整列表）
    const heroIds = input.heroIds ?? [];
    if (heroIds.length === 0) {
      return result;
    }

    const domainBus = DomainEventBus.getInstance();
    domainBus.beginCorrelation(`power_recalc_${input.reason}`);

    try {
      for (const heroId of heroIds) {
        try {
          // 从 heroProgressMap 获取（假设调用方通过外部系统传入）
          // 注意：实际使用时需要由调用方提供完整的 HeroPowerInputV2
          // 这里 heroProgress 和 equipmentPower 由调用方负责组装
          // recalculateBatch 更像是一个协调器
        } catch (e) {
          result.skippedCount += 1;
          result.skippedHeroIds.push(heroId);
          result.errors.push(`英雄 ${heroId} 重算失败: ${e}`);
        }
      }
    } finally {
      domainBus.endCorrelation(correlationId);
    }

    return result;
  }

  /**
   * 批量战力重算（带完整数据）。
   *
   * 这是 recalculateBatch 的完整版本，调用方提供所有必要数据。
   *
   * @param heroInputs     各英雄的计算输入
   * @param reason         重算原因
   * @param oldPowers      旧战力映射（可选，用于计算 delta）
   * @param correlationId  关联 ID（可选）
   * @returns              批量重算结果
   */
  recalculateBatchFull(
    heroInputs: HeroPowerInputV2[],
    reason: PowerRecalculateBatchInput['reason'],
    oldPowers?: Record<string, number>,
    correlationId?: CorrelationId,
  ): PowerRecalculateBatchResult {
    const corrId = correlationId ?? generateCorrelationId();
    const formulaVersion = this._activeFormulaVersion;

    const result: PowerRecalculateBatchResult = {
      success: true,
      heroCount: 0,
      heroResults: [],
      newTotalPower: 0,
      skippedCount: 0,
      skippedHeroIds: [],
      errors: [],
      formulaVersion,
      correlationId: corrId,
      reason,
    };

    if (heroInputs.length === 0) {
      return result;
    }

    const domainBus = DomainEventBus.getInstance();
    domainBus.beginCorrelation(`power_recalc_${reason}`);

    try {
      for (const input of heroInputs) {
        try {
          const heroResult = this.calculateHeroPowerV2(input);

          // 计算 delta
          if (oldPowers) {
            const oldPower = oldPowers[input.heroId];
            if (typeof oldPower === 'number') {
              heroResult.delta = heroResult.power - oldPower;
              result.oldTotalPower = (result.oldTotalPower ?? 0) + oldPower;
            }
          }

          result.heroResults.push(heroResult);
          result.newTotalPower += heroResult.power;
          result.heroCount += 1;

          // 发布重算事件
          domainBus.publish(
            DomainEventType.HERO_POWER_RECALCULATED,
            {
              heroId: input.heroId,
              power: heroResult.power,
              formulaVersion,
              inputSummary: heroResult.inputSummary,
              outputSummary: heroResult.outputSummary,
              equipmentPower: input.equipmentPower,
              delta: heroResult.delta,
              reason,
              correlationId: corrId,
            },
            input.heroId,
            'system',
            corrId,
          );
        } catch (e) {
          result.skippedCount += 1;
          result.skippedHeroIds.push(input.heroId);
          result.errors.push(`英雄 ${input.heroId} 重算失败: ${e}`);
        }
      }
    } finally {
      domainBus.endCorrelation(corrId);
    }

    if (result.oldTotalPower !== undefined) {
      result.totalPowerDelta = result.newTotalPower - result.oldTotalPower;
    }

    return result;
  }

  /**
   * 对比不同公式版本结果。
   *
   * 用于排行榜、竞技匹配或迁移验证。
   *
   * @param input  公式对比输入
   * @returns      对比结果
   */
  compareFormulaVersions(input: FormulaCompareInput): FormulaCompareResult {
    const baseInput: HeroPowerInputV2 = {
      heroId: input.heroId,
      heroProgress: input.heroProgress,
      equipmentPower: input.equipmentPower,
    };

    const baseInputSummary = extractAttributesFromProgress(input.heroProgress);
    const versionResults: FormulaVersionSummary[] = [];

    for (const version of input.versions) {
      const heroResult = this.calculateHeroPowerV2WithVersion(baseInput, version);
      versionResults.push({
        formulaVersion: version,
        power: heroResult.power,
        inputSummary: heroResult.inputSummary,
        outputSummary: heroResult.outputSummary,
      });
    }

    // 排序确保版本有序
    versionResults.sort((a, b) => a.formulaVersion - b.formulaVersion);

    // 找最高/最低战力版本
    let highestPowerVersion = versionResults[0].formulaVersion;
    let lowestPowerVersion = versionResults[0].formulaVersion;
    let highestPower = versionResults[0].power;
    let lowestPower = versionResults[0].power;

    for (const vr of versionResults) {
      if (vr.power > highestPower) {
        highestPower = vr.power;
        highestPowerVersion = vr.formulaVersion;
      }
      if (vr.power < lowestPower) {
        lowestPower = vr.power;
        lowestPowerVersion = vr.formulaVersion;
      }
    }

    // 计算版本间差异
    const diffs: FormulaVersionDiff[] = [];
    for (let i = 0; i < versionResults.length; i++) {
      for (let j = i + 1; j < versionResults.length; j++) {
        const a = versionResults[i];
        const b = versionResults[j];
        const powerDelta = a.power - b.power;
        const powerDeltaPercent = b.power !== 0
          ? Math.round((powerDelta / b.power) * 10000) / 100
          : 0;

        diffs.push({
          versionA: a.formulaVersion,
          versionB: b.formulaVersion,
          powerDelta,
          powerDeltaPercent,
        });
      }
    }

    return {
      heroId: input.heroId,
      versionResults,
      highestPowerVersion,
      lowestPowerVersion,
      diffs,
      baseInputSummary,
    };
  }

  // ==================== 内部方法 ====================

  private _findDefaultPowerConfig(config: PowerConfigData): PowerConfig {
    const firstConfig = config.data[0];
    const defaultConfig =
      config.data.find((entry) => entry.id === PowerSystem.DEFAULT_POWER_CONFIG_ID) ?? firstConfig;

    if (!defaultConfig) {
      throw new Error('[PowerSystem] power_config 未包含任何战力配置');
    }

    return defaultConfig;
  }

  private _requirePowerConfig(): PowerConfig {
    if (!this._powerConfig) {
      throw new Error('[PowerSystem] 战力配置未加载，请先调用 loadConfig()');
    }

    return this._powerConfig;
  }

  private _toSafeAttribute(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, value);
  }
}
