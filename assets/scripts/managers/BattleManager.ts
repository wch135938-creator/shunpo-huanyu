// ============================================================
// BattleManager.ts — 战斗系统统一管理入口
// 职责：配置加载 / BattleUnit 构建 / 阵容分配 / 委托 BattleSystem / 异常处理
// 位置：managers/ 层
// 依赖：ConfigManager, BattleSystem, EventManager, BaseManager
// 规范：零 any / 严格的 TypeScript 类型 / 所有数值走 config
//       禁止在 BattleManager 中实现伤害公式
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { ConfigManager } from '../core/ConfigManager';
import {
  BattleSystem,
  BattleEvent,
} from '../battle/BattleSystem';
import type {
  BattleSystemConfig,
  BattleEndedEvent,
} from '../battle/BattleSystem';
import type {
  BattleResult,
  BattleReward,
  BattleExecutionResult,
} from '../battle/BattleResult';
import { BattleResultType } from '../battle/BattleTypes';
import { BattleUnitType } from '../battle/BattleTypes';
import type { BattlePosition } from '../battle/BattleTypes';
import type { BattleData } from '../battle/BattleData';
import type { BattleUnit } from '../battle/BattleUnit';
import { BattleUnitFactory } from '../battle/BattleUnitFactory';
import type { HeroConfig, HeroListData } from '../config/hero_config';
import type { Faction } from '../config/hero_config';
import type { EnemyEntry, EnemyDataConfig, Element } from '../config/enemy_config';
import type { StageEntry, StageDataConfig } from '../config/stage_config';
import type { SkillConfig, SkillDataConfig } from '../config/skill_config';
import type { DropTableConfig, DropItem } from '../config/drop_config';
import type { GlobalBattleEntry, GlobalConstConfig } from '../config/global_config';
import type { TeamSnapshot, FormationSlot } from '../formation/FormationTypes';

// ==================== 事件名常量 ====================

/**
 * BattleManager 级事件名
 *
 * 与 BattleSystem 的 BattleEvent 形成两层事件体系：
 *   BattleManager 级 — 供 UI / 主流程消费
 *   BattleSystem 级 — 供 BattleManager 内部消费
 */
export const BattleManagerEvent = {
  /** BattleManager 初始化完成（配置加载完毕） */
  BATTLE_MANAGER_READY: 'battleManager:ready',
  /** 关卡战斗开始 */
  STAGE_BATTLE_STARTED: 'battleManager:stageBattleStarted',
  /** 关卡战斗结束（包装自 BATTLE_ENDED） */
  STAGE_BATTLE_FINISHED: 'battleManager:stageBattleFinished',
} as const;

// ==================== 事件载荷接口 ====================

/** BATTLE_MANAGER_READY 事件载荷 */
export interface BattleManagerReadyEvent {
  /** 已加载的配置数量 */
  configCount: number;
}

/** STAGE_BATTLE_STARTED 事件载荷 */
export interface StageBattleStartedEvent {
  stageId: string;
  /** 我方单位 configId 列表 */
  playerUnitIds: string[];
  /** 敌方单位 configId 列表 */
  enemyUnitIds: string[];
}

/** STAGE_BATTLE_FINISHED 事件载荷 */
export interface StageBattleFinishedEvent {
  result: BattleResult;
}

// ==================== 内部常量 ====================

/** 需要预加载的配置路径列表 */
const REQUIRED_CONFIG_PATHS: string[] = [
  'config/cards/hero_list',
  'config/stages/enemy_data',
  'config/stages/stage_data',
  'config/skills/skill_data',
  'config/drops/drop_table',
  'config/systems/global_const',
];

/** 阵型槽位定义 */
interface SlotDef {
  row: number;
  column: number;
  index: number;
}

/** 前排槽位（2 个） */
const FRONT_SLOTS: ReadonlyArray<SlotDef> = [
  { row: 0, column: 0, index: 0 },
  { row: 0, column: 1, index: 1 },
];

/** 后排槽位（3 个） */
const BACK_SLOTS: ReadonlyArray<SlotDef> = [
  { row: 1, column: 0, index: 2 },
  { row: 1, column: 1, index: 3 },
  { row: 1, column: 2, index: 4 },
];

