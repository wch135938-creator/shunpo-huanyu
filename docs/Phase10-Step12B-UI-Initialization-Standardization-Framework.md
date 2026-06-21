# Phase10-Step12B UI Initialization Standardization Framework

## 1. Goal

Establish one stable UI initialization chain for the Step12A failure class:

```text
Prefab structure + Runtime Layout Pipeline = final UI state
```

Scene may keep mounting nodes and runtime references, but must not be the source of UI layout state.

## 2. Final Root Cause Covered

```text
Scene override pollution + Layout lifecycle running too early caused first-frame UI instability.
```

Covered symptoms:

- Layout only appears after dragging.
- Prefab edits appear ineffective.
- Scene and Prefab layout states diverge.
- EquipmentPanel shows stale horizontal sizing.
- slotContainer first-frame layout is not rebuilt.

## 3. Standard Runtime Pipeline

Implemented in:

```text
assets/scripts/core/BasePanel.ts
```

Standard chain:

```text
onLoad
→ markLayoutDirty
→ start
→ scheduleOnce(..., 0)
→ _safeLayoutUpdate
→ lateUpdate dirty compensation
→ Render
```

## 4. BasePanel Implementation

Added shared state:

```ts
protected _layoutDirty = true;
```

Added lifecycle integration:

```ts
onLoad(): void {
  this.markLayoutDirty();
  this._detectSceneOverride();
  this.registerEvents();
}

protected start(): void {
  this.scheduleOnce(() => {
    this._safeLayoutUpdate();
  }, 0);
}

protected lateUpdate(): void {
  if (this._layoutDirty) {
    this._safeLayoutUpdate();
  }
}
```

Added standard update API:

```ts
protected markLayoutDirty(): void {
  this._layoutDirty = true;
}

protected _safeLayoutUpdate(): void {
  const rootLayout = this.node.getComponent(Layout);
  rootLayout?.updateLayout();

  const layouts = this.node.getComponentsInChildren(Layout);
  layouts.forEach((layout) => layout.updateLayout());

  const ui = this.node.getComponent(UITransform);
  if (ui) {
    const size = ui.contentSize;
    ui.setContentSize(size.width, size.height);
  }

  this._layoutDirty = false;
}
```

Added override warning:

```ts
private _detectSceneOverride(): void {
  const ui = this.node.getComponent(UITransform);
  const widget = this.node.getComponent(Widget);

  if (!ui || !widget) return;

  const size = ui.contentSize;
  if (size.width > 2000 || size.height > 2000) {
    console.warn('[UI WARNING] Scene override detected', this.node?.name);
  }
}
```

## 5. EquipmentPanel Integration

Implemented in:

```text
assets/scripts/ui/EquipmentPanel.ts
```

Changes:

- `start()` now calls `super.start()`.
- Dynamic slot render calls `markLayoutDirty()` after direct Layout update.
- Step12A4 emergency root fix is preserved as EquipmentPanel-specific hardening.

Final EquipmentPanel startup:

```text
BasePanel.scheduleOnce(_safeLayoutUpdate)
EquipmentPanel.scheduleOnce(_forceLayoutRebuild)
```

EquipmentPanel-specific root guard:

```text
rootLayout.updateLayout()
childLayout.updateLayout()
UITransform.setContentSize(720, 1280)
```

## 6. EquipmentBagPanel Integration

Implemented in:

```text
assets/scripts/ui/EquipmentBagPanel.ts
```

Changes:

- `start()` now calls `super.start()`.
- Dynamic list refresh calls `markLayoutDirty()` after direct content Layout update.

## 7. Scene / Prefab Boundary

Prefab owns:

```text
UI structure
Anchor
Widget rules
Layout rules
Default size
```

Scene owns:

```text
Node mounting
Runtime references
Bootstrap / Mediator links
```

Scene must not own:

```text
UITransform size
Widget alignFlags
slotContainer position
Layout spacing
Layout padding
```

## 8. Verification

Performed:

```text
BasePanel standard pipeline audit: PASS
All BasePanel subclass onLoad super-call audit: PASS
EquipmentPanel custom start super-call: PASS
EquipmentBagPanel custom start super-call: PASS
Dynamic slot/list dirty marking: PASS
Phase10Main.scene JSON parse: PASS
```

TypeScript compile:

```text
Not run: local typescript package is not installed.
```

## 9. Acceptance Mapping

| Acceptance | Standardization coverage |
|---|---|
| 青锋剑首屏可见 | EquipmentPanel y=-180 + child layout rebuild + dirty compensation |
| 无需拖动触发显示 | start scheduleOnce + lateUpdate dirty fallback |
| 无黑色遮挡区域 | Scene override cleanup from Step12A4 remains active |
| Layout 自动稳定 | BasePanel `_safeLayoutUpdate()` |
| Prefab 修改立即生效 | Scene no longer treated as layout source by rule |
| 720 x 1280 正确 | EquipmentPanel root guard preserves 720 x 1280 |

## 10. Final Conclusion

```text
Step12B establishes the shared Runtime Layout Pipeline.
Future UI panels must inherit BasePanel, call super.onLoad(), and call super.start() when overriding start().
Any dynamic child creation must call markLayoutDirty().
```

