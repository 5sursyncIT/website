from pathlib import Path
import hashlib, subprocess, shutil
root=Path('/home/inaops/5sursync')
backup=root/'backups/20261006T2138Z-production'
stream=Path('/etc/nginx/conf.d/stream-direction.conf.stream')
preprod=Path('/etc/nginx/sites-available/5sursync-preprod.conf')
for current, saved in [(stream,backup/'stream-direction.conf.stream'),(preprod,backup/'5sursync-preprod.conf')]:
 if hashlib.sha256(current.read_bytes()).digest()!=hashlib.sha256(saved.read_bytes()).digest():raise RuntimeError('Concurrent Nginx change; stop')
cert='/etc/letsencrypt/live/5sursync.com/fullchain.pem'
for host in ['5sursync.com','www.5sursync.com']:
 subprocess.run(['openssl','x509','-in',cert,'-noout','-checkhost',host],check=True)
subprocess.run(['openssl','x509','-in',cert,'-noout','-checkend','604800'],check=True)
original=stream.read_text()
anchor='        preprod.5sursync.com syncit_preprod;'
if original.count(anchor)!=1:raise RuntimeError('Unexpected map anchor')
upstream='    upstream reject_unknown_sni {'
if original.count(upstream)!=1 or 'syncit_production' in original:raise RuntimeError('Unexpected upstream state')
patched=original.replace(anchor,anchor+'\n        5sursync.com      syncit_production;\n        www.5sursync.com  syncit_production;').replace(upstream,'    upstream syncit_production {\n        server 127.0.0.1:9444;\n    }\n\n'+upstream)
vhost=Path('/etc/nginx/sites-available/5sursync-production.conf')
link=Path('/etc/nginx/sites-enabled/5sursync-production.conf')
if vhost.exists() or link.exists() or link.is_symlink():raise RuntimeError('Production vhost already exists; stop')
shutil.copyfile(root/'deployment/production.nginx.conf',vhost)
link.symlink_to(vhost)
stream.write_text(patched)
try:
 subprocess.run(['nginx','-t'],check=True)
 subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
 stream.write_text(original)
 link.unlink(missing_ok=True)
 vhost.unlink(missing_ok=True)
 subprocess.run(['nginx','-t'],check=True)
 subprocess.run(['systemctl','reload','nginx'],check=True)
 raise
print('Activated only production SNI/vhost; preprod/INA entries and listener retained')
