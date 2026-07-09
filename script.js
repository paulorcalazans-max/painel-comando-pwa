const STORAGE_KEY = "painel_comando_pwa_v1";

const subjects = [
  "Português",
  "Informática",
  "Contabilidade",
  "Direito Constitucional",
  "Direito Administrativo",
  "Raciocínio Lógico"
];

const quotes = [
  "A repetição qualificada separa o amador do fora de série.",
  "Disciplina não é intensidade ocasional. É retorno diário ao eixo.",
  "A vida é combate. Hoje, cumpra o bloco.",
  "Menos promessa. Mais execução.",
  "Não negocie com a preguiça. Registre, revise e avance.",
  "Quem vence o dia vence por partes.",
  "O ciclo não exige pressa. Exige retorno.",
  "O erro registrado vira munição para a próxima revisão.",
  "Hoje não precisa ser perfeito. Precisa ser cumprido.",
  "Fortitude é permanecer quando a vontade oscila."
];

const defaultState = {
  cycleIndex: 0,
  cycleRunning: false,
  cycleStart: null,
  records: {
    estudo: [],
    revisao: [],
    musculacao: [],
    corrida: [],
    sono: [],
    batimentos: [],
    auditoria: []
  }
};

let state = loadState();
let deferredPrompt = null;

function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? merge(defaultState, saved) : structuredClone(defaultState);
  }catch(e){
    return structuredClone(defaultState);
  }
}

function merge(base, extra){
  const out = structuredClone(base);
  Object.assign(out, extra);
  out.records = Object.assign({}, base.records, extra.records || {});
  return out;
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(){
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO(){
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0,10);
}

function brDate(iso){
  if(!iso) return "-";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function percent(acertos,total){
  total = num(total); acertos = num(acertos);
  if(total <= 0) return 0;
  return Math.round((acertos / total) * 1000) / 10;
}

function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2600);
}

