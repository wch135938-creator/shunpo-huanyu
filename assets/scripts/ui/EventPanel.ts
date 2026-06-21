// ============================================================
// EventPanel — Phase8 随机事件面板
// 职责：展示随机事件 / 选项按钮 / 奖励预览 / 事件结算
// 规范：继承 BasePanel / 纯 UI / 通过 Phase8Bootstrap 获取系统引用
// ============================================================

import { _decorator, Node, Label, Button, Prefab, instantiate, Color } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { DungeonEventManager, type EventResolveContext } from '../systems/DungeonEventManager';
import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import type { EventConfig, EventResult } from '../data/event_types';
import type { DungeonRunState } from '../data/roguelike_types';
import type { EventPanelUIData, EventChoiceUIData } from '../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('EventPanel')
export class EventPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '事件标题标签' })
  titleLabel: Label | null = null;

  @property({ type: Label, tooltip: '事件描述标签' })
  descriptionLabel: Label | null = null;

  @property({ type: Label, tooltip: '事件分类标签' })
  categoryLabel: Label | null = null;

  @property({ type: Node, tooltip: '选项按钮容器' })
  choiceContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '选项按钮 Prefab' })
  choiceButtonPrefab: Prefab | null = null;

  @property({ type: Label, tooltip: '奖励预览标签' })
  rewardPreviewLabel: Label | null = null;

  @property({ type: Button, tooltip: '跳过/关闭按钮' })
  skipButton: Button | null = null;

  @property({ type: Node, tooltip: '事件结算结果面板' })
  resultPanel: Node | null = null;

  @property({ type: Label, tooltip: '结算结果文本' })
  resultTextLabel: Label | null = null;

  @property({ type: Button, tooltip: '确认/继续按钮' })
  confirmButton: Button | null = null;

  // ==================== 内部状态 ====================

  private _dungeonEventManager: DungeonEventManager | null = null;
  private _roguelikeSystem: RoguelikeSystem | null = null;
  private _currentEventConfig: EventConfig | null = null;
  private _runState: DungeonRunState | null = null;
  private _onResolvedCallback: ((result: EventResult) => void) | null = null;
  /** 事件选项回调：由 DungeonLoopController 注入，处理 choiceId → 奖励结算 */
  private _onChoiceCallback: ((choiceId: string, eventConfig: EventConfig) => void) | null = null;

  // ==================== BasePanel 生命周期 ====================

  // ==================== 公开方法 ====================

  /**
   * 根据事件池引用随机抽取并展示事件。
   *
   * @param poolRefs         事件池引用列表
   * @param runState         当前运行状态
   * @param onResolved       事件解决后的回调
   */
  showRandomEvent(
    poolRefs: string[],
    runState: DungeonRunState,
    onResolved?: (result: EventResult) => void,
    onChoice?: (choiceId: string, eventConfig: EventConfig) => void,
  ): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    this._dungeonEventManager = bootstrap.getDungeonEventManager();
    this._roguelikeSystem = bootstrap.getRoguelikeSystem();
    this._runState = runState;
    this._onResolvedCallback = onResolved ?? null;
    this._onChoiceCallback = onChoice ?? null;

    // 从事件池中抽取事件
    const context: EventResolveContext = {
      playerId: 'player_001',
      correlationId: `event_ctx_${Date.now()}`,
      runState,
    };

    const eventConfig = this._dungeonEventManager.rollEvent(
      poolRefs,
      runState.resolvedEventIds,
      context,
    );

    if (!eventConfig) {
      console.log('[EventPanel] 无可抽取的事件');
      this.hide();
      return;
    }

    this._currentEventConfig = eventConfig;
    this._renderEvent(eventConfig);
    this.show();
  }

  /**
   * 直接展示指定事件配置。
   */
  showEvent(
    eventConfig: EventConfig,
    runState: DungeonRunState,
    onChoice?: (choiceId: string, eventConfig: EventConfig) => void,
  ): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    this._dungeonEventManager = bootstrap.getDungeonEventManager();
    this._roguelikeSystem = bootstrap.getRoguelikeSystem();
    this._currentEventConfig = eventConfig;
    this._runState = runState;
    this._onChoiceCallback = onChoice ?? null;

    this._renderEvent(eventConfig);
    this.show();
  }

  // ==================== 内部：渲染 ====================

  private _renderEvent(config: EventConfig): void {
    // 标题
    if (this.titleLabel) {
      this.titleLabel.string = config.nameKey;
    }

    // 描述
    if (this.descriptionLabel) {
      this.descriptionLabel.string = config.descriptionKey;
    }

    // 分类标签
    if (this.categoryLabel) {
      const categoryIcons: Record<string, string> = {
        reward: '🎁', battle: '⚔️', shop: '🛒', blessing: '✨',
        curse: '💀', story: '📖', boss: '👹', special: '🌟',
      };
      this.categoryLabel.string = `${categoryIcons[config.category] ?? '❓'} ${config.category}`;
    }

    // 选项按钮
    this._renderChoices(config);

    // 隐藏结算面板
    if (this.resultPanel) {
      this.resultPanel.active = false;
    }
  }

  private _renderChoices(config: EventConfig): void {
    if (!this.choiceContainer || !this.choiceButtonPrefab) return;

    this.choiceContainer.removeAllChildren();

    // 根据事件分类构建默认选择项
    const choices = this._buildDefaultChoices(config);

    for (const choice of choices) {
      const choiceNode = instantiate(this.choiceButtonPrefab);
      this._configureChoiceButton(choiceNode, choice);
      this.choiceContainer.addChild(choiceNode);
    }

    // 跳过按钮（story 类型不可跳过）
    if (this.skipButton) {
      this.skipButton.node.active = config.category !== 'story';
    }
  }

  private _buildDefaultChoices(config: EventConfig): EventChoiceUIData[] {
    switch (config.category) {
      case 'reward':
        return [
          { choiceId: 'accept', textKey: '领取奖励', rewardPreview: '金币 + 经验', isRisky: false },
        ];
      case 'battle':
        return [
          { choiceId: 'fight', textKey: '迎战！', rewardPreview: '战斗奖励 + 额外掉落', isRisky: true },
          { choiceId: 'flee', textKey: '回避', rewardPreview: '无奖励', isRisky: false },
        ];
      case 'shop':
        return [
          { choiceId: 'buy', textKey: '购买物品', rewardPreview: '消耗金币', isRisky: false },
          { choiceId: 'leave', textKey: '离开商店', rewardPreview: '无消耗', isRisky: false },
        ];
      case 'blessing':
        return [
          { choiceId: 'accept', textKey: '接受祝福', rewardPreview: '获得增益效果', isRisky: false },
        ];
      case 'curse':
        return [
          { choiceId: 'accept', textKey: '承受诅咒（获得补偿）', rewardPreview: '诅咒 + 补偿奖励', isRisky: true },
          { choiceId: 'resist', textKey: '抵抗诅咒', rewardPreview: '无效果', isRisky: false },
        ];
      case 'story':
        return [
          { choiceId: 'option_a', textKey: '选项 A：勇往直前', rewardPreview: '高风险，高回报', isRisky: true },
          { choiceId: 'option_b', textKey: '选项 B：谨慎行事', rewardPreview: '稳定奖励', isRisky: false },
          { choiceId: 'option_c', textKey: '选项 C：另辟蹊径', rewardPreview: '未知结果', isRisky: true },
        ];
      case 'boss':
        return [
          { choiceId: 'fight', textKey: '挑战 Boss！', rewardPreview: 'Boss 掉落', isRisky: true },
          { choiceId: 'avoid', textKey: '暂时回避', rewardPreview: '可稍后再战', isRisky: false },
        ];
      case 'special':
        return [
          { choiceId: 'investigate', textKey: '深入调查', rewardPreview: '特殊奖励', isRisky: true },
          { choiceId: 'ignore', textKey: '无视', rewardPreview: '无奖励', isRisky: false },
        ];
      default:
        return [
          { choiceId: 'continue', textKey: '继续', rewardPreview: '', isRisky: false },
        ];
    }
  }

  private _configureChoiceButton(choiceNode: Node, choice: EventChoiceUIData): void {
    const textLabel = choiceNode.getChildByName('TextLabel')?.getComponent(Label);
    const previewLabel = choiceNode.getChildByName('PreviewLabel')?.getComponent(Label);
    const riskIndicator = choiceNode.getChildByName('RiskIndicator');

    if (textLabel) textLabel.string = choice.textKey;
    if (previewLabel) previewLabel.string = choice.rewardPreview;
    if (riskIndicator) riskIndicator.active = choice.isRisky;

    choiceNode.on(Button.EventType.CLICK, () => {
      this._handleChoice(choice.choiceId);
    }, this);
  }

  private _showResult(resultText: string): void {
    if (this.resultPanel && this.resultTextLabel) {
      this.resultPanel.active = true;
      this.resultTextLabel.string = resultText;
    }

    // 隐藏选项容器
    if (this.choiceContainer) {
      this.choiceContainer.active = false;
    }

    if (this.skipButton) {
      this.skipButton.node.active = false;
    }
  }

  // ==================== 交互 ====================

  private _handleChoice(choiceId: string): void {
    if (!this._currentEventConfig || !this._runState) return;

    // 优先通过 onChoice 回调 → DungeonLoopController.resolveEventChoice
    if (this._onChoiceCallback) {
      try {
        this._onChoiceCallback(choiceId, this._currentEventConfig);
      } catch (e) {
        console.error(`[EventPanel] 事件选项回调失败: ${e}`);
      }
    }

    // 兜底：直接通过 DungeonEventManager 解析
    if (this._dungeonEventManager) {
      const context: EventResolveContext = {
        playerId: 'player_001',
        correlationId: `event_ctx_${Date.now()}`,
        runState: this._runState,
      };

      const result = this._dungeonEventManager.resolveEvent(this._currentEventConfig, context);
      result.eventId = this._currentEventConfig.id;

      const rewardCount = result.rewards.length;

      // 如果 onChoice 回调已经处理了结算，显示"已处理"
      if (this._onChoiceCallback) {
        this._showResult(`你选择了「${choiceId}」\n事件已处理`);
      } else {
        this._showResult(`你选择了「${choiceId}」\n获得 ${rewardCount} 个奖励`);
      }

      // 回调
      if (this._onResolvedCallback) {
        this._onResolvedCallback(result);
      }
    } else {
      this._showResult(`你选择了「${choiceId}」`);
    }
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    this.skipButton?.node.on(Button.EventType.CLICK, this._handleSkip, this);
    this.confirmButton?.node.on(Button.EventType.CLICK, this._handleConfirm, this);

    if (this.resultPanel) {
      this.resultPanel.active = false;
    }
  }

  private _handleSkip(): void {
    // 跳过事件，关闭面板
    if (this._onResolvedCallback) {
      const emptyResult: EventResult = {
        eventId: this._currentEventConfig?.id ?? '',
        rewards: [],
        emittedEvents: [],
        completedAt: Date.now(),
      };
      this._onResolvedCallback(emptyResult);
    }
    this.hide();
  }

  private _handleConfirm(): void {
    // 确认结算结果后关闭
    this.hide();
  }

  onDestroy(): void {
    super.onDestroy();
  }
}
