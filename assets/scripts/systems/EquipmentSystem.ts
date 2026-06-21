// ============================================================
// EquipmentSystem — Phase4B 装备系统
// 职责：装备实例管理 / 穿戴卸下 / 属性汇总 / 战力计算 / 存档
// 边界：不实现 UI、不直接修改英雄基础属性、不实现强化/精炼/升阶/套装
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { PowerSystem, type PowerAttributeBonus } from './PowerSystem';
import { ProgressSystem } from './ProgressSystem';
import type { EquipmentConfig, EquipmentConfigData } from '../data/equipment_config';
import type {
  EquipmentInstanceData,
  HeroEquipmentData,
  PlayerEquipmentData,
} from '../data/equipment_data';
import type {
  EquipmentInstanceDetail,
  EquipmentListEntry,
  EquipmentListFilter,
  HeroEquipmentUIData,
  HeroSlotDetails,
} from '../data/equipment_ui_types';
import {
  createDefaultPlayerEquipmentData,
  createDefaultHeroEquipmentData,
  setEquipmentSlotValue,
} from '../data/equipment_data';
import { EquipmentType, EquipmentQuality, EquipmentSlot, EQUIPMENT_TYPE_TO_SLOT } from '../data/equipment_types';
import type { HeroConfig, HeroListData } from '../config/hero_config';

/** 装备获得事件数据 */
export interface EquipmentGainedEventData {
  equipmentUid: string;
  configId: string;
}

/** 英雄装备变更事件数据 */
export interface HeroEquipmentChangedEventData {
  heroId: string;
  slotType: EquipmentSlot;
  oldEquipmentUid: string | null;
  newEquipmentUid: string | null;
}

/** 英雄装备属性汇总结果 */
export interface HeroEquipmentSummary {
  /** 属性加成（用于 PowerSystem.calculateHeroPowerFromProgress 的 attributeBonus） */
  attributeBonus: PowerAttributeBonus;
  /** 装备独立战力（直接累加到英雄战力） */
  equipmentPower: number;
}

export class EquipmentSystem extends BaseSystem {
  // ==================== 事件常量 ====================

  static readonly EQUIPMENT_GAINED = 'equipment:gained';
  static readonly HERO_EQUIPMENT_CHANGED = 'equipment:heroChanged';

  // ==================== 配置路径常量 ====================

  private static readonly EQUIPMENT_CONFIG_PATH = `${ConfigManager.DIR_SYSTEMS}/equipment_config`;
  private static readonly HERO_CONFIG_PATH = `${ConfigManager.DIR_CARDS}/hero_list`;

  // ==================== 内部状态 ====================

  /** 装备配置缓存：configId → EquipmentConfig */
  private _configMap: Map<string, EquipmentConfig> = new Map();

  /** 角色配置缓存：heroId → HeroConfig */
  private _heroConfigMap: Map<string, HeroConfig> = new Map();

  /** 玩家装备总数据（运行时主数据） */
  private _data: PlayerEquipmentData = createDefaultPlayerEquipmentData();

  /** 实例 UID 计数器 */
  private _uidCounter = 0;

  /** 配置是否已加载 */
  private _configLoaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载装备依赖配置。
   *
   * 调用方应在使用装备系统前执行一次。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const [equipmentConfig, heroConfig] = await Promise.all([
      configManager.loadConfig<EquipmentConfigData>(EquipmentSystem.EQUIPMENT_CONFIG_PATH),
      configManager.loadConfig<HeroListData>(EquipmentSystem.HERO_CONFIG_PATH),
      PowerSystem.getInstance().loadConfig(),
    ]);

