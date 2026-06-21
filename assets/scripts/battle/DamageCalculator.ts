// ============================================================
// DamageCalculator.ts — 战斗伤害计算器
// 职责：纯逻辑工具类，执行单次伤害计算
// 位置：battle/ 层
// 依赖：Faction (hero_config) — 仅类型导入
// 规范：零 any / 所有方法 static / 不依赖 UI/场景/节点
// ============================================================

import type { Faction } from '../config/hero_config';

// ==================== 配置接口 ====================

/**
 * 伤害计算配置
 *
 * 初始化来源：GlobalBattleEntry（global_config.ts）
 * 调用方（BattleSystem）在战斗初始化时通过 setConfig() 注入
 *
 * TODO R5: 当前 config 为静态单例。未来如需支持多战斗实例或并行测试，
 *          可改为实例化 DamageCalculator 或将 config 作为 calculate() 参数传入。
 */
export interface DamageCalcConfig {
  /**
   * 阵营克制 — 进攻端增伤加成（0.25 = +25%）
   *
   * 对应 03-card-system.md "伤害提升：25%"
   * 对应 GlobalBattleEntry.elementCounterBonus
   */
  counterBonus: number;
  /**
   * 阵营克制 — 防御端减伤比例（0.10 = -10%）
   *
   * 对应 03-card-system.md "受到伤害降低：10%"
   * TODO: 该字段应移入 GlobalBattleEntry 配置表
   */
  counterProtection: number;
  /** 默认暴击伤害倍率（1.5 = 150%）
   *  对应 GlobalBattleEntry.criticalDamageMultiplier */
  defaultCritDamage: number;
  /** 伤害随机浮动范围（0.1 = ±10%）
   *  对应 GlobalBattleEntry.damageRandomFactor */
  randomRange: number;
  /**
   * 防御减免系数（每点防御减少的伤害值）
   *
   * TODO: 后续数值调优阶段可替换为 defense / (defense + constant) 类型
   *       的百分比减伤公式。当前阶段使用线性减免以简化计算。
   *
   * TODO: 该字段应移入 GlobalBattleEntry 配置表，禁止硬编码默认值。
   */
  defenseFactor: number;
  /** 最低伤害保底（防止防御减免后伤害 ≤ 0） */
  minDamage: number;
}

// ==================== 默认配置 ====================

/**
 * 默认配置（对齐 GlobalBattleEntry 默认值）
 *
 * 调用方应在战斗初始化时通过 setConfig() 从 GlobalBattleEntry 注入实际值。
 * 若未调用 setConfig()，将使用此默认值。
 */
const DEFAULT_CONFIG: DamageCalcConfig = {
  counterBonus: 0.25,
  counterProtection: 0.10,
  defaultCritDamage: 1.5,
  randomRange: 0.1,
  // TODO: 该值应移入 GlobalBattleEntry，后续禁止在此处硬编码
  defenseFactor: 0.5,
  minDamage: 1,
};

// ==================== 输入接口 ====================

/**
 * 单次伤害计算输入
 *
 * 由 BattleSystem 在技能命中时构造，从 BattleUnit 提取所需字段
 */
export interface DamageInput {
  // ===== 攻击方 =====
  /** 攻击方运行时唯一 ID */
  sourceUnitId: string;
  /** 攻击方攻击力（运行时值，含 Buff 修正） */
  sourceAttack: number;
  /** 攻击方阵营（用于克制判定） */
  sourceFaction: Faction;
  /** 攻击方暴击率（0.0 ~ 1.0） */
  sourceCritRate: number;
  /** 攻击方暴击伤害倍率（1.5 = 150%） */
  sourceCritDamage: number;
  /** 攻击方增伤系数（0.1 = +10%，含 Buff / 羁绊加成）
   *  会被 clamp 到 [-1, +∞)，避免负倍率进入计算 */
  sourceDamageBonus: number;

  // ===== 受击方 =====
  /** 受击方运行时唯一 ID */
  targetUnitId: string;
  /** 受击方阵营（用于克制判定） */
  targetFaction: Faction;
  /** 受击方防御力（运行时值，含 Buff 修正） */
  targetDefense: number;
  /** 受击方减伤系数（0.1 = -10%，含 Buff / 被动减伤）
   *  会被 clamp 到 [0, 1] */
  targetDamageReduction: number;

