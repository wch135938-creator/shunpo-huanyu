// ============================================================
// Phase9Step9DebugRunner — TutorialSystem 集成测试
// 职责：验证 TutorialTypes / TutorialRepository / TutorialSystem /
//        Event 集成 / SaveV2 集成
// 用法：在 Cocos Creator 控制台执行 Phase9Step9DebugRunner.runAll()
// ============================================================

import { TutorialRepository } from '../tutorial/TutorialRepository';
import { TutorialSystem } from '../tutorial/TutorialSystem';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import type {
  TutorialProgress,
  TutorialConfigData,
} from '../tutorial/TutorialTypes';
import {
  createDefaultTutorialProgress,
  createSnapshotFromProgress,
  restoreProgressFromSnapshot,
} from '../tutorial/TutorialTypes';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/** 模拟引导配置数据 */
const MOCK_TUTORIAL_CONFIG: TutorialConfigData = {
  version: 1,
  groups: [
    {
      groupId: 'tutorial_intro',
      nameKey: 'tutorial.intro.name',
      description: '新手引导',
      priority: 100,
      dependencies: [],
      triggerEvent: 'game:firstLaunch',
      steps: [
        {
          stepId: 'tutorial_intro_01', groupId: 'tutorial_intro', order: 0,
          titleKey: 'step01.title', descriptionKey: 'step01.desc',
          highlightTarget: 'UI/HeroButton', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_intro_02', groupId: 'tutorial_intro', order: 1,
          titleKey: 'step02.title', descriptionKey: 'step02.desc',
          highlightTarget: 'UI/BattleButton', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_intro_03', groupId: 'tutorial_intro', order: 2,
          titleKey: 'step03.title', descriptionKey: 'step03.desc',
          highlightTarget: 'UI/GachaButton', requiredAction: 'tap_target',
        },
      ],
    },
    {
      groupId: 'tutorial_battle',
      nameKey: 'tutorial.battle.name',
      description: '战斗引导',
      priority: 90,
      dependencies: ['tutorial_intro'],
      triggerEvent: 'battle:firstEnter',
      steps: [
        {
          stepId: 'tutorial_battle_01', groupId: 'tutorial_battle', order: 0,
          titleKey: 'battle01.title', descriptionKey: 'battle01.desc',
          highlightTarget: 'UI/EnemyArea', requiredAction: 'any_tap',
        },
        {
          stepId: 'tutorial_battle_02', groupId: 'tutorial_battle', order: 1,
          titleKey: 'battle02.title', descriptionKey: 'battle02.desc',
          highlightTarget: 'UI/HeroArea', requiredAction: 'any_tap',
        },
        {
          stepId: 'tutorial_battle_03', groupId: 'tutorial_battle', order: 2,
          titleKey: 'battle03.title', descriptionKey: 'battle03.desc',
          highlightTarget: 'UI/SkillBar', requiredAction: 'any_tap',
        },
        {
          stepId: 'tutorial_battle_04', groupId: 'tutorial_battle', order: 3,
          titleKey: 'battle04.title', descriptionKey: 'battle04.desc',
          highlightTarget: 'UI/SpeedButton', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_battle_05', groupId: 'tutorial_battle', order: 4,
          titleKey: 'battle05.title', descriptionKey: 'battle05.desc',
          highlightTarget: 'UI/AutoButton', requiredAction: 'tap_target',
        },
      ],
    },
    {
      groupId: 'tutorial_equipment',
      nameKey: 'tutorial.equipment.name',
      description: '装备引导',
      priority: 80,
      dependencies: ['tutorial_intro'],
      triggerEvent: 'equipment:firstOpen',
      steps: [
        {
          stepId: 'tutorial_equipment_01', groupId: 'tutorial_equipment', order: 0,
          titleKey: 'equip01.title', descriptionKey: 'equip01.desc',
          highlightTarget: 'UI/HeroSlot', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_equipment_02', groupId: 'tutorial_equipment', order: 1,
          titleKey: 'equip02.title', descriptionKey: 'equip02.desc',
          highlightTarget: 'UI/BagButton', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_equipment_03', groupId: 'tutorial_equipment', order: 2,
          titleKey: 'equip03.title', descriptionKey: 'equip03.desc',
          highlightTarget: 'UI/EquipButton', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_equipment_04', groupId: 'tutorial_equipment', order: 3,
          titleKey: 'equip04.title', descriptionKey: 'equip04.desc',
          highlightTarget: 'UI/EnhanceButton', requiredAction: 'tap_target',
        },
      ],
    },
    {
      groupId: 'tutorial_dungeon',
      nameKey: 'tutorial.dungeon.name',
      description: '地牢引导',
      priority: 70,
      dependencies: ['tutorial_intro'],
      triggerEvent: 'dungeon:firstEnter',
      steps: [
        {
          stepId: 'tutorial_dungeon_01', groupId: 'tutorial_dungeon', order: 0,
          titleKey: 'dungeon01.title', descriptionKey: 'dungeon01.desc',
          highlightTarget: 'UI/NodeMap', requiredAction: 'any_tap',
        },
        {
          stepId: 'tutorial_dungeon_02', groupId: 'tutorial_dungeon', order: 1,
          titleKey: 'dungeon02.title', descriptionKey: 'dungeon02.desc',
          highlightTarget: 'UI/ForkChoice', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_dungeon_03', groupId: 'tutorial_dungeon', order: 2,
          titleKey: 'dungeon03.title', descriptionKey: 'dungeon03.desc',
          highlightTarget: 'UI/EventPanel', requiredAction: 'tap_target',
        },
        {
          stepId: 'tutorial_dungeon_04', groupId: 'tutorial_dungeon', order: 3,
          titleKey: 'dungeon04.title', descriptionKey: 'dungeon04.desc',
          highlightTarget: 'UI/RewardPanel', requiredAction: 'any_tap',
        },
        {
          stepId: 'tutorial_dungeon_05', groupId: 'tutorial_dungeon', order: 4,
          titleKey: 'dungeon05.title', descriptionKey: 'dungeon05.desc',
          highlightTarget: 'UI/BossNode', requiredAction: 'tap_target',
        },
      ],
    },
  ],
};

