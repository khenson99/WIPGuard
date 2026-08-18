#!/usr/bin/env python3
"""Associate Lichen Airtable tool-library records with Arda Cloud item eIds."""
import json, re, csv, sys
from collections import defaultdict

BASE = "/tmp/lichen"

def norm(s):
    """Normalisation for name matching: trim, collapse internal whitespace, casefold.
    Deliberately does NOT strip leading zeros — Coda's numeric coercion bug merges
    0590/590 and we must not repeat that."""
    if s is None: return ""
    s = s.replace("“", '"').replace("”", '"').replace("’", "'")
    s = re.sub(r"\s+", " ", s.strip())
    return s.casefold()

# ---------- Arda side ----------
arda = json.load(open(f"{BASE}/arda_items.json"))
by_name = defaultdict(list)
for it in arda:
    by_name[norm(it["name"])].append(it)
print(f"ARDA: {len(arda)} items, {len(by_name)} distinct normalised names")

# ---------- Coda Lichen 6.0 Items ----------
REC_RE = re.compile(r"(rec[A-Za-z0-9]{14})")
coda_items = []
with open(f"{BASE}/coda_items.tsv") as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line: continue
        p = line.split("^^")
        while len(p) < 6: p.append("")
        coda_items.append({"name": p[0], "airtable_raw": p[1], "sku": p[2],
                           "supplier": p[3], "location": p[4], "itemtype": p[5]})
print(f"CODA ITEMS: {len(coda_items)} rows")

# ---------- Coda Tool Library (Airtable mirror) ----------
tools = []
with open(f"{BASE}/coda_tools.tsv") as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line: continue
        p = line.split("^^")
        while len(p) < 8: p.append("")
        tools.append({"rec": p[0].strip(), "desc": p[1], "productid": p[2], "vendor": p[3],
                      "purchasing": p[4], "url": p[5], "linked": p[6], "items_text": p[7]})
print(f"TOOL LIBRARY: {len(tools)} rows\n")

# ---------- Path A: Coda item's Airtable Record -> that item's name -> Arda eId ----------
pathA = {}          # rec -> eId
pathA_ambig = []
for ci in coda_items:
    recs = REC_RE.findall(ci["airtable_raw"] or "")
    if not recs: continue
    cands = by_name.get(norm(ci["name"]), [])
    if len(cands) == 1:
        for r in recs: pathA.setdefault(r, cands[0]["eId"])
    elif len(cands) > 1:
        pathA_ambig.append((ci["name"], len(recs), len(cands)))

# ---------- Tier 2 index: numeric base code, ignoring NS/S/C stocking suffix ----------
# Airtable and Arda disagree on the suffix (1956NS vs 1956, 0298C vs 0298S), so the
# numeric stem is the real key. Only used when it resolves to exactly ONE Arda item.
BASE_RE = re.compile(r"^\s*(\d{3,4})\s*(NS|S|C)?\s*$", re.I)
def basecode(s):
    m = BASE_RE.match(s or "")
    return (m.group(1).lstrip("0") or "0") if m else None

by_base = defaultdict(list)
for it in arda:
    b = basecode(it["name"])
    if b: by_base[b].append(it)

# ---------- Path B: tool description -> Arda item name -> eId ----------
pathB = {}
pathB_via = {}
pathB_ambig, pathB_miss = [], []
for t in tools:
    cands = by_name.get(norm(t["desc"]), [])
    if len(cands) == 1:                                   # tier 1: exact name
        pathB[t["rec"]] = cands[0]["eId"]; pathB_via[t["rec"]] = "description"
        continue
    if len(cands) > 1:
        pathB_ambig.append(t); continue
    b = basecode(t["desc"])                               # tier 2: numeric base
    bc = by_base.get(b, []) if b else []
    if len(bc) == 1:
        pathB[t["rec"]] = bc[0]["eId"]; pathB_via[t["rec"]] = "numeric-base"
    elif len(bc) > 1:
        pathB_ambig.append(t)
    else:
        pathB_miss.append(t)

# ---------- Merge ----------
merged, conflicts = {}, []
for r, e in pathB.items(): merged[r] = {"eId": e, "via": pathB_via.get(r, "description")}
for r, e in pathA.items():
    if r in merged and merged[r]["eId"] != e:
        conflicts.append((r, merged[r]["eId"], e)); merged[r]["via"] = "CONFLICT"
    elif r not in merged:
        merged[r] = {"eId": e, "via": "coda-airtable-link"}

tool_recs = {t["rec"] for t in tools}
mapped_tools = {r for r in merged if r in tool_recs}

print("=" * 62)
print(f"Path A (Coda item's Airtable Record -> name -> eId): {len(pathA)} recs")
print(f"   ambiguous (name hits >1 Arda item): {len(pathA_ambig)}")
print(f"Path B (tool description -> name -> eId):            {len(pathB)} recs")
print(f"   ambiguous: {len(pathB_ambig)}   unmatched: {len(pathB_miss)}")
print(f"CONFLICTS between paths: {len(conflicts)}")
print("=" * 62)
print(f"TOOL ROWS MAPPED: {len(mapped_tools)} / {len(tools)}  "
      f"({100*len(mapped_tools)/len(tools):.1f}%)")
print(f"UNMAPPED TOOL ROWS: {len(tools) - len(mapped_tools)}")
print(f"distinct eIds used: {len({v['eId'] for v in merged.values()})}")

# many-to-one detection
rev = defaultdict(list)
for r, v in merged.items():
    if r in tool_recs: rev[v["eId"]].append(r)
multi = {e: rs for e, rs in rev.items() if len(rs) > 1}
print(f"eIds claimed by >1 Airtable record (many:1): {len(multi)}")
for e, rs in sorted(multi.items(), key=lambda kv: -len(kv[1]))[:5]:
    nm = next((i["name"] for i in arda if i["eId"] == e), "?")
    print(f"   {len(rs):>3} records -> {nm}")

# ---------- Write outputs ----------
with open(f"{BASE}/mapping.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["airtable_record_id", "arda_item_eid", "matched_via",
                "tool_description", "product_id", "vendor", "airtable_url"])
    for t in tools:
        m = merged.get(t["rec"])
        if m:
            w.writerow([t["rec"], m["eId"], m["via"], t["desc"], t["productid"],
                        t["vendor"], t["url"]])

with open(f"{BASE}/unmapped.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["airtable_record_id", "reason", "tool_description", "product_id",
                "vendor", "linked_state", "airtable_url"])
    for t in pathB_ambig:
        if t["rec"] not in merged:
            w.writerow([t["rec"], "AMBIGUOUS_multiple_arda_items", t["desc"],
                        t["productid"], t["vendor"], t["linked"], t["url"]])
    for t in pathB_miss:
        if t["rec"] not in merged:
            w.writerow([t["rec"], "NO_ARDA_ITEM_WITH_THAT_NAME", t["desc"],
                        t["productid"], t["vendor"], t["linked"], t["url"]])

print(f"\nwrote {BASE}/mapping.csv and {BASE}/unmapped.csv")
