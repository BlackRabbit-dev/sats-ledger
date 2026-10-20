'use strict';
// ---------- 저장소 / 마이그레이션 ----------
const KEY='sats-ledger-v2',OLD='sats-ledger-v1';
let _u=0;const uid=()=>Date.now()*1000+(_u++%1000);
const DEF_ACCOUNTS=[{id:'a1',name:'지갑',group:'핫월렛',init:0},{id:'a2',name:'거래소',group:'거래소',init:0},{id:'a3',name:'콜드월렛',group:'콜드월렛',init:0}];
const DEF_CATS={expense:[{name:'식비',subs:['외식','장보기','카페']},{name:'교통',subs:[]},{name:'쇼핑',subs:[]},{name:'주거/통신',subs:[]},{name:'수수료',subs:['온체인','라이트닝','거래소']},{name:'선물',subs:[]},{name:'기타',subs:[]}],
 income:[{name:'월급',subs:[]},{name:'적립(스택)',subs:['DCA']},{name:'선물',subs:[]},{name:'용돈',subs:[]},{name:'기타',subs:[]}]};
function ensureCat(s,t,name,sub){if(t==='transfer'||!name)return;let c=s.categories[t].find(c=>c.name===name);if(!c){c={name,subs:[]};s.categories[t].push(c)}if(sub&&!c.subs.includes(sub))c.subs.push(sub)}
function fresh(){return{version:2,accounts:structuredClone(DEF_ACCOUNTS),categories:structuredClone(DEF_CATS),budgets:{},entries:[]}}
function load(){let s=null;try{s=JSON.parse(localStorage.getItem(KEY))}catch(e){}
 if(s&&s.version===2)return s;
 s=fresh();let old=[];try{old=JSON.parse(localStorage.getItem(OLD)||'[]')}catch(e){}
 // v1 → v2: 기존 기록은 모두 '지갑' 자산으로, 원본 v1 키는 백업으로 그대로 둠
 if(Array.isArray(old))for(const e of old){if(!e||!e.date)continue;const t=e.type==='income'?'income':'expense';const c=e.category||'기타';
  s.entries.push({id:+e.id||uid(),date:e.date,type:t,amount:Math.max(0,parseInt(e.amount,10)||0),account:'a1',to:'',category:c,sub:'',memo:e.memo||''});ensureCat(s,t,c)}
 if(old.length)s.migratedFrom=OLD;localStorage.setItem(KEY,JSON.stringify(s));return s}
let S=load();const save=()=>localStorage.setItem(KEY,JSON.stringify(S));

