// 營運戰情中心 前端（純 JavaScript，不用編譯）
"use strict";

/* ---------- 對照表 ---------- */
const STAGES = { idea: "新項目籌備", spec: "開發規範", quote: "報價", tender: "招標", won: "得標／下單", executing: "執行中", closed: "結案", lost: "未得標／放棄", paused: "暫停" };
const FUNNEL = ["idea", "spec", "quote", "tender", "won"];
const FUNNEL_COLOR = ["--r250", "--r350", "--r450", "--r550", "--r650"];
const CHANNELS = { gov_tender: "公家招標", small_purchase: "小額採購", private: "民間客戶", private_project: "民間專案" };
const CHANNEL_COLOR = { gov_tender: "--s1", small_purchase: "--s2", private: "--s3", private_project: "--s4" };
const TENDER_RESULT = { watching: "監控中", bidding: "投標中", won: "得標", lost: "未得標", cancelled: "流標／廢標", no_bid: "不投標" };
const QUOTE_STATUS = { draft: "草稿", sent: "已送出", accepted: "客戶接受", rejected: "未接受" };
const STEP_NAME = {
  customer_po: "客戶下採購單", tender_won: "得標", po_sent: "對原廠下 PO", pi_received: "收到原廠 PI", paid: "銀行匯款", tt_sent: "水單傳給原廠",
  oc_received: "收到原廠 OC", goods_ready: "原廠備妥貨", shipped: "原廠出貨", arrival_notice: "到貨通知", broker_notified: "通知報關行",
  declaration_check: "報單預審", declared: "投單", customs_c1: "清關 C1", customs_c2: "清關 C2", customs_c3: "清關 C3", released: "海關放行",
  delivered: "送達客戶", accepted: "客戶驗收", invoiced: "開發票", warranty: "提供保固", customer_paid: "客戶貨款入帳", supplier_paid: "付原廠貨款",
};
// 22 步收成 6 個階段（看板的欄）
const PHASES = [
  { name: "下單", steps: ["customer_po", "tender_won", "po_sent", "pi_received"] },
  { name: "付款", steps: ["paid", "tt_sent", "oc_received"] },
  { name: "生產出貨", steps: ["goods_ready", "shipped"] },
  { name: "清關", steps: ["arrival_notice", "broker_notified", "declaration_check", "declared", "customs_c1", "customs_c2", "customs_c3", "released"] },
  { name: "交貨驗收", steps: ["delivered", "accepted"] },
  { name: "收款結案", steps: ["invoiced", "warranty", "customer_paid", "supplier_paid"] },
];
const TABS = [
  { id: "overview", name: "總覽" },
  { id: "idea", name: "新項目籌備" },
  { id: "spec", name: "開發規範" },
  { id: "quote", name: "報價" },
  { id: "tender", name: "招標" },
  { id: "small", name: "小額採購" },
  { id: "private", name: "民間客戶" },
  { id: "exec", name: "執行中" },
  { id: "gantt", name: "工程甘特" },
  { id: "settings", name: "設定" },
];

/* ---------- 狀態 ---------- */
let S = { me: "", projects: [], options: [], quotes: [], tenders: [], watch: [], milestones: [], cases: [], rules: { small_purchase_max: 150000 } };
let TAB = "overview";
try { TAB = sessionStorage.getItem("war_tab") || "overview"; } catch { /* 無痕模式 */ }
let DEMO = false;
let ID_TOKEN = null;
const app = document.getElementById("app");
const tip = document.getElementById("tip");

/* ---------- 小工具 ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const todayStr = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daysTo = (d) => (d ? Math.round((Date.parse(String(d).slice(0, 10)) - Date.parse(todayStr())) / 86400e3) : null);
const ymd = (d) => (d ? String(d).slice(0, 10).replaceAll("-", "/") : "—");
const hm = (d) => (d ? new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
function money(v) { const n = num(v); return n == null ? "—" : "NT$ " + Math.round(n).toLocaleString("en-US"); }
function wan(v) { const n = num(v); if (n == null) return "—"; if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + " 億"; if (Math.abs(n) >= 1e4) return Math.round(n / 1e4).toLocaleString("en-US") + " 萬"; return Math.round(n).toLocaleString("en-US"); }
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
// 期限狀態：一定同時給圖示＋文字
function dueStatus(days, doneText) {
  if (days == null) return `<span class="st neutral">— 未設定</span>`;
  if (doneText) return `<span class="st good">✓ ${esc(doneText)}</span>`;
  if (days < 0) return `<span class="st critical">✕ 逾期 ${-days} 天</span>`;
  if (days === 0) return `<span class="st critical">! 今天</span>`;
  if (days <= 7) return `<span class="st serious">! 剩 ${days} 天</span>`;
  if (days <= 30) return `<span class="st warning">◷ 剩 ${days} 天</span>`;
  return `<span class="st good">✓ 剩 ${days} 天</span>`;
}
const chanChip = (c) => `<span class="chip"><i style="background:var(${CHANNEL_COLOR[c] || "--muted"})"></i>${esc(CHANNELS[c] || c)}</span>`;
const stageChip = (s) => `<span class="st neutral">${esc(STAGES[s] || s)}</span>`;
function bindTips(root) {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => { tip.innerHTML = el.dataset.tip; tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = e.clientY + 12 + "px"; });
    el.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  });
}

/* ---------- 後端 ---------- */
async function api(action, payload = {}) {
  if (DEMO) return demoApi(action, payload);
  const res = await fetch(CONFIG.API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: ID_TOKEN, action, ...payload }) });
  const d = await res.json().catch(() => ({ error: `伺服器回應異常（${res.status}）` }));
  if (!res.ok || d.error) {
    if (res.status === 401 && !DEMO && window.liff) { liff.logout(); location.reload(); }
    throw new Error(d.error || res.status);
  }
  return d;
}
async function reload() {
  try {
    const d = await api("load");
    S = { ...S, ...d };
    document.getElementById("who").textContent = S.me ? `${S.me}` : "";
    render();
  } catch (e) {
    app.innerHTML = `<div class="banner err">讀取失敗：${esc(e.message)}</div>`;
  }
}
async function save(table, row) {
  const d = await api("save", { table, row });
  const list = tableList(table);
  const i = list.findIndex((x) => x.id === d.row.id);
  if (i >= 0) list[i] = d.row; else list.unshift(d.row);
  return d.row;
}
async function remove(table, id) {
  await api("delete", { table, id });
  const list = tableList(table);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
}
function tableList(t) { return { projects: S.projects, project_options: S.options, quotes: S.quotes, tenders: S.tenders, tender_watch: S.watch, eng_milestones: S.milestones }[t]; }

/* ---------- 導覽 ---------- */
function renderTabs() {
  const live = S.projects.filter((p) => !["closed", "lost"].includes(p.stage));
  const counts = {
    idea: live.filter((p) => p.stage === "idea").length,
    spec: live.filter((p) => p.stage === "spec").length,
    quote: live.filter((p) => p.stage === "quote").length,
    tender: S.tenders.filter((t) => ["watching", "bidding"].includes(t.result)).length + S.projects.filter((p) => p.stage === "tender" && !S.tenders.some((t) => t.project_id === p.id)).length,
    small: live.filter((p) => p.channel === "small_purchase").length,
    private: live.filter((p) => p.channel === "private" || p.channel === "private_project").length,
    exec: S.cases.filter((c) => c.status === "open").length,
  };
  document.getElementById("tabs").innerHTML = TABS.map((t) =>
    `<button class="${t.id === TAB ? "on" : ""}" data-tab="${t.id}">${t.name}${counts[t.id] ? `<span class="count">${counts[t.id]}</span>` : ""}</button>`).join("");
  document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => go(b.dataset.tab));
  document.querySelector("#tabs button.on")?.scrollIntoView({ inline: "center", block: "nearest" });
}
function go(tab) { TAB = tab; try { sessionStorage.setItem("war_tab", tab); } catch { /* 無痕模式 */ } render(); window.scrollTo(0, 0); }

