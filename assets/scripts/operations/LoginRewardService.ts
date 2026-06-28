// ============================================================
// LoginRewardService.ts — 每日登录状态与手动领取闭环
// 规则：仅复用 LiveOpsManager / LIVEOPS_004，不创建第二套活动调度
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import type { SaveContainerV8 } from '../save/SaveContainerV8';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import type { LiveOpsManager } from '../systems/LiveOpsManager';
import { OperationsConfigRepository } from './OperationsConfigRepository';
import { ensureOperationsSaveData } from './OperationsSaveData';
import {
  buildLoginTransactionId,
  grantOperationsRewards,
} from './OperationsRewardGrant';
import type {
  LoginClaimRecordData,
  LoginRewardStatus,
  OperationsGrantResult,
  OperationsSaveData,
} from './OperationsTypes';

export const LoginRewardEvent = {
  CLAIMED: 'operations:loginRewardClaimed',
} as const;

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export class LoginRewardService extends BaseManager {
  private _saveManager = SaveManager.getInstance();
  private _configRepository = OperationsConfigRepository.getInstance();
  private _eventManager = EventManager.getInstance();
  private _data: OperationsSaveData | null = null;
  private _liveOpsManager: LiveOpsManager | null = null;
  private _accountId = '';
  private _initialized = false;
  private _now: () => number = () => Date.now();

  async initialize(accountId?: string): Promise<void> {
    const config = await this._configRepository.load();
    const resolvedAccountId = accountId || config.development.accountId;
    if (this._initialized && this._accountId === resolvedAccountId) return;

    const container = this._saveManager.getData() as SaveContainerV8 | null;
    if (!container) throw new Error('[LoginRewardService] SaveManager 尚未初始化');
    this._data = ensureOperationsSaveData(container);
    this._accountId = resolvedAccountId;

    const phase8 = Phase8Bootstrap.getInstance();
    if (!phase8.isReady()) await phase8.initialize();
    this._liveOpsManager = phase8.getLiveOpsManager();
    this._liveOpsManager.refreshEvents();
    this._initialized = true;
    console.log('[LoginRewardService] 初始化完成');
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  setNowProvider(provider: () => number): void {
    this._now = provider;
  }

  getTodayStatus(): LoginRewardStatus {
    const data = this._requireData();
    const config = this._requireConfig();
    this._liveOpsManager?.refreshEvents();

    const dateKey = buildDateKey(this._now(), config.login.timezoneOffsetMinutes);
    const rewardDay = (data.loginData.totalClaimDays % config.login.rewards.length) + 1;
    const rewardConfig = config.login.rewards.find((entry) => entry.day === rewardDay);
    return {
      active: this._liveOpsManager?.isEventActive(config.login.liveOpsEventId) ?? false,
      claimed: !!data.loginData.claimsByAccountDate[
        buildLoginClaimKey(this._accountId, dateKey)
      ],
      dateKey,
      rewardDay,
      rewards: rewardConfig?.rewards.map((reward) => ({ ...reward })) ?? [],
    };
  }

  claimToday(): OperationsGrantResult {
    const data = this._requireData();
    const config = this._requireConfig();
    const status = this.getTodayStatus();
    const transactionId = buildLoginTransactionId(this._accountId, status.dateKey);

    if (!status.active) {
      return { success: false, isDuplicate: false, code: 'not_active', transactionId };
    }
    if (status.claimed) {
      return { success: true, isDuplicate: true, code: 'duplicate', transactionId };
    }

    const result = grantOperationsRewards(
      'login',
      status.dateKey,
      transactionId,
      status.rewards,
      String(config.version),
    );
    if (!result.success) return result;

    const record: LoginClaimRecordData = {
      accountId: this._accountId,
      dateKey: status.dateKey,
      rewardDay: status.rewardDay,
      claimedAt: this._now(),
      transactionId,
    };
    data.loginData.claimsByAccountDate[
      buildLoginClaimKey(this._accountId, status.dateKey)
    ] = record;
    data.loginData.totalClaimDays += 1;
    data.loginData.lastClaimDate = status.dateKey;
    this._saveManager.markDirty();
    this._eventManager.emit(LoginRewardEvent.CLAIMED, record);
    console.log(`[LoginRewardService] 登录奖励领取完成: date=${status.dateKey}`);
    return result;
  }

  getClaimRecord(dateKey: string): LoginClaimRecordData | null {
    const record = this._requireData().loginData.claimsByAccountDate[
      buildLoginClaimKey(this._accountId, dateKey)
    ];
    return record ? { ...record } : null;
  }

  private _requireData(): OperationsSaveData {
    if (!this._data) throw new Error('[LoginRewardService] 尚未初始化');
    return this._data;
  }

  private _requireConfig() {
    const config = this._configRepository.getConfig();
    if (!config) throw new Error('[LoginRewardService] 配置尚未加载');
    return config;
  }
}

export function buildDateKey(timestamp: number, timezoneOffsetMinutes: number): string {
  const shifted = new Date(timestamp + timezoneOffsetMinutes * MILLISECONDS_PER_MINUTE);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildLoginClaimKey(accountId: string, dateKey: string): string {
  return `${encodeURIComponent(accountId)}:${dateKey}`;
}
