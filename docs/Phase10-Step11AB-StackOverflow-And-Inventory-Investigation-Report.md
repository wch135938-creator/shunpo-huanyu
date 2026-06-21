# Phase10-Step11AB — StackOverflow & Inventory 调查审计报告

**调查时间**：2026-06-11
**调查类型**：纯定位/审计/根因分析（严禁修复）
**前置报告**：`Phase10-Step11AA-Equipment-Reward-Pipeline-Fix-Report.md`

---

## 一、调查任务与结论速查

| # | 调查任务 | 结论 |
|---|---------|------|
| 1 | Inventory 数据审计 | `initialize()` 被调用，但从未完成 |
| 2 | 初始装备发放审计 | `_grantInitialEquipment()` 被调用，但从未完成 |
| 3 | EquipmentBagPanel 数据审计 | 完整链路可达，但数据源为空 |
| 4 | Stack Overflow 根因 | **确认根因**：`initialize()` → `_grantInitialEquipment()` → `addAssets()` → `initialize()` 死循环 |
| 5 | UUID 警告审计 | Editor 级别警告，非运行时问题 |
| 6 | 运行时验证 | 初始化顺序正确，但 InventoryService 初始化进入死循环 |

---

## 二、调查任务1：Inventory 数据审计

### 2.1 调用链确认

`InventoryService.initialize()` 被调用位置：