// ---------- 유틸 ----------
const $=id=>document.getElementById(id);const pad=n=>String(n).padStart(2,'0');
const fmt=n=>Math.round(n).toLocaleString('ko-KR');const sats=n=>`${fmt(n)} sats`;
let price={krw:null,usd:null};const krw=s=>price.krw?`≈ ₩${fmt(s/1e8*price.krw)}`:'≈ ₩—';
const short=n=>n>=1e8?(n/1e8).toFixed(2)+'₿':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e4?Math.round(n/1e3)+'k':fmt(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dstr=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;const today=()=>dstr(new Date());
const addM=(m,k)=>{let[y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+k,1);return`${d.getFullYear()}-${pad(d.getMonth()+1)}`};
const mLabel=m=>`${m.slice(0,4)}년 ${+m.slice(5)}월`;
const acc=id=>S.accounts.find(a=>a.id===id);const accName=id=>acc(id)?.name||'(없는 자산)';
const sumT=(L,t)=>L.reduce((a,e)=>a+(e.type===t?e.amount:0),0);
const inM=m=>S.entries.filter(e=>e.date.startsWith(m));
const sorted=L=>[...L].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
function accBal(id){const a=acc(id);let b=+(a&&a.init)||0;for(const e of S.entries){
 if(e.type==='income'&&e.account===id)b+=e.amount;else if(e.type==='expense'&&e.account===id)b-=e.amount;
 else if(e.type==='transfer'){if(e.account===id)b-=e.amount;if(e.to===id)b+=e.amount}}return b}
const total=()=>S.accounts.reduce((a,x)=>a+accBal(x.id),0);
function download(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove()}

// ---------- 상태 ----------
let tab='book',view='daily',cur=today().slice(0,7),listSel=cur,selDay=today(),statType='expense',catType='expense',query='';
const setCur=m=>{cur=m;listSel=m;render()};

// ---------- 렌더 ----------
function item(e){const tr=e.type==='transfer';
 const title=tr?`⇄ 이체 · ${esc(accName(e.account))} → ${esc(accName(e.to))}`:`${esc(e.category)}${e.sub?' · '+esc(e.sub):''}`;
 const cls=tr?'trf':e.type==='income'?'inc':'exp',sign=tr?'':e.type==='income'?'+':'-';
 return`<div class="item" data-id="${e.id}"><div class="l" onclick="edit(${e.id})"><b>${title}</b> <span class="m">${e.date}${tr?'':' · '+esc(accName(e.account))}</span><div class="m">${esc(e.memo)}</div></div><div class="amt"><div class="${cls}">${sign}${sats(e.amount)}</div><div class="m">${krw(e.amount)}</div><button class="ghost" onclick="edit(${e.id})">수정</button> <button class="ghost" onclick="del(${e.id})">삭제</button></div></div>`}
const tbl=(head,rows)=>`<table><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${rows.join('')}</table>`;
const ieRow=(lbl,L,attr='')=>{const i=sumT(L,'income'),x=sumT(L,'expense');return`<tr ${attr}><td>${lbl}</td><td class="inc">${sats(i)}</td><td class="exp">${sats(x)}</td><td>${sats(i-x)}</td></tr>`};

function rBook(){const L=inM(cur),bal=total();
 $('balSats').textContent=sats(bal);$('balKrw').textContent=krw(bal);
 const i=sumT(L,'income'),x=sumT(L,'expense');$('mInc').textContent=sats(i);$('mIncK').textContent=krw(i);$('mExp').textContent=sats(x);$('mExpK').textContent=krw(x);
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===view));
 for(const v of['daily','calendar','weekly','monthly'])$('v-'+v).hidden=v!==view;
 // 일일: 목록 + 월 필터 + 검색
 const lm=$('listMonth'),ms=[...new Set([cur,...S.entries.map(e=>e.date.slice(0,7))])].sort().reverse();
 lm.innerHTML='<option value="all">전체</option>'+ms.map(m=>`<option value="${m}">${mLabel(m)}</option>`).join('');lm.value=listSel==='all'||ms.includes(listSel)?listSel:cur;
 let src=S.entries,head='';const q=query.trim().toLowerCase();
 if(q){src=src.filter(e=>[e.memo,e.category,e.sub,accName(e.account),e.to?accName(e.to):'',String(e.amount),e.date,{income:'수입',expense:'지출',transfer:'이체'}[e.type]].join(' ').toLowerCase().includes(q));head=`<p class="sub">검색 결과 ${src.length}건 (전체 기간)</p>`}
 else if(lm.value!=='all')src=src.filter(e=>e.date.startsWith(lm.value));
 let pm='';$('list').innerHTML=head+(sorted(src).map(e=>{const m=e.date.slice(0,7),h=m!==pm?(pm=m,`<h3 class="mhead">${mLabel(m)}</h3>`):'';return h+item(e)}).join('')||'<p class="sub">기록이 없습니다.</p>');
 const ds=[...new Set(L.map(e=>e.date))].sort().reverse();
 $('daily').innerHTML=ds.length?tbl(['일','수입','지출','순액'],ds.map(d=>ieRow(d.slice(5),L.filter(e=>e.date===d)))):'<p class="sub">해당 월 기록 없음</p>';
 // 달력
 const[y,mo]=cur.split('-').map(Number),first=new Date(y,mo-1,1).getDay(),days=new Date(y,mo,0).getDate(),td=today();
 let h='<div class="cal">'+[...'일월화수목금토'].map((d,k)=>`<div class="dow ${k==0?'sun':k==6?'sat':''}">${d}</div>`).join('');
 for(let k=0;k<first;k++)h+='<div class="cell empty"></div>';
 for(let d=1;d<=days;d++){const s=`${cur}-${pad(d)}`,D=L.filter(e=>e.date===s),a=sumT(D,'income'),b=sumT(D,'expense'),t=sumT(D,'transfer'),w=(first+d-1)%7;
  h+=`<div class="cell ${s===td?'today':''} ${s===selDay?'sel':''}" data-day="${s}" onclick="pickDay('${s}')"><span class="dn ${w==0?'sun':w==6?'sat':''}">${d}</span>${a?`<span class="inc">+${short(a)}</span>`:''}${b?`<span class="exp">-${short(b)}</span>`:''}${t?`<span class="trf">⇄${short(t)}</span>`:''}</div>`}
 $('cal').innerHTML=h+'</div>';
 const DL=S.entries.filter(e=>e.date===selDay);
 $('dayList').innerHTML=`<div class="row"><h2>${selDay}</h2><button type="button" class="ghost" onclick="openForm(null,{date:'${selDay}'})">＋ 이 날짜에 추가</button></div>`+(sorted(DL).map(item).join('')||'<p class="sub">이 날짜의 기록이 없습니다.</p>');
 // 주간
 const st=new Date(y,mo-1,1-first),rows=[];
 for(let s=new Date(st);s<=new Date(y,mo-1,days);s.setDate(s.getDate()+7)){const e2=new Date(s);e2.setDate(e2.getDate()+6);const a=dstr(s),b=dstr(e2);
  rows.push(ieRow(`${+a.slice(5,7)}/${+a.slice(8)} ~ ${+b.slice(5,7)}/${+b.slice(8)}`,S.entries.filter(e=>e.date>=a&&e.date<=b)))}
 $('weekly').innerHTML=tbl(['주','수입','지출','순액'],rows);
 // 월별 (연간)
 $('yearTitle').textContent=`${y}년 월별`;const yr=[];for(let k=1;k<=12;k++){const m=`${y}-${pad(k)}`;yr.push(ieRow(`${k}월`,inM(m),`class="click${m===cur?' sel':''}" onclick="setCur('${m}');setView('daily')"`))}
 yr.push(ieRow('합계',inM(String(y)),'class="tot"'));$('monthly').innerHTML=tbl(['월','수입','지출','순액'],yr)}

