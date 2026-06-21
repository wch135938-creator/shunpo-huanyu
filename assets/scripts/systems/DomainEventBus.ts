// ============================================================
// DomainEventBus — Phase7 领域事件总线
// 职责：领域事件的发布/订阅 / correlationId 生成与追踪 / 近期事件审计缓冲区
// 边界：基于 EventManager 实现，不直接操作存档或 UI
//
// 设计原则：
//   - 所有领域操作产生的事实通过 DomainEvent 对外声明。
//   - correlationId 将同一次业务操作的所有事件串联。
//   - 内存环形缓冲区保留最近事件用于调试/审计（最大 1000）。
//   - 支持按 correlationId 或 eventType 查询历史事件。
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import type { DomainEvent, CorrelationId } from '../data/roguelike_types';
import {
  generateEventId,
  generateCorrelationId,
  DomainEventType,
} from '../data/roguelike_types';

// ---- 类型定义 ----

/** 事件处理器签名 */
export type DomainEventHandler<T = unknown> = (event: DomainEvent<T>) => void;

/** 活跃的关联上下文 */
interface ActiveCorrelation {
  /** 关联 ID */
  correlationId: CorrelationId;
  /** 创建时间戳 */
  startedAt: number;
  /** 关联原因（调试用） */
  label?: string;
}

// ---- 常量 ----

/** 事件环形缓冲区最大容量 */
const MAX_EVENT_BUFFER = 1000;

/** 活跃关联超时时间（ms），超过此时间未结束的关联会被自动清理 */
const CORRELATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟

export class DomainEventBus extends BaseSystem {
  // ==================== 内部状态 ====================

  /** 底层事件管理器 */
  private _eventManager: EventManager;

  /** 事件环形缓冲区（最新事件在前） */
  private _eventBuffer: DomainEvent[] = [];

  /** 活跃的关联上下文 */
  private _activeCorrelations: Map<CorrelationId, ActiveCorrelation> = new Map();

  /** 按事件类型索引的处理器 */
  private _handlers: Map<string, DomainEventHandler[]> = new Map();

  /** 事件计数（用于生成递增序号） */
  private _eventCount = 0;

  // ==================== 构造 ====================

  constructor() {
    super();
    this._eventManager = EventManager.getInstance();
  }

  // ==================== 关联 ID 管理 ====================

  /**
   * 开始一个新的关联上下文。
   *
   * 调用时机：地牢开始、批量结算开始等需要串联多个事件的操作前。
   *
   * @param label  关联标签（调试用）
   * @returns      新的关联 ID
   */
  beginCorrelation(label?: string): CorrelationId {
    const correlationId = generateCorrelationId();
    this._activeCorrelations.set(correlationId, {
      correlationId,
      startedAt: Date.now(),
      label,
    });

    // 清理超时的关联
    this._cleanupStaleCorrelations();

    return correlationId;
  }

  /**
   * 结束一个关联上下文。
   *
   * 调用时机：操作完成、事务提交后。
   *
   * @param correlationId  关联 ID
   */
  endCorrelation(correlationId: CorrelationId): void {
    this._activeCorrelations.delete(correlationId);
  }

  /**
   * 获取当前活跃的关联上下文数量。
   */
  getActiveCorrelationCount(): number {
    this._cleanupStaleCorrelations();
    return this._activeCorrelations.size;
  }

  // ==================== 事件发布 ====================

