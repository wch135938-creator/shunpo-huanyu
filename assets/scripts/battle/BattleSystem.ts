// ============================================================
// BattleSystem.ts — 自动战斗逻辑系统
// 职责：纯战斗逻辑编排，不包含 UI / 节点 / 场景 / 广告 / 存档
// 位置：battle/ 层
// 依赖：DamageCalculator, BattleData, BattleUnit, EventManager
//       配置通过 injectConfig() 由 BattleManager 注入
// 规范：零 any / 严格的 TypeScript 类型 / 所有数值走注入的 config
//       禁止直接调用 ConfigManager
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { BattleState, BattleUnitType, BattleResultType } from './BattleTypes';
import type { BattlePosition } from './BattleTypes';
import type { BattleData } from './BattleData';
import type { BattleUnit } from './BattleUnit';
import type {
  BattleExecutionResult,
} from './BattleResult';
import { DamageCalculator } from './DamageCalculator';
import type { DamageInput } from './DamageCalculator';
import type { SkillConfig } from '../config/skill_config';
import type { GlobalBattleEntry } from '../config/global_config';

// ==================== 战斗事件名常量 ====================

/**
 * 战斗系统事件名
 *
 * 使用方式：
 *   EventManager.getInstance().emit(BattleEvent.BATTLE_STARTED, payload);
 *
 * 禁止在业务代码中硬编码 'battle:xxx' 字符串。
 */
export const BattleEvent = {
  /** 战斗开始 — 载荷类型: BattleStartedEvent */
  BATTLE_STARTED: 'battle:started',
  /** 战斗结束 — 载荷类型: BattleEndedEvent */
  BATTLE_ENDED: 'battle:ended',
  /** 单位受击 — 载荷类型: UnitDamagedEvent */
  UNIT_DAMAGED: 'battle:unitDamaged',
  /** 单位死亡 — 载荷类型: UnitDiedEvent */
  UNIT_DIED: 'battle:unitDied',
} as const;

// ==================== 事件载荷接口 ====================

/** BATTLE_STARTED 事件载荷 */
export interface BattleStartedEvent {
  stageId: string;
  playerUnits: ReadonlyArray<BattleUnit>;
  enemyUnits: ReadonlyArray<BattleUnit>;
}

/** UNIT_DAMAGED 事件载荷 */
export interface UnitDamagedEvent {
  sourceUnitId: string;
  targetUnitId: string;
  damage: number;
  isCritical: boolean;
  /** 受击后剩余 HP */
  remainingHp: number;
  /** 受击方最大 HP */
  targetMaxHp: number;
}

/** UNIT_DIED 事件载荷 */
export interface UnitDiedEvent {
  unitId: string;
  unitType: BattleUnitType;
  position: BattlePosition;
}

/** BATTLE_ENDED 事件载荷
 *
 * 载荷为 BattleExecutionResult（不含奖励）。
 * BattleManager 收到后负责从 DropConfig 组装最终 BattleResult。
 */
export interface BattleEndedEvent {
  executionResult: BattleExecutionResult;
}

// ==================== 注入配置接口 ====================

/**
 * BattleSystem 运行时配置（由 BattleManager 注入）
 *
 * BattleSystem 不直接读取 ConfigManager。
 * 所有配置数据通过此接口在 startBattle() 之前注入。
 */
export interface BattleSystemConfig {
  /** 战斗全局参数（来自 GlobalBattleEntry） */
  battleConfig: GlobalBattleEntry;
  /** 技能配置缓存（key = skillId，来自 SkillDataConfig.data） */
  skillConfigMap: Map<string, SkillConfig>;
}

// ==================== 内部常量 ====================

/**
 * 行动槽阈值（速度·毫秒 累积量）
 * 单位以 speed × deltaTimeMs 累积行动槽，达到此阈值时触发行动。
 */
const ACTION_THRESHOLD = 1000;

/**
 * 单帧最大行动处理次数
 * 防止极端大的 deltaTimeMs 导致单帧死循环。
 * 超出部分延至下一帧处理。
 */
