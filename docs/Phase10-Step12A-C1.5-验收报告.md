# Phase10-Step12A-C1.5 角色经验与等级显示验证 — 验收报告

> 生成时间：2026-07-05
> 状态：Preview 人工验收通过（角色经验持久化）
> 基准提交：c6adc77 (tag: phase10-step12a-c1.4.1-pass)

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts` | 编辑 | C1.5.1 经验恢复时序、可见反馈与诊断 |
| `assets/scripts/ui/EquipmentDetailPanel.ts` | 编辑 | 属性标签 HP/ATK/DEF 中文化 |

---

## 一、HeroSystem.addHeroExp 实际数据链路

```
战斗胜利 → Coordinator._onBattleFinished()
  → _distributeExpToFormation(slots, totalExp)
    → HeroSystem.addHeroExp(heroId, exp)
      → state.exp += exp
      → while (state.exp >= state.level * 100): level++, exp -= requiredExp
      → return levelUps (升级次数)
  → _formationSystem.recalculateAllPower()
  → _chapterSystem.completeStage()
  → Phase9Bootstrap.saveAll()
    → HeroSystem.save() → SaveManager.saveHeroData()  // 写入内存
    → FormationSystem.save() → SaveManager.saveFormationData()
    → ChapterSystem.save() → SaveManager.saveChapterData()
  → SaveManager.save()  // 写入磁盘 (localStorage)
```

**经验持久化链路（完整）：**

```
SaveManager.saveHeroData() → SaveContainerV8.heroes.heroStates
SaveManager.save() → ISaveAdapter.write("game_save_v8", container) → localStorage
```

**恢复链路（完整）：**

```
Phase9Bootstrap.restoreFromSave()
  → SaveManager.loadHeroData() → SaveContainerV8.heroes
  → HeroSystem.restore(heroSaveData)
