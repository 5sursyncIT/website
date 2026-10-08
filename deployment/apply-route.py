from pathlib import Path
from datetime import datetime,timezone
import shutil,subprocess,os
root=Path('/home/inaops/5sursync')
stream=Path('/etc/nginx/conf.d/stream-direction.conf.stream')
site=Path('/etc/nginx/sites-available/5sursync-preprod.conf')
link=Path('/etc/nginx/sites-enabled/5sursync-preprod.conf')
certificate=Path('/etc/letsencrypt/live/preprod.5sursync.com/fullchain.pem')
if not certificate.exists():raise SystemExit('Certificate missing; refusing route activation')
old=stream.read_text()
if 'preprod.5sursync.com' in old:raise SystemExit('Route already present; inspect rather than overwrite')
if site.exists() or link.exists() or link.is_symlink():raise SystemExit('Site file exists; refusing overwrite')
for route in ['direction.ina.gn  vm_frontal_direction','mobile.ina.gn     vm_frontal_direction','auth.ina.gn       vm_frontal_direction','proxy_protocol on;']:
    if route not in old:raise SystemExit('INA config differs; refusing automatic patch')
new=old.replace('        default            reject_unknown_sni;','        preprod.5sursync.com syncit_preprod;\n        default            reject_unknown_sni;')
new=new.replace('    upstream reject_unknown_sni {','    upstream syncit_preprod {\n        server 127.0.0.1:9443;\n    }\n\n    upstream reject_unknown_sni {')
if new==old or new.count('upstream syncit_preprod')!=1:raise SystemExit('Unexpected config shape')
backup=root/'backups'/('nginx-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True,mode=0o700)
shutil.copy2(stream,backup/stream.name)
shutil.copy2('/etc/nginx/nginx.conf',backup/'nginx.conf')
try:
    stream.write_text(new)
    shutil.copyfile(root/'deployment/preprod.nginx.conf',site)
    link.symlink_to(site)
    subprocess.run(['nginx','-t'],check=True)
except Exception:
    stream.write_text(old)
    if link.is_symlink():link.unlink()
    if site.exists():site.unlink()
    raise
subprocess.run(['systemctl','reload','nginx'],check=True)
print('Added only preproduction route. Backup:',backup)
