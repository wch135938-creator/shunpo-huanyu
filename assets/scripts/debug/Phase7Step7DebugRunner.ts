// ============================================================
// Phase7Step7DebugRunner — Phase7-Step7 Artifact/LiveOps/SpecialEvent 集成测试
// 职责：验证 ArtifactSystem / LiveOpsManager / SpecialEventManager /
//        ConfigValidator 扩展 / RuntimeValidator 扩展 / SaveValidator 扩展 /
//        SaveMigration V6→V7 / DomainEventBus 新事件类型 / 边界情况
// 用法：在 Cocos Creator 控制台执行 Phase7Step7DebugRunner.runAll()
// ============================================================

import { ArtifactSystem } from '../systems/ArtifactSystem';
import { LiveOpsManager } from '../systems/LiveOpsManager';
import { SpecialEventManager } from '../systems/SpecialEventManager';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveValidator } from '../save/SaveValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { DomainEventBus } from '../systems/DomainEventBus';
import { DomainEventType, generateCorrelationId } from '../data/roguelike_types';
import { createDefaultSaveContainer, CURRENT_SAVE_VERSION } from '../save/SaveContainer';
import type { SaveContainer } from '../save/SaveContainer';
import type { ArtifactConfig, ArtifactState, ArtifactInventory } from '../data/artifact_types';
import { createDefaultArtifactInventory } from '../data/artifact_types';
import type { LiveOpsConfig, LiveOpsState } from '../data/liveops_types';
import { createDefaultLiveOpsState } from '../data/liveops_types';
import type { SpecialEventConfig, SpecialEventState } from '../data/specialevent_types';
import { createDefaultSpecialEventState } from '../data/specialevent_types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

// ---- 测试辅助：创建 Mock 配置 ----

function createTestArtifactConfig(overrides?: Partial<ArtifactConfig>): ArtifactConfig {
  return {
    id: 'ARTIFACT_001',
    version: 1,
    nameKey: 'artifact_test_name',
    rarity: 'legendary',
    effectRefs: ['EFFECT_ATK_BOOST', 'EFFECT_HP_BOOST'],
    tags: ['test', 'attack'],
    ...overrides,
  };
}

function createTestLiveOpsConfig(overrides?: Partial<LiveOpsConfig>): LiveOpsConfig {
  const now = Date.now();
  return {
    id: 'LIVEOPS_001',
    version: 1,
    startTime: now - 86400000, // 1 day ago
    endTime: now + 86400000,   // 1 day later
    eventPoolRefs: ['POOL_EVENT_001'],
    rewardPoolRefs: ['POOL_REWARD_001'],
    tags: ['test'],
    ...overrides,
  };
}

function createTestSpecialEventConfig(overrides?: Partial<SpecialEventConfig>): SpecialEventConfig {
  return {
    id: 'SPEVENT_001',
    version: 1,
    triggerType: 'login',
    rewardSourceRefs: ['REWARD_SRC_001'],
    conditions: [
      { type: 'minLevel', params: { level: 5 } },
    ],
    ...overrides,
  };
}

export class Phase7Step7DebugRunner {
  private _results: TestResult[] = [];
  private _assertCount = 0;

  // ---- 断言工具 ----

  private _assert(condition: boolean, name: string, detail: string = ''): void {
    this._assertCount += 1;
    const passed = condition;
    this._results.push({
      name,
      passed,
      message: passed ? 'PASS' : `FAIL: ${detail}`,
    });
  }

