import base64
import hashlib
import json
import pathlib
import zlib

script_path = pathlib.Path(
    r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\deploy_bom_msg_rs.py"
)
out_dir = pathlib.Path(
    r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools"
)

script = script_path.read_text(encoding="utf-8")
b64z = base64.b64encode(zlib.compress(script.encode("utf-8"), 9)).decode("ascii")
sha = hashlib.sha256(script.encode("utf-8")).hexdigest()
assert zlib.decompress(base64.b64decode(b64z)).decode("utf-8") == script

loader = f"""import zlib, base64, hashlib
_B64 = {b64z!r}
_SRC = zlib.decompress(base64.b64decode(_B64)).decode('utf-8')
assert hashlib.sha256(_SRC.encode('utf-8')).hexdigest() == {sha!r}
_ns = dict(globals())
_body = '\\n'.join(('    ' + _line) for _line in _SRC.splitlines())
exec('async def __deploy():\\n' + _body + '\\n', _ns)
await _ns['__deploy']()
"""

(out_dir / "loader_script.py").write_text(loader, encoding="utf-8")
(out_dir / "loader_args.json").write_text(
    json.dumps({"script": loader}, ensure_ascii=False), encoding="utf-8"
)
print("loader_len", len(loader))
print("sha", sha)
print("exact_match_roundtrip", True)
