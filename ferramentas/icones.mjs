// Gera os ícones PNG do app a partir de icones/icone.svg, desenhando o SVG no Edge sem janela.
//   node ferramentas/icones.mjs            (Windows, com o Microsoft Edge instalado)
// Saem: icone-180.png (iPhone), icone-192.png e icone-512.png (Android, também "maskable").
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'icones');
const svg = readFileSync(join(pasta, 'icone.svg'), 'utf8');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', PORTA = 9339;
const espera = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'icone-'))}`, 'about:blank'], { stdio: 'ignore' });
await espera(2500);
const alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(alvo.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let n = 0; const pend = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const cdp = (method, params = {}) => new Promise(r => { const id = ++n; pend[id] = r; ws.send(JSON.stringify({ id, method, params })); });

try {
  for (const tam of [180, 192, 512]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: tam, height: tam, deviceScaleFactor: 1, mobile: false });
    const html = `<!doctype html><html><body style="margin:0;overflow:hidden">${svg.replace('width="512" height="512"', `width="${tam}" height="${tam}"`)}</body></html>`;
    await cdp('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
    await espera(500);
    const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: tam, height: tam, scale: 1 } });
    writeFileSync(join(pasta, `icone-${tam}.png`), Buffer.from(r.result.data, 'base64'));
    console.log('icone-' + tam + '.png');
  }
} finally { ws.close(); edge.kill(); }
process.exit(0);
