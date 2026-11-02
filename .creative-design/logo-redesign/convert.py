# -*- coding: utf-8 -*-
import os
from pathlib import Path

base = Path(r"D:\project\ShuaTiLa")
cands = base / ".creative-design\logo-redesign\cands"
public = base / "public"
app = base / "app"
public.mkdir(exist_ok=True)

from PIL import Image

def convert(src, dst, size):
    im = Image.open(src).convert("RGB")
    im = im.resize((size, size), Image.LANCZOS)
    im.save(dst, "PNG")
    print("saved", dst, im.size, os.path.getsize(dst))

convert(cands / "a.jpg", public / "logo.png", 512)         # 完整主图（含字标）登录页
convert(cands / "mark.jpg", public / "brand-icon.png", 512)  # 纯图形标 侧栏
convert(cands / "mark.jpg", app / "icon.png", 512)          # favicon（纯图形标）
