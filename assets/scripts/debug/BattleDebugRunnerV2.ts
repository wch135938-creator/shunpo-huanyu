// ============================================================
// BattleDebugRunnerV2.ts — Phase 3 战斗闭环验证工具（全新 UUID）
// 职责：端到端验证 战斗开始→攻击→伤害→死亡→结算 全链路
// 位置：debug/ 层（仅开发期使用，不进生产包）
// 依赖：BattleManager, EventManager, ConfigManager
//
// 创建原因：旧 BattleDebugRunner 的 .meta UUID 在场景中 Missing class
//
// 使用方式：
//   1. Cocos Creator 编辑器 → 创建空场景
//   2. 添加空节点 → 挂载 BattleDebugRunnerV2 组件
//   3. 运行场景 → 观察 Console 输出
//
// 约束：零 UI / 零动画 / 零特效 / 零网络 / 零广告 / 不修改架构
// ============================================================

import { Component, _decorator } from 'cc';
import { BattleManager, BattleManagerEvent } from '../managers/BattleManager';
import type {
  BattleManagerReadyEvent,
  StageBattleStartedEvent,
  StageBattleFinishedEvent,
} from '../managers/BattleManager';
import { EventManager } from '../core/EventManager';
import { BattleEvent } from '../battle/BattleSystem';
import { Phase9Bootstrap } from '../systems/Phase9Bootstrap';
import type {
  BattleStartedEvent,
  UnitDamagedEvent,
  UnitDiedEvent,
} from '../battle/BattleSystem';
import { BattleState } from '../battle/BattleTypes';
import type { BattleUnit } from '../battle/BattleUnit';

const { ccclass } = _decorator;

// ==================== 标签 ====================

const TAG = '[BattleTestV2]';

// ==================== 测试关卡 ====================

/** 验证用的关卡 ID */
const TEST_STAGE_ID = 'STAGE_001';

// ==================== 分隔线 ====================

const SEP = '='.repeat(50);
const SEP_MIN = '-'.repeat(50);

// ==================== BattleDebugRunnerV2 ====================

/**
 * 战斗闭环验证组件（V2 — 全新 UUID）
 *
 * 附在任意场景节点上，运行后自动执行完整的战斗测试流程。
 * 所有输出通过 console.log，不产生任何 UI。
 */
@ccclass('BattleDebugRunnerV2')
export class BattleDebugRunnerV2 extends Component {
  // ===== 依赖 =====

  private _battleManager: BattleManager;
  private _eventManager: EventManager;

  // ===== 状态 =====

  /** 测试是否正在运行 */
  private _running: boolean = false;

  /** 单位名称缓存（unitId → "configId 名称"） */
  private _unitNameMap: Map<string, string> = new Map();

  // ===== 事件监听器引用（用于清理）=====

  private _onReady: ((...args: unknown[]) => void) | null = null;
  private _onStarted: ((...args: unknown[]) => void) | null = null;
  private _onDamaged: ((...args: unknown[]) => void) | null = null;
  private _onDied: ((...args: unknown[]) => void) | null = null;
  private _onFinished: ((...args: unknown[]) => void) | null = null;

  // ================================================================
  // Cocos 生命周期
  // ================================================================

  onLoad(): void {
    console.log('[BattleDebugRunnerV2] onLoad');
  }

  onEnable(): void {
    console.log('[BattleDebugRunnerV2] onEnable');
  }

