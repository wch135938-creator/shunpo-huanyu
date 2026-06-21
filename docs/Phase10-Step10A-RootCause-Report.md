# Phase10-Step10A 阻塞问题根因报告

项目：《瞬破寰宇》  
阶段：Phase10-Step10A — 阻塞问题排查  
日期：2026-06-06  
状态：**根因已定位，未修改代码**

---

## 问题概览

| # | 问题 | 根因 | 修复方向 |
|---|------|------|----------|
| 1 | Prefab 子节点在编辑器中不可见 | Prefab JSON 结构与 Step8 规格严重偏离 | 在编辑器中重建 Prefab |
| 2 | EquipmentUI 未接入运行场景 | Mediator 存在但 3 个 Panel 引用全为 null | 实例化 3 个 Prefab 并绑定 |
| 3 | 预览 1280×720 横版 | Canvas 和场景均硬编码为 1280×720 横版 | 编辑器修改 + 所有场景同步 |

---

## 问题 1：EquipmentPanel.prefab 子节点不可见

### 1.1 用户观察到的问题

打开 `assets/prefabs/panels/EquipmentPanel.prefab`，层级面板只显示：

```
EquipmentPanel
└── panelRoot
```

缺少以下 7 个节点：
`slotContainer`, `hpBonusLabel`, `atkBonusLabel`, `defBonusLabel`, `equipmentPowerLabel`, `heroIdLabel`, `closeButton`

### 1.2 文件实际内容

直接读取 `EquipmentPanel.prefab` JSON 文件（1291 行），确认 **7 个子节点全部存在于 JSON 中**：

```
panelRoot (__id__: 2) 的子节点：
  __id__ 3  → slotContainer (Node + UITransform)
  __id__ 7  → hpBonusLabel (Node + UITransform + Label)
  __id__ 13 → atkBonusLabel (Node + UITransform + Label)
  __id__ 19 → defBonusLabel (Node + UITransform + Label)
  __id__ 25 → equipmentPowerLabel (Node + UITransform + Label)
  __id__ 31 → heroIdLabel (Node + UITransform + Label)
  __id__ 37 → closeButton (Node + UITransform + Button)
```

EquipmentPanel 脚本组件的 @property 绑定也全部正确引用了这些节点：
- `slotContainer` → __id__ 3 ✅
- `hpBonusLabel` → __id__ 10 (Label 组件 on Node __id__ 7) ✅
- `atkBonusLabel` → __id__ 16 (Label 组件 on Node __id__ 13) ✅
- `defBonusLabel` → __id__ 22 (Label 组件 on Node __id__ 19) ✅
- `equipmentPowerLabel` → __id__ 28 (Label 组件 on Node __id__ 25) ✅
- `heroIdLabel` → __id__ 34 (Label 组件 on Node __id__ 31) ✅
- `closeButton` → __id__ 40 (Button 组件 on Node __id__ 37) ✅

### 1.3 与 Step8 重建规格的偏差

对比 `Phase10-Step8-Rebuild-Prefabs-Report.md` 中记录的规格，当前文件存在显著偏差：

| 项目 | Step8 规格 | 当前文件 | 偏差 |
|------|-----------|----------|------|
| Root UITransform.contentSize | **720×1280** | 100×100 | ❌ 严重 |
| panelRoot UITransform.contentSize | **720×700** | 100×100 | ❌ 严重 |
| Root Widget 组件 | **存在** (全屏对齐 alignFlags:45) | **不存在** | ❌ 缺失 |
| slotContainer UITransform | **680×420** (Grid Layout) | 100×100 (仅 UITransform, 无 Layout) | ❌ 严重 |
| closeButton UITransform | **60×60** ("✕") | 100×100 (仅 Button, 无 Label) | ❌ 严重 |
| 脚本 UUID 格式 | **未压缩** `fd274f49-b5d5-...` | **压缩** `fd2749JtdVJQ...` | ⚠ 格式不同 |
| Git 状态 | 新创建 | **从未提交** (untracked) | ⚠ 无历史 |

> **关键发现**: 对比同项目中**工作正常**的 `ArtifactPanel.prefab`，其脚本 UUID 使用**未压缩格式** (`d98e5d31-dc7b-4da0-99cd-682176020024`)。而 Equipment 系列 Prefab 使用**压缩格式**。这可能导致 Cocos Creator 在解析脚本引用时行为不一致。

### 1.4 根因判断

**根因**: Step8 程序化生成的 Prefab JSON 在 Cocos Creator 编辑器首次打开后被**重新序列化**，导致了以下连锁反应：

