# Minha Agenda

Agenda, tarefas e resumo do dia para o celular. Funciona sem internet, sem conta e sem servidor:
tudo fica guardado no próprio aparelho.

## O que tem

- **Hoje**: o que vem agora, os compromissos e as tarefas do dia, o que ficou pendente
  (tarefa avulsa atrasada e tarefa repetida de ontem) e as anotações do dia.
- **Agenda**: vista do dia e da semana; criar, editar e apagar compromissos (título, dia,
  início, fim, observação e aviso).
- **Tarefas**: marcar como feita, marcar como importante (aparece primeiro) e repetir todo dia,
  em dias úteis ou toda semana.
- **Buscar**: procura em compromissos e tarefas.
- **Ajustes**: tema claro/escuro/automático, tamanho da letra, avisos e cópia de segurança.

### O que acontece sozinho

- **Compromissos que se repetem**: todo dia, dias úteis, toda semana, a cada 2 semanas, todo mês;
  apagar só um dia ou deste dia em diante. Compromisso de **dia todo**.
- **Rotinas** (aba Tarefas): uma lista de tarefas que entra no dia com um toque, ou sozinha
  nos dias da semana marcados.
- **Tarefa com hora** e aviso na hora.
- **Resumo da manhã** (aviso no horário escolhido) e **revisão do fim do dia** (aviso, e o Hoje
  oferece passar o que ficou para amanhã). Uma vez por semana, o resumo lembra da cópia.
- **Pendências sozinhas para o dia seguinte** (opcional, em Ajustes).
- **Enviar** o resumo do dia, a semana ou uma tarefa pelo WhatsApp (ou qualquer app).
- **Convites (.ics)**: importar o convite de reunião que chegou por e-mail; mandar um
  compromisso daqui como convite.
- **Pela voz**: o microfone do teclado funciona em todo campo. Endereço que anota sozinho
  (para um atalho de voz no Android, com o app instalado):
  `https://condeizz.github.io/agenda/?tarefa=Texto&hora=17:30` (ou `?compromisso=Texto&dia=amanha&hora=14:00`).
- **Anotar pela Siri** (Ajustes › Anotar pela Siri): "Ei Siri, anotar na agenda" › fale a frase. O atalho manda
  para a caixa de entrada (`caixa/worker.js`, Cloudflare Worker + KV) e o app, ao abrir, entende
  a frase (`fala.js`), anota e esvazia a caixa. A chave é criada no celular; a caixa guarda no máximo 30 dias.
  Leva cerca de 1 minuto para uma frase nova aparecer (o KV demora a listar). Publicar a caixa: `cd caixa; npx wrangler deploy`.

## Rodar no computador

```
node ferramentas/servidor.mjs
```

Abre em http://localhost:4400. O servidor também mostra o endereço na rede (ex.: `http://192.168.0.10:4400`).

## No ar

**https://condeizz.github.io/agenda/** (GitHub Pages, repositório público `Condeizz/agenda`;
cada `git push` no `main` publica sozinho em cerca de um minuto).

## Colocar no celular

O app precisa estar num endereço **https** para funcionar sem internet e ser instalado
(o navegador só libera isso em https ou no próprio computador). O jeito mais simples é
publicar a pasta num serviço grátis de site estático:

1. Entre em https://app.netlify.com/drop (ou Cloudflare Pages / GitHub Pages).
2. Arraste a pasta `agenda` inteira para a página. Ele dá um endereço https.
3. Abra esse endereço no celular **uma vez com internet**.
4. Instale:
   - **Android (Chrome)**: menu ⋮ › *Instalar app* (ou *Adicionar à tela inicial*).
   - **iPhone (Safari)**: botão Compartilhar › *Adicionar à Tela de Início*.
5. Abra pelo ícone **Agenda**. A partir daí funciona sem internet.

Os dados não vão para esse site: ele só entrega os arquivos do app. Cada celular guarda os seus.

## Avisos

Ligue em Ajustes › *Ligar avisos*. No iPhone só funcionam com o app aberto pela tela inicial.
Sem servidor, quem dispara o aviso é o próprio celular, então ele chega com o app aberto ou
aberto há pouco; com o celular parado por muito tempo pode não chegar.

## Cópia de segurança (importante)

Se o celular for trocado ou perdido, ou o navegador for limpo, os dados somem.
Em Ajustes › *Salvar cópia*, guarde o arquivo `.json` (no e-mail, Drive ou WhatsApp para você).
Para voltar: Ajustes › *Restaurar cópia*. O app avisa quando a última cópia tem mais de 7 dias.

## Ao mudar algum arquivo

Suba a `VERSAO` em `sw.js` (ex.: `agenda-v4`); o celular pega a versão nova na abertura seguinte.
Ícones: desenho em `icones/icone.svg`; os PNG saem com `node ferramentas/icones.mjs` (usa o Edge do Windows).
