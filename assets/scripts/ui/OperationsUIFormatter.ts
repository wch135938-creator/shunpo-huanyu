// ============================================================
// OperationsUIFormatter.ts — 三套运营 UI 共用纯格式化函数
// ============================================================

import type { OperationsRewardConfig } from '../operations/OperationsTypes';

export function formatOperationsRewards(
  rewards: OperationsRewardConfig[],
  itemNames: Record<string, string>,
): string {
  return rewards
    .map((reward) => `${itemNames[reward.itemId] ?? reward.itemId} × ${reward.count}`)
    .join('\n');
}

export function formatOperationsText(
  template: string,
  values: Record<string, string | number>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}
