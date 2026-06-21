# Phase10-Step11AZ Duplicate UUID Scene-Prefab RootCause Audit

Project: 《瞬破寰宇》  
Engine: Cocos Creator 3.8.8  
Stack: TypeScript / 微信小游戏  
Audit Date: 2026-06-16  
Scope: Read-only audit, no source / scene / prefab repair performed.

---

## 0. Executive Result

Result: FAIL

Current phase:

```text
Phase10-Step11AZ
```

Phase10-Step12:

```text
禁止
```

Reason:

```text
assets/scenes/Phase10Main.scene contains duplicated cc.Node _id values.
The duplicated node id breaks the Cocos Creator hierarchy tree model and triggers editor-side recursive rendering failure.
```

---

## 1. UUID Correction

The task-provided UUID was:

```text
c6oMUSZadNdo5g5QB4i+e
```

Read-only search result:

```text
0 occurrences in assets/scenes/Phase10Main.scene
0 occurrences in assets/prefabs/**/*.prefab
0 occurrences in assets/**/*.meta
```

The actual UUID shown in `temp/logs/project.log` is:

```text
cboMUSZadNdo5g5QB4ti+e
```

This actual UUID appears in the editor warning:

```text
[Window] 层级面板过滤了重复的 UUID 节点 {node(cboMUSZadNdo5g5QB4ti+e)} 以保障节点树的显示。
```

All conclusions below refer to the actual logged UUID:

```text
cboMUSZadNdo5g5QB4ti+e
```

---

## 2. UUID Owner

The duplicated UUID belongs to scene node objects:

```text
type: cc.Node
field: _id
file: assets/scenes/Phase10Main.scene
uuid: cboMUSZadNdo5g5QB4ti+e
```

It is not a prefab asset UUID, not a meta UUID, and not a TypeScript component class UUID.

The duplicated `_id` is used by 43 different `cc.Node` objects in `Phase10Main.scene`.

---

## 3. UUID Occurrence Count

Actual UUID:

```text
cboMUSZadNdo5g5QB4ti+e
```

Occurrence summary:

```text
assets/scenes/Phase10Main.scene: 43
assets/prefabs/**/*.prefab: 0
assets/**/*.meta: 0
```

Conclusion:

```text
重复 UUID 存在。
重复 UUID 只存在于 Phase10Main.scene。
Prefab 文件和 Meta 文件未发现该 UUID。
```

---

## 4. Duplicated Scene Objects

The 43 duplicated node `_id` values are distributed across two scene prefab-instance subtrees.

### 4.1 EquipmentDetailPanel subtree

Prefab asset UUID:

```text
a5e6f7b8-c9d0-1234-efab-345678901234
```

Duplicated node `_id` count:

```text
26
```

Affected nodes:

```text
EquipmentDetailPanel
panelRoot
nameLabel
qualityLabel
levelLabel
enhanceLevelLabel
powerLabel
hpStatLabel
atkStatLabel
defStatLabel
equipStatusLabel
equipBtn
unequipBtn
upgradeBtn
enhanceBtn
decomposeBtn
previewContainer
previewPowerLabel
previewCostLabel
confirmDialog
confirmTextLabel
confirmBtn
cancelBtn
closeButton
slotPickerContainer
slotPickerCloseBtn
```

Scene root position:

```text
Phase10Main
└─ Canvas
   └─ UIRoot
      └─ EquipmentDetailPanel
```

### 4.2 EquipmentBagPanel subtree

Prefab asset UUID:

```text
f4d5e6a7-b8c9-0123-defa-234567890123
```

Duplicated node `_id` count:

```text
17
```

Affected nodes:

```text
panelRoot
titleLabel
filterHintLabel
typeAllBtn
typeWeaponBtn
typeArmorBtn
typeAccessoryBtn
qualityAllBtn
qualityCommonBtn
qualityRareBtn
qualityEpicBtn
qualityLegendaryBtn
scrollView
view
contentNode
closeButton
emptyHintNode
```

Scene root position:

```text
Phase10Main
└─ Canvas
   └─ UIRoot
      └─ EquipmentBagPanel
```

Important detail:

```text
EquipmentBagPanel root node itself has a different unique id.
Its child subtree contains duplicated ids.
```

---

## 5. Scene State

File:

```text
assets/scenes/Phase10Main.scene
```

Scene metadata:

```text
assets/scenes/Phase10Main.scene.meta
uuid: f8d13b50-39f8-4c3a-b040-3b74fbef6bde
```

Scene root:

```text
cc.Scene name: Phase10Main
```

Main hierarchy:

