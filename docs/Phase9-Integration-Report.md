# Phase9-Integration-Report

## 概述

将 Phase9 所有子系统（Hero / Skill / Formation / Chapter / Tutorial / Analytics / BattlePresentation）接入游戏主生命周期，移除 BattleManager 中的 Legacy 战斗路径，建立 FormationSystem → BattleUnitFactory → BattleManager 的唯一战斗入口链路。

---

## 变更摘要

### 新增文件

| 文件 | 说明 |
|------|------|
| `assets/scripts/systems/Phase9Bootstrap.ts` | Phase9 系统统一初始化编排器 |
| `assets/scripts/systems/Phase9Bootstrap.ts.meta` | Cocos Creator 元数据 |
| `assets/scripts/validation/Phase9FinalAcceptanceVerifier.ts` | 最终验收器（100+ 断言） |
| `assets/scripts/validation/Phase9FinalAcceptanceVerifier.ts.meta` | Cocos Creator 元数据 |
| `docs/Phase9-Integration-Report.md` | 本报告 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `assets/scripts/managers/BattleManager.ts` | 移除 Legacy 路径，BattleUnitFactory 为唯一入口 |
| `assets/scripts/core/Phase8BootstrapEntry.ts` | 集成 Phase9Bootstrap 初始化与销毁 |
| `assets/scripts/debug/BattleDebugRunnerV2.ts` | 使用 Phase9 阵容流程 |

---

## 任务明细

### 任务1：Phase9Bootstrap — 统一启动链路

**文件**：`assets/scripts/systems/Phase9Bootstrap.ts`

初始化顺序（严格按依赖关系）：
1. **HeroSystem** — 英雄管理（最底层依赖）
2. **SkillSystem** — 技能管理
3. **FormationSystem** — 阵容管理（依赖 Hero + Skill）
4. **ChapterSystem** — 章节管理
5. **TutorialSystem** — 新手引导
6. **AnalyticsSystem** — 本地埋点
7. **BattleFXManager** — 战斗表现层
8. **BattleManager** — 战斗管理入口

关键特性：
- 所有系统 `initialize()` 仅执行一次（幂等）
- `restoreFromSave()` 从 SaveManager 恢复各系统存档
- `saveAll()` 收集所有系统数据写入 SaveManager
- `destroy()` 触发 Analytics 销毁 + BattleFX 清理 + 最终落盘
- 发出 `Phase9Event.BOOTSTRAP_READY` 事件

### 任务2：FormationSystem 接入战斗入口

**位置**：`BattleDebugRunnerV2._setupPlayerFormation()`

战斗启动前流程：
```
FormationSystem.generateTeamSnapshot('pve')
  → TeamSnapshot (heroSnapshots + skillSnapshots + teamPower)

FormationSystem.getActivePreset('pve')
  → FormationPreset.slots (5 个 FormationSlot)

BattleManager.setPlayerFormation(teamSnapshot, slots)
```

### 任务3：BattleManager 接收阵容数据

**文件**：`assets/scripts/managers/BattleManager.ts`

`setPlayerFormation(teamSnapshot, slots)` 保持不变，存储阵容快照。

`_buildPlayerUnits()` 现在通过 BattleUnitFactory 消费数据并生成 BattleUnit[]。

### 任务4：移除 Legacy 路径

**文件**：`assets/scripts/managers/BattleManager.ts`

已移除：
- `_assignPlayerPositions()` — Legacy 站位分配
- `_findAvailableSlot()` — Legacy 槽位查找
- `_heroConfigToBattleUnit()` — Legacy 英雄→BattleUnit 转换
- `_factionToElement()` — Legacy Faction→Element 映射
- `clearPlayerFormation()` — Legacy 回退切换
- `DEFAULT_HERO_LEVEL` / `DEFAULT_TEAM_SIZE` / `FRONT_SLOTS` / `BACK_SLOTS` / `SlotDef` 常量
- `HeroConfig` / `HeroListData` / `Faction` 导入
- `config/cards/hero_list` 配置路径依赖

BattleUnitFactory 现在是 **唯一入口**。如果未注入 Phase9 阵容数据，`_buildPlayerUnits()` 返回空数组并报错。

### 任务5：BattlePresentation 接入生命周期

**文件**：`assets/scripts/core/Phase8BootstrapEntry.ts`

BattleFXManager 生命周期：
- `init()` — Phase9Bootstrap.initialize() 中调用
- `startListening()` — 战斗开始前由 BattleManager/调用方控制
- `cleanup()` — Phase9Bootstrap.destroy() 中调用

### 任务6：Analytics 接入

**文件**：`assets/scripts/systems/Phase9Bootstrap.ts`

