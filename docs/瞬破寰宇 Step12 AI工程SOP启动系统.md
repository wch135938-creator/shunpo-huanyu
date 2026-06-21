# 《瞬破寰宇》Phase10 Step12 AI工程SOP系统（Codex / CC 双用）

版本：Step12-AI-SOP v1.0  
项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
语言：TypeScript  
平台：微信小游戏  
工程路径：D:\My Project\TestGame  
当前阶段：Step12 UIEngine v1 工业化稳定阶段

---

# 一、系统目标

本SOP系统用于将UIEngine v1从“手动调试驱动模式”升级为“标准化流程驱动模式”，统一解决以下问题：

- UI首帧不渲染或延迟渲染
- Layout必须交互后才刷新
- RenderSync不同步或延迟flush
- Prefab初始化链路不完整
- UI状态依赖dirty触发而非初始化触发
- diff / compute路径分裂导致行为不一致

目标原则：

- UI必须在“无任何交互”情况下完成完整渲染
- 所有UI问题必须通过SOP定位，不允许直接修UI表现
- 所有修复必须基于链路验证而非经验判断

---

# 二、三层执行架构

系统执行分为三层：

Codex（架构层）
- 负责问题归类
- 选择SOP
- 判断根因方向
- 不写具体修复代码

Claude Code（执行层）
- 按SOP插入日志
- 修复代码
- 验证链路
- 执行调试

UIEngine v1（运行层）
- Prefab初始化
- Layout计算
- Render同步
- Dirty管理
- Override Guard

---

# 三、SOP分类体系

SOP-UI-01：Prefab初始化链路验证  
SOP-UI-02：Layout Diff/Compute路径验证  
SOP-UI-03：RenderSync帧调度验证  
SOP-UI-04：Dirty Map初始化一致性验证  
SOP-UI-05：Frame-0强制渲染验证  
SOP-UI-06：UI交互依赖问题检测（拖动才刷新）  
SOP-UI-07：Override Guard误阻断检测  

---

# 四、标准执行流程

## Step 1：问题归类（Codex）

所有UI问题必须先归类到SOP：

| 现象 | SOP |
|------|-----|
| 首帧UI不显示 | SOP-UI-05 |
| 必须拖动才刷新 | SOP-UI-06 |
| Layout不刷新 | SOP-UI-02 |
| Render延迟 | SOP-UI-03 |
| Prefab无初始化 | SOP-UI-01 |

禁止跳过此步骤直接修复代码。

---

## Step 2：链路验证（Claude Code）

必须插入标准日志：

SOP-UI-01
console.log("[SOP-UI-01] PREFAB_INIT:", node.name);

SOP-UI-02
console.log("[SOP-UI-02] LAYOUT_DIFF:", node.name);

SOP-UI-03
console.log("[SOP-UI-03] RENDER_FLUSH:", queue.length);

SOP-UI-05
console.log("[SOP-UI-05] FRAME_0_FORCE_FLUSH");

---

## Step 3：闭环验证规则

必须满足完整链路：

Prefab Init → Layout → Render

任意缺失即为系统不稳定状态，不允许进入下一阶段。

---

# 五、强制初始化规则（Step12核心）

UIEngine v1必须保证：

1. Frame-0强制执行完整布局

uiLayoutEngine.diff({ forceFull: true });

2. Frame-0强制渲染

uiRenderSync.flush(true);

3. 禁止dirty驱动首帧

首帧必须忽略dirtyMap，执行full layout + full render

---

# 六、diff / compute统一规则

diff = runtime增量更新  
compute = 初始化全量计算  

规则：

- diff用于运行期
- compute用于初始化期
- 不得混用路径
- 初始化必须走compute或forceFull diff

---

# 七、UI问题处理流程

Step A（Codex）
- 选择SOP

Step B（Claude Code）
- 插入日志
- 执行验证

Step C（结果判断）
必须回答：

- PREFAB_INIT是否触发
- LAYOUT_DIFF是否触发
- RENDER_FLUSH是否触发

Step D（收敛）
任一缺失 → 必须修复链路

---

# 八、禁止规则

禁止以下行为：

- 禁止直接调整UI表现修复问题
- 禁止绕过Layout直接修改UITransform
- 禁止只修dirty不修链路
- 禁止绕过RenderSync
- 禁止不执行SOP直接改代码

---

# 九、当前关键问题映射

首帧UI不显示 → SOP-UI-05  
必须交互才刷新 → SOP-UI-06  
Layout不稳定 → SOP-UI-02  
Render延迟 → SOP-UI-03  
Prefab未初始化 → SOP-UI-01  

---

# 十、Step12最终目标

1. UI首帧100%稳定渲染（无交互依赖）
2. Layout统一路径（diff/compute一致）
3. RenderSync帧级一致性（Frame-0强制flush）

---

# 十一、下一步执行

进入 Step12F：

SOP-UI-05 Frame-0强制渲染修复

目标：
彻底解决“必须拖动才显示UI”的根因问题