const COLORS=['#f7931a','#3ecf8e','#6aa9ff','#ff6b6b','#c58cff','#ffd166','#4dd0e1','#ff9ecf','#a0a4ad','#8bc34a'];
function rStats(){document.querySelectorAll('[data-st]').forEach(b=>b.classList.toggle('on',b.dataset.st===statType));
 const by={};inM(cur).filter(e=>e.type===statType).forEach(e=>by[e.category]=(by[e.category]||0)+e.amount);
 const arr=Object.entries(by).sort((a,b)=>b[1]-a[1]),tot=arr.reduce((a,x)=>a+x[1],0);let acc0=0,svg='<circle cx="21" cy="21" r="15.915" fill="none" stroke="#262a33" stroke-width="6"/>';
 arr.forEach(([c,v],k)=>{const p=v/tot*100;svg+=`<circle cx="21" cy="21" r="15.915" fill="none" stroke="${COLORS[k%COLORS.length]}" stroke-width="6" stroke-dasharray="${p} ${100-p}" stroke-dashoffset="${25-acc0}"><title>${esc(c)}</title></circle>`;acc0+=p});
 svg+=`<text x="21" y="20">${statType==='expense'?'지출':'수입'}</text><text x="21" y="24.5">${short(tot)} sats</text>`;$('donut').innerHTML=svg;
 $('cats-break').innerHTML=arr.map(([c,v],k)=>`<div class="legend"><span><i class="dot" style="background:${COLORS[k%COLORS.length]}"></i>${esc(c)} <b>${(v/tot*100).toFixed(1)}%</b></span><span>${sats(v)}<br><span class="sub">${krw(v)}</span></span></div>`).join('')||`<p class="sub">${mLabel(cur)} ${statType==='expense'?'지출':'수입'} 기록 없음</p>`;
 const spent={};inM(cur).filter(e=>e.type==='expense').forEach(e=>spent[e.category]=(spent[e.category]||0)+e.amount);
 const B=Object.entries(S.budgets).filter(([,v])=>v>0);let tb=0,ts=0;
 const rowsB=B.map(([c,b])=>{const s=spent[c]||0;tb+=b;ts+=s;const p=s/b*100;return`<div><div class="row"><span>${esc(c)}</span><span class="sub">${sats(s)} / ${sats(b)} (${p.toFixed(0)}%)${s>b?` · <span class="exp">${sats(s-b)} 초과</span>`:` · 남음 ${sats(b-s)}`}</span></div><div class="prog ${p>100?'over':p>=80?'warn':''}"><div style="width:${Math.min(100,p)}%"></div></div></div>`});
 $('budgetProg').innerHTML=B.length?`<div class="row"><b>전체 예산</b><span>${sats(ts)} / ${sats(tb)} <span class="sub">${krw(tb-ts)} 남음</span></span></div><div class="prog ${ts>tb?'over':ts>=tb*.8?'warn':''}"><div style="width:${Math.min(100,ts/tb*100)}%"></div></div>`+rowsB.join(''):'<p class="sub">설정된 예산이 없습니다. 설정 탭에서 카테고리별 월 예산을 입력하세요.</p>'}

