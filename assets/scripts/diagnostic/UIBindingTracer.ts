import { Component, director, Node } from 'cc';

export interface UIBindingTraceEntry {
  nodePath: string;
  component: string;
  boundKeys: string[];
  nullKeys: string[];
}

export class UIBindingTracer {
  static trace(): UIBindingTraceEntry[] {
    const scene = director.getScene();
    const entries: UIBindingTraceEntry[] = [];

    if (!scene) {
      console.warn('[UIDIAG] UIBindingTracer no active scene');
      return entries;
    }

    this.walk(scene, (node, path) => {
      for (const component of node.getComponents(Component)) {
        if (!component) continue;

        const entry = this.traceComponent(component, path);
        if (entry.boundKeys.length > 0 || entry.nullKeys.length > 0) {
          entries.push(entry);
        }
      }
    });

    console.log('[UIDIAG] UIBindingTracer report', entries);
    return entries;
  }

  private static traceComponent(component: Component, nodePath: string): UIBindingTraceEntry {
    const record = component as unknown as Record<string, unknown>;
    const boundKeys: string[] = [];
    const nullKeys: string[] = [];

    for (const key of Object.keys(record)) {
      if (key.startsWith('_')) continue;

      const value = record[key];
      const looksLikeBinding = /node|panel|label|button|container|view|prefab|root/i.test(key);
      if (!looksLikeBinding) continue;

      if (value === null || value === undefined) {
        nullKeys.push(key);
      } else {
        boundKeys.push(key);
      }
    }

    return {
      nodePath,
      component: component.constructor?.name ?? '<anonymous>',
      boundKeys,
      nullKeys,
    };
  }

  private static walk(node: Node, visit: (node: Node, path: string) => void, basePath = ''): void {
    const path = basePath ? `${basePath}/${node.name}` : node.name;
    visit(node, path);
    for (const child of node.children) {
      this.walk(child, visit, path);
    }
  }
}
