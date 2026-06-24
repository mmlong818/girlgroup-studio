// 主框架 — 路由 + 仪表盘
import { api } from './api.js';
import { $, esc, toast } from './ui.js';
import { renderWizard } from './wizard.js';
import { renderWorkspace } from './workspace.js';
import { renderOps } from './ops.js';
import { openSettings } from './settings-ui.js';

const app = $('#app');
export const appConfig = { imageGen: false, imageModel: '' };
api.config().then((c) => Object.assign(appConfig, c)).catch(() => {});

const ENABLE_DASH_COVERS = new URLSearchParams(location.search).get('covers') === '1';

async function renderDashboard() {
  app.innerHTML = `
    <div class="dash-hero">
      <div><div class="en-label">PROJECTS</div><h1>我的企划</h1><p class="sub">每一个团，都从一个想法开始</p></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost" id="btn-settings" title="模型 API 绑定">⚙️ 模型设置</button>
      <button class="btn btn-ghost" id="btn-import">导入 JSON</button>
      <button class="btn btn-primary btn-big" id="btn-new">✦ 新企划</button>
    </div>
    <div id="group-list"><div class="empty-state"><div class="big">⏳</div>加载中…</div></div>`;

  $('#btn-new').onclick = () => { location.hash = '#/new'; };
  $('#btn-import').onclick = importJSON;
  $('#btn-settings').onclick = openSettings;

  let groups;
  try {
    groups = await api.groups.list();
  } catch (e) {
    $('#group-list').innerHTML = `<div class="empty-state">加载失败：${esc(e.message)}</div>`;
    return;
  }

  if (!groups.length) {
    $('#group-list').innerHTML = `
      <div class="empty-state">
        <div class="big">🎤</div>
        <p style="font-size:17px;font-weight:600;color:var(--ink-2)">还没有企划</p>
        <p style="margin:6px 0 22px">输入一个想法，3 分钟出道一个团</p>
        <button class="btn btn-primary btn-big" onclick="location.hash='#/new'">✦ 创建第一个偶像团</button>
      </div>`;
    return;
  }

  $('#group-list').innerHTML = `<div class="group-grid">${groups.map((g) => {
    const members = Array.isArray(g.members) ? g.members : [];
    return `
    <div class="card group-card" data-id="${esc(g.id)}" style="--gc:${esc(g.mainColor)}">
      <div class="gc-poster ${ENABLE_DASH_COVERS && g.cover ? 'has-cover' : ''}">
        <div class="en-label">GROUP FILE</div>
        <h2>${esc(g.name)}</h2>
        <div class="gc-dots">${members.map((m) => `<span class="dot" style="background:${esc(m.color)}" title="${esc(m.codename)}"></span>`).join('')}</div>
        <div class="gc-names">${members.map((m) => `<span>${esc(m.codename)}</span>`).join('<span class="gc-sep">·</span>')}</div>
      </div>
      <div class="gc-body">
        <div class="gc-theme">${esc(g.theme)}</div>
        <div class="gc-concept">${esc(g.concept)}</div>
        <div class="gc-foot">
          <span>${new Date(g.updatedAt).toLocaleDateString('zh-CN')}</span>
          <div class="spacer"></div>
          <a class="btn btn-ghost btn-sm" href="#/group/${esc(g.id)}" data-stop>企划台</a>
          <a class="btn btn-primary btn-sm" href="#/ops/${esc(g.id)}" data-stop>运营</a>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;

  $('#group-list').addEventListener('click', (e) => {
    const card = e.target.closest('.group-card');
    if (!card) return;
    if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }
    location.hash = `#/group/${card.dataset.id}`;
  });
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    try {
      const text = await input.files[0].text();
      const data = JSON.parse(text);
      if (!data.concept?.name) throw new Error('文件里没有有效的企划数据');
      const group = await api.groups.create(data);
      toast(`已导入「${group.name}」`);
      location.hash = `#/group/${group.id}`;
    } catch (e) {
      toast('导入失败：' + e.message, 3000);
    }
  };
  input.click();
}

// ── 路由 ──
async function route() {
  const ta = $('#topbar-actions'); if (ta) ta.innerHTML = '';
  const hash = location.hash;
  const mGroup = hash.match(/^#\/group\/([\w-]+)(?:\?tab=([\w-]+))?/);
  const mOps = hash.match(/^#\/ops\/([\w-]+)(?:\?tab=([\w-]+))?/);
  document.body.classList.toggle('ws-mode', !!mGroup || !!mOps);
  if (hash === '#/new') return renderWizard(app);
  if (mOps) return renderOps(app, mOps[1], mOps[2]);
  if (mGroup) return renderWorkspace(app, mGroup[1], mGroup[2]);
  return renderDashboard();
}

$('.logo')?.addEventListener('click', () => { location.hash = ''; });

function showFatal(err) {
  console.error(err);
  if (!app) return;
  app.innerHTML = `<div class="empty-state">
    <div class="big">⚠️</div>
    <p style="font-size:17px;font-weight:700;color:var(--ink)">页面初始化失败</p>
    <p style="margin-top:8px;color:var(--err)">${esc(err?.message || err)}</p>
  </div>`;
}

function runRoute() {
  route().catch(showFatal);
}

window.addEventListener('hashchange', runRoute);
runRoute();
