# Phase10-Step11AP Final Recovery Strategy

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
目标文件：`assets/scenes/Phase8Main.scene`  
输出日期：2026-06-12

---

## 0. 最终结论

### 推荐方案

推荐选择：

```text
方案B：新建干净 Scene
```

不推荐继续把 `Phase8Main.scene` 作为长期主场景继续修补。

核心原因：

```text
1. AK 已证明旧 Scene 发生过 Scene 序列化 ID 污染
2. AL 采用就地 JSON 修复，清除了 a7NuHFeLJOma1Nt9EgHW8F
3. 当前静态复查显示 44 个节点仍共享同一个 _id = step11al-fix-211
4. 这说明旧污染没有被彻底修复，而是被重命名为新的重复 _id
5. AM/AO 证明业务链路可以跑通，但不能证明 Scene 序列化身份层已经可信
```

最终判断：

```text
旧 Scene 可作为短期参考和回滚样本
新 Scene 应作为 Phase10-Step11 最终恢复目标
```

---

## 1. 当前证据汇总

### 1.1 AK 结论

`Phase10-Step11AK-Scene-Deserialization-Audit-Report.md` 已证明：

```text
Phase8Main.scene 存在 Scene 序列化 ID 污染
EquipmentBagPanel + EquipmentDetailPanel 两棵子树共 44 个 cc.Node 共享同一个 _id
原重复 _id = a7NuHFeLJOma1Nt9EgHW8F
脚本 UUID / __type__ 映射正常
组件 node 引用正常
问题不在 Equipment 业务逻辑
```

### 1.2 AL 结论

`Phase10-Step11AL-Scene-Repair-Implementation-Report.md` 记录：

```text
采用就地 JSON 修复
将 a7NuHFeLJOma1Nt9EgHW8F 替换为 step11al-fix-{index} 格式
补充 PrefabInfo / CompPrefabInfo
报告称 duplicate _id = 0
```

### 1.3 当前静态复查结果

对当前 `assets/scenes/Phase8Main.scene` 重新解析后得到：

```text
objectCount = 354
invalidRefsCount = 0
PrefabInstance残留 = 0
a7NuHFeLJOma1Nt9EgHW8F 出现次数 = 0
PrefabInfo 数量 = 10
CompPrefabInfo 数量 = 130
EquipmentBagPanel 节点数量 = 1
EquipmentDetailPanel 节点数量 = 1
EquipmentBagPanel 脚本组件数量 = 1
EquipmentDetailPanel 脚本组件数量 = 1
```

但同时存在：

```text
duplicateIdsCount = 1
重复 _id = step11al-fix-211
重复数量 = 44
重复范围 = EquipmentBagPanel 子树 + EquipmentDetailPanel 子树
```

结论：

```text
旧的 a7NuHFeLJOma1Nt9EgHW8F 污染已清除
新的 step11al-fix-211 重复 _id 仍覆盖同一批 44 个节点
Scene 身份层仍不干净
```

### 1.4 AM / AN / AO 结论

AM 证明：

```text
生命周期与 INSTANCE_COUNT 的部分异常属于调试代码误判
Equipment UI 链路已能运行
```

AN 证明：

```text
装备列表不显示的根因是脚本调用顺序
不是 Scene / Prefab / 数据链路问题
```

AO 证明：

```text
EquipmentBagPanel.open() 调用顺序已修复
EquipmentItemView.onLoad() 增加防御性重渲染
列表渲染问题已关闭
```

这些结论说明：

```text
业务代码具备恢复条件
Prefab 与数据链路具备复用价值
旧 Scene 文件本身仍不适合作为长期稳定基线
```

---

## 2. 方案A：继续修旧 Scene

### 2.1 方案定义

继续以当前 `assets/scenes/Phase8Main.scene` 为基础，进行第二轮 Scene JSON 修复。

目标：

```text
保留现有 Canvas / UIRoot / EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel / EquipmentMediator
修复 44 个 step11al-fix-211 重复 _id
修正直接 prefab asset 引用与 PrefabInfo / CompPrefabInfo 结构
维持已有 Inspector 绑定
```

### 2.2 必须执行的工作

```text
1. 为 44 个重复 cc.Node 生成真正唯一 _id
2. 重新检查所有 __id__ 引用
3. 重新检查所有 _prefab / __prefab 引用
4. 检查 PrefabInfo.root / asset / fileId / instance / nestedPrefabInstanceRoots
5. 检查 EquipmentMediator 引用是否仍指向正确组件
6. 打开 Cocos Creator 触发 AssetDB / Scene 重新序列化
7. 运行 Preview 验证 Equipment UI
8. 再次静态检查 duplicateIds / invalidRefs / PrefabInstance / Missing Script
```

### 2.3 优点

