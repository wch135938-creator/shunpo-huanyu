# Phase8 Step2 — Prefab 设置与资源绑定指南

## 概述

本文档指导如何在 Cocos Creator 3.x 编辑器中完成 Phase8 UI 层的 Prefab 创建、资源绑定和构建设置。

---

## 1. 场景设置

### 1.1 打开 Phase8Main 场景
1. 在 Cocos Creator 中打开项目
2. 双击 `assets/scenes/Phase8Main.scene`
3. 确认 Canvas 尺寸为 720×1280，Camera orthoHeight=640

### 1.2 绑定 Bootstrap 组件
1. 选中 **UIRoot** 节点
2. 在属性检查器中点击「添加组件」
3. 搜索并添加 `Phase8BootstrapEntry`
4. 勾选 `autoOpenDungeonPanel`（测试用），设置 `testPlayerPower = 1000`
5. 或者在 Canvas/Scene 节点上添加 `Phase8BootstrapEntry` 组件

---

## 2. 一键构建所有 Panel 节点

### 方法一：代码构建（推荐）
1. 运行场景（点击编辑器顶部 ▶ 按钮）
2. `Phase8SceneBuilder` 组件会在 `start()` 时自动构建所有 7 个 Panel 的完整节点树
3. 构建完成后自动隐藏所有面板
4. 暂停运行（点击 ⏸），此时 Hierarchy 中可看到所有 Panel 节点

### 方法二：手动触发
1. 在 Console 中执行：
```js
const builder = cc.find('UIRoot').getComponent('Phase8SceneBuilder');
builder.buildAllPanels();
```

---

## 3. 生成 Prefab

构建完成后，UIRoot 下会出现 7 个 Panel 子节点。对每个 Panel：

1. 在 Hierarchy 中选中 Panel 节点（如 `DungeonPanel`）
2. 拖拽到 `assets/prefabs/` 目录下（需先创建该目录）
3. Cocos Creator 自动生成 `.prefab` 文件

### 待生成的 7 个 Prefab：
| Prefab 名称 | 源节点 | 组件 |
|------------|--------|------|
| `DungeonPanel.prefab` | UIRoot/DungeonPanel | DungeonPanel |
| `DungeonNodeMapPanel.prefab` | UIRoot/DungeonNodeMapPanel | DungeonNodeMapPanel |
| `RoguelikeHUD.prefab` | UIRoot/RoguelikeHUD | RoguelikeHUD |
| `ArtifactPanel.prefab` | UIRoot/ArtifactPanel | ArtifactPanel |
| `LiveOpsPanel.prefab` | UIRoot/LiveOpsPanel | LiveOpsPanel |
| `EventPanel.prefab` | UIRoot/EventPanel | EventPanel |
| `ResultPanel.prefab` | UIRoot/ResultPanel | ResultPanel |

---

## 4. 创建 Item Prefab

每个 Panel 的列表项也需要创建为 Prefab：

| Prefab 名称 | 用途 | 组件 |
|------------|------|------|
| `DungeonItem.prefab` | 地牢列表项 | DungeonItemTemplate |
| `NodeMapItem.prefab` | 节点地图项 | NodeMapItemTemplate |
| `ForkChoiceItem.prefab` | 分叉选择项 | ForkChoiceTemplate |
| `ArtifactItem.prefab` | 神器列表项 | ArtifactItemTemplate |
| `LiveOpsCard.prefab` | 活动卡片 | LiveOpsCardTemplate |
| `EventChoiceButton.prefab` | 事件选项按钮 | EventChoiceTemplate |
| `RewardItem.prefab` | 奖励展示项 | RewardItemTemplate |

### Item Prefab 节点结构：

**DungeonItem.prefab:**
```
DungeonItem (DungeonItemTemplate)
├── Background (Sprite, 深色背景)
├── NameLabel (Label, 字体24)
├── LayerLabel (Label, 字体18)
├── PowerLabel (Label, 字体18)
├── RewardLabel (Label, 字体16)
├── EnterButton (Button)
│   └── Label (字体20, "进入")
└── LockMask (Node, 灰色半透明遮罩)
```