const MAX_ACTIONS_PER_FRAME = 100;

/**
 * 默认普攻倍率（用于 skillId 查找失败时的 fallback）
 */
const FALLBACK_ATTACK_MULTIPLIER = 1.0;

// ==================== BattleSystem ====================

export class BattleSystem extends BaseSystem {
  // ===== 单例 =====

  static getInstance(): BattleSystem {
    return super.getInstance<BattleSystem>();
  }

  // ===== 依赖 =====

  private _eventManager: EventManager;

  // ===== 运行时状态 =====

  private _battleData: BattleData | null = null;
  private _speedMultiplier: number = 1;

  /** 行动槽累积量，key = unitId */
  private _actionGauges: Map<string, number> = new Map();
  /** 技能冷却剩余时间（毫秒），key = unitId */
  private _cooldowns: Map<string, number> = new Map();
  /** 能量累积，key = unitId */
  private _energy: Map<string, number> = new Map();

  /** 战斗全局配置（由 BattleManager 通过 injectConfig 注入） */
  private _battleConfig: GlobalBattleEntry | null = null;
  /** 技能配置缓存（由 BattleManager 注入） */
  private _skillConfigMap: Map<string, SkillConfig> = new Map();

  /** 本场被击杀的敌人 configId 列表 */
  private _killedEnemyIds: string[] = [];
  /** 本场回合计数（每次所有存活单位行动槽清空一轮 +1） */
  private _roundCount: number = 0;
  /** 上一轮行动过的单位 ID 集合，用于检测回合边界 */
  private _actedThisRound: Set<string> = new Set();
  /** 当前帧已处理的行动数（防死循环） */
  private _actionsThisFrame: number = 0;
  /** 本场战斗是否因超时结束（用于 _emitBattleEnded 确定 resultType） */
  private _timeoutReached: boolean = false;

  // ===== 构造 =====

  constructor() {
    super();
    this._eventManager = EventManager.getInstance();
  }

  // ================================================================
  // 公共接口
  // ================================================================

  // ===== 注入配置 =====

  /**
   * 注入运行时配置（由 BattleManager 在 initBattle 之后、startBattle 之前调用）
   *
   * BattleSystem 不直接依赖 ConfigManager。所有所需配置通过此方法注入。
   *
   * @param config — BattleSystemConfig，包含战斗参数 / 技能表 / 奖励解析器
   */
  injectConfig(config: BattleSystemConfig): void {
    if (!this._battleData) {
      console.warn(
        '[BattleSystem] injectConfig() 失败: 未调用 initBattle()',
      );
      return;
    }

    this._battleConfig = config.battleConfig;
    this._skillConfigMap = config.skillConfigMap;
  }

  // ===== 初始化战斗 =====

  /**
   * 初始化战斗 — 创建 BattleData 并设置所有 per-unit 追踪状态
   *
   * 调用时机：进入关卡前，由 BattleManager 调用。
   * 调用后状态 = BattleState.Ready。
   * 下一步：调用 injectConfig() → startBattle()
   *
   * @param stageId      — 关卡 ID，引用 StageEntry.id
   * @param playerUnits  — 我方战斗单元（已从 HeroConfig 创建完毕，含站位）
   * @param enemyUnits   — 敌方战斗单元（已从 EnemyConfig 创建完毕，含站位）
   * @returns BattleData — 战斗容器，供调用方引用
   */
  initBattle(
    stageId: string,
    playerUnits: BattleUnit[],
    enemyUnits: BattleUnit[],
  ): BattleData {
    // 清空上一场残留
    this._resetInternalState();

    this._battleData = {
      stageId,
      playerUnits,
      enemyUnits,
      battleState: BattleState.Ready,
      round: 0,
      elapsedTimeMs: 0,
    };

    // 初始化 per-unit 状态
    const allUnits = [...playerUnits, ...enemyUnits];
    for (const unit of allUnits) {
      this._actionGauges.set(unit.unitId, 0);
      this._cooldowns.set(unit.unitId, 0);
      this._energy.set(unit.unitId, 0);
    }

    return this._battleData;
  }

