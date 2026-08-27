// 主框架 — 路由 + 仪表盘
import { api } from './api.js';
import { $, esc, toast } from './ui.js';
import { renderWizard } from './wizard.js';
import { renderWorkspace } from './workspace.js';
import { renderOps } from './ops.js';
import { openSettings } from './settings-ui.js';
import { t, fmtDate, mountLangSwitch } from './i18n.js';

const app = $('#app');
export const appConfig = { imageGen: false, imageModel: '' };
api.config().then((c) => Object.assign(appConfig, c)).catch(() => {});

const ENABLE_DASH_COVERS = new URLSearchParams(location.search).get('covers') === '1';

async function renderDashboard(isCurrent = () => true) {
  app.innerHTML = `
    <div class="dash-hero">
      <div><div class="en-label">PROJECTS</div><h1>${t('我的企划')}</h1><p class="sub">${t('每一个团，都从一个想法开始')}</p></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost" id="btn-settings" title="${t('模型 API 绑定')}">⚙️ ${t('模型设置')}</button>
      <button class="btn btn-ghost" id="btn-import">${t('导入 JSON')}</button>
      <button class="btn btn-primary btn-big" id="btn-new">✦ ${t('新企划')}</button>
    </div>
    <div id="group-list"><div class="empty-state"><div class="big">⏳</div>${t('加载中…')}</div></div>`;

  $('#btn-new').onclick = () => { location.hash = '#/new'; };
  $('#btn-import').onclick = importJSON;
  $('#btn-settings').onclick = openSettings;

  let groups;
  try {
    groups = await api.groups.list();
  } catch (e) {
    if (!isCurrent()) return;
    $('#group-list').innerHTML = `<div class="empty-state">${t('加载失败：')}${esc(e.message)}</div>`;
    return;
  }
  if (!isCurrent()) return;

  if (!groups.length) {
    $('#group-list').innerHTML = `
      <div class="empty-state">
        <div class="big">🎤</div>
        <p style="font-size:17px;font-weight:600;color:var(--ink-2)">${t('还没有企划')}</p>
        <p style="margin:6px 0 22px">${t('输入一个想法，3 分钟出道一个团')}</p>
        <button class="btn btn-primary btn-big" id="btn-first-group">✦ ${t('创建第一个偶像团')}</button>
      </div>`;
    $('#btn-first-group').onclick = () => { location.hash = '#/new'; };
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
          <span>${fmtDate(g.updatedAt)}</span>
          <div class="spacer"></div>
          <a class="btn btn-ghost btn-sm" href="#/group/${esc(g.id)}" data-stop>${t('企划台')}</a>
          <a class="btn btn-primary btn-sm" href="#/ops/${esc(g.id)}" data-stop>${t('运营')}</a>
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
      const file = input.files[0];
      if (!file) return;
      if (file.size > 200 * 1024 * 1024) throw new Error(t('备份文件超过 200MB'));
      const text = await file.text();
      const data = JSON.parse(text);
      const group = data.format === 'starform-group-backup'
        ? await api.backups.restore(data)
        : await api.groups.create(data);
      toast(t('已导入「{name}」', { name: group.name }));
      location.hash = `#/group/${group.id}`;
    } catch (e) {
      toast(t('导入失败：') + e.message, 3000);
    }
  };
  input.click();
}

// ── 路由 ──
let routeVersion = 0;

async function route(version) {
  const isCurrent = () => version === routeVersion;
  const ta = $('#topbar-actions'); if (ta) ta.innerHTML = '';
  const hash = location.hash;
  const mGroup = hash.match(/^#\/group\/([\w-]+)(?:\?tab=([\w-]+))?/);
  const mOps = hash.match(/^#\/ops\/([\w-]+)(?:\?tab=([\w-]+))?/);
  document.body.classList.toggle('ws-mode', !!mGroup || !!mOps);
  if (hash === '#/new') return renderWizard(app);
  if (mOps) return renderOps(app, mOps[1], mOps[2], isCurrent);
  if (mGroup) return renderWorkspace(app, mGroup[1], mGroup[2], isCurrent);
  return renderDashboard(isCurrent);
}

$('.logo')?.addEventListener('click', () => { location.hash = ''; });

function showFatal(err) {
  console.error(err);
  if (!app) return;
  app.innerHTML = `<div class="empty-state">
    <div class="big">⚠️</div>
    <p style="font-size:17px;font-weight:700;color:var(--ink)">${t('页面初始化失败')}</p>
    <p style="margin-top:8px;color:var(--err)">${esc(err?.message || err)}</p>
  </div>`;
}

function runRoute() {
  const version = ++routeVersion;
  route(version).catch((err) => { if (version === routeVersion) showFatal(err); });
}

window.addEventListener('hashchange', runRoute);
mountLangSwitch();
runRoute();
