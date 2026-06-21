# Phase10-Step11AS Manual Scene Rebuild Report

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
阶段：Phase10-Step11AS — Manual Scene Rebuild  
前置审计：Phase10-Step11AR (Scene Serialization Audit — FAIL)  
执行日期：2026-06-12  
状态：**AUTOMATED STEPS COMPLETE — AWAITING MANUAL EDITOR OPERATIONS**

---

## 0. 执行摘要

Step11AR 审计确认 Step11AQ 程序化生成的 Phase10Main.scene 运行失败，根因是 JSON 拼接无法复现 Cocos Editor 的原生序列化语义（Prefab 节点 `_parent = null`，PrefabInfo/CompPrefabInfo 由脚本猜测生成）。

本阶段 Step11AS 执行了所有可通过代码完成的操作，剩余 Steps 4-9、11 必须在 Cocos Creator 3.8.8 编辑器内手动完成。

---

## 1. 已完成操作

### Step 1 ✅ — 备份失败产物

备份目录：`_scene_repair_backup/step11as/`

| 文件 | 大小 |
|------|------|
| Phase10Main.scene | 193,464 bytes |
| Phase10Main.scene.meta | 180 bytes |
| generate_phase10_scene.js | 29,775 bytes |

### Step 2 ✅ — 隔离生成器

- 原始路径：`_tools/generate_phase10_scene.js`
- 新路径：`_tools/deprecated/generate_phase10_scene.js`
- 文件头已添加 DO NOT USE 警告标记

### Step 3 ✅ — 删除失败场景

已删除：
- `assets/scenes/Phase10Main.scene`
- `assets/scenes/Phase10Main.scene.meta`

备份保留在 `_scene_repair_backup/step11as/`。

### Step 10 ✅ — 清理 Step11 调试日志

清理文件：

| 文件 | 移除内容 |
|------|----------|
| [EquipmentBagPanel.ts](../assets/scripts/ui/EquipmentBagPanel.ts) | 移除 ~25 行：Step11AG_FORCE / Step11AH / Step11AJ / Step11AF 临时日志 |
| [EquipmentItemView.ts](../assets/scripts/ui/EquipmentItemView.ts) | 移除 ~5 行：Step11AG_FORCE / Step11AO / Step11AF 临时日志 |
| [EquipmentMediator.ts](../assets/scripts/ui/EquipmentMediator.ts) | 移除 ~28 行：Step11AI / Step11AJ / Step11AH 临时日志 |

保留：业务错误日志（`console.warn` / `console.error` 含 `[EquipmentBagPanel]` / `[EquipmentMediator]` 标签）。

验证：`grep "Step11AG_FORCE\|Step11AH\|Step11AJ\|Step11AO\|Step11AF\|Step11AI"` 在 `assets/scripts/ui/` 下返回 0 条 log 语句匹配（仅剩 3 条代码注释，已清理 Step11 前缀）。

---

## 2. 待手动完成 — Cocos Creator 编辑器操作

以下步骤 **必须** 在 Cocos Creator 3.8.8 编辑器 GUI 中手动完成，**严禁** 使用脚本生成或 JSON 编辑。

---

### Step 4: 新建场景

```
1. 打开 Cocos Creator 3.8.8
2. 菜单：File → New Scene
3. 保存：Ctrl+S
4. 路径：assets/scenes/Phase10Main.scene
5. 确认场景名称显示为 "Phase10Main"（不是 scene-001）
```

### Step 5: 确认基础结构

新场景默认应包含：

```
Phase10Main
└── Canvas
    └── Camera
```

如果缺少 Canvas 或 Camera，右键创建：

```
右键 Hierarchy → Create → UI Component → Canvas
右键 Canvas → Create → Camera
```

### Step 5b: 创建 UIRoot

```
右键 Canvas → Create → Empty Node
命名为：UIRoot
```

### Step 6: 配置 Portrait

**Canvas：**
```
选中 Canvas
Inspector → UITransform
  Content Size: W=720, H=1280
Position: (360, 640, 0)
```

**Camera：**
```
选中 Camera
Inspector → Camera
  Projection: Orthographic
  Ortho Height: 640
```

**UIRoot：**
```
选中 UIRoot
Inspector → UITransform
  Content Size: W=720, H=1280
Position: (0, 0, 0)
```

### Step 7: 拖入 Prefab

从 **Assets 面板** 依次拖入以下 prefab 到 UIRoot 下：

```
assets/prefabs/panels/EquipmentPanel.prefab    → UIRoot
assets/prefabs/panels/EquipmentBagPanel.prefab   → UIRoot
assets/prefabs/panels/EquipmentDetailPanel.prefab → UIRoot
```

操作方式：
```
1. 在 Assets 面板找到 prefab
2. 鼠标拖拽到 Hierarchy 中的 UIRoot 节点上
3. 确认 Hierarchy 显示：
```

