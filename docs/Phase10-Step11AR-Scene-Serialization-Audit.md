# Phase10-Step11AR Scene Serialization Audit

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
审计对象：`assets/scenes/Phase10Main.scene`  
关联旧场景：`assets/scenes/Phase8Main.scene`  
生成脚本：`_tools/generate_phase10_scene.js`  
输出日期：2026-06-12

---

## 0. 最终根因判断

### 最终根因

`Phase10Main.scene` 的运行失败根因是：`_tools/generate_phase10_scene.js` 程序化嵌入 prefab 时只修正了 JSON 层面的 `__id__` 索引引用，没有生成符合 Cocos Creator 3.8.8 运行时要求的完整 Scene/Node 双向挂载关系与 Prefab 实例语义。

最关键的文件级证据：

```text
UIRoot._children = [6, 71, 138]

但：
EquipmentPanel._parent = null
EquipmentBagPanel._parent = null
EquipmentDetailPanel._parent = null
```

也就是说：

```text
UIRoot 声称拥有 EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel
但三个 Panel 根节点并没有声明自己的 parent 是 UIRoot
```

这不是合法的 Cocos Node 树。

静态扫描只检查：

```text
__id__ 是否越界
_id 是否重复
组件 __type__ 是否存在
Mediator 引用是否非 null
```

这些检查无法证明：

```text
Node 已真正挂入 Scene
PrefabInfo / CompPrefabInfo 语义有效
Cocos Editor 能打开该 scene
Preview 能激活该节点树
```

因此 Step11AQ 的“静态验证 PASS”成立范围有限，不能推出“运行时可用”。

---

## 1. 是否确认 Step11AQ 运行失败

结论：

```text
确认 Step11AQ 运行验证 FAIL
```

证据：

```text
Open scene failed: 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
Node EquipmentPanel(...) has not attached to a scene.
Cannot read properties of null (reading '_getUITransformComp')
Hierarchy 实际只显示 scene-001 / Canvas / Camera
```

`77d217a6-ae81-42d5-8ca0-5ec7cec99e1f` 与 `Phase10Main.scene.meta` 的 uuid 完全一致：

```text
Phase10Main.scene.meta uuid = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
Phase10Main.scene 内 cc.Scene._id = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
Console Open scene failed uuid = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
```

所以失败目标就是 `Phase10Main.scene`，不是单纯的误读日志。

---

## 2. 是否确认 Phase10Main.scene 当前不可作为主场景

结论：

```text
确认 Phase10Main.scene 当前不可作为主场景
```

原因：

```text
1. Cocos Creator Preview 打开失败
2. Hierarchy 未显示预期的 UIRoot / EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel / EquipmentMediator
3. Panel 根节点没有正确 parent
4. Console 已出现 scene open failure 与 unattached node 错误
5. 该文件由脚本猜测生成 PrefabInfo / CompPrefabInfo，而不是由 Cocos Editor 原生序列化生成
```

当前状态：

```text
Phase10Main.scene 静态 JSON 可解析
Phase10Main.scene Cocos Runtime 不可用
Phase10Main.scene 不允许作为 Phase10-Step11 FINAL PASS 基线
```

---

## 3. Phase10Main.scene 静态结构审计

### 3.1 基础指标

重新解析 `assets/scenes/Phase10Main.scene`：

```text
objectCount = 307
sceneName = Phase10Main
sceneUuid = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
metaUuid = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
invalidRefsCount = 0
duplicateIdsCount = 0
```

这些指标说明：

```text
JSON 数组可解析
__id__ 索引没有越界
_id 没有重复
.scene.meta uuid 与 scene 内 uuid 一致
```

但这些指标不能证明 Cocos 场景可打开。

### 3.2 Scene children

`cc.Scene`：

```text
index = 1
_name = Phase10Main
_children = [2, 289]
```

含义：

```text
Scene 直接子节点为 Canvas 与 EquipmentMediator
```

`EquipmentMediator` 直接挂在 Scene 根下，不是本次致命问题；但从产品结构看，后续建议放入 `UIRoot` 或专门的 `Systems` 节点中，避免层级混乱。

### 3.3 Canvas / UIRoot

`Canvas`：

```text
index = 2
_parent = 1
_children = [3, 5]
```

`UIRoot`：

