# Phase10-Step12A-C1.1 首关失败与武器变空运行时诊断修复报告

**日期**：2026-07-04  
**阶段**：Phase10-Step12A-C1.1  
**场景**：Phase10Main.scene  
**状态**：诊断完成 + 最小修复完成，待用户 Preview 验收  
**禁止提交 / 禁止推送 GitHub**

---

## 一、任务目标

查清并最小修复两个阻塞问题：

1. **武器位（青锋剑）从稳定基线变成空** — 装备面板 Weapon 槽位显示为空
2. **首关真实战斗失败** — Result Label 显示"挑战失败：未发放奖励"，胜利闭环未完成

---

## 二、修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `assets/scripts/bootstrap/Phase10MainBootstrap.ts` | 修改 | 修复装备 heroId 映射 + 接线 bonusProvider + 旧存档迁移 |
| `assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts` | 修改 | 添加 `[Step12A-C1.1][RuntimeDiag]` 诊断日志 |

**未修改的文件/系统**：

- `UIEngine / UILayoutEngine / UIRenderSync / UIDiffEngine / UIRenderVM`
- `ResultPanel / DungeonLoopController / DropSystem / ProgressSystem`
- `BattleSystem / DamageCalculator`
- `Phase8Main.scene / Phase10Main-Clean.scene`
- `stage_data.json / enemy_data.json / equipment_config.json`
- `SaveContainer` 版本号

---

## 三、根因结论

### 根因一：武器位为空

**真实原因**：`Phase10MainBootstrap.ts:56`（修复前）硬编码 `DEFAULT_EQUIPMENT_HERO_ID = '0'`，但 PVE 阵容实际使用 `hero_001`（来自 `global_const.json` 的 `GLOBAL_PLAYER.initialHeroId`）。

**三条链路的实际状态**：

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 青锋剑在 Inventory instanceItems | ✅ 存在 | `InventoryService` 中 3 件装备实例（青锋剑/布衣/铜戒）完整 |
| 青锋剑在 EquipmentService loadout | ❌ 错误位置 | 被穿戴到 hero `'0'` 的 loadout，而非 hero_001 |
| hero_001 的 loadout | ❌ 空 | `getHeroLoadout('hero_001')` 返回 null（无条目） |

**次要根因**：`HeroSnapshotBuilder.setBonusProvider()` 在整个代码库中从未被调用。即使装备正确穿戴到 hero_001，装备属性也不会流入 `HeroSnapshot.battleReady`，导致英雄战斗属性不含装备加成。

**Coordinator 代码审查结论**：`Phase10MainGameplayCoordinator` 没有任何代码调用 `EquipmentService.equip/unequip`、`InventoryService.consumeAssets` 或覆盖 `equipmentData`，问题不在 Coordinator。

---

### 根因二：首关战斗失败（数学确定性失败）

**hero_001 剑无极（Lv1，品质 R，职业战士）**：

| 场景 | HP | ATK | DEF | SPD | Power |
|------|-----|-----|-----|-----|-------|
| 无装备（当前） | 500 | 60 | 40 | 20 | ~499 |
| 有装备（修复后） | 620 | 88 | 54 | 20 | ~760 |

装备加成来源：青锋剑 +20 ATK / 布衣 +80 HP +10 DEF / 铜戒 +40 HP +8 ATK +4 DEF

**敌方 STAGE_001**：

| 敌人 | Lv | HP | ATK | DEF | SPD | 阵营 |
|------|-----|-----|-----|-----|-----|------|
| ENEMY_001 雾气精魄 | 1 | 200 | 30 | 15 | 60 | 白虎 |
| ENEMY_002 岩甲龟 | 2 | 350 | 35 | 25 | 55 | 混沌 |

**战斗数学模型（DamageCalculator 公式）**：

- 伤害公式：`baseDmg = ATK × skillMultiplier` → `adjusted = baseDmg × factionMult × critMult × randomFactor` → `afterDef = adjusted - DEF × 0.5` → `final = max(1, round(afterDef))`
- 阵营克制：hero（青龙）→ ENEMY_001（白虎）= +25% 伤害；ENEMY_001（白虎）攻 hero（青龙）= 防御端 -10% 伤害

**无装备战斗推演**：

