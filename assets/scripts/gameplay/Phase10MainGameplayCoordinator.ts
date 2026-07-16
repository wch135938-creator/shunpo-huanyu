// ============================================================
// Phase10MainGameplayCoordinator.ts — Step12A-B 主玩法闭环协调器
// 职责：首关映射 → 阵容确保 → 战斗启动 → update 推进 →
//       战斗结束监听 → RewardSettlement 结算 → exp 分配 →
//       战力刷新 → ChapterSystem 推进 → Save 落盘
// 位置：gameplay/ 层
// 依赖：Phase9Bootstrap, BattleManager, RewardSettlement,
//       HeroSystem, FormationSystem, ChapterSystem, SaveManager
// 规范：零 any / 状态机严格 / transactionId 固定规则 /
//       不接 UI / 不接 Scene / 不接 Prefab
// ============================================================

import { _decorator, Component, Button, Label, Node, find, UITransform, Color } from 'cc';
import { EventManager } from '../core/EventManager';
import { ConfigManager } from '../core/ConfigManager';
import { BattleManager, BattleManagerEvent } from '../managers/BattleManager';
import type { StageBattleFinishedEvent } from '../managers/BattleManager';
import { RewardSettlement } from '../reward/RewardSettlement';
import type { SettlementOptions } from '../reward/RewardSettlement';
import { HeroSystem } from '../hero/HeroSystem';
import { FormationSystem } from '../formation/FormationSystem';
import { ChapterSystem } from '../chapter/ChapterSystem';
import type { StageCompletionContext } from '../chapter/ChapterSystem';
import { ChapterRepository } from '../chapter/ChapterRepository';
import type { StageConfig } from '../chapter/ChapterTypes';
import { Phase9Bootstrap, Phase9Event } from '../systems/Phase9Bootstrap';
import { ProgressSystem } from '../systems/ProgressSystem';
import type { PlayerLevelChangedEventData } from '../systems/ProgressSystem';
import { SaveManager } from '../save/SaveManager';
import { EquipmentService, EquipmentEvent } from '../equipment/EquipmentService';
import { InventoryService } from '../inventory/InventoryService';
import type { BattleResult } from '../battle/BattleResult';
import type { GlobalPlayerEntry, GlobalConstConfig } from '../config/global_config';
import type { StageDataConfig } from '../config/stage_config';

const { ccclass, property } = _decorator;

// ==================== 状态枚举 ====================

/** Coordinator 状态机状态 */
export type CoordinatorState = 'idle' | 'running' | 'settling' | 'settled' | 'failed';

// ==================== 结算摘要 ====================

/** 单条奖励展示项（C1.4.1 补全奖励文字） */
export interface RewardDisplayItem {
  itemId: string;
  count: number;
}

/** 战斗结算摘要（供 Step12A-C ResultPanel 使用） */
export interface GameplayLastResult {
  success: boolean;
  isDuplicate: boolean;
  chapterStageId: string;
  battleStageId: string;
  transactionId: string;
  goldGain: number;
  expGain: number;
  rewardSummary: string;
  /** [C1.4.1] 非金币/经验的奖励项列表（用于结果 Label 展示） */
  rewardItems: RewardDisplayItem[];
  powerBefore: number;
  powerAfter: number;
  expBefore: number;
  expAfter: number;
  chapterCompleted: boolean;
  nextStageUnlocked: string;
  message: string;
}

/** challengeFirstStage 返回值 */
export interface ChallengeResult {
  success: boolean;
  state: CoordinatorState;
  errorCode?: string;
  message: string;
}

// ==================== [C1.5.8-B3] 关卡上下文 ====================

/** 当前关卡解析上下文（统一 helper 返回值）。
 *  challengeFirstStage 和 _refreshCurrentStageDisplay 共用同一解析逻辑。 */
interface CurrentStageContext {
  /** ChapterSystem 返回的完整 StageConfig（未就绪时为 null） */
  stageConfig: StageConfig | null;
  /** 关卡序号（1-based），用于显示 "第 X 关" */
  displayIndex: number | null;
  /** 关卡名称，如 "灵鹤涧" */
  stageName: string | null;
  /** 章节关卡 ID，如 "chapter_001_stage_04" */
  chapterStageId: string | null;
  /** 解析后的 Battle 关卡 ID（映射失败时为 null） */
  battleStageId: string | null;
  /** [C1.6-B1] 当前章节 ID，如 "chapter_001"（未就绪时为 null） */
  chapterId: string | null;
  /** [C1.6-B1-B-R1] 当前章节序号（1-based），用于多章节文案 */
  chapterIndex: number | null;
}

// ==================== 错误码 ====================

const ERR_BUSY = 'ERR_BUSY';
const ERR_NO_BATTLE_MAPPING = 'ERR_NO_BATTLE_MAPPING';
const ERR_NO_BATTLE_STAGE = 'ERR_NO_BATTLE_STAGE';
const ERR_NO_HERO = 'ERR_NO_HERO';
const ERR_NO_FORMATION = 'ERR_NO_FORMATION';
const ERR_CONFIG_MISSING = 'ERR_CONFIG_MISSING';
const ERR_BATTLE_START_FAILED = 'ERR_BATTLE_START_FAILED';
const ERR_ENTRY_REQUIREMENT_NOT_MET = 'ERR_ENTRY_REQUIREMENT_NOT_MET';

// ==================== Phase10MainGameplayCoordinator ====================

@ccclass('Phase10MainGameplayCoordinator')
export class Phase10MainGameplayCoordinator extends Component {

  // ===== UI 绑定（Step12A-C1）=====

  @property(Button)
  challengeButton: Button | null = null;

  @property(Label)
  resultLabel: Label | null = null;

  // ===== 依赖 =====

  private _eventManager!: EventManager;
  private _configManager!: ConfigManager;
  private _battleManager!: BattleManager;
  private _rewardSettlement!: RewardSettlement;
  private _heroSystem!: HeroSystem;
  private _formationSystem!: FormationSystem;
  private _chapterSystem!: ChapterSystem;
  private _chapterRepository!: ChapterRepository;
  private _phase9Bootstrap!: Phase9Bootstrap;
  private _saveManager!: SaveManager;

  // ===== 状态机 =====

  private _state: CoordinatorState = 'idle';
  private _lastPopupDiagState = '';

  // ===== 当前战斗上下文 =====

  private _attemptId: string = '';
  private _currentTransactionId: string = '';
  private _currentChapterStageId: string = '';
  private _currentBattleStageId: string = '';

  // ===== C1.5.8-B 当前关卡显示缓存 =====

  /** [C1.5.8-B] 最近一次 challenge 使用的关卡配置（用于动态文案生成） */
  private _currentStageConfig: StageConfig | null = null;

  // ===== C1.5 HeroInfoLabel（运行时创建） =====

  @property(Label)
  heroInfoLabel: Label | null = null;

  // ===== Before / After 记录 =====

  private _powerBefore: number = 0;
  private _powerAfter: number = 0;
  private _expBefore: number = 0;
  private _expAfter: number = 0;

  /** [C1.5] 战斗前 hero_001 的 level 快照 */
  private _heroLevelBefore: number = 0;

  /** [C1.5] 战斗后 hero_001 的 level（用于结果 Label 显示等级变化） */
  private _heroLevelAfter: number = 0;

  // ===== C1.5.9-G-B1-A7: 账号经验与等级 =====

  /** 战斗结算进行中标志（防止 PLAYER_LEVEL_CHANGED 监听器重复落盘） */
  private _isBattleSettlementInProgress: boolean = false;

  /** 本场战斗获得的账号经验 */
  private _accountExpGained: number = 0;

  /** 战斗前账号等级 */
  private _accountLevelBefore: number = 0;

  /** 战斗后账号等级 */
  private _accountLevelAfter: number = 0;

  // ===== 结算结果 =====

  private _lastResult: GameplayLastResult | null = null;

  /** [C1.6-B1-B-R6] 结算时刻所属章节 ID（从 chapterStageId 解析，用于跨章节确认判断） */
  private _lastResultChapterId: string | null = null;

  // ===== 事件监听引用 =====

  private _battleFinishedListener: ((...args: unknown[]) => void) | null = null;
  private _phase9RestoreListener: ((...args: unknown[]) => void) | null = null;
  private _powerChangedListener: ((...args: unknown[]) => void) | null = null;
  private _loadoutChangedListener: ((...args: unknown[]) => void) | null = null;
  private _playerLevelChangedListener: ((...args: unknown[]) => void) | null = null;
  private _heroStartupDiagLogged = false;

  // ===== 弹窗覆盖检测（Step12A-C1.2）=====

  /** [Step12A-C1.3] 检测时需要隐藏挑战 UI 的全屏弹窗节点名称列表。
   *  实际 Phase10Main.scene 中 UIRoot 下的节点名:
   *    Index 193: MailPanel
   *    Index 247: RedeemCodePanel
   *    Index 299: LoginRewardPopup
   */
  private static readonly POPUP_PANEL_NAMES: string[] = [
    'MailPanel',
    'RedeemCodePanel',
    'LoginRewardPopup',
  ];

  /**
   * 根据弹窗状态更新挑战按钮和结果 Label 的可见性。
   */
  private _updateChallengeUIVisibility(): void {
    const uiRoot = this._resolveUIRoot();
    const popupStates = Phase10MainGameplayCoordinator.POPUP_PANEL_NAMES.map((name) => {
      const node = uiRoot?.getChildByName(name) ?? null;
      return {
        name,
        node,
        active: node?.active === true,
        activeInHierarchy: node?.activeInHierarchy === true,
      };
    });
    const fuzzyPopupNodes = uiRoot
      ? uiRoot.children.filter((child) => {
        if (Phase10MainGameplayCoordinator.POPUP_PANEL_NAMES.indexOf(child.name) >= 0) {
          return false;
        }
        const name = child.name.toLowerCase();
        return name.includes('mail')
          || name.includes('redeem')
          || name.includes('loginreward')
          || name.includes('dailylogin');
      })
      : [];
    const popupActive = popupStates.some((state) => state.activeInHierarchy)
      || fuzzyPopupNodes.some((node) => node.activeInHierarchy);
    const shouldShow = !popupActive;

    if (this.challengeButton && this.challengeButton.node.active !== shouldShow) {
      this.challengeButton.node.active = shouldShow;
    }
    if (this.resultLabel && this.resultLabel.node.active !== shouldShow) {
      this.resultLabel.node.active = shouldShow;
    }
    // [C1.5] heroInfoLabel 跟随挑战 UI 可见性
    if (this.heroInfoLabel && this.heroInfoLabel.node.active !== shouldShow) {
      this.heroInfoLabel.node.active = shouldShow;
    }

    const popupDiagState = JSON.stringify({
      uiRootFound: uiRoot !== null,
      popups: popupStates.map((state) => ({
        name: state.name,
        found: state.node !== null,
        active: state.active,
        activeInHierarchy: state.activeInHierarchy,
      })),
      fuzzyActive: fuzzyPopupNodes.filter((node) => node.activeInHierarchy).map((node) => node.name),
      challengeActive: this.challengeButton?.node.active ?? false,
      resultActive: this.resultLabel?.node.active ?? false,
    });
    if (popupDiagState !== this._lastPopupDiagState) {
      this._lastPopupDiagState = popupDiagState;
      console.log(`[Step12A-C1.4][PopupDiag] ${popupDiagState}`);
    }
  }

  private _resolveUIRoot(): Node | null {
    let current = this.node.parent;
    while (current) {
      if (current.name === 'UIRoot') {
        return current;
      }
      current = current.parent;
    }
    return find('Canvas/UIRoot');
  }

  // ================================================================
  // Cocos 生命周期
  // ================================================================

