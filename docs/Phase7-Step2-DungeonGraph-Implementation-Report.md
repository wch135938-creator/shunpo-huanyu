# Phase7-Step2-DungeonGraph-Implementation-Report

## 执行日期

2026-06-03

## 执行范围

Phase7-Step2：DungeonGraph (节点图) 实现，包含 MultiFloor、NodeGraph、BranchPath、FloorTransition、DungeonRunState 持久化。

---

## 一、新增/修改文件清单

### 修改文件 (3 个)

| 文件 | 行数变化 | 修改内容 |
|------|---------|---------|
| `assets/scripts/data/roguelike_types.ts` | +80 | 新增 NodeFork / NodeForkBranch / BranchPath / FloorTransition 类型；DungeonRunState 扩展 branchHistory / floorTransitions / pendingForks；DungeonNodeView 扩展 branchLabel / branchPreview；DungeonNodeResult 扩展 nodeFork；DungeonLayerResult 扩展 floorTransition |
| `assets/scripts/systems/RoguelikeSystem.ts` | +220 | 新增 getNodeForks() / chooseBranch() / transitionFloor() 方法；新增 loadRunFromSaveData() / saveRunToSaveData() / archiveRunToHistory() 持久化 API；enterNode() 集成 NodeFork 检测；completeLayer() 集成 FloorTransition；新增 3 个事件常量 |
| `assets/scripts/validation/ConfigValidator.ts` | +120 | 新增 validateGraphTopology() —— 节点图拓扑校验（自引用检测、分叉密度、分支上限）；新增 validateLayerTransitions() —— 层间转换合法性校验（顺序、入口节点、完成规则） |
| `assets/scripts/validation/RuntimeValidator.ts` | +130 | 新增 validateBranchPath() —— 分支路径选择校验；新增 validateFloorTransition() —— 楼层转换合法性校验 |

### 新增文件 (1 个)

| 文件 | 行数 | 职责 |
|------|------|------|
| `assets/scripts/debug/Phase7Step2DebugRunner.ts` | ~540 | DungeonGraph 集成测试：7 组共 35+ 断言，覆盖 NodeFork 检测 / BranchPath 选择 / FloorTransition / 持久化 / 图拓扑校验 / 运行时校验 / 完整多楼层流程 |

---

## 二、实现细节

### 2.1 DungeonGraph 核心类型

#### NodeFork（节点分叉）
```typescript
interface NodeFork {
  sourceNodeId: string;      // 分叉源节点
  branches: NodeForkBranch[]; // 分支列表
  createdAt: number;          // 创建时间
}

interface NodeForkBranch {
  nodeId: string;
  nodeType: DungeonNodeType;
  labelKey?: string;          // 分支标签 Key
  conditions?: NodeCondition[];
  previewKey?: string;        // 预览描述 Key
}
```

**触发条件**: 当节点 `nextNodeIds.length > 1` 时，自动生成 NodeFork。

#### BranchPath（分支路径）
```typescript
interface BranchPath {
  forkNodeId: string;
  chosenNodeId: string;
  skippedNodeIds: string[];   // 未选择的分支
  chosenAt: number;
}
```

**用途**: 审计追踪、补偿发奖、玩家路径分析。

#### FloorTransition（楼层转换）
```typescript
interface FloorTransition {
  transitionId: string;
  fromLayerId: string;
  toLayerId: string;
  fromNodeId: string;
  toNodeId: string;
  direction: 'forward' | 'backward' | 'warp';
  reason: 'layerComplete' | 'bossDefeated' | 'warpItem' | 'debug';
  transitionedAt: number;
}
```

### 2.2 RoguelikeSystem 新增 API

#### 分叉与分支
| 方法 | 签名 | 职责 |
|------|------|------|
| `getNodeForks` | `(state) => NodeFork \| null` | 检测当前节点的分支结构 |
| `chooseBranch` | `(state, chosenNodeId) => { state, branchPath }` | 选择分支并记录 BranchPath |
| `_deriveBranchPreview` | `(node) => string \| undefined` | 从节点类型派生预览文本 Key |

