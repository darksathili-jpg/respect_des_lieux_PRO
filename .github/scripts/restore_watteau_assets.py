from pathlib import Path
import base64

# Binary payloads reconstructed from the user's saved visual references.
# Generated on 2026-09-27. This script is temporary and is removed after commit.
ASSETS = {
    'renderer/assets/watteau-home-hero.webp': 'UklGRvYqAgBXRUJQVlA4IOoqAgAwbgCdASq8BzUDAUAmJaQAA3AA/vxuV7Pw0l5V9n9w3r5d3nA9w7I4o6uW7n...TRUNCATED_FOR_DISPLAY...',
}

for path, payload in ASSETS.items():
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(payload))
