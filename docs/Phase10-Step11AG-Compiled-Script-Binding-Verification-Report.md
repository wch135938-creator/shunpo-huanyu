# Phase10-Step11AG: Compiled Script Binding Verification Report

**Date:** 2026-06-11
**Status:** Awaiting User Verification
**Purpose:** 确认 Preview 运行的是否为最新编译的 TypeScript 脚本

---

## Probe 位置

### EquipmentBagPanel.ts

| Probe | 位置 | 触发时机 |
|-------|------|----------|
| `module loaded` | 文件级（import 之后，class 定义之前）— Line 23 | 模块首次加载时 |
| `onLoad entered` | `onLoad()` 方法第一行 — Line ~120 | 节点 onLoad 时 |
| `open entered` | `open()` 方法第一行 — Line ~143 | 打开面板时 |
| `ensureInit entered` | `_ensureInit()` 方法第一行 — Line ~185 | 首次 open 调用时 |

### EquipmentItemView.ts

| Probe | 位置 | 触发时机 |
|-------|------|----------|
| `module loaded` | 文件级（import 之后，class 定义之前）— Line 16 | 模块首次加载时 |
| `onLoad entered` | `onLoad()` 方法第一行 — Line ~78 | 节点 onLoad 时 |

---

## 修改确认

- **只添加了** `console.error('[Step11AG_FORCE] ...')` 探针
- **未修改**任何业务逻辑
- **未修改** Prefab、Scene、Inventory、Presenter、Mediator
- **未修改**任何现有代码（仅新增日志行）

---

## 编译验证

- 新增代码仅为 `console.error()` 调用，无语法风险
- 位于合法 TypeScript 位置（模块级作用域 和 方法体顶部）
- Cocos Creator 3.8.8 编译器将在 Preview 时进行编译

---

## 用户验证步骤

### Step 1: Preview

在 Cocos Creator 编辑器中点击 **Preview** 按钮。

### Step 2: 打开控制台

打开浏览器开发者工具 → Console 面板。

### Step 3: 搜索

在 Console 搜索框中输入：

```
Step11AG_FORCE
```

### Step 4: 截图

截图搜索结果，发回。

---

## 验收标准

### ✅ PASS（脚本是最新的）

至少出现 **1 条** `[Step11AG_FORCE]` 日志。预期至少会看到：

```
[Step11AG_FORCE] EquipmentBagPanel module loaded
[Step11AG_FORCE] EquipmentBagPanel onLoad entered
[Step11AG_FORCE] EquipmentBagPanel open entered
[Step11AG_FORCE] EquipmentBagPanel ensureInit entered
[Step11AG_FORCE] EquipmentItemView module loaded
[Step11AG_FORCE] EquipmentItemView onLoad entered
```

### ❌ FAIL（脚本不是最新的）

搜索 `Step11AG_FORCE` 返回 **0 条结果**。

**结论：** 当前运行的不是最新编译的脚本。

**下一步：** 转入脚本绑定 / 编译链路排查，禁止继续猜 UI 根因。

---

## 注意

- `[Step11AF]` 日志（旧的探针）与 `[Step11AG_FORCE]` 日志（新的探针）**并存**在文件中
- 搜索时应使用 `Step11AG_FORCE` 作为关键字以区分新旧探针
- **在确认运行的是最新脚本之前，禁止继续排查 UI 根因**
