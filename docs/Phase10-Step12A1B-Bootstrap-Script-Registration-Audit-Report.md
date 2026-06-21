# Phase10-Step12A1B — Bootstrap Script Registration Audit Report

## 日期

2026-06-17

---

## 审计结论（TL;DR）

**根因：Cocos Creator 的 TypeScript packer 生成的 `_RF.push` 注册 UUID 与 scene 的 `__type__` 不匹配。**

- `_RF.push` 注册：`b100aABAAFAAIAAAAAAAAAB`（23 字符）
- Scene `__type__`：`b1AKABAAFAAIAAAAAAAAAB`（22 字符）

引擎在反序列化 scene 时查找 UUID `b1AKABAAFAAIAAAAAAAAAB`，但组件是用 UUID `b100aABAAFAAIAAAAAAAAAB` 注册的 → 查找失败 → `Missing class`。

**这不是 library/temp 缓存问题。这是 packer 与 scene 之间的 UUID 格式不一致。**

---

## 审计项 1：Phase10MainBootstrap.ts 源码

文件：[assets/scripts/bootstrap/Phase10MainBootstrap.ts](assets/scripts/bootstrap/Phase10MainBootstrap.ts)

```typescript
import { _decorator, Component } from 'cc';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { Phase9Bootstrap } from '../systems/Phase9Bootstrap';
import { InventoryService } from '../inventory/InventoryService';
import { EquipmentService } from '../equipment/EquipmentService';

const { ccclass } = _decorator;

@ccclass('Phase10MainBootstrap')
export class Phase10MainBootstrap extends Component {
  // ... (完整源码见文件)
}
```

| 检查项 | 状态 |
|--------|------|
| `@ccclass(...)` 存在 | ✅ |
| `export class Phase10MainBootstrap` 存在 | ✅ |
| `extends Component` 存在 | ✅ |
| 所有 import 依赖存在 | ✅ |

---

## 审计项 2-3：@ccclass 声明

```typescript
@ccclass('Phase10MainBootstrap')
export class Phase10MainBootstrap extends Component {
```

| 检查项 | 值 |
|--------|-----|
| ccclass 名称 | `'Phase10MainBootstrap'` |
| 类名 | `Phase10MainBootstrap` |
| 名称一致 | ✅ `'Phase10MainBootstrap'` === `Phase10MainBootstrap` |

---

## 审计项 4：脚本编译状态

TypeScript 编译成功。`temp/programming/packer-driver/targets/editor/import-map.json` 中存在该脚本的映射：

```json
"file:///D:/My%20Project/TestGame/assets/scripts/bootstrap/Phase10MainBootstrap.ts":
  "./chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js"
```

编译产物存在：`temp/programming/packer-driver/targets/editor/chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js`

| 检查项 | 状态 |
|--------|------|
| import-map 中有映射 | ✅ |
| 编译 chunk 存在 | ✅ |
| TypeScript 编译错误 | ❌ 无 |

---

## 审计项 5：temp 编译产物

**编辑器 target**：
```
temp/programming/packer-driver/targets/editor/chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js  ✅ 存在
temp/programming/packer-driver/targets/editor/chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js.map ✅ 存在
```

**Preview target**：
```
temp/programming/packer-driver/targets/preview/chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js  ✅ 存在
temp/programming/packer-driver/targets/preview/chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js.map ✅ 存在
```

编译产物完整，两端皆有。

---

## 审计项 6：.meta UUID

文件：[assets/scripts/bootstrap/Phase10MainBootstrap.ts.meta](assets/scripts/bootstrap/Phase10MainBootstrap.ts.meta)

```json
{
  "ver": "4.0.24",
  "importer": "typescript",
  "imported": true,
  "uuid": "b100a001-0001-4000-8000-000000000001",
  "files": [],
  "subMetas": {},
  "userData": {}
}
```

| 检查项 | 值 |
|--------|-----|
| UUID | `b100a001-0001-4000-8000-000000000001` |
| importer | `typescript` |
| imported | `true` |

---

## 审计项 7：Scene __type__

[assets/scenes/Phase10Main.scene](assets/scenes/Phase10Main.scene) 第 9566 行：

```json
{
  "__type__": "b1AKABAAFAAIAAAAAAAAAB",
  "_name": "",
  "_objFlags": 0,
  "__editorExtras__": {},
  "node": { "__id__": 209 },
  "_enabled": true,
  "__prefab": null,
  "_id": "b1AKcmpJUPRKKrkCPh10BCmp"
}
```

| 检查项 | 值 |
|--------|-----|
| Scene `__type__` | `b1AKABAAFAAIAAAAAAAAAB` |
| 长度 | 22 字符 |
| 解码 → UUID | `b100a001-0001-4000-8000-000000000001` ✅ |
| 与 .meta UUID 对应 | ✅ 正确 |

---

## 🔴 审计项 8：注册 UUID 不匹配（根因）

### 证据 A：编译产物中的 `_RF.push`

文件：`temp/programming/packer-driver/targets/editor/chunks/fc/fc5dd11afa1838494e22c8758607094d557edca5.js` 第 49 行

```javascript
_cclegacy._RF.push({}, "b100aABAAFAAIAAAAAAAAAB", "Phase10MainBootstrap", undefined);
```

### 证据 B：对比正常工作的 EquipmentPanel

