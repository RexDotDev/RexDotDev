"""Write the Squads and Flagressive cards (assets/underpond-v2/*.svg) in the style of the other game cards.

Text is set with the vector outlines in scripts/terrain-glyphs.json, so the SVGs need no font files.
Usage: python3 scripts/game-cards.py
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONT = json.loads((ROOT / 'scripts/terrain-glyphs.json').read_text())
OUT = ROOT / 'assets/underpond-v2'
RED, INK, PANEL, EDGE = '#E51F1F', '#070707', '#141414', '#444'


def width(value, size):
    return sum(FONT['glyphs'][c]['width'] for c in value) * size / FONT['units']


def text(value, x, y, size, fill):
    paths, offset = [], 0
    for char in value:
        glyph = FONT['glyphs'][char]
        paths.append(f'<path transform="translate({offset:.2f} 0)" d="{glyph["path"]}"/>')
        offset += glyph['width']
    return (f'<g aria-label="{html.escape(value, quote=True)}" fill="{fill}" '
            f'transform="translate({x} {y}) scale({size / FONT["units"]:.4f} {-size / FONT["units"]:.4f})">' + ''.join(paths) + '</g>')


def card(title_attr, label, title, subtitle, caption, style, art):
    size = 70 if width(title, 70) <= 300 else round(300 / width(title, 1), 1)  # long names shrink to fit beside the art
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="620" height="325" viewBox="0 0 620 325" role="img" aria-labelledby="title">'
            f'<title id="title">{html.escape(title_attr)}</title>'
            f'<style>{style}@media(prefers-reduced-motion:reduce){{*{{animation:none!important}}}}</style>'
            f'<rect width="620" height="325" fill="{INK}"/>'
            + text(label, 32, 43, 15, '#999999')
            + text(title, 28, 167, size, '#eaeaea')
            + text(subtitle, 32, 211, 27, '#999999')
            + text(caption, 32, 288, 15, '#888888')
            + art + '</svg>\n')


# ---- Squads: a pitch with eleven shirts, one of them being guessed letter by letter
TEE = 'M31 9 L41 4 Q50 11 59 4 L69 9 L93 23 L84 42 L74 37 L74 95 L26 95 L26 37 L16 42 L7 23 Z'


def squads():
    x0, y0, w, h = 370, 35, 210, 251
    pitch = (f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6" fill="{PANEL}" stroke="{EDGE}"/>'
             f'<path d="M{x0} {y0 + h / 2}H{x0 + w}M{x0 + 55} {y0}v40h100v-40M{x0 + 55} {y0 + h}v-40h100v40" stroke="{EDGE}" fill="none"/>'
             f'<circle cx="{x0 + w / 2}" cy="{y0 + h / 2}" r="26" stroke="{EDGE}" fill="none"/>')
    rows = [(1, 258, [6]), (4, 204, [7, 5, 6, 8]), (3, 142, [5, 9, 6]), (3, 82, [6, 5, 7])]  # GK at the bottom, attack at the top
    shirts = []
    for n, y, lens in rows:
        for i in range(n):
            cx = x0 + w * (i + 1) / (n + 1)
            focus = y == rows[-1][1] and i == 1  # the centre forward is the shirt being guessed
            fill, stroke = (RED, RED) if focus else ('#1c1c1c', '#666')
            s = 0.3
            shirts.append(f'<path d="{TEE}" transform="translate({cx - 50 * s:.1f} {y - 20:.1f}) scale({s})" fill="{fill}" stroke="{stroke}" stroke-width="{3 / s * 0.35:.1f}" stroke-linejoin="round"/>')
            k = lens[i]
            dw, gap = 5, 2.2
            total = k * dw + (k - 1) * gap
            dashes = ''.join(
                f'<rect x="{cx - total / 2 + j * (dw + gap):.1f}" y="{y + 16}" width="{dw}" height="2" rx="1" '
                + (f'class="type t{j}" fill="{RED}"' if focus else 'fill="#555"') + '/>'
                for j in range(k))
            shirts.append(dashes)
            if focus:
                shirts.append(f'<circle cx="{cx:.1f}" cy="{y - 5}" r="23" fill="none" stroke="{RED}" stroke-width="1.5" class="ring"/>')
    style = ('@keyframes type{0%,8%{opacity:.25}14%,86%{opacity:1}94%,100%{opacity:.25}}'
             '@keyframes ring{50%{opacity:.35}}'
             '.type{opacity:.25;animation:type 6s ease-in-out infinite}'
             + ''.join(f'.t{j}{{animation-delay:{j * 0.35:.2f}s}}' for j in range(7))
             + '.ring{animation:ring 3s ease-in-out infinite}')
    return card('Squads. Name the starting XI. A lineup-guessing game for football and basketball.',
                '05 / OPEN SOURCE', 'Squads.', 'Name the starting XI.', 'REAL MATCHES / REAL LINEUPS', style,
                pitch + ''.join(shirts))


# ---- Flagressive: a flag at speed, with the run clock
def flagressive():
    lines = ''.join(f'<path class="sp s{i}" d="M{x} {y}h{l}" stroke="#666" stroke-width="5" stroke-linecap="round"/>'
                    for i, (x, y, l) in enumerate([(402, 96, 40), (414, 124, 30), (426, 152, 20)]))
    flag = ('<g class="wave">'
            f'<path d="M462 232 492 70" stroke="#eaeaea" stroke-width="6" stroke-linecap="round"/>'
            f'<path d="M490 78 584 69 553 109 586 147 477 151Z" fill="{RED}"/></g>')
    clock = text('0:47.3', 506, 262, 26, '#eaeaea') + text('195 / 195', 508, 288, 13, '#888888')
    style = ('@keyframes sp{0%{transform:translateX(18px);opacity:0}30%{opacity:1}100%{transform:translateX(-26px);opacity:0}}'
             '@keyframes wave{50%{transform:skewY(-1.5deg)}}'
             '.sp{animation:sp 1.6s linear infinite}.s1{animation-delay:-.5s}.s2{animation-delay:-1s}'
             '.wave{transform-origin:477px 151px;animation:wave 2.4s ease-in-out infinite}')
    return card('Flagressive. Beat the clock. A speedrun quiz of the flags and capitals of all 195 countries.',
                '06 / OPEN SOURCE', 'Flagressive.', 'Beat the clock.', '195 FLAGS / 195 CAPITALS', style,
                lines + flag + clock)


if __name__ == '__main__':
    (OUT / 'squads.svg').write_text(squads())
    (OUT / 'flagressive.svg').write_text(flagressive())
    print('wrote squads.svg, flagressive.svg')
