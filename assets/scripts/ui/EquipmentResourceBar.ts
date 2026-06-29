// ============================================================
// EquipmentResourceBar.ts — 装备资源余额栏
// 职责：在装备主面板与详情面板复用，展示当前余额和操作后余额
// 边界：纯 UI，不修改 Inventory，不参与成本计算
// ============================================================

import {
  CCObject,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  UITransform,
  VerticalTextAlignment,
} from 'cc';

const RUNTIME_HIDE_FLAGS = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
const BAR_WIDTH = 520;
const BAR_HEIGHT = 50;
const ITEM_WIDTH = 168;

interface ResourceDisplayEntry {
  itemId: string;
  name: string;
  color: Color;
}

const RESOURCE_DISPLAY_ENTRIES: readonly ResourceDisplayEntry[] = [
  { itemId: 'ITEM_GOLD', name: '金币', color: new Color(255, 215, 80, 255) },
  { itemId: 'ITEM_EQUIPMENT_STONE', name: '强化石', color: new Color(90, 225, 210, 255) },
  { itemId: 'ITEM_DIAMOND', name: '钻石', color: new Color(120, 180, 255, 255) },
];

export type EquipmentAssetCountProvider = (itemId: string) => number;

export class EquipmentResourceBar {
  private readonly _root: Node;
  private readonly _labels = new Map<string, Label>();

  constructor(
    parent: Node,
    nodeName: string,
    x: number,
    y: number,
    private readonly _getAssetCount: EquipmentAssetCountProvider,
  ) {
    this._root = this._ensureRoot(parent, nodeName);
    this._root.setPosition(x, y, 0);
    this._ensureLabels();
  }

  refresh(): void {
    for (const entry of RESOURCE_DISPLAY_ENTRIES) {
      const label = this._labels.get(entry.itemId);
      if (!label) continue;

      const current = this._getAssetCount(entry.itemId);
      label.string = `${entry.name} ${current}`;
    }
  }

  private _ensureRoot(parent: Node, nodeName: string): Node {
    let root = parent.getChildByName(nodeName);
    if (!root) {
      root = new Node(nodeName);
      root.setParent(parent);
    }
    this._markRuntimeObject(root);

    const transform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    this._markRuntimeObject(transform);
    transform.setContentSize(BAR_WIDTH, BAR_HEIGHT);

    const graphics = root.getComponent(Graphics) ?? root.addComponent(Graphics);
    this._markRuntimeObject(graphics);
    graphics.clear();
    graphics.fillColor = new Color(18, 22, 32, 220);
    graphics.fillRect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT);
    return root;
  }

  private _ensureLabels(): void {
    const startX = -ITEM_WIDTH;

    RESOURCE_DISPLAY_ENTRIES.forEach((entry, index) => {
      const nodeName = `__Resource_${entry.itemId}`;
      let node = this._root.getChildByName(nodeName);
      if (!node) {
        node = new Node(nodeName);
        node.setParent(this._root);
      }
      node.setPosition(startX + ITEM_WIDTH * index, 0, 0);
      this._markRuntimeObject(node);

      const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
      this._markRuntimeObject(transform);
      transform.setContentSize(ITEM_WIDTH, BAR_HEIGHT);

      const label = node.getComponent(Label) ?? node.addComponent(Label);
      this._markRuntimeObject(label);
      label.fontSize = 21;
      label.lineHeight = BAR_HEIGHT;
      label.color = entry.color;
      label.overflow = Label.Overflow.SHRINK;
      label.horizontalAlign = HorizontalTextAlignment.CENTER;
      label.verticalAlign = VerticalTextAlignment.CENTER;
      this._labels.set(entry.itemId, label);
    });
  }

  private _markRuntimeObject(target: CCObject): void {
    target.hideFlags = RUNTIME_HIDE_FLAGS;
  }
}
