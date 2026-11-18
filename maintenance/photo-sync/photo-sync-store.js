// Member-scoped realtime photo subscriptions; never download the complete image collection.
let Ma=J3(W1),Do=J3(J1);
const g1=new Set,y1=new Set,j1=new Set;
let Fu=Ll?"connecting":"local";
const e0=()=>{for(const a of g1)a(Ma)},t0=()=>{for(const a of y1)a(Do)};
function pm(a){if(Fu!==a){Fu=a;for(const i of j1)i(Fu)}}
let photoSyncRevision=0,profileSyncRevision=0,photoSyncConnected=false,profileSyncReady=false,photoSyncRefresh=null,photoSyncRefreshAgain=false;
const photoSyncVersions=new Map,photoSyncRequests=new Map,photoSyncWatches=new Map,photoSyncWrites=new Map,photoSyncRecent=new Set;
function persistSharedPhotos(){
  const cache={};let bytes=4;
  const keys=[...photoSyncRecent].reverse().concat(Object.keys(Ma));
  for(const key of keys){if(Object.prototype.hasOwnProperty.call(cache,key))continue;const value=Ma[key];if(typeof value!=="string")continue;const size=(JSON.stringify(value).length+JSON.stringify(key).length+2)*2;if(bytes+size>3*1024*1024)continue;cache[key]=value;bytes+=size}
  zu(W1,cache);
}
function receiveSharedPhoto(id,value){
  const next={...Ma,[id]:typeof value==="string"?value:""};
  photoSyncVersions.set(id,(photoSyncVersions.get(id)||0)+1);photoSyncRevision++;Ma=next;
  photoSyncRecent.delete(id);photoSyncRecent.add(id);persistSharedPhotos();e0();
}
function receiveSharedProfiles(value){Do=value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};profileSyncRevision++;profileSyncReady=true;zu(J1,Do);t0()}
async function sharedDataRequest(path,method="GET",value){
  if(!Ll)throw new Error("공유 서버가 설정되지 않았습니다.");
  const controller=new AbortController,timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(Au.databaseURL.replace(/\/$/,"")+"/"+path+".json",{method,cache:"no-store",signal:controller.signal,headers:method==="GET"?{}:{"Content-Type":"application/json"},...(method==="GET"?{}:{body:JSON.stringify(value)})});
    if(!response.ok)throw new Error("공유 서버 저장/조회 실패 ("+response.status+")");
    return await response.json();
  }finally{clearTimeout(timer)}
}
async function refreshMemberPhoto(id){
  const version=photoSyncVersions.get(id)||0;
  const request=(photoSyncRequests.get(id)||0)+1;photoSyncRequests.set(id,request);
  const value=await sharedDataRequest(zv+"/"+encodeURIComponent(id));
  if(request===photoSyncRequests.get(id)&&version===(photoSyncVersions.get(id)||0))receiveSharedPhoto(id,value);
}
async function refreshSharedData(force=false){
  if(!Ll)return;
  if(photoSyncRefresh){if(force)photoSyncRefreshAgain=true;return photoSyncRefresh}
  photoSyncRefresh=(async()=>{
    const version=profileSyncRevision;
    const jobs=[(async()=>{const value=await sharedDataRequest(Dv);if(version===profileSyncRevision)receiveSharedProfiles(value)})(),
      ...[...photoSyncWatches.keys()].map(id=>refreshMemberPhoto(id))];
    const results=await Promise.allSettled(jobs);
    pm(results.some(result=>result.status==="rejected")?"error":"synced");
  })().finally(()=>{photoSyncRefresh=null;if(photoSyncRefreshAgain){photoSyncRefreshAgain=false;refreshSharedData()}});
  return photoSyncRefresh;
}
const Ua=typeof BroadcastChannel<"u"?new BroadcastChannel(Mv):null;
Ua?.addEventListener("message",event=>{
  const data=event.data;
  if(data?.type==="shared-record-saved"&&data.kind===zv&&photoSyncWatches.has(data.id))refreshMemberPhoto(data.id).catch(()=>pm("error"));
  else if(["photos","profiles","shared-record-saved"].includes(data?.type))refreshSharedData(true);
});
let fm=null,x1=null,v1=null,wu=null;
async function e4(){
  if(!Ll)return null;if(wu)return wu;
  wu=(async()=>{
    const[{initializeApp:a,getApps:i},s]=await Promise.all([By(()=>Promise.resolve().then(()=>d8),void 0),By(()=>Promise.resolve().then(()=>sN),void 0)]);
    const r=i().length?i()[0]:a(Au),m=s.getDatabase(r);fm=s;x1=s.ref(m,zv);v1=s.ref(m,Dv);
    s.onValue(v1,f=>{receiveSharedProfiles(f.val());pm("synced")},()=>{pm("error");refreshSharedData()});
    s.onValue(s.ref(m,".info/connected"),f=>{photoSyncConnected=f.val()===true;if(!photoSyncConnected)pm("connecting");else refreshSharedData(true)});
    return true;
  })().catch(()=>{wu=null;pm("error");return null});
  return wu;
}
function watchMemberPhoto(value){
  const id=String(value||"").replace(/^c(\d+)-(\d+)$/,"alumni-$1-$2");
  if(!id||/[.#$\[\]\/]/.test(id))return()=>{};
  let entry=photoSyncWatches.get(id);
  if(!entry){
    entry={count:0,stop:null};photoSyncWatches.set(id,entry);
    refreshMemberPhoto(id).catch(()=>pm("error"));
    e4().then(ready=>{if(ready&&photoSyncWatches.get(id)===entry)entry.stop=fm.onValue(fm.child(x1,id),snapshot=>receiveSharedPhoto(id,snapshot.val()),()=>pm("error"))});
  }
  entry.count++;
  let removed=false;
  return()=>{if(removed)return;removed=true;if(--entry.count===0){entry.stop?.();photoSyncWatches.delete(id)}};
}
function SharedMemberImage({memberId,fallback,...props}){
  const ref=z.useRef(null);
  z.useEffect(()=>{
    const element=ref.current;if(!element||!memberId)return;
    let stop=null;
    if(typeof IntersectionObserver==="undefined")return watchMemberPhoto(memberId);
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){if(!stop)stop=watchMemberPhoto(memberId)}else if(stop){stop();stop=null}
    },{rootMargin:"240px"});
    observer.observe(element);
    return()=>{observer.disconnect();stop?.()};
  },[memberId,!!props.src]);
  return props.src?t.jsx("img",{...props,ref,"data-member-id":memberId}):t.jsx("span",{ref,"data-member-id":memberId,className:props.className,style:{display:"inline-flex",minWidth:1,minHeight:1,...props.style},children:fallback||null});
}
async function writeSharedRecord(kind,id,value){
  const key=kind+"/"+id,previous=photoSyncWrites.get(key)||Promise.resolve();
  const write=previous.catch(()=>{}).then(async()=>{
    const revision=kind===zv?photoSyncVersions.get(id)||0:profileSyncRevision;
    try{
      const saved=await sharedDataRequest(kind+"/"+encodeURIComponent(id),kind===Dv?"PATCH":"PUT",value);
      const matches=typeof value==="string"?saved===value:saved&&Object.keys(saved).length===Object.keys(value).length&&Object.keys(value).every(key=>saved[key]===value[key]);
      if(!matches)throw new Error("서버 저장 확인에 실패했습니다.");
      if(revision===(kind===zv?photoSyncVersions.get(id)||0:profileSyncRevision)){
        if(kind===zv)receiveSharedPhoto(id,saved);else receiveSharedProfiles({...Do,[id]:{...Do[id]||{},...saved}});
      }
      Ua?.postMessage({type:"shared-record-saved",kind,id});
      zu("kfc-shared-record-saved-v2",{kind,id,stamp:Date.now()});
      if(kind===zv)refreshMemberPhoto(id).catch(()=>pm("error"));else refreshSharedData(true);
      return{cloud:true};
    }catch(error){pm("error");return{cloud:false,error}}
  });
  photoSyncWrites.set(key,write);
  try{return await write}finally{if(photoSyncWrites.get(key)===write)photoSyncWrites.delete(key)}
}
async function Rs(a,i){
  a=String(a||"").replace(/^c(\d+)-(\d+)$/,"alumni-$1-$2");
  if(!a||/[.#$\[\]\/]/.test(a))return{cloud:false,error:new Error("회원 식별자를 확인해 주세요.")};
  return writeSharedRecord(zv,a,typeof i==="string"?i.trim():"");
}
async function Iv(a,i){
  const s={};for(const m of W3)if(i[m]!==void 0&&i[m]!==null)s[m]=String(i[m]).trim();
  if(!Object.keys(s).length)return{cloud:false,skipped:true};
  a=String(a).replace(/^c(\d+)-(\d+)$/,"alumni-$1-$2");
  return writeSharedRecord(Dv,a,{...s,updatedAt:new Date().toISOString()});
}
if(Ll&&typeof window<"u"){
  e4();refreshSharedData();
  window.addEventListener("online",()=>{e4();refreshSharedData(true)});
  window.addEventListener("focus",()=>refreshSharedData(true));
  // Cache writes must not trigger cross-tab refresh loops. Only confirmed-save invalidations do.
  window.addEventListener("storage",event=>{if(event.key==="kfc-shared-record-saved-v2")refreshSharedData(true)});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){e4();refreshSharedData(true)}});
  setInterval(()=>{if(!document.hidden&&(!photoSyncConnected||!profileSyncReady||Fu==="error")){e4();refreshSharedData()}},15000);
}
