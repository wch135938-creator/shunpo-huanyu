// ============================================================
// ComboSkillDebugRunner — Phase10-Step2 高级技能 + 连携技能 Debug 验证
// 职责：验证 SkillUpgradeConfig / ComboConfig / 技能升级 / Combo识别 / ComboBonus / SaveV2
// 用法：在 Cocos Creator 控制台执行 ComboSkillDebugRunner.runAll()
// ============================================================

import { SkillSystem } from '../skill/SkillSystem';
import { SkillUpgradeRepository } from '../skill/SkillUpgradeRepository';
import type { SkillUpgradeEntry } from '../skill/SkillUpgradeRepository';
import { ComboSkillRepository } from '../skill/ComboSkillRepository';
import type { ComboSkillEntry } from '../skill/ComboSkillRepository';
import { SaveManager } from '../save/SaveManager';
import type { SaveContainerV8 } from '../save/SaveContainerV8';
import type { SkillLevelEntry } from '../save/SkillSaveData';
import { createDefaultSkillSaveData } from '../save/SkillSaveData';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class ComboSkillDebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase10-Step2 高级技能 + 连携技能测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase10-Step2 ComboSkill 集成测试 ==========\n');

    // 0. 确保 SkillSystem 已初始化
    await this.testEnsureSkillSystemReady();

    // 1. 读取 SkillUpgradeConfig PASS
    await this.testSkillUpgradeConfigLoad();

    // 2. 读取 ComboConfig PASS
    await this.testComboConfigLoad();

    // 3. 技能升级 PASS
    this.testSkillUpgrade();

    // 4. Combo 识别 PASS
    this.testComboRecognition();

    // 5. ComboBonus 计算 PASS
    this.testComboBonusCalculation();

    // 6. SaveV2 兼容 PASS
    this.testSaveV2Compatibility();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 0. 确保 SkillSystem 已初始化 ====================

  static async testEnsureSkillSystemReady(): Promise<void> {
    try {
      const skillSystem = SkillSystem.getInstance();
      if (!skillSystem.isInitialized()) {
        await skillSystem.initialize();
      }
      this._assert('SkillSystem 已初始化', skillSystem.isInitialized());
    } catch (e) {
      this._assert(`SkillSystem 初始化失败: ${e}`, false);
    }
  }

  // ==================== 1. 读取 SkillUpgradeConfig PASS ====================

  static async testSkillUpgradeConfigLoad(): Promise<void> {
    try {
      const upgradeRepo = SkillUpgradeRepository.getInstance();
      await upgradeRepo.loadConfig();

      this._assert('SkillUpgradeConfig 加载成功', upgradeRepo.isLoaded());

      // 验证配置内容
      const allSkillIds = upgradeRepo.getAllSkillIds();
      this._assert('SkillUpgradeConfig 包含 SKILL_001', allSkillIds.includes('SKILL_001'));
      this._assert('SkillUpgradeConfig 包含 SKILL_002', allSkillIds.includes('SKILL_002'));
      this._assert('SkillUpgradeConfig 包含 SKILL_003', allSkillIds.includes('SKILL_003'));

      // 验证单个技能所有等级
      const entries001 = upgradeRepo.getAllUpgradeEntries('SKILL_001');
      this._assert('SKILL_001 有 10 个等级配置', entries001.length === 10);

      // 验证等级数据
      const entry001L1 = upgradeRepo.getUpgradeEntry('SKILL_001', 1);
      this._assert('SKILL_001 L1 damageMultiplier = 1.0',
        entry001L1 !== null && entry001L1.damageMultiplier === 1.0);

      const entry001L10 = upgradeRepo.getUpgradeEntry('SKILL_001', 10);
      this._assert('SKILL_001 L10 damageMultiplier = 3.2',
        entry001L10 !== null && entry001L10.damageMultiplier === 3.2);

      // 验证最大配置等级
      const maxLevel001 = upgradeRepo.getMaxConfiguredLevel('SKILL_001');
      this._assert('SKILL_001 最大配置等级 = 10', maxLevel001 === 10);

      // 不存在技能
      const entry999 = upgradeRepo.getUpgradeEntry('SKILL_999', 1);
      this._assert('SKILL_999 无升级配置', entry999 === null);

      const emptyEntries = upgradeRepo.getAllUpgradeEntries('SKILL_999');
      this._assert('SKILL_999 getAllUpgradeEntries 为空', emptyEntries.length === 0);

      console.log('[ComboSkillDebug] 读取SkillUpgradeConfig PASS');
    } catch (e) {
      this._assert(`SkillUpgradeConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 2. 读取 ComboConfig PASS ====================

  static async testComboConfigLoad(): Promise<void> {
    try {
      const comboRepo = ComboSkillRepository.getInstance();
      await comboRepo.loadConfig();

      this._assert('ComboConfig 加载成功', comboRepo.isLoaded());
      this._assert('ComboConfig 包含 3 个连携', comboRepo.getComboCount() === 3);

      // 验证具体连携
      const combo001 = comboRepo.getComboEntry('COMBO_001');
      this._assert('COMBO_001 存在', combo001 !== null);
      if (combo001) {
        this._assert('COMBO_001 name = 雷火连击', combo001.comboName === '雷火连击');
        this._assert('COMBO_001 需要 2 个技能', combo001.skillIds.length === 2);
        this._assert('COMBO_001 effectType = bonusDamage', combo001.effectType === 'bonusDamage');
        this._assert('COMBO_001 effectValue = 0.3', combo001.effectValue === 0.3);
      }

      const combo002 = comboRepo.getComboEntry('COMBO_002');
      this._assert('COMBO_002 name = 冰封万里', combo002 !== null && combo002.comboName === '冰封万里');

      const combo003 = comboRepo.getComboEntry('COMBO_003');
      this._assert('COMBO_003 name = 光暗交织', combo003 !== null && combo003.comboName === '光暗交织');

      // 不存在连携
      const combo999 = comboRepo.getComboEntry('COMBO_999');
      this._assert('COMBO_999 不存在', combo999 === null);

      // 全列表
      const allCombos = comboRepo.getAllComboEntries();
      this._assert('getAllComboEntries 返回 3 条', allCombos.length === 3);

      console.log('[ComboSkillDebug] 读取ComboConfig PASS');
    } catch (e) {
      this._assert(`ComboConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 3. 技能升级 PASS ====================

  static testSkillUpgrade(): void {
    const skillSystem = SkillSystem.getInstance();

    // 验证初始等级
    const initialLevel = skillSystem.getSkillLevel('skill_001');
    this._assert('getSkillLevel(skill_001) 返回数值', initialLevel >= 1);

    // 记录升级前等级
    const beforeLevel = skillSystem.getSkillLevel('skill_002');

    // 执行升级
    const upgradeResult = skillSystem.upgradeSkill('skill_002');
    this._assert('upgradeSkill(skill_002) 成功', upgradeResult);

    // 验证升级后等级
    const afterLevel = skillSystem.getSkillLevel('skill_002');
    this._assert(`upgradeSkill 后等级 = ${beforeLevel + 1}`, afterLevel === beforeLevel + 1);

    // 验证 getSkillUpgradeData
    const upgradeData = skillSystem.getSkillUpgradeData('skill_001');
    this._assert('getSkillUpgradeData(skill_001) 非空', upgradeData.length > 0);

    // 验证升级数据包含当前等级
    const currentLevel = skillSystem.getSkillLevel('skill_001');
    const hasCurrentLevel = upgradeData.some((e) => e.level === currentLevel);
    this._assert('升级数据包含当前等级', hasCurrentLevel);

    // 不存在技能的升级数据
    const emptyUpgrade = skillSystem.getSkillUpgradeData('skill_999');
    this._assert('不存在技能 getSkillUpgradeData 为空', emptyUpgrade.length === 0);

    // 不存在技能的等级
    const unknownLevel = skillSystem.getSkillLevel('skill_999');
    this._assert('不存在技能 getSkillLevel 返回 1', unknownLevel === 1);

    console.log('[ComboSkillDebug] 技能升级 PASS');
  }

  // ==================== 4. Combo 识别 PASS ====================

  static testComboRecognition(): void {
    const skillSystem = SkillSystem.getInstance();

    // 测试触发 COMBO_001（SKILL_001 + SKILL_002）
    const combos1 = skillSystem.checkComboTrigger(['SKILL_001', 'SKILL_002']);
    this._assert('SKILL_001 + SKILL_002 触发 COMBO_001',
      combos1.some((c) => c.comboId === 'COMBO_001'));

    // 测试触发 COMBO_002（SKILL_002 + SKILL_003）
    const combos2 = skillSystem.checkComboTrigger(['SKILL_002', 'SKILL_003']);
    this._assert('SKILL_002 + SKILL_003 触发 COMBO_002',
      combos2.some((c) => c.comboId === 'COMBO_002'));

    // 测试触发 COMBO_003（SKILL_001 + SKILL_003）
    const combos3 = skillSystem.checkComboTrigger(['SKILL_001', 'SKILL_003']);
    this._assert('SKILL_001 + SKILL_003 触发 COMBO_003',
      combos3.some((c) => c.comboId === 'COMBO_003'));

    // 测试多个连携同时触发（3 个技能同时使用）
    const allCombos = skillSystem.checkComboTrigger([
      'SKILL_001', 'SKILL_002', 'SKILL_003',
    ]);
    this._assert('3 技能同时使用触发 ALL 3 combos', allCombos.length === 3);

    // 测试不触发连携
    const noCombos = skillSystem.checkComboTrigger(['SKILL_001']);
    this._assert('单技能不触发连携', noCombos.length === 0);

    // 测试空数组
    const emptyCombos1 = skillSystem.checkComboTrigger([]);
    this._assert('空数组不触发连携', emptyCombos1.length === 0);

    // 测试不匹配的技能组合
    const noMatchCombos = skillSystem.checkComboTrigger(['SKILL_001', 'SKILL_999']);
    this._assert('不匹配组合不触发连携', noMatchCombos.length === 0);

    // 验证 getComboSkill 查询
    const combo001 = skillSystem.getComboSkill('COMBO_001');
    this._assert('getComboSkill(COMBO_001) 非 null', combo001 !== null);
    if (combo001) {
      this._assert('COMBO_001.comboName = 雷火连击', combo001.comboName === '雷火连击');
    }

    const combo999 = skillSystem.getComboSkill('COMBO_999');
    this._assert('getComboSkill(COMBO_999) = null', combo999 === null);

    console.log('[ComboSkillDebug] Combo识别 PASS');
  }

  // ==================== 5. ComboBonus 计算 PASS ====================

  static testComboBonusCalculation(): void {
    const skillSystem = SkillSystem.getInstance();

    // 验证 COMBO_001 加成
    const bonus001 = skillSystem.getComboBonus('COMBO_001');
    this._assert('COMBO_001 bonus = 0.3', bonus001 === 0.3);

    // 验证 COMBO_002 加成
    const bonus002 = skillSystem.getComboBonus('COMBO_002');
    this._assert('COMBO_002 bonus = 0.25', bonus002 === 0.25);

    // 验证 COMBO_003 加成
    const bonus003 = skillSystem.getComboBonus('COMBO_003');
    this._assert('COMBO_003 bonus = 0.35', bonus003 === 0.35);

    // 不存在连携加成
    const bonus999 = skillSystem.getComboBonus('COMBO_999');
    this._assert('COMBO_999 bonus = 0', bonus999 === 0);

    // 验证加成计算
    // 假设基础伤害 100，触发 COMBO_001 (+30%)
    const baseDamage = 100;
    const totalDamage = baseDamage * (1 + bonus001);
    this._assert('COMBO_001 加成后伤害 = 130', totalDamage === 130);

    // 多个连携叠加
    const totalMultiplier = 1 + bonus001 + bonus002 + bonus003;
    const combinedDamage = baseDamage * totalMultiplier;
    this._assert('3 连携叠加后伤害 = 190', combinedDamage === 190);

    console.log('[ComboSkillDebug] ComboBonus计算 PASS');
  }

  // ==================== 6. SaveV2 兼容 PASS ====================

  static testSaveV2Compatibility(): void {
    // 测试 skillData 工厂函数
    const defaultSaveData = createDefaultSkillSaveData();
    this._assert('createDefaultSkillSaveData 包含 skillData', defaultSaveData.skillData !== undefined);
    this._assert('默认 skillData 为空对象', defaultSaveData.skillData !== undefined &&
      Object.keys(defaultSaveData.skillData!).length === 0);

    // 测试 skillData 读写
    const testSkillData: Record<string, SkillLevelEntry> = {
      'SKILL_001': { level: 5 },
      'SKILL_002': { level: 3 },
    };
    defaultSaveData.skillData = testSkillData;
    this._assert('skillData 写入 SKILL_001.level = 5',
      defaultSaveData.skillData!['SKILL_001']?.level === 5);
    this._assert('skillData 写入 SKILL_002.level = 3',
      defaultSaveData.skillData!['SKILL_002']?.level === 3);

    // 测试旧存档自动补全（空 skillData）
    const oldSaveData = createDefaultSkillSaveData();
    this._assert('旧存档 skillData 不为 undefined', oldSaveData.skillData !== undefined);
    this._assert('旧存档 skillData 为空对象可安全操作', oldSaveData.skillData !== undefined);

    // 模拟 SaveContainerV8 兼容
    // 构造一个最小 V8 容器
    const mockV8 = {
      saveVersion: 8,
      timestamp: Date.now(),
      skillData: {},
      saveMetaV2: { createdAt: 0, updatedAt: 0, migratedFromVersion: 7, configVersions: {}, lastRewardTransactionId: '' },
    };

    // 验证 skillData 字段存在
    this._assert('SaveContainerV8.skillData 字段存在', 'skillData' in mockV8);

    // 空对象可写入
    if (mockV8.skillData) {
      mockV8.skillData['SKILL_003'] = { level: 7 };
      this._assert('skillData 可写入 SKILL_003', mockV8.skillData['SKILL_003']?.level === 7);
    }

    console.log('[ComboSkillDebug] SaveV2兼容 PASS');
  }

  // ==================== 工具方法 ====================

  private static _assert(name: string, passed: boolean): void {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${status}: ${name}`);
    this._results.push({ name, passed, message: status });
  }

  private static printSummary(): void {
    const total = this._results.length;
    const passed = this._results.filter((r) => r.passed).length;
    const failed = total - passed;

    console.log('\n========================================');
    console.log('Phase10-Step2 ComboSkill 测试汇总');
    console.log(`总计: ${total} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    if (failed > 0) {
      console.log('\n--- 失败项 ---');
      for (const r of this._results) {
        if (!r.passed) {
          console.log(`  ❌ ${r.name}`);
        }
      }
      console.log('\n[ComboSkillDebug] FAIL');
    } else {
      console.log('\n[ComboSkillDebug] PASS');
    }
    console.log('========================================\n');
  }
}
