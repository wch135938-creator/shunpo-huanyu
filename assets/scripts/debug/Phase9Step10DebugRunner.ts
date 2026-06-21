// ============================================================
// Phase9Step10DebugRunner — Phase9-Step10 AnalyticsSystem 集成测试
// 职责：验证 AnalyticsTypes / AnalyticsSaveData / AnalyticsSystem 全部功能
// 用法：在 Cocos Creator 控制台执行 Phase9Step10DebugRunner.runAll()
// 断言数：150+
// ============================================================

import { AnalyticsSystem } from '../analytics/AnalyticsSystem';
import { EventManager } from '../core/EventManager';
import {
  AnalyticsEventType,
  generateAnalyticsUuid,
  createDefaultAnalyticsEvent,
  createDefaultAnalyticsSession,
  createEmptyAnalyticsSnapshot,
  createDefaultAnalyticsSystemConfig,
} from '../analytics/AnalyticsTypes';
import type {
  AnalyticsEvent,
  AnalyticsSession,
  AnalyticsSnapshot,
  AnalyticsSystemConfig,
} from '../analytics/AnalyticsTypes';
import {
  createDefaultAnalyticsSaveData,
} from '../analytics/AnalyticsSaveData';
import type {
  AnalyticsSaveData,
} from '../analytics/AnalyticsSaveData';
import { BattleEvent } from '../battle/BattleSystem';
import { BattleResultType } from '../battle/BattleTypes';
import { ChapterSystem } from '../chapter/ChapterSystem';
import { TutorialSystem } from '../tutorial/TutorialSystem';

