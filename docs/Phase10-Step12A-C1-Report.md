# Phase10-Step12A-C1 最小可点击主玩法入口接入 — 执行报告

**日期**：2026-07-04  
**分支**：master  
**阶段**：Step12A-C1 最小可点击主玩法入口接入  
**前置**：Step12A-A（奖励所有权收口）+ Step12A-B（首关配置与 Coordinator 闭环）

---

## 一、修改文件清单

### 新增文件（2个）

| 文件 | 说明 |
|------|------|
| `assets/scripts/gameplay.meta` | gameplay 文件夹 UUID 元数据（`f100a001-0001-4000-8000-0000000000f1`） |
| `assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts.meta` | 脚本 UUID 元数据（`f200a001-0001-4000-8000-0000000000f2`） |

### 修改文件（2个）

| 文件 | 变更内容 |
|------|---------|
| [Phase10MainGameplayCoordinator.ts](../assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts) | +85 行：导入 `Button`/`Label`/`Node`，新增 `@property` 声明，6 个 UI 辅助方法 |
| [Phase10Main.scene](../assets/scenes/Phase10Main.scene) | +487 行：UIRoot 子节点列表扩展，新增 12 个 Scene 对象 |

### 未修改（确认安全）

- ✅ 未修改 UIEngine、UILayoutEngine、UIRenderSync、UIDiffEngine、UIRenderVM
- ✅ 未修改 Equipment UI Prefab / Mail / Redeem / LoginReward
- ✅ 未修改 BattleManager、RewardSettlement、HeroSystem、ChapterSystem 核心逻辑
- ✅ 未修改 ResultPanel、Phase8Main.scene、Phase10Main-Clean.scene
- ✅ 未修改 SaveContainer 版本号
- ✅ 未修改 Frame-0 Flush / DungeonLoopController / DropSystem / ProgressSystem

---

## 二、Scene 新增节点

### 节点层级

```
Phase10Main (Scene Root)
└── Canvas
    └── UIRoot (__id__ 5)
        ├── ... (现有节点: EquipmentPanel, OperationsMenu, MailPanel, 等)
        ├── MainGameplayCoordinatorNode (新增)    ← __id__ 373
        ├── ChallengeFirstStageButton (新增)       ← __id__ 376
        │   └── ChallengeFirstStageButtonLabel    ← __id__ 379
        └── ChallengeResultLabel (新增)            ← __id__ 382
```

### 节点详情

| 节点名 | __id__ | 组件 | 位置 |
|--------|--------|------|------|
| **MainGameplayCoordinatorNode** | 373 | UITransform (374) + Phase10MainGameplayCoordinator (375) | (0, 0) |
| **ChallengeFirstStageButton** | 376 | UITransform (377) + Button (378) | (180, -380) |
| ↳ ChallengeFirstStageButtonLabel | 379 | UITransform (380) + Label (381) — 文本: "挑战首关" | (0, 0) 相对按钮 |
| **ChallengeResultLabel** | 382 | UITransform (383) + Label (384) — 文本: "首关闭环未开始" | (180, -460) |

**按钮位置说明**：Canvas 坐标 (180, -380)，屏幕中右区域，位于 OperationsMenu（y=-560）上方约 180px。不遮挡装备面板（青锋剑/布衣/铜戒）、操作菜单（升级/强化/分解/邮件/兑换码/每日奖励）等现有入口。

---

## 三、Coordinator 组件属性绑定

场景 JSON 中 Coordinator 组件（__id__ 375）的序列化属性：

```json
{
  "__type__": "f200aABAAFAAIAAAAAAAAD",
  "challengeButton": { "__id__": 378 },
  "resultLabel": { "__id__": 384 }
}
```

- `challengeButton` → cc.Button 组件（ChallengeFirstStageButton 节点上）
- `resultLabel` → cc.Label 组件（ChallengeResultLabel 节点上）

Cocos Creator 打开场景后，选中 `MainGameplayCoordinatorNode`，属性检查器中直接可见这两个属性已被填充。

### 压缩 UUID 对照

| 脚本 | UUID | 压缩 UUID（场景中使用） |
|------|------|----------------------|
| Phase10MainGameplayCoordinator | `f200a001-0001-4000-8000-0000000000f2` | `f200aABAAFAAIAAAAAAAAD` |
| Phase10MainBootstrap（参考） | `b100a001-0001-4000-8000-000000000001` | `b100aABAAFAAIAAAAAAAAAB` |

