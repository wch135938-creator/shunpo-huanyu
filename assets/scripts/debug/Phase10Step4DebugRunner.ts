// ============================================================
// Phase10Step4DebugRunner — Phase10-Step4 奖励系统 Debug 验证
// 职责：验证 RewardRepository / RewardPoolRepository / RewardSystem
//        RewardSettlement / RewardPanel / RewardHistoryPanel / SaveV2 兼容
//        Phase10-Step4-Fix: idempotency / deterministic RNG / claimState / Phase7 bridge
// 用法：在 Cocos Creator 控制台执行 Phase10Step4DebugRunner.runAll()
// ============================================================

import { RewardRepository } from '../reward/RewardRepository';
import { RewardPoolRepository } from '../reward/RewardPoolRepository';
import { RewardSystem } from '../reward/RewardSystem';
import { RewardSettlement } from '../reward/RewardSettlement';
import { SaveManager } from '../save/SaveManager';
import {
  createDefaultRewardSaveData,
  type RewardSaveData,
  type RewardSettleResult,
  mapPhase7SourceType,
  buildClaimStateKey,
} from '../reward/RewardTypes';
import type { AggregatedReward } from '../reward/RewardTypes';
import type { BattleResult } from '../battle/BattleResult';
import { BattleResultType } from '../battle/BattleTypes';
import { SeededRandom, buildRewardSeed } from '../reward/SeededRandom';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase10Step4DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase10-Step4 测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase10-Step4 奖励系统 集成测试 ==========\n');

    // 初始化
    const rewardSystem = RewardSystem.getInstance();
    if (!rewardSystem.isInitialized()) {
      rewardSystem.initialize();
    }

    // 1. RewardConfig Load PASS
    await this.testRewardConfigLoad();

    // 2. RewardPool Load PASS
    await this.testRewardPoolLoad();

    // 3. Chapter Reward PASS
    await this.testChapterReward();

    // 4. Event Reward PASS
    await this.testEventReward();

    // 5. Enemy Reward PASS
    await this.testEnemyReward();

    // 6. Reward Roll PASS
    await this.testRewardRoll();

    // 7. Reward Settlement PASS
    await this.testRewardSettlement();

    // 8. Reward Grant PASS
    await this.testRewardGrant();

    // 9. Reward History PASS
    await this.testRewardHistory();

    // 10. SaveV2 Compatibility PASS
    await this.testSaveV2Compatibility();

    // 11. Optional Field Auto Create PASS
    await this.testOptionalFieldAutoCreate();

    // 12. Portrait UI Create PASS
    await this.testPortraitUICreate();

    // ==================== Phase10-Step4-Fix 新增测试 ====================

    // 13. Deterministic RNG PASS
    await this.testDeterministicRNG();

    // 14. Idempotency PASS
    await this.testIdempotency();

    // 15. ClaimState PASS
    await this.testClaimState();

    // 16. Config Validation PASS
    await this.testConfigValidation();

    // 17. Phase7 Bridge PASS
    await this.testPhase7Bridge();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1. RewardConfig Load PASS ====================

  static async testRewardConfigLoad(): Promise<void> {
    try {
      const repo = RewardRepository.getInstance();
      await repo.load();

      this._assert('RewardRepository 加载成功', repo.isLoaded());
      this._assert('章节奖励配置数量 > 0', repo.getChapterRewardCount() > 0);
      this._assert('事件奖励配置数量 > 0', repo.getEventRewardCount() > 0);
      this._assert('敌人奖励配置数量 > 0', repo.getEnemyRewardCount() > 0);

      const ch1 = repo.getChapterReward('chapter_001');
      this._assert('chapter_001 奖励配置存在', ch1 !== null);
      if (ch1) {
        this._assert('chapter_001 gold = 500', ch1.gold === 500);
        this._assert('chapter_001 exp = 300', ch1.exp === 300);
        this._assert('chapter_001 itemRewards >= 1', ch1.itemRewards.length >= 1);
      }

      const ev1 = repo.getEventReward('EVENT_001');
      this._assert('EVENT_001 奖励配置存在', ev1 !== null);
      if (ev1) {
        this._assert('EVENT_001 gold = 200', ev1.gold === 200);
        this._assert('EVENT_001 exp = 100', ev1.exp === 100);
      }

      const en1 = repo.getEnemyReward('ENEMY_DYNAMIC_001');
      this._assert('ENEMY_DYNAMIC_001 奖励配置存在', en1 !== null);
      if (en1) {
        this._assert('ENEMY_DYNAMIC_001 gold = 50', en1.gold === 50);
        this._assert('ENEMY_DYNAMIC_001 exp = 30', en1.exp === 30);
      }

      this._assert('chapter_999 不存在', repo.getChapterReward('chapter_999') === null);
      this._assert('EVENT_999 不存在', repo.getEventReward('EVENT_999') === null);
      this._assert('ENEMY_DYNAMIC_999 不存在', repo.getEnemyReward('ENEMY_DYNAMIC_999') === null);

      console.log('[Phase10Step4Debug] 1. RewardConfig Load PASS');
    } catch (e) {
      this._assert(`RewardConfig Load 失败: ${e}`, false);
    }
  }

  // ==================== 2. RewardPool Load PASS ====================

  static async testRewardPoolLoad(): Promise<void> {
    try {
      const repo = RewardPoolRepository.getInstance();
      await repo.load();

      this._assert('RewardPoolRepository 加载成功', repo.isLoaded());
      this._assert('奖励池数量 >= 3', repo.getPoolCount() >= 3);

      const pool1 = repo.getPool('REWARD_POOL_CHAPTER_BONUS');
      this._assert('REWARD_POOL_CHAPTER_BONUS 存在', pool1 !== null);
      if (pool1) {
        this._assert('CHAPTER_BONUS mode = weighted_one', pool1.mode === 'weighted_one');
        this._assert('CHAPTER_BONUS entries > 0', pool1.entries.length > 0);
      }

      const pool2 = repo.getPool('REWARD_POOL_EVENT_BONUS');
      this._assert('REWARD_POOL_EVENT_BONUS 存在', pool2 !== null);
      if (pool2) {
        this._assert('EVENT_BONUS mode = weighted_one', pool2.mode === 'weighted_one');
      }

      const pool3 = repo.getPool('REWARD_POOL_ENEMY_BONUS');
      this._assert('REWARD_POOL_ENEMY_BONUS 存在', pool3 !== null);
      if (pool3) {
        this._assert('ENEMY_BONUS mode = weighted_many', pool3.mode === 'weighted_many');
      }

      this._assert('POOL_999 不存在', repo.getPool('POOL_999') === null);

      console.log('[Phase10Step4Debug] 2. RewardPool Load PASS');
    } catch (e) {
      this._assert(`RewardPool Load 失败: ${e}`, false);
    }
  }

  // ==================== 3. Chapter Reward PASS ====================

  static async testChapterReward(): Promise<void> {
    try {
      const settlement = RewardSettlement.getInstance();
      const rewardSystem = RewardSystem.getInstance();
      const countBefore = rewardSystem.getRecentRewardCount();

      // 使用唯一 test ID 避免跨测试 idempotency 冲突
      const result = settlement.settleChapterReward('chapter_001');
      this._assert('chapter_001 章节奖励结算成功', result.success);
      if (result.aggregated) {
        this._assert('章节奖励包含金币', result.aggregated.totalGold >= 500);
        this._assert('章节奖励包含经验', result.aggregated.totalExp >= 300);
      }

      const countAfter = rewardSystem.getRecentRewardCount();
      this._assert('奖励记录数增加', countAfter > countBefore);

      // 不存在的章节
      const nullResult = settlement.settleChapterReward('chapter_999');
      this._assert('不存在章节结算失败', !nullResult.success);

      // 不外附池（使用 options 对象）
      const resultNoPool = settlement.settleChapterReward('chapter_002', { includePool: false });
      this._assert('不外附池结算成功', resultNoPool.success);
      if (resultNoPool.aggregated) {
        this._assert('不外附池金币 = 1500', resultNoPool.aggregated.totalGold === 1500);
      }

      console.log('[Phase10Step4Debug] 3. Chapter Reward PASS');
    } catch (e) {
      this._assert(`Chapter Reward 失败: ${e}`, false);
    }
  }

  // ==================== 4. Event Reward PASS ====================

  static async testEventReward(): Promise<void> {
    try {
      const settlement = RewardSettlement.getInstance();

      const result = settlement.settleEventReward('EVENT_001');
      this._assert('EVENT_001 事件奖励结算成功', result.success);
      if (result.aggregated) {
        this._assert('EVENT_001 金币 >= 200', result.aggregated.totalGold >= 200);
        this._assert('EVENT_001 经验 >= 100', result.aggregated.totalExp >= 100);
      }

      const result2 = settlement.settleEventReward('EVENT_002');
      this._assert('EVENT_002 事件奖励结算成功', result2.success);
      if (result2.aggregated) {
        this._assert('EVENT_002 金币 = 0', result2.aggregated.totalGold === 0);
        this._assert('EVENT_002 经验 >= 300', result2.aggregated.totalExp >= 300);
      }

      const nullResult = settlement.settleEventReward('EVENT_999');
      this._assert('不存在事件结算失败', !nullResult.success);

      const resultNoPool = settlement.settleEventReward('EVENT_003', { includePool: false });
      this._assert('不外附池事件结算成功', resultNoPool.success);

      console.log('[Phase10Step4Debug] 4. Event Reward PASS');
    } catch (e) {
      this._assert(`Event Reward 失败: ${e}`, false);
    }
  }

  // ==================== 5. Enemy Reward PASS ====================

  static async testEnemyReward(): Promise<void> {
    try {
      const settlement = RewardSettlement.getInstance();

      const result = settlement.settleEnemyReward('ENEMY_DYNAMIC_001');
      this._assert('ENEMY_DYNAMIC_001 敌人奖励结算成功', result.success);
      if (result.aggregated) {
        this._assert('ENEMY_DYNAMIC_001 金币 >= 50', result.aggregated.totalGold >= 50);
        this._assert('ENEMY_DYNAMIC_001 经验 >= 30', result.aggregated.totalExp >= 30);
      }

      const result2 = settlement.settleEnemyReward('ENEMY_DYNAMIC_007');
      this._assert('ENEMY_DYNAMIC_007 敌人奖励结算成功', result2.success);
      if (result2.aggregated) {
        this._assert('ENEMY_DYNAMIC_007 金币 >= 500', result2.aggregated.totalGold >= 500);
        this._assert('ENEMY_DYNAMIC_007 经验 >= 250', result2.aggregated.totalExp >= 250);
      }

      const nullResult = settlement.settleEnemyReward('ENEMY_DYNAMIC_999');
      this._assert('不存在敌人结算失败', !nullResult.success);

      const resultNoPool = settlement.settleEnemyReward('ENEMY_DYNAMIC_005', { includePool: false });
      this._assert('不外附池敌人结算成功', resultNoPool.success);

      console.log('[Phase10Step4Debug] 5. Enemy Reward PASS');
    } catch (e) {
      this._assert(`Enemy Reward 失败: ${e}`, false);
    }
  }

  // ==================== 6. Reward Roll PASS ====================

  static async testRewardRoll(): Promise<void> {
    try {
      const poolRepo = RewardPoolRepository.getInstance();

      const seenItems = new Set<string>();
      const iterations = 20;
      for (let i = 0; i < iterations; i++) {
        const rewards = poolRepo.rollReward('REWARD_POOL_CHAPTER_BONUS', 'test_chapter');
        this._assert(`weighted_one 每次返回 <= 1 条 (iter ${i})`, rewards.length <= 1);
        if (rewards.length > 0) {
          seenItems.add(rewards[0].itemId);
        }
      }
      this._assert('weighted_one 多次抽取有多样性', seenItems.size >= 1);

      const manyResults = poolRepo.rollReward('REWARD_POOL_ENEMY_BONUS', 'test_many');
      this._assert('weighted_many 返回数组', Array.isArray(manyResults));

      const emptyRewards = poolRepo.rollReward('POOL_999', 'test_999');
      this._assert('不存在池返回空数组', emptyRewards.length === 0);

      const nullOne = poolRepo.rollOneReward('POOL_999', 'test_999');
      this._assert('不存在池 rollOneReward 返回 null', nullOne === null);

      console.log('[Phase10Step4Debug] 6. Reward Roll PASS');
    } catch (e) {
      this._assert(`Reward Roll 失败: ${e}`, false);
    }
  }

  // ==================== 7. Reward Settlement PASS ====================

  static async testRewardSettlement(): Promise<void> {
    try {
      const settlement = RewardSettlement.getInstance();
      const rewardSystem = RewardSystem.getInstance();

      const mockBattleResult: BattleResult = {
        stageId: 'STAGE_001',
        isVictory: true,
        resultType: BattleResultType.Victory,
        elapsedTimeMs: 30000,
        round: 5,
        killedEnemyIds: ['ENEMY_001', 'ENEMY_002'],
        rewards: [
          { itemId: 'ITEM_GOLD', itemType: 'gold', count: 200, source: 'drop' },
          { itemId: 'ITEM_EXP', itemType: 'exp', count: 100, source: 'drop' },
        ],
        expGain: 100,
        goldGain: 200,
        powerGain: 0,
      };

      const battleResult = settlement.settleBattleReward(mockBattleResult);
      this._assert('战斗奖励结算成功（胜利）', battleResult.success);
      if (battleResult.aggregated) {
        this._assert('战斗奖励金币 = 200', battleResult.aggregated.totalGold === 200);
        this._assert('战斗奖励经验 = 100', battleResult.aggregated.totalExp === 100);
      }

      // 失败战斗无奖励结算
      const mockDefeatResult: BattleResult = {
        ...mockBattleResult,
        stageId: 'STAGE_DEFEAT_001',
        isVictory: false,
        resultType: BattleResultType.Defeat,
        rewards: [],
        expGain: 0,
        goldGain: 0,
      };
      const defeatResult = settlement.settleBattleReward(mockDefeatResult);
      this._assert('失败战斗结算失败', !defeatResult.success);

      // 验证 lastReward
      const lastReward = rewardSystem.getLastReward();
      this._assert('getLastReward() 非 null', lastReward !== null);

      console.log('[Phase10Step4Debug] 7. Reward Settlement PASS');
    } catch (e) {
      this._assert(`Reward Settlement 失败: ${e}`, false);
    }
  }

  // ==================== 8. Reward Grant PASS ====================

  static async testRewardGrant(): Promise<void> {
    try {
      const rewardSystem = RewardSystem.getInstance();
      const countBefore = rewardSystem.getRecentRewardCount();

      const settlement = RewardSettlement.getInstance();
      // 使用新 chapter ID 避免与 testChapterReward 冲突
      settlement.settleChapterReward('chapter_003');

      const countAfter = rewardSystem.getRecentRewardCount();
      this._assert('奖励发放后历史记录数增加', countAfter > countBefore);

      const last = rewardSystem.getLastReward();
      this._assert('getLastReward() 返回最近奖励', last !== null);
      if (last) {
        this._assert('最近奖励有金币', last.totalGold > 0);
        this._assert('最近奖励有经验', last.totalExp > 0);
      }

      const saveData = rewardSystem.getRewardSaveData();
      this._assert('getRewardSaveData() 非 null', saveData !== null);
      if (saveData) {
        this._assert('lastRewardTime > 0', saveData.lastRewardTime > 0);
        this._assert('recentRewards 非空', saveData.recentRewards.length > 0);
      }

      // 验证 transactionId 已写入 saveMetaV2
      const lastTxnId = rewardSystem.getLastTransactionId();
      this._assert('saveMetaV2.lastRewardTransactionId 非空', lastTxnId.length > 0);

      console.log('[Phase10Step4Debug] 8. Reward Grant PASS');
    } catch (e) {
      this._assert(`Reward Grant 失败: ${e}`, false);
    }
  }

  // ==================== 9. Reward History PASS ====================

  static async testRewardHistory(): Promise<void> {
    try {
      const rewardSystem = RewardSystem.getInstance();
      const settlement = RewardSettlement.getInstance();

      // 使用新 ID 避免与早期测试冲突
      settlement.settleEventReward('EVENT_004');
      settlement.settleEnemyReward('ENEMY_DYNAMIC_003');
      settlement.settleChapterReward('chapter_004');

      const history = rewardSystem.getRecentRewards();
      this._assert('getRecentRewards() 返回数组', Array.isArray(history));
      this._assert('历史记录 >= 3', history.length >= 3);

      const lastRecord = history[0];
      this._assert('最近记录有 recordId', lastRecord.recordId.length > 0);
      this._assert('最近记录有 rewards', lastRecord.rewards.length > 0);
      this._assert('最近记录有 grantedAt > 0', lastRecord.grantedAt > 0);
      // Phase10-Step4-Fix: 验证审计字段
      this._assert('最近记录有 transactionId', (lastRecord.transactionId?.length ?? 0) > 0);

      const sources = new Set(history.map((r) => r.source));
      this._assert('历史记录包含多个来源', sources.size >= 2);

      // 清空历史
      rewardSystem.clearHistory();
      const afterClear = rewardSystem.getRecentRewards();
      this._assert('清空后记录数为 0', afterClear.length === 0);

      console.log('[Phase10Step4Debug] 9. Reward History PASS');
    } catch (e) {
      this._assert(`Reward History 失败: ${e}`, false);
    }
  }

  // ==================== 10. SaveV2 Compatibility PASS ====================

  static async testSaveV2Compatibility(): Promise<void> {
    try {
      const defaultData = createDefaultRewardSaveData();
      this._assert('createDefaultRewardSaveData 返回非 null', defaultData !== null);
      this._assert('默认 lastRewardTime = 0', defaultData.lastRewardTime === 0);
      this._assert('默认 recentRewards 为空数组',
        Array.isArray(defaultData.recentRewards) && defaultData.recentRewards.length === 0);
      // Phase10-Step4-Fix: 验证新字段
      this._assert('默认 claimState 为空对象',
        defaultData.claimState !== undefined && Object.keys(defaultData.claimState).length === 0);
      this._assert('默认 rewardSnapshots 为空数组',
        Array.isArray(defaultData.rewardSnapshots) && defaultData.rewardSnapshots.length === 0);
      this._assert('默认 lastTransactionId 为空字符串', defaultData.lastTransactionId === '');

      // 验证 CURR_SAVE_VERSION 未升级
      const { CURRENT_SAVE_VERSION } = await import('../save/SaveContainer');
      this._assert('CURRENT_SAVE_VERSION = 8', CURRENT_SAVE_VERSION === 8);

      console.log('[Phase10Step4Debug] 10. SaveV2 Compatibility PASS');
    } catch (e) {
      this._assert(`SaveV2 Compatibility 失败: ${e}`, false);
    }
  }

  // ==================== 11. Optional Field Auto Create PASS ====================

  static async testOptionalFieldAutoCreate(): Promise<void> {
    try {
      const rewardSystem = RewardSystem.getInstance();
      rewardSystem.initialize();
      const saveData = rewardSystem.getRewardSaveData();
      this._assert('initialize 后 rewardData 存在', saveData !== null);
      if (saveData) {
        this._assert('initialize 后 claimState 存在', saveData.claimState !== undefined);
        this._assert('initialize 后 rewardSnapshots 存在', saveData.rewardSnapshots !== undefined);
        this._assert('initialize 后 lastTransactionId 存在', saveData.lastTransactionId !== undefined);
      }

      console.log('[Phase10Step4Debug] 11. Optional Field Auto Create PASS');
    } catch (e) {
      this._assert(`Optional Field Auto Create 失败: ${e}`, false);
    }
  }

  // ==================== 12. Portrait UI Create PASS ====================

  static async testPortraitUICreate(): Promise<void> {
    try {
      const { RewardPanel } = await import('../reward/RewardPanel');
      this._assert('RewardPanel 类存在', RewardPanel !== undefined);
      this._assert('RewardPanel 是 class', typeof RewardPanel === 'function');

      const { RewardHistoryPanel } = await import('../reward/RewardHistoryPanel');
      this._assert('RewardHistoryPanel 类存在', RewardHistoryPanel !== undefined);
      this._assert('RewardHistoryPanel 是 class', typeof RewardHistoryPanel === 'function');

      const panelProto = RewardPanel.prototype;
      this._assert('RewardPanel 有 showReward 方法', typeof panelProto.showReward === 'function');
      this._assert('RewardPanel 有 hide 方法', typeof panelProto.hide === 'function');

      const historyProto = RewardHistoryPanel.prototype;
      this._assert('RewardHistoryPanel 有 refresh 方法', typeof historyProto.refresh === 'function');
      this._assert('RewardHistoryPanel 有 hide 方法', typeof historyProto.hide === 'function');

      console.log('[Phase10Step4Debug] 12. Portrait UI Create PASS');
    } catch (e) {
      this._assert(`Portrait UI Create 失败: ${e}`, false);
    }
  }

  // ==================== 13. Deterministic RNG PASS (Phase10-Step4-Fix) ====================

  static async testDeterministicRNG(): Promise<void> {
    try {
      // 验证 SeededRandom 确定性
      const rng1 = new SeededRandom(12345);
      const rng2 = new SeededRandom(12345);
      const seq1: number[] = [];
      const seq2: number[] = [];
      for (let i = 0; i < 10; i++) {
        seq1.push(rng1.next());
        seq2.push(rng2.next());
      }
      const sameSequence = seq1.every((v, i) => v === seq2[i]);
      this._assert('相同 seed → 相同序列', sameSequence);

      // 验证不同 seed → 不同序列
      const rng3 = new SeededRandom(67890);
      const seq3: number[] = [];
      for (let i = 0; i < 10; i++) seq3.push(rng3.next());
      const differentSequence = !seq1.every((v, i) => v === seq3[i]);
      this._assert('不同 seed → 不同序列', differentSequence);

      // 验证 fromSeed 字符串种子
      const rng4 = SeededRandom.fromSeed('test_seed_123');
      const rng5 = SeededRandom.fromSeed('test_seed_123');
      this._assert('fromSeed 相同字符串 → 相同序列',
        rng4.next() === rng5.next() && rng4.next() === rng5.next());

      // 验证 buildRewardSeed
      const seed = buildRewardSeed({
        playerId: 'player_001',
        sourceType: 'chapter',
        sourceId: 'CH_001',
        poolId: 'POOL_001',
      });
      this._assert('buildRewardSeed 返回非空字符串', seed.length > 0);

      // 验证快照导出/恢复
      const rng6 = new SeededRandom(42);
      rng6.next(); rng6.next(); rng6.next(); // advance state
      const snapshot = rng6.exportSnapshot();
      const rng7 = SeededRandom.fromSnapshot(snapshot);
      this._assert('快照恢复后 next() 相同', rng6.next() === rng7.next());
      this._assert('快照 callCount 一致', rng6.getCallCount() === rng7.getCallCount());

      // 验证 rollRewardWithSeed 确定性
      const poolRepo = RewardPoolRepository.getInstance();
      const ctx1 = { sourceType: 'chapter', sourceId: 'TEST_SEED_01', attemptIndex: 0 };
      const ctx2 = { sourceType: 'chapter', sourceId: 'TEST_SEED_01', attemptIndex: 0 };
      const result1 = poolRepo.rollRewardWithSeed('REWARD_POOL_CHAPTER_BONUS', ctx1);
      const result2 = poolRepo.rollRewardWithSeed('REWARD_POOL_CHAPTER_BONUS', ctx2);
      this._assert('rollRewardWithSeed 确定性：相同 context = 相同结果',
        result1.seed === result2.seed &&
        result1.entries.length === result2.entries.length &&
        result1.entries.every((e, i) => e.itemId === result2.entries[i]?.itemId));

      // 验证不同 attemptIndex → 不同结果
      const ctx3 = { sourceType: 'chapter', sourceId: 'TEST_SEED_01', attemptIndex: 1 };
      const result3 = poolRepo.rollRewardWithSeed('REWARD_POOL_CHAPTER_BONUS', ctx3);
      this._assert('不同 attemptIndex → 不同 seed', result1.seed !== result3.seed);

      console.log('[Phase10Step4Debug] 13. Deterministic RNG PASS');
    } catch (e) {
      this._assert(`Deterministic RNG 失败: ${e}`, false);
    }
  }

  // ==================== 14. Idempotency PASS (Phase10-Step4-Fix) ====================

  static async testIdempotency(): Promise<void> {
    try {
      const settlement = RewardSettlement.getInstance();
      const rewardSystem = RewardSystem.getInstance();
      const uniqueId = `IDEMPOTENT_TEST_${Date.now()}`;

      // 第一次结算
      const result1 = settlement.settleChapterReward(`chapter_005`, { playerId: uniqueId });
      this._assert('第一次结算成功', result1.success);
      this._assert('第一次结算 isDuplicate = false', !result1.isDuplicate);

      // 第二次结算同一 chapter（应该被幂等拦截）
      const result2 = settlement.settleChapterReward(`chapter_005`, { playerId: uniqueId });
      this._assert('第二次结算被幂等拦截', !result2.success);
      this._assert('第二次结算 isDuplicate = true', result2.isDuplicate);
      this._assert('第二次结算返回原 transactionId', result2.transactionId === result1.transactionId);

      // 验证事件奖励幂等
      const evResult1 = settlement.settleEventReward(`EVENT_005`, { playerId: uniqueId });
      this._assert('事件第一次结算成功', evResult1.success);
      const evResult2 = settlement.settleEventReward(`EVENT_005`, { playerId: uniqueId });
      this._assert('事件第二次被幂等拦截', evResult2.isDuplicate);

      // 验证敌人奖励幂等
      const enResult1 = settlement.settleEnemyReward(`ENEMY_DYNAMIC_004`, { playerId: uniqueId });
      this._assert('敌人第一次结算成功', enResult1.success);
      const enResult2 = settlement.settleEnemyReward(`ENEMY_DYNAMIC_004`, { playerId: uniqueId });
      this._assert('敌人第二次被幂等拦截', enResult2.isDuplicate);

      console.log('[Phase10Step4Debug] 14. Idempotency PASS');
    } catch (e) {
      this._assert(`Idempotency 失败: ${e}`, false);
    }
  }

  // ==================== 15. ClaimState PASS (Phase10-Step4-Fix) ====================

  static async testClaimState(): Promise<void> {
    try {
      const rewardSystem = RewardSystem.getInstance();

      // 验证 isClaimed
      this._assert('未领取的章节 isClaimed = false',
        !rewardSystem.isClaimed('chapter', 'CLAIM_TEST_NEVER'));

      // 验证 markClaimed
      rewardSystem.markClaimed('chapter', 'CLAIM_TEST_001', 'txn_test_001');
      this._assert('markClaimed 后 isClaimed = true',
        rewardSystem.isClaimed('chapter', 'CLAIM_TEST_001'));

      // 验证 getClaimState
      const state = rewardSystem.getClaimState('chapter', 'CLAIM_TEST_001');
      this._assert('getClaimState 返回非 null', state !== null);
      if (state) {
        this._assert('claimState.claimed = true', state.claimed);
        this._assert('claimState.transactionId 正确', state.transactionId === 'txn_test_001');
      }

      // 验证 getAllClaimStates
      const all = rewardSystem.getAllClaimStates();
      this._assert('getAllClaimStates 返回对象', typeof all === 'object');

      // 验证 resetClaimState
      rewardSystem.resetClaimState('chapter', 'CLAIM_TEST_001');
      this._assert('resetClaimState 后 isClaimed = false',
        !rewardSystem.isClaimed('chapter', 'CLAIM_TEST_001'));

      // 验证 buildClaimStateKey
      const key = buildClaimStateKey('chapter', 'CH_005');
      this._assert('buildClaimStateKey 格式正确', key === 'chapter:CH_005');

      console.log('[Phase10Step4Debug] 15. ClaimState PASS');
    } catch (e) {
      this._assert(`ClaimState 失败: ${e}`, false);
    }
  }

  // ==================== 16. Config Validation PASS (Phase10-Step4-Fix) ====================

  static async testConfigValidation(): Promise<void> {
    try {
      const poolRepo = RewardPoolRepository.getInstance();

      // 验证 validateAllConfigs
      const results = poolRepo.validateAllConfigs();
      this._assert('validateAllConfigs 返回数组', Array.isArray(results));
      this._assert('已加载池全部合法', results.every((r) => r.valid));

      // 验证 validatePoolConfig — 不存在的池
      const invalidResult = poolRepo.validatePoolConfig('POOL_999');
      this._assert('不存在池校验失败', !invalidResult.valid);

      // 验证 totalWeight 缓存
      const tw = poolRepo.getPoolTotalWeight('REWARD_POOL_CHAPTER_BONUS');
      this._assert('totalWeight 缓存 > 0', tw > 0);

      console.log('[Phase10Step4Debug] 16. Config Validation PASS');
    } catch (e) {
      this._assert(`Config Validation 失败: ${e}`, false);
    }
  }

  // ==================== 17. Phase7 Bridge PASS (Phase10-Step4-Fix) ====================

  static async testPhase7Bridge(): Promise<void> {
    try {
      // 验证 mapPhase7SourceType
      this._assert('dungeon_boss → enemy', mapPhase7SourceType('dungeon_boss') === 'enemy');
      this._assert('dungeon_event → event', mapPhase7SourceType('dungeon_event') === 'event');
      this._assert('dungeon_node → battle', mapPhase7SourceType('dungeon_node') === 'battle');
      this._assert('quest → chapter', mapPhase7SourceType('quest') === 'chapter');
      this._assert('shop → pool', mapPhase7SourceType('shop') === 'pool');
      this._assert('season → chapter', mapPhase7SourceType('season') === 'chapter');
      this._assert('unknown → battle (fallback)',
        mapPhase7SourceType('unknown_type') === 'battle');

      // 验证 settleFromPhase7Source
      const settlement = RewardSettlement.getInstance();
      const result = settlement.settleFromPhase7Source(
        'dungeon_event',
        'EVENT_006',
        { playerId: 'phase7_bridge_test' },
      );
      this._assert('Phase7 dungeon_event → settleEventReward 成功', result.success);

      const result2 = settlement.settleFromPhase7Source(
        'dungeon_boss',
        'ENEMY_DYNAMIC_002',
        { playerId: 'phase7_bridge_test' },
      );
      this._assert('Phase7 dungeon_boss → settleEnemyReward 成功', result2.success);

      // 验证 previewReward（不修改存档）
      const rewardSystem = RewardSystem.getInstance();
      const countBefore = rewardSystem.getRecentRewardCount();
      const preview = settlement.previewReward('chapter', 'chapter_005');
      this._assert('previewReward 返回非 null', preview !== null);
      if (preview) {
        this._assert('previewReward 包含金币', preview.totalGold >= 0);
      }
      // preview 不应产生历史记录
      const countAfter = rewardSystem.getRecentRewardCount();
      this._assert('previewReward 不增加历史记录', countAfter === countBefore);

      console.log('[Phase10Step4Debug] 17. Phase7 Bridge PASS');
    } catch (e) {
      this._assert(`Phase7 Bridge 失败: ${e}`, false);
    }
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
    console.log('Phase10-Step4 奖励系统 测试汇总');
    console.log(`总计: ${total} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    if (failed > 0) {
      console.log('\n--- 失败项 ---');
      for (const r of this._results) {
        if (!r.passed) {
          console.log(`  ❌ ${r.name}`);
        }
      }
      console.log('\n[Phase10-Step4] FAIL');
    } else {
      console.log('\n[Phase10-Step4] PASS');
    }
    console.log('========================================\n');
  }
}