**[EquipmentMediator.ts:44-47](assets/scripts/ui/EquipmentMediator.ts#L44-L47)**
```typescript
const inventoryService = InventoryService.getInstance();
if (!inventoryService.isInitialized()) {
    inventoryService.initialize();
}
```

**确认：调用发生，仅一次。**

### 2.2 调用时机

- `EquipmentMediator.onLoad()` 在 Cocos 组件生命周期中触发
- 在 `EquipmentService.initialize()` 之前（同一个 onLoad 方法，先 Inventory 后 Equipment）

### 2.3 是否异常中断

**确认：异常中断。**

`initialize()` 进入无限递归，在 `_grantInitialEquipment()` 中异常。详见调查任务4。

### 2.4 `initialize()` 执行路径（逐行追踪）

```text
[InventoryService.initialize()]

Line 114: if (this._initialized) return;
  → _initialized = false → 通过守卫

Line 117: this._repository.initialize();
  → InventoryRepository 初始化成功（注册 27 条物品分类，含 ITEM_EQ_WEAPON_001~004 等）

Line 120-133: 从 SaveManager 获取 SaveContainerV8
  → v8.inventoryData 为默认空数据（新存档）
  → this._saveData = createDefaultInventorySaveData()
      stackItems: []
      instanceItems: []
      currencies: { gold:0, spiritStone:0, diamond:0 }
      meta.initialEquipmentGranted: false

Line 136: this._transaction.bindData(this._saveData);
  → 绑定成功

Line 139-141: 首次初始化发放初始装备
  → this._saveData.meta.initialEquipmentGranted === false ✓
  → this._saveData.instanceItems.length === 0 ✓
  → 进入 this._grantInitialEquipment()                          ← 出问题在这里

Line 143-150: 从未执行（在 _grantInitialEquipment 内部就已递归溢出）
```

---

## 三、调查任务2：初始装备发放审计

### 3.1 INITIAL_EQUIPMENT_ITEM_IDS 验证

**[InventoryDomain.ts:481-485](assets/scripts/inventory/InventoryDomain.ts#L481-L485)**
```typescript
export const INITIAL_EQUIPMENT_ITEM_IDS: string[] = [
  'ITEM_EQ_WEAPON_001',    // 青锋剑 (Common)
  'ITEM_EQ_ARMOR_001',     // 布衣   (Common)
  'ITEM_EQ_ACCESSORY_001', // 铜戒   (Common)
];
```

- 三个 itemId 全部在 `DEFAULT_ITEM_CLASSIFICATION_RULES` 中有注册
- 每个都配置为 `category: 'Equipment'`, `subType: Weapon/Armor/Accessory`, `instancePolicy: 'always_instance'`
- **验证通过：itemId 有效，配置正确。**

### 3.2 InventoryTransaction.addAssets() 能否成功

**[InventoryTransaction.ts:209-308](assets/scripts/inventory/InventoryTransaction.ts#L209-L308)**

正常路径下：
- `_needsInstance('ITEM_EQ_WEAPON_001')` → `InventoryRepository.requiresInstance()` → `true`
- 创建 `InstanceItem`，category=`Equipment`, subType=`Weapon`, quality=0, level=1
- 写入 `this._saveData.instanceItems`
- 生成 `createdUniqueIds`

**事务逻辑本身正确，但从未执行到此处（因递归溢出）。**

### 3.3 instanceItems 实际数量

**0** — 因为 `initialize()` 从未完成，`instanceItems` 始终为空数组。

---

## 四、调查任务4：Stack Overflow 根因定位

### 4.1 真实根因

**代码位置**：

- [InventoryService.ts:299-301](assets/scripts/inventory/InventoryService.ts#L299-L301) — `addAssets()` 中 `if (!this._initialized) { this.initialize(); }`
- [InventoryService.ts:149](assets/scripts/inventory/InventoryService.ts#L149) — `this._initialized = true;` 只在 initialize() 末尾设置
- [InventoryService.ts:139-141](assets/scripts/inventory/InventoryService.ts#L139-L141) — `_grantInitialEquipment()` 在 `_initialized = true` 之前被调用

### 4.2 完整递归调用链

```text
① EquipmentMediator.onLoad()                                     [EquipmentMediator.ts:44]
  └→ InventoryService.initialize()                               [InventoryService.ts:113]
    ├ _initialized === false → 通过守卫
    ├ 加载/创建 SaveData（空数据）
    ├ _grantInitialEquipment()                                    [InventoryService.ts:140]
    │ └→ this.addAssets(...)                                      [InventoryService.ts:190]
    │   ├ if (!this._initialized)                                 [InventoryService.ts:299]
    │   │   _initialized === false                                ← 仍在 initialize() 内部！
    │   │ └→ this.initialize()                                   ← ② 递归进入 initialize()
    │   │     ├ _initialized === false → 通过守卫（关键！）
    │   │     ├ 重新从 SaveManager 读取数据（same data）
    │   │     ├ initialEquipmentGranted === false && instanceItems.length === 0
    │   │     │   → 仍为 true（栈上层的 _grantInitialEquipment 还没设置 flag）
    │   │     ├ _grantInitialEquipment()                          ← ③ 再次进入
    │   │     │ └→ this.addAssets(...)
    │   │     │   ├ if (!this._initialized)                       ← _initialized 仍为 false
    │   │     │   │ └→ this.initialize()                         ← ④ 再次递归
    │   │     │   │     └→ ... 无限递归 → Stack Overflow
    │   │     │   └── ②③④ 无限重复
    │   │     └ _initialized = true                               ← 永远不会被执行到
    │   └── ②③④ 无限重复
    └ _initialized = true                                          ← 永远不会被执行到
```

### 4.3 根因代码

```typescript
// === InventoryService.ts ===

// 问题点 1（Line 293-301）：addAssets() 在未初始化时调用 initialize()
addAssets(...): TransactionResult {
    if (!this._initialized) {
      this.initialize();    // ← 递归引爆点
    }
    ...
}

// 问题点 2（Line 139-141）：initialize() 在设置 _initialized 之前就触发了 addAssets()
initialize(): void {
    if (this._initialized) return;
    ...
    // _initialized 仍然是 false ↓
    if (!this._saveData.meta.initialEquipmentGranted && this._saveData.instanceItems.length === 0) {
      this._grantInitialEquipment();   // ← 间接调用 addAssets() → initialize()
    }
    ...
    this._initialized = true;          // ← 永远到不了这里
}

// 问题点 3（Line 181-207）：_grantInitialEquipment 调用 addAssets
private _grantInitialEquipment(): void {
    ...
    const result = this.addAssets(...);  // ← 触发递归
    ...
}
```

### 4.4 为什么 `consumeAssets()` 也有同样问题

[InventoryService.ts:358-389](assets/scripts/inventory/InventoryService.ts#L363-L365)
```typescript
consumeAssets(...): TransactionResult {
    if (!this._initialized) {
      this.initialize();    // ← 同样的问题！若从 _grantInitialEquipment 以外的路径进入 → 也会递归
    }
    ...
}
```

### 4.5 触发条件

1. `InventoryService.initialize()` 从未成功运行过一次
2. 存档中 `meta.initialEquipmentGranted === false` 且 `instanceItems.length === 0`（任何新存档或未发放初始装备的存档）
3. 任何调用 `addAssets()` / `consumeAssets()` 前未确保 `initialize()` 已完成的路径

**每次新游戏启动 → 100% 触发。**

---

## 五、调查任务3：EquipmentBagPanel 数据审计

### 5.1 完整数据链路

```text
EquipmentBagPanel._getFilteredEntries()                          [EquipmentBagPanel.ts:222]
  └→ EquipmentUIPresenter.getEquipmentList(filter)               [EquipmentUIPresenter.ts:247]
    ├ 检查缓存 → _dirty=true 时缓存失效 → 创建新 View
    └→ _createView()                                             [EquipmentUIPresenter.ts:234]
      ├ this._inventoryService.getAllInstanceItems()             [InventoryService.ts:447]
      │   └→ this._saveData.instanceItems.map(...)               
      │       ↓                                                  ← 此时 instanceItems.length = 0
      │       返回 []                                             ← 空数组！
      ├ this._equipmentService.getEquipmentData()                → loadouts 数据
      └→ new EquipmentInventoryView(allInstances=[], ...)        [EquipmentInventoryView.ts:110]
        └→ view.getEquipmentList(filter)                         [EquipmentInventoryView.ts:138]
          └→ for (const instance of this._allInstances)           ← [] 空循环
            └→ if (instance.category !== 'Equipment') continue
              ...
            └→ list.push(viewModel)
            └→ 最终返回 []                                        ← 空结果！
  └→ Presenter 缓存结果
  └→ EquipmentBagPanel._refreshList()
    ├ viewModels.length === 0
    ├ emptyHintNode.active = true                                ← "暂无装备"
    └→ filterHintLabel.string = "全部品质 · 0 件"                ← 用户看到的
```

### 5.2 链路完整性判定

| 环节 | 状态 | 说明 |
|------|------|------|
| InventoryService | ⚠️ 初始化中断 | `initialize()` 进入死循环 |
| getAllInstanceItems() | ✅ 代码正确 | 返回 `[]` 因为数据为空 |
| EquipmentInventoryView | ✅ 代码正确 | 对的空数据正确产生空结果 |
| EquipmentUIPresenter | ✅ 代码正确 | 正确调用 View |
| EquipmentBagPanel | ✅ 代码正确 | 正确读取 Presenter 数据 |

**结论**：链路代码正确。数据为空是因为 `InventoryService.initialize()` 从未完成 → `instanceItems` 从未被填充。

---

## 六、调查任务5：UUID 警告审计

### 6.1 警告原文

```
层级面板过滤了重复的 UUID 节点
```

### 6.2 来源确认

这是 Cocos Creator 3.x 编辑器的**编辑器级警告**，非运行时警告。

触发场景：
- 场景中两个或多个节点具有相同的 UUID
- 通常由复制粘贴节点产生
- 或者由代码中 `instantiate()` 重复创建同一 Prefab 而未正确管理产生

### 6.3 本项目触发点

可能来源：
1. 场景 `Phase8Main.scene` 被多次修改/恢复，可能残留重复节点引用
2. `/tools/modify-scene.js` 等工具脚本修改场景 JSON 后可能产生 UUID 冲突

### 6.4 是否影响运行

**不影响运行时行为。** 这是编辑器层级面板的渲染过滤逻辑，仅影响编辑器内场景树的显示。

---

## 七、调查任务6：运行时验证

### 7.1 初始化顺序

`EquipmentMediator.onLoad()` 中的初始化顺序：

```typescript
// Line 44-46: 首先初始化 InventoryService
const inventoryService = InventoryService.getInstance();
if (!inventoryService.isInitialized()) {
    inventoryService.initialize();    // ← 在此进入死循环
}

// Line 50-53: 然后初始化 EquipmentService（永远不会执行到这里）
const eqService = EquipmentService.getInstance();
if (!eqService.isInitialized()) {
    eqService.initialize();           // ← 从未执行
}
```

### 7.2 各服务初始化状态

| 服务 | 是否初始化 | 原因 |
|------|-----------|------|
| InventoryService | ❌ 中断 | `initialize()` 进入死循环 |
| EquipmentService | ❌ 未执行 | 在 InventoryService 之后初始化 |
| SaveManager | ✅ 已初始化 | 在更早阶段（GameRoot 或 MainScene）完成 |
| EquipmentConfigRepository | ❓ 未确定 | 通过 `eqService.loadConfigs()` 异步加载，在 `start()` 中调用，但 `start()` 在 `onLoad()` 之后 |

---

## 八、报告必须回答的8个问题

### 1. 为什么 EquipmentBagPanel 仍然显示 0 件？

因为数据源 `InventoryService._saveData.instanceItems` 是空数组 `[]`。

初始化过程中 `_grantInitialEquipment()` 从未成功完成，初始装备从未写入 Inventory。

### 2. 为什么初始装备没有出现？

`InventoryService.initialize()` 在 line 140 调用 `_grantInitialEquipment()`，而 `_grantInitialEquipment()` 调用 `addAssets()`，`addAssets()` 又调用 `initialize()`，形成死循环。

初始装备的 `addAssets()` 调用从未执行到真正的事务处理（`_transaction.addAssets()`），因为在此之前就被 `if (!this._initialized) { this.initialize() }` 的递归调用拦截了。

### 3. instanceItems 实际数量是多少？

**0**（零）。

在 `initialize()` 的 line 139 判定为 0，之后从未被修改（因为递归溢出）。

### 4. InventoryService 是否真的执行？

`initialize()` **开始执行**，但**从未完成**。

执行的步骤：
- ✅ `_repository.initialize()` — 完成
- ✅ 从 SaveManager 加载/创建 SaveData — 完成
- ✅ `_transaction.bindData()` — 完成
- ❌ `_grantInitialEquipment()` — 开始执行，内部递归溢出
- ❌ 后续步骤全部未执行

`isInitialized()` 返回 `false`。

### 5. Maximum call stack size exceeded 的真实根因？

**确认根因**：

代码位置组合：

| 位置 | 代码 | 作用 |
|------|------|------|
| [InventoryService.ts:149](assets/scripts/inventory/InventoryService.ts#L149) | `this._initialized = true;` | 标记初始化完成（在方法末尾） |
| [InventoryService.ts:140](assets/scripts/inventory/InventoryService.ts#L140) | `this._grantInitialEquipment();` | 发放初始装备（在 `_initialized=true` **之前**） |
| [InventoryService.ts:299](assets/scripts/inventory/InventoryService.ts#L299) | `if (!this._initialized) { this.initialize(); }` | 懒初始化保护（在 `_grantInitialEquipment` 调用之后） |

形成闭环：`initialize()` → `_grantInitialEquipment()` → `addAssets()` → `!initialized` → `initialize()` → ...

**致命设计缺陷**：`addAssets()` 和 `consumeAssets()` 内置的懒初始化 (`this.initialize()`) 与 `initialize()` 内部的 `_grantInitialEquipment()` 形成循环依赖。

### 6. 重复 UUID 的真实来源？

这是 Cocos Creator 编辑器级别警告，由场景或 prefab 中的节点 UUID 重复引起。非运行时代码问题。

对于当前问题（EquipmentBagPanel 空）无影响。

### 7. 下一步应该修什么？

**单一根因**：`InventoryService.initialize()` 的死循环。

**推荐修复方案（最小变更）**：

修改 [InventoryService.ts:139-141](assets/scripts/inventory/InventoryService.ts#L139-L141)，在调用 `_grantInitialEquipment()` **之前**设置 `_initialized = true`：

```typescript
initialize(): void {
    if (this._initialized) return;

    // ... (repository init, save data load, transaction bind)

    // Phase10-Step11AA: 首次初始化时发放初始装备
    this._initialized = true;  // ← 移到 _grantInitialEquipment() 之前
    if (!this._saveData.meta.initialEquipmentGranted && this._saveData.instanceItems.length === 0) {
      this._grantInitialEquipment();
    }

    // ... (analytics callback, reward listener)
}
```

**效果**：
- `_grantInitialEquipment()` → `addAssets()` → `if (!this._initialized)` → `_initialized === true` → **不递归**，正常执行事务
- `consumeAssets()` 中的相同保护也生效

### 8. 预计修复风险？

**极低**。

- 改动范围：**1 行**（移动 `this._initialized = true;` 的位置）
- 影响面：仅 InventoryService 初始化流程
- 向后兼容性：不影响任何已有接口
- 副作用风险：`_initialized = true` 先于 `_grantInitialEquipment()` 设置，意味着在初始装备发放期间 `isInitialized()` 返回 `true`。这不影响正确性（因为 `_repository` 和 `_saveData` 已经就绪），只是时序微调。

---

## 九、结论

### 9.1 问题定性

| 维度 | 判定 |
|------|------|
| 问题在代码还是初始化？ | **代码** — `InventoryService.initialize()` 的设计缺陷 |
| 问题在运行时还是配置？ | **运行时** — 递归逻辑错误 |
| 是单一根因还是多重问题？ | **单一根因** — 死循环导致 Inventory 为空，连锁引发装备面板显示为空 |

### 9.2 Phase10-Step11AA 实施报告为何不符？

Phase10-Step11AA 新增的 `_grantInitialEquipment()` 功能逻辑正确，但**触发了一个已存在的设计缺陷**：

- `addAssets()` 中的 `if (!_initialized) { this.initialize() }` 是之前就存在的保护代码
- 当 `initialize()` 是外部首次调用时，这个保护代码与 `_grantInitialEquipment()` 形成了死循环
- 在此前（Step11AA 之前），没有在 `initialize()` 内部调用 `addAssets()` 的路径，所以这个 bug 潜伏未暴露

### 9.3 验收目标确认

🔴 **Phase10-Step11AA 不能验收通过。** 阻断问题已定位，修复后方可重新验收。

---

## 十、附录

### A. 相关文件索引

| 文件 | 关键行号 |
|------|---------|
| [InventoryService.ts](assets/scripts/inventory/InventoryService.ts) | L113-151 (initialize), L181-207 (_grantInitialEquipment), L293-326 (addAssets), L358-389 (consumeAssets) |
| [InventoryTransaction.ts](assets/scripts/inventory/InventoryTransaction.ts) | L209-308 (addAssets 事务逻辑) |
| [InventoryDomain.ts](assets/scripts/inventory/InventoryDomain.ts) | L481-485 (INITIAL_EQUIPMENT_ITEM_IDS), L261-391 (分类规则) |
| [InventorySaveData.ts](assets/scripts/inventory/InventorySaveData.ts) | L97-121 (InventoryMeta, initialEquipmentGranted) |
| [EquipmentMediator.ts](assets/scripts/ui/EquipmentMediator.ts) | L44-58 (初始化入口) |
| [EquipmentBagPanel.ts](assets/scripts/ui/EquipmentBagPanel.ts) | L222-226 (_getFilteredEntries), L284-327 (_refreshList) |
| [EquipmentUIPresenter.ts](assets/scripts/ui/EquipmentUIPresenter.ts) | L234-238 (_createView), L247-260 (getEquipmentList) |
| [EquipmentInventoryView.ts](assets/scripts/equipment/EquipmentInventoryView.ts) | L138-182 (getEquipmentList) |
| [BattleManager.ts](assets/scripts/managers/BattleManager.ts) | L678-725 (_grantEquipReward) |
| [DropSystem.ts](assets/scripts/systems/DropSystem.ts) | L965-1016 (_syncEquipToInventory) |
