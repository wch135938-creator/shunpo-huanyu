# Phase10-Step12A4 Equipment UI Layout RootFix

## 1. Root Cause

唯一 root cause:

```text
Scene 内 EquipmentPanel / panelRoot / slotContainer 存在完整 UITransform + Widget + Layout override。
这些 scene-local override 优先于 prefab 运行，导致 Step12A3 修改 EquipmentPanel.prefab 后 Preview 仍使用旧横屏布局；
同时 Layout 初始阶段没有延迟 rebuild，首屏渲染依赖后续拖动/刷新才可见。
```

## 2. Fix Applied

### Scene Override Cleanup

File:

```text
assets/scenes/Phase10Main.scene
```

Scene-local values were synchronized to the repaired prefab layout:

| Node | Field | Fixed value |
|---|---|---|
| EquipmentPanel | UITransform | 720 x 1280 |
| EquipmentPanel | Widget `_alignFlags` | 15 |
| panelRoot | UITransform | 720 x 1280 |
| panelRoot | Widget `_alignFlags` | 15 |
| slotContainer | Position | x=0, y=-180, z=0 |
| slotContainer | Anchor | 0.5, 0.5 |
| slotContainer | Layout | horizontal, padding 16, spacing 16 |

Top controls were also synchronized to the Step12A3 prefab values:

```text
hpBonusLabel.y = 470
atkBonusLabel.y = 470
defBonusLabel.y = 470
equipmentPowerLabel.y = 540
heroIdLabel.y = 540
closeButton.x = 280
closeButton.y = 600
```

### Prefab Rebinding State

The scene still contains direct prefab UUID references:

```text
8aab8dc9-042c-40cc-b2db-2feca1ffdddd
```

The current file-level repair keeps the existing scene node IDs and script references intact, because rebuilding the instance by "drag prefab into scene" is an Editor-only operation and would require Cocos Creator to regenerate instance/fileId metadata safely.

Result:

```text
Runtime layout no longer depends on the stale scene override values.
Mediator / Bootstrap / serialized node references remain intact.
```

### Forced Layout Rebuild

File:

```text
assets/scripts/ui/EquipmentPanel.ts
```

Added:

```ts
start(): void {
  this.scheduleOnce(() => {
    this._rebuildLayouts();
  }, 0);
}

private _rebuildLayouts(): void {
  const layout = this.node.getComponentInChildren(Layout);
  layout?.updateLayout();

  const rootLayout = this.node.getComponent(Layout);
  rootLayout?.updateLayout();
}
```

The existing `_renderSlots()` refresh remains in place and still calls `slotContainer.getComponent(Layout)?.updateLayout()` after dynamic slot item creation.

## 3. Pollution Prevention Rule

Do not manually edit the following in `Phase10Main.scene`:

```text
EquipmentPanel UITransform size
EquipmentPanel Widget alignFlags
panelRoot UITransform size
panelRoot Widget alignFlags
slotContainer position
slotContainer anchor
slotContainer Layout
```

All layout changes must be made in:

```text
assets/prefabs/panels/EquipmentPanel.prefab
assets/scripts/ui/EquipmentPanel.ts
```

## 4. Verification

Performed:

```text
Phase10Main.scene JSON parse: PASS
Scene layout field audit: PASS
EquipmentPanel.ts RootFix code inserted: PASS
```

Not performed:

```text
Cocos Creator Preview visual verification
```

Reason:

```text
The current audit environment cannot run the Cocos Creator editor preview.
```

## 5. Acceptance Mapping

| Requirement | Fix path |
|---|---|
| 青锋剑首屏可见 | slotContainer y=-180 + delayed Layout rebuild |
| 无需拖动 | `start()` scheduleOnce forces initial Layout update |
| 无巨大深色区域 | EquipmentPanel/panelRoot are 720 x 1280 |
| 720 x 1280 布局正确 | Canvas/UIRoot/EquipmentPanel/panelRoot serialized values are aligned |

