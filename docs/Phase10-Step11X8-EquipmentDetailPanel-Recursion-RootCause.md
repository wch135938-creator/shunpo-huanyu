# Phase10-Step11X8 EquipmentDetailPanel 递归创建根因审计报告

项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
目标工程：`E:\CocosProjects\TestGame\TestGame`  
审计日期：2026-06-10

---

## 1. 审计结论

本轮只做根因审计，未修改业务代码。

最终结论：

```text
Maximum call stack size exceeded 的直接嫌疑不是 EquipmentDetailPanel.ts 代码递归。
当前静态证据显示：

1. EquipmentDetailPanel 没有被代码动态 instantiate。
2. EquipmentDetailPanel 没有 loadAny 动态加载。
3. EquipmentDetailPanel.open() 内部没有再次调用 _openDetailPanel()。
4. detailPanel.open() 只有 EquipmentMediator._openDetailPanel() 这一条外部打开链路。
5. 当前 Scene 中 EquipmentDetailPanel 节点实例数量为 1。
6. 当前 Scene 中 EquipmentBagPanel 节点实例数量为 1。
7. 重复 UUID 来源是 Phase8Main.scene 内 prefab instance 的 _id 序列化污染。
```

唯一根因：

```text
Phase8Main.scene 中 EquipmentBagPanel 与 EquipmentDetailPanel 的 prefab instance 子树存在重复 _id。

EquipmentBagPanel 根节点错误使用了 EquipmentDetailPanel-root。
EquipmentBagPanel / EquipmentDetailPanel 两棵子树中共有 42 个节点重复使用 EquipmentDetailPanel-slotPickerCloseBtn。

该重复 _id 污染会在 Cocos Editor / Preview 激活面板、刷新层级、过滤重复 UUID 节点时触发递归处理异常，表现为：
Maximum call stack size exceeded
```

---

## 2. 运行现象对应关系

当前用户观察：

```text
点击：
武器 ——空——

结果：
选择装备 · 武器 成功弹出

随后出现：
层级面板过滤了重复的 UUID 节点
EquipmentDetailPanel-root
EquipmentDetailPanel-slotPickerCloseBtn

并连续出现：
Maximum call stack size exceeded
```

关键判断：

```text
点击空槽位时，代码路径打开的是 EquipmentBagPanel，不是 EquipmentDetailPanel。
```

原因：

```text
EquipmentPanel._handleSlotClick()
if (isEmpty) -> this._onOpenBag(slotId)
else if (equippedItem) -> this._onOpenDetail(equippedItem.uniqueId)
```

因此在“武器 ——空——”点击路径中：

```text
detailPanel.open()
不应被调用。
```

但错误日志却出现：

```text
EquipmentDetailPanel-root
EquipmentDetailPanel-slotPickerCloseBtn
```

这与静态 Scene 数据吻合：

```text
EquipmentBagPanel 的 Scene 实例也携带了 EquipmentDetailPanel 的 _id。
```

---

## 3. Maximum call stack size exceeded 调用链

### 3.1 空槽位点击链路

点击空槽位：

```text
EquipmentSlotItem Button CLICK
  ↓
EquipmentSlotItem click callback
  ↓
EquipmentPanel._handleSlotClick(slotId, isEmpty = true)
  ↓
EquipmentPanel._onOpenBag(slotId)
  ↓
EquipmentMediator._openBagPanel(slotId)
  ↓
EquipmentBagPanel.open(heroId, slotId)
  ↓
EquipmentBagPanel._ensureInit()
  ↓
EquipmentBagPanel._refreshList()
  ↓
EquipmentBagPanel.show()
  ↓
BasePanel.show()
  ↓
this.node.active = true
  ↓
Cocos 激活 / 刷新 EquipmentBagPanel 节点树
  ↓
Editor / Preview 层级系统检测到重复 _id:
  EquipmentDetailPanel-root
  EquipmentDetailPanel-slotPickerCloseBtn
  ↓
层级面板过滤重复 UUID 节点
  ↓
Maximum call stack size exceeded
```

这条链路中没有：

```text
EquipmentMediator._openDetailPanel()
EquipmentDetailPanel.open()
detailPanel.open()
```

### 3.2 已装备槽位 / 背包装备点击链路

当点击已装备槽位或背包装备项时，才会进入 DetailPanel：

