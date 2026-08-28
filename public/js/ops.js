// 运营中心 — 日历 / 作品库 / 创作间入口 / AI 排期助理
import { api } from './api.js';
import { $, $$, esc, toast, modal, confirmModal, copyText, segmented } from './ui.js';
import { renderStudio } from './ops-studio.js';
import { renderMemberStudioTab } from './member-studio.js';
import { renderVisualTab } from './visual.js';
import { openSettings } from './settings-ui.js';
import { t } from './i18n.js';

export const TYPE_META = {
  short_video: { label: t('短视频'), icon: '🎬', color: '#d23d72' },
  daily: { label: t('日常'), icon: '📅', color: '#8a6d2f' },
  live: { label: t('直播'), icon: '📺', color: '#0b7f8e' },
  post: { label: t('动态'), icon: '✍️', color: '#6f5bb5' },
  song: { label: t('歌曲'), icon: '🎵', color: '#6b48f0' },
  poster: { label: t('海报'), icon: '🖼️', color: '#c06a14' },
  other: { label: t('其他'), icon: '📄', color: '#514c5c' },
};
export const STATUS_META = {
  idea: t('💡 构思'), making: t('✍️ 制作中'), scheduled: t('⏰ 待发布'),
  published: t('✅ 已发布'), archived: t('📦 归档'),
};

const O = { group: null, works: [], tab: 'calendar', month: null, topics: {} };

// 线性图标（Lucide 风格，currentColor 跟随导航状态）
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  daily: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  video: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m10 9.2 5 2.8-5 2.8Z"/>',
  studio: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m20.5 14.5-4.5-4.5L5 21"/>',
  works: '<rect x="3" y="3.5" width="18" height="4.5" rx="1.2"/><path d="M5 8v11.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9.8 12.2h4.4"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ''}</svg>`;

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const VALID_TABS = ['overview', 'calendar', 'daily', 'video', 'studio', 'visual', 'works'];

export async function renderOps(app, groupId, initialTab, isCurrent = () => true) {
  if (O.group?.id !== groupId) { O.topics = {}; O.generating = {}; O.hints = {}; }
  app.innerHTML = `<div class="empty-state"><div class="big">⏳</div>${t('加载运营中心…')}</div>`;
  try {
    const [group, works, topics] = await Promise.all([
      api.groups.get(groupId), api.works.list(groupId), api.studio.get(groupId),
    ]);
    if (!isCurrent()) return;
    [O.group, O.works, O.topics] = [group, works, topics];
  } catch (e) {
    if (!isCurrent()) return;
    app.innerHTML = `<div class="empty-state">${t('加载失败：')}${esc(e.message)}</div>`;
    return;
  }
  O.tab = VALID_TABS.includes(initialTab) ? initialTab : 'overview';
  O.month = new Date();
  const c = O.group.data.concept;
  // 导航按流水线分组：指挥台 → 创作 → 归档（带步骤编号，左栏即动线）
  const NAV_GROUPS = [
    ['01', t('指挥台'), [['overview', t('总览')], ['calendar', t('发布日历')]]],
    ['02', t('创作'), [['daily', t('日常内容')], ['video', t('短视频')], ['studio', t('形象生成')], ['visual', t('视觉车间')]]],
    ['03', t('归档'), [['works', t('作品库')]]],
  ];
  document.body.classList.add('ws-mode');
  app.style.setProperty('--team-c', c.mainColor);
  app.innerHTML = `
    <div class="ws-shell" style="--team-c:${esc(c.mainColor)}">
      <aside class="ws-side">
        <button class="side-app" id="ops-home"><img class="brand-logo" src="/logo-mark.png" alt="${t('成团')}"></button>
        <div class="side-team">
          <div class="side-name"><span class="ws-dot"></span>${esc(c.name)}</div>
          <div class="side-meta">${t('运营中心 · OPERATIONS')}</div>
        </div>
        <nav class="side-nav side-nav-flow" id="ops-nav">
          ${NAV_GROUPS.map(([no, sec, items]) => `<div class="side-sec"><span class="side-step">${no}</span>${sec}</div>
            ${items.map(([k, label]) => `<button class="side-nav-item${k === O.tab ? ' active' : ''}" data-tab="${k}"><span class="side-nav-ico">${icon(k)}</span>${label}</button>`).join('')}`).join('')}
        </nav>
        <div id="ops-alerts" class="side-alerts"></div>
        <div class="side-foot">
          <button class="btn side-btn" id="ops-settings">${t('⚙️ 模型设置')}</button>
          <a class="btn side-btn" href="#/group/${esc(O.group.id)}">${t('← 返回企划工作台')}</a>
        </div>
      </aside>
      <main class="ws-body"><div id="ops-content"></div></main>
    </div>`;
  $('#ops-home').onclick = () => { location.hash = ''; };
  $('#ops-settings').onclick = openSettings;
  $('#ops-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.side-nav-item');
    if (!btn) return;
    gotoTab(btn.dataset.tab);
  });
  renderOpsTab();
}

