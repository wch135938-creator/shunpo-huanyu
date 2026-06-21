// Compute the CORRECT 22-character compressed UUID for Phase8BootstrapEntry
// Using the inverse of Cocos Creator's decodeUuid algorithm

const BASE64_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// decodeUuid is defined as:
// UuidTemplate[0] = base64[0];
// UuidTemplate[1] = base64[1];
// for (let i = 2, j = 2; i < 22; i += 2) {
//   const lhs = BASE64_VALUES[base64.charCodeAt(i)];
//   const rhs = BASE64_VALUES[base64.charCodeAt(i + 1)];
//   UuidTemplate[Indices[j++]] = HexChars[lhs >> 2];
//   UuidTemplate[Indices[j++]] = HexChars[((lhs & 3) << 2) | rhs >> 4];
//   UuidTemplate[Indices[j++]] = HexChars[rhs & 0xF];
// }
//
// Where Indices = [0,1,2,3,4,5,6,7,9,10,11,12,14,15,16,17,19,20,21,22,24,25,26,27,28,29,30,31,32,33,34,35]
// (all positions in 36-char UUID format skipping positions with '-')

const HexChars = "0123456789abcdef";

function compressUuid(uuid) {
  // Input: "989a740d-2dc1-4f7f-b128-3372a4dcabd1" (36 chars with dashes)
  const hex = uuid.replace(/-/g, ""); // 32 hex chars
  let result = "";

  // First 2 hex chars go directly to first 2 compressed chars
  result += hex[0]; // '9'
  result += hex[1]; // '8'

  // Remaining 30 hex chars encode as 10 groups of 3 → 10 pairs of 2 base64 chars
  for (let i = 2; i < hex.length; i += 3) {
    const h0 = parseInt(hex[i], 16);
    const h1 = parseInt(hex[i + 1], 16);
    const h2 = parseInt(hex[i + 2], 16);

    // Reverse of decodeUuid:
    // h0 = lhs >> 2
    // h1 = ((lhs & 3) << 2) | (rhs >> 4)
    // h2 = rhs & 0xF
    // Therefore:
    // lhs = (h0 << 2) | ((h1 >> 2) & 3)
    // rhs = ((h1 & 3) << 4) | h2
    const lhs = (h0 << 2) | ((h1 >> 2) & 3);
    const rhs = ((h1 & 3) << 4) | h2;

    result += BASE64_KEYS[lhs];
    result += BASE64_KEYS[rhs];
  }

  return result;
}

// Test with the meta UUID
const scriptUuid = "989a740d-2dc1-4f7f-b128-3372a4dcabd1";
const compressed = compressUuid(scriptUuid);
console.log("Script UUID (meta):", scriptUuid);
console.log("Correct compressed:", compressed);
console.log("Length:", compressed.length);
console.log("Is 22 chars:", compressed.length === 22);

// What's in the scene file now
const sceneCurrent = "989a7QNLcFPf7EoM3Kk3KvR";
console.log("\nScene file current:", sceneCurrent);
console.log("Scene length:", sceneCurrent.length);
console.log("Match:", compressed === sceneCurrent);

// Show the difference
if (compressed !== sceneCurrent) {
  console.log("\n=== DIFFERENCE ===");
  console.log("Current: ", sceneCurrent);
  console.log("Correct: ", compressed);
  for (let i = 0; i < Math.max(compressed.length, sceneCurrent.length); i++) {
    const c = compressed[i] || "(none)";
    const s = sceneCurrent[i] || "(none)";
    const m = c === s ? "✓" : "✗ MISMATCH";
    console.log(`  [${i}] correct='${c}' scene='${s}' ${m}`);
  }
}

// Also verify by decoding the correct compressed back to UUID
function decodeUuid(base64) {
  const _t = ["", "", "", ""];
  const UuidTemplate = _t.concat(_t, "-", _t, "-", _t, "-", _t, "-", _t, _t, _t);
  const Indices = UuidTemplate.map((x, i) => (x === "-" ? NaN : i)).filter(Number.isFinite);

  // Build BASE64_VALUES lookup
  const BASE64_VALUES = {};
  for (let i = 0; i < BASE64_KEYS.length; i++) {
    BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;
  }

  if (base64.length !== 22) {
    console.log("ERROR: compressed UUID must be exactly 22 characters");
    return null;
  }

  UuidTemplate[0] = base64[0];
  UuidTemplate[1] = base64[1];
  for (let i = 2, j = 2; i < 22; i += 2) {
    const lhs = BASE64_VALUES[base64.charCodeAt(i)];
    const rhs = BASE64_VALUES[base64.charCodeAt(i + 1)];
    UuidTemplate[Indices[j++]] = HexChars[lhs >> 2];
    UuidTemplate[Indices[j++]] = HexChars[((lhs & 3) << 2) | rhs >> 4];
    UuidTemplate[Indices[j++]] = HexChars[rhs & 0xF];
  }
  return UuidTemplate.join("");
}

console.log("\n=== Verification: decode the corrected compressed UUID ===");
const decoded = decodeUuid(compressed);
console.log("Decoded correct:", decoded);
console.log("Expected UUID: ", scriptUuid);
console.log("Match:", decoded === scriptUuid);

// Also test with a known working example from BattleTestClean
console.log("\n=== Test with BattleTestClean example ===");
const battleTestExample = "ecb8dctj0xIua1uojoGRS89";
console.log("BattleTestClean type:", battleTestExample, "(length:", battleTestExample.length + ")");
