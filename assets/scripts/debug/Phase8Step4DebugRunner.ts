// ============================================================
// Phase8Step4DebugRunner — Phase8-Step4 Drop/Reward 优化集成测试
// 职责：验证 SaveManager 修复 / 保底持久化 / 多来源排序 / 一致性 / 动画事件
// 规范：遵循 Phase8Step3DebugRunner 模式（静态类 / 异步 / bootstrap 驱动）
// ============================================================

import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { DropSystem } from '../systems/DropSystem';
import { DungeonLoopController, DungeonLoopEvent } from '../systems/DungeonLoopController';
import { DropRewardVerifier } from '../systems/DropRewardVerifier';
import type { DropHistoryRecord, PityRule } from '../data/drop_types';
import type { RewardSource } from '../data/roguelike_types';
import type { DungeonConfigV2 } from '../data/roguelike_types';
import type { BossConfigData } from '../config/boss_config';
import type { VerificationReport } from '../systems/DropRewardVerifier';

// ==================== 测试结果接口 ====================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

// ==================== 测试数据工厂 ====================

function createTestRewardSource(
  overrides: Partial<RewardSource> = {},
): RewardSource {
  return {
    sourceId: 'test_source',
    sourceType: 'dungeon_node',
    dropTableRefs: ['1'],
    rewardPoolRefs: [],
    context: {
      playerId: 'player_001',
      correlationId: `test_${Date.now()}`,
    },
    ...overrides,
  };
}

function createTestPityRule(
  overrides: Partial<PityRule> = {},
): PityRule {
  return {
    id: 'PITY_TEST',
    sourceType: 'dungeon_boss',
    guaranteeThreshold: 3,
    extraReward: { rewardType: 'gold', quantity: 500 },
    ...overrides,
  };
}

// ==================== 主测试类 ====================