  onLoad(): void {
    console.log('[Step12A-C1.5.1][CoordinatorDiag] ON_LOAD_ENTER');
    this._eventManager = EventManager.getInstance();
    this._configManager = ConfigManager.getInstance();
    this._battleManager = BattleManager.getInstance();
    this._rewardSettlement = RewardSettlement.getInstance();
    this._heroSystem = HeroSystem.getInstance();
    this._formationSystem = FormationSystem.getInstance();
    this._chapterSystem = ChapterSystem.getInstance();
    this._chapterRepository = ChapterRepository.getInstance();
    this._phase9Bootstrap = Phase9Bootstrap.getInstance();
    this._saveManager = SaveManager.getInstance();

    this._registerBattleEndedListener();
    this._registerPhase9RestoreListener();
    this._registerPowerChangedListener();
    this._registerLoadoutChangedListener();
    this._registerPlayerLevelChangedListener();
    this._bindChallengeButton();

    // [C1.5] 创建极简英雄信息标签（运行时，不修改 Scene）
    this._ensureHeroInfoLabel();

    // [Step12A-C1.2] 初始检测弹窗状态，避免挑战按钮覆盖在弹窗上
    this.scheduleOnce(() => {
      this._updateChallengeUIVisibility();
      // 热重载等场景下恢复事件可能早于本组件监听，使用状态做一次幂等兜底。
      if (this._phase9Bootstrap.isRestored()) {
        this._refreshHeroInfoAfterRestore();
      }
    }, 0.2);

    // [C1.5.8-B4] 短时重试初始化显示刷新：最多 10 次，每 0.1s 一次，
    // 始终覆盖按钮，仅当 displayIndex > 1（真实进度确认）时提前停止。
    // displayIndex=1 可能是 ChapterSystem 默认值（存档尚未恢复），继续重试。
    this._retryInitDisplay(0, 10);

    console.log('[Step12A-B][Coordinator] onLoad — 依赖就绪, state=idle');
  }

  onDestroy(): void {
    this._unbindChallengeButton();
    this._unregisterBattleEndedListener();
    this._unregisterPhase9RestoreListener();
    this._unregisterPowerChangedListener();
    this._unregisterLoadoutChangedListener();
    this._unregisterPlayerLevelChangedListener();
    console.log('[Step12A-B][Coordinator] onDestroy — 事件注销完成');
  }

  // ================================================================
  // 公共 API
  // ================================================================

  /**
   * [Step12A-B] 启动首关战斗。
   *
   * 仅接受 state === idle 或 state === settled。
   * 流程：
   *   1. 状态校验
   *   2. 读取首关配置，验证 battleStageId
   *   3. 确保阵容可用（含初始英雄 fallback）
   *   4. 生成 snapshot → setPlayerFormation
   *   5. startStageBattle
   *   6. 设置为 running
   *
   * @returns 结构化结果
   */
  challengeFirstStage(): ChallengeResult {
    // 状态校验
    if (this._state === 'running') {
      return {
        success: false,
        state: this._state,
        errorCode: ERR_BUSY,
        message: '战斗进行中，无法重复启动',
      };
    }
    if (this._state === 'settling') {
      return {
        success: false,
        state: this._state,
        errorCode: ERR_BUSY,
        message: '正在结算上一场战斗，请等待',
      };
    }

    console.log('[Step12A-B][Coordinator] challengeFirstStage — 开始');

    try {
      // 1. [C1.5.8-B3] 使用统一 helper 解析当前章节进度
      const ctx = this._resolveCurrentStageContext();
      const stageConfig = ctx.stageConfig;
      if (!stageConfig) {
        return this._failChallenge(ERR_CONFIG_MISSING, '当前章节关卡配置不存在，请确认 ChapterSystem 已初始化');
      }

      // [C1.5.8-B2] 缓存当前关卡配置并立即刷新显示（按钮/结果标签）
      this._currentStageConfig = stageConfig;
      this._refreshCurrentStageDisplay();

      // 2. 解析 battleStageId 映射（使用 context 中已解析的结果）
      const battleStageId = ctx.battleStageId;
      if (!battleStageId) {
        // [C1.6-B1-B-R4] 多章节未接入提示（紧凑格式，避免文字重叠）
        const stageDisplay = this._formatCompactStageDisplayForChapter(ctx);
        return this._failChallenge(
          ERR_NO_BATTLE_MAPPING,
          `${stageDisplay} 尚未接入`,
        );
      }

      console.log(
        `[Step12A-B][Coordinator] 关卡映射读取成功: ` +
        `chapterStage=${stageConfig.id} → battleStage=${battleStageId}`,
      );

      // [C1.5.9-G-B2-A11] 核心入口准入二次校验
      const entryBlockMessage = this._getStageEntryBlockMessage(stageConfig);
      if (entryBlockMessage) {
        return this._blockChallengeEntry(
          ERR_ENTRY_REQUIREMENT_NOT_MET,
          entryBlockMessage,
        );
      }

      // 3. 确保阵容可用
      const formationOk = this._ensurePlayableFormation();
      if (!formationOk) {
        return this._failChallenge(ERR_NO_FORMATION, '无法构建可用 PVE 阵容');
      }

      // 4. 生成快照
      const teamSnapshot = this._formationSystem.generateTeamSnapshot('pve');
      if (!teamSnapshot) {
        return this._failChallenge(ERR_NO_FORMATION, 'PVE 阵容快照生成失败');
      }

      // 获取 slots
      const pvePreset = this._formationSystem.getActivePreset('pve');
      if (!pvePreset || pvePreset.slots.every((s) => s.heroId === null)) {
        return this._failChallenge(ERR_NO_FORMATION, 'PVE 阵容所有槽位为空');
      }

      console.log(
        `[Step12A-B][Coordinator] 阵容非空: slots=${pvePreset.slots.filter((s) => s.heroId !== null).length}`,
      );

      // ===== [Step12A-C1.1][RuntimeDiag] 战斗前诊断日志 =====
      this._logPreBattleDiagnostics(pvePreset.slots, teamSnapshot, battleStageId);

      // 5. 注入阵容到 BattleManager
      this._battleManager.setPlayerFormation(teamSnapshot, pvePreset.slots);

      // 6. 记录战力（before）
      this._powerBefore = pvePreset.teamPower;

      // 7. 生成 attemptId 和 transactionId
      this._attemptId = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this._currentTransactionId = `txn_battle_${battleStageId}_${this._attemptId}`;
      this._currentChapterStageId = stageConfig.id;
      this._currentBattleStageId = battleStageId;

      console.log(
        `[Step12A-B][Coordinator] transactionId=${this._currentTransactionId}`,
      );

      // 8. 记录 exp before（所有 PVE 阵容英雄总 exp）
      this._expBefore = this._sumFormationExp(pvePreset.slots);

      // 9. 启动战斗
      const battleData = this._battleManager.startStageBattle(battleStageId);
      if (!battleData) {
        return this._failChallenge(ERR_BATTLE_START_FAILED, 'BattleManager 启动战斗失败');
      }

      this._state = 'running';
      this._setChallengeButtonInteractable(false);
      const battleText = this._currentStageConfig
        ? `第 ${this._currentStageConfig.stageIndex} 关战斗中...`
        : '战斗中...';
      this._updateResultLabel(battleText);
      console.log(
        `[Step12A-B][Coordinator] BattleManager 启动成功: stageId=${battleStageId}, state=running`,
      );

      // [Step12A-C1.1][RuntimeDiag] 敌方摘要（startStageBattle 成功后 BattleData 可用）
      this._logEnemyDiagnostics(battleStageId);

      return {
        success: true,
        state: this._state,
        message: `战斗已启动: ${battleStageId}`,
      };
    } catch (err) {
      console.error('[Step12A-B][Coordinator] challengeFirstStage 异常:', err);
      this._state = 'failed';
      return {
        success: false,
        state: 'failed',
        errorCode: ERR_BATTLE_START_FAILED,
        message: `异常: ${String(err)}`,
      };
    }
  }

  // ================================================================
  // update 推进
  // ================================================================

  /**
   * 每帧推进战斗逻辑。
   *
   * 仅 running 状态下调用 BattleManager.updateBattle。
   * 注意：Cocos update deltaTime 单位为秒，BattleManager 期望毫秒。
   *
   * [Step12A-C1.2] 同时检测弹窗覆盖，隐藏/显示挑战按钮和结果 Label。
   *
   * @param deltaTime  Cocos 帧间隔（秒）
   */
  update(deltaTime: number): void {
    // [Step12A-C1.2] 每帧检测弹窗覆盖
    this._updateChallengeUIVisibility();

    if (this._state !== 'running') return;
    this._battleManager.updateBattle(deltaTime * 1000);
  }

  // ================================================================
  // 状态查询
  // ================================================================

  getState(): CoordinatorState {
    return this._state;
  }

  getLastResult(): GameplayLastResult | null {
    return this._lastResult;
  }

  getCurrentTransactionId(): string {
    return this._currentTransactionId;
  }

  // ================================================================
  // 内部 — 战斗结束事件处理
  // ================================================================

  private _registerBattleEndedListener(): void {
    if (this._battleFinishedListener) return;

    this._battleFinishedListener = (...args: unknown[]): void => {
      const payload = args[0] as StageBattleFinishedEvent | undefined;
      if (!payload || !payload.result) return;

      void this._onBattleFinished(payload.result);
    };

    this._eventManager.on(
      BattleManagerEvent.STAGE_BATTLE_FINISHED,
      this._battleFinishedListener,
    );
  }

  private _unregisterBattleEndedListener(): void {
    if (!this._battleFinishedListener) return;
    this._eventManager.off(
      BattleManagerEvent.STAGE_BATTLE_FINISHED,
      this._battleFinishedListener,
    );
    this._battleFinishedListener = null;
  }

  private _registerPhase9RestoreListener(): void {
    if (this._phase9RestoreListener) return;

    this._phase9RestoreListener = (): void => {
      this._refreshHeroInfoAfterRestore();
    };
    this._eventManager.on(
      Phase9Event.RESTORE_COMPLETE,
      this._phase9RestoreListener,
      this,
    );
  }

  private _unregisterPhase9RestoreListener(): void {
    if (!this._phase9RestoreListener) return;
    this._eventManager.off(
      Phase9Event.RESTORE_COMPLETE,
      this._phase9RestoreListener,
      this,
    );
    this._phase9RestoreListener = null;
  }

  /**
   * [C1.5.9-B1-A2] 监听阵容战力变化，触发章节解锁重判。
   */
  private _registerPowerChangedListener(): void {
    if (this._powerChangedListener) return;

    this._powerChangedListener = (): void => {
      this._reevaluateChapterConditions('FORMATION_POWER_CHANGED');
    };
    this._eventManager.on(
      FormationSystem.FORMATION_POWER_CHANGED,
      this._powerChangedListener,
      this,
    );
  }

  private _unregisterPowerChangedListener(): void {
    if (!this._powerChangedListener) return;
    this._eventManager.off(
      FormationSystem.FORMATION_POWER_CHANGED,
      this._powerChangedListener,
      this,
    );
    this._powerChangedListener = null;
  }

  /**
   * [C1.5.9-G-B1-A5] 监听装备穿戴变化事件，触发阵容战力全量重算。
   *
   * EquipmentEvent.LOADOUT_CHANGED → FormationSystem.recalculateAllPower(),
   * 只在战力值真实变化时由 FormationSystem 内部发射 FORMATION_POWER_CHANGED，
   * 再由本 Coordinator 触发章节重判。
   *
   * 此监听不直接依赖 FormationSystem 事件；
   * FormationSystem 不直接依赖 EquipmentService 事件。
   */
  private _registerLoadoutChangedListener(): void {
    if (this._loadoutChangedListener) return;

    this._loadoutChangedListener = (): void => {
      this._formationSystem.recalculateAllPower();
    };
    this._eventManager.on(
      EquipmentEvent.LOADOUT_CHANGED,
      this._loadoutChangedListener,
      this,
    );
    console.log('[Coordinator][A5] LOADOUT_CHANGED 监听已注册');
  }

