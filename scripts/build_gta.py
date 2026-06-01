"""
Rebuild data/gta-interventions.json from GTA CSV exports.
Re-run whenever new CSVs are downloaded from GTA.

Requires: pip install groq
Set GROQ_API_KEY in environment (or .env file).

Usage: python3 scripts/build_gta.py
"""
import csv, sys, json, os
from datetime import datetime
from collections import Counter

csv.field_size_limit(sys.maxsize)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Load Groq ──────────────────────────────────────────────────────────────
try:
    from groq import Groq
    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    USE_GROQ = bool(os.environ.get("GROQ_API_KEY"))
except ImportError:
    groq_client = None
    USE_GROQ = False

if not USE_GROQ:
    print("⚠  GROQ_API_KEY not set — skipping AI enrichment (titles/summaries will be raw)")

# ── Config ─────────────────────────────────────────────────────────────────
with open(os.path.join(ROOT, 'data/wto_hs_codes.json')) as f:
    hs_codes = json.load(f)

code_to_mineral = {}
for mineral, codes in hs_codes.items():
    for c in codes:
        code_to_mineral[c] = mineral

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
    return any(kw in title.lower() for kw in KEYWORDS)

# ── Groq enrichment ────────────────────────────────────────────────────────
BATCH_SIZE = 25

SYSTEM_PROMPT = """You are a critical minerals policy analyst writing for a trade tracker dashboard.
Your job: rewrite each GTA policy intervention with a clear title and summary.

TITLE rules (MUST follow):
- 8-12 words maximum
- Must include ALL THREE: (1) country name, (2) action verb, (3) mineral name
- Format: "[Country] [verb] [action] on [mineral]"
- Use active verbs: imposes, bans, grants, enacts, restricts, exempts, awards, extends, requires, launches
- Examples:
    "China Imposes Export Licensing Requirement on Graphite"
    "Indonesia Bans Export of Unprocessed Nickel Ore"
    "USA Awards $117M Grant for Synthetic Graphite Development"
    "Australia Provides AUD 2B Subsidy for Aluminium Industry"

SUMMARY rules:
- 2-3 sentences, 40-70 words total
- Sentence 1: What country did what specific action, on which mineral
- Sentence 2: Key details — scope, amount, mechanism, or who is affected
- Sentence 3 (optional): Why it matters or notable context
- Do NOT start with "This policy" or "The government"
- Include dollar/currency amount if mentioned in the title"""

def enrich_batch(records):
    lines = []
    for i, r in enumerate(records):
        implementers = ', '.join(r['implementers'][:3]) or 'Unknown'
        minerals = ', '.join(r['minerals']) or 'Unknown'
        lines.append(f"[{i}] implementers={implementers} | minerals={minerals} | type={r['interventionType']} | title={r['title']}")

    prompt = f"""{SYSTEM_PROMPT}

Entries (index | implementers | minerals | intervention type | original title):
{chr(10).join(lines)}

Return ONLY valid JSON:
{{"items":[{{"i":<index>,"title":"<new title>","summary":"<2-3 sentence summary>"}}]}}"""

    resp = groq_client.chat.completions.create(
        model='llama-3.1-8b-instant',
        messages=[{'role': 'user', 'content': prompt}],
        response_format={'type': 'json_object'},
        max_tokens=2500,
        temperature=0.1,
    )
    parsed = json.loads(resp.choices[0].message.content)
    return {item['i']: item for item in (parsed.get('items') or [])}

# ── Build interventions ────────────────────────────────────────────────────
interventions = []
stats = Counter()

for fname, source_type in [('gta-subsidies.csv', 'subsidy'), ('gta-traderestrictions.csv', 'trade')]:
    path = os.path.join(ROOT, 'data', fname)
    with open(path, encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row.get('Is In Force') != '1':
                continue
            title = row.get('State Act Title', '').strip()
            if not is_relevant(title):
                stats['dropped_keyword'] += 1
                continue
            products = set(p.strip() for p in row.get('Affected Products', '').split(',') if p.strip())
            minerals = sorted(set(code_to_mineral[c] for c in products if c in code_to_mineral))
            if not minerals:
                stats['dropped_no_mineral'] += 1
                continue

            eval_raw = row.get('GTA Evaluation', '')
            evaluation = {'Red': 'harmful', 'Amber': 'murky', 'Green': 'liberalising'}.get(eval_raw, 'murky')
            deal_type = 'Subsidy' if source_type == 'subsidy' else ('Trade Deal' if evaluation == 'liberalising' else 'Trade Control')

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
                'aiTitle': None,
                'aiSummary': None,
            })
            stats['kept'] += 1

interventions.sort(key=lambda x: x['dateISO'], reverse=True)

# ── AI enrichment ──────────────────────────────────────────────────────────
if USE_GROQ:
    print(f"Running Groq enrichment on {len(interventions)} records...")
    enriched = 0
    for i in range(0, len(interventions), BATCH_SIZE):
        batch = interventions[i:i + BATCH_SIZE]
        try:
            results = enrich_batch(batch)
            for j, item in results.items():
                if 0 <= j < len(batch):
                    batch[j]['aiTitle'] = item.get('title')
                    batch[j]['aiSummary'] = item.get('summary')
                    enriched += 1
        except Exception as e:
            print(f"  Batch {i//BATCH_SIZE + 1} failed: {e}")
        sys.stdout.write(f"\r  {min(i + BATCH_SIZE, len(interventions))}/{len(interventions)} processed")
        sys.stdout.flush()
    print(f"\n  Enriched: {enriched}/{len(interventions)}")

# ── Write output ───────────────────────────────────────────────────────────
out_path = os.path.join(ROOT, 'data/gta-interventions.json')
with open(out_path, 'w') as f:
    json.dump({'interventions': interventions}, f, separators=(',', ':'))

size_kb = os.path.getsize(out_path) // 1024
by_type = Counter(i['dealType'] for i in interventions)
print(f"Kept:    {stats['kept']} interventions")
print(f"Dropped: {stats['dropped_keyword']} (no keyword) + {stats['dropped_no_mineral']} (no mineral)")
print(f"By type: {dict(by_type)}")
print(f"Written: data/gta-interventions.json ({size_kb} KB)")
