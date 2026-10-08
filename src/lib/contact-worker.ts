import {contactSMTPTransport} from './contact-smtp';
import { contactNotificationsEnabled, ContactMailRepository, deliverOne } from './contact-delivery';
import { database } from './database';
export function startContactWorker() {
  if (!contactNotificationsEnabled() || process.env.BUILD_MODE === '1') return;
  let transport:ReturnType<typeof contactSMTPTransport>;
  try {transport=contactSMTPTransport();} catch {console.error('contact-mail: configuration-unavailable');return;}
  const repository=new ContactMailRepository(database());
  let stopping=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{
    try { for(let count=0;count<5 && !stopping;count++) if(!await deliverOne(repository,mail=>transport.sendMail(mail))) break; }
    catch { console.error('contact-mail: processing-unavailable'); }
    if(!stopping){timer=setTimeout(()=>void poll(),5000);timer.unref();}
  };
  process.once('SIGTERM',()=>{stopping=true;if(timer)clearTimeout(timer);});
  void poll();
}