function rAssets(){const groups=[...new Set(S.accounts.map(a=>a.group))];const tot=total();
 $('assets').innerHTML=`<div class="acc"><b>합계</b><span><b>${sats(tot)}</b><br><span class="sub">${krw(tot)}</span></span></div>`+groups.map(g=>`<div class="grp">${esc(g)}</div>`+S.accounts.filter(a=>a.group===g).map(a=>{const b=accBal(a.id);
  return`<div class="acc" data-acc="${a.id}"><span>${esc(a.name)}<br><span class="sub">초기 ${sats(a.init||0)}</span></span><span class="amt"><b>${sats(b)}</b><br><span class="sub">${krw(b)}</span><br><button class="ghost" onclick="renAcc('${a.id}')">수정</button> <button class="ghost" onclick="delAcc('${a.id}')">삭제</button></span></div>`}).join('')).join('')}

function rSettings(){document.querySelectorAll('[data-ct]').forEach(b=>b.classList.toggle('on',b.dataset.ct===catType));
 $('catMgr').innerHTML=S.categories[catType].map((c,k)=>`<div class="cat"><div class="row"><b>${esc(c.name)}</b><span><button class="ghost" onclick="catAct('ren',${k})">이름 변경</button> <button class="ghost" onclick="catAct('sub',${k})">＋하위</button> <button class="ghost" onclick="catAct('del',${k})">삭제</button></span></div>${c.subs.length?`<div class="chips">${c.subs.map((s,j)=>`<span class="chip">${esc(s)}<button title="삭제" onclick="catAct('delsub',${k},${j})">×</button></span>`).join('')}</div>`:''}</div>`).join('');
 $('budgetEdit').innerHTML=S.categories.expense.map(c=>`<div class="acc"><span>${esc(c.name)}</span><input type="number" min="0" step="1" style="width:160px" data-budget="${esc(c.name)}" value="${S.budgets[c.name]||''}" placeholder="sats"></div>`).join('')}

function render(full=true){$('month').value=cur;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
 for(const t of['book','stats','assets','settings'])$('tab-'+t).hidden=t!==tab;
 $('monthbar').hidden=!(tab==='book'||tab==='stats');
 rBook();rStats();rAssets();if(full)rSettings()}

// ---------- 입력 폼 ----------
function fillAcc(sel,v){sel.innerHTML=S.accounts.map(a=>`<option value="${a.id}">${esc(a.name)} (${esc(a.group)})</option>`).join('');if(v&&acc(v))sel.value=v}
function fillCat(t,c,s){const cats=S.categories[t]||[];$('category').innerHTML=cats.map(x=>`<option>${esc(x.name)}</option>`).join('');if(c&&!cats.some(x=>x.name===c))$('category').insertAdjacentHTML('beforeend',`<option>${esc(c)}</option>`);if(c)$('category').value=c;fillSub(s)}
function fillSub(s){const c=(S.categories[$('type').value]||[]).find(x=>x.name===$('category').value),subs=c?c.subs:[];$('sub').innerHTML='<option value="">(없음)</option>'+subs.map(x=>`<option>${esc(x)}</option>`).join('');if(s&&!subs.includes(s))$('sub').insertAdjacentHTML('beforeend',`<option>${esc(s)}</option>`);$('sub').value=s||'';$('subL').hidden=$('type').value==='transfer'||!$('sub').options.length||$('sub').options.length<2}
function setType(t,c,s){$('type').value=t;document.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));const tr=t==='transfer';
 $('toL').hidden=!tr;$('catL').hidden=tr;$('accL').firstChild.textContent=tr?'보내는 자산':'자산';if(!tr)fillCat(t,c,s);else $('subL').hidden=true}