  // ===== 开始战斗 =====

  /**
   * 开始战斗 — 验证配置注入、配置 DamageCalculator、切换状态为 Fighting、发出事件
   *
   * 调用时机：initBattle() + injectConfig() 之后，UI 准备就绪时。
   */
  startBattle(): void {
    if (!this._battleData) {
      console.warn('[BattleSystem] startBattle() 失败: 未调用 initBattle()');
      return;
    }

    if (this._battleData.battleState !== BattleState.Ready) {
      console.warn(
        `[BattleSystem] startBattle() 跳过: 当前状态=${this._battleData.battleState}`,
      );
      return;
    }

    // 验证配置已注入
    if (!this._battleConfig) {
      console.warn(
        '[BattleSystem] startBattle() 失败: 未调用 injectConfig()，缺少战斗配置',
      );
      return;
    }

    // 边界：空阵容检测
    const alivePlayerCount = this._countAlive(this._battleData.playerUnits);
    const aliveEnemyCount = this._countAlive(this._battleData.enemyUnits);

    if (alivePlayerCount === 0 || aliveEnemyCount === 0) {
      this._battleData.battleState =
        aliveEnemyCount === 0 ? BattleState.Victory : BattleState.Defeat;
      this._emitBattleEnded();
      return;
    }

    // 配置 DamageCalculator（参数来自注入的 battleConfig）
    DamageCalculator.setConfig({
      counterBonus: this._battleConfig.elementCounterBonus,
      // TODO: counterProtection / defenseFactor 后续移入 GlobalBattleEntry
      counterProtection: 0.1,
      defaultCritDamage: this._battleConfig.criticalDamageMultiplier,
      randomRange: this._battleConfig.damageRandomFactor,
      defenseFactor: 0.5,
      minDamage: 1,
    });

    this._battleData.battleState = BattleState.Fighting;

    this._eventManager.emit(BattleEvent.BATTLE_STARTED, {
      stageId: this._battleData.stageId,
      playerUnits: this._battleData.playerUnits,
      enemyUnits: this._battleData.enemyUnits,
    } satisfies BattleStartedEvent);
  }

  // ===== 暂停 / 继续 =====

  /** 暂停战斗（切后台 / 广告时调用） */
  pauseBattle(): void {
    if (
      this._battleData &&
      this._battleData.battleState === BattleState.Fighting
    ) {
      this._battleData.battleState = BattleState.Paused;
    }
  }

  /** 恢复战斗 */
  resumeBattle(): void {
    if (
      this._battleData &&
      this._battleData.battleState === BattleState.Paused
    ) {
      this._battleData.battleState = BattleState.Fighting;
    }
  }

  /** 终止战斗 — 清空所有内部状态 */
  stopBattle(): void {
    this._resetInternalState();
    this._battleData = null;
  }

  // ===== 主更新循环 =====

  /**
   * 每帧调用，推进战斗逻辑
   *
   * 仅在 Fighting 状态下生效。处理流程：
   *   1. 倍速修正 deltaTimeMs
   *   2. 累积 elapsedTimeMs，检查超时
   *   3. 更新技能冷却
   *   4. 累积行动槽
   *   5. 处理所有就绪单位的行动（最多 MAX_ACTIONS_PER_FRAME 次）
   *   6. 每次行动后检查结束条件
   *
   * @param deltaTimeMs — 距上一帧的毫秒数
   */
  update(deltaTimeMs: number): void {
    if (!this._battleData) return;
    if (this._battleData.battleState !== BattleState.Fighting) return;
    if (deltaTimeMs <= 0) return;

    const effectiveDelta = deltaTimeMs * this._speedMultiplier;

    // 更新战斗时间
    this._battleData.elapsedTimeMs += effectiveDelta;

    // 超时检查
    if (this._isTimeout()) {
      this._handleTimeout();
      return;
    }

    // 更新冷却
    this._updateCooldowns(effectiveDelta);

    // 累积行动槽
    this._accumulateGauges(effectiveDelta);

    // 处理行动
    this._actionsThisFrame = 0;
    while (this._actionsThisFrame < MAX_ACTIONS_PER_FRAME) {
      const nextUnitId = this._getNextActingUnit();
      if (nextUnitId === null) break;

      this._processUnitAction(nextUnitId);
      this._actionsThisFrame++;

      // 每次行动后检查结束条件
      if (this._checkEndCondition()) {
        return; // _checkEndCondition 内部已发出 BATTLE_ENDED
      }
    }
  }

