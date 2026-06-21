# Phase10-Step11P Scene / ProjectSettings 恢复审计报告

项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
目标工程：`E:\CocosProjects\TestGame\TestGame`  
审计日期：2026-06-08

---

## 1. 最终结论

Step11P 审计结论：

```text
Phase8Main.scene 的 Canvas / Camera / EquipmentPanel 主体序列化有效。
EquipmentPanel.ts.meta UUID 有效。
EquipmentPanel.ts 源码与 Preview 编译产物均包含 Step11O 诊断日志。
当前缺失 Step11O 日志的 Preview 表现，不能由 EquipmentPanel.ts 未编译或 Prefab 未加载解释。
```

本轮确认的唯一可修复 Scene 序列化错误为：

```text
Phase8Main.scene 中 EquipmentPanel.closeButton 字段绑定到了 closeButton Node。
该字段声明类型为 cc.Button，实际应绑定 closeButton 节点上的 cc.Button 组件。
```

该错误已经修复：

```text
修复前：
EquipmentPanel.closeButton -> scene[48] closeButton Node

修复后：
EquipmentPanel.closeButton -> scene[51] cc.Button
```

对当前阻塞现象的根因判断：

```text
Preview 未执行 Phase8Main.scene 中 EquipmentPanel 的运行时生命周期。
```

证据是：

```text
1. Phase8Main.scene 依赖 EquipmentPanel.ts / EquipmentMediator.ts。
2. EquipmentPanel.ts 源码存在 Step11O 日志。
3. temp Preview 编译产物也存在 Step11O 日志。
4. 实际 Preview 控制台却没有 EquipmentPanel.onLoad / open / _refreshAll / _renderSlots。
5. scene-001.scene 的 library 依赖只包含 BattleDebugRunner 脚本，不包含 EquipmentPanel 链路。
```

因此，Step11P 后续验证必须从明确运行 `assets/scenes/Phase8Main.scene` 开始。

---

## 2. Portrait 规范审计

目标规范：

```text
Design Resolution = 720 x 1280
Orientation = Portrait
Fit Width = true
Fit Height = true
Camera orthoHeight = 640
Canvas Center = (360, 640)
```

### 2.1 Phase8Main.scene

文件：

```text
E:\CocosProjects\TestGame\TestGame\assets\scenes\Phase8Main.scene
```

审计结果：

```text
Scene UUID:
b5995a61-fbb0-47a0-8ea6-f728a6314036

Canvas Node:
scene[2]
active = true
position = (360, 640, 0)

Canvas UITransform:
scene[5]
width = 720
height = 1280

Canvas:
scene[6]
camera = scene[4]

Camera Node:
scene[3]
active = true

Camera Component:
scene[4]
projection = 0
orthoHeight = 640
```

结论：

```text
Phase8Main.scene 本体符合 Portrait 规范。
```

### 2.2 其他 Scene

审计到的 Scene 尺寸：

```text
assets/scenes/Phase8Main.scene:
720 x 1280

assets/scenes/scene-001.scene:
720 x 1280

assets/scene.scene:
720 x 1280

assets/scenes/BattleTestClean.scene:
720 x 1280

assets/_deprecated_scene.scene:
1280 x 720
```

结论：

```text
_deprecated_scene.scene 存在横屏尺寸，但该文件名已经标记 deprecated。
它不是当前 Phase8Main 运行链路的一部分。
```

### 2.3 Phase8Main 内部残留 1280 x 720

Phase8Main.scene 中仍有一处 `1280 x 720`：

```text
scene[135]
type = cc.UITransform
node = scene[72] EquipmentBagPanel
size = 1280 x 720
```

该尺寸属于 `EquipmentBagPanel` 根节点 UITransform，不是 Canvas / Camera / ProjectSettings。

风险：

```text
该面板根尺寸为横屏尺寸，会影响 BagPanel 打开后的版面覆盖范围。
但它不能解释 EquipmentPanel.onLoad / open / _refreshAll / _renderSlots 完全没有日志。
```

建议：

```text
进入下一步 UI 恢复时，将 EquipmentBagPanel 根 UITransform 调整为 720 x 1280。
```

