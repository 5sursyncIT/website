import {randomUUID} from 'node:crypto';
import {contactSMTPTransport} from '../src/lib/contact-smtp';
if(!process.argv.includes('--approved-test'))throw new Error('Explicit test approval required');
const messageId=`<smtp-test-${randomUUID()}@5sursync.com>`;
let transport:ReturnType<typeof contactSMTPTransport>|undefined,attempts=0;
try{
 transport=contactSMTPTransport();attempts=1;
 const info=await transport.sendMail({to:'youssouphadiop@hotmail.fr',from:'no-reply@5sursync.com',
  subject:'5/Sync IT — test SMTP de mise en service',
  text:`Test SMTP de mise en service 5/Sync IT.\nDate UTC : ${new Date().toISOString()}\nCe message de contrôle ne contient aucune demande client.`,messageId});
 if(!info.accepted.map(x=>x.toLowerCase()).includes('youssouphadiop@hotmail.fr'))throw new Error('Test recipient not accepted');
 console.log(JSON.stringify({status:'smtp-accepted',messageId:info.messageId,acceptedCount:1,deliveryConfirmed:false}));
}catch(error){
 const e=error as {code?:unknown;responseCode?:unknown};
 const code=typeof e.code==='string' && ['EAUTH','ETIMEDOUT','ECONNECTION','ESOCKET','EENVELOPE','EMESSAGE','EDNS','ETLS'].includes(e.code) ? e.code : 'SMTP_ERROR';
 const responseCode=typeof e.responseCode==='number' ? e.responseCode : undefined;
 console.log(JSON.stringify({status:'failed',code,responseCode,attempts}));process.exitCode=1;
}finally{transport?.close();}