export class Phase9Step9DebugRunner {
  private static _results: TestResult[] = [];
  private static _assertionCount = 0;
  private static _passCount = 0;
  private static _failCount = 0;

  // ==================== 主入口 ====================

  /** 运行所有测试 */
  static runAll(): void {
    this._results = [];
    this._assertionCount = 0;
    this._passCount = 0;
    this._failCount = 0;

    console.log('========== Phase9-Step9 TutorialSystem 集成测试 ==========\n');

    // 初始化 SaveManager（使用本地降级存储）
    this.initSaveManager();

    this.testTutorialTypes();
    this.testTutorialRepository();
    this.testTutorialSystemCore();
    this.testTutorialSystemSkip();
    this.testTutorialSystemEdgeCases();
    this.testEventIntegration();
    this.testSaveRestore();

    this.printSummary();
  }

  // ==================== 初始化 ====================

  private static initSaveManager(): void {
    try {
      const adapter = new LocalStorageAdapter();
      // 清除旧测试数据
      adapter.delete(SaveManager.SAVE_KEY);
      SaveManager.getInstance().init(adapter);
    } catch (e) {
      console.warn('[DebugRunner] SaveManager 初始化失败（可能已在运行中）:', e);
    }
  }

  // ==================== 工具 ====================

  /** 断言 */
  private static assert(name: string, condition: boolean, detail?: string): void {
    this._assertionCount += 1;
    const passed = condition === true;
    if (passed) {
      this._passCount += 1;
    } else {
      this._failCount += 1;
    }
    this._results.push({
      name,
      passed,
      message: detail ?? (passed ? '通过' : '失败'),
    });
  }

  /** 获取计数器 */
  private static getAssertionCount(): number {
    return this._assertionCount;
  }

  /** 打印摘要 */
  private static printSummary(): void {
    console.log('\n========== 测试摘要 ==========');
    console.log(`总计: ${this._assertionCount} 断言`);
    console.log(`通过: ${this._passCount}`);
    console.log(`失败: ${this._failCount}`);

    if (this._failCount > 0) {
      console.log('\n--- 失败项 ---');
      for (const r of this._results) {
        if (!r.passed) {
          console.error(`  FAIL: ${r.name} — ${r.message}`);
        }
      }
    }

    const passRate = this._assertionCount > 0
      ? ((this._passCount / this._assertionCount) * 100).toFixed(1)
      : '0';
    console.log(`\n通过率: ${passRate}%`);
    console.log(
      this._failCount === 0
        ? 'CONSOLE ERROR = 0 ✓'
        : `CONSOLE ERROR = ${this._failCount} ✗`,
    );
    console.log('========== 测试完成 ==========\n');
  }

  // ==================== 测试 1：TutorialTypes ====================

