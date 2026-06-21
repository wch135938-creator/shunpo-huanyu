// ============================================================
// BasePanel — 所有 UI 界面的统一基类
// 职责：面板生命周期管理 / 显示控制 / EventManager 防泄漏 / 安全区适配钩子
// 位置：Core 层基础设施
// 规范：
//   · 未来所有 UI 界面必须继承 BasePanel
//   · 禁止 any — 全部明确类型
//   · 禁止业务逻辑 — 仅负责 UI 生命周期管理
//   · 禁止直接操作游戏数据 — 数据通过 Manager/System 间接获取
// ============================================================

import { _decorator, Component } from 'cc';
import { EventManager } from './EventManager';
import { UIKernel, type UIDirtySource } from './UIKernel';

const { ccclass } = _decorator;

/** 安全区边距（由 UIManager 从 WxPlatform 获取系统信息后传入） */
export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

@ccclass('BasePanel')
export class BasePanel extends Component {

  // ==================== 状态 ====================

  /** 当前面板是否正在显示 */
  protected _isShowing = false;
  protected _layoutDirty = true;
  protected _layoutDirtySource: UIDirtySource = 'PREFAB_INIT';

  // ==================== Cocos 原生生命周期 ====================

  onLoad(): void {
    console.error('[STACK_TRACE]', 'BasePanel.onLoad — node=', this.node?.name);
    // 子类在 onLoad 中调用 super.onLoad() 即可
    console.log('[UI-TEST] PREFAB_INIT executed');
    UIKernel.init();
    UIKernel.updateUI(this.node, { source: 'PREFAB_INIT' });
    this.markLayoutDirty('PREFAB_INIT');
    this.registerEvents();
  }

  protected start(): void {
    this.scheduleOnce(() => {
      UIKernel.updateUI(this.node, { source: this._layoutDirtySource });
      UIKernel.flushFrame();
    }, 0);
  }

  protected lateUpdate(): void {
    if (this._layoutDirty) {
      UIKernel.updateUI(this.node, { source: this._layoutDirtySource });
      this._layoutDirty = false;
    }
    UIKernel.flushFrame();
  }

  protected onEnable(): void {
    console.error('[STACK_TRACE]', 'BasePanel.onEnable — node=', this.node?.name);
  }

  onDestroy(): void {
    this.unregisterEvents();

    // 兜底清理：移除所有绑定到本组件的事件监听，防止事件泄漏
    EventManager.getInstance().offTarget(this);
  }

  // ==================== 面板控制 ====================

  /**
   * 显示面板
   * 执行顺序：激活节点 → 入场动画 → 设置状态 → onShow 回调
   */
  show(): void {
    console.error('[STACK_TRACE]', 'BasePanel.show — node=', this.node?.name, '_isShowing=', this._isShowing);
    if (this._isShowing) return;

    this.markLayoutDirty('USER_ACTION');
    this.node.active = true;
    this.playShowAnimation();
    this._isShowing = true;
    this.onShow();
  }

  /**
   * 隐藏面板
   * 执行顺序：onHide 回调 → 出场动画 → 设置状态 → 停用节点
   */
  hide(): void {
    console.error('[STACK_TRACE]', 'BasePanel.hide — node=', this.node?.name, '_isShowing=', this._isShowing);
    if (!this._isShowing) return;

    this.onHide();
    this.playHideAnimation();
    this._isShowing = false;
    this.node.active = false;
  }

  /**
   * 关闭面板
   * 执行顺序：onClose 回调（清理）→ hide 流程
   * 子类可重写以追加销毁逻辑（如回收节点到对象池）
   */
  close(): void {
    console.error('[STACK_TRACE]', 'BasePanel.close — node=', this.node?.name, '_isShowing=', this._isShowing);
    if (!this._isShowing) return;

    this.onClose();
    this.hide();
  }

  /** 查询面板是否正在显示 */
  isShowing(): boolean {
    return this._isShowing;
  }

  // ==================== 子类可重写的生命周期回调 ====================

  /** 面板显示时回调（show 的最后一步，子类重写以刷新 UI 数据） */
  protected onShow(): void {
    // 子类重写
  }

  /** 面板隐藏时回调（hide 的第一步，子类重写以暂停动画/特效） */
  protected onHide(): void {
    // 子类重写
  }

  /** 面板关闭时回调（close 的第一步，子类重写以清理临时数据） */
  protected onClose(): void {
    // 子类重写
  }

  // ==================== EventManager 集成 ====================

  /**
   * 注册事件监听
   * 子类重写：在此方法内通过 EventManager.on() 注册所有需要的监听
   * 在 onLoad 中自动调用
   *
   * @example
   * protected registerEvents(): void {
   *   EventManager.getInstance().on(
   *     EventManager.DATA_CHANGE, this.onDataChange, this
   *   );
   * }
   */
  protected registerEvents(): void {
    // 子类重写
  }

  /**
   * 移除事件监听
   * 子类重写：在此方法内通过 EventManager.off() 移除 registerEvents 中注册的监听
   * 在 onDestroy 中自动调用，随后由 EventManager.offTarget(this) 兜底清理
   *
   * @example
   * protected unregisterEvents(): void {
   *   EventManager.getInstance().off(
   *     EventManager.DATA_CHANGE, this.onDataChange, this
   *   );
   * }
   */
  protected unregisterEvents(): void {
    // 子类重写
  }

  // ==================== 动画钩子 ====================

  /**
   * 入场动画
   * 子类重写以实现面板出现动画（缩放弹入 / 透明度渐变等）
   * 默认空实现（面板直接出现）
   */
  // ==================== UI Layout Pipeline ====================

  protected markLayoutDirty(source: UIDirtySource = 'RUNTIME_UPDATE'): void {
    this._layoutDirty = true;
    this._layoutDirtySource = source;
  }

  protected playShowAnimation(): void {
    // 子类重写
  }

  /**
   * 出场动画
   * 子类重写以实现面板消失动画
   * 默认空实现（面板直接消失）
   */
  protected playHideAnimation(): void {
    // 子类重写
  }

  // ==================== 安全区适配 ====================

  /**
   * 安全区适配
   * 由 UIManager 统一调用，传入刘海屏 / 异形屏的安全边距
   * 子类重写以调整 UI 节点位置，避免内容被遮挡
   *
   * @param insets  安全区边距（单位：逻辑像素）
   */
  applySafeArea(insets: SafeAreaInsets): void {
    // 子类重写（默认空实现，不做适配）
  }
}
