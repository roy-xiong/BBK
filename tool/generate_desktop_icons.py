"""复用 Android 图案生成 macOS 和 Windows 图标，不依赖目标平台 SDK。"""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = Image.open(root / "assets/images/app_icon.png").convert("RGBA")
colors = ET.parse(root / "android/app/src/main/res/values/icon_colors.xml")
background = colors.find(".//color[@name='ic_launcher_background']").text
opaque = Image.new("RGBA", source.size, background)
opaque.alpha_composite(source)
catalog = root / "macos/Runner/Assets.xcassets/AppIcon.appiconset"
contents = json.loads((catalog / "Contents.json").read_text())
for item in contents["images"]:
    size = round(float(item["size"].split("x")[0]) * float(item["scale"].removesuffix("x")))
    opaque.resize((size, size), Image.Resampling.LANCZOS).save(catalog / item["filename"])
opaque.resize((256, 256), Image.Resampling.LANCZOS).save(
    root / "windows/runner/resources/app_icon.ico", format="ICO",
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("macOS / Windows 图标已生成：与 Android 共用原图案")
