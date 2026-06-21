# Phase10-Step11Z：Equipment 数据来源审计报告

**审计时间**：2026-06-11
**审计范围**：装备数据全链路（配置 → 实例创建 → 存放 → UI 查询）
**原则**：只读审计，不修改任何代码

---

## 一、审计问题清单与结论

| # | 审计问题 | 结论 |
|---|---------|------|
| 1 | 新存档是否设计为没有任何装备 | **是。** 新存档 `instanceItems: []`，`loadouts: []` |
| 2 | 是否存在初始装备配置 | **否。** 无初始装备发放逻辑 |
| 3 | EquipmentRepository 是否成功加载 | **不适用。** 项目不存在独立的 `EquipmentRepository` 类。唯一装备仓库类是 `EquipmentConfigRepository`（配置仓库），负责加载装备配置模板。装备实例的持久化存储由 `InventorySaveData.instanceItems` 直接承担，无独立 Repository 层 |
| 4 | EquipmentConfigRepository 是否成功加载 | **是。** `loadConfigs()` 从 `config/systems/equipment_config` 路径读取，构建 `configId → EquipmentConfigEntry` 映射，12 条配置全部可查 |
| 5 | InventorySystem 是否持有装备数据 | **新存档：否（空数组）。** 只有通过 InventoryService.addAssets() 入库才会有 |
| 6 | EquipmentBagPanel 数据来源 | `InventoryService → instanceItems (category=Equipment)` |
| 7 | 当前显示"0件"是正常设计还是Bug | **两者兼有。** 代码逻辑正确（空数据→空列表），但**装备获取管道全部断裂**属于 Bug |

---

## 二、完整数据链路追踪

### 2.1 装备配置层 — ✅ 正常

**文件**：`assets/resources/config/systems/equipment_config.json`

```
共 12 条配置：
  Weapon:  weapon_001(Common) / weapon_002(Rare) / weapon_003(Epic) / weapon_004(Legendary)
  Armor:   armor_001(Common)  / armor_002(Rare)  / armor_003(Epic)  / armor_004(Legendary)
  Accessory: acc_001(Common) / acc_002(Rare) / acc_003(Epic) / acc_004(Legendary)
```

**EquipmentConfigRepository.loadConfigs()** 从 `config/systems/equipment_config` 路径加载，构建 `configId → EquipmentConfigEntry` 映射。12条配置全部可查。

---

### 2.2 新存档创建 — ✅ 无装备（按设计）

**调用链**：

```
SaveManager.init() → 无旧存档
  → createDefaultSaveContainerV8()
    → createDefaultInventorySaveData()        // instanceItems: []
    → createDefaultEquipmentSaveDataV2()      // loadouts: []
```

