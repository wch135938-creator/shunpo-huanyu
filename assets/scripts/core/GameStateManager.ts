// ============================================================
// GameStateManager — 游戏状态机管理器
// 职责：状态切换 / 转换校验 / 生命周期回调调度 / 事件通知
// 位置：Core 层基础设施
// 依赖：BaseManager / EventManager / GameState
// 规范：
//   · 禁止业务逻辑 — 仅管理状态转换，不处理业务
//   · 禁止 UI 依赖 — 通过 EventManager 通知状态变更
//   · 禁止 any — 全部明确类型
// ============================================================

import { BaseManager } from './BaseManager';
import { EventManager } from './EventManager';
import { GameState } from './GameState';

// ---- 类型定义 ----

/** 状态生命周期回调（均为可选） */
export interface StateLifecycle {
  /** 进入该状态时调用 */
  onEnter?: (prevState: GameState) => void;
  /** 离开该状态时调用 */
  onExit?: (nextState: GameState) => void;
  /** 每帧更新（仅当前状态生效） */
  onUpdate?: (dt: number) => void;
}

export class GameStateManager extends BaseManager {

  // ==================== 内部状态 ====================

  /** 当前状态 */
  private _currentState: GameState = GameState.BOOT;

  /** 上一个状态 */
  private _prevState: GameState = GameState.BOOT;

  /** 各状态的生命周期回调注册表 */
  private _lifecycles: Map<GameState, StateLifecycle> = new Map();

  /** 状态切换中锁：防止 onEnter 中嵌套 changeState */
  private _changing = false;

  /** 是否已完成 init */
  private _initialized = false;

  // ==================== 初始化 ====================

  /**
   * 初始化状态机（应在游戏启动最早阶段调用）
   * 设置当前状态为 BOOT
   */
  init(): void {
    if (this._initialized) {
      console.warn('[GameStateManager] 已初始化，跳过重复 init');
      return;
    }

    this._currentState = GameState.BOOT;
    this._prevState = GameState.BOOT;
    this._initialized = true;

    console.log('[GameStateManager] 初始化完成, 当前状态: BOOT');
  }

  // ==================== 生命周期注册 ====================

  /**
   * 注册某状态的生命周期回调
   *
   * @param state     目标状态
   * @param lifecycle 回调集合（onEnter / onExit / onUpdate 可选）
   */
  registerLifecycle(state: GameState, lifecycle: StateLifecycle): void {
    this._lifecycles.set(state, lifecycle);
  }

  /**
   * 移除某状态的生命周期回调
   *
   * @param state  目标状态
   */
  unregisterLifecycle(state: GameState): void {
    this._lifecycles.delete(state);
  }

  // ==================== 状态切换 ====================

  /**
   * 切换游戏状态
   *
   * 执行顺序：
   *   1. 校验转换是否合法
   *   2. 执行当前状态 onExit
   *   3. 更新状态引用
   *   4. 通过 EventManager 广播 GAME_STATE_CHANGE
   *   5. 执行新状态 onEnter
   *
   * @param nextState  目标状态
   * @returns          是否切换成功
   */
  changeState(nextState: GameState): boolean {
    if (!this._initialized) {
      console.error('[GameStateManager] changeState 失败：未调用 init()');
      return false;
    }

    if (this._changing) {
      console.warn(
        `[GameStateManager] 正在切换中，忽略嵌套 changeState: ${GameState[this._currentState]} → ${GameState[nextState]}`,
      );
      return false;
    }

    // 同状态不处理
    if (nextState === this._currentState) {
      return true;
    }

    // 转换合法性校验
    if (!this._canTransition(this._currentState, nextState)) {
      console.warn(
        `[GameStateManager] 不允许的状态转换: ${GameState[this._currentState]} → ${GameState[nextState]}`,
      );
      return false;
    }

    this._changing = true;
    const prevState = this._currentState;

    try {
      // Step 1: 执行当前状态 onExit
      const prevLifecycle = this._lifecycles.get(this._currentState);
      if (prevLifecycle && prevLifecycle.onExit) {
        prevLifecycle.onExit(nextState);
      }

      // Step 2: 更新状态
      this._prevState = prevState;
      this._currentState = nextState;

      // Step 3: 广播事件
      EventManager.getInstance().emit(
        EventManager.GAME_STATE_CHANGE,
        prevState,
        nextState,
      );

      // Step 4: 执行新状态 onEnter
      const nextLifecycle = this._lifecycles.get(nextState);
      if (nextLifecycle && nextLifecycle.onEnter) {
        nextLifecycle.onEnter(prevState);
      }

      console.log(
        `[GameStateManager] ${GameState[prevState]} → ${GameState[nextState]}`,
      );

      return true;
    } catch (e) {
      console.error(
        `[GameStateManager] 状态切换异常: ${GameState[prevState]} → ${GameState[nextState]}`,
        e,
      );
      // 状态已更新但回调出错：回退状态
      this._currentState = prevState;
      this._prevState = this._prevState;
      return false;
    } finally {
      this._changing = false;
    }
  }

  // ==================== 查询接口 ====================

  /** 获取当前状态 */
  getState(): GameState {
    return this._currentState;
  }

  /** 获取上一个状态 */
  getPrevState(): GameState {
    return this._prevState;
  }

  /** 判断是否处于指定状态 */
  isState(state: GameState): boolean {
    return this._currentState === state;
  }

  // ==================== 每帧驱动 ====================

  /**
   * 每帧更新（由 Cocos Component 的 update() 驱动）
   * 仅在当前状态注册了 onUpdate 时才执行
   *
   * @param dt  帧间隔时间（秒）
   */
  tick(dt: number): void {
    const lifecycle = this._lifecycles.get(this._currentState);
    if (lifecycle && lifecycle.onUpdate) {
      lifecycle.onUpdate(dt);
    }
  }

  // ==================== 转换白名单 ====================

  /**
   * 校验状态转换是否合法
   *
   * 合法路径：
   *   BOOT          → LOADING
   *   LOADING       → MAIN_MENU
   *   MAIN_MENU     → BATTLE / IDLE
   *   BATTLE        → BATTLE_RESULT
   *   BATTLE_RESULT → MAIN_MENU / IDLE
   *   IDLE          → MAIN_MENU / BATTLE
   */
  private _canTransition(from: GameState, to: GameState): boolean {
    // 任意状态允许切回自身（已在 changeState 中处理，此处不进入）
    const allowed: Record<number, GameState[]> = {
      [GameState.BOOT]:          [GameState.LOADING],
      [GameState.LOADING]:       [GameState.MAIN_MENU],
      [GameState.MAIN_MENU]:     [GameState.BATTLE, GameState.IDLE],
      [GameState.BATTLE]:        [GameState.BATTLE_RESULT],
      [GameState.BATTLE_RESULT]: [GameState.MAIN_MENU, GameState.IDLE],
      [GameState.IDLE]:          [GameState.MAIN_MENU, GameState.BATTLE],
    };

    const allowedList = allowed[from];
    return !!allowedList && allowedList.includes(to);
  }
}
