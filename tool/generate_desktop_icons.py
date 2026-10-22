"""保留Android原图案，按reader的96px外边距生成透明圆角桌面图标。"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

root = Path(__file__).resolve().parent.parent
source_path = root / "assets/images/app_icon.png"
source = Image.open(source_path).convert("RGBA")
assert source.size == (1024, 1024), "原图必须是1024px正方形，避免拉伸"
# 原图装饰曾越过圆角。先以高分辨率蒙版统一裁切，不能给透明角落填充矩形底色。
mask = Image.new("L", (4096, 4096))
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 4095, 4095), radius=208 * 4, fill=255)
mask = mask.resize(source.size, Image.Resampling.LANCZOS)
source.putalpha(ImageChops.darker(source.getchannel("A"), mask))
source.save(source_path)
desktop = Image.new("RGBA", source.size)
desktop.alpha_composite(source.resize((832, 832), Image.Resampling.LANCZOS), (96, 96))
catalog = root / "macos/Runner/Assets.xcassets/AppIcon.appiconset"
contents = json.loads((catalog / "Contents.json").read_text())
for item in contents["images"]:
    size = round(float(item["size"].split("x")[0]) * float(item["scale"].removesuffix("x")))
    icon = desktop.resize((size, size), Image.Resampling.LANCZOS)
    assert icon.getpixel((0, 0))[3] == 0, "桌面图标外角必须透明"
    icon.save(catalog / item["filename"])
desktop.resize((256, 256), Image.Resampling.LANCZOS).save(
    root / "windows/runner/resources/app_icon.ico", format="ICO",
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
# Android 8以前没有系统自适应遮罩，采用同样的留白和透明圆角。
for density, size in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
    desktop.resize((size, size), Image.Resampling.LANCZOS).save(
        root / f"android/app/src/main/res/mipmap-{density}/ic_launcher.png")
alpha = desktop.getchannel("A")
assert alpha.getbbox() == (96, 96, 928, 928), "图案外边距必须与reader一致"
assert all(alpha.getpixel((edge, y)) == 0 for edge in (0, 1023) for y in range(1024))
assert all(alpha.getpixel((x, edge)) == 0 for edge in (0, 1023) for x in range(1024))
print("桌面与Android旧版图标已生成：832px图案、96px外边距、透明外沿")
