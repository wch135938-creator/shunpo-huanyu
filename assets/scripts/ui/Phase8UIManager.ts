// ============================================================
// Phase8UIManager — Phase8 UI 层中央协调器
// 职责：管理所有 7 个 Panel 的生命周期 / 显示隐藏 / 事件转发 / 安全区适配
// 规范：纯 UI 协调层，不包含业务逻辑 / 不直接操作数据
//
// 使用方式：
//   1. 将此组件挂载到场景根节点（如 Canvas/Phase8UIRoot）
//   2. 在编辑器中绑定各 Panel 节点引用
//   3. 游戏启动后调用 initialize() 完成初始化
// ============================================================

import { _decorator, Component, Node } from 'cc';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap, Phase8Event } from '../systems/Phase8Bootstrap';
import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import { DungeonLoopController, DungeonLoopEvent } from '../systems/DungeonLoopController';
import { DungeonPanel } from './DungeonPanel';
import { DungeonNodeMapPanel } from './DungeonNodeMapPanel';
import { RoguelikeHUD } from './RoguelikeHUD';
import { ArtifactPanel } from './ArtifactPanel';
import { LiveOpsPanel } from './LiveOpsPanel';
import { EventPanel } from './EventPanel';
import { ResultPanel } from './ResultPanel';
import type { DungeonRunState, DungeonRunResult } from '../data/roguelike_types';
import type { EventConfig, EventResult } from '../data/event_types';
import type { ResultPanelUIData } from '../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('Phase8UIManager')
export class Phase8UIManager extends Component {
  // ==================== 编辑器绑定：面板节点 ====================

  @property({ type: DungeonPanel, tooltip: '地牢选择面板' })
  dungeonPanel: DungeonPanel | null = null;

  @property({ type: DungeonNodeMapPanel, tooltip: '地牢节点地图面板' })
  nodeMapPanel: DungeonNodeMapPanel | null = null;

  @property({ type: RoguelikeHUD, tooltip: '地牢内 HUD' })
  roguelikeHUD: RoguelikeHUD | null = null;

  @property({ type: ArtifactPanel, tooltip: '神器管理面板' })
  artifactPanel: ArtifactPanel | null = null;

  @property({ type: LiveOpsPanel, tooltip: '运营活动面板' })
  liveOpsPanel: LiveOpsPanel | null = null;

  @property({ type: EventPanel, tooltip: '随机事件面板' })
  eventPanel: EventPanel | null = null;

  @property({ type: ResultPanel, tooltip: '战斗/事件结算面板' })
  resultPanel: ResultPanel | null = null;

  // ==================== 编辑器绑定：容器节点 ====================

  @property({ type: Node, tooltip: '面板根容器（所有面板的父节点）' })
  panelContainer: Node | null = null;

  // ==================== 内部状态 ====================

  private _initialized = false;
  private _activeRunState: DungeonRunState | null = null;
  private _playerPower = 0;
  private _dungeonLoopController: DungeonLoopController | null = null;

  // ==================== Cocos 生命周期 ====================

  onLoad(): void {
    this._registerBootstrapEvents();
    this._hideAllPanels();
  }

  onDestroy(): void {
    EventManager.getInstance().offTarget(this);
  }

  // ==================== 初始化 ====================

  /** 初始化 UI 管理器（在 Phase8Bootstrap ready 后调用） */
  initialize(): void {
    if (this._initialized) return;

    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) {
      console.warn('[Phase8UIManager] Bootstrap 尚未就绪，延后初始化');
      return;
    }

