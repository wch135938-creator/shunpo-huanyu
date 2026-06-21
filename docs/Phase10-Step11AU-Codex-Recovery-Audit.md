# Phase10-Step11AU — Codex 项目恢复审计报告

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
审计日期：2026-06-14  
审计方式：只读扫描项目源码、`CLAUDE.md`、`docs/`、`assets/scenes/`、`assets/prefabs/`、`assets/scripts/ui/`  
执行方：Codex

---

## 0. 审计边界

本次审计遵守以下限制：

```text
不修改源码
不修改 Scene
不修改 Prefab
不输出修复方案
仅依据项目源码、CLAUDE.md、docs 进行项目状态恢复与审计
```

重点阅读文档：

```text
docs/Phase10-Step11AQ-New-Clean-Scene-Rebuild-Report.md
docs/Phase10-Step11AR-Scene-Serialization-Audit.md
docs/Phase10-Step11AS-Manual-Scene-Rebuild-Report.md
docs/Phase10-Step11AT-Project-State-Recovery-Audit.md
docs/Phase10-Step12-Preparation-Report.md
```

重点扫描对象：

```text
assets/scenes/Phase10Main.scene
assets/prefabs/panels/EquipmentPanel.prefab
assets/prefabs/panels/EquipmentBagPanel.prefab
assets/prefabs/panels/EquipmentDetailPanel.prefab
assets/scripts/ui/
```

---

## 1. 当前项目真实阶段

```text
Phase 10
Step 11AS
```

判断依据：

```text
Phase10-Step10 Runtime Validation 已 PASS
Phase10-Step11AQ 静态 PASS / 运行 FAIL
Phase10-Step11AR 已确认 Scene 序列化根因
Phase10-Step11AS 自动化步骤完成
Phase10-Step11AS 手动编辑器重建尚未验收通过
Phase10-Step11 未 FINAL PASS
```

补充说明：

`docs/Phase10-Step11AT-Project-State-Recovery-Audit.md` 已存在，属于后续状态恢复审计文档；但从当前 `Phase10Main.scene` 与 Prefab/Inspector 绑定状态看，项目仍停留在 Step11AS 阻塞态。

---

## 2. 当前阻塞问题

### P0 — Portrait 规范未满足

项目最高优先级规范：

```text
720 × 1280
Portrait
Camera orthoHeight = 640
Canvas Center = (360,640)
```

当前 `assets/scenes/Phase10Main.scene` 静态扫描结果：

```text
Canvas Position = (640, 360, 0)
Canvas UITransform = 100 × 100
Camera orthoHeight = 360
UIRoot UITransform = 720 × 1280
```

结论：

```text
当前 Scene 未满足 Portrait 规范
```

### P0 — EquipmentMediator Inspector 绑定不完整

当前 `Phase10Main.scene` 中 `EquipmentMediator` 组件序列化状态：

```text
equipmentPanel = null
bagPanel       = null
detailPanel    = __id__:112
```

三个绑定中仅 `detailPanel` 成功。

根据 `assets/scripts/ui/EquipmentMediator.ts`：

```text
_ensurePanelsLoaded() 会检查 equipmentPanel / bagPanel / detailPanel
任一缺失会输出 Inspector bindings missing
动态加载已禁用
装备 UI 系统不会完整启动
```

结论：

```text
EquipmentMediator 当前不可正常驱动 Equipment UI
```

### P0 — EquipmentPanel / EquipmentBagPanel 在 Scene 中是 Nested PrefabInstance

当前 `Phase10Main.scene` 中：

```text
obj[6]  = EquipmentPanel prefab instance node
obj[18] = EquipmentBagPanel prefab instance node
```

二者均表现为压缩的 Nested PrefabInstance 节点：

```text
无 _name
无 _children
无 _components
无独立脚本组件对象
```

对比：

```text
EquipmentDetailPanel 在 Scene 中为展开式节点
其 EquipmentDetailPanel 脚本组件存在于 obj[112]
因此 detailPanel 可以绑定到 __id__:112
```

