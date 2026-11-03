// 创世向导：① 想法 → ② 选概念 → ③ 逐阶段成团（每阶段可无限重做，满意才锁定）
import { api, mapLimit } from './api.js';
import { $, $$, esc, toast, modal, confirmModal, getPath } from './ui.js';
import { playReveal } from './reveal.js';
import { openRename } from './rename.js';
import { t } from './i18n.js';
import { icon, iconLabel } from './icons.js';
import { updateEditorField, saveWizardDraft, loadWizardDraft, clearWizardDraft, beginWizardSession, completeWizardSave } from './editor-state.js';

const PRESETS = [
  '治愈清甜校园女团', '都市潮流男团', '国风神话虚拟偶像', '黑暗童话女团',
  '未来都市 AI 偶像团', '赛博朋克反叛组合', '吸血鬼贵族男团', '校园怪谈偶像团',
];

let wiz = null; // { input, options, chosen, state: {concept, members, relations}, locked: Set }

export function renderWizard(app) {
  wiz = beginWizardSession(loadWizardDraft() || { step: 1, input: null, options: null, chosen: null, state: {}, locked: new Set(), gen: 0 });
  app.innerHTML = `<div class="wizard-wrap wizard-layout">
    <div class="steps-rail" id="rail" aria-label="${t('逐步成团')}"></div>
    <div class="wizard-main" id="wiz-body"></div>
  </div>`;
  if (wiz.step === 3) phaseFlow(true);
  else if (wiz.step === 2) stepConcepts();
  else stepForm();
}

function persist(step = wiz.step) { wiz.step = step; saveWizardDraft(wiz); }

function currentSession(session, revision = session.revision) {
  return wiz === session && wiz.revision === revision && location.hash === '#/new';
}

function staleDialog(close) {
  close?.();
  toast(t('向导已切换，请重新打开操作'));
}

async function startFresh() {
  const session = wiz;
  const revision = session.revision;
  if (!(await confirmModal(t('重新开始'), t('将清空本次向导草稿，重新填写想法。')))) return;
  if (!currentSession(session, revision)) return staleDialog();
  clearWizardDraft();
  wiz = beginWizardSession({ step: 1, input: null, options: null, chosen: null, state: {}, locked: new Set(), gen: 0 });
  stepForm();
}

function rail(n) {
  const names = [t('想法'), t('选概念'), t('逐步成团')];
  $('#rail').innerHTML = names.map((name, i) => `
    ${i ? '<div class="rail-line"></div>' : ''}
    <div class="rail-step ${i + 1 < n ? 'done' : ''} ${i + 1 === n ? 'on' : ''}" ${i + 1 === n ? 'aria-current="step"' : ''}>
      <span class="num step-marker">${i + 1 < n ? icon('check') : i + 1}</span><span class="step-name">${name}</span>
    </div>`).join('');
}