```text
Phase10Main
├─ Canvas
│  └─ UIRoot
│     ├─ EquipmentDetailPanel
│     ├─ EquipmentMediator
│     ├─ EquipmentPanel
│     └─ EquipmentBagPanel
└─ Canvas
   └─ UIROOT
```

Scene audit findings:

```text
Scene pollution: YES
Duplicate node _id pollution: YES
Extra Canvas/UIROOT branch: YES
Invalid __id__ references: NO
Parent-child mismatch: NO
Multiple-parent child reference: NO
Node graph cycle: NO
```

The extra `Canvas/UIROOT` branch is a scene hygiene issue. It is not proven to be the direct source of the duplicated UUID, but it should not be carried forward into a clean Step12 scene.

---

## 6. Prefab State

Checked scope:

```text
assets/prefabs/**/*.prefab
```

Target UUID:

```text
cboMUSZadNdo5g5QB4ti+e
```

Prefab search result:

```text
0 occurrences
```

Conclusion:

```text
Prefab source files are not polluted by the target duplicate UUID.
```

However, the duplicated scene nodes are attached to scene-side prefab-instance data for:

```text
EquipmentDetailPanel
EquipmentBagPanel
```

Therefore:

```text
Prefab files: not polluted by this UUID.
Scene-side prefab instances / expanded serialized nodes: polluted.
```

This points to a Scene serialization / manual rebuild contamination rather than a source prefab asset contamination.

---

## 7. Meta State

Checked scope:

```text
assets/**/*.meta
```

Target UUID:

```text
cboMUSZadNdo5g5QB4ti+e
```

Meta search result:

```text
0 occurrences
```

Conclusion:

```text
No meta UUID conflict was found for this UUID.
No duplicated asset GUID evidence was found for this UUID.
```

---

## 8. Scene-Prefab Reference Chain

Relevant nodes/components in `Phase10Main.scene`:

```text
EquipmentMediator
├─ equipmentPanel -> EquipmentPanel script component
├─ bagPanel       -> EquipmentBagPanel script component
└─ detailPanel    -> EquipmentDetailPanel script component
```

Reference audit:

```text
EquipmentMediator -> EquipmentPanel: present
EquipmentMediator -> EquipmentBagPanel: present
EquipmentMediator -> EquipmentDetailPanel: present
EquipmentPanel -> EquipmentMediator: no evidence
EquipmentBagPanel -> EquipmentMediator: no evidence
EquipmentDetailPanel -> EquipmentMediator: no evidence
```

Cycle audit:

```text
A -> B -> A script reference cycle: NO evidence
Node parent-child cycle: NO
Serialized __id__ reference cycle causing this issue: NO evidence
```

Conclusion:

```text
The blocking issue is duplicate scene node _id values, not a confirmed script-reference cycle.
```

---

## 9. Maximum Call Stack Root Cause

Observed log evidence:

```text
temp/logs/project.log
```

The duplicate UUID warning originates from Cocos Creator hierarchy code:

```text
C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar\modules\editor-extensions\extensions\hierarchy\dist\components\tree-data.ccc
```

The stack overflow originates from Cocos Creator hierarchy tree-node code:

```text
C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar\modules\editor-extensions\extensions\hierarchy\dist\components\tree-node.ccc
```

The repeated stack frames are editor-side hierarchy recursion frames, not project TypeScript runtime frames.

Root cause classification:

```text
Scene污染: YES
Prefab污染: NO evidence in prefab source files
脚本递归: NO evidence
Inspector绑定: secondary victim, not root cause
其它原因: Editor hierarchy recursion triggered by duplicated scene node _id
```

Final root cause:

```text
Phase10Main.scene contains 43 cc.Node objects with the same _id.
Cocos Creator hierarchy panel detects duplicated node UUIDs, filters the duplicated nodes, then hits recursive tree rendering failure.
This produces Maximum call stack size exceeded in the editor hierarchy layer.
```

---

## 10. Why Add Component Became Abnormal

The Add Component issue is not primarily caused by:

```text
BasePanel
TypeScript file absence
AssetDB failure
Meta GUID conflict
```

Evidence from Step11AY already showed script files were recognized by AssetDB.

The current Step11AZ evidence shows:

```text
Opening or clicking Phase10Main immediately triggers duplicate UUID filtering and hierarchy stack overflow.
```

Why this affects Add Component:

```text
The editor cannot maintain a stable hierarchy / selection / inspector model for Phase10Main.
When the hierarchy and inspector are already failing on duplicated node ids, Add Component search and component attachment behavior becomes unreliable even if script registry is otherwise healthy.
```

