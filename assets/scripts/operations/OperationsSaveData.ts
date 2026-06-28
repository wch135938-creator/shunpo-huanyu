// ============================================================
// OperationsSaveData.ts — 运营功能存档兼容补全
// 边界：只补齐可选字段，不修改资产、不触发存档版本迁移
// ============================================================

import type { SaveContainerV8 } from '../save/SaveContainerV8';
import {
  OPERATIONS_DATA_VERSION,
  createDefaultOperationsSaveData,
  type OperationsSaveData,
} from './OperationsTypes';

export function ensureOperationsSaveData(container: SaveContainerV8): OperationsSaveData {
  if (!container.operationsData) {
    container.operationsData = createDefaultOperationsSaveData();
    return container.operationsData;
  }

  const data = container.operationsData;
  data.dataVersion = data.dataVersion || OPERATIONS_DATA_VERSION;
  data.mailData = data.mailData ?? { messages: [] };
  data.mailData.messages = data.mailData.messages ?? [];
  data.redeemData = data.redeemData ?? { records: {} };
  data.redeemData.records = data.redeemData.records ?? {};
  data.loginData = data.loginData ?? {
    accounts: {},
  };
  data.loginData.accounts = data.loginData.accounts ?? {};
  return data;
}

export interface OperationsDataValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateOperationsSaveData(data: unknown): OperationsDataValidationResult {
  const issues: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, issues: ['operationsData 不是对象'] };
  }

  const candidate = data as Partial<OperationsSaveData>;
  if (typeof candidate.dataVersion !== 'number' || candidate.dataVersion < 1) {
    issues.push('operationsData.dataVersion 无效');
  }
  if (!Array.isArray(candidate.mailData?.messages)) {
    issues.push('operationsData.mailData.messages 不是数组');
  }
  if (!candidate.redeemData?.records || typeof candidate.redeemData.records !== 'object') {
    issues.push('operationsData.redeemData.records 不是对象');
  }
  if (!candidate.loginData?.accounts || typeof candidate.loginData.accounts !== 'object') {
    issues.push('operationsData.loginData.accounts 不是对象');
  } else {
    for (const [accountId, account] of Object.entries(candidate.loginData.accounts)) {
      if (!accountId || typeof account.totalClaimDays !== 'number' || account.totalClaimDays < 0) {
        issues.push(`operationsData.loginData.accounts.${accountId} 无效`);
      }
      if (!account.claimsByDate || typeof account.claimsByDate !== 'object') {
        issues.push(`operationsData.loginData.accounts.${accountId}.claimsByDate 不是对象`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}
