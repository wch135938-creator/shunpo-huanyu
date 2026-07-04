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

import { _decorator, Component, Button, Label, Node, find } from 'cc';
import { EventManager } from '../core/EventManager';
import { ConfigManager } from '../core/ConfigManager';
import { BattleManager, BattleManagerEvent } from '../managers/BattleManager';
import type { StageBattleFinishedEvent } from '../managers/BattleManager';
import { RewardSettlement } from '../reward/RewardSettlement';
import type { SettlementOptions } from '../reward/RewardSettlement';
import { HeroSystem } from '../hero/HeroSystem';
import { FormationSystem } from '../formation/FormationSystem';
import { ChapterSystem } from '../chapter/ChapterSystem';
import { ChapterRepository } from '../chapter/ChapterRepository';
import type { StageConfig } from '../chapter/ChapterTypes';
import { Phase9Bootstrap } from '../systems/Phase9Bootstrap';
import { SaveManager } from '../save/SaveManager';
import { EquipmentService } from '../equipment/EquipmentService';
import { InventoryService } from '../inventory/InventoryService';
import type { BattleResult } from '../battle/BattleResult';
import type { GlobalPlayerEntry, GlobalConstConfig } from '../config/global_config';

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

// ==================== 错误码 ====================

const ERR_BUSY = 'ERR_BUSY';
const ERR_NO_BATTLE_MAPPING = 'ERR_NO_BATTLE_MAPPING';
const ERR_NO_BATTLE_STAGE = 'ERR_NO_BATTLE_STAGE';
const ERR_NO_HERO = 'ERR_NO_HERO';
const ERR_NO_FORMATION = 'ERR_NO_FORMATION';
const ERR_CONFIG_MISSING = 'ERR_CONFIG_MISSING';
const ERR_BATTLE_START_FAILED = 'ERR_BATTLE_START_FAILED';

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

  // ===== Before / After 记录 =====

  private _powerBefore: number = 0;
  private _powerAfter: number = 0;
  private _expBefore: number = 0;
  private _expAfter: number = 0;

  // ===== 结算结果 =====

  private _lastResult: GameplayLastResult | null = null;

  // ===== 事件监听引用 =====

  private _battleFinishedListener: ((...args: unknown[]) => void) | null = null;

  // ===== 首关映射常量 =====

  private static readonly FIRST_CHAPTER_STAGE_ID = 'chapter_001_stage_01';
  private static readonly EXPECTED_BATTLE_STAGE_ID = 'STAGE_001';

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
    this._bindChallengeButton();

    // [Step12A-C1.2] 初始检测弹窗状态，避免挑战按钮覆盖在弹窗上
    this.scheduleOnce(() => {
      this._updateChallengeUIVisibility();
    }, 0.1);

    console.log('[Step12A-B][Coordinator] onLoad — 依赖就绪, state=idle');
  }

  onDestroy(): void {
    this._unbindChallengeButton();
    this._unregisterBattleEndedListener();
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
      // 1. 读取首关配置
      const stageConfig = this._getFirstChapterStageConfig();
      if (!stageConfig) {
        return this._failChallenge(ERR_CONFIG_MISSING, '首关配置不存在');
      }

      // 2. 验证 battleStageId 映射
      const battleStageId = stageConfig.battleStageId;
      if (!battleStageId) {
        return this._failChallenge(
          ERR_NO_BATTLE_MAPPING,
          `章节关卡 ${stageConfig.id} 未配置 battleStageId，后续关卡尚未接入`,
        );
      }

      if (battleStageId !== Phase10MainGameplayCoordinator.EXPECTED_BATTLE_STAGE_ID) {
        console.warn(
          `[Step12A-B][Coordinator] battleStageId 与预期不符: ` +
          `expected=${Phase10MainGameplayCoordinator.EXPECTED_BATTLE_STAGE_ID} actual=${battleStageId}`,
        );
      }

      console.log(
        `[Step12A-B][Coordinator] 首关映射读取成功: ` +
        `chapterStage=${stageConfig.id} → battleStage=${battleStageId}`,
      );

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
      this._updateResultLabel('战斗中...');
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
      console.log('[Step12A-B][Coordinator] 战斗失败，不发放奖励');
      return;
    }

    // 胜利 → 结算
    try {
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

      // 5. 推进章节
      const chapterCompleted = this._chapterSystem.completeStage(this._currentChapterStageId);

      console.log(
        `[Step12A-B][Coordinator] Chapter complete: stageId=${this._currentChapterStageId}, ` +
        `result=${chapterCompleted}`,
      );

      // 检查下一关是否解锁
      const nextStage = this._chapterSystem.getCurrentStage('chapter_001');
      const nextStageId = nextStage ? nextStage.id : '';

      // 6. 保存
      this._phase9Bootstrap.saveAll();
      this._saveManager.save();

      console.log('[Step12A-B][Coordinator] saveAll + save 完成');

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

      console.log(
        `[Step12A-B][Coordinator] 首关闭环完成: state=settled, ` +
        `goldGain=${result.goldGain}, expGain=${totalExpGain}`,
      );
    } catch (err) {
      console.error('[Step12A-B][Coordinator] 结算流程异常:', err);
      this._state = 'failed';
      this._setChallengeButtonInteractable(true);
      this._renderLastResultToLabel();
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

    for (let i = 0; i < heroIds.length; i++) {
      const exp = perHero + (i === 0 ? remainder : 0);
      if (exp > 0) {
        const levelUps = this._heroSystem.addHeroExp(heroIds[i], exp);
        console.log(
          `[Step12A-B][Coordinator] HeroSystem.addHeroExp: heroId=${heroIds[i]}, ` +
          `exp=${exp}, levelUps=${levelUps}`,
        );
      }
    }
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

  // ================================================================
  // 内部 — 配置读取
  // ================================================================

  /**
   * 读取首关 chapter_001_stage_01 的 StageConfig。
   */
  private _getFirstChapterStageConfig(): StageConfig | null {
    const stageConfig = this._chapterRepository.getStage(
      Phase10MainGameplayCoordinator.FIRST_CHAPTER_STAGE_ID,
    );
    return stageConfig ?? null;
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
   */
  private _onChallengeButtonClicked(): void {
    console.log('[Step12A-C1][Entry] 按钮点击 — challengeFirstStage');
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
   */
  private _renderLastResultToLabel(): void {
    if (!this.resultLabel) return;
    this._ensureResultLabelStyle();

    if (!this._lastResult) {
      this._updateResultLabel('首关闭环未开始');
      return;
    }

    const r = this._lastResult;
    if (r.isDuplicate) {
      this._updateResultLabel('重复结算已拦截：\n资产和经验未重复增加');
    } else if (!r.success) {
      this._updateResultLabel('挑战失败：未发放奖励');
    } else {
      // [Step12A-C1.4.1] 完整奖励展示：金币、经验、强化石、钻石、装备、材料等
      const lines: string[] = ['首关胜利'];

      // 金币 + 经验同行
      const primary: string[] = [];
      if (r.goldGain > 0) primary.push(`金币 +${r.goldGain}`);
      if (r.expGain > 0) primary.push(`经验 +${r.expGain}`);
      if (primary.length > 0) lines.push(primary.join('  '));

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
  // 内部 — 工具
  // ================================================================

  private _failChallenge(errorCode: string, message: string): ChallengeResult {
    console.warn(
      `[Step12A-B][Coordinator] challengeFirstStage 失败: errorCode=${errorCode}, message=${message}`,
    );
    this._state = 'failed';
    this._setChallengeButtonInteractable(true);
    return {
      success: false,
      state: 'failed',
      errorCode,
      message,
    };
  }
}
