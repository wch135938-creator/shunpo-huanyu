// ============================================================
// BattleFXPool.ts — 特效节点通用对象池
// 职责：管理 Cocos Node 的预创建 / 租借 / 回收 / 清理
// 位置：battlefx/ 层
// 依赖：cc (Node, Prefab, instantiate)
// 规范：零 any / 泛型约束 / 严格生命周期管理
// ============================================================

import { Node, Prefab, instantiate } from 'cc';

/**
 * 通用对象池
 *
 * 用于避免频繁 instantiate / destroy 节点。
 * 支持预创建 (preload) 和按需扩容 (get)。
 *
 * 使用方式：
 *   const pool = new BattleFXPool(prefab, 10);
 *   const node = pool.get(parent);  // 取出或创建
 *   pool.put(node);                 // 回收
 *   pool.clear();                   // 销毁全部
 *
 * 泛型约束：T 可以是 Component 类型，getComponent 自动获取。
 *
 * @typeParam T — 节点上挂载的目标组件类型（可选，默认为 Node）
 */
export class BattleFXPool<T extends object = Node> {
  /** 空闲节点列表（回收的节点） */
  private _available: Node[] = [];
  /** 所有已创建节点（包括已借出的） */
  private _all: Set<Node> = new Set();
  /** 预制体引用 */
  private _prefab: Prefab | null = null;
  /** 当前容量（已创建总数） */
  private _totalCreated: number = 0;
  /** 最大容量限制（0 = 无限制） */
  private _maxCapacity: number;

  /**
   * @param prefab        — 节点预制体（可为 null，此时 get() 创建空 Node）
   * @param initialCapacity — 初始容量
   * @param maxCapacity   — 最大容量（0 = 无限制），默认 0
   */
  constructor(
    prefab: Prefab | null = null,
    initialCapacity: number = 10,
    maxCapacity: number = 0,
  ) {
    this._prefab = prefab;
    this._maxCapacity = maxCapacity;
    this._preload(initialCapacity);
  }

  // ==================== 公共接口 ====================

  /**
   * 从池中取出一个节点
   *
   * - 有空闲节点：复用
   * - 无空闲节点但未达上限：创建新节点
   * - 达到上限：返回 null
   *
   * @param parentNode — 父节点（取出后挂载到此节点下）
   * @param getComponentType — 可选：获取节点上的组件类型（字符串类名）
   * @returns 节点实例 | null（池耗尽时）
   */
  get(parentNode?: Node): Node | null {
    let node: Node | null = null;

    if (this._available.length > 0) {
      // 复用空闲节点
      node = this._available.pop()!;
    } else if (this._maxCapacity === 0 || this._totalCreated < this._maxCapacity) {
      // 创建新节点
      node = this._createNode();
      if (node) {
        this._all.add(node);
        this._totalCreated++;
      }
    } else {
      // 达到最大容量
      return null;
    }

    if (node) {
      node.active = true;
      if (parentNode) {
        node.setParent(parentNode);
      }
    }

    return node;
  }

  /**
   * 回收节点到池中
   *
   * 回收后节点会被 deactivate 并从父节点移除。
   *
   * @param node — 要回收的节点（必须是本池创建的）
   */
  put(node: Node): void {
    if (!node) return;
    if (!this._all.has(node)) {
      console.warn('[BattleFXPool] put() 失败: 节点不属于本池');
      return;
    }
    if (this._available.includes(node)) {
      console.warn('[BattleFXPool] put() 跳过: 节点已在池中');
      return;
    }

    node.active = false;
    node.removeFromParent();
    this._available.push(node);
  }

  /**
   * 预创建节点
   *
   * @param count — 预创建数量（受 maxCapacity 限制）
   */
  preload(count: number): void {
    this._preload(count);
  }

  /**
   * 销毁所有节点（包括已借出的）
   */
  clear(): void {
    for (const node of this._all) {
      if (node && node.isValid) {
        node.destroy();
      }
    }
    this._available = [];
    this._all.clear();
    this._totalCreated = 0;
  }

  /**
   * 获取池状态快照（调试用）
   */
  getStats(): BattleFXPoolStats {
    return {
      available: this._available.length,
      total: this._totalCreated,
      inUse: this._totalCreated - this._available.length,
    };
  }

  /**
   * 获取节点上的组件（泛型版本）
   *
   * @param node — 从本池取出的节点
   * @param componentClass — Cocos Component 类
   * @returns 组件实例 | null
   */
  getComponent<C>(node: Node, componentClass: new () => C): C | null {
    if (!node) return null;
    return node.getComponent(componentClass);
  }

  // ==================== 内部实现 ====================

  /**
   * 内部预创建逻辑
   */
  private _preload(count: number): void {
    const actualCount =
      this._maxCapacity > 0
        ? Math.min(count, this._maxCapacity - this._totalCreated)
        : count;

    for (let i = 0; i < actualCount; i++) {
      const node = this._createNode();
      if (node) {
        node.active = false;
        this._available.push(node);
        this._all.add(node);
        this._totalCreated++;
      }
    }
  }

  /**
   * 创建一个新节点
   */
  private _createNode(): Node | null {
    if (this._prefab) {
      const node = instantiate(this._prefab);
      if (node) {
        return node;
      }
      console.warn('[BattleFXPool] instantiate() 返回 null');
      return null;
    }
    // 无预制体时创建空节点
    return new Node('FXPoolNode');
  }
}

// ==================== 辅助类型 ====================

/**
 * 对象池状态快照
 */
export interface BattleFXPoolStats {
  /** 空闲节点数 */
  available: number;
  /** 已创建总数 */
  total: number;
  /** 当前使用中数量 */
  inUse: number;
}
