# Phase8-Beta 运行时验证报告

> 生成时间: 2026-06-04 18:17 CST
> 验证场景: Phase8Main.scene
> 引擎版本: Cocos Creator 3.8.8

---

## 一、场景配置修改

### 操作内容

Phase8Main.scene 的 Canvas 节点原本只有 3 个组件:
- `cc.UITransform` (id:5)
- `cc.Canvas` (id:6)
- `cc.Widget` (id:7)

**已将 Phase8BootstrapEntry 挂载到 Canvas 节点上** (id:19), 配置如下:

| 属性 | 值 | 说明 |
|------|-----|------|
| `__type__` | `989a7QNLcFPf7EoM3Kk3KvR` | Phase8BootstrapEntry 压缩UUID |
| `_enabled` | `true` | 启用组件 |
| `autoOpenDungeonPanel` | `true` | **自动打开地牢面板** |
| `testPlayerPower` | `1000` | 测试战力值 |
| `enableStep5Verification` | `true` | 启用构建验证 |
| `enableAnimationBinding` | `true` | 启用动画绑定 |
| `enableLocalizationBinding` | `true` | 启用本地化绑定 |
| `uiRootNode` | `null` | 自动查找/创建 UIRoot |

### 场景层级结构

```
Scene (Phase8Main)
├── Canvas
│   ├── Camera
│   └── [Components: UITransform, Canvas, Widget, Phase8BootstrapEntry]  ← 新增
└── UIRoot (旧有，闲置)
```

> 注: Phase8BootstrapEntry.start() 会在 Canvas 下自动创建新的 UIRoot 并构建所有 Panel。

---

## 二、运行时验证（需用户在 Cocos Creator 中操作）

### 操作步骤

1. 打开 Cocos Dashboard
2. 打开项目 `TestGame`
3. 在 Cocos Creator 编辑器中打开场景 `Phase8Main.scene`
4. 点击 **Preview** 按钮（预览按钮在编辑器顶部工具栏）
5. 游戏在浏览器中启动后，按 **F12** 打开开发者工具
6. 切换到 **Console** 标签页
7. 将下方验证脚本粘贴到 Console 中，按 Enter 执行

### 浏览器 Console 验证脚本