function render() {
  renderTabs();
  const fab = document.getElementById("fab");
  const fabMap = {
    idea: () => editProject({ stage: "idea" }), spec: () => editProject({ stage: "spec" }), quote: () => editProject({ stage: "quote" }),
    small: () => editProject({ channel: "small_purchase" }), private: () => editProject({ channel: "private" }),
    overview: () => editProject({}), tender: () => editTender({}), gantt: () => editMilestone({}), settings: () => editWatch({}),
  };
  fab.style.display = fabMap[TAB] ? "block" : "none";
  fab.onclick = fabMap[TAB] || null;
  const views = { overview: vOverview, idea: () => vStage("idea"), spec: vSpec, quote: vQuote, tender: vTender, small: vSmall, private: vPrivate, exec: vExec, gantt: vGantt, settings: vSettings };
  app.innerHTML = (DEMO ? `<div class="banner">示範模式：畫面上都是假資料，改動不會存檔。正式使用請用 LINE 登入。</div>` : "") + (views[TAB] || vOverview)();
  bindTips(app);
  app.querySelectorAll("[data-open]").forEach((el) => el.onclick = () => openProject(Number(el.dataset.open)));
  app.querySelectorAll("[data-tender]").forEach((el) => el.onclick = () => editTender(S.tenders.find((t) => t.id === Number(el.dataset.tender))));
  app.querySelectorAll("[data-mk-tender]").forEach((el) => el.onclick = () => {
    const p = S.projects.find((x) => x.id === Number(el.dataset.mkTender));
    if (p) editTender({ project_id: p.id, title: p.name, agency: p.customer, result: "bidding" });
  });
  app.querySelectorAll("[data-ms]").forEach((el) => el.onclick = () => editMilestone(S.milestones.find((m) => m.id === Number(el.dataset.ms))));
  app.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => go(el.dataset.go));
  app.querySelectorAll("[data-watch]").forEach((el) => el.onclick = () => editWatch(S.watch.find((w) => w.id === Number(el.dataset.watch))));
  app.querySelectorAll("[data-seg]").forEach((el) => el.onclick = () => { SEG[el.dataset.seg] = el.dataset.val; render(); });
}
const SEG = { tender: "open", exec: "board" };

/* ---------- 總覽 ---------- */
function vOverview() {
  const live = S.projects.filter((p) => !["closed", "lost", "paused"].includes(p.stage));
  const pipe = live.filter((p) => FUNNEL.includes(p.stage));
  const pipeAmt = pipe.reduce((a, p) => a + (num(p.est_amount) || 0), 0);
  const openTenders = S.tenders.filter((t) => ["watching", "bidding"].includes(t.result));
  const weekTenders = openTenders.filter((t) => { const d = daysTo(t.bid_deadline); return d != null && d >= 0 && d <= 7; });
  const openCases = S.cases.filter((c) => c.status === "open");
  const overdue = openCases.filter((c) => (daysTo(c.due_date) ?? 1) < 0);
  const tiles = `
    <div class="grid tiles">
      <div class="card tile click" data-go="idea"><div class="label">業務管線項目</div><div class="value">${pipe.length}</div><div class="hint">籌備到得標，不含結案</div></div>
      <div class="card tile"><div class="label">管線預估金額（含稅）</div><div class="value money">${wan(pipeAmt)}</div><div class="hint">${pipe.filter((p) => num(p.est_amount) == null).length} 件還沒填金額</div></div>
      <div class="card tile click" data-go="tender"><div class="label">7 天內截標</div><div class="value">${weekTenders.length}</div><div class="hint">監控中與投標中 ${openTenders.length} 件</div></div>
      <div class="card tile click" data-go="exec"><div class="label">執行中案件</div><div class="value">${openCases.length}</div><div class="hint">${overdue.length ? `<span class="st critical">✕ ${overdue.length} 件逾期</span>` : "沒有逾期"}</div></div>
    </div>`;
  // 漏斗：件數為主、金額放在提示
  const fmax = Math.max(1, ...FUNNEL.map((s) => live.filter((p) => p.stage === s).length));
  const funnel = FUNNEL.map((s, i) => {
    const ps = live.filter((p) => p.stage === s);
    const amt = ps.reduce((a, p) => a + (num(p.est_amount) || 0), 0);
    return `<div class="bar" data-tip="<b>${STAGES[s]}</b><br>${ps.length} 件｜預估 ${esc(wan(amt))}"><div class="name">${STAGES[s]}</div><div class="track"><div class="fill" style="width:${(ps.length / fmax) * 100}%;background:var(${FUNNEL_COLOR[i]})"></div></div><div class="num">${ps.length} 件</div></div>`;
  }).join("");
  const cmax = Math.max(1, ...Object.keys(CHANNELS).map((c) => live.filter((p) => p.channel === c).length));
  const chans = Object.keys(CHANNELS).map((c) => {
    const ps = live.filter((p) => p.channel === c);
    const amt = ps.reduce((a, p) => a + (num(p.est_amount) || 0), 0);
    return `<div class="bar" data-tip="<b>${CHANNELS[c]}</b><br>${ps.length} 件｜預估 ${esc(wan(amt))}"><div class="name">${CHANNELS[c]}</div><div class="track"><div class="fill" style="width:${(ps.length / cmax) * 100}%;background:var(${CHANNEL_COLOR[c]})"></div></div><div class="num">${ps.length} 件｜${wan(amt)}</div></div>`;
  }).join("");
  // 近期重點：14 天內的截標、開標、下一步、交貨
  const ev = [];
  for (const t of openTenders) {
    if (t.bid_deadline) ev.push({ d: daysTo(t.bid_deadline), when: hm(t.bid_deadline), what: `截標｜${t.title}`, sub: t.agency, attr: `data-tender="${t.id}"` });
    if (t.open_time) ev.push({ d: daysTo(t.open_time), when: hm(t.open_time), what: `開標｜${t.title}`, sub: t.agency, attr: `data-tender="${t.id}"` });
  }
  for (const p of live) if (p.next_date) ev.push({ d: daysTo(p.next_date), when: ymd(p.next_date), what: `${p.next_action || "下一步"}｜${p.name}`, sub: STAGES[p.stage], attr: `data-open="${p.id}"` });
  for (const c of openCases) if (c.due_date) ev.push({ d: daysTo(c.due_date), when: ymd(c.due_date), what: `交貨期｜${c.customer_unit || c.customer}`, sub: `案件 ${c.customer_ref}`, attr: `data-go="exec"` });
  const soon = ev.filter((e) => e.d != null && e.d <= 14).sort((a, b) => a.d - b.d).slice(0, 12);
  return `${tiles}
    <div class="grid two" style="margin-top:12px">
      <div class="card"><h2>業務漏斗</h2><div class="sub">各階段件數，滑過看預估金額</div><div class="bars">${funnel}</div></div>
      <div class="card"><h2>案件類別</h2><div class="sub">進行中的項目，依類別分</div><div class="bars">${chans}</div></div>
    </div>
    <h2>近 14 天重點</h2>
    <div class="list">${soon.length ? soon.map((e) => `<div class="item" ${e.attr}><div class="t">${dueStatus(e.d)} ${esc(e.what)}</div><div class="m"><span>${esc(e.when)}</span><span>${esc(e.sub || "")}</span></div></div>`).join("") : `<div class="empty">近 14 天沒有到期的事項</div>`}</div>`;
}

