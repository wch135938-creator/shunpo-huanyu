# Phase10-Step12A-A 奖励所有权收口 — 修复报告

**日期**：2026-07-04  
**分支**：master  
**修改范围**：3 个文件（仅限）  
**引擎**：Cocos Creator 3.8.8  
**语言**：TypeScript  

---

## 一、修改文件清单

| 文件 | 类型 | 行数变化 | 说明 |
|---|---|---|---|
| `assets/scripts/managers/BattleManager.ts` | 删除 + 重构 | -92 / +10 | 移除直接写 Inventory 的两个私有方法 |
| `assets/scripts/reward/RewardSettlement.ts` | 新增逻辑 | +26 | 支持外部 transactionId + 发奖前查重 |
| `assets/scripts/inventory/InventoryService.ts` | 新增过滤 | +38 / -1 | 过滤 exp 奖励不入背包 |
| **其他文件** | **零修改** | **0** | — |

---

## 二、六大修复目标逐一核对

### ✅ 目标一：BattleManager 停止直接写 Inventory

**修改内容**：

1. 删除 `_grantEquipReward()` 方法（28 行）和 `_grantStackReward()` 方法（33 行）
2. 删除三个 import：`InventoryService`、`mapDropItemIdToEquipItemId`、`AddAssetRequest`
3. `_registerBattleEndedListener` 中奖励循环改为仅汇总 `expGain` / `goldGain`，不再调用任何写资产方法
4. `BattleResult.rewards` 数组完整保留（含 gold / material / equip / diamond），供 `RewardSettlement.settleBattleReward` 消费

**验证**：

```
全文搜索 BattleManager.ts：
  "InventoryService" → 仅出现于注释（2 处）
  "addAssets"        → 零匹配
  "_grantStack"       → 仅出现于注释（1 处）
  "_grantEquip"       → 仅出现于注释（1 处）
```

**兼容性**：`STAGE_BATTLE_FINISHED` 事件不变，`BattleResult` 接口不变。消费者无需改动。

---

### ✅ 目标二：RewardSettlement 支持外部 transactionId

**修改内容**：

1. `SettlementOptions` 新增可选字段：

```typescript
/**
 * [Step12A-A] 外部传入的稳定 transactionId。
 * 由 Coordinator 生成，用于跨系统事务幂等。
 * 未提供时使用 fallback（Date.now + random），日志会标记。
 */
transactionId?: string;
```

2. `settleBattleReward` 优先使用 `options.transactionId`，未传入时 fallback 到 `generateTransactionId('battle', stageId)`
3. Fallback 时输出 `[Step12A-A][RewardSettlement] 使用 fallback transactionId: ...`

**兼容性**：`transactionId` 为可选字段，不传 `options` 或 `options.transactionId` 为 `undefined` 时行为等价于旧版。

---

### ✅ 目标三：RewardSettlement 发奖前检查重复 transactionId

**修改内容**：

1. 导入 `InventoryService`
2. `settleBattleReward` 在调用 `grantRewardWithTransaction` 前，通过 `InventoryService.getInstance().isTransactionClaimed(transactionId)` 查重
3. 命中时返回：

```typescript
{
  success: false,
  aggregated: null,
  transactionId,
  isDuplicate: true,
  reason: '事务已处理，拒绝重复发奖: ...',
}
```

4. 不再调用 `RewardSystem.grantRewardWithTransaction`，不再写资产

**备注**：`InventoryService.isTransactionClaimed()` 已存在（委托 `InventoryTransaction.isTransactionProcessed` 检查内存缓存 + `claimStates`），本轮无需新增方法。

---

### ✅ 目标四：InventoryService 过滤 exp，不入背包

**修改内容**：

1. 新增两个静态只读 Set：

```typescript
private static readonly EXP_REWARD_ITEM_TYPES = new Set(['exp', 'hero_exp', 'experience']);
private static readonly EXP_REWARD_ITEM_IDS  = new Set(['ITEM_EXP', 'ITEM_HERO_EXP', 'ITEM_EXPERIENCE']);
```

2. `_processRewardGrant` 在处理前过滤匹配的奖励条目：

```typescript
const filteredRewards = aggregated.rawRewards.filter((entry) => {
  const isExpType = EXP_REWARD_ITEM_TYPES.has(entry.itemType);
  const isExpId   = EXP_REWARD_ITEM_IDS.has(entry.itemId);
  if (isExpType || isExpId) {
    console.log(`[Step12A-A][InventoryService] 经验奖励不入库: ...`);
    return false;
  }
  return true;
});
```

3. 过滤后若无剩余条目，直接 return，不调用 `addAssets`

**影响范围**：

- `RewardSystem` 的 `totalExp`、`recentRewards`、`RewardHistoryRecord` **不受影响**，exp 仍出现在 UI 摘要和历史记录中
- 仅阻止 exp 进入 `InventorySaveData.stackItems` / `instanceItems`

