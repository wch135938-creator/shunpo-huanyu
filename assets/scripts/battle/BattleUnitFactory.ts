// ============================================================
// BattleUnitFactory — Phase9 战斗单元工厂（Hero/Skill/Formation → BattleSystem 唯一适配层）
// 职责：消费 HeroSnapshot / SkillRuntimeSnapshot / TeamSnapshot，生成 BattleUnit
// 边界：只读快照数据，不修改任何系统状态
//       不依赖 BattleManager / DungeonSystem / DropSystem / Roguelike / UI
// 输出：BattleUnit[] 直接供 BattleSystem.initBattle() 消费
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { BattleUnitType } from './BattleTypes';
import type { BattlePosition } from './BattleTypes';
import type { BattleUnit } from './BattleUnit';
import type { HeroSnapshot } from '../hero/HeroTypes';
import type { TeamSnapshot, FormationSlot } from '../formation/FormationTypes';

// ==================== 槽位→站位映射表 ====================

/**
 * 槽位索引 → BattlePosition 映射。
 *
 * 对齐 FormationTypes 定义：
 *   前排 (row=0): slotIndex 0, 1
 *   后排 (row=1): slotIndex 2, 3, 4
 */
const SLOT_POSITIONS: ReadonlyArray<BattlePosition> = [
  { row: 0, column: 0, index: 0 },
  { row: 0, column: 1, index: 1 },
  { row: 1, column: 0, index: 2 },
  { row: 1, column: 1, index: 3 },
  { row: 1, column: 2, index: 4 },
];

// ==================== BattleUnitFactory ====================

export class BattleUnitFactory extends BaseSystem {

  // ===== 单例 =====

  static getInstance(): BattleUnitFactory {
    return super.getInstance<BattleUnitFactory>();
  }

  // ================================================================
  // 主入口：阵容快照 → BattleUnit[]
  // ================================================================

  /**
   * 从 TeamSnapshot + 阵容槽位构建我方 BattleUnit 数组。
   *
   * 这是 HeroSystem / SkillSystem / FormationSystem 进入 BattleSystem 的
   * **唯一适配层**。所有我方战斗单元的创建必须通过此方法。
   *
   * 流程：
   *   1. 将 HeroSnapshot[] 编入 heroId → HeroSnapshot 映射
   *   2. 遍历 FormationSlot[]，跳过空槽位
   *   3. 按 slotIndex 分配 BattlePosition
   *   4. 从 HeroSnapshot.battleReady 提取战斗属性
   *   5. 从 HeroSnapshot.skillIds 提取技能列表
   *   6. 组装 BattleUnit，按出现顺序分配 unitId（"p_0", "p_1", ...）
   *
   * @param teamSnapshot — FormationSystem 生成的完整阵容快照
   * @param slots        — 阵容槽位数组（来自 FormationPreset.slots）
   * @returns            BattleUnit[]，可直接传入 BattleSystem.initBattle()
   */
  buildPlayerUnits(teamSnapshot: TeamSnapshot, slots: FormationSlot[]): BattleUnit[] {
    // 守卫
    if (!teamSnapshot) {
      console.error('[BattleUnitFactory] buildPlayerUnits: teamSnapshot 为 null');
      return [];
    }
    if (!slots || slots.length === 0) {
      console.warn('[BattleUnitFactory] buildPlayerUnits: slots 为空');
      return [];
    }

    // 1. 构建 heroId → HeroSnapshot 快速查找映射
    const heroMap = new Map<string, HeroSnapshot>();
    for (const hs of teamSnapshot.heroSnapshots) {
      heroMap.set(hs.heroId, hs);
    }

    // 2. 遍历槽位，逐个生成 BattleUnit
    const units: BattleUnit[] = [];
    let unitIndex = 0;

    for (const slot of slots) {
      // 跳过空槽位
      if (!slot.heroId || slot.heroId.trim().length === 0) {
        continue;
      }

      // 查找对应的 HeroSnapshot
      const heroSnapshot = heroMap.get(slot.heroId);
      if (!heroSnapshot) {
        console.warn(
          `[BattleUnitFactory] 跳过槽位 ${slot.slotIndex}: ` +
          `HeroSnapshot 不存在 heroId=${slot.heroId}`,
        );
        continue;
      }

      // 分配站位
      const position = this._resolvePosition(slot.slotIndex);

      // 构建 BattleUnit
      const unit = this._heroSnapshotToBattleUnit(heroSnapshot, position, unitIndex);
      units.push(unit);
      unitIndex++;
    }

    if (units.length === 0) {
      console.warn('[BattleUnitFactory] buildPlayerUnits: 所有槽位为空或快照缺失，返回空阵容');
    }

    return units;
  }

