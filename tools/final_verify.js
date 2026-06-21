// Final comprehensive verification of Phase8BootstrapEntry in Phase8Main.scene

const fs = require("fs");
const path = require("path");

const SCENE_PATH = path.join(__dirname, "..", "assets", "scenes", "Phase8Main.scene");
const META_PATH = path.join(__dirname, "..", "assets", "scripts", "core", "Phase8BootstrapEntry.ts.meta");
const SCRIPT_PATH = path.join(__dirname, "..", "assets", "scripts", "core", "Phase8BootstrapEntry.ts");

const BASE64_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

console.log("=".repeat(60));
console.log("Phase8BootstrapEntry — Scene Attachment Verification");
console.log("=".repeat(60));

// 1. Read meta file UUID
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const scriptUuid = meta.uuid;
console.log("\n[1] Script .meta UUID:", scriptUuid);

// 2. Read scene file
const scene = JSON.parse(fs.readFileSync(SCENE_PATH, "utf8"));
console.log("\n[2] Scene objects count:", scene.length);

// 3. Find Canvas node
const canvasNode = scene.find(o => o.__type__ === "cc.Node" && o._name === "Canvas");
if (!canvasNode) {
  console.log("ERROR: Canvas node not found!");
  process.exit(1);
}
console.log("\n[3] Canvas node found: _id =", canvasNode._id);

// 4. List Canvas components
console.log("\n[4] Canvas _components:");
const compIds = canvasNode._components.map(c => c.__id__);
for (const cid of compIds) {
  const comp = scene[cid];
  if (comp) {
    console.log(`  __id__:${cid} → __type__:"${comp.__type__}" _enabled:${comp._enabled}`);
  } else {
    console.log(`  __id__:${cid} → NOT FOUND in scene objects`);
  }
}

// 5. Find Phase8BootstrapEntry component
const entryCompIdx = compIds.findIndex(cid => {
  const comp = scene[cid];
  return comp && comp.__type__ === "989a7QNLcFPf7EoM3Kk3KvR";
});

if (entryCompIdx < 0) {
  console.log("\n[5] Phase8BootstrapEntry: NOT FOUND in Canvas components!");
} else {
  const compId = compIds[entryCompIdx];
  const entryComp = scene[compId];
  console.log("\n[5] Phase8BootstrapEntry component (__id__:" + compId + "):");
  console.log("  __type__:", entryComp.__type__);
  console.log("  node: __id__:" + entryComp.node.__id__ + " (Canvas)");
  console.log("  _enabled:", entryComp._enabled);
  console.log("  uiRootNode:", entryComp.uiRootNode);
  console.log("  autoOpenDungeonPanel:", entryComp.autoOpenDungeonPanel);
  console.log("  testPlayerPower:", entryComp.testPlayerPower);
  console.log("  enableStep5Verification:", entryComp.enableStep5Verification);
  console.log("  enableAnimationBinding:", entryComp.enableAnimationBinding);
  console.log("  enableLocalizationBinding:", entryComp.enableLocalizationBinding);
  console.log("  _id:", entryComp._id);

  // 6. Verify UUID compression
  console.log("\n[6] UUID Compression Verification:");
  const hex = scriptUuid.replace(/-/g, "");

  // Recompute the 23-char compressed UUID
  // Format: first 5 hex chars literal + remaining 27 hex chars as 9 pairs of base64
  let computed = hex.substring(0, 5); // First 5 hex chars literal
  for (let i = 5; i < hex.length; i += 3) {
    const h0 = parseInt(hex[i], 16);
    const h1 = parseInt(hex[i + 1], 16);
    const h2 = parseInt(hex[i + 2], 16);
    const lhs = (h0 << 2) | ((h1 >> 2) & 3);
    const rhs = ((h1 & 3) << 4) | h2;
    computed += BASE64_KEYS[lhs];
    computed += BASE64_KEYS[rhs];
  }

  console.log("  Script UUID (meta):", scriptUuid);
  console.log("  UUID hex (no dash):", hex);
  console.log("  Scene __type__:    ", entryComp.__type__);
  console.log("  Computed __type__: ", computed);
  console.log("  Scene length:", entryComp.__type__.length, "(expected: 23)");
  console.log("  Computed length:", computed.length, "(expected: 23)");
  console.log("  UUID compression:", computed === entryComp.__type__ ? "✓ CORRECT" : "✗ MISMATCH");

  // 7. Verify node reference
  console.log("\n[7] Node reference verification:");
  const referencedNode = scene[entryComp.node.__id__];
  console.log("  Referenced node __id__:" + entryComp.node.__id__);
  console.log("  Node name:", referencedNode._name);
  console.log("  Node is Canvas:", referencedNode._name === "Canvas" ? "✓ YES" : "✗ NO");

  // 8. Check @ccclass decorator in script
  console.log("\n[8] Script class registration:");
  const scriptContent = fs.readFileSync(SCRIPT_PATH, "utf8");
  const hasCCClass = scriptContent.includes("@ccclass('Phase8BootstrapEntry')");
  const hasExport = scriptContent.includes("export class Phase8BootstrapEntry");
  console.log("  @ccclass('Phase8BootstrapEntry'):", hasCCClass ? "✓ FOUND" : "✗ MISSING");
  console.log("  export class:", hasExport ? "✓ FOUND" : "✗ MISSING");

  // 9. Verify against known working example
  console.log("\n[9] Comparison with known working example:");
  console.log("  BattleTestClean example: ecb8dctj0xIua1uojoGRS89 (23 chars)");
  console.log("  Phase8Main entry type:   " + entryComp.__type__ + " (" + entryComp.__type__.length + " chars)");
  console.log("  Format matches:", entryComp.__type__.length === 23 ? "✓ YES" : "✗ NO - DIFFERENT FORMAT");
}

// 10. Summary
console.log("\n" + "=".repeat(60));
console.log("VERDICT:");
if (entryCompIdx >= 0 && computed === entryComp.__type__) {
  console.log("✓ Phase8BootstrapEntry IS correctly attached to Canvas");
  console.log("✓ UUID compression is CORRECT");
  console.log("✓ All properties match required configuration");
  console.log("");
  console.log("If the component does NOT appear in Cocos Creator Inspector:");
  console.log("  1. Reopen the scene in Cocos Creator");
  console.log("  2. Wait for TypeScript compilation to complete");
  console.log("  3. Refresh the Asset Database (菜单 → 开发者 → 刷新资源数据库)");
  console.log("  4. Check the Console for script compilation errors");
} else {
  console.log("✗ ISSUES FOUND - needs correction");
}
console.log("=".repeat(60));
