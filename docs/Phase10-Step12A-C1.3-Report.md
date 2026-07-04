# Phase10-Step12A-C1.3 武器恢复、挑战入口遮挡、结算文字溢出收尾修复报告

**日期**：2026-07-04  
**状态**：已完成  
**分支**：master（仅本地修改，未提交）  
**前置**：Step12A-A（奖励所有权收口）、Step12A-B（Coordinator 闭环）、Step12A-C1（挑战按钮接入）、C1.1（heroId 映射）、C1.2（EquipmentMediator 修复）

---

## 一、修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `assets/scripts/inventory/InventoryService.ts` | 逻辑修复 | `_ensureInventoryDataFields` 旧存档检测 + `_repairMissingInitialWeapon` 诊断日志 |
| `assets/scripts/bootstrap/Phase10MainBootstrap.ts` | 诊断增强 | `autoEquipInitialEquipment` 详细诊断日志 + `resolveInitialHeroId` 从配置读取 |
| `assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts` | Bug修复 ×2 | Popup 节点名修正 + 结果 Label 多行化 |
| `assets/scenes/Phase10Main.scene` | 属性调整 | ChallengeResultLabel 的 UITransform: 500→320×120, Label overflow: CLAMP→SHRINK, lineHeight: 30→26 |

**未修改的禁止文件**（全部确认未触碰）：
- `BattleManager.ts` — 仍遵循 Step12A-A 不直接写 Inventory
- `RewardSettlement.ts` — transactionId 幂等逻辑完整
- `HeroSystem.ts`, `FormationSystem.ts`, `ChapterSystem.ts` — 未触碰
- `UIEngine.ts`, `UILayoutEngine.ts`, `UIRenderSync.ts`, `UIDiffEngine.ts`, `UIRenderVM.ts` — 未触碰
- `EquipmentService.ts`, `EquipmentBagPanel.ts`, `EquipmentMediator.ts`, `EquipmentPanel.ts` — 未触碰
- `Phase8Main.scene`, `Phase10Main-Clean.scene` — 未触碰
- `SaveContainer` 版本号 — 未触碰

---

## 二、任务一：武器缺失根因诊断

### 2.1 真实原因

**根因：`_ensureInventoryDataFields` 对旧存档的 `initialEquipmentGranted` 标志位默认值错误。**

代码路径分析：

```
InventoryService.initialize()
  → _ensureInventoryDataFields(v8.inventoryData)
    → if (data.meta.initialEquipmentGranted === undefined)
        data.meta.initialEquipmentGranted = false;   // ← 旧存档被设为 false
  → _grantInitialEquipment()
    → 条件：!initialEquipmentGranted && instanceItems.length === 0
    → 旧存档初始装备已部分存在 → instanceItems.length > 0 → 被跳过
  → _repairMissingInitialWeapon()
    → 条件：initialEquipmentGranted === true → 被跳过（因为刚被设为 false）
```

**死锁状态**：
1. `_grantInitialEquipment()` 被 `instanceItems.length > 0` 阻止（护甲/饰品已存在）
2. `_repairMissingInitialWeapon()` 被 `!initialEquipmentGranted` 阻止（刚被设为 false）
3. 青锋剑实例永远无法恢复

### 2.2 其他检查项（全部正常）

| 检查项 | 结果 |
|--------|------|
| ITEM_EQ_WEAPON_001 的 subType 映射 | `'Weapon'` ✓（`InventoryDomain.ts:339-345`） |
| EquipmentBagPanel 的 slotType→slotId 映射 | `'Weapon'` → `'Weapon'` ✓（`EquipmentInventoryView.ts:316-321`） |
| EquipmentBagPanel 筛选逻辑 | 按 slotType 过滤 ✓（`EquipmentInventoryView.ts:149-153`） |
| autoEquipInitialEquipment 的 slotId | `'Weapon'` ✓（`Phase10MainBootstrap.ts:60`） |
| equipment_config.json 中 weapon_001→ITEM_EQ_WEAPON_001 | 存在 ✓（`EquipmentConfigRepository` 的 itemId 映射） |
| InventoryRepository 分类 ITEM_EQ_WEAPON_001 | `category='Equipment' subType='Weapon'` ✓（`InventoryDomain.ts:339-345`） |
| Phase10MainBootstrap 的 heroId | 从 `global_const.GLOBAL_PLAYER.initialHeroId` 读取 `'hero_001'` ✓ |

**结论**：代码链路全部正确，问题纯粹是旧存档的 `initialEquipmentGranted` 标志位语义错误。

---

## 三、任务二：最小恢复青锋剑

### 3.1 修复方案

