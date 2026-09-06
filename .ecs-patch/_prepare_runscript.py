import pathlib
src = pathlib.Path(__file__).with_name('deploy_bom_msg_rs.py')
script = src.read_text(encoding='utf-8')
assert 'DEPLOY_BOM_MSG_DONE' in script
assert 'result =' in script
assert len(script) == 31787
out = pathlib.Path(__file__).with_name('_script_only.txt')
out.write_text(script, encoding='utf-8', newline='\n')
print('ok', len(script), script.count('\n'))
