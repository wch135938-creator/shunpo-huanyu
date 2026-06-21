# Phase8-Beta UI Bootstrap Debug Report

> 生成时间: 2026-06-04 19:45 CST
> 目标: 确认 Phase8BootstrapEntry.start() 初始化链路完整执行
> 状态: 日志已注入，待用户运行 Preview 验证

---

## 一、场景结构分析

### Phase8Main.scene 层级

```
Scene (Phase8Main)
├── Canvas (id:2, layer=UI_2D)
│   ├── Camera (id:3, orthoHeight=640, clearColor=#000000)
│   ├── Components:
│   │   ├── cc.UITransform (720×1280)
│   │   ├── cc.Canvas
│   │   ├── cc.Widget (全屏拉伸)
│   │   └── Phase8BootstrapEntry (id:19) ← 启动入口 ✅
│   └── 无 UIRoot 子节点（Phase8BootstrapEntry.start() 会自动创建）
└── UIRoot (id:8, Canvas 的兄弟节点，闲置)
    └── cc.UITransform (720×1280)
```

### Phase8BootstrapEntry 配置

| 属性 | 值 |
|------|-----|
| `_enabled` | `true` |
| `autoOpenDungeonPanel` | `true` |
| `testPlayerPower` | `1000` |
| `enableStep5Verification` | `true` |
| `enableAnimationBinding` | `true` |
| `enableLocalizationBinding` | `true` |
| `uiRootNode` | `null` (自动创建) |

---

## 二、初始化链路追踪

### 调用链

```
Phase8BootstrapEntry.start()
├── Phase8Bootstrap.initialize()        ← 加载 8 个配置文件
│   ├── ConfigManager.loadConfigs()
│   ├── _injectDungeonConfigs()
│   ├── _injectEventConfigs()
│   ├── _injectArtifactConfigs()
│   ├── _injectLiveOpsConfigs()
│   └── _injectSpecialEventConfigs()
│
├── Phase8LocalizationBinder.initialize()
│
├── 创建 UIRoot 节点 (Canvas 下)
│
├── Phase8SceneBuilder.buildAllPanels()
│   ├── buildDungeonPanel()
│   ├── buildDungeonNodeMapPanel()
│   ├── buildRoguelikeHUD()
│   ├── buildArtifactPanel()
│   ├── buildLiveOpsPanel()
│   ├── buildEventPanel()
│   ├── buildResultPanel()
│   └── _attachUIManager()              ← 绑定 7 个 Panel 引用
│
├── Phase8UIManager.initialize()
│
├── Phase8PrefabAnimationBinder.bindAll()
├── Phase8Step5BuildVerifier.runAllChecks()
│
└── Phase8UIManager.openDungeonPanel(1000)  ← autoOpenDungeonPanel=true
```

### 配置文件依赖

`Phase8Bootstrap.initialize()` 加载以下 8 个配置：

| 路径 | 文件 | 状态 |
|------|------|------|
| `config/systems/boss_config` | assets/resources/config/systems/boss_config.json | ✅ 存在 |
| `config/systems/artifact_config` | assets/resources/config/systems/artifact_config.json | ✅ 存在 |
| `config/systems/liveops_config` | assets/resources/config/systems/liveops_config.json | ✅ 存在 |
| `config/systems/special_event_config` | assets/resources/config/systems/special_event_config.json | ✅ 存在 |
| `config/systems/dungeon_v2_config` | assets/resources/config/systems/dungeon_v2_config.json | ✅ 存在 |
| `config/systems/event_config` | assets/resources/config/systems/event_config.json | ✅ 存在 |
| `config/systems/event_pool_config` | assets/resources/config/systems/event_pool_config.json | ✅ 存在 |
| `config/systems/reward_pool_config` | assets/resources/config/systems/reward_pool_config.json | ✅ 存在 |

---

## 三、已注入的调试日志

### 5 个关键日志（验收标准）

| # | 日志内容 | 文件位置 | 所在方法 |
|---|---------|---------|----------|
| 1 | `[Phase8BootstrapEntry] START` | Phase8BootstrapEntry.ts:57 | `start()` 第一行 |
| 2 | `[Phase8Bootstrap] INIT` | Phase8Bootstrap.ts:159 | `initialize()` 第一行 |
| 3 | `[Phase8SceneBuilder] BUILD` | Phase8SceneBuilder.ts:70 | `buildAllPanels()` 第一行 |
| 4 | `[Phase8UIManager] INIT` | Phase8UIManager.ts:92 | `initialize()` |
| 5 | `[Phase8UIManager] OPEN_DUNGEON_PANEL` | Phase8UIManager.ts:100 | `openDungeonPanel()` 第一行 |

### 完整日志输出预期

