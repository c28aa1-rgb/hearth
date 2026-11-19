import sys
U=34; X0=512-6*34; Y0=200
ROWS=16
outer={0:[(6,7)],1:[(6,8)],2:[(5,8)],3:[(5,8),(2,3)],4:[(5,9),(2,3)],5:[(4,9),(2,4)],6:[(2,9)],7:[(2,10)],8:[(1,10)],9:[(1,11)],10:[(1,11)],11:[(1,11)],12:[(1,11)],13:[(1,11)],14:[(2,10)],15:[(3,9)]}
middle={6:[(6,7)],7:[(5,7)],8:[(5,8)],9:[(4,8)],10:[(4,9)],11:[(3,9)],12:[(3,9)],13:[(3,9)],14:[(3,9)],15:[(4,8)]}
core={10:[(6,7)],11:[(5,7)],12:[(5,8)],13:[(5,8)],14:[(5,8)],15:[(5,7)]}
def rects(layer, x0=X0, y0=Y0, u=U):
    out=[]
    for r,spans in layer.items():
        for a,b in spans:
            out.append(f'<rect x="{x0+a*u}" y="{y0+r*u}" width="{(b-a)*u+0.5}" height="{u+0.5}"/>')
    return ''.join(out)
def flame(x0=X0,y0=Y0,u=U):
    return (f'<g fill="url(#outer)" shape-rendering="crispEdges">{rects(outer,x0,y0,u)}</g>'
            f'<g fill="url(#mid)" shape-rendering="crispEdges">{rects(middle,x0,y0,u)}</g>'
            f'<g fill="url(#core)" shape-rendering="crispEdges">{rects(core,x0,y0,u)}</g>')
def defs(y0=Y0,u=U):
    return f'''<linearGradient id="outer" x1="0" y1="{y0}" x2="0" y2="{y0+ROWS*u}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F7A24B"/><stop offset="1" stop-color="#E2742B"/></linearGradient>
<linearGradient id="mid" x1="0" y1="{y0+6*u}" x2="0" y2="{y0+ROWS*u}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFC27A"/><stop offset="1" stop-color="#FFA552"/></linearGradient>
<linearGradient id="core" x1="0" y1="{y0+10*u}" x2="0" y2="{y0+ROWS*u}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFF1D6"/><stop offset="1" stop-color="#FFD9A0"/></linearGradient>'''
def stones(x0,y,u):
    # three hearthstones under the flame
    w=u*4; g=u*0.25; total=3*w+2*g; sx=x0+6*u-total/2
    s=''
    for i in range(3):
        x=sx+i*(w+g)
        s+=f'<rect x="{x}" y="{y}" width="{w}" height="{u*1.3}" rx="{u*0.18}" fill="#3A2E26"/><rect x="{x}" y="{y}" width="{w}" height="{u*0.24}" rx="{u*0.1}" fill="#8A5A34" fill-opacity="0.75"/>'
    return s
mode=sys.argv[1]
if mode=='mac':
    print(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs()}
<linearGradient id="bg" x1="0" y1="100" x2="0" y2="924" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2B221C"/><stop offset="1" stop-color="#161210"/></linearGradient>
<radialGradient id="glow" cx="512" cy="560" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F0913A" stop-opacity="0.34"/><stop offset="1" stop-color="#F0913A" stop-opacity="0"/></radialGradient>
<clipPath id="body"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath></defs>
<g clip-path="url(#body)"><rect x="100" y="100" width="824" height="824" fill="url(#bg)"/><rect x="100" y="100" width="824" height="824" fill="url(#glow)"/>
{flame()}{stones(X0, Y0+ROWS*U+12, U)}</g>
<rect x="100.5" y="100.5" width="823" height="823" rx="185" fill="none" stroke="#FFFFFF" stroke-opacity="0.07"/></svg>''')

def plate(x, r):
    w=1024-2*x
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs()}
<linearGradient id="bg" x1="0" y1="{x}" x2="0" y2="{1024-x}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2B221C"/><stop offset="1" stop-color="#161210"/></linearGradient>
<radialGradient id="glow" cx="512" cy="560" r="{380*w/824}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F0913A" stop-opacity="0.34"/><stop offset="1" stop-color="#F0913A" stop-opacity="0"/></radialGradient>
<clipPath id="body"><rect x="{x}" y="{x}" width="{w}" height="{w}" rx="{r}"/></clipPath></defs>
<g clip-path="url(#body)"><rect x="{x}" y="{x}" width="{w}" height="{w}" fill="url(#bg)"/><rect x="{x}" y="{x}" width="{w}" height="{w}" fill="url(#glow)"/>
<g transform="translate(512 512) scale({w/824}) translate(-512 -512)">{flame()}{stones(X0, Y0+ROWS*U+12, U)}</g></g>
<rect x="{x+0.5}" y="{x+0.5}" width="{w-1}" height="{w-1}" rx="{r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.07"/></svg>'''
if mode=='win':
    print(plate(24, 176))
if mode=='mark':
    # The flame and hearthstones alone, cropped tight, transparent.
    top=Y0-4; bottom=Y0+ROWS*U+12+U*1.3+4; left=X0+0.5*U-4; right=X0+11.5*U+4
    # stones are wider than the flame
    w_st=3*4*U+2*U*0.25; left=min(left,X0+6*U-w_st/2-4); right=max(right,X0+6*U+w_st/2+4)
    print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{left} {top} {right-left} {bottom-top}"><defs>{defs()}</defs>{flame()}{stones(X0, Y0+ROWS*U+12, U)}</svg>')
