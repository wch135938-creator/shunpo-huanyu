// ============================================================
// Phase9Step6DebugRunner — Phase9-Step6 SaveV2 集成测试
// 职责：验证 SaveContainerV8 / SaveV2Migrator / SaveManager V8 集成
// 用法：在 Cocos Creator 控制台执行 Phase9Step6DebugRunner.runAll()
// 断言数：150+
// ============================================================

import { createDefaultSaveMetaV2, createDefaultSaveContainerV8, upgradeToV8 } from '../save/SaveContainerV8';
import type {
  SaveContainerV8,
  SaveMetaV2,
  ChapterSaveData,
  TutorialSaveData,
  AnalyticsSaveData,
} from '../save/SaveContainerV8';
import {
  createDefaultChapterSaveData,
  createDefaultTutorialSaveData,
  createDefaultAnalyticsSaveData,
} from '../save/SaveContainerV8';
import { SaveV2Migrator } from '../save/SaveV2Migrator';
import type { V7ToV8MigrationResult } from '../save/SaveV2Migrator';
import { createDefaultHeroSaveData } from '../save/HeroSaveData';
import type { HeroSaveData } from '../save/HeroSaveData';
import { createDefaultSkillSaveData } from '../save/SkillSaveData';
import type { SkillSaveData } from '../save/SkillSaveData';
import { createDefaultFormationSaveData } from '../save/FormationSaveData';
import type { FormationSaveData } from '../save/FormationSaveData';
import { SaveManager } from '../save/SaveManager';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { EventManager } from '../core/EventManager';
import {
  createDefaultSaveContainer,
  CURRENT_SAVE_VERSION,
  type SaveContainer,
} from '../save/SaveContainer';
import type { HeroRuntimeState } from '../hero/HeroTypes';