**修改 `_ensureInventoryDataFields`**（`InventoryService.ts:198-213`）：

```typescript
// 旧逻辑：
data.meta.initialEquipmentGranted = false;

// 新逻辑：自动检测旧存档中是否已有初始装备
const hasAnyInitialEquip = data.instanceItems.some(
  (item) => INITIAL_EQUIPMENT_ITEM_IDS.includes(item.itemId),
);
data.meta.initialEquipmentGranted = hasAnyInitialEquip;
```

**效果**：当旧存档中已经存在布衣（ITEM_EQ_ARMOR_001）或铜戒（ITEM_EQ_ACCESSORY_001）时，`initialEquipmentGranted` 自动设为 `true`，从而允许 `_repairMissingInitialWeapon()` 执行补发。

### 3.2 修复增强：诊断日志

`_repairMissingInitialWeapon()` 所有分支现在输出明确的跳过原因：
- `initialEquipmentGranted=false` → 打印当前背包内容
- 青锋剑已存在 → 打印数量
- 已执行过补偿 → 记录
- 缺少布衣/铜戒 → 分别标记
- 玩家主动移除 → 记录
- 执行补发 → 记录 transactionId
- 幂等拦截 → 记录
- 失败 → 记录 errorCode

### 3.3 防重复发放保证

1. `_grantInitialEquipment()` — 检查 `meta.initialEquipmentGranted`（第二道防线）
2. `_repairMissingInitialWeapon()` — 检查 `claimStates[LEGACY_QINGFENG_REPAIR_TRANSACTION_ID].claimed`（事务幂等）
3. `addAssets()` — 检查 `transaction.processed`（第一道防线）
4. `autoEquipInitialEquipment()` — 检查 `loadout?.slots[slotId]` 是否已占用

**绝不会每次 Preview 新增一把，不会无限发放。**

### 3.4 验收标准

| 验收项 | 预期结果 |
|--------|---------|
| 主装备面板武器 | 青锋剑（非空） |
| 武器选择页 | 显示青锋剑，标记"已装备-Weapon" |
| 装备战力 | 166（非 0） |
| 生命/攻击/防御 | +133 / +8 / +16（非 0） |
| 护甲/饰品 | 布衣/铜戒（正常保持） |

---

## 四、任务三：挑战入口遮挡弹窗修复

### 4.1 C1.2 失效原因

**实际节点名与 Coordinator 检测列表不匹配**：

| 检测名 | 实际节点名 | 索引 | 匹配 |
|--------|----------|------|------|
| `'MailPanel'` | `'MailPanel'` | 193 | ✓ |
| `'RedeemPanel'` | `'RedeemCodePanel'` | 247 | ✗ |
| `'LoginRewardPanel'` | `'LoginRewardPopup'` | 299 | ✗ |

两个名字对不上 → `_isAnyFullScreenPopupActive()` 永远找不到 `RedeemCodePanel` 和 `LoginRewardPopup` → 邮箱弹窗打开时挑战按钮和结果 Label 仍可见。

### 4.2 修复

```typescript
// Phase10MainGameplayCoordinator.ts:138-146
private static readonly POPUP_PANEL_NAMES: string[] = [
  'MailPanel',         // ✓ 已验证
  'RedeemCodePanel',   // 修正: 原 'RedeemPanel'
  'LoginRewardPopup',  // 修正: 原 'LoginRewardPanel'
];
```

### 4.3 检测机制

- 所有三个弹窗节点均为 `UIRoot` 直接子节点（parent=index 5）
- `find('UIRoot')` 可正确找到
- `update()` 每帧调用 `_updateChallengeUIVisibility()`
- 弹窗 `active=true` → 挑战按钮和结果 Label 的 `node.active=false`
- 弹窗 `active=false` → 恢复 `node.active=true`

---

## 五、任务四：结果 Label 文字溢出修复

### 5.1 修复方案

**Scene 属性修改**（`Phase10Main.scene` ChallengeResultLabel）：
- UITransform: `width` 500→320, `height` 80→120
- Label `overflow`: 1 (CLAMP)→2 (SHRINK)
- Label `lineHeight`: 30→26

**代码修改**（`Phase10MainGameplayCoordinator.ts` `_renderLastResultToLabel()`）：
- 单行文本 → 多行格式
- 旧格式：`首关胜利：金币 +149，经验 +85，战力 783 → 783，章节已推进`
- 新格式：
  ```
  首关胜利
  金币 +149  经验 +85
  战力 783 → 783
  章节已推进
  ```
- `_ensureResultLabelStyle()` 每帧确保 `overflow=SHRINK`

### 5.2 安全说明

