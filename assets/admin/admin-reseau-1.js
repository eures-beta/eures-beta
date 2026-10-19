const api="/api/forms/eures-beta/admin/reseau/contacts", $=id=>document.getElementById(id);
let contacts=[],page=0,detailVersion=0,canWrite=false,currentContact=null,editorConfig=null,editingContact=null,editorVersion=0,saving=false;
const labels={Prenom:"Prénom",Nom:"Nom",Organisation:"Organisation",Fonction:"Fonction",Pays:"Pays",Type_contact:"Type de contact",Actif:"Actif",Email:"Email",Telephone:"Téléphone",Source_contact:"Source du contact",Date_premier_contact:"Premier contact",Introduit_par:"Introduit par",Newsletter_statut:"Consentement newsletter",Date_consentement:"Date du consentement",Derniere_interaction:"Dernière interaction",Notes:"Notes",Proprietaire_contact:"Propriétaire du contact"};
function display(value,key){if(value===null||value===undefined||value==="")return "Non renseigné";if(typeof value==="boolean")return value?"Oui":"Non";if(["Date_premier_contact","Date_consentement","Derniere_interaction"].includes(key)&&typeof value==="number")return new Date(value*1000).toLocaleDateString("fr-FR",{timeZone:"UTC"});if(Array.isArray(value))return value[0]==="L"?value.slice(1).join(", "):"Valeur non affichable";return String(value);}
function normalize(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
async function read(url){const response=await fetch(url,{credentials:"same-origin",cache:"no-store",redirect:"error"});if(response.status===401)throw Error("Session expirée. Reconnectez-vous depuis l’administration.");if(response.status===403)throw Error("Votre compte ne dispose pas de l’accès Réseau.");const data=await response.json();if(!response.ok)throw Error(data.error||"Service indisponible.");return data;}
function render(){const query=normalize($("search").value);const filtered=contacts.filter(c=>[`${c.Prenom??""} ${c.Nom??""}`,`${c.Nom??""} ${c.Prenom??""}`,c.Organisation,c.Fonction,c.Pays,c.Type_contact].some(v=>normalize(v).includes(query))&&(!$("country").value||c.Pays===$("country").value)&&(!$("type").value||c.Type_contact===$("type").value)&&(!$("active").value||(typeof c.Actif==="boolean"?String(c.Actif):"unknown")===$("active").value));const count=Math.max(1,Math.ceil(filtered.length/25));page=Math.min(page,count-1);$("rows").replaceChildren();for(const c of filtered.slice(page*25,(page+1)*25)){const row=document.createElement("tr"),cell=document.createElement("td"),button=document.createElement("button");button.textContent=[c.Prenom,c.Nom].filter(Boolean).join(" ")||"Contact sans nom";button.addEventListener("click",()=>openContact(c.id));cell.append(button);row.append(cell);for(const key of ["Organisation","Fonction","Pays","Type_contact"]){const td=document.createElement("td");td.textContent=display(c[key],key);row.append(td);}$("rows").append(row);}$("status").textContent=filtered.length?`${filtered.length} contact(s)`:(contacts.length?"Aucun contact ne correspond aux filtres.":"Aucun contact initiative enregistré.");$("page").textContent=`Page ${page+1} / ${count}`;$("previous").disabled=page===0;$("next").disabled=page>=count-1;}
async function load(){contacts=[];$("rows").replaceChildren();$("retry").hidden=true;$("status").textContent="Chargement des contacts…";try{contacts=(await read(api)).contacts;contacts.sort((a,b)=>`${a.Nom??""} ${a.Prenom??""}`.localeCompare(`${b.Nom??""} ${b.Prenom??""}`,"fr"));for(const [id,key] of [["country","Pays"],["type","Type_contact"]]){const select=$(id);while(select.options.length>1)select.remove(1);for(const value of [...new Set(contacts.map(c=>c[key]).filter(v=>typeof v==="string"&&v))].sort()){const option=document.createElement("option");option.value=value;option.textContent=value;select.append(option);}}render();}catch(error){$("status").textContent=error.message;$("retry").hidden=false;}}
async function openContact(id){const version=++detailVersion;$("edit-contact").hidden=true;currentContact=null;$("details").replaceChildren();$("detail-status").textContent="Chargement de la fiche…";$("contact-dialog").showModal();try{const c=(await read(`${api}/${id}`)).contact;if(version!==detailVersion)return;currentContact=c;$("edit-contact").hidden=!canWrite;$("detail-status").textContent="";for(const [key,label] of Object.entries(labels)){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=display(key==="Proprietaire_contact"?(c.Proprietaire_contact_label||c[key]):c[key],key);$("details").append(dt,dd);}}catch(error){if(version===detailVersion)$("detail-status").textContent=error.message;}}
$("close").onclick=()=>$("contact-dialog").close();$("contact-dialog").addEventListener("close",()=>{detailVersion++;$("details").replaceChildren();});for(const id of ["search","country","type","active"])$(id).addEventListener("input",()=>{page=0;render();});$("previous").onclick=()=>{page--;render();};$("next").onclick=()=>{page++;render();};$("retry").onclick=load;window.addEventListener("pageshow",event=>{if(event.persisted)location.reload();});load();
const sections=[['Identité',['Prenom','Nom','Organisation','Fonction']],['Coordonnées',['Email','Telephone','Pays']],['Relation Match Europe',['Type_contact','Source_contact','Date_premier_contact','Introduit_par','Proprietaire_contact','Notes']],['Newsletter & suivi',['Newsletter_statut','Date_consentement','Derniere_interaction','Actif']]];
const dateFields=['Date_premier_contact','Date_consentement','Derniere_interaction'];
const limits={Prenom:200,Nom:200,Organisation:300,Fonction:300,Email:254,Telephone:50,Pays:100,Introduit_par:300,Notes:10000};
function option(select,value,label){const item=document.createElement('option');item.value=value;item.textContent=label;select.append(item);}
async function openEditor(contact=null){
  const version=++editorVersion;
  $('editor-error').textContent='';$('editor-fields').replaceChildren();$('save-contact').disabled=true;
  editingContact=contact;$('editor-title').textContent=contact?'Modifier le contact':'Ajouter un contact';
  $('editor-dialog').showModal();
  try{
    const config=await read(api.replace('/contacts','/editor'));
    if(version!==editorVersion)return;
    editorConfig=config;
    for(const [title,keys] of sections){
      const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;group.append(legend);
      for(const key of keys){
        if(key==='Actif'&&!contact)continue;
        const label=document.createElement('label');label.textContent=labels[key];
        let input,value=contact?contact[key]:key==='Proprietaire_contact'?editorConfig.default_owner:key==='Newsletter_statut'?'Non sollicité':'';
        if(editorConfig.choices[key]||key==='Proprietaire_contact'||key==='Actif'){
          input=document.createElement('select');
          if(key==='Proprietaire_contact'){
            for(const owner of editorConfig.owners)option(input,owner.id,owner.label);
            if(contact&&!editorConfig.owners.some(o=>o.id===value))option(input,value??'',`Valeur antérieure conservée : ${value||'Non renseigné'}`);
          }else if(key==='Actif'){
            option(input,'true','Oui');option(input,'false','Non');
            if(typeof value!=='boolean')option(input,'','Non renseigné (conserver)');
          }else{
            if(key!=='Newsletter_statut'||contact)option(input,'','Non renseigné');
            for(const choice of editorConfig.choices[key])option(input,choice,choice);
            if(value&&!editorConfig.choices[key].includes(value))option(input,value,`Valeur antérieure : ${value} (à corriger)`);
          }
        }else{
          input=document.createElement(key==='Notes'?'textarea':'input');
          if(key==='Notes')label.className='wide';
          if(dateFields.includes(key)){input.type='date';if(typeof value==='number')value=new Date(value*1000).toISOString().slice(0,10);}
          else {if(key!=='Notes')input.type=key==='Email'?'email':key==='Telephone'?'tel':'text';input.maxLength=limits[key]||300;}
        }
        input.name=key;input.id='field-'+key;input.value=value??'';label.append(input);group.append(label);
      }
      if(title==='Newsletter & suivi'){const note=document.createElement('p');note.className='wide';note.textContent='Accepté exige une date de consentement connue. Cette date seule ne constitue pas une preuve juridique du consentement.';group.append(note);}
      $('editor-fields').append(group);
    }
    $('save-contact').disabled=false;
  }catch(error){if(version===editorVersion)$('editor-error').textContent=error.message;}
}
$('editor-form').onsubmit=async event=>{
  event.preventDefault();if(saving)return;saving=true;$('cancel-edit').disabled=true;$('save-contact').disabled=true;$('editor-error').textContent='';
  const payload={};for(const element of $('editor-form').elements){if(!element.name)continue;if(element.name==='Actif'&&element.value==='')continue;let previous=editingContact?.[element.name]??'';if(dateFields.includes(element.name)&&typeof previous==='number')previous=new Date(previous*1000).toISOString().slice(0,10);const value=element.name==='Actif'?element.value==='true':element.value;if(!editingContact||value!==previous)payload[element.name]=value;}
  try{
    const response=await fetch(editingContact?`${api}/${editingContact.id}`:api,{method:editingContact?'PATCH':'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-Network-CSRF':editorConfig.csrf},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Enregistrement impossible.');
    $('editor-dialog').close();$('contact-dialog').close();await load();
  }catch(error){$('editor-error').textContent=error.message;}
  finally{saving=false;$('cancel-edit').disabled=false;$('save-contact').disabled=false;}
};
$('editor-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
$('editor-dialog').addEventListener('close',()=>{editorVersion++;$('editor-fields').replaceChildren();editorConfig=null;editingContact=null;});
$('add-contact').onclick=()=>openEditor();$('edit-contact').onclick=()=>openEditor(currentContact);$('cancel-edit').onclick=()=>$('editor-dialog').close();
read(api.replace('/contacts','/access')).then(data=>{canWrite=data.can_write===true;$('add-contact').hidden=!canWrite;}).catch(()=>{});
