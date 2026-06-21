// ============================================================
// DungeonNodeMapPanel — Phase8 地牢节点地图面板
// 职责：可视化当前层的节点图 / 显示节点状态 / 处理分叉选择 / 触发节点进入
// 规范：继承 BasePanel / 纯 UI / 通过 Phase8Bootstrap 获取系统引用
// ============================================================

import { _decorator, Node, Label, Button, Prefab, instantiate } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import { DungeonLoopController, DungeonLoopEvent, type DungeonNodeProcessingResult, type DungeonBattleResult } from '../systems/DungeonLoopController';
import type { DungeonRunState, DungeonNodeView, NodeFork, NodeForkBranch } from '../data/roguelike_types';
import type { EventConfig } from '../data/event_types';
import type { DungeonNodeUIData, ForkChoiceUIData, ForkBranchUIData } from '../data/phase8_ui_types';
import { NODE_TYPE_ICON_MAP } from '../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('DungeonNodeMapPanel')
export class DungeonNodeMapPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '层标题标签' })
  layerTitleLabel: Label | null = null;

  @property({ type: Node, tooltip: '节点列表容器' })
  nodeListContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '节点项 Prefab' })
  nodeItemPrefab: Prefab | null = null;

  @property({ type: Node, tooltip: '分叉选择面板' })
  forkPanel: Node | null = null;

  @property({ type: Label, tooltip: '分叉标题' })
  forkTitleLabel: Label | null = null;

  @property({ type: Node, tooltip: '分叉选项容器' })
  forkChoiceContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '分叉选项 Prefab' })
  forkChoicePrefab: Prefab | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Label, tooltip: '节点类型筛选标签（调试用）' })
  infoLabel: Label | null = null;

  // ==================== 内部状态 ====================

  private _roguelikeSystem: RoguelikeSystem | null = null;
  private _dungeonLoopController: DungeonLoopController | null = null;
  private _activeRunState: DungeonRunState | null = null;
  private _availableNodes: DungeonNodeView[] = [];
  private _pendingFork: NodeFork | null = null;
  private _pendingEventConfig: EventConfig | null = null;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    em.on(RoguelikeSystem.NODE_ENTERED, this._onNodeEntered, this);
    em.on(RoguelikeSystem.BRANCH_CHOSEN, this._onBranchChosen, this);
    em.on(RoguelikeSystem.LAYER_COMPLETED, this._onLayerCompleted, this);
    // DungeonLoop 事件
    em.on(DungeonLoopEvent.NODE_PROCESSED, this._onNodeProcessed, this);
    em.on(DungeonLoopEvent.REWARDS_SETTLED, this._onRewardsSettled, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off(RoguelikeSystem.NODE_ENTERED, this._onNodeEntered, this);
    em.off(RoguelikeSystem.BRANCH_CHOSEN, this._onBranchChosen, this);
    em.off(RoguelikeSystem.LAYER_COMPLETED, this._onLayerCompleted, this);
    em.off(DungeonLoopEvent.NODE_PROCESSED, this._onNodeProcessed, this);
    em.off(DungeonLoopEvent.REWARDS_SETTLED, this._onRewardsSettled, this);
  }

  // ==================== 公开方法 ====================

  /**
   * 使用运行状态刷新并显示节点地图。
   */
  refreshWithRunState(runState: DungeonRunState): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    this._roguelikeSystem = bootstrap.getRoguelikeSystem();
    this._dungeonLoopController = bootstrap.getDungeonLoopController();
    this._activeRunState = runState;

    // 获取可用节点
    this._availableNodes = this._roguelikeSystem.getAvailableNodes(runState);

    // 检查分叉
    this._pendingFork = this._roguelikeSystem.getNodeForks(runState);

    // 渲染节点列表
    this._renderNodeMap();

    // 处理分叉显示
    if (this._pendingFork) {
      this._showForkPanel(this._pendingFork);
    } else {
      this._hideForkPanel();
    }

    this.show();
  }

  // ==================== 内部：节点地图渲染 ====================

  private _renderNodeMap(): void {
    if (!this.nodeListContainer || !this.nodeItemPrefab) return;

    this.nodeListContainer.removeAllChildren();

    if (!this._activeRunState) return;

    const config = this._roguelikeSystem?.getDungeonConfig(this._activeRunState.dungeonId);
    const layer = config?.layers.find((l) => l.id === this._activeRunState!.currentLayerId);

    if (!layer) return;

    if (this.layerTitleLabel) {
      const layerIndex = config?.layers.findIndex((l) => l.id === layer.id) ?? 0;
      this.layerTitleLabel.string = `第 ${layerIndex + 1} 层`;
    }

    // 渲染所有节点
    for (const nodeConfig of layer.nodeGraph) {
      const nodeUIData = this._buildNodeUIData(
        nodeConfig.id,
        nodeConfig.type,
        this._activeRunState,
      );
      const itemNode = instantiate(this.nodeItemPrefab);
      this._configureNodeItem(itemNode, nodeUIData);
      this.nodeListContainer.addChild(itemNode);
    }

    if (this.infoLabel) {
      this.infoLabel.string = `已访问: ${this._activeRunState.visitedNodeIds.length} | 可用: ${this._availableNodes.length}`;
    }
  }

  private _buildNodeUIData(
    nodeId: string,
    nodeType: DungeonNodeView['type'],
    runState: DungeonRunState,
  ): DungeonNodeUIData {
    let nodeStatus: DungeonNodeUIData['nodeStatus'];

    if (nodeId === runState.currentNodeId) {
      nodeStatus = 'current';
    } else if (runState.visitedNodeIds.includes(nodeId)) {
      nodeStatus = 'visited';
    } else if (this._isNodeAvailable(nodeId)) {
      nodeStatus = 'available';
    } else {
      nodeStatus = 'locked';
    }

    const typeLabels: Record<string, string> = {
      battle: '⚔️ 战斗',
      event: '❓ 事件',
      boss: '👹 Boss',
      reward: '🎁 奖励',
      shop: '🛒 商店',
      empty: '⬜ 空地',
    };

    return {
      nodeId,
      nodeType,
      nodeStatus,
      iconPath: NODE_TYPE_ICON_MAP[nodeType] ?? 'textures/icons/node_empty',
      label: typeLabels[nodeType] ?? nodeType,
    };
  }

  private _isNodeAvailable(nodeId: string): boolean {
    return this._availableNodes.some((n) => n.nodeId === nodeId);
  }

  private _configureNodeItem(itemNode: Node, data: DungeonNodeUIData): void {
    const iconLabel = itemNode.getChildByName('Icon')?.getComponent(Label);
    const nameLabel = itemNode.getChildByName('NameLabel')?.getComponent(Label);
    const statusIndicator = itemNode.getChildByName('StatusIndicator');
    const enterBtn = itemNode.getChildByName('EnterButton')?.getComponent(Button);

    if (iconLabel) iconLabel.string = data.label.substring(0, 2);
    if (nameLabel) nameLabel.string = data.label;

    // 状态指示器颜色
    if (statusIndicator) {
      const sprite = statusIndicator.getComponent('cc.Sprite');
      // 不同状态不同颜色会在 Prefab 层面通过材质设置
    }

    // 可进入的节点显示进入按钮
    if (enterBtn) {
      enterBtn.node.active = data.nodeStatus === 'available';
      enterBtn.node.on(Button.EventType.CLICK, () => {
        this._handleEnterNode(data.nodeId);
      }, this);
    }
  }

  // ==================== 分叉面板 ====================

  private _showForkPanel(fork: NodeFork): void {
    if (!this.forkPanel || !this.forkChoiceContainer || !this.forkChoicePrefab) return;

    this.forkPanel.active = true;
    this.forkChoiceContainer.removeAllChildren();

    if (this.forkTitleLabel) {
      this.forkTitleLabel.string = '选择前进方向';
    }

    for (const branch of fork.branches) {
      const choiceNode = instantiate(this.forkChoicePrefab);
      this._configureForkChoice(choiceNode, branch);
      this.forkChoiceContainer.addChild(choiceNode);
    }
  }

  private _configureForkChoice(choiceNode: Node, branch: NodeForkBranch): void {
    const label = choiceNode.getChildByName('ChoiceLabel')?.getComponent(Label);
    const preview = choiceNode.getChildByName('PreviewLabel')?.getComponent(Label);
    const btn = choiceNode.getComponent(Button);

    if (label) label.string = branch.labelKey ?? branch.nodeType;
    if (preview) preview.string = branch.previewKey ?? '';

    choiceNode.on(Button.EventType.CLICK, () => {
      this._handleChooseBranch(branch.nodeId);
    }, this);
  }

  private _hideForkPanel(): void {
    if (this.forkPanel) {
      this.forkPanel.active = false;
    }
  }

  // ==================== 交互 ====================

  private _handleEnterNode(nodeId: string): void {
    if (!this._roguelikeSystem || !this._activeRunState) return;

    const loopController = this._dungeonLoopController;
    if (!loopController) {
      // 回退：直接调用 enterNode（无闭环处理）
      const result = this._roguelikeSystem.enterNode(this._activeRunState, nodeId);
      this._activeRunState = result.runState;
      this._availableNodes = this._roguelikeSystem.getAvailableNodes(this._activeRunState);
      this._renderNodeMap();
      return;
    }

    // 通过闭环控制器处理节点
    loopController.processNode(this._activeRunState, nodeId)
      .then((result: DungeonNodeProcessingResult) => {
        this._activeRunState = result.runState;
        this._availableNodes = this._roguelikeSystem!.getAvailableNodes(this._activeRunState);
        this._renderNodeMap();
        this._afterNodeProcessed(result);
      })
      .catch((err) => {
        console.error(`[DungeonNodeMapPanel] 节点处理失败: ${err}`);
      });
  }

  /**
   * 节点处理完成后的 UI 路由。
   * - 事件节点：打开 EventPanel 让玩家选择
   * - 战斗/Boss/奖励节点：显示结算面板
   */
  private _afterNodeProcessed(result: DungeonNodeProcessingResult): void {
    // 事件节点需要玩家选择 → 委托给 UI 管理器
    if (result.nodeType === 'event' && result.eventResult) {
      this._pendingEventConfig = {
        id: result.eventResult.eventId,
        category: 'story', // 由 rollEvent 结果决定实际类别
        nameKey: `事件_${result.nodeId}`,
        descriptionKey: '',
        weight: 10,
      } as EventConfig;

      // 通知 UI 管理器打开事件面板
      EventManager.getInstance().emit('dungeonNodeMap:showEvent', {
        nodeId: result.nodeId,
        eventResult: result.eventResult,
        runState: result.runState,
      });
      return;
    }

    // 战斗/Boss/奖励节点 → 通知结算面板
    if (result.battleResult) {
      EventManager.getInstance().emit('dungeonNodeMap:showBattleResult', {
        nodeId: result.nodeId,
        nodeType: result.nodeType,
        battleResult: result.battleResult,
        settlementResult: result.settlementResult,
        runState: result.runState,
      });
    } else if (result.settlementResult && result.settlementResult.totalGold + result.settlementResult.totalExp > 0) {
      EventManager.getInstance().emit('dungeonNodeMap:showRewardResult', {
        nodeId: result.nodeId,
        nodeType: result.nodeType,
        settlementResult: result.settlementResult,
        runState: result.runState,
      });
    }
  }

  private _handleChooseBranch(nodeId: string): void {
    if (!this._roguelikeSystem || !this._activeRunState) return;

    const result = this._roguelikeSystem.chooseBranch(this._activeRunState, nodeId);
    this._activeRunState = result.state;
    this._pendingFork = null;
    this._hideForkPanel();

    // 进入选择的节点
    this._handleEnterNode(nodeId);
  }

  // ==================== 事件响应 ====================

  private _onNodeEntered(_data: unknown): void {
    if (!this._isShowing || !this._activeRunState) return;
    this._renderNodeMap();
  }

  private _onBranchChosen(_data: unknown): void {
    this._hideForkPanel();
  }

  private _onLayerCompleted(_data: unknown): void {
    if (!this._isShowing) return;
    // 层完成后刷新到新层的地图
    this._renderNodeMap();
  }

  private _onNodeProcessed(data: unknown): void {
    if (!this._isShowing) return;
    // 节点处理完成后刷新地图（已在上面的 _afterNodeProcessed 中调用）
    // 此处作为兜底刷新
    this._renderNodeMap();
  }

  private _onRewardsSettled(data: unknown): void {
    // 奖励结算后刷新 HUD 中的资源显示
    // HUD 自己监听此事件，这里做兜底日志
    console.log('[DungeonNodeMapPanel] 奖励已结算');
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    this.closeButton?.node.on(Button.EventType.CLICK, this._handleClose, this);
    this.forkPanel && (this.forkPanel.active = false);
  }

  private _handleClose(): void {
    this.hide();
  }

  onDestroy(): void {
    super.onDestroy();
  }
}