  private static testTutorialTypes(): void {
    console.log('--- 测试 1: TutorialTypes ---');

    // 1a. createDefaultTutorialProgress
    const progress = createDefaultTutorialProgress();
    this.assert('progress.currentGroupId 为空', progress.currentGroupId === '', String(progress.currentGroupId));
    this.assert('progress.currentStepId 为空', progress.currentStepId === '', String(progress.currentStepId));
    this.assert('progress.completedGroupIds 为空数组', Array.isArray(progress.completedGroupIds) && progress.completedGroupIds.length === 0);
    this.assert('progress.completedStepIds 为空数组', Array.isArray(progress.completedStepIds) && progress.completedStepIds.length === 0);
    this.assert('progress.skippedGroupIds 为空数组', Array.isArray(progress.skippedGroupIds) && progress.skippedGroupIds.length === 0);
    this.assert('progress.isComplete 为 false', progress.isComplete === false);

    // 1b. createSnapshotFromProgress
    const modProgress: TutorialProgress = {
      currentGroupId: 'test_group',
      currentStepId: 'test_step_01',
      completedGroupIds: ['group_a', 'group_b'],
      completedStepIds: ['step_01', 'step_02', 'step_03'],
      skippedGroupIds: ['group_c'],
      isComplete: false,
    };
    const snapshotTime = 1234567890;
    const snapshot = createSnapshotFromProgress(modProgress, snapshotTime);
    this.assert('snapshot.currentGroupId 正确', snapshot.currentGroupId === 'test_group');
    this.assert('snapshot.currentStepId 正确', snapshot.currentStepId === 'test_step_01');
    this.assert('snapshot.completedGroupIds 值正确', snapshot.completedGroupIds.length === 2 && snapshot.completedGroupIds.includes('group_a'));
    this.assert('snapshot.completedStepIds 值正确', snapshot.completedStepIds.length === 3);
    this.assert('snapshot.skippedGroupIds 值正确', snapshot.skippedGroupIds.length === 1 && snapshot.skippedGroupIds[0] === 'group_c');
    this.assert('snapshot.isComplete 正确', snapshot.isComplete === false);
    this.assert('snapshot.snapshotAt 正确', snapshot.snapshotAt === snapshotTime);
    // 验证独立副本
    modProgress.completedGroupIds.push('group_d');
    this.assert('snapshot 是独立副本（修改原对象不影响快照）', snapshot.completedGroupIds.length === 2);

    // 1c. restoreProgressFromSnapshot
    const restored = restoreProgressFromSnapshot(snapshot);
    this.assert('restored.currentGroupId 正确', restored.currentGroupId === 'test_group');
    this.assert('restored.currentStepId 正确', restored.currentStepId === 'test_step_01');
    this.assert('restored.completedGroupIds 长度正确', restored.completedGroupIds.length === 2);
    this.assert('restored.completedStepIds 长度正确', restored.completedStepIds.length === 3);
    this.assert('restored.skippedGroupIds 长度正确', restored.skippedGroupIds.length === 1);
    this.assert('restored.isComplete 正确', restored.isComplete === false);

    // 1d. createSnapshotFromProgress 默认 snapshotAt
    const snap2 = createSnapshotFromProgress(modProgress);
    this.assert('snapshotAt 默认值大于 0', snap2.snapshotAt > 0);
    this.assert('snapshotAt 是合理时间戳', snap2.snapshotAt >= snapshotTime);
  }

  // ==================== 测试 2：TutorialRepository ====================

  private static testTutorialRepository(): void {
    console.log('--- 测试 2: TutorialRepository ---');

    const repo = new TutorialRepository();

    // 2a. 手动注入配置测试
    // 通过反射访问私有方法构建索引
    const repoAny = repo as any;
    repoAny._config = MOCK_TUTORIAL_CONFIG;
    repoAny._buildIndexes(MOCK_TUTORIAL_CONFIG);

    this.assert('isConfigLoaded 返回 true', repo.isConfigLoaded());
    this.assert('getConfigVersion 返回 1', repo.getConfigVersion() === 1);
    this.assert('getGroupCount 返回 4', repo.getGroupCount() === 4);
    this.assert('getTotalStepCount 返回 17', repo.getTotalStepCount() === 17, `实际: ${repo.getTotalStepCount()}`);

    // 2b. hasGroup / getGroup
    this.assert('hasGroup(tutorial_intro) = true', repo.hasGroup('tutorial_intro'));
    this.assert('hasGroup(tutorial_battle) = true', repo.hasGroup('tutorial_battle'));
    this.assert('hasGroup(不存在) = false', !repo.hasGroup('nonexistent'));
    this.assert('getGroup(tutorial_intro) 非 null', repo.getGroup('tutorial_intro') !== null);
    this.assert('getGroup(不存在) 返回 null', repo.getGroup('nonexistent') === null);

    const introGroup = repo.getGroup('tutorial_intro')!;
    this.assert('introGroup.groupId 正确', introGroup.groupId === 'tutorial_intro');
    this.assert('introGroup.priority 正确', introGroup.priority === 100);
    this.assert('introGroup.steps 长度正确', introGroup.steps.length === 3);
    this.assert('introGroup.dependencies 为空', introGroup.dependencies!.length === 0);

    const battleGroup = repo.getGroup('tutorial_battle')!;
    this.assert('battleGroup.dependencies 包含 tutorial_intro', battleGroup.dependencies!.includes('tutorial_intro'));

    // 2c. getAllGroups（按优先级降序）
    const allGroups = repo.getAllGroups();
    this.assert('getAllGroups 长度 4', allGroups.length === 4);
    this.assert('第一个是 tutorial_intro（优先级最高）', allGroups[0].groupId === 'tutorial_intro');
    this.assert('第二个是 tutorial_battle', allGroups[1].groupId === 'tutorial_battle');
    this.assert('第三个是 tutorial_equipment', allGroups[2].groupId === 'tutorial_equipment');
    this.assert('第四个是 tutorial_dungeon', allGroups[3].groupId === 'tutorial_dungeon');

    // 2d. getStep
    const step = repo.getStep('tutorial_intro_01')!;
    this.assert('getStep 返回正确步骤', step !== null);
    this.assert('step.stepId 正确', step.stepId === 'tutorial_intro_01');
    this.assert('step.groupId 正确', step.groupId === 'tutorial_intro');
    this.assert('step.order 为 0', step.order === 0);
    this.assert('step.highlightTarget 正确', step.highlightTarget === 'UI/HeroButton');
    this.assert('step.requiredAction 正确', step.requiredAction === 'tap_target');
    this.assert('getStep(不存在) 返回 null', repo.getStep('nonexistent') === null);

    // 2e. getGroupSteps
    const introSteps = repo.getGroupSteps('tutorial_intro');
    this.assert('introSteps 长度 3', introSteps.length === 3);
    this.assert('introSteps[0].order=0', introSteps[0].order === 0);
    this.assert('introSteps[1].order=1', introSteps[1].order === 1);
    this.assert('introSteps[2].order=2', introSteps[2].order === 2);
    this.assert('getGroupSteps(不存在) 返回空数组', repo.getGroupSteps('nonexistent').length === 0);

    // 2f. getNextStep
    const next1 = repo.getNextStep('tutorial_intro', 0);
    this.assert('next1.order=1', next1 !== null && next1.order === 1);
    const next2 = repo.getNextStep('tutorial_intro', 1);
    this.assert('next2.order=2', next2 !== null && next2.order === 2);
    const next3 = repo.getNextStep('tutorial_intro', 2);
    this.assert('next3 为 null（最后一步）', next3 === null);
    const nextInvalid = repo.getNextStep('nonexistent', 0);
    this.assert('getNextStep(不存在) 返回 null', nextInvalid === null);

    // 2g. getFirstStep / getLastStep
    const firstStep = repo.getFirstStep('tutorial_intro');
    this.assert('getFirstStep 返回 order=0 的步骤', firstStep !== null && firstStep.order === 0);
    const lastStep = repo.getLastStep('tutorial_intro');
    this.assert('getLastStep 返回 order=2 的步骤', lastStep !== null && lastStep.order === 2);
    this.assert('getFirstStep(不存在) 返回 null', repo.getFirstStep('nonexistent') === null);
    this.assert('getLastStep(不存在) 返回 null', repo.getLastStep('nonexistent') === null);

    // 2h. getFirstAvailableGroup
    const avail1 = repo.getFirstAvailableGroup([], []);
    this.assert('无任何完成/跳过时返回 tutorial_intro', avail1 !== null && avail1.groupId === 'tutorial_intro');

    const avail2 = repo.getFirstAvailableGroup(['tutorial_intro'], []);
    this.assert('tutorial_intro 完成后返回 tutorial_battle（优先级最高且依赖已满足）',
      avail2 !== null && avail2.groupId === 'tutorial_battle');

    const avail3 = repo.getFirstAvailableGroup(['tutorial_intro'], ['tutorial_battle', 'tutorial_equipment']);
    this.assert('battle+equip 跳过后返回 tutorial_dungeon',
      avail3 !== null && avail3.groupId === 'tutorial_dungeon');

    const avail4 = repo.getFirstAvailableGroup(
      ['tutorial_intro', 'tutorial_battle', 'tutorial_equipment', 'tutorial_dungeon'],
      [],
    );
    this.assert('全部完成后返回 null', avail4 === null);

    const avail5 = repo.getFirstAvailableGroup([], ['tutorial_intro']);
    this.assert('tutorial_intro 跳过但依赖未满足时...',
      // battle depends on intro, so if intro is skipped, battle can't start
      // getFirstAvailableGroup skips skipped groups and checks deps
      avail5 === null, `实际: ${avail5?.groupId ?? 'null'}`);
  }

