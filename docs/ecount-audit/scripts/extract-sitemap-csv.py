#!/usr/bin/env python3
"""Extract site-map-prgids.csv from browser CDP JSON dump."""
import json
import sys
from pathlib import Path

def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if src is None:
        raise SystemExit("Usage: extract-sitemap-csv.py <cdp-json-path> [out.csv]")
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "site-map-prgids.csv"
    data = json.loads(src.read_text(encoding="utf-8"))
    body = data["result"]["value"]
    dst.write_text(body + "\n", encoding="utf-8")
    rows = len(body.splitlines()) - 1
    print(f"Wrote {rows} rows to {dst}")

if __name__ == "__main__":
    main()
