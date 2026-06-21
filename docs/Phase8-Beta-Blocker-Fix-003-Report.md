# Phase8-Beta-Blocker-Fix-003-Report

## 日期

2026-06-04

## 任务

定位 `b5995a61-fbb0-47a0-8ea6-f728a6314036` 的真正身份，以及 `Cannot read properties of undefined (__type__)` 的根因。

---

# 一、b5995a61-fbb0-47a0-8ea6-f728a6314036 身份确认

## 结论：Scene Asset（场景资源）

该 UUID 是 **`Phase8Main.scene` 的场景资源 UUID**。

| 证据 | 文件 | 行 |
|------|------|----|
| `.meta` 文件的 `uuid` 字段 | `assets/scenes/Phase8Main.scene.meta` | 5 |
| Scene 对象（`__id__: 1`）的 `_id` 字段 | `assets/scenes/Phase8Main.scene` | 60 |
| `library/.assets-data.json` 注册信息 | `library/.assets-data.json` | 890 |
| `library/.assets-info.json` 路径映射 | `library/.assets-info.json` | 1203 |

**资源类型**：Scene  
**文件路径**：`db://assets/scenes/Phase8Main.scene`  
**依赖脚本**：无（`dependScripts: []`）

---

# 二、Phase8Main.scene 内部引用完整性扫描

## 2.1 对象清单（共 19 个，索引 0-18）

| 索引 | `__id__` | `__type__` | `_name` / 说明 |
|------|----------|------------|----------------|
| 0 | — | `cc.SceneAsset` | 场景资源包装器 |
| 1 | 1 | `cc.Scene` | 场景根对象 `_id: "b5995a61..."` |
| 2 | 2 | `cc.Node` | Canvas (`_id: "p8main-canvas-node-uuid"`) |
| 3 | 3 | `cc.Node` | Camera (`_id: "p8main-camera-node-uuid"`) |
| 4 | 4 | `cc.Camera` | Camera 组件 (`_id: "p8main-camera-comp-uuid"`) |
| 5 | 5 | `cc.UITransform` | Canvas UITransform (`_id: "p8main-canvas-uitransform"`) |
| 6 | 6 | `cc.Canvas` | Canvas 组件 (`_id: "p8main-canvas-comp-uuid"`) |
| 7 | 7 | `cc.Widget` | Canvas Widget (`_id: "p8main-canvas-widget-uuid"`) |
| 8 | 8 | `cc.Node` | UIRoot (`_id: "p8main-uiroot-node-uuid"`) |
| 9 | 9 | `cc.UITransform` | UIRoot UITransform (`_id: "p8main-uiroot-uitransform"`) |
| 10 | 10 | `cc.SceneGlobals` | 全局设置 |
| 11 | — | `cc.AmbientInfo` | 环境光 |
| 12 | — | `cc.ShadowsInfo` | 阴影 |
| 13 | — | `cc.SkyboxInfo` | 天空盒 |
| 14 | — | `cc.FogInfo` | 雾 |
| 15 | — | `cc.OctreeInfo` | 八叉树 |
| 16 | — | `cc.SkinInfo` | 蒙皮 |
| 17 | — | `cc.LightProbeInfo` | 光照探针 |
| 18 | — | `cc.PostSettingsInfo` | 后处理 |

## 2.2 `__uuid__` 引用

**零个。** 场景文件中不包含任何 `__uuid__` 字段。

## 2.3 `__type__` 引用

全部 51 个 `__type__` 均为 Cocos Creator 引擎内置类型（`cc.*` 前缀）：

```
cc.SceneAsset, cc.Scene, cc.Node, cc.Camera, cc.UITransform,
cc.Canvas, cc.Widget, cc.SceneGlobals, cc.AmbientInfo,
cc.ShadowsInfo, cc.SkyboxInfo, cc.FogInfo, cc.OctreeInfo,
cc.SkinInfo, cc.LightProbeInfo, cc.PostSettingsInfo,
cc.Vec2, cc.Vec3, cc.Vec4, cc.Quat, cc.Color, cc.Rect, cc.Size
```

