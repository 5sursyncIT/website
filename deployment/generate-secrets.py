from pathlib import Path
import os,secrets
from urllib.parse import quote
root=Path('/home/inaops/5sursync/secrets')
root.mkdir(mode=0o700,exist_ok=True)
names=['db_password','database_uri','payload_secret']
if any((root/n).exists() for n in names):
    raise SystemExit('Refusing to overwrite existing secrets')
password=secrets.token_urlsafe(48)
values={'db_password':password,'database_uri':'postgresql://syncit:'+quote(password,safe='')+'@postgres:5432/syncit','payload_secret':secrets.token_urlsafe(64)}
for name,value in values.items():
    fd=os.open(root/name,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as output: output.write(value+'\n')
print('Three secret files created without displaying values.')
