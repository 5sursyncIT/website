import './guard';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { getPayload } from 'payload';
import config from '../src/payload.config';
import defaults from '../src/content/defaults.json';
import plan from '../src/content/enrichment-plan.json';
import hage from '../src/content/case-enrichment-plan.json';
import { projectSeeds } from '../src/lib/showcase';
import { contactFromCopy } from '../src/lib/contact-details';
const p=await getPayload({config});
let checks=0;
try {
  for(const page of defaults) {
    const entry=plan.pages[page.slug as keyof typeof plan.pages];
    let copy=page.texts.filter(row=>!entry?.additions.some(x=>x.key===row.key)).map(row=>({...row}));
    for(const replacement of entry?.replacements??[]) {
      const row=copy.find(x=>x.key===replacement.key);if(row)row.value=replacement.before;
    }
    if(page.slug==='services')copy.find(x=>x.key==='text-37')!.value='Conseil personnalisé saisi par le propriétaire.';
    if(page.slug==='contact')copy.find(x=>x.key==='phone')!.value='+221 77 052 20 46';
    await p.create({collection:'pages',data:{slug:page.slug,title:page.title,copy}});
  }
  for(const seed of projectSeeds)await p.create({collection:'projects',data:{...seed,status:seed.status as 'completed',builtinLogo:seed.builtinLogo as 'rtg'|undefined,published:true,showOnHome:true}});
  await p.create({collection:'case-studies',data:{anchor:hage.anchor,client:'Groupe Hage',project:'Réseau Wi-Fi',summary:hage.before,illustration:'infrastructure',order:0,published:true}});
  await p.create({collection:'case-studies',data:{anchor:'mismo-equip',client:'Mismo Equip',project:'Titre édité',summary:'Description récente conservée.',published:false}});
  await p.updateGlobal({slug:'social-links',data:{links:[{platform:'whatsapp',url:'https://wa.me/221770972908'}]}});
  const beforeProjects=(await p.find({collection:'projects',limit:20,depth:0})).docs.map(x=>({id:x.id,name:x.name,mission:x.mission,status:x.status}));
  const run=()=>{
    const text=execFileSync(process.execPath,['--import','tsx','scripts/seed-enrichment.ts'],{env:process.env,encoding:'utf8'});
    return JSON.parse(text.trim().split('\n').at(-1)!);
  };
  const first=run();assert.equal(first.createdHistoricalCases,5);assert.ok(first.addedPageKeys>0);checks++;
  const second=run();assert.equal(second.addedPageKeys,0);assert.equal(second.updatedApprovedValues,0);assert.equal(second.createdHistoricalCases,0);checks++;
  const contact=(await p.find({collection:'pages',where:{slug:{equals:'contact'}},limit:1})).docs[0];
  const copy=Object.fromEntries(contact.copy!.map(x=>[x.key,x.value]));
  const details=contactFromCopy(copy);
  assert.deepEqual(details.phones.map(x=>x.href),['tel:+221770972908','tel:+221338057909','tel:+221768813039']);checks++;
  assert.equal(details.email,'contact@5sursync.com');assert.match(details.address,/Résidence El'hadji Oumar Dieng/);checks++;
  assert.equal(new URL(details.mapSearch).searchParams.get('query'),details.address);assert.equal(new URL(details.directions).searchParams.get('destination'),details.address);checks++;
  assert.ok(!details.mapEmbed.includes('Sonatel'));checks++;
  const services=(await p.find({collection:'pages',where:{slug:{equals:'services'}},limit:1})).docs[0];
  assert.equal(services.copy!.find(x=>x.key==='text-37')!.value,'Conseil personnalisé saisi par le propriétaire.');checks++;
  const mimo=(await p.find({collection:'case-studies',where:{anchor:{equals:'mismo-equip'}},limit:1})).docs[0];
  assert.equal(mimo.summary,'Description récente conservée.');assert.equal(mimo.published,false);checks++;
  assert.deepEqual((await p.find({collection:'projects',limit:20,depth:0})).docs.map(x=>({id:x.id,name:x.name,mission:x.mission,status:x.status})),beforeProjects);checks++;
  assert.deepEqual((await p.findGlobal({slug:'social-links'})).links!.map(x=>({platform:x.platform,url:x.url})),[{platform:'whatsapp',url:'https://wa.me/221770972908'}]);checks++;
  await p.updateGlobal({slug:'social-links',data:{links:[{platform:'facebook',url:'https://www.facebook.com/example'},{platform:'whatsapp',url:'https://wa.me/221770522046'},{platform:'whatsapp',url:'https://wa.me/221770522046'}]}});
  const whatsapp=()=>execFileSync(process.execPath,['--import','tsx','scripts/configure-whatsapp.ts'],{env:process.env,encoding:'utf8'});
  whatsapp();
  assert.deepEqual((await p.findGlobal({slug:'social-links'})).links!.map(x=>({platform:x.platform,url:x.url})),[{platform:'facebook',url:'https://www.facebook.com/example'},{platform:'whatsapp',url:'https://wa.me/221770972908'}]);checks++;
  assert.match(whatsapp(),/already configured, no change/);checks++;
  assert.equal((await p.find({collection:'case-studies',where:{anchor:{equals:hage.anchor}},limit:1})).docs[0].summary,hage.after);checks++;
  const solution=(await p.find({collection:'pages',where:{slug:{equals:'solutions-metier'}},limit:1})).docs[0];
  assert.equal(solution.copy!.filter(x=>/^product-.*-name$/.test(x.key)).length,6);checks++;
  console.log(`PASS ${checks} enrichment assertions: idempotence, preserved edits/projects/WhatsApp, exact contact and six ranges`);
} catch(error){console.error(error);process.exitCode=1;} finally {await p.destroy();process.exit(process.exitCode||0);}
