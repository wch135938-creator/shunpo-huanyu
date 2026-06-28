// ============================================================
// LoginRewardPopup.ts — 每日登录奖励展示与领取 UI
// ============================================================

import { _decorator, Button, Label } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { LoginRewardEvent, LoginRewardService } from '../operations/LoginRewardService';
import { OperationsConfigRepository } from '../operations/OperationsConfigRepository';
import type { OperationsUITextConfig } from '../operations/OperationsTypes';
import { formatOperationsRewards, formatOperationsText } from './OperationsUIFormatter';

const { ccclass, property } = _decorator;

@ccclass('LoginRewardPopup')
export class LoginRewardPopup extends BasePanel {
  @property(Label) titleLabel: Label | null = null;
  @property(Label) dayLabel: Label | null = null;
  @property(Label) rewardLabel: Label | null = null;
  @property(Label) statusLabel: Label | null = null;
  @property(Button) claimButton: Button | null = null;
  @property(Label) claimButtonLabel: Label | null = null;
  @property(Button) closeButton: Button | null = null;
  @property(Label) closeButtonLabel: Label | null = null;

  private _service = LoginRewardService.getInstance();
  private _configRepository = OperationsConfigRepository.getInstance();

  onLoad(): void {
    super.onLoad();
    console.log('[SOP-UI-01] PREFAB_INIT:', this.node.name);
    this.claimButton?.node.on(Button.EventType.CLICK, this._claimToday, this);
    this.closeButton?.node.on(Button.EventType.CLICK, this._closePopup, this);
  }

  protected registerEvents(): void {
    EventManager.getInstance().on(LoginRewardEvent.CLAIMED, this._handleClaimed, this);
  }

  protected unregisterEvents(): void {
    EventManager.getInstance().off(LoginRewardEvent.CLAIMED, this._handleClaimed, this);
  }

  async open(): Promise<void> {
    await this._service.initialize();
    this._render();
    this.show();
  }

  onDestroy(): void {
    this.claimButton?.node.off(Button.EventType.CLICK, this._claimToday, this);
    this.closeButton?.node.off(Button.EventType.CLICK, this._closePopup, this);
    super.onDestroy();
  }

  private _render(): void {
    const ui = this._getUIConfig();
    if (!ui) return;
    const status = this._service.getTodayStatus();
    if (this.titleLabel) this.titleLabel.string = ui.loginTitle;
    if (this.dayLabel) {
      this.dayLabel.string = formatOperationsText(ui.loginDayFormat, { day: status.rewardDay });
    }
    if (this.rewardLabel) {
      this.rewardLabel.string = formatOperationsRewards(status.rewards, ui.itemNames);
    }
    if (this.statusLabel) {
      this.statusLabel.string = !status.active
        ? ui.loginInactive
        : status.claimed ? ui.loginClaimed : '';
    }
    if (this.claimButton) this.claimButton.interactable = status.active && !status.claimed;
    if (this.claimButtonLabel) {
      this.claimButtonLabel.string = status.claimed ? ui.loginClaimed : ui.loginClaim;
    }
    if (this.closeButtonLabel) this.closeButtonLabel.string = ui.close;
    this.markLayoutDirty('RUNTIME_UPDATE');
  }

  private _claimToday(): void {
    const ui = this._getUIConfig();
    if (!ui) return;
    const result = this._service.claimToday();
    if (!result.success && this.statusLabel) this.statusLabel.string = ui.actionFailed;
    this._render();
  }

  private _handleClaimed(): void {
    if (this.isShowing()) this._render();
  }

  private _closePopup(): void {
    this.hide();
  }

  private _getUIConfig(): OperationsUITextConfig | null {
    return this._configRepository.getConfig()?.ui ?? null;
  }
}
