# Phase10-Step11X10 AssetDB QueryAssetInfo Root Cause Audit

项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
工程路径：`E:\CocosProjects\TestGame\TestGame`  
审计日期：2026-06-11

---

## 1. 审计边界

本轮只审计：

```text
[Window] parameter error
Error: parameter error
at AssetManager.queryAssetInfo
(Target: asset-db, Message: query-asset-info)
```

本轮不再分析：

```text
EquipmentDetailPanel 递归
EquipmentBagPanel 显示
EquipmentMediator 加载
Tree Shaking
SlotItem
Layout
duplicateIds
Prefab Instance 污染主链路
```

本轮未修改代码、Prefab、Scene。

---

## 2. 当前已确认状态

Step11X9 后当前 `Phase8Main.scene` 复核结果：

```text
objects = 254
duplicateIds = []

EquipmentPanel = 1
EquipmentBagPanel = 1
EquipmentDetailPanel = 1
EquipmentMediator = 1
```

当前关键节点：

```text
EquipmentPanel
idx = 6
path = Canvas/UIRoot/EquipmentPanel

EquipmentBagPanel
idx = 69
path = Canvas/UIRoot/EquipmentBagPanel
_id = Step11X9-BagRoot-1-EquipmentBagPanel
prefab = f4d5e6a7-b8c9-0123-defa-234567890123

EquipmentDetailPanel
idx = 134
path = Canvas/UIRoot/EquipmentDetailPanel
_id = c3Pj5qyNRIeILIh/A0G0Us
prefab = a5e6f7b8-c9d0-1234-efab-345678901234

EquipmentMediator
idx = 241
path = EquipmentMediator
```

`EquipmentMediator` 绑定：

```json
{
  "equipmentPanel": {
    "__id__": 64
  },
  "bagPanel": {
    "__id__": 132
  },
  "detailPanel": {
    "__id__": 220
  }
}
```

---

## 3. UUID 完整性扫描

扫描范围：

```text
assets/**/*.meta
assets/**/*.scene
assets/**/*.prefab
assets/**/*.json
assets/resources/**
```

统计结果：

```text
metaCount = 344
metaProblems = []
uuid reference count = 233
invalid uuid reference count = 0
```

结论：

```text
未发现空 __uuid__
未发现 null __uuid__
未发现损坏 __uuid__
未发现不存在的 __uuid__
未发现重复 meta uuid
```

说明：

```text
BattleTestClean.scene 和 scene-001.scene 因 UTF-8 BOM 被普通 JSON.parse 报错。
这属于扫描脚本未剥 BOM 的解析问题，不是 AssetDB UUID 缺失。
```

---

## 4. 当前可疑对象

虽然 duplicateIds 已清空，但当前 `Phase8Main.scene` 仍有一个 Editor 级残留对象：

```text
Canvas/(empty)
```

原始 Scene 片段：

```json
{
  "idx": 226,
  "path": "Canvas/(empty)",
  "parent": 2,
  "children": [],
  "components": [],
  "prefab": {
    "__id__": 227
  }
}
```

对应 PrefabInfo：

```json
{
  "__type__": "cc.PrefabInfo",
  "root": {
    "__id__": 226
  },
  "asset": {
    "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123",
    "__expectedType__": "cc.Prefab"
  },
  "fileId": "",
  "instance": {
    "__id__": 228
  },
  "targetOverrides": null,
  "nestedPrefabInstanceRoots": null
}
```

对应 PrefabInstance：

```json
{
  "__type__": "cc.PrefabInstance",
  "fileId": "eckONVe0hL34KCUgq8ywRj",
  "prefabRootNode": null,
  "mountedChildren": [],
  "mountedComponents": [],
  "propertyOverrides": [
    {
      "__id__": 229
    },
    {
      "__id__": 231
    },
    {
      "__id__": 232
    },
    {
      "__id__": 233
    },
    {
      "__id__": 234
    }
  ],
  "removedComponents": []
}
```

对应 TargetInfo：

```json
{
  "__type__": "cc.TargetInfo",
  "localID": [
    ""
  ]
}
```

判断：

```text
该对象不是运行时 EquipmentBagPanel。
它是 Canvas 直下的匿名 prefab instance 残留。
它没有 name、没有 children、没有 components。
它指向 EquipmentBagPanel.prefab，但 PrefabInstance.prefabRootNode = null。
它的 TargetInfo.localID 为空字符串。
```