  // ================================================================
  // 单个转换：HeroSnapshot → BattleUnit
  // ================================================================

  /**
   * 将单个 HeroSnapshot 转换为 BattleUnit。
   *
   * 可用于：
   *   - 战斗中途召唤新单位（未来扩展）
   *   - 测试/调试场景单独构建
   *
   * @param snapshot   — 英雄快照（含 battleReady 属性）
   * @param position   — 战斗站位
   * @param unitIndex  — 在阵容中的序号（0-based）
   * @returns          BattleUnit
   */
  heroSnapshotToBattleUnit(
    snapshot: HeroSnapshot,
    position: BattlePosition,
    unitIndex: number,
  ): BattleUnit {
    return this._heroSnapshotToBattleUnit(snapshot, position, unitIndex);
  }

  // ================================================================
  // 批量转换
  // ================================================================

  /**
   * 批量将 HeroSnapshot 数组转换为 BattleUnit 数组。
   *
   * 站位按 snapshot 在数组中的索引分配（0→前排左, 1→前排右, 2-4→后排）。
   * 用于不依赖 FormationSlot 的简化调用（调试 / 快速战斗）。
   *
   * @param snapshots — 英雄快照数组（按期望站位排序）
   * @returns         BattleUnit[]
   */
  buildPlayerUnitsFromSnapshots(snapshots: HeroSnapshot[]): BattleUnit[] {
    if (!snapshots || snapshots.length === 0) {
      return [];
    }

    const units: BattleUnit[] = [];
    for (let i = 0; i < snapshots.length; i++) {
      const position = this._resolvePosition(i);
      const unit = this._heroSnapshotToBattleUnit(snapshots[i], position, i);
      units.push(unit);
    }

    return units;
  }

  // ================================================================
  // 内部方法
  // ================================================================

  /**
   * 将槽位索引解析为 BattlePosition。
   *
   * 映射：
   *   0 → (row=0, col=0) 前排左
   *   1 → (row=0, col=1) 前排右
   *   2 → (row=1, col=0) 后排左
   *   3 → (row=1, col=1) 后排中
   *   4 → (row=1, col=2) 后排右
   *
   * @param slotIndex — FormationSlot.slotIndex (0–4)
   * @returns         BattlePosition 副本
   */
  private _resolvePosition(slotIndex: number): BattlePosition {
    if (slotIndex >= 0 && slotIndex < SLOT_POSITIONS.length) {
      return { ...SLOT_POSITIONS[slotIndex] };
    }

    // 防御：超范围槽位索引（不应发生，但容错）
    console.warn(
      `[BattleUnitFactory] 槽位索引越界: slotIndex=${slotIndex}, ` +
      `有效范围 [0, ${SLOT_POSITIONS.length - 1}]，已 fallback 到后排`,
    );
    return { row: 1, column: 0, index: slotIndex };
  }

  /**
   * HeroSnapshot → BattleUnit 核心转换逻辑。
   *
   * 属性映射：
   *   HeroSnapshot.battleReady.hp    → BattleUnit.maxHp / currentHp
   *   HeroSnapshot.battleReady.atk   → BattleUnit.attack
   *   HeroSnapshot.battleReady.def   → BattleUnit.defense
   *   HeroSnapshot.battleReady.speed → BattleUnit.speed
   *   HeroSnapshot.skillIds          → BattleUnit.skillIds
   *   HeroSnapshot.name/faction/element/level → BattleUnit.*
   *
   * BattleUnit 上不携带 critRate / critDamage — 这些由 BattleSystem
   * 在技能命中时从注入的 config 读取（MVP 阶段使用 GlobalBattleEntry 默认值）。
   *
   * @param snapshot   — 英雄快照
   * @param position   — 战斗站位
   * @param unitIndex  — 阵容序号
   * @returns          BattleUnit（isAlive=true, currentHp=maxHp）
   */
  private _heroSnapshotToBattleUnit(
    snapshot: HeroSnapshot,
    position: BattlePosition,
    unitIndex: number,
  ): BattleUnit {
    const br = snapshot.battleReady;

    return {
      unitId: `p_${unitIndex}`,
      configId: snapshot.heroId,
      unitType: BattleUnitType.Hero,
      name: snapshot.name || snapshot.heroId,
      faction: snapshot.faction,
      element: snapshot.element,
      level: snapshot.level,
      maxHp: br.hp,
      currentHp: br.hp,
      attack: br.atk,
      defense: br.def,
      speed: br.speed,
      skillIds: [...snapshot.skillIds],
      position: { ...position },
      isAlive: true,
    };
  }
}