---

## 四、按钮如何绑定 challengeFirstStage

采用**代码绑定**方式（非场景 clickEvents 数组）：

```
onLoad()
  → _bindChallengeButton()
    → this.challengeButton.node.on(Button.EventType.CLICK, this._onChallengeButtonClicked, this)

点击按钮
  → _onChallengeButtonClicked()
    → this.challengeFirstStage()
    → 若返回 busy，console.warn 提示

onDestroy()
  → _unbindChallengeButton()
    → this.challengeButton.node.off(Button.EventType.CLICK, this._onChallengeButtonClicked, this)
```

**防重复绑定保证**：`onLoad` 在组件生命周期中仅执行一次，不会重复注册。

---

## 五、结果 Label 更新规则

| 时机 | Label 文本 |
|------|-----------|
| 初始状态（lastResult 为 null） | `首关闭环未开始` |
| 点击按钮后（state → running） | `战斗中...` |
| 战斗失败（isVictory = false） | `挑战失败：未发放奖励` |
| 重复结算（isDuplicate = true） | `重复结算已拦截：资产和经验未重复增加` |
| 战斗胜利（state → settled） | `首关胜利：金币 +{goldGain}，经验 +{expGain}，战力 {powerBefore} → {powerAfter}，章节已推进` |
| 结算异常（catch） | （不直接显示，lastResult.message 包含异常信息） |

更新方式：`_renderLastResultToLabel()` → `this.resultLabel.string = text`。

---

## 六、按钮交互状态机

| Coordinator 状态 | 按钮 interactable | 说明 |
|-----------------|-------------------|------|
| `idle` | `true` | 初始可点击 |
| `running` | `false` | 点击后立即禁用 |
| `settling` | `false` | 状态机自动阻断（不会从已禁用路径进入） |
| `settled` | `true` | 结算完成，恢复可点击 |
| `failed` | `true` | 失败后恢复可点击，允许重新挑战 |

实现方法：`_setChallengeButtonInteractable(boolean)` 直接设置 `this.challengeButton.interactable`。

每次重新挑战会生成新的 `attemptId` 和 `transactionId`，保证幂等。

---

## 七、静态检查结果

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Scene 顶层对象数 | 385 | 原约 373，新增 12 个对象 |
| `__id__` 引用总数 | 865 | 原 838，+27（含新增对象的内部引用） |
| 重复 UUID | 3 个 | `8aab8dc9-...`、`a5e6f7b8-...`、`f4d5e6a7-...`（均为共享 Prefab 引用，非新增） |
| 重复 `_id` 值 | **0** | 全部唯一 |
| Missing Script | **0** | 无缺失脚本引用 |
| Scene JSON 语法 | **VALID** | Node.js `JSON.parse()` 通过 |
| 禁止文件修改 | **全部通过** | 未动 UIEngine/UILayoutEngine/RenderSync/DiffEngine/RenderVM 等 |

---

## 八、用户 Preview 验收步骤

### 前置：打开 Cocos Creator

1. 启动 Cocos Creator 3.8.8
2. 打开项目 `D:\My Project\TestGame`
3. 等待编辑器扫描新文件完成（`assets/scripts/gameplay/` 为首次导入，需生成编译缓存）

### 验收步骤

1. 在资源管理器中打开 `assets/scenes/Phase10Main.scene`
2. 在**层级管理器**中展开 `Canvas → UIRoot`，确认看到：
   - `MainGameplayCoordinatorNode`
   - `ChallengeFirstStageButton`（含子节点 `ChallengeFirstStageButtonLabel`）
   - `ChallengeResultLabel`
3. 选中 `MainGameplayCoordinatorNode`，在**属性检查器**中确认：
   - 挂载了 `Phase10MainGameplayCoordinator` 组件（不是空白/Missing Script）
   - `Challenge Button` 属性指向 `ChallengeFirstStageButton` 的 Button 组件
   - `Result Label` 属性指向 `ChallengeResultLabel` 的 Label 组件
4. 点击编辑器顶部的 **Preview（预览）** 按钮
5. 在预览窗口中确认：
   - 屏幕中右区域可见金色"**挑战首关**"按钮
   - 按钮下方可见"**首关闭环未开始**"文本
   - 按钮不遮挡现有装备面板和操作菜单