  // ===== 技能 =====
  /** 技能倍率（1.0 = 100%） */
  skillMultiplier: number;
}

// ==================== 输出接口 ====================

/**
 * 单次伤害计算结果
 */
export interface DamageResult {
  /** 最终伤害值（整数，≥ minDamage） */
  damage: number;
  /** 是否触发暴击 */
  isCritical: boolean;
  /**
   * 进攻端克制是否触发（source 阵营克制 target 阵营）
   *
   * 触发时伤害 × (1 + counterBonus)，默认 1.25
   */
  isAttackCountered: boolean;
  /**
   * 防御端克制是否触发（target 阵营克制 source 阵营）
   *
   * 触发时伤害 × (1 - counterProtection)，默认 0.9
   */
  isDefenseCountered: boolean;
  /**
   * 阵营克制综合倍率
   *
   * = (isAttackCountered ? 1.25 : 1.0) × (isDefenseCountered ? 0.9 : 1.0)
   * 用于 UI 克制提示 / 伤害数字颜色判定
   */
  factionMultiplier: number;
  /**
   * 最终伤害倍率（不含防御减免 / 减伤 / 随机浮动）
   *
   * = (1 + damageBonus) × critMultiplier × factionMultiplier
   * 用于调试面板 / GM 面板
   */
  finalMultiplier: number;
  /** 攻击方 ID */
  sourceUnitId: string;
  /** 受击方 ID */
  targetUnitId: string;
}

// ==================== 阵营克制映射 ====================

/**
 * 阵营克制关系表（对齐 03-card-system.md）
 *
 * 青龙 → 白虎    （青龙克制白虎）
 * 白虎 → 朱雀    （白虎克制朱雀）
 * 朱雀 → 玄武    （朱雀克制玄武）
 * 玄武 → 青龙    （玄武克制青龙）
 * 混沌 → 不克制任何阵营，不被任何阵营克制
 *
 * Key   = 攻击方阵营
 * Value = 被该阵营克制的阵营
 * 混沌不在 Key 中（不克制），也不在任何 Value 中（不被克制）
 */
const COUNTER_MAP: ReadonlyMap<Faction, Faction> = new Map([
  ['青龙', '白虎'],
  ['白虎', '朱雀'],
  ['朱雀', '玄武'],
  ['玄武', '青龙'],
]);

// ==================== 计算器 ====================

/**
 * 战斗伤害计算器
 *
 * 纯逻辑工具类，所有方法为 static。
 * 不依赖 UI / 场景 / 节点 / BattleManager。
 *
 * 使用方式：
 *
 *   // 1. 战斗初始化时注入配置（可选，不调用则使用默认值）
 *   DamageCalculator.setConfig({
 *     counterBonus:       battleCfg.elementCounterBonus,      // GlobalBattleEntry
 *     counterProtection:  0.10,                                // TODO: 移入 GlobalBattleEntry
 *     defaultCritDamage:  battleCfg.criticalDamageMultiplier,  // GlobalBattleEntry
 *     randomRange:        battleCfg.damageRandomFactor,        // GlobalBattleEntry
 *     defenseFactor:      0.5,                                 // TODO: 移入 GlobalBattleEntry
 *     minDamage:          1,
 *   });
 *
 *   // 2. 开发阶段开启 debug 日志
 *   DamageCalculator.setDebugMode(true);
 *
 *   // 3. 每次技能命中时计算伤害
 *   const input: DamageInput = {
 *     sourceUnitId:      attacker.unitId,
 *     sourceAttack:      attacker.attack,
 *     sourceFaction:     attacker.faction,
 *     sourceCritRate:    attackerCritRate,
 *     sourceCritDamage:  attackerCritDamage,
 *     sourceDamageBonus: attackerDamageBonus,
 *     targetUnitId:      defender.unitId,
 *     targetFaction:     defender.faction,
 *     targetDefense:     defender.defense,
 *     targetDamageReduction: defenderDamageReduction,
 *     skillMultiplier:   skill.multiplier,
 *   };
 *   const result: DamageResult = DamageCalculator.calculate(input);
 */
export class DamageCalculator {
  // ==================== 配置 ====================

  private static config: DamageCalcConfig = { ...DEFAULT_CONFIG };

  /** debug 模式开关（开启后非法参数会 console.warn） */
  private static debugMode: boolean = false;