/** 默认测试阵容等级 */
const DEFAULT_HERO_LEVEL = 1;

/** 默认测试阵容数量（前排 2 + 后排 3） */
const DEFAULT_TEAM_SIZE = 5;

// ==================== BattleManager ====================

export class BattleManager extends BaseManager {
  // ===== 单例 =====

  static getInstance(): BattleManager {
    return super.getInstance<BattleManager>();
  }

  // ===== 依赖 =====

  private _eventManager: EventManager;
  private _configManager: ConfigManager;
  private _battleSystem: BattleSystem;

  // ===== 内部状态 =====

  /** 配置是否已加载完成 */
  private _ready: boolean = false;

  /** 上一场战斗结算结果 */
  private _lastBattleResult: BattleResult | null = null;

  /** BATTLE_ENDED 事件监听器引用（用于 off 清理） */
  private _battleEndedListener: ((...args: unknown[]) => void) | null = null;

  /** Phase9: 玩家阵容快照（由外部通过 setPlayerFormation 注入） */
  private _playerTeamSnapshot: TeamSnapshot | null = null;

  /** Phase9: 玩家阵容槽位（由外部通过 setPlayerFormation 注入） */
  private _playerFormationSlots: FormationSlot[] | null = null;

  // ===== 构造 =====

  constructor() {
    super();
    this._eventManager = EventManager.getInstance();
    this._configManager = ConfigManager.getInstance();
    this._battleSystem = BattleSystem.getInstance();
  }

  // ================================================================
  // 公共接口
  // ================================================================

  // ===== 初始化 =====

  /**
   * 异步初始化 — 加载所有战斗相关配置
   *
   * 调用时机：游戏启动时，在进入任何战斗场景之前。
   * 加载完成后发出 BATTLE_MANAGER_READY 事件。
   *
   * 可重复调用（幂等）— 已 ready 时直接返回。
   *
   * @returns Promise<void>
   */
  async initialize(): Promise<void> {
    if (this._ready) return;

    try {
      await this._configManager.loadConfigs(REQUIRED_CONFIG_PATHS);
      this._ready = true;

      // 注册 BattleSystem 的 BATTLE_ENDED 监听（只注册一次）
      this._registerBattleEndedListener();

      this._eventManager.emit(BattleManagerEvent.BATTLE_MANAGER_READY, {
        configCount: REQUIRED_CONFIG_PATHS.length,
      } satisfies BattleManagerReadyEvent);
    } catch (err) {
      console.error(
        '[BattleManager] initialize() 失败: 配置加载异常',
        err,
      );
      throw err;
    }
  }

  // ===== 关卡战斗 =====

  /**
   * 启动一场关卡战斗
   *
   * 流程：
   *   1. 检查 _ready
   *   2. 从 StageConfig 查找关卡
   *   3. 构建我方 BattleUnit[]（测试阵容：从配置取前 5 个英雄）
   *   4. 构建敌方 BattleUnit[]（从 EnemyConfig 逐个查找）
   *   5. BattleSystem.initBattle() + startBattle()
   *   6. 发出 STAGE_BATTLE_STARTED 事件
   *
   * @param stageId — 关卡 ID，引用 StageEntry.id
   * @returns BattleData | null — 战斗容器，失败时返回 null
   */
  startStageBattle(stageId: string): BattleData | null {
    // 守卫 1：配置是否就绪
    if (!this._ready) {
      console.error(
        '[BattleManager] startStageBattle() 失败: 配置未加载，请先调用 initialize()',
      );
      return null;
    }

    // 守卫 2：查找关卡配置
    const stageCfg = this._configManager.getConfig<StageDataConfig>(
      'config/stages/stage_data',
    );
    if (!stageCfg?.data) {
      console.error('[BattleManager] stage_data 配置为空');
      return null;
    }

    const stage = stageCfg.data.find((s) => s.id === stageId);
    if (!stage) {
      console.error(
        `[BattleManager] 关卡不存在: stageId=${stageId}`,
      );
      return null;
    }

    // 守卫 3：构建我方阵容
    const playerUnits = this._buildPlayerUnits();
    if (playerUnits.length === 0) {
      console.error('[BattleManager] 我方阵容为空，无法开始战斗');
      return null;
    }

    // 守卫 4：构建敌方阵容
    const enemyUnits = this._buildEnemyUnits(stage);
    if (enemyUnits.length === 0) {
      console.error(
        `[BattleManager] 敌方阵容为空，无法开始战斗: stageId=${stageId}`,
      );
      return null;
    }

    // 组装配置并注入 BattleSystem
    const systemConfig = this._assembleBattleSystemConfig();
    if (!systemConfig) {
      console.error('[BattleManager] 配置组装失败，无法开始战斗');
      return null;
    }

    // 委托 BattleSystem
    const battleData = this._battleSystem.initBattle(
      stageId,
      playerUnits,
      enemyUnits,
    );
    this._battleSystem.injectConfig(systemConfig);
    this._battleSystem.startBattle();

    // 发出 Manager 级事件
    this._eventManager.emit(BattleManagerEvent.STAGE_BATTLE_STARTED, {
      stageId,
      playerUnitIds: playerUnits.map((u) => u.configId),
      enemyUnitIds: enemyUnits.map((u) => u.configId),
    } satisfies StageBattleStartedEvent);

    return battleData;
  }

