#!/usr/bin/env python3
"""Synchronize allowlisted vehicle fields from GF source to isolated company portal.

Requires two PostgreSQL connection strings from protected environment secrets:
GF_SOURCE_DATABASE_URL (read-only role), GF_PORTAL_DATABASE_URL (writer role).
No credentials in browser or repository. Dry-run by default.
"""
import os
import sys
import psycopg

SOURCE_SQL = """
select vehicle_id, vehicle_number,
       btrim(vehicle_data->>'所属会社名') as affiliation,
       nullif(vehicle_data->>'現在使用者','') as driver,
       coalesce(nullif(vehicle_data->>'管理区分',''),
                nullif(vehicle_data->>'区分/ステータス','')) as status,
       nullif(vehicle_data->>'名変予定日','') as name_change,
       nullif(vehicle_data->>'納車予定日','') as delivery,
       nullif(vehicle_data->>'代車開始日','') as usage_start,
       nullif(vehicle_data->>'返却予定日','') as return_date
from public.gf_vehicles
where vehicle_id is not null
"""

def main():
    source_dsn = os.environ["GF_SOURCE_DATABASE_URL"]
    target_dsn = os.environ["GF_PORTAL_DATABASE_URL"]
    apply = os.getenv("GF_SYNC_APPLY", "false").lower() == "true"

    with psycopg.connect(source_dsn, autocommit=False) as source:
        with source.cursor() as cursor:
            cursor.execute("begin transaction read only")
            cursor.execute(SOURCE_SQL)
            rows = cursor.fetchall()

    if not rows or len(rows) > 10000:
        raise RuntimeError("Unexpected source row count: refusing sync")
    if len({r[0] for r in rows}) != len(rows):
        raise RuntimeError("Duplicate vehicle_id: refusing sync")

    with psycopg.connect(target_dsn) as target:
        with target.transaction():
            with target.cursor() as cursor:
                cursor.execute("select pg_advisory_xact_lock(77341002)")
                cursor.execute("""
                    select a.source_affiliation,a.company_id,c.company_name
                    from public.gf_company_portal_affiliation_aliases a
                    join public.gf_company_portal_companies c on c.id=a.company_id
                """)
                aliases = {name: (cid, company) for name, cid, company in cursor.fetchall()}
                if not aliases:
                    raise RuntimeError("No approved aliases; refusing sync")
                staged = {}
                for vehicle_id, number, affiliation, driver, status, name_change, delivery, usage_start, return_date in rows:
                    if affiliation not in aliases:
                        continue
                    company_id, company_name = aliases[affiliation]
                    key = (company_id, vehicle_id)
                    if key in staged:
                        raise RuntimeError("Duplicate tenant vehicle key")
                    staged[key] = (company_id, vehicle_id, number, driver, status, name_change, delivery, usage_start, return_date)
                if not staged:
                    raise RuntimeError("No matched vehicles; refusing to delete existing rows")
                cursor.execute("""
                    select count(*) from public.gf_company_portal_vehicles
                    where vehicle_id not like 'DEMO-%'
                """)
                previous_count = cursor.fetchone()[0]
                # Prevent accidental large-scale deletion from a bad source export.
                if previous_count and len(staged) < previous_count * 0.8:
                    raise RuntimeError("Vehicle count dropped >20%; manual review required")
                print(f"Source rows: {len(rows)}; approved matches: {len(staged)}; previous: {previous_count}; apply: {apply}")
                if not apply:
                    target.rollback()
                    return
                cursor.execute("""
                    create temporary table sync_stage (
                      company_id uuid, vehicle_id text, vehicle_number text,
                      driver_display_name text, status text, name_change_scheduled text,
                      delivery_scheduled text, usage_start text, return_scheduled text
                    ) on commit drop
                """)
                with cursor.copy("""
                    copy sync_stage(company_id,vehicle_id,vehicle_number,
                      driver_display_name,status,name_change_scheduled,
                      delivery_scheduled,usage_start,return_scheduled) from stdin
                """) as copy:
                    for item in staged.values():
                        copy.write_row(item)
                cursor.execute("""
                    insert into public.gf_company_portal_vehicles
                    (company_id,vehicle_id,vehicle_number,driver_display_name,status,
                     name_change_scheduled,delivery_scheduled,usage_start,return_scheduled,updated_at)
                    select company_id,vehicle_id,vehicle_number,driver_display_name,status,
                     name_change_scheduled,delivery_scheduled,usage_start,return_scheduled,now()
                    from sync_stage
                    on conflict(company_id,vehicle_id) do update set
                     vehicle_number=excluded.vehicle_number,
                     driver_display_name=excluded.driver_display_name,
                     status=excluded.status,
                     name_change_scheduled=excluded.name_change_scheduled,
                     delivery_scheduled=excluded.delivery_scheduled,
                     usage_start=excluded.usage_start,
                     return_scheduled=excluded.return_scheduled,
                     updated_at=excluded.updated_at
                """)
                cursor.execute("""
                    delete from public.gf_company_portal_vehicles v
                    where not exists(
                      select 1 from sync_stage s
                      where s.company_id=v.company_id and s.vehicle_id=v.vehicle_id
                    )
                """)
                print("Applied atomic sync and removed stale company assignments")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Sync failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
