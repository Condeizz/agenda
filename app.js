'use strict';
/* Minha Agenda — tudo fica neste aparelho (localStorage, chave "agenda.v1").
   Sem servidor e sem conta. O backup em arquivo (Ajustes) é a proteção contra perder os dados. */

const CHAVE = 'agenda.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const maiusc = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/* ───────── dados ───────── */
function vazio() {
  return {
    v: 1, eventos: [], tarefas: [], rotinas: [], notas: {}, avisados: {}, rotAplic: {},
    cfg: { tema: 'auto', letra: 100, backup: null, backupDepois: null, manha: '07:30', noite: '18:00', autoPassar: false }
  };
}
function normaliza(o) {
  const b = vazio(), d = Object.assign(b, o, { cfg: Object.assign(b.cfg, (o && o.cfg) || {}) });
  for (const k of ['eventos', 'tarefas', 'rotinas']) if (!Array.isArray(d[k])) d[k] = [];
  for (const k of ['notas', 'avisados', 'rotAplic']) if (!d[k] || typeof d[k] !== 'object') d[k] = {};
  for (const e of d.eventos) { e.rep = e.rep || 'nao'; e.pula = e.pula || {}; if (e.ini == null) e.ini = ''; }
  for (const t of d.tarefas) { t.rep = t.rep || 'nao'; t.feitas = t.feitas || {}; }
  return d;
}
function carregar() { try { const o = JSON.parse(localStorage.getItem(CHAVE)); if (o && o.v) return normaliza(o); } catch (e) { } return vazio(); }
let D = carregar();
function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(D)); } catch (e) { toast('Não consegui salvar: o aparelho está sem espaço.'); } }
function salvar() { gravar(); agendarLembretes(); }