```

---

## 二、hero_001 等级经验读取方式

```typescript
const hero = this._heroSystem.getHero('hero_001');
// 返回 HeroRuntimeState 副本:
//   hero.level      — 当前等级
//   hero.exp        — 当前经验值
//   hero.power      — 战力缓存
//   hero.unlocked   — 是否已解锁
//   hero.star       — 星级
//   hero.breakthrough — 突破次数
```

`nextLevelExp = level * 100`（与 `HeroSystem.EXP_PER_LEVEL = 100` 公式一致）。

---

## 三、经验是否持久化

**是。** 链路完整，已通过代码审查验证：

- `Phase9Bootstrap.saveAll()` 调用 `HeroSystem.save()` → `SaveManager.saveHeroData()`
- `SaveManager.save()` 将完整 SaveContainerV8 写入 localStorage
- 下次 Preview 启动时 `Phase9Bootstrap.restoreFromSave()` 从 `SaveManager.loadHeroData()` 恢复

---

## 四、新增 UI Label（HeroInfoLabel）

| 属性 | 值 |
|------|-----|
| **创建方式** | 运行时创建（不修改 Scene），优先级使用 inspector 绑定 |
| **节点名称** | `HeroInfoLabel` |
| **父节点** | `resultLabel.node.parent`（与结果 Label 同级） |
| **位置** | (200, 280, 0) — 右上区域 |
| **尺寸** | 260 × 50 |
| **显示内容** | `剑无极 Lv1  EXP 65/100` |
| **颜色** | 淡黄色 `Color(255, 255, 200, 255)` |
| **字体大小** | 20 |
| **Overflow** | SHRINK（自动缩小） |
| **弹窗遮挡** | 弹窗打开时自动隐藏，关闭后自动显示 |

**不遮挡现有 UI：** 位置在右上区域，远离左下挑战按钮和中部弹窗区域。

---

## 五、结果 Label 等级变化

- **升级时**：在奖励列表和战力变化之间显示 `等级 Lv1 → Lv2`
- **未升级时**：不显示等级变化行
- **HeroInfoLabel**：始终实时显示当前等级和经验

---

## 六、控制台诊断日志

所有日志统一使用前缀 `[Step12A-C1.5][HeroExpDiag]`，不在 update 中刷屏。

| 时机 | 格式 |
|------|------|
| 启动恢复后 | `Startup restore: hero_001 level=X, exp=Y/nextLevelExp, power=Z, unlocked=...` |
| 战斗前 | `PreBattle: hero_001 level=X, exp=Y, nextLevelExp=Z, power=...` |
| 加经验前 | `expGain=X, perHero=Y, heroCount=Z, hero_001 levelBefore=A, expBefore=B` |
| 加经验后（每个英雄） | `levelBefore=X, expBefore=Y, expGain=Z, levelAfter=A, expAfter=B, levelUp=YES/NO` |
| 保存后 | `saveAll+save done, hero_001 levelAfter=X, expAfter=Y` |

HeroInfoLabel 更新日志使用前缀 `[Step12A-C1.5][HeroInfoLabel]`。

---

## 七、不变更系统（C1.4.1 稳定保证）

**以下系统/文件未做任何修改：**

| 系统 | 状态 |
|------|------|
| BattleManager | ❌ 未修改 |
| RewardSettlement | ❌ 未修改 |
| InventoryService | ❌ 未修改 |
| DungeonLoopController | ❌ 未修改 |
| DropSystem | ❌ 未修改 |
| ProgressSystem | ❌ 未修改 |
| UIEngine / UILayoutEngine / UIRenderSync / UIDiffEngine / UIRenderVM | ❌ 未修改 |
| Phase10Main.scene | ❌ 未修改 |
| Phase8Main.scene / Phase10Main-Clean.scene | ❌ 未修改 |
| SaveContainer 版本号 | ❌ 未修改 |
| 装备系统 (EquipmentService) | ❌ 未修改 |
| 战斗流程 / 奖励结算 / transactionId 幂等 | ❌ 未修改 |

**保留的C1.4.1行为：**
- 青锋剑、布衣、铜戒仍正常
- 弹窗打开时挑战入口、结果文字、HeroInfoLabel 均隐藏
- 战斗首关仍可胜利
- 金币/经验/强化石/装备奖励仍正常
- 结果文字多行不出屏幕
- BattleManager 不直接写 Inventory
- RewardSettlement transactionId 幂等不受影响
- InventoryService exp 不入背包
- 胜利才发奖，失败不发

---

## 八、Preview 验收步骤

### 8.1 启动验证
1. 打开 `Phase10Main.scene` → Preview
2. 检查右上区域：应显示 `剑无极 Lv1  EXP 0/100`（首次）或上次保存的经验/等级
3. 控制台检查：应有 `[Step12A-C1.5][HeroExpDiag] Startup restore: hero_001 level=...`

### 8.2 战斗经验验证
4. 点击挑战首关按钮
5. 控制台检查：应有 `PreBattle: hero_001 level=...` 和 `expGain=...`
6. 战斗胜利后：
   - HeroInfoLabel 经验数字应增加
   - 如果升级（经验≥100），等级应变化，HeroInfoLabel 更新为 `Lv2`
   - 结果 Label 应显示 `等级 Lv1 → Lv2`
   - 控制台应有 `levelUp=YES` 和 `saveAll+save done`

### 8.3 持久化验证
7. 关闭 Preview，重新打开 Preview
8. 检查 HeroInfoLabel：等级和经验应保持上次的值（不回退）

### 8.4 C1.4.1 不回退验证
9. 青锋剑仍显示已装备 ✓
10. 邮箱/兑换码/登录奖励弹窗打开 → 挑战按钮 / HeroInfoLabel / 结果文字 隐藏 ✓
11. 战斗仍可胜利 ✓
12. 金币/强化石/装备奖励正常 ✓
13. 无红字 ✓

### 8.5 本轮人工验收结果

```text
启动恢复：level=12, exp=105/1200, savedExp=105
战斗获得：expGain=66
战后状态：level=12, exp=171
保存结果：saveAll+save done, success=true
重新 Preview：exp=171/1200, savedExp=171
```

结论：`105 + 66 = 171`，重新 Preview 后运行值与存档值一致，角色经验持久化验收通过。

---

## 九、是否建议进入 Phase10-Step12A-C2

**角色经验持久化阻塞已解除；是否进入 C2 仍需用户另行确认。**

C1.5 是最小验证闭环，确认了：
- 经验真实进入 HeroSystem
- 等级/经验可读取
- 重新 Preview 后持久化生效
- 界面可肉眼验收

C2 将基于 C1.5 的持久化验证结果，推进到正式角色面板和更完整的升级展示系统。

---

## 十、变更摘要

```
代码变更文件: 2
新增属性: heroInfoLabel, _heroLevelBefore, _heroLevelAfter
新增方法: _ensureHeroInfoLabel(), _updateHeroInfoLabel(), _logHeroStartupDiag(), _logC15PreBattleDiag()
修改方法: onLoad(), _updateChallengeUIVisibility(), _distributeExpToFormation(),
         _onBattleFinished() (save log + heroInfoLabel update + settle block),
         _renderLastResultToLabel() (level change line)
新增诊断日志: 5 个调用点
新增 UI 组件: HeroInfoLabel (运行时创建)
装备详情文本: HP/ATK/DEF → 生命/攻击/防御
```

---

> **角色经验持久化已通过人工 Preview 验收；提交状态以 `git log` 为准。**