```text
1. 不需要重新搭建 Canvas / Camera / UIRoot / Mediator
2. 保留当前所有已修复脚本和 Inspector 绑定
3. 短期操作量看起来较小
4. 如果只为临时验收，可能较快恢复 Preview
```

### 2.4 风险

风险等级：

```text
高
```

风险明细：

```text
1. 已经发生过一次就地修复不彻底
2. 当前 44 个重复 _id 证明旧 Scene 身份层仍不可信
3. JSON 手修容易制造新的 __id__ 映射风险
4. PrefabInfo / CompPrefabInfo 是后补结构，未必等价于 Cocos Editor 原生拖入结果
5. 继续修补会让后续每个 UI 问题都必须先排查 Scene 污染
6. 旧 Scene 对长期 Phase11 / Phase12 扩展不利
7. 如果编辑器再次保存，手工修复字段可能被 Cocos 重排或覆盖
```

### 2.5 预计工时

```text
静态 JSON 修复：0.5 天
Cocos Editor 打开与重新保存验证：0.5 天
Preview 验证与问题回归：0.5 ~ 1 天
总计：1.5 ~ 2 天
```

如果再次出现 Scene 序列化副作用：

```text
追加 1 ~ 2 天
```

### 2.6 成功率

```text
短期 Preview 恢复成功率：65%
长期作为主场景稳定基线成功率：45%
```

成功率不高的原因：

```text
当前文件已被多轮自动/手工修复改写
Scene 对象数量从原始 245 增长到 354
旧污染值被替换后仍存在同范围 44 个重复 _id
```

---

## 3. 方案B：新建干净 Scene

### 3.1 方案定义

放弃继续修补 `Phase8Main.scene` 的序列化对象身份层，新建一个干净场景作为主场景。

建议命名：

```text
assets/scenes/Phase10Main.scene
```

或：

```text
assets/scenes/Main.scene
```

`Phase8Main.scene` 保留为历史参考，不再作为主入口。

### 3.2 新 Scene 最小结构

必须满足 Portrait 规范：

```text
720 x 1280
Portrait
Camera orthoHeight = 640
Canvas Center = (360,640)
```

推荐结构：

```text
Phase10Main
└── Canvas
    ├── Camera
    └── UIRoot
        ├── EquipmentPanel
        ├── EquipmentBagPanel
        ├── EquipmentDetailPanel
        └── EquipmentMediator
```

建议：

```text
EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel 均从 prefab 原生拖入
EquipmentMediator 使用新建节点或干净脚本组件
所有绑定通过 Inspector 重新绑定
不要复制旧 Scene 中 Bag/Detail 的 JSON 子树
不要复制旧 Scene 中后补 PrefabInfo / CompPrefabInfo
```

### 3.3 必须迁移的内容

```text
1. Canvas / Camera Portrait 参数
2. UIRoot 布局层级
3. EquipmentPanel prefab
4. EquipmentBagPanel prefab
5. EquipmentDetailPanel prefab
6. EquipmentMediator 组件
7. Mediator -> EquipmentPanel / BagPanel / DetailPanel 引用
8. Bootstrap / Phase8Bootstrap / Phase9Bootstrap 所需入口引用
9. 必要的 RenderProbeLabel 或验证节点，仅在验收阶段保留
```

### 3.4 禁止迁移的内容

```text
1. 旧 Scene 中 EquipmentBagPanel 子树 JSON
2. 旧 Scene 中 EquipmentDetailPanel 子树 JSON
3. 旧 Scene 中 step11al-fix-* _id
4. 旧 Scene 中手工补写的 PrefabInfo / CompPrefabInfo
5. 旧 Scene 中临时 debug 节点
6. 旧 Scene 中残留的 Step11 调试 tag
```

### 3.5 优点

```text
1. 从根源清除 Scene 序列化污染
2. 让 Cocos Creator 原生生成 Node._id / PrefabInfo / CompPrefabInfo
3. 降低后续 Inspector 绑定异常风险
4. 降低长期维护成本
5. 更适合作为 Phase11 之后的主场景基线
6. 便于建立标准 Scene 验收脚本
```

### 3.6 风险

风险等级：

```text
中
```

风险明细：

```text
1. 需要重新绑定 Inspector 引用
2. 需要确认启动入口切换到新 Scene
3. 需要重新验证 Equipment UI 全链路
4. 需要防止遗漏旧 Scene 中仍有用的 Bootstrap 节点
5. 需要一次完整 Preview 验收
```

这些风险可控，因为：

```text
Equipment 业务代码已在 AM / AN / AO 中验证过
Prefab asset 本体未被 AK 判定损坏
当前主要风险集中在旧 Scene 文件，不在业务系统
```

### 3.7 预计工时

```text
新建 Scene 与基础层级：0.5 天
拖入 prefab 与 Inspector 绑定：0.5 天
启动入口切换与 Preview 验证：0.5 天
静态审计与验收报告：0.5 天
总计：1.5 ~ 2 天
```