  /**
   * 注入伤害计算配置（战斗初始化时调用一次）
   *
   * @param cfg — 来自 GlobalBattleEntry 的运行时配置
   */
  static setConfig(cfg: DamageCalcConfig): void {
    DamageCalculator.config = { ...cfg };
  }

  /**
   * 获取当前配置（调试用 / GM 面板）
   */
  static getConfig(): Readonly<DamageCalcConfig> {
    return DamageCalculator.config;
  }

  /**
   * 重置配置为默认值（测试用）
   */
  static resetConfig(): void {
    DamageCalculator.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 开启 / 关闭 debug 日志
   *
   * 开启后，非法参数（critDamage ≤ 0 / skillMultiplier ≤ 0 / damageBonus < -1）
   * 会输出 console.warn，帮助定位配置错误。
   *
   * @param enabled — true 开启，false 关闭
   */
  static setDebugMode(enabled: boolean): void {
    DamageCalculator.debugMode = enabled;
  }

  // ==================== 主计算入口 ====================

  /**
   * 执行一次完整的伤害计算
   *
   * 公式：
   *   attackCounterMult = isAttackCountered ? 1 + counterBonus : 1.0
   *   defenseCounterMult = isDefenseCountered ? 1 - counterProtection : 1.0
   *   factionMult = attackCounterMult × defenseCounterMult
   *
   *   baseDmg = sourceAttack × skillMultiplier
   *   adjustedDmg = baseDmg
   *     × (1 + damageBonus)
   *     × critMultiplier
   *     × factionMult
   *     × randomFactor
   *   defensePenalty = targetDefense × defenseFactor
   *   afterDefense = adjustedDmg - defensePenalty
   *   rawDmg = afterDefense × (1 - targetDamageReduction)
   *   finalDmg = max(minDamage, round(rawDmg))
   *
   * @param input — 伤害计算输入
   * @returns 结构化计算结果
   */
  static calculate(input: DamageInput): DamageResult {
    const cfg = DamageCalculator.config;

    // ===== Step 1 — 阵营克制判定（双向）=====

    const isAttackCountered = DamageCalculator.isAttackerCounterTarget(
      input.sourceFaction,
      input.targetFaction,
    );
    const isDefenseCountered = DamageCalculator.isDefenderCounterAttacker(
      input.sourceFaction,
      input.targetFaction,
    );

    const attackCounterMult = isAttackCountered
      ? 1.0 + cfg.counterBonus
      : 1.0;
    const defenseCounterMult = isDefenseCountered
      ? 1.0 - cfg.counterProtection
      : 1.0;
    const factionMultiplier = attackCounterMult * defenseCounterMult;

    // ===== Step 2 — 暴击判定 =====

    const critRate = DamageCalculator.clamp(input.sourceCritRate, 0, 1);
    const isCritical = Math.random() < critRate;

    let critMultiplier: number;
    if (isCritical) {
      if (input.sourceCritDamage > 0) {
        critMultiplier = input.sourceCritDamage;
      } else {
        // R2: 暴击倍率非法，fallback 到默认值
        if (DamageCalculator.debugMode) {
          console.warn(
            `[DamageCalc] unit=${input.sourceUnitId} ` +
            `critDamage=${input.sourceCritDamage} 非法 (≤0)，` +
            `已 fallback 到 defaultCritDamage=${cfg.defaultCritDamage}`,
          );
        }
        critMultiplier = cfg.defaultCritDamage;
      }
    } else {
      critMultiplier = 1.0;
    }

    // ===== Step 3 — 随机浮动（范围来自 config）=====

    const randomFactor =
      1.0 + (Math.random() * 2 - 1) * cfg.randomRange;

    // ===== Step 4 — 基础伤害 =====

    const skillMult = input.skillMultiplier;

    // R3: 技能倍率非法
    if (skillMult <= 0 && DamageCalculator.debugMode) {
      console.warn(
        `[DamageCalc] unit=${input.sourceUnitId} ` +
        `skillMultiplier=${skillMult} 非法 (≤0)，` +
        `基础伤害将异常偏低`,
      );
    }

    const baseDmg = input.sourceAttack * skillMult;

    // ===== Step 5 — 伤害修正 =====

    // R4: sourceDamageBonus 非法范围，clamp 到 -1
    let damageBonus = input.sourceDamageBonus;
    if (damageBonus < -1) {
      if (DamageCalculator.debugMode) {
        console.warn(
          `[DamageCalc] unit=${input.sourceUnitId} ` +
          `sourceDamageBonus=${damageBonus} 非法 (< -1)，` +
          `已 clamp 到 -1`,
        );
      }
      damageBonus = -1;
    }

    const damageBonusMultiplier = 1.0 + damageBonus;
    const adjustedDmg =
      baseDmg *
      damageBonusMultiplier *
      critMultiplier *
      factionMultiplier *
      randomFactor;

    // ===== Step 6 — 防御减免 =====

    const effectiveDefense = Math.max(0, input.targetDefense);
    const defensePenalty = effectiveDefense * cfg.defenseFactor;
    const afterDefense = adjustedDmg - defensePenalty;

    // ===== Step 7 — 减伤 & 保底 =====

    const effectiveReduction = DamageCalculator.clamp(
      input.targetDamageReduction,
      0,
      1,
    );
    const rawDmg = afterDefense * (1.0 - effectiveReduction);
    const finalDmg = Math.max(cfg.minDamage, Math.round(rawDmg));

    // 最终倍率（不含随机浮动 / 防御 / 减伤，用于调试 & UI 判定）
    const finalMultiplier =
      damageBonusMultiplier * critMultiplier * factionMultiplier;

    return {
      damage: finalDmg,
      isCritical,
      isAttackCountered,
      isDefenseCountered,
      factionMultiplier,
      finalMultiplier,
      sourceUnitId: input.sourceUnitId,
      targetUnitId: input.targetUnitId,
    };
  }

  // ==================== 阵营克制（双向）====================

  /**
   * 判断攻击方阵营是否克制受击方阵营（进攻端）
   *
   * 青龙克白虎 → isAttackerCounterTarget('青龙', '白虎') = true
   * 混沌不克制任何阵营 → 始终返回 false
   *
   * @param sourceFaction — 攻击方阵营
   * @param targetFaction — 受击方阵营
   */
  static isAttackerCounterTarget(
    sourceFaction: Faction,
    targetFaction: Faction,
  ): boolean {
    const counteredFaction = COUNTER_MAP.get(sourceFaction);
    return counteredFaction === targetFaction;
  }

  /**
   * 判断受击方阵营是否克制攻击方阵营（防御端）
   *
   * 青龙克白虎 → isDefenderCounterAttacker('白虎', '青龙') = true
   * （白虎攻击青龙时，青龙克制白虎，白虎受到 -10% 伤害惩罚）
   *
   * 等价于 isAttackerCounterTarget(targetFaction, sourceFaction)
   * 混沌不被任何阵营克制 → 始终返回 false
   *
   * @param sourceFaction — 攻击方阵营
   * @param targetFaction — 受击方阵营
   */
  static isDefenderCounterAttacker(
    sourceFaction: Faction,
    targetFaction: Faction,
  ): boolean {
    // 受击方克制攻击方 = 受击方作为"攻击方"时能克制攻击方
    return DamageCalculator.isAttackerCounterTarget(
      targetFaction,
      sourceFaction,
    );
  }

  /**
   * 获取阵营克制综合倍率（进攻 × 防御）
   *
   * @param sourceFaction — 攻击方阵营
   * @param targetFaction — 受击方阵营
   * @returns 综合克制倍率
   *   - 攻击方克制受击方：1.25
   *   - 受击方克制攻击方：0.90
   *   - 互不克制：1.00
   *   - 不可能同时触发（克制链为单向循环）
   */
  static getCounterMultiplier(
    sourceFaction: Faction,
    targetFaction: Faction,
  ): number {
    const cfg = DamageCalculator.config;
    const attackMult = DamageCalculator.isAttackerCounterTarget(
      sourceFaction,
      targetFaction,
    )
      ? 1.0 + cfg.counterBonus
      : 1.0;
    const defenseMult = DamageCalculator.isDefenderCounterAttacker(
      sourceFaction,
      targetFaction,
    )
      ? 1.0 - cfg.counterProtection
      : 1.0;
    return attackMult * defenseMult;
  }

  /**
   * 获取阵营克制映射表（只读，用于调试 / GM 面板）
   */
  static getCounterMap(): ReadonlyMap<Faction, Faction> {
    return COUNTER_MAP;
  }

  // ==================== 工具 ====================

  /**
   * 将数值限制在 [min, max] 范围内
   */
  private static clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }
}
