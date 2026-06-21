// ============================================================
// EventManager — 全局事件系统
// 职责：模块间解耦通信，只做事件路由，不含任何业务逻辑
// 位置：Core 层基础设施
// ============================================================

// ---- 事件监听器内部结构 ----
interface EventListener {
  /** 回调函数 */
  callback: (...args: unknown[]) => void;
  /** 绑定的目标对象（用于批量清理，适配 Cocos 组件生命周期） */
  target?: object;
  /** 是否只触发一次 */
  once: boolean;
}

export class EventManager {
  // ==================== 单例 ====================

  private static instance: EventManager;

  static getInstance(): EventManager {
    if (!this.instance) this.instance = new EventManager();
    return this.instance;
  }

  // ==================== 内部状态 ====================

  private _listeners: Map<string, EventListener[]> = new Map();

  /** 是否正在派发中（用于防止嵌套清理问题） */
  private _dispatching: Set<string> = new Set();

  private constructor() {}

  // ==================== 静态事件名常量 ====================
  // 所有事件名集中定义，禁止在业务代码中硬编码字符串

  /** 游戏状态切换 */
  static readonly GAME_STATE_CHANGE = 'game:stateChange';

  /** 数据变更（通用） */
  static readonly DATA_CHANGE = 'data:change';

  /** 存档完成 */
  static readonly SAVE_COMPLETE = 'save:complete';

  /** 存档迁移完成（Phase9-Step6 SaveV2） */
  static readonly SAVE_MIGRATED = 'save:migrated';

  /** V8 存档加载完成（Phase9-Step6 SaveV2） */
  static readonly SAVE_V8_LOADED = 'save:v8Loaded';

  /** 配置加载完成 */
  static readonly CONFIG_LOADED = 'config:loaded';

  // ==================== 注册监听 ====================

  /**
   * 注册事件监听
   * @param event    事件名（推荐使用 EventManager 静态常量）
   * @param callback 回调函数
   * @param target   绑定的目标对象，用于 offTarget 批量清理
   */
  on(event: string, callback: (...args: unknown[]) => void, target?: object): void {
    this._addListener(event, callback, target, false);
  }

  /**
   * 注册一次性事件监听（触发后自动移除）
   * @param event    事件名
   * @param callback 回调函数
   * @param target   绑定的目标对象
   */
  once(event: string, callback: (...args: unknown[]) => void, target?: object): void {
    this._addListener(event, callback, target, true);
  }

  private _addListener(
    event: string,
    callback: (...args: unknown[]) => void,
    target: object | undefined,
    once: boolean,
  ): void {
    let list = this._listeners.get(event);
    if (!list) {
      list = [];
      this._listeners.set(event, list);
    }
    list.push({ callback, target, once });
  }

  // ==================== 移除监听 ====================

  /**
   * 移除指定事件 & 回调的监听
   * 如果正在派发该事件，本次移除会延迟到派发完成后生效（安全删除）
   */
  off(event: string, callback: (...args: unknown[]) => void, target?: object): void {
    const list = this._listeners.get(event);
    if (!list) return;

    if (this._dispatching.has(event)) {
      // 正在派发中：标记为 null，不修改数组长度
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item && item.callback === callback && item.target === target) {
          list[i] = null!;
          return;
        }
      }
    } else {
      // 非派发中：直接 splice
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (item.callback === callback && item.target === target) {
          list.splice(i, 1);
        }
      }
    }
  }

  /**
   * 移除指定 target 上的所有监听（Cocos 组件 onDestroy 时调用）
   */
  offTarget(target: object): void {
    this._listeners.forEach((list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] && list[i].target === target) {
          list.splice(i, 1);
        }
      }
    });
  }

  // ==================== 派发事件 ====================

  /**
   * 派发事件
   * @param event 事件名
   * @param args  传递给回调的参数
   */
  emit(event: string, ...args: unknown[]): void {
    const list = this._listeners.get(event);
    if (!list || list.length === 0) return;

    this._dispatching.add(event);

    // 浅拷贝后遍历，防止回调内 off() 影响当前轮次
    const snapshot = [...list];

    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i];
      if (!item) continue;

      item.callback(...args);

      if (item.once && this._listeners.has(event)) {
        // 一次性监听：派发后移除（从原数组中删除）
        this._safeRemove(event, item);
      }
    }

    this._dispatching.delete(event);

    // 清理派发期间产生的 null 标记
    this._compact(event);
  }

  /** 安全地从原数组中移除一个监听器 */
  private _safeRemove(event: string, item: EventListener): void {
    const list = this._listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(item);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  /** 清理派发期间标记为 null 的条目 */
  private _compact(event: string): void {
    const list = this._listeners.get(event);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === null) {
        list.splice(i, 1);
      }
    }
    if (list.length === 0) {
      this._listeners.delete(event);
    }
  }

  // ==================== 调试工具 ====================

  /**
   * 检查某事件是否有监听者
   */
  hasListeners(event: string): boolean {
    const list = this._listeners.get(event);
    return !!list && list.length > 0;
  }

  /**
   * 清除指定事件的全部监听（不传参则清空所有事件）
   */
  offAll(event?: string): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}
