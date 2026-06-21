// ============================================================
// RewardItemTemplate — 奖励展示项模板组件
// 职责：挂载到 ResultPanel 的 rewardItemPrefab 上
// ============================================================

import { _decorator, Component, Label, Sprite } from 'cc';
import type { RewardDisplayItem } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('RewardItemTemplate')
export class RewardItemTemplate extends Component {
  @property({ type: Label, tooltip: '图标标签（emoji）' })
  iconLabel: Label | null = null;

  @property({ type: Label, tooltip: '名称标签' })
  nameLabel: Label | null = null;

  @property({ type: Label, tooltip: '数量标签' })
  qtyLabel: Label | null = null;

  @property({ type: Sprite, tooltip: '稀有度边框（可选）' })
  rarityFrame: Sprite | null = null;

  private _reward: RewardDisplayItem | null = null;

  setup(reward: RewardDisplayItem): void {
    this._reward = reward;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._reward) return;

    // 使用 emoji 映射作为图标
    const emojiMap: Record<string, string> = {
      gold: '💰',
      exp: '✨',
      equipment: '⚔️',
      item: '📦',
      currency: '💎',
    };

    if (this.iconLabel) {
      this.iconLabel.string = emojiMap[this._reward.rewardType] ?? '📦';
    }
    if (this.nameLabel) this.nameLabel.string = this._reward.displayName;
    if (this.qtyLabel) this.qtyLabel.string = `x${this._reward.quantity}`;
  }
}
