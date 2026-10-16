# 把若干关键帧横向拼成一张联系图：python3 contact.py 输出.png 帧1.png 帧2.png ...
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w = 640; ims = [im.resize((w, int(im.height * w / im.width))) for im in ims]
h = max(im.height for im in ims); gap = 8
sheet = Image.new('RGB', (w * len(ims) + gap * (len(ims) - 1), h + 28), (20, 20, 20)); d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x = i * (w + gap); sheet.paste(im, (x, 28)); d.text((x + 6, 8), f.split('/')[-1], fill=(220, 220, 220))
sheet.save(out)
