import { director, Node, UITransform, Widget } from 'cc';

type PrefabRegistryHost = typeof globalThis & {
  __PREFAB_REGISTRY__?: Record<string, unknown>;
};

export interface PrefabDriftReport {
  registryKeys: string[];
  scannedNodes: number;
  suspectedOverrides: string[];
}

export class PrefabDriftDetector {
  static scan(): PrefabDriftReport {
    const registry = ((globalThis as PrefabRegistryHost).__PREFAB_REGISTRY__ ??= {});
    const scene = director.getScene();
    const report: PrefabDriftReport = {
      registryKeys: Object.keys(registry),
      scannedNodes: 0,
      suspectedOverrides: [],
    };

    if (!scene) {
      console.warn('[UIDIAG] PrefabDriftDetector no active scene');
      return report;
    }

    this.walk(scene, (node) => {
      report.scannedNodes++;
      const ui = node.getComponent(UITransform);
      const widget = node.getComponent(Widget);
      if (!ui || !widget) return;

      const size = ui.contentSize;
      const looksLikeHorizontalPanel = size.width > size.height && size.width >= 1000;
      if (looksLikeHorizontalPanel) {
        report.suspectedOverrides.push(`${node.name}:${size.width}x${size.height}`);
      }
    });

    console.log('[UIDIAG] PrefabDriftDetector report', report);
    return report;
  }

  private static walk(node: Node, visit: (node: Node) => void): void {
    visit(node);
    for (const child of node.children) {
      this.walk(child, visit);
    }
  }
}
