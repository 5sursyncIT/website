import subprocess, tempfile, json, re, datetime, os
from pathlib import Path

TARGET = '185.187.169.152'
PUBLIC = os.environ.get('VERIFY_PUBLIC') == '1'
results = []

def fetch(path, host='5sursync.com', method='GET', data=None, origin=None):
    with tempfile.TemporaryDirectory() as directory:
        headers = Path(directory) / 'headers'
        body = Path(directory) / 'body'
        command = ['curl', '--silent', '--show-error', '--path-as-is', '--max-time', '25', '--dump-header', str(headers), '--output', str(body), '--write-out', '%{http_code} %{remote_ip}', '--request', method]
        if not PUBLIC:
            command += ['--resolve', f'{host}:443:{TARGET}']
        if origin:
            command += ['--header', f'Origin: {origin}']
        if data is not None:
            command += ['--header', 'Content-Type: application/json', '--data', json.dumps(data)]
        command += [f'https://{host}{path}']
        response = subprocess.run(command, capture_output=True, text=True)
        if response.returncode:
            raise RuntimeError(response.stderr)
        header_text = headers.read_text()
        text = body.read_text(errors='replace')
        status_text, remote_ip = response.stdout.split()
        status = int(status_text)
        assert remote_ip == TARGET, (host, remote_ip, 'DNS has not reached the new VPS')
        parsed = {key.lower(): value.strip() for key, value in re.findall(r'^([^:\r\n]+):\s*(.*)$', header_text, re.M)}
        results.append({'host': host, 'path': path, 'method': method, 'status': status, 'remote_ip': remote_ip, 'location': parsed.get('location'), 'robots': parsed.get('x-robots-tag')})
        return status, parsed, text

paths = ['/', '/services', '/reseaux-cloud', '/solutions-metier', '/developpement-api', '/maintenance-support', '/realisations', '/a-propos', '/contact']
for path in paths:
    status, headers, html = fetch(path)
    assert status == 200, path
    canonical = 'https://5sursync.com' + ('' if path == '/' else path)
    assert f'rel="canonical" href="{canonical}"' in html, path
    assert 'name="robots" content="index, follow"' in html, path
    assert 'noindex' not in headers.get('x-robots-tag', ''), path

status, _, sitemap = fetch('/sitemap.xml')
urls = re.findall(r'<loc>(.*?)</loc>', sitemap)
assert status == 200 and len(urls) == 9
assert {u.rstrip('/') for u in urls} == {('https://5sursync.com' + p).rstrip('/') for p in paths}
status, _, robots = fetch('/robots.txt')
assert status == 200 and 'Sitemap: https://5sursync.com/sitemap.xml' in robots
status, _, health = fetch('/api/health')
assert status == 200 and json.loads(health)['status'] == 'ok'

for path in ['/', '/services?source=test', '/gestion/compta/facture/card.php?id=42&mode=show']:
    status, headers, _ = fetch(path, host='www.5sursync.com')
    assert status == 308 and headers.get('location') == 'https://5sursync.com' + path
for path, expected in [('/gestion', '/'), ('/gestion/', '/'), ('/gestion/index.php?mainmenu=home', '/index.php?mainmenu=home'), ('/gestion/compta/facture/card.php?id=42&mode=show', '/compta/facture/card.php?id=42&mode=show')]:
    status, headers, _ = fetch(path)
    assert status == 308 and headers.get('location') == 'https://gestion.5sursync.com' + expected, (path, headers)

for path in ['/admin', '/admin/', '/api/cms/admins', '/team/invitations', '/api/team/invitations', '/%61dmin/', '//admin/', '/api/%63ms/admins']:
    status, _, _ = fetch(path)
    assert status == 401, (path, status)
for path in ['/support', '/support/nouveau', '/support/tickets/1']:
    status, headers, _ = fetch(path)
    assert status == 307 and headers.get('location') == '/support/connexion', (path, status)
for path in ['/support/connexion', '/support/activation']:
    status, headers, html = fetch(path)
    assert status == 200 and 'noindex' in headers.get('x-robots-tag', '')
    assert 'name="robots" content="noindex, nofollow"' in html
for path in ['/api/support/tickets', '/api/support/files/1']:
    status, _, _ = fetch(path)
    assert status == 401, (path, status)
for origin, expected in [('https://5sursync.com', 400), ('https://preprod.5sursync.com', 403), ('https://untrusted.invalid', 403)]:
    status, _, _ = fetch('/api/contact', method='POST', data={}, origin=origin)
    assert status == expected
status, _, _ = fetch('/api/contact', method='POST', data={'name': 'QA antispam', 'email': 'qa@example.test', 'topic': 'autre', 'message': 'Verification antispam sans enregistrement.', 'website': 'robot'}, origin='https://5sursync.com')
assert status == 400
status, headers, html = fetch('/', host='preprod.5sursync.com')
assert status == 200 and 'noindex' in headers.get('x-robots-tag', '') and 'noindex' in html
status, _, _ = fetch('/admin/', host='preprod.5sursync.com')
assert status == 401
status, _, _ = fetch('/api/contact', host='preprod.5sursync.com', method='POST', data={}, origin='https://preprod.5sursync.com')
assert status == 400
status, _, _ = fetch('/api/contact', host='preprod.5sursync.com', method='POST', data={}, origin='https://5sursync.com')
assert status == 403
output = 'verification-public-production.json' if PUBLIC else 'verification-production.json'
Path(__file__).with_name(output).write_text(json.dumps({'checked_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'resolved_target': TARGET, 'dns_resolution': 'public' if PUBLIC else 'forced', 'strict_tls': True, 'checks': results}, indent=2))
print(f'Passed {len(results)} strict-TLS routing/SEO/access/form checks; DNS resolution: {"public" if PUBLIC else "forced"}; no valid form or login submitted.')