```text
index = 5
_parent = 2
_children = [6, 71, 138]
```

`Camera`：

```text
index = 3
_parent = 2
```

Canvas / Camera / UIRoot 的上半段关系基本正确。

### 3.4 Panel 根节点挂载错误

`EquipmentPanel`：

```text
index = 6
_name = EquipmentPanel
_parent = null
```

`EquipmentBagPanel`：

```text
index = 71
_name = EquipmentBagPanel
_parent = null
```

`EquipmentDetailPanel`：

```text
index = 138
_name = EquipmentDetailPanel
_parent = null
```

这三者同时被 `UIRoot._children` 引用，但自身 `_parent` 均为 `null`。

最终判断：

```text
Panel 节点对象存在
Panel 组件对象存在
Panel 被 UIRoot 单向引用
Panel 没有形成 Cocos 要求的父子双向关系
Panel 不能被视为可靠挂入 active Scene 的节点
```

这直接解释：

```text
Node EquipmentPanel(...) has not attached to a scene.
```

---

## 4. generate_phase10_scene.js 审计

### 4.1 生成器的错误模型

生成器做了以下动作：

```text
1. 读取 prefab JSON
2. 跳过 cc.Prefab wrapper
3. 将 prefab 内 __id__ 重映射到 scene 全局索引
4. 把 prefab root 加入 UIRoot._children
5. 猜测生成 PrefabInfo / CompPrefabInfo
6. 写出 Phase10Main.scene
```

关键缺陷：

```text
脚本没有把 prefab root node 的 _parent 改成 UIRoot
```

生成器源码中：

```text
UIRoot._children = [
  prefabResults['EquipmentPanel'].sceneRootNodeIdx,
  prefabResults['EquipmentBagPanel'].sceneRootNodeIdx,
  prefabResults['EquipmentDetailPanel'].sceneRootNodeIdx,
]
```

但 prefab root 对象被整体拷贝进 scene：

```text
objs[result.offset + i] = result._offsetObjects[i]
```

没有对 root node 执行：

```text
root._parent = { "__id__": uiRootNodeIdx }
```

结果就是当前文件中的 `_parent = null`。

### 4.2 Prefab 嵌入路线错误

Cocos Creator 中“把 prefab 拖入 scene”不是简单的 JSON 拼接。

它涉及：

```text
Node 父子双向关系
PrefabInfo.root
PrefabInfo.asset
PrefabInfo.fileId
PrefabInfo.instance
PrefabInstance / override 语义
CompPrefabInfo.fileId
组件与脚本资源映射
编辑器 AssetDB 注册
场景保存时的内部归一化
```

`generate_phase10_scene.js` 只能保证一部分 JSON 引用合法，不能保证 Cocos 内部语义合法。

### 4.3 是否确认生成了不符合 Cocos 3.8.8 的 Scene JSON

结论：

```text
确认
```

证据：

```text
Panel root 被 UIRoot._children 引用，但 Panel root._parent = null
Open scene failed 指向 Phase10Main uuid
运行时提示 EquipmentPanel has not attached to a scene
Hierarchy 没有显示生成器声称存在的完整层级
```

---

## 5. PrefabInfo / CompPrefabInfo 审计

### 5.1 当前文件现象

`Phase10Main.scene` 中存在：

```text
PrefabInfo 数量 = 12
CompPrefabInfo 数量 = 84
```

但结构存在非原生生成风险：

```text
1. PrefabInfo / CompPrefabInfo 由脚本猜测生成
2. 部分 PrefabInfo.root 指向同一个 EquipmentPanel root
3. 部分 nestedPrefabInstanceRoots 为 null，部分为空数组
4. 部分 component.__prefab 仍是 __uuid__ 直接引用
5. 部分 fileId 是随机 uuid，不是 prefab 内原始 fileId 或编辑器生成值
```

### 5.2 结论

```text
PrefabInfo / CompPrefabInfo 当前不可作为可信 Cocos 原生 prefab instance 语义
```

说明：

静态层面它们不一定越界；运行时层面它们无法证明由 Cocos Editor 正确生成。

因此：

```text
禁止继续程序化伪造 PrefabInfo / CompPrefabInfo
必须由 Cocos Creator Editor 拖入 prefab 后保存生成
```

---

## 6. 15 个问题逐项回答

