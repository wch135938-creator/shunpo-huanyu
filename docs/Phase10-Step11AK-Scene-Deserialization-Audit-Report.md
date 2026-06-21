# Phase10-Step11AK Scene Deserialization Audit Report

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
工程路径：`E:\CocosProjects\TestGame\TestGame`  
审计文件：`assets/scenes/Phase8Main.scene`

---

## 0. 最终结论

### 最终根因判断

当前根因是 `assets/scenes/Phase8Main.scene` 中 `EquipmentBagPanel` 与 `EquipmentDetailPanel` 两棵 prefab 实例子树发生 Scene 序列化 ID 污染。

具体表现：

```text
重复 _id = a7NuHFeLJOma1Nt9EgHW8F
重复对象数量 = 44
污染范围 = EquipmentBagPanel 整棵子树 + EquipmentDetailPanel 整棵子树
```

该标识不是 prefab asset UUID，不是脚本 UUID，不是单一 Node UUID，也不是 Prefab Override Key。它是 Scene JSON 内多个 `cc.Node._id` 字段被写成同一个值后的重复 Scene 对象标识。

### 是否已经足够证明 Scene 损坏

结论：足够证明。

证据点：

```text
Phase8Main.scene 中 44 个 cc.Node 共享同一个非空 _id
Bag 与 Detail 两棵不同 prefab 实例树共享同一个 _id
运行时/编辑器提示同一个 a7NuHFeLJOma1Nt9EgHW8F 存在重复 UUID 节点
脚本 UUID 与 __type__ 映射正常
组件 node 引用索引未越界
Prefab asset UUID 引用正常指向对应 prefab
```

因此异常不在 `EquipmentBagPanel` 业务逻辑入口，不在 `EquipmentDetailPanel` 业务逻辑入口，也不在 TypeScript 脚本加载链路；异常位于 Scene 序列化对象身份数据。

---

## 1. 审计方法

执行的检查：

```text
1. 解析 assets/scenes/Phase8Main.scene 为 JSON 对象数组
2. 搜索 EquipmentBagPanel / EquipmentDetailPanel / a7NuHFeLJOma1Nt9EgHW8F
3. 枚举 __id__ 引用并检查越界
4. 枚举所有 _id 并检查重复
5. 对比 prefab asset 本体：
   assets/prefabs/panels/EquipmentBagPanel.prefab
   assets/prefabs/panels/EquipmentDetailPanel.prefab
6. 对照 Cocos Creator 3.8.8 引擎源码：
   cocos/scene-graph/component.ts
   cocos/scene-graph/node.ts
   cocos/scene-graph/node-dev.ts
   cocos/scene-graph/node-activator.ts
```

---

## 2. Scene 结构检查结果

### 2.1 Scene 顶层结构

`Phase8Main.scene` 是 Cocos 标准 JSON 数组格式：

```text
对象数量 = 245
SceneAsset index = 0
Scene index = 1
Canvas index = 2
```

`__id__` 引用检查：

```text
invalidRefsCount = 0
```

含义：

```text
Scene JSON 的对象索引引用没有越界
反序列化不是因为 __id__ 指向不存在对象而失败
```

### 2.2 EquipmentBagPanel 结构

`EquipmentBagPanel` 在 Scene 中的根节点：

```text
index = 69
__type__ = cc.Node
_name = EquipmentBagPanel
_id = a7NuHFeLJOma1Nt9EgHW8F
_parent = { "__id__": 5 }
_children = [ { "__id__": 70 } ]
_components = [ { "__id__": 131 }, { "__id__": 132 }, { "__id__": 133 } ]
_prefab = {
  "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123",
  "__expectedType__": "cc.Prefab"
}
```

脚本组件：

```text
index = 132
__type__ = fb89dlx4T5D+KqcbZ4IfpEl
node = { "__id__": 69 }
__prefab = {
  "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123",
  "__expectedType__": "cc.Prefab"
}
_id = Step11X9-Bag-65-fb89dlx4T5D+KqcbZ4IfpEl
```

脚本 UUID 映射：

```text
assets/scripts/ui/EquipmentBagPanel.ts.meta
uuid = fb89d971-e13e-43f8-aa9c-6d9e087e9125

Scene __type__ = fb89dlx4T5D+KqcbZ4IfpEl
```

结论：

```text
Bag 脚本类型映射正常
Bag 组件 node 引用正常
Bag prefab asset UUID 指向 EquipmentBagPanel.prefab
Bag 节点 _id 异常
```

### 2.3 EquipmentDetailPanel 结构

`EquipmentDetailPanel` 在 Scene 中的根节点：

