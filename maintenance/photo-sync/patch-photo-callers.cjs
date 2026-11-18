// Pure HTML transformer. The deployment owner applies the returned string to all route copies.
// Does not edit HTML files when imported or invoked directly.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

function kfPhotoLock(element) {
  if (!element) return () => {};
  const scope = element.closest?.('.modal') || element.closest?.('form') || element;
  if (scope.__kfPhotoSaving) return null;
  scope.__kfPhotoSaving = true;
  const previousBusy = scope.getAttribute?.('aria-busy');
  scope.setAttribute?.('aria-busy', 'true');
  const controls = Array.from(scope.querySelectorAll?.('button,input[type="submit"],input[type="file"]') || []);
  if (element.matches?.('button,input[type="submit"],input[type="file"]') && !controls.includes(element)) controls.push(element);
  const disabled = controls.map(control => [control, control.disabled]);
  disabled.forEach(([control]) => { control.disabled = true; });
  return () => {
    disabled.forEach(([control, value]) => { control.disabled = value; });
    if (previousBusy == null) scope.removeAttribute?.('aria-busy');
    else scope.setAttribute?.('aria-busy', previousBusy);
    scope.__kfPhotoSaving = false;
  };
}

async function kfPhotoConfirm(memberId, photo, notify) {
  try {
    const result = await Rs(memberId, photo);
    if (result?.cloud) return true;
  } catch {}
  notify?.('사진을 서버에 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
  return false;
}

function patchPhotoCallers(input) {
  let html = input;
  const applied = [];
  function replace(label, before, after, count = 1) {
    const actual = html.split(before).length - 1;
    if (actual !== count) throw new Error(`${label}: expected ${count} exact matches, got ${actual}`);
    html = html.split(before).join(after);
    applied.push(label);
  }
  function region(label, start, end, transform) {
    const begin = html.indexOf(start);
    if (begin < 0 || html.indexOf(start, begin + start.length) >= 0) throw new Error(`${label}: start must be unique`);
    const finish = html.indexOf(end, begin + start.length);
    if (finish < 0) throw new Error(`${label}: end missing`);
    const before = html.slice(begin, finish);
    const after = transform(before);
    if (before === after) throw new Error(`${label}: no change`);
    replace(label, before, after);
  }
  function inside(text, before, after, label) {
    if (text.split(before).length !== 2) throw new Error(`${label}: nested exact match missing or repeated`);
    return text.replace(before, after);
  }

  replace('checked-save and UI lock helpers', 'function Fs(a,i){', kfPhotoLock.toString() + '\n' + kfPhotoConfirm.toString() + '\nfunction Fs(a,i){');

  const wrappers = [
    { label: 'cohort photo save', start: 'Zn=(k,te,Ve=!1)=>{', end: ',Gi=async(k,te)=>', replacement: 'Zn=async(k,te,Ve=!1)=>{var et;if(!mn(k.id)){p?.("프로필 사진 및 주소록 관리는 마스터 관리자 계정 또는 본인 미니홈피에서만 가능합니다.");return!1}if(!await kfPhotoConfirm(k.id,te,p))return!1;if(!((et=a.updateMemberProfile)?.call(a,k.id,{},{profileImage:te})))return!1;Ve||p?.(te?`제${k.cohort}기 ${k.name} 원우의 프로필 사진이 모든 방문자의 주소록·카페·미니홈피에 반영되었습니다.`:`제${k.cohort}기 ${k.name} 원우의 프로필 사진이 초기화되었습니다.`);return!0}' },
    { label: 'directory photo save', start: 'Se=(ee,_,I=!1)=>{', end: ',Me=async(ee,_)=>', replacement: 'Se=async(ee,_,I=!1)=>{var L;if(!le(ee.id)){u?.("프로필 사진 및 주소록 관리는 마스터 관리자 계정 또는 본인 미니홈피에서만 가능합니다.");return!1}if(!await kfPhotoConfirm(ee.id,_,u))return!1;if(!((L=a.updateMemberProfile)?.call(a,ee.id,{},{profileImage:_})))return!1;I||u?.(_?`제${ee.cohort}기 ${ee.name} 원우의 프로필 사진이 모든 방문자의 주소록·카페·미니홈피에 반영되었습니다.`:`제${ee.cohort}기 ${ee.name} 원우의 프로필 사진이 초기화되었습니다.`);return!0}' },
    { label: 'committee photo save', start: 'ko=(S,V)=>{var tt;if(!Fn(S.id))', end: ',Xo=(s.accounts||[])', replacement: 'ko=async(S,V)=>{var tt;if(!Fn(S.id)){ze("프로필 사진 및 주소록 관리는 마스터 관리자 계정 또는 본인 미니홈피에서만 가능합니다.");return!1}if(!await kfPhotoConfirm(S.id,V,ze))return!1;if(!((tt=s.updateMemberProfile)?.call(s,S.id,{},{profileImage:V})))return!1;ze(V?`제${S.cohort}기 ${S.name} 원우의 프로필 사진이 모든 방문자의 주소록·카페·미니홈피에 반영되었습니다.`:`제${S.cohort}기 ${S.name} 원우의 프로필 사진이 초기화되었습니다.`);return!0}' }
  ];
  for (const item of wrappers) region(item.label, item.start, item.end, () => item.replacement);
  replace('cohort file awaits save', 'Ve&&Zn(k,Ve)}catch{p==null||p("프로필 사진을 처리하지 못했습니다. 다른 이미지 파일을 선택해 주세요.")}', 'return!!Ve&&await Zn(k,Ve)}catch{p?.("프로필 사진을 처리하지 못했습니다. 다른 이미지 파일을 선택해 주세요.");return!1}');
  replace('directory file awaits save', 'I&&Se(ee,I)}catch{u==null||u("프로필 사진을 처리하지 못했습니다. 다른 이미지 파일을 선택해 주세요.")}', 'return!!I&&await Se(ee,I)}catch{u?.("프로필 사진을 처리하지 못했습니다. 다른 이미지 파일을 선택해 주세요.");return!1}');
  replace('cohort file UI lock', 'onChange:async k=>{var Ve;const te=(Ve=k.target.files)==null?void 0:Ve[0];te&&await Gi(L,te)}', 'onChange:async k=>{var Ve;const te=(Ve=k.target.files)==null?void 0:Ve[0],kfInput=k.currentTarget;if(!te)return;const kfUnlock=kfPhotoLock(kfInput);if(!kfUnlock)return;try{if(await Gi(L,te))kfInput.value=""}finally{kfUnlock()}}');
  replace('directory file UI lock', 'onChange:async ee=>{var I;const _=(I=ee.target.files)==null?void 0:I[0];_&&await Me(C,_)}', 'onChange:async ee=>{var I;const _=(I=ee.target.files)==null?void 0:I[0],kfInput=ee.currentTarget;if(!_)return;const kfUnlock=kfPhotoLock(kfInput);if(!kfUnlock)return;try{if(await Me(C,_))kfInput.value=""}finally{kfUnlock()}}');
  replace('committee file UI lock', 'onChange:async S=>{var Qe;const V=(Qe=S.target.files)==null?void 0:Qe[0];if(!(!V||!V.size))try{const tt=await lo(V);tt&&ko(Ze,tt)}catch{ze("프로필 사진을 처리하지 못했습니다.")}}', 'onChange:async S=>{var Qe;const V=(Qe=S.target.files)==null?void 0:Qe[0],kfInput=S.currentTarget;if(!V||!V.size)return;const kfUnlock=kfPhotoLock(kfInput);if(!kfUnlock)return;try{const tt=await lo(V);if(tt&&await ko(Ze,tt))kfInput.value=""}catch{ze("프로필 사진을 처리하지 못했습니다.")}finally{kfUnlock()}}');

  const forms = [
    { label: 'cohort URL form', start: 'onSubmit:k=>{var ut,Bn,ga,$i,ii,Hn,Jn,Tn,$t,Ko,Vo,Ys;', event: 'k', oldSave: 'Ve&&Rs(L.id,Ve),', newSave: 'if(!mn(L.id))return;const kfUnlock=kfPhotoLock(k.currentTarget);if(!kfUnlock)return;try{if(Ve&&!await kfPhotoConfirm(L.id,Ve,p))return;', update: '(Ys=a.updateMemberProfile)==null||Ys.call(a,L.id,', updated: 'const kfUpdated=(Ys=a.updateMemberProfile)?Ys.call(a,L.id,', updateEnd: '},{profileImage:et}),p==null||p(', updateEndNew: '},{profileImage:et}):!1;if(!kfUpdated)return;p==null||p(', close: ',re(null)}' },
    { label: 'directory URL form', start: 'onSubmit:ee=>{var re,we,Ce,be,ke,gt,Y,Re,Ke,Xe,Ee,jt;', event: 'ee', oldSave: 'I&&Rs(C.id,I),', newSave: 'if(!le(C.id))return;const kfUnlock=kfPhotoLock(ee.currentTarget);if(!kfUnlock)return;try{if(I&&!await kfPhotoConfirm(C.id,I,u))return;', update: '(jt=a.updateMemberProfile)==null||jt.call(a,C.id,', updated: 'const kfUpdated=(jt=a.updateMemberProfile)?jt.call(a,C.id,', updateEnd: '},{profileImage:L}),u==null||u(', updateEndNew: '},{profileImage:L}):!1;if(!kfUpdated)return;u==null||u(', close: ',U(null)}' },
    { label: 'committee URL form', start: 'onSubmit:S=>{var Jt,un,Ei,Ti,Ai,Jo,hi,xa,va,Ja,il,es;', event: 'S', oldSave: 'Qe&&Rs(Ze.id,Qe),', newSave: 'if(!Fn(Ze.id))return;const kfUnlock=kfPhotoLock(S.currentTarget);if(!kfUnlock)return;try{if(Qe&&!await kfPhotoConfirm(Ze.id,Qe,ze))return;', update: '(es=s.updateMemberProfile)==null||es.call(s,Ze.id,', updated: 'const kfUpdated=(es=s.updateMemberProfile)?es.call(s,Ze.id,', updateEnd: '},{profileImage:zt}),ze(', updateEndNew: '},{profileImage:zt}):!1;if(!kfUpdated)return;ze(', close: ',Wt(null)}' }
  ];
  for (const item of forms) region(item.label, item.start, ',children:[t.jsxs("label",{className:"field",children:["2. 또는 프로필 사진 이미지 URL 입력"', text => {
    text = inside(text, `onSubmit:${item.event}=>`, `onSubmit:async ${item.event}=>`, item.label);
    text = inside(text, item.oldSave, item.newSave, item.label);
    text = inside(text, item.update, item.updated, item.label);
    text = inside(text, item.updateEnd, item.updateEndNew, item.label);
    return inside(text, item.close, item.close.slice(0, -1) + '}finally{kfUnlock()}}', item.label);
  });

  for (const [label, before, after] of [
    ['cohort reset awaits save', 'onClick:()=>{Zn(L,""),re(null)}', 'onClick:async k=>{const kfUnlock=kfPhotoLock(k.currentTarget);if(!kfUnlock)return;try{if(await Zn(L,""))re(null)}finally{kfUnlock()}}'],
    ['directory reset awaits save', 'onClick:()=>{Se(C,""),U(null)}', 'onClick:async ee=>{const kfUnlock=kfPhotoLock(ee.currentTarget);if(!kfUnlock)return;try{if(await Se(C,""))U(null)}finally{kfUnlock()}}'],
    ['committee reset awaits save', 'onClick:()=>{ko(Ze,""),Wt(null)}', 'onClick:async S=>{const kfUnlock=kfPhotoLock(S.currentTarget);if(!kfUnlock)return;try{if(await ko(Ze,""))Wt(null)}finally{kfUnlock()}}'],
    ['cohort single AI returns saved state', 'onApply:(k,te)=>{Zn(k,te),Y(da())}', 'onApply:async(k,te,kfNote)=>{const kfSaved=await Zn(k,te);if(kfSaved){Uu(k.id,kfNote||"");Y(da())}return kfSaved}'],
    ['cohort batch AI returns saved state', 'onApplyMemberPhoto:(k,te)=>{Zn(k,te,!0),Y(da())}', 'onApplyMemberPhoto:async(k,te,kfNote)=>{const kfSaved=await Zn(k,te,!0);if(kfSaved){Uu(k.id,kfNote||"");Y(da())}return kfSaved}'],
    ['directory single AI returns saved state', 'onApply:(ee,_)=>{Se(ee,_),ye(da())}', 'onApply:async(ee,_,kfNote)=>{const kfSaved=await Se(ee,_);if(kfSaved){Uu(ee.id,kfNote||"");ye(da())}return kfSaved}'],
    ['directory batch AI returns saved state', 'onApplyMemberPhoto:(ee,_)=>{Se(ee,_,!0),ye(da())}', 'onApplyMemberPhoto:async(ee,_,kfNote)=>{const kfSaved=await Se(ee,_,!0);if(kfSaved){Uu(ee.id,kfNote||"");ye(da())}return kfSaved}'],
    ['committee single AI returns saved state', 'onApply:(S,V)=>{ko(S,V),fa(da())}', 'onApply:async(S,V,kfNote)=>{const kfSaved=await ko(S,V);if(kfSaved){Uu(S.id,kfNote||"");fa(da())}return kfSaved}']
  ]) replace(label, before, after);

  replace('single AI save waits before closing', 'onClick:()=>{Uu(a.id,ee.trim()),r(a,I,ee.trim()),m()}', 'onClick:async de=>{const kfUnlock=kfPhotoLock(de.currentTarget);if(!kfUnlock)return;try{if(await r(a,I,ee.trim()))m()}catch{u?.("사진을 서버에 저장하지 못했습니다. 다시 시도해 주세요.")}finally{kfUnlock()}}');
  replace('single AI reset waits before closing', 'onClick:()=>{Uu(a.id,""),r(a,"",""),m()}', 'onClick:async de=>{const kfUnlock=kfPhotoLock(de.currentTarget);if(!kfUnlock)return;try{if(await r(a,"",""))m()}catch{u?.("사진을 서버에 저장하지 못했습니다. 다시 시도해 주세요.")}finally{kfUnlock()}}');
  replace('batch AI counts confirmed writes', 'ke!=null&&ke.dataUrl?(Uu(Ce.id,he.trim()),m(Ce,ke.dataUrl,he.trim()),we++,$e(we),fe(gt=>({...gt,[Ce.id]:"done"}))):fe(gt=>({...gt,[Ce.id]:"error"}))', 'ke!=null&&ke.dataUrl&&await m(Ce,ke.dataUrl,he.trim())?(we++,$e(we),fe(gt=>({...gt,[Ce.id]:"done"}))):fe(gt=>({...gt,[Ce.id]:"error"}))');
  replace('batch AI reports failed write count', 'le(`${Ce} 원우 ${we}명의 AI 초고화질 사진 일괄 업스케일 및 주소록·미니홈피 저장이 완료되었습니다!`),h==null||h(`${Ce} 원우 ${we}명 AI 사진 일괄 업스케일 완료!`)', 'le(`${Ce} 원우 사진 저장 결과: 성공 ${we}명, 실패 ${re.length-we}명${re.length>we?". 실패한 원우의 사진은 다시 시도해 주세요.":"."}`),h?.(`${Ce} 원우 사진 저장 성공 ${we}명, 실패 ${re.length-we}명`)');
  region('batch reset awaits each server write', 'I=()=>{if(M)return;let L=0;for(const we of Me)Oe(we.id)', ',me=Te>0?', () => 'I=async()=>{if(M)return;se(!0);let L=0,kfFailed=0;try{for(const we of Me){if(!Oe(we.id))continue;if(await m(we,"","")){L++;fe(kfStates=>({...kfStates,[we.id]:"done"}))}else{kfFailed++;fe(kfStates=>({...kfStates,[we.id]:"error"}))}}const re=p==="전체"?"전체 기수":`제${p}기`;le(`${re} 원본 사진 복원 결과: 성공 ${L}명, 실패 ${kfFailed}명`);h?.(`${re} 원본 사진 복원 성공 ${L}명, 실패 ${kfFailed}명`)}finally{se(!1)}}');

  // This path already waits for a photo, but duplicated its own timeout and left controls enabled.
  region('minihompy form lock and confirmed save', 'onSubmit:async Ae=>{var es,ts,ns,sd,ol,jc,xc,nr,ir,vc,wc,Cc,ld,rd,cd;', ',children:[t.jsx(Ue,{type:"blue",children:s.isMaster?', text => {
    text = inside(text, 'tt=V.get("profileFile"),zt=(ts=V.get("profileUrl"))==null?void 0:ts.toString().trim(),Jt=', 'tt=V.get("profileFile"),zt=(ts=V.get("profileUrl"))==null?void 0:ts.toString().trim();if(!s.canManageMember(F.id))return;const kfUnlock=kfPhotoLock(S);if(!kfUnlock)return;try{const Jt=', 'minihompy lock');
    text = inside(text, 'if(Jt||zt){const sync=await Promise.race([Rs((T&&T.id)||F.id,un),new Promise(resolve=>setTimeout(()=>resolve({cloud:!1}),15000))]);if(!sync.cloud){ze("사진을 서버에 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");return}}', 'if((Jt||zt)&&!await kfPhotoConfirm((T&&T.id)||F.id,un,ze))return;', 'minihompy checked save');
    text = inside(text, 's.updateMemberProfile(F.id,', 'const kfUpdated=s.updateMemberProfile(F.id,', 'minihompy result');
    text = inside(text, '}),ze("미니홈피와 원우 주소록 프로필 카드 정보가 동시에 반영되었습니다.")}', '});if(!kfUpdated)return;ze("미니홈피와 원우 주소록 프로필 카드 정보가 동시에 반영되었습니다.")}finally{kfUnlock()}}', 'minihompy unlock');
    return text;
  });

  // Existing members must save a selected photo before changing their local account or reporting success.
  replace('cohort join waits for existing member photo', 'u?((Nn=a.updateMemberProfile)==null||Nn.call(a,u.id,', 'if(u&&ot&&!await kfPhotoConfirm(u.directoryId||u.id,ot,r)){Ke("사진을 서버에 저장하지 못했습니다. 다시 시도해 주세요.");return}u?((Nn=a.updateMemberProfile)==null||Nn.call(a,u.id,');
  replace('cohort join removes unawaited duplicate', 'ot&&Rs(u.id,ot),r==null||r(`제${Mt}기 소속·위원회', 'r==null||r(`제${Mt}기 소속·위원회');

  // Signup already is async; expose only the new account's actual identifiers.
  // Its existing name/cohort shopping-profile match does not establish a directory binding.
  region('signup returns explicit account identifiers', 'async signup(f,j=!1){', ',async login(', text => {
    if (!text.endsWith('})}')) throw new Error('signup return: unexpected function ending');
    return text.slice(0, -3) + '});return{id:ae.id,directoryId:ae.directoryId||null}}';
  });
  replace('new member join uses confirmed photo result', ':(await a.signup({name:he,email:M||ye,password:je||"1234",confirm:Ie||"1234",cohort:String(Mt),committee:j,position:y,industry:ue,customIndustry:Se,company:Te,brand:Oe,website:ee,mallUrl:I,note:xt,required:we,reviewConsent:be,marketing:gt},!0),r==null||r(`제${Mt}기 기수 가입 신청 및 개인 미니홈피 개설이 완료되었습니다!`)),s(Mt)', ':await(async()=>{const kfJoined=await a.signup({name:he,email:M||ye,password:je||"1234",confirm:Ie||"1234",cohort:String(Mt),committee:j,position:y,industry:ue,customIndustry:Se,company:Te,brand:Oe,website:ee,mallUrl:I,note:xt,required:we,reviewConsent:be,marketing:gt},!0);if(ot){const kfMemberId=kfJoined?.directoryId||kfJoined?.id;if(!kfMemberId||!await kfPhotoConfirm(kfMemberId,ot)){throw Error("가입은 완료되었지만 사진을 서버에 저장하지 못했습니다. 내 미니홈피에서 사진을 다시 저장해 주세요.")}}r?.(`제${Mt}기 기수 가입 신청 및 개인 미니홈피 개설이 완료되었습니다!`)})(),s(Mt)');

  return html;
}

module.exports = { patchPhotoCallers, kfPhotoLock, kfPhotoConfirm };

if (require.main === module) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const alreadyApplied = source.includes('async function kfPhotoConfirm(');
  const result = alreadyApplied ? source : patchPhotoCallers(source);
  const scripts = [...result.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(match => !/application\/ld\+json/i.test(match[1])).map(match => match[2]);
  scripts.forEach(script => cp.execFileSync(process.execPath, ['--check', '--input-type=module'], { input: script, encoding: 'utf8' }));
  console.log(JSON.stringify({ dryRun: true, alreadyApplied, inputBytes: Buffer.byteLength(source), outputBytes: Buffer.byteLength(result), scriptsParsed: scripts.length }));
}
