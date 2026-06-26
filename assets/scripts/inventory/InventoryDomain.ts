// ============================================================
// InventoryDomain.ts — 资产语义定义
// 职责：定义资产分类 / 双模型 / 绑定/锁定/过期状态 / 来源/变更原因 / 合法性规则
// 位置：inventory/ 层
// 边界：不依赖 Cocos UI / BattleSystem / FormationSystem / RewardPool
// 规范：零 any / 纯类型定义 / 不实现逻辑
// ============================================================

// ==================== 资产分类 ====================

/** 资产大类 */
export type ItemCategory =
  | 'Currency'
  | 'Material'
  | 'Consumable'
  | 'Equipment'
  | 'Artifact'
  | 'Rune'
  | 'Pet'
  | 'GuildItem'
  | 'LiveOpsItem';

/** 货币子类型 */
export type CurrencySubType = 'Gold' | 'SpiritStone' | 'Diamond' | 'FutureCurrency';

/** 材料子类型 */
export type MaterialSubType = 'HeroExp' | 'TalentBook' | 'EquipmentStone' | 'FutureMaterial';

/** 消耗品子类型 */
export type ConsumableSubType = 'Chest' | 'Ticket' | 'Key' | 'BuffItem' | 'FutureConsumable';

/** 装备子类型 */
export type EquipmentSubType = 'Weapon' | 'Armor' | 'Accessory';

/** 物品子类型联合 */
export type ItemSubType =
  | CurrencySubType
  | MaterialSubType
  | ConsumableSubType
  | EquipmentSubType
  | string;

// ==================== 资产状态 ====================

/** 绑定状态 */
export type BindState = 'none' | 'equipped_bind' | 'obtained_bind' | 'account_bind';

/** 锁定状态 */
export type LockState = 'none' | 'locked' | 'soft_locked';

/** 过期状态 */
export type ExpireState = 'none' | 'active' | 'expiring' | 'expired';

/** 堆叠策略 */
export type StackPolicy = 'stack' | 'no_stack' | 'conditional_stack';

/** 实例策略 */
export type InstancePolicy = 'no_instance' | 'always_instance' | 'conditional_instance';

// ==================== 资产来源与变更原因 ====================

/** 资产来源标识 */
export type InventorySource =
  | 'chapter_reward'
  | 'battle_drop'
  | 'event_reward'
  | 'boss_reward'
  | 'activity_reward'
  | 'guild_reward'
  | 'ranking_reward'
  | 'season_settlement'
  | 'mail_compensation'
  | 'daily_quest'
  | 'weekly_boss'
  | 'ad_reward'
  | 'shop_purchase'
  | 'paid_pack'
  | 'liveOps_compensation'
  | 'gm_command'
  | 'system_default';

/** 资产变更原因 */
export type InventoryChangeReason =
  | 'reward_grant'
  | 'consume_item'
  | 'equipment_decompose'
  | 'equipment_upgrade_cost'
  | 'artifact_upgrade_cost'
  | 'rune_upgrade_cost'
  | 'pet_feed_cost'
  | 'activity_token_consume'
  | 'guild_donate'
  | 'shop_buy'
  | 'liveOps_adjust'
  | 'expire_cleanup'
  | 'gm_adjust';

// ==================== StackItem — 数量型资产 ====================

/**
 * StackItem — 可堆叠的数量型资产。
 *
 * 允许堆叠：Gold / SpiritStone / Diamond / HeroExp / TalentBook /
 *           EquipmentStone / 普通材料 / 普通门票 / 普通钥匙 / 普通碎片
 * 禁止堆叠：Equipment / Artifact / Rune / Pet / 带随机词条的宝箱
 */
export interface StackItem {
  /** 物品 ID */
  itemId: string;
  /** 资产大类 */
  category: ItemCategory;
  /** 子类型 */
  subType: ItemSubType;
  /** 当前数量 */
  count: number;
  /** 最大堆叠数（0 = 无限） */
  maxStack: number;
  /** 绑定状态 */
  bindState: BindState;
  /** 过期时间戳（0 = 永不过期） */
  expireAt: number;
  /** 活动关联 ID（"" = 非活动道具） */
  activityId: string;
  /** 来源标签 */
  sourceTag: string;
  /** 物品品质（0 = 不适用） */
  quality: number;
}

