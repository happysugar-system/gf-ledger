#!/usr/bin/env python3
"""Read-only GF affiliation discovery into isolated demo candidate list."""
import os
import psycopg

SQL = "select affiliation from public.gf_portal_sync_source"
def canonical(value):
    s = (value or "").strip()
    if s in ("UP’ｓ", "UP'ｓ", "UP’s", "UP's"):
        return "UP's"
    return s

def main():
    with psycopg.connect(os.environ["GF_SOURCE_DATABASE_URL"]) as source:
        with source.cursor() as c:
            c.execute("set transaction read only")
            c.execute(SQL)
            rows = c.fetchall()
    if not rows or len(rows) > 10000:
        raise RuntimeError("Unexpected source rows")
    counts = {}
    for (value,) in rows:
        name = canonical(value)
        if name:
            counts[name] = counts.get(name, 0) + 1
    if not counts:
        raise RuntimeError("No affiliations; refusing sync")
    with psycopg.connect(os.environ["GF_PORTAL_DATABASE_URL"]) as target:
        with target.transaction():
            with target.cursor() as c:
                for name, count in counts.items():
                    c.execute("""insert into public.gf_company_affiliation_candidates(affiliation,vehicle_count,updated_at)
                        values (%s,%s,now()) on conflict(affiliation) do update set
                        vehicle_count=excluded.vehicle_count,updated_at=now()""", (name,count))
                c.execute("update public.gf_company_affiliation_candidates set vehicle_count=0,updated_at=now() where not (affiliation = any(%s))", (list(counts),))
    print("Updated affiliation candidates:",len(counts))
if __name__ == "__main__":
    main()
