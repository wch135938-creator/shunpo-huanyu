// ============================================================
// RoguelikeSystem — Phase7 图节点地牢运行引擎
// 职责：基于节点图的地牢运行管理 / 节点进入与事件解决 / 层推进与通关
// 边界：纯领域逻辑，不实现 UI、不直接写存档、不直接操作战斗
//
// 与 Phase6 DungeonSystem 的关系：
//   RoguelikeSystem 是新增系统，负责图节点地牢的运行时推进逻辑。
//   DungeonSystem 保留用于 Phase6 兼容（体力、每日限制等）。
//   两者并存，不互相替代。
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { DomainEventBus } from './DomainEventBus';
import { EventManager } from '../core/EventManager';
import type {
  DungeonConfigV2,
  DungeonRunState,
  DungeonNodeView,
  DungeonNodeResult,
  DungeonEventResult,
  DungeonProgressResult,
  DungeonLayerResult,
  DungeonRunResult,
  BattleRequest,
  EventChoice,
  RewardSource,
  RewardGrant,
  ValidationWarning,
  DungeonNodeConfig,
  DungeonLayerConfig,
  NodeFork,
  NodeForkBranch,
  BranchPath,
  FloorTransition,
  RoguelikeSaveData,
} from '../data/roguelike_types';
import {
  generateRunId,
  generateSeed,
  generateEventId,
  DomainEventType,
  createDefaultRoguelikeSaveData,
} from '../data/roguelike_types';

// ---- 常量 ----

/** 默认玩家 ID */
const DEFAULT_PLAYER_ID = 'player_001';

/** 节点视图映射：从配置生成对外暴露的节点信息 */
function toNodeView(
  node: DungeonNodeConfig,
  state: DungeonRunState,
  branchLabel?: string,
  branchPreview?: string,
): DungeonNodeView {
  const canEnter = !state.visitedNodeIds.includes(node.id);

  return {
    nodeId: node.id,
    type: node.type,
    canEnter,
    blockReason: canEnter ? undefined : '已访问',
    branchLabel,
    branchPreview,
  };
}

export class RoguelikeSystem extends BaseSystem {
  // ==================== 事件常量 ====================

  static readonly RUN_STARTED = 'roguelike:runStarted';
  static readonly NODE_ENTERED = 'roguelike:nodeEntered';
  static readonly EVENT_RESOLVED = 'roguelike:eventResolved';
  static readonly NODE_COMPLETED = 'roguelike:nodeCompleted';
  static readonly LAYER_COMPLETED = 'roguelike:layerCompleted';
  static readonly RUN_COMPLETED = 'roguelike:runCompleted';
  // Phase7-Step2: Branch/Fork 事件
  static readonly BRANCH_CHOSEN = 'roguelike:branchChosen';
  static readonly FLOOR_TRANSITIONED = 'roguelike:floorTransitioned';
  static readonly RUN_SAVED = 'roguelike:runSaved';

  // ==================== 内部状态 ====================

  /** 地牢配置缓存：dungeonId → DungeonConfigV2 */
  private _configMap: Map<string, DungeonConfigV2> = new Map();

  /** 活跃运行状态：runId → DungeonRunState */
  private _activeRuns: Map<string, DungeonRunState> = new Map();

  /** 领域事件总线 */
  private _eventBus: DomainEventBus;

  /** 配置是否已加载 */
  private _configLoaded = false;

  /** 活跃的关联 ID */
  private _activeCorrelationId: string | null = null;

  // ==================== 构造 ====================

  constructor() {
    super();
    this._eventBus = new DomainEventBus();
  }

  // ==================== 配置管理 ====================

  /**
   * 通过编程方式注册地牢配置（不依赖 JSON 文件加载）。
   *
   * 调用方在初始化阶段传入 DungeonConfigV2 数组。
   *
   * @param configs  地牢配置数组
   */
  registerConfigs(configs: DungeonConfigV2[]): void {
    this._configMap.clear();

    for (const config of configs) {
      if (!config.id) {
        throw new Error('[RoguelikeSystem] 地牢配置缺少 id');
      }
      this._configMap.set(config.id, config);
    }

    this._configLoaded = this._configMap.size > 0;
  }

  /** 是否已加载配置 */
  isConfigLoaded(): boolean {
    return this._configLoaded;
  }

