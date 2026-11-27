/* Caixa de entrada da Minha Agenda (Cloudflare Worker + KV).
   O atalho da Siri manda o que você falou; o app, quando abre, busca, anota e apaga.

   A chave da caixa é criada pelo próprio app, no celular (32+ letras aleatórias), e vai no endereço:
     POST /c/<chave>            corpo: {"texto":"..."} ou texto puro  → guarda (máx. 500 letras, 200 por caixa, 30 dias)
     GET  /c/<chave>            → [{id, texto, em}]
     POST /c/<chave>/apagar     corpo: {"ids":[...]}                   → apaga o que o app já anotou
   O servidor nunca guarda a chave: a caixa é identificada pelo resumo (SHA-256) dela. */

const ORIGENS = ['https://condeizz.github.io', 'http://localhost:4400'];
const TTL = 30 * 86400, MAX_ITENS = 200, MAX_TEXTO = 500;

const cors = req => {
  const o = req.headers.get('Origin');
  return ORIGENS.includes(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' } : {};
};
const resp = (req, corpo, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
  status, headers: { 'Content-Type': typeof corpo === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...cors(req) }
});
async function idDaCaixa(chave) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('agenda:' + chave));
  return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const m = new URL(req.url).pathname.match(/^\/c\/([A-Za-z0-9_-]{32,80})(\/apagar)?\/?$/);
    if (!m) return resp(req, 'Caixa de entrada da Minha Agenda.', 404);
    const caixa = 'b:' + await idDaCaixa(m[1]) + ':';

    if (req.method === 'GET' && !m[2]) {
      const lista = await env.CAIXA.list({ prefix: caixa, limit: MAX_ITENS });
      const itens = [];
      for (const k of lista.keys) { const v = await env.CAIXA.get(k.name, 'json'); if (v) itens.push({ id: k.name.slice(caixa.length), ...v }); }
      return resp(req, itens);
    }
    if (req.method === 'POST' && m[2]) {
      let ids = []; try { ids = (await req.json()).ids || []; } catch (e) { }
      for (const id of ids.slice(0, MAX_ITENS)) if (/^[\w-]{1,40}$/.test(id)) await env.CAIXA.delete(caixa + id);
      return resp(req, { apagados: ids.length });
    }
    if (req.method === 'POST') {
      const bruto = await req.text();
      let texto = bruto; try { const j = JSON.parse(bruto); if (j && typeof j.texto === 'string') texto = j.texto; } catch (e) { }
      texto = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO);
      if (!texto) return resp(req, 'Não ouvi nada para anotar.', 400);
      const ja = await env.CAIXA.list({ prefix: caixa, limit: MAX_ITENS });
      if (ja.keys.length >= MAX_ITENS) return resp(req, 'A caixa está cheia. Abra a agenda para esvaziar.', 429);
      const id = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      await env.CAIXA.put(caixa + id, JSON.stringify({ texto, em: Date.now() }), { expirationTtl: TTL });
      return resp(req, 'Anotado: ' + texto);
    }
    return resp(req, 'Método não aceito.', 405);
  }
};