```text
EquipmentPanel._handleSlotClick(slotId, isEmpty = false, equippedItem)
  ↓
EquipmentPanel._onOpenDetail(uniqueId)
  ↓
EquipmentMediator._openDetailPanel(uniqueId)
  ↓
detailPanel.open(uniqueId, heroId)
  ↓
EquipmentDetailPanel.open()
  ↓
EquipmentDetailPanel._ensureInit()
  ↓
EquipmentDetailPanel._render()
  ↓
EquipmentDetailPanel.show()
  ↓
BasePanel.show()
```

或：

```text
EquipmentBagPanel._handleItemClick(viewModel)
  ↓
EquipmentBagPanel._onItemClick(viewModel.uniqueId)
  ↓
EquipmentMediator._openDetailPanel(uniqueId)
  ↓
detailPanel.open(uniqueId, heroId)
```

这条链路也没有形成：

```text
open
 ↓
callback
 ↓
open
```

---

## 4. EquipmentDetailPanel 创建次数

### 4.1 代码动态创建次数

搜索对象：

```text
EquipmentDetailPanel.ts
EquipmentMediator.ts
EquipmentBagPanel.ts
EquipmentPanel.ts
```

结果：

```text
instantiate(EquipmentDetailPanel) = 0
assetManager.loadAny(EquipmentDetailPanel) = 0
```

全工程相关搜索结果：

```text
EquipmentMediator.ts:
import { EquipmentDetailPanel } from './EquipmentDetailPanel'
@property({ type: EquipmentDetailPanel })
detailPanel: EquipmentDetailPanel | null

未发现任何针对 EquipmentDetailPanel prefab 的 instantiate/loadAny。
```

结论：

```text
EquipmentDetailPanel 没有被运行时代码重复创建。
```

### 4.2 Scene 实例数量

文件：

```text
E:\CocosProjects\TestGame\TestGame\assets\scenes\Phase8Main.scene
```

节点数量统计：

```text
EquipmentPanel = 1
EquipmentBagPanel = 1
EquipmentDetailPanel = 1
```

Scene 中面板节点：

```text
EquipmentPanel:
idx = 6
active = true
parent = 5

EquipmentBagPanel:
idx = 69
active = false
parent = 5

EquipmentDetailPanel:
idx = 135
active = false
parent = 5
```

结论：

```text
Scene 中不存在多个名为 EquipmentDetailPanel 的节点实例。
```

---

## 5. EquipmentDetailPanel 打开次数

### 5.1 代码调用点

`detailPanel.open()` 只在：

```text
E:\CocosProjects\TestGame\TestGame\assets\scripts\ui\EquipmentMediator.ts
```

中的 `_openDetailPanel(uniqueId)` 调用。

核心代码：

```text
this.detailPanel.open(uniqueId, heroId);
```

调用来源只有两类：

```text
1. EquipmentPanel.setOpenDetailCallback()
   已装备槽位点击时触发。

2. EquipmentBagPanel.setItemClickCallback()
   背包装备项点击时触发。
```

### 5.2 空槽位点击时打开次数

点击：

```text
武器 ——空——
```

对应：

```text
EquipmentPanel._handleSlotClick(isEmpty = true)
```

该路径调用：

```text
_onOpenBag(slotId)
```

不会调用：

```text
_onOpenDetail(uniqueId)
detailPanel.open(uniqueId, heroId)
```

结论：

```text
在当前用户复现路径中，EquipmentDetailPanel.open() 理论打开次数为 0。
EquipmentBagPanel.open() 打开次数为 1。
```

### 5.3 背包装备项点击时打开次数

如果随后点击背包中的某个装备项：

```text
EquipmentBagPanel._handleItemClick(viewModel)
  ↓
EquipmentMediator._openDetailPanel(viewModel.uniqueId)
  ↓
EquipmentDetailPanel.open(uniqueId, heroId)
```

则：

```text
EquipmentDetailPanel.open() 每次装备项点击调用 1 次。
```

---

## 6. 是否存在递归调用

### 6.1 EquipmentDetailPanel.open()

文件：

```text
assets/scripts/ui/EquipmentDetailPanel.ts
```

`open(uniqueId, heroId)` 执行顺序：

```text
1. 输出日志
2. this._ensureInit()
3. 检查 presenter
4. 设置 _currentUniqueId / _currentHeroId
5. presenter.getDetailViewModel(uniqueId, heroId)
6. this._render()
7. this.show()
```