/* ---------- 項目清單 ---------- */
function projectItem(p) {
  const d = daysTo(p.next_date);
  return `<div class="item" data-open="${p.id}">
    <div class="t">${esc(p.name)} ${chanChip(p.channel)} ${TAB === "small" || TAB === "private" ? stageChip(p.stage) : ""}</div>
    <div class="m"><span>${esc(p.customer || "客戶未填")}</span><span class="money">${num(p.est_amount) != null ? "預估 " + wan(p.est_amount) : "金額未填"}</span>${p.owner ? `<span>負責：${esc(p.owner)}</span>` : ""}</div>
    ${p.next_action || p.next_date ? `<div class="m">${p.next_date ? dueStatus(d) : ""}<span>下一步：${esc(p.next_action || "—")}</span></div>` : ""}
  </div>`;
}
function vStage(stage) {
  const ps = S.projects.filter((p) => p.stage === stage);
  const intro = { idea: "全新的方向，還不確定能不能做。記下構想、可行性和下一步。" }[stage] || "";
  return `<h2>${STAGES[stage]}</h2><div class="sub">${intro}</div><div class="list">${ps.length ? ps.map(projectItem).join("") : `<div class="empty">還沒有項目，按右下角「＋ 新增」</div>`}</div>`;
}
function vSpec() {
  const ps = S.projects.filter((p) => p.stage === "spec");
  return `<h2>開發規範</h2><div class="sub">做過類似的案子：找設備、材料、供應商，比較規格與優勢，選出最適合的。</div>
    ${ps.length ? ps.map((p) => {
      const ops = S.options.filter((o) => o.project_id === p.id);
      return `<div class="card" style="margin-bottom:12px"><div class="row"><b style="cursor:pointer" data-open="${p.id}">${esc(p.name)}</b>${chanChip(p.channel)}<span class="spacer"></span><button class="btn small ghost" data-open="${p.id}">開啟</button></div>
        ${ops.length ? `<div class="tablewrap" style="margin-top:8px;box-shadow:none"><table><tr><th></th><th>品項</th><th>供應商／品牌</th><th>型號</th><th>產地</th><th class="n">價格</th><th>交期</th><th>優勢</th></tr>
        ${ops.map((o) => `<tr><td>${o.chosen ? `<span class="st good">★ 選定</span>` : ""}</td><td>${esc(o.item)}</td><td>${esc([o.supplier, o.brand].filter(Boolean).join("／"))}</td><td>${esc(o.model || "")}</td><td>${esc(o.origin || "")}</td><td class="n">${o.price != null ? esc(o.currency || "") + " " + Number(o.price).toLocaleString("en-US") : "—"}</td><td>${esc(o.lead_time || "")}</td><td style="white-space:normal;min-width:180px">${esc(o.advantages || "")}${o.spec_url ? ` <a href="${esc(o.spec_url)}" target="_blank" rel="noopener">規格書</a>` : ""}</td></tr>`).join("")}</table></div>` : `<div class="empty">還沒有候選設備或材料</div>`}</div>`;
    }).join("") : `<div class="empty">還沒有在開發規範階段的項目</div>`}`;
}
// 報價試算：成本合計 ×（1＋加成）＝未稅報價；×1.05＝含稅預算價
function quoteCalc(q) {
  const cost = (num(q.foreign_cost) || 0) * (num(q.fx_rate) || 0) + (num(q.freight) || 0) + (num(q.duty) || 0) + (num(q.local_eng) || 0) + (num(q.other_cost) || 0);
  const pre = cost * (1 + (num(q.markup_pct) || 0) / 100);
  return { cost, pre, withTax: pre * 1.05 };
}
function vQuote() {
  const ps = S.projects.filter((p) => p.stage === "quote");
  return `<h2>報價</h2><div class="sub">國外詢價 → 加運費、關稅、本地工程費 → 加成 → 預算價（牌價，還沒剪價前）。</div>
    ${ps.length ? `<div class="tablewrap"><table><tr><th>項目</th><th>類別</th><th>版本</th><th class="n">成本合計</th><th class="n">加成</th><th class="n">預算價（含稅）</th><th>狀態</th></tr>
    ${ps.map((p) => {
      const qs = S.quotes.filter((q) => q.project_id === p.id).sort((a, b) => b.version - a.version);
      const q = qs[0];
      const c = q ? quoteCalc(q) : null;
      return `<tr class="click" data-open="${p.id}"><td>${esc(p.name)}</td><td>${chanChip(p.channel)}</td><td>${q ? "v" + q.version + (qs.length > 1 ? `（共 ${qs.length} 版）` : "") : "—"}</td><td class="n">${c ? money(c.cost) : "—"}</td><td class="n">${q && q.markup_pct != null ? q.markup_pct + "%" : "—"}</td><td class="n"><b>${q ? money(q.budget_price ?? c.withTax) : "—"}</b></td><td>${q ? esc(QUOTE_STATUS[q.status]) : "還沒報價"}</td></tr>`;
    }).join("")}</table></div>` : `<div class="empty">還沒有在報價階段的項目</div>`}`;
}

