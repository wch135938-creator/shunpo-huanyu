// ============================================================
// InventoryRepository.ts — 物品配置仓库（只读）
// 职责：读取物品分类/堆叠规则/实例规则 / 提供 itemId 查询
// 位置：inventory/ 层
// 边界：只读 / 不得修改玩家资产 / 不得写 SaveV2 / 不得触发 Analytics
// ============================================================

import type {
  ItemCategory,
  ItemSubType,
  StackPolicy,
  InstancePolicy,
  ItemClassificationRule,
} from './InventoryDomain';
import {
  DEFAULT_ITEM_CLASSIFICATION_RULES,
  DEFAULT_FALLBACK_RULE,
} from './InventoryDomain';

// ==================== 分类缓存条目 ====================

interface ClassificationCacheEntry {
  category: ItemCategory;
  subType: ItemSubType;
  stackPolicy: StackPolicy;
  instancePolicy: InstancePolicy;
  maxStack: number;
}

// ==================== InventoryRepository ====================

export class InventoryRepository {
  // ===== 单例 =====

  private static instance: InventoryRepository;

  static getInstance(): InventoryRepository {
    if (!this.instance) {
      this.instance = new InventoryRepository();
    }
    return this.instance;
  }

  // ===== 内部状态 =====

  /** itemId → 分类信息缓存 */
  private _classificationCache: Map<string, ClassificationCacheEntry> = new Map();

  /** 是否已初始化 */
  private _initialized = false;

  private constructor() {}

  // ===== 初始化 =====

  /**
   * 初始化仓库，构建分类缓存。
   *
   * @param extraRules  额外的分类规则（从配置文件加载）
   */
  initialize(extraRules?: ItemClassificationRule[]): void {
    if (this._initialized) return;

    const allRules = [...DEFAULT_ITEM_CLASSIFICATION_RULES];
    if (extraRules && extraRules.length > 0) {
      allRules.push(...extraRules);
    }

    for (const rule of allRules) {
      for (const itemId of rule.itemIds) {
        this._classificationCache.set(itemId, {
          category: rule.category,
          subType: rule.subType,
          stackPolicy: rule.stackPolicy,
          instancePolicy: rule.instancePolicy,
          maxStack: rule.maxStack,
        });
      }
    }

    this._initialized = true;
    console.log(`[InventoryRepository] 初始化完成, ${this._classificationCache.size} 条物品分类`);
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ===== 查询接口 =====

  /** 获取物品分类 */
  getCategory(itemId: string): ItemCategory {
    return this._getOrFallback(itemId).category;
  }

  /** 获取物品子类型 */
  getSubType(itemId: string): ItemSubType {
    return this._getOrFallback(itemId).subType;
  }

  /** 获取堆叠策略 */
  getStackPolicy(itemId: string): StackPolicy {
    return this._getOrFallback(itemId).stackPolicy;
  }

  /** 获取实例策略 */
  getInstancePolicy(itemId: string): InstancePolicy {
    return this._getOrFallback(itemId).instancePolicy;
  }

  /** 获取最大堆叠数（0 = 无限） */
  getMaxStack(itemId: string): number {
    return this._getOrFallback(itemId).maxStack;
  }

  /** 物品是否可堆叠 */
  isStackable(itemId: string): boolean {
    const policy = this.getStackPolicy(itemId);
    return policy === 'stack' || policy === 'conditional_stack';
  }

  /** 物品是否需要实例化 */
  requiresInstance(itemId: string): boolean {
    const policy = this.getInstancePolicy(itemId);
    return policy === 'always_instance' || policy === 'conditional_instance';
  }

  /** 物品是否必须实例化（不可回退到堆叠） */
  mustInstance(itemId: string): boolean {
    return this.getInstancePolicy(itemId) === 'always_instance';
  }

  /** 物品 ID 是否已注册 */
  isRegistered(itemId: string): boolean {
    return this._classificationCache.has(itemId);
  }

  /** 获取所有已注册的物品 ID */
  getRegisteredItemIds(): string[] {
    return Array.from(this._classificationCache.keys());
  }

  /** 按分类和子类型查询物品 ID 列表 */
  getItemIdsByCategory(
    category: ItemCategory,
    subType?: ItemSubType,
  ): string[] {
    const result: string[] = [];
    for (const [itemId, entry] of this._classificationCache) {
      if (entry.category !== category) continue;
      if (subType && entry.subType !== subType) continue;
      result.push(itemId);
    }
    return result;
  }

  // ===== 内部 =====

  private _getOrFallback(itemId: string): ClassificationCacheEntry {
    const entry = this._classificationCache.get(itemId);
    if (entry) return entry;

    // 使用默认 fallback 规则
    return {
      category: DEFAULT_FALLBACK_RULE.category,
      subType: DEFAULT_FALLBACK_RULE.subType,
      stackPolicy: DEFAULT_FALLBACK_RULE.stackPolicy,
      instancePolicy: DEFAULT_FALLBACK_RULE.instancePolicy,
      maxStack: DEFAULT_FALLBACK_RULE.maxStack,
    };
  }
}
