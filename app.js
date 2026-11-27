'use strict';
/* Minha Agenda — tudo fica neste aparelho (localStorage, chave "agenda.v1").
   Sem servidor e sem conta. O backup em arquivo (Ajustes) é a proteção contra perder os dados. */

const CHAVE = 'agenda.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ───────── dados ───────── */
function vazio() { return { v: 1, eventos: [], tarefas: [], notas: {}, cfg: { tema: 'auto', letra: 100, backup: null }, avisados: {} }; }
function carregar() {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE));
    if (o && o.v) { const b = vazio(); return Object.assign(b, o, { cfg: Object.assign(b.cfg, o.cfg || {}) }); }
  } catch (e) { }
  return vazio();
}
let D = carregar();
function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(D)); } catch (e) { toast('Não consegui salvar: o aparelho está sem espaço.'); } }
function salvar() { gravar(); agendarLembretes(); }

/* ───────── datas ───────── */
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hoje = () => iso(new Date());
const soma = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dow = s => deIso(s).getDay();
const nomeData = (s, longo) => { const d = deIso(s); return (longo ? DIAS_LONGO : DIAS)[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
const curta = s => { const d = deIso(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const minDe = h => { if (!h) return null; const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const agoraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function relDia(s) {
  const h = hoje();
  if (s === h) return 'hoje';
  if (s === soma(h, 1)) return 'amanhã';
  if (s === soma(h, -1)) return 'ontem';
  return '';
}
function proxHora() { const d = new Date(); return pad(Math.min(23, d.getHours() + 1)) + ':00'; }
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
function saudacao() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
function inicioSemana(s) { const d = dow(s); return soma(s, d === 0 ? -6 : 1 - d); }

/* ───────── compromissos ───────── */
const eventosDo = s => D.eventos.filter(e => e.data === s).sort((a, b) => (a.ini || '').localeCompare(b.ini || ''));
const fimMin = e => minDe(e.fim) ?? (minDe(e.ini) + 60);

/* ───────── tarefas ───────── */
const REP = { nao: 'Não repete', dia: 'Todo dia', uteis: 'Dias úteis (seg a sex)', semana: 'Toda semana' };
function ocorre(t, s) {
  if (s < t.data) return false;
  if (t.rep === 'nao') return s === t.data;
  const d = dow(s);
  if (t.rep === 'dia') return true;
  if (t.rep === 'uteis') return d >= 1 && d <= 5;
  if (t.rep === 'semana') return d === dow(t.data);
  return false;
}
const feita = (t, s) => !!(t.feitas && t.feitas[s]);
const tarefasDo = s => D.tarefas.filter(t => ocorre(t, s))
  .sort((a, b) => (feita(a, s) - feita(b, s)) || ((b.prio ? 1 : 0) - (a.prio ? 1 : 0)) || a.titulo.localeCompare(b.titulo));
function repTexto(t) { return t.rep === 'semana' ? 'Toda ' + DIAS[dow(t.data)] : t.rep === 'nao' ? '' : REP[t.rep]; }
/* o que ficou para trás: tarefa avulsa de qualquer dia anterior, e a repetida de ontem */
function pendentes(s) {
  const ontem = soma(s, -1), r = [];
  for (const t of D.tarefas) {
    if (t.rep === 'nao') { if (t.data < s && !feita(t, t.data)) r.push({ t, dia: t.data }); }
    else if (ocorre(t, ontem) && !feita(t, ontem)) r.push({ t, dia: ontem });
  }
  return r.sort((a, b) => (b.t.prio ? 1 : 0) - (a.t.prio ? 1 : 0) || a.dia.localeCompare(b.dia));
}
function marcar(id, dia, valor) {
  const t = D.tarefas.find(x => x.id === id); if (!t) return;
  t.feitas = t.feitas || {};
  if (valor) t.feitas[dia] = valor; else delete t.feitas[dia];
  salvar();
}

/* ───────── estado da tela ───────── */
let aba = 'hoje', dataSel = hoje(), modoAgenda = 'dia', textoBusca = '';
const TITULOS = { hoje: 'Hoje', agenda: 'Agenda', tarefas: 'Tarefas', buscar: 'Buscar', ajustes: 'Ajustes' };

function render() {
  $('#titulo').textContent = TITULOS[aba];
  document.querySelectorAll('nav.abas button').forEach(b => { if (b.dataset.aba === aba) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const tela = $('#tela'); tela.innerHTML = tela._html = TELAS[aba]();
  const fab = $('#fab');
  const f = { agenda: '<span>+</span> Compromisso', tarefas: '<span>+</span> Tarefa' }[aba];
  fab.hidden = !f; if (f) fab.innerHTML = f;
  if (aba === 'buscar') { const i = $('#q'); i.value = textoBusca; mostraBusca(); }
}
function irPara(a) { aba = a; if (a !== 'agenda' && a !== 'tarefas') dataSel = hoje(); render(); window.scrollTo(0, 0); }

/* pedaços de lista */
function itemEvento(e, now) {
  const hj = e.data === hoje();
  const passou = hj && now >= fimMin(e), atual = hj && now >= minDe(e.ini) && now < fimMin(e);
  return `<button class="item${passou ? ' passou' : ''}${atual ? ' atual' : ''}" data-ev="${e.id}">
    <span class="hora">${esc(e.ini)}${e.fim ? `<small>até ${esc(e.fim)}</small>` : ''}</span>
    <span class="corpo"><span class="tt">${esc(e.titulo)}</span>${e.obs ? `<span class="ob">${esc(e.obs)}</span>` : ''}
    ${atual ? '<span class="etq imp">Agora</span>' : ''}${e.lembrete != null ? `<span class="etq">Aviso ${e.lembrete ? e.lembrete + ' min antes' : 'na hora'}</span>` : ''}</span></button>`;
}
function itemTarefa(t, s) {
  const f = feita(t, s), r = repTexto(t);
  return `<div class="tarefa${f ? ' feita' : ''}">
    <button class="chk" data-chk="${t.id}" data-dia="${s}" aria-pressed="${f}" aria-label="${f ? 'Desmarcar' : 'Marcar como feita'}: ${esc(t.titulo)}"><i></i></button>
    <button class="corpo" data-tf="${t.id}"><span class="tt">${t.prio ? '<span class="estrela" aria-label="Importante">★</span> ' : ''}${esc(t.titulo)}</span>
    ${r ? `<span class="etq">${esc(r)}</span>` : ''}</button></div>`;
}
function itemPendente({ t, dia }) {
  const quando = relDia(dia) || ('desde ' + curta(dia));
  return `<div class="card pend"><p class="tt"><b>${t.prio ? '<span class="estrela">★</span> ' : ''}${esc(t.titulo)}</b></p>
    <p class="mudo">${esc(quando[0].toUpperCase() + quando.slice(1))}${t.rep !== 'nao' ? ' · ' + esc(repTexto(t)) : ''}</p>
    <div class="acoes"><button class="btn peq" data-pfeita="${t.id}" data-dia="${dia}">Feita</button>
    ${t.rep === 'nao' ? `<button class="btn peq" data-phoje="${t.id}">Passar para hoje</button>` : `<button class="btn peq" data-ppula="${t.id}" data-dia="${dia}">Deixar pra lá</button>`}</div></div>`;
}

/* ───────── HOJE (o resumo do dia) ───────── */
function cartaoAgora(ev, now) {
  const atual = ev.find(e => now >= minDe(e.ini) && now < fimMin(e));
  const prox = ev.find(e => minDe(e.ini) > now);
  if (!atual && !prox) return `<div class="card agora"><p class="rot">A seguir</p><p class="tit">${ev.length ? 'Os compromissos de hoje já passaram.' : 'Nenhum compromisso hoje.'}</p></div>`;
  let h = '<div class="card agora">';
  if (atual) h += `<p class="rot">Agora</p><p class="tit">${esc(atual.titulo)}</p><p>${esc(atual.ini)}${atual.fim ? ' até ' + esc(atual.fim) : ''}</p>`;
  if (prox) {
    const falta = minDe(prox.ini) - now, txt = falta < 60 ? `em ${falta} min` : `em ${Math.floor(falta / 60)} h${falta % 60 ? ' ' + falta % 60 + ' min' : ''}`;
    h += `${atual ? '<p class="rot" style="margin-top:10px">Depois</p>' : '<p class="rot">A seguir</p>'}<p class="tit">${esc(prox.titulo)}</p><p>${esc(prox.ini)} · ${txt}</p>`;
  }
  return h + '</div>';
}
function telaHoje() {
  const s = hoje(), ev = eventosDo(s), ts = tarefasDo(s), pend = pendentes(s), now = agoraMin();
  const nf = ts.filter(t => feita(t, s)).length, faltam = ev.filter(e => fimMin(e) > now);
  let h = `<section style="margin:4px 0 12px"><p class="sauda">${saudacao()}</p><h2>${esc(nomeData(s, true))}</h2>
    <p class="mudo">${plural(faltam.length, 'compromisso pela frente', 'compromissos pela frente')} · ${ts.length ? `${nf} de ${plural(ts.length, 'tarefa feita', 'tarefas feitas')}` : 'nenhuma tarefa'}</p></section>`;
  h += cartaoAgora(ev, now);
  h += `<div class="linha-btns" style="margin-bottom:6px"><button class="btn" data-novo-ev>+ Compromisso</button><button class="btn" data-novo-tf>+ Tarefa</button></div>`;
  h += `<h3>Compromissos de hoje</h3>` + (ev.length ? `<div class="lista">${ev.map(e => itemEvento(e, now)).join('')}</div>` : '<p class="vazio">Nada marcado para hoje.</p>');
  h += `<h3>Tarefas de hoje</h3>` + (ts.length ? `<div class="lista">${ts.map(t => itemTarefa(t, s)).join('')}</div>` : '<p class="vazio">Nenhuma tarefa para hoje.</p>');
  if (pend.length) h += `<h3>Ficou pendente</h3>${pend.map(itemPendente).join('')}`;
  h += `<h3>Anotações do dia</h3><textarea class="notas" id="notas" placeholder="Escreva aqui o que precisar lembrar hoje…">${esc(D.notas[s] || '')}</textarea><p class="salvo" id="salvo"></p>`;
  return h;
}

/* ───────── AGENDA ───────── */
function navData(passo) {
  const s = dataSel;
  let meio;
  if (passo === 7) { const ini = inicioSemana(s), fim = soma(ini, 6); meio = `${curta(ini)} a ${curta(fim)}`; }
  else meio = nomeData(s);
  const rel = passo === 7 ? (inicioSemana(hoje()) === inicioSemana(s) ? 'esta semana' : 'voltar a hoje') : (relDia(s) || 'voltar a hoje');
  return `<div class="navdata"><button class="seta" data-mover="-${passo}" aria-label="Anterior">‹</button>
    <button class="meio" data-irhoje>${esc(meio)}<small>${esc(rel)}</small></button>
    <button class="seta" data-mover="${passo}" aria-label="Próximo">›</button></div>`;
}
function telaAgenda() {
  let h = `<div class="seg" role="group" aria-label="Ver"><button data-modo="dia" aria-pressed="${modoAgenda === 'dia'}">Dia</button><button data-modo="semana" aria-pressed="${modoAgenda === 'semana'}">Semana</button></div>`;
  if (modoAgenda === 'dia') {
    const ev = eventosDo(dataSel), nt = tarefasDo(dataSel).length;
    h += navData(1);
    h += ev.length ? `<div class="lista">${ev.map(e => itemEvento(e, agoraMin())).join('')}</div>` : '<p class="vazio">Nada marcado neste dia.</p>';
    if (nt) h += `<p style="margin-top:14px"><button class="btn larga" data-vertarefas>${plural(nt, 'tarefa', 'tarefas')} neste dia ›</button></p>`;
  } else {
    h += navData(7);
    const ini = inicioSemana(dataSel), hj = hoje();
    h += '<div class="semana">';
    for (let i = 0; i < 7; i++) {
      const s = soma(ini, i), ev = eventosDo(s), nt = tarefasDo(s).length;
      h += `<button class="dia${s === hj ? ' hj' : ''}" data-dia-sel="${s}"><span class="dn">${esc(nomeData(s))}${s === hj ? ' · hoje' : ''}</span>
        ${ev.map(e => `<span class="ev" style="display:block"><b>${esc(e.ini)}</b> ${esc(e.titulo)}</span>`).join('') || '<span class="ev mudo" style="display:block">Livre</span>'}
        ${nt ? `<span class="etq">${plural(nt, 'tarefa', 'tarefas')}</span>` : ''}</button>`;
    }
    h += '</div>';
  }
  return h;
}

/* ───────── TAREFAS ───────── */
function telaTarefas() {
  const ts = tarefasDo(dataSel);
  let h = navData(1);
  h += ts.length ? `<div class="lista">${ts.map(t => itemTarefa(t, dataSel)).join('')}</div>` : '<p class="vazio">Nenhuma tarefa neste dia.</p>';
  if (dataSel === hoje()) { const p = pendentes(dataSel); if (p.length) h += `<h3>Ficou pendente</h3>${p.map(itemPendente).join('')}`; }
  const reps = D.tarefas.filter(t => t.rep !== 'nao').sort((a, b) => a.titulo.localeCompare(b.titulo));
  if (reps.length) h += `<h3>Tarefas que se repetem</h3><div class="lista">${reps.map(t => `<button class="item" data-tf="${t.id}"><span class="corpo"><span class="tt">${t.prio ? '<span class="estrela">★</span> ' : ''}${esc(t.titulo)}</span><span class="etq">${esc(repTexto(t))}</span></span></button>`).join('')}</div>`;
  return h;
}

/* ───────── BUSCAR ───────── */
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function telaBuscar() { return `<input class="busca" id="q" type="search" placeholder="Procurar compromissos e tarefas" autocomplete="off" enterkeyhint="search"><div id="res" style="margin-top:12px"></div>`; }
function mostraBusca() {
  const q = norm(textoBusca.trim()), alvo = $('#res'); if (!alvo) return;
  if (!q) { alvo.innerHTML = '<p class="vazio">Digite uma palavra: o nome de uma pessoa, um assunto, um lugar.</p>'; return; }
  const ev = D.eventos.filter(e => norm(e.titulo + ' ' + e.obs).includes(q)).sort((a, b) => (b.data + b.ini).localeCompare(a.data + a.ini));
  const ts = D.tarefas.filter(t => norm(t.titulo).includes(q));
  if (!ev.length && !ts.length) { alvo.innerHTML = '<p class="vazio">Nada encontrado.</p>'; return; }
  let h = '';
  if (ev.length) h += `<h3>Compromissos</h3><div class="lista">${ev.slice(0, 50).map(e => `<button class="item" data-ev="${e.id}"><span class="hora">${esc(curta(e.data))}<small>${esc(e.ini)}</small></span><span class="corpo"><span class="tt">${esc(e.titulo)}</span>${e.obs ? `<span class="ob">${esc(e.obs)}</span>` : ''}</span></button>`).join('')}</div>`;
  if (ts.length) h += `<h3>Tarefas</h3><div class="lista">${ts.slice(0, 50).map(t => `<button class="item" data-tf="${t.id}"><span class="corpo"><span class="tt">${t.prio ? '<span class="estrela">★</span> ' : ''}${esc(t.titulo)}</span><span class="etq">${esc(t.rep === 'nao' ? curta(t.data) : repTexto(t))}</span></span></button>`).join('')}</div>`;
  alvo.innerHTML = h;
}

/* ───────── AJUSTES ───────── */
function estadoAvisos() {
  if (!('Notification' in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return { txt: ios ? 'No iPhone, os avisos só funcionam com o app na tela inicial (Compartilhar › Adicionar à Tela de Início). Depois abra por lá e volte aqui.' : 'Este navegador não mostra avisos.', btn: '' };
  }
  if (Notification.permission === 'granted') return { txt: 'Avisos ligados.', btn: '<button class="btn" data-teste-aviso>Testar um aviso</button>' };
  if (Notification.permission === 'denied') return { txt: 'Os avisos estão bloqueados nas configurações do navegador para este app.', btn: '' };
  return { txt: 'Ligue para receber um aviso antes de cada compromisso.', btn: '<button class="btn pri" data-ligar-aviso>Ligar avisos</button>' };
}
function telaAjustes() {
  const a = estadoAvisos(), b = D.cfg.backup;
  const dias = b ? Math.floor((Date.now() - b) / 864e5) : null;
  const op = (grupo, val, rot) => `<button class="btn" data-${grupo}="${val}" aria-pressed="${String(D.cfg[grupo]) === String(val)}">${rot}</button>`;
  return `<div class="card"><h2>Aparência</h2><p class="mudo" style="margin-bottom:8px">Tema</p>
    <div class="opcoes">${op('tema', 'auto', 'Automático')}${op('tema', 'claro', 'Claro')}${op('tema', 'escuro', 'Escuro')}</div>
    <p class="mudo" style="margin:12px 0 8px">Tamanho da letra</p>
    <div class="opcoes">${op('letra', 100, 'Grande')}${op('letra', 112, 'Maior')}${op('letra', 125, 'Enorme')}</div></div>
  <div class="card"><h2>Avisos dos compromissos</h2><p style="margin-bottom:10px">${esc(a.txt)}</p>${a.btn}
    <p class="mudo" style="margin-top:10px;font-size:.95rem">Como o app não tem servidor, o aviso é dado pelo próprio celular: ele chega com o app aberto ou aberto há pouco em segundo plano. Com o celular parado por muito tempo, pode não chegar.</p></div>
  <div class="card"><h2>Cópia de segurança</h2>
    <p style="margin-bottom:10px">Seus dados ficam só neste aparelho. Se o celular for trocado, perdido ou o navegador for limpo, eles somem. Guarde uma cópia de vez em quando (no e-mail, no Drive, no WhatsApp para você mesmo).</p>
    ${dias == null ? '<div class="aviso-box">Você ainda não fez nenhuma cópia.</div>' : dias >= 7 ? `<div class="aviso-box">Última cópia há ${plural(dias, 'dia', 'dias')}.</div>` : `<p class="mudo" style="margin-bottom:10px">Última cópia: ${dias === 0 ? 'hoje' : 'há ' + plural(dias, 'dia', 'dias')}.</p>`}
    <div class="linha-btns"><button class="btn pri" data-exportar>Salvar cópia</button><button class="btn" data-importar>Restaurar cópia</button></div>
    <input type="file" id="arq" accept="application/json,.json" hidden></div>
  <div class="card"><h2>Neste aparelho</h2><p class="mudo">${plural(D.eventos.length, 'compromisso', 'compromissos')} · ${plural(D.tarefas.length, 'tarefa', 'tarefas')} · ${plural(Object.keys(D.notas).filter(k => D.notas[k]).length, 'dia com anotação', 'dias com anotação')}</p></div>`;
}

const TELAS = { hoje: telaHoje, agenda: telaAgenda, tarefas: telaTarefas, buscar: telaBuscar, ajustes: telaAjustes };

/* ───────── gaveta (formulários) ───────── */
function abrir(html, ligar) {
  fechar();
  const veu = document.createElement('div'); veu.className = 'veu'; veu.id = 'veu';
  const g = document.createElement('div'); g.className = 'gaveta'; g.id = 'gaveta'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
  g.innerHTML = html; veu.onclick = fechar;
  document.body.append(veu, g);
  ligar(g);
  const pri = g.querySelector('input,select,textarea'); if (pri && !pri.value) setTimeout(() => pri.focus(), 50);
}
function fechar() { $('#veu')?.remove(); $('#gaveta')?.remove(); }
function botaoApagar(g, texto, acao) {
  const b = g.querySelector('#f-apagar'); if (!b) return;
  b.onclick = () => { if (b.dataset.armado) { acao(); fechar(); render(); return; } b.dataset.armado = 1; b.textContent = texto; setTimeout(() => { if (b.isConnected) { delete b.dataset.armado; b.textContent = 'Apagar'; } }, 4000); };
}
function formEvento(id, dia) {
  const e0 = D.eventos.find(x => x.id === id), novo = !e0;
  const e = e0 || { titulo: '', data: dia || dataSel, ini: proxHora(), fim: '', obs: '', lembrete: 15 };
  const L = [['', 'Sem aviso'], [0, 'Na hora'], [5, '5 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']];
  abrir(`<h2>${novo ? 'Novo compromisso' : 'Editar compromisso'}</h2>
    <label>O que é<input id="f-t" maxlength="100" value="${esc(e.titulo)}" placeholder="Ex.: Reunião com a equipe"></label>
    <label>Dia<input id="f-d" type="date" value="${e.data}"></label>
    <div class="dupla"><label>Começa<input id="f-i" type="time" value="${esc(e.ini)}"></label><label>Termina<input id="f-f" type="time" value="${esc(e.fim)}"></label></div>
    <label>Avisar<select id="f-l">${L.map(([v, r]) => `<option value="${v}"${String(e.lembrete ?? '') === String(v) ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>Observação<textarea id="f-o" rows="3" placeholder="Local, pauta, telefone…">${esc(e.obs)}</textarea></label>
    <p class="erro" id="f-err"></p>
    <div class="acoes">${novo ? '' : '<button class="btn perigo" id="f-apagar">Apagar</button>'}<button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Salvar</button></div>`, g => {
    g.querySelector('#f-nao').onclick = fechar;
    botaoApagar(g, 'Toque de novo para apagar', () => { D.eventos = D.eventos.filter(x => x.id !== id); salvar(); toast('Compromisso apagado'); });
    g.querySelector('#f-ok').onclick = () => {
      const t = g.querySelector('#f-t').value.trim(), d = g.querySelector('#f-d').value, i = g.querySelector('#f-i').value, f = g.querySelector('#f-f').value;
      const err = g.querySelector('#f-err');
      if (!t) { err.textContent = 'Escreva o que é o compromisso.'; return; }
      if (!d) { err.textContent = 'Escolha o dia.'; return; }
      if (!i) { err.textContent = 'Escolha a hora de começar.'; return; }
      if (f && f <= i) { err.textContent = 'A hora de terminar precisa ser depois da de começar.'; return; }
      const lv = g.querySelector('#f-l').value;
      const obj = { id: id || uid(), titulo: t, data: d, ini: i, fim: f, obs: g.querySelector('#f-o').value.trim(), lembrete: lv === '' ? null : Number(lv) };
      if (novo) D.eventos.push(obj); else Object.assign(e0, obj);
      salvar(); fechar(); render(); toast(novo ? 'Compromisso marcado' : 'Compromisso salvo');
      if (obj.lembrete != null && 'Notification' in window && Notification.permission === 'default') setTimeout(() => toast('Para receber o aviso, ligue os avisos em Ajustes.'), 2600);
    };
  });
}
function formTarefa(id, dia) {
  const t0 = D.tarefas.find(x => x.id === id), novo = !t0;
  const t = t0 || { titulo: '', data: dia || dataSel, rep: 'nao', prio: false };
  const opRep = d => Object.entries(REP).map(([k, v]) => `<option value="${k}"${t.rep === k ? ' selected' : ''}>${k === 'semana' ? 'Toda semana (' + DIAS[dow(d)] + ')' : v}</option>`).join('');
  abrir(`<h2>${novo ? 'Nova tarefa' : 'Editar tarefa'}</h2>
    <label>O que fazer<input id="f-t" maxlength="100" value="${esc(t.titulo)}" placeholder="Ex.: Conferir o caixa"></label>
    <label id="rot-d">Dia${t.rep !== 'nao' ? ' em que começa' : ''}<input id="f-d" type="date" value="${t.data}"></label>
    <label>Repete<select id="f-r">${opRep(t.data)}</select></label>
    <label class="marca"><input id="f-p" type="checkbox"${t.prio ? ' checked' : ''}> Importante (aparece primeiro)</label>
    <p class="erro" id="f-err"></p>
    <div class="acoes">${novo ? '' : '<button class="btn perigo" id="f-apagar">Apagar</button>'}<button class="btn" id="f-nao">Cancelar</button><button class="btn pri" id="f-ok">Salvar</button></div>`, g => {
    const dI = g.querySelector('#f-d'), rI = g.querySelector('#f-r');
    const rotulo = () => { g.querySelector('#rot-d').firstChild.nodeValue = rI.value === 'nao' ? 'Dia' : 'Dia em que começa'; };
    dI.onchange = () => { if (!dI.value) return; const v = rI.value; rI.innerHTML = opRep(dI.value); rI.value = v; };
    rI.onchange = rotulo;
    g.querySelector('#f-nao').onclick = fechar;
    botaoApagar(g, t0 && t0.rep !== 'nao' ? 'Apagar todas as repetições?' : 'Toque de novo para apagar', () => { D.tarefas = D.tarefas.filter(x => x.id !== id); salvar(); toast('Tarefa apagada'); });
    g.querySelector('#f-ok').onclick = () => {
      const tt = g.querySelector('#f-t').value.trim(), d = dI.value, err = g.querySelector('#f-err');
      if (!tt) { err.textContent = 'Escreva o que é a tarefa.'; return; }
      if (!d) { err.textContent = 'Escolha o dia.'; return; }
      const obj = { titulo: tt, data: d, rep: rI.value, prio: g.querySelector('#f-p').checked };
      if (novo) D.tarefas.push(Object.assign({ id: uid(), feitas: {} }, obj)); else Object.assign(t0, obj);
      salvar(); fechar(); render(); toast(novo ? 'Tarefa criada' : 'Tarefa salva');
    };
  });
}

/* ───────── toques ───────── */
document.addEventListener('click', ev => {
  const el = ev.target.closest('button'); if (!el || el.closest('#gaveta')) return;
  const d = el.dataset;
  if (d.aba) return irPara(d.aba);
  if (el.id === 'fab') return aba === 'tarefas' ? formTarefa(null, dataSel) : formEvento(null, dataSel);
  if ('novoEv' in d) return formEvento(null, hoje());
  if ('novoTf' in d) return formTarefa(null, hoje());
  if (d.ev) return formEvento(d.ev);
  if (d.tf) return formTarefa(d.tf);
  if (d.chk) { marcar(d.chk, d.dia, el.getAttribute('aria-pressed') !== 'true' ? 1 : 0); return render(); }
  if (d.pfeita) { marcar(d.pfeita, d.dia, 1); toast('Marcada como feita'); return render(); }
  if (d.ppula) { marcar(d.ppula, d.dia, 'pulada'); return render(); }
  if (d.phoje) { const t = D.tarefas.find(x => x.id === d.phoje); if (t) { t.data = hoje(); salvar(); toast('Passou para hoje'); } return render(); }
  if (d.mover) { dataSel = soma(dataSel, Number(d.mover)); return render(); }
  if ('irhoje' in d) { dataSel = hoje(); return render(); }
  if (d.modo) { modoAgenda = d.modo; return render(); }
  if (d.diaSel) { dataSel = d.diaSel; modoAgenda = 'dia'; return render(); }
  if ('vertarefas' in d) { aba = 'tarefas'; return render(); }
  if (d.tema) { D.cfg.tema = d.tema; gravar(); aplicaVisual(); return render(); }
  if (d.letra) { D.cfg.letra = Number(d.letra); gravar(); aplicaVisual(); return render(); }
  if ('ligarAviso' in d) { Notification.requestPermission().then(() => { agendarLembretes(); render(); }); return; }
  if ('testeAviso' in d) return mostrarAviso('Teste da agenda', 'É assim que o aviso do compromisso aparece.', 'teste');
  if ('exportar' in d) return exportar();
  if ('importar' in d) return $('#arq').click();
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'q') { textoBusca = ev.target.value; mostraBusca(); }
  if (ev.target.id === 'notas') {
    const s = hoje(); D.notas[s] = ev.target.value; if (!D.notas[s]) delete D.notas[s];
    clearTimeout(window._tn); $('#salvo').textContent = '…';
    window._tn = setTimeout(() => { gravar(); const e = $('#salvo'); if (e) e.textContent = 'Salvo neste aparelho'; }, 400);
  }
});
document.addEventListener('change', ev => { if (ev.target.id === 'arq') importar(ev.target.files[0]); });
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
        const b = vazio();
        D = Object.assign(b, d, { cfg: Object.assign(b.cfg, d.cfg || {}, { backup: Date.now() }), avisados: {} });
        salvar(); aplicaVisual(); fechar(); render(); toast('Cópia restaurada');
      };
    });
  };
  r.readAsText(f);
  $('#arq').value = '';
}

/* ───────── avisos ───────── */
let timers = [];
const inicioMs = e => { const d = deIso(e.data); const [h, m] = e.ini.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };
function agendarLembretes() {
  timers.forEach(clearTimeout); timers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const agora = Date.now();
  for (const k in D.avisados) if (agora - D.avisados[k] > 30 * 864e5) delete D.avisados[k];
  for (const e of D.eventos) {
    if (e.lembrete == null || !e.ini) continue;
    const ini = inicioMs(e), quando = ini - e.lembrete * 60000, chave = e.id + '@' + e.data + 'T' + e.ini;
    if (D.avisados[chave]) continue;
    if (quando <= agora) { if (ini > agora - 5 * 60000) avisar(e, chave); continue; }
    if (quando - agora < 864e5) timers.push(setTimeout(() => avisar(e, chave), quando - agora));
  }
}
function avisar(e, chave) {
  if (D.avisados[chave]) return;
  D.avisados[chave] = Date.now(); gravar();
  const falta = Math.round((inicioMs(e) - Date.now()) / 60000);
  const quando = falta > 90 ? `${relDia(e.data) || curta(e.data)} às ${e.ini}` : falta > 0 ? `Começa em ${falta} min (${e.ini})` : `Começa agora (${e.ini})`;
  mostrarAviso(e.titulo, quando + (e.obs ? '\n' + e.obs : ''), chave);
}
async function mostrarAviso(titulo, corpo, tag) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(titulo, { body: corpo, tag, icon: 'icones/icone-192.png', badge: 'icones/icone-192.png', vibrate: [200, 100, 200] });
    else new Notification(titulo, { body: corpo, tag });
  } catch (err) { }
  if (document.visibilityState === 'visible') toast('Aviso: ' + titulo + ' · ' + corpo.split('\n')[0]);
}

/* ───────── visual ───────── */
function aplicaVisual() {
  const r = document.documentElement;
  if (D.cfg.tema === 'auto') r.removeAttribute('data-tema'); else r.setAttribute('data-tema', D.cfg.tema);
  r.style.fontSize = (D.cfg.letra || 100) + '%';
  const escuro = D.cfg.tema === 'escuro' || (D.cfg.tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').setAttribute('content', escuro ? '#0E1116' : '#F4F6FA');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicaVisual);
function toast(t) {
  $('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
  document.body.append(el); setTimeout(() => el.remove(), 2600);
}

/* a tela de hoje se atualiza sozinha a cada minuto (o "agora" anda), sem atrapalhar quem está digitando */
let ultimoDia = hoje(), ultimoMin = agoraMin();
setInterval(() => {
  const d = hoje(), m = agoraMin();
  if (d !== ultimoDia) { if (dataSel === ultimoDia) dataSel = d; ultimoDia = d; agendarLembretes(); }
  if (m === ultimoMin) return; ultimoMin = m;
  const digitando = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!$('#gaveta') && !digitando && (aba === 'hoje' || aba === 'agenda')) {
    const novo = TELAS[aba](), tela = $('#tela');
    if (novo !== tela._html) { const y = scrollY; tela.innerHTML = tela._html = novo; scrollTo(0, y); }
  }
}, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { agendarLembretes(); if (!$('#gaveta') && aba === 'hoje' && document.activeElement?.id !== 'notas') render(); } });

/* ───────── início ───────── */
aplicaVisual(); render(); agendarLembretes();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
