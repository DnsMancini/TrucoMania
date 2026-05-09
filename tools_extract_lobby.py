#!/usr/bin/env python3
from PIL import Image, ImageFilter, ImageEnhance
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

FOLDERS = [
    "assets/lobby",
    "assets/buttons",
    "assets/icons",
    "assets/cards",
    "assets/banners",
    "assets/avatars",
    "assets/backgrounds",
    "assets/effects",
    "assets/overlays",
    "assets/currencies",
    "assets/navigation",
    "assets/panels",
]


def enhance(img: Image.Image) -> Image.Image:
    img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=180, threshold=2))
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Sharpness(img).enhance(1.15)
    return img


def export_asset(crop: Image.Image, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    clean = enhance(crop.convert("RGBA"))
    clean.save(out_path)

    w, h = clean.size
    up2x = clean.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
    up2x = up2x.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=1))
    up2x.save(out_path.with_name(out_path.stem + "@2x.png"))


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Extract Truco lobby assets into reusable PNGs")
    parser.add_argument("input", help="Path to full lobby image (expected 1024x1792)")
    parser.add_argument("--root", default=".", help="Project root")
    args = parser.parse_args()

    root = Path(args.root)
    for folder in FOLDERS:
        (root / folder).mkdir(parents=True, exist_ok=True)

    image = Image.open(args.input).convert("RGBA")

    manifest = {}
    for key, box in REGIONS.items():
        x1, y1, x2, y2 = box
        crop = image.crop((x1, y1, x2, y2))
        out = root / "assets" / f"{key}.png"
        export_asset(crop, out)
        manifest[key] = {
            "file": str(Path("assets") / f"{key}.png"),
            "file2x": str(Path("assets") / f"{key}@2x.png"),
            "bbox": box,
            "size": [x2 - x1, y2 - y1],
            "safePadding": 8,
            "touchTargetMin": [44, 44],
        }

    with open(root / "assets" / "lobby_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Exported {len(manifest)} assets and @2x variants.")


if __name__ == "__main__":
    main()