**`InventorySaveData` 默认值**：[InventorySaveData.ts:145](assets/scripts/inventory/InventorySaveData.ts#L145)
```ts
{ stackItems: [], instanceItems: [], currencies: { gold:0, spiritStone:0, diamond:0 }, ... }
```

**`EquipmentSaveDataV2` 默认值**：[EquipmentLoadoutData.ts:87](assets/scripts/equipment/EquipmentLoadoutData.ts#L87)
```ts
{ version: 1, loadouts: [], meta: { ... } }
```

新存档从创建开始就没有装备实例。**设计文档中 Phase4B 定义"装备获取"为战斗奖励 / 系统发放，但未定义"初始装备"发放。**

---

### 2.3 装备实例创建 — 🔴 数据存储双层断裂

项目存在**两套装备数据存储**：

#### 旧系统：EquipmentSystem

- **存储位置**：`SaveContainer.equipment`（PlayerEquipmentData）
- **实例类型**：`EquipmentInstanceData { uid, configId }`
- **创建入口**：`EquipmentSystem.createInstance(configId)`
- **状态**：仍在 DropSystem 中使用，但**新 UI 不读这个数据源**

#### 新系统：InventoryService

- **存储位置**：`SaveContainerV8.inventoryData.instanceItems`（InstanceItem[]）
- **实例类型**：`InstanceItem { uniqueId, itemId, category, subType, ... }`
- **创建入口**：`InventoryService.addAssets(transactionId, [AddAssetRequest])`
- **状态**：UI 只读这个数据源

#### 断裂位置 #1 — DropSystem

[DropSystem.ts:936](assets/scripts/systems/DropSystem.ts#L936)
```ts
// DropSystem._createEquipmentRewards()
const instance = equipSystem.createInstance(randomConfigId);
// → 写入 EquipmentSystem._data.instances（旧存储）
// → ❌ 不写入 InventoryService（新存储）
```

**结果**：战斗掉落的装备进入旧存储，UI 永远看不到。

#### 断裂位置 #2 — BattleManager

[BattleManager.ts:636](assets/scripts/managers/BattleManager.ts#L636)
```ts
// BattleManager._rollDropItem() — 自己实现掉落判定，不使用 DropSystem
const roll = (): BattleReward => ({
  itemId: item.itemId,
  itemType: item.itemType,  // 'equip' / 'gold' / 'exp'
  count: this._randomInt(item.minCount, item.maxCount),
  source: 'drop',
});
```

[BattleManager.ts:492](assets/scripts/managers/BattleManager.ts#L492)
```ts
// 奖励汇总：只处理 exp 和 gold
for (const reward of rewards) {
  if (reward.itemType === 'exp') { expGain += reward.count; }
  else if (reward.itemType === 'gold') { goldGain += reward.count; }
  // ← ❌ 装备类型（'equip'）被静默忽略
}
```

**结果**：战斗奖励中的装备完全丢失，不进入任何存储。

---

### 2.4 EquipmentBagPanel 数据查询路径 — ✅ 路径清晰但无数据

```
EquipmentBagPanel._getFilteredEntries()
  → EquipmentUIPresenter.getEquipmentList(filter)
    → EquipmentInventoryView(allInstances, loadouts, configRepo)
      → getEquipmentList()
        → 遍历 allInstances（来自 InventoryService.getAllInstanceItems()）
        → 过滤 category === 'Equipment'
        → 返回 []（新存档 instanceItems 为空）
  → filterHintLabel: "全部品质 · 0 件"
  → emptyHintNode.active = true → "暂无装备"
```

**每个环节都代码正确**，但源数据为空，所以最终显示"0件"。

---

### 2.5 EquipmentPanel 显示 — ✅"正常显示"原因

`EquipmentPanel` 显示英雄的 3 个装备槽位（Weapon/Armor/Accessory）。即使没有装备，Panel 本身可以正常渲染空槽位 UI。"正常显示"意味着 Panel 的渲染逻辑没有问题，但不代表有装备数据。

---

## 三、根因分析

```
           配置层 ✅         实例创建 🔴             UI 层 ✅
   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
   │ equipment_config │   │ EquipmentSystem │   │ EquipmentPanel  │
   │ .json (12条)     │   │ .createInstance │   │ (空槽位)        │
   │                  │   │ → 旧存储        │   │                 │
   │ ConfigRepository │   │                 │   │ EquipmentBag    │
   │ .loadConfigs() ✅│   │ DropSystem      │   │ Panel           │
   │                  │   │ → 旧存储 🔴     │   │ (0件)           │
   │ InventoryDomain  │   │                 │   │                 │
   │ ITEM_EQ_* 规则 ✅│   │ BattleManager   │   │ Equipment       │
   │                  │   │ → 静默丢弃 🔴  │   │ InventoryView   │
   └─────────────────┘   │                 │   │ → InventorySvc  │
                          │ InventorySvc    │   │ .instanceItems  │
                          │ .addAssets()    │   │ → 空数组 🔴    │
                          │ → 无调用者 🔴  │   └─────────────────┘
                          └─────────────────┘
```

**三个独立断裂点**：

| 断裂点 | 位置 | 严重程度 | 影响 |
|--------|------|---------|------|
| **P1** | `BattleManager._resolveRewards()` 静默忽略装备类型 | 🔴 致命 | 战斗后装备完全丢失 |
| **P2** | `DropSystem._createEquipmentRewards()` 写入旧存储 | 🟡 高 | 掉落的装备 UI 不可见 |
| **P3** | 无初始装备发放逻辑 | 🟠 中 | 新玩家看不到装备系统 |

**共同结果**：`InventoryService.instanceItems` 永远是空数组，因此 EquipmentBagPanel 永远显示"0件"。

---

## 四、现有装备获取路径汇总

| 路径 | 是否写入 Inventory | 状态 |
|------|-------------------|------|
| EquipmentSystem.createInstance() | **否**（写入旧存储 `SaveContainer.equipment`） | 旧系统 |
| DropSystem._createEquipmentRewards() | **否**（通过 EquipmentSystem） | 旧系统 |
| BattleManager._resolveRewards() | **否**（装备类型被静默忽略） | 🔴 断裂 |
| InventoryService.addAssets(itemId='ITEM_EQ_...') | **是**（正确的唯一路径） | ✅ 但无调用者 |
| InventoryDebugRunner | **是** | 🧪 仅测试 |
| EquipmentDebugRunner | **否**（通过 EquipmentSystem） | 🧪 仅测试 |

---

## 五、回答用户的 7 个审计问题

### 1. 新存档是否设计为没有任何装备

**是。** `createDefaultSaveContainerV8()` 创建的存档中 `instanceItems` 和 `loadouts` 均为空。设计文档（`21-equipment-system-design.md`）定义了装备通过"战斗奖励"和"系统发放"获取，但未定义初始装备发放。

### 2. 是否存在初始装备配置

**不存在。** 没有任何代码在新建存档时向 Inventory 发放初始装备。`equipment_config.json` 有 12 条配置模板，但配置 ≠ 实例。

### 3. EquipmentRepository 是否成功加载

**不适用。** 项目不存在独立的 `EquipmentRepository` 类。搜索全部 `assets/scripts/equipment/` 目录，唯一的仓库类是 `EquipmentConfigRepository`（配置模板仓库）。装备实例数据的持久化存储由 `InventorySaveData.instanceItems` 直接承担，没有独立的实例 Repository 层。架构上这是有意设计：装备实例统一纳入 Inventory 体系管理。

### 4. EquipmentConfigRepository 是否成功加载

**是。** `loadConfigs()` 从 `config/systems/equipment_config` 读取，构建 `configId → EquipmentConfigEntry` 映射。12 条配置全部可查询。

### 5. InventorySystem 是否持有装备数据

**新存档：否。** `InventorySaveData.instanceItems` 默认为 `[]`。只有通过 `InventoryService.addAssets()` 并指定 `itemId` 为 `ITEM_EQ_*` 前缀的物品，才会创建 `category='Equipment'` 的 `InstanceItem`。

### 6. EquipmentBagPanel 数据来源

完整数据链：

```
EquipmentBagPanel._getFilteredEntries()
  → EquipmentUIPresenter.getEquipmentList(filter)
    → EquipmentInventoryView(allInstances, loadouts, configRepo)
      → InventoryService.getAllInstanceItems()
        → InventorySaveData.instanceItems（内存数据）
          → 来自 InventoryTransaction.addAssets()
          → 来自 RewardSystem REWARD_GRANTED 事件
          → 或者直接 InventoryService.addAssets()
```

### 7. 当前显示"0件"是正常设计还是Bug

**两者兼有：**

- **从代码正确性角度**：UI 查询逻辑正确，空数据显示"0件"是正确的行为
- **从游戏设计角度**：这是一个 Bug/缺失功能，因为：
  - 装备系统 UI 已经建成
  - 装备配置已经就绪（12条）
  - 但没有任何游戏路径能让装备进入玩家背包
  - 玩家永远看不到装备

（注：原问题中"EquipmentPanel 为何正常显示"的答案：`EquipmentPanel` 显示英雄的 3 个装备槽位空槽位 UI，不依赖装备实例数据，因此空槽位也能"正常显示"。）

---

## 六、修复建议（供后续参考，本次不执行）

### 优先级 P0：修复 BattleManager 装备发放

将 `BattleManager._resolveRewards()` 中的装备奖励纳入处理：

```
装备类型奖励 → InventoryService.addAssets(itemId='ITEM_EQ_*', count=N)
```

### 优先级 P1：修复 DropSystem 数据存储

将 `DropSystem._createEquipmentRewards()` 改为通过 `InventoryService.addAssets()` 创建装备实例，而非通过 `EquipmentSystem.createInstance()`。

### 优先级 P2：新增初始装备发放

在新存档创建或首次进入游戏时，通过 `InventoryService.addAssets()` 发放初始装备（如 Common 品质武器+护甲+饰品各一件）。

---

## 七、审计文件清单

| 文件 | 路径 | 角色 |
|------|------|------|
| equipment_config.json | `assets/resources/config/systems/equipment_config.json` | 12条装备配置模板 |
| EquipmentConfigRepository | `assets/scripts/equipment/EquipmentConfigRepository.ts` | 配置查询（正常加载） |
| InventorySaveData | `assets/scripts/inventory/InventorySaveData.ts` | 新版资产存档（初始空） |
| InventoryService | `assets/scripts/inventory/InventoryService.ts` | 资产操作入口（无装备入口） |
| InventoryDomain | `assets/scripts/inventory/InventoryDomain.ts` | ITEM_EQ_* 分类规则（正常） |
| EquipmentService | `assets/scripts/equipment/EquipmentService.ts` | 穿戴关系管理（正常） |
| EquipmentInventoryView | `assets/scripts/equipment/EquipmentInventoryView.ts` | 装备ViewModel构建（正常） |
| EquipmentUIPresenter | `assets/scripts/ui/EquipmentUIPresenter.ts` | UI数据桥接（正常） |
| EquipmentBagPanel | `assets/scripts/ui/EquipmentBagPanel.ts` | 背包面板UI（正常） |
| EquipmentPanel | `assets/scripts/ui/EquipmentPanel.ts` | 英雄装备面板（正常） |
| EquipmentSystem | `assets/scripts/systems/EquipmentSystem.ts` | **旧**装备系统（数据走旧存储） |
| DropSystem | `assets/scripts/systems/DropSystem.ts` | 掉落系统（走旧存储） |
| BattleManager | `assets/scripts/managers/BattleManager.ts` | 战斗管理（**装备奖励被静默丢弃**） |
| SaveContainerV8 | `assets/scripts/save/SaveContainerV8.ts` | 存档容器（双存储并存） |
| EquipmentMigrationAdapter | `assets/scripts/equipment/EquipmentMigrationAdapter.ts` | 旧→新迁移（存在但未被正确触发） |

---

**审计结论**：装备 UI（EquipmentPanel / EquipmentBagPanel）自身逻辑正确，配置加载正常，但**数据源头为空**——因为装备获取管道存在三个断裂点，导致没有任何装备实例能进入 Inventory 新存储，UI 始终查询到空数据。"0件"是当前代码逻辑下的必然结果。需要修复战斗奖励管道才能让装备进入玩家背包。
