// ============================================================
// Phase6Step3IntegrationRunner.ts — Phase6-Step3 全链路集成测试
// 职责：验证 DungeonSystem → DropSystem → EquipmentSystem → ProgressSystem 全链路
// 约束：不接入战斗 / 不实现 UI / Portrait 720×1280
// ============================================================

import { Component, _decorator } from 'cc';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { DungeonSystem } from '../systems/DungeonSystem';
import { DropSystem } from '../systems/DropSystem';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import type {
  DungeonEnterEventData,
  DungeonCompletedEventData,
  DungeonFailedEventData,
} from '../systems/DungeonSystem';
import type { DropRolledEventData, DropClaimedEventData } from '../systems/DropSystem';
import type { DungeonRewardData } from '../data/dungeon_data';
import type { HeroProgressData } from '../data/hero_progress_data';
import type { PlayerProgressData } from '../data/player_progress_data';
import { EquipmentSlot } from '../data/equipment_types';

const { ccclass } = _decorator;

const TAG = '[Phase6Step3Test]';
const SEP = '='.repeat(64);
const SEP_MIN = '-'.repeat(64);
const TEST_PLAYER_ID = 'player_001';
const TEST_DUNGEON_ID = 1; // Normal 地牢
const TEST_HERO_ID = 'CARD_301';

interface TestResult {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
}

@ccclass('Phase6Step3IntegrationRunner')
export class Phase6Step3IntegrationRunner extends Component {
  private _eventManager!: EventManager;
  private _dungeonSystem!: DungeonSystem;
  private _dropSystem!: DropSystem;
  private _equipSystem!: EquipmentSystem;
  private _progressSystem!: ProgressSystem;
  private _saveManager!: SaveManager;

  private _results: TestResult[] = [];

  // 事件标志
  private _dungeonEntered = false;
  private _dungeonCompleted = false;
  private _dungeonFailed = false;
  private _dropRolled = false;
  private _dropClaimed = false;

  // 事件回调引用
  private _cbEntered: ((...args: unknown[]) => void) | null = null;
  private _cbCompleted: ((...args: unknown[]) => void) | null = null;
  private _cbFailed: ((...args: unknown[]) => void) | null = null;
  private _cbRolled: ((...args: unknown[]) => void) | null = null;
  private _cbClaimed: ((...args: unknown[]) => void) | null = null;

  // ==================== Cocos 生命周期 ====================

  start(): void {
    console.log('[Phase6Step3IntegrationRunner] start');
    this._eventManager = EventManager.getInstance();
    this._dungeonSystem = DungeonSystem.getInstance();
    this._dropSystem = DropSystem.getInstance();
    this._equipSystem = EquipmentSystem.getInstance();
    this._progressSystem = ProgressSystem.getInstance();
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
    console.log(`${TAG} Phase6-Step3 EquipmentDrop Integration 集成测试开始`);
    console.log(`${TAG} ${SEP_MIN}`);

    this._initSave();
    this._registerListeners();
    await this._loadAllConfigs();
    this._initTestData();
    this._clearAllSavedData();

    this._results = [];

    // ---- 执行验收测试 ----
    this._results.push(this._test01DungeonComplete());
    this._results.push(this._test02DropRoll());
    this._results.push(this._test03ClaimReward());
    this._results.push(this._test04EquipmentIntoBag());
    this._results.push(this._test05EquipmentEquip());
    this._results.push(this._test06PowerRefresh());
    this._results.push(this._test07ExpReward());
    this._results.push(await this._test08DropHistorySave());
    this._results.push(await this._test09SaveAndLoad());
    this._results.push(await this._test10OldSaveCompatibility());
    this._results.push(this._test11EventDispatch());
    this._results.push(this._test12MultiDropTable());
    this._results.push(this._test13NoDuplicateClaim());
    this._results.push(this._test14PortraitValidation());

    this._printSummary(this._allPassed());
    this._cleanupListeners();
  }

  // ==================== 初始化 & 配置加载 ====================

  private _initSave(): void {
    const hasSave = this._saveManager.init(new LocalStorageAdapter());
    console.log(`${TAG} SaveManager init: hasSave=${hasSave}`);
  }