```text
index = 134
__type__ = cc.Node
_name = EquipmentDetailPanel
_id = a7NuHFeLJOma1Nt9EgHW8F
_parent = { "__id__": 5 }
_children = [ { "__id__": 135 } ]
_components = [ { "__id__": 219 }, { "__id__": 220 }, { "__id__": 221 } ]
_prefab = {
  "__uuid__": "a5e6f7b8-c9d0-1234-efab-345678901234",
  "__expectedType__": "cc.Prefab"
}
```

脚本组件：

```text
index = 220
__type__ = 534faGomxJErYQBMNA+oQCU
node = { "__id__": 134 }
__prefab = {
  "__uuid__": "a5e6f7b8-c9d0-1234-efab-345678901234",
  "__expectedType__": "cc.Prefab"
}
_id = ad7seDnWtE6KyyYcqwlnn8
```

脚本 UUID 映射：

```text
assets/scripts/ui/EquipmentDetailPanel.ts.meta
uuid = 534fa1a8-9b12-44ad-8401-30d03ea10094

Scene __type__ = 534faGomxJErYQBMNA+oQCU
```

结论：

```text
Detail 脚本类型映射正常
Detail 组件 node 引用正常
Detail prefab asset UUID 指向 EquipmentDetailPanel.prefab
Detail 节点 _id 异常
```

---

## 3. a7NuHFeLJOma1Nt9EgHW8F 的真实含义

### 3.1 它在 Scene 中出现的位置

`a7NuHFeLJOma1Nt9EgHW8F` 出现在 44 个 `cc.Node._id` 字段中：

```text
EquipmentBagPanel
panelRoot
titleLabel
filterHintLabel
typeAllBtn
typeWeaponBtn
typeArmorBtn
typeAccessoryBtn
qualityAllBtn
qualityCommonBtn
qualityRareBtn
qualityEpicBtn
qualityLegendaryBtn
scrollView
view
contentNode
closeButton
emptyHintNode
EquipmentDetailPanel
panelRoot
nameLabel
qualityLabel
levelLabel
enhanceLevelLabel
powerLabel
hpStatLabel
atkStatLabel
defStatLabel
equipStatusLabel
equipBtn
unequipBtn
upgradeBtn
enhanceBtn
decomposeBtn
previewContainer
previewPowerLabel
previewCostLabel
confirmDialog
confirmTextLabel
confirmBtn
cancelBtn
closeButton
slotPickerContainer
slotPickerCloseBtn
```

### 3.2 它不是以下对象

```text
不是 Scene asset uuid
Scene uuid = b5995a61-fbb0-47a0-8ea6-f728a6314036

不是 EquipmentBagPanel prefab uuid
Bag prefab uuid = f4d5e6a7-b8c9-0123-defa-234567890123

不是 EquipmentDetailPanel prefab uuid
Detail prefab uuid = a5e6f7b8-c9d0-1234-efab-345678901234

不是 EquipmentBagPanel script uuid
Bag script uuid = fb89d971-e13e-43f8-aa9c-6d9e087e9125

不是 EquipmentDetailPanel script uuid
Detail script uuid = 534fa1a8-9b12-44ad-8401-30d03ea10094

不是 __id__ 引用索引
__id__ 是数字索引，例如 69、132、134、220
```

### 3.3 最终定义

`a7NuHFeLJOma1Nt9EgHW8F` 是 Scene JSON 内的 `cc.Node._id` 值。当前文件中该值被错误复用到 44 个节点，因此它是重复 Scene 节点身份标识。

---

## 4. Cocos Creator 3.8.8 组件实例化顺序

### 4.1 引擎源码结论

`component.ts`：

```text
Component.constructor() 只调用 super()
Component.node 初始值为 NullNode
```

`node.ts` 的 `addComponent()`：

```text
const component = new constructor();
component.node = this;
this._components.push(component);
```

`node-dev.ts` 的 `_addComponentAt()`：

```text
comp.node = this;
this._components.splice(index, 0, comp);
```

`node-activator.ts`：

```text
activateNode()
  -> _activateNodeRecursively()
  -> activateComp()
  -> __preload
  -> onLoad
  -> onEnable

start 由 ComponentScheduler 在后续调度中执行
```

### 4.2 对当前日志的解释

当前日志：

```text
ctor 执行
this.node = undefined
onLoad 未执行
start 未执行
onEnable 未执行
```

结论：

```text
ctor 中 this.node 为 undefined/null 符合 Cocos Creator 3.8.8 生命周期机制
constructor 早于 node 绑定
onLoad / onEnable 需要节点进入激活流程
start 需要 onLoad 完成后进入调度
```

因此：

```text
ctor 中 node undefined 不是独立异常证据
onLoad 未执行说明组件未进入激活生命周期
Maximum call stack size exceeded 在激活前发生时，可以中断 node 激活与生命周期调度
```

---

