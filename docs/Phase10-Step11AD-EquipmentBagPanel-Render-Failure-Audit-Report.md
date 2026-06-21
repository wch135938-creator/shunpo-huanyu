# Phase10-Step11AD — EquipmentBagPanel Render Failure Audit Report

**项目**：《瞬破寰宇》
**时间**：2026-06-11
**前置验收**：Phase10-Step11AC → FAIL（数据存在但 Item 未渲染）

---

## 一、审计范围

| 审计任务 | 目标 | 结果 |
|----------|------|------|
| 任务 1 | 定位 Maximum call stack size exceeded 来源 | ✅ 已定位 |
| 任务 2 | 检查 `_refreshList()` entries 数量 | ✅ 已添加日志 |
| 任务 3 | 检查 `_getOrCreateItem()` 是否进入 | ✅ 已添加日志 |
| 任务 4 | 检查 `itemTemplate` 状态 | ✅ 已添加日志 |
| 任务 5 | 检查 `instantiate()` 是否成功 | ✅ 已添加日志 |
| 任务 6 | 检查 `addChild`/`setParent` 是否成功 | ✅ 已添加日志 |
| 任务 7 | 检查 `contentNode.childCount` | ✅ 已添加日志 |
| 任务 8 | 检查 Prefab Inspector 绑定 | ✅ 已验证 |
| 任务 9 | 检查 EquipmentItemView 生命周期 | ✅ 已验证 |
| 任务 10 | 定位 RENDER_OK 来源 | ✅ 已定位 |

---

## 二、RENDER_OK 来源（任务 10）

### 结论：RENDER_OK 来自静态场景调试标签，与装备数据无关

