# Phase8-Beta-Blocker-Fix-002

## 日期

2026-06-04

## 严重级别

**Blocker** — 阻止 Cocos Creator 打开 Phase8Main.scene

## 现象

```text
Cannot read properties of undefined (reading '__type__')
Open scene failed: b5995a61-fbb0-47a0-8ea6-f728a6314036
```

## 根因分析

### 问题定位

Cocos Creator 3.x 的 .scene 文件是 JSON 数组，数组中的每个对象通过 `__id__` (整数索引) 互相引用。当场景反序列化时，引擎会按索引查找对应对象。如果索引越界（超出数组长度），查找返回 `undefined`，引擎接着尝试读取 `undefined.__type__`，触发以上错误。

### 具体问题

`Phase8Main.scene` 的 `cc.SceneGlobals`（数组索引 10）引用了 8 个子对象：

| 属性 | 引用 `__id__` | 实际数组位置 | 状态 |
|------|--------------|-------------|------|
| ambient | 11 | 11 | ✅ 正确 |
| shadows | **16** | 12 | ❌ 错误 — 指向了 SkinInfo |
| _skybox | **19** | 13 | ❌ 越界（数组只有 19 个元素，索引 0-18）|
| fog | **22** | 14 | ❌ 越界 |
| octree | **25** | 15 | ❌ 越界 |
| skin | **28** | 16 | ❌ 越界 |
| lightProbeInfo | **31** | 17 | ❌ 越界 |
| postSettings | **34** | 18 | ❌ 越界 |

SceneGlobals 的子对象实际上在数组中存储于**连续**的索引 11-18，但 SceneGlobals 的引用却使用了带**大间隔**的索引（11, 16, 19, 22, 25, 28, 31, 34），导致 7 个引用指向了不存在的数组位置。

### 为什么会出现这个问题

Phase8Main.scene 很可能是通过程序化方式（如 Phase8SceneBuilder）生成的，而非通过 Cocos Creator 编辑器创建。生成代码在写入 SceneGlobals 子对象引用时使用了错误的索引偏移量。

## 修复内容

### 1. SceneGlobals `__id__` 引用修正

```diff
  {
    "__type__": "cc.SceneGlobals",
    "ambient": { "__id__": 11 },
-   "shadows": { "__id__": 16 },
+   "shadows": { "__id__": 12 },
-   "_skybox": { "__id__": 19 },
+   "_skybox": { "__id__": 13 },
-   "fog": { "__id__": 22 },
+   "fog": { "__id__": 14 },
-   "octree": { "__id__": 25 },
+   "octree": { "__id__": 15 },
-   "skin": { "__id__": 28 },
+   "skin": { "__id__": 16 },
-   "lightProbeInfo": { "__id__": 31 },
+   "lightProbeInfo": { "__id__": 17 },
-   "postSettings": { "__id__": 34 },
+   "postSettings": { "__id__": 18 },
    ...
  }
```

### 2. 移除 SceneGlobals 子对象上的非标准 `_id` 字段

Cocos Creator 编辑器生成的场景中，SceneGlobals 的子对象（AmbientInfo、ShadowsInfo 等）**不包含** `_id` 字段。Phase8Main.scene 的子对象却携带了 `"_id": "p8main-xxx-info"` 形式的字段，这些是程序化生成时添加的非标准数据。

移除了以下 8 个 `_id` 字段：
- `"_id": "p8main-ambient-info"`（AmbientInfo）
- `"_id": "p8main-shadows-info"`（ShadowsInfo）
- `"_id": "p8main-skybox-info"`（SkyboxInfo）
- `"_id": "p8main-fog-info"`（FogInfo）
- `"_id": "p8main-octree-info"`（OctreeInfo）
- `"_id": "p8main-skin-info"`（SkinInfo）
- `"_id": "p8main-lightprobe-info"`（LightProbeInfo）
- `"_id": "p8main-postsettings-info"`（PostSettingsInfo）

## 修改文件

| 文件 | 修改次数 |
|------|---------|
| `assets/scenes/Phase8Main.scene` | 9 |

## 后续建议

Phase8Main.scene 是由程序化代码生成的，而非通过 Cocos Creator 编辑器创建。建议采用以下方式避免类似问题：

1. **首选方式**：在 Cocos Creator 编辑器中手动创建场景，然后将 Phase8BootstrapEntry 组件拖到节点上
2. **备选方式**：如果必须程序化生成 .scene 文件，应确保：
   - 所有 `__id__` 引用指向正确的数组索引
   - 不添加非标准字段（如子对象上的 `_id`）
   - 生成后使用 `node -e "JSON.parse(fs.readFileSync(...))"` 验证 JSON 合法性
   - 对照编辑器中手动创建的场景文件对比字段差异

## 验证方法

1. 在 Cocos Creator 编辑器中打开 Phase8Main.scene — 应不再报错
2. 检查场景层级结构：Scene → Canvas (含 Camera) → UIRoot
3. 检查 Canvas 的 UITransform 为 720×1280
4. 检查 Camera 的 orthoHeight 为 640

🤖 Generated with [Claude Code](https://claude.com/claude-code)