/* ---------- 招標 ---------- */
function vTender() {
  const open = S.tenders.filter((t) => ["watching", "bidding"].includes(t.result));
  const done = S.tenders.filter((t) => !["watching", "bidding"].includes(t.result));
  const list = SEG.tender === "open" ? open : SEG.tender === "done" ? done : [];
  const seg = `<div class="seg"><button data-seg="tender" data-val="open" class="${SEG.tender === "open" ? "on" : ""}">進行中 ${open.length}</button><button data-seg="tender" data-val="done" class="${SEG.tender === "done" ? "on" : ""}">已結束 ${done.length}</button><button data-seg="tender" data-val="history" class="${SEG.tender === "history" ? "on" : ""}">歷史比價</button></div>`;
  if (SEG.tender === "history") return `<h2>招標</h2><div class="row" style="margin-bottom:12px">${seg}</div>${vTenderHistory()}`;
  const linked = new Set(S.tenders.map((t) => t.project_id).filter(Boolean));
  const orphan = SEG.tender === "open" ? S.projects.filter((p) => p.stage === "tender" && !linked.has(p.id)) : [];
  const orphanHtml = orphan.length ? `<div class="banner" style="margin-bottom:12px">以下 ${orphan.length} 個項目在「招標」階段，但還沒有標案資料（案號、截標、開標）。按「建立標案資料」補上，就會出現在下面的表格。</div>
    <div class="list" style="margin-bottom:16px">${orphan.map((p) => `<div class="item"><div class="t">${esc(p.name)} ${chanChip(p.channel)}</div><div class="m"><span>${esc(p.customer || "")}</span>${p.note ? `<span style="white-space:normal">${esc(String(p.note).slice(0, 80))}</span>` : ""}</div><div class="row"><button class="btn small" data-mk-tender="${p.id}">建立標案資料</button><button class="btn small ghost" data-open="${p.id}">開啟項目</button></div></div>`).join("")}</div>` : "";
  return `<h2>招標</h2><div class="sub">截標、開標倒數；投標家數、過程與決標價。自動搜尋上線前可以先手動新增，或在 LINE 把公告貼給 Una。</div>
    <div class="row" style="margin-bottom:12px">${seg}<span class="spacer"></span><span class="chip" style="white-space:normal">監控：${S.watch.filter((w) => w.active).map((w) => esc(w.value)).join("、") || "未設定"}</span></div>
    ${orphanHtml}
    ${list.length && innerWidth < 640 ? `<div class="list">${list.map((t) => `<div class="item" data-tender="${t.id}"><div class="t">${SEG.tender === "open" ? dueStatus(daysTo(t.bid_deadline)) : `<span class="st neutral">${esc(TENDER_RESULT[t.result])}</span>`} ${esc(t.title)}</div><div class="m"><span>${esc(t.agency || "")}</span><span>截標 ${hm(t.bid_deadline)}</span><span>開標 ${hm(t.open_time)}</span></div><div class="m">${t.tender_round ? `<span>${esc(t.tender_round)}</span>` : ""}${num(t.deposit) != null ? `<span>押標金 ${money(t.deposit)}</span>` : ""}<span>預算 ${money(t.budget_amount)}</span>${t.bidders_count != null ? `<span>${t.bidders_count} 家投標</span>` : ""}${num(t.award_price) != null ? `<span>決標 ${money(t.award_price)}</span>` : ""}</div></div>`).join("")}</div>` : ""}
    ${list.length && innerWidth >= 640 ? `<div class="tablewrap"><table><tr><th>截標</th><th>開標</th><th>標案</th><th>機關</th><th>次數</th><th class="n">押標金</th><th class="n">預算</th><th class="n">投標家數</th><th class="n">決標價</th><th>結果</th></tr>
    ${list.map((t) => `<tr class="click" data-tender="${t.id}"><td>${SEG.tender === "open" ? dueStatus(daysTo(t.bid_deadline)) + " " : ""}${hm(t.bid_deadline)}</td><td>${hm(t.open_time)}</td><td style="white-space:normal;min-width:200px">${esc(t.title)}${t.case_no ? `<div class="chip">案號 ${esc(t.case_no)}</div>` : ""}</td><td>${esc(t.agency || "")}</td><td>${esc(t.tender_round || "—")}</td><td class="n">${money(t.deposit)}</td><td class="n">${money(t.budget_amount)}</td><td class="n">${t.bidders_count ?? "—"}</td><td class="n">${money(t.award_price)}</td><td>${esc(TENDER_RESULT[t.result])}${t.source === "auto" ? ` <span class="chip">自動</span>` : ""}</td></tr>`).join("")}</table></div>` : ""}${list.length ? "" : `<div class="empty">沒有標案</div>`}`;
}
// 歷史比價：原材料用 compare_key 對同一品項；單機用關鍵字找類似案件
function vTenderHistory() {
  const groups = new Map();
  for (const t of S.tenders.filter((t) => t.compare_key)) {
    if (!groups.has(t.compare_key)) groups.set(t.compare_key, []);
    groups.get(t.compare_key).push(t);
  }
  const blocks = [...groups.entries()].map(([k, ts]) => {
    ts.sort((a, b) => String(a.open_time || a.announce_date || "").localeCompare(String(b.open_time || b.announce_date || "")));
    const kind = ts[0].item_kind === "material" ? "原材料（重複採購）" : "單機設備（類似案件）";
    const prices = ts.map((t) => num(t.award_price)).filter((v) => v != null);
    const max = Math.max(1, ...prices);
    return `<div class="card" style="margin-bottom:12px"><div class="row"><b>${esc(k)}</b><span class="chip">${kind}</span></div>
      <div class="bars" style="margin-top:10px">${ts.map((t, i) => {
        const p = num(t.award_price);
        const prev = ts.slice(0, i).map((x) => num(x.award_price)).filter((v) => v != null).pop();
        const delta = p != null && prev ? ((p - prev) / prev) * 100 : null;
        const right = p != null
          ? `${money(p)}${delta != null ? `<span class="chip" style="margin-left:6px">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}%</span>` : ""}`
          : `${esc(TENDER_RESULT[t.result])}${num(t.budget_amount) != null ? `｜預算 ${money(t.budget_amount)}` : ""}`;
        return `<div class="bar" data-tip="<b>${esc(t.title)}</b><br>${esc(t.agency || "")}<br>投標 ${t.bidders_count ?? "—"} 家｜得標：${esc(t.winner || "—")}"><div class="name">${ymd(t.open_time || t.announce_date)}</div><div class="track">${p != null ? `<div class="fill" style="width:${(p / max) * 100}%;background:var(--s1)"></div>` : ""}</div><div class="num">${right}</div></div>`;
      }).join("")}</div></div>`;
  });
  return blocks.length ? `<div class="sub">在標案裡填「比價代號」，同一個代號的標案會放在一起比較決標價。原材料重複採購請用同一個代號；單機設備用相近的代號。</div>${blocks.join("")}` : `<div class="empty">還沒有可以比價的標案。在標案裡填「比價代號」就會出現在這裡。</div>`;
}

/* ---------- 小額採購、民間 ---------- */
function vSmall() {
  const ps = S.projects.filter((p) => p.channel === "small_purchase" && !["closed", "lost"].includes(p.stage));
  return `<h2>小額採購</h2><div class="sub">公家單位、含稅 ${money(S.rules.small_purchase_max)} 以下自動歸類。通常是廠內開發，不用押標金、履約保證金、保固金；利潤彈性大，要留意毛利。</div>
    <div class="list">${ps.length ? ps.map(projectItem).join("") : `<div class="empty">沒有進行中的小額採購</div>`}</div>`;
}
function vPrivate() {
  const live = S.projects.filter((p) => !["closed", "lost"].includes(p.stage));
  const proj = live.filter((p) => p.channel === "private_project");
  const normal = live.filter((p) => p.channel === "private");
  return `<h2>民間專案</h2><div class="sub">規模較大、手動指定為專案的民間案件。</div>
    <div class="list">${proj.length ? proj.map(projectItem).join("") : `<div class="empty">沒有民間專案</div>`}</div>
    <h2>民間客戶</h2><div class="list">${normal.length ? normal.map(projectItem).join("") : `<div class="empty">沒有一般民間案件</div>`}</div>`;
}

/* ---------- 執行中（看板＋交貨雷達） ---------- */
function vExec() {
  const open = S.cases.filter((c) => c.status === "open");
  const seg = `<div class="seg"><button data-seg="exec" data-val="board" class="${SEG.exec === "board" ? "on" : ""}">案件看板</button><button data-seg="exec" data-val="radar" class="${SEG.exec === "radar" ? "on" : ""}">交貨雷達</button></div>`;
  const card = (c) => {
    const d = daysTo(c.due_date);
    const late = c.eta && c.due_date && c.eta > c.due_date;
    return `<div class="item" data-tip="${esc(`<b>${esc(c.customer_unit || c.customer)}</b><br>案件 ${esc(c.customer_ref)}<br>目前：${esc(STEP_NAME[c.step] || "尚無紀錄")}${c.suppliers?.length ? "<br>原廠：" + esc(c.suppliers.join("、")) : ""}${c.eta ? "<br>預計到貨 " + ymd(c.eta) : ""}`)}">
      <div class="t">${esc(c.customer_unit || c.customer)}</div>
      <div class="m"><span>${esc(c.customer_ref)}</span><span>${esc(STEP_NAME[c.step] || "尚無紀錄")}</span></div>
      <div class="m">${dueStatus(d)}${late ? `<span class="st critical">✕ 到貨晚於交期</span>` : ""}</div></div>`;
  };
  if (SEG.exec === "board") {
    const noStep = open.filter((c) => c.step_index < 0);
    const cols = PHASES.map((ph, i) => {
      const cs = open.filter((c) => ph.steps.includes(c.step) || (i === 0 && c.step_index < 0));
      return `<div class="col"><h3><span>${ph.name}</span><span>${cs.length}</span></h3>${cs.map(card).join("") || `<div class="empty" style="padding:12px">—</div>`}</div>`;
    }).join("");
    return `<h2>執行中</h2><div class="row" style="margin-bottom:12px">${seg}<span class="sub" style="margin:0">Una 記錄的 22 個步驟收成 6 個階段${noStep.length ? `；${noStep.length} 件還沒有進度，先放在「下單」` : ""}</span></div><div class="kanban">${cols}</div>`;
  }
  const rows = [...open].sort((a, b) => (daysTo(a.due_date) ?? 9999) - (daysTo(b.due_date) ?? 9999));
  return `<h2>執行中</h2><div class="row" style="margin-bottom:12px">${seg}</div>
    <div class="tablewrap"><table><tr><th>交期</th><th>狀態</th><th>客戶</th><th>案件</th><th>目前步驟</th><th>原廠預計到貨</th><th>OA 付款到期</th></tr>
    ${rows.map((c) => { const late = c.eta && c.due_date && c.eta > c.due_date; return `<tr><td>${ymd(c.due_date)}</td><td>${dueStatus(daysTo(c.due_date))}</td><td>${esc(c.customer_unit || c.customer)}</td><td>${esc(c.customer_ref)}</td><td>${esc(STEP_NAME[c.step] || "尚無紀錄")}</td><td>${ymd(c.eta)}${late ? ` <span class="st critical">✕ 晚於交期</span>` : ""}</td><td>${c.oa_due ? ymd(c.oa_due) + " " + dueStatus(daysTo(c.oa_due)) : "—"}</td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">沒有執行中的案件</td></tr>`}</table></div>`;
}

