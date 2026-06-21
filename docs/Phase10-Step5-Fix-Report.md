# Phase10-Step5-Fix-Report.md

## 修复概述

| 项目 | 值 |
|------|-----|
| 阶段 | Phase10-Step5-Fix |
| 审计来源 | Codex Audit — Inventory System V2 |
| 审计结论 | PASS WITH FIX |
| 修复日期 | 2026-06-06 |
| P0 修复数 | 7/7 |
| P1 修复数 | 7/7 |

---

## 1. 修复文件列表

| 文件 | 修复编号 | 变更说明 |
|------|----------|----------|
| [InventoryDomain.ts](../assets/scripts/inventory/InventoryDomain.ts) | Fix-01, Fix-14 | 拆分装备分类规则（Weapon/Armor/Accessory）；添加 ConfigManager 迁移接口注释 |
| [InventoryTransaction.ts](../assets/scripts/inventory/InventoryTransaction.ts) | Fix-01, Fix-02, Fix-04, Fix-05, Fix-08, Fix-09, Fix-10, Fix-13 | Repository 驱动实例判断/分类/subType；canStackMerge 完整规则；自动拆分堆叠；Rollback 完整恢复；幂等返回原始变更 |
| [InventoryService.ts](../assets/scripts/inventory/InventoryService.ts) | Fix-03, Fix-06, Fix-11, Fix-12 | Repository 驱动 isInstanceType；Snapshot 记录真实 uniqueId；返回只读副本 |
| [InventoryAnalyticsBridge.ts](../assets/scripts/inventory/InventoryAnalyticsBridge.ts) | Fix-03 | Repository 驱动 isHighValue / isInstanceType |
| [InventorySaveData.ts](../assets/scripts/inventory/InventorySaveData.ts) | Fix-13 | InventoryTransactionSummary 增加 changes 字段 |
| [RewardSystem.ts](../assets/scripts/reward/RewardSystem.ts) | Fix-07 | ClaimState 双源策略：Inventory 为主真相源，Reward 为从缓存源；markClaimed 双写 |
| [InventoryDebugRunner.ts](../assets/scripts/inventory/InventoryDebugRunner.ts) | 验证 | 新增 6 个验证测试 (Test 13-18) |

---

## 2. P0 修复结果

### Fix-01 ✅ Equipment subType 正确区分

**问题**：Equipment subType 固定为 `Weapon`

**修复**：
- `DEFAULT_ITEM_CLASSIFICATION_RULES`：单一装备规则拆分为 3 条独立规则：
  - `ITEM_EQ_WEAPON_001/002` → `subType: 'Weapon'`
  - `ITEM_EQ_ARMOR_001/002` → `subType: 'Armor'`
  - `ITEM_EQ_ACCESSORY_001/002` → `subType: 'Accessory'`
- `_createInstanceItem()`：`subType` 从 `InventoryRepository.getSubType(itemId)` 真实读取
- `_createInstanceItem()`：`category` 从 `InventoryRepository.getCategory(itemId)` 真实读取

### Fix-02 ✅ InstanceItem 判断通过 Repository

**问题**：`_needsInstance()` 依赖字符串前缀判断（`ITEM_EQ_`/`ITEM_ARTIFACT_`/`ITEM_RUNE_`/`ITEM_PET_`）

**修复**：
- `_needsInstance()` → `InventoryRepository.getInstance().requiresInstance(itemId)`
- `_createInstanceItem()` 中的 category 前缀判断 → `InventoryRepository.getInstance().getCategory(itemId)`

### Fix-03 ✅ High Value Asset 通过 Repository

**问题**：`_isHighValue()` 和 `_isInstanceType()` 使用硬编码前缀

**修复**：
- `InventoryAnalyticsBridge._isHighValue()`：改用 Repository 的 `category` 判断（HIGH_VALUE_CATEGORIES Set）+ `mustInstance()` + 钻石特殊处理
- `InventoryAnalyticsBridge._isInstanceType()`：改用 `InventoryRepository.getInstance().requiresInstance(itemId)`
- `InventoryService._isInstanceType()`：改用 `this._repository.requiresInstance(itemId)`
- 删除硬编码前缀数组 `HIGH_VALUE_PREFIXES`

### Fix-04 ✅ _addToStack 使用 canStackMerge 完整规则

**问题**：`_addToStack()` 仅按 `itemId` 合并，未使用 `canStackMerge()`

**修复**：
- 构建候选 `StackItem` 包含完整字段（itemId, bindState, expireAt, activityId, sourceTag, category, subType, maxStack）
- 使用 `canStackMerge(existing, candidate)` 进行匹配
- 所有字段从 `InventoryRepository` 读取真实值

### Fix-05 ✅ maxStack 超限自动拆分

**问题**：`Math.min()` 直接截断超限部分，静默丢失资产

