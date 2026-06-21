# Phase10-Step11N Runtime Verification Report

**日期:** 2026-06-08

**状态:** 静态分析完成，运行时验证待执行（需编辑器编译）

---

## 执行摘要

**无法完成运行时验证。** Cocos Creator 编辑器未运行，无法启动 Preview 并捕获浏览器 Console 输出。

已完成以下替代分析：
- 编译产物静态审计
- 类继承链追溯
- 源码 vs 编译产物一致性验证
- 时间戳比对

---

## 1. 编译产物静态审计

### 时间戳比对

| 文件 | 修改时间 | 编译时间 | 一致性 |
|------|---------|---------|--------|
| EquipmentBagPanel.ts | 15:37 | 15:47 | ✅ 一致 |
| EquipmentMediator.ts | **16:16** | 16:10 | ❌ **编译产物早于源文件** |

**结论：Step11N 新增代码未编译进当前 chunk。** EquipmentMediator 源文件在 16:16 修改，但编译 chunk 是 16:10 的版本。Cocos Creator 编辑器未运行，未触发重新编译。

### 编译产物验证

**EquipmentMediator 编译 chunk** (`temp/.../chunks/fc/fcd093...js`):
- ✅ 包含 Step11M 诊断日志（行 380-394）
- ❌ **不包含** Step11N 调试代码（`open.toString()`, `FORCE PATCH` 猴子补丁等）
- `_openBagPanel()` 方法在第 377 行定义
- `this.bagPanel.open(heroId, slotId)` 在第 393 行调用

**EquipmentBagPanel 编译 chunk** (`temp/.../chunks/4b/4b51c58a...js`):
- ✅ 包含 `open(heroId, preselectedSlot)` 方法（行 243）
- ✅ 包含 `console.log('[EquipmentBagPanel] open — heroId=', ...)`（行 244）
- ✅ 包含 `this._ensureInit()` 调用（行 246）
- ✅ `_ensureInit()` 包含 `console.log('[EquipmentBagPanel] _ensureInit — 首次初始化开始')`（行 292）
- ✅ `_bindEvents()` 包含 `console.log('[EquipmentBagPanel] _bindEvents 完成')`（行 300）

---

## 2. 类继承链追溯 — `open()` 到底是谁的？

### 完整继承链

```
cc.Component
  └─ BasePanel (core/BasePanel.ts)
       └─ EquipmentBagPanel (ui/EquipmentBagPanel.ts)
```

### Component 类

Cocos Creator 3.8.8 `Component` 类的生命周期方法：
`onLoad`, `start`, `update`, `lateUpdate`, `onDestroy`, `onEnable`, `onDisable`

**→ Component 没有 `open` 方法。**

### BasePanel 类

BasePanel 的方法：
`show()`, `hide()`, `close()`, `isShowing()`, `onShow()`, `onHide()`, `onClose()`, `registerEvents()`, `unregisterEvents()`, `playShowAnimation()`, `playHideAnimation()`, `applySafeArea()`

**→ BasePanel 没有 `open` 方法。**

### EquipmentBagPanel 类

**→ EquipmentBagPanel 是唯一定义 `open(heroId, preselectedSlot)` 的类。**
不存在父类覆盖。

### 编译产物确认

```javascript
// BasePanel 编译 chunk (667f...js)
grep: ".open\s*[=(]|open\s*\(" → NO MATCHES
```

**→ BasePanel 在编译产物中也没有 `open`。三重确认：无父类覆盖。**

---

## 3. `bagPanel.open()` 调用链完整追踪

### 调用入口

```
EquipmentMediator._openBagPanel(slotId)         // 行 377
  └─ this.bagPanel.open(heroId, slotId)         // 行 393
       └─ EquipmentBagPanel.prototype.open()    // 行 243
            ├─ console.log('[EquipmentBagPanel] open...') // 行 244
            └─ this._ensureInit()               // 行 246
                 ├─ console.log('[EquipmentBagPanel] _ensureInit...') // 行 292
                 └─ this._bindEvents()          // 行 298
                      └─ console.log('[EquipmentBagPanel] _bindEvents 完成') // 行 300
```

### Step11M 运行时实际观察

| 日志 | 预期出现 | 实际出现 |
|------|---------|---------|
| `[EquipmentMediator] _openBagPanel — slotId=` | ✅ | ✅ |
| `[EquipmentMediator] bagPanel.constructor.name = EquipmentBagPanel` | ✅ | ✅ |
| `[EquipmentMediator] typeof bagPanel.open = function` | ✅ | ✅ |
| `[EquipmentMediator] typeof bagPanel._ensureInit = function` | ✅ | ✅ |
| `[EquipmentMediator] bagPanel._initialized = false` | ✅ | ✅ |
| `[EquipmentMediator] 即将调用 bagPanel.open(...)` | ✅ | ✅ |
| `[EquipmentMediator] bagPanel.open() 返回` | ✅ | ✅ |
| **`[EquipmentBagPanel] open — heroId=...`** | ✅ | **❌ 未出现** |
| **`[EquipmentBagPanel] _ensureInit — 首次初始化开始`** | ✅ | **❌ 未出现** |
| **`[EquipmentBagPanel] _bindEvents 完成`** | ✅ | **❌ 未出现** |