  /** 获取领域事件总线（供外部订阅） */
  getDomainEventBus(): DomainEventBus {
    return this._eventBus;
  }

  // ==================== 核心 API：startRun ====================

  /**
   * 开始一次地牢冒险。
   *
   * 流程：
   * 1. 查找地牢配置
   * 2. 创建 DungeonRunState（从第一层第一个入口节点开始）
   * 3. 开始新的关联上下文
   * 4. 发布 DungeonRunStarted 领域事件
   *
   * @param dungeonId  地牢配置 ID
   * @param playerId   玩家 ID
   * @param seed       随机种子（可选，不提供则自动生成）
   * @returns          运行状态；地牢不存在时返回 null
   */
  startRun(
    dungeonId: string,
    playerId: string = DEFAULT_PLAYER_ID,
    seed?: string,
  ): DungeonRunState | null {
    this._requireConfig();

    const config = this._configMap.get(dungeonId);
    if (!config) {
      console.warn(`[RoguelikeSystem] 地牢配置不存在: ${dungeonId}`);
      return null;
    }

    // 开始关联上下文
    this._activeCorrelationId = this._eventBus.beginCorrelation(`dungeon_run_${dungeonId}`);

    // 获取第一层和入口节点
    const firstLayer = config.layers[0];
    const entryNodeId = firstLayer.nodeGraph[0].id;

    // 创建运行状态
    const runState: DungeonRunState = {
      runId: generateRunId(),
      dungeonId,
      dungeonVersion: config.version,
      seed: seed ?? generateSeed(),
      currentLayerId: firstLayer.id,
      currentNodeId: entryNodeId,
      visitedNodeIds: [entryNodeId],
      resolvedEventIds: [],
      defeatedBossIds: [],
      pendingRewards: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this._activeRuns.set(runState.runId, runState);

    // 发布领域事件
    this._publishEvent(
      DomainEventType.DUNGEON_RUN_STARTED,
      {
        dungeonId,
        dungeonVersion: config.version,
        runId: runState.runId,
        seed: runState.seed,
        totalLayers: config.layers.length,
      },
      dungeonId,
      playerId,
    );

    // 通过 EventManager 广播（兼容现有订阅者）
    EventManager.getInstance().emit(RoguelikeSystem.RUN_STARTED, runState);

    return runState;
  }

  // ==================== 核心 API：getAvailableNodes ====================

  /**
   * 获取当前节点可到达的下一个节点列表。
   *
   * @param state  运行状态
   * @returns      可用节点视图列表；状态不存在时返回空数组
   */
  getAvailableNodes(state: DungeonRunState): DungeonNodeView[] {
    const config = this._configMap.get(state.dungeonId);
    if (!config) return [];

    const layer = this._findLayer(config, state.currentLayerId);
    if (!layer) return [];

    const currentNode = layer.nodeGraph.find((n) => n.id === state.currentNodeId);
    if (!currentNode) return [];

    return currentNode.nextNodeIds
      .map((nextId) => {
        const nextNode = layer.nodeGraph.find((n) => n.id === nextId);
        if (!nextNode) return null;
        return toNodeView(nextNode, state);
      })
      .filter((v): v is DungeonNodeView => v !== null);
  }

  // ==================== Phase7-Step2: 节点分叉 API ====================

  /**
   * 获取当前节点的分叉信息。
   *
   * 当节点有多个 nextNodeIds 时，构建 NodeFork 供 UI 展示选择面板。
   * 如果只有一个后继节点，返回 null（无需选择）。
   *
   * @param state  运行状态
   * @returns      分叉信息；无可选分支时返回 null
   */
  getNodeForks(state: DungeonRunState): NodeFork | null {
    const config = this._configMap.get(state.dungeonId);
    if (!config) return null;

    const layer = this._findLayer(config, state.currentLayerId);
    if (!layer) return null;

    const currentNode = layer.nodeGraph.find((n) => n.id === state.currentNodeId);
    if (!currentNode || currentNode.nextNodeIds.length <= 1) {
      // 单路径或终节点 — 无需分叉选择
      return null;
    }

    const branches: NodeForkBranch[] = [];
    for (const nextId of currentNode.nextNodeIds) {
      const nextNode = layer.nodeGraph.find((n) => n.id === nextId);
      if (!nextNode) continue;

      branches.push({
        nodeId: nextNode.id,
        nodeType: nextNode.type,
        labelKey: nextNode.eventRefs?.[0] ?? undefined,
        previewKey: this._deriveBranchPreview(nextNode),
      });
    }

    if (branches.length <= 1) return null;

    return {
      sourceNodeId: currentNode.id,
      branches,
      createdAt: Date.now(),
    };
  }

  /**
   * 从节点类型派生分支预览文本 Key。
   */
  private _deriveBranchPreview(node: DungeonNodeConfig): string | undefined {
    switch (node.type) {
      case 'battle': return 'branch.preview.battle';
      case 'boss': return 'branch.preview.boss';
      case 'event': return 'branch.preview.event';
      case 'reward': return 'branch.preview.reward';
      case 'shop': return 'branch.preview.shop';
      case 'empty': return 'branch.preview.empty';
      default: return undefined;
    }
  }

  /**
   * 在分叉点选择一条分支。
   *
   * 记录 BranchPath 历史，发布分支选择领域事件。
   *
   * @param state         运行状态（原地修改）
   * @param chosenNodeId  选择的分支节点 ID
   * @returns             更新后的运行状态和分支路径
   */
  chooseBranch(
    state: DungeonRunState,
    chosenNodeId: string,
  ): { state: DungeonRunState; branchPath: BranchPath } {
    const config = this._configMap.get(state.dungeonId);
    const layer = config ? this._findLayer(config, state.currentLayerId) : undefined;
    const currentNode = layer?.nodeGraph.find((n) => n.id === state.currentNodeId);

    const skippedNodeIds = currentNode
      ? currentNode.nextNodeIds.filter((id) => id !== chosenNodeId)
      : [];

    const branchPath: BranchPath = {
      forkNodeId: state.currentNodeId,
      chosenNodeId,
      skippedNodeIds,
      chosenAt: Date.now(),
    };

    // 初始化分支历史
    if (!state.branchHistory) {
      state.branchHistory = [];
    }
    state.branchHistory.push(branchPath);
    state.updatedAt = Date.now();

    // 发布分支选择领域事件
    this._publishEvent(
      'DungeonBranchChosen',
      {
        forkNodeId: branchPath.forkNodeId,
        chosenNodeId,
        skippedNodeIds,
        branchIndex: state.branchHistory.length - 1,
      },
      state.dungeonId,
      DEFAULT_PLAYER_ID,
    );

    // 通过 EventManager 广播
    EventManager.getInstance().emit(RoguelikeSystem.BRANCH_CHOSEN, branchPath);

    return { state, branchPath };
  }

  // ==================== Phase7-Step2: 楼层转换 API ====================

  /**
   * 执行楼层转换——从当前层过渡到下一层。
   *
   * 记录 FloorTransition 历史，发布楼层转换领域事件。
   *
   * @param state     运行状态（原地修改）
   * @param toLayerId 目标层 ID
   * @param toNodeId  目标节点 ID
   * @returns         楼层转换记录
   */
  transitionFloor(
    state: DungeonRunState,
    toLayerId: string,
    toNodeId: string,
    direction: FloorTransition['direction'] = 'forward',
    reason: FloorTransition['reason'] = 'layerComplete',
  ): FloorTransition {
    const transition: FloorTransition = {
      transitionId: generateEventId(),
      fromLayerId: state.currentLayerId,
      toLayerId,
      fromNodeId: state.currentNodeId,
      toNodeId,
      direction,
      reason,
      transitionedAt: Date.now(),
    };

    // 更新状态
    state.currentLayerId = toLayerId;
    state.currentNodeId = toNodeId;
    if (!state.visitedNodeIds.includes(toNodeId)) {
      state.visitedNodeIds.push(toNodeId);
    }

    // 初始化楼层转换历史
    if (!state.floorTransitions) {
      state.floorTransitions = [];
    }
    state.floorTransitions.push(transition);
    state.updatedAt = Date.now();

    // 发布领域事件
    this._publishEvent(
      'DungeonFloorTransitioned',
      {
        transition,
        floorIndex: state.floorTransitions.length - 1,
      },
      state.dungeonId,
      DEFAULT_PLAYER_ID,
    );

    // 通过 EventManager 广播
    EventManager.getInstance().emit(RoguelikeSystem.FLOOR_TRANSITIONED, transition);

    return transition;
  }

  // ==================== Phase7-Step2: 持久化 API ====================

  /**
   * 从 RoguelikeSaveData 加载运行状态。
   *
   * 用法：SaveManager 加载存档后调用，恢复未完成的地牢 run。
   *
   * @param saveData  Roguelike 存档数据
   * @returns        恢复的运行状态；无活跃 run 时返回 null
   */
  loadRunFromSaveData(saveData: RoguelikeSaveData): DungeonRunState | null {
    if (!saveData.activeRun) return null;

    // 恢复活跃运行到内存
    this._activeRuns.set(saveData.activeRun.runId, saveData.activeRun);

    // 开始新的关联上下文（恢复需要可追溯）
    this._activeCorrelationId = this._eventBus.beginCorrelation(
      `dungeon_restore_${saveData.activeRun.dungeonId}`,
    );

    return saveData.activeRun;
  }

  /**
   * 将活跃运行状态导出到 RoguelikeSaveData。
   *
   * 用法：SaveManager 保存前调用，将内存中的活跃 run 同步到存档结构。
   *
   * @param runId    活跃运行 ID
   * @param saveData 目标存档数据（原地修改）
   * @returns        是否成功
   */
  saveRunToSaveData(runId: string, saveData: RoguelikeSaveData): boolean {
    const state = this._activeRuns.get(runId);
    if (!state) {
      console.warn(`[RoguelikeSystem] 未找到活跃运行: ${runId}`);
      return false;
    }

    saveData.activeRun = state;
    saveData.pityCounters = saveData.pityCounters ?? {};

    // 发布保存领域事件
    this._publishEvent(
      'DungeonRunSaved',
      {
        runId: state.runId,
        dungeonId: state.dungeonId,
        currentNodeId: state.currentNodeId,
        currentLayerId: state.currentLayerId,
        visitedCount: state.visitedNodeIds.length,
      },
      state.dungeonId,
      DEFAULT_PLAYER_ID,
    );

    return true;
  }

  /**
   * 完成运行后将状态归档到 savedata.runHistory。
   *
   * @param runId    运行 ID
   * @param saveData 目标存档数据（原地修改）
   * @returns        是否成功
   */
  archiveRunToHistory(runId: string, saveData: RoguelikeSaveData): boolean {
    const state = this._activeRuns.get(runId);
    if (!state) {
      console.warn(`[RoguelikeSystem] 未找到活跃运行: ${runId}`);
      return false;
    }

    if (!saveData.runHistory) {
      saveData.runHistory = [];
    }

    // 限制历史记录数量
    const MAX_RUN_HISTORY = 50;
    if (saveData.runHistory.length >= MAX_RUN_HISTORY) {
      saveData.runHistory = saveData.runHistory.slice(-MAX_RUN_HISTORY + 1);
    }

    saveData.runHistory.push(state);
    saveData.activeRun = null;

    console.log(`[RoguelikeSystem] 运行 ${runId} 已归档到 runHistory（共 ${saveData.runHistory.length} 条）`);
    return true;
  }

  /**
   * 获取活跃运行 ID（当前正在进行的 runId）。
   */
  getActiveRunId(): string | null {
    if (this._activeRuns.size === 0) return null;
    return this._activeRuns.keys().next().value;
  }

  // ==================== 核心 API：enterNode ====================

  /**
   * 进入指定节点。
   *
   * 流程：
   * 1. 校验目标节点在合法路径中
   * 2. 更新 runState.currentNodeId 和 visitedNodeIds
   * 3. 根据节点类型生成对应的 rewardSources / battleRequest
   * 4. 发布 DungeonNodeEntered 领域事件
   *
   * @param state       运行状态（原地修改）
   * @param targetNodeId  目标节点 ID
   * @returns            节点进入结果
   */
  enterNode(state: DungeonRunState, targetNodeId: string): DungeonNodeResult {
    const validationWarnings: ValidationWarning[] = [];
    const rewardSources: RewardSource[] = [];
    let battleRequest: BattleRequest | undefined;

    const config = this._configMap.get(state.dungeonId);
    if (!config) {
      return this._nodeError(state, `地牢配置不存在: ${state.dungeonId}`, validationWarnings);
    }

    const layer = this._findLayer(config, state.currentLayerId);
    if (!layer) {
      return this._nodeError(state, `层不存在: ${state.currentLayerId}`, validationWarnings);
    }

    const targetNode = layer.nodeGraph.find((n) => n.id === targetNodeId);
    if (!targetNode) {
      return this._nodeError(state, `节点不存在: ${targetNodeId}`, validationWarnings);
    }

    // 更新状态
    state.currentNodeId = targetNodeId;
    if (!state.visitedNodeIds.includes(targetNodeId)) {
      state.visitedNodeIds.push(targetNodeId);
    }
    state.updatedAt = Date.now();

    // 根据节点类型处理
    switch (targetNode.type) {
      case 'battle': {
        // 战斗节点：生成战斗请求
        const enemyRef = targetNode.eventRefs?.[0] ?? `enemy_${targetNodeId}`;
        battleRequest = {
          battleType: 'normal',
          enemyRef,
          powerRatio: 1.0,
        };

        // 生成奖励来源
        if (targetNode.dropSourceRefs || targetNode.rewardPoolRefs) {
          rewardSources.push(this._buildRewardSource(
            targetNode,
            'dungeon_node',
            state,
            config,
          ));
        }
        break;
      }

      case 'boss': {
        // Boss 节点：生成 Boss 战斗请求
        const bossRef = targetNode.bossRef ?? `boss_${targetNodeId}`;
        battleRequest = {
          battleType: 'boss',
          enemyRef: bossRef,
          powerRatio: 1.5, // Boss 战力倍率
        };

        if (targetNode.dropSourceRefs || targetNode.rewardPoolRefs) {
          rewardSources.push(this._buildRewardSource(
            targetNode,
            'dungeon_boss',
            state,
            config,
          ));
        }
        break;
      }

      case 'event': {
        // 事件节点：奖励来源由 resolveEvent 时根据选项决定
        break;
      }

      case 'reward': {
        // 奖励节点：直接获得奖励
        if (targetNode.dropSourceRefs || targetNode.rewardPoolRefs) {
          rewardSources.push(this._buildRewardSource(
            targetNode,
            'dungeon_node',
            state,
            config,
          ));
        }
        break;
      }

      case 'shop': {
        // 商店节点：奖励来源供 UI 展示
        if (targetNode.rewardPoolRefs) {
          rewardSources.push(this._buildRewardSource(
            targetNode,
            'shop',
            state,
            config,
          ));
        }
        break;
      }

      case 'empty': {
        // 空节点：无特殊行为
        break;
      }

      default: {
        validationWarnings.push({
          source: 'RoguelikeSystem',
          code: 'UNKNOWN_NODE_TYPE',
          message: `未知节点类型: ${(targetNode as DungeonNodeConfig).type}`,
        });
      }
    }

    // 发布领域事件
    // Phase7-Step2: 检测分叉 — 如果目标节点有多个后继，生成 NodeFork
    const nodeFork = this.getNodeForks(state);

    const emittedEvents = [
      this._publishEvent(
        DomainEventType.DUNGEON_NODE_ENTERED,
        {
          nodeId: targetNodeId,
          nodeType: targetNode.type,
          layerId: state.currentLayerId,
          hasBattle: battleRequest !== undefined,
          hasFork: nodeFork !== null,
        },
        state.dungeonId,
        DEFAULT_PLAYER_ID,
      ),
    ];

    return {
      runState: state,
      emittedEvents,
      rewardSources,
      battleRequest,
      nodeFork: nodeFork ?? undefined,
      validationWarnings,
    };
  }

  // ==================== 核心 API：resolveEvent ====================

  /**
   * 解决事件节点（玩家做出选择）。
   *
   * @param state     运行状态（原地修改）
   * @param choiceId  选择的选项 ID
   * @param choices   可选的选项列表（由调用方根据事件配置提供）
   * @returns         事件解决结果
   */
  resolveEvent(
    state: DungeonRunState,
    choiceId: string,
    choices: EventChoice[],
  ): DungeonEventResult {
    const chosenChoice = choices.find((c) => c.choiceId === choiceId);

    if (!chosenChoice) {
      // 选择不存在，返回空结果
      return {
        runState: state,
        chosenChoiceId: choiceId,
        emittedEvents: [
          this._publishEvent(
            DomainEventType.DUNGEON_EVENT_RESOLVED,
            { choiceId, valid: false },
            state.dungeonId,
            DEFAULT_PLAYER_ID,
          ),
        ],
        rewardSources: [],
      };
    }

    // 检查选择条件
    if (chosenChoice.conditions && chosenChoice.conditions.length > 0) {
      // 条件检查：简单实现，仅记录日志
      console.log(
        `[RoguelikeSystem] 事件选项 ${choiceId} 有条件限制: ` +
        `${chosenChoice.conditions.length} 条`,
      );
    }

    state.resolvedEventIds.push(choiceId);
    state.updatedAt = Date.now();

    const emittedEvents = [
      this._publishEvent(
        DomainEventType.DUNGEON_EVENT_RESOLVED,
        {
          nodeId: state.currentNodeId,
          choiceId,
          valid: true,
          rewardSources: chosenChoice.rewardSources.length,
        },
        state.dungeonId,
        DEFAULT_PLAYER_ID,
      ),
    ];

    return {
      runState: state,
      chosenChoiceId: choiceId,
      emittedEvents,
      rewardSources: chosenChoice.rewardSources,
    };
  }

  // ==================== 核心 API：completeNode ====================

  /**
   * 完成当前节点（标记为已处理）。
   *
   * 检查层完成条件，如果满足则自动触发 completeLayer。
   *
   * @param state  运行状态（原地修改）
   * @returns      节点完成结果
   */
  completeNode(state: DungeonRunState): DungeonProgressResult {
    const validationWarnings: ValidationWarning[] = [];
    const emittedEvents: ReturnType<typeof this._publishEvent>[] = [];
    let layerCompleted = false;
    let layerCompletion: DungeonLayerResult | undefined;

    const config = this._configMap.get(state.dungeonId);
    if (!config) {
      return {
        runState: state,
        layerCompleted: false,
        emittedEvents: [],
      };
    }

    const layer = this._findLayer(config, state.currentLayerId);
    if (!layer) {
      return {
        runState: state,
        layerCompleted: false,
        emittedEvents: [],
      };
    }

    // 检查层完成条件
    const layerDone = this._checkLayerCompletion(layer, state);
    if (layerDone) {
      const layerResult = this.completeLayer(state);
      layerCompleted = true;
      layerCompletion = layerResult;
    } else {
      // 节点完成事件
      emittedEvents.push(
        this._publishEvent(
          DomainEventType.DUNGEON_NODE_ENTERED,
          { nodeId: state.currentNodeId, completed: true },
          state.dungeonId,
          DEFAULT_PLAYER_ID,
        ),
      );
    }

    state.updatedAt = Date.now();

    return {
      runState: state,
      layerCompleted,
      layerCompletion,
      emittedEvents,
    };
  }

  // ==================== 核心 API：completeLayer ====================

  /**
   * 完成当前层。
   *
   * 流程：
   * 1. 发布 DungeonLayerCompleted 领域事件
   * 2. 如果还有下一层，推进到下一层的入口节点
   * 3. 如果所有层已完成，标记 isRunComplete
   *
   * @param state  运行状态（原地修改）
   * @returns      层完成结果
   */
  completeLayer(state: DungeonRunState): DungeonLayerResult {
    const config = this._configMap.get(state.dungeonId)!;
    const currentLayer = this._findLayer(config, state.currentLayerId)!;

    const currentLayerIndex = config.layers.findIndex((l) => l.id === state.currentLayerId);
    const isRunComplete = currentLayerIndex >= config.layers.length - 1;

    const rewardSources: RewardSource[] = [];

    // 层完成奖励（如果有奖励池引用）
    if (config.rewardPoolRefs && config.rewardPoolRefs.length > 0) {
      rewardSources.push({
        sourceId: `layer_complete_${state.currentLayerId}`,
        sourceType: 'dungeon_node',
        dropTableRefs: [],
        rewardPoolRefs: config.rewardPoolRefs,
        context: {
          playerId: DEFAULT_PLAYER_ID,
          correlationId: this._activeCorrelationId ?? '',
        },
      });
    }

    // Phase7-Step2: 推进到下一层（使用显式 FloorTransition）
    let floorTransition: FloorTransition | undefined;
    if (!isRunComplete) {
      const nextLayer = config.layers[currentLayerIndex + 1];
      const entryNodeId = nextLayer.nodeGraph[0].id;

      floorTransition = this.transitionFloor(
        state,
        nextLayer.id,
        entryNodeId,
        'forward',
        'layerComplete',
      );
    }

    state.updatedAt = Date.now();

    const emittedEvents = [
      this._publishEvent(
        DomainEventType.DUNGEON_LAYER_COMPLETED,
        {
          layerId: currentLayer.id,
          layerOrder: currentLayer.order,
          isRunComplete,
        },
        state.dungeonId,
        DEFAULT_PLAYER_ID,
      ),
    ];

    return {
      layerId: currentLayer.id,
      rewardSources,
      isRunComplete,
      emittedEvents,
      floorTransition,
    };
  }

  // ==================== 核心 API：completeRun ====================

  /**
   * 完成整个地牢运行（通关）。
   *
   * 流程：
   * 1. 收集所有层的奖励来源
   * 2. 汇总基础奖励
   * 3. 发布 DungeonRunCompleted 领域事件
   * 4. 结束关联上下文
   * 5. 从活跃运行中移除
   *
   * @param state  运行状态
   * @returns      通关结果
   */
  completeRun(state: DungeonRunState): DungeonRunResult {
    const config = this._configMap.get(state.dungeonId);
    const rewardSources: RewardSource[] = [];
    const baseRewards: RewardGrant[] = [];

    if (config) {
      // 收集地牢级奖励池
      if (config.rewardPoolRefs && config.rewardPoolRefs.length > 0) {
        rewardSources.push({
          sourceId: `dungeon_complete_${state.dungeonId}`,
          sourceType: 'dungeon_node',
          dropTableRefs: [],
          rewardPoolRefs: config.rewardPoolRefs,
          context: {
            playerId: DEFAULT_PLAYER_ID,
            correlationId: this._activeCorrelationId ?? '',
          },
        });
      }

      // 基础通关奖励（金币 + 经验保底）
      baseRewards.push(
        { rewardId: 'gold', rewardType: 'gold', quantity: 100, sourceId: state.dungeonId, granted: false },
        { rewardId: 'exp', rewardType: 'exp', quantity: 50, sourceId: state.dungeonId, granted: false },
      );
    }

    // 标记 pending 中的奖励为已结算
    for (const reward of state.pendingRewards) {
      baseRewards.push({ ...reward, granted: true });
    }
    state.pendingRewards = [];

    const durationMs = Date.now() - state.startedAt;
    state.updatedAt = Date.now();

    const emittedEvents = [
      this._publishEvent(
        DomainEventType.DUNGEON_RUN_COMPLETED,
        {
          dungeonId: state.dungeonId,
          runId: state.runId,
          durationMs,
          layersCompleted: config?.layers.length ?? 0,
          nodesVisited: state.visitedNodeIds.length,
          bossesDefeated: state.defeatedBossIds.length,
        },
        state.dungeonId,
        DEFAULT_PLAYER_ID,
      ),
    ];

    // 结束关联上下文
    if (this._activeCorrelationId) {
      this._eventBus.endCorrelation(this._activeCorrelationId);
      this._activeCorrelationId = null;
    }

    // 从活跃运行中移除
    this._activeRuns.delete(state.runId);

    // 通过 EventManager 广播
    EventManager.getInstance().emit(RoguelikeSystem.RUN_COMPLETED, state);

    return {
      runState: state,
      success: true,
      rewardSources,
      baseRewards,
      emittedEvents,
      durationMs,
    };
  }

  // ==================== 查询 API ====================

  /** 获取活跃运行状态 */
  getRunState(runId: string): DungeonRunState | null {
    return this._activeRuns.get(runId) ?? null;
  }

  /** 获取地牢配置 */
  getDungeonConfig(dungeonId: string): DungeonConfigV2 | null {
    return this._configMap.get(dungeonId) ?? null;
  }

  /** 获取所有活跃运行 */
  getAllActiveRuns(): DungeonRunState[] {
    return Array.from(this._activeRuns.values());
  }

  /** 获取地牢配置数量 */
  getConfigCount(): number {
    return this._configMap.size;
  }

  /** 放弃运行 */
  abandonRun(runId: string): void {
    this._activeRuns.delete(runId);
    if (this._activeCorrelationId) {
      this._eventBus.endCorrelation(this._activeCorrelationId);
      this._activeCorrelationId = null;
    }
  }

  /** 清除所有运行时状态 */
  clearAll(): void {
    this._activeRuns.clear();
    this._eventBus.clearBuffer();
    this._configMap.clear();
    this._configLoaded = false;
    this._activeCorrelationId = null;
  }

  // ==================== 内部方法 ====================

  /**
   * 在层中查找指定 ID 的节点。
   */
  private _findLayer(config: DungeonConfigV2, layerId: string): DungeonLayerConfig | undefined {
    return config.layers.find((l) => l.id === layerId);
  }

  /**
   * 检查层的完成条件是否满足。
   */
  private _checkLayerCompletion(layer: DungeonLayerConfig, state: DungeonRunState): boolean {
    if (!layer.completionRules || layer.completionRules.length === 0) {
      // 无完成规则：当没有更多未访问节点时认为完成
      const allNodesReachable = this._allNodesVisitedInLayer(layer, state);
      return allNodesReachable;
    }

    for (const rule of layer.completionRules) {
      switch (rule.type) {
        case 'defeatBoss':
          // 检查目标 Boss 是否被击败
          if (!state.defeatedBossIds.includes(String(rule.target))) {
            return false;
          }
          break;
        case 'reachNode':
          // 检查是否已访问目标节点
          if (!state.visitedNodeIds.includes(String(rule.target))) {
            return false;
          }
          break;
        case 'clearAllNodes':
          // 检查是否访问了所有节点
          if (!this._allNodesVisitedInLayer(layer, state)) {
            return false;
          }
          break;
        case 'defeatEnemyCount':
          // 简化实现：检查已访问节点数 >= 目标数
          const visitedCount = layer.nodeGraph.filter(
            (n) => state.visitedNodeIds.includes(n.id),
          ).length;
          if (visitedCount < Number(rule.target)) {
            return false;
          }
          break;
      }
    }

    return true;
  }

  /**
   * 检查层内所有节点是否都已被访问。
   */
  private _allNodesVisitedInLayer(layer: DungeonLayerConfig, state: DungeonRunState): boolean {
    return layer.nodeGraph.every((n) => state.visitedNodeIds.includes(n.id));
  }

  /**
   * 从节点构建 RewardSource。
   */
  private _buildRewardSource(
    node: DungeonNodeConfig,
    sourceType: RewardSource['sourceType'],
    state: DungeonRunState,
    config: DungeonConfigV2,
  ): RewardSource {
    return {
      sourceId: `node_${node.id}`,
      sourceType,
      dropTableRefs: node.dropSourceRefs ?? [],
      rewardPoolRefs: node.rewardPoolRefs ?? [],
      context: {
        playerId: DEFAULT_PLAYER_ID,
        correlationId: this._activeCorrelationId ?? '',
        metadata: {
          dungeonId: state.dungeonId,
          nodeId: node.id,
          nodeType: node.type,
        },
      },
    };
  }

  /**
   * 发布领域事件的内部便捷方法。
   */
  private _publishEvent<T>(
    type: string,
    payload: T,
    aggregateId: string,
    playerId: string,
  ): ReturnType<DomainEventBus['publish']> {
    return this._eventBus.publish(
      type,
      payload,
      aggregateId,
      playerId,
      this._activeCorrelationId ?? undefined,
    );
  }

  /**
   * 生成节点错误结果。
   */
  private _nodeError(
    state: DungeonRunState,
    message: string,
    warnings: ValidationWarning[],
  ): DungeonNodeResult {
    warnings.push({
      source: 'RoguelikeSystem',
      code: 'NODE_ERROR',
      message,
    });

    return {
      runState: state,
      emittedEvents: [],
      rewardSources: [],
      validationWarnings: warnings,
    };
  }

  /** 确保配置已加载 */
  private _requireConfig(): void {
    if (this._configMap.size === 0) {
      throw new Error('[RoguelikeSystem] 地牢配置未注册，请先调用 registerConfigs()');
    }
  }
}
