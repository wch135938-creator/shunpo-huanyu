import { CanvasDupDetector } from './CanvasDupDetector';
import { PrefabDriftDetector } from './PrefabDriftDetector';
import { SceneIntegrityScanner } from './SceneIntegrityScanner';
import { ScriptRegistryChecker } from './ScriptRegistryChecker';
import { UIBindingTracer } from './UIBindingTracer';

console.log('[UIDIAG FILE LOADED]');

type PrefabRegistryHost = typeof globalThis & {
  __PREFAB_REGISTRY__?: Record<string, unknown>;
};

export class UIDiagnosticCore {
  private static _initialized = false;

  static init(): void {
    const host = globalThis as PrefabRegistryHost;
    host.__PREFAB_REGISTRY__ ??= {};
    this._initialized = true;
    console.log('[UIDIAG] UIDiagnosticCore initialized');
  }

  static scanScene(): void {
    this.ensureInit();
    console.log('[UIDIAG] scanScene start');
    SceneIntegrityScanner.scan();
    PrefabDriftDetector.scan();
  }

  static checkScripts(): void {
    this.ensureInit();
    console.log('[UIDIAG] checkScripts start');
    ScriptRegistryChecker.check();
  }

  static checkCanvas(): void {
    this.ensureInit();
    console.log('[UIDIAG] checkCanvas start');
    CanvasDupDetector.check();
  }

  static traceUI(): void {
    this.ensureInit();
    console.log('[UIDIAG] traceUI start');
    UIBindingTracer.trace();
  }

  private static ensureInit(): void {
    if (!this._initialized) {
      this.init();
    }
  }
}
