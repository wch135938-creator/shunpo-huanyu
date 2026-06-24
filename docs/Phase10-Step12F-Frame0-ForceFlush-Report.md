# Phase10-Step12F Frame-0 Force Flush Report

## 1. Goal

Continue Step12 UIEngine v1 from latest `master` and implement the required first-frame full render path.

Target SOP:

```text
SOP-UI-05 Frame-0 强制渲染验证
```

Required chain:

```text
Prefab Init -> Layout Compute -> Render Flush
```

## 2. Files Changed

```text
assets/scripts/bootstrap/Phase10MainBootstrap.ts
assets/scripts/core/UIKernel.ts
assets/scripts/ui/engine/UILayoutEngine.ts
assets/scripts/ui/engine/UIRenderSync.ts
assets/scenes/Phase10Main-Clean.scene
assets/scenes/Phase10Main-Clean.scene.meta
```

## 3. Implementation

`UIKernel.updateUI()` now treats `PREFAB_INIT` as the initialization full-pass source:

```text
PREFAB_INIT
-> UIOverrideGuard.check
-> UILayoutEngine.compute
-> UIRenderSync.commit
-> UIRenderSync.flush
```

Runtime sources still use the existing incremental path:

```text
DATA_BIND / RUNTIME_UPDATE / USER_ACTION
-> UIOverrideGuard.check
-> UILayoutEngine.diff
-> UIRenderSync.commit
-> scheduled flushFrame
```

`Phase10Main-Clean.scene` was removed so `Phase10Main.scene` is the only remaining Phase10 scene in `assets/scenes`.

## 4. SOP Logs Added

```text
[SOP-UI-01] PREFAB_INIT
[SOP-UI-02] LAYOUT_DIFF
[SOP-UI-03] LAYOUT_COMPUTE
[SOP-UI-03] RENDER_FLUSH
[SOP-UI-05] FRAME_0_FORCE_FLUSH
```

## 5. Verification Status

Performed:

```text
GitHub origin/master fetch: PASS
Local master equals origin/master: PASS
Step12 system file read: PASS
SOP startup file read: PASS
Code diff review: PASS
Whitespace diff check: PASS
```

Not performed:

```text
TypeScript compile: local node_modules does not include tsc.
Cocos Creator Preview runtime verification: not available from this shell session.
```

## 6. Notes

`AGENTS.md` requires `docs/AI-OS-v1-Step12.system.md`, but the repository currently contains `docs/AI-OS-v1-Step12.md`. The available Step12 system file was loaded and followed.

The working tree already had a local deletion before this step:

```text
assets/scenes/Phase8Main.scene
```

This Step12F change did not restore, delete, or modify that scene state.