### Q1：Phase10Main.scene 为什么静态扫描通过但 Cocos Creator 打开失败？

因为静态扫描只验证 JSON 索引合法和 ID 不重复，没有验证 Cocos Node 树双向挂载、Scene 归属、PrefabInfo 语义和 Editor 可加载性。

当前 `UIRoot._children` 引用 Panel，但 Panel `_parent = null`，这是 Cocos 场景语义错误。

### Q2：generate_phase10_scene.js 是否错误生成了不符合 Cocos 3.8.8 的 Scene JSON？

是。

根因是程序化 JSON 拼接没有完整复现 Cocos Editor 拖入 prefab 时的序列化语义。

### Q3：Prefab 节点树嵌入 Scene 的方式是否错误？

是。

错误点：

```text
Prefab root 被加入 UIRoot._children
Prefab root._parent 未改为 UIRoot
PrefabInfo / CompPrefabInfo 由脚本猜测生成
```

### Q4：__id__ 重映射是否只保证 JSON 引用合法，但不保证 Cocos 语义合法？

是。

`__id__` 不越界只说明数组对象可以互相引用，不说明这些引用形成 Cocos 可激活的 Scene/Node/Component/Prefab 图。

### Q5：为什么 Hierarchy 只剩 scene-001 / Canvas / Camera？

`Phase10Main.scene` 内部 `_name` 是 `Phase10Main`，不是 `scene-001`。

同时 Console 报：

```text
Open scene failed: 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
```

该 uuid 正是 Phase10Main。

结论：

```text
Cocos 尝试打开 Phase10Main 失败
编辑器仍停留或回退到已有 scene-001
Hierarchy 显示 scene-001 不是 Phase10Main 内部命名错误
```

### Q6：为什么 EquipmentPanel 提示 has not attached to a scene？

因为 `EquipmentPanel` 节点对象存在，但 `_parent = null`。

虽然 `UIRoot._children` 单向引用了它，但 Cocos 没有得到完整双向 Node 树。该节点不能被可靠识别为 active scene 下的节点。

### Q7：为什么 EquipmentBagPanel 的 this.node.name / uuid 是 undefined？

这部分仍然是 Cocos 生命周期正常现象加调试日志残留。

`constructor()` 阶段 Cocos 尚未完成 `component.node = node` 绑定；在 constructor 中读取：

```text
this.node?.name
this.node?.uuid
```

得到 undefined 是正常现象。

但当前日志仍出现 `Step11AG_FORCE / Step11AH / Step11AJ`，说明调试代码没有清理。

### Q8：为什么 Open scene failed？

直接原因：

```text
Phase10Main.scene 的序列化结构不满足 Cocos Runtime / Editor 加载要求
```

文件证据：

```text
Panel root parent 缺失
PrefabInfo / CompPrefabInfo 非 Editor 原生生成
```

### Q9：为什么触发 Cannot read properties of null (reading '_getUITransformComp')？

该错误来自 UI 系统尝试读取某个节点的 UITransform 时，目标节点或其 UITransform 归属链为空。

在当前上下文中，直接诱因是：

```text
Prefab Panel 节点未正确挂入 Scene
UIRoot / Canvas 下的 UI 节点树不完整
UI 系统在处理布局、Canvas、Widget 或 UITransform 时遇到 null
```

### Q10：Step11AQ 的“程序化生成 Scene”路线是否应立即废弃？

是。

本路线已被运行时验证失败证伪。

### Q11：是否应改为 Cocos Creator 编辑器内手动新建 Scene，再手动拖入 Prefab？

是。

必须由 Cocos Creator 3.8.8 原生生成 Scene / Node / PrefabInfo / CompPrefabInfo。

### Q12：是否需要保留 generate_phase10_scene.js？

建议隔离保留，不再执行。

处理建议：

```text
移动到 tools/_deprecated/generate_phase10_scene.js
或重命名为 generate_phase10_scene.js.disabled
在文件头标记：DO NOT USE FOR SCENE GENERATION
```

不得作为后续修复工具继续使用。

### Q13：是否需要删除或隔离 Phase10Main.scene 并重新创建？

是。

当前 `Phase10Main.scene` 需要隔离或删除后，由 Cocos Creator Editor 重新创建同名文件。

推荐：