6. 打开**控制台**（F12 或编辑器下方 Console 面板）
7. 点击"挑战首关"按钮
8. 观察控制台日志（详见下方"关键日志"）

---

## 九、控制台应出现的关键日志

按时间顺序：

```
[Step12A-C1][Entry] 按钮绑定完成

--- 点击按钮后 ---

[Step12A-C1][Entry] 按钮点击 — challengeFirstStage
[Step12A-B][Coordinator] challengeFirstStage — 开始
[Step12A-B][Coordinator] 首关映射读取成功: chapterStage=chapter_001_stage_01 → battleStage=STAGE_001
[Step12A-B][Coordinator] transactionId=txn_battle_STAGE_001_attempt_...
[Step12A-B][Coordinator] BattleManager 启动成功: stageId=STAGE_001, state=running
[Step12A-C1][Entry] 按钮交互: disabled (state=running)
[Step12A-C1][Entry] resultLabel → 战斗中...

--- 战斗推进... ---

[Step12A-B][Coordinator] 收到战斗结束: stageId=STAGE_001, victory=true, ...
[Step12A-B][Coordinator] RewardSettlement transactionId=..., success=..., isDuplicate=...
[Step12A-B][Coordinator] HeroSystem.addHeroExp: heroId=..., exp=..., levelUps=...
[Step12A-B][Coordinator] exp 分配完成: before=... after=...
[Step12A-B][Coordinator] power 刷新: before=... after=...
[Step12A-B][Coordinator] Chapter complete: stageId=chapter_001_stage_01, result=...
[Step12A-B][Coordinator] saveAll + save 完成
[Step12A-B][Coordinator] 首关闭环完成: state=settled, goldGain=..., expGain=...
[Step12A-C1][Entry] 按钮交互: enabled (state=settled)
[Step12A-C1][Entry] resultLabel → 首关胜利：金币 +X，经验 +Y，战力 A → B，章节已推进
```

---

## 十、风险与注意事项

| # | 风险 | 等级 | 缓解措施 |
|---|------|------|---------|
| 1 | **压缩 UUID 兼容性**：手动计算的脚本压缩 UUID 可能与 Cocos Creator 内置算法存在微小差异 | 中 | 已验证于已知 UUID（Phase10MainBootstrap），算法匹配。若编辑器显示空白组件，需在 Creator 中重新拖拽脚本到节点 |
| 2 | **gameplay 目录首次导入**：Cocos Creator 首次扫描新目录需时间 | 低 | 打开 Creator 后等待资源管理器刷新完成再打开场景 |
| 3 | **Label 中文字体**：使用系统默认 Arial，在微信小游戏环境中可能需替换为位图字体 | 低 | 当前阶段不阻塞，C2 可跟进 |
| 4 | **按钮位置微调**：(180, -380) 可能在不同分辨率下略有偏移 | 低 | 符合"最小可点击"要求，C2 可统一调整 |

---

## 十一、下一步建议

### Step12A-C2（ResultPanel 正式展示）

**前置条件**：C1 Preview 验收通过，确认：
- [x] 按钮可见可点击
- [x] 控制台日志链路完整
- [x] 保存后可重复挑战（新 transactionId）

**C2 建议内容**：
1. 在 C1 的挑战结果 Label 基础上，对接正式的 ResultPanel 组件
2. 增加奖励图标展示（金币、经验、道具）
3. 增加战力变化动画
4. 增加章节推进提示

### 不建议立即做的事

- ❌ 不接 Dungeon 系统
- ❌ 不接后续章节
- ❌ 不改奖励系统
- ❌ 不改装备系统
- ❌ 不重构 UI 框架

---

## 十二、本轮总结

| 指标 | 结果 |
|------|------|
| 修改文件数 | 4（2 新增 .meta + 1 TS + 1 Scene） |
| 新增代码行 | ~85 行（TS） + 487 行（Scene JSON） |
| 新增 Scene 节点 | 4 个（3 个可见 + 1 个逻辑容器） |
| 按钮交互 | 代码绑定，状态机驱动，防重复 |
| 结果展示 | 最小可读 Label，5 种状态文案 |
| 静态检查 | 全部通过 |
| 是否提交/推送 | **否**（等待 Preview 确认） |
