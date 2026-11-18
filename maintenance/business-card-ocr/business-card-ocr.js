// Business-card images stay in this browser. Only reviewed form fields enter membership data.
const KF_CARD_ASSET_ROOT="/assets/business-card-ocr";
let kfCardEnginePromise;
function loadKfCardEngine(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(kfCardEnginePromise)return kfCardEnginePromise;
  kfCardEnginePromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    const timer=setTimeout(()=>{script.remove();kfCardEnginePromise=null;reject(new Error("명함 인식 도구를 불러오지 못했습니다. 다시 시도해 주세요."))},30000);
    script.src=KF_CARD_ASSET_ROOT+"/tesseract.min.js";script.async=true;
    script.onload=()=>{clearTimeout(timer);window.Tesseract?.createWorker?resolve(window.Tesseract):(kfCardEnginePromise=null,reject(new Error("명함 인식 도구를 준비하지 못했습니다.")))};
    script.onerror=()=>{clearTimeout(timer);script.remove();kfCardEnginePromise=null;reject(new Error("명함 인식 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요."))};
    document.head.appendChild(script);
  });return kfCardEnginePromise;
}
function parseKfBusinessCard(text){
  const raw=String(text||"").normalize("NFKC").replace(/[‐‑‒–—−]/g,"-");
  const lines=raw.split(/\r?\n/).map(v=>v.replace(/[|｜]/g," ").replace(/\s+/g," ").trim()).filter(Boolean);
  const result={};
  const email=raw.match(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if(email)result.email=email[0].replace(/\s/g,"");
  const phone=raw.match(/(?<!\d)(01[016789])[ .-]*(\d{3,4})[ .-]*(\d{4})(?!\d)/);
  if(phone)result.phone=phone.slice(1).join("-");
  const website=raw.match(/(?:https?:\/\/|www\.)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:\/[^\s<>]*)?/i);
  if(website)result.website=website[0].replace(/[),.;]+$/,"");
  const company=lines.find(v=>/(?:\(\s*주\s*\)|주식회사|유한회사|\(유\))/.test(v)&&!/(주소|메일)/.test(v))||lines.find(v=>/^(?:회사명|기업명|상호)\s*[:：]/.test(v));
  if(company)result.company=company.replace(/^(?:회사명|기업명|상호)\s*[:：]\s*/,"").replace(/\(\s*주\s*\)/g,"(주)").replace(/\s+(?:대표이사|대표|CEO|회장|사장).*$/i,"").trim();
  const titles=/^(?:대표이사|대표|사무총장|사장|이사|부장|과장|팀장|회장)$/;
  const validName=value=>/^[가-힣]{2,4}$/.test(value)&&!titles.test(value)&&!/(회사|명함|주소|전화|이메일|성명)/.test(value);
  for(let index=0;index<lines.length&&!result.name;index++){
    const match=lines[index].match(/(?:^|\s)(대표이사|대표(?!이사)|사무총장|사장|이사|부장|과장|팀장)(?:\s*[:：]?\s+|$)(.*)/);
    if(!match)continue;
    const sameLine=match[2].match(/^([가-힣]{2,4})(?=\s|$)/)||match[2].match(/^([가-힣](?: [가-힣]){1,3})(?=\s|$)/);
    const candidate=(sameLine?.[1]||(!match[2]?lines[index+1]:"")||"").replace(/\s/g,"");
    if(validName(candidate)){result.title=match[1];result.name=candidate}
  }
  if(!result.name){const named=lines.find(v=>/^(?:성명|이름)\s*[:：]/.test(v));if(named){const m=named.match(/[:：]\s*([가-힣]{2,4})/);if(m)result.name=m[1]}}
  if(!result.name){const names=[...new Set(lines.map(v=>v.replace(/\s/g,"")).filter(v=>/^[김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹][가-힣]{2}$/.test(v)&&validName(v)&&!/(시|구|동|읍|면|로|길|팀|점|부)$/.test(v)&&!/(대표|사무|본사|브랜드|전문가|주식회)/.test(v)))];if(names.length===1)result.name=names[0]}
  const address=lines.find(v=>/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주).*(?:로|길|동|읍|면)\s*\d/.test(v));
  if(address)result.address=address.replace(/^(?:주소|Address|Add\.?)[ :：]*/i,"").replace(/([로길])[’'](?=\d)/g,"$1").trim();
  const brand=lines.find(v=>/^(?:브랜드|브랜드명)\s*[:：]/.test(v));
  if(brand)result.brand=brand.replace(/^[^:：]+[:：]\s*/,"").trim();
  return result;
}
function kfCardDb(action,accountId,card){
  return new Promise((resolve,reject)=>{
    if(!accountId)return reject(new Error("가입 계정을 확인할 수 없어 명함을 보관하지 못했습니다."));
    if(!window.indexedDB)return reject(new Error("이 브라우저에서는 명함 보관을 사용할 수 없습니다."));
    let done=false,db;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);db?.close();error?reject(error):resolve(value)};
    const timer=setTimeout(()=>finish(new Error("명함 보관이 지연되고 있습니다. 다시 시도해 주세요.")),15000);
    const request=indexedDB.open("kfceo-private-business-cards",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("cards",{keyPath:"accountId"});
    request.onerror=()=>finish(new Error("명함을 보관하지 못했습니다. 브라우저 저장 공간을 확인해 주세요."));
    request.onblocked=()=>finish(new Error("다른 탭을 닫은 뒤 명함 보관을 다시 시도해 주세요."));
    request.onsuccess=()=>{
      db=request.result;if(done){db.close();return}
      try{
      const tx=db.transaction("cards",action==="get"?"readonly":"readwrite"),store=tx.objectStore("cards");let value=null;
      const operation=action==="get"?store.get(String(accountId)):card===null?store.delete(String(accountId)):store.put({...card,accountId:String(accountId),savedAt:new Date().toISOString()});
      operation.onsuccess=()=>{value=action==="get"?operation.result||null:true};
      tx.oncomplete=()=>finish(null,value);
      tx.onerror=tx.onabort=()=>finish(new Error("명함을 보관하지 못했습니다. 브라우저 저장 공간을 확인해 주세요."));
      }catch(error){finish(new Error("명함을 보관하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.",{cause:error}))}
    };
  });
}
function saveKfBusinessCard(accountId,card){return card===undefined?Promise.resolve(true):kfCardDb("save",accountId,card)}
function getKfBusinessCard(accountId){return kfCardDb("get",accountId)}
async function prepareKfBusinessCard(file){
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw new Error("JPG, PNG 또는 WEBP 명함 사진을 선택해 주세요.");
  if(!file.size)throw new Error("내용이 없는 사진입니다. 다른 명함 사진을 선택해 주세요.");
  if(file.size>15*1024*1024)throw new Error("15MB 이하의 명함 사진을 선택해 주세요.");
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("사진을 읽을 수 없습니다. 다른 명함 사진을 선택해 주세요."));image.src=url});
    const ratio=Math.min(1,2600/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return {dataUrl:canvas.toDataURL("image/jpeg",.9),fileName:file.name,mimeType:"image/jpeg",ocrText:"",recognizedAt:null};
  }finally{URL.revokeObjectURL(url)}
}
function KfBusinessCardUpload({accountId,onRecognized,onCardChange,onBusyChange,disabled=false}){
  const [card,setCard]=z.useState(null),[busy,setBusy]=z.useState(false),[status,setStatus]=z.useState(""),[error,setError]=z.useState(""),[fields,setFields]=z.useState({});
  const input=z.useRef(null),work=z.useRef(null),generation=z.useRef(0),previousAccount=z.useRef(accountId),callbacks=z.useRef({onRecognized,onCardChange,onBusyChange});
  callbacks.current={onRecognized,onCardChange,onBusyChange};
  const updateBusy=value=>{setBusy(value);callbacks.current.onBusyChange?.(value)};
  const stop=()=>{generation.current++;const worker=work.current;work.current=null;if(worker)worker.terminate().catch(()=>{});updateBusy(false)};
  z.useEffect(()=>()=>{generation.current++;work.current?.terminate().catch(()=>{});callbacks.current.onBusyChange?.(false)},[]);
  z.useEffect(()=>{if(previousAccount.current&&previousAccount.current!==accountId){stop();setCard(null);setFields({});setStatus("");setError("")}previousAccount.current=accountId;if(!accountId)return;let alive=true;const token=generation.current;getKfBusinessCard(accountId).then(saved=>{if(alive&&token===generation.current&&saved){setCard(saved);setFields(parseKfBusinessCard(saved.ocrText||""))}}).catch(()=>{});return()=>{alive=false}},[accountId]);
  async function recognize(selected){
    stop();const token=generation.current;updateBusy(true);setError("");setStatus("명함 인식 도구를 준비하고 있습니다…");let timer,ownedWorker,expired=false;
    try{
      const engine=await loadKfCardEngine();if(token!==generation.current)return;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;ownedWorker?.terminate().catch(()=>{});reject(new Error("명함 인식 시간이 초과되었습니다. 글자가 선명한 사진으로 다시 시도해 주세요."))},90000)});
      const task=(async()=>{
        const worker=await engine.createWorker("kor+eng",1,{workerPath:KF_CARD_ASSET_ROOT+"/worker.min.js",corePath:KF_CARD_ASSET_ROOT+"/core",langPath:KF_CARD_ASSET_ROOT+"/lang",gzip:true,logger:progress=>{if(!expired&&token===generation.current&&progress.status==="recognizing text")setStatus("명함 글자 인식 중 "+Math.round((progress.progress||0)*100)+"%")}});
        ownedWorker=worker;if(expired||token!==generation.current){await worker.terminate();return null}work.current=worker;
        await worker.setParameters({tessedit_pageseg_mode:"11",preserve_interword_spaces:"1",user_defined_dpi:"300"});
        return worker.recognize(selected.dataUrl);
      })();
      const result=await Promise.race([task,timeout]);if(token!==generation.current||!result)return;
      const text=(result.data.text||"").trim(),parsed=parseKfBusinessCard(text),updated={...selected,ocrText:text,recognizedAt:new Date().toISOString()};
      setCard(updated);setFields(parsed);callbacks.current.onCardChange?.(updated);
      if(!text){setError("글자를 찾지 못했습니다. 명함을 가까이 촬영해 다시 등록하거나 직접 입력해 주세요.");setStatus("")}
      else{callbacks.current.onRecognized?.(parsed);setStatus("자동 인식 완료 · 아래 입력 내용을 확인해 주세요.")}
    }catch(e){if(token===generation.current){setError(e.message||"명함 인식에 실패했습니다. 다시 시도하거나 직접 입력해 주세요.");setStatus("")}}
    finally{expired=true;clearTimeout(timer);ownedWorker?.terminate().catch(()=>{});if(token===generation.current){work.current=null;updateBusy(false)}}
  }
  async function choose(event){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    stop();const token=generation.current;updateBusy(true);setError("");setStatus("명함 사진을 준비하고 있습니다…");
    try{const selected=await prepareKfBusinessCard(file);if(token!==generation.current)return;setCard(selected);setFields({});callbacks.current.onCardChange?.(selected);await recognize(selected)}
    catch(e){if(token===generation.current){setError(e.message);setStatus("");updateBusy(false)}}
  }
  const labels={name:"이름",company:"회사",title:"직함",phone:"휴대폰",email:"이메일",website:"홈페이지",address:"주소",brand:"브랜드"};
  return t.jsxs("section",{className:"kf-business-card-upload",children:[
    t.jsxs("div",{className:"kf-card-upload-heading",children:[t.jsx("strong",{children:"명함 등록 · 자동 입력"}),t.jsx("span",{children:"선택"})]}),
    t.jsx("p",{children:"명함 사진을 올리면 연락처를 자동으로 읽어 빈 항목에 채웁니다. 인식 결과를 확인하고 수정해 주세요."}),
    t.jsx("label",{className:"field",children:[t.jsx("span",{children:card?"명함 사진 교체":"명함 사진 선택"}),t.jsx("input",{ref:input,type:"file",accept:"image/jpeg,image/png,image/webp",onChange:choose,disabled,"aria-label":"명함 사진 등록"})]}),
    card&&t.jsx("img",{className:"kf-business-card-preview",src:card.dataUrl,alt:"등록한 명함 미리보기"}),
    status&&t.jsx("p",{role:"status","aria-live":"polite",children:status}),
    error&&t.jsx("p",{role:"alert",className:"kf-card-error",children:error}),
    card&&t.jsxs("div",{className:"kf-card-actions",children:[t.jsx("button",{type:"button",className:"btn outline small",disabled:disabled||busy,onClick:()=>recognize(card),children:"다시 인식"}),busy&&t.jsx("button",{type:"button",className:"btn outline small",disabled,onClick:()=>{stop();setStatus("인식을 중단했습니다. 직접 입력하거나 다시 인식할 수 있습니다.")},children:"인식 중단"}),t.jsx("button",{type:"button",className:"btn outline small",disabled,onClick:()=>{stop();setCard(null);setFields({});setError("");setStatus("");callbacks.current.onCardChange?.(null)},children:"명함 제거"})]}),
    Object.keys(fields).length>0&&t.jsxs("details",{className:"kf-card-recognized",children:[t.jsx("summary",{children:"명함 인식 결과 보기"}),t.jsx("dl",{children:Object.entries(fields).map(([key,value])=>t.jsxs("div",{children:[t.jsx("dt",{children:labels[key]||key}),t.jsx("dd",{children:value})]},key))})]}),
    card?.ocrText&&t.jsxs("details",{className:"kf-card-recognized",children:[t.jsx("summary",{children:"인식한 전체 글자 보기"}),t.jsx("pre",{children:card.ocrText})]}),
    t.jsx("small",{children:"JPG · PNG · WEBP / 최대 15MB. 명함 인식은 기기에서 처리하며, 명함 이미지는 가입 후 이 브라우저에 보관됩니다."})
  ]});
}
