"""
Rebuild data/gta-interventions.json from GTA CSV exports.
Re-run whenever new CSVs are downloaded from GTA.

Usage: python3 scripts/build_gta.py
"""
import csv, sys, json, os
from datetime import datetime
from collections import Counter

csv.field_size_limit(sys.maxsize)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(ROOT, 'data/wto_hs_codes.json')) as f:
    hs_codes = json.load(f)

code_to_mineral = {}
for mineral, codes in hs_codes.items():
    for c in codes:
        code_to_mineral[c] = mineral

# Title must mention at least one of these to be kept.
# Catches mineral names, mining/processing terms, and battery supply chain.
KEYWORDS = [
    'cobalt', 'copper', 'graphite', 'lithium', 'manganese', 'nickel',
    'rare earth', 'silicon', 'chromium', 'chrome ore', 'tungsten',
    'molybdenum', 'vanadium', 'platinum', 'palladium',
    'mine ', 'mining', 'miner', 'refinery', 'refining',
    'smelting', 'smelter', 'metallurg',
    'battery', 'batteries', 'critical mineral',
]

COUNTRY_NORMALIZE = {
    'United States of America': 'United States',
    'Republic of Korea': 'South Korea',
    "People's Republic of China": 'China',
    'Democratic Republic of the Congo': 'DR Congo',
    'United Republic of Tanzania': 'Tanzania',
    'Korea': 'South Korea',
}

def norm_country(c):
    return COUNTRY_NORMALIZE.get(c.strip(), c.strip())

def fmt_date(s):
    if not s:
        return '', ''
    try:
        dt = datetime.strptime(s[:10], '%Y-%m-%d')
        return dt.strftime('%b %d, %Y'), s[:10]
    except Exception:
        return '', ''

def is_relevant(title):
    t = title.lower()
    return any(kw in t for kw in KEYWORDS)

interventions = []
stats = Counter()

SOURCES = [
    ('gta-subsidies.csv', 'subsidy'),
    ('gta-traderestrictions.csv', 'trade'),
]

for fname, source_type in SOURCES:
    path = os.path.join(ROOT, 'data', fname)
    with open(path, encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row.get('Is In Force') != '1':
                continue

            title = row.get('State Act Title', '').strip()
            if not is_relevant(title):
                stats['dropped_keyword'] += 1
                continue

            # Map affected HS codes → minerals
            products = set(p.strip() for p in row.get('Affected Products', '').split(',') if p.strip())
            minerals = sorted(set(code_to_mineral[c] for c in products if c in code_to_mineral))
            if not minerals:
                stats['dropped_no_mineral'] += 1
                continue

            eval_raw = row.get('GTA Evaluation', '')
            evaluation = {'Red': 'harmful', 'Amber': 'murky', 'Green': 'liberalising'}.get(eval_raw, 'murky')

            if source_type == 'subsidy':
                deal_type = 'Subsidy'
            else:
                deal_type = 'Trade Deal' if evaluation == 'liberalising' else 'Trade Control'

            date_raw = row.get('Date Implemented') or row.get('Date Announced') or ''
            date_display, date_iso = fmt_date(date_raw)

            implementers = [norm_country(j) for j in row.get('Implementing Jurisdictions', '').split(',') if j.strip()]

            interventions.append({
                'id': row.get('Intervention ID', ''),
                'title': title,
                'evaluation': evaluation,
                'dealType': deal_type,
                'interventionType': row.get('Intervention Type', ''),
                'minerals': minerals,
                'implementers': implementers,
                'date': date_display,
                'dateISO': date_iso,
                'link': row.get('Intervention URL', ''),
            })
            stats['kept'] += 1

interventions.sort(key=lambda x: x['dateISO'], reverse=True)

out_path = os.path.join(ROOT, 'data/gta-interventions.json')
with open(out_path, 'w') as f:
    json.dump({'interventions': interventions}, f, separators=(',', ':'))

size_kb = os.path.getsize(out_path) // 1024
by_type = Counter(i['dealType'] for i in interventions)

print(f"Kept:    {stats['kept']} interventions")
print(f"Dropped: {stats['dropped_keyword']} (no keyword)  +  {stats['dropped_no_mineral']} (no mineral match)")
print(f"By type: {dict(by_type)}")
print(f"Written: data/gta-interventions.json ({size_kb} KB)")
