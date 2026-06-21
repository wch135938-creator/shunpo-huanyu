// ============================================================
// DamageTextPool.ts — 伤害飘字专用对象池
// 职责：管理 DamageText 节点的创建 / 租借 / 回收 / 清理
// 位置：battlefx/ 层
// 依赖：cc (Node), DamageText
// 规范：零 any / 严格生命周期 / 自动创建 DamageText 组件
// ============================================================

import { Node } from 'cc';
import { DamageText } from './DamageText';
import type { DamageTextCompleteCallback } from './DamageText';
import type {
  DamageTextConfig,
  DamageTextSpawnRequest,
} from './PresentationTypes';
import { DamageTextType, DEFAULT_DAMAGE_TEXT_CONFIG } from './PresentationTypes';

/**
 * 池状态快照
 */
export interface DamageTextPoolStats {
  /** 空闲节点数 */
  available: number;
  /** 已创建总数 */
  total: number;
  /** 当前使用中数量 */
  inUse: number;
}

/**
 * 伤害飘字对象池
 *
 * 独立管理 DamageText 节点的生命周期。
 * 使用方式：
 *   const pool = new DamageTextPool(15);
 *   const dt = pool.get(parentNode);
 *   dt.show(150, DamageTextType.Damage, config, () => pool.put(dt));
 */
export class DamageTextPool {
  /** 空闲节点列表 */
  private _available: Node[] = [];
  /** 所有已创建节点集合 */
  private _all: Set<Node> = new Set();

  /** 当前创建总数 */
  private _totalCreated: number = 0;
  /** 最大容量（0 = 无限制） */
  private _maxCapacity: number;

  /** 全局飘字配置 */
  private _config: DamageTextConfig;

  /**
   * @param initialCapacity — 初始容量
   * @param maxCapacity     — 最大容量（0 = 无限制）
   */
  constructor(initialCapacity: number = 15, maxCapacity: number = 0) {
    this._maxCapacity = maxCapacity;
    this._config = { ...DEFAULT_DAMAGE_TEXT_CONFIG };
    this._preload(initialCapacity);
  }

  // ==================== 公共接口 ====================

  /**
   * 设置全局飘字配置
   */
  setConfig(config: DamageTextConfig): void {
    this._config = config;
  }

  /**
   * 获取当前配置（只读）
   */
  getConfig(): Readonly<DamageTextConfig> {
    return this._config;
  }

  /**
   * 从池中取出一个 DamageText 组件
   *
   * 优先复用空闲节点，池空时按需创建新节点。
   *
   * @param parentNode — 挂载的父节点
   * @returns DamageText | null（达到上限且无空闲时）
   */
  get(parentNode?: Node): DamageText | null {
    let node: Node;

    if (this._available.length > 0) {
      node = this._available.pop()!;
    } else if (
      this._maxCapacity === 0 ||
      this._totalCreated < this._maxCapacity
    ) {
      node = this._createNode();
      this._all.add(node);
      this._totalCreated++;
    } else {
      return null;
    }

    node.active = true;
    if (parentNode) {
      node.setParent(parentNode);
    }

    const dt = node.getComponent(DamageText);
    if (!dt) {
      console.warn('[DamageTextPool] get() 警告: 节点缺少 DamageText 组件');
      return null;
    }

    return dt;
  }

  /**
   * 回收 DamageText 到池中
   *
   * @param dt — DamageText 组件实例
   */
  put(dt: DamageText): void {
    if (!dt || !dt.node) return;
    const node = dt.node;

    if (!this._all.has(node)) {
      console.warn('[DamageTextPool] put() 失败: 节点不属于本池');
      return;
    }
    if (this._available.includes(node)) {
      console.warn('[DamageTextPool] put() 跳过: 节点已在池中');
      return;
    }

    dt.hide();
    this._available.push(node);
  }

  /**
   * 便捷方法：显示单次伤害飘字（自动取+自动还）
   *
   * @param request — 飘字请求
   * @param overrideConfig — 可选：覆盖全局配置的特定字段
   */
  spawnFromRequest(
    request: DamageTextSpawnRequest,
    overrideConfig?: DamageTextConfig,
  ): void {
    const dt = this.get(request.parentNode);
    if (!dt) return;

    dt.node.setWorldPosition(
      request.worldPosition.x,
      request.worldPosition.y,
      request.worldPosition.z,
    );

    const config = overrideConfig ?? this._config;

    dt.show(request.value, request.type, config, (completedDt) => {
      this.put(completedDt);
    });
  }

  /**
   * 显示一次伤害/治疗飘字
   *
   * @param value      — 数值
   * @param type       — 飘字类型
   * @param parentNode — 父节点
   * @param worldPos   — 世界坐标
   * @param config     — 可选：覆盖配置
   */
  show(
    value: number,
    type: DamageTextType,
    parentNode: Node,
    worldPos: { x: number; y: number; z: number },
    config?: DamageTextConfig,
  ): void {
    this.spawnFromRequest(
      {
        value,
        type,
        worldPosition: worldPos,
        parentNode,
      },
      config,
    );
  }

  /**
   * 预创建节点
   */
  preload(count: number): void {
    this._preload(count);
  }

  /**
   * 销毁所有节点
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
   * 获取池状态（调试用）
   */
  getStats(): DamageTextPoolStats {
    return {
      available: this._available.length,
      total: this._totalCreated,
      inUse: this._totalCreated - this._available.length,
    };
  }

  // ==================== 内部实现 ====================

  /**
   * 创建一个 DamageText 节点
   *
   * 节点结构：
   *   DamageText (Node + DamageText)
   *     └── Label (Node + Label) — 在 DamageText.onLoad 中创建
   */
  private _createNode(): Node {
    const node = new Node('DamageText');
    node.active = false;
    node.addComponent(DamageText);
    return node;
  }

  /**
   * 预创建指定数量的节点
   */
  private _preload(count: number): void {
    const actualCount =
      this._maxCapacity > 0
        ? Math.min(count, this._maxCapacity)
        : count;

    for (let i = 0; i < actualCount; i++) {
      const node = this._createNode();
      this._available.push(node);
      this._all.add(node);
      this._totalCreated++;
    }
  }
}
