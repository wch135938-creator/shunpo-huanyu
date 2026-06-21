// ============================================================
// BattleFXManager.ts — 战斗表现层总管理器
// 职责：监听战斗事件 → 驱动飘字/特效/动画
// 位置：battlefx/ 层
// 依赖：EventManager, BattleSystem (事件常量), DamageTextPool, BattleAnimation
// 规范：零 any / 不修改 BattleSystem / 纯表现层 / 事件驱动
// ============================================================

import { Node, Vec3 } from 'cc';
import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { BattleEvent } from '../battle/BattleSystem';
import type {
  UnitDamagedEvent,
  UnitDiedEvent,
  BattleStartedEvent,
  BattleEndedEvent,
} from '../battle/BattleSystem';
import { BattleUnitType } from '../battle/BattleTypes';
import { DamageTextPool } from './DamageTextPool';
import { BattleFXPool } from './BattleFXPool';
import { BattleAnimation } from './BattleAnimation';
import {
  DamageTextType,
  BattleFXType,
  DEFAULT_PRESENTATION_CONFIG,
} from './PresentationTypes';
import type {
  BattlePresentationConfig,
  DamageTextConfig,
  BattleFXConfig,
  DamageTextSpawnRequest,
} from './PresentationTypes';

/**
 * 单位节点注册条目
 */
interface UnitNodeEntry {
  unitId: string;
  node: Node;
  unitType: BattleUnitType;
}

/**
 * 战斗表现层管理器
 *
 * 单例（BaseManager）。
 * 监听 BattleSystem 发出的战斗事件，驱动视觉表现。
 *
 * 架构原则：
 *   - 只读 BattleSystem 事件，不反向调用 BattleSystem 任何方法
 *   - 所有视觉节点由 BattleFXManager 独立管理
 *   - 通过 registerUnitNode / unregisterUnitNode 关联 unitId ↔ Node
 *
 * 使用方式：
 *   const fxMgr = BattleFXManager.getInstance();
 *   fxMgr.init(config);
 *   fxMgr.registerUnitNode('p_0', heroNode, BattleUnitType.Hero);
 *   fxMgr.startListening(); // 开始监听战斗事件
 *   // ... 战斗进行中 ...
 *   fxMgr.stopListening();  // 停止监听
 *   fxMgr.cleanup();        // 清理所有资源
 */
export class BattleFXManager extends BaseManager {
  // ===== 单例 =====

  static getInstance(): BattleFXManager {
    return super.getInstance<BattleFXManager>();
  }

  // ===== 配置 =====

  private _config: BattlePresentationConfig;
  private _initialized: boolean = false;

  // ===== 对象池 =====

  private _damageTextPool: DamageTextPool;
  private _fxPool: BattleFXPool | null = null;

  // ===== 事件相关 =====

  private _eventManager: EventManager;
  private _listening: boolean = false;

  // ===== 单位节点映射 =====

  /** unitId → Node 映射 */
  private _unitNodes: Map<string, UnitNodeEntry> = new Map();

  /** 战斗场景根节点（Canvas 或战斗层） */
  private _battleRoot: Node | null = null;

  // ===== 回调绑定（用于 off） =====

  private _boundOnUnitDamaged: (payload: UnitDamagedEvent) => void;
  private _boundOnUnitDied: (payload: UnitDiedEvent) => void;
  private _boundOnBattleEnded: (payload: BattleEndedEvent) => void;

  // ===== 构造 =====

  constructor() {
    super();

    this._config = { ...DEFAULT_PRESENTATION_CONFIG };
    this._eventManager = EventManager.getInstance();

    // 创建 DamageText 专用池
    this._damageTextPool = new DamageTextPool(
      this._config.poolCapacity,
    );
    this._damageTextPool.setConfig(this._config.damageText);

    // 绑定回调（保证 this 上下文正确，且支持 off）
    this._boundOnUnitDamaged = this._onUnitDamaged.bind(this);
    this._boundOnUnitDied = this._onUnitDied.bind(this);
    this._boundOnBattleEnded = this._onBattleEnded.bind(this);
  }