**NodeMapItem.prefab:**
```
NodeMapItem (NodeMapItemTemplate)
├── Icon (Label, 字体32, emoji图标)
├── NameLabel (Label, 字体20)
├── StatusIndicator (Sprite, 圆形指示器)
└── EnterButton (Button)
    └── Label (字体18, "进入")
```

**ArtifactItem.prefab:**
```
ArtifactItem (ArtifactItemTemplate)
├── Background (Sprite, 根据稀有度改变颜色)
├── NameLabel (Label, 字体22)
├── RarityLabel (Label, 字体16)
├── LevelLabel (Label, 字体16)
├── ActiveIndicator (Node, 绿色圆点)
├── LockedMask (Node, 锁定遮罩)
└── ActivateButton (Button)
    └── Label (字体18, "激活")
```

**LiveOpsCard.prefab:**
```
LiveOpsCard (LiveOpsCardTemplate)
├── NameLabel (Label, 字体24)
├── StatusLabel (Label, 字体18)
├── CountdownLabel (Label, 字体18)
├── RewardLabel (Label, 字体16)
├── TagLabel (Label, 字体14)
└── EnterButton (Button)
    └── Label (字体18, "进入")
```

**EventChoiceButton.prefab:**
```
EventChoiceButton (EventChoiceTemplate, Button)
├── TextLabel (Label, 字体20)
├── PreviewLabel (Label, 字体16)
└── RiskIndicator (Node, ⚠️图标)
```

**RewardItem.prefab:**
```
RewardItem (RewardItemTemplate)
├── Icon (Label, 字体28, emoji)
├── NameLabel (Label, 字体18)
└── QtyLabel (Label, 字体18, "x1")
```

---

## 5. 绑定 Prefab 引用

### 5.1 在编辑器中绑定

对每个 Panel 的组件，将其对应的 Item Prefab 拖入属性面板：

1. 选中 Panel 节点（如 DungeonPanel）
2. 在属性检查器中找到对应的 Prefab 属性槽
3. 从 Assets 面板拖入对应的 Prefab

| Panel 组件 | Prefab 属性 | 拖入 |
|-----------|------------|------|
| DungeonPanel | `dungeonItemPrefab` | DungeonItem.prefab |
| DungeonNodeMapPanel | `nodeItemPrefab` | NodeMapItem.prefab |
| DungeonNodeMapPanel | `forkChoicePrefab` | ForkChoiceItem.prefab |
| ArtifactPanel | `artifactItemPrefab` | ArtifactItem.prefab |
| LiveOpsPanel | `activityCardPrefab` | LiveOpsCard.prefab |
| EventPanel | `choiceButtonPrefab` | EventChoiceButton.prefab |
| ResultPanel | `rewardItemPrefab` | RewardItem.prefab |

---

## 6. 资源与图标

### 6.1 SpriteFrame 资源

由于项目使用 emoji 字符作为图标，暂不需要 SpriteFrame 图片资源。后续美术资源就位后：

1. 将图片导入 `assets/textures/icons/` 目录
2. 在编辑器中选中图片，设置为 SpriteFrame 类型
3. 更新 `phase8_icon_mapping.json` 中的路径映射
4. 在 Panel 脚本中将 Label emoji 替换为 Sprite

### 6.2 图标映射配置

参见 `assets/resources/config/icons/phase8_icon_mapping.json`，记录了所有图标的：
- 资源路径
- 颜色定义
- Emoji 回退字符

---

## 7. 本地化文本

### 7.1 文本配置文件

所有 UI 文本 Key 定义在 `assets/resources/config/localization/phase8_ui_texts.json` 中。

### 7.2 覆盖的文本域
- 地牢名称/描述
- 节点类型标签
- 神器名称/稀有度
- 活动名称/状态
- 事件标题/选项
- 结算结果
- UI 通用文本（按钮、提示、空状态）

### 7.3 多语言扩展

添加新语言：
1. 在 `phase8_ui_texts.json` 的 `data` 中添加新语言代码（如 `"en"`）
2. 复制 `"zh"` 的结构并翻译所有字符串
3. 在 `ConfigManager` 中配置当前语言

---

## 8. 构建与测试

### 8.1 编辑器测试

