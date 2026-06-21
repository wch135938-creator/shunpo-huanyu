# Phase10-Step11AF Red-Log Runtime Trace

**日期**: 2026-06-11
**目标**: 用 `console.error`（红色高亮）采集 EquipmentBagPanel 完整渲染链路运行时日志
**原则**: 不猜测、不模拟、不修代码 — 只收集真实运行时证据

---

## 变更摘要

### 修改文件

| 文件 | 变更 |
|------|------|
| [EquipmentBagPanel.ts](../assets/scripts/ui/EquipmentBagPanel.ts) | 所有 Step11AD 日志 → Step11AF；`console.log` → `console.error`；新增 4 个入口日志点 |
| [EquipmentItemView.ts](../assets/scripts/ui/EquipmentItemView.ts) | 所有 Step11AD 日志 → Step11AF；`console.log` → `console.error` |

### 日志级别

全部使用 `console.error` → 在 Cocos Creator DevTools Console 中显示为**红色**，极易定位。

### 验证

- `[Step11AD]` 残留：**0 处**
- `[Step11AF]` 总数：**22 处**（EquipmentBagPanel: 20, EquipmentItemView: 2）
- 日志级别：**全部 console.error**

---

## 完整日志清单（按运行时顺序）

打开 EquipmentBagPanel → 武器分类时，预期控制台输出以下红色日志：

```
[Step11AF] open entered — heroId= <英雄ID> preselectedSlot= <预选槽位或none>
[Step11AF] _ensureInit entered — _initialized= <true/false> node.active= <true/false>
[Step11AF] itemTemplate = <Prefab对象或null>
[Step11AF] contentNode = <Node对象或null>
[Step11AF] _ensureItemTemplateLoaded called, itemTemplate= <Prefab对象或null>

    ... (如果 itemTemplate=null，触发异步加载) ...
    [Step11AF] itemTemplate is null, attempting async load with UUID= d2b3c4e5-f6a7-8901-bcde-f12345678901
    [Step11AF] Failed to load default EquipmentItemView prefab: <错误信息>

[Step11AF] render entries = <数字>
[Step11AF] create item entered — pool.size= <数字> activeItems= <数字>
[Step11AF] itemPrefab = <Prefab对象或null>
[Step11AF] instantiate start
[Step11AF] instantiate success
[Step11AF] getComponent = <EquipmentItemView对象或null>
[Step11AF] addChild success
[Step11AF] EquipmentItemView onLoad — node= <节点名>
[Step11AF] EquipmentItemView setData — name= <装备名> uniqueId= <uniqueId>
[Step11AF] childCount = <数字>
```

---

## 关键日志点定位表

| 日志 | 所在文件 | 行号 | 含义 |
|------|---------|------|------|
| `open entered` | EquipmentBagPanel.ts | 141 | `open()` 被调用 — 面板生命周期入口 |
| `_ensureInit entered` | EquipmentBagPanel.ts | 183 | 一次性初始化开始 |
| `itemTemplate =` | EquipmentBagPanel.ts | 184 | **核心**: itemTemplate 是否为 null |
| `contentNode =` | EquipmentBagPanel.ts | 185 | contentNode 是否为空 |
| `_ensureItemTemplateLoaded called` | EquipmentBagPanel.ts | 479 | itemTemplate 加载检查 |
| `render entries =` | EquipmentBagPanel.ts | 294 | 筛选后的 ViewModel 数量 |
| `create item entered` | EquipmentBagPanel.ts | 347 | 进入创建/获取 Item 流程 |
| `itemPrefab =` | EquipmentBagPanel.ts | 358 | 此时 itemPrefab 的实际值 |
| `instantiate start` | EquipmentBagPanel.ts | 366 | 开始克隆 prefab |
| `instantiate success` | EquipmentBagPanel.ts | 368 | 克隆成功 |
| `getComponent =` | EquipmentBagPanel.ts | 371 | **核心**: 组件是否获取成功 |
| `addChild success` | EquipmentBagPanel.ts | 377 | 节点已挂载到 contentNode |
| `childCount =` | EquipmentBagPanel.ts | 331 | contentNode 最终子节点数 |
| `EquipmentItemView onLoad` | EquipmentItemView.ts | 76 | ItemView 生命周期 |
| `EquipmentItemView setData` | EquipmentItemView.ts | 106 | ItemView 收到 ViewModel |

---

## 运行步骤

1. 在 Cocos Creator 中打开 `Phase8Main.scene`
2. 点击工具栏 **Preview** 按钮
3. 浏览器打开后，按 `F12` 打开 DevTools
4. 切换到 **Console** 标签
5. 在游戏中打开 **装备背包面板**
6. 点击 **武器** 分类筛选
7. 截图 Console（红色日志清晰可见）

---

## 验收标准

Console 截图必须清晰包含：

- [x] `[Step11AF] open entered`
- [x] `[Step11AF] _ensureInit entered`
- [x] `[Step11AF] itemTemplate =`
- [x] `[Step11AF] contentNode =`
- [x] `[Step11AF] render entries =`
- [x] `[Step11AF] create item entered`
- [x] `[Step11AF] instantiate start`
- [x] `[Step11AF] instantiate success`
- [x] `[Step11AF] getComponent =`
- [x] `[Step11AF] addChild success`
- [x] `[Step11AF] childCount =`
- [x] `[Step11AF] EquipmentItemView onLoad`
- [x] `[Step11AF] EquipmentItemView setData`

---

## 禁止事项

- ❌ 不修改 prefab
- ❌ 不修改场景
- ❌ 不猜测根因
- ❌ 不进入 Step12
- ❌ 不新增功能

---

## 下一步

截图提交后 → Phase10-Step11AG 根因锁定与修复。
