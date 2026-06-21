// Verify Cocos Creator UUID Compression
// Compares the __type__ in Phase8Main.scene with the script's .meta UUID

// Inputs
const sceneCompressedType = "989a7QNLcFPf7EoM3Kk3KvR";
const scriptUuid = "989a740d-2dc1-4f7f-b128-3372a4dcabd1";
const scriptUuidHex = scriptUuid.replace(/-/g, "");

console.log("=== Phase8BootstrapEntry UUID Verification ===");
console.log("Script meta UUID:  ", scriptUuid);
console.log("Scene __type__:    ", sceneCompressedType);
console.log("UUID hex (no dash):", scriptUuidHex);
console.log("");

// Cocos Creator's compressed UUID format
// From cocos/core/utils/misc.ts in the engine source
//
// The algorithm:
// 1. Takes the UUID hex string (without dashes, 32 chars = 128 bits)
// 2. Encodes groups of 3 hex chars (12 bits) into 2 base64 chars (12 bits each = 2*6)
// 3. If all hex chars in a group are "reserved" (in 0-9a-zA-Z), they're kept as-is
// 4. Otherwise, they're encoded as base64
//
// Reserved chars: 0-9, a-z, A-Z
// Non-reserved base64 chars: '+', '/'

const BASE64_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const ReservedChars = new Set("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));

// Build lookup: base64 index -> reserved index (or -1 if not reserved)
const b64ToReserved = [];
for (let i = 0; i < BASE64_KEYS.length; i++) {
  const c = BASE64_KEYS[i];
  const idx = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(c);
  b64ToReserved.push(idx >= 0 ? idx : -1);
}

// Build reverse lookup: reserved index -> base64 index
const reservedToB64 = [];
for (let i = 0; i < "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".length; i++) {
  const c = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"[i];
  reservedToB64.push(BASE64_KEYS.indexOf(c));
}

// The compressHex function from Cocos Creator engine
// Encodes from RIGHT to LEFT
function compressHex(hexStr) {
  const result = [];
  let li = hexStr.length - 1;

  while (li >= 0) {
    const c = hexStr[li];
    const hexVal = parseInt(c, 16);
    const hexChar = "0123456789abcdef"[hexVal]; // lowercase hex char

    // Check if this hex char is in reserved set
    if (ReservedChars.has(hexChar)) {
      // The hex char is reserved, emit it directly
      result.push(hexChar);
      li--;
    } else {
      // Need to encode a group
      // Take at most 3 hex chars
      if (li >= 2) {
        const h0 = parseInt(hexStr[li - 2], 16);
        const h1 = parseInt(hexStr[li - 1], 16);
        const h2 = parseInt(hexStr[li], 16);
        const combined = (h0 << 8) | (h1 << 4) | h2;
        const b0 = (combined >> 6) & 0x3f;
        const b1 = combined & 0x3f;
        result.push(BASE64_KEYS[b0]);
        result.push(BASE64_KEYS[b1]);
        li -= 3;
      } else if (li >= 1) {
        const h0 = parseInt(hexStr[li - 1], 16);
        const h1 = parseInt(hexStr[li], 16);
        const combined = (h0 << 4) | h1;
        result.push(BASE64_KEYS[combined]);
        li -= 2;
      } else {
        result.push(BASE64_KEYS[parseInt(hexStr[li], 16)]);
        li--;
      }
    }
  }

  return result.reverse().join("");
}

// Try compressing
const myCompressed = compressHex(scriptUuidHex);
console.log("My compressed:     ", myCompressed);
console.log("Scene __type__:    ", sceneCompressedType);
console.log("Match:             ", myCompressed === sceneCompressedType);
console.log("");

// Now, the key insight from the Cocos Creator source:
// The algorithm doesn't just encode ALL groups — it has a specific rule:
// Groups are encoded ONLY when they contain non-reserved characters (like '+', '/')
// When encoding, it compresses 3 hex chars (12 bits) into 2 base64 chars (12 bits)
//
// The algorithm scans from right to left looking for the BEST compression ratio.
// If 3 consecutive hex digits can be encoded into 2 base64 chars, and the encoded
// result has fewer non-reserved chars, it uses the encoding.
// Otherwise, it keeps the hex chars as-is.

// Let me try a different approach: decompress the scene's compressed UUID
// to see if it gives us the original hex

function decompressHex(compressed) {
  // Decompress Cocos compressed hex string
  // Map each character back to hex
  let hex = "";
  let i = 0;

  while (i < compressed.length) {
    const c = compressed[i];

    // Check if this character is a "reserved" character (direct hex)
    // In the compressed string, hex chars (0-9, a-f) appear directly
    if (c >= "0" && c <= "9") {
      hex += c;
      i++;
    } else if (c >= "a" && c <= "f") {
      hex += c;
      i++;
    } else {
      // It's a base64 character encoding 1.5 hex chars
      // Each base64 character (6 bits) encodes 1.5 hex characters (6 bits)
      // But in Cocos, pairs of base64 chars encode 3 hex chars

      // Get base64 index
      const b64Idx = BASE64_KEYS.indexOf(c);
      if (b64Idx === -1) {
        console.log("Invalid char in compressed:", c);
        i++;
        continue;
      }

      // Check if next char is also base64 (forms a pair encoding 3 hex chars)
      if (i + 1 < compressed.length) {
        const nextC = compressed[i + 1];
        const nextB64Idx = BASE64_KEYS.indexOf(nextC);

        // If next char is NOT a hex char, it's part of a base64 pair
        const isNextHex =
          (nextC >= "0" && nextC <= "9") || (nextC >= "a" && nextC <= "f");

        if (!isNextHex && nextB64Idx >= 0) {
          // Pair: 2 base64 chars -> 12 bits -> 3 hex chars
          const combined = (b64Idx << 6) | nextB64Idx;
          const h0 = (combined >> 8) & 0xf;
          const h1 = (combined >> 4) & 0xf;
          const h2 = combined & 0xf;
          hex += h0.toString(16);
          hex += h1.toString(16);
          hex += h2.toString(16);
          i += 2;
          continue;
        }
      }

      // Single base64 char -> 1 hex char? Or 1.5 hex chars?
      // In Cocos, single base64 char encodes 1 byte (2 hex chars)
      // ... but this case is rare
      const combined = b64Idx; // 6 bits
      const h0 = (combined >> 4) & 0xf;
      const h1 = combined & 0xf;
      hex += h0.toString(16);
      if (h1 !== 0 || i + 1 >= compressed.length) {
        hex += h1.toString(16);
      }
      i++;
    }
  }

  return hex;
}

const decompressed = decompressHex(sceneCompressedType);
console.log("Decompressed scene:", decompressed);
console.log("Expected:          ", scriptUuidHex);
console.log("Decompress match:  ", decompressed === scriptUuidHex);
console.log("");

// Also show the difference
console.log("=== Character comparison ===");
for (let i = 0; i < Math.max(decompressed.length, scriptUuidHex.length); i++) {
  const d = decompressed[i] || "(none)";
  const e = scriptUuidHex[i] || "(none)";
  const m = d === e ? "✓" : "✗";
  console.log(`  [${i}] decompressed='${d}' expected='${e}' ${m}`);
}

// Let's also check each character of scene type vs expected
console.log("");
console.log("=== Scene type character analysis ===");
for (let i = 0; i < sceneCompressedType.length; i++) {
  const c = sceneCompressedType[i];
  const isHex = (c >= "0" && c <= "9") || (c >= "a" && c <= "f");
  const isBase64 = BASE64_KEYS.includes(c);
  console.log(`  [${i}] '${c}' isHex=${isHex} isBase64=${isBase64}`);
}