---

## 5. AssetDB queryAssetInfo 调用方判断

堆栈显示调用方是：

```text
Target: asset-db
Message: query-asset-info
AssetManager.queryAssetInfo
```

这不是游戏运行时代码调用。

实际调用来源判断：

```text
Cocos Creator Editor Window / Inspector / Hierarchy 在解析当前 Scene 中的 prefab instance 信息时，
向 asset-db 发送 query-asset-info。
```

触发对象：

```text
Phase8Main.scene[226]
Canvas/(empty)
```

关联资源路径：

```text
db://assets/prefabs/panels/EquipmentBagPanel.prefab
```

关联 UUID：

```text
f4d5e6a7-b8c9-0123-defa-234567890123
```

是否为空 UUID：

```text
否
```

是否失效 UUID：

```text
否
```

是否引用已删除资源：

```text
否
```

真正异常参数：

```text
不是 asset uuid。
而是 Scene 中残留 prefab instance 的 editor bookkeeping 字段异常：

prefabRootNode = null
TargetInfo.localID = [""]
匿名 root node，无 name / children / components
```

---

## 6. 备份文件 / Editor 缓存噪声

AssetDB 当前还导入了历史备份/损坏文件：

```text
db://assets/scenes/Phase8Main.scene.backup.Step10M
db://assets/scenes/Phase8Main.scene.corrupt.Step10L
db://assets/scenes/Phase8Main.scene.backup.Step11X9.2026-06-11T03-47-50-072Z
db://assets/prefabs/panels/EquipmentBagPanel.prefab.backup.Step10M
db://assets/prefabs/panels/EquipmentPanel.prefab.backup.Step10M
```

对应 meta importer：

```text
importer = "*"
```

判断：

```text
这些文件位于 assets 目录内，因此会被 Cocos AssetDB 当作资产导入。
它们不是当前 Preview 运行链路的一部分。
它们不会解释 EquipmentBagPanel 已经正常弹出的运行结果。
但它们会增加 Editor AssetDB 查询噪声。
```

建议：

```text
后续可以将 *.backup.* / *.corrupt.* 文件移出 assets 目录，放到项目外部备份目录。
这不是 Phase10-Step11X10 的运行阻塞项。
```

---

## 7. 是否属于 Scene / Prefab / Inspector / Editor 缓存

逐项结论：

```text
是否属于 Scene：
是。残留对象位于 Phase8Main.scene。

是否属于 Prefab：
不是 Prefab 本体损坏。EquipmentBagPanel.prefab UUID 有效，本体可被引用。

是否属于 Inspector 属性：
间接相关。Editor Inspector / Hierarchy 解析该残留 prefab instance 时触发 AssetDB 查询。

是否属于 Editor 缓存：
部分相关。历史 backup/corrupt 文件已进入 AssetDB 缓存，但不是当前运行链路。

是否属于业务代码：
否。

是否属于运行时逻辑：
否。
```

---

## 8. 是否影响运行

结论：

```text
不影响当前运行。
```

依据：

```text
用户已实际验证：
点击 武器 ——空——
EquipmentBagPanel 成功弹出
没有黑屏
没有崩溃

以下错误已消失：
Maximum call stack size exceeded
can't get filed of prefab component
EquipmentBagPanel<EquipmentBagPanel>
EquipmentDetailPanel<EquipmentDetailPanel>
```

当前 `[Window] parameter error` 来自 Editor 的 AssetDB 查询，不是游戏逻辑异常。

---

## 9. 是否影响微信小游戏构建

结论：

```text
低概率影响构建，当前证据不足以判定为构建阻塞。
```

原因：

```text
1. assets 内所有 __uuid__ 引用均有效。
2. meta UUID 无重复。
3. Phase8Main.scene duplicateIds = []。
4. 运行时关键 UI 链路已通过。
5. 错误来自 Editor Window / asset-db 查询，不是 TypeScript 编译或运行时。
```

风险点：

```text
Canvas/(empty) 残留 prefab instance 是 Scene 噪声。
assets 目录内的 backup/corrupt 文件是 AssetDB 噪声。
```

建议：

