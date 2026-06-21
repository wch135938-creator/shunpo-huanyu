// ============================================================
// RewardPanel.ts — 奖励结算面板
// 职责：展示金币/经验/道具/奖励来源，确认领取/关闭
// 位置：reward/ 层
// 依赖：Cocos Component, RewardTypes
// 规范：UI 与逻辑分离 / 所有数据由外部注入 / 零硬编码
// ============================================================

import { Component, Label, Node, Sprite, _decorator } from 'cc';
import type { AggregatedReward, RewardEntry } from './RewardTypes';

const { ccclass, property } = _decorator;

/** 奖励面板显示模式 */
export type RewardPanelMode = 'settlement' | 'preview';

@ccclass('RewardPanel')
export class RewardPanel extends Component {
  // ==================== 属性声明 ====================

  @property({ type: Label, tooltip: '面板标题' })
  private _titleLabel: Label | null = null;

  @property({ type: Label, tooltip: '金币数量文本' })
  private _goldLabel: Label | null = null;

  @property({ type: Label, tooltip: '经验数量文本' })
  private _expLabel: Label | null = null;

  @property({ type: Label, tooltip: '道具列表文本' })
  private _itemListLabel: Label | null = null;

  @property({ type: Label, tooltip: '奖励来源文本' })
  private _sourceLabel: Label | null = null;

  @property({ type: Node, tooltip: '确认按钮节点' })
  private _confirmBtn: Node | null = null;

  @property({ type: Node, tooltip: '关闭按钮节点' })
  private _closeBtn: Node | null = null;

  @property({ type: Node, tooltip: '金币行节点' })
  private _goldRow: Node | null = null;

  @property({ type: Node, tooltip: '经验行节点' })
  private _expRow: Node | null = null;

  @property({ type: Node, tooltip: '道具行节点' })
  private _itemRow: Node | null = null;

  // ==================== 内部状态 ====================

  private _currentReward: AggregatedReward | null = null;
  private _mode: RewardPanelMode = 'settlement';

  // ==================== 生命周期 ====================

  onLoad(): void {
    this._registerEvents();
    this._hideAllRows();
  }

  onDestroy(): void {
    this._unregisterEvents();
  }

  // ==================== 公共接口 ====================

  /**
   * 显示奖励面板
   *
   * @param aggregated — 聚合后的奖励摘要
   * @param mode       — 显示模式（默认 settlement）
   */
  showReward(aggregated: AggregatedReward, mode: RewardPanelMode = 'settlement'): void {
    this._currentReward = aggregated;
    this._mode = mode;
    this._render();
    this.node.active = true;
  }

  /** 刷新面板（重新渲染当前数据） */
  refresh(): void {
    if (this._currentReward) {
      this._render();
    }
  }

  /** 隐藏面板 */
  hide(): void {
    this.node.active = false;
  }

  /** 获取当前奖励数据 */
  getCurrentReward(): AggregatedReward | null {
    return this._currentReward;
  }

  // ==================== 内部 — 渲染 ====================

  private _render(): void {
    if (!this._currentReward) return;

    const reward = this._currentReward;
    const firstEntry = reward.rawRewards[0];

    // 标题
    if (this._titleLabel) {
      this._titleLabel.string = this._mode === 'settlement' ? '获得奖励' : '奖励预览';
    }

    // 金币
    if (reward.totalGold > 0) {
      this._showRow(this._goldRow);
      if (this._goldLabel) {
        this._goldLabel.string = `+${reward.totalGold}`;
      }
    } else {
      this._hideRow(this._goldRow);
    }

    // 经验
    if (reward.totalExp > 0) {
      this._showRow(this._expRow);
      if (this._expLabel) {
        this._expLabel.string = `+${reward.totalExp}`;
      }
    } else {
      this._hideRow(this._expRow);
    }

    // 道具列表
    const itemEntries = this._buildItemText(reward.rawRewards);
    if (itemEntries.length > 0) {
      this._showRow(this._itemRow);
      if (this._itemListLabel) {
        this._itemListLabel.string = itemEntries.join('\n');
      }
    } else {
      this._hideRow(this._itemRow);
    }

    // 来源
    if (this._sourceLabel && firstEntry) {
      const sourceText = this._getSourceText(firstEntry.source, firstEntry.sourceId);
      this._sourceLabel.string = `来源: ${sourceText}`;
    }

    // 按钮模式
    if (this._mode === 'settlement') {
      this._showNode(this._confirmBtn);
    } else {
      this._hideNode(this._confirmBtn);
    }
  }

  /**
   * 构建道具文本列表。
   *
   * 将 rawRewards 中的道具按 itemId 聚合后生成展示文本，
   * 确保同一 itemId 多次出现时显示合计数量。
   */
  private _buildItemText(rewards: RewardEntry[]): string[] {
    // 按 itemId 聚合数量
    const aggregated: Record<string, number> = {};

    for (const r of rewards) {
      // 跳过金币和经验（已在上面展示）
      if (r.itemId === 'ITEM_GOLD' || r.itemId === 'ITEM_EXP') continue;
      if (r.itemType === 'gold' || r.itemType === 'exp') continue;

      aggregated[r.itemId] = (aggregated[r.itemId] || 0) + r.count;
    }

    // 按聚合后的结果生成展示文本
    const texts: string[] = [];
    for (const [itemId, totalCount] of Object.entries(aggregated)) {
      texts.push(`${itemId} x${totalCount}`);
    }

    return texts;
  }

  private _getSourceText(source: string, sourceId: string): string {
    switch (source) {
      case 'battle': return `战斗通关 - ${sourceId}`;
      case 'chapter': return `章节完成 - ${sourceId}`;
      case 'event': return `事件奖励 - ${sourceId}`;
      case 'enemy': return `敌人击杀 - ${sourceId}`;
      case 'pool': return `奖励池 - ${sourceId}`;
      default: return sourceId;
    }
  }

  // ==================== 内部 — 事件 ====================

  private _registerEvents(): void {
    if (this._confirmBtn) {
      this._confirmBtn.on(Node.EventType.TOUCH_END, this._onConfirmClick, this);
    }
    if (this._closeBtn) {
      this._closeBtn.on(Node.EventType.TOUCH_END, this._onCloseClick, this);
    }
  }

  private _unregisterEvents(): void {
    if (this._confirmBtn) {
      this._confirmBtn.off(Node.EventType.TOUCH_END, this._onConfirmClick, this);
    }
    if (this._closeBtn) {
      this._closeBtn.off(Node.EventType.TOUCH_END, this._onCloseClick, this);
    }
  }

  private _onConfirmClick(): void {
    // 确认领取 — 奖励已由 RewardSystem 发放，此处仅关闭面板
    this.node.active = false;
  }

  private _onCloseClick(): void {
    this.node.active = false;
  }

  // ==================== 内部 — 工具 ====================

  private _showRow(node: Node | null): void {
    if (node) node.active = true;
  }

  private _hideRow(node: Node | null): void {
    if (node) node.active = false;
  }

  private _showNode(node: Node | null): void {
    if (node) node.active = true;
  }

  private _hideNode(node: Node | null): void {
    if (node) node.active = false;
  }

  private _hideAllRows(): void {
    this._hideRow(this._goldRow);
    this._hideRow(this._expRow);
    this._hideRow(this._itemRow);
  }
}
