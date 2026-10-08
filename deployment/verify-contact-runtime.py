import subprocess,json,re,time,datetime
from pathlib import Path

def inspect(name):return json.loads(subprocess.check_output(['sudo','-n','docker','inspect',name]))[0]
def sql(query):return subprocess.check_output(['sudo','-n','docker','exec','5sursync-postgres-1','psql','-U','syncit','-d','syncit','-At','-v','ON_ERROR_STOP=1','-c',query],text=True).strip()
prod=inspect('5sursync-app-production-1');preprod=inspect('5sursync-app-1')
keys=['APP_ORIGIN','SMTP_ENABLED','CONTACT_NOTIFICATIONS_ENABLED','CONTACT_NOTIFICATION_TO','SMTP_HOST','SMTP_PORT','SMTP_TLS_MODE','SMTP_USER','SMTP_FROM_ADDRESS','SMTP_PASSWORD_FILE']
def flags(container):return {item.split('=',1)[0]:item.split('=',1)[1] for item in container['Config']['Env'] if item.split('=',1)[0] in keys}
prod_flags=flags(prod);pre_flags=flags(preprod)
assert prod_flags['SMTP_ENABLED']=='true' and prod_flags['CONTACT_NOTIFICATIONS_ENABLED']=='true'
assert prod_flags['CONTACT_NOTIFICATION_TO']=='contact@5sursync.com'
smtp=[m for m in prod['Mounts'] if m['Destination']=='/run/secrets/smtp_password'];assert len(smtp)==1 and not smtp[0]['RW']
assert not any(m['Destination']=='/run/secrets/smtp_password' for m in preprod['Mounts'])
assert pre_flags.get('SMTP_ENABLED')!='true' and pre_flags.get('CONTACT_NOTIFICATIONS_ENABLED')!='true'
ip=prod['NetworkSettings']['Networks']['5sursync_database']['IPAddress'];assert re.fullmatch(r'[0-9.]+',ip)
def snapshot():
 text=sql(f"SELECT COALESCE(json_agg(json_build_object('pid',pid,'query_start',query_start,'state',state,'idle_commit',query='COMMIT')),'[]'::json) FROM pg_stat_activity WHERE client_addr='{ip}' AND query='COMMIT'")
 return json.loads(text)
first=snapshot();time.sleep(6);second=snapshot()
heartbeat=any(x['pid']==y['pid'] and x['query_start']!=y['query_start'] for x in first for y in second)
raw=subprocess.run(['sudo','-n','docker','logs','--since','10m','5sursync-app-production-1'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout.decode(errors='replace')
errors=len(re.findall(r'contact-mail: (?:configuration-unavailable|processing-unavailable)',raw))
assert errors==0 and heartbeat,'Contact worker poll not established'
disabled=subprocess.check_output(['sudo','-n','docker','exec','5sursync-app-production-1','node','-e','console.log(require("node:fs").readFileSync("src/payload.config.ts","utf8").includes("email: disabledEmail"))'],text=True).strip();assert disabled=='true'
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'production_image':prod['Image'],'production_health':prod['State']['Health']['Status'],'production_flags':prod_flags,'smtp_secret_mount_readonly':True,'preprod_image':preprod['Image'],'preprod_health':preprod['State']['Health']['Status'],'preprod_has_smtp_secret':False,'preprod_smtp_enabled':False,'payload_auth_email_adapter_disabled':True,'worker_poll_observed':heartbeat,'worker_poll_snapshots':[first,second],'worker_error_count':errors,'submission_count':int(sql('SELECT COUNT(*) FROM app_contact_submissions')),'attempt_count':int(sql('SELECT COUNT(*) FROM app_contact_mail_attempts')),'legacy_contact_2':sql("SELECT id,notification FROM contact_requests WHERE id=2")}
assert report['legacy_contact_2']=='2|not-configured'
Path('/home/inaops/5sursync/documentation/qa/contact-smtp-runtime.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