/** 创建默认 StackItem */
export function createDefaultStackItem(
  itemId: string,
  category: ItemCategory,
  subType: ItemSubType,
): StackItem {
  return {
    itemId,
    category,
    subType,
    count: 0,
    maxStack: 0,
    bindState: 'none',
    expireAt: 0,
    activityId: '',
    sourceTag: '',
    quality: 0,
  };
}

/** 堆叠合并条件检查：两个 StackItem 是否可合并 */
export function canStackMerge(a: StackItem, b: StackItem): boolean {
  return (
    a.itemId === b.itemId &&
    a.bindState === b.bindState &&
    a.expireAt === b.expireAt &&
    a.activityId === b.activityId &&
    a.sourceTag === b.sourceTag
  );
}

// ==================== InstanceItem — 实例型资产 ====================

/**
 * InstanceItem — 有独立状态的资产实例。
 *
 * 基础支持：Equipment / Artifact / Rune / Pet / 特殊宝箱 / 特殊活动道具
 */
export interface InstanceItem {
  /** 全局唯一 ID（稳定，不依赖数组下标） */
  uniqueId: string;
  /** 物品 ID */
  itemId: string;
  /** 资产大类 */
  category: ItemCategory;
  /** 子类型 */
  subType: ItemSubType;
  /** 品质 */
  quality: number;
  /** 等级 */
  level: number;
  /** 词条/附魔数据（JSON 可序列化） */
  affix: Record<string, unknown>;
  /** 绑定状态 */
  bindState: BindState;
  /** 锁定状态 */
  lockState: LockState;
  /** 过期时间戳（0 = 永不过期） */
  expireAt: number;
  /** 来源标识 */
  source: InventorySource;
  /** 创建时间戳（Unix ms） */
  createdAt: number;
  /** 扩展数据（JSON 可序列化） */
  extraData: Record<string, unknown>;
}

/** 创建默认 InstanceItem */
export function createDefaultInstanceItem(
  uniqueId: string,
  itemId: string,
  category: ItemCategory,
  subType: ItemSubType,
  source: InventorySource,
): InstanceItem {
  return {
    uniqueId,
    itemId,
    category,
    subType,
    quality: 0,
    level: 1,
    affix: {},
    bindState: 'none',
    lockState: 'none',
    expireAt: 0,
    source,
    createdAt: Date.now(),
    extraData: {},
  };
}

// ==================== 资产合法性规则 ====================

/** 资产分类判定规则 */
export interface ItemClassificationRule {
  /** 匹配的物品 ID 列表 */
  itemIds: string[];
  /** 资产大类 */
  category: ItemCategory;
  /** 子类型 */
  subType: ItemSubType;
  /** 堆叠策略 */
  stackPolicy: StackPolicy;
  /** 实例策略 */
  instancePolicy: InstancePolicy;
  /** 最大堆叠数（0 = 无限） */
  maxStack: number;
}

/**
 * TODO(Phase10+): 迁移到 ConfigManager
 *
 * 当前 DEFAULT_ITEM_CLASSIFICATION_RULES 为硬编码常量。
 * 未来应迁移为从 ConfigManager 加载的 JSON 配置：
 *   ConfigManager.getInstance().getConfig<ItemClassificationConfig>('config/item_classification')
 *
 * 迁移接口预留：
 *   InventoryRepository.initialize(extraRules?) 已支持外部注入规则
 *   只需将 JSON 配置转换为 ItemClassificationRule[] 传入即可
 *
 * 迁移时注意：
 *   - 保持 InventoryRepository 查询接口不变
 *   - 保持 DEFAULT_FALLBACK_RULE 作为兜底
 */

/**
 * 已知物品分类规则表。
 *
 * 所有物品必须在此表中有对应条目，否则按默认规则处理。
 */
