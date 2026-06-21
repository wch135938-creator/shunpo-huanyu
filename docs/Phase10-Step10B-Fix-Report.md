# Phase10-Step10B Fix Report

**日期**: 2026-06-06
**版本**: Step10B 修复版

---

## P0 ✅ Portrait 规范修复

### 问题
项目场景 Canvas 使用 `1280 × 720` Landscape 分辨率，Canvas Center `(640, 360)`，违反项目 Portrait `720 × 1280` 规范。

### 修复文件

| 文件 | 修改 |
|------|------|
| `assets/scenes/Phase8Main.scene` | Canvas contentSize: `1280×720 → 720×1280` / Canvas position: `(640,360) → (360,640)` |
| `assets/scene.scene` | Canvas contentSize: `1280×720 → 720×1280` / Canvas position: `(640,360) → (360,640)` |

### 已合规（无需修改）
- `assets/scenes/scene-001.scene`: 720×1280 ✅
- `assets/scenes/BattleTestClean.scene`: 720×1280 ✅

### 说明
- `_deprecated_scene.scene`: 已标记废弃，跳过不修改
- Camera `_orthoHeight` 早已为 640（Portrait 下 designHeight/2 = 1280/2 = 640），无需修改

---

## P1 ✅ EquipmentUI 场景接入修复

### 问题
`Phase8Main.scene` 中 EquipmentMediator 组件的三个面板引用全部为 `null`：
```
equipmentPanel: null
bagPanel: null
detailPanel: null
```

### 修复策略
在 `EquipmentMediator` 中增加**运行时回退加载机制**：编辑器绑定缺失时，自动从 prefab 动态加载面板，确保运行时 `禁止 null`。

### 修改文件
`assets/scripts/ui/EquipmentMediator.ts`

#### 新增导入
```typescript
import { ..., assetManager, Prefab, instantiate, find } from 'cc';
```

#### 新增 Prefab UUID 常量
```typescript
const EQUIPMENT_PANEL_UUID = '8aab8dc9-042c-40cc-b2db-2feca1ffdddd';
const EQUIPMENT_BAG_PANEL_UUID = 'f4d5e6a7-b8c9-0123-defa-234567890123';
const EQUIPMENT_DETAIL_PANEL_UUID = 'a5e6f7b8-c9d0-1234-efab-345678901234';
```

#### 架构变更
```
原流程: start() → 创建 Presenter → 直接绑定面板（可能 null）
新流程: start() → 创建 Presenter → await ensurePanelsLoaded() → connectPanels()
```

#### 新增方法
| 方法 | 职责 |
|------|------|
| `_ensurePanelsLoaded()` | 遍历三个面板引用，null 则从 prefab 加载 |
| `_loadPrefabPanel<T>()` | 通用 prefab 异步加载 → 实例化 → 挂载 Canvas → 返回组件引用 |
| `_connectPanels()` | 从原 `start()` 提取：连接 Presenter + 设置导航回调 |

### 防御策略
- 编辑器绑定优先：非 null 的 panel 跳过动态加载
- 加载失败不影响其他面板：独立 Promise，单个失败不阻塞其余
- Canvas 查找回退：`find('Canvas')` → `this.node.parent` 双重保障
- 组件验证：找不到目标组件时销毁节点并返回 null

---

## P2 ✅ EquipmentPanel.prefab 验证

### 节点清单

| 节点名 | 类型 | 状态 |
|--------|------|------|
| `panelRoot` | Node | ✅ 存在 |
| `slotContainer` | Node (Layout) | ✅ 存在 |
| `hpBonusLabel` | Label | ✅ 存在 (fontSize:40) |
| `atkBonusLabel` | Label | ✅ 存在 (fontSize:40) |
| `defBonusLabel` | Label | ✅ 存在 (fontSize:40) |
| `equipmentPowerLabel` | Label | ✅ 存在 (fontSize:40) |
| `heroIdLabel` | Label | ✅ 存在 (fontSize:40) |
| `closeButton` | Button | ✅ 存在 |

### 组件绑定
配合 `EquipmentPanel.ts` 脚本，所有 8 个 `@property` 声明均有对应的 prefab 节点。组件绑定引用验证通过：
```
panelRoot ↦ __id__ 2 (cc.Node "panelRoot")
slotContainer ↦ __id__ 3 (cc.Node "slotContainer")
hpBonusLabel ↦ __id__ 10 (cc.Label)
atkBonusLabel ↦ __id__ 16 (cc.Label)
defBonusLabel ↦ __id__ 22 (cc.Label)
equipmentPowerLabel ↦ __id__ 28 (cc.Label)
heroIdLabel ↦ __id__ 34 (cc.Label)
closeButton ↦ __id__ 40 (cc.Button)
```

### 结论
**无需重建** — 所有节点真实存在，结构完整。

---

## 变更文件汇总

| 文件 | 优先级 | 变更类型 |
|------|--------|----------|
| `assets/scenes/Phase8Main.scene` | P0, P1 | Canvas 分辨率 + 位置修正 |
| `assets/scene.scene` | P0 | Canvas 分辨率 + 位置修正 |
| `assets/scripts/ui/EquipmentMediator.ts` | P1 | 运行时面板加载回退机制 |

---

## 待编辑器完成事项

以下项需在 Cocos Creator 编辑器中手动完成（代码层面的运行时回退已覆盖）：

1. **Phase8Main.scene** — 将 EquipmentMediator 的三个 `@property` 拖拽绑定到 Canvas 下的面板节点（当前场景中无面板节点，依赖运行时加载）
2. **UIRoot** — Phase8Main.scene 中的 UIRoot 节点 children 为空，建议将动态加载的面板挂载到 UIRoot 下统一管理
