const fs = require('node:fs');

function memberPhotoKey(value) {
  const key = value && typeof value === 'object' ? value.directoryId || value.id : value;
  return String(key || '').trim().replace(/^c(\d+)-(\d+)$/, 'alumni-$1-$2');
}

function resolveSharedMemberPhoto(memberOrId, accounts = [], photos = Ma, fallback = '') {
  if (!memberOrId) return '';
  const input = typeof memberOrId === 'object' ? memberOrId : null;
  const requestedId = memberPhotoKey(memberOrId);
  const account = accounts.find(value => memberPhotoKey(value.id) === requestedId)
    || accounts.find(value => memberPhotoKey(value) === requestedId)
    || (input && input.minihompy ? input : null);
  const id = memberPhotoKey(account && account.directoryId ? account : memberOrId);
  const original = Rt.find(value => memberPhotoKey(value.id) === id);
  const originalPhoto = original && original.photo || fallback || '';
  const aliases = [...new Set([id, memberPhotoKey(account && account.id), memberPhotoKey(input && input.id),
    original ? `c${original.cohort}-${original.no}` : ''].filter(Boolean))];
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(photos || {}, key)) {
      const value = photos[key];
      // An explicit empty value is a reset, not permission to revive a stale local account photo.
      return typeof value === 'string' && value.trim() ? value.trim() : originalPhoto;
    }
  }
  const candidates = [account && account.minihompy && account.minihompy.profileImage,
    account && account.minihompy && account.minihompy.photo,
    input && input.profileImage, input && input.minihompy && input.minihompy.profileImage,
    input && input.minihompy && input.minihompy.photo, originalPhoto,
    input && input.photo, account && account.photo];
  return candidates.find(value => typeof value === 'string' && value.trim()) || '';
}

function resolveMinihompyMember(value, accounts = [], members = Rt) {
  if (!value) return { directory: null, account: null };
  const input = typeof value === 'object' ? value : null;
  const key = memberPhotoKey(value);
  let account = accounts.find(member => memberPhotoKey(member.id) === key) || null;
  let directory = members.find(member => memberPhotoKey(member.id) === key) || null;
  if (account && account.directoryId) {
    directory = members.find(member => memberPhotoKey(member.id) === memberPhotoKey(account.directoryId)) || null;
  }
  if (!account && directory) {
    account = accounts.find(member => memberPhotoKey(member) === memberPhotoKey(directory.id)) || null;
  }
  if (!account && !directory && input) account = input;
  // Old name-based links are supported only when they identify one person unambiguously.
  // An explicit UUID account is never attached to a namesake directory member.
  if (!account && !directory && !input) {
    const namedMembers = members.filter(member => member.name === value);
    if (namedMembers.length === 1) {
      directory = namedMembers[0];
      account = accounts.find(member => memberPhotoKey(member) === memberPhotoKey(directory.id)) || null;
    } else if (namedMembers.length === 0) {
      const namedAccounts = accounts.filter(member => member.name === value);
      if (namedAccounts.length === 1) account = namedAccounts[0];
    }
  }
  return { directory, account };
}

const sharedPhotoHelpers = [memberPhotoKey, resolveSharedMemberPhoto, resolveMinihompyMember].map(fn => fn.toString()).join('\n') + '\n';

