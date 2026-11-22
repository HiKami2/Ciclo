"use strict";
/* ================= Utilidades ================= */
const MESES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MES3=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const EUR=new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"});
const eur=v=>EUR.format(v||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const perKey=(y,m)=>`${y}-${pad(m)}`;            // m = 1..12
const perParts=k=>k.split("-").map(Number);
const addMonths=(k,n)=>{let [y,m]=perParts(k);m+=n;while(m>12){m-=12;y++}while(m<1){m+=12;y--}return perKey(y,m)};
const fmtD=s=>{if(!s)return"sem data";const d=parseISO(s);return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`};
const fmtDshort=d=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
const uid=()=>"x"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),2200)}

/* ================= Dados, encriptação e sincronização (GitHub) ================= */
const LS_KEY="minhasDespesas.web.v1", LS_SYNC="minhasDespesas.web.sync";
const CFG=Object.assign({dataRepo:"",dataPath:"dados.enc.json"},window.APP_CONFIG||{});
let DB=null;
let SYNC=null;            // {repo,path,token}
let KEY=null;             // CryptoKey (não exportável) + salt
let syncState="off";      // off | idle | syncing | offline | error | locked
let lastSync=null, syncErr="", syncTimer=null, pending=false, remoteSha=null;

function lsGet(){try{const s=localStorage.getItem(LS_KEY);return s?JSON.parse(s):null}catch(e){return null}}
function lsSet(){try{localStorage.setItem(LS_KEY,JSON.stringify(DB));return true}catch(e){return false}}
function syncGet(){try{return JSON.parse(localStorage.getItem(LS_SYNC)||"null")}catch(e){return null}}
function syncSet(v){try{v?localStorage.setItem(LS_SYNC,JSON.stringify(v)):localStorage.removeItem(LS_SYNC)}catch(e){}}

function idb(){return new Promise((res,rej)=>{const r=indexedDB.open("minhasDespesasWeb",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function kvGet(k){try{const db=await idb();return await new Promise(r=>{const q=db.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(null)})}catch(e){return null}}
async function kvSet(k,v){try{const db=await idb();await new Promise(r=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=r;t.onerror=r})}catch(e){}}
async function kvDel(k){try{const db=await idb();await new Promise(r=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").delete(k);t.oncomplete=r;t.onerror=r})}catch(e){}}

/* --- base64 / utf8 --- */
const enc=new TextEncoder(), dec=new TextDecoder();
function b64e(bytes){let s="";const b=new Uint8Array(bytes);for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)}
function b64d(str){const s=atob(str.replace(/\s/g,""));const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b}

/* --- encriptação AES-GCM com chave derivada da palavra-passe (PBKDF2) --- */
const ITER=310000;
async function deriveKey(pass,salt){
  const base=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITER},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encryptDB(obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},KEY.key,enc.encode(JSON.stringify(obj)));
  return JSON.stringify({app:"eciclo",formato:1,kdf:"PBKDF2-SHA256",iter:ITER,salt:KEY.salt,iv:b64e(iv),dados:b64e(ct)})}
async function decryptEnvelope(env,key){
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(env.iv)},key,b64d(env.dados));return JSON.parse(dec.decode(pt))}

/* --- GitHub API --- */
async function gh(method,body){
  const url=`https://api.github.com/repos/${SYNC.repo}/contents/${encodeURIComponent(SYNC.path)}`;
  const r=await fetch(url,{method,cache:"no-store",headers:{"Authorization":"Bearer "+SYNC.token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  return r}
async function ghRead(){ // → {sha, env} | null (não existe)
  const r=await gh("GET");
  if(r.status===404){const rr=await fetch(`https://api.github.com/repos/${SYNC.repo}`,{cache:"no-store",headers:{"Authorization":"Bearer "+SYNC.token,"Accept":"application/vnd.github+json"}});
    if(rr.status===404)throw new Error("repo");return null}
  if(r.status===401)throw new Error("token");
  if(r.status===403)throw new Error("permissao");
  if(!r.ok)throw new Error("http"+r.status);
  const j=await r.json();const env=JSON.parse(dec.decode(b64d(j.content)));return{sha:j.sha,env}}
async function ghWrite(text,sha){
  const r=await gh("PUT",{message:`Atualização ${new Date().toLocaleString("pt-PT")}`,content:b64e(enc.encode(text)),...(sha?{sha}:{})});
  if(r.status===409||r.status===422)return{conflict:true};
  if(r.status===401)throw new Error("token");
  if(r.status===403||r.status===404)throw new Error("permissao");
  if(!r.ok)throw new Error("http"+r.status);
  const j=await r.json();return{sha:j.content.sha}}
function errMsg(e){const m=String(e&&e.message||e);
  return m==="token"?"O token do GitHub é inválido ou expirou.":m==="repo"?"Repositório não encontrado (ou o token não tem acesso a ele).":m==="permissao"?"O token não tem permissão de escrita. No GitHub, edita o token e põe Contents em “Read and write”.":m==="pass"?"Palavra-passe errada.":
    (!navigator.onLine||m.includes("Failed to fetch")||m.includes("NetworkError"))?"Sem ligação à internet.":"Erro: "+m}

/* --- registo de alterações por item (para juntar dados de vários dispositivos) --- */
let SNAP=null;
function snapOf(d){const s={m:new Map(),p:new Map(),pl:new Map(),cfg:""};
  d.movimentos.forEach(x=>{const {u,...r}=x;s.m.set(x.id,JSON.stringify(r))});
  d.poupancas.forEach(x=>{const {u,...r}=x;s.p.set(x.id,JSON.stringify(r))});
  d.plano.forEach(x=>{const {u,...r}=x;s.pl.set(x.per,JSON.stringify(r))});
  const {u,...c}=d.config;s.cfg=JSON.stringify(c);return s}
function stamp(){
  const now=Date.now(),old=SNAP||snapOf({movimentos:[],poupancas:[],plano:[],config:{}});const cur=snapOf(DB);
  DB.apagados=DB.apagados||{};
  DB.movimentos.forEach(x=>{if(old.m.get(x.id)!==cur.m.get(x.id))x.u=now});
  DB.poupancas.forEach(x=>{if(old.p.get(x.id)!==cur.p.get(x.id))x.u=now});
  DB.plano.forEach(x=>{if(old.pl.get(x.per)!==cur.pl.get(x.per))x.u=now});
  if(old.cfg!==cur.cfg)DB.config.u=now;
  for(const id of old.m.keys())if(!cur.m.has(id))DB.apagados[id]=now;
  for(const id of old.p.keys())if(!cur.p.has(id))DB.apagados[id]=now;
  SNAP=cur}
function mergeDB(a,b){ // junta dois conjuntos de dados; vence a alteração mais recente de cada item
  const ap={...(a.apagados||{})};for(const[k,v]of Object.entries(b.apagados||{}))ap[k]=Math.max(ap[k]||0,v);
  const byKey=(x,y,key)=>{const m=new Map();for(const it of x)m.set(it[key],it);for(const it of y){const c=m.get(it[key]);if(!c||(it.u||0)>(c.u||0))m.set(it[key],it)}
    return [...m.values()].filter(it=>!(ap[it[key]]&&ap[it[key]]>=(it.u||0)))};
  const ca=a.config||{},cb=b.config||{};
  return normalize({versao:Math.max(a.versao||1,b.versao||1),config:(cb.u||0)>(ca.u||0)?cb:ca,
    movimentos:byKey(a.movimentos||[],b.movimentos||[],"id"),poupancas:byKey(a.poupancas||[],b.poupancas||[],"id"),
    plano:byKey(a.plano||[],b.plano||[],"per"),apagados:ap})}

/* --- ciclo de sincronização --- */
function changed(){DB.alterado=new Date().toISOString();stamp();lsSet();scheduleSync(1200);render()}
function scheduleSync(ms){clearTimeout(syncTimer);if(!SYNC||!KEY)return;pending=true;renderSaveState();syncTimer=setTimeout(syncNow,ms)}
let syncing=false;
async function syncNow(){
  if(!SYNC||!KEY){syncState=SYNC?"locked":"off";renderSaveState();return}
  if(syncing){pending=true;return}
  syncing=true;syncState="syncing";renderSaveState();
  try{
    for(let tent=0;tent<3;tent++){
      const rem=await ghRead();let merged=DB,sha=null;
      if(rem){sha=rem.sha;let rdata;try{rdata=await decryptEnvelope(rem.env,KEY.key)}catch(e){throw new Error("pass")}
        merged=mergeDB(DB,rdata);
        if(JSON.stringify(merged)===JSON.stringify(normalize(rdata))&&!pending){DB=merged;break}}
      pending=false;
      const w=await ghWrite(await encryptDB(merged),sha);
      if(w.conflict)continue;
      DB=merged;remoteSha=w.sha;break}
    SNAP=snapOf(DB);lsSet();refreshFer();lastSync=new Date();syncState="idle";syncErr="";
  }catch(e){syncErr=errMsg(e);syncState=(!navigator.onLine||syncErr.startsWith("Sem ligação"))?"offline":"error";if(String(e.message)==="pass")syncState="locked"}
  finally{syncing=false;renderSaveState();if(!$("#modalBg").classList.contains("open"))render();if(pending&&syncState==="idle")scheduleSync(300)}
}
async function connectSync(repo,token,pass,pass2){
  const prev=SYNC;SYNC={repo:repo.trim(),path:CFG.dataPath||"dados.enc.json",token:token.trim()};
  try{
    const rem=await ghRead();
    if(rem){ // já existem dados: valida a palavra-passe
      const salt=b64d(rem.env.salt);const key=await deriveKey(pass,salt);
      let rdata;try{rdata=await decryptEnvelope(rem.env,key)}catch(e){throw new Error("pass")}
      KEY={key,salt:rem.env.salt};DB=mergeDB(DB,rdata);
    }else{
      if(pass.length<10)return "A palavra-passe tem de ter pelo menos 10 caracteres.";
      if(pass!==pass2)return "As palavras-passe não coincidem.";
      const salt=crypto.getRandomValues(new Uint8Array(16));KEY={key:await deriveKey(pass,salt),salt:b64e(salt)};
      stamp();
    }
    await kvSet("key",KEY);syncSet(SYNC);SNAP=snapOf(DB);lsSet();refreshFer();
    await syncNow();return syncState==="idle"?null:syncErr;
  }catch(e){SYNC=prev;return errMsg(e)}
}
async function probeRepo(repo,token){ // diz se já há dados no repositório
  const prev=SYNC;SYNC={repo:repo.trim(),path:CFG.dataPath||"dados.enc.json",token:token.trim()};
  try{const r=await ghRead();return{exists:!!r}}catch(e){return{error:errMsg(e)}}finally{SYNC=prev}}
async function logoutDevice(){
  try{localStorage.removeItem(LS_KEY);localStorage.removeItem(LS_SYNC)}catch(e){}
  await kvDel("key");location.reload()}

function validData(d){return d&&Array.isArray(d.movimentos)&&d.config}
function normalize(d){
  d.versao=d.versao||1;d.plano=d.plano||[];d.poupancas=d.poupancas||[];d.movimentos=d.movimentos||[];d.apagados=d.apagados||{};
  d.config=d.config||{};d.config.categorias=d.config.categorias||[];d.config.destinos=d.config.destinos||[];d.config.feriados=d.config.feriados||[];
  d.config.diaOrdenado=d.config.diaOrdenado||22;return d}
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=(19*a+b-Math.floor(b/4)-Math.floor((b-Math.floor((b+8)/25)+1)/3)+15)%30,
  e=(32+2*(b%4)+2*Math.floor(c/4)-d-(c%4))%7,f=d+e-7*Math.floor((a+11*d+22*e)/451)+114;return new Date(y,Math.floor(f/31)-1,f%31+1)}
function feriadosPT(y0,n){const out=[];for(let y=y0;y<y0+n;y++){const E=easter(y),add=k=>{const d=new Date(E);d.setDate(d.getDate()+k);return iso(d)};
  out.push(`${y}-01-01`,add(-2),add(0),`${y}-04-25`,`${y}-05-01`,add(60),`${y}-06-10`,`${y}-08-15`,`${y}-10-05`,`${y}-11-01`,`${y}-12-01`,`${y}-12-08`,`${y}-12-25`)}return out.sort()}
function emptyDB(){const y=new Date().getFullYear();return normalize({versao:2,config:{diaOrdenado:22,feriados:feriadosPT(y-1,6),
  categorias:["Subscrições","Carro","Combustível","Casa","Restauração","Compras","Viagens","Lazer","Prendas","Apostas","Família e amigos","Saúde e desporto","Banco e taxas","Dia a dia","Entradas","Ajustes","Outros"].map(n=>({nome:n,orcamento:null})),
  destinos:["Poupança Mensal","Carro - Imprevistos","Férias"]},movimentos:[],plano:[],poupancas:[]})}

function download(name,content,type){
  const b=new Blob([content],{type});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function exportJSON(){const {apagados,...d}=DB;download(`eciclo-copia-${iso(new Date())}.json`,JSON.stringify(d,null,1),"application/json");toast("Cópia de segurança exportada (não encriptada — guarda-a em local seguro)")}
function exportCSV(){
  const q=s=>`"${String(s??"").replace(/"/g,'""')}"`;const num=v=>v==null?"":String(v).replace(".",",");
  const lines=[["Data","Descrição","Valor","Gasto","Recebido","Categoria","Tipo","Pausado","Ano","Mês","Situação","Notas"].join(";")];
  for(const m of sortedMovs()){const p=periodOf(m);const [y,mm]=p?perParts(p):["",""];
    lines.push([m.data?fmtD(m.data):"",q(m.desc),num(m.valor),num(gasto(m)),num(recebido(m)),q(m.cat),m.tipo,m.pausado?"Sim":"",y,mm?MESES[mm-1]:"",status(m).txt,q(m.nota)].join(";"))}
  download(`despesas-${iso(new Date())}.csv`,"﻿"+lines.join("\r\n"),"text/csv;charset=utf-8");toast("Exportado para Excel (CSV)")}

/* ================= Regras ================= */
let ferSet=new Set();
function refreshFer(){ferSet=new Set(DB.config.feriados)}
function payday(y,m){ // m 1..12 → dia do ordenado ou, se não for útil, o dia útil seguinte
  const last=new Date(y,m,0).getDate();let d=new Date(y,m-1,Math.min(DB.config.diaOrdenado,last));
  while(d.getDay()===0||d.getDay()===6||ferSet.has(iso(d)))d.setDate(d.getDate()+1);return d}
function periodOfDate(d){const y=d.getFullYear(),m=d.getMonth()+1;return d>=payday(y,m)?perKey(y,m):addMonths(perKey(y,m),-1)}
function periodOf(mv){if(mv.ajuste)return mv.ajuste;if(!mv.data)return null;return periodOfDate(parseISO(mv.data))}
function periodRange(k){const [y,m]=perParts(k);const s=payday(y,m);const [y2,m2]=perParts(addMonths(k,1));const e=payday(y2,m2);e.setDate(e.getDate()-1);return [s,e]}
const today0=()=>{const t=new Date();t.setHours(0,0,0,0);return t};
function status(mv){
  if(mv.pausado)return{k:"paus",txt:"Pausado"};
  if(mv.valor==null||mv.valor==="")return{k:"sem",txt:"Sem valor"};
  if(mv.valor<0)return{k:"rec",txt:"Recebido"};
  if(mv.data&&parseISO(mv.data)<=today0())return{k:"pago",txt:"Pago"};
  return{k:"pend",txt:"Pendente"}}
const gasto=m=>(!m.pausado&&typeof m.valor==="number"&&m.valor>0)?m.valor:0;
const recebido=m=>(typeof m.valor==="number"&&m.valor<0)?-m.valor:0;
const sortedMovs=()=>[...DB.movimentos].sort((a,b)=>(a.data||"9999").localeCompare(b.data||"9999"));
function movsOf(k){return DB.movimentos.filter(m=>periodOf(m)===k)}
function planOf(k){return DB.plano.find(p=>p.per===k)}
function rendOf(k){const p=planOf(k);return p?(+p.salario||0)+(+p.outros||0):0}
function poupOf(k){return DB.poupancas.filter(p=>p.per===k).reduce((s,p)=>s+(+p.valor||0),0)}
function sums(k){const ms=movsOf(k);const r={fixas:0,variaveis:0,rec:0,pago:0,pend:0,n:ms.length};
  for(const m of ms){const g=gasto(m);if(m.tipo==="Fixa")r.fixas+=g;else r.variaveis+=g;r.rec+=recebido(m);
    const s=status(m).k;if(s==="pago")r.pago+=g;if(s==="pend")r.pend+=g}
  r.rend=rendOf(k);r.poup=poupOf(k);r.plafond=r.rend+r.rec-r.poup-r.fixas-r.variaveis;r.balanco=r.rend+r.rec-r.poup-r.pago;return r}
function curPeriod(){return periodOfDate(today0())}

/* ================= Estado da interface ================= */
const UI={view:"mensal",per:null,ano:null,filtro:{q:"",ano:"",mes:"",tipo:"",cat:""}};
function setView(v){UI.view=v;try{localStorage.setItem(LS_KEY+".view",v)}catch(e){}render();window.scrollTo(0,0)}

/* ================= Render ================= */
function render(){
  document.querySelectorAll("nav.side button").forEach(b=>b.classList.toggle("on",b.dataset.view===UI.view));
  const v={mensal:vMensal,anual:vAnual,movimentos:vMovimentos,plano:vPlano,definicoes:vDefinicoes}[UI.view];
  $("#main").innerHTML=banner()+v();bindView();renderSaveState()}
function banner(){
  if(!SYNC&&UI.view!=="definicoes")return `<div class="banner info">☁️ Liga a sincronização para usares os mesmos dados no telemóvel e no PC. <button class="btn small" data-act="syncsetup">Configurar sincronização</button></div>`;
  if(syncState==="locked")return `<div class="banner">🔒 ${esc(syncErr||"Falta a palavra-passe neste dispositivo.")} <button class="btn small" data-act="syncsetup">Introduzir palavra-passe</button></div>`;
  if(syncState==="error")return `<div class="banner">⚠️ ${esc(syncErr)} <button class="btn small" data-act="syncnow">Tentar de novo</button> <button class="btn small" data-act="syncsetup">Rever configuração</button></div>`;
  return ""}
function renderSaveState(){
  const e=$("#saveState");if(!e)return;let h="";const hm=d=>d.toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
  if(!SYNC)h=`<span class="dot" style="background:var(--amber)"></span><b>Só neste dispositivo</b><br>Configura a sincronização`;
  else if(syncState==="syncing")h=`<span class="dot" style="background:var(--blue)"></span><b>A sincronizar…</b>`;
  else if(syncState==="offline")h=`<span class="dot" style="background:var(--amber)"></span><b>Sem internet</b><br>Guardado no dispositivo; sincroniza depois`;
  else if(syncState==="error"||syncState==="locked")h=`<span class="dot" style="background:var(--red)"></span><b>Por sincronizar</b><br>${esc(syncErr)}`;
  else h=`<span class="dot" style="background:var(--green)"></span><b>${pending?"Por sincronizar…":"Sincronizado"}</b><br>${lastSync?"às "+hm(lastSync):""} · 🔒 encriptado`;
  e.innerHTML=h;const m=$("#syncMini");if(m)m.innerHTML=h.split("<br>")[0].replace(/<\/?b>/g,"")}

function yearsAvail(){const ys=new Set([new Date().getFullYear()]);
  DB.movimentos.forEach(m=>{const p=periodOf(m);if(p)ys.add(perParts(p)[0])});DB.plano.forEach(p=>ys.add(perParts(p.per)[0]));
  const a=[...ys].sort();a.push(a[a.length-1]+1);return a}
const CAT_ICON={"Subscrições":"📺","Carro":"🚗","Combustível":"⛽","Casa":"🏠","Restauração":"🍽️","Compras":"🛍️","Viagens":"✈️","Lazer":"🎭","Prendas":"🎁","Apostas":"🎲","Família e amigos":"👨‍👩‍👧","Saúde e desporto":"💪","Banco e taxas":"🏦","Dia a dia":"☕","Entradas":"💶","Ajustes":"⚖️","Outros":"📦"};
const CAT_HUE={"Subscrições":265,"Carro":215,"Combustível":30,"Casa":160,"Restauração":12,"Compras":330,"Viagens":195,"Lazer":285,"Prendas":350,"Apostas":45,"Família e amigos":140,"Saúde e desporto":100,"Banco e taxas":225,"Dia a dia":25,"Entradas":145,"Ajustes":0,"Outros":40};
const catIcon=c=>CAT_ICON[c]||"🏷️";
function avatar(c){const h=CAT_HUE[c];return `<div class="av" ${h!=null?`style="background:hsl(${h} 80% 50% / .13)"`:""}>${catIcon(c)}</div>`}
function rowHTML(x,meta){return `<div class="row ${x.pausado?"paus":""}" data-edit="${x.id}">${avatar(x.cat)}
  <div class="txt"><div class="d">${esc(x.desc)}</div><div class="m">${meta}</div></div>
  <div class="rt"><div class="v ${x.valor<0?"in":""}">${x.valor==null?"—":(x.valor<0?"+ "+eur(-x.valor):eur(x.valor))}</div>${chip(x)}</div></div>`}
function chip(m){const s=status(m);return `<span class="chip ${s.k}">${s.txt}</span>`}

/* ---------- Mensal ---------- */
function vMensal(){
  const k=UI.per;const [y,m]=perParts(k);const [s,e]=periodRange(k);const S=sums(k);
  const used=S.rend+S.rec>0?Math.min(1,(S.fixas+S.variaveis+S.poup)/(S.rend+S.rec)):0;
  const ys=yearsAvail();
  const ms=movsOf(k).sort((a,b)=>(a.data||"9999").localeCompare(b.data||"9999"));
  const fix=ms.filter(x=>x.tipo==="Fixa"),vari=ms.filter(x=>x.tipo!=="Fixa");
  const list=(arr)=>arr.length?arr.map(x=>rowHTML(x,`${x.data?fmtD(x.data):"sem data"} · ${esc(x.cat||"Sem categoria")}${x.ajuste?" · ajustado":""}`)).join(""):`<div class="empty">Ainda nada neste mês.</div>`;
  const tot=arr=>arr.reduce((t,x)=>t+gasto(x)-recebido(x),0);
  return `<h1>Controlo mensal</h1>
  <div class="sub lg-only">O mês começa no dia do ordenado (${DB.config.diaOrdenado}, ou dia útil seguinte).</div>
  <div class="toolbar">
    <select id="selAno">${ys.map(a=>`<option ${a===y?"selected":""}>${a}</option>`).join("")}</select>
    <div class="seg" id="segMes">${MES3.map((n,i)=>`<button data-m="${i+1}" class="${i+1===m?"on":""}">${n}</button>`).join("")}</div>
    <button class="btn small" data-act="hoje">Mês atual</button>
  </div>
  <div class="toolbar"><button class="iconbtn" data-act="prev">‹</button><div class="period">${MESES[m-1]} ${y}</div><button class="iconbtn" data-act="next">›</button>
    <span class="muted period-info">Ordenado a ${fmtDshort(s)} · até ${fmtDshort(e)}</span></div>
  <div class="cards">
    <div class="card hero"><div class="lbl">Plafond restante</div><div class="val">${eur(S.plafond)}</div><div class="bar"><i style="width:${(used*100).toFixed(0)}%"></i></div><div class="hint">${(used*100).toFixed(0)}% do rendimento já comprometido</div></div>
    <div class="card"><div class="lbl">Rendimento</div><div class="val">${eur(S.rend)}</div><div class="hint">${S.rec?"+ "+eur(S.rec)+" recebido":"&nbsp;"}</div></div>
    <div class="card"><div class="lbl">Despesas fixas</div><div class="val">${eur(S.fixas)}</div></div>
    <div class="card"><div class="lbl">Variáveis</div><div class="val">${eur(S.variaveis)}</div></div>
    <div class="card"><div class="lbl">Poupança</div><div class="val" style="color:var(--blue)">${eur(S.poup)}</div></div>
    <div class="card"><div class="lbl">Balanço atual</div><div class="val">${eur(S.balanco)}</div><div class="hint">só o que já foi pago</div></div>
    <div class="card"><div class="lbl">Por pagar</div><div class="val" style="color:var(--amber)">${eur(S.pend)}</div></div>
  </div>
  ${S.rend===0?`<div class="banner info">Ainda não tens rendimento definido para ${MESES[m-1]} ${y}. <button class="btn small" data-act="goplano">Definir no Plano</button></div>`:""}
  <div class="grid2">
    <div class="panel"><h2>Despesas fixas <span class="count">${fix.length} itens</span><span class="tot">${eur(tot(fix))}</span></h2>
      <div class="list">${list(fix)}</div>
      <div class="foot"><button class="btn small" data-act="addfixa">+ Fixa</button><button class="btn small" data-act="copyfix">↻ Copiar fixas do mês anterior</button></div></div>
    <div class="panel"><h2>Despesas variáveis <span class="count">${vari.length} itens</span><span class="tot">${eur(tot(vari))}</span></h2>
      <div class="list">${list(vari)}</div>
      <div class="foot"><button class="btn small" data-act="addvar">+ Variável</button><button class="btn small" data-act="addrec">+ Recebido</button></div></div>
  </div>`}

/* ---------- Anual ---------- */
function vAnual(){
  const y=UI.ano;const ys=yearsAvail();const rows=[];let T={rend:0,fixas:0,variaveis:0,rec:0,poup:0,plafond:0,pend:0};
  for(let m=1;m<=12;m++){const k=perKey(y,m);const S=sums(k);const has=S.n||S.rend||S.poup;rows.push({m,k,S,has});
    if(has)for(const f in T)T[f]+=S[f]}
  const cur=curPeriod();
  const cats={};for(const mv of DB.movimentos){const p=periodOf(mv);if(!p||perParts(p)[0]!==y)continue;const c=mv.cat||"Sem categoria";
    cats[c]=cats[c]||{g:0,r:0};cats[c].g+=gasto(mv);cats[c].r+=recebido(mv)}
  const catArr=Object.entries(cats).filter(([,v])=>v.g||v.r).sort((a,b)=>b[1].g-a[1].g);const gT=catArr.reduce((s,[,v])=>s+v.g,0);
  const nMeses=rows.filter(r=>r.S.rend>0).length||1;
  const orc=n=>{const c=DB.config.categorias.find(c=>c.nome===n);return c&&c.orcamento?+c.orcamento:null};
  // gráfico
  const W=760,H=240,P=34,bw=(W-P*2)/12;const mx=Math.max(1,...rows.map(r=>Math.max(r.S.fixas+r.S.variaveis,r.S.rend)));
  const sy=v=>H-24-(v/mx)*(H-44);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos por mês">`;
  for(let i=0;i<=4;i++){const v=mx*i/4,yy=sy(v);svg+=`<line x1="${P}" x2="${W-8}" y1="${yy}" y2="${yy}" stroke="currentColor" stroke-opacity=".08"/><text x="${P-6}" y="${yy+4}" font-size="10" text-anchor="end" fill="currentColor" fill-opacity=".5">${Math.round(v)}</text>`}
  rows.forEach((r,i)=>{const x=P+i*bw+bw*.18,w=bw*.64;const yf=sy(r.S.fixas),yv=sy(r.S.fixas+r.S.variaveis);
    svg+=`<rect x="${x}" y="${yf}" width="${w}" height="${H-24-yf}" rx="3" fill="var(--accent)"><title>${MESES[r.m-1]} · fixas ${eur(r.S.fixas)}</title></rect>`;
    svg+=`<rect x="${x}" y="${yv}" width="${w}" height="${yf-yv}" rx="3" fill="var(--accent)" fill-opacity=".45"><title>${MESES[r.m-1]} · variáveis ${eur(r.S.variaveis)}</title></rect>`;
    if(r.S.rend)svg+=`<line x1="${x-3}" x2="${x+w+3}" y1="${sy(r.S.rend)}" y2="${sy(r.S.rend)}" stroke="var(--green)" stroke-width="2.5"><title>Rendimento ${eur(r.S.rend)}</title></line>`;
    svg+=`<text x="${x+w/2}" y="${H-8}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity="${r.k===cur?1:.6}" font-weight="${r.k===cur?700:400}">${MES3[r.m-1]}</text>`});
  svg+="</svg>";
  const cls=v=>v<0?"neg":"";
  return `<h1>Controlo anual</h1><div class="sub">Visão do ano; clica num mês para ver o detalhe.</div>
  <div class="toolbar"><button class="iconbtn" data-act="yprev">‹</button><select id="selAnoA">${ys.map(a=>`<option ${a===y?"selected":""}>${a}</option>`).join("")}</select><button class="iconbtn" data-act="ynext">›</button></div>
  <div class="cards">
    <div class="card"><div class="lbl">Rendimento</div><div class="val">${eur(T.rend)}</div></div>
    <div class="card"><div class="lbl">Fixas</div><div class="val">${eur(T.fixas)}</div></div>
    <div class="card"><div class="lbl">Variáveis</div><div class="val">${eur(T.variaveis)}</div></div>
    <div class="card"><div class="lbl">Recebido</div><div class="val" style="color:var(--green)">+ ${eur(T.rec)}</div></div>
    <div class="card"><div class="lbl">Poupança</div><div class="val" style="color:var(--blue)">${eur(T.poup)}</div></div>
    <div class="card hero"><div class="lbl">Plafond acumulado</div><div class="val">${eur(T.plafond)}</div></div>
  </div>
  <div class="panel" style="margin-bottom:16px"><h2>Gastos por mês</h2><div class="chart">${svg}</div>
    <div class="legend"><span style="--c:var(--accent)">Fixas</span><span style="--c:color-mix(in srgb,var(--accent) 45%,transparent)">Variáveis</span><span style="--c:var(--green)">Rendimento</span></div></div>
  <div class="panel" style="margin-bottom:16px;overflow:auto"><table>
    <tr><th>Mês</th><th class="lg-cell">Rendimento</th><th>Fixas</th><th>Variáveis</th><th class="lg-cell">Recebido</th><th class="lg-cell">Poupança</th><th>Plafond</th><th class="lg-cell">Por pagar</th></tr>
    ${rows.map(r=>`<tr class="click ${r.k===cur?"cur":""}" data-gomes="${r.k}"><td><span class="lg-only">${MESES[r.m-1]}</span><span class="sm-only">${MES3[r.m-1]}</span></td>${r.has?`<td class="lg-cell">${eur(r.S.rend)}</td><td>${eur(r.S.fixas)}</td><td>${eur(r.S.variaveis)}</td><td class="pos lg-cell">${r.S.rec?"+ "+eur(r.S.rec):"–"}</td><td class="lg-cell">${eur(r.S.poup)}</td><td class="${cls(r.S.plafond)}"><b>${eur(r.S.plafond)}</b></td><td class="lg-cell">${r.S.pend?eur(r.S.pend):"–"}</td>`:`<td colspan="7" class="muted" style="text-align:center">sem dados</td>`}</tr>`).join("")}
    <tr class="total"><td>Total</td><td class="lg-cell">${eur(T.rend)}</td><td>${eur(T.fixas)}</td><td>${eur(T.variaveis)}</td><td class="lg-cell">+ ${eur(T.rec)}</td><td class="lg-cell">${eur(T.poup)}</td><td class="${cls(T.plafond)}">${eur(T.plafond)}</td><td class="lg-cell">${eur(T.pend)}</td></tr>
  </table></div>
  <div class="grid2">
    <div class="panel" style="overflow:auto"><h2>Por categoria</h2><table>
      <tr><th>Categoria</th><th>Gasto</th><th>Média/mês</th><th class="lg-cell">Orçamento</th><th class="lg-cell" style="width:30%">Peso</th></tr>
      ${catArr.map(([n,v])=>{const md=v.g/nMeses,o=orc(n);return `<tr><td>${esc(n)}${v.r?` <span class="muted">(+${eur(v.r)})</span>`:""}</td><td>${eur(v.g)}</td><td class="${o&&md>o?"neg":""}">${eur(md)}</td><td class="lg-cell">${o?eur(o):"–"}</td><td class="lg-cell"><div class="catbar"><i style="width:${gT?(v.g/gT*100).toFixed(1):0}%"></i></div></td></tr>`}).join("")||`<tr><td colspan="5" class="muted">Sem dados</td></tr>`}
    </table></div>
    <div class="panel" style="overflow:auto"><h2>Poupança por destino</h2><table>
      <tr><th>Destino</th><th>No ano</th><th>Acumulado</th></tr>
      ${DB.config.destinos.map(d=>{const a=DB.poupancas.filter(p=>p.destino===d&&perParts(p.per)[0]===y).reduce((s,p)=>s+(+p.valor||0),0);
        const c=DB.poupancas.filter(p=>p.destino===d&&perParts(p.per)[0]<=y).reduce((s,p)=>s+(+p.valor||0),0);return (a||c)?`<tr><td>${esc(d)}</td><td>${eur(a)}</td><td>${eur(c)}</td></tr>`:""}).join("")}
    </table></div>
  </div>`}

/* ---------- Movimentos ---------- */
function vMovimentos(){
  const f=UI.filtro;const ys=yearsAvail();
  let arr=sortedMovs().reverse().filter(m=>{const p=periodOf(m);const [y,mm]=p?perParts(p):[null,null];
    if(f.ano&&y!==+f.ano)return false;if(f.mes&&mm!==+f.mes)return false;if(f.tipo&&m.tipo!==f.tipo)return false;if(f.cat&&m.cat!==f.cat)return false;
    if(f.q&&!(m.desc||"").toLowerCase().includes(f.q.toLowerCase()))return false;return true});
  const tg=arr.reduce((s,m)=>s+gasto(m),0),tr=arr.reduce((s,m)=>s+recebido(m),0);
  return `<h1>Movimentos</h1><div class="sub">Todos os registos. Valor negativo = dinheiro recebido.</div>
  <div class="toolbar">
    <input type="search" id="fq" placeholder="Pesquisar…" value="${esc(f.q)}" style="min-width:200px">
    <select id="fano"><option value="">Todos os anos</option>${ys.map(a=>`<option ${+f.ano===a?"selected":""}>${a}</option>`).join("")}</select>
    <select id="fmes"><option value="">Todos os meses</option>${MESES.map((n,i)=>`<option value="${i+1}" ${+f.mes===i+1?"selected":""}>${n}</option>`).join("")}</select>
    <select id="ftipo"><option value="">Fixas e variáveis</option><option ${f.tipo==="Fixa"?"selected":""}>Fixa</option><option ${f.tipo==="Variável"?"selected":""}>Variável</option></select>
    <select id="fcat"><option value="">Todas as categorias</option>${DB.config.categorias.map(c=>`<option ${f.cat===c.nome?"selected":""}>${esc(c.nome)}</option>`).join("")}</select>
    <span class="muted filter-sum">${arr.length} registos · gasto ${eur(tg)} · recebido ${eur(tr)}</span>
  </div>
  <div class="panel sm-block"><div class="list">${arr.slice(0,300).map(x=>{const p=periodOf(x);const [yy,mm]=p?perParts(p):[0,0];return rowHTML(x,`${x.data?fmtD(x.data):"sem data"} · ${p?MES3[mm-1]+" "+yy:"—"}`)}).join("")||`<div class="empty">Nada encontrado.</div>`}</div></div>
  <div class="panel lg-block" style="overflow:auto"><table>
    <tr><th>Data</th><th style="text-align:left">Descrição</th><th style="text-align:left">Categoria</th><th style="text-align:left">Tipo</th><th style="text-align:left">Mês</th><th>Situação</th><th>Valor</th></tr>
    ${arr.slice(0,600).map(m=>{const p=periodOf(m);const [y,mm]=p?perParts(p):[0,0];return `<tr class="click" data-edit="${m.id}"><td>${m.data?fmtD(m.data):"—"}</td><td style="text-align:left">${esc(m.desc)}</td><td style="text-align:left">${esc(m.cat||"")}</td><td style="text-align:left">${m.tipo}</td><td style="text-align:left">${p?MES3[mm-1]+" "+y:"—"}</td><td>${chip(m)}</td><td class="${m.valor<0?"pos":""}"><b>${m.valor==null?"—":m.valor<0?"+ "+eur(-m.valor):eur(m.valor)}</b></td></tr>`}).join("")}
  </table>${arr.length>600?`<div class="empty">A mostrar 600 de ${arr.length}. Usa os filtros.</div>`:""}${!arr.length?`<div class="empty">Nada encontrado.</div>`:""}</div>`}

/* ---------- Plano ---------- */
function vPlano(){
  const y=UI.ano;const ys=yearsAvail();
  return `<h1>Plano</h1><div class="sub">Rendimento e poupança de cada mês de ${y}.</div>
  <div class="toolbar"><button class="iconbtn" data-act="yprev">‹</button><select id="selAnoA">${ys.map(a=>`<option ${a===y?"selected":""}>${a}</option>`).join("")}</select><button class="iconbtn" data-act="ynext">›</button>
    <button class="btn small" data-act="copysal">Repetir salário de janeiro</button></div>
  <div class="panel inline-table" style="overflow:auto;margin-bottom:16px"><h2>Rendimentos</h2><table>
    <tr><th>Mês</th><th>Salário</th><th>Outros</th><th class="lg-cell">Cartão refeição</th><th class="lg-cell" style="text-align:left">Notas</th></tr>
    ${MESES.map((n,i)=>{const k=perKey(y,i+1);const p=planOf(k)||{};return `<tr><td>${n}</td>
      <td><input type="number" inputmode="decimal" step="0.01" data-plan="${k}" data-f="salario" value="${p.salario??""}"></td>
      <td><input type="number" inputmode="decimal" step="0.01" data-plan="${k}" data-f="outros" value="${p.outros||""}"></td>
      <td class="lg-cell"><input type="number" step="0.01" data-plan="${k}" data-f="cartao" value="${p.cartao||""}"></td>
      <td class="lg-cell" style="text-align:left"><input class="wide" type="text" data-plan="${k}" data-f="notas" value="${esc(p.notas||"")}"></td></tr>`}).join("")}
  </table></div>
  <div class="panel inline-table" style="overflow:auto"><h2>Poupança do ano <span class="tot">${eur(DB.poupancas.filter(p=>perParts(p.per)[0]===y).reduce((s,p)=>s+(+p.valor||0),0))}</span></h2><table>
    <tr><th>Mês</th><th style="text-align:left">Destino</th><th>Valor</th><th></th></tr>
    ${DB.poupancas.filter(p=>perParts(p.per)[0]===y).sort((a,b)=>a.per.localeCompare(b.per)).map(p=>`<tr><td>${MESES[perParts(p.per)[1]-1]}</td><td style="text-align:left">${esc(p.destino)}</td><td>${eur(p.valor)}</td><td><button class="btn small danger" data-delpoup="${p.id}">Remover</button></td></tr>`).join("")||`<tr><td colspan="4" class="muted">Sem poupanças neste ano.</td></tr>`}
  </table>
  <div class="foot" style="flex-wrap:wrap;align-items:center">
    <select id="npMes">${MESES.map((n,i)=>`<option value="${i+1}">${n}</option>`).join("")}</select>
    <select id="npDest">${DB.config.destinos.map(d=>`<option>${esc(d)}</option>`).join("")}</select>
    <input type="number" step="0.01" id="npVal" placeholder="Valor" style="width:110px">
    <button class="btn small primary" data-act="addpoup">+ Adicionar poupança</button></div></div>`}

/* ---------- Definições ---------- */
function vDefinicoes(){
  const fs=SYNC?`<div><span class="dot" style="background:var(--green)"></span>Sincronizado com o repositório privado <b>${esc(SYNC.repo)}</b>, encriptado com a tua palavra-passe.</div>
      <div class="toolbar" style="margin:0"><button class="btn small" data-act="syncnow">Sincronizar agora</button><button class="btn small" data-act="syncsetup">Rever configuração</button></div>`
    :`<div>Os dados estão só neste dispositivo. Configura a sincronização para teres os mesmos dados no telemóvel e no PC.</div>
      <div class="toolbar" style="margin:0"><button class="btn small primary" data-act="syncsetup">Configurar sincronização</button></div>`;
  return `<h1>Definições</h1><div class="sub">Dados, regras e listas.</div><div class="settings">
  <div class="panel"><h2>🔒 Os teus dados</h2><div class="body">${fs}
    <div class="toolbar" style="margin:0"><button class="btn small" data-act="exportcsv">Exportar para Excel (CSV)</button><button class="btn small" data-act="exportjson">Exportar cópia de segurança</button><button class="btn small" data-act="importjson">Importar cópia…</button></div>
    <div class="muted" style="font-size:12px">Os dados são encriptados neste dispositivo antes de saírem. No GitHub só fica um ficheiro ilegível sem a tua palavra-passe. A cópia de segurança exportada não é encriptada: guarda-a em local seguro.</div></div></div>
  <div class="panel"><h2>📅 Mês e ordenado</h2><div class="body">
    <div class="field" style="max-width:260px"><label>Dia do ordenado</label><input type="number" min="1" max="31" id="cfgDia" value="${DB.config.diaOrdenado}"></div>
    <div class="muted" style="font-size:12px">Se calhar ao fim de semana ou feriado, conta o dia útil seguinte. O mês vai desse dia até à véspera do ordenado seguinte.</div>
    <div class="field"><label>Feriados (um por linha, AAAA-MM-DD)</label><textarea id="cfgFer" rows="5">${DB.config.feriados.join("\n")}</textarea></div>
    <div><button class="btn small primary" data-act="savecfg">Guardar</button></div></div></div>
  <div class="panel inline-table"><h2>🏷️ Categorias e orçamento mensal</h2><table>
    <tr><th>Categoria</th><th>Orçamento/mês</th><th></th></tr>
    ${DB.config.categorias.map((c,i)=>`<tr><td>${esc(c.nome)}</td><td><input type="number" step="0.01" data-orc="${i}" value="${c.orcamento??""}" placeholder="–"></td><td><button class="btn small danger" data-delcat="${i}">Remover</button></td></tr>`).join("")}
  </table><div class="foot"><input type="text" id="newCat" placeholder="Nova categoria"><button class="btn small" data-act="addcat">+ Adicionar</button></div></div>
  <div class="panel"><h2>🐷 Destinos de poupança</h2><div class="body">
    <div>${DB.config.destinos.map((d,i)=>`<span class="chip paus" style="margin:0 6px 6px 0;display:inline-block">${esc(d)} <a href="#" data-deldest="${i}" style="color:inherit">✕</a></span>`).join("")}</div>
    <div class="toolbar" style="margin:0"><input type="text" id="newDest" placeholder="Novo destino"><button class="btn small" data-act="adddest">+ Adicionar</button></div></div></div>
  <div class="panel"><h2>🚪 Este dispositivo</h2><div class="body"><div class="muted">Termina a sessão: apaga deste dispositivo os dados, o token e a chave. Os dados sincronizados continuam no repositório.</div><div><button class="btn small danger" data-act="wipe">Terminar sessão neste dispositivo</button></div></div></div>
  </div>`}

/* ================= Modal de movimento ================= */
let editing=null;
function openEditor(mv,preset={}){
  const isNew=!mv;
  editing=mv?{...mv}:{id:uid(),data:iso(today0()),desc:"",valor:null,cat:"",tipo:"Variável",pausado:false,ajuste:null,nota:"",...preset};
  if(isNew&&UI.view==="mensal"&&UI.per!==curPeriod()&&!preset.data){const [s]=periodRange(UI.per);editing.data=iso(s)}
  const rec=editing.valor!=null&&editing.valor<0;
  const descs=[...new Set(DB.movimentos.map(m=>m.desc))].sort();
  const ys=yearsAvail();
  $("#modal").innerHTML=`<header>${isNew?"Novo movimento":"Editar movimento"}<button class="iconbtn x" data-act="close">✕</button></header>
  <form class="body" id="mvForm" autocomplete="off">
    <div class="seg full kind" id="kind"><button type="button" data-k="g" class="${rec?"":"on"}">− Gasto</button><button type="button" data-k="r" class="${rec?"on":""}">+ Recebido</button></div>
    <label class="amount"><input type="number" inputmode="decimal" step="0.01" min="0" id="fVal" value="${editing.valor==null?"":Math.abs(editing.valor)}" placeholder="0,00" aria-label="Valor"><span>€</span></label>
    <div class="field"><label>Descrição</label><input type="text" id="fDesc" placeholder="Ex.: Supermercado, Gasolina…" enterkeyhint="done" list="descList" value="${esc(editing.desc)}" required><datalist id="descList">${descs.map(d=>`<option value="${esc(d)}">`).join("")}</datalist></div>
    <div class="two"><div class="field"><label>Data</label><input type="date" id="fData" value="${editing.data||""}"></div>
      <div class="field"><label>Tipo</label><div class="seg full" id="tipoSeg"><button type="button" data-t="Fixa">Fixa</button><button type="button" data-t="Variável">Variável</button></div><input type="hidden" id="fTipo" value="${editing.tipo==="Fixa"?"Fixa":"Variável"}"></div></div>
    <div class="field"><label>Categoria</label><div class="catchips" id="catChips">${DB.config.categorias.map(c=>`<button type="button" data-c="${esc(c.nome)}">${catIcon(c.nome)} ${esc(c.nome)}</button>`).join("")}</div><input type="hidden" id="fCat" value="${esc(editing.cat||"")}"></div>
    <label class="toggle"><input type="checkbox" id="fPaus" ${editing.pausado?"checked":""}> Pausado (não conta nos gastos)</label>
    <details ${editing.ajuste||editing.nota?"open":""}><summary>Mais opções</summary><div style="display:grid;gap:12px;margin-top:10px">
      <div class="field"><label>Contar noutro mês (opcional)</label><div class="two"><select id="fAjM"><option value="">Automático (pela data)</option>${MESES.map((n,i)=>`<option value="${i+1}" ${editing.ajuste&&perParts(editing.ajuste)[1]===i+1?"selected":""}>${n}</option>`).join("")}</select>
        <select id="fAjY">${ys.map(a=>`<option ${editing.ajuste?(perParts(editing.ajuste)[0]===a?"selected":""):(a===(UI.per?perParts(UI.per)[0]:new Date().getFullYear())?"selected":"")}>${a}</option>`).join("")}</select></div></div>
      <div class="field"><label>Notas</label><input type="text" id="fNota" value="${esc(editing.nota||"")}"></div></div></details>
    <div class="muted" id="fInfo" style="font-size:12px"></div>
  </form>
  <div class="actions">${isNew?"":`<button class="btn danger left" data-act="del">Apagar</button><button class="btn left" data-act="dup">Duplicar</button>`}
    <button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="savemv">Guardar</button></div>`;
  $("#modalBg").classList.add("open");
  const info=()=>{const d=$("#fData").value;const am=$("#fAjM").value;let k=null;
    if(am)k=perKey(+$("#fAjY").value,+am);else if(d)k=periodOfDate(parseISO(d));
    $("#fInfo").textContent=k?`Conta para ${MESES[perParts(k)[1]-1]} de ${perParts(k)[0]}.`:"Sem data: escolhe o mês em “Mais opções”."};
  ["fData","fAjM","fAjY"].forEach(id=>$("#"+id).addEventListener("change",info));info();
  const sync=()=>{$("#tipoSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===$("#fTipo").value));
    $("#catChips").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.c===$("#fCat").value))};sync();
  $("#tipoSeg").addEventListener("click",e=>{const b=e.target.closest("button");if(b){$("#fTipo").value=b.dataset.t;sync()}});
  $("#catChips").addEventListener("click",e=>{const b=e.target.closest("button");if(b){$("#fCat").value=$("#fCat").value===b.dataset.c?"":b.dataset.c;sync()}});
  $("#fDesc").addEventListener("change",()=>{const last=sortedMovs().reverse().find(m=>m.desc===$("#fDesc").value);
    if(last&&isNew){$("#fCat").value=last.cat||"";$("#fTipo").value=last.tipo;sync();if(!$("#fVal").value&&last.valor!=null)$("#fVal").value=Math.abs(last.valor)}});
  $("#kind").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;$("#kind").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b))});
  $("#mvForm").addEventListener("submit",e=>{e.preventDefault();saveEditor()});
  setTimeout(()=>(isNew?$("#fVal"):$("#fDesc")).focus(),30)}
