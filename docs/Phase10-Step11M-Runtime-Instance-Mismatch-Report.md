# Phase10-Step11M Runtime Instance Mismatch Report

**日期**: 2026-06-08
**Phase**: Phase10-Step11M
**状态**: 诊断日志已添加，待运行时验证

---

## 问题

UI 已显示但 `[EquipmentBagPanel] open` / `[EquipmentBagPanel] _ensureInit` 日志完全不存在。

---

## 调查范围

### 1. 源代码验证

| 文件 | Step11K 状态 |
|------|-------------|
| `assets/scripts/ui/EquipmentBagPanel.ts` | ✅ `_initialized` L103, `_ensureInit()` L187, `open()` L145 调用 `_ensureInit()` |
| `assets/scripts/ui/EquipmentDetailPanel.ts` | ✅ `_initialized` L122, `_ensureInit()` L197, `open()` L159 调用 `_ensureInit()` |

### 2. UUID 链验证

| 环节 | UUID | 状态 |
|------|------|------|
| EquipmentBagPanel.ts.meta | `fb89d971-e13e-43f8-aa9c-6d9e087e9125` | — |
| EquipmentBagPanel.prefab 组件类型 | `fb89dlx4T5D+KqcbZ4IfpEl` (压缩) | ✅ 匹配 |
| EquipmentDetailPanel.ts.meta | `534fa1a8-9b12-44ad-8401-30d03ea10094` | — |
| EquipmentDetailPanel.prefab 组件类型 | `534faGomxJErYQBMNA+oQCU` (压缩) | ✅ 匹配 |
| EquipmentMediator.ts.meta | `679c94f0-3c9c-4535-b906-acd9a97076eb` | — |
| Phase8Main.scene Mediator 组件类型 | `679c9TwPJxFNbkGrNmpcHbr` (压缩) | ✅ 匹配 |

### 3. Prefab 文件检查

| Prefab 路径 | 存在 | 内容 |
|------------|------|------|
| `assets/prefabs/panels/EquipmentBagPanel.prefab` | ✅ | 含完整子节点树，组件类型正确 |
| `assets/prefabs/panels/EquipmentBagPanel.prefab.backup.Step10M` | ✅ | 旧备份（不会被加载，无 `.prefab` 后缀） |
| `assets/prefabs/panels/EquipmentDetailPanel.prefab` | ✅ | 含完整子节点树，组件类型正确 |

### 4. 场景文件分析

**EquipmentBagPanel 场景节点**（`Phase8Main.scene` L1934-1989）:
- `_active`: `false` — 初始隐藏
- `_prefab`: `__id__: 138` → PrefabInfo，指向 `EquipmentBagPanel.prefab`
- 组件 ID 136 = EquipmentBagPanel 脚本（被 Mediator 引用）

**EquipmentDetailPanel 场景节点**（L5058-5113）:
- `_active`: `false` — 初始隐藏
- `_prefab`: `__id__: 248` → PrefabInfo，指向 `EquipmentDetailPanel.prefab`
- 组件 ID 225 = EquipmentDetailPanel 脚本（被 Mediator 引用）

**EquipmentMediator 场景节点**（L9360-9450）:
- `equipmentPanel`: `__id__: 67` → EquipmentPanel 组件
- `bagPanel`: `__id__: 136` → EquipmentBagPanel 组件（场景节点上的脚本）
- `detailPanel`: `__id__: 225` → EquipmentDetailPanel 组件（场景节点上的脚本）
- **所有三个面板均通过编辑器绑定**，`_ensurePanelsLoaded()` 会跳过动态加载

### 5. 编译产物验证

**编译输出**: `temp/programming/packer-driver/targets/preview/chunks/4b/4b51c58a...js`

编译后的 JavaScript **包含完整的 Step11K 代码**:
```javascript
this._initialized = false;                                                // L202
console.log('[EquipmentBagPanel] open — heroId=', ...);                  // L244
this._ensureInit();                                                      // L246

_ensureInit() {
  if (this._initialized) return;
  this._initialized = true;
  console.log('[EquipmentBagPanel] _ensureInit — 首次初始化开始');      // L292
  this._recoverBindings();
  // ...
}
```

**结论：TypeScript 已正确编译，Step11K 代码在运行时 JS 中存在。**

---

## 完整调用链

```
用户点击 EquipmentPanel 槽位
  ↓
EquipmentPanel._onSlotClick(slotId)
  ↓ 回调
EquipmentMediator._openBagPanel(slotId)    ← 已添加诊断日志
  ↓
this.bagPanel.open(heroId, slotId)         ← 应触发 [EquipmentBagPanel] open 日志
  ↓
EquipmentBagPanel._ensureInit()            ← 应触发 [EquipmentBagPanel] _ensureInit 日志
  ↓
_recoverBindings() → _bindEvents() → _ensureVisualBlocks()
  ↓
this.show()
```

---

## 已添加诊断日志

### EquipmentMediator.ts 修改

| 方法 | 新增日志 |
|------|---------|
| `start()` | 面板引用状态（constructor.name）加载前后对比 |
| `_ensurePanelsLoaded()` | 每个面板的编辑器绑定状态 |
| `_loadPrefabPanel()` | uuid / asset / node / component / `_ensureInit` 类型 / `_initialized` 值 |
| `_openBagPanel()` | bagPanel ref / constructor.name / node.name / node.active / `_initialized` / `typeof _ensureInit` / `typeof open` / open() 调用前后 |
| `_openDetailPanel()` | detailPanel ref / constructor.name / `typeof open` / `typeof _ensureInit` / open() 调用前后 |

---

## 根因假设（待运行时确认）

### 假设 A：编译缓存（已排除） ❌

已验证：`temp/programming/.../4b51c58a...js` 包含完整 Step11K 代码。

### 假设 B：场景节点未通过 open() 激活 ⚠️ 最可能

场景节点 `_active: false`，如果绕过 Mediator 直接将 `node.active = true`，则：
- UI 会显示 ✅（匹配现象）
- `open()` 不会被调用 ✅（匹配现象）
- `_ensureInit()` 不会执行 ✅（匹配现象）
- 按钮事件不会注册 ✅（匹配现象）

### 假设 C：Mediator 回调链断裂

EquipmentPanel 的槽位点击回调可能未正确触发，导致 `_openBagPanel` 从未被调用。

### 假设 D：Constructor name 不匹配

如果运行时 `bagPanel.constructor.name` 不是 `EquipmentBagPanel`，说明挂载了不同的组件。

---

## 下一步：运行时验证

1. 在 Cocos Creator 中打开项目
2. 等待编译完成（观察 Console 无报错）
3. 运行预览
4. 观察 Console 中 `[EquipmentMediator]` 开头的日志：
   - `start` 中的面板引用状态
   - `_openBagPanel` 是否被调用
   - `bagPanel.constructor.name` 的值
   - `typeof bagPanel.open` 和 `typeof bagPanel._ensureInit`
5. 截图所有 `[EquipmentMediator]` 日志
6. 对比：如果 `[EquipmentMediator]` 日志出现但 `[EquipmentBagPanel]` 日志不出现，则假设 D 成立

---

## 已修改文件

| 文件 | 修改方式 |
|------|---------|
| `assets/scripts/ui/EquipmentMediator.ts` | 添加诊断日志（5 个方法） |

---

## 最终结论

**代码和编译产物均正确。** Step11K 代码存在于运行时 JS 中。

问题在于：**运行时显示的 UI 可能不是通过 `open()` 方法激活的，或者挂载的组件类型不匹配。**

诊断日志将在运行时揭示确切原因。
