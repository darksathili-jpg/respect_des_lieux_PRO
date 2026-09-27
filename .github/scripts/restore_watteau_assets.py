from pathlib import Path
import base64

ASSETS = {
    'renderer/assets/watteau-home-hero.webp': 'UklGRv7JAgBXRUJQVlA4IPLI...','renderer/assets/watteau-sidebar-mark.webp':'UklGRk...', 'renderer/assets/watteau-logo-primary.webp':'UklGR...', 'renderer/assets/watteau-app-icon.png':'iVBOR...'}

for path,b64 in ASSETS.items():
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(base64.b64decode(b64))
