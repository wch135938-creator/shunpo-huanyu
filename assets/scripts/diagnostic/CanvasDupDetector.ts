import { Canvas, director, Node } from 'cc';

export interface CanvasDupReport {
  canvasCount: number;
  canvasPaths: string[];
}

export class CanvasDupDetector {
  static check(): CanvasDupReport {
    const scene = director.getScene();
    const report: CanvasDupReport = {
      canvasCount: 0,
      canvasPaths: [],
    };

    if (!scene) {
      console.warn('[UIDIAG] CanvasDupDetector no active scene');
      return report;
    }

    this.walk(scene, (node, path) => {
      if (node.getComponent(Canvas)) {
        report.canvasCount++;
        report.canvasPaths.push(path);
      }
    });

    if (report.canvasCount > 1) {
      console.warn('[UIDIAG] CanvasDupDetector duplicate Canvas detected', report);
    } else {
      console.log('[UIDIAG] CanvasDupDetector report', report);
    }

    return report;
  }

  private static walk(node: Node, visit: (node: Node, path: string) => void, basePath = ''): void {
    const path = basePath ? `${basePath}/${node.name}` : node.name;
    visit(node, path);
    for (const child of node.children) {
      this.walk(child, visit, path);
    }
  }
}