function patchPhotoReaders(html) {
  const changes = [];
  function replace(label, before, after) {
    const count = html.split(before).length - 1;
    if (count !== 1) throw new Error(`${label}: expected one match, got ${count}`);
    html = html.replace(before, after);
    changes.push(label);
  }
  function replaceRange(label, start, end, value) {
    const a = html.indexOf(start);
    if (a < 0 || html.indexOf(start, a + start.length) >= 0) throw new Error(`${label}: start marker not unique`);
    const b = html.indexOf(end, a + start.length);
    if (b < 0) throw new Error(`${label}: end marker missing`);
    replace(label, html.slice(a, b), value);
  }

  replace('photo subscription', 'function n0(){const[a,i]=z.useState(Ma);return z.useEffect(()=>Uv(i),[]),a}',
    'function n0(){return z.useSyncExternalStore(Uv,()=>Ma,()=>Ma)}');
  replace('profile subscription', 'function i0(){const[a,i]=z.useState(Do);return z.useEffect(()=>Lv(i),[]),a}',
    'function i0(){return z.useSyncExternalStore(Lv,()=>Do,()=>Do)}');
  replace('sync status subscription', 'function Bv(){const[a,i]=z.useState(Fu);return z.useEffect(()=>(j1.add(i),()=>j1.delete(i)),[]),a}',
    'function Bv(){return z.useSyncExternalStore(a=>(j1.add(a),()=>j1.delete(a)),()=>Fu,()=>Fu)}');
  replaceRange('URL preference and shared resolver', 'function n4(a,i=""){', 'function Gv(', sharedPhotoHelpers +
    'function n4(a,i=""){const s=[a,i].find(r=>typeof r==="string"&&r.trim());if(!s)return"";const value=s.trim();if(/^(?:data:|blob:|https?:\\/\\/)/i.test(value))return value;const r=value.replace(/^(\\/kfceo-connect-web\\/|\\/+|\\.\\/+)/,"");const suffix=/[?#]/.test(r)?"":"?v=20261030fix";return typeof window<"u"&&window.location.protocol==="file:"?`https://kfceo.kr/${r}${suffix}`:`${typeof window<"u"&&window.location.pathname.startsWith("/kfceo-connect-web")?"/kfceo-connect-web":""}/${r}${suffix}`}');
  replace('home member cards', 'Xl=z.useMemo(()=>Rt.map(A=>Fs(A,A.id)),[k])',
    'Xl=z.useMemo(()=>Rt.map(A=>{const E=Fs(A,A.id);return{...E,photo:resolveSharedMemberPhoto(E,s.accounts,$o)}}),[k,$o,s.accounts])');

  replace('cohort profile data', '[Xe[k.id],(et=te==null?void 0:te.minihompy)==null?void 0:et.profileImage,(ut=te==null?void 0:te.minihompy)==null?void 0:ut.photo].find(Bn=>typeof Bn=="string"&&Bn.trim())||""||k.photo||""',
    'resolveSharedMemberPhoto(k,a.accounts,Xe)');
  replace('cohort photo getter', 'xt=k=>{var te,Ve,wt,et;return Xe[k]||((Ve=(te=de[k])==null?void 0:te.minihompy)==null?void 0:Ve.profileImage)||((et=(wt=de[k])==null?void 0:wt.minihompy)==null?void 0:et.photo)||ot[k]||""}',
    'xt=k=>resolveSharedMemberPhoto(k,a.accounts,Xe,ot[k]||"")');
  replace('directory profile data', '[se[ee.id],(L=_==null?void 0:_.minihompy)==null?void 0:L.profileImage,(re=_==null?void 0:_.minihompy)==null?void 0:re.photo].find(we=>typeof we=="string"&&we.trim())||""||ee.photo||""',
    'resolveSharedMemberPhoto(ee,a.accounts,se)');
  replace('directory photo getter', 'ue=ee=>{var _,I,me,L;return se[ee]||((I=(_=Ie[ee])==null?void 0:_.minihompy)==null?void 0:I.profileImage)||((L=(me=Ie[ee])==null?void 0:me.minihompy)==null?void 0:L.photo)||$e[ee]||""}',
    'ue=ee=>resolveSharedMemberPhoto(ee,a.accounts,se,$e[ee]||"")');
  replace('committee profile data', '[$o[S.id],(zt=V==null?void 0:V.minihompy)==null?void 0:zt.profileImage,(Jt=V==null?void 0:V.minihompy)==null?void 0:Jt.photo].find(un=>typeof un=="string"&&un.trim())||""||S.photo||""',
    'resolveSharedMemberPhoto(S,s.accounts,$o)');
  replace('committee photo getter', 'bn=(S,V="")=>{var Qe,tt,zt,Jt;return $o[S]||((tt=(Qe=pt[S])==null?void 0:Qe.minihompy)==null?void 0:tt.profileImage)||((Jt=(zt=pt[S])==null?void 0:zt.minihompy)==null?void 0:Jt.photo)||Kt[S]||V||""}',
    'bn=(S,V="")=>resolveSharedMemberPhoto(S,s.accounts,$o,Kt[S]||V||"")');
  replace('committee linked accounts', 'photo:$o[S.id]||(V&&$o[V.id])||S.photo||(V==null?void 0:V.photo)||""',
    'photo:resolveSharedMemberPhoto(V||S,s.accounts,$o)');

  replaceRange('organization and search stable identity', 'const No=A=>{', 'function searchMemberPhoto(',
    'const No=A=>{if(!A)return null;const key=memberPhotoKey(A),named=Xl.filter(B=>B.name===A),E=Xl.find(B=>memberPhotoKey(B.id)===key)||(named.length===1?named[0]:null),accounts=s.accounts||[],direct=accounts.find(B=>memberPhotoKey(B.id)===key)||accounts.find(B=>E&&memberPhotoKey(B)===memberPhotoKey(E.id)),matching=accounts.filter(B=>B.name===(E?E.name:A)&&(!E||Number(B.cohort)===Number(E.cohort))&&(!B.directoryId||E&&memberPhotoKey(B.directoryId)===memberPhotoKey(E.id))),O=direct||(matching.length===1?matching[0]:null);if(!E&&!O)return null;const N=(E==null?void 0:E.id)||memberPhotoKey(O),w=resolveSharedMemberPhoto(E||O,accounts,$o);return{id:N,cohort:Number((O==null?void 0:O.cohort)||(E==null?void 0:E.cohort)||1),name:(O==null?void 0:O.name)||(E==null?void 0:E.name)||A,title:(O==null?void 0:O.title)||(E==null?void 0:E.title)||"대표",company:(O==null?void 0:O.company)||(E==null?void 0:E.company)||"",brand:(O==null?void 0:O.brand)||(E==null?void 0:E.brand)||"",photo:w}};');
  replace('mall directory members', '[$o[B.id],(pt=Z==null?void 0:Z.minihompy)==null?void 0:pt.profileImage,(Kt=Z==null?void 0:Z.minihompy)==null?void 0:Kt.photo].find(At=>typeof At=="string"&&At.trim())||""',
    'resolveSharedMemberPhoto(B,s.accounts,$o)');
  replace('mall linked accounts', 'photo:$o[B.id]||((Z=B.minihompy)==null?void 0:Z.profileImage)||B.photo||""',
    'photo:resolveSharedMemberPhoto(B,s.accounts,$o)');
  replace('minihompy profile', '(T&&$o[T.id])||$o[F.id]||[B.profileImage,B.photo].find(Ae=>typeof Ae=="string"&&(Ae.startsWith("data:")||Ae.startsWith("http")))||(T==null?void 0:T.photo)||F.photo||""',
    'resolveSharedMemberPhoto(T||F,s.accounts,$o)');
  replace('minihompy identity', 'O=E?E.replace(/^c(\\d+)-(\\d+)$/,"alumni-$1-$2"):null,N=Rt.find(Ae=>Ae.id===O||Ae.id===E||`c${Ae.cohort}-${Ae.no}`===E||Ae.name===E)||null,F=s.accounts.find(Ae=>Ae.id===O||Ae.id===E||N&&(Ae.id===N.id||String(Ae.cohort)===String(N.cohort)&&Ae.name===N.name))',
    'O=memberPhotoKey(E),identity=resolveMinihompyMember(E,s.accounts),N=identity.directory,F=identity.account');
  replace('minihompy invalid identity fallback', '||(((er=s.account)==null?void 0:er.id)!=="master-operator"?s.account:null)||s.accounts.find(Ae=>Ae.id==="alumni-1-1"||Ae.cohort==="1");if(!F)',
    '||(!E&&((er=s.account)==null?void 0:er.id)!=="master-operator"?s.account:null)||(!E?s.accounts.find(Ae=>Ae.id==="alumni-1-1"||Ae.cohort==="1"):null);if(!F)');
  replace('minihompy stable directory binding', 'T=N||Rt.find(Ae=>Ae.id===F.id||Ae.id===F.directoryId||String(Ae.cohort)===String(F.cohort)&&Ae.name===F.name)',
    'T=N||resolveMinihompyMember(F,s.accounts).directory');
  replace('my page photo visibility', '($o[s.account.id]||((O=s.account.minihompy)==null?void 0:O.profileImage))?',
    'resolveSharedMemberPhoto(s.account,s.accounts,$o)?');
  replace('my page photo source', 'src:$o[s.account.id]||s.account.minihompy.profileImage',
    'src:resolveSharedMemberPhoto(s.account,s.accounts,$o)');
  replace('cohort administration photo count', 'w.filter(Z=>{var ge;return Z.photo||((ge=Z.minihompy)==null?void 0:ge.profileImage)}).length',
    'w.filter(Z=>resolveSharedMemberPhoto(Z,s.accounts,$o)).length');
  replace('cohort administration photo', 'pt=((Kt=Z.minihompy)==null?void 0:Kt.profileImage)||Z.photo||""',
    'pt=resolveSharedMemberPhoto(Z,s.accounts,$o)');
  replace('header avatar', 'E=A&&[$o[A.id],(O=A.minihompy)==null?void 0:O.profileImage,(N=A.minihompy)==null?void 0:N.photo,A.photo].find(F=>typeof F=="string"&&F.trim())||""',
    'E=resolveSharedMemberPhoto(A,s.accounts,$o)');
  return { html, changes };
}

module.exports = { patchPhotoReaders, sharedPhotoHelpers };

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node patch-photo-readers.cjs INPUT.html OUTPUT.html');
  const result = patchPhotoReaders(fs.readFileSync(input, 'utf8'));
  fs.writeFileSync(output, result.html, 'utf8');
  console.log(JSON.stringify({ replacements: result.changes.length, changes: result.changes }, null, 2));
}