AnalyticsSystem 生命周期：
- `initialize()` — 游戏启动时（Phase9Bootstrap.initialize()）
- `destroy()` — 游戏退出时（Phase9Bootstrap.destroy()）
- `registerSaveCallback()` — 绑定 SaveManager.saveAnalyticsData() + markDirty()
- `restore(analyticsData)` — 从 SaveManager 恢复

数据绑定：
```
AnalyticsSystem → registerSaveCallback → SaveManager.saveAnalyticsData() + markDirty()
SaveManager.loadAnalyticsData() → AnalyticsSystem.restore()
```

### 任务7：最终验收器

**文件**：`assets/scripts/validation/Phase9FinalAcceptanceVerifier.ts`

10 个验证组，100+ 断言：

| 验证组 | 内容 |
|--------|------|
| Hero | initialize → unlock → levelUp → addStar → snapshot → save/restore |
| Skill | initialize → unlock → levelUp → equipSkill → snapshot → save/restore |
| Formation | initialize → getActivePreset → generateTeamSnapshot → validate → save/restore |
| BattleFactory | TeamSnapshot+slots → buildPlayerUnits → BattleUnit 字段/站位验证 |
| Battle | setPlayerFormation → startStageBattle → updateBattle → result 验证 |
| BattlePresentation | init → startListening → UNIT_DAMAGED → stopListening → cleanup |
| Analytics | initialize → trackBattle/trackChapter → generateSnapshot → save/restore → destroy |
| Chapter | initialize → getAllChapters → getChapterProgress → snapshot → save/restore |
| Tutorial | initialize → getProgress → getRepository → generateTutorialSnapshot |
| FullChain | Hero→Formation→BattleFactory→BattleUnit 数据完整性 |

---

## 数据流图

```
游戏启动
  │
  ├─ Phase8Bootstrap.initialize()
  │    └─ Phase7/8 系统加载
  │
  ├─ Phase9Bootstrap.initialize()
  │    ├─ HeroSystem.initialize()
  │    ├─ SkillSystem.initialize()
  │    ├─ FormationSystem.initialize()         ← 依赖 Hero + Skill
  │    ├─ ChapterSystem.initialize()
  │    ├─ TutorialSystem.initialize(false)
  │    ├─ AnalyticsSystem.initialize()
  │    ├─ BattleFXManager.init()
  │    └─ BattleManager.initialize()
  │
  ├─ Phase9Bootstrap.restoreFromSave()
  │    ├─ SaveManager.loadHeroData()      → HeroSystem.restore()
  │    ├─ SaveManager.loadSkillData()     → SkillSystem.restore()
  │    ├─ SaveManager.loadFormationData() → FormationSystem.restore()
  │    ├─ SaveManager.loadChapterData()   → ChapterSystem.restore()
  │    └─ SaveManager.loadAnalyticsData() → AnalyticsSystem.restore()
  │
  └─ Phase9Bootstrap.registerAnalyticsSaveCallback()

战斗启动
  │
  ├─ FormationSystem.generateTeamSnapshot('pve')
  │    └─ TeamSnapshot { heroSnapshots, skillSnapshots, teamPower }
  │
  ├─ FormationSystem.getActivePreset('pve')
  │    └─ FormationSlot[] { slotIndex, heroId }
  │
  ├─ BattleManager.setPlayerFormation(teamSnapshot, slots)
  │
  └─ BattleManager.startStageBattle(stageId)
       └─ BattleUnitFactory.buildPlayerUnits(teamSnapshot, slots)
            └─ BattleUnit[] → BattleSystem.initBattle()

游戏退出
  │
  ├─ Phase9Bootstrap.saveAll()
  │    ├─ HeroSystem.save()      → SaveManager.saveHeroData()
  │    ├─ SkillSystem.save()     → SaveManager.saveSkillData()
  │    ├─ FormationSystem.save() → SaveManager.saveFormationData()
  │    ├─ ChapterSystem.save()   → SaveManager.saveChapterData()
  │    └─ SaveManager.save()     ← 强制落盘
  │
  └─ Phase9Bootstrap.destroy()
       ├─ AnalyticsSystem.destroy()  (GAME_EXIT + 清理监听)
       └─ BattleFXManager.cleanup()
```

---

## 验证方法

1. **静态验证**：在 Cocos Creator 控制台执行
   ```
   Phase9FinalAcceptanceVerifier.runAll()
   ```

2. **战斗闭环**：创建空场景，挂载 `BattleDebugRunnerV2` 组件，运行场景

3. **编译验证**：在 Cocos Creator 中检查所有文件编译无语法错误

4. **集成验证**：运行 Phase8BootstrapEntry 场景，确认 Phase9 系统随场景启动自动初始化

---

## 版本信息

- 日期：2026-06-05
- Phase：Phase9-Integration
- 状态：Final
