/* Funciona sem internet e se atualiza sozinho.
   - Cada versão do app é uma caixa (cache) inteira e fechada: index, scripts, fonte e ícones da MESMA versão.
     Nunca há mistura de um arquivo novo com outro velho.
   - Ao abrir com internet, o navegador confere este arquivo. Se a VERSAO mudou, a versão nova é baixada inteira
     por trás, assume o controle e o app recarrega na hora (app.js, "atualização").
   - A VERSAO é calculada por `node ferramentas/versao.mjs` a partir do conteúdo dos arquivos: rode antes de publicar. */
const VERSAO = 'agenda-e7d2254ed8';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'fala.js', 'manifest.webmanifest', 'fontes/inter.woff2', 'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png'];

self.addEventListener('install', e => {
  /* cache:'reload' pula o cache HTTP do navegador: garante os arquivos desta versão, não os de minutos atrás */
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSAO).then(async c => {
    const guardado = await c.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    try { return await fetch(req); }
    catch (err) { return req.mode === 'navigate' ? (await c.match('index.html')) : Response.error(); }
  }));
});
self.addEventListener('message', e => { if (e.data === 'versao' && e.source) e.source.postMessage({ versao: VERSAO }); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return self.clients.openWindow('./');
  }));
});