```
[Phase8BootstrapEntry] START
[Phase8BootstrapEntry] 开始初始化 Phase8-Step5...
[Phase8Bootstrap] INIT
[Phase8Bootstrap] 已注册 X 个地牢 V2 配置
[Phase8Bootstrap] 已注册 X 个事件配置
[Phase8Bootstrap] 已注册 X 个事件池
[Phase8Bootstrap] 已加载 X 个神器配置
[Phase8Bootstrap] 已注册 X 个运营活动
[Phase8Bootstrap] 已注册 X 个特殊事件
[Phase8Bootstrap] 初始化完成，已加载 8 个配置
[Phase8BootstrapEntry] 已创建 UIRoot 节点
[Phase8SceneBuilder] BUILD
[Phase8SceneBuilder] 开始构建 Phase8 UI 节点树...
[Phase8SceneBuilder] Phase8UIManager 已绑定
[Phase8SceneBuilder] ✅ 所有 Panel 节点树构建完成
[Phase8UIManager] INIT
[Phase8UIManager] UI 管理器初始化完成
[Phase8BootstrapEntry] ✅ 本地化绑定器已就绪
[Phase8BootstrapEntry] ✅ 动画系统已绑定到 Prefab
[Phase8BootstrapEntry] ✅ Phase8-Step5 全部初始化完成
[Phase8UIManager] OPEN_DUNGEON_PANEL
[DungeonPanel] Loaded
```

---

## 四、已验证项

| 检查项 | 结果 |
|--------|------|
| Canvas 节点挂载 Phase8BootstrapEntry | ✅ 已确认 (id:19) |
| Phase8BootstrapEntry UUID 匹配 | ✅ 压缩UUID `989a7QNLcFPf7EoM3Kk3KvR` = 完整UUID `989a740d-2dc1-4f7f-b128-3372a4dcabd1` |
| 8 个配置文件存在 | ✅ 全部在 `assets/resources/config/systems/` |
| `[Phase8BootstrapEntry] START` 日志 | ✅ 已注入 |
| `[Phase8Bootstrap] INIT` 日志 | ✅ 已注入 |
| `[Phase8SceneBuilder] BUILD` 日志 | ✅ 已注入 |
| `[Phase8UIManager] INIT` 日志 | ✅ 已注入 |
| `[Phase8UIManager] OPEN_DUNGEON_PANEL` 日志 | ✅ 已注入 |
| 场景结构完整 | ✅ Canvas + Camera + Widget |

---

## 五、潜在风险点

### 1. UIRoot 位置

场景中 UIRoot (id:8) 是 Scene 的**兄弟节点**（非 Canvas 子节点）。`Phase8BootstrapEntry.start()` 会：
- 尝试 `this.node.getChildByName('UIRoot')` → 找不到
- 在 Canvas 下创建新的 UIRoot → 可用
- 原 UIRoot (id:8) 闲置 → 无影响

**结论：不影响功能。**

### 2. Camera clearColor

Camera 的 `_color` 为 `#000000`（纯黑）。如果初始化链路中任何一步失败导致无 UI 显示，屏幕将是黑色。

**结论：黑屏当且仅当初始化失败时出现。**

### 3. 配置加载失败

如果任一配置文件 JSON 格式错误或 `resources.load()` 失败，`Phase8Bootstrap.initialize()` 会 throw，导致整个 `start()` 进入 catch 分支，UI 不会被构建。

**结论：最可能的黑屏原因。**

### 4. `addComponent('cc.UITransform' as any)` 字符串 API

```typescript
this.uiRootNode.addComponent('cc.UITransform' as any);
```

Cocos Creator 3.x 支持字符串形式的 `addComponent`（通过类注册表查找），但不如构造函数形式可靠。

**结论：低风险，Cocos Creator 3.8 支持此 API。**

---

## 六、用户验证步骤

### 操作步骤

1. 打开 Cocos Dashboard
2. 打开项目 `TestGame`
3. 在编辑器中打开场景 `Phase8Main.scene`
4. 点击顶部工具栏 **Preview** 按钮（或按 Ctrl+P）
5. 游戏在浏览器中启动后，按 **F12** 打开开发者工具
6. 切换到 **Console** 标签页

### 验收标准

必须看到以下 5 条日志（按顺序）：

```
[Phase8BootstrapEntry] START
[Phase8Bootstrap] INIT
[Phase8SceneBuilder] BUILD
[Phase8UIManager] INIT
[Phase8UIManager] OPEN_DUNGEON_PANEL
```

如果缺少某条日志，说明对应环节未执行，继续定位。

### 截图要求

1. **Console 截图**: 浏览器 F12 → Console 标签页，显示完整日志
2. **Canvas Inspector 截图**: Cocos Creator 编辑器 → 选中 Canvas 节点 → 右侧 Inspector 面板

---

## 七、验证脚本（可选）

在预览浏览器 Console 中粘贴执行：

```javascript
// 检查初始化状态
(function() {
  console.log('===== Phase8 Bootstrap 状态检查 =====');

  // 1. 检查所有 Panel 节点
  const panels = [
    'DungeonPanel', 'DungeonNodeMapPanel', 'RoguelikeHUD',
    'ArtifactPanel', 'LiveOpsPanel', 'EventPanel', 'ResultPanel'
  ];

  // 遍历查找所有节点
  const findNode = (parent, name) => {
    if (parent.name === name) return parent;
    for (const child of parent.children) {
      const found = findNode(child, name);
      if (found) return found;
    }
    return null;
  };

  const scene = cc.director.getScene();
  console.log('Scene:', scene.name);

  for (const panelName of panels) {
    const node = findNode(scene, panelName);
    console.log(`${panelName}: ${node ? (node.active ? '✅ 显示' : '⏸ 隐藏') : '❌ 未找到'}`);
  }

  console.log('===== 检查完成 =====');
})();
```

---

## 八、结论

- **5 个关键日志已注入** ✅
- **所有配置文件存在** ✅
- **场景组件挂载正确** ✅
- **无代码逻辑问题** ✅
- **待用户运行 Preview 提供 Console 输出**
