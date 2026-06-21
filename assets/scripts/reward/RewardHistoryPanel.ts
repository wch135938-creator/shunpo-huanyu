// ============================================================
// RewardHistoryPanel.ts — 奖励历史面板
// 职责：展示最近奖励记录/奖励时间/奖励来源，关闭/清空记录
// 位置：reward/ 层
// 依赖：Cocos Component, RewardSystem, RewardTypes
// 规范：UI 与逻辑分离 / 所有数据由 RewardSystem 读取 / 零硬编码
// ============================================================

import { Component, Label, Node, _decorator } from 'cc';
import { RewardSystem } from './RewardSystem';
import type { RewardHistoryRecord } from './RewardTypes';

const { ccclass, property } = _decorator;

@ccclass('RewardHistoryPanel')
export class RewardHistoryPanel extends Component {
  // ==================== 属性声明 ====================

  @property({ type: Label, tooltip: '面板标题' })
  private _titleLabel: Label | null = null;

  @property({ type: Node, tooltip: '关闭按钮节点' })
  private _closeBtn: Node | null = null;

  @property({ type: Node, tooltip: '清空记录按钮节点' })
  private _clearBtn: Node | null = null;

  @property({ type: Node, tooltip: '历史记录列表容器' })
  private _listContainer: Node | null = null;

  @property({ type: Node, tooltip: '空记录占位节点' })
  private _emptyPlaceholder: Node | null = null;

  @property({ type: Label, tooltip: '记录数量文本' })
  private _countLabel: Label | null = null;

  // ==================== 依赖 ====================

  private _rewardSystem: RewardSystem;

  // ==================== 内部状态 ====================

  private _records: RewardHistoryRecord[] = [];

  // ==================== 构造 ====================

  constructor() {
    super();
    this._rewardSystem = RewardSystem.getInstance();
  }

  // ==================== 生命周期 ====================

  onLoad(): void {
    this._registerEvents();
  }

  onDestroy(): void {
    this._unregisterEvents();
  }

  onEnable(): void {
    this.refresh();
  }

  // ==================== 公共接口 ====================

  /** 刷新历史面板 */
  refresh(): void {
    this._records = this._rewardSystem.getRecentRewards();
    this._render();
  }

  /** 隐藏面板 */
  hide(): void {
    this.node.active = false;
  }

  /** 获取当前记录数量 */
  getRecordCount(): number {
    return this._records.length;
  }

  // ==================== 内部 — 渲染 ====================

  private _render(): void {
    // 标题
    if (this._titleLabel) {
      this._titleLabel.string = '奖励记录';
    }

    // 记录数量
    if (this._countLabel) {
      this._countLabel.string = `共 ${this._records.length} 条记录`;
    }

    // 空占位
    if (this._emptyPlaceholder) {
      this._emptyPlaceholder.active = this._records.length === 0;
    }

    // 列表容器
    if (this._listContainer) {
      this._listContainer.active = this._records.length > 0;

      // 清理旧子节点
      this._listContainer.removeAllChildren();

      // 渲染每条记录
      for (const record of this._records) {
        const rowNode = this._renderRecordRow(record);
        if (rowNode) {
          this._listContainer.addChild(rowNode);
        }
      }
    }
  }

  private _renderRecordRow(record: RewardHistoryRecord): Node | null {
    // 创建记录行节点（简化版：使用 Label 显示文本摘要）
    const rowNode = new Node('RewardRecordRow');
    const label = rowNode.addComponent(Label);

    const timeStr = new Date(record.grantedAt).toLocaleString();
    const sourceStr = this._getSourceText(record.source, record.sourceId);
    const rewardSummary = this._getRewardSummary(record);

    label.string = `[${timeStr}] ${sourceStr}\n${rewardSummary}`;
    label.fontSize = 12;
    label.lineHeight = 18;

    return rowNode;
  }

  private _getSourceText(source: string, sourceId: string): string {
    switch (source) {
      case 'battle': return `战斗通关`;
      case 'chapter': return `章节完成`;
      case 'event': return `事件奖励`;
      case 'enemy': return `敌人击杀`;
      case 'pool': return `奖励池`;
      default: return sourceId;
    }
  }

  private _getRewardSummary(record: RewardHistoryRecord): string {
    let goldSum = 0;
    let expSum = 0;
    const items: string[] = [];

    for (const r of record.rewards) {
      if (r.itemType === 'gold' || r.itemId === 'ITEM_GOLD') {
        goldSum += r.count;
      } else if (r.itemType === 'exp' || r.itemId === 'ITEM_EXP') {
        expSum += r.count;
      } else {
        items.push(`${r.itemId} x${r.count}`);
      }
    }

    const parts: string[] = [];
    if (goldSum > 0) parts.push(`金币 +${goldSum}`);
    if (expSum > 0) parts.push(`经验 +${expSum}`);
    parts.push(...items);

    return parts.join(' | ') || '无物品';
  }

  // ==================== 内部 — 事件 ====================

  private _registerEvents(): void {
    if (this._closeBtn) {
      this._closeBtn.on(Node.EventType.TOUCH_END, this._onCloseClick, this);
    }
    if (this._clearBtn) {
      this._clearBtn.on(Node.EventType.TOUCH_END, this._onClearClick, this);
    }
  }

  private _unregisterEvents(): void {
    if (this._closeBtn) {
      this._closeBtn.off(Node.EventType.TOUCH_END, this._onCloseClick, this);
    }
    if (this._clearBtn) {
      this._clearBtn.off(Node.EventType.TOUCH_END, this._onClearClick, this);
    }
  }

  private _onCloseClick(): void {
    this.node.active = false;
  }

  private _onClearClick(): void {
    this._rewardSystem.clearHistory();
    this.refresh();
  }
}
