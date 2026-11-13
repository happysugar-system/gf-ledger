# GAS source discovery status — 2026-11-13

Read-only search of connected Google Drive accounts and GitHub frontend. No GAS source fetched or executed, no deployment changes.

## Located Google Drive artifacts
- GOLD FIRST vehicle/driver management Sheet (system account): `17IzIUJeYQw3nO8GZsUSCgLfHVECNINZNkQdg38GW57o`.
- Production LINE intake preparation Sheet (OEM account): `1vXVaGID-xyhA1xDjT0SQV3z39DhdhbDpcRPxhpnkepQ`, titled **GOLD FIRST 本番LINE受付管理【未接続・準備用】**. The title explicitly indicates not connected; do not treat as live.
- Other historical/copy Sheets exist and must not be assumed authoritative.

## Access gap
Google Drive search returned spreadsheets but not deployed Apps Script `doPost`/`doGet` source or deployment version. The connected GitHub repository contains the browser frontend, not the two GAS backends. Therefore whether `gf_entry` binds to a verified LINE user and whether the final intake writes to `gf_line_driver_identity_prod` remains **unverified**.

## Next requirement
Get read-only Apps Script project source/deployment metadata via a suitable connector or user-provided script export. Inspect exact handlers for `gf_vehicle_entry_check`, `gf_vehicle_submit_test`, `save_145_form_v1`, and LINE ID-token verification; map verified LINE user ID to DriverID only through proven server-side evidence. Do not change production settings or synthesize identity mappings.