```text
进入正式微信构建前，建议执行一次 Editor 清理：
1. 移除 Canvas/(empty) 残留 prefab instance。
2. 将 assets 下的 *.backup.* / *.corrupt.* 文件移出 assets。
3. 关闭 Cocos Creator。
4. 删除 temp。
5. 重新打开工程并构建。
```

---

## 10. 是否属于 Editor 误报

结论：

```text
属于 Editor 侧 AssetDB / Inspector 查询异常。
不是装备 UI 运行时错误。
```

更精确地说：

```text
不是纯误报。
它对应一个真实存在的 Scene 残留对象：
Canvas/(empty) prefab instance。

但它是 Editor 数据残留，不是当前装备 UI 功能阻塞。
```

---

## 11. 是否需要修复

Phase10-Step11X9 验收角度：

```text
不需要作为 Step11X9 阻塞项修复。
```

工程卫生角度：

```text
建议修复。
```

唯一建议修复项：

```text
移除 Phase8Main.scene 中 Canvas/(empty) 残留 prefab instance：

scene[226] cc.Node
scene[227] cc.PrefabInfo
scene[228] cc.PrefabInstance
scene[229-234] property override / target info
```

同时从：

```text
Canvas._children
Scene._prefab.nestedPrefabInstanceRoots
```

移除对该残留 root 的引用。

非必须但推荐：

```text
将 assets/scenes/*.backup.*、assets/scenes/*.corrupt.*、
assets/prefabs/**/*.backup.* 移出 assets 目录。
```

---

## 12. 修复方案

### 方案 A：最小 Scene 清理

目标：

```text
只删除 Canvas/(empty) 残留 prefab instance。
```

处理对象：

```text
Phase8Main.scene[226]
Phase8Main.scene[227]
Phase8Main.scene[228]
Phase8Main.scene[229]
Phase8Main.scene[230]
Phase8Main.scene[231]
Phase8Main.scene[232]
Phase8Main.scene[233]
Phase8Main.scene[234]
```

同时更新：

```text
Canvas._children 移除 scene[226]
Scene._prefab.nestedPrefabInstanceRoots 移除 scene[226]
重新压缩 __id__ 引用
```

风险：

```text
低。该对象无 name / children / components，不参与运行时 UI。
```

### 方案 B：Editor 缓存清理

目标：

```text
清理 AssetDB 噪声。
```

步骤：

```text
1. 关闭 Cocos Creator。
2. 将 assets 下的 *.backup.* / *.corrupt.* 移出项目 assets。
3. 删除 temp。
4. 重新打开工程。
5. 重新打开 Phase8Main.scene。
```

风险：

```text
低，但移动备份文件前需确认外部备份路径。
```

---

## 13. 最终根因

### 13.1 parameter error 最终根因

最终根因：

```text
[Window] parameter error 来自 Cocos Editor AssetDB 查询当前 Scene 中残留的匿名 prefab instance。
```

具体对象：

```text
Phase8Main.scene
Canvas/(empty)
scene[226] cc.Node
scene[227] cc.PrefabInfo
scene[228] cc.PrefabInstance
```

具体资源：

```text
db://assets/prefabs/panels/EquipmentBagPanel.prefab
uuid = f4d5e6a7-b8c9-0123-defa-234567890123
```

异常字段：

```text
prefabRootNode = null
TargetInfo.localID = [""]
anonymous root node
```

不是：

```text
空 UUID
失效 UUID
已删除资源
Prefab 本体损坏
业务代码错误
运行时 UI 错误
```

---

## 14. Phase10-Step11X9 是否可以最终 PASS

结论：

```text
可以。
```

理由：

```text
1. Step11X9 的目标是清除 duplicateIds / Prefab Instance 污染主链路。
2. 当前 duplicateIds = []。
3. EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel / EquipmentMediator 均为 1。
4. EquipmentMediator 绑定已由用户截图确认。
5. Preview 中 EquipmentBagPanel 已正常弹出。
6. Maximum call stack size exceeded 已消失。
7. can't get filed of prefab component 已消失。
8. 当前 parameter error 是 Editor AssetDB 查询残留对象，不影响装备 UI 运行。
```

最终判断：

```text
Phase10-Step11X9 PASS。
```

建议下一步：

```text
Phase10-Step11X11 Editor Residual Cleanup
```

目标：

```text
清理 Canvas/(empty) 残留 prefab instance。
移出 assets 内 backup/corrupt 文件。
刷新 temp / AssetDB 缓存。
```