  private _unregisterLoadoutChangedListener(): void {
    if (!this._loadoutChangedListener) return;
    this._eventManager.off(
      EquipmentEvent.LOADOUT_CHANGED,
      this._loadoutChangedListener,
      this,
    );
    this._loadoutChangedListener = null;
  }

  /**
   * [C1.5.9-G-B1-A7] 监听账号等级变化事件。
   *
   * 规则：
   * - 战斗结算中：仅执行章节重判，不落盘
   * - 非战斗结算：章节重判 + changed 时保存
   */
  private _registerPlayerLevelChangedListener(): void {
    if (this._playerLevelChangedListener) return;

    this._playerLevelChangedListener = (data: unknown): void => {
      const eventData = data as PlayerLevelChangedEventData;
      if (!eventData || !Number.isFinite(eventData.newLevel)) return;

      console.log(
        `[Coordinator][A7] PLAYER_LEVEL_CHANGED: ` +
        `Lv${eventData.oldLevel} → Lv${eventData.newLevel}, ` +
        `settlementInProgress=${this._isBattleSettlementInProgress}, ` +
        `source=${eventData.source}`,
      );

      if (!this._chapterSystem.isInitialized()) {
        return;
      }

      const context = this._buildStageCompletionContext();
      const changed = this._chapterSystem.reevaluateUnlockConditions(context);

      if (changed) {
        console.log(`[Coordinator][A7] 等级变化触发章节重判产生新解锁`);
        // 结算中不保存，由结算尾统一落盘
        if (!this._isBattleSettlementInProgress) {
          this._phase9Bootstrap.saveAll();
        } else {
          console.log(`[Coordinator][A7] 结算中跳过保存，由结算尾统一落盘`);
        }
      }
    };

    this._eventManager.on(
      ProgressSystem.PLAYER_LEVEL_CHANGED,
      this._playerLevelChangedListener,
      this,
    );

    console.log('[Coordinator][A7] PLAYER_LEVEL_CHANGED 监听已注册');
  }

  /** 注销账号等级变化监听 */
  private _unregisterPlayerLevelChangedListener(): void {
    if (!this._playerLevelChangedListener) return;
    this._eventManager.off(
      ProgressSystem.PLAYER_LEVEL_CHANGED,
      this._playerLevelChangedListener,
      this,
    );
    this._playerLevelChangedListener = null;
  }

  // ================================================================
  // 内部 — 章节解锁重判（C1.5.9-B1-A2）
  // ================================================================

  /**
   * [C1.5.9-G-B1-A5] 构建 StageCompletionContext。
   *
   * playerLevel 来自 ProgressSystem 运行期内存（初始化完成后的权威来源），
   * totalPower 来自 FormationSystem PVE 阵容当前 teamPower。
   *
   * 禁止使用 SaveManager 存档副本作为实时权威来源。
   */
  private _buildStageCompletionContext(): StageCompletionContext {
    const playerProgress = ProgressSystem.getInstance().getPlayerProgressData();
    const playerLevel = playerProgress?.playerLevel ?? 1;

    const pvePreset = this._formationSystem.getActivePreset('pve');
    const totalPower = pvePreset ? pvePreset.teamPower : 0;

    return { playerLevel, totalPower };
  }

  /**
   * [C1.5.9-B1-A2] 统一章节条件重判入口。
   *
   * 调用 ChapterSystem.reevaluateUnlockConditions()，如果产生新解锁状态则触发保存。
   *
   * @param trigger  触发来源（仅用于日志）
   */
  private _reevaluateChapterConditions(trigger: string): void {
    if (!this._chapterSystem.isInitialized()) {
      console.log(`[Coordinator][A5] 重判跳过（ChapterSystem 未初始化）: trigger=${trigger}`);
      return;
    }

    const context = this._buildStageCompletionContext();

    console.log(
      `[Coordinator][A5] 触发章节重判: trigger=${trigger}, ` +
      `playerLevel=${context.playerLevel}, totalPower=${context.totalPower}`,
    );

    const changed = this._chapterSystem.reevaluateUnlockConditions(context);

    if (changed) {
      console.log(`[Coordinator][A5] 重判产生新解锁状态，触发保存: trigger=${trigger}`);
      this._phase9Bootstrap.saveAll();
    }
  }

  private async _onBattleFinished(result: BattleResult): Promise<void> {
    // 校验是否是当前战斗
    if (result.stageId !== this._currentBattleStageId) {
      console.log(
        `[Step12A-B][Coordinator] 忽略非当前战斗事件: ` +
        `received=${result.stageId} current=${this._currentBattleStageId}`,
      );
      return;
    }

    // 状态检查 — 防止同帧重入
    if (this._state !== 'running') {
      console.log(
        `[Step12A-B][Coordinator] 忽略重复战斗结束事件: state=${this._state}`,
      );
      return;
    }

    this._state = 'settling';

    // [C1.6-B1-B-R6-A1] 从战斗启动前缓存的 _currentStageConfig 直接读取权威 chapterId，
    // 不得通过 chapterStageId 字符串格式推导。
    this._lastResultChapterId = this._currentStageConfig?.chapterId ?? null;

    // [C1.5.9-G-B1-A7] 重置账号经验追踪（防止旧数据残留到非胜利路径）
    this._accountExpGained = 0;
    this._accountLevelBefore = 0;
    this._accountLevelAfter = 0;

    console.log(
      `[Step12A-B][Coordinator] 收到战斗结束: stageId=${result.stageId}, ` +
      `victory=${result.isVictory}, expGain=${result.expGain}, goldGain=${result.goldGain}`,
    );

    // [Step12A-C1.1][RuntimeDiag] 战斗结果详情
    console.log(
      `[Step12A-C1.1][RuntimeDiag] BattleResult: resultType=${result.resultType}, ` +
      `round=${result.round}, elapsedTimeMs=${result.elapsedTimeMs}, ` +
      `killedEnemies=${result.killedEnemyIds.length}, ` +
      `rewards=${result.rewards.length}`,
    );

    // 非胜利 → 不结算
    if (!result.isVictory) {
      this._lastResult = {
        success: false,
        isDuplicate: false,
        chapterStageId: this._currentChapterStageId,
        battleStageId: this._currentBattleStageId,
        transactionId: this._currentTransactionId,
        goldGain: 0,
        expGain: 0,
        rewardSummary: '',
        rewardItems: [],
        powerBefore: this._powerBefore,
        powerAfter: this._powerBefore,
        expBefore: this._expBefore,
        expAfter: this._expBefore,
        chapterCompleted: false,
        nextStageUnlocked: '',
        message: '战斗失败',
      };
      this._state = 'failed';
      this._setChallengeButtonInteractable(true);
      this._renderLastResultToLabel();
      this._refreshCurrentStageDisplay();
      console.log('[Step12A-B][Coordinator] 战斗失败，不发放奖励');
      return;
    }

    // 胜利 → 结算
    try {
      // [C1.5.9-G-B1-A7] 标记结算进行中
      this._isBattleSettlementInProgress = true;
      this._accountExpGained = 0;
      const progressBefore = ProgressSystem.getInstance().getPlayerProgressData();
      this._accountLevelBefore = progressBefore.playerLevel;

      // ================================================================
      // [C1.5.9-G-B1-A7-A3-R2] 首通奖励缺口修复
      // 在 completeStage() 之前以 ChapterSystem.isStageCompleted()
      // 作为权威首通判定来源。
      // ================================================================
      const isFirstClear = !this._chapterSystem.isStageCompleted(
        this._currentChapterStageId,
      );

      if (isFirstClear) {
        // --- R2-Fix1: 接入 firstDropId（首通掉落池）---
        const stageDataCfg = this._configManager.getConfig<StageDataConfig>(
          'config/stages/stage_data',
        );
        if (stageDataCfg?.data) {
          const battleStage = stageDataCfg.data.find(
            (s) => s.id === this._currentBattleStageId,
          );
          if (battleStage?.firstDropId) {
            const firstDropRewards = this._battleManager.resolveDropById(
              battleStage.firstDropId,
            );
            if (firstDropRewards.length > 0) {
              for (const reward of firstDropRewards) {
                result.rewards.push(reward);
                if (reward.itemType === 'exp') {
                  result.expGain += reward.count;
                } else if (reward.itemType === 'gold') {
                  result.goldGain += reward.count;
                }
              }
              console.log(
                `[Coordinator][R2] firstDropId=${battleStage.firstDropId}, ` +
                `追加 ${firstDropRewards.length} 条首通奖励`,
              );
            }
          } else {
            console.log(
              `[Coordinator][R2] battleStage=${this._currentBattleStageId} ` +
              `无 firstDropId，跳过首通掉落`,
            );
          }
        }

        // --- R2-Fix2: 发放章节金币（chapter_data.json stage.rewards type=gold）---
        const chapterStageConfig = this._chapterSystem.getStage(
          this._currentChapterStageId,
        );
        if (chapterStageConfig?.rewards) {
          const goldRewards = chapterStageConfig.rewards.filter(
            (r) => r.type === 'gold',
          );
          for (const gr of goldRewards) {
            const amount = gr.amount;
            if (Number.isFinite(amount) && amount > 0 && Number.isInteger(amount)) {
              result.rewards.push({
                itemId: 'ITEM_GOLD',
                itemType: 'gold',
                count: amount,
                source: 'first_clear',
              });
              result.goldGain += amount;
              console.log(
                `[Coordinator][R2] chapter gold: stageId=${this._currentChapterStageId}, ` +
                `amount=+${amount}`,
              );
            }
          }
          if (goldRewards.length === 0) {
            console.log(
              `[Coordinator][R2] chapterStage=${this._currentChapterStageId} ` +
              `无 type=gold 奖励条目`,
            );
          }
        } else {
          console.log(
            `[Coordinator][R2] chapterStage=${this._currentChapterStageId} ` +
            `无 rewards 配置`,
          );
        }
      } else {
        console.log(
          `[Coordinator][R2] stageId=${this._currentChapterStageId} 非首通，` +
          `跳过 firstDropId 与 chapter gold`,
        );
      }
      // ================================================================

      // 1. RewardSettlement 结算（含 transactionId 幂等）
      const settleOptions: SettlementOptions = {
        transactionId: this._currentTransactionId,
      };

      const settleResult = this._rewardSettlement.settleBattleReward(
        result,
        settleOptions,
      );

      console.log(
        `[Step12A-B][Coordinator] RewardSettlement transactionId=${settleResult.transactionId}, ` +
        `success=${settleResult.success}, isDuplicate=${settleResult.isDuplicate}`,
      );

      if (settleResult.isDuplicate) {
        console.log(
          `[Step12A-B][Coordinator] 重复 transactionId，跳过经验/章节推进: ` +
          `transactionId=${this._currentTransactionId}`,
        );
        this._state = 'failed';
        this._setChallengeButtonInteractable(true);
        this._renderLastResultToLabel();
        this._refreshCurrentStageDisplay();
        this._lastResult = {
          success: false,
          isDuplicate: true,
          chapterStageId: this._currentChapterStageId,
          battleStageId: this._currentBattleStageId,
          transactionId: this._currentTransactionId,
          goldGain: result.goldGain,
          expGain: result.expGain,
          rewardSummary: '',
          rewardItems: [],
          powerBefore: this._powerBefore,
          powerAfter: this._powerBefore,
          expBefore: this._expBefore,
          expAfter: this._expBefore,
          chapterCompleted: false,
          nextStageUnlocked: '',
          message: '重复事务，已拦截',
        };
        return;
      }

      // 2. 提取 exp 并分配给上阵英雄
      const totalExpGain = result.expGain;
      if (totalExpGain > 0) {
        const pvePreset = this._formationSystem.getActivePreset('pve');
        if (pvePreset) {
          this._distributeExpToFormation(pvePreset.slots, totalExpGain);
        }
      }

      // 3. 记录 exp after
      const pvePresetAfter = this._formationSystem.getActivePreset('pve');
      if (pvePresetAfter) {
        this._expAfter = this._sumFormationExp(pvePresetAfter.slots);
      } else {
        this._expAfter = this._expBefore;
      }

      console.log(
        `[Step12A-B][Coordinator] exp 分配完成: before=${this._expBefore} after=${this._expAfter}`,
      );

      // 4. 刷新战力
      this._formationSystem.recalculateAllPower();
      const refreshedPreset = this._formationSystem.getActivePreset('pve');
      this._powerAfter = refreshedPreset ? refreshedPreset.teamPower : this._powerBefore;

      console.log(
        `[Step12A-B][Coordinator] power 刷新: before=${this._powerBefore} after=${this._powerAfter}`,
      );

      // 5. 推进章节（附带玩家等级与总战力用于条件重判）
      const unlockContext = this._buildStageCompletionContext();
      const chapterCompleted = this._chapterSystem.completeStage(
        this._currentChapterStageId,
        unlockContext,
      );

      console.log(
        `[Step12A-B][Coordinator] Chapter complete: stageId=${this._currentChapterStageId}, ` +
        `result=${chapterCompleted}`,
      );

      // [C1.5.9-G-B1-A7] 首次完成时发放账号经验
      if (chapterCompleted) {
        const stageConfig = this._chapterSystem.getStage(this._currentChapterStageId);
        if (stageConfig) {
          this._accountExpGained = this._readAndAwardAccountExp(stageConfig);
        }
      }
      // 读取最终账号等级（可能因 addPlayerExp 而变化）
      this._accountLevelAfter = ProgressSystem.getInstance().getPlayerProgressData().playerLevel;

      // [C1.6-B1] 使用当前权威章节 ID 获取推进后的上下文
      const nextChapterId = this._chapterSystem.getCurrentChapterId();
      const nextStage = nextChapterId
        ? this._chapterSystem.getCurrentStage(nextChapterId)
        : null;
      const nextStageId = nextStage ? nextStage.id : '';

      // 6. 保存
      this._phase9Bootstrap.saveAll();
      const saveSucceeded = this._saveManager.save();
      const savedHero = this._saveManager.loadHeroData()?.heroStates['hero_001'];

      console.log('[Step12A-B][Coordinator] saveAll + save 完成');
      console.log(
        `[Step12A-C1.5][HeroExpDiag] saveAll+save done, ` +
        `success=${saveSucceeded}, hero_001 level=${savedHero?.level ?? -1}, ` +
        `exp=${savedHero?.exp ?? -1}, power=${savedHero?.power ?? -1}, ` +
        `unlocked=${savedHero?.unlocked ?? false}`,
      );

      // 7. 构建 lastResult
      // [C1.4.1] 从 BattleResult.rewards 提取非金币/经验的奖励项
      const rewardItems: RewardDisplayItem[] = [];
      for (const reward of result.rewards) {
        if (reward.itemType === 'gold' || reward.itemType === 'exp') {
          continue; // 已在 goldGain/expGain 中单独展示
        }
        // 合并同 itemId 的数量
        const existing = rewardItems.find((ri) => ri.itemId === reward.itemId);
        if (existing) {
          existing.count += reward.count;
        } else {
          rewardItems.push({ itemId: reward.itemId, count: reward.count });
        }
      }

      this._lastResult = {
        success: true,
        isDuplicate: false,
        chapterStageId: this._currentChapterStageId,
        battleStageId: this._currentBattleStageId,
        transactionId: this._currentTransactionId,
        goldGain: result.goldGain,
        expGain: totalExpGain,
        rewardSummary: rewardItems.map((ri) => `${ri.itemId}=${ri.count}`).join(', '),
        rewardItems,
        powerBefore: this._powerBefore,
        powerAfter: this._powerAfter,
        expBefore: this._expBefore,
        expAfter: this._expAfter,
        chapterCompleted: chapterCompleted,
        nextStageUnlocked: nextStageId,
        message: settleResult.success
          ? '结算完成'
          : `结算警告: ${settleResult.reason ?? 'unknown'}`,
      };

      this._state = 'settled';
      this._setChallengeButtonInteractable(true);

      this._renderLastResultToLabel();

      this._refreshCurrentStageDisplay();

      // [C1.5] 更新英雄信息标签（经验/等级变化后刷新显示）
      this._updateHeroInfoLabel();

      console.log(
        `[Step12A-B][Coordinator] 关卡闭环完成: state=settled, stage=${this._currentChapterStageId}, ` +
        `goldGain=${result.goldGain}, expGain=${totalExpGain}`,
      );
    } catch (err) {
      console.error('[Step12A-B][Coordinator] 结算流程异常:', err);
      this._state = 'failed';
      this._setChallengeButtonInteractable(true);
      this._renderLastResultToLabel();
      this._refreshCurrentStageDisplay();
      this._lastResult = {
        success: false,
        isDuplicate: false,
        chapterStageId: this._currentChapterStageId,
        battleStageId: this._currentBattleStageId,
        transactionId: this._currentTransactionId,
        goldGain: result.goldGain,
        expGain: result.expGain,
        rewardSummary: '',
        rewardItems: [],
        powerBefore: this._powerBefore,
        powerAfter: this._powerBefore,
        expBefore: this._expBefore,
        expAfter: this._expBefore,
        chapterCompleted: false,
        nextStageUnlocked: '',
        message: `异常: ${String(err)}`,
      };
    } finally {
      // [C1.5.9-G-B1-A7] 确保结算标记在任何退出路径都恢复
      this._isBattleSettlementInProgress = false;
    }
  }

