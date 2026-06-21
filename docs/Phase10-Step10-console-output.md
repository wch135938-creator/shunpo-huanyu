============================================================
[Phase10-Step10] Equipment Runtime Validation
Environment: Node.js + tsx (Cocos cc mock)
Executed: 2026-06-06 21:42 UTC
============================================================

[Setup] Importing modules...
[Setup] Creating mock services...
[Setup] Loading equipment configs...
[EquipmentConfigRepository] Loaded 12 equipment configs, version=1.0.0
[Setup] Loaded 12 equipment configs
[Setup] Config repo loaded: true
[Setup] Initializing EquipmentService...
[Setup] EquipmentService ready.

============================================================
RUNNING TESTS
============================================================


--- Test 5: Equip/Unequip 全流程 ---
  Inst uniqueId: test_eq_ITEM_EQ_WEAPON_001_1780753323161_3dhm9s
  Inst in store: true
  Equip result: success=true code=SUCCESS msg=
  Unequip result: success=true code=SUCCESS msg=

--- Test 6: Upgrade 升级流程 ---
  Inst uniqueId: test_eq_ITEM_EQ_WEAPON_001_1780753323162_0nucqb, level=1
  Upgrade check: allowed=true code=SUCCESS
  Cost: ITEM_EQUIPMENT_STONEx15
  Upgrade result: success=true level=1→2 powerDelta=6

--- Test 7: Enhance 强化流程 ---
  Inst uniqueId: test_eq_ITEM_EQ_WEAPON_001_1780753323162_cn9d71, enhanceLevel=0, quality=2, level=5
  Enhance check: allowed=true code=SUCCESS
  Cost: ITEM_EQUIPMENT_STONEx5
  Enhance result: success=true enhance=0→1 powerDelta=7

--- Test 8: Decompose 分解流程 ---
  Inst uniqueId: test_eq_ITEM_EQ_WEAPON_001_1780753323162_rsht0v
  Decompose check: allowed=true code=SUCCESS
  Returns:
  Exists before decompose: true
  Decompose result: success=true decomposed=test_eq_ITEM_EQ_WEAPON_001_1780753323162_rsht0v returns=0 items
  Exists after decompose: false

--- Test 9: 事件刷新链路 ---

--- Test 10: 筛选缓存行为 ---

--- Test 11: SlotRules 集成校验 ---

--- Test 12: BattleContribution 计算链路 ---

--- Test 13: Panel ViewModel 正确性 ---

--- Test 14: Mediator 初始化链路 ---

--- Test 15: 数据持久化 Round-Trip ---

--- Extra A: Equip 装备穿戴详细验证 ---

--- Extra B: Unequip 装备卸下详细验证 ---

--- Extra C: Upgrade 升级详细验证 ---

--- Extra D: Enhance 强化详细验证 ---

--- Extra E: Decompose 分解详细验证 ---

============================================================
TEST RESULTS
============================================================
Total: 20 | PASS: 20 | FAIL: 0 | SKIP: 0
------------------------------------------------------------
[PASS] #1 服务初始化链路 (EquipmentService → Inventory → Save → Event)
       eq=true inv=true data=true
[PASS] #2 配置仓库加载 (itemId ↔ configId mapping)
       loaded=true configs=12 mapping=OK
[PASS] #3 Presenter → EquipmentInventoryView → ViewModel 构建链路
       list=2 vm fields=OK names=[青锋剑, 布衣]
[PASS] #4 DetailViewModel 构建 (canEquip/canUnequip/canUpgrade/canEnhance/canDecompose)
       equip=OK unequip=SLOT_EMPTY upgrade=OK enhance=true decompose=OK power=80
[PASS] #5 Equip/Unequip 全流程 (Service → Loadout → Event)
       equip=OK replaced=none unequip=test_eq_ITEM_EQ_WEAPON_001_1780753323161_3dhm9s events(all)=OK
[PASS] #6 Upgrade 升级流程 (材料扣除 → 等级变化 → 战力变化)
       level=1→2 powerDelta=6 cost=[ITEM_EQUIPMENT_STONEx15]
[PASS] #7 Enhance 强化流程 (强化等级变化 → 战力变化 → 事件)
       enhance=0→1 powerDelta=7
[PASS] #8 Decompose 分解流程 (装备销毁 → 材料返还 → 事件)
       decomposed=test_eq_ITEM_EQ_WEAPON_001_1780753323162_rsht0v returns=0 items instanceDestroyed=true
[PASS] #9 事件刷新链路 (Service.emit → EventManager → Presenter callback)
       LOADOUT_CHANGED 事件正确触发回调
[PASS] #10 Filter Cache 筛选缓存行为
       all=10 weapons=6 epic+2 unequipped=9
[PASS] #11 SlotRules 集成校验 (6 种规则组合)
       全部校验通过: NOT_EQUIPMENT_CATEGORY, SLOT_NOT_COMPATIBLE, LEVEL_REQUIREMENT_NOT_MET, ALLOWED, SLOT_EMPTY, EQUIPMENT_LOCKED
[PASS] #12 BattleContribution 计算链路
       hero=hero_battle_test_12 无穿戴装备，contribution=null（合法）
[PASS] #13 Panel ViewModel 正确性
       hero=hero_panel_test_13 slots=3 power=0
[PASS] #14 Mediator 初始化链路 (EquipmentData 结构 + config mapping)
       version=1 loadouts=2 meta=OK mapping=OK
[PASS] #15 数据持久化 Round-Trip
       write=test_eq_ITEM_EQ_WEAPON_003_1780753323163_38eolq read=test_eq_ITEM_EQ_WEAPON_003_1780753323163_38eolq roundTrip=OK
[PASS] #16 [Verify] Equip — 装备穿戴 (Loadout变化 + 事件触发 + 状态更新)
       hero=hero_equip_verify slot=Weapon uniqueId=test_eq_ITEM_EQ_WEAPON_001_1780753323163_kowibo loadout=OK wearer=OK events=OK
[PASS] #17 [Verify] Unequip — 装备卸下 (Loadout变化 + 事件触发 + 槽位清空)
       hero=hero_unequip_verify slot=Armor uniqueId=test_eq_ITEM_EQ_ARMOR_001_1780753323164_ut6fe3 slotEmpty=OK event=OK
[PASS] #18 [Verify] Upgrade — 升级详细验证 (材料扣除 + 等级变化 + 战力变化 + 实例更新)
       level=1→2 materialUsed=15 powerDelta=6 instUpdated=OK
[PASS] #19 [Verify] Enhance — 强化详细验证 (强化等级变化 + 战力变化 + 实例更新)
       enhance=2→3 powerDelta=24 instUpdated=OK
[PASS] #20 [Verify] Decompose — 分解详细验证 (装备销毁 + 材料返还 + 实例移除 + 事件)
       destroyed=OK returns=1 items hasReturns=true
============================================================

FINAL VERDICT: ALL PASS

✅ Phase10-Step10 Runtime Validation: PASS
All equipment operations verified at runtime in Node.js.
Equip: PASS | Unequip: PASS | Upgrade: PASS | Enhance: PASS | Decompose: PASS