function setView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelector(`#view-${name}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view === name));
  const titles = {
    hoje:"Hoje", estudo:"Estudo", revisao:"Revisão de Estudos", musculacao:"Musculação",
    corrida:"Corrida", sono:"Sono", batimentos:"Batimentos", historico:"Histórico",
    semanal:"Painel Semanal", auditoria:"Auditoria Semanal", backup:"Backup"
  };
  document.getElementById("viewTitle").textContent = titles[name] || "Painel";
  window.scrollTo({top:0,behavior:"smooth"});
  render();
}

function render(){
  document.getElementById("todayLabel").textContent = brDate(todayISO());
  document.getElementById("rotatingQuote").textContent = quotes[new Date().getDate() % quotes.length];
  renderHoje();
  renderEstudo();
  renderRevisao();
  renderMusculacao();
  renderCorrida();
  renderSono();
  renderBatimentos();
  renderHistorico();
  renderSemanal();
  renderAuditoria();
  renderBackup();
}

function currentSubject(){ return subjects[state.cycleIndex % subjects.length]; }
function nextSubject(){ return subjects[(state.cycleIndex + 1) % subjects.length]; }

function todayRecords(type){
  return state.records[type].filter(r=>r.data === todayISO() || r.date === todayISO());
}

function renderHoje(){
  const estudosHoje = todayRecords("estudo");
  const minEstudo = estudosHoje.reduce((s,r)=>s+num(r.tempo),0);
  const corridaKm = todayRecords("corrida").reduce((s,r)=>s+num(r.distancia),0);
  const treinos = todayRecords("musculacao").length;
  const sono = state.records.sono.find(r=>r.data === todayISO());
  const bat = todayRecords("batimentos").at(-1);

  document.getElementById("view-hoje").innerHTML = `
    <div class="grid">
      <div class="card cycle-card">
        <h3>Ciclo de Estudos</h3>
        <div class="cycle-main">
          <div class="cycle-sub">
            <span class="small">Matéria atual</span>
            <strong>${currentSubject()}</strong>
            <span>Próxima matéria: <b>${nextSubject()}</b></span>
            <span>Bloco padrão: <b>50 minutos líquidos</b></span>
          </div>
          <div class="actions">
            <button class="primary" onclick="startCycle()">Iniciar bloco de 50 minutos</button>
            <button class="ghost" onclick="finishCycle()">Concluir bloco</button>
            <button class="ghost" onclick="setView('estudo')">Registrar Estudo</button>
          </div>
        </div>
        <div class="hr"></div>
        <div class="small">${state.cycleRunning ? "Bloco em andamento desde " + new Date(state.cycleStart).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "Nenhum bloco em andamento."}</div>
      </div>

      <div class="grid cols-4">
        <div class="card metric"><span class="label">Estudo</span><span class="value">${minEstudo}m</span><span class="sub">${estudosHoje.length} sessão(ões)</span></div>
        <div class="card metric"><span class="label">Musculação</span><span class="value">${treinos}</span><span class="sub">treino(s)</span></div>
        <div class="card metric"><span class="label">Corrida</span><span class="value">${corridaKm.toFixed(1)} km</span><span class="sub">volume do dia</span></div>
        <div class="card metric"><span class="label">Sono / FC</span><span class="value">${sono?.qualidade || "-"} /10</span><span class="sub">FC média: ${bat?.media || "-"}</span></div>
      </div>

      <div class="card">
        <h3>Lembretes do dia</h3>
        <div class="grid cols-3">
          <div><span class="badge">07:00</span><p>Inicie o dia com comando. Registre revisão, estudo ou prioridade.</p></div>
          <div><span class="badge">11:30</span><p>Cheque parcial: registre o que já foi feito e ajuste a rota.</p></div>
          <div><span class="badge">20:45</span><p>Fechamento do dia: alimente o Painel de Comando.</p></div>
        </div>
      </div>

      <div class="card">
        <h3>Acesso rápido</h3>
        <div class="actions">
          <button class="ghost" onclick="setView('estudo')">Estudo</button>
          <button class="ghost" onclick="setView('revisao')">Revisão de Estudos</button>
          <button class="ghost" onclick="setView('musculacao')">Musculação</button>
          <button class="ghost" onclick="setView('corrida')">Corrida</button>
          <button class="ghost" onclick="setView('sono')">Sono</button>
          <button class="ghost" onclick="setView('batimentos')">Batimentos</button>
        </div>
      </div>

      <div class="card">
        <h3>Linha do tempo de hoje</h3>
        ${timelineToday()}
      </div>
    </div>
  `;
}

function timelineToday(){
  const rows = [];
  for(const [type, arr] of Object.entries(state.records)){
    if(type === "auditoria") continue;
    arr.filter(r=>(r.data || r.date) === todayISO()).forEach(r=>{
      rows.push({type, text: summaryRecord(type,r)});
    });
  }
  if(!rows.length) return `<p class="small">Nenhum registro para hoje ainda.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Área</th><th>Resumo</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="badge">${labelType(r.type)}</span></td><td>${r.text}</td></tr>`).join("")}</tbody></table></div>`;
}

function labelType(type){
  return {estudo:"Estudo",revisao:"Revisão",musculacao:"Musculação",corrida:"Corrida",sono:"Sono",batimentos:"Batimentos",auditoria:"Auditoria"}[type] || type;
}

function summaryRecord(type, r) {
  const observacao =
    r.observacoes ||
    r.observacao ||
    r.obs ||
    r.anotacoes ||
    r.notas ||
    r.detalhes ||
    "";

  const obs = observacao ? ` — Obs: ${observacao}` : "";

  if (type === "estudo") {
    return `${r.materia || "-"} — ${r.assunto || "-"} — ${r.tempo || 0} min — ${r.questoes || 0} questões${obs}`;
  }

  if (type === "revisao") {
    return `${r.materia || "-"} — ${r.tipo || "-"} — ${r.tempo || 0} min${obs}`;
  }

  if (type === "musculacao") {
    return `${r.grupo || "-"} — ${r.duracao || 0} min — esforço ${r.esforco || "-"}${obs}`;
  }

  if (type === "corrida") {
    return `${r.distancia || 0} km — ${r.tempoTotal || "-"} — FC ${r.fcMedia || "-"}${obs}`;
  }

  if (type === "sono") {
    return `${r.dormiu || "-"} até ${r.acordou || "-"} — qualidade ${r.qualidade || "-"}/10${obs}`;
  }

  if (type === "batimentos") {
    return `mín. ${r.minima || "-"} / média ${r.media || "-"} / máx. ${r.maxima || "-"} — ${r.contexto || "-"}${obs}`;
  }

  return obs || "";
}

