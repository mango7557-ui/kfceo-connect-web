const fs = require('node:fs');

// Target only existing member-photo JSX. Editorial/gallery and unpublished AI previews stay intact.
function patchPhotoImages(html) {
  const changes = [];
  function positions(needle) {
    const result = [];
    for (let at = html.indexOf(needle); at >= 0; at = html.indexOf(needle, at + needle.length)) result.push(at);
    return result;
  }
  function expect(needle, count, label) {
    const found = positions(needle);
    if (found.length !== count) throw new Error(`${label}: expected ${count} matches, found ${found.length}`);
    return found;
  }
  function callEnd(start) {
    const opening = html.indexOf('(', start);
    if (opening < 0) throw new Error('Missing JSX call opening');
    let depth = 0, quote = '';
    for (let i = opening; i < html.length; i++) {
      const char = html[i];
      if (quote) {
        if (char === '\\') i++;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) return i + 1;
    }
    throw new Error('Unclosed JSX call');
  }
  function imageCall(start, memberId, fallback, patchProps = value => value) {
    const prefix = 't.jsx("img",{';
    if (!html.startsWith(prefix, start)) throw new Error('Expected member image JSX');
    const end = callEnd(start);
    if (html.slice(end - 2, end) !== '})') throw new Error('Unexpected member image props shape');
    const props = patchProps(html.slice(start + prefix.length, end - 2));
    return { end, code: `t.jsx(SharedMemberImage,{memberId:${memberId},${props},fallback:${fallback}})` };
  }
  function conditional(label, marker, memberId, { count = 1, patchProps } = {}) {
    for (const start of expect(marker, count, label).reverse()) {
      const question = html.indexOf('?t.jsx("img",{', start);
      if (question < 0 || question > start + marker.length) throw new Error(`${label}: image condition missing`);
      const imageStart = question + 1;
      const imageEnd = callEnd(imageStart);
      if (html[imageEnd] !== ':' || !html.startsWith('t.jsx', imageEnd + 1)) throw new Error(`${label}: fallback missing`);
      const end = callEnd(imageEnd + 1);
      const fallback = html.slice(imageEnd + 1, end);
      const replacement = imageCall(imageStart, memberId, fallback, patchProps);
      html = html.slice(0, start) + replacement.code + html.slice(end);
    }
    changes.push({ label, count });
  }
  function wrapped(label, marker, member, memberId) {
    const [start] = expect(marker, 1, label);
    const question = html.indexOf('?t.jsx(', start);
    const outerStart = question + 1;
    const outerEnd = callEnd(outerStart);
    if (html[outerEnd] !== ':') throw new Error(`${label}: outer fallback missing`);
    const end = callEnd(outerEnd + 1);
    const fallback = html.slice(outerEnd + 1, end);
    const imageStart = html.indexOf('t.jsx("img",{', outerStart);
    if (imageStart < 0 || imageStart > outerEnd) throw new Error(`${label}: inner image missing`);
    const replacement = imageCall(imageStart, memberId, fallback);
    const outer = html.slice(outerStart, imageStart) + replacement.code + html.slice(replacement.end, outerEnd);
    html = html.slice(0, start) + `${member}?${outer}:${fallback}` + html.slice(end);
    changes.push({ label, count: 1 });
  }
  function preview(label, gate, marker, memberId) {
    const [gateStart] = expect(gate + 't.jsx("div",{className:"alumni-photo-preview-box",', 1, label + ' gate');
    html = html.slice(0, gateStart) + html.slice(gateStart + gate.length);
    const [start] = expect(marker, 1, label);
    const replacement = imageCall(start, memberId, 't.jsx(xi,{size:33})');
    html = html.slice(0, start) + replacement.code + html.slice(replacement.end);
    changes.push({ label, count: 1 });
  }

  conditional('cohort member cards', 'te?t.jsx("img",{src:te,alt:`제${k.cohort}기 ${k.name} 프로필 사진`', 'k.directoryId||k.id', { count: 2 });
  conditional('directory member card', 'me?t.jsx("img",{src:me,alt:`제${I.cohort}기 ${I.name} 프로필 사진`', 'I.directoryId||I.id');
  conditional('committee member card', 'V?t.jsx("img",{src:V,alt:`제${S.cohort}기 ${S.name} 프로필 사진`', 'S.directoryId||S.id');
  conditional('home member card', 'w.photo?t.jsx("img",{src:w.photo,alt:`제${w.cohort}기 ${w.name}`', 'w.directoryId||w.id');
  conditional('search member result', 'O&&O.photo?t.jsx("img",{src:O.photo,alt:O.name,', 'O&&(O.directoryId||O.id)', {
    patchProps: props => props.replace('src:O.photo,alt:O.name,', 'src:O&&O.photo,alt:O?O.name:"",'),
  });
  wrapped('committee chair avatar', 'E!=null&&E.photo?t.jsx("span",{className:"committee-chair-avatar",children:t.jsx("img",{src:E.photo', 'E', 'E.directoryId||E.id');
  wrapped('organization row avatar', 'H!=null&&H.photo?t.jsx("div",{className:"org-row-photo",children:t.jsx("img",{src:H.photo', 'H', 'H.directoryId||H.id');
  conditional('organization president avatar', 'w!=null&&w.photo?t.jsx("img",{src:w.photo,alt:"김인규 총동문회장 프로필 사진"', 'w&&(w.directoryId||w.id)', {
    patchProps: props => props.replace('src:w.photo,', 'src:w&&w.photo,'),
  });
  conditional('organization officer avatar', 'H!=null&&H.photo?t.jsx("img",{src:H.photo,alt:`${T} ${w} 프로필 사진`', 'H&&(H.directoryId||H.id)', {
    patchProps: props => props.replace('src:H.photo,', 'src:H&&H.photo,'),
  });
  conditional('mall member photo', 'B.photo?t.jsx("img",{src:B.photo,alt:`제${B.cohort}기 ${B.name}`', 'B.directoryId||B.id');
  conditional('minihompy hero photo', 'ge?t.jsx("img",{src:ge,alt:`${F.name} 프로필 사진`', '(T&&T.id)||F.directoryId||F.id');
  conditional('my profile avatar', 'resolveSharedMemberPhoto(s.account,s.accounts,$o)?t.jsx("img",{src:resolveSharedMemberPhoto(s.account,s.accounts,$o),', 's.account.directoryId||s.account.id');
  conditional('cohort administrator member photo', 'pt?t.jsx("img",{src:pt,alt:Z.name,', 'Z.directoryId||Z.id');
  conditional('header account avatar', 'E?t.jsx("img",{src:E,alt:""}', 'A&&(A.directoryId||A.id)');
  preview('cohort current-photo editor', 'xt(L.id)&&', 't.jsx("img",{src:xt(L.id),alt:`${L.name} 현재 프로필`', 'L.directoryId||L.id');
  preview('directory current-photo editor', 'ue(C.id)&&', 't.jsx("img",{src:ue(C.id),alt:`${C.name} 현재 프로필`', 'C.directoryId||C.id');
  preview('committee current-photo editor', 'bn(Ze.id,Ze.photo)&&', 't.jsx("img",{src:bn(Ze.id,Ze.photo),alt:`${Ze.name} 현재 프로필`', 'Ze.directoryId||Ze.id');
  return { html, changes, images: changes.reduce((sum, change) => sum + change.count, 0) };
}

module.exports = { patchPhotoImages };
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node patch-photo-images.cjs INPUT.html OUTPUT.html');
  const result = patchPhotoImages(fs.readFileSync(input, 'utf8'));
  fs.writeFileSync(output, result.html, 'utf8');
  console.log(JSON.stringify({ images: result.images, changes: result.changes }, null, 2));
}