```
UIRoot
├── EquipmentPanel
├── EquipmentBagPanel
└── EquipmentDetailPanel
```

### Step 8: 创建 EquipmentMediator

```
1. 右键 UIRoot → Create → Empty Node
2. 命名为：EquipmentMediator
3. 选中该节点
4. Inspector → Add Component → EquipmentMediator
```

层级应变为：

```
UIRoot
├── EquipmentPanel
├── EquipmentBagPanel
├── EquipmentDetailPanel
└── EquipmentMediator
```

### Step 9: Inspector 绑定

```
1. 选中 EquipmentMediator 节点
2. 在 Inspector 中找到 EquipmentMediator 组件
3. 将 Hierarchy 中的对应节点拖入：

   equipmentPanel ← 拖入 EquipmentPanel 节点
   bagPanel       ← 拖入 EquipmentBagPanel 节点
   detailPanel    ← 拖入 EquipmentDetailPanel 节点

4. 确认三项全部非空（无 "None" 显示）
```

---

### Step 11: 切换 Launch Scene

```
1. 菜单：Project → Project Settings
2. 左侧：General
3. Launch Scene：选择 assets/scenes/Phase10Main.scene
4. 点击保存
5. 按 Ctrl+S 保存场景
```

当前状态（参考）：`profiles/v2/packages/preview.json` 中 `start_scene` 为 Phase8Main.scene uuid (`b5995a61-fbb0-47a0-8ea6-f728a6314036`)。编辑器切换后会自动更新此配置。

---

## 3. 验证清单（请在完成编辑器操作后逐项确认）

### Editor 验收

- [ ] Cocos Creator 可正常打开 Phase10Main.scene
- [ ] Hierarchy 顶部显示 Phase10Main（不是 scene-001）
- [ ] Canvas / Camera / UIRoot 全部可见
- [ ] EquipmentPanel 存在
- [ ] EquipmentBagPanel 存在
- [ ] EquipmentDetailPanel 存在
- [ ] EquipmentMediator 存在
- [ ] EquipmentMediator 三个 Inspector 引用全部非空

### Console 验收（Preview 后检查）

不允许出现：

- [ ] ~~Open scene failed~~ = 0
- [ ] ~~Node has not attached to a scene~~ = 0
- [ ] ~~Cannot read properties of null~~ = 0
- [ ] ~~Maximum call stack size exceeded~~ = 0
- [ ] ~~duplicate UUID~~ = 0
- [ ] ~~Missing Script~~ = 0
- [ ] ~~Step11AG/AH/AJ/AI/AO/AF~~ = 0

### 运行时验收

- [ ] EquipmentPanel 正常显示
- [ ] EquipmentBagPanel 正常打开
- [ ] 装备列表正常显示
- [ ] EquipmentDetailPanel 正常打开
- [ ] 关闭按钮可用
- [ ] Portrait 720×1280 正常
- [ ] 控制台干净（无红字）

### 截图要求

完成以上步骤后，请输出以下截图：

1. **Hierarchy** — 显示完整节点树
2. **EquipmentMediator Inspector** — 显示三项绑定非空
3. **Preview 界面** — EquipmentPanel 正常显示
4. **Console** — 无红字

---

## 4. 当前文件状态

### 备份位置
```
_scene_repair_backup/step11as/
├── Phase10Main.scene          (Step11AQ 失败产物)
├── Phase10Main.scene.meta     (Step11AQ 失败产物)
└── generate_phase10_scene.js  (失败生成器)
```

### 已隔离的生成器
```
_tools/deprecated/generate_phase10_scene.js  (DO NOT USE)
```

### 已清理的源代码
```
assets/scripts/ui/EquipmentBagPanel.ts    ← 无 Step11 调试日志
assets/scripts/ui/EquipmentItemView.ts    ← 无 Step11 调试日志
assets/scripts/ui/EquipmentMediator.ts    ← 无 Step11 调试日志
```

---

## 5. 阶段状态

```text
Step11AQ: 静态验证 PASS / 运行验证 FAIL  ← 已确认
Step11AR: 审计完成                       ← 已确认
Step11AS: 自动化步骤完成                  ← 当前
Step11AS: 编辑器手动操作                  ← 待用户执行
Phase10-Step11 FINAL PASS:               ← 待验收
Phase10-Step12:                          ← 禁止进入（需先通过 Step11）
```

---

## 6. 下一步

用户完成 Cocos Creator 编辑器手动操作（Steps 4-9, 11）并输出验证截图后：

1. 确认所有验收标准通过
2. 标记 Phase10-Step11AS 完成
3. 进入 Phase10-Step11 Final Acceptance
4. 通过后标记 Phase10-Step11 FINAL PASS
5. 允许进入 Phase10-Step12
