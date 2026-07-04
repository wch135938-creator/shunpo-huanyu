# 《瞬破寰宇》UI工业化规范 v1.1

版本：v1.1  
状态：执行基线  
适用工程：`D:\My Project\TestGame`  
引擎：Cocos Creator 3.8.8  
平台：微信小游戏  
基准分辨率：竖屏 720 × 1280

---

## 1. 文档定位与优先级

本文档用于把《瞬破寰宇》的 UI 视觉方向转化为可复用、可扩展、可验证的工程规则。

本文档不是独立宪法，不覆盖现有项目规则。发生冲突时，按以下顺序执行：

1. `docs/00-project-vision.md`
2. `docs/瞬破寰宇 Step12 AI工程SOP启动系统.md`
3. `docs/AI-OS-v1-Step12.md`
4. `docs/07-ui-ux.md`、`docs/08-art-style.md`、`docs/10-tech-architecture.md`
5. `docs/15-development-rules.md`
6. 本文档
7. 局部实现逻辑

所有 Phase10 / Step12 UI 修改完成后，还必须执行：

`docs/ai-rules/Phase10-UI-Screenshot-Acceptance.md`

---

## 2. 工业化目标

UI 建设目标：

```text
统一视觉语言
统一组件行为
统一生命周期
统一数据绑定
统一验收标准
支持低成本批量扩展
```

优先级必须服从项目总纲：

```text
爽感 > 留存 > 轻量化 > 开发效率 > 微信适配
```

UI 自身的判断顺序：

```text
清晰 > 反馈 > 效率 > 美观 > 炫酷
```

### 2.1 本阶段不做

- 不重写现有 UI 架构。
- 不重命名现有公共类、公共方法、数据结构和配置字段。
- 不恢复 `Phase8Main.scene` 或 `Phase10Main-Clean.scene`。
- 不为了视觉统一绕过 UIEngine、Layout、RenderSync 或数据层。
- 不提前实现宗门、复杂商城等 V2 业务系统。
- 不把“支持未来扩展”解释为“本阶段必须实现全部未来页面”。

---

## 3. 当前工程基线

### 3.1 唯一主验证场景

```text
assets/scenes/Phase10Main.scene
```

禁止使用或恢复：

```text
assets/scenes/Phase8Main.scene
assets/scenes/Phase10Main-Clean.scene
```

### 3.2 必须保留并增量演进的现有体系

```text
assets/scripts/core/BasePanel.ts
assets/scripts/ui/UIEngine.ts
assets/scripts/ui/EquipmentPanel.ts
assets/scripts/ui/EquipmentBagPanel.ts
assets/scripts/ui/EquipmentDetailPanel.ts
assets/scripts/ui/EquipmentMediator.ts
assets/scripts/ui/Phase8UIManager.ts
assets/scripts/ui/OperationsUIManager.ts
assets/prefabs/panels/
assets/prefabs/items/
```

`BasePanel` 已存在，不得再创建第二套基类。  
`EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel` 是当前装备 UI 的正式命名，不得改名为 `EquipPanel / InventoryPanel`。  
现有模块 Manager 必须保留；未来通用 `UIManager` 只能作为统一门面和协调层，不得复制模块业务。

---

## 4. 视觉语言

### 4.1 总体风格

```text
国风修仙 + 半二次元
高级极简 + 深色基底 + 灵玉绿主交互
少量紫雷 + 克制金色 + 明确成长反馈
```

“极简”只表示减少无意义装饰，不表示降低信息密度、按钮辨识度或奖励反馈。

### 4.2 禁止风格

- 过度金色铺满界面。
- 页游式爆光和常驻强闪烁。
- 无功能意义的复杂装饰边框。
- 大量高开销粒子和无法统一的 AI 浮夸特效。
- 牺牲可读性的装饰字体。
- 将西幻术语作为玩家可见的核心文案。
- 低饱和、压抑、缺少成长反馈的整体表现。

---

## 5. 设计令牌体系