1. 运行 `Phase8Main.scene`
2. 打开 Console 面板
3. 观察 `Phase8Step2BuildVerifier` 的输出：
   - ✅ 所有验证通过 → 可安全构建
   - ❌ 有项目未通过 → 按提示修复

### 8.2 微信小游戏构建

1. 菜单 → 项目 → 构建发布
2. 平台选择：微信小游戏
3. 设置：
   - 主场景：Phase8Main
   - 分辨率：720×1280
   - 设备方向：Portrait
   - 开放数据域：默认
4. 点击构建
5. 在微信开发者工具中打开构建输出目录
6. 检查 vConsole 日志：
   - 节点数量
   - EventManager 事件订阅
   - 资源加载状态
   - 面板生命周期

### 8.3 构建验证清单

- [ ] Canvas 尺寸 = 720×1280
- [ ] Camera orthoHeight = 640
- [ ] 场景总节点数合理（不含 item 实例时 < 100）
- [ ] 所有 7 个 Panel 组件正确绑定
- [ ] Phase8Bootstrap 配置全部加载（8 个配置文件）
- [ ] 面板打开/隐藏生命周期正常
- [ ] EventManager 事件无泄漏
- [ ] 包体大小合理（< 4MB 初始包）

---

## 9. 文件清单

### 新增文件
| 文件 | 说明 |
|------|------|
| `assets/scenes/Phase8Main.scene` | Phase8 主场景（肖像 720×1280） |
| `assets/scripts/ui/Phase8UIManager.ts` | UI 中央协调器 |
| `assets/scripts/ui/Phase8SceneBuilder.ts` | 程序化 Panel 节点树构建器 |
| `assets/scripts/core/Phase8BootstrapEntry.ts` | 启动入口组件 |
| `assets/scripts/ui/items/DungeonItemTemplate.ts` | 地牢列表项模板 |
| `assets/scripts/ui/items/NodeMapItemTemplate.ts` | 节点地图项模板 |
| `assets/scripts/ui/items/ArtifactItemTemplate.ts` | 神器列表项模板 |
| `assets/scripts/ui/items/LiveOpsCardTemplate.ts` | 活动卡片模板 |
| `assets/scripts/ui/items/EventChoiceTemplate.ts` | 事件选项模板 |
| `assets/scripts/ui/items/RewardItemTemplate.ts` | 奖励展示项模板 |
| `assets/scripts/ui/items/ForkChoiceTemplate.ts` | 分叉选择项模板 |
| `assets/scripts/debug/Phase8Step2BuildVerifier.ts` | 构建验证工具 |
| `assets/resources/config/localization/phase8_ui_texts.json` | 本地化文本表 |
| `assets/resources/config/icons/phase8_icon_mapping.json` | 图标资源映射表 |

### 已有文件（需要编辑器中绑定）
| 文件 | 说明 |
|------|------|
| `assets/scripts/ui/DungeonPanel.ts` | 地牢选择面板 |
| `assets/scripts/ui/DungeonNodeMapPanel.ts` | 节点地图面板 |
| `assets/scripts/ui/RoguelikeHUD.ts` | 地牢 HUD |
| `assets/scripts/ui/ArtifactPanel.ts` | 神器管理面板 |
| `assets/scripts/ui/LiveOpsPanel.ts` | 运营活动面板 |
| `assets/scripts/ui/EventPanel.ts` | 随机事件面板 |
| `assets/scripts/ui/ResultPanel.ts` | 结算面板 |
| `assets/scripts/systems/Phase8Bootstrap.ts` | 系统初始化 |
| `assets/scripts/data/phase8_ui_types.ts` | UI 共享类型 |
| `assets/resources/config/systems/dungeon_v2_config.json` | 地牢 V2 配置 |
| `assets/resources/config/systems/artifact_config.json` | 神器配置 |
| `assets/resources/config/systems/liveops_config.json` | 运营活动配置 |
| `assets/resources/config/systems/event_config.json` | 事件配置 |
| `assets/resources/config/systems/event_pool_config.json` | 事件池配置 |
| `assets/resources/config/systems/reward_pool_config.json` | 奖励池配置 |
| `assets/resources/config/systems/boss_config.json` | Boss 配置 |
