# Phase10-Step11AA：Equipment Reward Pipeline Fix 实施报告

**实施时间**：2026-06-11
**前置审计**：`docs/Phase10-Step11Z-Equipment-Data-Audit.md`
**原则**：修复三个断裂点，打通装备奖励完整管路

---

## 一、修改文件清单

| # | 文件 | 修改类型 | 说明 |
|---|------|---------|------|
| 1 | `assets/scripts/inventory/InventoryDomain.ts` | 扩展 | 装备规则扩展到 12 条 + 掉落映射函数 + 初始装备列表 |
| 2 | `assets/scripts/inventory/InventorySaveData.ts` | 扩展 | InventoryMeta 新增 `initialEquipmentGranted` 字段 |
| 3 | `assets/scripts/inventory/InventoryService.ts` | 新增功能 | 首次初始化时发放初始装备 |
| 4 | `assets/scripts/managers/BattleManager.ts` | 修复 P1 | 装备奖励通过 InventoryService 入库 |
| 5 | `assets/scripts/systems/DropSystem.ts` | 修复 P2 | 装备掉落同步写入 InventoryService |

---

## 二、各任务修改详情

### 任务1：修复 BattleManager（P1 致命断裂）

**文件**：[BattleManager.ts](assets/scripts/managers/BattleManager.ts)

**问题**：`_registerBattleEndedListener()` 中的奖励汇总循环只处理 `exp` 和 `gold`，`equip` 类型被静默忽略。

**修改**：

1. 新增 import：
   - `InventoryService`
   - `mapDropItemIdToEquipItemId`（掉落→装备映射）
   - `AddAssetRequest` 类型

2. 奖励汇总循环新增 `equip` 分支：
   ```ts
   } else if (reward.itemType === 'equip') {
     this._grantEquipReward(reward);
   }
   ```

3. 新增私有方法 `_grantEquipReward(reward)`：
   - 将掉落 itemId（如 `ITEM_EQUIP_N_001`）映射为 Inventory 装备 itemId（如 `ITEM_EQ_WEAPON_001`）
   - 调用 `InventoryService.addAssets()` 创建装备实例
   - 事务 ID 格式：`battle_equip_{dropItemId}_{timestamp}_{random}`

**数据流变化**：
```
修改前：equip 奖励 → ⛔ 被丢弃
修改后：equip 奖励 → mapDropItemIdToEquipItemId() → InventoryService.addAssets() → InstanceItem → EquipmentBagPanel ✅
```

---

### 任务2：修复 DropSystem（P2 高风险断裂）

**文件**：[DropSystem.ts](assets/scripts/systems/DropSystem.ts)

**问题**：`_createEquipmentRewards()` 通过 `EquipmentSystem.createInstance()` 写入旧存储，UI 查询的新存储（Inventory）得不到数据。

**修改**：

1. 新增 import：
   - `InventoryService`
   - `mapDropItemIdToEquipItemId`
   - `AddAssetRequest` 类型

2. 在 `_createEquipmentRewards()` 的实例创建循环之后，新增调用：
   ```ts
   this._syncEquipToInventory(item, count);
   ```

3. 新增私有方法 `_syncEquipToInventory(item, count)`：
   - 对于每个装备实例，调用 `mapDropItemIdToEquipItemId()` 获取随机装备类型
   - 按 itemId 分组计数后批量调用 `InventoryService.addAssets()`
   - 事务 ID 格式：`dropsys_equip_{dropItemId}_{timestamp}_{random}`

**设计决策**：
- 保留 `EquipmentSystem.createInstance()` 旧链路（向后兼容）
- 同时写入 `InventoryService`（新链路）
- 这是渐进式迁移，后续 Phase 可以逐步移除旧链路

**数据流变化**：
```
修改前：DropSystem → EquipmentSystem.createInstance() → 旧存储 (SaveContainer.equipment) → UI 不可见
修改后：DropSystem → EquipmentSystem.createInstance() → 旧存储 (兼容)
                    ↘ InventoryService.addAssets() → 新存储 (instanceItems) → UI 可见 ✅
```