  // ==================== 测试 3：TutorialSystem 核心流程 ====================

  private static testTutorialSystemCore(): void {
    console.log('--- 测试 3: TutorialSystem 核心流程 ---');

    // 创建系统实例并手动注入已加载配置的仓库
    const sys = new TutorialSystem();
    const sysAny = sys as any;

    // 手动初始化仓库
    const repo = new TutorialRepository();
    const repoAny = repo as any;
    repoAny._config = MOCK_TUTORIAL_CONFIG;
    repoAny._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sysAny._repository = repo;
    sysAny._progress = createDefaultTutorialProgress();
    sysAny._initialized = true;

    // 3a. startTutorial — 正常开始
    const startOk = sys.startTutorial('tutorial_intro');
    this.assert('startTutorial(tutorial_intro) 成功', startOk);
    this.assert('isInProgress 返回 true', sys.isInProgress());
    this.assert('currentGroupId = tutorial_intro', sys.getProgress().currentGroupId === 'tutorial_intro');
    this.assert('currentStepId = tutorial_intro_01', sys.getProgress().currentStepId === 'tutorial_intro_01');

    // 3b. getCurrentStep / getCurrentGroup
    const currentStep = sys.getCurrentStep();
    this.assert('getCurrentStep 非 null', currentStep !== null);
    this.assert('getCurrentStep.stepId = tutorial_intro_01', currentStep!.stepId === 'tutorial_intro_01');
    const currentGroup = sys.getCurrentGroup();
    this.assert('getCurrentGroup 非 null', currentGroup !== null);
    this.assert('getCurrentGroup.groupId = tutorial_intro', currentGroup!.groupId === 'tutorial_intro');

    // 3c. getCurrentGroupSteps
    const groupSteps = sys.getCurrentGroupSteps();
    this.assert('getCurrentGroupSteps 长度 3', groupSteps.length === 3);

    // 3d. getCurrentStepIndex
    this.assert('getCurrentStepIndex = 0', sys.getCurrentStepIndex() === 0);

    // 3e. 不能重复开始已开始的引导
    const startDup = sys.startTutorial('tutorial_intro');
    this.assert('重复开始同一引导返回 false', !startDup);

    // 3f. 依赖未满足时不能开始
    const startBattle = sys.startTutorial('tutorial_battle');
    this.assert('依赖未满足时 startTutorial 返回 false', !startBattle);

    // 3g. completeStep — 第一步
    const result1 = sys.completeStep();
    this.assert('completeStep 返回非 null', result1 !== null);
    this.assert('result1.stepId = tutorial_intro_01', result1!.stepId === 'tutorial_intro_01');
    this.assert('result1.groupCompleted = false', !result1!.groupCompleted);
    this.assert('result1.allCompleted = false', !result1!.allCompleted);
    this.assert('result1.nextStepId = tutorial_intro_02', result1!.nextStepId === 'tutorial_intro_02');
    this.assert('currentStepId 推进到 tutorial_intro_02', sys.getProgress().currentStepId === 'tutorial_intro_02');
    this.assert('getCurrentStepIndex = 1', sys.getCurrentStepIndex() === 1);

    // 3h. completeStep — 第二步
    const result2 = sys.completeStep();
    this.assert('result2.groupCompleted = false', !result2!.groupCompleted);
    this.assert('result2.nextStepId = tutorial_intro_03', result2!.nextStepId === 'tutorial_intro_03');
    this.assert('getCurrentStepIndex = 2', sys.getCurrentStepIndex() === 2);

    // 3i. completeStep — 第三步（最后一步，触发组完成）
    const result3 = sys.completeStep();
    this.assert('result3 非 null', result3 !== null);
    this.assert('result3.groupCompleted = true', result3!.groupCompleted);
    this.assert('result3.nextStepId = null', result3!.nextStepId === null);
    this.assert('isInProgress 返回 false', !sys.isInProgress());
    this.assert('currentGroupId 清空', sys.getProgress().currentGroupId === '');
    this.assert('currentStepId 清空', sys.getProgress().currentStepId === '');
    this.assert('isCompleted(tutorial_intro) = true', sys.isCompleted('tutorial_intro'));
    this.assert('completedGroupIds 包含 tutorial_intro', sys.getProgress().completedGroupIds.includes('tutorial_intro'));
    this.assert('completedStepIds 包含所有 3 步', sys.getProgress().completedStepIds.length === 3);

    // 3j. 已完成引导不可再次开始
    const restart = sys.startTutorial('tutorial_intro');
    this.assert('已完成引导不可再次开始', !restart);

    // 3k. 完成 intro 后可以开始 battle（依赖满足）
    const startBattle2 = sys.startTutorial('tutorial_battle');
    this.assert('依赖满足后 startTutorial(battle) 成功', startBattle2);
    this.assert('battle steps 共 5 步', sys.getCurrentGroupSteps().length === 5);

    // 3l. 走完 battle 的所有步骤
    let battleStepCount = 0;
    while (sys.isInProgress()) {
      const r = sys.completeStep();
      if (r) battleStepCount += 1;
    }
    this.assert('battle 完成 5 步', battleStepCount === 5);
    this.assert('isCompleted(tutorial_battle) = true', sys.isCompleted('tutorial_battle'));
    this.assert('completedStepIds 共 8 步', sys.getProgress().completedStepIds.length === 8);

    // 3m. isAllComplete 仍为 false（还有 tutorial_equipment 和 tutorial_dungeon）
    this.assert('isAllComplete = false（还有装备和地牢引导未处理）', !sys.isAllComplete());

    // 3n. getProgress 返回独立副本
    const prog1 = sys.getProgress();
    const prog2 = sys.getProgress();
    this.assert('getProgress 返回独立副本', prog1 !== prog2);
    this.assert('副本数据相等', prog1.completedGroupIds.length === prog2.completedGroupIds.length);

    // 3o. getCurrentStep 无进行中引导时返回 null
    this.assert('无进行中引导时 getCurrentStep = null', sys.getCurrentStep() === null);
    this.assert('无进行中引导时 getCurrentGroup = null', sys.getCurrentGroup() === null);
    this.assert('无进行中引导时 getCurrentGroupSteps = []', sys.getCurrentGroupSteps().length === 0);
    this.assert('无进行中引导时 getCurrentStepIndex = -1', sys.getCurrentStepIndex() === -1);

    // 3p. 开始 equipment（依赖满足）
    const startEquip = sys.startTutorial('tutorial_equipment');
    this.assert('startTutorial(equipment) 成功', startEquip);
    // 只完成 2 步，然后跳过
    sys.completeStep(); // step 1
    sys.completeStep(); // step 2
    this.assert('完成 2 步后 currentStepIndex = 1', sys.getCurrentStepIndex() === 1);
    this.assert('completedStepIds 包含 equipment 步', sys.getProgress().completedStepIds.includes('tutorial_equipment_01'));
  }