  // ===== 辅助 =====

  /** 设置战斗倍速（1 = 1x, 2 = 2x, 3 = 3x） */
  setSpeedMultiplier(multiplier: number): void {
    if (multiplier < 1) {
      this._speedMultiplier = 1;
    } else if (multiplier > 3) {
      this._speedMultiplier = 3;
    } else {
      this._speedMultiplier = multiplier;
    }
  }

  /** 获取当前战斗数据（只读） */
  getBattleData(): Readonly<BattleData> | null {
    return this._battleData;
  }

  /** 获取当前战斗状态 */
  getBattleState(): BattleState {
    return this._battleData?.battleState ?? BattleState.Ready;
  }

  // ================================================================
  // 内部 — 初始化
  // ================================================================

  /** 清空所有内部追踪 Map 和列表 */
  private _resetInternalState(): void {
    this._actionGauges.clear();
    this._cooldowns.clear();
    this._energy.clear();
    // skillConfigMap / battleConfig 不清空 — 由 injectConfig 覆盖，保证跨场战斗复用
    this._killedEnemyIds = [];
    this._roundCount = 0;
    this._actedThisRound.clear();
    this._actionsThisFrame = 0;
    this._timeoutReached = false;
  }

  // ================================================================
  // 内部 — update 子步骤
  // ================================================================

  /** 检查是否超时 */
  private _isTimeout(): boolean {
    if (!this._battleConfig || !this._battleData) return false;
    return (
      this._battleData.elapsedTimeMs >=
      this._battleConfig.maxBattleDurationMs
    );
  }

  /** 超时处理 → 强制判负，标记为 Timeout */
  private _handleTimeout(): void {
    if (!this._battleData) return;
    this._timeoutReached = true;
    this._battleData.battleState = BattleState.Defeat;
    this._emitBattleEnded();
  }

  /** 更新所有存活单位的技能冷却 */
  private _updateCooldowns(effectiveDelta: number): void {
    if (!this._battleData) return;

    const allUnits = [
      ...this._battleData.playerUnits,
      ...this._battleData.enemyUnits,
    ];
    for (const unit of allUnits) {
      if (!unit.isAlive) continue;

      const current = this._cooldowns.get(unit.unitId) ?? 0;
      if (current > 0) {
        this._cooldowns.set(
          unit.unitId,
          Math.max(0, current - effectiveDelta),
        );
      }
    }
  }

  /** 累积所有存活单位的行动槽 */
  private _accumulateGauges(effectiveDelta: number): void {
    if (!this._battleData) return;

    const allUnits = [
      ...this._battleData.playerUnits,
      ...this._battleData.enemyUnits,
    ];
    for (const unit of allUnits) {
      if (!unit.isAlive) continue;

      const current = this._actionGauges.get(unit.unitId) ?? 0;
      this._actionGauges.set(
        unit.unitId,
        current + unit.speed * effectiveDelta,
      );
    }
  }

  /**
   * 获取下一个应行动的单位
   *
   * 规则：从所有存活单位中选出行动槽 ≥ ACTION_THRESHOLD 且槽值最高者。
   * 同值时按 unitId 字母序保证确定性。
   *
   * @returns unitId | null (无就绪单位)
   */
  private _getNextActingUnit(): string | null {
    if (!this._battleData) return null;

    const allUnits = [
      ...this._battleData.playerUnits,
      ...this._battleData.enemyUnits,
    ];

    let bestUnitId: string | null = null;
    let bestGauge = ACTION_THRESHOLD - 1; // 只有 ≥ THRESHOLD 才有效

    for (const unit of allUnits) {
      if (!unit.isAlive) continue;

      const gauge = this._actionGauges.get(unit.unitId) ?? 0;
      if (gauge < ACTION_THRESHOLD) continue;

      if (gauge > bestGauge) {
        bestGauge = gauge;
        bestUnitId = unit.unitId;
      } else if (gauge === bestGauge && bestUnitId !== null) {
        if (unit.unitId < bestUnitId) {
          bestUnitId = unit.unitId;
        }
      }
    }

    return bestUnitId;
  }