## 5. Maximum call stack size exceeded 的影响

结论：

```text
Maximum call stack size exceeded 足以导致 node 绑定后的激活流程中断
Maximum call stack size exceeded 足以导致 onLoad / onEnable / start 不执行
```

依据：

```text
Cocos 的组件生命周期由 NodeActivator 激活流程触发
激活流程中发生未捕获 RangeError 后，后续 invoker 不继续完成
当前日志中 ctor 已执行，但 onLoad/start/onEnable 均未执行
```

边界说明：

```text
当前证据足以证明 Scene 存在 ID 污染
当前证据足以证明 RangeError 能中断生命周期
当前日志没有提供 RangeError 的完整调用栈，所以 RangeError 的具体触发函数名未闭环
```

---

## 6. Scene / Prefab / PrefabInfo / Override 审计

### 6.1 Scene 损坏

结论：成立。

证据：

```text
Phase8Main.scene 内存在 44 个重复非空 cc.Node._id
重复 _id 横跨两个不同 prefab 实例
编辑器提示同一 ID 的重复 UUID 节点
```

### 6.2 Prefab 损坏

结论：未成立。

证据：

```text
EquipmentBagPanel.prefab 存在并可解析
EquipmentDetailPanel.prefab 存在并可解析
Scene 中 _prefab.__uuid__ 正确指向两个 prefab asset
脚本 __type__ 与 .ts.meta uuid 匹配
```

注意：

```text
EquipmentBagPanel.prefab 内部节点 _id 多数为空
该现象存在于 prefab asset 本体
但当前运行告警指向 Scene 中的非空重复 ID a7NuHFeLJOma1Nt9EgHW8F
本次根因锁定在 Scene 实例污染
```

### 6.3 PrefabInfo / PrefabInstance 损坏

结论：Scene 中 Bag/Detail 实例未保留标准 `cc.PrefabInfo` 对象块，使用的是直接 asset 引用形式：

```text
_prefab = {
  "__uuid__": "...",
  "__expectedType__": "cc.Prefab"
}

__prefab = {
  "__uuid__": "...",
  "__expectedType__": "cc.Prefab"
}
```

审计结果：

```text
没有发现 __id__ 越界
没有发现 root/asset/instance 指向不存在对象
没有发现 nestedPrefabInstanceRoots 残留指向 Bag/Detail
没有发现 cc.PrefabInstance 对象残留
```

### 6.4 Override 损坏

结论：未发现独立 Prefab Override Key 损坏证据。

依据：

```text
a7NuHFeLJOma1Nt9EgHW8F 出现在 Node._id
不是 targetOverrides key
不是 mountedChildren key
不是 removedComponents key
不是 PrefabInfo.fileId
```

### 6.5 引用环 / 递归引用

结论：Scene 对象索引层面未发现引用环造成的 JSON 结构递归。

依据：

```text
__id__ 引用没有越界
Bag 父子链：UIRoot -> EquipmentBagPanel -> panelRoot -> children
Detail 父子链：UIRoot -> EquipmentDetailPanel -> panelRoot -> children
组件 node 引用回各自宿主节点，这是 Cocos 合法结构
```

风险点：

```text
重复 _id 会污染编辑器/运行时基于 _id 建立的对象注册、查找、层级过滤和 Inspector 映射
该污染能解释“层级面板过滤了重复UUID节点”
```

---

## 7. INSTANCE_COUNT 2 的含义

结论：

```text
INSTANCE_COUNT 2 不等价于场景中存在两个已绑定节点的 EquipmentBagPanel 真实运行实例
```

证据：

```text
Phase8Main.scene 中 EquipmentBagPanel 脚本组件只有 1 个：
index = 132

EquipmentBagPanel.prefab 本体中也有 1 个脚本组件：
index = 65

constructor 执行时 this.node 未绑定，说明计数发生在组件对象构造阶段
onLoad/start/onEnable 未执行，说明这些构造出的对象未进入正常激活生命周期
```

最终解释：

```text
INSTANCE_COUNT 2 表示 EquipmentBagPanel 类构造函数被调用两次
它不证明场景中有两个激活的 BagPanel 节点
它符合“Scene 实例对象 + prefab asset/编辑器反序列化对象”在异常阶段分别构造的现象
```

---

## 8. 必须回答的问题

### 问题1：当前最可能根因是什么？

根因是 `Phase8Main.scene` 中 Bag/Detail 两棵 UI 子树的 `cc.Node._id` 被同一个值 `a7NuHFeLJOma1Nt9EgHW8F` 污染，导致编辑器/运行时节点身份注册异常。

### 问题2：证据链是否闭环？

结论：

```text
Scene 损坏证据链：闭环
RangeError 具体调用栈证据链：未闭环
```