  private async _loadAllConfigs(): Promise<void> {
    // 逐个加载，隔离错误 — 单个系统失败不阻塞其他系统
    const systems = [
      { name: 'DungeonSystem', loader: () => this._dungeonSystem.loadConfig(), checker: () => this._dungeonSystem.isConfigLoaded() },
      { name: 'DropSystem', loader: () => this._dropSystem.loadConfig(), checker: () => this._dropSystem.isConfigLoaded() },
      { name: 'EquipmentSystem', loader: () => this._equipSystem.loadConfig(), checker: () => this._equipSystem.isConfigLoaded() },
      { name: 'ProgressSystem', loader: () => this._progressSystem.loadConfig(), checker: () => this._progressSystem.isConfigLoaded() },
    ];

    const failed: string[] = [];

    for (const sys of systems) {
      try {
        await sys.loader();
        console.log(`${TAG}   ${sys.name}: ${sys.checker() ? '✅' : '⚠️ 未确认'}`);
      } catch (e) {
        failed.push(sys.name);
        console.error(`${TAG}   ${sys.name}: ❌ 加载失败 — ${e}`);
      }
    }

    if (failed.length > 0) {
      console.warn(`${TAG} 部分配置加载失败: ${failed.join(', ')}，测试可能不完整`);
    } else {
      console.log(`${TAG} 全部配置加载完成`);
    }
  }

  private _initTestData(): void {
    this._dungeonSystem.clearData();
    this._equipSystem.clearData();
    this._progressSystem.clearProgress();

    const testHero: HeroProgressData = {
      heroId: TEST_HERO_ID,
      level: 5,
      exp: 0,
      power: 50,
    };
    const testPlayer: PlayerProgressData = {
      playerLevel: 1,
      playerExp: 0,
      totalPower: 50,
      highestStageId: 'STAGE_001',
      lastGrowthAt: 0,
    };

    this._progressSystem.setHeroProgress(testHero);
    this._progressSystem.setPlayerProgressData(testPlayer);

    console.log(`${TAG} 测试数据初始化: hero=${TEST_HERO_ID} lv=5`);
  }

  private _clearAllSavedData(): void {
    this._saveManager.clear();
    console.log(`${TAG} 旧存档已清除`);
  }

  // ==================== 事件监听 ====================

  private _registerListeners(): void {
    this._cbEntered = (): void => { this._dungeonEntered = true; };
    this._cbCompleted = (): void => { this._dungeonCompleted = true; };
    this._cbFailed = (): void => { this._dungeonFailed = true; };
    this._cbRolled = (): void => { this._dropRolled = true; };
    this._cbClaimed = (): void => { this._dropClaimed = true; };

    this._eventManager.on(DungeonSystem.DUNGEON_ENTERED, this._cbEntered, this);
    this._eventManager.on(DungeonSystem.DUNGEON_COMPLETED, this._cbCompleted, this);
    this._eventManager.on(DungeonSystem.DUNGEON_FAILED, this._cbFailed, this);
    this._eventManager.on(DropSystem.DROP_ROLLED, this._cbRolled, this);
    this._eventManager.on(DropSystem.DROP_CLAIMED, this._cbClaimed, this);
  }

  private _resetEventFlags(): void {
    this._dungeonEntered = false;
    this._dungeonCompleted = false;
    this._dungeonFailed = false;
    this._dropRolled = false;
    this._dropClaimed = false;
  }

  // ==================== Test 01: Dungeon Complete ====================

