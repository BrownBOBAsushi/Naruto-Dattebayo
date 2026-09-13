import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const core = read('./src/probe-core.js').replaceAll('export ', '');
const app = read('./src/app.js').replace(/^import[\s\S]*?from '\.\/probe-core\.js';\n\n/, '');
const html = read('./diagnostic.html')
  .replace('    <link rel="stylesheet" href="./diagnostics.css" />', `    <style>\n${read('./diagnostics.css')}\n    </style>`)
  .replace('    <script type="module" src="./src/app.js"></script>', `    <script>\n${core}\n${app}\n    </script>`);
writeFileSync(new URL('../probe.html', import.meta.url), html);
console.log('Wrote probe.html');