    this._dungeonLoopController = bootstrap.getDungeonLoopController();
    this._initialized = true;
    console.log('[Phase8UIManager] INIT');
    console.log('[Phase8UIManager] UI 管理器初始化完成');
  }

  // ==================== 面板打开 API ====================

  /** 打开地牢选择面板 */
  openDungeonPanel(playerPower: number = 0): void {
    console.log('[Phase8UIManager] OPEN_DUNGEON_PANEL');
    this._playerPower = playerPower;
    this._ensureInitialized();

    this._hideAllExcept(null);
    this.dungeonPanel?.open(playerPower);
  }

  /** 打开地牢节点地图面板 */
  openNodeMapPanel(runState: DungeonRunState): void {
    this._ensureInitialized();
    this._activeRunState = runState;

    this._hideAllExcept(this.nodeMapPanel);
    this.nodeMapPanel?.refreshWithRunState(runState);
  }

  /** 打开神器面板 */
  openArtifactPanel(): void {
    this._ensureInitialized();

    this._hideAllExcept(this.artifactPanel);
    this.artifactPanel?.open();
  }

  /** 打开运营活动面板 */
  openLiveOpsPanel(): void {
    this._ensureInitialized();

    this._hideAllExcept(this.liveOpsPanel);
    this.liveOpsPanel?.open();
  }

  /** 打开随机事件面板 */
  openEventPanel(
    poolRefs: string[],
    runState: DungeonRunState,
    onResolved?: (result: any) => void,
  ): void {
    this._ensureInitialized();
    this._activeRunState = runState;

    // EventPanel 以 overlay 方式展示，不隐藏其他面板
    this.eventPanel?.showRandomEvent(poolRefs, runState, onResolved);
  }

  /** 直接展示指定事件 */
  showEvent(eventConfig: EventConfig, runState: DungeonRunState): void {
    this._ensureInitialized();

    this.eventPanel?.showEvent(eventConfig, runState);
  }

  /** 打开结算面板 */
  openResultPanel(
    uiData: ResultPanelUIData,
    callbacks?: { onContinue?: () => void; onReturn?: () => void },
  ): void {
    this._ensureInitialized();

    // 结算面板以 overlay 方式展示
    this.resultPanel?.showResult(uiData, callbacks);
  }

  /** 根据 DungeonRunResult 显示结算 */
  showRunResult(runResult: DungeonRunResult): void {
    this._ensureInitialized();

    this.resultPanel?.showFromRunResult(runResult);
  }

  // ==================== HUD 控制 ====================

  /** 激活地牢 HUD */
  activateHUD(runState: DungeonRunState): void {
    this._ensureInitialized();
    this._activeRunState = runState;

    this.roguelikeHUD?.refreshWithRunState(runState);
    this.roguelikeHUD?.show();
  }

  /** 刷新 HUD */
  refreshHUD(runState: DungeonRunState): void {
    this._activeRunState = runState;
    this.roguelikeHUD?.refreshWithRunState(runState);
  }

  /** 隐藏 HUD */
  hideHUD(): void {
    this.roguelikeHUD?.hide();
  }

  // ==================== 面板查询 ====================

  /** 获取当前活跃的运行状态 */
  getActiveRunState(): DungeonRunState | null {
    return this._activeRunState;
  }

  /** 检查是否有面板正在显示 */
  isAnyPanelShowing(): boolean {
    return (
      (this.dungeonPanel?.isShowing() ?? false) ||
      (this.nodeMapPanel?.isShowing() ?? false) ||
      (this.roguelikeHUD?.isShowing() ?? false) ||
      (this.artifactPanel?.isShowing() ?? false) ||
      (this.liveOpsPanel?.isShowing() ?? false) ||
      (this.eventPanel?.isShowing() ?? false) ||
      (this.resultPanel?.isShowing() ?? false)
    );
  }

  /** 隐藏所有面板 */
  hideAllPanels(): void {
    this._hideAllPanels();
  }

  // ==================== 内部方法 ====================

  private _ensureInitialized(): void {
    if (!this._initialized) {
      this.initialize();
    }
  }

  /** 隐藏所有面板 */
  private _hideAllPanels(): void {
    this.dungeonPanel?.hide();
    this.nodeMapPanel?.hide();
    this.roguelikeHUD?.hide();
    this.artifactPanel?.hide();
    this.liveOpsPanel?.hide();
    this.eventPanel?.hide();
    this.resultPanel?.hide();
  }

  /** 隐藏除指定面板外的所有面板 */
  private _hideAllExcept(keepPanel: Component | null): void {
    if (this.dungeonPanel !== keepPanel) this.dungeonPanel?.hide();
    if (this.nodeMapPanel !== keepPanel) this.nodeMapPanel?.hide();
    if (this.roguelikeHUD !== keepPanel) this.roguelikeHUD?.hide();
    if (this.artifactPanel !== keepPanel) this.artifactPanel?.hide();
    if (this.liveOpsPanel !== keepPanel) this.liveOpsPanel?.hide();
    if (this.eventPanel !== keepPanel) this.eventPanel?.hide();
    if (this.resultPanel !== keepPanel) this.resultPanel?.hide();
  }

  // ==================== 事件注册 ====================

  private _registerBootstrapEvents(): void {
    const em = EventManager.getInstance();

    // Bootstrap 就绪后自动初始化
    em.on(Phase8Event.BOOTSTRAP_READY, () => {
      this.initialize();
    }, this);

    // 运行生命周期事件 → 自动切换面板
    em.on(RoguelikeSystem.RUN_STARTED, (runState: unknown) => {
      const state = runState as DungeonRunState;
      if (state) {
        this._activeRunState = state;
        this.activateHUD(state);
        this.openNodeMapPanel(state);
      }
    }, this);

    em.on(RoguelikeSystem.RUN_COMPLETED, (runState: unknown) => {
      const state = runState as DungeonRunState;
      if (state) {
        this.hideHUD();
      }
    }, this);

    // NodeMapPanel → UIManager 协调事件
    em.on('dungeonNodeMap:showEvent', this._onNodeMapRequestShowEvent, this);
    em.on(DungeonLoopEvent.NODE_PROCESSED, this._onLoopNodeProcessed, this);
  }

  // ==================== 协调方法：事件选择 → 闭环控制器 ====================

  /**
   * NodeMapPanel 请求显示事件。
   * 打开 EventPanel 并注入 onChoice 回调，将选择路由到 DungeonLoopController。
   */
  private _onNodeMapRequestShowEvent(data: unknown): void {
    const payload = data as {
      nodeId?: string;
      eventResult?: EventResult;
      runState?: DungeonRunState;
    };
    if (!payload || !payload.runState) return;

    const eventResult = payload.eventResult;
    if (!eventResult) return;

    // 构建简单的 EventConfig 用于显示
    const eventConfig: EventConfig = {
      id: eventResult.eventId || payload.nodeId || 'event_unknown',
      category: 'story',
      nameKey: `事件_${payload.nodeId || 'unknown'}`,
      descriptionKey: '地牢中的随机事件...',
      weight: 10,
    };

    // 注入 onChoice 回调：路由到 DungeonLoopController.resolveEventChoice
    const loopController = this._dungeonLoopController;
    const runState = payload.runState;

    this.eventPanel?.showEvent(eventConfig, runState, (choiceId: string, config: EventConfig) => {
      if (loopController && runState) {
        try {
          loopController.resolveEventChoice(runState, config, choiceId);
          console.log(`[Phase8UIManager] 事件选择已处理: ${choiceId}`);
        } catch (e) {
          console.error(`[Phase8UIManager] 事件选择处理失败: ${e}`);
        }
      }
    });
  }

  /**
   * DungeonLoop NODE_PROCESSED 后的 UI 协调。
   * 根据节点类型自动打开对应的结算面板。
   */
  private _onLoopNodeProcessed(data: unknown): void {
    const result = data as import('../systems/DungeonLoopController').DungeonNodeProcessingResult;
    if (!result) return;

    // 事件节点已通过 _onNodeMapRequestShowEvent 处理，此处仅处理战斗/奖励
    if (result.nodeType === 'event') return;

    // 打开结算面板
    this.resultPanel?.showNodeResult(result);
  }

  /** 获取 DungeonLoopController 引用 */
  getDungeonLoopController(): DungeonLoopController | null {
    return this._dungeonLoopController;
  }

  // ==================== 调试 ====================

  /** 获取面板状态摘要（调试用） */
  getPanelStatusSummary(): string {
    const panels: [string, boolean][] = [
      ['DungeonPanel', this.dungeonPanel?.isShowing() ?? false],
      ['NodeMapPanel', this.nodeMapPanel?.isShowing() ?? false],
      ['RoguelikeHUD', this.roguelikeHUD?.isShowing() ?? false],
      ['ArtifactPanel', this.artifactPanel?.isShowing() ?? false],
      ['LiveOpsPanel', this.liveOpsPanel?.isShowing() ?? false],
      ['EventPanel', this.eventPanel?.isShowing() ?? false],
      ['ResultPanel', this.resultPanel?.isShowing() ?? false],
    ];

    return panels
      .map(([name, showing]) => `${name}: ${showing ? '显示' : '隐藏'}`)
      .join('\n');
  }
}