未发现：

```text
this.open(...)
detailPanel.open(...)
_openDetailPanel(...)
setOpenDetailCallback(...)
```

结论：

```text
EquipmentDetailPanel.open() 内部不存在自递归。
```

### 6.2 EquipmentDetailPanel._ensureInit()

执行顺序：

```text
if (this._initialized) return;
this._initialized = true;
this._recoverBindings();
this._bindEvents();
this._ensureVisualBlocks();
```

其中 `_initialized` 在执行任何绑定前先置为 true：

```text
this._initialized = true;
```

结论：

```text
_ensureInit() 不会重复进入自身。
```

### 6.3 EquipmentDetailPanel._bindEvents()

绑定按钮：

```text
equipBtn -> _onEquipClick
unequipBtn -> _onUnequipClick
upgradeBtn -> _onUpgradeClick
enhanceBtn -> _onEnhanceClick
decomposeBtn -> _onDecomposeClick
confirmBtn -> _onConfirm
cancelBtn -> _onCancel
closeButton -> _handleClose
```

未发现：

```text
任何按钮绑定 _openDetailPanel
任何按钮绑定 open
任何按钮绑定 show
```

结论：

```text
_bindEvents() 不会形成 open callback open 递归。
```

### 6.4 BasePanel.show()

文件：

```text
assets/scripts/core/BasePanel.ts
```

执行顺序：

```text
if (this._isShowing) return;
this.node.active = true;
this.playShowAnimation();
this._isShowing = true;
this.onShow();
```

默认：

```text
playShowAnimation() 为空
onShow() 为空
```

结论：

```text
BasePanel.show() 本身无递归。
但 this.node.active = true 会触发 Cocos 对节点树的激活、层级刷新和 UUID 检查。
当前重复 _id 正是在这个阶段暴露。
```

---

## 7. 是否存在重复实例

### 7.1 节点名维度

Scene 中节点名数量：

```text
EquipmentPanel = 1
EquipmentBagPanel = 1
EquipmentDetailPanel = 1
```

结论：

```text
不存在多个同名 EquipmentDetailPanel 节点实例。
```

### 7.2 _id / UUID 维度

Scene 中 `_id` 重复统计：

```text
duplicateIds = 2
```

重复项 1：

```text
_id = EquipmentDetailPanel-root
count = 2

idx = 69
type = cc.Node
name = EquipmentBagPanel

idx = 135
type = cc.Node
name = EquipmentDetailPanel
```

重复项 2：

```text
_id = EquipmentDetailPanel-slotPickerCloseBtn
count = 42
```

涉及节点包括：

```text
EquipmentBagPanel/panelRoot
EquipmentBagPanel/titleLabel
EquipmentBagPanel/filterHintLabel
EquipmentBagPanel/typeAllBtn
EquipmentBagPanel/typeWeaponBtn
EquipmentBagPanel/typeArmorBtn
EquipmentBagPanel/typeAccessoryBtn
EquipmentBagPanel/qualityAllBtn
EquipmentBagPanel/scrollView
EquipmentBagPanel/contentNode
EquipmentBagPanel/closeButton
EquipmentBagPanel/emptyHintNode

EquipmentDetailPanel/panelRoot
EquipmentDetailPanel/nameLabel
EquipmentDetailPanel/qualityLabel
EquipmentDetailPanel/levelLabel
EquipmentDetailPanel/equipBtn
EquipmentDetailPanel/upgradeBtn
EquipmentDetailPanel/decomposeBtn
EquipmentDetailPanel/previewContainer
EquipmentDetailPanel/confirmDialog
EquipmentDetailPanel/closeButton
EquipmentDetailPanel/slotPickerContainer
EquipmentDetailPanel/slotPickerCloseBtn
```

结论：

```text
不存在重复的 EquipmentDetailPanel 节点实例。
但存在严重重复的 Scene 节点 _id。
这就是 Cocos 报“重复 UUID 节点”的来源。
```

---

## 8. 重复 UUID 来源

### 8.1 EquipmentDetailPanel.prefab

文件：

```text
assets/prefabs/panels/EquipmentDetailPanel.prefab
```

统计：

```text
objects = 89
duplicateIds = 0
```

关键节点：

