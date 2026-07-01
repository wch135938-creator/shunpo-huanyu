// ============================================================
// RedeemCodeService.ts — 兑换码校验与直接到账闭环
// V1 development_client 仅供开发；正式环境必须切换服务器/云函数校验
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import type { SaveContainerV8 } from '../save/SaveContainerV8';
import { InventoryService } from '../inventory/InventoryService';
import {
  normalizeRedeemCode,
  OperationsConfigRepository,
} from './OperationsConfigRepository';
import { ensureOperationsSaveData } from './OperationsSaveData';
import {
  buildRedeemTransactionId,
  grantOperationsRewards,
} from './OperationsRewardGrant';
import type {
  OperationsGrantResult,
  OperationsSaveData,
  RedeemRecordData,
} from './OperationsTypes';

export const RedeemCodeEvent = {
  REDEEMED: 'operations:codeRedeemed',
} as const;

export class RedeemCodeService extends BaseManager {
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
    if (!container) throw new Error('[RedeemCodeService] SaveManager 尚未初始化');

    this._data = ensureOperationsSaveData(container);
    this._accountId = resolvedAccountId;
    this._initialized = true;
    console.log('[RedeemCodeService] 初始化完成');
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  setNowProvider(provider: () => number): void {
    this._now = provider;
  }

  async redeem(input: string): Promise<OperationsGrantResult> {
    if (!this._initialized) await this.initialize();
    const config = this._configRepository.getConfig();
    if (!config) return this._failure('invalid_config');
    if (config.development.redeemValidationMode === 'server_required') {
      console.warn('[RedeemCodeService] 正式兑换码必须由服务器或微信云函数校验');
      return this._failure('server_required');
    }

    const normalizedCode = normalizeRedeemCode(input);
    const codeConfig = this._configRepository.findRedeemCode(normalizedCode);
    if (!codeConfig) {
      console.warn('[RedeemCodeService] 兑换码校验未通过');
      return this._failure('invalid_code');
    }

    const transactionId = buildRedeemTransactionId(this._accountId, codeConfig.id);
    const now = this._now();
    if (!codeConfig.enabled || now < codeConfig.startsAt || now > codeConfig.endsAt) {
      return { success: false, isDuplicate: false, code: 'not_active', transactionId };
    }

    const data = this._requireData();
    const recordKey = buildRedeemRecordKey(this._accountId, codeConfig.id);
    const existing = data.redeemData.records[recordKey];
    const inventory = InventoryService.getInstance();
    if (!inventory.isInitialized()) inventory.initialize();
    if (existing && inventory.isTransactionClaimed(transactionId)) {
      return { success: true, isDuplicate: true, code: 'duplicate', transactionId };
    }

    const result = grantOperationsRewards(
      'redeem',
      codeConfig.id,
      transactionId,
      codeConfig.rewards,
      String(config.version),
    );
    if (!result.success) return result;

    const record: RedeemRecordData = {
      accountId: this._accountId,
      codeId: codeConfig.id,
      redeemedAt: now,
      transactionId,
      // 保留旧存档字段兼容，但兑换成功不再创建邮箱回执。
      receiptMailId: '',
    };
    data.redeemData.records[recordKey] = record;

    this._saveManager.markDirty();
    this._eventManager.emit(RedeemCodeEvent.REDEEMED, {
      codeId: codeConfig.id,
      accountId: this._accountId,
      transactionId,
    });
    console.log(`[RedeemCodeService] 兑换完成: codeId=${codeConfig.id}`);
    return result;
  }

  getRedeemRecord(codeId: string): RedeemRecordData | null {
    const record = this._requireData().redeemData.records[
      buildRedeemRecordKey(this._accountId, codeId)
    ];
    return record ? { ...record } : null;
  }

  private _failure(code: OperationsGrantResult['code']): OperationsGrantResult {
    return { success: false, isDuplicate: false, code, transactionId: '' };
  }

  private _requireData(): OperationsSaveData {
    if (!this._data) throw new Error('[RedeemCodeService] 尚未初始化');
    return this._data;
  }
}

function buildRedeemRecordKey(accountId: string, codeId: string): string {
  return `${encodeURIComponent(accountId)}:${encodeURIComponent(codeId)}`;
}
