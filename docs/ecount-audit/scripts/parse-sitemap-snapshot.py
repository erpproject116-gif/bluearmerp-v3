#!/usr/bin/env python3
"""Extract unique menu/program names from a browser Site Map snapshot log."""
import re
import sys
from pathlib import Path

SKIP = {
    "on", "Site Map", "Modify Name", "Delete Favorite", "All", "Smart Support",
    "View in Dark Mode", "AI Assistant", "Open in New Window", "E Note", "Notice",
    "Msg.", "Email", "Remote", "Timeline", "Bookmark", "UserPay", "MyPage",
    "User Customization", "Inv. I", "Inv. II", "Acct. I", "Acct. II", "Mgmt", "GW",
    "Data Center", "Setup", "Sales", "Purchases", "Production", "Inv. Mov.", "Reports",
    "Default", "Template", "Search Menu", "United States (English)", "Help", "Option",
}


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[3] / ".sitemap-snapshot.log"
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    text = path.read_text(encoding="utf-8", errors="ignore")
    names = re.findall(r'name: "([^"]+)"|name: ([^\n]+)', text)
    flat = [a or b for a, b in names]
    uniq: list[str] = []
    seen: set[str] = set()
    for n in flat:
        n = n.strip().strip('"')
        if not n or n in SKIP or n.isdigit() or len(n) < 3:
            continue
        if n not in seen:
            seen.add(n)
            uniq.append(n)
    lines = [f"# Unique program/menu names: {len(uniq)}\n"] + [f"- {n}" for n in sorted(uniq, key=str.lower)]
    body = "\n".join(lines) + "\n"
    if out_path:
        out_path.write_text(body, encoding="utf-8")
        print(f"Wrote {len(uniq)} names to {out_path}")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(body, end="")


if __name__ == "__main__":
    main()