async function reloadWorks(groupId = O.group.id) {
  const works = await api.works.list(groupId);
  if (O.group?.id === groupId) O.works = works;
  return works;
}

function updateAlerts() {
  const el = $('#ops-alerts');
  if (!el) return;
  const today = fmtDate(new Date());
  const dueToday = O.works.filter((w) => w.publishAt === today && w.status === 'scheduled').length;
  const overdue = O.works.filter((w) => w.publishAt && w.publishAt < today && w.status === 'scheduled').length;
  el.innerHTML = `${dueToday ? `<span class="badge" style="background:var(--ink);color:#fff">${t('📤 今天待发 {n} 条', { n: dueToday })}</span>` : ''}
    ${overdue ? `<span class="badge" style="background:var(--err);color:#fff">${t('⚠️ 逾期未发 {n} 条', { n: overdue })}</span>` : ''}`;
}

function renderOpsTab() {
  updateAlerts();
  const el = $('#ops-content');
  if (O.tab === 'overview') return renderOverview(el);
  if (O.tab === 'calendar') return renderCalendar(el);
  if (O.tab === 'works') return renderWorksLib(el);
  if (O.tab === 'video' || O.tab === 'daily') return renderStudio(el, O, O.tab, openWork, reloadWorks);
  if (O.tab === 'studio') return renderMemberStudioTab(el, O.group);
  if (O.tab === 'visual') {
    return renderVisualTab(el, O.group, async () => {
      O.group = await api.groups.get(O.group.id);
      renderOpsTab();
    });
  }
}

function gotoTab(tab) {
  O.tab = tab;
  $$('#ops-nav .side-nav-item').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  // 静默写入 URL（不触发 hashchange），刷新后停在当前页
  if (O.group) history.replaceState(null, '', `#/ops/${O.group.id}?tab=${tab}`);
  renderOpsTab();
}

