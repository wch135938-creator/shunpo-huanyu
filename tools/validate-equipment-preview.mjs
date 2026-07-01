import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediator = fs.readFileSync(
  path.join(root, 'assets/scripts/ui/EquipmentMediator.ts'),
  'utf8',
);

const loadIndex = mediator.indexOf('this._configReadyPromise = eqService.loadConfigs()');
const awaitIndex = mediator.indexOf('await this._configReadyPromise;');
const presenterIndex = mediator.indexOf('new EquipmentUIPresenter()');

assert.ok(loadIndex >= 0, 'EquipmentMediator 必须保存装备配置加载任务');
assert.ok(awaitIndex >= 0, 'EquipmentMediator.start 必须等待装备配置就绪');
assert.ok(presenterIndex >= 0, 'EquipmentMediator 缺少 Presenter 初始化');
assert.ok(awaitIndex < presenterIndex, '装备配置必须先于 Presenter 首屏渲染完成');

console.log('Equipment Preview readiness validation passed: 4 checks');
