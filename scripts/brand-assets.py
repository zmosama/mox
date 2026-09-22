"""
Cut the app icon out of the identity board and write every icon the app serves.

    python3 scripts/brand-assets.py

The icon is not geometry anybody can retype. It is a lit ribbon ring — a bloom
that falls off into the tile, mint where the light lands, a deeper green
opposite, and the end of the ring tucking behind itself at the lower left. An
earlier pass drew it as two SVG gradients and got a flat donut with the wrong
proportions: the drawn ring's counter was four tenths of its outer diameter, the
real one is nearly six.

So the board is the source, and it lives beside this script. Everything here is
measured from it rather than guessed:

  ring centre (119.5, 142) in the icon panel, outer radius 51.5, counter 29.5
  tile 156 square around that centre, corner radius a fifth of the side

156 pixels is small for a 512 icon, and for line art it would be hopeless. This
art is almost entirely soft gradient, which is the one thing that survives being
enlarged — checked side by side against the raw pixels before it was adopted.

The wordmark comes out too, and it has to come out with a real alpha channel:
dropped in as an opaque rectangle it would sit in the header as a black box on
a bar that is translucent and blurred.

The board draws it as light on a near-black panel, which is additive — so the
right way back out is to read it as premultiplied alpha. Subtract the panel,
take the brightest channel as coverage, divide the colour back through it. The
glow around the o survives that intact, which a threshold cut-out would not:
it would leave the ring with a hard green edge.
"""

from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BOARD = ROOT / "brand" / "identity.webp"
APP = ROOT / "src" / "app"
PUBLIC = ROOT / "public"

# The icon panel is the top-middle cell of the board; these are board coords.
CENTRE = (540 + 119.5, 142.0)
HALF = 78
# "mox" in the top-left cell, measured off the board: the letters run x 90..453
# and y 84..178, and this is that plus room for the glow — but not the ™, which
# starts at 457 and has no business in a 17-pixel-tall header.
WORDMARK = (80, 74, 456, 190)
PANEL_BG = (14, 21, 19)
# Sampled from the tile's own interior, and the same value the palette gives.
TILE_BG = (0x0B, 0x0F, 0x0E)
CORNER = 0.205  # of the side, measured off the board's own rounded square


def tile() -> Image.Image:
    cx, cy = CENTRE
    box = (int(cx - HALF), int(cy - HALF), int(cx + HALF), int(cy + HALF))
    return Image.open(BOARD).convert("RGB").crop(box)


def wordmark() -> Image.Image:
    """"mox" on transparency, its glow intact."""
    art = np.asarray(Image.open(BOARD).convert("RGB").crop(WORDMARK)).astype(np.float64)
    lit = np.clip(art - np.array(PANEL_BG), 0, 255)

    # Coverage is the brightest channel: white letters reach it on all three,
    # the green ring on one, and the panel on none.
    alpha = lit.max(axis=2) / 255.0
    safe = np.where(alpha > 0, alpha, 1.0)[:, :, None]
    colour = np.clip(lit / safe, 0, 255)

    out = np.dstack([colour, alpha[:, :, None] * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def rounded(size: int, source: Image.Image) -> Image.Image:
    """The tile at `size`, its corners cut to transparency.

    The crop carries a sliver of the board's own grey background outside the
    rounded square. Left in, it renders as four grey notches on a dark tab.
    """
    art = source.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * CORNER), fill=255
    )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(art, (0, 0), mask)
    return out


def bleed(size: int, source: Image.Image) -> Image.Image:
    """Square, corner to corner.

    iOS applies its own mask to a home-screen icon and Android crops a maskable
    one to whatever shape the launcher uses; a rounded tile inside either leaves
    a dark rim. The ring is 69% of the side, inside the 80% a mask may keep.
    """
    art = source.resize((size, size), Image.LANCZOS)
    out = Image.new("RGB", (size, size), TILE_BG)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * CORNER), fill=255
    )
    out.paste(art, (0, 0), mask)
    return out


def main() -> None:
    src = tile()
    print(f"cut {src.size[0]}x{src.size[1]} from {BOARD.relative_to(ROOT)}")

    PUBLIC.mkdir(exist_ok=True)

    rounded(512, src).save(APP / "icon.png")
    print("  src/app/icon.png            512  rounded, transparent corners")

    # The manifest needs a path that does not move. Next fingerprints the icons
    # under `app/`, so a manifest pointing at one goes stale on the next build.
    rounded(512, src).save(PUBLIC / "icon-512.png")
    print("  public/icon-512.png         512  same, at a stable URL")

    bleed(180, src).save(APP / "apple-icon.png")
    print("  src/app/apple-icon.png      180  full bleed, iOS masks it itself")

    bleed(512, src).save(PUBLIC / "icon-maskable.png")
    print("  public/icon-maskable.png    512  full bleed, for Android launchers")

    wordmark().save(PUBLIC / "wordmark.png")
    print("  public/wordmark.png         382x116  transparent, glow intact")

    # A tab favicon is read at 16 pixels, where the tile's rounded corners are a
    # pixel each and the ring is the only thing that carries. Every size is the
    # same picture anyway, so the .ico is just the tile scaled down.
    #
    # It stops at 64. A 256 frame took two thirds of the file on its own, and
    # anything asking for an icon that large is offered `icon.png` at 512 — but
    # the .ico is fetched on a first page load whether or not it is used.
    sizes = [16, 32, 48, 64]
    rounded(256, src).save(
        APP / "favicon.ico", format="ICO", sizes=[(s, s) for s in sizes]
    )
    print(f"  src/app/favicon.ico         {', '.join(map(str, sizes))}")


if __name__ == "__main__":
    main()