结论：

```text
EquipmentPanel / EquipmentBagPanel 的脚本组件未在 Scene JSON 中展开
Inspector 无法稳定绑定到对应 prefab component
```

### P1 — Prefab UUID / 节点 ID 状态存在风险

Prefab 静态扫描结果：

```text
EquipmentPanel.prefab      空 _id 数量 = 33
EquipmentBagPanel.prefab   空 _id 数量 = 66
EquipmentDetailPanel.prefab 空 _id 数量 = 0
```

`EquipmentDetailPanel.prefab` 保留固定旧式 ID：

```text
EquipmentDetailPanel-root
p8-Script-1
EquipmentDetailPanel-panelRoot
EquipmentDetailPanel-nameLabel
...
```

结论：

```text
Prefab 文件没有简单的重复非空 _id
但空 _id 与旧式固定 _id 并存，存在编辑器实例化/UUID 过滤风险
```

该风险与运行时/编辑器现象高度相关：

```text
层级面板过滤了重复 UUID 节点
can't get field of prefab component
```

### P1 — Phase8BootstrapEntry 缺失

当前 Canvas 组件只有：

```text
cc.UITransform
cc.Canvas
cc.Widget
```

未发现：

```text
Phase8BootstrapEntry
```

影响判断：

```text
如果 Phase10Main.scene 仅作为装备 UI 独立测试场景，该项不是当前最小验证阻塞
如果 Phase10Main.scene 要作为完整主场景，该项阻塞完整运行链路
```

---

## 3. 当前 Scene 状态

审计对象：

```text
assets/scenes/Phase10Main.scene
```

基础指标：

```text
文件存在
JSON 可解析
对象总数 = 133
Scene 名称 = Phase10Main
Scene uuid = f8d13b50-39f8-4c3a-b040-3b74fbef6bde
.scene.meta uuid = f8d13b50-39f8-4c3a-b040-3b74fbef6bde
duplicate _id = 0
invalid __id__ = 0
```

与 Step11AQ 产物对比：

```text
Step11AQ 旧场景对象数 = 307
当前场景对象数 = 133
当前场景不是 Step11AQ 的旧脚本拼接产物
```

当前层级：

```text
Phase10Main
└── Canvas
    ├── Camera
    └── UIRoot
        ├── obj[6]  EquipmentPanel prefab instance
        ├── obj[18] EquipmentBagPanel prefab instance
        ├── EquipmentDetailPanel
        └── EquipmentMediator
```

当前 Scene 判断：

```text
已由用户手动重建并保存
不存在 Step11AQ 的 Panel root _parent=null 缺陷
但 Scene 未满足 Portrait 规范
且 EquipmentMediator 绑定不完整
且 EquipmentPanel / EquipmentBagPanel 未在 Scene 中展开为可绑定组件
```

---

## 4. 当前 Prefab 状态

### EquipmentPanel

文件：

```text
assets/prefabs/panels/EquipmentPanel.prefab
```

状态：

```text
存在
meta uuid = 8aab8dc9-042c-40cc-b2db-2feca1ffdddd
脚本组件存在：EquipmentPanel
脚本 type = fd2749JtdVJQJLQETHYY9Mm
invalid refs = 0
重复非空 _id = 0
空 _id 数量 = 33
```

结论：

```text
Prefab 可解析，但存在大量空 _id
```

### EquipmentBagPanel

文件：

```text
assets/prefabs/panels/EquipmentBagPanel.prefab
```

状态：

```text
存在
meta uuid = f4d5e6a7-b8c9-0123-defa-234567890123
脚本组件存在：EquipmentBagPanel
脚本 type = fb89dlx4T5D+KqcbZ4IfpEl
invalid refs = 0
重复非空 _id = 0
空 _id 数量 = 66
```

结论：

```text
Prefab 可解析，但存在大量空 _id
```

### EquipmentDetailPanel

