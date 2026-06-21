// ============================================================
// TeamSnapshotBuilder — Phase9 阵容快照构建器
// 职责：将 FormationPreset + HeroSystem + SkillSystem 组装为 TeamSnapshot
// 边界：只读 HeroSystem / SkillSystem，不修改任何系统状态，不依赖 UI
// 输出：TeamSnapshot（可序列化，可用于未来战斗层）
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { HeroSystem } from '../hero/HeroSystem';
import { SkillSystem } from '../skill/SkillSystem';
import { SkillRuntimeResolver } from '../skill/SkillRuntimeResolver';
import type {
  FormationPreset,
  TeamSnapshot,
} from './FormationTypes';
import type { HeroSnapshot } from '../hero/HeroTypes';
import type { SkillRuntimeSnapshot } from '../skill/SkillTypes';

export class TeamSnapshotBuilder extends BaseSystem {

  // ==================== 快照构建 ====================

  /**
   * 构建阵容快照。
   *
   * 流程：
   * 1. 从 FormationPreset.slots 提取非空 heroIds
   * 2. 通过 HeroSystem 获取每个英雄的 HeroSnapshot
   * 3. 通过 SkillSystem 获取每个英雄装备技能的 SkillRuntimeSnapshot
   * 4. 汇总所有 HeroSnapshot 的 battleReady.power 为 teamPower
   * 5. 组装 TeamSnapshot
   *
   * @param preset  阵容预设
   * @returns       TeamSnapshot，构建失败时返回 null
   */
  buildTeamSnapshot(preset: FormationPreset): TeamSnapshot | null {
    if (!preset) {
      console.error('[TeamSnapshotBuilder] preset 为 null');
      return null;
    }

    const heroSystem = HeroSystem.getInstance();
    const skillSystem = SkillSystem.getInstance();

    // 1. 提取非空 heroIds
    const heroIds: string[] = [];
    for (const slot of preset.slots) {
      if (slot.heroId && slot.heroId.trim().length > 0) {
        heroIds.push(slot.heroId);
      }
    }

    if (heroIds.length === 0) {
      // 空阵容：返回最小快照
      return {
        mode: preset.mode,
        presetId: preset.id,
        heroIds: [],
        heroSnapshots: [],
        skillSnapshots: [],
        teamPower: 0,
        capturedAt: Date.now(),
      };
    }

    // 2. 获取英雄快照
    const heroSnapshots: HeroSnapshot[] = [];
    const missingHeroes: string[] = [];

    for (const heroId of heroIds) {
      const snapshot = heroSystem.getHeroSnapshot(heroId);
      if (snapshot) {
        heroSnapshots.push(snapshot);
      } else {
        missingHeroes.push(heroId);
      }
    }

    if (missingHeroes.length > 0) {
      console.warn(
        `[TeamSnapshotBuilder] 以下英雄快照生成失败: ${missingHeroes.join(', ')}`,
      );
    }

    if (heroSnapshots.length === 0) {
      return {
        mode: preset.mode,
        presetId: preset.id,
        heroIds,
        heroSnapshots: [],
        skillSnapshots: [],
        teamPower: 0,
        capturedAt: Date.now(),
      };
    }

    // 3. 获取技能快照
    const skillSnapshots: SkillRuntimeSnapshot[] = [];
    const seenSkillIds = new Set<string>();

    for (const heroId of heroIds) {
      const equippedSkillIds = skillSystem.getHeroEquippedSkillIds(heroId);

      // 如果英雄没有装备技能，尝试从 HeroSnapshot 的 skillIds 获取
      const skillIdsToResolve = equippedSkillIds.length > 0
        ? equippedSkillIds
        : this._getSkillIdsFromHeroSnapshot(heroSnapshots, heroId);

      if (skillIdsToResolve.length === 0 && equippedSkillIds.length === 0) {
        // 尝试使用英雄配置中的默认技能
        const heroSnapshot = heroSnapshots.find((h) => h.heroId === heroId);
        if (heroSnapshot && heroSnapshot.skillIds.length > 0) {
          for (const skillId of heroSnapshot.skillIds) {
            if (seenSkillIds.has(skillId)) continue;
            const skillSnapshot = this._resolveSkillForHero(heroId, skillId);
            if (skillSnapshot) {
              skillSnapshots.push(skillSnapshot);
              seenSkillIds.add(skillId);
            }
          }
        }
        continue;
      }

      for (const skillId of skillIdsToResolve) {
        if (seenSkillIds.has(skillId)) continue;

        const skillSnapshot = this._resolveSkillForHero(heroId, skillId);
        if (skillSnapshot) {
          skillSnapshots.push(skillSnapshot);
          seenSkillIds.add(skillId);
        }
      }
    }

    // 4. 计算阵容总战力
    let teamPower = 0;
    for (const snapshot of heroSnapshots) {
      teamPower += snapshot.battleReady.power;
    }

    // 5. 组装快照
    const teamSnapshot: TeamSnapshot = {
      mode: preset.mode,
      presetId: preset.id,
      heroIds: heroSnapshots.map((h) => h.heroId),
      heroSnapshots,
      skillSnapshots,
      teamPower,
      capturedAt: Date.now(),
    };

    return teamSnapshot;
  }

  /**
   * 计算阵容总战力（不生成完整快照，轻量版本）。
   *
   * @param preset  阵容预设
   * @returns       阵容总战力
   */
  calculateTeamPower(preset: FormationPreset): number {
    if (!preset) return 0;

    const heroSystem = HeroSystem.getInstance();
    let totalPower = 0;

    for (const slot of preset.slots) {
      if (!slot.heroId) continue;

      const snapshot = heroSystem.getHeroSnapshot(slot.heroId);
      if (snapshot) {
        totalPower += snapshot.battleReady.power;
      }
    }

    return totalPower;
  }

  // ==================== 内部方法 ====================

  /**
   * 从 HeroSnapshot 数组获取指定英雄的技能 ID 列表。
   */
  private _getSkillIdsFromHeroSnapshot(
    heroSnapshots: HeroSnapshot[],
    heroId: string,
  ): string[] {
    const snapshot = heroSnapshots.find((h) => h.heroId === heroId);
    return snapshot ? [...snapshot.skillIds] : [];
  }

  /**
   * 为指定英雄解析技能快照。
   *
   * 使用 SkillRuntimeResolver 获取编译后的技能快照。
   *
   * @param _heroId   英雄 ID（预留，用于未来英雄专属技能逻辑）
   * @param skillId   技能 ID
   * @returns         技能快照，解析失败时返回 null
   */
  private _resolveSkillForHero(
    _heroId: string,
    skillId: string,
  ): SkillRuntimeSnapshot | null {
    const skillSystem = SkillSystem.getInstance();
    const skillState = skillSystem.getSkill(skillId);

    if (skillState && skillState.unlocked) {
      return SkillRuntimeResolver.getInstance().resolveSkillSnapshot(
        skillId,
        skillState.level,
      );
    }

    // 技能尚未通过 SkillSystem 解锁，尝试以默认等级 1 解析
    return SkillRuntimeResolver.getInstance().resolveSkillSnapshot(skillId, 1);
  }
}
