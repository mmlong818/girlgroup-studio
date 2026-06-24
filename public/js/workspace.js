// 企划工作台 — 浏览 / 编辑 / 重roll / 导出
import { api, mapLimit } from './api.js';
import { $, $$, esc, toast, modal, confirmModal, copyText, download, getPath, setPath } from './ui.js';
import { appConfig } from './main.js';
import { buildMarkdown } from './markdown.js';
import { showGroupCard } from './card.js';
import { openRename } from './rename.js';

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
  G.data.locks = G.data.locks || {};
  G.data.locks[key] = !G.data.locks[key];
  await save(); renderTab();
}

async function togglePending(key) {
  G.data.pending = G.data.pending || {};
  G.data.pending[key] = !G.data.pending[key];
  await save(); renderTab();
}

const TABS = [
  ['people', '人物设定'],
  ['world', '世界观'],
  ['story', '故事宇宙'],
];

export async function renderWorkspace(app, id, initialTab = 'people') {
  app.innerHTML = `<div class="empty-state"><div class="big">⏳</div>加载中…</div>`;
  try {
    G = await api.groups.get(id);
  } catch (e) {
    app.innerHTML = `<div class="empty-state">加载失败：${esc(e.message)}<br><br><button class="btn btn-ghost" onclick="location.hash=''">返回</button></div>`;
    return;
  }
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
    const btn = e.target.closest('.tab');
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
    <button class="side-app" id="side-home" title="返回我的企划"><img class="brand-logo" src="/logo-mark.png" alt="成团"></button>
    <div class="side-team">
      <div class="side-name"><span class="ws-dot"></span>${esc(c.name)}</div>
      <div class="side-meta">${d.members.length} 人${c.fandomName ? ` · ${esc(c.fandomName)}` : ''}</div>
      ${c.vibe ? `<div class="side-vibes">${vibeBadges(c.vibe)}</div>` : ''}
    </div>
    <div class="side-sec">成员</div>
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
      <a class="btn side-primary" href="/g/${esc(G.shareId)}" target="_blank">出道页 ↗</a>
      <button class="btn side-btn" id="side-share">分享 / 导出 ▾</button>
      <a class="btn side-ops" href="#/ops/${esc(G.id)}">运营中心 →</a>
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
  const close = modal(`<h3>分享 / 导出</h3>
    <div class="share-menu">
      <button class="btn btn-ghost" data-s="link">🔗 复制对外链接</button>
      <button class="btn btn-ghost" data-s="card">🪪 生成成团卡</button>
      <button class="btn btn-ghost" data-s="md">📄 导出企划书 (.md)</button>
      <button class="btn btn-ghost" data-s="json">⤓ 导出数据 (.json)</button>
    </div>`, {
    onMount: (mask) => {
      const act = {
        link: () => copyText(`${location.origin}/g/${G.shareId}`),
        card: () => showGroupCard(G),
        md: () => download(`${G.data.concept.name}-企划书.md`, buildMarkdown(G.data), 'text/markdown;charset=utf-8'),
        json: () => download(`${G.data.concept.name}-数据.json`, JSON.stringify(G.data, null, 2), 'application/json;charset=utf-8'),
      };
      mask.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { act[b.dataset.s](); close(); });
    },
  });
}

async function save() {
  await api.groups.update(G.id, G.data);
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
    cta = `<button class="btn btn-primary btn-sm" id="nav-gen-history">✦ 生成全员经历</button>`;
  } else if (!prog.visual) {
    cta = `<button class="btn btn-primary btn-sm" id="nav-go-visual">为成员选定主图 →</button>`;
  } else {
    cta = `<span class="nav-celebrate">✓ 全员就位</span>`;
  }
  aside.innerHTML = `${cta}<a class="btn btn-ghost btn-sm" href="#/ops/${esc(G.id)}">运营中心 →</a>`;
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
      <button class="f-act" title="编辑" data-edit="${esc(path)}" data-label="${esc(label)}">✏️</button>
      ${rename ? `<button class="f-act" title="AI 起名（8 个候选）" data-rename="${esc(path)}" data-kind="${esc(rename)}">🪄</button>` : ''}
      ${rollable ? `<button class="f-act" title="AI 重新生成这一项" data-roll="${esc(path)}" data-label="${esc(label)}">🎲</button>` : ''}
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
  const path = btn.dataset.rename;
  openRename({
    kind: btn.dataset.kind,
    context: rollContext(),
    current: getPath(G.data, path),
    gender: btn.dataset.gender || '',
    target: btn.dataset.target || '',
    existing: [G.data.concept.name, ...G.data.concept.members.map((m) => m.codename)],
    onPick: async (name) => {
      setPath(G.data, path, name);
      // 同步骨架里的艺名，保持全局一致
      const m = path.match(/^members\.(\d+)\.codename$/);
      if (m && G.data.concept.members[m[1]]) G.data.concept.members[m[1]].codename = name;
      if (path === 'concept.name') $('.ws-banner h1').textContent = name;
      await save();
      toast('已更名');
      renderTab();
    },
  });
}

