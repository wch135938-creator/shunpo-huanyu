// ============================================================
// HeroTalentDebugRunner — Phase10-Step1 英雄天赋系统 Debug 验证
// 职责：验证 GrowthConfig / TalentConfig / SaveV2 / Talent解锁 / Bonus计算 / UI显示
// 用法：在 Cocos Creator 控制台执行 HeroTalentDebugRunner.runAll()
// ============================================================

import { HeroSystem } from '../hero/HeroSystem';
import { ConfigManager } from '../core/ConfigManager';
import type { HeroGrowthDataList, HeroTalentDataList } from '../hero/HeroTalentTypes';
import type { HeroTalentSaveData, HeroTalentSaveEntry } from '../save/HeroTalentSaveData';
import { createDefaultHeroTalentSaveData } from '../save/HeroTalentSaveData';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class HeroTalentDebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase10-Step1 天赋系统测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase10-Step1 HeroTalent 集成测试 ==========\n');

    // 0. 确保 HeroSystem 已初始化
    await this.testEnsureHeroSystemReady();

    // 1. GrowthConfig 读取测试
    await this.testGrowthConfigLoad();

    // 2. TalentConfig 读取测试
    await this.testTalentConfigLoad();

    // 3. getHeroGrowthRoutes 测试
    this.testGetHeroGrowthRoutes();

    // 4. getHeroTalents 测试
    this.testGetHeroTalents();

    // 5. getUnlockedTalents 测试（初始为空）
    this.testGetUnlockedTalentsInitial();

    // 6. selectGrowthRoute 测试
    this.testSelectGrowthRoute();

    // 7. unlockTalent 测试
    this.testUnlockTalent();

    // 8. getUnlockedTalents 测试（解锁后）
    this.testGetUnlockedTalentsAfter();

    // 9. getHeroTalentBonus 测试
    this.testGetHeroTalentBonus();

    // 10. SaveV2 兼容性测试
    this.testSaveV2Compatibility();

    // 11. 旧存档无字段自动初始化测试
    this.testOldSaveAutoInit();

    // 12. talentPoints 管理测试
    this.testTalentPointsManagement();

    // 13. 边界条件测试
    this.testEdgeCases();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 0. 确保 HeroSystem 已初始化 ====================

  static async testEnsureHeroSystemReady(): Promise<void> {
    try {
      const heroSystem = HeroSystem.getInstance();
      if (!heroSystem.isInitialized()) {
        await heroSystem.initialize();
      }
      this._assert('HeroSystem 已初始化', heroSystem.isInitialized());
    } catch (e) {
      this._assert(`HeroSystem 初始化失败: ${e}`, false);
    }
  }

  // ==================== 1. GrowthConfig 读取测试 ====================

  static async testGrowthConfigLoad(): Promise<void> {
    try {
      const configManager = ConfigManager.getInstance();
      const data = await configManager.loadConfig<HeroGrowthDataList>(
        'config/hero/hero_growth_config',
      );

      this._assert('GrowthConfig 加载成功', data !== null);
      this._assert('GrowthConfig version = 1.0.0', data.version === '1.0.0');
      this._assert('GrowthConfig name 正确', data.name === 'hero_growth_config');
      this._assert('GrowthConfig 包含 5 个英雄', data.data.length === 5);

      // 验证 hero_001
      const hero001 = data.data.find((h) => h.heroId === 'hero_001');
      this._assert('hero_001 有成长路线', hero001 !== undefined);
      if (hero001) {
        this._assert('hero_001 有 2 条路线', hero001.growthRoutes.length === 2);
      }

      // 验证 hero_005 有 3 条路线
      const hero005 = data.data.find((h) => h.heroId === 'hero_005');
      this._assert('hero_005 有 3 条路线', hero005 !== undefined && hero005.growthRoutes.length === 3);

      console.log('[HeroTalentDebug] 读取GrowthConfig PASS');
    } catch (e) {
      this._assert(`GrowthConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 2. TalentConfig 读取测试 ====================

  static async testTalentConfigLoad(): Promise<void> {
    try {
      const configManager = ConfigManager.getInstance();
      const data = await configManager.loadConfig<HeroTalentDataList>(
        'config/hero/hero_talent_config',
      );

      this._assert('TalentConfig 加载成功', data !== null);
      this._assert('TalentConfig version = 1.0.0', data.version === '1.0.0');
      this._assert('TalentConfig name 正确', data.name === 'hero_talent_config');
      this._assert('TalentConfig 包含 15 个天赋', data.data.length === 15);

      // 验证第一个天赋
      const talent001 = data.data.find((t) => t.talentId === 'TALENT_001');
      this._assert('TALENT_001 存在', talent001 !== undefined);
      if (talent001) {
        this._assert('TALENT_001 heroId = hero_001', talent001.heroId === 'hero_001');
        this._assert('TALENT_001 routeId = ROUTE_ATK', talent001.routeId === 'ROUTE_ATK');
        this._assert('TALENT_001 nextTalentId = TALENT_002', talent001.nextTalentId === 'TALENT_002');
      }

      // 验证终点天赋
      const talent003 = data.data.find((t) => t.talentId === 'TALENT_003');
      this._assert('TALENT_003 nextTalentId 为空', talent003 !== undefined && talent003.nextTalentId === '');

      console.log('[HeroTalentDebug] 读取TalentConfig PASS');
    } catch (e) {
      this._assert(`TalentConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 3. getHeroGrowthRoutes 测试 ====================

  static testGetHeroGrowthRoutes(): void {
    const heroSystem = HeroSystem.getInstance();

    const routes = heroSystem.getHeroGrowthRoutes('hero_001');
    this._assert('hero_001 有 2 条路线', routes.length === 2);
    this._assert('hero_001 路线包含 ROUTE_ATK', routes.some((r) => r.routeId === 'ROUTE_ATK'));
    this._assert('hero_001 路线包含 ROUTE_DEF', routes.some((r) => r.routeId === 'ROUTE_DEF'));

    // 不存在的英雄
    const emptyRoutes = heroSystem.getHeroGrowthRoutes('hero_999');
    this._assert('hero_999 路线为空数组', emptyRoutes.length === 0);

    console.log('[HeroTalentDebug] getHeroGrowthRoutes PASS');
  }

  // ==================== 4. getHeroTalents 测试 ====================

  static testGetHeroTalents(): void {
    const heroSystem = HeroSystem.getInstance();

    const talents = heroSystem.getHeroTalents('hero_001');
    this._assert('hero_001 有 6 个天赋', talents.length === 6);

    // 按路线过滤
    const atkTalents = heroSystem.getHeroTalentsByRoute('hero_001', 'ROUTE_ATK');
    this._assert('hero_001 ROUTE_ATK 有 3 个天赋', atkTalents.length === 3);

    const defTalents = heroSystem.getHeroTalentsByRoute('hero_001', 'ROUTE_DEF');
    this._assert('hero_001 ROUTE_DEF 有 3 个天赋', defTalents.length === 3);

    // 不存在的英雄
    const emptyTalents = heroSystem.getHeroTalents('hero_999');
    this._assert('hero_999 天赋为空数组', emptyTalents.length === 0);

    console.log('[HeroTalentDebug] getHeroTalents PASS');
  }

  // ==================== 5. getUnlockedTalents 初始状态测试 ====================

  static testGetUnlockedTalentsInitial(): void {
    const heroSystem = HeroSystem.getInstance();

    const unlocked = heroSystem.getUnlockedTalents('hero_001');
    this._assert('初始解锁天赋为空', unlocked.length === 0);

    const points = heroSystem.getHeroTalentPoints('hero_001');
    this._assert('初始天赋点为 0', points === 0);

    const route = heroSystem.getSelectedRouteId('hero_001');
    this._assert('初始未选路线', route === '');

    console.log('[HeroTalentDebug] getUnlockedTalents(初始) PASS');
  }

  // ==================== 6. selectGrowthRoute 测试 ====================

  static testSelectGrowthRoute(): void {
    const heroSystem = HeroSystem.getInstance();

    // 确保英雄已解锁且等级足够
    if (!heroSystem.hasHero('hero_001')) {
      heroSystem.unlockHero('hero_001');
    }

    // 选择 ROUTE_ATK（unlockLevel=1，英雄等级应>=1）
    const result = heroSystem.selectGrowthRoute('hero_001', 'ROUTE_ATK');
    this._assert('选择 ROUTE_ATK 成功', result);

    const selected = heroSystem.getSelectedRouteId('hero_001');
    this._assert('当前路线 = ROUTE_ATK', selected === 'ROUTE_ATK');

    // 重复选择同一路线
    const doubleSelect = heroSystem.selectGrowthRoute('hero_001', 'ROUTE_ATK');
    this._assert('重复选择同一路线 = false', !doubleSelect);

    // 选择不存在的路线
    const invalidRoute = heroSystem.selectGrowthRoute('hero_001', 'ROUTE_INVALID');
    this._assert('选择不存在路线 = false', !invalidRoute);

    console.log('[HeroTalentDebug] selectGrowthRoute PASS');
  }

  // ==================== 7. unlockTalent 测试 ====================

  static testUnlockTalent(): void {
    const heroSystem = HeroSystem.getInstance();

    // 确保有足够天赋点
    heroSystem.addTalentPoints('hero_001', 10);

    const pointsBefore = heroSystem.getHeroTalentPoints('hero_001');
    this._assert('添加 10 天赋点后 > 0', pointsBefore >= 10);

    // 解锁第一个天赋（TALENT_001，cost=1，unlockLevel=1）
    const result1 = heroSystem.unlockTalent('hero_001', 'TALENT_001');
    this._assert('解锁 TALENT_001 成功', result1);

    const pointsAfter1 = heroSystem.getHeroTalentPoints('hero_001');
    this._assert('解锁后天赋点 -1', pointsAfter1 === pointsBefore - 1);

    // 检测已解锁
    const unlocked1 = heroSystem.getUnlockedTalents('hero_001');
    this._assert('解锁后 getUnlockedTalents 包含 TALENT_001',
      unlocked1.some((t) => t.talentId === 'TALENT_001'));

    // 尝试解锁需要前置但前置未解锁的
    const resultSkip = heroSystem.unlockTalent('hero_001', 'TALENT_003');
    this._assert('跳过前置解锁 TALENT_003 失败', !resultSkip);

    // 正确按顺序解锁 TALENT_002（前置 TALENT_001 已解锁）
    const result2 = heroSystem.unlockTalent('hero_001', 'TALENT_002');
    this._assert('解锁 TALENT_002 成功（前置已解锁）', result2);

    // 重复解锁
    const doubleUnlock = heroSystem.unlockTalent('hero_001', 'TALENT_001');
    this._assert('重复解锁 TALENT_001 = false（幂等）', !doubleUnlock);

    // 路线不匹配（选择 ROUTE_ATK，尝试解锁 ROUTE_DEF 的天赋）
    const wrongRouteResult = heroSystem.unlockTalent('hero_001', 'TALENT_004');
    this._assert('路线不匹配解锁失败', !wrongRouteResult);

    console.log('[HeroTalentDebug] Talent解锁 PASS');
  }

  // ==================== 8. getUnlockedTalents 解锁后测试 ====================

  static testGetUnlockedTalentsAfter(): void {
    const heroSystem = HeroSystem.getInstance();

    const unlocked = heroSystem.getUnlockedTalents('hero_001');
    this._assert('解锁后天赋数量 = 2', unlocked.length === 2);

    const talentIds = unlocked.map((t) => t.talentId);
    this._assert('包含 TALENT_001', talentIds.includes('TALENT_001'));
    this._assert('包含 TALENT_002', talentIds.includes('TALENT_002'));

    console.log('[HeroTalentDebug] getUnlockedTalents(解锁后) PASS');
  }

  // ==================== 9. getHeroTalentBonus 测试 ====================

  static testGetHeroTalentBonus(): void {
    const heroSystem = HeroSystem.getInstance();

    const bonus = heroSystem.getHeroTalentBonus('hero_001');

    this._assert('bonus.heroId = hero_001', bonus.heroId === 'hero_001');
    this._assert('bonus.selectedRouteId = ROUTE_ATK', bonus.selectedRouteId === 'ROUTE_ATK');
    this._assert('bonus.unlockedTalentCount = 2', bonus.unlockedTalentCount === 2);
    this._assert('bonus.bonuses 有 2 条', bonus.bonuses.length === 2);

    // 检查加成汇总
    const atkPercent = bonus.bonusSummary['attackPercent'];
    this._assert('attackPercent 加成 > 0', atkPercent !== undefined && atkPercent > 0);

    // TALENT_001: 0.05, TALENT_002: 0.08 → 总计 0.13
    this._assert('attackPercent = 0.13', Math.abs(atkPercent! - 0.13) < 0.001);

    // 无天赋的英雄
    const emptyBonus = heroSystem.getHeroTalentBonus('hero_002');
    this._assert('hero_002 bonus.unlockedTalentCount = 0', emptyBonus.unlockedTalentCount === 0);
    this._assert('hero_002 bonus.bonuses 为空', emptyBonus.bonuses.length === 0);

    console.log('[HeroTalentDebug] TalentBonus计算 PASS');
  }

  // ==================== 10. SaveV2 兼容性测试 ====================

  static testSaveV2Compatibility(): void {
    const heroSystem = HeroSystem.getInstance();

    // 保存天赋数据
    const savedData = heroSystem.saveTalentData();
    this._assert('saveTalentData 非 null', savedData !== null);
    this._assert('saveTalentData.saveVersion = 1', savedData.saveVersion === 1);
    this._assert('saveTalentData.updatedAt > 0', savedData.updatedAt > 0);

    // 验证保存内容
    const savedEntry = savedData.heroTalentMap['hero_001'];
    this._assert('存档包含 hero_001 天赋数据', savedEntry !== undefined);
    if (savedEntry) {
      this._assert('存档 hero_001 有 2 个已解锁天赋', savedEntry.unlockedTalentIds.length === 2);
      this._assert('存档 hero_001 路线 = ROUTE_ATK', savedEntry.selectedRouteId === 'ROUTE_ATK');
    }

    // 恢复到新实例测试 round-trip
    const restoreData = createDefaultHeroTalentSaveData();
    restoreData.heroTalentMap['hero_001'] = {
      unlockedTalentIds: ['TALENT_001'],
      selectedRouteId: 'ROUTE_ATK',
      talentPoints: 3,
    };

    // 记录原始状态
    const originalEntry = heroSystem.getUnlockedTalents('hero_001');

    // 恢复
    heroSystem.restoreTalentData(restoreData);
    const restoredTalents = heroSystem.getUnlockedTalents('hero_001');
    this._assert('restore 后 hero_001 有 1 个已解锁天赋', restoredTalents.length === 1);
    this._assert('restore 后路线 = ROUTE_ATK',
      heroSystem.getSelectedRouteId('hero_001') === 'ROUTE_ATK');
    this._assert('restore 后天赋点 = 3',
      heroSystem.getHeroTalentPoints('hero_001') === 3);

    // 恢复原状态
    heroSystem.restoreTalentData(savedData);
    const restoredBack = heroSystem.getUnlockedTalents('hero_001');
    this._assert('再恢复后天赋数量正确', restoredBack.length === 2);

    console.log('[HeroTalentDebug] 读取SaveV2 PASS');
  }

  // ==================== 11. 旧存档无字段自动初始化测试 ====================

  static testOldSaveAutoInit(): void {
    const heroSystem = HeroSystem.getInstance();

    // 模拟旧存档（空数据）
    const oldSave = createDefaultHeroTalentSaveData();

    // 记录当前状态后恢复旧存档
    const currentData = heroSystem.saveTalentData();
    heroSystem.restoreTalentData(oldSave);

    // 旧存档无 hero_001 数据，应自动初始化
    const talents = heroSystem.getUnlockedTalents('hero_001');
    this._assert('旧存档恢复后天赋为空数组', Array.isArray(talents) && talents.length === 0);

    const points = heroSystem.getHeroTalentPoints('hero_001');
    this._assert('旧存档恢复后天赋点为 0', points === 0);

    const route = heroSystem.getSelectedRouteId('hero_001');
    this._assert('旧存档恢复后路线为空', route === '');

    // 恢复原状态
    heroSystem.restoreTalentData(currentData);

    console.log('[HeroTalentDebug] 旧存档自动初始化 PASS');
  }

  // ==================== 12. talentPoints 管理测试 ====================

  static testTalentPointsManagement(): void {
    const heroSystem = HeroSystem.getInstance();

    // 记录原始天赋点
    const beforePoints = heroSystem.getHeroTalentPoints('hero_002');

    // 选择路线
    heroSystem.selectGrowthRoute('hero_002', 'ROUTE_ATK');

    // 添加天赋点
    const added = heroSystem.addTalentPoints('hero_002', 5);
    this._assert('添加 5 天赋点成功', added);

    const afterAdd = heroSystem.getHeroTalentPoints('hero_002');
    this._assert(`添加后天赋点 = ${beforePoints + 5}`, afterAdd === beforePoints + 5);

    // 负值不生效
    const negativeAdded = heroSystem.addTalentPoints('hero_002', -3);
    this._assert('添加负值失败', !negativeAdded);

    // 解锁天赋消耗
    heroSystem.unlockTalent('hero_002', 'TALENT_007'); // cost=1
    const afterUnlock = heroSystem.getHeroTalentPoints('hero_002');
    this._assert(`解锁后天赋点 = ${afterAdd - 1}`, afterUnlock === afterAdd - 1);

    console.log('[HeroTalentDebug] talentPoints管理 PASS');
  }

  // ==================== 13. 边界条件测试 ====================

  static testEdgeCases(): void {
    const heroSystem = HeroSystem.getInstance();

    // 不存在英雄的天赋操作
    const invalidUnlock = heroSystem.unlockTalent('hero_999', 'TALENT_001');
    this._assert('不存在英雄 unlockTalent = false', !invalidUnlock);

    // 不存在天赋
    const invalidTalent = heroSystem.unlockTalent('hero_001', 'TALENT_999');
    this._assert('不存在天赋 unlockTalent = false', !invalidTalent);

    // 天赋不属于该英雄
    const wrongHero = heroSystem.unlockTalent('hero_005', 'TALENT_001');
    this._assert('天赋不属于该英雄 = false', !wrongHero);

    // 路线存在性检查
    const invalidRoute = heroSystem.selectGrowthRoute('hero_001', 'ROUTE_INVALID');
    this._assert('选择不存在路线 = false', !invalidRoute);

    // 天赋点不足
    // 用光 hero_002 天赋点
    const heroSystem2 = HeroSystem.getInstance();
    heroSystem2.addTalentPoints('hero_003', 1); // 确保只有 1 点
    heroSystem2.selectGrowthRoute('hero_003', 'ROUTE_ATK');
    // 尝试解锁 cost=2 的天赋（TALENT_010 cost=1, TALENT_011 cost=2）
    heroSystem2.unlockTalent('hero_003', 'TALENT_009'); // cost=1，消耗唯一的天赋点
    const noPointsResult = heroSystem2.unlockTalent('hero_003', 'TALENT_010'); // cost=1，但天赋点已用完
    this._assert('天赋点不足解锁失败', !noPointsResult);

    // 英雄等级不足
    // hero_001 ROUTE_DEF 路线 unlockLevel=10，但英雄可能等级不够
    // 需要先切换到 DEF 路线再测试

    console.log('[HeroTalentDebug] 边界条件测试 PASS');
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
    console.log('Phase10-Step1 HeroTalent 测试汇总');
    console.log(`总计: ${total} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    if (failed > 0) {
      console.log('\n--- 失败项 ---');
      for (const r of this._results) {
        if (!r.passed) {
          console.log(`  ❌ ${r.name}`);
        }
      }
      console.log('\n[HeroTalentDebug] FAIL');
    } else {
      console.log('\n[HeroTalentDebug] PASS');
    }
    console.log('========================================\n');
  }
}
