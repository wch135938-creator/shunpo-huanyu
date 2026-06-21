// ============================================================
// Phase9Step2DebugRunner — Phase9-Step2 SkillSystem 集成测试
// 职责：验证 SkillRepository / SkillSystem / SkillRuntimeResolver / Event
// 用法：在 Cocos Creator 控制台执行 Phase9Step2DebugRunner.runAll()
// ============================================================

import { SkillRepository } from '../skill/SkillRepository';
import { SkillSystem } from '../skill/SkillSystem';
import { SkillRuntimeResolver } from '../skill/SkillRuntimeResolver';
import { EventManager } from '../core/EventManager';
import type {
  SkillConfig,
  SkillRuntimeState,
  SkillRuntimeSnapshot,
  SkillEffectConfig,
  CompiledSkillEffect,
} from '../skill/SkillTypes';
import {
  createDefaultSkillRuntimeState,
  createEmptySkillSnapshot,
} from '../skill/SkillTypes';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step2DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase9-Step2 SkillSystem 测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase9-Step2 SkillSystem 集成测试 ==========\n');

    // 1. SkillTypes 工厂函数测试
    this.testSkillTypesFactories();

    // 2. SkillRepository 配置加载测试
    await this.testSkillRepositoryLoad();

    // 3. SkillRepository 查询测试
    this.testSkillRepositoryQueries();

    // 4. SkillSystem 初始化测试
    await this.testSkillSystemInitialize();

    // 5. SkillSystem 技能解锁测试
    this.testSkillUnlock();

    // 6. SkillSystem 技能查询测试
    this.testSkillQueries();

    // 7. SkillSystem 等级提升测试
    this.testSkillLevelUp();

    // 8. SkillSystem 技能装配测试
    this.testSkillEquip();

    // 9. SkillSystem 技能卸载测试
    this.testSkillUnequip();

    // 10. SkillSystem 装配边界测试
    this.testSkillEquipEdgeCases();

    // 11. SkillRuntimeResolver 快照解析测试
    this.testSnapshotResolver();

    // 12. SkillRuntimeResolver 效果编译测试
    this.testEffectCompilation();

    // 13. SkillRuntimeResolver 批量解析测试
    this.testBatchResolution();

    // 14. SkillRuntimeResolver 工具方法测试
    this.testResolverUtils();

    // 15. SkillSystem 快照生成测试
    this.testSkillSnapshot();

    // 16. SkillSystem 英雄快照测试
    this.testHeroSkillSnapshots();

    // 17. EventManager 事件集成测试
    this.testEventIntegration();

    // 18. SkillSystem save/restore 测试
    this.testSaveRestore();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1. SkillTypes 工厂函数测试 ====================

  static testSkillTypesFactories(): void {
    const state = createDefaultSkillRuntimeState('skill_test');
    this._assert('SkillRuntimeState.skillId = skill_test', state.skillId === 'skill_test');
    this._assert('SkillRuntimeState.level = 1', state.level === 1);
    this._assert('SkillRuntimeState.unlocked = false', !state.unlocked);
    this._assert('SkillRuntimeState.unlockedAt = 0', state.unlockedAt === 0);
    this._assert('SkillRuntimeState.updatedAt > 0', state.updatedAt > 0);

    const snapshot = createEmptySkillSnapshot('skill_empty');
    this._assert('EmptySnapshot.skillId = skill_empty', snapshot.skillId === 'skill_empty');
    this._assert('EmptySnapshot.name = empty', snapshot.name === '');
    this._assert('EmptySnapshot.level = 1', snapshot.level === 1);
    this._assert('EmptySnapshot.effects = []', snapshot.effects.length === 0);
    this._assert('EmptySnapshot.capturedAt > 0', snapshot.capturedAt > 0);
  }

  // ==================== 2. SkillRepository 配置加载测试 ====================

  static async testSkillRepositoryLoad(): Promise<void> {
    try {
      const repository = SkillRepository.getInstance();
      await repository.loadConfig();
      this._assert('SkillRepository 配置加载成功', repository.isLoaded());
      this._assert('SkillRepository 技能数量 = 10', repository.getSkillCount() === 10);
    } catch (e) {
      this._assert(`SkillRepository 配置加载失败: ${e}`, false);
    }
  }

  // ==================== 3. SkillRepository 查询测试 ====================

  static testSkillRepositoryQueries(): void {
    const repository = SkillRepository.getInstance();

    const skill1 = repository.getSkillConfig('skill_001');
    this._assert('getSkillConfig(skill_001) 存在', skill1 !== null);
    if (skill1) {
      this._assert('skill_001 name = 剑斩', skill1.name === '剑斩');
      this._assert('skill_001 type = 普攻', skill1.type === '普攻');
      this._assert('skill_001 targetType = 单体', skill1.targetType === '单体');
      this._assert('skill_001 damageType = 物理', skill1.damageType === '物理');
      this._assert('skill_001 cooldownMs = 0', skill1.cooldownMs === 0);
      this._assert('skill_001 maxLevel = 10', skill1.maxLevel === 10);
    }

    const skill2 = repository.getSkillConfig('skill_002');
    this._assert('getSkillConfig(skill_002) 存在', skill2 !== null);
    if (skill2) {
      this._assert('skill_002 type = 主动', skill2.type === '主动');
      this._assert('skill_002 cooldownMs = 3000', skill2.cooldownMs === 3000);
      this._assert('skill_002 energyCost = 30', skill2.energyCost === 30);
    }

    const skill3 = repository.getSkillConfig('skill_003');
    this._assert('getSkillConfig(skill_003) 存在', skill3 !== null);
    if (skill3) {
      this._assert('skill_003 type = 主动', skill3.type === '主动');
      this._assert('skill_003 targetType = 群体', skill3.targetType === '群体');
      this._assert('skill_003 damageType = 法术', skill3.damageType === '法术');
    }

    const skill5 = repository.getSkillConfig('skill_005');
    this._assert('getSkillConfig(skill_005) 存在', skill5 !== null);
    if (skill5) {
      this._assert('skill_005 damageType = 治疗', skill5.damageType === '治疗');
    }

    const skill9 = repository.getSkillConfig('skill_009');
    this._assert('getSkillConfig(skill_009) 存在', skill9 !== null);
    if (skill9) {
      this._assert('skill_009 type = 被动', skill9.type === '被动');
      this._assert('skill_009 targetType = 自身', skill9.targetType === '自身');
    }

    const nonExistent = repository.getSkillConfig('skill_999');
    this._assert('getSkillConfig(skill_999) = null', nonExistent === null);

    const allConfigs = repository.getAllSkillConfigs();
    this._assert('getAllSkillConfigs() 长度 = 10', allConfigs.length === 10);

    const allIds = repository.getAllSkillIds();
    this._assert('getAllSkillIds() 包含 skill_005', allIds.includes('skill_005'));
    this._assert('getAllSkillIds() 包含 skill_010', allIds.includes('skill_010'));
  }

  // ==================== 4. SkillSystem 初始化测试 ====================

  static async testSkillSystemInitialize(): Promise<void> {
    try {
      const skillSystem = SkillSystem.getInstance();
      const result = await skillSystem.initialize();
      this._assert('SkillSystem 初始化成功', result && skillSystem.isInitialized());
    } catch (e) {
      this._assert(`SkillSystem 初始化失败: ${e}`, false);
    }
  }

  // ==================== 5. SkillSystem 技能解锁测试 ====================

  static testSkillUnlock(): void {
    const skillSystem = SkillSystem.getInstance();

    // 正常解锁
    const unlocked = skillSystem.unlockSkill('skill_001');
    this._assert('unlockSkill(skill_001) 成功', unlocked);
    this._assert('hasSkill(skill_001) = true', skillSystem.hasSkill('skill_001'));

    // 幂等
    const doubleUnlock = skillSystem.unlockSkill('skill_001');
    this._assert('重复 unlockSkill(skill_001) = false（幂等）', !doubleUnlock);

    // 批量解锁
    const count = skillSystem.unlockSkills([
      'skill_002', 'skill_003', 'skill_004', 'skill_005',
      'skill_006', 'skill_007', 'skill_008', 'skill_009', 'skill_010',
    ]);
    this._assert('批量解锁 9 个技能', count === 9);

    // 全部已解锁
    for (let i = 1; i <= 10; i++) {
      const id = `skill_00${i}`;
      if (i === 10) {
        this._assert(`hasSkill(skill_010) = true`, skillSystem.hasSkill('skill_010'));
      } else {
        this._assert(`hasSkill(${id}) = true`, skillSystem.hasSkill(id));
      }
    }

    // 不存在技能解锁失败
    const invalidUnlock = skillSystem.unlockSkill('skill_999');
    this._assert('unlockSkill(skill_999) = false（配置不存在）', !invalidUnlock);
  }

  // ==================== 6. SkillSystem 技能查询测试 ====================

  static testSkillQueries(): void {
    const skillSystem = SkillSystem.getInstance();

    const skill1 = skillSystem.getSkill('skill_001');
    this._assert('getSkill(skill_001) 非 null', skill1 !== null);
    if (skill1) {
      this._assert('skill_001.unlocked = true', skill1.unlocked);
      this._assert('skill_001.level = 1', skill1.level === 1);
    }

    const allSkills = skillSystem.getAllSkills();
    this._assert('getAllSkills() 共 10 个', allSkills.length === 10);

    const unlockedSkills = skillSystem.getUnlockedSkills();
    this._assert('getUnlockedSkills() 共 10 个', unlockedSkills.length === 10);

    const nonExistent = skillSystem.getSkill('skill_999');
    this._assert('getSkill(skill_999) = null', nonExistent === null);

    this._assert('hasSkill(skill_999) = false', !skillSystem.hasSkill('skill_999'));
  }

  // ==================== 7. SkillSystem 等级提升测试 ====================

  static testSkillLevelUp(): void {
    const skillSystem = SkillSystem.getInstance();

    const skill1Before = skillSystem.getSkill('skill_001')!;
    this._assert('skill_001 初始 level = 1', skill1Before.level === 1);

    // 升 1 级
    const result1 = skillSystem.levelUpSkill('skill_001', 1);
    this._assert('levelUpSkill(skill_001, 1) 成功', result1);
    const skill1L2 = skillSystem.getSkill('skill_001')!;
    this._assert('skill_001 level = 2', skill1L2.level === 2);

    // 升 5 级
    skillSystem.levelUpSkill('skill_001', 5);
    const skill1L7 = skillSystem.getSkill('skill_001')!;
    this._assert('skill_001 level = 7', skill1L7.level === 7);

    // 尝试超过 maxLevel=10
    skillSystem.levelUpSkill('skill_001', 10);
    const skill1Capped = skillSystem.getSkill('skill_001')!;
    this._assert('skill_001 capped at maxLevel=10', skill1Capped.level === 10);

    // 已达到上限，再升级失败
    const cappedResult = skillSystem.levelUpSkill('skill_001', 1);
    this._assert('已到上限 levelUpSkill = false', !cappedResult);

    // 无效参数
    const invalidResult1 = skillSystem.levelUpSkill('skill_002', -1);
    this._assert('levelUpSkill -1 失败', !invalidResult1);

    const invalidResult2 = skillSystem.levelUpSkill('skill_002', 0);
    this._assert('levelUpSkill 0 失败', !invalidResult2);

    const invalidResult3 = skillSystem.levelUpSkill('skill_002', NaN);
    this._assert('levelUpSkill NaN 失败', !invalidResult3);

    // 未解锁技能升级失败
    const skillSystem2 = SkillSystem.getInstance();
    // 验证时不再有未解锁技能（已全部解锁），检查不存在的技能
    const invalidResult4 = skillSystem.levelUpSkill('skill_999');
    this._assert('levelUpSkill 不存在技能 失败', !invalidResult4);
  }

  // ==================== 8. SkillSystem 技能装配测试 ====================

  static testSkillEquip(): void {
    const skillSystem = SkillSystem.getInstance();

    // 装配技能到 hero_001
    const equip1 = skillSystem.equipSkill('hero_001', 'skill_001');
    this._assert('equipSkill(hero_001, skill_001) 成功', equip1);

    const equip2 = skillSystem.equipSkill('hero_001', 'skill_002');
    this._assert('equipSkill(hero_001, skill_002) 成功', equip2);

    const equip3 = skillSystem.equipSkill('hero_001', 'skill_003');
    this._assert('equipSkill(hero_001, skill_003) 成功', equip3);

    const equipped = skillSystem.getHeroEquippedSkillIds('hero_001');
    this._assert('hero_001 装备 3 个技能', equipped.length === 3);
    this._assert('hero_001 装备包含 skill_001', equipped.includes('skill_001'));
    this._assert('hero_001 装备包含 skill_002', equipped.includes('skill_002'));
    this._assert('hero_001 装备包含 skill_003', equipped.includes('skill_003'));

    // 重复装配失败
    const dupEquip = skillSystem.equipSkill('hero_001', 'skill_001');
    this._assert('重复装配 skill_001 失败', !dupEquip);

    // 装配第 4 个技能（达到上限）
    const equip4 = skillSystem.equipSkill('hero_001', 'skill_004');
    this._assert('equipSkill(hero_001, skill_004) 成功（第4槽）', equip4);

    // 第 5 个技能失败（超出槽位上限）
    const equip5 = skillSystem.equipSkill('hero_001', 'skill_005');
    this._assert('equipSkill 第5个技能失败（槽位已满）', !equip5);

    // 装配到另一个英雄
    const equipHero2 = skillSystem.equipSkill('hero_002', 'skill_001');
    this._assert('equipSkill(hero_002, skill_001) 成功', equipHero2);
    const hero2Equipped = skillSystem.getHeroEquippedSkillIds('hero_002');
    this._assert('hero_002 装备 1 个技能', hero2Equipped.length === 1);
  }

  // ==================== 9. SkillSystem 技能卸载测试 ====================

  static testSkillUnequip(): void {
    const skillSystem = SkillSystem.getInstance();

    // hero_001 当前有 4 个技能
    const beforeUnequip = skillSystem.getHeroEquippedSkillIds('hero_001');
    this._assert('卸载前 hero_001 有 4 个技能', beforeUnequip.length === 4);

    // 卸载 skill_002
    const unEquip1 = skillSystem.unequipSkill('hero_001', 'skill_002');
    this._assert('unequipSkill(hero_001, skill_002) 成功', unEquip1);

    const after1 = skillSystem.getHeroEquippedSkillIds('hero_001');
    this._assert('卸载后 hero_001 有 3 个技能', after1.length === 3);
    this._assert('卸载后不含 skill_002', !after1.includes('skill_002'));

    // 再次卸载同一技能失败
    const unEquipDup = skillSystem.unequipSkill('hero_001', 'skill_002');
    this._assert('重复卸载 skill_002 失败', !unEquipDup);

    // 卸载所有剩余技能
    skillSystem.unequipSkill('hero_001', 'skill_001');
    skillSystem.unequipSkill('hero_001', 'skill_003');
    skillSystem.unequipSkill('hero_001', 'skill_004');
    const emptyEquip = skillSystem.getHeroEquippedSkillIds('hero_001');
    this._assert('hero_001 所有技能已卸载', emptyEquip.length === 0);

    // 卸载不存在的 heroId
    const unEquipNoHero = skillSystem.unequipSkill('hero_999', 'skill_001');
    this._assert('unequipSkill(不存在的hero, skill_001) 失败', !unEquipNoHero);

    // 空 heroId 或空 skillId
    const unEquipEmpty1 = skillSystem.unequipSkill('', 'skill_001');
    this._assert('unequipSkill(空heroId) 失败', !unEquipEmpty1);

    const unEquipEmpty2 = skillSystem.unequipSkill('hero_001', '');
    this._assert('unequipSkill(空skillId) 失败', !unEquipEmpty2);
  }

  // ==================== 10. SkillSystem 装配边界测试 ====================

  static testSkillEquipEdgeCases(): void {
    const skillSystem = SkillSystem.getInstance();

    // 空参数
    const empty1 = skillSystem.equipSkill('', 'skill_001');
    this._assert('equipSkill(空heroId) 失败', !empty1);

    const empty2 = skillSystem.equipSkill('hero_001', '');
    this._assert('equipSkill(空skillId) 失败', !empty2);

    // 未解锁技能装配失败 — 先清数据再创建未解锁状态
    // 保存当前状态
    const savedData = skillSystem.save();

    // 只解锁少数技能，其余保持未解锁 — 使用 restore 模拟
    skillSystem.clearData();
    // 重新初始化但只解锁一个技能
    skillSystem.unlockSkill('skill_001');
    // 尝试装配未解锁的 skill_002（需要先让它在 runtime 中存在）
    const unEquipTest = skillSystem.equipSkill('hero_test', 'skill_002');
    this._assert('未解锁技能装配失败', !unEquipTest);

    // 恢复
    skillSystem.clearData();
    skillSystem.restore(savedData);

    // 不存在的技能
    const noConfig = skillSystem.equipSkill('hero_001', 'skill_999');
    this._assert('equipSkill 不存在技能 失败', !noConfig);
  }

  // ==================== 11. SkillRuntimeResolver 快照解析测试 ====================

  static testSnapshotResolver(): void {
    const resolver = SkillRuntimeResolver.getInstance();

    // 解析 skill_001 在 level=1 的快照
    const snap1 = resolver.resolveSkillSnapshot('skill_001', 1);
    this._assert('resolveSkillSnapshot(skill_001, 1) 非 null', snap1 !== null);
    if (snap1) {
      this._assert('snap1.skillId = skill_001', snap1.skillId === 'skill_001');
      this._assert('snap1.name = 剑斩', snap1.name === '剑斩');
      this._assert('snap1.type = 普攻', snap1.type === '普攻');
      this._assert('snap1.level = 1', snap1.level === 1);
      this._assert('snap1.cooldownMs = 0', snap1.cooldownMs === 0);
      this._assert('snap1.energyCost = 0', snap1.energyCost === 0);
      this._assert('snap1.effects 非空', snap1.effects.length > 0);
      this._assert('snap1.capturedAt > 0', snap1.capturedAt > 0);
    }

    // 解析 skill_003 在不同等级
    const snap3L1 = resolver.resolveSkillSnapshot('skill_003', 1);
    this._assert('skill_003 L1 有 2 个效果', snap3L1 !== null && snap3L1.effects.length === 2);

    const snap3L10 = resolver.resolveSkillSnapshot('skill_003', 10);
    if (snap3L10) {
      this._assert('skill_003 L10 effects[0].value > L1', snap3L1 &&
        snap3L10.effects[0].value > snap3L1.effects[0].value);
    }

    // 解析不存在的技能
    const nullSnap = resolver.resolveSkillSnapshot('skill_999', 1);
    this._assert('resolveSkillSnapshot(skill_999) = null', nullSnap === null);

    // 边界：level=0 → 自动修正为 level=1
    const snapLevel0 = resolver.resolveSkillSnapshot('skill_002', 0);
    this._assert('level=0 自动修正 level=1', snapLevel0 !== null && snapLevel0.level === 1);

    // 边界：level 超过 maxLevel → 自动修正为 maxLevel
    const snapOverflow = resolver.resolveSkillSnapshot('skill_002', 999);
    this._assert('level=999 自动修正为 maxLevel=10', snapOverflow !== null && snapOverflow.level === 10);

    // 被动技能快照
    const snapPassive = resolver.resolveSkillSnapshot('skill_009', 1);
    this._assert('skill_009 type = 被动', snapPassive !== null && snapPassive.type === '被动');
    this._assert('skill_009 targetType = 自身', snapPassive !== null && snapPassive.targetType === '自身');
  }

  // ==================== 12. SkillRuntimeResolver 效果编译测试 ====================

  static testEffectCompilation(): void {
    const effConfig: SkillEffectConfig = {
      effectId: 'EFF_TEST',
      effectType: 'damage',
      baseValue: 1.0,
      valuePerLevel: 0.1,
      durationMs: 500,
    };

    // level=1
    const compiled1 = SkillRuntimeResolver.compileEffect(effConfig, 1);
    this._assert('compileEffect L1: value=1.0', compiled1.value === 1.0);
    this._assert('compileEffect L1: durationMs=500', compiled1.durationMs === 500);
    this._assert('compileEffect L1: effectId=EFF_TEST', compiled1.effectId === 'EFF_TEST');
    this._assert('compileEffect L1: effectType=damage', compiled1.effectType === 'damage');

    // level=5
    const compiled5 = SkillRuntimeResolver.compileEffect(effConfig, 5);
    const expectedValue5 = 1.0 + 0.1 * 4; // = 1.4
    this._assert(`compileEffect L5: value=${expectedValue5}`, compiled5.value === expectedValue5);

    // level=10
    const compiled10 = SkillRuntimeResolver.compileEffect(effConfig, 10);
    const expectedValue10 = 1.0 + 0.1 * 9; // = 1.9
    this._assert(`compileEffect L10: value=${expectedValue10}`, compiled10.value === expectedValue10);

    // compileEffectValue 静态方法
    const val1 = SkillRuntimeResolver.compileEffectValue(effConfig, 1);
    this._assert('compileEffectValue L1 = 1.0', val1 === 1.0);

    const val10 = SkillRuntimeResolver.compileEffectValue(effConfig, 10);
    this._assert('compileEffectValue L10 = 1.9', val10 === 1.9);

    // 零成长效果
    const noGrowthConfig: SkillEffectConfig = {
      effectId: 'EFF_NO_GROW',
      effectType: 'buff',
      baseValue: 0.5,
      valuePerLevel: 0,
      durationMs: 0,
    };
    const compiledNoGrowth = SkillRuntimeResolver.compileEffect(noGrowthConfig, 10);
    this._assert('零成长效果 value=0.5', compiledNoGrowth.value === 0.5);

    // level=0 边界
    const compiled0 = SkillRuntimeResolver.compileEffect(effConfig, 0);
    this._assert('level=0 compileEffect value=1.0（安全处理）', compiled0.value === 1.0);

    // 批量编译
    const configs: SkillEffectConfig[] = [effConfig, noGrowthConfig];
    const compiled = SkillRuntimeResolver.compileEffects(configs, 3);
    this._assert('compileEffects 返回 2 个效果', compiled.length === 2);
  }

  // ==================== 13. SkillRuntimeResolver 批量解析测试 ====================

  static testBatchResolution(): void {
    const resolver = SkillRuntimeResolver.getInstance();

    const skillLevels = [
      { skillId: 'skill_001', level: 1 },
      { skillId: 'skill_002', level: 3 },
      { skillId: 'skill_003', level: 5 },
      { skillId: 'skill_999', level: 1 },  // 不存在
    ];

    const snapshots = resolver.resolveSkillSnapshots(skillLevels);
    this._assert('批量解析返回 3 个快照（过滤 null）', snapshots.length === 3);

    const hasSkill1 = snapshots.some((s) => s.skillId === 'skill_001');
    const hasSkill2 = snapshots.some((s) => s.skillId === 'skill_002');
    const hasSkill3 = snapshots.some((s) => s.skillId === 'skill_003');
    this._assert('批量解析包含 skill_001', hasSkill1);
    this._assert('批量解析包含 skill_002', hasSkill2);
    this._assert('批量解析包含 skill_003', hasSkill3);
  }

  // ==================== 14. SkillRuntimeResolver 工具方法测试 ====================

  static testResolverUtils(): void {
    const resolver = SkillRuntimeResolver.getInstance();

    // getTotalDamageMultiplier
    const dmg1 = resolver.getTotalDamageMultiplier('skill_001', 1);
    this._assert('skill_001 L1 totalDamage = 1.0', dmg1 === 1.0);

    const dmg2 = resolver.getTotalDamageMultiplier('skill_002', 10);
    const expectedDmg2 = 1.8 + 0.12 * 9; // = 2.88
    this._assert(`skill_002 L10 totalDamage = ${expectedDmg2}`, dmg2 === expectedDmg2);

    // skill_003 有 damage + dot 效果，只统计 damage
    const dmg3 = resolver.getTotalDamageMultiplier('skill_003', 1);
    this._assert('skill_003 L1 totalDamage = 1.2', dmg3 === 1.2);

    // skill_009 是 buff 被动，无 damage
    const dmg9 = resolver.getTotalDamageMultiplier('skill_009', 1);
    this._assert('skill_009 (buff) totalDamage = 0', dmg9 === 0);

    // getTotalHealMultiplier
    const heal5 = resolver.getTotalHealMultiplier('skill_005', 1);
    this._assert('skill_005 L1 totalHeal = 2.0', heal5 === 2.0);

    const heal6 = resolver.getTotalHealMultiplier('skill_006', 1);
    this._assert('skill_006 (shield) totalHeal = 3.0', heal6 === 3.0);

    // 不存在技能
    const dmgNull = resolver.getTotalDamageMultiplier('skill_999', 1);
    this._assert('不存在的技能 totalDamage = 0', dmgNull === 0);

    const healNull = resolver.getTotalHealMultiplier('skill_999', 1);
    this._assert('不存在的技能 totalHeal = 0', healNull === 0);
  }

  // ==================== 15. SkillSystem 快照生成测试 ====================

  static testSkillSnapshot(): void {
    const skillSystem = SkillSystem.getInstance();

    // 单个技能快照
    const snap1 = skillSystem.getSkillSnapshot('skill_001');
    this._assert('getSkillSnapshot(skill_001) 非 null', snap1 !== null);
    if (snap1) {
      this._assert('snap1.skillId = skill_001', snap1.skillId === 'skill_001');
      this._assert('snap1.name = 剑斩', snap1.name === '剑斩');
      this._assert('snap1.level > 0', snap1.level > 0);
      this._assert('snap1.effects 非空', snap1.effects.length > 0);
      this._assert('snap1.capturedAt > 0', snap1.capturedAt > 0);
    }

    // 未解锁技能快照 → null（需要测试场景）
    // 所有技能已解锁，这里验证不存在技能返回 null
    const nullSnap = skillSystem.getSkillSnapshot('skill_999');
    this._assert('getSkillSnapshot(skill_999) = null', nullSnap === null);

    // 全部已解锁快照
    const allSnaps = skillSystem.getSkillSnapshots();
    this._assert('getSkillSnapshots() 返回 10 个快照', allSnaps.length === 10);

    // 每个快照验证核心字段
    for (const snap of allSnaps) {
      const okName = typeof snap.name === 'string' && snap.name.length > 0;
      const okType = snap.type !== undefined;
      const okLevel = snap.level >= 1 && snap.level <= 10;
      if (!(okName && okType && okLevel)) {
        this._assert(`快照 ${snap.skillId} 字段完整性`, false);
      }
    }
  }

  // ==================== 16. SkillSystem 英雄技能快照测试 ====================

  static testHeroSkillSnapshots(): void {
    const skillSystem = SkillSystem.getInstance();

    // 先给 hero_001 装配技能
    skillSystem.equipSkill('hero_001', 'skill_001');
    skillSystem.equipSkill('hero_001', 'skill_002');
    skillSystem.equipSkill('hero_001', 'skill_005');

    const heroSnaps = skillSystem.getHeroSkillSnapshots('hero_001');
    this._assert('hero_001 技能快照 = 3 个', heroSnaps.length === 3);
    this._assert('hero_001 快照包含 skill_001', heroSnaps.some((s) => s.skillId === 'skill_001'));
    this._assert('hero_001 快照包含 skill_002', heroSnaps.some((s) => s.skillId === 'skill_002'));
    this._assert('hero_001 快照包含 skill_005', heroSnaps.some((s) => s.skillId === 'skill_005'));

    // 不存在的英雄返回空数组
    const noHeroSnaps = skillSystem.getHeroSkillSnapshots('hero_999');
    this._assert('不存在的英雄快照 = 空数组', noHeroSnaps.length === 0);

    // 获取已装配技能 ID
    const equippedIds = skillSystem.getHeroEquippedSkillIds('hero_001');
    this._assert('hero_001 装备 ID = 3', equippedIds.length === 3);

    // 清理
    skillSystem.unequipSkill('hero_001', 'skill_001');
    skillSystem.unequipSkill('hero_001', 'skill_002');
    skillSystem.unequipSkill('hero_001', 'skill_005');
  }

  // ==================== 17. EventManager 事件集成测试 ====================

  static testEventIntegration(): void {
    const eventManager = EventManager.getInstance();

    // 1. skill:unlocked 事件
    let unlockFired = false;
    const unlockCb = () => { unlockFired = true; };
    eventManager.on(SkillSystem.SKILL_UNLOCKED, unlockCb);
    eventManager.emit(SkillSystem.SKILL_UNLOCKED, { skillId: 'skill_test' } as any);
    this._assert('SKILL_UNLOCKED 事件正常触发', unlockFired);
    eventManager.off(SkillSystem.SKILL_UNLOCKED, unlockCb);

    // 2. skill:levelChanged 事件
    let levelChangedFired = false;
    const levelCb = () => { levelChangedFired = true; };
    eventManager.on(SkillSystem.SKILL_LEVEL_CHANGED, levelCb);
    eventManager.emit(SkillSystem.SKILL_LEVEL_CHANGED, {
      skillId: 'skill_test', oldLevel: 1, newLevel: 2,
    } as any);
    this._assert('SKILL_LEVEL_CHANGED 事件正常触发', levelChangedFired);
    eventManager.off(SkillSystem.SKILL_LEVEL_CHANGED, levelCb);

    // 3. skill:loadoutChanged 事件
    let loadoutFired = false;
    const loadoutCb = () => { loadoutFired = true; };
    eventManager.on(SkillSystem.SKILL_LOADOUT_CHANGED, loadoutCb);
    eventManager.emit(SkillSystem.SKILL_LOADOUT_CHANGED, {
      heroId: 'hero_test', previousSkillIds: [], currentSkillIds: ['skill_001'],
    } as any);
    this._assert('SKILL_LOADOUT_CHANGED 事件正常触发', loadoutFired);
    eventManager.off(SkillSystem.SKILL_LOADOUT_CHANGED, loadoutCb);

    // 4. skill:updated 事件
    let updatedFired = false;
    const updatedCb = () => { updatedFired = true; };
    eventManager.on(SkillSystem.SKILL_UPDATED, updatedCb);
    eventManager.emit(SkillSystem.SKILL_UPDATED, { skillId: 'skill_test' } as any);
    this._assert('SKILL_UPDATED 事件正常触发', updatedFired);
    eventManager.off(SkillSystem.SKILL_UPDATED, updatedCb);

    // 5. 验证事件常量值
    this._assert('SKILL_UNLOCKED = skill:unlocked', SkillSystem.SKILL_UNLOCKED === 'skill:unlocked');
    this._assert('SKILL_LEVEL_CHANGED = skill:levelChanged', SkillSystem.SKILL_LEVEL_CHANGED === 'skill:levelChanged');
    this._assert('SKILL_LOADOUT_CHANGED = skill:loadoutChanged', SkillSystem.SKILL_LOADOUT_CHANGED === 'skill:loadoutChanged');
    this._assert('SKILL_UPDATED = skill:updated', SkillSystem.SKILL_UPDATED === 'skill:updated');
  }

  // ==================== 18. save/restore 测试 ====================

  static testSaveRestore(): void {
    const skillSystem = SkillSystem.getInstance();

    // 1. 先准备好状态
    // 确保 hero_001 有装备
    skillSystem.equipSkill('hero_001', 'skill_001');
    skillSystem.equipSkill('hero_001', 'skill_002');

    // 保存当前状态
    const savedData = skillSystem.save();
    this._assert('save() 返回 SkillSaveData', savedData !== null);
    this._assert('saveData.skillStates 非空', Object.keys(savedData.skillStates).length > 0);
    this._assert('saveData.heroSkillLoadouts 非空', Object.keys(savedData.heroSkillLoadouts).length > 0);
    this._assert('saveData.saveVersion = 1', savedData.saveVersion === 1);
    this._assert('saveData.updatedAt > 0', savedData.updatedAt > 0);

    // 验证保存了已解锁技能及其属性
    const skill1State = savedData.skillStates['skill_001'];
    this._assert('存档包含 skill_001', skill1State !== undefined);
    if (skill1State) {
      this._assert('存档中 skill_001.unlocked = true', skill1State.unlocked);
      this._assert('存档中 skill_001.level > 0', skill1State.level > 0);
    }

    // 验证保存了英雄装配
    const hero1Loadout = savedData.heroSkillLoadouts['hero_001'];
    this._assert('存档包含 hero_001 装配', hero1Loadout !== undefined && hero1Loadout.length > 0);

    // 2. 修改状态后验证 round-trip
    const skill2BeforeSave = skillSystem.getSkill('skill_002')!;
    const levelUpResult = skillSystem.levelUpSkill('skill_002', 2);
    const skill2AfterLevel = skillSystem.getSkill('skill_002')!;

    // save 应捕获修改后的状态
    const savedData2 = skillSystem.save();
    const savedSkill2 = savedData2.skillStates['skill_002'];
    this._assert('save 捕获修改后的 skill_002.level', savedSkill2 &&
      savedSkill2.level === skill2AfterLevel.level);

    // 3. restore 应正确恢复状态
    skillSystem.restore(savedData);
    const skill2Restored = skillSystem.getSkill('skill_002')!;
    this._assert('restore 恢复 skill_002.level 为旧值', skill2Restored.level === skill2BeforeSave.level);

    // 验证装备也恢复了
    const hero1EquipRestored = skillSystem.getHeroEquippedSkillIds('hero_001');
    this._assert('restore 恢复 hero_001 装备', hero1EquipRestored.length > 0);

    // 4. 恢复回最新状态
    skillSystem.restore(savedData2);
    const skill2Back = skillSystem.getSkill('skill_002')!;
    this._assert('restore 恢复 skill_002.level 为新值', skill2Back.level === skill2AfterLevel.level);

    // 5. restore 空数据
    skillSystem.restore({ skillStates: {}, heroSkillLoadouts: {}, saveVersion: 1, updatedAt: 0 });
    this._assert('restore 空数据不崩溃（保留已有状态）', skillSystem.getSkill('skill_002') !== null);

    // 恢复真实数据
    skillSystem.restore(savedData2);

    // 6. restore null 数据
    skillSystem.restore(null as any);
    this._assert('restore null 不崩溃', true);

    // 7. hasSkill 验证
    this._assert('hasSkill(skill_001) = true', skillSystem.hasSkill('skill_001'));
    this._assert('hasSkill(skill_010) = true', skillSystem.hasSkill('skill_010'));

    // 清理 hero_001 装备
    skillSystem.unequipSkill('hero_001', 'skill_001');
    skillSystem.unequipSkill('hero_001', 'skill_002');
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
    console.log(`Phase9-Step2 SkillSystem 测试汇总`);
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
