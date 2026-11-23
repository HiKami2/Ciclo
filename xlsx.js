/* €iclo — exportação para Excel (.xlsx) com modelo formatado.
   Tudo é gerado neste dispositivo: nenhum dado sai para a Internet. */
(function(){
"use strict";

/* ---------- ZIP (sem compressão) ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function zip(files){ // files: [{name, data:string}]
  const enc=new TextEncoder(),parts=[],central=[];let off=0;
  const d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  for(const f of files){
    const nm=enc.encode(f.name),data=enc.encode(f.data),crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);
    h.setUint16(10,dt,true);h.setUint16(12,dd,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);
    h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer),nm,data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
    c.setUint16(12,dt,true);c.setUint16(14,dd,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);
    c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),nm);off+=30+nm.length+data.length}
  const cs=central.reduce((s,a)=>s+a.length,0);
  const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);
  e.setUint32(12,cs,true);e.setUint32(16,off,true);
  return new Blob([...parts,...central,new Uint8Array(e.buffer)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}

/* ---------- utilitários ---------- */
const X=s=>String(s??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const col=n=>{let s="";n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
const ref=(r,c)=>col(c)+(r+1);
const serial=iso=>{const [y,m,d]=iso.split("-").map(Number);return(Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/864e5};
const r2=v=>Math.round((+v||0)*100)/100;

/* ---------- estilos ---------- */
const C={accent:"E8642C",accentSoft:"FDEBE1",accentLine:"F3B391",ink:"1F2328",muted:"6B7280",line:"E5E7EB",soft:"F6F6F7",green:"16A34A",greenSoft:"E8F6EC",amber:"B45309",red:"DC2626",blue:"2563EB",white:"FFFFFF",cur:"FFF5EE"};
const EUR='#,##0.00\\ "€";[Red]\\-#,##0.00\\ "€";"–"';
const EURP='#,##0.00\\ "€";\\-#,##0.00\\ "€";"–"';
function Styles(){
  const fonts=[],fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'],borders=['<border><left/><right/><top/><bottom/><diagonal/></border>'],fmts=[],xfs=[],map=new Map();
  const idx=(arr,x)=>{let i=arr.indexOf(x);if(i<0){arr.push(x);i=arr.length-1}return i};
  function get(o={}){const k=JSON.stringify(o);if(map.has(k))return map.get(k);
    const f=`<font>${o.b?"<b/>":""}${o.i?"<i/>":""}<sz val="${o.sz||10}"/><color rgb="FF${o.color||C.ink}"/><name val="Arial"/><family val="2"/></font>`;
    const fi=idx(fonts,f);
    const fl=o.fill?idx(fills,`<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`):0;
    const side=(n,v)=>v?`<${n} style="${v[0]}"><color rgb="FF${v[1]}"/></${n}>`:`<${n}/>`;
    const bo=o.bt||o.bb||o.bl||o.br?idx(borders,`<border>${side("left",o.bl)}${side("right",o.br)}${side("top",o.bt)}${side("bottom",o.bb)}<diagonal/></border>`):0;
    let nf=0;if(o.fmt){let i=fmts.indexOf(o.fmt);if(i<0){fmts.push(o.fmt);i=fmts.length-1}nf=164+i}
    const al=o.h||o.v||o.wrap||o.indent?`<alignment${o.h?` horizontal="${o.h}"`:""} vertical="${o.v||"center"}"${o.wrap?' wrapText="1"':""}${o.indent?` indent="${o.indent}"`:""}/>`:'<alignment vertical="center"/>';
    xfs.push(`<xf numFmtId="${nf}" fontId="${fi}" fillId="${fl}" borderId="${bo}" xfId="0" applyNumberFormat="${nf?1:0}" applyFont="1" applyFill="${fl?1:0}" applyBorder="${bo?1:0}" applyAlignment="1">${al}</xf>`);
    map.set(k,xfs.length-1);return xfs.length-1}
  get({}); // estilo 0
  function xml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${fmts.length?`<numFmts count="${fmts.length}">${fmts.map((f,i)=>`<numFmt numFmtId="${164+i}" formatCode="${X(f)}"/>`).join("")}</numFmts>`:""}
<fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="2"><dxf><font><color rgb="FF${C.red}"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFDECEC"/></patternFill></fill></dxf><dxf><font><b/><color rgb="FF${C.accent}"/></font></dxf></dxfs>
<tableStyles count="0" defaultTableStyle="TableStyleLight1" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`}
  return{get,xml}}

/* ---------- folha ---------- */
function Sheet(name,tab){
  const rows=new Map(),me={name,tab,rows,cols:[],merges:[],heights:{},cf:[],dv:[],freeze:0,table:null,chart:null,hidden:false,
    set(r,c,v,s,extra){if(!rows.has(r))rows.set(r,new Map());rows.get(r).set(c,Object.assign({v,s},extra||{}));return me},
    f(r,c,formula,cached,s){return me.set(r,c,cached,s,{f:formula})},
    merge(r1,c1,r2,c2){me.merges.push(`${ref(r1,c1)}:${ref(r2,c2)}`);return me},
    fill(r,c1,c2,s){for(let c=c1;c<=c2;c++)if(!(rows.get(r)||new Map()).has(c))me.set(r,c,null,s);return me}};
  return me}
function sheetXML(sh,tableRid,drawRid){
  let maxR=0,maxC=0;for(const [r,cs] of sh.rows){maxR=Math.max(maxR,r);for(const c of cs.keys())maxC=Math.max(maxC,c)}
  const out=[];
  for(const r of [...sh.rows.keys()].sort((a,b)=>a-b)){const cs=sh.rows.get(r);const ht=sh.heights[r];
    out.push(`<row r="${r+1}"${ht?` ht="${ht}" customHeight="1"`:""}>`);
    for(const c of [...cs.keys()].sort((a,b)=>a-b)){const x=cs.get(c),a=`r="${ref(r,c)}"${x.s?` s="${x.s}"`:""}`;
      if(x.f!=null){const isS=typeof x.v==="string";out.push(`<c ${a}${isS?' t="str"':""}><f>${X(x.f)}</f>${x.v!=null?`<v>${isS?X(x.v):x.v}</v>`:""}</c>`)}
      else if(x.v==null||x.v==="")out.push(`<c ${a}/>`);
      else if(typeof x.v==="number")out.push(`<c ${a}><v>${x.v}</v></c>`);
      else if(typeof x.v==="boolean")out.push(`<c ${a} t="b"><v>${x.v?1:0}</v></c>`);
      else out.push(`<c ${a} t="inlineStr"><is><t xml:space="preserve">${X(x.v)}</t></is></c>`)}
    out.push("</row>")}
  const pane=sh.freeze?`<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freeze+1}" sqref="A${sh.freeze+1}"/>`:"";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF${sh.tab||C.accent}"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ref(maxR,maxC)}"/>
<sheetViews><sheetView showGridLines="0" workbookViewId="0"${sh.first?' tabSelected="1"':""} zoomScale="100">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18" customHeight="1"/>
${sh.cols.length?`<cols>${sh.cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols>`:""}
<sheetData>${out.join("")}</sheetData>
${sh.merges.length?`<mergeCells count="${sh.merges.length}">${sh.merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>`:""}
${sh.cf.join("")}
${sh.dv.length?`<dataValidations count="${sh.dv.length}">${sh.dv.join("")}</dataValidations>`:""}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
${drawRid?`<drawing r:id="${drawRid}"/>`:""}${tableRid?`<tableParts count="1"><tablePart r:id="${tableRid}"/></tableParts>`:""}
</worksheet>`}

function chartXML(sheetName,cats,series){ // gráfico de colunas empilhadas
  const q=`'${sheetName.replace(/'/g,"''")}'`;
  const ser=series.map((s,i)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${q}!${s.name}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${X(s.label)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>
<c:cat><c:strRef><c:f>${q}!${cats.ref}</c:f><c:strCache><c:ptCount val="${cats.vals.length}"/>${cats.vals.map((v,j)=>`<c:pt idx="${j}"><c:v>${X(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${q}!${s.ref}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.vals.length}"/>${s.vals.map((v,j)=>`<c:pt idx="${j}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val></c:ser>`).join("");
  const txt=(sz,clr,b)=>`<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b?1:0}"><a:solidFill><a:srgbClr val="${clr}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-PT"/></a:p></c:txPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/><c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="pt-PT" sz="1200" b="1"><a:solidFill><a:srgbClr val="${C.ink}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Para onde foi o dinheiro, mês a mês</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="stacked"/><c:varyColors val="0"/>${ser}<c:gapWidth val="55"/><c:overlap val="100"/><c:axId val="500"/><c:axId val="501"/></c:barChart>
<c:catAx><c:axId val="500"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
<c:spPr><a:ln><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:ln></c:spPr>${txt(900,C.muted)}<c:crossAx val="501"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="501"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
<c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
<c:numFmt formatCode="#,##0\\ &quot;€&quot;" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(900,C.muted)}<c:crossAx val="500"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
<c:spPr><a:noFill/></c:spPr></c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txt(900,C.ink)}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`}
function drawingXML(from,to){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${from[1]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from[0]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${to[1]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to[0]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Gráfico mensal"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`}

/* ---------- livro ---------- */
function build(y){
  const S=Styles(),st=S.get;
  const MAXR=5000; // linhas reservadas para continuares a registar no Excel
  const keys=[...Array(12)].map((_,i)=>perKey(y,i+1));
  const now=new Date(),hoje=iso(now),cur=curPeriod();
  // estilos frequentes
  const sTitle=st({b:1,sz:20,color:C.white,fill:C.accent,indent:1});
  const sTitleR=st({sz:10,color:C.white,fill:C.accent,h:"right",indent:1});
  const sBand=st({fill:C.accent});
  const sSub=st({sz:9,color:C.muted,indent:1,i:1});
  const sH=st({b:1,sz:9,color:C.ink,fill:C.accentSoft,bb:["medium",C.accent],h:"left",indent:1,wrap:1});
  const sHR=st({b:1,sz:9,color:C.ink,fill:C.accentSoft,bb:["medium",C.accent],h:"right",wrap:1});
  const sT=st({indent:1,bb:["thin",C.line]}),sTm=st({color:C.muted,sz:9,indent:1,bb:["thin",C.line]});
  const sTb=st({b:1,indent:1,bb:["thin",C.line]});
  const sE=st({fmt:EUR,bb:["thin",C.line]}),sEb=st({fmt:EUR,b:1,bb:["thin",C.line]});
  const sEg=st({fmt:EURP,color:C.green,bb:["thin",C.line]}),sEblue=st({fmt:EURP,color:C.blue,bb:["thin",C.line]});
  const sD=st({fmt:"dd/mm/yyyy",indent:1,bb:["thin",C.line],h:"left"});
  const curS=o=>st(Object.assign({fill:C.cur,bb:["thin",C.accentLine]},o));
  const sTot=st({b:1,indent:1,fill:C.soft,bt:["medium",C.ink]}),sTotE=st({b:1,fmt:EUR,fill:C.soft,bt:["medium",C.ink]});
  const sKl=st({sz:8,b:1,color:C.muted,fill:C.soft,indent:1,bt:["medium",C.accent]}),sKv=st({sz:16,b:1,fmt:EUR,fill:C.soft,indent:1,h:"left"});
  const sKvG=st({sz:16,b:1,fmt:EURP,color:C.green,fill:C.soft,indent:1,h:"left"}),sKvB=st({sz:16,b:1,fmt:EURP,color:C.blue,fill:C.soft,indent:1,h:"left"});
  const sKvP=st({sz:16,b:1,fmt:"0%",fill:C.soft,indent:1,h:"left"});
  const sNote=st({sz:8.5,color:C.muted,i:1,wrap:1,v:"top"});
  const sSec=st({b:1,sz:11,color:C.ink,bb:["thin",C.ink]});
  const sit={Pago:st({color:C.green,b:1,indent:1,bb:["thin",C.line]}),Pendente:st({color:C.amber,b:1,indent:1,bb:["thin",C.line]}),Pausado:st({color:C.muted,i:1,indent:1,bb:["thin",C.line]}),Recebido:st({color:C.green,b:1,indent:1,bb:["thin",C.line]}),"Sem valor":st({color:C.muted,indent:1,bb:["thin",C.line]})};
  const sInput=st({indent:1,bb:["thin",C.line],fill:"FFFBEA"}),sInputE=st({fmt:EUR,bb:["thin",C.line],fill:"FFFBEA"});
  function header(sh,ncols,title,sub){
    sh.set(0,0,title,sTitle);for(let c=1;c<ncols-1;c++)sh.set(0,c,null,sBand);
    sh.set(0,ncols-1,"€iclo",sTitleR);sh.merge(0,0,0,ncols-2);sh.heights[0]=40;
    sh.set(1,0,sub,sSub);sh.merge(1,0,1,ncols-1);sh.heights[1]=20}

  /* --- dados --- */
  const movs=sortedMovs().filter(m=>{const p=periodOf(m);return p&&perParts(p)[0]===y});
  const catSet=new Map();DB.config.categorias.forEach(c=>catSet.set(c.nome,c.orcamento));
  movs.forEach(m=>{const c=m.cat||"Sem categoria";if(!catSet.has(c))catSet.set(c,null)});
  const catTot={};movs.forEach(m=>{const c=m.cat||"Sem categoria";catTot[c]=(catTot[c]||0)+gasto(m)});
  const cats=[...catSet.keys()].sort((a,b)=>(catTot[b]||0)-(catTot[a]||0)||a.localeCompare(b,"pt"));
  const destinos=[...new Set([...(DB.config.destinos||[]),...DB.poupancas.map(p=>p.destino).filter(Boolean)])];

  /* === Movimentos === */
  const M=Sheet("Movimentos",C.ink);const MH=4,M0=MH+1; // cabeçalho na linha 5 (índice 4)
  M.cols=[12,10,34,20,11,13,13,12,34];
  header(M,9,`Movimentos ${y}`,`Um registo por linha. Podes acrescentar linhas no fim da tabela: o ciclo, a situação e os totais calculam-se sozinhos.`);
  const mHead=["Data","Ciclo","Descrição","Categoria","Tipo","Gasto","Recebido","Situação","Notas"];
  M.set(2,0,"Total visível",st({b:1,sz:9,color:C.muted,indent:1}));
  M.f(2,5,`SUBTOTAL(109,F${M0+1}:F${MAXR})`,r2(movs.reduce((s,m)=>s+gasto(m),0)),st({b:1,fmt:EUR}));
  M.f(2,6,`SUBTOTAL(109,G${M0+1}:G${MAXR})`,r2(movs.reduce((s,m)=>s+recebido(m),0)),st({b:1,fmt:EURP,color:C.green}));
  M.set(2,7,"← muda com os filtros",st({sz:8.5,color:C.muted,i:1}));
  mHead.forEach((h,c)=>M.set(MH,c,h,c===5||c===6?sHR:sH));M.heights[MH]=24;
  const cicloF=r=>`IF(A${r}="","",IF(A${r}>=WORKDAY(DATE(YEAR(A${r}),MONTH(A${r}),'Definições'!$C$5)-1,1,'Definições'!$B$9:$B$200),YEAR(A${r})&"-"&TEXT(MONTH(A${r}),"00"),YEAR(EDATE(A${r},-1))&"-"&TEXT(MONTH(EDATE(A${r},-1)),"00")))`;
  const sitF=r=>`IF(AND(F${r}=0,G${r}=0),"Sem valor",IF(G${r}>0,"Recebido",IF(OR(A${r}="",A${r}>TODAY()),"Pendente","Pago")))`;
  movs.forEach((m,i)=>{const r=M0+i,R=r+1,s=status(m).txt;
    if(m.data)M.set(r,0,serial(m.data),sD);else M.set(r,0,null,sD);
    if(m.ajuste||!m.data)M.set(r,1,periodOf(m),sTm);else M.f(r,1,cicloF(R),periodOf(m),sTm);
    M.set(r,2,m.desc||"",sTb);M.set(r,3,m.cat||"Sem categoria",sT);M.set(r,4,m.tipo==="Fixa"?"Fixa":"Variável",sTm);
    M.set(r,5,r2(gasto(m)),sE);M.set(r,6,r2(recebido(m)),sEg);
    if(m.pausado)M.set(r,7,"Pausado",sit.Pausado);else M.f(r,7,sitF(R),s,sit[s]||sT);
    const extra=[m.prest?`Prestação ${m.prest.n}/${m.prest.total}`:"",m.pausado&&m.valor?`Pausado (${String(m.valor).replace(".",",")} €)`:"",m.nota||""].filter(Boolean).join(" · ");
    M.set(r,8,extra,sTm)});
  // linha modelo vazia pronta a preencher
  const lastM=M0+Math.max(movs.length,1)-1;
  if(!movs.length){const R=M0+1;M.set(M0,0,null,sD);M.f(M0,1,cicloF(R),"",sTm);M.set(M0,2,null,sTb);M.set(M0,3,null,sT);M.set(M0,4,null,sTm);M.set(M0,5,0,sE);M.set(M0,6,0,sEg);M.f(M0,7,sitF(R),"Sem valor",sT);M.set(M0,8,null,sTm)}
  M.freeze=MH+1;
  M.table={ref:`A${MH+1}:I${lastM+1}`,cols:mHead,name:"Movimentos"};
  M.dv.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Categoria" error="Escolhe uma categoria da folha Categorias." sqref="D${M0+1}:D${MAXR}"><formula1>Categorias!$A$6:$A$${5+cats.length}</formula1></dataValidation>`);
  M.dv.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="E${M0+1}:E${MAXR}"><formula1>"Fixa,Variável"</formula1></dataValidation>`);
  M.dv.push(`<dataValidation type="date" operator="greaterThan" allowBlank="1" showErrorMessage="1" error="Escreve uma data, por exemplo 23/11/${y}." sqref="A${M0+1}:A${MAXR}"><formula1>1</formula1></dataValidation>`);
  M.dv.push(`<dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" error="Valores positivos. Usa a coluna Recebido para entradas." sqref="F${M0+1}:G${MAXR}"><formula1>0</formula1></dataValidation>`);
  const mr=c=>`Movimentos!$${c}$${M0+1}:$${c}$${MAXR}`;

  /* === Plano === */
  const P=Sheet("Plano",C.blue);P.cols=[14,10,15,15,15,40];
  header(P,6,`Plano ${y}`,"Rendimento previsto de cada ciclo. As células amarelas são para preencher.");
  ["Mês","Ciclo","Salário","Outros","Total","Notas"].forEach((h,c)=>P.set(4,c,h,c>=2&&c<=4?sHR:sH));P.heights[4]=24;
  keys.forEach((k,i)=>{const r=5+i,p=planOf(k)||{},isC=k===cur;
    P.set(r,0,MESES[i],isC?curS({b:1,indent:1,color:C.accent}):sTb);P.set(r,1,k,isC?curS({color:C.muted,sz:9,indent:1}):sTm);
    P.set(r,2,r2(p.salario),sInputE);P.set(r,3,r2(p.outros),sInputE);P.f(r,4,`C${r+1}+D${r+1}`,r2((+p.salario||0)+(+p.outros||0)),isC?curS({fmt:EUR,b:1}):sEb);
    P.set(r,5,p.notas||"",sInput)});
  P.set(17,0,"Total",sTot);P.set(17,1,null,sTot);["C","D","E"].forEach((L,j)=>P.f(17,2+j,`SUM(${L}6:${L}17)`,r2(keys.reduce((s,k)=>{const p=planOf(k)||{};return s+(j===0?+p.salario||0:j===1?+p.outros||0:(+p.salario||0)+(+p.outros||0))},0)),sTotE));P.set(17,5,null,sTot);
  P.freeze=5;

  /* === Poupança === */
  const PP=Sheet("Poupança",C.blue);PP.cols=[14,10,28,15,4,28,15];
  header(PP,7,`Poupança ${y}`,"O que puseste de parte em cada ciclo, por destino.");
  ["Mês","Ciclo","Destino","Valor"].forEach((h,c)=>PP.set(4,c,h,c===3?sHR:sH));PP.heights[4]=24;
  const pl=DB.poupancas.filter(p=>p.per&&perParts(p.per)[0]===y).sort((a,b)=>a.per.localeCompare(b.per));
  pl.forEach((p,i)=>{const r=5+i;PP.set(r,0,MESES[perParts(p.per)[1]-1],sT);PP.set(r,1,p.per,sTm);PP.set(r,2,p.destino||"",sTb);PP.set(r,3,r2(p.valor),sEblue)});
  if(!pl.length){PP.set(5,0,null,sInput);PP.set(5,1,null,sInput);PP.set(5,2,null,sInput);PP.set(5,3,null,sInputE)}
  const ppEnd=5+Math.max(pl.length,1)+40;
  for(let r=5+Math.max(pl.length,1);r<ppEnd;r++){PP.set(r,0,null,sInput);PP.set(r,1,null,sInput);PP.set(r,2,null,sInput);PP.set(r,3,null,sInputE)}
  PP.dv.push(`<dataValidation type="list" allowBlank="1" sqref="C6:C${ppEnd}"><formula1>$F$6:$F$${6+destinos.length+10}</formula1></dataValidation>`);
  PP.set(4,5,"Por destino",sH);PP.set(4,6,"Total",sHR);
  destinos.forEach((d,i)=>{const r=5+i;PP.set(r,5,d,sTb);PP.f(r,6,`SUMIFS($D$6:$D$${ppEnd},$C$6:$C$${ppEnd},F${r+1})`,r2(pl.filter(p=>p.destino===d).reduce((s,p)=>s+(+p.valor||0),0)),sEblue)});
  const dEnd=5+destinos.length;PP.set(dEnd,5,"Total",sTot);PP.f(dEnd,6,`SUM(D6:D${ppEnd})`,r2(pl.reduce((s,p)=>s+(+p.valor||0),0)),sTotE);
  PP.freeze=5;

  /* === Categorias === */
  const CA=Sheet("Categorias",C.green);CA.cols=[24,...Array(12).fill(10.5),13,12,12,12];
  header(CA,17,`Gastos por categoria ${y}`,"Soma automática a partir da folha Movimentos. A vermelho: média mensal acima do orçamento.");
  ["Categoria",...MES3,"Total","Média/mês","Orçamento","Diferença"].forEach((h,c)=>CA.set(4,c,h,c?sHR:sH));CA.heights[4]=24;
  const nMesesUsados=Math.max(1,keys.filter(k=>k<=cur&&(movsOf(k).length||rendOf(k))).length);
  CA.set(2,0,"Meses considerados na média",st({sz:9,color:C.muted,indent:1}));CA.set(2,3,nMesesUsados,st({b:1,fill:"FFFBEA",h:"center",bb:["thin",C.line]}));
  cats.forEach((c,i)=>{const r=5+i,R=r+1;CA.set(r,0,c,sTb);let t=0;
    keys.forEach((k,j)=>{const v=r2(movs.filter(m=>(m.cat||"Sem categoria")===c&&periodOf(m)===k).reduce((s,m)=>s+gasto(m),0));t+=v;
      CA.f(r,1+j,`SUMIFS(${mr("F")},${mr("D")},$A${R},${mr("B")},"${k}")`,v,k===cur?curS({fmt:EUR}):sE)});
    CA.f(r,13,`SUM(B${R}:M${R})`,r2(t),sEb);CA.f(r,14,`N${R}/$D$3`,r2(t/nMesesUsados),sE);
    const o=catSet.get(c);CA.set(r,15,o==null?null:r2(o),sInputE);CA.f(r,16,`IF(P${R}="","",P${R}-O${R})`,o==null?"":r2(o-t/nMesesUsados),sE)});
  const cEnd=5+cats.length;
  CA.set(cEnd,0,"Total",sTot);for(let j=1;j<=14;j++){const L=col(j);CA.f(cEnd,j,`SUM(${L}6:${L}${cEnd})`,null,sTotE)}
  CA.f(cEnd,15,`SUM(P6:P${cEnd})`,null,sTotE);CA.set(cEnd,16,null,sTot);
  // valores em cache dos totais
  for(let j=1;j<=14;j++){let s=0;for(let r=5;r<cEnd;r++){const x=CA.rows.get(r).get(j);s+=+x.v||0}CA.rows.get(cEnd).get(j).v=r2(s)}
  {let s=0;for(let r=5;r<cEnd;r++){const x=CA.rows.get(r).get(15);s+=+x.v||0}CA.rows.get(cEnd).get(15).v=r2(s)}
  CA.cf.push(`<conditionalFormatting sqref="O6:O${cEnd}"><cfRule type="expression" dxfId="0" priority="1"><formula>AND($P6&lt;&gt;"",$O6&gt;$P6)</formula></cfRule></conditionalFormatting>`);
  CA.cf.push(`<conditionalFormatting sqref="N6:N${cEnd}"><cfRule type="dataBar" priority="2"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FFF3B391"/></dataBar></cfRule></conditionalFormatting>`);
  CA.freeze=5;

  /* === Resumo === */
  const R=Sheet("Resumo",C.accent);R.first=true;
  R.cols=[13,10,15,14,13,13,13,14,14,14,14,13];
  header(R,12,`Relatório ${y}`,`Exportado a ${fmtD(hoje)} · cada mês começa no dia do ordenado (${DB.config.diaOrdenado}, ou dia útil seguinte) e acaba na véspera do seguinte.`);
  const HR=8,R0=9; // cabeçalho da tabela na linha 9
  const rh=["Mês","Ciclo","Período","Rendimento","Recebido","Transitado","Poupança","Despesas fixas","Variáveis","Plafond","Pago","Por pagar"];
  rh.forEach((h,c)=>R.set(HR,c,h,c>=3?sHR:sH));R.heights[HR]=30;
  const SS=keys.map(k=>sums(k));
  keys.forEach((k,i)=>{const r=R0+i,Rr=r+1,isC=k===cur,S0=SS[i],[s,e]=periodRange(k);
    const E=isC?curS({fmt:EUR}):sE,Eg=isC?curS({fmt:EURP,color:C.green}):sEg,Eb=isC?curS({fmt:EURP,color:C.blue}):sEblue;
    R.set(r,0,MESES[i],isC?curS({b:1,indent:1,color:C.accent}):sTb);R.set(r,1,k,isC?curS({color:C.muted,sz:9,indent:1}):sTm);
    R.set(r,2,`${fmtDshort(s)} – ${fmtDshort(e)}`,isC?curS({color:C.muted,sz:9,indent:1}):sTm);
    R.f(r,3,`SUMIFS(Plano!$E$6:$E$17,Plano!$B$6:$B$17,$B${Rr})`,r2(S0.rend),E);
    R.f(r,4,`SUMIFS(${mr("G")},${mr("B")},$B${Rr})`,r2(S0.rec),Eg);
    R.set(r,5,r2(S0.trans),Eg);
    R.f(r,6,`SUMIFS(Poupança!$D$6:$D$${ppEnd},Poupança!$B$6:$B$${ppEnd},$B${Rr})`,r2(S0.poup),Eb);
    R.f(r,7,`SUMIFS(${mr("F")},${mr("B")},$B${Rr},${mr("E")},"Fixa")`,r2(S0.fixas),E);
    R.f(r,8,`SUMIFS(${mr("F")},${mr("B")},$B${Rr})-H${Rr}`,r2(S0.variaveis),E);
    R.f(r,9,`D${Rr}+E${Rr}+F${Rr}-G${Rr}-H${Rr}-I${Rr}`,r2(S0.plafond),isC?curS({fmt:EUR,b:1}):sEb);
    R.f(r,10,`SUMIFS(${mr("F")},${mr("B")},$B${Rr},${mr("H")},"Pago")`,r2(S0.pago),E);
    R.f(r,11,`SUMIFS(${mr("F")},${mr("B")},$B${Rr},${mr("H")},"Pendente")`,r2(S0.pend),isC?curS({fmt:EURP,color:C.amber}):st({fmt:EURP,color:C.amber,bb:["thin",C.line]}))});
  const RT=R0+12;R.set(RT,0,"Total do ano",sTot);R.set(RT,1,null,sTot);R.set(RT,2,null,sTot);
  const sumK=f=>r2(SS.reduce((s,x)=>s+(x[f]||0),0));
  const tf=["rend","rec","trans","poup","fixas","variaveis",null,"pago","pend"];
  for(let c=3;c<=11;c++){const L=col(c);const f=tf[c-3];R.f(RT,c,c===9?`D${RT+1}+E${RT+1}-G${RT+1}-H${RT+1}-I${RT+1}`:`SUM(${L}${R0+1}:${L}${R0+12})`,c===9?r2(sumK("rend")+sumK("rec")-sumK("poup")-sumK("fixas")-sumK("variaveis")):sumK(f),sTotE)}
  R.set(RT+1,0,"Plafond do ano = rendimento + recebido − poupança − despesas (sem contar os saldos transitados, para não contar o mesmo dinheiro duas vezes). Transitado = sobra do plafond do mês anterior, calculada pela app.",sNote);R.merge(RT+1,0,RT+2,11);R.heights[RT+1]=16;
  // cartões-resumo (linhas 4-6)
  const T=RT+1;
  const kp=[["RENDIMENTO DO ANO",`D${T}+E${T}`,r2(sumK("rend")+sumK("rec")),sKv],["GASTO DO ANO",`H${T}+I${T}`,r2(sumK("fixas")+sumK("variaveis")),sKv],["POUPADO",`G${T}`,sumK("poup"),sKvB],["TAXA DE POUPANÇA",`IFERROR(G${T}/(D${T}+E${T}),0)`,(sumK("rend")+sumK("rec"))?sumK("poup")/(sumK("rend")+sumK("rec")):0,sKvP],["AINDA POR PAGAR",`L${T}`,sumK("pend"),st({sz:16,b:1,fmt:EURP,color:C.amber,fill:C.soft,indent:1,h:"left"})],["SOBRA NO ANO",`J${T}`,r2(sumK("rend")+sumK("rec")-sumK("poup")-sumK("fixas")-sumK("variaveis")),sKvG]];
  kp.forEach(([l,f,v,s],i)=>{const c=i*2;R.set(3,c,l,sKl);R.set(3,c+1,null,sKl);R.merge(3,c,3,c+1);
    R.f(4,c,f,v,s);R.set(4,c+1,null,s);R.merge(4,c,5,c+1);R.fill(5,c,c+1,s)});
  R.heights[3]=18;R.heights[4]=22;R.heights[5]=14;
  R.set(7,0,"Mês a mês",sSec);R.fill(7,1,11,sSec);R.heights[7]=22;
  // gráfico por baixo
  const G0=RT+4;R.set(G0-1,0,"Gráfico",sSec);R.fill(G0-1,1,11,sSec);
  R.chart={from:[G0,0],to:[G0+18,12],xml:chartXML("Resumo",{ref:`$A$${R0+1}:$A$${R0+12}`,vals:MESES},[
    {label:"Despesas fixas",name:"$H$"+(HR+1),ref:`$H$${R0+1}:$H$${R0+12}`,vals:SS.map(x=>r2(x.fixas)),color:"E8642C"},
    {label:"Variáveis",name:"$I$"+(HR+1),ref:`$I$${R0+1}:$I$${R0+12}`,vals:SS.map(x=>r2(x.variaveis)),color:"F3B391"},
    {label:"Poupança",name:"$G$"+(HR+1),ref:`$G$${R0+1}:$G$${R0+12}`,vals:SS.map(x=>r2(x.poup)),color:"2563EB"}])};
  R.freeze=0;

  /* === Definições === */
  const D=Sheet("Definições",C.muted);D.cols=[3,22,16,40];
  header(D,4,"Definições","Usadas nas fórmulas do ciclo. Se mudares o dia do ordenado ou os feriados, a coluna Ciclo atualiza-se.");
  D.set(4,1,"Dia do ordenado",sTb);D.set(4,2,DB.config.diaOrdenado,st({b:1,fill:"FFFBEA",h:"center",bb:["thin",C.line]}));D.set(4,3,"Se calhar ao fim de semana ou feriado, passa para o dia útil seguinte.",sNote);
  D.set(7,1,"Feriados",sH);D.set(7,2,"Dia da semana",sH);
  (DB.config.feriados||[]).slice().sort().forEach((f,i)=>{D.set(8+i,1,serial(f),sD);D.set(8+i,2,["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"][parseISO(f).getDay()],sTm)});

  return {sheets:[R,M,CA,P,PP,D],styles:S.xml()}}

function pack(book){
  const files=[],ct=[],wbRels=[],sheetsXml=[];let tN=0,dN=0;
  book.sheets.forEach((sh,i)=>{const n=i+1,rels=[];let tRid=null,dRid=null;
    if(sh.table){tN++;tRid="rId1";rels.push(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tN}.xml"/>`);
      files.push({name:`xl/tables/table${tN}.xml`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tN}" name="${sh.table.name}" displayName="${sh.table.name}" ref="${sh.table.ref}" totalsRowShown="0"><autoFilter ref="${sh.table.ref}"/>
<tableColumns count="${sh.table.cols.length}">${sh.table.cols.map((c,j)=>`<tableColumn id="${j+1}" name="${X(c)}"/>`).join("")}</tableColumns>
<tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="0" showColumnStripes="0"/></table>`});
      ct.push(`<Override PartName="/xl/tables/table${tN}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`)}
    if(sh.chart){dN++;dRid="rId"+(rels.length+1);rels.push(`<Relationship Id="${dRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${dN}.xml"/>`);
      files.push({name:`xl/drawings/drawing${dN}.xml`,data:drawingXML(sh.chart.from,sh.chart.to)});
      files.push({name:`xl/drawings/_rels/drawing${dN}.xml.rels`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${dN}.xml"/></Relationships>`});
      files.push({name:`xl/charts/chart${dN}.xml`,data:sh.chart.xml});
      ct.push(`<Override PartName="/xl/drawings/drawing${dN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart${dN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`)}
    files.push({name:`xl/worksheets/sheet${n}.xml`,data:sheetXML(sh,tRid,dRid)});
    if(rels.length)files.push({name:`xl/worksheets/_rels/sheet${n}.xml.rels`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`});
    ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    wbRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
    sheetsXml.push(`<sheet name="${X(sh.name)}" sheetId="${n}" r:id="rId${n}"/>`)});
  const k=book.sheets.length;
  wbRels.push(`<Relationship Id="rId${k+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  files.unshift(
    {name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${ct.join("")}</Types>`},
    {name:"_rels/.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
    {name:"docProps/core.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>€iclo — relatório</dc:title><dc:creator>€iclo</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0,19)}Z</dcterms:created></cp:coreProperties>`},
    {name:"docProps/app.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>€iclo</Application></Properties>`},
    {name:"xl/workbook.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetsXml.join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`},
    {name:"xl/_rels/workbook.xml.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join("")}</Relationships>`},
    {name:"xl/styles.xml",data:book.styles});
  return zip(files)}

function exportXLSX(y){
  const blob=pack(build(y));const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`eciclo-${y}.xlsx`;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800);toast(`Excel de ${y} exportado`)}

function openExport(){
  const ys=yearsAvail(),y0=UI.view==="anual"&&UI.ano?UI.ano:perParts(UI.per||curPeriod())[0];
  $("#modal").innerHTML=`<header>Exportar para Excel<button class="iconbtn x" data-act="close">✕</button></header>
  <div class="body"><div class="muted" style="font-size:13.5px">Um livro formatado e pronto a usar, com fórmulas ligadas entre si: podes continuar a registar no Excel e os totais atualizam-se.</div>
  <div class="xlsheets"><div><b>Resumo</b><span>cartões, mês a mês e gráfico</span></div><div><b>Movimentos</b><span>tabela com filtros e listas</span></div><div><b>Categorias</b><span>gasto por mês e orçamento</span></div><div><b>Plano</b><span>rendimento por ciclo</span></div><div><b>Poupança</b><span>por destino</span></div><div><b>Definições</b><span>dia do ordenado e feriados</span></div></div>
  <label>Ano</label><div class="seg full" id="xlAno">${ys.map(a=>`<button data-y="${a}" class="${a===y0?"on":""}">${a}</button>`).join("")}</div></div>
  <div class="actions"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="doxlsx">Exportar ${y0}</button></div>`;
  $("#modalBg").classList.add("open");
  $("#xlAno").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;$("#xlAno").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));$("[data-act=doxlsx]").textContent="Exportar "+b.dataset.y})}

document.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b)return;
  if(b.dataset.act==="exportxlsx"){e.stopImmediatePropagation();openExport()}
  else if(b.dataset.act==="doxlsx"){e.stopImmediatePropagation();const on=$("#xlAno .on");const y=on?+on.dataset.y:new Date().getFullYear();closeModal();
    try{exportXLSX(y)}catch(err){console.error(err);toast("Não foi possível criar o Excel")}}},true);

window.__eciclo_xlsx={build,pack,exportXLSX};
})();
