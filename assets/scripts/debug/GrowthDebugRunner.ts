// ============================================================
// GrowthDebugRunner.ts — Phase4A 成长闭环验证工具
// 职责：独立验证 ProgressSystem -> PowerSystem -> SaveManager 链路
// 约束：不接入战斗 / 不实现装备 / 不实现 UI / 不修改 Phase3 验收逻辑
// ============================================================

import { Component, _decorator } from 'cc';
import { EventManager } from '../core/EventManager';
import { ProgressSystem } from '../systems/ProgressSystem';
import type {
  AddHeroExpResult,
  HeroLevelUpEventData,
  HeroPowerChangedEventData,
  TotalPowerChangedEventData,
} from '../systems/ProgressSystem';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import type { GrowthSaveData } from '../save/GrowthSaveData';
import type { HeroProgressData } from '../data/hero_progress_data';
import type { PlayerProgressData } from '../data/player_progress_data';

const { ccclass } = _decorator;

const TAG = '[GrowthTest]';
const SEP = '='.repeat(50);
const SEP_MIN = '-'.repeat(50);
const TEST_HERO_ID = 'CARD_301';
const TEST_EXP_GAIN = 84;

interface GrowthSnapshot {
  level: number;
  exp: number;
  power: number;
  totalPower: number;
}

@ccclass('GrowthDebugRunner')
export class GrowthDebugRunner extends Component {
  private _eventManager: EventManager;
  private _progressSystem: ProgressSystem;
  private _saveManager: SaveManager;

  private _originalGrowthData: GrowthSaveData | null = null;
  private _expEventReceived = false;
  private _levelUpEventReceived = false;
  private _powerChangedEventReceived = false;
  private _totalPowerChangedEventReceived = false;

  private _onLevelUp: ((...args: unknown[]) => void) | null = null;
  private _onPowerChanged: ((...args: unknown[]) => void) | null = null;
  private _onTotalPowerChanged: ((...args: unknown[]) => void) | null = null;
  private _onExpGained: ((...args: unknown[]) => void) | null = null;

  onLoad(): void {
    console.log('[GrowthDebugRunner] onLoad');
  }

  onEnable(): void {
    console.log('[GrowthDebugRunner] onEnable');
  }

  start(): void {
    console.log('[GrowthDebugRunner] start');

    this._eventManager = EventManager.getInstance();
    this._progressSystem = ProgressSystem.getInstance();
    this._saveManager = SaveManager.getInstance();

    this._run()
      .catch((err: unknown) => {
        console.error(`${TAG} 成长闭环验证异常`, err);
        console.log(`${TAG} ========== Phase4A 成长闭环验证未通过 ❌ ==========`);
      });
  }

  onDestroy(): void {
    this._cleanupListeners();
  }