  // ================================================================
  // 内部 — 单位行动处理
  // ================================================================

  /**
   * 处理一个单位的完整行动流程
   *
   * 1. 查找 BattleUnit
   * 2. 扣除行动槽（保留溢出）
   * 3. 选择目标
   * 4. 选择技能
   * 5. 通过 DamageCalculator 计算伤害
   * 6. 应用伤害
   * 7. 管理能量 & 冷却
   * 8. 发出事件
   * 9. 检测目标死亡
   */
  private _processUnitAction(unitId: string): void {
    const unit = this._findUnit(unitId);
    if (!unit || !unit.isAlive) return;

    // 扣除行动槽（保留溢出部分）
    const currentGauge = this._actionGauges.get(unitId) ?? 0;
    this._actionGauges.set(unitId, currentGauge - ACTION_THRESHOLD);

    // 回合检测
    this._trackRound(unitId);

    // 选择目标
    const target = this._selectTarget(unit);
    if (!target) return; // 无目标可攻击

    // 选择技能
    const skillChoice = this._selectSkill(unit);

    // 构造 DamageInput
    const damageInput = this._buildDamageInput(
      unit,
      target,
      skillChoice.multiplier,
    );

    // 调用 DamageCalculator
    const result = DamageCalculator.calculate(damageInput);

    // 应用伤害
    target.currentHp = Math.max(0, target.currentHp - result.damage);

    // 能量管理
    this._updateEnergy(unit, skillChoice.isActiveSkill);

    // 冷却管理
    if (skillChoice.isActiveSkill && skillChoice.cooldownMs > 0) {
      this._cooldowns.set(unit.unitId, skillChoice.cooldownMs);
    }

    // 发出 UNIT_DAMAGED
    this._eventManager.emit(BattleEvent.UNIT_DAMAGED, {
      sourceUnitId: unit.unitId,
      targetUnitId: target.unitId,
      damage: result.damage,
      isCritical: result.isCritical,
      remainingHp: target.currentHp,
      targetMaxHp: target.maxHp,
    } satisfies UnitDamagedEvent);

    // 检测目标死亡
    if (target.currentHp <= 0) {
      target.isAlive = false;

      // 记录击杀
      if (
        target.unitType === BattleUnitType.Enemy ||
        target.unitType === BattleUnitType.Boss
      ) {
        this._killedEnemyIds.push(target.configId);
      }

      this._eventManager.emit(BattleEvent.UNIT_DIED, {
        unitId: target.unitId,
        unitType: target.unitType,
        position: { ...target.position },
      } satisfies UnitDiedEvent);
    }
  }

  /** 按 unitId 查找 BattleUnit */
  private _findUnit(unitId: string): BattleUnit | undefined {
    if (!this._battleData) return undefined;
    return (
      this._battleData.playerUnits.find((u) => u.unitId === unitId) ??
      this._battleData.enemyUnits.find((u) => u.unitId === unitId)
    );
  }

  /** 回合检测：追踪已行动单位，所有存活单位都行动过一轮则 round++ */
  private _trackRound(unitId: string): void {
    if (!this._battleData) return;

    this._actedThisRound.add(unitId);

    const allAlive = [
      ...this._battleData.playerUnits,
      ...this._battleData.enemyUnits,
    ].filter((u) => u.isAlive);

    const allActed = allAlive.every((u) =>
      this._actedThisRound.has(u.unitId),
    );

    if (allActed && allAlive.length > 0) {
      this._roundCount++;
      this._battleData.round = this._roundCount;
      this._actedThisRound.clear();
    }
  }

  // ================================================================
  // 内部 — 目标选择
  // ================================================================