---

## 3. ProjectSettings 审计

项目中未发现旧式 `ProjectSettings` 目录。

Cocos Creator 3.8.8 当前工程使用：

```text
settings/v2/packages
profiles/v2/packages
```

已检查文件：

```text
settings/v2/packages/project.json
profiles/v2/packages/project.json
settings/v2/packages/device.json
settings/v2/packages/program.json
profiles/v2/packages/reference-image.json
profiles/v2/packages/scene.json
```

结果：

```text
settings/v2/packages/project.json:
仅包含 __version__ = 1.0.6

profiles/v2/packages/project.json:
仅包含 __version__ = 1.0.6

settings/v2/packages/device.json:
仅包含 __version__ = 1.0.1

settings/v2/packages/program.json:
仅包含 __version__ = 1.0.4
```

未在上述 ProjectSettings / profiles 文件中发现可直接编辑的：

```text
design width = 1280
design height = 720
fitWidth = true
fitHeight = false
orientation = landscape
```

因此：

```text
本轮没有对 ProjectSettings JSON 进行猜测式写入。
```

原因：

```text
当前文件中没有可验证的 Cocos 3.8.8 ProjectSettings 持久化字段。
强行新增未知 schema 字段会引入新的 Editor 配置风险。
```

---

## 4. 启动 Scene / Preview Scene 审计

### 4.1 Phase8Main Scene UUID

```text
assets/scenes/Phase8Main.scene.meta
uuid = b5995a61-fbb0-47a0-8ea6-f728a6314036
```

### 4.2 scene-001 Scene UUID

```text
assets/scenes/scene-001.scene.meta
uuid = 344c401c-7b16-4691-ba49-595d7bae3943
```

### 4.3 Editor profile 中记录的 Scene

文件：

```text
profiles/v2/packages/reference-image.json
```

内容：

```text
scene = b5995a61-fbb0-47a0-8ea6-f728a6314036
```

结论：

```text
该 profile 记录指向 Phase8Main.scene。
```

### 4.4 library 依赖对比

文件：

```text
library/.assets-data.json
```

Phase8Main：

```text
uuid = b5995a61-fbb0-47a0-8ea6-f728a6314036
url = db://assets/scenes/Phase8Main.scene

dependScripts:
989a740d-2dc1-4f7f-b128-3372a4dcabd1
fd274f49-b5d5-4940-92d0-1131d863d326
fb89d971-e13e-43f8-aa9c-6d9e087e9125
534fa1a8-9b12-44ad-8401-30d03ea10094
f9a3c7e1-2b4d-5f6a-8e9c-0d1b2c3d4e5f
679c94f0-3c9c-4535-b906-acd9a97076eb
```

其中：

```text
fd274f49-b5d5-4940-92d0-1131d863d326 = EquipmentPanel.ts
679c94f0-3c9c-4535-b906-acd9a97076eb = EquipmentMediator.ts
```

scene-001：

```text
uuid = 344c401c-7b16-4691-ba49-595d7bae3943
url = db://assets/scenes/scene-001.scene

dependScripts:
a367370a-88a4-4092-bf35-8dcba058018e
```

结论：

```text
scene-001.scene 不包含 EquipmentPanel / EquipmentMediator 运行链路。
如果 Preview 控制台只有 BattleDebugRunner 类日志，而没有 Step11O 日志，则该 Preview 没有执行 Phase8Main 的 EquipmentPanel 生命周期。
```

---

## 5. EquipmentPanel.ts.meta 审计

文件：

```text
E:\CocosProjects\TestGame\TestGame\assets\scripts\ui\EquipmentPanel.ts.meta
```

UUID：

```text
fd274f49-b5d5-4940-92d0-1131d863d326
```

Phase8Main.scene 中 EquipmentPanel 脚本组件：

```text
scene[67]
type = fd2749JtdVJQJLQETHYY9Mm
```

library 中 Phase8Main 依赖：

```text
dependScripts includes fd274f49-b5d5-4940-92d0-1131d863d326
```

结论：

```text
EquipmentPanel.ts.meta UUID 有效。
Scene 脚本引用有效。
不存在 EquipmentPanel.ts.meta 丢失或 Scene 脚本脱钩证据。
```