export const DEFAULT_ITEM_CLASSIFICATION_RULES: ItemClassificationRule[] = [
  // ---- 货币 ----
  {
    itemIds: ['ITEM_GOLD'],
    category: 'Currency',
    subType: 'Gold',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 0,
  },
  {
    itemIds: ['ITEM_SPIRIT_STONE'],
    category: 'Currency',
    subType: 'SpiritStone',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 0,
  },
  {
    itemIds: ['ITEM_DIAMOND'],
    category: 'Currency',
    subType: 'Diamond',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 0,
  },
  // ---- 材料 ----
  {
    itemIds: ['ITEM_HERO_EXP'],
    category: 'Material',
    subType: 'HeroExp',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 99999,
  },
  {
    itemIds: ['ITEM_TALENT_BOOK'],
    category: 'Material',
    subType: 'TalentBook',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 9999,
  },
  {
    itemIds: ['ITEM_EQUIPMENT_STONE'],
    category: 'Material',
    subType: 'EquipmentStone',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 9999,
  },
  // ---- 消耗品 ----
  {
    itemIds: ['ITEM_CHEST_NORMAL', 'ITEM_CHEST_RARE', 'ITEM_CHEST_EPIC'],
    category: 'Consumable',
    subType: 'Chest',
    stackPolicy: 'conditional_stack',
    instancePolicy: 'conditional_instance',
    maxStack: 999,
  },
  {
    itemIds: ['ITEM_TICKET_DAILY', 'ITEM_TICKET_WEEKLY'],
    category: 'Consumable',
    subType: 'Ticket',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 999,
  },
  {
    itemIds: ['ITEM_KEY_BOSS'],
    category: 'Consumable',
    subType: 'Key',
    stackPolicy: 'stack',
    instancePolicy: 'no_instance',
    maxStack: 99,
  },
  // ---- 装备：武器（不堆叠，必须实例化） ----
  {
    itemIds: ['ITEM_EQ_WEAPON_001', 'ITEM_EQ_WEAPON_002', 'ITEM_EQ_WEAPON_003', 'ITEM_EQ_WEAPON_004'],
    category: 'Equipment',
    subType: 'Weapon',
    stackPolicy: 'no_stack',
    instancePolicy: 'always_instance',
    maxStack: 1,
  },
  // ---- 装备：护甲（不堆叠，必须实例化） ----
  {
    itemIds: ['ITEM_EQ_ARMOR_001', 'ITEM_EQ_ARMOR_002', 'ITEM_EQ_ARMOR_003', 'ITEM_EQ_ARMOR_004'],
    category: 'Equipment',
    subType: 'Armor',
    stackPolicy: 'no_stack',
    instancePolicy: 'always_instance',
    maxStack: 1,
  },
  // ---- 装备：配饰（不堆叠，必须实例化） ----
  {
    itemIds: ['ITEM_EQ_ACCESSORY_001', 'ITEM_EQ_ACCESSORY_002', 'ITEM_EQ_ACCESSORY_003', 'ITEM_EQ_ACCESSORY_004'],
    category: 'Equipment',
    subType: 'Accessory',
    stackPolicy: 'no_stack',
    instancePolicy: 'always_instance',
    maxStack: 1,
  },
  // ---- 神器 ----
  {
    itemIds: ['ITEM_ARTIFACT_001'],
    category: 'Artifact',
    subType: 'FutureConsumable',
    stackPolicy: 'no_stack',
    instancePolicy: 'always_instance',
    maxStack: 1,
  },
  // ---- 符文 ----
  {
    itemIds: ['ITEM_RUNE_001'],
    category: 'Rune',
    subType: 'FutureConsumable',
    stackPolicy: 'no_stack',
    instancePolicy: 'always_instance',
    maxStack: 1,
  },
  // ---- 宠物 ----
  {
    itemIds: ['ITEM_PET_001'],
    category: 'Pet',
    subType: 'FutureConsumable',
    stackPolicy: 'no_stack',
    instancePolicy: 'always_instance',
    maxStack: 1,
  },
];

/** 默认分类规则（未知物品 fallback） */
export const DEFAULT_FALLBACK_RULE: ItemClassificationRule = {
  itemIds: [],
  category: 'Material',
  subType: 'FutureMaterial',
  stackPolicy: 'stack',
  instancePolicy: 'no_instance',
  maxStack: 9999,
};

// ==================== 查询过滤类型 ====================