function startCycle(){
  if(state.cycleRunning) return toast("Já existe um bloco em andamento.");
  state.cycleRunning = true;
  state.cycleStart = new Date().toISOString();
  saveState(); render(); toast(`Bloco iniciado: ${currentSubject()}.`);
}

function finishCycle(){
  const subject = currentSubject();
  state.cycleRunning = false;
  state.cycleStart = null;
  state.cycleIndex = (state.cycleIndex + 1) % subjects.length;
  saveState(); render(); toast(`Bloco concluído: ${subject}. Próxima matéria: ${currentSubject()}.`);
}

function formWrap(title, inner, onsubmit){
  return `<div class="card"><h3>${title}</h3><form class="form" onsubmit="${onsubmit}(event)">${inner}<div class="actions"><button class="primary" type="submit">Salvar registro</button></div></form></div>`;
}

function options(arr, selected=""){
  return arr.map(v=>`<option ${v===selected?"selected":""}>${v}</option>`).join("");
}

function renderEstudo(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Matéria</label><select name="materia">${options(subjects)}</select></div>
      <div class="field full"><label>Assunto estudado</label><input name="assunto" placeholder="Ex.: Ortografia oficial, atos administrativos..." required></div>
      <div class="field"><label>Material usado</label><input name="material" placeholder="PDF aula 01, lei seca, questões..."></div>
      <div class="field"><label>Páginas estudadas (opcional)</label><input name="paginas" placeholder="Ex.: 04–18"></div>
      <div class="field"><label>Tempo líquido (min)</label><input name="tempo" type="number" min="0" value="50"></div>
      <div class="field"><label>Tipo de estudo</label><select name="tipo">${options(["Teoria em PDF","Questões Cebraspe","Revisão","NotebookLM","Leitura de lei","Simulado","Correção de simulado","Caderno de erros"])}</select></div>
      <div class="field"><label>Questões feitas</label><input name="questoes" type="number" min="0" value="0" oninput="calcStudyPct(this.form)"></div>
      <div class="field"><label>Acertos</label><input name="acertos" type="number" min="0" value="0" oninput="calcStudyPct(this.form)"></div>
      <div class="field"><label>Erros</label><input name="erros" type="number" min="0" value="0"></div>
      <div class="field"><label>Brancos</label><input name="brancos" type="number" min="0" value="0"></div>
      <div class="field"><label>Percentual de acerto</label><input name="aproveitamento" value="0%" readonly></div>
      <div class="field"><label>Tipo de revisão</label><select name="tipoRevisao">${options(["Não se aplica","24 horas","7 dias","15 dias","30 dias","Revisão de erro","Outra"])}</select></div>
      <div class="field"><label>Próxima revisão</label><input name="proximaRevisao" type="date"></div>
      <label class="inline"><input name="usouPdf" type="checkbox" checked> Usou PDF</label>
      <label class="inline"><input name="usouNotebook" type="checkbox"> Usou NotebookLM</label>
      <label class="inline"><input name="fezRevisao" type="checkbox"> Fez revisão</label>
      <div class="field full"><label>Principais erros</label><textarea name="principaisErros"></textarea></div>
      <div class="field full"><label>Causa dos erros</label><textarea name="causaErros"></textarea></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;
  document.getElementById("view-estudo").innerHTML = formWrap("Nova sessão de estudo", html, "saveEstudo") + recentTable("estudo");
}

function calcStudyPct(form){
  form.aproveitamento.value = `${percent(form.acertos.value, form.questoes.value)}%`;
}

function saveEstudo(e){
  e.preventDefault();
  const f = e.target;
  const rec = Object.fromEntries(new FormData(f).entries());
  rec.id = uid();
  rec.usouPdf = f.usouPdf.checked;
  rec.usouNotebook = f.usouNotebook.checked;
  rec.fezRevisao = f.fezRevisao.checked;
  rec.aproveitamento = percent(rec.acertos, rec.questoes);
  state.records.estudo.push(rec);
  saveState(); f.reset(); toast("Sessão de estudo salva."); render();
}

