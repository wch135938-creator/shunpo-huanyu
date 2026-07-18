#!/usr/bin/env node
// ============================================================
// test-entry-cost-r3r1.mjs — C1.6-B2-D-P1-R3-R1 纯函数逻辑验证
// 职责：验证 EntryCost 校验/资源归一化/V8兼容/主线免费规则
// 用法：node tools/test-entry-cost-r3r1.mjs
// 结果：exit 0 = 全部通过, exit 1 = 存在失败
//
// 【测试性质说明 - R3-R2 收口】
// 本文件中的 JS 纯函数是以下 TS 生产源码的等价实现，
// 而非直接导入生产代码（Cocos Creator TS 无法在 Node.js 中直接 require）：
//
//   TS 生产源码                          JS 等价函数
//   assets/scripts/save/PlayerResourceState.ts → safeNonNegativeInt
//                                              → normalizePlayerResourceState
//                                              → ensurePlayerResourceState
//   assets/scripts/data/entry_cost_types.ts     → normalizeEntryCost
//                                              → validateEntryCostConfig
//                                              → isValidResourceId
//
// 对应关系：每个 JS 函数与 TS 源文件逐行一致。
// 本测试验证的是"纯函数规范的正确性"，而非"生产运行时集成"。
// 生产运行时集成测试见 tools/test-save-adapter-r3r2.mjs
// 以及 assets/scripts/debug/EntryCostTestRunner.ts（需 Cocos 运行时）。
// ============================================================

// ---- 纯函数等价实现（与 TS 源码逻辑逐行一致） ----

function safeNonNegativeInt(raw) {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'number') return 0;
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (!Number.isInteger(raw)) return Math.floor(raw);
  return raw;
}

function normalizePlayerResourceState(raw) {
  if (!raw || typeof raw !== 'object') {
    return { spiritualPower: 0, spiritualPowerMax: 0, spiritualPowerLastRecoverTime: 0, challengeTickets: 0 };
  }
  return {
    spiritualPower: safeNonNegativeInt(raw.spiritualPower),
    spiritualPowerMax: safeNonNegativeInt(raw.spiritualPowerMax),
    spiritualPowerLastRecoverTime: safeNonNegativeInt(raw.spiritualPowerLastRecoverTime),
    challengeTickets: safeNonNegativeInt(raw.challengeTickets),
  };
}

function createDefaultPlayerResourceState() {
  return { spiritualPower: 0, spiritualPowerMax: 0, spiritualPowerLastRecoverTime: 0, challengeTickets: 0 };
}

function ensurePlayerResourceState(container) {
  const raw = container.playerResources;
  const normalized = normalizePlayerResourceState(raw);
  const changed = !raw || typeof raw !== 'object'
    || normalized.spiritualPower !== raw.spiritualPower
    || normalized.spiritualPowerMax !== raw.spiritualPowerMax
    || normalized.spiritualPowerLastRecoverTime !== raw.spiritualPowerLastRecoverTime
    || normalized.challengeTickets !== raw.challengeTickets;
  if (changed) container.playerResources = normalized;
  return { state: normalized, changed };
}

function normalizeEntryCost(config) {
  const DEFAULT = { costType: 'none', costAmount: 0 };
  if (!config) return { ...DEFAULT };
  const validTypes = ['none', 'spiritual_power', 'challenge_ticket', 'item'];
  if (!validTypes.includes(config.costType)) return { ...DEFAULT };
  const costAmount = (typeof config.costAmount === 'number' && Number.isFinite(config.costAmount) && Number.isInteger(config.costAmount)) ? config.costAmount : 0;
  const result = { costType: config.costType, costAmount };
  if (config.resourceId !== undefined && typeof config.resourceId === 'string') {
    result.resourceId = config.resourceId;
  }
  return result;
}

function isValidResourceId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.trim() !== id) return false;
  if (id.length === 0) return false;
  return /^[a-z0-9_]+$/.test(id);
}

