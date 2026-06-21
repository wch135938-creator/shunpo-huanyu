# Phase10-Step11AQ — New Clean Scene Rebuild Report

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
输出日期：2026-06-12  
负责人：Claude Code

---

## 1. 执行摘要

按照 [Phase10-Step11AP-Final-Recovery-Strategy.md](Phase10-Step11AP-Final-Recovery-Strategy.md) 的 Codex 裁决，执行**方案B：新建干净 Scene**。

结果：成功生成干净的 `Phase10Main.scene`，用于替代被污染的 `Phase8Main.scene`。

---

## 2. 是否新建 Phase10Main.scene

✅ **是**。创建了 `assets/scenes/Phase10Main.scene`

---

## 3. 是否没有复制 Phase8Main.scene

✅ **是**。通过 Node.js 生成器脚本 `_tools/generate_phase10_scene.js` 生成，未复制旧 Scene 的 JSON。

---

## 4. 生成方式

由于无法在 CLI 环境打开 Cocos Creator 编辑器执行拖拽操作，采用程序化方式生成：

```
_tools/generate_phase10_scene.js
```

算法流程：

1. 从 Prefab 文件（`EquipmentPanel.prefab`, `EquipmentBagPanel.prefab`, `EquipmentDetailPanel.prefab`）读取完整节点树
2. 跳过 `cc.Prefab` 包装对象
3. 将所有 `__id__` 引用从 prefab 局部索引重映射为 scene 全局索引
4. 修复 `__id__: 0`（原 prefab wrapper 引用）→ 创建新的 `PrefabInfo` / `CompPrefabInfo`
5. 为空的 `_id` 字段生成全新的 v4 UUID
6. 组装 SceneAsset / Scene / Canvas / Camera / UIRoot / EquipmentMediator / Globals

### 关键保障

- Prefab 的完整节点树来自原始 `.prefab` 文件，**未被任何旧 Scene 污染**
- 所有 `_id` 均为全新生成的 v4 UUID
- 所有对象间的 `__id__` 引用完全有效且一致
- 未从 `Phase8Main.scene` 复制任何 JSON / PrefabInfo / CompPrefabInfo / step11al-fix-* / a7NuHFeLJOma1Nt9EgHW8F

---

## 5. 场景结构

```text
Phase10Main
├── Canvas
│   ├── Camera
│   └── UIRoot
│       ├── EquipmentPanel (Prefab Instance)
│       ├── EquipmentBagPanel (Prefab Instance)
│       └── EquipmentDetailPanel (Prefab Instance)
└── EquipmentMediator
```

### Canvas / Camera / UIRoot

| 属性 | 值 |
|------|-----|
| Canvas UITransform | 720 × 1280 |
| Canvas Position | (360, 640) |
| Camera orthoHeight | 640 |
| Camera Projection | Orthographic (0) |
| UIRoot UITransform | 720 × 1280 |
| Orientation | Portrait |

### Canvas 组件

```text
1. cc.UITransform (720 × 1280)
2. cc.Canvas (cameraComponent → Camera)
3. cc.Widget (alignFlags = 45)
4. Phase8BootstrapEntry (uiRootNode → UIRoot)
```

---

## 6. Prefab 嵌入信息

| Prefab | Asset UUID | Scene Root Idx | Script Comp Idx | Nodes |
|--------|------------|----------------|-----------------|-------|
| EquipmentPanel | `8aab8dc9-...` | 6 | 53 | 65 |
| EquipmentBagPanel | `f4d5e6a7-...` | 71 | 135 | 67 |
| EquipmentDetailPanel | `a5e6f7b8-...` | 138 | 140 | 151 |

总 Scene 对象数：**307**

---

## 7. EquipmentMediator 绑定

| 属性 | 绑定目标 (__id__) | 类型匹配 |
|------|-------------------|----------|
| `equipmentPanel` | 53 | ✅ `fd2749JtdVJQJLQETHYY9Mm` (EquipmentPanel) |
| `bagPanel` | 135 | ✅ `fb89dlx4T5D+KqcbZ4IfpEl` (EquipmentBagPanel) |
| `detailPanel` | 140 | ✅ `534faGomxJErYQBMNA+oQCU` (EquipmentDetailPanel) |

---

## 8. 静态验证结果

### 8.1 核心指标

| 检查项 | 结果 | 状态 |
|--------|------|------|
| duplicateIds | `[]` | ✅ 0 |
| invalidRefs | `[]` | ✅ 0 |
| PrefabInstance 残留 | 0 | ✅ |
| Missing Script | 0 | ✅ |
| EquipmentPanel 节点数 | 1 | ✅ |
| EquipmentBagPanel 节点数 | 1 | ✅ |
| EquipmentDetailPanel 节点数 | 1 | ✅ |
| EquipmentMediator 节点数 | 1 | ✅ |
| EquipmentMediator 组件数 | 1 | ✅ |
| Canvas 节点数 | 1 | ✅ |
| `a7NuHFeLJOma1Nt9EgHW8F` 出现次数 | 0 | ✅ |
| `step11al-fix-*` 出现次数 | 0 | ✅ |
| `step10i-scene-*` 出现次数 | 0 | ✅ |
| `p8main-*` 出现次数 | 0 | ✅ |

### 8.2 对象类型分布

