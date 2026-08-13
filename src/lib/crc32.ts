/**
 * CRC-32 (IEEE 802.3, reflected) — the checksum PNG uses for every chunk.
 *
 * The cleaner copies surviving chunks verbatim (checksum included), so this is
 * only needed when we *synthesise* a chunk: currently the minimal orientation-
 * only eXIf chunk written by the orientation-preservation path.
 */

const TABLE = /* @__PURE__ */ (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