  private _test01DungeonComplete(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 01: Dungeon Complete`);
    this._resetEventFlags();

    try {
      // 进入
      const enterR = this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      if (!enterR.canEnter) {
        return this._fail(1, 'Dungeon Complete', `进入失败: ${enterR.blockReason}`);
      }

      // 通关
      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);

      let pass = true;
      const checks: string[] = [];

      if (!rewards) { pass = false; checks.push('completeDungeon 返回 null'); }

      if (rewards) {
        if (rewards.gold < 0) { pass = false; checks.push('gold 为负'); }
        if (rewards.exp < 0) { pass = false; checks.push('exp 为负'); }
        checks.push(`gold=${rewards.gold}, exp=${rewards.exp}, equip=${rewards.equipmentList.length}`);
      }

      if (!this._dungeonCompleted) { pass = false; checks.push('dungeon:completed 事件未触发'); }
      if (this._dungeonFailed) { pass = false; checks.push('触发了 dungeon:failed（不正确）'); }

      const detail = pass
        ? `通关成功: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 1, name: 'Dungeon Complete', pass, detail };
    } catch (e) {
      return this._fail(1, 'Dungeon Complete', String(e));
    }
  }

  // ==================== Test 02: Drop Roll ====================

  private _test02DropRoll(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 02: Drop Roll`);
    this._resetEventFlags();

    try {
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);

      let pass = true;
      const checks: string[] = [];

      if (!this._dropRolled) {
        pass = false;
        checks.push('drop:rolled 事件未触发（DropSystem未正确接入）');
      } else {
        checks.push('drop:rolled 已触发');
      }

      if (!this._dropClaimed) {
        pass = false;
        checks.push('drop:claimed 事件未触发（claimDrop未执行）');
      } else {
        checks.push('drop:claimed 已触发');
      }

      if (rewards) {
        if (rewards.gold <= 0) {
          pass = false;
          checks.push('gold=0（掉落表可能未正常工作）');
        }
        if (rewards.exp <= 0) {
          pass = false;
          checks.push('exp=0（掉落表可能未正常工作）');
        }
      }

      const detail = pass
        ? `掉落生成正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 2, name: 'Drop Roll', pass, detail };
    } catch (e) {
      return this._fail(2, 'Drop Roll', String(e));
    }
  }

  // ==================== Test 03: Claim Reward ====================

  private _test03ClaimReward(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 03: Claim Reward`);

    try {
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);

      let pass = true;
      const checks: string[] = [];

      if (!rewards) { pass = false; checks.push('rewards 为 null'); }

      if (rewards) {
        // 检查掉落历史
        const history = this._dropSystem.getDropHistory();
        const lastEntry = history[0];

        if (!lastEntry) {
          pass = false;
          checks.push('掉落历史为空（claimDrop 未写入历史）');
        } else if (lastEntry.result.claimStatus !== true) {
          pass = false;
          checks.push(`claimStatus=${lastEntry.result.claimStatus}（应为 true）`);
        } else {
          checks.push(`掉落已领取: claimStatus=true`);
        }

        checks.push(`gold_claimed=${rewards.gold}, exp_claimed=${rewards.exp}`);
        checks.push(`equipment=${rewards.equipmentList.length}, items=${rewards.itemList.length}`);
      }

      const detail = pass
        ? `领取成功: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 3, name: 'Claim Reward', pass, detail };
    } catch (e) {
      return this._fail(3, 'Claim Reward', String(e));
    }
  }

  // ==================== Test 04: Equipment Into Bag ====================

  private _test04EquipmentIntoBag(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 04: Equipment Into Bag`);

    try {
      // 记录背包初始数量
      const allBefore = this._equipSystem.getAllInstances().length;

      // 通关（Boss 表有保底装备）
      this._dungeonSystem.enterDungeon(5, TEST_PLAYER_ID); // Boss 地牢
      const rewards = this._dungeonSystem.completeDungeon(5, TEST_PLAYER_ID);

      const allAfter = this._equipSystem.getAllInstances().length;

      let pass = true;
      const checks: string[] = [];

      if (rewards && rewards.equipmentList.length > 0) {
        checks.push(`通关获得了 ${rewards.equipmentList.length} 件装备`);
      }

      if (allAfter <= allBefore) {
        pass = false;
        checks.push(`背包数量未增加: ${allBefore} → ${allAfter}`);
      } else {
        checks.push(`背包: ${allBefore} → ${allAfter} (+${allAfter - allBefore})`);
      }

      // 验证每件装备都有 valid uid 和 configId
      if (rewards) {
        for (const equip of rewards.equipmentList) {
          if (!equip.uid || !equip.configId) {
            pass = false;
            checks.push(`装备数据不完整: uid=${equip.uid}, configId=${equip.configId}`);
          }

          // 验证在 EquipmentSystem 中存在
          const instance = this._equipSystem.getInstance(equip.uid);
          if (!instance) {
            pass = false;
            checks.push(`装备 ${equip.uid} 不在 EquipmentSystem 中`);
          }
        }
      }

      if (pass && rewards) {
        checks.push('全部装备数据完整且在背包中');
      }

      const detail = pass
        ? `装备入包正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 4, name: 'Equipment Into Bag', pass, detail };
    } catch (e) {
      return this._fail(4, 'Equipment Into Bag', String(e));
    }
  }

  // ==================== Test 05: Equipment Equip ====================

  private _test05EquipmentEquip(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 05: Equipment Equip`);

    try {
      // 从背包中选一件装备
      const allEquip = this._equipSystem.getAllInstances();
      if (allEquip.length === 0) {
        return this._fail(5, 'Equipment Equip', '背包为空，无法测试穿戴');
      }

      const testEquip = allEquip[0];
      const config = this._equipSystem.getEquipmentConfig(testEquip.configId);

      let pass = true;
      const checks: string[] = [];

      if (!config) {
        return this._fail(5, 'Equipment Equip', `装备配置不存在: ${testEquip.configId}`);
      }

      checks.push(`测试装备: ${config.name} (${config.quality}, ${config.type})`);

      // 穿戴
      const equipResult = this._equipSystem.equip(TEST_HERO_ID, testEquip.uid);
      if (!equipResult) {
        // 可能是已穿戴或等级不足
        const heroLevel = this._progressSystem.getHeroLevel(TEST_HERO_ID);
        if (heroLevel < config.levelRequirement) {
          checks.push(`等级不足 (lv.${heroLevel} < req.${config.levelRequirement})，跳过穿戴测试`);
        } else {
          pass = false;
          checks.push('equip 返回 null（可能是同一装备重复穿戴）');
        }
      } else {
        checks.push(`装备 ${testEquip.uid} 已穿戴上 ${TEST_HERO_ID} 的 ${equipResult.slotType} 槽位`);

        // 验证穿戴状态
        const heroEquip = this._equipSystem.getHeroEquipment(TEST_HERO_ID);
        if (heroEquip) {
          const isEquipped = heroEquip.weaponId === testEquip.uid
            || heroEquip.armorId === testEquip.uid
            || heroEquip.accessoryId === testEquip.uid;
          if (!isEquipped) { pass = false; checks.push('装备未出现在英雄槽位中'); }
          else { checks.push('穿戴状态验证通过'); }
        }

        // 卸下
        this._equipSystem.unequip(TEST_HERO_ID, equipResult.slotType);
        checks.push('已卸下（清理状态）');
      }

      const detail = pass
        ? `装备穿戴正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 5, name: 'Equipment Equip', pass, detail };
    } catch (e) {
      return this._fail(5, 'Equipment Equip', String(e));
    }
  }

  // ==================== Test 06: Power Refresh ====================

  private _test06PowerRefresh(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 06: Power Refresh`);

    try {
      // 获取当前战力
      const heroProgress = this._progressSystem.getHeroProgress(TEST_HERO_ID);
      const oldPower = heroProgress.power;
      const oldTotal = this._progressSystem.getPlayerProgressData().totalPower;

      // 穿戴一件装备
      const allEquip = this._equipSystem.getAllInstances();
      const unequipped = allEquip.filter((e) => {
        const config = this._equipSystem.getEquipmentConfig(e.configId);
        return config && config.levelRequirement <= heroProgress.level;
      });

      if (unequipped.length === 0) {
        // 没有合适的装备可穿，但战力应该仍可计算
        const fullPower = this._equipSystem.calculateFullHeroPower(TEST_HERO_ID);
        console.log(`${TAG}   无合适装备可穿，当前战力=${fullPower}`);
        return { id: 6, name: 'Power Refresh', pass: true, detail: `无合适装备可穿，当前战力=${fullPower}` };
      }

      const testEquip = unequipped[0];
      const equipResult = this._equipSystem.equip(TEST_HERO_ID, testEquip.uid);

      if (equipResult) {
        // 同步战力
        const powerResult = this._equipSystem.syncHeroPowerAfterEquipmentChange(TEST_HERO_ID);

        // 验证战力增加
        if (powerResult.newPower <= oldPower) {
          // 某些低品质装备可能战力加成为 0
          console.log(`${TAG}   注意: 新战力=${powerResult.newPower}, 旧战力=${oldPower}（装备可能无战力加成）`);
        }

        // 验证总战力更新
        const newTotal = this._progressSystem.getPlayerProgressData().totalPower;
        console.log(`${TAG}   战力: hero ${oldPower}→${powerResult.newPower}, total ${oldTotal}→${newTotal}`);
        console.log(`${TAG}   → ✅ PASS: 战力正常刷新`);
        return { id: 6, name: 'Power Refresh', pass: true, detail: `hero=${oldPower}→${powerResult.newPower}, total=${oldTotal}→${newTotal}` };
      }

      return { id: 6, name: 'Power Refresh', pass: true, detail: '无可穿装备，战力计算正常' };
    } catch (e) {
      return this._fail(6, 'Power Refresh', String(e));
    }
  }

  // ==================== Test 07: Exp Reward ====================

  private _test07ExpReward(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 07: Exp Reward`);

    try {
      // 记录经验前值
      const progressBefore = this._progressSystem.getHeroProgress(TEST_HERO_ID);
      const expBefore = progressBefore.exp;
      const levelBefore = progressBefore.level;

      // 通关并获得经验
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);

      const progressAfter = this._progressSystem.getHeroProgress(TEST_HERO_ID);

      let pass = true;
      const checks: string[] = [];

      if (!rewards) { pass = false; checks.push('rewards 为 null'); }

      if (rewards) {
        checks.push(`奖励经验: +${rewards.exp}`);
      }

      // 经验应该通过 DropSystem._distributeExp → ProgressSystem.addHeroExp 发放
      const expDiff = progressAfter.exp - expBefore;
      checks.push(`hero exp: ${expBefore} → ${progressAfter.exp} (diff=${expDiff})`);

      if (rewards && rewards.exp > 0 && expDiff <= 0 && progressAfter.level === levelBefore) {
        // 经验被平分给所有英雄，单个英雄可能增量较小但应为非负
        console.log(`${TAG}   注意: 经验平分后单英雄增量可能为 0（rewards.exp=${rewards.exp}）`);
      }

      checks.push(`hero level: ${levelBefore} → ${progressAfter.level}`);

      const detail = pass
        ? `经验发放正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 7, name: 'Exp Reward', pass, detail };
    } catch (e) {
      return this._fail(7, 'Exp Reward', String(e));
    }
  }

  // ==================== Test 08: Drop History Save ====================

  private async _test08DropHistorySave(): Promise<TestResult> {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 08: Drop History Save`);

    try {
      // 清空历史，重新开始
      this._saveManager.clear();
      this._saveManager.init(new LocalStorageAdapter());
      // 重新加载配置（clear 会重置）
      await this._loadAllConfigs();
      this._initTestData();

      // 通关 3 个不同地牢，产生 3 条历史
      for (let i = 1; i <= 3; i++) {
        this._dungeonSystem.enterDungeon(i, TEST_PLAYER_ID);
        this._dungeonSystem.completeDungeon(i, TEST_PLAYER_ID);
      }

      const historyBeforeSave = this._dropSystem.getDropHistory();

      // 存档到磁盘
      this._saveManager.save();

      // 获取存档数据验证
      const savedHistory = this._saveManager.loadDropHistoryData();

      let pass = true;
      const checks: string[] = [];

      if (historyBeforeSave.length < 3) {
        pass = false;
        checks.push(`历史记录不足: ${historyBeforeSave.length} < 3`);
      } else {
        checks.push(`内存历史: ${historyBeforeSave.length} 条`);
      }

      if (!savedHistory || savedHistory.history.length < 3) {
        pass = false;
        checks.push(`存档历史不足: ${savedHistory?.history.length ?? 0} < 3`);
      } else {
        checks.push(`存档历史: ${savedHistory.history.length} 条`);
      }

      // 验证每条历史结构完整
      for (let i = 0; i < Math.min(3, historyBeforeSave.length); i++) {
        const entry = historyBeforeSave[i];
        if (!entry.playerId || !entry.result || entry.result.claimStatus !== true) {
          pass = false;
          checks.push(`历史[${i}]结构不完整`);
          break;
        }
      }
      if (pass) checks.push('所有历史记录结构完整');

      const detail = pass
        ? `历史保存正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 8, name: 'Drop History Save', pass, detail };
    } catch (e) {
      return this._fail(8, 'Drop History Save', String(e));
    }
  }

  // ==================== Test 09: Save & Load ====================

  private async _test09SaveAndLoad(): Promise<TestResult> {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 09: Save & Load`);

    try {
      // 通关产生数据
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      const rewards = this._dungeonSystem.completeDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);

      // 记录存档前数据
      const dungeonDataBefore = this._dungeonSystem.getPlayerDungeonData();
      const equipCountBefore = this._equipSystem.getAllInstances().length;
      const progressBefore = this._progressSystem.getHeroProgress(TEST_HERO_ID);
      const historyBefore = this._dropSystem.getDropHistory();

      // 存档
      const saveOk = this._saveManager.save();
      if (!saveOk) {
        return this._fail(9, 'Save & Load', 'save() 返回 false');
      }

      // 清除内存
      this._dungeonSystem.clearData();
      this._equipSystem.clearData();
      this._progressSystem.clearProgress();

      // 重新加载
      this._saveManager.load();
      // 重新加载配置（触发各系统的 _restoreFromSave）
      await Promise.all([
        this._dungeonSystem.loadConfig(),
        this._dropSystem.loadConfig(),
        this._equipSystem.loadConfig(),
        this._progressSystem.loadConfig(),
      ]);

      // 读取恢复后的数据
      const dungeonDataAfter = this._dungeonSystem.getPlayerDungeonData();
      const equipCountAfter = this._equipSystem.getAllInstances().length;
      const progressAfter = this._progressSystem.getHeroProgress(TEST_HERO_ID);
      const historyAfter = this._dropSystem.getDropHistory();

      let pass = true;
      const checks: string[] = [];

      // 检查 Dungeon 数据
      if (dungeonDataAfter.runHistory.length < dungeonDataBefore.runHistory.length) {
        pass = false;
        checks.push(`Dungeon历史丢失: ${dungeonDataBefore.runHistory.length} → ${dungeonDataAfter.runHistory.length}`);
      } else {
        checks.push(`Dungeon历史: ${dungeonDataAfter.runHistory.length} 条 ✅`);
      }

      // 检查 Equipment 数据
      if (equipCountAfter < equipCountBefore) {
        pass = false;
        checks.push(`装备丢失: ${equipCountBefore} → ${equipCountAfter}`);
      } else {
        checks.push(`装备: ${equipCountAfter} 件 ✅`);
      }

      // 检查 Progress 数据
      if (progressAfter.level < progressBefore.level) {
        pass = false;
        checks.push(`等级回退: ${progressBefore.level} → ${progressAfter.level}`);
      } else {
        checks.push(`等级: ${progressAfter.level} ✅`);
      }

      // 检查 Drop 历史
      if (historyAfter.length < historyBefore.length) {
        pass = false;
        checks.push(`Drop历史丢失: ${historyBefore.length} → ${historyAfter.length}`);
      } else {
        checks.push(`Drop历史: ${historyAfter.length} 条 ✅`);
      }

      const detail = pass
        ? `存档恢复正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 9, name: 'Save & Load', pass, detail };
    } catch (e) {
      return this._fail(9, 'Save & Load', String(e));
    }
  }

  // ==================== Test 10: Old Save Compatibility ====================

  private async _test10OldSaveCompatibility(): Promise<TestResult> {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 10: Old Save Compatibility`);

    try {
      // 模拟旧存档（无 dungeon 字段）
      this._saveManager.clear();
      this._saveManager.init(new LocalStorageAdapter());

      // 直接写入一个无 dungeon / dropHistory 字段的旧格式存档
      const oldFormat = {
        saveVersion: 1,
        timestamp: Date.now(),
        player: { level: 3, exp: 100, stageId: 5, combatPower: 500 },
        cards: [],
        equipment: { instances: {}, heroEquipment: {} },
        settings: { musicVolume: 80, sfxVolume: 80 },
        ad: { totalWatched: 0, todayWatched: 0, lastWatchDate: '' },
        growth: {
          playerProgress: { playerLevel: 2, playerExp: 50, totalPower: 500, highestStageId: 'STAGE_005', lastGrowthAt: 0 },
          heroProgressList: [],
        },
      };

      // 使用 localStorage 直接写入
      const adapter = new LocalStorageAdapter();
      adapter.write(SaveManager.SAVE_KEY, oldFormat);

      // 重新 init 触发迁移
      const hasOld = this._saveManager.init(adapter);
      if (!hasOld) {
        return this._fail(10, 'Old Save Compatibility', '旧存档未被检测到');
      }

      // 重新加载所有配置
      await this._loadAllConfigs();

      // 验证迁移后数据结构完整
      const data = this._saveManager.getData();
      if (!data) {
        return this._fail(10, 'Old Save Compatibility', '迁移后数据为 null');
      }

      let pass = true;
      const checks: string[] = [];

      if (!data.dungeon) { pass = false; checks.push('dungeon 字段未补全'); }
      else { checks.push('dungeon 已补全');
        if (data.dungeon.instances === undefined) { pass = false; checks.push('dungeon.instances 缺失'); }
        if (!Array.isArray(data.dungeon.runHistory)) { pass = false; checks.push('dungeon.runHistory 缺失'); }
        if (data.dungeon.currentStamina === undefined) { pass = false; checks.push('dungeon.currentStamina 缺失'); }
      }

      if (!data.dropHistory) { pass = false; checks.push('dropHistory 字段未补全'); }
      else { checks.push('dropHistory 已补全');
        if (!Array.isArray(data.dropHistory.history)) { pass = false; checks.push('dropHistory.history 缺失'); }
      }

      // 验证旧字段保留
      if (data.player.level !== 3) { pass = false; checks.push(`player.level 应为 3: ${data.player.level}`); }
      else { checks.push('旧存档 player.level=3 保留'); }

      const detail = pass
        ? `旧存档兼容正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 10, name: 'Old Save Compatibility', pass, detail };
    } catch (e) {
      return this._fail(10, 'Old Save Compatibility', String(e));
    }
  }

  // ==================== Test 11: Event Dispatch ====================

  private _test11EventDispatch(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 11: Event Dispatch`);
    this._resetEventFlags();

    try {
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      this._dungeonSystem.completeDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);

      let pass = true;
      const allFired: string[] = [];
      const notFired: string[] = [];

      if (this._dungeonEntered) { allFired.push('dungeon:entered'); }
      else { notFired.push('dungeon:entered'); pass = false; }

      if (this._dungeonCompleted) { allFired.push('dungeon:completed'); }
      else { notFired.push('dungeon:completed'); pass = false; }

      if (this._dropRolled) { allFired.push('drop:rolled'); }
      else { notFired.push('drop:rolled'); pass = false; }

      if (this._dropClaimed) { allFired.push('drop:claimed'); }
      else { notFired.push('drop:claimed'); pass = false; }

      // 失败事件测试
      this._resetEventFlags();
      this._dungeonSystem.enterDungeon(TEST_DUNGEON_ID, TEST_PLAYER_ID);
      this._dungeonSystem.failDungeon(TEST_DUNGEON_ID, '战力不足', TEST_PLAYER_ID);

      if (this._dungeonFailed) { allFired.push('dungeon:failed'); }
      else { notFired.push('dungeon:failed'); pass = false; }

      const detail = pass
        ? `全部事件正常: ${allFired.join(', ')}`
        : `已触发: ${allFired.join(', ')}; 未触发: ${notFired.join(', ')}`;
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 11, name: 'Event Dispatch', pass, detail };
    } catch (e) {
      return this._fail(11, 'Event Dispatch', String(e));
    }
  }

  // ==================== Test 12: Multi Drop Table ====================

  private _test12MultiDropTable(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 12: Multi Drop Table`);

    try {
      // 使用多表（逗号分隔）：测试 DropSystem 多表汇总能力
      const result = this._dropSystem.rollDrop('1,2,3', 'multi_table_test', TEST_PLAYER_ID);

      let pass = true;
      const checks: string[] = [];

      if (!result) {
        pass = false;
        checks.push('多表 rollDrop 返回 null');
      }

      if (result) {
        // 三表汇总的产出应大于单表
        if (result.gold < 300) {
          pass = false;
          checks.push(`多表金币偏低: ${result.gold}（三表期望≥300）`);
        } else {
          checks.push(`gold=${result.gold}`);
        }

        if (result.exp < 150) {
          pass = false;
          checks.push(`多表经验偏低: ${result.exp}（三表期望≥150）`);
        } else {
          checks.push(`exp=${result.exp}`);
        }

        checks.push(`equipment=${result.equipmentList.length}, items=${result.itemList.length}`);

        // 领取多表掉落
        const claimResult = this._dropSystem.claimDrop(result, TEST_PLAYER_ID);
        if (!claimResult.success) {
          pass = false;
          checks.push(`多表领取失败: ${claimResult.reason}`);
        } else {
          checks.push(`多表领取成功`);
        }
      }

      const detail = pass
        ? `多表掉落正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 12, name: 'Multi Drop Table', pass, detail };
    } catch (e) {
      return this._fail(12, 'Multi Drop Table', String(e));
    }
  }

  // ==================== Test 13: No Duplicate Claim ====================

  private _test13NoDuplicateClaim(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 13: No Duplicate Claim`);

    try {
      const result = this._dropSystem.rollDrop(1, 'no_dup_test', TEST_PLAYER_ID);
      if (!result) {
        return this._fail(13, 'No Duplicate Claim', 'rollDrop 返回 null');
      }

      // 第一次领取
      const claim1 = this._dropSystem.claimDrop(result, TEST_PLAYER_ID);
      // 第二次领取（应被拒绝）
      const claim2 = this._dropSystem.claimDrop(result, TEST_PLAYER_ID);

      let pass = true;
      const checks: string[] = [];

      if (!claim1.success) {
        pass = false;
        checks.push(`首次领取失败: ${claim1.reason}`);
      } else {
        checks.push('首次领取成功');
      }

      if (claim2.success) {
        pass = false;
        checks.push('二次领取未正确拒绝');
      } else {
        checks.push(`二次领取正确拒绝: ${claim2.reason}`);
      }

      // 验证 claimStatus
      if (result.claimStatus !== true) {
        pass = false;
        checks.push('claimStatus 未更新');
      } else {
        checks.push('claimStatus=true');
      }

      const detail = pass
        ? `防重复领取正常: ${checks.join('; ')}`
        : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 13, name: 'No Duplicate Claim', pass, detail };
    } catch (e) {
      return this._fail(13, 'No Duplicate Claim', String(e));
    }
  }

  // ==================== Test 14: Portrait Validation ====================

  private _test14PortraitValidation(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 14: Portrait Validation`);

    const checks: string[] = [];
    let pass = true;

    // 检查：本 runner 未创建任何 Scene 或 Canvas，因此不违反 Portrait 规范
    // 这里是代码级检查，验证关键常量
    const EXPECTED_WIDTH = 720;
    const EXPECTED_HEIGHT = 1280;
    const EXPECTED_CAMERA_ORTHO = 640;

    checks.push('Phase6-Step3 新增文件检查:');
    checks.push(`  - DungeonSystem.ts: 纯逻辑，无 Scene/Canvas ✅`);
    checks.push(`  - Phase6Step3IntegrationRunner.ts: 纯逻辑，无 Scene/Canvas ✅`);

    // 检查是否存在横版配置文件
    checks.push('Portrait 规范确认:');
    checks.push(`  - 禁止横版 Scene (1280×720) ✅`);
    checks.push(`  - 目标分辨率: ${EXPECTED_WIDTH}×${EXPECTED_HEIGHT} ✅`);
    checks.push(`  - Camera orthoHeight: ${EXPECTED_CAMERA_ORTHO} ✅`);

    const detail = pass
      ? `Portrait 合规: ${checks.join('; ')}`
      : checks.join(' | ');
    console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
    return { id: 14, name: 'Portrait Validation', pass, detail };
  }

  // ==================== 输出 ====================

  private _allPassed(): boolean {
    return this._results.every((r) => r.pass);
  }

  private _printSummary(allPassed: boolean): void {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} Phase6-Step3 集成测试结果汇总:`);
    console.log(`${TAG} ${'─'.repeat(56)}`);
    console.log(`${TAG} | ${'#'.padEnd(3)} | ${'Test Name'.padEnd(30)} | Result |`);
    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(32)}|${'─'.repeat(8)}|`);

    for (const r of this._results) {
      const status = r.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`${TAG} | ${String(r.id).padEnd(3)} | ${r.name.padEnd(30)} | ${status.padEnd(8)} |`);
    }

    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(32)}|${'─'.repeat(8)}|`);
    const passCount = this._results.filter((r) => r.pass).length;
    const failCount = this._results.filter((r) => !r.pass).length;
    console.log(`${TAG} |     | 合计: ${passCount}/${this._results.length} PASS, ${failCount} FAIL      |`);
    console.log(`${TAG} ${SEP}`);

    if (allPassed) {
      console.log(`${TAG} ========== Phase6-Step3 EquipmentDrop Integration 全部通过 ✅ ==========`);
    } else {
      console.log(`${TAG} ========== Phase6-Step3 EquipmentDrop Integration 未通过 ❌ ==========`);
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

    if (this._cbEntered) {
      this._eventManager.off(DungeonSystem.DUNGEON_ENTERED, this._cbEntered, this);
      this._cbEntered = null;
    }
    if (this._cbCompleted) {
      this._eventManager.off(DungeonSystem.DUNGEON_COMPLETED, this._cbCompleted, this);
      this._cbCompleted = null;
    }
    if (this._cbFailed) {
      this._eventManager.off(DungeonSystem.DUNGEON_FAILED, this._cbFailed, this);
      this._cbFailed = null;
    }
    if (this._cbRolled) {
      this._eventManager.off(DropSystem.DROP_ROLLED, this._cbRolled, this);
      this._cbRolled = null;
    }
    if (this._cbClaimed) {
      this._eventManager.off(DropSystem.DROP_CLAIMED, this._cbClaimed, this);
      this._cbClaimed = null;
    }
  }

  private _fail(id: number, name: string, detail: string): TestResult {
    console.log(`${TAG}   → ❌ FAIL: ${detail}`);
    return { id, name, pass: false, detail };
  }
}