function closeModal(){$("#modalBg").classList.remove("open");editing=null}
function saveEditor(){
  const desc=$("#fDesc").value.trim();if(!desc){$("#fDesc").focus();toast("Falta a descrição");return}
  const vs=$("#fVal").value;let v=vs===""?null:Math.abs(parseFloat(vs));
  if(v!=null&&$("#kind .on").dataset.k==="r")v=-v;
  const am=$("#fAjM").value;
  const m={...editing,desc,valor:v==null?null:Math.round(v*100)/100,data:$("#fData").value||null,tipo:$("#fTipo").value,cat:$("#fCat").value,
    pausado:$("#fPaus").checked,ajuste:am?perKey(+$("#fAjY").value,+am):null,nota:$("#fNota").value.trim()};
  if(!m.data&&!m.ajuste){toast("Indica a data ou o mês");return}
  // se o mês automático for igual ao ajuste, limpa o ajuste
  if(m.ajuste&&m.data&&periodOfDate(parseISO(m.data))===m.ajuste)m.ajuste=null;
  const i=DB.movimentos.findIndex(x=>x.id===m.id);if(i>=0)DB.movimentos[i]=m;else DB.movimentos.push(m);
  closeModal();changed();toast("Guardado ✔")}

/* ================= Ações ================= */
function copyFixas(){
  const k=UI.per,prev=addMonths(k,-1);const src=movsOf(prev).filter(m=>m.tipo==="Fixa");
  const existing=new Set(movsOf(k).filter(m=>m.tipo==="Fixa").map(m=>m.desc));let n=0;
  for(const m of src){if(existing.has(m.desc))continue;
    let data=null;if(m.data){const d=parseISO(m.data);const nd=new Date(d.getFullYear(),d.getMonth()+1,1);nd.setDate(Math.min(d.getDate(),new Date(nd.getFullYear(),nd.getMonth()+1,0).getDate()));data=iso(nd)}
    DB.movimentos.push({...m,id:uid(),data,ajuste:m.ajuste?addMonths(m.ajuste,1):null});n++}
  if(n){changed();toast(`${n} despesas fixas copiadas`)}else toast("Não há fixas novas para copiar")}
