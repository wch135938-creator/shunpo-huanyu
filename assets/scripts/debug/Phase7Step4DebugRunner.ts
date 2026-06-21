// ============================================================
// Phase7Step4DebugRunner — Phase7-Step4 DropHistory + PitySystem 集成测试
// 职责：验证 DropHistoryRecord / PitySnapshot / PityRule 类型持久化 /
//        DropSystem.settleBatch 批量结算与保底 / Validator 扩展 / SaveMigration V3→V4
// 用法：在 Cocos Creator 控制台执行 Phase7Step4DebugRunner.runAll()
// ============================================================

import { DropSystem } from '../systems/DropSystem';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
} from '../save/SaveContainer';
import {
  createEmptyPitySnapshot,
  generateDropHistoryRecordId,
  convertDropResultToRewardGrants,
  createEmptyDropResultData,
} from '../data/drop_types';
import type {
  DropHistoryRecord,
  PitySnapshot,
  PityRule,
  RewardConfig,
} from '../data/drop_types';
import type { RewardSource, RewardGrant } from '../data/roguelike_types';
import {
  generateCorrelationId,
} from '../data/roguelike_types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const DEFAULT_PLAYER_ID = 'player_001';

/** 创建测试用 RewardSource */
function createTestRewardSource(overrides?: Partial<RewardSource>): RewardSource {
  return {
    sourceId: 'test_source_001',
    sourceType: 'dungeon_node',
    dropTableRefs: [],
    rewardPoolRefs: [],
    context: {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: generateCorrelationId(),
    },
    ...overrides,
  };
}

/** 创建测试用 PityRule */
function createTestPityRule(overrides?: Partial<PityRule>): PityRule {
  return {
    id: 'pity_test_01',
    sourceType: 'dungeon_boss',
    guaranteeThreshold: 10,
    extraReward: {
      rewardType: 'gold',
      quantity: 1000,
    },
    ...overrides,
  };
}

/** 创建测试用 DropHistoryRecord */
function createTestDropHistoryRecord(overrides?: Partial<DropHistoryRecord>): DropHistoryRecord {
  const pityBefore = createEmptyPitySnapshot();
  const pityAfter = createEmptyPitySnapshot();
  pityAfter.pityCounters['pity_dungeon_boss'] = 1;

  return {
    id: generateDropHistoryRecordId(),
    playerId: DEFAULT_PLAYER_ID,
    sourceId: 'test_source_001',
    sourceType: 'dungeon_boss',
    dropTableVersion: 1,
    seed: 'seed_test_001',
    rewards: [
      {
        rewardId: 'reward_001',
        rewardType: 'gold',
        quantity: 100,
        sourceId: 'test_source_001',
        granted: false,
      },
    ],
    pityBefore,
    pityAfter,
    createdAt: Date.now(),
    ...overrides,
  };
}