```text
先备份当前 Phase10Main.scene 到 _scene_repair_backup/step11ar/
然后在 Editor 中新建干净 Phase10Main.scene 覆盖/替换
```

### Q14：是否需要检查 .scene.meta 与 SceneAsset uuid 是否一致？

已检查，一致：

```text
Phase10Main.scene.meta uuid = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
Phase10Main.scene cc.Scene._id = 77d217a6-ae81-42d5-8ca0-5ec7cec99e1f
```

这不是本次失败根因。

### Q15：是否需要检查 project.json / launchScene / open scene uuid 指向是否错误？

需要。

当前检索结果：

```text
settings/v2/packages/project.json 未发现 launchScene
profiles/v2/packages/project.json 未发现 launchScene
settings/profiles 中未发现 Phase10Main uuid 被显式配置为 launchScene
```

因此重建完成后必须在 Cocos Creator Editor 中手动设置 Launch Scene，并确认 Preview 实际打开的是 `Phase10Main.scene`。

---

## 7. 对 Phase8Main.scene 的处理

结论：

```text
Phase8Main.scene 只保留为 legacy/reference
不得继续作为主场景
不得复制其子树到新 Scene
不得从旧 Scene 复制 PrefabInfo / CompPrefabInfo
```

理由：

```text
Phase8Main.scene 已确认经历严重 Scene 污染
继续从旧 Scene 复制会把污染语义重新带入新场景
```

---

## 8. 调试日志处理

当前仍出现：

```text
Step11AG_FORCE
Step11AH
Step11AJ
```

结论：

```text
这些日志是调试代码残留
它们不直接证明旧 Scene 仍被加载
它们会干扰运行时判断
必须移除
```

要求：

```text
从 EquipmentBagPanel.ts 移除 Step11AG_FORCE / Step11AH / Step11AJ 日志
从 EquipmentItemView.ts 移除 Step11AG_FORCE / Step11AO 临时日志
保留必要业务 warn/error，删除阶段性硬 trace
```

---

## 9. 对 Claude Code 的执行边界

Claude Code 不允许继续执行：

```text
1. 不允许继续猜测式修改 Scene JSON
2. 不允许继续复制 Phase8Main.scene
3. 不允许继续复制旧 Scene 子树
4. 不允许继续程序化伪造 PrefabInfo / CompPrefabInfo
5. 不允许继续运行 _tools/generate_phase10_scene.js 生成主场景
6. 不允许将当前 Phase10Main.scene 标记为 PASS
7. 不允许进入 Phase10-Step12
```

Claude Code 允许执行：

```text
1. 备份当前 Phase10Main.scene
2. 隔离 generate_phase10_scene.js
3. 在 Cocos Creator Editor 内新建 Scene
4. 手动拖入 prefab
5. 手动绑定 Inspector
6. 清理 Step11 调试日志
7. 运行 Preview
8. 输出修复与验证报告
```

---

## 10. 给 Claude Code 的精确执行方案

### Step 1：备份失败产物

```text
创建：
_scene_repair_backup/step11ar/

备份：
assets/scenes/Phase10Main.scene
assets/scenes/Phase10Main.scene.meta
_tools/generate_phase10_scene.js
```

### Step 2：隔离生成器

执行其一：

```text
_tools/generate_phase10_scene.js -> _tools/generate_phase10_scene.js.disabled
```

或：

```text
移动到 _tools/deprecated/generate_phase10_scene.js
```

文件头必须写明：

```text
DO NOT USE: failed Step11AQ runtime validation.
Programmatic Scene JSON generation is not accepted for Phase10Main.
```

### Step 3：在 Cocos Creator 3.8.8 内手动重建 Scene

```text
File / New Scene
保存为：assets/scenes/Phase10Main.scene
```

必须手动确认：

```text
Scene 名称 = Phase10Main
Canvas 存在
Camera 存在
UIRoot 存在
```

### Step 4：配置 Portrait

```text
Canvas UITransform = 720 x 1280
Canvas Position = (360, 640, 0)
Camera Projection = Orthographic
Camera orthoHeight = 640
UIRoot UITransform = 720 x 1280
```

### Step 5：原生拖入 prefab

从 `assets/prefabs/panels/` 手动拖入：

```text
EquipmentPanel.prefab
EquipmentBagPanel.prefab
EquipmentDetailPanel.prefab
```

