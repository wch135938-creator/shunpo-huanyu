// ============================================================
// LiveOpsCardTemplate — 运营活动卡片模板组件
// 职责：挂载到 LiveOpsPanel 的 activityCardPrefab 上
// ============================================================

import { _decorator, Component, Label, Button, Node } from 'cc';
import type { LiveOpsCardUIData } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('LiveOpsCardTemplate')
export class LiveOpsCardTemplate extends Component {
  @property({ type: Label, tooltip: '活动名称' })
  nameLabel: Label | null = null;

  @property({ type: Label, tooltip: '状态标签' })
  statusLabel: Label | null = null;

  @property({ type: Label, tooltip: '倒计时标签' })
  countdownLabel: Label | null = null;

  @property({ type: Label, tooltip: '奖励预览标签' })
  rewardLabel: Label | null = null;

  @property({ type: Label, tooltip: '标签标签' })
  tagLabel: Label | null = null;

  @property({ type: Button, tooltip: '进入按钮' })
  enterButton: Button | null = null;

  private _card: LiveOpsCardUIData | null = null;
  private _onEnterCallback: ((eventId: string) => void) | null = null;

  setup(card: LiveOpsCardUIData, onEnter?: (eventId: string) => void): void {
    this._card = card;
    this._onEnterCallback = onEnter ?? null;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._card) return;

    if (this.nameLabel) this.nameLabel.string = this._card.nameKey;

    if (this.statusLabel) {
      const statusText: Record<string, string> = {
        active: '🔥 进行中',
        upcoming: '⏳ 即将开始',
        ended: '✅ 已结束',
      };
      this.statusLabel.string = statusText[this._card.status] ?? this._card.status;
    }

    if (this.countdownLabel) {
      this.countdownLabel.string = this._formatCountdown(this._card.remainingSeconds);
    }

    if (this.rewardLabel) this.rewardLabel.string = this._card.rewardPreview;

    if (this.tagLabel && this._card.tags.length > 0) {
      this.tagLabel.string = this._card.tags.join(' · ');
    }

    if (this.enterButton) {
      this.enterButton.node.active = this._card.status === 'active';
      this.enterButton.node.off(Button.EventType.CLICK);
      this.enterButton.node.on(Button.EventType.CLICK, this._onEnterClicked, this);
    }
  }

  private _onEnterClicked(): void {
    if (this._card && this._onEnterCallback) {
      this._onEnterCallback(this._card.eventId);
    }
  }

  private _formatCountdown(seconds: number): string {
    if (seconds <= 0) return '已结束';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) {
      return `${d}天 ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
