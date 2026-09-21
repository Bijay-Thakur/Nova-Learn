"""Create a portable source ZIP, then extract and verify every file."""
from pathlib import Path
import hashlib
import json
import tempfile
import zipfile
import sys

root=Path(__file__).resolve().parent.parent
output=Path(sys.argv[1]).resolve()
output.parent.mkdir(parents=True,exist_ok=True)
excluded={'node_modules','.next','dist','.sites-runtime','.wrangler','.git','outputs','work','coverage','downloads'}
files=[]
for file in sorted(root.rglob('*')):
    rel=file.relative_to(root)
    if not file.is_file() or any(p in excluded or p.startswith('.nova-tests-') for p in rel.parts):
        continue
    if file.name.endswith(('.tsbuildinfo','.log','.zip','.tar.gz')) or (file.name.startswith('.env') and file.name!='.env.example'):
        continue
    files.append((file,rel))
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_STORED,allowZip64=False) as archive:
    folder=zipfile.ZipInfo('NovaLearn/',date_time=(2026,9,8,0,0,0))
    folder.create_system=0
    folder.external_attr=0x10
    archive.writestr(folder,b'')
    for file,rel in files:
        info=zipfile.ZipInfo('NovaLearn/'+rel.as_posix(),date_time=(2026,9,8,0,0,0))
        info.create_system=0
        info.external_attr=0x20
        archive.writestr(info,file.read_bytes())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    with tempfile.TemporaryDirectory(prefix='novalearn-zip-check-') as staging:
        archive.extractall(staging)
        for source,rel in files:
            extracted=Path(staging)/'NovaLearn'/rel
            assert extracted.read_bytes()==source.read_bytes(),rel
print(json.dumps({'path':str(output),'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'extraction':'all files byte-verified'}))
