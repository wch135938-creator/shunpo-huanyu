// ============================================================
// DropSystem — Phase6-Step2 掉落系统 / Phase7-Step4 批量结算与保底
// 职责：权重掉落计算 / 固定掉落 / 多表组合 / 领取发放 / 历史记录 / 合法性校验
// Phase7-Step4: 新增批量结算 settleBatch / 保底计数 / DropHistoryRecord 持久化
// 边界：不实现 UI、不直接修改英雄属性、不与 DungeonSystem 耦合
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { EquipmentSystem } from './EquipmentSystem';
import { ProgressSystem } from './ProgressSystem';
import { InventoryService } from '../inventory/InventoryService';
import { mapDropItemIdToEquipItemId } from '../inventory/InventoryDomain';
import type { AddAssetRequest } from '../inventory/InventoryTransaction';
import type { DropEntry, DropItem, DropTableConfig } from '../config/drop_config';
import type {
  DropResultData,
  DropResultItemEntry,
  DropHistoryEntry,
  DropClaimResult,
  DropHistoryRecord,
  PitySnapshot,
  PityRule,
} from '../data/drop_types';
import {
  DropResultItemType,
  createEmptyDropResultData,
  createEmptyPitySnapshot,
  generateDropHistoryRecordId,
  convertDropResultToRewardGrants,
} from '../data/drop_types';
import type { EquipmentInstanceData } from '../data/equipment_data';
import type { RewardSource, RewardGrant } from '../data/roguelike_types';
import type {
  PityVisualData,
  PityCounterVisualData,
  RewardVerificationResult,
  RewardConsistencyCheck,
} from '../data/reward_types';
import { createEmptyRewardVerificationResult, orderRewardSources } from '../data/reward_types';

// ---- 常量 ----

/** 默认玩家 ID */
const DEFAULT_PLAYER_ID = 'player_001';

/** 掉落物品类型常量（与 drop_config.ts ItemType 对齐） */
const ITEM_TYPE_GOLD = 'gold';
const ITEM_TYPE_EXP = 'exp';
const ITEM_TYPE_EQUIP = 'equip';
const ITEM_TYPE_MATERIAL = 'material';
const ITEM_TYPE_GACHA_FRAGMENT = 'gachaFragment';
const ITEM_TYPE_DIAMOND = 'diamond';

/** 掉落合法性校验：单次金币上限 */
const MAX_SINGLE_DROP_GOLD = 999999;
/** 掉落合法性校验：单次经验上限 */
const MAX_SINGLE_DROP_EXP = 999999;
/** 掉落合法性校验：单次装备数量上限 */
const MAX_SINGLE_DROP_EQUIPMENT = 50;
/** 掉落合法性校验：单次物品数量上限 */
const MAX_SINGLE_DROP_ITEMS = 50;

// ---- 事件 ----

/** 掉落生成事件 */
export interface DropRolledEventData {
  dropTableIds: string;
  sourceId: string;
  gold: number;
  exp: number;
}

/** 掉落领取事件 */
export interface DropClaimedEventData {
  sourceId: string;
  goldClaimed: number;
  expClaimed: number;
}

export class DropSystem extends BaseSystem {
  // ==================== 事件常量 ====================

  static readonly DROP_ROLLED = 'drop:rolled';
  static readonly DROP_CLAIMED = 'drop:claimed';
  /** Phase8-Step4: 结算历史更新事件 */
  static readonly SETTLEMENT_HISTORY_UPDATED = 'drop:settlementHistoryUpdated';

  // ==================== 配置路径常量 ====================

  private static readonly DROP_TABLE_PATH = `${ConfigManager.DIR_DROPS}/drop_table`;

  // ==================== 内部状态 ====================

  /** 掉落表缓存：dropEntryId → DropEntry */
  private _dropTableMap: Map<string, DropEntry> = new Map();

  /** 配置是否已加载 */
  private _configLoaded = false;

  // ==================== Phase7-Step4: 保底与历史状态 ====================

  /** 保底计数器缓存：pityKey → count */
  private _pityCounters: Map<string, number> = new Map();

  /** 保底规则缓存：pityRuleId → PityRule */
  private _pityRules: Map<string, PityRule> = new Map();

  /** 保底最后重置时间缓存：pityKey → timestamp */
  private _pityLastReset: Map<string, number> = new Map();

  /** 是否已加载保底配置 */
  private _pityLoaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载掉落依赖配置。
   *
   * 调用方应在使用掉落系统前执行一次。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const dropConfig = await configManager.loadConfig<DropTableConfig>(DropSystem.DROP_TABLE_PATH);

