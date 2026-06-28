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
    claimsByDate: {},
    totalClaimDays: 0,
    lastClaimDate: '',
  };
  data.loginData.claimsByDate = data.loginData.claimsByDate ?? {};
  data.loginData.totalClaimDays = data.loginData.totalClaimDays ?? 0;
  data.loginData.lastClaimDate = data.loginData.lastClaimDate ?? '';
  return data;
}