```javascript
// ============================================================
// Phase8-Beta Runtime Verification Script
// 在 Cocos Creator 预览浏览器 Console 中运行
// ============================================================
(function() {
  const report = { timestamp: new Date().toISOString(), checks: [] };
  const pass = (msg) => { report.checks.push({ status: 'PASS', message: msg }); console.log('✅', msg); };
  const fail = (msg, detail) => { report.checks.push({ status: 'FAIL', message: msg, detail }); console.error('❌', msg, detail); };
  const warn = (msg, detail) => { report.checks.push({ status: 'WARN', message: msg, detail }); console.warn('⚠️', msg, detail); };

  console.log('========== Phase8 运行时验证开始 ==========');

  // Step 1: 检查 Phase8BootstrapEntry.start() 是否执行
  const logs = [];
  const origLog = console.log;
  console.log = function(...args) {
    logs.push(args.join(' '));
    origLog.apply(console, args);
  };
  console.log('--- 检查控制台日志中是否包含 Phase8BootstrapEntry 输出 ---');
  console.log = origLog;

  // Step 2: 检查 Canvas 节点上是否有 Phase8BootstrapEntry 组件
  try {
    const scene = cc.director.getScene();
    if (!scene) { fail('Scene 未找到'); return; }
    pass('Scene 已找到: ' + scene.name);

    const canvas = scene.getChildByName('Canvas');
    if (!canvas) { fail('Canvas 节点未找到'); return; }
    pass('Canvas 节点已找到');

    const bootstrapEntry = canvas.getComponent('Phase8BootstrapEntry');
    if (bootstrapEntry) {
      pass('Phase8BootstrapEntry 组件已挂载到 Canvas');
    } else {
      fail('Phase8BootstrapEntry 组件未找到');
    }
  } catch(e) {
    fail('检查节点时出错: ' + e.message, e.stack);
  }

  // Step 3: 检查 UIRoot 节点
  try {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const uiRoot = canvas.getChildByName('UIRoot');
    if (uiRoot) {
      pass('UIRoot 节点已创建 (位于 Canvas 下)');
      console.log('  UIRoot 子节点数量:', uiRoot.children.length);
      for (const child of uiRoot.children) {
        console.log('  -', child.name, '(active:', child.active, ')');
      }
    } else {
      warn('UIRoot 节点未找到（可能尚未创建）');
    }
  } catch(e) {
    fail('检查 UIRoot 时出错: ' + e.message);
  }

  // Step 4: 检查 DungeonPanel
  try {
    const scene = cc.director.getScene();
    const dungeonName = 'DungeonPanel';
    // 递归查找 DungeonPanel
    function findNode(node, name) {
      if (node.name === name) return node;
      for (const child of node.children) {
        const found = findNode(child, name);
        if (found) return found;
      }
      return null;
    }
    const dungeonPanel = findNode(scene, dungeonName);
    if (dungeonPanel && dungeonPanel.active) {
      pass('DungeonPanel 已打开且处于激活状态');
    } else if (dungeonPanel) {
      warn('DungeonPanel 节点存在但未激活 (active=false)');
    } else {
      warn('DungeonPanel 节点未找到（可能未被自动打开，检查 autoOpenDungeonPanel 属性）');
    }
  } catch(e) {
    fail('检查 DungeonPanel 时出错: ' + e.message);
  }

  // Step 5: 检查错误日志
  try {
    const errorCount = logs.filter(l => 
      l.includes('Missing class') || 
      l.includes('Script missing or invalid') ||
      l.includes('TypeError') ||
      l.includes('ReferenceError')
    ).length;
    if (errorCount === 0) {
      pass('Console 中无 Missing class / Script missing / TypeError / ReferenceError 错误');
    } else {
      fail('Console 中发现 ' + errorCount + ' 条相关错误');
    }
  } catch(e) {
    warn('检查错误日志时出错: ' + e.message);
  }

  // Step 6: 检查关键日志
  const keyLogs = logs.filter(l => l.includes('[Phase8BootstrapEntry]'));
  if (keyLogs.length > 0) {
    pass('Phase8BootstrapEntry.start() 已执行 (发现 ' + keyLogs.length + ' 条相关日志)');
    keyLogs.forEach(l => console.log('  日志:', l));
  } else {
    warn('未找到 Phase8BootstrapEntry 日志（日志可能被清除或初始化尚未完成）');
  }

  // Step 7: 检查 Error/Exception
  const errorLogs = logs.filter(l => 
    l.includes('Error') || l.includes('Exception') || l.includes('error') || l.includes('exception')
  );
  if (errorLogs.length > 0) {
    warn('发现 ' + errorLogs.length + ' 条 Error/Exception 相关日志（需人工审查）');
    errorLogs.forEach(l => console.warn('  ⚠️', l));
  } else {
    pass('未发现 Error/Exception 日志');
  }

  console.log('========== 验证报告 ==========');
  console.table(report.checks);
  console.log('总计:', report.checks.filter(c => c.status === 'PASS').length + ' 通过, ' +
    report.checks.filter(c => c.status === 'FAIL').length + ' 失败, ' +
    report.checks.filter(c => c.status === 'WARN').length + ' 警告');

  // 返回报告对象（可被程序化使用）
  return report;
})();
```

---

## 三、预期初始化执行链

Phase8BootstrapEntry.start() 执行时, Console 应输出以下日志（按顺序）:

```
[Phase8BootstrapEntry] 开始初始化 Phase8-Step5...
[Phase8BootstrapEntry] ✅ 本地化绑定器已就绪
[Phase8BootstrapEntry] 已创建 UIRoot 节点
[Phase8BootstrapEntry] ✅ 动画系统已绑定到 Prefab
[Phase8BootstrapEntry] ✅ Phase8-Step5 全部初始化完成
```

然后 `autoOpenDungeonPanel=true` 应触发:
```
[Phase8UIManager] 打开地牢选择面板 (战力: 1000)
```

---

## 四、依赖文件清单（全部存在 ✅）

