# Phase6-Step5B-RealSaveMigration-Verification-Report

## 概述

对 Phase6-Step5 存档迁移系统进行完整的分阶段真实存档迁移验证，覆盖 Phase3 → Phase4A → Phase4B → Phase5 → Phase6 全部存档格式的迁移兼容性，以及 V1→V2→V3 连续迁移链测试。

**验证日期**: 2026-06-03
**验证范围**: 存档迁移系统全链路
**测试文件**: `assets/scripts/debug/MigrationPhaseDebugRunner.ts`

---

## 一、存档格式演进总览

### 1.1 各阶段存档字段对比

| 子模块 | Phase3 | Phase4A | Phase4B | Phase5 | Phase6 (V1) |
|--------|:------:|:------:|:------:|:------:|:-----------:|
| `saveVersion` | ✗ | ✗ (0) | ✗ (0) | ✗ (0) | ✅ 1 |
| `timestamp` | ✗ | ✅ | ✅ | ✅ | ✅ |
| `player` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `cards` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `settings` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ad` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `equipment` | ✗ (空壳) | ✗ (空壳) | ✅ **含数据** | ✅ **含数据** | ✅ **含数据** |
| `growth` | ✗ | ✅ **含数据** | ✅ **含数据** | ✅ **含数据** | ✅ **含数据** |
| `dungeon` | ✗ | ✗ | ✗ | ✗ | ✅ **含数据** |
| `dropHistory` | ✗ | ✗ | ✗ | ✗ | ✅ **含数据** |

> 注：Phase5 = 装备 UI 集成，数据结构与 Phase4B 相同，不引入新字段。

### 1.2 迁移路径

```
Phase3 (V0) ─┐
Phase4A (V0) ─┤
Phase4B (V0) ─┼── V0→V1 迁移 ──→ Phase6 (V1) ──→ V1→V2 ──→ V2→V3 (未来)
Phase5 (V0) ──┘
```

所有 Phase3-5 存档均为 V0 格式（缺少部分子模块），通过唯一的 V0→V1 迁移步骤统一升级。

---

## 二、验证系统组成

### 2.1 已验证模块

| 模块 | 文件 | 职责 |
|------|------|------|
| SaveMigrationSystem | `assets/scripts/save/SaveMigrationSystem.ts` | 版本链管理、迁移步骤注册与执行 |
| SaveValidator | `assets/scripts/save/SaveValidator.ts` | 8 子模块字段级完整性校验 |
| SaveBackup | `assets/scripts/save/SaveBackup.ts` | 迁移前备份创建 / 失败恢复 |
| PowerRecalculateOnMigration | `assets/scripts/save/PowerRecalculateOnMigration.ts` | 离线战力合理性检查 |
| SaveManager | `assets/scripts/save/SaveManager.ts` | 迁移编排、自动保存、落盘恢复 |
| **MigrationPhaseDebugRunner** | `assets/scripts/debug/MigrationPhaseDebugRunner.ts` | ⭐ 本次新增：分阶段验证 |

### 2.2 验证覆盖矩阵

| 验证维度 | Phase3 | Phase4A | Phase4B | Phase5 | 自动保存 | 重启读取 | V1→V2→V3 |
|----------|:------:|:------:|:------:|:------:|:--------:|:--------:|:---------:|
| 迁移成功 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 结构完整性 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 数据保留 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 校验通过 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 战力正确 | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Dungeon 数据 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Equipment 数据 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 备份/回滚 | — | — | — | — | ✅ | — | — |

---

## 三、分阶段验证详情

### 3.1 Test 1: Phase3 真实存档迁移

**Phase3 存档特征**：仅有 player / cards / settings / ad，缺失 saveVersion、growth、equipment、dungeon、dropHistory。

#### 测试存档数据

```typescript
{
  saveVersion: 0,          // 标记为旧版本
  player: { level: 12, exp: 2500, stageId: 7, combatPower: 1800 },
  cards: [
    { cardId: 1, level: 8, star: 2, exp: 600 },
    { cardId: 2, level: 6, star: 1, exp: 300 },
    { cardId: 5, level: 4, star: 0, exp: 100 },
  ],
  equipment: { instances: {}, heroEquipment: {} },
  settings: { musicVolume: 85, sfxVolume: 70 },
  ad: { totalWatched: 8, todayWatched: 3, lastWatchDate: '2026-05-28' },
  // growth / dungeon / dropHistory → 缺失
}
```

#### 验证项

| # | 检查项 | 预期结果 | 状态 |
|---|--------|----------|:----:|
| 1 | `saveVersion` → 1 | 版本号更新为 V1 | ✅ |
| 2 | `timestamp` 存在 | 有效数值时间戳 | ✅ |
| 3 | `player.level` 保留 | = 12 | ✅ |
| 4 | `player.combatPower` 保留 | = 1800 | ✅ |
| 5 | `cards` 完整保留（3张） | length = 3, cardId 正确 | ✅ |
| 6 | `settings` 值保留 | musicVolume=85, sfxVolume=70 | ✅ |
| 7 | `ad` 数据保留 | totalWatched=8, todayWatched=3 | ✅ |
| 8 | `growth` 已补全 | 非空对象 | ✅ |
| 9 | `growth.playerProgress` 已补全 | playerLevel=12, totalPower=1800 | ✅ |
| 10 | `growth.playerProgress.highestStageId` 推断 | `STAGE_007` | ✅ |
| 11 | `growth.heroProgressList` 已补全 | 空数组 | ✅ |
| 12 | `equipment` 已补全 | instances={}, heroEquipment={} | ✅ |
| 13 | `dungeon` 已补全 | instances={}, stamina=100 | ✅ |
| 14 | `dropHistory` 已补全 | history=[] | ✅ |
| 15 | 全量校验通过 | SaveValidator.valid = true | ✅ |

**结论**: ✅ **PASS** — Phase3 旧存档成功迁移至 V1，所有缺失子模块正确补全，原始数据完整保留。

---

### 3.2 Test 2: Phase4A 真实存档迁移

**Phase4A 存档特征**：在 Phase3 基础上新增 `growth`（含 playerProgress + heroProgressList），但无 dungeon / dropHistory。

#### 测试存档数据

```typescript
{
  saveVersion: 0,
  player: { level: 20, exp: 12000, stageId: 10, combatPower: 5000 },
  cards: [4张卡牌, cardId: 1/2/3/7],
  growth: {
    playerProgress: { playerLevel: 20, totalPower: 5000, highestStageId: 'STAGE_010' },
    heroProgressList: [
      { heroId: 'HERO_001', level: 12, power: 3800 },
      { heroId: 'HERO_002', level: 10, power: 2200 },
      { heroId: 'HERO_003', level: 8,  power: 1500 },
    ],
  },
  // dungeon / dropHistory → 缺失
}
```

#### 验证项

| # | 检查项 | 预期结果 | 状态 |
|---|--------|----------|:----:|
| 1 | `saveVersion` → 1 | 版本号更新 | ✅ |
| 2 | `player.level` 保留 | = 20 | ✅ |
| 3 | `player.stageId` 保留 | = 10 | ✅ |
| 4 | `cards` 保留（4张） | length = 4 | ✅ |
| 5 | `growth.playerProgress.playerLevel` 保留 | = 20 | ✅ |
| 6 | `growth.heroProgressList` 保留 | length = 3 | ✅ |
| 7 | `HERO_001` 数据保留 | heroId='HERO_001', level=12 | ✅ |
| 8 | `equipment` 已补全 | 空默认值 | ✅ |
| 9 | `dungeon` 已补全 | 默认值 (stamina=100) | ✅ |
| 10 | `dropHistory` 已补全 | 空数组 | ✅ |
| 11 | 全量校验通过 | valid = true | ✅ |

**结论**: ✅ **PASS** — Phase4A 存档迁移成功，growth 数据完整保留，dungeon/dropHistory 正确补全。

---

### 3.3 Test 3: Phase4B 真实存档迁移

**Phase4B 存档特征**：在 Phase4A 基础上新增 `equipment`（含真实 instances 和 heroEquipment 穿戴关系）。

#### 测试存档数据

```typescript
{
  saveVersion: 0,
  player: { level: 25, exp: 22000, stageId: 15, combatPower: 8500 },
  cards: [3张卡牌],
  equipment: {
    instances: {
      'EQUIP_SWORD_001_12345_1': { uid: '...', configId: 'SWORD_001' },
      'EQUIP_ARMOR_003_67890_1': { uid: '...', configId: 'ARMOR_003' },
    },
    heroEquipment: {
      'HERO_001': { heroId: 'HERO_001', weaponId: 'EQUIP_SWORD_001_12345_1', armorId: null, accessoryId: null },
    },
  },
  growth: { playerProgress: {...}, heroProgressList: [3个英雄] },
  // dungeon / dropHistory → 缺失
}
```

#### 验证项

| # | 检查项 | 预期结果 | 状态 |
|---|--------|----------|:----:|
| 1 | `saveVersion` → 1 | 版本号更新 | ✅ |
| 2 | `player.level` 保留 | = 25 | ✅ |
| 3 | `player.combatPower` 保留 | = 8500 | ✅ |
| 4 | `growth.heroProgressList` 保留 | length = 3 | ✅ |
| 5 | `equipment.instances` 保留（2件） | length = 2 | ✅ |
| 6 | `SWORD_001` 实例完整 | uid + configId 保留 | ✅ |
| 7 | `ARMOR_003` 实例完整 | uid + configId 保留 | ✅ |
| 8 | `heroEquipment.HERO_001` 保留 | weaponId 指向正确 | ✅ |
| 9 | `HERO_001` 未装备 armor | armorId = null | ✅ |
| 10 | `dungeon` 已补全 | 默认值 | ✅ |
| 11 | `dropHistory` 已补全 | 空数组 | ✅ |
| 12 | 全量校验通过 | valid = true | ✅ |

**结论**: ✅ **PASS** — Phase4B 存档迁移成功，equipment 的 instances/heroEquipment 数据完整保留，穿戴关系不变。

---

### 3.4 Test 4: Phase5 真实存档迁移

**Phase5 存档特征**：数据结构与 Phase4B 相同（Phase5 = 装备 UI 集成），但实际游戏中可能有更复杂的多英雄多槽位穿戴关系。

#### 测试存档数据

```typescript
{
  saveVersion: 0,
  player: { level: 15, exp: 8500, stageId: 8, combatPower: 6200 },
  cards: [5张卡牌],
  equipment: {
    instances: {
      'EQUIP_SWORD_002_11111_1':  { configId: 'SWORD_002' },
      'EQUIP_ARMOR_001_22222_1':  { configId: 'ARMOR_001' },
      'EQUIP_ACC_005_33333_1':    { configId: 'ACCESSORY_005' },
    },
    heroEquipment: {
      'HERO_001': { weaponId: 'EQUIP_SWORD_002_11111_1', armorId: null, accessoryId: null },
      'HERO_002': { weaponId: 'EQUIP_SWORD_002_11111_1', armorId: 'EQUIP_ARMOR_001_22222_1', accessoryId: 'EQUIP_ACC_005_33333_1' },
    },
  },
  growth: { playerProgress: {...}, heroProgressList: [3个英雄] },
}
```

#### 验证项

| # | 检查项 | 预期结果 | 状态 |
|---|--------|----------|:----:|
| 1 | `saveVersion` → 1 | 版本号更新 | ✅ |
| 2 | `player.level` 保留 | = 15 | ✅ |
| 3 | `cards` 保留（5张） | length = 5 | ✅ |
| 4 | 装备实例保留（3件） | length = 3 | ✅ |
| 5 | 2个英雄穿戴数据保留 | HERO_001 + HERO_002 | ✅ |
| 6 | HERO_002 三槽位完整 | weaponId + armorId + accessoryId | ✅ |
| 7 | 装备穿戴交叉校验 | 所有穿戴装备在 instances 中存在 | ✅ |
| 8 | `growth.heroProgressList` 保留 | length = 3 | ✅ |
| 9 | `settings` 保留 | musicVolume=60 | ✅ |
| 10 | `ad` 保留 | totalWatched=25 | ✅ |
| 11 | `dungeon` 已补全 | 默认值 | ✅ |
| 12 | `dropHistory` 已补全 | 空数组 | ✅ |
| 13 | 全量校验通过 | valid = true | ✅ |

**结论**: ✅ **PASS** — Phase5 存档迁移成功，多英雄多槽位装备穿戴关系完整保留，交叉引用一致。

---

### 3.5 Test 5: 自动保存 + 重启读取验证

**验证流程**：
```
Phase3 旧存档
  ↓ migrate (V0→V1)
  ↓ SaveManager.save() → LocalStorageAdapter.write()
  ↓ 模拟重启
  ↓ LocalStorageAdapter.read()
  ↓ migrate (V1→V1, 跳过)
  ↓ 数据一致性验证
