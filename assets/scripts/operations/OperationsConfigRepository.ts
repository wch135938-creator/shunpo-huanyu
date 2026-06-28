// ============================================================
// OperationsConfigRepository.ts — 邮箱 / 兑换码 / 登录奖励配置入口
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { ConfigManager } from '../core/ConfigManager';
import type {
  OperationsConfig,
  OperationsRewardConfig,
  RedeemCodeConfig,
} from './OperationsTypes';

export class OperationsConfigRepository extends BaseManager {
  private _configManager = ConfigManager.getInstance();
  private _config: OperationsConfig | null = null;
  private _loading: Promise<OperationsConfig> | null = null;

  load(): Promise<OperationsConfig> {
    if (this._config) return Promise.resolve(this._config);
    if (this._loading) return this._loading;

    this._loading = this._configManager
      .loadConfig<OperationsConfig>(ConfigManager.OPERATIONS_CONFIG)
      .then((config) => {
        this._validate(config);
        this._config = config;
        this._loading = null;
        return config;
      })
      .catch((error) => {
        this._loading = null;
        throw error;
      });
    return this._loading;
  }

  getConfig(): OperationsConfig | null {
    return this._config;
  }

  findRedeemCode(normalizedCode: string): RedeemCodeConfig | null {
    const codes = this._config?.redeem.codes ?? [];
    return codes.find((entry) => normalizeRedeemCode(entry.code) === normalizedCode) ?? null;
  }

  private _validate(config: OperationsConfig): void {
    if (!config || config.version < 1) {
      throw new Error('[OperationsConfig] 配置版本无效');
    }
    if (!config.development?.accountId) {
      throw new Error('[OperationsConfig] development.accountId 不能为空');
    }
    if (config.mail.maxMessages < 1) {
      throw new Error('[OperationsConfig] mail.maxMessages 必须大于 0');
    }

    const codeIds = new Set<string>();
    const normalizedCodes = new Set<string>();
    for (const code of config.redeem.codes) {
      const normalized = normalizeRedeemCode(code.code);
      if (!code.id || !normalized || codeIds.has(code.id) || normalizedCodes.has(normalized)) {
        throw new Error(`[OperationsConfig] 兑换码配置重复或为空: ${code.id}`);
      }
      codeIds.add(code.id);
      normalizedCodes.add(normalized);
      this._validateRewards(code.rewards, `redeem.${code.id}`);
    }

    if (!config.login.liveOpsEventId || config.login.rewards.length !== 7) {
      throw new Error('[OperationsConfig] 登录奖励必须绑定活动且配置 7 天奖励');
    }
    const loginDays = new Set<number>();
    for (const day of config.login.rewards) {
      if (day.day < 1 || day.day > 7 || loginDays.has(day.day)) {
        throw new Error(`[OperationsConfig] 登录奖励天数无效: ${day.day}`);
      }
      loginDays.add(day.day);
      this._validateRewards(day.rewards, `login.${day.day}`);
    }

    const templateIds = new Set<string>();
    for (const template of config.mail.initialTemplates) {
      if (!template.id || templateIds.has(template.id) || template.expiresAfterDays < 1) {
        throw new Error(`[OperationsConfig] 初始邮件配置无效: ${template.id}`);
      }
      templateIds.add(template.id);
      this._validateRewards(template.attachments, `mail.${template.id}`);
    }
  }

  private _validateRewards(rewards: OperationsRewardConfig[], path: string): void {
    if (!Array.isArray(rewards) || rewards.length === 0) {
      throw new Error(`[OperationsConfig] 奖励不能为空: ${path}`);
    }
    for (const reward of rewards) {
      if (!reward.itemId || !Number.isInteger(reward.count) || reward.count <= 0) {
        throw new Error(`[OperationsConfig] 奖励条目无效: ${path}`);
      }
    }
  }
}

export function normalizeRedeemCode(input: string): string {
  return input.trim().toUpperCase();
}