  /**
   * 发布一个领域事件。
   *
   * 事件会：
   * 1. 被追加到环形缓冲区。
   * 2. 通过 EventManager 广播给所有订阅者。
   * 3. 调用直接注册的 handler。
   *
   * @param type          事件类型（推荐使用 DomainEventType 常量）
   * @param payload       事件负载
   * @param aggregateId   聚合根 ID
   * @param playerId      玩家 ID
   * @param correlationId 关联 ID（可选，不提供则自动生成）
   * @param version       事件版本号（默认 1）
   */
  publish<T>(
    type: string,
    payload: T,
    aggregateId: string,
    playerId: string,
    correlationId?: CorrelationId,
    version: number = 1,
  ): DomainEvent<T> {
    const event: DomainEvent<T> = {
      id: generateEventId(),
      type,
      version,
      aggregateId,
      playerId,
      correlationId: correlationId ?? generateCorrelationId(),
      payload,
      createdAt: Date.now(),
    };

    // 追加到缓冲区
    this._appendToBuffer(event as DomainEvent);

    // 通过 EventManager 广播
    this._eventManager.emit(`domain:${type}`, event);

    // 调用直接注册的 handler
    const handlers = this._handlers.get(type);
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        try {
          handler(event as DomainEvent);
        } catch (e) {
          console.error(`[DomainEventBus] handler 执行异常: type=${type}, error=${e}`);
        }
      }
    }

    this._eventCount += 1;

    return event;
  }

  // ==================== 事件订阅 ====================

  /**
   * 订阅指定类型的领域事件。
   *
   * @param type    事件类型
   * @param handler 事件处理器
   */
  subscribe<T>(type: string, handler: DomainEventHandler<T>): void {
    let handlers = this._handlers.get(type);
    if (!handlers) {
      handlers = [];
      this._handlers.set(type, handlers);
    }
    handlers.push(handler as DomainEventHandler);
  }

  /**
   * 取消订阅。
   *
   * @param type    事件类型
   * @param handler 事件处理器引用（同一个函数引用）
   */
  unsubscribe<T>(type: string, handler: DomainEventHandler<T>): void {
    const handlers = this._handlers.get(type);
    if (!handlers) return;

    const idx = handlers.indexOf(handler as DomainEventHandler);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }

    if (handlers.length === 0) {
      this._handlers.delete(type);
    }
  }

  // ==================== 历史查询 ====================

  /**
   * 按 correlationId 查询相关事件。
   *
   * @param correlationId  关联 ID
   * @returns              匹配的事件列表（按时间升序）
   */
  getEventsByCorrelation(correlationId: CorrelationId): DomainEvent[] {
    return this._eventBuffer
      .filter((e) => e.correlationId === correlationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 按事件类型查询历史事件。
   *
   * @param type   事件类型
   * @param limit  最大返回数量（默认 100）
   * @returns      匹配的事件列表（最新在前）
   */
  getEventsByType(type: string, limit: number = 100): DomainEvent[] {
    return this._eventBuffer
      .filter((e) => e.type === type)
      .slice(0, limit);
  }

  /**
   * 获取最近 N 个事件。
   *
   * @param limit  最大返回数量（默认 50）
   * @returns      事件列表（最新在前）
   */
  getRecentEvents(limit: number = 50): DomainEvent[] {
    return this._eventBuffer.slice(0, Math.min(limit, this._eventBuffer.length));
  }

  /**
   * 获取事件缓冲区当前大小。
   */
  getEventCount(): number {
    return this._eventBuffer.length;
  }

  /**
   * 获取累计发布的事件总数。
   */
  getTotalEventCount(): number {
    return this._eventCount;
  }

  // ==================== 缓冲区管理 ====================

  /** 清空事件缓冲区 */
  clearBuffer(): void {
    this._eventBuffer = [];
    this._eventCount = 0;
  }

  // ==================== 内部方法 ====================

  /**
   * 追加事件到环形缓冲区。
   *
   * 最新事件插入到数组开头，超出容量时裁剪最旧的事件。
   */
  private _appendToBuffer(event: DomainEvent): void {
    this._eventBuffer.unshift(event);

    if (this._eventBuffer.length > MAX_EVENT_BUFFER) {
      this._eventBuffer = this._eventBuffer.slice(0, MAX_EVENT_BUFFER);
    }
  }

  /**
   * 清理超时的关联上下文。
   */
  private _cleanupStaleCorrelations(): void {
    const now = Date.now();
    const staleIds: CorrelationId[] = [];

    for (const [id, ctx] of this._activeCorrelations) {
      if (now - ctx.startedAt > CORRELATION_TIMEOUT_MS) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      this._activeCorrelations.delete(id);
    }

    if (staleIds.length > 0) {
      console.log(`[DomainEventBus] 清理 ${staleIds.length} 个超时关联上下文`);
    }
  }
}
