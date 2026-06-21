// ============================================================
// HeroContextProvider.ts — Phase10-Step8-Fix 英雄上下文提供者接口
// 职责：为装备系统提供英雄上下文（等级/职业/阵营）
// 位置：equipment/ 层（领域接口，后续由 HeroSystem 实现）
// 设计目的：
//   · 解耦装备系统与 HeroSystem 的直接依赖
//   · Presenter 通过此接口获取 heroLevel/heroProfession/heroFaction
//   · 当前阶段仅定义接口，不正式接入 HeroSystem
//   · 无实现时 Presenter 使用安全默认值（level=1, faction=undefined 等）
// ============================================================

/**
 * 英雄上下文提供者接口。
 *
 * 由 HeroSystem（或测试替身）实现，注入到 EquipmentUIPresenter。
 * 用于装备穿戴校验中的英雄等级、职业、阵营判定。
 *
 * 所有方法在 heroId 不存在时应返回安全默认值，
 * 不应抛出异常。
 */
export interface HeroContextProvider {
  /**
   * 获取英雄等级。
   *
   * @param heroId  英雄 ID
   * @returns 英雄等级（≥1）。heroId 不存在时返回 1。
   */
  getHeroLevel(heroId: string): number;

  /**
   * 获取英雄职业。
   *
   * @param heroId  英雄 ID
   * @returns 职业标识字符串（如 'Warrior', 'Mage', 'Assassin' 等），
   *          heroId 不存在时返回 undefined。
   */
  getHeroProfession(heroId: string): string | undefined;

  /**
   * 获取英雄阵营/属性。
   *
   * @param heroId  英雄 ID
   * @returns 阵营标识字符串（如 'Fire', 'Ice', 'Thunder' 等），
   *          heroId 不存在时返回 undefined。
   */
  getHeroFaction(heroId: string): string | undefined;
}