Conclusion:

```text
Add Component 异常是 Scene 序列化污染触发的编辑器状态异常，不是当前证据链下的脚本注册根因。
```

---

## 11. Minimal Repair Plan

This audit did not execute repairs.

Minimal logical repair:

```text
Regenerate unique node _id values for the 43 polluted nodes in Phase10Main.scene.
```

Safest practical repair:

```text
Do not hand-edit the 43 _id values directly unless there is no editor-safe option.
Create a clean scene or cleanly re-instantiate the polluted panel prefabs so Cocos Creator generates valid unique node ids.
```

Recommended minimal scope:

```text
1. Backup assets/scenes/Phase10Main.scene and Phase10Main.scene.meta.
2. In Cocos Creator, create or open a clean Phase10Main replacement scene.
3. Keep only one Canvas and one UIRoot.
4. Drag clean prefab instances for:
   - EquipmentPanel
   - EquipmentBagPanel
   - EquipmentDetailPanel
5. Add or keep EquipmentMediator.
6. Rebind EquipmentMediator:
   - equipmentPanel
   - bagPanel
   - detailPanel
7. Save the scene through Cocos Creator.
8. Re-run duplicate UUID scan before entering Phase10-Step12.
```

Not recommended as first choice:

```text
Manual JSON string replacement inside Phase10Main.scene.
```

Reason:

```text
Cocos scene serialization also carries prefab instance metadata, component references, and editor state.
Blind id replacement can create a new serialization mismatch even if the duplicate string disappears.
```

---

## 12. Claude Code Execution Steps

If Claude Code is asked to perform the repair later, use this sequence:

```text
1. Create a timestamped backup of:
   - assets/scenes/Phase10Main.scene
   - assets/scenes/Phase10Main.scene.meta

2. Run a duplicate-node-id scan on the backup and current scene.

3. Do not edit assets/prefabs/**/*.prefab for this UUID.
   The duplicate UUID does not exist in prefab source files.

4. Prefer scene replacement / scene reconstruction over surgical JSON id editing.

5. Build a clean Phase10Main scene with:
   - one Canvas
   - one UIRoot
   - EquipmentPanel
   - EquipmentBagPanel
   - EquipmentDetailPanel
   - EquipmentMediator

6. Rebind EquipmentMediator fields in Inspector.

7. Save through Cocos Creator.

8. Re-run scans:
   - target UUID occurrence count
   - all duplicate cc.Node _id values
   - invalid __id__ references
   - parent-child mismatch
   - node graph cycle

9. Open Phase10Main in Cocos Creator and verify:
   - no duplicate UUID hierarchy warning
   - no Maximum call stack size exceeded
   - Add Component search works for known components

10. Only after all checks pass, allow Phase10-Step12.
```

---

## 13. Acceptance Answers

### 重复 UUID 是否存在

```text
存在
```

Actual duplicated UUID:

```text
cboMUSZadNdo5g5QB4ti+e
```

### 存在于哪个文件

```text
assets/scenes/Phase10Main.scene
```

### 哪个对象产生

```text
43 个 cc.Node 对象的 _id 字段重复。
主要位于 EquipmentDetailPanel 和 EquipmentBagPanel 的 scene-side prefab-instance / expanded node subtree。
```

### 为什么导致 Add Component 异常

```text
Phase10Main 的层级树和 Inspector 选择状态因重复节点 UUID 进入异常状态。
Add Component 依赖稳定的选中节点、Inspector 和编辑器组件注册/搜索 UI。
因此脚本注册正常时，仍会表现为 Add Component 搜索或挂载异常。
```

### 为什么导致 Maximum call stack size exceeded

```text
Cocos Creator hierarchy panel detects duplicated node UUIDs and attempts to filter/render the hierarchy tree.
The malformed scene node identity data triggers editor-side recursive tree-node rendering failure.
The stack trace points to editor hierarchy tree-data/tree-node code, not project TypeScript runtime code.
```

### 如何最小修复

```text
最小修复目标是让 Phase10Main.scene 中所有 cc.Node _id 恢复唯一。
最安全做法是重建干净 Phase10Main 或重新实例化 EquipmentBagPanel / EquipmentDetailPanel，而不是直接手改 prefab 或 meta。
```

---

## 14. Final Audit Conclusion

```text
FAIL
```

Phase10-Step12:

```text
禁止
```

Blocking reason:

```text
Phase10Main.scene is polluted by duplicated cc.Node _id values.
The duplicated UUID is the direct root cause of the hierarchy duplicate UUID warning and the editor-side Maximum call stack size exceeded.
```