  /**
   * 为攻击方选择目标
   *
   * 规则：
   *   - 选择对立方的存活单位
   *   - 前排 (row=0) 优先
   *   - 同排选当前 HP 最低者（集火残血）
   *   - 前排全灭才选后排
   *
   * @param attacker — 攻击方
   * @returns 目标 BattleUnit | null
   */
  private _selectTarget(attacker: BattleUnit): BattleUnit | null {
    if (!this._battleData) return null;

    const isPlayerUnit =
      attacker.unitType === BattleUnitType.Hero;
    const opponents = isPlayerUnit
      ? this._battleData.enemyUnits
      : this._battleData.playerUnits;

    const aliveOpponents = opponents.filter((u) => u.isAlive);
    if (aliveOpponents.length === 0) return null;

    // 前排 (row=0)
    const frontRow = aliveOpponents.filter((u) => u.position.row === 0);
    if (frontRow.length > 0) {
      return this._pickLowestHp(frontRow);
    }

    // 后排 (row=1)
    return this._pickLowestHp(aliveOpponents);
  }

  /** 从候选单位中选出 currentHp 最低者（相同时选 unitId 字母序最小） */
  private _pickLowestHp(candidates: BattleUnit[]): BattleUnit {
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const u = candidates[i];
      if (u.currentHp < best.currentHp) {
        best = u;
      } else if (
        u.currentHp === best.currentHp &&
        u.unitId < best.unitId
      ) {
        best = u;
      }
    }
    return best;
  }

  // ================================================================
  // 内部 — 技能选择
  // ================================================================

  /**
   * 技能选择（对齐 04-combat-system.md）
   *
   * - 普攻：自动释放，稳定输出，积累能量
   * - 主动技能：能量满后释放，主要输出来源
   * - MVP 阶段不做被动技能 / 终极技能
   */
  private _selectSkill(unit: BattleUnit): SkillChoice {
    const energy = this._energy.get(unit.unitId) ?? 0;
    const maxEnergy = this._battleConfig?.maxEnergy ?? 100;
    const isOnCooldown = (this._cooldowns.get(unit.unitId) ?? 0) > 0;

    // 条件：能量满 + 不在冷却 + 存在主动技能
    if (energy >= maxEnergy && !isOnCooldown) {
      const activeSkill = this._findActiveSkill(unit.skillIds);
      if (activeSkill) {
        return {
          multiplier: activeSkill.powerMultiplier,
          isActiveSkill: true,
          cooldownMs: activeSkill.cooldownMs,
          skillId: activeSkill.id,
        };
      }
    }

    // 默认普攻
    const normalAttack = this._findNormalAttack(unit.skillIds);
    return {
      multiplier: normalAttack?.powerMultiplier ?? FALLBACK_ATTACK_MULTIPLIER,
      isActiveSkill: false,
      cooldownMs: 0,
      skillId: normalAttack?.id ?? '',
    };
  }

  /** 从技能列表中找第一个 '普攻' 类型技能 */
  private _findNormalAttack(skillIds: string[]): SkillConfig | null {
    for (const id of skillIds) {
      const cfg = this._skillConfigMap.get(id);
      if (cfg && cfg.type === '普攻') return cfg;
    }
    return null;
  }

  /** 从技能列表中找第一个 '主动' 类型技能 */
  private _findActiveSkill(skillIds: string[]): SkillConfig | null {
    for (const id of skillIds) {
      const cfg = this._skillConfigMap.get(id);
      if (cfg && cfg.type === '主动') return cfg;
    }
    return null;
  }

  /** 更新单位能量 — 普攻 +energy, 主动技能 energy=0 */
  private _updateEnergy(unit: BattleUnit, isActiveSkill: boolean): void {
    const current = this._energy.get(unit.unitId) ?? 0;
    if (isActiveSkill) {
      this._energy.set(unit.unitId, 0);
    } else {
      const perAttack =
        this._battleConfig?.defaultEnergyPerAttack ?? 20;
      const maxEnergy = this._battleConfig?.maxEnergy ?? 100;
      this._energy.set(unit.unitId, Math.min(current + perAttack, maxEnergy));
    }
  }

  // ================================================================
  // 内部 — DamageInput 构造
  // ================================================================

  /**
   * 从攻击方 / 受击方 / 技能倍率 构造 DamageCalculator 输入
   *
   * MVP 阶段简化：
   *   - 暴击率使用 GlobalBattleEntry.defaultCritRate（后续角色会覆盖）
   *   - 暴击倍率使用 GlobalBattleEntry.criticalDamageMultiplier
   *   - 增伤 / 减伤系数为 0（无 Buff 系统）
   */
  private _buildDamageInput(
    attacker: BattleUnit,
    target: BattleUnit,
    skillMultiplier: number,
  ): DamageInput {
    const battleCfg = this._battleConfig;

    return {
      sourceUnitId: attacker.unitId,
      sourceAttack: attacker.attack,
      sourceFaction: attacker.faction,
      sourceCritRate: battleCfg?.defaultCritRate ?? 0.05,
      sourceCritDamage: battleCfg?.criticalDamageMultiplier ?? 1.5,
      sourceDamageBonus: 0, // 暂无 Buff 系统
      targetUnitId: target.unitId,
      targetFaction: target.faction,
      targetDefense: target.defense,
      targetDamageReduction: 0, // 暂无 Buff 系统
      skillMultiplier,
    };
  }

  // ================================================================
  // 内部 — 结束判定 & 结算
  // ================================================================

  /**
   * 检查战斗是否应结束
   *
   * @returns true = 已结束（内部已发事件）
   */
  private _checkEndCondition(): boolean {
    if (!this._battleData) return true;

    const alivePlayerCount = this._countAlive(this._battleData.playerUnits);
    const aliveEnemyCount = this._countAlive(this._battleData.enemyUnits);

    if (alivePlayerCount === 0) {
      this._battleData.battleState = BattleState.Defeat;
      this._emitBattleEnded();
      return true;
    }

    if (aliveEnemyCount === 0) {
      this._battleData.battleState = BattleState.Victory;
      this._emitBattleEnded();
      return true;
    }

    return false;
  }

  /** 计算存活单位数量 */
  private _countAlive(units: BattleUnit[]): number {
    let count = 0;
    for (const u of units) {
      if (u.isAlive) count++;
    }
    return count;
  }

  /**
   * 构造 BattleExecutionResult 并通过 EventManager 发出 BATTLE_ENDED
   *
   * BattleSystem 只返回战斗执行数据（不含奖励）。
   * BattleManager 收到后负责从 DropConfig 组装最终 BattleResult。
   */
  private _emitBattleEnded(): void {
    if (!this._battleData) return;

    // 确定终局类型
    let resultType: BattleResultType;
    if (this._battleData.battleState === BattleState.Victory) {
      resultType = BattleResultType.Victory;
    } else if (this._timeoutReached) {
      resultType = BattleResultType.Timeout;
    } else {
      resultType = BattleResultType.Defeat;
    }

    const reportedRound =
      this._battleData.elapsedTimeMs > 0
        ? Math.max(1, this._battleData.round)
        : this._battleData.round;

    const executionResult: BattleExecutionResult = {
      stageId: this._battleData.stageId,
      resultType,
      elapsedTimeMs: Math.round(this._battleData.elapsedTimeMs),
      round: reportedRound,
      killedEnemyIds: [...this._killedEnemyIds],
    };

    this._eventManager.emit(BattleEvent.BATTLE_ENDED, {
      executionResult,
    } satisfies BattleEndedEvent);
  }
}

// ==================== 内部类型 ====================

/**
 * 技能选择结果（内部使用）
 */
interface SkillChoice {
  /** 技能倍率（普攻或主动技能的 powerMultiplier） */
  multiplier: number;
  /** 是否为主动技能（影响能量管理） */
  isActiveSkill: boolean;
  /** 冷却时间（毫秒，普攻为 0） */
  cooldownMs: number;
  /** 技能 ID（调试用） */
  skillId: string;
}
