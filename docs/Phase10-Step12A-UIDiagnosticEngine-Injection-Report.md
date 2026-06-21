# Phase10-Step12A UIDiagnostic Engine Injection Report

## 1. Scope

Project:

```text
D:\My Project\TestGame
```

Task:

```text
Inject a read-only UI diagnostic engine.
No prefab or scene structure changes.
No business logic changes.
No automatic repair.
```

## 2. Created Files

```text
assets/scripts/diagnostic.meta
assets/scripts/diagnostic/UIDiagnosticCore.ts
assets/scripts/diagnostic/UIDiagnosticCore.ts.meta
assets/scripts/diagnostic/SceneIntegrityScanner.ts
assets/scripts/diagnostic/SceneIntegrityScanner.ts.meta
assets/scripts/diagnostic/PrefabDriftDetector.ts
assets/scripts/diagnostic/PrefabDriftDetector.ts.meta
assets/scripts/diagnostic/ScriptRegistryChecker.ts
assets/scripts/diagnostic/ScriptRegistryChecker.ts.meta
assets/scripts/diagnostic/CanvasDupDetector.ts
assets/scripts/diagnostic/CanvasDupDetector.ts.meta
assets/scripts/diagnostic/UIBindingTracer.ts
assets/scripts/diagnostic/UIBindingTracer.ts.meta
```

## 3. Modified Files

```text
assets/scripts/bootstrap/Phase10MainBootstrap.ts
```

Note:

```text
The project does not contain assets/scripts/Phase10Main.ts.
The active Phase10Main scene startup component is Phase10MainBootstrap.ts, so the diagnostic startup was injected there.
```

## 4. Startup Injection

Added import:

```ts
import { UIDiagnosticCore } from '../diagnostic/UIDiagnosticCore';
```

Added global registry:

```ts
globalThis.__PREFAB_REGISTRY__ = {}
```

Added diagnostic startup calls:

```ts
UIDiagnosticCore.init();
UIDiagnosticCore.scanScene();
UIDiagnosticCore.checkScripts();
UIDiagnosticCore.checkCanvas();
UIDiagnosticCore.traceUI();
```

## 5. Diagnostic Modules

### UIDiagnosticCore

Entry coordinator.

Exposes:

```text
init()
scanScene()
checkScripts()
checkCanvas()
traceUI()
```

### SceneIntegrityScanner

Read-only scene scan:

```text
node count
UITransform count
Widget count
Layout count
suspicious UITransform sizes
```

### PrefabDriftDetector

Read-only runtime drift scan:

```text
global registry keys
runtime UI nodes with suspicious horizontal panel sizing
```

### ScriptRegistryChecker

Read-only component scan:

```text
component count
anonymous component markers
disabled component markers
```

### CanvasDupDetector

Read-only Canvas scan:

```text
Canvas count
Canvas paths
duplicate Canvas warning
```

### UIBindingTracer

Read-only binding trace:

```text
component binding-like fields
bound keys
null keys
```

## 6. Console Prefix Rule

All diagnostic console output uses:

```text
[UIDIAG]
```

Expected console examples:

```text
[UIDIAG] UIDiagnosticCore initialized
[UIDIAG] scanScene start
[UIDIAG] SceneIntegrityScanner report ...
[UIDIAG] PrefabDriftDetector report ...
[UIDIAG] checkScripts start
[UIDIAG] ScriptRegistryChecker report ...
[UIDIAG] checkCanvas start
[UIDIAG] CanvasDupDetector report ...
[UIDIAG] traceUI start
[UIDIAG] UIBindingTracer report ...
```

## 7. Safety Constraints

Confirmed:

```text
No prefab files modified by this diagnostic injection.
No scene files modified by this diagnostic injection.
No automatic repair logic added.
No UI layout logic changed.
No business system logic changed.
```

The diagnostic engine only reads runtime state and prints logs.

## 8. Verification

Performed:

```text
Diagnostic directory exists: PASS
Six TypeScript modules exist: PASS
All diagnostic console output uses [UIDIAG]: PASS
Phase10MainBootstrap startup injection exists: PASS
globalThis.__PREFAB_REGISTRY__ initialization exists: PASS
Phase10Main.scene JSON parse: PASS
```

Not performed:

```text
TypeScript compile: local typescript package is not installed.
Cocos Creator Preview validation: editor preview is unavailable in this command environment.
```

## 9. Final Result

```text
Phase10-Step12A UI diagnostic engine injection is complete.
The system can now verify scene integrity, prefab drift signals, script registry state, Canvas duplication, and UI binding state through [UIDIAG] logs.
```

