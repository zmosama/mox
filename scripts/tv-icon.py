import json, os, sys
from PIL import Image
root = sys.argv[1]
icon = Image.open(os.path.join(root, "ios/MOX/Assets.xcassets/AppIcon.appiconset/icon.png")).convert("RGB")
import numpy as np
# The full-size wordmark from the brand board (2000px), cut out of its black:
# how bright a pixel is becomes how solid it is, and its colour is restored,
# so the ring's glow fades into whatever is behind it.
wsrc = Image.open(os.path.join(root, "brand/wordmark-source.webp")).convert("RGB").crop((20, 520, 1990, 1460))
class Word:
    """The wordmark at a size: scaled while still on its black, THEN cut out.
    Scaling a cut-out mixes its transparent pixels' colour into the edges and
    leaves a thin outline round every letter."""
    width, height = wsrc.size
    def resize(self, size, _filter=None):
        # Hamming, not Lanczos: Lanczos overshoots at a hard white-on-black edge and
        # draws a faint second line beside every letter.
        a = np.asarray(wsrc.resize(size, Image.HAMMING)).astype(np.float32) / 255
        al = a.max(axis=2)
        al = np.where(al < 0.02, 0, al)
        rgb = np.where(al[..., None] > 0, a / np.maximum(al[..., None], 1e-6), 1)
        return Image.fromarray((np.dstack([np.clip(rgb, 0, 1), al]) * 255).round().astype(np.uint8), "RGBA")
word = Word()
# The ring with its glow, cut out of the phone icon: black becomes transparent.
r, g, b = icon.split()
alpha = Image.merge("RGB", (r, g, b)).convert("L").point(lambda v: min(255, int(v * 2.2)))
ring = Image.merge("RGBA", (r, g, b, alpha)).crop((112, 112, 912, 912))
BLACK = (0, 0, 0, 255)
out = os.path.join(root, "ios/MOXTV/Assets.xcassets")
def w(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(data, open(path, "w"), indent=2)
INFO = {"author": "xcode", "version": 1}
w(os.path.join(out, "Contents.json"), {"info": INFO})
brand = os.path.join(out, "App Icon & Top Shelf Image.brandassets")
w(os.path.join(brand, "Contents.json"), {"assets": [
    {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
    {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
    {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
    {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
], "info": INFO})
def ring_layer(wd, ht, transparent):
    # The whole wordmark, as in the Settings credits: a television's icon is wide.
    im = Image.new("RGBA", (wd, ht), (0, 0, 0, 0) if transparent else BLACK)
    ww = int(wd * 0.80)
    wm = word.resize((ww, int(word.height * ww / word.width)), Image.LANCZOS)
    im.alpha_composite(wm, ((wd - ww) // 2, (ht - wm.height) // 2))
    return im
def stack(name, wd, ht, scales):
    base = os.path.join(brand, name)
    w(os.path.join(base, "Contents.json"), {"info": INFO, "layers": [{"filename": "Front.imagestacklayer"}, {"filename": "Back.imagestacklayer"}]})
    for layer in ("Front", "Back"):
        ldir = os.path.join(base, layer + ".imagestacklayer")
        w(os.path.join(ldir, "Contents.json"), {"info": INFO})
        images = []
        for s in scales:
            fn = f"{layer.lower()}@{s}x.png"
            # Opaque, both of them: tvOS draws a glass rim round whatever a layer leaves
            # transparent, which outlined every letter.
            im = ring_layer(wd * s, ht * s, False) if layer == "Front" else Image.new("RGBA", (wd * s, ht * s), BLACK)
            os.makedirs(os.path.join(ldir, "Content.imageset"), exist_ok=True)
            im.convert("RGB").save(os.path.join(ldir, "Content.imageset", fn))
            images.append({"filename": fn, "idiom": "tv", "scale": f"{s}x"})
        w(os.path.join(ldir, "Content.imageset", "Contents.json"), {"images": images, "info": INFO})
stack("App Icon.imagestack", 400, 240, (1, 2))
stack("App Icon - App Store.imagestack", 1280, 768, (1,))
def shelf(name, wd, ht):
    base = os.path.join(brand, name)
    images = []
    for s in (1, 2):
        W, H = wd * s, ht * s
        im = Image.new("RGBA", (W, H), BLACK)
        ww = int(W * 0.30)
        wm = word.resize((ww, int(word.height * ww / word.width)), Image.LANCZOS)
        im.alpha_composite(wm, ((W - ww) // 2, (H - wm.height) // 2))
        fn = f"shelf@{s}x.png"
        os.makedirs(base, exist_ok=True)
        im.convert("RGB").save(os.path.join(base, fn))
        images.append({"filename": fn, "idiom": "tv", "scale": f"{s}x"})
    w(os.path.join(base, "Contents.json"), {"images": images, "info": INFO})
shelf("Top Shelf Image.imageset", 1920, 720)
shelf("Top Shelf Image Wide.imageset", 2320, 720)