  // ===== 战斗控制（委托 BattleSystem）=====

  /** 暂停当前战斗 */
  pauseBattle(): void {
    this._battleSystem.pauseBattle();
  }

  /** 恢复当前战斗 */
  resumeBattle(): void {
    this._battleSystem.resumeBattle();
  }

  /**
   * 终止当前战斗
   *
   * 注意：不会保存 lastBattleResult（非正常结束）。
   */
  stopBattle(): void {
    // 若战斗仍在进行中，保存当前数据作为 lastResult
    const data = this._battleSystem.getBattleData();
    if (data && data.elapsedTimeMs > 0) {
      // 非正常终止，不覆盖 _lastBattleResult
    }
    this._battleSystem.stopBattle();
  }

  /** 每帧推进战斗逻辑（委托 BattleSystem） */
  updateBattle(deltaTimeMs: number): void {
    this._battleSystem.update(deltaTimeMs);
  }

  // ===== 状态查询 =====

  /** 获取当前战斗数据（只读） */
  getCurrentBattleData(): Readonly<BattleData> | null {
    return this._battleSystem.getBattleData();
  }

  /** 获取上一场战斗的结算结果 */
  getLastBattleResult(): Readonly<BattleResult> | null {
    return this._lastBattleResult;
  }

  /** 配置是否已加载完成 */
  isReady(): boolean {
    return this._ready;
  }

  // ===== Phase9: BattleUnitFactory 适配 =====

  /**
   * 注入 Phase9 玩家阵容数据（HeroSystem / SkillSystem / FormationSystem 快照）。
   *
   * 调用此方法后，startStageBattle() 将使用 BattleUnitFactory 消费
   * HeroSnapshot / SkillRuntimeSnapshot / TeamSnapshot 生成 BattleUnit，
   * 而非从 hero_list 配置直接构建。
   *
   * 这是 Phase9 系统族进入 BattleSystem 的唯一入口。
   *
   * @param teamSnapshot — FormationSystem.generateTeamSnapshot() 的输出
   * @param slots        — FormationPreset.slots（含站位信息）
   */
  setPlayerFormation(teamSnapshot: TeamSnapshot, slots: FormationSlot[]): void {
    this._playerTeamSnapshot = teamSnapshot;
    this._playerFormationSlots = [...slots];
  }

  /**
   * 清除已注入的 Phase9 阵容数据。
   *
   * 清除后，startStageBattle() 将回退到从 hero_list 配置构建的默认测试阵容。
   */
  clearPlayerFormation(): void {
    this._playerTeamSnapshot = null;
    this._playerFormationSlots = null;
  }

  // ================================================================
  // 内部 — BattleUnit 构建（我方）
  // ================================================================

