import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediator = fs.readFileSync(
  path.join(root, 'assets/scripts/ui/EquipmentMediator.ts'),
  'utf8',
);
const inventoryService = fs.readFileSync(
  path.join(root, 'assets/scripts/inventory/InventoryService.ts'),
  'utf8',
);
const slotItem = fs.readFileSync(
  path.join(root, 'assets/scripts/ui/EquipmentSlotItem.ts'),
  'utf8',
);

const loadIndex = mediator.indexOf('this._configReadyPromise = eqService.loadConfigs()');
const awaitIndex = mediator.indexOf('await this._configReadyPromise;');
const presenterIndex = mediator.indexOf('new EquipmentUIPresenter()');

assert.ok(loadIndex >= 0, 'EquipmentMediator 必须保存装备配置加载任务');
assert.ok(awaitIndex >= 0, 'EquipmentMediator.start 必须等待装备配置就绪');
assert.ok(presenterIndex >= 0, 'EquipmentMediator 缺少 Presenter 初始化');
assert.ok(awaitIndex < presenterIndex, '装备配置必须先于 Presenter 首屏渲染完成');
assert.ok(
  inventoryService.includes('txn_initial_equipment_weapon_repair_v1'),
  '旧异常存档补偿必须使用独立幂等事务',
);
assert.ok(
  inventoryService.includes("transaction.changeType === 'consume'"),
  '青锋剑补偿必须排除主动分解、出售或消耗记录',
);
assert.ok(
  inventoryService.includes('if (!hasArmor || !hasAccessory) return;'),
  '青锋剑补偿必须要求布衣和铜戒仍存在',
);
assert.ok(
  inventoryService.includes('claimStates[LEGACY_QINGFENG_REPAIR_TRANSACTION_ID]?.claimed'),
  '青锋剑补偿必须检查明确的一次性补偿标记',
);
assert.ok(
  inventoryService.includes('item.itemId === INITIAL_EQUIPMENT_ARMOR_ITEM_ID')
    && inventoryService.includes('item.itemId === INITIAL_EQUIPMENT_ACCESSORY_ITEM_ID'),
  '旧异常候选必须精确匹配布衣和铜戒',
);
assert.ok(
  slotItem.includes('this.statsLabel.node.active = false;'),
  '主面板槽位属性摘要必须隐藏',
);

console.log('Equipment Preview readiness validation passed: 10 checks');