  // ==================== 测试 4：TutorialSystem 跳过 ====================

  private static testTutorialSystemSkip(): void {
    console.log('--- 测试 4: TutorialSystem 跳过 ---');

    // 创建新系统实例
    const sys = new TutorialSystem();
    const sysAny = sys as any;

    const repo = new TutorialRepository();
    const repoAny = repo as any;
    repoAny._config = MOCK_TUTORIAL_CONFIG;
    repoAny._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sysAny._repository = repo;
    sysAny._progress = createDefaultTutorialProgress();
    sysAny._initialized = true;

    // 4a. 开始 equipment，进行到一半后跳过
    sys.startTutorial('tutorial_equipment');
    sys.completeStep(); // step 1 done
    sys.completeStep(); // step 2 done
    const midSkip = sys.skipTutorial('tutorial_equipment');
    this.assert('进行中引导跳过成功', midSkip);
    this.assert('跳过标记记录正确', sys.isSkipped('tutorial_equipment'));
    this.assert('跳过组不在已完成列表中', !sys.isCompleted('tutorial_equipment'));
    this.assert('跳过组在 skippedGroupIds 中', sys.getProgress().skippedGroupIds.includes('tutorial_equipment'));
    this.assert('跳过后 isInProgress 返回 false', !sys.isInProgress());
    this.assert('跳过后 currentGroupId 为空', sys.getProgress().currentGroupId === '');

    // 4b. 已完成的引导不能跳过
    sys.startTutorial('tutorial_intro');
    while (sys.isInProgress()) sys.completeStep();
    const skipCompleted = sys.skipTutorial('tutorial_intro');
    this.assert('已完成引导不能跳过', !skipCompleted);

    // 4c. 已跳过的引导不能再次跳过
    const skipAgain = sys.skipTutorial('tutorial_equipment');
    this.assert('已跳过引导不能再次跳过', !skipAgain);

    // 4d. 不存在的引导跳过失败
    const skipNonexist = sys.skipTutorial('nonexistent');
    this.assert('不存在的引导跳过失败', !skipNonexist);

    // 4e. 跳过带 reason
    const sys2 = new TutorialSystem();
    const sys2Any = sys2 as any;
    const repo2 = new TutorialRepository();
    const repo2Any = repo2 as any;
    repo2Any._config = MOCK_TUTORIAL_CONFIG;
    repo2Any._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sys2Any._repository = repo2;
    sys2Any._progress = createDefaultTutorialProgress();
    sys2Any._initialized = true;
    const skipWithReason = sys2.skipTutorial('tutorial_dungeon', 'testing_skip');
    this.assert('带 reason 跳过成功', skipWithReason);
    this.assert('isSkipped(tutorial_dungeon) = true', sys2.isSkipped('tutorial_dungeon'));

    // 4f. skipAll
    const sys3 = new TutorialSystem();
    const sys3Any = sys3 as any;
    const repo3 = new TutorialRepository();
    const repo3Any = repo3 as any;
    repo3Any._config = MOCK_TUTORIAL_CONFIG;
    repo3Any._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sys3Any._repository = repo3;
    sys3Any._progress = createDefaultTutorialProgress();
    sys3Any._initialized = true;

    const skippedCount = sys3.skipAll('test_skip_all');
    this.assert('skipAll 跳过 4 个引导组', skippedCount === 4);
    this.assert('skipAll 后 isAllComplete = true', sys3.isAllComplete());
    this.assert('skipAll 后 isInProgress = false', !sys3.isInProgress());

    // 4g. skipAll 再次调用返回 0
    const skippedAgain = sys3.skipAll();
    this.assert('再次 skipAll 返回 0', skippedAgain === 0);
  }

