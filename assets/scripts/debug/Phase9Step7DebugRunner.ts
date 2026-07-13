// ============================================================
// Phase9Step7DebugRunner — ChapterSystem 集成测试
// 职责：验证 ChapterTypes / ChapterRepository / ChapterSystem /
//        ChapterSaveData / SaveV2 集成 / Event 集成 / 边界情况
// 用法：在 Cocos Creator 控制台执行 Phase9Step7DebugRunner.runAll()
// 目标：150+ 断言测试
// ============================================================

import { ChapterRepository } from '../chapter/ChapterRepository';
import { ChapterSystem } from '../chapter/ChapterSystem';
import type { StageCompletionContext } from '../chapter/ChapterSystem';
import { EventManager } from '../core/EventManager';
import { ConfigManager } from '../core/ConfigManager';
import type { ChapterSaveData } from '../save/ChapterSaveData';
import { createDefaultChapterSaveData } from '../save/ChapterSaveData';
import type {
  ChapterConfig,
  StageConfig,
  ChapterProgress,
  ChapterSnapshot,
} from '../chapter/ChapterTypes';
import {
  createDefaultChapterProgress,
  createEmptyChapterSnapshot,
  createDefaultStageUnlockCondition,
  createDefaultChapterUnlockCondition,
  createDefaultStageReward,
} from '../chapter/ChapterTypes';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step7DebugRunner {
  private _results: TestResult[] = [];
  private _assertCount = 0;
  private _eventLog: Array<{ event: string; data: Record<string, unknown> }> = [];

  // ---- 断言工具 ----

  private _assert(condition: boolean, testName: string, detail: string): void {
    this._assertCount++;
    const passed = !!condition;
    this._results.push({
      name: testName,
      passed,
      message: passed ? 'PASS' : `FAIL: ${detail}`,
    });
    if (!passed) {
      console.error(`[Phase9Step7Debug] [${this._assertCount}] FAIL: ${testName} — ${detail}`);
    }
  }

  private _snapshot(label: string): void {
    console.log(`[Phase9Step7Debug] 📸 ${label} (assertions so far: ${this._assertCount})`);
  }

  // ---- 事件监听器 ----

  private _eventCallback = (event: string, data: Record<string, unknown>): void => {
    this._eventLog.push({ event, data });
  };

  private _getEventsOfType(eventType: string): Array<Record<string, unknown>> {
    return this._eventLog
      .filter((e) => e.event === eventType)
      .map((e) => e.data);
  }

  private _clearEvents(): void {
    this._eventLog = [];
  }

  // ---- 主入口 ----

  async runAll(): Promise<void> {
    console.log('========================================');
    console.log('Phase9Step7DebugRunner — ChapterSystem 集成测试');
    console.log('========================================');

    this._results = [];
    this._assertCount = 0;
    this._eventLog = [];

    // 注册事件监听
    EventManager.getInstance().on(ChapterSystem.CHAPTER_UNLOCKED, (data) => {
      this._eventCallback(ChapterSystem.CHAPTER_UNLOCKED, data as Record<string, unknown>);
    });
    EventManager.getInstance().on(ChapterSystem.STAGE_UNLOCKED, (data) => {
      this._eventCallback(ChapterSystem.STAGE_UNLOCKED, data as Record<string, unknown>);
    });
    EventManager.getInstance().on(ChapterSystem.STAGE_COMPLETED, (data) => {
      this._eventCallback(ChapterSystem.STAGE_COMPLETED, data as Record<string, unknown>);
    });
    EventManager.getInstance().on(ChapterSystem.CHAPTER_COMPLETED, (data) => {
      this._eventCallback(ChapterSystem.CHAPTER_COMPLETED, data as Record<string, unknown>);
    });

    try {
      await this._test_01_types();
      this._snapshot('Types 完成');

      await this._test_02_repository();
      this._snapshot('Repository 完成');

      await this._test_03_system_initialization();
      this._snapshot('System Init 完成');

      await this._test_04_chapter_unlock();
      this._snapshot('Chapter Unlock 完成');

      await this._test_05_stage_unlock();
      this._snapshot('Stage Unlock 完成');

      await this._test_06_stage_completion();
      this._snapshot('Stage Completion 完成');

      await this._test_07_chapter_completion_and_chain();
      this._snapshot('Chapter Chain 完成');

      await this._test_08_snapshot();
      this._snapshot('Snapshot 完成');

      await this._test_09_save_restore();
      this._snapshot('Save/Restore 完成');

      await this._test_10_edge_cases();
      this._snapshot('Edge Cases 完成');

      await this._test_11_getCurrentChapter();
      this._snapshot('CurrentChapter 完成');

      await this._test_12_repository_queries();
      this._snapshot('Repo Queries 完成');

      await this._test_13_idempotency();
      this._snapshot('Idempotency 完成');
    } catch (e) {
      console.error('[Phase9Step7Debug] 测试异常:', e);
      this._results.push({
        name: 'FATAL_EXCEPTION',
        passed: false,
        message: `测试抛出异常: ${e}`,
      });
    }

    // 打印最终报告
    this._printReport();
  }

  // ==================== Test 01: Types ====================

  private async _test_01_types(): Promise<void> {
    // -- createDefaultChapterProgress --
    const cp = createDefaultChapterProgress('test_chapter');
    this._assert(cp.chapterId === 'test_chapter', 'T01.001', 'chapterId 应为传入值');
    this._assert(cp.status === 'locked', 'T01.002', '默认状态应为 locked');
    this._assert(Array.isArray(cp.completedStageIds), 'T01.003', 'completedStageIds 应为数组');
    this._assert(cp.completedStageIds.length === 0, 'T01.004', '默认已完成关卡列表为空');
    this._assert(cp.currentStageId === '', 'T01.005', '默认当前关卡为空字符串');
    this._assert(cp.unlockedAt === 0, 'T01.006', '默认解锁时间为 0');
    this._assert(cp.completedAt === 0, 'T01.007', '默认完成时间为 0');
    this._assert(typeof cp.updatedAt === 'number' && cp.updatedAt > 0, 'T01.008', 'updatedAt 应 > 0');

    // -- createEmptyChapterSnapshot --
    const cs = createEmptyChapterSnapshot('test_chapter');
    this._assert(cs.chapterId === 'test_chapter', 'T01.009', 'chapterId 应为传入值');
    this._assert(cs.chapterName === '', 'T01.010', '默认名称为空');
    this._assert(cs.chapterIndex === 0, 'T01.011', '默认 index 为 0');
    this._assert(cs.currentStageId === '', 'T01.012', '默认当前关卡为空');
    this._assert(cs.currentStage === null, 'T01.013', '默认当前关卡配置为 null');
    this._assert(cs.completedStageCount === 0, 'T01.014', '默认完成数为 0');
    this._assert(cs.totalStageCount === 0, 'T01.015', '默认总数为 0');
    this._assert(Array.isArray(cs.unlockedStageIds), 'T01.016', 'unlockedStageIds 应为数组');
    this._assert(cs.recommendedPower === 0, 'T01.017', '默认推荐战力为 0');
    this._assert(cs.isCompleted === false, 'T01.018', '默认未完成');
    this._assert(typeof cs.capturedAt === 'number' && cs.capturedAt > 0, 'T01.019', 'capturedAt 应 > 0');

    // -- 工厂函数类型 --
    const cond = createDefaultStageUnlockCondition();
    this._assert(cond.prevStageId === null, 'T01.020', '默认前置关卡为 null');
    this._assert(cond.playerLevel === 1, 'T01.021', '默认等级为 1');
    this._assert(cond.totalPower === 0, 'T01.022', '默认战力为 0');

    const chCond = createDefaultChapterUnlockCondition();
    this._assert(chCond.prevChapterId === null, 'T01.023', '默认前置章节为 null');
    this._assert(chCond.playerLevel === 1, 'T01.024', '默认章节等级为 1');

    const reward = createDefaultStageReward();
    this._assert(reward.type === 'gold', 'T01.025', '默认奖励类型为 gold');
    this._assert(reward.id === '', 'T01.026', '默认奖励 id 为空');
    this._assert(reward.amount === 0, 'T01.027', '默认奖励数量为 0');

    // -- ChapterSaveData 工厂 --
    const saveData = createDefaultChapterSaveData();
    this._assert(typeof saveData.chapterProgress === 'object', 'T01.028', 'chapterProgress 应为对象');
    this._assert(saveData.currentChapterId === '', 'T01.029', '默认当前章节为空');
    this._assert(saveData.saveVersion === 1, 'T01.030', '存档版本号为 1');
    this._assert(saveData.updatedAt > 0, 'T01.031', 'updatedAt 应 > 0');
  }

  // ==================== Test 02: ChapterRepository ====================

  private async _test_02_repository(): Promise<void> {
    const repository = ChapterRepository.getInstance();

    // 加载前
    this._assert(!repository.isLoaded(), 'T02.001', '加载前 isLoaded 为 false');
    this._assert(repository.getChapterCount() === 0, 'T02.002', '加载前数量为 0');
    this._assert(repository.getAllChapters().length === 0, 'T02.003', '加载前章节列表为空');
    this._assert(repository.getChapter('chapter_001') === null, 'T02.004', '加载前查询返回 null');
    this._assert(repository.getStage('chapter_001_stage_01') === null, 'T02.005', '加载前关卡查询返回 null');

    // 加载
    await repository.loadConfig();
    this._assert(repository.isLoaded(), 'T02.006', '加载后 isLoaded 为 true');

    // 章节数量
    this._assert(repository.getChapterCount() >= 3, 'T02.007', '应有至少 3 个章节');
    this._assert(repository.hasChapter('chapter_001'), 'T02.008', 'chapter_001 应存在');
    this._assert(repository.hasChapter('chapter_002'), 'T02.009', 'chapter_002 应存在');
    this._assert(repository.hasChapter('chapter_003'), 'T02.010', 'chapter_003 应存在');

    // getChapter
    const ch1 = repository.getChapter('chapter_001');
    this._assert(ch1 !== null, 'T02.011', 'getChapter(chapter_001) 不为 null');
    this._assert(ch1!.id === 'chapter_001', 'T02.012', '章节 ID 正确');
    this._assert(ch1!.chapterIndex === 1, 'T02.013', 'chapterIndex 为 1');
    this._assert(ch1!.stages.length >= 5, 'T02.014', '每章应有至少 5 个关卡');
    this._assert(ch1!.stages.length === 10, 'T02.015', 'chapter_001 应有 10 个关卡');
    this._assert(typeof ch1!.name === 'string' && ch1!.name.length > 0, 'T02.016', '章节名非空');
    this._assert(ch1!.unlockCondition.prevChapterId === null, 'T02.017', '首章无前置章节');

    // getAllChapters 排序
    const all = repository.getAllChapters();
    for (let i = 1; i < all.length; i++) {
      this._assert(
        all[i].chapterIndex > all[i - 1].chapterIndex,
        `T02.018a-${i}`,
        `章节按 index 升序 (${all[i-1].chapterIndex} < ${all[i].chapterIndex})`,
      );
    }

    // 关卡查询
    const stage = repository.getStage('chapter_001_stage_01');
    this._assert(stage !== null, 'T02.019', 'getStage 应找到关卡');
    this._assert(stage!.id === 'chapter_001_stage_01', 'T02.020', '关卡 ID 正确');
    this._assert(stage!.chapterId === 'chapter_001', 'T02.021', '关卡所属章节正确');
    this._assert(stage!.stageIndex === 1, 'T02.022', '关卡序号为 1');
    this._assert(stage!.type === 'normal', 'T02.023', '第一关类型为 normal');

    // getStagesByChapter
    const stages = repository.getStagesByChapter('chapter_001');
    this._assert(stages.length === 10, 'T02.024', 'getStagesByChapter 返回 10 关');

    // getStageCount
    this._assert(repository.getStageCount('chapter_001') === 10, 'T02.025', 'chapter_001 关卡数 10');
    this._assert(repository.getStageCount('chapter_002') === 6, 'T02.026', 'chapter_002 关卡数 6');
    this._assert(repository.getStageCount('chapter_003') === 6, 'T02.027', 'chapter_003 关卡数 6');

    // getFirstStageOfChapter / getLastStageOfChapter
    const first = repository.getFirstStageOfChapter('chapter_001');
    this._assert(first !== null, 'T02.028', 'getFirstStageOfChapter 不为 null');
    this._assert(first!.stageIndex === 1, 'T02.029', '首关 index 为 1');

    const last = repository.getLastStageOfChapter('chapter_001');
    this._assert(last !== null, 'T02.030', 'getLastStageOfChapter 不为 null');
    this._assert(last!.stageIndex === 10, 'T02.031', '末关 index 为 10');
    this._assert(last!.type === 'boss', 'T02.032', '末关类型为 boss（第10关）');

    // getNextStage
    const next = repository.getNextStage('chapter_001_stage_01');
    this._assert(next !== null, 'T02.033', 'getNextStage 不为 null');
    this._assert(next!.id === 'chapter_001_stage_02', 'T02.034', '下一关为 stage_02');

    const lastNext = repository.getNextStage('chapter_001_stage_10');
    this._assert(lastNext === null, 'T02.035', '第10关（末关）的下一关为 null');

    const stage6Next = repository.getNextStage('chapter_001_stage_06');
    this._assert(stage6Next !== null, 'T02.035b', '第6关（非末关）的下一关不为 null');
    this._assert(stage6Next!.id === 'chapter_001_stage_07', 'T02.035c', '第6关的下一关为 stage_07');

    const nonexistentNext = repository.getNextStage('nonexistent');
    this._assert(nonexistentNext === null, 'T02.036', '不存在的关卡下一关为 null');

    // getChapterRecommendedPower
    const power = repository.getChapterRecommendedPower('chapter_001');
    this._assert(power > 0, 'T02.037', '推荐战力应 > 0');
    this._assert(power >= 800, 'T02.038', 'chapter_001 推荐战力 >= 800');

    // getTotalStageCount
    this._assert(repository.getTotalStageCount() >= 15, 'T02.039', '总关卡数 >= 15');

    // getAllChapterIds
    const ids = repository.getAllChapterIds();
    this._assert(ids.includes('chapter_001'), 'T02.040', 'chapter_001 在 ID 列表中');
    this._assert(ids.length >= 3, 'T02.041', '至少 3 个章节 ID');

    // 验证 boss 关卡（第10关）
    const bossStage = repository.getStage('chapter_001_stage_10');
    this._assert(bossStage!.bossId !== '', 'T02.042', 'boss 关卡应有 bossId');
    this._assert(bossStage!.type === 'boss', 'T02.043', 'boss 关卡（第10关）类型为 boss');

    // 验证第6关已调整为普通关
    const stage6 = repository.getStage('chapter_001_stage_06');
    this._assert(stage6!.type === 'normal', 'T02.043b', '第6关类型为 normal');
    this._assert(stage6!.bossId === '', 'T02.043c', '第6关 bossId 为空');

    // 验证 rewards
    this._assert(bossStage!.rewards.length > 0, 'T02.044', 'boss 关卡应有奖励');
  }

  // ==================== Test 03: System Initialization ====================

  private async _test_03_system_initialization(): Promise<void> {
    const system = ChapterSystem.getInstance();
    system.clearData();
    this._clearEvents();

    // 初始化前
    this._assert(!system.isInitialized(), 'T03.001', '初始化前 isInitialized 为 false');

    let threwBeforeInit = false;
    try {
      system.getCurrentChapterId();
    } catch {
      threwBeforeInit = true;
    }
    this._assert(threwBeforeInit, 'T03.002', '未初始化时调用方法应抛出异常');

    // 初始化
    const result = await system.initialize();
    this._assert(result === true, 'T03.003', 'initialize 返回 true');
    this._assert(system.isInitialized(), 'T03.004', '初始化后 isInitialized 为 true');

    // 重复初始化
    const result2 = await system.initialize();
    this._assert(result2 === true, 'T03.005', '重复初始化返回 true');

    // 首个章节应自动解锁
    this._assert(system.isChapterUnlocked('chapter_001'), 'T03.006', '首章自动解锁');
    this._assert(!system.isChapterUnlocked('chapter_002'), 'T03.007', '第二章未解锁');
    this._assert(!system.isChapterUnlocked('chapter_003'), 'T03.008', '第三章未解锁');

    // 事件验证
    const chapterEvents = this._getEventsOfType(ChapterSystem.CHAPTER_UNLOCKED);
    this._assert(chapterEvents.length >= 1, 'T03.009', '应有章节解锁事件');
    this._assert(
      chapterEvents[0]?.chapterId === 'chapter_001',
      'T03.010',
      '章节解锁事件 chapterId 应为 chapter_001',
    );

    const stageEvents = this._getEventsOfType(ChapterSystem.STAGE_UNLOCKED);
    this._assert(stageEvents.length >= 1, 'T03.011', '应有关卡解锁事件');
    this._assert(
      stageEvents[0]?.stageId === 'chapter_001_stage_01',
      'T03.012',
      '首个解锁的关卡应为 chapter_001_stage_01',
    );
  }

  // ==================== Test 04: Chapter Unlock ====================

  private async _test_04_chapter_unlock(): Promise<void> {
    const system = ChapterSystem.getInstance();
    this._clearEvents();

    // 重复解锁（已解锁）
    const resultDup = system.unlockChapter('chapter_001');
    this._assert(!resultDup, 'T04.001', '重复解锁应返回 false');

    // 尝试解锁有前置但前置未完成的章节
    const resultSkip = system.unlockChapter('chapter_002');
    this._assert(!resultSkip, 'T04.002', '前置章节未完成时解锁 chapter_002 应失败');

    // 解锁不存在的章节
    const resultNonexistent = system.unlockChapter('nonexistent');
    this._assert(!resultNonexistent, 'T04.003', '解锁不存在的章节应返回 false');

    // 查询进度
    const prog1 = system.getChapterProgress('chapter_001');
    this._assert(prog1 !== null, 'T04.004', 'getChapterProgress 不为 null');
    this._assert(prog1!.status === 'unlocked', 'T04.005', '首章状态为 unlocked');
    this._assert(prog1!.unlockedAt > 0, 'T04.006', '解锁时间已设置');
    this._assert(prog1!.completedAt === 0, 'T04.007', '完成时间未设置（未完成）');

    const prog2 = system.getChapterProgress('chapter_002');
    this._assert(prog2 !== null, 'T04.008', '第二章进度不为 null');
    this._assert(prog2!.status === 'locked', 'T04.009', '第二章状态为 locked');

    // getChapter 配置查询
    const ch1 = system.getChapter('chapter_001');
    this._assert(ch1 !== null, 'T04.010', 'getChapter 返回配置');
    this._assert(ch1!.name.length > 0, 'T04.011', '章节名非空');

    // getAllChapters
    const all = system.getAllChapters();
    this._assert(all.length >= 3, 'T04.012', 'getAllChapters 返回 >=3 个章节');

    // getAllChapterProgress
    const allProg = system.getAllChapterProgress();
    this._assert(allProg.size >= 3, 'T04.013', 'getAllChapterProgress 返回 >=3 个进度');

    // getRecommendedPower
    const power = system.getRecommendedPower('chapter_001');
    this._assert(power > 0, 'T04.014', 'getRecommendedPower > 0');
  }

  // ==================== Test 05: Stage Unlock ====================

  private async _test_05_stage_unlock(): Promise<void> {
    const system = ChapterSystem.getInstance();
    this._clearEvents();

    // 解锁不存在的关卡
    const resultNonexistent = system.unlockStage('nonexistent', 99, 9999);
    this._assert(!resultNonexistent, 'T05.001', '解锁不存在的关卡应返回 false');

    // 尝试解锁属于未解锁章节的关卡
    const resultLockedChapter = system.unlockStage('chapter_002_stage_01', 99, 9999);
    this._assert(!resultLockedChapter, 'T05.002', '未解锁章节的关卡无法解锁');

    // 尝试以不足的等级解锁
    const resultLowLevel = system.unlockStage('chapter_001_stage_02', 0, 9999);
    this._assert(!resultLowLevel, 'T05.003', '等级不足时无法解锁');

    // 尝试以不足的战力解锁
    const resultLowPower = system.unlockStage('chapter_001_stage_02', 99, 0);
    this._assert(!resultLowPower, 'T05.004', '战力不足时无法解锁');

    // 尝试跳关解锁（前置关卡未完成）
    const resultSkip = system.unlockStage('chapter_001_stage_03', 99, 9999);
    this._assert(!resultSkip, 'T05.005', '前置关卡未完成时无法解锁');

    // 正常解锁 stage_02（首关已经在 init 时解锁，但未完成所以 stage_02 的前置不满足）
    // 先需要完成 stage_01
    // 但我们先看 stage_01 是否能正常解锁（已经 unlocked 了）
    const resultStage01 = system.unlockStage('chapter_001_stage_01', 99, 9999);
    this._assert(resultStage01, 'T05.006', '无前置条件的首关可正常解锁');

    // getCurrentStage
    const currentStage = system.getCurrentStage();
    this._assert(currentStage !== null, 'T05.007', 'getCurrentStage 不为 null');
  }

  // ==================== Test 06: Stage Completion ====================

  private async _test_06_stage_completion(): Promise<void> {
    const system = ChapterSystem.getInstance();
    this._clearEvents();

    // 完成不存在的关卡
    const resultNonexistent = system.completeStage('nonexistent');
    this._assert(!resultNonexistent, 'T06.001', '完成不存在的关卡返回 false');

    // 完成属于未解锁章节的关卡
    const resultLockedChapter = system.completeStage('chapter_002_stage_01');
    this._assert(!resultLockedChapter, 'T06.002', '完成未解锁章节的关卡返回 false');

    // 完成 stage_01（首关，已在初始化时解锁）
    const result1 = system.completeStage('chapter_001_stage_01');
    this._assert(result1, 'T06.003', '完成 stage_01 成功');

    // 验证进度
    const prog1 = system.getChapterProgress('chapter_001');
    this._assert(prog1!.completedStageIds.includes('chapter_001_stage_01'), 'T06.004', 'stage_01 在已完成列表中');

    // 完成后应自动解锁 stage_02
    this._assert(prog1!.currentStageId === 'chapter_001_stage_02', 'T06.005', '完成后当前关卡变为 stage_02');

    // 事件验证
    const completeEvents = this._getEventsOfType(ChapterSystem.STAGE_COMPLETED);
    this._assert(completeEvents.length >= 1, 'T06.006', '应有关卡完成事件');
    this._assert(
      completeEvents[0]?.stageId === 'chapter_001_stage_01',
      'T06.007',
      '完成事件 stageId 正确',
    );
    this._assert(
      completeEvents[0]?.isChapterComplete === false,
      'T06.008',
      '未完成全章时 isChapterComplete 为 false',
    );

    const unlockEvents = this._getEventsOfType(ChapterSystem.STAGE_UNLOCKED);
    const hasUnlockStage02 = unlockEvents.some(
      (e) => e.stageId === 'chapter_001_stage_02',
    );
    this._assert(hasUnlockStage02, 'T06.009', 'stage_02 解锁事件已发送');

    // 重复完成（幂等）
    const resultDup = system.completeStage('chapter_001_stage_01');
    this._assert(!resultDup, 'T06.010', '重复完成 stage_01 返回 false');

    // 验证 isStageCompleted
    this._assert(system.isStageCompleted('chapter_001_stage_01'), 'T06.011', 'isStageCompleted stage_01 为 true');
    this._assert(!system.isStageCompleted('chapter_001_stage_02'), 'T06.012', 'isStageCompleted stage_02 为 false');

    // 完成 stage_02（自动解锁后，用足够的等级和战力）
    const result2 = system.completeStage('chapter_001_stage_02');
    this._assert(result2, 'T06.013', '完成 stage_02 成功');
    this._assert(prog1!.completedStageIds.length === 2, 'T06.014', '已完成 2 关');

    // 完成 stage_03, stage_04, stage_05（逐一推进）
    for (let i = 3; i <= 5; i++) {
      const sid = `chapter_001_stage_0${i}`;
      const r = system.completeStage(sid);
      this._assert(r, `T06.015-${i}`, `完成 stage_0${i}`);
    }

    this._assert(prog1!.completedStageIds.length === 5, 'T06.016', '已完成 5 关');
    this._assert(!system.isChapterCompleted('chapter_001'), 'T06.017', '未完成全部关卡前章节未完成');
  }

  // ==================== Test 07: Chapter Completion & Chain ====================
  // [C1.5.9-G-B1-A5] 重构为三场景状态模型测试：
  //   A. 等级不足 → chapter_002 保持 locked
  //   B. 等级满足、战力不足 → chapter_002 解锁, stage_01 保持 locked
  //   C. 全部满足 → chapter_002 及 stage_01 均解锁
  // 本章节状态模型测试不代表账号等级成长链已存在。

  private async _test_07_chapter_completion_and_chain(): Promise<void> {
    const system = ChapterSystem.getInstance();
    const repository = ChapterRepository.getInstance();
    this._clearEvents();

    // ---- 前置：逐一完成第6～9关（普通主线关）----
    for (let i = 6; i <= 9; i++) {
      const pad = i < 10 ? `0${i}` : `${i}`;
      const sid = `chapter_001_stage_${pad}`;
      const r = system.completeStage(sid);
      this._assert(r, `T07.001-${i}`, `完成 stage_${pad}`);
    }

    // 完成第9关后，章节应仍未完成（还差第10关 Boss）
    this._assert(!system.isChapterCompleted('chapter_001'), 'T07.002', '完成前9关后章节未完成');

    const prog1 = system.getChapterProgress('chapter_001');
    this._assert(prog1!.completedStageIds.length === 9, 'T07.003', '已完成 9 关');
    this._assert(prog1!.status === 'unlocked', 'T07.004', '进度仍为 unlocked');

    // ---- 完成第10关（无 context，不触发后续章节自动解锁）----
    const resultBoss = system.completeStage('chapter_001_stage_10');
    this._assert(resultBoss, 'T07.005', '完成第10关 Boss 成功（无 context）');

    // 章节完成
    this._assert(system.isChapterCompleted('chapter_001'), 'T07.006', '完成第10关后章节已完成');
    this._assert(prog1!.status === 'completed', 'T07.007', '进度状态为 completed');
    this._assert(prog1!.completedAt > 0, 'T07.008', '完成时间已设置');
    this._assert(prog1!.completedStageIds.length === 10, 'T07.009', '全部 10 关已完成');

    // 章节完成事件
    const chapterCompleteEvents = this._getEventsOfType(ChapterSystem.CHAPTER_COMPLETED);
    this._assert(chapterCompleteEvents.length >= 1, 'T07.010', '应有章节完成事件');
    this._assert(
      chapterCompleteEvents[0]?.chapterId === 'chapter_001',
      'T07.011',
      '章节完成事件 chapterId 正确',
    );

    // boss 关完成事件的 isChapterComplete
    const completeEvents = this._getEventsOfType(ChapterSystem.STAGE_COMPLETED);
    const bossEvent = completeEvents.find((e) => e.stageId === 'chapter_001_stage_10');
    this._assert(bossEvent !== undefined, 'T07.012', '第10关 Boss 完成事件存在');
    this._assert(bossEvent!.isChapterComplete === true, 'T07.013', 'Boss 关完成时 isChapterComplete 为 true');

    // 验证第6关完成时 isChapterComplete 为 false
    const stage6Event = completeEvents.find((e) => e.stageId === 'chapter_001_stage_06');
    this._assert(stage6Event !== undefined, 'T07.014', '第6关完成事件存在');
    this._assert(stage6Event!.isChapterComplete === false, 'T07.015', '第6关完成时 isChapterComplete 为 false');

    // 无 context 完成第10关后，第二章应仍为 locked（前一节已断言）
    this._assert(!system.isChapterUnlocked('chapter_002'), 'T07.016', '无 context 时第二章未自动解锁');

    // ================================================================
    // [C1.5.9-G-B1-A5] 三场景状态模型测试
    // 使用 reevaluateUnlockConditions() 直接测试章节状态判定逻辑。
    // 真实配置值：
    //   chapter_002.unlockCondition.playerLevel = 10
    //   chapter_002_stage_01.unlockCondition.totalPower = 500
    // ================================================================

    const chapter2Config = repository.getChapter('chapter_002');
    const chapter2LevelReq = chapter2Config!.unlockCondition.playerLevel;
    this._assert(chapter2LevelReq === 10, 'T07.A.001', '第二章等级要求为 10');

    const stage01Config = repository.getStage('chapter_002_stage_01');
    const stage01PowerReq = stage01Config!.unlockCondition.totalPower;
    this._assert(stage01PowerReq === 500, 'T07.A.002', '第二章首关战力要求为 500');

    // ---- 场景A：[等级不足] playerLevel=7, totalPower=9999 ----
    // 预期：chapter_002 保持 locked，无 currentStageId
    this._clearEvents();
    const ctxA: StageCompletionContext = {
      playerLevel: 7,
      totalPower: 9999,
    };
    const changedA = system.reevaluateUnlockConditions(ctxA);
    this._assert(!changedA, 'T07.A.003', '场景A 等级不足：reevaluateUnlockConditions 返回 false');
    this._assert(!system.isChapterUnlocked('chapter_002'), 'T07.A.004', '场景A 等级不足：chapter_002 仍为 locked');
    const prog2A = system.getChapterProgress('chapter_002');
    this._assert(prog2A!.status === 'locked', 'T07.A.005', '场景A 等级不足：chapter_002.status = locked');
    this._assert(prog2A!.currentStageId === '', 'T07.A.006', '场景A 等级不足：chapter_002.currentStageId 为空');

    const chapterUnlockEventsA = this._getEventsOfType(ChapterSystem.CHAPTER_UNLOCKED);
    this._assert(
      chapterUnlockEventsA.find((e) => e.chapterId === 'chapter_002') === undefined,
      'T07.A.007',
      '场景A 等级不足：未发射 chapter_002 解锁事件',
    );

    console.log('[Phase9Step7Debug][A5] 场景A 通过: 等级不足(7<10) → chapter_002 保持 locked');

    // ---- 场景B：[等级满足，战力不足] playerLevel=10, totalPower=499 ----
    // 预期：chapter_002 unlocked，但 stage_01 保持 locked，currentStageId 为空
    this._clearEvents();
    const ctxB: StageCompletionContext = {
      playerLevel: 10,
      totalPower: 499,
    };
    const changedB = system.reevaluateUnlockConditions(ctxB);
    this._assert(changedB, 'T07.B.001', '场景B 等级满足：reevaluateUnlockConditions 返回 true');
    this._assert(system.isChapterUnlocked('chapter_002'), 'T07.B.002', '场景B：chapter_002 已解锁');
    const prog2B = system.getChapterProgress('chapter_002');
    this._assert(prog2B!.status === 'unlocked', 'T07.B.003', '场景B：chapter_002.status = unlocked');
    this._assert(
      prog2B!.currentStageId === '',
      'T07.B.004',
      '场景B 战力不足：chapter_002.currentStageId 为空（_unlockChapterStatusOnly 不设置）',
    );

    const chapterUnlockEventsB = this._getEventsOfType(ChapterSystem.CHAPTER_UNLOCKED);
    this._assert(
      chapterUnlockEventsB.find((e) => e.chapterId === 'chapter_002') !== undefined,
      'T07.B.005',
      '场景B：chapter_002 解锁事件已发射',
    );

    const stageUnlockEventsB = this._getEventsOfType(ChapterSystem.STAGE_UNLOCKED);
    this._assert(
      stageUnlockEventsB.find((e) => e.stageId === 'chapter_002_stage_01') === undefined,
      'T07.B.006',
      '场景B 战力不足：未发射 stage_01 解锁事件',
    );

    console.log('[Phase9Step7Debug][A5] 场景B 通过: 等级满足(10≥10)+战力不足(499<500) → chapter_002 unlocked, stage_01 locked');

    // ---- 场景C：[全部满足] playerLevel=10, totalPower=500 ----
    // 预期：chapter_002 unlocked（已是），stage_01 解锁，currentStageId 正确
    this._clearEvents();
    const ctxC: StageCompletionContext = {
      playerLevel: 10,
      totalPower: 500,
    };
    const changedC = system.reevaluateUnlockConditions(ctxC);
    this._assert(changedC, 'T07.C.001', '场景C 全部满足：reevaluateUnlockConditions 返回 true');
    this._assert(system.isChapterUnlocked('chapter_002'), 'T07.C.002', '场景C：chapter_002 已解锁');
    const prog2C = system.getChapterProgress('chapter_002');
    this._assert(prog2C!.status === 'unlocked', 'T07.C.003', '场景C：chapter_002.status = unlocked');
    this._assert(
      prog2C!.currentStageId === 'chapter_002_stage_01',
      'T07.C.004',
      '场景C：chapter_002.currentStageId = chapter_002_stage_01',
    );

    const stageUnlockEventsC = this._getEventsOfType(ChapterSystem.STAGE_UNLOCKED);
    this._assert(
      stageUnlockEventsC.find((e) => e.stageId === 'chapter_002_stage_01') !== undefined,
      'T07.C.005',
      '场景C：stage_01 解锁事件已发射',
    );

    // 幂等性：重复调用不产生额外事件
    this._clearEvents();
    const changedC2 = system.reevaluateUnlockConditions(ctxC);
    this._assert(!changedC2, 'T07.C.006', '场景C 幂等：重复调用返回 false');
    const chapterUnlockEventsC2 = this._getEventsOfType(ChapterSystem.CHAPTER_UNLOCKED);
    this._assert(chapterUnlockEventsC2.length === 0, 'T07.C.007', '场景C 幂等：无重复章节解锁事件');
    const stageUnlockEventsC2 = this._getEventsOfType(ChapterSystem.STAGE_UNLOCKED);
    this._assert(stageUnlockEventsC2.length === 0, 'T07.C.008', '场景C 幂等：无重复关卡解锁事件');

    console.log('[Phase9Step7Debug][A5] 场景C 通过: 全部满足(10≥10+500≥500) → chapter_002 unlocked, stage_01 unlocked, 幂等验证通过');
  }

  // ==================== Test 08: Snapshot ====================

  private async _test_08_snapshot(): Promise<void> {
    const system = ChapterSystem.getInstance();

    // 生成当前章节快照
    const snapshot = system.generateChapterSnapshot();
    this._assert(snapshot !== null, 'T08.001', '快照不为 null');
    this._assert(snapshot!.chapterId === 'chapter_002', 'T08.002', '当前章节为 chapter_002');
    this._assert(snapshot!.chapterName.length > 0, 'T08.003', '章节名非空');
    this._assert(snapshot!.chapterIndex === 2, 'T08.004', 'chapterIndex 为 2');
    this._assert(snapshot!.completedStageCount === 0, 'T08.005', '第二章已完成 0 关');
    this._assert(snapshot!.totalStageCount === 6, 'T08.006', '第二章共 6 关');
    this._assert(snapshot!.isCompleted === false, 'T08.007', '第二章未完成');
    this._assert(snapshot!.recommendedPower > 0, 'T08.008', '推荐战力 > 0');
    this._assert(typeof snapshot!.capturedAt === 'number', 'T08.009', 'capturedAt 为数字');

    // 指定章节快照
    const ch1Snapshot = system.generateChapterSnapshot('chapter_001');
    this._assert(ch1Snapshot !== null, 'T08.010', '第一章快照不为 null');
    this._assert(ch1Snapshot!.isCompleted === true, 'T08.011', '第一章已完成');
    this._assert(ch1Snapshot!.completedStageCount === 10, 'T08.012', '第一章已完成 10 关');

    // currentStage
    this._assert(snapshot!.currentStage !== null, 'T08.013', 'currentStage 不为 null');
    this._assert(snapshot!.currentStageId === 'chapter_002_stage_01', 'T08.014', '当前关卡为 stage_01');

    // unlockedStageIds
    this._assert(snapshot!.unlockedStageIds.length > 0, 'T08.015', '已解锁关卡列表非空');

    // 不存在的章节快照
    const nonexistentSnapshot = system.generateChapterSnapshot('nonexistent');
    this._assert(nonexistentSnapshot === null, 'T08.016', '不存在章节的快照为 null');

    // generateAllChapterSnapshots
    const allSnapshots = system.generateAllChapterSnapshots();
    this._assert(allSnapshots.length >= 3, 'T08.017', '应生成 >=3 个章节快照');
    this._assert(allSnapshots.every((s) => typeof s.chapterId === 'string'), 'T08.018', '所有快照有 chapterId');
  }

  // ==================== Test 09: Save/Restore ====================

  private async _test_09_save_restore(): Promise<void> {
    const system = ChapterSystem.getInstance();

    // save
    const saveData = system.save();
    this._assert(saveData !== null, 'T09.001', 'save 不为 null');
    this._assert(typeof saveData.chapterProgress === 'object', 'T09.002', 'chapterProgress 为对象');
    this._assert(saveData.currentChapterId === 'chapter_002', 'T09.003', '当前章节为 chapter_002');
    this._assert(saveData.saveVersion === 1, 'T09.004', '存档版本号为 1');
    this._assert(saveData.updatedAt > 0, 'T09.005', 'updatedAt > 0');

    // 存档中的章节进度
    const savedCh1 = saveData.chapterProgress['chapter_001'];
    this._assert(savedCh1 !== undefined, 'T09.006', '存档包含 chapter_001 进度');
    this._assert(savedCh1.status === 'completed', 'T09.007', 'chapter_001 状态为 completed');
    this._assert(savedCh1.completedStageIds.length === 10, 'T09.008', 'chapter_001 已完成 10 关');

    // 验证存档副本独立性
    const saveData2 = system.save();
    this._assert(saveData2 !== saveData, 'T09.009', '每次 save 返回新对象');
    this._assert(
      saveData2.chapterProgress !== saveData.chapterProgress,
      'T09.010',
      'chapterProgress 是新对象',
    );

    // 创建新系统实例测试 restore
    const newSystem = ChapterSystem.getInstance();
    // 先清空
    newSystem.clearData();
    this._assert(!newSystem.isInitialized(), 'T09.011', 'clearData 后未初始化');

    // 重新初始化
    await newSystem.initialize();

    // 恢复到保存前的状态（当前为刚初始化的默认状态）
    newSystem.restore(saveData);

    // 验证恢复
    this._assert(newSystem.isChapterCompleted('chapter_001'), 'T09.012', '恢复后 chapter_001 已完成');
    this._assert(newSystem.isChapterUnlocked('chapter_002'), 'T09.013', '恢复后 chapter_002 已解锁');
    this._assert(!newSystem.isChapterUnlocked('chapter_003'), 'T09.014', '恢复后 chapter_003 未解锁');

    const prog1 = newSystem.getChapterProgress('chapter_001');
    this._assert(prog1!.completedStageIds.length === 10, 'T09.015', '恢复后已完成 10 关');

    // restore 空数据
    newSystem.restore(createDefaultChapterSaveData());
    this._assert(true, 'T09.016', 'restore 空数据不抛异常');

    // restore null-like
    newSystem.restore(null as unknown as ChapterSaveData);
    this._assert(true, 'T09.017', 'restore null 不抛异常');
  }

  // ==================== Test 10: Edge Cases ====================

  private async _test_10_edge_cases(): Promise<void> {
    const system = ChapterSystem.getInstance();
    const repository = ChapterRepository.getInstance();

    // 不存在章节查询不抛异常
    const nullChapter = system.getChapter('nonexistent');
    this._assert(nullChapter === null, 'T10.001', 'getChapter 不存在返回 null');

    const nullStage = system.getStage('nonexistent');
    this._assert(nullStage === null, 'T10.002', 'getStage 不存在返回 null');

    const nullProg = system.getChapterProgress('nonexistent');
    this._assert(nullProg === null, 'T10.003', 'getChapterProgress 不存在返回 null');

    const nullPower = system.getRecommendedPower('nonexistent');
    this._assert(nullPower === 0, 'T10.004', 'getRecommendedPower 不存在返回 0');

    // 不存在章节 isChapterUnlocked / isChapterCompleted
    this._assert(!system.isChapterUnlocked('nonexistent'), 'T10.005', '不存在章节未解锁');
    this._assert(!system.isChapterCompleted('nonexistent'), 'T10.006', '不存在章节未完成');

    // 不存在关卡 isStageCompleted
    this._assert(!system.isStageCompleted('nonexistent'), 'T10.007', '不存在关卡未完成');

    // getStage 不同类型的关卡
    const normalStage = repository.getStage('chapter_001_stage_01');
    this._assert(normalStage!.type === 'normal', 'T10.008', 'stage_01 类型为 normal');

    const eliteStage = repository.getStage('chapter_001_stage_04');
    this._assert(eliteStage!.type === 'elite', 'T10.009', 'stage_04 类型为 elite');

    const bossStage = repository.getStage('chapter_001_stage_10');
    this._assert(bossStage!.type === 'boss', 'T10.010', 'stage_10 类型为 boss');

    // 关卡 reward 结构完整
    const firstReward = bossStage!.rewards[0];
    this._assert(typeof firstReward.type === 'string', 'T10.011', 'reward 有 type');
    this._assert(typeof firstReward.id === 'string', 'T10.012', 'reward 有 id');
    this._assert(typeof firstReward.amount === 'number', 'T10.013', 'reward 有 amount');
    this._assert(firstReward.amount > 0, 'T10.014', 'reward amount > 0');

    // bossId 在 boss 关卡非空
    this._assert(bossStage!.bossId !== '', 'T10.015', 'boss 关卡 bossId 非空');

    // bossId 在普通关卡为空
    this._assert(normalStage!.bossId === '', 'T10.016', 'normal 关卡 bossId 为空');

    // enemyGroupId 存在
    this._assert(typeof normalStage!.enemyGroupId === 'string', 'T10.017', 'enemyGroupId 为字符串');
    this._assert(normalStage!.enemyGroupId.length > 0, 'T10.018', 'enemyGroupId 非空');

    // staminaCost 存在
    this._assert(typeof normalStage!.staminaCost === 'number', 'T10.019', 'staminaCost 为数字');
    this._assert(normalStage!.staminaCost > 0, 'T10.020', 'staminaCost > 0');

    // unlockCondition 完整性
    const unlockCond = normalStage!.unlockCondition;
    this._assert(typeof unlockCond.playerLevel === 'number', 'T10.021', 'playerLevel 为数字');
    this._assert(typeof unlockCond.totalPower === 'number', 'T10.022', 'totalPower 为数字');
  }

  // ==================== Test 11: getCurrentChapter / getCurrentStage ====================

  private async _test_11_getCurrentChapter(): Promise<void> {
    const system = ChapterSystem.getInstance();

    // getCurrentChapterId
    const currentId = system.getCurrentChapterId();
    this._assert(currentId === 'chapter_002', 'T11.001', '当前章节为 chapter_002（第一章已完成）');

    // getCurrentStage（不传参）
    const currentStage = system.getCurrentStage();
    this._assert(currentStage !== null, 'T11.002', 'getCurrentStage 不为 null');
    this._assert(currentStage!.chapterId === 'chapter_002', 'T11.003', '当前关卡属于 chapter_002');
    this._assert(currentStage!.id === 'chapter_002_stage_01', 'T11.004', '当前关卡为 stage_01');

    // getCurrentStage（指定章节）
    const ch1Stage = system.getCurrentStage('chapter_001');
    this._assert(ch1Stage !== null, 'T11.005', 'chapter_001 的当前关卡不为 null');
    this._assert(ch1Stage!.id === 'chapter_001_stage_10', 'T11.006', '已完成章节的当前关卡为第10关');

    // 不存在章节的 getCurrentStage
    const nullStage = system.getCurrentStage('nonexistent');
    this._assert(nullStage === null, 'T11.007', '不存在章节的当前关卡为 null');
  }

  // ==================== Test 12: Repository Query Details ====================

  private async _test_12_repository_queries(): Promise<void> {
    const repository = ChapterRepository.getInstance();

    // 验证每个章节的关卡排序
    for (let chIdx = 1; chIdx <= 3; chIdx++) {
      const chId = `chapter_00${chIdx}`;
      const stages = repository.getStagesByChapter(chId);

      for (let i = 1; i < stages.length; i++) {
        this._assert(
          stages[i].stageIndex > stages[i - 1].stageIndex,
          `T12.${String(chIdx).padStart(2, '0')}a-${i}`,
          `chapter_00${chIdx} 关卡按 stageIndex 升序 (${stages[i-1].stageIndex} < ${stages[i].stageIndex})`,
        );
      }

      // 验证所有关卡绑定到正确章节
      for (const stage of stages) {
        this._assert(
          stage.chapterId === chId,
          `T12.${String(chIdx).padStart(2, '0')}b-${stage.stageIndex}`,
          `关卡 ${stage.id} 属于 ${chId}`,
        );
      }
    }

    // 验证章节推荐战力
    const ch1Power = repository.getChapterRecommendedPower('chapter_001');
    this._assert(ch1Power === 800, 'T12.07', 'chapter_001 推荐战力为 800（第10关 Boss）');

    const ch2Power = repository.getChapterRecommendedPower('chapter_002');
    this._assert(ch2Power === 1500, 'T12.08', 'chapter_002 推荐战力为 1500');

    const ch3Power = repository.getChapterRecommendedPower('chapter_003');
    this._assert(ch3Power === 3500, 'T12.09', 'chapter_003 推荐战力为 3500');

    // 验证 getNextStage 跨章节边界
    const ch1Last = repository.getLastStageOfChapter('chapter_001');
    const nextAfterCh1 = repository.getNextStage(ch1Last!.id);
    this._assert(nextAfterCh1 === null, 'T12.10', '章节末关的下一关为 null（不跨章节）');

    // 验证第二节首关无前置关卡（章节首关的 prevStageId 为 null）
    const ch2First = repository.getFirstStageOfChapter('chapter_002');
    this._assert(
      ch2First!.unlockCondition.prevStageId === null,
      'T12.12',
      '章节首关无前置关卡',
    );
  }

  // ==================== Test 13: Idempotency ====================

  private async _test_13_idempotency(): Promise<void> {
    const system = ChapterSystem.getInstance();
    this._clearEvents();

    // 多次完成同一关卡
    const result1 = system.completeStage('chapter_002_stage_01');
    this._assert(result1, 'T13.001', '第一次完成 stage_01 成功');

    const result2 = system.completeStage('chapter_002_stage_01');
    this._assert(!result2, 'T13.002', '第二次完成同一关卡返回 false');

    // 进度不应重复增加
    const prog = system.getChapterProgress('chapter_002');
    this._assert(prog!.completedStageIds.length === 1, 'T13.003', 'completedStageIds 未重复');

    // 多次初始化
    const initResult = await system.initialize();
    this._assert(initResult === true, 'T13.004', '多次初始化不抛异常');

    // 章节完成状态不会被覆盖
    this._assert(system.isChapterCompleted('chapter_001'), 'T13.005', 'chapter_001 仍为已完成');

    // 解锁已解锁的章节（幂等）
    const unlockDup = system.unlockChapter('chapter_002');
    this._assert(!unlockDup, 'T13.006', '重复解锁 chapter_002 返回 false');

    // save 后再 save 一致性
    const save1 = system.save();
    const save2 = system.save();
    this._assert(save1.currentChapterId === save2.currentChapterId, 'T13.007', '连续 save 的 currentChapterId 一致');
    this._assert(
      JSON.stringify(save1.chapterProgress['chapter_001']) ===
      JSON.stringify(save2.chapterProgress['chapter_001']),
      'T13.008',
      '连续 save 的进度一致',
    );
  }

  // ==================== 报告 ====================

  private _printReport(): void {
    const passed = this._results.filter((r) => r.passed).length;
    const failed = this._results.filter((r) => !r.passed).length;

    console.log('========================================');
    console.log('Phase9Step7DebugRunner 测试报告');
    console.log('========================================');
    console.log(`总断言数: ${this._assertCount}`);
    console.log(`通过: ${passed} ✅`);
    console.log(`失败: ${failed} ${failed > 0 ? '❌' : '✅'}`);
    console.log(`通过率: ${((passed / this._results.length) * 100).toFixed(1)}%`);
    console.log('========================================');

    if (failed > 0) {
      console.log('');
      console.log('失败明细:');
      for (const r of this._results) {
        if (!r.passed) {
          console.error(`  ❌ ${r.name}: ${r.message}`);
        }
      }
    }

    console.log('');
    if (failed === 0) {
      console.log('🎉 全部测试通过！');
    }
  }
}

// 导出便捷调用
export function runPhase9Step7Tests(): void {
  new Phase9Step7DebugRunner().runAll();
}