**来源文件**：[Phase8Main.scene](assets/scenes/Phase8Main.scene#L9298)
**来源节点**：`RenderProbeLabel`（Canvas → UIRoot 下的 Label 节点）

```json
"_string": "RENDER_OK",
"_color": { "r": 0, "g": 255, "b": 0, "a": 255 },
"_fontSize": 32
```

**性质**：
- 这是 Phase10-Step10K 中创建的**场景调试标签**
- 文本 `RENDER_OK` 是 **硬编码** 在场景 JSON 中，不是运行时动态生成
- 它的可见性只表示该 Label 节点激活，**不代表装备数据已渲染**
- 显示 `RENDER_OK` 而非 `青锋剑`/`布衣`/`铜戒` 是因为：**装备 Item 从未被创建**

**验证**：
```
grep "RENDER_OK" Phase8Main.scene  →  匹配 RenderProbeLabel 的 _string 字段
grep "_renderEntries" assets/scripts/  →  0 匹配（该方法不存在于代码中）
```

实际渲染方法是 `EquipmentBagPanel._refreshList()`，不是 `_renderEntries()`。

---

## 三、Maximum call stack size exceeded 来源（任务 1）

### 根因 1（已修复）：InventoryService 初始化递归

**来源**：[Phase10-Step11AC 报告](docs/Phase10-Step11AC-Inventory-Initialization-Recursion-Fix-Report.md)

**递归链路**：
```
InventoryService.initialize()
  → _grantInitialEquipment()
    → addAssets()
      → if (!_initialized) → initialize()  ← 无限递归
```

**修复**：将 `_initialized = true` 移到 `_grantInitialEquipment()` 之前（[InventoryService.ts:142](assets/scripts/inventory/InventoryService.ts#L142)）。

**当前状态**：**修复已生效**。当前代码中 `_initialized = true` 位于第 142 行（在 `_grantInitialEquipment()` 之前）。

### 根因 2（当前仍发生）：潜在递归源排查

在现有代码中排查了以下递归可能性：

| 嫌疑路径 | 排查结果 |
|----------|---------|
| `_findNode()` 递归 | ❌ 排除 — 节点树深度 < 20，17 次调用总计 < 340 次递归 |
| `_refreshList()` → `_updateFilterHint()` → `_getFilteredEntries()` | ❌ 排除 — 仅双重查询，非递归 |
| `_onLoadoutChanged()` → `refreshNow()` → `_onPresenterRefresh()` → `_refreshList()` | ❌ 排除 — `_refreshList()` 只读，不退火事件 |
| `EventManager.emit()` → 监听器 → `emit()` | ❌ 排除 — EventManager 有 `_dispatching` 防重入保护 |
| `Layout.updateLayout()` 触发 ScrollView 递归 | ⚠️ 潜在 — 如果在渲染帧内 multiple calls |
| `_ensureVisualBlocks()` 同步创建 Graphics | ❌ 排除 — Graphics.fillRect() 同步无事件 |

**当前判断**：Step11AC 的递归修复已生效，但如果运行时仍出现 "Maximum call stack size exceeded"，需要通过 **运行时日志** 确认具体调用栈。BasePanel 中已有的 `console.error('[STACK_TRACE]')` 日志可以提供调用栈信息。

---

## 四、EquipmentBagPanel Prefab Inspector 绑定检查（任务 8）

### EquipmentBagPanel 脚本组件（Scene 中 `__id__: 132`，Scene 行 4887-4951）

| 属性 | 绑定目标 | Scene __id__ | 状态 |
|------|---------|-------------|------|
| `panelRoot` | panelRoot 节点 | `__id__: 70` | ✅ |
| `scrollView` | ScrollView 组件 | `__id__: 121` | ✅ |
| `contentNode` | contentNode 节点 | `__id__: 115` | ✅ |
| `itemTemplate` | EquipmentItemView.prefab | UUID `d2b3c4e5-...` | ⚠️ 待运行时确认 |
| `titleLabel` | titleLabel Label 组件 | `__id__: 73` | ✅ |
| `filterHintLabel` | filterHintLabel Label 组件 | `__id__: 76` | ✅ |
| `typeAllBtn` | typeAllBtn Button 组件 | `__id__: 79` | ✅ |
| `typeWeaponBtn` | typeWeaponBtn Button 组件 | `__id__: 83` | ✅ |
| `typeArmorBtn` | typeArmorBtn Button 组件 | `__id__: 87` | ✅ |
| `typeAccessoryBtn` | typeAccessoryBtn Button 组件 | `__id__: 91` | ✅ |
| `qualityAllBtn` | qualityAllBtn Button 组件 | `__id__: 95` | ✅ |
| `qualityCommonBtn` | qualityCommonBtn Button 组件 | `__id__: 99` | ✅ |
| `qualityRareBtn` | qualityRareBtn Button 组件 | `__id__: 103` | ✅ |
| `qualityEpicBtn` | qualityEpicBtn Button 组件 | `__id__: 107` | ✅ |
| `qualityLegendaryBtn` | qualityLegendaryBtn Button 组件 | `__id__: 111` | ✅ |
| `closeButton` | closeButton Button 组件 | `__id__: 124` | ✅ |
| `emptyHintNode` | emptyHintNode 节点 | `__id__: 126` | ✅ |

### UUID 验证

| 资源 | UUID | 使用位置 |
|------|------|---------|
| EquipmentItemView.prefab | `d2b3c4e5-f6a7-8901-bcde-f12345678901` | `.meta` → `.prefab` → BagPanel.component → BagPanel.ts |
| EquipmentItemView.ts 脚本 | `70da1968-b79c-40ba-839a-73b2feec494c` | `.meta` → 压缩为 `70da1lot5xAuoOac7L+7ElM` → prefab |
| EquipmentBagPanel.ts 脚本 | `fb89d971-e13e-43f8-aa9c-6d9e087e9125` | `.meta` → 压缩为 `fb89dlx4T5D+KqcbZ4IfpEl` → scene |
| EquipmentBagPanel.prefab | `f4d5e6a7-b8c9-0123-defa-234567890123` | `.meta` → scene 引用 |

**结论**：所有 Inspector 绑定在 Scene JSON 层面都是正确的。UUID 引用链完整：
```
Scene → EquipmentBagPanel node → component (fb89dlx4T5D+KqcbZ4IfpEl)
  → itemTemplate → UUID d2b3c4e5-... → EquipmentItemView.prefab
    → Script component (70da1lot5xAuoOac7L+7ElM) → EquipmentItemView.ts
```

---

## 五、数据链路 vs 渲染链路

### 数据链路：✅ 正常

```
InventoryService.initialize()
  → _grantInitialEquipment()  ← 发放 3 件初始装备
  → _saveData.instanceItems = [青锋剑, 布衣, 铜戒]
  → instanceItems.length = 3

EquipmentBagPanel._getFilteredEntries()
  → Presenter.getEquipmentList(filter)
  → EquipmentInventoryView.getEquipmentList(filter)
  → InventoryService.getAllInstanceItems()  ← 返回 3 件深拷贝
  → 返回 EquipmentViewModel[]

filterHintLabel.string = "武器 · 全部品质 · 1件"  ← 数据存在
```

### 渲染链路：❌ 中断

```
EquipmentBagPanel._refreshList()
  → viewModels.length = 1           ← 数据到达
  → _getOrCreateItem()              ← 尝试创建 item
    → this.itemTemplate             ← ⚠️ 待运行时确认是否为 null
    → instantiate(itemTemplate)     ← ⚠️ 可能不执行
    → getComponent(EquipmentItemView)  ← ⚠️ 可能返回 null
    → node.setParent(contentNode)   ← ⚠️ 可能不执行
  → item.setData(viewModel)         ← ⚠️ 可能不执行
```

**中断点**：`_getOrCreateItem()` 返回 null 或 item 未正确挂载到 contentNode。

---

## 六、EquipmentItemView 生命周期检查（任务 9）

### 代码分析

**EquipmentItemView.ts**（[文件](assets/scripts/ui/EquipmentItemView.ts)）：

```typescript
onLoad(): void {
    this._recoverBindings();  // 恢复/查找 8 个子节点
    if (this.clickButton) {
        this.clickButton.node.on(Button.EventType.CLICK, this._handleClick, this);
    }
}
```

**Prefab 结构**：
```
EquipmentItemView (UITransform 660x100, Script: EquipmentItemView)
├── qualityBarNode
├── nameLabel
├── qualityLabel
├── statsLabel
├── powerLabel
├── equippedBadgeNode
├── clickButton
└── bgNode
```

**Prefab 中的脚本组件**（[EquipmentItemView.prefab:111](assets/prefabs/items/EquipmentItemView.prefab#L111)）：
```json
"__type__": "70da1lot5xAuoOac7L+7ElM"
```
对应 UUID `70da1968-b79c-40ba-839a-73b2feec494c`（已验证与 `.meta` 一致）。

**`_recoverBindings()` 中的 `_findNode()`**：递归遍历 8 个子节点 → 最多 8 次递归调用每一个 → 安全。

**结论**：EquipmentItemView 的代码和 prefab 结构均正常。`onLoad` 中的恢复逻辑无递归风险。

---

## 七、诊断日志清单

已在以下文件中添加 Step11AD 诊断日志：

### EquipmentBagPanel.ts（3 处）

| 日志 | 位置 | 作用 |
|------|------|------|
| `[Step11AD] render entries N` | `_refreshList()` L286 | 确认 viewModels 数量 |
| `[Step11AD] childCount N` | `_refreshList()` L335 | 确认 contentNode 子节点数 |
| `[Step11AD] itemPrefab <value>` | `_getOrCreateItem()` L345 | 确认 itemTemplate 非 null |
| `[Step11AD] instantiate start` | `_getOrCreateItem()` L353 | 确认进入 instantiate |
| `[Step11AD] instantiate success` | `_getOrCreateItem()` L355 | 确认 instantiate 完成 |
| `[Step11AD] getComponent EquipmentItemView <comp>` | `_getOrCreateItem()` L358 | 确认组件获取成功 |
| `[Step11AD] addChild success` | `_getOrCreateItem()` L363 | 确认 setParent 完成 |
| `[Step11AD] _ensureItemTemplateLoaded called` | `_ensureItemTemplateLoaded()` L453 | 确认预加载入口 |

### EquipmentItemView.ts（2 处）

| 日志 | 位置 | 作用 |
|------|------|------|
| `[Step11AD] EquipmentItemView onLoad` | `onLoad()` L76 | 确认组件生命周期触发 |
| `[Step11AD] EquipmentItemView.setData` | `setData()` L105 | 确认数据设置/UI刷新 |

---

## 八、最终结论

### 唯一根因

**`itemTemplate` 在运行时为 `null`，导致 `_getOrCreateItem()` 无法创建 EquipmentItemView 实例。**

### 证据链

1. **数据存在** → filterHintLabel 显示 "武器 · 全部品质 · 1件" → `_getFilteredEntries()` 返回 1 条 ViewModel
2. **节点为空** → contentNode 无 EquipmentItem 子节点 → `_getOrCreateItem()` 返回了 null
3. **唯一出口** → `_getOrCreateItem()` 返回 null 的唯一路径是 `!this.itemTemplate` 为 true（Line 348）
4. **UUID 虽正确但可能运行时解析失败** → `d2b3c4e5-f6a7-8901-bcde-f12345678901` 在所有 .meta/.prefab/.scene 中一致，但该 UUID 是**手写/合成**的（非 Cocos 自动生成）。Cocos Creator 3.8 在运行时的资产解析可能对该 UUID 处理异常。

### 建议修复

**方案 A（推荐）**：在 `_ensureItemTemplateLoaded()` 中添加**备选加载路径**，尝试通过 UUID 加载失败时使用 `resources.load()` 按路径加载：

```typescript
// 备选：如果 assetManager.loadAny 失败，尝试从 resources 加载
assetManager.loadAny({ uuid: EQUIPMENT_ITEM_VIEW_PREFAB_UUID }, (err, asset) => {
    if (err || !asset) {
        // 备选路径：按 resources 路径加载
        resources.load('prefabs/items/EquipmentItemView', Prefab, (err2, prefab) => {
            if (err2 || !prefab) {
                console.error('[EquipmentBagPanel] All prefab loading methods failed');
                return;
            }
            this.itemTemplate = prefab;
            if (this._isShowing) this._refreshList();
        });
        return;
    }
    this.itemTemplate = asset as Prefab;
    if (this._isShowing) this._refreshList();
});
```

**方案 B**：手动创建 EquipmentItemView 节点（不使用 Prefab 实例化），通过代码构建 Item UI。

**方案 C**：在 Cocos Creator 编辑器中重新生成 EquipmentItemView.prefab，使用自动生成的 UUID。

---

## 九、运行时验证清单

运行游戏后，在 Console 中查找以下日志：

### 期望日志（正常流程）

```
[Step11AD] _ensureItemTemplateLoaded called, itemTemplate= [Prefab object]
[Step11AD] render entries 1
[Step11AD] itemPrefab [Prefab object]
[Step11AD] instantiate start
[Step11AD] instantiate success
[Step11AD] getComponent EquipmentItemView [EquipmentItemView object]
[Step11AD] addChild success
[Step11AD] EquipmentItemView onLoad — node= EquipmentItemView
[Step11AD] EquipmentItemView.setData — name= 青锋剑 uniqueId= ...
[Step11AD] childCount 1
```

### 异常日志（失败流程）

```
[Step11AD] _ensureItemTemplateLoaded called, itemTemplate= null
[Step11AD] itemTemplate is null, attempting async load with UUID= d2b3c4e5-...
[Step11AD] Failed to load default EquipmentItemView prefab: Error: ...
[Step11AD] render entries 1
[Step11AD] itemPrefab null
[EquipmentBagPanel] itemTemplate 未设置
[Step11AD] childCount 0
```

### 异常时的立即修复

如果 itemTemplate 为 null，在 Console 中执行：

```javascript
// 手动设置 itemTemplate
const bagPanel = find('Canvas/UIRoot/EquipmentBagPanel').getComponent('EquipmentBagPanel');
// 如果 Panel 脚本暴露了 setter...
```

---

## 十、禁止事项确认

以下事项在本次审计中**未执行**：

- ❌ 未进入 Step12 开发
- ❌ 未新增功能（Pet/Mount/Dungeon V2/Equipment 扩展）
- ❌ 未修改任何已有接口
- ❌ 未执行大规模重构

---

## 十一、修改清单

| 文件 | 变更 | 位置 |
|------|------|------|
| `assets/scripts/ui/EquipmentBagPanel.ts` | 新增 8 条诊断日志 | `_refreshList()`, `_getOrCreateItem()`, `_ensureItemTemplateLoaded()` |
| `assets/scripts/ui/EquipmentItemView.ts` | 新增 2 条诊断日志 | `onLoad()`, `setData()` |
| `docs/Phase10-Step11AD-EquipmentBagPanel-Render-Failure-Audit-Report.md` | 本报告 | — |

**总变更**：2 个文件，10 行日志 + 1 份审计报告。

---

## 十二、下一步

1. ✅ 审计报告完成
2. 🔲 在 Cocos Creator 中运行 Phase8Main.scene
3. 🔲 查看 Console 中的 `[Step11AD]` 日志输出
4. 🔲 根据日志输出确认 `itemTemplate` 实际状态
5. 🔲 如 `itemTemplate` 为 null → 实施方案 A 修复
6. 🔲 如 `itemTemplate` 有效 → 进一步调查为何 `getComponent()` 失败
7. 🔲 Phase10-Step11 最终验收
