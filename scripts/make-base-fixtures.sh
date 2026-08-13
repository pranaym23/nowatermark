#!/usr/bin/env bash
# Regenerate the base fixture images in tests/fixtures/base.
#
# These are real files from real encoders — the unit tests inject known
# metadata into them rather than fabricating containers from scratch. You
# should not normally need to run this; the outputs are committed.
#
# Requires: python3 (stdlib only) and cwebp (brew install webp).
# The PRD suggested an exiftool-based script; we generate metadata in code
# instead (see tests/fixtures/build.ts) so fixtures are fully deterministic
# and the test suite has no external tool dependency.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../tests/fixtures/base" && pwd)"
cd "$DIR"

# A 32x24 RGB gradient, built with zlib only.
python3 - <<'PY'
import zlib, struct

def chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

w, h = 32, 24
raw = b''.join(
    b'\x00' + bytes(v for x in range(w) for v in ((x * 8) % 256, (y * 10) % 256, ((x + y) * 5) % 256))
    for y in range(h)
)
png = (
    b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    + chunk(b'IDAT', zlib.compress(raw, 9))
    + chunk(b'IEND', b'')
)
open('base.png', 'wb').write(png)
print(f'base.png {len(png)} bytes')
PY

# JPEG via macOS sips; falls back to cwebp's companion tools elsewhere.
if command -v sips >/dev/null 2>&1; then
  sips -s format jpeg -s formatOptions 85 base.png --out base.jpg >/dev/null
elif command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -loglevel error -i base.png -q:v 5 base.jpg
else
  echo "need sips or ffmpeg to produce base.jpg" >&2
  exit 1
fi

cwebp -quiet -q 80 base.png -o base-lossy.webp
cwebp -quiet -lossless base.png -o base-lossless.webp

ls -la base.png base.jpg base-lossy.webp base-lossless.webp