function bindView(){
  const on=(sel,ev,fn)=>{const e=$(sel);if(e)e.addEventListener(ev,fn)};
  on("#selAno","change",e=>{UI.per=perKey(+e.target.value,perParts(UI.per)[1]);render()});
  on("#segMes","click",e=>{const b=e.target.closest("button");if(b){UI.per=perKey(perParts(UI.per)[0],+b.dataset.m);render()}});
  {const sm=$("#segMes .on");if(sm&&sm.scrollIntoView&&window.innerWidth<700)sm.parentElement.scrollLeft=sm.offsetLeft-sm.parentElement.clientWidth/2+sm.clientWidth/2}
  on("#selAnoA","change",e=>{UI.ano=+e.target.value;render()});
  const ff=(id,key)=>on(id,id==="#fq"?"input":"change",e=>{UI.filtro[key]=e.target.value;const pos=e.target.selectionStart;render();if(id==="#fq"){const q=$("#fq");q.focus();q.setSelectionRange(pos,pos)}});
  ff("#fq","q");ff("#fano","ano");ff("#fmes","mes");ff("#ftipo","tipo");ff("#fcat","cat");
  document.querySelectorAll("[data-plan]").forEach(inp=>inp.addEventListener("change",e=>{
    const k=e.target.dataset.plan,f=e.target.dataset.f;let p=planOf(k);if(!p){p={per:k,salario:0,outros:0,cartao:0,notas:""};DB.plano.push(p)}
    p[f]=f==="notas"?e.target.value:(e.target.value===""?0:+e.target.value);changed()}));
  document.querySelectorAll("[data-orc]").forEach(inp=>inp.addEventListener("change",e=>{DB.config.categorias[+e.target.dataset.orc].orcamento=e.target.value===""?null:+e.target.value;changed()}));
}
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-act],[data-edit],[data-gomes],[data-delpoup],[data-delcat],[data-deldest],nav.side button");if(!t)return;
  if(t.matches("nav.side button")){setView(t.dataset.view);return}
  if(t.dataset.edit){openEditor(DB.movimentos.find(m=>m.id===t.dataset.edit));return}
  if(t.dataset.gomes){UI.per=t.dataset.gomes;setView("mensal");return}
  if(t.dataset.delpoup){DB.poupancas=DB.poupancas.filter(p=>p.id!==t.dataset.delpoup);changed();return}
  if(t.dataset.delcat){const c=DB.config.categorias[+t.dataset.delcat];if(DB.movimentos.some(m=>m.cat===c.nome)){toast("Há movimentos com esta categoria");return}DB.config.categorias.splice(+t.dataset.delcat,1);changed();return}
  if(t.dataset.deldest){e.preventDefault();const d=DB.config.destinos[+t.dataset.deldest];if(DB.poupancas.some(p=>p.destino===d)){toast("Há poupanças com este destino");return}DB.config.destinos.splice(+t.dataset.deldest,1);changed();return}
  const a=t.dataset.act;
  switch(a){
    case"close":closeModal();break;
    case"savemv":saveEditor();break;
    case"del":if(t.dataset.confirm){DB.movimentos=DB.movimentos.filter(m=>m.id!==editing.id);closeModal();changed();toast("Apagado")}else{t.dataset.confirm="1";t.textContent="Confirmar apagar"}break;
    case"dup":{const c={...editing,id:uid()};closeModal();openEditor(null,{...c,id:uid()});break}
    case"prev":UI.per=addMonths(UI.per,-1);render();break;
    case"next":UI.per=addMonths(UI.per,1);render();break;
    case"hoje":UI.per=curPeriod();render();break;
    case"yprev":UI.ano--;render();break;
    case"ynext":UI.ano++;render();break;
    case"goplano":UI.ano=perParts(UI.per)[0];setView("plano");break;
    case"addfixa":openEditor(null,{tipo:"Fixa"});break;
    case"addvar":openEditor(null,{tipo:"Variável"});break;
    case"addrec":openEditor(null,{tipo:"Variável",valor:-0.0001});setTimeout(()=>{$("#fVal").value=""},0);break;
    case"copyfix":copyFixas();break;
    case"copysal":{const j=planOf(perKey(UI.ano,1));if(!j||!j.salario){toast("Define primeiro o salário de janeiro");break}
      for(let m=2;m<=12;m++){const k=perKey(UI.ano,m);let p=planOf(k);if(!p){DB.plano.push({per:k,salario:j.salario,outros:0,cartao:j.cartao||0,notas:""})}else if(!p.salario)p.salario=j.salario}changed();break}
    case"addpoup":{const v=parseFloat($("#npVal").value);if(!v){toast("Indica o valor");break}
      DB.poupancas.push({id:uid(),per:perKey(UI.ano,+$("#npMes").value),destino:$("#npDest").value,valor:Math.round(v*100)/100});changed();break}
    case"syncsetup":openSyncSetup();break;
    case"syncnow":await syncNow();break;
    case"syncgo":await doSyncSetup(t);break;
    case"exportcsv":exportCSV();break;
    case"exportjson":exportJSON();break;
    case"importjson":$("#importInput").click();break;
    case"savecfg":{const d=parseInt($("#cfgDia").value,10);if(!(d>=1&&d<=31)){toast("Dia inválido");break}
      const fer=$("#cfgFer").value.split(/\s+/).filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
      DB.config.diaOrdenado=d;DB.config.feriados=fer;refreshFer();changed();toast("Definições guardadas");break}
    case"addcat":{const n=$("#newCat").value.trim();if(n&&!DB.config.categorias.some(c=>c.nome===n)){DB.config.categorias.push({nome:n,orcamento:null});changed()}break}
    case"adddest":{const n=$("#newDest").value.trim();if(n&&!DB.config.destinos.includes(n)){DB.config.destinos.push(n);changed()}break}
    case"wipe":if(t.dataset.confirm){await logoutDevice()}else{t.dataset.confirm="1";t.textContent="Clica outra vez para confirmar"}break;
  }
});
$("#fab").addEventListener("click",()=>openEditor(null));
$("#modalBg").addEventListener("mousedown",e=>{if(e.target.id==="modalBg")closeModal()});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&editing)closeModal();
  if(e.key==="Enter"&&editing&&editing.id&&(e.ctrlKey||e.metaKey))saveEditor();
  if(!editing&&(e.key==="n"||e.key==="N")&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();openEditor(null)}});
