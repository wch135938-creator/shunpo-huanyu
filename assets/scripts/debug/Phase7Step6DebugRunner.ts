// ============================================================
// Phase7Step6DebugRunner — Phase7-Step6 PowerSystem Recalculate 集成测试
// 职责：验证 calculateHeroPowerV2 / calculateTeamPowerV2 / recalculateBatchFull /
//        compareFormulaVersions / Validator 扩展 / SaveMigration V5→V6 /
//        DomainEventBus 战力事件集成 / 边界情况
// 用法：在 Cocos Creator 控制台执行 Phase7Step6DebugRunner.runAll()
// ============================================================

import { PowerSystem } from '../systems/PowerSystem';
import { ConfigValidator } from '../validation/ConfigValidator';
import { RuntimeValidator } from '../validation/RuntimeValidator';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { SaveValidator } from '../save/SaveValidator';
import { DomainEventBus } from '../systems/DomainEventBus';
import { DomainEventType, generateCorrelationId } from '../data/roguelike_types';
import type { HeroProgressStateV2, PowerFormulaConfigV2 } from '../data/roguelike_types';
import type {
  HeroPowerInputV2,
  HeroPowerResult,
  TeamPowerInputV2,
  TeamPowerResult,
  PowerRecalculateBatchResult,
  FormulaCompareInput,
  FormulaCompareResult,
} from '../data/power_types';
import { createDefaultPowerFormulaSnapshot } from '../data/power_types';
import {
  createDefaultHeroProgressStateV2,
  createDefaultProgressTrackState,
} from '../data/progress_types';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
} from '../save/SaveContainer';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * 创建测试用 HeroProgressStateV2。
 */
function createTestHeroProgress(
  heroId: string,
  levelTrackLevel: number = 1,
): HeroProgressStateV2 {
  const state = createDefaultHeroProgressStateV2(heroId);
  state.tracks['level'] = {
    trackId: 'level',
    level: levelTrackLevel,
    exp: 0,
    unlockedMilestoneIds: [],
    version: 1,
  };
  return state;
}

/**
 * 创建测试用 PowerFormulaConfigV2（V1 版）。
 */
function createFormulaV1(): PowerFormulaConfigV2 {
  return {
    id: 'POWER_FORMULA_V1',
    version: 1,
    effectiveFromSaveVersion: 0,
    statWeights: {
      hp: 0.5,
      atk: 2.0,
      def: 1.0,
      speed: 0.3,
    },
    modifiers: [],
    rounding: 'round',
  };
}

/**
 * 创建测试用 PowerFormulaConfigV2（V2 版，调整了权重）。
 */
function createFormulaV2(): PowerFormulaConfigV2 {
  return {
    id: 'POWER_FORMULA_V2',
    version: 2,
    effectiveFromSaveVersion: 6,
    statWeights: {
      hp: 0.3,
      atk: 2.5,   // 攻击权重提高
      def: 0.8,   // 防御权重降低
      speed: 0.5,  // 速度权重提高
    },
    modifiers: [],
    rounding: 'round',
  };
}

/**
 * 创建带 modifiers 的公式配置（V3）。
 */
function createFormulaV3(): PowerFormulaConfigV2 {
  return {
    id: 'POWER_FORMULA_V3',
    version: 3,
    effectiveFromSaveVersion: 6,
    statWeights: {
      hp: 0.5,
      atk: 2.0,
      def: 1.0,
      speed: 0.3,
    },
    modifiers: [
      { type: 'multiply', stat: 'atk', value: 1.1 },  // 攻击修正确认
      { type: 'flat', stat: 'all', value: 10 },        // 基础值
      { type: 'cap', stat: 'all', value: 999999 },     // 上限
    ],
    rounding: 'floor',
  };
}

const DEFAULT_PLAYER_ID = 'player_001';

