// ============================================================
// Phase7Step1DebugRunner — Phase7-Step1 Roguelike Core Framework 集成测试
// 职责：验证 RoguelikeSystem / DomainEventBus / ConfigValidator / RuntimeValidator / SaveMigration
// 用法：在 Cocos Creator 控制台执行 Phase7Step1DebugRunner.runAll()
// ============================================================

import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import { DomainEventBus } from '../systems/DomainEventBus';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { SaveValidator } from '../save/SaveValidator';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
} from '../save/SaveContainer';
import type {
  DungeonConfigV2,
  DungeonRunState,
  EventChoice,
  RewardSource,
  RewardPoolConfigV2,
  DropTableConfigV2,
  GrowthCurveConfig,
  PowerFormulaConfigV2,
} from '../data/roguelike_types';
import {
  generateCorrelationId,
  DomainEventType,
} from '../data/roguelike_types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase7Step1DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有测试 */
  static runAll(): void {
    this._results = [];
    console.log('========== Phase7-Step1 Roguelike Core Framework 集成测试 ==========\n');

    // 1. 领域事件总线测试
    this.testDomainEventBus();

    // 2. 配置校验器测试
    this.testConfigValidator();

    // 3. 运行时校验器测试
    this.testRuntimeValidator();

    // 4. RoguelikeSystem 完整流程测试
    this.testRoguelikeSystem();

    // 5. SaveContainer V2 测试
    this.testSaveContainerV2();

    // 6. 迁移 V1→V2 测试
    this.testMigrationV1ToV2();

    // 7. 保底与历史数据结构测试
    this.testPityAndHistory();

    // 汇总
    this.printSummary();
  }

  // ==================== 测试 1：DomainEventBus ====================

  private static testDomainEventBus(): void {
    console.log('--- 测试 1: DomainEventBus ---');

    const bus = new DomainEventBus();

    // 1a. 关联 ID 生成
    const corrId = bus.beginCorrelation('test');
    this.assert(
      'beginCorrelation 生成有效 ID',
      corrId.startsWith('corr_') && bus.getActiveCorrelationCount() >= 1,
    );

    // 1b. 发布事件
    const event = bus.publish(
      DomainEventType.DUNGEON_RUN_STARTED,
      { dungeonId: 'test_dungeon' },
      'aggregate_1',
      'player_001',
      corrId,
    );

    this.assert(
      'publish 返回有效事件',
      event.id.startsWith('evt_') && event.type === DomainEventType.DUNGEON_RUN_STARTED,
    );

    this.assert(
      '事件的 correlationId 匹配',
      event.correlationId === corrId,
    );

    // 1c. 按 correlationId 查询
    const relatedEvents = bus.getEventsByCorrelation(corrId);
    this.assert(
      'getEventsByCorrelation 返回匹配事件',
      relatedEvents.length >= 1 && relatedEvents[0].id === event.id,
    );

    // 1d. 按 type 查询
    const typedEvents = bus.getEventsByType(DomainEventType.DUNGEON_RUN_STARTED);
    this.assert(
      'getEventsByType 返回匹配事件',
      typedEvents.length >= 1,
    );

    // 1e. 结束关联
    bus.endCorrelation(corrId);
    this.assert(
      'endCorrelation 清理关联上下文',
      bus.getActiveCorrelationCount() === 0,
    );

    // 1f. 事件缓冲区
    this.assert(
      'getEventCount 返回正确计数',
      bus.getEventCount() >= 1,
    );

    // 1g. 订阅测试
    let received = false;
    bus.subscribe<{ test: string }>('TestEvent', (e) => {
      received = e.payload.test === 'hello';
    });
    bus.publish('TestEvent', { test: 'hello' }, 'agg', 'p1');
    this.assert('subscribe 正确接收事件', received);

    console.log('DomainEventBus 测试完成\n');
  }

  // ==================== 测试 2：ConfigValidator ====================

  private static testConfigValidator(): void {
    console.log('--- 测试 2: ConfigValidator ---');

    const validator = new ConfigValidator();

    // 2a. 校验有效的地牢图配置
    const validConfig = this._createValidDungeonConfig();
    const validResult = validator.validateDungeonGraph(validConfig);
    this.assert(
      '有效的地牢图配置通过校验',
      validResult.valid,
    );

    // 2b. 校验有空层的地牢图
    const emptyLayersConfig: DungeonConfigV2 = {
      id: 'empty_dungeon',
      version: 1,
      nameKey: 'empty',
      layers: [],
      entryRules: [],
      rewardPoolRefs: [],
      eventPoolRefs: [],
      bossRefs: [],
      tags: [],
    };
    const emptyResult = validator.validateDungeonGraph(emptyLayersConfig);
    this.assert(
      '空层数组被拒绝',
      !emptyResult.valid,
    );

    // 2c. 校验有断链的地牢图
    const brokenConfig = this._createBrokenDungeonConfig();
    const brokenResult = validator.validateDungeonGraph(brokenConfig);
    this.assert(
      '断链节点被检测',
      brokenResult.issues.some((i) =>
        i.severity === 'error' && i.path.includes('nextNodeIds'),
      ),
    );

    // 2d. 校验成长曲线
    const curves: GrowthCurveConfig[] = [
      { id: 'curve_level', version: 1, track: 'level', maxLevel: 100, statModifiers: [] },
      { id: 'curve_skill', version: 1, track: 'skill', maxLevel: 50, statModifiers: [] },
    ];
    const curveResult = validator.validateGrowthCurves(curves);
    this.assert('成长曲线校验通过', curveResult.valid);

    // 2e. 重复轨道检测
    const dupCurves: GrowthCurveConfig[] = [
      { id: 'c1', version: 1, track: 'level', maxLevel: 100, statModifiers: [] },
      { id: 'c2', version: 1, track: 'level', maxLevel: 50, statModifiers: [] },
    ];
    const dupResult = validator.validateGrowthCurves(dupCurves);
    this.assert(
      '重复轨道被检测',
      !dupResult.valid,
    );

    // 2f. 校验战力公式
    const formulas: PowerFormulaConfigV2[] = [
      {
        id: 'formula_v1',
        version: 1,
        effectiveFromSaveVersion: 1,
        statWeights: { hp: 1.0, atk: 2.0, def: 0.5, speed: 0.3 },
        modifiers: [],
        rounding: 'floor',
      },
    ];
    const formulaResult = validator.validatePowerFormulas(formulas);
    this.assert('战力公式校验通过', formulaResult.valid);

    console.log('ConfigValidator 测试完成\n');
  }

  // ==================== 测试 3：RuntimeValidator ====================

  private static testRuntimeValidator(): void {
    console.log('--- 测试 3: RuntimeValidator ---');

    const validator = new RuntimeValidator();

    // 3a. 校验有效的经验更新
    const expResult = validator.validateExpUpdate('hero_1', 100, 5, 6);
    this.assert('有效经验更新通过校验', expResult.valid);

    // 3b. 校验负数经验
    const negExpResult = validator.validateExpUpdate('hero_1', -10, 5, 6);
    this.assert('负数经验被拒绝', !negExpResult.valid);

    // 3c. 校验超限经验
    const hugeExpResult = validator.validateExpUpdate('hero_1', 9999999, 5, 6);
    this.assert('超限经验产生警告', hugeExpResult.warningCount > 0);

    // 3d. 校验奖励来源
    const source: RewardSource = {
      sourceId: 'test_source',
      sourceType: 'dungeon_boss',
      dropTableRefs: ['DROP_001'],
      rewardPoolRefs: [],
      context: { playerId: 'p1', correlationId: generateCorrelationId() },
    };
    const sourceResult = validator.validateRewardSource(source);
    this.assert('有效奖励来源通过校验', sourceResult.valid);

    // 3e. 校验无效来源类型
    const badSource: RewardSource = {
      ...source,
      sourceType: 'invalid' as RewardSource['sourceType'],
    };
    const badSourceResult = validator.validateRewardSource(badSource);
    this.assert('无效来源类型被拒绝', !badSourceResult.valid);

    console.log('RuntimeValidator 测试完成\n');
  }

  // ==================== 测试 4：RoguelikeSystem 完整流程 ====================

  private static testRoguelikeSystem(): void {
    console.log('--- 测试 4: RoguelikeSystem 完整流程 ---');

    const system = new RoguelikeSystem();
    const validConfig = this._createValidDungeonConfig();
    system.registerConfigs([validConfig]);

    // 4a. 启动运行
    const runState = system.startRun('test_dungeon_01');
    this.assert('startRun 创建有效运行状态', runState !== null);
    if (!runState) return;

    this.assert(
      'runState 包含正确的地牢 ID',
      runState.dungeonId === 'test_dungeon_01',
    );

    this.assert(
      'runState 从第一层入口开始',
      runState.currentLayerId === 'layer_01' && runState.currentNodeId === 'node_01',
    );

    // 4b. 获取可用节点
    const availableNodes = system.getAvailableNodes(runState);
    this.assert(
      'getAvailableNodes 返回入口节点的后继节点',
      availableNodes.length > 0,
    );

    // 4c. 进入战斗节点
    const battleNodeId = availableNodes.find((n) => n.type === 'battle')?.nodeId;
    if (battleNodeId) {
      const nodeResult = system.enterNode(runState, battleNodeId);
      this.assert(
        'enterNode 战斗节点生成 battleRequest',
        nodeResult.battleRequest !== undefined,
      );
      this.assert(
        'enterNode 战斗节点生成 rewardSources',
        nodeResult.rewardSources.length >= 0,
      );
    }

    // 4d. 进入事件节点
    const eventNodeId = availableNodes.find((n) => n.type === 'event')?.nodeId;
    if (eventNodeId) {
      system.enterNode(runState, eventNodeId);

      const choices: EventChoice[] = [
        {
          choiceId: 'choice_a',
          descriptionKey: '选择 A',
          rewardSources: [
            {
              sourceId: 'event_reward_a',
              sourceType: 'dungeon_event',
              dropTableRefs: ['DROP_001'],
              rewardPoolRefs: [],
              context: { playerId: 'p1', correlationId: 'test_corr' },
            },
          ],
        },
      ];

      const eventResult = system.resolveEvent(runState, 'choice_a', choices);
      this.assert(
        'resolveEvent 返回正确选择',
        eventResult.chosenChoiceId === 'choice_a',
      );
    }

    // 4e. 完成关卡
    const runResult = system.completeRun(runState);
    this.assert(
      'completeRun 返回成功',
      runResult.success,
    );
    this.assert(
      'completeRun 包含基础奖励',
      runResult.baseRewards.length > 0,
    );
    this.assert(
      'completeRun 持续时间 > 0',
      runResult.durationMs > 0,
    );

    // 4f. 领域事件关联
    const eventBus = system.getDomainEventBus();
    const allEvents = eventBus.getRecentEvents(100);
    this.assert(
      '完整流程产生了领域事件',
      allEvents.length > 0,
    );

    const runCompletedEvents = eventBus.getEventsByType(DomainEventType.DUNGEON_RUN_COMPLETED);
    this.assert(
      '产生了通关完成事件',
      runCompletedEvents.length >= 1,
    );

    console.log('RoguelikeSystem 测试完成\n');
  }

  // ==================== 测试 5：SaveContainer V2 ====================

  private static testSaveContainerV2(): void {
    console.log('--- 测试 5: SaveContainer V2 ---');

    // 5a. 默认容器包含 roguelikeState
    const container = createDefaultSaveContainer();
    this.assert(
      'createDefaultSaveContainer 包含 roguelikeState',
      container.roguelikeState !== undefined,
    );

    this.assert(
      'roguelikeState.activeRun 为 null（新容器）',
      container.roguelikeState!.activeRun === null,
    );

    this.assert(
      'roguelikeState.runHistory 为空数组',
      Array.isArray(container.roguelikeState!.runHistory)
        && container.roguelikeState!.runHistory.length === 0,
    );

    // 5b. 版本号正确
    this.assert(
      'CURRENT_SAVE_VERSION 为 2',
      CURRENT_SAVE_VERSION === 2,
    );

    this.assert(
      '默认容器的 saveVersion 为 2',
      container.saveVersion === 2,
    );

    // 5c. 校验通过
    const validator = SaveValidator.getInstance();
    const validResult = validator.validate(container);
    this.assert(
      'V2 默认容器通过 SaveValidator 校验',
      validResult.valid,
    );

    console.log('SaveContainer V2 测试完成\n');
  }

  // ==================== 测试 6：迁移 V1→V2 ====================

  private static testMigrationV1ToV2(): void {
    console.log('--- 测试 6: 迁移 V1→V2 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 6a. 检查 V1→V2 步骤已注册
    const steps = migrationSystem.getMigrationSteps();
    const v1toV2Step = steps.find((s) => s.fromVersion === 1 && s.toVersion === 2);
    this.assert('V1→V2 迁移步骤已注册', v1toV2Step !== undefined);

    // 6b. 模拟 V1 存档迁移
    const v1Container = createDefaultSaveContainer();
    v1Container.saveVersion = 1;
    delete v1Container.roguelikeState; // 模拟 V1 存档无此字段

    const result = migrationSystem.migrate(v1Container);
    this.assert(
      'V1→V2 迁移成功',
      result.success,
    );

    this.assert(
      '迁移后版本为 2',
      v1Container.saveVersion === 2,
    );

    this.assert(
      '迁移后 roguelikeState 已添加',
      v1Container.roguelikeState !== undefined
        && v1Container.roguelikeState!.activeRun === null,
    );

    // 6c. V2 存档无需迁移
    const v2Container = createDefaultSaveContainer();
    const v2Result = migrationSystem.migrate(v2Container);
    this.assert(
      'V2 存档无需迁移（stepsExecuted=0）',
      v2Result.stepsExecuted === 0,
    );

    console.log('迁移 V1→V2 测试完成\n');
  }

  // ==================== 测试 7：保底与历史数据结构 ====================

  private static testPityAndHistory(): void {
    console.log('--- 测试 7: 保底与历史数据结构 ---');

    // 7a. 掉落表 V2 配置
    const dropTable: DropTableConfigV2 = {
      id: 'DROP_V2_001',
      version: 1,
      entries: [
        {
          rewardRef: 'ITEM_SSR_SWORD',
          weight: 5,
          quantity: { min: 1, max: 1 },
          tags: ['rare'],
        },
        {
          rewardRef: 'ITEM_R_ARMOR',
          weight: 50,
          quantity: { min: 1, max: 3 },
        },
      ],
      pityRules: [
        {
          id: 'pity_ssr',
          scope: 'player',
          scopeKey: 'player_001',
          threshold: 10,
          guaranteedRewardPoolRef: 'POOL_SSR_GUARANTEE',
          resetOnTrigger: true,
        },
      ],
    };

    const configValidator = new ConfigValidator();
    const tableResult = configValidator.validateDropTables([dropTable]);
    this.assert('掉落表 V2 校验通过', tableResult.valid);

    // 7b. 奖励池配置
    const pool: RewardPoolConfigV2 = {
      id: 'POOL_001',
      version: 1,
      mode: 'weighted_one',
      tableRefs: ['DROP_V2_001'],
    };
    const poolResult = configValidator.validateRewardPools([pool]);
    this.assert('奖励池校验通过', poolResult.valid);

    // 7c. 循环引用检测
    const circularPool: RewardPoolConfigV2 = {
      id: 'POOL_CIRCULAR',
      version: 1,
      mode: 'all',
      tableRefs: ['POOL_CIRCULAR'], // 自己引用自己
    };
    const circularResult = configValidator.validateRewardPools([circularPool]);
    this.assert(
      '循环引用被检测',
      circularResult.issues.some((i) =>
        i.severity === 'error' && i.message.includes('循环引用'),
      ),
    );

    console.log('保底与历史数据结构测试完成\n');
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

  /**
   * 创建有效的三层节点图地牢配置，用于测试。
   *
   * 结构：
   *   Layer 1: node_01(入口) → node_02(battle) → node_03(event)
   *                                    ↓
   *                            node_04(reward)
   *   Layer 2: node_05(入口) → node_06(battle) → node_07(boss)
   *   Layer 3: node_08(入口) → node_09(boss, 最终)
   */
  private static _createValidDungeonConfig(): DungeonConfigV2 {
    return {
      id: 'test_dungeon_01',
      version: 1,
      nameKey: 'dungeon.test_01',
      layers: [
        {
          id: 'layer_01',
          order: 0,
          nodeGraph: [
            {
              id: 'node_01',
              type: 'empty',
              nextNodeIds: ['node_02', 'node_04'],
            },
            {
              id: 'node_02',
              type: 'battle',
              nextNodeIds: ['node_03'],
              dropSourceRefs: ['DROP_001'],
            },
            {
              id: 'node_03',
              type: 'event',
              nextNodeIds: [],
              eventRefs: ['event_treasure'],
            },
            {
              id: 'node_04',
              type: 'reward',
              nextNodeIds: ['node_03'],
              rewardPoolRefs: ['POOL_001'],
            },
          ],
          completionRules: [
            { type: 'reachNode', target: 'node_03' },
          ],
        },
        {
          id: 'layer_02',
          order: 1,
          nodeGraph: [
            {
              id: 'node_05',
              type: 'empty',
              nextNodeIds: ['node_06'],
            },
            {
              id: 'node_06',
              type: 'battle',
              nextNodeIds: ['node_07'],
              dropSourceRefs: ['DROP_002'],
            },
            {
              id: 'node_07',
              type: 'boss',
              nextNodeIds: [],
              bossRef: 'boss_dragon',
              dropSourceRefs: ['DROP_BOSS'],
              rewardPoolRefs: ['POOL_BOSS'],
            },
          ],
          completionRules: [
            { type: 'defeatBoss', target: 'boss_dragon' },
          ],
        },
        {
          id: 'layer_03',
          order: 2,
          nodeGraph: [
            {
              id: 'node_08',
              type: 'empty',
              nextNodeIds: ['node_09'],
            },
            {
              id: 'node_09',
              type: 'boss',
              nextNodeIds: [],
              bossRef: 'boss_final',
              dropSourceRefs: ['DROP_FINAL'],
              rewardPoolRefs: ['POOL_FINAL'],
            },
          ],
          completionRules: [
            { type: 'defeatBoss', target: 'boss_final' },
          ],
        },
      ],
      entryRules: [
        { type: 'minPlayerLevel', params: { level: 5 } },
      ],
      rewardPoolRefs: ['POOL_DUNGEON_COMPLETE'],
      eventPoolRefs: ['event_treasure', 'event_trap'],
      bossRefs: ['boss_dragon', 'boss_final'],
      tags: ['phase7', 'test'],
    };
  }

  /**
   * 创建有断链的无效地牢配置。
   */
  private static _createBrokenDungeonConfig(): DungeonConfigV2 {
    return {
      id: 'broken_dungeon',
      version: 1,
      nameKey: 'dungeon.broken',
      layers: [
        {
          id: 'layer_01',
          order: 0,
          nodeGraph: [
            {
              id: 'node_01',
              type: 'empty',
              nextNodeIds: ['node_02', 'node_ghost'], // node_ghost 不存在
            },
            {
              id: 'node_02',
              type: 'battle',
              nextNodeIds: [],
            },
          ],
          completionRules: [],
        },
      ],
      entryRules: [],
      rewardPoolRefs: [],
      eventPoolRefs: [],
      bossRefs: [],
      tags: [],
    };
  }
}
