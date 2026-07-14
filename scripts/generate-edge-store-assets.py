#!/usr/bin/env python3
"""Generate Microsoft Edge Add-ons store image assets."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT_DIR = Path("assets/edge-store")
BLUE = (37, 99, 235)
BLUE_DARK = (30, 64, 175)
GREEN = (16, 185, 129)
INK = (17, 24, 39)
MUTED = (107, 114, 128)
LINE = (229, 231, 235)
PANEL = (255, 255, 255)
BG = (245, 247, 251)


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def gradient(size, top=BLUE, bottom=BLUE_DARK):
    w, h = size
    img = Image.new("RGBA", size)
    for y in range(h):
        ratio = y / max(1, h - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3)) + (255,)
        for x in range(w):
            img.putpixel((x, y), color)
    return img


def draw_translate_mark(img, scale=1.0):
    draw = ImageDraw.Draw(img)
    w, h = img.size
    pad = int(w * 0.20)
    cx = w // 2
    cy = h // 2
    draw.ellipse((pad, pad, w - pad, h - pad), outline=(255, 255, 255), width=max(4, int(w * 0.055)))
    draw.arc((pad + 18, cy - 42, w - pad - 18, cy + 42), 0, 180, fill=(191, 219, 254), width=max(2, int(w * 0.014)))
    draw.arc((pad + 18, cy - 42, w - pad - 18, cy + 42), 180, 360, fill=(191, 219, 254), width=max(2, int(w * 0.014)))
    draw.arc((cx - 62, pad + 12, cx + 62, h - pad - 12), 270, 90, fill=(191, 219, 254), width=max(2, int(w * 0.014)))
    arrow = int(w * 0.18)
    draw.polygon([(cx - arrow, cy - arrow // 2), (cx - arrow * 2, cy), (cx - arrow, cy + arrow // 2)], fill=(255, 255, 255))
    draw.polygon([(cx + arrow, cy - arrow // 2), (cx + arrow * 2, cy), (cx + arrow, cy + arrow // 2)], fill=(255, 255, 255))


def create_logo():
    img = gradient((300, 300))
    mask = Image.new("L", (300, 300), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 299, 299), radius=54, fill=255)
    img.putalpha(mask)
    draw_translate_mark(img)
    img.save(OUT_DIR / "edge-logo-300.png")


def draw_browser_frame(draw, box, title):
    x1, y1, x2, y2 = box
    rounded(draw, box, 18, PANEL, LINE, 1)
    draw.rectangle((x1, y1 + 56, x2, y1 + 58), fill=LINE)
    for i, color in enumerate([(239, 68, 68), (245, 158, 11), (34, 197, 94)]):
        draw.ellipse((x1 + 22 + i * 24, y1 + 22, x1 + 36 + i * 24, y1 + 36), fill=color)
    rounded(draw, (x1 + 130, y1 + 16, x2 - 26, y1 + 42), 13, (243, 244, 246))
    draw.text((x1 + 146, y1 + 20), title, fill=MUTED, font=font(14))


def draw_toolbar(draw, x, y):
    rounded(draw, (x, y, x + 520, y + 56), 12, (31, 41, 55))
    labels = ["划词", "句子", "段落"]
    for idx, label in enumerate(labels):
        bx = x + 14 + idx * 76
        rounded(draw, (bx, y + 10, bx + 62, y + 46), 8, (55, 65, 81))
        draw.text((bx + 14, y + 17), label, fill=(255, 255, 255), font=font(14))
    rounded(draw, (x + 260, y + 10, x + 430, y + 46), 8, (255, 255, 255))
    draw.text((x + 276, y + 18), "查单词", fill=MUTED, font=font(14))
    draw.text((x + 472, y + 14), "x", fill=(255, 255, 255), font=font(22))


def create_translation_screenshot():
    img = Image.new("RGB", (1280, 800), BG)
    draw = ImageDraw.Draw(img)
    draw.text((64, 52), "AI Translate", fill=INK, font=font(42, True))
    draw.text((64, 108), "网页划词后即时翻译，并支持单词释义与发音。", fill=MUTED, font=font(24))
    draw_browser_frame(draw, (70, 170, 1210, 730), "https://example.com/article")
    draw.text((128, 270), "Artificial intelligence is transforming how teams read, write, and collaborate across languages.", fill=INK, font=font(30))
    draw.rectangle((128, 310, 910, 318), fill=(191, 219, 254))
    draw.text((128, 370), "Select text on any page to translate selections, sentences, or whole paragraphs.", fill=INK, font=font(26))
    draw_toolbar(draw, 420, 420)
    rounded(draw, (420, 488, 1010, 650), 14, PANEL, LINE, 1)
    draw.text((448, 520), "Artificial intelligence is transforming...", fill=MUTED, font=font(18))
    draw.text((448, 565), "人工智能正在改变团队跨语言阅读、写作和协作的方式。", fill=INK, font=font(24, True))
    draw.text((448, 612), "美 /ˌɑːrtɪˈfɪʃəl/    英 /ˌɑːtɪˈfɪʃəl/", fill=GREEN, font=font(18))
    img.save(OUT_DIR / "screenshot-translation-1280x800.png")


def create_settings_screenshot():
    img = Image.new("RGB", (1280, 800), BG)
    draw = ImageDraw.Draw(img)
    draw.text((64, 52), "模型与交互配置", fill=INK, font=font(42, True))
    draw.text((64, 108), "配置 OpenAI 兼容接口、弹框语言、悬停翻译和请求日志。", fill=MUTED, font=font(24))
    rounded(draw, (70, 170, 1210, 730), 18, PANEL, LINE, 1)
    rounded(draw, (70, 170, 330, 730), 18, (248, 250, 252), LINE, 1)
    draw.text((102, 210), "模型配置", fill=INK, font=font(26, True))
    for idx, name in enumerate(["LM Studio", "Ollama", "OpenAI", "DeepSeek"]):
        y = 268 + idx * 70
        fill = (219, 234, 254) if idx == 0 else PANEL
        rounded(draw, (102, y, 298, y + 48), 10, fill, LINE, 1)
        draw.text((124, y + 12), name, fill=INK, font=font(17, True))
    x = 380
    draw.text((x, 210), "前端交互", fill=INK, font=font(30, True))
    fields = [
        ("悬停翻译", "启用"),
        ("悬停触发键", "Ctrl"),
        ("弹框语言", "English"),
        ("输入框翻译", "启用"),
        ("请求日志", "关闭"),
        ("触发空格次数", "3"),
    ]
    for idx, (label, value) in enumerate(fields):
        col = idx % 2
        row = idx // 2
        fx = x + col * 370
        fy = 278 + row * 104
        draw.text((fx, fy), label, fill=MUTED, font=font(16))
        rounded(draw, (fx, fy + 28, fx + 300, fy + 72), 9, (249, 250, 251), LINE, 1)
        draw.text((fx + 18, fy + 40), value, fill=INK, font=font(18, True))
    rounded(draw, (x - 18, 604, x + 112, 652), 10, BLUE)
    draw.text((x, 616), "保存配置", fill=(255, 255, 255), font=font(18, True))
    draw.text((x + 152, 616), "测试当前模型", fill=BLUE, font=font(18, True))
    img.save(OUT_DIR / "screenshot-settings-1280x800.png")


def create_browser_screenshot():
    img = Image.new("RGB", (1280, 800), BG)
    draw = ImageDraw.Draw(img)
    draw.text((64, 52), "多浏览器发布包", fill=INK, font=font(42, True))
    draw.text((64, 108), "分别为 Edge、Chrome、Firefox 生成独立扩展包。", fill=MUTED, font=font(24))
    cards = [("Edge", "Manifest V3", (16, 185, 129)), ("Chrome", "Manifest V3", BLUE), ("Firefox", "Manifest V2", (245, 158, 11))]
    for idx, (title, subtitle, color) in enumerate(cards):
        x = 100 + idx * 390
        y = 230
        rounded(draw, (x, y, x + 300, y + 360), 20, PANEL, LINE, 1)
        icon = gradient((126, 126), color, tuple(max(0, c - 55) for c in color))
        mask = Image.new("L", (126, 126), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 125, 125), radius=24, fill=255)
        icon.putalpha(mask)
        draw_translate_mark(icon)
        img.paste(icon.convert("RGB"), (x + 87, y + 48), icon)
        draw.text((x + 100, y + 210), title, fill=INK, font=font(30, True))
        draw.text((x + 76, y + 258), subtitle, fill=MUTED, font=font(20))
        rounded(draw, (x + 62, y + 304, x + 238, y + 348), 12, (239, 246, 255))
        draw.text((x + 92, y + 316), "v3.0.0", fill=BLUE, font=font(20, True))
    img.save(OUT_DIR / "screenshot-packages-1280x800.png")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    create_logo()
    create_translation_screenshot()
    create_settings_screenshot()
    create_browser_screenshot()
    print(f"Generated Edge store assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
