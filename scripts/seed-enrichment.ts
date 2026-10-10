import { getPayload } from 'payload';
import config from '../src/payload.config';
import plan from '../src/content/enrichment-plan.json';
import hage from '../src/content/case-enrichment-plan.json';
import historical from '../src/content/historical-cases.json';
const payload=await getPayload({config});
const obsoletePhone=/(?:\+?221[\s.-]*)?77[\s.-]*052[\s.-]*20[\s.-]*46/g;
let added=0,changed=0,preserved=0,created=0;
try {
  // All current page values stay intact, except explicitly approved obsolete phone.
  const pages=await payload.find({collection:'pages',limit:50,depth:0});
  for(const page of pages.docs) {
    const entry=plan.pages[page.slug as keyof typeof plan.pages];
    const copy=(page.copy??[]).map(row=>({...row}));
    let dirty=false;
    for(const row of copy) {
      // A country mission may be left empty on purpose: keep it empty, never "".
      if(typeof row.value!=='string')continue;
      const corrected=row.value.replace(obsoletePhone,'+221 77 097 29 08');
      if(corrected!==row.value){row.value=corrected;changed++;dirty=true;}
    }
    if(entry) {
      for(const replacement of entry.replacements) {
        const row=copy.find(row=>row.key===replacement.key);
        if(!row){copy.push({key:replacement.key,value:replacement.after});added++;dirty=true;}
        else if(row.value!==replacement.after&&(row.value===replacement.before||!row.value?.trim())){row.value=replacement.after;changed++;dirty=true;}
        else if(row.value!==replacement.after)preserved++;
      }
      for(const addition of entry.additions) {
        if(!copy.some(row=>row.key===addition.key)){copy.push({...addition});added++;dirty=true;}
      }
    }
    if(dirty)await payload.update({collection:'pages',id:page.id,data:{copy}});
  }
  const record=(await payload.find({collection:'case-studies',where:{anchor:{equals:hage.anchor}},limit:1})).docs[0];
  if(record&&record.summary===hage.before){await payload.update({collection:'case-studies',id:record.id,data:{summary:hage.after}});changed++;}
  else if(record&&record.summary!==hage.after)preserved++;
  for(const study of historical) {
    const existing=await payload.find({collection:'case-studies',where:{anchor:{equals:study.anchor}},limit:1});
    if(!existing.docs.length){await payload.create({collection:'case-studies',data:{...study,tags:study.tags.map(label=>({label}))}});created++;}
  }
  console.log(JSON.stringify({addedPageKeys:added,updatedApprovedValues:changed,preservedEditedValues:preserved,createdHistoricalCases:created}));
} finally {await payload.destroy();}
process.exit(0);