如果 Bootstrap 入口复杂：

```text
追加 0.5 天
```

### 3.8 成功率

```text
短期 Preview 恢复成功率：85%
长期作为主场景稳定基线成功率：90%
```

成功率高的原因：

```text
业务代码已通过修复
Prefab asset 未被证明损坏
新 Scene 可避免继承旧 Scene 的重复 _id 与手工 PrefabInfo 污染
```

---

## 4. 方案对比

| 维度 | 方案A：继续修旧 Scene | 方案B：新建干净 Scene |
|---|---|---|
| 初始操作量 | 中 | 中 |
| 对现有绑定保留 | 高 | 低 |
| Scene 序列化可信度 | 低 | 高 |
| 长期维护成本 | 高 | 低 |
| 后续扩展风险 | 高 | 低 |
| 再次出现重复 _id 风险 | 高 | 低 |
| 对 Cocos 原生流程贴合度 | 低 | 高 |
| 预计工时 | 1.5 ~ 2 天 | 1.5 ~ 2 天 |
| 短期成功率 | 65% | 85% |
| 长期成功率 | 45% | 90% |
| 推荐度 | 不推荐 | 推荐 |

---

## 5. 推荐执行计划

### 5.1 采用方案B

执行路线：

```text
1. 保留 Phase8Main.scene，不删除，标记为 legacy
2. 新建 Phase10Main.scene
3. 按 Portrait 规范创建 Canvas / Camera / UIRoot
4. 从 prefab 原生拖入 EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel
5. 新建或拖入 EquipmentMediator
6. 重新绑定 EquipmentMediator 引用
7. 切换启动 Scene
8. 运行静态审计
9. 运行 Cocos Preview
10. 输出 Phase10-Step11AQ-New-Scene-Rebuild-Report.md
```

### 5.2 静态验收标准

必须全部通过：

```text
duplicateIds = []
invalidRefs = []
PrefabInstance残留 = 0
Missing Script = 0
Canvas/(empty) = 0
EquipmentPanel 节点数量 = 1
EquipmentBagPanel 节点数量 = 1
EquipmentDetailPanel 节点数量 = 1
EquipmentMediator 节点/组件数量 = 1
EquipmentMediator.equipmentPanel != null
EquipmentMediator.bagPanel != null
EquipmentMediator.detailPanel != null
```

### 5.3 运行时验收标准

必须全部通过：

```text
控制台无 Maximum call stack size exceeded
控制台无 duplicate UUID / duplicate Node 警告
控制台无 Missing Script
控制台无 can't get filed of prefab component
顶部显示：武器 / 护甲 / 饰品筛选文案正确
背包列表显示 1 个装备 Item
点击 Item 可打开 EquipmentDetailPanel
Detail 装备 / 卸下 / 升级 / 强化 / 分解按钮引用不丢失
返回 / 关闭按钮可用
Portrait 720 x 1280 显示不溢出
```

---

## 6. 方案A 保留条件

只有在以下约束同时成立时，才考虑方案A：

```text
1. 不能使用 Cocos Creator 编辑器新建 Scene
2. 必须在当天内保留当前 Phase8Main.scene 启动入口
3. 只要求短期 Preview 演示，不要求作为长期主场景
4. 接受后续 Phase 继续承担 Scene 污染排查成本
```

即使选择方案A，也必须先修复：

```text
44 个 step11al-fix-211 重复 _id
44 处直接 _prefab.__uuid__ 节点引用
PrefabInfo / CompPrefabInfo 的一致性
```

并且必须再次输出静态审计结果。

---

## 7. 最终裁决

最终裁决：

```text
选择方案B：新建干净 Scene
```

裁决理由：

```text
Phase10-Step11 的目标不是让旧 Scene 勉强可跑
而是为后续 Phase11+ 提供可信的主场景基线
当前 Phase8Main.scene 已经过多轮污染、手工补写、就地修复
现存 44 个 step11al-fix-211 重复 _id 证明旧 Scene 仍未恢复干净
新建 Scene 的工时与继续修旧 Scene 接近，但长期成功率明显更高
```

建议状态标记：

```text
Phase8Main.scene = Legacy / Reference Only
Phase10Main.scene = New Clean Main Scene Candidate
```

推荐下一步任务：

```text
Phase10-Step11AQ：New Clean Scene Rebuild
负责人：Claude Code
Codex 职责：Scene 静态审计 / 风险复核 / 最终验收
ChatGPT 职责：阶段推进 / 验收裁决
```

---

## 8. 成功率与工时汇总

```text
方案A：继续修旧 Scene
风险等级：高
预计工时：1.5 ~ 2 天
短期成功率：65%
长期成功率：45%

方案B：新建干净 Scene
风险等级：中
预计工时：1.5 ~ 2 天
短期成功率：85%
长期成功率：90%

推荐方案：方案B
```
