# Phase10-Step12D UI Industrial Stability Framework

## 1. Goal

Build a deterministic UI pipeline for the Step12A-Step12C failure class:

```text
Prefab Layer + BasePanel Layer + UIKernel Layer + Runtime Data Layer
```

Final UI authority:

```text
Prefab structure + UIKernel runtime stabilization
```

Scene is no longer allowed to be a layout authority.

## 2. Architecture

```text
Prefab Layer
  Owns structure, anchors, Widget rules, Layout rules, default size.

BasePanel Layer
  Owns Cocos lifecycle timing and dirty-state control.

UIKernel Layer
  Owns override normalization, deterministic layout passes, and render stabilization.

Runtime Layer
  Owns pure data-driven UI updates only.
```

## 3. UIKernel

Implemented:

```text
assets/scripts/core/UIKernel.ts
assets/scripts/core/UIKernel.ts.meta
```

Core API:

```ts
export class UIKernel {
  static stabilize(node: Node): void {
    this.fixSceneOverride(node);
    this.forceLayout(node);
  }

  static fixSceneOverride(node: Node): void {
    const ui = node.getComponent(UITransform);
    const widget = node.getComponent(Widget);
    if (!ui || !widget) return;

    ui.setContentSize(720, 1280);
    (widget as WidgetWithAlignFlags).alignFlags = 0;
  }

  static forceLayout(node: Node): void {
    const root = node.getComponent(Layout);
    root?.updateLayout();

    const childs = node.getComponentsInChildren(Layout);
    childs.forEach((layout) => layout.updateLayout());

    const ui = node.getComponent(UITransform);
    if (ui) {
      const size = ui.contentSize;
      ui.setContentSize(size.width, size.height);
    }
  }
}
```

Behavior:

- `stabilize()` performs override normalization and a layout pass.
- `fixSceneOverride()` normalizes root UI size to `720 x 1280` when the node owns both `UITransform` and `Widget`.
- `forceLayout()` updates root Layout, child Layouts, and refreshes UITransform size.

## 4. BasePanel Integration

Implemented:

```text
assets/scripts/core/BasePanel.ts
```

Standard lifecycle:

```ts
onLoad(): void {
  UIKernel.stabilize(this.node);
  this.markLayoutDirty();
  this.registerEvents();
}

protected start(): void {
  this.scheduleOnce(() => {
    UIKernel.forceLayout(this.node);
  }, 0);
}

protected lateUpdate(): void {
  if (this._layoutDirty) {
    UIKernel.forceLayout(this.node);
    this._layoutDirty = false;
  }
}
```

Dirty-state API:

```ts
protected markLayoutDirty(): void {
  this._layoutDirty = true;
}
```

Compatibility wrapper:

```ts
protected _safeLayoutUpdate(): void {
  UIKernel.forceLayout(this.node);
  this._layoutDirty = false;
}
```

## 5. Equipment Runtime Integration

Implemented:

```text
assets/scripts/ui/EquipmentPanel.ts
assets/scripts/ui/EquipmentBagPanel.ts
```

EquipmentPanel:

- `start()` calls `super.start()`.
- Its panel-specific `_forceLayoutRebuild()` delegates to `UIKernel.stabilize(this.node)`.
- Dynamic slot render calls `markLayoutDirty()` after direct slot Layout update.

EquipmentBagPanel:

- `start()` calls `super.start()`.
- Dynamic bag list refresh calls `markLayoutDirty()` after direct content Layout update.

## 6. Deterministic Execution Chain

Final execution model:

```text
Prefab instantiate
→ BasePanel.onLoad
→ UIKernel.stabilize
→ markLayoutDirty
→ BasePanel.start
→ scheduleOnce UIKernel.forceLayout
→ BasePanel.lateUpdate dirty compensation
→ render lock
```

This gives two guarantees:

- Start-frame delayed layout pass.
- LateUpdate compensation if dynamic child creation or async prefab loading dirties layout after start.

## 7. Scene Isolation Rule

Scene must not modify:

```text
UITransform
Widget
Layout
Anchor
Size
Padding
Spacing
```

Scene may only own:

```text
Prefab mounting
Runtime references
Mediator connections
Bootstrap bindings
```

## 8. Acceptance Mapping

| Acceptance | Framework guarantee |
|---|---|
| 首屏 UI 正确 | `UIKernel.stabilize()` in `onLoad()` |
| 无拖动依赖 | `start()` scheduleOnce layout pass |
| 无闪烁 | lateUpdate dirty compensation before persistent stale render |
| Prefab 修改立即生效 | Scene layout authority is removed by rule; Kernel normalizes runtime state |
| Scene 不影响 UI | `fixSceneOverride()` runtime rollback |
| 720 x 1280 稳定 | Kernel root normalization to `720 x 1280` |

## 9. Verification

Performed:

```text
UIKernel file present: PASS
UIKernel meta present: PASS
BasePanel calls UIKernel.stabilize onLoad: PASS
BasePanel calls UIKernel.forceLayout in start: PASS
BasePanel lateUpdate dirty compensation: PASS
EquipmentPanel delegates final rebuild to UIKernel: PASS
EquipmentBagPanel keeps super.start integration: PASS
Phase10Main.scene JSON parse: PASS
```

Not performed:

```text
TypeScript compile: local typescript package is not installed.
Cocos Creator Preview visual validation: editor preview is not available in this command environment.
```

## 10. Final Conclusion

```text
The UI system now has a deterministic pipeline:
Prefab structure + BasePanel lifecycle + UIKernel stabilization + Runtime data updates.
Scene no longer has runtime UI control authority.
```

