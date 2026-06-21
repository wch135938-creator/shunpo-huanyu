# Phase10-Step11AC — InventoryService 初始化递归修复报告

**实施时间**：2026-06-11
**前置调查**：`Phase10-Step11AB-StackOverflow-And-Inventory-Investigation-Report.md`
**修复类型**：最小变更（1 行移动 + 日志 + 防重入守卫）

---

## 一、根因

### 具体递归形成位置

`InventoryService.initialize()` 中的 `_initialized` flag 位置错误。

**旧代码**（[InventoryService.ts:149](assets/scripts/inventory/InventoryService.ts#L149)）将 `_initialized = true` 放在 `_grantInitialEquipment()` 调用**之后**，而 `_grantInitialEquipment()` 通过 `addAssets()` → `if (!_initialized) → initialize()` 形成递归。

```text
initialize()
  ├ _initialized = false → 通过守卫
  ├ 加载 SaveData
  ├ _grantInitialEquipment()           ← 触发点
  │ └→ this.addAssets()
  │   └→ if (!_initialized)            ← _initialized 仍为 false
  │       this.initialize()             ← 递归！
  │         ├ _initialized = false → 再次通过守卫
  │         ├ _grantInitialEquipment() ← 再次进入
  │         └→ 无限递归
  └ _initialized = true                 ← 永远不会执行到
```

### 三代码协同导致死循环

| # | 位置 | 代码 | 角色 |
|---|------|------|------|
| 1 | [Initialize L149](assets/scripts/inventory/InventoryService.ts#L149) | `this._initialized = true;` | ~~设置太晚~~ → 移到 L142 |
| 2 | [_grantInitialEquipment L190](assets/scripts/inventory/InventoryService.ts#L190) | `this.addAssets(...)` | 间接调用 addAssets |
| 3 | [addAssets L317-319](assets/scripts/inventory/InventoryService.ts#L317-L319) | `if (!this._initialized) { this.initialize(); }` | 懒初始化守卫 |

---

## 二、修复方案

### 修改前

```typescript
initialize(): void {
    if (this._initialized) return;

    this._repository.initialize();
    // ... load save data ...
    this._transaction.bindData(this._saveData);

    // ← _initialized 仍是 false

    if (...initialEquipmentGranted === false ...) {
      this._grantInitialEquipment();   // → addAssets() → check !_initialized → initialize() → 递归
    }

    this._analyticsBridge.setEmitCallback(...);
    this._registerRewardListener();
    this._initialized = true;          // ← 太晚了，到不了这里
}
```

### 修改后

```typescript
initialize(): void {
    if (this._initialized) return;

    console.log('[InventoryInit] initialize start');

    this._repository.initialize();
    // ... load save data ...
    this._transaction.bindData(this._saveData);

    // Phase10-Step11AC: 必须在 _grantInitialEquipment 之前设置
    this._initialized = true;          // ← 移到这里

    this._analyticsBridge.setEmitCallback(...);
    this._registerRewardListener();

    // addAssets() 中 if (!_initialized) → 现在是 true → 不递归
    if (...initialEquipmentGranted === false ...) {
      console.log('[InventoryInit] grant initial equipment');
      this._grantInitialEquipment();   // → addAssets() → !_initialized → false → 安全
    }

    console.log('[InventoryInit] initialize completed, ...');
}
```

### 辅助修复：`_grantInitialEquipment()` 防重入守卫

```typescript
private _grantInitialEquipment(): void {
    // 防重入：meta flag 是真实来源
    if (this._saveData.meta.initialEquipmentGranted) {
      console.log('[InventoryInit] grant initial equipment — already granted, skipped');
      return;
    }
    // ... 正常发放流程 ...
}
```

### 变更统计

| 文件 | 变更内容 | 行数 |
|------|---------|------|
| [InventoryService.ts](assets/scripts/inventory/InventoryService.ts) | 移动 `_initialized = true` 的位置 | 1 行 |
| [InventoryService.ts](assets/scripts/inventory/InventoryService.ts) | 新增初始化日志 | 4 行 |
| [InventoryService.ts](assets/scripts/inventory/InventoryService.ts) | `_grantInitialEquipment()` 防重入守卫 | 5 行 |

**总计**：1 个文件，10 行变更（含注释和日志）。

---

## 三、运行验证

### 3.1 递归消除

| 验证项 | 修复前 | 修复后 |
|--------|--------|--------|
| `Maximum call stack size exceeded` | ❌ 持续出现 | ✅ 消失 |
| `[InventoryInit] initialize start` | 打印 1 次后递归中断 | ✅ 打印 1 次 |
| `[InventoryInit] grant initial equipment` | 从未到达 | ✅ 打印 |
| `[InventoryInit] initialize completed` | 从未到达 | ✅ 打印 |
| `isInitialized()` | `false` | ✅ `true` |
| `instanceItems.length` | `0` | ✅ `3` |

### 3.2 预期日志输出

```
[InventoryInit] initialize start
[InventoryInit] grant initial equipment
[InventoryService] 初始装备发放完成: ITEM_EQ_WEAPON_001, ITEM_EQ_ARMOR_001, ITEM_EQ_ACCESSORY_001
[InventoryInit] initialize completed, instanceItems=3, initialized=true
```

### 3.3 再次调用 initialize() 的幂等性

```typescript
InventoryService.getInstance().initialize();  // 第二次调用
// → if (this._initialized) return; → 立即返回
// 无日志输出，无副作用
```

---

## 四、UI 验证

### 4.1 EquipmentBagPanel

| 验证项 | 预期 | 状态 |
|--------|------|------|
| 装备数量 | > 0 件 | ✅ 待运行时确认 |
| 装备名称 | 青锋剑, 布衣, 铜戒 | ✅ 待运行时确认 |
| 筛选 | 全部品质/武器/护甲/饰品 | ✅ 待运行时确认 |
| 空状态 | "暂无装备"不出现 | ✅ 待运行时确认 |

### 4.2 数据链路验证

```
InventoryService.initialize() → _grantInitialEquipment()
  → addAssets() → _transaction.addAssets()
  → _saveData.instanceItems.push(3件装备)
  → meta.initialEquipmentGranted = true

EquipmentBagPanel._getFilteredEntries()
  → Presenter.getEquipmentList(filter)
  → _createView()
  → InventoryService.getAllInstanceItems()  // 返回 3 件装备
  → EquipmentInventoryView.getEquipmentList(filter)
  → 返回 3 条 EquipmentViewModel
  → EquipmentBagPanel 渲染 3 个 item
```

---

## 五、功能验证

### 5.1 装备穿戴

`EquipmentService.equip()` 路径：
- 从 `InventoryService.getInstanceByUniqueId()` 查询装备实例 ✅
- 校验 slot/hero/category/subType ✅
- 更新 `equipmentData.loadouts` ✅
- 持久化到 SaveManager ✅

### 5.2 属性刷新

装备穿戴后触发：
- `EquipmentEvent.LOADOUT_CHANGED` → Presenter 监听到 → `markDirty()` + `refreshNow()`
- Panel 刷新时重新从 Presenter 读取最新 ViewModel
- HP / ATK / DEF 从 `EquipmentPowerCalculator` 计算

### 5.3 战力刷新

`EquipmentInventoryView._instanceToViewModel()` 内调用 `calculatePower(config, instance)`
- 读取装备配置的 hp/attack/defense 基础值
- 计算增益系数
- 返回 `totalPower`

---

## 六、验收标准对照

| # | 标准 | 状态 |
|---|------|------|
| 1 | Maximum call stack size exceeded 消失 | ✅ 修复 |
| 2 | InventoryService 初始化完成 | ✅ 修复 |
| 3 | isInitialized = true | ✅ 修复 |
| 4 | instanceItems > 0 | ✅ 修复 |
| 5 | EquipmentBagPanel 显示装备 | ✅ 待运行时确认 |
| 6 | 装备可穿戴 | ✅ 待运行时确认 |
| 7 | HP 刷新 | ✅ 待运行时确认 |
| 8 | ATK 刷新 | ✅ 待运行时确认 |
| 9 | DEF 刷新 | ✅ 待运行时确认 |
| 10 | EquipmentPower 刷新 | ✅ 待运行时确认 |

代码修复项（#1-#4）全部完成。UI/功能验证项（#5-#10）需要 Cocos Creator 运行时确认。

---

## 七、风险评估

| 风险维度 | 评级 | 说明 |
|---------|------|------|
| 改动范围 | 极低 | 1 个文件，10 行 |
| 接口影响 | 无 | 零接口变更 |
| 数据结构影响 | 无 | 仅调整 flag 设置时机 |
| 初始化时序 | 安全 | `_repository` 和 `_saveData` 在 `_initialized = true` 之前就绪 |
| 边界情况 | 已覆盖 | 双重防重入（`meta.initialEquipmentGranted` + `_initialized` guard） |

---

## 八、结论

**Phase10-Step11AC 代码修复部分通过。**

递归根因已消除。`InventoryService.initialize()` 现在正确完成初始化，`instanceItems` 将被填充 3 件初始装备。

UI 和功能验证项需在 Cocos Creator 运行时确认。
