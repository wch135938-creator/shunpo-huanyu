// ============================================================
// DynamicEnemyPreviewPanel — Phase10-Step3 动态敌人预览面板
// 职责：展示敌人名称、HP/ATK/DEF 倍率，提供刷新预览操作
// 规范：继承 BasePanel / 纯 UI / Portrait 720×1280
// ============================================================

import { _decorator, Node, Label, Button } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import type { DynamicEnemySnapshot } from './ChapterEventTypes';

const { ccclass, property } = _decorator;

@ccclass('DynamicEnemyPreviewPanel')
export class DynamicEnemyPreviewPanel extends BasePanel {

  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '敌人名称' })
  enemyNameLabel: Label | null = null;

  @property({ type: Label, tooltip: 'HP 倍率' })
  hpMultiplierLabel: Label | null = null;

  @property({ type: Label, tooltip: 'ATK 倍率' })
  atkMultiplierLabel: Label | null = null;

  @property({ type: Label, tooltip: 'DEF 倍率' })
  defMultiplierLabel: Label | null = null;

  @property({ type: Label, tooltip: 'SPEED 倍率' })
  speedMultiplierLabel: Label | null = null;

  @property({ type: Label, tooltip: '等级' })
  levelLabel: Label | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Button, tooltip: '刷新预览按钮' })
  refreshButton: Button | null = null;

  // ==================== 内部状态 ====================

  /** 当前展示的敌人快照列表 */
  private _snapshots: DynamicEnemySnapshot[] = [];

  // ==================== 生命周期 ====================

  protected onLoad(): void {
    super.onLoad();
    this._bindButtons();
  }

  // ==================== 公共接口 ====================

  /**
   * 显示敌人预览面板。
   *
   * @param snapshots  动态敌人快照列表
   */
  showPreview(snapshots: DynamicEnemySnapshot[]): void {
    this._snapshots = snapshots;
    this._refreshUI();
    this.show();
  }

  /**
   * 刷新预览显示。
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
    if (this.refreshButton) {
      this.refreshButton.node.on(Button.EventType.CLICK, this._onRefreshClicked, this);
    }
  }

  /** 刷新 UI 显示（显示第一个敌人快照的信息） */
  private _refreshUI(): void {
    if (this._snapshots.length === 0) {
      this._showEmpty();
      return;
    }

    const snapshot = this._snapshots[0];

    if (this.enemyNameLabel) {
      this.enemyNameLabel.string = snapshot.name;
    }

    // 显示计算后的属性值（快照中已经是倍率应用后的值）
    if (this.hpMultiplierLabel) {
      this.hpMultiplierLabel.string = `HP: ${snapshot.hp}`;
    }
    if (this.atkMultiplierLabel) {
      this.atkMultiplierLabel.string = `ATK: ${snapshot.attack}`;
    }
    if (this.defMultiplierLabel) {
      this.defMultiplierLabel.string = `DEF: ${snapshot.defense}`;
    }
    if (this.speedMultiplierLabel) {
      this.speedMultiplierLabel.string = `SPD: ${snapshot.speed}`;
    }
    if (this.levelLabel) {
      this.levelLabel.string = `Lv.${snapshot.level}`;
    }
  }

  /** 无数据时的占位显示 */
  private _showEmpty(): void {
    if (this.enemyNameLabel) {
      this.enemyNameLabel.string = '(无动态敌人)';
    }
    if (this.hpMultiplierLabel) {
      this.hpMultiplierLabel.string = 'HP: --';
    }
    if (this.atkMultiplierLabel) {
      this.atkMultiplierLabel.string = 'ATK: --';
    }
    if (this.defMultiplierLabel) {
      this.defMultiplierLabel.string = 'DEF: --';
    }
    if (this.speedMultiplierLabel) {
      this.speedMultiplierLabel.string = 'SPD: --';
    }
    if (this.levelLabel) {
      this.levelLabel.string = 'Lv.--';
    }
  }

  /** 关闭按钮回调 */
  private _onCloseClicked(): void {
    this.hide();
  }

  /** 刷新预览按钮回调 */
  private _onRefreshClicked(): void {
    EventManager.getInstance().emit('dynamicEnemy:requestRefresh', {
      panel: 'DynamicEnemyPreviewPanel',
    });
  }

  // ==================== 清理 ====================

  protected onClose(): void {
    super.onClose();
    this._snapshots = [];
  }
}