  // ==================== 初始化 / 清理 ====================

  /**
   * 初始化表现层管理器
   *
   * @param config    — 表现配置（可选，不传使用默认值）
   * @param battleRoot — 战斗场景根节点
   */
  init(
    config?: BattlePresentationConfig,
    battleRoot?: Node,
  ): void {
    if (config) {
      this._config = { ...config };
      this._damageTextPool.setConfig(this._config.damageText);
    }

    if (battleRoot) {
      this._battleRoot = battleRoot;
    }

    this._initialized = true;
  }

  /**
   * 完全清理所有资源
   */
  cleanup(): void {
    this.stopListening();
    this._unitNodes.clear();
    this._damageTextPool.clear();
    if (this._fxPool) {
      this._fxPool.clear();
      this._fxPool = null;
    }
    this._battleRoot = null;
    this._initialized = false;
  }

  // ==================== 单位节点注册 ====================

  /**
   * 注册单位场景节点
   *
   * BattleFXManager 通过此映射找到对应的 Node 来执行动画/显示伤害。
   * 调用时机：BattleManager 在场景中创建/显示战斗单位后调用。
   *
   * @param unitId   — 单位运行时 ID（与 BattleUnit.unitId 一致）
   * @param node     — 单位对应的 Cocos 场景节点
   * @param unitType — 单位类型
   */
  registerUnitNode(
    unitId: string,
    node: Node,
    unitType: BattleUnitType,
  ): void {
    if (!unitId || !node) return;

    this._unitNodes.set(unitId, {
      unitId,
      node,
      unitType,
    });
  }

  /**
   * 注销单位场景节点
   *
   * 调用时机：单位死亡后移除节点时
   */
  unregisterUnitNode(unitId: string): void {
    this._unitNodes.delete(unitId);
  }

  /**
   * 根据 unitId 查找场景节点
   */
  getUnitNode(unitId: string): Node | null {
    const entry = this._unitNodes.get(unitId);
    return entry ? entry.node : null;
  }

  /**
   * 清空所有单位节点注册
   */
  clearUnitNodes(): void {
    this._unitNodes.clear();
  }

  // ==================== 事件监听控制 ====================

  /**
   * 开始监听战斗事件
   *
   * 调用时机：战斗开始前，由 BattleManager 调用。
   */
  startListening(): void {
    if (this._listening) return;
    if (!this._initialized) {
      console.warn('[BattleFXManager] startListening() 请先调用 init()');
      return;
    }

    this._eventManager.on(
      BattleEvent.UNIT_DAMAGED,
      this._boundOnUnitDamaged,
    );
    this._eventManager.on(
      BattleEvent.UNIT_DIED,
      this._boundOnUnitDied,
    );
    this._eventManager.on(
      BattleEvent.BATTLE_ENDED,
      this._boundOnBattleEnded,
    );

    this._listening = true;

    if (this._config.debugLog) {
      console.log('[BattleFXManager] 开始监听战斗事件');
    }
  }

  /**
   * 停止监听战斗事件
   *
   * 调用时机：战斗结束后，在 cleanup 前调用。
   */
  stopListening(): void {
    if (!this._listening) return;

    this._eventManager.off(
      BattleEvent.UNIT_DAMAGED,
      this._boundOnUnitDamaged,
    );
    this._eventManager.off(
      BattleEvent.UNIT_DIED,
      this._boundOnUnitDied,
    );
    this._eventManager.off(
      BattleEvent.BATTLE_ENDED,
      this._boundOnBattleEnded,
    );

    this._listening = false;

    if (this._config.debugLog) {
      console.log('[BattleFXManager] 停止监听战斗事件');
    }
  }

  // ==================== 手动触发（治疗 / 独立调用） ====================