**无任何自定义脚本组件的 `__type__` 引用。**

## 2.4 `__id__` 引用完整性检查（源文件）

### SceneGlobals → Info 对象

| 属性 | `__id__` | 目标对象 | 存在？ |
|------|----------|----------|:------:|
| ambient | 11 | `cc.AmbientInfo` @ 索引 11 | ✅ |
| shadows | 12 | `cc.ShadowsInfo` @ 索引 12 | ✅ |
| _skybox | 13 | `cc.SkyboxInfo` @ 索引 13 | ✅ |
| fog | 14 | `cc.FogInfo` @ 索引 14 | ✅ |
| octree | 15 | `cc.OctreeInfo` @ 索引 15 | ✅ |
| skin | 16 | `cc.SkinInfo` @ 索引 16 | ✅ |
| lightProbeInfo | 17 | `cc.LightProbeInfo` @ 索引 17 | ✅ |
| postSettings | 18 | `cc.PostSettingsInfo` @ 索引 18 | ✅ |

**源文件所有 `__id__` 引用正确，无越界。** ✅

### 其他 `__id__` 引用

| 源对象 | 引用字段 | `__id__` | 目标 | 存在？ |
|--------|----------|----------|------|:------:|
| SceneAsset (0) | scene | 1 | Scene (1) | ✅ |
| Scene (1) | _children | 2 | Canvas Node (2) | ✅ |
| Scene (1) | _children | 8 | UIRoot Node (8) | ✅ |
| Scene (1) | _globals | 10 | SceneGlobals (10) | ✅ |
| Canvas (2) | _parent | 1 | Scene (1) | ✅ |
| Canvas (2) | _children | 3 | Camera Node (3) | ✅ |
| Canvas (2) | _components | 5 | UITransform (5) | ✅ |
| Canvas (2) | _components | 6 | Canvas (6) | ✅ |
| Canvas (2) | _components | 7 | Widget (7) | ✅ |
| Camera (3) | _parent | 2 | Canvas (2) | ✅ |
| Camera (3) | _components | 4 | Camera (4) | ✅ |
| Camera (4) | node | 3 | Camera Node (3) | ✅ |
| UITransform (5) | node | 2 | Canvas (2) | ✅ |
| Canvas (6) | node | 2 | Canvas (2) | ✅ |
| Canvas (6) | _cameraComponent | 4 | Camera (4) | ✅ |
| Widget (7) | node | 2 | Canvas (2) | ✅ |
| UIRoot (8) | _parent | 1 | Scene (1) | ✅ |
| UIRoot (8) | _components | 9 | UITransform (9) | ✅ |
| UITransform (9) | node | 8 | UIRoot (8) | ✅ |

**全部 23 个 `__id__` 引用均指向存在的对象。** ✅

## 2.5 Missing 引用汇总（源文件）

**无。** 源文件 `assets/scenes/Phase8Main.scene` 内部引用全部完整有效。

---

# 三、根因：Library 缓存污染

## 3.1 发现

Cocos Creator 在打开场景时，**不直接从 `.scene` 源文件读取**，而是从 `library/` 目录下的编译缓存读取。

对比两个文件后发现：

| 对比维度 | 源文件 `.scene` | Library 缓存 |
|----------|:---------------:|:------------:|
| 路径 | `assets/scenes/Phase8Main.scene` | `library/b5/b5995a61-fbb0-47a0-8ea6-f728a6314036.json` |
| SceneGlobals `__id__` | `{11,12,13,14,15,16,17,18}` ✅ | `{11,16,19,22,25,28,31,34}` ❌ |
| Info 对象 `_id` 字段 | 无 ✅ | 有 `"p8main-xxx-info"` ❌ |

## 3.2 Library 缓存中的断裂引用

```
library/b5/b5995a61-fbb0-47a0-8ea6-f728a6314036.json
```