/* ---------- 工程甘特 ---------- */
function vGantt() {
  const ms = S.milestones.filter((m) => m.plan_start && m.plan_end);
  if (!ms.length) return `<h2>工程甘特</h2><div class="sub">取代手畫的 Excel 甘特圖。每個工程里程碑填計畫起訖、實際進度。</div><div class="empty">還沒有里程碑，按右下角「＋ 新增」</div>`;
  const starts = ms.map((m) => Date.parse(m.plan_start)), ends = ms.map((m) => Date.parse(m.actual_end || m.plan_end));
  const t0 = new Date(Math.min(...starts, Date.parse(todayStr()) - 7 * 86400e3)); t0.setDate(1);
  const t1 = new Date(Math.max(...ends, Date.parse(todayStr()) + 14 * 86400e3)); t1.setMonth(t1.getMonth() + 1, 1);
  const span = t1 - t0;
  const pct = (d) => ((Date.parse(d) - t0) / span) * 100;
  const months = [];
  for (const d = new Date(t0); d < t1; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const head = months.map((m) => `<div class="g-month" style="left:${((m - t0) / span) * 100}%">${m.getFullYear() % 100}/${m.getMonth() + 1}</div>`).join("");
  const groups = new Map();
  for (const m of ms) {
    const key = m.project_id ? "p" + m.project_id : m.case_id ? "c" + m.case_id : "x";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const nameOf = (key) => key[0] === "p" ? (S.projects.find((p) => "p" + p.id === key)?.name || "項目") : key[0] === "c" ? (S.cases.find((c) => "c" + c.id === key)?.customer_unit || "案件") : "未分類";
  const today = todayStr();
  const rows = [...groups.entries()].map(([k, list]) => `<div class="g-row"><div class="g-label g-group">${esc(nameOf(k))}</div><div class="g-lane"></div></div>` +
    list.sort((a, b) => (a.sort - b.sort) || String(a.plan_start).localeCompare(b.plan_start)).map((m) => {
      const late = !m.actual_end && m.plan_end < today && m.progress < 100;
      const left = pct(m.plan_start), width = Math.max(0.8, pct(m.plan_end) - left + (86400e3 / span) * 100);
      return `<div class="g-row"><div class="g-label" title="${esc(m.name)}">${esc(m.name)}</div><div class="g-lane"><div class="g-bar ${late ? "late" : ""}" data-ms="${m.id}" style="left:${left}%;width:${width}%" data-tip="<b>${esc(m.name)}</b><br>計畫 ${ymd(m.plan_start)} – ${ymd(m.plan_end)}<br>進度 ${m.progress}%${m.owner ? "｜" + esc(m.owner) : ""}${late ? "<br>✕ 已過計畫完成日" : ""}"><div class="done" style="width:${m.progress}%"></div></div></div></div>`;
    }).join("")).join("");
  return `<h2>工程甘特</h2><div class="sub">灰色是計畫期間，藍色是完成進度；過了計畫完成日還沒做完會變紅色。點長條可以修改。</div>
    <div class="gantt"><div class="g-inner"><div class="g-head"><div class="g-label">里程碑</div><div class="g-months">${head}</div></div>${rows}
    <div class="g-today" style="left:calc(200px + (100% - 200px) * ${pct(today) / 100})"><span>今天</span></div></div></div>`;
}

/* ---------- 設定（招標監控） ---------- */
function vSettings() {
  const block = (kind, title) => `<div class="card"><h2>${title}</h2><div class="list">${S.watch.filter((w) => w.kind === kind).map((w) => `<div class="item" data-watch="${w.id}"><div class="t">${esc(w.value)} ${w.active ? `<span class="st good">✓ 監控中</span>` : `<span class="st neutral">— 已停用</span>`}</div></div>`).join("") || `<div class="empty">還沒有</div>`}</div></div>`;
  return `<h2>招標監控條件</h2><div class="sub">自動搜尋上線後，每天用這些機關和關鍵字找新的招標公告。點一下可以修改或停用，按「＋ 新增」加新的。</div>
    <div class="grid two">${block("agency", "機關")}${block("keyword", "關鍵字")}</div>`;
}

/* ---------- 表單 ---------- */
function modal(html, onReady) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  const close = () => bg.remove();
  onReady(bg.querySelector(".modal"), close);
  return close;
}
function field(f, v) {
  const val = v ?? "";
  const lab = `${esc(f.label)}${f.req ? " *" : ""}`;
  if (f.type === "select") return `<label>${lab}<select name="${f.k}">${Object.entries(f.opts).map(([k, n]) => `<option value="${k}" ${String(val) === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</label>`;
  if (f.type === "textarea") return `<label>${lab}<textarea name="${f.k}">${esc(val)}</textarea></label>`;
  if (f.type === "check") return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${f.k}" style="width:auto" ${val ? "checked" : ""}> ${lab}</label>`;
  let v2 = val;
  if (f.type === "datetime-local" && val) v2 = new Date(new Date(val).getTime() + 8 * 3600e3).toISOString().slice(0, 16);
  if (f.type === "date" && val) v2 = String(val).slice(0, 10);
  return `<label>${lab}<input name="${f.k}" type="${f.type || "text"}" value="${esc(v2)}" ${f.type === "number" ? 'step="any" inputmode="decimal"' : ""} ${f.ph ? `placeholder="${esc(f.ph)}"` : ""}>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</label>`;
}
function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.k}"]`);
    if (!el) continue;
    if (f.type === "check") out[f.k] = el.checked;
    else if (f.type === "number") out[f.k] = el.value === "" ? null : Number(el.value);
    else if (f.type === "datetime-local") out[f.k] = el.value ? new Date(el.value + ":00+08:00").toISOString() : null;
    else out[f.k] = el.value.trim() === "" ? null : el.value.trim();
  }
  return out;
}
function formModal({ title, fields, row, table, extra = "", after, onDelete, check }) {
  modal(`<h2>${esc(title)}</h2><form class="form">${fields.map((f) => Array.isArray(f) ? `<div class="pair">${f.map((g) => field(g, row[g.k])).join("")}</div>` : field(f, row[f.k])).join("")}
    ${extra}<div class="row" style="margin-top:6px"><button class="btn" type="submit">儲存</button><button class="btn ghost" type="button" data-x>取消</button><span class="spacer"></span>${row.id ? `<button class="btn danger" type="button" data-del>刪除</button>` : ""}</div></form>`,
  (m, close) => {
    const flat = fields.flat();
    m.querySelector("[data-x]").onclick = close;
    if (after) after(m, flat);
    m.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const data = { ...readForm(m, flat), ...(row.id ? { id: row.id } : {}) };
      for (const f of flat) if (f.req && (data[f.k] == null || data[f.k] === "")) return toast(`請填「${f.label}」`);
      if (check) { const msg = check(data); if (msg) return toast(msg); }
      try {
        const saved = await save(table, { ...row, ...data });
        if (table === "tenders" && saved.project_id) { const p = S.projects.find((x) => x.id === saved.project_id); if (p && ["idea", "spec", "quote"].includes(p.stage)) p.stage = "tender"; }
        close(); toast("已儲存"); render();
      } catch (err) { toast("儲存失敗：" + err.message); }
    };
    const del = m.querySelector("[data-del]");
    if (del) del.onclick = async () => {
      if (!confirm("確定刪除？刪了救不回來。")) return;
      try { await remove(table, row.id); close(); toast("已刪除"); if (onDelete) onDelete(); render(); } catch (err) { toast("刪除失敗：" + err.message); }
    };
  });
}

