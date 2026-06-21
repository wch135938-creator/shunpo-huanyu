// ============================================================
// Phase9Step3DebugRunner — Phase9-Step3 FormationSystem 集成测试
// 职责：验证 FormationTypes / FormationValidator / FormationSystem / TeamSnapshotBuilder / Event
// 用法：在 Cocos Creator 控制台执行 Phase9Step3DebugRunner.runAll()
// 覆盖：120+ 断言测试
// ============================================================

import { HeroSystem } from '../hero/HeroSystem';
import { SkillSystem } from '../skill/SkillSystem';
import { FormationSystem } from '../formation/FormationSystem';
import { FormationValidator } from '../formation/FormationValidator';
import { TeamSnapshotBuilder } from '../formation/TeamSnapshotBuilder';
import { EventManager } from '../core/EventManager';
import type {
  FormationPreset,
  FormationSlot,
  FormationMode,
  FormationValidationResult,
} from '../formation/FormationTypes';
import {
  createEmptySlots,
  createDefaultFormationPreset,
  createEmptyValidationResult,
  isValidSlotIndex,
  isFrontRowSlot,
  isBackRowSlot,
  isCoreFormationMode,
  FORMATION_SLOT_COUNT,
  FRONT_ROW_START,
  FRONT_ROW_END,
  BACK_ROW_START,
  BACK_ROW_END,
  CORE_FORMATION_MODES,
  RESERVED_FORMATION_MODES,
} from '../formation/FormationTypes';
import type { FormationSaveData } from '../save/FormationSaveData';
import { createDefaultFormationSaveData } from '../save/FormationSaveData';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step3DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase9-Step3 FormationSystem 测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase9-Step3 FormationSystem 集成测试 ==========\n');

    // 1. FormationTypes 常量 & 工厂函数
    this.testFormationTypesConstants();
    this.testFormationTypesFactories();

    // 2. FormationValidator 测试
    this.testValidatorMode();
    this.testValidatorSlots();
    this.testValidatorHeroOwnership();
    this.testValidatorPreset();
    this.testValidatorUtils();

    // 3. 确保 HeroSystem / SkillSystem / FormationSystem 初始化
    await this.ensureSystemsInitialized();

    // 4. FormationSystem 生命周期测试
    this.testFormationSystemInitialize();

    // 5. FormationSystem 默认阵容测试
    this.testDefaultPresets();

    // 6. FormationSystem CRUD 测试
    this.testPresetCreate();
    this.testPresetUpdate();
    this.testPresetDelete();

    // 7. FormationSystem 激活测试
    this.testActivePreset();

    // 8. FormationSystem 查询测试
    this.testQueryMethods();

    // 9. FormationSystem 校验测试
    this.testFormationValidation();

    // 10. TeamSnapshotBuilder 测试
    this.testTeamSnapshotBuilder();

    // 11. FormationSystem save/restore 测试
    this.testSaveRestore();

    // 12. FormationSystem 战力测试
    this.testPowerRecalculation();

    // 13. Event 集成测试
    this.testEventIntegration();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1a. FormationTypes 常量测试 ====================

  static testFormationTypesConstants(): void {
    this._assert('FORMATION_SLOT_COUNT = 5', FORMATION_SLOT_COUNT === 5);
    this._assert('FRONT_ROW_START = 0', FRONT_ROW_START === 0);
    this._assert('FRONT_ROW_END = 1', FRONT_ROW_END === 1);
    this._assert('BACK_ROW_START = 2', BACK_ROW_START === 2);
    this._assert('BACK_ROW_END = 4', BACK_ROW_END === 4);
    this._assert('CORE_FORMATION_MODES 包含 pve', CORE_FORMATION_MODES.includes('pve'));
    this._assert('CORE_FORMATION_MODES 包含 dungeon', CORE_FORMATION_MODES.includes('dungeon'));
    this._assert('CORE_FORMATION_MODES 包含 roguelike', CORE_FORMATION_MODES.includes('roguelike'));
    this._assert('CORE_FORMATION_MODES 包含 boss', CORE_FORMATION_MODES.includes('boss'));
    this._assert('CORE_FORMATION_MODES 共 4 个', CORE_FORMATION_MODES.length === 4);
    this._assert('RESERVED_FORMATION_MODES 包含 pvp_attack', RESERVED_FORMATION_MODES.includes('pvp_attack'));
    this._assert('RESERVED_FORMATION_MODES 包含 pvp_defense', RESERVED_FORMATION_MODES.includes('pvp_defense'));
    this._assert('RESERVED_FORMATION_MODES 包含 world_boss', RESERVED_FORMATION_MODES.includes('world_boss'));
    this._assert('RESERVED_FORMATION_MODES 包含 guild_boss', RESERVED_FORMATION_MODES.includes('guild_boss'));
    this._assert('RESERVED_FORMATION_MODES 共 4 个', RESERVED_FORMATION_MODES.length === 4);
  }

  // ==================== 1b. FormationTypes 工厂函数测试 ====================

  static testFormationTypesFactories(): void {
    // createEmptySlots
    const emptySlots = createEmptySlots();
    this._assert('createEmptySlots 返回 5 个槽位', emptySlots.length === 5);
    for (let i = 0; i < 5; i++) {
      this._assert(`槽位 ${i} index=${i}`, emptySlots[i].slotIndex === i);
      this._assert(`槽位 ${i} heroId=null`, emptySlots[i].heroId === null);
    }

    // createDefaultFormationPreset
    const preset = createDefaultFormationPreset('test_preset', '测试阵容', 'pve');
    this._assert('createDefaultFormationPreset id', preset.id === 'test_preset');
    this._assert('createDefaultFormationPreset name', preset.name === '测试阵容');
    this._assert('createDefaultFormationPreset mode', preset.mode === 'pve');
    this._assert('createDefaultFormationPreset teamPower=0', preset.teamPower === 0);
    this._assert('createDefaultFormationPreset slots 非空', preset.slots.length === 5);
    this._assert('createDefaultFormationPreset createdAt > 0', preset.createdAt > 0);

    // createDefaultFormationSaveData
    const saveData = createDefaultFormationSaveData();
    this._assert('createDefaultFormationSaveData presets={}', Object.keys(saveData.presets).length === 0);
    this._assert('createDefaultFormationSaveData activePresetIds={}', Object.keys(saveData.activePresetIds).length === 0);
    this._assert('createDefaultFormationSaveData saveVersion=1', saveData.saveVersion === 1);
    this._assert('createDefaultFormationSaveData updatedAt > 0', saveData.updatedAt > 0);

    // createEmptyValidationResult
    const valResult = createEmptyValidationResult();
    this._assert('createEmptyValidationResult valid=true', valResult.valid);
    this._assert('createEmptyValidationResult errors=[]', valResult.errors.length === 0);
    this._assert('createEmptyValidationResult warnings=[]', valResult.warnings.length === 0);

    // isFrontRowSlot
    this._assert('isFrontRowSlot(0) = true', isFrontRowSlot(0));
    this._assert('isFrontRowSlot(1) = true', isFrontRowSlot(1));
    this._assert('isFrontRowSlot(2) = false', !isFrontRowSlot(2));

    // isBackRowSlot
    this._assert('isBackRowSlot(2) = true', isBackRowSlot(2));
    this._assert('isBackRowSlot(4) = true', isBackRowSlot(4));
    this._assert('isBackRowSlot(1) = false', !isBackRowSlot(1));

    // isValidSlotIndex
    this._assert('isValidSlotIndex(0) = true', isValidSlotIndex(0));
    this._assert('isValidSlotIndex(4) = true', isValidSlotIndex(4));
    this._assert('isValidSlotIndex(-1) = false', !isValidSlotIndex(-1));
    this._assert('isValidSlotIndex(5) = false', !isValidSlotIndex(5));

    // isCoreFormationMode
    this._assert('isCoreFormationMode(pve) = true', isCoreFormationMode('pve'));
    this._assert('isCoreFormationMode(boss) = true', isCoreFormationMode('boss'));
    this._assert('isCoreFormationMode(pvp_attack) = false', !isCoreFormationMode('pvp_attack'));
  }

  // ==================== 2a. FormationValidator 模式测试 ====================

  static testValidatorMode(): void {
    const validator = new FormationValidator();

    // 有效模式
    const result1 = validator.validateMode('pve');
    this._assert('validateMode(pve) valid', result1.valid);

    const result2 = validator.validateMode('dungeon');
    this._assert('validateMode(dungeon) valid', result2.valid);

    const result3 = validator.validateMode('boss');
    this._assert('validateMode(boss) valid', result3.valid);

    const result4 = validator.validateMode('pvp_attack');
    this._assert('validateMode(pvp_attack) valid (预留)', result4.valid);

    const result5 = validator.validateMode('guild_boss');
    this._assert('validateMode(guild_boss) valid (预留)', result5.valid);

    // 无效模式
    const result6 = validator.validateMode('invalid_mode' as FormationMode);
    this._assert('validateMode(invalid) 失败', !result6.valid);

    // 空字符串（通过类型系统禁止，但运行时防御）
    const result7 = validator.validateMode('' as FormationMode);
    this._assert('validateMode("") 失败', !result7.valid);
  }

  // ==================== 2b. FormationValidator 槽位测试 ====================

  static testValidatorSlots(): void {
    const validator = new FormationValidator();

    // 正确槽位
    const validSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: 'hero_002' },
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: null },
      { slotIndex: 4, heroId: null },
    ];
    const result1 = validator.validateSlots(validSlots);
    this._assert('有效槽位通过校验', result1.valid);

    // 槽位数量不足
    const shortSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
    ];
    const result2 = validator.validateSlots(shortSlots);
    this._assert('槽位不足校验失败', !result2.valid);

    // 重复英雄
    const duplicateSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: 'hero_001' },
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: null },
      { slotIndex: 4, heroId: null },
    ];
    const result3 = validator.validateSlots(duplicateSlots);
    this._assert('重复英雄校验失败', !result3.valid);

    // 非法槽位索引
    const badIndexSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: null },
      { slotIndex: 1, heroId: null },
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: null },
      { slotIndex: 5, heroId: null },  // 非法索引
    ];
    const result4 = validator.validateSlots(badIndexSlots);
    this._assert('非法槽位索引校验失败', !result4.valid);

    // 全部空槽
    const allEmptySlots = createEmptySlots();
    const result5 = validator.validateSlots(allEmptySlots);
    this._assert('全部空槽通过校验（但有警告）', result5.valid);
    this._assert('全部空槽产生警告', result5.warnings.length > 0);

    // null slots
    const result6 = validator.validateSlots(null as unknown as FormationSlot[]);
    this._assert('null 槽位校验失败', !result6.valid);

    // 全满槽位（无重复）
    const fullSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: 'hero_002' },
      { slotIndex: 2, heroId: 'hero_003' },
      { slotIndex: 3, heroId: 'hero_004' },
      { slotIndex: 4, heroId: 'hero_005' },
    ];
    const result7 = validator.validateSlots(fullSlots);
    this._assert('满员无重复阵容通过校验', result7.valid);
  }

  // ==================== 2c. FormationValidator 英雄所有权测试 ====================

  static testValidatorHeroOwnership(): void {
    const validator = new FormationValidator();

    const slots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: 'hero_999' },  // 不存在
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: null },
      { slotIndex: 4, heroId: null },
    ];

    // Mock 所有权检查：hero_001 拥有，hero_999 不拥有
    const ownershipChecker = (heroId: string): boolean => {
      return heroId === 'hero_001';
    };

    const result = validator.validateHeroOwnership(slots, ownershipChecker);
    this._assert('所有权校验发现未拥有英雄', !result.valid);
    this._assert('所有权校验 1 个错误', result.errors.length === 1);

    // 全部拥有
    const allOwnedSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: null },
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: null },
      { slotIndex: 4, heroId: null },
    ];
    const result2 = validator.validateHeroOwnership(allOwnedSlots, ownershipChecker);
    this._assert('全部拥有英雄校验通过', result2.valid);

    // 空槽位（无英雄需要校验）
    const emptySlots = createEmptySlots();
    const result3 = validator.validateHeroOwnership(emptySlots, ownershipChecker);
    this._assert('空阵容所有权校验通过', result3.valid);

    // null ownership checker
    const result4 = validator.validateHeroOwnership(slots, null as unknown as (heroId: string) => boolean);
    this._assert('null checker 产生警告', result4.warnings.length > 0);
  }

  // ==================== 2d. FormationValidator 预设校验测试 ====================

  static testValidatorPreset(): void {
    const validator = new FormationValidator();

    const validPreset = createDefaultFormationPreset('test_valid', '测试', 'pve');
    validPreset.slots = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: null },
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: null },
      { slotIndex: 4, heroId: null },
    ];

    const result = validator.validatePreset(validPreset);
    this._assert('validatePreset 有效预设通过', result.valid);

    // null preset
    const result2 = validator.validatePreset(null as unknown as FormationPreset);
    this._assert('validatePreset(null) 失败', !result2.valid);

    // 非法模式
    const badPreset = createDefaultFormationPreset('bad_mode', '非法模式', 'bad' as FormationMode);
    const result3 = validator.validatePreset(badPreset);
    this._assert('validatePreset 非法模式失败', !result3.valid);

    // 带所有权校验的有效预设
    const ownershipChecker = (heroId: string): boolean => {
      return heroId !== 'hero_999';
    };
    const result4 = validator.validatePreset(validPreset, ownershipChecker);
    this._assert('validatePreset 带所有权检查通过', result4.valid);
  }

  // ==================== 2e. FormationValidator 工具方法测试 ====================

  static testValidatorUtils(): void {
    const validator = new FormationValidator();

    const slots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: 'hero_002' },
      { slotIndex: 2, heroId: null },
      { slotIndex: 3, heroId: '' },  // 空字符串视为空
      { slotIndex: 4, heroId: 'hero_003' },
    ];

    this._assert('countEmptySlots = 2', validator.countEmptySlots(slots) === 2);

    const filledIds = validator.getFilledHeroIds(slots);
    this._assert('getFilledHeroIds 返回 3 个', filledIds.length === 3);
    this._assert('getFilledHeroIds 包含 hero_001', filledIds.includes('hero_001'));
    this._assert('getFilledHeroIds 包含 hero_002', filledIds.includes('hero_002'));
    this._assert('getFilledHeroIds 包含 hero_003', filledIds.includes('hero_003'));

    // 全部空槽
    const emptySlots = createEmptySlots();
    this._assert('空阵容 countEmptySlots = 5', validator.countEmptySlots(emptySlots) === 5);
    this._assert('空阵容 getFilledHeroIds = []', validator.getFilledHeroIds(emptySlots).length === 0);
  }

  // ==================== 3. 确保系统初始化 ====================

  static async ensureSystemsInitialized(): Promise<void> {
    try {
      const heroSystem = HeroSystem.getInstance();
      if (!heroSystem.isInitialized()) {
        await heroSystem.initialize();
      }

      // 确保所有英雄已解锁
      heroSystem.unlockHeroes(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);

      const skillSystem = SkillSystem.getInstance();
      if (!skillSystem.isInitialized()) {
        await skillSystem.initialize();
      }

      // 解锁一些技能
      skillSystem.unlockSkills(['skill_001', 'skill_002', 'skill_003']);

      // 为英雄装配技能
      skillSystem.equipSkill('hero_001', 'skill_001');
      skillSystem.equipSkill('hero_002', 'skill_002');

      this._assert('HeroSystem 已初始化', heroSystem.isInitialized());
      this._assert('SkillSystem 已初始化', skillSystem.isInitialized());
      this._assert('hero_001 已解锁', heroSystem.hasHero('hero_001'));
      this._assert('hero_005 已解锁', heroSystem.hasHero('hero_005'));
    } catch (e) {
      this._assert(`系统初始化失败: ${e}`, false);
    }
  }

  // ==================== 4. FormationSystem 初始化测试 ====================

  static testFormationSystemInitialize(): void {
    try {
      const formationSystem = FormationSystem.getInstance();
      this._assert('FormationSystem 实例存在', formationSystem !== null);
      this._assert('FormationSystem isInitialized', formationSystem.isInitialized());
    } catch (e) {
      this._assert(`FormationSystem 初始化检查失败: ${e}`, false);
    }
  }

  // ==================== 5. 默认阵容测试 ====================

  static testDefaultPresets(): void {
    const formationSystem = FormationSystem.getInstance();

    for (const mode of CORE_FORMATION_MODES) {
      const presetId = `default_${mode}`;
      this._assert(`默认预设 exists: ${presetId}`, formationSystem.hasPreset(presetId));

      const preset = formationSystem.getPreset(presetId);
      this._assert(`默认预设 ${presetId} 非 null`, preset !== null);
      if (preset) {
        this._assert(`默认预设 ${presetId} mode=${mode}`, preset.mode === mode);
        this._assert(`默认预设 ${presetId} slots=5`, preset.slots.length === 5);
        this._assert(`默认预设 ${presetId} createdAt > 0`, preset.createdAt > 0);
      }
    }

    this._assert('getPresetCount >= 4', formationSystem.getPresetCount() >= 4);
  }

  // ==================== 6a. FormationSystem 创建预设测试 ====================

  static testPresetCreate(): void {
    const formationSystem = FormationSystem.getInstance();

    // 创建新预设
    const newPreset = createDefaultFormationPreset('my_pve_team', '我的推图队', 'pve');
    newPreset.slots = [
      { slotIndex: 0, heroId: 'hero_001' },
      { slotIndex: 1, heroId: 'hero_002' },
      { slotIndex: 2, heroId: 'hero_003' },
      { slotIndex: 3, heroId: null },
      { slotIndex: 4, heroId: null },
    ];

    const created = formationSystem.createPreset(newPreset);
    this._assert('createPreset 成功', created);
    this._assert('hasPreset(my_pve_team) = true', formationSystem.hasPreset('my_pve_team'));

    // 重复创建失败
    const duplicate = formationSystem.createPreset(newPreset);
    this._assert('createPreset 重复创建失败', !duplicate);

    // 查询创建的预设
    const retrieved = formationSystem.getPreset('my_pve_team');
    this._assert('getPreset 返回创建的预设', retrieved !== null);
    if (retrieved) {
      this._assert('getPreset id 正确', retrieved.id === 'my_pve_team');
      this._assert('getPreset name 正确', retrieved.name === '我的推图队');
      this._assert('getPreset mode 正确', retrieved.mode === 'pve');
      this._assert('getPreset 返回深拷贝', retrieved.slots !== newPreset.slots);
    }

    // 创建 dungeon 新预设
    const dungeonPreset = createDefaultFormationPreset('elite_dungeon', '精英副本队', 'dungeon');
    dungeonPreset.slots[0].heroId = 'hero_004';
    dungeonPreset.slots[1].heroId = 'hero_005';
    const created2 = formationSystem.createPreset(dungeonPreset);
    this._assert('createPreset dungeon 成功', created2);

    // null preset 失败
    const nullResult = formationSystem.createPreset(null as unknown as FormationPreset);
    this._assert('createPreset(null) 失败', !nullResult);
  }

  // ==================== 6b. FormationSystem 更新预设测试 ====================

  static testPresetUpdate(): void {
    const formationSystem = FormationSystem.getInstance();

    // 更新名称
    const updated1 = formationSystem.updatePreset('my_pve_team', { name: '强力推图队' });
    this._assert('updatePreset name 成功', updated1);

    const preset = formationSystem.getPreset('my_pve_team');
    this._assert('更新后 name = 强力推图队', preset && preset.name === '强力推图队');

    // 更新槽位
    const newSlots: FormationSlot[] = [
      { slotIndex: 0, heroId: 'hero_005' },
      { slotIndex: 1, heroId: 'hero_004' },
      { slotIndex: 2, heroId: 'hero_003' },
      { slotIndex: 3, heroId: 'hero_002' },
      { slotIndex: 4, heroId: 'hero_001' },
    ];
    const updated2 = formationSystem.updatePreset('my_pve_team', { slots: newSlots });
    this._assert('updatePreset slots 成功', updated2);

    const preset2 = formationSystem.getPreset('my_pve_team');
    this._assert('更新后 slots[0]=hero_005', preset2 && preset2.slots[0].heroId === 'hero_005');
    this._assert('更新后 slots[4]=hero_001', preset2 && preset2.slots[4].heroId === 'hero_001');

    // 更新不存在的预设
    const failUpdate = formationSystem.updatePreset('nonexistent', { name: '不存在' });
    this._assert('updatePreset 不存在失败', !failUpdate);
  }

  // ==================== 6c. FormationSystem 删除预设测试 ====================

  static testPresetDelete(): void {
    const formationSystem = FormationSystem.getInstance();

    // 创建临时预设用于删除
    const tempPreset = createDefaultFormationPreset('temp_delete', '待删除', 'pve');
    formationSystem.createPreset(tempPreset);
    this._assert('临时预设创建成功', formationSystem.hasPreset('temp_delete'));

    // 删除成功
    const deleted = formationSystem.deletePreset('temp_delete');
    this._assert('deletePreset 成功', deleted);
    this._assert('删除后 hasPreset = false', !formationSystem.hasPreset('temp_delete'));

    // 删除不存在的预设
    const failDelete = formationSystem.deletePreset('nonexistent');
    this._assert('deletePreset 不存在失败', !failDelete);

    // 删除激活中的预设应失败
    const activeId = formationSystem.getActivePresetId('pve');
    if (activeId) {
      const deleteActive = formationSystem.deletePreset(activeId);
      this._assert('deletePreset 激活中预设失败', !deleteActive);
    }
  }

  // ==================== 7. FormationSystem 激活测试 ====================

  static testActivePreset(): void {
    const formationSystem = FormationSystem.getInstance();

    // 激活 my_pve_team 为 pve 模式
    const activated = formationSystem.setActivePreset('pve', 'my_pve_team');
    this._assert('setActivePreset 成功', activated);

    const activeId = formationSystem.getActivePresetId('pve');
    this._assert('getActivePresetId(pve) = my_pve_team', activeId === 'my_pve_team');

    const activePreset = formationSystem.getActivePreset('pve');
    this._assert('getActivePreset(pve) 非 null', activePreset !== null);
    if (activePreset) {
      this._assert('activePreset.id = my_pve_team', activePreset.id === 'my_pve_team');
    }

    // 重复激活同一预设返回 false
    const reactivate = formationSystem.setActivePreset('pve', 'my_pve_team');
    this._assert('重复 setActivePreset = false', !reactivate);

    // 模式不匹配失败
    const badMode = formationSystem.setActivePreset('dungeon', 'my_pve_team');  // my_pve_team is pve mode
    this._assert('setActivePreset 模式不匹配失败', !badMode);

    // 激活不存在的预设
    const failActivate = formationSystem.setActivePreset('pve', 'nonexistent');
    this._assert('setActivePreset 不存在失败', !failActivate);

    // 切回默认 pve 预设
    formationSystem.setActivePreset('pve', 'default_pve');

    // getActivePresetIds 测试
    const activeMap = formationSystem.getActivePresetIds();
    this._assert('getActivePresetIds 包含 pve', activeMap.has('pve'));
    this._assert('getActivePresetIds 包含 dungeon', activeMap.has('dungeon'));
  }

  // ==================== 8. FormationSystem 查询测试 ====================

  static testQueryMethods(): void {
    const formationSystem = FormationSystem.getInstance();

    // getAllPresets
    const allPresets = formationSystem.getAllPresets();
    this._assert('getAllPresets 非空', allPresets.length > 0);

    // getPresetsByMode
    const pvePresets = formationSystem.getPresetsByMode('pve');
    this._assert('getPresetsByMode pve 非空', pvePresets.length > 0);
    for (const p of pvePresets) {
      this._assert(`getPresetsByMode 结果 mode=pve: ${p.id}`, p.mode === 'pve');
    }

    const dungeonPresets = formationSystem.getPresetsByMode('dungeon');
    this._assert('getPresetsByMode dungeon 非空', dungeonPresets.length > 0);

    // getPreset 不存在
    const nullPreset = formationSystem.getPreset('nonexistent_id');
    this._assert('getPreset 不存在 = null', nullPreset === null);

    // hasPreset
    this._assert('hasPreset(default_pve) = true', formationSystem.hasPreset('default_pve'));
    this._assert('hasPreset(nonexistent) = false', !formationSystem.hasPreset('nonexistent'));

    // getPresetCount
    const count = formationSystem.getPresetCount();
    this._assert('getPresetCount > 0', count > 0);

    // getActivePresetId 不存在模式
    const emptyActiveId = formationSystem.getActivePresetId('pvp_attack' as FormationMode);
    this._assert('getActivePresetId(pvp_attack) = ""', emptyActiveId === '');

    // getActivePreset 不存在模式
    const nullActive = formationSystem.getActivePreset('pvp_attack' as FormationMode);
    this._assert('getActivePreset(pvp_attack) = null', nullActive === null);
  }

  // ==================== 9. FormationSystem 校验测试 ====================

  static testFormationValidation(): void {
    const formationSystem = FormationSystem.getInstance();

    // 校验有效预设
    const result1 = formationSystem.validatePreset('default_pve');
    this._assert('validatePreset default_pve 通过', result1.valid);

    // 校验自定义预设
    const result2 = formationSystem.validatePreset('my_pve_team');
    this._assert('validatePreset my_pve_team', result2 !== null);

    // 校验不存在预设
    const result3 = formationSystem.validatePreset('nonexistent');
    this._assert('validatePreset 不存在失败', !result3.valid);

    // 校验空预设名
    const result4 = formationSystem.validatePreset('');
    this._assert('validatePreset("") 失败', !result4.valid);

    // getValidator
    const validator = formationSystem.getValidator();
    this._assert('getValidator 返回实例', validator !== null);

    // createOwnershipChecker
    const heroSystem = HeroSystem.getInstance();
    const checker = FormationValidator.createOwnershipChecker(heroSystem);
    this._assert('createOwnershipChecker(hero_001) = true', checker('hero_001'));
    this._assert('createOwnershipChecker(hero_999) = false', !checker('hero_999'));
  }

  // ==================== 10. TeamSnapshotBuilder 测试 ====================

  static testTeamSnapshotBuilder(): void {
    const builder = TeamSnapshotBuilder.getInstance();
    this._assert('TeamSnapshotBuilder 实例存在', builder !== null);

    const formationSystem = FormationSystem.getInstance();

    // 获取一个有英雄的预设
    const preset = formationSystem.getPreset('my_pve_team');
    this._assert('my_pve_team 预设存在', preset !== null);

    if (preset) {
      const snapshot = builder.buildTeamSnapshot(preset);
      this._assert('buildTeamSnapshot 非 null', snapshot !== null);

      if (snapshot) {
        this._assert('TeamSnapshot.mode = pve', snapshot.mode === 'pve');
        this._assert('TeamSnapshot.presetId = my_pve_team', snapshot.presetId === 'my_pve_team');
        this._assert('TeamSnapshot.heroIds 非空', snapshot.heroIds.length > 0);
        this._assert('TeamSnapshot.heroSnapshots 非空', snapshot.heroSnapshots.length > 0);
        this._assert('TeamSnapshot.teamPower > 0', snapshot.teamPower > 0);
        this._assert('TeamSnapshot.capturedAt > 0', snapshot.capturedAt > 0);
        this._assert('TeamSnapshot.skillSnapshots 存在', Array.isArray(snapshot.skillSnapshots));
      }
    }

    // 空阵容快照
    const emptyPreset = createDefaultFormationPreset('empty_test', '空阵容', 'pve');
    const emptySnapshot = builder.buildTeamSnapshot(emptyPreset);
    this._assert('空阵容 buildTeamSnapshot 非 null', emptySnapshot !== null);
    if (emptySnapshot) {
      this._assert('空阵容 heroIds = []', emptySnapshot.heroIds.length === 0);
      this._assert('空阵容 teamPower = 0', emptySnapshot.teamPower === 0);
    }

    // null preset
    const nullSnapshot = builder.buildTeamSnapshot(null as unknown as FormationPreset);
    this._assert('null preset buildTeamSnapshot = null', nullSnapshot === null);

    // calculateTeamPower
    const power = builder.calculateTeamPower(preset!);
    this._assert('calculateTeamPower > 0', power > 0);

    const emptyPower = builder.calculateTeamPower(emptyPreset);
    this._assert('空阵容 calculateTeamPower = 0', emptyPower === 0);

    const nullPower = builder.calculateTeamPower(null as unknown as FormationPreset);
    this._assert('null preset calculateTeamPower = 0', nullPower === 0);
  }

  // ==================== 11. save/restore 测试 ====================

  static testSaveRestore(): void {
    const formationSystem = FormationSystem.getInstance();

    // 保存当前状态
    const savedData: FormationSaveData = formationSystem.save();
    this._assert('save() 返回 FormationSaveData', savedData !== null);
    this._assert('saveData.presets 非空', Object.keys(savedData.presets).length > 0);
    this._assert('saveData.activePresetIds 非空', Object.keys(savedData.activePresetIds).length > 0);
    this._assert('saveData.saveVersion = 1', savedData.saveVersion === 1);
    this._assert('saveData.updatedAt > 0', savedData.updatedAt > 0);

    // 验证保存数据包含 my_pve_team
    this._assert('存档包含 my_pve_team', savedData.presets['my_pve_team'] !== undefined);
    if (savedData.presets['my_pve_team']) {
      this._assert('存档中 my_pve_team.mode = pve', savedData.presets['my_pve_team'].mode === 'pve');
    }

    // Round-trip 测试
    const presetsBefore = formationSystem.getPresetCount();
    const activeBefore = formationSystem.getActivePresetId('pve');

    // 修改后 save
    formationSystem.updatePreset('default_pve', { name: '修改后名字' });
    const modifiedData = formationSystem.save();
    this._assert('修改后存档 default_pve.name = 修改后名字',
      modifiedData.presets['default_pve']?.name === '修改后名字');

    // restore 回旧状态
    formationSystem.restore(savedData as unknown as FormationSaveData);
    const presetsAfter = formationSystem.getPresetCount();
    this._assert('restore 后 presetCount 恢复', presetsAfter === presetsBefore);
  }

  // ==================== 12. 战力计算测试 ====================

  static testPowerRecalculation(): void {
    const formationSystem = FormationSystem.getInstance();

    // recalculatePower
    formationSystem.recalculatePower('default_pve');
    const preset = formationSystem.getPreset('default_pve');
    this._assert('recalculatePower 后预设存在', preset !== null);
    if (preset) {
      this._assert('teamPower >= 0', preset.teamPower >= 0);
    }

    // recalculateAllPower
    formationSystem.recalculateAllPower();
    const allPresets = formationSystem.getAllPresets();
    let allHavePower = true;
    for (const p of allPresets) {
      if (typeof p.teamPower !== 'number' || p.teamPower < 0) {
        allHavePower = false;
        break;
      }
    }
    this._assert('recalculateAllPower 所有预设战力合法', allHavePower);

    // 不存在的预设
    formationSystem.recalculatePower('nonexistent');  // 不应崩溃
    this._assert('recalculatePower 不存在预设不崩溃', true);
  }

  // ==================== 13. Event 集成测试 ====================

  static testEventIntegration(): void {
    const eventManager = EventManager.getInstance();
    const formationSystem = FormationSystem.getInstance();

    // 验证事件常量
    this._assert(
      'FORMATION_CREATED = formation:created',
      FormationSystem.FORMATION_CREATED === 'formation:created',
    );
    this._assert(
      'FORMATION_CHANGED = formation:changed',
      FormationSystem.FORMATION_CHANGED === 'formation:changed',
    );
    this._assert(
      'FORMATION_VALIDATED = formation:validated',
      FormationSystem.FORMATION_VALIDATED === 'formation:validated',
    );
    this._assert(
      'FORMATION_ACTIVE_CHANGED = formation:activeChanged',
      FormationSystem.FORMATION_ACTIVE_CHANGED === 'formation:activeChanged',
    );
    this._assert(
      'FORMATION_POWER_CHANGED = formation:powerChanged',
      FormationSystem.FORMATION_POWER_CHANGED === 'formation:powerChanged',
    );

    // FORMATION_CREATED 事件
    let createdFired = false;
    const onCreated = () => { createdFired = true; };
    eventManager.on(FormationSystem.FORMATION_CREATED, onCreated);

    const newPreset = createDefaultFormationPreset('event_test', '事件测试', 'pve');
    formationSystem.createPreset(newPreset);
    this._assert('FORMATION_CREATED 事件触发', createdFired);
    eventManager.off(FormationSystem.FORMATION_CREATED, onCreated);

    // FORMATION_ACTIVE_CHANGED 事件
    let activeFired = false;
    let activeData: Record<string, unknown> | null = null;
    const onActive = (data: Record<string, unknown>) => { activeFired = true; activeData = data; };
    eventManager.on(FormationSystem.FORMATION_ACTIVE_CHANGED, onActive);

    formationSystem.setActivePreset('pve', 'event_test');
    this._assert('FORMATION_ACTIVE_CHANGED 事件触发', activeFired);
    if (activeData) {
      this._assert('activeChanged mode = pve', activeData.mode === 'pve');
    }
    eventManager.off(FormationSystem.FORMATION_ACTIVE_CHANGED, onActive);

    // FORMATION_CHANGED 事件
    let changedFired = false;
    const onChanged = () => { changedFired = true; };
    eventManager.on(FormationSystem.FORMATION_CHANGED, onChanged);

    formationSystem.updatePreset('event_test', { name: '新名字' });
    this._assert('FORMATION_CHANGED 事件触发', changedFired);
    eventManager.off(FormationSystem.FORMATION_CHANGED, onChanged);

    // FORMATION_VALIDATED 事件
    let validatedFired = false;
    const onValidated = () => { validatedFired = true; };
    eventManager.on(FormationSystem.FORMATION_VALIDATED, onValidated);

    formationSystem.validatePreset('event_test');
    this._assert('FORMATION_VALIDATED 事件触发', validatedFired);
    eventManager.off(FormationSystem.FORMATION_VALIDATED, onValidated);

    // FORMATION_POWER_CHANGED 事件
    let powerFired = false;
    const onPowerChanged = () => { powerFired = true; };
    eventManager.on(FormationSystem.FORMATION_POWER_CHANGED, onPowerChanged);

    formationSystem.recalculatePower('event_test');
    this._assert('FORMATION_POWER_CHANGED 事件触发', powerFired);
    eventManager.off(FormationSystem.FORMATION_POWER_CHANGED, onPowerChanged);

    // 切回默认 pve
    formationSystem.setActivePreset('pve', 'default_pve');

    // 清理事件测试预设
    formationSystem.deletePreset('event_test');
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
    console.log(`Phase9-Step3 FormationSystem 测试汇总`);
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
