# Phase10-Step12A4 Scene Override Final Report

## 1. Audit Scope

- Project: `D:\My Project\TestGame`
- Scene: `assets/scenes/Phase10Main.scene`
- Prefab: `assets/prefabs/panels/EquipmentPanel.prefab`
- Prefab UUID: `8aab8dc9-042c-40cc-b2db-2feca1ffdddd`
- Required prior reports loaded:
  - `docs/Phase10-Step12A3-Equipment-UI-Layout-Fix-Report.md`
  - `docs/Phase10-Step12A1C-UUID-Mismatch-Fix-Verification-Report.md`
- Missing requested input:
  - `Phase10-Step12A4-Scene-Override-RootCause-Report.md` was not present under the project docs scan.

## 2. Prefab vs Scene Diff

Before this Step12A4 fix, the running scene contained the old horizontal layout values even though the prefab had already been changed in Step12A3.

| Node | Field | Prefab value | Scene value before Step12A4 | Scene value after Step12A4 |
|---|---:|---:|---:|---:|
| EquipmentPanel | UITransform width x height | 720 x 1280 | 1280 x 720 | 720 x 1280 |
| EquipmentPanel | Widget `_alignFlags` | 15 | 45 | 15 |
| panelRoot | UITransform width x height | 720 x 1280 | 1280 x 720 | 720 x 1280 |
| panelRoot | Widget `_alignFlags` | 15 | 45 | 15 |
| slotContainer | `_lpos.y` | -180 | 110 | -180 |
| hpBonusLabel | `_lpos.y` | 470 | 430 | 470 |
| atkBonusLabel | `_lpos.y` | 470 | 430 | 470 |
| defBonusLabel | `_lpos.y` | 470 | 430 | 470 |
| equipmentPowerLabel | `_lpos.y` | 540 | 505 | 540 |
| heroIdLabel | `_lpos.y` | 540 | 505 | 540 |
| closeButton | `_lpos` | x=280, y=600 | x=300, y=560 | x=280, y=600 |

## 3. Override Tree

Scene hierarchy:

```text
Canvas 720 x 1280
└─ UIRoot 720 x 1280
   └─ EquipmentPanel
      ├─ UITransform
      ├─ EquipmentPanel script
      ├─ Widget
      └─ panelRoot
         ├─ UITransform
         ├─ Sprite
         ├─ Widget
         ├─ slotContainer
         │  ├─ UITransform
         │  └─ Layout
         ├─ hpBonusLabel
         ├─ atkBonusLabel
         ├─ defBonusLabel
         ├─ equipmentPowerLabel
         ├─ heroIdLabel
         └─ closeButton
```

Prefab relation audit:

- The scene nodes store direct prefab asset references to UUID `8aab8dc9-042c-40cc-b2db-2feca1ffdddd`.
- The scene nodes and components do not contain normal per-node `cc.PrefabInfo` / `cc.CompPrefabInfo` fileId mapping.
- The scene serializes full local values for `_lpos`, `_contentSize`, `_anchorPoint`, `_alignFlags`, and component data.
- Therefore the scene behaves as a local serialized clone for layout fields: prefab edits in `EquipmentPanel.prefab` did not propagate to the running scene.

## 4. Required Field Check

After Step12A4 fix:

| Node | `_position` / `_lpos` | `_contentSize` | `_scale` | `_anchor` | `_alignFlags` |
|---|---|---|---|---|---:|
| EquipmentPanel | 0, 0, 0 | 720 x 1280 | 1, 1, 1 | 0.5, 0.5 | 15 |
| panelRoot | 0, 0, 0 | 720 x 1280 | 1, 1, 1 | 0.5, 0.5 | 15 |
| slotContainer | 0, -180, 0 | 640 x 360 | 1, 1, 1 | 0.5, 0.5 | none |

## 5. Runtime Layout Result

Serialized runtime inputs after repair:

```text
Canvas UITransform: 720 x 1280
UIRoot UITransform: 720 x 1280
EquipmentPanel UITransform: 720 x 1280
EquipmentPanel Widget flags: 15
panelRoot UITransform: 720 x 1280
panelRoot Widget flags: 15
slotContainer UITransform: 640 x 360
slotContainer position: x=0, y=-180, z=0
slotContainer Layout: horizontal, resizeMode=0, padding=16/16/16/16, spacing=16/16
EquipmentSlotItem size: 620 x 100
```

Layout chain after repair:

```text
Layout.updateLayout()
→ slotContainer UITransform 640 x 360 at y=-180
→ panelRoot Widget flags 15 stretches to Canvas 720 x 1280
→ EquipmentPanel Widget flags 15 stretches to Canvas 720 x 1280
→ Render uses vertical 720 x 1280 panel geometry
```

No script path was found that resets `EquipmentPanel`, `panelRoot`, or `slotContainer` back to the old horizontal values at runtime. `EquipmentPanel.ts` only recovers bindings, creates visual background helper nodes, loads the slot prefab, and calls `Layout.updateLayout()`.

## 6. Unique Root Cause

唯一 root cause:

```text
Phase10Main.scene 中的 EquipmentPanel 是带直接 prefab UUID 的 scene-local serialized clone，缺少正常 PrefabInfo/fileId 实例链；因此 Step12A3 修改了 EquipmentPanel.prefab，但 Preview 运行读取的是 scene 内旧的横屏布局序列化值。
```

This is the only root cause for the reported "prefab modified but runtime unchanged" contradiction.

## 7. Minimal Fix Applied

Chosen path:

```text
Direction C + local cleanup:
Remove the effective scene-level UITransform / Widget / position override by synchronizing the scene-local EquipmentPanel clone to the repaired prefab values.
```

Files changed:

- `assets/scenes/Phase10Main.scene`

Changed fields:

- `EquipmentPanel` UITransform: `1280 x 720` -> `720 x 1280`
- `EquipmentPanel` Widget `_alignFlags`: `45` -> `15`
- `panelRoot` UITransform: `1280 x 720` -> `720 x 1280`
- `panelRoot` Widget `_alignFlags`: `45` -> `15`
- `slotContainer._lpos.y`: `110` -> `-180`
- Top labels and close button positions synchronized to Step12A3 prefab values.

## 8. Acceptance Mapping

| Acceptance item | Serialized state after Step12A4 |
|---|---|
| 青锋剑首屏可见 | slotContainer is now in the repaired first-screen vertical position y=-180 |
| 无需拖动 | slotContainer is no longer left at the old y=110 horizontal layout position |
| 无巨大深色区域 | panelRoot is now 720 x 1280, matching the background block size |
| 布局符合 720 x 1280 | Canvas, UIRoot, EquipmentPanel, and panelRoot now align to 720 x 1280 |

## 9. Verification Commands

Verification performed:

```text
JSON parse: PASS
Scene field audit: PASS
Prefab vs scene target values: PASS
Runtime Cocos Preview visual verification: not executed in this audit environment
```

