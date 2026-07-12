const STORAGE_KEY = "painel_comando_pwa_v1";

const subjects = [
  "Português",
  "Informática",
  "Contabilidade",
  "Direito Constitucional",
  "Direito Administrativo",
  "Raciocínio Lógico"
];

const bookMessages = [
  {
    title: "Outliers, de Malcolm Gladwell",
    message: "Na situação dos jogadores de hóquei canadenses, o corte etário de 1º de janeiro faz alguns atletas parecerem mais maduros. Eles recebem mais seleção e treino, acumulando uma vantagem que depois parece apenas talento individual."
  },
  {
    title: "Disciplina é Destino, de Ryan Holiday",
    message: "Ao apresentar figuras históricas como Lou Gehrig, o livro mostra a disciplina como prática de autocontrole: dominar emoções, pensamentos e ações para sustentar uma vida orientada por virtudes, não por excessos."
  },
  {
    title: "Produtividade no trabalho, Harvard Business Review",
    message: "Na situação de uma rotina cheia de demandas, a proposta é transformar prioridades em um cronograma executável. A produtividade aparece na gestão consciente do tempo e na organização das tarefas, não no volume de horas ocupadas."
  }
];

const RECORD_TYPES = ["estudo", "revisao", "musculacao", "corrida", "sono", "batimentos", "medidas", "erros", "recuperacao", "simulados", "auditoria"];

const defaultHabits = [
  { id: "acordar", label: "Acordar no horário", active: true },
  { id: "estudo", label: "Cumprir o bloco principal de estudo", active: true },
  { id: "treino", label: "Executar o treino planejado", active: true },
  { id: "leitura", label: "Leitura e revisão mental", active: true },
  { id: "hidratacao", label: "Manter hidratação", active: true },
  { id: "sono", label: "Preparar o sono no horário", active: true }
];

const defaultState = {
  cycleIndex: 0,
  cycleRunning: false,
  cycleStart: null,
  planning: {
    target: "",
    examDate: "",
    weeklyStudyTarget: 20,
    weeklyQuestionTarget: 200,
    tasks: [],
    syllabus: [],
    habits: clone(defaultHabits),
    checkins: {}
  },
  security: { pinHash: "", locked: false },
  records: {
    estudo: [],
    revisao: [],
    musculacao: [],
    corrida: [],
    sono: [],
    batimentos: [],
    medidas: [],
    erros: [],
    recuperacao: [],
    simulados: [],
    auditoria: []
  }
};

let state = loadState();
let deferredPrompt = null;
let confirmResolver = null;

function loadState() {
  try {
    const raw = storageGet(STORAGE_KEY) || storageGet(`${STORAGE_KEY}_auto`);
    const parsed = raw ? JSON.parse(raw) : null;
    const saved = parsed?.state?.records ? parsed.state : parsed;
    return saved ? merge(defaultState, saved) : clone(defaultState);
  } catch (e) {
    return clone(defaultState);
  }
}

function merge(base, extra) {
  const source = extra && typeof extra === "object" ? extra : {};
  const out = clone(base);
  out.cycleIndex = Number.isInteger(source.cycleIndex) ? source.cycleIndex : base.cycleIndex;
  out.cycleRunning = Boolean(source.cycleRunning);
  out.cycleStart = source.cycleStart || null;
  const planning = source.planning && typeof source.planning === "object" ? source.planning : {};
  out.planning = {
    ...clone(base.planning),
    target: String(planning.target || ""),
    examDate: normalizeOptionalDate(planning.examDate),
    weeklyStudyTarget: Math.max(0, num(planning.weeklyStudyTarget || base.planning.weeklyStudyTarget)),
    weeklyQuestionTarget: Math.max(0, num(planning.weeklyQuestionTarget || base.planning.weeklyQuestionTarget)),
    tasks: Array.isArray(planning.tasks) ? planning.tasks.map((task, index) => normalizeTask(task, index)).filter(Boolean) : [],
    syllabus: Array.isArray(planning.syllabus) ? planning.syllabus.map((item, index) => normalizeSyllabus(item, index)).filter(Boolean) : [],
    habits: Array.isArray(planning.habits) && planning.habits.length
      ? planning.habits.map((habit, index) => normalizeHabit(habit, index)).filter(Boolean)
      : clone(defaultHabits),
    checkins: planning.checkins && typeof planning.checkins === "object" ? planning.checkins : {}
  };
  const security = source.security && typeof source.security === "object" ? source.security : {};
  out.security = { pinHash: String(security.pinHash || ""), locked: Boolean(security.locked) };
  const sourceRecords = source.records && typeof source.records === "object" ? source.records : {};
  out.records = {};
  RECORD_TYPES.forEach(type => {
    const records = Array.isArray(sourceRecords[type]) ? sourceRecords[type] : [];
    out.records[type] = records.map((record, index) => normalizeRecord(type, record, index));
  });
  return out;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function normalizeDate(value) {
  if (!value) return todayISO();
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{2})[\\/.-](\d{2})[\\/.-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? todayISO() : parsed.toISOString().slice(0, 10);
}

function normalizeOptionalDate(value) {
  if (!value) return "";
  const normalized = normalizeDate(value);
  return normalized === todayISO() && !String(value).trim().match(/\d{4}|\d{2}[\/.-]/) ? "" : normalized;
}

function normalizeTask(value, index = 0) {
  if (!value || typeof value !== "object") return null;
  return {
    id: String(value.id || `task-${Date.now()}-${index}`),
    title: String(value.title || value.tarefa || "").trim(),
    subject: String(value.subject || value.materia || "").trim(),
    due: value.due ? normalizeDate(value.due) : todayISO(),
    minutes: Math.max(0, num(value.minutes)),
    questions: Math.max(0, num(value.questions)),
    done: Boolean(value.done),
    note: String(value.note || value.obs || "").trim()
  };
}

function normalizeHabit(value, index = 0) {
  if (!value || typeof value !== "object") return null;
  const fallback = defaultHabits[index % defaultHabits.length];
  return {
    id: String(value.id || fallback.id || `habit-${index}`),
    label: String(value.label || fallback.label || "Hábito").trim(),
    active: value.active !== false
  };
}

function normalizeSyllabus(value, index = 0) {
  if (!value || typeof value !== "object") return null;
  return {
    id: String(value.id || `edital-${Date.now()}-${index}`),
    subject: String(value.subject || value.materia || "").trim(),
    topic: String(value.topic || value.assunto || "").trim(),
    status: ["Não iniciado", "Em estudo", "Revisado", "Dominado"].includes(value.status) ? value.status : "Não iniciado",
    note: String(value.note || value.obs || "").trim()
  };
}

function normalizeRecord(type, value, index = 0) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  record.id = String(record.id || `${type}-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`);
  record.data = normalizeDate(record.data || record.date);
  delete record.date;
  return record;
}

function saveState() {
  const serialized = JSON.stringify(state);
  const saved = storageSet(STORAGE_KEY, serialized);
  if (saved) storageSet(`${STORAGE_KEY}_auto`, JSON.stringify({ savedAt: new Date().toISOString(), state }));
  return saved;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function brDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = normalizeDate(iso).split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[char]));
}

