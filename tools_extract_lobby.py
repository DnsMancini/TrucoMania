#!/usr/bin/env python3
from PIL import Image, ImageFilter, ImageEnhance, ImageChops, ImageOps
from pathlib import Path
import json

# Coordinate map for the provided 1024x1792 lobby reference.
REGIONS = {
    "avatars/player_avatar": [22, 48, 156, 182],
    "avatars/player_avatar_frame": [14, 40, 166, 192],
    "lobby/top_profile_bar": [14, 42, 585, 180],
    "currencies/coin_bar": [365, 60, 586, 161],
    "currencies/gem_bar": [790, 64, 1012, 159],
    "banners/tournament_banner_full": [24, 206, 654, 531],
    "banners/tournament_trophy": [491, 214, 638, 402],
    "buttons/banner_cta": [481, 404, 642, 493],
    "cards/room_gold": [24, 560, 654, 736],
    "cards/room_silver": [24, 744, 654, 922],
    "cards/room_bronze": [24, 931, 654, 1106],
    "cards/room_friends": [24, 1117, 654, 1299],
    "buttons/room_gold_enter": [487, 650, 636, 727],
    "buttons/room_silver_enter": [487, 840, 636, 914],
    "buttons/room_bronze_watch": [487, 1027, 636, 1094],
    "buttons/room_friends_view": [487, 1217, 636, 1287],
    "panels/friends_panel": [673, 206, 999, 827],
    "panels/chat_panel": [673, 845, 999, 1335],
    "navigation/mode_casual": [24, 1315, 189, 1490],
    "navigation/mode_competitive": [199, 1315, 383, 1490],
    "navigation/mode_ranked": [390, 1315, 584, 1490],
    "navigation/mode_tournaments": [592, 1315, 783, 1490],
    "navigation/mode_private": [791, 1315, 999, 1490],
    "lobby/season_pass_panel": [24, 1500, 390, 1610],
    "lobby/daily_missions_panel": [510, 1500, 999, 1610],
    "buttons/play_button": [382, 1608, 639, 1790],
    "navigation/bottom_navbar": [0, 1608, 1024, 1792],
    "effects/vignette_overlay": [0, 0, 1024, 1792],
}

NINE_SLICE_KEYS = {
    "cards/room_gold", "cards/room_silver", "cards/room_bronze", "cards/room_friends",
    "buttons/banner_cta", "buttons/room_gold_enter", "buttons/room_silver_enter",
    "buttons/room_bronze_watch", "buttons/room_friends_view", "buttons/play_button",
    "panels/friends_panel", "panels/chat_panel", "navigation/bottom_navbar", "lobby/top_profile_bar",
}

VECTOR_ICON_KEYS = {
    "navigation/mode_casual", "navigation/mode_competitive", "navigation/mode_ranked",
    "navigation/mode_tournaments", "navigation/mode_private",
}

COMPONENT_KEYS = {
    "cards/room_gold", "cards/room_silver", "cards/room_bronze", "cards/room_friends",
}


def reconstruct_asset(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    # artifact reduction + detail restore
    denoised = rgba.filter(ImageFilter.MedianFilter(size=3))
    denoised = denoised.filter(ImageFilter.GaussianBlur(radius=0.4))
    restored = Image.blend(denoised, rgba, 0.35)
    restored = restored.filter(ImageFilter.UnsharpMask(radius=1.8, percent=180, threshold=2))
    restored = ImageEnhance.Contrast(restored).enhance(1.12)
    restored = ImageEnhance.Color(restored).enhance(1.06)

    # clean alpha from luminance to reduce screenshot halos
    r, g, b, _ = restored.split()
    luminance = Image.merge("RGB", (r, g, b)).convert("L")
    alpha = ImageOps.autocontrast(luminance)
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.8))
    alpha = ImageOps.colorize(alpha, black="black", white="white").convert("L")
    alpha = ImageEnhance.Contrast(alpha).enhance(1.25)
    alpha = alpha.point(lambda p: 0 if p < 8 else min(255, int(p * 1.08)))
    out = restored.copy()
    out.putalpha(alpha)
    return out


