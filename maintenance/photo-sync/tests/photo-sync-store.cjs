const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'photo-sync-store.js'), 'utf8');
const PHOTOS = 'memberPhotos', PROFILES = 'memberProfiles';
const PHOTO_CACHE = 'photo-cache', PROFILE_CACHE = 'profile-cache';
const ID = 'alumni-1-1', PHOTO = `${PHOTOS}/${ID}`;
const clone = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    emit(type, event = {}) { for (const callback of listeners.get(type) || []) callback(event); }
  };
}

function makeHarness({ photos = {}, profiles = {}, configured = true, intersection = true } = {}) {
  const storage = new Map([[PHOTO_CACHE, JSON.stringify(photos)], [PROFILE_CACHE, JSON.stringify(profiles)]]);
  const localWrites = [], requests = [], subscriptions = [], channels = [], observers = [];
  const realtime = new Map(), timers = new Map();
  let nextTimer = 0, now = 0, rendering = null;
  const window = eventTarget(), document = { ...eventTarget(), hidden: false };
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) { storage.set(key, value); localWrites.push({ key, value: JSON.parse(value) }); }
  };
  function timer(callback, delay, interval = false) {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay, interval: interval ? delay : 0 });
    return id;
  }
  function advance(milliseconds) {
    const until = now + milliseconds;
    while (true) {
      const due = [...timers].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, item] = due;
      now = item.at;
      if (item.interval) item.at += item.interval;
      else timers.delete(id);
      item.callback();
    }
    now = until;
  }
  function fakeFetch(url, options) {
    assert.match(url, /^https:\/\/test\.invalid\//, 'Network access is replaced with a fake');
    const reference = decodeURIComponent(new URL(url).pathname.slice(1).replace(/\.json$/, ''));
    assert.notEqual(reference, PHOTOS, 'Downloading the entire photo collection is forbidden');
    return new Promise((resolve, reject) => {
      const request = {
        path: reference, method: options.method, signal: options.signal, done: false,
        body: options.body === undefined ? undefined : JSON.parse(options.body),
        respond(body, status = 200) {
          assert.equal(this.done, false); this.done = true;
          resolve({ ok: status >= 200 && status < 300, status, json: async () => clone(body) });
        },
        fail(error = new Error('Network unavailable')) { assert.equal(this.done, false); this.done = true; reject(error); }
      };
      requests.push(request);
      options.signal.addEventListener('abort', () => {
        if (!request.done) { request.done = true; reject(new DOMException('Aborted', 'AbortError')); }
      }, { once: true });
    });
  }
  class FakeBroadcastChannel {
    constructor(name) { this.name = name; this.messages = []; Object.assign(this, eventTarget()); channels.push(this); }
    postMessage(value) { this.messages.push(clone(value)); }
  }
  class FakeIntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.elements = []; this.disconnected = false; observers.push(this); }
    observe(element) { this.elements.push(element); }
    disconnect() { this.disconnected = true; }
    intersect(isIntersecting) { this.callback(this.elements.map(target => ({ target, isIntersecting }))); }
  }
  const sandbox = {
    console, URL, AbortController, DOMException, window, document, localStorage,
    setTimeout: (fn, delay) => timer(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => timer(fn, delay, true), clearInterval: id => timers.delete(id),
    BroadcastChannel: FakeBroadcastChannel, fetch: fakeFetch,
    W1: PHOTO_CACHE, J1: PROFILE_CACHE, zv: PHOTOS, Dv: PROFILES, Mv: 'test-photos', Ll: configured,
    Au: { databaseURL: 'https://test.invalid/' }, W3: ['name', 'company', 'brand', 'address'],
    J3: key => JSON.parse(localStorage.getItem(key) || '{}'),
    zu: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    By: loader => loader(), d8: { initializeApp: () => ({}), getApps: () => [] },
    sN: {
      getDatabase: () => ({}), ref: (_database, reference) => reference,
      child: (reference, id) => `${reference}/${id}`,
      onValue(reference, callback, error) {
        assert.notEqual(reference, PHOTOS, 'Subscribing to the entire photo collection is forbidden');
        const listener = { reference, callback, error, stopped: false };
        subscriptions.push(listener);
        if (!realtime.has(reference)) realtime.set(reference, new Set());
        realtime.get(reference).add(listener);
        return () => { listener.stopped = true; realtime.get(reference).delete(listener); };
      }
    },
    z: { useRef: () => ({ current: rendering.element }), useEffect: callback => rendering.effects.push(callback) },
    t: { jsx: (type, props) => ({ type, props }) }
  };
  if (intersection) sandbox.IntersectionObserver = FakeIntersectionObserver;
  const context = vm.createContext(sandbox);
  vm.runInContext(source + `
    globalThis.__store = {
      savePhoto: Rs, saveProfile: Iv, refresh: refreshSharedData,
      watch: watchMemberPhoto, refreshMember: refreshMemberPhoto, Image: SharedMemberImage,
      photos: () => Ma, profiles: () => Do, status: () => Fu,
      subscribePhotos: callback => g1.add(callback)
    };
  `, context, { filename: 'photo-sync-store.js' });
  const store = context.__store;
  const pendingAll = (method, reference) => requests.filter(item => !item.done && item.method === method && item.path === reference);
  function pending(method, reference) {
    const matches = pendingAll(method, reference);
    assert.equal(matches.length, 1, `Expected one pending ${method} ${reference}; got ${matches.length}`);
    return matches[0];
  }
  async function answerRefresh(photoValues = {}, profileValues = {}) {
    const active = requests.filter(item => !item.done && item.method === 'GET');
    assert.ok(active.length, 'Expected pending server reads');
    for (const item of active) item.respond(item.path === PROFILES ? profileValues : photoValues[item.path.slice(PHOTOS.length + 1)] ?? null);
    await settle();
  }
  async function boot() {
    await settle();
    if (configured) { pending('GET', PROFILES).respond(profiles); await settle(); }
    localWrites.length = 0;
  }
  function emit(reference, value) {
    const listeners = realtime.get(reference);
    assert.ok(listeners?.size, `No active realtime listener for ${reference}`);
    for (const listener of listeners) listener.callback({ val: () => clone(value) });
  }
  async function watch(value = null, id = ID) {
    const stop = store.watch(id); await settle();
    pending('GET', `${PHOTOS}/${id}`).respond(value); await settle();
    localWrites.length = 0; return stop;
  }
  function renderImage(props) {
    const render = { element: {}, effects: [] }; rendering = render;
    const output = store.Image(props), cleanups = render.effects.map(effect => effect()); rendering = null;
    return { output, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
  }
  return { store, requests, subscriptions, realtime, pending, pendingAll, answerRefresh, boot, watch, emit,
    advance, window, document, localWrites, storage, channels, observers, renderImage,
    photos: () => clone(store.photos()), profiles: () => clone(store.profiles()) };
}

test('server acknowledgement precedes local photo/cache/subscriber/broadcast changes', async () => {
  const h = makeHarness({ photos: { [ID]: 'old.jpg' } }); await h.boot();
  const events = []; h.store.subscribePhotos(value => events.push(clone(value)));
  const saving = h.store.savePhoto(ID, 'new.jpg'); await settle();
  assert.equal(h.photos()[ID], 'old.jpg'); assert.equal(h.localWrites.length, 0); assert.equal(events.length, 0);
  h.pending('PUT', PHOTO).respond('new.jpg'); assert.equal((await saving).cloud, true);
  assert.equal(h.photos()[ID], 'new.jpg'); assert.equal(events.length, 1);
  assert.equal(JSON.parse(h.storage.get(PHOTO_CACHE))[ID], 'new.jpg');
  assert.deepEqual(h.channels[0].messages, [{ type: 'shared-record-saved', kind: PHOTOS, id: ID }]);
  const invalidation = JSON.parse(h.storage.get('kfc-shared-record-saved-v2'));
  assert.equal(invalidation.kind, PHOTOS); assert.equal(invalidation.id, ID); assert.equal(typeof invalidation.stamp, 'number');
});
for (const failure of ['http', 'network', 'mismatched acknowledgement']) {
  test(`${failure} failure preserves the previously confirmed photo`, async () => {
    const h = makeHarness({ photos: { [ID]: 'confirmed.jpg' } }); await h.boot();
    const saving = h.store.savePhoto(ID, 'unconfirmed.jpg'); await settle(); const request = h.pending('PUT', PHOTO);
    if (failure === 'network') request.fail();
    else request.respond(failure === 'http' ? null : 'different.jpg', failure === 'http' ? 403 : 200);
    const result = await saving; assert.equal(result.cloud, false); assert.ok(result.error);
    assert.equal(h.photos()[ID], 'confirmed.jpg'); assert.equal(h.localWrites.length, 0); assert.equal(h.channels[0].messages.length, 0);
  });
}
test('request timeout aborts after 15 seconds and does not save locally', async () => {
  const h = makeHarness({ photos: { [ID]: 'confirmed.jpg' } }); await h.boot();
  const saving = h.store.savePhoto(ID, 'unconfirmed.jpg'); await settle();
  const request = h.pending('PUT', PHOTO); h.advance(15000); await settle(); const result = await saving;
  assert.equal(request.signal.aborted, true); assert.equal(result.cloud, false); assert.equal(result.error.name, 'AbortError');
  assert.equal(h.photos()[ID], 'confirmed.jpg'); assert.equal(h.localWrites.length, 0);
});
test('legacy and canonical IDs share a sequential write queue', async () => {
  const h = makeHarness(); await h.boot();
  const first = h.store.savePhoto('c1-1', 'first.jpg'), second = h.store.savePhoto(ID, 'second.jpg'); await settle();
  assert.equal(h.requests.filter(item => item.method === 'PUT').length, 1);
  h.pending('PUT', PHOTO).respond('first.jpg'); assert.equal((await first).cloud, true); await settle();
  const next = h.pending('PUT', PHOTO); assert.equal(next.body, 'second.jpg'); next.respond('second.jpg');
  assert.equal((await second).cloud, true); assert.equal(h.photos()[ID], 'second.jpg'); assert.equal(Object.hasOwn(h.photos(), 'c1-1'), false);
});
test('a failed write does not block the next write for that member', async () => {
  const h = makeHarness(); await h.boot();
  const first = h.store.savePhoto(ID, 'failed.jpg'), second = h.store.savePhoto(ID, 'saved.jpg'); await settle();
  h.pending('PUT', PHOTO).respond(null, 500); assert.equal((await first).cloud, false); await settle();
  h.pending('PUT', PHOTO).respond('saved.jpg'); assert.equal((await second).cloud, true); assert.equal(h.photos()[ID], 'saved.jpg');
});
test('reset and a missing server record retain empty-string tombstones', async () => {
  const h = makeHarness({ photos: { [ID]: 'old.jpg' } }); await h.boot(); await h.watch('old.jpg');
  const saving = h.store.savePhoto('c1-1', '   '); await settle();
  const request = h.pending('PUT', PHOTO); assert.equal(request.body, ''); request.respond('');
  assert.equal((await saving).cloud, true); assert.equal(h.photos()[ID], ''); h.emit(PHOTO, null);
  assert.equal(Object.hasOwn(h.photos(), ID), true); assert.equal(h.photos()[ID], ''); assert.equal(JSON.parse(h.storage.get(PHOTO_CACHE))[ID], '');
});
test('member realtime updates notify subscribers and persist the authoritative photo', async () => {
  const h = makeHarness(); await h.boot(); await h.watch(); const events = [];
  h.store.subscribePhotos(value => events.push(clone(value))); h.emit(PHOTO, 'other-device.jpg');
  assert.equal(h.photos()[ID], 'other-device.jpg'); assert.equal(events.length, 1); assert.equal(JSON.parse(h.storage.get(PHOTO_CACHE))[ID], 'other-device.jpg');
});
test('late REST responses cannot replace newer realtime values for the same member or profiles', async () => {
  const h = makeHarness(); await h.boot(); await h.watch(); const refreshing = h.store.refresh(); await settle();
  h.emit(PHOTO, 'realtime.jpg'); h.emit(PROFILES, { [ID]: { company: 'Realtime' } });
  await h.answerRefresh({ [ID]: 'stale.jpg' }, { [ID]: { company: 'Stale' } }); await refreshing;
  assert.equal(h.photos()[ID], 'realtime.jpg'); assert.equal(h.profiles()[ID].company, 'Realtime');
});
test('another member update does not suppress this member pending REST result', async () => {
  const h = makeHarness(); await h.boot(); await h.watch(); await h.watch(null, 'alumni-2-2');
  const refreshing = h.store.refresh(); await settle(); h.emit(`${PHOTOS}/alumni-2-2`, 'other-member.jpg');
  await h.answerRefresh({ [ID]: 'this-member.jpg', 'alumni-2-2': 'stale-other.jpg' }); await refreshing;
  assert.equal(h.photos()[ID], 'this-member.jpg'); assert.equal(h.photos()['alumni-2-2'], 'other-member.jpg');
});
test('late save acknowledgement cannot replace newer realtime state', async () => {
  const h = makeHarness(); await h.boot(); await h.watch(); const saving = h.store.savePhoto(ID, 'submitted.jpg'); await settle();
  h.emit(PHOTO, 'newer-server.jpg'); h.pending('PUT', PHOTO).respond('submitted.jpg');
  assert.equal((await saving).cloud, true); assert.equal(h.photos()[ID], 'newer-server.jpg');
});
test('obsolete BroadcastChannel complete maps are ignored and watched IDs revalidate', async () => {
  const h = makeHarness(); await h.boot(); await h.watch('current.jpg');
  h.channels[0].emit('message', { data: { type: 'photos', photos: { [ID]: 'obsolete.jpg' }, value: { [ID]: 'obsolete.jpg' } } }); await settle();
  assert.equal(h.photos()[ID], 'current.jpg'); assert.equal(h.localWrites.length, 0);
  await h.answerRefresh({ [ID]: 'authoritative.jpg' }); assert.equal(h.photos()[ID], 'authoritative.jpg');
});
for (const oldFirst of [true, false]) {
  test(`a newer member request wins when the old request finishes ${oldFirst ? 'first' : 'last'}`, async () => {
    const h = makeHarness(); await h.boot(); await h.watch('initial.jpg');
    const older = h.store.refreshMember(ID); await settle(); const oldRequest = h.pending('GET', PHOTO);
    h.channels[0].emit('message', { data: { type: 'shared-record-saved', kind: PHOTOS, id: ID } }); await settle();
    const newRequest = h.pendingAll('GET', PHOTO).find(item => item !== oldRequest); assert.ok(newRequest);
    if (oldFirst) { oldRequest.respond('stale.jpg'); await settle(); newRequest.respond('fresh.jpg'); }
    else { newRequest.respond('fresh.jpg'); await settle(); oldRequest.respond('stale.jpg'); }
    await older; await settle(); assert.equal(h.photos()[ID], 'fresh.jpg');
  });
}
test('Firebase reconnect and online events refetch only watched members', async () => {
  const h = makeHarness(); await h.boot(); await h.watch('cached.jpg');
  h.emit('.info/connected', false); assert.equal(h.store.status(), 'connecting');
  h.emit('.info/connected', true); await settle(); await h.answerRefresh({ [ID]: 'reconnected.jpg' }); assert.equal(h.photos()[ID], 'reconnected.jpg');
  h.window.emit('online'); await settle(); await h.answerRefresh({ [ID]: 'online.jpg' }); assert.equal(h.photos()[ID], 'online.jpg');
});
test('cache storage events are ignored, while confirmed-save and visible-tab events revalidate', async () => {
  const h = makeHarness(); await h.boot(); await h.watch('current.jpg');
  const count = h.requests.length;
  h.window.emit('storage', { key: PHOTO_CACHE, newValue: JSON.stringify({ [ID]: 'stale.jpg' }) }); await settle();
  h.window.emit('storage', { key: PROFILE_CACHE, newValue: '{}' }); await settle();
  assert.equal(h.photos()[ID], 'current.jpg'); assert.equal(h.requests.length, count, 'Cache writes must not start cross-tab request loops');
  h.window.emit('storage', { key: 'kfc-shared-record-saved-v2', newValue: JSON.stringify({ kind: PHOTOS, id: ID, stamp: 1 }) }); await settle();
  await h.answerRefresh({ [ID]: 'server.jpg' });
  h.document.emit('visibilitychange'); await settle(); await h.answerRefresh({ [ID]: 'visible.jpg' }); assert.equal(h.photos()[ID], 'visible.jpg');
});
test('concurrent profile field PATCH writes preserve both acknowledged edits', async () => {
  const h = makeHarness({ profiles: { [ID]: { company: 'Old company', address: 'Old address' } } }); await h.boot();
  const first = h.store.saveProfile('c1-1', { company: 'New company' }), second = h.store.saveProfile(ID, { address: 'New address' }); await settle();
  const firstRequest = h.pending('PATCH', `${PROFILES}/${ID}`); firstRequest.respond(firstRequest.body); assert.equal((await first).cloud, true); await settle();
  const secondRequest = h.pending('PATCH', `${PROFILES}/${ID}`); assert.equal(Object.hasOwn(secondRequest.body, 'company'), false);
  secondRequest.respond(secondRequest.body); assert.equal((await second).cloud, true);
  assert.equal(h.profiles()[ID].company, 'New company'); assert.equal(h.profiles()[ID].address, 'New address');
});
test('save acknowledgement invalidates an earlier GET and performs a new member read', async () => {
  const h = makeHarness(); await h.boot(); await h.watch('old.jpg');
  const refreshing = h.store.refresh(); await settle(); const oldRequest = h.pending('GET', PHOTO);
  const saving = h.store.savePhoto(ID, 'new.jpg'); await settle(); h.pending('PUT', PHOTO).respond('new.jpg'); assert.equal((await saving).cloud, true); await settle();
  const newRequest = h.pendingAll('GET', PHOTO).find(item => item !== oldRequest); assert.ok(newRequest);
  oldRequest.respond('old.jpg'); h.pending('GET', PROFILES).respond({}); await refreshing;
  assert.equal(h.photos()[ID], 'new.jpg'); newRequest.respond('new.jpg'); await settle(); assert.equal(h.photos()[ID], 'new.jpg');
});
test('partial refresh failure is not reported as fully synced', async () => {
  const h = makeHarness(); await h.boot(); await h.watch(); const refreshing = h.store.refresh(); await settle();
  h.pending('GET', PHOTO).respond(null, 503); h.pending('GET', PROFILES).respond({}); await refreshing; assert.equal(h.store.status(), 'error');
});
test('startup, watches and reconnect never read or subscribe to the photos root', async () => {
  const h = makeHarness(); await h.boot(); assert.deepEqual(h.requests.map(item => item.path), [PROFILES]);
  await h.watch(); h.window.emit('online'); await settle(); await h.answerRefresh({ [ID]: 'online.jpg' });
  assert.equal(h.requests.some(item => item.path === PHOTOS), false); assert.equal(h.subscriptions.some(item => item.reference === PHOTOS), false);
});
test('canonical and legacy watchers share one subscription with idempotent reference-counted cleanup', async () => {
  const h = makeHarness(); await h.boot(); const stopFirst = h.store.watch('c1-1'), stopSecond = h.store.watch(ID); await settle();
  assert.equal(h.pendingAll('GET', PHOTO).length, 1); assert.equal(h.subscriptions.filter(item => item.reference === PHOTO).length, 1);
  stopFirst(); assert.equal(h.realtime.get(PHOTO).size, 1); stopFirst(); assert.equal(h.realtime.get(PHOTO).size, 1);
  stopSecond(); assert.equal(h.realtime.get(PHOTO).size, 0); const refreshing = h.store.refresh(); await settle();
  h.pending('GET', PROFILES).respond({}); await refreshing; assert.equal(h.requests.filter(item => item.path === PHOTO).length, 1);
});
test('unmount before Firebase initialization resolves does not leak a subscription', async () => {
  const h = makeHarness(); const stop = h.store.watch(ID); stop(); await settle();
  assert.equal(h.subscriptions.filter(item => item.reference === PHOTO).length, 0);
});
test('serialized photo cache stays within 3 MiB including JSON punctuation and escaping', async () => {
  const budget = 3 * 1024 * 1024;
  const h = makeHarness({ photos: { 'alumni-2-2': 'small.jpg' } }); await h.boot(); await h.watch();
  h.emit(PHOTO, 'x'.repeat(budget / 2 - ID.length));
  assert.ok(h.storage.get(PHOTO_CACHE).length * 2 <= budget, 'JSON overhead must fit the quota');
  h.emit(PHOTO, '\\'.repeat(900000)); assert.ok(h.storage.get(PHOTO_CACHE).length * 2 <= budget, 'JSON escaping must fit the quota');
  assert.equal(h.photos()[ID].length, 900000, 'Cache budget must not truncate an in-memory photo');
  assert.equal(JSON.parse(h.storage.get(PHOTO_CACHE))['alumni-2-2'], 'small.jpg');
});
test('cache eviction preserves the most recently received photos first', async () => {
  const h = makeHarness(); await h.boot(); await h.watch(); await h.watch(null, 'alumni-2-2');
  h.emit(PHOTO, 'a'.repeat(800000)); h.emit(`${PHOTOS}/alumni-2-2`, 'b'.repeat(800000));
  const cached = JSON.parse(h.storage.get(PHOTO_CACHE)); assert.equal(cached['alumni-2-2'].length, 800000); assert.equal(Object.hasOwn(cached, ID), false);
});
test('SharedMemberImage fallback subscribes on visibility and releases on exit/unmount', async () => {
  const h = makeHarness(); await h.boot(); const image = h.renderImage({ memberId: ID, fallback: 'No photo', className: 'avatar' });
  assert.equal(image.output.type, 'span'); assert.equal(image.output.props.children, 'No photo'); assert.equal(h.requests.some(item => item.path === PHOTO), false);
  const observer = h.observers[0]; assert.equal(observer.options.rootMargin, '240px');
  observer.intersect(true); await settle(); h.pending('GET', PHOTO).respond('found.jpg'); await settle();
  assert.equal(h.photos()[ID], 'found.jpg'); assert.equal(h.realtime.get(PHOTO).size, 1);
  observer.intersect(false); assert.equal(h.realtime.get(PHOTO).size, 0); observer.intersect(true); await settle(); assert.equal(h.realtime.get(PHOTO).size, 1);
  image.unmount(); assert.equal(observer.disconnected, true); assert.equal(h.realtime.get(PHOTO).size, 0);
});
test('SharedMemberImage fallback still watches without IntersectionObserver', async () => {
  const h = makeHarness({ intersection: false }); await h.boot(); const image = h.renderImage({ memberId: ID, fallback: 'No photo' }); await settle();
  assert.equal(image.output.type, 'span'); assert.equal(h.pendingAll('GET', PHOTO).length, 1); assert.equal(h.realtime.get(PHOTO).size, 1);
  image.unmount(); assert.equal(h.realtime.get(PHOTO).size, 0);
});