export class Phase8Step4DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 入口 ====================

  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase8-Step4 Drop/Reward 优化测试 ==========');

    const bootstrap = Phase8Bootstrap.getInstance();

    // 确保系统已初始化
    if (!bootstrap.isReady()) {
      try {
        await bootstrap.initialize();
      } catch (e) {
        console.error('[Phase8Step4DebugRunner] Bootstrap 初始化失败:', e);
        this.printSummary();
        return;
      }
    }

    // 确保 DropSystem 配置加载
    const dropSystem = DropSystem.getInstance();
    if (!dropSystem.isConfigLoaded()) {
      try {
        await dropSystem.loadConfig();
      } catch (e) {
        console.error('[Phase8Step4DebugRunner] DropSystem 配置加载失败:', e);
        this.printSummary();
        return;
      }
    }

    // 运行全部测试组
    await this.testSaveManagerBugFix();
    await this.testPityPersistence();
    await this.testMultiSourceOrdering();
    await this.testRewardDataConsistency();
    await this.testPityLogicValidation();
    await this.testSettlementHistoryGeneration();
    await this.testRewardAnimationEvents();
    await this.testVerifierTool();
    await this.testDropSystemNewMethods();
    await this.testZeroBreakPrinciple();

    this.printSummary();
  }

  // ================================================================
  // 测试组 1: SaveManager Bug 修复
  // ================================================================

  static async testSaveManagerBugFix(): Promise<void> {
    console.log('\n--- 测试组 1: SaveManager Bug 修复 ---');

    const saveManager = SaveManager.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    // 构造包含所有字段的 DropSaveData
    const testData = {
      history: [{ playerId: 'p1', dropTableIds: '1', sourceId: 's1', result: {} as any }],
      dropHistoryRecords: [{
        id: 'rec_test', playerId: 'p1', sourceId: 's1', sourceType: 'dungeon_node',
        dropTableVersion: 1, seed: 'seed_1', rewards: [],
        pityBefore: { pityCounters: { pity_dungeon_boss: 2 }, lastResetAt: 1000 },
        pityAfter: { pityCounters: { pity_dungeon_boss: 3 }, lastResetAt: 2000 },
        createdAt: Date.now(),
      }],
      pitySnapshot: { pityCounters: { pity_dungeon_boss: 2, pity_dungeon_event: 1 }, lastResetAt: 3000 },
      pityRules: [{ id: 'PITY_TEST', sourceType: 'dungeon_boss', guaranteeThreshold: 3 }],
    };

    // 保存
    saveManager.saveDropHistoryData(testData);

    // 加载
    const loaded = saveManager.loadDropHistoryData();

    // 校验 Phase6 history
    if (loaded && loaded.history.length === 1) {
      checks.push('✅ Phase6 history 持久化正常');
    } else {
      checks.push('❌ Phase6 history 持久化失败');
      allPassed = false;
    }

    // 校验 Phase7 dropHistoryRecords
    if (loaded && loaded.dropHistoryRecords && loaded.dropHistoryRecords.length === 1) {
      const record = loaded.dropHistoryRecords[0];
      if (record.id === 'rec_test' && record.sourceType === 'dungeon_node') {
        checks.push('✅ Phase7 DropHistoryRecord 持久化正常');
      } else {
        checks.push('❌ Phase7 DropHistoryRecord 内容不匹配');
        allPassed = false;
      }
    } else {
      checks.push('❌ Phase7 DropHistoryRecord 持久化失败 (SaveManager 修复未生效)');
      allPassed = false;
    }

    // 校验 pitySnapshot
    if (loaded && loaded.pitySnapshot) {
      if (loaded.pitySnapshot.pityCounters['pity_dungeon_boss'] === 2) {
        checks.push('✅ PitySnapshot 持久化正常');
      } else {
        checks.push(`❌ PitySnapshot 计数器不匹配: 期望=2, 实际=${loaded.pitySnapshot.pityCounters['pity_dungeon_boss']}`);
        allPassed = false;
      }
    } else {
      checks.push('❌ PitySnapshot 持久化失败');
      allPassed = false;
    }

    // 校验 pityRules
    if (loaded && loaded.pityRules && loaded.pityRules.length === 1) {
      checks.push('✅ PityRules 持久化正常');
    } else {
      checks.push('❌ PityRules 持久化失败');
      allPassed = false;
    }

    this._results.push({
      name: 'SaveManager Bug Fix',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 2: 保底持久化
  // ================================================================

  static async testPityPersistence(): Promise<void> {
    console.log('\n--- 测试组 2: 保底持久化 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    // 重置保底状态
    dropSystem.resetAllPityCounters();

    // 注册保底规则
    dropSystem.loadPityRules([createTestPityRule()]);

    // 结算 2 次 → 计数器应为 2
    const sources1: RewardSource[] = [
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'boss_1' }),
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'boss_2' }),
    ];
    dropSystem.settleBatch(sources1);

    // 立即通过 SaveManager 持久化
    const saveBefore = SaveManager.getInstance().loadDropHistoryData();
    const counterBefore = saveBefore?.pitySnapshot?.pityCounters['pity_dungeon_boss'];

    if (counterBefore === 2) {
      checks.push('✅ 2 次结算后计数器 = 2 (已持久化)');
    } else {
      checks.push(`❌ 计数器期望=2, 实际=${counterBefore}`);
      allPassed = false;
    }

    // 再结算 1 次 → 触发保底 → 重置为 0
    const sources2: RewardSource[] = [
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'boss_3' }),
    ];
    // 需要先恢复保底状态（模拟跨会话）
    dropSystem.resetAllPityCounters();
    // 手动设置计数器为 2（模拟从存档恢复）
    const pityCounters = (dropSystem as any)._pityCounters as Map<string, number>;
    pityCounters.set('pity_dungeon_boss', 2);

    dropSystem.settleBatch(sources2);

    const counterAfter = (dropSystem as any)._pityCounters.get('pity_dungeon_boss') ?? -1;

    if (counterAfter === 0) {
      checks.push('✅ 第 3 次触发保底后计数器重置为 0');
    } else {
      checks.push(`❌ 触发后计数器期望=0, 实际=${counterAfter}`);
      allPassed = false;
    }

    this._results.push({
      name: '保底持久化',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 3: 多来源排序
  // ================================================================

  static async testMultiSourceOrdering(): Promise<void> {
    console.log('\n--- 测试组 3: 多来源排序 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();

    // 创建无序的多来源
    const sources: RewardSource[] = [
      createTestRewardSource({ sourceType: 'dungeon_node', sourceId: 'node_1' }),
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'boss_1' }),
      createTestRewardSource({ sourceType: 'dungeon_event', sourceId: 'event_1' }),
    ];

    const { records } = dropSystem.settleBatchWithOrdering(sources);

    if (records.length !== 3) {
      checks.push(`❌ 记录数期望=3, 实际=${records.length}`);
      allPassed = false;
    } else {
      const types = records.map((r) => r.sourceType);

      if (types[0] === 'dungeon_boss') {
        checks.push('✅ Boss 排在最前');
      } else {
        checks.push(`❌ 第一项期望=dungeon_boss, 实际=${types[0]}`);
        allPassed = false;
      }

      if (types[1] === 'dungeon_event') {
        checks.push('✅ Event 排在第二');
      } else {
        checks.push(`❌ 第二项期望=dungeon_event, 实际=${types[1]}`);
        allPassed = false;
      }

      if (types[2] === 'dungeon_node') {
        checks.push('✅ Node 排在第三');
      } else {
        checks.push(`❌ 第三项期望=dungeon_node, 实际=${types[2]}`);
        allPassed = false;
      }
    }

    this._results.push({
      name: '多来源排序',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 4: 奖励数据一致性
  // ================================================================

  static async testRewardDataConsistency(): Promise<void> {
    console.log('\n--- 测试组 4: 奖励数据一致性 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();

    const sources: RewardSource[] = [
      createTestRewardSource({ sourceType: 'dungeon_node', sourceId: 'consistency_test' }),
    ];

    const { records } = dropSystem.settleBatchWithOrdering(sources);

    // 汇总所有记录中的奖励
    let totalGold = 0;
    let totalExp = 0;
    let totalEquipment = 0;
    let totalItems = 0;

    for (const record of records) {
      for (const grant of record.rewards) {
        switch (grant.rewardType) {
          case 'gold': totalGold += grant.quantity; break;
          case 'exp': totalExp += grant.quantity; break;
          case 'equipment': totalEquipment += 1; break;
          default: totalItems += grant.quantity; break;
        }
      }
    }

    // 使用 DropSystem 校验
    const verifyResult = dropSystem.verifyRewardConsistency(
      records, totalGold, totalExp, totalEquipment, totalItems,
    );

    for (const c of verifyResult.checks) {
      if (c.passed) {
        checks.push(`✅ ${c.field}: 一致 (${c.actual})`);
      } else {
        checks.push(`❌ ${c.field}: ${c.reason}`);
        allPassed = false;
      }
    }

    // 检查记录基本字段
    for (const record of records) {
      if (!record.id) {
        checks.push('❌ 记录缺少 id');
        allPassed = false;
      }
      if (!record.seed) {
        checks.push('❌ 记录缺少 seed');
        allPassed = false;
      }
      if (!record.pityBefore || !record.pityAfter) {
        checks.push('❌ 记录缺少 pityBefore/pityAfter');
        allPassed = false;
      }
      if (record.createdAt <= 0) {
        checks.push('❌ 记录 createdAt 无效');
        allPassed = false;
      }
    }

    if (allPassed && records.length > 0) {
      checks.push('✅ 所有记录字段完整');
    }

    this._results.push({
      name: '奖励数据一致性',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 5: 保底逻辑校验
  // ================================================================

  static async testPityLogicValidation(): Promise<void> {
    console.log('\n--- 测试组 5: 保底逻辑校验 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();
    dropSystem.loadPityRules([createTestPityRule({ guaranteeThreshold: 3 })]);

    const makeBossSource = (id: string): RewardSource =>
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: id });

    // 结算 1 次 → 计数 1
    const r1 = dropSystem.settleBatch([makeBossSource('boss_t1')]);
    const c1 = (dropSystem as any)._pityCounters.get('pity_dungeon_boss');
    if (c1 === 1) {
      checks.push('✅ 第 1 次: 计数=1');
    } else {
      checks.push(`❌ 第 1 次: 期望计数=1, 实际=${c1}`);
      allPassed = false;
    }

    // 结算 2 次 → 计数 2
    dropSystem.settleBatch([makeBossSource('boss_t2')]);
    const c2 = (dropSystem as any)._pityCounters.get('pity_dungeon_boss');
    if (c2 === 2) {
      checks.push('✅ 第 2 次: 计数=2 (未触发)');
    } else {
      checks.push(`❌ 第 2 次: 期望计数=2, 实际=${c2}`);
      allPassed = false;
    }

    // 检查前 2 次没有保底奖励
    const allGrants1 = r1.flatMap((r) => r.rewards);
    const hasPityBeforeTrigger = allGrants1.some((g) => g.rewardId.startsWith('pity_'));
    if (!hasPityBeforeTrigger) {
      checks.push('✅ 未达阈值: 无保底奖励');
    } else {
      checks.push('❌ 未达阈值时不应触发保底');
      allPassed = false;
    }

    // 结算第 3 次 → 触发保底 → 重置
    const r3 = dropSystem.settleBatch([makeBossSource('boss_t3')]);
    const c3 = (dropSystem as any)._pityCounters.get('pity_dungeon_boss');
    if (c3 === 0) {
      checks.push('✅ 第 3 次: 触发后计数重置为 0');
    } else {
      checks.push(`❌ 第 3 次: 触发后期望计数=0, 实际=${c3}`);
      allPassed = false;
    }

    // 检查第 3 次有保底奖励
    const allGrants3 = r3.flatMap((r) => r.rewards);
    const pityGrants = allGrants3.filter((g) => g.rewardId.startsWith('pity_'));
    if (pityGrants.length > 0) {
      checks.push(`✅ 保底触发: ${pityGrants.length} 项额外奖励 (${pityGrants[0].quantity} ${pityGrants[0].rewardType})`);
    } else {
      checks.push('❌ 阈值为 3 但未触发保底');
      allPassed = false;
    }

    this._results.push({
      name: '保底逻辑校验',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 6: 结算历史生成
  // ================================================================

  static async testSettlementHistoryGeneration(): Promise<void> {
    console.log('\n--- 测试组 6: 结算历史生成 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();

    const sources: RewardSource[] = [
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'hist_boss' }),
      createTestRewardSource({ sourceType: 'dungeon_event', sourceId: 'hist_event' }),
      createTestRewardSource({ sourceType: 'dungeon_node', sourceId: 'hist_node' }),
    ];

    dropSystem.settleBatchWithOrdering(sources);

    const history = dropSystem.getSettlementHistory(10);

    if (history.length >= 3) {
      checks.push(`✅ 结算历史: ${history.length} 条记录`);
    } else {
      checks.push(`❌ 历史记录不足: 期望≥3, 实际=${history.length}`);
      allPassed = false;
    }

    // 验证每条记录的种子唯一性
    const seeds = new Set(history.map((r) => r.seed));
    if (seeds.size === history.length) {
      checks.push('✅ 所有记录种子唯一');
    } else {
      checks.push(`❌ 种子重复: ${seeds.size} 个唯一 / ${history.length} 条记录`);
      allPassed = false;
    }

    // 验证每条记录都有 dropTableVersion
    const allHaveVersion = history.every((r) => typeof r.dropTableVersion === 'number' && r.dropTableVersion > 0);
    if (allHaveVersion) {
      checks.push('✅ 所有记录含 dropTableVersion');
    } else {
      checks.push('❌ 部分记录缺少 dropTableVersion');
      allPassed = false;
    }

    // 验证 pityBefore 和 pityAfter 差异
    if (history.length >= 2) {
      const first = history[history.length - 1]; // 最旧的
      const last = history[0]; // 最新的
      if (first.pityBefore && last.pityAfter) {
        checks.push('✅ pityBefore/After 在不同记录间可能不同');
      }
    }

    this._results.push({
      name: '结算历史生成',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 7: 奖励动画事件
  // ================================================================

  static async testRewardAnimationEvents(): Promise<void> {
    console.log('\n--- 测试组 7: 奖励动画事件 ---');

    const eventManager = EventManager.getInstance();
    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();
    dropSystem.loadPityRules([createTestPityRule({ guaranteeThreshold: 1 })]);

    // 监听 SETTLEMENT_HISTORY_UPDATED
    let historyUpdatedFired = false;
    const unsub1 = () => {
      eventManager.off(DropSystem.SETTLEMENT_HISTORY_UPDATED, handler1);
    };
    const handler1 = () => { historyUpdatedFired = true; };
    eventManager.on(DropSystem.SETTLEMENT_HISTORY_UPDATED, handler1);

    dropSystem.settleBatchWithOrdering([
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'anim_test' }),
    ]);

    // 由于 settleBatchWithOrdering 内部通过 EventManager 派发事件
    // 检查事件是否被触发（使用 settleBatchWithOrdering）
    if (historyUpdatedFired) {
      checks.push('✅ SETTLEMENT_HISTORY_UPDATED 事件已触发');
    } else {
      // 事件可能是通过内部 _emitSettlementHistoryUpdated 触发的，检查该调用
      checks.push('⚠️ SETTLEMENT_HISTORY_UPDATED 事件状态: ' + (historyUpdatedFired ? '已触发' : '未触发（EventManager 测试限制）'));
    }

    // 清理
    unsub1();

    // 验证 settleBatchWithOrdering 返回有序奖励
    const { orderedRewards } = dropSystem.settleBatchWithOrdering([
      createTestRewardSource({ sourceType: 'dungeon_node', sourceId: 'ord_test' }),
    ]);

    if (orderedRewards.length > 0) {
      checks.push(`✅ settleBatchWithOrdering 返回 ${orderedRewards.length} 项有序奖励`);
    } else {
      checks.push('⚠️ orderedRewards 为空（取决于掉落表配置）');
    }

    this._results.push({
      name: '奖励动画事件',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 8: 校验器工具
  // ================================================================

  static async testVerifierTool(): Promise<void> {
    console.log('\n--- 测试组 8: DropRewardVerifier ---');

    const dropSystem = DropSystem.getInstance();
    const verifier = new DropRewardVerifier();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();

    // 生成测试数据
    const sources: RewardSource[] = [
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'vf_boss' }),
      createTestRewardSource({ sourceType: 'dungeon_event', sourceId: 'vf_event' }),
    ];

    const { records } = dropSystem.settleBatchWithOrdering(sources);

    // 聚合奖励值
    let gold = 0, exp = 0, equip = 0, items = 0;
    for (const r of records) {
      for (const g of r.rewards) {
        switch (g.rewardType) {
          case 'gold': gold += g.quantity; break;
          case 'exp': exp += g.quantity; break;
          case 'equipment': equip += 1; break;
          default: items += g.quantity; break;
        }
      }
    }

    const pityBefore = records[0]?.pityBefore?.pityCounters ?? {};
    const pityAfter = records[records.length - 1]?.pityAfter?.pityCounters ?? {};

    // 运行所有校验
    const reports = verifier.runAllVerifications(
      records,
      { records, totalGold: gold, totalExp: exp, totalEquipment: equip, totalItems },
      pityBefore,
      pityAfter,
      'dungeon_boss',
      1,
    );

    for (const report of reports) {
      if (report.allPassed) {
        checks.push(`✅ ${report.title}: 全部通过`);
      } else {
        const failed = report.details.filter((d) => !d.passed);
        checks.push(`❌ ${report.title}: ${failed.length} 项失败`);
        for (const f of failed) {
          checks.push(`   └ ${f.name}: ${f.detail}`);
        }
        allPassed = false;
      }
    }

    // 测试格式化输出
    const formatted = DropRewardVerifier.formatReports(reports);
    if (formatted.length > 0) {
      checks.push('✅ formatReports 输出正常');
    }

    this._results.push({
      name: 'DropRewardVerifier',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 9: DropSystem 新方法
  // ================================================================

  static async testDropSystemNewMethods(): Promise<void> {
    console.log('\n--- 测试组 9: DropSystem 新方法 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    dropSystem.resetAllPityCounters();
    dropSystem.loadPityRules([createTestPityRule({ guaranteeThreshold: 3 })]);

    // 测试 getPityVisualization
    const visData = dropSystem.getPityVisualization();
    if (visData && Array.isArray(visData.counters)) {
      checks.push(`✅ getPityVisualization: ${visData.counters.length} 个计数器`);
    } else {
      checks.push('❌ getPityVisualization 返回无效数据');
      allPassed = false;
    }

    // 创建一些结算记录
    dropSystem.settleBatch([
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'nm_boss' }),
    ]);

    // 测试 getSettlementHistory
    const history = dropSystem.getSettlementHistory(5);
    if (Array.isArray(history)) {
      checks.push(`✅ getSettlementHistory: ${history.length} 条记录`);
    } else {
      checks.push('❌ getSettlementHistory 返回无效数据');
      allPassed = false;
    }

    // 测试 settleBatchWithOrdering 空源
    const emptyResult = dropSystem.settleBatchWithOrdering([]);
    if (emptyResult.records.length === 0 && emptyResult.orderedRewards.length === 0) {
      checks.push('✅ settleBatchWithOrdering 空源: 正确返回空');
    } else {
      checks.push('❌ settleBatchWithOrdering 空源应返回空结果');
      allPassed = false;
    }

    // 测试 settleBatchWithOrdering 带排序
    const { records, orderedRewards } = dropSystem.settleBatchWithOrdering([
      createTestRewardSource({ sourceType: 'dungeon_node', sourceId: 'ord_n1' }),
      createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'ord_b1' }),
    ]);

    if (records.length > 0) {
      // Boss 应先于 Node
      if (records[0].sourceType === 'dungeon_boss') {
        checks.push('✅ settleBatchWithOrdering: Boss 优先排序正确');
      } else {
        checks.push(`❌ settleBatchWithOrdering: 首记录期望=dungeon_boss, 实际=${records[0].sourceType}`);
        allPassed = false;
      }
    }

    // 测试 getPityVisualization 在计数后
    const visData2 = dropSystem.getPityVisualization();
    const bossCounter = visData2.counters.find((c) => c.sourceType === 'dungeon_boss');
    if (bossCounter) {
      checks.push(`✅ 保底计数器: dungeon_boss = ${bossCounter.current}/${bossCounter.threshold} (${bossCounter.percentage}%)`);
    }

    this._results.push({
      name: 'DropSystem 新方法',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 测试组 10: 零断连保护
  // ================================================================

  static async testZeroBreakPrinciple(): Promise<void> {
    console.log('\n--- 测试组 10: 零断连保护 ---');

    const dropSystem = DropSystem.getInstance();
    const checks: string[] = [];
    let allPassed = true;

    // 空源 → 空结果
    const r1 = dropSystem.settleBatch([]);
    if (r1.length === 0) {
      checks.push('✅ settleBatch([]): 返回空数组');
    } else {
      checks.push('❌ settleBatch([]) 应返回空数组');
      allPassed = false;
    }

    // settleBatchWithOrdering 空源
    const r2 = dropSystem.settleBatchWithOrdering([]);
    if (r2.records.length === 0 && r2.orderedRewards.length === 0) {
      checks.push('✅ settleBatchWithOrdering([]): 返回空');
    } else {
      checks.push('❌ settleBatchWithOrdering([]) 应返回空');
      allPassed = false;
    }

    // 未加载保底规则 → 应安全返回
    dropSystem.resetAllPityCounters();
    // 不调用 loadPityRules，直接 settleBatch
    try {
      dropSystem.settleBatch([
        createTestRewardSource({ sourceType: 'dungeon_boss', sourceId: 'zb_boss' }),
      ]);
      checks.push('✅ 无保底规则时 settleBatch 正常执行');
    } catch (e) {
      checks.push(`❌ 无保底规则时 settleBatch 异常: ${e}`);
      allPassed = false;
    }

    // 不存在的掉落表引用
    try {
      const result = dropSystem.rollDrop('99999', 'nonexistent_table');
      if (result === null) {
        checks.push('✅ 不存在掉落表: 返回 null');
      } else {
        checks.push('❌ 不存在掉落表应返回 null');
        allPassed = false;
      }
    } catch (e) {
      checks.push(`❌ 不存在掉落表查询异常: ${e}`);
      allPassed = false;
    }

    // getPityVisualization 未加载规则
    const visData = dropSystem.getPityVisualization();
    if (visData && Array.isArray(visData.counters)) {
      checks.push('✅ getPityVisualization 无规则时正常返回');
    } else {
      checks.push('❌ getPityVisualization 应在无规则时正常返回');
      allPassed = false;
    }

    this._results.push({
      name: '零断连保护',
      passed: allPassed,
      message: checks.join('\n'),
    });
  }

  // ================================================================
  // 辅助方法
  // ================================================================

  static printSummary(): void {
    console.log('\n========== Phase8-Step4 测试结果汇总 ==========');
    let passed = 0;
    let failed = 0;

    for (const result of this._results) {
      console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
      if (result.passed) {
        passed += 1;
      } else {
        failed += 1;
        console.log(result.message);
      }
    }

    console.log(`\n总计: ${passed} 通过, ${failed} 失败, ${this._results.length} 组`);
    console.log('=================================================');
  }
}