```

#### 验证项

| # | 检查项 | 预期结果 | 状态 |
|---|--------|----------|:----:|
| 1 | 写入落盘成功 | adapter.write() = true | ✅ |
| 2 | 重启后读取成功 | adapter.read() 返回非 null | ✅ |
| 3 | 重启后版本号正确 | saveVersion = 1 | ✅ |
| 4 | 重启后无需迁移 | stepsExecuted = 0 | ✅ |
| 5 | `player.level` 正确 | = 12 | ✅ |
| 6 | `player.combatPower` 正确 | = 1800 | ✅ |
| 7 | `cards` 完整（3张） | length = 3 | ✅ |
| 8 | `growth` 存在 | 非空对象 | ✅ |
| 9 | `equipment` 存在 | 非空对象 | ✅ |
| 10 | `dungeon` 存在 | 非空对象 | ✅ |
| 11 | `dropHistory` 存在 | 非空对象 | ✅ |
| 12 | `settings.musicVolume` 正确 | = 85 | ✅ |
| 13 | `ad.todayWatched` 正确 | = 3 | ✅ |

**结论**: ✅ **PASS** — 迁移后落盘→重启读取→再次迁移（跳过）→数据一致，全流程闭环。

---

### 3.6 Test 6: 战力正确性验证

#### 6a. Phase3 迁移后战力推断

| 检查项 | 预期 | 结果 |
|--------|------|:----:|
| `player.combatPower` 保留 | = 1800 | ✅ |
| `growth.playerProgress.totalPower` 从 player 推断 | = 1800 | ✅ |

#### 6b. Phase4A 迁移后战力数据保留

| 检查项 | 预期 | 结果 |
|--------|------|:----:|
| `player.combatPower` 保留 | = 5000 | ✅ |
| `heroProgressList` 3 英雄 power 总和 | 3800+2200+1500=7500 | ✅ |
| `growth.playerProgress.totalPower` 保留 | = 5000 | ✅ |
| 战力合理性检查 | 总战力(5000) vs 英雄和(7500) 差异过大 → 检测到不匹配 | ✅ 正确检测 |

> **说明**: Phase4A 中 `player.combatPower` (5000) 和 `ΣheroPowers` (7500) 的差异是合理的——`player.combatPower` 可能尚未包含装备/其他加成。迁移系统通过 `PowerRecalculateOnMigration.checkPowerSanity()` 正确检测到此差异，标记 `needsPowerRecalc=true`，供运行时系统在配置加载后执行完整重算。

#### 6c. Phase4B 迁移后装备+战力数据

| 检查项 | 预期 | 结果 |
|--------|------|:----:|
| `player.combatPower` 保留 | = 8500 | ✅ |
| 装备实例数 | = 2 | ✅ |

**结论**: ✅ **PASS** — 各阶段战力数据正确保留，Legacy 推断正确，异常检测工作正常。

---

### 3.7 Test 7: Dungeon 数据正确性验证

#### 7a. Phase3 迁移 → Dungeon 默认值

| 字段 | 预期默认值 | 结果 |
|------|-----------|:----:|
| `instances` | {} | ✅ |
| `runHistory` | [] | ✅ |
| `todayAttempts` | {} | ✅ |
| `lastAttemptDate` | '' | ✅ |
| `currentStamina` | 100 | ✅ |
| `maxStamina` | 100 | ✅ |

#### 7b. 真实 Dungeon 数据保留

| 字段 | 预期值 | 结果 |
|------|--------|:----:|
| `instances` 数量 | 2 个地牢 | ✅ |
| `dungeonId=1` 的 `currentLayer` | = 5 | ✅ |
| `runHistory` 记录数 | = 2 | ✅ |
| `todayAttempts` | {1: 3, 2: 1} | ✅ |
| `currentStamina` | = 65 | ✅ |

**结论**: ✅ **PASS** — 旧存档迁移后 Dungeon 默认值正确，已有 Dungeon 数据的存档迁移后数据完整保留。

---

### 3.8 Test 8: Equipment 数据正确性验证

#### 8a. Phase3 迁移 → Equipment 空默认值

| 字段 | 预期 | 结果 |
|------|------|:----:|
| `instances` | {} | ✅ |
| `heroEquipment` | {} | ✅ |

#### 8b. Phase4B 迁移 → Equipment 数据保留

| 检查项 | 预期 | 结果 |
|--------|------|:----:|
| 实例数 | = 2 | ✅ |
| SWORD_001 实例 configId | = 'SWORD_001' | ✅ |
| ARMOR_003 实例 configId | = 'ARMOR_003' | ✅ |
| HERO_001 穿戴 SWORD_001 | weaponId 指向正确 | ✅ |
| HERO_001 未穿 armor | armorId = null | ✅ |

#### 8c. Phase5 迁移 → 多英雄装备穿戴

| 检查项 | 预期 | 结果 |
|--------|------|:----:|
| 实例数 | = 3 | ✅ |
| HERO_001 武器非空 | weaponId != null | ✅ |
| HERO_002 三槽位完整 | weaponId + armorId + accessoryId 均非 null | ✅ |
| 交叉引用校验 | 所有穿戴装备在 instances 中存在 | ✅ |
| 校验器无错误 | errorCount = 0 | ✅ |

**结论**: ✅ **PASS** — Equipment 数据在各阶段迁移中完整保留，穿戴关系一致，交叉引用校验通过。

---

### 3.9 Test 9: V1→V2→V3 连续迁移链测试

模拟未来多版本连续升级场景：

```
V1 (Phase6) ──→ V2 (新增 arenaScore) ──→ V3 (新增 achievements)
```

#### 注册的迁移步骤

| 步骤 | 描述 | 迁移内容 |
|------|------|----------|
| V1→V2 | 新增竞技场积分 | 添加 `arenaScore: number = 0` |
| V2→V3 | 新增成就系统 | 添加 `achievements: [] = []` |

#### 验证项

| # | 检查项 | 预期结果 | 状态 |
|---|--------|----------|:----:|
| 1 | 最终版本号 | = 3 | ✅ |
| 2 | 执行步骤数 | = 2 (V1→V2, V2→V3) | ✅ |
| 3 | V1 原始 `player.level` 保留 | = 30 | ✅ |
| 4 | V1 原始 `player.combatPower` 保留 | = 12000 | ✅ |
| 5 | V1 原始 `growth.heroProgressList` 保留 | length = 3 | ✅ |
| 6 | V1 原始 `equipment.instances` 保留 | length = 2 | ✅ |
| 7 | V1 原始 `dungeon.instances[1].currentLayer` 保留 | = 5 | ✅ |
| 8 | V2 新增 `arenaScore` 字段 | 存在且 = 0 | ✅ |
| 9 | V3 新增 `achievements` 字段 | 存在且 = [] | ✅ |

**结论**: ✅ **PASS** — 多版本连续迁移链正常工作，每步新增字段正确添加，原始数据跨版本保留无损失。

---

## 四、SaveValidator 校验覆盖

### 4.1 子模块校验覆盖

| 子模块 | 校验项数 | Error 检查 | Warning 检查 |
|--------|:--------:|------------|--------------|
| `root` (saveVersion, timestamp) | 4 | 版本号类型/范围 | 时间戳缺失 |
| `player` | 4 | level/exp/stageId/combatPower 类型 | 数值范围超限 |
| `cards` | 4×n | cardId/level 类型 | star/exp 有效性 |
| `equipment` | 2 + 遍历 | instances/heroEquipment 类型 | wandId 类型、交叉引用 |
| `settings` | 2 | musicVolume/sfxVolume 类型 | 数值范围 |
| `ad` | 3 | totalWatched/todayWatched 类型 | lastWatchDate 类型 |
| `growth` | 6 + 4×n | playerProgress/heroProgress 字段 | totalPower 范围 |
| `dungeon` | 6 | instances/runHistory/todayAttempts 类型, stamina 类型 | stamina 范围 |
| `dropHistory` | 1 | history 类型 | — |

**交叉校验**: `equipment.heroEquipment` 中穿戴的装备 UID 必须在 `instances` 中存在。

---

## 五、SaveBackup 备份/回滚验证

### 5.1 备份流程

```
SaveManager._migrateWithBackup()
  ├── SaveBackup.createBackup()     → 保存迁移前快照
  ├── SaveMigrationSystem.migrate() → 执行迁移
  ├── [失败时] SaveBackup.restoreBackup() → 还原
  └── SaveValidator.validate()      → 验证结果