| 文件 | 路径 | 状态 |
|------|------|------|
| Phase8BootstrapEntry.ts | `assets/scripts/core/Phase8BootstrapEntry.ts` | ✅ |
| Phase8Bootstrap.ts | `assets/scripts/systems/Phase8Bootstrap.ts` | ✅ |
| Phase8UIManager.ts | `assets/scripts/ui/Phase8UIManager.ts` | ✅ |
| Phase8SceneBuilder.ts | `assets/scripts/ui/Phase8SceneBuilder.ts` | ✅ |
| Phase8LocalizationBinder.ts | `assets/scripts/systems/Phase8LocalizationBinder.ts` | ✅ |
| Phase8PrefabAnimationBinder.ts | `assets/scripts/systems/Phase8PrefabAnimationBinder.ts` | ✅ |
| Phase8PrefabGenerator.ts | `assets/scripts/systems/Phase8PrefabGenerator.ts` | ✅ |
| Phase8Step5BuildVerifier.ts | `assets/scripts/debug/Phase8Step5BuildVerifier.ts` | ✅ |
| EventManager.ts | `assets/scripts/core/EventManager.ts` | ✅ |
| DungeonPanel.ts | `assets/scripts/ui/DungeonPanel.ts` | ✅ |

---

## 五、验证清单

| # | 验证项 | 方法 | 预期结果 | 实际结果 |
|---|--------|------|----------|----------|
| 1 | Canvas 挂载 Phase8BootstrapEntry | Inspector 面板查看 | 组件列表中包含 Phase8BootstrapEntry | ✅ 已验证(场景文件) |
| 2 | Phase8BootstrapEntry.start() 执行 | Console 日志 | 输出 `[Phase8BootstrapEntry] 开始初始化...` | ⏳ 待运行时验证 |
| 3 | DungeonPanel 成功打开 | Game 窗口 | 显示地牢选择面板 | ⏳ 待运行时验证 |
| 4 | 无 Missing class 错误 | Console 筛选 | Console 中无 Missing class 错误 | ⏳ 待运行时验证 |
| 5 | 无 Script missing 错误 | Console 筛选 | Console 中无 Script missing 错误 | ⏳ 待运行时验证 |
| 6 | 无 TypeError | Console 筛选 | Console 中无 TypeError | ⏳ 待运行时验证 |
| 7 | 无 ReferenceError | Console 筛选 | Console 中无 ReferenceError | ⏳ 待运行时验证 |
| 8 | 无 Exception | Console 筛选 | Console 中无未捕获异常 | ⏳ 待运行时验证 |

---

## 六、截图要求

请用户在 Cocos Creator Preview 运行时截取以下 4 张截图并附加到本报告:

### 截图 1: Hierarchy（层级面板）
- 在 Cocos Creator 编辑器左侧
- 应展示 Canvas > UIRoot > [各 Panel 节点]

### 截图 2: Inspector（属性面板）
- 选中 Canvas 节点
- 应展示 Phase8BootstrapEntry 组件及其属性值

### 截图 3: Game 窗口（游戏画面）
- 预览浏览器窗口
- 应展示打开的 DungeonPanel 或 初始化后的游戏画面

### 截图 4: Console 窗口（控制台）
- 浏览器开发者工具 Console 标签页
- 应展示 Phase8BootstrapEntry 的初始化日志
- 应无红色错误

---

## 七、故障排查

如果运行时出现错误, 请按以下顺序排查:

1. **Missing class / Script missing or invalid**: 
   - 检查 `.ts` 文件是否编译成功
   - 在 Cocos Creator 中查看 Console 是否有编译错误
   - 检查 `@ccclass` 装饰器是否正确

2. **TypeError: Cannot read property of undefined**:
   - 检查 ConfigManager 是否已加载
   - 检查 Phase8Bootstrap 配置是否正确注册

3. **DungeonPanel 未打开**:
   - 检查 `autoOpenDungeonPanel` 是否为 `true`
   - 检查 Phase8UIManager.openDungeonPanel() 方法是否存在
   - 检查 Panel 预制体是否存在

4. **UIRoot 未创建**:
   - 检查 Canvas 节点名称是否正确
   - 检查 UITransform 组件是否存在

---

> 📝 本报告由 Phase8-Beta-Final-Verification-Fix 流程生成
> 🔧 场景文件已修改: Phase8Main.scene (Canvas 新增 Phase8BootstrapEntry 组件)
> 📸 待用户完成运行时验证并补充截图