文件：

```text
assets/prefabs/panels/EquipmentDetailPanel.prefab
```

状态：

```text
存在
meta uuid = a5e6f7b8-c9d0-1234-efab-345678901234
脚本组件存在：EquipmentDetailPanel
脚本 type = 534faGomxJErYQBMNA+oQCU
invalid refs = 0
重复非空 _id = 0
空 _id 数量 = 0
```

风险：

```text
保留旧式固定 _id，例如：
EquipmentDetailPanel-root
p8-Script-1
EquipmentDetailPanel-panelRoot
```

结论：

```text
Prefab 可解析，但历史 ID 风险仍存在
```

---

## 5. Maximum call stack size exceeded 来源判断

基于当前源码与序列化状态，判断如下：

```text
Scene污染：部分成立
Prefab污染：存在风险
脚本递归：当前未发现直接证据
Inspector绑定：成立
其它原因：Nested PrefabInstance 与 prefab component field 读取失败高度相关
```

详细判断：

### Scene污染

当前 `Phase10Main.scene` 已不是 Step11AQ 的旧污染文件。

但当前 Scene 仍存在：

```text
Portrait 配置错误
EquipmentMediator 绑定缺失
EquipmentPanel / EquipmentBagPanel prefab instance 未展开
```

因此：

```text
不是旧 Scene JSON 污染
但当前 Scene 仍是未验收通过的异常状态
```

### Prefab污染

当前 Prefab 无简单重复非空 `_id`，但存在：

```text
EquipmentPanel / EquipmentBagPanel 大量空 _id
EquipmentDetailPanel 固定旧式 _id
```

因此：

```text
Prefab 污染或 Prefab 序列化异常风险存在
```

### 脚本递归

当前扫描 `EquipmentPanel.ts`、`EquipmentBagPanel.ts`、`EquipmentDetailPanel.ts`、`EquipmentMediator.ts`、`EquipmentUIPresenter.ts`：

```text
未发现 open() / close() 直接自调用式递归证据
未发现 Step11 调试 monkey patch 残留
EquipmentMediator 动态面板加载已禁用
```

因此：

```text
Maximum call stack size exceeded 暂无证据指向脚本递归为主因
```

### Inspector绑定

当前明确成立：

```text
equipmentPanel = null
bagPanel = null
detailPanel = __id__:112
```

且运行现象包含：

```text
can't get field of prefab component
```

因此：

```text
Inspector 绑定与 prefab component 读取失败是当前最直接证据链
```

### 其它原因

当前 Scene 对三个 Prefab 的序列化方式不一致：

```text
EquipmentPanel      = Nested PrefabInstance
EquipmentBagPanel   = Nested PrefabInstance
EquipmentDetailPanel = 展开式节点
```

这会导致 `EquipmentMediator` 的三个字段只有 `detailPanel` 能绑定成功。

---

## 6. 是否允许进入 Phase10-Step12

```text
禁止
```

原因：

```text
Phase10-Step11 未 FINAL PASS
Phase10Main.scene 未满足 Portrait 规范
EquipmentMediator Inspector 绑定不完整
EquipmentPanel / EquipmentBagPanel 在 Scene 中无可绑定脚本组件对象
运行时仍存在 can't get field of prefab component / Maximum call stack size exceeded / 重复 UUID 过滤风险
```

---

## 7. 最终审计结论

```text
FAIL
```

最终判断：

```text
当前项目真实停留在 Phase10-Step11AS。
Phase10Main.scene 已由用户手动重建，但尚未达到验收状态。
当前阻塞集中在 Scene Portrait 配置、EquipmentMediator Inspector 绑定、PrefabInstance 序列化方式不一致，以及 Prefab ID 状态风险。
不允许进入 Phase10-Step12。
```

---

## 8. 本次审计未执行事项

```text
未修改源码
未修改 Scene
未修改 Prefab
未运行 Cocos Creator Preview
未执行修复
未给出修复方案
```