function renderRevisao(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Matéria revisada</label><select name="materia">${options(subjects)}</select></div>
      <div class="field full"><label>Assunto revisado</label><input name="assunto" required></div>
      <div class="field"><label>Tipo de revisão</label><select name="tipo">${options(["24 horas","7 dias","15 dias","30 dias","Revisão de erro","Revisão por questões","Revisão por flashcards","Revisão por perguntas ativas","Revisão pelo NotebookLM","Outra"])}</select></div>
      <div class="field"><label>Tempo usado (min)</label><input name="tempo" type="number" min="0" value="20"></div>
      <div class="field"><label>Ferramenta usada</label><input name="ferramenta" placeholder="NotebookLM, Anki, PDF, questões..."></div>
      <label class="inline"><input name="usouNotebook" type="checkbox"> Usou NotebookLM</label>
      <div class="field"><label>Método usado no NotebookLM</label><select name="metodoNotebook">${options(["Não se aplica","Perguntas ativas","Flashcards","Quiz","Resumo","Recuperação de trecho","Explicação de erro","Revisão oral","Outro"])}</select></div>
      <div class="field"><label>Próxima revisão</label><input name="proximaRevisao" type="date"></div>
      <div class="field full"><label>Pontos esquecidos</label><textarea name="pontosEsquecidos"></textarea></div>
      <div class="field full"><label>Erros recorrentes</label><textarea name="errosRecorrentes"></textarea></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;
  document.getElementById("view-revisao").innerHTML = formWrap("Registrar revisão", html, "saveRevisao") + recentTable("revisao");
}

function saveRevisao(e){
  e.preventDefault();
  const f = e.target;
  const rec = Object.fromEntries(new FormData(f).entries());
  rec.id = uid(); rec.usouNotebook = f.usouNotebook.checked;
  state.records.revisao.push(rec);
  saveState(); f.reset(); toast("Revisão salva."); render();
}

