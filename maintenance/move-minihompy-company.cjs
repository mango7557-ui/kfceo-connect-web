const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = cp.execFileSync('git', ['ls-files', '*.html'], {
  cwd: root,
  encoding: 'utf8',
}).trim().split(/\r?\n/);

const before = `,(H==null?void 0:H.company)&&t.jsx("span",{className:"mh-company-chip",children:H.company})]}),t.jsx("h2",{children:[F.name,F.title||(H==null?void 0:H.title)].filter(Boolean).join(" ")}),t.jsx("p",{children:B.intro})`;
const after = `]}),t.jsx("h2",{children:[F.name,F.title||(H==null?void 0:H.title)].filter(Boolean).join(" ")}), (H==null?void 0:H.company)&&t.jsx("span",{className:"mh-company-chip",children:H.company}),t.jsx("p",{children:B.intro})`;

for (const file of files) {
  const fullPath = path.join(root, file);
  const html = fs.readFileSync(fullPath, 'utf8');
  const matches = html.split(before).length - 1;
  if (matches !== 1) throw new Error(`${file}: expected one company chip placement, found ${matches}`);
  fs.writeFileSync(fullPath, html.replace(before, after));
}

console.log(`Moved the mini-homepage company chip below the name in ${files.length} HTML entrypoints.`);