  /**
   * 构建我方战斗单元阵容。
   *
   * **Phase9 路径（优先）**：
   *   当通过 setPlayerFormation() 注入了 TeamSnapshot + FormationSlot[] 时，
   *   委托 BattleUnitFactory 消费 HeroSnapshot / SkillRuntimeSnapshot / TeamSnapshot
   *   生成 BattleUnit[]。这是 HeroSystem / SkillSystem / FormationSystem 进入
   *   BattleSystem 的唯一适配层。
   *
   * **Legacy 路径（回退）**：
   *   当未注入 Phase9 数据时，从 hero_list 配置中取前 DEFAULT_TEAM_SIZE 个英雄
   *   作为测试阵容。后续替换为从存档读取玩家实际阵容。
   *
   * 站位分配规则：
   *   - position = 'front' → 优先填入前排（最多 2 个）
   *   - position = 'back'  → 填入后排（最多 3 个）
   *   - 前排满 → 剩余 'front' 英雄补到后排空缺位置
   *   - 后排满 → 剩余 'back' 英雄补到前排空缺位置
   *
   * @returns BattleUnit[] — 最多 5 个我方单位
   */
  private _buildPlayerUnits(): BattleUnit[] {
    // ===== Phase9 路径：使用 BattleUnitFactory（优先）=====
    if (this._playerTeamSnapshot && this._playerFormationSlots) {
      const factory = BattleUnitFactory.getInstance();
      const units = factory.buildPlayerUnits(
        this._playerTeamSnapshot,
        this._playerFormationSlots,
      );

      if (units.length > 0) {
        console.log(
          `[BattleManager] Phase9 路径: BattleUnitFactory 构建 ${units.length} 个我方 BattleUnit`,
        );
        return units;
      }

      // 工厂返回空阵容 → 回退到 legacy 路径
      console.warn(
        '[BattleManager] BattleUnitFactory 返回空阵容，回退到 legacy 配置路径',
      );
    }

    // ===== Legacy 路径：从 hero_list 配置构建（回退）=====
    const heroCfg = this._configManager.getConfig<HeroListData>(
      'config/cards/hero_list',
    );
    if (!heroCfg?.data || heroCfg.data.length === 0) {
      console.error('[BattleManager] hero_list 配置为空，无法构建我方阵容');
      return [];
    }

    // MVP：取前 N 个英雄作为测试阵容
    const selectedHeroes = heroCfg.data.slice(0, DEFAULT_TEAM_SIZE);
    if (selectedHeroes.length === 0) return [];

    // 按 position 分组
    const frontHeroes = selectedHeroes.filter(
      (h) => h.position === 'front',
    );
    const backHeroes = selectedHeroes.filter(
      (h) => h.position === 'back',
    );

    // 分配站位
    const positionMap = this._assignPlayerPositions(
      frontHeroes.length,
      backHeroes.length,
    );

    // 构建 BattleUnit 数组
    const units: BattleUnit[] = [];
    const allHeroes = [...frontHeroes, ...backHeroes];

    for (let i = 0; i < allHeroes.length; i++) {
      const slot = positionMap[i];
      if (!slot) break; // 超出阵型容量

      const hero = allHeroes[i];
      const unit = this._heroConfigToBattleUnit(hero, slot, i);
      units.push(unit);
    }

    return units;
  }

