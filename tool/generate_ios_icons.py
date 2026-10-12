"""从当前Android图标源生成iOS各尺寸图标，背景与Android自适应图标一致。"""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

root = Path(__file__).resolve().parent.parent
catalog = root / "ios/Runner/Assets.xcassets/AppIcon.appiconset"
contents = json.loads((catalog / "Contents.json").read_text())
colors = ET.parse(root / "android/app/src/main/res/values/icon_colors.xml")
background = colors.find(".//color[@name='ic_launcher_background']").text
source = Image.open(root / "assets/images/app_icon.png").convert("RGBA")
opaque = Image.new("RGBA", source.size, background)
opaque.alpha_composite(source)
opaque = opaque.convert("RGB")
for item in contents["images"]:
    size = round(float(item["size"].split("x")[0]) * float(item["scale"].removesuffix("x")))
    opaque.resize((size, size), Image.Resampling.LANCZOS).save(catalog / item["filename"])
print("iOS图标已生成：复用Android图案、全部尺寸无透明通道")