/* ───────── datas ───────── */
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hoje = () => iso(new Date());
const soma = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 864e5);
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dow = s => deIso(s).getDay();
const nomeData = (s, longo) => { const d = deIso(s); return (longo ? DIAS_LONGO : DIAS)[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
const curta = s => { const d = deIso(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const minDe = h => { if (!h) return null; const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hm = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
const agoraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const quandoMs = (s, h) => { const d = deIso(s); const [a, b] = h.split(':').map(Number); d.setHours(a, b, 0, 0); return d.getTime(); };
function relDia(s) { const h = hoje(); return s === h ? 'hoje' : s === soma(h, 1) ? 'amanhã' : s === soma(h, -1) ? 'ontem' : ''; }
function proxHora() { const d = new Date(); return pad(Math.min(23, d.getHours() + 1)) + ':00'; }
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
function saudacao() { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
function inicioSemana(s) { const d = dow(s); return soma(s, d === 0 ? -6 : 1 - d); }

/* ───────── repetição (compromissos e tarefas usam a mesma regra) ───────── */
const REP = { nao: 'Não repete', dia: 'Todo dia', uteis: 'Dias úteis (seg a sex)', semana: 'Toda semana', quinzena: 'A cada 2 semanas', mes: 'Todo mês' };
function repete(rep, inicio, s) {
  const d = dow(s);
  if (rep === 'nao' || !rep) return s === inicio;
  if (rep === 'dia') return true;
  if (rep === 'uteis') return d >= 1 && d <= 5;
  if (rep === 'semana') return d === dow(inicio);
  if (rep === 'quinzena') return d === dow(inicio) && diasEntre(inicio, s) % 14 === 0;
  if (rep === 'mes') return deIso(s).getDate() === deIso(inicio).getDate();
  return false;
}
function repTexto(o) {
  const r = o.rep || 'nao';
  if (r === 'nao') return '';
  if (r === 'semana') return 'Toda ' + DIAS[dow(o.data)];
  if (r === 'quinzena') return DIAS[dow(o.data)] + ' sim, outra não';
  if (r === 'mes') return 'Todo dia ' + deIso(o.data).getDate();
  return REP[r];
}
const opcoesRep = (atual, inicio, com) => Object.entries(REP).filter(([k]) => com.includes(k)).map(([k, v]) => {
  const rot = k === 'semana' ? `Toda semana (${DIAS[dow(inicio)]})` : k === 'quinzena' ? `A cada 2 semanas (${DIAS[dow(inicio)]})` : k === 'mes' ? `Todo mês (dia ${deIso(inicio).getDate()})` : v;
  return `<option value="${k}"${atual === k ? ' selected' : ''}>${rot}</option>`;
}).join('');

/* ───────── compromissos ───────── */
function ocorreEv(e, s) { return s >= e.data && !(e.ate && s > e.ate) && !(e.pula && e.pula[s]) && repete(e.rep, e.data, s); }
/* cada ocorrência leva a data do dia; "base" é o dia em que a série começou */
const eventosDo = s => D.eventos.filter(e => ocorreEv(e, s)).map(e => Object.assign({}, e, { data: s, base: e.data }))
  .sort((a, b) => (a.ini || '').localeCompare(b.ini || ''));
const comHora = e => !!e.ini;
const fimMin = e => e.ini ? (minDe(e.fim) ?? (minDe(e.ini) + 60)) : 1440;
const horario = e => e.ini ? e.ini + (e.fim ? '–' + e.fim : '') : 'Dia todo';

/* ───────── tarefas ───────── */
const ocorreTf = (t, s) => s >= t.data && repete(t.rep, t.data, s);
const feita = (t, s) => !!(t.feitas && t.feitas[s]);
const tarefasDo = s => D.tarefas.filter(t => ocorreTf(t, s))
  .sort((a, b) => (feita(a, s) - feita(b, s)) || ((b.prio ? 1 : 0) - (a.prio ? 1 : 0)) || (a.hora || '99').localeCompare(b.hora || '99') || a.titulo.localeCompare(b.titulo));
/* o que ficou para trás: tarefa avulsa de qualquer dia anterior, e a repetida de ontem */
function pendentes(s) {
  const ontem = soma(s, -1), r = [];
  for (const t of D.tarefas) {
    if (t.rep === 'nao') { if (t.data < s && !feita(t, t.data)) r.push({ t, dia: t.data }); }
    else if (ocorreTf(t, ontem) && !feita(t, ontem)) r.push({ t, dia: ontem });
  }
  return r.sort((a, b) => (b.t.prio ? 1 : 0) - (a.t.prio ? 1 : 0) || a.dia.localeCompare(b.dia));
}
function marcarSem(id, dia, valor) {
  const t = D.tarefas.find(x => x.id === id); if (!t) return;
  t.feitas = t.feitas || {};
  if (valor) t.feitas[dia] = valor; else delete t.feitas[dia];
}
function marcar(id, dia, valor) { marcarSem(id, dia, valor); salvar(); }
/* passa para o dia seguinte o que não foi feito em "s" (a avulsa muda de dia; a repetida é dispensada, porque volta sozinha) */
function passarParaAmanha(s) {
  let n = 0;
  for (const t of tarefasDo(s)) if (!feita(t, s)) { if (t.rep === 'nao') t.data = soma(s, 1); else t.feitas[s] = 'pulada'; n++; }
  return n;
}
const naoFeitas = s => tarefasDo(s).filter(t => !feita(t, s)).length;

/* ───────── rotinas ───────── */
const chaveRot = (r, s) => r.id + '@' + s;
function aplicarRotina(r, s) {
  for (const titulo of r.itens) D.tarefas.push({ id: uid(), titulo, data: s, rep: 'nao', prio: false, feitas: {}, rot: r.id });
  D.rotAplic[chaveRot(r, s)] = 1;
}

/* ───────── o que o app faz sozinho ao abrir e a cada dia ───────── */
function rodarDia() {
  const h = hoje(), msgs = [];
  if (D.cfg.autoPassar) {
    let n = 0;
    for (const t of D.tarefas) if (t.rep === 'nao' && t.data < h && !feita(t, t.data)) { t.data = h; n++; }
    const ontem = soma(h, -1);
    for (const t of D.tarefas) if (t.rep !== 'nao' && ocorreTf(t, ontem) && !feita(t, ontem)) t.feitas[ontem] = 'pulada';
    if (n) msgs.push(plural(n, 'pendência veio', 'pendências vieram') + ' para hoje');
  }
  for (const r of D.rotinas) if ((r.dias || []).includes(dow(h)) && !D.rotAplic[chaveRot(r, h)]) { aplicarRotina(r, h); msgs.push('Rotina “' + r.nome + '” entrou no dia'); }
  for (const k in D.rotAplic) if (k.split('@')[1] < soma(h, -60)) delete D.rotAplic[k];
  if (msgs.length) { salvar(); setTimeout(() => toast(msgs.join(' · '), null, 4500), 600); }
}

/* ───────── pedidos pelo endereço (atalho de voz, outro app) ─────────
   ?tarefa=Texto  ·  ?compromisso=Texto&dia=2026-12-01&hora=14:00  */
function pedidoPeloEndereco() {
  const p = new URLSearchParams(location.search); if (![...p.keys()].length) return;
  const limpa = v => (v || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(p.get('dia') || '') ? p.get('dia') : (p.get('dia') === 'amanha' ? soma(hoje(), 1) : hoje());
  const hora = /^\d{1,2}:\d{2}$/.test(p.get('hora') || '') ? p.get('hora').padStart(5, '0') : '';
  history.replaceState(null, '', location.pathname);
  if (limpa(p.get('tarefa'))) {
    D.tarefas.push({ id: uid(), titulo: limpa(p.get('tarefa')), data: dia, rep: 'nao', prio: false, feitas: {}, hora, aviso: !!hora });
    salvar(); setTimeout(() => toast('Tarefa anotada: ' + limpa(p.get('tarefa'))), 400);
  } else if (limpa(p.get('compromisso'))) {
    setTimeout(() => { aba = 'agenda'; dataSel = dia; render(); formEvento(null, dia, { titulo: limpa(p.get('compromisso')), ini: hora || proxHora() }); }, 300);
  }
}

/* ───────── caixa de entrada da Siri ─────────
   O atalho da Siri manda a frase para a caixa (caixa/worker.js, no Cloudflare). Ao abrir, o app busca,
   entende a frase (fala.js), anota e apaga da caixa. A chave da caixa é criada aqui, no celular. */
const CAIXA_URL = 'https://agenda-caixa.henriquejobs0304.workers.dev';
const enderecoCaixa = () => D.cfg.caixaChave ? (D.cfg.caixaUrl || CAIXA_URL) + '/c/' + D.cfg.caixaChave : '';
function novaChave() { const b = new Uint8Array(30); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
let buscandoCaixa = false;
async function buscarCaixa(avisarVazio) {
  if (!D.cfg.caixaChave || buscandoCaixa || !navigator.onLine) { if (avisarVazio && !navigator.onLine) toast('Sem internet agora. Busco quando voltar.'); return; }
  buscandoCaixa = true;
  try {
    const r = await fetch(enderecoCaixa(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const itens = await r.json(), feitos = [], nomes = [];
    D.caixaVistos = D.caixaVistos || {};
    for (const it of itens.sort((a, b) => a.em - b.em)) {
      if (!D.caixaVistos[it.id]) {
        const f = window.interpretarFala(it.texto, it.em);
        if (f.tipo === 'compromisso') D.eventos.push({ id: uid(), titulo: f.titulo, data: f.data, ini: f.hora, fim: hm(Math.min(1439, minDe(f.hora) + 60)), obs: 'Anotado pela Siri: “' + it.texto + '”', lembrete: 15, rep: 'nao', pula: {} });
        else D.tarefas.push({ id: uid(), titulo: f.titulo, data: f.data, rep: 'nao', prio: f.prio, feitas: {}, hora: f.hora, aviso: !!f.hora });
        D.caixaVistos[it.id] = Date.now();
        nomes.push(f.titulo + ' (' + (relDia(f.data) || curta(f.data)) + (f.hora ? ' ' + f.hora : '') + ')');
      }
      feitos.push(it.id);
    }
    for (const k in D.caixaVistos) if (Date.now() - D.caixaVistos[k] > 40 * 864e5) delete D.caixaVistos[k];
    if (nomes.length) { salvar(); render(); toast((nomes.length === 1 ? 'Da Siri: ' : nomes.length + ' anotações da Siri: ') + nomes.join(' · '), null, 6000); }
    else if (avisarVazio) toast('A caixa está vazia.');
    if (feitos.length) await fetch(enderecoCaixa() + '/apagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: feitos }) });
  } catch (e) { if (avisarVazio) toast('Não consegui falar com a caixa agora.'); }
  buscandoCaixa = false;
}
function siriHtml() {
  if (!D.cfg.caixaChave) return `<section class="grupo"><h2 class="gh"><span class="chip-ico">${ico('mic')}</span>Anotar pela Siri</h2>
    <p style="margin-bottom:10px">Fale “Ei Siri, anotar na agenda” e diga o que for, como “reunião com o João amanhã às 15h”. Ao abrir a agenda (a partir de 1 minuto depois de falar), ela já estará anotada: com hora e cara de reunião vira compromisso; o resto vira tarefa.</p>
    <p class="mudo" style="margin-bottom:10px;font-size:.95rem">A frase fica guardada numa caixa de entrada na internet até a agenda buscar (e depois é apagada). Só quem tem a chave da sua caixa consegue ver o que está nela.</p>
    <button class="btn pri larga" data-criar-caixa>Criar minha caixa de entrada</button></section>`;
  return `<section class="grupo"><h2 class="gh"><span class="chip-ico">${ico('mic')}</span>Anotar pela Siri</h2>
    <p style="margin-bottom:8px">Endereço da sua caixa (vai no atalho da Siri):</p>
    <code class="endereco">${esc(enderecoCaixa())}</code>
    <div class="linha-btns" style="margin-top:10px"><button class="btn pri" data-copiar-caixa>Copiar endereço</button><button class="btn" data-buscar-caixa>Buscar agora</button></div>
    <details class="passos"><summary>Como montar o atalho no iPhone</summary><ol>
      <li>Toque em <b>Copiar endereço</b>, aqui em cima.</li>
      <li>Abra o app <b>Atalhos</b> › <b>+</b> (novo atalho). Dê o nome <b>Anotar na agenda</b> (é o que você vai falar para a Siri).</li>
      <li>Toque em <b>Adicionar Ação</b>, procure <b>Ditar Texto</b> e adicione. Em “Mostrar Mais”, escolha o idioma <b>Português (Brasil)</b>.</li>
      <li>Adicione a ação <b>Obter Conteúdo do URL</b>. No lugar do URL, <b>cole o endereço</b>. Toque em “Mostrar Mais”: Método <b>POST</b>; Corpo da Solicitação <b>Texto</b>; no campo do texto, toque e escolha a variável <b>Texto Ditado</b>.</li>
      <li>Adicione a ação <b>Falar Texto</b> com a variável <b>Conteúdo do URL</b> (a Siri responde “Anotado: …”).</li>
      <li>Pronto. Diga <b>“Ei Siri, anotar na agenda”</b>, espere ela ouvir e fale.</li>
    </ol><p class="mudo">No Android, o mesmo endereço funciona num atalho do app “HTTP Shortcuts” ou de uma rotina do Google Assistente (POST com o texto).</p></details>
    <button class="lnk" data-trocar-caixa>Trocar a chave (o atalho antigo para de funcionar)</button></section>`;
}

/* ───────── estado da tela ───────── */
let aba = 'hoje', dataSel = hoje(), modoAgenda = 'dia', textoBusca = '';
const TITULOS = { hoje: 'Hoje', agenda: 'Agenda', tarefas: 'Tarefas', buscar: 'Buscar', ajustes: 'Ajustes' };

function render() {
  $('#titulo').textContent = TITULOS[aba];
  $$('nav.abas button').forEach(b => { if (b.dataset.aba === aba) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const tela = $('#tela'); tela.innerHTML = tela._html = TELAS[aba]();
  const fab = $('#fab');
  const f = { agenda: '<span>+</span> Compromisso', tarefas: '<span>+</span> Tarefa' }[aba];
  fab.hidden = !f; if (f) fab.innerHTML = f;
  document.body.classList.toggle('com-fab', !!f);
  document.body.classList.toggle('na-hoje', aba === 'hoje');
  if (aba === 'buscar') { const i = $('#q'); i.value = textoBusca; mostraBusca(); }
}
function irPara(a) { aba = a; if (a !== 'agenda' && a !== 'tarefas') dataSel = hoje(); render(); window.scrollTo(0, 0); }

/* pedaços de lista */
function itemEvento(e, now) {
  const hj = e.data === hoje(), timed = comHora(e);
  const passou = hj && timed && now >= fimMin(e), atual = hj && timed && now >= minDe(e.ini) && now < fimMin(e);
  const r = repTexto(Object.assign({}, e, { data: e.base || e.data }));
  return `<button class="item${passou ? ' passou' : ''}${atual ? ' atual' : ''}" data-ev="${e.id}" data-dia="${e.data}">
    <span class="hora">${timed ? esc(e.ini) + (e.fim ? `<small>até ${esc(e.fim)}</small>` : '') : '<small>Dia todo</small>'}</span>
    <span class="corpo"><span class="tt">${esc(e.titulo)}</span>${e.obs ? `<span class="ob">${esc(e.obs)}</span>` : ''}
    ${atual ? '<span class="etq imp">Agora</span>' : ''}${r ? `<span class="etq">${esc(r)}</span>` : ''}${timed && e.lembrete != null ? `<span class="etq">Aviso ${e.lembrete ? (e.lembrete >= 1440 ? '1 dia antes' : e.lembrete >= 60 ? e.lembrete / 60 + ' h antes' : e.lembrete + ' min antes') : 'na hora'}</span>` : ''}</span></button>`;
}
function itemTarefa(t, s) {
  const f = feita(t, s), r = repTexto(t);
  return `<div class="tarefa${f ? ' feita' : ''}">
    <button class="chk" data-chk="${t.id}" data-dia="${s}" aria-pressed="${f}" aria-label="${f ? 'Desmarcar' : 'Marcar como feita'}: ${esc(t.titulo)}"><i></i></button>
    <button class="corpo" data-tf="${t.id}"><span class="tt">${t.prio ? '<span class="estrela" aria-label="Importante">★</span> ' : ''}${t.hora ? `<b class="thora">${esc(t.hora)}</b> ` : ''}${esc(t.titulo)}</span>
    ${r ? `<span class="etq">${esc(r)}</span>` : ''}${t.hora && t.aviso ? '<span class="etq">Aviso na hora</span>' : ''}</button></div>`;
}
function itemPendente({ t, dia }) {
  const quando = relDia(dia) || ('desde ' + curta(dia));
  return `<div class="card pend"><p class="tt"><b>${t.prio ? '<span class="estrela">★</span> ' : ''}${esc(t.titulo)}</b></p>
    <p class="mudo">${esc(maiusc(quando))}${t.rep !== 'nao' ? ' · ' + esc(repTexto(t)) : ''}</p>
    <div class="acoes"><button class="btn peq" data-pfeita="${t.id}" data-dia="${dia}">Feita</button>
    ${t.rep === 'nao' ? `<button class="btn peq" data-phoje="${t.id}">Passar para hoje</button>` : `<button class="btn peq" data-ppula="${t.id}" data-dia="${dia}">Deixar pra lá</button>`}</div></div>`;
}
const rapido = (dia, ph) => `<form class="rapido" data-rapido="${dia}"><input name="t" maxlength="100" placeholder="${ph}" enterkeyhint="done" aria-label="Nova tarefa"><button class="btn pri">Adicionar</button></form>`;

/* ───────── HOJE (o resumo do dia) ───────── */
function cartaoAgora(ev, now) {
  const tm = ev.filter(comHora), atual = tm.find(e => now >= minDe(e.ini) && now < fimMin(e)), prox = tm.find(e => minDe(e.ini) > now);
  if (!atual && !prox) return `<div class="card agora"><p class="rot">A seguir</p><p class="tit">${tm.length ? 'Os compromissos de hoje já passaram.' : 'Nenhum compromisso com hora hoje.'}</p></div>`;
  let h = `<button class="card agora" style="display:block;width:100%;text-align:left" data-ev="${(atual || prox).id}" data-dia="${hoje()}">`;
  if (atual) h += `<p class="rot">Agora</p><p class="tit">${esc(atual.titulo)}</p><p>${esc(horario(atual))}</p>`;
  if (prox) {
    const falta = minDe(prox.ini) - now, txt = falta < 60 ? `em ${falta} min` : `em ${Math.floor(falta / 60)} h${falta % 60 ? ' ' + falta % 60 + ' min' : ''}`;
    h += `${atual ? '<p class="rot" style="margin-top:10px">Depois</p>' : '<p class="rot">A seguir</p>'}<p class="tit">${esc(prox.titulo)}</p><p>${esc(prox.ini)} · ${txt}</p>`;
  }
  return h + '</button>';
}
function amanhaHtml(s) {
  const a = soma(s, 1), ev = eventosDo(a), nt = tarefasDo(a).length;
  if (!ev.length && !nt) return '';
  const ev1 = ev[0] ? `<b>${esc(ev[0].ini || 'Dia todo')}</b> ${esc(ev[0].titulo)}${ev.length > 1 ? ` <span class="mudo">e mais ${ev.length - 1}</span>` : ''}` : 'Nenhum compromisso';
  return `<h3>Amanhã</h3><button class="amanha" data-dia-sel="${a}"><span style="display:block">${ev1}</span>${nt ? `<span class="mudo">${plural(nt, 'tarefa', 'tarefas')}</span>` : ''}</button>`;
}
const diasSemCopia = () => D.cfg.backup ? Math.floor((Date.now() - D.cfg.backup) / 864e5) : null;
function copiaHtml() {
  const tem = D.eventos.length + D.tarefas.length, d = diasSemCopia();
  if (!tem || (d != null && d < 7) || (D.cfg.backupDepois && D.cfg.backupDepois >= hoje())) return '';
  return `<div class="card pend"><p><b>Hora da cópia de segurança</b></p><p class="mudo">${d == null ? 'Você ainda não guardou nenhuma cópia.' : `A última foi há ${plural(d, 'dia', 'dias')}.`} Leva 10 segundos.</p>
    <div class="acoes"><button class="btn peq pri" data-exportar>Salvar cópia</button><button class="btn peq" data-copia-depois>Depois</button></div></div>`;
}
function revisaoHtml(s) {
  if (!D.cfg.noite || agoraMin() < minDe(D.cfg.noite)) return '';
  const n = naoFeitas(s); if (!n) return '';
  return `<div class="card pend"><p><b>Fim do dia</b></p><p class="mudo">${plural(n, 'tarefa ficou', 'tarefas ficaram')} por fazer hoje.</p>
    <div class="acoes"><button class="btn peq pri" data-passar="${s}">Passar para amanhã</button></div></div>`;
}
/* ícones de traço, do mesmo desenho da barra de baixo */
const IC = {
  cal: '<path d="M3 10h18M8 3v4M16 3v4"/><rect x="3" y="5" width="18" height="16" rx="2.5"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.8"/>',
  rel: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  env: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  rot: '<path d="M4 6h11M4 12h11M4 18h7"/><path d="M17 15l2 2 3-4"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  sino: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  nuvem: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>',
  carta: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pincel: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  auto: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'
};
const ico = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
function anelHtml(feitas, total) {
  const r = 30, c = 2 * Math.PI * r, p = total ? feitas / total : 0;
  return `<div class="anel" role="img" aria-label="${feitas} de ${total} tarefas feitas">
    <svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="${r}" class="anel-fundo"/><circle cx="38" cy="38" r="${r}" class="anel-cheio" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>
    <span><b>${total ? Math.round(p * 100) + '%' : '—'}</b><small>${total ? 'feito' : 'sem tarefas'}</small></span></div>`;
}
function faixaSemana(s) {
  const ini = inicioSemana(s);
  let h = '<div class="faixa-sem" aria-label="Esta semana">';
  for (let i = 0; i < 7; i++) {
    const d = soma(ini, i), n = eventosDo(d).length, nt = tarefasDo(d).filter(t => !feita(t, d)).length;
    h += `<button class="fs-dia${d === s ? ' hj' : ''}${d < s ? ' ant' : ''}" data-dia-sel="${d}" aria-label="${esc(nomeData(d))}: ${plural(n, 'compromisso', 'compromissos')}">
      <small>${DIAS_CURTO[dow(d)]}</small><b>${deIso(d).getDate()}</b><i>${'<em></em>'.repeat(Math.min(3, n))}${!n && nt ? '<em class="t"></em>' : ''}</i></button>`;
  }
  return h + '</div>';
}
function linhaDoDia(ev, now, dia) {
  const ehHoje = !dia || dia === hoje();
  if (!ev.length) return `<div class="vazio-vis">${ico('sol', 'grande')}<p>${ehHoje ? 'Agenda livre hoje.' : 'Nada marcado neste dia.'}</p><button class="btn peq" data-novo-ev-dia="${dia || hoje()}">Marcar compromisso</button></div>`;
  if (!ehHoje) now = dia < hoje() ? 1441 : -1;   /* dia que já passou: tudo apagado; dia que vem: nada apagado e sem "agora" */
  const todos = ev.filter(e => !comHora(e)), tm = ev.filter(comHora);
  let h = '<div class="linha-tempo">', marcou = !ehHoje;
  for (const e of todos) h += `<div class="tl-it">${itemEvento(e, now)}</div>`;
  tm.forEach((e, i) => {
    if (!marcou && minDe(e.ini) > now && (i > 0 || todos.length)) { h += `<div class="tl-agora"><span>Agora · ${hm(now)}</span></div>`; marcou = true; }
    h += `<div class="tl-it${now >= fimMin(e) ? ' passou' : ''}">${itemEvento(e, now)}</div>`;
  });
  if (!marcou && tm.length && now >= fimMin(tm[tm.length - 1])) h += `<div class="tl-agora"><span>Agora · ${hm(now)}</span></div>`;
  return h + '</div>';
}
function telaHoje() {
  const s = hoje(), ev = eventosDo(s), ts = tarefasDo(s), pend = pendentes(s), now = agoraMin();
  const nf = ts.filter(t => feita(t, s)).length, faltam = ev.filter(e => fimMin(e) > now), aFazer = ts.length - nf;
  const noite = new Date().getHours() >= 18 || new Date().getHours() < 5;
  let h = `<section class="hero"><div class="hero-txt"><p class="sauda">${ico(noite ? 'lua' : 'sol', 'peq')} ${saudacao()}</p>
      <h2>${esc(maiusc(DIAS_LONGO[dow(s)]))}</h2><p class="hero-data">${deIso(s).getDate()} de ${MESES[deIso(s).getMonth()]}</p></div>
      ${anelHtml(nf, ts.length)}</section>`;
  h += faixaSemana(s);
  h += `<div class="numeros">
      <button class="num" data-ir-agenda>${ico('cal')}<b>${faltam.length}</b><small>na agenda</small></button>
      <button class="num" data-ir-tarefas>${ico('ok')}<b>${aFazer}</b><small>a fazer</small></button>
      <button class="num${pend.length ? ' alerta' : ''}" data-ir-pend>${ico('rel')}<b>${pend.length}</b><small>${pend.length === 1 ? 'pendente' : 'pendentes'}</small></button></div>`;
  h += cartaoAgora(ev, now) + revisaoHtml(s) + copiaHtml();
  if (D.eventos.some(e => e.lembrete != null) && 'Notification' in window && Notification.permission === 'default')
    h += `<div class="aviso-box">Os avisos estão desligados. <button class="btn peq" data-ligar-aviso style="margin-top:6px">Ligar avisos</button></div>`;
  h += `<div class="atalhos"><button data-novo-ev>${ico('mais')}<span>Compromisso</span></button><button data-novo-tf>${ico('ok')}<span>Tarefa</span></button><button data-enviar="dia" data-dia="${s}">${ico('env')}<span>Enviar dia</span></button></div>`;
  h += `<h3>${ico('cal', 'h3i')} Linha do dia</h3>` + linhaDoDia(ev, now);
  h += `<h3 id="sec-tarefas">${ico('ok', 'h3i')} Tarefas de hoje${ts.length ? ` <span class="cont">${nf}/${ts.length}</span>` : ''}</h3>`
    + (ts.length ? `<div class="barra" aria-hidden="true"><i style="width:${Math.round(nf / ts.length * 100)}%"></i></div><div class="lista">${ts.map(t => itemTarefa(t, s)).join('')}</div>` : `<div class="vazio-vis peq">${ico('ok', 'grande')}<p>Nenhuma tarefa para hoje.</p></div>`) + rapido(s, 'Nova tarefa para hoje');
  if (pend.length) h += `<h3 id="sec-pend">${ico('rel', 'h3i')} Ficou pendente</h3>${pend.map(itemPendente).join('')}`;
  h += amanhaHtml(s);
  h += `<h3>Anotações do dia</h3><textarea class="notas" id="notas" placeholder="Escreva aqui o que precisar lembrar hoje…">${esc(D.notas[s] || '')}</textarea><p class="salvo" id="salvo"></p>`;
  return h;
}

/* ───────── AGENDA ───────── */
function navData(passo) {
  const s = dataSel;
  let meio;
  if (passo === 7) { const ini = inicioSemana(s), fim = soma(ini, 6); meio = `${curta(ini)} a ${curta(fim)}`; }
  else { const d = deIso(s); meio = DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3); }
  const rel = passo === 7 ? (inicioSemana(hoje()) === inicioSemana(s) ? 'esta semana' : 'voltar a hoje') : (relDia(s) || 'voltar a hoje');
  const seta = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  return `<div class="navdata"><button class="seta" data-mover="-${passo}" aria-label="Anterior">${seta('M15 5l-7 7 7 7')}</button>
    <button class="meio" data-irhoje>${esc(meio)}<small>${esc(rel)}</small></button>
    <button class="seta" data-mover="${passo}" aria-label="Próximo">${seta('M9 5l7 7-7 7')}</button></div>`;
}
const linksRodape = links => `<div class="rodape-links">${links.map(([attrs, icone, txt]) => `<button class="pilula" ${attrs}>${ico(icone, 'peq')} ${txt}</button>`).join('')}</div>`;
function telaAgenda() {
  let h = `<div class="seg" role="group" aria-label="Ver"><button data-modo="dia" aria-pressed="${modoAgenda === 'dia'}">Dia</button><button data-modo="semana" aria-pressed="${modoAgenda === 'semana'}">Semana</button></div>`;
  if (modoAgenda === 'dia') {
    const ev = eventosDo(dataSel), nt = tarefasDo(dataSel).length;
    h += navData(1);
    h += linhaDoDia(ev, agoraMin(), dataSel);
    if (nt) h += `<button class="faixa-link" data-vertarefas>${ico('ok')}<span>${plural(nt, 'tarefa', 'tarefas')} neste dia</span><b>›</b></button>`;
    h += linksRodape([[`data-enviar="dia" data-dia="${dataSel}"`, 'env', 'Enviar este dia'], ['data-importar-ics', 'cal', 'Importar convite']]);
  } else {
    h += navData(7);
    const ini = inicioSemana(dataSel), hj = hoje();
    h += '<div class="semana">';
    for (let i = 0; i < 7; i++) {
      const s = soma(ini, i), ev = eventosDo(s), nt = tarefasDo(s).length, d = deIso(s);
      h += `<button class="dia${s === hj ? ' hj' : ''}${s < hj ? ' ant' : ''}" data-dia-sel="${s}">
        <span class="dia-data"><small>${DIAS_CURTO[d.getDay()]}</small><b>${d.getDate()}</b></span>
        <span class="dia-corpo">${ev.length ? ev.slice(0, 4).map(e => `<span class="ev"><b>${esc(e.ini || 'Dia todo')}</b> ${esc(e.titulo)}</span>`).join('') + (ev.length > 4 ? `<span class="ev mudo">e mais ${ev.length - 4}</span>` : '') : '<span class="ev livre">Livre</span>'}
        ${nt ? `<span class="etq">${ico('ok', 'mini')} ${plural(nt, 'tarefa', 'tarefas')}</span>` : ''}</span></button>`;
    }
    h += '</div>' + linksRodape([[`data-enviar="semana" data-dia="${ini}"`, 'env', 'Enviar a semana'], ['data-importar-ics', 'cal', 'Importar convite']]);
  }
  return h;
}

/* ───────── TAREFAS ───────── */
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diasTexto = ds => !ds || !ds.length ? 'Só quando você puser' : ds.length === 7 ? 'Todo dia' : [1, 2, 3, 4, 5].every(d => ds.includes(d)) && ds.length === 5 ? 'Dias úteis' : 'Sozinha: ' + [1, 2, 3, 4, 5, 6, 0].filter(d => ds.includes(d)).map(d => DIAS_CURTO[d]).join(', ');
function telaTarefas() {
  const ts = tarefasDo(dataSel), nf = ts.filter(t => feita(t, dataSel)).length;
  let h = navData(1);
  if (ts.length) h += `<div class="resumo-tf"><div><b>${nf} de ${ts.length}</b><span>${nf === ts.length ? 'tudo feito!' : plural(ts.length - nf, 'falta', 'faltam')}</span></div><div class="barra"><i style="width:${Math.round(nf / ts.length * 100)}%"></i></div></div>`;
  h += ts.length ? `<div class="lista">${ts.map(t => itemTarefa(t, dataSel)).join('')}</div>` : `<div class="vazio-vis peq">${ico('ok', 'grande')}<p>Nenhuma tarefa neste dia.</p></div>`;
  h += rapido(dataSel, dataSel === hoje() ? 'Nova tarefa para hoje' : 'Nova tarefa para este dia');
  if (dataSel === hoje()) { const p = pendentes(dataSel); if (p.length) h += `<h3>${ico('rel', 'h3i')} Ficou pendente</h3>${p.map(itemPendente).join('')}`; }
  h += `<h3>${ico('rot', 'h3i')} Rotinas</h3>`;
  h += D.rotinas.length ? `<div class="lista">${D.rotinas.map(r => {
    const ja = D.rotAplic[chaveRot(r, dataSel)];
    return `<div class="card rot"><span class="chip-ico">${ico('rot')}</span><button class="corpo-rot" data-rot="${r.id}"><b>${esc(r.nome)}</b><span class="mudo" style="display:block;font-size:.92rem">${plural(r.itens.length, 'tarefa', 'tarefas')} · ${esc(diasTexto(r.dias))}</span></button>
      <button class="btn peq${ja ? '' : ' pri'}" data-por-rot="${r.id}"${ja ? ' disabled' : ''}>${ja ? 'No dia ✓' : (dataSel === hoje() ? 'Pôr hoje' : 'Pôr')}</button></div>`;
  }).join('')}</div>` : `<div class="vazio-vis peq">${ico('rot', 'grande')}<p>Uma rotina é uma lista que se repete, como a abertura da loja. Ela entra no dia com um toque, ou sozinha nos dias escolhidos.</p></div>`;
  h += `<button class="btn larga tracejado" data-nova-rot style="margin-top:10px">${ico('mais', 'peq')} Nova rotina</button>`;
  const reps = D.tarefas.filter(t => t.rep !== 'nao').sort((a, b) => a.titulo.localeCompare(b.titulo));
  if (reps.length) h += `<h3>${ico('rel', 'h3i')} Tarefas que se repetem</h3><div class="lista-agrupada">${reps.map(t => `<button class="linha-item" data-tf="${t.id}"><span class="tt">${t.prio ? '<span class="estrela">★</span> ' : ''}${esc(t.titulo)}</span><small>${esc(repTexto(t))}</small><b>›</b></button>`).join('')}</div>`;
  return h;
}

/* ───────── BUSCAR ───────── */
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function telaBuscar() { return `<input class="busca" id="q" type="search" placeholder="Procurar compromissos e tarefas" autocomplete="off" enterkeyhint="search"><div id="res" style="margin-top:12px"></div>`; }
function mostraBusca() {
  const q = norm(textoBusca.trim()), alvo = $('#res'); if (!alvo) return;
  const ICB = '<svg class="ico grande" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
  if (!q) { alvo.innerHTML = `<div class="vazio-vis">${ICB}<p>Procure pelo nome de uma pessoa, um assunto ou um lugar.</p></div>`; return; }
  const ev = D.eventos.filter(e => norm(e.titulo + ' ' + e.obs).includes(q)).sort((a, b) => (b.data + b.ini).localeCompare(a.data + a.ini));
  const ts = D.tarefas.filter(t => norm(t.titulo).includes(q));
  if (!ev.length && !ts.length) { alvo.innerHTML = `<div class="vazio-vis">${ICB}<p>Nada encontrado para “${esc(textoBusca.trim())}”.</p></div>`; return; }
  let h = '';
  if (ev.length) h += `<h3>Compromissos</h3><div class="lista">${ev.slice(0, 50).map(e => `<button class="item" data-ev="${e.id}" data-dia="${e.data}"><span class="hora">${esc(curta(e.data))}<small>${esc(e.ini || 'Dia todo')}</small></span><span class="corpo"><span class="tt">${esc(e.titulo)}</span>${e.obs ? `<span class="ob">${esc(e.obs)}</span>` : ''}${repTexto(e) ? `<span class="etq">${esc(repTexto(e))}</span>` : ''}</span></button>`).join('')}</div>`;
  if (ts.length) h += `<h3>Tarefas</h3><div class="lista">${ts.slice(0, 50).map(t => `<button class="item" data-tf="${t.id}"><span class="corpo"><span class="tt">${t.prio ? '<span class="estrela">★</span> ' : ''}${esc(t.titulo)}</span><span class="etq">${esc(t.rep === 'nao' ? curta(t.data) : repTexto(t))}</span></span></button>`).join('')}</div>`;
  alvo.innerHTML = h;
}

/* ───────── AJUSTES ───────── */
const ehIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
function estadoAvisos() {
  if (!('Notification' in window)) return { txt: ehIOS() ? 'No iPhone, os avisos só funcionam com o app na tela inicial (Compartilhar › Adicionar à Tela de Início). Depois abra por lá e volte aqui.' : 'Este navegador não mostra avisos.', btn: '' };
  if (Notification.permission === 'granted') return { txt: 'Avisos ligados.', btn: '<button class="btn" data-teste-aviso>Testar um aviso</button>' };
  if (Notification.permission === 'denied') return { txt: 'Os avisos estão bloqueados nas configurações do navegador para este app.', btn: '' };
  return { txt: 'Ligue para receber os avisos dos compromissos, das tarefas com hora, e o resumo da manhã e da noite.', btn: '<button class="btn pri" data-ligar-aviso>Ligar avisos</button>' };
}
function telaAjustes() {
  const a = estadoAvisos(), dias = diasSemCopia();
  const op = (grupo, val, rot) => `<button data-${grupo}="${val}" aria-pressed="${String(D.cfg[grupo]) === String(val)}">${rot}</button>`;
  const hora = (k, rot, desc) => `<div class="cfg-linha"><label class="cfg-lab"><input type="checkbox" class="sw" data-cfg-liga="${k}"${D.cfg[k] ? ' checked' : ''}><span class="cfg-txt"><b>${rot}</b><small>${desc}</small></span></label>
    <input type="time" class="cfg-hora-inp" data-cfg-hora="${k}" value="${esc(D.cfg[k] || (k === 'manha' ? '07:30' : '18:00'))}"${D.cfg[k] ? '' : ' disabled'} aria-label="Horário: ${rot}"></div>`;
  const grupo = (icone, titulo, corpo, cls = '') => `<section class="grupo ${cls}"><h2 class="gh"><span class="chip-ico">${ico(icone)}</span>${titulo}</h2>${corpo}</section>`;
  return grupo('auto', 'O dia no automático',
    hora('manha', 'Resumo da manhã', 'Aviso com o dia de hoje') +
    hora('noite', 'Revisão do fim do dia', 'Se ficou tarefa, oferece passar para amanhã') +
    `<div class="cfg-linha"><label class="cfg-lab"><input type="checkbox" class="sw" data-cfg-auto${D.cfg.autoPassar ? ' checked' : ''}><span class="cfg-txt"><b>Pendências para hoje</b><small>O que ficou para trás vem sozinho para o dia</small></span></label></div>`)
  + grupo('sino', 'Avisos', `<p class="cfg-nota">${esc(a.txt)}</p>${a.btn ? `<div class="cfg-acao">${a.btn}</div>` : ''}
      <p class="cfg-nota mudo">Sem servidor, quem avisa é o próprio celular: o aviso chega com o app aberto ou aberto há pouco. Com o celular parado por muito tempo, pode não chegar.</p>`)
  + grupo('nuvem', 'Cópia de segurança', `<p class="cfg-nota">Seus dados ficam só neste aparelho. Guarde uma cópia de vez em quando (no e-mail, no Drive ou no WhatsApp para você mesmo).</p>
      ${dias == null ? '<div class="aviso-box">Você ainda não fez nenhuma cópia.</div>' : dias >= 7 ? `<div class="aviso-box">Última cópia há ${plural(dias, 'dia', 'dias')}.</div>` : `<p class="cfg-nota mudo">Última cópia: ${dias === 0 ? 'hoje' : 'há ' + plural(dias, 'dia', 'dias')}.</p>`}
      <div class="linha-btns"><button class="btn pri" data-exportar>Salvar cópia</button><button class="btn" data-importar>Restaurar</button></div>`)
  + grupo('carta', 'Convites de reunião', `<p class="cfg-nota">Recebeu um convite (.ics) por e-mail ou WhatsApp? Salve o arquivo e traga para cá. Para mandar um, abra o compromisso e toque em “Enviar convite”.</p>
      <button class="btn larga" data-importar-ics>Importar convite</button>`)
  + siriHtml()
  + grupo('pincel', 'Aparência', `<p class="cfg-rot">Tema</p><div class="seg">${op('tema', 'auto', 'Auto')}${op('tema', 'claro', 'Claro')}${op('tema', 'escuro', 'Escuro')}</div>
      <p class="cfg-rot">Tamanho da letra</p><div class="seg">${op('letra', 100, '<span style="font-size:.9em">Aa</span>')}${op('letra', 112, '<span style="font-size:1.05em">Aa</span>')}${op('letra', 125, '<span style="font-size:1.2em">Aa</span>')}</div>`)
  + grupo('info', 'Sobre', `<div class="lista-agrupada sobre">
      <div class="linha-item"><span class="tt">Neste aparelho</span><small>${plural(D.eventos.length, 'compromisso', 'compromissos')} · ${plural(D.tarefas.length, 'tarefa', 'tarefas')} · ${plural(D.rotinas.length, 'rotina', 'rotinas')}</small></div>
      <div class="linha-item"><span class="tt">Versão</span><small id="versao">${esc((versaoAtual || '').replace('agenda-', '') || '…')}</small></div>
      <button class="linha-item" data-procurar-versao><span class="tt">Procurar atualização</span><small>Ela também acontece sozinha ao abrir</small><b>›</b></button></div>`)
  + `<input type="file" id="arq" accept="application/json,.json" hidden><input type="file" id="arq-ics" accept=".ics,text/calendar" hidden>`;
}

const TELAS = { hoje: telaHoje, agenda: telaAgenda, tarefas: telaTarefas, buscar: telaBuscar, ajustes: telaAjustes };

/* ───────── gaveta (formulários) ───────── */
function abrir(html, ligar) {
  const tinha = !!$('#gaveta'); tiraGaveta();
  const veu = document.createElement('div'); veu.className = 'veu'; veu.id = 'veu';
  const g = document.createElement('div'); g.className = 'gaveta'; g.id = 'gaveta'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
  g.innerHTML = html; veu.onclick = fechar;
  document.body.append(veu, g);
  if (!tinha) history.pushState({ gaveta: 1 }, '');   /* o "voltar" do Android fecha a gaveta, não sai do app */
  ligar(g);
  const pri = g.querySelector('input:not([type=checkbox]),select,textarea'); if (pri && !pri.value) setTimeout(() => pri.focus(), 50);
}
function tiraGaveta() { $('#veu')?.remove(); $('#gaveta')?.remove(); }
/* Ao fechar pelo app, voltamos uma entrada do histórico; esse "voltar" chega depois, de forma assíncrona,
   e não pode fechar uma janela aberta logo em seguida. Por isso ele é marcado para ser ignorado. */
let ignorarVolta = 0;
function fechar() { if (!$('#gaveta')) return; tiraGaveta(); if (history.state && history.state.gaveta) { ignorarVolta++; history.back(); } }
addEventListener('popstate', () => { if (ignorarVolta) { ignorarVolta--; return; } tiraGaveta(); });
/* toda ação que apaga ou some com algo pode ser desfeita por alguns segundos */
function desfazivel(msg, fn) {
  const antes = JSON.stringify(D);
  fn(); salvar(); render();
  toast(msg, { rot: 'Desfazer', acao: () => { D = normaliza(JSON.parse(antes)); salvar(); render(); toast('Desfeito'); } }, 6000);
}
function ligarAvisos() {
  if (!('Notification' in window)) { irPara('ajustes'); return; }
  Notification.requestPermission().then(p => { agendarLembretes(); render(); toast(p === 'granted' ? 'Avisos ligados' : 'Os avisos não foram permitidos neste aparelho.'); });
}
function armar(b, texto, acao) {
  b.onclick = () => { if (b.dataset.armado) { fechar(); acao(); return; } b.dataset.armado = 1; const antes = b.textContent; b.textContent = texto; setTimeout(() => { if (b.isConnected) { delete b.dataset.armado; b.textContent = antes; } }, 4000); };
}
function armarSolto(b, texto, acao) {
  if (b.dataset.armado) { delete b.dataset.armado; acao(); return; }
  b.dataset.armado = 1; const antes = b.textContent; b.textContent = texto;
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armado; b.textContent = antes; } }, 4000);
}
const tituloCampo =(v, ph) => `<textarea id="f-t" rows="1" maxlength="100" placeholder="${ph}">${esc(v)}</textarea>`;
function ligaTitulo(g) {
  const tI = g.querySelector('#f-t'), cresce = () => { tI.style.height = 'auto'; tI.style.height = tI.scrollHeight + 2 + 'px'; };
  tI.oninput = cresce; tI.onkeydown = k => { if (k.key === 'Enter') k.preventDefault(); }; setTimeout(cresce, 0);
  return () => tI.value.replace(/\s+/g, ' ').trim();
}
const chipsDia = () => `<div class="chips" aria-label="Atalhos de dia"><button type="button" data-qd="0">Hoje</button><button type="button" data-qd="1">Amanhã</button><button type="button" data-qd="2">${maiusc(DIAS[dow(soma(hoje(), 2))])}</button></div>`;

function formEvento(id, dia, pre) {
  const e0 = D.eventos.find(x => x.id === id), novo = !e0;
  const e = e0 || Object.assign({ titulo: '', data: dia || dataSel, ini: proxHora(), fim: '', obs: '', lembrete: 15, rep: 'nao' }, pre || {});
  const ocorr = dia || e.data, serie = e0 && e0.rep !== 'nao';
  const L = [['', 'Sem aviso'], [0, 'Na hora'], [5, '5 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']];
  const todo = !e.ini;
  abrir(`<h2>${novo ? 'Novo compromisso' : 'Editar compromisso'}</h2>
    ${serie ? `<p class="aviso-box">Este compromisso se repete. O que você mudar aqui vale para todos os dias.</p>` : ''}
    <label>O que é${tituloCampo(e.titulo, 'Ex.: Reunião com a equipe')}</label>
    <label><span id="rot-d">${e.rep !== 'nao' ? 'Começa em' : 'Dia'}</span><input id="f-d" type="date" value="${e.data}"></label>
    ${chipsDia()}
    <label class="marca"><input id="f-todo" type="checkbox"${todo ? ' checked' : ''}> Dia todo (sem hora)</label>
    <div id="bloco-hora"${todo ? ' hidden' : ''}>
      <div class="dupla"><label>Começa<input id="f-i" type="time" value="${esc(e.ini || proxHora())}"></label><label>Termina<input id="f-f" type="time" value="${esc(e.fim)}"></label></div>
      <div class="chips" aria-label="Duração"><button type="button" data-dur="30">30 min</button><button type="button" data-dur="60">1 hora</button><button type="button" data-dur="90">1h30</button><button type="button" data-dur="120">2 horas</button></div>
      <label>Avisar<select id="f-l">${L.map(([v, r]) => `<option value="${v}"${String(e.lembrete ?? '') === String(v) ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    <label>Repete<select id="f-r">${opcoesRep(e.rep, e.data, ['nao', 'dia', 'uteis', 'semana', 'quinzena', 'mes'])}</select></label>
    <label>Observação<textarea id="f-o" rows="3" placeholder="Local, pauta, telefone…">${esc(e.obs)}</textarea></label>
    <p class="erro" id="f-err"></p>
    ${novo ? '' : `<button class="btn larga" id="f-convite" style="margin-bottom:8px">Enviar convite</button>
      ${serie ? `<div class="linha-btns" style="margin-bottom:8px"><button class="btn perigo" id="f-apagar1">Apagar só ${esc(relDia(ocorr) || curta(ocorr))}</button><button class="btn perigo" id="f-apagar">Apagar ${ocorr > e0.data ? 'deste dia em diante' : 'todos'}</button></div>`
        : '<button class="btn perigo larga" id="f-apagar">Apagar</button>'}`}
    <div class="acoes"><button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Salvar</button></div>`, g => {
    g.querySelector('#f-nao').onclick = fechar;
    const titulo = ligaTitulo(g);
    const dI = g.querySelector('#f-d'), iI = g.querySelector('#f-i'), fI = g.querySelector('#f-f'), rI = g.querySelector('#f-r'), todoI = g.querySelector('#f-todo');
    todoI.onchange = () => { g.querySelector('#bloco-hora').hidden = todoI.checked; };
    const reRep = () => { const v = rI.value; rI.innerHTML = opcoesRep(v, dI.value || e.data, ['nao', 'dia', 'uteis', 'semana', 'quinzena', 'mes']); rI.value = v; g.querySelector('#rot-d').textContent = v === 'nao' ? 'Dia' : 'Começa em'; };
    dI.onchange = reRep; rI.onchange = reRep;
    let iniAntes = iI.value;
    iI.onfocus = () => { iniAntes = iI.value; };
    iI.onchange = () => { if (fI.value && iniAntes && iI.value) { const dur = minDe(fI.value) - minDe(iniAntes); if (dur > 0 && minDe(iI.value) + dur < 1440) fI.value = hm(minDe(iI.value) + dur); } iniAntes = iI.value; };
    $$('[data-dur]', g).forEach(b => b.onclick = () => { if (!iI.value) return; fI.value = hm(Math.min(1439, minDe(iI.value) + Number(b.dataset.dur))); iniAntes = iI.value; });
    $$('[data-qd]', g).forEach(b => b.onclick = () => { dI.value = soma(hoje(), Number(b.dataset.qd)); reRep(); });
    if (!novo) {
      g.querySelector('#f-convite').onclick = () => enviarConvite(Object.assign({}, e0, { data: serie ? e0.data : ocorr }));
      const b = g.querySelector('#f-apagar');
      armar(b, 'Toque de novo para apagar', () => desfazivel('Compromisso apagado', () => {
        if (serie && ocorr > e0.data) e0.ate = soma(ocorr, -1); else D.eventos = D.eventos.filter(x => x.id !== id);
      }));
      const b1 = g.querySelector('#f-apagar1');
      if (b1) armar(b1, 'Toque de novo', () => desfazivel('Apagado só deste dia', () => { e0.pula = e0.pula || {}; e0.pula[ocorr] = 1; }));
    }
    g.querySelector('#f-ok').onclick = () => {
      const t = titulo(), d = dI.value, todoDia = todoI.checked, i = todoDia ? '' : iI.value, f = todoDia ? '' : fI.value, err = g.querySelector('#f-err');
      if (!t) { err.textContent = 'Escreva o que é o compromisso.'; return; }
      if (!d) { err.textContent = 'Escolha o dia.'; return; }
      if (!todoDia && !i) { err.textContent = 'Escolha a hora de começar, ou marque “Dia todo”.'; return; }
      if (f && f <= i) { err.textContent = 'A hora de terminar precisa ser depois da de começar.'; return; }
      const lv = g.querySelector('#f-l').value;
      const obj = { titulo: t, data: d, ini: i, fim: f, obs: g.querySelector('#f-o').value.trim(), lembrete: todoDia || lv === '' ? null : Number(lv), rep: rI.value };
      if (novo) D.eventos.push(Object.assign({ id: uid(), pula: {} }, obj));
      else { if (obj.rep !== e0.rep || obj.data !== e0.data) { obj.ate = null; obj.pula = {}; } Object.assign(e0, obj); }
      salvar(); fechar(); render();
      if (obj.lembrete != null && 'Notification' in window && Notification.permission === 'default') toast(novo ? 'Compromisso marcado. Ligar o aviso?' : 'Salvo. Ligar o aviso?', { rot: 'Ligar', acao: ligarAvisos }, 7000);
      else toast(novo ? 'Compromisso marcado' : 'Compromisso salvo');
    };
  });
}
function formTarefa(id, dia) {
  const t0 = D.tarefas.find(x => x.id === id), novo = !t0;
  const t = t0 || { titulo: '', data: dia || dataSel, rep: 'nao', prio: false, hora: '', aviso: true };
  abrir(`<h2>${novo ? 'Nova tarefa' : 'Editar tarefa'}</h2>
    <label>O que fazer${tituloCampo(t.titulo, 'Ex.: Conferir o caixa')}</label>
    <label><span id="rot-d">${t.rep !== 'nao' ? 'Começa em' : 'Dia'}</span><input id="f-d" type="date" value="${t.data}"></label>
    ${chipsDia()}
    <label>Repete<select id="f-r">${opcoesRep(t.rep, t.data, ['nao', 'dia', 'uteis', 'semana', 'mes'])}</select></label>
    <div class="dupla"><label>Hora (opcional)<input id="f-h" type="time" value="${esc(t.hora || '')}"></label>
      <label class="marca" style="align-self:end"><input id="f-a" type="checkbox"${t.aviso !== false ? ' checked' : ''}> Avisar na hora</label></div>
    <label class="marca"><input id="f-p" type="checkbox"${t.prio ? ' checked' : ''}> Importante (aparece primeiro)</label>
    <p class="erro" id="f-err"></p>
    ${novo ? '' : `<button class="btn larga" id="f-enviar" style="margin-bottom:8px">Enviar para alguém</button>
      <button class="btn perigo larga" id="f-apagar">Apagar</button>`}
    <div class="acoes"><button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Salvar</button></div>`, g => {
    const titulo = ligaTitulo(g), dI = g.querySelector('#f-d'), rI = g.querySelector('#f-r');
    const reRep = () => { const v = rI.value; rI.innerHTML = opcoesRep(v, dI.value || t.data, ['nao', 'dia', 'uteis', 'semana', 'mes']); rI.value = v; g.querySelector('#rot-d').textContent = v === 'nao' ? 'Dia' : 'Começa em'; };
    dI.onchange = reRep; rI.onchange = reRep;
    $$('[data-qd]', g).forEach(b => b.onclick = () => { dI.value = soma(hoje(), Number(b.dataset.qd)); reRep(); });
    g.querySelector('#f-nao').onclick = fechar;
    if (!novo) {
      g.querySelector('#f-enviar').onclick = () => compartilhar(textoTarefa(t0), 'Tarefa');
      armar(g.querySelector('#f-apagar'), t0.rep !== 'nao' ? 'Apagar todas as repetições?' : 'Toque de novo para apagar', () => desfazivel('Tarefa apagada', () => { D.tarefas = D.tarefas.filter(x => x.id !== id); }));
    }
    g.querySelector('#f-ok').onclick = () => {
      const tt = titulo(), d = dI.value, err = g.querySelector('#f-err');
      if (!tt) { err.textContent = 'Escreva o que é a tarefa.'; return; }
      if (!d) { err.textContent = 'Escolha o dia.'; return; }
      const obj = { titulo: tt, data: d, rep: rI.value, prio: g.querySelector('#f-p').checked, hora: g.querySelector('#f-h').value, aviso: g.querySelector('#f-a').checked };
      if (novo) D.tarefas.push(Object.assign({ id: uid(), feitas: {} }, obj)); else Object.assign(t0, obj);
      salvar(); fechar(); render();
      if (obj.hora && obj.aviso && 'Notification' in window && Notification.permission === 'default') toast('Tarefa salva. Ligar o aviso?', { rot: 'Ligar', acao: ligarAvisos }, 7000);
      else toast(novo ? 'Tarefa criada' : 'Tarefa salva');
    };
  });
}
function formRotina(id) {
  const r0 = D.rotinas.find(x => x.id === id), novo = !r0;
  const r = r0 || { nome: '', itens: [], dias: [] };
  abrir(`<h2>${novo ? 'Nova rotina' : 'Editar rotina'}</h2>
    <label>Nome<input id="r-n" maxlength="50" value="${esc(r.nome)}" placeholder="Ex.: Abertura da loja"></label>
    <label>Tarefas (uma por linha)<textarea id="r-i" rows="6" placeholder="Conferir o caixa&#10;Ligar as máquinas&#10;Ver a escala do dia">${esc(r.itens.join('\n'))}</textarea></label>
    <p style="font-weight:700;margin-bottom:6px">Entra sozinha nestes dias</p>
    <div class="chips dias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" data-dsem="${d}" aria-pressed="${r.dias.includes(d)}">${DIAS_CURTO[d]}</button>`).join('')}</div>
    <p class="mudo" style="margin:-4px 0 12px;font-size:.95rem">Sem nenhum dia marcado, ela só entra quando você tocar em “Pôr hoje”.</p>
    <p class="erro" id="f-err"></p>
    ${novo ? '' : '<button class="btn perigo larga" id="f-apagar">Apagar rotina</button>'}
    <div class="acoes"><button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Salvar</button></div>`, g => {
    $$('[data-dsem]', g).forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
    g.querySelector('#f-nao').onclick = fechar;
    if (!novo) armar(g.querySelector('#f-apagar'), 'Toque de novo para apagar', () => desfazivel('Rotina apagada', () => { D.rotinas = D.rotinas.filter(x => x.id !== id); }));
    g.querySelector('#f-ok').onclick = () => {
      const nome = g.querySelector('#r-n').value.trim(), itens = g.querySelector('#r-i').value.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40);
      const dias = $$('[data-dsem][aria-pressed="true"]', g).map(b => Number(b.dataset.dsem)), err = g.querySelector('#f-err');
      if (!nome) { err.textContent = 'Dê um nome à rotina.'; return; }
      if (!itens.length) { err.textContent = 'Escreva pelo menos uma tarefa.'; return; }
      let rot;
      if (novo) { rot = { id: uid(), nome, itens, dias }; D.rotinas.push(rot); } else { rot = Object.assign(r0, { nome, itens, dias }); }
      const h = hoje(), jaHoje = D.rotAplic[chaveRot(rot, h)];
      if (!jaHoje && dias.includes(dow(h))) D.rotAplic[chaveRot(rot, h)] = 1;  /* só entra sozinha a partir do próximo dia; hoje, se quiser, um toque */
      salvar(); fechar(); render();
      if (!jaHoje && dias.includes(dow(h))) toast('Rotina salva. Pôr hoje também?', { rot: 'Pôr hoje', acao: () => { aplicarRotina(rot, h); salvar(); render(); toast('Rotina posta em hoje'); } }, 7000);
      else toast('Rotina salva');
    };
  });
}

/* ───────── mandar por WhatsApp (ou qualquer app) ───────── */
function textoDia(s) {
  const ev = eventosDo(s), ts = tarefasDo(s);
  let t = `*${maiusc(nomeData(s, true))}*\n`;
  t += ev.length ? '\nCompromissos:\n' + ev.map(e => `• ${horario(e)} ${e.titulo}${e.obs ? ' (' + e.obs.split('\n')[0] + ')' : ''}`).join('\n') + '\n' : '\nSem compromissos.\n';
  if (ts.length) t += '\nTarefas:\n' + ts.map(x => `${feita(x, s) ? '✓' : '☐'} ${x.hora ? x.hora + ' ' : ''}${x.titulo}`).join('\n') + '\n';
  if (s === hoje()) { const p = pendentes(s); if (p.length) t += '\nPendentes:\n' + p.map(x => `☐ ${x.t.titulo}`).join('\n') + '\n'; }
  return t.trim();
}
function textoSemana(ini) {
  let t = `*Semana de ${curta(ini)} a ${curta(soma(ini, 6))}*\n`;
  for (let i = 0; i < 7; i++) { const s = soma(ini, i), ev = eventosDo(s); if (ev.length) t += `\n${maiusc(nomeData(s))}\n` + ev.map(e => `• ${horario(e)} ${e.titulo}`).join('\n') + '\n'; }
  return t.trim();
}
const textoTarefa = x => `Tarefa: ${x.titulo}\n${x.rep !== 'nao' ? repTexto(x) : 'Para ' + (relDia(x.data) || nomeData(x.data))}${x.hora ? ' às ' + x.hora : ''}`;
async function compartilhar(texto, titulo) {
  if (navigator.share) { try { await navigator.share({ title: titulo, text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(texto); toast('Copiado. É só colar no WhatsApp.'); }
  catch (e) { window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank'); }
}

/* ───────── convites de calendário (.ics) ───────── */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsUTC = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
function gerarIcs(e) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minha Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + (e.uid || e.id + '@minha-agenda'), 'DTSTAMP:' + icsUTC(Date.now())];
  if (e.ini) { const a = quandoMs(e.data, e.ini); L.push('DTSTART:' + icsUTC(a), 'DTEND:' + icsUTC(e.fim ? quandoMs(e.data, e.fim) : a + 3600e3)); }
  else L.push('DTSTART;VALUE=DATE:' + e.data.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + soma(e.data, 1).replace(/-/g, ''));
  const rr = { dia: 'FREQ=DAILY', uteis: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', semana: 'FREQ=WEEKLY', quinzena: 'FREQ=WEEKLY;INTERVAL=2', mes: 'FREQ=MONTHLY' }[e.rep];
  if (rr) L.push('RRULE:' + rr + (e.ate ? ';UNTIL=' + e.ate.replace(/-/g, '') + 'T235959Z' : ''));
  L.push('SUMMARY:' + icsEsc(e.titulo));
  if (e.obs) L.push('DESCRIPTION:' + icsEsc(e.obs));
  if (e.ini && e.lembrete != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.titulo), `TRIGGER:-PT${e.lembrete}M`, 'END:VALARM');
  L.push('END:VEVENT', 'END:VCALENDAR');
  return L.map(l => { let o = '', s = l; while (s.length > 74) { o += s.slice(0, 74) + '\r\n '; s = s.slice(74); } return o + s; }).join('\r\n') + '\r\n';
}
async function enviarConvite(e) {
  const nome = e.titulo.replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 40).replace(/ +/g, '-') || 'convite';
  const arq = new File([gerarIcs(e)], nome + '.ics', { type: 'text/calendar' });
  const texto = `${e.titulo}\n${maiusc(nomeData(e.data, true))}${e.ini ? ', ' + horario(e) : ''}${e.obs ? '\n' + e.obs : ''}`;
  if (navigator.canShare && navigator.canShare({ files: [arq] })) { try { await navigator.share({ files: [arq], text: texto, title: e.titulo }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(arq); a.download = arq.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Convite salvo: ' + arq.name);
}
function lerIcs(txt) {
  const linhas = txt.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const des = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const data = (v, p) => {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/); if (!m) return null;
    if (!m[4] || /VALUE=DATE(?!-)/.test(p)) return { data: `${m[1]}-${m[2]}-${m[3]}`, hora: '' };
    const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    return { data: iso(d), hora: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
  };
  const out = []; let ev = null, alarme = false;
  for (const l of linhas) {
    if (l === 'BEGIN:VEVENT') { ev = { obs: [] }; continue; }
    if (l === 'END:VEVENT') { if (ev && ev.ini) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    if (l === 'BEGIN:VALARM') { alarme = true; continue; } if (l === 'END:VALARM') { alarme = false; continue; }
    const i = l.indexOf(':'); if (i < 0) continue;
    const [nome, ...ps] = l.slice(0, i).split(';'), p = ps.join(';'), v = l.slice(i + 1);
    if (alarme) { if (nome === 'TRIGGER') { const m = v.match(/-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); if (m) ev.lembrete = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)); } continue; }
    if (nome === 'SUMMARY') ev.titulo = des(v).slice(0, 100);
    else if (nome === 'UID') ev.uid = v;
    else if (nome === 'DTSTART') ev.ini = data(v, p);
    else if (nome === 'DTEND') ev.fimD = data(v, p);
    else if (nome === 'LOCATION' && v) ev.obs.unshift('Local: ' + des(v));
    else if (nome === 'DESCRIPTION' && v) ev.obs.push(des(v));
    else if (nome === 'RRULE') ev.rrule = v;
  }
  return out.map(x => {
    const r = x.rrule || '', freq = (r.match(/FREQ=(\w+)/) || [])[1], intv = +((r.match(/INTERVAL=(\d+)/) || [])[1] || 1), ate = (r.match(/UNTIL=(\d{8})/) || [])[1];
    const rep = freq === 'DAILY' ? 'dia' : freq === 'WEEKLY' ? (/BYDAY=MO,TU,WE,TH,FR$|BYDAY=MO,TU,WE,TH,FR;/.test(r + ';') ? 'uteis' : intv === 2 ? 'quinzena' : 'semana') : freq === 'MONTHLY' ? 'mes' : 'nao';
    const fim = x.ini.hora && x.fimD && x.fimD.data === x.ini.data && x.fimD.hora > x.ini.hora ? x.fimD.hora : '';
    return { uid: x.uid, titulo: x.titulo || 'Compromisso', data: x.ini.data, ini: x.ini.hora, fim, obs: x.obs.join('\n').trim().slice(0, 500),
      lembrete: x.ini.hora ? (x.lembrete ?? 15) : null, rep, ate: ate ? `${ate.slice(0, 4)}-${ate.slice(4, 6)}-${ate.slice(6, 8)}` : null, pula: {} };
  });
}
function importarIcs(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let evs = []; try { evs = lerIcs(String(r.result)); } catch (e) { }
    if (!evs.length) return toast('Não achei nenhum compromisso nesse arquivo.');
    abrir(`<h2>Importar ${plural(evs.length, 'compromisso', 'compromissos')}?</h2>
      <div class="lista" style="margin-bottom:14px">${evs.slice(0, 6).map(e => `<div class="item"><span class="hora">${esc(curta(e.data))}<small>${esc(e.ini || 'Dia todo')}</small></span><span class="corpo"><span class="tt">${esc(e.titulo)}</span>${repTexto(e) ? `<span class="etq">${esc(repTexto(e))}</span>` : ''}</span></div>`).join('')}${evs.length > 6 ? `<p class="mudo">e mais ${evs.length - 6}</p>` : ''}</div>
      <div class="acoes"><button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Importar</button></div>`, g => {
      g.querySelector('#f-nao').onclick = fechar;
      g.querySelector('#f-ok').onclick = () => {
        let novos = 0;
        for (const e of evs) { const ja = e.uid && D.eventos.find(x => x.uid === e.uid); if (ja) Object.assign(ja, e); else { D.eventos.push(Object.assign({ id: uid() }, e)); novos++; } }
        salvar(); fechar(); aba = 'agenda'; modoAgenda = 'dia'; dataSel = evs[0].data; render();
        toast(novos === evs.length ? 'Convite importado' : `${novos} novo(s), ${evs.length - novos} atualizado(s)`);
      };
    });
  };
  r.readAsText(f);
}

/* ───────── toques ───────── */
document.addEventListener('click', ev => {
  const el = ev.target.closest('button'); if (!el || el.closest('#gaveta') || el.closest('.toast')) return;
  const d = el.dataset;
  if (d.aba) return irPara(d.aba);
  if (el.id === 'fab') return aba === 'tarefas' ? formTarefa(null, dataSel) : formEvento(null, dataSel);
  if ('novoEv' in d) return formEvento(null, hoje());
  if (d.novoEvDia) return formEvento(null, d.novoEvDia);
  if ('novoTf' in d) return formTarefa(null, hoje());
  if (d.ev) return formEvento(d.ev, d.dia);
  if (d.tf) return formTarefa(d.tf);
  if (d.chk) { marcar(d.chk, d.dia, el.getAttribute('aria-pressed') !== 'true' ? 1 : 0); return render(); }
  if (d.pfeita) return desfazivel('Marcada como feita', () => marcarSem(d.pfeita, d.dia, 1));
  if (d.ppula) return desfazivel('Deixada pra lá', () => marcarSem(d.ppula, d.dia, 'pulada'));
  if (d.phoje) return desfazivel('Passou para hoje', () => { const t = D.tarefas.find(x => x.id === d.phoje); if (t) t.data = hoje(); });
  if (d.passar) return desfazivel('Passou para amanhã', () => passarParaAmanha(d.passar));
  if (d.mover) { dataSel = soma(dataSel, Number(d.mover)); return render(); }
  if ('irhoje' in d) { dataSel = hoje(); return render(); }
  if (d.modo) { modoAgenda = d.modo; return render(); }
  if (d.diaSel) { dataSel = d.diaSel; modoAgenda = 'dia'; aba = 'agenda'; render(); return scrollTo(0, 0); }
  if ('vertarefas' in d) { aba = 'tarefas'; return render(); }
  if (d.rot) return formRotina(d.rot);
  if ('novaRot' in d) return formRotina(null);
  if (d.porRot) { const r = D.rotinas.find(x => x.id === d.porRot); if (r) { aplicarRotina(r, dataSel); salvar(); render(); toast(`${plural(r.itens.length, 'tarefa entrou', 'tarefas entraram')} no dia`); } return; }
  if (d.enviar) return compartilhar(d.enviar === 'semana' ? textoSemana(d.dia) : textoDia(d.dia), 'Agenda');
  if ('copiaDepois' in d) { D.cfg.backupDepois = soma(hoje(), 2); gravar(); return render(); }
  if (d.tema) { D.cfg.tema = d.tema; gravar(); aplicaVisual(); return render(); }
  if (d.letra) { D.cfg.letra = Number(d.letra); gravar(); aplicaVisual(); return render(); }
  if ('ligarAviso' in d) return ligarAvisos();
  if ('testeAviso' in d) return mostrarAviso('Teste da agenda', 'É assim que o aviso aparece.', 'teste');
  if ('criarCaixa' in d) { D.cfg.caixaChave = novaChave(); salvar(); render(); toast('Caixa criada. Agora copie o endereço e monte o atalho.'); const p = $('details.passos'); if (p) p.open = true; return; }
  if ('trocarCaixa' in d) { armarSolto(el, 'Toque de novo para trocar', () => { D.cfg.caixaChave = novaChave(); salvar(); render(); toast('Chave trocada. Cole o endereço novo no atalho.'); }); return; }
  if ('copiarCaixa' in d) { navigator.clipboard.writeText(enderecoCaixa()).then(() => toast('Endereço copiado'), () => toast('Não consegui copiar; toque e segure o endereço para copiar.')); return; }
  if ('buscarCaixa' in d) return buscarCaixa(true);
  if ('procurarVersao' in d) return procurarVersao(true);
  if ('irAgenda' in d) { aba = 'agenda'; modoAgenda = 'dia'; dataSel = hoje(); render(); return scrollTo(0, 0); }
  if ('irTarefas' in d) { const a = $('#sec-tarefas'); return a && a.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if ('irPend' in d) { const a = $('#sec-pend') || $('#sec-tarefas'); return a && a.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if ('exportar' in d) return exportar();
  if ('importar' in d) return $('#arq').click();
  if ('importarIcs' in d) { let i = $('#arq-ics'); if (!i) { i = document.createElement('input'); i.type = 'file'; i.id = 'arq-ics'; i.accept = '.ics,text/calendar'; i.hidden = true; document.body.append(i); } return i.click(); }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'q') { textoBusca = ev.target.value; mostraBusca(); }
  if (ev.target.id === 'notas') {
    const s = hoje(); D.notas[s] = ev.target.value; if (!D.notas[s]) delete D.notas[s];
    clearTimeout(window._tn); $('#salvo').textContent = '…';
    window._tn = setTimeout(() => { gravar(); const e = $('#salvo'); if (e) e.textContent = 'Salvo neste aparelho'; }, 400);
  }
});
document.addEventListener('submit', ev => {
  const f = ev.target.closest('[data-rapido]'); if (!f) return;
  ev.preventDefault();
  const i = f.querySelector('input'), t = i.value.replace(/\s+/g, ' ').trim();
  if (!t) { i.focus(); return; }
  D.tarefas.push({ id: uid(), titulo: t, data: f.dataset.rapido, rep: 'nao', prio: false, feitas: {} });
  salvar(); const y = scrollY; render(); scrollTo(0, y);
  const novo = document.querySelector(`[data-rapido="${f.dataset.rapido}"] input`); if (novo) novo.focus();  /* dá para emendar a próxima */
  toast('Tarefa adicionada');
});
/* arrastar o dedo para o lado troca o dia (ou a semana) na Agenda e em Tarefas */
let toque0 = null;
document.addEventListener('touchstart', e => { toque0 = (aba === 'agenda' || aba === 'tarefas') && !$('#gaveta') && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!toque0) return; const t = e.changedTouches[0], dx = t.clientX - toque0.x, dy = t.clientY - toque0.y; toque0 = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  dataSel = soma(dataSel, (dx < 0 ? 1 : -1) * (aba === 'agenda' && modoAgenda === 'semana' ? 7 : 1)); render();
}, { passive: true });
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'arq') { importar(t.files[0]); t.value = ''; }
  if (t.id === 'arq-ics') { importarIcs(t.files[0]); t.value = ''; }
  if (t.dataset.cfgLiga) { const k = t.dataset.cfgLiga, h = $(`[data-cfg-hora="${k}"]`); D.cfg[k] = t.checked ? h.value : ''; h.disabled = !t.checked; salvar(); }
  if (t.dataset.cfgHora && t.value) { D.cfg[t.dataset.cfgHora] = t.value; salvar(); toast('Horário salvo'); }
  if ('cfgAuto' in t.dataset) { D.cfg.autoPassar = t.checked; salvar(); if (t.checked) rodarDia(); }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fechar(); });

/* ───────── backup ───────── */
function exportar() {
  const blob = new Blob([JSON.stringify({ app: 'minha-agenda', salvoEm: new Date().toISOString(), dados: Object.assign({}, D, { avisados: {} }) }, null, 1)], { type: 'application/json' });
  const nome = 'agenda-copia-' + hoje() + '.json', arquivo = new File([blob], nome, { type: 'application/json' });
  const feito = () => { D.cfg.backup = Date.now(); gravar(); render(); toast('Cópia salva: ' + nome); };
  if (navigator.canShare && navigator.canShare({ files: [arquivo] }) && /Android|iPhone|iPad/.test(navigator.userAgent)) {
    navigator.share({ files: [arquivo], title: 'Cópia da agenda' }).then(feito).catch(() => { });
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); feito();
}
function importar(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let o; try { o = JSON.parse(r.result); } catch (e) { return toast('Esse arquivo não é uma cópia da agenda.'); }
    const d = o && o.dados ? o.dados : o;
    if (!d || !Array.isArray(d.eventos) || !Array.isArray(d.tarefas)) return toast('Esse arquivo não é uma cópia da agenda.');
    abrir(`<h2>Restaurar cópia?</h2><p style="margin-bottom:12px">A cópia tem ${plural(d.eventos.length, 'compromisso', 'compromissos')} e ${plural(d.tarefas.length, 'tarefa', 'tarefas')}${o.salvoEm ? ', de ' + esc(new Date(o.salvoEm).toLocaleDateString('pt-BR')) : ''}.</p>
      <p style="margin-bottom:14px"><b>O que está agora neste aparelho será trocado por ela.</b></p>
      <div class="acoes"><button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Restaurar</button></div>`, g => {
      g.querySelector('#f-nao').onclick = fechar;
      g.querySelector('#f-ok').onclick = () => {
        D = normaliza(Object.assign({}, d, { avisados: {} })); D.cfg.backup = Date.now();
        salvar(); aplicaVisual(); fechar(); render(); toast('Cópia restaurada');
      };
    });
  };
  r.readAsText(f);
}

/* ───────── avisos ─────────
   Tudo o que o app avisa vira um item {chave, quando, limite, titulo, corpo()}. Se o app abre depois do "quando"
   e antes do "limite", o aviso sai na hora; depois do limite, não sai mais. Cada chave só avisa uma vez. */
let timers = [];
function avisosDe(s) {
  const L = [];
  for (const e of eventosDo(s)) if (e.lembrete != null && e.ini) {
    const ini = quandoMs(s, e.ini);
    L.push({ chave: e.id + '@' + s + 'T' + e.ini, quando: ini - e.lembrete * 60000, limite: ini, titulo: e.titulo,
      corpo: () => { const f = Math.round((ini - Date.now()) / 60000); return (f > 90 ? `${maiusc(relDia(s) || curta(s))} às ${e.ini}` : f > 0 ? `Começa em ${f} min (${e.ini})` : `Começa agora (${e.ini})`) + (e.obs ? '\n' + e.obs : ''); } });
  }
  for (const t of tarefasDo(s)) if (t.hora && t.aviso !== false) {
    const q = quandoMs(s, t.hora);
    L.push({ chave: 't' + t.id + '@' + s + 'T' + t.hora, quando: q, limite: q + 30 * 60000, titulo: t.titulo, corpo: () => 'Tarefa das ' + t.hora, vale: () => !feita(t, s) });
  }
  if (D.cfg.manha) {
    const q = quandoMs(s, D.cfg.manha);
    L.push({ chave: 'manha@' + s, quando: q, limite: q + 90 * 60000, titulo: saudacaoDe(D.cfg.manha) + ' Seu dia hoje', corpo: () => resumoCurto(s) });
  }
  if (D.cfg.noite) {
    const q = quandoMs(s, D.cfg.noite);
    L.push({ chave: 'noite@' + s, quando: q, limite: q + 4 * 3600e3, titulo: 'Revisão do dia', corpo: () => `${plural(naoFeitas(s), 'tarefa ficou', 'tarefas ficaram')} por fazer. Abra para passar para amanhã.`, vale: () => naoFeitas(s) > 0 });
  }
  return L;
}
const saudacaoDe = h => minDe(h) < 720 ? 'Bom dia!' : minDe(h) < 1080 ? 'Boa tarde!' : 'Boa noite!';
function resumoCurto(s) {
  const ev = eventosDo(s), tm = ev.filter(comHora), nt = tarefasDo(s).length, np = s === hoje() ? pendentes(s).length : 0;
  let t = ev.length ? `${plural(ev.length, 'compromisso', 'compromissos')}${tm[0] ? `, o primeiro às ${tm[0].ini}: ${tm[0].titulo}` : ''}` : 'Nenhum compromisso';
  t += ` · ${plural(nt, 'tarefa', 'tarefas')}`; if (np) t += ` · ${plural(np, 'pendente', 'pendentes')}`;
  const d = diasSemCopia(); if ((D.eventos.length + D.tarefas.length) && (d == null || d >= 7)) t += '\nLembrete: salvar a cópia de segurança.';
  return t;
}
function agendarLembretes() {
  timers.forEach(clearTimeout); timers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const agora = Date.now(), h = hoje();
  for (const k in D.avisados) if (agora - D.avisados[k] > 30 * 864e5) delete D.avisados[k];
  for (const s of [h, soma(h, 1), soma(h, 2)]) for (const a of avisosDe(s)) {
    if (D.avisados[a.chave]) continue;
    if (a.quando <= agora) { if (agora < a.limite) avisar(a); continue; }
    if (a.quando - agora < 864e5) timers.push(setTimeout(() => avisar(a), a.quando - agora));
  }
}
function avisar(a) {
  if (D.avisados[a.chave]) return;
  D.avisados[a.chave] = Date.now(); gravar();
  if (a.vale && !a.vale()) return;
  mostrarAviso(a.titulo, a.corpo(), a.chave);
}
async function mostrarAviso(titulo, corpo, tag) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(titulo, { body: corpo, tag, icon: 'icones/icone-192.png', badge: 'icones/icone-192.png', vibrate: [200, 100, 200] });
    else new Notification(titulo, { body: corpo, tag });
  } catch (err) { }
  if (document.visibilityState === 'visible') toast(titulo + ' · ' + corpo.split('\n')[0], null, 5000);
}

/* ───────── visual ───────── */
function aplicaVisual() {
  const r = document.documentElement;
  if (D.cfg.tema === 'auto') r.removeAttribute('data-tema'); else r.setAttribute('data-tema', D.cfg.tema);
  r.style.fontSize = (D.cfg.letra || 100) + '%';
  const escuro = D.cfg.tema === 'escuro' || (D.cfg.tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').setAttribute('content', escuro ? '#0C0E13' : '#F3F4F8');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicaVisual);
function toast(t, botao, ms) {
  $('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
  const s = document.createElement('span'); s.textContent = t; el.append(s);
  if (botao) { const b = document.createElement('button'); b.textContent = botao.rot; b.onclick = () => { el.remove(); botao.acao(); }; el.append(b); }
  document.body.append(el); setTimeout(() => el.remove(), ms || 2600);
}

/* a tela se atualiza sozinha a cada minuto (o "agora" anda), sem atrapalhar quem está digitando */
let ultimoDia = hoje(), ultimoMin = agoraMin();
setInterval(() => {
  const d = hoje(), m = agoraMin();
  if (d !== ultimoDia) { if (dataSel === ultimoDia) dataSel = d; ultimoDia = d; rodarDia(); agendarLembretes(); }
  if (m === ultimoMin) return; ultimoMin = m;
  const digitando = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!$('#gaveta') && !digitando && (aba === 'hoje' || aba === 'agenda')) {
    const novo = TELAS[aba](), tela = $('#tela');
    if (novo !== tela._html) { const y = scrollY; tela.innerHTML = tela._html = novo; scrollTo(0, y); }
  }
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (hoje() !== ultimoDia) { if (dataSel === ultimoDia) dataSel = hoje(); ultimoDia = hoje(); rodarDia(); }
  agendarLembretes(); buscarCaixa();
  if (!$('#gaveta') && aba === 'hoje' && document.activeElement?.id !== 'notas') render();
});

/* ───────── início ───────── */
aplicaVisual(); rodarDia(); render(); agendarLembretes(); pedidoPeloEndereco(); buscarCaixa();
addEventListener('online', () => buscarCaixa());
setInterval(() => { if (document.visibilityState === 'visible') buscarCaixa(); }, 120000);
/* ───────── atualização sozinha ─────────
   A cada abertura (e ao voltar para o app) o navegador confere o sw.js. Se a versão mudou, a nova é baixada
   inteira por trás e assume; aqui o app recarrega na hora — só não interrompe quem está num formulário ou digitando:
   nesse caso a troca espera o app ir para o fundo, ou o toque em "Atualizar". */
let swReg = null, versaoAtual = '';
const ocupado = () => !!$('#gaveta') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
function recarregarNovo() { try { sessionStorage.setItem('agenda.atualizado', '1'); } catch (e) { } location.reload(); }
function procurarVersao(avisar) {
  if (!swReg) { if (avisar) toast('Atualização automática indisponível neste navegador.'); return; }
  swReg.update().then(() => { if (avisar && !swReg.installing && !swReg.waiting) toast('Você já está na versão mais nova.'); }).catch(() => { if (avisar) toast('Sem internet agora.'); });
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const jaTinha = !!navigator.serviceWorker.controller;   /* na primeira instalação não há o que trocar */
  let trocando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaTinha || trocando) return; trocando = true;
    if (!ocupado()) return recarregarNovo();
    toast('Versão nova do app pronta', { rot: 'Atualizar', acao: recarregarNovo }, 15000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') recarregarNovo(); }, { once: true });
  });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.versao) { versaoAtual = e.data.versao; const v = $('#versao'); if (v) v.textContent = versaoAtual.replace('agenda-', ''); } });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
    swReg = r; r.update().catch(() => { });
    navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage('versao'));
  }).catch(() => { });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(() => { }); });
}
try { if (sessionStorage.getItem('agenda.atualizado')) { sessionStorage.removeItem('agenda.atualizado'); setTimeout(() => toast('App atualizado para a versão mais nova'), 500); } } catch (e) { }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
