import { Layout, Node, UITransform, Widget } from 'cc';

export enum UIOverrideLevel {
  LEVEL_1_WARN = 1,
  LEVEL_2_IGNORE = 2,
  LEVEL_3_BLOCK = 3,
}

export class UIOverrideGuard {
  private static _inited = false;
  private _warnings: string[] = [];

  static init(): void {
    if (this._inited) return;
    this._inited = true;
  }

  check(node: Node): number {
    const ui = node.getComponent(UITransform);
    const widget = node.getComponent(Widget);
    const layout = node.getComponent(Layout);

    if (!ui && !widget && !layout) {
      return UIOverrideLevel.LEVEL_1_WARN;
    }

    const size = ui?.contentSize;
    const suspiciousSize = !!size && (
      size.width <= 0 ||
      size.height <= 0 ||
      size.width > 2000 ||
      size.height > 2000
    );
    const suspiciousAnchor = !!ui && (
      ui.anchorPoint.x < 0 ||
      ui.anchorPoint.x > 1 ||
      ui.anchorPoint.y < 0 ||
      ui.anchorPoint.y > 1
    );
    const blockedLayout = !!layout && !layout.enabled;

    if (blockedLayout || suspiciousAnchor) {
      const message = `[UIOverrideGuard] LEVEL_3 block: ${node.name}`;
      this._warnings.push(message);
      console.warn(message);
      return UIOverrideLevel.LEVEL_3_BLOCK;
    }

    if (suspiciousSize) {
      const message = `[UIOverrideGuard] LEVEL_2 ignore: ${node.name}`;
      this._warnings.push(message);
      console.warn(message);
      return UIOverrideLevel.LEVEL_2_IGNORE;
    }

    if (ui || widget || layout) {
      console.warn(`[UIOverrideGuard] LEVEL_1 warn: ${node.name}`);
    }

    return UIOverrideLevel.LEVEL_1_WARN;
  }
}
