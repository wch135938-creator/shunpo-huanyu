import { director, Node } from 'cc';
import { UIKernel } from '../core/UIKernel';
import { UIDiagnosticCore } from '../diagnostic/UIDiagnosticCore';
import { UIOverrideGuard } from './engine/UIOverrideGuard';
import { UILayoutEngine } from './engine/UILayoutEngine';
import { UIRenderSync } from './engine/UIRenderSync';

console.log("[BOOTSTRAP STEP 1]");

console.log("[UIENGINE] ENTER BOOTSTRAP");

console.log("🔥 UIENGINE FILE LOADED");

type UIEngineGlobal = typeof globalThis & {
    UIKernel?: typeof UIKernel;
    UIOverrideGuard?: typeof UIOverrideGuard;
    UILayoutEngine?: typeof UILayoutEngine;
    UIRenderSync?: typeof UIRenderSync;
    UIDiagnosticCore?: typeof UIDiagnosticCore;
};

export class UIEngine {

    private static _inited: boolean = false;
    private static _booting: boolean = false;

    public static bootstrap(): void {

        if (this._inited || this._booting) return;
        this._booting = true;

        try {

            console.log("[BOOTSTRAP STEP 1]");
            
            console.log('[UIDIAG] INIT UIEngine.bootstrap');

            console.log("[BOOTSTRAP STEP 2]");

            const host = globalThis as UIEngineGlobal;

            // 绑定全局
            host.UIKernel = UIKernel;
            host.UIOverrideGuard = UIOverrideGuard;
            host.UILayoutEngine = UILayoutEngine;
            host.UIRenderSync = UIRenderSync;
            host.UIDiagnosticCore = UIDiagnosticCore;

            console.log("[BOOTSTRAP HOST BIND COMPLETE]");

            // 初始化顺序（严格）
            console.log("[CHECK BEFORE] UIKernel =", UIKernel);
            
            console.log("[CHECK BEFORE] UIKernel.init =", UIKernel?.init);

            console.log("[CHECK BEFORE] UIKernel =", UIKernel);
            console.log("[CHECK BEFORE] UIKernel.init =", UIKernel?.init);

            try {
            UIKernel.init();
            } catch (e) {
            console.error("[UIKernel INIT ERROR]", e);
            }

            console.log("[CHECK AFTER] UIKernel =", UIKernel);
            console.log("[CHECK AFTER] UIKernel.init =", UIKernel?.init);
            
            console.log("[BOOTSTRAP EXIT REACHED]");

            UIOverrideGuard.init();
            console.log('[UIOverrideGuard] INIT OK');

            UILayoutEngine.init?.();
            console.log('[UILayoutEngine] INIT OK');

            UIRenderSync.init?.();
            console.log('[UIRenderSync] INIT OK');

            UIDiagnosticCore.init?.();
            console.log('[UIDIAG] READY');

            console.log("[CHECK] UIKernel =", UIKernel);


            console.log("[CHECK] UIKernel.init =", UIKernel?.init);

            this._inited = true;

            console.log('[UIEngine] BOOTSTRAP COMPLETE');

        } finally {
            this._booting = false;
        }
    }

    public static forceFrame0Flush(root?: Node | null): void {
        const target = root ?? this._findFrame0Target();
        if (!target) {
            console.warn('[UIEngine] FRAME_0_FORCE_FLUSH target missing');
            return;
        }

        UIKernel.updateUI(target, { source: 'PREFAB_INIT' });
    }

    private static _findFrame0Target(): Node | null {
        const scene = director.getScene();
        if (!scene) {
            return null;
        }

        return this._findNodeByName(scene, 'UIRoot')
            ?? this._findNodeByName(scene, 'Canvas')
            ?? scene;
    }

    private static _findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }

        for (const child of root.children) {
            const found = this._findNodeByName(child, name);
            if (found) {
                return found;
            }
        }

        return null;
    }
}
