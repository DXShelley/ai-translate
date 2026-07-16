#!/usr/bin/env python3
"""Generate browser extension icons from the VS Code extension icon."""

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ICON = ROOT / "vscode-extension" / "media" / "icon.png"
BROWSERS = ("chrome", "edge", "firefox")
SIZES = (16, 48, 128)


def main():
    with Image.open(SOURCE_ICON) as source:
        source = source.convert("RGBA")
        for browser in BROWSERS:
            output_dir = ROOT / "packages" / browser / "icons"
            output_dir.mkdir(parents=True, exist_ok=True)
            for size in SIZES:
                output_file = output_dir / f"icon{size}.png"
                if size == source.width == source.height:
                    copyfile(SOURCE_ICON, output_file)
                else:
                    output = source.resize((size, size), Image.Resampling.LANCZOS)
                    output.save(output_file, "PNG")
                print(f"Created: {output_file.relative_to(ROOT)} ({size}x{size})")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()