// ── 第 1 步：想法 ──
function stepForm() {
  rail(1);
  if (wiz.input) persist(1);
  const prev = wiz.input || {};
  $('#wiz-body').innerHTML = `<div class="wizard-form">
    <div class="page-heading wizard-heading"><div class="en-label">BRIEF</div><h2>${t('从一个想法开始')}</h2></div>

    <section class="form-section form-section-idea"><label class="field">
      <span class="field-label">${t('偶像主题方向')} <em>*</em></span>
      <textarea id="f-theme" rows="2" placeholder="${t('例如：赛博国风女团 / 吸血鬼贵族男团 / 由废弃 AI 人格组成的偶像组合……')}">${esc(prev.theme || '')}</textarea>
    </label>
    <div class="chips">${PRESETS.map((p) => `<button type="button" class="chip">${t(p)}</button>`).join('')}</div></section>

    <section class="form-section form-section-profile"><div class="field-row">
      <label class="field"><span class="field-label">${t('成员数量')}</span>
        <div class="choice-row" id="f-count">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="choice ${n === (prev.memberCount || 3) ? 'on' : ''}" data-v="${n}">${t('{n} 人', { n })}</button>`).join('')}</div>
      </label>
      <label class="field"><span class="field-label">${t('性别构成')}</span>
        <div class="choice-row" id="f-gender">
          <button type="button" class="choice ${!prev.genderChoice || prev.genderChoice === '女' ? 'on' : ''}" data-v="女">${t('女团')}</button>
          <button type="button" class="choice ${prev.genderChoice === '男' ? 'on' : ''}" data-v="男">${t('男团')}</button>
          <button type="button" class="choice ${prev.genderChoice === '混合' ? 'on' : ''}" data-v="混合">${t('男女混合')}</button>
        </div>
      </label>
    </div></section>

    <section class="form-section form-section-position"><label class="field"><span class="field-label">${t('运营定位')}</span>
      <div class="choice-row" id="f-pos">
        <button type="button" class="choice ${!prev.positioning || prev.positioning === '商业偶像（发歌、舞台、代言）' ? 'on' : ''}" data-v="商业偶像（发歌、舞台、代言）">${t('商业偶像')}<small>${t('发歌 · 舞台')}</small></button>
        <button type="button" class="choice ${prev.positioning === '剧情 IP（连载故事、短剧宇宙）' ? 'on' : ''}" data-v="剧情 IP（连载故事、短剧宇宙）">${t('剧情 IP')}<small>${t('连载 · 短剧')}</small></button>
        <button type="button" class="choice ${prev.positioning === '短视频账号（碎片化内容传播）' ? 'on' : ''}" data-v="短视频账号（碎片化内容传播）">${t('短视频')}<small>${t('碎片传播')}</small></button>
        <button type="button" class="choice ${prev.positioning === '直播虚拟主播（互动、陪伴）' ? 'on' : ''}" data-v="直播虚拟主播（互动、陪伴）">${t('虚拟主播')}<small>${t('直播互动')}</small></button>
      </div>
    </label></section>

    <section class="form-section form-section-advanced"><button type="button" class="adv-toggle" id="adv-toggle">${t('进阶设置 ▾')}</button>
    <div class="adv-content${(prev.style || prev.audience || prev.extra) ? '' : ' hidden'}" id="adv-content">
      <div class="field-row">
        <label class="field"><span class="field-label">${t('风格方向')} <small>${t('（可留空）')}</small></span>
          <input id="f-style" type="text" placeholder="${t('冷感未来 / 华丽国风 / 清新治愈')}" value="${esc(prev.style || '')}"></label>
        <label class="field"><span class="field-label">${t('面向人群')} <small>${t('（可留空）')}</small></span>
          <input id="f-audience" type="text" placeholder="${t('Z世代二次元 / 短视频大众用户')}" value="${esc(prev.audience || '')}"></label>
      </div>
      <label class="field"><span class="field-label">${t('补充要求')} <small>${t('（可留空）')}</small></span>
        <input id="f-extra" type="text" placeholder="${t('希望有一个非人类成员 / 整体偏温暖治愈')}" value="${esc(prev.extra || '')}"></label>
    </div></section>

    <div class="wizard-actions">
      ${wiz.input ? `<button class="btn btn-ghost" id="btn-fresh" title="${t('重新开始')}">${icon('rotate-ccw')}${t('重新开始')}</button>` : ''}
      <button class="btn btn-primary btn-big" id="btn-go" title="${iconLabel(t('✦ 给我 3 个概念方向'))}">${icon('sparkles')}${iconLabel(t('✦ 给我 3 个概念方向'))}</button>
    </div>
  </div>`;

  $('#btn-fresh')?.addEventListener('click', startFresh);
  const captureForm = () => {
    const count = Number($('#f-count .choice.on').dataset.v);
    const g = $('#f-gender .choice.on').dataset.v;
    const next = {
      theme: $('#f-theme').value, genderChoice: g, memberCount: count,
      gender: count === 1 ? (g === '混合' ? '单人偶像（性别由你根据概念决定）' : `单人${g === '女' ? '女性' : '男性'}偶像`)
        : (g === '混合' ? '男女混合团' : (g === '女' ? '女团（全员女性）' : '男团（全员男性）')),
      style: $('#f-style').value, audience: $('#f-audience').value,
      positioning: $('#f-pos .choice.on').dataset.v, needWorldview: true, extra: $('#f-extra').value,
    };
    if (JSON.stringify(wiz.input) !== JSON.stringify(next)) {
      wiz.options = null;
      wiz.chosen = null;
      wiz.state = {};
      wiz.locked = new Set();
      wiz.gen++;
    }
    wiz.input = next;
    persist(1);
  };
  $('#wiz-body').oninput = captureForm;

  $$('#wiz-body .chip').forEach((c) => c.onclick = () => { $('#f-theme').value = c.textContent; captureForm(); });
  $('#adv-toggle').onclick = () => {
    const open = $('#adv-content').classList.toggle('hidden') === false;
    $('#adv-toggle').textContent = open ? t('进阶设置 ▴') : t('进阶设置 ▾');
  };
  if (!$('#adv-content').classList.contains('hidden')) $('#adv-toggle').textContent = t('进阶设置 ▴');
  for (const rowId of ['#f-count', '#f-gender', '#f-pos']) {
    $(rowId).addEventListener('click', (e) => {
      const b = e.target.closest('.choice');
      if (!b) return;
      $$(`${rowId} .choice`).forEach((x) => x.classList.toggle('on', x === b));
      captureForm();
    });
  }

  $('#btn-go').onclick = async () => {
    const theme = $('#f-theme').value.trim();
    if (!theme) { toast(t('请先填写偶像主题方向')); $('#f-theme').focus(); return; }
    captureForm();
    wiz.input.theme = theme;
    await stepConcepts();
  };
}

// ── 第 2 步：三案对比 ──
async function stepConcepts(regenerate = false) {
  $('#wiz-body').oninput = null;
  rail(2);
  if (!wiz.options || regenerate) {
    if (!regenerate && wiz.step === 2 && !wiz.options) {
      $('#wiz-body').innerHTML = `<div class="card"><h2>${t('概念方向尚未完成')}</h2>
        <button class="btn btn-primary" id="btn-resume-concepts">${t('继续生成概念')}</button>
        <button class="btn btn-ghost" id="btn-back">${t('返回修改')}</button></div>`;
      $('#btn-resume-concepts').onclick = () => stepConcepts(true);
      $('#btn-back').onclick = stepForm;
      return;
    }
    persist(2);
    const session = wiz;
    const token = wiz.gen;
    $('#wiz-body').innerHTML = `<div class="card" style="text-align:center;padding:60px 26px">
      <div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div>
      <h2>${t('正在构思 3 个概念方向…')}</h2><p class="muted">${t('约 30-60 秒')}</p></div>`;
    try {
      const r = await api.stage('concepts3', wiz.input);
      if (wiz !== session || wiz.gen !== token || location.hash !== '#/new') return;
      wiz.options = r.options;
      wiz.chosen = null;
      persist(2);
    } catch (e) {
      if (wiz !== session || wiz.gen !== token || location.hash !== '#/new') return;
      $('#wiz-body').innerHTML = `<div class="card"><div class="gen-error"><p>${t('构思失败：')}${esc(e.message)}</p>
        <button class="btn btn-primary" id="btn-retry">${t('重试')}</button>
        <button class="btn btn-ghost" id="btn-back">${t('返回修改')}</button></div></div>`;
      $('#btn-retry').onclick = () => stepConcepts(true);
      $('#btn-back').onclick = () => stepForm();
      return;
    }
  }

  $('#wiz-body').innerHTML = `<div class="wizard-concepts">
    <div class="en-label">CONCEPTS × 3</div>
    <h2>${t('选一个你心动的概念')}</h2>
    <p class="muted">${t('三个方向各走一条路，点击选中，也可以换一批。')}</p>
    <div class="concept-options">${wiz.options.map((o, i) => `
      <div class="concept-opt" data-i="${i}" style="--oc:${esc(o.mainColor)}">
        <div class="co-header"><h3>${esc(o.name)}</h3><div class="co-check"></div></div>
        <div class="co-body">
          <div class="co-concept">${esc(o.concept)}</div>
          <div>${vibeBadges(o.vibe)}</div>
          <div class="co-twist"><span class="en-label" style="margin-bottom:4px;display:block">UNIQUE ANGLE</span>${esc(o.twist)}</div>
        </div>
      </div>`).join('')}</div>
    <div class="wizard-actions">
      <button class="btn btn-ghost" id="btn-more" title="${iconLabel(t('🎲 都不满意，换一批'))}">${icon('refresh-cw')}${iconLabel(t('🎲 都不满意，换一批'))}</button>
      <button class="btn btn-ghost" id="btn-back2" title="${iconLabel(t('← 返回修改想法'))}">${icon('arrow-left')}${iconLabel(t('← 返回修改想法'))}</button>
      <button class="btn btn-primary btn-big" id="btn-build" ${wiz.chosen ? '' : 'disabled'}>${icon('arrow-right')}${iconLabel(t('✦ 就是这个，开始逐步成团'))}</button>
    </div>
  </div>`;

  $$('.concept-opt').forEach((el) => el.onclick = () => {
    $$('.concept-opt').forEach((x) => x.classList.toggle('on', x === el));
    wiz.chosen = wiz.options[Number(el.dataset.i)];
    $('#btn-build').disabled = false;
    persist(2);
  });
  if (wiz.chosen) $$('.concept-opt').find((el) => wiz.options[Number(el.dataset.i)] === wiz.chosen)?.classList.add('on');
  $('#btn-more').onclick = () => stepConcepts(true);
  $('#btn-back2').onclick = () => stepForm();
  $('#btn-build').onclick = () => {
    wiz.state = {};
    wiz.locked = new Set();
    wiz.gen = (wiz.gen || 0) + 1;
    persist(3);
    phaseFlow();
  };
}

const vibeBadges = (vibe) => String(vibe || '').split(/[,，、]/).filter(Boolean).map((v) => `<span class="badge">${esc(v.trim())}</span>`).join('');

// ── 第 3 步：逐阶段成团 ──
function phases() {
  const ph = [
    { key: 'concept', label: t('概念与成员骨架') },
    { key: 'members', label: t('{n} 位成员档案', { n: wiz.input.memberCount }) },
  ];
  if (wiz.input.memberCount > 1) ph.push({ key: 'relations', label: t('关系网络') });
  return ph;
}

function relationsOrStub() {
  return wiz.state.relations || { overview: '单人企划，无成员间关系', pairs: [], cpLines: [], comedyDuo: null, teamDynamic: '' };
}

async function genPhase(key, feedback = '', onProgress = null) {
  const st = wiz.state;
  const input = wiz.input;
  if (key === 'concept') {
    st.concept = await api.stage('concept', { ...input, chosen: wiz.chosen, feedback });
    delete st.members; // 骨架变了，旧成员档案作废
  } else if (key === 'members') {
    const skeletons = st.concept.members;
    let done = 0;
    st.members = await mapLimit(skeletons, 3, async (sk) => {
      const m = await api.stage('member', { concept: st.concept, allMembers: skeletons, member: sk, feedback });
      done++;
      onProgress?.(done, skeletons.length);
      return m;
    });
  } else if (key === 'relations') {
    st.relations = await api.stage('relations', { concept: st.concept, members: st.members, feedback });
  }
}

function phaseRail(currentKey) {
  return `<ul class="gen-steps" style="margin:14px 0 22px">${phases().map((p) => {
    let cls = 'pending', marker = '', extra = '';
    if (wiz.locked.has(p.key)) { cls = 'done'; marker = icon('lock-keyhole'); extra = `<span class="muted" style="margin-left:auto">${t('已锁定')}</span>`; }
    else if (p.key === currentKey) { cls = 'running'; marker = icon('arrow-right'); }
    return `<li class="${cls}"><span class="st-icon">${marker}</span>${p.label}${extra}</li>`;
  }).join('')}</ul>`;
}

async function phaseFlow(resuming = false) {
  $('#wiz-body').oninput = null;
  rail(3);
  const ph = phases();
  const current = ph.find((p) => !wiz.locked.has(p.key));

  // 全部锁定 → 正式成团
  if (!current) return resuming ? renderSaveResume() : finalize();

  // 当前阶段还没有结果 → 生成
  if (!wiz.state[current.key]) return resuming ? renderPhaseResume(current) : generateAndReview(current);

  renderReview(current);
}

function renderPhaseResume(current) {
  $('#wiz-body').innerHTML = `<div class="card"><h2>${t('「{name}」成团中', { name: esc(wiz.chosen.name) })}</h2>
    ${phaseRail(current.key)}<div class="wizard-actions"><button class="btn btn-primary" id="ph-continue">${icon('arrow-right')}${t('继续生成本阶段')}</button>
    <button class="btn btn-ghost" id="ph-restart">${icon('rotate-ccw')}${iconLabel(t('↩ 重头开始'))}</button></div></div>`;
  $('#ph-continue').onclick = () => generateAndReview(current);
  $('#ph-restart').onclick = restartAll;
}

function renderSaveResume() {
  $('#wiz-body').innerHTML = `<div class="card"><h2>${t('企划待保存')}</h2>
    <div class="wizard-actions"><button class="btn btn-primary" id="ph-save">${icon('check')}${t('继续保存企划')}</button></div></div>`;
  $('#ph-save').onclick = finalize;
}

async function restartAll() {
  const session = wiz;
  const revision = session.revision;
  if (!(await confirmModal(t('推翻重来'), t('将清空本次已生成和已锁定的全部阶段，回到概念选择。之前的三个概念方案还在，可以重选、换一批，或返回修改想法。')))) return;
  if (!currentSession(session, revision)) return staleDialog();
  wiz.state = {};
  wiz.locked = new Set();
  wiz.gen = (wiz.gen || 0) + 1; // 让进行中的旧生成结果作废
  persist(2);
  stepConcepts();
}

async function generateAndReview(current, feedback = '') {
  const token = wiz.gen;
  const session = wiz;
  $('#wiz-body').innerHTML = `<div class="card">
    <h2>${t('「{name}」成团中', { name: esc(wiz.chosen.name) })}</h2>
    ${phaseRail(current.key)}
    <div style="text-align:center;padding:26px 0">
      <div class="spinner" style="width:32px;height:32px;border-width:4px;margin:0 auto 14px"></div>
      <p id="gen-status">${t('正在创作：{label}…', { label: esc(current.label) })}</p>
      <p class="muted">${feedback ? t('已带上你的修改要求') : t('完成后你可以查看、重做或锁定')}</p>
      <button class="btn btn-ghost btn-sm" id="ph-restart" style="margin-top:18px">${icon('rotate-ccw')}${iconLabel(t('↩ 重头开始'))}</button>
    </div></div>`;
  $('#ph-restart').onclick = restartAll;
  try {
    await genPhase(current.key, feedback, (done, total) => {
      const el = $('#gen-status');
      if (el) el.textContent = t('正在创作：{label}（{done}/{total}）…', { label: current.label, done, total });
    });
    if (wiz !== session || wiz.gen !== token || location.hash !== '#/new') return;
    persist(3);
    renderReview(current);
  } catch (e) {
    if (wiz !== session || wiz.gen !== token || location.hash !== '#/new') return;
    $('#wiz-body').innerHTML = `<div class="card"><h2>${t('「{name}」成团中', { name: esc(wiz.chosen.name) })}</h2>${phaseRail(current.key)}
      <div class="gen-error"><p>${t('生成中断：')}${esc(e.message)}</p>
      <button class="btn btn-primary" id="btn-retry">${t('重试本阶段')}</button>
      <button class="btn btn-ghost" id="ph-restart2">${icon('rotate-ccw')}${iconLabel(t('↩ 重头开始'))}</button></div></div>`;
    $('#btn-retry').onclick = () => generateAndReview(current, feedback);
    $('#ph-restart2').onclick = restartAll;
  }
}

function renderReview(current) {
  const isLast = phases().every((p) => p.key === current.key || wiz.locked.has(p.key));
  $('#wiz-body').innerHTML = `<div class="wizard-review">
    <div class="en-label">PRODUCTION</div>
    <h2>${t('「{name}」成团中', { name: esc(wiz.state.concept?.name || wiz.chosen.name) })}</h2>
    ${phaseRail(current.key)}
    <p class="muted" style="margin-bottom:14px">${icon('pencil')}${iconLabel(t('✏️ 任何字段都可以手工修改，锁定后将按修改后的内容继续创作后面的阶段。'))}</p>
    <div id="phase-preview">${previewHTML(current.key)}</div>
    <div class="form-section" style="border-top:1px solid var(--line);margin-top:20px;padding-top:18px">
      <label class="field" style="margin-bottom:12px">
        <span class="field-label">${t('不满意？提点要求再重做')} <small>${t('（可留空直接重做）')}</small></span>
        <input id="ph-feedback" type="text" placeholder="${t('例如：再黑暗一点 / 成员名字要更有古风感 / 主唱的秘密换一个')}">
      </label>
      <div class="wizard-actions">
        <button class="btn btn-ghost" id="ph-redo">${icon('refresh-cw')}${iconLabel(t('🎲 重做本阶段'))}</button>
        <button class="btn btn-ghost" id="ph-restart">${icon('rotate-ccw')}${iconLabel(t('↩ 重头开始'))}</button>
        <button class="btn btn-primary btn-big" id="ph-lock">${icon(isLast ? 'check' : 'lock-keyhole')}${iconLabel(isLast ? t('🎉 满意，正式成团') : t('🔒 满意，锁定并继续'))}</button>
      </div>
    </div></div>`;

  $('#ph-redo').onclick = () => generateAndReview(current, $('#ph-feedback').value.trim());
  $('#ph-restart').onclick = restartAll;
  $('#ph-lock').onclick = () => {
    wiz.locked.add(current.key);
    persist(3);
    phaseFlow();
  };

  // 成员阶段：每个成员可单独重做
  $$('[data-redo-member]').forEach((btn) => btn.onclick = () => redoMember(Number(btn.dataset.redoMember), current));
  // 手工修改任意字段
  $$('[data-edit-path]').forEach((btn) => btn.onclick = () => editNode(btn.dataset.editPath, btn.dataset.label, current));
  // AI 起名
  $$('[data-rename]').forEach((btn) => btn.onclick = () => {
    const session = wiz;
    const revision = session.revision;
    const path = btn.dataset.rename;
    const c = wiz.state.concept;
    openRename({
      kind: btn.dataset.kind,
      context: `偶像团体「${c?.name || wiz.chosen.name}」：${c?.concept || wiz.chosen.concept}\n世界观：${c?.worldview || ''}\n气质：${c?.vibe || wiz.chosen.vibe}`,
      current: getPath(wiz.state, path),
      gender: btn.dataset.gender || '',
      target: btn.dataset.target || '',
      existing: namePool(),
      onPick: (name) => {
        if (!currentSession(session, revision)) return staleDialog();
        applyName(path, name);
        renderReview(current);
      },
    });
  });
}

function namePool() {
  const c = wiz.state.concept;
  return [c?.name, ...(c?.members || []).map((m) => m.codename), ...((wiz.state.members || []).map((m) => m.codename))];
}

// 应用新名字，并保持骨架与档案的艺名同步
function applyName(path, name) {
  updateEditorField(wiz.state, path, name);
  persist(3);
  toast(t('已更名'));
}

// 手工修改 wiz.state 中的某个字段
function editNode(path, label, current) {
  const session = wiz;
  const revision = session.revision;
  const v = getPath(wiz.state, path);
  const isArr = Array.isArray(v);
  const text = isArr ? v.join('\n') : String(v ?? '');
  modal(`<h3>${t('✏️ 手工修改 · {label}', { label: esc(label) })}</h3>
    ${isArr ? `<p class="muted">${t('每行一项')}</p>` : ''}
    <textarea id="ed-ta" rows="${Math.min(10, Math.max(3, Math.ceil(text.length / 40)))}">${esc(text)}</textarea>
    <div class="m-foot"><button class="btn btn-ghost" data-x>${t('取消')}</button><button class="btn btn-primary" data-ok>${t('保存修改')}</button></div>`,
    { onMount: (mask, close) => {
      $('[data-x]', mask).onclick = close;
      $('[data-ok]', mask).onclick = () => {
        if (!currentSession(session, revision)) return staleDialog(close);
        const nv = $('#ed-ta', mask).value.trim();
        updateEditorField(wiz.state, path, isArr ? nv.split('\n').map((s) => s.trim()).filter(Boolean) : nv);
        persist(3);
        close();
        toast(t('已修改，锁定后将按此继续'));
        renderReview(current);
      };
    } });
}

function redoMember(index, current) {
  const session = wiz;
  const revision = session.revision;
  const sk = wiz.state.concept.members[index];
  modal(`<h3>${t('🎲 重做成员 · {name}', { name: esc(sk.codename) })}</h3>
    <label class="field"><span class="field-label">${t('修改要求')} <small>${t('（可留空）')}</small></span>
      <input id="rm-hint" type="text" placeholder="${t('例如：性格更高冷 / 换一个秘密 / 外形更有少年感')}"></label>
    <div class="m-foot"><button class="btn btn-ghost" data-x>${t('取消')}</button><button class="btn btn-primary" data-ok>${t('开始重做')}</button></div>`,
    { onMount: (mask, close) => {
      $('[data-x]', mask).onclick = close;
      $('[data-ok]', mask).onclick = async () => {
        if (!currentSession(session, revision)) return staleDialog(close);
        const hint = $('#rm-hint', mask).value.trim();
        const token = wiz.gen;
        close();
        const card = $(`[data-member-card="${index}"]`);
        if (card) card.innerHTML = `<div style="text-align:center;padding:50px 0"><div class="spinner" style="width:26px;height:26px;border-width:3px;margin:0 auto 10px"></div><p class="muted">${t('重新创作中…')}</p></div>`;
        try {
          const member = await api.stage('member', {
            concept: wiz.state.concept, allMembers: wiz.state.concept.members,
            member: wiz.state.concept.members[index], feedback: hint,
          });
          if (!currentSession(session, revision) || wiz.gen !== token) return;
          wiz.state.members[index] = member;
          persist(3);
          toast(t('已更新'));
        } catch (e) {
          if (!currentSession(session, revision) || wiz.gen !== token) return;
          toast(t('重做失败：') + e.message, 3000);
        }
        renderReview(current);
      };
    } });
}

// ── 各阶段预览（字段带 ✏️ 手工修改） ──
const ed = (path, label) => `<button class="ed-btn" data-edit-path="${esc(path)}" data-label="${esc(label)}" title="${t('手工修改')}" aria-label="${t('手工修改')}">${icon('pencil')}</button>`;

function previewHTML(key) {
  const st = wiz.state;
  if (key === 'concept') {
    const c = st.concept;
    return `<h3 style="margin-top:0;font-size:22px;color:${esc(c.mainColor)}">${esc(c.name)} ${ed('concept.name', t('团名'))}<button class="ed-btn" data-rename="concept.name" data-kind="团名" title="${t('AI 起名')}" aria-label="${t('AI 起名')}">${icon('wand-sparkles')}</button></h3>
      <p style="font-size:15px;margin-bottom:10px">${esc(c.concept)} ${ed('concept.concept', t('核心概念'))}</p>
      <div style="margin-bottom:12px">${vibeBadges(c.vibe)} ${ed('concept.vibe', t('整体气质（逗号分隔）'))}</div>
      <dl class="kv-mini">
        <p><b>${t('世界观：')}</b>${esc(c.worldview)} ${ed('concept.worldview', t('世界观'))}</p>
        <p><b>${t('成立原因：')}</b>${esc(c.originReason)} ${ed('concept.originReason', t('成立原因'))}</p>
        <p><b>${t('视觉风格：')}</b>${esc(c.visualStyle)} ${ed('concept.visualStyle', t('视觉风格'))}　<b>${t('音乐风格：')}</b>${esc(c.musicStyle)} ${ed('concept.musicStyle', t('音乐风格'))}</p>
        <p><b>${t('粉丝称呼：')}</b>${esc(c.fandomName)} ${ed('concept.fandomName', t('粉丝称呼'))}<button class="ed-btn" data-rename="concept.fandomName" data-kind="粉丝称呼" title="${t('AI 起名')}" aria-label="${t('AI 起名')}">${icon('wand-sparkles')}</button>　<b>${t('口号：')}</b>${esc(c.slogan)} ${ed('concept.slogan', t('团体口号'))}</p>
      </dl>
      <h3>${t('成员骨架')}</h3>
      ${c.members.map((m, i) => `<p style="margin-bottom:6px"><span class="dot" style="background:${esc(m.color)}"></span>
        <b>${esc(m.codename)}</b> ${ed(`concept.members.${i}.codename`, t('艺名'))}<button class="ed-btn" data-rename="concept.members.${i}.codename" data-kind="成员艺名" data-gender="${esc(m.gender || '')}" data-target="${esc(m.oneLine)}" title="${t('AI 起名')}" aria-label="${t('AI 起名')}">${icon('wand-sparkles')}</button>${m.gender ? ` <span class="badge">${esc(t(m.gender))}</span>` : ''} <span class="badge">${esc(m.archetype)}</span>
        ${esc(m.oneLine)} ${ed(`concept.members.${i}.oneLine`, t('一句话人设'))}</p>`).join('')}`;
  }
  if (key === 'members') {
    return `<p class="muted" style="margin-bottom:14px">${t('每位成员都可以单独重做；下方"重做本阶段"会全部重来。')}</p>
      <div class="member-grid">${st.members.map((m, i) => `
      <div class="card member-card" style="--mc:${esc(m.color)};padding:18px" data-member-card="${i}">
        <h3 style="font-size:17px">${esc(m.codename)} ${ed(`members.${i}.codename`, t('艺名'))}<button class="ed-btn" data-rename="members.${i}.codename" data-kind="成员艺名" data-gender="${esc(m.gender || '')}" data-target="${esc((m.personality || []).join('、'))}" title="${t('AI 起名')}" aria-label="${t('AI 起名')}">${icon('wand-sparkles')}</button> <small>${esc(m.fullName || '')}</small></h3>
        <div class="m-tags">${m.gender ? `<span class="badge">${esc(t(m.gender))}</span>` : ''}<span class="badge">${esc(m.archetype)}</span><span class="badge">${esc(m.ageFeel || '')}</span></div>
        <p style="font-size:13px;color:var(--ink-2);margin-bottom:8px">${(m.personality || []).map(esc).join(' · ')} ${ed(`members.${i}.personality`, t('性格关键词'))}</p>
        <p style="font-size:13px;margin-bottom:5px"><b>${t('外貌：')}</b>${esc(m.appearance?.hair)} ${ed(`members.${i}.appearance.hair`, t('发型发色'))}；${esc(m.appearance?.eyes)} ${ed(`members.${i}.appearance.eyes`, t('眼睛'))}</p>
        <p style="font-size:13px;margin-bottom:5px"><b>${t('缺点：')}</b>${esc(m.flaw)} ${ed(`members.${i}.flaw`, t('缺点'))}</p>
        <p style="font-size:13px;margin-bottom:5px"><b>${t('反差：')}</b>${esc(m.contrast)} ${ed(`members.${i}.contrast`, t('反差点'))}</p>
        <p style="font-size:13px;margin-bottom:10px"><b>${t('秘密：')}</b>${esc(m.secret)} ${ed(`members.${i}.secret`, t('秘密'))}</p>
        <button class="btn btn-ghost btn-sm" data-redo-member="${i}">${icon('refresh-cw')}${iconLabel(t('🎲 重做TA'))}</button>
      </div>`).join('')}</div>
      <p class="muted" style="margin-top:12px">${t('其余字段（声音、穿搭、成长线、生图提示词等）成团后在工作台可继续修改。')}</p>`;
  }
  if (key === 'relations') {
    const r = st.relations;
    return `<p style="margin-bottom:12px">${esc(r.overview)} ${ed('relations.overview', t('关系格局'))}</p>
      ${(r.pairs || []).map((p, i) => `<div class="rel-item">
        <h4>${esc(p.a)} × ${esc(p.b)} <span class="badge">${esc(p.type)}</span> ${ed(`relations.pairs.${i}.type`, t('关系类型'))}</h4>
        <p>${esc(p.dynamic)} ${ed(`relations.pairs.${i}.dynamic`, t('关系描述'))}</p></div>`).join('')}
      <p><b>${t('CP 线：')}</b>${(r.cpLines || []).map((cp) => `${esc(cp.pair)}（${esc(cp.fanName)}）`).join('、')}</p>`;
  }
  return '';
}

// ── 正式成团 ──
async function finalize() {
  const session = wiz;
  const token = ++session.saveToken;
  const revision = session.revision;
  $('#wiz-body').innerHTML = `<div class="card" style="text-align:center;padding:60px 26px">
    <div class="spinner" style="width:34px;height:34px;border-width:4px;margin:0 auto 18px"></div>
    <h2>${t('正在保存企划…')}</h2></div>`;
  try {
    const st = wiz.state;
    const group = await api.groups.create({
      input: wiz.input, concept: st.concept, members: st.members,
      relations: relationsOrStub(), story: null, operations: null,
      progress: {},
    });
    if (location.hash === '#/new' && completeWizardSave(wiz, session, token, revision)) {
      try { await playReveal(st.concept); } catch { /* 保存已成功，继续打开企划 */ }
      if (wiz === session && session.saveToken === token && location.hash === '#/new') location.hash = `#/group/${group.id}`;
    }
  } catch (e) {
    if (wiz !== session || location.hash !== '#/new') return;
    $('#wiz-body').innerHTML = `<div class="card"><div class="gen-error"><p>${t('保存失败：')}${esc(e.message)}</p>
      <button class="btn btn-primary" id="btn-save-retry">${t('重试保存')}</button></div></div>`;
    $('#btn-save-retry').onclick = finalize;
  }
}