```
Hero vs ENEMY_001 伤害 ≈ (60 × 1.0 × 1.25) - (15 × 0.5) ≈ 68 → 需 ~3 次攻击
Hero vs ENEMY_002 伤害 ≈ (60 × 1.0 × 1.0) - (25 × 0.5) ≈ 48 → 需 ~8 次攻击
合计 Hero 需要 ~11 次攻击，耗时 ≈ 11 × (1000/20) = 550,000ms

同期 ENEMY_001 行动 ≈ 33 次 × 7 伤害 = 231
同期 ENEMY_002 行动 ≈ 30 次 × 15 伤害 = 450
合计伤害 ≈ 681 > Hero HP 500 → 确定性失败
```

**有装备战斗推演**：

```
Hero vs ENEMY_001 伤害 ≈ (88 × 1.25) - 7.5 ≈ 103 → 需 ~2 次攻击
Hero vs ENEMY_002 伤害 ≈ 88 - 12.5 ≈ 76 → 需 ~5 次攻击
合计 Hero 需要 ~7 次攻击，耗时 ≈ 350,000ms

同期敌人伤害 ≈ 6 × 1 + 19 × 8 = 158
Hero HP 620 - 158 = 462 → 稳赢
```

**结论**：装备修复后首关变为可通过的新手关，无需修改 STAGE_001 敌方配置。

---

## 四、具体修复内容

### 修复 A：装备 heroId 映射（Phase10MainBootstrap.ts）

**变更点 1**：`DEFAULT_EQUIPMENT_HERO_ID = '0'` → `DEFAULT_EQUIPMENT_HERO_ID_FALLBACK = 'hero_001'`

**变更点 2**：新增 `resolveInitialHeroId()` 函数
```typescript
function resolveInitialHeroId(): string {
  // 从 global_const.GLOBAL_PLAYER.initialHeroId 读取真实 heroId
  // 兜底使用 DEFAULT_EQUIPMENT_HERO_ID_FALLBACK
}
```

**变更点 3**：`autoEquipInitialEquipment()` 改为使用动态 heroId
- 调用 `resolveInitialHeroId()` 获取正确英雄 ID
- 新增旧存档迁移：检测 hero `'0'` 的 loadout，逐槽位 `unequip` 释放装备实例
- 装备穿戴目标从 `'0'` 改为 `initialHeroId`

**覆盖场景**：

| 场景 | 行为 |
|------|------|
| 全新存档（无 save） | 装备直接穿戴到 hero_001 |
| 旧存档（装备在 hero '0'） | 先从 '0' 卸下，再穿戴到 hero_001 |
| 已修复存档（装备已在 hero_001） | 跳过（loadout 已填满） |

### 修复 B：接线 EquipmentService → HeroSnapshotBuilder（Phase10MainBootstrap.ts:136-154）

在 `autoEquipInitialEquipment()` 之后调用：

```typescript
HeroSnapshotBuilder.getInstance().setBonusProvider((heroId: string) => {
  const eq = EquipmentService.getInstance();
  const contrib = eq.getHeroEquipmentContribution(heroId);
  if (!contrib) return {};
  return {
    hp: contrib.attributeBonus.hp,
    atk: contrib.attributeBonus.atk,
    def: contrib.attributeBonus.def,
    speed: contrib.attributeBonus.speed,
    equipmentPower: contrib.equipmentPower,
  };
});
```

此后所有 `HeroSnapshot.battleReady` 将自动包含装备属性加成。

### 修复 C：诊断日志（Phase10MainGameplayCoordinator.ts）

在 `challengeFirstStage()` 和 `_onBattleFinished()` 中添加一次性诊断日志，前缀统一 `[Step12A-C1.1][RuntimeDiag]`，**不在 `update()` 每帧刷屏**：

- `_logPreBattleDiagnostics()` — Inventory 实例摘要、Equipment loadout 每英雄状态、Formation slots、HeroSnapshot 属性全量、TeamSnapshot 总战力
- `_logEnemyDiagnostics()` — 敌方数量/总血量/每个敌人的 Lv/HP/ATK/DEF/SPD
- `_onBattleFinished()` 中 — BattleResult 类型/回合/耗时/击杀数/奖励数

---

## 五、不变保护确认

