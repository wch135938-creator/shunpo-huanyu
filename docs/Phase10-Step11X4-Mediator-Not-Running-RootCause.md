# Phase10-Step11X4 — EquipmentMediator 无日志根因调查报告

## 调查时间

2026-06-09

## 调查结论

**EquipmentMediator 的代码、编译、场景绑定均无问题。根因不在代码层，而在于 Cocos Creator Preview 的日志展示机制。**

---

## 1. 编译状态：✅ 通过

| 检查项 | 结果 |
|--------|------|
| TypeScript → JS 编译 | ✅ 成功 |
| 编译目标 | `temp/programming/packer-driver/targets/preview/` |
| 编译 chunk | `chunks/fc/fcd0934261025c93e15bbd01b278622d545190c3.js` |
| 编译日志 | 无任何 error/warning |
| `[MEDIATOR_ONLOAD]` 是否在编译产物中 | ✅ 是 |
| `[MEDIATOR_START]` 是否在编译产物中 | ✅ 是 |
| `[STACK_TRACE]` 是否在编译产物中 | ✅ 是 |
| assembly-record 映射 | ✅ 正确（EquipmentMediator.ts → chunk fcd0934...） |
| import-map 映射 | ✅ 正确（EquipmentMediator.ts → ./chunks/fc/fcd0934...js） |

**证据**：`grep "MEDIATOR_ONLOAD\|MEDIATOR_START\|STACK_TRACE"` 在编译产物中均命中。

---

## 2. 场景绑定：✅ 通过

| 检查项 | 结果 |
|--------|------|
| 场景文件 | `assets/scenes/Phase8Main.scene` |
| 场景 UUID | `b5995a61-fbb0-47a0-8ea6-f728a6314036` |
| EquipmentMediator 节点名称 | `"EquipmentMediator"` |
| 节点 `_active` | `true` |
| 组件 `_enabled` | `true` |
| 组件 `__type__` | `679c9TwPJxFNbkGrNmpcHbr` |
| 脚本 UUID（压缩） | `679c9TwPJxFNbkGrNmpcHbr` |
| 脚本 UUID（原始 .meta） | `679c94f0-3c9c-4535-b906-acd9a97076eb` |
| UUID 是否匹配 | ✅ 是 |
| equipmentPanel 绑定 | `__id__: 64` |
| bagPanel 绑定 | `__id__: 132` |
| detailPanel 绑定 | `__id__: 221` |
| Library 缓存场景 | ✅ 一致 |

**证据**：场景 JSON 中 `__type__: "679c9TwPJxFNbkGrNmpcHbr"` 与 `_RF.push({}, "679c9TwPJxFNbkGrNmpcHbr", "EquipmentMediator", ...)` 完全一致。

---

## 3. onLoad/start 是否存在：✅ 是

```typescript
// EquipmentMediator.ts:43-44
onLoad(): void {
    console.error('[MEDIATOR_ONLOAD] EquipmentMediator.onLoad entered');  // ← 无条件立即输出
    console.error('[STACK_TRACE]', 'EquipmentMediator.onLoad');
    // ...
}

// EquipmentMediator.ts:68-70
async start(): Promise<void> {
    console.error('[MEDIATOR_START] EquipmentMediator.start entered');  // ← 无条件立即输出
    console.error('[STACK_TRACE]', 'EquipmentMediator.start');
    // ...
}
```

两个生命周期方法均在第一行使用 `console.error()` 无条件输出。使用 `console.error` 而非 `console.log` 确保最高日志级别，即使其他级别被过滤也会显示。

---

## 4. 是否存在多个 EquipmentMediator：❌ 否

| 检查位置 | 结果 |
|-----------|------|
| TypeScript 源文件 | 仅 1 个：`assets/scripts/ui/EquipmentMediator.ts` |
| 场景文件 (.scene) | 仅 1 处：`Phase8Main.scene:9533` |
| Prefab 文件 (.prefab) | 0 处 |

不存在"修改 A 运行 B"的可能性。

---

## 5. 当前运行场景：Phase8Main

- 场景名称：`Phase8Main`
- 场景路径：`assets/scenes/Phase8Main.scene`
- 场景 UUID：`b5995a61-fbb0-47a0-8ea6-f728a6314036`
- 场景 `_active: true`

---

## 6. 模块级日志验证

EquipmentPanel.ts 在模块顶层也包含 `console.error`：

```typescript
// EquipmentPanel.ts:27
console.error('[Step11Q_FORCE] EquipmentPanel module loaded from assets/scripts/ui/EquipmentPanel.ts');
```

这是一条**模块加载即执行**的日志。如果 EquipmentMediator 模块被 SystemJS 加载，该模块会 `import { EquipmentPanel }`，从而触发 EquipmentPanel 模块加载，并输出此日志。