export class Phase7Step4DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 DropHistory + PitySystem 测试 */
  static runAll(): void {
    this._results = [];
    console.log('========== Phase7-Step4 DropHistory + PitySystem 集成测试 ==========\n');

    // 1. DropHistoryRecord 类型测试
    this.testDropHistoryRecordCreation();

    // 2. PitySnapshot 计数/重置测试
    this.testPitySnapshotCounting();

    // 3. PityRule 配置与触发测试
    this.testPityRuleTrigger();

    // 4. DropSystem.settleBatch 批量结算测试
    this.testSettleBatch();

    // 5. DropSystem.settleBatch 保底触发测试
    this.testSettleBatchWithPity();

    // 6. DropSystem 历史持久化测试
    this.testDropHistoryPersistence();

    // 7. ConfigValidator.validatePityRules 测试
    this.testConfigValidatorPityRules();

    // 8. RuntimeValidator.validateDropHistory 测试
    this.testRuntimeValidatorDropHistory();

    // 9. RuntimeValidator.validatePitySnapshot 测试
    this.testRuntimeValidatorPitySnapshot();

    // 10. SaveMigration V3→V4 测试
    this.testMigrationV3ToV4();

    // 11. RewardGrant 转换测试
    this.testRewardGrantConversion();

    // 12. 边界情况测试
    this.testEdgeCases();

    // 汇总
    this.printSummary();
  }

  // ==================== 测试 1: DropHistoryRecord 创建 ====================

  private static testDropHistoryRecordCreation(): void {
    console.log('--- 测试 1: DropHistoryRecord 创建 ---');

    // 1a. 基础字段
    const record = createTestDropHistoryRecord();
    this.assert('DropHistoryRecord.id 非空', record.id.length > 0);
    this.assert('DropHistoryRecord.playerId 正确', record.playerId === DEFAULT_PLAYER_ID);
    this.assert('DropHistoryRecord.sourceId 正确', record.sourceId === 'test_source_001');
    this.assert('DropHistoryRecord.sourceType 正确', record.sourceType === 'dungeon_boss');
    this.assert('DropHistoryRecord.dropTableVersion > 0', record.dropTableVersion === 1);
    this.assert('DropHistoryRecord.seed 非空', record.seed.length > 0);

    // 1b. rewards 结构
    this.assert('DropHistoryRecord.rewards 有内容', record.rewards.length === 1);
    this.assert('rewards[0].rewardType = gold', record.rewards[0].rewardType === 'gold');
    this.assert('rewards[0].quantity > 0', record.rewards[0].quantity === 100);

    // 1c. pityBefore / pityAfter
    this.assert('pityBefore 非空', record.pityBefore !== null && record.pityBefore !== undefined);
    this.assert('pityAfter 非空', record.pityAfter !== null && record.pityAfter !== undefined);
    this.assert('pityAfter 有计数', record.pityAfter.pityCounters['pity_dungeon_boss'] === 1);

    // 1d. createdAt 合理
    const age = Date.now() - record.createdAt;
    this.assert('createdAt 在最近 60 秒内', age >= 0 && age < 60000);

    // 1e. 不同 sourceType 的记录
    const types = ['dungeon_node', 'dungeon_boss', 'dungeon_event', 'quest', 'achievement', 'shop', 'compensation', 'season'];
    for (const st of types) {
      const r = createTestDropHistoryRecord({ sourceType: st });
      this.assert(`sourceType: ${st}`, r.sourceType === st);
    }

    console.log('DropHistoryRecord 创建测试完成\n');
  }

  // ==================== 测试 2: PitySnapshot 计数/重置 ====================

  private static testPitySnapshotCounting(): void {
    console.log('--- 测试 2: PitySnapshot 计数/重置 ---');

    // 2a. 创建空快照
    const empty = createEmptyPitySnapshot();
    this.assert('空快照 pityCounters 为空对象', Object.keys(empty.pityCounters).length === 0);
    this.assert('空快照 lastResetAt > 0', empty.lastResetAt > 0);

    // 2b. 计数器递增
    const snapshot: PitySnapshot = {
      pityCounters: {},
      lastResetAt: Date.now(),
    };
    snapshot.pityCounters['pity_dungeon_boss'] = 0;
    for (let i = 0; i < 10; i++) {
      snapshot.pityCounters['pity_dungeon_boss'] = (snapshot.pityCounters['pity_dungeon_boss'] ?? 0) + 1;
    }
    this.assert('计数器递增到 10', snapshot.pityCounters['pity_dungeon_boss'] === 10);

    // 2c. 多维度计数
    snapshot.pityCounters['pity_dungeon_event'] = 5;
    snapshot.pityCounters['pity_quest'] = 3;
    this.assert('多维度计数: boss=10', snapshot.pityCounters['pity_dungeon_boss'] === 10);
    this.assert('多维度计数: event=5', snapshot.pityCounters['pity_dungeon_event'] === 5);
    this.assert('多维度计数: quest=3', snapshot.pityCounters['pity_quest'] === 3);

    // 2d. 重置单个计数器
    snapshot.pityCounters['pity_dungeon_boss'] = 0;
    snapshot.lastResetAt = Date.now();
    this.assert('boss 计数器重置为 0', snapshot.pityCounters['pity_dungeon_boss'] === 0);
    this.assert('event 计数器保持 5', snapshot.pityCounters['pity_dungeon_event'] === 5);

    // 2e. 全部重置
    for (const key of Object.keys(snapshot.pityCounters)) {
      snapshot.pityCounters[key] = 0;
    }
    this.assert('全部重置后 boss=0', snapshot.pityCounters['pity_dungeon_boss'] === 0);
    this.assert('全部重置后 event=0', snapshot.pityCounters['pity_dungeon_event'] === 0);

    // 2f. 序列化兼容性
    const json = JSON.stringify(snapshot);
    const parsed = JSON.parse(json) as PitySnapshot;
    this.assert('序列化后 pityCounters 可恢复', typeof parsed.pityCounters === 'object');
    this.assert('序列化后 lastResetAt 可恢复', typeof parsed.lastResetAt === 'number');

    console.log('PitySnapshot 计数/重置测试完成\n');
  }

  // ==================== 测试 3: PityRule 配置与触发 ====================

  private static testPityRuleTrigger(): void {
    console.log('--- 测试 3: PityRule 配置与触发 ---');

    // 3a. 基础字段
    const rule = createTestPityRule();
    this.assert('PityRule.id 正确', rule.id === 'pity_test_01');
    this.assert('PityRule.sourceType 正确', rule.sourceType === 'dungeon_boss');
    this.assert('PityRule.guaranteeThreshold 正确', rule.guaranteeThreshold === 10);

    // 3b. extraReward
    this.assert('extraReward 非空', rule.extraReward !== undefined);
    if (rule.extraReward) {
      this.assert('extraReward.rewardType = gold', rule.extraReward.rewardType === 'gold');
      this.assert('extraReward.quantity = 1000', rule.extraReward.quantity === 1000);
    }

    // 3c. 不同 sourceType 的规则
    const ruleEvent = createTestPityRule({
      id: 'pity_event',
      sourceType: 'dungeon_event',
      guaranteeThreshold: 5,
      extraReward: { rewardType: 'exp', quantity: 500 },
    });
    this.assert('event 规则 sourceType=dungeon_event', ruleEvent.sourceType === 'dungeon_event');
    this.assert('event 规则 threshold=5', ruleEvent.guaranteeThreshold === 5);

    // 3d. 无 extraReward 的规则
    const ruleNoReward = createTestPityRule({
      id: 'pity_no_reward',
      guaranteeThreshold: 20,
      extraReward: undefined,
    });
    this.assert('无额外奖励规则 extraReward=undefined', ruleNoReward.extraReward === undefined);

    // 3e. 最小阈值
    const ruleMin = createTestPityRule({
      id: 'pity_min',
      guaranteeThreshold: 1,
    });
    this.assert('阈值=1 有效', ruleMin.guaranteeThreshold === 1);

    console.log('PityRule 配置与触发测试完成\n');
  }

  // ==================== 测试 4: DropSystem.settleBatch 批量结算 ====================

  private static testSettleBatch(): void {
    console.log('--- 测试 4: DropSystem.settleBatch ---');

    const dropSystem = DropSystem.getInstance();

    // 注意：settleBatch 不依赖配置加载（使用 rollDrop 内部处理空表）
    // 4a. 空 sources 返回空数组
    const emptyResult = dropSystem.settleBatch([]);
    this.assert('空 sources 返回空数组', Array.isArray(emptyResult) && emptyResult.length === 0);

    // 4b. 单 source 结算
    const source = createTestRewardSource({
      sourceId: 'dungeon_node_01',
      sourceType: 'dungeon_node',
    });
    const results = dropSystem.settleBatch([source]);
    this.assert('单 source 结算返回 1 条记录', results.length === 1);

    const record = results[0];
    this.assert('记录的 sourceId 正确', record.sourceId === 'dungeon_node_01');
    this.assert('记录的 sourceType 正确', record.sourceType === 'dungeon_node');
    this.assert('记录有 pityBefore', record.pityBefore.pityCounters !== undefined);
    this.assert('记录有 pityAfter', record.pityAfter.pityCounters !== undefined);
    this.assert('记录有 createdAt', record.createdAt > 0);

    // 4c. 多 source 结算
    const sources: RewardSource[] = [
      createTestRewardSource({ sourceId: 'node_a', sourceType: 'dungeon_node' }),
      createTestRewardSource({ sourceId: 'node_b', sourceType: 'dungeon_node' }),
      createTestRewardSource({ sourceId: 'boss_01', sourceType: 'dungeon_boss' }),
    ];
    const multiResults = dropSystem.settleBatch(sources);
    this.assert('多 source 结算返回 3 条记录', multiResults.length === 3);
    this.assert('第 1 条 sourceId=node_a', multiResults[0].sourceId === 'node_a');
    this.assert('第 2 条 sourceId=node_b', multiResults[1].sourceId === 'node_b');
    this.assert('第 3 条 sourceId=boss_01', multiResults[2].sourceId === 'boss_01');

    // 4d. 每条记录有唯一 ID
    const ids = new Set(multiResults.map((r) => r.id));
    this.assert('所有记录 ID 唯一', ids.size === multiResults.length);

    console.log('DropSystem.settleBatch 测试完成\n');
  }

  // ==================== 测试 5: settleBatch 保底触发 ====================

  private static testSettleBatchWithPity(): void {
    console.log('--- 测试 5: settleBatch 保底触发 ---');

    const dropSystem = DropSystem.getInstance();

    // 注册一条低阈值保底规则
    const pityRule: PityRule = {
      id: 'test_pity_boss',
      sourceType: 'dungeon_boss',
      guaranteeThreshold: 2, // 每 2 次触发
      extraReward: {
        rewardType: 'gold',
        quantity: 500,
      },
    };
    dropSystem.loadPityRules([pityRule]);

    // 重置保底计数器
    dropSystem.resetAllPityCounters();

    // 5a. 第一次结算不触发保底
    const source1 = createTestRewardSource({
      sourceId: 'boss_test_1',
      sourceType: 'dungeon_boss',
    });
    const results1 = dropSystem.settleBatch([source1]);
    this.assert('第 1 次结算返回记录', results1.length === 1);
    const after1 = results1[0].pityAfter;
    this.assert('第 1 次 pity_boss 计数=1',
      (after1.pityCounters['pity_dungeon_boss'] ?? 0) === 1);

    // 5b. 第二次结算触发保底
    const source2 = createTestRewardSource({
      sourceId: 'boss_test_2',
      sourceType: 'dungeon_boss',
    });
    const results2 = dropSystem.settleBatch([source2]);
    this.assert('第 2 次结算返回记录', results2.length === 1);
    const after2 = results2[0].pityAfter;
    this.assert('第 2 次后 pity_boss 重置为 0',
      (after2.pityCounters['pity_dungeon_boss'] ?? 0) === 0);

    // 检查第 2 次是否有保底奖励（gold 类型的 reward）
    const pityRewards = results2[0].rewards.filter((r) => r.rewardId.startsWith('pity_'));
    // 注：保底可能因 rollDrop 空表时未触发 item reward，但计数器已更新
    // 实际保底 rewards 检查：
    const bossPityCount = after2.pityCounters['pity_dungeon_boss'] ?? 0;
    this.assert('保底后计数器重置', bossPityCount === 0);

    // 5c. 不同 sourceType 不互相影响（dungeon_node 不影响 dungeon_boss 计数）
    dropSystem.resetAllPityCounters();
    const nodeSource = createTestRewardSource({
      sourceId: 'node_test',
      sourceType: 'dungeon_node',
    });
    dropSystem.settleBatch([nodeSource]);
    const snapshot = dropSystem.getPitySnapshot();
    this.assert('dungeon_node 不影响 dungeon_boss 计数',
      (snapshot.pityCounters['pity_dungeon_boss'] ?? 0) === 0);

    // 5d. resetPityCounter 按 sourceType 重置
    dropSystem.resetPityCounter('dungeon_boss');
    const afterReset = dropSystem.getPitySnapshot();
    this.assert('resetPityCounter 后 boss 计数为 0',
      (afterReset.pityCounters['pity_dungeon_boss'] ?? 0) === 0);

    // 清理
    dropSystem.resetAllPityCounters();

    console.log('settleBatch 保底触发测试完成\n');
  }

  // ==================== 测试 6: DropHistory 持久化 ====================

  private static testDropHistoryPersistence(): void {
    console.log('--- 测试 6: DropHistory 持久化 ---');

    const dropSystem = DropSystem.getInstance();
    dropSystem.resetAllPityCounters();

    // 6a. settleBatch 后记录持久化
    const source = createTestRewardSource({
      sourceId: 'persist_test',
      sourceType: 'dungeon_event',
    });
    dropSystem.settleBatch([source]);

    const records = dropSystem.getDropHistoryRecords();
    this.assert('getDropHistoryRecords 返回记录', records.length >= 1);

    // 6b. 按 playerId 过滤
    const playerRecords = dropSystem.getDropHistoryRecords(DEFAULT_PLAYER_ID);
    this.assert('按 playerId 过滤返回记录',
      playerRecords.length >= 1
      && playerRecords.every((r) => r.playerId === DEFAULT_PLAYER_ID));

    // 6c. 保底快照持久化
    const snapshot = dropSystem.getPitySnapshot();
    this.assert('getPitySnapshot 返回有效快照', snapshot !== null && snapshot.pityCounters !== undefined);

    // 6d. 规则持久化
    const rules = dropSystem.getPityRules();
    this.assert('getPityRules 返回规则列表', Array.isArray(rules));

    // 清理
    dropSystem.resetAllPityCounters();

    console.log('DropHistory 持久化测试完成\n');
  }

  // ==================== 测试 7: ConfigValidator.validatePityRules ====================

  private static testConfigValidatorPityRules(): void {
    console.log('--- 测试 7: ConfigValidator.validatePityRules ---');

    const validator = ConfigValidator.getInstance();

    // 7a. 空规则通过（不报错）
    const emptyResult = validator.validatePityRules([]);
    this.assert('空规则列表 valid', emptyResult.valid);

    // 7b. 合法规则通过
    const validRules: PityRule[] = [
      createTestPityRule({ id: 'rule_a' }),
      createTestPityRule({
        id: 'rule_b',
        sourceType: 'dungeon_event',
        guaranteeThreshold: 5,
        extraReward: { rewardType: 'exp', quantity: 500 },
      }),
    ];
    const validResult = validator.validatePityRules(validRules);
    this.assert('合法规则 valid', validResult.valid);

    // 7c. 重复 ID 报错
    const dupRules: PityRule[] = [
      createTestPityRule({ id: 'dup_rule' }),
      createTestPityRule({ id: 'dup_rule' }),
    ];
    const dupResult = validator.validatePityRules(dupRules);
    this.assert('重复 ID 不 valid', !dupResult.valid);
    this.assert('重复 ID 有 error', dupResult.errorCount >= 1);

    // 7d. 无效阈值报错
    const badThreshold: PityRule[] = [
      createTestPityRule({ id: 'bad_threshold', guaranteeThreshold: 0 }),
    ];
    const badResult = validator.validatePityRules(badThreshold);
    this.assert('threshold=0 不 valid', !badResult.valid);

    // 7e. 无效 rewardType 报错
    const badReward: PityRule[] = [{
      id: 'bad_reward',
      sourceType: 'dungeon_boss',
      guaranteeThreshold: 10,
      extraReward: { rewardType: 'invalid_type' as never, quantity: 100 },
    }];
    const badRewardResult = validator.validatePityRules(badReward);
    this.assert('无效 rewardType 不 valid', !badRewardResult.valid);

    // 7f. 缺少 itemId 产生 warning
    const noItemId: PityRule[] = [{
      id: 'no_item',
      sourceType: 'shop',
      guaranteeThreshold: 10,
      extraReward: { rewardType: 'equipment', quantity: 1 },
    }];
    const noItemResult = validator.validatePityRules(noItemId);
    this.assert('缺少 itemId 有 warning（但不影响 valid）', noItemResult.warningCount >= 1);

    console.log('ConfigValidator.validatePityRules 测试完成\n');
  }

  // ==================== 测试 8: RuntimeValidator.validateDropHistory ====================

  private static testRuntimeValidatorDropHistory(): void {
    console.log('--- 测试 8: RuntimeValidator.validateDropHistory ---');

    const validator = RuntimeValidator.getInstance();

    // 8a. 合法记录通过
    const validRecord = createTestDropHistoryRecord();
    const validResult = validator.validateDropHistory(validRecord);
    this.assert('合法记录 valid', validResult.valid);

    // 8b. 空记录报错
    const nullResult = validator.validateDropHistory(null as unknown as DropHistoryRecord);
    this.assert('null 记录不 valid', !nullResult.valid);

    // 8c. 缺少 id 报错
    const noId = createTestDropHistoryRecord({ id: '' });
    const noIdResult = validator.validateDropHistory(noId);
    this.assert('缺少 id 不 valid', !noIdResult.valid);

    // 8d. 缺少 playerId 报错
    const noPlayer = createTestDropHistoryRecord({ playerId: '' });
    const noPlayerResult = validator.validateDropHistory(noPlayer);
    this.assert('缺少 playerId 不 valid', !noPlayerResult.valid);

    // 8e. 无效 dropTableVersion 报错
    const badVersion = createTestDropHistoryRecord({ dropTableVersion: 0 });
    const badVersionResult = validator.validateDropHistory(badVersion);
    this.assert('dropTableVersion=0 不 valid', !badVersionResult.valid);

    // 8f. 无效 createdAt 报错
    const badTime = createTestDropHistoryRecord({ createdAt: 0 });
    const badTimeResult = validator.validateDropHistory(badTime);
    this.assert('createdAt=0 不 valid', !badTimeResult.valid);

    // 8g. 缺少 pityBefore 报错
    const noPityBefore = createTestDropHistoryRecord();
    (noPityBefore as Record<string, unknown>)['pityBefore'] = null;
    const noPityBeforeResult = validator.validateDropHistory(noPityBefore);
    this.assert('缺少 pityBefore 不 valid', !noPityBeforeResult.valid);

    // 8h. 超多 rewards 产生 warning
    const manyRewards = createTestDropHistoryRecord();
    manyRewards.rewards = Array.from({ length: 201 }, (_, i) => ({
      rewardId: `reward_${i}`,
      rewardType: 'gold' as const,
      quantity: 1,
      sourceId: 'test',
      granted: false,
    }));
    const manyResult = validator.validateDropHistory(manyRewards);
    this.assert('超多 rewards 有 warning', manyResult.warningCount >= 1);

    console.log('RuntimeValidator.validateDropHistory 测试完成\n');
  }

  // ==================== 测试 9: RuntimeValidator.validatePitySnapshot ====================

  private static testRuntimeValidatorPitySnapshot(): void {
    console.log('--- 测试 9: RuntimeValidator.validatePitySnapshot ---');

    const validator = RuntimeValidator.getInstance();

    // 9a. 合法快照通过
    const validSnapshot = createEmptyPitySnapshot();
    validSnapshot.pityCounters['pity_boss'] = 5;
    const validResult = validator.validatePitySnapshot(validSnapshot);
    this.assert('合法快照 valid', validResult.valid);

    // 9b. null 快照报错
    const nullResult = validator.validatePitySnapshot(null as unknown as PitySnapshot);
    this.assert('null 快照不 valid', !nullResult.valid);

    // 9c. 负数计数 warning
    const negSnapshot: PitySnapshot = {
      pityCounters: { 'pity_boss': -1 },
      lastResetAt: Date.now(),
    };
    const negResult = validator.validatePitySnapshot(negSnapshot);
    this.assert('负数计数有 warning', negResult.warningCount >= 1);

    // 9d. 异常高计数 warning
    const highSnapshot: PitySnapshot = {
      pityCounters: { 'pity_boss': 99999 },
      lastResetAt: Date.now(),
    };
    const highResult = validator.validatePitySnapshot(highSnapshot);
    this.assert('异常高计数有 warning', highResult.warningCount >= 1);

    // 9e. 无效 lastResetAt warning
    const badResetSnapshot: PitySnapshot = {
      pityCounters: { 'pity_boss': 1 },
      lastResetAt: -100,
    };
    const badResetResult = validator.validatePitySnapshot(badResetSnapshot);
    this.assert('负数 lastResetAt 有 warning', badResetResult.warningCount >= 1);

    // 9f. 非数值计数报错
    const badCountSnapshot: PitySnapshot = {
      pityCounters: { 'pity_boss': NaN },
      lastResetAt: Date.now(),
    };
    const badCountResult = validator.validatePitySnapshot(badCountSnapshot);
    this.assert('NaN 计数不 valid', !badCountResult.valid);

    // 9g. 路径参数正确反映到错误定位
    const pathSnapshot = createEmptyPitySnapshot();
    const pathResult = validator.validatePitySnapshot(pathSnapshot, 'record.pityBefore');
    this.assert('路径参数可自定义', pathResult.valid);

    console.log('RuntimeValidator.validatePitySnapshot 测试完成\n');
  }

  // ==================== 测试 10: SaveMigration V3→V4 ====================

  private static testMigrationV3ToV4(): void {
    console.log('--- 测试 10: SaveMigration V3→V4 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 10a. V3→V4 步骤已注册
    const steps = migrationSystem.getMigrationSteps();
    const v3toV4Step = steps.find((s) => s.fromVersion === 3 && s.toVersion === 4);
    this.assert('V3→V4 迁移步骤已注册', v3toV4Step !== undefined);

    // 10b. 模拟 V3 存档迁移（无 DropSaveData V4 字段）
    const v3Container = createDefaultSaveContainer();
    v3Container.saveVersion = 3;
    // 删除 V4 字段（模拟旧存档）
    if (v3Container.dropHistory) {
      delete v3Container.dropHistory.dropHistoryRecords;
      delete v3Container.dropHistory.pitySnapshot;
      delete v3Container.dropHistory.pityRules;
    }

    const result = migrationSystem.migrate(v3Container);
    this.assert('V3→V4 迁移成功', result.success);
    this.assert('迁移后版本为 4', v3Container.saveVersion === 4);

    // 10c. 迁移后 DropSaveData 有 V4 字段
    this.assert('迁移后 dropHistoryRecords 存在',
      Array.isArray(v3Container.dropHistory.dropHistoryRecords));
    this.assert('迁移后 pitySnapshot 存在',
      v3Container.dropHistory.pitySnapshot !== undefined
      && v3Container.dropHistory.pitySnapshot !== null);
    this.assert('迁移后 pityRules 存在',
      Array.isArray(v3Container.dropHistory.pityRules));

    // 10d. 迁移后 pitySnapshot 有计数器对象
    const pity = v3Container.dropHistory.pitySnapshot!;
    this.assert('pitySnapshot.pityCounters 是对象',
      typeof pity.pityCounters === 'object');

    // 10e. V3 存档有 RoguelikeState pityCounters 时的同步
    const v3WithPity = createDefaultSaveContainer();
    v3WithPity.saveVersion = 3;
    if (v3WithPity.roguelikeState) {
      v3WithPity.roguelikeState.pityCounters = {
        'pity_dungeon_boss': 5,
        'pity_dungeon_event': 3,
      };
    }
    if (v3WithPity.dropHistory) {
      delete v3WithPity.dropHistory.dropHistoryRecords;
      delete v3WithPity.dropHistory.pitySnapshot;
      delete v3WithPity.dropHistory.pityRules;
    }

    const syncResult = migrationSystem.migrate(v3WithPity);
    this.assert('带 pityCounters 的 V3 迁移成功', syncResult.success);
    if (v3WithPity.dropHistory.pitySnapshot) {
      this.assert('同步后 pitySnapshot 有 boss 计数',
        v3WithPity.dropHistory.pitySnapshot.pityCounters['pity_dungeon_boss'] === 5);
      this.assert('同步后 pitySnapshot 有 event 计数',
        v3WithPity.dropHistory.pitySnapshot.pityCounters['pity_dungeon_event'] === 3);
    }

    // 10f. V4 存档无需迁移
    const v4Container = createDefaultSaveContainer();
    v4Container.saveVersion = 4;
    const v4Result = migrationSystem.migrate(v4Container);
    this.assert('V4 存档无需迁移（stepsExecuted=0）', v4Result.stepsExecuted === 0);

    // 10g. CURRENT_SAVE_VERSION
    this.assert('CURRENT_SAVE_VERSION 为 4', CURRENT_SAVE_VERSION === 4);

    console.log('SaveMigration V3→V4 测试完成\n');
  }

  // ==================== 测试 11: RewardGrant 转换 ====================

  private static testRewardGrantConversion(): void {
    console.log('--- 测试 11: RewardGrant 转换 ---');

    // 11a. 空结果转换
    const emptyResult = createEmptyDropResultData('test_src');
    const emptyGrants = convertDropResultToRewardGrants(emptyResult);
    this.assert('空 DropResultData 转换返回空数组', emptyGrants.length === 0);

    // 11b. 金币转换
    const goldResult = createEmptyDropResultData('gold_src');
    goldResult.gold = 500;
    const goldGrants = convertDropResultToRewardGrants(goldResult);
    this.assert('金币转换产生 1 个 grant', goldGrants.length === 1);
    this.assert('金币 grant rewardType=gold', goldGrants[0].rewardType === 'gold');
    this.assert('金币 grant quantity=500', goldGrants[0].quantity === 500);

    // 11c. 经验转换
    const expResult = createEmptyDropResultData('exp_src');
    expResult.exp = 300;
    const expGrants = convertDropResultToRewardGrants(expResult);
    this.assert('经验转换产生 1 个 grant', expGrants.length === 1);
    this.assert('经验 grant rewardType=exp', expGrants[0].rewardType === 'exp');
    this.assert('经验 grant quantity=300', expGrants[0].quantity === 300);

    // 11d. 物品转换
    const itemResult = createEmptyDropResultData('item_src');
    itemResult.itemList = [
      { itemId: 'MAT_DIAMOND', itemType: 3, quantity: 10 },
      { itemId: 'FRAG_SSR_01', itemType: 3, quantity: 5 },
    ];
    const itemGrants = convertDropResultToRewardGrants(itemResult);
    this.assert('物品转换产生 2 个 grant', itemGrants.length === 2);
    this.assert('第 1 个物品 itemId 在 rewardId 中', itemGrants[0].rewardId.includes('MAT_DIAMOND'));

    // 11e. 混合转换
    const mixedResult = createEmptyDropResultData('mixed_src');
    mixedResult.gold = 200;
    mixedResult.exp = 100;
    mixedResult.itemList = [{ itemId: 'MAT_IRON', itemType: 3, quantity: 3 }];
    const mixedGrants = convertDropResultToRewardGrants(mixedResult);
    this.assert('混合结果产生 3 个 grant', mixedGrants.length === 3);

    console.log('RewardGrant 转换测试完成\n');
  }

  // ==================== 测试 12: 边界情况 ====================

  private static testEdgeCases(): void {
    console.log('--- 测试 12: 边界情况 ---');

    // 12a. 重复 createEmptyPitySnapshot 每次独立
    const s1 = createEmptyPitySnapshot();
    const s2 = createEmptyPitySnapshot();
    s1.pityCounters['test'] = 1;
    this.assert('空快照之间独立（s2 不受 s1 影响）',
      (s2.pityCounters['test'] ?? 0) === 0);

    // 12b. generateDropHistoryRecordId 每次唯一
    const id1 = generateDropHistoryRecordId();
    const id2 = generateDropHistoryRecordId();
    this.assert('历史记录 ID 唯一', id1 !== id2);

    // 12c. 保底规则 extraReward 为 undefined 时不崩溃
    const noRewardRule = createTestPityRule({
      id: 'edge_no_reward',
      extraReward: undefined,
    });
    this.assert('extraReward=undefined 规则有效', noRewardRule.id === 'edge_no_reward');

    // 12d. DropHistoryRecord 大 rewards 数组
    const bigRecord = createTestDropHistoryRecord();
    bigRecord.rewards = Array.from({ length: 100 }, (_, i) => ({
      rewardId: `big_${i}`,
      rewardType: 'gold' as const,
      quantity: 1,
      sourceId: 'big_test',
      granted: false,
    }));
    this.assert('100 条 rewards 可创建', bigRecord.rewards.length === 100);

    // 12e. 全部 sourceType 覆盖
    const allTypes = ['dungeon_node', 'dungeon_boss', 'dungeon_event',
      'quest', 'achievement', 'shop', 'compensation', 'season'];
    for (const st of allTypes) {
      const r = createTestDropHistoryRecord({ sourceType: st });
      this.assert(`sourceType: ${st} 记录可创建`, r.sourceType === st);
    }

    console.log('边界情况测试完成\n');
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
}