所有颜色、字号、间距、动效时长和组件尺寸必须集中定义为设计令牌，由配置或统一主题组件提供。禁止散落在业务逻辑中。

### 5.1 核心颜色令牌

| 令牌 | 基准值 | 用途 |
|---|---:|---|
| `color.background.primary` | `#0B0F14` | 主背景、深空基底 |
| `color.system.primary` | `#2E6B57` | 主按钮、选中态、系统核心交互 |
| `color.energy.rare` | `#7B4DFF` | 天道、爆发、稀有能量 |
| `color.reward.high` | `#C8A45A` | SSR、高价值奖励、付费价值提示 |
| `color.state.danger` | 主题配置 | 危险、删除、分解确认 |
| `color.text.primary` | 主题配置 | 主文本 |
| `color.text.secondary` | 主题配置 | 次级文本 |
| `color.state.disabled` | 主题配置 | 禁用态 |

颜色语义：

```text
绿色 = 系统主交互、成长、强化、提升
紫色 = 稀有、天道、爆发
金色 = SSR、高价值奖励、稀有资源、商业价值
红色 = 危险、失败、不可逆操作
```

同一界面不得让多个强调色争夺第一视觉焦点。

### 5.2 字体与信息层级

必须建立并复用以下字体令牌：

```text
font.display      大型战力、稀有奖励、突破结果
font.title        页面和弹窗标题
font.subtitle     分区标题
font.body         正文和主要数据
font.caption      次级说明
font.button       按钮文字
```

要求：

- 重要文本必须清晰可读，不使用纯装饰字体承载数据。
- 按钮有效触控区域不得小于项目既有的 80px 规范。
- 战力、奖励和下一步操作必须形成明确视觉层级。
- 长文本必须定义换行、截断或滚动策略。

### 5.3 间距与尺寸

采用统一间距序列，不允许各页面自由发明间距：

```text
spacing.xs
spacing.sm
spacing.md
spacing.lg
spacing.xl
```

面板内边距、列表间距、按钮高度、标题区高度和圆角表现均由主题令牌控制。圆角和描边优先通过九宫格资源实现，避免运行时高成本绘制。

---

## 6. UI 层级结构

所有页面按职责划分为：

```text
UI_Background  背景与氛围层
UI_Panel       页面和容器层
UI_Content     数据内容层
UI_Widget      按钮、槽位、标签等组件层
UI_Effect      局部动效层
```

运行时显示层级必须统一为：

```text
Background
→ PageContent
→ HUD / TopBar
→ ModalMask
→ Panel / Popup
→ Guide
→ Toast / GlobalEffect
```

TopBar 只高于普通页面，不得遮挡确认弹窗、新手引导或系统提示。模态弹窗显示时，必须正确拦截下层输入。

---

## 7. 组件规范

### 7.1 BasePanel

沿用现有 `assets/scripts/core/BasePanel.ts`。

统一职责：

- 生命周期与显隐状态。
- EventManager 监听清理。
- 安全区适配入口。
- UIEngine 布局脏标记和刷新入口。
- 打开、关闭动画钩子。

禁止：

- 在 BasePanel 中加入具体业务逻辑。
- 创建第二套 Panel 基类。
- 为视觉修复绕过 UIEngine 直接操作最终布局。

### 7.2 面板结构

新建弹窗优先采用：

```text
PanelRoot
├── ModalMask
└── Panel_BG
    ├── Header
    ├── Content
    └── Footer
```

已有 Prefab 不强制为满足节点名称而重建；只在确有维护收益时渐进对齐。

### 7.3 Button 系统

语义类型：

```text
Primary    灵玉绿主操作
Secondary  深色次操作
Danger     暗红不可逆操作
```

按钮至少具备：

```text
Normal
Pressed
Disabled
Selected（需要时）
Loading（异步操作时）
```

点击反馈采用轻量缩放、颜色或受控发光。优先复用现有动画能力；只有在确认没有等价实现时，才新增统一反馈组件。

### 7.4 Icon 系统