function renderMusculacao(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Grupo muscular</label><select name="grupo">${options(["Peito","Costas","Pernas","Ombros","Braços","Core","Full body","Outro"])}</select></div>
      <div class="field"><label>Duração (min)</label><input name="duracao" type="number" min="0" value="45"></div>
      <div class="field"><label>Esforço (1–10)</label><input name="esforco" type="number" min="1" max="10" value="7"></div>
      <div class="field full"><label>Observações operacionais</label><textarea name="obs" placeholder="Cargas, lesões, disposição, execução..."></textarea></div>
    </div>`;
  document.getElementById("view-musculacao").innerHTML = formWrap("Registrar treino", html, "saveMusculacao") + recentTable("musculacao");
}
function saveMusculacao(e){ saveGeneric(e,"musculacao","Treino salvo."); }

function renderCorrida(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Distância (km)</label><input name="distancia" type="number" step="0.01" min="0" value="0"></div>
      <div class="field"><label>Tempo total (HH:MM:SS)</label><input name="tempoTotal" placeholder="00:00:00"></div>
      <div class="field"><label>Ritmo médio</label><input name="ritmo" placeholder="MM:SS"></div>
      <div class="field"><label>FC média (bpm)</label><input name="fcMedia" type="number" min="0"></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;
  document.getElementById("view-corrida").innerHTML = formWrap("Registrar corrida", html, "saveCorrida") + recentTable("corrida");
}
function saveCorrida(e){ saveGeneric(e,"corrida","Corrida salva."); }

function renderSono(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Data de referência</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Dormiu às</label><input name="dormiu" type="time"></div>
      <div class="field"><label>Acordou às</label><input name="acordou" type="time"></div>
      <div class="field"><label>Duração</label><input name="duracao" placeholder="Ex.: 07:20"></div>
      <div class="field"><label>Qualidade (1–10)</label><input name="qualidade" type="number" min="1" max="10" value="5"></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;
  document.getElementById("view-sono").innerHTML = formWrap("Registrar sono", html, "saveSono") + recentTable("sono");
}
function saveSono(e){ saveGeneric(e,"sono","Sono salvo."); }

function renderBatimentos(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Horário</label><input name="horario" type="time"></div>
      <div class="field"><label>FC mínima</label><input name="minima" type="number" min="0" value="60"></div>
      <div class="field"><label>FC média</label><input name="media" type="number" min="0" value="70"></div>
      <div class="field"><label>FC máxima</label><input name="maxima" type="number" min="0" value="120"></div>
      <div class="field"><label>Contexto</label><select name="contexto">${options(["Repouso","Sono","Treino","Estresse","Outro"])}</select></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;
  document.getElementById("view-batimentos").innerHTML = formWrap("Registrar batimentos", html, "saveBatimentos") + recentTable("batimentos");
}
function saveBatimentos(e){ saveGeneric(e,"batimentos","Medição salva."); }

function saveGeneric(e,type,msg){
  e.preventDefault();
  const rec = Object.fromEntries(new FormData(e.target).entries());
  rec.id = uid();
  state.records[type].push(rec);
  saveState(); e.target.reset(); toast(msg); render();
}

function recentTable(type){
  const rows = state.records[type].slice(-8).reverse();
  if(!rows.length) return `<div class="card"><h3>Histórico recente</h3><p class="small">Nenhum registro ainda.</p></div>`;
  return `<div class="card"><h3>Histórico recente</h3><div class="table-wrap"><table><thead><tr><th>Data</th><th>Resumo</th><th>Ação</th></tr></thead><tbody>${rows.map(r=>`
    <tr><td>${brDate(r.data)}</td><td>${summaryRecord(type,r)}</td><td><button class="ghost" onclick="deleteRecord('${type}','${r.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`;
}

function deleteRecord(type,id){
  if(!confirm("Excluir este registro?")) return;
  state.records[type] = state.records[type].filter(r=>r.id !== id);
  saveState(); toast("Registro excluído."); render();
}

function renderHistorico(){
  const all = [];
  for(const [type, arr] of Object.entries(state.records)){
    arr.forEach(r=>all.push({type, ...r}));
  }
  all.sort((a,b)=>(b.data||"").localeCompare(a.data||""));
  document.getElementById("view-historico").innerHTML = `
    <div class="card">
      <h3>Histórico geral</h3>
      <div class="table-wrap"><table><thead><tr><th>Área</th><th>Data</th><th>Resumo</th></tr></thead><tbody>
      ${all.length ? all.map(r=>`<tr><td><span class="badge">${labelType(r.type)}</span></td><td>${brDate(r.data)}</td><td>${summaryRecord(r.type,r)}</td></tr>`).join("") : `<tr><td colspan="3">Nenhum registro encontrado.</td></tr>`}
      </tbody></table></div>
    </div>`;
}

function weekRange(dateISO = todayISO()){
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate()+6);
  return [start.toISOString().slice(0,10), end.toISOString().slice(0,10)];
}

function inRange(iso,start,end){ return iso >= start && iso <= end; }

function renderSemanal(){
  const [start,end] = weekRange();
  const estudos = state.records.estudo.filter(r=>inRange(r.data,start,end));
  const revisoes = state.records.revisao.filter(r=>inRange(r.data,start,end));
  const musc = state.records.musculacao.filter(r=>inRange(r.data,start,end));
  const corr = state.records.corrida.filter(r=>inRange(r.data,start,end));
  const sono = state.records.sono.filter(r=>inRange(r.data,start,end));
  const bat = state.records.batimentos.filter(r=>inRange(r.data,start,end));

  const tempo = estudos.reduce((s,r)=>s+num(r.tempo),0);
  const questoes = estudos.reduce((s,r)=>s+num(r.questoes),0);
  const acertos = estudos.reduce((s,r)=>s+num(r.acertos),0);
  const erros = estudos.reduce((s,r)=>s+num(r.erros),0);
  const km = corr.reduce((s,r)=>s+num(r.distancia),0);
  const mediaSono = sono.length ? Math.round(sono.reduce((s,r)=>s+num(r.qualidade),0)/sono.length*10)/10 : "-";
  const fcVals = bat.flatMap(r=>[num(r.minima),num(r.media),num(r.maxima)]).filter(v=>v>0);

  const bySubject = {};
  estudos.forEach(r=>bySubject[r.materia]=(bySubject[r.materia]||0)+num(r.tempo));

  document.getElementById("view-semanal").innerHTML = `
    <div class="grid">
      <div class="card"><h3>Período: ${brDate(start)} a ${brDate(end)}</h3></div>
      <div class="grid cols-3">
        <div class="card metric"><span class="label">Estudo</span><span class="value">${tempo}m</span><span class="sub">${questoes} questões | ${percent(acertos,questoes)}% acerto</span></div>
        <div class="card metric"><span class="label">Revisões</span><span class="value">${revisoes.length}</span><span class="sub">registradas na semana</span></div>
        <div class="card metric"><span class="label">Treino</span><span class="value">${musc.length}</span><span class="sub">musculação</span></div>
        <div class="card metric"><span class="label">Corrida</span><span class="value">${km.toFixed(1)} km</span><span class="sub">${corr.length} corrida(s)</span></div>
        <div class="card metric"><span class="label">Sono</span><span class="value">${mediaSono}</span><span class="sub">qualidade média</span></div>
        <div class="card metric"><span class="label">FC</span><span class="value">${fcVals.length ? Math.round(fcVals.reduce((a,b)=>a+b,0)/fcVals.length) : "-"}</span><span class="sub">média geral registrada</span></div>
      </div>
      <div class="card">
        <h3>Tempo por matéria</h3>
        ${Object.keys(bySubject).length ? Object.entries(bySubject).map(([k,v])=>`<p><b>${k}</b>: ${v} min</p>`).join("") : `<p class="small">Nenhum estudo registrado nesta semana.</p>`}
      </div>
      <div class="card">
        <h3>Questões</h3>
        <p>Feitas: <b>${questoes}</b> | Acertos: <b>${acertos}</b> | Erros: <b>${erros}</b> | Aproveitamento: <b>${percent(acertos,questoes)}%</b></p>
      </div>
    </div>`;
}

function renderAuditoria(){
  const html = `
    <div class="form-grid">
      <div class="field"><label>Semana de referência</label><input name="data" type="date" value="${weekRange()[0]}" required></div>
      <div class="field"><label>Decisão da semana</label><select name="decisao">${options(["Avançar","Reforçar","Corrigir rota","Priorizar revisão","Recolocar matéria no ciclo"])}</select></div>
      <div class="field"><label>Matéria mais negligenciada</label><select name="materiaNegligenciada">${options(["Nenhuma",...subjects])}</select></div>
      <div class="field"><label>Prioridade da próxima semana</label><input name="prioridade"></div>
      <div class="field full"><label>O que funcionou</label><textarea name="funcionou"></textarea></div>
      <div class="field full"><label>O que falhou</label><textarea name="falhou"></textarea></div>
      <div class="field full"><label>Principal causa da falha</label><textarea name="causa"></textarea></div>
      <div class="field full"><label>Principal erro recorrente</label><textarea name="erroRecorrente"></textarea></div>
      <div class="field full"><label>Revisões pendentes</label><textarea name="revisoesPendentes"></textarea></div>
      <div class="field full"><label>Correção de rota</label><textarea name="correcao"></textarea></div>
    </div>`;
  document.getElementById("view-auditoria").innerHTML = formWrap("Auditoria semanal", html, "saveAuditoria") + recentTable("auditoria");
}
function saveAuditoria(e){ saveGeneric(e,"auditoria","Auditoria salva."); }

function renderBackup(){
  document.getElementById("view-backup").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>Exportar backup</h3>
        <p>Baixe seus dados em JSON. Guarde o arquivo em local seguro.</p>
        <button class="primary" onclick="exportBackup()">Exportar JSON</button>
      </div>
      <div class="card">
        <h3>Importar backup</h3>
        <p>Importa um JSON exportado por este app. A importação substitui os dados atuais.</p>
        <input type="file" id="importFile" accept="application/json">
        <div class="actions" style="margin-top:12px"><button class="ghost" onclick="importBackup()">Importar JSON</button></div>
      </div>
      <div class="card">
        <h3>Limpar dados</h3>
        <p>Use apenas se tiver backup.</p>
        <button class="danger" onclick="clearAll()">Apagar tudo</button>
      </div>
    </div>`;
}

function exportBackup(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `painel-comando-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup(){
  const file = document.getElementById("importFile").files[0];
  if(!file) return toast("Selecione um arquivo JSON.");
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data.records) throw new Error("Formato inválido.");
      state = merge(defaultState, data);
      saveState(); toast("Backup importado."); render();
    }catch(e){ toast("Arquivo inválido."); }
  };
  reader.readAsText(file);
}

