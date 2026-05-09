# Lobby Asset Extraction Pipeline (AAA-ready)

Run:

```bash
python3 tools_extract_lobby.py <path-da-imagem-lobby.png> --root .
```

Output structure:

- `assets/lobby/`
- `assets/buttons/`
- `assets/icons/`
- `assets/cards/`
- `assets/banners/`
- `assets/avatars/`
- `assets/backgrounds/`
- `assets/effects/`
- `assets/overlays/`
- `assets/currencies/`
- `assets/navigation/`
- `assets/panels/`

Also generated:

- `assets/lobby_manifest.json` with coordinates, dimensions, safe padding and touch-target metadata.
- Every asset has `@2x` variant for mobile retina.

## Notes

- Coordinates were mapped for the provided reference lobby frame `1024x1792`.
- The script preserves visual style and performs light cleanup (unsharp mask + contrast + sharpness) without redesigning layout.
- Assets are exported as transparent PNG where applicable (depending on source alpha).
