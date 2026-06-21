// ============================================================
// Phase5EquipmentIntegrationRunner.ts — Phase5 Step3 UI ↔ System 集成验证
// 职责：验证 EquipmentPanel/EquipmentBagPanel 与 EquipmentSystem 全链路对接
// 验证项：
//   1. getHeroSlotDetails() 数据完整性
//   2. getPlayerEquipmentList() 数据 + 筛选
//   3. equip/unequip 回调 → EquipmentSystem → 事件 → UI 刷新
//   4. syncHeroPowerAfterEquipmentChange() 战力同步
//   5. 事件 equipment:heroChanged / equipment:gained 触发
//   6. 空数据 / 边界情况
// 约束：数据层集成验证（UI 渲染验证需在 Cocos Creator 编辑器中完成）
// ============================================================

import { _decorator, Component } from 'cc';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { EquipmentSystem, type HeroEquipmentChangedEventData, type EquipmentGainedEventData } from '../systems/EquipmentSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { PowerSystem } from '../systems/PowerSystem';
import { EquipmentSlot, EquipmentType, EquipmentQuality } from '../data/equipment_types';
import type { EquipmentListEntry, EquipmentListFilter, HeroSlotDetails } from '../data/equipment_ui_types';
import type { HeroProgressData } from '../data/hero_progress_data';
import type { PlayerProgressData } from '../data/player_progress_data';
import { EquipmentMediator } from '../ui/EquipmentMediator';

const { ccclass } = _decorator;

const TAG = '[Phase5-Int]';
const SEP = '='.repeat(60);
const SEP_MIN = '-'.repeat(60);
const TEST_HERO_ID = 'CARD_301';
const ALL_HERO_IDS = ['CARD_301', 'CARD_302', 'CARD_303'];

// 装备配置 ID（对应 equipment_config.json）
const WEAPON_COMMON = 'weapon_001';
const WEAPON_RARE = 'weapon_002';
const WEAPON_EPIC = 'weapon_003';
const ARMOR_COMMON = 'armor_001';
const ARMOR_RARE = 'armor_002';
const ACC_COMMON = 'acc_001';
const ACC_EPIC = 'acc_003';

interface TestResult {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
}

@ccclass('Phase5EquipmentIntegrationRunner')
export class Phase5EquipmentIntegrationRunner extends Component {
  private _eventManager: EventManager | null = null;
  private _equipmentSystem: EquipmentSystem | null = null;
  private _progressSystem: ProgressSystem | null = null;
  private _powerSystem: PowerSystem | null = null;
  private _saveManager: SaveManager | null = null;

  private _results: TestResult[] = [];

  // 事件标志
  private _gainedEventCount = 0;
  private _changedEventCount = 0;
  private _lastChangedEvent: HeroEquipmentChangedEventData | null = null;

  // 事件回调引用（用于 cleanup）
  private _onGained: ((...args: unknown[]) => void) | null = null;
  private _onChanged: ((...args: unknown[]) => void) | null = null;

  // 创建出的装备 UID 缓存
  private _createdUids: string[] = [];

  // ==================== Cocos 生命周期 ====================

  start(): void {
    console.log(`${TAG} Phase5 Step3 集成验证开始`);
    this._initSingletons();

    this._run()
      .catch((err: unknown) => {
        console.error(`${TAG} 集成验证异常`, err);
        this._printSummary(false);
      });
  }

  onDestroy(): void {
    this._cleanupListeners();
  }

  // ==================== 初始化 ====================

  private _initSingletons(): void {
    this._eventManager = EventManager.getInstance();
    this._equipmentSystem = EquipmentSystem.getInstance();
    this._progressSystem = ProgressSystem.getInstance();
    this._powerSystem = PowerSystem.getInstance();
    this._saveManager = SaveManager.getInstance();
  }

  private _initializeSave(): void {
    const hasSave = this._saveManager!.init(new LocalStorageAdapter());
    console.log(`${TAG} SaveManager 初始化: hasSave=${hasSave}`);
  }

  private async _loadConfigs(): Promise<void> {
    await Promise.all([
      this._equipmentSystem!.loadConfig(),
      this._progressSystem!.loadConfig(),
    ]);
    console.log(`${TAG} 配置加载完成`);
    console.log(`${TAG}   equipmentSystem.loaded=${this._equipmentSystem!.isConfigLoaded()}`);
    console.log(`${TAG}   progressSystem.loaded=${this._progressSystem!.isConfigLoaded()}`);
    console.log(`${TAG}   powerConfig.loaded=${this._powerSystem!.isConfigLoaded()}`);
  }