function clearAll(){
  if(!confirm("Apagar todos os dados locais?")) return;
  state = structuredClone(defaultState);
  saveState(); toast("Dados apagados."); render();
}

async function enableNotifications(){
  if(!("Notification" in window)) return toast("Este navegador não oferece notificações.");
  const perm = await Notification.requestPermission();
  if(perm !== "granted") return toast("Permissão de notificação não concedida.");
  new Notification("Painel de Comando", {body:"Notificações ativadas."});
  toast("Notificações ativadas.");
}

function checkReminder(){
  if(!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const hm = now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  const key = `reminder-${todayISO()}-${hm}`;
  const reminders = {
    "07:00":"Inicie o dia com comando. Registre revisão, estudo ou prioridade.",
    "11:30":"Cheque parcial: registre o que já foi feito e ajuste a rota.",
    "20:45":"Fechamento do dia: alimente o Painel de Comando."
  };
  if(reminders[hm] && !localStorage.getItem(key)){
    new Notification("Painel de Comando", {body: reminders[hm]});
    localStorage.setItem(key, "1");
  }
}

window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("installBtn").classList.remove("hidden");
});

document.addEventListener("DOMContentLoaded", ()=>{
  document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
  document.getElementById("notifyBtn").addEventListener("click", enableNotifications);
  document.getElementById("installBtn").addEventListener("click", async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById("installBtn").classList.add("hidden");
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }

  render();
  setInterval(checkReminder, 30000);
});
(() => {
  function criarPainelBackup() {
    if (document.getElementById("painel-backup-json")) return;

    const painel = document.createElement("div");
    painel.id = "painel-backup-json";
    painel.style.position = "fixed";
    painel.style.right = "16px";
    painel.style.bottom = "16px";
    painel.style.zIndex = "9999";
    painel.style.display = "flex";
    painel.style.flexDirection = "column";
    painel.style.gap = "8px";
    painel.style.padding = "10px";
    painel.style.borderRadius = "14px";
    painel.style.background = "rgba(255, 255, 255, 0.92)";
    painel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
    painel.style.backdropFilter = "blur(8px)";

    const botaoExportar = document.createElement("button");
    botaoExportar.textContent = "Exportar backup";
    botaoExportar.style.padding = "10px 12px";
    botaoExportar.style.border = "0";
    botaoExportar.style.borderRadius = "10px";
    botaoExportar.style.cursor = "pointer";
    botaoExportar.style.fontWeight = "700";

    const botaoImportar = document.createElement("button");
    botaoImportar.textContent = "Importar backup";
    botaoImportar.style.padding = "10px 12px";
    botaoImportar.style.border = "0";
    botaoImportar.style.borderRadius = "10px";
    botaoImportar.style.cursor = "pointer";
    botaoImportar.style.fontWeight = "700";

    const seletorArquivo = document.createElement("input");
    seletorArquivo.type = "file";
    seletorArquivo.accept = "application/json,.json";
    seletorArquivo.style.display = "none";

    botaoExportar.addEventListener("click", () => {
      const dados = {};

      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        dados[chave] = localStorage.getItem(chave);
      }

      const backup = {
        app: "Painel de Comando PWA",
        origem: location.href,
        dataExportacao: new Date().toISOString(),
        localStorage: dados
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "backup-painel-comando.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    botaoImportar.addEventListener("click", () => {
      seletorArquivo.click();
    });

    seletorArquivo.addEventListener("change", async () => {
      const arquivo = seletorArquivo.files[0];
      if (!arquivo) return;

      const confirmar = confirm(
        "Importar este backup vai substituir os dados locais deste navegador. Deseja continuar?"
      );

      if (!confirmar) {
        seletorArquivo.value = "";
        return;
      }

      try {
        const texto = await arquivo.text();
        const backup = JSON.parse(texto);

        if (!backup.localStorage || typeof backup.localStorage !== "object") {
          alert("Arquivo de backup inválido.");
          return;
        }

        localStorage.clear();

        Object.entries(backup.localStorage).forEach(([chave, valor]) => {
          localStorage.setItem(chave, valor);
        });

        alert("Backup importado com sucesso. O app será recarregado.");
        location.reload();
      } catch (erro) {
        alert("Não foi possível importar o backup.");
        console.error(erro);
      } finally {
        seletorArquivo.value = "";
      }
    });

    painel.appendChild(botaoExportar);
    painel.appendChild(botaoImportar);
    painel.appendChild(seletorArquivo);
    document.body.appendChild(painel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", criarPainelBackup);
  } else {
    criarPainelBackup();
  }
})();
