import { Node } from 'cc';
import { UIOverrideGuard, UIOverrideLevel } from '../ui/engine/UIOverrideGuard';
import { UILayoutEngine } from '../ui/engine/UILayoutEngine';
import { UIRenderSync } from '../ui/engine/UIRenderSync';

export type UIDirtySource = 'PREFAB_INIT' | 'DATA_BIND' | 'RUNTIME_UPDATE' | 'USER_ACTION';

export interface UIDirtyMeta {
  nodeId: string;
  source: UIDirtySource;
  timestamp: number;
}

export class UIKernel {
  private static overrideGuard: UIOverrideGuard | null = null;
  private static layoutEngine: UILayoutEngine | null = null;
  private static renderSync: UIRenderSync | null = null;
  private static dirtyMap = new Map<string, UIDirtyMeta>();
  private static initialized = false;

  static init(): void {
    if (this.initialized) return;

    this.overrideGuard = new UIOverrideGuard();
    this.layoutEngine = new UILayoutEngine();
    this.renderSync = new UIRenderSync();
    this.initialized = true;
  }

  static updateUI(node: Node, data?: { source?: UIDirtySource }): void {
    console.log('[UI-TEST] updateUI entered');
    this.init();

    const source = data?.source ?? 'RUNTIME_UPDATE';
    const nodeId = this.getNodeId(node);
    const meta: UIDirtyMeta = {
      nodeId,
      source,
      timestamp: Date.now(),
    };

    this.setDirty(nodeId, meta);
    const level = this.overrideGuard?.check(node) ?? UIOverrideLevel.LEVEL_1_WARN;
    if (level !== UIOverrideLevel.LEVEL_3_BLOCK) {
      this.layoutEngine?.diff(node, this.dirtyMap);
    }
    this.renderSync?.commit(node);
    this.clearDirty(nodeId);
  }

  static flushFrame(): void {
    this.init();
    this.renderSync?.flush();
  }

  static setDirty(nodeId: string, meta: UIDirtyMeta): void {
    this.dirtyMap.set(nodeId, meta);
    console.log('[UIKernel] dirty', meta);
  }

  static getDirty(nodeId: string): UIDirtyMeta | undefined {
    return this.dirtyMap.get(nodeId);
  }

  static clearDirty(nodeId: string): void {
    this.dirtyMap.delete(nodeId);
  }

  private static getNodeId(node: Node): string {
    const nodeWithUuid = node as Node & { uuid?: string };
    return nodeWithUuid.uuid || node.name;
  }
}
