// ============================================================
// OperationsTypes.ts — 邮箱 / 兑换码 / 登录奖励共享类型
// 职责：仅定义配置、存档和结果数据，不包含业务逻辑
// ============================================================

import type { ItemType } from '../config/drop_config';

export const OPERATIONS_DATA_VERSION = 1;

export interface OperationsRewardConfig {
  itemId: string;
  itemType: ItemType;
  count: number;
}

export interface MailMessageData {
  mailId: string;
  accountId: string;
  title: string;
  sender: string;
  body: string;
  attachments: OperationsRewardConfig[];
  createdAt: number;
  expiresAt: number;
  readAt: number;
  claimedAt: number;
  claimTransactionId: string;
  deleted: boolean;
}

export interface MailData {
  messages: MailMessageData[];
}

export interface MailCreateRequest {
  mailId: string;
  accountId: string;
  title: string;
  sender: string;
  body: string;
  attachments: OperationsRewardConfig[];
  createdAt: number;
  expiresAt: number;
}

export interface RedeemRecordData {
  accountId: string;
  codeId: string;
  redeemedAt: number;
  transactionId: string;
  receiptMailId: string;
}

export interface RedeemData {
  records: Record<string, RedeemRecordData>;
}

export interface LoginClaimRecordData {
  accountId: string;
  dateKey: string;
  rewardDay: number;
  claimedAt: number;
  transactionId: string;
}

export interface LoginData {
  claimsByDate: Record<string, LoginClaimRecordData>;
  totalClaimDays: number;
  lastClaimDate: string;
}

export interface LoginRewardStatus {
  active: boolean;
  claimed: boolean;
  dateKey: string;
  rewardDay: number;
  rewards: OperationsRewardConfig[];
}

export interface OperationsSaveData {
  dataVersion: number;
  mailData: MailData;
  redeemData: RedeemData;
  loginData: LoginData;
}

export interface InitialMailTemplateConfig {
  id: string;
  title: string;
  sender: string;
  body: string;
  expiresAfterDays: number;
  attachments: OperationsRewardConfig[];
}

export interface RedeemCodeConfig {
  id: string;
  /** 仅 development_client 模式允许存在客户端明文码。 */
  code: string;
  enabled: boolean;
  startsAt: number;
  endsAt: number;
  rewards: OperationsRewardConfig[];
  receiptTitle: string;
  receiptSender: string;
  receiptBody: string;
}

export interface LoginRewardDayConfig {
  day: number;
  rewards: OperationsRewardConfig[];
}

export interface OperationsUITextConfig {
  mailTitle: string;
  mailEmpty: string;
  mailClaim: string;
  mailClaimSuccess: string;
  mailClaimed: string;
  mailExpired: string;
  mailSenderFormat: string;
  mailPageFormat: string;
  mailNoAttachment: string;
  redeemTitle: string;
  redeemPlaceholder: string;
  redeemSubmit: string;
  redeemSuccess: string;
  redeemDuplicate: string;
  redeemInvalid: string;
  redeemInactive: string;
  redeemServerRequired: string;
  loginTitle: string;
  loginClaim: string;
  loginClaimed: string;
  loginDayFormat: string;
  loginInactive: string;
  actionFailed: string;
  close: string;
  itemNames: Record<string, string>;
}

export interface OperationsConfig {
  version: number;
  name: string;
  development: {
    accountId: string;
    redeemValidationMode: 'development_client' | 'server_required';
  };
  mail: {
    maxMessages: number;
    initialTemplates: InitialMailTemplateConfig[];
  };
  redeem: {
    codes: RedeemCodeConfig[];
  };
  login: {
    liveOpsEventId: string;
    timezoneOffsetMinutes: number;
    rewards: LoginRewardDayConfig[];
  };
  ui: OperationsUITextConfig;
}

export type OperationsResultCode =
  | 'success'
  | 'duplicate'
  | 'not_found'
  | 'expired'
  | 'no_attachment'
  | 'not_active'
  | 'invalid_code'
  | 'server_required'
  | 'invalid_config'
  | 'grant_failed';

export interface OperationsGrantResult {
  success: boolean;
  isDuplicate: boolean;
  code: OperationsResultCode;
  transactionId: string;
}

export function createDefaultOperationsSaveData(): OperationsSaveData {
  return {
    dataVersion: OPERATIONS_DATA_VERSION,
    mailData: { messages: [] },
    redeemData: { records: {} },
    loginData: {
      claimsByDate: {},
      totalClaimDays: 0,
      lastClaimDate: '',
    },
  };
}
