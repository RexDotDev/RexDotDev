"""Refresh the Underpond terrain from GitHub's contribution calendar (stdlib only)."""
import argparse
import datetime as dt
import html
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FONT = json.loads((ROOT / 'scripts/terrain-glyphs.json').read_text())


def text(value, x, y, size=20, fill='#eaeaea', spacing=0):
    paths, offset = [], 0
    for char in str(value):
        glyph = FONT['glyphs'][char]
        paths.append(f'<path transform="translate({offset:.2f} 0)" d="{glyph["path"]}"/>')
        offset += glyph['width'] + spacing * FONT['units'] / size
    return f'<g aria-label="{html.escape(str(value), quote=True)}" fill="{fill}" transform="translate({x} {y}) scale({size/FONT["units"]} {-size/FONT["units"]})">' + ''.join(paths) + '</g>'


def fetch_calendar(username):
    query = 'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}}}'
    req = urllib.request.Request('https://api.github.com/graphql',
        data=json.dumps({'query': query, 'variables': {'login': username}}).encode(),
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Content-Type': 'application/json', 'User-Agent': 'Underpond-profile-terrain'})
    with urllib.request.urlopen(req, timeout=45) as response:
        result = json.load(response)
    if result.get('errors') or not result.get('data', {}).get('user'):
        raise ValueError('GitHub did not return a valid contribution calendar')
    return result['data']['user']['contributionsCollection']['contributionCalendar']


def validate(calendar):
    weeks = calendar['weeks']
    days = [day for week in weeks for day in week['contributionDays']]
    if not 52 <= len(weeks) <= 54 or not 365 <= len(days) <= 373:
        raise ValueError('Expected a complete annual contribution calendar')
    dates = [dt.date.fromisoformat(day['date']) for day in days]
    if any(b-a != dt.timedelta(days=1) for a,b in zip(dates, dates[1:])):
        raise ValueError('Contribution dates are not consecutive')
    if any(type(d['contributionCount']) is not int or d['contributionCount'] < 0 for d in days):
        raise ValueError('Invalid daily count')
    if sum(d['contributionCount'] for d in days) != calendar['totalContributions']:
        raise ValueError('Daily counts do not match the total')
    return days


def render(calendar, refreshed):
    days = validate(calendar)
    weeks = calendar['weeks']
    peak = max(d['contributionCount'] for d in days)
    active = sum(d['contributionCount'] > 0 for d in days)
    step = 936 / max(1, len(weeks)-1)
    def position(w, weekday, count):
        return (106+w*step+weekday*30, 296+weekday*17-w*.8-82*(count/max(1,peak))**.6)
    def points(row):
        return ' '.join(f'{x:.1f},{y:.1f}' for x,y in row)
    rows = [[] for _ in range(7)]
    columns, vertices = [], []
    for w, week in enumerate(weeks):
        column = []
        for day in week['contributionDays']:
            weekday = (dt.date.fromisoformat(day['date']).weekday()+1) % 7
            point = position(w, weekday, day['contributionCount'])
            rows[weekday].append(point)
            column.append(point)
            vertices.append((day['contributionCount'], point))
        columns.append(column)
    total = f'{calendar["totalContributions"]:,}'
    b = text('The build leaves a trace.',35,84,64,spacing=-2)+text(total,997,86,62,'#E51F1F',-2)+text('GITHUB CONTRIBUTIONS',1000,118,14,'#999999',.6)
    b += '<defs><linearGradient id="terrain" x2="0" y2="1"><stop stop-color="#E51F1F" stop-opacity=".18"/><stop offset="1" stop-color="#E51F1F" stop-opacity="0"/></linearGradient><linearGradient id="sweep"><stop stop-color="#E51F1F" stop-opacity="0"/><stop offset=".5" stop-color="#E51F1F" stop-opacity=".25"/><stop offset="1" stop-color="#E51F1F" stop-opacity="0"/></linearGradient><clipPath id="land"><rect x="80" y="160" width="1150" height="280"/></clipPath></defs>'
    for d in range(6,-1,-1):
        row = rows[d]
        b += f'<polygon points="{points(row)} {row[-1][0]:.1f},420 {row[0][0]:.1f},420" fill="url(#terrain)"/><polyline points="{points(row)}" fill="none" stroke="{"#E51F1F" if d%2==0 else "#777777"}" stroke-width="{1.4 if d%2==0 else .7}" opacity=".8"/>'
    for column in columns:
        b += f'<polyline points="{points(column)}" fill="none" stroke="#777777" stroke-width=".6" opacity=".4"/>'
    _, (x,y) = max(vertices,key=lambda v:v[0])
    label_x = max(85, x-135)
    b += f'<circle cx="{x}" cy="{y}" r="4" fill="#eaeaea"/><path d="M{x} {y}v-48H{label_x}" stroke="#999" fill="none"/>' + text(f'PEAK / {peak} IN A DAY',label_x,y-59,13,'#bbb',.5)
    b += '<g clip-path="url(#land)"><rect class="scan" x="-150" y="165" width="180" height="270" fill="url(#sweep)"/></g><path d="M36 448H1244" stroke="#303030"/>'
    b += text(f'{days[0]["date"]} — {days[-1]["date"]}',36,481,17,'#999')+text(f'{active} ACTIVE DAYS',551,481,16,'#999',.7)+text('ONE VERTEX / ONE DAY',1020,481,15,'#999',.5)
    b += text(f'Updated daily from GitHub. Last refresh: {refreshed} UTC.',36,514,15,'#777777')
    title = f'GitHub contribution terrain. {total} contributions, {active} active days. Updated {refreshed} UTC.'
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="550" viewBox="0 0 1280 550" role="img" aria-labelledby="title"><title id="title">'+title+'</title><style>@keyframes scan{to{transform:translateX(1500px)}}.scan{animation:scan 7s linear infinite}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style><rect width="1280" height="550" fill="#070707"/>'+b+'</svg>\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, help='Offline calendar JSON for validation')
    parser.add_argument('--output', type=Path, default=ROOT/'assets/underpond-v2/terrain.svg')
    args = parser.parse_args()
    calendar = json.loads(args.input.read_text()) if args.input else fetch_calendar(os.environ.get('PROFILE_USER','RexDotDev'))
    now = dt.datetime.now(dt.timezone.utc).date()
    days = validate(calendar)
    if not args.input and abs((now-dt.date.fromisoformat(days[-1]['date'])).days) > 1:
        raise ValueError('GitHub returned stale data; keeping existing graphic')
    svg = render(calendar, now.isoformat())
    args.output.write_text(svg)
    print(f'Refreshed terrain: {calendar["totalContributions"]:,} contributions through {days[-1]["date"]}')

if __name__ == '__main__':
    main()
