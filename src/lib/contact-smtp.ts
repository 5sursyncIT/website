import {createRequire} from 'node:module';
import {requiredSecret} from './env';
import type {ContactMail} from './contact-delivery';
export type SMTPInfo = {accepted:string[];messageId:string};
// Also sends CRM mails (reminders, documents with a PDF attachment).
export type ContactTransport = {sendMail(mail:ContactMail & Record<string, unknown>):Promise<SMTPInfo>;close():void};
export function contactSMTPTransport():ContactTransport {
 const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT),mode=process.env.SMTP_TLS_MODE;
 if(process.env.SMTP_ENABLED!=='true' || host!=='mail.5sursync.com' || port!==465 || mode!=='implicit'
   || process.env.SMTP_USER!=='no-reply@5sursync.com' || process.env.SMTP_FROM_ADDRESS!=='no-reply@5sursync.com')throw new Error('SMTP configuration not approved');
 const nodemailer=createRequire(import.meta.url)('nodemailer') as {createTransport(options:unknown):ContactTransport};
 return nodemailer.createTransport({host,port,secure:true,
  auth:{user:process.env.SMTP_USER,pass:requiredSecret('SMTP_PASSWORD')},
  tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:host},
  logger:false,debug:false,transactionLog:false,disableFileAccess:true,disableUrlAccess:true,
  connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
}
