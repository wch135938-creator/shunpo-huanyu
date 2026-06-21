# Phase10-Step12 Development Pipeline V2

Project: 《瞬破寰宇》  
Engine: Cocos Creator 3.8.8  
Stack: TypeScript / 微信小游戏  
Date: 2026-06-16  
Status Baseline: Phase10-Step11 FINAL PASS

---

## 1. Baseline

Phase10-Step11 is treated as closed and final.

Resolved permanently unless new evidence appears:

```text
Scene Recovery PASS
Prefab Recovery PASS
Equipment UI PASS
EquipmentMediator PASS
Script Registry PASS
AssetDB PASS

Prefab Pollution resolved
Scene Pollution resolved
UUID Pollution resolved
BasePanel Registry Failure resolved
DungeonNodeMapPanel Recognition Failure resolved
Add Component Failure resolved
Maximum Call Stack Size Exceeded resolved
```

Step12 must not reopen Step11 conclusions.

---

## 2. Strategic Conclusion

Recommended Phase10-Step12 target:

```text
Main Gameplay Loop Integration V2
```

Definition:

```text
Player enters Phase10Main
→ starts a playable battle / dungeon / chapter attempt
→ battle resolves
→ reward is granted
→ inventory/equipment/hero growth changes
→ power increases
→ chapter/dungeon progress advances
→ save persists
→ player sees the growth result in UI
```

Reason:

The project already has many strong subsystem pieces. The highest-value Step12 is not another isolated system. The next milestone should connect existing systems into the shortest playable loop that proves the MVP promise:

```text
Battle → Reward → Growth → Higher Challenge
```

This directly follows `00-project-vision.md`, `01-core-gameplay.md`, and `16-mvp-development-roadmap.md`.

---

## 3. Current System Completion Audit

Percentages below are practical development-readiness estimates, not claims of final production quality.

| System | Completion | Evidence | Main Gap |
|---|---:|---|---|
| Equipment System | 90% | EquipmentService, EquipmentSlotRules, Equipment UI, Presenter/Mediator chain, Step11 final pass | Needs integration into main loop reward/power feedback |
| Inventory System | 85% | InventoryService, InventoryTransaction, claimState, reward_grant support | Item classification still has config-migration TODO; economy ownership needs final unification |
| Dungeon System | 75% | DungeonSystem, DungeonGameplay, DungeonLoopController, dungeon configs | Not fully wired into current Phase10Main player-facing scene |
| Roguelike System | 72% | RoguelikeSystem startRun/enterNode/completeNode/completeRun, run save APIs | Event/HUD/result flow needs a complete first playable route |
| Reward System | 80% | RewardSystem, RewardSettlement, RewardRepository, RewardPanel, DropSystem batch settlement | RewardSystem and DropSystem overlap; final reward source of truth should be clarified |
| Save V2 | 85% | CURRENT_SAVE_VERSION = 8, SaveManager, migration, backups, module saves | Large surface area; Step12 must avoid schema churn unless required |
| Chapter System | 72% | ChapterRepository/System, stage unlock/complete, snapshots | Chapter progression is not yet the visible main progression spine |
| Formation System | 82% | FormationSystem, TeamSnapshotBuilder, BattleUnitFactory chain | Needs player-facing formation UI later; Step12 can use default pve preset |
| Hero System | 85% | HeroSystem, HeroSnapshotBuilder, talents, growth routes | Needs reward-to-exp-to-power feedback surfaced in main loop |
| Skill System | 76% | SkillSystem, SkillRuntimeResolver, upgrade/combos panels | Needs visible unlock/upgrade loop later; Step12 can rely on existing default skills |

Overall state:

```text
Subsystem foundation: strong
Player-facing integrated loop: incomplete
Recommended next work: integration before expansion
```

---

## 4. Missing Gameplay Loops

P0 missing loop:

```text
Chapter / Dungeon entry
→ BattleManager.startStageBattle
→ Battle result
→ Reward settlement
→ Inventory / Hero / Equipment growth
→ Power recalculation
→ Chapter or Dungeon progress update
→ Save
→ Result UI
```

P1 missing loops:

```text
DungeonNodeMap node click → battle/event/reward → map refresh → next node
Roguelike run completion → final reward → archive/save → return to entry panel
New player first 10 minutes → SSR/equipment/growth feedback → next challenge
```

P2 missing loops:

```text
Skill upgrade UI → battle power validation
Formation editing UI → battle snapshot refresh
LiveOps reward entry → inventory/equipment feedback
```

---

## 5. Missing UI

Current clean Phase10Main is Equipment-centered. It does not yet prove the whole gameplay loop.

Missing or not yet integrated as primary Phase10Main flow:

```text
Main gameplay entry panel
Chapter/stage selection entry
Battle start/result panel connection
DungeonPanel / DungeonNodeMapPanel / RoguelikeHUD / ResultPanel scene binding
Reward settlement display in current Phase10 scene
Growth result display after reward
New player guided first action
```

Existing UI assets/scripts that can be reused:

```text
Phase8UIManager
DungeonPanel
DungeonNodeMapPanel
RoguelikeHUD
EventPanel
ResultPanel
RewardPanel
EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel
```

Step12 should reuse these instead of creating a parallel UI stack.

---

## 6. Missing Player Progression Links

Critical missing links:

```text
BattleResult rewards → unified reward settlement
Reward grants → InventoryService / EquipmentService / HeroSystem
Hero exp / equipment changes → PowerSystem / FormationSystem snapshot refresh
Battle win → ChapterSystem.completeStage
Dungeon node completion → Roguelike/Dungeon save update
Result UI → visible "power increased" feedback
```

The project has most endpoints; Step12 should implement the coordinator layer and validation runner that confirms the full chain.

---

## 7. Development Priority Ranking

### Rank 1: Main Gameplay Loop Integration

Priority:

```text
P0
```

Why:

This is the MVP spine. It proves the game can be played, not just inspected.

Recommended Step12 milestone name:

```text
Phase10-Step12A Main Gameplay Loop Integration V2
```

### Rank 2: Battle-to-Reward-to-Growth Full Loop

Priority:

```text
P0
```

Why:

This is the highest-sensation loop: rewards, equipment, exp, power increase.

### Rank 3: DungeonNodeMap Gameplay Completion

Priority:

```text
P0/P1
```

Why:

DungeonNodeMapPanel is already implemented and was previously blocked by editor recognition problems. With Step11 closed, it should become the first concrete playable interface.

### Rank 4: Chapter Progression Integration

Priority:

```text
P1
```

Why:

ChapterSystem is stable enough to become the long-term progression spine, but it should be connected after one battle/reward loop is proven.

### Rank 5: Reward Pipeline Completion

Priority:

```text
P1
```

Why:

RewardSystem, DropSystem, InventoryService, and RewardSettlement overlap. Step12 should clarify usage in the main loop and avoid double-grant risk.

### Rank 6: Roguelike Event Flow

Priority:

```text
P1
```

Why:

Roguelike events add replayability, but the first Step12 target should prove battle/reward/growth before deep event variety.

### Rank 7: New Player Onboarding

Priority:

```text
P2 for Step12, P0 before external test
```

Why:

TutorialSystem exists, but onboarding should be attached after the main loop is stable. It is essential before user testing, not before loop integration.

---

## 8. Recommended Development Order

### Step12A: Main Loop Coordinator

Goal:

```text
Create one stable coordinator that starts the current playable loop from Phase10Main.
```

Scope:

```text
Use existing systems.
Use default pve formation.
Start one configured stage or dungeon node.
Route result into reward/growth/save.
```

Do not:

```text
Create new battle system.
Create new save schema.
Create new reward model.
Create new large UI framework.
```

Acceptance:

```text
One button or one callable entry starts a playable attempt.
Battle resolves.
Result is observable.
No duplicate grant.
Save dirty/autoSave path executes.
```

### Step12B: Reward Settlement Unification

Goal:

```text
Define the Step12 reward path for battle/dungeon/chapter.
```

Recommended rule:

```text
DropSystem handles drop rolling / batch settlement.
InventoryService owns inventory asset mutation and claimState.
HeroSystem/ProgressSystem owns hero exp / power growth.
RewardSystem remains history / panel / external reward facade unless explicitly selected as the main grant path.
```

Acceptance:

```text
Gold/exp/equipment/item grants are visible in settlement result.
Equipment rewards appear in EquipmentBagPanel.
Hero exp or progress reward changes power-related data.
Repeated settlement with same transaction/source does not double grant.
```

### Step12C: DungeonNodeMap First Playable Route

Goal:

```text
Make DungeonPanel → DungeonNodeMapPanel → node click → result panel work in Phase10Main.
```

Acceptance:

```text
DungeonPanel opens.
Selecting a dungeon starts a run.
NodeMap renders available nodes.
Clicking a node processes battle/reward/event.
ResultPanel shows reward.
NodeMap refreshes current layer.
Run can complete or return safely.
```

### Step12D: Chapter Progression Bridge

Goal:

```text
Connect BattleManager win result to ChapterSystem.completeStage and next-stage unlock.
```

Acceptance:

```text
Current stage can be completed.
Next stage unlocks.
Chapter snapshot updates.
Save/load preserves progress.
Analytics tracks battle/chapter event if available.
```

### Step12E: Growth Feedback

Goal:

```text
Make reward impact immediately visible.
```

Acceptance:

```text
Result UI shows reward summary.
EquipmentPanel can show new equipment after reward.
Power or hero level increase is visible/logged.
Player receives feedback within 30 seconds.
```

### Step12F: Runtime Validation

Goal:

```text
Create one Step12 validation runner for the complete loop.
```

Acceptance:

```text
Phase10Step12RuntimeValidator.runAll()
PASS checks:
- bootstrap ready
- formation snapshot non-empty
- battle starts
- battle resolves
- reward settles
- inventory changes
- growth changes
- chapter/dungeon progress changes
- save succeeds
- UI route has no null required refs
```

---

## 9. Technical Risk Audit

### Architecture Health

Status:

```text
Medium risk, acceptable for Step12.
```

Strengths:

```text
Systems are modular.
SaveManager is centralized.
Config-driven resources exist.
Equipment UI now stable.
Battle formation pipeline exists.
Phase8/Phase9 bootstrap systems exist.
```

Risks:

```text
Several core files are large:
- DropSystem.ts > 1000 lines
- SaveManager.ts > 1000 lines
- RoguelikeSystem.ts > 900 lines
- ProgressSystem.ts / HeroSystem.ts / EquipmentService.ts are also large

Multiple historical bootstrap paths exist:
- Phase8Bootstrap
- Phase8BootstrapEntry
- Phase9Bootstrap
- Phase10Main scene path

Reward-related responsibilities overlap:
- DropSystem
- RewardSystem
- RewardSettlement
- InventoryService
```

Step12 mitigation:

```text
Add a thin coordinator.
Do not refactor large systems first.
Document one canonical path for Step12 rewards.
Add validation around double-grant and save mutation.
```

### Dependency Risks

Status:

```text
Medium
```

Risks:

```text
BattleManager requires setPlayerFormation before startStageBattle.
Dungeon UI requires Phase8Bootstrap availability.
EquipmentMediator requires Inspector bindings and dynamic panel loading is disabled.
Some UI panels depend on prefab fields such as item templates / reward item prefabs.
```

Mitigation:

```text
Step12 coordinator must explicitly initialize bootstrap order.
Scene validation must check all required UI references.
Runtime validator must fail fast on null refs.
```

### Save Compatibility Risks

Status:

```text
Medium
```

Facts:

```text
CURRENT_SAVE_VERSION = 8
SaveV2 migration exists.
V8 has heroes / skills / formations / chapters / tutorial / analytics.
Phase10 fields include chapter events, rewardData, inventoryData, equipmentData.
```

Risks:

```text
Step12 may be tempted to add more save fields.
Chapter progress and chapter event data have similar naming and must not be mixed.
Reward claimState exists in both Inventory and Reward layers.
```

Mitigation:

```text
Do not bump save version in Step12 unless unavoidable.
Use existing fields first.
Use transaction/source IDs for idempotent rewards.
Add save/load validation to Step12 acceptance.
```

### WeChat Mini Game Deployment Risks

Status:

```text
Low/Medium for Step12, higher before release.
```

Risks:

```text
Large config set may affect loading if loaded eagerly.
Frequent instantiate/destroy in reward/result UI can hurt low-end devices.
Console noise should remain controlled.
LocalStorageAdapter fallback is useful in editor but WeChat storage path needs smoke testing.
```

Mitigation:

```text
Keep Step12 route narrow.
Avoid loading all UI/content at startup.
Reuse object pools already present in UI/reward systems.
Run WeChat preview smoke after Step12 loop passes in Cocos.
```

---

## 10. Blockers

No Step11 blocker remains.

Current Step12 blockers:

```text
1. No single canonical runtime path for Main Gameplay Loop V2.
2. Current Phase10Main is Equipment-focused, not full gameplay-loop focused.
3. Reward settlement ownership must be fixed for Step12 to avoid duplicate grants.
4. Dungeon/Chapter/Battle UI route needs scene-level binding and validation.
```

Non-blockers:

```text
Prefab pollution
Scene pollution
UUID pollution
Script registry
AssetDB
Equipment UI
BasePanel registration
Maximum call stack
```

---

## 11. Claude Code Tasks

### Task C1: Implement Step12 Coordinator

Create a small coordinator component or service:

```text
Phase10MainGameplayCoordinator
```

Responsibilities:

```text
Initialize / access Phase8Bootstrap and Phase9Bootstrap.
Prepare default formation.
Start one configured stage or dungeon run.
Listen for battle/result events.
Call reward/growth/progress settlement path.
Trigger UI updates.
```

### Task C2: Bind Gameplay UI into Phase10Main

Add or bind existing panels:

```text
DungeonPanel
DungeonNodeMapPanel
RoguelikeHUD
ResultPanel
RewardPanel if needed
```

Keep Equipment UI intact.

### Task C3: Define Reward Settlement Path

Write the Step12 canonical path in code comments and implementation:

```text
Battle/Dungeon source
→ DropSystem / RewardSettlement
→ InventoryService / HeroSystem / ProgressSystem
→ SaveManager
→ ResultPanel
```

### Task C4: Add Runtime Validator

Create:

```text
assets/scripts/validation/Phase10Step12RuntimeValidator.ts
```

Validator must test the actual route, not only isolated methods.

### Task C5: Produce Implementation Report

Generate:

```text
docs/Phase10-Step12-Main-Gameplay-Loop-Implementation-Report.md
```

---

## 12. Codex Tasks

### Task X1: Pre-implementation Audit

Before code changes:

```text
Scan Phase10Main.scene required refs.
Scan prefab/template refs for Dungeon/Result UI.
Confirm no active duplicate node ids.
Confirm no missing script metas.
```

### Task X2: Code Review

Review implementation for:

```text
Reward double-grant risk
Save field misuse
Async initialization race
Null panel refs
Direct UI-to-data mutation
WeChat-incompatible APIs
```

### Task X3: Validation Report

After runtime test:

```text
Collect Cocos console output.
Verify PASS/FAIL by exact acceptance items.
Update Step12 report.
```

### Task X4: Regression Guard

Keep Step11 closed by verifying:

```text
No duplicate UUID warning
No Maximum call stack exceeded
Add Component remains normal
Equipment UI still opens and operates
```

This is a guard only, not a reopening of Step11.

---

## 13. Estimated Workload

Recommended Step12 scope:

```text
Small/medium integration milestone.
```

Estimate:

```text
Implementation: 12-18 engineering hours
Scene/UI binding: 2-4 hours
Runtime validation: 3-5 hours
Bug buffer: 4-8 hours
Total: 21-35 hours
```

If Cocos scene binding remains stable:

```text
2-4 focused work sessions
```

If UI prefab binding issues appear:

```text
Add 1-2 sessions
```

---

## 14. Acceptance Criteria

Phase10-Step12 PASS requires all items:

```text
1. Phase10Main opens with no editor errors.
2. Main gameplay entry is visible or callable.
3. Default formation snapshot is non-empty.
4. Battle or dungeon node attempt starts successfully.
5. Attempt resolves to win/fail result without runtime exception.
6. Reward settlement executes exactly once.
7. Inventory changes after reward.
8. Equipment reward, if granted, appears in EquipmentBagPanel.
9. Hero exp/growth or power feedback updates.
10. Chapter or dungeon progress updates.
11. SaveManager persists updated state.
12. Reload or restore keeps the progress.
13. Result UI shows reward/growth feedback.
14. No Step11 regression symptoms return.
15. WeChat preview smoke has no platform API blocker.
```

---

## 15. Final Recommendation

Phase10-Step12 should be:

```text
Phase10-Step12 Main Gameplay Loop Integration V2
```

Development order:

```text
1. Main Gameplay Loop Coordinator
2. Battle-to-Reward-to-Growth path
3. DungeonNodeMap first playable route
4. Chapter progression bridge
5. Growth feedback UI
6. Runtime validator and WeChat smoke
7. New player onboarding after the loop is stable
```

Final decision:

```text
Do not build a new isolated feature.
Do not expand content volume yet.
Do not refactor large systems first.

Build the first stable player-facing loop.
```

