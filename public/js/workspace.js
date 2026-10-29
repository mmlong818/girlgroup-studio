// 企划工作台 — 浏览 / 编辑 / 重roll / 导出
import { api, mapLimit } from './api.js';
import { $, $$, esc, toast, modal, confirmModal, copyText, download, getPath, setPath, lightbox } from './ui.js';
import { buildMarkdown } from './markdown.js';
import { showGroupCard } from './card.js';
import { openRename } from './rename.js';
import { t } from './i18n.js';

let G = null; // 当前企划 { id, shareId, name, data, images }
let currentTab = 'people';
let activeMember = 0; // 当前选中成员（左栏与人物设定共享）

// ── 锁定 / 待处理 ──
const isLocked  = (key) => !!(G?.data.locks  || {})[key];
const isPending = (key) => !!(G?.data.pending || {})[key];

function pathToNodeKey(path) {
  const s = path.split('.');
  return (s[0] === 'members' || s[0] === 'history') && s.length > 1 ? `${s[0]}.${s[1]}` : s[0];
}

async function toggleLock(key) {
  const group = G;
  group.data.locks = group.data.locks || {};
  group.data.locks[key] = !group.data.locks[key];
  await save(group);
  if (G === group) renderTab();
}

async function togglePending(key) {
  const group = G;
  group.data.pending = group.data.pending || {};
  group.data.pending[key] = !group.data.pending[key];
  await save(group);
  if (G === group) renderTab();
}

const TABS = [
  ['people', t('人物设定')],
  ['world', t('世界观')],
  ['story', t('故事宇宙')],
  ['plan', t('运营方案')],
];

// 视觉车间统一在运营中心；member 可直接定位到某位成员
const visualHref = (member = '') => `#/ops/${G.id}?tab=visual${member ? `&member=${encodeURIComponent(member)}` : ''}`;

export async function renderWorkspace(app, id, initialTab = 'people', isCurrent = () => true) {
  app.innerHTML = `<div class="empty-state"><div class="big">⏳</div>${t('加载中…')}</div>`;
  try {
    const group = await api.groups.get(id);
    if (!isCurrent()) return;
    G = group;
  } catch (e) {
    if (!isCurrent()) return;
    app.innerHTML = `<div class="empty-state">${t('加载失败：')}${esc(e.message)}<br><br><button class="btn btn-ghost" id="workspace-back">${t('返回')}</button></div>`;
    $('#workspace-back').onclick = () => { location.hash = ''; };
    return;
  }
  if (initialTab === 'visual') { location.hash = visualHref(); return; }
  currentTab = TABS.find(([k]) => k === initialTab) ? initialTab : 'people';
  if (activeMember >= (G.data.members?.length || 0)) activeMember = 0;
  const c = G.data.concept;
  document.body.classList.add('ws-mode');
  app.style.setProperty('--team-c', c.mainColor);
  app.innerHTML = `
    <div class="ws-shell" style="--team-c:${esc(c.mainColor)}">
      <aside class="ws-side" id="ws-side"></aside>
      <main class="ws-body">
        <nav class="tabs" id="ws-tabs"><div class="tabs-main" id="ws-tabs-main"></div></nav>
        <div id="tab-content"></div>
      </main>
    </div>`;

  renderSidebar();
  $('#ws-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab[data-tab]');
    if (!btn) return;
    currentTab = btn.dataset.tab;
    renderTab();
  });
  $('#tab-content').addEventListener('click', onFieldAction);
  renderTab();
}

const vibeBadges = (vibe) => String(vibe || '').split(/[,，、]/).filter(Boolean).map((v) => `<span class="badge">${esc(v.trim())}</span>`).join('');

// ── 左侧通顶档案栏：平台 + 团队核心信息 + 成员 + 操作 ──
function renderSidebar() {
  const side = $('#ws-side');
  if (!side) return;
  const d = G.data;
  const c = d.concept;
  side.innerHTML = `
    <button class="side-app" id="side-home" title="${t('返回我的企划')}"><img class="brand-logo" src="/logo-mark.png" alt="${t('成团')}"></button>
    <div class="side-team">
      <div class="side-name"><span class="ws-dot"></span>${esc(c.name)}</div>
      <div class="side-meta">${t('{n} 人', { n: d.members.length })}${c.fandomName ? ` · ${esc(c.fandomName)}` : ''}</div>
      ${c.vibe ? `<div class="side-vibes">${vibeBadges(c.vibe)}</div>` : ''}
    </div>
    <div class="side-sec">${t('成员')}</div>
    <nav class="side-members">
      ${d.members.map((m, i) => {
        const photo = G.images.find((img) => img.member === m.codename && img.isPrimary);
        const on = i === activeMember && currentTab === 'people';
        return `<button class="side-mem${on ? ' active' : ''}" data-mem="${i}" style="--mc:${esc(m.color)}">
          <span class="side-mem-thumb">${photo ? `<img src="${esc(photo.url)}" alt="">` : '<span>✦</span>'}</span>
          <span class="side-mem-txt"><span class="side-mem-name">${esc(m.codename)}</span><span class="side-mem-arch">${esc(m.archetype || '')}</span></span>
        </button>`;
      }).join('')}
    </nav>
    <div class="side-foot">
      <a class="btn side-primary" href="/g/${esc(G.shareId)}" target="_blank">${t('出道页')} ↗</a>
      <button class="btn side-btn" id="side-share">${t('分享 / 导出')} ▾</button>
      <a class="btn side-ops" href="#/ops/${esc(G.id)}">${t('运营中心')} →</a>
    </div>`;
  side.querySelector('#side-home').onclick = () => { location.hash = ''; };
  side.querySelectorAll('[data-mem]').forEach((b) => b.onclick = () => {
    activeMember = Number(b.dataset.mem);
    currentTab = 'people';
    renderTab();
  });
  side.querySelector('#side-share').onclick = openShareMenu;
}