const PROJECT_FIELDS = [
  { k: "name", label: "項目名稱", req: true },
  [{ k: "customer", label: "客戶／機關" }, { k: "owner", label: "負責人" }],
  [{ k: "stage", label: "階段", type: "select", opts: STAGES }, { k: "channel", label: "類別", type: "select", opts: CHANNELS, hint: "公家含稅 15 萬以下，存檔時自動改成小額採購" }],
  { k: "est_amount", label: "預估金額（含稅，台幣）", type: "number" },
  [{ k: "next_action", label: "下一步" }, { k: "next_date", label: "下一步期限", type: "date" }],
  { k: "note", label: "備註／可行性評估", type: "textarea" },
];
function editProject(row) {
  formModal({ title: row.id ? "修改項目" : "新增項目", fields: PROJECT_FIELDS, row: { stage: "idea", channel: "gov_tender", ...row }, table: "projects" });
}
// 項目詳情：基本資料＋規範候選＋報價＋標案＋里程碑
function openProject(id) {
  const p = S.projects.find((x) => x.id === id);
  if (!p) return;
  const ops = S.options.filter((o) => o.project_id === id);
  const qs = S.quotes.filter((q) => q.project_id === id).sort((a, b) => b.version - a.version);
  const ts = S.tenders.filter((t) => t.project_id === id);
  const ms = S.milestones.filter((m) => m.project_id === id);
  modal(`<div class="row"><h2 style="margin:0;flex:1">${esc(p.name)}</h2><button class="btn small ghost" data-edit>修改</button><button class="btn small ghost" data-x>關閉</button></div>
    <div class="row" style="margin:8px 0">${stageChip(p.stage)} ${chanChip(p.channel)} <span class="money">${num(p.est_amount) != null ? "預估 " + money(p.est_amount) : ""}</span></div>
    <div class="card" style="font-size:14px">客戶：${esc(p.customer || "—")}｜負責：${esc(p.owner || "—")}<br>下一步：${esc(p.next_action || "—")} ${p.next_date ? dueStatus(daysTo(p.next_date)) : ""}${p.note ? `<br><span style="color:var(--ink2);white-space:pre-wrap">${esc(p.note)}</span>` : ""}</div>
    <div class="section"><div class="row"><b>開發規範：候選設備／材料（${ops.length}）</b><span class="spacer"></span><button class="btn small" data-add="opt">＋ 新增</button></div>
      <div class="list" style="margin-top:8px">${ops.map((o) => `<div class="item" data-opt="${o.id}"><div class="t">${o.chosen ? `<span class="st good">★ 選定</span>` : ""}${esc(o.item)}</div><div class="m"><span>${esc([o.supplier, o.brand, o.model].filter(Boolean).join("／"))}</span><span>${esc(o.origin || "")}</span><span>${o.price != null ? esc(o.currency || "") + " " + Number(o.price).toLocaleString("en-US") : ""}</span></div></div>`).join("") || `<div class="empty" style="padding:10px">—</div>`}</div></div>
    <div class="section"><div class="row"><b>報價（${qs.length} 版）</b><span class="spacer"></span><button class="btn small" data-add="quote">＋ 新版本</button></div>
      <div class="list" style="margin-top:8px">${qs.map((q) => { const c = quoteCalc(q); return `<div class="item" data-quote="${q.id}"><div class="t">v${q.version} ${esc(QUOTE_STATUS[q.status])}</div><div class="m"><span>成本 ${money(c.cost)}</span><span>加成 ${q.markup_pct ?? "—"}%</span><b>預算價 ${money(q.budget_price ?? c.withTax)}</b></div></div>`; }).join("") || `<div class="empty" style="padding:10px">—</div>`}</div></div>
    <div class="section"><div class="row"><b>標案（${ts.length}）</b><span class="spacer"></span><button class="btn small" data-add="tender">＋ 新增</button></div>
      <div class="list" style="margin-top:8px">${ts.map((t) => `<div class="item" data-t="${t.id}"><div class="t">${esc(t.title)}</div><div class="m"><span>截標 ${hm(t.bid_deadline)}</span><span>${esc(TENDER_RESULT[t.result])}</span></div></div>`).join("") || `<div class="empty" style="padding:10px">—</div>`}</div></div>
    <div class="section"><div class="row"><b>工程里程碑（${ms.length}）</b><span class="spacer"></span><button class="btn small" data-add="ms">＋ 新增</button></div>
      <div class="list" style="margin-top:8px">${ms.map((m) => `<div class="item" data-m="${m.id}"><div class="t">${esc(m.name)}</div><div class="m"><span>${ymd(m.plan_start)} – ${ymd(m.plan_end)}</span><span>進度 ${m.progress}%</span></div></div>`).join("") || `<div class="empty" style="padding:10px">—</div>`}</div></div>`,
  (m, close) => {
    const reopen = () => setTimeout(() => openProject(id), 0);
    m.querySelector("[data-x]").onclick = close;
    m.querySelector("[data-edit]").onclick = () => { close(); editProject(p); };
    m.querySelector('[data-add="opt"]').onclick = () => { close(); editOption({ project_id: id }, reopen); };
    m.querySelector('[data-add="quote"]').onclick = () => { close(); editQuote({ project_id: id, version: (qs[0]?.version || 0) + 1, ...(qs[0] ? { foreign_cost: qs[0].foreign_cost, currency: qs[0].currency, fx_rate: qs[0].fx_rate, freight: qs[0].freight, duty: qs[0].duty, local_eng: qs[0].local_eng, other_cost: qs[0].other_cost, markup_pct: qs[0].markup_pct } : {}) }, reopen); };
    m.querySelector('[data-add="tender"]').onclick = () => { close(); editTender({ project_id: id, title: p.name, agency: p.customer }, reopen); };
    m.querySelector('[data-add="ms"]').onclick = () => { close(); editMilestone({ project_id: id }, reopen); };
    m.querySelectorAll("[data-opt]").forEach((el) => el.onclick = () => { close(); editOption(S.options.find((o) => o.id === Number(el.dataset.opt)), reopen); });
    m.querySelectorAll("[data-quote]").forEach((el) => el.onclick = () => { close(); editQuote(S.quotes.find((q) => q.id === Number(el.dataset.quote)), reopen); });
    m.querySelectorAll("[data-t]").forEach((el) => el.onclick = () => { close(); editTender(S.tenders.find((t) => t.id === Number(el.dataset.t)), reopen); });
    m.querySelectorAll("[data-m]").forEach((el) => el.onclick = () => { close(); editMilestone(S.milestones.find((x) => x.id === Number(el.dataset.m)), reopen); });
  });
}
function editOption(row, back) {
  formModal({ title: row.id ? "修改候選" : "新增候選設備／材料", table: "project_options", row: { kind: "equipment", currency: "USD", ...row },
    fields: [
      [{ k: "kind", label: "種類", type: "select", opts: { equipment: "機器設備", material: "原材料" } }, { k: "item", label: "品項名稱", req: true }],
      [{ k: "supplier", label: "供應商" }, { k: "brand", label: "品牌" }],
      [{ k: "model", label: "型號" }, { k: "origin", label: "產地" }],
      [{ k: "price", label: "價格", type: "number" }, { k: "currency", label: "幣別", type: "select", opts: { USD: "USD", EUR: "EUR", JPY: "JPY", CNY: "CNY", TWD: "TWD" } }],
      { k: "lead_time", label: "交期", ph: "例如 16 週" },
      { k: "spec_url", label: "規格書連結", type: "url" },
      { k: "advantages", label: "優勢", type: "textarea" },
      { k: "chosen", label: "選定這個方案", type: "check" },
      { k: "note", label: "備註", type: "textarea" },
    ] });
  hookBack(back);
}
function editQuote(row, back) {
  formModal({ title: row.id ? `修改報價 v${row.version}` : `新增報價 v${row.version || 1}`, table: "quotes", row: { status: "draft", currency: "USD", ...row },
    fields: [
      [{ k: "version", label: "版本", type: "number" }, { k: "status", label: "狀態", type: "select", opts: QUOTE_STATUS }],
      [{ k: "foreign_cost", label: "國外詢價（原幣）", type: "number" }, { k: "currency", label: "幣別", type: "select", opts: { USD: "USD", EUR: "EUR", JPY: "JPY", CNY: "CNY", TWD: "TWD" } }],
      [{ k: "fx_rate", label: "匯率（換台幣）", type: "number" }, { k: "freight", label: "運費（台幣）", type: "number" }],
      [{ k: "duty", label: "關稅＋報關（台幣）", type: "number" }, { k: "local_eng", label: "本地工程費（台幣）", type: "number" }],
      [{ k: "other_cost", label: "其他費用（台幣）", type: "number" }, { k: "markup_pct", label: "加成 %", type: "number" }],
      { k: "budget_price", label: "預算價／牌價（含稅）", type: "number", hint: "空白就用下面試算的含稅金額" },
      { k: "quoted_on", label: "報價日期", type: "date" },
      { k: "note", label: "備註", type: "textarea" },
    ],
    extra: `<div class="calc" id="calc"></div>`,
    after: (m, flat) => {
      const upd = () => { const c = quoteCalc(readForm(m, flat)); m.querySelector("#calc").innerHTML = `成本合計 ${money(c.cost)}<br>加成後未稅 ${money(c.pre)}<br>含稅預算價（×1.05）<b>${money(c.withTax)}</b>`; };
      m.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", upd)); upd();
    },
    check: (d) => { if (d.budget_price == null) { const c = quoteCalc(d); if (c.withTax > 0) d.budget_price = Math.round(c.withTax); } return ""; },
  });
  hookBack(back);
}
function editTender(row, back) {
  formModal({ title: row.id ? "修改標案" : "新增標案", table: "tenders", row: { result: "watching", item_kind: "equipment", ...row },
    fields: [
      { k: "title", label: "標案名稱", req: true },
      [{ k: "case_no", label: "標案案號" }, { k: "agency", label: "招標機關" }],
      [{ k: "item_kind", label: "類型", type: "select", opts: { equipment: "單機設備", material: "原材料" } }, { k: "compare_key", label: "比價代號", hint: "同品項重複採購用同一個代號" }],
      { k: "project_id", label: "對應項目", type: "select", opts: { "": "（不對應）", ...Object.fromEntries(S.projects.map((p) => [String(p.id), p.name])) } },
      [{ k: "budget_amount", label: "預算金額", type: "number" }, { k: "announce_date", label: "公告日", type: "date" }],
      [{ k: "bid_deadline", label: "截標時間", type: "datetime-local" }, { k: "open_time", label: "開標時間", type: "datetime-local" }],
      [{ k: "tender_round", label: "第幾次招標", ph: "例如 第二次及以後公開招標" }, { k: "deposit", label: "押標金", type: "number" }],
      [{ k: "award_method", label: "決標方式", ph: "例如 最低標" }, { k: "bid_method", label: "投標方式", ph: "紙本／電子" }],
      [{ k: "bidders_count", label: "投標家數", type: "number" }, { k: "result", label: "結果", type: "select", opts: TENDER_RESULT }],
      { k: "bidders", label: "投標廠商" },
      [{ k: "our_bid", label: "我們的投標價", type: "number" }, { k: "award_price", label: "決標價", type: "number" }],
      { k: "winner", label: "得標廠商" },
      { k: "url", label: "公告連結", type: "url" },
      { k: "process_note", label: "投標過程紀錄", type: "textarea" },
    ],
    check: (d) => { d.project_id = d.project_id ? Number(d.project_id) : null; return ""; },
  });
  hookBack(back);
}
function editMilestone(row, back) {
  const projOpts = { "": "（選擇項目）", ...Object.fromEntries(S.projects.map((p) => [String(p.id), p.name])) };
  formModal({ title: row.id ? "修改里程碑" : "新增工程里程碑", table: "eng_milestones", row: { progress: 0, sort: 0, ...row },
    fields: [
      { k: "project_id", label: "所屬項目", type: "select", opts: projOpts },
      { k: "name", label: "里程碑名稱", req: true, ph: "例如 基礎施工、設備進場、試車" },
      [{ k: "plan_start", label: "計畫開始", type: "date", req: true }, { k: "plan_end", label: "計畫完成", type: "date", req: true }],
      [{ k: "actual_start", label: "實際開始", type: "date" }, { k: "actual_end", label: "實際完成", type: "date" }],
      [{ k: "progress", label: "進度 %", type: "number" }, { k: "owner", label: "負責人" }],
      { k: "sort", label: "排序（數字小的在上面）", type: "number" },
    ],
    check: (d) => {
      d.project_id = d.project_id ? Number(d.project_id) : null;
      d.progress = Math.max(0, Math.min(100, Math.round(d.progress ?? 0)));
      if (d.plan_end < d.plan_start) return "計畫完成日不能早於開始日";
      return "";
    },
  });
  hookBack(back);
}
function editWatch(row) {
  formModal({ title: row.id ? "修改監控條件" : "新增監控條件", table: "tender_watch", row: { kind: "keyword", active: true, ...row },
    fields: [
      { k: "kind", label: "種類", type: "select", opts: { agency: "機關", keyword: "關鍵字" } },
      { k: "value", label: "內容", req: true, ph: "例如 臺灣菸酒股份有限公司、充填機" },
      { k: "active", label: "啟用", type: "check" },
    ] });
}
// 從項目詳情打開的子表單：關掉後回到項目詳情
function hookBack(back) {
  if (!back) return;
  const bg = document.querySelector(".modal-bg:last-child");
  if (!bg) return;
  const obs = new MutationObserver(() => { if (!document.body.contains(bg)) { obs.disconnect(); back(); } });
  obs.observe(document.body, { childList: true });
}