Scene 修改仅涉及 ChallengeResultLabel 这一个叶子 Label 的属性，不影响任何业务逻辑、父节点结构、其他面板。

---

## 六、任务五：主闭环不回退验证

| 检查项 | 状态 |
|--------|------|
| RewardSettlement transactionId 幂等 | ✓ `processTransactionId` 仍唯一检查 |
| InventoryService exp 过滤 | ✓ `EXP_REWARD_ITEM_TYPES` + `EXP_REWARD_ITEM_IDS` 完整 |
| 失败不发奖 | ✓ `if (!result.isVictory)` 跳过 settleBattleReward |
| 胜利才发奖 | ✓ 仅在 isVictory=true 后进入结算 |
| HeroSystem.addHeroExp | ✓ `_distributeExpToFormation` 调用 |
| FormationSystem.recalculateAllPower | ✓ 调用 |
| ChapterSystem.completeStage | ✓ 调用 |
| Phase9Bootstrap.saveAll | ✓ 调用 |
| SaveManager.save | ✓ 调用 |
| BattleManager 不直接写 Inventory | ✓ 仅注释引用 |

---

## 七、任务六：静态检查

### 7.1 Scene JSON
- **可解析**：✓
- **重复 `_id`**：0 个（全部 344 个 unique）
- **Missing Script**：1 个（index 8: `b100aABAAFAAIAAAAAAAAAB` — 这是 Phase10MainBootstrap 的编译后 UUID，属 Cocos Creator 正常工作方式，非缺失脚本）
- **无引用孤儿节点**：0 个

### 7.2 禁止修改文件检查
- UIEngine/UILayoutEngine/UIRenderSync/UIDiffEngine/UIRenderVM：仅由 Phase10MainBootstrap 调用 `UIEngine.bootstrap()` 和 `forceFrame0Flush()`，内部实现未修改
- BattleManager：仍标记 "Step12A-A remove direct InventoryService dependency"
- InventoryService：exp 过滤逻辑完整
- RewardSettlement：transactionId 仍在 46 处使用
- Phase8Main.scene / Phase10Main-Clean.scene：未修改

### 7.3 TypeScript 编译
- 项目无本地 tsc 安装（Cocos Creator 使用内置编译器）
- 所有修改的导入均已存在（`INITIAL_EQUIPMENT_ITEM_IDS`, `EquipmentSlotId`, `EquipmentService`, etc.）
- 无新增 `any` 类型转换
- `Label.overflow = 2` 在 Cocos Creator 3.x 中对应 `Label.Overflow.SHRINK`（合法数值枚举）

---

## 八、用户 Preview 验收步骤

1. **启动 Preview**：在 Cocos Creator 中运行 `Phase10Main.scene`
2. **检查控制台日志**：搜索 `[Step12A-C1.3]`，确认：
   - `[Step12A-C1.3][InventoryInit] Legacy save detected` — 旧存档检测
   - `[Step12A-C1.3][QingfengRepair]` — 青锋剑补偿执行或跳过原因
   - `[Step12A-C1.3][AutoEquip]` — 自动装备诊断
3. **检查主装备面板**：武器=青锋剑（非空），战力=166，生命 +133, 攻击 +8, 防御 +16
4. **打开武器选择页**：应显示青锋剑，标记"已装备-Weapon"，件数 ≥ 1
5. **打开邮箱弹窗**：ChallengeFirstStageButton 和 ChallengeResultLabel 应自动隐藏
6. **关闭邮箱弹窗**：两个 UI 元素应自动恢复
7. **点击"挑战首关"**：战斗完成后结果文本应为多行，不穿出屏幕右侧
8. **确认无红字**：Console 无红色错误

---

## 九、是否建议进入 Step12A-C2

**建议进入**，前提是用户 Preview 验收通过以上步骤。

C2 风险点：
- C1.3 的武器修复依赖旧存档检测 → 需确认日志输出符合预期
- 弹窗检测覆盖了 3 个弹窗 → 若后续新增弹窗需同步更新列表
- 结果 Label 多行化在极端长文本下仍需 SHRINK 兜底

---

## 十、禁止项确认

- [x] 未提交 git commit
- [x] 未推送 GitHub
- [x] 未修改 UIEngine/UILayoutEngine/UIRenderSync/UIDiffEngine/UIRenderVM
- [x] 未修改 BattleManager 直接写 Inventory
- [x] 未修改 RewardSettlement transactionId
- [x] 未修改 HeroSystem/FormationSystem/ChapterSystem
- [x] 未修改 SaveContainer 版本号
- [x] 未修改 Phase8Main.scene / Phase10Main-Clean.scene
