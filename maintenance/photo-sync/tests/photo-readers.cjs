// Tests actual HTML helpers and the minihompy's actual member-selection expression.
// --preview-readers applies the guarded reader patch in memory; it never writes the HTML.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const requested = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const sourcePath = requested ? path.resolve(requested) : path.resolve(__dirname, '../../../index.html');
let html = fs.readFileSync(sourcePath, 'utf8');
if (process.argv.includes('--preview-readers')) html = require('../patch-photo-readers.cjs').patchPhotoReaders(html).html;
function sourceBetween(start, end) {
  const a = html.indexOf(start);
  assert.notEqual(a, -1, `Missing ${start}`);
  const b = html.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `Missing ${end}`);
  return html.slice(a, b);
}
const directory = [
  { id: 'alumni-5-3', cohort: 5, no: 3, name: '가상동문', photo: '/original-first.jpg' },
  { id: 'alumni-5-4', cohort: 5, no: 4, name: '가상동문', photo: '/original-second.jpg' },
  { id: 'alumni-6-1', cohort: 6, no: 1, name: '유일동문', photo: '/original-third.jpg' },
];
const accounts = [
  { id: 'new-uuid', name: '가상동문', cohort: 5, minihompy: { profileImage: '/stale-new.jpg' } },
  { id: 'linked-uuid', directoryId: 'alumni-5-3', name: '가상동문', cohort: 5, minihompy: { profileImage: '/stale-linked.jpg' } },
  { id: 'alumni-5-4', directoryId: 'alumni-5-4', name: '가상동문', cohort: 5, minihompy: { profileImage: '/stale-second.jpg' } },
];
const context = vm.createContext({
  Rt: directory, Ma: {}, accounts, photos: {}, input: null,
  window: { location: { protocol: 'https:', pathname: '/', search: '' } },
  URLSearchParams, Gn: null, s: { accounts, account: accounts[0] },
});
vm.runInContext(sourceBetween('function memberPhotoKey(', 'function Gv('), context, { timeout: 1000 });
function photo(input, photos) {
  context.input = input;
  context.photos = photos;
  return vm.runInContext('resolveSharedMemberPhoto(input,accounts,photos)', context, { timeout: 1000 });
}
function identity(input) {
  context.input = input;
  return vm.runInContext('resolveMinihompyMember(input,accounts)', context, { timeout: 1000 });
}

const current = {
  'alumni-5-3': '/latest-first.jpg', 'alumni-5-4': '/latest-second.jpg', 'new-uuid': '/latest-new.jpg',
};
assert.equal(photo('alumni-5-3', current), '/latest-first.jpg');
assert.equal(photo('linked-uuid', current), '/latest-first.jpg', 'A linked account must use its directory ID photo');
assert.equal(photo(accounts[1], current), '/latest-first.jpg');
assert.equal(photo('c5-3', current), '/latest-first.jpg', 'Legacy links must resolve to the canonical ID');
assert.equal(photo('alumni-5-3', { 'c5-3': '/legacy.jpg' }), '/legacy.jpg', 'Legacy stored photo aliases remain readable');
assert.equal(photo('alumni-5-4', current), '/latest-second.jpg', 'Namesakes must retain distinct photos');
assert.equal(photo('new-uuid', current), '/latest-new.jpg', 'A new UUID must never infer a directory link from name');
assert.equal(photo(accounts[0], current), '/latest-new.jpg');
assert.equal(photo('linked-uuid', {}), '/stale-linked.jpg', 'Preexisting account photos remain a fallback before a shared upload');

const reset = { 'alumni-5-3': '', 'linked-uuid': '/older-alias.jpg', 'c5-3': '/older-legacy.jpg' };
assert.equal(photo('linked-uuid', reset), '/original-first.jpg', 'A canonical reset must defeat stale account and alias photos');
assert.equal(photo('new-uuid', { 'new-uuid': '' }), '', 'A new member reset must not revive a local photo');

assert.equal(identity('linked-uuid').directory.id, 'alumni-5-3');
assert.equal(identity('linked-uuid').account.id, 'linked-uuid');
assert.equal(identity('new-uuid').directory, null, 'Same name and cohort are insufficient to link a new account');
assert.equal(identity('new-uuid').account.id, 'new-uuid');
assert.equal(identity('c5-3').directory.id, 'alumni-5-3');
assert.equal(identity('가상동문').directory, null, 'Ambiguous old name links must not select the first person');
assert.equal(identity('가상동문').account, null);
assert.equal(identity('유일동문').directory.id, 'alumni-6-1');

for (const url of ['https://kfceo.kr/alumni-photos/p.jpg?v=42', 'https://cdn.example/p.jpg?signature=abc#crop', 'data:image/png;base64,AA==', 'blob:https://kfceo.kr/example']) {
  context.upload = url;
  assert.equal(vm.runInContext('n4(upload,"/old.jpg")', context), url, 'An uploaded URL must beat the static fallback without losing its query');
}
context.upload = 'alumni-photos/p.jpg?v=42';
assert.equal(vm.runInContext('n4(upload,"/old.jpg")', context), '/alumni-photos/p.jpg?v=42');
assert.equal(vm.runInContext('n4("","/old.jpg?v=9")', context), '/old.jpg?v=9');

// Evaluate the real initial _o() body: invalid explicit links must not silently show
// the signed-in account or the first member, and UUID links must keep their own identity.
const intro = sourceBetween('function _o(){', 'if(!F)return');
vm.runInContext(intro + 'return {directory:N,account:F};}', context, { timeout: 1000 });
function openMinihompy(member) {
  context.window.location.search = '?member=' + encodeURIComponent(member);
  return vm.runInContext('_o()', context, { timeout: 1000 });
}
assert.equal(openMinihompy('linked-uuid').directory.id, 'alumni-5-3');
assert.equal(openMinihompy('linked-uuid').account.id, 'linked-uuid');
assert.equal(openMinihompy('new-uuid').directory, null);
assert.equal(openMinihompy('new-uuid').account.id, 'new-uuid');
assert.equal(openMinihompy('alumni-5-4').account.id, 'alumni-5-4');
assert.equal(openMinihompy('가상동문').account, null);
assert.equal(openMinihompy('unknown-uuid').account, null, 'An invalid explicit ID must not switch to a different member');

console.log('PASS photo readers: stable IDs, linked/new UUIDs, legacy aliases, resets, namesakes, URL queries, actual minihompy selection');
