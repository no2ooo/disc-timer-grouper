"""生成 tabBar 图标(81x81 PNG,符合微信规范)
- 时钟:圆圈+时针分针(时钟意象)
- 计时:圆圈+短针(秒表意象)
- 分组:三个人形点
- 我的:人形
- 设置:齿轮
active 态为荧光黄 #f6ff5c,inactive 态为浅灰 #6a6a6a
"""
from PIL import Image, ImageDraw
import os

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)))
# ↑ 写在脚本所在目录(assets/),不嵌套
os.makedirs(ASSETS, exist_ok=True)

C_ACTIVE = (246, 255, 92, 255)   # #f6ff5c
C_INACTIVE = (180, 180, 180, 255) # 浅灰
W = H = 81

def new_img(color):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    return img, d

def save(img, name):
    img.save(os.path.join(ASSETS, name + '.png'))

# 1) 时钟(圆圈+指针)
def draw_clock(color):
    img, d = new_img(color)
    cx, cy = 40, 40
    # 外圆
    d.ellipse((10, 10, 70, 70), outline=color, width=4)
    # 时针(指向 12 点方向)
    d.line((cx, cy, cx, cy - 18), fill=color, width=4)
    # 分针(指向 3 点方向)
    d.line((cx, cy, cx + 16, cy), fill=color, width=4)
    # 中心点
    d.ellipse((36, 36, 44, 44), fill=color)
    return img

# 2) 计时(秒表)
def draw_timer(color):
    img, d = new_img(color)
    # 外圆
    d.ellipse((10, 10, 70, 70), outline=color, width=4)
    # 顶按钮
    d.rectangle((35, 5, 45, 12), fill=color)
    # 指针(从中心到 1 点方向)
    d.line((40, 40, 58, 22), fill=color, width=4)
    # 中心点
    d.ellipse((36, 36, 44, 44), fill=color)
    return img

# 3) 分组(三个小圆+连接线)
def draw_group(color):
    img, d = new_img(color)
    # 顶部 3 个圆
    for x in (18, 40, 62):
        d.ellipse((x-8, 12, x+8, 28), fill=color)
    # 底部连线
    d.line((18, 36, 62, 36), fill=color, width=3)
    d.line((18, 50, 62, 50), fill=color, width=3)
    # 中间大圆
    d.ellipse((33, 56, 47, 70), outline=color, width=3)
    return img

# 4) 我的(人形)
def draw_me(color):
    img, d = new_img(color)
    # 头
    d.ellipse((30, 12, 50, 32), fill=color)
    # 身体
    d.pieslice((20, 32, 60, 72), 180, 360, fill=color)
    return img

# 5) 设置(齿轮简化:六边形+中心圆)
def draw_setting(color):
    img, d = new_img(color)
    # 外八角
    cx, cy = 40, 40
    import math
    pts = []
    for i in range(8):
        a = i * (math.pi / 4)
        r = 28 if i % 2 == 0 else 22
        pts.append((cx + r*math.cos(a), cy + r*math.sin(a)))
    d.polygon(pts, fill=color)
    # 中心镂空
    d.ellipse((30, 30, 50, 50), fill=(0, 0, 0, 0))
    return img

# 生成所有
for name, fn in [('tab-clock', draw_clock), ('tab-timer', draw_timer),
                 ('tab-group', draw_group), ('tab-me', draw_me),
                 ('tab-set', draw_setting)]:
    save(fn(C_ACTIVE), name + '-active')
    save(fn(C_INACTIVE), name)

print('OK', os.listdir(ASSETS))