必须放在：

```text
Canvas/UIRoot
```

不得复制任何旧 Scene JSON。

### Step 6：创建 Mediator

推荐层级：

```text
Canvas/UIRoot/EquipmentMediator
```

操作：

```text
新建 Node：EquipmentMediator
添加 EquipmentMediator 组件
```

Inspector 绑定：

```text
equipmentPanel -> EquipmentPanel 组件
bagPanel -> EquipmentBagPanel 组件
detailPanel -> EquipmentDetailPanel 组件
```

### Step 7：切换 Launch Scene

在 Cocos Creator Editor 中：

```text
Project Settings / General / Launch Scene
选择 assets/scenes/Phase10Main.scene
保存
```

### Step 8：清理调试日志

删除：

```text
Step11AG_FORCE
Step11AH
Step11AJ
Step11AO re-rendering 临时日志
```

### Step 9：保存并 Preview

必须在 Cocos Creator 内保存 Scene 后 Preview。

---

## 11. 给用户的手动验证步骤

用户在 Cocos Creator 中验证：

```text
1. 双击打开 assets/scenes/Phase10Main.scene
2. 确认 Hierarchy 顶部为 Phase10Main
3. 确认层级：
   Phase10Main
   └── Canvas
       ├── Camera
       └── UIRoot
           ├── EquipmentPanel
           ├── EquipmentBagPanel
           ├── EquipmentDetailPanel
           └── EquipmentMediator
4. 点击 EquipmentMediator
5. Inspector 中确认 equipmentPanel / bagPanel / detailPanel 三项非空
6. 点击 Preview
7. 打开装备面板
8. 打开背包
9. 点击装备 Item
10. 确认 DetailPanel 打开
```

---

## 12. 验收标准

### 12.1 Editor 验收

必须满足：

```text
Cocos Creator 可正常打开 Phase10Main.scene
Hierarchy 显示 Phase10Main，不是 scene-001
Canvas / Camera / UIRoot 全部可见
EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel / EquipmentMediator 全部可见
Panel 根节点 parent 均为 UIRoot
EquipmentMediator 三个引用全部非空
```

### 12.2 Console 验收

Console 不允许出现：

```text
Open scene failed
Node has not attached to a scene
Cannot read properties of null
Maximum call stack size exceeded
duplicate UUID
Missing Script
can't get filed of prefab component
Step11AG_FORCE
Step11AH
Step11AJ
```

### 12.3 静态验收

必须满足：

```text
duplicateIds = []
invalidRefs = []
Missing Script = 0
PrefabInstance 残留 = 0
SceneAsset uuid 与 .scene.meta uuid 一致
settings/profiles 中 Launch Scene 指向 Phase10Main
Panel root _parent 均指向 UIRoot
UIRoot._children 包含三个 Panel 与 EquipmentMediator
```

### 12.4 运行时验收

必须满足：

```text
EquipmentPanel 正常显示
EquipmentBagPanel 正常打开
装备列表正常显示
EquipmentDetailPanel 正常打开
关闭按钮可用
Portrait 720 x 1280 正常
控制台干净
```

---

## 13. 最终审计结论

```text
1. 最终根因判断：
   Step11AQ 生成器产生了 Cocos 语义不合法的 Scene JSON。

2. 是否确认 Step11AQ 运行失败：
   是。

3. 是否确认 Phase10Main.scene 当前不可作为主场景：
   是。

4. 是否建议废弃 generate_phase10_scene.js 生成 Scene 的方案：
   是。

5. 是否建议改为 Cocos Creator 编辑器内手动新建 Scene：
   是。

6. 是否需要重建 Phase10Main.scene：
   是。

7. 是否需要删除旧 Phase10Main.scene：
   需要先备份，再替换或删除。

8. 是否需要保留 Phase8Main.scene：
   仅保留为 legacy/reference。

9. 是否需要移除 Step11AG / Step11AH / Step11AJ 调试日志：
   是。
```

Phase10-Step11 当前状态：

```text
Step11AQ 静态验证 PASS
Step11AQ 运行验证 FAIL
Step11AR 审计完成后，必须进入手动 Editor 重建修复
Phase10-Step11 不能 FINAL PASS
Phase10-Step12 不能启动
```