// ==================== 测试结果类型 ====================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step6DebugRunner {
  private static _results: TestResult[] = [];
  private static _eventLog: string[] = [];

  // ==================== 主入口 ====================

  static async runAll(): Promise<void> {
    this._results = [];
    this._eventLog = [];
    console.log('========== Phase9-Step6 SaveV2 集成测试 ==========\n');

    // 1. SaveMetaV2 工厂函数测试
    this.testSaveMetaV2Factory();

    // 2. SaveContainerV8 预留类型工厂测试
    this.testReservedTypeFactories();

    // 3. SaveContainerV8 工厂与升级函数测试
    this.testSaveContainerV8Factory();

    // 4. SaveV2Migrator Hero 迁移测试
    this.testHeroMigration();

    // 5. SaveV2Migrator Hero 迁移 — 仅 cards 无 growth
    this.testHeroMigrationCardsOnly();

    // 6. SaveV2Migrator Hero 迁移 — 仅 growth 无 cards
    this.testHeroMigrationGrowthOnly();

    // 7. SaveV2Migrator Hero 迁移 — 空数据
    this.testHeroMigrationEmpty();

    // 8. SaveV2Migrator Skill 迁移测试 — 有 heroDefaultSkillMap
    this.testSkillMigrationWithMap();

    // 9. SaveV2Migrator Skill 迁移测试 — 无 heroDefaultSkillMap
    this.testSkillMigrationWithoutMap();

    // 10. SaveV2Migrator Formation 迁移测试
    this.testFormationMigration();

    // 11. SaveV2Migrator Formation 迁移 — 空英雄
    this.testFormationMigrationEmpty();

    // 12. SaveV2Migrator 完整 V7→V8 迁移
    this.testFullV7ToV8Migration();

    // 13. SaveV2Migrator 完整迁移 — 空容器
    this.testFullMigrationEmptyContainer();

    // 14. SaveV2Migrator cardId→heroId 转换
    this.testCardIdToHeroIdConversion();

    // 15. upgradeToV8 函数测试
    this.testUpgradeToV8();

    // 16. SaveMetaV2 从迁移创建
    this.testSaveMetaV2FromMigration();

    // 17. V7→V8 迁移步骤注册
    this.testMigrationStepRegistration();

    // 18. 迁移结果结构测试
    this.testMigrationResultStructure();

    // 19. HeroSaveData 默认数据测试
    this.testHeroSaveDataDefaults();

    // 20. SkillSaveData 默认数据测试
    this.testSkillSaveDataDefaults();

    // 21. FormationSaveData 默认数据测试
    this.testFormationSaveDataDefaults();

    // 22. Event 事件发射测试
    this.testEventEmission();

    // 23. CURRENT_SAVE_VERSION = 8
    this.testCurrentSaveVersion();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1. SaveMetaV2 工厂函数测试 ====================

  static testSaveMetaV2Factory(): void {
    const meta = createDefaultSaveMetaV2(0);
    this._assert('SaveMetaV2.createdAt > 0', meta.createdAt > 0);
    this._assert('SaveMetaV2.updatedAt > 0', meta.updatedAt > 0);
    this._assert('SaveMetaV2.createdAt === updatedAt', meta.createdAt === meta.updatedAt);
    this._assert('SaveMetaV2.migratedFromVersion = 0', meta.migratedFromVersion === 0);
    this._assert('SaveMetaV2.configVersions 是对象', typeof meta.configVersions === 'object');
    this._assert('SaveMetaV2.configVersions 为空', Object.keys(meta.configVersions).length === 0);
    this._assert('SaveMetaV2.lastRewardTransactionId 为空', meta.lastRewardTransactionId === '');

    // migratedFromVersion 非零
    const metaV7 = createDefaultSaveMetaV2(7);
    this._assert('SaveMetaV2 migratedFrom=7', metaV7.migratedFromVersion === 7);
  }

  // ==================== 2. SaveContainerV8 预留类型工厂测试 ====================

  static testReservedTypeFactories(): void {
    const chapter = createDefaultChapterSaveData();
    this._assert('ChapterSaveData.currentChapterId 为空', chapter.currentChapterId === '');
    this._assert('ChapterSaveData.unlockedChapterIds 是数组', Array.isArray(chapter.unlockedChapterIds));
    this._assert('ChapterSaveData.unlockedChapterIds 为空', chapter.unlockedChapterIds.length === 0);
    this._assert('ChapterSaveData.chapterCompletion 是对象', typeof chapter.chapterCompletion === 'object');

    const tutorial = createDefaultTutorialSaveData();
    this._assert('TutorialSaveData.currentStepId 为空', tutorial.currentStepId === '');
    this._assert('TutorialSaveData.completedStepIds 是数组', Array.isArray(tutorial.completedStepIds));
    this._assert('TutorialSaveData.isComplete = false', tutorial.isComplete === false);

    const analytics = createDefaultAnalyticsSaveData();
    this._assert('AnalyticsSaveData.totalSessions = 0', analytics.totalSessions === 0);
    this._assert('AnalyticsSaveData.totalPlayTimeMs = 0', analytics.totalPlayTimeMs === 0);
    this._assert('AnalyticsSaveData.totalBattles = 0', analytics.totalBattles === 0);
  }

  // ==================== 3. SaveContainerV8 工厂函数测试 ====================

  static testSaveContainerV8Factory(): void {
    const v8 = createDefaultSaveContainerV8();
    this._assert('V8.saveVersion === 8', v8.saveVersion === 8);
    this._assert('V8.timestamp > 0', v8.timestamp > 0);
    this._assert('V8.heroes 存在', v8.heroes !== undefined);
    this._assert('V8.heroes.heroStates 是对象', typeof v8.heroes!.heroStates === 'object');
    this._assert('V8.skills 存在', v8.skills !== undefined);
    this._assert('V8.formations 存在', v8.formations !== undefined);
    this._assert('V8.chapters 存在', v8.chapters !== undefined);
    this._assert('V8.tutorial 存在', v8.tutorial !== undefined);
    this._assert('V8.analytics 存在', v8.analytics !== undefined);
    this._assert('V8.saveMetaV2 存在', v8.saveMetaV2 !== undefined);
    this._assert('V8.saveMetaV2.migratedFromVersion = 0', v8.saveMetaV2.migratedFromVersion === 0);
    this._assert('V8.player 存在', !!v8.player);
    this._assert('V8.cards 是数组', Array.isArray(v8.cards));
    this._assert('V8.growth 存在', !!v8.growth);
    this._assert('V8.dungeon 存在', !!v8.dungeon);
    this._assert('V8.dropHistory 存在', !!v8.dropHistory);
  }

  // ==================== 4. SaveV2Migrator Hero 迁移测试 ====================

  static testHeroMigration(): void {
    // 构建 V7 容器
    const container = createDefaultSaveContainer();
    container.cards = [
      { cardId: 1, level: 5, star: 2, exp: 150 },
      { cardId: 2, level: 10, star: 3, exp: 500 },
      { cardId: 3, level: 1, star: 0, exp: 0 },
    ];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 5, exp: 150, power: 1200 },
      { heroId: 'hero_002', level: 10, exp: 500, power: 3500 },
      { heroId: 'hero_003', level: 1, exp: 0, power: 100 },
    ];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('Hero迁移: success=true', result.success);
    this._assert('Hero迁移: heroesMigrated=3', result.heroesMigrated === 3);

    const v8 = container as SaveContainerV8;
    this._assert('Hero迁移: heroes 存在', !!v8.heroes);
    this._assert('Hero迁移: hero_001 存在', !!v8.heroes!.heroStates['hero_001']);
    this._assert('Hero迁移: hero_002 存在', !!v8.heroes!.heroStates['hero_002']);
    this._assert('Hero迁移: hero_003 存在', !!v8.heroes!.heroStates['hero_003']);

    // hero_001 验证
    const h1 = v8.heroes!.heroStates['hero_001'];
    this._assert('hero_001.level = 5', h1.level === 5);
    this._assert('hero_001.star = 2', h1.star === 2);
    this._assert('hero_001.exp = 150', h1.exp === 150);
    this._assert('hero_001.power = 1200', h1.power === 1200);
    this._assert('hero_001.unlocked = true', h1.unlocked === true);
    this._assert('hero_001.breakthrough = 0', h1.breakthrough === 0);

    // hero_002 验证
    const h2 = v8.heroes!.heroStates['hero_002'];
    this._assert('hero_002.level = 10', h2.level === 10);
    this._assert('hero_002.star = 3', h2.star === 3);
    this._assert('hero_002.power = 3500', h2.power === 3500);

    // saveVersion 已更新
    this._assert('Hero迁移: saveVersion = 8', container.saveVersion === 8);
  }

  // ==================== 5. Hero 迁移 — 仅 cards 无 growth ====================

  static testHeroMigrationCardsOnly(): void {
    const container = createDefaultSaveContainer();
    container.cards = [
      { cardId: 1, level: 3, star: 1, exp: 80 },
    ];
    container.growth.heroProgressList = []; // 无 growth 数据

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('CardsOnly: success=true', result.success);
    this._assert('CardsOnly: heroesMigrated=1', result.heroesMigrated === 1);

    const v8 = container as SaveContainerV8;
    const h1 = v8.heroes!.heroStates['hero_001'];
    this._assert('CardsOnly: hero_001.level = 3 (from card)', h1.level === 3);
    this._assert('CardsOnly: hero_001.star = 1', h1.star === 1);
    this._assert('CardsOnly: hero_001.exp = 80', h1.exp === 80);
    this._assert('CardsOnly: hero_001.power = 0 (no growth)', h1.power === 0);
  }

  // ==================== 6. Hero 迁移 — 仅 growth 无 cards ====================

  static testHeroMigrationGrowthOnly(): void {
    const container = createDefaultSaveContainer();
    container.cards = []; // 无 cards
    container.growth.heroProgressList = [
      { heroId: 'hero_005', level: 7, exp: 300, power: 2000 },
    ];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('GrowthOnly: success=true', result.success);
    this._assert('GrowthOnly: heroesMigrated=1', result.heroesMigrated === 1);

    const v8 = container as SaveContainerV8;
    const h5 = v8.heroes!.heroStates['hero_005'];
    this._assert('GrowthOnly: hero_005.level = 7', h5.level === 7);
    this._assert('GrowthOnly: hero_005.power = 2000', h5.power === 2000);
    this._assert('GrowthOnly: hero_005.star = 0 (no card)', h5.star === 0);
    this._assert('GrowthOnly: hero_005.unlocked = true', h5.unlocked === true);
  }

  // ==================== 7. Hero 迁移 — 空数据 ====================

  static testHeroMigrationEmpty(): void {
    const container = createDefaultSaveContainer();
    container.cards = [];
    container.growth.heroProgressList = [];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('EmptyHero: success=true', result.success);
    this._assert('EmptyHero: heroesMigrated=0', result.heroesMigrated === 0);

    const v8 = container as SaveContainerV8;
    this._assert('EmptyHero: heroes 存在', !!v8.heroes);
    this._assert('EmptyHero: heroStates 为空', Object.keys(v8.heroes!.heroStates).length === 0);
  }

  // ==================== 8. Skill 迁移 — 有 heroDefaultSkillMap ====================

  static testSkillMigrationWithMap(): void {
    const container = createDefaultSaveContainer();
    container.cards = [
      { cardId: 1, level: 5, star: 2, exp: 150 },
      { cardId: 2, level: 10, star: 3, exp: 500 },
    ];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 5, exp: 150, power: 1200 },
      { heroId: 'hero_002', level: 10, exp: 500, power: 3500 },
    ];

    const heroDefaultSkillMap = new Map<string, string[]>([
      ['hero_001', ['skill_001', 'skill_002']],
      ['hero_002', ['skill_003', 'skill_004']],
    ]);

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container, heroDefaultSkillMap);

    this._assert('SkillWithMap: success=true', result.success);
    this._assert('SkillWithMap: skillsMigrated >= 4', result.skillsMigrated >= 4);

    const v8 = container as SaveContainerV8;
    this._assert('SkillWithMap: skills 存在', !!v8.skills);

    // 验证 skill states
    const skills = v8.skills!.skillStates;
    this._assert('SkillWithMap: skill_001 存在', !!skills['skill_001']);
    this._assert('SkillWithMap: skill_001.level = 1', skills['skill_001']?.level === 1);
    this._assert('SkillWithMap: skill_002 存在', !!skills['skill_002']);
    this._assert('SkillWithMap: skill_003 存在', !!skills['skill_003']);
    this._assert('SkillWithMap: skill_004 存在', !!skills['skill_004']);

    // 验证 heroSkillLoadouts
    const loadouts = v8.skills!.heroSkillLoadouts;
    this._assert('SkillWithMap: hero_001 loadout 存在', !!loadouts['hero_001']);
    this._assert('SkillWithMap: hero_001 loadout.length = 2', loadouts['hero_001']?.length === 2);
    this._assert('SkillWithMap: hero_001[0] = skill_001', loadouts['hero_001'][0] === 'skill_001');
    this._assert('SkillWithMap: hero_001[1] = skill_002', loadouts['hero_001'][1] === 'skill_002');
    this._assert('SkillWithMap: hero_002 loadout 存在', !!loadouts['hero_002']);
  }

  // ==================== 9. Skill 迁移 — 无 heroDefaultSkillMap ====================

  static testSkillMigrationWithoutMap(): void {
    const container = createDefaultSaveContainer();
    container.cards = [{ cardId: 1, level: 1, star: 0, exp: 0 }];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 1, exp: 0, power: 0 },
    ];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('SkillWithoutMap: success=true', result.success);
    this._assert('SkillWithoutMap: skillsMigrated=0', result.skillsMigrated === 0);
    this._assert('SkillWithoutMap: warnings 有内容', result.warnings.length > 0);

    const v8 = container as SaveContainerV8;
    this._assert('SkillWithoutMap: skills 存在', !!v8.skills);
    this._assert('SkillWithoutMap: skillStates 为空', Object.keys(v8.skills!.skillStates).length === 0);
  }

  // ==================== 10. Formation 迁移测试 ====================

  static testFormationMigration(): void {
    const container = createDefaultSaveContainer();
    container.cards = [
      { cardId: 1, level: 10, star: 3, exp: 500 },
      { cardId: 2, level: 5, star: 2, exp: 150 },
      { cardId: 3, level: 15, star: 4, exp: 800 },
    ];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 10, exp: 500, power: 3500 },
      { heroId: 'hero_002', level: 5, exp: 150, power: 1200 },
      { heroId: 'hero_003', level: 15, exp: 800, power: 5000 },
    ];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('Formation: success=true', result.success);
    this._assert('Formation: formationsCreated=1', result.formationsCreated === 1);

    const v8 = container as SaveContainerV8;
    this._assert('Formation: formations 存在', !!v8.formations);

    const presets = v8.formations!.presets;
    this._assert('Formation: default_pve 存在', !!presets['default_pve']);

    const pve = presets['default_pve'];
    this._assert('Formation: pve.mode = pve', pve.mode === 'pve');
    this._assert('Formation: pve.name = 默认推图队', pve.name === '默认推图队');
    this._assert('Formation: pve.slots.length = 5', pve.slots.length === 5);

    // 按战力降序：hero_003(5000) > hero_001(3500) > hero_002(1200)
    this._assert('Formation: slot[0] hero_003 (最高战力)', pve.slots[0].heroId === 'hero_003');
    this._assert('Formation: slot[1] hero_001', pve.slots[1].heroId === 'hero_001');
    this._assert('Formation: slot[2] hero_002', pve.slots[2].heroId === 'hero_002');
    this._assert('Formation: slot[3] 为空', pve.slots[3].heroId === null);
    this._assert('Formation: slot[4] 为空', pve.slots[4].heroId === null);

    // 激活状态
    this._assert('Formation: activePresetIds.pve = default_pve', v8.formations!.activePresetIds.pve === 'default_pve');
  }

  // ==================== 11. Formation 迁移 — 空英雄 ====================

  static testFormationMigrationEmpty(): void {
    const container = createDefaultSaveContainer();
    container.cards = [];
    container.growth.heroProgressList = [];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('FormationEmpty: success=true', result.success);

    const v8 = container as SaveContainerV8;
    const pve = v8.formations!.presets['default_pve'];
    this._assert('FormationEmpty: default_pve 存在', !!pve);
    this._assert('FormationEmpty: 所有槽位为空', pve.slots.every((s) => s.heroId === null));
    this._assert('FormationEmpty: warnings 中有空槽警告',
      result.warnings.some((w) => w.includes('不足阵容槽位数')));
  }

  // ==================== 12. 完整 V7→V8 迁移 ====================

  static testFullV7ToV8Migration(): void {
    const container = createDefaultSaveContainer();
    container.saveVersion = 7;
    container.cards = [
      { cardId: 1, level: 8, star: 2, exp: 300 },
      { cardId: 2, level: 12, star: 3, exp: 600 },
    ];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 8, exp: 300, power: 2500 },
      { heroId: 'hero_002', level: 12, exp: 600, power: 4200 },
    ];

    const heroDefaultSkillMap = new Map<string, string[]>([
      ['hero_001', ['skill_001', 'skill_002']],
      ['hero_002', ['skill_003']],
    ]);

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container, heroDefaultSkillMap);

    // 总体结果
    this._assert('FullMigration: success=true', result.success);
    this._assert('FullMigration: errors 为空', result.errors.length === 0);

    // Hero 验证
    const v8 = container as SaveContainerV8;
    this._assert('FullMigration: heroes 存在', !!v8.heroes);
    this._assert('FullMigration: 2 heroes', Object.keys(v8.heroes!.heroStates).length === 2);

    // Skill 验证
    this._assert('FullMigration: skills 存在', !!v8.skills);
    this._assert('FullMigration: 3 skill states', Object.keys(v8.skills!.skillStates).length >= 3);
    this._assert('FullMigration: hero_001 loadout.length=2', v8.skills!.heroSkillLoadouts['hero_001']?.length === 2);
    this._assert('FullMigration: hero_002 loadout.length=1', v8.skills!.heroSkillLoadouts['hero_002']?.length === 1);

    // Formation 验证
    this._assert('FullMigration: formations 存在', !!v8.formations);

    // SaveMetaV2 验证
    this._assert('FullMigration: saveMetaV2 存在', !!v8.saveMetaV2);
    this._assert('FullMigration: migratedFromVersion=7', v8.saveMetaV2.migratedFromVersion === 7);

    // 预留字段
    this._assert('FullMigration: chapters 存在', !!v8.chapters);
    this._assert('FullMigration: tutorial 存在', !!v8.tutorial);
    this._assert('FullMigration: analytics 存在', !!v8.analytics);

    // saveVersion
    this._assert('FullMigration: saveVersion=8', v8.saveVersion === 8);
  }

  // ==================== 13. 完整迁移 — 空容器 ====================

  static testFullMigrationEmptyContainer(): void {
    const container = createDefaultSaveContainer();
    container.saveVersion = 0; // V0 容器
    container.cards = [];
    container.growth.heroProgressList = [];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('EmptyFullMigration: success=true', result.success);
    this._assert('EmptyFullMigration: heroesMigrated=0', result.heroesMigrated === 0);
    this._assert('EmptyFullMigration: skillsMigrated=0', result.skillsMigrated === 0);
    this._assert('EmptyFullMigration: formationsCreated=1', result.formationsCreated === 1);

    const v8 = container as SaveContainerV8;
    this._assert('EmptyFullMigration: saveMetaV2 存在', !!v8.saveMetaV2);
  }

  // ==================== 14. cardId→heroId 转换测试 ====================

  static testCardIdToHeroIdConversion(): void {
    const container = createDefaultSaveContainer();
    container.cards = [
      { cardId: 1, level: 1, star: 0, exp: 0 },
      { cardId: 42, level: 1, star: 0, exp: 0 },
      { cardId: 100, level: 1, star: 0, exp: 0 },
      { cardId: 999, level: 1, star: 0, exp: 0 },
    ];

    const migrator = new SaveV2Migrator();
    migrator.migrateV7ToV8(container);

    const v8 = container as SaveContainerV8;
    this._assert('cardId→heroId: hero_001 exists', !!v8.heroes!.heroStates['hero_001']);
    this._assert('cardId→heroId: hero_042 exists', !!v8.heroes!.heroStates['hero_042']);
    this._assert('cardId→heroId: hero_100 exists', !!v8.heroes!.heroStates['hero_100']);
    this._assert('cardId→heroId: hero_999 exists', !!v8.heroes!.heroStates['hero_999']);
  }

  // ==================== 15. upgradeToV8 函数测试 ====================

  static testUpgradeToV8(): void {
    const v7container = createDefaultSaveContainer();
    v7container.saveVersion = 7;

    const v8 = upgradeToV8(v7container);

    this._assert('upgradeToV8: saveVersion=8', v8.saveVersion === 8);
    this._assert('upgradeToV8: heroes exists', !!v8.heroes);
    this._assert('upgradeToV8: skills exists', !!v8.skills);
    this._assert('upgradeToV8: formations exists', !!v8.formations);
    this._assert('upgradeToV8: saveMetaV2 exists', !!v8.saveMetaV2);
    this._assert('upgradeToV8: same reference returned', v8 === v7container);
    this._assert('upgradeToV8: saveMetaV2.migratedFromVersion', v8.saveMetaV2.migratedFromVersion === 7);
  }

  // ==================== 16. SaveMetaV2 从迁移创建 ====================

  static testSaveMetaV2FromMigration(): void {
    const container = createDefaultSaveContainer();
    container.saveVersion = 7;
    container.cards = [{ cardId: 1, level: 1, star: 0, exp: 0 }];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 1, exp: 0, power: 0 },
    ];

    const migrator = new SaveV2Migrator();
    migrator.migrateV7ToV8(container);

    const v8 = container as SaveContainerV8;
    const meta = v8.saveMetaV2;
    this._assert('MetaFromMigration: createdAt > 0', meta.createdAt > 0);
    this._assert('MetaFromMigration: updatedAt > 0', meta.updatedAt > 0);
    this._assert('MetaFromMigration: migratedFromVersion=7', meta.migratedFromVersion === 7);
    this._assert('MetaFromMigration: configVersions is object', typeof meta.configVersions === 'object');
    this._assert('MetaFromMigration: lastRewardTransactionId=""', meta.lastRewardTransactionId === '');
  }

  // ==================== 17. V7→V8 迁移步骤注册 ====================

  static testMigrationStepRegistration(): void {
    const system = SaveMigrationSystem.getInstance();
    system.clearHistory();
    system.registerDefaultSteps();

    const steps = system.getMigrationSteps();
    const v7ToV8Step = steps.find((s) => s.fromVersion === 7 && s.toVersion === 8);

    this._assert('MigrationStep: V7→V8 step registered', !!v7ToV8Step);
    this._assert('MigrationStep: description 包含 SaveV2',
      v7ToV8Step?.description?.includes('SaveV2') ?? false);
    this._assert('MigrationStep: migrate fn exists', typeof v7ToV8Step?.migrate === 'function');
  }

  // ==================== 18. 迁移结果结构测试 ====================

  static testMigrationResultStructure(): void {
    const container = createDefaultSaveContainer();
    container.cards = [{ cardId: 1, level: 1, star: 0, exp: 0 }];
    container.growth.heroProgressList = [
      { heroId: 'hero_001', level: 1, exp: 0, power: 0 },
    ];

    const migrator = new SaveV2Migrator();
    const result = migrator.migrateV7ToV8(container);

    this._assert('Result: success 是 boolean', typeof result.success === 'boolean');
    this._assert('Result: heroesMigrated 是 number', typeof result.heroesMigrated === 'number');
    this._assert('Result: skillsMigrated 是 number', typeof result.skillsMigrated === 'number');
    this._assert('Result: formationsCreated 是 number', typeof result.formationsCreated === 'number');
    this._assert('Result: warnings 是 array', Array.isArray(result.warnings));
    this._assert('Result: errors 是 array', Array.isArray(result.errors));
  }

  // ==================== 19. HeroSaveData 默认数据测试 ====================

  static testHeroSaveDataDefaults(): void {
    const heroSave = createDefaultHeroSaveData();
    this._assert('HeroSaveData.saveVersion=1', heroSave.saveVersion === 1);
    this._assert('HeroSaveData.updatedAt > 0', heroSave.updatedAt > 0);
    this._assert('HeroSaveData.heroStates 是对象', typeof heroSave.heroStates === 'object');
    this._assert('HeroSaveData.heroStates 为空', Object.keys(heroSave.heroStates).length === 0);
  }

  // ==================== 20. SkillSaveData 默认数据测试 ====================

  static testSkillSaveDataDefaults(): void {
    const skillSave = createDefaultSkillSaveData();
    this._assert('SkillSaveData.saveVersion=1', skillSave.saveVersion === 1);
    this._assert('SkillSaveData.updatedAt > 0', skillSave.updatedAt > 0);
    this._assert('SkillSaveData.skillStates 是对象', typeof skillSave.skillStates === 'object');
    this._assert('SkillSaveData.skillStates 为空', Object.keys(skillSave.skillStates).length === 0);
    this._assert('SkillSaveData.heroSkillLoadouts 是对象', typeof skillSave.heroSkillLoadouts === 'object');
    this._assert('SkillSaveData.heroSkillLoadouts 为空', Object.keys(skillSave.heroSkillLoadouts).length === 0);
  }

  // ==================== 21. FormationSaveData 默认数据测试 ====================

  static testFormationSaveDataDefaults(): void {
    const fmSave = createDefaultFormationSaveData();
    this._assert('FormationSaveData.saveVersion=1', fmSave.saveVersion === 1);
    this._assert('FormationSaveData.updatedAt > 0', fmSave.updatedAt > 0);
    this._assert('FormationSaveData.presets 是对象', typeof fmSave.presets === 'object');
    this._assert('FormationSaveData.presets 为空', Object.keys(fmSave.presets).length === 0);
    this._assert('FormationSaveData.activePresetIds 是对象', typeof fmSave.activePresetIds === 'object');
  }

  // ==================== 22. Event 事件发射测试 ====================

  static testEventEmission(): void {
    this._eventLog = [];

    const onMigrated = (data: unknown): void => {
      this._eventLog.push(`migrated:${JSON.stringify(data)}`);
    };
    const onV8Loaded = (data: unknown): void => {
      this._eventLog.push(`v8Loaded:${JSON.stringify(data)}`);
    };

    EventManager.getInstance().on(EventManager.SAVE_MIGRATED, onMigrated);
    EventManager.getInstance().on(EventManager.SAVE_V8_LOADED, onV8Loaded);

    // 模拟迁移事件
    EventManager.getInstance().emit(EventManager.SAVE_MIGRATED, {
      fromVersion: 7,
      toVersion: 8,
      stepsExecuted: 1,
    });

    // 模拟 V8 加载事件
    EventManager.getInstance().emit(EventManager.SAVE_V8_LOADED, {
      version: 8,
      timestamp: Date.now(),
    });

    // 清理
    EventManager.getInstance().off(EventManager.SAVE_MIGRATED, onMigrated);
    EventManager.getInstance().off(EventManager.SAVE_V8_LOADED, onV8Loaded);

    this._assert('Event: save:migrated received', this._eventLog.some((l) => l.startsWith('migrated:')));
    this._assert('Event: save:v8Loaded received', this._eventLog.some((l) => l.startsWith('v8Loaded:')));
    this._assert('Event: both events received', this._eventLog.length === 2);
  }

  // ==================== 23. CURRENT_SAVE_VERSION 测试 ====================

  static testCurrentSaveVersion(): void {
    this._assert('CURRENT_SAVE_VERSION = 8', CURRENT_SAVE_VERSION === 8);
    this._assert('CURRENT_SAVE_VERSION is number', typeof CURRENT_SAVE_VERSION === 'number');
  }

  // ==================== 辅助方法 ====================

  private static _assert(name: string, condition: boolean, message?: string): void {
    const passed = condition === true;
    this._results.push({
      name,
      passed,
      message: message ?? (passed ? 'PASS' : `FAIL: expected true, got ${String(condition)}`),
    });

    if (!passed) {
      console.warn(`  [FAIL] ${name} — ${this._results[this._results.length - 1].message}`);
    }
  }

  private static printSummary(): void {
    const total = this._results.length;
    const passed = this._results.filter((r) => r.passed).length;
    const failed = total - passed;

    console.log('\n========== Phase9-Step6 SaveV2 测试汇总 ==========');
    console.log(`  总计: ${total}  通过: ${passed}  失败: ${failed}`);

    if (failed > 0) {
      console.warn('\n  失败明细:');
      for (const r of this._results.filter((r) => !r.passed)) {
        console.warn(`    - ${r.name}: ${r.message}`);
      }
    }

    if (passed === total) {
      console.log('  所有测试通过！\n');
    } else {
      console.warn(`\n  测试完成率: ${((passed / total) * 100).toFixed(1)}%\n`);
    }
  }
}
