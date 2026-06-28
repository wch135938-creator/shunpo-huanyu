import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function validateRewards(rewards, pathLabel) {
  check(Array.isArray(rewards) && rewards.length > 0, `${pathLabel} 奖励不能为空`);
  for (const reward of rewards) {
    check(typeof reward.itemId === 'string' && reward.itemId.length > 0, `${pathLabel} itemId 无效`);
    check(Number.isInteger(reward.count) && reward.count > 0, `${pathLabel} count 无效`);
  }
}

const config = readJson('assets/resources/config/systems/operations_config.json');
const liveOps = readJson('assets/resources/config/systems/liveops_config.json');

check(config.version >= 1, 'operations 配置版本无效');
check(config.development.accountId.length > 0, '开发账号不能为空');
check(
  ['development_client', 'server_required'].includes(config.development.redeemValidationMode),
  '兑换码校验模式无效',
);
if (config.development.redeemValidationMode !== 'development_client') {
  check(config.redeem.codes.every((entry) => !entry.code), '正式模式不得保留客户端明文兑换码');
}

const normalizedCodes = new Set();
const codeIds = new Set();
for (const entry of config.redeem.codes) {
  const normalized = entry.code.trim().toUpperCase();
  check(!normalizedCodes.has(normalized), `兑换码重复: ${entry.id}`);
  check(!codeIds.has(entry.id), `兑换码 ID 重复: ${entry.id}`);
  normalizedCodes.add(normalized);
  codeIds.add(entry.id);
  validateRewards(entry.rewards, `redeem.${entry.id}`);
}

check(config.login.rewards.length === 7, '登录奖励必须为 7 天循环');
check(
  config.login.rewards.every((entry, index) => entry.day === index + 1),
  '登录奖励天数必须连续且从 1 开始',
);
for (const entry of config.login.rewards) validateRewards(entry.rewards, `login.${entry.day}`);

const loginLiveOps = liveOps.data.find((entry) => entry.id === config.login.liveOpsEventId);
check(!!loginLiveOps, '登录奖励绑定的 LiveOps 活动不存在');
check(loginLiveOps.tags.includes('login'), '登录奖励 LiveOps 活动缺少 login 标签');

for (const template of config.mail.initialTemplates) {
  validateRewards(template.attachments, `mail.${template.id}`);
}

const rewardTypes = read('assets/scripts/reward/RewardTypes.ts');
for (const source of ['mail', 'redeem', 'login']) {
  check(rewardTypes.includes(`| '${source}'`), `RewardSourceType 缺少 ${source}`);
}

const saveContainer = read('assets/scripts/save/SaveContainerV8.ts');
check(saveContainer.includes('operationsData?: OperationsSaveData'), 'SaveV2 缺少可选 operationsData');

const inventoryService = read('assets/scripts/inventory/InventoryService.ts');
for (const source of ['mail', 'redeem', 'login']) {
  check(inventoryService.includes(`${source}:`), `Inventory 来源映射缺少 ${source}`);
}

const mailService = read('assets/scripts/operations/MailService.ts');
const createMailBody = mailService.slice(
  mailService.indexOf('createMail('),
  mailService.indexOf('getMessages('),
);
check(!createMailBody.includes('grantOperationsRewards'), '创建邮件时不得发奖');
check(mailService.includes('buildMailClaimTransactionId'), '邮件领取缺少稳定事务 ID');
check(mailService.includes('inventory.isTransactionClaimed(transactionId)'), '邮件幂等必须核对资产真相源');

const redeemService = read('assets/scripts/operations/RedeemCodeService.ts');
check(redeemService.includes('attachments: []'), '兑换回执必须无附件');
check(!redeemService.includes('console.log(input'), '日志不得输出完整兑换码');
check(!redeemService.includes('console.warn(input'), '警告日志不得输出完整兑换码');
check(redeemService.includes('inventory.isTransactionClaimed(transactionId)'), '兑换幂等必须核对资产真相源');

const loginService = read('assets/scripts/operations/LoginRewardService.ts');
check(loginService.includes('Phase8Bootstrap.getInstance()'), '登录奖励必须复用既有 LiveOpsManager');
check(!loginService.includes('new LiveOpsManager'), '禁止创建第二套 LiveOpsManager');
check(loginService.includes('inventory.isTransactionClaimed(transactionId)'), '登录幂等必须核对资产真相源');

for (const relativePath of [
  'assets/scripts/operations/MailService.ts',
  'assets/scripts/operations/RedeemCodeService.ts',
  'assets/scripts/operations/LoginRewardService.ts',
]) {
  const source = read(relativePath);
  check(!source.includes('.inventoryData'), `${relativePath} 不得直接修改资产存档`);
  check(!source.includes('.addAssets('), `${relativePath} 不得绕过 RewardSystem 直接发资产`);
}

console.log(`Operations static validation passed: ${checks} checks`);
