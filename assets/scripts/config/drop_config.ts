// ============================================================
// drop_config.ts — drop_table.json 的 TypeScript 类型定义
// 职责：与 config/drops/drop_table.json 字段严格一一对应
// 规范：零 any / 联合类型约束 / 禁止硬编码
// ============================================================

// ==================== 枚举类型 ====================

/** 掉落池类型 */
export type DropType = 'normal' | 'elite' | 'boss' | 'firstClear';

/** 物品类型 */
export type ItemType = 'gold' | 'exp' | 'equip' | 'material' | 'gachaFragment' | 'diamond';

// ==================== 子结构 ====================

/**
 * 单条掉落物
 *
 * 掉落判定规则：
 *   · isGuaranteed = true  → 无视 dropRate，必定获得 minCount ~ maxCount 随机数量
 *   · isGuaranteed = false → 以 dropRate 概率判定，命中后获得 minCount ~ maxCount 随机数量
 *   · dropRate = 1.0 且 isGuaranteed = true → 保底必掉（冗余但语义明确）
 */
export interface DropItem {
  /** 物品 ID，格式 ITEM_XXX */
  itemId: string;
  /** 物品类型 */
  itemType: ItemType;
  /** 最小掉落数量 */
  minCount: number;
  /** 最大掉落数量（实际 = minCount ~ maxCount 之间随机） */
  maxCount: number;
  /** 掉落概率（0.0 ~ 1.0，1.0 = 100%） */
  dropRate: number;
  /** 是否保证掉落（true = 无视概率，必定获得 minCount） */
  isGuaranteed: boolean;
}

// ==================== 单条掉落池 ====================

/**
 * 单条掉落池配置（对应 drop_table.json data[] 中每一项）
 *
 * 调用示例：
 *   const cfg = ConfigManager.getInstance()
 *     .getConfig<DropTableConfig>('config/drops/drop_table');
 *   const drops: DropEntry[] = cfg.data;
 */
export interface DropEntry {
  /** 掉落池唯一 ID，格式 DROP_XXX / DROP_FXXX */
  id: string;
  /** Phase7 配置版本号（可选，用于迁移兼容性追踪） */
  configVersion?: number;
  /** 掉落池名称（调试显示） */
  name: string;
  /** 掉落池描述 */
  description: string;
  /** 掉落池类型 */
  dropType: DropType;
  /** 掉落物列表（3~6 项） */
  items: DropItem[];
}

// ==================== 顶层结构 ====================

/**
 * drop_table.json 的顶层结构（三层：version / name / data[]）
 * 用于 ConfigManager.getConfig 的类型参数
 */
export interface DropTableConfig {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 掉落池数据数组 */
  data: DropEntry[];
}
