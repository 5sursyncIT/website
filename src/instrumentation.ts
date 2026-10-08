export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs' && process.env.BUILD_MODE!=='1') {
    const state=globalThis as typeof globalThis & {contactWorkerStarted?:boolean};
    if(state.contactWorkerStarted)return;
    state.contactWorkerStarted=true;
    const { startContactWorker }=await import('./lib/contact-worker');
    startContactWorker();
    const { startCRMReminderWorker }=await import('./lib/crm-reminder-worker');
    startCRMReminderWorker();
    const { startMailWorker }=await import('./lib/mail/worker');
    startMailWorker();
  }
}