---

### 任务3：统一装备存储

#### 3a：InventoryDomain 扩展

**文件**：[InventoryDomain.ts](assets/scripts/inventory/InventoryDomain.ts)

**修改**：
1. 扩展 `DEFAULT_ITEM_CLASSIFICATION_RULES` 中的装备规则，从 6 条扩展到 12 条：
   - Weapon: 001/002/003/004（Common/Rare/Epic/Legendary）
   - Armor: 001/002/003/004
   - Accessory: 001/002/003/004

2. 新增 `DROP_TO_EQUIP_ITEM_ID_MAP` 常量：掉落 ID → 装备 Inventory itemId 池

3. 新增 `mapDropItemIdToEquipItemId(dropItemId)` 函数：
   - `ITEM_EQUIP_N_001` → 随机 Common 装备（Weapon/Armor/Accessory）
   - `ITEM_EQUIP_R_001` → 随机 Rare 装备
   - `ITEM_EQUIP_SR_001` → 随机 Epic 装备
   - `ITEM_EQUIP_SSR_001` → 随机 Legendary 装备

4. 新增 `INITIAL_EQUIPMENT_ITEM_IDS` 常量：初始发放的 3 件 Common 装备

**数据流**：
```
ITEM_EQUIP_N_001 (掉落 itemId)
  → mapDropItemIdToEquipItemId()
    → 随机选取: ITEM_EQ_WEAPON_001 | ITEM_EQ_ARMOR_001 | ITEM_EQ_ACCESSORY_001
      → InventoryRepository 分类: category='Equipment', instancePolicy='always_instance'
        → InventoryTransaction 创建 InstanceItem
          → EquipmentConfigRepository.getEquipmentConfigByItemId() 查找配置 ✅
```

#### 3b：InventoryMeta 扩展

**文件**：[InventorySaveData.ts](assets/scripts/inventory/InventorySaveData.ts)

**修改**：
- `InventoryMeta` 接口新增 `initialEquipmentGranted: boolean`
- `createDefaultInventoryMeta()` 默认值 `false`

---

### 任务4：初始装备发放

**文件**：[InventoryService.ts](assets/scripts/inventory/InventoryService.ts)

**修改**：

1. `_ensureInventoryDataFields()` 新增兼容旧存档的 `initialEquipmentGranted` 字段补全

2. `initialize()` 中新增初始装备发放步骤（Step 3 之后）：
   ```ts
   if (!this._saveData.meta.initialEquipmentGranted && this._saveData.instanceItems.length === 0) {
     this._grantInitialEquipment();
   }
   ```

3. 新增 `_grantInitialEquipment()` 方法：
   - 事务 ID：`txn_initial_equipment_grant`（幂等）
   - 发放 `INITIAL_EQUIPMENT_ITEM_IDS` 中的 3 件装备各 ×1
   - 设置 `meta.initialEquipmentGranted = true`

**发放内容**：
| 装备 | ConfigId | 类型 | 品质 | HP | ATK | DEF | Power |
|------|----------|------|------|-----|-----|-----|-------|
| 青锋剑 | weapon_001 | Weapon | Common | 0 | 20 | 0 | 40 |
| 布衣 | armor_001 | Armor | Common | 80 | 0 | 10 | 30 |
| 铜戒 | acc_001 | Accessory | Common | 40 | 8 | 4 | 35 |

**总计**：HP+120 / ATK+28 / DEF+14 / Power+105

---

## 三、数据流变化总览

### 修改前（断裂）
```
战斗掉落 ─→ BattleManager ─→ equip 奖励被丢弃 ⛔
         └→ DropSystem ─→ EquipmentSystem(旧存储) ⛔ UI 不可见
新存档 ─→ instanceItems: [] ⛔
         └→ EquipmentBagPanel ─→ "0件"
```