const defDate=()=>view==='calendar'&&selDay.startsWith(cur)?selDay:cur===today().slice(0,7)?today():`${cur}-01`;
function openForm(e,p={}){const f=e||{type:p.type||'expense',date:p.date||defDate(),amount:'',account:S.accounts[0]?.id,to:S.accounts[1]?.id||'',category:'',sub:'',memo:''};
 if(!S.accounts.length)return alert('먼저 자산을 추가하세요');
 $('editId').value=e?e.id:'';fillAcc($('account'),f.account);fillAcc($('to'),f.to);setType(f.type,f.category,f.sub);
 $('date').value=f.date;$('amount').value=f.amount;$('memo').value=f.memo||'';
 $('formTitle').textContent=e?'기록 수정':'기록 추가';$('delBtn').hidden=$('copyBtn').hidden=!e;updPreview();$('modal').showModal()}
const updPreview=()=>{const v=+$('amount').value;$('preview').textContent=v?`${sats(v)} ${krw(v)}`:''};
$('form').onsubmit=ev=>{ev.preventDefault();const t=$('type').value,amt=parseInt($('amount').value,10),tr=t==='transfer';
 if(!$('date').value)return alert('날짜를 입력하세요');if(!(amt>0))return alert('금액(sats)을 올바르게 입력하세요');
 const d={date:$('date').value,type:t,amount:amt,account:$('account').value,to:tr?$('to').value:'',category:tr?'':$('category').value,sub:tr?'':$('sub').value,memo:$('memo').value.trim()};
 if(tr&&d.account===d.to)return alert('보내는 자산과 받는 자산이 같습니다');if(!tr&&!d.category)return alert('카테고리를 선택하세요');
 const id=+$('editId').value;if(id)Object.assign(S.entries.find(e=>e.id===id),d);else S.entries.push({id:uid(),...d});
 save();$('modal').close();cur=d.date.slice(0,7);listSel=cur;selDay=d.date;render()};
document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>setType(b.dataset.t));
$('category').onchange=()=>fillSub('');$('amount').oninput=updPreview;$('cancelEdit').onclick=()=>$('modal').close();
$('delBtn').onclick=()=>{const id=+$('editId').value;if(confirm('이 기록을 삭제할까요?')){S.entries=S.entries.filter(e=>e.id!==id);save();$('modal').close();render()}};
$('copyBtn').onclick=()=>{$('editId').value='';$('date').value=today();$('formTitle').textContent='기록 추가 (복사)';$('delBtn').hidden=$('copyBtn').hidden=true};
window.edit=id=>openForm(S.entries.find(x=>x.id===id));
window.del=id=>{if(confirm('이 기록을 삭제할까요?')){S.entries=S.entries.filter(e=>e.id!==id);save();render()}};
window.pickDay=d=>{selDay=d;render(false)};window.setCur=setCur;window.setView=v=>{view=v;render(false)};window.openForm=openForm;

// ---------- 자산 ----------
$('accAdd').onclick=()=>{const n=$('accName').value.trim();if(!n)return alert('자산 이름을 입력하세요');if(S.accounts.some(a=>a.name===n))return alert('같은 이름의 자산이 있습니다');
 S.accounts.push({id:'a'+uid(),name:n,group:$('accGroup').value,init:Math.max(0,parseInt($('accInit').value,10)||0)});$('accName').value=$('accInit').value='';save();render()};
window.renAcc=id=>{const a=acc(id);const n=prompt('자산 이름',a.name);if(n===null)return;const i=prompt('초기 잔액 (sats)',a.init||0);if(i===null)return;
 if(n.trim())a.name=n.trim();a.init=Math.max(0,parseInt(i,10)||0);save();render()};
window.delAcc=id=>{const n=S.entries.filter(e=>e.account===id||e.to===id).length;if(n)return alert(`이 자산을 사용하는 기록이 ${n}건 있어 삭제할 수 없습니다.`);
 if(S.accounts.length<=1)return alert('자산은 최소 1개 필요합니다');if(confirm(`'${acc(id).name}' 자산을 삭제할까요?`)){S.accounts=S.accounts.filter(a=>a.id!==id);save();render()}};
$('trfBtn').onclick=()=>openForm(null,{type:'transfer'});

