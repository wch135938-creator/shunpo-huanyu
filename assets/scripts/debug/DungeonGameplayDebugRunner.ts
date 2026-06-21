// ============================================================
// DungeonGameplayDebugRunner — Phase6-Step6 地牢玩法逻辑层集成测试
// 职责：验证 DungeonGameplay 全链路（开始/层推进/战斗模拟/掉落/完成/失败）
// 约束：不接入真实战斗 / 不实现 UI
// ============================================================

import { Component, _decorator } from 'cc';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { DungeonSystem } from '../systems/DungeonSystem';
import { DropSystem } from '../systems/DropSystem';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { DungeonGameplay } from '../systems/DungeonGameplay';
import type {
  DungeonGameplayState,
  LayerBattleResult,
  LayerAdvanceResult,
} from '../data/dungeon_gameplay_types';
import type { HeroProgressData, PlayerProgressData } from '../data/hero_progress_data';

const { ccclass } = _decorator;

const TAG = '[DungeonGameplayTest]';
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

@ccclass('DungeonGameplayDebugRunner')
export class DungeonGameplayDebugRunner extends Component {
  private _eventManager!: EventManager;
  private _dungeonGameplay!: DungeonGameplay;
  private _dungeonSystem!: DungeonSystem;
  private _saveManager!: SaveManager;

  private _results: TestResult[] = [];

  // 事件标志
  private _eventFlags = {
    runStarted: false,
    battleResolved: 0,
    layerCleared: 0,
    layerFailed: false,
    runCompleted: false,
    runFailed: false,
  };

  // 事件回调引用
  private _onRunStarted: ((...args: unknown[]) => void) | null = null;
  private _onBattleResolved: ((...args: unknown[]) => void) | null = null;
  private _onLayerCleared: ((...args: unknown[]) => void) | null = null;
  private _onLayerFailed: ((...args: unknown[]) => void) | null = null;
  private _onRunCompleted: ((...args: unknown[]) => void) | null = null;
  private _onRunFailed: ((...args: unknown[]) => void) | null = null;

  // ==================== Cocos 生命周期 ====================

  start(): void {
    console.log(`${TAG} start`);
    this._eventManager = EventManager.getInstance();
    this._dungeonGameplay = DungeonGameplay.getInstance();
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
    this._dungeonGameplay.clearAllRuns();
    this._dungeonSystem.destroy();
  }

  // ==================== 主流程 ====================