$("#importInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(!validData(d))throw 0;const imp=normalize(d);
    // junta a cópia aos dados atuais (não apaga nada); itens importados ficam como alterados agora
    const now=Date.now();[...imp.movimentos,...imp.poupancas,...imp.plano].forEach(x=>x.u=now);imp.config.u=now;
    DB=mergeDB(DB,imp);SNAP=snapOf(DB);refreshFer();DB.alterado=new Date().toISOString();lsSet();scheduleSync(200);render();toast(`Cópia importada ✔ (${imp.movimentos.length} movimentos)`)}catch(_){toast("Ficheiro inválido")}e.target.value=""});
window.addEventListener("beforeunload",e=>{if(pending&&SYNC&&KEY&&navigator.onLine){e.preventDefault();e.returnValue=""}});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&SYNC&&KEY)syncNow();else if(pending&&SYNC&&KEY)syncNow()});
window.addEventListener("online",()=>{if(SYNC&&KEY)syncNow()});
$("#syncMini").addEventListener("click",()=>{if(SYNC&&KEY)syncNow();else openSyncSetup()});
// deslizar para mudar de mês (telemóvel)
(()=>{let x0=null,y0=null;const el=$("#main");
  el.addEventListener("touchstart",e=>{if(UI.view!=="mensal"||e.touches.length!==1){x0=null;return}x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
  el.addEventListener("touchend",e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;
    if(Math.abs(dx)>70&&Math.abs(dy)<45){UI.per=addMonths(UI.per,dx<0?1:-1);render();toast(MESES[perParts(UI.per)[1]-1]+" "+perParts(UI.per)[0])}},{passive:true})})();
setInterval(()=>{if(document.visibilityState==="visible"&&SYNC&&KEY&&!syncing)syncNow()},120000);

/* ================= Configuração da sincronização ================= */
function openSyncSetup(){
  const repo=SYNC?.repo||CFG.dataRepo||"";
  $("#modal").innerHTML=`<header>Sincronização ☁️🔒<button class="iconbtn x" data-act="close">✕</button></header>
  <form class="body" id="syncForm" autocomplete="off">
    <div class="muted" style="font-size:13px">Os dados ficam num <b>repositório privado</b> do teu GitHub, <b>encriptados</b> com uma palavra-passe que só tu sabes. Faz isto uma vez em cada dispositivo (PC e telemóvel).</div>
    <div class="field"><label>Repositório de dados (privado)</label><input type="text" id="sRepo" value="${esc(repo)}" placeholder="utilizador/ciclo-dados"></div>
    <div class="field"><label>Token do GitHub (só para esse repositório)</label><input type="password" id="sTok" value="${esc(SYNC?.token||"")}" placeholder="github_pat_…" autocomplete="off"></div>
    <div class="field"><label>Palavra-passe de encriptação</label><input type="password" id="sPass" autocomplete="new-password"></div>
    <div class="field" id="sPass2Wrap" style="display:none"><label>Repete a palavra-passe (primeira vez)</label><input type="password" id="sPass2" autocomplete="new-password"></div>
    <div class="muted" id="sInfo" style="font-size:12px">⚠️ Se perderes a palavra-passe, os dados sincronizados não podem ser recuperados (por isso, exporta cópias de vez em quando).</div>
  </form>
  <div class="actions"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="syncgo">Ligar</button></div>`;
  $("#modalBg").classList.add("open");editing={sync:true};
  $("#syncForm").addEventListener("submit",e=>{e.preventDefault();doSyncSetup($("[data-act=syncgo]"))});
  setTimeout(()=>($("#sTok").value?$("#sPass"):$("#sTok")).focus(),30)}
async function doSyncSetup(btn){
  const repo=$("#sRepo").value.trim(),tok=$("#sTok").value.trim(),p=$("#sPass").value,p2=$("#sPass2").value;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)){toast("Repositório no formato utilizador/nome");return}
  if(!tok){toast("Falta o token");return}if(!p){toast("Falta a palavra-passe");return}
  btn.textContent="A verificar…";btn.style.pointerEvents="none";
  const pr=await probeRepo(repo,tok);
  if(pr.error){$("#sInfo").textContent="❌ "+pr.error;btn.textContent="Ligar";btn.style.pointerEvents="";return}
  if(!pr.exists&&$("#sPass2Wrap").style.display==="none"){
    $("#sPass2Wrap").style.display="";$("#sInfo").innerHTML=`Ainda não há dados no repositório. Vão ser criados com os dados atuais deste dispositivo (<b>${DB.movimentos.length} movimentos</b>). Se queres trazer os dados da app local, cancela, importa primeiro a cópia em Definições e volta aqui. Repete a palavra-passe para confirmar.`;
    btn.textContent="Criar e ligar";btn.style.pointerEvents="";$("#sPass2").focus();return}
  const err=await connectSync(repo,tok,p,p2);
  btn.style.pointerEvents="";
  if(err){$("#sInfo").textContent="❌ "+err;btn.textContent=pr.exists?"Ligar":"Criar e ligar";return}
  closeModal();render();toast("Sincronização ativa ✔")}

/* ================= Arranque ================= */
(async function init(){
  DB=lsGet();DB=validData(DB)?normalize(DB):emptyDB();SNAP=snapOf(DB);lsSet();refreshFer();
  SYNC=syncGet();if(SYNC){const k=await kvGet("key");if(k&&k.key){KEY=k;syncState="idle"}else syncState="locked"}
  UI.per=curPeriod();UI.ano=perParts(UI.per)[0];
  try{const v=localStorage.getItem(LS_KEY+".view");if(v)UI.view=v}catch(_){}
  render();
  if(SYNC&&KEY)syncNow();
  if("serviceWorker" in navigator&&location.protocol==="https:"){
    const had=!!navigator.serviceWorker.controller;let reloaded=false;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had&&!reloaded&&!editing){reloaded=true;location.reload()}});
    navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{})}
})();