SceneGlobals 的引用：

| 属性 | Library `__id__` | 状态 |
|------|:---------------:|------|
| ambient | 11 | ✅ 指向索引 11 |
| shadows | **16** | ❌ 指向了 `cc.SkinInfo`（索引 16），而非 `cc.ShadowsInfo`（索引 12）|
| _skybox | **19** | ❌ **越界** — 数组最大索引为 18 |
| fog | **22** | ❌ **越界** — 数组最大索引为 18 |
| octree | **25** | ❌ **越界** — 数组最大索引为 18 |
| skin | **28** | ❌ **越界** — 数组最大索引为 18 |
| lightProbeInfo | **31** | ❌ **越界** — 数组最大索引为 18 |
| postSettings | **34** | ❌ **越界** — 数组最大索引为 18 |

## 3.3 错误触发链

```
Cocos Creator 打开场景
  ↓
从 library/b5/b5995a61-fbb0-47a0-8ea6-f728a6314036.json 加载
  ↓
解析 SceneGlobals，读取 "__id__": 19
  ↓
在数组（长度 19，索引 0-18）中查找索引 19
  ↓
返回 undefined
  ↓
尝试访问 undefined.__type__
  ↓
💥 Cannot read properties of undefined (reading '__type__')
```

**源文件已经过 Fix-002 修复，但 Library 缓存未更新。** Cocos Creator 加载的是旧缓存，不是源文件。

## 3.4 Library Info 对象含非标准 `_id` 字段

Library 缓存中的 8 个 Info 对象全部携带了非标准 `_id` 字段：

```
cc.AmbientInfo     → "_id": "p8main-ambient-info"
cc.ShadowsInfo     → "_id": "p8main-shadows-info"
cc.SkyboxInfo      → "_id": "p8main-skybox-info"
cc.FogInfo         → "_id": "p8main-fog-info"
cc.OctreeInfo      → "_id": "p8main-octree-info"
cc.SkinInfo        → "_id": "p8main-skin-info"
cc.LightProbeInfo  → "_id": "p8main-lightprobe-info"
cc.PostSettingsInfo → "_id": "p8main-postsettings-info"
```

这些字段在 Cocos Creator 原生生成的场景中不存在，源文件中已被移除，但 Library 缓存中仍然保留。

---

# 四、场景缺少自定义组件说明

Scene 根节点 `_components` 为 `[]`（空），UIRoot 节点仅含 `cc.UITransform`。场景中**未挂载 `Phase8BootstrapEntry` 组件**，但这不会导致 `Cannot read properties of undefined (__type__)` 错误——它只会导致场景打开后无 UI 初始化逻辑。这不是当前 Blocker 的原因。

---

# 五、结论

| 项目 | 结果 |
|------|------|
| `b5995a61-...` 身份 | **Scene Asset** — `Phase8Main.scene` 场景资源 |
| 源文件 `.scene` 内部引用 | **全部有效** — 0 个 Missing 引用 |
| `__uuid__` 引用（缺失 prefab/script）| **0 个** — 场景无外部资源引用 |
| `__type__` 引用（缺失 component）| **0 个** — 全部为引擎内置类型 |
| Library 缓存 | **❌ 污染** — 含 Fix-002 之前的断裂 `__id__` |
| 根因 | **Library 缓存未从源文件重新生成** |

# 六、修复方案

删除 `library/` 目录（或至少删除 `library/b5/b5995a61-fbb0-47a0-8ea6-f728a6314036.json`），让 Cocos Creator 从已修正的源 `.scene` 文件重新编译。

```powershell
# 方案 A：仅删除场景缓存
Remove-Item -Recurse -Force "library/b5/b5995a61-fbb0-47a0-8ea6-f728a6314036.json"

# 方案 B：完全清理（推荐）
Remove-Item -Recurse -Force "library"
Remove-Item -Recurse -Force "temp"
```

然后重新打开 Cocos Creator 工程。

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
