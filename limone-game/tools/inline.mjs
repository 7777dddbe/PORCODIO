// Unisce index.html + dist/game.js in un unico file (dist/index.html) e in una versione "solo contenuto" per Artifact.
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const html = fs.readFileSync(root + 'index.html', 'utf8');
const js = fs.readFileSync(root + 'dist/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const tag = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(tag)) throw new Error('tag script non trovato in index.html');
const standalone = html.replace(tag, () => `<script type="module">\n${js}\n</script>`);
fs.mkdirSync(root + 'dist', { recursive: true });
fs.writeFileSync(root + 'dist/index.html', standalone);
// versione Artifact: niente doctype/html/head/body (li aggiunge la piattaforma)
let art = standalone.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '').replace(/<\/html>\s*$/i, '');
fs.writeFileSync(root + 'dist/artifact.html', art);
console.log('dist/index.html', (standalone.length / 1024).toFixed(0) + ' KB · dist/artifact.html', (art.length / 1024).toFixed(0) + ' KB');