  /**
   * 分配我方站位
   *
   * @param frontCount — position='front' 的英雄数量
   * @param backCount  — position='back' 的英雄数量
   * @returns 每个英雄的 BattlePosition（按 [fronts..., backs...] 顺序）
   */
  private _assignPlayerPositions(
    frontCount: number,
    backCount: number,
  ): BattlePosition[] {
    const positions: BattlePosition[] = [];
    const usedFrontSlots = new Set<number>();
    const usedBackSlots = new Set<number>();

    // 1. 分配前排英雄到前排槽位
    for (let i = 0; i < frontCount; i++) {
      if (i < FRONT_SLOTS.length) {
        const slot = FRONT_SLOTS[i];
        usedFrontSlots.add(i);
        positions.push({
          row: slot.row,
          column: slot.column,
          index: slot.index,
        });
      } else {
        // 前排满 → 补到后排空缺
        const backSlot = this._findAvailableSlot(
          BACK_SLOTS,
          usedBackSlots,
        );
        if (backSlot) {
          usedBackSlots.add(backSlot.column);
          positions.push({
            row: backSlot.row,
            column: backSlot.column,
            index: backSlot.index,
          });
        }
      }
    }

    // 2. 分配后排英雄到后排槽位
    for (let i = 0; i < backCount; i++) {
      if (i < BACK_SLOTS.length) {
        const slot = BACK_SLOTS[i];
        usedBackSlots.add(i);
        positions.push({
          row: slot.row,
          column: slot.column,
          index: slot.index,
        });
      } else {
        // 后排满 → 补到前排空缺
        const frontSlot = this._findAvailableSlot(
          FRONT_SLOTS,
          usedFrontSlots,
        );
        if (frontSlot) {
          usedFrontSlots.add(frontSlot.column);
          positions.push({
            row: frontSlot.row,
            column: frontSlot.column,
            index: frontSlot.index,
          });
        }
      }
    }

    return positions;
  }

  /** 从槽位数组中找一个未被占用的槽位 */
  private _findAvailableSlot(
    slots: ReadonlyArray<SlotDef>,
    usedColumns: Set<number>,
  ): SlotDef | null {
    for (const slot of slots) {
      if (!usedColumns.has(slot.column)) {
        return slot;
      }
    }
    return null;
  }

  /** 将单条 HeroConfig 转换为 BattleUnit */
  private _heroConfigToBattleUnit(
    hero: HeroConfig,
    slot: BattlePosition,
    unitIndex: number,
  ): BattleUnit {
    const level = DEFAULT_HERO_LEVEL;

    return {
      unitId: `p_${unitIndex}`,
      configId: hero.id,
      unitType: BattleUnitType.Hero,
      // MVP: 使用 configId 作为显示名（本地化系统尚未实现）
      name: hero.id,
      faction: hero.faction,
      // TODO: HeroConfig 缺少 element 字段，MVP 使用 faction→element 映射
      element: this._factionToElement(hero.faction),
      level,
      maxHp: hero.baseHp + hero.growthHp * (level - 1),
      currentHp: hero.baseHp + hero.growthHp * (level - 1),
      attack: hero.baseAtk + hero.growthAtk * (level - 1),
      defense: hero.baseDef + hero.growthDef * (level - 1),
      speed: hero.baseSpeed,
      skillIds: [...hero.skillIds],
      position: { ...slot },
      isAlive: true,
    };
  }

  // ================================================================
  // 内部 — BattleUnit 构建（敌方）
  // ================================================================

  /**
   * 根据关卡配置构建敌方阵容
   *
   * 每个 enemyId 必须存在于 EnemyConfig 中，缺失时 warn + 跳过。
   *
   * @param stage — 关卡配置
   * @returns BattleUnit[] — 敌人单位列表
   */
  private _buildEnemyUnits(stage: StageEntry): BattleUnit[] {
    const enemyCfg = this._configManager.getConfig<EnemyDataConfig>(
      'config/stages/enemy_data',
    );
    if (!enemyCfg?.data) {
      console.error('[BattleManager] enemy_data 配置为空，无法构建敌方阵容');
      return [];
    }

    const units: BattleUnit[] = [];

    for (let i = 0; i < stage.enemyIds.length; i++) {
      const enemyId = stage.enemyIds[i];
      const enemy = enemyCfg.data.find((e) => e.id === enemyId);

      if (!enemy) {
        console.warn(
          `[BattleManager] 敌人配置缺失: enemyId=${enemyId} (stage=${stage.id})，已跳过`,
        );
        continue;
      }

      const slot = this._assignEnemyPosition(i);
      const unit = this._enemyConfigToBattleUnit(enemy, slot, i);
      units.push(unit);
    }

    return units;
  }

