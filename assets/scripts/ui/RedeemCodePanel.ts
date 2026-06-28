// ============================================================
// RedeemCodePanel.ts — 兑换码输入与结果反馈 UI
// ============================================================

import { _decorator, Button, EditBox, Label } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { OperationsConfigRepository } from '../operations/OperationsConfigRepository';
import { RedeemCodeService } from '../operations/RedeemCodeService';
import type { OperationsResultCode, OperationsUITextConfig } from '../operations/OperationsTypes';

const { ccclass, property } = _decorator;

@ccclass('RedeemCodePanel')
export class RedeemCodePanel extends BasePanel {
  @property(Label) titleLabel: Label | null = null;
  @property(EditBox) codeInput: EditBox | null = null;
  @property(Button) submitButton: Button | null = null;
  @property(Label) submitButtonLabel: Label | null = null;
  @property(Label) resultLabel: Label | null = null;
  @property(Button) closeButton: Button | null = null;
  @property(Label) closeButtonLabel: Label | null = null;

  private _service = RedeemCodeService.getInstance();
  private _configRepository = OperationsConfigRepository.getInstance();
  private _submitting = false;

  onLoad(): void {
    super.onLoad();
    console.log('[SOP-UI-01] PREFAB_INIT:', this.node.name);
    this.submitButton?.node.on(Button.EventType.CLICK, this._submit, this);
    this.closeButton?.node.on(Button.EventType.CLICK, this._closePanel, this);
  }

  async open(): Promise<void> {
    await this._service.initialize();
    const ui = this._getUIConfig();
    if (ui) {
      if (this.titleLabel) this.titleLabel.string = ui.redeemTitle;
      if (this.codeInput) this.codeInput.placeholder = ui.redeemPlaceholder;
      if (this.submitButtonLabel) this.submitButtonLabel.string = ui.redeemSubmit;
      if (this.closeButtonLabel) this.closeButtonLabel.string = ui.close;
    }
    if (this.resultLabel) this.resultLabel.string = '';
    this.show();
  }

  onDestroy(): void {
    this.submitButton?.node.off(Button.EventType.CLICK, this._submit, this);
    this.closeButton?.node.off(Button.EventType.CLICK, this._closePanel, this);
    super.onDestroy();
  }

  private async _submit(): Promise<void> {
    if (this._submitting) return;
    const ui = this._getUIConfig();
    if (!ui) return;

    this._submitting = true;
    if (this.submitButton) this.submitButton.interactable = false;
    try {
      const result = await this._service.redeem(this.codeInput?.string ?? '');
      if (this.resultLabel) this.resultLabel.string = this._resultText(result.code, ui);
      if (result.success && !result.isDuplicate && this.codeInput) this.codeInput.string = '';
    } finally {
      this._submitting = false;
      if (this.submitButton) this.submitButton.interactable = true;
      this.markLayoutDirty('RUNTIME_UPDATE');
    }
  }

  private _resultText(code: OperationsResultCode, ui: OperationsUITextConfig): string {
    switch (code) {
      case 'success': return ui.redeemSuccess;
      case 'duplicate': return ui.redeemDuplicate;
      case 'invalid_code': return ui.redeemInvalid;
      case 'not_active': return ui.redeemInactive;
      case 'server_required': return ui.redeemServerRequired;
      default: return ui.actionFailed;
    }
  }

  private _closePanel(): void {
    this.hide();
  }

  private _getUIConfig(): OperationsUITextConfig | null {
    return this._configRepository.getConfig()?.ui ?? null;
  }
}