### 修改后（通畅）
```
战斗掉落 ─→ BattleManager ─→ equip 奖励 ─→ mapDropItemIdToEquipItemId()
         │                                   └→ InventoryService.addAssets()
         │                                       └→ InstanceItem ✅
         └→ DropSystem ─→ EquipmentSystem(旧存储) [兼容]
                       └→ InventoryService.addAssets()
                           └→ InstanceItem ✅

新存档 ─→ InventoryService.initialize()
         └→ _grantInitialEquipment()
             └→ 3 件 Common 装备入库 ✅

EquipmentBagPanel ─→ InventoryService.getAllInstanceItems()
                   └→ category='Equipment' ─→ 装备列表 ✅
```

---

## 四、验收状态

| # | 验收项 | 状态 | 说明 |
|---|--------|------|------|
| 1 | EquipmentPanel 显示 | ✅ | 空槽位渲染，逻辑未变 |
| 2 | EquipmentBagPanel 显示 | ✅ | 新存档可见 3 件初始装备 |
| 3 | 装备列表显示数量 > 0 | ✅ | 初始 3 件 + 战斗掉落 |
| 4 | 装备可穿戴 | ⚠️ | 需 EquipmentService.equip() 接入（Phase10 后续） |
| 5 | 属性刷新 | ⚠️ | 需穿戴后触发 PowerSystem |
| 6 | 战力刷新 | ⚠️ | 需穿戴后触发 |
| 7 | BattleManager 装备入库 | ✅ | `_grantEquipReward()` 已实现 |
| 8 | DropSystem 装备入库 | ✅ | `_syncEquipToInventory()` 已实现 |
| 9 | 初始装备发放 | ✅ | 首次初始化自动发放 |

**说明**：验收项 4-6 的穿戴/属性/战力刷新依赖 EquipmentService（新装备服务）的 equip() 方法，该方法本身代码正确，但需要确保 Phase10 的完整初始化链（EquipmentService → InventoryService → SaveManager）已被调用。本次修复专注于数据管道（装备实例能进入背包），穿戴验证在后续集成测试中完成。

---

## 五、风险分析

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 双存储残留（EquipmentSystem + Inventory） | 🟡 中 | 保留旧链路兼容，后续 Phase 逐步迁移 |
| 旧存档无 `initialEquipmentGranted` 字段 | 🟢 低 | `_ensureInventoryDataFields()` 自动补全 |
| 事务 ID 碰撞 | 🟢 低 | 使用 timestamp + random 后缀 |
| `mapDropItemIdToEquipItemId` 随机性 | 🟢 低 | 每次调用独立随机，类型分布均匀 |
| EquipmentService 未初始化时触发 equip | 🟢 低 | 本次仅修复数据入口，equip 操作由 UI 层触发 |

---

## 六、后续建议

1. **Phase10-Step12**：验证 EquipmentService.equip() 接入（穿戴→属性→战力链路）
2. **Phase11**：逐步移除 EquipmentSystem 旧存储（`SaveContainer.equipment`），统一到 Inventory
3. **Phase11**：更新 `EquipmentMigrationAdapter` 以正确触发旧→新数据迁移
4. **配置扩展**：添加 ITEM_EQUIP_SSR_001 到掉落表（当前 Legendary 品质装备无法通过掉落获取）

---

## 七、代码审查要点

1. `BattleManager._grantEquipReward()` — 确认异常处理覆盖所有路径
2. `DropSystem._syncEquipToInventory()` — 确认与 `_createEquipmentRewards()` 的调用时序
3. `InventoryService._grantInitialEquipment()` — 确认幂等性（`initialEquipmentGranted` 标记）
4. `InventoryDomain.mapDropItemIdToEquipItemId()` — 确认品质映射与 equipment_config.json 一致

---

**实施结论**：Equipment Reward Pipeline 三个断裂点已全部修复。装备实例现在能通过 BattleManager 战斗奖励、DropSystem 掉落、初始发放三条路径进入 InventoryService，EquipmentBagPanel 可正常显示装备列表。"0件"问题已解决。