| 保护项 | 状态 | 验证方式 |
|--------|------|----------|
| 失败不发奖励 | ✅ 保持 | `_onBattleFinished` 中 `!result.isVictory` 分支未修改 |
| 胜利才结算 | ✅ 保持 | 胜利路径：RewardSettlement → HeroExp → Chapter → Save |
| Step12A-A 奖励所有权 | ✅ 保持 | BattleManager 不直接写 Inventory |
| InventoryService exp 不入库 | ✅ 保持 | `EXP_REWARD_ITEM_TYPES/IDS` 过滤逻辑未修改 |
| RewardSettlement 幂等 | ✅ 保持 | `transactionId` 机制未修改 |
| 不修改 UIEngine 链路 | ✅ 确认 | grep 验证：无 UIEngine/Layout/RenderSync/Diff/RenderVM 引用 |
| 不修改 ResultPanel/DungeonLoop 等 | ✅ 确认 | grep 验证：无相关引用 |
| 不重复发初始装备 | ✅ 确认 | `meta.initialEquipmentGranted` 守卫未修改 |
| 不破坏装备升级/强化/分解 | ✅ 确认 | EquipmentService 核心逻辑未修改 |
| 不影响按钮绑定 | ✅ 确认 | Coordinator 按钮逻辑未修改 |
| 不修改 Scene/Prefab | ✅ 确认 | 仅修改 .ts 文件 |

---

## 六、预期控制台关键日志

### 启动阶段

```
[Step12A-C1.1][Bootstrap] 迁移: 从旧 heroId='0' 卸下 Weapon    (如有旧存档)
[Step12A-C1.1][Bootstrap] 自动穿戴: hero=hero_001 ITEM_EQ_WEAPON_001 → Weapon
[Step12A-C1.1][Bootstrap] 自动穿戴: hero=hero_001 ITEM_EQ_ARMOR_001 → Armor
[Step12A-C1.1][Bootstrap] 自动穿戴: hero=hero_001 ITEM_EQ_ACCESSORY_001 → Accessory
[Step12A-C1.1][Bootstrap] HeroSnapshotBuilder bonusProvider 已接线
```

### 挑战首关阶段

```
[Step12A-C1.1][RuntimeDiag] Inventory: totalInstances=3, equipmentInstances=3, items=[...]
[Step12A-C1.1][RuntimeDiag] Equipment: heroId=hero_001, loadout=Weapon=xxxxxx, Armor=xxxxxx, Accessory=xxxxxx, equipPower=105, bonusHp=120, bonusAtk=28, bonusDef=14
[Step12A-C1.1][RuntimeDiag] Formation: mode=pve, filledSlots=1, heroIds=[hero_001]
[Step12A-C1.1][RuntimeDiag] HeroSnapshot: heroId=hero_001, name=剑无极, level=1, star=1, profession=战士, hp=620, atk=88, def=54, speed=20, power=~760
[Step12A-C1.1][RuntimeDiag] TeamSnapshot: totalPower=~760, heroCount=1
[Step12A-C1.1][RuntimeDiag] Enemy: enemyCount=2, totalHp=550, details=[ENEMY_001(雾气精魄): lv1 hp200 atk30 def15 spd60; ENEMY_002(岩甲龟): lv2 hp350 atk35 def25 spd55]
```

### 战斗结束阶段

```
[Step12A-C1.1][RuntimeDiag] BattleResult: resultType=victory, round=xx, elapsedTimeMs=xxxxx, killedEnemies=2
```

### ResultLabel

```
首关胜利：金币 +xxx，经验 +xxx，战力 xxx → xxx，章节已推进
```

---

## 七、用户 Preview 验收步骤

1. **清除旧存档**（推荐，避免 hero '0' 迁移噪音）或直接 Preview `Phase10Main.scene`
2. 观察控制台启动日志，确认 bonusProvider 接线 + 自动穿戴成功
3. 点击"挑战首关"按钮
4. 观察 `[Step12A-C1.1][RuntimeDiag]` 诊断日志，确认 hero_001 的 loadout 三项均非空、battleReady 属性含装备加成
5. 等待战斗结束，预期 Label 显示胜利信息
6. 检查装备面板 — Weapon/Armor/Accessory 应均显示装备

---

## 八、后续建议

- ✅ **建议进入 Step12A-C2**（接 ResultPanel / DungeonLoop / 正式 UI）
- 当前修复只解决数据层（装备映射 + 快照属性注入），UI 面板刷新依赖已有的 `EquipmentMediator` 正常工作
- 如果 Preview 后武器位仍显示为空但 loadout 日志确认已装备 → UI 刷新时序问题，属于 UIEngine SOP 范畴，非本轮数据修复范围
- 首关通过后不要重复点击（transactionId 幂等会拦截重复结算）

---

**禁止提交，禁止推送 GitHub。请用户 Preview 确认后再决定下一步。**
