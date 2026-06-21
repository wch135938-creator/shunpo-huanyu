import { Node } from 'cc';
import type { UIDirtyMeta } from '../../core/UIKernel';

export class UILayoutEngine {
  private static _inited = false;
  private previousState = new Map<string, string>();

  static init(): void {
    if (this._inited) return;
    this._inited = true;
  }

  compute(node: Node): void {
    console.log(`[UI-TEST] LayoutEngine.compute: ${node.name}`);
    console.log('[UILayoutEngine] compute', node.name);
  }

  diff(node: Node, dirtyMap: Map<string, UIDirtyMeta>): void {
    const nodeId = this._getNodeId(node);
    const dirty = dirtyMap.get(nodeId);
    if (!dirty) {
      return;
    }

    const chain = this._collectParentChain(node);
    const currentState = this._snapshot(node, dirty);
    const previousState = this.previousState.get(nodeId);

    if (previousState !== currentState) {
      console.log('[UILayoutEngine] diff', {
        nodeId,
        source: dirty.source,
        chain,
      });
      this.previousState.set(nodeId, currentState);
    }
  }

  private _collectParentChain(node: Node): string[] {
    const chain: string[] = [];
    let current: Node | null = node;

    while (current) {
      chain.push(this._getNodeId(current));
      current = current.parent;
    }

    return chain;
  }

  private _snapshot(node: Node, dirty: UIDirtyMeta): string {
    return `${this._getNodeId(node)}:${node.name}:${dirty.source}:${dirty.timestamp}`;
  }

  private _getNodeId(node: Node): string {
    const nodeWithUuid = node as Node & { uuid?: string };
    return nodeWithUuid.uuid || node.name;
  }
}
