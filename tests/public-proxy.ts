import assert from 'node:assert/strict'
// Uses the actual production Nginx location rules in a temporary local HTTP harness.
// This validates routing protection, not a live TLS certificate.
const origin='http://127.0.0.1:3107'
let checks=0
for(const path of ['/api/cms/admins/first-register','/api/cms/client-accounts/first-register','/api/%63ms/admins/first-register','/api//cms/admins/first-register','/admin','/admin/create-first-user','/team/invitations','/api/team/invitations']){
 const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',origin:'https://preprod.5sursync.com'},body:JSON.stringify({email:'ydiop@5sursync.com',password:'fixture-only-for-blocked-request',name:'Blocked bootstrap'})});assert.equal(response.status,401,path);checks++
}
const page=await fetch(origin+'/support/connexion');assert.equal(page.status,200);assert.match(page.headers.get('x-robots-tag')||'',/noindex/);checks++
console.log(`PASS ${checks} public proxy guards: admin/CMS/team require Nginx Basic Auth (401)`)
