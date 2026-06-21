// ============================================================
// Phase7Step2DebugRunner — Phase7-Step2 DungeonGraph 集成测试
// 职责：验证 NodeFork / BranchPath / FloorTransition / 持久化 / 图拓扑
// 用法：在 Cocos Creator 控制台执行 Phase7Step2DebugRunner.runAll()
// ============================================================

import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import { DomainEventBus } from '../systems/DomainEventBus';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
} from '../save/SaveContainer';
import {
  createDefaultRoguelikeSaveData,
} from '../data/roguelike_types';
import type {
  DungeonConfigV2,
  DungeonRunState,
  EventChoice,
  NodeFork,
  BranchPath,
  FloorTransition,
  RoguelikeSaveData,
} from '../data/roguelike_types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase7Step2DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 DungeonGraph 测试 */
  static runAll(): void {
    this._results = [];
    console.log('========== Phase7-Step2 DungeonGraph 集成测试 ==========\n');

    // 1. NodeFork 分支检测测试
    this.testNodeForkDetection();

    // 2. BranchPath 选择与记录测试
    this.testBranchPathSelection();

    // 3. FloorTransition 楼层转换测试
    this.testFloorTransition();

    // 4. 持久化测试
    this.testPersistence();

    // 5. 图拓扑校验测试
    this.testGraphTopologyValidation();

    // 6. 运行时分支与转换校验测试
    this.testRuntimeBranchAndTransitionValidation();

    // 7. 完整多楼层流程测试
    this.testFullMultiFloorFlow();

    // 汇总
    this.printSummary();
  }

  // ==================== 测试 1：NodeFork 分支检测 ====================

  private static testNodeForkDetection(): void {
    console.log('--- 测试 1: NodeFork 分支检测 ---');

    const system = new RoguelikeSystem();
    const config = this._createForkDungeonConfig();
    system.registerConfigs([config]);

    // 1a. 启动地牢 run
    const runState = system.startRun('dungeon_fork_test');
    this.assert('startRun 成功', runState !== null);
    if (!runState) return;

    // 1b. 从入口节点获取可用节点
    const availableNodes = system.getAvailableNodes(runState);
    this.assert(
      '入口节点有多个分支（3 个）',
      availableNodes.length === 3,
    );

    // 1c. 验证：入口节点是分叉点
    const fork = system.getNodeForks(runState);
    this.assert(
      '入口节点检测到分叉',
      fork !== null,
    );
    this.assert(
      '分叉包含 3 个分支',
      fork !== null && fork.branches.length === 3,
    );
    this.assert(
      '分叉源节点 ID 正确',
      fork !== null && fork.sourceNodeId === 'fork_entry',
    );

    // 1d. 验证各分支类型
    if (fork) {
      const battleBranch = fork.branches.find((b) => b.nodeType === 'battle');
      const eventBranch = fork.branches.find((b) => b.nodeType === 'event');
      const rewardBranch = fork.branches.find((b) => b.nodeType === 'reward');
      this.assert('分叉包含战斗分支', battleBranch !== undefined);
      this.assert('分叉包含事件分支', eventBranch !== undefined);
      this.assert('分叉包含奖励分支', rewardBranch !== undefined);
    }

    // 1e. 终节点不应该有分叉
    system.enterNode(runState, 'fork_battle_01');
    const terminalFork = system.getNodeForks(runState);
    this.assert(
      '终节点（nextNodeIds 为空）无分叉',
      terminalFork === null,
    );

    console.log('NodeFork 分支检测测试完成\n');
  }

  // ==================== 测试 2：BranchPath 选择与记录 ====================

  private static testBranchPathSelection(): void {
    console.log('--- 测试 2: BranchPath 选择与记录 ---');

    const system = new RoguelikeSystem();
    const config = this._createForkDungeonConfig();
    system.registerConfigs([config]);

    const runState = system.startRun('dungeon_fork_test');
    if (!runState) return;

    // 2a. 选择战斗分支
    const { state: newState, branchPath } = system.chooseBranch(runState, 'fork_battle_01');
    this.assert(
      'chooseBranch 返回正确的分支路径',
      branchPath.chosenNodeId === 'fork_battle_01',
    );
    this.assert(
      '分支路径记录了跳过的节点',
      branchPath.skippedNodeIds.length === 2,
    );
    this.assert(
      '跳过的节点包含事件和奖励分支',
      branchPath.skippedNodeIds.includes('fork_event_01')
        && branchPath.skippedNodeIds.includes('fork_reward_01'),
    );

    // 2b. 分支历史已记录
    this.assert(
      'branchHistory 非空',
      newState.branchHistory !== undefined && newState.branchHistory.length === 1,
    );

    // 2c. 分支路径 ID 一致性
    this.assert(
      'branchPath.forkNodeId 正确',
      branchPath.forkNodeId === 'fork_entry',
    );
    this.assert(
      'branchPath.chosenAt 有效',
      branchPath.chosenAt > 0,
    );

    // 2d. 进入选择的节点
    const nodeResult = system.enterNode(runState, 'fork_battle_01');
    this.assert(
      '选择后进入节点成功',
      nodeResult.battleRequest !== undefined,
    );

    console.log('BranchPath 选择与记录测试完成\n');
  }

  // ==================== 测试 3：FloorTransition 楼层转换 ====================

  private static testFloorTransition(): void {
    console.log('--- 测试 3: FloorTransition 楼层转换 ---');

    const system = new RoguelikeSystem();
    const config = this._createMultiFloorConfig();
    system.registerConfigs([config]);

    const runState = system.startRun('dungeon_multifloor');
    if (!runState) return;

    // 3a. 进入并完成第一层
    runState.currentNodeId = 'floor1_node_02';
    runState.visitedNodeIds.push('floor1_node_02');
    runState.defeatedBossIds.push('boss_floor1');

    const layerResult = system.completeLayer(runState);
    this.assert(
      '第一层完成',
      layerResult.isRunComplete === false,
    );
    this.assert(
      '第一层产生 floorTransition',
      layerResult.floorTransition !== undefined,
    );

    // 3b. 验证楼层转换记录
    if (layerResult.floorTransition) {
      const ft = layerResult.floorTransition;
      this.assert(
        '转换从第一层出发',
        ft.fromLayerId === 'floor1',
      );
      this.assert(
        '转换到达第二层',
        ft.toLayerId === 'floor2',
      );
      this.assert(
        '转换方向为 forward',
        ft.direction === 'forward',
      );
      this.assert(
        '转换原因为 layerComplete',
        ft.reason === 'layerComplete',
      );
    }

    // 3c. 验证状态更新
    this.assert(
      '当前层已更新为第二层',
      runState.currentLayerId === 'floor2',
    );
    this.assert(
      'floorTransitions 已记录',
      runState.floorTransitions !== undefined && runState.floorTransitions.length === 1,
    );

    // 3d. 手动触发楼层转换（warp）
    const warpTransition = system.transitionFloor(
      runState,
      'floor3',
      'floor3_node_01',
      'warp',
      'warpItem',
    );
    this.assert(
      'warp 转换成功',
      warpTransition.direction === 'warp' && warpTransition.reason === 'warpItem',
    );
    this.assert(
      'warp 后当前层为第三层',
      runState.currentLayerId === 'floor3',
    );
    this.assert(
      'floorTransitions 有 2 条记录',
      runState.floorTransitions !== undefined && runState.floorTransitions.length === 2,
    );

    console.log('FloorTransition 楼层转换测试完成\n');
  }

  // ==================== 测试 4：持久化测试 ====================

  private static testPersistence(): void {
    console.log('--- 测试 4: 持久化 ---');

    const system = new RoguelikeSystem();
    const config = this._createMultiFloorConfig();
    system.registerConfigs([config]);

    const runState = system.startRun('dungeon_multifloor');
    if (!runState) return;

    // 4a. 保存到存档数据
    const saveData = createDefaultRoguelikeSaveData();
    const saved = system.saveRunToSaveData(runState.runId, saveData);
    this.assert('saveRunToSaveData 成功', saved);
    this.assert('saveData.activeRun 非空', saveData.activeRun !== null);
    this.assert(
      'activeRun runId 匹配',
      saveData.activeRun !== null && saveData.activeRun.runId === runState.runId,
    );

    // 4b. 清理后从存档恢复
    system.clearAll();
    const restored = system.loadRunFromSaveData(saveData);
    this.assert('从存档恢复成功', restored !== null);
    if (restored) {
      this.assert('恢复的 runId 正确', restored.runId === runState.runId);
      this.assert('恢复的 dungeonId 正确', restored.dungeonId === 'dungeon_multifloor');
    }

    // 4c. 归档到历史
    const newSystem = new RoguelikeSystem();
    newSystem.registerConfigs([config]);
    const runState2 = newSystem.startRun('dungeon_multifloor');
    if (runState2) {
      const saveData2 = createDefaultRoguelikeSaveData();
      newSystem.saveRunToSaveData(runState2.runId, saveData2);
      const archived = newSystem.archiveRunToHistory(runState2.runId, saveData2);
      this.assert('archiveRunToHistory 成功', archived);
      this.assert('activeRun 已清空', saveData2.activeRun === null);
      this.assert('runHistory 包含 1 条记录', saveData2.runHistory.length === 1);
    }

    console.log('持久化测试完成\n');
  }

  // ==================== 测试 5：图拓扑校验 ====================

  private static testGraphTopologyValidation(): void {
    console.log('--- 测试 5: 图拓扑校验 ---');

    const validator = new ConfigValidator();

    // 5a. 有效的分叉图通过校验
    const forkConfig = this._createForkDungeonConfig();
    const forkResult = validator.validateGraphTopology(forkConfig);
    this.assert('有效分叉图通过拓扑校验', forkResult.valid);

    // 5b. 自引用节点被检测
    const selfRefConfig: DungeonConfigV2 = {
      id: 'self_ref_test',
      version: 1,
      nameKey: 'test.self_ref',
      layers: [{
        id: 'layer_01',
        order: 0,
        nodeGraph: [
          {
            id: 'node_01',
            type: 'empty',
            nextNodeIds: ['node_01', 'node_02'], // 自引用
          },
          { id: 'node_02', type: 'battle', nextNodeIds: [] },
        ],
        completionRules: [],
      }],
      entryRules: [],
      rewardPoolRefs: [],
      eventPoolRefs: [],
      bossRefs: [],
      tags: [],
    };
    const selfRefResult = validator.validateGraphTopology(selfRefConfig);
    this.assert(
      '自引用节点被检测为 error',
      selfRefResult.issues.some((i) =>
        i.severity === 'error' && i.message.includes('自身'),
      ),
    );

    // 5c. 层间转换校验
    const multiFloorConfig = this._createMultiFloorConfig();
    const transitionResult = validator.validateLayerTransitions(multiFloorConfig);
    this.assert('多层转换校验通过', transitionResult.valid);

    // 5d. 缺少 completionRules 产生警告
    if (multiFloorConfig.layers.length > 0) {
      const noRulesConfig = JSON.parse(JSON.stringify(multiFloorConfig)) as DungeonConfigV2;
      noRulesConfig.layers[0].completionRules = [];
      const noRulesResult = validator.validateLayerTransitions(noRulesConfig);
      this.assert(
        '缺少 completionRules 产生警告',
        noRulesResult.issues.some((i) => i.severity === 'warning'),
      );
    }

    console.log('图拓扑校验测试完成\n');
  }

  // ==================== 测试 6：运行时分支与转换校验 ====================

  private static testRuntimeBranchAndTransitionValidation(): void {
    console.log('--- 测试 6: 运行时分支与转换校验 ---');

    const validator = new RuntimeValidator();

    // 6a. 有效的分支路径通过校验
    const validBranch: BranchPath = {
      forkNodeId: 'fork_01',
      chosenNodeId: 'branch_a',
      skippedNodeIds: ['branch_b', 'branch_c'],
      chosenAt: Date.now(),
    };
    const branchResult = validator.validateBranchPath(validBranch);
    this.assert('有效分支路径通过校验', branchResult.valid);

    // 6b. 自选分支被拒绝
    const selfBranch: BranchPath = {
      forkNodeId: 'fork_01',
      chosenNodeId: 'fork_01',  // 与 forkNodeId 相同
      skippedNodeIds: ['branch_b'],
      chosenAt: Date.now(),
    };
    const selfBranchResult = validator.validateBranchPath(selfBranch);
    this.assert(
      '自选分支被拒绝',
      !selfBranchResult.valid,
    );

    // 6c. 有效的楼层转换通过校验
    const validTransition: FloorTransition = {
      transitionId: 'trans_001',
      fromLayerId: 'floor1',
      toLayerId: 'floor2',
      fromNodeId: 'node_01',
      toNodeId: 'node_02',
      direction: 'forward',
      reason: 'layerComplete',
      transitionedAt: Date.now(),
    };
    const transResult = validator.validateFloorTransition(validTransition);
    this.assert('有效楼层转换通过校验', transResult.valid);

    // 6d. 相同楼层转换被拒绝
    const sameFloorTransition: FloorTransition = {
      ...validTransition,
      toLayerId: 'floor1', // 同层
    };
    const sameFloorResult = validator.validateFloorTransition(sameFloorTransition);
    this.assert(
      '同层转换被拒绝',
      !sameFloorResult.valid,
    );

    // 6e. 无效方向被拒绝
    const badDirTransition: FloorTransition = {
      ...validTransition,
      direction: 'sideways' as FloorTransition['direction'],
    };
    const badDirResult = validator.validateFloorTransition(badDirTransition);
    this.assert(
      '无效转换方向被拒绝',
      !badDirResult.valid,
    );

    console.log('运行时分支与转换校验测试完成\n');
  }

  // ==================== 测试 7：完整多楼层流程 ====================

  private static testFullMultiFloorFlow(): void {
    console.log('--- 测试 7: 完整多楼层流程 ---');

    const system = new RoguelikeSystem();
    const config = this._createFullFlowDungeonConfig();
    system.registerConfigs([config]);

    // 7a. 启动运行
    const runState = system.startRun('dungeon_full_flow');
    this.assert('完整流程: startRun 成功', runState !== null);
    if (!runState) return;

    // 7b. 第一层：入口 → 战斗节点
    const entryNode = system.getAvailableNodes(runState);
    this.assert('第一层入口有后续节点', entryNode.length > 0);

    const battleTarget = entryNode.find((n) => n.type === 'battle');
    if (battleTarget) {
      const battleResult = system.enterNode(runState, battleTarget.nodeId);
      this.assert('进入战斗节点成功', battleResult.battleRequest !== undefined);
    }

    // 7c. 第一层完成 → 楼层转换到第二层
    runState.defeatedBossIds.push('boss_floor1');
    const layer1Result = system.completeLayer(runState);
    this.assert('第一层完成', layer1Result.isRunComplete === false);
    this.assert('第一层转换到第二层', runState.currentLayerId === 'f2');

    // 7d. 第二层：分叉选择
    const fork = system.getNodeForks(runState);
    this.assert('第二层入口检测到分叉', fork !== null);
    if (fork) {
      const { branchPath } = system.chooseBranch(runState, fork.branches[0].nodeId);
      this.assert('选择了第一个分支', branchPath.chosenNodeId === fork.branches[0].nodeId);
      this.assert('branchHistory 包含 1 条记录',
        runState.branchHistory !== undefined && runState.branchHistory.length === 1,
      );
    }

    // 7e. 第二层完成 → 楼层转换到第三层
    runState.defeatedBossIds.push('boss_floor2');
    const layer2Result = system.completeLayer(runState);
    this.assert('第二层完成', runState.currentLayerId === 'f3');

    // 7f. 第三层完成 → 通关
    runState.defeatedBossIds.push('boss_floor3');
    const runResult = system.completeRun(runState);
    this.assert('第三层通关成功', runResult.success);
    this.assert('通关有基础奖励', runResult.baseRewards.length > 0);

    // 7g. 审计：整个流程产生了分支和转换历史
    this.assert('产生了分支历史',
      runState.branchHistory !== undefined && runState.branchHistory.length >= 1,
    );
    this.assert('产生了楼层转换历史',
      runState.floorTransitions !== undefined && runState.floorTransitions.length >= 2,
    );

    // 7h. 领域事件覆盖
    const eventBus = system.getDomainEventBus();
    const allEvents = eventBus.getRecentEvents(200);
    this.assert('完整流程产生了领域事件', allEvents.length > 0);

    console.log('完整多楼层流程测试完成\n');
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
   * 创建分叉节点图地牢配置（单层，验证分支检测）。
   *
   * 结构：
   *   fork_entry → fork_battle_01  (终)
   *              → fork_event_01   (终)
   *              → fork_reward_01  (终)
   */
  private static _createForkDungeonConfig(): DungeonConfigV2 {
    return {
      id: 'dungeon_fork_test',
      version: 1,
      nameKey: 'dungeon.fork_test',
      layers: [{
        id: 'layer_fork',
        order: 0,
        nodeGraph: [
          {
            id: 'fork_entry',
            type: 'empty',
            nextNodeIds: ['fork_battle_01', 'fork_event_01', 'fork_reward_01'],
          },
          {
            id: 'fork_battle_01',
            type: 'battle',
            nextNodeIds: [],
            dropSourceRefs: ['DROP_BATTLE'],
          },
          {
            id: 'fork_event_01',
            type: 'event',
            nextNodeIds: [],
            eventRefs: ['event_treasure'],
          },
          {
            id: 'fork_reward_01',
            type: 'reward',
            nextNodeIds: [],
            rewardPoolRefs: ['POOL_REWARD'],
          },
        ],
        completionRules: [{ type: 'clearAllNodes', target: 'all' }],
      }],
      entryRules: [],
      rewardPoolRefs: [],
      eventPoolRefs: ['event_treasure'],
      bossRefs: [],
      tags: ['phase7-step2', 'fork_test'],
    };
  }

  /**
   * 创建多楼层地牢配置（3 层，每层简单线性）。
   */
  private static _createMultiFloorConfig(): DungeonConfigV2 {
    return {
      id: 'dungeon_multifloor',
      version: 1,
      nameKey: 'dungeon.multifloor',
      layers: [
        {
          id: 'floor1',
          order: 0,
          nodeGraph: [
            { id: 'floor1_node_01', type: 'empty', nextNodeIds: ['floor1_node_02'] },
            { id: 'floor1_node_02', type: 'boss', nextNodeIds: [], bossRef: 'boss_floor1' },
          ],
          completionRules: [{ type: 'defeatBoss', target: 'boss_floor1' }],
        },
        {
          id: 'floor2',
          order: 1,
          nodeGraph: [
            { id: 'floor2_node_01', type: 'empty', nextNodeIds: ['floor2_node_02'] },
            { id: 'floor2_node_02', type: 'battle', nextNodeIds: ['floor2_node_03'] },
            { id: 'floor2_node_03', type: 'boss', nextNodeIds: [], bossRef: 'boss_floor2' },
          ],
          completionRules: [{ type: 'defeatBoss', target: 'boss_floor2' }],
        },
        {
          id: 'floor3',
          order: 2,
          nodeGraph: [
            { id: 'floor3_node_01', type: 'empty', nextNodeIds: ['floor3_node_02'] },
            { id: 'floor3_node_02', type: 'battle', nextNodeIds: ['floor3_node_03'] },
            { id: 'floor3_node_03', type: 'boss', nextNodeIds: [], bossRef: 'boss_floor3' },
          ],
          completionRules: [{ type: 'defeatBoss', target: 'boss_floor3' }],
        },
      ],
      entryRules: [],
      rewardPoolRefs: [],
      eventPoolRefs: [],
      bossRefs: ['boss_floor1', 'boss_floor2', 'boss_floor3'],
      tags: ['phase7-step2', 'multifloor'],
    };
  }

  /**
   * 创建完整流程多楼层地牢配置。
   *
   * 结构：
   *   F1: entry → battle → boss
   *   F2: entry → (fork) battle_a / event_a → boss
   *   F3: entry → battle → boss → (通关)
   */
  private static _createFullFlowDungeonConfig(): DungeonConfigV2 {
    return {
      id: 'dungeon_full_flow',
      version: 1,
      nameKey: 'dungeon.full_flow',
      layers: [
        {
          id: 'f1',
          order: 0,
          nodeGraph: [
            {
              id: 'f1_entry',
              type: 'empty',
              nextNodeIds: ['f1_battle'],
            },
            {
              id: 'f1_battle',
              type: 'battle',
              nextNodeIds: ['f1_boss'],
              dropSourceRefs: ['DROP_F1_BATTLE'],
            },
            {
              id: 'f1_boss',
              type: 'boss',
              nextNodeIds: [],
              bossRef: 'boss_floor1',
              dropSourceRefs: ['DROP_F1_BOSS'],
              rewardPoolRefs: ['POOL_F1_BOSS'],
            },
          ],
          completionRules: [{ type: 'defeatBoss', target: 'boss_floor1' }],
        },
        {
          id: 'f2',
          order: 1,
          nodeGraph: [
            {
              id: 'f2_entry',
              type: 'empty',
              nextNodeIds: ['f2_battle_a', 'f2_event_a'],
            },
            {
              id: 'f2_battle_a',
              type: 'battle',
              nextNodeIds: ['f2_boss'],
              dropSourceRefs: ['DROP_F2_BATTLE'],
            },
            {
              id: 'f2_event_a',
              type: 'event',
              nextNodeIds: ['f2_boss'],
              eventRefs: ['event_shortcut'],
            },
            {
              id: 'f2_boss',
              type: 'boss',
              nextNodeIds: [],
              bossRef: 'boss_floor2',
              rewardPoolRefs: ['POOL_F2_BOSS'],
            },
          ],
          completionRules: [{ type: 'defeatBoss', target: 'boss_floor2' }],
        },
        {
          id: 'f3',
          order: 2,
          nodeGraph: [
            {
              id: 'f3_entry',
              type: 'empty',
              nextNodeIds: ['f3_battle'],
            },
            {
              id: 'f3_battle',
              type: 'battle',
              nextNodeIds: ['f3_boss'],
              dropSourceRefs: ['DROP_F3_BATTLE'],
            },
            {
              id: 'f3_boss',
              type: 'boss',
              nextNodeIds: [],
              bossRef: 'boss_floor3',
              rewardPoolRefs: ['POOL_F3_BOSS'],
            },
          ],
          completionRules: [{ type: 'defeatBoss', target: 'boss_floor3' }],
        },
      ],
      entryRules: [{ type: 'minPlayerLevel', params: { level: 10 } }],
      rewardPoolRefs: ['POOL_COMPLETE'],
      eventPoolRefs: ['event_shortcut'],
      bossRefs: ['boss_floor1', 'boss_floor2', 'boss_floor3'],
      tags: ['phase7-step2', 'full_flow'],
    };
  }
}