  /** 为敌人分配站位（目前全部放入前排，从左到右填充） */
  private _assignEnemyPosition(index: number): BattlePosition {
    // 2 个前排槽位 + 3 个后排槽位 = 总共 5 个敌人位置
    // 先填前排 (0,0), (0,1)，再填后排 (1,0), (1,1), (1,2)
    const allSlots: SlotDef[] = [...FRONT_SLOTS, ...BACK_SLOTS];
    const slot = allSlots[index] ?? allSlots[allSlots.length - 1];

    return {
      row: slot.row,
      column: slot.column,
      index: slot.index,
    };
  }

  /** 将单条 EnemyEntry 转换为 BattleUnit */
  private _enemyConfigToBattleUnit(
    enemy: EnemyEntry,
    slot: BattlePosition,
    unitIndex: number,
  ): BattleUnit {
    const unitType =
      enemy.enemyType === 'boss'
        ? BattleUnitType.Boss
        : BattleUnitType.Enemy;

    return {
      unitId: `e_${unitIndex}`,
      configId: enemy.id,
      unitType,
      name: enemy.name,
      faction: enemy.faction,
      element: enemy.element,
      level: enemy.level,
      maxHp: enemy.hp,
      currentHp: enemy.hp,
      attack: enemy.attack,
      defense: enemy.defense,
      speed: enemy.speed,
      skillIds: [...enemy.skillIds],
      position: { ...slot },
      isAlive: true,
    };
  }

  // ================================================================
  // 内部 — 事件监听
  // ================================================================

  /**
   * 注册 BattleSystem BATTLE_ENDED 的监听
   *
   * 当 BattleSystem 发出 BATTLE_ENDED 时：
   *   1. 从 BattleExecutionResult 提取执行数据
   *   2. 调用 _resolveRewards() 执行掉落判定（仅胜利时）
   *   3. 组装最终 BattleResult（含 expGain / goldGain / powerGain）
   *   4. 保存 _lastBattleResult
   *   5. 转发为 STAGE_BATTLE_FINISHED
   */
  private _registerBattleEndedListener(): void {
    // 避免重复注册
    if (this._battleEndedListener) return;

    this._battleEndedListener = (...args: unknown[]): void => {
      const payload = args[0] as BattleEndedEvent | undefined;
      const executionResult: BattleExecutionResult | undefined =
        payload?.executionResult;
      if (!executionResult) return;

      // 仅在胜利时解析掉落奖励
      const isVictory =
        executionResult.resultType === BattleResultType.Victory;
      const rewards: BattleReward[] = isVictory
        ? this._resolveRewards(executionResult.stageId)
        : [];

      // 汇总各类收益
      let expGain = 0;
      let goldGain = 0;
      for (const reward of rewards) {
        if (reward.itemType === 'exp') {
          expGain += reward.count;
        } else if (reward.itemType === 'gold') {
          goldGain += reward.count;
        }
      }

      // 组装最终 BattleResult
      const result: BattleResult = {
        stageId: executionResult.stageId,
        isVictory,
        resultType: executionResult.resultType,
        elapsedTimeMs: executionResult.elapsedTimeMs,
        round: executionResult.round,
        killedEnemyIds: executionResult.killedEnemyIds,
        rewards,
        expGain,
        goldGain,
        // MVP 阶段暂不计算战力变化，Phase 4 成长系统实现后补充
        powerGain: 0,
      };

      // 保存结算结果
      this._lastBattleResult = result;

      // 转发 Manager 级事件
      this._eventManager.emit(
        BattleManagerEvent.STAGE_BATTLE_FINISHED,
        {
          result,
        } satisfies StageBattleFinishedEvent,
      );
    };

    this._eventManager.on(
      BattleEvent.BATTLE_ENDED,
      this._battleEndedListener,
    );
  }

  // ================================================================
  // 内部 — 配置组装 & 注入
  // ================================================================

