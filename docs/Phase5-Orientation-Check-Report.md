# Phase5-Orientation-Check-Report

**检查日期**: 2026-06-02
**检查范围**: 项目全局 Canvas / 场景 / UI / 构建设置的横竖版一致性

---

## 检查结果汇总

| # | 检查项 | 当前值 | 竖版预期 | 状态 |
|---|---|---|---|---|
| 1 | Canvas Design Resolution | 1280 × 720 | 720 × 1280 | ❌ |
| 2 | Fit Width | 未显式配置 | 1 (fitWidth) | ⚠️ |
| 3 | Fit Height | 未显式配置 | 0 | ⚠️ |
| 4 | Widget 设置 | alignFlags=45 (偏横版) | alignFlags=15 (四边撑满) | ❌ |
| 5 | EquipmentPanel 布局 | 无方向性 Layout 代码 | 竖版纵向排列 | ✅ |
| 6 | GrowthUI 布局 | 未创建 | 竖版纵向排列 | ⚠️ |
| 7 | 所有主要 Scene 尺寸 | 1280×720 (横版) | 720×1280 (竖版) | ❌ |
| 8 | 微信小游戏 orientation | 未配置 | portrait | ⚠️ |
| 9 | project.config.json | 不存在 | 应配置 deviceOrientation | ⚠️ |
| 10 | 构建设置 | 未生成构建产物 | WeChatMiniGame portrait | ⚠️ |

---

## 详细分析

### 1. Canvas Design Resolution

**来源**: `assets/scenes/scene-001.scene` / `BattleTestClean.scene`

```
Camera._orthoHeight: 360
Canvas._lpos:        (640, 360)
```

**推导**:
- orthoHeight = 360 → 摄像机可见垂直范围 = 720px
- Canvas 居中于 (640, 360)
- 16:9 标准比例 → 水平宽度 = 720 × 16 / 9 ≈ 1280

> **结论: 设计分辨率 = 1280 × 720 (横版 LANDSCAPE)**

**应改为**: 720 × 1280 (竖版 PORTRAIT)，orthoHeight=640, Canvas 居中于 (360, 640)

---

### 2. Fit Width / Fit Height

**来源**: `settings/v2/packages/project.json`

```json
{ "__version__": "1.0.6" }
```

Cocos Creator 3.8.8 的 Canvas 适配策略存储在 project.json 中。当前文件仅含 `__version__`，说明：

- 未通过编辑器 Project Settings 面板显式设置适配模式
- 实际行为由编辑器默认值决定（通常默认 `fitWidth: true, fitHeight: true`）

竖版游戏的推荐配置：
- `fitWidth: true`（固定宽度 720，高度自适应）
- `fitHeight: false`

---

### 3. Widget 设置

**来源**: `assets/scenes/scene-001.scene` / `_deprecated_scene.scene`

```json
{
  "_alignFlags": 45,
  "_left": 0,
  "_right": 0,
  "_top": 5.68e-14,
  "_bottom": 5.68e-14,
  "_horizontalCenter": 0,
  "_verticalCenter": 0
}
```

**alignFlags=45 位解析** (Cocos Creator 3.x):
```
bit 0 (1):  LEFT             ✅
bit 1 (2):  RIGHT            ❌ (缺失)
bit 2 (4):  TOP              ✅
bit 3 (8):  BOTTOM           ✅
bit 4 (16): HORIZONTAL_CENTER ❌ (缺失)
bit 5 (32): VERTICAL_CENTER  ✅
```

> **当前**: 对齐 上+下+左+垂直居中 → Canvas 靠左拉伸，右侧自由
> **应改为**: alignFlags=15 (LEFT+RIGHT+TOP+BOTTOM) → 四边撑满屏幕

该配置在横版和竖版下都有问题；应统一改为四边撑满 (alignFlags=15)。

---

### 4. EquipmentPanel 布局方向

**来源**: [EquipmentPanel.ts](../assets/scripts/ui/EquipmentPanel.ts), [EquipmentBagPanel.ts](../assets/scripts/ui/EquipmentBagPanel.ts)