```text
root:
name = EquipmentDetailPanel
_id = EquipmentDetailPanel-root

panelRoot:
_id = EquipmentDetailPanel-panelRoot

slotPickerCloseBtn:
_id = EquipmentDetailPanel-slotPickerCloseBtn
```

结论：

```text
EquipmentDetailPanel.prefab 本体没有重复 _id。
```

### 8.2 EquipmentBagPanel.prefab

文件：

```text
assets/prefabs/panels/EquipmentBagPanel.prefab
```

关键节点：

```text
root:
name = EquipmentBagPanel
_id = ""

panelRoot:
_id = ""
```

结论：

```text
EquipmentBagPanel.prefab 本体没有 EquipmentDetailPanel-root / EquipmentDetailPanel-slotPickerCloseBtn。
```

### 8.3 Phase8Main.scene

文件：

```text
assets/scenes/Phase8Main.scene
```

污染点：

```text
EquipmentBagPanel scene idx = 69
name = EquipmentBagPanel
_id = EquipmentDetailPanel-root
prefab = scene[134]

EquipmentDetailPanel scene idx = 135
name = EquipmentDetailPanel
_id = EquipmentDetailPanel-root
prefab = scene[223]
```

BagPanel 子树污染：

```text
EquipmentBagPanel/panelRoot
EquipmentBagPanel/titleLabel
EquipmentBagPanel/filterHintLabel
EquipmentBagPanel/typeAllBtn
EquipmentBagPanel/typeWeaponBtn
EquipmentBagPanel/typeArmorBtn
EquipmentBagPanel/typeAccessoryBtn
EquipmentBagPanel/qualityAllBtn
EquipmentBagPanel/scrollView
EquipmentBagPanel/contentNode
EquipmentBagPanel/closeButton
EquipmentBagPanel/emptyHintNode

这些节点的 _id 均为：
EquipmentDetailPanel-slotPickerCloseBtn
```

DetailPanel 子树污染：

```text
EquipmentDetailPanel/panelRoot
EquipmentDetailPanel/nameLabel
EquipmentDetailPanel/qualityLabel
EquipmentDetailPanel/levelLabel
EquipmentDetailPanel/equipBtn
EquipmentDetailPanel/upgradeBtn
EquipmentDetailPanel/decomposeBtn
EquipmentDetailPanel/previewContainer
EquipmentDetailPanel/confirmDialog
EquipmentDetailPanel/closeButton
EquipmentDetailPanel/slotPickerContainer
EquipmentDetailPanel/slotPickerCloseBtn

这些节点的 _id 也均为：
EquipmentDetailPanel-slotPickerCloseBtn
```

结论：

```text
重复 UUID 来源不是 prefab 文件本体。
重复 UUID 来源是 Phase8Main.scene 中 prefab instance 的 _id 序列化污染。
```

---

## 9. 为什么看起来像 EquipmentDetailPanel 递归

因为重复 `_id` 文本是：

```text
EquipmentDetailPanel-root
EquipmentDetailPanel-slotPickerCloseBtn
```

但实际持有这些 `_id` 的节点不只属于 EquipmentDetailPanel。

最关键的错位：

```text
EquipmentBagPanel 节点本身：
name = EquipmentBagPanel
_id = EquipmentDetailPanel-root
```

也就是说：

```text
打开 BagPanel 时，Cocos 处理的节点树中已经携带 DetailPanel 的 _id。
```

所以现象会误导为：

```text
EquipmentDetailPanel 重复创建
或
EquipmentDetailPanel 递归打开自己
```

实际证据支持的是：

```text
Scene prefab instance _id 污染。
```

---

## 10. 排除项

### 10.1 排除 EquipmentMediator 未加载

已由前序 Step11X 系列确认：

```text
[MEDIATOR_MODULE_LOADED]
EquipmentMediator.ts module evaluated
```

本轮不再分析。

### 10.2 排除 Tree Shaking

已由前序 Step11X 系列确认：

```text
EquipmentPanel.ts 已加载
EquipmentMediator.ts 已加载
```

本轮不再分析。

### 10.3 排除 DetailPanel 动态重复创建

证据：

```text
instantiate(EquipmentDetailPanel) = 0
loadAny(EquipmentDetailPanel) = 0
Scene EquipmentDetailPanel 节点数量 = 1
```

### 10.4 排除 DetailPanel open 自递归

证据：