1. **格式退化**: 所有未显式设置的 UITransform 尺寸被重置为 100×100 (cc.Size 默认值)
2. **组件丢失**: Widget 组件在序列化过程中被丢弃（因引用格式差异）
3. **Layout 丢失**: slotContainer 的 Layout 组件信息丢失
4. **编辑器缓存不一致**: AssetDB 中缓存的导入版本可能与磁盘文件不同步

**为什么子节点在 JSON 中存在但编辑器不显示**:
- 当 Cocos Creator 解析 Prefab 时，如果脚本组件反序列化失败（UUID 格式不匹配、脚本编译错误等），编辑器可能进入**安全回退模式**，仅显示基础 Node 层级
- 子节点数据完整但编辑器 UI 树渲染被截断

**待验证的假设**:
- Cocos Creator 控制台可能有 "Missing script" 或 "Cannot deserialize component" 警告
- 重新导入资源（AssetDB 刷新）可能恢复显示

### 1.5 修复方向

1. **在 Cocos Creator 编辑器中重建** EquipmentPanel.prefab（不能程序化生成，编辑器会重新序列化）
2. 创建符合 Step8 规格的节点层级和组件
3. 保存后立即提交 Git（防止再次丢失）

---

## 问题 2：EquipmentUI 未接入当前运行场景

### 2.1 用户观察到的问题

Preview 画面只显示 "label"，装备 UI 完全不出现。

### 2.2 场景中的实际状态

#### 三个 Scene 的 Equipment 相关节点

| Scene | EquipmentMediator | EquipmentPanel | EquipmentBagPanel | EquipmentDetailPanel |
|-------|:---:|:---:|:---:|:---:|
| scene-001 | ❌ | ❌ | ❌ | ❌ |
| BattleTestClean | ❌ | ❌ | ❌ | ❌ |
| **Phase8Main** | ✅ 存在 | ❌ 不存在 | ❌ 不存在 | ❌ 不存在 |

#### EquipmentMediator 节点详情（Phase8Main.scene）

```
Scene: Phase8Main
├── Canvas (1280×720)
│   └── Camera
├── EquipmentMediator  ← 节点存在，但无子节点
│   ├── cc.UITransform (100×100)
│   └── EquipmentMediator 组件:
│       equipmentPanel: null   ← 未绑定
│       bagPanel:       null   ← 未绑定
│       detailPanel:    null   ← 未绑定
├── GrowthDebugRoot
└── (其他节点)
```

EquipmentMediator **节点已挂载**到 Phase8Main.scene，但三个 @property 引用全部为 `null`。

### 2.3 UI 启动链路（当前实际 vs 期望）

#### 当前实际链路

```
Phase8Main.scene 加载
  └── EquipmentMediator.onLoad()
        ├── EquipmentService.init()  ✅ 执行
        ├── loadConfigs()            ✅ Step9 新增，异步加载配置
        └── start()
              ├── this._presenter = new EquipmentUIPresenter(...)  ✅ Presenter 创建
              ├── equipmentPanel?.setPresenter(this._presenter)     ❌ null?. → 跳过
              ├── bagPanel?.setPresenter(this._presenter)           ❌ null?. → 跳过
              ├── detailPanel?.setPresenter(this._presenter)        ❌ null?. → 跳过
              ├── equipmentPanel?.setOpenBagCallback(...)           ❌ null?. → 跳过
              ├── equipmentPanel?.setOpenDetailCallback(...)        ❌ null?. → 跳过
              ├── bagPanel?.setItemClickCallback(...)               ❌ null?. → 跳过
              └── detailPanel?.setCloseCallback(...)                ❌ null?. → 跳过

结果: 所有 UI 面板连接静默失效，装备界面永远不显示
```

#### 期望链路

```
Phase8Main.scene 加载
  └── EquipmentMediator 节点
        ├── EquipmentPanel Prefab 实例 (equipmentPanel @property 已绑定)
        ├── EquipmentBagPanel Prefab 实例 (bagPanel @property 已绑定)
        └── EquipmentDetailPanel Prefab 实例 (detailPanel @property 已绑定)
              │
              └── start() → 3 个 Panel 全部接收 Presenter → UI 正常显示
```

### 2.4 为什么 Preview 只显示 "label"

当前运行的场景（scene-001 或 BattleTestClean）不包含任何 Equipment 节点。`_alignCanvasWithScreen: true` 意味着 Cocos Creator 使用默认设计分辨率 1280×720 显示一个空画布。"label" 文字可能来自场景中残留的测试 Label 节点或 Canvas 默认子节点。