分析结果：
- 两个 Panel 均继承 BasePanel，使用 Cocos Creator 标准 UI 组件
- **无硬编码的 Layout.Direction 设置**（代码中未出现 `Layout` import）
- 布局方向依赖编辑器中场景/预制体的 Layout 组件配置
- Panel 数据结构为纵向槽位列表（Weapon → Armor → Accessory），天然适合竖版纵向排列

> **结论**: 代码层面方向中性，不构成横版锁死。✅

---

### 5. GrowthUI 布局方向

**来源**: 全项目搜索

```
assets/scripts/ui/ 下无 Growth 相关文件
```

**GrowthUI 尚未创建**。Phase4A/4B 实现了 ProgressSystem、PowerSystem、EquipmentSystem，但对应的 UI 面板（GrowthPanel 等）尚未开发。

> **结论**: 不存在横版锁定因素，未来创建时应按竖版设计。⚠️

---

### 6. 所有主要 Scene 尺寸

| Scene | Canvas Pos | orthoHeight | 推导分辨率 | 方向 |
|---|---|---|---|---|
| `scene-001.scene` | (640, 360) | 360 | 1280×720 | 横版 |
| `BattleTestClean.scene` | (640, 360) | 360 | 1280×720 | 横版 |
| `_deprecated_scene.scene` | (640, 360) | ~499 | 1280×~998 | 非标准 |

> **所有 Scene 均为横版 (1280×720)**，无竖版场景。❌

---

### 7. 微信小游戏 orientation 配置

**检查清单**:
- `game.json` — **不存在**（应在 `build/wechatgame/` 输出目录）
- `project.config.json` — **不存在**（微信小游戏项目配置文件）
- `build/` 目录 — **不存在**（尚未执行构建）
- `settings/` 下无微信相关配置

**Cocos Creator 构建微信小游戏时的默认行为**:
- 构建面板 → 发布平台: 微信小游戏 → 需要手动选择 "设备方向" (横屏/竖屏)
- 生成的 `game.json` 包含:
  ```json
  { "deviceOrientation": "portrait" }
  ```

> **结论**: 尚未配置，构建前需设为 **portrait**。⚠️

---

### 8. project.config.json

**不存在**。此文件为微信小游戏在微信开发者工具中的项目配置，包含:
- `appid`
- `projectname`
- `setting` (ES6/增强编译等)

**与 orientation 无关** — 设备方向在 `game.json` 中控制，不在此文件。

---

### 9. 构建设置

**来源**: `settings/v2/packages/builder.json`

```json
{ "__version__": "1.3.9" }
```

- 仅有版本号，无具体构建配置存储
- 构建目标平台、设备方向等信息存储在编辑器的 `profiles/` 目录（未纳入版本控制）
- `build/` 目录不存在，表示尚未执行过构建

> **结论**: 当前无法从项目文件中验证构建设置，但构建时需确保选择 **竖版 (Portrait)**。⚠️

---

## 综合判定

| 维度 | 当前状态 | 判定 |
|---|---|---|
| 设计分辨率 | 1280×720 (横版) | ❌ |
| Canvas 适配 | 未完成竖版配置 | ❌ |
| Scene 尺寸 | 全部横版 | ❌ |
| Widget 对齐 | 非标准四边撑满 | ❌ |
| UI 代码层 | 无方向性硬编码 | ✅ |
| 微信配置 | 未配置 | ⚠️ |
| 构建配置 | 未生成 | ⚠️ |

---

# 最终结论: **FAIL (Landscape)**

**当前项目为横版 (1280×720 LANDSCAPE) 配置**，与微信小游戏竖版 (Portrait) 标准不兼容。

### 修复建议

1. **修改 Design Resolution**: 在 Cocos Creator 编辑器 → 项目设置 → 项目数据 → 设计分辨率 改为 `720 × 1280`
2. **调整所有 Scene Canvas**: 重新创建 Canvas 节点（Cocos Creator 会根据新设计分辨率自动调整）
3. **修正 Widget**: Canvas 节点的 Widget 组件改为四边撑满模式 (`alignFlags = 15`)
4. **构建时选竖版**: 微信小游戏构建面板 → 设备方向 → 选择 "竖屏 (Portrait)"
5. **创建 game.json 模板**: 在 `build-templates/wechatgame/game.json` 中添加 `"deviceOrientation": "portrait"`