---

## 6. EquipmentPanel Scene 节点审计

Phase8Main.scene 当前结构：

```text
Canvas scene[2]
├── Camera scene[3]
└── UIRoot scene[9]
    ├── EquipmentPanel scene[10]
    ├── EquipmentBagPanel scene[72]
    ├── EquipmentDetailPanel scene[139]
    └── RenderProbeLabel scene[233]
```

节点状态：

```text
Canvas:
active = true
layer = 33554432

Camera:
active = true
layer = 1073741824

UIRoot:
active = true
layer = 33554432

EquipmentPanel:
active = true
layer = 33554432

EquipmentBagPanel:
active = false
layer = 33554432

EquipmentDetailPanel:
active = false
layer = 33554432

RenderProbeLabel:
active = true
layer = 33554432
```

EquipmentPanel 组件绑定：

```text
component = scene[67]
panelRoot = scene[11]
slotContainer = scene[12]
slotItemPrefab = c1a2b3d4-e5f6-7890-abcd-ef1234567890
closeButton = scene[51]
```

结论：

```text
EquipmentPanel 主绑定有效。
slotContainer 有效。
slotItemPrefab UUID 有效。
closeButton 已恢复为 cc.Button 组件引用。
```

---

## 7. Close Button Unknown Type 根因与修复

### 7.1 根因

`EquipmentPanel.ts` 中字段声明：

```text
@property(Button)
closeButton: Button | null
```

Scene 实例中错误绑定：

```text
closeButton = scene[48]
scene[48] = closeButton Node
```

正确绑定应为：

```text
closeButton = scene[51]
scene[51] = cc.Button
```

### 7.2 已执行修复

文件：

```text
E:\CocosProjects\TestGame\TestGame\assets\scenes\Phase8Main.scene
```

修复内容：

```text
scene[67].closeButton:
从 { "__id__": 48 }
改为 { "__id__": 51 }
```

验证结果：

```text
closeButton = 51
closeButtonType = cc.Button
closeButtonNodeName = closeButton
```

结论：

```text
Inspector 中 Close Button 显示 Unknown Type 的直接原因已修复。
```

---

## 8. Preview 编译链路审计

### 8.1 源码日志存在

文件：

```text
assets/scripts/ui/EquipmentPanel.ts
```

存在日志：

```text
[Step11O] EquipmentPanel.onLoad 完成
[Step11O] EquipmentPanel.open() — heroId =
[Step11O] _refreshAll() 入口
[Step11O] _renderSlots() 入口
[Step11O] _createSlotItem() 入口
```

### 8.2 Preview 编译产物日志存在

文件：

```text
temp/programming/packer-driver/targets/preview/chunks/a1/a103a038f5378676766a876ed641c3e9f1d0d122.js
```

存在同样的 Step11O 日志。

结论：

```text
当前 Preview 编译产物并未丢失 EquipmentPanel.ts 的 Step11O 代码。
```

因此：

```text
如果实际 Preview 控制台仍完全没有 Step11O 日志，
问题不在 EquipmentPanel.ts 未编译，
而在 Preview 没有执行 Phase8Main.scene 中的 EquipmentPanel 实例。
```

---

## 9. library / temp 审计

当前证据：

```text
library/.assets-data.json 能识别 Phase8Main.scene 与 EquipmentPanel.ts 依赖。
temp Preview chunk 中存在 EquipmentPanel Step11O 编译结果。
```

结论：

```text
当前没有足够证据证明 library / temp 缓存已经污染到必须删除。
```

本轮未执行：

```text
删除 library
删除 temp
```

原因：

```text
删除 library / temp 属于破坏性缓存清理。
在当前证据下不是第一修复动作。
```

如果重新打开 Phase8Main.scene 后 Preview 仍无 Step11O 日志，再执行缓存清理。

推荐清理顺序：

```text
1. 关闭 Cocos Creator。
2. 删除 E:\CocosProjects\TestGame\TestGame\temp。
3. 删除 E:\CocosProjects\TestGame\TestGame\library。
4. 重新打开工程。
5. 等待资源重新导入与脚本重新编译。
6. 打开 assets/scenes/Phase8Main.scene。
7. 再运行 Preview。
```