### 2.5 根因判断

**根因**: EquipmentMediator 是 Step9 期间手动添加到 Phase8Main.scene 的，但**三个 Panel Prefab 从未在该场景中实例化并绑定**。代码层面所有连接使用 `?.` 安全调用，不会报错，但全部静默失效。

关键证据：
- [Phase8Main.scene:685-687] — `equipmentPanel: null, bagPanel: null, detailPanel: null`
- [Phase8Main.scene:613] — EquipmentMediator 节点 `_children: []`（无子节点）
- EquipmentPanel/BagPanel/DetailPanel 三个 Prefab **均未在任何 Scene 中被引用**

### 2.6 修复方向

在 Phase8Main.scene 中的 EquipmentMediator 节点下：
1. 实例化 EquipmentPanel.prefab → 拖入 `equipmentPanel` @property
2. 实例化 EquipmentBagPanel.prefab → 拖入 `bagPanel` @property
3. 实例化 EquipmentDetailPanel.prefab → 拖入 `detailPanel` @property
4. 三个 Panel 初始设为非 active（由 Mediator 控制显示/隐藏）

或者：运行时由 Mediator 代码动态 instantiate 三个 Prefab（需要额外的 `@property panelPrefab: Prefab` 字段）。

---

## 问题 3：Canvas 设置为 1280×720 横版

### 3.1 用户观察到的问题

Preview 显示 1280×720（横版），项目规范要求 720×1280（竖版/Portrait）。

### 3.2 实测数据

#### Phase8Main.scene

| 属性 | 当前值 | 期望值 |
|------|--------|--------|
| Canvas UITransform.contentSize.width | **1280** | **720** |
| Canvas UITransform.contentSize.height | **720** | **1280** |
| Canvas 节点位置 | **(640, 360)** | **(360, 640)** |
| Camera orthoHeight | **640** | **360** |
| `_alignCanvasWithScreen` | **false** | **true** |

```
[Phase8Main.scene:227-231]
"_contentSize": {
  "width": 1280,   ← 错误：应该是 720
  "height": 720     ← 错误：应该是 1280
}

[Phase8Main.scene:97-102]
"_lpos": {
  "x": 640,   ← Canvas 中心在横版中心
  "y": 360,   ← Canvas 中心在横版中心
  "z": 0
}
```

#### scene-001.scene & BattleTestClean.scene

这两个场景使用 `_alignCanvasWithScreen: true`，依赖项目默认设计分辨率。但**项目设置中未配置任何设计分辨率**：

| 配置文件 | 预期包含 | 实际内容 |
|----------|---------|---------|
| `settings/v2/packages/project.json` | designResolution | `{"__version__": "1.0.6"}` (空) |
| `profiles/v2/packages/project.json` | designResolution | `{"__version__": "1.0.6"}` (空) |
| `profiles/v2/packages/device.json` | orientation | `{"__version__": "1.0.1"}` (空) |
| `settings/v2/packages/builder.json` | 平台/分辨率配置 | `{"__version__": "1.3.9"}` (空) |

**全局搜索** `designResolution`, `orientation`, `portrait`, `landscape`, `fitWidth`, `fitHeight` — **项目内 0 匹配**。

### 3.3 根因判断

**根因**: 项目从未在 Cocos Creator 编辑器中配置过设计分辨率。

Cocos Creator 3.x 新项目的**默认设计分辨率为 1280×720（横版）**。要启用 720×1280（竖版），必须在编辑器中：

1. **菜单** → Project → Project Settings → **Project Data** 选项卡
2. 设置 Design Resolution: **Width: 720, Height: 1280**
3. 勾选 **Fit Width** 和 **Fit Height**

当前这些设置从未被修改过（所有配置文件均为默认空状态），因此 Cocos Creator 使用内置默认值 1280×720 横版。

此外，Phase8Main.scene 的 Canvas 使用 `_alignCanvasWithScreen: false` 且**手动写入**了 1280×720 的尺寸，说明该场景创建时直接使用了编辑器的默认 Canvas 尺寸（当时编辑器默认就是 1280×720）。

### 3.4 微信小游戏平台影响

微信小游戏以竖版为主流。720×1280 是标准微信小游戏分辨率。当前 1280×720 横版会导致：
- 微信开发者工具中显示方向错误
- UI 布局按横版计算，在竖版设备上显示异常
- 如果微信后台配置为竖版，会出现黑边或裁切