  private async _run(): Promise<void> {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} Phase4A 成长闭环测试开始`);
    console.log(`${TAG} 测试角色: ${TEST_HERO_ID}`);
    console.log(`${TAG} 测试经验: +${TEST_EXP_GAIN}`);
    console.log(`${TAG} ${SEP_MIN}`);

    this._initializeSaveManager();
    this._registerListeners();

    await this._loadGrowthConfigs();

    this._originalGrowthData = this._saveManager.loadGrowthData();

    const before = this._initializeTestHero();
    this._logSnapshot('旧数据', before);

    const result = this._progressSystem.addHeroExp(TEST_HERO_ID, TEST_EXP_GAIN);
    const after = this._createSnapshot(result);
    this._logSnapshot('新数据', after);

    const saveOk = this._saveManager.save();
    const loadedContainer = this._saveManager.load();
    const restoredHero = this._saveManager.loadHeroProgressData(TEST_HERO_ID);
    const restoredPlayer = this._saveManager.loadPlayerProgressData();

    this._printVerification(result, before, after, saveOk, !!loadedContainer, restoredHero, restoredPlayer);
    this._restoreOriginalGrowthData();
    this._cleanupListeners();
  }

  private _initializeSaveManager(): void {
    const hasSave = this._saveManager.init(new LocalStorageAdapter());
    console.log(`${TAG} SaveManager 初始化完成, hasSave=${hasSave}`);
  }

  private async _loadGrowthConfigs(): Promise<void> {
    await this._progressSystem.loadConfig();
    console.log(`${TAG} level_config 加载完成`);
    console.log(`${TAG} power_config 加载完成`);
  }

  private _initializeTestHero(): GrowthSnapshot {
    const testHero: HeroProgressData = {
      heroId: TEST_HERO_ID,
      level: 1,
      exp: 0,
      power: 0,
    };
    const testPlayerProgress: PlayerProgressData = {
      playerLevel: 1,
      playerExp: 0,
      totalPower: 0,
      highestStageId: 'STAGE_001',
      lastGrowthAt: 0,
    };

    this._progressSystem.clearProgress();
    this._progressSystem.setHeroProgress(testHero);
    this._progressSystem.setPlayerProgressData(testPlayerProgress);

    return {
      level: testHero.level,
      exp: testHero.exp,
      power: testHero.power,
      totalPower: testPlayerProgress.totalPower,
    };
  }

  private _createSnapshot(result: AddHeroExpResult): GrowthSnapshot {
    return {
      level: result.newLevel,
      exp: result.currentExp,
      power: result.newPower,
      totalPower: result.newTotalPower,
    };
  }

  private _registerListeners(): void {
    this._onExpGained = (): void => {
      this._expEventReceived = true;
    };
    this._eventManager.on(ProgressSystem.HERO_EXP_GAINED, this._onExpGained, this);

    this._onLevelUp = (...args: unknown[]): void => {
      const data = args[0] as HeroLevelUpEventData | undefined;
      if (data?.heroId === TEST_HERO_ID) {
        this._levelUpEventReceived = true;
        console.log(`${TAG} 角色升级: ${data.heroId} Lv.${data.oldLevel} -> Lv.${data.newLevel}`);
      }
    };
    this._eventManager.on(ProgressSystem.HERO_LEVEL_UP, this._onLevelUp, this);

    this._onPowerChanged = (...args: unknown[]): void => {
      const data = args[0] as HeroPowerChangedEventData | undefined;
      if (data?.heroId === TEST_HERO_ID) {
        this._powerChangedEventReceived = true;
        console.log(`${TAG} 单体战力提升: ${data.heroId} ${data.oldPower} -> ${data.newPower} (+${data.powerDelta})`);
      }
    };
    this._eventManager.on(ProgressSystem.HERO_POWER_CHANGED, this._onPowerChanged, this);

    this._onTotalPowerChanged = (...args: unknown[]): void => {
      const data = args[0] as TotalPowerChangedEventData | undefined;
      if (data) {
        this._totalPowerChangedEventReceived = true;
        console.log(`${TAG} 阵容战力提升: ${data.oldTotalPower} -> ${data.newTotalPower} (+${data.powerDelta})`);
      }
    };
    this._eventManager.on(ProgressSystem.TOTAL_POWER_CHANGED, this._onTotalPowerChanged, this);
  }

  private _printVerification(
    result: AddHeroExpResult,
    before: GrowthSnapshot,
    after: GrowthSnapshot,
    saveOk: boolean,
    loadOk: boolean,
    restoredHero: HeroProgressData | null,
    restoredPlayer: PlayerProgressData | null,
  ): void {
    const checks: { label: string; pass: boolean }[] = [
      { label: 'SaveManager 初始化完成', pass: this._saveManager.getData() !== null },
      { label: 'level_config / power_config 加载完成', pass: this._progressSystem.isConfigLoaded() },
      { label: '测试角色初始化完成', pass: before.level === 1 && before.exp === 0 && before.power === 0 },
      { label: `调用 addHeroExp(${TEST_HERO_ID}, ${TEST_EXP_GAIN})`, pass: result.expGain === TEST_EXP_GAIN },
      { label: '经验写入 HeroProgressData', pass: after.exp > before.exp },
      { label: 'HERO_EXP_GAINED 事件已触发', pass: this._expEventReceived },
      { label: '角色升级', pass: after.level > before.level },
      { label: 'HERO_LEVEL_UP 事件已触发', pass: this._levelUpEventReceived },
      { label: '单角色战力提升', pass: after.power > before.power },
      { label: 'HERO_POWER_CHANGED 事件已触发', pass: this._powerChangedEventReceived },
      { label: 'totalPower 更新', pass: after.totalPower > before.totalPower },
      { label: 'TOTAL_POWER_CHANGED 事件已触发', pass: this._totalPowerChangedEventReceived },
      { label: 'SaveManager 写入成功', pass: saveOk },
      { label: 'SaveManager 读取成功', pass: loadOk },
      { label: '读取恢复角色等级', pass: restoredHero?.level === after.level },
      { label: '读取恢复角色经验', pass: restoredHero?.exp === after.exp },
      { label: '读取恢复单角色战力', pass: restoredHero?.power === after.power },
      { label: '读取恢复 totalPower', pass: restoredPlayer?.totalPower === after.totalPower },
      { label: '读取恢复 highestStageId', pass: restoredPlayer?.highestStageId === 'STAGE_001' },
      { label: '读取恢复 lastGrowthAt', pass: (restoredPlayer?.lastGrowthAt ?? 0) > 0 },
    ];

    let allPassed = true;
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} 验收检查:`);
    for (const check of checks) {
      const icon = check.pass ? '✅' : '❌';
      if (!check.pass) {
        allPassed = false;
      }
      console.log(`${TAG}   ${icon} ${check.label}`);
    }
    console.log(`${TAG} ${SEP_MIN}`);

    if (allPassed) {
      console.log(`${TAG} ========== Phase4A 成长闭环验证通过 ==========`);
    } else {
      console.log(`${TAG} ========== Phase4A 成长闭环验证未通过 ❌ ==========`);
    }
    console.log(`${TAG} ${SEP}`);
  }

  private _restoreOriginalGrowthData(): void {
    if (!this._originalGrowthData) {
      return;
    }

    this._saveManager.saveGrowthData(this._originalGrowthData);
    this._saveManager.save();
    console.log(`${TAG} 已恢复测试前成长存档`);
  }

  private _logSnapshot(label: string, snapshot: GrowthSnapshot): void {
    console.log(
      `${TAG} ${label}: level=${snapshot.level}, exp=${snapshot.exp}, ` +
      `power=${snapshot.power}, totalPower=${snapshot.totalPower}`,
    );
  }

  private _cleanupListeners(): void {
    if (!this._eventManager) {
      return;
    }

    if (this._onExpGained) {
      this._eventManager.off(ProgressSystem.HERO_EXP_GAINED, this._onExpGained, this);
      this._onExpGained = null;
    }
    if (this._onLevelUp) {
      this._eventManager.off(ProgressSystem.HERO_LEVEL_UP, this._onLevelUp, this);
      this._onLevelUp = null;
    }
    if (this._onPowerChanged) {
      this._eventManager.off(ProgressSystem.HERO_POWER_CHANGED, this._onPowerChanged, this);
      this._onPowerChanged = null;
    }
    if (this._onTotalPowerChanged) {
      this._eventManager.off(ProgressSystem.TOTAL_POWER_CHANGED, this._onTotalPowerChanged, this);
      this._onTotalPowerChanged = null;
    }
  }
}
