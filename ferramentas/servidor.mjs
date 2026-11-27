// Servidor local para testar e para abrir no celular na mesma rede Wi-Fi:
//   node ferramentas/servidor.mjs   →  http://localhost:4400
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT) || 4400;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const arq = normalize(join(raiz, p));
  if (!arq.startsWith(raiz) || p.includes('/ferramentas/')) { res.writeHead(404); return res.end(); }
  try {
    const dados = await readFile(arq);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dados);
  } catch { res.writeHead(404); res.end('não achei'); }
}).listen(PORTA, () => {
  console.log(`Agenda em http://localhost:${PORTA}`);
  for (const l of Object.values(networkInterfaces()).flat()) if (l.family === 'IPv4' && !l.internal) console.log(`  na rede: http://${l.address}:${PORTA}`);
});