---

### ✅ 目标五：transactionId 幂等保持

- `InventoryTransaction.addAssets` 的 `isTransactionProcessed` 检查 + `claimStates` 双源幂等机制 **完整保留**
- 相同 transactionId 重复处理 → `isDuplicate=true`，资产数量不增加
- 新 transactionId 正常发奖，不受影响
- RewardSystem → InventoryService 链路保持 `transactionId` 透传，幂等闭环完整

---

### ✅ 目标六：不改其他系统

**零修改确认**：

- 邮件 / 兑换码 / 每日登录奖励幂等逻辑 → 未改动
- 兑换码直接到账路径 → 未改动
- Equipment UI / 青锋剑 / 布衣 / 铜戒 → 未改动
- 装备升级 / 强化 / 分解 → 未改动
- Scene / Prefab / SaveContainer / UIEngine / UILayoutEngine → 未改动
- `settleChapterReward` / `settleEventReward` / `settleEnemyReward` → 未改动

---

## 三、TypeScript 编译检查

**执行命令**：

```bash
"Cocos Creator 3.8.8/.../tsc" --noEmit
```

**结果**：

| 类别 | 数量 | 说明 |
|---|---|---|
| 引擎声明（cc.d.ts / jsb.d.ts） | ~80+ | 预存问题，Cocos 引擎自身类型定义 |
| `_runtime_test/` 测试文件 | ~10 | Node.js 依赖，非生产代码 |
| `BaseManager` 泛型模式 | 6 | 项目统一模式，所有 Manager 均有 |
| **本轮修改引入** | **0** | **无新增错误** |

---

## 四、数据流变更对比

### 修复前（双发路径）

```
BattleManager._registerBattleEndedListener
  ├─ rewards[] 汇总 → BattleResult.rewards
  ├─ _grantStackReward(reward) → InventoryService.addAssets()  ← 旧路径 1
  └─ _grantEquipReward(reward) → InventoryService.addAssets()  ← 旧路径 2
                                                                    ↓
RewardSettlement.settleBattleReward(result)
  └─ RewardSystem.grantRewardWithTransaction()
       └─ REWARD_GRANTED 事件
            └─ InventoryService._processRewardGrant()
                 └─ InventoryService.addAssets()                ← 新路径
                                                                    ↓
                            ⚠ 双发风险：同一奖励入库两次
```

### 修复后（唯一链路）

```
BattleManager._registerBattleEndedListener
  └─ rewards[] 汇总 → BattleResult.rewards（仅摘要，不写资产）
                                                                    
RewardSettlement.settleBattleReward(result, { transactionId })
  ├─ isTransactionClaimed? → duplicate → 拒绝
  └─ RewardSystem.grantRewardWithTransaction()
       └─ REWARD_GRANTED 事件
            └─ InventoryService._processRewardGrant()
                 ├─ 过滤 exp → 不入库
                 └─ InventoryService.addAssets()                ← 唯一写入
                            ✅ 收口完成
```

---

## 五、新增日志前缀

| 前缀 | 用途 |
|---|---|
| `[Step12A-A][BattleManager]` | 战斗结束汇总日志 |
| `[Step12A-A][RewardSettlement]` | transactionId fallback / 重复拦截 / 结算完成 |
| `[Step12A-A][InventoryService]` | exp 过滤 / 过滤后空奖励 |

---

## 六、风险与后续建议

### ⚠ 风险

1. **BattleManager 不再发奖后，必须由上游 Coordinator 调用 `RewardSettlement.settleBattleReward(result, { transactionId })` 才能真正到账资产。** 在 Step12A-B Coordinator 接入之前，战斗胜利后奖励不会自动到账（只留在 `BattleResult.rewards` 中）。

2. `mapDropItemIdToEquipItemId` 仍存在于 `InventoryDomain.ts`，但 BattleManager 不再调用它。装备 itemId 映射逻辑后续可能需要移至 RewardSettlement 或配置层。

### ➡️ 建议进入 Step12A-B

Step12A-B 应实现：

- Coordinator 生成稳定 `transactionId`（如 `txn_battle_{stageId}_{attemptIndex}`）
- Coordinator 监听 `STAGE_BATTLE_FINISHED` → 调用 `RewardSettlement.settleBattleReward(result, { transactionId })`
- Coordinator 处理 exp → `HeroSystem.addHeroExp`
- 接入 Chapter 首关验证完整奖励链路

### 不推送 / 不提交

本轮修改仅本地完成，未推送 GitHub，未提交。

---

## 七、Diff 摘要

```
 BattleManager.ts    | 103 +++++----------------------------------------------
 RewardSettlement.ts |  27 ++++++++++++++++
 InventoryService.ts |  38 ++++++++++++++++++++-
 3 files changed, 73 insertions(+), 95 deletions(-)
```