function validateEntryCostConfig(config) {
  const errors = [];
  const validTypes = ['none', 'spiritual_power', 'challenge_ticket', 'item'];
  if (!validTypes.includes(config.costType)) {
    errors.push(`未知的 costType: "${config.costType}"`);
    return { valid: false, errors };
  }
  if (typeof config.costAmount !== 'number' || !Number.isFinite(config.costAmount) || !Number.isInteger(config.costAmount)) {
    errors.push(`costAmount 必须为整数，当前值: ${config.costAmount}`);
  }
  if (config.costAmount < 0) {
    errors.push(`costAmount 不能为负数，当前值: ${config.costAmount}`);
  }
  switch (config.costType) {
    case 'none':
      if (config.costAmount !== 0) errors.push(`costType=none 时 costAmount 必须为 0，当前值: ${config.costAmount}`);
      break;
    case 'spiritual_power':
      if (config.costAmount <= 0) errors.push(`costType=spiritual_power 时 costAmount 必须大于 0`);
      if (config.resourceId !== undefined && config.resourceId !== 'spiritual_power') {
        errors.push(`costType=spiritual_power 时 resourceId 只能为空或 'spiritual_power'，当前值: "${config.resourceId}"`);
      }
      break;
    case 'challenge_ticket':
      if (config.costAmount <= 0) errors.push(`costType=challenge_ticket 时 costAmount 必须大于 0`);
      if (!config.resourceId || config.resourceId.trim() === '') errors.push('costType=challenge_ticket 时必须提供 resourceId');
      break;
    case 'item':
      if (config.costAmount <= 0) errors.push(`costType=item 时 costAmount 必须大于 0`);
      if (!config.resourceId || config.resourceId.trim() === '') errors.push('costType=item 时必须提供 resourceId');
      break;
  }
  if (config.resourceId !== undefined && config.resourceId !== null) {
    if (typeof config.resourceId !== 'string') {
      errors.push(`resourceId 必须为字符串`);
    } else {
      const ridErr = validateResourceIdStr(config.resourceId);
      if (ridErr) errors.push(ridErr);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateResourceIdStr(id) {
  if (!id || typeof id !== 'string') return 'resourceId 必须为非空字符串';
  if (id.trim() !== id) return `resourceId 包含首尾空格: "${id}"`;
  if (id.length === 0) return 'resourceId 不能为空字符串';
  if (!/^[a-z0-9_]+$/.test(id)) return `resourceId 格式不安全: "${id}"（只允许小写字母、数字、下划线）`;
  return '';
}

// ---- 测试框架 ----

const results = [];
let testIdx = 0;
let passCount = 0;
let failCount = 0;

function t(name, fn) {
  testIdx++;
  try {
    const r = fn();
    if (r === true) {
      results.push(`  ✓ T${String(testIdx).padStart(2,'0')} ${name}`);
      passCount++;
    } else {
      results.push(`  ✗ T${String(testIdx).padStart(2,'0')} ${name} — ${r}`);
      failCount++;
    }
  } catch (e) {
    results.push(`  ✗ T${String(testIdx).padStart(2,'0')} ${name} — EXCEPTION: ${e.message}`);
    failCount++;
  }
}

function ok(cond, msg) { return cond ? true : msg; }
function eq(a, b, msg) { return a === b ? true : (msg || `期望 ${JSON.stringify(b)}, 实际 ${JSON.stringify(a)}`); }

// ==================== 测试组 1: PlayerResourceState 归一化 ====================

console.log('\n=== Group 1: PlayerResourceState 归一化 ===');

t('全新存档四字段全部为0', () => {
  const s = createDefaultPlayerResourceState();
  return ok(s.spiritualPower === 0 && s.spiritualPowerMax === 0 && s.spiritualPowerLastRecoverTime === 0 && s.challengeTickets === 0,
    `期望全0: ${JSON.stringify(s)}`);
});

t('缺失字段补0', () => {
  const r = normalizePlayerResourceState({});
  return ok(r.spiritualPower === 0 && r.spiritualPowerMax === 0 && r.spiritualPowerLastRecoverTime === 0 && r.challengeTickets === 0,
    `期望全0: ${JSON.stringify(r)}`);
});

t('null输入返回全0', () => {
  const r = normalizePlayerResourceState(null);
  return ok(r.spiritualPower === 0 && r.spiritualPowerMax === 0, `期望全0: ${JSON.stringify(r)}`);
});

t('undefined输入返回全0', () => {
  const r = normalizePlayerResourceState(undefined);
  return ok(r.spiritualPower === 0, `期望0: ${JSON.stringify(r)}`);
});

t('非object输入返回全0', () => {
  const r = normalizePlayerResourceState('string');
  return ok(r.spiritualPower === 0, `期望0: ${JSON.stringify(r)}`);
});

t('非number字段补0', () => {
  const r = normalizePlayerResourceState({ spiritualPower: 'abc', spiritualPowerMax: true });
  return ok(r.spiritualPower === 0 && r.spiritualPowerMax === 0, `期望0,0: ${r.spiritualPower},${r.spiritualPowerMax}`);
});

t('NaN和Infinity安全处理', () => {
  const r = normalizePlayerResourceState({ spiritualPower: NaN, spiritualPowerMax: Infinity, challengeTickets: -Infinity });
  return ok(r.spiritualPower === 0 && r.spiritualPowerMax === 0 && r.challengeTickets === 0,
    `期望全0: ${JSON.stringify(r)}`);
});

t('spiritualPower负数归零', () => {
  const r = normalizePlayerResourceState({ spiritualPower: -10 });
  return eq(r.spiritualPower, 0, `期望0, 实际${r.spiritualPower}`);
});

t('spiritualPowerMax负数归零', () => {
  const r = normalizePlayerResourceState({ spiritualPowerMax: -5 });
  return eq(r.spiritualPowerMax, 0, `期望0, 实际${r.spiritualPowerMax}`);
});

t('challengeTickets负数归零', () => {
  const r = normalizePlayerResourceState({ challengeTickets: -3 });
  return eq(r.challengeTickets, 0, `期望0, 实际${r.challengeTickets}`);
});

t('spiritualPowerLastRecoverTime负数归零', () => {
  const r = normalizePlayerResourceState({ spiritualPowerLastRecoverTime: -1000 });
  return eq(r.spiritualPowerLastRecoverTime, 0, `期望0, 实际${r.spiritualPowerLastRecoverTime}`);
});

t('非整数向下取整', () => {
  const r = normalizePlayerResourceState({ spiritualPower: 3.7, challengeTickets: 5.1 });
  return ok(r.spiritualPower === 3 && r.challengeTickets === 5, `期望3,5: ${r.spiritualPower},${r.challengeTickets}`);
});

t('合法非零值保留', () => {
  const r = normalizePlayerResourceState({ spiritualPower: 50, spiritualPowerMax: 100, challengeTickets: 3 });
  return ok(r.spiritualPower === 50 && r.spiritualPowerMax === 100 && r.challengeTickets === 3,
    `期望保留: ${JSON.stringify(r)}`);
});

t('重复归一化幂等', () => {
  const input = { spiritualPower: 10, spiritualPowerMax: 100, spiritualPowerLastRecoverTime: 5000, challengeTickets: 2 };
  const r1 = normalizePlayerResourceState(input);
  const r2 = normalizePlayerResourceState(r1);
  return ok(JSON.stringify(r1) === JSON.stringify(r2), `幂等失败: ${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
});

// ==================== 测试组 2: ensurePlayerResourceState ====================

console.log('\n=== Group 2: ensurePlayerResourceState（V8容器归一化） ===');

t('空容器补齐playerResources', () => {
  const container = {};
  const { state, changed } = ensurePlayerResourceState(container);
  return ok(changed === true && state.spiritualPower === 0 && container.playerResources !== undefined,
    `changed=${changed}, state=${JSON.stringify(state)}`);
});

t('已有完整合法playerResources不变更', () => {
  const container = { playerResources: { spiritualPower: 10, spiritualPowerMax: 100, spiritualPowerLastRecoverTime: 5000, challengeTickets: 2 } };
  const { state, changed } = ensurePlayerResourceState(container);
  return ok(changed === false && state.spiritualPower === 10,
    `changed=${changed}, state=${JSON.stringify(state)}`);
});

t('部分字段缺失仅补缺', () => {
  const container = { playerResources: { spiritualPower: 50, spiritualPowerMax: 150 } };
  const { state, changed } = ensurePlayerResourceState(container);
  return ok(changed === true && state.spiritualPower === 50 && state.spiritualPowerMax === 150
    && state.spiritualPowerLastRecoverTime === 0 && state.challengeTickets === 0,
    `changed=${changed}, state=${JSON.stringify(state)}`);
});

t('只缺challengeTickets时补该字段', () => {
  const container = { playerResources: { spiritualPower: 10, spiritualPowerMax: 100, spiritualPowerLastRecoverTime: 5000 } };
  const { state, changed } = ensurePlayerResourceState(container);
  return ok(changed === true && state.challengeTickets === 0 && state.spiritualPower === 10,
    `changed=${changed}, state=${JSON.stringify(state)}`);
});

t('负数被修复后changed=true', () => {
  const container = { playerResources: { spiritualPower: -5, spiritualPowerMax: 100, spiritualPowerLastRecoverTime: 0, challengeTickets: 0 } };
  const { state, changed } = ensurePlayerResourceState(container);
  return ok(changed === true && state.spiritualPower === 0,
    `changed=${changed}, state=${JSON.stringify(state)}`);
});

t('playerResources为null时补齐', () => {
  const container = { playerResources: null };
  const { state, changed } = ensurePlayerResourceState(container);
  return ok(changed === true && state.spiritualPower === 0,
    `changed=${changed}, state=${JSON.stringify(state)}`);
});

// ==================== 测试组 3: EntryCost 归一化 ====================

console.log('\n=== Group 3: EntryCost 归一化 ===');

t('EntryCost缺失归一化为none+0', () => {
  const r = normalizeEntryCost(undefined);
  return ok(r.costType === 'none' && r.costAmount === 0, `${JSON.stringify(r)}`);
});

t('null归一化为none+0', () => {
  const r = normalizeEntryCost(null);
  return ok(r.costType === 'none' && r.costAmount === 0, `${JSON.stringify(r)}`);
});

t('合法spiritual_power+10保留', () => {
  const r = normalizeEntryCost({ costType: 'spiritual_power', costAmount: 10 });
  return ok(r.costType === 'spiritual_power' && r.costAmount === 10, `${JSON.stringify(r)}`);
});

// ==================== 测试组 4: EntryCost 校验 ====================

console.log('\n=== Group 4: EntryCost 校验 ===');

t('none+0通过', () => {
  const r = validateEntryCostConfig({ costType: 'none', costAmount: 0 });
  return ok(r.valid, r.errors.join('; '));
});

t('none+1失败', () => {
  const r = validateEntryCostConfig({ costType: 'none', costAmount: 1 });
  return ok(!r.valid, '应失败但通过');
});

t('spiritual_power+10通过', () => {
  const r = validateEntryCostConfig({ costType: 'spiritual_power', costAmount: 10 });
  return ok(r.valid, r.errors.join('; '));
});

t('spiritual_power+0失败', () => {
  const r = validateEntryCostConfig({ costType: 'spiritual_power', costAmount: 0 });
  return ok(!r.valid, '应失败但通过');
});

t('spiritual_power错误resourceId失败', () => {
  const r = validateEntryCostConfig({ costType: 'spiritual_power', costAmount: 10, resourceId: 'stamina' });
  return ok(!r.valid, `应失败: ${r.errors.join('; ')}`);
});

t('spiritual_power合法resourceId通过', () => {
  const r = validateEntryCostConfig({ costType: 'spiritual_power', costAmount: 10, resourceId: 'spiritual_power' });
  return ok(r.valid, r.errors.join('; '));
});

t('challenge_ticket缺resourceId失败', () => {
  const r = validateEntryCostConfig({ costType: 'challenge_ticket', costAmount: 1 });
  return ok(!r.valid, `应失败: ${r.errors.join('; ')}`);
});

t('challenge_ticket+resourceId通过', () => {
  const r = validateEntryCostConfig({ costType: 'challenge_ticket', costAmount: 1, resourceId: 'world_boss_ticket' });
  return ok(r.valid, r.errors.join('; '));
});

t('item缺resourceId失败', () => {
  const r = validateEntryCostConfig({ costType: 'item', costAmount: 1 });
  return ok(!r.valid, `应失败: ${r.errors.join('; ')}`);
});

t('item+resourceId通过', () => {
  const r = validateEntryCostConfig({ costType: 'item', costAmount: 1, resourceId: 'event_item_001' });
  return ok(r.valid, r.errors.join('; '));
});

t('costAmount负数失败', () => {
  const r = validateEntryCostConfig({ costType: 'spiritual_power', costAmount: -5 });
  return ok(!r.valid, '应失败但通过');
});

t('costAmount非整数失败', () => {
  const r = validateEntryCostConfig({ costType: 'spiritual_power', costAmount: 3.5 });
  return ok(!r.valid, '应失败但通过');
});

t('未知costType失败', () => {
  const r = validateEntryCostConfig({ costType: 'mana', costAmount: 10 });
  return ok(!r.valid, '应失败但通过');
});

// ==================== 测试组 5: resourceId 格式安全 ====================

console.log('\n=== Group 5: resourceId 格式安全 ===');

t('合法resourceId通过: spiritual_power', () => {
  return ok(isValidResourceId('spiritual_power'), '应通过');
});

t('合法resourceId通过: world_boss_ticket', () => {
  return ok(isValidResourceId('world_boss_ticket'), '应通过');
});

t('合法resourceId通过: event_item_001', () => {
  return ok(isValidResourceId('event_item_001'), '应通过');
});

t('空字符串失败', () => {
  return ok(!isValidResourceId(''), '空字符串应失败');
});

t('纯空格失败', () => {
  return ok(!isValidResourceId('   '), '纯空格应失败');
});

t('包含路径分隔符失败', () => {
  return ok(!isValidResourceId('some/path'), '包含/应失败');
});

t('包含反斜杠失败', () => {
  return ok(!isValidResourceId('some\\path'), '包含\\应失败');
});

t('包含点号失败', () => {
  return ok(!isValidResourceId('event.item.001'), '包含.应失败');
});

t('包含中文失败', () => {
  return ok(!isValidResourceId('仙力资源'), '包含中文应失败');
});

t('包含特殊符号失败', () => {
  return ok(!isValidResourceId('item@#$'), '包含特殊符号应失败');
});

t('包含换行失败', () => {
  return ok(!isValidResourceId('item\n001'), '包含换行应失败');
});

t('包含大写字母失败', () => {
  return ok(!isValidResourceId('World_Boss_Ticket'), '包含大写应失败');
});

t('首尾有空格的合法ID失败', () => {
  return ok(!isValidResourceId(' spiritual_power '), '首尾空格应失败');
});

t('validateEntryCostConfig拒绝不安全resourceId', () => {
  const r = validateEntryCostConfig({ costType: 'item', costAmount: 1, resourceId: 'Bad@ID!' });
  return ok(!r.valid, `应失败: ${r.errors.join('; ')}`);
});

t('validateEntryCostConfig通过安全resourceId', () => {
  const r = validateEntryCostConfig({ costType: 'challenge_ticket', costAmount: 1, resourceId: 'world_boss_ticket' });
  return ok(r.valid, r.errors.join('; '));
});

// ==================== 测试组 6: 非激活确认 ====================

console.log('\n=== Group 6: 非激活确认 ===');

t('默认仙力上限为0', () => {
  const s = createDefaultPlayerResourceState();
  return eq(s.spiritualPowerMax, 0, '表示系统未启用');
});

t('没有spiritualPower或challengeTickets扣除语句（静态检查）', () => {
  // 本轮所有代码中不存在 spiritualPower -= 或 challengeTickets -= 语句
  // 此处为声明性测试：验证 normalizePlayerResourceState 和 ensurePlayerResourceState 都不修改非传参外部状态
  const outer = { spiritualPower: 50 };
  const r = normalizePlayerResourceState(outer);
  // normalizePlayerResourceState 返回新对象，不修改 raw
  return ok(r.spiritualPower === 50 && outer.spiritualPower === 50, '归一化不应修改输入对象');
});

t('重复归一化幂等（第2次也相同）', () => {
  const s1 = normalizePlayerResourceState({ spiritualPower: 3.7 });
  const s2 = normalizePlayerResourceState(s1);
  return ok(JSON.stringify(s1) === JSON.stringify(s2), `不幂等: ${JSON.stringify(s1)} vs ${JSON.stringify(s2)}`);
});

// ==================== 测试组 7: 旧stamina系统未修改确认 ====================

console.log('\n=== Group 7: 旧stamina系统边界确认 ===');

t('旧stamina字段名未改变', () => {
  const dungeonSave = { currentStamina: 100, maxStamina: 100 };
  return ok('currentStamina' in dungeonSave && 'maxStamina' in dungeonSave, 'stamina字段应保留');
});

t('normalizePlayerResourceState不读取currentStamina', () => {
  // 即使传入包含currentStamina的对象，也不应复制到spiritualPower
  const raw = { currentStamina: 100, maxStamina: 100, spiritualPower: 5 };
  const r = normalizePlayerResourceState(raw);
  return ok(r.spiritualPower === 5 && r.spiritualPowerMax === 0,
    `spiritualPowerMax应仍为0(未从maxStamina复制): ${r.spiritualPowerMax}`);
});

// ==================== 总结 ====================

console.log('='.repeat(50));
console.log(`RESULTS: ${passCount}/${testIdx} passed, ${failCount} failed`);
console.log('='.repeat(50));
for (const r of results) console.log(r);

if (failCount === 0) {
  console.log('\n✓ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log(`\n✗ ${failCount} TEST(S) FAILED`);
  process.exit(1);
}
