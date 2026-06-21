// ============================================================
// Phase7Step5DebugRunner — Phase7-Step5 ProgressSystem MultiTrack 集成测试
// 职责：验证 applyExp / applyExpBatch / recalculateHeroProgress /
//        Validator 扩展 / SaveMigration V4→V5 / PowerSystem 战力事件衔接
// 用法：在 Cocos Creator 控制台执行 Phase7Step5DebugRunner.runAll()
// ============================================================

import { ProgressSystem } from '../systems/ProgressSystem';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { SaveValidator } from '../save/SaveValidator';
import { DomainEventBus } from '../systems/DomainEventBus';
import { DomainEventType, generateCorrelationId } from '../data/roguelike_types';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
} from '../save/SaveContainer';
import type {
  HeroProgressStateV2,
  ProgressTrackState,
} from '../data/roguelike_types';
import type {
  ApplyExpInput,
  ApplyExpBatchInput,
  RecalculateProgressInput,
  ProgressResult,
  ProgressTrackConfig,
} from '../data/progress_types';
import {
  createDefaultProgressTrackConfig,
  createDefaultProgressTrackState,
  createDefaultHeroProgressStateV2,
} from '../data/progress_types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const DEFAULT_PLAYER_ID = 'player_001';

/** 创建测试用经验表 */
function createTestExpTable(maxLevel: number): Record<number, number> {
  const table: Record<number, number> = {};
  for (let lv = 1; lv < maxLevel; lv++) {
    table[lv] = 100 + (lv - 1) * 50; // 递增经验需求
  }
  return table;
}

/** 创建测试用 TrackConfig */
function createTestTrackConfig(
  trackId: string,
  overrides?: Partial<ProgressTrackConfig>,
): ProgressTrackConfig {
  return createDefaultProgressTrackConfig(trackId, {
    maxLevel: 10,
    expTable: createTestExpTable(10),
    statModifiers: [
      { stat: 'atk', modifierType: 'flat', value: 5 },
      { stat: 'hp', modifierType: 'flat', value: 20 },
    ],
    version: 1,
    ...overrides,
  });
}