---

## 10. 修复方案

### 已完成修复

```text
Phase8Main.scene:
EquipmentPanel.closeButton 已恢复为 cc.Button 组件引用。
```

### 必须执行的恢复动作

```text
1. 在 Cocos Creator 中明确打开：
   assets/scenes/Phase8Main.scene

2. 确认 Hierarchy 根节点为：
   Phase8Main

3. 运行 Preview。

4. Console 必须出现：
   [Step11O] EquipmentPanel.onLoad 完成
   [Step11O] EquipmentPanel.open() — heroId =
   [Step11O] _refreshAll() 入口
   [Step11O] _renderSlots() 入口

5. 如果仍无 Step11O 日志：
   关闭 Cocos Creator 后清理 temp / library，再重新导入。
```

### 下一步建议修复

```text
EquipmentBagPanel 根 UITransform 当前为 1280 x 720。
建议在 UI 恢复阶段改为 720 x 1280，符合 Portrait 规范。
```

---

## 11. 风险分析

### 风险 1：误改 ProjectSettings schema

当前没有发现 Cocos 3.8.8 明确持久化的 design width / height / fitWidth / fitHeight 字段。

风险：

```text
手动新增未知 ProjectSettings 字段可能被 Editor 忽略，或污染 profiles/settings。
```

处理：

```text
本轮未对 ProjectSettings JSON 进行猜测式写入。
```

### 风险 2：Preview 当前打开 Scene 与目标 Scene 不一致

证据：

```text
Phase8Main 编译链路有 Step11O。
实际 Preview 无 Step11O。
scene-001 不包含 EquipmentPanel 链路。
```

风险：

```text
继续在错误 Scene 上验证，会反复误判 EquipmentPanel / Prefab / SlotItem。
```

处理：

```text
必须先打开 Phase8Main.scene 再 Preview。
```

### 风险 3：EquipmentBagPanel 根尺寸仍是横屏

证据：

```text
scene[72] EquipmentBagPanel
scene[135] cc.UITransform
width = 1280
height = 720
```

风险：

```text
BagPanel 打开后可能布局偏移或覆盖范围异常。
```

处理：

```text
进入下一步 UI 恢复时调整为 720 x 1280。
```

### 风险 4：删除 library / temp 的代价

风险：

```text
重新导入耗时，并可能暴露更多历史资源警告。
```

处理：

```text
仅在打开 Phase8Main.scene 后仍无 Step11O 日志时执行。
```

---

## 12. 最终验收标准

Step11P 之后进入 Runtime Verification 前，必须满足：

```text
Preview 运行 Phase8Main.scene。

Console 出现：
[Step11O] EquipmentPanel.onLoad 完成
[Step11O] EquipmentPanel.open() — heroId =
[Step11O] _refreshAll() 入口
[Step11O] _renderSlots() 入口

Inspector 中 EquipmentPanel.closeButton 不再显示 Unknown Type。

EquipmentPanel 能生成 SlotItem：
slotContainer.children.length > 0
_slotItems.length > 0
```

随后进入：

```text
Phase10-Step11Q Runtime Verification Retry

验证：
EquipmentBagPanel 显示
EquipmentDetailPanel 显示
装备槽位显示
装备列表显示
Equip
Unequip
Save
Load
```

---

## 13. Step11P 最终结论

```text
Step11P PASS with required Preview retry.
```

原因：

```text
1. Phase8Main.scene Portrait 主规范已确认。
2. EquipmentPanel.ts.meta UUID 已确认有效。
3. EquipmentPanel.ts 源码与 Preview 编译产物均包含 Step11O。
4. EquipmentPanel.closeButton Unknown Type 的 Scene 实例错误已修复。
5. 当前无 Step11O 日志的运行表现，唯一能被证据支持的解释是 Preview 未执行 Phase8Main EquipmentPanel 生命周期。
```

下一步：

```text
明确打开 Phase8Main.scene 后重新 Preview。
如果仍无 Step11O 日志，再执行 library / temp 清理与重新导入。
```
