"""Separate preproduction identity (option B, documentation/microsoft365.md section 7).
Creates three secret files without displaying any value; refuses to overwrite."""
from pathlib import Path
import os, secrets
from urllib.parse import quote

root = Path('/home/inaops/5sursync/secrets')
names = ['db_password_preprod', 'database_uri_preprod', 'payload_secret_preprod']
if any((root / n).exists() for n in names):
    raise SystemExit('Refusing to overwrite existing preproduction secrets')
password = secrets.token_urlsafe(48)
values = {
    'db_password_preprod': password,
    'database_uri_preprod': 'postgresql://syncit_preprod:' + quote(password, safe='') + '@postgres:5432/syncit_preprod',
    'payload_secret_preprod': secrets.token_urlsafe(64),
}
for name, value in values.items():
    fd = os.open(root / name, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(value + '\n')
print('Three preproduction secret files created without displaying values.')
