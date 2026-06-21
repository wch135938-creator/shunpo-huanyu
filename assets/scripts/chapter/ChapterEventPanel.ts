// ============================================================
// ChapterEventPanel — Phase10-Step3 章节事件展示面板
// 职责：展示事件名称、描述、类型，提供关闭/确认/刷新操作
// 规范：继承 BasePanel / 纯 UI / Portrait 720×1280
// ============================================================

import { _decorator, Node, Label, Button } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import type { ChapterEventRecord } from './ChapterEventTypes';

const { ccclass, property } = _decorator;

@ccclass('ChapterEventPanel')
export class ChapterEventPanel extends BasePanel {

  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '事件名称' })
  eventNameLabel: Label | null = null;

  @property({ type: Label, tooltip: '事件描述' })
  eventDescLabel: Label | null = null;

  @property({ type: Label, tooltip: '事件类型标签' })
  eventTypeLabel: Label | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Button, tooltip: '确认按钮' })
  confirmButton: Button | null = null;

  @property({ type: Button, tooltip: '刷新按钮' })
  refreshButton: Button | null = null;

  // ==================== 内部状态 ====================

  /** 当前展示的事件记录 */
  private _currentEvent: ChapterEventRecord | null = null;

  /** 确认回调 */
  private _onConfirmCallback: (() => void) | null = null;

  /** 关闭回调 */
  private _onCloseCallback: (() => void) | null = null;

  // ==================== 生命周期 ====================

  protected onLoad(): void {
    super.onLoad();
    this._bindButtons();
  }

  // ==================== 公共接口 ====================

  /**
   * 显示事件面板。
   *
   * @param event    事件记录
   * @param onConfirm  确认回调
   * @param onClose    关闭回调
   */
  showEvent(
    event: ChapterEventRecord,
    onConfirm?: () => void,
    onClose?: () => void,
  ): void {
    this._currentEvent = event;
    this._onConfirmCallback = onConfirm ?? null;
    this._onCloseCallback = onClose ?? null;

    this._refreshUI();
    this.show();
  }

  /**
   * 刷新面板显示（重新抽取事件时可调用）。
   */
  refresh(): void {
    this._refreshUI();
  }

  // ==================== 内部方法 ====================

  /** 绑定按钮事件 */
  private _bindButtons(): void {
    if (this.closeButton) {
      this.closeButton.node.on(Button.EventType.CLICK, this._onCloseClicked, this);
    }
    if (this.confirmButton) {
      this.confirmButton.node.on(Button.EventType.CLICK, this._onConfirmClicked, this);
    }
    if (this.refreshButton) {
      this.refreshButton.node.on(Button.EventType.CLICK, this._onRefreshClicked, this);
    }
  }

  /** 刷新 UI 显示 */
  private _refreshUI(): void {
    if (!this._currentEvent) return;

    if (this.eventNameLabel) {
      this.eventNameLabel.string = this._currentEvent.eventName;
    }
    if (this.eventDescLabel) {
      this.eventDescLabel.string = '';
    }
    if (this.eventTypeLabel) {
      this.eventTypeLabel.string = this._currentEvent.eventType;
    }
  }

  /** 关闭按钮回调 */
  private _onCloseClicked(): void {
    if (this._onCloseCallback) {
      this._onCloseCallback();
    }
    this.hide();
  }

  /** 确认按钮回调 */
  private _onConfirmClicked(): void {
    if (this._onConfirmCallback) {
      this._onConfirmCallback();
    }
    this.hide();
  }

  /** 刷新按钮回调 */
  private _onRefreshClicked(): void {
    EventManager.getInstance().emit('chapterEvent:requestRefresh', {
      panel: 'ChapterEventPanel',
    });
  }

  // ==================== 清理 ====================

  protected onClose(): void {
    super.onClose();
    this._currentEvent = null;
    this._onConfirmCallback = null;
    this._onCloseCallback = null;
  }
}
