// ============================================================
// Phase9Step1DebugRunner — Phase9-Step1 HeroSystem 集成测试
// 职责：验证 HeroRepository / HeroSystem / HeroSnapshotBuilder / Event
// 用法：在 Cocos Creator 控制台执行 Phase9Step1DebugRunner.runAll()
// ============================================================

import { HeroRepository } from '../hero/HeroRepository';
import { HeroSystem } from '../hero/HeroSystem';
import { HeroSnapshotBuilder } from '../hero/HeroSnapshotBuilder';
import { EventManager } from '../core/EventManager';
import type { HeroConfig } from '../hero/HeroTypes';
import {
  createDefaultHeroBaseStats,
  createDefaultHeroGrowthStats,
  createDefaultHeroRuntimeState,
  createDefaultBattleReadyStats,
} from '../hero/HeroTypes';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step1DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase9-Step1 HeroSystem 测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase9-Step1 HeroSystem 集成测试 ==========\n');

    // 1. HeroTypes 工厂函数测试
    this.testHeroTypesFactories();

    // 2. HeroRepository 配置加载测试
    await this.testHeroRepositoryLoad();

    // 3. HeroRepository 查询测试
    this.testHeroRepositoryQueries();

    // 4. HeroSystem 初始化测试
    await this.testHeroSystemInitialize();

    // 5. HeroSystem 英雄解锁测试
    this.testHeroUnlock();

    // 6. HeroSystem 英雄查询测试
    this.testHeroQueries();

    // 7. HeroSystem 等级提升测试
    this.testHeroLevelUp();

    // 8. HeroSystem 经验增加测试
    this.testHeroExpGain();

    // 9. HeroSystem 星级提升测试
    this.testHeroStarUp();

    // 10. HeroSystem 突破测试
    this.testHeroBreakthrough();

    // 11. HeroSnapshotBuilder 基础属性计算测试
    this.testSnapshotBaseAttributes();

    // 12. HeroSnapshotBuilder 战斗就绪属性测试
    this.testSnapshotBattleReady();

    // 13. HeroSystem 快照生成测试
    this.testHeroSnapshot();

    // 14. HeroSystem 事件集成测试
    this.testEventIntegration();

    // 15. HeroSystem save/restore 测试
    this.testSaveRestore();

    // 16. HeroRepository hasHero 测试
    this.testHasHero();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1. HeroTypes 工厂函数测试 ====================

  static testHeroTypesFactories(): void {
    const baseStats = createDefaultHeroBaseStats();
    this._assert('HeroBaseStats 默认工厂 hp=100', baseStats.hp === 100);
    this._assert('HeroBaseStats 默认工厂 atk=20', baseStats.atk === 20);
    this._assert('HeroBaseStats 默认工厂 def=10', baseStats.def === 10);
    this._assert('HeroBaseStats 默认工厂 speed=5', baseStats.speed === 5);

    const growthStats = createDefaultHeroGrowthStats();
    this._assert('HeroGrowthStats 默认工厂 hp=50', growthStats.hp === 50);
    this._assert('HeroGrowthStats 默认工厂 atk=10', growthStats.atk === 10);
    this._assert('HeroGrowthStats 默认工厂 def=5', growthStats.def === 5);

    const state = createDefaultHeroRuntimeState('hero_test');
    this._assert('HeroRuntimeState.heroId = hero_test', state.heroId === 'hero_test');
    this._assert('HeroRuntimeState.level = 1', state.level === 1);
    this._assert('HeroRuntimeState.exp = 0', state.exp === 0);
    this._assert('HeroRuntimeState.star = 1', state.star === 1);
    this._assert('HeroRuntimeState.breakthrough = 0', state.breakthrough === 0);
    this._assert('HeroRuntimeState.unlocked = false', !state.unlocked);

    const battleStats = createDefaultBattleReadyStats();
    this._assert('BattleReadyStats.power = 0', battleStats.power === 0);
    this._assert('BattleReadyStats.critDamage = 1.5', battleStats.critDamage === 1.5);
  }

  // ==================== 2. HeroRepository 配置加载测试 ====================

  static async testHeroRepositoryLoad(): Promise<void> {
    try {
      const repository = HeroRepository.getInstance();
      await repository.loadConfig();
      this._assert('HeroRepository 配置加载成功', repository.isLoaded());
      this._assert('HeroRepository 英雄数量 = 5', repository.getHeroCount() === 5);
    } catch (e) {
      this._assert(`HeroRepository 配置加载失败: ${e}`, false);
    }
  }

  // ==================== 3. HeroRepository 查询测试 ====================

  static testHeroRepositoryQueries(): void {
    const repository = HeroRepository.getInstance();

    const hero1 = repository.getHeroConfig('hero_001');
    this._assert('getHeroConfig(hero_001) 存在', hero1 !== null);
    if (hero1) {
      this._assert('hero_001 name = 剑无极', hero1.name === '剑无极');
      this._assert('hero_001 quality = R', hero1.quality === 'R');
    }

    const hero5 = repository.getHeroConfig('hero_005');
    this._assert('getHeroConfig(hero_005) 存在', hero5 !== null);
    if (hero5) {
      this._assert('hero_005 quality = SSR', hero5.quality === 'SSR');
    }

    const nonExistent = repository.getHeroConfig('hero_999');
    this._assert('getHeroConfig(hero_999) = null', nonExistent === null);

    const allConfigs = repository.getAllHeroConfigs();
    this._assert('getAllHeroConfigs() 长度 = 5', allConfigs.length === 5);

    const allIds = repository.getAllHeroIds();
    this._assert('getAllHeroIds() 包含 hero_003', allIds.includes('hero_003'));
  }

  // ==================== 4. HeroSystem 初始化测试 ====================

  static async testHeroSystemInitialize(): Promise<void> {
    try {
      const heroSystem = HeroSystem.getInstance();
      const result = await heroSystem.initialize();
      this._assert('HeroSystem 初始化成功', result && heroSystem.isInitialized());
    } catch (e) {
      this._assert(`HeroSystem 初始化失败: ${e}`, false);
    }
  }

  // ==================== 5. HeroSystem 英雄解锁测试 ====================

  static testHeroUnlock(): void {
    const heroSystem = HeroSystem.getInstance();

    // 正常解锁
    const unlocked = heroSystem.unlockHero('hero_001');
    this._assert('unlockHero(hero_001) 成功', unlocked);
    this._assert('hasHero(hero_001) = true', heroSystem.hasHero('hero_001'));

    // 幂等
    const doubleUnlock = heroSystem.unlockHero('hero_001');
    this._assert('重复 unlockHero(hero_001) = false（幂等）', !doubleUnlock);

    // 批量解锁
    const count = heroSystem.unlockHeroes(['hero_002', 'hero_003', 'hero_004', 'hero_005']);
    this._assert('批量解锁 4 个英雄', count === 4);

    // 全部已解锁
    for (let i = 1; i <= 5; i++) {
      const id = `hero_00${i}`;
      this._assert(`hasHero(${id}) = true`, heroSystem.hasHero(id));
    }

    // 不存在英雄解锁失败
    const invalidUnlock = heroSystem.unlockHero('hero_999');
    this._assert('unlockHero(hero_999) = false（配置不存在）', !invalidUnlock);
  }

  // ==================== 6. HeroSystem 英雄查询测试 ====================

  static testHeroQueries(): void {
    const heroSystem = HeroSystem.getInstance();

    const hero1 = heroSystem.getHero('hero_001');
    this._assert('getHero(hero_001) 非 null', hero1 !== null);
    if (hero1) {
      this._assert('hero_001.unlocked = true', hero1.unlocked);
      this._assert('hero_001.level = 1', hero1.level === 1);
      this._assert('hero_001.star = 1', hero1.star === 1);
    }

    const allHeroes = heroSystem.getAllHeroes();
    this._assert('getAllHeroes() 共 5 个', allHeroes.length === 5);

    const unlockedHeroes = heroSystem.getUnlockedHeroes();
    this._assert('getUnlockedHeroes() 共 5 个', unlockedHeroes.length === 5);

    // 不存在英雄返回 null
    const nonExistent = heroSystem.getHero('hero_999');
    this._assert('getHero(hero_999) = null', nonExistent === null);

    // hasHero 对不存在英雄
    this._assert('hasHero(hero_999) = false', !heroSystem.hasHero('hero_999'));
  }

  // ==================== 7. HeroSystem 等级提升测试 ====================

  static testHeroLevelUp(): void {
    const heroSystem = HeroSystem.getInstance();

    const hero1Before = heroSystem.getHero('hero_001')!;
    this._assert('hero_001 初始 level = 1', hero1Before.level === 1);

    // 升 1 级
    const result1 = heroSystem.levelUpHero('hero_001', 1);
    this._assert('levelUpHero(hero_001, 1) 成功', result1);
    const hero1L2 = heroSystem.getHero('hero_001')!;
    this._assert('hero_001 level = 2', hero1L2.level === 2);

    // 升 5 级
    heroSystem.levelUpHero('hero_001', 5);
    const hero1L7 = heroSystem.getHero('hero_001')!;
    this._assert('hero_001 level = 7', hero1L7.level === 7);

    // 尝试超过 maxLevel(100)
    heroSystem.levelUpHero('hero_001', 100);
    const hero1Capped = heroSystem.getHero('hero_001')!;
    this._assert('hero_001 capped at maxLevel=100', hero1Capped.level === 100);

    // 无效参数
    const invalidResult = heroSystem.levelUpHero('hero_001', -1);
    this._assert('levelUpHero -1 失败', !invalidResult);
  }

  // ==================== 8. HeroSystem 经验增加测试 ====================

  static testHeroExpGain(): void {
    const heroSystem = HeroSystem.getInstance();

    // hero_002 目前等级未知（可能之前已有操作）

    // 增加少量经验（不足以升级）
    const levelUps1 = heroSystem.addHeroExp('hero_002', 50);
    this._assert('addHeroExp(50) 不足以升级', levelUps1 === 0);

    // 增加大量经验确保升级
    const hero2Mid = heroSystem.getHero('hero_002')!;
    const neededExp = (hero2Mid.level * 100) - hero2Mid.exp + 500;
    const levelUps2 = heroSystem.addHeroExp('hero_002', neededExp);
    this._assert('addHeroExp(大量) 触发升级', levelUps2 >= 1);

    const hero2After = heroSystem.getHero('hero_002')!;
    this._assert('英雄 exp >= 0', hero2After.exp >= 0);

    // 无效 exp 测试
    const noLevelUp = heroSystem.addHeroExp('hero_002', 0);
    this._assert('addHeroExp(0) = 0（无效输入）', noLevelUp === 0);

    const negativeExp = heroSystem.addHeroExp('hero_002', -100);
    this._assert('addHeroExp(-100) = 0（无效输入）', negativeExp === 0);
  }

  // ==================== 9. HeroSystem 星级提升测试 ====================

  static testHeroStarUp(): void {
    const heroSystem = HeroSystem.getInstance();

    const starBefore = heroSystem.getHeroStar('hero_001');
    this._assert('hero_001 star = 1', starBefore === 1);

    const result = heroSystem.addStar('hero_001', 2);
    this._assert('addStar(2) 成功', result);
    const starAfter = heroSystem.getHeroStar('hero_001');
    this._assert('hero_001 star = 3', starAfter === 3);

    // 不存在英雄
    const nonExistentStar = heroSystem.getHeroStar('hero_999');
    this._assert('getHeroStar(hero_999) = 0', nonExistentStar === 0);
  }

  // ==================== 10. HeroSystem 突破测试 ====================

  static testHeroBreakthrough(): void {
    const heroSystem = HeroSystem.getInstance();

    const btBefore = heroSystem.getHeroBreakthrough('hero_003');
    this._assert('hero_003 breakthrough = 0', btBefore === 0);

    const result1 = heroSystem.addBreakthrough('hero_003');
    this._assert('addBreakthrough 成功', result1);
    const bt1 = heroSystem.getHeroBreakthrough('hero_003');
    this._assert('hero_003 breakthrough = 1', bt1 === 1);

    // 突破到上限 6
    for (let i = 0; i < 5; i++) {
      heroSystem.addBreakthrough('hero_003');
    }
    const bt6 = heroSystem.getHeroBreakthrough('hero_003');
    this._assert('hero_003 breakthrough = 6（上限）', bt6 === 6);

    const overflow = heroSystem.addBreakthrough('hero_003');
    this._assert('超出上限 addBreakthrough = false', !overflow);

    // 不存在英雄
    const nonExistent = heroSystem.getHeroBreakthrough('hero_999');
    this._assert('getHeroBreakthrough(hero_999) = 0', nonExistent === 0);
  }

  // ==================== 11. HeroSnapshotBuilder 基础属性计算测试 ====================

  static testSnapshotBaseAttributes(): void {
    const baseStats = { hp: 500, atk: 60, def: 40, speed: 20 };
    const growthStats = { hp: 80, atk: 12, def: 6 };

    // 等级 1
    const attrs1 = HeroSnapshotBuilder.computeBaseAttributes(baseStats, growthStats, 1);
    this._assert('level=1: hp=500', attrs1.hp === 500);
    this._assert('level=1: atk=60', attrs1.atk === 60);
    this._assert('level=1: def=40', attrs1.def === 40);
    this._assert('level=1: speed=20', attrs1.speed === 20);

    // 等级 10
    const attrs10 = HeroSnapshotBuilder.computeBaseAttributes(baseStats, growthStats, 10);
    const expectedHp10 = 500 + 80 * 9;
    const expectedAtk10 = 60 + 12 * 9;
    const expectedDef10 = 40 + 6 * 9;
    this._assert(`level=10: hp=${expectedHp10}`, attrs10.hp === expectedHp10);
    this._assert(`level=10: atk=${expectedAtk10}`, attrs10.atk === expectedAtk10);
    this._assert(`level=10: def=${expectedDef10}`, attrs10.def === expectedDef10);

    // 边界：level = 0
    const attrs0 = HeroSnapshotBuilder.computeBaseAttributes(baseStats, growthStats, 0);
    this._assert('level=0: hp=500（安全处理）', attrs0.hp === 500);
  }

  // ==================== 12. HeroSnapshotBuilder 战斗就绪属性测试 ====================

  static testSnapshotBattleReady(): void {
    const config: HeroConfig = {
      id: 'test_hero',
      name: '测试英雄',
      quality: 'SR',
      faction: '青龙',
      profession: '战士',
      element: '雷',
      baseStats: { hp: 500, atk: 60, def: 40, speed: 20 },
      growthStats: { hp: 80, atk: 12, def: 6 },
      defaultSkillIds: ['skill_001'],
      maxLevel: 100,
    };

    const computed = HeroSnapshotBuilder.computeBaseAttributes(
      config.baseStats,
      config.growthStats,
      10,
    );
    const bonus = { hp: 100, atk: 50, def: 30, speed: 10, equipmentPower: 200 };
    const battleReady = HeroSnapshotBuilder.computeBattleReadyStats(config, computed, bonus);

    this._assert('BattleReadyStats.hp > 0', battleReady.hp > 0);
    this._assert('BattleReadyStats.atk > 0', battleReady.atk > 0);
    this._assert('BattleReadyStats.def > 0', battleReady.def > 0);
    this._assert('BattleReadyStats.speed > 0', battleReady.speed > 0);
    this._assert('BattleReadyStats.power > 0', battleReady.power > 0);
    this._assert('BattleReadyStats.critRate > 0', battleReady.critRate > 0);
    this._assert('BattleReadyStats.critDamage > 1', battleReady.critDamage > 1);
    this._assert('装备战力已计入 power', battleReady.power >= 200);

    // 无加成
    const noBonusStats = HeroSnapshotBuilder.computeBattleReadyStats(config, computed, {});
    this._assert('无加成也有战力', noBonusStats.power > 0);
  }

  // ==================== 13. HeroSystem 快照生成测试 ====================

  static testHeroSnapshot(): void {
    const heroSystem = HeroSystem.getInstance();

    const snapshot = heroSystem.getHeroSnapshot('hero_001');
    this._assert('getHeroSnapshot(hero_001) 非 null', snapshot !== null);

    if (snapshot) {
      this._assert('snapshot.heroId = hero_001', snapshot.heroId === 'hero_001');
      this._assert('snapshot.name = 剑无极', snapshot.name === '剑无极');
      this._assert('snapshot.level > 0', snapshot.level > 0);
      this._assert('snapshot.quality = R', snapshot.quality === 'R');
      this._assert('snapshot.faction = 青龙', snapshot.faction === '青龙');
      this._assert('snapshot.profession = 战士', snapshot.profession === '战士');
      this._assert('snapshot.element = 雷', snapshot.element === '雷');
      this._assert('snapshot.battleReady 非 null', snapshot.battleReady !== null);
      this._assert('snapshot.battleReady.power > 0', snapshot.battleReady.power > 0);
      this._assert('snapshot.skillIds 非空', snapshot.skillIds.length > 0);
      this._assert('snapshot.capturedAt > 0', snapshot.capturedAt > 0);
    }

    // 所有已解锁英雄快照
    const snapshots = heroSystem.getHeroSnapshots();
    this._assert('getHeroSnapshots() 返回 5 个快照', snapshots.length === 5);

    // 未解锁英雄快照返回 null
    const nonExistentSnapshot = heroSystem.getHeroSnapshot('hero_999');
    this._assert('getHeroSnapshot(hero_999) = null', nonExistentSnapshot === null);
  }

  // ==================== 14. EventManager 事件集成测试 ====================

  static testEventIntegration(): void {
    const eventManager = EventManager.getInstance();

    let eventFired = false;
    const callback = () => { eventFired = true; };

    eventManager.on(HeroSystem.HERO_UPDATED, callback);
    eventManager.emit(HeroSystem.HERO_UPDATED, { heroId: 'hero_001' });
    this._assert('HERO_UPDATED 事件正常触发', eventFired);
    eventManager.off(HeroSystem.HERO_UPDATED, callback);

    // 验证事件常量
    this._assert('HERO_UNLOCKED = hero:unlocked', HeroSystem.HERO_UNLOCKED === 'hero:unlocked');
    this._assert('HERO_UPDATED = hero:updated', HeroSystem.HERO_UPDATED === 'hero:updated');
    this._assert('HERO_LEVEL_CHANGED = hero:levelChanged', HeroSystem.HERO_LEVEL_CHANGED === 'hero:levelChanged');
    this._assert('HERO_STAR_CHANGED = hero:starChanged', HeroSystem.HERO_STAR_CHANGED === 'hero:starChanged');
    this._assert('HERO_POWER_CHANGED = hero:powerChanged', HeroSystem.HERO_POWER_CHANGED === 'hero:powerChanged');
    this._assert('HERO_EXP_GAINED = hero:expGained', HeroSystem.HERO_EXP_GAINED === 'hero:expGained');
  }

  // ==================== 15. save/restore 测试 ====================

  static testSaveRestore(): void {
    const heroSystem = HeroSystem.getInstance();

    // 保存当前状态
    const savedData = heroSystem.save();
    this._assert('save() 返回 HeroSaveData', savedData !== null);
    this._assert('saveData.heroStates 非空', Object.keys(savedData.heroStates).length > 0);
    this._assert('saveData.saveVersion = 1', savedData.saveVersion === 1);
    this._assert('saveData.updatedAt > 0', savedData.updatedAt > 0);

    // 验证保存了已解锁英雄及其属性
    const hero1State = savedData.heroStates['hero_001'];
    this._assert('存档包含 hero_001', hero1State !== undefined);
    if (hero1State) {
      this._assert('存档中 hero_001.unlocked = true', hero1State.unlocked);
    }

    // 修改状态后验证 round-trip：save 应捕获当前状态
    // 先记录当前 hero_004 的 exp，然后加经验
    const hero4BeforeSave = heroSystem.getHero('hero_004')!;
    heroSystem.addHeroExp('hero_004', 300);
    const hero4AfterExp = heroSystem.getHero('hero_004')!;

    // save 应捕获修改后的状态
    const savedData2 = heroSystem.save();
    const savedHero4 = savedData2.heroStates['hero_004'];
    this._assert('save 捕获修改后的 exp', savedHero4 && savedHero4.exp === hero4AfterExp.exp);

    // restore 应正确恢复状态
    heroSystem.restore(savedData);
    const hero4Restored = heroSystem.getHero('hero_004')!;
    this._assert('restore 恢复 hero_004.exp 为旧值', hero4Restored.exp === hero4BeforeSave.exp);

    // 再恢复回最新状态
    heroSystem.restore(savedData2);
    const hero4Back = heroSystem.getHero('hero_004')!;
    this._assert('restore 恢复 hero_004.exp 为新值', hero4Back.exp === hero4AfterExp.exp);
  }

  // ==================== 16. HeroRepository hasHero 测试 ====================

  static testHasHero(): void {
    const repository = HeroRepository.getInstance();

    this._assert('hasHero(hero_001) = true', repository.hasHero('hero_001'));
    this._assert('hasHero(hero_005) = true', repository.hasHero('hero_005'));
    this._assert('hasHero(hero_999) = false', repository.hasHero('hero_999'));
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
    console.log(`Phase9-Step1 HeroSystem 测试汇总`);
    console.log(`总计: ${total} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    if (failed > 0) {
      console.log('\n--- 失败项 ---');
      for (const r of this._results) {
        if (!r.passed) {
          console.log(`  ❌ ${r.name}`);
        }
      }
    }
    console.log('========================================\n');
  }
}
