# Phase10-Step11X9 Scene JSON ID Recovery Report

项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
工程路径：`E:\CocosProjects\TestGame\TestGame`  
执行日期：2026-06-11

---

## 1. 执行范围

本轮只修复：

```text
assets/scenes/Phase8Main.scene
tools/fix-phase8main-scene-instance.js
docs/Phase10-Step11X9-Scene-JSON-ID-Recovery-Report.md
```

未修改：

```text
assets/scripts/ui/EquipmentPanel.ts
assets/scripts/ui/EquipmentBagPanel.ts
assets/scripts/ui/EquipmentDetailPanel.ts
assets/scripts/ui/EquipmentMediator.ts
```

未修改 Prefab 本体：

```text
assets/prefabs/panels/EquipmentBagPanel.prefab
assets/prefabs/panels/EquipmentDetailPanel.prefab
```

---

## 2. 修复前 duplicateIds

修复前 `Phase8Main.scene`：

```text
objectCount = 344
duplicateIds = 2
```

重复项：

```text
1. EquipmentDetailPanel-root
   count = 2

2. EquipmentDetailPanel-slotPickerCloseBtn
   count = 42
```

`EquipmentDetailPanel-root` 涉及节点：

```text
idx 69
path = Canvas/UIRoot/EquipmentBagPanel
name = EquipmentBagPanel
_id = EquipmentDetailPanel-root

idx 135
path = Canvas/UIRoot/EquipmentDetailPanel
name = EquipmentDetailPanel
_id = EquipmentDetailPanel-root
```

`EquipmentDetailPanel-slotPickerCloseBtn` 涉及：

```text
Canvas/UIRoot/EquipmentBagPanel 子树 17 个节点
Canvas/UIRoot/EquipmentDetailPanel 子树 25 个节点
总计 42 个节点
```

---

## 3. 修复前节点统计

修复前关键节点数量：

```text
EquipmentPanel = 1
EquipmentBagPanel = 1
EquipmentDetailPanel = 2
EquipmentMediator = 1
```

修复前关键结构：

```text
Canvas
├── UIRoot
│   ├── EquipmentPanel
│   ├── EquipmentBagPanel          <- 旧损坏实例
│   ├── EquipmentDetailPanel       <- 旧损坏实例
│   └── RenderProbeLabel
└── EquipmentDetailPanel           <- 用户新拖入实例，未归入 UIRoot
```

修复前 `EquipmentMediator` 绑定：

```text
equipmentPanel -> scene[64]
bagPanel       -> null
detailPanel    -> scene[323]
```

结论：

```text
用户重新拖入 Prefab 后，旧损坏实例仍保留在 UIRoot。
新 DetailPanel 位于 Canvas 直下。
BagPanel 绑定丢失。
```

---

## 4. Prefab Component Error 根因

控制台错误：

```text
can't get filed of prefab component:
EquipmentBagPanel<EquipmentBagPanel>

can't get filed of prefab component:
EquipmentDetailPanel<EquipmentDetailPanel>

parameter error
```

根因链路：

```text
Phase8Main.scene 中旧 EquipmentBagPanel / EquipmentDetailPanel 实例仍存在。

旧 EquipmentBagPanel:
name = EquipmentBagPanel
_id = EquipmentDetailPanel-root
PrefabInfo.root = scene[69]
PrefabInfo.asset = EquipmentBagPanel.prefab
targetOverrides = null
nestedPrefabInstanceRoots = null

旧 EquipmentDetailPanel:
name = EquipmentDetailPanel
_id = EquipmentDetailPanel-root
PrefabInfo.root = scene[135]
PrefabInfo.asset = EquipmentDetailPanel.prefab
targetOverrides = null
nestedPrefabInstanceRoots = null
```

损坏点：

```text
1. Scene 节点 _id 与 prefab 子树语义不一致。
2. BagPanel 节点树混入 DetailPanel 的 _id。
3. DetailPanel 旧实例与 BagPanel 旧实例共享 root _id。
4. 重新拖入的 DetailPanel 没有替换旧 UIRoot 下的损坏实例。
5. EquipmentMediator.bagPanel 为 null。
```

