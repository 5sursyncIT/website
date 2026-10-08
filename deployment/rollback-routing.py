"""Rollback only this production release; run deliberately, never during validation."""
from pathlib import Path
import hashlib
import subprocess

root = Path('/home/inaops/5sursync')
stream = Path('/etc/nginx/conf.d/stream-direction.conf.stream')
saved = root / 'backups/20261006T2138Z-production/stream-direction.conf.stream'
current = stream.read_text()
map_addition = '\n        5sursync.com      syncit_production;\n        www.5sursync.com  syncit_production;'
upstream_addition = '    upstream syncit_production {\n        server 127.0.0.1:9444;\n    }\n\n'
if current.count(map_addition) != 1 or current.count(upstream_addition) != 1:
    raise RuntimeError('Routing differs from this release; inspect before rollback')
restored = current.replace(map_addition, '').replace(upstream_addition, '')
if hashlib.sha256(restored.encode()).digest() != hashlib.sha256(saved.read_bytes()).digest():
    raise RuntimeError('Concurrent routing change detected; stop without overwriting INA')
link = Path('/etc/nginx/sites-enabled/5sursync-production.conf')
target = Path('/etc/nginx/sites-available/5sursync-production.conf')
if not link.is_symlink() or link.resolve() != target:
    raise RuntimeError('Unexpected production vhost link; stop')
stream.write_text(restored)
link.unlink()
try:
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except Exception:
    stream.write_text(current)
    link.symlink_to(target)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
subprocess.run(['docker', 'compose', '-f', 'compose.yaml', '-f', 'compose.production.yaml', 'stop', 'app-production'], cwd=root, check=True)
print('Only production routing/service stopped; existing INA/preprod/DB preserved. DNS rollback remains an owner action.')
