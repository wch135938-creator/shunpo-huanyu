// ============================================================
// LiveOpsPanel — Phase8 运营活动面板
// 职责：展示当前活跃活动 / 倒计时 / 奖励预览 / 活动入口
// 规范：继承 BasePanel / 纯 UI / 通过 Phase8Bootstrap 获取系统引用
// ============================================================

import { _decorator, Node, Label, Button, Prefab, instantiate, Color } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { LiveOpsManager } from '../systems/LiveOpsManager';
import type { LiveOpsConfig } from '../data/liveops_types';
import type { LiveOpsCardUIData } from '../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('LiveOpsPanel')
export class LiveOpsPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '标题标签' })
  titleLabel: Label | null = null;

  @property({ type: Node, tooltip: '活动卡片列表容器' })
  cardListContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '活动卡片 Prefab' })
  activityCardPrefab: Prefab | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Label, tooltip: '空状态提示' })
  emptyHintLabel: Label | null = null;

  @property({ type: Label, tooltip: '刷新时间标签' })
  lastRefreshLabel: Label | null = null;

  // ==================== 内部状态 ====================

  private _liveOpsManager: LiveOpsManager | null = null;
  private _cards: LiveOpsCardUIData[] = [];
  private _countdownInterval: ReturnType<typeof setInterval> | null = null;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    em.on('liveOps:refreshed', this._onLiveOpsRefreshed, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off('liveOps:refreshed', this._onLiveOpsRefreshed, this);
  }

  // ==================== 公开方法 ====================

  /** 打开运营活动面板 */
  open(): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    this._liveOpsManager = bootstrap.getLiveOpsManager();

    // 刷新活动状态
    this._liveOpsManager.refreshEvents();
    this._buildCards();
    this._renderCardList();

    if (this.titleLabel) {
      this.titleLabel.string = '限时活动';
    }

    if (this.lastRefreshLabel) {
      const state = this._liveOpsManager.getState();
      this.lastRefreshLabel.string = state.lastRefreshAt > 0
        ? `刷新时间: ${new Date(state.lastRefreshAt).toLocaleTimeString()}`
        : '';
    }

    this.show();

    // 启动倒计时刷新（每秒）
    this._startCountdown();
  }

  // ==================== 内部：构建卡片列表 ====================

  private _buildCards(): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    const configs = bootstrap.getLiveOpsConfigs();
    const activeIds = this._liveOpsManager?.getActiveEvents() ?? [];
    const now = Date.now();
    const cards: LiveOpsCardUIData[] = [];

    for (const config of configs) {
      const isActive = activeIds.includes(config.id);
      const isEnded = now > config.endTime;
      const isUpcoming = now < config.startTime;

      let status: LiveOpsCardUIData['status'];
      let remainingSeconds = 0;

      if (isEnded) {
        status = 'ended';
      } else if (isUpcoming) {
        status = 'upcoming';
        remainingSeconds = Math.max(0, Math.floor((config.startTime - now) / 1000));
      } else {
        status = 'active';
        remainingSeconds = Math.max(0, Math.floor((config.endTime - now) / 1000));
      }

      cards.push({
        eventId: config.id,
        nameKey: `activity_${config.id}`,
        status,
        remainingSeconds,
        rewardPreview: `${config.rewardPoolRefs.length} 个奖励池`,
        tags: config.tags ?? [],
      });
    }

    // 排序：活跃 > 即将开始 > 已结束
    const statusOrder = { active: 0, upcoming: 1, ended: 2 };
    cards.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    this._cards = cards;
  }

  // ==================== 内部：渲染 ====================

  private _renderCardList(): void {
    if (!this.cardListContainer || !this.activityCardPrefab) return;

    this.cardListContainer.removeAllChildren();

    if (this._cards.length === 0) {
      if (this.emptyHintLabel) {
        this.emptyHintLabel.string = '暂无限时活动';
        this.emptyHintLabel.node.active = true;
      }
      return;
    }

    if (this.emptyHintLabel) {
      this.emptyHintLabel.node.active = false;
    }

    for (const card of this._cards) {
      const cardNode = instantiate(this.activityCardPrefab);
      this._configureCard(cardNode, card);
      this.cardListContainer.addChild(cardNode);
    }
  }

  private _configureCard(cardNode: Node, card: LiveOpsCardUIData): void {
    const nameLabel = cardNode.getChildByName('NameLabel')?.getComponent(Label);
    const statusLabel = cardNode.getChildByName('StatusLabel')?.getComponent(Label);
    const countdownLabel = cardNode.getChildByName('CountdownLabel')?.getComponent(Label);
    const rewardLabel = cardNode.getChildByName('RewardLabel')?.getComponent(Label);
    const tagLabel = cardNode.getChildByName('TagLabel')?.getComponent(Label);
    const enterBtn = cardNode.getChildByName('EnterButton')?.getComponent(Button);

    if (nameLabel) nameLabel.string = card.nameKey;

    if (statusLabel) {
      const statusText: Record<string, string> = {
        active: '🔥 进行中',
        upcoming: '⏳ 即将开始',
        ended: '✅ 已结束',
      };
      statusLabel.string = statusText[card.status] ?? card.status;
    }

    if (countdownLabel) {
      countdownLabel.string = this._formatCountdown(card.remainingSeconds);
    }

    if (rewardLabel) rewardLabel.string = card.rewardPreview;

    if (tagLabel && card.tags.length > 0) {
      tagLabel.string = card.tags.join(' · ');
    }

    if (enterBtn) {
      enterBtn.node.active = card.status === 'active';
      enterBtn.node.on(Button.EventType.CLICK, () => {
        this._handleEnterActivity(card.eventId);
      }, this);
    }
  }

  // ==================== 倒计时 ====================

  private _startCountdown(): void {
    this._stopCountdown();

    this._countdownInterval = setInterval(() => {
      if (!this._isShowing) {
        this._stopCountdown();
        return;
      }

      // 更新所有卡片的倒计时
      for (const card of this._cards) {
        if (card.status === 'active') {
          card.remainingSeconds = Math.max(0, card.remainingSeconds - 1);
        }
      }

      // 重新渲染以更新倒计时显示
      this._renderCardList();
    }, 1000);
  }

  private _stopCountdown(): void {
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
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

  // ==================== 交互 ====================

  private _handleEnterActivity(eventId: string): void {
    console.log(`[LiveOpsPanel] 进入活动: ${eventId}`);
    // TODO: 打开活动详情或触发活动事件
  }

  // ==================== 事件响应 ====================

  private _onLiveOpsRefreshed(..._args: unknown[]): void {
    if (!this._isShowing) return;
    this._buildCards();
    this._renderCardList();
  }

  // ==================== 重写生命周期 ====================

  protected onHide(): void {
    this._stopCountdown();
  }

  protected onClose(): void {
    this._stopCountdown();
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    this.closeButton?.node.on(Button.EventType.CLICK, this._handleClose, this);
  }

  private _handleClose(): void {
    this.hide();
  }

  onDestroy(): void {
    this._stopCountdown();
    super.onDestroy();
  }
}
