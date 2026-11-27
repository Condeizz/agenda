// Calcula a versão do app pelo conteúdo dos arquivos e grava no sw.js. Rode antes de cada publicação:
//   node ferramentas/versao.mjs
// Se nada mudou, a versão fica a mesma (e os celulares não baixam nada de novo).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const swArq = join(raiz, 'sw.js'), sw = readFileSync(swArq, 'utf8');
const lista = JSON.parse(sw.match(/const ARQUIVOS = (\[[^\]]*\])/)[1].replace(/'/g, '"')).filter(a => a !== './');
const h = createHash('sha256');
for (const a of lista) h.update(a).update(readFileSync(join(raiz, a)));
h.update(sw.replace(/const VERSAO = '[^']*';/, ''));
const versao = 'agenda-' + h.digest('hex').slice(0, 10);
writeFileSync(swArq, sw.replace(/const VERSAO = '[^']*';/, `const VERSAO = '${versao}';`));
console.log(versao);
