import { Node } from 'cc';

export class UIRenderSync {
  private static _inited = false;
  private queue: Node[] = [];

  static init(): void {
    if (this._inited) return;
    this._inited = true;
  }

  commit(node: Node): void {
    if (!this.queue.includes(node)) {
      this.queue.push(node);
    }
    console.log('[UIRenderSync] queued', node.name);
  }

  flush(): void {
    console.log('[UI-TEST] RenderSync.flush executed');
    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue.splice(0, this.queue.length);
    console.log('[UIRenderSync] flush', batch.map((node) => node.name));
  }
}
