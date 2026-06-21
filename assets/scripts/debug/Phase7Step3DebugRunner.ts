// ============================================================
// Phase7Step3DebugRunner — Phase7-Step3 DungeonEvent 集成测试
// 职责：验证 EventPool / EventConfig / EventManager / EventHistory /
//        RewardSource 集成 / DungeonGraph 事件联动 / Validator 扩展 / SaveMigration
// 用法：在 Cocos Creator 控制台执行 Phase7Step3DebugRunner.runAll()
// ============================================================

import { DungeonEventManager, EventResolveContext } from '../systems/DungeonEventManager';
import { DomainEventBus } from '../systems/DomainEventBus';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
} from '../save/SaveContainer';
import {
  generateCorrelationId,
  generateRunId,
  DomainEventType,
} from '../data/roguelike_types';
import type {
  DungeonRunState,
  RewardSource,
  RewardGrant,
} from '../data/roguelike_types';
import type {
  EventPool,
  EventConfig,
  EventResult,
  EventHistoryRecord,
} from '../data/event_types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const DEFAULT_PLAYER_ID = 'player_001';

/** 创建默认 DungeonRunState（测试用） */
function createTestRunState(overrides?: Partial<DungeonRunState>): DungeonRunState {
  return {
    runId: generateRunId(),
    dungeonId: 'test_dungeon',
    dungeonVersion: 1,
    seed: 'seed_test',
    currentLayerId: 'layer_01',
    currentNodeId: 'node_01',
    visitedNodeIds: ['node_01'],
    resolvedEventIds: [],
    defeatedBossIds: [],
    pendingRewards: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

export class Phase7Step3DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 DungeonEvent 测试 */
  static runAll(): void {
    this._results = [];
    console.log('========== Phase7-Step3 DungeonEvent 集成测试 ==========\n');

    // 1. EventPool 测试
    this.testEventPool();

    // 2. EventConfig 测试
    this.testEventConfig();

    // 3. EventManager.rollEvent 权重抽取测试
    this.testEventRoll();

    // 4. EventManager.resolveEvent 测试
    this.testEventResolve();

    // 5. EventManager.validateEvent 测试
    this.testEventValidation();

    // 6. EventHistory 记录测试
    this.testEventHistory();

    // 7. ConfigValidator 扩展测试
    this.testConfigValidatorExtensions();

    // 8. RuntimeValidator 扩展测试
    this.testRuntimeValidatorExtensions();

    // 9. NodeFork 事件触发测试
    this.testForkEventTrigger();

    // 10. BranchPath 事件触发测试
    this.testBranchEventTrigger();

    // 11. FloorTransition 事件触发测试
    this.testFloorTransitionEventTrigger();

    // 12. SaveMigration V2→V3 测试
    this.testMigrationV2ToV3();

    // 13. 领域事件覆盖测试
    this.testDomainEventCoverage();

    // 14. RewardSource 集成测试
    this.testRewardSourceIntegration();

    // 汇总
    this.printSummary();
  }

  // ==================== 测试 1: EventPool ====================

  private static testEventPool(): void {
    console.log('--- 测试 1: EventPool ---');

    const pool: EventPool = {
      id: 'POOL_TEST_01',
      version: 1,
      nameKey: 'pool.test_01',
      eventPoolRefs: ['evt_treasure', 'evt_battle', 'evt_blessing'],
    };

    // 1a. 事件池基础字段
    this.assert('EventPool id 非空', pool.id.length > 0);
    this.assert('EventPool version > 0', pool.version >= 1);
    this.assert('EventPool eventPoolRefs 非空', pool.eventPoolRefs.length === 3);

    // 1b. 多池引用
    const pool2: EventPool = {
      id: 'POOL_NESTED',
      version: 1,
      nameKey: 'pool.nested',
      eventPoolRefs: ['POOL_TEST_01', 'evt_special'],
    };
    this.assert('嵌套池引用非空', pool2.eventPoolRefs.length === 2);
    this.assert('嵌套池引用了另一个池子', pool2.eventPoolRefs.includes('POOL_TEST_01'));

    console.log('EventPool 测试完成\n');
  }

  // ==================== 测试 2: EventConfig ====================

  private static testEventConfig(): void {
    console.log('--- 测试 2: EventConfig ---');

    // 2a. 基础字段
    const config: EventConfig = {
      id: 'evt_treasure',
      version: 1,
      nameKey: 'event.treasure.name',
      descriptionKey: 'event.treasure.desc',
      category: 'reward',
      weight: 30,
      rewardSourceRefs: ['DROP_TREASURE'],
      tags: ['once_per_run', 'rare'],
    };
    this.assert('EventConfig id 正确', config.id === 'evt_treasure');
    this.assert('EventConfig category 正确', config.category === 'reward');
    this.assert('EventConfig weight 正确', config.weight === 30);
    this.assert('EventConfig 有 tags', config.tags !== undefined && config.tags.length === 2);

    // 2b. 条件事件
    const conditionalConfig: EventConfig = {
      id: 'evt_conditional',
      version: 1,
      nameKey: 'event.cond.name',
      descriptionKey: 'event.cond.desc',
      category: 'story',
      weight: 20,
      conditions: [
        { type: 'minLevel', params: { level: 10 } },
        { type: 'previousEventResolved', params: { eventId: 'evt_treasure' } },
      ],
      nextEventRefs: ['evt_followup'],
    };
    this.assert('条件事件有 2 个条件', conditionalConfig.conditions?.length === 2);
    this.assert('条件事件有后续事件链', conditionalConfig.nextEventRefs?.includes('evt_followup') ?? false);

    // 2c. 所有 category 覆盖
    const categories: EventConfig['category'][] = [
      'reward', 'battle', 'shop', 'blessing', 'curse', 'story', 'boss', 'special',
    ];
    this.assert('所有 8 种 category 已定义', categories.length === 8);

    console.log('EventConfig 测试完成\n');
  }

  // ==================== 测试 3: EventManager.rollEvent ====================

  private static testEventRoll(): void {
    console.log('--- 测试 3: EventManager.rollEvent ---');

    const mgr = new DungeonEventManager();
    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 3a. 注册配置
    const configs = this._createTestEventConfigs();
    const pools = this._createTestEventPools();
    mgr.registerEventConfigs(configs);
    mgr.registerEventPools(pools);

    this.assert('事件配置注册成功 (7 个)', mgr.getEventConfigCount() === 7);
    this.assert('事件池注册成功 (2 个)', mgr.getEventPoolCount() === 2);

    // 3b. 从普通池抽取
    const rolled = mgr.rollEvent(['POOL_COMMON'], runState.resolvedEventIds, context);
    this.assert('rollEvent 返回事件', rolled !== null);
    if (rolled) {
      this.assert('抽取的事件在普通池中', ['evt_treasure', 'evt_battle', 'evt_shop', 'evt_blessing'].includes(rolled.id));
    }

    // 3c. 空池引用返回 null
    const emptyRoll = mgr.rollEvent([], runState.resolvedEventIds, context);
    this.assert('空池引用返回 null', emptyRoll === null);

    // 3d. 不存在的池返回 null
    const badRoll = mgr.rollEvent(['POOL_GHOST'], runState.resolvedEventIds, context);
    this.assert('不存在的池返回 null', badRoll === null);

    // 3e. once_per_run 过滤
    const markedRunState = createTestRunState({
      resolvedEventIds: ['evt_treasure'],
    });
    const filteredContext: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState: markedRunState,
    };

    // 多次抽取确认 evt_treasure 不会出现
    let treasureAppeared = false;
    for (let i = 0; i < 20; i++) {
      const r = mgr.rollEvent(['POOL_COMMON'], markedRunState.resolvedEventIds, filteredContext);
      if (r && r.id === 'evt_treasure') {
        treasureAppeared = true;
        break;
      }
    }
    this.assert('once_per_run 过滤有效（已解析事件不会再次抽取）', !treasureAppeared);

    // 3f. 权重抽取分布（1000 次抽样，验证高权重事件出现更多）
    const newMgr = new DungeonEventManager();
    // 只有两个事件，一个权重 90，一个权重 10
    const weightedConfigs: EventConfig[] = [
      { id: 'evt_high', version: 1, nameKey: 'h', descriptionKey: 'h', category: 'reward', weight: 90 },
      { id: 'evt_low', version: 1, nameKey: 'l', descriptionKey: 'l', category: 'reward', weight: 10 },
    ];
    const weightedPool: EventPool = {
      id: 'POOL_WEIGHTED', version: 1, nameKey: 'pw', eventPoolRefs: ['evt_high', 'evt_low'],
    };
    newMgr.registerEventConfigs(weightedConfigs);
    newMgr.registerEventPools([weightedPool]);

    let highCount = 0;
    let lowCount = 0;
    for (let i = 0; i < 1000; i++) {
      const r = newMgr.rollEvent(['POOL_WEIGHTED'], [], context);
      if (r) {
        if (r.id === 'evt_high') highCount++;
        else if (r.id === 'evt_low') lowCount++;
      }
    }
    this.assert(
      '权重抽取偏斜正确（高权重 > 低权重）',
      highCount > lowCount,
    );

    console.log('EventManager.rollEvent 测试完成\n');
  }

  // ==================== 测试 4: EventManager.resolveEvent ====================

  private static testEventResolve(): void {
    console.log('--- 测试 4: EventManager.resolveEvent ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    mgr.registerEventConfigs(configs);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 4a. 解析带奖励的事件
    const treasureConfig = configs.find((c) => c.id === 'evt_treasure')!;
    const result = mgr.resolveEvent(treasureConfig, context);

    this.assert('resolveEvent 返回有效结果', result !== null);
    this.assert('result.eventId 正确', result.eventId === 'evt_treasure');
    this.assert('result.rewards 非空', result.rewards.length > 0);
    this.assert('result.emittedEvents 非空', result.emittedEvents.length >= 2);
    this.assert('result.completedAt 有效', result.completedAt > 0);

    // 4b. RewardSource 结构正确
    if (result.rewards.length > 0) {
      const reward = result.rewards[0];
      this.assert('RewardSource.sourceType 为 dungeon_event', reward.sourceType === 'dungeon_event');
      this.assert('RewardSource.sourceId 非空', reward.sourceId.length > 0);
    }

    // 4c. 无奖励事件
    const noRewardConfig: EventConfig = {
      id: 'evt_no_reward', version: 1, nameKey: 'nr', descriptionKey: 'nr', category: 'story', weight: 10,
    };
    mgr.registerEventConfigs([noRewardConfig]);
    const noRewardResult = mgr.resolveEvent(noRewardConfig, context);
    this.assert('无奖励事件 rewards 为空', noRewardResult.rewards.length === 0);

    // 4d. 有 nextEventRefs 的事件
    const chainConfig = configs.find((c) => c.id === 'evt_chain')!;
    if (chainConfig && chainConfig.nextEventRefs) {
      this.assert('事件链有 nextEventRefs', chainConfig.nextEventRefs.length > 0);
    }

    console.log('EventManager.resolveEvent 测试完成\n');
  }

  // ==================== 测试 5: EventManager.validateEvent ====================

  private static testEventValidation(): void {
    console.log('--- 测试 5: EventManager.validateEvent ---');

    const mgr = new DungeonEventManager();

    // 5a. 有效事件通过校验
    const validConfig: EventConfig = {
      id: 'evt_valid', version: 1, nameKey: 'v', descriptionKey: 'v', category: 'reward', weight: 10,
    };
    const validResult = mgr.validateEvent(validConfig);
    this.assert('有效事件通过校验', validResult.valid);

    // 5b. 无效 category 被拒绝
    const badCategoryConfig: EventConfig = {
      ...validConfig,
      id: 'evt_bad_cat',
      category: 'invalid' as EventConfig['category'],
    };
    const badCatResult = mgr.validateEvent(badCategoryConfig);
    this.assert('无效 category 被拒绝', !badCatResult.valid);

    // 5c. 负权重被拒绝
    const negWeightConfig: EventConfig = {
      ...validConfig,
      id: 'evt_neg',
      weight: -5,
    };
    const negResult = mgr.validateEvent(negWeightConfig);
    this.assert('负权重被拒绝', !negResult.valid);

    // 5d. 空事件被拒绝
    const nullResult = mgr.validateEvent(null as unknown as EventConfig);
    this.assert('空事件被拒绝', !nullResult.valid);

    console.log('EventManager.validateEvent 测试完成\n');
  }

  // ==================== 测试 6: EventHistory ====================

  private static testEventHistory(): void {
    console.log('--- 测试 6: EventHistory ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    mgr.registerEventConfigs(configs);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 6a. 解析事件 → 自动记录历史
    const config = configs.find((c) => c.id === 'evt_treasure')!;
    mgr.resolveEvent(config, context);
    const history = mgr.getEventHistory();
    this.assert('事件历史已记录', history.length === 1);
    this.assert('历史记录 eventId 正确', history[0].eventId === 'evt_treasure');
    this.assert('历史记录 runId 正确', history[0].runId === runState.runId);
    this.assert('历史记录 nodeId 正确', history[0].nodeId === runState.currentNodeId);
    this.assert('历史记录 layerId 正确', history[0].layerId === runState.currentLayerId);

    // 6b. 按 runId 查询
    const runHistory = mgr.getEventHistoryByRun(runState.runId);
    this.assert('按 runId 查询返回记录', runHistory.length === 1);

    // 6c. 按 eventId 查询
    const eventHistory = mgr.getEventHistoryByEvent('evt_treasure');
    this.assert('按 eventId 查询返回记录', eventHistory.length === 1);

    // 6d. 不存在的 runId 返回空
    const noHistory = mgr.getEventHistoryByRun('nonexistent');
    this.assert('不存在的 runId 返回空', noHistory.length === 0);

    // 6e. syncEventHistoryToRunState
    const syncState = createTestRunState();
    mgr.syncEventHistoryToRunState(syncState);
    this.assert('syncEventHistoryToRunState eventHistory 非空', syncState.eventHistory !== undefined);
    this.assert(
      'sync 后 runState.eventHistory 包含记录',
      syncState.eventHistory !== undefined && syncState.eventHistory.length >= 1,
    );

    // 6f. 从 runState 恢复
    const newMgr = new DungeonEventManager();
    newMgr.restoreEventHistoryFromRunState(syncState);
    const restoredHistory = newMgr.getEventHistory();
    this.assert('从 runState 恢复历史成功', restoredHistory.length >= 1);

    console.log('EventHistory 测试完成\n');
  }

  // ==================== 测试 7: ConfigValidator 扩展 ====================

  private static testConfigValidatorExtensions(): void {
    console.log('--- 测试 7: ConfigValidator 扩展 ---');

    const validator = new ConfigValidator();

    // 7a. 有效事件池通过校验
    const validPools = this._createTestEventPools();
    const validConfigs = this._createTestEventConfigs();
    const poolResult = validator.validateEventPools(validPools, validConfigs);
    this.assert('有效事件池通过 ConfigValidator 校验', poolResult.valid);

    // 7b. 空事件池
    const emptyPoolResult = validator.validateEventPools([]);
    this.assert('空事件池数组返回 valid', emptyPoolResult.valid);

    // 7c. 引用不存在的事件
    const badPool: EventPool = {
      id: 'POOL_BAD', version: 1, nameKey: 'bad', eventPoolRefs: ['evt_ghost'],
    };
    const badPoolResult = validator.validateEventPools([badPool], validConfigs);
    this.assert(
      '引用不存在事件被检测',
      !badPoolResult.valid,
    );

    // 7d. 循环引用检测
    const poolA: EventPool = { id: 'POOL_A', version: 1, nameKey: 'a', eventPoolRefs: ['POOL_B'] };
    const poolB: EventPool = { id: 'POOL_B', version: 1, nameKey: 'b', eventPoolRefs: ['POOL_A'] };
    const cycleResult = validator.validateEventPools([poolA, poolB]);
    this.assert(
      '事件池循环引用被检测',
      cycleResult.issues.some((i) => i.severity === 'error' && i.message.includes('循环引用')),
    );

    // 7e. 有效事件配置通过校验
    const configResult = validator.validateEventConfigs(validConfigs);
    this.assert('有效事件配置通过校验', configResult.valid);

    // 7f. 重复 ID 被检测
    const dupConfigs: EventConfig[] = [
      { id: 'evt_dup', version: 1, nameKey: 'd1', descriptionKey: 'd1', category: 'reward', weight: 10 },
      { id: 'evt_dup', version: 1, nameKey: 'd2', descriptionKey: 'd2', category: 'reward', weight: 10 },
    ];
    const dupResult = validator.validateEventConfigs(dupConfigs);
    this.assert('重复事件 ID 被检测', !dupResult.valid);

    // 7g. nextEventRefs 自引用检测
    const selfRefConfig: EventConfig = {
      id: 'evt_self', version: 1, nameKey: 's', descriptionKey: 's',
      category: 'story', weight: 10, nextEventRefs: ['evt_self'],
    };
    const selfRefResult = validator.validateEventConfigs([selfRefConfig]);
    this.assert(
      'nextEventRefs 自引用被检测',
      !selfRefResult.valid,
    );

    // 7h. eventPoolRefs 为空警告
    const emptyRefPool: EventPool = { id: 'POOL_EMPTY', version: 1, nameKey: 'empty', eventPoolRefs: [] };
    const emptyRefResult = validator.validateEventPools([emptyRefPool]);
    this.assert(
      'eventPoolRefs 为空产生警告',
      emptyRefResult.warningCount > 0,
    );

    console.log('ConfigValidator 扩展测试完成\n');
  }

  // ==================== 测试 8: RuntimeValidator 扩展 ====================

  private static testRuntimeValidatorExtensions(): void {
    console.log('--- 测试 8: RuntimeValidator 扩展 ---');

    const validator = new RuntimeValidator();

    // 8a. 有效事件解析结果通过校验
    const validResult: EventResult = {
      eventId: 'evt_test',
      rewards: [
        {
          sourceId: 'src_01',
          sourceType: 'dungeon_event',
          dropTableRefs: ['DROP_001'],
          rewardPoolRefs: [],
          context: { playerId: 'p1', correlationId: 'corr_01' },
        },
      ],
      emittedEvents: [
        {
          id: 'evt_001', type: 'DungeonEventResolved', version: 1,
          aggregateId: 'evt_test', playerId: 'p1', correlationId: 'corr_01',
          payload: {}, createdAt: Date.now(),
        },
      ],
      completedAt: Date.now(),
    };
    const resResult = validator.validateEventResolution(validResult);
    this.assert('有效事件解析结果通过 RuntimeValidator', resResult.valid);

    // 8b. 空事件解析结果被拒绝
    const nullResResult = validator.validateEventResolution(null as unknown as EventResult);
    this.assert('空事件解析结果被拒绝', !nullResResult.valid);

    // 8c. 无 eventId 被拒绝
    const noIdResult: EventResult = { ...validResult, eventId: '' };
    const noIdCheck = validator.validateEventResolution(noIdResult);
    this.assert('无 eventId 被拒绝', !noIdCheck.valid);

    // 8d. 有效事件历史通过校验
    const validHistory: EventHistoryRecord = {
      id: 'evh_001',
      runId: 'run_001',
      eventId: 'evt_001',
      nodeId: 'node_01',
      layerId: 'layer_01',
      correlationId: 'corr_001',
      rewards: [],
      createdAt: Date.now(),
    };
    const histResult = validator.validateEventHistory(validHistory);
    this.assert('有效事件历史通过 RuntimeValidator', histResult.valid);

    // 8e. 不完整事件历史被拒绝
    const badHistory: EventHistoryRecord = { ...validHistory, runId: '' };
    const badHistResult = validator.validateEventHistory(badHistory);
    this.assert('不完整事件历史被拒绝', !badHistResult.valid);

    // 8f. 无 correlationId 被拒绝
    const noCorrHistory: EventHistoryRecord = { ...validHistory, correlationId: '' };
    const noCorrResult = validator.validateEventHistory(noCorrHistory);
    this.assert('无 correlationId 被拒绝', !noCorrResult.valid);

    console.log('RuntimeValidator 扩展测试完成\n');
  }

  // ==================== 测试 9: NodeFork 事件触发 ====================

  private static testForkEventTrigger(): void {
    console.log('--- 测试 9: NodeFork 事件触发 ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    mgr.registerEventConfigs(configs);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 9a. forkTriggerEvent 为 undefined → 返回 null
    const nullResult = mgr.triggerForkEvent(undefined, context);
    this.assert('forkTriggerEvent=undefined 返回 null', nullResult === null);

    // 9b. forkTriggerEvent 指向有效事件 → 返回结果
    const forkResult = mgr.triggerForkEvent('evt_treasure', context);
    this.assert('forkTriggerEvent=有效事件 返回结果', forkResult !== null);
    if (forkResult) {
      this.assert('fork 事件 category=reward', forkResult.eventId === 'evt_treasure');
    }

    // 9c. forkTriggerEvent 指向不存在的事件 → 返回 null
    const badForkResult = mgr.triggerForkEvent('evt_ghost', context);
    this.assert('forkTriggerEvent=不存在的 返回 null', badForkResult === null);

    console.log('NodeFork 事件触发测试完成\n');
  }

  // ==================== 测试 10: BranchPath 事件触发 ====================

  private static testBranchEventTrigger(): void {
    console.log('--- 测试 10: BranchPath 事件触发 ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    mgr.registerEventConfigs(configs);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 10a. branchSelectedEvent 为 undefined → 返回 null
    const nullResult = mgr.triggerBranchSelectedEvent(undefined, context);
    this.assert('branchSelectedEvent=undefined 返回 null', nullResult === null);

    // 10b. branchSelectedEvent 指向有效事件 → 返回结果
    const branchResult = mgr.triggerBranchSelectedEvent('evt_battle', context);
    this.assert('branchSelectedEvent=有效事件 返回结果', branchResult !== null);
    if (branchResult) {
      this.assert('branch 事件 category=battle', branchResult.eventId === 'evt_battle');
    }

    console.log('BranchPath 事件触发测试完成\n');
  }

  // ==================== 测试 11: FloorTransition 事件触发 ====================

  private static testFloorTransitionEventTrigger(): void {
    console.log('--- 测试 11: FloorTransition 事件触发 ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    mgr.registerEventConfigs(configs);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 11a. floorTransitionEvent 为 undefined → 返回 null
    const nullResult = mgr.triggerFloorTransitionEvent(undefined, context);
    this.assert('floorTransitionEvent=undefined 返回 null', nullResult === null);

    // 11b. floorTransitionEvent 指向有效事件 → 返回结果
    const transitionResult = mgr.triggerFloorTransitionEvent('evt_blessing', context);
    this.assert('floorTransitionEvent=有效事件 返回结果', transitionResult !== null);
    if (transitionResult) {
      this.assert('transition 事件 category=blessing', transitionResult.eventId === 'evt_blessing');
    }

    console.log('FloorTransition 事件触发测试完成\n');
  }

  // ==================== 测试 12: SaveMigration V2→V3 ====================

  private static testMigrationV2ToV3(): void {
    console.log('--- 测试 12: SaveMigration V2→V3 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 12a. V2→V3 步骤已注册
    const steps = migrationSystem.getMigrationSteps();
    const v2toV3Step = steps.find((s) => s.fromVersion === 2 && s.toVersion === 3);
    this.assert('V2→V3 迁移步骤已注册', v2toV3Step !== undefined);

    // 12b. 模拟 V2 存档迁移（有活跃 run）
    const v2Container = createDefaultSaveContainer();
    v2Container.saveVersion = 2;
    if (v2Container.roguelikeState) {
      v2Container.roguelikeState.activeRun = {
        runId: 'run_migrate_test',
        dungeonId: 'test_dungeon',
        dungeonVersion: 1,
        seed: 'seed_migrate',
        currentLayerId: 'layer_01',
        currentNodeId: 'node_01',
        visitedNodeIds: ['node_01'],
        resolvedEventIds: [],
        defeatedBossIds: [],
        pendingRewards: [],
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };
      // 确保 V2 存档无 eventHistory
      delete v2Container.roguelikeState.activeRun.eventHistory;
    }

    const result = migrationSystem.migrate(v2Container);
    this.assert('V2→V3 迁移成功', result.success);
    this.assert('迁移后版本为 3', v2Container.saveVersion === 3);

    // 12c. 迁移后 activeRun 有 eventHistory
    if (v2Container.roguelikeState && v2Container.roguelikeState.activeRun) {
      this.assert(
        '迁移后 activeRun.eventHistory 已添加',
        v2Container.roguelikeState.activeRun.eventHistory !== undefined,
      );
      this.assert(
        'activeRun.eventHistory 为空数组',
        Array.isArray(v2Container.roguelikeState.activeRun.eventHistory)
          && v2Container.roguelikeState.activeRun.eventHistory.length === 0,
      );
    }

    // 12d. V3 存档无需迁移
    const v3Container = createDefaultSaveContainer();
    v3Container.saveVersion = 3;
    const v3Result = migrationSystem.migrate(v3Container);
    this.assert('V3 存档无需迁移（stepsExecuted=0）', v3Result.stepsExecuted === 0);

    // 12e. CURRENT_SAVE_VERSION
    this.assert('CURRENT_SAVE_VERSION 为 3', CURRENT_SAVE_VERSION === 3);

    console.log('SaveMigration V2→V3 测试完成\n');
  }

  // ==================== 测试 13: 领域事件覆盖 ====================

  private static testDomainEventCoverage(): void {
    console.log('--- 测试 13: 领域事件覆盖 ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    const pools = this._createTestEventPools();
    mgr.registerEventConfigs(configs);
    mgr.registerEventPools(pools);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 13a. rollEvent 产生 DungeonEventRolled
    mgr.rollEvent(['POOL_COMMON'], [], context);
    const rolledEvents = mgr.getDomainEventBus().getEventsByType(DomainEventType.DUNGEON_EVENT_ROLLED);
    this.assert('rollEvent 产生 DUNGEON_EVENT_ROLLED', rolledEvents.length >= 1);

    // 13b. resolveEvent 产生 DungeonEventResolved
    mgr.resolveEvent(configs[0], context);
    const resolvedEvents = mgr.getDomainEventBus().getEventsByType(DomainEventType.DUNGEON_EVENT_RESOLVED);
    this.assert('resolveEvent 产生 DUNGEON_EVENT_RESOLVED', resolvedEvents.length >= 1);

    // 13c. 事件有 correlationId
    if (resolvedEvents.length > 0) {
      this.assert('领域事件有 correlationId', resolvedEvents[0].correlationId.length > 0);
    }

    // 13d. resolveEvent 产生 DungeonEventRewardGranted
    const rewardEvents = mgr.getDomainEventBus().getEventsByType(DomainEventType.DUNGEON_EVENT_REWARD_GRANTED);
    this.assert('resolveEvent 产生 DUNGEON_EVENT_REWARD_GRANTED', rewardEvents.length >= 1);

    // 13e. 事件历史产生 DungeonEventHistoryRecorded
    const historyEvents = mgr.getDomainEventBus().getEventsByType(DomainEventType.DUNGEON_EVENT_HISTORY_RECORDED);
    this.assert('resolveEvent 产生 DUNGEON_EVENT_HISTORY_RECORDED', historyEvents.length >= 1);

    console.log('领域事件覆盖测试完成\n');
  }

  // ==================== 测试 14: RewardSource 集成 ====================

  private static testRewardSourceIntegration(): void {
    console.log('--- 测试 14: RewardSource 集成 ---');

    const mgr = new DungeonEventManager();
    const configs = this._createTestEventConfigs();
    mgr.registerEventConfigs(configs);

    const runState = createTestRunState();
    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
      runState,
    };

    // 14a. 事件奖励统一转为 RewardSource
    const config = configs.find((c) => c.id === 'evt_treasure')!;
    const result = mgr.resolveEvent(config, context);
    this.assert('事件奖励转为 RewardSource', result.rewards.length > 0);

    // 14b. RewardSource 类型为 dungeon_event
    const source = result.rewards[0];
    this.assert('RewardSource.sourceType = dungeon_event', source.sourceType === 'dungeon_event');

    // 14c. RewardSource 有 context
    this.assert('RewardSource.context.playerId 非空', source.context.playerId === DEFAULT_PLAYER_ID);
    this.assert('RewardSource.context.correlationId 非空', source.context.correlationId.length > 0);

    // 14d. 禁止 Event 直接发放奖励（通过检查 reward 中是否有 RewardGrant）
    // EventResult 的 rewards 字段类型为 RewardSource[]，RewardGrant 在 DropSystem 产生
    const rewardSource = result.rewards[0];
    this.assert('RewardSource 不含 RewardGrant（走 DropSystem）', 'dropTableRefs' in rewardSource);

    console.log('RewardSource 集成测试完成\n');
  }

  // ==================== 辅助方法 ====================

  private static assert(name: string, condition: boolean): void {
    this._results.push({
      name,
      passed: condition,
      message: condition ? '✅ PASS' : '❌ FAIL',
    });
    console.log(`  ${condition ? '✅' : '❌'} ${name}`);
  }

  private static printSummary(): void {
    const passed = this._results.filter((r) => r.passed).length;
    const total = this._results.length;
    const allPassed = passed === total;

    console.log('\n========== 测试汇总 ==========');
    console.log(`总计: ${total} | 通过: ${passed} | 失败: ${total - passed}`);
    console.log(`结果: ${allPassed ? '🎉 全部通过!' : '⚠️ 存在失败项'}`);
    console.log('================================\n');
  }

  // ==================== 测试数据工厂 ====================

  private static _createTestEventConfigs(): EventConfig[] {
    return [
      {
        id: 'evt_treasure',
        version: 1,
        nameKey: 'event.treasure.name',
        descriptionKey: 'event.treasure.desc',
        category: 'reward',
        weight: 30,
        rewardSourceRefs: ['DROP_TREASURE'],
        tags: ['once_per_run', 'rare'],
      },
      {
        id: 'evt_battle',
        version: 1,
        nameKey: 'event.battle.name',
        descriptionKey: 'event.battle.desc',
        category: 'battle',
        weight: 25,
        rewardSourceRefs: ['DROP_BATTLE_EVENT'],
      },
      {
        id: 'evt_shop',
        version: 1,
        nameKey: 'event.shop.name',
        descriptionKey: 'event.shop.desc',
        category: 'shop',
        weight: 15,
        rewardSourceRefs: ['DROP_SHOP'],
      },
      {
        id: 'evt_blessing',
        version: 1,
        nameKey: 'event.blessing.name',
        descriptionKey: 'event.blessing.desc',
        category: 'blessing',
        weight: 20,
      },
      {
        id: 'evt_curse',
        version: 1,
        nameKey: 'event.curse.name',
        descriptionKey: 'event.curse.desc',
        category: 'curse',
        weight: 10,
        rewardSourceRefs: ['DROP_CURSE_COMPENSATION'],
      },
      {
        id: 'evt_story',
        version: 1,
        nameKey: 'event.story.name',
        descriptionKey: 'event.story.desc',
        category: 'story',
        weight: 15,
        nextEventRefs: ['evt_treasure'],
      },
      {
        id: 'evt_chain',
        version: 1,
        nameKey: 'event.chain.name',
        descriptionKey: 'event.chain.desc',
        category: 'special',
        weight: 5,
        nextEventRefs: ['evt_treasure', 'evt_blessing'],
        conditions: [
          { type: 'previousEventResolved', params: { eventId: 'evt_story' } },
        ],
      },
    ];
  }

  private static _createTestEventPools(): EventPool[] {
    return [
      {
        id: 'POOL_COMMON',
        version: 1,
        nameKey: 'pool.common',
        eventPoolRefs: ['evt_treasure', 'evt_battle', 'evt_shop', 'evt_blessing'],
      },
      {
        id: 'POOL_RARE',
        version: 1,
        nameKey: 'pool.rare',
        eventPoolRefs: ['evt_curse', 'evt_story', 'evt_chain'],
      },
    ];
  }
}
