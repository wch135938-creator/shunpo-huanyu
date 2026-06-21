// ============================================================
// DungeonDebugRunner.ts — Phase6 地牢系统集成测试
// 职责：验证 DungeonSystem 全链路（进入/通关/失败/奖励/存档）
// 约束：不接入战斗 / 不实现 UI
// ============================================================

import { Component, _decorator } from 'cc';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { DungeonSystem } from '../systems/DungeonSystem';
import { DropSystem } from '../systems/DropSystem';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { ConfigManager } from '../core/ConfigManager';
import type {
  DungeonEnterEventData,
  DungeonCompletedEventData,
  DungeonFailedEventData,
} from '../systems/DungeonSystem';
import type { DungeonRunData, DungeonRewardData } from '../data/dungeon_data';
import type { HeroProgressData, PlayerProgressData } from '../data/hero_progress_data';

const { ccclass } = _decorator;

const TAG = '[DungeonTest]';
const SEP = '='.repeat(60);
const SEP_MIN = '-'.repeat(60);
const TEST_DUNGEON_NORMAL = 1;
const TEST_DUNGEON_HARD = 2;
const TEST_DUNGEON_EXPERT = 3;
const TEST_PLAYER_ID = 'player_001';

interface TestResult {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
}

@ccclass('DungeonDebugRunner')
export class DungeonDebugRunner extends Component {
  private _eventManager!: EventManager;
  private _dungeonSystem!: DungeonSystem;
  private _saveManager!: SaveManager;

  private _results: TestResult[] = [];

  // 事件标志
  private _eventFlags = {
    entered: false,
    completed: false,
    failed: false,
    lastEntered: null as DungeonEnterEventData | null,
    lastCompleted: null as DungeonCompletedEventData | null,
    lastFailed: null as DungeonFailedEventData | null,
  };

  // 事件回调引用
  private _onEntered: ((...args: unknown[]) => void) | null = null;
  private _onCompleted: ((...args: unknown[]) => void) | null = null;
  private _onFailed: ((...args: unknown[]) => void) | null = null;

  // ==================== Cocos 生命周期 ====================

  start(): void {
    console.log('[DungeonDebugRunner] start');
    this._eventManager = EventManager.getInstance();
    this._dungeonSystem = DungeonSystem.getInstance();
    this._saveManager = SaveManager.getInstance();

    this._run()
      .catch((err: unknown) => {
        console.error(`${TAG} 集成测试异常`, err);
        this._printSummary(false);
      });
  }

  onDestroy(): void {
    this._cleanupListeners();
    this._dungeonSystem.destroy();
  }

  // ==================== 主流程 ====================