  /**
   * 组装 BattleSystemConfig — 从 ConfigManager 读取配置并打包为注入对象
   *
   * BattleSystem 不直接依赖 ConfigManager。BattleManager 在这里完成：
   *   - GlobalBattleEntry → battleConfig
   *   - SkillDataConfig.data → skillConfigMap
   *
   * 注意：奖励解析（_resolveRewards）不再注入 BattleSystem，
   * 而是在 _registerBattleEndedListener 中由 BattleManager 直接调用。
   *
   * @returns BattleSystemConfig | null — 组装失败时返回 null
   */
  private _assembleBattleSystemConfig(): BattleSystemConfig | null {
    // 1. 读取 GlobalBattleEntry
    const globalCfg = this._configManager.getConfig<GlobalConstConfig>(
      'config/systems/global_const',
    );
    if (!globalCfg?.data) {
      console.error('[BattleManager] global_const 配置为空');
      return null;
    }

    const battleEntry = globalCfg.data.find(
      (e): e is GlobalBattleEntry => e.id === 'GLOBAL_BATTLE',
    );
    if (!battleEntry) {
      console.error('[BattleManager] GLOBAL_BATTLE 配置未找到');
      return null;
    }

    // 2. 读取 SkillConfig，构建 Map
    const skillCfg = this._configManager.getConfig<SkillDataConfig>(
      'config/skills/skill_data',
    );
    const skillConfigMap = new Map<string, SkillConfig>();
    if (skillCfg?.data) {
      for (const skill of skillCfg.data) {
        skillConfigMap.set(skill.id, skill);
      }
    }

    return {
      battleConfig: battleEntry,
      skillConfigMap,
    };
  }

  // ================================================================
  // 内部 — 奖励解析（BattleManager 独占，不再注入 BattleSystem）
  // ================================================================

  /**
   * 根据关卡配置的掉落池解析战斗奖励
   *
   * 流程：
   *   1. 从 StageConfig 读取 dropId
   *   2. 从 DropConfig 读取掉落池条目
   *   3. 按 DropItem.dropRate 逐个判定掉落
   *
   * @param stageId — 关卡 ID
   * @returns 奖励列表（配置缺失时返回空数组）
   */
  private _resolveRewards(stageId: string): BattleReward[] {
    const rewards: BattleReward[] = [];

    try {
      // 1. 查找关卡配置
      const stageCfg = this._configManager.getConfig<StageDataConfig>(
        'config/stages/stage_data',
      );
      if (!stageCfg?.data) return rewards;

      const stage = stageCfg.data.find((s) => s.id === stageId);
      if (!stage) return rewards;

      // 2. 查找掉落池
      const dropCfg = this._configManager.getConfig<DropTableConfig>(
        'config/drops/drop_table',
      );
      if (!dropCfg?.data) return rewards;

      const dropEntry = dropCfg.data.find((d) => d.id === stage.dropId);
      if (!dropEntry) return rewards;

      // 3. 逐个判定掉落
      for (const item of dropEntry.items) {
        const rolled = this._rollDropItem(item);
        if (rolled) {
          rewards.push(rolled);
        }
      }
    } catch {
      // 配置加载失败，返回空 rewards
    }

    return rewards;
  }

  /** 对单个 DropItem 进行掉落判定 */
  private _rollDropItem(item: DropItem): BattleReward | null {
    const roll = (): BattleReward => ({
      itemId: item.itemId,
      itemType: item.itemType,
      count: this._randomInt(item.minCount, item.maxCount),
      source: 'drop',
    });

    // 保底掉落
    if (item.isGuaranteed) {
      return roll();
    }

    // 概率掉落
    if (Math.random() < item.dropRate) {
      return roll();
    }

    return null;
  }

  /** [min, max] 范围内的随机整数 */
  private _randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ================================================================
  // 内部 — 临时映射（TODO: 后续补齐 HeroConfig.element）
  // ================================================================

  /**
   * 阵营 → 元素 临时映射
   *
   * 原因：HeroConfig 当前无 element 字段，但 BattleUnit 需要 element。
   * 后续应在 HeroConfig 中增加 element 字段并从此处移除映射逻辑。
   *
   * 映射表：
   *   青龙 → 雷  |  白虎 → 冰  |  朱雀 → 火
   *   玄武 → 毒  |  混沌 → 暗
   */
  private _factionToElement(faction: Faction): Element {
    const MAP: Readonly<Record<Faction, Element>> = {
      '青龙': '雷',
      '白虎': '冰',
      '朱雀': '火',
      '玄武': '毒',
      '混沌': '暗',
    };
    return MAP[faction];
  }
}