### 3.5 修复方向

1. **Cocos Creator 项目设置**: 设置 Design Resolution = 720×1280, Fit Width + Fit Height
2. **Phase8Main.scene Canvas**: 修改 contentSize 为 720×1280，位置改为 (360, 640)，Camera orthoHeight 改为 360
3. **所有场景同步**: scene-001.scene 和 BattleTestClean.scene 如果使用 `_alignCanvasWithScreen: true`，则自动跟随项目设置
4. **微信构建配置**: 在 `profiles/v2/packages/builder.json` 中确认 orientation 为 portrait

---

## 综合根因总结

### 根因链

```
Step8: 程序化生成 Prefab JSON
  ↓
编辑器首次打开/保存 → JSON 被重新序列化
  ↓ (同时)
项目从未配置设计分辨率 → 默认 1280×720 横版
  │
  ├──→ [问题 1] Prefab 结构退化, 编辑器无法正确显示子节点
  ├──→ [问题 3] 所有场景 Canvas 为横版 1280×720
  │
Step9: 手动添加 EquipmentMediator 节点到 Phase8Main.scene
  ↓
三个 Panel Prefab 从未实例化到场景中
  ↓
  └──→ [问题 2] Panel @property 全为 null, UI 静默失效
```

### 核心教训

1. **Cocos Creator Prefab 必须通过编辑器创建** — 程序化生成的 JSON 会被编辑器重新序列化，无法保证保真度
2. **项目设置必须优先配置** — Design Resolution 需要在项目初始阶段设置，否则所有场景继承错误默认值
3. **编辑器绑定工作不可跳过** — @property 的 Scene 绑定是编辑器操作，纯代码无法完成

### 三个问题的修复优先级

| 优先级 | 问题 | 理由 |
|--------|------|------|
| **P0** | 问题 3 — Canvas 分辨率 | 影响所有 UI 布局根基，必须在设计分辨率正确的前提下创建 Prefab |
| **P1** | 问题 1 — Prefab 重建 | 依赖正确的 Canvas 分辨率（Panel 尺寸需匹配 720×1280） |
| **P2** | 问题 2 — Scene 挂载 | 依赖正确的 Prefab 存在后才能绑定 |

**建议修复顺序**: 先修问题 3（Project Settings 设计分辨率）→ 再修问题 1（在编辑器中重建 Prefab，此时 Canvas 尺寸正确）→ 最后修问题 2（在 Phase8Main.scene 中实例化 Prefab 并绑定）

---

## 附录 A：文件验证清单

| 文件 | 存在 | 内容正确 | 备注 |
|------|:---:|:---:|------|
| EquipmentPanel.prefab | ✅ | ⚠ | 子节点 JSON 存在但编辑器不显示 |
| EquipmentBagPanel.prefab | ✅ | ❓ | 需验证 BagPanel 同理是否退化 |
| EquipmentDetailPanel.prefab | ✅ | ❓ | 需验证 DetailPanel 同理是否退化 |
| EquipmentSlotItem.prefab | ✅ | ❓ | 需验证 SlotItem 同理是否退化 |
| EquipmentItemView.prefab | ✅ | ❓ | 需验证 ItemView 同理是否退化 |
| Phase8Main.scene | ✅ | ⚠ | EquipmentMediator 存在但 Panel 引用为 null |
| scene-001.scene | ✅ | ⚠ | 横版 Canvas, 无 Equipment 节点 |
| BattleTestClean.scene | ✅ | ⚠ | 横版 Canvas, 无 Equipment 节点 |
| EquipmentMediator.ts.meta | ✅ | ✅ | UUID: `679c94f0-3c9c-4535-b906-acd9a97076eb` |
| EquipmentPanel.ts.meta | ✅ | ✅ | UUID: `fd274f49-b5d5-4940-92d0-1131d863d326` |

## 附录 B：Git 状态

```
$ git log -- assets/prefabs/panels/EquipmentPanel.prefab
(无输出 — 文件从未被提交)

$ git status
M  assets/scripts/managers/BattleManager.ts
?? assets/prefabs/        ← 所有 Prefab 均为 untracked
?? assets/scenes/         ← 所有 Scene 均为 untracked
```

所有 Prefab 和 Scene 文件从未提交到 Git，无历史记录可追溯变更。

---

*Generated: 2026-06-06*
*Phase: Step10A Root Cause Analysis*
*Status: 根因已定位，未修改任何代码*