  private _assertEqual<T>(actual: T, expected: T, name: string): void {
    this._assertCount += 1;
    const passed = actual === expected;
    this._results.push({
      name,
      passed,
      message: passed ? 'PASS' : `FAIL: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    });
  }

  private _assertNotNull<T>(value: T | null | undefined, name: string): void {
    this._assertCount += 1;
    const passed = value !== null && value !== undefined;
    this._results.push({
      name,
      passed,
      message: passed ? 'PASS' : 'FAIL: value is null/undefined',
    });
  }

  private _assertTrue(condition: boolean, name: string): void {
    this._assert(condition, name, `expected true, got ${condition}`);
  }

  private _assertFalse(condition: boolean, name: string): void {
    this._assert(!condition, name, `expected false, got ${condition}`);
  }

  // ==================== 主入口 ====================

  runAll(): void {
    this._results = [];
    this._assertCount = 0;

    console.log('========================================');
    console.log('Phase7Step7DebugRunner — 开始全量测试');
    console.log('========================================');

    // 分组执行
    this._testArtifactSystem();
    this._testLiveOpsManager();
    this._testSpecialEventManager();
    this._testConfigValidatorExtensions();
    this._testRuntimeValidatorExtensions();
    this._testSaveValidatorExtensions();
    this._testSaveMigrationV6ToV7();
    this._testDomainEventBusExtensions();
    this._testSaveContainerV7();
    this._testEdgeCases();
    this._testZeroBreakPrinciple();

    // 汇总
    const passed = this._results.filter((r) => r.passed).length;
    const failed = this._results.filter((r) => !r.passed).length;

    console.log('========================================');
    console.log(`测试完成: ${passed} 通过, ${failed} 失败, ${this._assertCount} 个断言`);
    console.log('========================================');

    if (failed > 0) {
      console.error('失败测试:');
      for (const r of this._results.filter((r) => !r.passed)) {
        console.error(`  [FAIL] ${r.name}: ${r.message}`);
      }
    }
  }

  // ==================== ArtifactSystem 测试 ====================

  private _testArtifactSystem(): void {
    console.log('--- ArtifactSystem 测试 ---');

    const system = new ArtifactSystem();
    const config = createTestArtifactConfig();

    // TEST: 初始状态为空
    this._assertEqual(system.getAllArtifacts().length, 0, 'AS-01: 初始神器列表为空');
    this._assertEqual(system.getArtifactCount(), 0, 'AS-02: 初始神器数量为 0');
    this._assertNull(system.getActiveArtifact(), 'AS-03: 初始无激活神器');

    // TEST: 解锁神器
    const unlocked = system.unlockArtifact('ARTIFACT_001', config);
    this._assertNotNull(unlocked, 'AS-04: 解锁神器返回非空');
    this._assertEqual(unlocked?.artifactId, 'ARTIFACT_001', 'AS-05: 解锁神器 ID 正确');
    this._assertEqual(unlocked?.level, 1, 'AS-06: 解锁神器初始等级为 1');
    this._assertEqual(system.getAllArtifacts().length, 1, 'AS-07: 解锁后神器列表长度为 1');

    // TEST: 重复解锁不创建重复
    const dup = system.unlockArtifact('ARTIFACT_001', config);
    this._assertEqual(system.getArtifactCount(), 1, 'AS-08: 重复解锁不增加数量');
    this._assertNotNull(dup, 'AS-09: 重复解锁返回已存在的神器');

    // TEST: 激活神器
    const activated = system.activateArtifact('ARTIFACT_001');
    this._assertTrue(activated, 'AS-10: 激活神器成功');
    this._assertNotNull(system.getActiveArtifact(), 'AS-11: 激活后 getActiveArtifact 非空');
    this._assertEqual(system.getActiveArtifact()?.artifactId, 'ARTIFACT_001', 'AS-12: 激活的神器 ID 正确');

    // TEST: 升级神器
    const leveled = system.levelUpArtifact('ARTIFACT_001');
    this._assertNotNull(leveled, 'AS-13: 升级神器返回非空');
    this._assertEqual(leveled?.level, 2, 'AS-14: 升级后等级为 2');

    // TEST: 再次升级
    const leveled2 = system.levelUpArtifact('ARTIFACT_001');
    this._assertEqual(leveled2?.level, 3, 'AS-15: 再次升级后等级为 3');

    // TEST: 升级不存在的神器
    const badLevelUp = system.levelUpArtifact('NONEXISTENT');
    this._assertEqual(badLevelUp, null, 'AS-16: 升级不存在的神器返回 null');

    // TEST: getArtifact
    const found = system.getArtifact('ARTIFACT_001');
    this._assertNotNull(found, 'AS-17: getArtifact 找到存在的神器');
    this._assertEqual(found?.level, 3, 'AS-18: getArtifact 返回正确等级');

    const notFound = system.getArtifact('NONEXISTENT');
    this._assertEqual(notFound, null, 'AS-19: getArtifact 对不存在返回 null');

    // TEST: 校验神器状态
    const validResult = system.validateArtifact('ARTIFACT_001');
    this._assertTrue(validResult.valid, 'AS-20: validateArtifact 通过');

    const invalidResult = system.validateArtifact('NONEXISTENT');
    this._assertFalse(invalidResult.valid, 'AS-21: 不存在神器校验失败');

    // TEST: 校验神器配置
    const configsResult = system.validateArtifactConfigs([config]);
    this._assertTrue(configsResult.valid, 'AS-22: validateArtifactConfigs 有效配置通过');

    const badConfig = createTestArtifactConfig({ id: 'BAD', rarity: 'invalid' as any });
    const badResult = system.validateArtifactConfigs([badConfig]);
    this._assertFalse(badResult.valid, 'AS-23: validateArtifactConfigs 无效 rarity 失败');

    // TEST: loadInventory / getInventory
    const testInv: ArtifactInventory = {
      artifacts: [{ artifactId: 'ARTIFACT_LOAD', level: 5, obtainedAt: 1000 }],
      activeArtifactId: 'ARTIFACT_LOAD',
    };
    system.loadInventory(testInv);
    this._assertEqual(system.getArtifactCount(), 1, 'AS-24: loadInventory 覆盖现有数据');
    this._assertEqual(system.getArtifact('ARTIFACT_LOAD')?.level, 5, 'AS-25: loadInventory 数据正确');
    this._assertEqual(system.getActiveArtifact()?.artifactId, 'ARTIFACT_LOAD', 'AS-26: loadInventory 激活状态正确');

    const exported = system.getInventory();
    this._assertEqual(exported.artifacts.length, 1, 'AS-27: getInventory 导出正确');
  }

  // ==================== LiveOpsManager 测试 ====================

  private _testLiveOpsManager(): void {
    console.log('--- LiveOpsManager 测试 ---');

    const manager = new LiveOpsManager();
    const now = Date.now();
    const activeConfig = createTestLiveOpsConfig();

    // TEST: 初始状态
    this._assertEqual(manager.getActiveEvents().length, 0, 'LO-01: 初始活跃活动为空');
    this._assertFalse(manager.isEventActive('LIVEOPS_001'), 'LO-02: 初始无活动激活');

    // TEST: 加载配置
    manager.loadConfigs([activeConfig]);
    this._assertEqual(manager.getAllConfigs().length, 1, 'LO-03: loadConfigs 加载 1 个配置');

    // TEST: 刷新活动（当前时间在范围内）
    manager.refreshEvents();
    this._assertEqual(manager.getActiveEvents().length, 1, 'LO-04: refreshEvents 激活了当前活动');
    this._assertTrue(manager.isEventActive('LIVEOPS_001'), 'LO-05: isEventActive 返回 true');

    // TEST: 刷新时传入新配置
    const configs = [
      createTestLiveOpsConfig({ id: 'LIVEOPS_001' }),
      createTestLiveOpsConfig({
        id: 'LIVEOPS_PAST',
        startTime: now - 172800000, // 2 days ago
        endTime: now - 86400000,     // 1 day ago (expired)
      }),
      createTestLiveOpsConfig({
        id: 'LIVEOPS_FUTURE',
        startTime: now + 86400000,   // 1 day later
        endTime: now + 172800000,    // 2 days later
      }),
    ];
    manager.refreshEvents(configs);
    this._assertEqual(manager.getActiveEvents().length, 1, 'LO-06: 过期和未来活动不计入活跃');
    this._assertTrue(manager.isEventActive('LIVEOPS_001'), 'LO-07: 当前活动仍活跃');
    this._assertFalse(manager.isEventActive('LIVEOPS_PAST'), 'LO-08: 过期活动不活跃');
    this._assertFalse(manager.isEventActive('LIVEOPS_FUTURE'), 'LO-09: 未来活动不活跃');

    // TEST: 获取配置
    const found = manager.getConfig('LIVEOPS_001');
    this._assertNotNull(found, 'LO-10: getConfig 找到存在配置');
    this._assertEqual(found?.id, 'LIVEOPS_001', 'LO-11: getConfig ID 正确');

    const notFound = manager.getConfig('NONEXISTENT');
    this._assertEqual(notFound, null, 'LO-12: getConfig 不存在返回 null');

    // TEST: 校验状态
    const stateResult = manager.validateLiveOpsState();
    this._assertTrue(stateResult.valid, 'LO-13: validateLiveOpsState 通过');

    // TEST: 校验配置
    const configResult = manager.validateLiveOpsConfigs(configs);
    this._assertTrue(configResult.valid, 'LO-14: validateLiveOpsConfigs 通过');

    // TEST: 无效配置（时间倒置）
    const badConfigs = [
      createTestLiveOpsConfig({
        id: 'BAD_TIME',
        startTime: now + 86400000,
        endTime: now,  // endTime before startTime
      }),
    ];
    const badResult = manager.validateLiveOpsConfigs(badConfigs);
    this._assertFalse(badResult.valid, 'LO-15: 时间倒置配置校验失败');

    // TEST: loadState / getState
    const testState: LiveOpsState = {
      activeEventIds: ['EVENT_A', 'EVENT_B'],
      lastRefreshAt: 12345,
    };
    manager.loadState(testState);
    this._assertEqual(manager.getActiveEvents().length, 2, 'LO-16: loadState 恢复活跃列表');
    this._assertTrue(manager.isEventActive('EVENT_B'), 'LO-17: loadState 活动激活状态正确');

    const exported = manager.getState();
    this._assertEqual(exported.activeEventIds.length, 2, 'LO-18: getState 导出正确');
  }

  // ==================== SpecialEventManager 测试 ====================

  private _testSpecialEventManager(): void {
    console.log('--- SpecialEventManager 测试 ---');

    const manager = new SpecialEventManager();
    const config = createTestSpecialEventConfig();

    // TEST: 初始状态
    this._assertEqual(manager.getAllEventStates().length, 0, 'SE-01: 初始事件列表为空');
    this._assertEqual(manager.getEventCount(), 0, 'SE-02: 初始事件数为 0');

    // TEST: 加载配置
    manager.loadConfigs([config]);
    this._assertEqual(manager.getAllEventStates().length, 0, 'SE-03: loadConfigs 不影响状态数');

    // TEST: 触发事件
    const triggered = manager.triggerEvent('SPEVENT_001', 'login');
    this._assertNotNull(triggered, 'SE-04: triggerEvent 返回非空');
    this._assertEqual(triggered?.eventId, 'SPEVENT_001', 'SE-05: 触发事件 ID 正确');
    this._assertFalse(triggered?.completed ?? true, 'SE-06: 触发事件初始未完成');
    this._assertEqual(manager.getEventCount(), 1, 'SE-07: 触发后事件数为 1');

    // TEST: 重复触发不创建重复
    const dupTriggered = manager.triggerEvent('SPEVENT_001', 'login');
    this._assertEqual(manager.getEventCount(), 1, 'SE-08: 重复触发不增加事件数');

    // TEST: 完成事件
    const completed = manager.completeEvent('SPEVENT_001');
    this._assertNotNull(completed, 'SE-09: completeEvent 返回非空');
    this._assertTrue(completed?.completed ?? false, 'SE-10: 完成后 completed=true');
    this._assertNotNull(completed?.completedAt, 'SE-11: 完成后 completedAt 非空');
    this._assertEqual(manager.getCompletedCount(), 1, 'SE-12: 完成后已完成计数为 1');

    // TEST: 重复完成不报错
    const reCompleted = manager.completeEvent('SPEVENT_001');
    this._assertNotNull(reCompleted, 'SE-13: 重复完成不报错');
    this._assertTrue(reCompleted?.completed ?? false, 'SE-14: 重复完成仍为已完成');

    // TEST: 完成不存在的事件
    const badComplete = manager.completeEvent('NONEXISTENT');
    this._assertEqual(badComplete, null, 'SE-15: 完成不存在事件返回 null');

    // TEST: getEventState
    const found = manager.getEventState('SPEVENT_001');
    this._assertNotNull(found, 'SE-16: getEventState 找到存在事件');
    this._assertTrue(found?.completed ?? false, 'SE-17: getEventState 状态正确');

    const notFound = manager.getEventState('NONEXISTENT');
    this._assertEqual(notFound, null, 'SE-18: getEventState 不存在返回 null');

    // TEST: 校验事件状态
    const validStateResult = manager.validateSpecialEventState('SPEVENT_001');
    this._assertTrue(validStateResult.valid, 'SE-19: validateSpecialEventState 通过');

    const invalidStateResult = manager.validateSpecialEventState('NONEXISTENT');
    this._assertFalse(invalidStateResult.valid, 'SE-20: 不存在事件状态校验失败');

    // TEST: 校验配置
    const configResult = manager.validateSpecialEventConfigs([config]);
    this._assertTrue(configResult.valid, 'SE-21: validateSpecialEventConfigs 有效配置通过');

    const badConfig = createTestSpecialEventConfig({
      id: 'BAD_TRIGGER',
      triggerType: 'invalid' as any,
    });
    const badResult = manager.validateSpecialEventConfigs([badConfig]);
    this._assertFalse(badResult.valid, 'SE-22: 无效 triggerType 校验失败');

    // TEST: loadStates / getStates
    const testStates: SpecialEventState[] = [
      { eventId: 'SE_A', completed: true, completedAt: 1000 },
      { eventId: 'SE_B', completed: false },
    ];
    manager.loadStates(testStates);
    this._assertEqual(manager.getEventCount(), 2, 'SE-23: loadStates 恢复事件列表');
    this._assertTrue(manager.getEventState('SE_A')?.completed ?? false, 'SE-24: loadStates completed 正确');

    const exported = manager.getStates();
    this._assertEqual(exported.length, 2, 'SE-25: getStates 导出正确');
  }

  // ==================== ConfigValidator 扩展测试 ====================

  private _testConfigValidatorExtensions(): void {
    console.log('--- ConfigValidator 扩展测试 ---');

    const validator = new ConfigValidator();

    // -- validateArtifactConfigs --
    const artifactConfigs: ArtifactConfig[] = [
      createTestArtifactConfig({ id: 'ART_A', rarity: 'common', effectRefs: ['EFF_1'] }),
      createTestArtifactConfig({ id: 'ART_B', rarity: 'epic', effectRefs: ['EFF_2'] }),
    ];
    const artResult = validator.validateArtifactConfigs(artifactConfigs);
    this._assertTrue(artResult.valid, 'CV-01: validateArtifactConfigs 通过');
    this._assertEqual(artResult.errorCount, 0, 'CV-02: 无 error');

    // 重复 ID
    const dupConfigs: ArtifactConfig[] = [
      createTestArtifactConfig({ id: 'ART_DUP' }),
      createTestArtifactConfig({ id: 'ART_DUP' }),
    ];
    const dupResult = validator.validateArtifactConfigs(dupConfigs);
    this._assertFalse(dupResult.valid, 'CV-03: 重复 ID 校验失败');

    // 无效 rarity
    const badRarity: ArtifactConfig[] = [
      createTestArtifactConfig({ id: 'ART_BAD', rarity: 'mythic' as any }),
    ];
    const rarityResult = validator.validateArtifactConfigs(badRarity);
    this._assertFalse(rarityResult.valid, 'CV-04: 无效 rarity 校验失败');

    // -- validateLiveOpsConfigs --
    const now = Date.now();
    const liveOpsConfigs: LiveOpsConfig[] = [
      createTestLiveOpsConfig({ id: 'LO_A' }),
      createTestLiveOpsConfig({ id: 'LO_B' }),
    ];
    const loResult = validator.validateLiveOpsConfigs(liveOpsConfigs);
    this._assertTrue(loResult.valid, 'CV-05: validateLiveOpsConfigs 通过');

    // 时间倒置
    const badTimeConfigs: LiveOpsConfig[] = [
      createTestLiveOpsConfig({
        id: 'LO_BAD_TIME',
        startTime: now + 86400000,
        endTime: now,
      }),
    ];
    const timeResult = validator.validateLiveOpsConfigs(badTimeConfigs);
    this._assertFalse(timeResult.valid, 'CV-06: 时间倒置校验失败');

    // 空奖励池引用（warning 不影响 valid）
    const emptyRewardConfig = createTestLiveOpsConfig({
      id: 'LO_EMPTY',
      rewardPoolRefs: [],
    });
    const emptyResult = validator.validateLiveOpsConfigs([emptyRewardConfig]);
    this._assertTrue(emptyResult.valid, 'CV-07: 空奖励池仅 warning');
    this._assertTrue(emptyResult.warningCount > 0, 'CV-08: 空奖励池产生 warning');

    // -- validateSpecialEventConfigs --
    const spConfigs: SpecialEventConfig[] = [
      createTestSpecialEventConfig({ id: 'SP_A', triggerType: 'battle' }),
      createTestSpecialEventConfig({ id: 'SP_B', triggerType: 'dungeon' }),
    ];
    const spResult = validator.validateSpecialEventConfigs(spConfigs);
    this._assertTrue(spResult.valid, 'CV-09: validateSpecialEventConfigs 通过');

    // 无效 triggerType
    const badTriggerConfigs: SpecialEventConfig[] = [
      createTestSpecialEventConfig({
        id: 'SP_BAD_TRIGGER',
        triggerType: 'unknown' as any,
      }),
    ];
    const triggerResult = validator.validateSpecialEventConfigs(badTriggerConfigs);
    this._assertFalse(triggerResult.valid, 'CV-10: 无效 triggerType 校验失败');

    // 无效 conditions
    const badConditionConfigs: SpecialEventConfig[] = [
      createTestSpecialEventConfig({
        id: 'SP_BAD_COND',
        conditions: [{ type: 'invalid_type' as any, params: {} }],
      }),
    ];
    const condResult = validator.validateSpecialEventConfigs(badConditionConfigs);
    this._assertFalse(condResult.valid, 'CV-11: 无效 condition type 校验失败');
  }

  // ==================== RuntimeValidator 扩展测试 ====================

  private _testRuntimeValidatorExtensions(): void {
    console.log('--- RuntimeValidator 扩展测试 ---');

    const validator = new RuntimeValidator();

    // -- validateArtifactState --
    const validArtState: ArtifactState = {
      artifactId: 'ART_001',
      level: 5,
      obtainedAt: Date.now(),
    };
    const art1 = validator.validateArtifactState(validArtState);
    this._assertTrue(art1.valid, 'RV-01: validateArtifactState 有效状态通过');

    const badLevelState: ArtifactState = {
      artifactId: 'ART_BAD',
      level: 0,
      obtainedAt: Date.now(),
    };
    const art2 = validator.validateArtifactState(badLevelState);
    this._assertFalse(art2.valid, 'RV-02: level=0 校验失败');

    const noIdState: ArtifactState = {
      artifactId: '',
      level: 1,
      obtainedAt: Date.now(),
    };
    const art3 = validator.validateArtifactState(noIdState);
    this._assertFalse(art3.valid, 'RV-03: 空 artifactId 校验失败');

    // null state
    const nullArt = validator.validateArtifactState(null as any);
    this._assertFalse(nullArt.valid, 'RV-04: null 状态校验失败');

    // -- validateLiveOpsState --
    const validLOState: LiveOpsState = {
      activeEventIds: ['E1', 'E2'],
      lastRefreshAt: Date.now(),
    };
    const lo1 = validator.validateLiveOpsState(validLOState);
    this._assertTrue(lo1.valid, 'RV-05: validateLiveOpsState 有效状态通过');

    const badLOState: LiveOpsState = {
      activeEventIds: 'not_array' as any,
      lastRefreshAt: Date.now(),
    };
    const lo2 = validator.validateLiveOpsState(badLOState);
    this._assertFalse(lo2.valid, 'RV-06: activeEventIds 非数组校验失败');

    const negativeRefresh: LiveOpsState = {
      activeEventIds: [],
      lastRefreshAt: -1,
    };
    const lo3 = validator.validateLiveOpsState(negativeRefresh);
    this._assertFalse(lo3.valid, 'RV-07: lastRefreshAt 负数校验失败');

    // null state
    const nullLO = validator.validateLiveOpsState(null as any);
    this._assertFalse(nullLO.valid, 'RV-08: null 运营状态校验失败');

    // -- validateSpecialEventState --
    const validSPState: SpecialEventState = {
      eventId: 'SP_001',
      completed: true,
      completedAt: Date.now(),
    };
    const sp1 = validator.validateSpecialEventState(validSPState);
    this._assertTrue(sp1.valid, 'RV-09: validateSpecialEventState 已完成状态通过');

    const incompleteSP: SpecialEventState = {
      eventId: 'SP_002',
      completed: false,
    };
    const sp2 = validator.validateSpecialEventState(incompleteSP);
    this._assertTrue(sp2.valid, 'RV-10: 未完成状态通过');

    const badSPState: SpecialEventState = {
      eventId: '',
      completed: 'yes' as any,
    };
    const sp3 = validator.validateSpecialEventState(badSPState);
    this._assertFalse(sp3.valid, 'RV-11: completed 类型错误校验失败');

    // null state
    const nullSP = validator.validateSpecialEventState(null as any);
    this._assertFalse(nullSP.valid, 'RV-12: null 特殊事件状态校验失败');
  }

  // ==================== SaveValidator 扩展测试 ====================

  private _testSaveValidatorExtensions(): void {
    console.log('--- SaveValidator 扩展测试 ---');

    const validator = new SaveValidator();

    // -- validateArtifactInventory --
    const validInv: ArtifactInventory = {
      artifacts: [
        { artifactId: 'ART_A', level: 3, obtainedAt: 1000 },
        { artifactId: 'ART_B', level: 1, obtainedAt: 2000 },
      ],
      activeArtifactId: 'ART_A',
    };
    const ai1 = validator.validateArtifactInventory(validInv);
    this._assertEqual(ai1.length, 0, 'SV-01: 有效 artifactInventory 无问题');

    // undefined (V7 optional)
    const ai2 = validator.validateArtifactInventory(undefined);
    this._assertEqual(ai2.length, 0, 'SV-02: undefined artifactInventory 无问题');

    // null
    const ai3 = validator.validateArtifactInventory(null);
    this._assertEqual(ai3.length, 0, 'SV-03: null artifactInventory 无问题');

    // 重复 artifactId
    const dupInv = {
      artifacts: [
        { artifactId: 'ART_DUP', level: 1, obtainedAt: 1000 },
        { artifactId: 'ART_DUP', level: 2, obtainedAt: 2000 },
      ],
      activeArtifactId: null,
    };
    const ai4 = validator.validateArtifactInventory(dupInv);
    this._assertTrue(ai4.some((i) => i.severity === 'error'), 'SV-04: 重复 artifactId 产生 error');

    // activeArtifactId 不存在于 artifacts
    const orphanActive = {
      artifacts: [{ artifactId: 'ART_A', level: 1, obtainedAt: 1000 }],
      activeArtifactId: 'ART_MISSING',
    };
    const ai5 = validator.validateArtifactInventory(orphanActive);
    this._assertTrue(ai5.some((i) => i.message.includes('不在')), 'SV-05: 孤立的 activeArtifactId 产生 warning');

    // -- validateLiveOpsState --
    const validLO = {
      activeEventIds: ['E1', 'E2'],
      lastRefreshAt: 12345,
    };
    const lo1 = validator.validateLiveOpsState(validLO);
    this._assertEqual(lo1.length, 0, 'SV-06: 有效 liveOpsState 无问题');

    // undefined
    const lo2 = validator.validateLiveOpsState(undefined);
    this._assertEqual(lo2.length, 0, 'SV-07: undefined liveOpsState 无问题');

    // 无效 activeEventIds
    const badLO = { activeEventIds: 'not_array', lastRefreshAt: 0 };
    const lo3 = validator.validateLiveOpsState(badLO);
    this._assertTrue(lo3.some((i) => i.severity === 'error'), 'SV-08: 无效 activeEventIds 产生 error');

    // -- validateSpecialEventStates --
    const validSP = [
      { eventId: 'SP_A', completed: true, completedAt: 1000 },
      { eventId: 'SP_B', completed: false },
    ];
    const sp1 = validator.validateSpecialEventStates(validSP);
    this._assertEqual(sp1.length, 0, 'SV-09: 有效 specialEventStates 无问题');

    // undefined
    const sp2 = validator.validateSpecialEventStates(undefined);
    this._assertEqual(sp2.length, 0, 'SV-10: undefined specialEventStates 无问题');

    // 重复 eventId
    const dupSP = [
      { eventId: 'SP_DUP', completed: false },
      { eventId: 'SP_DUP', completed: true },
    ];
    const sp3 = validator.validateSpecialEventStates(dupSP);
    this._assertTrue(sp3.some((i) => i.severity === 'error'), 'SV-11: 重复 eventId 产生 error');

    // V7 新字段在全量校验中被调用
    const container = createDefaultSaveContainer();
    container.artifactInventory = validInv;
    container.liveOpsState = validLO;
    container.specialEventStates = validSP;
    const fullResult = validator.validate(container);
    this._assertTrue(fullResult.valid, 'SV-12: V7 字段全量校验通过');
  }

  // ==================== SaveMigration V6→V7 测试 ====================

  private _testSaveMigrationV6ToV7(): void {
    console.log('--- SaveMigration V6→V7 测试 ---');

    const migrationSystem = new SaveMigrationSystem();

    // TEST: 默认步骤已注册
    migrationSystem.registerDefaultSteps();
    const steps = migrationSystem.getMigrationSteps();
    const v6Step = steps.find((s) => s.fromVersion === 6 && s.toVersion === 7);
    this._assertNotNull(v6Step, 'MG-01: V6→V7 迁移步骤已注册');

    // TEST: V6 存档迁移到 V7
    const v6Container = createDefaultSaveContainer();
    v6Container.saveVersion = 6;
    // 移除 V7 字段模拟旧存档
    delete v6Container.artifactInventory;
    delete v6Container.liveOpsState;
    delete v6Container.specialEventStates;

    const result = migrationSystem.migrate(v6Container);
    this._assertTrue(result.success, 'MG-02: V6→V7 迁移成功');
    this._assertEqual(result.finalVersion, 7, 'MG-03: 迁移后版本为 7');
    this._assertEqual(result.stepsExecuted, 1, 'MG-04: 执行了 1 步迁移');

    // TEST: 迁移后 artifactInventory 存在
    this._assertNotNull(v6Container.artifactInventory, 'MG-05: 迁移后 artifactInventory 存在');
    this._assertEqual(v6Container.artifactInventory?.artifacts.length ?? -1, 0, 'MG-06: artifactInventory.artifacts 为空数组');
    this._assertEqual(v6Container.artifactInventory?.activeArtifactId ?? 'NOT_NULL', null, 'MG-07: activeArtifactId 为 null');

    // TEST: 迁移后 liveOpsState 存在
    this._assertNotNull(v6Container.liveOpsState, 'MG-08: 迁移后 liveOpsState 存在');
    this._assertEqual(v6Container.liveOpsState?.activeEventIds.length ?? -1, 0, 'MG-09: activeEventIds 为空数组');
    this._assertEqual(v6Container.liveOpsState?.lastRefreshAt ?? -1, 0, 'MG-10: lastRefreshAt 为 0');

    // TEST: 迁移后 specialEventStates 存在
    this._assertNotNull(v6Container.specialEventStates, 'MG-11: 迁移后 specialEventStates 存在');
    this._assertEqual(v6Container.specialEventStates?.length ?? -1, 0, 'MG-12: specialEventStates 为空数组');

    // TEST: V7 存档不需要迁移
    const v7Container = createDefaultSaveContainer();
    v7Container.saveVersion = 7;
    const noMigResult = migrationSystem.migrate(v7Container);
    this._assertEqual(noMigResult.stepsExecuted, 0, 'MG-13: V7 存档不需要迁移');

    // TEST: V0 存档兼容迁移到 V7（验证全链）
    const v0Container = createDefaultSaveContainer();
    v0Container.saveVersion = 0;
    delete v0Container.artifactInventory;
    delete v0Container.liveOpsState;
    delete v0Container.specialEventStates;
    const fullMigResult = migrationSystem.migrate(v0Container);
    this._assertTrue(fullMigResult.success, 'MG-14: V0→V7 全链迁移成功');
    this._assertEqual(fullMigResult.finalVersion, 7, 'MG-15: V0→V7 最终版本为 7');
  }

  // ==================== DomainEventBus 扩展测试 ====================

  private _testDomainEventBusExtensions(): void {
    console.log('--- DomainEventBus 扩展测试 ---');

    const bus = new DomainEventBus();

    // TEST: ARTIFACT_UNLOCKED 事件发布
    const corrId1 = generateCorrelationId();
    const event1 = bus.publish(
      DomainEventType.ARTIFACT_UNLOCKED,
      { artifactId: 'ART_001', rarity: 'legendary' },
      'ART_001',
      'PLAYER_001',
      corrId1,
    );
    this._assertNotNull(event1, 'DE-01: ARTIFACT_UNLOCKED 事件发布成功');
    this._assertEqual(event1.type, DomainEventType.ARTIFACT_UNLOCKED, 'DE-02: 事件类型正确');
    this._assertNotNull(event1.correlationId, 'DE-03: correlationId 存在');

    // TEST: ARTIFACT_LEVEL_CHANGED 事件
    const corrId2 = generateCorrelationId();
    const event2 = bus.publish(
      DomainEventType.ARTIFACT_LEVEL_CHANGED,
      { artifactId: 'ART_001', oldLevel: 1, newLevel: 2 },
      'ART_001',
      'PLAYER_001',
      corrId2,
    );
    this._assertEqual(event2.type, DomainEventType.ARTIFACT_LEVEL_CHANGED, 'DE-04: ARTIFACT_LEVEL_CHANGED 发布成功');

    // TEST: LIVEOPS_REFRESHED 事件
    const corrId3 = generateCorrelationId();
    const event3 = bus.publish(
      DomainEventType.LIVEOPS_REFRESHED,
      { activeCount: 3 },
      'LIVEOPS_SYSTEM',
      'PLAYER_001',
      corrId3,
    );
    this._assertEqual(event3.type, DomainEventType.LIVEOPS_REFRESHED, 'DE-05: LIVEOPS_REFRESHED 发布成功');
    this._assertNotNull(event3.correlationId, 'DE-06: LIVEOPS_REFRESHED correlationId 存在');

    // TEST: SPECIAL_EVENT_TRIGGERED 事件
    const corrId4 = generateCorrelationId();
    const event4 = bus.publish(
      DomainEventType.SPECIAL_EVENT_TRIGGERED,
      { eventId: 'SPEVENT_001', triggerType: 'login' },
      'SPEVENT_001',
      'PLAYER_001',
      corrId4,
    );
    this._assertEqual(event4.type, DomainEventType.SPECIAL_EVENT_TRIGGERED, 'DE-07: SPECIAL_EVENT_TRIGGERED 发布成功');
    this._assertNotNull(event4.correlationId, 'DE-08: correlationId 存在');

    // TEST: SPECIAL_EVENT_COMPLETED 事件
    const corrId5 = generateCorrelationId();
    const event5 = bus.publish(
      DomainEventType.SPECIAL_EVENT_COMPLETED,
      { eventId: 'SPEVENT_001' },
      'SPEVENT_001',
      'PLAYER_001',
      corrId5,
    );
    this._assertEqual(event5.type, DomainEventType.SPECIAL_EVENT_COMPLETED, 'DE-09: SPECIAL_EVENT_COMPLETED 发布成功');

    // TEST: 通过 correlationId 查询
    const eventsByCorr = bus.getEventsByCorrelation(corrId1);
    this._assertTrue(eventsByCorr.length >= 1, 'DE-10: 按 correlationId 查询到事件');

    // TEST: 通过 eventType 查询
    const artifactEvents = bus.getEventsByType(DomainEventType.ARTIFACT_UNLOCKED);
    this._assertTrue(artifactEvents.length >= 1, 'DE-11: 按类型查询 ARTIFACT_UNLOCKED 事件');

    // TEST: 订阅新事件类型
    let receivedPayload: any = null;
    bus.subscribe(DomainEventType.ARTIFACT_UNLOCKED, (event) => {
      receivedPayload = event.payload;
    });

    bus.publish(
      DomainEventType.ARTIFACT_UNLOCKED,
      { artifactId: 'ART_002', rarity: 'epic' },
      'ART_002',
      'PLAYER_001',
      generateCorrelationId(),
    );
    this._assertNotNull(receivedPayload, 'DE-12: 订阅者收到 ARTIFACT_UNLOCKED 事件');
    this._assertEqual((receivedPayload as any)?.artifactId, 'ART_002', 'DE-13: 订阅者 payload 正确');
  }

  // ==================== SaveContainer V7 测试 ====================

  private _testSaveContainerV7(): void {
    console.log('--- SaveContainer V7 测试 ---');

    // TEST: CURRENT_SAVE_VERSION
    this._assertEqual(CURRENT_SAVE_VERSION, 7, 'SC-01: CURRENT_SAVE_VERSION 为 7');

    // TEST: createDefaultSaveContainer 包含 V7 字段
    const container = createDefaultSaveContainer();
    this._assertEqual(container.saveVersion, 7, 'SC-02: 新容器版本为 7');
    this._assertNotNull(container.artifactInventory, 'SC-03: artifactInventory 存在');
    this._assertNotNull(container.liveOpsState, 'SC-04: liveOpsState 存在');
    this._assertNotNull(container.specialEventStates, 'SC-05: specialEventStates 存在');
    this._assertEqual(container.artifactInventory?.artifacts.length ?? -1, 0, 'SC-06: 初始 artifacts 为空');
    this._assertEqual(container.artifactInventory?.activeArtifactId ?? 'NOT_NULL', null, 'SC-07: 初始 activeArtifactId 为 null');
    this._assertEqual(container.specialEventStates?.length ?? -1, 0, 'SC-08: 初始 specialEventStates 为空');
  }

  // ==================== 边界情况测试 ====================

  private _testEdgeCases(): void {
    console.log('--- 边界情况测试 ---');

    // -- ArtifactSystem 边界 --
    const artSystem = new ArtifactSystem();

    // 解锁大量神器
    for (let i = 0; i < 100; i++) {
      artSystem.unlockArtifact(`ARTIFACT_${i}`, createTestArtifactConfig({ id: `ARTIFACT_${i}` }));
    }
    this._assertEqual(artSystem.getArtifactCount(), 100, 'ED-01: 解锁 100 个神器成功');

    // 升级到高等级
    artSystem.unlockArtifact('ART_HIGH', createTestArtifactConfig({ id: 'ART_HIGH' }));
    for (let i = 0; i < 999; i++) {
      artSystem.levelUpArtifact('ART_HIGH');
    }
    this._assertEqual(artSystem.getArtifact('ART_HIGH')?.level, 1000, 'ED-02: 神器升级到 1000 级');

    // -- LiveOpsManager 边界 --
    const loManager = new LiveOpsManager();

    // 无配置刷新
    loManager.refreshEvents([]);
    this._assertEqual(loManager.getActiveEvents().length, 0, 'ED-03: 无配置刷新返回空');

    // 边界时间（恰好开始/结束）
    const now = Date.now();
    const edgeConfig = createTestLiveOpsConfig({
      id: 'EDGE_TIME',
      startTime: now,
      endTime: now,
    });
    loManager.loadConfigs([edgeConfig]);
    loManager.refreshEvents();
    this._assertTrue(loManager.isEventActive('EDGE_TIME'), 'ED-04: 边界时间活动（startTime == endTime == now）仍活跃');

    // 大量活动
    const manyConfigs: LiveOpsConfig[] = [];
    for (let i = 0; i < 50; i++) {
      manyConfigs.push(createTestLiveOpsConfig({ id: `LIVEOPS_${i}` }));
    }
    loManager.loadConfigs(manyConfigs);
    loManager.refreshEvents();
    this._assertEqual(loManager.getActiveEvents().length, 50, 'ED-05: 50 个活跃活动全部加载');

    // -- SpecialEventManager 边界 --
    const spManager = new SpecialEventManager();

    // 未加载配置时触发
    const noConfigTrigger = spManager.triggerEvent('NO_CONFIG', 'login');
    this._assertNotNull(noConfigTrigger, 'ED-06: 无配置触发不报错');
    this._assertEqual(noConfigTrigger?.eventId, 'NO_CONFIG', 'ED-07: 无配置触发返回正确 ID');

    // 大量事件
    for (let i = 0; i < 200; i++) {
      spManager.triggerEvent(`SPEVENT_${i}`, 'login');
    }
    this._assertEqual(spManager.getEventCount(), 201, 'ED-08: 200 个事件全部触发');

    // -- 校验器边界 --
    const rtValidator = new RuntimeValidator();

    // 未来时间戳（warning 不是 error）
    const futureState: ArtifactState = {
      artifactId: 'FUTURE',
      level: 1,
      obtainedAt: Date.now() + 86400000,
    };
    const futureResult = rtValidator.validateArtifactState(futureState);
    this._assertTrue(futureResult.valid, 'ED-09: 未来时间戳不影响 valid（仅 warning）');

    // 极高等级警告
    const highLevelState: ArtifactState = {
      artifactId: 'HIGH',
      level: 2000,
      obtainedAt: Date.now(),
    };
    const highResult = rtValidator.validateArtifactState(highLevelState);
    this._assertTrue(highResult.valid, 'ED-10: 极高等级不影响 valid');
    this._assertTrue(highResult.warningCount > 0, 'ED-11: 极高等级产生 warning');
  }

  // ==================== 零破坏验证 ====================

  private _testZeroBreakPrinciple(): void {
    console.log('--- 零破坏验证 ---');

    // TEST: Phase6 接口未受影响
    const container = createDefaultSaveContainer();
    this._assertNotNull(container.player, 'ZB-01: container.player 存在');
    this._assertNotNull(container.cards, 'ZB-02: container.cards 存在');
    this._assertNotNull(container.equipment, 'ZB-03: container.equipment 存在');
    this._assertNotNull(container.growth, 'ZB-04: container.growth 存在');
    this._assertNotNull(container.dungeon, 'ZB-05: container.dungeon 存在');
    this._assertNotNull(container.dropHistory, 'ZB-06: container.dropHistory 存在');

    // TEST: Phase7 已有字段未受影响
    this._assertNotNull(container.roguelikeState, 'ZB-07: roguelikeState 存在');
    this._assertNotNull(container.powerFormulaSnapshot, 'ZB-08: powerFormulaSnapshot 存在');

    // TEST: V6 存档迁移到 V7 不破坏已有字段
    const v6Container = createDefaultSaveContainer();
    v6Container.saveVersion = 6;
    (v6Container as any).artifactInventory = undefined;
    (v6Container as any).liveOpsState = undefined;
    (v6Container as any).specialEventStates = undefined;
    v6Container.player.level = 42;
    v6Container.player.exp = 9999;

    const migration = new SaveMigrationSystem();
    const migResult = migration.migrate(v6Container);
    this._assertTrue(migResult.success, 'ZB-09: V6→V7 迁移成功');
    this._assertEqual(v6Container.player.level, 42, 'ZB-10: 迁移后 player.level 不变');
    this._assertEqual(v6Container.player.exp, 9999, 'ZB-11: 迁移后 player.exp 不变');

    // TEST: 新增字段都是 optional
    this._assertNotNull(v6Container.artifactInventory, 'ZB-12: 迁移后 artifactInventory 已添加');
    this._assertNotNull(v6Container.liveOpsState, 'ZB-13: 迁移后 liveOpsState 已添加');
    this._assertNotNull(v6Container.specialEventStates, 'ZB-14: 迁移后 specialEventStates 已添加');

    // TEST: 无 V7 字段的 V7 容器校验通过
    const minimalV7 = createDefaultSaveContainer();
    const sv = new SaveValidator();
    const svResult = sv.validate(minimalV7);
    this._assertTrue(svResult.valid, 'ZB-15: 最小 V7 容器全量校验通过');
  }

  // ---- 静态入口 ----

  static runAll(): void {
    new Phase7Step7DebugRunner().runAll();
  }
}