    this._configMap = this._buildEquipmentConfigMap(equipmentConfig);
    this._heroConfigMap = this._buildHeroConfigMap(heroConfig);
    this._restoreFromSave();
    this._configLoaded = true;
  }

  /** 是否已加载配置 */
  isConfigLoaded(): boolean {
    return this._configLoaded;
  }

  // ==================== 实例管理 ====================

  /**
   * 由配置 ID 创建装备实例。
   *
   * @param configId  装备配置 ID
   * @returns         新创建的装备实例数据
   */
  createInstance(configId: string): EquipmentInstanceData {
    const config = this._getRequiredConfig(configId);
    const uid = this._generateUid(configId);

    const instance: EquipmentInstanceData = {
      uid,
      configId,
    };

    this._data.instances[uid] = instance;
    this._save();

    this._emitEquipmentGained({ equipmentUid: uid, configId });

    return instance;
  }

  /**
   * 移除装备实例（从背包中删除）。
   *
   * 注意：如果装备正在被英雄穿戴，需要先卸下。
   */
  removeInstance(uid: string): boolean {
    // 检查是否正在被穿戴
    for (const heroEquipment of Object.values(this._data.heroEquipment)) {
      if (
        heroEquipment.weaponId === uid
        || heroEquipment.armorId === uid
        || heroEquipment.accessoryId === uid
      ) {
        return false;
      }
    }

    const existed = uid in this._data.instances;
    delete this._data.instances[uid];

    if (existed) {
      this._save();
    }

    return existed;
  }

  // ==================== 穿戴与卸下 ====================

  /**
   * 装备到指定英雄。
   *
   * 规则：
   * - 校验英雄等级 ≥ 装备 levelRequirement
   * - 同槽位自动替换：旧装备保留在背包中，仅解除穿戴关系
   * - 穿戴完成后自动触发战力重算与存档
   *
   * @param heroId        英雄 ID
   * @param equipmentUid  装备实例 uid
   * @returns             本次装备变更数据
   */
  equip(heroId: string, equipmentUid: string): HeroEquipmentChangedEventData | null {
    const instance = this._getRequiredInstance(equipmentUid);
    const config = this._getRequiredConfig(instance.configId);
    const slot = EQUIPMENT_TYPE_TO_SLOT[config.type];
    const heroEquipment = this._getOrCreateHeroEquipment(heroId);

    // 校验等级需求
    this._validateLevelRequirement(heroId, config);

    // 记录旧装备
    const oldEquipmentUid = this._getSlotValue(heroEquipment, slot);

    // 如果同一件装备已经在槽位上，无需操作
    if (oldEquipmentUid === equipmentUid) {
      return null;
    }

    // 穿戴新装备
    setEquipmentSlotValue(heroEquipment, slot, equipmentUid);
    this._save();

    const eventData: HeroEquipmentChangedEventData = {
      heroId,
      slotType: slot,
      oldEquipmentUid,
      newEquipmentUid: equipmentUid,
    };

    this._emitHeroEquipmentChanged(eventData);

    return eventData;
  }

  /**
   * 卸下指定英雄的指定槽位装备。
   *
   * @param heroId    英雄 ID
   * @param slotType  装备槽位类型
   * @returns         本次装备变更数据，槽位本就为空时返回 null
   */
  unequip(heroId: string, slotType: EquipmentSlot): HeroEquipmentChangedEventData | null {
    const heroEquipment = this._getOrCreateHeroEquipment(heroId);
    const oldEquipmentUid = this._getSlotValue(heroEquipment, slotType);

    if (oldEquipmentUid === null) {
      return null;
    }

    setEquipmentSlotValue(heroEquipment, slotType, null);
    this._save();

    const eventData: HeroEquipmentChangedEventData = {
      heroId,
      slotType,
      oldEquipmentUid,
      newEquipmentUid: null,
    };

    this._emitHeroEquipmentChanged(eventData);

    return eventData;
  }

  // ==================== 属性汇总 ====================

  /**
   * 汇总英雄所有装备的属性加成。
   *
   * 返回的 PowerAttributeBonus 可直接传入
   * PowerSystem.calculateHeroPowerFromProgress() 的 attributeBonus 参数。
   */
  getHeroEquipmentBonus(heroId: string): PowerAttributeBonus {
    const heroEquipment = this._data.heroEquipment[heroId];
    if (!heroEquipment) {
      return { hp: 0, atk: 0, def: 0, speed: 0 };
    }

    const slots: (string | null)[] = [
      heroEquipment.weaponId,
      heroEquipment.armorId,
      heroEquipment.accessoryId,
    ];

    let totalHp = 0;
    let totalAtk = 0;
    let totalDef = 0;

    for (const uid of slots) {
      if (!uid) continue;

      const instance = this._data.instances[uid];
      if (!instance) continue;

      const config = this._configMap.get(instance.configId);
      if (!config) continue;

      totalHp += config.hp;
      totalAtk += config.attack;
      totalDef += config.defense;
    }

    return {
      hp: totalHp,
      atk: totalAtk,
      def: totalDef,
      speed: 0, // Phase4B 装备暂不提供速度
    };
  }

  /**
   * 计算英雄装备独立战力（直接累加部分）。
   *
   * 公式：Σ(equipment.power × equipmentQualityMultiplier[quality])
   */
  getHeroEquipmentPower(heroId: string): number {
    const heroEquipment = this._data.heroEquipment[heroId];
    if (!heroEquipment) {
      return 0;
    }

    const powerConfig = PowerSystem.getInstance().getPowerConfig();
    const qualityMultiplier = powerConfig?.equipmentQualityMultiplier ?? {};

    const slots: (string | null)[] = [
      heroEquipment.weaponId,
      heroEquipment.armorId,
      heroEquipment.accessoryId,
    ];

    let totalPower = 0;

    for (const uid of slots) {
      if (!uid) continue;

      const instance = this._data.instances[uid];
      if (!instance) continue;

      const config = this._configMap.get(instance.configId);
      if (!config) continue;

      const multiplier = qualityMultiplier[config.quality] ?? 1.0;
      totalPower += Math.round(config.power * multiplier);
    }

    return totalPower;
  }

  /**
   * 汇总英雄装备属性与独立战力。
   */
  getHeroEquipmentSummary(heroId: string): HeroEquipmentSummary {
    return {
      attributeBonus: this.getHeroEquipmentBonus(heroId),
      equipmentPower: this.getHeroEquipmentPower(heroId),
    };
  }

  // ==================== 查询方法 ====================

  /** 获取指定槽位当前装备实例 */
  getEquippedInstance(heroId: string, slotType: EquipmentSlot): EquipmentInstanceData | null {
    const heroEquipment = this._data.heroEquipment[heroId];
    if (!heroEquipment) return null;

    const uid = this._getSlotValue(heroEquipment, slotType);
    if (!uid) return null;

    return this._data.instances[uid] ?? null;
  }

  /** 检查槽位是否已占用 */
  isSlotOccupied(heroId: string, slotType: EquipmentSlot): boolean {
    return this.getEquippedInstance(heroId, slotType) !== null;
  }

  /** 获取英雄所有已穿戴装备的实例列表 */
  getHeroEquippedInstances(heroId: string): EquipmentInstanceData[] {
    const heroEquipment = this._data.heroEquipment[heroId];
    if (!heroEquipment) return [];

    const result: EquipmentInstanceData[] = [];
    const slots: (string | null)[] = [
      heroEquipment.weaponId,
      heroEquipment.armorId,
      heroEquipment.accessoryId,
    ];

    for (const uid of slots) {
      if (!uid) continue;
      const instance = this._data.instances[uid];
      if (instance) {
        result.push(instance);
      }
    }

    return result;
  }

  /** 获取装备配置 */
  getEquipmentConfig(configId: string): EquipmentConfig | null {
    return this._configMap.get(configId) ?? null;
  }

  /** 获取装备实例 */
  getInstance(uid: string): EquipmentInstanceData | null {
    return this._data.instances[uid] ?? null;
  }

  /** 获取所有装备实例 */
  getAllInstances(): EquipmentInstanceData[] {
    return Object.values(this._data.instances);
  }

  /** 获取英雄穿戴状态 */
  getHeroEquipment(heroId: string): HeroEquipmentData | null {
    return this._data.heroEquipment[heroId] ?? null;
  }

  /** 获取当前玩家装备总数据副本 */
  getPlayerEquipmentData(): PlayerEquipmentData {
    return {
      instances: { ...this._data.instances },
      heroEquipment: { ...this._data.heroEquipment },
    };
  }

  // ==================== Phase5 UI 查询接口 ====================

  /**
   * 获取背包装备列表（含筛选与穿戴状态）。
   *
   * 返回完整的 EquipmentListEntry 数组，每条包含：
   * - instance：装备实例数据
   * - config：装备配置模板
   * - equipped：是否已被某英雄穿戴
   * - equippedHeroId / equippedSlot：穿戴者信息（仅已穿戴时有值）
   *
   * @param filter  可选筛选条件（按类型/品质）
   * @returns       符合条件的装备列表条目
   */
  getPlayerEquipmentList(filter?: EquipmentListFilter): EquipmentListEntry[] {
    const allInstances = Object.values(this._data.instances);

    // 构建 uid → 穿戴者信息的反向索引
    const equippedMap = this._buildEquippedMap();

    const result: EquipmentListEntry[] = [];

    for (const instance of allInstances) {
      const config = this._configMap.get(instance.configId);
      if (!config) {
        // 防御：配置缺失时跳过（不应发生，但存档可能残留）
        continue;
      }

      // 筛选：类型
      if (filter?.type !== undefined && config.type !== filter.type) {
        continue;
      }

      // 筛选：品质
      if (filter?.quality !== undefined && config.quality !== filter.quality) {
        continue;
      }

      const equippedInfo = equippedMap.get(instance.uid);

      result.push({
        instance,
        config,
        equipped: equippedInfo !== undefined,
        equippedHeroId: equippedInfo?.heroId ?? null,
        equippedSlot: equippedInfo?.slotType ?? null,
      });
    }

    return result;
  }

  /**
   * 获取英雄装备 UI 数据（穿戴状态 + 属性汇总）。
   *
   * 对应设计文档 Phase5 §3.1：
   *   getHeroEquipmentData(heroId) → HeroEquipmentData & HeroEquipmentSummary
   *
   * @param heroId  英雄 ID
   * @returns       组合后的英雄装备 UI 数据，英雄不存在时返回 null
   */
  getHeroEquipmentData(heroId: string): HeroEquipmentUIData {
    const heroEquipment = this._data.heroEquipment[heroId];
    const summary = this.getHeroEquipmentSummary(heroId);

    if (!heroEquipment) {
      // 英雄尚未初始化装备数据，返回仅含 summary 的结果
      return {
        heroId,
        weaponId: null,
        armorId: null,
        accessoryId: null,
        attributeBonus: summary.attributeBonus,
        equipmentPower: summary.equipmentPower,
      };
    }

    return {
      heroId: heroEquipment.heroId,
      weaponId: heroEquipment.weaponId,
      armorId: heroEquipment.armorId,
      accessoryId: heroEquipment.accessoryId,
      attributeBonus: summary.attributeBonus,
      equipmentPower: summary.equipmentPower,
    };
  }

  /**
   * 获取装备实例完整详情（实例 + 配置）。
   *
   * 用途：UI 需要同时展示装备名称、品质、属性等配置信息。
   *
   * @param uid  装备实例 uid
   * @returns    实例 + 配置的组合数据，实例或配置不存在时返回 null
   */
  getEquipmentInstanceDetail(uid: string): EquipmentInstanceDetail | null {
    const instance = this._data.instances[uid];
    if (!instance) {
      return null;
    }

    const config = this._configMap.get(instance.configId);
    if (!config) {
      return null;
    }

    return { instance, config };
  }

  /**
   * 获取英雄所有槽位的完整详情。
   *
   * 用途：装备面板一次性获取三个槽位的渲染数据。
   * 返回包含 weapon/armor/accessory 三个槽位的实例+配置详情，
   * 以及属性加成和装备独立战力。
   *
   * @param heroId  英雄 ID
   * @returns       三个槽位的完整详情 + 属性汇总
   */
  getHeroSlotDetails(heroId: string): HeroSlotDetails {
    const summary = this.getHeroEquipmentSummary(heroId);
    const heroEquipment = this._data.heroEquipment[heroId] ?? null;

    const resolveSlot = (uid: string | null): EquipmentInstanceDetail | null => {
      if (!uid) return null;
      return this.getEquipmentInstanceDetail(uid);
    };

    return {
      heroId,
      weapon: resolveSlot(heroEquipment?.weaponId ?? null),
      armor: resolveSlot(heroEquipment?.armorId ?? null),
      accessory: resolveSlot(heroEquipment?.accessoryId ?? null),
      attributeBonus: summary.attributeBonus,
      equipmentPower: summary.equipmentPower,
    };
  }

  // ==================== 战力联动 ====================

  /**
   * 计算英雄完整战力（含装备加成）。
   *
   * 公式：
   * HeroPower =
   *   PowerSystem.calculateHeroPowerFromProgress(heroConfig, progress, levelConfig, equipmentBonus)
   *   + Σ(equipment.power × equipmentQualityMultiplier)
   *
   * 调用方需确保 ProgressSystem 已加载配置。
   */
  calculateFullHeroPower(heroId: string): number {
    const progressSystem = ProgressSystem.getInstance();
    const powerSystem = PowerSystem.getInstance();

    const heroProgress = progressSystem.getHeroProgress(heroId);
    const heroConfig = this._getRequiredHeroConfig(heroId);
    const levelConfig = progressSystem.getLevelConfig(heroProgress.level);

    if (!levelConfig) {
      throw new Error(`[EquipmentSystem] 缺少等级配置: level=${heroProgress.level}`);
    }

    const equipmentSummary = this.getHeroEquipmentSummary(heroId);

    const basePower = powerSystem.calculateHeroPowerFromProgress(
      heroConfig,
      heroProgress,
      levelConfig,
      equipmentSummary.attributeBonus,
    );

    return basePower + equipmentSummary.equipmentPower;
  }

  /**
   * 装备变更后同步战力：重算英雄战力 → 更新 ProgressSystem → 更新总战力 → 存档。
   *
   * 调用时机：equip() / unequip() 之后。
   */
  syncHeroPowerAfterEquipmentChange(heroId: string): {
    oldPower: number;
    newPower: number;
    oldTotalPower: number;
    newTotalPower: number;
  } {
    const progressSystem = ProgressSystem.getInstance();
    const powerSystem = PowerSystem.getInstance();

    const heroProgress = progressSystem.getHeroProgress(heroId);
    const oldPower = heroProgress.power;
    const newPower = this.calculateFullHeroPower(heroId);

    // 更新受影响的单角色战力
    heroProgress.power = newPower;
    progressSystem.setHeroProgress(heroProgress);

    // 重算总战力：遍历所有有配置的英雄，分别计算含装备的完整战力
    const playerData = progressSystem.getPlayerProgressData();
    const oldTotalPower = playerData.totalPower;

    const heroPowers: number[] = [];
    const processedHeroIds = new Set<string>();

    for (const id of this._heroConfigMap.keys()) {
      processedHeroIds.add(id);
      try {
        const fullPower = this.calculateFullHeroPower(id);
        // 同步回 ProgressSystem
        const progress = progressSystem.getHeroProgress(id);
        progress.power = fullPower;
        progressSystem.setHeroProgress(progress);
        heroPowers.push(fullPower);
      } catch {
        // 角色可能尚未初始化成长数据，跳过
      }
    }

    const newTotalPower = powerSystem.calculateTotalPower(heroPowers);
    playerData.totalPower = newTotalPower;
    playerData.lastGrowthAt = Date.now();
    progressSystem.setPlayerProgressData(playerData);

    // 存档：保存每个已处理英雄的进度 + 总战力
    for (const id of processedHeroIds) {
      try {
        SaveManager.getInstance().saveHeroProgressData(progressSystem.getHeroProgress(id));
      } catch {
        // 跳过
      }
    }
    SaveManager.getInstance().savePlayerProgressData(playerData);
    SaveManager.getInstance().autoSave();

    return {
      oldPower,
      newPower,
      oldTotalPower,
      newTotalPower,
    };
  }

  // ==================== 数据重置 ====================

  /** 清空运行时装备数据（不影响配置缓存） */
  clearData(): void {
    this._data = createDefaultPlayerEquipmentData();
    this._uidCounter = 0;
  }

  // ==================== 内部方法 ====================

  /** 生成装备实例唯一 ID */
  private _generateUid(configId: string): string {
    this._uidCounter += 1;
    return `EQUIP_${configId}_${Date.now()}_${this._uidCounter}`;
  }

  /** 获取或创建英雄穿戴状态 */
  private _getOrCreateHeroEquipment(heroId: string): HeroEquipmentData {
    let data = this._data.heroEquipment[heroId];
    if (data) {
      return data;
    }

    data = createDefaultHeroEquipmentData(heroId);
    this._data.heroEquipment[heroId] = data;
    return data;
  }

  /** 根据槽位类型读取 HeroEquipmentData 对应字段 */
  private _getSlotValue(data: HeroEquipmentData, slot: EquipmentSlot): string | null {
    switch (slot) {
      case EquipmentSlot.Weapon:
        return data.weaponId;
      case EquipmentSlot.Armor:
        return data.armorId;
      case EquipmentSlot.Accessory:
        return data.accessoryId;
      default:
        return null;
    }
  }

  /**
   * 构建装备 uid → 穿戴者信息的反向索引。
   *
   * 用于 getPlayerEquipmentList 快速判断装备是否已被穿戴。
   */
  private _buildEquippedMap(): Map<string, { heroId: string; slotType: EquipmentSlot }> {
    const map = new Map<string, { heroId: string; slotType: EquipmentSlot }>();

    for (const heroEquipment of Object.values(this._data.heroEquipment)) {
      const slots: [EquipmentSlot, string | null][] = [
        [EquipmentSlot.Weapon, heroEquipment.weaponId],
        [EquipmentSlot.Armor, heroEquipment.armorId],
        [EquipmentSlot.Accessory, heroEquipment.accessoryId],
      ];

      for (const [slotType, uid] of slots) {
        if (uid) {
          map.set(uid, { heroId: heroEquipment.heroId, slotType });
        }
      }
    }

    return map;
  }

  /** 校验英雄等级是否满足装备等级需求 */
  private _validateLevelRequirement(heroId: string, config: EquipmentConfig): void {
    try {
      const progressSystem = ProgressSystem.getInstance();
      const heroLevel = progressSystem.getHeroLevel(heroId);

      if (heroLevel < config.levelRequirement) {
        throw new Error(
          `[EquipmentSystem] 英雄等级不足: heroId=${heroId}, heroLevel=${heroLevel}, ` +
          `equipment=${config.id}, requiredLevel=${config.levelRequirement}`,
        );
      }
    } catch (e) {
      // ProgressSystem 可能尚未初始化成长数据，仅做警告
      if (e instanceof Error && e.message.includes('英雄等级不足')) {
        throw e;
      }
      // 其他错误（如 ProgressSystem 未就绪），允许穿戴但打印警告
      console.warn(`[EquipmentSystem] 无法校验等级需求: heroId=${heroId}, equipment=${config.id}`);
    }
  }

  /** 从 SaveManager 恢复装备数据 */
  private _restoreFromSave(): void {
    const saveManager = SaveManager.getInstance();
    const savedEquipment = saveManager.loadData<PlayerEquipmentData>('equipment');

    if (savedEquipment && savedEquipment.instances) {
      this._data = {
        instances: { ...savedEquipment.instances },
        heroEquipment: { ...savedEquipment.heroEquipment },
      };
    }
  }

  /** 保存装备数据到 SaveManager */
  private _save(): void {
    const saveManager = SaveManager.getInstance();
    saveManager.saveData<PlayerEquipmentData>('equipment', {
      instances: { ...this._data.instances },
      heroEquipment: { ...this._data.heroEquipment },
    });
  }

  private _buildEquipmentConfigMap(config: EquipmentConfigData): Map<string, EquipmentConfig> {
    const map = new Map<string, EquipmentConfig>();

    for (const entry of config.data) {
      map.set(entry.id, entry);
    }

    if (map.size === 0) {
      throw new Error('[EquipmentSystem] equipment_config 未包含任何装备配置');
    }

    return map;
  }

  private _buildHeroConfigMap(config: HeroListData): Map<string, HeroConfig> {
    const map = new Map<string, HeroConfig>();

    for (const entry of config.data) {
      map.set(entry.id, entry);
    }

    if (map.size === 0) {
      throw new Error('[EquipmentSystem] hero_list 未包含任何角色配置');
    }

    return map;
  }

  private _getRequiredConfig(configId: string): EquipmentConfig {
    const config = this._configMap.get(configId);
    if (!config) {
      throw new Error(`[EquipmentSystem] 缺少装备配置: configId=${configId}`);
    }

    return config;
  }

  private _getRequiredInstance(uid: string): EquipmentInstanceData {
    const instance = this._data.instances[uid];
    if (!instance) {
      throw new Error(`[EquipmentSystem] 装备实例不存在: uid=${uid}`);
    }

    return instance;
  }

  private _getRequiredHeroConfig(heroId: string): HeroConfig {
    const config = this._heroConfigMap.get(heroId);
    if (!config) {
      throw new Error(`[EquipmentSystem] 缺少角色配置: heroId=${heroId}`);
    }

    return config;
  }

  private _emitEquipmentGained(data: EquipmentGainedEventData): void {
    EventManager.getInstance().emit(EquipmentSystem.EQUIPMENT_GAINED, data);
  }

  private _emitHeroEquipmentChanged(data: HeroEquipmentChangedEventData): void {
    EventManager.getInstance().emit(EquipmentSystem.HERO_EQUIPMENT_CHANGED, data);
  }
}