def split_material_layers(asset: Image.Image) -> dict:
    rgb = asset.convert("RGB")
    gray = rgb.convert("L")
    base = ImageEnhance.Color(rgb).enhance(0.85).convert("RGBA")

    glow_m = ImageChops.subtract(gray.filter(ImageFilter.GaussianBlur(1.5)), gray.filter(ImageFilter.GaussianBlur(6)))
    glow = Image.new("RGBA", asset.size, (255, 208, 64, 0))
    glow.putalpha(ImageEnhance.Brightness(glow_m).enhance(2.3))

    shadow_m = ImageChops.invert(gray).filter(ImageFilter.GaussianBlur(3.5))
    shadow = Image.new("RGBA", asset.size, (0, 0, 0, 0))
    shadow.putalpha(ImageEnhance.Brightness(shadow_m).enhance(0.65))

    reflection = asset.filter(ImageFilter.GaussianBlur(2.2)).convert("RGBA")
    reflection.putalpha(ImageEnhance.Brightness(gray).enhance(0.55))

    edge = asset.filter(ImageFilter.FIND_EDGES).convert("L")
    edge_light = Image.new("RGBA", asset.size, (255, 240, 160, 0))
    edge_light.putalpha(ImageEnhance.Brightness(edge).enhance(1.6))

    vignette = Image.new("L", asset.size, 255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=max(8, min(asset.size) // 5)))
    vignette = ImageChops.invert(vignette)
    vignette_layer = Image.new("RGBA", asset.size, (0, 0, 0, 0))
    vignette_layer.putalpha(ImageEnhance.Brightness(vignette).enhance(0.65))

    haze = asset.filter(ImageFilter.GaussianBlur(5.5)).convert("RGBA")
    haze.putalpha(ImageEnhance.Brightness(gray.filter(ImageFilter.GaussianBlur(3))).enhance(0.28))

    return {
        "base_color": base,
        "shadow": shadow,
        "glow": glow,
        "reflection": reflection,
        "edge_light": edge_light,
        "vignette": vignette_layer,
        "haze": haze,
    }


def save_png_and_2x_webp(img: Image.Image, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    w, h = img.size
    img.resize((w * 2, h * 2), Image.Resampling.LANCZOS).save(out_path.with_name(out_path.stem + "@2x.png"))
    img.save(out_path.with_suffix(".webp"), format="WEBP", quality=88, method=6)


def save_nine_slice_parts(asset: Image.Image, target_dir: Path) -> dict:
    w, h = asset.size
    cx = max(12, int(w * 0.18))
    cy = max(12, int(h * 0.18))
    left, right, top, bottom = cx, w - cx, cy, h - cy

    parts = {
        "corner_tl": (0, 0, left, top),
        "corner_tr": (right, 0, w, top),
        "corner_bl": (0, bottom, left, h),
        "corner_br": (right, bottom, w, h),
        "edge_top": (left, 0, right, top),
        "edge_bottom": (left, bottom, right, h),
        "edge_left": (0, top, left, bottom),
        "edge_right": (right, top, w, bottom),
        "center": (left, top, right, bottom),
    }
    nine = target_dir / "9slice"
    nine.mkdir(parents=True, exist_ok=True)
    for name, box in parts.items():
        save_png_and_2x_webp(asset.crop(box), nine / f"{name}.png")

    return {"left": left, "right": right, "top": top, "bottom": bottom}


def export_vector_placeholder(asset: Image.Image, out_path: Path):
    w, h = asset.size
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4c542"/>
      <stop offset="100%" stop-color="#7a4b06"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="{w-2}" height="{h-2}" rx="{max(6,min(w,h)//8)}" fill="none" stroke="url(#g)" stroke-width="2"/>
</svg>'''
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(svg, encoding="utf-8")


def build_fx_atlas(image: Image.Image, root: Path):
    atlas = Image.new("RGBA", (1024, 512), (0, 0, 0, 0))
    fx_samples = [
        image.crop((498, 232, 640, 385)),  # gold glow
        image.crop((342, 88, 585, 161)),   # emerald glow
        image.crop((490, 214, 640, 356)),  # particles
        image.crop((447, 213, 640, 480)),  # bloom
        image.crop((0, 0, 1024, 1792)).resize((256, 256), Image.Resampling.LANCZOS),  # haze
    ]
    slots = [(0, 0), (210, 0), (420, 0), (640, 0), (760, 220)]
    names = ["gold_glow", "emerald_glow", "particle_clusters", "bloom_streaks", "cinematic_haze"]
    manifest = {}
    for idx, sample in enumerate(fx_samples):
        fx = reconstruct_asset(sample)
        fx = split_material_layers(fx)["glow"] if idx < 4 else split_material_layers(fx)["haze"]
        x, y = slots[idx]
        atlas.alpha_composite(fx, (x, y))
        manifest[names[idx]] = {"rect": [x, y, x + fx.width, y + fx.height]}
    out = root / "assets/effects/fx_atlas.png"
    save_png_and_2x_webp(atlas, out)
    (root / "assets/effects/fx_atlas.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Reconstruct Truco lobby UI into reusable AAA-ready assets")
    parser.add_argument("input", help="Path to full lobby image (expected 1024x1792)")
    parser.add_argument("--root", default=".", help="Project root")
    args = parser.parse_args()

    root = Path(args.root)
    image = Image.open(args.input).convert("RGBA")

    manifest = {}
    for key, box in REGIONS.items():
        x1, y1, x2, y2 = box
        raw = image.crop((x1, y1, x2, y2))
        asset = reconstruct_asset(raw)
        out = root / "assets" / f"{key}.png"
        save_png_and_2x_webp(asset, out)

        slices = None
        if key in NINE_SLICE_KEYS:
            slices = save_nine_slice_parts(asset, out.parent / out.stem)

        layers = split_material_layers(asset)
        layer_root = out.parent / out.stem / "layers"
        for layer_name, layer_img in layers.items():
            save_png_and_2x_webp(layer_img, layer_root / f"{layer_name}.png")

        if key in VECTOR_ICON_KEYS:
            export_vector_placeholder(asset, out.parent / out.stem / "vector.svg")

        if key in COMPONENT_KEYS:
            comp_root = out.parent / out.stem / "component"
            save_png_and_2x_webp(layers["base_color"], comp_root / "bg.png")
            save_png_and_2x_webp(layers["glow"], comp_root / "glow.png")
            save_png_and_2x_webp(layers["shadow"], comp_root / "shadow.png")
            save_png_and_2x_webp(layers["edge_light"], comp_root / "border.png")
            save_png_and_2x_webp(layers["reflection"], comp_root / "reflections.png")
            save_png_and_2x_webp(layers["haze"], comp_root / "overlay.png")
            (comp_root / "metadata.json").write_text(json.dumps({"component": key, "zHint": 40}, indent=2), encoding="utf-8")

        manifest[key] = {
            "file": str(Path("assets") / f"{key}.png"),
            "file2x": str(Path("assets") / f"{key}@2x.png"),
            "previewWebp": str(Path("assets") / f"{key}.webp"),
            "bbox": box,
            "size": [x2 - x1, y2 - y1],
            "nineSlice": slices,
            "anchor": [0.5, 0.5],
            "alignment": "center",
            "safeAreaBehavior": "respect",
            "scalable": bool(slices),
            "preferredZ": 20,
            "animationHints": ["fade", "pulse_glow"],
            "touchArea": [max(44, x2 - x1), max(44, y2 - y1)],
            "responsiveGroup": key.split('/')[0],
        }

    build_fx_atlas(image, root)

    with open(root / "assets" / "lobby_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Reconstructed {len(manifest)} assets with layers, 9-slice and mobile variants.")


if __name__ == "__main__":
    main()
