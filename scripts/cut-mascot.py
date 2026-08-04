"""Режет лист спрайтов на отдельные позы и убирает фон в прозрачность.

Сетку 4×2 резать по клеткам нельзя: хвосты и значки заходят за границу клетки,
и половина хвоста уезжает к соседу. Поэтому фигуры ищутся связными областями,
а мелкие блобы (звёздочки, «?», сердечко) приписываются ближайшей крупной.
"""
from collections import deque
from PIL import Image

SRC = "raccoons/ChatGPT Image 2 авг. 2026 г., 16_36_01.png"
OUT = "raccoons/cut"

INNER = 10.0        # ближе этого к фону — полностью прозрачно
OUTER = 46.0        # дальше этого заливка фона не идёт
SOLID = 40          # альфа, с которой пиксель считается «фигурой»
BIG_AREA = 8000     # площадь, с которой блоб считается самим енотом
SPECK = 60          # меньше этого — мусор от сглаживания

# Порядок — как на листе: слева направо, сверху вниз.
NAMES = ["happy", "calm", "cheer", "surprised", "warm", "puzzled", "sad", "asleep"]


def dist(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def strip_background(im):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[0, 0][:3]

    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        queue.append((x, 0)); queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y)); queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if seen[idx]:
            continue
        r, g, b, _ = px[x, y]
        d = dist((r, g, b), bg)
        if d >= OUTER:
            continue
        seen[idx] = 1
        px[x, y] = (r, g, b, 0 if d <= INNER else int(255 * (d - INNER) / (OUTER - INNER)))
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def components(im):
    """Связные области непрозрачных пикселей: (площадь, bbox, центр, пиксели)."""
    w, h = im.size
    alpha = im.split()[3].tobytes()
    label = [0] * (w * h)
    out = []
    current = 0
    for start in range(w * h):
        if alpha[start] <= SOLID or label[start]:
            continue
        current += 1
        queue = deque([start])
        label[start] = current
        pixels = []
        left = right = start % w
        top = bottom = start // w
        while queue:
            idx = queue.popleft()
            pixels.append(idx)
            x, y = idx % w, idx // w
            left = min(left, x); right = max(right, x)
            top = min(top, y); bottom = max(bottom, y)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        n = ny * w + nx
                        if not label[n] and alpha[n] > SOLID:
                            label[n] = current
                            queue.append(n)
        if len(pixels) >= SPECK:
            cx = sum(p % w for p in pixels) / len(pixels)
            cy = sum(p // w for p in pixels) / len(pixels)
            out.append({"area": len(pixels), "box": (left, top, right + 1, bottom + 1),
                        "center": (cx, cy), "pixels": pixels})
    return out


def main():
    im = strip_background(Image.open(SRC))
    w, h = im.size
    blobs = components(im)
    figures = [b for b in blobs if b["area"] >= BIG_AREA]
    extras = [b for b in blobs if b["area"] < BIG_AREA]
    print(f"фигур: {len(figures)}, значков: {len(extras)}")

    # Слева направо, сверху вниз — как на листе.
    figures.sort(key=lambda b: (0 if b["center"][1] < h / 2 else 1, b["center"][0]))
    groups = [[f] for f in figures]
    for extra in extras:
        ex, ey = extra["center"]
        nearest = min(range(len(figures)),
                      key=lambda i: (figures[i]["center"][0] - ex) ** 2 + (figures[i]["center"][1] - ey) ** 2)
        groups[nearest].append(extra)

    for name, group in zip(NAMES, groups):
        left = min(b["box"][0] for b in group)
        top = min(b["box"][1] for b in group)
        right = max(b["box"][2] for b in group)
        bottom = max(b["box"][3] for b in group)

        # В кадр попадают только пиксели своей группы: у соседа рядом может
        # лежать кончик хвоста, и без маски он въедет в чужую картинку.
        own = Image.new("L", (w, h), 0)
        mask = own.load()
        for blob in group:
            for idx in blob["pixels"]:
                mask[idx % w, idx // w] = 255
        figure = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        figure.paste(im, (0, 0), own)
        crop = figure.crop((left, top, right, bottom))

        # Квадрат с полем: доля фигуры в кадре одинакова, иначе в карточке
        # еноты «прыгают» размером от состояния к состоянию.
        side = max(crop.size)
        pad = int(side * 0.05)
        canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
        canvas.paste(crop, (pad + (side - crop.width) // 2, pad + (side - crop.height) // 2))
        canvas.resize((288, 288), Image.LANCZOS).save(f"{OUT}/{name}.png")
        print(f"{name:10} блобов {len(group)}  {left},{top} → {right},{bottom}")


if __name__ == "__main__":
    main()
