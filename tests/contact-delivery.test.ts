import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {contactNotificationsEnabled,recordContact,SubmissionConflict,ContactMailRepository,deliverOne} from '../src/lib/contact-delivery';
import {startContactWorker} from '../src/lib/contact-worker';
const origin='https://5sursync.com';
const input={name:'Personne fixture',company:'Société fictive',email:'fixture@example.test',phone:'',topic:'autre' as const,message:'Message fictif pour transaction locale.'};
test('production-only gate requires all flags and exact approved recipient',()=>{
 const enabled={APP_ORIGIN:origin,SMTP_ENABLED:'true',CONTACT_NOTIFICATIONS_ENABLED:'true',CONTACT_NOTIFICATION_TO:'contact@5sursync.com'};
 assert.equal(contactNotificationsEnabled(enabled),true);
 for(const env of [{...enabled,APP_ORIGIN:'https://preprod.5sursync.com'},{...enabled,SMTP_ENABLED:'false'},{...enabled,CONTACT_NOTIFICATIONS_ENABLED:'false'},{...enabled,CONTACT_NOTIFICATION_TO:'fixture@example.test'}])assert.equal(contactNotificationsEnabled(env),false);
});
test('disabled worker starts without SMTP secrets or any transport connection',()=>{
 const previous=process.env.CONTACT_NOTIFICATIONS_ENABLED;
 process.env.CONTACT_NOTIFICATIONS_ENABLED='false';assert.doesNotThrow(()=>startContactWorker());
 if(previous===undefined)delete process.env.CONTACT_NOTIFICATIONS_ENABLED;else process.env.CONTACT_NOTIFICATIONS_ENABLED=previous;
});
const uri=process.env.CONTACT_TEST_DATABASE_URI;
if(uri){const u=new URL(uri);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'53177');assert.equal(u.pathname,'/fixture');}
const pool=uri ? new Pool({connectionString:uri}) : null;
before(async()=>{
 if(!pool)return;
 if((await pool.query("SELECT to_regclass('contact_requests') AS existing")).rows[0].existing)return;
 await pool.query(`CREATE TYPE fixture_notification AS ENUM('not-configured','pending','sent','failed');
 CREATE TABLE contact_requests(id serial PRIMARY KEY,name text NOT NULL,company text,email text NOT NULL,phone text,topic text NOT NULL,message text NOT NULL,notification fixture_notification NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),updated_at timestamptz NOT NULL DEFAULT NOW());`);
 const migration=readFileSync('src/migrations/20261006_223000_contact_notifications.ts','utf8');
 await pool.query(migration.match(/sql`([\s\S]*?)`/)![1]);
});
beforeEach(async()=>{if(pool)await pool.query('TRUNCATE contact_requests RESTART IDENTITY CASCADE');});
after(async()=>{await pool?.end();});
const count=async()=>Number((await pool!.query('SELECT COUNT(*) FROM contact_requests')).rows[0].count);
const integration=(name:string,fn:()=>Promise<void>)=>test(name,{skip:!pool},fn);
integration('saved contact is durable before dispatch and disabled SMTP remains not-configured',async()=>{
 const saved=await recordContact(pool!,input,randomUUID(),origin,false);assert.equal(saved.id,1);assert.equal(await count(),1);
 assert.equal((await pool!.query('SELECT notification FROM contact_requests')).rows[0].notification,'not-configured');
 assert.equal(await new ContactMailRepository(pool!).claim(),null);
});
integration('five simultaneous retries with same key commit exactly one contact',async()=>{
 const key=randomUUID();const result=await Promise.all(Array.from({length:5},(_,i)=>recordContact(pool!,input,i%2 ? key.toUpperCase() : key,origin,true)));
 assert.equal(await count(),1);assert.equal(new Set(result.map(x=>x.id)).size,1);assert.equal(result.filter(x=>!x.duplicate).length,1);
});
integration('same key with changed contents conflicts without overwriting the first message',async()=>{
 const key=randomUUID();await recordContact(pool!,input,key,origin,true);
 await assert.rejects(recordContact(pool!,{...input,message:'Autre contenu fictif.'},key,origin,true),SubmissionConflict);
 assert.equal(await count(),1);assert.equal((await pool!.query('SELECT message FROM contact_requests')).rows[0].message,input.message);
});
integration('submission-map failure rolls the contact transaction back completely',async()=>{
 await assert.rejects(recordContact(pool!,input,randomUUID(),null as unknown as string,true));assert.equal(await count(),0);
});
integration('legacy ID2 and preproduction requests never enter the production queue',async()=>{
 await pool!.query(`INSERT INTO contact_requests(id,name,email,topic,message,notification) VALUES(2,'Ancienne fixture','old@example.test','autre','Ancienne demande fictive','not-configured');SELECT setval('contact_requests_id_seq',2,true)`);
 await recordContact(pool!,input,randomUUID(),'https://preprod.5sursync.com',false);
 const eligible=await recordContact(pool!,input,randomUUID(),origin,true);const job=await new ContactMailRepository(pool!).claim();assert.equal(job?.contactID,eligible.id);
 assert.equal((await pool!.query('SELECT notification FROM contact_requests WHERE id=2')).rows[0].notification,'not-configured');
});
integration('two concurrent workers send once and SMTP acceptance is recorded after the send',async()=>{
 await recordContact(pool!,input,randomUUID(),origin,true);let sent=0;
 const send=async(mail:{to:string;messageId:string})=>{sent++;assert.equal(mail.to,'contact@5sursync.com');assert.equal(mail.messageId,'<contact-1@5sursync.com>');assert.equal((await pool!.query('SELECT notification FROM contact_requests')).rows[0].notification,'pending');await new Promise(r=>setTimeout(r,20));return {accepted:['contact@5sursync.com']};};
 await Promise.all([deliverOne(new ContactMailRepository(pool!),send),deliverOne(new ContactMailRepository(pool!),send)]);assert.equal(sent,1);
 assert.equal((await pool!.query('SELECT notification FROM contact_requests')).rows[0].notification,'sent');
 assert.equal(await deliverOne(new ContactMailRepository(pool!),send),false);assert.equal(sent,1);
});
integration('SMTP error preserves contact and marks uncertainty without automatic duplicate retry',async()=>{
 await recordContact(pool!,input,randomUUID(),origin,true);let attempts=0;const send=async()=>{attempts++;throw new Error('Fictitious transport failure');};
 await deliverOne(new ContactMailRepository(pool!),send);assert.equal(await count(),1);
 assert.equal((await pool!.query('SELECT notification FROM contact_requests')).rows[0].notification,'failed');
 assert.equal((await pool!.query('SELECT state,error_code FROM app_contact_mail_attempts')).rows[0].state,'uncertain');
 assert.equal(await deliverOne(new ContactMailRepository(pool!),send),false);assert.equal(attempts,1);
});
integration('SMTP recipient not accepted never becomes a sent notification',async()=>{
 await recordContact(pool!,input,randomUUID(),origin,true);await deliverOne(new ContactMailRepository(pool!),async()=>({accepted:[]}));
 assert.equal((await pool!.query('SELECT notification FROM contact_requests')).rows[0].notification,'failed');
 assert.equal((await pool!.query('SELECT state FROM app_contact_mail_attempts')).rows[0].state,'failed');
});
integration('crash after dispatch claim never causes automatic resend of an uncertain email',async()=>{
 await recordContact(pool!,input,randomUUID(),origin,true);const repo=new ContactMailRepository(pool!);await repo.claim();
 await pool!.query("UPDATE app_contact_mail_attempts SET lease_until=NOW()-INTERVAL '1 second'");let sent=0;
 assert.equal(await deliverOne(repo,async()=>{sent++;return {accepted:['contact@5sursync.com']};}),false);assert.equal(sent,0);
 assert.equal((await pool!.query('SELECT state FROM app_contact_mail_attempts')).rows[0].state,'uncertain');assert.equal(await count(),1);
});