  // ================================================================
  // 内部 — 阵容确保
  // ================================================================

  /**
   * 确保 PVE 阵容可用。
   *
   * 检查 HeroSystem 中是否有已解锁英雄：
   * - 有 → 使用 FormationSystem.refillEmptyPresets() 回填
   * - 无 → 从 global_const 读取 initialHeroId，调用 HeroSystem.unlockHero()
   *         解锁，然后回填阵容
   *
   * @returns 是否最终可生成非空阵容
   */
  private _ensurePlayableFormation(): boolean {
    const unlockedHeroes = this._heroSystem.getUnlockedHeroes();

    if (unlockedHeroes.length > 0) {
      console.log(
        `[Step12A-B][Coordinator] 已有 ${unlockedHeroes.length} 名已解锁英雄`,
      );
      this._formationSystem.refillEmptyPresets();
      return this._verifyFormationNonEmpty();
    }

    // 无英雄 → 读取 initialHeroId 并解锁
    console.log('[Step12A-B][InitialHero] 无已解锁英雄，准备使用 initialHeroId fallback');

    const initialHeroId = this._getInitialHeroId();
    if (!initialHeroId) {
      console.error('[Step12A-B][InitialHero] 无法获取 initialHeroId，全局配置缺失');
      return false;
    }

    console.log(`[Step12A-B][InitialHero] 解锁初始英雄: ${initialHeroId}`);
    const unlocked = this._heroSystem.unlockHero(initialHeroId);
    if (!unlocked) {
      console.warn(
        `[Step12A-B][InitialHero] 解锁失败（可能已解锁）: ${initialHeroId}`,
      );
    }

    // 回填阵容
    this._formationSystem.refillEmptyPresets();

    return this._verifyFormationNonEmpty();
  }

  /**
   * 检查 PVE 阵容是否有至少一个非空槽位。
   */
  private _verifyFormationNonEmpty(): boolean {
    const preset = this._formationSystem.getActivePreset('pve');
    if (!preset) {
      console.warn('[Step12A-B][Coordinator] PVE 激活阵容不存在');
      return false;
    }
    const filledSlots = preset.slots.filter((s) => s.heroId !== null).length;
    if (filledSlots === 0) {
      console.warn('[Step12A-B][Coordinator] PVE 阵容所有槽位为空');
      return false;
    }
    return true;
  }

  // ================================================================
  // 内部 — exp 分配
  // ================================================================

  /**
   * 将战斗经验均分给当前 PVE 阵容上阵英雄。
   *
   * 规则：均分，余数给第一个上阵英雄。
   * 使用 HeroSystem.addHeroExp() 公开 API。
   *
   * @param slots     PVE 阵容槽位
   * @param totalExp  总经验值
   */
  private _distributeExpToFormation(
    slots: ReadonlyArray<{ heroId: string | null }>,
    totalExp: number,
  ): void {
    const heroIds = slots
      .filter((s) => s.heroId !== null)
      .map((s) => s.heroId as string);

    if (heroIds.length === 0) return;

    const perHero = Math.floor(totalExp / heroIds.length);
    const remainder = totalExp - perHero * heroIds.length;

    // [C1.5] 记录 hero_001 加经验前的等级快照
    const hero001Before = this._heroSystem.getHero('hero_001');
    this._heroLevelBefore = hero001Before ? hero001Before.level : 0;
    console.log(
      `[Step12A-C1.5][HeroExpDiag] expGain=${totalExp}, perHero=${perHero}, ` +
      `heroCount=${heroIds.length}, ` +
      `hero_001 levelBefore=${this._heroLevelBefore}, expBefore=${hero001Before?.exp ?? -1}`,
    );

    for (let i = 0; i < heroIds.length; i++) {
      const exp = perHero + (i === 0 ? remainder : 0);
      if (exp > 0) {
        const heroBefore = this._heroSystem.getHero(heroIds[i]);
        const levelBefore = heroBefore?.level ?? -1;
        const expBefore = heroBefore?.exp ?? -1;

        const levelUps = this._heroSystem.addHeroExp(heroIds[i], exp);

        const heroAfter = this._heroSystem.getHero(heroIds[i]);
        const levelAfter = heroAfter?.level ?? -1;
        const expAfter = heroAfter?.exp ?? -1;

        console.log(
          `[Step12A-B][Coordinator] HeroSystem.addHeroExp: heroId=${heroIds[i]}, ` +
          `exp=${exp}, levelUps=${levelUps}`,
        );
        console.log(
          `[Step12A-C1.5][HeroExpDiag] heroId=${heroIds[i]}, ` +
          `levelBefore=${levelBefore}, expBefore=${expBefore}, ` +
          `expGain=${exp}, ` +
          `levelAfter=${levelAfter}, expAfter=${expAfter}, ` +
          `levelUp=${levelUps > 0 ? `YES (Lv${levelBefore}→Lv${levelAfter})` : 'NO'}`,
        );
      }
    }

    // [C1.5] 记录 hero_001 加经验后的等级
    const hero001After = this._heroSystem.getHero('hero_001');
    this._heroLevelAfter = hero001After ? hero001After.level : this._heroLevelBefore;
  }

  /**
   * 计算阵容中所有英雄的总经验值（用于 before/after 对比）。
   */
  private _sumFormationExp(
    slots: ReadonlyArray<{ heroId: string | null }>,
  ): number {
    let total = 0;
    for (const slot of slots) {
      if (slot.heroId === null) continue;
      const hero = this._heroSystem.getHero(slot.heroId);
      if (hero) {
        total += hero.exp;
      }
    }
    return total;
  }