统一方向：

```text
玉石化材质
简化轮廓
受控边缘发光
小尺寸下仍可辨识
```

首批资源语义：

```text
金币 → 灵石
钻石 → 紫晶
强化材料 → 玄铁晶
```

图标必须通过资源映射或配置引用，不得在业务脚本中硬编码路径。

### 7.5 ItemSlot

标准内容：

```text
Frame
Icon
Level
Star
Selection / Lock / Equipped 状态
```

当前装备配置只使用现有品质：

| 配置品质 | 建议视觉 |
|---|---|
| `Common` | 白 |
| `Rare` | 蓝 |
| `Epic` | 紫 |
| `Legendary` | 金 |

绿色品质和红色品质保留为未来扩展，不得在未修改正式配置前虚构新等级。

### 7.6 TopBar

默认展示：

```text
金币 / 灵石
强化材料 / 玄铁晶
钻石 / 紫晶
```

要求：

- 适配顶部安全区。
- 资源变化由事件或 Presenter 驱动。
- 不直接修改玩家数据。
- 资源飞入动画结束后，以真实数据刷新结果为准。
- 不得位于确认弹窗和全局引导之上。

---

## 8. UIManager 统一门面

项目最终需要一个通用 UIManager，但必须采用增量接管方式。

### 8.1 必备能力

```text
open(panelName)
close(panelName)
toggle(panelName)
```

对于需要上下文的页面，必须支持类型安全的参数传递，同时保留无参数页面的简写调用。

UIManager 还应负责：

- Panel 注册和查找。
- 页面层级与弹窗栈。
- 重复打开策略。
- 返回键关闭顶部页面。
- 异步加载状态和失败处理。
- 安全区广播。
- 全局遮罩和输入拦截。

### 8.2 边界

UIManager 不负责：

- 装备、奖励、背包等业务计算。
- 直接修改 Data。
- 替代 `EquipmentMediator` 等现有业务协调器。
- 复制 `Phase8UIManager` 或 `OperationsUIManager` 的模块逻辑。

现有模块 Manager 继续处理模块内协调，通用 UIManager 只提供统一入口、层级和生命周期门面。

禁止通过场景外部脚本随意直接切换受管面板节点；Panel 自身内部对绑定子节点的显示控制仍然允许。

---

## 9. 数据与文案规范

### 9.1 数据流

```text
UI
→ Manager / Mediator / Presenter
→ System / Service
→ Data / Config
```

UI 不得直接修改业务数据。

### 9.2 修仙化显示

玩家可见文案统一使用：

```text
生命 / 攻击 / 防御 / 灵力 / 身法
```

内部 TypeScript 字段、配置键和既有接口中的 `hp / atk / def` 保持不变，通过格式化层转换为中文。不得为修改显示文案破坏数据契约。

### 9.3 配置化

必须配置化：

- UI 文案。
- 颜色、字号、间距和动效令牌。
- 图标资源映射。
- 品质样式映射。
- 资源显示顺序。
- 可调整的动效参数。

不得把 Cocos 节点引用、组件引用等编辑器绑定对象机械搬入 JSON 配置。

---

## 10. 动效规范

基础动效：

1. 面板打开：轻量缩放 + 淡入。
2. 点击反馈：轻量缩放 + 颜色或受控发光。
3. 资源飞入：奖励位置 → TopBar 对应资源位置。

要求：

- 普通页面动效短促，不阻塞操作。
- SSR、UR、突破、战力暴涨可以使用更强反馈。
- 禁止常驻大粒子和高频 Instantiate/Destroy。
- 高频资源飞入、飘字和特效节点必须评估对象池。
- 动效结束必须恢复确定状态，不能留下缩放、透明度或输入锁残留。

---

## 11. 适配与性能

### 11.1 屏幕适配

- 基准设计分辨率为 720 × 1280。
- 必须适配刘海屏、全面屏、小屏设备和微信安全区。
- 核心按钮和关键资源不得贴近危险区域。
- 不通过固定设备坐标解决多设备布局问题。