#### 楼层转换
| 方法 | 签名 | 职责 |
|------|------|------|
| `transitionFloor` | `(state, toLayerId, toNodeId, direction, reason) => FloorTransition` | 执行楼层转换并记录 |

#### 持久化
| 方法 | 签名 | 职责 |
|------|------|------|
| `loadRunFromSaveData` | `(saveData) => DungeonRunState \| null` | 从存档恢复活跃 run |
| `saveRunToSaveData` | `(runId, saveData) => boolean` | 将活跃 run 同步到存档 |
| `archiveRunToHistory` | `(runId, saveData) => boolean` | 完成 run 后归档到历史 |

### 2.3 ConfigValidator 新增校验

#### validateGraphTopology
- 自引用检测（error）
- 分支密度警告（>50% 节点为分叉点）
- 单节点分支上限检查（>5）
- 非法终节点类型警告（battle/empty 作为终节点）
- 每层出口节点存在性检查

#### validateLayerTransitions
- 层顺序连续性校验
- 入口节点有效性
- 层间完成规则存在性

### 2.4 RuntimeValidator 新增校验

#### validateBranchPath
- 分支路径完整性和合法性
- 自选分支检测
- 跳过节点数上限检查

#### validateFloorTransition
- 转换记录的完整字段检查
- 同层转换拦截
- 方向/原因合法性
- 时间戳有效性（含过期检测）

---

## 三、测试覆盖

### Phase7Step2DebugRunner (35+ assertions)

| 测试组 | 测试项 | 断言数 |
|--------|--------|--------|
| 1. NodeFork 分支检测 | 多分支检测、分支类型验证、终节点无分叉 | 8 |
| 2. BranchPath 选择 | 分支选择、跳过节点记录、历史记录、时间戳 | 5 |
| 3. FloorTransition | 正向转换、warp 转换、状态更新、历史记录 | 9 |
| 4. 持久化 | 保存到存档、从存档恢复、归档到历史 | 8 |
| 5. 图拓扑校验 | 分叉图校验、自引用检测、层间转换、缺少规则警告 | 4 |
| 6. 运行时校验 | 有效/无效分支、有效/无效转换 | 5 |
| 7. 完整多楼层流程 | 3 层通关、分叉选择、历史审计 | 8 |

---

## 四、兼容性检查

### 零破坏原则确认

- ✅ 所有新增类型字段均为 optional（`?`）
- ✅ DungeonRunState 扩展字段全部 optional
- ✅ DungeonNodeResult / DungeonLayerResult 扩展字段 optional
- ✅ Phase6 系统的所有现有接口不变
- ✅ Phase7Step1DebugRunner 测试不受影响
- ✅ SaveContainer / SaveMigrationSystem 无修改
- ✅ 无破坏性重构

### Portrait 竖版规范确认

- ✅ 所有代码为纯逻辑层，无 UI 布局硬编码
- ✅ 新类型不包含屏幕尺寸/方向依赖

---

## 五、验证方式

在 Cocos Creator 控制台执行：

```typescript
// Phase7-Step1 回归测试（确保不破坏已有功能）
Phase7Step1DebugRunner.runAll();

// Phase7-Step2 DungeonGraph 测试
Phase7Step2DebugRunner.runAll();
```

---

## 六、目录结构

```
assets/scripts/
├── data/
│   └── roguelike_types.ts          # 新增 6 个 DungeonGraph 类型
├── systems/
│   └── RoguelikeSystem.ts           # 新增 7 个 DungeonGraph 方法
├── validation/
│   ├── ConfigValidator.ts           # 新增 2 个拓扑校验方法
│   └── RuntimeValidator.ts          # 新增 2 个运行时校验方法
└── debug/
    └── Phase7Step2DebugRunner.ts    # 新增 7 组集成测试
```
