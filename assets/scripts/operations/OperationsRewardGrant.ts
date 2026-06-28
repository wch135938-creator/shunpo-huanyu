// ============================================================
// OperationsRewardGrant.ts — 运营奖励无状态薄协调层
// 资产链路固定为 RewardSystem -> InventoryService -> SaveV2
// ============================================================

import { InventoryService } from '../inventory/InventoryService';
import { RewardSystem } from '../reward/RewardSystem';
import type { RewardEntry, RewardSourceType } from '../reward/RewardTypes';
import type { OperationsGrantResult, OperationsRewardConfig } from './OperationsTypes';

export function grantOperationsRewards(
  source: Extract<RewardSourceType, 'mail' | 'redeem' | 'login'>,
  sourceId: string,
  transactionId: string,
  rewards: OperationsRewardConfig[],
  configVersion: string,
): OperationsGrantResult {
  const inventory = InventoryService.getInstance();
  if (!inventory.isInitialized()) inventory.initialize();

  if (inventory.isTransactionClaimed(transactionId)) {
    return { success: true, isDuplicate: true, code: 'duplicate', transactionId };
  }

  if (!sourceId || !transactionId || !isValidRewardList(rewards)) {
    return { success: false, isDuplicate: false, code: 'invalid_config', transactionId };
  }

  const entries: RewardEntry[] = rewards.map((reward) => ({
    itemId: reward.itemId,
    itemType: reward.itemType,
    count: reward.count,
    source,
    sourceId,
  }));

  const rewardSystem = RewardSystem.getInstance();
  if (!rewardSystem.isInitialized()) rewardSystem.initialize();
  const aggregated = rewardSystem.buildReward(source, sourceId, entries);
  rewardSystem.grantRewardWithTransaction(
    aggregated,
    transactionId,
    undefined,
    undefined,
    undefined,
    configVersion,
  );

  const received = inventory.isTransactionClaimed(transactionId);
  return {
    success: received,
    isDuplicate: false,
    code: received ? 'success' : 'grant_failed',
    transactionId,
  };
}

export function buildMailClaimTransactionId(mailId: string): string {
  return `mail:${encodeURIComponent(mailId)}:claim`;
}

export function buildRedeemTransactionId(accountId: string, codeId: string): string {
  return `redeem:${encodeURIComponent(accountId)}:${encodeURIComponent(codeId)}`;
}

export function buildLoginTransactionId(accountId: string, dateKey: string): string {
  return `login:${encodeURIComponent(accountId)}:${dateKey}`;
}

function isValidRewardList(rewards: OperationsRewardConfig[]): boolean {
  return rewards.length > 0 && rewards.every((reward) => (
    !!reward.itemId && Number.isInteger(reward.count) && reward.count > 0
  ));
}
