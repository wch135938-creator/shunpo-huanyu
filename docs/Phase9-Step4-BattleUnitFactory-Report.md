# Phase9-Step4: BattleUnitFactory — 实施报告

**日期**: 2026-06-05  
**开发者**: Vwa (AI辅助)  
**状态**: ✅ **完成，等待审核**

---

## 一、Step 目标

实现 **BattleUnitFactory**——HeroSystem / SkillSystem / FormationSystem 进入 BattleSystem 的**唯一适配层**。

### 消费（输入）

| 快照类型 | 来源 | 包含内容 |
|----------|------|----------|
| `HeroSnapshot` | HeroSystem.getHeroSnapshot() → HeroSnapshotBuilder | 英雄属性(battleReady)、技能ID列表、阵营/元素/职业/品质 |
| `SkillRuntimeSnapshot` | SkillSystem.getSkillSnapshot() → SkillRuntimeResolver | 编译后技能效果(CompiledSkillEffect[])、冷却/能量消耗 |
| `TeamSnapshot` | FormationSystem.generateTeamSnapshot() → TeamSnapshotBuilder | 英雄快照数组 + 技能快照数组 + 阵容总战力 |

### 生成（输出）

| 类型 | 消费者 | 说明 |
|------|--------|------|
| `BattleUnit[]` | BattleSystem.initBattle() | 可直接传入战斗系统的我方战斗单元数组 |

---

## 二、新增文件

### [BattleUnitFactory.ts](../../assets/scripts/battle/BattleUnitFactory.ts)

**路径**: `assets/scripts/battle/BattleUnitFactory.ts`  
**基类**: `BaseSystem`（单例模式）  
**依赖**: 只读 `HeroSnapshot` / `TeamSnapshot` / `FormationSlot`，不修改任何系统状态

#### 核心方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `buildPlayerUnits()` | `(TeamSnapshot, FormationSlot[]) → BattleUnit[]` | **主入口**：从阵容快照+槽位生成完整我方战斗单元数组 |
| `heroSnapshotToBattleUnit()` | `(HeroSnapshot, BattlePosition, number) → BattleUnit` | 单个英雄快照→战斗单元转换 |
| `buildPlayerUnitsFromSnapshots()` | `(HeroSnapshot[]) → BattleUnit[]` | 批量转换（简化版，无槽位依赖，按数组索引自动分配站位） |

#### 属性映射规则

```
HeroSnapshot.battleReady.hp      → BattleUnit.maxHp / currentHp
HeroSnapshot.battleReady.atk     → BattleUnit.attack
HeroSnapshot.battleReady.def     → BattleUnit.defense
HeroSnapshot.battleReady.speed   → BattleUnit.speed
HeroSnapshot.skillIds[]          → BattleUnit.skillIds[]
HeroSnapshot.name                → BattleUnit.name
HeroSnapshot.faction             → BattleUnit.faction
HeroSnapshot.element             → BattleUnit.element
HeroSnapshot.level               → BattleUnit.level
HeroSnapshot.heroId              → BattleUnit.configId
```

#### 站位分配规则

| slotIndex | row | column | 说明 |
|-----------|-----|--------|------|
| 0 | 0（前排）| 0 | 前排左（坦克位）|
| 1 | 0（前排）| 1 | 前排右（战士位）|
| 2 | 1（后排）| 0 | 后排左（法师位）|
| 3 | 1（后排）| 1 | 后排中（辅助位）|
| 4 | 1（后排）| 2 | 后排右（刺客位）|

---

## 三、修改文件

### [BattleManager.ts](../../assets/scripts/managers/BattleManager.ts)

**修改类型**: 扩展（非破坏性，legacy 路径完整保留）

#### 变更清单

1. **新增 import**:
   - `BattleUnitFactory` (from `../battle/BattleUnitFactory`)
   - `TeamSnapshot`, `FormationSlot` (from `../formation/FormationTypes`)

2. **新增私有字段**:
   ```typescript
   private _playerTeamSnapshot: TeamSnapshot | null = null;
   private _playerFormationSlots: FormationSlot[] | null = null;
   ```

3. **新增公开方法**:
   - `setPlayerFormation(teamSnapshot, slots)` — 注入 Phase9 阵容数据
   - `clearPlayerFormation()` — 清除注入数据，回退到 legacy 路径

4. **修改 `_buildPlayerUnits()`**:
   - Phase9 路径（优先）：检查 `_playerTeamSnapshot` + `_playerFormationSlots`，非空时委托 `BattleUnitFactory.buildPlayerUnits()`
   - Legacy 路径（回退）：当 Phase9 数据未注入或工厂返回空时，使用原有 hero_list 配置构建逻辑