// ---------- 카테고리 / 예산 ----------
window.catAct=(act,k,j)=>{const L=S.categories[catType],c=L[k];const used=e=>e.type===catType&&e.category===c.name;
 if(act==='ren'){const n=(prompt('새 이름',c.name)||'').trim();if(!n||n===c.name)return;if(L.some(x=>x.name===n))return alert('이미 있는 이름입니다');
  S.entries.filter(used).forEach(e=>e.category=n);if(catType==='expense'&&S.budgets[c.name]!=null){S.budgets[n]=S.budgets[c.name];delete S.budgets[c.name]}c.name=n}
 else if(act==='sub'){const n=(prompt(`'${c.name}'의 하위 카테고리 이름`)||'').trim();if(!n)return;if(!c.subs.includes(n))c.subs.push(n)}
 else if(act==='delsub'){const s=c.subs[j];if(!confirm(`하위 '${s}'를 삭제할까요? (기존 기록의 하위값은 비워집니다)`))return;c.subs.splice(j,1);S.entries.filter(e=>used(e)&&e.sub===s).forEach(e=>e.sub='')}
 else if(act==='del'){const n=S.entries.filter(used).length;if(!confirm(n?`'${c.name}' 기록 ${n}건이 '미분류'로 옮겨집니다. 삭제할까요?`:`'${c.name}' 카테고리를 삭제할까요?`))return;
  L.splice(k,1);if(n){S.entries.filter(used).forEach(e=>{e.category='미분류';e.sub=''});ensureCat(S,catType,'미분류')}if(catType==='expense')delete S.budgets[c.name]}
 save();render()};
$('addCat').onclick=()=>{const n=$('newCat').value.trim();if(!n)return;if(S.categories[catType].some(x=>x.name===n))return alert('이미 있는 이름입니다');S.categories[catType].push({name:n,subs:[]});$('newCat').value='';save();render()};
$('budgetEdit').onchange=ev=>{const c=ev.target.dataset.budget;if(c==null)return;const v=parseInt(ev.target.value,10);if(v>0)S.budgets[c]=v;else delete S.budgets[c];save();render(false)};

// ---------- CSV / 백업 ----------
const TYPES={수입:'income',지출:'expense',이체:'transfer',income:'income',expense:'expense',transfer:'transfer'},TKO={income:'수입',expense:'지출',transfer:'이체'};
function exportCSV(){const q=s=>`"${String(s??'').replace(/"/g,'""')}"`;
 const rows=[['날짜','구분','금액(sats)','자산','받는자산','카테고리','하위카테고리','메모','현재가 환산(KRW)']].concat([...S.entries].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id).map(e=>[e.date,TKO[e.type],e.amount,accName(e.account),e.to?accName(e.to):'',e.category,e.sub,e.memo,price.krw?Math.round(e.amount/1e8*price.krw):'']));
 download(`sats-ledger-${today()}.csv`,'\ufeff'+rows.map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8')}
function parseCSV(t){t=t.replace(/^\ufeff/,'');const rows=[];let r=[],f='',q=false;
 for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
  else if(c==='"')q=true;else if(c===','){r.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;r.push(f);rows.push(r);r=[];f=''}else f+=c}
 if(f||r.length){r.push(f);rows.push(r)}return rows.filter(r=>r.some(x=>x.trim()))}
