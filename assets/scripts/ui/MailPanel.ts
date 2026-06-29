// ============================================================
// MailPanel.ts — 邮箱展示与附件领取 UI
// 边界：只调用 MailService，不直接修改 OperationsData / Inventory
// ============================================================

import { _decorator, Button, Label } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { MailEvent, MailService } from '../operations/MailService';
import { OperationsConfigRepository } from '../operations/OperationsConfigRepository';
import type { MailMessageData, OperationsUITextConfig } from '../operations/OperationsTypes';
import { formatOperationsRewards, formatOperationsText } from './OperationsUIFormatter';

const { ccclass, property } = _decorator;

@ccclass('MailPanel')
export class MailPanel extends BasePanel {
  @property(Label) titleLabel: Label | null = null;
  @property(Label) mailTitleLabel: Label | null = null;
  @property(Label) senderLabel: Label | null = null;
  @property(Label) bodyLabel: Label | null = null;
  @property(Label) attachmentLabel: Label | null = null;
  @property(Label) pageLabel: Label | null = null;
  @property(Label) resultLabel: Label | null = null;
  @property(Button) previousButton: Button | null = null;
  @property(Label) previousButtonLabel: Label | null = null;
  @property(Button) nextButton: Button | null = null;
  @property(Label) nextButtonLabel: Label | null = null;
  @property(Button) claimButton: Button | null = null;
  @property(Label) claimButtonLabel: Label | null = null;
  @property(Button) closeButton: Button | null = null;
  @property(Label) closeButtonLabel: Label | null = null;

  private _mailService = MailService.getInstance();
  private _configRepository = OperationsConfigRepository.getInstance();
  private _messages: MailMessageData[] = [];
  private _selectedIndex = 0;

  onLoad(): void {
    super.onLoad();
    console.log('[SOP-UI-01] PREFAB_INIT:', this.node.name);
    this.previousButton?.node.on(Button.EventType.CLICK, this._showPrevious, this);
    this.nextButton?.node.on(Button.EventType.CLICK, this._showNext, this);
    this.claimButton?.node.on(Button.EventType.CLICK, this._claimCurrent, this);
    this.closeButton?.node.on(Button.EventType.CLICK, this._closePanel, this);
  }

  protected registerEvents(): void {
    EventManager.getInstance().on(MailEvent.UPDATED, this._handleMailUpdated, this);
  }

  protected unregisterEvents(): void {
    EventManager.getInstance().off(MailEvent.UPDATED, this._handleMailUpdated, this);
  }

  async open(): Promise<void> {
    await this._mailService.initialize();
    this._selectedIndex = 0;
    this._refreshMessages();
    this.show();
  }

  onDestroy(): void {
    this.previousButton?.node.off(Button.EventType.CLICK, this._showPrevious, this);
    this.nextButton?.node.off(Button.EventType.CLICK, this._showNext, this);
    this.claimButton?.node.off(Button.EventType.CLICK, this._claimCurrent, this);
    this.closeButton?.node.off(Button.EventType.CLICK, this._closePanel, this);
    super.onDestroy();
  }

  private _refreshMessages(): void {
    this._messages = this._mailService.getMessages();
    this._selectedIndex = Math.min(this._selectedIndex, Math.max(0, this._messages.length - 1));
    this._render();
  }

  private _render(): void {
    const ui = this._getUIConfig();
    if (!ui) return;
    if (this.titleLabel) this.titleLabel.string = ui.mailTitle;
    if (this.previousButtonLabel) this.previousButtonLabel.string = ui.mailPrevious;
    if (this.nextButtonLabel) this.nextButtonLabel.string = ui.mailNext;
    if (this.closeButtonLabel) this.closeButtonLabel.string = ui.close;

    const mail = this._messages[this._selectedIndex];
    if (!mail) {
      if (this.mailTitleLabel) this.mailTitleLabel.string = ui.mailEmpty;
      if (this.senderLabel) this.senderLabel.string = '';
      if (this.bodyLabel) this.bodyLabel.string = '';
      if (this.attachmentLabel) this.attachmentLabel.string = '';
      if (this.pageLabel) this.pageLabel.string = '';
      if (this.claimButton) this.claimButton.interactable = false;
      if (this.claimButtonLabel) this.claimButtonLabel.string = ui.mailClaim;
      this._setNavigationState();
      this.markLayoutDirty('RUNTIME_UPDATE');
      return;
    }

    this._mailService.markRead(mail.mailId);
    const expired = this._mailService.isMailExpired(mail.mailId);
    if (this.mailTitleLabel) this.mailTitleLabel.string = mail.title;
    if (this.senderLabel) {
      this.senderLabel.string = formatOperationsText(ui.mailSenderFormat, { sender: mail.sender });
    }
    if (this.bodyLabel) this.bodyLabel.string = mail.body;
    if (this.attachmentLabel) {
      this.attachmentLabel.string = mail.attachments.length > 0
        ? formatOperationsRewards(mail.attachments, ui.itemNames)
        : ui.mailNoAttachment;
    }
    if (this.pageLabel) {
      this.pageLabel.string = formatOperationsText(ui.mailPageFormat, {
        current: this._selectedIndex + 1,
        total: this._messages.length,
      });
    }
    if (this.claimButton) {
      this.claimButton.interactable = mail.attachments.length > 0 && mail.claimedAt <= 0 && !expired;
    }
    if (this.claimButtonLabel) {
      this.claimButtonLabel.string = expired
        ? ui.mailExpired
        : mail.claimedAt > 0 ? ui.mailClaimed : ui.mailClaim;
    }
    this._setNavigationState();
    this.markLayoutDirty('RUNTIME_UPDATE');
  }

  private _setNavigationState(): void {
    if (this.previousButton) this.previousButton.interactable = this._selectedIndex > 0;
    if (this.nextButton) this.nextButton.interactable = this._selectedIndex + 1 < this._messages.length;
  }

  private _showPrevious(): void {
    if (this._selectedIndex <= 0) return;
    this._selectedIndex -= 1;
    this._clearResult();
    this._render();
  }

  private _showNext(): void {
    if (this._selectedIndex + 1 >= this._messages.length) return;
    this._selectedIndex += 1;
    this._clearResult();
    this._render();
  }

  private _claimCurrent(): void {
    const mail = this._messages[this._selectedIndex];
    const ui = this._getUIConfig();
    if (!mail || !ui) return;
    const result = this._mailService.claimAttachments(mail.mailId);
    if (this.resultLabel) {
      this.resultLabel.string = result.success
        ? (result.isDuplicate ? ui.mailClaimed : ui.mailClaimSuccess)
        : result.code === 'expired' ? ui.mailExpired : ui.actionFailed;
    }
    this._refreshMessages();
  }

  private _handleMailUpdated(): void {
    if (this.isShowing()) this._refreshMessages();
  }

  private _clearResult(): void {
    if (this.resultLabel) this.resultLabel.string = '';
  }

  private _closePanel(): void {
    this.hide();
  }

  private _getUIConfig(): OperationsUITextConfig | null {
    return this._configRepository.getConfig()?.ui ?? null;
  }
}
