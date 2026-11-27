'use strict';
/* Entende uma frase falada em português e decide se é compromisso ou tarefa, de que dia e de que hora.
   "reunião com o João amanhã às 15h"        → compromisso, amanhã, 15:00
   "ligar para o contador sexta às 9 da manhã" → tarefa com hora, próxima sexta, 09:00
   "comprar papel"                             → tarefa de hoje
   A data é calculada a partir do momento em que a frase foi FALADA (refMs), não de quando o app a leu.
   Funciona no navegador (window.interpretarFala) e no Node (module.exports), para os testes. */
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const sem = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  const NUM = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
  const ENCONTRO = /\b(reuniao|reunioes|consulta|encontro|almoco|jantar|cafe|visita|entrevista|call|videochamada|aula|treinamento|evento|apresentacao|dentista|medico|audiencia|palestra|festa|aniversario|voo|viagem)\b/;

  function interpretarFala(texto, refMs) {
    const ref = new Date(refMs || Date.now());
    /* "t" é o texto como foi falado; "s" é o mesmo sem acento e minúsculo, para procurar. Com o texto em NFC,
       tirar o acento não muda o tamanho (á→a), então uma posição achada em "s" vale em "t" e os dois são cortados juntos. */
    let t = ' ' + String(texto || '').normalize('NFC').replace(/\s+/g, ' ').trim() + ' ';
    let s = sem(t);
    if (s.length !== t.length) s = t.toLowerCase();
    const corta = re => { const m = s.match(re); if (!m) return null; const i = m.index; t = t.slice(0, i) + ' ' + t.slice(i + m[0].length); s = s.slice(0, i) + ' ' + s.slice(i + m[0].length); return m; };

    let tipo = null, prio = false;
    if (corta(/\b(urgente|importante|prioridade)\b/)) prio = true;
    if (corta(/^\s*(anotar|anota|anote|nova tarefa|tarefa|lembrar de|lembrar|me lembre de|me lembra de|lembrete)\s*:?\s*/)) tipo = 'tarefa';
    if (corta(/^\s*(marcar|marca|marque|agendar|agenda|agende|novo compromisso|compromisso)\s*:?\s*/)) tipo = 'compromisso';

    /* ── dia ── */
    let dia = null, diaSemana = false;
    const base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const mais = n => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d); };
    let m;
    if (corta(/\bdepois de amanha\b/)) dia = mais(2);
    else if (corta(/\bamanha\b/)) dia = mais(1);
    else if (corta(/\bhoje\b/)) dia = mais(0);
    else if ((m = corta(/\b(?:na |no |nesta |neste |essa |esta |proxima |proximo )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?(?: que vem)?\b/))) {
      let n = (DIAS[m[1]] - base.getDay() + 7) % 7; dia = mais(n); diaSemana = true;
    } else if ((m = corta(/\b(?:no |para o |pro )?dia (\d{1,2})(?: de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))?\b/))) {
      const meses = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      let mes = m[2] ? meses.indexOf(m[2]) : base.getMonth(), d = new Date(base.getFullYear(), mes, +m[1]);
      if (d < base) d = m[2] ? new Date(base.getFullYear() + 1, mes, +m[1]) : new Date(base.getFullYear(), mes + 1, +m[1]);
      dia = iso(d);
    } else if ((m = corta(/\b(?:em |no dia |dia )?(\d{1,2})\/(\d{1,2})\b/))) {
      let d = new Date(base.getFullYear(), +m[2] - 1, +m[1]); if (d < base) d = new Date(base.getFullYear() + 1, +m[2] - 1, +m[1]); dia = iso(d);
    }

    /* ── hora ── */
    let hora = '';
    const per = p => p && /tarde|noite/.test(p) ? 'pm' : p && /manha|madrugada/.test(p) ? 'am' : '';
    const fazHora = (h, mi, p) => { h = +h; mi = +(mi || 0); if (per(p) === 'pm' && h < 12) h += 12; if (per(p) === 'am' && h === 12) h = 0; if (!per(p) && h >= 1 && h <= 6) h += 12; /* "às 3" num dia de trabalho é à tarde */ return h < 24 && mi < 60 ? pad(h) + ':' + pad(mi) : ''; };
    if (corta(/\b(?:ao |a |as )?meio[- ]dia(?: e meia)?\b/)) hora = /meia/.test(s) ? '12:30' : '12:00';
    else if ((m = corta(/\b(?:as |a |ate as |pelas |por volta das )?(\d{1,2})(?::|h|\s?horas?\s?e\s?)(\d{2})\b(?:\s*(?:da |de )?(manha|tarde|noite|madrugada))?/))) hora = fazHora(m[1], m[2], m[3]);
    else if ((m = corta(/\b(?:as |a |pelas |por volta das )(\d{1,2}|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)(?: ?h(?:oras?)?)?( e meia)?(?:\s*(?:da |de )?(manha|tarde|noite|madrugada))?\b/)))
      hora = fazHora(NUM[m[1]] || m[1], m[2] ? 30 : 0, m[3]);
    else if ((m = corta(/\b(\d{1,2}) ?h(?:oras?)?( e meia)?(?:\s*(?:da |de )?(manha|tarde|noite|madrugada))?\b/))) hora = fazHora(m[1], m[2] ? 30 : 0, m[3]);

    /* "sexta às 9" dito numa sexta depois das 9 é a próxima sexta */
    if (diaSemana && dia === iso(base) && (!hora || hora <= pad(ref.getHours()) + ':' + pad(ref.getMinutes()))) dia = mais(7);

    /* ── o que sobrou é o título ── */
    let titulo = t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
      .replace(/\s+(?:para|pra|no|na|de|em|as|às|a|à)$/i, '').trim();
    titulo = titulo ? titulo[0].toUpperCase() + titulo.slice(1) : 'Anotação da Siri';
    if (!tipo) tipo = hora && ENCONTRO.test(sem(titulo)) ? 'compromisso' : 'tarefa';
    if (tipo === 'compromisso' && !hora) tipo = 'tarefa';   /* compromisso sem hora vira tarefa do dia, para não sumir num "dia todo" */
    return { tipo, titulo: titulo.slice(0, 100), data: dia || iso(base), hora, prio };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { interpretarFala };
  else window.interpretarFala = interpretarFala;
})();