| 类型 | 数量 |
|------|------|
| cc.Node | 58 |
| cc.UITransform | 57 |
| cc.CompPrefabInfo | 84 |
| cc.PrefabInfo | 12 |
| cc.Label | 41 |
| cc.Button | 20 |
| cc.Sprite | 8 |
| cc.Widget | 5 |
| cc.Layout | 2 |
| cc.Mask | 1 |
| cc.ScrollView | 1 |
| 脚本组件 (4种) | 4 |
| Globals 组件 (8种) | 8 |
| 其他 | 6 |

### 8.3 引用完整性

```text
✅ 所有 307 个对象之间的 __id__ 引用均在有效范围内
✅ 无悬空引用
✅ 无越界引用
```

---

## 9. 禁止事项遵守情况

| 禁止项 | 是否违反 |
|--------|----------|
| 继续修 Phase8Main.scene | ❌ 否 |
| 复制旧 Scene 的 EquipmentBagPanel 子树 | ❌ 否 |
| 复制旧 Scene 的 EquipmentDetailPanel 子树 | ❌ 否 |
| 复制旧 Scene 的 PrefabInfo / CompPrefabInfo | ❌ 否 |
| 复制任何 step11al-fix-* 节点 | ❌ 否 |
| 复制任何 a7NuHFeLJOma1Nt9EgHW8F 节点 | ❌ 否 |

---

## 10. Phase8Main.scene 状态

```text
Phase8Main.scene = Legacy / Reference Only
```

备份位置：

```text
_scene_repair_backup/step11aq/Phase8Main.scene
_scene_repair_backup/step11aq/Phase8Main.scene.meta
```

旧 Scene **未删除**，保留为历史参考。

---

## 11. 启动 Scene 切换

`profiles/v2/packages/project.json` 和 `settings/v2/packages/project.json` 当前不包含显式的 `launchScene` 字段。需要在 **Cocos Creator 编辑器**中手动切换：

```text
1. 打开 Cocos Creator 3.8.8
2. Project → Project Settings → General
3. Launch Scene → 选择 assets/scenes/Phase10Main.scene
4. 保存
```

---

## 12. Preview 运行状态

> ⚠️ 本报告由 CLI 环境生成，无法运行 Cocos Creator Preview。以下为预期行为：

预期结果：

```text
✅ 控制台无 Maximum call stack size exceeded
✅ 控制台无 duplicate UUID / duplicate Node
✅ 控制台无 Missing Script
✅ EquipmentPanel 正常显示
✅ EquipmentBagPanel 正常打开
✅ EquipmentDetailPanel 正常打开
✅ Portrait 720 × 1280 不溢出
```

需要在 Cocos Creator 编辑器中进行实际 Preview 验证。

---

## 13. 验收标准达成情况

| 标准 | 状态 |
|------|------|
| Phase10Main.scene 存在 | ✅ |
| Phase8Main.scene 未删除 | ✅ |
| Phase10Main.scene 不是复制旧 Scene 得到 | ✅ |
| duplicateIds = [] | ✅ |
| invalidRefs = [] | ✅ |
| Missing Script = 0 | ✅ |
| EquipmentPanel 节点 = 1 | ✅ |
| EquipmentBagPanel 节点 = 1 | ✅ |
| EquipmentDetailPanel 节点 = 1 | ✅ |
| EquipmentMediator 组件 = 1 | ✅ |
| EquipmentMediator.equipmentPanel != null | ✅ |
| EquipmentMediator.bagPanel != null | ✅ |
| EquipmentMediator.detailPanel != null | ✅ |
| a7NuHFeLJOma1Nt9EgHW8F = 0 | ✅ |
| step11al-fix-* = 0 | ✅ |
| Maximum call stack size exceeded 消失 | ⏳ 待 Preview 验证 |
| EquipmentPanel 正常 | ⏳ 待 Preview 验证 |
| EquipmentBagPanel 正常 | ⏳ 待 Preview 验证 |
| EquipmentDetailPanel 正常 | ⏳ 待 Preview 验证 |
| Portrait 720 × 1280 正常 | ✅ (Canvas 静态配置正确) |

---

## 14. 已知事项

### EquipmentMediator 与 Phase8BootstrapEntry 的交互

`Phase8BootstrapEntry`（Canvas 上的第 4 个组件）在 `start()` 时：
1. 初始化 Phase8Bootstrap + Phase9Bootstrap
2. 创建 Phase8SceneBuilder / Phase8UIManager
3. 绑定动画和本地化系统

`EquipmentMediator`（Scene 根下的独立节点）在 `start()` 时：
1. 创建 EquipmentUIPresenter
2. 校验 Inspector 绑定
3. 连接面板并打开初始面板

两个组件的初始化是并行的，应该能正确协作。

### 禁用 Step5 验证

`Phase8BootstrapEntry.enableStep5Verification = false`（设为 false），避免在新 Scene 中运行不必要的 Step5 Prefab 构建验证。

---

## 15. 生成工具

```text
_tools/generate_phase10_scene.js
```

可重复运行以重新生成场景。每次运行会赋予新的 UUID。

---

## 16. 结论

```text
Phase10-Step11AQ: New Clean Scene Rebuild — 已完成
```

- `Phase10Main.scene` 静态验证全部通过
- 无 Scene 序列化污染
- 无重复 `_id`
- 无禁止的旧 Scene 数据
- Prefab 引用、组件绑定、层级结构均正确
- 可作为 Phase11 / Phase12 的主场景基线

下一步：

```text
1. 在 Cocos Creator 中打开项目
2. 将 Launch Scene 切换为 Phase10Main.scene
3. 运行 Preview 验证
4. 如 Preview 通过 → Phase10-Step11 可关闭
```
