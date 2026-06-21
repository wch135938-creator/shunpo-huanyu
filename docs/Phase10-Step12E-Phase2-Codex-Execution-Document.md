# Phase10-Step12E Phase2 Codex Execution Document

## 1. Goal

Upgrade UIEngine v0 into UIEngine v1:

```text
Dirty Tracking Map
UILayoutEngine Diff
UIOverrideGuard Level Blocking
UIRenderSync Frame Batch
UIKernel Scheduler Only
```

## 2. Dirty Tracking Map

File:

```text
assets/scripts/core/UIKernel.ts
```

Changed from:

```text
Array<UIDirtyMeta>
```

To:

```ts
private static dirtyMap = new Map<string, UIDirtyMeta>();
```

Added API:

```ts
static setDirty(nodeId: string, meta: UIDirtyMeta): void
static getDirty(nodeId: string): UIDirtyMeta | undefined
static clearDirty(nodeId: string): void
```

Behavior:

- `nodeId` is the unique key.
- New dirty meta overwrites previous dirty meta.
- Array accumulation mode is removed.

## 3. UILayoutEngine Diff

File:

```text
assets/scripts/ui/engine/UILayoutEngine.ts
```

Added:

```ts
diff(node: Node, dirtyMap: Map<string, UIDirtyMeta>): void
```

Behavior:

- Filters non-dirty nodes by checking `dirtyMap.get(nodeId)`.
- Processes only the dirty node and its parent chain.
- Tracks previous state in `previousState`.
- Does not traverse the full tree.
- Does not call `updateLayout()`.

## 4. UIOverrideGuard Level Blocking

File:

```text
assets/scripts/ui/engine/UIOverrideGuard.ts
```

Added:

```ts
export enum UIOverrideLevel {
  LEVEL_1_WARN = 1,
  LEVEL_2_IGNORE = 2,
  LEVEL_3_BLOCK = 3,
}
```

`check(node)` now returns:

```text
1 / 2 / 3
```

Blocking behavior:

- `LEVEL_3_BLOCK` prevents `UILayoutEngine.diff()` from running.
- `LEVEL_1_WARN` and `LEVEL_2_IGNORE` log only.
- Guard does not mutate UI state.

## 5. UIRenderSync Frame Batch

File:

```text
assets/scripts/ui/engine/UIRenderSync.ts
```

Added queue:

```ts
private queue: Node[] = [];
```

Behavior:

- `commit(node)` only queues the node.
- `flush()` drains the queue as a batch.
- Immediate render execution was removed.

Frame flush integration:

```text
BasePanel.start scheduleOnce -> UIKernel.flushFrame()
BasePanel.lateUpdate -> UIKernel.flushFrame()
```

## 6. UIKernel Scheduler Validation

File:

```text
assets/scripts/core/UIKernel.ts
```

Current chain:

```text
updateUI
→ setDirty
→ UIOverrideGuard.check
→ if not LEVEL_3: UILayoutEngine.diff
→ UIRenderSync.commit
→ clearDirty
```

Frame batch:

```text
flushFrame
→ UIRenderSync.flush
```

UIKernel no longer contains:

```text
layout calculation
render logic
transform operation
updateLayout
setContentSize
stabilize
forceLayout
fixSceneOverride
```

## 7. BasePanel Integration

File:

```text
assets/scripts/core/BasePanel.ts
```

Behavior:

- `onLoad` sends `PREFAB_INIT`.
- `show` marks `USER_ACTION`.
- Equipment data changes mark `DATA_BIND`.
- `start` and `lateUpdate` drive scheduler and frame flush.
- BasePanel does not calculate layout.

## 8. Equipment UI Integration

Files:

```text
assets/scripts/ui/EquipmentPanel.ts
assets/scripts/ui/EquipmentBagPanel.ts
```

Behavior:

- Dynamic equipment slot updates call `markLayoutDirty('DATA_BIND')`.
- Dynamic bag list updates call `markLayoutDirty('DATA_BIND')`.
- Direct `Layout.updateLayout()` calls were removed from these refresh paths.

Note:

```text
Existing _ensureBlock visual background helpers still create UITransform-backed background blocks.
They are not part of UIKernel/BasePanel/UIEngine layout scheduling.
```

## 9. Verification

Performed:

```text
Dirty Map structure: PASS
setDirty/getDirty/clearDirty API: PASS
Layout diff dirty filter: PASS
Dirty node + parent chain only: PASS
No full updateLayout in UIEngine/UIKernel/BasePanel: PASS
OverrideGuard level return: PASS
LEVEL_3 blocks UILayoutEngine.diff: PASS
RenderSync queue + flush: PASS
UIKernel remains scheduler only: PASS
Equipment data refresh marks DATA_BIND: PASS
Phase10Main.scene JSON parse: PASS
```

Not performed:

```text
TypeScript compile: local typescript package is not installed.
Cocos Creator Preview visual validation: editor preview is unavailable in this command environment.
```

## 10. Final Conclusion

```text
UIEngine is upgraded to v1 incremental architecture:
Dirty Tracking Map + Layout Diff + Render Frame Batch + Override Level Blocking.
Step12F can now build real Layout Diff optimization on top of this foundation.
```

