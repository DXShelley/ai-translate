#!/usr/bin/env python3
"""生成浏览器扩展图标"""

from PIL import Image, ImageDraw, ImageFont
import os

# 输出目录
OUT_DIR = 'packages/firefox/icons'

# 图标尺寸
SIZES = [16, 48, 128]

# 配色
BG_COLOR = (37, 99, 235)  # 蓝色 #2563EB
BG_COLOR_DARK = (30, 64, 175)  # 深蓝 #1E40AF
WHITE = (255, 255, 255)
LIGHT_BLUE = (147, 197, 253)  # #93C5FD

def create_gradient_bg(size):
    """创建渐变背景"""
    img = Image.new('RGBA', (size, size))
    for y in range(size):
        ratio = y / size
        r = int(BG_COLOR[0] + (BG_COLOR_DARK[0] - BG_COLOR[0]) * ratio)
        g = int(BG_COLOR[1] + (BG_COLOR_DARK[1] - BG_COLOR[1]) * ratio)
        b = int(BG_COLOR[2] + (BG_COLOR_DARK[2] - BG_COLOR[2]) * ratio)
        for x in range(size):
            img.putpixel((x, y), (r, g, b, 255))
    return img

def draw_icon(size):
    """绘制图标"""
    img = create_gradient_bg(size)

    # 圆角矩形裁剪
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    corner = size // 6
    mask_draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=corner, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)

    # 计算元素大小
    padding = size // 5
    inner_size = size - padding * 2

    # 绘制简化的地球/翻译图标
    cx, cy = size // 2, size // 2

    if size >= 48:
        # 外圈 - 圆环
        ring_color = WHITE
        draw.ellipse([padding, padding, size-padding, size-padding],
                    outline=ring_color, width=max(1, size//16))

        if size >= 128:
            # 大图标：绘制经纬线模拟地球
            line_color = LIGHT_BLUE
            # 横线
            for offset in [-2, 0, 2]:
                y = cy + offset * size // 16
                draw.arc([padding+2, y-1, size-padding-2, y+1],
                        start=0, end=180, fill=line_color, width=1)
            # 竖弧线
            draw.arc([cx-size//4, cy-size//4, cx+size//4, cy+size//4],
                    start=270, end=90, fill=line_color, width=1)

        # 中心文字或符号
        if size >= 48:
            # 绘制 "译" 字简写或翻译箭头
            arrow_color = WHITE
            arrow_size = inner_size // 3

            # 左箭头 <
            ax = cx - arrow_size
            ay = cy
            aw = arrow_size
            ah = arrow_size // 2

            draw.polygon([
                (ax + aw, ay - ah),  # 左上
                (ax, ay),             # 中间
                (ax + aw, ay + ah),   # 左下
            ], fill=arrow_color)

            # 右箭头 >
            ax = cx
            draw.polygon([
                (ax, ay - ah),         # 左上
                (ax + aw, ay),         # 中间
                (ax, ay + ah),         # 左下
            ], fill=arrow_color)
    else:
        # 小图标：简单圆点
        dot_r = size // 8
        draw.ellipse([cx-dot_r, cy-dot_r, cx+dot_r, cy+dot_r], fill=WHITE)

    return img

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    for size in SIZES:
        img = draw_icon(size)

        # 保存 PNG
        out_file = os.path.join(OUT_DIR, f'icon{size}.png')
        img.save(out_file, 'PNG')
        print(f'Created: {out_file} ({size}x{size})')

    print('\nAll icons generated successfully!')

if __name__ == '__main__':
    main()