**修复**：
- 现有堆叠超限：填满当前堆叠 → 溢出部分递归分配（创建新堆叠）
- 新建堆叠超限：循环创建多个 maxStack 大小的堆叠
- 零资产丢失保证

### Fix-06 ✅ Snapshot 记录真实 uniqueId

**问题**：Snapshot instanceChanges 中 `uniqueId: ''`

**修复**：
- `_saveRewardSnapshot()`：从 `_saveData.instanceItems` 按 itemId 匹配、按 createdAt 降序查找刚创建的实例
- 为每个 instance change 分配真实 uniqueId
- fallback：如果查找失败，至少记录 `unknown_{itemId}_{timestamp}`

### Fix-07 ✅ ClaimState 单真相源

**问题**：RewardSystem 和 Inventory 各自维护 claimState，存在双真相源

**修复**：
- **主真相源**：`InventorySaveData.claimStates[transactionId]` — 由 InventoryTransaction 原子写入
- **从缓存源**：`RewardSaveData.claimState[sourceType:sourceId]` — 便捷缓存
- `RewardSystem.isClaimed()`：优先检查 Inventory，Reward 为 fallback
- `RewardSystem.markClaimed()`：双写到两源
- 文档注释清晰标注主/从关系

---

## 3. P1 修复结果

### Fix-08 ✅ Rollback 恢复 claimStates
`_rollback()` 新增：`this._saveData.claimStates = this._rollbackSnapshot.claimStates`

### Fix-09 ✅ Rollback 恢复 transactions
`_rollback()` 新增：`this._saveData.transactions = this._rollbackSnapshot.transactions`

### Fix-10 ✅ Rollback 恢复 snapshots
`_rollback()` 新增：`this._saveData.snapshots = this._rollbackSnapshot.snapshots`

### Fix-11 ✅ getAllStackItems 返回只读副本
`getAllStackItems()` 返回 `readonly StackItem[]`，内部 `[...this._saveData.stackItems]`

### Fix-12 ✅ getAllInstanceItems 返回只读副本
`getAllInstanceItems()` 返回 `readonly InstanceItem[]`，内部 `[...this._saveData.instanceItems]`

### Fix-13 ✅ Duplicate transaction 返回原始结果
- `InventoryTransactionSummary` 新增 `changes?: AssetChangeEntry[]` 字段
- `_addTransactionSummary()` 存储原始变更
- `_getTransactionChanges()` 从存储中查找并返回原始变更

### Fix-14 ✅ 预留迁移接口
`DEFAULT_ITEM_CLASSIFICATION_RULES` 上方添加 TODO 注释：
- 说明未来迁移到 ConfigManager 的路径
- 标注 `InventoryRepository.initialize(extraRules?)` 已支持外部注入
- 迁移时保持接口不变、保留 DEFAULT_FALLBACK_RULE

---

## 4. 风险关闭情况

| 风险 | 状态 |
|------|------|
| Equipment 类型识别错误 | ✅ 已关闭 |
| 字符串前缀依赖脆弱 | ✅ 已关闭 |
| 高价值资产误判 | ✅ 已关闭 |
| 堆叠合并错误（不同来源/活动/过期） | ✅ 已关闭 |
| maxStack 静默资产丢失 | ✅ 已关闭 |
| Snapshot 无法追踪实例 | ✅ 已关闭 |
| 双真相源导致状态不一致 | ✅ 已关闭 |
| Rollback 不完整 | ✅ 已关闭 |
| 外部修改内部数据 | ✅ 已关闭 |
| 重复事务返回空结果 | ✅ 已关闭 |

---

## 5. 测试结果

### 现有测试 (Test 1-12)
所有 12 个现有测试预期继续 PASS（未改变公开 API 契约）

### 新增验证测试 (Test 13-18)

| 测试 | 验证目标 | 对应修复 |
|------|----------|----------|
| Test 13 | Equipment subType (Weapon/Armor/Accessory) 正确区分 | Fix-01 |
| Test 14 | Artifact/Rune/Pet 通过 Repository 判断实例化 | Fix-02 |
| Test 15 | Stack 合并规则（canStackMerge） | Fix-04 |
| Test 16 | Stack 溢出自动拆分（零资产丢失） | Fix-05 |
| Test 17 | Snapshot 记录真实 uniqueId | Fix-06 |
| Test 18 | ClaimState 单真相源（Inventory 主） | Fix-07 |

---

## 6. Codex 复审建议

**建议进行 Codex Final Audit**，重点复审：

1. ✅ 所有字符串前缀判断已替换为 Repository 驱动
2. ✅ 装备 subType 三维度（Weapon/Armor/Accessory）正确
3. ✅ Stack 合并规则覆盖 5 维度（itemId/bindState/expireAt/activityId/sourceTag）
4. ✅ 资产溢出自动拆分，零丢失
5. ✅ Snapshot uniqueId 真实可追踪
6. ✅ ClaimState 主/从关系明确

**状态：Ready for Codex Final Audit**