/* ---------- 示範資料 ---------- */
function demoData() {
  const d = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
  const t = (n, h = 10) => new Date(Date.parse(d(n) + `T${String(h).padStart(2, "0")}:00:00+08:00`)).toISOString();
  return {
    me: "示範使用者",
    rules: { small_purchase_max: 150000 },
    projects: [
      { id: 1, name: "啤酒鋁罐生產線 90,000 CPH", customer: "（示範）某酒廠", channel: "private_project", stage: "spec", est_amount: 168000000, owner: "Roye", next_action: "整理三家充填機規格比較", next_date: d(3), note: "倉庫改建，需確認樓地板承重" },
      { id: 2, name: "瓶裝線充填機汰換", customer: "臺灣菸酒股份有限公司", channel: "gov_tender", stage: "tender", est_amount: 12500000, owner: "Anna", next_action: "準備投標文件", next_date: d(5) },
      { id: 3, name: "BOPP 膜年度採購", customer: "金門酒廠", channel: "gov_tender", stage: "quote", est_amount: 2800000, owner: "Anna", next_action: "國外詢價回覆", next_date: d(-1) },
      { id: 4, name: "包裝機零件緊急補件", customer: "馬祖酒廠", channel: "small_purchase", stage: "quote", est_amount: 98000, owner: "Roye", next_action: "送報價單", next_date: d(1) },
      { id: 5, name: "智慧倉儲輸送線構想", customer: "（示範）食品廠", channel: "private", stage: "idea", est_amount: null, owner: "Roye", next_action: "現場勘查", next_date: d(10), note: "客戶有意願，預算未定" },
      { id: 6, name: "收縮包裝機", customer: "（示範）飲料廠", channel: "private", stage: "won", est_amount: 4200000, owner: "Anna" },
      { id: 8, name: "74mm 濾嘴紙等3項", customer: "臺灣菸酒豐原捲菸研發製造工廠", channel: "gov_tender", stage: "tender", est_amount: null, owner: "Roye", note: "案號 115-0220-2-046，第二次及以後公開招標，押標金 9 萬" },
      { id: 7, name: "封箱機更新", customer: "臺灣菸酒股份有限公司", channel: "small_purchase", stage: "idea", est_amount: 135000, owner: "Anna", next_action: "確認規格", next_date: d(12) },
    ],
    options: [
      { id: 1, project_id: 1, kind: "equipment", item: "充填封蓋機", supplier: "（示範）A 公司", brand: "Brand A", model: "FX-90", origin: "德國", price: 2100000, currency: "EUR", lead_time: "40 週", advantages: "速度最高、售後在台有據點", chosen: true },
      { id: 2, project_id: 1, kind: "equipment", item: "充填封蓋機", supplier: "（示範）B 公司", brand: "Brand B", model: "C-900", origin: "義大利", price: 1750000, currency: "EUR", lead_time: "36 週", advantages: "CP 值高", chosen: false },
      { id: 3, project_id: 1, kind: "equipment", item: "充填封蓋機", supplier: "（示範）C 公司", brand: "Brand C", model: "HS-9", origin: "中國", price: 820000, currency: "EUR", lead_time: "24 週", advantages: "交期短、價格低", chosen: false },
    ],
    quotes: [
      { id: 1, project_id: 3, version: 1, foreign_cost: 62000, currency: "USD", fx_rate: 32.1, freight: 85000, duty: 60000, local_eng: 0, other_cost: 20000, markup_pct: 18, budget_price: null, status: "draft" },
      { id: 2, project_id: 4, version: 1, foreign_cost: 1900, currency: "EUR", fx_rate: 35.2, freight: 8000, duty: 3000, local_eng: 6000, other_cost: 0, markup_pct: 25, budget_price: 96000, status: "draft" },
    ],
    tenders: [
      { id: 1, project_id: 2, case_no: "（示範）114A0123", agency: "臺灣菸酒股份有限公司", title: "瓶裝線充填機汰換工程", item_kind: "equipment", compare_key: "充填機", budget_amount: 13000000, tender_round: "第一次公開招標", deposit: 500000, bid_deadline: t(5, 17), open_time: t(6, 10), result: "bidding" },
      { id: 2, case_no: "（示範）114B0456", agency: "金門酒廠", title: "BOPP 膜採購", item_kind: "material", compare_key: "BOPP膜-20μ", budget_amount: 3000000, bid_deadline: t(12, 17), open_time: t(13, 10), result: "watching", source: "auto" },
      { id: 3, case_no: "（示範）113B0221", agency: "金門酒廠", title: "BOPP 膜採購（去年）", item_kind: "material", compare_key: "BOPP膜-20μ", budget_amount: 2900000, open_time: t(-330, 10), bidders_count: 4, award_price: 2615000, winner: "（示範）甲公司", result: "lost" },
      { id: 4, case_no: "（示範）112B0198", agency: "金門酒廠", title: "BOPP 膜採購（前年）", item_kind: "material", compare_key: "BOPP膜-20μ", budget_amount: 2850000, open_time: t(-700, 10), bidders_count: 3, award_price: 2540000, winner: "（示範）乙公司", result: "lost" },
      { id: 5, case_no: "（示範）113A0777", agency: "臺灣菸酒股份有限公司", title: "充填機採購（類似案）", item_kind: "equipment", compare_key: "充填機", budget_amount: 11800000, open_time: t(-200, 10), bidders_count: 2, award_price: 11200000, winner: "（示範）丙公司", result: "lost" },
    ],
    watch: [
      { id: 1, kind: "agency", value: "臺灣菸酒股份有限公司", active: true }, { id: 2, kind: "agency", value: "金門酒廠", active: true }, { id: 3, kind: "agency", value: "馬祖酒廠", active: true },
      { id: 4, kind: "keyword", value: "充填機", active: true }, { id: 5, kind: "keyword", value: "包裝機", active: true }, { id: 6, kind: "keyword", value: "BOPP膜", active: true },
    ],
    milestones: [
      { id: 1, project_id: 6, name: "設備到廠", plan_start: d(-20), plan_end: d(-6), progress: 100, owner: "Roye", sort: 1, actual_end: d(-7) },
      { id: 2, project_id: 6, name: "安裝定位", plan_start: d(-6), plan_end: d(4), progress: 60, owner: "Roye", sort: 2 },
      { id: 3, project_id: 6, name: "試車與教育訓練", plan_start: d(5), plan_end: d(15), progress: 0, owner: "Anna", sort: 3 },
      { id: 4, project_id: 1, name: "廠房結構評估", plan_start: d(-30), plan_end: d(-2), progress: 70, owner: "Roye", sort: 1 },
      { id: 5, project_id: 1, name: "平面佈置定稿", plan_start: d(-5), plan_end: d(25), progress: 20, owner: "Roye", sort: 2 },
    ],
    cases: [
      { id: 11, customer_ref: "4500012345", customer: "（示範）客戶甲", customer_unit: "（示範）甲廠", status: "open", due_date: d(18), step: "shipped", step_index: 8, eta: d(12), suppliers: ["（示範）A 公司"] },
      { id: 12, customer_ref: "4500012399", customer: "（示範）客戶乙", customer_unit: "（示範）乙廠", status: "open", due_date: d(-3), step: "customs_c2", step_index: 14, eta: d(-8), suppliers: ["（示範）B 公司"] },
      { id: 13, customer_ref: "4500012410", customer: "（示範）客戶丙", customer_unit: "（示範）丙廠", status: "open", due_date: d(45), step: "po_sent", step_index: 2, eta: d(50), suppliers: ["（示範）C 公司"], oa_due: d(70) },
      { id: 14, customer_ref: "4500012433", customer: "（示範）客戶丁", customer_unit: "（示範）丁廠", status: "open", due_date: d(6), step: "delivered", step_index: 17, eta: d(-2), suppliers: ["（示範）A 公司"] },
      { id: 15, customer_ref: "4500012450", customer: "（示範）客戶戊", customer_unit: "（示範）戊廠", status: "open", due_date: d(30), step: "invoiced", step_index: 19, suppliers: [] },
    ],
  };
}
let demoId = 1000;
function demoApi(action, p) {
  if (action === "load") return Promise.resolve(demoData());
  if (action === "save") {
    const row = { ...p.row };
    if (p.table === "projects" && (row.channel === "gov_tender" || row.channel === "small_purchase") && num(row.est_amount) != null) row.channel = num(row.est_amount) <= 150000 ? "small_purchase" : "gov_tender";
    if (!row.id) row.id = ++demoId;
    return Promise.resolve({ row });
  }
  return Promise.resolve({ ok: true });
}