// ==================== 测试结果类型 ====================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step10DebugRunner {
  private static _results: TestResult[] = [];
  private static _eventLog: string[] = [];
  private static _assertCount = 0;

  // ==================== 主入口 ====================

  static async runAll(): Promise<void> {
    this._results = [];
    this._eventLog = [];
    this._assertCount = 0;
    console.log('========== Phase9-Step10 AnalyticsSystem 集成测试 ==========\n');

    // 清理之前的 AnalyticsSystem 实例
    this.resetAnalyticsSystem();

    // 1. AnalyticsTypes 工厂函数测试
    this.testGenerateAnalyticsUuid();
    this.testCreateDefaultAnalyticsEvent();
    this.testCreateDefaultAnalyticsSession();
    this.testCreateEmptyAnalyticsSnapshot();
    this.testCreateDefaultAnalyticsSystemConfig();

    // 2. AnalyticsSaveData 工厂函数测试
    this.testCreateDefaultAnalyticsSaveData();

    // 3. AnalyticsSystem 初始化与生命周期
    this.testInitialize();
    this.testDoubleInitialize();

    // 4. trackEvent 测试
    this.testTrackEventBasic();
    this.testTrackEventWithData();
    this.testTrackGameExit();

    // 5. trackBattle 测试
    this.testTrackBattleStart();
    this.testTrackBattleEnd();

    // 6. trackChapter / trackDungeon / trackAd / trackTutorial 测试
    this.testTrackChapter();
    this.testTrackDungeon();
    this.testTrackAd();
    this.testTrackTutorial();

    // 7. generateSnapshot 测试
    this.testGenerateSnapshot_Basic();
    this.testGenerateSnapshot_WithData();

    // 8. Save / Restore 测试
    this.testSaveDataRoundTrip();
    this.testRestoreFromEmpty();
    this.testRestoreFromPreviousData();

    // 9. 事件缓存管理测试
    this.testClearEvents();
    this.testEventBufferOverflow();

    // 10. 会话管理测试
    this.testSessionLifecycle();
    this.testSessionStatsAccumulation();

    // 11. 自动事件监听测试
    this.testAutoBattleStartedListener();
    this.testAutoBattleEndedListener();
    this.testAutoChapterCompletedListener();
    this.testAutoTutorialCompletedListener();

    // 12. 边界条件测试
    this.testTrackEventUninitialized();
    this.testGenerateSnapshotUninitialized();
    this.testRestoreNullData();
    this.testRestorePartialData();

    // 13. destroy 测试
    this.testDestroy();

    // 14. 配置测试
    this.testCustomConfig();

    // 15. getEvents / getCurrentSession 测试
    this.testGetEvents();
    this.testGetCurrentSession();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 工具方法 ====================

  private static assert(name: string, condition: boolean, msg: string): void {
    this._assertCount++;
    this._results.push({ name, passed: condition, message: condition ? 'PASS' : `FAIL: ${msg}` });
    if (!condition) {
      console.error(`  [FAIL] ${name}: ${msg}`);
    }
  }

  private static assertEquals<T>(name: string, actual: T, expected: T, msg?: string): void {
    const ok = actual === expected;
    this._assertCount++;
    this._results.push({
      name,
      passed: ok,
      message: ok ? 'PASS' : `FAIL: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}${msg ? ` — ${msg}` : ''}`,
    });
    if (!ok) {
      console.error(`  [FAIL] ${name}: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`);
    }
  }

  private static assertDefined(name: string, value: unknown, msg?: string): void {
    const ok = value !== undefined && value !== null;
    this._assertCount++;
    this._results.push({
      name,
      passed: ok,
      message: ok ? 'PASS' : `FAIL: 值为 undefined/null${msg ? ` — ${msg}` : ''}`,
    });
    if (!ok) {
      console.error(`  [FAIL] ${name}: 值为 undefined/null`);
    }
  }

  private static assertTrue(name: string, condition: boolean, msg?: string): void {
    this.assert(name, condition, msg ?? '条件不满足');
  }

  private static resetAnalyticsSystem(): void {
    // 强制重置 AnalyticsSystem 单例
    (AnalyticsSystem as any).instance = null;
  }

  private static printSummary(): void {
    const passed = this._results.filter((r) => r.passed).length;
    const failed = this._results.filter((r) => !r.passed).length;
    console.log('\n========== 测试汇总 ==========');
    console.log(`总断言数: ${this._assertCount}`);
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    if (failed > 0) {
      console.error(`\n失败项:`);
      this._results.filter((r) => !r.passed).forEach((r) => {
        console.error(`  - ${r.name}: ${r.message}`);
      });
    }
    console.log('==============================\n');
  }

  // ==================== 1. AnalyticsTypes 工厂函数测试 ====================

  private static testGenerateAnalyticsUuid(): void {
    console.log('--- 1.1 generateAnalyticsUuid ---');

    const uuid1 = generateAnalyticsUuid();
    this.assertDefined('generateAnalyticsUuid 返回非空字符串', uuid1);

    const uuid2 = generateAnalyticsUuid();
    this.assertTrue('generateAnalyticsUuid 两次调用应不同', uuid1 !== uuid2, `${uuid1} vs ${uuid2}`);

    this.assertTrue(
      'generateAnalyticsUuid 包含连字符',
      uuid1.includes('-'),
      uuid1,
    );

    this.assertEquals(
      'generateAnalyticsUuid 长度为 36',
      uuid1.length,
      36,
      `实际: ${uuid1.length}`,
    );

    this.assertTrue(
      'generateAnalyticsUuid 格式正确 (位置 14 = "4")',
      uuid1[14] === '4',
      `实际: ${uuid1[14]}`,
    );
  }

  private static testCreateDefaultAnalyticsEvent(): void {
    console.log('--- 1.2 createDefaultAnalyticsEvent ---');

    const event = createDefaultAnalyticsEvent(
      AnalyticsEventType.CUSTOM,
      'test-session-id',
      { key: 'value' },
    );

    this.assertDefined('事件 ID 非空', event.id);
    this.assertEquals('事件类型 = CUSTOM', event.type, AnalyticsEventType.CUSTOM);
    this.assertTrue('事件时间戳 > 0', event.timestamp > 0, `${event.timestamp}`);
    this.assertEquals('事件 sessionId 匹配', event.sessionId, 'test-session-id');
    this.assertDefined('事件 data 非空', event.data);
    this.assertEquals('事件 data.key = "value"', event.data.key as string, 'value');
  }

  private static testCreateDefaultAnalyticsSession(): void {
    console.log('--- 1.3 createDefaultAnalyticsSession ---');

    const session = createDefaultAnalyticsSession();
    this.assertDefined('会话 ID 非空', session.sessionId);
    this.assertTrue('会话 startTime > 0', session.startTime > 0);
    this.assertEquals('会话 endTime = 0 (进行中)', session.endTime, 0);
    this.assertEquals('会话 durationMs = 0', session.durationMs, 0);
    this.assertEquals('会话 eventCount = 0', session.eventCount, 0);
    this.assertEquals('会话 battleCount = 0', session.battleCount, 0);
    this.assertEquals('会话 battlesWon = 0', session.battlesWon, 0);
    this.assertEquals('会话 chaptersCompleted = 0', session.chaptersCompleted, 0);
    this.assertEquals('会话 dungeonsCompleted = 0', session.dungeonsCompleted, 0);
    this.assertEquals('会话 adsWatched = 0', session.adsWatched, 0);

    // 自定义 ID
    const session2 = createDefaultAnalyticsSession('custom-id');
    this.assertEquals('自定义 sessionId', session2.sessionId, 'custom-id');
  }

  private static testCreateEmptyAnalyticsSnapshot(): void {
    console.log('--- 1.4 createEmptyAnalyticsSnapshot ---');

    const snapshot = createEmptyAnalyticsSnapshot();
    this.assertEquals('snapshot totalSessions = 0', snapshot.totalSessions, 0);
    this.assertEquals('snapshot totalPlayTimeMs = 0', snapshot.totalPlayTimeMs, 0);
    this.assertEquals('snapshot totalBattles = 0', snapshot.totalBattles, 0);
    this.assertEquals('snapshot totalBattlesWon = 0', snapshot.totalBattlesWon, 0);
    this.assertEquals('snapshot totalChaptersCompleted = 0', snapshot.totalChaptersCompleted, 0);
    this.assertEquals('snapshot totalDungeonsCompleted = 0', snapshot.totalDungeonsCompleted, 0);
    this.assertEquals('snapshot totalAdsWatched = 0', snapshot.totalAdsWatched, 0);
    this.assertDefined('snapshot currentSession 为 null（默认）', snapshot.currentSession === null ? 'dummy' : null);
    this.assertTrue('snapshot recentSessions 为空数组', Array.isArray(snapshot.recentSessions) && snapshot.recentSessions.length === 0);
    this.assertTrue('snapshot generatedAt > 0', snapshot.generatedAt > 0);
  }

  private static testCreateDefaultAnalyticsSystemConfig(): void {
    console.log('--- 1.5 createDefaultAnalyticsSystemConfig ---');

    const config = createDefaultAnalyticsSystemConfig();
    this.assertEquals('config maxEventBuffer = 500', config.maxEventBuffer, 500);
    this.assertEquals('config maxRecentSessions = 20', config.maxRecentSessions, 20);
    this.assertEquals('config autoListenEnabled = true', config.autoListenEnabled, true);
  }

  // ==================== 2. AnalyticsSaveData 工厂函数测试 ====================

  private static testCreateDefaultAnalyticsSaveData(): void {
    console.log('--- 2.1 createDefaultAnalyticsSaveData ---');

    const data = createDefaultAnalyticsSaveData();
    this.assertEquals('saveData totalSessions = 0', data.totalSessions, 0);
    this.assertEquals('saveData totalPlayTimeMs = 0', data.totalPlayTimeMs, 0);
    this.assertEquals('saveData totalBattles = 0', data.totalBattles, 0);
    this.assertEquals('saveData totalBattlesWon = 0', data.totalBattlesWon, 0);
    this.assertEquals('saveData totalChaptersCompleted = 0', data.totalChaptersCompleted, 0);
    this.assertEquals('saveData totalDungeonsCompleted = 0', data.totalDungeonsCompleted, 0);
    this.assertEquals('saveData totalAdsWatched = 0', data.totalAdsWatched, 0);
    this.assertTrue('saveData recentSessions 为空', Array.isArray(data.recentSessions) && data.recentSessions.length === 0);
    this.assertTrue('saveData eventCountByType 为空对象', typeof data.eventCountByType === 'object');
    this.assertEquals('saveData saveVersion = 1', data.saveVersion, 1);
    this.assertTrue('saveData updatedAt > 0', data.updatedAt > 0);
  }

  // ==================== 3. AnalyticsSystem 初始化与生命周期 ====================

  private static testInitialize(): void {
    console.log('--- 3.1 testInitialize ---');

    const sys = AnalyticsSystem.getInstance();
    const ok = sys.initialize({ autoListenEnabled: false });

    this.assertTrue('initialize 返回 true', ok);
    this.assertTrue('isInitialized = true', sys.isInitialized());
    this.assertDefined('getCurrentSession 非 null', sys.getCurrentSession());

    const session = sys.getCurrentSession();
    if (session) {
      this.assertDefined('会话 sessionId 非空', session.sessionId);
      this.assertTrue('会话 startTime > 0', session.startTime > 0);
    }
  }

  private static testDoubleInitialize(): void {
    console.log('--- 3.2 testDoubleInitialize ---');

    const sys = AnalyticsSystem.getInstance();
    const ok = sys.initialize({ autoListenEnabled: false });

    this.assertTrue('重复 initialize 返回 true（幂等）', ok);
    this.assertTrue('仍然 isInitialized', sys.isInitialized());
  }

  // ==================== 4. trackEvent 测试 ====================

  private static testTrackEventBasic(): void {
    console.log('--- 4.1 testTrackEventBasic ---');

    const sys = AnalyticsSystem.getInstance();
    sys.clearEvents();

    const event = sys.trackEvent(AnalyticsEventType.CUSTOM, { test: 'basic' });
    this.assertDefined('返回事件非空', event);
    this.assertEquals('事件类型 = CUSTOM', event.type, AnalyticsEventType.CUSTOM);
    this.assertEquals('事件 data.test = "basic"', event.data.test as string, 'basic');

    const events = sys.getEvents();
    this.assertEquals('事件缓存有 1 条', events.length, 1);
    this.assertEquals('缓存第一条 ID 匹配', events[0].id, event.id);
  }

  private static testTrackEventWithData(): void {
    console.log('--- 4.2 testTrackEventWithData ---');

    const sys = AnalyticsSystem.getInstance();
    sys.clearEvents();

    sys.trackEvent(AnalyticsEventType.GAME_START, { version: '1.0', platform: 'wechat' });
    sys.trackEvent(AnalyticsEventType.AD_WATCH, { adType: 'rewarded', reward: 'gems' });
    sys.trackEvent(AnalyticsEventType.CUSTOM, { count: 42 });

    const events = sys.getEvents();
    this.assertEquals('事件缓存有 3 条', events.length, 3);

    const types = events.map((e) => e.type);
    this.assertTrue('包含 GAME_START', types.includes(AnalyticsEventType.GAME_START));
    this.assertTrue('包含 AD_WATCH', types.includes(AnalyticsEventType.AD_WATCH));
    this.assertTrue('包含 CUSTOM', types.includes(AnalyticsEventType.CUSTOM));
  }

  private static testTrackGameExit(): void {
    console.log('--- 4.3 testTrackGameExit ---');

    // Reset
    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const preSnap = sys.generateSnapshot();
    const preSessions = preSnap.totalSessions;

    sys.trackEvent(AnalyticsEventType.GAME_EXIT);

    const events = sys.getEvents();
    const exitEvent = events.find((e) => e.type === AnalyticsEventType.GAME_EXIT);
    this.assertDefined('找到 GAME_EXIT 事件', exitEvent);

    // GAME_EXIT 应该结束当前会话
    const session = sys.getCurrentSession();
    this.assertTrue('GAME_EXIT 后 currentSession 应为 null', session === null);
  }

  // ==================== 5. trackBattle 测试 ====================

  private static testTrackBattleStart(): void {
    console.log('--- 5.1 testTrackBattleStart ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const event = sys.trackBattle({
      type: AnalyticsEventType.BATTLE_START,
      stageId: 'stage_001_01',
    });

    this.assertDefined('BATTLE_START 事件非空', event);
    this.assertEquals('事件类型 = BATTLE_START', event.type, AnalyticsEventType.BATTLE_START);
    this.assertEquals('事件 data.stageId = "stage_001_01"', event.data.stageId as string, 'stage_001_01');

    // BATTLE_START 不更新 battleCount
    const session = sys.getCurrentSession();
    if (session) {
      this.assertEquals('BATTLE_START 不增加 battleCount', session.battleCount, 0);
    }
  }

  private static testTrackBattleEnd(): void {
    console.log('--- 5.2 testTrackBattleEnd ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    // Track a victory
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 'stage_001_02',
      resultType: 'Victory',
      elapsedMs: 45320,
      round: 12,
      isVictory: true,
      killedCount: 3,
    });

    const events = sys.getEvents();
    const endEvent = events.find((e) => e.type === AnalyticsEventType.BATTLE_END);
    this.assertDefined('BATTLE_END 事件存在', endEvent);
    if (endEvent) {
      this.assertEquals('stageId 正确', endEvent.data.stageId as string, 'stage_001_02');
      this.assertEquals('resultType 正确', endEvent.data.resultType as string, 'Victory');
      this.assertEquals('elapsedMs 正确', endEvent.data.elapsedMs as number, 45320);
      this.assertEquals('round 正确', endEvent.data.round as number, 12);
      this.assertTrue('isVictory = true', endEvent.data.isVictory as boolean);
      this.assertEquals('killedCount 正确', endEvent.data.killedCount as number, 3);
    }

    // 检查会话 stats
    const session = sys.getCurrentSession();
    if (session) {
      this.assertEquals('battleCount = 1', session.battleCount, 1);
      this.assertEquals('battlesWon = 1', session.battlesWon, 1);
    }

    // Track a defeat
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 'stage_001_03',
      resultType: 'Defeat',
      elapsedMs: 25000,
      round: 8,
      isVictory: false,
      killedCount: 1,
    });

    const session2 = sys.getCurrentSession();
    if (session2) {
      this.assertEquals('battleCount = 2', session2.battleCount, 2);
      this.assertEquals('battlesWon 仍 = 1', session2.battlesWon, 1);
    }
  }

  // ==================== 6. trackChapter / trackDungeon / trackAd / trackTutorial 测试 ====================

  private static testTrackChapter(): void {
    console.log('--- 6.1 testTrackChapter ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const event = sys.trackChapter('chapter_001', 1);
    this.assertDefined('章节完成事件非空', event);
    this.assertEquals('类型 = CHAPTER_COMPLETE', event.type, AnalyticsEventType.CHAPTER_COMPLETE);
    this.assertEquals('data.chapterId = "chapter_001"', event.data.chapterId as string, 'chapter_001');
    this.assertEquals('data.chapterIndex = 1', event.data.chapterIndex as number, 1);

    const session = sys.getCurrentSession();
    if (session) {
      this.assertEquals('chaptersCompleted = 1', session.chaptersCompleted, 1);
    }
  }

  private static testTrackDungeon(): void {
    console.log('--- 6.2 testTrackDungeon ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const event = sys.trackDungeon('dungeon_001', true, 10);
    this.assertDefined('地牢完成事件非空', event);
    this.assertEquals('类型 = DUNGEON_COMPLETE', event.type, AnalyticsEventType.DUNGEON_COMPLETE);
    this.assertEquals('data.dungeonId = "dungeon_001"', event.data.dungeonId as string, 'dungeon_001');
    this.assertTrue('data.completed = true', event.data.completed as boolean);
    this.assertEquals('data.floorCount = 10', event.data.floorCount as number, 10);

    const session = sys.getCurrentSession();
    if (session) {
      this.assertEquals('dungeonsCompleted = 1', session.dungeonsCompleted, 1);
    }

    // Track incomplete dungeon
    sys.trackDungeon('dungeon_002', false, 3);
    const session2 = sys.getCurrentSession();
    if (session2) {
      this.assertEquals('未完成不增加 dungeonsCompleted', session2.dungeonsCompleted, 1);
    }
  }

  private static testTrackAd(): void {
    console.log('--- 6.3 testTrackAd ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const event = sys.trackAd('rewarded', 'double_gold');
    this.assertDefined('广告事件非空', event);
    this.assertEquals('类型 = AD_WATCH', event.type, AnalyticsEventType.AD_WATCH);
    this.assertEquals('data.adType = "rewarded"', event.data.adType as string, 'rewarded');
    this.assertEquals('data.rewardType = "double_gold"', event.data.rewardType as string, 'double_gold');

    const session = sys.getCurrentSession();
    if (session) {
      this.assertEquals('adsWatched = 1', session.adsWatched, 1);
    }
  }

  private static testTrackTutorial(): void {
    console.log('--- 6.4 testTrackTutorial ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const event = sys.trackTutorial('tutorial_battle');
    this.assertDefined('引导事件非空', event);
    this.assertEquals('类型 = TUTORIAL_COMPLETE', event.type, AnalyticsEventType.TUTORIAL_COMPLETE);
    this.assertEquals('data.groupId = "tutorial_battle"', event.data.groupId as string, 'tutorial_battle');
  }

  // ==================== 7. generateSnapshot 测试 ====================

  private static testGenerateSnapshot_Basic(): void {
    console.log('--- 7.1 testGenerateSnapshot_Basic ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const snapshot = sys.generateSnapshot();
    this.assertDefined('快照非空', snapshot);
    this.assertTrue('totalSessions >= 1', snapshot.totalSessions >= 1);
    this.assertDefined('currentSession 非 null', snapshot.currentSession);
    this.assertTrue('recentSessions 是数组', Array.isArray(snapshot.recentSessions));
    this.assertTrue('generatedAt > 0', snapshot.generatedAt > 0);
    this.assertDefined('eventCountByType 存在', snapshot.eventCountByType);
  }

  private static testGenerateSnapshot_WithData(): void {
    console.log('--- 7.2 testGenerateSnapshot_WithData ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    // Add various events
    sys.trackEvent(AnalyticsEventType.GAME_START);
    sys.trackEvent(AnalyticsEventType.BATTLE_START, { stageId: 's1' });
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 's1',
      isVictory: true,
    });
    sys.trackChapter('ch1', 1);
    sys.trackAd('rewarded', 'gems');

    const snapshot = sys.generateSnapshot();

    this.assertDefined('eventCountByType 包含 game_start', snapshot.eventCountByType[AnalyticsEventType.GAME_START]);
    this.assertDefined('eventCountByType 包含 battle_start', snapshot.eventCountByType[AnalyticsEventType.BATTLE_START]);
    this.assertDefined('eventCountByType 包含 battle_end', snapshot.eventCountByType[AnalyticsEventType.BATTLE_END]);
    this.assertDefined('eventCountByType 包含 chapter_complete', snapshot.eventCountByType[AnalyticsEventType.CHAPTER_COMPLETE]);
    this.assertDefined('eventCountByType 包含 ad_watch', snapshot.eventCountByType[AnalyticsEventType.AD_WATCH]);

    if (snapshot.currentSession) {
      this.assertEquals('快照中会话 battleCount', snapshot.currentSession.battleCount, 1);
      this.assertEquals('快照中会话 chaptersCompleted', snapshot.currentSession.chaptersCompleted, 1);
      this.assertEquals('快照中会话 adsWatched', snapshot.currentSession.adsWatched, 1);
    }
  }

  // ==================== 8. Save / Restore 测试 ====================

  private static testSaveDataRoundTrip(): void {
    console.log('--- 8.1 testSaveDataRoundTrip ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    // Do some activity
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 'stage_X',
      isVictory: true,
    });
    sys.trackChapter('ch_X', 2);
    sys.trackAd('rewarded', 'bonus');

    const saveData = sys.getSaveData();
    this.assertDefined('saveData 非空', saveData);
    this.assertTrue('saveData totalSessions >= 1', saveData.totalSessions >= 1);
    this.assertTrue('saveData totalBattles >= 1', saveData.totalBattles >= 1);
    this.assertTrue('saveData totalChaptersCompleted >= 1', saveData.totalChaptersCompleted >= 1);
    this.assertTrue('saveData totalAdsWatched >= 1', saveData.totalAdsWatched >= 1);

    // Restore into new system
    this.resetAnalyticsSystem();
    const sys2 = AnalyticsSystem.getInstance();
    sys2.restore(saveData);

    const saveData2 = sys2.getSaveData();
    this.assertEquals('恢复后 totalSessions 一致', saveData2.totalSessions, saveData.totalSessions);
    this.assertEquals('恢复后 totalBattles 一致', saveData2.totalBattles, saveData.totalBattles);
    this.assertEquals('恢复后 totalChaptersCompleted 一致', saveData2.totalChaptersCompleted, saveData.totalChaptersCompleted);
    this.assertEquals('恢复后 totalAdsWatched 一致', saveData2.totalAdsWatched, saveData.totalAdsWatched);
  }

  private static testRestoreFromEmpty(): void {
    console.log('--- 8.2 testRestoreFromEmpty ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();

    const emptyData = createDefaultAnalyticsSaveData();
    sys.restore(emptyData);

    const saveData = sys.getSaveData();
    this.assertEquals('空恢复后 totalSessions = 0', saveData.totalSessions, 0);
    this.assertEquals('空恢复后 totalBattles = 0', saveData.totalBattles, 0);
  }

  private static testRestoreFromPreviousData(): void {
    console.log('--- 8.3 testRestoreFromPreviousData ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();

    const prevData: AnalyticsSaveData = {
      totalSessions: 10,
      totalPlayTimeMs: 3600000,
      totalBattles: 50,
      totalBattlesWon: 45,
      totalChaptersCompleted: 3,
      totalDungeonsCompleted: 2,
      totalAdsWatched: 15,
      recentSessions: [{
        sessionId: 'old-session',
        startTime: Date.now() - 3600000,
        endTime: Date.now() - 1800000,
        durationMs: 1800000,
        eventCount: 100,
        battleCount: 5,
        battlesWon: 4,
        chaptersCompleted: 1,
        dungeonsCompleted: 0,
        adsWatched: 3,
      }],
      eventCountByType: {
        game_start: 10,
        battle_end: 50,
        ad_watch: 15,
      },
      saveVersion: 1,
      updatedAt: Date.now(),
    };

    sys.restore(prevData);

    this.assertEquals('restore 后 totalSessions = 10', sys.getSaveData().totalSessions, 10);
    this.assertEquals('restore 后 totalPlayTimeMs = 3600000', sys.getSaveData().totalPlayTimeMs, 3600000);
    this.assertEquals('restore 后 totalBattles = 50', sys.getSaveData().totalBattles, 50);
    this.assertEquals('restore 后 totalBattlesWon = 45', sys.getSaveData().totalBattlesWon, 45);
    this.assertEquals('restore 后 totalChaptersCompleted = 3', sys.getSaveData().totalChaptersCompleted, 3);
    this.assertEquals('restore 后 totalDungeonsCompleted = 2', sys.getSaveData().totalDungeonsCompleted, 2);
    this.assertEquals('restore 后 totalAdsWatched = 15', sys.getSaveData().totalAdsWatched, 15);
    this.assertEquals('restore 后 recentSessions 1 条', sys.getSaveData().recentSessions.length, 1);
    this.assertEquals('restore 后 eventCountByType 有数据', sys.getSaveData().eventCountByType['battle_end'] ?? 0, 50);
  }

  // ==================== 9. 事件缓存管理测试 ====================

  private static testClearEvents(): void {
    console.log('--- 9.1 testClearEvents ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });

    sys.trackEvent(AnalyticsEventType.CUSTOM);
    sys.trackEvent(AnalyticsEventType.CUSTOM);
    sys.trackEvent(AnalyticsEventType.CUSTOM);

    this.assertEquals('清除前有 3 条', sys.getEvents().length, 3);

    sys.clearEvents();
    this.assertEquals('清除后有 0 条', sys.getEvents().length, 0);
  }

  private static testEventBufferOverflow(): void {
    console.log('--- 9.2 testEventBufferOverflow ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false, maxEventBuffer: 10 });
    sys.clearEvents();

    // Add 15 events, buffer max is 10
    for (let i = 0; i < 15; i++) {
      sys.trackEvent(AnalyticsEventType.CUSTOM, { index: i });
    }

    const events = sys.getEvents();
    this.assertEquals('事件缓存不超过 maxEventBuffer', events.length, 10);
    // First event should be index 5 (oldest 5 were trimmed)
    this.assertEquals('缓存中第一条是第 5 个事件', events[0].data.index as number, 5);
  }

  // ==================== 10. 会话管理测试 ====================

  private static testSessionLifecycle(): void {
    console.log('--- 10.1 testSessionLifecycle ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });

    const session1 = sys.getCurrentSession();
    this.assertDefined('初始化后 currentSession 非 null', session1);

    // End session via game_exit
    sys.trackEvent(AnalyticsEventType.GAME_EXIT);

    const session2 = sys.getCurrentSession();
    this.assertTrue('game_exit 后 currentSession 为 null', session2 === null);
  }

  private static testSessionStatsAccumulation(): void {
    console.log('--- 10.2 testSessionStatsAccumulation ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    const session = sys.getCurrentSession();
    this.assertDefined('会话存在', session);

    // Simulate activity
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 's1',
      isVictory: true,
    });
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 's2',
      isVictory: true,
    });
    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 's3',
      isVictory: false,
    });
    sys.trackChapter('ch1', 1);
    sys.trackChapter('ch2', 2);
    sys.trackAd('rv', 'r1');
    sys.trackAd('rv', 'r2');
    sys.trackAd('rv', 'r3');
    sys.trackDungeon('d1', true, 5);

    const snap = sys.generateSnapshot();
    if (snap.currentSession) {
      this.assertEquals('事件计数', snap.currentSession.eventCount, 10); // 1 GAME_START + 9 tracked events
      // Actually: GAME_START(1) + 3xBATTLE_END(3) + 2xCHAPTER(2) + 3xAD(3) + 1xDUNGEON(1) = 10 + potentially other
      this.assertEquals('战斗次数 = 3', snap.currentSession.battleCount, 3);
      this.assertEquals('胜利次数 = 2', snap.currentSession.battlesWon, 2);
      this.assertEquals('章节完成 = 2', snap.currentSession.chaptersCompleted, 2);
      this.assertEquals('广告次数 = 3', snap.currentSession.adsWatched, 3);
      this.assertEquals('地牢完成 = 1', snap.currentSession.dungeonsCompleted, 1);
    }
  }

  // ==================== 11. 自动事件监听测试 ====================

  private static testAutoBattleStartedListener(): void {
    console.log('--- 11.1 testAutoBattleStartedListener ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: true });
    sys.clearEvents();

    const em = EventManager.getInstance();
    em.emit(BattleEvent.BATTLE_STARTED, { stageId: 'auto_stage_01', playerUnits: [], enemyUnits: [] });

    const events = sys.getEvents();
    const battleStartEvents = events.filter((e) => e.type === AnalyticsEventType.BATTLE_START);
    this.assertTrue('自动监听 BATTLE_STARTED 生成事件', battleStartEvents.length >= 1);

    // Cleanup
    sys.destroy();
  }

  private static testAutoBattleEndedListener(): void {
    console.log('--- 11.2 testAutoBattleEndedListener ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: true });
    sys.clearEvents();

    const em = EventManager.getInstance();
    em.emit(BattleEvent.BATTLE_ENDED, {
      executionResult: {
        stageId: 'auto_stage_02',
        resultType: BattleResultType.Victory,
        elapsedTimeMs: 30000,
        round: 5,
        killedEnemyIds: ['e1', 'e2'],
      },
    });

    const events = sys.getEvents();
    const battleEndEvents = events.filter((e) => e.type === AnalyticsEventType.BATTLE_END);
    this.assertTrue('自动监听 BATTLE_ENDED 生成事件', battleEndEvents.length >= 1);

    if (battleEndEvents.length > 0) {
      const evt = battleEndEvents[0];
      this.assertEquals('自动事件 stageId', evt.data.stageId as string, 'auto_stage_02');
      this.assertEquals('自动事件 resultType', evt.data.resultType as string, BattleResultType.Victory);
      this.assertEquals('自动事件 killedCount', evt.data.killedCount as number, 2);
    }

    // Cleanup
    sys.destroy();
  }

  private static testAutoChapterCompletedListener(): void {
    console.log('--- 11.3 testAutoChapterCompletedListener ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: true });
    sys.clearEvents();

    const em = EventManager.getInstance();
    em.emit(ChapterSystem.CHAPTER_COMPLETED, {
      chapterId: 'auto_chapter_01',
    });

    const events = sys.getEvents();
    const chapterEvents = events.filter((e) => e.type === AnalyticsEventType.CHAPTER_COMPLETE);
    this.assertTrue('自动监听 CHAPTER_COMPLETED 生成事件', chapterEvents.length >= 1);

    if (chapterEvents.length > 0) {
      this.assertEquals('自动章节事件 chapterId', chapterEvents[0].data.chapterId as string, 'auto_chapter_01');
    }

    // Cleanup
    sys.destroy();
  }

  private static testAutoTutorialCompletedListener(): void {
    console.log('--- 11.4 testAutoTutorialCompletedListener ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: true });
    sys.clearEvents();

    const em = EventManager.getInstance();
    em.emit(TutorialSystem.TUTORIAL_COMPLETED, {
      groupId: 'auto_tutorial_group',
    });

    const events = sys.getEvents();
    const tutorialEvents = events.filter((e) => e.type === AnalyticsEventType.TUTORIAL_COMPLETE);
    this.assertTrue('自动监听 TUTORIAL_COMPLETED 生成事件', tutorialEvents.length >= 1);

    if (tutorialEvents.length > 0) {
      this.assertEquals('自动引导事件 groupId', tutorialEvents[0].data.groupId as string, 'auto_tutorial_group');
    }

    // Cleanup
    sys.destroy();
  }

  // ==================== 12. 边界条件测试 ====================

  private static testTrackEventUninitialized(): void {
    console.log('--- 12.1 testTrackEventUninitialized ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    // Don't initialize

    const event = sys.trackEvent(AnalyticsEventType.CUSTOM);
    this.assertDefined('未初始化仍返回事件对象', event);
    this.assertEquals('未初始化事件 sessionId 为空', event.sessionId, '');

    const snapshot = sys.generateSnapshot();
    // generateSnapshot should still return a valid structure even uninitialized
    this.assertDefined('未初始化快照仍返回结构', snapshot);
  }

  private static testGenerateSnapshotUninitialized(): void {
    console.log('--- 12.2 testGenerateSnapshotUninitialized ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();

    const snapshot = sys.generateSnapshot();
    this.assertDefined('未初始化快照非 null', snapshot);
    this.assertEquals('未初始化 totalSessions = 0', snapshot.totalSessions, 0);
    this.assertTrue('未初始化 currentSession 为 null', snapshot.currentSession === null);
  }

  private static testRestoreNullData(): void {
    console.log('--- 12.3 testRestoreNullData ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();

    // Should not throw
    sys.restore(null as unknown as AnalyticsSaveData);
    sys.restore(undefined as unknown as AnalyticsSaveData);

    const data = sys.getSaveData();
    this.assertDefined('restore null 后 getSaveData 仍可用', data);
  }

  private static testRestorePartialData(): void {
    console.log('--- 12.4 testRestorePartialData ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();

    // Data with missing fields
    sys.restore({
      totalSessions: 5,
    } as AnalyticsSaveData);

    const data = sys.getSaveData();
    this.assertEquals('totalSessions = 5', data.totalSessions, 5);
    this.assertEquals('缺失字段默认为 0', data.totalBattles, 0);
    this.assertTrue('缺失 recentSessions 默认为空数组', Array.isArray(data.recentSessions) && data.recentSessions.length === 0);
  }

  // ==================== 13. destroy 测试 ====================

  private static testDestroy(): void {
    console.log('--- 13.1 testDestroy ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: true });

    let saveCalled = false;
    sys.registerSaveCallback(() => {
      saveCalled = true;
    });
    saveCalled = false; // reset after register

    sys.trackBattle({
      type: AnalyticsEventType.BATTLE_END,
      stageId: 'destroy_test',
      isVictory: true,
    });

    sys.destroy();

    this.assertTrue('destroy 后 isInitialized = false', !sys.isInitialized());
    this.assertTrue('destroy 后 currentSession = null', sys.getCurrentSession() === null);
  }

  // ==================== 14. 配置测试 ====================

  private static testCustomConfig(): void {
    console.log('--- 14.1 testCustomConfig ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({
      autoListenEnabled: false,
      maxEventBuffer: 50,
      maxRecentSessions: 5,
    });

    const config = sys.getConfig();
    this.assertEquals('maxEventBuffer = 50', config.maxEventBuffer, 50);
    this.assertEquals('maxRecentSessions = 5', config.maxRecentSessions, 5);
    this.assertEquals('autoListenEnabled = false', config.autoListenEnabled, false);

    sys.destroy();
  }

  // ==================== 15. getEvents / getCurrentSession 测试 ====================

  private static testGetEvents(): void {
    console.log('--- 15.1 testGetEvents ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();
    sys.initialize({ autoListenEnabled: false });
    sys.clearEvents();

    sys.trackEvent(AnalyticsEventType.CUSTOM, { a: 1 });
    sys.trackEvent(AnalyticsEventType.CUSTOM, { b: 2 });
    sys.trackEvent(AnalyticsEventType.CUSTOM, { c: 3 });

    const events = sys.getEvents();
    this.assertEquals('getEvents 返回 3 条', events.length, 3);
    this.assertDefined('第一条事件有 id', events[0].id);
    this.assertDefined('第一条事件有 timestamp', events[0].timestamp);
    this.assertDefined('第一条事件有 sessionId', events[0].sessionId);
    this.assertDefined('第一条事件有 data', events[0].data);

    // Verify events are in order
    this.assertTrue('事件按时间顺序排列', events[0].timestamp <= events[1].timestamp && events[1].timestamp <= events[2].timestamp);
  }

  private static testGetCurrentSession(): void {
    console.log('--- 15.2 testGetCurrentSession ---');

    this.resetAnalyticsSystem();
    const sys = AnalyticsSystem.getInstance();

    // Before initialize
    const session1 = sys.getCurrentSession();
    this.assertTrue('未初始化 session 为 null', session1 === null);

    // After initialize
    sys.initialize({ autoListenEnabled: false });
    const session2 = sys.getCurrentSession();
    this.assertDefined('初始化后 session 非 null', session2);

    // After destroy
    sys.destroy();
    const session3 = sys.getCurrentSession();
    this.assertTrue('destroy 后 session 为 null', session3 === null);
  }
}
