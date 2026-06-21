import { director, Layout, Node, UITransform, Widget } from 'cc';

export interface SceneIntegrityReport {
  sceneName: string;
  nodeCount: number;
  uiTransformCount: number;
  widgetCount: number;
  layoutCount: number;
  warnings: string[];
}

export class SceneIntegrityScanner {
  static scan(): SceneIntegrityReport {
    const scene = director.getScene();
    const report: SceneIntegrityReport = {
      sceneName: scene?.name ?? '<no-scene>',
      nodeCount: 0,
      uiTransformCount: 0,
      widgetCount: 0,
      layoutCount: 0,
      warnings: [],
    };

    if (!scene) {
      report.warnings.push('No active scene');
      console.warn('[UIDIAG] SceneIntegrityScanner no active scene');
      return report;
    }

    this.walk(scene, (node) => {
      report.nodeCount++;

      const ui = node.getComponent(UITransform);
      if (ui) {
        report.uiTransformCount++;
        const size = ui.contentSize;
        if (size.width <= 0 || size.height <= 0 || size.width > 2000 || size.height > 2000) {
          report.warnings.push(`Suspicious UITransform size on ${node.name}: ${size.width}x${size.height}`);
        }
      }

      if (node.getComponent(Widget)) {
        report.widgetCount++;
      }

      if (node.getComponent(Layout)) {
        report.layoutCount++;
      }
    });

    console.log('[UIDIAG] SceneIntegrityScanner report', report);
    return report;
  }

  private static walk(node: Node, visit: (node: Node) => void): void {
    visit(node);
    for (const child of node.children) {
      this.walk(child, visit);
    }
  }
}