// 统一页头：EN kicker + 大标题 + 副标 + 右侧操作
function opsHead(en, title, sub, actions = '') {
  return `<header class="ops-page-head">
    <div class="ops-page-head-main">
      <div class="ops-kicker">${esc(en)}</div>
      <h1>${esc(title)}</h1>
      ${sub ? `<p class="ops-sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="ops-actions">${actions}</div>` : ''}
  </header>`;
}

// ── 运营总览（驾驶舱） ──
const CYCLE = [['日常期', t('养粉')], ['预热期', t('埋钩子')], ['主打期', t('火力全开')], ['长尾期', t('二创切片')]];

function startOfWeek(d) {
  const x = new Date(d);
  const off = (x.getDay() + 6) % 7; // 周一=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x;
}
function parseMonthDay(str) {
  if (!str) return null;
  let m = String(str).match(/(\d{1,2})\s*月\s*(\d{1,2})/);
  if (!m) m = String(str).match(/\b(\d{1,2})[\/.\-](\d{1,2})\b/);
  return m ? { month: +m[1], day: +m[2] } : null;
}
function daysUntil(month, day) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let t = new Date(now.getFullYear(), month - 1, day);
  if (t < now) t = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((t - now) / 864e5);
}

function renderOverview(el) {
  const g = O.group, d = g.data, c = d.concept;
  const today = fmtDate(new Date());
  const debutDays = Math.max(0, Math.floor((Date.now() - new Date(g.createdAt).getTime()) / 864e5));
  const total = O.works.length;
  const published = O.works.filter((w) => w.status === 'published').length;
  const ws = startOfWeek(new Date());
  const we = new Date(ws); we.setDate(we.getDate() + 6);
  const wsStr = fmtDate(ws), weStr = fmtDate(we);
  const inWeek = (w) => w.publishAt && w.publishAt >= wsStr && w.publishAt <= weStr;
  const weekPending = O.works.filter((w) => w.status === 'scheduled' && inWeek(w)).length;
  const overdue = O.works.filter((w) => w.status === 'scheduled' && w.publishAt && w.publishAt < today);

  const byDate = {};
  O.works.forEach((w) => { if (w.publishAt) (byDate[w.publishAt] = byDate[w.publishAt] || []).push(w); });
  const wkDays = ['一', '二', '三', '四', '五', '六', '日'].map((lbl, i) => {
    const dt = new Date(ws); dt.setDate(dt.getDate() + i);
    const ds = fmtDate(dt);
    const items = byDate[ds] || [];
    return { lbl, ds, dayNum: dt.getDate(), isToday: ds === today, items };
  });

  // 待办
  const todos = [];
  O.works.filter((w) => w.status === 'scheduled' && w.publishAt && w.publishAt >= today && w.publishAt <= weStr)
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
    .forEach((w) => {
      if (!(w.content?.script || w.content?.copy)) todos.push({ t: t('「{title}」还没生成内容包', { title: w.title }), sub: t('{date} 待发', { date: w.publishAt.slice(5) }), tab: 'works' });
    });
  if (overdue.length) todos.push({ t: t('{n} 条内容逾期未发', { n: overdue.length }), sub: t('去发布日历处理'), tab: 'calendar', warn: true });
  const lastDated = O.works.filter((w) => w.publishAt).map((w) => w.publishAt).sort().pop();
  if (lastDated && lastDated < today) {
    const gap = Math.round((new Date(today) - new Date(lastDated)) / 864e5);
    if (gap >= 3) todos.push({ t: t('已 {n} 天没有新内容排期', { n: gap }), sub: t('去日常选题工坊补弹药'), tab: 'daily', warn: true });
  }
  if (!total) todos.push({ t: t('作品库还是空的'), sub: t('从日常选题工坊开始产出第一条'), tab: 'daily' });

  // 即将到来
  const upcoming = [];
  d.members.forEach((m) => {
    const md = parseMonthDay(m.profile?.birthday);
    if (md) { const n = daysUntil(md.month, md.day); if (n <= 45) upcoming.push({ icon: '🎂', label: t('{name} 生日', { name: m.codename }), date: `${md.month}/${md.day}`, days: n }); }
  });
  const cd = new Date(g.createdAt);
  const annN = daysUntil(cd.getMonth() + 1, cd.getDate());
  if (annN <= 45) upcoming.push({ icon: '🎉', label: t('出道纪念日'), date: `${cd.getMonth() + 1}/${cd.getDate()}`, days: annN });
  upcoming.sort((a, b) => a.days - b.days);

  const legacyCycleKey = `ops-cycle-${g.id}`;
  const legacyCycle = localStorage.getItem(legacyCycleKey);
  const cycle = d.opsCycle || legacyCycle || '日常期';
  if (!d.opsCycle && legacyCycle) {
    d.opsCycle = legacyCycle;
    api.groups.update(g.id, d)
      .then((group) => { if (O.group === g) O.group = group; localStorage.removeItem(legacyCycleKey); })
      .catch(() => { delete d.opsCycle; });
  }
  const cycleSel = `<label class="cycle-sel">${t('当前周期')}
    <select id="ov-cycle">${CYCLE.map(([k, hint]) => `<option value="${k}" ${k === cycle ? 'selected' : ''}>${t(k)} · ${hint}</option>`).join('')}</select></label>`;

  el.innerHTML = `<div class="ops-page">
    ${opsHead(t('OPERATIONS · 运营总览'), c.name, `${t('出道第 <b>{n}</b> 天', { n: debutDays })}　·　${esc(c.vibe || c.theme || '')}`, cycleSel)}

    <div class="dash-stats">
      <div class="stat-tile"><div class="stat-num">${total}</div><div class="stat-lbl">${t('作品总数')}</div></div>
      <div class="stat-tile" data-go="calendar"><div class="stat-num">${weekPending}</div><div class="stat-lbl">${t('本周待发')}</div></div>
      <div class="stat-tile ${overdue.length ? 'warn' : ''}" data-go="calendar"><div class="stat-num">${overdue.length}${overdue.length ? ' ⚠' : ''}</div><div class="stat-lbl">${t('逾期未发')}</div></div>
      <div class="stat-tile"><div class="stat-num">${published}</div><div class="stat-lbl">${t('已发布')}</div></div>
    </div>

    <section class="dash-card dash-pulse">
      <div class="dash-card-head"><h3>${t('本周脉搏')}</h3><span class="muted">${wsStr.slice(5)} – ${weStr.slice(5)}</span><div class="spacer"></div><button class="btn btn-ghost btn-sm" data-go="calendar">${t('打开日历 →')}</button></div>
      <div class="pulse-row">
        ${wkDays.map((wd) => `<button class="pulse-day ${wd.isToday ? 'today' : ''} ${wd.items.length ? 'has' : ''}" data-go="calendar" title="${wd.ds}">
          <span class="pulse-wk">${t('周' + wd.lbl)}</span>
          <span class="pulse-date">${wd.dayNum}</span>
          <span class="pulse-chips">${wd.items.slice(0, 3).map((w) => (TYPE_META[w.type] || TYPE_META.other).icon).join('') || '·'}</span>
        </button>`).join('')}
      </div>
    </section>

    <div class="dash-cols">
      <section class="dash-card">
        <div class="dash-card-head"><h3>${t('待办 / 提醒')}</h3><span class="badge">${todos.length}</span></div>
        ${todos.length ? `<ul class="dash-list">${todos.map((x) => `<li class="dash-li ${x.warn ? 'warn' : ''}" data-go="${x.tab}"><span class="dash-li-dot"></span><div><b>${esc(x.t)}</b><small>${esc(x.sub)}</small></div><span class="dash-li-go">→</span></li>`).join('')}</ul>`
          : `<p class="dash-empty">${t('✅ 一切就绪，没有待办')}</p>`}
        <button class="btn btn-primary btn-sm dash-cta" data-plan>${t('🤖 让 AI 排一周')}</button>
      </section>
      <section class="dash-card">
        <div class="dash-card-head"><h3>${t('即将到来')}</h3></div>
        ${upcoming.length ? `<ul class="dash-list">${upcoming.map((u) => `<li class="dash-li"><span class="dash-li-ico">${u.icon}</span><div><b>${esc(u.label)}</b><small>${u.date}</small></div><span class="dash-days">${u.days === 0 ? t('今天') : t('{n} 天后', { n: u.days })}</span></li>`).join('')}</ul>`
          : `<p class="dash-empty">${t('近 45 天没有关键日期')}<br><small class="muted">${t('在成员设定补生日字段后会自动出现')}</small></p>`}
      </section>
    </div>
  </div>`;

  $('#ov-cycle').onchange = async (e) => {
    const previous = d.opsCycle;
    d.opsCycle = e.target.value;
    try {
      const updated = await api.groups.update(g.id, d);
      if (O.group === g) O.group = updated;
      localStorage.removeItem(legacyCycleKey);
    } catch (err) {
      if (previous === undefined) delete d.opsCycle;
      else d.opsCycle = previous;
      e.target.value = previous || '日常期';
      toast(t('周期保存失败：') + err.message, 3000);
    }
  };
  el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => gotoTab(b.dataset.go));
  const planBtn = el.querySelector('[data-plan]');
  if (planBtn) planBtn.onclick = () => { gotoTab('calendar'); setTimeout(openPlanModal, 60); };
}

// ── 发布日历 ──
function renderCalendar(el) {
  const y = O.month.getFullYear();
  const m = O.month.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一开头
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = fmtDate(new Date());
  const byDate = {};
  for (const w of O.works) {
    if (w.publishAt) (byDate[w.publishAt] = byDate[w.publishAt] || []).push(w);
  }

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push('<div class="cal-cell empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = fmtDate(new Date(y, m, d));
    const items = (byDate[ds] || []).map((w) => {
      const tm = TYPE_META[w.type] || TYPE_META.other;
      const overdue = ds < todayStr && w.status === 'scheduled';
      return `<div class="cal-chip ${overdue ? 'overdue' : ''} ${w.status === 'published' ? 'pub' : ''}" data-work="${esc(w.id)}" style="--wc:${tm.color}" title="${esc(w.title)}${overdue ? t('（逾期未发）') : ''}">
        ${overdue ? '⚠️' : tm.icon} ${esc(w.title)}</div>`;
    }).join('');
    cells.push(`<div class="cal-cell ${ds === todayStr ? 'today' : ''}" data-date="${ds}">
      <div class="cal-day-row"><span class="cal-day-num">${d}</span><button class="cal-add" data-add="${ds}" title="${t('在这天新建')}">＋</button></div>
      ${items}</div>`);
  }

  el.innerHTML = `<div class="ops-page">
    ${opsHead(t('CALENDAR · 排播指挥台'), t('发布日历'), t('每天发什么的总开关——从这里排播、补内容、追逾期。'),
      `<button class="btn btn-ghost" id="cal-plan">${t('🤖 AI 排期')}</button><button class="btn btn-primary" id="cal-new">${t('＋ 新建作品')}</button>`)}
    <div class="card cal-card">
      <div class="cal-toolbar">
        <button class="btn btn-ghost btn-sm" id="cal-prev">‹</button>
        <h2 class="cal-month">${t('{y} 年 {m} 月', { y, m: m + 1 })}</h2>
        <button class="btn btn-ghost btn-sm" id="cal-next">›</button>
        <button class="btn btn-ghost btn-sm" id="cal-today">${t('回到今天')}</button>
        <div style="flex:1"></div>
        <span class="cal-legend">${Object.values(TYPE_META).map((t) => `<span>${t.icon}${t.label}</span>`).join('')}</span>
      </div>
      <div class="cal-week">${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div>${t('周' + w)}</div>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>
  </div>`;

  $('#cal-prev').onclick = () => { O.month = new Date(y, m - 1, 1); renderOpsTab(); };
  $('#cal-next').onclick = () => { O.month = new Date(y, m + 1, 1); renderOpsTab(); };
  $('#cal-today').onclick = () => { O.month = new Date(); renderOpsTab(); };
  $('#cal-plan').onclick = openPlanModal;
  $('#cal-new').onclick = () => openWork(null);
  el.querySelectorAll('.cal-chip').forEach((chip) => chip.onclick = () => {
    openWork(O.works.find((w) => w.id === chip.dataset.work));
  });
  el.querySelectorAll('.cal-add').forEach((b) => b.onclick = () => openWork(null, b.dataset.add));
}

// ── 作品库（存储库：团队产出的所有内容，按类型/状态筛选、按时间归档） ──
function renderWorksLib(el) {
  const fType = el.dataset.ftype || '';
  const fStatus = el.dataset.fstatus || '';
  const total = O.works.length;
  const statusPills = [['', `${t('全部')} ${total}`], ...Object.entries(STATUS_META).map(([k, label]) => {
    const n = O.works.filter((w) => w.status === k).length;
    return [k, `${label} ${n}`];
  })];

  el.innerHTML = `<div class="ops-page">
    ${opsHead('WORKS · LIBRARY', t('作品库'), t('团队产出的全部内容档案，按发布时间归档；选题与创作的成品都沉淀在这里。'),
      `<input id="wf-q" class="vs-input lib-search" type="search" placeholder="${t('🔍 搜标题 / 成员')}" value="${esc(el.dataset.q || '')}">
       <select id="wf-type" class="vs-select">${[`<option value="">${t('全部类型')}</option>`, ...Object.entries(TYPE_META).map(([k, tm]) => `<option value="${k}" ${k === fType ? 'selected' : ''}>${tm.icon} ${tm.label}</option>`)].join('')}</select>
       <button class="btn btn-primary" id="wk-new">${t('＋ 新建作品')}</button>`)}
    <div class="lib-filters">${statusPills.map(([k, label]) => `<button class="lib-pill${k === fStatus ? ' on' : ''}" data-status="${k}">${label}</button>`).join('')}</div>
    <div id="lib-results"></div>
  </div>`;

  renderLibResults(el);
  $('#wf-type').onchange = (e) => { el.dataset.ftype = e.target.value; renderWorksLib(el); };
  $('#wk-new').onclick = () => openWork(null);
  $('#wf-q').oninput = (e) => { el.dataset.q = e.target.value; renderLibResults(el); };
  el.querySelectorAll('.lib-pill').forEach((b) => b.onclick = () => { el.dataset.fstatus = b.dataset.status; renderWorksLib(el); });
}

function renderLibResults(el) {
  const fType = el.dataset.ftype || '';
  const fStatus = el.dataset.fstatus || '';
  const q = (el.dataset.q || '').trim();
  let works = O.works.filter((w) => (!fType || w.type === fType) && (!fStatus || w.status === fStatus));
  if (q) works = works.filter((w) => (w.title || '').includes(q) || (w.members || '').includes(q));
  // 归档式：按发布日期倒序，未排期的排最后
  works = works.slice().sort((a, b) => (b.publishAt || '0').localeCompare(a.publishAt || '0'));

  const box = $('#lib-results');
  box.innerHTML = works.length
    ? `<div class="works-lib">${works.map(workCard).join('')}</div>`
    : `<div class="empty-state" style="padding:60px 0"><div class="big">📦</div>${O.works.length ? t('没有符合筛选条件的作品') : t('作品库还是空的——去日常选题或创作间产出第一条内容吧')}</div>`;
  box.querySelectorAll('.work-card').forEach((card) => {
    card.onclick = () => openWork(O.works.find((w) => w.id === card.dataset.work));
  });
}

function workCard(w) {
  const tm = TYPE_META[w.type] || TYPE_META.other;
  const overdue = w.publishAt && w.publishAt < fmtDate(new Date()) && w.status === 'scheduled';
  const hasContent = !!(w.content?.script || w.content?.copy);
  return `<article class="work-card" data-work="${esc(w.id)}" style="--wc:${tm.color}">
    <div class="work-card-top">
      <span class="work-type"><span class="work-dot"></span>${tm.icon} ${tm.label}</span>
      <span class="work-status work-status-${esc(w.status)}">${esc(STATUS_META[w.status] || w.status)}</span>
    </div>
    <b class="work-card-title">${esc(w.title) || t('未命名作品')}</b>
    <div class="work-card-meta">
      ${w.members ? `<span>👥 ${esc(w.members)}</span>` : ''}
      <span class="${overdue ? 'work-overdue' : ''}">${overdue ? '⚠️ ' : '🗓 '}${w.publishAt ? esc(w.publishAt) : t('未排期')}</span>
      ${hasContent ? `<span class="work-haspack">${t('📋 内容包')}</span>` : ''}
    </div>
  </article>`;
}

// ── 作品详情 / 新建 ──
export function openWork(work, presetDate = '', presetStatus = '') {
  const group = O.group;
  const groupId = group.id;
  const isNew = !work;
  const w = work || { type: 'short_video', title: '', members: '', channel: '', status: presetStatus || (presetDate ? 'scheduled' : 'idea'), publishAt: presetDate, content: {} };
  const memberNames = group.data.members.map((m) => m.codename);

  modal(`<h3>${isNew ? t('＋ 新建作品') : t('作品详情')}</h3>
    <label class="field"><span class="field-label">${t('标题')}</span><input id="wk-title" type="text" value="${esc(w.title)}" placeholder="${t('作品标题')}"></label>
    <div class="field-row">
      <label class="field"><span class="field-label">${t('类型')}</span>
        <select id="wk-type">${Object.entries(TYPE_META).map(([k, tm]) => `<option value="${k}" ${k === w.type ? 'selected' : ''}>${tm.icon} ${tm.label}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">${t('发布日期')}</span><input id="wk-date" type="date" value="${esc(w.publishAt || '')}"></label>
    </div>
    <label class="field"><span class="field-label">${t('状态')}</span>
      ${segmented('wk-status', Object.entries(STATUS_META).map(([k, s]) => ({ value: k, label: s })), w.status)}</label>
    <div class="field-row">
      <label class="field"><span class="field-label">${t('出演成员')} <small>${t('（逗号分隔，或"全员"）')}</small></span><input id="wk-members" type="text" value="${esc(w.members)}" placeholder="${esc(memberNames.join('、'))}"></label>
      <label class="field"><span class="field-label">${t('发布账号')} <small>${t('（可留空）')}</small></span><input id="wk-channel" type="text" value="${esc(w.channel)}" placeholder="${t('团号 / 某成员个人号')}"></label>
    </div>
    <div id="wk-content">${contentHTML(w)}</div>
    <div class="m-foot" style="justify-content:space-between">
      <div>${isNew ? '' : `<button class="btn btn-danger btn-sm" data-del>${t('删除')}</button>`}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${aiButtonsHTML(w)}
        ${(w.content?.script || w.content?.copy) ? `<button class="btn btn-ghost" data-copyall>${t('📋 复制内容包')}</button>` : ''}
        ${!isNew && w.status === 'scheduled' ? `<button class="btn btn-ghost" data-pub style="color:var(--ok);border-color:#bcd9c8">${t('✅ 标记已发布')}</button>` : ''}
        <button class="btn btn-ghost" data-x>${t('关闭')}</button>
        <button class="btn btn-primary" data-ok>${isNew ? t('创建') : t('保存')}</button>
      </div>
    </div>`,
    { onMount: (mask, close) => {
      const readForm = () => ({
        title: $('#wk-title', mask).value.trim() || '未命名作品',
        type: $('#wk-type', mask).value,
        status: $('#wk-status', mask).value,
        publish_at: $('#wk-date', mask).value || null,
        members: $('#wk-members', mask).value.trim(),
        channel: $('#wk-channel', mask).value.trim(),
        content: w.content,
      });
      $('[data-x]', mask).onclick = close;
      $('[data-ok]', mask).onclick = async () => {
        const fields = readForm();
        if (isNew) await api.works.create(groupId, fields);
        else await api.works.update(w.id, fields);
        if (O.group?.id === groupId) await reloadWorks();
        close();
        toast(isNew ? t('已创建') : t('已保存'));
        if (O.group?.id === groupId) renderOpsTab();
      };
      const pubBtn = mask.querySelector('[data-pub]');
      if (pubBtn) pubBtn.onclick = async () => {
        await api.works.update(w.id, { ...readForm(), status: 'published' });
        if (O.group?.id === groupId) await reloadWorks();
        close();
        toast(t('已标记为已发布 🎉'));
        if (O.group?.id === groupId) renderOpsTab();
      };
      const delBtn = mask.querySelector('[data-del]');
      if (delBtn) delBtn.onclick = async () => {
        if (await confirmModal(t('删除作品'), t('确定删除「{title}」吗？', { title: w.title }))) {
          await api.works.remove(w.id);
          if (O.group?.id === groupId) await reloadWorks();
          close();
          toast(t('已删除'));
          if (O.group?.id === groupId) renderOpsTab();
        }
      };
      // 复制按钮
      mask.querySelectorAll('.copy-btn').forEach((b) => b.onclick = () => copyText(b.dataset.text));
      // 复制完整内容包
      const copyAllBtn = mask.querySelector('[data-copyall]');
      if (copyAllBtn) copyAllBtn.onclick = () => {
        const parts = [`【${w.title}】`];
        if (w.members) parts.push(`${t('出演：')}${w.members}`);
        if (w.publishAt) parts.push(`${t('发布日期：')}${w.publishAt}`);
        if (w.content.copy) parts.push(`\n${t('文案：')}\n${w.content.copy}`);
        if (w.content.script) {
          const s = w.content.script;
          const shots = (s.shots || []).map((sh) => `${sh.no}. [${sh.scene}] ${sh.action}${sh.line ? '\n   ' + t('台词：') + sh.line : ''}${sh.caption ? '\n   ' + t('字幕：') + sh.caption : ''}`).join('\n');
          parts.push(`\n${t('分镜脚本（{duration}）：', { duration: s.duration || '' })}\n${shots}${s.endHook ? '\n' + t('结尾钩子：') + s.endHook : ''}${s.bgm ? '\n' + t('BGM建议：') + s.bgm : ''}${s.tips ? '\n' + t('拍摄提示：') + s.tips : ''}`);
        }
        copyText(parts.join('\n'));
      };
      // AI：生成/重做脚本
      const genScript = mask.querySelector('[data-gen-script]');
      if (genScript) genScript.onclick = async () => {
        genScript.disabled = true;
        genScript.innerHTML = `<span class="spinner"></span> ${t('生成中…')}`;
        try {
          const d = group.data;
          const names = ($('#wk-members', mask).value || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
          const cast = d.members.filter((mm) => names.includes(mm.codename) || names.includes('全员') || !names.length);
          const topic = w.content.topic || { title: $('#wk-title', mask).value, hook: w.content.hook || '', format: '30秒剧情', desc: '' };
          w.content.script = await api.stage('videoScript', { concept: d.concept, castMembers: cast.length ? cast : d.members, topic, duration: '30秒' });
          $('#wk-content', mask).innerHTML = contentHTML(w);
          mask.querySelectorAll('.copy-btn').forEach((b) => b.onclick = () => copyText(b.dataset.text));
          toast(t('脚本已生成，记得点"保存"'));
        } catch (e) { toast(t('生成失败：') + e.message, 3000); }
        genScript.disabled = false;
        genScript.textContent = t('🎬 重新生成脚本');
      };
      // AI：生成成员语气文案
      const genCopy = mask.querySelector('[data-gen-copy]');
      if (genCopy) genCopy.onclick = async () => {
        genCopy.disabled = true;
        genCopy.innerHTML = `<span class="spinner"></span> ${t('生成中…')}`;
        try {
          const d = group.data;
          const names = ($('#wk-members', mask).value || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
          const member = d.members.find((mm) => names.includes(mm.codename)) || d.members[0];
          const mi = d.members.indexOf(member);
          const r = await api.stage('postCopy', {
            member, daily: d.history?.[mi]?.dailyLife || '',
            theme: $('#wk-title', mask).value || w.content.hook || '日常分享',
          });
          w.content.copy = r.copy;
          $('#wk-content', mask).innerHTML = contentHTML(w);
          mask.querySelectorAll('.copy-btn').forEach((b) => b.onclick = () => copyText(b.dataset.text));
          toast(t('文案已生成，记得点"保存"'));
        } catch (e) { toast(t('生成失败：') + e.message, 3000); }
        genCopy.disabled = false;
        genCopy.textContent = t('✍️ 重新生成文案');
      };
    } });
}

function aiButtonsHTML(w) {
  const btns = [];
  if (w.type === 'short_video') btns.push(`<button class="btn btn-ghost" data-gen-script>${w.content.script ? t('🎬 重新生成脚本') : t('🎬 生成分镜脚本')}</button>`);
  if (w.type === 'daily' || w.type === 'post') btns.push(`<button class="btn btn-ghost" data-gen-copy>${w.content.copy ? t('✍️ 重新生成文案') : t('✍️ 生成成员语气文案')}</button>`);
  return btns.join('');
}

function contentHTML(w) {
  const c = w.content || {};
  const parts = [];
  if (c.topic?.hook || c.hook) parts.push(`<p style="margin:4px 0"><b>${t('钩子：')}</b>${esc(c.topic?.hook || c.hook)}</p>`);
  if (c.topic?.desc) parts.push(`<p style="margin:4px 0"><b>${t('内容：')}</b>${esc(c.topic.desc)}</p>`);
  if (c.topic?.outline) parts.push(`<p style="margin:4px 0"><b>${t('大纲：')}</b>${esc(c.topic.outline)}</p>`);
  if (c.copy) parts.push(`<p style="margin:8px 0 2px"><b>${t('发布文案')}</b></p><div class="prompt-block">${esc(c.copy)}<button class="copy-btn" data-text="${esc(c.copy)}">${t('复制')}</button></div>`);
  if (c.script) {
    const s = c.script;
    const scriptText = (s.shots || []).map((sh) => `${sh.no}. [${sh.scene}] ${sh.action}${sh.line ? '\n   ' + t('台词：') + sh.line : ''}${sh.caption ? '\n   ' + t('字幕：') + sh.caption : ''}`).join('\n');
    parts.push(`<p style="margin:8px 0 2px"><b>${t('分镜脚本')}</b> · ${esc(s.duration || '')}　<span class="muted">${t('BGM：')}${esc(s.bgm || '')}</span></p>
      <div class="prompt-block">${esc(scriptText)}\n\n${t('结尾钩子：')}${esc(s.endHook || '')}\n${t('拍摄提示：')}${esc(s.tips || '')}<button class="copy-btn" data-text="${esc(scriptText + '\n\n' + t('结尾钩子：') + (s.endHook || '') + '\n' + t('拍摄提示：') + (s.tips || ''))}">${t('复制')}</button></div>`);
  }
  return parts.length ? `<div style="background:#faf9f4;border-radius:10px;padding:12px 16px;margin-bottom:6px">${parts.join('')}</div>` : '';
}

// ── AI 排期助理 ──
function openPlanModal() {
  const group = O.group;
  const groupId = group.id;
  const works = O.works;
  const today = fmtDate(new Date());
  let closePlan;
  modal(`<h3>${t('🤖 AI 智能排期')}</h3>
    <p class="sub" style="margin-bottom:16px">${t('按团队人设和关系生成 7 天发布计划，逐条确认后写入日历。已排定的内容会自动避开。')}</p>
    <div class="field-row">
      <label class="field" style="max-width:200px"><span class="field-label">${t('起始日期')}</span><input id="pl-start" type="date" value="${today}"></label>
      <label class="field"><span class="field-label">${t('要求')} <small>${t('（可留空）')}</small></span><input id="pl-hint" type="text" placeholder="${t('例如：这周主推小叮 / 周末要有直播 / 轻松一点')}"></label>
      <button class="btn btn-primary" id="pl-gen">${t('🤖 生成一周排期')}</button>
    </div>
    <div id="pl-result"></div>`, { onMount: (mask, close) => { closePlan = close; } });

  $('#pl-gen').onclick = async () => {
    const btn = $('#pl-gen');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${t('排期中…')}`;
    try {
      const start = new Date($('#pl-start').value + 'T00:00:00');
      const dates = Array.from({ length: 7 }, (_, i) => fmtDate(new Date(start.getTime() + i * 864e5)));
      const d = group.data;
      const existing = works.filter((w) => w.publishAt && dates.includes(w.publishAt)).map((w) => ({ date: w.publishAt, title: w.title }));
      const columns = d.operations
        ? [...(d.operations.liveShows || []).map((x) => `直播·${x.name}`), ...(d.operations.shortVideoColumns || []).map((x) => `短视频·${x.name}`)].join('、')
        : '';
      const plan = await api.stage('weekPlan', {
        concept: d.concept, members: d.members, relations: d.relations,
        columns, dates, existing, hint: $('#pl-hint').value.trim(),
      });
      renderPlanResult(plan, groupId, closePlan);
    } catch (e) {
      toast(t('排期失败：') + e.message, 3500);
    }
    btn.disabled = false;
    btn.textContent = t('🤖 生成一周排期');
  };
}

function renderPlanResult(plan, groupId, closePlan) {
  const rows = [];
  (plan.days || []).forEach((day, di) => {
    (day.items || []).forEach((item, ii) => {
      const tm = TYPE_META[item.type] || TYPE_META.other;
      rows.push(`<div class="plan-row" data-di="${di}" data-ii="${ii}">
        <label class="plan-check"><input type="checkbox" checked></label>
        <span class="plan-date">${esc(day.date.slice(5))}</span>
        <span class="wk-type" style="--wc:${tm.color}">${tm.icon} ${tm.label}</span>
        <div class="plan-main"><b>${esc(item.title)}</b><div class="muted">${esc(item.members)} · ${esc(item.hook)}</div></div>
      </div>`);
    });
  });
  $('#pl-result').innerHTML = `
    <h3>${t('排期草稿')} <span class="muted" style="font-weight:400">${t('取消勾选不想要的，然后写入日历')}</span></h3>
    <div>${rows.join('')}</div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-primary" id="pl-apply">${t('✔ 写入日历')}</button>
    </div>`;

  $('#pl-apply').onclick = async () => {
    const picked = [];
    $$('#pl-result .plan-row').forEach((row) => {
      if (!row.querySelector('input').checked) return;
      const item = plan.days[row.dataset.di].items[row.dataset.ii];
      picked.push({
        type: TYPE_META[item.type] ? item.type : 'other',
        title: item.title, members: item.members || '',
        status: 'scheduled', publish_at: plan.days[row.dataset.di].date,
        content: { hook: item.hook || '' },
      });
    });
    if (!picked.length) return toast(t('没有勾选任何内容'));
    await api.works.batch(groupId, picked);
    if (O.group?.id === groupId) await reloadWorks();
    toast(t('已写入 {n} 条排期', { n: picked.length }));
    closePlan?.();
    if (O.group?.id === groupId) {
      O.tab = 'calendar';
      renderOpsTab();
    }
  };
}
