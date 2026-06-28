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
    claimsByAccountDate: {},
    totalClaimDays: 0,
    lastClaimDate: '',
  };
  data.loginData.claimsByAccountDate = data.loginData.claimsByAccountDate ?? {};
  data.loginData.totalClaimDays = data.loginData.totalClaimDays ?? 0;
  data.loginData.lastClaimDate = data.loginData.lastClaimDate ?? '';
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
  if (
    !candidate.loginData?.claimsByAccountDate
    || typeof candidate.loginData.claimsByAccountDate !== 'object'
  ) {
    issues.push('operationsData.loginData.claimsByAccountDate 不是对象');
  }
  if (
    typeof candidate.loginData?.totalClaimDays !== 'number'
    || candidate.loginData.totalClaimDays < 0
  ) {
    issues.push('operationsData.loginData.totalClaimDays 无效');
  }
  return { valid: issues.length === 0, issues };
}
