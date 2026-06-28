// ============================================================
// MailService.ts — 邮箱数据、查询与附件领取闭环
// 规则：创建邮件不发奖；只有 claimAttachments() 可以发放附件
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import type { SaveContainerV8 } from '../save/SaveContainerV8';
import { OperationsConfigRepository } from './OperationsConfigRepository';
import { ensureOperationsSaveData } from './OperationsSaveData';
import {
  buildMailClaimTransactionId,
  grantOperationsRewards,
} from './OperationsRewardGrant';
import type {
  MailCreateRequest,
  MailMessageData,
  OperationsGrantResult,
  OperationsSaveData,
} from './OperationsTypes';

export const MailEvent = {
  UPDATED: 'operations:mailUpdated',
  CLAIMED: 'operations:mailClaimed',
} as const;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export class MailService extends BaseManager {
  private _saveManager = SaveManager.getInstance();
  private _configRepository = OperationsConfigRepository.getInstance();
  private _eventManager = EventManager.getInstance();
  private _data: OperationsSaveData | null = null;
  private _accountId = '';
  private _initialized = false;
  private _now: () => number = () => Date.now();

  async initialize(accountId?: string): Promise<void> {
    const config = await this._configRepository.load();
    const resolvedAccountId = accountId || config.development.accountId;
    if (this._initialized && this._accountId === resolvedAccountId) return;

    const container = this._saveManager.getData() as SaveContainerV8 | null;
    if (!container) throw new Error('[MailService] SaveManager 尚未初始化');

    this._data = ensureOperationsSaveData(container);
    this._accountId = resolvedAccountId;
    this._seedInitialMail();
    this._initialized = true;
    this._saveManager.markDirty();
    console.log('[MailService] 初始化完成');
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  setNowProvider(provider: () => number): void {
    this._now = provider;
  }

  getAccountId(): string {
    return this._accountId;
  }

  createMail(request: MailCreateRequest): MailMessageData {
    const data = this._requireData();
    const existing = data.mailData.messages.find((mail) => mail.mailId === request.mailId);
    if (existing) return cloneMail(existing);

    if (!request.mailId || !request.accountId || !request.title || request.createdAt < 0) {
      throw new Error('[MailService] 邮件请求无效');
    }

    const mail: MailMessageData = {
      ...request,
      attachments: request.attachments.map((reward) => ({ ...reward })),
      readAt: 0,
      claimedAt: 0,
      claimTransactionId: '',
      deleted: false,
    };
    data.mailData.messages.unshift(mail);
    this._trimMessages();
    this._saveManager.markDirty();
    this._eventManager.emit(MailEvent.UPDATED, { mailId: mail.mailId, accountId: mail.accountId });
    return cloneMail(mail);
  }

  getMessages(includeDeleted: boolean = false): MailMessageData[] {
    const data = this._requireData();
    return data.mailData.messages
      .filter((mail) => mail.accountId === this._accountId && (includeDeleted || !mail.deleted))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(cloneMail);
  }

  getMail(mailId: string): MailMessageData | null {
    const mail = this._findOwnedMail(mailId);
    return mail ? cloneMail(mail) : null;
  }

  isMailExpired(mailId: string): boolean {
    const mail = this._findOwnedMail(mailId);
    return !!mail && mail.expiresAt > 0 && this._now() > mail.expiresAt;
  }

  markRead(mailId: string): boolean {
    const mail = this._findOwnedMail(mailId);
    if (!mail || mail.deleted) return false;
    if (mail.readAt <= 0) {
      mail.readAt = this._now();
      this._saveManager.markDirty();
      this._eventManager.emit(MailEvent.UPDATED, { mailId, accountId: mail.accountId });
    }
    return true;
  }

  claimAttachments(mailId: string): OperationsGrantResult {
    const mail = this._findOwnedMail(mailId);
    const transactionId = buildMailClaimTransactionId(mailId);
    if (!mail || mail.deleted) {
      return { success: false, isDuplicate: false, code: 'not_found', transactionId };
    }
    if (mail.attachments.length === 0) {
      return { success: false, isDuplicate: false, code: 'no_attachment', transactionId };
    }
    if (mail.expiresAt > 0 && this._now() > mail.expiresAt) {
      return { success: false, isDuplicate: false, code: 'expired', transactionId };
    }

    if (mail.claimedAt > 0) {
      return { success: true, isDuplicate: true, code: 'duplicate', transactionId };
    }

    const config = this._configRepository.getConfig();
    const result = grantOperationsRewards(
      'mail',
      mail.mailId,
      transactionId,
      mail.attachments,
      String(config?.version ?? 0),
    );
    if (result.success) {
      mail.claimedAt = this._now();
      mail.claimTransactionId = transactionId;
      this._saveManager.markDirty();
      this._eventManager.emit(MailEvent.CLAIMED, { mailId, transactionId });
      this._eventManager.emit(MailEvent.UPDATED, { mailId, accountId: mail.accountId });
      console.log(`[MailService] 附件领取完成: mailId=${mailId}`);
    }
    return result;
  }

  private _seedInitialMail(): void {
    const config = this._configRepository.getConfig();
    if (!config) return;

    const now = this._now();
    for (const template of config.mail.initialTemplates) {
      const mailId = `${template.id}.${encodeURIComponent(this._accountId)}`;
      this.createMail({
        mailId,
        accountId: this._accountId,
        title: template.title,
        sender: template.sender,
        body: template.body,
        attachments: template.attachments,
        createdAt: now,
        expiresAt: now + template.expiresAfterDays * MILLISECONDS_PER_DAY,
      });
    }
  }

  private _trimMessages(): void {
    const config = this._configRepository.getConfig();
    const maxMessages = config?.mail.maxMessages ?? Number.MAX_SAFE_INTEGER;
    const data = this._requireData();
    const ordered = [...data.mailData.messages].sort((a, b) => b.createdAt - a.createdAt);
    const protectedMails = ordered.filter((mail) => mail.attachments.length > 0 && mail.claimedAt <= 0);
    const removableMails = ordered.filter((mail) => !protectedMails.includes(mail));
    const remainingCapacity = Math.max(0, maxMessages - protectedMails.length);
    data.mailData.messages = [...protectedMails, ...removableMails.slice(0, remainingCapacity)]
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private _findOwnedMail(mailId: string): MailMessageData | null {
    const data = this._requireData();
    return data.mailData.messages.find((mail) => (
      mail.mailId === mailId && mail.accountId === this._accountId
    )) ?? null;
  }

  private _requireData(): OperationsSaveData {
    if (!this._initialized && !this._data) {
      throw new Error('[MailService] 尚未初始化');
    }
    if (!this._data) throw new Error('[MailService] 存档数据不可用');
    return this._data;
  }
}

function cloneMail(mail: MailMessageData): MailMessageData {
  return {
    ...mail,
    attachments: mail.attachments.map((reward) => ({ ...reward })),
  };
}