export class Phase7Step6DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase7-Step6 战力重算集成测试 */
  static runAll(): void {
    this._results = [];
    console.log('========== Phase7-Step6 PowerSystem Recalculate 集成测试 ==========\n');

    // 1. PowerFormulaConfigV2 加载与公式管理测试
    this.testFormulaLoading();

    // 2. calculateHeroPowerV2 单英雄战力计算测试
    this.testCalculateHeroPowerV2();

    // 3. calculateHeroPowerV2WithVersion 指定版本计算测试
    this.testCalculateHeroPowerV2WithVersion();

    // 4. calculateTeamPowerV2 团队战力计算测试
    this.testCalculateTeamPowerV2();

    // 5. recalculateBatchFull 批量重算测试
    this.testRecalculateBatchFull();

    // 6. compareFormulaVersions 公式版本对比测试
    this.testCompareFormulaVersions();

    // 7. ConfigValidator.validatePowerFormulaConfig 增强测试
    this.testConfigValidatorPowerFormula();

    // 8. RuntimeValidator.validatePowerCalculation 测试
    this.testRuntimeValidatorPowerCalculation();

    // 9. RuntimeValidator.validateTeamPowerCalculation 测试
    this.testRuntimeValidatorTeamPowerCalculation();

    // 10. RuntimeValidator.validateBatchRecalculation 测试
    this.testRuntimeValidatorBatchRecalculation();

    // 11. SaveMigration V5→V6 升级测试
    this.testMigrationV5ToV6();

    // 12. SaveMigration V5→V6 兼容性测试
    this.testMigrationV5ToV6Compatibility();

    // 13. DomainEventBus 战力事件集成测试
    this.testDomainEventBusPowerEvents();

    // 14. SaveValidator V6 字段校验测试
    this.testSaveValidatorV6Fields();

    // 15. 边界情况测试
    this.testEdgeCases();

    // 汇总
    this.printSummary();
  }

  // ==================== 测试 1: 公式加载 ====================

  private static testFormulaLoading(): void {
    console.log('--- 测试 1: PowerFormulaConfigV2 加载与公式管理 ---');

    const system = PowerSystem.getInstance();

    // 1a. 加载公式配置
    const formulas = [createFormulaV1(), createFormulaV2(), createFormulaV3()];
    system.loadFormulaConfigs(formulas);

    this.assert('isFormulaConfigsLoaded = true', system.isFormulaConfigsLoaded());
    this.assert('活跃版本为最高版本 (3)', system.getActiveFormulaVersion() === 3);

    // 1b. getFormulaConfigs 返回全部配置
    const loadedConfigs = system.getFormulaConfigs();
    this.assert('getFormulaConfigs 返回 3 条', loadedConfigs.length === 3);

    // 1c. getFormulaConfig 获取指定版本
    const formulaV1 = system.getFormulaConfig(1);
    this.assert('getFormulaConfig(1) 返回 V1', formulaV1.version === 1 && formulaV1.id === 'POWER_FORMULA_V1');

    const formulaV2 = system.getFormulaConfig(2);
    this.assert('getFormulaConfig(2) 返回 V2', formulaV2.version === 2);

    // 1d. getFormulaConfig 不提供版本号使用活跃版本
    const activeFormula = system.getFormulaConfig();
    this.assert('getFormulaConfig() 返回活跃版本 (V3)', activeFormula.version === 3);

    // 1e. getFormulaConfig 不存在的版本回退
    const fallback = system.getFormulaConfig(999);
    this.assert('getFormulaConfig(999) 回退到最后版本', fallback !== null && fallback.version >= 1);

    // 1f. 空数组加载使用默认公式
    const system2 = PowerSystem.getInstance();
    system2.loadFormulaConfigs([]);
    this.assert('空公式列表加载成功', system2.isFormulaConfigsLoaded());
    this.assert('空公式列表版本为 1', system2.getActiveFormulaVersion() === 1);

    // 恢复了原有公式
    system.loadFormulaConfigs(formulas);

    console.log('公式加载测试完成\n');
  }

  // ==================== 测试 2: calculateHeroPowerV2 ====================

  private static testCalculateHeroPowerV2(): void {
    console.log('--- 测试 2: calculateHeroPowerV2 ---');

    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    // 2a. 基础战力计算（等级 1，无装备）
    const heroProgress = createTestHeroProgress('hero_power_test', 1);
    const input: HeroPowerInputV2 = {
      heroId: 'hero_power_test',
      heroProgress,
      equipmentPower: 0,
    };
    const result = system.calculateHeroPowerV2(input);

    this.assert('heroId 正确', result.heroId === 'hero_power_test');
    this.assert('power ≥ 0', result.power >= 0);
    this.assert('formulaVersion = 3 (活跃版本)', result.formulaVersion === 3);
    this.assert('inputSummary 非空', Object.keys(result.inputSummary).length > 0);
    this.assert('outputSummary 非空', Object.keys(result.outputSummary).length > 0);
    this.assert('inputSummary 有 hp', typeof result.inputSummary['hp'] === 'number');
    this.assert('inputSummary 有 atk', typeof result.inputSummary['atk'] === 'number');

    // 2b. 高等级战力 > 低等级战力
    const lowLevelProgress = createTestHeroProgress('hero_low', 1);
    const highLevelProgress = createTestHeroProgress('hero_high', 10);

    const lowPower = system.calculateHeroPowerV2({
      heroId: 'hero_low',
      heroProgress: lowLevelProgress,
      equipmentPower: 0,
    });
    const highPower = system.calculateHeroPowerV2({
      heroId: 'hero_high',
      heroProgress: highLevelProgress,
      equipmentPower: 0,
    });

    this.assert('高等级战力 > 低等级', highPower.power > lowPower.power);

    // 2c. 装备战力影响
    const resultWithoutEquip = system.calculateHeroPowerV2({
      heroId: 'hero_equip_test',
      heroProgress: createTestHeroProgress('hero_equip_test', 5),
      equipmentPower: 0,
    });
    const resultWithEquip = system.calculateHeroPowerV2({
      heroId: 'hero_equip_test',
      heroProgress: createTestHeroProgress('hero_equip_test', 5),
      equipmentPower: 500,
    });
    this.assert('装备加成的战力 > 无装备', resultWithEquip.power > resultWithoutEquip.power);
    this.assert('装备战力差 = 500', resultWithEquip.power - resultWithoutEquip.power === 500);

    // 2d. 多轨道影响
    const multiTrackProgress = createTestHeroProgress('hero_multi', 5);
    multiTrackProgress.tracks['skill'] = { trackId: 'skill', level: 3, exp: 0, unlockedMilestoneIds: [], version: 1 };
    multiTrackProgress.tracks['bond'] = { trackId: 'bond', level: 2, exp: 0, unlockedMilestoneIds: [], version: 1 };

    const multiPower = system.calculateHeroPowerV2({
      heroId: 'hero_multi',
      heroProgress: multiTrackProgress,
      equipmentPower: 0,
    });
    this.assert('多轨道战力 ≥ 0', multiPower.power >= 0);

    console.log('calculateHeroPowerV2 测试完成\n');
  }

  // ==================== 测试 3: calculateHeroPowerV2WithVersion ====================

  private static testCalculateHeroPowerV2WithVersion(): void {
    console.log('--- 测试 3: calculateHeroPowerV2WithVersion ---');

    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    const heroProgress = createTestHeroProgress('hero_ver_test', 5);

    // 3a. V1 版本计算
    const resultV1 = system.calculateHeroPowerV2WithVersion(
      { heroId: 'hero_ver_test', heroProgress, equipmentPower: 0 },
      1,
    );
    this.assert('V1 formulaVersion = 1', resultV1.formulaVersion === 1);

    // 3b. V2 版本计算
    const resultV2 = system.calculateHeroPowerV2WithVersion(
      { heroId: 'hero_ver_test', heroProgress, equipmentPower: 0 },
      2,
    );
    this.assert('V2 formulaVersion = 2', resultV2.formulaVersion === 2);

    // 3c. V2 与 V1 战力不同（因为权重不同）
    this.assert('V2 战力 ≠ V1 战力', resultV2.power !== resultV1.power);

    // 3d. V3 版本计算（有 modifiers）
    const resultV3 = system.calculateHeroPowerV2WithVersion(
      { heroId: 'hero_ver_test', heroProgress, equipmentPower: 0 },
      3,
    );
    this.assert('V3 formulaVersion = 3', resultV3.formulaVersion === 3);
    this.assert('V3 使用 floor 取整', resultV3.power === Math.floor(resultV3.power));

    console.log('calculateHeroPowerV2WithVersion 测试完成\n');
  }

  // ==================== 测试 4: calculateTeamPowerV2 ====================

  private static testCalculateTeamPowerV2(): void {
    console.log('--- 测试 4: calculateTeamPowerV2 ---');

    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    // 4a. 多英雄团队战力计算
    const heroIds = ['hero_team_a', 'hero_team_b', 'hero_team_c'];
    const heroProgressMap: Record<string, HeroProgressStateV2> = {};
    const equipmentPowerMap: Record<string, number> = {};

    for (let i = 0; i < heroIds.length; i++) {
      heroProgressMap[heroIds[i]] = createTestHeroProgress(heroIds[i], (i + 1) * 3);
      equipmentPowerMap[heroIds[i]] = i * 100;
    }

    const input: TeamPowerInputV2 = { heroIds, heroProgressMap, equipmentPowerMap };
    const result = system.calculateTeamPowerV2(input);

    this.assert('totalPower ≥ 0', result.totalPower >= 0);
    this.assert('individualResults 有 3 条', result.individualResults.length === 3);
    this.assert('correlationId 非空', result.correlationId.length > 0);

    // 4b. 各英雄结果正确
    const heroIdsInResult = result.individualResults.map((r) => r.heroId);
    this.assert('hero_team_a 在结果中', heroIdsInResult.includes('hero_team_a'));
    this.assert('hero_team_b 在结果中', heroIdsInResult.includes('hero_team_b'));
    this.assert('hero_team_c 在结果中', heroIdsInResult.includes('hero_team_c'));

    // 4c. totalPower = 各英雄 power 之和
    const sumPower = result.individualResults.reduce((sum, r) => sum + r.power, 0);
    this.assert('totalPower = sum(individualResults.power)', result.totalPower === sumPower);

    // 4d. 缺少 heroProgress 的英雄被跳过
    const partialInput: TeamPowerInputV2 = {
      heroIds: ['hero_team_a', 'hero_nonexistent'],
      heroProgressMap: { hero_team_a: createTestHeroProgress('hero_team_a', 3) },
      equipmentPowerMap: {},
    };
    const partialResult = system.calculateTeamPowerV2(partialInput);
    this.assert('缺失英雄只计算存在的', partialResult.individualResults.length === 1);

    // 4e. 空英雄列表
    const emptyInput: TeamPowerInputV2 = {
      heroIds: [],
      heroProgressMap: {},
      equipmentPowerMap: {},
    };
    const emptyResult = system.calculateTeamPowerV2(emptyInput);
    this.assert('空列表 totalPower = 0', emptyResult.totalPower === 0);
    this.assert('空列表 individualResults 为空', emptyResult.individualResults.length === 0);

    console.log('calculateTeamPowerV2 测试完成\n');
  }

  // ==================== 测试 5: recalculateBatchFull ====================

  private static testRecalculateBatchFull(): void {
    console.log('--- 测试 5: recalculateBatchFull ---');

    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    // 5a. 批量重算
    const heroInputs: HeroPowerInputV2[] = [
      { heroId: 'hero_batch_1', heroProgress: createTestHeroProgress('hero_batch_1', 3), equipmentPower: 0 },
      { heroId: 'hero_batch_2', heroProgress: createTestHeroProgress('hero_batch_2', 5), equipmentPower: 100 },
      { heroId: 'hero_batch_3', heroProgress: createTestHeroProgress('hero_batch_3', 8), equipmentPower: 200 },
    ];

    const oldPowers = {
      'hero_batch_1': 100,
      'hero_batch_2': 200,
      'hero_batch_3': 400,
    };

    const result = system.recalculateBatchFull(heroInputs, 'manual', oldPowers, 'test_batch_corr');

    this.assert('success = true', result.success);
    this.assert('heroCount = 3', result.heroCount === 3);
    this.assert('heroResults 有 3 条', result.heroResults.length === 3);
    this.assert('newTotalPower > 0', result.newTotalPower > 0);
    this.assert('correlationId = test_batch_corr', result.correlationId === 'test_batch_corr');
    this.assert('reason = manual', result.reason === 'manual');
    this.assert('formulaVersion = 3', result.formulaVersion === 3);

    // 5b. delta 正确计算
    this.assert('有 oldTotalPower', result.oldTotalPower !== undefined && result.oldTotalPower > 0);
    this.assert('有 totalPowerDelta', result.totalPowerDelta !== undefined);
    if (result.heroResults.length > 0) {
      const heroResult1 = result.heroResults.find((r) => r.heroId === 'hero_batch_1');
      this.assert('hero_batch_1 有 delta', heroResult1 !== undefined && heroResult1.delta !== undefined);
    }

    // 5c. 空列表
    const emptyResult = system.recalculateBatchFull([], 'manual');
    this.assert('空列表 heroCount = 0', emptyResult.heroCount === 0);

    // 5d. 跳过数校验
    this.assert('skippedCount = 0', result.skippedCount === 0);
    this.assert('errors 为空', result.errors.length === 0);

    console.log('recalculateBatchFull 测试完成\n');
  }

  // ==================== 测试 6: compareFormulaVersions ====================

  private static testCompareFormulaVersions(): void {
    console.log('--- 测试 6: compareFormulaVersions ---');

    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    const heroProgress = createTestHeroProgress('hero_compare', 10);
    heroProgress.tracks['skill'] = { trackId: 'skill', level: 5, exp: 0, unlockedMilestoneIds: [], version: 1 };

    // 6a. 对比 3 个版本
    const input: FormulaCompareInput = {
      heroId: 'hero_compare',
      heroProgress,
      equipmentPower: 200,
      versions: [1, 2, 3],
    };

    const result = system.compareFormulaVersions(input);

    this.assert('heroId 正确', result.heroId === 'hero_compare');
    this.assert('versionResults 有 3 条', result.versionResults.length === 3);
    this.assert('baseInputSummary 非空', Object.keys(result.baseInputSummary).length > 0);
    this.assert('有最高版本', result.highestPowerVersion >= 1);
    this.assert('有最低版本', result.lowestPowerVersion >= 1);

    // 6b. diffs 包含版本间差异
    // 3 个版本 → C(3,2) = 3 个差异对
    this.assert('diffs 有 3 对', result.diffs.length === 3);

    // 6c. 差异对结构完整
    if (result.diffs.length > 0) {
      const diff = result.diffs[0];
      this.assert('diff 有 powerDelta', typeof diff.powerDelta === 'number');
      this.assert('diff 有 powerDeltaPercent', typeof diff.powerDeltaPercent === 'number');
      this.assert('versionA < versionB', diff.versionA < diff.versionB);
    }

    // 6d. versionResults 按版本升序排列
    for (let i = 1; i < result.versionResults.length; i++) {
      this.assert(
        `版本结果 ${i} 升序`,
        result.versionResults[i].formulaVersion > result.versionResults[i - 1].formulaVersion,
      );
    }

    // 6e. 单版本对比
    const singleInput: FormulaCompareInput = {
      heroId: 'hero_single_ver',
      heroProgress: createTestHeroProgress('hero_single_ver', 1),
      equipmentPower: 0,
      versions: [1],
    };
    const singleResult = system.compareFormulaVersions(singleInput);
    this.assert('单版本 versionResults = 1', singleResult.versionResults.length === 1);
    this.assert('单版本 diffs = 0', singleResult.diffs.length === 0);
    this.assert('单版本 highest = lowest', singleResult.highestPowerVersion === singleResult.lowestPowerVersion);

    console.log('compareFormulaVersions 测试完成\n');
  }

  // ==================== 测试 7: ConfigValidator PowerFormula ====================

  private static testConfigValidatorPowerFormula(): void {
    console.log('--- 测试 7: ConfigValidator.validatePowerFormulaConfig ---');

    const validator = ConfigValidator.getInstance();

    // 7a. 合法公式通过
    const validFormulas = [createFormulaV1(), createFormulaV2()];
    const validResult = validator.validatePowerFormulaConfig(validFormulas, 6);
    this.assert('合法公式 valid=true', validResult.valid);

    // 7b. 重复版本号报错
    const dupVersion: PowerFormulaConfigV2[] = [
      createFormulaV1(),
      { ...createFormulaV2(), version: 1 }, // 版本号冲突
    ];
    const dupResult = validator.validatePowerFormulaConfig(dupVersion);
    this.assert('重复版本号 valid=false', !dupResult.valid);

    // 7c. 版本号 < 1 报错
    const badVersion: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'BAD_VER',
      version: 0,
    };
    const badVerResult = validator.validatePowerFormulaConfig([badVersion]);
    this.assert('version=0 valid=false', !badVerResult.valid);

    // 7d. 无效取整方式报错
    const badRounding: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'BAD_ROUND',
      version: 10,
      rounding: 'truncate' as 'round',
    };
    const badRoundResult = validator.validatePowerFormulaConfig([badRounding]);
    this.assert('无效 rounding valid=false', !badRoundResult.valid);

    // 7e. 负数权重报错
    const negWeight: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'NEG_WEIGHT',
      version: 11,
      statWeights: { hp: -0.5, atk: 2.0 },
    };
    const negWeightResult = validator.validatePowerFormulaConfig([negWeight]);
    this.assert('负数权重 valid=false', !negWeightResult.valid);

    // 7f. 空 statWeights 报错
    const emptyWeights: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'EMPTY_WEIGHTS',
      version: 12,
      statWeights: {},
    };
    const emptyWeightsResult = validator.validatePowerFormulaConfig([emptyWeights]);
    this.assert('空 statWeights valid=false', !emptyWeightsResult.valid);

    // 7g. effectiveFromSaveVersion 超过存档版本产生 warning
    const futureFormula: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'FUTURE_FORMULA',
      version: 13,
      effectiveFromSaveVersion: 99,
    };
    const futureResult = validator.validatePowerFormulaConfig([futureFormula], 6);
    this.assert('futureFormula 有 warning（超前版本号）', futureResult.warningCount >= 1);

    // 7h. 未知 stat 产生 warning
    const unknownStat: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'UNKNOWN_STAT',
      version: 14,
      statWeights: { hp: 1, unknown_stat: 5 },
    };
    const unknownStatResult = validator.validatePowerFormulaConfig([unknownStat]);
    this.assert('未知 stat 有 warning', unknownStatResult.warningCount >= 1);

    // 7i. invalid modifier type 报错
    const badModifier: PowerFormulaConfigV2 = {
      ...createFormulaV1(),
      id: 'BAD_MOD',
      version: 15,
      modifiers: [{ type: 'invalid' as 'flat', stat: 'hp', value: 1 }],
    };
    const badModResult = validator.validatePowerFormulaConfig([badModifier]);
    this.assert('无效 modifier type valid=false', !badModResult.valid);

    // 7j. validatePowerFormulaConfig 别名正常工作
    const aliasResult = validator.validatePowerFormulaConfig([createFormulaV1()]);
    this.assert('validatePowerFormulaConfig 别名 valid=true', aliasResult.valid);

    console.log('ConfigValidator.validatePowerFormulaConfig 测试完成\n');
  }

  // ==================== 测试 8: RuntimeValidator PowerCalculation ====================

  private static testRuntimeValidatorPowerCalculation(): void {
    console.log('--- 测试 8: RuntimeValidator.validatePowerCalculation ---');

    const validator = RuntimeValidator.getInstance();
    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1()]);

    // 8a. 合法结果通过
    const heroResult = system.calculateHeroPowerV2({
      heroId: 'hero_validator',
      heroProgress: createTestHeroProgress('hero_validator', 5),
      equipmentPower: 100,
    });

    const validResult = validator.validatePowerCalculation(heroResult, 1);
    this.assert('合法结果 valid=true', validResult.valid);

    // 8b. null 结果报错
    const nullResult = validator.validatePowerCalculation(null as unknown as HeroPowerResult);
    this.assert('null 结果 valid=false', !nullResult.valid);

    // 8c. 缺失 heroId
    const noHeroId: HeroPowerResult = {
      heroId: '',
      power: 100,
      formulaVersion: 1,
      inputSummary: { hp: 200 },
      outputSummary: { hp: 100 },
    };
    const noHeroIdResult = validator.validatePowerCalculation(noHeroId);
    this.assert('缺失 heroId valid=false', !noHeroIdResult.valid);

    // 8d. 负数 power
    const negPower: HeroPowerResult = {
      heroId: 'hero_neg',
      power: -100,
      formulaVersion: 1,
      inputSummary: { hp: 200 },
      outputSummary: { hp: 100 },
    };
    const negPowerResult = validator.validatePowerCalculation(negPower);
    this.assert('负数 power valid=false', !negPowerResult.valid);

    // 8e. formulaVersion 与活跃版本不一致 warning
    const mismatchVer: HeroPowerResult = {
      heroId: 'hero_mismatch',
      power: 100,
      formulaVersion: 5,  // 活跃版本是 1
      inputSummary: { hp: 200 },
      outputSummary: { hp: 100 },
    };
    const mismatchResult = validator.validatePowerCalculation(mismatchVer, 1);
    this.assert('版本不一致有 warning', mismatchResult.warningCount >= 1);

    // 8f. 空 inputSummary warning
    const emptyInput: HeroPowerResult = {
      heroId: 'hero_empty_input',
      power: 100,
      formulaVersion: 1,
      inputSummary: {},
      outputSummary: { hp: 100 },
    };
    const emptyInputResult = validator.validatePowerCalculation(emptyInput);
    this.assert('空 inputSummary 有 warning', emptyInputResult.warningCount >= 1);

    // 8g. 有效 delta
    const withDelta: HeroPowerResult = {
      heroId: 'hero_delta',
      power: 500,
      formulaVersion: 1,
      inputSummary: { hp: 200 },
      outputSummary: { hp: 100 },
      delta: 50,
    };
    const deltaResult = validator.validatePowerCalculation(withDelta);
    this.assert('有效 delta valid=true', deltaResult.valid);

    // 8h. 异常大 power warning
    const hugePower: HeroPowerResult = {
      heroId: 'hero_huge',
      power: 999999999,
      formulaVersion: 1,
      inputSummary: { hp: 999999 },
      outputSummary: { hp: 999999 },
    };
    const hugePowerResult = validator.validatePowerCalculation(hugePower);
    this.assert('过大 power 有 warning', hugePowerResult.warningCount >= 1);

    console.log('RuntimeValidator.validatePowerCalculation 测试完成\n');
  }

  // ==================== 测试 9: RuntimeValidator TeamPowerCalculation ====================

  private static testRuntimeValidatorTeamPowerCalculation(): void {
    console.log('--- 测试 9: RuntimeValidator.validateTeamPowerCalculation ---');

    const validator = RuntimeValidator.getInstance();
    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1()]);

    // 9a. 合法团队结果通过
    const heroIds = ['hero_tv_a', 'hero_tv_b'];
    const heroProgressMap: Record<string, HeroProgressStateV2> = {
      'hero_tv_a': createTestHeroProgress('hero_tv_a', 3),
      'hero_tv_b': createTestHeroProgress('hero_tv_b', 5),
    };
    const equipmentPowerMap: Record<string, number> = {
      'hero_tv_a': 50,
      'hero_tv_b': 100,
    };

    const teamResult = system.calculateTeamPowerV2({ heroIds, heroProgressMap, equipmentPowerMap });
    const validResult = validator.validateTeamPowerCalculation(teamResult);
    this.assert('合法团队结果 valid=true', validResult.valid);

    // 9b. null 结果报错
    const nullResult = validator.validateTeamPowerCalculation(null as unknown as TeamPowerResult);
    this.assert('null 团队结果 valid=false', !nullResult.valid);

    // 9c. 缺失 correlationId
    const noCorrId: TeamPowerResult = {
      totalPower: 100,
      individualResults: [],
      correlationId: '',
    };
    const noCorrIdResult = validator.validateTeamPowerCalculation(noCorrId);
    this.assert('缺失 correlationId valid=false', !noCorrIdResult.valid);

    // 9d. totalPower 与 individualResults 不匹配 warning
    const mismatch: TeamPowerResult = {
      totalPower: 999999,
      individualResults: [
        { heroId: 'h1', power: 100, formulaVersion: 1, inputSummary: {}, outputSummary: {} },
      ],
      correlationId: generateCorrelationId(),
    };
    const mismatchResult = validator.validateTeamPowerCalculation(mismatch);
    this.assert('战力不匹配有 warning', mismatchResult.warningCount >= 1);

    console.log('RuntimeValidator.validateTeamPowerCalculation 测试完成\n');
  }

  // ==================== 测试 10: RuntimeValidator BatchRecalculation ====================

  private static testRuntimeValidatorBatchRecalculation(): void {
    console.log('--- 测试 10: RuntimeValidator.validateBatchRecalculation ---');

    const validator = RuntimeValidator.getInstance();

    // 10a. 合法批量结果通过
    const validBatch: PowerRecalculateBatchResult = {
      success: true,
      heroCount: 2,
      heroResults: [
        { heroId: 'h1', power: 200, formulaVersion: 1, inputSummary: { hp: 100 }, outputSummary: { hp: 50 } },
        { heroId: 'h2', power: 300, formulaVersion: 1, inputSummary: { hp: 150 }, outputSummary: { hp: 75 } },
      ],
      newTotalPower: 500,
      skippedCount: 0,
      skippedHeroIds: [],
      errors: [],
      formulaVersion: 1,
      correlationId: generateCorrelationId(),
      reason: 'manual',
    };
    const validResult = validator.validateBatchRecalculation(validBatch);
    this.assert('合法批量结果 valid=true', validResult.valid);

    // 10b. null 结果报错
    const nullResult = validator.validateBatchRecalculation(null as unknown as PowerRecalculateBatchResult);
    this.assert('null 批量结果 valid=false', !nullResult.valid);

    // 10c. heroCount 不一致 warning
    const mismatchCount = { ...validBatch, heroCount: 99 };
    const mismatchCountResult = validator.validateBatchRecalculation(mismatchCount);
    this.assert('heroCount 不一致有 warning', mismatchCountResult.warningCount >= 1);

    // 10d. 负数 totalPower 报错
    const negTotal = { ...validBatch, newTotalPower: -100 };
    const negTotalResult = validator.validateBatchRecalculation(negTotal);
    this.assert('负数 newTotalPower valid=false', !negTotalResult.valid);

    // 10e. 缺失 correlationId 报错
    const noCorrBatch = { ...validBatch, correlationId: '' };
    const noCorrBatchResult = validator.validateBatchRecalculation(noCorrBatch);
    this.assert('缺失 correlationId valid=false', !noCorrBatchResult.valid);

    console.log('RuntimeValidator.validateBatchRecalculation 测试完成\n');
  }

  // ==================== 测试 11: SaveMigration V5→V6 ====================

  private static testMigrationV5ToV6(): void {
    console.log('--- 测试 11: SaveMigration V5→V6 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 11a. V5→V6 步骤已注册
    const steps = migrationSystem.getMigrationSteps();
    const v5toV6Step = steps.find((s) => s.fromVersion === 5 && s.toVersion === 6);
    this.assert('V5→V6 迁移步骤已注册', v5toV6Step !== undefined);
    if (v5toV6Step) {
      this.assert('V5→V6 描述正确', v5toV6Step.description.includes('powerFormulaSnapshot'));
    }

    // 11b. 模拟 V5 存档迁移
    const v5Container = createDefaultSaveContainer();
    v5Container.saveVersion = 5;
    delete v5Container.powerFormulaSnapshot;

    const result = migrationSystem.migrate(v5Container);

    this.assert('V5→V6 迁移成功', result.success);
    this.assert('迁移后版本为 6', v5Container.saveVersion === 6);
    this.assert('迁移执行了 1 步', result.stepsExecuted === 1);
    this.assert('needsPowerRecalc = true', result.needsPowerRecalc);

    // 11c. 迁移后 powerFormulaSnapshot 存在
    const snapshot = v5Container.powerFormulaSnapshot;
    this.assert('powerFormulaSnapshot 存在', snapshot !== undefined);
    if (snapshot) {
      this.assert('activeFormulaVersion = 1', snapshot.activeFormulaVersion === 1);
      this.assert('formulas 有内容', Array.isArray(snapshot.formulas) && snapshot.formulas.length > 0);
      this.assert('savedAt > 0', snapshot.savedAt > 0);
    }

    // 11d. CURRENT_SAVE_VERSION = 6
    this.assert('CURRENT_SAVE_VERSION 为 6', CURRENT_SAVE_VERSION === 6);

    // 11e. V6 存档无需迁移
    const v6Container = createDefaultSaveContainer();
    v6Container.saveVersion = 6;
    const v6Result = migrationSystem.migrate(v6Container);
    this.assert('V6 无需迁移（stepsExecuted=0）', v6Result.stepsExecuted === 0);

    console.log('SaveMigration V5→V6 测试完成\n');
  }

  // ==================== 测试 12: V5→V6 兼容性 ====================

  private static testMigrationV5ToV6Compatibility(): void {
    console.log('--- 测试 12: SaveMigration V5→V6 兼容性 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    migrationSystem.registerDefaultSteps();

    // 12a. 无 heroProgressList 的 V5 存档
    const emptyV5 = createDefaultSaveContainer();
    emptyV5.saveVersion = 5;
    emptyV5.growth.heroProgressList = [];
    delete emptyV5.powerFormulaSnapshot;

    migrationSystem.migrate(emptyV5);
    this.assert('空 heroProgressList 迁移成功', emptyV5.saveVersion === 6);
    this.assert('powerFormulaSnapshot 已创建', emptyV5.powerFormulaSnapshot !== undefined);

    // 12b. 已有部分 powerFormulaSnapshot 数据被补全
    const partialV5 = createDefaultSaveContainer();
    partialV5.saveVersion = 5;
    partialV5.powerFormulaSnapshot = {
      activeFormulaVersion: 0,  // invalid
      formulas: [],              // empty
      savedAt: 0,                // invalid
    };
    migrationSystem.migrate(partialV5);
    this.assert('补全后 activeFormulaVersion = 1', partialV5.powerFormulaSnapshot!.activeFormulaVersion === 1);
    this.assert('补全后 formulas 非空', partialV5.powerFormulaSnapshot!.formulas.length > 0);
    this.assert('补全后 savedAt > 0', partialV5.powerFormulaSnapshot!.savedAt > 0);

    // 12c. V0→V6 全程迁移
    const v0Container = createDefaultSaveContainer();
    v0Container.saveVersion = 0;
    delete v0Container.powerFormulaSnapshot;
    delete v0Container.growth.heroProgressV2List;
    (v0Container as Record<string, unknown>)['dungeon'] = undefined;

    const fullResult = migrationSystem.migrate(v0Container);
    this.assert('V0→V6 迁移成功', fullResult.success);
    this.assert('V0→V6 版本到达 6', v0Container.saveVersion === 6);
    this.assert('V0→V6 执行了 6 步', fullResult.stepsExecuted === 6);
    this.assert('V0→V6 有 powerFormulaSnapshot', v0Container.powerFormulaSnapshot !== undefined);
    this.assert('V0→V6 有 heroProgressV2List', Array.isArray(v0Container.growth.heroProgressV2List));

    // 12d. V5 存档带完整 heroProgressList 迁移后可标记重算
    const v5WithHeroes = createDefaultSaveContainer();
    v5WithHeroes.saveVersion = 5;
    delete v5WithHeroes.powerFormulaSnapshot;
    v5WithHeroes.growth.heroProgressList = [
      { heroId: 'hero_a', level: 10, exp: 1000, power: 5000 },
      { heroId: 'hero_b', level: 5, exp: 200, power: 2000 },
    ];

    migrationSystem.migrate(v5WithHeroes);
    this.assert('迁移后版本 6', v5WithHeroes.saveVersion === 6);
    this.assert('powerFormulaSnapshot 存在', v5WithHeroes.powerFormulaSnapshot !== undefined);
    // heroProgressList 中的英雄被标记为需要重算
    if (v5WithHeroes.growth.heroProgressList.length > 0) {
      const hp = v5WithHeroes.growth.heroProgressList[0] as Record<string, unknown>;
      this.assert('heroProgressList 有 __powerFormulaVersion 标记',
        hp['__powerFormulaVersion'] !== undefined);
    }

    console.log('SaveMigration V5→V6 兼容性测试完成\n');
  }

  // ==================== 测试 13: DomainEventBus 战力事件 ====================

  private static testDomainEventBusPowerEvents(): void {
    console.log('--- 测试 13: DomainEventBus 战力事件集成 ---');

    const system = PowerSystem.getInstance();
    const domainBus = DomainEventBus.getInstance();

    system.loadFormulaConfigs([createFormulaV1()]);

    // 清空缓冲区
    domainBus.clearBuffer();

    // 13a. calculateHeroPowerV2 产生 HERO_POWER_RECALCULATED 事件
    system.calculateHeroPowerV2({
      heroId: 'hero_event',
      heroProgress: createTestHeroProgress('hero_event', 5),
      equipmentPower: 200,
    });

    const powerEvents = domainBus.getEventsByType(DomainEventType.HERO_POWER_RECALCULATED);
    this.assert('HERO_POWER_RECALCULATED 事件已发布', powerEvents.length >= 1);

    if (powerEvents.length > 0) {
      const evt = powerEvents[0];
      const payload = evt.payload as Record<string, unknown>;
      this.assert('事件有 heroId', payload['heroId'] === 'hero_event');
      this.assert('事件有 power', typeof payload['power'] === 'number');
      this.assert('事件有 formulaVersion', typeof payload['formulaVersion'] === 'number');
    }

    // 13b. calculateTeamPowerV2 也产生事件
    const teamHeroIds = ['hero_tevent_1', 'hero_tevent_2'];
    const teamHeroProgressMap: Record<string, HeroProgressStateV2> = {
      'hero_tevent_1': createTestHeroProgress('hero_tevent_1', 3),
      'hero_tevent_2': createTestHeroProgress('hero_tevent_2', 4),
    };

    const preTeamEventCount = domainBus.getTotalEventCount();
    system.calculateTeamPowerV2({
      heroIds: teamHeroIds,
      heroProgressMap: teamHeroProgressMap,
      equipmentPowerMap: {},
    });
    const postTeamEventCount = domainBus.getTotalEventCount();
    this.assert('团队计算发布事件', postTeamEventCount > preTeamEventCount);

    // 13c. recalculateBatchFull 使用 correlationId 追踪
    const corrId = generateCorrelationId();
    system.recalculateBatchFull(
      [
        { heroId: 'hero_corr', heroProgress: createTestHeroProgress('hero_corr', 3), equipmentPower: 0 },
      ],
      'formula_version_change',
      undefined,
      corrId,
    );

    const corrEvents = domainBus.getEventsByCorrelation(corrId);
    this.assert('按 correlationId 找到事件', corrEvents.length >= 1);

    // 13d. getRecentEvents 可用
    const recentEvents = domainBus.getRecentEvents(10);
    this.assert('getRecentEvents 返回事件', recentEvents.length >= 1);

    console.log('DomainEventBus 战力事件集成测试完成\n');
  }

  // ==================== 测试 14: SaveValidator V6 字段 ====================

  private static testSaveValidatorV6Fields(): void {
    console.log('--- 测试 14: SaveValidator V6 字段校验 ---');

    const validator = SaveValidator.getInstance();

    // 14a. V6 合法容器通过
    const container = createDefaultSaveContainer();
    container.saveVersion = 6;
    const result = validator.validate(container);
    this.assert('V6 合法容器 valid=true', result.valid);

    // 14b. V6 powerFormulaSnapshot 存在
    const powerSnapshot = container.powerFormulaSnapshot;
    this.assert('创建时有 powerFormulaSnapshot', powerSnapshot !== undefined);

    // 14c. saveVersion 高于 CURRENT_SAVE_VERSION warning
    const futureContainer = createDefaultSaveContainer();
    futureContainer.saveVersion = 99;
    const futureResult = validator.validate(futureContainer);
    const versionWarnings = futureResult.issues.filter(
      (i) => i.path === 'saveVersion' && i.severity === 'warning',
    );
    this.assert('超出版本号有 warning', versionWarnings.length >= 1);

    console.log('SaveValidator V6 字段校验测试完成\n');
  }

  // ==================== 测试 15: 边界情况 ====================

  private static testEdgeCases(): void {
    console.log('--- 测试 15: 边界情况 ---');

    const system = PowerSystem.getInstance();
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    // 15a. 极高等级英雄
    const highLevel = createTestHeroProgress('hero_lv1000', 1000);
    highLevel.tracks['skill'] = { trackId: 'skill', level: 100, exp: 0, unlockedMilestoneIds: [], version: 1 };

    const highResult = system.calculateHeroPowerV2({
      heroId: 'hero_lv1000',
      heroProgress: highLevel,
      equipmentPower: 99999,
    });
    this.assert('Lv1000 不崩溃', highResult !== null);
    this.assert('Lv1000 power ≥ 0', highResult.power >= 0);

    // 15b. 大量英雄批量重算
    const manyHeroes: HeroPowerInputV2[] = [];
    const manyOldPowers: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      const heroId = `hero_mass_${i}`;
      manyHeroes.push({
        heroId,
        heroProgress: createTestHeroProgress(heroId, (i % 20) + 1),
        equipmentPower: i * 10,
      });
      manyOldPowers[heroId] = 100 + i * 10;
    }

    const batchResult = system.recalculateBatchFull(manyHeroes, 'migration', manyOldPowers);
    this.assert('50 英雄批量重算成功', batchResult.success);
    this.assert('50 英雄 heroCount = 50', batchResult.heroCount === 50);
    this.assert('50 英雄 newTotalPower > 0', batchResult.newTotalPower > 0);

    // 15c. 无轨道的英雄
    const noTrackProgress = createDefaultHeroProgressStateV2('hero_no_track');
    const noTrackResult = system.calculateHeroPowerV2({
      heroId: 'hero_no_track',
      heroProgress: noTrackProgress,
      equipmentPower: 0,
    });
    this.assert('无轨道英雄不崩溃', noTrackResult !== null && noTrackResult.power >= 0);

    // 15d. 负数装备战力被忽略
    const negEquipResult = system.calculateHeroPowerV2({
      heroId: 'hero_neg_equip',
      heroProgress: createTestHeroProgress('hero_neg_equip', 5),
      equipmentPower: -500,
    });
    // 负数装备战力被 max(0, ...) 处理
    this.assert('负数装备战力 power ≥ 0', negEquipResult.power >= 0);

    // 15e. restoreFormulaConfigsFromSnapshot
    system.restoreFormulaConfigsFromSnapshot([createFormulaV1()], 1);
    this.assert('restore 后活跃版本 = 1', system.getActiveFormulaVersion() === 1);
    this.assert('restore 后 isLoaded = true', system.isFormulaConfigsLoaded());

    // 恢复
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

    // 15f. 空公式快照恢复
    system.restoreFormulaConfigsFromSnapshot([], 0);
    this.assert('空快照恢复后版本 = 1', system.getActiveFormulaVersion() === 1);

    // 15g. 公式对比大差异
    const bigCompareInput: FormulaCompareInput = {
      heroId: 'hero_big_diff',
      heroProgress: createTestHeroProgress('hero_big_diff', 50),
      equipmentPower: 5000,
      versions: [1, 2, 3],
    };
    const bigCompare = system.compareFormulaVersions(bigCompareInput);
    this.assert('大差异对比不崩溃', bigCompare.versionResults.length === 3);

    // 恢复默认公式
    system.loadFormulaConfigs([createFormulaV1(), createFormulaV2(), createFormulaV3()]);

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

    console.log('\n========== Phase7-Step6 测试汇总 ==========');
    console.log(`总计: ${total} | 通过: ${passed} | 失败: ${total - passed}`);
    console.log(`结果: ${allPassed ? '🎉 全部通过!' : '⚠️ 存在失败项'}`);
    console.log('===========================================\n');
  }
}
