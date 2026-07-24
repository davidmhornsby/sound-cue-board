"""Generates PWA icon PNGs with no third-party dependencies (stdlib zlib/struct only).
Draws a simple rounded-square badge with a play triangle + sound-wave arcs.
Run once: python3 scripts/make_icons.py
"""
import struct
import zlib
import os

BG = (17, 19, 23)        # near-black theatre background
ACCENT = (230, 57, 70)   # theatre red accent
FG = (245, 245, 245)     # near-white foreground


def make_png(path, size, bg, accent, fg):
    w = h = size
    pixels = [[bg for _ in range(w)] for _ in range(h)]

    cx, cy = w / 2, h / 2
    r_outer = w * 0.46

    def set_px(x, y, color):
        if 0 <= x < w and 0 <= y < h:
            pixels[y][x] = color

    # rounded-square badge (approximated by a superellipse) filled with a soft gradient
    for y in range(h):
        for x in range(w):
            nx = (x - cx) / (w * 0.5)
            ny = (y - cy) / (h * 0.5)
            # superellipse rounded square boundary
            n = 4
            dist = (abs(nx) ** n + abs(ny) ** n) ** (1 / n)
            if dist <= 0.92:
                t = min(1.0, dist / 0.92)
                col = tuple(int(bg[i] * (1 - 0.15 * (1 - t)) + accent[i] * 0.06) for i in range(3))
                pixels[y][x] = col

    # clean play-button triangle, centered slightly right of center
    tri_cx = cx + w * 0.05
    tri_h = h * 0.40
    tri_w = w * 0.34
    x0 = tri_cx - tri_w / 2
    x1 = tri_cx + tri_w / 2
    y0 = cy - tri_h / 2
    y1 = cy + tri_h / 2
    for y in range(int(y0), int(y1) + 1):
        if y1 == y0:
            continue
        frac = (y - y0) / (y1 - y0)  # 0..1
        # width shrinks to a point at both extremes toward x1 (triangle apex at x1, mid-height)
        span = 1 - abs(frac - 0.5) * 2  # 1 at mid, 0 at edges
        right_edge = x0 + span * (x1 - x0)
        for x in range(int(x0), int(right_edge) + 1):
            set_px(x, y, fg)

    write_png(path, w, h, pixels)


def write_png(path, w, h, pixels):
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)  # 8-bit, color type 2 (RGB)

    raw = bytearray()
    for row in pixels:
        raw.append(0)  # no filter
        for (r, g, b) in row:
            raw += bytes((r, g, b))
    idat = zlib.compress(bytes(raw), 9)

    with open(path, 'wb') as f:
        f.write(sig)
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))


if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    for size, name in ((192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')):
        make_png(os.path.join(out_dir, name), size, BG, ACCENT, FG)
        print('wrote', name)