  // ==================== 测试 5：TutorialSystem 边界情况 ====================

  private static testTutorialSystemEdgeCases(): void {
    console.log('--- 测试 5: TutorialSystem 边界情况 ---');

    // 5a. 未初始化时调用方法抛异常
    const sys = new TutorialSystem();
    try {
      sys.startTutorial('test');
      this.assert('未初始化 startTutorial 抛异常', false, '应抛异常');
    } catch (e: any) {
      this.assert(
        '未初始化 startTutorial 抛异常',
        e.message && e.message.includes('未初始化'),
      );
    }

    try {
      sys.completeStep();
      this.assert('未初始化 completeStep 抛异常', false, '应抛异常');
    } catch (e: any) {
      this.assert(
        '未初始化 completeStep 抛异常',
        e.message && e.message.includes('未初始化'),
      );
    }

    // 5b. 跳过不存在的引导
    const sys2 = new TutorialSystem();
    const sys2Any = sys2 as any;
    const repo2 = new TutorialRepository();
    const repo2Any = repo2 as any;
    repo2Any._config = MOCK_TUTORIAL_CONFIG;
    repo2Any._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sys2Any._repository = repo2;
    sys2Any._progress = createDefaultTutorialProgress();
    sys2Any._initialized = true;

    const skipInvalid = sys2.skipTutorial('nonexistent_group');
    this.assert('跳过不存在的引导返回 false', !skipInvalid);

    // 5c. 无进行中步骤时 completeStep 返回 null
    const noStepResult = sys2.completeStep();
    this.assert('无进行中步骤时 completeStep 返回 null', noStepResult === null);

    // 5d. 无组且全部标记后 isAllComplete
    const sys3 = new TutorialSystem();
    const sys3Any = sys3 as any;
    const repo3 = new TutorialRepository();
    const repo3Any = repo3 as any;
    repo3Any._config = MOCK_TUTORIAL_CONFIG;
    repo3Any._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sys3Any._repository = repo3;
    // 所有组都已完成
    const allDoneProgress = createDefaultTutorialProgress();
    allDoneProgress.completedGroupIds = ['tutorial_intro', 'tutorial_battle'];
    allDoneProgress.skippedGroupIds = ['tutorial_equipment', 'tutorial_dungeon'];
    allDoneProgress.isComplete = true;
    sys3Any._progress = allDoneProgress;
    sys3Any._initialized = true;

    this.assert('全标记后 isAllComplete = true', sys3.isAllComplete());

    // 5e. generateTutorialSnapshot
    const snapshot = sys3.generateTutorialSnapshot();
    this.assert('generateTutorialSnapshot 返回有效快照', snapshot !== null);
    this.assert('snapshot.isComplete = true', snapshot.isComplete);
    this.assert('snapshot.completedGroupIds 长度 2', snapshot.completedGroupIds.length === 2);
    this.assert('snapshot.skippedGroupIds 长度 2', snapshot.skippedGroupIds.length === 2);
    this.assert('snapshot.snapshotAt > 0', snapshot.snapshotAt > 0);

    // 5f. 开始不存在的引导
    const startInvalid = sys2.startTutorial('nonexistent_group');
    this.assert('开始不存在的引导返回 false', !startInvalid);

    // 5g. 依赖检查 — 多级依赖
    const sys4 = new TutorialSystem();
    const sys4Any = sys4 as any;
    const repo4 = new TutorialRepository();
    const repo4Any = repo4 as any;
    // 带多级依赖的配置
    const multiDepConfig: TutorialConfigData = {
      version: 1,
      groups: [
        {
          groupId: 'g_a', nameKey: 'A', description: 'A',
          priority: 100, dependencies: [], steps: [
            { stepId: 'g_a_01', groupId: 'g_a', order: 0, titleKey: '', descriptionKey: '' },
          ],
        },
        {
          groupId: 'g_b', nameKey: 'B', description: 'B',
          priority: 90, dependencies: ['g_a'], steps: [
            { stepId: 'g_b_01', groupId: 'g_b', order: 0, titleKey: '', descriptionKey: '' },
          ],
        },
        {
          groupId: 'g_c', nameKey: 'C', description: 'C',
          priority: 80, dependencies: ['g_a', 'g_b'], steps: [
            { stepId: 'g_c_01', groupId: 'g_c', order: 0, titleKey: '', descriptionKey: '' },
          ],
        },
      ],
    };
    repo4Any._config = multiDepConfig;
    repo4Any._buildIndexes(multiDepConfig);
    sys4Any._repository = repo4;
    sys4Any._progress = createDefaultTutorialProgress();
    sys4Any._initialized = true;

    this.assert('g_a 无依赖可开始', sys4.startTutorial('g_a'));
    while (sys4.isInProgress()) sys4.completeStep();

    this.assert('g_a 完成后 g_b 可开始', sys4.startTutorial('g_b'));
    while (sys4.isInProgress()) sys4.completeStep();

    this.assert('g_c 需要 g_a+g_b 都完成', sys4.startTutorial('g_c'));
    this.assert('g_c 可开始（依赖都满足）', sys4.isInProgress());
  }