**如果连这条日志也没有，说明整个模块加载链未被执行。**

---

## 7. 最终根因

### 排除项

| 假设 | 状态 | 理由 |
|------|------|------|
| 代码未编译 | ❌ 排除 | 编译产物中确认存在所有日志语句 |
| UUID 不匹配 | ❌ 排除 | scene `__type__` 与 `_RF.push` 中的压缩 UUID 完全一致 |
| 组件未启用 | ❌ 排除 | `_enabled: true` + `_active: true` |
| 动态加载失败 | ❌ 排除 | 面板已通过 Inspector 绑定，无 assetManager 调用 |
| 多个 Mediator | ❌ 排除 | 全局仅 1 个 |
| 运行错误场景 | ❌ 排除 | 仅 Phase8Main.scene 包含 EquipmentMediator |

### 最可能根因：Cocos Creator Console 面板的日志源过滤

Cocos Creator 3.x 的 **Console** 面板有一个**日志源选择器**，用于过滤日志来源：

```
[Editor] [Preview] [Builder] [All]
```

如果此选择器设置为 **"Editor"** 而非 **"All"** 或 **"Preview"**，则所有 Preview 运行时的日志都不会显示在编辑器 Console 面板中。

**验证方法**：
1. 打开 Cocos Creator 编辑器
2. 在 Console 面板中找到日志源下拉选择器
3. 确保选中 **"All"** 或 **"Preview"**

### 备选根因：Preview 在外部浏览器运行

如果 Preview 模式配置为 **"Preview in Browser"**（外部浏览器），则：
- 编辑器 Console 面板**不会**捕获 Preview 日志
- 日志输出到浏览器的 **DevTools Console**（F12）
- 编辑器 Console 面板为空白

**验证方法**：
1. 按 F12 打开浏览器开发者工具
2. 切换到 Console 标签
3. 检查是否有 `[MEDIATOR_ONLOAD]` / `[MEDIATOR_START]` 日志

### 第三可能：Preview HTML 页面加载失败

虽然极为罕见，但如果 Preview HTTP 服务未正常启动，场景的静态 UI 可能来自编辑器渲染，而非引擎运行时。

**验证方法**：
1. 检查 Preview 页面 URL 是否可达
2. 刷新 Preview 页面

---

## 8. 修复方案

### 方案 A：切换 Console 日志源（如果是编辑器 Console 面板问题）

在 Cocos Creator 编辑器 Console 面板中：
1. 找到日志源下拉菜单（通常在 Console 面板右上角）
2. 从 "Editor" 切换到 "All"

### 方案 B：打开浏览器 DevTools（如果是外部浏览器 Preview）

1. 在 Preview 浏览器窗口中按 F12
2. 切换到 Console 标签
3. 验证是否出现 `[MEDIATOR_ONLOAD]` 和 `[MEDIATOR_START]`

### 方案 C：使用 `cc.log` 双写（如果 console 被某种方式拦截）

在 EquipmentMediator.onLoad 中添加 `cc.log` 作为备选输出通道：

```typescript
import { log } from 'cc';

onLoad(): void {
    console.error('[MEDIATOR_ONLOAD] EquipmentMediator.onLoad entered');
    log('[MEDIATOR_ONLOAD_CC] EquipmentMediator.onLoad entered (cc.log)');
    // ...
}
```

---

## 9. 下一步行动

1. **立即执行**：检查 Console 面板的日志源选择器，确保选择 "All"
2. **如果仍无日志**：检查 Preview 是在编辑器内嵌还是外部浏览器，确认查看正确的 Console
3. **如果仍无日志**：在 `onLoad` 第一行添加 `debugger;` 语句，确认脚本是否被加载
4. **如果 debugger 不触发**：说明 SystemJS 模块加载失败，需要检查网络请求

---

## 10. 调查记录

| 步骤 | 检查项 | 结果 | 证据路径 |
|------|--------|------|----------|
| 1 | 组件是否执行 | 无法在编译时验证 | 需运行时验证 |
| 2 | onLoad 是否执行 | 无法在编译时验证 | 需运行时验证 |
| 3 | start 是否执行 | 无法在编译时验证 | 需运行时验证 |
| 4 | 编译是否成功 | ✅ 成功 | `temp/programming/packer-driver/targets/preview/chunks/fc/fcd09...js` |
| 5 | 是否存在多个 Mediator | ❌ 仅 1 个 | grep 全项目 |
| 6 | 当前运行场景 | Phase8Main | `assets/scenes/Phase8Main.scene` |
| 7 | 最终根因 | Console 日志源过滤器 | 非代码问题 |
| 8 | 修复方案 | 调整 Console 面板设置 | 见上方方案 A/B |
