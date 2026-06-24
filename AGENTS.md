# AGENTS.md — 项目级指令

## 最高宪法（ALWAYS FIRST）

在做**任何**代码修改、设计决策、文档编写之前，**必须先读取**：

```
docs/00-project-vision.md
```

该文件是项目的"最高宪法"。所有其他文档（01-14）和所有代码实现都必须服从 `00-project-vision.md` 的定义。

当其他文档与 00-project-vision.md 冲突时，以 00-project-vision.md 为准。

## Step12 AI SOP（强制执行）

必须在所有UI相关任务前执行：

读取并遵循：
docs/瞬破寰宇 Step12 AI工程SOP启动系统.md

该SOP属于：
- UIEngine v1 强制执行规则
- 优先级高于所有局部实现逻辑
- 与 docs/00-project-vision.md 同级约束

违反SOP = 禁止进入代码修改阶段

SOP执行顺序优先级：

1. 00-project-vision.md
2. Step12 AI SOP
3. 各模块设计文档
4. 局部代码逻辑

MUST_LOAD_SYSTEM:
docs/AI-OS-v1-Step12.md

ONLY_ONE_SYSTEM_VALID=docs/AI-OS-v1-Step12.md
IGNORE_ALL_OTHER_STEP12_FILES=true

## Phase10 UI 截图验收（强制）

所有 Phase10 / Step12 UI 相关修复完成后，必须按以下文档执行截图验收：

`docs/ai-rules/Phase10-UI-Screenshot-Acceptance.md`

控制台无红字不等于 UI 通过；必须同时确认首帧截图、装备主面板、背包面板、详情面板、装备操作回归。

Phase10 / Step12 UI 修复完成后，CC 只负责日志与代码层判断；截图验收由用户人工完成，或由可见截图的 Agent 按 `docs/ai-rules/Phase10-UI-Screenshot-Acceptance.md` 辅助判断。

## 当前开发状态（必须遵守）

当前主验证场景：

```
assets/scenes/Phase10Main.scene
```

禁止继续使用或恢复：

```
assets/scenes/Phase8Main.scene
assets/scenes/Phase10Main-Clean.scene
```

原因：
- `Phase8Main.scene` 已判定为污染场景，保持删除状态
- `Phase10Main-Clean.scene` 为历史清理副本，已删除，避免误预览
- 当前 Step12 验证统一以 `Phase10Main.scene` 为准

## Step12F 当前验证目标

当前阶段：Step12F Frame-0 Force Flush 验证阶段。

运行 Cocos Creator Preview 后，必须优先确认以下日志链路：

```
[Phase10MainBootstrap] START
```

或兜底路径：

```
[Phase10MainBootstrap] START_FALLBACK
```

随后必须出现：

```
[SOP-UI-01] PREFAB_INIT
[SOP-UI-03] LAYOUT_COMPUTE
[SOP-UI-05] FRAME_0_FORCE_FLUSH
[SOP-UI-03] RENDER_FLUSH
```

如果只出现脚本加载日志，例如：

```
[UIDIAG FILE LOADED]
[UIENGINE] ENTER BOOTSTRAP
🔥 UIENGINE FILE LOADED
🔥 BOOTSTRAP SCRIPT LOADED
```

但没有 `[Phase10MainBootstrap] START` / `START_FALLBACK`，则说明只是脚本被预加载，不能视为 Step12F 验证通过。

## 工作流程

1. 接到任务 → 先读 `docs/00-project-vision.md`（如果本次会话尚未读取）
2. 根据任务类型，读取对应的编号文档（01-14）
3. 参考 `docs/prompts/` 下的 Agent prompt 获取领域指导
4. 编码/修改/生成

## 编码铁律（违反即错误）

1. **严格按 docs 开发** — 所有实现必须以 `docs/` 下的设计文档为准
2. **不允许修改已有接口** — 已定义的 public 方法签名、数据结构不可更改
3. **所有数值读取 config** — 伤害、概率、消耗、属性等一律从配置文件读取
4. **UI 使用组件化** — 每个 UI 元素抽象为可复用组件
5. **不允许硬编码** — 任何数值、字符串、路径不得直接写在逻辑代码中
6. 不允许未经确认的大规模重构
- 禁止随意重命名系统
- 禁止擅自修改目录结构
- 禁止跨系统大范围改动
- 优先新增扩展，而不是推翻重写


## 技术栈

- 引擎：Cocos Creator 3.x
- 语言：TypeScript

## 项目速览

- 项目名：瞬破寰宇
- 类型：微信小游戏 / 国风修仙 / 放置卡牌 / Roguelike成长
- 开发模式：AI辅助 + 一人开发
- 核心原则：爽感优先 > 留存 > 轻量化 > 开发效率 > 微信适配

## 命名规范

- Manager统一：XxxManager
- UI统一：XxxPanel
- Popup统一：XxxPopup
- 配置统一：XxxConfig
- 数据结构统一：XxxData
- 控制器统一：XxxController

## 输出要求

- 优先输出可直接运行代码
- 避免长篇理论解释
- 修改代码时说明修改文件
- 新增系统时说明目录结构
- 保持代码简洁

## 职业系统铁律

《瞬破寰宇》采用：

主角无固定职业 + 英雄职业阵容体系。

禁止设计：

创建角色后固定职业成长路线。

所有职业能力必须依附于英雄单位实现。
