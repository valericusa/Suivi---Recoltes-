(() => {
  'use strict';
  const KEY = 'suivi-recoltes-local-v1';
  const $ = id => document.getElementById(id);
  const seed = window.RECOLTES_SEED;
  const pretty = n => (n / 1000).toLocaleString('fr-FR',{minimumFractionDigits:0, maximumFractionDigits:3}) + ' kg';
  const gramsPretty = n => n >= 1000 ? pretty(n) : n.toLocaleString('fr-FR') + ' g';
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const readableDate = value => { const [y,m,d]=value.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); };
  const clone = obj => JSON.parse(JSON.stringify(obj));
  let state;
  let editingId = null;
  let activeView = 'saisie';
  let selectedWeek = null;
  const WEEK_MS = 7 * 86400000;

  function isValidState(data){
    return data && data.app === 'suivi-recoltes' && data.format === 1 &&
      Array.isArray(data.archive) && Array.isArray(data.entries) && Array.isArray(data.products) &&
      data.archive.every(r => Number.isInteger(r.year) && r.year >= 2018 && r.year < 2200 && typeof r.product === 'string' && Number.isSafeInteger(r.grams) && r.grams >= 0) &&
      data.entries.every(r => typeof r.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.product === 'string' && Number.isSafeInteger(r.grams) && r.grams > 0) &&
      data.products.every(p => typeof p.id === 'string' && p.id.length < 100 && typeof p.label === 'string' && p.label.length < 100) &&
      (data.yearNotes === undefined || (data.yearNotes && typeof data.yearNotes === 'object' && !Array.isArray(data.yearNotes) &&
        Object.entries(data.yearNotes).every(([y,note]) => /^\d{4}$/.test(y) && Number(y)>=2018 && Number(y)<2200 && typeof note==='string' && note.length<=2000)));
  }
  function loadData(){
    const stored = localStorage.getItem(KEY);
    if (!stored) return {...clone(seed),yearNotes:{}};
    try { const data=JSON.parse(stored); if(!isValidState(data)) throw new Error('Format non reconnu');
      // Les produits nouvellement livrés restent accessibles après mise à jour de l'application.
      for(const p of seed.products) if(!data.products.some(x=>x.id===p.id)) data.products.push(clone(p));
      if(!data.archive.length) data.archive=clone(seed.archive);
      data.yearNotes ||= {}; // Compatibilité des données locales V1.0/V1.1
      return data;
    } catch(e){ alert('La sauvegarde locale est illisible. Un catalogue vierge sera chargé. Ne supprimez pas votre fichier de sauvegarde Drive.'); return {...clone(seed),yearNotes:{}}; }
  }
  function store(){
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch(e){ alert('Impossible d’enregistrer sur cet appareil. Vérifiez l’espace libre et sauvegardez vos données.'); return false; }
  }
  function notify(message, isError=false){ const el=$('notice');el.textContent=message;el.hidden=false;el.classList.toggle('error',isError); }
  function productName(id){return state.products.find(x=>x.id===id)?.label ?? id;}
  function productsSorted(){return [...state.products].sort((a,b)=>a.label.localeCompare(b.label,'fr'));}
  function optionHtml(id,label){return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;}
  function populateProducts(){
    const prev=$('harvest-product').value;
    $('harvest-product').innerHTML=productsSorted().map(p=>optionHtml(p.id,p.label)).join('');
    if(state.products.some(p=>p.id===prev)) $('harvest-product').value=prev;
    else $('harvest-product').value='TOMATES';
    const jp=$('journal-product').value; const sp=$('stats-product').value;
    $('journal-product').innerHTML=optionHtml('','Tous les produits')+productsSorted().map(p=>optionHtml(p.id,p.label)).join('');
    $('stats-product').innerHTML=productsSorted().map(p=>optionHtml(p.id,p.label)).join('');
    $('journal-product').value=jp && state.products.some(p=>p.id===jp) ? jp : '';
    $('stats-product').value=sp && state.products.some(p=>p.id===sp) ? sp : 'TOMATES';
    $('quick-products').innerHTML=['TOMATES','FRAISES','COURGETTES','FIGUES','CITRONS','ORANGES','CONCOMBRES','PAMPLEMOUSSES','CLEMENTINES'].filter(id=>state.products.some(x=>x.id===id)).map(id=>`<button type="button" data-quick="${escapeHtml(id)}">${escapeHtml(productName(id))}</button>`).join('');
    $('product-count').textContent=`${state.products.length} produits.`;
    $('product-catalog').innerHTML=productsSorted().map(p=>`<span>${escapeHtml(p.label)}</span>`).join('');
    markQuick();
  }
  function markQuick(){document.querySelectorAll('[data-quick]').forEach(b=>b.classList.toggle('is-selected',b.dataset.quick===$('harvest-product').value));}
  function availableYears(){ const years=new Set(seed.archive.map(r=>r.year)); years.add(2026); years.add(new Date().getFullYear()); state.entries.forEach(x=>years.add(Number(x.date.slice(0,4)))); Object.keys(state.yearNotes||{}).forEach(y=>years.add(Number(y))); return [...years].sort((a,b)=>a-b); }
  function populateYears(){
    for(const id of ['journal-year','stats-year']){
      const original=$(id).value || '2026';
      $(id).innerHTML=availableYears().map(y=>optionHtml(String(y),y)).join('');
      $(id).value=availableYears().some(y=>String(y)===original) ? original : '2026';
    }
  }
  function entriesForDate(date){return state.entries.filter(e=>e.date===date).sort((a,b)=>b.createdAt?.localeCompare(a.createdAt||'')||0);}
  function entryMarkup(e){return `<div class="entry-row"><span class="entry-name">${escapeHtml(productName(e.product))}</span><span class="entry-weight">${escapeHtml(gramsPretty(e.grams))}</span><span class="entry-actions"><button type="button" class="icon-button" data-edit="${escapeHtml(e.id)}" title="Modifier" aria-label="Modifier la pesée">✎</button><button type="button" class="icon-button" data-delete="${escapeHtml(e.id)}" title="Supprimer" aria-label="Supprimer la pesée">×</button></span></div>`;}
  function renderDay(){
    const date=$('harvest-date').value||localDate(); const rows=entriesForDate(date);
    $('daily-title').textContent=`Récoltes du ${date.split('-').reverse().join('/')}`;
    $('daily-summary').textContent=pretty(rows.reduce((s,r)=>s+r.grams,0));
    $('daily-entries').innerHTML=rows.length?rows.map(entryMarkup).join(''):'<div class="empty">Aucune pesée enregistrée à cette date.</div>';
  }
  function renderJournal(){
    const year=Number($('journal-year').value); const product=$('journal-product').value;
    const filtered=state.entries.filter(r=>Number(r.date.slice(0,4))===year&&(!product||r.product===product)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt?.localeCompare(a.createdAt||'')||0);
    $('journal-summary').innerHTML=`<p class="journal-total">${filtered.length} pesée${filtered.length>1?'s':''} · ${pretty(filtered.reduce((s,x)=>s+x.grams,0))}</p>`;
    if(!filtered.length){$('journal-list').innerHTML='<div class="empty">Aucune récolte quotidienne pour cette sélection.<br>Les années 2018 à 2025 ne comportent que des totaux annuels dans le fichier d’origine.</div>';return;}
    const groups=new Map(); for(const e of filtered){if(!groups.has(e.date))groups.set(e.date,[]);groups.get(e.date).push(e);}
    $('journal-list').innerHTML=[...groups].map(([day,records])=>`<div class="day-block"><div class="day-heading"><span>${escapeHtml(readableDate(day))}</span><span>${escapeHtml(pretty(records.reduce((s,x)=>s+x.grams,0)))}</span></div>${records.map(e=>`<div class="journal-row">${entryMarkup(e)}</div>`).join('')}</div>`).join('');
  }
  function aggregate(){
    const byYear=new Map();
    const add=(year,product,grams)=>{if(!byYear.has(year))byYear.set(year,new Map());const byProduct=byYear.get(year);byProduct.set(product,(byProduct.get(product)||0)+grams);};
    for(const r of state.archive)add(r.year,r.product,r.grams);
    for(const r of state.entries)add(Number(r.date.slice(0,4)),r.product,r.grams);
    return byYear;
  }
  // Notes d'une année : conservées dans le même état local et dans les sauvegardes JSON.
  function renderObservation(year){
    $('observation-title').textContent=`Observation de l'année ${year}`;
    $('year-observation').value=state.yearNotes[String(year)]||'';
    $('observation-status').textContent='Enregistrement automatique · inclus dans la sauvegarde JSON.';
  }
  function updateObservation(){
    const year=String($('stats-year').value);
    const before=state.yearNotes[year];
    const note=$('year-observation').value;
    if(note)state.yearNotes[year]=note;else delete state.yearNotes[year];
    if(!store()){
      if(before === undefined)delete state.yearNotes[year];else state.yearNotes[year]=before;
      $('observation-status').textContent='Enregistrement impossible : vos modifications ne sont pas sauvegardées.';
    }else{
      $('observation-status').textContent='✓ Observation enregistrée sur cette tablette · à sauvegarder sur Drive.';
    }
  }
  // Regroupement lundi-dimanche (jour civil) ; les semaines limitrophes
  // ne comptent que les récoltes appartenant à l'année sélectionnée.
  function calendarWeeks(year,product){
    const first=Date.UTC(year,0,1), last=Date.UTC(year,11,31);
    const monday=first-((new Date(first).getUTCDay()+6)%7)*86400000;
    const count=Math.floor((last-monday)/WEEK_MS)+1;
    const weekly=Array.from({length:count},(_,index)=>({index,grams:0,start:monday+index*WEEK_MS}));
    for(const e of state.entries){
      if(e.product!==product||Number(e.date.slice(0,4))!==year)continue;
      const [y,m,d]=e.date.split('-').map(Number);
      const ms=Date.UTC(y,m-1,d);
      const index=Math.floor((ms-monday)/WEEK_MS);
      if(index>=0&&index<count)weekly[index].grams+=e.grams;
    }
    return weekly;
  }
  function formatWeekDate(ms){
    return new Date(ms).toLocaleDateString('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'});
  }
  function selectWeek(index,weeks){
    const week=weeks[index];if(!week)return;
    selectedWeek=index;
    document.querySelectorAll('[data-week]').forEach(el=>el.classList.toggle('is-selected',Number(el.dataset.week)===index));
    $('weekly-selection').textContent=`Du ${formatWeekDate(week.start)} au ${formatWeekDate(week.start+6*86400000)} : ${gramsPretty(week.grams)} récoltés`;
  }
  function renderWeekly(year,product){
    $('weekly-title').textContent=`${productName(product)} · production par semaine en ${year}`;
    const entries=state.entries.filter(e=>e.product===product&&Number(e.date.slice(0,4))===year);
    const yearTotal=entries.reduce((sum,e)=>sum+e.grams,0);
    $('weekly-year-total').textContent=year>=2026?pretty(yearTotal):'';
    if(year<2026){
      $('weekly-chart').innerHTML='<div class="weekly-empty">Les récoltes de 2018 à 2025 ne sont pas datées dans le fichier Excel. Leur total annuel est conservé, mais une évolution semaine par semaine ne peut pas être calculée.</div>';
      $('weekly-selection').textContent='';
      $('weekly-help').hidden=true;
      return;
    }
    $('weekly-help').hidden=false;
    const weeks=calendarWeeks(year,product);
    const maxData=Math.max(0,...weeks.map(w=>w.grams));
    const max=Math.max(1,maxData);
    // Colonnes fines : 52 ou 53 barres restent visibles sans défilement horizontal.
    const columns=weeks.map(w=>{
      const pct=w.grams?Math.max(2,Math.round(w.grams/max*100)):2;
      const tooltip=`${formatWeekDate(w.start)} – ${formatWeekDate(w.start+6*86400000)} : ${gramsPretty(w.grams)}`;
      return `<button type="button" class="weekly-column" data-week="${w.index}" aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}"><span class="weekly-bar ${w.grams?'':'weekly-zero'}" style="height:${pct}%"></span></button>`;
    }).join('');
    const months=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
    $('weekly-chart').innerHTML=`<div class="weekly-scale"><span>${escapeHtml(maxData?gramsPretty(maxData):'0 kg')}</span><span>0</span></div><div class="weekly-plot"><div class="weekly-columns" style="--weeks:${weeks.length}">${columns}</div><div class="weekly-months">${months.map(m=>`<span>${m}</span>`).join('')}</div></div>`;
    // Ouvrir sur la dernière semaine ayant une récolte, ou la première semaine.
    if(selectedWeek===null||selectedWeek>=weeks.length)selectedWeek=Math.max(0,weeks.findLastIndex(w=>w.grams>0));
    selectWeek(selectedWeek,weeks);
  }
  function renderStats(){
    const year=Number($('stats-year').value), product=$('stats-product').value;
    const agg=aggregate();
    renderObservation(year);
    renderWeekly(year,product);
    const data=agg.get(year)||new Map();
    const total=[...data.values()].reduce((a,b)=>a+b,0);
    const grandTotal=[...agg.values()].flatMap(x=>[...x.values()]).reduce((a,b)=>a+b,0);
    const tops=[...data].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
    const latestYear=year<=2025?'Archives Excel':'Saisie quotidienne';
    $('stats-cards').innerHTML=`<div class="metric"><small>Récoltes ${year}</small><strong>${escapeHtml(pretty(total))}</strong><span>${latestYear}</span></div><div class="metric"><small>Total depuis 2018</small><strong>${escapeHtml(pretty(grandTotal))}</strong><span>Toutes les années</span></div><div class="metric"><small>Produit n°1 en ${year}</small><strong>${tops.length?escapeHtml(productName(tops[0][0])):'—'}</strong><span>${tops.length?escapeHtml(pretty(tops[0][1])):'Pas encore de récolte'}</span></div>`;
    const ymax=Math.max(0,...availableYears().map(y=>(agg.get(y)||new Map()).get(product)||0));
    $('chart-title').textContent=`${productName(product)} · évolution annuelle`;
    $('chart').innerHTML=availableYears().map(y=>{
      const n=(agg.get(y)||new Map()).get(product)||0;const px=ymax>0?Math.max(3,Math.round(n/ymax*165)):2;
      return `<div class="chart-item ${y===year?'selected':''}" title="${y} : ${escapeHtml(gramsPretty(n))}"><div class="chart-value">${n?escapeHtml((n/1000).toLocaleString('fr-FR',{maximumFractionDigits:1})):'—'}</div><div class="chart-bar-space"><div class="chart-bar ${n?'':'chart-zero'}" style="height:${px}px"></div></div><div class="chart-year">${y}</div></div>`;
    }).join('');
    const biggest=tops[0]?.[1]||1;
    $('annual-table').innerHTML=tops.length?tops.map(([id,grams])=>`<div class="stat-row"><div><span>${escapeHtml(productName(id))}</span><div class="bar-inline"><span style="width:${Math.round(grams/biggest*100)}%"></span></div></div><strong>${escapeHtml(pretty(grams))}</strong></div>`).join(''):'<div class="empty">Pas encore de récoltes cette année.</div>';
    const annual=availableYears().map(y=>[y,[...(agg.get(y)||new Map()).values()].reduce((a,b)=>a+b,0)]);
    const maxY=Math.max(...annual.map(x=>x[1]),1);
    $('yearly-totals').innerHTML=annual.map(([y,v])=>`<div class="stat-row"><div><span>${y}</span><div class="bar-inline"><span style="width:${Math.round(v/maxY*100)}%"></span></div></div><strong>${escapeHtml(pretty(v))}</strong></div>`).join('');
  }
  function renderAll(){populateYears();renderDay();renderJournal();renderStats();}
  function showView(name){
    activeView=name;
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==`view-${name}`);
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('is-active',b.dataset.view===name));
    if(name==='saisie')renderDay();if(name==='journal')renderJournal();if(name==='stats')renderStats();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function cancelEdit(){editingId=null;$('submit-entry').textContent='+ Ajouter la récolte';$('cancel-edit').hidden=true;$('harvest-weight').value='';}
  function editRecord(id){
    const record=state.entries.find(x=>x.id===id);if(!record)return;
    editingId=id; $('harvest-date').value=record.date;$('harvest-product').value=record.product;
    $('harvest-weight').value=$('harvest-unit').value==='kg' ? String(record.grams/1000).replace('.',',') : String(record.grams);
    $('submit-entry').textContent='✓ Enregistrer la modification';$('cancel-edit').hidden=false;
    markQuick();showView('saisie');$('harvest-weight').focus();
  }
  function deleteRecord(id){
    const record=state.entries.find(x=>x.id===id);if(!record)return;
    if(!confirm(`Supprimer ${gramsPretty(record.grams)} de ${productName(record.product)} du ${record.date.split('-').reverse().join('/')} ?`))return;
    const before=clone(state);state.entries=state.entries.filter(x=>x.id!==id);
    if(!store()){state=before;return;}
    selectedWeek=null;if(editingId===id)cancelEdit();renderAll();notify('Pesée supprimée. Les statistiques ont été recalculées.');
  }
  function saveEntry(event){
    event.preventDefault();const date=$('harvest-date').value, product=$('harvest-product').value;
    const amount=Number($('harvest-weight').value.replace(/\s/g,'').replace(',','.'));
    const grams=Math.round(amount*($('harvest-unit').value==='kg'?1000:1));
    const parsedDate=new Date(`${date}T12:00:00`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsedDate.getTime())||parsedDate.getFullYear()!==Number(date.slice(0,4))||date<'2026-01-01'){
      notify('Les saisies quotidiennes commencent en 2026. Choisissez une date valide.',true);return;
    }
    if(!state.products.some(p=>p.id===product)||!Number.isSafeInteger(grams)||grams<=0||grams>100000000){notify('Indiquez une quantité positive valide, en grammes ou en kilogrammes.',true);return;}
    const before=clone(state);
    if(editingId){const r=state.entries.find(x=>x.id===editingId);if(r){r.date=date;r.product=product;r.grams=grams;}}
    else state.entries.push({id:`r-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,date,product,grams,createdAt:new Date().toISOString()});
    if(!store()){state=before;return;}
    const updated=Boolean(editingId);selectedWeek=null;cancelEdit();renderAll();markQuick();
    notify(`${updated?'Pesée corrigée':'Récolte ajoutée'} : ${gramsPretty(grams)} de ${productName(product)}. Total et statistiques actualisés.`);
    $('harvest-weight').focus();
  }
  function downloadFile(blob,filename){
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function makeBackup(){
    const payload={...state,exportedAt:new Date().toISOString()};
    const filename=`recoltes-sauvegarde-${localDate()}.json`;
    return {file: new File([JSON.stringify(payload,null,2)],filename,{type:'application/json'}),filename};
  }
  function backupDownload(){const {file,filename}=makeBackup();downloadFile(file,filename);notify('Copie JSON téléchargée. Conservez-la dans votre Google Drive.');}
  async function backupShare(){
    const {file}=makeBackup();
    if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
      try {await navigator.share({title:'Sauvegarde Suivi Récoltes',files:[file]});notify('Partage lancé. Vérifiez que le fichier est bien enregistré sur Drive.');return;}
      catch(e){if(e.name==='AbortError')return;}
    }
    backupDownload();
    notify('Partage direct indisponible. Le fichier JSON a été téléchargé : enregistrez-le dans Drive.');
  }
  async function restoreFile(event){
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>10*1024*1024){notify('Ce fichier dépasse la taille prévue pour une sauvegarde.',true);event.target.value='';return;}
    try{
      const imported=JSON.parse(await file.text());
      if(!isValidState(imported))throw new Error('Cette sauvegarde n’appartient pas à Suivi Récoltes.');
      if(!confirm(`Restaurer ${imported.entries.length} pesée(s) quotidiennes, ${imported.archive.length} lignes historiques et ${Object.keys(imported.yearNotes||{}).length} observation(s) annuelle(s) ?\n\nToutes les saisies ET observations actuellement présentes sur cet appareil seront remplacées. Continuez ?`))return;
      for(const p of seed.products) if(!imported.products.some(x=>x.id===p.id)) imported.products.push(clone(p));
      const previous=state;state={app:'suivi-recoltes',format:1,archive:imported.archive,entries:imported.entries,products:imported.products,yearNotes:imported.yearNotes||{}};
      if(!store()){state=previous;return;}
      selectedWeek=null;cancelEdit();populateProducts();renderAll();notify('Sauvegarde restaurée. Historique et statistiques recalculés.');
    }catch(e){notify(`Restauration impossible : ${e.message}`,true);}
    finally{event.target.value='';}
  }
  function addProduct(){
    const entered=prompt('Nom du nouveau produit (ex. haricots verts) :'); if(entered===null)return;
    const name=entered.replace(/\s+/g,' ').trim();if(!name||name.length>70){notify('Indiquez un nom entre 1 et 70 caractères.',true);return;}
    const id=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    if(state.products.some(p=>p.id===id)){ $('harvest-product').value=id;markQuick();showView('saisie');notify('Ce produit figure déjà dans le catalogue.');return; }
    state.products.push({id,label:name[0].toUpperCase()+name.slice(1)});
    if(!store()){state.products.pop();return;}
    populateProducts();$('harvest-product').value=id;markQuick();renderAll();showView('saisie');notify(`${name} ajouté au catalogue. Vous pouvez saisir sa première récolte.`);
  }
  function bind(){
    document.querySelector('.nav').addEventListener('click', e=>{const b=e.target.closest('[data-view]');if(b)showView(b.dataset.view);});
    $('entry-form').addEventListener('submit',saveEntry);
    $('harvest-date').addEventListener('change',renderDay);
    $('harvest-product').addEventListener('change',markQuick);
    $('cancel-edit').addEventListener('click',cancelEdit);
    $('quick-products').addEventListener('click',e=>{const button=e.target.closest('[data-quick]');if(button){$('harvest-product').value=button.dataset.quick;markQuick();$('harvest-weight').focus();}});
    for(const id of ['daily-entries','journal-list']) $(id).addEventListener('click',e=>{const edit=e.target.closest('[data-edit]');const del=e.target.closest('[data-delete]');if(edit)editRecord(edit.dataset.edit);if(del)deleteRecord(del.dataset.delete);});
    $('journal-year').addEventListener('change',renderJournal);$('journal-product').addEventListener('change',renderJournal);
    $('stats-year').addEventListener('change',()=>{selectedWeek=null;renderStats();});$('stats-product').addEventListener('change',()=>{selectedWeek=null;renderStats();});
    $('year-observation').addEventListener('input',updateObservation);
    $('weekly-chart').addEventListener('click',e=>{const btn=e.target.closest('[data-week]');if(btn)selectWeek(Number(btn.dataset.week),calendarWeeks(Number($('stats-year').value),$('stats-product').value));});
    $('share-backup').addEventListener('click',backupShare);$('download-backup').addEventListener('click',backupDownload);
    $('restore-file').addEventListener('change',restoreFile);$('add-product').addEventListener('click',addProduct);
  }
  function start(){
    if(!seed){alert('Impossible de charger les données historiques.');return;}
    state=loadData();$('harvest-date').value=localDate();populateProducts();populateYears();bind();renderAll();
    if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  start();
})();
