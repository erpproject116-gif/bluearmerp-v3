from pathlib import Path
import re

p = Path("api/internal/modules/inventory/partners.go")
text = p.read_text(encoding="utf-8")
if 'Query().Get("kind")' in text:
    print("ALREADY_HAS_KIND")
else:
    patch = "\n".join(
        [
            '\t\tkind := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("kind")))',
            "\t\tswitch kind {",
            '\t\tcase "customer":',
            '\t\t\twhere += " and partner_kind in (\'customer\', \'both\')"',
            '\t\tcase "vendor":',
            '\t\t\twhere += " and partner_kind in (\'vendor\', \'both\')"',
            "\t\t}",
            "",
        ]
    )
    m = re.search(r"(argN\+\+\n\t\t\}\n\n)(\t\torder := \"asc\")", text)
    if not m:
        m = re.search(r"(argN\+\+\n                \}\n\n)(                order := \"asc\")", text)
    if not m:
        idx = text.find('order := "asc"')
        print("MARKER_FAIL")
        print(repr(text[max(0, idx - 180) : idx + 40] if idx >= 0 else text[:300]))
        raise SystemExit(2)
    text = text[: m.start()] + m.group(1) + patch + m.group(2) + text[m.end() :]
    p.write_text(text, encoding="utf-8")
    print("PATCHED")
for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
    if 'Get("kind")' in line or "partner_kind in" in line:
        print(f"{i}:{line}")
