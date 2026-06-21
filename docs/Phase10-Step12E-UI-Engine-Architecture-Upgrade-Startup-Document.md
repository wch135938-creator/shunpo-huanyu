# Phase10-Step12E UI Engine Architecture Upgrade Startup Document

## 1. Goal

Upgrade the Step12D monolithic `UIKernel` into a first-stage UIEngine architecture:

```text
UIOverrideGuard + UILayoutEngine + UIRenderSync
```

This step is intentionally conservative. It creates the module boundaries and dirty tracking, without implementing Layout Diff or render optimization.

## 2. Files Added

```text
assets/scripts/ui/engine/UIOverrideGuard.ts
assets/scripts/ui/engine/UILayoutEngine.ts
assets/scripts/ui/engine/UIRenderSync.ts
assets/scripts/ui/engine.meta
```

Each TypeScript file has a `.meta` file.

## 3. UIOverrideGuard

File:

```text
assets/scripts/ui/engine/UIOverrideGuard.ts
```

Responsibility:

```text
Detect Scene/UI pollution and warn only.
```

Allowed behavior:

- Read `UITransform`, `Widget`, and `Layout` state.
- Detect suspicious size or anchor state.
- Record warning in an internal array.
- Print `console.warn`.

Forbidden behavior:

- No repair.
- No blocking.
- No `setContentSize`.
- No `updateLayout`.
- No transform mutation.

## 4. UILayoutEngine

File:

```text
assets/scripts/ui/engine/UILayoutEngine.ts
```

Current first-stage behavior:

```ts
compute(node: Node): void {
  console.log('[UILayoutEngine] compute', node.name);
}
```

Forbidden in Step12E:

- No direct `UITransform` mutation.
- No full `updateLayout`.
- No Layout Diff implementation yet.

## 5. UIRenderSync

File:

```text
assets/scripts/ui/engine/UIRenderSync.ts
```

Current first-stage behavior:

```ts
commit(node: Node): void {
  console.log('[UIRenderSync] commit', node.name);
}
```

Forbidden in Step12E:

- No layout logic.
- No transform logic.
- No render optimization yet.

## 6. UIKernel Downgrade

File:

```text
assets/scripts/core/UIKernel.ts
```

`UIKernel` is now a pure scheduler.

Allowed public entries:

```text
init()
updateUI(node, data)
```

Current execution:

```text
updateUI
→ recordDirty
→ UIOverrideGuard.check
→ UILayoutEngine.compute
→ UIRenderSync.commit
```

Removed from UIKernel:

```text
stabilize()
forceLayout()
fixSceneOverride()
UITransform mutation
Widget mutation
updateLayout()
setContentSize()
```

## 7. Dirty Tracking

Implemented in:

```text
assets/scripts/core/UIKernel.ts
```

Dirty meta:

```ts
export interface UIDirtyMeta {
  nodeId: string;
  source: UIDirtySource;
  timestamp: number;
}
```

Sources:

```text
PREFAB_INIT
DATA_BIND
RUNTIME_UPDATE
USER_ACTION
```

Current Step12E behavior:

```text
Array record + console.log only.
No diff optimization.
```

## 8. BasePanel Responsibility Reduction

File:

```text
assets/scripts/core/BasePanel.ts
```

BasePanel now only triggers UIKernel lifecycle requests:

```text
onLoad: UIKernel.init + UIKernel.updateUI(PREFAB_INIT)
start: scheduleOnce UIKernel.updateUI(RUNTIME_UPDATE)
lateUpdate: dirty compensation via UIKernel.updateUI(pending source)
show: markLayoutDirty(USER_ACTION)
```

Removed from BasePanel:

```text
Layout calculation
UITransform mutation
full updateLayout
Scene override repair
```

## 9. Runtime Data Integration

Files:

```text
assets/scripts/ui/EquipmentPanel.ts
assets/scripts/ui/EquipmentBagPanel.ts
```

Changes:

- Dynamic equipment slot render now records `markLayoutDirty('DATA_BIND')`.
- Dynamic bag list render now records `markLayoutDirty('DATA_BIND')`.
- Direct `Layout.updateLayout()` calls were removed from these two flows.
- EquipmentPanel no longer imports or calls old `UIKernel.stabilize()`.

## 10. Standard Execution Chain

Step12E chain:

```text
Prefab instantiate
→ BasePanel.onLoad
→ UIKernel.updateUI(PREFAB_INIT)
→ UIOverrideGuard.check
→ UILayoutEngine.compute
→ UIRenderSync.commit
→ BasePanel.start
→ UIKernel.updateUI(RUNTIME_UPDATE)
→ BasePanel.lateUpdate dirty compensation
```

## 11. Verification

Performed:

```text
UIEngine three modules present: PASS
UIEngine meta files present: PASS
UIKernel has init/updateUI scheduler path: PASS
UIKernel no longer imports UITransform/Widget/Layout: PASS
UIKernel no longer calls updateLayout/setContentSize: PASS
BasePanel no longer performs layout/transform work: PASS
EquipmentPanel no longer calls UIKernel.stabilize: PASS
EquipmentPanel/EquipmentBagPanel no longer call direct updateLayout in data refresh: PASS
Dirty source records: PASS
Phase10Main.scene JSON parse: PASS
```

Not performed:

```text
TypeScript compile: local typescript package is not installed.
Cocos Creator Preview visual validation: editor preview is unavailable in this command environment.
```

## 12. Final Conclusion

```text
Step12E completes the first UIEngine split.
UIKernel is now a scheduler, UIOverrideGuard detects only, UILayoutEngine reserves compute, and UIRenderSync reserves commit.
Dirty tracking exists but does not optimize.
Layout Diff and render optimization are explicitly deferred to Step12F.
```

