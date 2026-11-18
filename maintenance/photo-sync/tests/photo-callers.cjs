const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { patchPhotoCallers, kfPhotoLock, kfPhotoConfirm } = require('../patch-photo-callers.cjs');

const source = fs.readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8');
const output = source.includes('async function kfPhotoConfirm(') ? source : patchPhotoCallers(source);
function extract(start, end, trim) {
  const begin = output.indexOf(start);
  assert.ok(begin >= 0, start);
  const finish = output.indexOf(end, begin + start.length);
  assert.ok(finish > begin, end);
  return output.slice(begin + trim, finish);
}
function scope() {
  const buttons = [{ disabled: false }, { disabled: true }];
  const attrs = new Map();
  const node = {
    closest: () => node,
    querySelectorAll: () => buttons,
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: key => attrs.delete(key)
  };
  return { node, buttons, attrs };
}

async function main() {
  const locked = scope();
  const unlock = kfPhotoLock(locked.node);
  assert.deepEqual(locked.buttons.map(button => button.disabled), [true, true]);
  assert.equal(locked.attrs.get('aria-busy'), 'true');
  assert.equal(kfPhotoLock(locked.node), null, 'second operation is blocked');
  unlock();
  assert.deepEqual(locked.buttons.map(button => button.disabled), [false, true]);
  assert.equal(locked.attrs.has('aria-busy'), false);
  assert.equal(locked.node.__kfPhotoSaving, false);

  const confirmCode = `(${kfPhotoConfirm.toString()})`;
  for (const result of [{ cloud: false }, null, new Error('denied')]) {
    const notices = [];
    const confirm = vm.runInNewContext(confirmCode, { Rs: async () => { if (result instanceof Error) throw result; return result; } });
    assert.equal(await confirm('alumni-5-3', 'new-photo', text => notices.push(text)), false);
    assert.equal(notices.length, 1, 'server failure gets exactly one notice');
  }
  assert.equal(await vm.runInNewContext(confirmCode, { Rs: async () => ({ cloud: true }) })('id', 'photo'), true);

  const member = { id: 'alumni-5-3', name: '김상훈', cohort: 5 };
  const wrappers = [
    { start: 'Zn=async(k,te,Ve=!1)=>{', end: ',Gi=async(k,te)=>', name: 'Zn', guard: 'mn', notify: 'p', membership: 'a' },
    { start: 'Se=async(ee,_,I=!1)=>{', end: ',Me=async(ee,_)=>', name: 'Se', guard: 'le', notify: 'u', membership: 'a' },
    { start: 'ko=async(S,V)=>{var tt;', end: ',Xo=(s.accounts||[])', name: 'ko', guard: 'Fn', notify: 'ze', membership: 's' }
  ];
  for (const item of wrappers) {
    const fnCode = extract(item.start, item.end, item.name.length + 1);
    for (const success of [false, true]) {
      const notices = [], writes = [];
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      const fn = vm.runInNewContext(`(${fnCode})`, {
        [item.guard]: () => true,
        [item.notify]: message => notices.push(message),
        [item.membership]: { updateMemberProfile: (...args) => { writes.push(args); return true; } },
        kfPhotoConfirm: () => pending
      });
      const save = fn(member, 'new-photo');
      assert.equal(writes.length, 0, `${item.name}: no local account mutation before server result`);
      release(success);
      assert.equal(await save, success);
      assert.equal(writes.length, success ? 1 : 0);
      assert.equal(notices.length, success ? 1 : 0, `${item.name}: success message requires confirmed save`);
    }
    let attempts = 0;
    const denied = vm.runInNewContext(`(${fnCode})`, {
      [item.guard]: () => false,
      [item.notify]: () => {},
      kfPhotoConfirm: () => { attempts++; return true; }
    });
    assert.equal(await denied(member, 'new-photo'), false);
    assert.equal(attempts, 0, `${item.name}: permission check precedes server write`);
  }

  const forms = [
    { start: 'onSubmit:async k=>{var ut,Bn,ga,$i,ii,Hn,Jn,Tn,$t,Ko,Vo,Ys;', memberKey: 'L', urlKey: 'Re', read: 'xt', permission: 'mn', membership: 'a', notify: 'p', close: 're', master: 'an' },
    { start: 'onSubmit:async ee=>{var re,we,Ce,be,ke,gt,Y,Re,Ke,Xe,Ee,jt;', memberKey: 'C', urlKey: 've', read: 'ue', permission: 'le', membership: 'a', notify: 'u', close: 'U', master: 'fe' },
    { start: 'onSubmit:async S=>{var Jt,un,Ei,Ti,Ai,Jo,hi,xa,va,Ja,il,es;', memberKey: 'Ze', urlKey: 'qs', read: 'bn', permission: 'Fn', membership: 's', notify: 'ze', close: 'Wt', master: 'y' }
  ];
  for (const item of forms) {
    const code = extract(item.start, ',children:[t.jsxs("label",{className:"field",children:["2. 또는 프로필 사진 이미지 URL 입력"', 'onSubmit:'.length);
    for (const success of [false, true]) {
      const state = scope(), writes = [], notices = [], closes = [];
      const fn = vm.runInNewContext(`(${code})`, {
        FormData: class { get() { return null; } },
        [item.memberKey]: member, [item.urlKey]: 'https://example.test/photo.png',
        [item.read]: () => 'previous-photo', [item.permission]: () => true,
        [item.membership]: { updateMemberProfile: (...args) => { writes.push(args); return true; } },
        [item.notify]: message => notices.push(message), [item.close]: value => closes.push(value),
        [item.master]: false,
        kfPhotoConfirm: async () => success, kfPhotoLock
      });
      await fn({ preventDefault() {}, currentTarget: state.node });
      assert.equal(writes.length, success ? 1 : 0);
      assert.equal(notices.length, success ? 1 : 0);
      assert.equal(closes.length, success ? 1 : 0, 'failed URL save leaves dialog open');
      assert.equal(state.node.__kfPhotoSaving, false, 'form controls unlock after either result');
      assert.equal(state.buttons[0].disabled, false);
    }
    let attempts = 0, mutations = 0, closes = 0;
    const denied = vm.runInNewContext(`(${code})`, {
      FormData: class { get() { return null; } },
      [item.memberKey]: member, [item.urlKey]: 'https://example.test/photo.png',
      [item.read]: () => 'previous-photo', [item.permission]: () => false,
      [item.membership]: { updateMemberProfile: () => { mutations++; return true; } },
      [item.notify]: () => {}, [item.close]: () => { closes++; }, [item.master]: false,
      kfPhotoConfirm: async () => { attempts++; return true; }, kfPhotoLock
    });
    await denied({ preventDefault() {}, currentTarget: scope().node });
    assert.equal(attempts, 0, 'URL form checks permission before saving');
    assert.equal(mutations, 0);
    assert.equal(closes, 0);
  }

  const ai = extract('onClick:async de=>{const kfUnlock=kfPhotoLock(de.currentTarget);if(!kfUnlock)return;try{if(await r(a,I,ee.trim()))m()}', ',children:[t.jsx(ri,{size:16}),"업스케일 사진 & 수정 내용 저장 반영"]', 'onClick:'.length);
  for (const success of [false, true]) {
    const state = scope(); let closes = 0;
    const fn = vm.runInNewContext(`(${ai})`, { kfPhotoLock, r: async () => success, a: member, I: 'photo', ee: 'note', m: () => { closes++; }, u: () => {} });
    await fn({ currentTarget: state.node });
    assert.equal(closes, success ? 1 : 0, 'single AI modal closes only after confirmed save');
    assert.equal(state.node.__kfPhotoSaving, false);
  }

  const batch = extract('_=async()=>{if(M)return;const L=y.trim();', ',I=async()=>{if(M)return;se(!0)', '_='.length);
  for (const result of [false, true, new Error('write rejected')]) {
    let states = {}, completed = 0, busy = false, release;
    const messages = [];
    const pending = new Promise(resolve => { release = resolve; });
    const fn = vm.runInNewContext(`(${batch})`, {
      M: false, y: '', Iu() {}, ee: true, Me: [member], s: { [member.id]: 'original-photo' }, r: () => 'original-photo',
      ye: false, Oe: () => false, Se: { current: false }, se: value => { busy = value; },
      $e: value => { completed = value; }, ie() {}, Fe() {},
      fe: update => { states = update(states); }, le: message => messages.push(message),
      r4: async () => ({ dataUrl: 'new-photo' }), j: 'test-model', he: 'test-note', U: 'test-preset', X: 'test-background',
      m: async () => { await pending; if (result instanceof Error) throw result; return result; },
      p: 5, h: message => messages.push(message)
    });
    const execution = fn();
    await Promise.resolve();
    assert.equal(completed, 0, 'batch completion does not precede server response');
    assert.notEqual(states[member.id], 'done');
    release();
    await execution;
    assert.equal(completed, result === true ? 1 : 0);
    assert.equal(states[member.id], result === true ? 'done' : 'error');
    assert.equal(busy, false);
    assert.ok(messages.some(message => message.includes(result === true ? '성공 1명, 실패 0명' : '성공 0명, 실패 1명')));
  }
  const batchReset = extract('I=async()=>{if(M)return;se(!0);let L=0,kfFailed=0;', ',me=Te>0?', 'I='.length);
  for (const success of [false, true]) {
    let states = {}, busy = false;
    const messages = [];
    const fn = vm.runInNewContext(`(${batchReset})`, {
      M: false, se: value => { busy = value; }, Me: [member], Oe: () => true,
      m: async () => success, fe: update => { states = update(states); },
      p: 5, le: message => messages.push(message), h: message => messages.push(message)
    });
    await fn();
    assert.equal(busy, false);
    assert.equal(states[member.id], success ? 'done' : 'error');
    assert.ok(messages.some(message => message.includes(success ? '성공 1명, 실패 0명' : '성공 0명, 실패 1명')));
  }
  assert.ok(output.includes('return{id:ae.id,directoryId:ae.directoryId||null}'), 'signup returns actual identifiers');
  if (output.includes('async function jt(xe) {')) {
    const start = output.indexOf('async function jt(xe) {');
    const submitCode = output.slice(start, output.indexOf('\n}', start) + 2);
    for (const directoryId of [null, 'alumni-5-3']) for (const success of [false, true]) {
      const writes = [], errors = [], destinations = [];
      class PhotoFile { constructor() { this.size = 1; } }
      const account = { id: 'new-signup-uuid', directoryId };
      const submit = vm.runInNewContext(`(${submitCode})`, {
        kfCardSubmitLock: { current: false }, Xe: false, kfCardBusy: false,
        Ke: text => errors.push(text), p: '5', Qy: [5], u: null,
        kfCardJoined: { current: account }, je: 'password', Ie: 'password', Ee() {},
        File: PhotoFile, FormData: class { get() { return new PhotoFile(); } },
        m: async () => 'confirmed-profile-photo', ue: '업종', Se: '', L: '', Te: '', Oe: '',
        kfPersistRegistrationCard: async () => {}, kfCard: undefined,
        kfPhotoConfirm: async (...args) => { writes.push(args); return success; },
        r() {}, s: cohort => destinations.push(cohort)
      });
      await submit({ preventDefault() {}, currentTarget: {} });
      assert.equal(writes[0][0], directoryId || account.id, 'signup photo targets explicit directory ID or actual account ID');
      assert.equal(writes[0][1], 'confirmed-profile-photo');
      assert.equal(destinations.length, success ? 1 : 0, 'failed profile save does not finish signup UI');
      if (!success) assert.match(errors.at(-1), /가입은 완료되었지만 프로필 사진을 서버에 저장하지 못했습니다/);
    }
  } else {
    assert.ok(output.includes('kfJoined?.directoryId||kfJoined?.id'), 'signup photo uses explicit identifiers');
    assert.ok(output.includes('가입은 완료되었지만 사진을 서버에 저장하지 못했습니다.'), 'signup and photo save failures are distinct');
  }
  const signupCode = extract('async signup(f,j=!1){', ',async login(', 0);
  let accountState = { accounts: [{ id: 'alumni-5-3', name: '동명이인', cohort: '5', email: 'existing@example.test' }], history: [] };
  let serial = 0;
  const signup = vm.runInNewContext(`({${signupCode}}).signup`, {
    a: accountState, i: update => { accountState = update(accountState); },
    p: text => ({ text }), Nu: async () => 'test-hash', crypto: { randomUUID: () => `new-uuid-${++serial}` }
  });
  const joined = await signup({ name: '동명이인', email: 'new@example.test', password: 'password', cohort: '5', note: '가입 확인', reviewConsent: true, mallUrl: 'https://example.test/shop' }, true);
  assert.match(joined.id, /^new-uuid-/);
  assert.notEqual(joined.id, 'alumni-5-3');
  assert.equal(joined.directoryId, null, 'same name/cohort alone does not create a photo binding');
  assert.equal(accountState.session, joined.id);
  assert.ok(accountState.accounts.some(account => account.id === joined.id));
  assert.equal(accountState.accounts.find(account => account.id === joined.id).minihompy.profileImage, undefined, 'signup does not optimistically store an unconfirmed photo');
  assert.equal((output.match(/\bRs\(/g) || []).length, 2, 'all photo callers now use one checked helper plus central definition');
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8'), source, 'tests must not modify the HTML');
  console.log('photo caller guards: permission, server rejection, delayed ACK, UI lock, URL forms, single/batch AI save and reset, signup identifiers passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