  private async _run(): Promise<void> {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} Phase6-Step6 DungeonGameplay 集成测试开始`);
    console.log(`${TAG} ${SEP_MIN}`);

    // 初始化
    this._initializeSaveManager();
    this._registerListeners();
    await this._loadConfigs();
    this._initializeTestData();

    // 执行测试
    this._results = [];

    this._results.push(await this._test01SystemReadiness());
    this._results.push(this._test02StartRun());
    this._results.push(this._test03LayerBattleSimulation());
    this._results.push(this._test04SingleLayerAdvance());
    this._results.push(this._test05FullRunCompletion());
    this._results.push(this._test06RunFailure());
    this._results.push(this._test07PowerConfigCustomization());
    this._results.push(this._test08EventDispatch());
    this._results.push(this._test09EdgeCases());

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
    console.log(`${TAG}   progressSystem.loaded=${ProgressSystem.getInstance().isConfigLoaded()}`);
    console.log(`${TAG}   dungeonGameplay.ready=${this._dungeonGameplay.isReady()}`);
  }

  private _initializeTestData(): void {
    // 清空之前测试的残留状态
    this._dungeonSystem.clearData();
    this._dungeonGameplay.clearAllRuns();
    EquipmentSystem.getInstance().clearData();
    ProgressSystem.getInstance().clearProgress();

    // 初始化测试英雄数据（3 个英雄组成阵容）
    const heroes: HeroProgressData[] = [
      { heroId: 'CARD_301', level: 10, exp: 0, power: 500 },
      { heroId: 'CARD_302', level: 10, exp: 0, power: 480 },
      { heroId: 'CARD_303', level: 10, exp: 0, power: 520 },
    ];
    const totalPower = heroes.reduce((sum, h) => sum + h.power, 0);

    ProgressSystem.getInstance().setHeroProgressList(heroes);

    const playerProgress: PlayerProgressData = {
      playerLevel: 5,
      playerExp: 0,
      totalPower,
      highestStageId: 'STAGE_001',
      lastGrowthAt: Date.now(),
    };
    ProgressSystem.getInstance().setPlayerProgressData(playerProgress);

    console.log(`${TAG} 测试数据初始化完成, totalPower=${totalPower}`);
  }

  // ==================== 事件监听 ====================

  private _registerListeners(): void {
    this._onRunStarted = (): void => {
      this._eventFlags.runStarted = true;
      console.log(`${TAG} 📡 dungeonGameplay:runStarted`);
    };
    this._eventManager.on(DungeonGameplay.RUN_STARTED, this._onRunStarted, this);

    this._onBattleResolved = (): void => {
      this._eventFlags.battleResolved++;
    };
    this._eventManager.on(DungeonGameplay.BATTLE_RESOLVED, this._onBattleResolved, this);

    this._onLayerCleared = (): void => {
      this._eventFlags.layerCleared++;
    };
    this._eventManager.on(DungeonGameplay.LAYER_CLEARED, this._onLayerCleared, this);

    this._onLayerFailed = (): void => {
      this._eventFlags.layerFailed = true;
      console.log(`${TAG} 📡 dungeonGameplay:layerFailed`);
    };
    this._eventManager.on(DungeonGameplay.LAYER_FAILED, this._onLayerFailed, this);

    this._onRunCompleted = (): void => {
      this._eventFlags.runCompleted = true;
      console.log(`${TAG} 📡 dungeonGameplay:runCompleted`);
    };
    this._eventManager.on(DungeonGameplay.RUN_COMPLETED, this._onRunCompleted, this);

    this._onRunFailed = (): void => {
      this._eventFlags.runFailed = true;
      console.log(`${TAG} 📡 dungeonGameplay:runFailed`);
    };
    this._eventManager.on(DungeonGameplay.RUN_FAILED, this._onRunFailed, this);
  }

  private _resetEventFlags(): void {
    this._eventFlags = {
      runStarted: false,
      battleResolved: 0,
      layerCleared: 0,
      layerFailed: false,
      runCompleted: false,
      runFailed: false,
    };
  }

  // ==================== Test 01: 系统就绪检查 ====================

  private async _test01SystemReadiness(): Promise<TestResult> {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 01: 系统就绪检查`);

    try {
      const checks: string[] = [];
      let pass = true;

      if (!this._dungeonGameplay.isReady()) {
        pass = false;
        checks.push('DungeonGameplay.isReady() 返回 false');
      } else {
        checks.push('DungeonGameplay 就绪');
      }

      // 验证默认战力配置
      const powerCfg = this._dungeonGameplay.getLayerPowerConfig();
      if (powerCfg.baseEnemyPowerRatio <= 0) {
        pass = false;
        checks.push('baseEnemyPowerRatio 无效');
      }
      checks.push(`战力配置: baseRatio=${powerCfg.baseEnemyPowerRatio}, growthRate=${powerCfg.layerGrowthRate}, bossMulti=${powerCfg.bossPowerMultiplier}`);

      const totalPower = this._dungeonGameplay.getPlayerTotalPower();
      checks.push(`玩家总战力: ${totalPower}`);

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 1, name: '系统就绪检查', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 1, name: '系统就绪检查', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 02: 开始 Run ====================

  private _test02StartRun(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 02: 开始 Run`);
    this._resetEventFlags();

    try {
      const checks: string[] = [];
      let pass = true;

      // 正常开始
      const state = this._dungeonGameplay.startRun(TEST_DUNGEON_NORMAL, TEST_PLAYER_ID);
      if (!state) { pass = false; checks.push('startRun 返回 null'); }
      if (state) {
        if (state.dungeonId !== TEST_DUNGEON_NORMAL) { pass = false; checks.push('dungeonId 不匹配'); }
        if (state.currentLayer !== 1) { pass = false; checks.push(`currentLayer 应为 1: ${state.currentLayer}`); }
        if (state.totalLayers <= 0) { pass = false; checks.push(`totalLayers 无效: ${state.totalLayers}`); }
        if (!state.isActive) { pass = false; checks.push('isActive 应为 true'); }

        checks.push(`地牢 ${state.dungeonId} 开始, 共 ${state.totalLayers} 层`);
        checks.push(`currentLayer=${state.currentLayer}, isActive=${state.isActive}`);
      }

      // 验证事件
      if (!this._eventFlags.runStarted) { pass = false; checks.push('runStarted 事件未触发'); }

      // 重复开始应返回 null
      const dupState = this._dungeonGameplay.startRun(TEST_DUNGEON_NORMAL);
      if (dupState !== null) { pass = false; checks.push('重复 startRun 应返回 null'); }
      else { checks.push('重复 startRun 正确返回 null'); }

      // 验证活跃运行
      const activeRuns = this._dungeonGameplay.getAllActiveRuns();
      if (activeRuns.length !== 1) { pass = false; checks.push(`活跃运行数应为 1: ${activeRuns.length}`); }

      // 验证 DungeonSystem 中的体力消耗
      const stamina = this._dungeonSystem.getStamina();
      const config = this._dungeonSystem.getDungeonConfig(TEST_DUNGEON_NORMAL);
      checks.push(`体力: ${stamina.current}/${stamina.max} (消耗 ${config?.staminaCost ?? '?'})`);

      // 清理：放弃当前 run
      this._dungeonGameplay.abandonRun(TEST_DUNGEON_NORMAL);

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 2, name: '开始 Run', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 2, name: '开始 Run', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 03: 层战斗模拟 ====================

  private _test03LayerBattleSimulation(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 03: 层战斗模拟`);

    try {
      const checks: string[] = [];
      let pass = true;

      // 测试各层战力对比
      const layers = [1, 3, 5];
      const results: LayerBattleResult[] = [];

      for (const layer of layers) {
        const result = this._dungeonGameplay.simulateLayerBattle(TEST_DUNGEON_NORMAL, layer);
        results.push(result);

        if (result.layerIndex !== layer) { pass = false; checks.push(`layerIndex 不匹配: ${result.layerIndex}`); }
        if (result.playerPower <= 0) { pass = false; checks.push(`playerPower 无效: ${result.playerPower}`); }
        if (result.enemyPower <= 0) { pass = false; checks.push(`enemyPower 无效: ${result.enemyPower}`); }
        if (result.roundsSimulated <= 0) { pass = false; checks.push(`roundsSimulated 无效: ${result.roundsSimulated}`); }
      }

      checks.push(`第1层: 敌=${results[0].enemyPower}, 胜=${results[0].victory}, 伤比=${results[0].damageDealtRatio}`);
      checks.push(`第3层: 敌=${results[1].enemyPower}, 胜=${results[1].victory}`);
      checks.push(`第5层: 敌=${results[2].enemyPower}, 胜=${results[2].victory}`);

      // 验证敌方战力逐层增长
      if (results[2].enemyPower <= results[0].enemyPower) {
        pass = false;
        checks.push('敌方战力应逐层增长');
      } else {
        checks.push('敌方战力逐层增长 ✓');
      }

      // 验证 Boss 层标记（Normal 地牢无 Boss 配置，Hard 地牢有 Boss）
      const bossResult = this._dungeonGameplay.simulateLayerBattle(TEST_DUNGEON_HARD, 8);
      const hardConfig = this._dungeonSystem.getDungeonConfig(TEST_DUNGEON_HARD);
      if (hardConfig?.bossConfig && bossResult.isBossLayer) {
        checks.push(`Boss层(第${bossResult.layerIndex}层): 敌=${bossResult.enemyPower}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 3, name: '层战斗模拟', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 3, name: '层战斗模拟', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 04: 单层推进 ====================

  private _test04SingleLayerAdvance(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 04: 单层推进`);
    this._resetEventFlags();

    try {
      const checks: string[] = [];
      let pass = true;

      // 开始 run
      const state = this._dungeonGameplay.startRun(TEST_DUNGEON_NORMAL, TEST_PLAYER_ID);
      if (!state) {
        return { id: 4, name: '单层推进', pass: false, detail: 'startRun 失败' };
      }

      // 调整战力配置确保第一层必胜
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 0.3,
        guaranteedWinRatio: 0.5,
        randomVariance: 0.01,
      });

      // 推进第一层
      const result = this._dungeonGameplay.advanceLayer(TEST_DUNGEON_NORMAL);
      if (!result) { pass = false; checks.push('advanceLayer 返回 null'); }

      if (result) {
        checks.push(`第1层战斗: victory=${result.battleResult.victory}`);
        checks.push(`敌我战力比: ${result.battleResult.playerPower}/${result.battleResult.enemyPower}`);

        if (result.battleResult.victory) {
          checks.push(`层掉落: ${result.layerDrop ? `金${result.layerDrop.gold}/经${result.layerDrop.exp}` : '无'}`);
        }

        if (result.canContinue) {
          checks.push(`可继续: 下一层=${state.currentLayer}`);
        } else {
          checks.push(`不可继续: isLastLayer=${result.isLastLayer}`);
        }
      }

      // 验证事件
      if (this._eventFlags.battleResolved < 1) { pass = false; checks.push('battleResolved 事件未触发'); }

      // 清理
      this._dungeonGameplay.abandonRun(TEST_DUNGEON_NORMAL);

      // 恢复默认配置
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 1.0,
        guaranteedWinRatio: 1.5,
      });

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 4, name: '单层推进', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 4, name: '单层推进', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 05: 完整 Run 通关 ====================

  private _test05FullRunCompletion(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 05: 完整 Run 通关`);
    this._resetEventFlags();

    try {
      const checks: string[] = [];
      let pass = true;

      // 配置确保每层必胜
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 0.3,
        guaranteedWinRatio: 0.5,
        randomVariance: 0.01,
      });

      // 开始 run
      const state = this._dungeonGameplay.startRun(TEST_DUNGEON_NORMAL, TEST_PLAYER_ID);
      if (!state) {
        return { id: 5, name: '完整 Run 通关', pass: false, detail: 'startRun 失败' };
      }

      const totalLayers = state.totalLayers;
      let layerCount = 0;

      // 逐层推进
      while (this._dungeonGameplay.hasActiveRun(TEST_DUNGEON_NORMAL)) {
        const result = this._dungeonGameplay.advanceLayer(TEST_DUNGEON_NORMAL);
        if (!result) break;

        layerCount++;
        if (!result.canContinue) break;
      }

      checks.push(`推进了 ${layerCount}/${totalLayers} 层`);

      // 验证状态
      const finalState = this._dungeonGameplay.getRunState(TEST_DUNGEON_NORMAL);
      if (finalState !== null) { pass = false; checks.push('run 应已被清除'); }
      else { checks.push('run 状态已清除'); }

      // 验证事件
      if (!this._eventFlags.runCompleted) { pass = false; checks.push('runCompleted 事件未触发'); }
      else { checks.push('runCompleted 事件已触发'); }

      if (this._eventFlags.runFailed) { pass = false; checks.push('不应触发 runFailed'); }

      checks.push(`battleResolved=${this._eventFlags.battleResolved}, layerCleared=${this._eventFlags.layerCleared}`);

      // 验证 DungeonSystem 中的运行历史
      const dungeonData = this._dungeonSystem.getPlayerDungeonData();
      const runHistory = dungeonData.runHistory.filter((r) => r.dungeonId === TEST_DUNGEON_NORMAL);
      checks.push(`DungeonSystem 历史记录: ${runHistory.length} 条`);

      // 恢复默认配置
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 1.0,
        guaranteedWinRatio: 1.5,
      });

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 5, name: '完整 Run 通关', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 5, name: '完整 Run 通关', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 06: Run 失败 ====================

  private _test06RunFailure(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 06: Run 失败`);
    this._resetEventFlags();

    try {
      const checks: string[] = [];
      let pass = true;

      // 配置确保必败
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 5.0,
        guaranteedLossRatio: 0.1,
        randomVariance: 0.01,
      });

      // 开始 run
      const state = this._dungeonGameplay.startRun(TEST_DUNGEON_NORMAL, TEST_PLAYER_ID);
      if (!state) {
        return { id: 6, name: 'Run 失败', pass: false, detail: 'startRun 失败' };
      }

      // 推进第一层（预期失败）
      const result = this._dungeonGameplay.advanceLayer(TEST_DUNGEON_NORMAL);

      if (!result) { pass = false; checks.push('advanceLayer 返回 null'); }
      if (result) {
        if (result.battleResult.victory) {
          pass = false;
          checks.push('高战力比下应失败但返回了胜利');
        } else {
          checks.push(`第1层战斗失败(预期): enemyPower=${result.battleResult.enemyPower}`);
        }

        if (result.canContinue) { pass = false; checks.push('失败后 canContinue 应为 false'); }
      }

      // 验证事件
      if (!this._eventFlags.runFailed) { pass = false; checks.push('runFailed 事件未触发'); }
      else { checks.push('runFailed 事件已触发'); }

      if (this._eventFlags.runCompleted) { pass = false; checks.push('不应触发 runCompleted'); }

      // 验证 run 已清除
      const finalState = this._dungeonGameplay.getRunState(TEST_DUNGEON_NORMAL);
      if (finalState !== null) { pass = false; checks.push('失败后 run 应被清除'); }

      // 验证 DungeonSystem 中记录了失败
      const dungeonData = this._dungeonSystem.getPlayerDungeonData();
      const failedRuns = dungeonData.runHistory.filter(
        (r) => r.dungeonId === TEST_DUNGEON_NORMAL && !r.isCleared,
      );
      checks.push(`失败历史记录: ${failedRuns.length} 条`);

      // 恢复默认配置
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 1.0,
        guaranteedWinRatio: 1.5,
      });

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 6, name: 'Run 失败', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 6, name: 'Run 失败', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 07: 战力配置自定义 ====================

  private _test07PowerConfigCustomization(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 07: 战力配置自定义`);

    try {
      const checks: string[] = [];
      let pass = true;

      // 保存原始配置
      const original = this._dungeonGameplay.getLayerPowerConfig();

      // 自定义配置
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 0.5,
        layerGrowthRate: 0.2,
        bossPowerMultiplier: 3.0,
        randomVariance: 0.05,
        guaranteedWinRatio: 2.0,
        guaranteedLossRatio: 0.3,
      });

      const custom = this._dungeonGameplay.getLayerPowerConfig();
      if (custom.baseEnemyPowerRatio !== 0.5) { pass = false; checks.push('baseEnemyPowerRatio 未更新'); }
      if (custom.layerGrowthRate !== 0.2) { pass = false; checks.push('layerGrowthRate 未更新'); }
      if (custom.bossPowerMultiplier !== 3.0) { pass = false; checks.push('bossPowerMultiplier 未更新'); }
      if (custom.randomVariance !== 0.05) { pass = false; checks.push('randomVariance 未更新'); }
      if (custom.guaranteedWinRatio !== 2.0) { pass = false; checks.push('guaranteedWinRatio 未更新'); }
      if (custom.guaranteedLossRatio !== 0.3) { pass = false; checks.push('guaranteedLossRatio 未更新'); }

      if (pass) checks.push('所有自定义配置值生效');

      // 部分更新
      this._dungeonGameplay.setLayerPowerConfig({ baseEnemyPowerRatio: 0.8 });
      const partial = this._dungeonGameplay.getLayerPowerConfig();
      if (partial.baseEnemyPowerRatio !== 0.8) { pass = false; checks.push('部分更新 baseEnemyPowerRatio 失败'); }
      if (partial.layerGrowthRate !== 0.2) { pass = false; checks.push('部分更新后 layerGrowthRate 被覆盖'); }
      if (pass) checks.push('部分配置更新不影响其他字段');

      // 恢复原始配置
      this._dungeonGameplay.setLayerPowerConfig(original);

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 7, name: '战力配置自定义', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 7, name: '战力配置自定义', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 08: 事件派发 ====================

  private _test08EventDispatch(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 08: 事件派发`);
    this._resetEventFlags();

    try {
      const checks: string[] = [];
      let pass = true;

      // 确保必胜
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 0.3,
        guaranteedWinRatio: 0.5,
        randomVariance: 0.01,
      });

      // 完整执行一次：开始 → 通关
      this._dungeonGameplay.startRun(TEST_DUNGEON_HARD, TEST_PLAYER_ID);
      while (this._dungeonGameplay.hasActiveRun(TEST_DUNGEON_HARD)) {
        const result = this._dungeonGameplay.advanceLayer(TEST_DUNGEON_HARD);
        if (!result || !result.canContinue) break;
      }

      // 验证全部 6 类事件
      const eventChecks: [string, boolean, string][] = [
        ['runStarted', this._eventFlags.runStarted, 'dungeonGameplay:runStarted'],
        ['battleResolved', this._eventFlags.battleResolved > 0, `dungeonGameplay:battleResolved x${this._eventFlags.battleResolved}`],
        ['layerCleared', this._eventFlags.layerCleared > 0, `dungeonGameplay:layerCleared x${this._eventFlags.layerCleared}`],
        ['runCompleted', this._eventFlags.runCompleted, 'dungeonGameplay:runCompleted'],
      ];

      for (const [, ok, label] of eventChecks) {
        if (!ok) {
          pass = false;
          checks.push(`❌ ${label}`);
        } else {
          checks.push(`✅ ${label}`);
        }
      }

      // 恢复
      this._dungeonGameplay.setLayerPowerConfig({
        baseEnemyPowerRatio: 1.0,
        guaranteedWinRatio: 1.5,
      });

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 8, name: '事件派发', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 8, name: '事件派发', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 09: 边界测试 ====================

  private _test09EdgeCases(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 09: 边界测试`);

    const subResults: string[] = [];
    let allPassed = true;

    // 9.1 不存在地牢的 startRun
    const nullState = this._dungeonGameplay.startRun(9999);
    if (nullState !== null) {
      allPassed = false;
      subResults.push('❌ 9.1 不存在地牢的 startRun 应返回 null');
    } else {
      subResults.push('✅ 9.1 startRun(9999) 返回 null（正确）');
    }

    // 9.2 不存在地牢的 simulateLayerBattle
    try {
      const result = this._dungeonGameplay.simulateLayerBattle(9999, 1);
      // 即使地牢不存在也能模拟（使用默认配置）
      if (result.layerIndex !== 1) {
        allPassed = false;
        subResults.push('❌ 9.2 simulateLayerBattle 层级错误');
      } else {
        subResults.push('✅ 9.2 simulateLayerBattle(不存在地牢) 不崩溃');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 9.2 simulateLayerBattle 异常: ${e}`);
    }

    // 9.3 无活跃 run 的 advanceLayer
    const noRunResult = this._dungeonGameplay.advanceLayer(TEST_DUNGEON_EXPERT);
    if (noRunResult !== null) {
      allPassed = false;
      subResults.push('❌ 9.3 无活跃 run 的 advanceLayer 应返回 null');
    } else {
      subResults.push('✅ 9.3 advanceLayer(无run) 返回 null（正确）');
    }

    // 9.4 无活跃 run 的 completeRun
    const noRunComplete = this._dungeonGameplay.completeRun(TEST_DUNGEON_EXPERT);
    if (noRunComplete !== null) {
      allPassed = false;
      subResults.push('❌ 9.4 无活跃 run 的 completeRun 应返回 null');
    } else {
      subResults.push('✅ 9.4 completeRun(无run) 返回 null（正确）');
    }

    // 9.5 abandonRun 清除状态
    this._dungeonGameplay.startRun(TEST_DUNGEON_EXPERT, TEST_PLAYER_ID);
    this._dungeonGameplay.abandonRun(TEST_DUNGEON_EXPERT);
    const afterAbandon = this._dungeonGameplay.getRunState(TEST_DUNGEON_EXPERT);
    if (afterAbandon !== null) {
      allPassed = false;
      subResults.push('❌ 9.5 abandonRun 后状态未清除');
    } else {
      subResults.push('✅ 9.5 abandonRun 正确清除状态');
    }

    // 9.6 getAllActiveRuns
    const allRuns = this._dungeonGameplay.getAllActiveRuns();
    if (allRuns.length !== 0) {
      allPassed = false;
      subResults.push(`❌ 9.6 getAllActiveRuns 应返回空数组: ${allRuns.length}`);
    } else {
      subResults.push('✅ 9.6 getAllActiveRuns 返回空数组（正确）');
    }

    // 9.7 hasActiveRun
    if (this._dungeonGameplay.hasActiveRun(TEST_DUNGEON_NORMAL)) {
      allPassed = false;
      subResults.push('❌ 9.7 hasActiveRun 应返回 false');
    } else {
      subResults.push('✅ 9.7 hasActiveRun 返回 false（正确）');
    }

    // 9.8 clearAllRuns 幂等性
    this._dungeonGameplay.clearAllRuns();
    this._dungeonGameplay.clearAllRuns(); // 不应崩溃
    subResults.push('✅ 9.8 clearAllRuns 幂等调用不崩溃');

    // 9.9 failRun 无活跃 run 的情况
    const failNoRun = this._dungeonGameplay.failRun(TEST_DUNGEON_EXPERT, '测试');
    // failRun 会尝试调用 DungeonSystem.failDungeon，可能返回 null 或部分奖励
    subResults.push('✅ 9.9 failRun(无run) 不崩溃');

    const detail = subResults.join('; ');
    console.log(`${TAG}   → ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    for (const s of subResults) {
      console.log(`${TAG}      ${s}`);
    }
    return { id: 9, name: '边界测试', pass: allPassed, detail };
  }

  // ==================== 输出 ====================

  private _allPassed(): boolean {
    return this._results.every((r) => r.pass);
  }

  private _printSummary(allPassed: boolean): void {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} 测试结果汇总:`);
    console.log(`${TAG} ${'─'.repeat(50)}`);
    console.log(`${TAG} | ${'#'.padEnd(3)} | ${'Test Name'.padEnd(28)} | Result |`);
    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(30)}|${'─'.repeat(8)}|`);

    for (const r of this._results) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`${TAG} | ${String(r.id).padEnd(3)} | ${r.name.padEnd(28)} | ${status.padEnd(6)} |`);
    }

    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(30)}|${'─'.repeat(8)}|`);
    const passCount = this._results.filter((r) => r.pass).length;
    const failCount = this._results.filter((r) => !r.pass).length;
    console.log(`${TAG} |     | 合计: ${passCount}/${this._results.length} PASS, ${failCount} FAIL    |`);
    console.log(`${TAG} ${SEP}`);

    if (allPassed) {
      console.log(`${TAG} ========== Phase6-Step6 DungeonGameplay 集成测试全部通过 ✅ ==========`);
    } else {
      console.log(`${TAG} ========== Phase6-Step6 DungeonGameplay 集成测试未通过 ❌ ==========`);
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

    const pairs: [string, ((...args: unknown[]) => void) | null][] = [
      [DungeonGameplay.RUN_STARTED, this._onRunStarted],
      [DungeonGameplay.BATTLE_RESOLVED, this._onBattleResolved],
      [DungeonGameplay.LAYER_CLEARED, this._onLayerCleared],
      [DungeonGameplay.LAYER_FAILED, this._onLayerFailed],
      [DungeonGameplay.RUN_COMPLETED, this._onRunCompleted],
      [DungeonGameplay.RUN_FAILED, this._onRunFailed],
    ];

    for (const [event, callback] of pairs) {
      if (callback) {
        this._eventManager.off(event, callback, this);
      }
    }

    this._onRunStarted = null;
    this._onBattleResolved = null;
    this._onLayerCleared = null;
    this._onLayerFailed = null;
    this._onRunCompleted = null;
    this._onRunFailed = null;
  }
}