/* ---------- 啟動 ---------- */
async function boot() {
  document.getElementById("reload").onclick = reload;
  DEMO = new URLSearchParams(location.search).has("demo") || !CONFIG.LIFF_ID;
  if (!DEMO) {
    try {
      await liff.init({ liffId: CONFIG.LIFF_ID, withLoginOnExternalBrowser: true });
      if (!liff.isLoggedIn()) {
        // 正在處理 LINE 登入回傳（網址帶 code 或 liff.state）：SDK 會自己完成，不要再叫一次登入，否則會無限循環
        if (/[?&](code|liff\.state|liffClientId)=/.test(location.search)) {
          setTimeout(() => { app.innerHTML = `<div class="banner err">LINE 登入沒有完成。<a href="${location.pathname}">點這裡重新開始</a></div>`; }, 10000);
          return;
        }
        liff.login();
        return;
      }
      // 登入完成後把網址上的登入參數清掉，重新整理才不會出錯
      if (location.search) history.replaceState(null, "", location.pathname);
      ID_TOKEN = liff.getIDToken();
      if (!ID_TOKEN) throw new Error("拿不到 LINE 身分憑證：請確認 LIFF 的 Scope 有勾 openid");
    } catch (e) {
      app.innerHTML = `<div class="banner err">LINE 登入失敗：${esc(e.message)}</div>`;
      return;
    }
  }
  await reload();
}
boot();