#### 未修改部分

- ✅ BattleSystem 核心逻辑 — **零改动**
- ✅ DungeonSystem — **零改动**
- ✅ DropSystem — **零改动**
- ✅ Roguelike — **零改动**
- ✅ SaveManager — **零改动**
- ✅ UI Prefab — **零改动**
- ✅ `_buildEnemyUnits()` — **零改动**
- ✅ `_assembleBattleSystemConfig()` — **零改动**
- ✅ `_resolveRewards()` — **零改动**

---

## 四、数据流

```
┌─────────────┐    ┌─────────────┐    ┌──────────────────┐
│ HeroSystem   │    │ SkillSystem  │    │ FormationSystem  │
│ .getHero     │    │ .getHero     │    │ .generateTeam    │
│ Snapshot()   │    │ SkillSnap()  │    │ Snapshot()       │
└──────┬───────┘    └──────┬───────┘    └────────┬─────────┘
       │                   │                     │
       ▼                   ▼                     ▼
  HeroSnapshot      SkillRuntimeSnapshot    TeamSnapshot
       │                   │                     │
       └───────────────────┼─────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  BattleUnitFactory  │  ← Phase9-Step4（本次实现）
                │  .buildPlayerUnits  │
                └──────────┬──────────┘
                           │
                           ▼
                      BattleUnit[]
                           │
                           ▼
                ┌─────────────────────┐
                │   BattleManager     │
                │   .startStageBattle │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   BattleSystem      │
                │   .initBattle()     │
                └─────────────────────┘
```

---

## 五、验证方式

### 调用示例

```typescript
// 1. 初始化 Phase9 系统
await HeroSystem.getInstance().initialize();
await SkillSystem.getInstance().initialize();
await FormationSystem.getInstance().initialize();

// 2. 解锁英雄 & 技能（调试用）
const heroSystem = HeroSystem.getInstance();
heroSystem.unlockHero('hero_001');
heroSystem.levelUpHero('hero_001', 10);

// 3. 生成阵容快照
const formationSystem = FormationSystem.getInstance();
const teamSnapshot = formationSystem.generateTeamSnapshot('pve');
const activePreset = formationSystem.getActivePreset('pve');

// 4. 注入 BattleManager
const battleMgr = BattleManager.getInstance();
await battleMgr.initialize();
battleMgr.setPlayerFormation(teamSnapshot, activePreset!.slots);

// 5. 启动战斗
const battleData = battleMgr.startStageBattle('STAGE_001');
```

### 回退到 Legacy 路径

```typescript
battleMgr.clearPlayerFormation();
// startStageBattle 将使用 hero_list 配置构建默认测试阵容
```

---

## 六、遵守的开发约束

| 约束 | 状态 |
|------|------|
| 禁止修改 BattleSystem | ✅ 零改动 |
| 禁止修改 DungeonSystem | ✅ 零改动 |
| 禁止修改 DropSystem | ✅ 零改动 |
| 禁止修改 Roguelike | ✅ 零改动 |
| 禁止修改 SaveManager | ✅ 零改动 |
| 禁止修改 UI Prefab | ✅ 零改动 |
| 允许修改 BattleManager（仅用于接入 BattleUnitFactory）| ✅ 扩展性修改，legacy 路径完整保留 |
| 不得改变 BattleSystem 核心逻辑 | ✅ 调用方式不变 |
| 所有数值走配置 | ✅ 属性来自 HeroSnapshot.battleReady（由 HeroSnapshotBuilder 从配置计算）|
| 禁止硬编码 | ✅ 站位映射使用常量表 `SLOT_POSITIONS` |

---

## 七、文件清单

| 文件 | 操作 | 行数 |
|------|------|------|
| `assets/scripts/battle/BattleUnitFactory.ts` | **新建** | ~220 |
| `assets/scripts/managers/BattleManager.ts` | **修改** | +55（import + 字段 + 方法 + Phase9 路径） |

---

## 八、后续步骤（Phase9-Step5）

Phase9-Step5 预计实现 **全系统启动编排**：
- 统一初始化 HeroSystem → SkillSystem → FormationSystem
- 预解锁测试英雄/技能
- 通过 BattleUnitFactory 将阵容注入 BattleManager
- 运行完整战斗循环验证
- SaveV2 待 Phase9-Step6 统一处理

---

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
