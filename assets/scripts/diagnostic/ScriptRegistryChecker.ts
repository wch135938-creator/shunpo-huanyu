import { Component, director, Node } from 'cc';

export interface ScriptRegistryReport {
  componentCount: number;
  anonymousComponents: string[];
  disabledComponents: string[];
}

export class ScriptRegistryChecker {
  static check(): ScriptRegistryReport {
    const scene = director.getScene();
    const report: ScriptRegistryReport = {
      componentCount: 0,
      anonymousComponents: [],
      disabledComponents: [],
    };

    if (!scene) {
      console.warn('[UIDIAG] ScriptRegistryChecker no active scene');
      return report;
    }

    this.walk(scene, (node) => {
      for (const component of node.getComponents(Component)) {
        if (!component) {
          report.anonymousComponents.push(`${node.name}:<null-component>`);
          continue;
        }

        report.componentCount++;
        const name = this.getComponentName(component);
        if (!name || name === 'Component') {
          report.anonymousComponents.push(`${node.name}:${name || '<anonymous>'}`);
        }
        if (!component.enabled) {
          report.disabledComponents.push(`${node.name}:${name}`);
        }
      }
    });

    console.log('[UIDIAG] ScriptRegistryChecker report', report);
    return report;
  }

  private static getComponentName(component: Component): string {
    return component.constructor?.name ?? '';
  }

  private static walk(node: Node, visit: (node: Node) => void): void {
    visit(node);
    for (const child of node.children) {
      this.walk(child, visit);
    }
  }
}