```text
EquipmentDetailPanel.open() 内没有 this.open()
EquipmentDetailPanel.open() 内没有 _openDetailPanel()
EquipmentDetailPanel._bindEvents() 内没有绑定 open()
EquipmentDetailPanel._ensureInit() 通过 _initialized 防重入
```

---

## 11. 最小修复方案

禁止改业务代码。

最小修复范围：

```text
只修 Phase8Main.scene 中 EquipmentBagPanel / EquipmentDetailPanel 的 prefab instance 序列化。
```

推荐方案：

```text
1. 在 Cocos Creator 中打开 Phase8Main.scene。

2. 删除 UIRoot 下当前两个 Scene 实例：
   EquipmentBagPanel
   EquipmentDetailPanel

3. 从 assets/prefabs/panels 重新拖入干净 prefab：
   EquipmentBagPanel.prefab
   EquipmentDetailPanel.prefab

4. 放回 UIRoot 下，保持结构：
   UIRoot
   ├── EquipmentPanel
   ├── EquipmentBagPanel
   ├── EquipmentDetailPanel
   └── RenderProbeLabel

5. 设置：
   EquipmentBagPanel.active = false
   EquipmentDetailPanel.active = false

6. 重新绑定 EquipmentMediator：
   equipmentPanel -> EquipmentPanel 脚本组件
   bagPanel -> EquipmentBagPanel 脚本组件
   detailPanel -> EquipmentDetailPanel 脚本组件

7. 保存 Scene。

8. 重新 Preview。
```

验收检查：

```text
Phase8Main.scene 中不再出现：

EquipmentBagPanel._id = EquipmentDetailPanel-root

也不再出现 42 个：
_id = EquipmentDetailPanel-slotPickerCloseBtn
```

脚本验证目标：

```text
duplicateIds = 0

或至少：
EquipmentDetailPanel-root count = 1
EquipmentDetailPanel-slotPickerCloseBtn count = 1
```

---

## 12. 风险分析

### 风险 1：只修 DetailPanel，不修 BagPanel

风险：

```text
当前用户复现路径是空槽位点击，首先打开 BagPanel。
BagPanel Scene 实例本身已经携带 EquipmentDetailPanel-root。
只重建 DetailPanel 不能完全消除重复 _id。
```

处理：

```text
EquipmentBagPanel 与 EquipmentDetailPanel 必须一起重建 Scene 实例。
```

### 风险 2：继续用当前 Scene 实例手工改字段

风险：

```text
重复 _id 数量达到 42。
手工逐项改 _id 容易漏改，并且可能破坏 prefab instance override。
```

处理：

```text
优先从干净 prefab 重新拖入 Scene。
```

### 风险 3：误改业务代码

风险：

```text
当前业务代码没有证据形成递归。
修改 open/show/callback 可能引入新问题。
```

处理：

```text
Step11X8 不应修改 EquipmentDetailPanel.ts / EquipmentMediator.ts / EquipmentBagPanel.ts / EquipmentPanel.ts。
```

---

## 13. 最终根因

最终根因：

```text
Phase8Main.scene 中 EquipmentBagPanel 与 EquipmentDetailPanel 的 prefab instance _id 序列化损坏。
```

具体表现：

```text
EquipmentBagPanel 根节点错误持有：
_id = EquipmentDetailPanel-root

EquipmentBagPanel 与 EquipmentDetailPanel 多个子节点重复持有：
_id = EquipmentDetailPanel-slotPickerCloseBtn
```

导致：

```text
Cocos 在激活 BagPanel / DetailPanel 或刷新层级时检测到重复 UUID 节点。
重复节点过滤逻辑进入异常递归或重复处理。
最终表现为：
Maximum call stack size exceeded
```

不是：

```text
EquipmentDetailPanel 重复 instantiate
EquipmentDetailPanel.loadAny 重复加载
EquipmentDetailPanel.open 自递归
detailPanel.open -> callback -> detailPanel.open
Mediator 未加载
Tree Shaking
```

---

## 14. Step11X8 结论

```text
Phase10-Step11X8 根因定位完成。
```

结论状态：

```text
Step11X8 PASS
```

下一步建议进入：

```text
Phase10-Step11X9 Scene Prefab Instance ID Recovery
```

执行目标：

```text
重建 EquipmentBagPanel / EquipmentDetailPanel Scene 实例。
清除 Phase8Main.scene 中重复 _id。
重新验证空槽位点击、背包弹出、详情打开。
```