解释：

```text
Cocos 在读取 prefab component 字段时，会根据 prefab instance / prefab info / component field chain 解析节点与组件。
旧实例的 _id 与 prefab 信息不一致，再叠加重复 _id，导致字段解析失败并抛出 parameter error。
```

---

## 5. 实际修复方案

采用方案：

```text
方案B + 方案C
Scene节点重建脚本 + Prefab Instance Recovery
```

实际动作：

```text
1. 自动备份 Phase8Main.scene。
2. 删除旧损坏 EquipmentBagPanel 子树。
3. 删除旧损坏 EquipmentDetailPanel 子树。
4. 保留用户新拖入、_id 唯一的 EquipmentDetailPanel。
5. 将新 EquipmentDetailPanel 从 Canvas 直下移动到 UIRoot 下。
6. 从干净 EquipmentBagPanel.prefab 克隆新的 BagPanel 子树到 UIRoot。
7. 为克隆的 BagPanel 子树生成唯一 _id。
8. 重建 UIRoot children 顺序。
9. 修复 EquipmentMediator 绑定。
10. 输出修复前后统计。
```

自动备份：

```text
E:\CocosProjects\TestGame\TestGame\assets\scenes\Phase8Main.scene.backup.Step11X9.2026-06-11T03-47-50-072Z
```

---

## 6. 修复脚本

脚本路径：

```text
E:\CocosProjects\TestGame\TestGame\tools\fix-phase8main-scene-instance.js
```

脚本职责：

```text
读取 Phase8Main.scene
读取 EquipmentBagPanel.prefab
读取 EquipmentDetailPanel.prefab
统计修复前 duplicateIds / 节点数量
识别旧损坏 BagPanel / DetailPanel
识别用户新拖入的干净 DetailPanel
移除旧损坏子树
克隆干净 BagPanel prefab 子树
重写 __id__ 引用
生成唯一 _id
修复 UIRoot children
修复 EquipmentMediator 绑定
验证无越界 __id__
验证 duplicateIds = []
验证关键节点数量均为 1
写入 Scene
输出修复报告 JSON
```

执行命令：

```powershell
node E:\CocosProjects\TestGame\TestGame\tools\fix-phase8main-scene-instance.js
```

核心输出：

```json
{
  "removed": {
    "corruptBagIndex": 69,
    "corruptDetailIndex": 135,
    "removedObjectCount": 155
  },
  "preserved": {
    "cleanDetailOldIndex": 237,
    "cleanDetailNewIndex": 82
  },
  "cloned": {
    "bagPrefabObjects": 66,
    "bagRootIndex": 189,
    "bagScriptIndex": 253
  }
}
```

---

## 7. 修复后 duplicateIds

独立复核结果：

```text
objectCount = 255
duplicateIds = []
invalidRefs = []
```

重点项：

```text
EquipmentDetailPanel-root
不再出现在 Phase8Main.scene

EquipmentDetailPanel-slotPickerCloseBtn
不再出现在 Phase8Main.scene
```

`rg` 复核：

```text
Phase8Main.scene:
未命中 EquipmentDetailPanel-root
未命中 EquipmentDetailPanel-slotPickerCloseBtn

EquipmentDetailPanel.prefab:
仍正常保留自身合法 _id
```

---

## 8. 修复后节点统计

修复后关键节点数量：

```text
EquipmentPanel = 1
EquipmentBagPanel = 1
EquipmentDetailPanel = 1
EquipmentMediator = 1
```

修复后关键结构：

```text
Canvas
└── UIRoot
    ├── EquipmentPanel
    ├── EquipmentBagPanel
    ├── EquipmentDetailPanel
    └── RenderProbeLabel

EquipmentMediator
```

修复后关键节点：