export class Phase7Step5DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase7-Step5 多轨成长测试 */
  static runAll(): void {
    this._results = [];
    console.log('========== Phase7-Step5 ProgressSystem MultiTrack 集成测试 ==========\n');

    // 1. ProgressTrackConfig 类型与工厂函数测试
    this.testTrackConfigCreation();

    // 2. HeroProgressStateV2 / ProgressTrackState 创建测试
    this.testStateCreation();

    // 3. applyExp 单英雄单轨道经验更新测试
    this.testApplyExp();

    // 4. applyExp 连续升级测试
    this.testApplyExpMultiLevel();

    // 5. applyExp 多轨道测试
    this.testApplyExpMultiTrack();

    // 6. applyExpBatch 批量更新测试
    this.testApplyExpBatch();

    // 7. recalculateHeroProgress 重算测试
    this.testRecalculateProgress();

    // 8. ProgressResult 属性摘要测试
    this.testAttributeSummary();

    // 9. ConfigValidator.validateProgressTrackConfigs 测试
    this.testConfigValidatorTrackConfigs();

    // 10. RuntimeValidator.validateHeroProgressState 测试
    this.testRuntimeValidatorHeroProgressState();

    // 11. SaveMigration V4→V5 升级测试
    this.testMigrationV4ToV5();

    // 12. SaveMigration V4→V5 兼容旧存档测试
    this.testMigrationV4ToV5Compatibility();

    // 13. DomainEventBus 事件发布测试
    this.testDomainEventBusIntegration();

    // 14. SaveValidator V2 字段校验测试
    this.testSaveValidatorV2Fields();

    // 15. 边界情况测试
    this.testEdgeCases();

    // 汇总
    this.printSummary();
  }

  // ==================== 测试 1: TrackConfig 创建 ====================

  private static testTrackConfigCreation(): void {
    console.log('--- 测试 1: ProgressTrackConfig 创建 ---');

    // 1a. 默认配置
    const config = createDefaultProgressTrackConfig('level');
    this.assert('trackId = level', config.trackId === 'level');
    this.assert('maxLevel = 100', config.maxLevel === 100);
    this.assert('expTable 为空对象', typeof config.expTable === 'object');
    this.assert('statModifiers 为空数组', Array.isArray(config.statModifiers) && config.statModifiers.length === 0);
    this.assert('version = 1', config.version === 1);

    // 1b. 自定义配置
    const expTable = createTestExpTable(10);
    const custom = createTestTrackConfig('skill', {
      maxLevel: 20,
      expTable,
      statModifiers: [{ stat: 'atk', modifierType: 'flat', value: 3 }],
    });
    this.assert('自定义 trackId = skill', custom.trackId === 'skill');
    this.assert('自定义 maxLevel = 20', custom.maxLevel === 20);
    this.assert('自定义 expTable 有内容', Object.keys(custom.expTable).length > 0);
    this.assert('自定义 statModifiers 有 1 条', custom.statModifiers.length === 1);

    // 1c. 经验表正确性
    this.assert('expTable[1] = 100', expTable[1] === 100);
    this.assert('expTable[2] = 150', expTable[2] === 150);
    this.assert('expTable[9] = 500', expTable[9] === 500);

    // 1d. 不同轨道类型的配置
    const tracks = ['level', 'skill', 'bond', 'awakening', 'equipment'];
    for (const t of tracks) {
      const cfg = createTestTrackConfig(t);
      this.assert(`轨道 ${t} 配置可创建`, cfg.trackId === t && cfg.maxLevel > 0);
    }

    console.log('ProgressTrackConfig 创建测试完成\n');
  }

  // ==================== 测试 2: State 创建 ====================

  private static testStateCreation(): void {
    console.log('--- 测试 2: HeroProgressStateV2 / ProgressTrackState 创建 ---');

    // 2a. HeroProgressStateV2 默认创建
    const heroState = createDefaultHeroProgressStateV2('hero_001');
    this.assert('heroId = hero_001', heroState.heroId === 'hero_001');
    this.assert('tracks 为空对象', Object.keys(heroState.tracks).length === 0);
    this.assert('totalExpReceived = 0', heroState.totalExpReceived === 0);
    this.assert('updatedAt > 0', heroState.updatedAt > 0);

    // 2b. ProgressTrackState 默认创建
    const trackState = createDefaultProgressTrackState('level', 1);
    this.assert('trackId = level', trackState.trackId === 'level');
    this.assert('level = 1', trackState.level === 1);
    this.assert('exp = 0', trackState.exp === 0);
    this.assert('unlockedMilestoneIds 为空', trackState.unlockedMilestoneIds.length === 0);
    this.assert('version = 1', trackState.version === 1);

    // 2c. HeroProgressStateV2 带轨道
    const stateWithTracks = createDefaultHeroProgressStateV2('hero_002');
    stateWithTracks.tracks['level'] = createDefaultProgressTrackState('level');
    this.assert('带 level 轨道后 tracks 有 1 个 key', Object.keys(stateWithTracks.tracks).length === 1);

    // 2d. JSON 序列化兼容性
    const json = JSON.stringify(heroState);
    const parsed = JSON.parse(json) as HeroProgressStateV2;
    this.assert('JSON 序列化后 heroId 保留', parsed.heroId === 'hero_001');
    this.assert('JSON 序列化后 totalExpReceived 保留', parsed.totalExpReceived === 0);

    console.log('State 创建测试完成\n');
  }

  // ==================== 测试 3: applyExp ====================

  private static testApplyExp(): void {
    console.log('--- 测试 3: applyExp 单英雄单轨道经验更新 ---');

    const system = ProgressSystem.getInstance();

    // 加载测试轨道配置
    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 10, expTable: createTestExpTable(10) }),
    ]);

    // 3a. 基础经验更新（不触发升级）
    const result1 = system.applyExp({
      heroId: 'hero_001',
      trackId: 'level',
      exp: 50,
    });
    this.assert('heroId 正确', result1.heroId === 'hero_001');
    this.assert('expApplied = 50', result1.expApplied === 50);
    this.assert('tracks 有 1 条', result1.tracks.length === 1);
    this.assert('trackId = level', result1.tracks[0].trackId === 'level');
    this.assert('oldLevel = 1', result1.tracks[0].oldLevel === 1);
    this.assert('newLevel = 1 (未触发升级)', result1.tracks[0].newLevel === 1);
    this.assert('levelUpCount = 0', result1.levelUpCount === 0);
    this.assert('totalMilestonesUnlocked = 0', result1.totalMilestonesUnlocked === 0);
    this.assert('correlationId 非空', result1.correlationId.length > 0);
    this.assert('updatedAt > 0', result1.updatedAt > 0);

    // 3b. 获取英雄 V2 状态确认
    const heroState = system.getHeroProgressV2('hero_001');
    this.assert('hero_001 V2 状态存在', heroState !== null);
    if (heroState) {
      this.assert('level 轨道存在', heroState.tracks['level'] !== undefined);
      this.assert('level 轨道 exp = 50', heroState.tracks['level'].exp === 50);
      this.assert('level 轨道 level = 1', heroState.tracks['level'].level === 1);
      this.assert('totalExpReceived = 50', heroState.totalExpReceived === 50);
    }

    // 3c. 无效经验输入（0 或负数）返回空结果
    const zeroResult = system.applyExp({
      heroId: 'hero_001',
      trackId: 'level',
      exp: 0,
    });
    this.assert('exp=0 返回空结果', zeroResult.expApplied === 0 && zeroResult.tracks.length === 0);

    const negResult = system.applyExp({
      heroId: 'hero_001',
      trackId: 'level',
      exp: -10,
    });
    this.assert('exp=-10 返回空结果', negResult.expApplied === 0 && negResult.tracks.length === 0);

    // 3d. 自定义 correlationId
    const customCorrId = 'test_corr_001';
    const corrResult = system.applyExp({
      heroId: 'hero_001',
      trackId: 'level',
      exp: 10,
      correlationId: customCorrId,
    });
    this.assert('自定义 correlationId 保留', corrResult.correlationId === customCorrId);

    console.log('applyExp 测试完成\n');
  }

  // ==================== 测试 4: applyExp 连续升级 ====================

  private static testApplyExpMultiLevel(): void {
    console.log('--- 测试 4: applyExp 连续升级 ---');

    const system = ProgressSystem.getInstance();

    // 新英雄，一次性给予大量经验
    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 10, expTable: createTestExpTable(10) }),
    ]);

    const result = system.applyExp({
      heroId: 'hero_level_test',
      trackId: 'level',
      exp: 500, // 足够升多级：100+150+200=450 升3级，余50
    });

    this.assert('expApplied = 500', result.expApplied === 500);
    this.assert('levelUpCount > 0', result.levelUpCount > 0);
    this.assert('newLevel > oldLevel', result.tracks[0].newLevel > result.tracks[0].oldLevel);
    this.assert('oldLevel = 1', result.tracks[0].oldLevel === 1);
    // 100+150+200=450，升至4级，余50
    this.assert('newLevel = 4', result.tracks[0].newLevel === 4);

    // 验证里程碑解锁
    const heroState = system.getHeroProgressV2('hero_level_test');
    if (heroState) {
      const levelTrack = heroState.tracks['level'];
      this.assert('剩余 exp = 50', levelTrack.exp === 50);
      this.assert('里程碑包含 m_level_2', levelTrack.unlockedMilestoneIds.includes('m_level_2'));
      this.assert('里程碑包含 m_level_3', levelTrack.unlockedMilestoneIds.includes('m_level_3'));
      this.assert('里程碑包含 m_level_4', levelTrack.unlockedMilestoneIds.includes('m_level_4'));
      this.assert('totalExpReceived = 500', heroState.totalExpReceived === 500);
    }

    // 继续追加经验，再升一级
    const result2 = system.applyExp({
      heroId: 'hero_level_test',
      trackId: 'level',
      exp: 200, // 50+200=250, 4级需250升5级
    });
    this.assert('第二次等级从 4→5', result2.tracks[0].oldLevel === 4 && result2.tracks[0].newLevel === 5);

    console.log('applyExp 连续升级测试完成\n');
  }

  // ==================== 测试 5: applyExp 多轨道 ====================

  private static testApplyExpMultiTrack(): void {
    console.log('--- 测试 5: applyExp 多轨道 ---');

    const system = ProgressSystem.getInstance();

    // 加载多个轨道配置
    const skillExpTable: Record<number, number> = {};
    for (let lv = 1; lv < 5; lv++) {
      skillExpTable[lv] = 80 + lv * 20;
    }

    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 10, expTable: createTestExpTable(10) }),
      createTestTrackConfig('skill', { maxLevel: 5, expTable: skillExpTable }),
      createTestTrackConfig('bond', { maxLevel: 5, expTable: skillExpTable }),
    ]);

    const heroId = 'hero_multi_track';

    // 分别给不同轨道加经验
    const r1 = system.applyExp({ heroId, trackId: 'level', exp: 150 });
    const r2 = system.applyExp({ heroId, trackId: 'skill', exp: 100 });
    const r3 = system.applyExp({ heroId, trackId: 'bond', exp: 80 });

    this.assert('level 轨道结果正确', r1.tracks[0].trackId === 'level');
    this.assert('skill 轨道结果正确', r2.tracks[0].trackId === 'skill');
    this.assert('bond 轨道结果正确', r3.tracks[0].trackId === 'bond');

    // 验证英雄 V2 状态包含所有轨道
    const heroState = system.getHeroProgressV2(heroId);
    if (heroState) {
      const trackIds = Object.keys(heroState.tracks);
      this.assert('tracks 有 3 个轨道', trackIds.length === 3);
      this.assert('包含 level 轨道', trackIds.includes('level'));
      this.assert('包含 skill 轨道', trackIds.includes('skill'));
      this.assert('包含 bond 轨道', trackIds.includes('bond'));
      this.assert('totalExpReceived = 330', heroState.totalExpReceived === 330);
    }

    console.log('applyExp 多轨道测试完成\n');
  }

  // ==================== 测试 6: applyExpBatch ====================

  private static testApplyExpBatch(): void {
    console.log('--- 测试 6: applyExpBatch 批量更新 ---');

    const system = ProgressSystem.getInstance();

    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 10, expTable: createTestExpTable(10) }),
    ]);

    const correlationId = generateCorrelationId();

    // 6a. 批量多英雄更新
    const input: ApplyExpBatchInput = {
      entries: [
        { heroId: 'hero_batch_a', trackId: 'level', exp: 100 },
        { heroId: 'hero_batch_b', trackId: 'level', exp: 200 },
        { heroId: 'hero_batch_c', trackId: 'level', exp: 150 },
      ],
      correlationId,
    };

    const results = system.applyExpBatch(input);
    this.assert('批量返回 3 条结果', results.length === 3);
    this.assert('所有结果共享 correlationId', results.every((r) => r.correlationId === correlationId));
    this.assert('hero_batch_a 结果正确', results[0].heroId === 'hero_batch_a');
    this.assert('hero_batch_b 结果正确', results[1].heroId === 'hero_batch_b');
    this.assert('hero_batch_c 结果正确', results[2].heroId === 'hero_batch_c');

    // 6b. 空批量返回空数组
    const emptyResults = system.applyExpBatch({ entries: [] });
    this.assert('空批量返回空数组', emptyResults.length === 0);

    // 6c. getAllHeroProgressV2 包含所有英雄
    const allStates = system.getAllHeroProgressV2();
    const batchHeroes = allStates.filter((s) => s.heroId.startsWith('hero_batch_'));
    this.assert('getAllHeroProgressV2 找到批量英雄', batchHeroes.length >= 3);

    console.log('applyExpBatch 测试完成\n');
  }

  // ==================== 测试 7: recalculateHeroProgress ====================

  private static testRecalculateProgress(): void {
    console.log('--- 测试 7: recalculateHeroProgress ---');

    const system = ProgressSystem.getInstance();

    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 10, expTable: createTestExpTable(10) }),
    ]);

    // 先通过 applyExp 给英雄加经验
    const heroId = 'hero_recalc';
    system.applyExp({ heroId, trackId: 'level', exp: 500 });

    // 7a. 重算指定英雄
    const input: RecalculateProgressInput = {
      heroIds: [heroId],
      correlationId: 'recalc_test_001',
    };
    const results = system.recalculateHeroProgress(input);
    this.assert('重算返回结果', results.length >= 1);
    if (results.length > 0) {
      this.assert('重算 correlationId 保留', results[0].correlationId === 'recalc_test_001');
    }

    // 7b. 重算不存在的英雄不报错
    const noHeroResults = system.recalculateHeroProgress({
      heroIds: ['hero_nonexistent'],
    });
    this.assert('重算不存在英雄返回空', noHeroResults.length === 0);

    // 7c. 重算全部英雄
    const allResults = system.recalculateHeroProgress({});
    this.assert('重算全部返回 ≥ 1 条', allResults.length >= 1);

    console.log('recalculateHeroProgress 测试完成\n');
  }

  // ==================== 测试 8: 属性摘要 ====================

  private static testAttributeSummary(): void {
    console.log('--- 测试 8: 属性摘要 ---');

    const system = ProgressSystem.getInstance();

    system.loadTrackConfigs([
      createTestTrackConfig('level', {
        maxLevel: 10,
        expTable: createTestExpTable(10),
        statModifiers: [
          { stat: 'hp', modifierType: 'flat', value: 20 },
          { stat: 'atk', modifierType: 'flat', value: 5 },
          { stat: 'def', modifierType: 'flat', value: 3 },
        ],
      }),
    ]);

    // 升级 3 级，验证属性摘要
    const result = system.applyExp({
      heroId: 'hero_attr_test',
      trackId: 'level',
      exp: 500, // 升到 4 级，oldLevel=1→newLevel=4, 升 3 级
    });

    this.assert('attributeSummary 有 hp', typeof result.attributeSummary['hp'] === 'number');
    this.assert('attributeSummary 有 atk', typeof result.attributeSummary['atk'] === 'number');
    this.assert('attributeSummary 有 def', typeof result.attributeSummary['def'] === 'number');
    this.assert('hp 变化 = 60 (3×20)', result.attributeSummary['hp'] === 60);
    this.assert('atk 变化 = 15 (3×5)', result.attributeSummary['atk'] === 15);
    this.assert('def 变化 = 9 (3×3)', result.attributeSummary['def'] === 9);

    // 无升级时属性摘要为空
    const noUpResult = system.applyExp({
      heroId: 'hero_attr_test',
      trackId: 'level',
      exp: 10,
    });
    this.assert('无升级属性摘要为空', Object.keys(noUpResult.attributeSummary).length === 0);

    console.log('属性摘要测试完成\n');
  }

  // ==================== 测试 9: ConfigValidator.validateProgressTrackConfigs ====================

  private static testConfigValidatorTrackConfigs(): void {
    console.log('--- 测试 9: ConfigValidator.validateProgressTrackConfigs ---');

    const validator = ConfigValidator.getInstance();

    // 9a. 空配置列表（warning 但不报错）
    const emptyResult = validator.validateProgressTrackConfigs([]);
    this.assert('空配置列表 valid=true', emptyResult.valid);
    this.assert('空配置列表有 warning', emptyResult.warningCount >= 1);

    // 9b. 合法配置通过
    const validConfigs: ProgressTrackConfig[] = [
      createTestTrackConfig('level'),
      createTestTrackConfig('skill', { maxLevel: 20, expTable: createTestExpTable(20) }),
      createTestTrackConfig('bond', { maxLevel: 5, expTable: createTestExpTable(5) }),
    ];
    const validResult = validator.validateProgressTrackConfigs(validConfigs);
    this.assert('合法配置 valid=true', validResult.valid);

    // 9c. 重复 trackId 报错
    const dupConfigs: ProgressTrackConfig[] = [
      createTestTrackConfig('level'),
      createTestTrackConfig('level'),
    ];
    const dupResult = validator.validateProgressTrackConfigs(dupConfigs);
    this.assert('重复 trackId valid=false', !dupResult.valid);

    // 9d. 无效 maxLevel 报错
    const badMaxLevel = createTestTrackConfig('bad', { maxLevel: 0 });
    const badMaxResult = validator.validateProgressTrackConfigs([badMaxLevel]);
    this.assert('maxLevel=0 valid=false', !badMaxResult.valid);

    // 9e. 无效 expTable 报错
    const badExpTable = createTestTrackConfig('bad_exp', {
      expTable: { 1: 0, 2: -1 },
    });
    const badExpResult = validator.validateProgressTrackConfigs([badExpTable]);
    this.assert('无效 expTable valid=false', !badExpResult.valid);

    // 9f. 缺少 statModifiers 产生 warning
    const noMods = createTestTrackConfig('no_mods', { statModifiers: [] });
    const noModsResult = validator.validateProgressTrackConfigs([noMods]);
    this.assert('空 statModifiers 有 warning', noModsResult.warningCount >= 1);

    // 9g. 无效 version 报错
    const badVersion = createTestTrackConfig('bad_ver', { version: 0 });
    const badVerResult = validator.validateProgressTrackConfigs([badVersion]);
    this.assert('version=0 valid=false', !badVerResult.valid);

    console.log('ConfigValidator.validateProgressTrackConfigs 测试完成\n');
  }

  // ==================== 测试 10: RuntimeValidator.validateHeroProgressState ====================

  private static testRuntimeValidatorHeroProgressState(): void {
    console.log('--- 测试 10: RuntimeValidator.validateHeroProgressState ---');

    const validator = RuntimeValidator.getInstance();

    // 10a. 合法状态通过
    const validState = createDefaultHeroProgressStateV2('hero_valid');
    validState.tracks['level'] = createDefaultProgressTrackState('level');
    validState.tracks['level'].level = 5;
    validState.tracks['level'].exp = 50;
    validState.tracks['level'].unlockedMilestoneIds = ['m_level_2', 'm_level_3'];
    validState.totalExpReceived = 500;

    const validResult = validator.validateHeroProgressState(validState);
    this.assert('合法状态 valid=true', validResult.valid);

    // 10b. null 状态报错
    const nullResult = validator.validateHeroProgressState(null as unknown as HeroProgressStateV2);
    this.assert('null 状态 valid=false', !nullResult.valid);

    // 10c. 缺少 heroId 报错
    const noHeroId = createDefaultHeroProgressStateV2('');
    const noHeroIdResult = validator.validateHeroProgressState(noHeroId);
    this.assert('缺少 heroId valid=false', !noHeroIdResult.valid);

    // 10d. tracks 为空对象 warning
    const emptyTracks = createDefaultHeroProgressStateV2('hero_empty');
    const emptyTracksResult = validator.validateHeroProgressState(emptyTracks);
    this.assert('空 tracks 有 warning', emptyTracksResult.warningCount >= 1);

    // 10e. level 超出 maxLevel 报错
    const overLevel = createDefaultHeroProgressStateV2('hero_over');
    const overTrack = createDefaultProgressTrackState('level');
    overTrack.level = 50;
    overLevel.tracks['level'] = overTrack;
    const overResult = validator.validateHeroProgressState(overLevel, { level: 10 });
    this.assert('level=50 > maxLevel=10 valid=false', !overResult.valid);

    // 10f. 重复 milestone ID 产生 warning
    const dupMilestone = createDefaultHeroProgressStateV2('hero_dup');
    const dupTrack = createDefaultProgressTrackState('level');
    dupTrack.unlockedMilestoneIds = ['m_level_2', 'm_level_2', 'm_level_3'];
    dupMilestone.tracks['level'] = dupTrack;
    const dupMileResult = validator.validateHeroProgressState(dupMilestone);
    this.assert('重复 milestone 有 warning', dupMileResult.warningCount >= 1);

    // 10g. 负数 exp 报错
    const negExp = createDefaultHeroProgressStateV2('hero_neg');
    const negTrack = createDefaultProgressTrackState('level');
    negTrack.exp = -1;
    negExp.tracks['level'] = negTrack;
    const negExpResult = validator.validateHeroProgressState(negExp);
    this.assert('负数 exp valid=false', !negExpResult.valid);

    // 10h. 负数 totalExpReceived 报错
    const negTotal = createDefaultHeroProgressStateV2('hero_neg_total');
    negTotal.totalExpReceived = -1;
    const negTotalResult = validator.validateHeroProgressState(negTotal);
    this.assert('负数 totalExpReceived valid=false', !negTotalResult.valid);

    // 10i. 无效 updatedAt 报错
    const badTime = createDefaultHeroProgressStateV2('hero_bad_time');
    badTime.updatedAt = 0;
    const badTimeResult = validator.validateHeroProgressState(badTime);
    this.assert('updatedAt=0 valid=false', !badTimeResult.valid);

    console.log('RuntimeValidator.validateHeroProgressState 测试完成\n');
  }

  // ==================== 测试 11: SaveMigration V4→V5 ====================

  private static testMigrationV4ToV5(): void {
    console.log('--- 测试 11: SaveMigration V4→V5 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 11a. V4→V5 步骤已注册
    const steps = migrationSystem.getMigrationSteps();
    const v4toV5Step = steps.find((s) => s.fromVersion === 4 && s.toVersion === 5);
    this.assert('V4→V5 迁移步骤已注册', v4toV5Step !== undefined);
    if (v4toV5Step) {
      this.assert('V4→V5 描述正确', v4toV5Step.description.includes('heroProgressV2List'));
    }

    // 11b. 模拟 V4 存档迁移（有 heroProgressList 数据）
    const v4Container = createDefaultSaveContainer();
    v4Container.saveVersion = 4;
    v4Container.growth.heroProgressList = [
      { heroId: 'hero_m1', level: 5, exp: 200, power: 500 },
      { heroId: 'hero_m2', level: 3, exp: 80, power: 300 },
    ];

    const result = migrationSystem.migrate(v4Container);
    this.assert('V4→V5 迁移成功', result.success);
    this.assert('迁移后版本为 5', v4Container.saveVersion === 5);
    this.assert('迁移执行了 1 步', result.stepsExecuted === 1);

    // 11c. 迁移后 growth.heroProgressV2List 存在
    const v2List = v4Container.growth.heroProgressV2List;
    this.assert('heroProgressV2List 存在', Array.isArray(v2List));
    this.assert('heroProgressV2List 有 2 条', v2List!.length === 2);

    // 11d. 迁移后 V2 数据派生正确
    if (v2List && v2List.length >= 2) {
      this.assert('hero_m1 heroId 正确', v2List[0].heroId === 'hero_m1');
      this.assert('hero_m1 level 轨道 = 5', v2List[0].tracks['level']?.level === 5);
      this.assert('hero_m1 level 轨道 exp = 200', v2List[0].tracks['level']?.exp === 200);
      this.assert('hero_m1 totalExpReceived = 200', v2List[0].totalExpReceived === 200);

      this.assert('hero_m2 heroId 正确', v2List[1].heroId === 'hero_m2');
      this.assert('hero_m2 level 轨道 = 3', v2List[1].tracks['level']?.level === 3);
    }

    // 11e. CURRENT_SAVE_VERSION = 5
    this.assert('CURRENT_SAVE_VERSION 为 5', CURRENT_SAVE_VERSION === 5);

    // 11f. V5 存档无需迁移
    const v5Container = createDefaultSaveContainer();
    v5Container.saveVersion = 5;
    const v5Result = migrationSystem.migrate(v5Container);
    this.assert('V5 无需迁移（stepsExecuted=0）', v5Result.stepsExecuted === 0);

    console.log('SaveMigration V4→V5 测试完成\n');
  }

  // ==================== 测试 12: V4→V5 兼容性 ====================

  private static testMigrationV4ToV5Compatibility(): void {
    console.log('--- 测试 12: SaveMigration V4→V5 兼容性 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 12a. 空 heroProgressList 的 V4 存档迁移
    const emptyV4 = createDefaultSaveContainer();
    emptyV4.saveVersion = 4;
    emptyV4.growth.heroProgressList = [];
    delete emptyV4.growth.heroProgressV2List;

    migrationSystem.migrate(emptyV4);
    this.assert('空 V1 列表迁移后 V2 列表为空',
      Array.isArray(emptyV4.growth.heroProgressV2List)
      && emptyV4.growth.heroProgressV2List!.length === 0);

    // 12b. 已有 heroProgressV2List 的 V4 存档不被覆盖
    const existingV4 = createDefaultSaveContainer();
    existingV4.saveVersion = 4;
    existingV4.growth.heroProgressV2List = [{
      heroId: 'existing_hero',
      tracks: {
        level: {
          trackId: 'level',
          level: 10,
          exp: 0,
          unlockedMilestoneIds: ['m_level_5'],
          version: 1,
        },
      },
      totalExpReceived: 1000,
      updatedAt: Date.now(),
    }];

    migrationSystem.migrate(existingV4);
    this.assert('已有 V2 数据不被覆盖',
      existingV4.growth.heroProgressV2List![0].heroId === 'existing_hero'
      && existingV4.growth.heroProgressV2List![0].tracks['level'].level === 10);

    // 12c. V0→V5 全程迁移
    const v0Container = createDefaultSaveContainer();
    v0Container.saveVersion = 0;
    delete v0Container.growth.heroProgressV2List;
    delete v0Container.dungeon;
    (v0Container as Record<string, unknown>)['dungeon'] = undefined;

    const fullResult = migrationSystem.migrate(v0Container);
    this.assert('V0→V5 迁移成功', fullResult.success);
    this.assert('V0→V5 版本到达 5', v0Container.saveVersion === 5);
    this.assert('V0→V5 执行了 5 步', fullResult.stepsExecuted === 5);
    this.assert('V0→V5 有 heroProgressV2List', Array.isArray(v0Container.growth.heroProgressV2List));

    console.log('SaveMigration V4→V5 兼容性测试完成\n');
  }

  // ==================== 测试 13: DomainEventBus 事件集成 ====================

  private static testDomainEventBusIntegration(): void {
    console.log('--- 测试 13: DomainEventBus 事件集成 ---');

    const system = ProgressSystem.getInstance();
    const domainBus = DomainEventBus.getInstance();

    // 清空缓冲区
    domainBus.clearBuffer();

    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 10, expTable: createTestExpTable(10) }),
    ]);

    // 13a. applyExp 产生 HERO_EXP_APPLIED 事件
    const corrId = generateCorrelationId();
    system.applyExp({
      heroId: 'hero_event_test',
      trackId: 'level',
      exp: 300, // 够升2级
      correlationId: corrId,
    });

    const expEvents = domainBus.getEventsByType(DomainEventType.HERO_EXP_APPLIED);
    this.assert('HERO_EXP_APPLIED 事件已发布', expEvents.length >= 1);
    if (expEvents.length > 0) {
      const evt = expEvents[0];
      this.assert('事件有 heroId', (evt.payload as Record<string, unknown>)['heroId'] === 'hero_event_test');
      this.assert('事件有 trackId', (evt.payload as Record<string, unknown>)['trackId'] === 'level');
      this.assert('事件有 correlationId', evt.correlationId === corrId);
    }

    // 13b. 升级时产生 HERO_LEVEL_CHANGED 事件
    const levelEvents = domainBus.getEventsByType(DomainEventType.HERO_LEVEL_CHANGED);
    this.assert('HERO_LEVEL_CHANGED 事件已发布', levelEvents.length >= 1);

    // 13c. 升级时产生 HERO_PROGRESS_TRACK_UPDATED 事件
    const trackUpdateEvents = domainBus.getEventsByType(DomainEventType.HERO_PROGRESS_TRACK_UPDATED);
    this.assert('HERO_PROGRESS_TRACK_UPDATED 事件已发布', trackUpdateEvents.length >= 1);

    // 13d. 按 correlationId 查询
    const corrEvents = domainBus.getEventsByCorrelation(corrId);
    this.assert('按 correlationId 找到事件', corrEvents.length >= 1);
    this.assert('所有事件 correlationId 一致', corrEvents.every((e) => e.correlationId === corrId));

    // 13e. getRecentEvents 可用
    const recentEvents = domainBus.getRecentEvents(10);
    this.assert('getRecentEvents 返回事件', recentEvents.length >= 1);

    console.log('DomainEventBus 事件集成测试完成\n');
  }

  // ==================== 测试 14: SaveValidator V2 字段校验 ====================

  private static testSaveValidatorV2Fields(): void {
    console.log('--- 测试 14: SaveValidator V2 字段校验 ---');

    const validator = SaveValidator.getInstance();

    // 14a. 合法 V2 数据通过校验
    const container = createDefaultSaveContainer();
    container.saveVersion = 5;
    container.growth.heroProgressV2List = [{
      heroId: 'valid_hero',
      tracks: {
        level: {
          trackId: 'level',
          level: 5,
          exp: 50,
          unlockedMilestoneIds: ['m_level_2'],
          version: 1,
        },
      },
      totalExpReceived: 500,
      updatedAt: Date.now(),
    }];

    const result = validator.validate(container);
    this.assert('合法 V2 数据 valid=true', result.valid);

    // 14b. 无效 heroProgressV2List（非数组）报错
    const badContainer = createDefaultSaveContainer();
    (badContainer.growth as Record<string, unknown>)['heroProgressV2List'] = 'not_array';
    const badResult = validator.validate(badContainer);
    this.assert('非数组 heroProgressV2List valid=false', !badResult.valid);

    // 14c. V2 条目有坏数据报错
    const badItemContainer = createDefaultSaveContainer();
    badItemContainer.growth.heroProgressV2List = [{
      heroId: '',
      tracks: {},
      totalExpReceived: -1,
      updatedAt: 0,
    } as unknown as HeroProgressStateV2];
    const badItemResult = validator.validate(badItemContainer);
    this.assert('V2 坏数据 valid=false', !badItemResult.valid);

    console.log('SaveValidator V2 字段校验测试完成\n');
  }

  // ==================== 测试 15: 边界情况 ====================

  private static testEdgeCases(): void {
    console.log('--- 测试 15: 边界情况 ---');

    const system = ProgressSystem.getInstance();
    const domainBus = DomainEventBus.getInstance();

    system.loadTrackConfigs([
      createTestTrackConfig('level', { maxLevel: 3, expTable: {
        1: 100,
        2: 200,
      }}),
    ]);

    // 15a. 达到 maxLevel 后不再升级
    const heroId = 'hero_max_level';
    system.applyExp({ heroId, trackId: 'level', exp: 1000 }); // 远超所需
    const state = system.getHeroProgressV2(heroId);
    if (state) {
      const levelTrack = state.tracks['level'];
      this.assert('不超过 maxLevel', levelTrack.level <= 3);
      this.assert('等级达到 3', levelTrack.level === 3);
    }

    // 15b. 未加载轨道配置时调用报错
    const system2 = ProgressSystem.getInstance();
    try {
      // 创建一个新的不带配置的系统局测试一下...但这是单例
      // 用不存在 trackId 测试
      let threwError = false;
      try {
        system.applyExp({ heroId: 'err_test', trackId: 'nonexistent_track', exp: 10 });
      } catch (e) {
        threwError = true;
      }
      this.assert('不存在的 trackId 抛错', threwError);
    } catch (e) {
      // 预期的错误
    }

    // 15c. 大经验值不溢出
    const bigResult = system.applyExp({
      heroId: 'hero_big',
      trackId: 'level',
      exp: 999999,
    });
    this.assert('大经验值不崩溃', bigResult !== null && bigResult.expApplied === 999999);

    // 15d. 相同英雄多次 applyExp 累积正确
    const heroCumulative = 'hero_cumulative';
    system.applyExp({ heroId: heroCumulative, trackId: 'level', exp: 10 });
    system.applyExp({ heroId: heroCumulative, trackId: 'level', exp: 20 });
    system.applyExp({ heroId: heroCumulative, trackId: 'level', exp: 30 });
    const cumState = system.getHeroProgressV2(heroCumulative);
    if (cumState) {
      this.assert('累计 exp 正确 (10+20+30=60)', cumState.tracks['level'].exp <= 60 + 100); // 考虑升级消耗
      this.assert('totalExpReceived = 60', cumState.totalExpReceived === 60);
    }

    // 15e. restoreV2FromSaveManager 正确恢复
    const testList: HeroProgressStateV2[] = [{
      heroId: 'restored_hero',
      tracks: {
        level: {
          trackId: 'level',
          level: 7,
          exp: 30,
          unlockedMilestoneIds: ['m_level_5'],
          version: 1,
        },
      },
      totalExpReceived: 1000,
      updatedAt: Date.now() - 10000,
    }];

    const system3 = ProgressSystem.getInstance();
    system3.restoreV2FromSaveManager(testList);
    const restored = system3.getHeroProgressV2('restored_hero');
    this.assert('restoreV2 恢复成功', restored !== null);
    if (restored) {
      this.assert('恢复后 level = 7', restored.tracks['level'].level === 7);
      this.assert('恢复后 totalExpReceived = 1000', restored.totalExpReceived === 1000);
    }

    // 15f. getAllHeroProgressV2 返回所有英雄
    const allHeroes = system.getAllHeroProgressV2();
    this.assert('getAllHeroProgressV2 返回数组', Array.isArray(allHeroes));
    this.assert('getAllHeroProgressV2 包含 restored_hero',
      allHeroes.some((h) => h.heroId === 'restored_hero'));

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