function editField(path, label) {
  const v = getPath(G.data, path);
  const isArr = Array.isArray(v);
  const text = isArr ? v.join('\n') : String(v ?? '');
  modal(`<h3>编辑 · ${esc(label)}</h3>
    ${isArr ? '<p class="muted">每行一项</p>' : ''}
    <textarea id="edit-ta" rows="${Math.min(10, Math.max(3, Math.ceil(text.length / 40)))}">${esc(text)}</textarea>
    <div class="m-foot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-primary" data-ok>保存</button></div>`,
    { onMount: (mask, close) => {
      $('[data-x]', mask).onclick = close;
      $('[data-ok]', mask).onclick = async () => {
        const nv = $('#edit-ta', mask).value.trim();
        setPath(G.data, path, isArr ? nv.split('\n').map((s) => s.trim()).filter(Boolean) : nv);
        await save();
        close();
        toast('已保存');
        renderTab();
      };
    } });
}

function rollField(path, label) {
  const segs = path.split('.');
  const fieldKey = segs[segs.length - 1];
  const target = segs[0] === 'members' ? G.data.members[Number(segs[1])] : getPath(G.data, segs.slice(0, -1).join('.'));
  const currentValue = getPath(G.data, path);

  const close = modal(`<h3>🎲 重新生成 · ${esc(label)}</h3>
    <div class="reroll-old">${esc(Array.isArray(currentValue) ? currentValue.join('、') : currentValue)}</div>
    <div class="reroll-preview" id="rr-preview"><span class="spinner"></span> AI 创作中…</div>
    <label class="field"><input type="text" id="rr-hint" placeholder="（可选）提点要求，例如：更可爱一点 / 跟音乐有关"></label>
    <div class="m-foot">
      <button class="btn btn-ghost" data-x>取消</button>
      <button class="btn btn-ghost" data-again disabled>🎲 再来一次</button>
      <button class="btn btn-primary" data-ok disabled>✔ 采用</button>
    </div>`,
    { onMount: (mask, closeFn) => {
      let newValue = null;
      const run = async () => {
        $('#rr-preview', mask).innerHTML = '<span class="spinner"></span> AI 创作中…';
        $('[data-ok]', mask).disabled = true;
        $('[data-again]', mask).disabled = true;
        try {
          const r = await api.stage('reroll', {
            context: rollContext(), target, fieldKey, fieldLabel: label,
            currentValue, hint: $('#rr-hint', mask).value.trim(),
          });
          newValue = r.value;
          $('#rr-preview', mask).textContent = Array.isArray(newValue) ? newValue.join('、') : String(newValue);
        } catch (err) {
          $('#rr-preview', mask).textContent = '生成失败：' + err.message;
        }
        $('[data-ok]', mask).disabled = newValue == null;
        $('[data-again]', mask).disabled = false;
      };
      $('[data-x]', mask).onclick = closeFn;
      $('[data-again]', mask).onclick = run;
      $('[data-ok]', mask).onclick = async () => {
        if (Array.isArray(currentValue) && !Array.isArray(newValue)) newValue = String(newValue).split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean);
        setPath(G.data, path, newValue);
        await save();
        closeFn();
        toast('已采用新设定');
        renderTab();
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
      ${pending ? '<span class="node-tag node-tag-pend">待处理</span>' : ''}
      ${locked  ? '<span class="node-tag node-tag-lock">🔒</span>' : ''}
    </h3>
    <div class="node-acts">
      ${regen && !locked ? `<button class="btn btn-ghost btn-sm" data-regen="${regen}">🔄 重构</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-lock="${key}" title="${locked ? '解锁' : '锁定'}">${locked ? '🔓' : '🔒'}</button>
      <button class="btn btn-ghost btn-sm${pending ? ' node-act-pend' : ''}" data-pending="${key}" title="${pending ? '取消待处理' : '标记待处理'}">${pending ? '✅' : '🏷'}</button>
    </div>
  </div>`;
}

// ── 模块级重新生成 ──
function feedbackModal(title, subtitle, hintPlaceholder) {
  return new Promise((resolve) => {
    modal(`<h3>${title}</h3>
      ${subtitle ? `<p class="muted">${subtitle}</p>` : ''}
      <label class="field"><input type="text" id="fb-hint" placeholder="${esc(hintPlaceholder)}"></label>
      <div class="m-foot">
        <button class="btn btn-ghost" data-x>取消</button>
        <button class="btn btn-primary" data-ok>🔄 开始重构</button>
      </div>`,
      { onMount: (mask, closeFn) => {
        $('[data-x]', mask).onclick = () => { resolve(null); closeFn(); };
        $('[data-ok]', mask).onclick = () => { resolve($('#fb-hint', mask).value.trim()); closeFn(); };
      } });
  });
}

async function regenModule(moduleKey) {
  const d = G.data;

  if (moduleKey.startsWith('members.')) {
    const idx = Number(moduleKey.split('.')[1]);
    const sk = d.concept.members[idx];
    const feedback = await feedbackModal(`🔄 重构「${sk.codename}」`, '重新生成该成员完整档案，当前内容将被覆盖。', '方向提示（可选），例如：更内敛 / 加入舞者背景');
    if (feedback === null) return;
    $('#tab-content').innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div><h2>正在重构「${esc(sk.codename)}」…</h2></div>`;
    try {
      d.members[idx] = await api.stage('member', { concept: d.concept, allMembers: d.concept.members, member: sk, feedback });
      await save(); toast(`${sk.codename} 档案已重构`);
    } catch (e) { toast('生成失败：' + e.message, 3000); }
    return renderTab();
  }

  if (moduleKey === 'concept') {
    const feedback = await feedbackModal('🔄 重构总设定', '重新生成团体设定，成员阵容结构保持不变。', '方向提示（可选），例如：更暗黑 / 加入电子朋克元素');
    if (feedback === null) return;
    $('#tab-content').innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div><h2>正在重构总设定…</h2></div>`;
    try {
      const backup = d.concept.members;
      const result = await api.stage('concept', { input: d.input, chosen: { name: d.concept.name, concept: d.concept.concept, vibe: d.concept.vibe }, feedback });
      Object.assign(d.concept, result);
      d.concept.members = backup;
      await save(); toast('总设定已重构');
    } catch (e) { toast('生成失败：' + e.message, 3000); }
    return renderTab();
  }

  const names = { relations: '关系网络', story: '故事线', operations: '运营方案' };
  if (!(await confirmModal(`重新生成${names[moduleKey]}`, `将基于当前的团队概念和成员设定，重新创作整个${names[moduleKey]}模块，原内容会被替换。`))) return;
  const el = $('#tab-content');
  el.innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div><h2>正在重新创作${names[moduleKey]}…</h2></div>`;
  try {
    const payloads = {
      relations: { concept: d.concept, members: d.members },
      story: { concept: d.concept, members: d.members, relations: d.relations },
      operations: { concept: d.concept, members: d.members, relations: d.relations, story: d.story, positioning: d.input?.positioning, audience: d.input?.audience },
    };
    d[moduleKey] = await api.stage(moduleKey, payloads[moduleKey]);
    await save(); toast('已更新');
  } catch (e) { toast('生成失败：' + e.message, 3000); }
  renderTab();
}

// ── Tab 导航 ──
function renderTabNav() {
  const nav = $('#ws-tabs-main');
  if (!nav) return;
  nav.innerHTML = TABS.filter(([k]) => k !== 'story' || G.data.story)
    .map(([k, label]) => `<button class="tab ${k === currentTab ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('');
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
  } else if (currentTab === 'story') {
    if (!d.story) { el.innerHTML = '<div class="card"><p class="muted">暂无故事线。</p></div>'; return; }
    const s = d.story;
    el.innerHTML = `<div class="card${isPending('story') ? ' node-pending' : ''}">
      ${nodeHead('故事前提', 'story', { regen: 'story' })}
      <p style="font-size:16px;line-height:1.8">${esc(s.premise)}</p></div>
    <div class="cols-2"><div class="card"><dl>${fRow('团队目标', 'story.goal')}${fRow('主要矛盾', 'story.mainConflict')}${fRow('敌对势力', 'story.antagonist')}
      ${fRow('成长主线', 'story.mainArc')}${fRow('团体危机', 'story.teamCrisis')}${fRow('舞台任务', 'story.stageMissions')}${fRow('粉丝参与', 'story.fanMechanic')}</dl></div>
    <div class="card"><h3 style="margin-top:0">成员个人线</h3>${(s.memberArcs || []).map((a) => `
      <p style="margin-bottom:8px"><b style="color:${esc(memberColor(a.codename))}">${esc(a.codename)}</b>：${esc(a.arc)}</p>`).join('')}</div></div>
    <div class="card"><h3 style="margin-top:0">第一季剧情</h3><ul class="ep-list">${(s.season1 || []).map((e) => `
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
      <span class="ed-index">世界观 · 总设定　<button class="ed-regen-link" data-regen="concept" title="重新生成总设定">🔄</button></span>
    </div>
    <p class="ed-lead">${esc(c.worldview || '尚未设定世界观')}</p>
    <div class="ed-detail">
      <div class="ed-detail-col"><div class="ed-block">
        <div class="ed-sub-kicker">团体档案</div>
        <dl class="ed-fields">
          ${fRow('团名', 'concept.name', { rename: '团名' })}
          ${fRow('核心概念', 'concept.concept')}
          ${fRow('名称含义', 'concept.nameMeaning')}
          ${fRow('成立原因', 'concept.originReason')}
        </dl>
      </div></div>
      <div class="ed-detail-col"><div class="ed-block">
        <div class="ed-sub-kicker">气质 · 视觉 · 音乐</div>
        <dl class="ed-fields">
          ${fRow('整体气质', 'concept.vibe')}
          ${fRow('情绪价值', 'concept.emotionalValue')}
          ${fRow('视觉风格', 'concept.visualStyle')}
          ${fRow('音乐风格', 'concept.musicStyle')}
        </dl>
      </div></div>
      <div class="ed-detail-col"><div class="ed-block">
        <div class="ed-sub-kicker">粉丝 · 应援</div>
        <dl class="ed-fields">
          ${fRow('粉丝称呼', 'concept.fandomName', { rename: '粉丝称呼' })}
          ${fRow('团体口号', 'concept.slogan')}
          <div class="f-row"><dt>代表色</dt><dd><span class="dot" style="background:${esc(c.mainColor)}"></span> ${esc(c.mainColor)}</dd></div>
        </dl>
      </div></div>
    </div>
  </div>`;
}

// ── 人物设定 Tab（杂志编辑部版式） ──
function renderMemberCards(el, m, i) {
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
        ${statItem('担当', prof.position)}${statItem('生日', [prof.birthday, prof.zodiac].filter(Boolean).join(' · '))}
        ${statItem('身高', [prof.height, prof.weight].filter(Boolean).join(' / '))}${statItem('血型', prof.bloodType)}
        ${statItem('MBTI', prof.mbti)}${statItem('惯用手', prof.handedness)}
        ${statItem('队内爱称', prof.nickname)}${statItem('应援色', prof.lightstickColor)}
      </div>`
    : `<button class="btn btn-ghost btn-sm ed-gen-profile" data-gen-profile="${i}">✦ 补全艺人资料卡（担当 / 生日 / 身高 / MBTI…）</button>`;
  const realName = prof?.realName && prof.realName !== m.codename ? prof.realName : (m.fullName && m.fullName !== m.codename ? m.fullName : '');
  const h = (d.history || [])[i];
  const bioTrigger = h
    ? `<button class="ed-bio-open" data-bio="${i}">📖 完整成长经历</button>`
    : `<button class="ed-bio-open ed-bio-gen" data-gen-one="${i}">✦ 生成 ${esc(m.codename)} 的成长经历</button>`;

  const imgs = G.images.filter((x) => x.member === m.codename);
  const primary = imgs.find((x) => x.isPrimary) || imgs[0];
  const genOK = appConfig.imageGen;

  el.innerHTML = `<div class="mc" style="--mc:${esc(m.color)}">
    <div class="mc-top">
      <div class="card mc-photo">
        <div class="mc-photo-main">
          ${primary ? `<img src="${esc(primary.url)}" alt="">` : `<div class="mc-photo-ph"><span>✦</span><p>还没有形象图</p></div>`}
        </div>
        <div class="mc-photo-bar">
          <button class="btn btn-sm" id="mc-upload">↑ 上传</button>
          <button class="btn btn-sm" id="mc-gen" ${genOK ? '' : 'disabled'}>✦ 生成形象</button>
          ${!locked ? `<button class="btn btn-sm" data-regen="${esc(mKey)}" title="重构人设">🔄 重构</button>` : ''}
          <span class="mc-bar-sp"></span>
          <button class="btn btn-sm" data-lock="${esc(mKey)}">${locked ? '🔓' : '🔒'}</button>
          <button class="btn btn-sm${pending ? ' node-act-pend' : ''}" data-pending="${esc(mKey)}">${pending ? '✅' : '🏷'}</button>
        </div>
        ${imgs.length > 1 ? `<div class="mc-gallery">${imgs.map((im) => `<div class="mc-thumb${im.isPrimary ? ' on' : ''}" data-img="${esc(im.id)}" data-url="${esc(im.url)}">
          <img src="${esc(im.url)}" loading="lazy" alt="">
          ${im.isPrimary ? '<span class="mc-thumb-tag">主图</span>' : '<button class="mc-thumb-set" data-primary>设为主图</button>'}
          <button class="mc-thumb-del" data-del>×</button>
        </div>`).join('')}</div>` : ''}
      </div>
      <div class="card mc-id">
        <div class="ed-id-top">
          ${en ? `<span class="ed-en">${esc(en)}</span>` : ''}
          <span class="ed-member-index"><span>${String(i + 1).padStart(2, '0')}</span> / ${String(d.members.length).padStart(2, '0')}</span>
        </div>
        <h1 class="ed-name">${esc(m.codename)}${realName ? `<span class="ed-realname">${esc(realName)}</span>` : ''}${!locked ? `<button class="ed-rename" data-rename="${esc(mKey)}.codename" data-kind="成员艺名" data-gender="${esc(m.gender || '')}" data-target="${esc(personality.join('、'))}" title="AI 起名">🪄</button>` : ''}</h1>
        <div class="ed-meta">${esc(meta)}${pending ? '　·　<span class="ed-pend">待处理</span>' : ''}</div>
        ${oneLine ? `<p class="ed-tagline">“${esc(oneLine)}”</p>` : ''}
        ${statHtml}
        ${personality.length ? `<div class="ed-tags">${personality.slice(0, 5).map((t) => `<span class="ed-tag">${esc(t.trim())}</span>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="card mc-set">
      <div class="ed-detail ed-detail-2">
        <div class="ed-detail-col">
          <div class="ed-block">
            <div class="ed-sub-kicker">才能与性格</div>
            <dl class="ed-fields">
              ${fRow('才能', `${mKey}.talent`)}${fRow('成长故事', `${mKey}.growthArc`)}${fRow('反差魅力', `${mKey}.contrast`)}
              ${fRow('魅力看点', `${mKey}.fanAppeal`)}${fRow('声音', `${mKey}.voice`)}${fRow('说话方式', `${mKey}.speechStyle`)}
            </dl>
            ${bioTrigger}
          </div>
        </div>
        <div class="ed-detail-col">
          <div class="ed-block">
            <div class="ed-sub-kicker">外形与造型</div>
            <dl class="ed-fields">
              ${fRow('气质', `${mKey}.appearance.face`)}${fRow('发型', `${mKey}.appearance.hair`)}${fRow('日常穿搭', `${mKey}.fashion`)}
              ${fRow('舞台造型', `${mKey}.stageOutfit`)}${fRow('标志配饰', `${mKey}.accessories`)}
            </dl>
          </div>
          <div class="ed-block">
            <div class="ed-sub-kicker">癖好 · 内在</div>
            <dl class="ed-fields">${fRow('兴趣爱好', `${mKey}.hobbies`)}${fRow('小缺点', `${mKey}.flaw`)}${fRow('秘密', `${mKey}.secret`)}</dl>
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
  const reload = async () => { G = await api.groups.get(G.id); renderTab(); };
  const ap = m.appearance || {};
  const genPrompt = `${m.codename}，${[ap.face, ap.hair, ap.eyes].filter(Boolean).join('，')}，日常穿搭：${m.fashion || ''}，全身立绘，时尚插画风格，纯白背景，超精细`;
  const upBtn = el.querySelector('#mc-upload');
  if (upBtn) upBtn.onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) return toast('图片超过 15MB');
      const rd = new FileReader();
      rd.onload = async () => { try { const img = await api.images.upload(G.id, m.codename, rd.result); if (!primary) await api.images.setPrimary(img.id); toast('已上传'); await reload(); } catch (e) { toast('上传失败：' + e.message, 3000); } };
      rd.readAsDataURL(f);
    };
    inp.click();
  };
  const genBtn = el.querySelector('#mc-gen');
  if (genBtn) genBtn.onclick = async () => {
    genBtn.disabled = true; genBtn.innerHTML = '<span class="spinner"></span> 生成中…';
    try { const img = await api.images.generate(G.id, m.codename, genPrompt, '1024x1536', 'medium'); if (!primary) await api.images.setPrimary(img.id); toast('已生成'); await reload(); }
    catch (e) { toast('生成失败：' + e.message, 4000); genBtn.disabled = false; genBtn.textContent = '✦ 生成形象'; }
  };
  el.querySelector('.mc-gallery')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.mc-thumb'); if (!t) return;
    if (e.target.closest('[data-primary]')) { await api.images.setPrimary(t.dataset.img); toast('已设为主图'); return reload(); }
    if (e.target.closest('[data-del]')) { if (await confirmModal('删除图片', '确定删除吗？')) { await api.images.remove(t.dataset.img); return reload(); } return; }
    modal(`<img src="${esc(t.dataset.url)}" style="width:100%;border-radius:12px" alt="">`);
  });
}

// ── 个人经历（成团后补充） ──
function renderHistoryTab(el) {
  const d = G.data;
  const prog = d.progress || {};
  if (!d.history || !d.history.length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:48px 26px">
      <div class="en-label">BIOGRAPHY</div>
      <h2>补充成员个人经历</h2>
      <p class="sub" style="max-width:520px;margin:8px auto 22px">为每位成员生成成长背景、入团经历、与队友的初遇、重要事件和日常切片——让粉丝能完整讲出TA的故事，也是后续内容运营的素材库。</p>
      <button class="btn btn-primary btn-big" id="btn-gen-history">✦ 生成全员经历</button>
    </div>`;
    $('#btn-gen-history').onclick = () => generateHistory();
    return;
  }
  el.innerHTML = `<div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><b>经历确认</b><div class="muted">每位成员可单独重做（🎲），字段可直接编辑（✏️）。确认后作为内容运营的依据。</div></div>
    ${prog.history
      ? `<span class="badge" style="background:var(--ok);color:#fff">✔ 已确认</span><button class="btn btn-ghost btn-sm" data-prog="history" data-v="0">取消确认</button>`
      : `<button class="btn btn-primary" data-prog="history" data-v="1">✔ 经历已确认</button>`}
  </div>
  <div class="cols-2">${d.members.map((m, i) => {
    const h = d.history[i];
    if (!h) return `<div class="card"><h3 style="margin-top:0;color:${esc(m.color)}">${esc(m.codename)}</h3>
      <button class="btn btn-ghost btn-sm" data-gen-one="${i}">✦ 生成TA的经历</button></div>`;
    const hKey = `history.${i}`;
    const hLocked = isLocked(hKey);
    const hPending = isPending(hKey);
    return `<div class="card${hPending ? ' node-pending' : ''}">
      <div class="module-head node-head">
        <h3 style="margin-top:0;color:${esc(m.color)}">${esc(m.codename)} 的经历
          ${hPending ? '<span class="node-tag node-tag-pend">待处理</span>' : ''}
          ${hLocked  ? '<span class="node-tag node-tag-lock">🔒</span>' : ''}
        </h3>
        <div class="node-acts">
          ${!hLocked ? `<button class="btn btn-ghost btn-sm" data-gen-one="${i}">🎲 重做</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-lock="${hKey}" title="${hLocked ? '解锁' : '锁定'}">${hLocked ? '🔓' : '🔒'}</button>
          <button class="btn btn-ghost btn-sm${hPending ? ' node-act-pend' : ''}" data-pending="${hKey}" title="${hPending ? '取消待处理' : '标记待处理'}">${hPending ? '✅' : '🏷'}</button>
        </div>
      </div>
      <dl>${fRow('成长背景', `${hKey}.background`)}${fRow('转折点', `${hKey}.turning`)}
      ${fRow('入团经历', `${hKey}.joining`)}${fRow('队友初遇', `${hKey}.firstMeet`)}
      ${(h.milestones || []).map((ms, j) => fRow(ms.title || `事件${j + 1}`, `${hKey}.milestones.${j}.desc`)).join('')}
      ${fRow('梦想与恐惧', `${hKey}.dream`)}${fRow('日常切片', `${hKey}.dailyLife`)}</dl>
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
  const ms = (h.milestones || []).map((x) => row(x.title || '事件', x.desc)).join('');
  const close = modal(`<div class="bio-modal" style="--mc:${esc(m.color)}">
    <div class="bio-modal-head">
      <div><div class="en-label" style="margin:0">BIOGRAPHY</div><h2 style="margin:2px 0 0">${esc(m.codename)} · 成长经历</h2></div>
      <button class="btn btn-ghost btn-sm" id="bio-regen">🎲 重写</button>
    </div>
    <dl class="bio-dl">
      ${row('成长背景', h.background)}
      ${row('转折点', h.turning)}
      ${row('入团经历', h.joining)}
      ${row('队友初遇', h.firstMeet)}
      ${ms}
      ${row('梦想与恐惧', h.dream)}
      ${row('日常切片', h.dailyLife)}
    </dl>
    <div class="m-foot"><button class="btn btn-primary" id="bio-close">完成</button></div>
  </div>`, {
    onMount: (mask) => {
      mask.querySelector('#bio-close').onclick = () => close();
      mask.querySelector('#bio-regen').onclick = () => { close(); generateHistory(i); };
    },
  });
}

async function generateProfile(i) {
  const d = G.data;
  const m = d.members[i];
  toast(`正在补全 ${m.codename} 的艺人资料…`, 60000);
  try {
    const prof = await api.stage('profile', { concept: d.concept, member: m });
    d.members[i].profile = prof;
    await save();
    $('.toast')?.remove();
    toast(`${m.codename} 资料卡已生成`);
  } catch (e) {
    $('.toast')?.remove();
    toast('生成失败：' + e.message, 3500);
  }
  renderTab();
}

async function generateHistory(onlyIndex = null) {
  const el = $('#tab-content');
  const d = G.data;
  el.innerHTML = `<div class="card" style="text-align:center;padding:50px"><div class="spinner" style="width:30px;height:30px;border-width:4px;margin:0 auto 14px"></div>
    <h2 id="hist-status">正在书写${onlyIndex === null ? '全员' : d.members[onlyIndex].codename + ' 的'}经历…</h2>
    <p class="muted">约 1-2 分钟</p></div>`;
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
      const st = $('#hist-status');
      if (st && targets.length > 1) st.textContent = `正在书写全员经历…（${done}/${targets.length}）`;
    });
    await save();
    toast('经历已生成');
  } catch (e) {
    toast('生成失败：' + e.message, 3500);
  }
  renderTab();
}

async function generateOperations() {
  const el = $('#tab-content');
  const d = G.data;
  el.innerHTML = `<div class="card" style="text-align:center;padding:50px"><div class="spinner" style="width:30px;height:30px;border-width:4px;margin:0 auto 14px"></div>
    <h2>正在制定运营方案…</h2><p class="muted">约 1-2 分钟</p></div>`;
  try {
    d.operations = await api.stage('operations', {
      concept: d.concept, members: d.members,
      relations: d.relations || { overview: '', pairs: [] },
      story: d.story || null,
      positioning: d.input?.positioning, audience: d.input?.audience,
    });
    await save();
    toast('运营方案已生成');
  } catch (e) {
    toast('生成失败：' + e.message, 3500);
  }
  renderTab();
}

async function setProgress(key, val) {
  G.data.progress = { ...(G.data.progress || {}), [key]: val };
  await save();
  toast(val ? '已确认' : '已取消确认');
  renderTab();
}

function memberColor(codename) {
  return G.data.concept.members.find((m) => codename?.includes(m.codename))?.color || 'var(--brand-a)';
}

function promptBlock(text) {
  if (!text) return '';
  return `<div class="prompt-block">${esc(text)}<button class="copy-btn" data-text="${esc(text)}">复制</button></div>`;
}