### 11.2 微信小游戏性能

- 目标保持 30 FPS 以上。
- UI 图片优先进入 Sprite Atlas，减少 DrawCall。
- 纹理按实际显示尺寸压缩，避免超大透明留白。
- 资源按需加载，避免将全部 UI 强制放进首包。
- 避免高频 Instantiate、Destroy、实时材质和大粒子系统。
- 具体内存、DrawCall 和纹理预算应在真机分析后固化，不凭空填写。

### 11.3 资源目录

保留现有目录，禁止为满足新文档而批量搬迁：

```text
assets/prefabs/panels/
assets/prefabs/items/
assets/scripts/ui/
assets/resources/config/
```

新增可动态加载的 UI 美术资源时，才按需增加：

```text
assets/resources/ui/panels/
assets/resources/ui/buttons/
assets/resources/ui/icons/
assets/resources/ui/backgrounds/
assets/resources/ui/effects/
```

不得把无需动态加载的全部资源无差别放进 `resources`。

---

## 12. 页面范围

当前或近期页面：

```text
EquipmentPanel
EquipmentBagPanel
EquipmentDetailPanel
RolePanel
MailPanel
RedeemCodePanel
LoginRewardPopup / 签到入口
```

未来可扩展：

```text
抽卡
活动
商城
宗门
图鉴
更多英雄和装备页面
```

未来页面必须围绕英雄职业阵容体系建设，不得引入“主角创建后固定职业”的 UI 流程。

“15 角色”只是阶段内容目标，组件和数据结构不得以 15 作为固定上限。

---

## 13. Step12 强制链路

所有 UI 初始化必须满足：

```text
PrefabInit → LayoutCompute → RenderFlush
```

Frame-0 必须：

```text
执行完整布局
执行强制渲染提交
忽略 dirtyMap 对首次全量渲染的限制
不依赖任何点击、拖动或缩放
```

禁止：

- 绕过 Layout 直接修最终 UITransform。
- 绕过 RenderSync。
- 只修 dirty 状态而不修初始化链路。
- 为视觉修复新增第二套刷新路径。

---

## 14. 验收标准

### 14.1 日志验收

必须出现以下启动条件之一：

```text
[Phase10MainBootstrap] START
[Phase10MainBootstrap] START_FALLBACK
```

并出现完整链路：

```text
[SOP-UI-01] PREFAB_INIT
[SOP-UI-03] LAYOUT_COMPUTE
[SOP-UI-05] FRAME_0_FORCE_FLUSH
[SOP-UI-03] RENDER_FLUSH
```

不得出现：

```text
[Window] Maximum call stack size exceeded
[Window] 层级面板过滤了重复的 UUID 节点
```

当前允许记录但不阻塞：

```text
[Scene] [UIOverrideGuard] LEVEL_1 warn: UIRoot
```

### 14.2 截图与交互验收

控制台无红字不等于 UI 通过。每次 UI 修改至少验证：

- 首帧无需交互即可完整显示。
- 装备主面板无遮挡、无裁剪、无重叠。
- 背包筛选和空状态正确。
- 详情面板数据和按钮状态正确。
- 装备、卸下、升级、强化、分解不串改其他 uniqueId。
- 首帧截图和交互后截图均通过。

详细标准以 `Phase10-UI-Screenshot-Acceptance.md` 为准。

### 14.3 工业化验收

每个新组件必须回答：

1. 是否复用了现有实现？
2. 是否有明确职责和状态矩阵？
3. 是否配置驱动？
4. 是否经过 UIEngine 初始化链路？
5. 是否适配安全区和小屏？
6. 是否具备截图、交互和性能验收方式？

任一项无答案，不进入批量复制阶段。

---

## 15. 最终原则

```text
UI 不是一次性设计稿
UI 是可验证的系统
UI 必须可扩展、可复用、可维护
统一不等于重写
工业化不等于过度抽象
先完成一个稳定样板，再批量扩展
```