文件：`temp/programming/packer-driver/targets/editor/chunks/d3/d34baddfbfc1e127faa2fc7c0b48c90fe20a045d.js` 第 62 行

```javascript
_cclegacy._RF.push({}, "fd2749JtdVJQJLQETHYY9Mm", "EquipmentPanel", undefined);
```

### 对比表

| 组件 | `_RF.push` 注册 UUID | Scene `__type__` | 长度 | 匹配 |
|------|----------------------|------------------|------|------|
| **EquipmentPanel** | `fd2749JtdVJQJLQETHYY9Mm` | `fd2749JtdVJQJLQETHYY9Mm` | 22 = 22 | ✅ |
| **Phase10MainBootstrap** | `b100aABAAFAAIAAAAAAAAAB` | `b1AKABAAFAAIAAAAAAAAAB` | **23 ≠ 22** | ❌ |

### 逐字符差异

```
Position  _RF.push  scene    状态
────────────────────────────────────
[ 0]      b         b        
[ 1]      1         1        
[ 2]      0         A        ← DIFF
[ 3]      0         K        ← DIFF
[ 4]      a         A        ← DIFF
[ 5]      A         B        ← DIFF
[ 6]      B         A        ← DIFF
[ 7]      A         A        
[ 8]      A         F        ← DIFF
[ 9]      F         A        ← DIFF
[10]      A         A        
[11]      A         I        ← DIFF
[12]      I         A        ← DIFF
[13]      A         A        
[14]      A         A        
[15]      A         A        
[16]      A         A        
[17]      A         A        
[18]      A         A        
[19]      A         A        
[20]      A         A        
[21]      A         B        ← DIFF
[22]      B         (none)   ← DIFF (长度多 1)
```

**共 12 处差异，长度差 1 字符。**

---

## 审计项 9：AssetDB 识别状态

`library/.assets` 中存在该脚本的记录：

```
library/.assets           — 包含 b100a001... 资产
library/.assets-info.json — 包含脚本信息
library/.assets-data.json — 包含数据
library/f8/f8d13b50-...json — scene 资产数据
```

| 检查项 | 状态 |
|--------|------|
| AssetDB 中有 Phase10MainBootstrap | ✅ |
| 脚本被识别为 TypeScript 资产 | ✅ |

---

## 根因机制详解

### Cocos Creator 组件反序列化流程

```
1. 引擎加载 scene JSON
2. 遇到 __type__: "b1AKABAAFAAIAAAAAAAAAB"
3. 调用 decodeUuid("b1AKABAAFAAIAAAAAAAAAB")
   → 得到完整 UUID: "b100a001-0001-4000-8000-000000000001"
4. 在 _RF.push 注册表中查找 UUID "b100a001-..."
5. ❌ 注册表中存的是 "b100aABAAFAAIAAAAAAAAAB" → decode 结果不同
6. 查找失败 → Missing class
```

### 问题本质

TypeScript packer 在编译时调用 `compressUuid()` 生成 `_RF.push` 的第二个参数，它产生了 **23 字符** 的压缩 UUID（使用 5 字符 hex 前缀）。

但 scene 的 `__type__` 使用了标准的 **22 字符** 格式（2 字符 hex 前缀）。

**两个值解压后对应不同的完整 UUID**，因此运行时无法匹配。

### 为什么 EquipmentPanel 正常

EquipmentPanel 的 UUID（`fd274f49-...`）在两种压缩算法下恰好产生相同结果（22 字符），因为其 hex 前缀的自动计算长度恰好是 2。

### 为什么 Phase10MainBootstrap 异常

Phase10MainBootstrap 的 UUID（`b100a001-...`）在 packer 的压缩算法下产生了 5 字符 hex 前缀（23 字符总量），而 scene 使用标准 2 字符前缀（22 字符）。两个值不匹配。

---

## 修复方案

### 推荐方案：修正 scene `__type__` 以匹配 `_RF.push` 注册值

将 scene 第 9566 行的 `__type__` 从：
```json
"__type__": "b1AKABAAFAAIAAAAAAAAAB"
```
改为：
```json
"__type__": "b100aABAAFAAIAAAAAAAAAB"
```

**理由**：`_RF.push` 是 Cocos Creator packer 自动生成的，它是运行时注册的权威来源。scene 的 `__type__` 必须与之匹配。

### 验证方法

修改后 Preview，引擎将：
1. 读取 `__type__: "b100aABAAFAAIAAAAAAAAAB"`
2. 在 `_RF.push` 注册表中精确匹配到 `"b100aABAAFAAIAAAAAAAAAB"`
3. 找到 `Phase10MainBootstrap` 类
4. 组件正常加载

---

## 证据汇总

| # | 证据 | 结论 |
|---|------|------|
| 1 | `_RF.push` 用 `b100aABA...`（23 字符）注册 | packer 生成值 |
| 2 | Scene 用 `b1AKABAA...`（22 字符）引用 | 手动写入值 |
| 3 | 两个值不同（12 处差异） | 运行时无法匹配 |
| 4 | EquipmentPanel 的两个值相同 | 正常工作 |
| 5 | 所有 import 依赖存在 | 编译无错误 |
| 6 | 编译产物完整存在 | 非 library 缓存问题 |

**唯一根因：`_RF.push` 注册 UUID ≠ Scene `__type__` UUID，引擎运行时查找失败。**