function openShareMenu() {
  const group = G;
  const close = modal(`<h3>${t('分享 / 导出')}</h3>
    <div class="share-menu">
      <button class="btn btn-ghost" data-s="link">🔗 ${t('复制对外链接')}</button>
      <button class="btn btn-ghost" data-s="card">🪪 ${t('生成成团卡')}</button>
      <button class="btn btn-ghost" data-s="md">📄 ${t('导出企划书')} (.md)</button>
      <button class="btn btn-ghost" data-s="json">⤓ ${t('完整备份')} (.json)</button>
    </div>`, {
    onMount: (mask) => {
      const act = {
        link: () => copyText(`${location.origin}/g/${group.shareId}`),
        card: () => showGroupCard(group),
        md: () => download(`${group.data.concept.name}-企划书.md`, buildMarkdown(group.data), 'text/markdown;charset=utf-8'),
        json: async () => {
          const backup = await api.backups.get(group.id);
          download(`${group.data.concept.name}-完整备份.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
        },
      };
      mask.querySelectorAll('[data-s]').forEach((b) => b.onclick = async () => {
        b.disabled = true;
        try { await act[b.dataset.s](); close(); }
        catch (err) { toast(t('导出失败：') + err.message, 3500); b.disabled = false; }
      });
    },
  });
}

async function save(group = G) {
  await api.groups.update(group.id, group.data);
}

// 人物设定是否完成：全员都已生成成长经历
function peopleDone() {
  const d = G.data;
  const n = d.members?.length || 0;
  return n > 0 && Array.isArray(d.history) && d.members.every((_, i) => d.history[i]);
}

// ── 标签栏右侧：下一步 CTA + 运营中心 ──
function updateNavAside() {
  const aside = $('#ws-tabs-aside');
  if (!aside) return;
  const prog = G.data.progress || {};
  let cta = '';
  if (!peopleDone()) {
    cta = `<button class="btn btn-primary btn-sm" id="nav-gen-history">✦ ${t('生成全员经历')}</button>`;
  } else if (!prog.visual) {
    cta = `<button class="btn btn-primary btn-sm" id="nav-go-visual">${t('为成员选定主图')} →</button>`;
  } else {
    cta = `<span class="nav-celebrate">✓ ${t('全员就位')}</span>`;
  }
  aside.innerHTML = `${cta}<a class="btn btn-ghost btn-sm" href="#/ops/${esc(G.id)}">${t('运营中心')} →</a>`;
  aside.querySelector('#nav-gen-history')?.addEventListener('click', () => {
    if (currentTab !== 'people') { currentTab = 'people'; renderTab(); }
    generateHistory();
  });
  aside.querySelector('#nav-go-visual')?.addEventListener('click', () => {
    const tab = $('#ws-tabs-main [data-tab="visual"]');
    if (tab) tab.click();
  });
}

// ── 可编辑字段行 ──
// path 形如 'concept.worldview' / 'members.0.flaw'
function fRow(label, path, { rollable = true, rename = '' } = {}) {
  const v = getPath(G.data, path);
  if (v == null || v === '') return '';
  const text = Array.isArray(v) ? v.join('、') : String(v);
  const locked = isLocked(pathToNodeKey(path));
  return `<div class="f-row"><dt>${esc(label)}</dt><dd>${esc(text)}</dd>
    ${locked ? '' : `<div class="f-acts">
      <button class="f-act" title="${t('编辑')}" data-edit="${esc(path)}" data-label="${esc(label)}">✏️</button>
      ${rename ? `<button class="f-act" title="${t('AI 起名（8 个候选）')}" data-rename="${esc(path)}" data-kind="${esc(rename)}">🪄</button>` : ''}
      ${rollable ? `<button class="f-act" title="${t('AI 重新生成这一项')}" data-roll="${esc(path)}" data-label="${esc(label)}">🎲</button>` : ''}
    </div>`}
  </div>`;
}

function rollContext() {
  const c = G.data.concept;
  return `偶像团体「${c.name}」：${c.concept}\n世界观：${c.worldview}\n气质：${c.vibe}`;
}

async function onFieldAction(e) {
  const editBtn = e.target.closest('[data-edit]');
  const rollBtn = e.target.closest('[data-roll]');
  const renameBtn = e.target.closest('[data-rename]');
  const copyBtn = e.target.closest('.copy-btn');
  const regenBtn = e.target.closest('[data-regen]');
  const lockBtn  = e.target.closest('[data-lock]');
  const pendBtn  = e.target.closest('[data-pending]');
  if (copyBtn) return copyText(copyBtn.dataset.text);
  if (renameBtn) return renameField(renameBtn);
  if (editBtn) return editField(editBtn.dataset.edit, editBtn.dataset.label);
  if (rollBtn) return rollField(rollBtn.dataset.roll, rollBtn.dataset.label);
  if (regenBtn) return regenModule(regenBtn.dataset.regen);
  if (lockBtn) return toggleLock(lockBtn.dataset.lock);
  if (pendBtn) return togglePending(pendBtn.dataset.pending);
}

function renameField(btn) {
  const group = G;
  const path = btn.dataset.rename;
  openRename({
    kind: btn.dataset.kind,
    context: rollContext(),
    current: getPath(group.data, path),
    gender: btn.dataset.gender || '',
    target: btn.dataset.target || '',
    existing: [group.data.concept.name, ...group.data.concept.members.map((m) => m.codename)],
    onPick: async (name) => {
      setPath(group.data, path, name);
      // 同步骨架里的艺名，保持全局一致
      const m = path.match(/^members\.(\d+)\.codename$/);
      if (m && group.data.concept.members[m[1]]) group.data.concept.members[m[1]].codename = name;
      await save(group);
      toast(t('已更名'));
      if (G === group) renderTab();
    },
  });
}

function editField(path, label) {
  const group = G;
  const v = getPath(group.data, path);
  const isArr = Array.isArray(v);
  const text = isArr ? v.join('\n') : String(v ?? '');
  modal(`<h3>${t('编辑 · {label}', { label: esc(label) })}</h3>
    ${isArr ? `<p class="muted">${t('每行一项')}</p>` : ''}
    <textarea id="edit-ta" rows="${Math.min(10, Math.max(3, Math.ceil(text.length / 40)))}">${esc(text)}</textarea>
    <div class="m-foot"><button class="btn btn-ghost" data-x>${t('取消')}</button><button class="btn btn-primary" data-ok>${t('保存')}</button></div>`,
    { onMount: (mask, close) => {
      $('[data-x]', mask).onclick = close;
      $('[data-ok]', mask).onclick = async () => {
        const nv = $('#edit-ta', mask).value.trim();
        setPath(group.data, path, isArr ? nv.split('\n').map((s) => s.trim()).filter(Boolean) : nv);
        await save(group);
        close();
        toast(t('已保存'));
        if (G === group) renderTab();
      };
    } });
}

function rollField(path, label) {
  const group = G;
  const segs = path.split('.');
  const fieldKey = segs[segs.length - 1];
  const target = segs[0] === 'members' ? group.data.members[Number(segs[1])] : getPath(group.data, segs.slice(0, -1).join('.'));
  const currentValue = getPath(group.data, path);
  const context = rollContext();

  const close = modal(`<h3>🎲 ${t('重新生成 · {label}', { label: esc(label) })}</h3>
    <div class="reroll-old">${esc(Array.isArray(currentValue) ? currentValue.join('、') : currentValue)}</div>
    <div class="reroll-preview" id="rr-preview"><span class="spinner"></span> ${t('AI 创作中…')}</div>
    <label class="field"><input type="text" id="rr-hint" placeholder="${t('（可选）提点要求，例如：更可爱一点 / 跟音乐有关')}"></label>
    <div class="m-foot">
      <button class="btn btn-ghost" data-x>${t('取消')}</button>
      <button class="btn btn-ghost" data-again disabled>🎲 ${t('再来一次')}</button>
      <button class="btn btn-primary" data-ok disabled>✔ ${t('采用')}</button>
    </div>`,
    { onMount: (mask, closeFn) => {
      let newValue = null;
      const run = async () => {
        $('#rr-preview', mask).innerHTML = `<span class="spinner"></span> ${t('AI 创作中…')}`;
        $('[data-ok]', mask).disabled = true;
        $('[data-again]', mask).disabled = true;
        try {
          const r = await api.stage('reroll', {
            context, target, fieldKey, fieldLabel: label,
            currentValue, hint: $('#rr-hint', mask).value.trim(),
          });
          newValue = r.value;
          $('#rr-preview', mask).textContent = Array.isArray(newValue) ? newValue.join('、') : String(newValue);
        } catch (err) {
          $('#rr-preview', mask).textContent = t('生成失败：') + err.message;
        }
        $('[data-ok]', mask).disabled = newValue == null;
        $('[data-again]', mask).disabled = false;
      };
      $('[data-x]', mask).onclick = closeFn;
      $('[data-again]', mask).onclick = run;
      $('[data-ok]', mask).onclick = async () => {
        if (Array.isArray(currentValue) && !Array.isArray(newValue)) newValue = String(newValue).split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean);
        setPath(group.data, path, newValue);
        await save(group);
        closeFn();
        toast(t('已采用新设定'));
        if (G === group) renderTab();
      };
      run();
    } });
}

// ── 节点头部（带锁定 / 待处理 / AI重构控件）──
function nodeHead(titleHtml, key, { regen = null } = {}) {
  const locked = isLocked(key);
  const pending = isPending(key);
  return `<div class="module-head node-head">
    <h3 style="margin-top:0">${titleHtml}
      ${pending ? `<span class="node-tag node-tag-pend">${t('待处理')}</span>` : ''}
      ${locked  ? '<span class="node-tag node-tag-lock">🔒</span>' : ''}
    </h3>
    <div class="node-acts">
      ${regen && !locked ? `<button class="btn btn-ghost btn-sm" data-regen="${regen}">🔄 ${t('重构')}</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-lock="${key}" title="${locked ? t('解锁') : t('锁定')}">${locked ? '🔓' : '🔒'}</button>
      <button class="btn btn-ghost btn-sm${pending ? ' node-act-pend' : ''}" data-pending="${key}" title="${pending ? t('取消待处理') : t('标记待处理')}">${pending ? '✅' : '🏷'}</button>
    </div>
  </div>`;
}

// ── 模块级重新生成 ──
function feedbackModal(title, subtitle, hintPlaceholder) {
  return new Promise((resolve) => {
    modal(`<h3>${esc(title)}</h3>
      ${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}
      <label class="field"><input type="text" id="fb-hint" placeholder="${esc(hintPlaceholder)}"></label>
      <div class="m-foot">
        <button class="btn btn-ghost" data-x>${t('取消')}</button>
        <button class="btn btn-primary" data-ok>🔄 ${t('开始重构')}</button>
      </div>`,
      { onMount: (mask, closeFn) => {
        $('[data-x]', mask).onclick = () => { resolve(null); closeFn(); };
        $('[data-ok]', mask).onclick = () => { resolve($('#fb-hint', mask).value.trim()); closeFn(); };
      } });
  });
}

async function regenModule(moduleKey) {
  const group = G;
  const d = group.data;

  if (moduleKey.startsWith('members.')) {
    const idx = Number(moduleKey.split('.')[1]);
    const sk = d.concept.members[idx];
    const feedback = await feedbackModal(`🔄 ${t('重构「{name}」', { name: sk.codename })}`, t('重新生成该成员完整档案，当前内容将被覆盖。'), t('方向提示（可选），例如：更内敛 / 加入舞者背景'));
    if (feedback === null) return;
    if (G !== group) return;
    $('#tab-content').innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div><h2>${t('正在重构「{name}」…', { name: esc(sk.codename) })}</h2></div>`;
    try {
      d.members[idx] = await api.stage('member', { concept: d.concept, allMembers: d.concept.members, member: sk, feedback });
      await save(group); toast(t('{name} 档案已重构', { name: sk.codename }));
    } catch (e) { toast(t('生成失败：') + e.message, 3000); }
    if (G === group) renderTab();
    return;
  }

  if (moduleKey === 'concept') {
    const feedback = await feedbackModal(`🔄 ${t('重构总设定')}`, t('重新生成团体设定，成员阵容结构保持不变。'), t('方向提示（可选），例如：更暗黑 / 加入电子朋克元素'));
    if (feedback === null) return;
    if (G !== group) return;
    $('#tab-content').innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div><h2>${t('正在重构总设定…')}</h2></div>`;
    try {
      const backup = d.concept.members;
      const c = d.concept;
      const chosen = { name: c.name, concept: c.concept, worldHint: c.worldview || '', vibe: c.vibe || '', mainColor: c.mainColor || '', twist: c.originReason || '' };
      const result = await api.stage('concept', { ...d.input, chosen, feedback });
      Object.assign(d.concept, result);
      d.concept.members = backup;
      await save(group); toast(t('总设定已重构'));
    } catch (e) { toast(t('生成失败：') + e.message, 3000); }
    if (G === group) renderTab();
    return;
  }

  const names = { relations: t('关系网络'), story: t('故事线'), operations: t('运营方案') };
  if (!(await confirmModal(t('重新生成{name}', { name: names[moduleKey] }), t('将基于当前的团队概念和成员设定，重新创作整个{name}模块，原内容会被替换。', { name: names[moduleKey] })))) return;
  if (G !== group) return;
  await generateModule(moduleKey, t('正在重新创作{name}…', { name: names[moduleKey] }));
}

// 生成 / 重做 关系、故事线、运营方案（单人偶像没有关系网络，用空结构兜底）
async function generateModule(moduleKey, title) {
  const group = G;
  const d = group.data;
  const relations = d.relations || { overview: '', pairs: [] };
  $('#tab-content').innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div><h2>${esc(title)}</h2><p class="muted">${t('约 1-2 分钟')}</p></div>`;
  try {
    const payloads = {
      relations: { concept: d.concept, members: d.members },
      story: { concept: d.concept, members: d.members, relations },
      operations: { concept: d.concept, members: d.members, relations, story: d.story || null, positioning: d.input?.positioning, audience: d.input?.audience },
    };
    d[moduleKey] = await api.stage(moduleKey, payloads[moduleKey]);
    await save(group); toast(t('已更新'));
  } catch (e) { toast(t('生成失败：') + e.message, 3000); }
  if (G === group) renderTab();
}

// ── Tab 导航 ──
function renderTabNav() {
  const nav = $('#ws-tabs-main');
  if (!nav) return;
  nav.innerHTML = TABS.map(([k, label]) => `<button class="tab ${k === currentTab ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('')
    + `<a class="tab" href="${esc(visualHref())}">${t('视觉车间')} ↗</a>`;
}

// ── 各标签页渲染 ──
function renderTab() {
  renderSidebar();
  renderTabNav();
  const el = $('#tab-content');
  el.dataset.tab = currentTab;
  const d = G.data;

  if (currentTab === 'people') {
    renderMemberCards(el, d.members[activeMember], activeMember);
  } else if (currentTab === 'world') {
    renderWorldTab(el, d);
  } else if (currentTab === 'plan') {
    renderPlanTab(el, d);
  } else if (currentTab === 'story') {
    if (!d.story) return renderEmptyModule(el, 'story');
    const s = d.story;
    el.innerHTML = `<div class="card${isPending('story') ? ' node-pending' : ''}">
      ${nodeHead(t('故事前提'), 'story', { regen: 'story' })}
      <p style="font-size:16px;line-height:1.8">${esc(s.premise)}</p></div>
    <div class="cols-2"><div class="card"><dl>${fRow(t('团队目标'), 'story.goal')}${fRow(t('主要矛盾'), 'story.mainConflict')}${fRow(t('敌对势力'), 'story.antagonist')}
      ${fRow(t('成长主线'), 'story.mainArc')}${fRow(t('团体危机'), 'story.teamCrisis')}${fRow(t('舞台任务'), 'story.stageMissions')}${fRow(t('粉丝参与'), 'story.fanMechanic')}</dl></div>
    <div class="card"><h3 style="margin-top:0">${t('成员个人线')}</h3>${(s.memberArcs || []).map((a) => `
      <p style="margin-bottom:8px"><b style="color:${esc(memberColor(a.codename))}">${esc(a.codename)}</b>：${esc(a.arc)}</p>`).join('')}</div></div>
    <div class="card"><h3 style="margin-top:0">${t('第一季剧情')}</h3><ul class="ep-list">${(s.season1 || []).map((e) => `
      <li><span class="ep-no">EP${e.ep}</span><div><b>${esc(e.title)}</b> — ${esc(e.summary)}</div></li>`).join('')}</ul></div>`;
  }
}

// 队内定位 → K-pop 编辑式小标（用于人像页副标题）
const ARCH_EN = [
  [/队长|leader/i, 'LEADER'],
  [/主唱|main\s*voc/i, 'MAIN VOCAL'],
  [/副唱|vocal/i, 'VOCALIST'],
  [/主舞|main\s*danc/i, 'MAIN DANCER'],
  [/领舞|lead\s*danc/i, 'LEAD DANCER'],
  [/rap|说唱|饶舌/i, 'RAPPER'],
  [/门面|颜值|visual/i, 'VISUAL'],
  [/中心|center/i, 'CENTER'],
  [/团宠|忙内|maknae/i, 'MAKNAE'],
  [/全能|all/i, 'ALL-ROUNDER'],
  [/氛围|mood/i, 'MOOD MAKER'],
  [/治愈|heal/i, 'HEALER'],
];
const archEn = (a) => { for (const [re, en] of ARCH_EN) if (re.test(a || '')) return en; return ''; };

// ── 世界观 Tab（顶级，与人物设定平级） ──
function renderWorldTab(el, d) {
  const c = d.concept;
  el.innerHTML = `<div class="ed-spread ed-spread-text">
    <div class="ed-topline">
      <span class="ed-kicker">STARFORM / UNIVERSE</span>
      <span class="ed-index">${t('世界观 · 总设定')}　<button class="ed-regen-link" data-regen="concept" title="${t('重新生成总设定')}">🔄</button></span>
    </div>
    <p class="ed-lead">${esc(c.worldview || t('尚未设定世界观'))}</p>
    <div class="ed-detail">
      <div class="ed-detail-col"><div class="ed-block">
        <div class="ed-sub-kicker">${t('团体档案')}</div>
        <dl class="ed-fields">
          ${fRow(t('团名'), 'concept.name', { rename: '团名' })}
          ${fRow(t('核心概念'), 'concept.concept')}
          ${fRow(t('名称含义'), 'concept.nameMeaning')}
          ${fRow(t('成立原因'), 'concept.originReason')}
        </dl>
      </div></div>
      <div class="ed-detail-col"><div class="ed-block">
        <div class="ed-sub-kicker">${t('气质 · 视觉 · 音乐')}</div>
        <dl class="ed-fields">
          ${fRow(t('整体气质'), 'concept.vibe')}
          ${fRow(t('情绪价值'), 'concept.emotionalValue')}
          ${fRow(t('视觉风格'), 'concept.visualStyle')}
          ${fRow(t('音乐风格'), 'concept.musicStyle')}
        </dl>
      </div></div>
      <div class="ed-detail-col"><div class="ed-block">
        <div class="ed-sub-kicker">${t('粉丝 · 应援')}</div>
        <dl class="ed-fields">
          ${fRow(t('粉丝称呼'), 'concept.fandomName', { rename: '粉丝称呼' })}
          ${fRow(t('团体口号'), 'concept.slogan')}
          <div class="f-row"><dt>${t('代表色')}</dt><dd><span class="dot" style="background:${esc(c.mainColor)}"></span> ${esc(c.mainColor)}</dd></div>
        </dl>
      </div></div>
    </div>
  </div>`;
}

// ── 人物设定 Tab（杂志编辑部版式） ──
function renderMemberCards(el, m, i) {
  const group = G;
  const d = G.data;
  const c = d.concept;
  const mKey = `members.${i}`;
  const locked = isLocked(mKey);
  const pending = isPending(mKey);
  const personality = Array.isArray(m.personality) ? m.personality : String(m.personality || '').split(/[,，、]/).filter(Boolean);
  const en = archEn(m.archetype);
  const meta = [m.archetype, m.ageFeel, m.gender].filter(Boolean).join('　·　');
  const oneLine = m.oneLine || (c.members[i] && c.members[i].oneLine) || '';
  const prof = m.profile;
  const statItem = (k, v) => v ? `<div class="ed-stat"><span class="ed-stat-k">${esc(k)}</span><span class="ed-stat-v">${esc(v)}</span></div>` : '';
  const statHtml = prof
    ? `<div class="ed-stats">
        ${statItem(t('担当'), prof.position)}${statItem(t('生日'), [prof.birthday, prof.zodiac].filter(Boolean).join(' · '))}
        ${statItem(t('身高'), [prof.height, prof.weight].filter(Boolean).join(' / '))}${statItem(t('血型'), prof.bloodType)}
        ${statItem('MBTI', prof.mbti)}${statItem(t('惯用手'), prof.handedness)}
        ${statItem(t('队内爱称'), prof.nickname)}${statItem(t('应援色'), prof.lightstickColor)}
      </div>`
    : `<button class="btn btn-ghost btn-sm ed-gen-profile" data-gen-profile="${i}">✦ ${t('补全艺人资料卡（担当 / 生日 / 身高 / MBTI…）')}</button>`;
  const realName = prof?.realName && prof.realName !== m.codename ? prof.realName : (m.fullName && m.fullName !== m.codename ? m.fullName : '');
  const h = (d.history || [])[i];
  const bioTrigger = h
    ? `<button class="ed-bio-open" data-bio="${i}">📖 ${t('完整成长经历')}</button>`
    : `<button class="ed-bio-open ed-bio-gen" data-gen-one="${i}">✦ ${t('生成 {name} 的成长经历', { name: esc(m.codename) })}</button>`;

  const imgs = G.images.filter((x) => x.member === m.codename && !x.archived);
  const primary = imgs.find((x) => x.isPrimary) || imgs[0];

  el.innerHTML = `<div class="mc" style="--mc:${esc(m.color)}">
    <div class="mc-top">
      <div class="card mc-photo">
        <div class="mc-photo-main">
          ${primary ? `<img src="${esc(primary.url)}" alt="">` : `<div class="mc-photo-ph"><span>✦</span><p>${t('还没有形象图')}</p></div>`}
        </div>
        <div class="mc-photo-bar">
          <button class="btn btn-sm" id="mc-upload">↑ ${t('上传')}</button>
          <a class="btn btn-sm" href="${esc(visualHref(m.codename))}" title="${t('在视觉车间为TA生成形象')}">✦ ${t('生成形象')} ↗</a>
          ${!locked ? `<button class="btn btn-sm" data-regen="${esc(mKey)}" title="${t('重构人设')}">🔄 ${t('重构')}</button>` : ''}
          <span class="mc-bar-sp"></span>
          <button class="btn btn-sm" data-lock="${esc(mKey)}">${locked ? '🔓' : '🔒'}</button>
          <button class="btn btn-sm${pending ? ' node-act-pend' : ''}" data-pending="${esc(mKey)}">${pending ? '✅' : '🏷'}</button>
        </div>
        ${imgs.length > 1 ? `<div class="mc-gallery">${imgs.map((im) => `<div class="mc-thumb${im.isPrimary ? ' on' : ''}" data-img="${esc(im.id)}" data-url="${esc(im.url)}">
          <img src="${esc(im.url)}" loading="lazy" alt="">
          ${im.isPrimary ? `<span class="mc-thumb-tag">${t('主图')}</span>` : `<button class="mc-thumb-set" data-primary>${t('设为主图')}</button>`}
          ${im.isPrimary ? '' : `<button class="mc-thumb-del" data-del title="${t('归档')}">×</button>`}
        </div>`).join('')}</div>` : ''}
      </div>
      <div class="card mc-id">
        <div class="ed-id-top">
          ${en ? `<span class="ed-en">${esc(en)}</span>` : ''}
          <span class="ed-member-index"><span>${String(i + 1).padStart(2, '0')}</span> / ${String(d.members.length).padStart(2, '0')}</span>
        </div>
        <h1 class="ed-name">${esc(m.codename)}${realName ? `<span class="ed-realname">${esc(realName)}</span>` : ''}${!locked ? `<button class="ed-rename" data-rename="${esc(mKey)}.codename" data-kind="成员艺名" data-gender="${esc(m.gender || '')}" data-target="${esc(personality.join('、'))}" title="${t('AI 起名')}">🪄</button>` : ''}</h1>
        <div class="ed-meta">${esc(meta)}${pending ? `　·　<span class="ed-pend">${t('待处理')}</span>` : ''}</div>
        ${oneLine ? `<p class="ed-tagline">“${esc(oneLine)}”</p>` : ''}
        ${statHtml}
        ${personality.length ? `<div class="ed-tags">${personality.slice(0, 5).map((t) => `<span class="ed-tag">${esc(t.trim())}</span>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="card mc-set">
      <div class="ed-detail ed-detail-2">
        <div class="ed-detail-col">
          <div class="ed-block">
            <div class="ed-sub-kicker">${t('才能与性格')}</div>
            <dl class="ed-fields">
              ${fRow(t('才能'), `${mKey}.talent`)}${fRow(t('成长故事'), `${mKey}.growthArc`)}${fRow(t('反差魅力'), `${mKey}.contrast`)}
              ${fRow(t('魅力看点'), `${mKey}.fanAppeal`)}${fRow(t('声音'), `${mKey}.voice`)}${fRow(t('说话方式'), `${mKey}.speechStyle`)}
            </dl>
            ${bioTrigger}
          </div>
        </div>
        <div class="ed-detail-col">
          <div class="ed-block">
            <div class="ed-sub-kicker">${t('外形与造型')}</div>
            <dl class="ed-fields">
              ${fRow(t('气质'), `${mKey}.appearance.face`)}${fRow(t('发型'), `${mKey}.appearance.hair`)}${fRow(t('日常穿搭'), `${mKey}.fashion`)}
              ${fRow(t('舞台造型'), `${mKey}.stageOutfit`)}${fRow(t('标志配饰'), `${mKey}.accessories`)}
            </dl>
          </div>
          <div class="ed-block">
            <div class="ed-sub-kicker">${t('癖好 · 内在')}</div>
            <dl class="ed-fields">${fRow(t('兴趣爱好'), `${mKey}.hobbies`)}${fRow(t('小缺点'), `${mKey}.flaw`)}${fRow(t('秘密'), `${mKey}.secret`)}</dl>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // 二级事件（一级 data-edit/roll/rename/regen/lock/pending 由 #tab-content 上的 onFieldAction 处理）
  el.querySelectorAll('[data-gen-one]').forEach((b) => b.onclick = () => generateHistory(Number(b.dataset.genOne)));
  el.querySelectorAll('[data-gen-profile]').forEach((b) => b.onclick = () => generateProfile(Number(b.dataset.genProfile)));
  el.querySelectorAll('[data-bio]').forEach((b) => b.onclick = () => openBioModal(Number(b.dataset.bio)));

  // 形象图：上传 / 生成 / 设主图 / 删除
  const reload = async () => {
    const updated = await api.groups.get(group.id);
    if (G === group) { G = updated; renderTab(); }
  };
  const upBtn = el.querySelector('#mc-upload');
  if (upBtn) upBtn.onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) return toast(t('图片超过 15MB'));
      const rd = new FileReader();
      rd.onload = async () => { try { await api.images.upload(group.id, m.codename, rd.result); toast(t('已上传')); await reload(); } catch (e) { toast(t('上传失败：') + e.message, 3000); } };
      rd.readAsDataURL(f);
    };
    inp.click();
  };
  if (primary) el.querySelector('.mc-photo-main img')?.addEventListener('click', () => lightbox(primary.url));
  el.querySelector('.mc-gallery')?.addEventListener('click', async (e) => {
    const th = e.target.closest('.mc-thumb'); if (!th) return;
    try {
      if (e.target.closest('[data-primary]')) { await api.images.setPrimary(th.dataset.img); toast(t('已设为主图')); return reload(); }
      if (e.target.closest('[data-del]')) { await api.images.archive(th.dataset.img, true); toast(t('已归档，可在视觉车间的归档区恢复或删除')); return reload(); }
    } catch (err) { return toast(t('操作失败：') + err.message, 3000); }
    lightbox(th.dataset.url);
  });
}

// ── 个人经历（成团后补充） ──
function renderHistoryTab(el) {
  const d = G.data;
  const prog = d.progress || {};
  if (!d.history || !d.history.length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:48px 26px">
      <div class="en-label">BIOGRAPHY</div>
      <h2>${t('补充成员个人经历')}</h2>
      <p class="sub" style="max-width:520px;margin:8px auto 22px">${t('为每位成员生成成长背景、入团经历、与队友的初遇、重要事件和日常切片——让粉丝能完整讲出TA的故事，也是后续内容运营的素材库。')}</p>
      <button class="btn btn-primary btn-big" id="btn-gen-history">✦ ${t('生成全员经历')}</button>
    </div>`;
    $('#btn-gen-history').onclick = () => generateHistory();
    return;
  }
  el.innerHTML = `<div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><b>${t('经历确认')}</b><div class="muted">${t('每位成员可单独重做（🎲），字段可直接编辑（✏️）。确认后作为内容运营的依据。')}</div></div>
    ${prog.history
      ? `<span class="badge" style="background:var(--ok);color:#fff">✔ ${t('已确认')}</span><button class="btn btn-ghost btn-sm" data-prog="history" data-v="0">${t('取消确认')}</button>`
      : `<button class="btn btn-primary" data-prog="history" data-v="1">✔ ${t('经历已确认')}</button>`}
  </div>
  <div class="cols-2">${d.members.map((m, i) => {
    const h = d.history[i];
    if (!h) return `<div class="card"><h3 style="margin-top:0;color:${esc(m.color)}">${esc(m.codename)}</h3>
      <button class="btn btn-ghost btn-sm" data-gen-one="${i}">✦ ${t('生成TA的经历')}</button></div>`;
    const hKey = `history.${i}`;
    const hLocked = isLocked(hKey);
    const hPending = isPending(hKey);
    return `<div class="card${hPending ? ' node-pending' : ''}">
      <div class="module-head node-head">
        <h3 style="margin-top:0;color:${esc(m.color)}">${t('{name} 的经历', { name: esc(m.codename) })}
          ${hPending ? `<span class="node-tag node-tag-pend">${t('待处理')}</span>` : ''}
          ${hLocked  ? '<span class="node-tag node-tag-lock">🔒</span>' : ''}
        </h3>
        <div class="node-acts">
          ${!hLocked ? `<button class="btn btn-ghost btn-sm" data-gen-one="${i}">🎲 ${t('重做')}</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-lock="${hKey}" title="${hLocked ? t('解锁') : t('锁定')}">${hLocked ? '🔓' : '🔒'}</button>
          <button class="btn btn-ghost btn-sm${hPending ? ' node-act-pend' : ''}" data-pending="${hKey}" title="${hPending ? t('取消待处理') : t('标记待处理')}">${hPending ? '✅' : '🏷'}</button>
        </div>
      </div>
      <dl>${fRow(t('成长背景'), `${hKey}.background`)}${fRow(t('转折点'), `${hKey}.turning`)}
      ${fRow(t('入团经历'), `${hKey}.joining`)}${fRow(t('队友初遇'), `${hKey}.firstMeet`)}
      ${(h.milestones || []).map((ms, j) => fRow(ms.title || t('事件{n}', { n: j + 1 }), `${hKey}.milestones.${j}.desc`)).join('')}
      ${fRow(t('梦想与恐惧'), `${hKey}.dream`)}${fRow(t('日常切片'), `${hKey}.dailyLife`)}</dl>
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-prog]').forEach((b) => b.onclick = () => setProgress(b.dataset.prog, b.dataset.v === '1'));
  el.querySelectorAll('[data-gen-one]').forEach((b) => b.onclick = () => generateHistory(Number(b.dataset.genOne)));
}

// 成长经历浮动页（只读展示 + 重写入口）
function openBioModal(i) {
  const d = G.data;
  const m = d.members[i];
  const h = (d.history || [])[i];
  if (!h) return;
  const row = (label, val) => val ? `<div class="bio-row"><dt>${esc(label)}</dt><dd>${esc(val)}</dd></div>` : '';
  const ms = (h.milestones || []).map((x) => row(x.title || t('事件'), x.desc)).join('');
  const close = modal(`<div class="bio-modal" style="--mc:${esc(m.color)}">
    <div class="bio-modal-head">
      <div><div class="en-label" style="margin:0">BIOGRAPHY</div><h2 style="margin:2px 0 0">${t('{name} · 成长经历', { name: esc(m.codename) })}</h2></div>
      <button class="btn btn-ghost btn-sm" id="bio-regen">🎲 ${t('重写')}</button>
    </div>
    <dl class="bio-dl">
      ${row(t('成长背景'), h.background)}
      ${row(t('转折点'), h.turning)}
      ${row(t('入团经历'), h.joining)}
      ${row(t('队友初遇'), h.firstMeet)}
      ${ms}
      ${row(t('梦想与恐惧'), h.dream)}
      ${row(t('日常切片'), h.dailyLife)}
    </dl>
    <div class="m-foot"><button class="btn btn-primary" id="bio-close">${t('完成')}</button></div>
  </div>`, {
    onMount: (mask) => {
      mask.querySelector('#bio-close').onclick = () => close();
      mask.querySelector('#bio-regen').onclick = () => { close(); generateHistory(i); };
    },
  });
}

async function generateProfile(i) {
  const group = G;
  const d = group.data;
  const m = d.members[i];
  toast(t('正在补全 {name} 的艺人资料…', { name: m.codename }), 60000);
  try {
    const prof = await api.stage('profile', { concept: d.concept, member: m });
    d.members[i].profile = prof;
    await save(group);
    $('.toast')?.remove();
    toast(t('{name} 资料卡已生成', { name: m.codename }));
  } catch (e) {
    $('.toast')?.remove();
    toast(t('生成失败：') + e.message, 3500);
  }
  if (G === group) renderTab();
}

async function generateHistory(onlyIndex = null) {
  const group = G;
  const el = $('#tab-content');
  const d = group.data;
  el.innerHTML = `<div class="card" style="text-align:center;padding:50px"><div class="spinner" style="width:30px;height:30px;border-width:4px;margin:0 auto 14px"></div>
    <h2 id="hist-status">${onlyIndex === null ? t('正在书写全员经历…') : t('正在书写{name} 的经历…', { name: esc(d.members[onlyIndex].codename) })}</h2>
    <p class="muted">${t('约 1-2 分钟')}</p></div>`;
  try {
    const targets = d.members.map((m, i) => ({ m, i })).filter((x) => onlyIndex === null || x.i === onlyIndex);
    let done = 0;
    await mapLimit(targets, 3, async ({ m, i }) => {
      const h = await api.stage('history', {
        concept: d.concept, member: m,
        teammates: d.members.filter((_, j) => j !== i).map((t) => t.codename),
        relationsOverview: d.relations?.overview || '',
      });
      if (!d.history) d.history = [];
      d.history[i] = h;
      done++;
      const st = G === group ? $('#hist-status') : null;
      if (st && targets.length > 1) st.textContent = t('正在书写全员经历…（{done}/{total}）', { done, total: targets.length });
    });
    await save(group);
    toast(t('经历已生成'));
  } catch (e) {
    toast(t('生成失败：') + e.message, 3500);
  }
  if (G === group) renderTab();
}

// 故事线 / 运营方案尚未生成时的引导
function renderEmptyModule(el, key) {
  const info = {
    story: { en: 'STORY', title: t('故事宇宙'), desc: t('基于团队概念、成员秘密和关系，生成可连载的故事主线、成员个人线和第一季剧情。') },
    operations: { en: 'OPERATIONS PLAN', title: t('运营方案'), desc: t('生成首支单曲、直播与短视频栏目、海报创意和周边方向——AI 排期和团体海报都会用到它。') },
  }[key];
  el.innerHTML = `<div class="card" style="text-align:center;padding:48px 26px">
    <div class="en-label">${info.en}</div>
    <h2>${info.title}</h2>
    <p class="sub" style="max-width:520px;margin:8px auto 22px">${info.desc}</p>
    <button class="btn btn-primary btn-big" id="btn-gen-module">✦ ${t('生成{name}', { name: info.title })}</button>
  </div>`;
  $('#btn-gen-module').onclick = () => generateModule(key, t('正在生成{name}…', { name: info.title }));
}

// ── 运营方案 Tab ──
function renderPlanTab(el, d) {
  const o = d.operations;
  if (!o) return renderEmptyModule(el, 'operations');
  const items = (key, label) => (o[key] || []).map((x, i) => fRow(x.name || `${label} ${i + 1}`, `operations.${key}.${i}.${x.format !== undefined ? 'format' : 'desc'}`)).join('');
  el.innerHTML = `<div class="card${isPending('operations') ? ' node-pending' : ''}">
      ${nodeHead(t('首支单曲'), 'operations', { regen: 'operations' })}
      <dl>${fRow(t('单曲名'), 'operations.debutSingle.title')}${fRow(t('歌曲概念'), 'operations.debutSingle.concept')}${fRow(t('MV 概念'), 'operations.debutSingle.mvConcept')}</dl>
    </div>
    <div class="cols-2">
      <div class="card"><h3 style="margin-top:0">${t('直播栏目')}</h3><dl>${items('liveShows', t('直播栏目'))}</dl></div>
      <div class="card"><h3 style="margin-top:0">${t('短视频栏目')}</h3><dl>${items('shortVideoColumns', t('短视频栏目'))}</dl></div>
    </div>
    <div class="cols-2">
      <div class="card"><h3 style="margin-top:0">${t('海报创意')}</h3><dl>${items('posterIdeas', t('海报创意'))}</dl></div>
      <div class="card"><h3 style="margin-top:0">${t('周边')}</h3><dl>${items('merch', t('周边'))}</dl></div>
    </div>
    <div class="card"><dl>
      ${(o.memberAccounts || []).map((a, i) => fRow(t('{name} 个人号', { name: a.codename }), `operations.memberAccounts.${i}.style`)).join('')}
      ${fRow(t('粉丝互动'), 'operations.fanInteraction')}${fRow(t('表情包方向'), 'operations.memeDirection')}
      ${fRow(t('剧情短片'), 'operations.dramaShorts')}${fRow(t('舞台演出'), 'operations.stageShow')}${fRow(t('节日活动'), 'operations.festivalIdeas')}
      ${fRow(t('商业文案'), 'operations.pitchCopy')}${fRow(t('对外介绍'), 'operations.productDescription')}
    </dl></div>`;
}

async function setProgress(key, val) {
  const group = G;
  group.data.progress = { ...(group.data.progress || {}), [key]: val };
  await save(group);
  toast(val ? t('已确认') : t('已取消确认'));
  if (G === group) renderTab();
}

function memberColor(codename) {
  return G.data.concept.members.find((m) => codename?.includes(m.codename))?.color || 'var(--brand-a)';
}

function promptBlock(text) {
  if (!text) return '';
  return `<div class="prompt-block">${esc(text)}<button class="copy-btn" data-text="${esc(text)}">${t('复制')}</button></div>`;
}