  /**
   * [C1.5.9-G-B1-A7] 从关卡配置读取 player_exp 并发放账号经验。
   *
   * 规则：
   * - 每个 stage 允许 0 或 1 个 player_exp 条目
   * - 多条目 → 记录错误，不发放
   * - amount 无效 → 记录错误，不发放
   * - 调用 ProgressSystem.addPlayerExp()
   *
   * @param stageConfig  关卡配置
   * @returns            实际发放的账号经验值（0 表示未发放）
   */
  private _readAndAwardAccountExp(stageConfig: import('../chapter/ChapterTypes').StageConfig): number {
    const TAG = '[Coordinator][A7]';

    if (!stageConfig.rewards || stageConfig.rewards.length === 0) {
      console.log(`${TAG} _readAndAwardAccountExp: stageId=${stageConfig.id}, 无奖励条目`);
      return 0;
    }

    // 找到 type=exp, id=player_exp 的条目
    const playerExpRewards = stageConfig.rewards.filter(
      (r) => r.type === 'exp' && r.id === 'player_exp',
    );

    if (playerExpRewards.length === 0) {
      console.log(`${TAG} _readAndAwardAccountExp: stageId=${stageConfig.id}, 无 player_exp 条目`);
      return 0;
    }

    if (playerExpRewards.length > 1) {
      console.error(
        `${TAG} _readAndAwardAccountExp: stageId=${stageConfig.id}, ` +
        `player_exp 条目数=${playerExpRewards.length}（应为0或1），配置错误，不发放`,
      );
      return 0;
    }

    const reward = playerExpRewards[0];
    const amount = reward.amount;

    // 校验 amount
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isInteger(amount)
    ) {
      console.error(
        `${TAG} _readAndAwardAccountExp: stageId=${stageConfig.id}, ` +
        `player_exp amount 无效 (${amount})，不发放`,
      );
      return 0;
    }

    if (amount === 0) {
      console.log(`${TAG} _readAndAwardAccountExp: stageId=${stageConfig.id}, player_exp=0，跳过`);
      return 0;
    }

    console.log(
      `${TAG} _readAndAwardAccountExp: stageId=${stageConfig.id}, ` +
      `player_exp=${amount}`,
    );

    const progressSystem = ProgressSystem.getInstance();
    const result = progressSystem.addPlayerExp(
      amount,
      `main_stage_complete:${stageConfig.id}`,
    );

    console.log(
      `${TAG} addPlayerExp 结果: Lv${result.oldLevel}(${result.oldExp}) → ` +
      `Lv${result.newLevel}(${result.newExp}), ` +
      `levelsGained=${result.levelsGained}, reachedMax=${result.reachedMaxLevel}`,
    );

    // 更新等级追踪
    this._accountLevelAfter = result.newLevel;