/** 资产查询过滤条件 */
export interface InventoryQueryFilter {
  /** 按 itemId 精确查询 */
  itemId?: string;
  /** 按资产大类过滤 */
  category?: ItemCategory;
  /** 按子类型过滤 */
  subType?: ItemSubType;
  /** 按品质过滤（>= 指定值） */
  minQuality?: number;
  /** 按绑定状态过滤 */
  bindState?: BindState;
  /** 按锁定状态过滤 */
  lockState?: LockState;
  /** 是否过滤已过期资产 */
  excludeExpired?: boolean;
  /** 是否过滤锁定资产 */
  excludeLocked?: boolean;
}

// ==================== UniqueId 生成 ====================

let _instanceIdCounter = 0;

/** 生成 InstanceItem 的唯一 ID */
export function generateUniqueId(category: ItemCategory): string {
  _instanceIdCounter++;
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `inst_${category}_${ts}_${rand}_${_instanceIdCounter}`;
}

// ==================== 掉落→装备 Inventory ItemId 映射 ====================

/**
 * 掉落物品 ID → Inventory 装备 ItemId 映射表。
 *
 * 掉落配置使用品质维度的 itemId（如 ITEM_EQUIP_N_001 = Common 品质装备），
 * 而 Inventory 使用类型维度的 itemId（如 ITEM_EQ_WEAPON_001 = 武器）。
 *
 * 映射规则：按品质随机从对应品质的 Weapon/Armor/Accessory 池中选取。
 *
 * 品质对应关系：
 *   N (Common)   → weapon_001 / armor_001 / acc_001
 *   R (Rare)     → weapon_002 / armor_002 / acc_002
 *   SR (Epic)    → weapon_003 / armor_003 / acc_003
 *   SSR (Legendary) → weapon_004 / armor_004 / acc_004
 */
const DROP_TO_EQUIP_ITEM_ID_MAP: Record<string, string[]> = {
  ITEM_EQUIP_N_001: ['ITEM_EQ_WEAPON_001', 'ITEM_EQ_ARMOR_001', 'ITEM_EQ_ACCESSORY_001'],
  ITEM_EQUIP_R_001: ['ITEM_EQ_WEAPON_002', 'ITEM_EQ_ARMOR_002', 'ITEM_EQ_ACCESSORY_002'],
  ITEM_EQUIP_SR_001: ['ITEM_EQ_WEAPON_003', 'ITEM_EQ_ARMOR_003', 'ITEM_EQ_ACCESSORY_003'],
  ITEM_EQUIP_SSR_001: ['ITEM_EQ_WEAPON_004', 'ITEM_EQ_ARMOR_004', 'ITEM_EQ_ACCESSORY_004'],
};

/**
 * 将掉落物品 ID 映射为 Inventory 装备 ItemId。
 *
 * 从对应品质的装备池中随机选取一个 Inventory itemId。
 * 如果 dropItemId 不在映射表中，返回 null。
 *
 * @param dropItemId  掉落配置中的物品 ID（如 "ITEM_EQUIP_N_001"）
 * @returns           Inventory 装备 itemId（如 "ITEM_EQ_WEAPON_001"），未知时返回 null
 */
export function mapDropItemIdToEquipItemId(dropItemId: string): string | null {
  const pool = DROP_TO_EQUIP_ITEM_ID_MAP[dropItemId];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 初始装备发放列表（新存档创建时发放）。
 *
 * 品质：全部 Common
 * 覆盖三个槽位：Weapon ×1, Armor ×1, Accessory ×1
 */
export const INITIAL_EQUIPMENT_ITEM_IDS: string[] = [
  'ITEM_EQ_WEAPON_001',    // 青锋剑 (Common)
  'ITEM_EQ_ARMOR_001',     // 布衣   (Common)
  'ITEM_EQ_ACCESSORY_001', // 铜戒   (Common)
];

/**
 * Starter materials for the initial equipment growth loop.
 * 60 stones cover one upgrade and one enhance for each of the 3 starter items.
 */
export const INITIAL_EQUIPMENT_MATERIAL_GRANTS: Array<{ itemId: string; count: number }> = [
  { itemId: 'ITEM_EQUIPMENT_STONE', count: 60 },
];