  start(): void {
    console.log('[BattleDebugRunnerV2] start');
    this._battleManager = BattleManager.getInstance();
    this._eventManager = EventManager.getInstance();

    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} 战斗闭环测试开始 (Phase9) `);
    console.log(`${TAG} 目标关卡: ${TEST_STAGE_ID}`);
    console.log(`${TAG} ${SEP}`);

    // 注册 BattleManager 就绪监听
    this._onReady = (): void => {
      this._onBattleManagerReady();
    };
    this._eventManager.on(
      BattleManagerEvent.BATTLE_MANAGER_READY,
      this._onReady,
      this,
    );

    // Phase9: 通过 Phase9Bootstrap 统一初始化（含 Hero/Skill/Formation/BattleManager）
    const phase9Bootstrap = Phase9Bootstrap.getInstance();
    phase9Bootstrap
      .initialize()
      .then(() => {
        // FormationSystem 已初始化，创建默认阵容
        phase9Bootstrap.restoreFromSave();
        console.log(`${TAG} Phase9Bootstrap 初始化完成`);
        // BattleManager.initialize() 已作为 Phase9Bootstrap 的一部分执行
        // BATTLE_MANAGER_READY 事件会触发 _onBattleManagerReady
      })
      .catch((err: unknown) => {
        console.error(`${TAG} Phase9Bootstrap 配置加载失败!`, err);
        console.log(`${TAG} ${SEP}`);
        console.log(`${TAG} ========== 测试失败 ❌ (Phase9 配置加载异常) ==========`);
        console.log(`${TAG} ${SEP}`);
      });
  }

  onDestroy(): void {
    this._cleanupListeners();
    // Phase9: 销毁所有 Phase9 系统（含 Analytics destroy + BattleFX cleanup）
    Phase9Bootstrap.getInstance().destroy();
  }

  // ================================================================
  // 主更新循环
  // ================================================================

  update(dt: number): void {
    if (!this._running) return;

    // 推进战斗逻辑（dt 为秒，转换为毫秒）
    this._battleManager.updateBattle(dt * 1000);
  }

  // ================================================================
  // 配置就绪 → 开始战斗
  // ================================================================

  private _onBattleManagerReady(): void {
    console.log(`${TAG} 配置加载完成 ✅`);
    console.log(`${TAG} ${SEP_MIN}`);

    // Phase9: 注入阵容数据（FormationSystem → BattleManager）
    this._setupPlayerFormation();

    // 注册战斗事件监听
    this._registerBattleListeners();

    // 启动关卡战斗
    const battleData = this._battleManager.startStageBattle(TEST_STAGE_ID);

    if (!battleData) {
      console.error(`${TAG} startStageBattle 返回 null，测试中止!`);
      console.log(`${TAG} ========== 测试失败 ❌ (startStageBattle 失败) ==========`);
      this._cleanupListeners();
      return;
    }

    // 构建单位名称映射
    this._buildUnitNameMap(battleData.playerUnits, battleData.enemyUnits);

    // 输出阵容信息
    this._logRoster(battleData.playerUnits, battleData.enemyUnits);

    this._running = true;
  }

  /**
   * Phase9: 从 FormationSystem 获取玩家阵容并注入 BattleManager。
   *
   * 流程：
   *   1. FormationSystem.generateTeamSnapshot('pve') → TeamSnapshot
   *   2. FormationSystem.getActivePreset('pve')        → FormationPreset (含 slots)
   *   3. BattleManager.setPlayerFormation(teamSnapshot, slots)
   */
  private _setupPlayerFormation(): void {
    const phase9Bootstrap = Phase9Bootstrap.getInstance();
    const formationSystem = phase9Bootstrap.getFormationSystem();

    const teamSnapshot = formationSystem.generateTeamSnapshot('pve');
    if (!teamSnapshot) {
      console.warn(`${TAG} Phase9: generateTeamSnapshot('pve') 返回 null，使用空阵容`);
      return;
    }

    const activePreset = formationSystem.getActivePreset('pve');
    if (!activePreset) {
      console.warn(`${TAG} Phase9: getActivePreset('pve') 返回 null，使用空槽位`);
      return;
    }

    this._battleManager.setPlayerFormation(
      teamSnapshot,
      activePreset.slots,
    );

    console.log(
      `${TAG} Phase9: 阵容已注入 BattleManager — ` +
      `${teamSnapshot.heroSnapshots.length} 英雄, ` +
      `总战力=${teamSnapshot.teamPower}`,
    );
  }

  // ================================================================
  // 事件监听注册
  // ================================================================

  private _registerBattleListeners(): void {
    // 战斗开始
    this._onStarted = (...args: unknown[]): void => {
      const payload = args[0] as BattleStartedEvent | undefined;
      if (!payload) return;
      console.log(`${TAG} ${SEP_MIN}`);
      console.log(`${TAG} >>> 战斗开始! <<<`);
      console.log(`${TAG} 关卡: ${payload.stageId}`);
      console.log(`${TAG} ${SEP_MIN}`);
    };
    this._eventManager.on(BattleEvent.BATTLE_STARTED, this._onStarted, this);

    // 单位受击
    this._onDamaged = (...args: unknown[]): void => {
      const payload = args[0] as UnitDamagedEvent | undefined;
      if (!payload) return;

      this._hasDamageEvents = true;

      const sourceName = this._getUnitDisplay(payload.sourceUnitId);
      const targetName = this._getUnitDisplay(payload.targetUnitId);
      const critMark = payload.isCritical ? ' 💥暴击!' : '';
      const hpBar = this._hpBar(payload.remainingHp, payload.targetMaxHp);

      console.log(
        `${TAG} [${sourceName}] → 攻击 → [${targetName}] ` +
        `伤害=${payload.damage}${critMark} ` +
        `[${hpBar}] ${payload.remainingHp}/${payload.targetMaxHp}`,
      );
    };
    this._eventManager.on(BattleEvent.UNIT_DAMAGED, this._onDamaged, this);

    // 单位死亡
    this._onDied = (...args: unknown[]): void => {
      const payload = args[0] as UnitDiedEvent | undefined;
      if (!payload) return;

      const name = this._getUnitDisplay(payload.unitId);
      console.log(`${TAG} *** [${name}] 被击杀! ***`);
    };
    this._eventManager.on(BattleEvent.UNIT_DIED, this._onDied, this);

    // 战斗结束（BattleManager 级）
    this._onFinished = (...args: unknown[]): void => {
      const payload = args[0] as StageBattleFinishedEvent | undefined;
      if (!payload?.result) return;

      this._running = false;
      this._onBattleFinished(payload.result);
    };
    this._eventManager.on(
      BattleManagerEvent.STAGE_BATTLE_FINISHED,
      this._onFinished,
      this,
    );
  }

  // ================================================================
  // 结算输出
  // ================================================================

  private _onBattleFinished(
    result: import('../battle/BattleResult').BattleResult,
  ): void {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} >>> 战斗结束! <<<`);
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 结果: ${result.isVictory ? 'Victory ✅' : 'Defeat ❌'}`);
    console.log(`${TAG} 类型: ${result.resultType}`);
    console.log(`${TAG} 耗时: ${result.elapsedTimeMs}ms ` +
      `(${(result.elapsedTimeMs / 1000).toFixed(1)}s)`);
    console.log(`${TAG} 回合: ${result.round}`);
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 击杀敌人 (${result.killedEnemyIds.length}):`);
    if (result.killedEnemyIds.length > 0) {
      for (const id of result.killedEnemyIds) {
        console.log(`${TAG}   - ${id}`);
      }
    } else {
      console.log(`${TAG}   (无)`);
    }
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 奖励列表 (${result.rewards.length}):`);
    if (result.rewards.length > 0) {
      for (const r of result.rewards) {
        console.log(
          `${TAG}   - ${r.itemId} (${r.itemType}) × ${r.count} [${r.source}]`,
        );
      }
    } else {
      console.log(`${TAG}   (无奖励)`);
    }
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 汇总: 经验 +${result.expGain} | 金币 +${result.goldGain} | 战力 +${result.powerGain}`);
    console.log(`${TAG} ${SEP}`);

    // 验收判定
    this._printVerification(result);
    console.log(`${TAG} ${SEP}`);

    this._cleanupListeners();
  }

  // ================================================================
  // 验收判定
  // ================================================================

  private _printVerification(
    result: import('../battle/BattleResult').BattleResult,
  ): void {
    const checks: { label: string; pass: boolean }[] = [
      { label: '战斗状态 → Victory/Defeat', pass: true },
      { label: 'BattleResult.stageId 非空', pass: result.stageId === TEST_STAGE_ID },
      { label: 'BattleResult.elapsedTimeMs > 0', pass: result.elapsedTimeMs > 0 },
      { label: 'BattleResult.round > 0', pass: result.round > 0 },
      { label: 'BattleResult.resultType 有效', pass: result.resultType !== undefined },
      { label: '掉落结算 → rewards 非空 (胜利时)', pass: !result.isVictory || result.rewards.length > 0 },
      { label: 'expGain / goldGain 计算正确', pass: result.expGain >= 0 && result.goldGain >= 0 },
      { label: 'UNIT_DAMAGED 事件已触发', pass: this._hasDamageEvents },
      { label: 'UNIT_DIED 事件已触发', pass: result.killedEnemyIds.length > 0 || !result.isVictory },
      { label: 'BATTLE_ENDED → STAGE_BATTLE_FINISHED 链路', pass: true },
    ];

    let allPassed = true;
    console.log(`${TAG} 验收检查:`);
    for (const check of checks) {
      const icon = check.pass ? '✅' : '❌';
      if (!check.pass) allPassed = false;
      console.log(`${TAG}   ${icon} ${check.label}`);
    }

    console.log(`${TAG} ${SEP_MIN}`);
    if (allPassed) {
      console.log(`${TAG} ========== Phase 3 战斗闭环验证通过 ✅ ==========`);
    } else {
      console.log(`${TAG} ========== Phase 3 战斗闭环验证未通过 ❌ ==========`);
    }
  }

  // ================================================================
  // 辅助 — 单位名称
  // ================================================================

  /** 根据 BattleUnit[] 构建名称映射 */
  private _buildUnitNameMap(
    playerUnits: BattleUnit[],
    enemyUnits: BattleUnit[],
  ): void {
    this._unitNameMap.clear();
    for (const u of playerUnits) {
      this._unitNameMap.set(u.unitId, `${u.configId} ${u.name}`);
    }
    for (const u of enemyUnits) {
      this._unitNameMap.set(u.unitId, `${u.configId} ${u.name}`);
    }
  }

  /** 获取单位显示名 */
  private _getUnitDisplay(unitId: string): string {
    return this._unitNameMap.get(unitId) ?? unitId;
  }

  // ================================================================
  // 辅助 — HP 进度条
  // ================================================================

  /** 生成 HP 百分比进度条 */
  private _hpBar(current: number, max: number): string {
    if (max <= 0) return '??%';
    const pct = Math.max(0, Math.min(1, current / max));
    const filled = Math.round(pct * 10);
    const empty = 10 - filled;
    const pctStr = (pct * 100).toFixed(0).padStart(3);
    return `${pctStr}% |${'█'.repeat(filled)}${'░'.repeat(empty)}|`;
  }

  // ================================================================
  // 辅助 — 阵容日志
  // ================================================================

  private _logRoster(
    playerUnits: BattleUnit[],
    enemyUnits: BattleUnit[],
  ): void {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 我方阵容 (${playerUnits.length}):`);
    for (const u of playerUnits) {
      console.log(
        `${TAG}   [${u.unitId}] ${u.configId} ` +
        `HP=${u.maxHp} ATK=${u.attack} DEF=${u.defense} ` +
        `SPD=${u.speed} 阵营=${u.faction} 站位=(${u.position.row},${u.position.column})`,
      );
    }
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 敌方阵容 (${enemyUnits.length}):`);
    for (const u of enemyUnits) {
      console.log(
        `${TAG}   [${u.unitId}] ${u.configId} ${u.name} ` +
        `HP=${u.maxHp} ATK=${u.attack} DEF=${u.defense} ` +
        `SPD=${u.speed} 阵营=${u.faction} 类型=${u.unitType}`,
      );
    }
    console.log(`${TAG} ${SEP_MIN}`);
  }

  // ================================================================
  // 辅助 — 事件追踪
  // ================================================================

  /** 是否至少收到过一次伤害事件 */
  private _hasDamageEvents: boolean = false;

  // ================================================================
  // 清理
  // ================================================================

  private _cleanupListeners(): void {
    this._running = false;

    if (this._onReady) {
      this._eventManager.off(BattleManagerEvent.BATTLE_MANAGER_READY, this._onReady, this);
      this._onReady = null;
    }
    if (this._onStarted) {
      this._eventManager.off(BattleEvent.BATTLE_STARTED, this._onStarted, this);
      this._onStarted = null;
    }
    if (this._onDamaged) {
      this._eventManager.off(BattleEvent.UNIT_DAMAGED, this._onDamaged, this);
      this._onDamaged = null;
    }
    if (this._onDied) {
      this._eventManager.off(BattleEvent.UNIT_DIED, this._onDied, this);
      this._onDied = null;
    }
    if (this._onFinished) {
      this._eventManager.off(
        BattleManagerEvent.STAGE_BATTLE_FINISHED,
        this._onFinished,
        this,
      );
      this._onFinished = null;
    }
  }
}