    return result.expAdded;
  }

  // ================================================================
  // 内部 — 配置读取
  // ================================================================

  /**
   * [C1.6-B1] 解析当前章节进度上下文（统一入口）。
   *
   * challengeFirstStage() 和 _refreshCurrentStageDisplay() 共用此方法，
   * 禁止初始化显示和点击挑战各写一套不同的关卡推断逻辑。
   *
   * 返回的 displayIndex / stageName 可用于按钮和 resultLabel 文案；
   * stageConfig / battleStageId 供战斗启动使用。
   *
   * 解析顺序：
   *   1. 确认 ChapterSystem 已经初始化
   *   2. 调用 ChapterSystem.getCurrentChapterId()
   *   3. 当前章节 ID 为空时返回不可挑战上下文
   *   4. 调用 ChapterSystem.getCurrentStage(chapterId)
   *   5. 当前关卡不存在时返回不可挑战上下文
   *   6. 校验 stageConfig.chapterId === chapterId
   *   7. 读取并 trim stageConfig.battleStageId
   *   8. 不读取静态 Map
   *   9. 不推导战斗关卡 ID
   */
  private _resolveCurrentStageContext(): CurrentStageContext {
    // 1. 确认 ChapterSystem 已经初始化
    if (!this._chapterSystem.isInitialized()) {
      return {
        stageConfig: null,
        displayIndex: null,
        stageName: null,
        chapterStageId: null,
        battleStageId: null,
        chapterId: null,
        chapterIndex: null,
      };
    }

    // 2. 调用 ChapterSystem.getCurrentChapterId()
    const chapterId = this._chapterSystem.getCurrentChapterId();

    // 3. 当前章节 ID 为空时返回不可挑战上下文
    if (!chapterId) {
      return {
        stageConfig: null,
        displayIndex: null,
        stageName: null,
        chapterStageId: null,
        battleStageId: null,
        chapterId: null,
        chapterIndex: null,
      };
    }

    // 4. 调用 ChapterSystem.getCurrentStage(chapterId)
    const stageConfig = this._chapterSystem.getCurrentStage(chapterId);

    // 5. 当前关卡不存在时返回不可挑战上下文
    if (!stageConfig) {
      return {
        stageConfig: null,
        displayIndex: null,
        stageName: null,
        chapterStageId: null,
        battleStageId: null,
        chapterId,
        chapterIndex: this._resolveChapterIndex(chapterId),
      };
    }

    // 6. 校验 stageConfig.chapterId === chapterId（归属校验）
    if (stageConfig.chapterId !== chapterId) {
      console.error(
        `[Coordinator][C1.6-B1] 归属校验失败: ` +
        `stageConfig.chapterId=${stageConfig.chapterId} !== expected=${chapterId}, ` +
        `chapterStageId=${stageConfig.id}`,
      );
      return {
        stageConfig: null,
        displayIndex: null,
        stageName: null,
        chapterStageId: null,
        battleStageId: null,
        chapterId,
        chapterIndex: this._resolveChapterIndex(chapterId),
      };
    }

    // 7-9. 读取并 trim stageConfig.battleStageId（不读取静态 Map，不推导）
    const battleStageId = this._resolveBattleStageId(stageConfig);

    return {
      stageConfig,
      displayIndex: stageConfig.stageIndex,
      stageName: stageConfig.name || null,
      chapterStageId: stageConfig.id,
      battleStageId,
      chapterId,
      chapterIndex: this._resolveChapterIndex(chapterId),
    };
  }

  /**
   * [C1.6-B1] 从 chapter stage 解析 battle stage ID。
   * 仅使用显式配置的 battleStageId；不使用静态映射表，不推导。
   * 缺失、空字符串、仅空白字符 → null（闭锁）。
   */
  private _resolveBattleStageId(stageConfig: StageConfig): string | null {
    const raw = stageConfig.battleStageId;
    if (!raw) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * [C1.6-B1-B-R1] 将章节序号（number）转为中文数字字符串。
   *
   * 用于多章节文案显示（如 chapterIndex=2 → "二"）。
   * 支持 1～99；超出范围时返回阿拉伯数字字符串。
   */
  private static _chapterIndexToChineseDisplay(n: number): string {
    if (n <= 0 || n > 99 || !Number.isInteger(n)) return String(n);
    const ones = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const t = Math.floor(n / 10);
    const o = n % 10;
    let result = '';
    if (t === 1) result += '十';
    else if (t > 1) result += ones[t] + '十';
    if (o > 0) result += ones[o];
    return result || '零';
  }

  /**
   * [C1.6-B1-B-R3] 将中文数字字符串解析为阿拉伯数字。
   *
   * 与 _chapterIndexToChineseDisplay 互为逆操作。
   * 支持 "一"～"九十九"；无法解析时返回 null。
   * 内部使用，不暴露为 public。
   */
  private static _parseChineseNumber(s: string): number | null {
    if (!s || s.length === 0) return null;
    const digitMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9,
    };

    let result = 0;
    let i = 0;

    // "X十" or "X十Y" (X = 2-9)
    if (i < s.length && digitMap[s[i]] !== undefined) {
      const d = digitMap[s[i]];
      if (i + 1 < s.length && s[i + 1] === '十') {
        result += d * 10;
        i += 2;
        if (i < s.length && digitMap[s[i]] !== undefined) {
          result += digitMap[s[i]];
          i++;
        }
      } else {
        result += d;
        i++;
      }
    } else if (i < s.length && s[i] === '十') {
      // "十" or "十Y"
      result += 10;
      i++;
      if (i < s.length && digitMap[s[i]] !== undefined) {
        result += digitMap[s[i]];
        i++;
      }
    } else {
      return null;
    }

    if (i !== s.length) return null;
    if (result < 1 || result > 99) return null;
    return result;
  }

  /**
   * [C1.6-B1-B-R3] 识别冗余关卡名称。
   *
   * 当名称仅重复关卡序号，不含独立语义时返回 true。
   * 冗余模式: "第N关", "第N关卡"（N 为中文或阿拉伯数字）。
   *
   * 不匹配的模式: "第一章终", "第十关·天劫之门", "毒蜂王" — 这些含独立语义。
   *
   * 通用规则，不硬编码具体关卡。
   */
  private static _isRedundantStageName(stageIndex: number, name: string): boolean {
    if (!name || name.length === 0) return false;
    if (name.length > 10) return false;  // 安全上限

    // 必须以 "第" 开头
    if (!name.startsWith('第')) return false;

    const afterDi = name.substring(1);

    // 尝试后缀 "关卡" 和 "关"
    for (const suffix of ['关卡', '关']) {
      if (afterDi.endsWith(suffix) && afterDi.length > suffix.length) {
        const numPart = afterDi.substring(0, afterDi.length - suffix.length);
        if (numPart.length === 0) continue;

        // 先尝试阿拉伯数字
        const arabic = parseInt(numPart, 10);
        if (!isNaN(arabic) && String(arabic) === numPart && arabic === stageIndex) {
          return true;
        }

        // 再尝试中文数字
        const parsed = Phase10MainGameplayCoordinator._parseChineseNumber(numPart);
        if (parsed !== null && parsed === stageIndex) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * [C1.6-B1-B-R1] 基于权威 chapterId 获取章节序号。
   *
   * 仅用于 UI 文案；禁止用于战斗映射、章节选择或业务权威来源。
   */
  private _resolveChapterIndex(chapterId: string | null): number | null {
    if (!chapterId) return null;
    const chapter = this._chapterSystem.getChapter(chapterId);
    return chapter?.chapterIndex ?? null;
  }

  /**
   * [C1.6-B1-B-R1] 生成章节感知的关卡显示文案。
   *
   * - 第一章（chapterIndex === 1 或 null）：使用现有 "第 X 关" 格式
   * - 多章节（chapterIndex > 1）：使用 "第{CN}章第{index}关" 格式
   *
   * 仅用于按钮文案和未接入提示，不得用于战斗映射。
   */
  private _formatStageDisplayForChapter(ctx: CurrentStageContext): string {
    if (ctx.displayIndex === null) return '关卡';
    const chapterIndex = ctx.chapterIndex;
    if (chapterIndex === null || chapterIndex === 1) {
      // 第一章：保持现有格式，不显示章节号
      return `第 ${ctx.displayIndex} 关`;
    }
    // 多章节：显示章节号
    const cn = Phase10MainGameplayCoordinator._chapterIndexToChineseDisplay(chapterIndex);
    return `第${cn}章第${ctx.displayIndex}关`;
  }

  /**
   * [C1.6-B1-B-R4] 生成紧凑关卡显示文案（用于按钮和短提示场景）。
   *
   * - 第一章（chapterIndex === 1 或 null）：使用 "第 X 关" 格式（与 _formatStageDisplayForChapter 一致）
   * - 多章节（chapterIndex > 1）：使用 "第{CN}章·{N}关" 格式
   *
   * 比 _formatStageDisplayForChapter 更紧凑：用 "·" 替代中间的 "第"，
   * 专为按钮宽度受限和结果区域短提示场景设计。
   * 通用多章节规则，不硬编码具体章节。
   */
  private _formatCompactStageDisplayForChapter(ctx: CurrentStageContext): string {
    if (ctx.displayIndex === null) return '关卡';
    const chapterIndex = ctx.chapterIndex;
    if (chapterIndex === null || chapterIndex === 1) {
      // 第一章：保持 "第 X 关" 格式
      return `第 ${ctx.displayIndex} 关`;
    }
    // 多章节：紧凑格式 "第{CN}章·{N}关"
    const cn = Phase10MainGameplayCoordinator._chapterIndexToChineseDisplay(chapterIndex);
    return `第${cn}章·${ctx.displayIndex}关`;
  }

  /**
   * 从 global_const 读取 initialHeroId。
   */
  private _getInitialHeroId(): string {
    try {
      const globalCfg = this._configManager.getConfig<GlobalConstConfig>(
        'config/systems/global_const',
      );
      if (!globalCfg?.data) return '';

      const playerEntry = globalCfg.data.find(
        (e): e is GlobalPlayerEntry => e.id === 'GLOBAL_PLAYER',
      );
      return playerEntry?.initialHeroId ?? '';
    } catch {
      return '';
    }
  }

  // ================================================================
  // 内部 — [C1.5.8-B3] 当前关卡显示文案（统一 context 驱动）
  // ================================================================

  /**
   * [C1.5.8-B] 格式化关卡显示文本（紧凑模式，含长度限制）。
   * 有名称且总长≤8字时返回 "第 X 关·关卡名"，否则返回 "第 X 关"。
   * 用于按钮状态或紧凑 UI 场景；不应用于战斗结算标题。
   */
  private _formatStageDisplayText(stageConfig: StageConfig): string {
    const num = stageConfig.stageIndex;
    const name = stageConfig.name;
    if (name && name.length > 0) {
      const combined = `第 ${num} 关·${name}`;
      return combined.length <= 8 ? combined : `第 ${num} 关`;
    }
    return `第 ${num} 关`;
  }

  /**
   * [C1.6-B1-B-R2] 格式化战斗结算阶段标题（无长度限制）。
   *
   * 与 _formatStageDisplayText 不同，此方法不因按钮宽度或紧凑状态
   * 而截断章节终标题。优先使用 StageConfig 中已配置的正式关卡显示名称；
   * 配置名称为空时才安全回退为 "第 N 关"。
   *
   * 仅用于胜利/失败结果标题；不得用于战斗映射、章节选择或按钮文案。
   */
  private _formatBattleResultStageTitle(stageConfig: StageConfig): string {
    const num = stageConfig.stageIndex;
    const name = stageConfig.name;
    if (name && name.length > 0) {
      // [C1.6-B1-B-R3] 过滤冗余普通名称（如 "第八关卡" → 与序号重复，无独立语义）
      if (Phase10MainGameplayCoordinator._isRedundantStageName(num, name)) {
        return `第 ${num} 关`;
      }
      return `第 ${num} 关·${name}`;
    }
    return `第 ${num} 关`;
  }

  /**
   * [C1.5.8-B4] 短时重试初始化显示刷新。
   *
   * 修复 B3 缺陷：B3 只要 displayIndex !== null 就停止，导致 ChapterSystem
   * 默认第 1 关（存档尚未恢复时）被误认为最终结果。
   *
   * B4 策略：
   *   - 每次尝试都无条件调用 _refreshCurrentStageDisplay() 覆盖按钮和 resultLabel
   *   - 仅当 displayIndex > 1 时才提前停止（真实进度确认，非默认第 1 关）
   *   - displayIndex=1 或 null 时继续重试，最多 maxAttempts 次
   *   - 最后一次尝试无论 displayIndex 值如何都作为最终显示
   *   - 非轮询，有限次数，无性能风险
   */
  private _retryInitDisplay(attempt: number, maxAttempts: number): void {
    const ctx = this._resolveCurrentStageContext();

    // [C1.5.8-B4] 无条件覆盖显示：每次重试都刷新按钮和 resultLabel，
    // 确保后续读到真实进度时能覆盖之前的默认第 1 关显示。
    this._refreshCurrentStageDisplay();

    // [C1.5.8-B4] displayIndex=1 是可疑默认值（ChapterSystem 在存档恢复前
    // 可能返回 stage_01），必须继续重试等待真实进度。
    const isDefaultSuspect = ctx.displayIndex === 1;
    const isRealProgress = ctx.displayIndex !== null && ctx.displayIndex > 1;

    if (isRealProgress) {
      console.log(
        `[C1.5.8-B4] 初始化显示刷新成功（真实进度确认）: ` +
        `displayIndex=${ctx.displayIndex}, attempt=${attempt + 1}/${maxAttempts}`,
      );
      return;
    }

    if (attempt >= maxAttempts - 1) {
      // [C1.5.8-B4] 最终兜底：强制覆盖，无论 displayIndex 是什么
      console.log(
        `[C1.5.8-B4] 初始化显示刷新最终兜底: maxAttempts=${maxAttempts}, ` +
        `displayIndex=${ctx.displayIndex ?? 'null'}, ` +
        `isDefaultSuspect=${isDefaultSuspect}, 已强制覆盖`,
      );
      return;
    }

    console.log(
      `[C1.5.8-B4] 初始化显示未确认真实进度，继续重试: ` +
      `displayIndex=${ctx.displayIndex ?? 'null'}, ` +
      `isDefaultSuspect=${isDefaultSuspect}, ` +
      `attempt=${attempt + 1}/${maxAttempts}`,
    );

    this.scheduleOnce(() => {
      this._retryInitDisplay(attempt + 1, maxAttempts);
    }, 0.1);
  }

  /**
   * [C1.5.8-B3] 运行时覆盖挑战按钮子 Label 文本。
   *
   * 始终覆盖 Scene 默认文字，绝不残留"挑战首关"。
   * 不修改 Scene，仅通过 getComponentInChildren 获取 Label 后设置 string。
   * 获取不到 Label 时静默跳过，不影响战斗逻辑。
   */
  private _updateChallengeButtonLabel(context?: CurrentStageContext): void {
    if (!this.challengeButton) return;

    const label = this.challengeButton.node.getComponentInChildren(Label);
    if (!label) return;

    // [C1.6-B1-B-R6] 只有待确认结算结果跨越章节时，按钮才显示"继续"。
    // 同一章节内普通推进时直接显示当前待挑战关卡按钮文案。
    if (this._shouldConfirmChapterTransition(context)) {
      label.string = '继续';
      return;
    }

    const ctx = context ?? this._resolveCurrentStageContext();

    if (ctx.displayIndex !== null) {
      // [C1.6-B1-B-R4] 多章节按钮文案：
      // 第一章保持 "挑战第 X 关"；非第一章使用紧凑格式 "第{CN}章·{N}关"
      const chapterIndex = ctx.chapterIndex;
      if (chapterIndex === null || chapterIndex === 1) {
        const display = this._formatStageDisplayForChapter(ctx);
        label.string = `挑战${display}`;
      } else {
        label.string = this._formatCompactStageDisplayForChapter(ctx);
      }
    } else {
      // [C1.5.8-B3] 始终覆盖 Scene 默认文字，不留"挑战首关"
      label.string = '挑战关卡';
    }
  }

  /**
   * [C1.5.8-B3] 统一运行时显示刷新入口。
   *
   * 解析一次当前关卡上下文，同时刷新挑战按钮 Label 和 resultLabel。
   * 不修改 Scene，不修改 Prefab。
   */
  private _refreshCurrentStageDisplay(): void {
    const ctx = this._resolveCurrentStageContext();
    this._updateChallengeButtonLabel(ctx);
    // [C1.6-B1-B-R1] 仅当没有已渲染的战斗结果时才刷新结果标签，
    // 避免 settlement 后推进的下一关上下文覆盖本场结算标题。
    // _lastResult 非 null 表示 _onBattleFinished 已直接调用
    // _renderLastResultToLabel() 完成渲染。
    if (!this._lastResult && this._state !== 'running' && this._state !== 'settling') {
      this._renderLastResultToLabel(ctx);
    }
  }

  // ================================================================
  // 内部 — UI 交互（Step12A-C1）
  // ================================================================

  /**
   * 绑定挑战按钮点击事件，防止重复绑定。
   */
  private _bindChallengeButton(): void {
    if (!this.challengeButton) {
      console.warn('[Step12A-C1][Entry] challengeButton 未绑定，按钮点击将由 Scene 事件驱动');
      return;
    }
    this.challengeButton.node.on(Button.EventType.CLICK, this._onChallengeButtonClicked, this);
    console.log('[Step12A-C1][Entry] 按钮绑定完成');
  }

  /**
   * 解绑挑战按钮点击事件。
   */
  private _unbindChallengeButton(): void {
    if (!this.challengeButton) return;
    this.challengeButton.node.off(Button.EventType.CLICK, this._onChallengeButtonClicked, this);
    console.log('[Step12A-C1][Entry] 按钮解绑完成');
  }

  /**
   * 按钮点击回调。
   *
   * [C1.5.9-G-B1-A5] 在读取关卡状态前执行低频兜底：
   * 重算阵容战力 → 构建最新 context → 章节重判 → changed 时保存。
   * 这是挑战路径的低频安全检查，不替代装备事件桥的正式运行链。
   */
  private _onChallengeButtonClicked(): void {
    console.log('[Step12A-C1][Entry] 按钮点击 — 挑战前兜底');

    // [C1.6-B1-B-R6] 只有待确认结算结果跨越章节时，第一次点击才清理结算态，
    // 刷新为下一章关卡入口。同一章节内普通推进时不拦截，直接进入挑战流程。
    if (this._shouldConfirmChapterTransition()) {
      this._lastResult = null;
      this._lastResultChapterId = null;
      this._state = 'idle';
      this._setChallengeButtonInteractable(true);
      this._refreshCurrentStageDisplay();
      return;
    }

    // [C1.5.9-G-B2-A11] 准入预检（只读，必须位于战力重算、章节重判、saveAll 之前）
    // A10裁决：未满足条件时只读取当前关卡配置和权威装备实例，显示提示并返回。
    const preflightCtx = this._resolveCurrentStageContext();
    if (preflightCtx.stageConfig) {
      const blockMessage = this._getStageEntryBlockMessage(preflightCtx.stageConfig);
      if (blockMessage) {
        this._blockChallengeEntry(ERR_ENTRY_REQUIREMENT_NOT_MET, blockMessage);
        return;
      }
    }

    // 1. 兜底战力重算
    this._formationSystem.recalculateAllPower();

    // 2. 构建最新 context 并执行章节重判
    const context = this._buildStageCompletionContext();
    const changed = this._chapterSystem.reevaluateUnlockConditions(context);

    // 3. changed 时保存（幂等：如果 FORMATION_POWER_CHANGED 监听器已处理过，
    //    reevaluateUnlockConditions 返回 false，不会重复保存）
    if (changed) {
      console.log('[Coordinator][A5] 挑战前兜底发现新解锁状态，触发保存');
      this._phase9Bootstrap.saveAll();
    }

    // 4. 启动挑战
    const result = this.challengeFirstStage();
    if (!result.success) {
      console.warn('[Step12A-C1][Entry] 启动失败:', result.message);
    }
  }

  /**
   * 设置按钮可交互状态。
   */
  private _setChallengeButtonInteractable(interactable: boolean): void {
    if (!this.challengeButton) return;
    this.challengeButton.interactable = interactable;
    console.log(`[Step12A-C1][Entry] 按钮交互: ${interactable ? 'enabled' : 'disabled'} (state=${this._state})`);
  }

  // ===== [C1.4.1] 物品显示名映射 =====

  /** 物品 ID → 中文显示名静态映射（优先使用）。
   *  补充 operations_config.json ui.itemNames 之外的物品 ID。
   *  无法识别的 itemId 会在 fallback 中显示原始 ID + 数量。 */
  private static readonly ITEM_DISPLAY_NAME_MAP: Record<string, string> = {
    ITEM_GOLD: '金币',
    ITEM_EXP: '经验',
    ITEM_DIAMOND: '钻石',
    ITEM_EQUIPMENT_STONE: '强化石',
    ITEM_MAT_BREAK_001: '突破石',
    ITEM_MAT_STAR_001: '升星石',
    ITEM_GACHA_FRAG: '抽卡碎片',
    ITEM_EQUIP_N_001: '普通装备',
    ITEM_EQUIP_R_001: '稀有装备',
    ITEM_EQUIP_SR_001: '史诗装备',
  };

  /** 从 config 读取的运行时物品名称缓存（操作成功后填入） */
  private _configItemNames: Record<string, string> = {};

  /**
   * [C1.4.1] 获取物品的中文显示名。
   *
   * 优先级：
   *   1. operations_config.json → ui.itemNames（运行时加载）
   *   2. 静态 ITEM_DISPLAY_NAME_MAP
   *   3. fallback: 返回原始 itemId（保证不丢失）
   */
  private _getItemDisplayName(itemId: string): string {
    // 1. 优先从已缓存的 config 名称中查找
    if (this._configItemNames[itemId]) {
      return this._configItemNames[itemId];
    }

    // 2. 尝试从 ConfigManager 读取 operations_config
    try {
      const opsCfg = this._configManager.getConfig<{
        version: number;
        name: string;
        ui?: { itemNames?: Record<string, string> };
      }>('config/systems/operations_config');
      if (opsCfg?.ui?.itemNames) {
        this._configItemNames = opsCfg.ui.itemNames;
        if (this._configItemNames[itemId]) {
          return this._configItemNames[itemId];
        }
      }
    } catch {
      // config 不可用，使用静态 fallback
    }

    // 3. 静态映射
    if (Phase10MainGameplayCoordinator.ITEM_DISPLAY_NAME_MAP[itemId]) {
      return Phase10MainGameplayCoordinator.ITEM_DISPLAY_NAME_MAP[itemId];
    }

    // 4. fallback: 返回原始 itemId
    return itemId;
  }

  /**
   * 将 lastResult 渲染到 resultLabel。
   * [Step12A-C1.3] 使用多行文本避免单行穿出屏幕右侧。
   * [Step12A-C1.4.1] 补全所有奖励项展示（强化石、钻石、装备、材料等）。
   *
   * @param context  [C1.5.8-B3] 可选，预解析的关卡上下文（避免重复解析）
   */
  private _renderLastResultToLabel(context?: CurrentStageContext): void {
    if (!this.resultLabel) return;
    this._ensureResultLabelStyle();

    const ctx = context ?? this._resolveCurrentStageContext();

    if (!this._lastResult) {
      // [C1.5.8-B3] 从 context 直接生成 idle 文案，无需完整 StageConfig
      let idleText: string;
      if (ctx.displayIndex !== null) {
        if (ctx.stageName) {
          idleText = `准备挑战第 ${ctx.displayIndex} 关·${ctx.stageName}`;
        } else {
          idleText = `准备挑战第 ${ctx.displayIndex} 关`;
        }
      } else {
        idleText = '准备挑战';
      }
      this._updateResultLabel(idleText);
      return;
    }

    const r = this._lastResult;
    if (r.isDuplicate) {
      this._updateResultLabel('重复结算已拦截：\n资产和经验未重复增加');
    } else if (!r.success) {
      // [C1.5.9-G-B2-A2] 失败文案使用本次实际挑战的关卡（_currentStageConfig）
      const foughtCfg = this._currentStageConfig;
      let failText: string;
      if (foughtCfg && foughtCfg.stageIndex) {
        failText = this._formatBattleResultStageTitle(foughtCfg) + ' 挑战失败：未发放奖励';
      } else if (ctx.displayIndex !== null) {
        failText = `第 ${ctx.displayIndex} 关挑战失败：未发放奖励`;
      } else {
        failText = '挑战失败：未发放奖励';
      }
      this._updateResultLabel(failText);
    } else {
      // [Step12A-C1.4.1] 完整奖励展示：金币、经验、强化石、钻石、装备、材料等
      // [C1.5.9-G-B2-A2] 胜利标题使用本次实际挑战的关卡（_currentStageConfig）
      let winTitle: string;
      const foughtCfg = this._currentStageConfig;
      if (foughtCfg && foughtCfg.stageIndex) {
        winTitle = this._formatBattleResultStageTitle(foughtCfg) + ' 胜利';
      } else if (ctx.displayIndex !== null) {
        if (ctx.stageName) {
          winTitle = `第 ${ctx.displayIndex} 关·${ctx.stageName} 胜利`;
        } else {
          winTitle = `第 ${ctx.displayIndex} 关 胜利`;
        }
      } else {
        winTitle = '胜利';
      }
      const lines: string[] = [winTitle];

      // 金币 + 经验同行
      const primary: string[] = [];
      if (r.goldGain > 0) primary.push(`金币 +${r.goldGain}`);
      if (r.expGain > 0) primary.push(`经验 +${r.expGain}`);
      if (primary.length > 0) lines.push(primary.join('  '));

      // [C1.5.9-G-B1-A7] 账号经验奖励
      if (this._accountExpGained > 0) {
        lines.push(`账号经验 +${this._accountExpGained}`);
      }

      // 其他奖励项（强化石、钻石、装备、材料等）
      const otherItems = r.rewardItems ?? [];
      if (otherItems.length > 0) {
        const itemLines: string[] = [];
        for (const item of otherItems) {
          const name = this._getItemDisplayName(item.itemId);
          itemLines.push(`${name} +${item.count}`);
        }
        // 每行 1~2 个奖励，避免穿出屏幕
        for (let i = 0; i < itemLines.length; i += 2) {
          if (i + 1 < itemLines.length) {
            lines.push(`${itemLines[i]}  ${itemLines[i + 1]}`);
          } else {
            lines.push(itemLines[i]);
          }
        }
      }

      // [C1.5] 等级变化（如果升级了）
      if (this._heroLevelAfter > this._heroLevelBefore) {
        lines.push(`等级 Lv${this._heroLevelBefore} → Lv${this._heroLevelAfter}`);
      }

      // [C1.5.9-G-B1-A7] 账号等级变化
      if (this._accountLevelAfter > this._accountLevelBefore) {
        lines.push(`账号等级 Lv${this._accountLevelBefore} → Lv${this._accountLevelAfter}`);
      }

      // 战力变化
      lines.push(`战力 ${r.powerBefore} → ${r.powerAfter}`);

      // 章节推进
      if (r.chapterCompleted) {
        lines.push('章节已推进');
      }

      this._updateResultLabel(lines.join('\n'));
    }
  }

  /**
   * [Step12A-C1.3] 确保 resultLabel 支持换行显示。
   * UITransform 宽度已在 Phase10Main.scene 中设为 320×120。
   * 此处仅确保运行时 Label 属性。
   */
  private _ensureResultLabelStyle(): void {
    if (!this.resultLabel) return;

    // Label.Overflow.SHRINK = 2: 字体自动缩小以适应宽度
    this.resultLabel.overflow = 2;
    this.resultLabel.lineHeight = 26;
  }

  /**
   * 直接设置 resultLabel 文本。
   */
  private _updateResultLabel(text: string): void {
    if (!this.resultLabel) return;
    this.resultLabel.string = text;
    console.log(`[Step12A-C1][Entry] resultLabel → ${text.replace(/\n/g, '\\n')}`);
  }

  // ================================================================
  // 内部 — [Step12A-C1.5] HeroInfoLabel（极简英雄等级经验显示）
  // ================================================================

  /**
   * [C1.5] 确保运行时 HeroInfoLabel 已创建。
   *
   * 优先使用 inspector 绑定的 heroInfoLabel；
   * 如果未绑定，则在同一父节点下运行时创建一个 Label 节点。
   * 位置：主界面右上区域，不遮挡装备、邮箱、兑换码、登录奖励和挑战按钮。
   */
  private _ensureHeroInfoLabel(): void {
    if (this.heroInfoLabel) {
      console.log('[Step12A-C1.5][HeroInfoLabel] 使用 inspector 绑定的 heroInfoLabel');
      return;
    }

    // 运行时创建：放在 resultLabel 同父节点下
    const parent = this.resultLabel?.node.parent ?? this.node;
    if (!parent) {
      console.warn('[Step12A-C1.5][HeroInfoLabel] 无法确定父节点，跳过创建');
      return;
    }

    const labelNode = new Node('HeroInfoLabel');
    labelNode.setParent(parent);

    // 位置：右上区域 (x≈200, y≈280)
    labelNode.setPosition(200, 280, 0);

    const uiTransform = labelNode.addComponent(UITransform);
    uiTransform.width = 260;
    uiTransform.height = 50;

    const label = labelNode.addComponent(Label);
    label.string = '英雄数据加载中...';
    label.fontSize = 20;
    label.lineHeight = 24;
    label.color = new Color(255, 255, 200, 255);
    label.overflow = 2; // SHRINK

    this.heroInfoLabel = label;
    console.log('[Step12A-C1.5][HeroInfoLabel] 运行时创建完成: pos=(200,280), size=260×50');
  }

  /**
   * [C1.5] 更新 HeroInfoLabel 文本。
   *
   * 从 HeroSystem 读取 hero_001 的 level / exp，计算 nextLevelExp，
   * 格式: "剑无极 Lv1  EXP 65/100"。
   * 也同时打印控制台诊断日志。
   */
  private _updateHeroInfoLabel(): void {
    const TAG = '[Step12A-C1.5][HeroInfoLabel]';

    const hero = this._heroSystem.getHero('hero_001');
    if (!hero) {
      console.warn(`${TAG} hero_001 不存在`);
      if (this.heroInfoLabel) {
        this.heroInfoLabel.string = '英雄数据加载中...';
      }
      return;
    }

    const level = hero.level;
    const exp = hero.exp;
    const nextLevelExp = level * 100; // HeroSystem.EXP_PER_LEVEL = 100, 公式: level × 100
    const unlocked = hero.unlocked;
    const power = hero.power;

    console.log(
      `${TAG} hero_001: level=${level}, exp=${exp}/${nextLevelExp}, ` +
      `power=${power}, unlocked=${unlocked}, star=${hero.star}, breakthrough=${hero.breakthrough}`,
    );

    if (this.heroInfoLabel) {
      const expProgress = `${exp}/${nextLevelExp}`;
      const unlockTag = unlocked ? '' : ' [未解锁]';
      this.heroInfoLabel.string = `剑无极 Lv${level}  EXP ${expProgress}${unlockTag}`;
    }
  }

  /**
   * [C1.5] 启动时 hero_001 诊断日志。
   *
   * 在 restoreFromSave 后调用，打印从存档恢复后的 hero_001 状态。
   */
  private _logHeroStartupDiag(): void {
    if (this._heroStartupDiagLogged) return;

    const TAG = '[Step12A-C1.5][HeroExpDiag]';
    const hero = this._heroSystem.getHero('hero_001');
    if (!hero) {
      console.warn(`${TAG} Startup: hero_001 不存在（HeroSystem 可能未初始化）`);
      return;
    }
    const nextLevelExp = hero.level * 100;
    const savedHero = this._saveManager.loadHeroData()?.heroStates['hero_001'];
    console.log(
      `${TAG} Startup restore: hero_001 level=${hero.level}, exp=${hero.exp}/${nextLevelExp}, ` +
      `power=${hero.power}, unlocked=${hero.unlocked}, ` +
      `savedLevel=${savedHero?.level ?? -1}, savedExp=${savedHero?.exp ?? -1}, ` +
      `savedUnlocked=${savedHero?.unlocked ?? false}`,
    );
    this._heroStartupDiagLogged = true;
  }

  private _refreshHeroInfoAfterRestore(): void {
    this._updateHeroInfoLabel();
    this._logHeroStartupDiag();
  }

  /**
   * [C1.5] 战斗前 hero_001 运行时诊断。
   *
   * 在 _logPreBattleDiagnostics 末尾调用。
   */
  private _logC15PreBattleDiag(): void {
    const TAG = '[Step12A-C1.5][HeroExpDiag]';
    const hero = this._heroSystem.getHero('hero_001');
    if (!hero) {
      console.warn(`${TAG} PreBattle: hero_001 不存在`);
      return;
    }
    console.log(
      `${TAG} PreBattle: hero_001 level=${hero.level}, exp=${hero.exp}, ` +
      `nextLevelExp=${hero.level * 100}, power=${hero.power}, ` +
      `unlocked=${hero.unlocked}, star=${hero.star}`,
    );
  }

  // ================================================================
  // 内部 — [Step12A-C1.1][RuntimeDiag] 战斗前诊断日志
  // ================================================================

  /**
   * 输出战斗前关键诊断信息（仅 challenge 启动时调用一次，不在 update 中刷屏）。
   */
  private _logPreBattleDiagnostics(
    slots: ReadonlyArray<{ heroId: string | null }>,
    teamSnapshot: import('../formation/FormationTypes').TeamSnapshot,
    battleStageId: string,
  ): void {
    const TAG = '[Step12A-C1.1][RuntimeDiag]';

    // 1. Inventory instanceItems 摘要
    const inventory = InventoryService.getInstance();
    const allInstances = inventory.getAllInstanceItems();
    const eqInstances = allInstances.filter((i) => i.category === 'Equipment');
    console.log(
      `${TAG} Inventory: totalInstances=${allInstances.length}, ` +
      `equipmentInstances=${eqInstances.length}, ` +
      `items=[${eqInstances.map((i) => `${i.itemId}(${i.uniqueId.slice(-6)})`).join(', ')}]`,
    );

    // 2. Equipment loadout 摘要
    const eqService = EquipmentService.getInstance();
    const filledSlots = slots.filter((s) => s.heroId !== null);
    for (const slot of filledSlots) {
      const heroId = slot.heroId!;
      const loadout = eqService.getHeroLoadout(heroId);
      const contrib = eqService.getHeroEquipmentContribution(heroId);
      console.log(
        `${TAG} Equipment: heroId=${heroId}, ` +
        `loadout=${loadout ? `Weapon=${loadout.slots['Weapon']?.slice(-6) ?? 'null'}, ` +
        `Armor=${loadout.slots['Armor']?.slice(-6) ?? 'null'}, ` +
        `Accessory=${loadout.slots['Accessory']?.slice(-6) ?? 'null'}` : 'null'}, ` +
        `equipPower=${contrib?.equipmentPower ?? 0}, ` +
        `bonusHp=${contrib?.attributeBonus?.hp ?? 0}, ` +
        `bonusAtk=${contrib?.attributeBonus?.atk ?? 0}, ` +
        `bonusDef=${contrib?.attributeBonus?.def ?? 0}`,
      );
    }

    // 3. PVE formation slots
    console.log(
      `${TAG} Formation: mode=pve, ` +
      `filledSlots=${filledSlots.length}, ` +
      `heroIds=[${filledSlots.map((s) => s.heroId).join(', ')}]`,
    );

    // 4. teamSnapshot hero stats
    for (const hs of teamSnapshot.heroSnapshots) {
      console.log(
        `${TAG} HeroSnapshot: heroId=${hs.heroId}, name=${hs.name}, ` +
        `level=${hs.level}, star=${hs.star}, profession=${hs.profession}, ` +
        `hp=${hs.battleReady.hp}, atk=${hs.battleReady.atk}, ` +
        `def=${hs.battleReady.def}, speed=${hs.battleReady.speed}, ` +
        `power=${hs.battleReady.power}, skillIds=[${hs.skillIds.join(', ')}]`,
      );
    }

    // 5. teamSnapshot total power
    console.log(
      `${TAG} TeamSnapshot: totalPower=${teamSnapshot.teamPower}, ` +
      `heroCount=${teamSnapshot.heroSnapshots.length}, ` +
      `skillCount=${teamSnapshot.skillSnapshots.length}`,
    );

    // [C1.5] hero_001 战斗前运行时诊断
    this._logC15PreBattleDiag();

  }

  /**
   * 输出敌方阵容诊断（在 startStageBattle 成功后调用，此时 BattleData 可用）。
   */
  private _logEnemyDiagnostics(battleStageId: string): void {
    const TAG = '[Step12A-C1.1][RuntimeDiag]';
    const battleData = this._battleManager.getCurrentBattleData();
    if (!battleData) return;

    const enemies = battleData.enemyUnits;
    console.log(
      `${TAG} Enemy: stageId=${battleStageId}, ` +
      `enemyCount=${enemies.length}, ` +
      `totalHp=${enemies.reduce((s, e) => s + e.maxHp, 0)}, ` +
      `details=[${enemies.map((e) =>
        `${e.configId}(${e.name}): lv${e.level} hp${e.maxHp} atk${e.attack} def${e.defense} spd${e.speed}`,
      ).join('; ')}]`,
    );
  }

  // ================================================================
  // [C1.6-B1-B-R6] 跨章节确认判断
  // ================================================================

  /**
   * [C1.6-B1-B-R6-A1] 判断是否需要跨章节结算确认。
   *
   * _lastResultChapterId 来自战斗启动前缓存的 _currentStageConfig.chapterId，
   * 是配置中的权威章节归属，不依赖 chapterStageId 字符串格式推导。
   *
   * 规则：
   *   - _lastResult 不存在 → false（无待确认结果）
   *   - 无法获取结算 chapterId → false（安全默认）
   *   - 无法获取当前权威 chapterId → false（安全默认）
   *   - 结算 chapterId === 当前 chapterId → false（同一章节，直接推进）
   *   - 结算 chapterId !== 当前 chapterId → true（跨章节，需确认）
   *
   * 通用规则，不依赖具体章节序号或关卡序号。
   *
   * @param currentContext  可选的预解析当前关卡上下文（避免重复解析）
   */
  private _shouldConfirmChapterTransition(
    currentContext?: CurrentStageContext | null,
  ): boolean {
    if (!this._lastResult) return false;
    if (!this._lastResultChapterId) return false;

    const currentChapterId = currentContext?.chapterId
      ?? this._chapterSystem.getCurrentChapterId();
    if (!currentChapterId) return false;

    return this._lastResultChapterId !== currentChapterId;
  }

  // ================================================================
  // 内部 — 工具
  // ================================================================

  private _failChallenge(errorCode: string, message: string): ChallengeResult {
    console.warn(
      `[Step12A-B][Coordinator] challengeFirstStage 失败: errorCode=${errorCode}, message=${message}`,
    );
    this._state = 'failed';
    this._setChallengeButtonInteractable(true);
    // [C1.5.9-C3] 将失败信息显示到主界面结果区域
    this._updateResultLabel(message);
    return {
      success: false,
      state: 'failed',
      errorCode,
      message,
    };
  }

  // ================================================================
  // [C1.5.9-G-B2-A11] 关卡准入条件评估
  // ================================================================

  /**
   * [C1.5.9-G-B2-A11] 评估关卡准入条件。
   *
   * 遍历 stageConfig.entryRequirements，逐条检查。
   * 全部满足时返回 null；不满足时返回中文阻断提示。
   *
   * 权威装备数据读取链：
   *   initialHeroId → EquipmentService.getHeroLoadout(heroId)
   *   → Weapon/Armor/Accessory 槽位 uniqueId
   *   → InventoryService.getInstanceByUniqueId(uniqueId)
   *   → InstanceItem.extraData.enhanceLevel
   *
   * @param stageConfig  关卡配置
   * @returns            阻断消息（null = 通过，非 null = 阻断原因）
   */
  private _getStageEntryBlockMessage(stageConfig: StageConfig): string | null {
    const requirements = stageConfig.entryRequirements;
    if (!requirements || requirements.length === 0) {
      return null;
    }

    // 验证服务已初始化
    const eqService = EquipmentService.getInstance();
    const inventory = InventoryService.getInstance();
    if (!eqService.isInitialized()) {
      console.warn('[Coordinator][EntryGate] EquipmentService 未初始化，闭锁挑战');
      return '系统未就绪，请稍后再试';
    }
    if (!inventory.isInitialized()) {
      console.warn('[Coordinator][EntryGate] InventoryService 未初始化，闭锁挑战');
      return '系统未就绪，请稍后再试';
    }

    for (const req of requirements) {
      if (req.type === 'equippedEnhanceLevel') {
        // 校验配置
        if (!req.slots || req.slots.length === 0) {
          console.warn('[Coordinator][EntryGate] equippedEnhanceLevel.slots 为空，闭锁');
          return '关卡配置异常，无法挑战';
        }
        if (!Number.isFinite(req.minLevel) || req.minLevel < 0) {
          console.warn(
            `[Coordinator][EntryGate] equippedEnhanceLevel.minLevel 非法: ${req.minLevel}，闭锁`,
          );
          return '关卡配置异常，无法挑战';
        }

        // 获取主角英雄 ID
        const initialHeroId = this._getInitialHeroId();
        if (!initialHeroId) {
          console.warn('[Coordinator][EntryGate] 无法获取 initialHeroId，闭锁');
          return '英雄数据未就绪，无法挑战';
        }

        // 读取装备穿戴数据
        const loadout = eqService.getHeroLoadout(initialHeroId);
        if (!loadout) {
          console.warn(
            `[Coordinator][EntryGate] heroId=${initialHeroId} 无装备穿戴数据，闭锁`,
          );
          return '请先将武器、护甲和饰品分别强化至+3';
        }

        // 逐槽检查强化等级
        for (const slotType of req.slots) {
          // 校验槽位类型
          if (
            slotType !== 'Weapon' &&
            slotType !== 'Armor' &&
            slotType !== 'Accessory'
          ) {
            console.warn(
              `[Coordinator][EntryGate] 不支持的槽位类型: ${slotType}，闭锁`,
            );
            return '关卡配置异常，无法挑战';
          }

          const uniqueId = loadout.slots[slotType];
          if (!uniqueId) {
            // 槽位为空
            return '请先将武器、护甲和饰品分别强化至+3';
          }

          const instance = inventory.getInstanceByUniqueId(uniqueId);
          if (!instance) {
            // 实例不存在
            return '请先将武器、护甲和饰品分别强化至+3';
          }

          // 读取强化等级（严格防御：缺失/非法/非有限/负数 → 0）
          const rawLevel = instance.extraData?.enhanceLevel;
          let enhanceLevel: number;
          if (rawLevel === undefined || rawLevel === null) {
            enhanceLevel = 0;
          } else {
            const num = Number(rawLevel);
            if (!Number.isFinite(num)) {
              enhanceLevel = 0;
            } else {
              enhanceLevel = Math.floor(num);
            }
          }

          if (enhanceLevel < req.minLevel) {
            return '请先将武器、护甲和饰品分别强化至+3';
          }
        }
      } else {
        // 未知准入条件类型
        console.warn(
          `[Coordinator][EntryGate] 未知准入条件类型: ${(req as Record<string, unknown>).type}，闭锁`,
        );
        return '关卡配置异常，无法挑战';
      }
    }

    return null;
  }

  /**
   * [C1.5.9-G-B2-A11] 阻断挑战入口。
   *
   * 不调用 _failChallenge()，不改变 _state 为 'failed'。
   * 不创建战斗、不生成 transactionId、不扣资源、不发放奖励。
   *
   * @param errorCode  错误码
   * @param message    阻断提示文本
   * @returns          ChallengeResult（success=false）
   */
  private _blockChallengeEntry(
    errorCode: string,
    message: string,
  ): ChallengeResult {
    console.warn(
      `[Coordinator][EntryGate] 挑战入口阻断: errorCode=${errorCode}, message=${message}`,
    );
    this._setChallengeButtonInteractable(true);
    this._updateResultLabel(message);
    return {
      success: false,
      state: this._state,
      errorCode,
      message,
    };
  }

}
