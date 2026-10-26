"""Deterministic, locally generated PBR facade materials, not captured facades.

One repeat represents 32 x 64 metres: 16 window bays and 16 storeys.
Building-specific palettes and construction details are photo-referenced;
individual occupied rooms and surrounding street facades are illustrative.
"""
import numpy as np
from PIL import Image, ImageDraw
from trimesh.visual.material import PBRMaterial

def facade(name, glass, frame, style='curtain', rough=.24, metal=.5):
    w,h=512,1024
    image=Image.new('RGB',(w,h),frame);d=ImageDraw.Draw(image)
    depth=Image.new('L',(w,h),210);q=ImageDraw.Draw(depth)
    mr=Image.new('RGB',(w,h),(255,210,25));r=ImageDraw.Draw(mr)
    emission=Image.new('RGB',(w,h),(0,0,0));e=ImageDraw.Draw(emission)
    for col in range(16):
        for row in range(16):
            seed=(col*73+row*37+col*row*11)%101
            x,y=col*32,row*64
            inset=2 if style=='curtain' else 7
            top=3 if style=='curtain' else 10
            bottom=7 if style=='curtain' else 15
            rect=(x+inset,y+top,x+31-inset,y+63-bottom)
            shade=(seed%19-9)*.85
            color=tuple(max(0,min(255,int(v+shade))) for v in glass)
            d.rectangle(rect,fill=color);q.rectangle(rect,fill=110)
            # Thin transoms, mullion highlights and a recessed spandrel have distinct roughness.
            d.line((x+inset,y+top,x+31-inset,y+top),fill=tuple(min(255,c+18) for c in color))
            d.rectangle((x+inset,y+57-bottom,x+31-inset,y+63-bottom),fill=tuple(int(c*.69) for c in color))
            r.rectangle(rect,fill=(255,int(255*(rough+seed/1500)),int(255*metal)))
            if seed<24:
                d.rectangle((x+inset+2,y+top+4,x+29-inset,y+top+12),fill=tuple(min(255,int(c*.62+58)) for c in color))
            if seed%7<2:
                e.rectangle((x+inset+2,y+top+2,x+29-inset,y+50-bottom),fill=(170+seed//2,121+seed//3,64+seed//4))
            if style=='curtain':
                d.line((x,y,x,y+63),fill=tuple(min(255,c+25) for c in frame),width=1)
    a=np.asarray(depth,dtype=float)/255
    dx=(np.roll(a,-1,axis=1)-np.roll(a,1,axis=1))*1.25
    dy=(np.roll(a,-1,axis=0)-np.roll(a,1,axis=0))*1.25
    n=np.dstack((-dx,dy,np.ones_like(a)));n/=np.linalg.norm(n,axis=2,keepdims=True)
    normal=Image.fromarray(((n*.5+.5)*255).astype('uint8'))
    # Publish the full-resolution source. Runtime quality changes GPU budgets,
    # never the geometry or facade texture assets delivered to another machine.
    return PBRMaterial(name=name,baseColorFactor=[1.,1.,1.,1.],baseColorTexture=image,
        metallicFactor=1.,roughnessFactor=1.,metallicRoughnessTexture=mr,normalTexture=normal,
        emissiveTexture=emission,emissiveFactor=[0.,0.,0.])

def make_facades():
    return {
      'glass':facade('facade / cool blue curtain wall',(104,144,166),(149,172,181)),
      'glassSilver':facade('facade / silver curtain wall',(145,166,174),(192,196,193),rough=.22,metal=.58),
      'glassTeal':facade('facade / muted teal curtain wall',(92,140,145),(151,171,168)),
      'glassWarm':facade('facade / champagne curtain wall',(147,151,147),(201,194,174),rough=.29,metal=.44),
      'residential':facade('facade / light residential, generalized',(87,121,135),(199,193,171),'punched',.42,.2),
      'brick':facade('facade / warm masonry, generalized',(82,105,117),(164,131,112),'punched',.43,.18),
      'towerGlass':facade('Shanghai Tower / blue silver double-skin impression',(147,179,192),(185,202,207),rough=.17,metal=.65),
      'jinmaoGlass':facade('Jin Mao / champagne metal and glazing',(150,161,166),(205,203,187),rough=.28,metal=.5),
      'swfcGlass':facade('SWFC / cool blue glazing',(83,126,155),(143,165,183),rough=.19,metal=.61),
    }