  // ==================== 测试 6：Event 集成 ====================

  private static testEventIntegration(): void {
    console.log('--- 测试 6: Event 集成 ---');

    const eventManager = EventManager.getInstance();
    const collected: Array<{ event: string; data: any }> = [];

    const onTutorialStarted = (data: any) => collected.push({ event: 'tutorial:started', data });
    const onTutorialStepCompleted = (data: any) => collected.push({ event: 'tutorial:stepCompleted', data });
    const onTutorialCompleted = (data: any) => collected.push({ event: 'tutorial:completed', data });
    const onTutorialSkipped = (data: any) => collected.push({ event: 'tutorial:skipped', data });

    eventManager.on(TutorialSystem.TUTORIAL_STARTED, onTutorialStarted);
    eventManager.on(TutorialSystem.TUTORIAL_STEP_COMPLETED, onTutorialStepCompleted);
    eventManager.on(TutorialSystem.TUTORIAL_COMPLETED, onTutorialCompleted);
    eventManager.on(TutorialSystem.TUTORIAL_SKIPPED, onTutorialSkipped);

    // 创建系统并触发事件
    const sys = new TutorialSystem();
    const sysAny = sys as any;
    const repo = new TutorialRepository();
    const repoAny = repo as any;
    repoAny._config = MOCK_TUTORIAL_CONFIG;
    repoAny._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sysAny._repository = repo;
    sysAny._progress = createDefaultTutorialProgress();
    sysAny._initialized = true;

    // 开始引导 → started 事件
    sys.startTutorial('tutorial_intro');
    const startedEvents = collected.filter((e) => e.event === 'tutorial:started');
    this.assert('收到 tutorial:started 事件', startedEvents.length >= 1);
    this.assert('started 事件包含 groupId', startedEvents[0]?.data?.groupId === 'tutorial_intro');
    this.assert('started 事件包含 stepId', startedEvents[0]?.data?.stepId === 'tutorial_intro_01');
    this.assert('started 事件包含 totalSteps', startedEvents[0]?.data?.totalSteps === 3);

    // 完成步骤 → stepCompleted 事件
    sys.completeStep();
    const stepEvents = collected.filter((e) => e.event === 'tutorial:stepCompleted');
    this.assert('收到 tutorial:stepCompleted 事件', stepEvents.length >= 1);
    this.assert('stepCompleted 事件包含 groupId', stepEvents[0]?.data?.groupId === 'tutorial_intro');
    this.assert('stepCompleted 事件包含 completedCount=1', stepEvents[0]?.data?.completedCount === 1);
    this.assert('stepCompleted 事件包含 totalSteps=3', stepEvents[0]?.data?.totalSteps === 3);

    sys.completeStep();
    sys.completeStep(); // 完成最后一步

    // 组完成 → completed 事件
    const completedEvents = collected.filter((e) => e.event === 'tutorial:completed');
    this.assert('收到 tutorial:completed 事件', completedEvents.length >= 1);
    this.assert('completed 事件包含 groupId', completedEvents[0]?.data?.groupId === 'tutorial_intro');
    this.assert('completed 事件包含 totalSteps=3', completedEvents[0]?.data?.totalSteps === 3);

    // 跳过 → skipped 事件
    sys.skipTutorial('tutorial_battle', 'test_event_skip');
    const skippedEvents = collected.filter((e) => e.event === 'tutorial:skipped');
    this.assert('收到 tutorial:skipped 事件', skippedEvents.length >= 1);
    this.assert('skipped 事件包含 groupId', skippedEvents[0]?.data?.groupId === 'tutorial_battle');
    this.assert('skipped 事件包含 reason', skippedEvents[0]?.data?.reason === 'test_event_skip');

    // 清理
    eventManager.off(TutorialSystem.TUTORIAL_STARTED, onTutorialStarted);
    eventManager.off(TutorialSystem.TUTORIAL_STEP_COMPLETED, onTutorialStepCompleted);
    eventManager.off(TutorialSystem.TUTORIAL_COMPLETED, onTutorialCompleted);
    eventManager.off(TutorialSystem.TUTORIAL_SKIPPED, onTutorialSkipped);

    console.log(`  事件测试收到 ${collected.length} 个事件`);
  }