  /**
   * 显示治疗飘字
   *
   * 因为 BattleSystem 当前未发出治疗事件，
   * 治疗飘字由调用方（如 Buff 系统 / 道具使用）手动触发。
   *
   * @param healAmount — 治疗量
   * @param targetUnitId — 受治疗的单位 ID
   */
  showHealText(healAmount: number, targetUnitId: string): void {
    const node = this._unitNodes.get(targetUnitId);
    if (!node) return;

    const worldPos = node.node.worldPosition.clone();

    this._damageTextPool.show(
      healAmount,
      DamageTextType.Heal,
      this._getDamageTextParent(),
      worldPos,
      this._config.damageText,
    );
  }

  /**
   * 在指定世界坐标位置显示伤害飘字
   *
   * @param value      — 数值
   * @param type       — 飘字类型
   * @param worldPos   — 世界坐标
   */
  showDamageTextAt(
    value: number,
    type: DamageTextType,
    worldPos: Vec3,
  ): void {
    this._damageTextPool.show(
      value,
      type,
      this._getDamageTextParent(),
      worldPos,
      this._config.damageText,
    );
  }

  // ==================== 事件回调（内部） ====================

  /**
   * UNIT_DAMAGED 事件处理
   *
   * 驱动：
   *   1. 伤害飘字（普通/暴击）
   *   2. 受击动画
   *   3. 攻击动画（如果有 source 节点）
   *   4. 暴击特效
   */
  private _onUnitDamaged(payload: UnitDamagedEvent): void {
    const {
      sourceUnitId,
      targetUnitId,
      damage,
      isCritical,
    } = payload;

    const targetEntry = this._unitNodes.get(targetUnitId);
    const sourceEntry = this._unitNodes.get(sourceUnitId);

    // 1. 伤害飘字
    const textType = isCritical
      ? DamageTextType.Crit
      : DamageTextType.Damage;

    if (targetEntry) {
      const worldPos = targetEntry.node.worldPosition.clone();
      // 飘字在目标头顶偏移
      worldPos.y += 60;

      this._damageTextPool.show(
        damage,
        textType,
        this._getDamageTextParent(),
        worldPos,
        this._config.damageText,
      );
    }

    // 2 & 3. 动画（仅当两个节点都存在时）
    if (targetEntry && sourceEntry) {
      BattleAnimation.playAttackAndHit(
        sourceEntry.node,
        targetEntry.node,
        isCritical,
        this._config.battleFX,
      );
    } else if (targetEntry) {
      // 攻击方无节点时仍播放受击动画
      BattleAnimation.playHit(
        targetEntry.node,
        this._config.battleFX,
      );
    }
  }

  /**
   * UNIT_DIED 事件处理
   *
   * 驱动：死亡动画
   */
  private _onUnitDied(payload: UnitDiedEvent): void {
    const { unitId } = payload;
    const entry = this._unitNodes.get(unitId);
    if (!entry) return;

    // 播放死亡动画
    BattleAnimation.playDeath(
      entry.node,
      this._config.battleFX,
      () => {
        // 死亡动画完成后注销节点
        this.unregisterUnitNode(unitId);
      },
    );
  }

  /**
   * BATTLE_ENDED 事件处理
   *
   * 清理所有动画和监听。
   */
  private _onBattleEnded(_payload: BattleEndedEvent): void {
    // 停止所有已注册节点上的动画
    for (const [, entry] of this._unitNodes) {
      BattleAnimation.stopAll(entry.node);
    }

    this.stopListening();

    if (this._config.debugLog) {
      console.log('[BattleFXManager] 战斗结束，表现层清理完成');
    }
  }

  // ==================== 内部工具 ====================

  /**
   * 获取 DamageText 的父节点
   *
   * 优先使用 _battleRoot，fallback 到场景根。
   */
  private _getDamageTextParent(): Node {
    if (this._battleRoot && this._battleRoot.isValid) {
      return this._battleRoot;
    }
    // Fallback：使用第一个注册的单位节点的父节点
    const firstEntry = this._unitNodes.values().next().value;
    if (firstEntry && firstEntry.node.parent) {
      return firstEntry.node.parent;
    }
    // 最终 fallback：创建/返回一个空节点
    if (!this._battleRoot) {
      this._battleRoot = new Node('BattleFXRoot');
    }
    return this._battleRoot;
  }
}
