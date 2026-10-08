#!/usr/bin/python3
"""Temporary DNS-01 handoff; waits for an explicit, verified continuation marker."""
import os,json,time
from pathlib import Path
root=Path('/run/5sync-acme-dns01')
if os.environ['CERTBOT_DOMAIN']!='preprod.5sursync.com':
    raise SystemExit('Unexpected domain')
value=os.environ['CERTBOT_VALIDATION']
(root/'challenge.json').write_text(json.dumps({'name':'_acme-challenge.preprod.5sursync.com','type':'TXT','value':value})+'\n')
os.chmod(root/'challenge.json',0o600)
end=time.monotonic()+23*3600
while time.monotonic()<end:
    marker=root/'continue'
    if marker.exists() and marker.read_text().strip()==value:
        marker.unlink()
        raise SystemExit(0)
    time.sleep(5)
raise SystemExit('DNS confirmation wait expired')
