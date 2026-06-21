# Phase10-Step12A4 Equipment UI Layout Final Fix

## 1. Final Root Cause

唯一 Root Cause:

```text
Scene 中 EquipmentPanel / panelRoot / slotContainer 存在 UITransform + Widget + Layout override 污染；
这些 scene override 覆盖 Prefab 的 Step12A3 修改，同时 Layout 在 UI 初始化首帧未强制 updateLayout，
导致青锋剑需要拖动后才显示、slotContainer 首屏不可见、panelRoot 出现巨大深色区域。
```

This is not a data, logic, Missing Script, UUID, or prefab asset corruption issue.

## 2. Scene Override Cleanup

File:

```text
assets/scenes/Phase10Main.scene
```

Final scene values:

| Node | UITransform | Widget | Position | Anchor | Layout |
|---|---|---|---|---|---|
| EquipmentPanel | 720 x 1280 | `_alignFlags=15` | 0, 0, 0 | 0.5, 0.5 | none |
| panelRoot | 720 x 1280 | `_alignFlags=15` | 0, 0, 0 | 0.5, 0.5 | none |
| slotContainer | 640 x 360 | none | 0, -180, 0 | 0.5, 0.5 | horizontal, padding 16, spacing 16 |

Top UI positions are synchronized with Step12A3:

```text
hpBonusLabel.y = 470
atkBonusLabel.y = 470
defBonusLabel.y = 470
equipmentPowerLabel.y = 540
heroIdLabel.y = 540
closeButton.x = 280
closeButton.y = 600
```

## 3. Forced Layout Initialization

File:

```text
assets/scripts/ui/EquipmentPanel.ts
```

Final code added:

```ts
protected start(): void {
  this.scheduleOnce(() => {
    this._forceLayoutRebuild();
  }, 0);
}

private _forceLayoutRebuild(): void {
  const rootLayout = this.node.getComponent(Layout);
  rootLayout?.updateLayout();

  const childLayout = this.node.getComponentInChildren(Layout);
  childLayout?.updateLayout();

  const ui = this.node.getComponent(UITransform);
  ui?.setContentSize(720, 1280);
}
```

The existing render path remains active:

```text
_renderSlots()
→ instantiate EquipmentSlotItem
→ setParent(slotContainer)
→ slotContainer.getComponent(Layout)?.updateLayout()
```

## 4. Layout Execution Chain

Final execution chain:

```text
EquipmentPanel.start()
→ scheduleOnce(..., 0)
→ _forceLayoutRebuild()
→ rootLayout.updateLayout()
→ childLayout.updateLayout()
→ EquipmentPanel UITransform setContentSize(720, 1280)
→ slotContainer Layout rebuild
→ Widget applies 720 x 1280 geometry
→ UITransform refresh
→ Render
```

## 5. Pollution Prevention Rule

Do not edit these values in Scene:

```text
Widget alignFlags
UITransform size
slotContainer position
slotContainer anchor
Layout spacing
Layout padding
```

All future layout edits must be made in:

```text
assets/prefabs/panels/EquipmentPanel.prefab
assets/scripts/ui/EquipmentPanel.ts
```

## 6. Verification

Performed:

```text
Phase10Main.scene JSON parse: PASS
Scene layout audit: PASS
EquipmentPanel.ts Final-Fix code audit: PASS
```

Verified code locations:

```text
EquipmentPanel.ts:290 protected start()
EquipmentPanel.ts:296 _forceLayoutRebuild()
EquipmentPanel.ts:297 rootLayout.updateLayout()
EquipmentPanel.ts:300 childLayout.updateLayout()
EquipmentPanel.ts:304 setContentSize(720, 1280)
```

Not performed:

```text
Cocos Creator Preview visual verification
```

Reason:

```text
The current command environment cannot launch Cocos Creator Preview.
```

## 7. Acceptance Criteria Mapping

| Acceptance | Fix |
|---|---|
| 首屏直接显示青锋剑 | slotContainer y=-180 + child Layout update |
| slotContainer 无需拖动 | start() delayed force rebuild |
| UI 无遮挡黑块 | EquipmentPanel/panelRoot 720 x 1280 |
| 720 x 1280 布局正确 | Scene UITransform and Widget values aligned |
| Layout 自动生效 | scheduleOnce calls _forceLayoutRebuild at startup |

## 8. Final Conclusion

```text
UI 问题根因是 Scene override 污染 + Layout 初始化未触发。
本次修复已清理运行时生效的 Scene 布局污染，并在 EquipmentPanel 启动阶段强制 Layout rebuild。
```

