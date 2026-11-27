/* Avisos de verdade (Web Push) da Minha Agenda.
   O app manda: a inscrição do celular (POST /p/<chave>/assinar) e a lista dos próximos avisos
   (POST /p/<chave>/agenda). Cada celular tem um "despertador" (Durable Object) que dorme até o próximo
   aviso, acorda na hora, manda a notificação criptografada para o celular e volta a dormir.
   A chave privada VAPID fica só nos segredos do Cloudflare (env.VAPID_JWK), nunca no repositório. */

const MAX_AVISOS = 400, GUARDA_ENVIADOS = 3 * 86400e3;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const junta = (...partes) => { const t = partes.reduce((n, p) => n + p.length, 0), o = new Uint8Array(t); let i = 0; for (const p of partes) { o.set(p, i); i += p.length; } return o; };
const txt = s => new TextEncoder().encode(s);

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}
/* RFC 8291 (aes128gcm): só o celular inscrito consegue ler a mensagem */
export async function cifrar(sub, texto) {
  const uaPub = deB64u(sub.keys.p256dh), auth = deB64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const segredo = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, segredo, junta(txt('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, txt('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, txt('Content-Encoding: nonce\0'), 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, junta(txt(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);   /* 4096 */
  return junta(salt, rs, new Uint8Array([asPub.length]), asPub, cifrado);
}
/* VAPID (RFC 8292): assina quem está mandando */
async function vapid(env, endpoint) {
  const jwk = JSON.parse(env.VAPID_JWK);
  const priv = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const pub = b64u(junta(new Uint8Array([4]), deB64u(jwk.x), deB64u(jwk.y)));
  const cab = b64u(txt(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(txt(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://condeizz.github.io/agenda/' })));
  const ass = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, txt(cab + '.' + corpo));
  return `vapid t=${cab}.${corpo}.${b64u(ass)}, k=${pub}`;
}
export async function enviarPush(env, sub, dados, ttl = 3600) {
  const corpo = await cifrar(sub, JSON.stringify(dados));
  return fetch(sub.endpoint, {
    method: 'POST', body: corpo,
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high', Authorization: await vapid(env, sub.endpoint) }
  });
}

/* um despertador por celular */
export class Despertador {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.s = ctx.storage; }
  async fetch(req) {
    const acao = new URL(req.url).pathname.split('/').pop();
    let d = {}; try { d = await req.json(); } catch (e) { }
    if (acao === 'assinar') {
      if (!d.sub || !/^https:\/\//.test(d.sub.endpoint || '') || !d.sub.keys || !d.sub.keys.p256dh || !d.sub.keys.auth) return new Response('Inscrição inválida.', { status: 400 });
      await this.s.put('sub', { endpoint: d.sub.endpoint, keys: { p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth } });
      return Response.json({ ok: true });
    }
    if (acao === 'agenda') {
      const agora = Date.now(), lista = (Array.isArray(d.avisos) ? d.avisos : []).slice(0, MAX_AVISOS)
        .filter(a => a && typeof a.id === 'string' && a.quando > agora - 3600e3 && a.quando < agora + 40 * 86400e3)
        .map(a => ({ id: a.id.slice(0, 120), quando: +a.quando, limite: +(a.limite || a.quando + 3600e3), titulo: String(a.titulo || 'Agenda').slice(0, 120), corpo: String(a.corpo || '').slice(0, 300) }));
      await this.s.put('lista', lista);
      await this.armar();
      return Response.json({ ok: true, avisos: lista.length, proximo: await this.s.getAlarm() });
    }
    if (acao === 'teste') {
      const em = Math.min(600, Math.max(0, +d.segundos || 0)) * 1000, lista = (await this.s.get('lista')) || [];
      lista.push({ id: 'teste-' + Date.now(), quando: Date.now() + em, limite: Date.now() + em + 600e3, titulo: 'Teste da agenda', corpo: 'O aviso chegou com o app fechado. Está tudo certo!' });
      await this.s.put('lista', lista); await this.armar();
      return Response.json({ ok: true, em: em / 1000 });
    }
    if (acao === 'sair') { await this.s.deleteAll(); await this.s.deleteAlarm(); return Response.json({ ok: true }); }
    if (acao === 'estado') return Response.json({ inscrito: !!(await this.s.get('sub')), avisos: ((await this.s.get('lista')) || []).length, proximo: await this.s.getAlarm() });
    return new Response('?', { status: 404 });
  }
  async armar() {
    const lista = (await this.s.get('lista')) || [];
    const prox = lista.reduce((m, a) => Math.min(m, a.quando), Infinity);
    if (prox === Infinity) await this.s.deleteAlarm(); else await this.s.setAlarm(Math.max(Date.now() + 500, prox));
  }
  async alarm() {
    const agora = Date.now(), sub = await this.s.get('sub');
    let lista = (await this.s.get('lista')) || [];
    const enviados = (await this.s.get('enviados')) || {};
    const vencidos = lista.filter(a => a.quando <= agora + 1000);
    lista = lista.filter(a => a.quando > agora + 1000);
    if (sub) for (const a of vencidos) {
      if (enviados[a.id] || agora > a.limite) continue;
      try {
        const r = await enviarPush(this.env, sub, { titulo: a.titulo, corpo: a.corpo, tag: a.id }, Math.max(60, Math.round((a.limite - agora) / 1000)));
        if (r.status === 404 || r.status === 410) { await this.s.delete('sub'); break; }   /* o celular cancelou a inscrição */
        if (r.ok) enviados[a.id] = agora;
        else if (r.status >= 500 && agora + 60e3 < a.limite) lista.push(Object.assign(a, { quando: agora + 60e3 }));   /* tenta de novo em 1 min */
      } catch (e) { if (agora + 60e3 < a.limite) lista.push(Object.assign(a, { quando: agora + 60e3 })); }
    }
    for (const k in enviados) if (agora - enviados[k] > GUARDA_ENVIADOS) delete enviados[k];
    await this.s.put('enviados', enviados); await this.s.put('lista', lista); await this.armar();
  }
}
