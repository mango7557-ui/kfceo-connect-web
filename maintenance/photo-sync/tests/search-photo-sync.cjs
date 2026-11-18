// Exercise the actual deployed search modal and photo resolver without a browser.
// Usage: node tests/search-photo-sync.cjs [path/to/index.html]
//        node tests/search-photo-sync.cjs --baseline
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const checkout = path.resolve(__dirname, '../../..');
const baseline = process.argv.includes('--baseline');
const previewReaders = process.argv.includes('--preview-readers');
const requestedPath = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const sourcePath = path.resolve(requestedPath && !baseline
  ? requestedPath
  : path.join(checkout, 'index.html'));
let html = baseline
  ? execFileSync('git', ['-C', checkout, 'show', 'fe725b1:index.html'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : fs.readFileSync(sourcePath, 'utf8');
if (previewReaders) html = require('../patch-photo-readers.cjs').patchPhotoReaders(html).html;
if (process.argv.includes('--preview-images')) html = require('../patch-photo-images.cjs').patchPhotoImages(html).html;

function boundedSource(startToken, endToken, startAt = 0) {
  const start = html.indexOf(startToken, startAt);
  assert.notEqual(start, -1, `Missing source marker: ${startToken}`);
  const end = html.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing source marker: ${endToken}`);
  return html.slice(start, end);
}

const resolverSource = boundedSource('const No=A=>', 'function fc()');
const helperSource = html.includes('function memberPhotoKey(')
  ? boundedSource('function memberPhotoKey(', 'function n4(')
  : '';
const modalSource = boundedSource('A==="search"&&', ',A==="album"&&');
const mainMember = { id: 'member-5-1', name: '민서윤', cohort: 5, title: '대표', company: '가상기업', photo: '/original-one.jpg' };
const otherMember = { id: 'member-6-2', name: '한도윤', cohort: 6, title: '대표', company: '테스트기업', photo: '/original-two.jpg' };
const members = [mainMember, otherMember];
const SharedMemberImage = Symbol('SharedMemberImage');
const imageSubscriptions = [];
const jsx = (type, props, key) => {
  if (type === SharedMemberImage) {
    imageSubscriptions.push(props.memberId);
    return props.src
      ? { type: 'img', props, key }
      : { type: 'span', props: { children: props.fallback }, key };
  }
  return { type, props: props || {}, key };
};
const noop = () => {};
const context = vm.createContext({
  t: { jsx, jsxs: jsx, Fragment: 'Fragment' },
  SharedMemberImage,
  A: 'search', ae: '민서윤', sn: '전체',
  // Rt deliberately holds old source photos; Xl is the profile-aware collection.
  Rt: members.map(member => ({ ...member })),
  Xl: members.map(member => ({ ...member })),
  s: { accounts: [{ id: 'account-1', directoryId: mainMember.id, name: mainMember.name,
    minihompy: { profileImage: '/account-one.jpg' } }] },
  $o: { [mainMember.id]: '/uploaded-one.jpg' },
  lm: [['사무총장', mainMember.name]],
  pn: [['사무국', mainMember.name]],
  Ii: [], vu: [],
  xi: 'PersonIcon', Ra: 'CommitteeIcon', Ur: 'SearchInput', Lt: 'PeopleIcon',
  Ue: 'Badge', Ut: 'ChevronIcon', Cm: 'NewsIcon', Ui: 'CalendarIcon', Xn: 'EmptyState', co: 'SearchIcon',
  X: noop, Tt: noop, dn: noop, Ct: noop, Hn: noop, Tn: noop, Le: noop, Co: noop, He: noop, ye: noop,
});
vm.runInContext(helperSource + resolverSource, context, { timeout: 1000 });
const renderModal = new vm.Script(`(${modalSource})`);

function walk(node, predicate, result = []) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, predicate, result);
  } else if (node && typeof node === 'object') {
    if (predicate(node)) result.push(node);
    walk(node.props?.children, predicate, result);
  }
  return result;
}
function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'object') return textContent(node.props?.children);
  return String(node);
}
function searchRows() {
  const tree = renderModal.runInContext(context, { timeout: 1000 });
  return walk(tree, node => node.type === 'button').filter(node =>
    /개인 미니홈피 바로가기|총동문회 집행부 · 미니홈피 연동|16개 위원회 전용 카페 바로가기/.test(textContent(node)));
}
function renderedPhotos() {
  return searchRows().map(row => walk(row, node => node.type === 'img').map(img => img.props.src));
}

// All matching surfaces must prefer the uploaded shared photo over baked-in and account photos.
assert.equal(searchRows().length, 3, 'Expected member, executive, and committee search results');
assert.deepEqual(renderedPhotos(), [['/uploaded-one.jpg'], ['/uploaded-one.jpg'], ['/uploaded-one.jpg']],
  'Member, executive, and committee results must use the same uploaded photo');

// A live shared-photo update must affect an already-open search on its next render.
context.$o = { [mainMember.id]: '/uploaded-new.jpg' };
assert.deepEqual(renderedPhotos(), [['/uploaded-new.jpg'], ['/uploaded-new.jpg'], ['/uploaded-new.jpg']],
  'Shared photo updates must be reflected across the complete search result');

// Use the linked account fallback when the shared photo is absent, then the directory fallback.
context.$o = {};
assert.deepEqual(renderedPhotos(), [['/account-one.jpg'], ['/account-one.jpg'], ['/account-one.jpg']]);
context.s = { accounts: [] };
assert.deepEqual(renderedPhotos(), [['/original-one.jpg'], ['/original-one.jpg'], ['/original-one.jpg']]);

// Profile-aware names must be searchable even when the original Rt data has an older name.
context.Xl = members.map(member => ({ ...member, name: member.id === mainMember.id ? '변경된이름' : member.name }));
context.ae = '변경된이름';
assert.equal(searchRows().length, 1, 'Search should use current shared profile names');
assert.equal(textContent(searchRows()[0]).includes('변경된이름'), true);
assert.equal(walk(renderModal.runInContext(context, { timeout: 1000 }), node => node.type === 'EmptyState').length, 0,
  'Current profile matches must not also display an empty-state message');

// Missing photos preserve the appropriate icon instead of producing a broken image.
context.Rt = members.map(member => ({ ...member, photo: '' }));
context.Xl = members.map(member => ({ ...member, photo: '' }));
context.ae = mainMember.name;
imageSubscriptions.length = 0;
const emptyRows = searchRows();
assert.equal(emptyRows.length, 3);
if (html.includes('t.jsx(SharedMemberImage,')) {
  assert.deepEqual(imageSubscriptions, [mainMember.id, mainMember.id, mainMember.id],
    'All three results must mount their photo subscriber even before a photo exists');
}
assert.deepEqual(renderedPhotos(), [[], [], []]);
assert.equal(walk(emptyRows[0], node => node.type === 'PersonIcon').length, 1);
assert.equal(walk(emptyRows[1], node => node.type === 'PersonIcon').length, 1);
assert.equal(walk(emptyRows[2], node => node.type === 'CommitteeIcon').length, 1);

// Stable IDs must distinguish different people with the same name.
context.Rt = members.map(member => ({ ...member }));
context.Xl = members.map(member => ({ ...member, name: mainMember.name }));
context.$o = { [mainMember.id]: '/same-name-first.jpg', [otherMember.id]: '/same-name-second.jpg' };
const byId = vm.runInContext(`No(${JSON.stringify(otherMember.id)})`, context, { timeout: 1000 });
assert.equal(byId.id, otherMember.id);
assert.equal(byId.photo, '/same-name-second.jpg', 'ID lookup must not select a namesake photo');
const duplicateRows = searchRows();
assert.equal(duplicateRows.length, 4);
assert.equal(walk(duplicateRows[0], node => node.type === 'img')[0].props.src, '/same-name-first.jpg');
assert.equal(walk(duplicateRows[1], node => node.type === 'img')[0].props.src, '/same-name-second.jpg');

console.log('PASS search photo sync: uploaded photos, live updates, account/source fallbacks, current profiles, missing photos, stable IDs');