function importCSV(text){const rows=parseCSV(text);if(rows.length<2)return alert('가져올 데이터가 없습니다');
 const H=rows[0].map(h=>h.trim().toLowerCase()),ix=ks=>H.findIndex(h=>ks.some(k=>h.startsWith(k)));
 const I={date:ix(['날짜','date']),type:ix(['구분','type']),amount:ix(['금액','amount']),account:ix(['자산','account']),to:ix(['받는자산','to']),cat:ix(['카테고리','category']),sub:ix(['하위','sub']),memo:ix(['메모','memo'])};
 if(I.date<0||I.amount<0)return alert('CSV 형식을 알 수 없습니다 (날짜, 금액 열이 필요합니다)');
 const key=e=>[e.date,e.type,e.amount,e.account,e.to,e.category,e.sub,e.memo].join('|'),seen=new Set(S.entries.map(key));let add=0,dup=0,bad=0;
 const accId=n=>{n=(n||'').trim();if(!n)return S.accounts[0].id;let a=S.accounts.find(a=>a.name===n);if(!a){a={id:'a'+uid(),name:n,group:'기타',init:0};S.accounts.push(a)}return a.id};
 for(const r of rows.slice(1)){const g=k=>I[k]>=0?(r[I[k]]||'').trim():'';const ty=TYPES[g('type')]||'expense',amt=parseInt(g('amount').replace(/[^\d]/g,''),10),date=g('date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!(amt>0)){bad++;continue}const tr=ty==='transfer';
  const e={date,type:ty,amount:amt,account:accId(g('account')),to:tr?accId(g('to')):'',category:tr?'':(g('cat')||'기타'),sub:tr?'':g('sub'),memo:g('memo')};
  if(tr&&e.account===e.to){bad++;continue}if(seen.has(key(e))){dup++;continue}seen.add(key(e));ensureCat(S,ty,e.category,e.sub);S.entries.push({id:uid(),...e});add++}
 save();render();alert(`가져오기 완료: ${add}건 추가, ${dup}건 중복 건너뜀${bad?`, ${bad}건 형식 오류로 제외`:''}`)}
const readFile=(inp,fn)=>inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{fn(r.result);inp.value=''};r.readAsText(f,'utf-8')};
readFile($('csvIn'),importCSV);
readFile($('jsonIn'),t=>{let d;try{d=JSON.parse(t)}catch(e){return alert('JSON 파일을 읽을 수 없습니다')}
 if(!d||d.version!==2||!Array.isArray(d.entries)||!Array.isArray(d.accounts)||!d.categories)return alert('sats 가계부 백업 파일이 아닙니다');
 if(!confirm(`백업(${d.entries.length}건)으로 현재 데이터(${S.entries.length}건)를 대체할까요?`))return;S=d;S.budgets=S.budgets||{};save();render();alert('복원 완료')});
$('csv').onclick=$('csv2').onclick=exportCSV;
$('jsonOut').onclick=()=>download(`sats-ledger-backup-${today()}.json`,JSON.stringify(S,null,1),'application/json');

// ---------- 내비게이션 ----------
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();scrollTo(0,0)});
document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{tab=b.dataset.goto;render();scrollTo(0,0)});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render(false)});
document.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{statType=b.dataset.st;render(false)});
document.querySelectorAll('[data-ct]').forEach(b=>b.onclick=()=>{catType=b.dataset.ct;render()});
$('prev').onclick=()=>setCur(addM(cur,-1));$('next').onclick=()=>setCur(addM(cur,1));$('todayBtn').onclick=()=>{selDay=today();setCur(today().slice(0,7))};
$('month').onchange=()=>{if(/^\d{4}-\d{2}$/.test($('month').value))setCur($('month').value)};
$('listMonth').onchange=()=>{const v=$('listMonth').value;if(v==='all'){listSel='all';render(false)}else setCur(v)};
$('search').oninput=()=>{query=$('search').value;render(false)};
$('fab').onclick=()=>openForm(null);

// ---------- 시세 (Upbit KRW + Coinbase USD, 실패 시 CoinGecko) ----------
async function j(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error(r.status);return r.json()}
async function fetchPrice(){const src=[];let k=null,u=null;
 try{k=(await j('https://api.upbit.com/v1/ticker?markets=KRW-BTC'))[0].trade_price;src.push('Upbit')}catch(e){}
 try{u=+(await j('https://api.coinbase.com/v2/prices/BTC-USD/spot')).data.amount;src.push('Coinbase')}catch(e){}
 if(k==null||u==null){try{const g=(await j('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=krw,usd')).bitcoin;k??=g.krw;u??=g.usd;src.push('CoinGecko')}catch(e){}}
 if(k!=null)price.krw=k;if(u!=null)price.usd=u;
 $('pKrw').textContent=price.krw?`1 BTC = ₩${fmt(price.krw)}`:'시세 불러오기 실패';$('pUsd').textContent=price.usd?`$${price.usd.toLocaleString('en-US',{maximumFractionDigits:0})}`:'';
 $('pMeta').textContent=src.length?`${src.join('·')} · ${new Date().toLocaleTimeString('ko-KR')} (30초마다 갱신)`:'오프라인 – 마지막 시세 사용';render(false)}
render();fetchPrice();setInterval(fetchPrice,30000);
// ---------- PWA ----------
if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW 등록 실패',e)));
