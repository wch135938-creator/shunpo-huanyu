// ============================================================
// OperationsUIManager.ts — 三套运营 UI 的轻量入口协调器
// 边界：只负责面板显隐，不处理奖励或存档逻辑
// ============================================================

import { _decorator, Button, Component, Label } from 'cc';
import { OperationsConfigRepository } from '../operations/OperationsConfigRepository';
import { LoginRewardPopup } from './LoginRewardPopup';
import { MailPanel } from './MailPanel';
import { RedeemCodePanel } from './RedeemCodePanel';

const { ccclass, property } = _decorator;

@ccclass('OperationsUIManager')
export class OperationsUIManager extends Component {
  @property(Button) mailButton: Button | null = null;
  @property(Label) mailButtonLabel: Label | null = null;
  @property(Button) redeemButton: Button | null = null;
  @property(Label) redeemButtonLabel: Label | null = null;
  @property(Button) loginButton: Button | null = null;
  @property(Label) loginButtonLabel: Label | null = null;
  @property(MailPanel) mailPanel: MailPanel | null = null;
  @property(RedeemCodePanel) redeemCodePanel: RedeemCodePanel | null = null;
  @property(LoginRewardPopup) loginRewardPopup: LoginRewardPopup | null = null;

  onLoad(): void {
    this.mailButton?.node.on(Button.EventType.CLICK, this._openMail, this);
    this.redeemButton?.node.on(Button.EventType.CLICK, this._openRedeem, this);
    this.loginButton?.node.on(Button.EventType.CLICK, this._openLogin, this);
  }

  protected start(): void {
    void this._loadLabels();
  }

  onDestroy(): void {
    this.mailButton?.node.off(Button.EventType.CLICK, this._openMail, this);
    this.redeemButton?.node.off(Button.EventType.CLICK, this._openRedeem, this);
    this.loginButton?.node.off(Button.EventType.CLICK, this._openLogin, this);
  }

  private async _loadLabels(): Promise<void> {
    const config = await OperationsConfigRepository.getInstance().load();
    if (this.mailButtonLabel) this.mailButtonLabel.string = config.ui.menuMail;
    if (this.redeemButtonLabel) this.redeemButtonLabel.string = config.ui.menuRedeem;
    if (this.loginButtonLabel) this.loginButtonLabel.string = config.ui.menuLogin;
  }

  private _openMail(): void {
    this._hideAll();
    if (this.mailPanel) void this.mailPanel.open();
  }

  private _openRedeem(): void {
    this._hideAll();
    if (this.redeemCodePanel) void this.redeemCodePanel.open();
  }

  private _openLogin(): void {
    this._hideAll();
    if (this.loginRewardPopup) void this.loginRewardPopup.open();
  }

  private _hideAll(): void {
    if (this.mailPanel?.isShowing()) this.mailPanel.hide();
    if (this.redeemCodePanel?.isShowing()) this.redeemCodePanel.hide();
    if (this.loginRewardPopup?.isShowing()) this.loginRewardPopup.hide();
  }
}