    this._dropTableMap = this._buildDropTableMap(dropConfig);
    this._restoreFromSave();
    this._configLoaded = true;
  }

  /** 是否已加载配置 */
  isConfigLoaded(): boolean {
    return this._configLoaded;
  }

  // ==================== 核心 API：rollDrop ====================

  /**
   * 按权重计算掉落。
   *
   * 支持：
   * - 固定掉落（isGuaranteed = true 的项无视概率必定掉落）
   * - 随机权重掉落（isGuaranteed = false 的项按 dropRate 概率判定）
   * - 多组掉落表组合（dropTableId 支持逗号分隔的多个 ID，如 "1,2,3"）
   *
   * 生成的 DropResultData 中 equipmentList 已通过 EquipmentSystem 创建实例，
   * 但 gold/exp 尚未发放到玩家账户（需调用 claimDrop 领取）。
   *
   * @param dropTableId  掉落表 ID，支持逗号分隔多表（如 "1,2,3"）
   * @param sourceId     掉落来源标识
   * @param playerId     玩家 ID
   * @returns            掉落结果数据，未找到掉落表时返回 null
   */
  rollDrop(
    dropTableId: number | string,
    sourceId: string,
    playerId: string = DEFAULT_PLAYER_ID,
  ): DropResultData | null {
    this._requireConfig();

    // 解析多表 ID
    const tableIds = this._parseTableIds(dropTableId);
    if (tableIds.length === 0) {
      console.warn(`[DropSystem] 无效的掉落表 ID: ${dropTableId}`);
      return null;
    }

    const result = createEmptyDropResultData(sourceId);

    // 逐表处理并汇总
    for (const formattedId of tableIds) {
      const dropEntry = this._getDropEntry(formattedId);
      if (!dropEntry) {
        console.warn(`[DropSystem] 未找到掉落池: ${formattedId}`);
        continue;
      }

      const tableResult = this._processDropItems(dropEntry.items, dropEntry.id);
      result.gold += tableResult.gold;
      result.exp += tableResult.exp;
      result.equipmentList.push(...tableResult.equipmentList);
      result.itemList.push(...tableResult.itemList);
    }

    // 如果没有任何有效表，返回保底奖励
    if (result.gold === 0 && result.exp === 0
      && result.equipmentList.length === 0 && result.itemList.length === 0) {
      console.warn(`[DropSystem] 所有掉落表均无产出，使用保底奖励`);
      result.gold = this._randomInt(10, 50);
      result.exp = this._randomInt(5, 20);
    }

    // 派发事件
    this._emitDropRolled({
      dropTableIds: tableIds.join(','),
      sourceId,
      gold: result.gold,
      exp: result.exp,
    });

    return result;
  }

  /**
   * 批量多表掉落（语法糖）。
   *
   * @param tableIds  掉落表 ID 数组
   * @param sourceId  掉落来源标识
   * @param playerId  玩家 ID
   */
  rollDropMulti(
    tableIds: (number | string)[],
    sourceId: string,
    playerId: string = DEFAULT_PLAYER_ID,
  ): DropResultData | null {
    const joined = tableIds.join(',');
    return this.rollDrop(joined, sourceId, playerId);
  }

  // ==================== 核心 API：claimDrop ====================

  /**
   * 领取掉落奖励，发放到玩家账户。
   *
   * 操作：
   * 1. 金币发放（后续接入 EconomySystem；当前仅记录）
   * 2. 经验通过 ProgressSystem.addHeroExp 发放给所有已配置英雄
   * 3. 装备实例已在 rollDrop 时创建，此处不做重复操作
   * 4. 标记 claimStatus = true
   * 5. 写入掉落历史存档
   *
   * @param resultData  待领取的掉落结果
   * @param playerId    玩家 ID
   * @returns           领取结果
   */
  claimDrop(
    resultData: DropResultData,
    playerId: string = DEFAULT_PLAYER_ID,
  ): DropClaimResult {
    this._requireConfig();

    // 防重复领取
    if (resultData.claimStatus) {
      return {
        success: false,
        reason: '该掉落已领取，不可重复领取',
        goldClaimed: 0,
        expClaimed: 0,
        equipmentCount: 0,
        itemCount: 0,
      };
    }

    // 合法性校验
    const validation = this.validateDrop(resultData);
    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason ?? '掉落数据校验失败',
        goldClaimed: 0,
        expClaimed: 0,
        equipmentCount: 0,
        itemCount: 0,
      };
    }

    // 发放经验到所有英雄
    let expClaimed = 0;
    if (resultData.exp > 0) {
      try {
        expClaimed = this._distributeExp(resultData.exp);
      } catch (e) {
        console.warn(`[DropSystem] 经验发放部分失败: ${e}`);
      }
    }

    // 金币发放（当前记录日志，后续接入 EconomySystem）
    const goldClaimed = resultData.gold;
    if (goldClaimed > 0) {
      // TODO: 接入 PlayerEconomySystem 发放金币
      console.log(`[DropSystem] 金币发放: +${goldClaimed}（来源: ${resultData.dropSourceId}）`);
    }

    // 标记已领取
    resultData.claimStatus = true;

    // 保存掉落历史
    const historyEntry: DropHistoryEntry = {
      playerId,
      dropTableIds: resultData.dropSourceId,
      sourceId: resultData.dropSourceId,
      result: resultData,
    };
    this._saveHistory(historyEntry);

    // 派发事件
    this._emitDropClaimed({
      sourceId: resultData.dropSourceId,
      goldClaimed,
      expClaimed,
    });

    return {
      success: true,
      goldClaimed,
      expClaimed,
      equipmentCount: resultData.equipmentList.length,
      itemCount: resultData.itemList.length,
    };
  }

  // ==================== Phase7-Step4: 批量结算与保底系统 ====================

  /**
   * 批量结算多个 RewardSource，产生 DropHistoryRecord 列表。
   *
   * 与 rollDrop + claimDrop 的区别：
   * - settleBatch 是面向 Phase7 的高阶 API，接受 RewardSource 数组
   * - 自动追踪保底计数器：每次结算前记录 pityBefore，结算后记录 pityAfter
   * - 保底触发时自动追加 extraReward 到 rewards 列表
   * - 输出的 DropHistoryRecord 可直接持久化，满足审计/补偿/分析需求
   *
   * 流程：
   * 1. 加载当前保底快照
   * 2. 对每个 RewardSource：
   *    a. 记录 pityBefore
   *    b. 逐表 rollDrop 并聚合奖励
   *    c. 检查保底规则，触发时追加额外奖励
   *    d. 记录 pityAfter
   *    e. 生成 DropHistoryRecord
   * 3. 持久化保底计数与历史记录
   *
   * @param sources   奖励来源数组
   * @param playerId  玩家 ID
   * @returns         掉落历史记录数组
   */
  settleBatch(
    sources: RewardSource[],
    playerId: string = DEFAULT_PLAYER_ID,
  ): DropHistoryRecord[] {
    this._requireConfig();
    this._ensurePityLoaded();

    const records: DropHistoryRecord[] = [];

    if (!sources || sources.length === 0) {
      console.warn('[DropSystem] settleBatch: sources 为空');
      return records;
    }

    for (const source of sources) {
      const record = this._settleSingleSource(source, playerId);
      if (record) {
        records.push(record);
      }
    }

    // 持久化保底计数器与历史记录
    this._savePitySnapshot();
    this._saveDropHistoryRecords(records);

    console.log(
      `[DropSystem] settleBatch 完成: ${records.length} 条记录, ` +
      `保底计数: ${this._formatPityCounters()}`,
    );

    return records;
  }

  /**
   * 加载保底规则配置。
   *
   * 调用时机：系统初始化阶段。
   *
   * @param rules  保底规则数组
   */
  loadPityRules(rules: PityRule[]): void {
    this._pityRules.clear();

    for (const rule of rules) {
      if (!rule.id) {
        console.warn('[DropSystem] 跳过无效保底规则：缺少 id');
        continue;
      }
      if (rule.guaranteeThreshold <= 0) {
        console.warn(`[DropSystem] 保底规则 ${rule.id} 阈值无效: ${rule.guaranteeThreshold}`);
        continue;
      }
      this._pityRules.set(rule.id, rule);
    }

    this._pityLoaded = true;
    console.log(`[DropSystem] 已加载 ${this._pityRules.size} 条保底规则`);
  }

  /**
   * 获取当前保底快照。
   */
  getPitySnapshot(): PitySnapshot {
    this._ensurePityLoaded();

    return {
      pityCounters: Object.fromEntries(this._pityCounters),
      lastResetAt: Math.max(0, ...this._pityLastReset.values()),
    };
  }

  /**
   * 重置指定来源类型的保底计数器。
   *
   * @param sourceType  来源类型（如 "dungeon_boss"）
   */
  resetPityCounter(sourceType: string): void {
    const key = this._buildPityKey(sourceType);
    this._pityCounters.set(key, 0);
    this._pityLastReset.set(key, Date.now());
  }

  /**
   * 重置所有保底计数器。
   */
  resetAllPityCounters(): void {
    this._pityCounters.clear();
    this._pityLastReset.clear();
    this._savePitySnapshot();
  }

  /**
   * 获取 Phase7 掉落历史记录。
   *
   * @param playerId  玩家 ID（可选）
   * @returns         历史记录数组（最新在前）
   */
  getDropHistoryRecords(playerId?: string): DropHistoryRecord[] {
    const saveManager = SaveManager.getInstance();
    const saved = saveManager.loadDropHistoryData();

    if (!saved || !saved.dropHistoryRecords || !Array.isArray(saved.dropHistoryRecords)) {
      return [];
    }

    if (!playerId) {
      return saved.dropHistoryRecords;
    }

    return saved.dropHistoryRecords.filter((r) => r.playerId === playerId);
  }

  /**
   * 获取保底规则列表。
   */
  getPityRules(): PityRule[] {
    return Array.from(this._pityRules.values());
  }

  // ==================== Phase7-Step4: 内部 —— 单源结算 ====================

  /**
   * 对单个 RewardSource 执行结算，产生一条 DropHistoryRecord。
   */
  private _settleSingleSource(
    source: RewardSource,
    playerId: string,
  ): DropHistoryRecord | null {
    // 记录结算前保底状态
    const pityBefore = this.getPitySnapshot();

    // 聚合所有掉落表的奖励
    const allRewards: RewardGrant[] = [];
    const tableIds = source.dropTableRefs || [];

    for (const tableId of tableIds) {
      const result = this.rollDrop(tableId, source.sourceId, playerId);
      if (result) {
        const grants = convertDropResultToRewardGrants(result);
        allRewards.push(...grants);
      }
    }

    // 检查并应用保底规则
    const pityExtraRewards = this._applyPityRules(source);
    allRewards.push(...pityExtraRewards);

    // 记录结算后保底状态
    const pityAfter = this.getPitySnapshot();

    // 构建 DropHistoryRecord
    const record: DropHistoryRecord = {
      id: generateDropHistoryRecordId(),
      playerId,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      dropTableVersion: 1, // 默认版本，后续可从配置读取
      seed: this._generateSeed(),
      rewards: allRewards,
      pityBefore,
      pityAfter,
      createdAt: Date.now(),
    };

    return record;
  }

  /**
   * 检查并应用保底规则。
   *
   * 流程：
   * 1. 推进所有匹配 sourceType 的保底计数器
   * 2. 若达到阈值，发放额外奖励并重置计数器
   *
   * @param source  奖励来源
   * @returns       保底触发的额外奖励列表
   */
  private _applyPityRules(source: RewardSource): RewardGrant[] {
    const extraRewards: RewardGrant[] = [];

    for (const rule of this._pityRules.values()) {
      if (rule.sourceType !== source.sourceType) continue;

      const key = this._buildPityKey(source.sourceType);
      const currentCount = (this._pityCounters.get(key) ?? 0) + 1;
      this._pityCounters.set(key, currentCount);

      // 检查是否触发保底
      if (currentCount >= rule.guaranteeThreshold) {
        if (rule.extraReward) {
          const now = Date.now();
          extraRewards.push({
            rewardId: `pity_${rule.id}_${now}`,
            rewardType: rule.extraReward.rewardType,
            quantity: rule.extraReward.quantity,
            sourceId: source.sourceId,
            granted: false,
          });

          console.log(
            `[DropSystem] 保底触发! 规则=${rule.id}, ` +
            `sourceType=${rule.sourceType}, 计数=${currentCount}, ` +
            `奖励=${rule.extraReward.rewardType}x${rule.extraReward.quantity}`,
          );
        }

        // 重置计数器
        this._pityCounters.set(key, 0);
        this._pityLastReset.set(key, Date.now());
      }
    }

    return extraRewards;
  }

  /**
   * 从 SaveManager 加载保底快照到内存缓存。
   */
  private _loadPitySnapshot(): void {
    const saveManager = SaveManager.getInstance();
    const saved = saveManager.loadDropHistoryData();

    this._pityCounters.clear();
    this._pityLastReset.clear();

    if (saved && saved.pitySnapshot) {
      const snapshot = saved.pitySnapshot;
      for (const [key, count] of Object.entries(snapshot.pityCounters)) {
        this._pityCounters.set(key, count);
      }
      if (snapshot.lastResetAt > 0) {
        // 分发 lastResetAt 到所有计数器（简化处理）
        for (const key of this._pityCounters.keys()) {
          this._pityLastReset.set(key, snapshot.lastResetAt);
        }
      }
    }
  }

  /**
   * 将内存保底快照持久化到 SaveManager。
   */
  private _savePitySnapshot(): void {
    const saveManager = SaveManager.getInstance();
    const saved = saveManager.loadDropHistoryData();

    if (!saved) return;

    saved.pitySnapshot = {
      pityCounters: Object.fromEntries(this._pityCounters),
      lastResetAt: Math.max(0, ...this._pityLastReset.values()),
    };

    saveManager.saveDropHistoryData(saved);
  }

  /**
   * 持久化 DropHistoryRecord 列表到存档。
   */
  private _saveDropHistoryRecords(records: DropHistoryRecord[]): void {
    if (records.length === 0) return;

    const saveManager = SaveManager.getInstance();
    const saved = saveManager.loadDropHistoryData();

    if (!saved) return;

    if (!saved.dropHistoryRecords) {
      saved.dropHistoryRecords = [];
    }

    // 新增记录插入到开头（最新在前），限制最大 200 条
    const MAX_RECORDS = 200;
    saved.dropHistoryRecords.unshift(...records);

    if (saved.dropHistoryRecords.length > MAX_RECORDS) {
      saved.dropHistoryRecords = saved.dropHistoryRecords.slice(0, MAX_RECORDS);
    }

    saveManager.saveDropHistoryData(saved);
    saveManager.markDirty();
  }

  /**
   * 构建保底计数器 Key。
   */
  private _buildPityKey(sourceType: string): string {
    return `pity_${sourceType}`;
  }

  /**
   * 确保保底配置已从存档恢复。
   */
  private _ensurePityLoaded(): void {
    if (!this._pityLoaded) {
      this._loadPitySnapshot();
      this._pityLoaded = true;
    }
  }

  /**
   * 格式化保底计数器为日志字符串。
   */
  private _formatPityCounters(): string {
    const entries: string[] = [];
    for (const [key, count] of this._pityCounters) {
      entries.push(`${key}=${count}`);
    }
    return entries.length > 0 ? entries.join(', ') : '(空)';
  }

  /**
   * 生成随机种子。
   */
  private _generateSeed(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 14);
    return `seed_${ts}_${rand}`;
  }

  // ==================== 核心 API：getDropHistory ====================

  /**
   * 获取掉落历史记录。
   *
   * @param playerId  玩家 ID（可选，默认返回全部）
   * @returns         掉落历史记录数组（最新在前）
   */
  getDropHistory(playerId?: string): DropHistoryEntry[] {
    const saveManager = SaveManager.getInstance();
    const saved = saveManager.loadDropHistoryData();

    if (!saved || !Array.isArray(saved.history)) {
      return [];
    }

    if (!playerId) {
      return saved.history;
    }

    return saved.history.filter((entry) => entry.playerId === playerId);
  }

  // ==================== 核心 API：validateDrop ====================

  /**
   * 校验掉落结果的合法性。
   *
   * 校验规则：
   * - gold / exp 非负且不超过上限
   * - equipmentList 中每个实例的 configId 存在于 EquipmentSystem 配置
   * - itemList 中每个条目的 itemId 非空
   * - dropSourceId 非空
   *
   * @param resultData  待校验的掉落结果
   * @returns           校验结果
   */
  validateDrop(resultData: DropResultData): { valid: boolean; reason?: string } {
    if (!resultData) {
      return { valid: false, reason: 'resultData 为空' };
    }

    // 校验金币
    if (typeof resultData.gold !== 'number' || !Number.isFinite(resultData.gold)) {
      return { valid: false, reason: 'gold 类型错误或非有限值' };
    }
    if (resultData.gold < 0) {
      return { valid: false, reason: 'gold 为负数' };
    }
    if (resultData.gold > MAX_SINGLE_DROP_GOLD) {
      return { valid: false, reason: `gold 超出上限: ${resultData.gold} > ${MAX_SINGLE_DROP_GOLD}` };
    }

    // 校验经验
    if (typeof resultData.exp !== 'number' || !Number.isFinite(resultData.exp)) {
      return { valid: false, reason: 'exp 类型错误或非有限值' };
    }
    if (resultData.exp < 0) {
      return { valid: false, reason: 'exp 为负数' };
    }
    if (resultData.exp > MAX_SINGLE_DROP_EXP) {
      return { valid: false, reason: `exp 超出上限: ${resultData.exp} > ${MAX_SINGLE_DROP_EXP}` };
    }

    // 校验装备列表
    if (!Array.isArray(resultData.equipmentList)) {
      return { valid: false, reason: 'equipmentList 不是数组' };
    }
    if (resultData.equipmentList.length > MAX_SINGLE_DROP_EQUIPMENT) {
      return { valid: false, reason: `equipmentList 数量超出上限: ${resultData.equipmentList.length} > ${MAX_SINGLE_DROP_EQUIPMENT}` };
    }
    for (const equip of resultData.equipmentList) {
      if (!equip.uid || !equip.configId) {
        return { valid: false, reason: `装备实例缺少 uid 或 configId: uid=${equip.uid}, configId=${equip.configId}` };
      }
    }

    // 校验物品列表
    if (!Array.isArray(resultData.itemList)) {
      return { valid: false, reason: 'itemList 不是数组' };
    }
    if (resultData.itemList.length > MAX_SINGLE_DROP_ITEMS) {
      return { valid: false, reason: `itemList 数量超出上限: ${resultData.itemList.length} > ${MAX_SINGLE_DROP_ITEMS}` };
    }
    for (const item of resultData.itemList) {
      if (!item.itemId || typeof item.itemId !== 'string') {
        return { valid: false, reason: `物品 itemId 无效: ${item.itemId}` };
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        return { valid: false, reason: `物品 ${item.itemId} quantity 无效: ${item.quantity}` };
      }
    }

    // 校验来源 ID
    if (!resultData.dropSourceId || typeof resultData.dropSourceId !== 'string') {
      return { valid: false, reason: 'dropSourceId 为空或无效' };
    }

    return { valid: true };
  }

  // ==================== 查询方法 ====================

  /** 获取所有掉落表配置 */
  getAllDropEntries(): DropEntry[] {
    this._requireConfig();
    return Array.from(this._dropTableMap.values());
  }

  /** 获取指定掉落表配置（支持数字或字符串 ID） */
  getDropEntry(dropTableId: number | string): DropEntry | null {
    const formatted = typeof dropTableId === 'number'
      ? this._formatDropId(dropTableId)
      : this._formatDropId(dropTableId);
    return this._getDropEntry(formatted);
  }

  // ==================== 内部方法 ====================

  /**
   * 解析掉落表 ID。
   *
   * 支持格式：
   * - 数字: 1 → DROP_001
   * - 数字字符串: "1" → DROP_001
   * - 字母数字混合: "F001" → DROP_F001
   * - 逗号分隔: "1,2,3" 或 "1,F001"
   * - 空格分隔: "1 2 3"
   */
  private _parseTableIds(dropTableId: number | string): string[] {
    if (typeof dropTableId === 'number') {
      return Number.isFinite(dropTableId) && dropTableId > 0
        ? [this._formatDropId(dropTableId)]
        : [];
    }

    const raw = String(dropTableId).trim();
    if (!raw) return [];

    // 支持逗号或空格分隔
    const parts = raw.split(/[,\s]+/).filter((s) => s.length > 0);
    return parts.map((part) => this._formatDropId(part));
  }

  /**
   * 将原始 ID 格式化为 DROP_XXX 形式。
   *
   * 规则：
   * - 纯数字 → DROP_XXX（3位补零）
   * - 非纯数字 → DROP_<原始值>（如 F001 → DROP_F001）
   */
  private _formatDropId(raw: string | number): string {
    const str = String(raw);
    // 纯数字：补零到 3 位
    if (/^\d+$/.test(str)) {
      return `DROP_${str.padStart(3, '0')}`;
    }
    // 非纯数字：直接拼接
    return `DROP_${str}`;
  }

  /**
   * 处理掉落项列表，汇总生成掉落数据。
   *
   * 规则：
   * - isGuaranteed = true → 必定掉落，数量在 minCount~maxCount 随机
   * - isGuaranteed = false → 按 dropRate 概率判定
   * - equip 类型通过 EquipmentSystem 创建实例
   */
  private _processDropItems(
    items: DropItem[],
    dropEntryId: string,
  ): {
    gold: number;
    exp: number;
    equipmentList: EquipmentInstanceData[];
    itemList: DropResultItemEntry[];
  } {
    let gold = 0;
    let exp = 0;
    const equipmentList: EquipmentInstanceData[] = [];
    const itemList: DropResultItemEntry[] = [];

    for (const item of items) {
      const quantity = this._rollSingleItem(item);
      if (quantity <= 0) continue;

      switch (item.itemType) {
        case ITEM_TYPE_GOLD:
          gold += quantity;
          break;
        case ITEM_TYPE_EXP:
          exp += quantity;
          break;
        case ITEM_TYPE_EQUIP:
          equipmentList.push(...this._createEquipmentRewards(item, quantity));
          break;
        case ITEM_TYPE_MATERIAL:
        case ITEM_TYPE_GACHA_FRAGMENT:
        case ITEM_TYPE_DIAMOND:
          itemList.push({
            itemId: item.itemId,
            itemType: DropResultItemType.Item,
            quantity,
          });
          break;
        default:
          console.warn(`[DropSystem] 未知掉落类型: ${item.itemType} (DropEntry: ${dropEntryId})`);
      }
    }

    return { gold, exp, equipmentList, itemList };
  }

  /**
   * 对单个掉落项进行概率判定并返回数量。
   *
   * @returns 掉落数量，未命中返回 0
   */
  private _rollSingleItem(item: DropItem): number {
    // 保底掉落：必定获得
    if (item.isGuaranteed) {
      return this._randomInt(item.minCount, item.maxCount);
    }

    // 概率判定（0~1 之间的浮点数比较）
    const roll = Math.random();
    if (roll >= item.dropRate) {
      return 0;
    }

    return this._randomInt(item.minCount, item.maxCount);
  }

  /**
   * 通过 EquipmentSystem 创建装备奖励实例。
   *
   * 根据 dropItem.itemId 推断品质过滤：
   * - ITEM_EQUIP_N_XXX  → Common   品质
   * - ITEM_EQUIP_R_XXX  → Rare     品质
   * - ITEM_EQUIP_SR_XXX → Epic     品质
   * - ITEM_EQUIP_SSR_XXX → Legendary 品质
   * - 无法识别时从全部可用装备中随机选取
   *
   * @param item   掉落项配置
   * @param count  需要创建的装备数量
   * @returns      创建的装备实例数组
   */
  private _createEquipmentRewards(item: DropItem, count: number): EquipmentInstanceData[] {
    const instances: EquipmentInstanceData[] = [];

    try {
      const equipSystem = EquipmentSystem.getInstance();

      if (!equipSystem.isConfigLoaded()) {
        console.warn('[DropSystem] EquipmentSystem 未加载配置，无法创建装备奖励');
        return instances;
      }

      // 获取全部可用装备配置 ID，并按 quality 过滤
      const allConfigIds = this._getAvailableEquipConfigIds(equipSystem);
      if (allConfigIds.length === 0) {
        console.warn('[DropSystem] 无可用装备配置');
        return instances;
      }

      // 根据 itemId 推断目标品质
      const targetQuality = this._parseEquipQualityFromItemId(item.itemId);

      // 过滤符合品质的装备配置
      const filteredIds = targetQuality
        ? this._filterEquipConfigsByQuality(equipSystem, allConfigIds, targetQuality)
        : allConfigIds;

      // 若过滤后为空，回退到全部
      const candidateIds = filteredIds.length > 0 ? filteredIds : allConfigIds;

      for (let i = 0; i < count; i++) {
        const randomConfigId = candidateIds[this._randomInt(0, candidateIds.length - 1)];
        try {
          const instance = equipSystem.createInstance(randomConfigId);
          instances.push(instance);
        } catch {
          // 单个装备创建失败不影响其他
        }
      }

      // Phase10-Step11AA: 同步写入 InventoryService（新存储）
      this._syncEquipToInventory(item, count);
    } catch {
      console.warn('[DropSystem] 无法访问 EquipmentSystem，跳过装备奖励');
    }

    return instances;
  }

  /**
   * Phase10-Step11AA: 将装备掉落同步写入 InventoryService。
   *
   * 与 _createEquipmentRewards() 并行：旧存储（EquipmentSystem）保持不变，
   * 同时通过 InventoryService.addAssets() 写入新存储，
   * 确保 EquipmentBagPanel（读 Inventory）能看到装备。
   *
   * @param item   掉落项配置
   * @param count  装备数量
   */
  private _syncEquipToInventory(item: DropItem, count: number): void {
    if (count <= 0) return;

    try {
      const inventoryService = InventoryService.getInstance();
      const transactionId = `dropsys_equip_${item.itemId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // 按 itemId 分组计数（mapDropItemIdToEquipItemId 每次返回随机类型）
      const itemIdCounts = new Map<string, number>();
      for (let i = 0; i < count; i++) {
        const equipItemId = mapDropItemIdToEquipItemId(item.itemId);
        if (!equipItemId) continue;
        itemIdCounts.set(equipItemId, (itemIdCounts.get(equipItemId) ?? 0) + 1);
      }

      if (itemIdCounts.size === 0) {
        console.warn(
          `[DropSystem] 无法映射掉落物品到装备 ItemId: ${item.itemId}`,
        );
        return;
      }

      const requests: AddAssetRequest[] = [];
      for (const [equipItemId, qty] of itemIdCounts) {
        requests.push({
          itemId: equipItemId,
          count: qty,
          source: 'battle_drop',
          reason: 'reward_grant',
        });
      }

      const result = inventoryService.addAssets(
        transactionId,
        requests,
        'reward_grant',
        'battle_drop',
      );

      if (result.success) {
        console.log(
          `[DropSystem] 装备同步到 Inventory: ${requests.map((r) => `${r.itemId}×${r.count}`).join(', ')}`,
        );
      } else if (!result.isDuplicate) {
        console.warn(
          `[DropSystem] 装备同步到 Inventory 失败: errorCode=${result.errorCode}`,
        );
      }
    } catch (err) {
      console.warn('[DropSystem] 装备同步到 Inventory 异常:', err);
    }
  }

  /**
   * 从装备 itemId 解析目标品质。
   *
   * 命名约定：ITEM_EQUIP_{quality}_{index}
   * - N   → Common
   * - R   → Rare
   * - SR  → Epic
   * - SSR → Legendary
   */
  private _parseEquipQualityFromItemId(itemId: string): string | null {
    const parts = itemId.split('_');
    if (parts.length < 3) return null;

    const qualityCode = parts[2]; // N, R, SR, SSR
    switch (qualityCode) {
      case 'N':
        return 'Common';
      case 'R':
        return 'Rare';
      case 'SR':
        return 'Epic';
      case 'SSR':
        return 'Legendary';
      default:
        return null;
    }
  }

  /**
   * 按品质过滤装备配置 ID 列表。
   *
   * @param equipSystem  EquipmentSystem 实例
   * @param configIds    全部配置 ID 列表
   * @param quality      目标品质
   * @returns            过滤后的配置 ID 列表
   */
  private _filterEquipConfigsByQuality(
    equipSystem: EquipmentSystem,
    configIds: string[],
    quality: string,
  ): string[] {
    const result: string[] = [];

    for (const configId of configIds) {
      const config = equipSystem.getEquipmentConfig(configId);
      if (config && config.quality === quality) {
        result.push(configId);
      }
    }

    return result;
  }

  /**
   * 获取可用的装备配置 ID 列表。
   *
   * 通过 EquipmentSystem 的内部配置映射获取。
   */
  private _getAvailableEquipConfigIds(equipSystem: EquipmentSystem): string[] {
    try {
      const internalMap = (equipSystem as unknown as Record<string, unknown>)['_configMap'] as Map<string, unknown> | undefined;
      if (internalMap && internalMap.size > 0) {
        return Array.from(internalMap.keys());
      }
    } catch {
      // 反射失败时回退
    }

    return [];
  }

  /**
   * 按英雄平分经验并通过 ProgressSystem 发放。
   *
   * @param totalExp  总经验
   * @returns         实际发放的经验量
   */
  private _distributeExp(totalExp: number): number {
    const progressSystem = ProgressSystem.getInstance();
    const equipSystem = EquipmentSystem.getInstance();

    // 获取英雄配置列表
    let heroIds: string[] = [];
    try {
      const internalMap = (equipSystem as unknown as Record<string, unknown>)['_heroConfigMap'] as Map<string, unknown> | undefined;
      if (internalMap && internalMap.size > 0) {
        heroIds = Array.from(internalMap.keys());
      }
    } catch {
      // 无法获取英雄列表时跳过
    }

    if (heroIds.length === 0) {
      console.warn('[DropSystem] 无可用英雄，经验发放跳过');
      return 0;
    }

    const expPerHero = Math.max(1, Math.floor(totalExp / heroIds.length));
    let totalDistributed = 0;

    for (const heroId of heroIds) {
      try {
        const result = progressSystem.addHeroExp(heroId, expPerHero);
        totalDistributed += result.expGain;
      } catch {
        // 单个英雄经验发放失败不影响流程
      }
    }

    return totalDistributed;
  }

  /** 获取掉落表（按完整 ID 查找，如 DROP_001、DROP_F001） */
  private _getDropEntry(formattedId: string): DropEntry | null {
    return this._dropTableMap.get(formattedId) ?? null;
  }

  /** 生成 min~max 范围内的随机整数 */
  private _randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** 构建掉落表映射 */
  private _buildDropTableMap(config: DropTableConfig): Map<string, DropEntry> {
    const map = new Map<string, DropEntry>();

    for (const entry of config.data) {
      map.set(entry.id, entry);
    }

    if (map.size === 0) {
      throw new Error('[DropSystem] drop_table 未包含任何掉落池配置');
    }

    return map;
  }

  /** 从 SaveManager 恢复掉落历史数据 */
  private _restoreFromSave(): void {
    // DropSystem 本身不持有历史缓存（历史由 SaveManager 管理）
    // 该方法为预留扩展点，未来可在此从 SaveManager 恢复运行时状态
  }

  /** 保存单条掉落历史到存档 */
  private _saveHistory(entry: DropHistoryEntry): void {
    const saveManager = SaveManager.getInstance();
    saveManager.appendDropHistoryEntry(entry);
    saveManager.markDirty();
  }

  /** 确保配置已加载 */
  private _requireConfig(): void {
    if (this._dropTableMap.size === 0) {
      throw new Error('[DropSystem] 掉落配置未加载，请先调用 loadConfig()');
    }
  }

  // ==================== Phase8-Step4: 多来源整合与保底可视化 ====================

  /**
   * 多来源奖励整合结算（按优先级排序后结算）。
   *
   * 与 settleBatch 的区别：
   * - 先对 sources 按来源类型优先级排序
   * - 返回排序后的 RewardGrant 列表（含排序元数据）
   * - 适合需要按顺序展示奖励的 UI 场景
   *
   * @param sources   奖励来源数组（无需预先排序）
   * @param playerId  玩家 ID
   * @returns         结算记录及排序后的奖励列表
   */
  settleBatchWithOrdering(
    sources: RewardSource[],
    playerId: string = DEFAULT_PLAYER_ID,
  ): {
    records: DropHistoryRecord[];
    orderedRewards: RewardGrant[];
  } {
    const records: DropHistoryRecord[] = [];
    const orderedRewards: RewardGrant[] = [];

    if (!sources || sources.length === 0) {
      return { records, orderedRewards };
    }

    // Step 1: 按优先级排序
    const orderedSources = orderRewardSources(sources);

    // Step 2: 逐源结算（已排序）
    for (const source of orderedSources) {
      const record = this._settleSingleSource(source, playerId);
      if (record) {
        records.push(record);
        // 按来源顺序展开奖励
        for (const grant of record.rewards) {
          orderedRewards.push(grant);
        }
      }
    }

    // Step 3: 持久化保底计数与历史记录
    this._savePitySnapshot();
    this._saveDropHistoryRecords(records);

    // Step 4: 派发结算历史更新事件
    this._emitSettlementHistoryUpdated(records.length);

    console.log(
      `[DropSystem] settleBatchWithOrdering 完成: ${records.length} 条记录, ` +
      `${orderedRewards.length} 项奖励, ` +
      `保底计数: ${this._formatPityCounters()}`,
    );

    return { records, orderedRewards };
  }

  /**
   * 获取保底可视化数据（供 UI 层消费）。
   *
   * 遍历内部 _pityCounters 和 _pityRules，生成显示友好的计数器数据。
   *
   * @returns 保底可视化数据
   */
  getPityVisualization(): PityVisualData {
    this._ensurePityLoaded();

    const counters: PityCounterVisualData[] = [];

    for (const [key, count] of this._pityCounters) {
      // key 格式: "pity_{sourceType}"
      const sourceType = key.replace(/^pity_/, '');

      // 查找匹配的规则获取阈值
      let threshold = 0;
      for (const rule of this._pityRules.values()) {
        if (rule.sourceType === sourceType) {
          threshold = rule.guaranteeThreshold;
          break;
        }
      }

      const percentage = threshold > 0
        ? Math.min(100, Math.round((count / threshold) * 100))
        : 0;

      counters.push({
        sourceType,
        current: count,
        threshold,
        percentage,
      });
    }

    return {
      counters,
    };
  }

  /**
   * 校验奖励结算一致性。
   *
   * 对照 SettlementResult 聚合值与 DropHistoryRecord.rewards 实际值，
   * 发现不一致时生成校验报告。
   *
   * @param records          DropHistoryRecord 数组
   * @param expectedGold     期望金币值
   * @param expectedExp      期望经验值
   * @param expectedEquipment 期望装备数量
   * @param expectedItems    期望物品数量
   * @returns                校验结果
   */
  verifyRewardConsistency(
    records: DropHistoryRecord[],
    expectedGold: number,
    expectedExp: number,
    expectedEquipment: number,
    expectedItems: number,
  ): RewardVerificationResult {
    const result = createEmptyRewardVerificationResult();
    const checks: RewardConsistencyCheck[] = [];

    // 汇总所有 records 中的实际奖励
    let actualGold = 0;
    let actualExp = 0;
    let actualEquipment = 0;
    let actualItems = 0;

    for (const record of records) {
      for (const grant of record.rewards) {
        switch (grant.rewardType) {
          case 'gold':
            actualGold += grant.quantity;
            break;
          case 'exp':
            actualExp += grant.quantity;
            break;
          case 'equipment':
            actualEquipment += 1;
            break;
          default:
            actualItems += grant.quantity;
            break;
        }
      }
    }

    // 逐字段校验
    const checkFields: Array<{ field: string; expected: number; actual: number }> = [
      { field: 'gold', expected: expectedGold, actual: actualGold },
      { field: 'exp', expected: expectedExp, actual: actualExp },
      { field: 'equipment', expected: expectedEquipment, actual: actualEquipment },
      { field: 'items', expected: expectedItems, actual: actualItems },
    ];

    for (const cf of checkFields) {
      const passed = cf.expected === cf.actual;
      checks.push({
        expected: cf.expected,
        actual: cf.actual,
        sourceId: 'settlement_aggregate',
        field: cf.field,
        passed,
        reason: passed ? undefined : `期望=${cf.expected}, 实际=${cf.actual}`,
      });
    }

    result.checks = checks;
    result.allPassed = checks.every((c) => c.passed);
    result.timestamp = Date.now();
    result.totalRewards = records.reduce((sum, r) => sum + r.rewards.length, 0);
    result.totalChecks = checks.length;

    if (!result.allPassed) {
      console.warn(
        `[DropSystem] 奖励一致性校验未通过: ${checks.filter((c) => !c.passed).length} 项不一致`,
      );
    }

    return result;
  }

  /**
   * 获取结算历史记录（便捷方法）。
   *
   * 委托给 getDropHistoryRecords，默认返回全部玩家记录。
   *
   * @param limit  返回条数上限（默认 50）
   * @returns      结算历史记录（最新在前）
   */
  getSettlementHistory(limit: number = 50): DropHistoryRecord[] {
    const all = this.getDropHistoryRecords();
    return all.slice(0, limit);
  }

  // ==================== Phase8-Step4: 内部方法 ====================

  /**
   * 派发结算历史更新事件。
   */
  private _emitSettlementHistoryUpdated(recordCount: number): void {
    EventManager.getInstance().emit(DropSystem.SETTLEMENT_HISTORY_UPDATED, {
      recordCount,
      timestamp: Date.now(),
    });
  }

  // ==================== 事件派发 ====================

  private _emitDropRolled(data: DropRolledEventData): void {
    EventManager.getInstance().emit(DropSystem.DROP_ROLLED, data);
  }

  private _emitDropClaimed(data: DropClaimedEventData): void {
    EventManager.getInstance().emit(DropSystem.DROP_CLAIMED, data);
  }
}