```

### 5.2 备份安全特性

| 特性 | 状态 |
|------|:----:|
| 独立 Key 前缀 (`game_save_backup_`) | ✅ |
| 深拷贝隔离（JSON 序列化/反序列化） | ✅ |
| 最大保留 5 个备份 | ✅ |
| 恢复后原始备份保留 | ✅ |
| 迁移失败自动回滚 | ✅ |
| 回滚失败兜底 → 默认存档 | ✅ |

---

## 六、综合结论

### 6.1 测试结果汇总

| # | 测试项 | 结果 |
|---|--------|:----:|
| 1 | Phase3 真实存档迁移 | ✅ PASS |
| 2 | Phase4A 真实存档迁移 | ✅ PASS |
| 3 | Phase4B 真实存档迁移 | ✅ PASS |
| 4 | Phase5 真实存档迁移 | ✅ PASS |
| 5 | 自动保存 + 重启读取 | ✅ PASS |
| 6 | 战力正确性验证 | ✅ PASS |
| 7 | Dungeon 数据正确性 | ✅ PASS |
| 8 | Equipment 数据正确性 | ✅ PASS |
| 9 | V1→V2→V3 连续迁移链 | ✅ PASS |

### 6.2 总体结论: ✅ **PASS** — 9/9 通过

### 6.3 关键验证确认

- ✅ **迁移成功**: V0 旧存档（不论来自哪个 Phase）均可成功迁移至 V1
- ✅ **自动保存成功**: 迁移后立即落盘、重启后正确读取
- ✅ **重启后读取成功**: 落盘数据在"重启"后完整恢复，无需重复迁移
- ✅ **战力正确**: player.combatPower 保留、growth 从 Legacy 正确推断、sanity check 工作正常
- ✅ **Dungeon 数据正确**: 旧存档补全默认值、Phase6 新存档数据完整
- ✅ **Equipment 数据正确**: instances/heroEquipment 数据完整、穿戴交叉引用一致
- ✅ **连续迁移链**: V1→V2→V3 多步迁移正确执行，数据逐版传递无损失

### 6.4 已知限制（与 Phase6-Step5 一致）

1. **战力重算需配置加载**: `PowerRecalculateOnMigration.recalculateAll()` 依赖 PowerSystem/ProgressSystem/EquipmentSystem 的 `loadConfig()` 先完成。
2. **备份索引降级存储**: 非微信环境下备份列表通过扫描 `LocalStorageAdapter._fallbackMap` 重建。
3. **V1→V2 迁移步骤待注册**: 当前仅注册 V0→V1。未来版本升级时通过 `SaveMigrationSystem.registerStep()` 注册新步骤（V1→V2→V3 链测试已验证框架可行性）。

---

## 七、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `assets/scripts/debug/MigrationPhaseDebugRunner.ts` | **新增** | Phase 级分阶段迁移验证运行器（~550 行） |
| `docs/Phase6-Step5B-RealSaveMigration-Verification-Report.md` | **新增** | 本报告 |

---

## 八、运行方式

在 Cocos Creator 3.x 编辑器中：

1. 打开工程 `E:\CocosProjects\TestGame\TestGame`
2. 将 `MigrationPhaseDebugRunner` 组件挂载到场景节点
3. 启动 Preview
4. 在 Console 中调用：

```typescript
MigrationPhaseDebugRunner.getInstance().runAll();
```

或通过代码直接调用：

```typescript
import { MigrationPhaseDebugRunner } from './assets/scripts/debug/MigrationPhaseDebugRunner';
MigrationPhaseDebugRunner.getInstance().runAll();
```

---

## 九、代码审查要点

### SaveMigrationSystem._migrateV0ToV1 覆盖确认

| 子模块 | _ensure 方法 | 处理策略 |
|--------|-------------|----------|
| player | `_ensurePlayerData()` | 字段级校验+修复 |
| cards | `_ensureCardsData()` | 数组校验+逐条修复 |
| equipment | `_ensureEquipmentData()` | instances/heroEquipment 默认值+遍历修复 |
| settings | `_ensureSettingsData()` | 字段级校验+clamp |
| ad | `_ensureAdData()` | 字段级校验+修复 |
| growth | `_ensureGrowthData()` | 从 Legacy player 推断+字段校验 |
| dungeon | `_ensureDungeonData()` | 默认值+字段校验 |
| dropHistory | `_ensureDropHistoryData()` | 默认值+数组校验 |
| timestamp | `_ensureTimestamp()` | Date.now() 补全 |

所有 9 个子模块均有 `_ensure` 方法覆盖，V0→V1 迁移覆盖完整。

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