function actionArg(value) {
  return encodeURIComponent(String(value)).replace(/'/g, "%27");
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function percent(acertos, total) {
  total = num(total);
  acertos = num(acertos);
  if (total <= 0) return 0;
  return Math.round((acertos / total) * 1000) / 10;
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) {
    alert(msg);
    return;
  }

  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function requestConfirmation(message) {
  const modal = document.getElementById("confirmModal");
  if (!modal) return Promise.resolve(false);

  document.getElementById("confirmMessage").textContent = message;
  modal.classList.remove("hidden");

  return new Promise(resolve => {
    confirmResolver = resolve;
  });
}

function closeConfirmation(result) {
  const modal = document.getElementById("confirmModal");
  if (modal) modal.classList.add("hidden");
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(result);
  }
}

function showSuccess(message) {
  const modal = document.getElementById("successModal");
  if (!modal) return toast(message);
  document.getElementById("successMessage").textContent = message;
  modal.classList.remove("hidden");
}

function closeSuccess() {
  document.getElementById("successModal")?.classList.add("hidden");
}

function setView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

  const target = document.querySelector(`#view-${name}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
  });

  const titles = {
    hoje: "Hoje",
    estudo: "Estudo",
    revisao: "Revisão de Estudos",
    musculacao: "Musculação",
    corrida: "Corrida",
    sono: "Sono",
    batimentos: "Batimentos",
    medidas: "Medidas e peso",
    planejamento: "Planejamento",
    habitos: "Hábitos e prontidão",
    erros: "Banco de erros",
    edital: "Mapa do edital",
    recuperacao: "Recuperação",
    prova: "Modo prova",
    historico: "Histórico",
    semanal: "Painel Semanal",
    auditoria: "Auditoria Semanal",
    backup: "Backup"
  };

  const title = document.getElementById("viewTitle");
  if (title) title.textContent = titles[name] || "Painel";

  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function render() {
  const todayLabel = document.getElementById("todayLabel");
  if (todayLabel) todayLabel.textContent = brDate(todayISO());

  renderBookMessage();

  renderHoje();
  renderEstudo();
  renderRevisao();
  renderMusculacao();
  renderCorrida();
  renderSono();
  renderBatimentos();
  renderMedidas();
  renderPlanejamento();
  renderHabitos();
  renderErros();
  renderEdital();
  renderRecuperacao();
  renderProva();
  renderHistorico();
  renderSemanal();
  renderAuditoria();
  renderBackup();
}

function currentSubject() {
  return subjects[state.cycleIndex % subjects.length];
}

function nextSubject() {
  return subjects[(state.cycleIndex + 1) % subjects.length];
}

function todayRecords(type) {
  return state.records[type].filter(r => r.data === todayISO());
}

function renderHoje() {
  const view = document.getElementById("view-hoje");
  if (!view) return;

  const estudosHoje = todayRecords("estudo");
  const minEstudo = estudosHoje.reduce((s, r) => s + num(r.tempo), 0);
  const corridaKm = todayRecords("corrida").reduce((s, r) => s + num(r.distancia), 0);
  const treinos = todayRecords("musculacao").length;
  const sono = state.records.sono.find(r => r.data === todayISO());
  const bat = todayRecords("batimentos").at(-1);
  const medida = todayRecords("medidas").at(-1);
  const checkin = state.planning.checkins[todayISO()] || {};
  const tasksToday = state.planning.tasks.filter(task => task.due === todayISO());
  const completedTasks = tasksToday.filter(task => task.done).length;
  const activeHabits = state.planning.habits.filter(habit => habit.active);
  const completedHabits = activeHabits.filter(habit => checkin.habits?.[habit.id]).length;

  view.innerHTML = `
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
        <div class="small">
          ${state.cycleRunning
            ? "Bloco em andamento desde " + new Date(state.cycleStart).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "Nenhum bloco em andamento."}
        </div>
      </div>

      <div class="card command-card">
        <div class="section-heading">
          <div><h3>Missão de hoje</h3><p class="small">Execute o essencial antes de aumentar o volume.</p></div>
          <span class="badge ${completedTasks === tasksToday.length && tasksToday.length ? "ok" : "warn"}">${completedTasks}/${tasksToday.length} tarefas</span>
        </div>
        <div class="progress"><div style="width:${tasksToday.length ? Math.round(completedTasks / tasksToday.length * 100) : 0}%"></div></div>
        <p class="small">Hábitos cumpridos: <b>${completedHabits}/${activeHabits.length}</b>${state.planning.target ? ` | Foco: <b>${escapeHtml(state.planning.target)}</b>` : ""}</p>
        <div class="actions"><button class="ghost" onclick="setView('planejamento')">Abrir plano</button><button class="ghost" onclick="setView('habitos')">Registrar prontidão</button></div>
      </div>

      <div class="grid cols-4">
        <div class="card metric">
          <span class="label">Estudo</span>
          <span class="value">${minEstudo}m</span>
          <span class="sub">${estudosHoje.length} sessão(ões)</span>
        </div>
        <div class="card metric">
          <span class="label">Musculação</span>
          <span class="value">${treinos}</span>
          <span class="sub">treino(s)</span>
        </div>
        <div class="card metric">
          <span class="label">Corrida</span>
          <span class="value">${corridaKm.toFixed(1)} km</span>
          <span class="sub">volume do dia</span>
        </div>
        <div class="card metric">
          <span class="label">Sono / FC</span>
          <span class="value">${sono?.qualidade || "-"} /10</span>
          <span class="sub">FC média: ${bat?.media || "-"}</span>
        </div>
        <div class="card metric">
          <span class="label">Peso</span>
          <span class="value">${medida?.peso || "-"}${medida?.peso ? " kg" : ""}</span>
          <span class="sub">última medida do dia</span>
        </div>
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
          <button class="ghost" onclick="setView('medidas')">Medidas e peso</button>
        </div>
      </div>

      <div class="card">
        <h3>Linha do tempo de hoje</h3>
        ${timelineToday()}
      </div>
    </div>
  `;
}

function renderBookMessage() {
  const index = Math.floor(Date.now() / 86400000) % bookMessages.length;
  const book = bookMessages[index];
  const title = document.getElementById("bookTitle");
  const message = document.getElementById("bookMessage");
  if (title) title.textContent = book.title;
  if (message) message.textContent = book.message;
}

function timelineToday() {
  const rows = [];

  for (const [type, arr] of Object.entries(state.records)) {
    if (type === "auditoria") continue;

    arr.filter(r => (r.data || r.date) === todayISO()).forEach(r => {
      rows.push({ type, text: summaryRecord(type, r) });
    });
  }

  if (!rows.length) return `<p class="small">Nenhum registro para hoje ainda.</p>`;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Área</th>
            <th>Resumo</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="badge">${escapeHtml(labelType(r.type))}</span></td>
              <td>${r.text}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function labelType(type) {
  return {
    estudo: "Estudo",
    revisao: "Revisão",
    musculacao: "Musculação",
    corrida: "Corrida",
    sono: "Sono",
    batimentos: "Batimentos",
    medidas: "Medidas e peso",
    auditoria: "Auditoria"
  }[type] || type;
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

  const obs = observacao ? ` | Obs: ${observacao}` : "";

  if (type === "estudo") {
    return `${escapeHtml(r.materia || "-")} | ${escapeHtml(r.assunto || "-")} | ${escapeHtml(r.tempo || 0)} min | ${escapeHtml(r.questoes || 0)} questões${escapeHtml(obs)}`;
  }

  if (type === "revisao") {
    return `${escapeHtml(r.materia || "-")} | ${escapeHtml(r.tipo || "-")} | ${escapeHtml(r.tempo || 0)} min${escapeHtml(obs)}`;
  }

  if (type === "musculacao") {
    return `${escapeHtml(r.grupo || "-")} | ${escapeHtml(r.duracao || 0)} min | esforço ${escapeHtml(r.esforco || "-")}${escapeHtml(obs)}`;
  }

  if (type === "corrida") {
    return `${escapeHtml(r.distancia || 0)} km | ${escapeHtml(r.tempoTotal || "-")} | FC ${escapeHtml(r.fcMedia || "-")}${escapeHtml(obs)}`;
  }

  if (type === "sono") {
    return `${escapeHtml(r.dormiu || "-")} até ${escapeHtml(r.acordou || "-")} | qualidade ${escapeHtml(r.qualidade || "-")}/10${escapeHtml(obs)}`;
  }

  if (type === "batimentos") {
    return `mín. ${escapeHtml(r.minima || "-")} | média ${escapeHtml(r.media || "-")} | máx. ${escapeHtml(r.maxima || "-")} | ${escapeHtml(r.contexto || "-")}${escapeHtml(obs)}`;
  }

  if (type === "medidas") {
    const bracoEsquerdo = r.bracoEsquerdo || r.braco || "-";
    const bracoDireito = r.bracoDireito || "-";
    const pernaEsquerda = r.pernaEsquerda || r.coxa || "-";
    const pernaDireita = r.pernaDireita || "-";
    return `peso ${escapeHtml(r.peso || "-")} kg | cintura ${escapeHtml(r.cintura || "-")} cm | braços E/D ${escapeHtml(bracoEsquerdo)}/${escapeHtml(bracoDireito)} cm | pernas E/D ${escapeHtml(pernaEsquerda)}/${escapeHtml(pernaDireita)} cm${escapeHtml(obs)}`;
  }

  if (type === "auditoria") {
    return `${escapeHtml(r.decisao || "-")} | prioridade: ${escapeHtml(r.prioridade || "-")}${escapeHtml(obs)}`;
  }

  if (type === "erros") {
    return `${escapeHtml(r.materia || "-")} | ${escapeHtml(r.assunto || "-")} | causa: ${escapeHtml(r.causa || "-")} | ${escapeHtml(r.status || "Pendente")}${escapeHtml(obs)}`;
  }

  if (type === "recuperacao") {
    return `${escapeHtml(r.tipo || "-")} | prontidão ${escapeHtml(r.prontidao || "-")}/10 | dor ${escapeHtml(r.dor || "-")}/10 | fadiga ${escapeHtml(r.fadiga || "-")}/10${escapeHtml(obs)}`;
  }

  if (type === "simulados") {
    return `${escapeHtml(r.nome || "Simulado")} | ${escapeHtml(r.questoes || 0)} questões | ${escapeHtml(r.tempo || "-")} | ${escapeHtml(r.aproveitamento || 0)}%${escapeHtml(obs)}`;
  }

  return obs || "";
}

function startCycle() {
  if (state.cycleRunning) return toast("Já existe um bloco em andamento.");

  state.cycleRunning = true;
  state.cycleStart = new Date().toISOString();

  saveState();
  render();
  toast(`Bloco iniciado: ${currentSubject()}.`);
}

function finishCycle() {
  const subject = currentSubject();

  state.cycleRunning = false;
  state.cycleStart = null;
  state.cycleIndex = (state.cycleIndex + 1) % subjects.length;

  saveState();
  render();
  toast(`Bloco concluído: ${subject}. Próxima matéria: ${currentSubject()}.`);
}

function formWrap(title, inner, onsubmit) {
  return `
    <div class="card">
      <h3>${title}</h3>
      <form class="form" onsubmit="${onsubmit}(event)">
        ${inner}
        <div class="actions">
          <button class="primary" type="submit">Salvar registro</button>
        </div>
      </form>
    </div>`;
}

function options(arr, selected = "") {
  return arr.map(v => `<option ${v === selected ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
}

function saveGeneric(e, type, message, options = {}) {
  e.preventDefault();

  const form = e.target;
  const rec = Object.fromEntries(new FormData(form).entries());
  const editId = form.dataset.editId;

  if (options.checkboxes) {
    options.checkboxes.forEach(name => {
      if (form[name]) rec[name] = form[name].checked;
    });
  }

  if (typeof options.beforeSave === "function") {
    options.beforeSave(rec, form);
  }

  if (editId) {
    rec.id = editId;

    const index = state.records[type].findIndex(r => r.id === editId);

    if (index !== -1) {
      state.records[type][index] = {
        ...state.records[type][index],
        ...rec
      };

      delete form.dataset.editId;

      const button = form.querySelector('button[type="submit"]');
      if (button) button.textContent = "Salvar registro";

      if (!saveState()) {
        toast("Não foi possível gravar a alteração neste dispositivo.");
        return;
      }
      form.reset();
      render();
      showSuccess("A informação foi atualizada com sucesso.");
      return;
    }
  }

  rec.id = uid();
  state.records[type].push(rec);

  if (!saveState()) {
    toast("Não foi possível gravar a informação neste dispositivo.");
    return;
  }
  form.reset();
  render();
  showSuccess(`A informação foi salva com sucesso. ${message}`);
}

function renderEstudo() {
  const view = document.getElementById("view-estudo");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Matéria</label><select name="materia">${options(subjects)}</select></div>
      <div class="field full"><label>Assunto estudado</label><input name="assunto" placeholder="Ex.: Ortografia oficial, atos administrativos..." required></div>
      <div class="field"><label>Material usado</label><input name="material" placeholder="PDF aula 01, lei seca, questões..."></div>
      <div class="field"><label>Páginas estudadas (opcional)</label><input name="paginas" placeholder="Ex.: 04-18"></div>
      <div class="field"><label>Tempo líquido (min)</label><input name="tempo" type="number" min="0" value="50"></div>
      <div class="field"><label>Tipo de estudo</label><select name="tipo">${options(["Teoria em PDF", "Questões Cebraspe", "Revisão", "NotebookLM", "Leitura de lei", "Simulado", "Correção de simulado", "Caderno de erros"])}</select></div>
      <div class="field"><label>Questões feitas</label><input name="questoes" type="number" min="0" value="0" oninput="calcStudyPct(this.form)"></div>
      <div class="field"><label>Acertos</label><input name="acertos" type="number" min="0" value="0" oninput="calcStudyPct(this.form)"></div>
      <div class="field"><label>Erros</label><input name="erros" type="number" min="0" value="0"></div>
      <div class="field"><label>Brancos</label><input name="brancos" type="number" min="0" value="0"></div>
      <div class="field"><label>Percentual de acerto</label><input name="aproveitamento" value="0%" readonly></div>
      <div class="field"><label>Tipo de revisão</label><select name="tipoRevisao">${options(["Não se aplica", "24 horas", "7 dias", "15 dias", "30 dias", "Revisão de erro", "Outra"])}</select></div>
      <div class="field"><label>Próxima revisão</label><input name="proximaRevisao" type="date"></div>
      <label class="inline"><input name="usouPdf" type="checkbox" checked> Usou PDF</label>
      <label class="inline"><input name="usouNotebook" type="checkbox"> Usou NotebookLM</label>
      <label class="inline"><input name="fezRevisao" type="checkbox"> Fez revisão</label>
      <div class="field full"><label>Principais erros</label><textarea name="principaisErros"></textarea></div>
      <div class="field full"><label>Causa dos erros</label><textarea name="causaErros"></textarea></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Nova sessão de estudo", html, "saveEstudo") + recentTable("estudo");
}

function calcStudyPct(form) {
  form.aproveitamento.value = `${percent(form.acertos.value, form.questoes.value)}%`;
}

function saveEstudo(e) {
  saveGeneric(e, "estudo", "Sessão de estudo salva.", {
    checkboxes: ["usouPdf", "usouNotebook", "fezRevisao"],
    beforeSave: (rec) => {
      rec.aproveitamento = percent(rec.acertos, rec.questoes);
    }
  });
}

function renderRevisao() {
  const view = document.getElementById("view-revisao");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Matéria revisada</label><select name="materia">${options(subjects)}</select></div>
      <div class="field full"><label>Assunto revisado</label><input name="assunto" required></div>
      <div class="field"><label>Tipo de revisão</label><select name="tipo">${options(["24 horas", "7 dias", "15 dias", "30 dias", "Revisão de erro", "Revisão por questões", "Revisão por flashcards", "Revisão por perguntas ativas", "Revisão pelo NotebookLM", "Outra"])}</select></div>
      <div class="field"><label>Tempo usado (min)</label><input name="tempo" type="number" min="0" value="20"></div>
      <div class="field"><label>Ferramenta usada</label><input name="ferramenta" placeholder="NotebookLM, Anki, PDF, questões..."></div>
      <label class="inline"><input name="usouNotebook" type="checkbox"> Usou NotebookLM</label>
      <div class="field"><label>Método usado no NotebookLM</label><select name="metodoNotebook">${options(["Não se aplica", "Perguntas ativas", "Flashcards", "Quiz", "Resumo", "Recuperação de trecho", "Explicação de erro", "Revisão oral", "Outro"])}</select></div>
      <div class="field"><label>Próxima revisão</label><input name="proximaRevisao" type="date"></div>
      <div class="field full"><label>Pontos esquecidos</label><textarea name="pontosEsquecidos"></textarea></div>
      <div class="field full"><label>Erros recorrentes</label><textarea name="errosRecorrentes"></textarea></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Registrar revisão", html, "saveRevisao") + recentTable("revisao");
}

function saveRevisao(e) {
  saveGeneric(e, "revisao", "Revisão salva.", {
    checkboxes: ["usouNotebook"]
  });
}

function renderMusculacao() {
  const view = document.getElementById("view-musculacao");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Grupo muscular</label><select name="grupo">${options(["Peito", "Costas", "Pernas", "Ombros", "Braços", "Core", "Full body", "Outro"])}</select></div>
      <div class="field"><label>Duração (min)</label><input name="duracao" type="number" min="0" value="45"></div>
      <div class="field"><label>Esforço (1-10)</label><input name="esforco" type="number" min="1" max="10" value="7"></div>
      <div class="field full"><label>Observações operacionais</label><textarea name="obs" placeholder="Cargas, lesões, disposição, execução..."></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Registrar treino", html, "saveMusculacao") + recentTable("musculacao");
}

function saveMusculacao(e) {
  saveGeneric(e, "musculacao", "Treino salvo.");
}

function renderCorrida() {
  const view = document.getElementById("view-corrida");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Distância (km)</label><input name="distancia" type="number" step="0.01" min="0" value="0"></div>
      <div class="field"><label>Tempo total (HH:MM:SS)</label><input name="tempoTotal" placeholder="00:00:00"></div>
      <div class="field"><label>Ritmo médio</label><input name="ritmo" placeholder="MM:SS"></div>
      <div class="field"><label>FC média (bpm)</label><input name="fcMedia" type="number" min="0"></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Registrar corrida", html, "saveCorrida") + recentTable("corrida");
}

function saveCorrida(e) {
  saveGeneric(e, "corrida", "Corrida salva.");
}

function renderSono() {
  const view = document.getElementById("view-sono");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data de referência</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Dormiu às</label><input name="dormiu" type="time"></div>
      <div class="field"><label>Acordou às</label><input name="acordou" type="time"></div>
      <div class="field"><label>Duração</label><input name="duracao" placeholder="Ex.: 07:20"></div>
      <div class="field"><label>Qualidade (1-10)</label><input name="qualidade" type="number" min="1" max="10" value="5"></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Registrar sono", html, "saveSono") + recentTable("sono");
}

function saveSono(e) {
  saveGeneric(e, "sono", "Sono salvo.");
}

function renderBatimentos() {
  const view = document.getElementById("view-batimentos");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Horário</label><input name="horario" type="time"></div>
      <div class="field"><label>FC mínima</label><input name="minima" type="number" min="0" value="60"></div>
      <div class="field"><label>FC média</label><input name="media" type="number" min="0" value="70"></div>
      <div class="field"><label>FC máxima</label><input name="maxima" type="number" min="0" value="120"></div>
      <div class="field"><label>Contexto</label><select name="contexto">${options(["Repouso", "Sono", "Treino", "Estresse", "Outro"])}</select></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Registrar batimentos", html, "saveBatimentos") + recentTable("batimentos");
}

function saveBatimentos(e) {
  saveGeneric(e, "batimentos", "Batimentos salvos.");
}

function renderMedidas() {
  const view = document.getElementById("view-medidas");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div>
      <div class="field"><label>Peso (kg)</label><input name="peso" type="number" step="0.1" min="0" placeholder="Ex.: 78,5"></div>
      <div class="field"><label>Cintura (cm)</label><input name="cintura" type="number" step="0.1" min="0"></div>
      <div class="field"><label>Peito (cm)</label><input name="peito" type="number" step="0.1" min="0"></div>
      <div class="field"><label>Braço esquerdo (cm)</label><input name="bracoEsquerdo" type="number" step="0.1" min="0"></div>
      <div class="field"><label>Braço direito (cm)</label><input name="bracoDireito" type="number" step="0.1" min="0"></div>
      <div class="field"><label>Quadril (cm)</label><input name="quadril" type="number" step="0.1" min="0"></div>
      <div class="field"><label>Perna esquerda (cm)</label><input name="pernaEsquerda" type="number" step="0.1" min="0"></div>
      <div class="field"><label>Perna direita (cm)</label><input name="pernaDireita" type="number" step="0.1" min="0"></div>
      <div class="field full"><label>Observações</label><textarea name="obs" placeholder="Condições da medição, evolução, percepção corporal..."></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Registrar medidas corporais e peso", html, "saveMedidas") + recentTable("medidas");
}

function renderPlanejamento() {
  const view = document.getElementById("view-planejamento");
  if (!view) return;

  const plan = state.planning;
  const todayTasks = plan.tasks.filter(task => task.due === todayISO());
  const pending = plan.tasks.filter(task => !task.done).sort((a, b) => a.due.localeCompare(b.due));
  const [start, end] = weekRange();
  const studyMinutes = state.records.estudo.filter(r => inRange(r.data, start, end)).reduce((sum, r) => sum + num(r.tempo), 0);
  const questionCount = state.records.estudo.filter(r => inRange(r.data, start, end)).reduce((sum, r) => sum + num(r.questoes), 0);

  view.innerHTML = `
    <div class="grid">
      <div class="card">
        <div class="section-heading"><div><h3>Direção da preparação</h3><p class="small">Defina o alvo e os números que conduzem sua semana.</p></div><span class="badge">${plan.examDate ? `Prova em ${brDate(plan.examDate)}` : "Pré-edital"}</span></div>
        <form class="form" onsubmit="savePlanning(event)">
          <div class="form-grid">
            <div class="field full"><label>Concurso, cargo ou missão principal</label><input name="target" value="${escapeHtml(plan.target)}" placeholder="Ex.: CFO, carreira policial, concurso fiscal"></div>
            <div class="field"><label>Data da prova (opcional)</label><input name="examDate" type="date" value="${escapeHtml(plan.examDate)}"></div>
            <div class="field"><label>Meta semanal de estudo (min)</label><input name="weeklyStudyTarget" type="number" min="0" value="${plan.weeklyStudyTarget}"></div>
            <div class="field"><label>Meta semanal de questões</label><input name="weeklyQuestionTarget" type="number" min="0" value="${plan.weeklyQuestionTarget}"></div>
          </div>
          <div class="actions"><button class="primary" type="submit">Salvar direção</button><button class="ghost" type="button" onclick="setView('auditoria')">Fazer auditoria</button></div>
        </form>
      </div>

      <div class="grid cols-3">
        <div class="card metric"><span class="label">Estudo na semana</span><span class="value">${studyMinutes}m</span><span class="sub">meta: ${plan.weeklyStudyTarget}m</span><div class="progress"><div style="width:${Math.min(100, plan.weeklyStudyTarget ? Math.round(studyMinutes / plan.weeklyStudyTarget * 100) : 0)}%"></div></div></div>
        <div class="card metric"><span class="label">Questões na semana</span><span class="value">${questionCount}</span><span class="sub">meta: ${plan.weeklyQuestionTarget}</span><div class="progress"><div style="width:${Math.min(100, plan.weeklyQuestionTarget ? Math.round(questionCount / plan.weeklyQuestionTarget * 100) : 0)}%"></div></div></div>
        <div class="card metric"><span class="label">Tarefas de hoje</span><span class="value">${todayTasks.filter(task => task.done).length}/${todayTasks.length}</span><span class="sub">${pending.length} pendente(s) no plano</span></div>
      </div>

      <div class="card">
        <h3>Adicionar tarefa objetiva</h3>
        <form class="form" onsubmit="addPlanningTask(event)">
          <div class="form-grid">
            <div class="field full"><label>Tarefa</label><input name="title" required placeholder="Ex.: Direito Constitucional, controle de constitucionalidade"></div>
            <div class="field"><label>Matéria</label><select name="subject">${options(subjects)}</select></div>
            <div class="field"><label>Prazo</label><input name="due" type="date" value="${todayISO()}" required></div>
            <div class="field"><label>Minutos previstos</label><input name="minutes" type="number" min="0" value="50"></div>
            <div class="field"><label>Questões previstas</label><input name="questions" type="number" min="0" value="20"></div>
            <div class="field full"><label>Critério de conclusão</label><input name="note" placeholder="Ex.: fechar aula 3 e corrigir 20 questões"></div>
          </div>
          <button class="primary" type="submit">Adicionar ao plano</button>
        </form>
      </div>

      <div class="card"><h3>Fila de execução</h3>${pending.length ? `<div class="task-list">${pending.slice(0, 20).map(task => taskRow(task)).join("")}</div>` : `<p class="small">Nenhuma tarefa pendente. O plano está limpo.</p>`}</div>
    </div>`;
}

function taskRow(task) {
  return `<div class="task-row"><label class="inline"><input type="checkbox" ${task.done ? "checked" : ""} onchange="togglePlanningTask('${actionArg(task.id)}', this.checked)"><span><b>${escapeHtml(task.title)}</b><small>${escapeHtml(task.subject || "Sem matéria")} | ${brDate(task.due)} | ${task.minutes} min | ${task.questions} questões${task.note ? ` | ${escapeHtml(task.note)}` : ""}</small></span></label><button class="ghost" type="button" onclick="deletePlanningTask('${actionArg(task.id)}')">Excluir</button></div>`;
}

function savePlanning(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  state.planning.target = String(data.target || "").trim();
  state.planning.examDate = data.examDate ? normalizeDate(data.examDate) : "";
  state.planning.weeklyStudyTarget = Math.max(0, num(data.weeklyStudyTarget));
  state.planning.weeklyQuestionTarget = Math.max(0, num(data.weeklyQuestionTarget));
  if (!saveState()) return toast("Não foi possível salvar o planejamento.");
  render();
  showSuccess("Direção e metas semanais salvas com sucesso.");
}

function addPlanningTask(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  const task = normalizeTask({ ...data, id: uid() });
  if (!task?.title) return toast("Informe uma tarefa.");
  state.planning.tasks.push(task);
  if (!saveState()) return toast("Não foi possível salvar a tarefa.");
  render();
  showSuccess("Tarefa adicionada ao plano com sucesso.");
}

function togglePlanningTask(encodedId, done) {
  const task = state.planning.tasks.find(item => item.id === decodeURIComponent(encodedId));
  if (!task) return;
  task.done = Boolean(done);
  if (!saveState()) return toast("Não foi possível atualizar a tarefa.");
  render();
}

async function deletePlanningTask(encodedId) {
  if (!await requestConfirmation("Excluir esta tarefa do plano?")) return;
  const id = decodeURIComponent(encodedId);
  state.planning.tasks = state.planning.tasks.filter(task => task.id !== id);
  if (!saveState()) return toast("Não foi possível excluir a tarefa.");
  render();
  toast("Tarefa excluída.");
}

function renderHabitos() {
  const view = document.getElementById("view-habitos");
  if (!view) return;
  const today = todayISO();
  const checkin = state.planning.checkins[today] || {};
  const habits = state.planning.habits.filter(habit => habit.active);
  const completed = habits.filter(habit => checkin.habits?.[habit.id]).length;
  const readiness = checkin.readiness || "";

  view.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="section-heading"><div><h3>Prontidão de hoje</h3><p class="small">Use o registro para calibrar o esforço, não para negociar com a missão.</p></div><span class="badge ${completed === habits.length && habits.length ? "ok" : "warn"}">${completed}/${habits.length}</span></div>
        <form class="form" onsubmit="saveCheckin(event)">
          <div class="field"><label>Prontidão física e mental (1-10)</label><input name="readiness" type="number" min="1" max="10" value="${escapeHtml(readiness)}" required></div>
          <div class="field"><label>Humor e foco</label><select name="mood">${options(["Excelente", "Bom", "Estável", "Cansado", "Sob pressão"], checkin.mood || "Estável")}</select></div>
          <div class="field full"><label>Nota de comando</label><textarea name="note" placeholder="Como você vai proteger o essencial hoje?">${escapeHtml(checkin.note || "")}</textarea></div>
          <div class="habit-checklist">${habits.map(habit => `<label class="inline"><input name="habit-${escapeHtml(habit.id)}" type="checkbox" ${checkin.habits?.[habit.id] ? "checked" : ""}> ${escapeHtml(habit.label)}</label>`).join("")}</div>
          <button class="primary" type="submit">Salvar prontidão</button>
        </form>
      </div>
      <div class="card">
        <h3>Hábitos do sistema</h3>
        <p class="small">Mantenha poucos hábitos essenciais. Consistência vence uma lista impossível.</p>
        <form class="form" onsubmit="addHabit(event)">
          <div class="field"><label>Novo hábito</label><input name="label" required placeholder="Ex.: 20 minutos de mobilidade"></div>
          <button class="ghost" type="submit">Adicionar hábito</button>
        </form>
        <div class="habit-list">${state.planning.habits.map(habit => `<div class="task-row"><span>${escapeHtml(habit.label)}</span><button class="ghost" type="button" onclick="toggleHabit('${actionArg(habit.id)}')">${habit.active ? "Desativar" : "Ativar"}</button></div>`).join("")}</div>
      </div>
    </div>`;
}

function saveCheckin(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const habits = {};
  state.planning.habits.filter(habit => habit.active).forEach(habit => { habits[habit.id] = Boolean(form.elements[`habit-${habit.id}`]?.checked); });
  state.planning.checkins[todayISO()] = { readiness: num(data.readiness), mood: data.mood, note: String(data.note || "").trim(), habits };
  if (!saveState()) return toast("Não foi possível salvar a prontidão.");
  render();
  showSuccess("Prontidão e hábitos de hoje salvos com sucesso.");
}

function addHabit(event) {
  event.preventDefault();
  const label = String(new FormData(event.target).get("label") || "").trim();
  if (!label) return;
  state.planning.habits.push({ id: uid(), label, active: true });
  if (!saveState()) return toast("Não foi possível salvar o hábito.");
  render();
  showSuccess("Hábito adicionado com sucesso.");
}

function toggleHabit(encodedId) {
  const habit = state.planning.habits.find(item => item.id === decodeURIComponent(encodedId));
  if (!habit) return;
  habit.active = !habit.active;
  if (!saveState()) return toast("Não foi possível atualizar o hábito.");
  render();
}

function renderErros() {
  const view = document.getElementById("view-erros");
  if (!view) return;
  const errors = state.records.erros;
  const groups = {};
  errors.forEach(error => {
    const key = `${error.materia || "Sem matéria"} | ${error.assunto || "Sem assunto"}`;
    groups[key] = (groups[key] || 0) + 1;
  });
  const repeated = Object.entries(groups).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  const total = errors.length;
  view.innerHTML = `
    <div class="grid">
      <div class="card"><h3>Registrar erro</h3>
        <form class="form" onsubmit="saveErro(event)"><div class="form-grid">
          <div class="field"><label>Matéria</label><select name="materia">${options(subjects)}</select></div>
          <div class="field"><label>Assunto</label><input name="assunto" required placeholder="Ex.: crase, atos administrativos"></div>
          <div class="field full"><label>Erro cometido</label><textarea name="erro" required placeholder="O que você marcou ou explicou errado?"></textarea></div>
          <div class="field"><label>Causa</label><select name="causa">${options(["Desatenção", "Falta de teoria", "Esquecimento", "Interpretação", "Pressa", "Outra"])}</select></div>
          <div class="field"><label>Status</label><select name="status">${options(["Pendente", "Revisado", "Corrigido"])}</select></div>
          <div class="field full"><label>Correção</label><textarea name="correcao" required placeholder="Regra, raciocínio ou procedimento correto"></textarea></div>
          <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
        </div><button class="primary" type="submit">Salvar erro</button></form>
      </div>
      <div class="grid cols-3">
        <div class="card metric"><span class="label">Erros registrados</span><span class="value">${total}</span><span class="sub">histórico completo</span></div>
        <div class="card metric"><span class="label">Pontos recorrentes</span><span class="value">${repeated.length}</span><span class="sub">assuntos com repetição</span></div>
        <div class="card metric"><span class="label">Reincidência</span><span class="value">${total ? Math.round(errors.filter(error => groups[`${error.materia || "Sem matéria"} | ${error.assunto || "Sem assunto"}`] > 1).length / total * 100) : 0}%</span><span class="sub">registros em pontos repetidos</span></div>
      </div>
      <div class="card"><h3>Revisão automática dos recorrentes</h3>${repeated.length ? repeated.map(([key, count]) => `<p><span class="badge danger">${count}x</span> <b>${escapeHtml(key)}</b></p>`).join("") : `<p class="small">Ainda não há reincidências. Continue registrando os erros sem julgamento.</p>`}</div>
      ${recentTable("erros")}
    </div>`;
}

function saveErro(event) {
  saveGeneric(event, "erros", "Erro registrado para revisão.");
}

function renderEdital() {
  const view = document.getElementById("view-edital");
  if (!view) return;
  const items = state.planning.syllabus;
  const counts = ["Não iniciado", "Em estudo", "Revisado", "Dominado"].map(status => ({ status, count: items.filter(item => item.status === status).length }));
  const coverage = items.length ? Math.round(items.filter(item => ["Revisado", "Dominado"].includes(item.status)).length / items.length * 100) : 0;
  view.innerHTML = `
    <div class="grid">
      <div class="card"><div class="section-heading"><div><h3>Mapa do edital</h3><p class="small">Transforme o conteúdo em uma superfície visível de avanço.</p></div><span class="badge ok">${coverage}% coberto</span></div>
        <form class="form" onsubmit="addSyllabusItem(event)"><div class="form-grid"><div class="field"><label>Disciplina</label><select name="subject">${options(subjects)}</select></div><div class="field"><label>Assunto</label><input name="topic" required placeholder="Ex.: controle de constitucionalidade"></div><div class="field"><label>Status</label><select name="status">${options(["Não iniciado", "Em estudo", "Revisado", "Dominado"])}</select></div><div class="field"><label>Observação</label><input name="note" placeholder="Fonte ou próximo passo"></div></div><button class="primary" type="submit">Adicionar assunto</button></form>
      </div>
      <div class="grid cols-4">${counts.map(item => `<div class="card metric"><span class="label">${item.status}</span><span class="value">${item.count}</span><span class="sub">assunto(s)</span></div>`).join("")}</div>
      <div class="card"><h3>Conteúdo cadastrado</h3>${items.length ? `<div class="task-list">${items.map(item => `<div class="task-row"><span><b>${escapeHtml(item.subject)}: ${escapeHtml(item.topic)}</b><small>${escapeHtml(item.note || "Sem observação")}</small></span><select aria-label="Status de ${escapeHtml(item.topic)}" onchange="updateSyllabusStatus('${actionArg(item.id)}', this.value)">${options(["Não iniciado", "Em estudo", "Revisado", "Dominado"], item.status)}</select></div>`).join("")}</div>` : `<p class="small">Cadastre os assuntos do seu edital para acompanhar a cobertura real.</p>`}</div>
    </div>`;
}

function addSyllabusItem(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  const item = normalizeSyllabus({ ...data, id: uid() });
  if (!item?.topic) return toast("Informe o assunto do edital.");
  state.planning.syllabus.push(item);
  if (!saveState()) return toast("Não foi possível salvar o assunto.");
  render();
  showSuccess("Assunto adicionado ao mapa do edital.");
}

function updateSyllabusStatus(encodedId, status) {
  const item = state.planning.syllabus.find(entry => entry.id === decodeURIComponent(encodedId));
  if (!item) return;
  item.status = status;
  if (!saveState()) return toast("Não foi possível atualizar o edital.");
  render();
}

function readinessScore() {
  const today = todayISO();
  const checkin = state.planning.checkins[today];
  const sleep = todayRecords("sono").at(-1);
  const study = todayRecords("estudo").reduce((sum, record) => sum + num(record.tempo), 0);
  const training = todayRecords("musculacao").length + todayRecords("corrida").length;
  const habits = state.planning.habits.filter(habit => habit.active);
  const habitsDone = habits.filter(habit => checkin?.habits?.[habit.id]).length;
  const parts = [num(checkin?.readiness), num(sleep?.qualidade), Math.min(10, study / 30), Math.min(10, habits.length ? habitsDone / habits.length * 10 : 0)].filter(value => value > 0);
  return parts.length ? Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length * 10) / 10 : 0;
}

function weeklyReviewSummary() {
  const [start, end] = weekRange();
  const studies = state.records.estudo.filter(record => inRange(record.data, start, end));
  const totalMinutes = studies.reduce((sum, record) => sum + num(record.tempo), 0);
  const questions = studies.reduce((sum, record) => sum + num(record.questoes), 0);
  const bySubject = {};
  studies.forEach(record => { bySubject[record.materia] = (bySubject[record.materia] || 0) + num(record.tempo); });
  const neglected = subjects.filter(subject => !bySubject[subject]).slice(0, 2);
  const goal = state.planning.weeklyStudyTarget;
  return { totalMinutes, questions, neglected, recommendation: goal && totalMinutes < goal ? `Recupere ${goal - totalMinutes} minutos de estudo na próxima semana.` : "Mantenha o ritmo e aumente a qualidade das questões." };
}

function renderRecuperacao() {
  const view = document.getElementById("view-recuperacao");
  if (!view) return;
  const summary = weeklyReviewSummary();
  const todayLoad = todayRecords("musculacao").reduce((sum, record) => sum + num(record.esforco), 0) + todayRecords("corrida").length * 5;
  const sleep = todayRecords("sono").at(-1);
  const warning = todayLoad >= 8 && num(sleep?.qualidade) > 0 && num(sleep.qualidade) <= 5;
  view.innerHTML = `<div class="grid cols-2"><div class="card"><h3>Registrar recuperação</h3><form class="form" onsubmit="saveRecuperacao(event)"><div class="form-grid"><div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div><div class="field"><label>Tipo</label><select name="tipo">${options(["Treino leve", "Mobilidade", "Descanso", "Caminhada", "Alongamento", "Outro"])}</select></div><div class="field"><label>Prontidão (1-10)</label><input name="prontidao" type="number" min="1" max="10" value="7"></div><div class="field"><label>Dor (0-10)</label><input name="dor" type="number" min="0" max="10" value="0"></div><div class="field"><label>Fadiga (0-10)</label><input name="fadiga" type="number" min="0" max="10" value="0"></div><div class="field"><label>Duração (min)</label><input name="duracao" type="number" min="0" value="20"></div><div class="field full"><label>Observações</label><textarea name="obs" placeholder="Região dolorida, sensação corporal, ajuste feito..."></textarea></div></div><button class="primary" type="submit">Salvar recuperação</button></form></div><div class="card"><h3>Leitura de carga</h3><p class="${warning ? "warning-text" : "small"}">${warning ? "O volume de treino e o sono baixo sugerem reduzir a intensidade hoje." : "Nenhum sinal forte de excesso foi identificado pelos registros atuais."}</p><h4>Revisão semanal automática</h4><p>Estudo: <b>${summary.totalMinutes} min</b> | Questões: <b>${summary.questions}</b></p><p>Matérias negligenciadas: <b>${escapeHtml(summary.neglected.join(", ") || "nenhuma")}</b></p><p><b>Ajuste:</b> ${escapeHtml(summary.recommendation)}</p><p class="small">Índice de prontidão atual: ${readinessScore()}/10</p></div></div>${recentTable("recuperacao")}`;
}

function saveRecuperacao(event) {
  saveGeneric(event, "recuperacao", "Registro de recuperação salvo.");
}

function renderProva() {
  const view = document.getElementById("view-prova");
  if (!view) return;
  const examDate = state.planning.examDate;
  const days = examDate ? Math.max(0, Math.ceil((new Date(`${examDate}T00:00:00`) - new Date(`${todayISO()}T00:00:00`)) / 86400000)) : null;
  const exams = state.records.simulados;
  const avg = exams.length ? Math.round(exams.reduce((sum, exam) => sum + num(exam.aproveitamento), 0) / exams.length * 10) / 10 : 0;
  view.innerHTML = `<div class="grid"><div class="card"><div class="section-heading"><div><h3>Modo prova</h3><p class="small">A contagem começa quando você informa a data no Planejamento.</p></div><span class="badge ${days !== null && days <= 30 ? "danger" : "ok"}">${days === null ? "Sem data" : `${days} dia(s)`}</span></div><p class="countdown">${days === null ? "Defina a data da prova para iniciar a contagem." : days === 0 ? "A prova é hoje." : `${days} dia(s) até a prova.`}</p><button class="ghost" onclick="setView('planejamento')">Ajustar data e metas</button></div><div class="grid cols-3"><div class="card metric"><span class="label">Simulados</span><span class="value">${exams.length}</span><span class="sub">registrados</span></div><div class="card metric"><span class="label">Aproveitamento médio</span><span class="value">${avg}%</span><span class="sub">evolução acumulada</span></div><div class="card metric"><span class="label">Tempo médio</span><span class="value">${exams.length ? escapeHtml(exams.at(-1).tempo || "-") : "-"}</span><span class="sub">último registro</span></div></div><div class="card"><h3>Registrar simulado</h3><form class="form" onsubmit="saveSimulado(event)"><div class="form-grid"><div class="field"><label>Nome/banca</label><input name="nome" required placeholder="Ex.: Simulado Cebraspe 01"></div><div class="field"><label>Data</label><input name="data" type="date" value="${todayISO()}" required></div><div class="field"><label>Questões</label><input name="questoes" type="number" min="0" value="100"></div><div class="field"><label>Acertos</label><input name="acertos" type="number" min="0" value="0"></div><div class="field"><label>Tempo total</label><input name="tempo" placeholder="Ex.: 03:30:00"></div><div class="field"><label>Aproveitamento</label><input name="aproveitamento" value="0%" readonly></div><div class="field full"><label>Observações</label><textarea name="obs"></textarea></div></div><button class="primary" type="submit">Salvar simulado</button></form></div>${recentTable("simulados")}</div>`;
  const form = view.querySelector("form");
  if (form) form.elements.acertos?.addEventListener("input", () => { form.elements.aproveitamento.value = `${percent(form.elements.acertos.value, form.elements.questoes.value)}%`; });
}

function saveSimulado(event) {
  saveGeneric(event, "simulados", "Simulado salvo.", { beforeSave: record => { record.aproveitamento = percent(record.acertos, record.questoes); } });
}

function saveMedidas(e) {
  saveGeneric(e, "medidas", "Medidas e peso salvos.");
}

function recentTable(type) {
  const rows = state.records[type].slice(-8).reverse();

  if (!rows.length) {
    return `<div class="card"><h3>Histórico recente</h3><p class="small">Nenhum registro ainda.</p></div>`;
  }

  return `
    <div class="card">
      <h3>Histórico recente</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Resumo</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
        <td>${brDate(r.data)}</td>
                <td>${summaryRecord(type, r)}</td>
                <td>
                  <button class="ghost" onclick="editRecord('${type}', '${actionArg(r.id)}')">Editar</button>
                  <button class="ghost" onclick="deleteRecord('${type}', '${actionArg(r.id)}')">Excluir</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function editRecord(type, id) {
  id = decodeURIComponent(id);
  const record = state.records[type].find(r => r.id === id);

  if (!record) {
    toast("Registro não encontrado.");
    return;
  }

  setView(type);

  setTimeout(() => {
    const form = document.querySelector(`#view-${type} form`);

    if (!form) {
      toast("Formulário não encontrado.");
      return;
    }

    form.dataset.editId = id;

    Object.entries(record).forEach(([key, value]) => {
      const field = form.elements[key];

      if (!field) return;

      if (field.type === "checkbox") {
        field.checked = Boolean(value);
      } else {
        field.value = value ?? "";
      }
    });

    if (type === "estudo" && form.aproveitamento) {
      form.aproveitamento.value = `${percent(form.acertos.value, form.questoes.value)}%`;
    }

    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.textContent = "Salvar alterações";
    }

    form.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Registro aberto para edição. Altere os dados e salve.");
  }, 150);
}

async function deleteRecord(type, encodedId) {
  const id = decodeURIComponent(encodedId);
  if (!await requestConfirmation("Excluir este registro?")) return;

  state.records[type] = state.records[type].filter(r => r.id !== id);

  saveState();
  toast("Registro excluído.");
  render();
}

function renderHistorico() {
  const view = document.getElementById("view-historico");
  if (!view) return;

  const all = [];

  for (const [type, arr] of Object.entries(state.records)) {
    arr.forEach(r => all.push({ ...r, type }));
  }

  all.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  view.innerHTML = `
    <div class="card">
      <h3>Histórico geral</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Área</th>
              <th>Data</th>
              <th>Resumo</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${all.length
              ? all.map(r => `
                <tr>
                  <td><span class="badge">${labelType(r.type)}</span></td>
                  <td>${brDate(r.data)}</td>
                  <td>${summaryRecord(r.type, r)}</td>
                  <td>
                    <button class="ghost" onclick="editRecord('${r.type}', '${actionArg(r.id)}')">Editar</button>
                    <button class="ghost" onclick="deleteRecord('${r.type}', '${actionArg(r.id)}')">Excluir</button>
                  </td>
                </tr>
              `).join("")
              : `<tr><td colspan="4">Nenhum registro encontrado.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function weekRange(dateISO = todayISO()) {
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function inRange(iso, start, end) {
  return iso >= start && iso <= end;
}

function renderSemanal() {
  const view = document.getElementById("view-semanal");
  if (!view) return;

  const [start, end] = weekRange();

  const estudos = state.records.estudo.filter(r => inRange(r.data, start, end));
  const revisoes = state.records.revisao.filter(r => inRange(r.data, start, end));
  const musc = state.records.musculacao.filter(r => inRange(r.data, start, end));
  const corr = state.records.corrida.filter(r => inRange(r.data, start, end));
  const sono = state.records.sono.filter(r => inRange(r.data, start, end));
  const bat = state.records.batimentos.filter(r => inRange(r.data, start, end));

  const tempo = estudos.reduce((s, r) => s + num(r.tempo), 0);
  const questoes = estudos.reduce((s, r) => s + num(r.questoes), 0);
  const acertos = estudos.reduce((s, r) => s + num(r.acertos), 0);
  const erros = estudos.reduce((s, r) => s + num(r.erros), 0);
  const km = corr.reduce((s, r) => s + num(r.distancia), 0);
  const mediaSono = sono.length ? Math.round(sono.reduce((s, r) => s + num(r.qualidade), 0) / sono.length * 10) / 10 : "-";
  const fcVals = bat.flatMap(r => [num(r.minima), num(r.media), num(r.maxima)]).filter(v => v > 0);

  const bySubject = {};
  estudos.forEach(r => {
    bySubject[r.materia] = (bySubject[r.materia] || 0) + num(r.tempo);
  });

  view.innerHTML = `
    <div class="grid">
      <div class="card"><h3>Período: ${brDate(start)} a ${brDate(end)}</h3></div>
      <div class="grid cols-3">
        <div class="card metric"><span class="label">Estudo</span><span class="value">${tempo}m</span><span class="sub">${questoes} questões | ${percent(acertos, questoes)}% acerto</span></div>
        <div class="card metric"><span class="label">Revisões</span><span class="value">${revisoes.length}</span><span class="sub">registradas na semana</span></div>
        <div class="card metric"><span class="label">Treino</span><span class="value">${musc.length}</span><span class="sub">musculação</span></div>
        <div class="card metric"><span class="label">Corrida</span><span class="value">${km.toFixed(1)} km</span><span class="sub">${corr.length} corrida(s)</span></div>
        <div class="card metric"><span class="label">Sono</span><span class="value">${mediaSono}</span><span class="sub">qualidade média</span></div>
        <div class="card metric"><span class="label">FC</span><span class="value">${fcVals.length ? Math.round(fcVals.reduce((a, b) => a + b, 0) / fcVals.length) : "-"}</span><span class="sub">média geral registrada</span></div>
      </div>
      <div class="card">
        <h3>Tempo por matéria</h3>
        ${Object.keys(bySubject).length
          ? Object.entries(bySubject).map(([k, v]) => `<p><b>${escapeHtml(k)}</b>: ${v} min</p>`).join("")
          : `<p class="small">Nenhum estudo registrado nesta semana.</p>`}
      </div>
      <div class="card">
        <h3>Questões</h3>
        <p>Feitas: <b>${questoes}</b> | Acertos: <b>${acertos}</b> | Erros: <b>${erros}</b> | Aproveitamento: <b>${percent(acertos, questoes)}%</b></p>
      </div>
      <div class="card">
        <h3>Revisão automática da semana</h3>
        <p><b>Matéria negligenciada:</b> ${escapeHtml(weeklyReviewSummary().neglected.join(", ") || "nenhuma")}</p>
        <p><b>Ajuste recomendado:</b> ${escapeHtml(weeklyReviewSummary().recommendation)}</p>
      </div>
    </div>`;
}

function renderAuditoria() {
  const view = document.getElementById("view-auditoria");
  if (!view) return;

  const html = `
    <div class="form-grid">
      <div class="field"><label>Semana de referência</label><input name="data" type="date" value="${weekRange()[0]}" required></div>
      <div class="field"><label>Decisão da semana</label><select name="decisao">${options(["Avançar", "Reforçar", "Corrigir rota", "Priorizar revisão", "Recolocar matéria no ciclo"])}</select></div>
      <div class="field"><label>Matéria mais negligenciada</label><select name="materiaNegligenciada">${options(["Nenhuma", ...subjects])}</select></div>
      <div class="field"><label>Prioridade da próxima semana</label><input name="prioridade"></div>
      <div class="field full"><label>O que funcionou</label><textarea name="funcionou"></textarea></div>
      <div class="field full"><label>O que falhou</label><textarea name="falhou"></textarea></div>
      <div class="field full"><label>Principal causa da falha</label><textarea name="causa"></textarea></div>
      <div class="field full"><label>Principal erro recorrente</label><textarea name="erroRecorrente"></textarea></div>
      <div class="field full"><label>Revisões pendentes</label><textarea name="revisoesPendentes"></textarea></div>
      <div class="field full"><label>Correção de rota</label><textarea name="correcao"></textarea></div>
      <div class="field full"><label>Observações</label><textarea name="obs"></textarea></div>
    </div>`;

  view.innerHTML = formWrap("Auditoria semanal", html, "saveAuditoria") + recentTable("auditoria");
}

function saveAuditoria(e) {
  saveGeneric(e, "auditoria", "Auditoria salva.");
}

function renderBackup() {
  const view = document.getElementById("view-backup");
  if (!view) return;

  view.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>Exportar backup</h3>
        <p>Baixe seus dados em JSON. Guarde o arquivo em local seguro.</p>
        <button class="primary" onclick="exportBackup()">Exportar JSON</button>
      </div>
      <div class="card">
        <h3>Importar backup</h3>
        <p>Importa um JSON exportado por este app. A importação substitui os dados atuais.</p>
        <input type="file" id="importFile" accept="application/json,.json">
        <div class="actions" style="margin-top:12px">
          <button class="ghost" onclick="importBackup()">Importar JSON</button>
        </div>
      </div>
      <div class="card">
        <h3>Limpar dados</h3>
        <p>Use apenas se tiver backup.</p>
        <button class="danger" onclick="clearAll()">Apagar tudo</button>
      </div>
      <div class="card">
        <h3>Privacidade local</h3>
        <p>Os registros ficam neste dispositivo. O backup automático local é atualizado junto com cada salvamento.</p>
        <form class="form" onsubmit="setPin(event)">
          <div class="field"><label>PIN opcional de bloqueio</label><input name="pin" type="password" inputmode="numeric" minlength="4" maxlength="12" placeholder="4 a 12 dígitos"></div>
          <div class="actions"><button class="ghost" type="submit">Definir PIN</button><button class="ghost" type="button" onclick="lockApp()">Bloquear agora</button></div>
        </form>
      </div>
    </div>`;
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function setPin(event) {
  event.preventDefault();
  const pin = String(new FormData(event.target).get("pin") || "");
  if (!/^\d{4,12}$/.test(pin)) return toast("Use um PIN numérico de 4 a 12 dígitos.");
  state.security.pinHash = await hashPin(pin);
  state.security.locked = false;
  if (!saveState()) return toast("Não foi possível salvar o PIN neste dispositivo.");
  event.target.reset();
  showSuccess("PIN definido. Seus dados continuam armazenados apenas neste dispositivo.");
}

function lockApp() {
  if (!state.security.pinHash) return toast("Defina um PIN antes de bloquear o painel.");
  state.security.locked = true;
  saveState();
  document.getElementById("lockModal")?.classList.remove("hidden");
}

async function unlockApp(event) {
  event.preventDefault();
  const pin = String(new FormData(event.target).get("pin") || "");
  if (await hashPin(pin) !== state.security.pinHash) return toast("PIN incorreto.");
  state.security.locked = false;
  saveState();
  event.target.reset();
  document.getElementById("lockModal")?.classList.add("hidden");
}

function exportBackup() {
  const backup = {
    app: "Painel de Comando PWA",
    dataExportacao: new Date().toISOString(),
    state
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");

  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `painel-comando-backup-${todayISO()}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
  toast("Backup exportado com sucesso.");
}

function importBackup() {
  const input = document.getElementById("importFile");
  const file = input?.files?.[0];

  if (!file) return toast("Selecione um arquivo JSON.");

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const importedState = parseBackup(JSON.parse(reader.result));
      if (!importedState) throw new Error("Formato inválido.");
      if (!await requestConfirmation("Importar este backup substituirá os dados atuais. Você já conferiu o arquivo?")) return;
      state = merge(defaultState, importedState);
      if (!saveState()) throw new Error("Não foi possível gravar o backup.");
      toast("Backup importado com sucesso.");
      render();
    } catch (e) {
      console.error(e);
      toast("Arquivo inválido.");
    }
  };

  reader.readAsText(file);
}

function parseBackup(data) {
  let importedState = null;
  if (data?.state?.records) importedState = data.state;
  else if (data?.records) importedState = data;
  else if (data?.localStorage?.[STORAGE_KEY]) importedState = JSON.parse(data.localStorage[STORAGE_KEY]);
  return importedState?.records ? importedState : null;
}

async function clearAll() {
  if (!await requestConfirmation("Apagar todos os dados locais? Esta ação exige um backup para ser desfeita.")) return;

  state = clone(defaultState);
  if (!saveState()) return toast("Não foi possível apagar os dados neste dispositivo.");
  toast("Dados apagados.");
  render();
}

async function enableNotifications() {
  if (!("Notification" in window)) return toast("Este navegador não oferece notificações.");

  const perm = await Notification.requestPermission();

  if (perm !== "granted") return toast("Permissão de notificação não concedida.");

  new Notification("Painel de Comando", { body: "Notificações ativadas." });
  toast("Notificações ativadas.");
}

function checkReminder() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const hm = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const key = `reminder-${todayISO()}-${hm}`;

  const reminders = {
    "07:00": "Inicie o dia com comando. Registre revisão, estudo ou prioridade.",
    "11:30": "Cheque parcial: registre o que já foi feito e ajuste a rota.",
    "20:45": "Fechamento do dia: alimente o Painel de Comando."
  };

  if (reminders[hm] && !storageGet(key)) {
    new Notification("Painel de Comando", { body: reminders[hm] });
    storageSet(key, "1");
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const installBtn = document.getElementById("installBtn");
  if (installBtn) installBtn.classList.remove("hidden");
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  const notifyBtn = document.getElementById("notifyBtn");
  if (notifyBtn) notifyBtn.addEventListener("click", enableNotifications);

  const installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;

      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add("hidden");
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  render();
  document.getElementById("confirmCancel")?.addEventListener("click", () => closeConfirmation(false));
  document.getElementById("confirmAccept")?.addEventListener("click", () => closeConfirmation(true));
  document.getElementById("confirmModal")?.addEventListener("click", event => {
    if (event.target.id === "confirmModal") closeConfirmation(false);
  });
  document.getElementById("successAccept")?.addEventListener("click", closeSuccess);
  document.getElementById("successModal")?.addEventListener("click", event => {
    if (event.target.id === "successModal") closeSuccess();
  });
  if (state.security.locked && state.security.pinHash) document.getElementById("lockModal")?.classList.remove("hidden");
  setInterval(checkReminder, 30000);
});
