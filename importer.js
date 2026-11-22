/* €iclo — importar extratos bancários (CSV). Tudo é processado no dispositivo; nada é enviado. */
"use strict";
(function(){
const N=s=>String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toUpperCase();
const pt=s=>{s=String(s||"").trim().replace(/\s/g,"");if(!s)return null;if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");const v=parseFloat(s);return isNaN(v)?null:v};
const dmy=s=>{const m=String(s||"").trim().match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:null};
const title=s=>s.toLowerCase().replace(/(^|[\s\-\/.])(\p{L})/gu,(a,b,c)=>b+c.toUpperCase()).replace(/\s+/g," ").trim();

/* regras: [expressão, categoria, tipo, nome bonito (opcional), opções] */
const RULES=[
  [/INETUM|ORDENADO|VENCIMENTO|SALARIO/,"Entradas","Variável",null,{salario:true}],
  [/^TRF (CXDOL|CXDAPP|CAIXADIRECTA)|^TFI SECUNDARIA|^TRF \d{8,}|^TRF CAIXADIRECTA/,"Transferências","Variável",null,{interna:true}],
  [/COM TRF MBWAY|TRF IMEDIATA|BX VALOR|IMPOSTO|COMISSAO|MANUTENCAO CONTA/,"Banco e taxas","Variável",null],
  [/MANUTENCAO CONTA/,"Banco e taxas","Fixa","Manutenção da conta"],
  [/SANT CONSUMER/,"Carro","Fixa","Mensalidade Carro (Santander Consumer)"],
  [/VITORIA SEGUROS|ALLIANZ|FIDELIDADE|TRANQUILIDADE|SEGUR/,"Carro","Variável","Seguro"],
  [/VIA VERDE/,"Carro","Variável","Via Verde"],
  [/^IUC/,"Carro","Variável","IUC"],
  [/GALP|PRIO|REPSOL|BP |CEPSA|BOMBAS|COMBUST/,"Combustível","Variável",null],
  [/APPLE\.C|APPLE\.COM/,"Subscrições","Fixa","Apple"],
  [/AMAZON PRIME/,"Subscrições","Fixa","Amazon Prime"],
  [/NETFLIX|SPOTIFY|HBO|DISNEY|CRUNCHY|YOUTUBE|MEO |NOS COMUNIC|VODAFONE|CLAUDE|ANTHROPIC|OPENAI/,"Subscrições","Fixa",null],
  [/PAYPAL/,"Subscrições","Variável","PayPal"],
  [/MS FIT|E FIT|GINASIO|FITNESS|SOLINCA|HOLMES/,"Saúde e desporto","Fixa","Ginásio"],
  [/FARMACI/,"Saúde e desporto","Variável","Farmácia"],
  [/BETCLIC|PLACARD|BETANO|SOLVERDE|ESC ONLINE/,"Apostas","Variável","Betclic"],
  [/KLARNA|SVEA|PRESTACAO|COFIDIS|ONEY/,"Compras","Variável",null],
  [/CONTINE|LIDL|PINGO|PA BRAG|MINIPRECO|INTERMARCHE|ALDI|MERCADONA|SUPERME|SUPERBR|A SUPER|AUCHAN|JUMBO/,"Supermercado","Variável",null],
  [/MCDONAL|BK\d|\bBK\b|BURGER|MAISON|PANS|POW CHI|SENHORA|CHAMAGA|BAMBI|BECK|FAROL|PRACA 1|ALMA LU|PACO 10|KFC|PIZZA|SUSHI|TAKE AW|TELEPIZZA|GLOVO|UBER ?EATS|BOLT FOOD|RESTAUR|TASCA|CERVEJ|BAR |CAFE|COFFEE|PASTEL|PADARIA|PAO |XING LO|KUSUMA|DELICIA|MERIDIA|LAREIRA|BEZERRA/,"Restauração","Variável",null],
  [/VITORIA(?! SEG)|DAVID E/,"Dia a dia","Variável",null],
  [/AMAZON|WWW\.AMA|WORTEN|FNAC|ALE-HOP|PRIMARK|ZARA|PULL|NORMAL|SUITS|LOUCURA|CASA DE|BOL$|^COMPRA BOL|SHEIN|TEMU|ALIEXP|IKEA|LEROY|ESPACO/,"Compras","Variável",null],
  [/HOTEL|BOOKING|AIRBNB|RYANAIR|EASYJET|TAP |CP |COMBOIO|FLIXBUS/,"Viagens","Variável",null],
  [/NOS CIN|CINEMA|TICKETLINE|BLUETICKET|3CKET|FESTIVAL|ALIVE|GALAXIA|STEAM|XSOLLA|PLAYSTATION|NINTENDO/,"Lazer","Variável",null],
  [/^ATM|LEVANTAMENTO|DISP CARTAO/,"Dia a dia","Variável","Levantamento"],
  [/^TRF MBWAY|^COMPRA MBWAY/,"Família e amigos","Variável","MB Way"],
  [/^TFI /,"Família e amigos","Variável",null],
  [/INSTANT|FILMIN|COMUNIDAD FILM/,"Subscrições","Fixa",null],
  [/NOTE |WELLS|RELOGIO|LOJA DA/,"Compras","Variável",null],
];
function clean(desc){
  let d=String(desc||"").trim().replace(/\s+/g," ");
  d=d.replace(/^COMPRAS? C\.?DEB\.?\s*/i,"").replace(/^COMPRA\s+/i,"");
  return title(d);
}
function classify(desc,isCredit){
  const n=N(desc);
  for(const [re,cat,tipo,nome,opt] of RULES){if(re.test(n)){
    if(isCredit&&!(opt&&(opt.salario||opt.interna)))return{cat:"Entradas",tipo:"Variável",nome:null,opt:{}};
    return{cat,tipo,nome,opt:opt||{}}}}
  if(isCredit)return{cat:"Entradas",tipo:"Variável",nome:null,opt:{}};
  return{cat:"Outros",tipo:"Variável",nome:null,opt:{}};
}
/* aprende com o que já existe: mesma descrição → mesma categoria/tipo */
function learned(nome){const m=[...DB.movimentos].reverse().find(x=>N(x.desc)===N(nome));return m?{cat:m.cat,tipo:m.tipo}:null}

function decode(buf){
  let t=new TextDecoder("utf-8").decode(buf);
  if(t.includes("�"))t=new TextDecoder("windows-1252").decode(buf);
  return t.replace(/^﻿/,"");
}
function parse(text){
  const lines=text.split(/\r?\n/);
  const sep=(lines.find(l=>l.includes(";"))?";":",");
  const split=l=>{const out=[];let cur="",q=false;for(const ch of l){if(ch==='"'){q=!q;continue}if(ch===sep&&!q){out.push(cur);cur="";continue}cur+=ch}out.push(cur);return out.map(s=>s.trim())};
  let hi=lines.findIndex(l=>/DATA/.test(N(l))&&/(DESCRI|MOVIMENTO)/.test(N(l)));
  if(hi<0)throw new Error("Não encontrei o cabeçalho do extrato (colunas Data e Descrição).");
  const H=split(lines[hi]).map(N);
  const col=(...keys)=>H.findIndex(h=>keys.some(k=>h.includes(k)));
  const cDataV=col("DATA VALOR"),cDataM=col("DATA MOV","DATA LANC","DATA"),cDesc=col("DESCRI","MOVIMENTO"),cDeb=col("DEBITO"),cCred=col("CREDITO"),cMont=col("MONTANTE","IMPORTANCIA","VALOR (EUR)","VALOR");
  const rows=[];
  for(let i=hi+1;i<lines.length;i++){
    const c=split(lines[i]);const dm=dmy(c[cDataM]),dv=cDataV>=0?dmy(c[cDataV]):null;if(!dm&&!dv)continue;
    let deb=cDeb>=0?pt(c[cDeb]):null,cred=cCred>=0?pt(c[cCred]):null;
    if(deb==null&&cred==null&&cMont>=0){const v=pt(c[cMont]);if(v==null)continue;if(v<0)deb=-v;else cred=v}
    if(!deb&&!cred)continue;
    rows.push({dataMov:dm||dv,data:dv||dm,raw:c[cDesc]||"",deb:deb||0,cred:cred||0});
  }
  if(!rows.length)throw new Error("Não encontrei movimentos no ficheiro.");
  return rows;
}
function detectSalary(rows){
  const big=rows.filter(r=>r.cred>=400);const cnt={};
  for(const r of big){const k=N(r.raw).replace(/\d+/g,"").trim();cnt[k]=(cnt[k]||0)+1}
  const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];return best&&best[1]>=2?best[0]:"";
}
function build(rows){
  const salKey=detectSalary(rows);
  const items=rows.map((r,i)=>{
    const credit=r.cred>0,val=credit?-r.cred:r.deb;
    const c=classify(r.raw,credit);let nome=c.nome||clean(r.raw);
    const isSal=credit&&(c.opt.salario||(salKey&&N(r.raw).replace(/\d+/g,"").trim()===salKey));
    const L=!isSal&&learned(nome);
    const it={i,data:r.data,dataMov:r.dataMov,raw:r.raw,nome,valor:Math.round(val*100)/100,cat:L?L.cat:c.cat,tipo:L?L.tipo:c.tipo,
      interna:!!c.opt.interna,salario:!!isSal,dup:null,sel:true};
    // duplicado: mesmo valor e data próxima (±3 dias) já registado
    const d0=parseISO(it.data);
    it.dup=DB.movimentos.find(m=>m.data&&typeof m.valor==="number"&&Math.abs(m.valor-it.valor)<0.005&&Math.abs(parseISO(m.data)-d0)<=3*864e5)||null;
    if(it.interna||it.dup)it.sel=false;
    return it});
  // ordenado → Plano (salário do mês; valores mais pequenos → outros rendimentos)
  const sal=items.filter(x=>x.salario);const med=sal.map(x=>-x.valor).sort((a,b)=>a-b)[Math.floor(sal.length/2)]||0;
  const plan={};for(const s of sal){s.sel=false;const k=periodOfDate(parseISO(s.dataMov));plan[k]=plan[k]||{salario:0,outros:0,itens:[]};
    if(-s.valor>=med*0.8)plan[k].salario+=-s.valor;else plan[k].outros+=-s.valor;plan[k].itens.push(s)}
  return{items,plan,salKey};
}

let IMP=null;
async function openImport(file){
  try{const rows=parse(decode(await file.arrayBuffer()));IMP=build(rows);IMP.file=file.name;IMP.filter="todos";renderImport()}
  catch(e){toast(e.message||"Não consegui ler o ficheiro")}
}
function catOpts(sel){const cats=[...DB.config.categorias.map(c=>c.nome)];if(!cats.includes("Supermercado"))cats.splice(5,0,"Supermercado");if(!cats.includes("Transferências"))cats.push("Transferências");
  return cats.map(c=>`<option ${c===sel?"selected":""}>${esc(c)}</option>`).join("")}
function renderImport(){
  const it=IMP.items.filter(x=>!x.salario);const sel=it.filter(x=>x.sel);
  const nDup=it.filter(x=>x.dup).length,nInt=it.filter(x=>x.interna).length;
  const f=IMP.filter;const show=it.filter(x=>f==="todos"||(f==="sel"&&x.sel)||(f==="dup"&&x.dup)||(f==="int"&&x.interna)||(f==="out"&&x.cat==="Outros"));
  const pk=Object.keys(IMP.plan).sort();
  const gastos=sel.reduce((s,x)=>s+Math.max(0,x.valor),0),receb=sel.reduce((s,x)=>s+Math.max(0,-x.valor),0);
  editing={imp:true};
  $("#modal").classList.add("wide");
  $("#modal").innerHTML=`<header>Importar extrato <span class="muted" style="font-size:13px;font-weight:500;margin-left:4px">${esc(IMP.file)}</span><button class="iconbtn x" data-act="impclose">✕</button></header>
  <div class="body">
    <div class="muted" style="font-size:13px">Lido no teu dispositivo: nada foi enviado. Revê as categorias e desmarca o que não queres importar.</div>
    <div class="cards" style="margin:0">
      <div class="card"><div class="lbl">A importar</div><div class="val">${sel.length}</div><div class="hint">de ${it.length} movimentos</div></div>
      <div class="card"><div class="lbl">Gastos</div><div class="val">${eur(gastos)}</div></div>
      <div class="card"><div class="lbl">Recebido</div><div class="val" style="color:var(--green)">+ ${eur(receb)}</div></div>
      <div class="card"><div class="lbl">Já existentes</div><div class="val">${nDup}</div><div class="hint">desmarcados</div></div>
    </div>
    ${pk.length?`<div class="prestwrap"><b>💼 Ordenado detetado</b> <span class="muted" style="font-size:12.5px">vai para o Plano (só nos meses ainda sem salário)</span>
      <div class="impsal">${pk.map(k=>{const p=IMP.plan[k],cur=planOf(k),tem=cur&&cur.salario>0;return `<label class="toggle"><input type="checkbox" data-impsal="${k}" ${tem?"":"checked"}> ${fmtPer(k)}: <b>${eur(p.salario)}</b>${p.outros?` + ${eur(p.outros)} outros`:""}${tem?` <span class="muted">(já tens ${eur(cur.salario)})</span>`:""}</label>`}).join("")}</div></div>`:""}
    ${nInt?`<div class="banner" style="margin:0">↔️ ${nInt} transferências entre contas tuas (ex.: CXDOL, CXDAPP, Secundária) ficaram desmarcadas para não contarem como gasto nem receita.</div>`:""}
    <div class="seg" id="impFilter">${[["todos","Todos"],["sel","Selecionados"],["out","Sem categoria"],["dup","Já existentes"],["int","Entre contas"]].map(([k,n])=>`<button type="button" data-f="${k}" class="${f===k?"on":""}">${n}</button>`).join("")}</div>
    <div class="implist">${show.map(x=>`<div class="improw ${x.sel?"":"off"}">
      <input type="checkbox" data-impsel="${x.i}" ${x.sel?"checked":""} aria-label="Importar">
      <div class="impd"><input type="text" class="impname" data-impname="${x.i}" value="${esc(x.nome)}"><div class="m">${fmtD(x.data)} · <span title="${esc(x.raw)}">${esc(x.raw)}</span>${x.dup?` · <b style="color:var(--amber)">já existe: ${esc(x.dup.desc)}</b>`:""}</div></div>
      <select data-impcat="${x.i}">${catOpts(x.cat)}</select>
      <select data-imptipo="${x.i}" class="imptipo"><option ${x.tipo==="Fixa"?"selected":""}>Fixa</option><option ${x.tipo!=="Fixa"?"selected":""}>Variável</option></select>
      <div class="v ${x.valor<0?"in":""}">${x.valor<0?"+ "+eur(-x.valor):eur(x.valor)}</div></div>`).join("")||`<div class="empty">Nada nesta vista.</div>`}</div>
  </div>
  <div class="actions"><button class="btn left" data-act="impall">Marcar todos</button><button class="btn" data-act="impclose">Cancelar</button><button class="btn primary" data-act="impgo">Importar ${sel.length} movimentos</button></div>`;
  $("#modalBg").classList.add("open");
}
function applyImport(){
  const add=IMP.items.filter(x=>!x.salario&&x.sel);
  for(const c of new Set(add.map(x=>x.cat)))if(!DB.config.categorias.some(k=>k.nome===c))DB.config.categorias.push({nome:c,orcamento:null});
  for(const x of add)DB.movimentos.push({id:uid(),data:x.data,desc:x.nome,valor:x.valor,cat:x.cat,tipo:x.tipo,pausado:false,ajuste:null,nota:`Extrato: ${x.raw}`});
  let ns=0;document.querySelectorAll("[data-impsal]").forEach(cb=>{if(!cb.checked)return;const k=cb.dataset.impsal,p=IMP.plan[k];let e=planOf(k);
    if(!e){e={per:k,salario:0,outros:0,cartao:0,notas:""};DB.plano.push(e)}e.salario=Math.round(p.salario*100)/100;if(p.outros)e.outros=Math.round(((+e.outros||0)+p.outros)*100)/100;ns++});
  const n=add.length;IMP=null;$("#modal").classList.remove("wide");closeModal();changed();toast(`${n} movimentos importados${ns?` · ordenado de ${ns} meses`:""} ✔`);
}
document.addEventListener("change",e=>{if(!IMP)return;const t=e.target;
  if(t.dataset.impsel!=null){IMP.items[+t.dataset.impsel].sel=t.checked;renderImport()}
  else if(t.dataset.impcat!=null){const x=IMP.items[+t.dataset.impcat];x.cat=t.value;
    // aplicar a mesma categoria a movimentos com o mesmo nome
    IMP.items.forEach(y=>{if(y!==x&&y.nome===x.nome)y.cat=t.value});renderImport()}
  else if(t.dataset.imptipo!=null){const x=IMP.items[+t.dataset.imptipo];x.tipo=t.value;IMP.items.forEach(y=>{if(y!==x&&y.nome===x.nome)y.tipo=t.value});renderImport()}
  else if(t.dataset.impname!=null){IMP.items[+t.dataset.impname].nome=t.value.trim()||IMP.items[+t.dataset.impname].nome}
});
document.addEventListener("click",e=>{const b=e.target.closest("[data-act^=imp],#impFilter button");if(!b)return;
  if(b.closest("#impFilter")){if(IMP){IMP.filter=b.dataset.f;renderImport()}return}
  const a=b.dataset.act;
  if(a==="impextrato"){$("#bankInput").click()}
  else if(a==="impclose"){IMP=null;$("#modal").classList.remove("wide");closeModal()}
  else if(a==="impall"&&IMP){IMP.items.forEach(x=>{if(!x.salario&&!x.interna&&!x.dup)x.sel=true});renderImport()}
  else if(a==="impgo"&&IMP)applyImport();
},true);
$("#bankInput").addEventListener("change",async e=>{const f=e.target.files[0];e.target.value="";if(f)await openImport(f)});
window.__eciclo_import={parse,build,decode};
})();
