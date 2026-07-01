import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
let checks = 0;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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

function compressUuid(uuid) {
  const hex = uuid.replaceAll('-', '');
  const prefix = hex.slice(0, 5);
  const bits = [...hex.slice(5)]
    .map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, '0'))
    .join('');
  let encoded = '';
  for (let offset = 0; offset < bits.length; offset += 6) {
    encoded += BASE64[Number.parseInt(bits.slice(offset, offset + 6), 2)];
  }
  return prefix + encoded;
}

const config = readJson('assets/resources/config/systems/operations_config.json');
const liveOps = readJson('assets/resources/config/systems/liveops_config.json');
const phase10Scene = readJson('assets/scenes/Phase10Main.scene');

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
check(!redeemService.includes("from './MailService'"), '兑换服务不得依赖邮箱服务');
check(!redeemService.includes('.createMail('), '兑换成功不得创建邮箱回执');
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

const sceneIds = phase10Scene.filter((entry) => entry?._id).map((entry) => entry._id);
check(sceneIds.length === new Set(sceneIds).size, 'Phase10Main.scene 存在重复 _id');
for (let index = 0; index < phase10Scene.length; index += 1) {
  const serialized = JSON.stringify(phase10Scene[index]);
  for (const match of serialized.matchAll(/"__id__":(\d+)/g)) {
    const target = Number(match[1]);
    check(target >= 0 && target < phase10Scene.length, `场景引用越界: ${index} -> ${target}`);
  }
}

const sceneNodeIndex = (name) => phase10Scene.findIndex((entry) => (
  entry?.__type__ === 'cc.Node' && entry._name === name
));
const uiRootIndex = sceneNodeIndex('UIRoot');
const operationsMenuIndex = sceneNodeIndex('OperationsMenu');
const mailPanelIndex = sceneNodeIndex('MailPanel');
const redeemPanelIndex = sceneNodeIndex('RedeemCodePanel');
const loginPanelIndex = sceneNodeIndex('LoginRewardPopup');
for (const [name, index] of Object.entries({
  UIRoot: uiRootIndex,
  OperationsMenu: operationsMenuIndex,
  MailPanel: mailPanelIndex,
  RedeemCodePanel: redeemPanelIndex,
  LoginRewardPopup: loginPanelIndex,
})) {
  check(index >= 0, `Phase10Main.scene 缺少 ${name}`);
}
check(phase10Scene[operationsMenuIndex]._active === true, '运营入口菜单必须首帧可见');
check(phase10Scene[mailPanelIndex]._active === false, '邮箱面板必须默认隐藏');
check(phase10Scene[redeemPanelIndex]._active === false, '兑换码面板必须默认隐藏');
check(phase10Scene[loginPanelIndex]._active === false, '登录奖励弹窗必须默认隐藏');

for (const index of [mailPanelIndex, redeemPanelIndex, loginPanelIndex]) {
  const transformRef = phase10Scene[index]._components.find((entry) => (
    phase10Scene[entry.__id__].__type__ === 'cc.UITransform'
  ));
  check(!!transformRef, `${phase10Scene[index]._name} 缺少 UITransform`);
  const size = phase10Scene[transformRef.__id__]._contentSize;
  check(size.width === 720 && size.height === 1280, `${phase10Scene[index]._name} 未覆盖全屏`);
}

const uiRootChildren = new Set(phase10Scene[uiRootIndex]._children.map((entry) => entry.__id__));
for (const index of [operationsMenuIndex, mailPanelIndex, redeemPanelIndex, loginPanelIndex]) {
  check(uiRootChildren.has(index), `运营 UI 节点 ${index} 未挂到 UIRoot`);
  check(phase10Scene[index]._parent.__id__ === uiRootIndex, `运营 UI 节点 ${index} 父节点错误`);
}

const scriptType = (relativeMetaPath) => compressUuid(readJson(relativeMetaPath).uuid);
const expectedPanelTypes = new Map([
  [mailPanelIndex, scriptType('assets/scripts/ui/MailPanel.ts.meta')],
  [redeemPanelIndex, scriptType('assets/scripts/ui/RedeemCodePanel.ts.meta')],
  [loginPanelIndex, scriptType('assets/scripts/ui/LoginRewardPopup.ts.meta')],
  [operationsMenuIndex, scriptType('assets/scripts/ui/OperationsUIManager.ts.meta')],
]);
for (const [nodeIndex, type] of expectedPanelTypes) {
  check(
    phase10Scene[nodeIndex]._components.some((entry) => phase10Scene[entry.__id__].__type__ === type),
    `节点 ${phase10Scene[nodeIndex]._name} 缺少正确脚本组件`,
  );
}

for (const menuChildRef of phase10Scene[operationsMenuIndex]._children) {
  const buttonNode = phase10Scene[menuChildRef.__id__];
  const transformRef = buttonNode._components.find((entry) => (
    phase10Scene[entry.__id__].__type__ === 'cc.UITransform'
  ));
  check(!!transformRef, `${buttonNode._name} 缺少 UITransform`);
  check(phase10Scene[transformRef.__id__]._contentSize.height >= 80, `${buttonNode._name} 高度小于 80`);
}

const rewardPopupIndex = sceneNodeIndex('rewardPopupRoot');
check(rewardPopupIndex >= 0, '兑换成功奖励弹窗未挂载');
check(phase10Scene[rewardPopupIndex]._parent.__id__ === redeemPanelIndex, '奖励弹窗父节点错误');
check(phase10Scene[rewardPopupIndex]._active === false, '奖励弹窗必须默认隐藏');

const codeInputIndex = sceneNodeIndex('codeInput');
for (const childRef of phase10Scene[codeInputIndex]._children) {
  const child = phase10Scene[childRef.__id__];
  const transformRef = child._components.find((entry) => (
    phase10Scene[entry.__id__].__type__ === 'cc.UITransform'
  ));
  const labelRef = child._components.find((entry) => (
    phase10Scene[entry.__id__].__type__ === 'cc.Label'
  ));
  check(phase10Scene[transformRef.__id__]._anchorPoint.x === 0, `${child._name} 水平锚点错误`);
  check(phase10Scene[transformRef.__id__]._anchorPoint.y === 1, `${child._name} 垂直锚点错误`);
  check(phase10Scene[labelRef.__id__]._horizontalAlign === 0, `${child._name} 必须左对齐`);
}

console.log(`Operations static validation passed: ${checks} checks`);
