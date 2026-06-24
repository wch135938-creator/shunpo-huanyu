# Phase10 UI Screenshot Acceptance

适用范围：`assets/scenes/Phase10Main.scene` 的 Cocos Creator Preview 验收。

本文档不是给 CC / DeepSeek API 做视觉识别用的。当前 CC 看不到截图，因此它不能承担“截图验收”职责。本文档用于：

1. 用户手动运行 Cocos Preview 后，对照截图做人工验收。
2. 用户把截图贴给 Codex / ChatGPT 后，由可见截图的 Agent 辅助判断。
3. 把“控制台无红字”和“画面真实正常”拆成两条独立验收线。

## 强制前置

验收前必须确认：

1. 只运行 `assets/scenes/Phase10Main.scene`
2. 不恢复、不打开、不预览：
   - `assets/scenes/Phase8Main.scene`
   - `assets/scenes/Phase10Main-Clean.scene`
3. 已读取并遵守：
   - `docs/00-project-vision.md`
   - `docs/AI-OS-v1-Step12.md`
   - `docs/瞬破寰宇 Step12 AI工程SOP启动系统.md`

## 职责边界

### CC / DeepSeek API

CC 只负责：

1. 修改代码或场景文件。
2. 根据用户粘贴的控制台日志定位问题。
3. 按 Step12F 日志链路判断运行时初始化是否完成。
4. 根据用户文字描述或截图结论继续最小修复。

CC 不负责：

1. 直接读取 Cocos Preview 截图。
2. 判断画面是否被遮挡、错位、裁剪。
3. 判断装备图标、槽位、按钮在截图中是否真实可见。

### 用户 / 可见截图的 Agent

用户或能看到截图的 Agent 负责：

1. 检查首帧画面。
2. 检查装备主面板、背包面板、详情面板。
3. 检查分解、装备、卸下、升级、强化后的画面状态。
4. 把异常截图和关键控制台日志一起反馈给 CC。

## 控制台验收

Preview 后必须出现：

```text
[Phase10MainBootstrap] START
```

或兜底：

```text
[Phase10MainBootstrap] START_FALLBACK
```

随后必须出现：

```text
[SOP-UI-01] PREFAB_INIT
[SOP-UI-03] LAYOUT_COMPUTE
[SOP-UI-05] FRAME_0_FORCE_FLUSH
[SOP-UI-03] RENDER_FLUSH
```

以下情况不得判定通过：

```text
[Window] Maximum call stack size exceeded
[Window] 层级面板过滤了重复的 UUID 节点
```

`[UIOverrideGuard] LEVEL_1 warn: UIRoot` 可以接受，但必须记录为黄字残留。

## 截图验收

每次 UI 修复后，用户至少保留一张首帧截图和一张交互后截图。截图检查以下项目。

### 首帧

1. `EquipmentPanel` 首帧可见。
2. 青锋剑可见。
3. 护甲槽可见。
4. 饰品槽可见。
5. 装备战力、HP、ATK、DEF 文本没有重叠。
6. 没有巨大灰色遮挡块。
7. 不需要拖动、缩放、点击后才刷新。
8. 右上角关闭按钮可见且不遮挡主体。

### 背包面板

1. 点击空槽后打开对应筛选背包。
2. 标题必须匹配筛选类型，例如 `选择装备 · 护甲`。
3. 筛选为空时显示 `暂无装备` 属于可接受状态。
4. 筛选为空不等于其他槽位装备被分解。
5. 背包内容不应超出面板边界。
6. 列表项点击后能打开详情面板。

### 详情面板

1. 名称、品质、等级、强化等级、战力显示正确。
2. 装备、卸下、升级、强化、分解按钮状态正确。
3. 确认弹窗可打开、确认、取消。
4. 右上角关闭按钮有效。
5. 分解后详情面板关闭或刷新，不显示已不存在的装备。

## 装备操作验收

执行以下最小回归：

1. 装备青锋剑。
2. 卸下青锋剑。
3. 重新装备青锋剑。
4. 打开护甲背包。
5. 分解布衣。
6. 返回主装备面板，确认青锋剑仍在武器槽。
7. 确认护甲槽为空。
8. 确认饰品槽状态不受影响。
9. 打开青锋剑详情，确认 uniqueId 仍存在。

通过条件：

```text
分解一件装备，只允许影响该装备对应的 uniqueId。
不得连带删除、卸下或隐藏其他装备。
```

## 根因判断规则

发现异常时按以下顺序定位：

1. 控制台红字。
2. 重复 UUID / Maximum call stack。
3. `Phase10Main.scene` 中目标节点 `_id`。
4. `library/` 是否仍保留旧缓存。
5. 运行时 `new Node()` / `instantiate()` 是否未设置唯一运行时 ID。
6. EquipmentService / InventoryTransaction 是否误删或残留 loadout 引用。
7. UI 面板是否只是筛选为空，而不是装备数据被删除。

不要直接大范围重建场景。优先只改：

```text
assets/scripts/ui/EquipmentPanel.ts
assets/scripts/ui/EquipmentBagPanel.ts
assets/scripts/ui/EquipmentDetailPanel.ts
assets/scripts/ui/EquipmentMediator.ts
assets/scripts/equipment/EquipmentService.ts
assets/scenes/Phase10Main.scene
```

只有确认静态场景实例污染时，才允许最小范围修改 `Phase10Main.scene` 中对应节点。

## 验收回复格式

每次验收回复建议包含：

```text
Step12F 日志链路：通过 / 不通过
控制台红字：无 / 有
黄字残留：无 / 有，内容是什么
首帧截图：通过 / 不通过 / 未提供
装备主面板：通过 / 不通过 / 未提供
背包面板：通过 / 不通过 / 未提供
详情面板：通过 / 不通过 / 未提供
装备操作回归：通过 / 不通过 / 未提供
是否允许进入下一阶段：允许 / 不允许
```

如果不通过，必须说明第一个阻塞项和下一步最小修复文件。
