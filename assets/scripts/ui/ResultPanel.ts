// ============================================================
// ResultPanel — Phase8 战斗/事件结算界面
// 职责：展示胜利/失败 / 奖励列表 / 下一步操作
// 规范：继承 BasePanel / 纯 UI / 由 DungeonRunResult 事件驱动
// ============================================================

import { _decorator, Node, Label, Button, Prefab, instantiate, Vec3 } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import { DungeonLoopEvent, type DungeonNodeProcessingResult } from '../systems/DungeonLoopController';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { RewardAnimationSystem } from '../systems/RewardAnimationSystem';
import type { DungeonRunResult } from '../data/roguelike_types';
import type { ResultPanelUIData, RewardDisplayItem } from '../data/phase8_ui_types';
import { REWARD_TYPE_ICON_MAP } from '../data/phase8_ui_types';
import type { FlyTextConfig, PityTriggerData } from '../data/reward_types';

const { ccclass, property } = _decorator;

@ccclass('ResultPanel')
export class ResultPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '结果标题（胜利/失败）' })
  titleLabel: Label | null = null;

  @property({ type: Label, tooltip: '副标题/描述' })
  subtitleLabel: Label | null = null;

  @property({ type: Node, tooltip: '奖励列表容器' })
  rewardContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '奖励项 Prefab' })
  rewardItemPrefab: Prefab | null = null;

  @property({ type: Label, tooltip: '经验获得标签' })
  expGainLabel: Label | null = null;

  @property({ type: Label, tooltip: '金币获得标签' })
  goldGainLabel: Label | null = null;

  @property({ type: Label, tooltip: '运行时长标签' })
  durationLabel: Label | null = null;

  @property({ type: Button, tooltip: '继续按钮' })
  continueButton: Button | null = null;

  @property({ type: Button, tooltip: '返回按钮' })
  returnButton: Button | null = null;

  @property({ type: Label, tooltip: '继续按钮文本' })
  continueButtonLabel: Label | null = null;

  @property({ type: Prefab, tooltip: '保底触发特效 Prefab（可选）' })
  pityTriggerPrefab: Prefab | null = null;

  // ==================== 内部状态 ====================

  private _uiData: ResultPanelUIData | null = null;
  private _onContinueCallback: (() => void) | null = null;
  private _onReturnCallback: (() => void) | null = null;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    em.on(RoguelikeSystem.RUN_COMPLETED, this._onRunCompleted, this);
    // DungeonLoop 事件 - 节点处理后自动显示结算
    em.on(DungeonLoopEvent.NODE_PROCESSED, this._onNodeProcessed, this);
    // UI 事件 - 来自 NodeMapPanel 的结果显示请求
    em.on('dungeonNodeMap:showBattleResult', this._onShowBattleResult, this);
    em.on('dungeonNodeMap:showRewardResult', this._onShowRewardResult, this);
    // Phase8-Step4: 奖励序列就绪 → 动画播放
    em.on(DungeonLoopEvent.REWARD_SEQUENCE_READY, this._onRewardSequenceReady, this);
    // Phase8-Step4: 保底触发 → 保底特效
    em.on(DungeonLoopEvent.PITY_TRIGGERED, this._onPityTriggered, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off(RoguelikeSystem.RUN_COMPLETED, this._onRunCompleted, this);
    em.off(DungeonLoopEvent.NODE_PROCESSED, this._onNodeProcessed, this);
    em.off('dungeonNodeMap:showBattleResult', this._onShowBattleResult, this);
    em.off('dungeonNodeMap:showRewardResult', this._onShowRewardResult, this);
    em.off(DungeonLoopEvent.REWARD_SEQUENCE_READY, this._onRewardSequenceReady, this);
    em.off(DungeonLoopEvent.PITY_TRIGGERED, this._onPityTriggered, this);
  }

  // ==================== 公开方法 ====================

  /**
   * 显示结算面板。
   *
   * @param uiData     结算 UI 数据
   * @param callbacks  按钮回调
   */
  showResult(
    uiData: ResultPanelUIData,
    callbacks?: {
      onContinue?: () => void;
      onReturn?: () => void;
    },
  ): void {
    this._uiData = uiData;
    this._onContinueCallback = callbacks?.onContinue ?? null;
    this._onReturnCallback = callbacks?.onReturn ?? null;

    this._renderTitle();
    this._renderRewards();
    this._renderStats();
    this._renderButtons();

    this.show();
  }

  /**
   * 根据 DungeonRunResult 自动构建 UI 数据并显示。
   */
  showFromRunResult(runResult: DungeonRunResult): void {
    const rewards: RewardDisplayItem[] = [];

    for (const grant of runResult.baseRewards) {
      rewards.push({
        rewardType: grant.rewardType as RewardDisplayItem['rewardType'],
        iconPath: REWARD_TYPE_ICON_MAP[grant.rewardType] ?? 'textures/icons/reward_gold',
        quantity: grant.quantity,
        displayName: this._getRewardDisplayName(grant.rewardType),
      });
    }

    const bonusGold = runResult.baseRewards
      .filter((r) => r.rewardType === 'gold')
      .reduce((sum, r) => sum + r.quantity, 0);

    const bonusExp = runResult.baseRewards
      .filter((r) => r.rewardType === 'exp')
      .reduce((sum, r) => sum + r.quantity, 0);

    const uiData: ResultPanelUIData = {
      isVictory: runResult.success,
      titleKey: runResult.success ? '结算_胜利' : '结算_失败',
      rewards,
      bonusExp,
      bonusGold,
      canContinue: false,
      nextActionLabel: '返回',
    };

    this.showResult(uiData);
  }

  // ==================== 内部：渲染 ====================

  private _renderTitle(): void {
    if (!this._uiData) return;

    if (this.titleLabel) {
      this.titleLabel.string = this._uiData.isVictory ? '✨ 胜利 ✨' : '💀 失败';
    }

    if (this.subtitleLabel) {
      this.subtitleLabel.string = this._uiData.isVictory
        ? '恭喜通关！获得以下奖励'
        : '挑战失败，再接再厉';
    }
  }

  private _renderRewards(): void {
    if (!this.rewardContainer || !this.rewardItemPrefab || !this._uiData) return;

    this.rewardContainer.removeAllChildren();

    for (const reward of this._uiData.rewards) {
      const itemNode = instantiate(this.rewardItemPrefab);
      this._configureRewardItem(itemNode, reward);
      this.rewardContainer.addChild(itemNode);
    }
  }

  private _configureRewardItem(itemNode: Node, reward: RewardDisplayItem): void {
    const iconLabel = itemNode.getChildByName('Icon')?.getComponent(Label);
    const nameLabel = itemNode.getChildByName('NameLabel')?.getComponent(Label);
    const qtyLabel = itemNode.getChildByName('QtyLabel')?.getComponent(Label);

    if (iconLabel) iconLabel.string = this._getRewardIcon(reward.rewardType);
    if (nameLabel) nameLabel.string = reward.displayName;
    if (qtyLabel) qtyLabel.string = `x${reward.quantity}`;
  }

  private _renderStats(): void {
    if (!this._uiData) return;

    if (this.expGainLabel) {
      this.expGainLabel.string = `经验 +${this._uiData.bonusExp}`;
    }

    if (this.goldGainLabel) {
      this.goldGainLabel.string = `金币 +${this._uiData.bonusGold}`;
    }
  }

  private _renderButtons(): void {
    if (this.continueButton) {
      this.continueButton.node.active = this._uiData?.canContinue ?? false;
    }

    if (this.continueButtonLabel && this._uiData) {
      this.continueButtonLabel.string = this._uiData.nextActionLabel;
    }
  }

  // ==================== 辅助方法 ====================

  private _getRewardDisplayName(rewardType: string): string {
    const map: Record<string, string> = {
      gold: '金币',
      exp: '经验',
      equipment: '装备',
      item: '道具',
      currency: '货币',
    };
    return map[rewardType] ?? rewardType;
  }

  private _getRewardIcon(rewardType: string): string {
    const map: Record<string, string> = {
      gold: '💰',
      exp: '✨',
      equipment: '⚔️',
      item: '📦',
      currency: '💎',
    };
    return map[rewardType] ?? '📦';
  }

  // ==================== 事件响应 ====================

  private _onRunCompleted(runState: unknown): void {
    // RoguelikeSystem.RUN_COMPLETED 事件携带 DungeonRunState
    console.log('[ResultPanel] 地牢运行完成');
    // 注意：showFromRunResult 需要 DungeonRunResult（由 DungeonLoopController.completeRun 产生）
    // 此处仅记录，实际结算由 DungeonLoopController 驱动
  }

  /**
   * 根据节点处理结果显示结算面板。
   */
  showNodeResult(nodeResult: DungeonNodeProcessingResult): void {
    const rewards: RewardDisplayItem[] = [];

    // 从结算结果构建奖励显示
    const sr = nodeResult.settlementResult;
    if (sr.totalGold > 0) {
      rewards.push({
        rewardType: 'gold',
        iconPath: REWARD_TYPE_ICON_MAP['gold'],
        quantity: sr.totalGold,
        displayName: '金币',
      });
    }
    if (sr.totalExp > 0) {
      rewards.push({
        rewardType: 'exp',
        iconPath: REWARD_TYPE_ICON_MAP['exp'],
        quantity: sr.totalExp,
        displayName: '经验',
      });
    }

    // 战斗结果标题
    let isVictory = true;
    let titleKey = '节点_结算';
    if (nodeResult.battleResult) {
      isVictory = nodeResult.battleResult.victory;
      titleKey = isVictory ? '战斗_胜利' : '战斗_失败';
    } else if (nodeResult.nodeType === 'event') {
      titleKey = '事件_完成';
    } else {
      titleKey = '奖励_获取';
    }

    const uiData: ResultPanelUIData = {
      isVictory,
      titleKey,
      rewards,
      bonusExp: sr.totalExp,
      bonusGold: sr.totalGold,
      canContinue: true,
      nextActionLabel: '继续',
    };

    this.showResult(uiData);
  }

  // ==================== 事件响应：节点处理 ====================

  private _onNodeProcessed(data: unknown): void {
    const result = data as DungeonNodeProcessingResult;
    if (!result) return;

    // 非空结算结果 → 自动显示
    const sr = result.settlementResult;
    if (sr && (sr.totalGold > 0 || sr.totalExp > 0 || sr.totalEquipment > 0 || sr.totalItems > 0)) {
      this.showNodeResult(result);
    }
  }

  private _onShowBattleResult(data: unknown): void {
    const payload = data as Record<string, unknown>;
    if (!payload) return;

    // 构建节点处理结果样式的数据
    const fakeResult: DungeonNodeProcessingResult = {
      nodeId: (payload.nodeId as string) ?? '',
      nodeType: (payload.nodeType as string) ?? 'battle',
      runState: (payload.runState as DungeonNodeProcessingResult['runState']) ?? null as unknown as DungeonNodeProcessingResult['runState'],
      battleResult: payload.battleResult as DungeonNodeProcessingResult['battleResult'],
      settlementResult: payload.settlementResult as DungeonNodeProcessingResult['settlementResult'],
    };

    this.showNodeResult(fakeResult);
  }

  private _onShowRewardResult(data: unknown): void {
    const payload = data as Record<string, unknown>;
    if (!payload) return;

    const fakeResult: DungeonNodeProcessingResult = {
      nodeId: (payload.nodeId as string) ?? '',
      nodeType: (payload.nodeType as string) ?? 'reward',
      runState: (payload.runState as DungeonNodeProcessingResult['runState']) ?? null as unknown as DungeonNodeProcessingResult['runState'],
      settlementResult: payload.settlementResult as DungeonNodeProcessingResult['settlementResult'],
    };

    this.showNodeResult(fakeResult);
  }

  // ==================== Phase8-Step4: 奖励动画 ====================

  /**
   * 播放奖励序列入场动画。
   *
   * 当 DungeonLoopEvent.REWARD_SEQUENCE_READY 触发时调用。
   * 使用 RewardAnimationSystem 播放交错缩放入场 + 飞字动画。
   */
  playRewardSequenceAnimation(rewards: RewardDisplayItem[], pityTriggers?: PityTriggerData[]): void {
    const animSys = this._getAnimationSystem();
    if (!animSys) return;

    // 已有显示数据时播放动画
    if (!this.rewardContainer || !this.rewardItemPrefab) {
      // 无容器/无预制体时，仅渲染静态结果
      this._renderRewards();
      return;
    }

    // 先渲染所有奖励静态展示
    this._renderRewards();

    // 再播放动画序列
    animSys.playRewardSequence(
      this.rewardContainer,
      this.rewardItemPrefab,
      rewards,
    );

    // 播放飞字（从容器中心飞出）
    if (rewards.length > 0) {
      const containerPos = this.rewardContainer.getWorldPosition();
      const flyConfigs: FlyTextConfig[] = [];

      for (const reward of rewards) {
        flyConfigs.push({
          text: `+${reward.quantity} ${reward.displayName}`,
          worldPosition: {
            x: containerPos.x + (Math.random() - 0.5) * 40,
            y: containerPos.y + 20,
          },
          duration: 0.5,
          color: this._getRewardColor(reward.rewardType),
          fontSize: 24,
        });
      }

      animSys.playFlyTextBatch(this.rewardContainer, flyConfigs);
    }

    // 保底特效
    if (pityTriggers && pityTriggers.length > 0) {
      for (const trigger of pityTriggers) {
        this.showPityTriggerIndicator(trigger);
      }
    }
  }

  /**
   * 显示保底触发视觉标识。
   *
   * 如果 pityTriggerPrefab 已绑定，实例化后播放缩放脉冲 + 淡出特效。
   */
  showPityTriggerIndicator(pityTrigger: PityTriggerData): void {
    if (!this.pityTriggerPrefab || !this.rewardContainer) return;

    const animSys = this._getAnimationSystem();
    if (!animSys) return;

    const pityNode = instantiate(this.pityTriggerPrefab);
    this.rewardContainer.addChild(pityNode);

    // 设置保底标签文本
    const label = pityNode.getComponentInChildren(Label);
    if (label) {
      const sourceNames: Record<string, string> = {
        dungeon_boss: 'Boss保底',
        dungeon_event: '事件保底',
        dungeon_node: '节点保底',
      };
      label.string = sourceNames[pityTrigger.sourceType] ?? `保底奖励!`;
    }

    // 播放保底特效
    animSys.playPityTriggerEffect(pityNode, 1200);
  }

  // ==================== Phase8-Step4: 事件响应 ====================

  private _onRewardSequenceReady(data: unknown): void {
    const payload = data as {
      runId?: string;
      settlementResult?: import('../systems/DungeonLoopController').SettlementResult;
      orderedGrants?: import('../data/roguelike_types').RewardGrant[];
      pityTriggers?: PityTriggerData[];
    };
    if (!payload || !payload.orderedGrants) return;

    // 将 RewardGrant 转换为 RewardDisplayItem
    const rewards: RewardDisplayItem[] = [];
    for (const grant of payload.orderedGrants) {
      const isPity = grant.rewardId.startsWith('pity_');
      rewards.push({
        rewardType: grant.rewardType as RewardDisplayItem['rewardType'],
        iconPath: REWARD_TYPE_ICON_MAP[grant.rewardType] ?? 'textures/icons/reward_gold',
        quantity: grant.quantity,
        displayName: this._getRewardDisplayName(grant.rewardType),
        isPityBonus: isPity,
      });
    }

    // 更新经验/金币标签
    if (payload.settlementResult) {
      if (this.expGainLabel) {
        this.expGainLabel.string = `经验 +${payload.settlementResult.totalExp}`;
      }
      if (this.goldGainLabel) {
        this.goldGainLabel.string = `金币 +${payload.settlementResult.totalGold}`;
      }
    }

    // 播放动画序列
    this.playRewardSequenceAnimation(rewards, payload.pityTriggers);
  }

  private _onPityTriggered(data: unknown): void {
    const trigger = data as PityTriggerData;
    if (!trigger) return;

    console.log(
      `[ResultPanel] 保底触发: sourceType=${trigger.sourceType}, ` +
      `reward=${trigger.bonusReward.rewardType}x${trigger.bonusReward.quantity}`,
    );

    // 保底特效已通过 REWARD_SEQUENCE_READY 中的 pityTriggers 处理
    // 如果面板当前未显示，此事件可用于未来扩展（如全局提示）
  }

  // ==================== 内部：动画辅助 ====================

  private _getAnimationSystem(): RewardAnimationSystem | null {
    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (bootstrap.isReady()) {
        return bootstrap.getRewardAnimationSystem();
      }
    } catch {
      // 回退：直接使用单例
    }
    return RewardAnimationSystem.getInstance();
  }

  private _getRewardColor(rewardType: string): string {
    const colorMap: Record<string, string> = {
      gold: '#FFD700',
      exp: '#44AAFF',
      equipment: '#FF44FF',
      item: '#44FF44',
      currency: '#FF8844',
    };
    return colorMap[rewardType] ?? '#FFFFFF';
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    this.continueButton?.node.on(Button.EventType.CLICK, this._handleContinue, this);
    this.returnButton?.node.on(Button.EventType.CLICK, this._handleReturn, this);
  }

  private _handleContinue(): void {
    if (this._onContinueCallback) {
      this._onContinueCallback();
    }
    this.hide();
  }

  private _handleReturn(): void {
    if (this._onReturnCallback) {
      this._onReturnCallback();
    }
    this.hide();
  }

  onDestroy(): void {
    super.onDestroy();
  }
}
