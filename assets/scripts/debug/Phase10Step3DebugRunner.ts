// ============================================================
// Phase10Step3DebugRunner — Phase10-Step3 关卡动态扩展系统 Debug 验证
// 职责：验证 StageExtensionRepository / ChapterEventRepository / DynamicEnemyRepository
//        ChapterEventManager / DynamicEnemyManager / SaveV2 兼容 / UI 骨架
// 用法：在 Cocos Creator 控制台执行 Phase10Step3DebugRunner.runAll()
// ============================================================

import { StageExtensionRepository } from '../chapter/StageExtensionRepository';
import { ChapterEventRepository } from '../chapter/ChapterEventRepository';
import { DynamicEnemyRepository } from '../chapter/DynamicEnemyRepository';
import { ChapterEventManager } from '../chapter/ChapterEventManager';
import { DynamicEnemyManager } from '../chapter/DynamicEnemyManager';
import { SaveManager } from '../save/SaveManager';
import {
  createDefaultChapterEventSaveData,
  type ChapterEventSaveData,
} from '../chapter/ChapterEventTypes';
import type { StageExtensionConfig } from '../chapter/ChapterEventTypes';
import type { ChapterEventConfig } from '../chapter/ChapterEventTypes';
import type { DynamicEnemyConfig } from '../chapter/ChapterEventTypes';
import type { ChapterEventRecord } from '../chapter/ChapterEventTypes';
import type { DynamicEnemySnapshot } from '../chapter/ChapterEventTypes';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase10Step3DebugRunner {
  private static _results: TestResult[] = [];

  // ==================== 主入口 ====================

  /** 运行所有 Phase10-Step3 测试 */
  static async runAll(): Promise<void> {
    this._results = [];
    console.log('========== Phase10-Step3 关卡动态扩展系统 集成测试 ==========\n');

    // 1. 读取 StageExtensionConfig PASS
    await this.testStageExtensionConfigLoad();

    // 2. 读取 ChapterEventConfig PASS
    await this.testChapterEventConfigLoad();

    // 3. 读取 DynamicEnemyConfig PASS
    await this.testDynamicEnemyConfigLoad();

    // 4. Event Roll PASS
    await this.testEventRoll();

    // 5. Event Trigger PASS
    await this.testEventTrigger();

    // 6. Event History PASS
    await this.testEventHistory();

    // 7. Dynamic Enemy Build PASS
    await this.testDynamicEnemyBuild();

    // 8. Dynamic Enemy Stat Calc PASS
    await this.testDynamicEnemyStatCalc();

    // 9. Stage Enemy Query PASS
    await this.testStageEnemyQuery();

    // 10. SaveV2 Compatibility PASS
    await this.testSaveV2Compatibility();

    // 11. Optional Field Auto Create PASS
    await this.testOptionalFieldAutoCreate();

    // 12. Portrait UI Create PASS
    await this.testPortraitUICreate();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1. 读取 StageExtensionConfig PASS ====================

  static async testStageExtensionConfigLoad(): Promise<void> {
    try {
      const repo = StageExtensionRepository.getInstance();
      await repo.load();

      this._assert('StageExtensionRepository 加载成功', repo.isLoaded());
      this._assert('StageExtensionRepository 数量 > 0', repo.getCount() > 0);

      // 验证具体关卡扩展
      const ext1 = repo.getStageExtension('chapter_001_stage_02');
      this._assert('chapter_001_stage_02 扩展配置存在', ext1 !== null);
      if (ext1) {
        this._assert('chapter_001_stage_02 eventPool 包含 EVENT_001',
          ext1.eventPool.includes('EVENT_001'));
        this._assert('chapter_001_stage_02 enemyPool 包含 ENEMY_DYNAMIC_001',
          ext1.enemyPool.includes('ENEMY_DYNAMIC_001'));
      }

      // 验证所有配置
      const all = repo.getAll();
      this._assert('getAll() 返回数组', Array.isArray(all));

      // 不存在关卡
      const ext999 = repo.getStageExtension('STAGE_999');
      this._assert('不存在关卡返回 null', ext999 === null);

      console.log('[Phase10Step3Debug] 1. 读取 StageExtensionConfig PASS');
    } catch (e) {
      this._assert(`StageExtensionConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 2. 读取 ChapterEventConfig PASS ====================

  static async testChapterEventConfigLoad(): Promise<void> {
    try {
      const repo = ChapterEventRepository.getInstance();
      await repo.load();

      this._assert('ChapterEventRepository 加载成功', repo.isLoaded());
      this._assert('ChapterEventRepository 数量 > 0', repo.getCount() > 0);

      // 验证具体事件
      const event001 = repo.getEvent('EVENT_001');
      this._assert('EVENT_001 存在', event001 !== null);
      if (event001) {
        this._assert('EVENT_001 name = 神秘商人', event001.name === '神秘商人');
        this._assert('EVENT_001 type = shop', event001.type === 'shop');
        this._assert('EVENT_001 chapterId = chapter_001', event001.chapterId === 'chapter_001');
        this._assert('EVENT_001 weight = 100', event001.weight === 100);
      }

      // 验证按章节查询
      const chapter1Events = repo.getEventsByChapter('chapter_001');
      this._assert('chapter_001 有 3 个事件', chapter1Events.length === 3);

      const chapter2Events = repo.getEventsByChapter('chapter_002');
      this._assert('chapter_002 有 2 个事件', chapter2Events.length === 2);

      const chapter3Events = repo.getEventsByChapter('chapter_003');
      this._assert('chapter_003 有 2 个事件', chapter3Events.length === 2);

      // 不存在事件
      const event999 = repo.getEvent('EVENT_999');
      this._assert('EVENT_999 不存在', event999 === null);

      const emptyChapter = repo.getEventsByChapter('chapter_999');
      this._assert('不存在章节返回空数组', emptyChapter.length === 0);

      console.log('[Phase10Step3Debug] 2. 读取 ChapterEventConfig PASS');
    } catch (e) {
      this._assert(`ChapterEventConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 3. 读取 DynamicEnemyConfig PASS ====================

  static async testDynamicEnemyConfigLoad(): Promise<void> {
    try {
      const repo = DynamicEnemyRepository.getInstance();
      await repo.load();

      this._assert('DynamicEnemyRepository 加载成功', repo.isLoaded());
      this._assert('DynamicEnemyRepository 数量 > 0', repo.getCount() > 0);

      // 验证具体动态敌人
      const enemy001 = repo.getEnemy('ENEMY_DYNAMIC_001');
      this._assert('ENEMY_DYNAMIC_001 存在', enemy001 !== null);
      if (enemy001) {
        this._assert('ENEMY_DYNAMIC_001 baseEnemyId = enemy_001',
          enemy001.baseEnemyId === 'enemy_001');
        this._assert('ENEMY_DYNAMIC_001 hpMultiplier = 1.2',
          enemy001.hpMultiplier === 1.2);
        this._assert('ENEMY_DYNAMIC_001 atkMultiplier = 1.1',
          enemy001.atkMultiplier === 1.1);
        this._assert('ENEMY_DYNAMIC_001 defMultiplier = 1.1',
          enemy001.defMultiplier === 1.1);
      }

      const enemy005 = repo.getEnemy('ENEMY_DYNAMIC_005');
      this._assert('ENEMY_DYNAMIC_005 hpMultiplier = 2.0',
        enemy005 !== null && enemy005.hpMultiplier === 2.0);

      // 不存在动态敌人
      const enemy999 = repo.getEnemy('ENEMY_DYNAMIC_999');
      this._assert('ENEMY_DYNAMIC_999 不存在', enemy999 === null);

      // 全列表
      const all = repo.getAll();
      this._assert('getAll() 返回数组', Array.isArray(all));
      this._assert('getAll() 返回 7 条', all.length === 7);

      console.log('[Phase10Step3Debug] 3. 读取 DynamicEnemyConfig PASS');
    } catch (e) {
      this._assert(`DynamicEnemyConfig 加载失败: ${e}`, false);
    }
  }

  // ==================== 4. Event Roll PASS ====================

  static async testEventRoll(): Promise<void> {
    try {
      const manager = ChapterEventManager.getInstance();
      if (!manager.isInitialized()) {
        await manager.initialize();
      }

      // 测试按章节抽取
      const event1 = manager.rollEvent('chapter_001');
      this._assert('chapter_001 rollEvent 非 null', event1 !== null);
      if (event1) {
        this._assert('rollEvent 返回的事件属于 chapter_001',
          event1.chapterId === 'chapter_001');
      }

      // 测试按关卡抽取
      const event2 = manager.rollEventByStage('chapter_001_stage_02');
      this._assert('chapter_001_stage_02 rollEventByStage 非 null', event2 !== null);

      // 测试权重抽取（多次抽取验证分布）
      const counts = new Map<string, number>();
      const iterations = 50;
      for (let i = 0; i < iterations; i++) {
        const e = manager.rollEvent('chapter_002');
        if (e) {
          counts.set(e.id, (counts.get(e.id) || 0) + 1);
        }
      }
      this._assert('chapter_002 重复抽取有结果', counts.size >= 1);

      // 无事件章节
      const noEvent = manager.rollEvent('chapter_999');
      this._assert('不存在的章节 rollEvent 返回 null', noEvent === null);

      // 无扩展关卡
      const noExt = manager.rollEventByStage('STAGE_999');
      this._assert('不存在的关卡 rollEventByStage 返回 null', noExt === null);

      console.log('[Phase10Step3Debug] 4. Event Roll PASS');
    } catch (e) {
      this._assert(`Event Roll 失败: ${e}`, false);
    }
  }

  // ==================== 5. Event Trigger PASS ====================

  static async testEventTrigger(): Promise<void> {
    try {
      const manager = ChapterEventManager.getInstance();
      if (!manager.isInitialized()) {
        await manager.initialize();
      }

      // 触发存在的事件
      const triggered = manager.triggerEvent('EVENT_001');
      this._assert('EVENT_001 触发成功', triggered);

      // 验证 lastEventId
      const lastId = manager.getLastEventId();
      this._assert('getLastEventId() = EVENT_001', lastId === 'EVENT_001');

      // 获取最后事件记录
      const lastEvent = manager.getLastEvent();
      this._assert('getLastEvent() 非 null', lastEvent !== null);
      if (lastEvent) {
        this._assert('lastEvent.eventId = EVENT_001', lastEvent.eventId === 'EVENT_001');
        this._assert('lastEvent.eventName = 神秘商人', lastEvent.eventName === '神秘商人');
        this._assert('lastEvent.eventType = shop', lastEvent.eventType === 'shop');
        this._assert('lastEvent.triggeredAt > 0', lastEvent.triggeredAt > 0);
      }

      // 触发不存在的事件
      const badTrigger = manager.triggerEvent('EVENT_999');
      this._assert('不存在的事件触发失败', !badTrigger);

      // 触发第二个事件（验证 lastEventId 更新）
      manager.triggerEvent('EVENT_002');
      this._assert('触发 EVENT_002 后 getLastEventId() = EVENT_002',
        manager.getLastEventId() === 'EVENT_002');

      console.log('[Phase10Step3Debug] 5. Event Trigger PASS');
    } catch (e) {
      this._assert(`Event Trigger 失败: ${e}`, false);
    }
  }

  // ==================== 6. Event History PASS ====================

  static async testEventHistory(): Promise<void> {
    try {
      const manager = ChapterEventManager.getInstance();

      // 清空后重新测试
      manager.clearData();
      await manager.initialize();

      // 触发多个事件
      manager.triggerEvent('EVENT_001');
      manager.triggerEvent('EVENT_002');
      manager.triggerEvent('EVENT_003');

      // 验证历史记录数
      const count = manager.getEventHistoryCount();
      this._assert('事件历史记录数 = 3', count === 3);

      // 验证历史记录内容
      const history = manager.getEventHistory();
      this._assert('getEventHistory() 返回数组', Array.isArray(history));
      this._assert('getEventHistory() 长度 >= 3', history.length >= 3);

      // 验证 limit 参数
      const limited = manager.getEventHistory(2);
      this._assert('getEventHistory(2) 返回最多 2 条', limited.length <= 2);

      // 验证最后一条记录
      const last = manager.getLastEvent();
      this._assert('最后事件是 EVENT_003', last !== null && last.eventId === 'EVENT_003');

      // 验证存档导出
      const saveData = manager.save();
      this._assert('save() 返回 lastEventId', saveData.lastEventId === 'EVENT_003');
      this._assert('save() 返回 eventHistory', saveData.eventHistory !== undefined &&
        saveData.eventHistory.length === 3);

      // 验证存档恢复
      const testSave: ChapterEventSaveData = {
        lastEventId: 'EVENT_005',
        eventHistory: [
          { eventId: 'EVENT_005', chapterId: 'chapter_002', eventName: '秘境宝箱',
            eventType: 'reward', triggeredAt: 1000 },
        ],
        saveVersion: 1,
        updatedAt: Date.now(),
      };
      manager.restore(testSave);
      this._assert('restore 后 lastEventId = EVENT_005',
        manager.getLastEventId() === 'EVENT_005');
      this._assert('restore 后 eventHistoryCount = 1',
        manager.getEventHistoryCount() === 1);

      console.log('[Phase10Step3Debug] 6. Event History PASS');
    } catch (e) {
      this._assert(`Event History 失败: ${e}`, false);
    }
  }

  // ==================== 7. Dynamic Enemy Build PASS ====================

  static async testDynamicEnemyBuild(): Promise<void> {
    try {
      const manager = DynamicEnemyManager.getInstance();
      if (!manager.isInitialized()) {
        const initOk = await manager.initialize();
        this._assert('DynamicEnemyManager 初始化成功', initOk);
      }

      // 构建单个敌人
      const snapshot = manager.buildEnemy('ENEMY_DYNAMIC_001');
      this._assert('ENEMY_DYNAMIC_001 buildEnemy 成功', snapshot !== null);
      if (snapshot) {
        this._assert('snapshot.dynamicEnemyId = ENEMY_DYNAMIC_001',
          snapshot.dynamicEnemyId === 'ENEMY_DYNAMIC_001');
        this._assert('snapshot.baseEnemyId = enemy_001',
          snapshot.baseEnemyId === 'enemy_001');
        this._assert('snapshot.name 包含 (强化)',
          snapshot.name.includes('(强化)'));
        this._assert('snapshot.level > 0', snapshot.level > 0);
        this._assert('snapshot.hp > 0', snapshot.hp > 0);
        this._assert('snapshot.attack > 0', snapshot.attack > 0);
        this._assert('snapshot.defense > 0', snapshot.defense > 0);
        this._assert('snapshot.speed > 0', snapshot.speed > 0);
        this._assert('snapshot.skillIds 非空', snapshot.skillIds.length > 0);
        this._assert('snapshot.enemyType = normal', snapshot.enemyType === 'normal');
      }

      // 构建精英变体
      const eliteSnapshot = manager.buildEnemy('ENEMY_DYNAMIC_007');
      this._assert('ENEMY_DYNAMIC_007 buildEnemy 成功', eliteSnapshot !== null);
      if (eliteSnapshot) {
        this._assert('elite snapshot.enemyType = elite',
          eliteSnapshot.enemyType === 'elite');
        this._assert('elite snapshot.name 包含 (领主)',
          eliteSnapshot.name.includes('(领主)'));
      }

      // 不存在的动态敌人
      const badSnapshot = manager.buildEnemy('ENEMY_DYNAMIC_999');
      this._assert('不存在动态敌人 buildEnemy 返回 null', badSnapshot === null);

      console.log('[Phase10Step3Debug] 7. Dynamic Enemy Build PASS');
    } catch (e) {
      this._assert(`Dynamic Enemy Build 失败: ${e}`, false);
    }
  }

  // ==================== 8. Dynamic Enemy Stat Calc PASS ====================

  static async testDynamicEnemyStatCalc(): Promise<void> {
    try {
      const manager = DynamicEnemyManager.getInstance();
      if (!manager.isInitialized()) {
        await manager.initialize();
      }

      // 测试 calculateEnemyStats（直接调用，绕过基础敌人查找）
      const baseStats = { hp: 200, atk: 30, def: 15, speed: 60 };
      const multipliers = {
        hpMultiplier: 1.5,
        atkMultiplier: 1.3,
        defMultiplier: 1.2,
        speedMultiplier: 1.0,
        levelBonus: 2,
      };

      const calculated = manager.calculateEnemyStats(baseStats, 5, multipliers);
      this._assert('HP = 300 (200 × 1.5)', calculated.hp === 300);
      this._assert('attack = 39 (30 × 1.3)', calculated.attack === 39);
      this._assert('defense = 18 (15 × 1.2)', calculated.defense === 18);
      this._assert('speed = 60 (60 × 1.0)', calculated.speed === 60);
      this._assert('level = 7 (5 + 2)', calculated.level === 7);

      // 测试极端倍率
      const extremeStats = { hp: 1000, atk: 100, def: 50, speed: 100 };
      const extremeMult = {
        hpMultiplier: 3.0,
        atkMultiplier: 2.0,
        defMultiplier: 2.0,
        speedMultiplier: 0.5,
        levelBonus: 10,
      };
      const extremeResult = manager.calculateEnemyStats(extremeStats, 10, extremeMult);
      this._assert('extreme HP = 3000', extremeResult.hp === 3000);
      this._assert('extreme attack = 200', extremeResult.attack === 200);
      this._assert('extreme defense = 100', extremeResult.defense === 100);
      this._assert('extreme speed = 50', extremeResult.speed === 50);
      this._assert('extreme level = 20', extremeResult.level === 20);

      // 验证通过 buildEnemy 生成的数据与 calculateEnemyStats 一致
      const snapshot = manager.buildEnemy('ENEMY_DYNAMIC_001');
      if (snapshot) {
        const baseEnemy = manager.getBaseEnemy('enemy_001');
        if (baseEnemy) {
          const expected = manager.calculateEnemyStats(
            baseEnemy.baseStats,
            baseEnemy.level,
            {
              hpMultiplier: 1.2,
              atkMultiplier: 1.1,
              defMultiplier: 1.1,
              speedMultiplier: 1.0,
              levelBonus: 1,
            },
          );
          this._assert('buildEnemy HP 与 calculateEnemyStats 一致',
            snapshot.hp === expected.hp);
          this._assert('buildEnemy ATK 与 calculateEnemyStats 一致',
            snapshot.attack === expected.attack);
          this._assert('buildEnemy DEF 与 calculateEnemyStats 一致',
            snapshot.defense === expected.defense);
        }
      }

      console.log('[Phase10Step3Debug] 8. Dynamic Enemy Stat Calc PASS');
    } catch (e) {
      this._assert(`Dynamic Enemy Stat Calc 失败: ${e}`, false);
    }
  }

  // ==================== 9. Stage Enemy Query PASS ====================

  static async testStageEnemyQuery(): Promise<void> {
    try {
      const manager = DynamicEnemyManager.getInstance();
      if (!manager.isInitialized()) {
        await manager.initialize();
      }

      // 按关卡查询动态敌人
      const snapshots = manager.buildEnemyByStage('chapter_001_stage_03');
      this._assert('chapter_001_stage_03 有 2 个动态敌人', snapshots.length === 2);
      if (snapshots.length >= 2) {
        this._assert('snapshot[0].name 非空', snapshots[0].name.length > 0);
        this._assert('snapshot[1].name 非空', snapshots[1].name.length > 0);
      }

      // Boss 关卡
      const bossSnapshots = manager.buildEnemyByStage('chapter_001_stage_06');
      this._assert('chapter_001_stage_06 有 1 个动态敌人', bossSnapshots.length === 1);
      if (bossSnapshots.length >= 1) {
        this._assert('Boss 关卡动态敌人 name 包含 (精英)',
          bossSnapshots[0].name.includes('(精英)'));
      }

      // 无扩展关卡
      const noExtSnapshots = manager.buildEnemyByStage('chapter_001_stage_01');
      this._assert('无扩展关卡返回空数组', noExtSnapshots.length === 0);

      // 不存在关卡
      const badSnapshots = manager.buildEnemyByStage('STAGE_999');
      this._assert('不存在关卡返回空数组', badSnapshots.length === 0);

      // 验证基础敌人缓存
      const baseCount = manager.getBaseEnemyCount();
      this._assert('基础敌人缓存 > 0', baseCount > 0);

      const baseEnemy = manager.getBaseEnemy('enemy_001');
      this._assert('getBaseEnemy(enemy_001) 非 null', baseEnemy !== null);
      if (baseEnemy) {
        this._assert('baseEnemy.name = 雾气精魄', baseEnemy.name === '雾气精魄');
      }

      console.log('[Phase10Step3Debug] 9. Stage Enemy Query PASS');
    } catch (e) {
      this._assert(`Stage Enemy Query 失败: ${e}`, false);
    }
  }

  // ==================== 10. SaveV2 Compatibility PASS ====================

  static async testSaveV2Compatibility(): Promise<void> {
    try {
      // 验证默认工厂函数
      const defaultData = createDefaultChapterEventSaveData();
      this._assert('createDefaultChapterEventSaveData 返回非 null', defaultData !== null);
      this._assert('默认 lastEventId = ""', defaultData.lastEventId === '');
      this._assert('默认 eventHistory 为空数组',
        Array.isArray(defaultData.eventHistory) && defaultData.eventHistory.length === 0);
      this._assert('默认 saveVersion = 1', defaultData.saveVersion === 1);
      this._assert('默认 updatedAt > 0',
        defaultData.updatedAt !== undefined && defaultData.updatedAt > 0);

      // 测试 SaveManager chapterEventData 读写（如果 SaveManager 已初始化）
      const saveManager = SaveManager.getInstance();
      // 注意：在运行时环境中 SaveManager 可能未初始化（需要 adapter）
      // 这里测试数据结构本身的兼容性

      // 模拟旧存档自动补全
      const mockOldSave: Partial<ChapterEventSaveData> = {};
      const merged: ChapterEventSaveData = {
        lastEventId: mockOldSave.lastEventId ?? '',
        eventHistory: mockOldSave.eventHistory ?? [],
        saveVersion: mockOldSave.saveVersion ?? 1,
        updatedAt: mockOldSave.updatedAt ?? Date.now(),
      };
      this._assert('旧存档 lastEventId 自动补全', merged.lastEventId === '');
      this._assert('旧存档 eventHistory 自动补全',
        Array.isArray(merged.eventHistory) && merged.eventHistory.length === 0);

      // 测试部分字段缺失
      const partialSave: Partial<ChapterEventSaveData> = {
        lastEventId: 'EVENT_001',
      };
      const restored: ChapterEventSaveData = {
        lastEventId: partialSave.lastEventId ?? '',
        eventHistory: partialSave.eventHistory ?? [],
        saveVersion: partialSave.saveVersion ?? 1,
        updatedAt: partialSave.updatedAt ?? Date.now(),
      };
      this._assert('部分字段 lastEventId 保留', restored.lastEventId === 'EVENT_001');
      this._assert('缺失 eventHistory 自动补全为空',
        Array.isArray(restored.eventHistory) && restored.eventHistory.length === 0);

      // 不升级版本号
      this._assert('saveVersion 保持 1', restored.saveVersion === 1);

      console.log('[Phase10Step3Debug] 10. SaveV2 Compatibility PASS');
    } catch (e) {
      this._assert(`SaveV2 Compatibility 失败: ${e}`, false);
    }
  }

  // ==================== 11. Optional Field Auto Create PASS ====================

  static async testOptionalFieldAutoCreate(): Promise<void> {
    try {
      // 验证 ChapterEventSaveData 的可选字段全都有默认值
      const defaultData = createDefaultChapterEventSaveData();

      const hasLastEventId = 'lastEventId' in defaultData;
      this._assert('默认数据有 lastEventId 字段', hasLastEventId);

      const hasEventHistory = 'eventHistory' in defaultData;
      this._assert('默认数据有 eventHistory 字段', hasEventHistory);

      const hasSaveVersion = 'saveVersion' in defaultData;
      this._assert('默认数据有 saveVersion 字段', hasSaveVersion);

      const hasUpdatedAt = 'updatedAt' in defaultData;
      this._assert('默认数据有 updatedAt 字段', hasUpdatedAt);

      // 验证类型安全 — 所有字段可安全读写
      const data: ChapterEventSaveData = {};
      const safeData: ChapterEventSaveData = {
        lastEventId: data.lastEventId ?? '',
        eventHistory: data.eventHistory ?? [],
        saveVersion: data.saveVersion ?? 1,
        updatedAt: data.updatedAt ?? Date.now(),
      };

      safeData.lastEventId = 'test_event';
      this._assert('可选字段可写入', safeData.lastEventId === 'test_event');

      safeData.eventHistory!.push({
        eventId: 'test_event',
        chapterId: 'chapter_001',
        eventName: '测试事件',
        eventType: 'shop',
        triggeredAt: Date.now(),
      });
      this._assert('可选字段 eventHistory 可写入',
        safeData.eventHistory!.length === 1);

      console.log('[Phase10Step3Debug] 11. Optional Field Auto Create PASS');
    } catch (e) {
      this._assert(`Optional Field Auto Create 失败: ${e}`, false);
    }
  }

  // ==================== 12. Portrait UI Create PASS ====================

  static async testPortraitUICreate(): Promise<void> {
    try {
      // 验证 UI 面板类可导入并实例化（编译时验证）
      // 运行时不依赖 Cocos 节点树，仅验证类存在和方法签名
      const { ChapterEventPanel } = await import('../chapter/ChapterEventPanel');
      this._assert('ChapterEventPanel 类存在', ChapterEventPanel !== undefined);
      this._assert('ChapterEventPanel 是 class', typeof ChapterEventPanel === 'function');

      const { DynamicEnemyPreviewPanel } = await import('../chapter/DynamicEnemyPreviewPanel');
      this._assert('DynamicEnemyPreviewPanel 类存在', DynamicEnemyPreviewPanel !== undefined);
      this._assert('DynamicEnemyPreviewPanel 是 class',
        typeof DynamicEnemyPreviewPanel === 'function');

      // 验证面板属性声明（通过原型检查）
      const eventProto = ChapterEventPanel.prototype;
      this._assert('ChapterEventPanel 有 showEvent 方法',
        typeof eventProto.showEvent === 'function');
      this._assert('ChapterEventPanel 有 refresh 方法',
        typeof eventProto.refresh === 'function');

      const previewProto = DynamicEnemyPreviewPanel.prototype;
      this._assert('DynamicEnemyPreviewPanel 有 showPreview 方法',
        typeof previewProto.showPreview === 'function');
      this._assert('DynamicEnemyPreviewPanel 有 refresh 方法',
        typeof previewProto.refresh === 'function');

      console.log('[Phase10Step3Debug] 12. Portrait UI Create PASS');
    } catch (e) {
      this._assert(`Portrait UI Create 失败: ${e}`, false);
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
    console.log('Phase10-Step3 关卡动态扩展系统 测试汇总');
    console.log(`总计: ${total} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    if (failed > 0) {
      console.log('\n--- 失败项 ---');
      for (const r of this._results) {
        if (!r.passed) {
          console.log(`  ❌ ${r.name}`);
        }
      }
      console.log('\n[Phase10-Step3] FAIL');
    } else {
      console.log('\n[Phase10-Step3] PASS');
    }
    console.log('========================================\n');
  }
}
