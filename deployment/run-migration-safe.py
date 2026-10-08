from pathlib import Path
import subprocess,os,json,re
root=Path('/home/inaops/5sursync')
os.umask(0o077)
result=subprocess.run(['sudo','-n','docker','compose','-f','compose.yaml','-f','compose.production.yaml','run','-T','--rm','--no-deps','app-production','npm','run','migrate'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
text=result.stdout.decode(errors='replace')
report={'migration_exit_code':result.returncode,'raw_output_displayed_or_logged':False,'expected_migration_seen':'20261006_223000_contact_notifications' in text,'error_categories':[x for x,pattern in [('missing-module','Cannot find module'),('database-connect','ECONNREFUSED'),('permission','permission denied'),('relation-exists','already exists')] if re.search(pattern,text,re.I)]}
(root/'backups/20261006T2230Z-smtp/migration-result.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
raise SystemExit(result.returncode)