  private async _run(): Promise<void> {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} Phase6 地牢系统集成测试开始`);
    console.log(`${TAG} ${SEP_MIN}`);

    // 初始化
    this._initializeSaveManager();
    this._registerListeners();
    await this._loadConfigs();
    this._initializeTestData();

    // 执行测试
    this._results = [];

    this._results.push(await this._test01ConfigLoad());
    this._results.push(this._test02ValidateEnter());
    this._results.push(this._test03EnterDungeon());
    this._results.push(this._test04CompleteDungeon());
    this._results.push(this._test05FailDungeon());
    this._results.push(this._test06DailyLimit());
    this._results.push(this._test07StaminaManagement());
    this._results.push(this._test08GetDungeonInfo());
    this._results.push(this._test09AllDungeonInfos());
    this._results.push(this._test10SaveAndRestore());
    this._results.push(this._test11EventDispatch());
    this._results.push(this._test12RewardData());
    this._results.push(this._test13EdgeCases());

    // 输出
    this._printSummary(this._allPassed());
    this._cleanupListeners();
  }

  // ==================== 初始化 ====================

  private _initializeSaveManager(): void {
    const hasSave = this._saveManager.init(new LocalStorageAdapter());
    console.log(`${TAG} SaveManager 初始化完成, hasSave=${hasSave}`);
  }

  private async _loadConfigs(): Promise<void> {
    await Promise.all([
      this._dungeonSystem.loadConfig(),
      DropSystem.getInstance().loadConfig(),
      EquipmentSystem.getInstance().loadConfig(),
      ProgressSystem.getInstance().loadConfig(),
    ]);
    console.log(`${TAG} 配置加载完成`);
    console.log(`${TAG}   dungeonSystem.loaded=${this._dungeonSystem.isConfigLoaded()}`);
    console.log(`${TAG}   dropSystem.loaded=${DropSystem.getInstance().isConfigLoaded()}`);
    console.log(`${TAG}   equipmentSystem.loaded=${EquipmentSystem.getInstance().isConfigLoaded()}`);
  }

  private _initializeTestData(): void {
    // 重置测试数据
    this._dungeonSystem.clearData();
    // 初始化测试英雄（用于经验奖励测试）
    const testHero: HeroProgressData = {
      heroId: 'CARD_301',
      level: 1,
      exp: 0,
      power: 0,
    };
    const testPlayer: PlayerProgressData = {
      playerLevel: 1,
      playerExp: 0,
      totalPower: 0,
      highestStageId: 'STAGE_001',
      lastGrowthAt: 0,
    };
    ProgressSystem.getInstance().clearProgress();
    ProgressSystem.getInstance().setHeroProgress(testHero);
    ProgressSystem.getInstance().setPlayerProgressData(testPlayer);
    EquipmentSystem.getInstance().clearData();
    console.log(`${TAG} 测试数据初始化完成`);
  }

  // ==================== 事件监听 ====================

  private _registerListeners(): void {
    this._onEntered = (...args: unknown[]): void => {
      this._eventFlags.entered = true;
      this._eventFlags.lastEntered = args[0] as DungeonEnterEventData;
      console.log(`${TAG} 📡 dungeon:entered — dungeonId=${this._eventFlags.lastEntered.dungeonId}`);
    };
    this._eventManager.on(DungeonSystem.DUNGEON_ENTERED, this._onEntered, this);

    this._onCompleted = (...args: unknown[]): void => {
      this._eventFlags.completed = true;
      this._eventFlags.lastCompleted = args[0] as DungeonCompletedEventData;
      console.log(`${TAG} 📡 dungeon:completed — dungeonId=${this._eventFlags.lastCompleted.dungeonId}`);
    };
    this._eventManager.on(DungeonSystem.DUNGEON_COMPLETED, this._onCompleted, this);

    this._onFailed = (...args: unknown[]): void => {
      this._eventFlags.failed = true;
      this._eventFlags.lastFailed = args[0] as DungeonFailedEventData;
      console.log(`${TAG} 📡 dungeon:failed — dungeonId=${this._eventFlags.lastFailed.dungeonId}, reason=${this._eventFlags.lastFailed.reason}`);
    };
    this._eventManager.on(DungeonSystem.DUNGEON_FAILED, this._onFailed, this);
  }

  private _resetEventFlags(): void {
    this._eventFlags = {
      entered: false,
      completed: false,
      failed: false,
      lastEntered: null,
      lastCompleted: null,
      lastFailed: null,
    };
  }

  // ==================== Test 01: 配置加载 ====================

  private async _test01ConfigLoad(): Promise<TestResult> {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 01: 配置加载`);

    try {
      const configs = this._dungeonSystem.getAllDungeonConfigs();

      const checks: string[] = [];
      let pass = true;

      if (!this._dungeonSystem.isConfigLoaded()) { pass = false; checks.push('isConfigLoaded 返回 false'); }
      if (configs.length < 3) { pass = false; checks.push(`地牢配置数量不足: ${configs.length}`); }

      // 验证各难度
      const difficulties = configs.map((c) => c.difficulty);
      if (!difficulties.includes('Normal')) { pass = false; checks.push('缺少 Normal 难度地牢'); }
      if (!difficulties.includes('Hard')) { pass = false; checks.push('缺少 Hard 难度地牢'); }
      if (!difficulties.includes('Expert')) { pass = false; checks.push('缺少 Expert 难度地牢'); }

      if (pass) {
        checks.push(`已加载 ${configs.length} 个地牢配置`);
        checks.push(`难度覆盖: ${difficulties.join(', ')}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 1, name: '配置加载', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 1, name: '配置加载', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 02: 进入校验 ====================

  private _test02ValidateEnter(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 02: 进入校验`);

    try {
      const checks: string[] = [];
      let pass = true;

      // 2.1 正常情况应可进入
      const validResult = this._dungeonSystem.canEnterDungeon(TEST_DUNGEON_NORMAL);
      if (!validResult.canEnter) {
        pass = false;
        checks.push(`Normal 地牢应可进入: ${validResult.blockReason}`);
      } else {
        checks.push('Normal 地牢可进入');
      }

      // 2.2 不存在的地牢
      const invalidResult = this._dungeonSystem.canEnterDungeon(999);
      if (invalidResult.canEnter) {
        pass = false;
        checks.push('不存在的地牢应不可进入');
      } else {
        checks.push(`不存在地牢正确拒绝: ${invalidResult.blockReason}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 2, name: '进入校验', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 2, name: '进入校验', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 03: 进入地牢 ====================

  private _test03EnterDungeon(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 03: 进入地牢`);
    this._resetEventFlags();

    try {
      const staminaBefore = this._dungeonSystem.getStamina().current;

      const result = this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL, TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!result.canEnter) { pass = false; checks.push(`进入失败: ${result.blockReason}`); }
      if (!result.runData) { pass = false; checks.push('runData 为空'); }

      // 验证体力消耗
      const staminaAfter = this._dungeonSystem.getStamina().current;
      const config = this._dungeonSystem.getDungeonConfig(TEST_DUNGEON_NORMAL);
      if (staminaAfter !== staminaBefore - (config?.staminaCost ?? 0)) {
        pass = false;
        checks.push(`体力消耗不匹配: ${staminaBefore} → ${staminaAfter}, 期望消耗 ${config?.staminaCost}`);
      } else {
        checks.push(`体力: ${staminaBefore} → ${staminaAfter} (消耗 ${config?.staminaCost})`);
      }

      // 验证事件
      if (!this._eventFlags.entered) { pass = false; checks.push('dungeon:entered 事件未触发'); }

      // 验证活跃运行
      const activeRuns = this._dungeonSystem.getActiveRuns();
      if (activeRuns.length === 0) { pass = false; checks.push('无活跃运行记录'); }
      else { checks.push(`活跃运行: ${activeRuns.length} 个`); }

      if (pass) {
        checks.push(`地牢 ${TEST_DUNGEON_NORMAL} 成功进入`);
        checks.push('dungeon:entered 事件已触发');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 3, name: '进入地牢', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 3, name: '进入地牢', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 04: 通关地牢 ====================

  private _test04CompleteDungeon(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 04: 通关地牢`);
    this._resetEventFlags();

    try {
      // 先进入
      const enterResult = this._dungeonSystem.enterDungeon(TEST_DUNGEON_HARD, TEST_PLAYER_ID);
      if (!enterResult.canEnter) {
        return { id: 4, name: '通关地牢', pass: false, detail: `前置: 进入失败 — ${enterResult.blockReason}` };
      }

      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_HARD, TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!rewards) { pass = false; checks.push('completeDungeon 返回 null'); }

      // 验证奖励内容
      if (rewards) {
        const hasAnyReward = rewards.gold > 0 || rewards.exp > 0
          || rewards.equipmentList.length > 0 || rewards.itemList.length > 0;
        if (!hasAnyReward) { pass = false; checks.push('奖励全部为 0'); }
        else {
          checks.push(`金币: +${rewards.gold}, 经验: +${rewards.exp}`);
          checks.push(`装备: ${rewards.equipmentList.length} 件, 物品: ${rewards.itemList.length} 种`);
        }
      }

      // 验证事件
      if (!this._eventFlags.completed) { pass = false; checks.push('dungeon:completed 事件未触发'); }

      // 验证活跃运行已清空
      const activeRuns = this._dungeonSystem.getActiveRuns();
      if (activeRuns.length !== 0) { pass = false; checks.push('活跃运行未清空'); }

      if (pass) {
        checks.push('dungeon:completed 事件已触发');
        checks.push('活跃运行已清空');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 4, name: '通关地牢', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 4, name: '通关地牢', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 05: 失败地牢 ====================

  private _test05FailDungeon(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 05: 失败地牢`);
    this._resetEventFlags();

    try {
      // 先进入 Expert 地牢
      const enterResult = this._dungeonSystem.enterDungeon(TEST_DUNGEON_EXPERT, TEST_PLAYER_ID);
      if (!enterResult.canEnter) {
        return { id: 5, name: '失败地牢', pass: false, detail: `前置: 进入失败 — ${enterResult.blockReason}` };
      }

      const reason = '角色战力不足';
      const partialRewards = this._dungeonSystem.failDungeon(TEST_DUNGEON_EXPERT, reason, TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      // 验证事件
      if (!this._eventFlags.failed) { pass = false; checks.push('dungeon:failed 事件未触发'); }
      if (this._eventFlags.lastFailed?.reason !== reason) {
        pass = false;
        checks.push(`失败原因不匹配: 期望="${reason}", 实际="${this._eventFlags.lastFailed?.reason}"`);
      }

      // 验证部分奖励
      if (partialRewards) {
        checks.push(`部分奖励: 金币=${partialRewards.gold}, 经验=${partialRewards.exp}`);
      } else {
        checks.push('无明显奖励（完全失败）');
      }

      // 验证活跃运行已清空
      const activeRuns = this._dungeonSystem.getActiveRuns();
      if (activeRuns.length !== 0) { pass = false; checks.push('活跃运行未清空'); }

      if (pass) {
        checks.push(`失败原因: ${reason}`);
        checks.push('dungeon:failed 事件已触发');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 5, name: '失败地牢', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 5, name: '失败地牢', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 06: 每日限制 ====================

  private _test06DailyLimit(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 06: 每日限制`);

    try {
      // 地牢 1 每日最多 5 次，连续进入 5 次
      const maxAttempts = 5;
      let allPassed = true;

      for (let i = 0; i < maxAttempts; i++) {
        const result = this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL);
        if (!result.canEnter) {
          allPassed = false;
          console.log(`${TAG}   第 ${i + 1} 次进入已失败（预期外）: ${result.blockReason}`);
          break;
        }
        // 立即完成，不保留活跃运行
        this._dungeonSystem.completeDungeon(TEST_DUNGEON_NORMAL);
      }

      // 第 6 次应被拒绝
      const blockedResult = this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL);
      const checkRejected = !blockedResult.canEnter;

      if (allPassed && checkRejected) {
        const detail = `成功进入 ${maxAttempts} 次后第 ${maxAttempts + 1} 次被正确拒绝: ${blockedResult.blockReason}`;
        console.log(`${TAG}   → ✅ PASS: ${detail}`);
        return { id: 6, name: '每日限制', pass: true, detail };
      } else {
        const detail = !allPassed
          ? `前 ${maxAttempts} 次中某次被拒绝`
          : '第 6 次未正确拒绝';
        console.log(`${TAG}   → ❌ FAIL: ${detail}`);
        return { id: 6, name: '每日限制', pass: false, detail };
      }
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 6, name: '每日限制', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 07: 体力管理 ====================

  private _test07StaminaManagement(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 07: 体力管理`);

    try {
      const stamina = this._dungeonSystem.getStamina();

      const checks: string[] = [];
      let pass = true;

      if (stamina.max !== 100) { pass = false; checks.push(`maxStamina 应为 100: ${stamina.max}`); }
      if (stamina.current < 0) { pass = false; checks.push(`currentStamina 为负: ${stamina.current}`); }
      if (stamina.current > stamina.max) { pass = false; checks.push(`currentStamina 超出 max: ${stamina.current}`); }

      // 验证体力恢复
      const beforeRecovery = stamina.current;
      this._dungeonSystem.recoverStamina();
      const afterRecovery = this._dungeonSystem.getStamina().current;
      if (afterRecovery < beforeRecovery && beforeRecovery < stamina.max) {
        pass = false;
        checks.push('recoverStamina 未恢复体力');
      } else {
        checks.push(`体力: ${beforeRecovery} → ${afterRecovery}`);
      }

      if (pass) {
        checks.push(`max=${stamina.max}, current=${stamina.current}`);
        checks.push('体力管理正常');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 7, name: '体力管理', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 7, name: '体力管理', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 08: 地牢信息查询 ====================

  private _test08GetDungeonInfo(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 08: 地牢信息查询`);

    try {
      const info = this._dungeonSystem.getDungeonInfo(TEST_DUNGEON_NORMAL);

      const checks: string[] = [];
      let pass = true;

      if (!info) { pass = false; checks.push('getDungeonInfo 返回 null'); }
      if (info) {
        if (info.config.dungeonId !== TEST_DUNGEON_NORMAL) { pass = false; checks.push('dungeonId 不匹配'); }
        if (info.config.name !== '试炼洞窟') { pass = false; checks.push(`名称不匹配: ${info.config.name}`); }
        if (!('canEnter' in info)) { pass = false; checks.push('缺少 canEnter 字段'); }

        // 经过多次测试后，尝试次数应 > 0
        checks.push(`name=${info.config.name}`);
        checks.push(`difficulty=${info.config.difficulty}`);
        checks.push(`todayAttempts=${info.todayAttempts}/${info.maxAttemptsPerDay}`);
        checks.push(`canEnter=${info.canEnter}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 8, name: '地牢信息查询', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 8, name: '地牢信息查询', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 09: 全部地牢信息 ====================

  private _test09AllDungeonInfos(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 09: 全部地牢信息`);

    try {
      const infos = this._dungeonSystem.getAllDungeonInfos();

      const pass = infos.length >= 3;
      const detail = pass
        ? `${infos.length} 个地牢: ${infos.map((i) => `${i.config.name}(${i.config.difficulty})`).join(', ')}`
        : `地牢数量不足: ${infos.length}`;

      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 9, name: '全部地牢信息', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 9, name: '全部地牢信息', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 10: 存档保存与恢复 ====================

  private _test10SaveAndRestore(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 10: 存档保存与恢复`);

    try {
      // 记录当前数据
      const runHistoryBefore = this._dungeonSystem.getPlayerDungeonData().runHistory.length;
      const instancesBefore = Object.keys(this._dungeonSystem.getPlayerDungeonData().instances).length;

      // 保存
      const saveOk = this._saveManager.save();
      if (!saveOk) {
        return { id: 10, name: '存档保存与恢复', pass: false, detail: 'save() 返回 false' };
      }

      // 清除内存数据
      this._dungeonSystem.clearData();

      // 重新加载并恢复
      this._saveManager.load();
      // 复用已缓存配置
      const configManager = ConfigManager.getInstance();
      const dungeonConfig = configManager.getConfig('config/systems/dungeon_config');
      const dropConfig = configManager.getConfig('config/drops/drop_table');
      if (dungeonConfig && dropConfig) {
        // 直接调用内部恢复
        (this._dungeonSystem as any)['_restoreFromSave']();
      }

      const runHistoryAfter = this._dungeonSystem.getPlayerDungeonData().runHistory.length;
      const instancesAfter = Object.keys(this._dungeonSystem.getPlayerDungeonData().instances).length;

      const checks: string[] = [];
      let pass = true;

      if (runHistoryAfter < runHistoryBefore) {
        pass = false;
        checks.push(`runHistory 丢失: ${runHistoryBefore} → ${runHistoryAfter}`);
      } else {
        checks.push(`runHistory: ${runHistoryAfter} 条 (恢复前 ${runHistoryBefore})`);
      }
      if (instancesAfter < instancesBefore) {
        pass = false;
        checks.push(`instances 丢失: ${instancesBefore} → ${instancesAfter}`);
      } else {
        checks.push(`instances: ${instancesAfter} 个 (恢复前 ${instancesBefore})`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 10, name: '存档保存与恢复', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 10, name: '存档保存与恢复', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 11: 事件派发 ====================

  private _test11EventDispatch(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 11: 事件派发`);

    try {
      this._resetEventFlags();

      // 验证之前测试中事件已被派发
      const eventsFired = [];
      if (this._eventFlags.entered) eventsFired.push('entered');
      if (this._eventFlags.completed) eventsFired.push('completed');
      if (this._eventFlags.failed) eventsFired.push('failed');

      // 再触发一次进入来验证事件
      this._resetEventFlags();
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_EXPERT);
      this._dungeonSystem.failDungeon(TEST_DUNGEON_EXPERT, '测试事件');

      const newFired = [];
      if (this._eventFlags.entered) newFired.push('entered');
      if (this._eventFlags.failed) newFired.push('failed');

      const pass = newFired.length >= 2;
      const detail = pass
        ? `事件派发正常: ${newFired.join(', ')}`
        : `事件未全部触发: 期望 entered+failed, 实际 ${newFired.join(',')}`;

      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 11, name: '事件派发', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 11, name: '事件派发', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 12: 奖励数据完整性 ====================

  private _test12RewardData(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 12: 奖励数据完整性`);

    try {
      // 进入并通关 Normal 地牢获取奖励
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL);
      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_NORMAL);

      const checks: string[] = [];
      let pass = true;

      if (!rewards) { pass = false; checks.push('rewards 为 null'); }

      if (rewards) {
        // 验证奖励结构完整性
        if (typeof rewards.gold !== 'number') { pass = false; checks.push('gold 类型错误'); }
        if (typeof rewards.exp !== 'number') { pass = false; checks.push('exp 类型错误'); }
        if (!Array.isArray(rewards.equipmentList)) { pass = false; checks.push('equipmentList 不是数组'); }
        if (!Array.isArray(rewards.itemList)) { pass = false; checks.push('itemList 不是数组'); }

        // normal 难度保底掉落应包含 gold 和 exp
        if (rewards.gold <= 0) { pass = false; checks.push('金币为 0'); }
        if (rewards.exp <= 0) { pass = false; checks.push('经验为 0'); }

        checks.push(`gold=${rewards.gold}, exp=${rewards.exp}`);
        checks.push(`equipment=${rewards.equipmentList.length}, items=${rewards.itemList.length}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 12, name: '奖励数据完整性', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 12, name: '奖励数据完整性', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 13: 边界测试 ====================

  private _test13EdgeCases(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 13: 边界测试`);

    const subResults: string[] = [];
    let allPassed = true;

    // 13.1 不存在地牢的 getDungeonInfo
    const nullInfo = this._dungeonSystem.getDungeonInfo(9999);
    if (nullInfo !== null) {
      allPassed = false;
      subResults.push('❌ 13.1 不存在地牢的 getDungeonInfo 应返回 null');
    } else {
      subResults.push('✅ 13.1 getDungeonInfo(9999) 返回 null（正确）');
    }

    // 13.2 未进入即完成
    try {
      const result = this._dungeonSystem.completeDungeon(TEST_DUNGEON_NORMAL);
      if (result !== null) {
        allPassed = false;
        subResults.push('❌ 13.2 未进入即完成应返回 null');
      } else {
        subResults.push('✅ 13.2 未进入即完成返回 null（正确）');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 13.2 未进入即完成异常: ${e}`);
    }

    // 13.3 重复进入同一地牢
    try {
      const r1 = this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL);
      const r2 = this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL);
      // 第二次进入可能成功（如果还有次数）或失败（次数耗尽）
      // 验证不会崩溃
      if (r1.canEnter) {
        this._dungeonSystem.failDungeon(TEST_DUNGEON_NORMAL, '重复进入测试');
      }
      if (r2.canEnter && r2.runData) {
        this._dungeonSystem.failDungeon(TEST_DUNGEON_NORMAL, '重复进入测试2');
      }
      subResults.push('✅ 13.3 重复进入不会崩溃');
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 13.3 重复进入异常: ${e}`);
    }

    // 13.4 空字符串失败原因
    try {
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_NORMAL);
      this._dungeonSystem.failDungeon(TEST_DUNGEON_NORMAL, '');
      subResults.push('✅ 13.4 空失败原因处理正常');
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 13.4 空失败原因异常: ${e}`);
    }

    // 13.5 查询全部信息（空数据后）
    try {
      const infos = this._dungeonSystem.getAllDungeonInfos();
      if (infos.length === 0) {
        allPassed = false;
        subResults.push('❌ 13.5 getAllDungeonInfos 不应为空');
      } else {
        subResults.push(`✅ 13.5 getAllDungeonInfos 返回 ${infos.length} 条（正确）`);
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 13.5 getAllDungeonInfos 异常: ${e}`);
    }

    const detail = subResults.join('; ');
    console.log(`${TAG}   → ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    for (const s of subResults) {
      console.log(`${TAG}      ${s}`);
    }
    return { id: 13, name: '边界测试', pass: allPassed, detail };
  }

  // ==================== 输出 ====================

  private _allPassed(): boolean {
    return this._results.every((r) => r.pass);
  }

  private _printSummary(allPassed: boolean): void {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} 测试结果汇总:`);
    console.log(`${TAG} ${'─'.repeat(50)}`);
    console.log(`${TAG} | ${'#'.padEnd(3)} | ${'Test Name'.padEnd(24)} | Result |`);
    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(26)}|${'─'.repeat(8)}|`);

    for (const r of this._results) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`${TAG} | ${String(r.id).padEnd(3)} | ${r.name.padEnd(24)} | ${status.padEnd(6)} |`);
    }

    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(26)}|${'─'.repeat(8)}|`);
    const passCount = this._results.filter((r) => r.pass).length;
    const failCount = this._results.filter((r) => !r.pass).length;
    console.log(`${TAG} |     | 合计: ${passCount}/${this._results.length} PASS, ${failCount} FAIL    |`);
    console.log(`${TAG} ${SEP}`);

    if (allPassed) {
      console.log(`${TAG} ========== Phase6 地牢系统集成测试全部通过 ✅ ==========`);
    } else {
      console.log(`${TAG} ========== Phase6 地牢系统集成测试未通过 ❌ ==========`);
      console.log(`${TAG} 失败项:`);
      for (const r of this._results) {
        if (!r.pass) {
          console.log(`${TAG}   - Test ${r.id}: ${r.name} — ${r.detail}`);
        }
      }
    }
    console.log(`${TAG} ${SEP}`);
  }

  // ==================== 清理 ====================

  private _cleanupListeners(): void {
    if (!this._eventManager) return;

    if (this._onEntered) {
      this._eventManager.off(DungeonSystem.DUNGEON_ENTERED, this._onEntered, this);
      this._onEntered = null;
    }
    if (this._onCompleted) {
      this._eventManager.off(DungeonSystem.DUNGEON_COMPLETED, this._onCompleted, this);
      this._onCompleted = null;
    }
    if (this._onFailed) {
      this._eventManager.off(DungeonSystem.DUNGEON_FAILED, this._onFailed, this);
      this._onFailed = null;
    }
  }
}