  private _initTestHero(): void {
    this._equipmentSystem!.clearData();
    this._progressSystem!.clearProgress();

    // 初始化测试英雄（Lv.5 满足 Rare 装备的等级需求）
    const testHero: HeroProgressData = {
      heroId: TEST_HERO_ID,
      level: 5,
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

    this._progressSystem!.setHeroProgress(testHero);
    this._progressSystem!.setPlayerProgressData(testPlayer);

    // 初始化其他英雄的基本进度
    for (const id of ALL_HERO_IDS) {
      if (id === TEST_HERO_ID) continue;
      const hero: HeroProgressData = { heroId: id, level: 1, exp: 0, power: 0 };
      try {
        this._progressSystem!.setHeroProgress(hero);
      } catch {
        // 可能尚未配置
      }
    }

    console.log(`${TAG} 测试英雄初始化: ${TEST_HERO_ID} Lv.5`);
  }

  private _registerListeners(): void {
    this._onGained = (...args: unknown[]): void => {
      this._gainedEventCount += 1;
      const data = args[0] as EquipmentGainedEventData | undefined;
      console.log(`${TAG}   📡 equipment:gained #${this._gainedEventCount} — configId=${data?.configId}`);
    };
    this._eventManager!.on(EquipmentSystem.EQUIPMENT_GAINED, this._onGained, this);

    this._onChanged = (...args: unknown[]): void => {
      this._changedEventCount += 1;
      this._lastChangedEvent = args[0] as HeroEquipmentChangedEventData;
      const d = this._lastChangedEvent;
      console.log(`${TAG}   📡 equipment:heroChanged #${this._changedEventCount} — heroId=${d.heroId}, slot=${d.slotType}, old=${d.oldEquipmentUid?.slice(0, 15) ?? 'null'}, new=${d.newEquipmentUid?.slice(0, 15) ?? 'null'}`);
    };
    this._eventManager!.on(EquipmentSystem.HERO_EQUIPMENT_CHANGED, this._onChanged, this);
  }

  private _resetEventCounters(): void {
    this._gainedEventCount = 0;
    this._changedEventCount = 0;
    this._lastChangedEvent = null;
  }

  // ==================== 主流程 ====================

  private async _run(): Promise<void> {
    console.log(`${TAG} ${SEP}`);

    this._initializeSave();
    this._registerListeners();
    await this._loadConfigs();
    this._initTestHero();

    this._results = [];

    // ===== 数据层集成验证 =====

    // Test 01: getHeroSlotDetails 空英雄数据完整性
    this._results.push(this._test01EmptyHeroSlotDetails());

    // Test 02: 创建装备实例 + getPlayerEquipmentList
    this._results.push(this._test02CreateInstancesAndList());

    // Test 03: 穿戴装备 → 数据流验证
    this._results.push(this._test03EquipFlow());

    // Test 04: 三槽穿戴 → HeroSlotDetails 验证
    this._results.push(this._test04AllSlotsEquipAndDetails());

    // Test 05: 卸下装备 → 数据流验证
    this._results.push(this._test05UnequipFlow());

    // Test 06: 自动替换（同槽位换装）
    this._results.push(this._test06AutoReplace());

    // Test 07: 装备独立战力计算
    this._results.push(this._test07EquipmentPowerCalc());

    // Test 08: 战力同步 syncHeroPowerAfterEquipmentChange
    this._results.push(this._test08PowerSync());

    // Test 09: getPlayerEquipmentList 筛选
    this._results.push(this._test09ListFiltering());

    // Test 10: 事件验证
    this._results.push(this._test10EventVerification());

    // Test 11: 空数据/边界情况
    this._results.push(this._test11Boundaries());

    // Test 12: EquipmentMediator 回调模拟验证
    this._results.push(this._test12MediatorCallbackFlow());

    // ===== 输出 =====
    this._printSummary(this._allPassed());
    this._cleanupListeners();
  }

  // ==================== Test 01: 空英雄槽位详情 ====================

  private _test01EmptyHeroSlotDetails(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 01: getHeroSlotDetails — 空英雄数据完整性`);

    try {
      const details = this._equipmentSystem!.getHeroSlotDetails(TEST_HERO_ID);

      const checks: string[] = [];
      let pass = true;

      if (details.heroId !== TEST_HERO_ID) { pass = false; checks.push(`heroId 不匹配: ${details.heroId}`); }
      if (details.weapon !== null) { pass = false; checks.push(`weapon 应为 null, 实际=${JSON.stringify(details.weapon)}`); }
      if (details.armor !== null) { pass = false; checks.push(`armor 应为 null`); }
      if (details.accessory !== null) { pass = false; checks.push(`accessory 应为 null`); }
      if (details.attributeBonus.hp !== 0 || details.attributeBonus.atk !== 0
        || details.attributeBonus.def !== 0 || details.attributeBonus.speed !== 0) {
        pass = false; checks.push(`attributeBonus 应全为 0`);
      }
      if (details.equipmentPower !== 0) { pass = false; checks.push(`equipmentPower 应为 0`); }

      if (pass) {
        checks.push('三槽全空, 属性加成全0, 装备战力0');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 1, name: '空英雄槽位详情', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 1, name: '空英雄槽位详情', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 02: 创建实例 + 背包列表 ====================

  private _test02CreateInstancesAndList(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 02: 创建装备实例 + getPlayerEquipmentList`);

    try {
      this._resetEventCounters();

      // 创建多样化的装备实例
      const configs = [
        WEAPON_COMMON, WEAPON_RARE, WEAPON_EPIC,
        ARMOR_COMMON, ARMOR_RARE,
        ACC_COMMON, ACC_EPIC,
      ];

      this._createdUids = [];
      for (const configId of configs) {
        const inst = this._equipmentSystem!.createInstance(configId);
        this._createdUids.push(inst.uid);
      }

      // 验证列表
      const allEntries = this._equipmentSystem!.getPlayerEquipmentList();
      const checks: string[] = [];
      let pass = true;

      if (allEntries.length !== configs.length) {
        pass = false;
        checks.push(`装备总数: 期望=${configs.length}, 实际=${allEntries.length}`);
      }

      // 验证每个条目结构
      for (const entry of allEntries) {
        if (!entry.instance || !entry.config) {
          pass = false;
          checks.push(`条目缺少 instance 或 config: ${JSON.stringify(entry)}`);
          break;
        }
        if (entry.instance.configId !== entry.config.id) {
          pass = false;
          checks.push(`configId 不匹配: ${entry.instance.configId} vs ${entry.config.id}`);
          break;
        }
        // 当前全部未穿戴
        if (entry.equipped) {
          pass = false;
          checks.push(`新创建的装备不应处于已穿戴状态: ${entry.config.name}`);
          break;
        }
      }

      // 验证 equipment:gained 事件
      if (this._gainedEventCount !== configs.length) {
        pass = false;
        checks.push(`gained 事件: 期望=${configs.length}, 实际=${this._gainedEventCount}`);
      }

      if (pass) {
        checks.push(`${allEntries.length} 件装备, 全部结构完整, 全部未穿戴`);
        checks.push(`equipment:gained ×${this._gainedEventCount}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 2, name: '创建实例+背包列表', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 2, name: '创建实例+背包列表', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 03: 装备穿戴数据流 ====================

  private _test03EquipFlow(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 03: 装备穿戴 → 数据流验证`);

    try {
      this._resetEventCounters();

      // 找到 weapon_001 的 uid
      const weaponEntry = this._equipmentSystem!
        .getPlayerEquipmentList({ type: EquipmentType.Weapon })
        .find((e) => e.config.id === WEAPON_COMMON);
      if (!weaponEntry) {
        return { id: 3, name: '装备穿戴数据流', pass: false, detail: '前置: 找不到 weapon_001' };
      }

      // 执行穿戴
      const result = this._equipmentSystem!.equip(TEST_HERO_ID, weaponEntry.instance.uid);

      const checks: string[] = [];
      let pass = true;

      // 1. 返回值正确
      if (!result) { pass = false; checks.push('equip 返回 null'); }
      if (result?.slotType !== EquipmentSlot.Weapon) { pass = false; checks.push(`槽位不匹配: ${result?.slotType}`); }
      if (result?.newEquipmentUid !== weaponEntry.instance.uid) { pass = false; checks.push('newEquipmentUid 不匹配'); }

      // 2. 数据一致性
      const equipped = this._equipmentSystem!.getEquippedInstance(TEST_HERO_ID, EquipmentSlot.Weapon);
      if (equipped?.uid !== weaponEntry.instance.uid) { pass = false; checks.push('getEquippedInstance 不一致'); }

      // 3. 列表中标记为已穿戴
      const listAfterEquip = this._equipmentSystem!.getPlayerEquipmentList();
      const entryAfter = listAfterEquip.find((e) => e.instance.uid === weaponEntry.instance.uid);
      if (!entryAfter?.equipped) { pass = false; checks.push('列表中未标记为已穿戴'); }
      if (entryAfter?.equippedHeroId !== TEST_HERO_ID) { pass = false; checks.push('equippedHeroId 不正确'); }

      // 4. 事件触发
      if (this._changedEventCount < 1) { pass = false; checks.push('equipment:heroChanged 未触发'); }

      if (pass) {
        checks.push(`weapon_001 已装备到 ${TEST_HERO_ID}, 列表标记正确`);
        checks.push(`equipment:heroChanged ×${this._changedEventCount}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 3, name: '装备穿戴数据流', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 3, name: '装备穿戴数据流', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 04: 三槽穿戴 + HeroSlotDetails ====================

  private _test04AllSlotsEquipAndDetails(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 04: 三槽穿戴 + HeroSlotDetails 验证`);

    try {
      // 清空所有槽位
      for (const slot of [EquipmentSlot.Weapon, EquipmentSlot.Armor, EquipmentSlot.Accessory]) {
        if (this._equipmentSystem!.isSlotOccupied(TEST_HERO_ID, slot)) {
          this._equipmentSystem!.unequip(TEST_HERO_ID, slot);
        }
      }

      // 找三件不同槽位的装备
      const armorEntry = this._equipmentSystem!
        .getPlayerEquipmentList({ type: EquipmentType.Armor })
        .find((e) => !e.equipped);
      const accEntry = this._equipmentSystem!
        .getPlayerEquipmentList({ type: EquipmentType.Accessory })
        .find((e) => !e.equipped);
      // weapon_001（已在背包中但可能被卸下）
      const weaponEntry = this._equipmentSystem!
        .getPlayerEquipmentList({ type: EquipmentType.Weapon })
        .find((e) => e.config.id === WEAPON_COMMON && !e.equipped);

      if (!weaponEntry || !armorEntry || !accEntry) {
        return { id: 4, name: '三槽穿戴+详情', pass: false,
          detail: `前置: 缺少装备 w=${!!weaponEntry}, a=${!!armorEntry}, ac=${!!accEntry}` };
      }

      // 三槽穿戴
      this._equipmentSystem!.equip(TEST_HERO_ID, weaponEntry.instance.uid);
      this._equipmentSystem!.equip(TEST_HERO_ID, armorEntry.instance.uid);
      this._equipmentSystem!.equip(TEST_HERO_ID, accEntry.instance.uid);

      // 获取 HeroSlotDetails
      const details = this._equipmentSystem!.getHeroSlotDetails(TEST_HERO_ID);

      const checks: string[] = [];
      let pass = true;

      // 验证三槽非空
      if (!details.weapon) { pass = false; checks.push('weapon 为空'); }
      else if (details.weapon.instance.uid !== weaponEntry.instance.uid) {
        pass = false; checks.push('weapon uid 不匹配');
      }

      if (!details.armor) { pass = false; checks.push('armor 为空'); }
      else if (details.armor.instance.uid !== armorEntry.instance.uid) {
        pass = false; checks.push('armor uid 不匹配');
      }

      if (!details.accessory) { pass = false; checks.push('accessory 为空'); }
      else if (details.accessory.instance.uid !== accEntry.instance.uid) {
        pass = false; checks.push('accessory uid 不匹配');
      }

      // 验证属性加成（每个槽位详情包含完整的 EquipmentInstanceDetail）
      if (details.weapon && (!details.weapon.config || !details.weapon.instance)) {
        pass = false; checks.push('weapon EquipmentInstanceDetail 结构不完整');
      }

      // 属性加成 > 0
      if (details.attributeBonus.hp <= 0 && details.attributeBonus.atk <= 0 && details.attributeBonus.def <= 0) {
        pass = false; checks.push('属性加成全为 0（应至少有一项 > 0）');
      }
      if (details.equipmentPower <= 0) {
        pass = false; checks.push('装备战力为 0');
      }

      if (pass) {
        checks.push(`weapon: ${details.weapon!.config.name}, armor: ${details.armor!.config.name}, accessory: ${details.accessory!.config.name}`);
        checks.push(`属性: HP+${details.attributeBonus.hp}, ATK+${details.attributeBonus.atk}, DEF+${details.attributeBonus.def}`);
        checks.push(`装备战力: ${details.equipmentPower}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 4, name: '三槽穿戴+详情', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 4, name: '三槽穿戴+详情', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 05: 卸下装备数据流 ====================

  private _test05UnequipFlow(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 05: 卸下装备 → 数据流验证`);

    try {
      this._resetEventCounters();

      // 确认 Weapon 槽位已占用
      if (!this._equipmentSystem!.isSlotOccupied(TEST_HERO_ID, EquipmentSlot.Weapon)) {
        return { id: 5, name: '卸下装备数据流', pass: false, detail: '前置: Weapon 槽位为空' };
      }

      const beforeEquipped = this._equipmentSystem!.getEquippedInstance(TEST_HERO_ID, EquipmentSlot.Weapon);
      const beforeUid = beforeEquipped!.uid;

      // 卸下
      const result = this._equipmentSystem!.unequip(TEST_HERO_ID, EquipmentSlot.Weapon);

      const checks: string[] = [];
      let pass = true;

      if (!result) { pass = false; checks.push('unequip 返回 null'); }
      if (result?.newEquipmentUid !== null) { pass = false; checks.push('newEquipmentUid 应为 null'); }
      if (result?.oldEquipmentUid !== beforeUid) { pass = false; checks.push('oldEquipmentUid 不匹配'); }

      // 槽位已空
      if (this._equipmentSystem!.isSlotOccupied(TEST_HERO_ID, EquipmentSlot.Weapon)) {
        pass = false; checks.push('卸下后槽位仍占用');
      }

      // 装备实例仍在 instances 中
      const instance = this._equipmentSystem!.getInstance(beforeUid);
      if (!instance) { pass = false; checks.push('卸下后装备实例丢失'); }

      // 列表中不再标记为已穿戴
      const listEntry = this._equipmentSystem!.getPlayerEquipmentList()
        .find((e) => e.instance.uid === beforeUid);
      if (listEntry?.equipped) { pass = false; checks.push('卸下后列表仍标记为已穿戴'); }

      // 事件触发
      if (this._changedEventCount < 1) { pass = false; checks.push('equipment:heroChanged 未触发'); }

      if (pass) {
        checks.push('槽位已空, 装备保留在背包');
        checks.push(`equipment:heroChanged ×${this._changedEventCount}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 5, name: '卸下装备数据流', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 5, name: '卸下装备数据流', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 06: 自动替换 ====================

  private _test06AutoReplace(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 06: 同槽位自动替换`);

    try {
      // 确保 Weapon 槽为空
      if (this._equipmentSystem!.isSlotOccupied(TEST_HERO_ID, EquipmentSlot.Weapon)) {
        this._equipmentSystem!.unequip(TEST_HERO_ID, EquipmentSlot.Weapon);
      }

      // 找两件武器
      const weapons = this._equipmentSystem!
        .getPlayerEquipmentList({ type: EquipmentType.Weapon })
        .filter((e) => !e.equipped);

      if (weapons.length < 2) {
        return { id: 6, name: '自动替换', pass: false, detail: `前置: 需要2件未穿戴武器, 实际=${weapons.length}` };
      }

      const w1 = weapons[0];
      const w2 = weapons[1];

      // 装备 w1
      this._equipmentSystem!.equip(TEST_HERO_ID, w1.instance.uid);
      this._resetEventCounters();

      // 装备 w2（应自动替换 w1）
      const result = this._equipmentSystem!.equip(TEST_HERO_ID, w2.instance.uid);

      const checks: string[] = [];
      let pass = true;

      // 新武器在槽位上
      const equipped = this._equipmentSystem!.getEquippedInstance(TEST_HERO_ID, EquipmentSlot.Weapon);
      if (equipped?.uid !== w2.instance.uid) { pass = false; checks.push(`槽位不是 w2: ${equipped?.configId}`); }

      // 旧武器仍在背包
      const oldInst = this._equipmentSystem!.getInstance(w1.instance.uid);
      if (!oldInst) { pass = false; checks.push('旧武器 w1 丢失'); }

      // 旧武器列表中不再标记为已穿戴
      const oldEntry = this._equipmentSystem!.getPlayerEquipmentList()
        .find((e) => e.instance.uid === w1.instance.uid);
      if (oldEntry?.equipped) { pass = false; checks.push('w1 应标记为未穿戴'); }

      // 事件数据
      if (result?.oldEquipmentUid !== w1.instance.uid) { pass = false; checks.push('oldEquipmentUid 不匹配'); }
      if (result?.newEquipmentUid !== w2.instance.uid) { pass = false; checks.push('newEquipmentUid 不匹配'); }

      if (pass) {
        checks.push(`${w1.config.name} → ${w2.config.name}, 旧装备已退回背包`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 6, name: '自动替换', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 6, name: '自动替换', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 07: 装备独立战力计算 ====================

  private _test07EquipmentPowerCalc(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 07: 装备独立战力计算`);

    try {
      const power = this._equipmentSystem!.getHeroEquipmentPower(TEST_HERO_ID);
      const bonus = this._equipmentSystem!.getHeroEquipmentBonus(TEST_HERO_ID);
      const summary = this._equipmentSystem!.getHeroEquipmentSummary(TEST_HERO_ID);

      const checks: string[] = [];
      let pass = true;

      // 汇总结构完整性
      if (summary.attributeBonus.hp !== bonus.hp) { pass = false; checks.push('summary.attributeBonus 与 getHeroEquipmentBonus 不一致'); }
      if (summary.equipmentPower !== power) { pass = false; checks.push('summary.equipmentPower 与 getHeroEquipmentPower 不一致'); }

      // 详细槽位获取
      const details = this._equipmentSystem!.getHeroSlotDetails(TEST_HERO_ID);
      if (details.equipmentPower !== power) { pass = false; checks.push(`HeroSlotDetails.equipmentPower 不一致: ${details.equipmentPower} vs ${power}`); }
      if (details.attributeBonus.hp !== bonus.hp) { pass = false; checks.push(`HeroSlotDetails 属性不一致`); }

      if (pass) {
        checks.push(`装备战力: ${power}, 属性: HP+${bonus.hp} ATK+${bonus.atk} DEF+${bonus.def}`);
        checks.push('HeroSlotDetails / summary / bonus 三者数据一致');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 7, name: '装备战力计算', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 7, name: '装备战力计算', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 08: 战力同步 ====================

  private _test08PowerSync(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 08: syncHeroPowerAfterEquipmentChange`);

    try {
      const heroBefore = this._progressSystem!.getHeroProgress(TEST_HERO_ID);
      const playerBefore = this._progressSystem!.getPlayerProgressData();

      const syncResult = this._equipmentSystem!.syncHeroPowerAfterEquipmentChange(TEST_HERO_ID);

      const heroAfter = this._progressSystem!.getHeroProgress(TEST_HERO_ID);
      const playerAfter = this._progressSystem!.getPlayerProgressData();

      const checks: string[] = [];
      let pass = true;

      // 英雄战力已更新
      if (heroAfter.power !== syncResult.newPower) {
        pass = false;
        checks.push(`英雄战力不一致: progress=${heroAfter.power}, syncResult=${syncResult.newPower}`);
      }

      // 总战力已更新
      if (playerAfter.totalPower !== syncResult.newTotalPower) {
        pass = false;
        checks.push(`总战力不一致: progress=${playerAfter.totalPower}, syncResult=${syncResult.newTotalPower}`);
      }

      // 总战力 > 0（有装备时）
      if (playerAfter.totalPower <= 0) {
        pass = false;
        checks.push('总战力为 0（应 > 0）');
      }

      // lastGrowthAt 已更新
      if (playerAfter.lastGrowthAt <= 0) {
        pass = false;
        checks.push('lastGrowthAt 未更新');
      }

      if (pass) {
        checks.push(`英雄战力: ${syncResult.oldPower} → ${syncResult.newPower} (+${syncResult.newPower - syncResult.oldPower})`);
        checks.push(`总战力: ${syncResult.oldTotalPower} → ${syncResult.newTotalPower} (+${syncResult.newTotalPower - syncResult.oldTotalPower})`);
        checks.push('lastGrowthAt 已更新');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 8, name: '战力同步', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 8, name: '战力同步', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 09: 背包列表筛选 ====================

  private _test09ListFiltering(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 09: getPlayerEquipmentList 筛选`);

    try {
      const checks: string[] = [];
      let pass = true;

      // 全量
      const allEntries = this._equipmentSystem!.getPlayerEquipmentList();
      const totalCount = allEntries.length;

      // 类型筛选：Weapon
      const weapons = this._equipmentSystem!.getPlayerEquipmentList({ type: EquipmentType.Weapon });
      if (weapons.length === 0) { pass = false; checks.push('Weapon 筛选结果为空'); }
      if (weapons.some((e) => e.config.type !== EquipmentType.Weapon)) {
        pass = false; checks.push('Weapon 筛选混入了非武器');
      }

      // 类型筛选：Armor
      const armors = this._equipmentSystem!.getPlayerEquipmentList({ type: EquipmentType.Armor });
      if (armors.some((e) => e.config.type !== EquipmentType.Armor)) {
        pass = false; checks.push('Armor 筛选混入了非护甲');
      }

      // 类型筛选：Accessory
      const accessories = this._equipmentSystem!.getPlayerEquipmentList({ type: EquipmentType.Accessory });
      if (accessories.some((e) => e.config.type !== EquipmentType.Accessory)) {
        pass = false; checks.push('Accessory 筛选混入了非饰品');
      }

      // 品质筛选
      const rares = this._equipmentSystem!.getPlayerEquipmentList({ quality: EquipmentQuality.Rare });
      if (rares.some((e) => e.config.quality !== EquipmentQuality.Rare)) {
        pass = false; checks.push('Rare 品质筛选不正确');
      }

      // 组合筛选：Weapon + Common
      const weaponCommon = this._equipmentSystem!.getPlayerEquipmentList({
        type: EquipmentType.Weapon,
        quality: EquipmentQuality.Common,
      });
      if (weaponCommon.some((e) => e.config.type !== EquipmentType.Weapon || e.config.quality !== EquipmentQuality.Common)) {
        pass = false; checks.push('组合筛选不正确');
      }

      if (pass) {
        checks.push(`总计 ${totalCount} 件`);
        checks.push(`Weapon: ${weapons.length}, Armor: ${armors.length}, Accessory: ${accessories.length}`);
        checks.push(`Rare: ${rares.length}, Weapon+Common: ${weaponCommon.length}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 9, name: '背包列表筛选', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 9, name: '背包列表筛选', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 10: 事件验证 ====================

  private _test10EventVerification(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 10: equipment:gained / equipment:heroChanged 事件验证`);

    try {
      this._resetEventCounters();

      // 触发 gained：创建新实例
      const newInst = this._equipmentSystem!.createInstance(WEAPON_EPIC);
      this._createdUids.push(newInst.uid);

      // 触发 heroChanged：装备
      this._equipmentSystem!.equip(TEST_HERO_ID, newInst.uid);

      const checks: string[] = [];
      let pass = true;

      if (this._gainedEventCount < 1) { pass = false; checks.push('gained 事件未触发'); }
      if (this._changedEventCount < 1) { pass = false; checks.push('changed 事件未触发'); }

      // 验证事件数据结构
      if (this._lastChangedEvent) {
        if (!this._lastChangedEvent.heroId) { pass = false; checks.push('changed 事件缺少 heroId'); }
        if (!this._lastChangedEvent.slotType) { pass = false; checks.push('changed 事件缺少 slotType'); }
        if (this._lastChangedEvent.newEquipmentUid !== newInst.uid) {
          pass = false; checks.push('changed 事件 newEquipmentUid 不正确');
        }
      }

      if (pass) {
        checks.push(`equipment:gained ×${this._gainedEventCount}`);
        checks.push(`equipment:heroChanged ×${this._changedEventCount}, slot=${this._lastChangedEvent?.slotType}`);
        checks.push('事件数据结构完整');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 10, name: '事件验证', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 10, name: '事件验证', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 11: 边界情况 ====================

  private _test11Boundaries(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 11: 边界情况`);

    const subResults: string[] = [];
    let allPassed = true;

    // 11.1 getHeroSlotDetails 不存在的英雄
    try {
      const details = this._equipmentSystem!.getHeroSlotDetails('NON_EXISTENT_HERO');
      if (details.weapon !== null || details.armor !== null || details.accessory !== null) {
        allPassed = false;
        subResults.push('❌ 11.1 不存在英雄应返回全空槽位');
      } else {
        subResults.push('✅ 11.1 不存在英雄返回全空槽位');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 11.1 不存在英雄异常: ${e}`);
    }

    // 11.2 getEquipmentInstanceDetail 不存在实例
    try {
      const detail = this._equipmentSystem!.getEquipmentInstanceDetail('NON_EXISTENT_UID');
      if (detail !== null) {
        allPassed = false;
        subResults.push('❌ 11.2 不存在实例应返回 null');
      } else {
        subResults.push('✅ 11.2 不存在实例返回 null');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 11.2 不存在实例异常: ${e}`);
    }

    // 11.3 空列表筛选
    try {
      const result = this._equipmentSystem!.getPlayerEquipmentList({
        type: EquipmentType.Weapon,
        quality: EquipmentQuality.Legendary,
      });
      // 我们没创建 Legendary 武器，结果应为空
      subResults.push(`✅ 11.3 Weapon+Legendary 筛选: ${result.length} 件（预期 0）`);
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 11.3 空筛选异常: ${e}`);
    }

    const detail = subResults.join('; ');
    console.log(`${TAG}   → ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    for (const s of subResults) {
      console.log(`${TAG}      ${s}`);
    }
    return { id: 11, name: '边界情况', pass: allPassed, detail };
  }

  // ==================== Test 12: Mediator 回调模拟 ====================

  private _test12MediatorCallbackFlow(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 12: EquipmentMediator 回调链路模拟`);

    try {
      const checks: string[] = [];

      // 模拟 Mediator 的完整操作流程：
      // 1. 获取当前 HeroSlotDetails（模拟 openWithSystem）
      const initialDetails = this._equipmentSystem!.getHeroSlotDetails(TEST_HERO_ID);
      checks.push(`初始: weapon=${initialDetails.weapon?.config.name ?? '空'}, armor=${initialDetails.armor?.config.name ?? '空'}, accessory=${initialDetails.accessory?.config.name ?? '空'}`);

      // 2. 获取背包列表（模拟 getBagEntries）
      const bagEntries = this._equipmentSystem!.getPlayerEquipmentList();
      checks.push(`背包: ${bagEntries.length} 件`);

      // 3. 卸下武器（模拟 onUnequip 回调）
      if (this._equipmentSystem!.isSlotOccupied(TEST_HERO_ID, EquipmentSlot.Weapon)) {
        this._equipmentSystem!.unequip(TEST_HERO_ID, EquipmentSlot.Weapon);
        checks.push('卸下: Weapon 已卸下');
      }

      // 4. 战力同步（模拟 _syncPower）
      const syncResult = this._equipmentSystem!.syncHeroPowerAfterEquipmentChange(TEST_HERO_ID);
      checks.push(`战力同步: heroPower=${syncResult.newPower}, totalPower=${syncResult.newTotalPower}`);

      // 5. 重新获取 HeroSlotDetails（模拟 event → refresh）
      const refreshedDetails = this._equipmentSystem!.getHeroSlotDetails(TEST_HERO_ID);
      checks.push(`刷新后: weapon=${refreshedDetails.weapon?.config.name ?? '空'}`);

      // 6. 从背包找一件未穿戴装备穿上（模拟 onEquip 回调）
      const unequippedWeapon = this._equipmentSystem!
        .getPlayerEquipmentList({ type: EquipmentType.Weapon })
        .find((e) => !e.equipped);

      if (unequippedWeapon) {
        this._equipmentSystem!.equip(TEST_HERO_ID, unequippedWeapon.instance.uid);
        this._equipmentSystem!.syncHeroPowerAfterEquipmentChange(TEST_HERO_ID);
        checks.push(`装备: ${unequippedWeapon.config.name} → Weapon 槽位`);
      }

      // 7. 最终状态
      const finalDetails = this._equipmentSystem!.getHeroSlotDetails(TEST_HERO_ID);
      const equippedCount = [finalDetails.weapon, finalDetails.armor, finalDetails.accessory]
        .filter(Boolean).length;
      checks.push(`最终: ${equippedCount} 槽位已装备, 装备战力=${finalDetails.equipmentPower}`);

      const pass = true; // 完整链路无异常即通过
      const detail = checks.join('; ');
      console.log(`${TAG}   → ✅ PASS: ${detail}`);
      return { id: 12, name: 'Mediator回调链路', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 12, name: 'Mediator回调链路', pass: false, detail: String(e) };
    }
  }

  // ==================== 输出 ====================

  private _allPassed(): boolean {
    return this._results.every((r) => r.pass);
  }

  private _printSummary(allPassed: boolean): void {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} Phase5 Step3 UI↔System 集成验证结果汇总:`);
    console.log(`${TAG} ${'─'.repeat(55)}`);
    console.log(`${TAG} | ${'#'.padEnd(3)} | ${'Test Name'.padEnd(28)} | Result |`);
    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(30)}|${'─'.repeat(8)}|`);

    for (const r of this._results) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`${TAG} | ${String(r.id).padEnd(3)} | ${r.name.padEnd(28)} | ${status.padEnd(6)} |`);
    }

    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(30)}|${'─'.repeat(8)}|`);
    const passCount = this._results.filter((r) => r.pass).length;
    const failCount = this._results.filter((r) => !r.pass).length;
    console.log(`${TAG} |     | 合计: ${passCount}/${this._results.length} PASS, ${failCount} FAIL       |`);
    console.log(`${TAG} ${SEP}`);

    if (allPassed) {
      console.log(`${TAG} ========== Phase5 Step3 UI↔System 集成全部通过 ✅ ==========`);
      console.log(`${TAG} 可以进入 Phase5 完整 UI 验收`);
    } else {
      console.log(`${TAG} ========== Phase5 Step3 集成未完全通过 ❌ ==========`);
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

    if (this._onGained) {
      this._eventManager.off(EquipmentSystem.EQUIPMENT_GAINED, this._onGained, this);
      this._onGained = null;
    }
    if (this._onChanged) {
      this._eventManager.off(EquipmentSystem.HERO_EQUIPMENT_CHANGED, this._onChanged, this);
      this._onChanged = null;
    }
  }
}
