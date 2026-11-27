// Gera os ícones PNG do app (sem dependência): node ferramentas/icones.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'icones');
mkdirSync(pasta, { recursive: true });

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function bloco(tipo, dados) {
  const t = Buffer.from(tipo), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, c]);
}
function png(N) {
  const px = Buffer.alloc(N * N * 3);
  const put = (x, y, [r, g, b]) => { const i = (y * N + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const AZUL = [53, 87, 232], ESC = [36, 58, 170], BR = [255, 255, 255], CL = [214, 228, 252], VERDE = [20, 160, 80];
  const ret = (x0, y0, x1, y1, r, cor) => {
    for (let y = Math.round(y0 * N); y < Math.round(y1 * N); y++) for (let x = Math.round(x0 * N); x < Math.round(x1 * N); x++) {
      const rr = r * N, cx = Math.min(Math.max(x, x0 * N + rr), x1 * N - rr), cy = Math.min(Math.max(y, y0 * N + rr), y1 * N - rr);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) put(x, y, cor);
    }
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, AZUL);
  ret(.2, .25, .8, .8, .06, BR);            // a folha
  ret(.2, .25, .8, .39, .06, ESC); ret(.2, .33, .8, .39, 0, ESC); // a faixa de cima
  ret(.33, .19, .38, .31, .02, BR); ret(.62, .19, .67, .31, .02, BR); // as argolas
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ret(.28 + i * .16, .47 + j * .15, .4 + i * .16, .58 + j * .15, .015, (i === 1 && j === 0) ? VERDE : CL);
  const raw = Buffer.alloc((N * 3 + 1) * N);
  for (let y = 0; y < N; y++) { raw[y * (N * 3 + 1)] = 0; px.copy(raw, y * (N * 3 + 1) + 1, y * N * 3, (y + 1) * N * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(raw)), bloco('IEND', Buffer.alloc(0))]);
}
for (const n of [180, 192, 512]) { writeFileSync(join(pasta, `icone-${n}.png`), png(n)); console.log('icone-' + n + '.png'); }
