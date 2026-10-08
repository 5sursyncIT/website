import urllib.request, urllib.error, json, re, os
from pathlib import Path
base = os.environ.get('VERIFY_BASE', 'http://127.0.0.1:3110')
paths = ['/', '/services', '/reseaux-cloud', '/solutions-metier', '/developpement-api', '/maintenance-support', '/realisations', '/a-propos', '/contact']
results = []
for path in paths:
    response = urllib.request.urlopen(base + path)
    html = response.read().decode()
    canonical = 'https://5sursync.com' + ('' if path == '/' else path)
    assert f'rel="canonical" href="{canonical}"' in html, path
    assert 'name="robots" content="index, follow"' in html, path
    results.append({'path': path, 'status': response.status, 'canonical': canonical})
xml = urllib.request.urlopen(base + '/sitemap.xml').read().decode()
urls = re.findall(r'<loc>(.*?)</loc>', xml)
assert len(urls) == 9 and {u.rstrip('/') for u in urls} == {r['canonical'].rstrip('/') for r in results}
robots = urllib.request.urlopen(base + '/robots.txt').read().decode()
assert 'Sitemap: https://5sursync.com/sitemap.xml' in robots
for path in ['/support/connexion', '/support/activation']:
    html = urllib.request.urlopen(base + path).read().decode()
    assert 'name="robots" content="noindex, nofollow"' in html, path
for origin, expected in [('https://5sursync.com', 400), ('https://untrusted.invalid', 403), ('https://preprod.5sursync.com', 403)]:
    request = urllib.request.Request(base + '/api/contact', data=b'{}', headers={'Origin': origin, 'Content-Type': 'application/json'})
    try:
        status = urllib.request.urlopen(request).status
    except urllib.error.HTTPError as error:
        status = error.code
    assert status == expected, (origin, status)
    results.append({'contact_origin': origin, 'invalid_body_status': status})
Path(__file__).with_name('verification.json').write_text(json.dumps({'http': results, 'sitemap': urls, 'robots': robots, 'private_noindex_pages': 2}, indent=2))
print('Passed: 9 canonical/indexation pages, exact sitemap, robots, 2 private pages, 3 origin checks; no data written.')