闭环部分：

```text
运行日志给出重复 UUID = a7NuHFeLJOma1Nt9EgHW8F
Scene 文件中该 ID 重复 44 次
重复范围正好覆盖 EquipmentBagPanel 与 EquipmentDetailPanel
脚本加载、脚本 UUID、组件 node 索引均正常
```

未闭环部分：

```text
日志未提供 Maximum call stack size exceeded 的完整 stack trace
因此不能给出具体递归函数名
```

### 问题3：是否已经足够证明 Scene 损坏？

结论：足够证明。

理由：

```text
Cocos Scene 中多个不同 cc.Node 共享同一个非空 _id 是损坏状态
重复数量为 44
重复范围跨两个 prefab 实例
编辑器已报告同一 ID 的重复 UUID 节点
```

### 问题4：是否应该立即修 Scene？

结论：立即修 Scene。

原因：

```text
当前损坏位于 Scene 序列化身份层
继续在业务代码中绕开会增加误判
继续调试 onLoad/open/presenter 无法修复重复 _id
修复 Scene 后再验证生命周期链路，成本最低
```

### 问题5：风险最低的修复方案是什么？

结论：方案 C 风险最低。

```text
删除 BagPanel + DetailPanel
从 prefab 重新拖入
重新绑定 EquipmentMediator
运行 scene 重复 _id 检查
运行 Preview 验证 onLoad/open/点击链路
```

原因：

```text
污染同时覆盖 Bag 和 Detail 两棵树
只恢复单个 prefab 或只删除 BagPanel 会留下另一棵污染树
Mediator 绑定集中，重绑成本可控
```

---

## 9. 修复方案风险评估

| 方案 | 内容 | 风险 | 结论 |
|---|---|---:|---|
| A | Restore Prefab | 中 | 只能恢复 prefab asset 或 prefab 实例差异，不能保证清除 Scene 中两棵实例树已写入的重复 `_id` |
| B | 删除 BagPanel，重新拖入 Prefab | 中 | 能清理 Bag 树，但 Detail 树仍含重复 `_id`，根因残留 |
| C | 删除 BagPanel + DetailPanel，重新绑定 Mediator | 低 | 一次性清除全部已确认污染范围，重绑点明确，验收路径最短 |

---

## 10. 推荐修复步骤

### Step 1：修复前备份

```text
备份 assets/scenes/Phase8Main.scene
备份 assets/scenes/Phase8Main.scene.meta
```

### Step 2：在 Cocos Creator 中删除污染节点

```text
删除 UIRoot/EquipmentBagPanel
删除 UIRoot/EquipmentDetailPanel
保存 Scene
```

### Step 3：重新拖入 prefab

```text
从 assets/prefabs/panels/EquipmentBagPanel.prefab 拖入 UIRoot
从 assets/prefabs/panels/EquipmentDetailPanel.prefab 拖入 UIRoot
保持默认 inactive 状态
保持 Portrait 规范：
720 x 1280
Camera orthoHeight = 640
Canvas Center = (360,640)
```

### Step 4：重新绑定 Mediator

```text
EquipmentMediator.bagPanel -> 新 EquipmentBagPanel
EquipmentMediator.detailPanel -> 新 EquipmentDetailPanel
保留 EquipmentPanel / Presenter / 其它已验收绑定
```

### Step 5：静态验收

必须通过：

```text
duplicateIds = []
invalidRefs = []
PrefabInstance残留 = 0
Canvas/(empty) = 0
Scene 中 a7NuHFeLJOma1Nt9EgHW8F 出现次数 = 0
EquipmentBagPanel 节点数量 = 1
EquipmentDetailPanel 节点数量 = 1
EquipmentBagPanel 脚本组件数量 = 1
EquipmentDetailPanel 脚本组件数量 = 1
```

### Step 6：运行时验收

必须通过：

```text
Maximum call stack size exceeded 不再出现
层级面板重复 UUID 警告不再出现
EquipmentBagPanel ctor 可以出现
EquipmentBagPanel onLoad 在节点激活时出现
EquipmentBagPanel open entered 出现
顶部显示：武器 · 全部品质 · 1件
点击装备项可打开 EquipmentDetailPanel
Detail 操作按钮无 Missing Reference
控制台无新增错误
```

---

## 11. 最终验收结论

```text
最终根因判断：Scene 序列化 ID 污染
证据链：Scene 损坏闭环，RangeError 具体函数栈未闭环
是否证明 Scene 损坏：是
是否立即修 Scene：是
最低风险修复：方案 C
```

Codex 建议将 Phase10-Step11AK 定义为：

```text
Scene Deserialization Audit PASS
Scene Repair Required
Recommended Fix = Delete BagPanel + DetailPanel + Rebind Mediator
```