  // ==================== 测试 7：Save/Restore ====================

  private static testSaveRestore(): void {
    console.log('--- 测试 7: Save/Restore ---');

    const sys = new TutorialSystem();
    const sysAny = sys as any;
    const repo = new TutorialRepository();
    const repoAny = repo as any;
    repoAny._config = MOCK_TUTORIAL_CONFIG;
    repoAny._buildIndexes(MOCK_TUTORIAL_CONFIG);
    sysAny._repository = repo;
    sysAny._progress = createDefaultTutorialProgress();
    sysAny._initialized = true;

    // 7a. 开始并完成一些引导
    sys.startTutorial('tutorial_intro');
    sys.completeStep(); // step 1
    sys.completeStep(); // step 2

    // 手动保存
    sys.save();

    // 验证存档已写入
    const svMgr = SaveManager.getInstance();
    const loaded = svMgr.loadTutorialData();
    this.assert('loadTutorialData 非 null', loaded !== null);
    this.assert('snapshot 非 null', loaded!.snapshot !== null);
    this.assert('snapshot.currentGroupId = tutorial_intro', loaded!.snapshot!.currentGroupId === 'tutorial_intro');
    this.assert('snapshot.completedStepIds 包含 2 步', loaded!.snapshot!.completedStepIds.length >= 2);
    this.assert('snapshot.isComplete = false', !loaded!.snapshot!.isComplete);
    this.assert('saveVersion = 1', loaded!.saveVersion === 1);
    this.assert('updatedAt > 0', loaded!.updatedAt > 0);

    // 7b. 恢复
    const sys2 = new TutorialSystem();
    const sys2Any = sys2 as any;
    sys2Any._repository = repo;
    sys2Any._progress = createDefaultTutorialProgress();
    sys2Any._initialized = true;
    sys2.restore();

    const restoredProgress = sys2.getProgress();
    this.assert('恢复后 currentGroupId 正确', restoredProgress.currentGroupId === 'tutorial_intro');
    this.assert('恢复后 completedStepIds 包含 2 步', restoredProgress.completedStepIds.length >= 2);

    // 7c. 空存档恢复
    svMgr.saveTutorialData({ snapshot: null, saveVersion: 1, updatedAt: Date.now() });
    const sys3 = new TutorialSystem();
    const sys3Any = sys3 as any;
    sys3Any._repository = repo;
    sys3Any._progress = createDefaultTutorialProgress();
    sys3Any._initialized = true;
    sys3.restore();
    this.assert('空存档恢复后 isAllComplete = false', !sys3.isAllComplete());
    this.assert('空存档恢复后 currentGroupId 为空', sys3.getProgress().currentGroupId === '');

    // 7d. 完成全部引导后保存并恢复
    const sys4 = new TutorialSystem();
    const sys4Any = sys4 as any;
    sys4Any._repository = repo;
    sys4Any._progress = createDefaultTutorialProgress();
    sys4Any._initialized = true;
    sys4.skipAll('test_save_complete');

    const snap = sys4.generateTutorialSnapshot();
    this.assert('全完成后 snapshot.isComplete = true', snap.isComplete);
    this.assert('全完成后 snapshot.completedGroupIds 含全部', snap.skippedGroupIds.length === 4);

    // 7e. 重复 save/restore 保持一致性
    const sys5 = new TutorialSystem();
    const sys5Any = sys5 as any;
    sys5Any._repository = repo;
    sys5Any._progress = createDefaultTutorialProgress();
    sys5Any._initialized = true;
    sys5.startTutorial('tutorial_intro');
    sys5.completeStep();

    sys5.save();
    sys5.restore();
    this.assert('save→restore 后 currentStepId 保持一致', sys5.getProgress().currentStepId === 'tutorial_intro_02');
  }
}