---

## 4. 矛盾分析

### 矛盾点

编译产物中 **明确存在** 的 `console.log` 语句，在运行时 **完全没有执行**，而同一编译周期产出的 `EquipmentMediator` 日志 **正常执行**。

### 排除项

| 假设 | 状态 |
|------|------|
| 父类 `BasePanel` 覆盖 `open` | ❌ 排除 — BasePanel 没有 `open` |
| 猴子补丁替换 `open` | ❌ 排除 — 搜索整个代码库未发现 |
| Cocos `Component` 有 `open` | ❌ 排除 — 引擎无此方法 |
| `@property` 命名冲突 | ❌ 排除 — 无 `open` 属性 |
| 编译错误导致方法缺失 | ❌ 排除 — 编译 chunk 中 `open` 存在且完整 |
| `bagPanel` 不是 `EquipmentBagPanel` 实例 | ⚠️ 未排除 — `constructor.name` 只是字符串，可能被篡改 |

### 最可能根因

**运行时加载的 `EquipmentBagPanel` 编译 chunk 与当前 `temp/` 目录中的 chunk 不是同一版本。**

可能的机制：
1. **编辑器热重载缓存** — 编辑器在 Preview 模式下的编译缓存可能不同于 `temp/programming/` 目录，尤其是当编辑器打开后多次修改文件时
2. **Prefab 内嵌组件实例** — 如果 `EquipmentBagPanel` prefab 实例在场景中保存时带有旧版本的组件快照，运行时可能使用该快照而非最新编译版本
3. **编译时序问题** — Step11M 运行时测试可能发生在 EquipmentBagPanel chunk 更新（15:47）和 EquipmentMediator chunk 更新（16:10）之间的某个编译状态

### 支持证据

- EquipmentBagPanel chunk 编译时间（15:47）早于 EquipmentMediator chunk（16:10）
- 两者相差 23 分钟，可能处于不同的编译周期
- 如果预览服务器在 15:47 之前启动并缓存了旧的 EquipmentBagPanel chunk，后续即使 TS 源文件更新，旧 chunk 仍可能被服务

---

## 5. 实际命中情况判断

**无法判断 A/B/C — 需要编辑器重新编译并启动 Preview。**

当前状态：
- 情况 C 的部分特征：`[Step11N][FORCE PATCH]` 不会出现（代码未编译）
- 但 Step11M 日志会出现（已编译）
- EquipmentBagPanel 日志的行为取决于编译缓存状态

---

## 6. 下一步建议

### 立即行动

1. **打开 Cocos Creator 编辑器** — 通过 Cocos Dashboard 打开项目
2. **等待编译完成** — 观察编辑器底部状态栏，确认 "compilation complete"
3. **启动 Preview** — 点击 Preview 按钮（或 Ctrl+P）
4. **打开浏览器 DevTools** — Console 标签
5. **操作 UI** — 点击 Weapon 空槽
6. **观察以下关键日志**：

```
关键日志 1: [Step11N] bagPanel.open.toString = ...
  → 显示 bagPanel.open 的实际函数源码（前 500 字符）
  → 如果包含 "[EquipmentBagPanel] open" 字符串 → 函数正确
  → 如果不包含 → 确认函数被替换

关键日志 2: [Step11N] before patch originalOpen.toString = ...
  → 猴子补丁截获的原始函数源码

关键日志 3: [Step11N][FORCE PATCH] bagPanel.open intercepted args = ...
  → 确认 open() 被调用

关键日志 4: [EquipmentBagPanel] open — heroId=... preselectedSlot=...
  → 如果 FORCE PATCH 出现但此日志不出现 → originalOpen 不是 EquipmentBagPanel.open()
  → 如果都出现 → 链路正常，之前是观察问题
```

### 如果编辑器不可用

可尝试：
```bash
# 检查是否有 Cocos Creator CLI
npx cocos --help

# 或直接构建 web-desktop 版本
# (需要编辑器支持)
```

### 如果确认 `open` 被覆盖

需要在运行时进一步定位是谁/什么替换了 `open`，可能的方向：
- 检查 Prefab 元数据（`.prefab` 文件中的组件序列化）
- 检查是否有全局拦截器（如 AOP/装饰器框架）
- 检查 `getComponent('EquipmentBagPanel')` 是否返回了代理对象

---

## 7. 附录：文件修改清单

### 已修改文件

```
assets/scripts/ui/EquipmentMediator.ts
  - _openBagPanel() 方法：新增 Task 1 (open.toString) + Task 2 (FORCE PATCH)
  - _openDetailPanel() 方法：新增 Task 1 (open.toString) + Task 2 (FORCE PATCH)
```

### 只读查阅文件

```
assets/scripts/core/BasePanel.ts — 确认无 open() 方法
assets/scripts/ui/EquipmentBagPanel.ts — open() 定义位置
assets/scripts/ui/EquipmentDetailPanel.ts — open() 定义位置
temp/programming/packer-driver/targets/preview/chunks/fc/fcd093...js — EquipmentMediator 编译产物
temp/programming/packer-driver/targets/preview/chunks/4b/4b51c58a...js — EquipmentBagPanel 编译产物
temp/programming/packer-driver/targets/preview/chunks/66/667f...js — BasePanel 编译产物
```