```text
EquipmentPanel:
idx = 6
path = Canvas/UIRoot/EquipmentPanel
active = true

EquipmentDetailPanel:
idx = 82
path = Canvas/UIRoot/EquipmentDetailPanel
active = false
prefab = a5e6f7b8-c9d0-1234-efab-345678901234

EquipmentBagPanel:
idx = 189
path = Canvas/UIRoot/EquipmentBagPanel
active = false
prefab = f4d5e6a7-b8c9-0123-defa-234567890123

EquipmentMediator:
idx = 176
path = EquipmentMediator
active = true
```

---

## 9. 修复后 EquipmentMediator 绑定状态

修复后 `EquipmentMediator` 脚本组件：

```text
idx = 178
type = 679c9TwPJxFNbkGrNmpcHbr
```

绑定：

```json
{
  "equipmentPanel": {
    "__id__": 64
  },
  "bagPanel": {
    "__id__": 253
  },
  "detailPanel": {
    "__id__": 168
  }
}
```

含义：

```text
equipmentPanel -> EquipmentPanel 脚本组件
bagPanel       -> 新克隆 EquipmentBagPanel 脚本组件
detailPanel    -> 保留的干净 EquipmentDetailPanel 脚本组件
```

---

## 10. 是否修改业务代码

结果：

```text
否
```

未修改：

```text
EquipmentPanel.ts
EquipmentBagPanel.ts
EquipmentDetailPanel.ts
EquipmentMediator.ts
EquipmentUIPresenter.ts
EquipmentService.ts
InventoryService.ts
SaveManager.ts
```

---

## 11. 是否修改 Prefab 本体

结果：

```text
否
```

未修改：

```text
EquipmentBagPanel.prefab
EquipmentDetailPanel.prefab
EquipmentPanel.prefab
EquipmentSlotItem.prefab
```

Prefab 本体仍保持：

```text
EquipmentBagPanel.prefab duplicateIds = []
EquipmentDetailPanel.prefab duplicateIds = []
```

---

## 12. Preview 验收步骤

请在 Cocos Creator 中执行：

```text
1. 关闭当前 Preview。
2. 保存并重新打开 Phase8Main.scene。
3. 等待 Scene 重新加载完成。
4. 打开 Hierarchy，确认：
   Canvas
   └── UIRoot
       ├── EquipmentPanel
       ├── EquipmentBagPanel
       ├── EquipmentDetailPanel
       └── RenderProbeLabel

5. 确认：
   EquipmentBagPanel active = false
   EquipmentDetailPanel active = false

6. 确认 EquipmentMediator Inspector：
   Equipment Panel 已绑定
   Bag Panel 已绑定
   Detail Panel 已绑定

7. 运行 Preview。
8. 点击：
   武器 ——空——

9. 期望：
   选择装备 · 武器 正常弹出。

10. 控制台不应再出现：
   层级面板过滤了重复 UUID 节点
   EquipmentDetailPanel-root
   EquipmentDetailPanel-slotPickerCloseBtn
   Maximum call stack size exceeded
   can't get filed of prefab component
   parameter error
```

如果 Cocos 仍读取旧缓存：

```text
1. 关闭 Cocos Creator。
2. 删除 temp。
3. 重新打开工程。
4. 重新打开 Phase8Main.scene。
5. 再次 Preview。
```

---

## 13. 最终结论

Step11X9 修复完成。

最终状态：

```text
Phase8Main.scene duplicateIds = []
invalid __id__ refs = []

EquipmentPanel = 1
EquipmentBagPanel = 1
EquipmentDetailPanel = 1
EquipmentMediator = 1

EquipmentMediator:
equipmentPanel 已绑定
bagPanel 已绑定
detailPanel 已绑定
```

根因关闭：

```text
旧损坏 Scene prefab instance 已从 Phase8Main.scene 中移除。
EquipmentBagPanel._id = EquipmentDetailPanel-root 已消除。
EquipmentDetailPanel-slotPickerCloseBtn 重复 42 次已消除。
用户新拖入但挂在 Canvas 直下的 DetailPanel 已移动到 UIRoot。
BagPanel 已从干净 Prefab 克隆并重新绑定。
```

结论：

```text
Phase10-Step11X9 PASS，等待 Preview 人工验收。
```
