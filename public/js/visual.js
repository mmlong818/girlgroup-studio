// 视觉车间 — 全站唯一的出图后台：团体海报 + 每位成员的全部造型分类
// 布局：左栏视觉对象 → 主图 + 生成控制（分类 / 模板 / 提示词 / 参数 / 队列）→ 图库（按分类筛选 + 归档区）
import { api } from './api.js';
import { $, esc, toast, modal, confirmModal, segmented, lightbox } from './ui.js';
import { appConfig } from './main.js';
import { memberPresets, posterPresets, catOptions, refsFor, CATS, ART_STYLES } from './style-presets.js';
import { t } from './i18n.js';

const POSTER = '__poster__';
const KIND_LABELS = { gen: '常用造型', upload: '上传' };
CATS.forEach((c) => { KIND_LABELS[c.id] = c.label; });

// 当前视图状态；G 始终指向本车间持有的最新企划对象
const V = { G: null, el: null, onChange: null, target: POSTER, cat: 'look', filter: '' };

// 设定下一次进入车间时选中的对象（工作台「去视觉车间」跳转用）
export function focusVisualTarget(codename) {
  if (codename) { V.target = codename; V.cat = 'look'; V.filter = ''; }
}

// onChange(group)：企划对象被替换 / 更新后通知宿主页面同步
export function renderVisualTab(el, G, onChange) {
  V.G = G; V.el = el; V.onChange = onChange;
  const members = G.data.members || [];
  if (V.target !== POSTER && !members.some((m) => m.codename === V.target)) V.target = POSTER;

  el.innerHTML = `<div class="ppl-shell">
    <aside class="ppl-rail" id="vh-rail"></aside>
    <section class="ppl-main" id="vis-panel"></section>
  </div>`;
  renderRail();
  renderPanel();
}

const live = () => V.el?.isConnected;
const currentMember = () => (V.target === POSTER ? null : (V.G.data.members || []).find((m) => m.codename === V.target));
const subjectImages = () => V.G.images.filter((i) => i.member === (V.target === POSTER ? '' : V.target));

// 重新拉取企划（主图 / 归档 / 上传等改动后），只刷新受影响区域，不打断提示词编辑
async function refresh() {
  const id = V.G.id;
  const updated = await api.groups.get(id);
  if (V.G?.id !== id) return;
  V.G = updated;
  V.onChange?.(updated);
  if (live()) refreshViews();
}

function refreshViews() {
  renderRail();
  renderHero();
  renderRefs();
  renderGallery();
}

// ── 左栏：视觉对象 ──
function renderRail() {
  const box = $('#vh-rail', V.el);
  if (!box) return;
  const G = V.G;
  const slots = [
    { t: POSTER, label: t('团体海报'), sub: t('封面主视觉'), color: G.data.concept.mainColor },
    ...(G.data.members || []).map((m) => ({ t: m.codename, label: m.codename, sub: m.archetype || '', color: m.color })),
  ];
  box.innerHTML = `<div class="rail-label">${t('视觉对象')}</div>
    ${slots.map((s) => {
      const photo = G.images.find((i) => i.member === (s.t === POSTER ? '' : s.t) && i.isPrimary && !i.archived);
      return `<button class="rail-item${V.target === s.t ? ' active' : ''}" data-t="${esc(s.t)}" style="--mc:${esc(s.color)}">
        <span class="rail-thumb">${photo
          ? `<img src="${esc(photo.url)}" alt="">`
          : `<span class="rail-ph">${s.t === POSTER ? '✦' : esc(s.label.slice(0, 1))}</span>`}</span>
        <span class="rail-txt"><span class="rail-name">${esc(s.label)}</span><span class="rail-arch">${esc(s.sub)}</span></span>
      </button>`;
    }).join('')}`;
  box.querySelectorAll('.rail-item').forEach((btn) => btn.onclick = () => {
    if (V.target === btn.dataset.t) return;
    V.target = btn.dataset.t; V.cat = 'look'; V.filter = '';
    renderRail();
    renderPanel();
  });
}

// 当前分类下的模板选项：{ key, label, size, build(hint) → { prompt, locks } }
function currentOptions() {
  const G = V.G;
  const m = currentMember();
  const fromPreset = (p) => ({ key: p.key, label: p.label, size: p.size, build: (hint) => ({ prompt: hint ? `${p.prompt} ${t('附加要求：')}${hint}` : p.prompt, locks: p.locks }) });
  if (!m) return posterPresets(G).map(fromPreset);
  if (V.cat === 'look') return memberPresets(m, G).map(fromPreset);
  return catOptions(CATS.find((c) => c.id === V.cat), m, G);
}

// ── 主面板 ──
function renderPanel() {
  const el = $('#vis-panel', V.el);
  if (!el) return;
  const G = V.G;
  const m = currentMember();
  const isPoster = !m;
  const mc = m?.color || G.data.concept.mainColor;
  const genOK = appConfig.imageGen;
  const cats = [{ id: 'look', label: '常用造型', desc: '基础立绘、舞台造型、写真、小卡、设定表、潮玩等常用模板' }, ...CATS];
  const cat = cats.find((c) => c.id === V.cat) || cats[0];
  const options = currentOptions();
  let selected = options[0];
  const defaultSize = isPoster ? '1536x1024' : (selected?.size || '1024x1536');

  el.innerHTML = `
    <div class="vis-stage" style="--mc:${esc(mc)}">
      <div class="ed-topline">
        <span class="ed-kicker">STARFORM / VISUAL</span>
        <span class="ed-index" id="vh-count"></span>
      </div>

      <div class="vis-layout">
        <figure class="vis-hero" id="vh-hero"></figure>

        <div class="vis-control">
          <div class="ed-en">${isPoster ? 'GROUP POSTER' : t('主图设定')}</div>
          <h2 class="vis-subject">${isPoster ? t('团体海报') : esc(m.codename)}</h2>
          <div class="vis-subject-sub">${isPoster ? t('封面主视觉') + ' · GROUP POSTER' : `${esc(m.archetype || '')}${m.ageFeel ? '　·　' + esc(m.ageFeel) : ''}`}</div>
          <div class="ms-style-lock">
            <span class="ms-lock-label" title="${t('锁定后，本企划所有生成将强制统一画风，并严格跟随参考图画风')}">🎨 ${t('画风锁定')}</span>
            <button class="chip-mini${!G.data.artStyle ? ' on' : ''}" data-artstyle="">${t('跟随原图（默认）')}</button>
            ${ART_STYLES.map((a) => `<button class="chip-mini${G.data.artStyle === a.key ? ' on' : ''}" data-artstyle="${esc(a.key)}">${esc(t(a.label))}</button>`).join('')}
          </div>
          <div class="ed-rule"></div>

          ${isPoster ? '<div id="vh-refs"></div>' : `<nav class="ms-cats">
            ${cats.map((c) => `<button class="ms-cat-btn${c.id === cat.id ? ' active' : ''}" data-cat="${esc(c.id)}">${esc(t(c.label))}</button>`).join('')}
          </nav>
          <p class="muted" style="font-size:12.5px;margin:8px 0 4px">${esc(t(cat.desc))}</p>`}

          <div class="ms-step-label">① ${isPoster ? t('海报模板') : t('第 1 步 · 选择风格与要求')}</div>
          <div class="ms-style-row">
            ${options.map((o, i) => `<button class="ms-style-chip${i === 0 ? ' on' : ''}" data-opt="${i}">${esc(o.label)}</button>`).join('')}
          </div>
          <div class="ms-gen-row">
            <input id="vh-hint" type="text" placeholder="${t('附加要求（可选）')}">
          </div>

          <div class="ms-step-label">② ${t('第 2 步 · 确认提示词并生图')}</div>
          <div class="ms-prompt-box">
            <div class="ms-prompt-head">
              <span class="ms-prompt-label">${t('提示词可自由修改，生图将严格使用此文本')}</span>
              <button type="button" class="chip-mini" id="vh-ai">🪄 ${t('AI 创作提示词')}</button>
            </div>
            <textarea id="vh-prompt" rows="6"></textarea>
          </div>

          <div class="vis-opt-row" style="margin-top:12px">
            <span class="vis-opt-label">${t('尺寸')}</span>
            ${segmented('vh-size', [
              { value: '1024x1536', label: t('竖版') },
              { value: '1536x1024', label: t('横版') },
              { value: '1024x1024', label: t('方形') },
            ], defaultSize)}
          </div>
          <div class="vis-opt-row">
            <span class="vis-opt-label">${t('质量')}</span>
            ${segmented('vh-quality', [
              { value: 'medium', label: t('标准') },
              { value: 'high', label: t('高清') },
              { value: 'low', label: t('草图') },
            ], 'medium')}
          </div>
          ${isPoster ? '' : '<div class="vis-opt-row" id="vh-refs"></div>'}

          <div class="vis-gen-row">
            <button class="btn btn-primary" id="vh-gen" ${genOK ? '' : 'disabled'}>✦ ${t('加入生成队列')}</button>
            <button class="btn btn-ghost" id="vh-upload">↑ ${isPoster ? t('上传海报') : t('上传主图')}</button>
          </div>
          ${!genOK ? `<p class="muted" style="color:var(--err);font-size:12.5px;margin-top:8px">${t('未配置 OPENAI_API_KEY，AI 生成不可用')}</p>` : ''}
          <div class="ms-queue" id="vh-queue"></div>
          <div class="drop-zone vis-drop" id="vh-drop">${t('拖入图片，或点「上传」选择文件（PNG / JPG / WebP ≤ 15MB）')}</div>
        </div>
      </div>

      <div class="vis-gallery-section" id="vh-gallery"></div>
    </div>`;

  const ta = $('#vh-prompt', el);
  const hintInput = $('#vh-hint', el);
  let draft = selected ? selected.build('') : { prompt: '', locks: [] };
  ta.value = draft.prompt;

  const applyOption = () => {
    draft = selected.build(hintInput.value.trim());
    ta.value = draft.prompt;
  };

  el.querySelectorAll('[data-opt]').forEach((chip) => chip.onclick = () => {
    el.querySelectorAll('[data-opt]').forEach((c) => c.classList.toggle('on', c === chip));
    selected = options[Number(chip.dataset.opt)];
    applyOption();
    if (selected.size) el.querySelector(`[data-seg="vh-size"] .seg-opt[data-val="${selected.size}"]`)?.click();
  });
  // 附加要求只在提示词未被手改时自动并入草稿，避免覆盖手动编辑
  hintInput.onchange = () => { if (ta.value === draft.prompt) applyOption(); };

  el.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { V.cat = b.dataset.cat; renderPanel(); });

  // 画风锁定：企划级设置，保存失败则回滚
  el.querySelectorAll('[data-artstyle]').forEach((b) => b.onclick = async () => {
    const v = b.dataset.artstyle;
    const prev = G.data.artStyle;
    if ((prev || '') === v) return;
    if (v) G.data.artStyle = v; else delete G.data.artStyle;
    try {
      await api.groups.update(G.id, G.data);
      V.onChange?.(G);
      toast(v ? t('画风已锁定：{label}', { label: t(ART_STYLES.find((a) => a.key === v).label) }) : t('已解除画风锁定'));
    } catch (e) {
      if (prev) G.data.artStyle = prev; else delete G.data.artStyle;
      toast(t('保存失败：') + e.message, 3000);
    }
    if (live() && V.G === G) renderPanel();
  });

  // AI 创作提示词：以当前文本为草稿，按角色档案重写；锁定片段由服务端强制保留
  const aiBtn = $('#vh-ai', el);
  aiBtn.onclick = async () => {
    const pick = (mm) => ({
      codename: mm.codename, archetype: mm.archetype, personality: mm.personality,
      appearance: mm.appearance, fashion: mm.fashion, stageOutfit: mm.stageOutfit,
      accessories: mm.accessories, color: mm.color, contrast: mm.contrast,
    });
    const c = G.data.concept;
    aiBtn.disabled = true;
    ta.readOnly = true;
    aiBtn.innerHTML = `<span class="spinner"></span> ${t('AI 创作中…')}`;
    try {
      const r = await api.stage('imagePrompt', {
        member: isPoster ? (G.data.members || []).map(pick) : pick(m),
        concept: `《${c.name}》${c.concept || ''}（气质：${c.vibe || ''}；视觉：${c.visualStyle || ''}）`,
        task: isPoster ? `${t('团体海报')} / ${selected?.label || ''}` : `${t(cat.label)} / ${selected?.label || ''}`,
        hint: hintInput.value.trim(),
        draft: ta.value.trim() || draft.prompt,
        locks: draft.locks,
      });
      ta.value = r.prompt;
    } catch (e) {
      toast(t('AI 创作失败，已使用本地模板：') + e.message, 3500);
    }
    ta.readOnly = false;
    aiBtn.disabled = false;
    aiBtn.innerHTML = `🪄 ${t('AI 创作提示词')}`;
  };

  // 入队即返回，可连续排多个；队列逐个执行
  $('#vh-gen', el).onclick = () => {
    const prompt = ta.value.trim() || draft.prompt;
    if (!prompt) return toast(t('提示词不能为空'));
    const useRef = isPoster ? undefined : ($('#vh-useref', el)?.checked ?? true);
    const label = isPoster ? `${t('团体海报')} · ${selected?.label || ''}` : `${m.codename} · ${t(cat.label)} · ${selected?.label || ''}`;
    enqueue({
      groupId: G.id, member: isPoster ? '' : m.codename, label, prompt, useRef,
      size: $('#vh-size', el).value, quality: $('#vh-quality', el).value,
      kind: isPoster || V.cat === 'look' ? 'gen' : V.cat,
    });
    toast(t('已加入队列：{label}', { label }));
  };

  // 上传
  const pickFile = () => pickImage((dataUrl) => upload(dataUrl));
  const upload = async (dataUrl) => {
    try {
      await api.images.upload(G.id, isPoster ? '' : m.codename, dataUrl);
      toast(t('上传成功'));
      await refresh();
    } catch (e) { toast(t('上传失败：') + e.message, 3000); }
  };
  $('#vh-upload', el).onclick = pickFile;
  const drop = $('#vh-drop', el);
  drop.onclick = pickFile;
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer.files?.[0];
    if (f) readImage(f, upload);
  };

  renderHero();
  renderRefs();
  renderQueue();
  renderGallery();
}

function renderHero() {
  const hero = $('#vh-hero', V.el);
  if (!hero) return;
  const imgs = subjectImages().filter((i) => !i.archived);
  const primary = imgs.find((i) => i.isPrimary);
  hero.innerHTML = primary
    ? `<img src="${esc(primary.url)}" alt="">`
    : `<div class="vis-hero-ph"><span>✦</span><p>${t('还没有主图<br>生成或上传后设为主图')}</p></div>`;
  if (primary) hero.querySelector('img').onclick = () => lightbox(primary.url);
  const count = $('#vh-count', V.el);
  if (count) count.textContent = `${V.target === POSTER ? t('团体海报') : V.target}　·　${t('{n} 张', { n: imgs.length })}`;
}

// 参考图：成员 = 主图 + 造型设定图（可关闭）；海报 = 各成员主图（点卡片换图）
function renderRefs() {
  const box = $('#vh-refs', V.el);
  if (!box) return;
  const G = V.G;
  const m = currentMember();
  if (m) {
    const refs = refsFor(G, m);
    const wasChecked = $('#vh-useref', box)?.checked ?? true;
    box.innerHTML = refs.length
      ? `<label class="ms-ref-toggle"><input type="checkbox" id="vh-useref" ${wasChecked ? 'checked' : ''}>
          ${refs.map((r) => `<img src="${esc(r.url)}" alt="">`).join('')}
          <span>${t('以主图与造型设定图为角色参考（{n} 张）', { n: refs.length })}</span></label>`
      : `<span class="ms-ref-none">💡 ${t('还没有参考图——先在「造型设定」出三视图，或把一张图设为主图，之后生成会自动携带参考保持角色一致')}</span>`;
    return;
  }
  const refs = (G.data.members || []).map((mm) => {
    const p = G.images.find((i) => i.member === mm.codename && i.isPrimary && !i.archived);
    return { codename: mm.codename, color: mm.color, url: p?.url };
  });
  box.innerHTML = `<div class="vis-refs">
    <div class="vis-refs-head">
      <span class="vis-refs-label">${t('角色参考')}</span>
      <span class="muted" style="font-size:11.5px">${t('生成海报时喂给 AI 的角色形象 · 点卡片可换图')}</span>
    </div>
    <div class="vis-ref-list">
      ${refs.map((r) => `<button class="vis-ref-card${r.url ? '' : ' empty'}" data-ref-member="${esc(r.codename)}" style="--mc:${esc(r.color)}">
        <div class="vis-ref-thumb">${r.url ? `<img src="${esc(r.url)}" alt="">` : '<span>＋</span>'}</div>
        <span class="vis-ref-name">${esc(r.codename)}</span>
        <span class="vis-ref-hint">${r.url ? t('换图') : t('选图')}</span>
      </button>`).join('')}
    </div>
  </div>`;
  box.querySelectorAll('[data-ref-member]').forEach((card) => card.onclick = () => openRefPicker(card.dataset.refMember));
}

// ── 图库：按分类筛选 + 归档区 ──
function renderGallery() {
  const box = $('#vh-gallery', V.el);
  if (!box) return;
  const all = subjectImages();
  const active = all.filter((i) => !i.archived);
  const archived = all.filter((i) => i.archived);
  const kinds = [...new Set(active.map((i) => i.kind || 'gen'))];
  if (V.filter && !kinds.includes(V.filter)) V.filter = '';
  const shown = V.filter ? active.filter((i) => (i.kind || 'gen') === V.filter) : active;
  if (!all.length) { box.innerHTML = `<p class="muted" style="text-align:center;padding:24px 0">${t('完成上方两步后，图像将展示在这里')}</p>`; return; }

  box.innerHTML = `
    <div class="ed-sub-kicker">${t('图库')} · ${t('{n} 张', { n: active.length })}</div>
    ${kinds.length > 1 ? `<div class="lib-filters" style="margin:8px 0">
      <button class="lib-pill${!V.filter ? ' on' : ''}" data-filter="">${t('全部')} ${active.length}</button>
      ${kinds.map((k) => `<button class="lib-pill${V.filter === k ? ' on' : ''}" data-filter="${esc(k)}">${esc(t(KIND_LABELS[k] || k))} ${active.filter((i) => (i.kind || 'gen') === k).length}</button>`).join('')}
    </div>` : ''}
    <div class="vis-gallery">
      ${shown.map((img) => `
        <div class="vis-thumb${img.isPrimary ? ' primary' : ''}" data-id="${esc(img.id)}" data-url="${esc(img.url)}">
          <img src="${esc(img.url)}" loading="lazy" alt="">
          ${img.isPrimary ? `<span class="vt-tag">${t('主图')}</span>` : ''}
          ${img.isPrimary ? '' : `<div class="vt-acts">
            <button data-primary>${t('设为主图')}</button>
            <button data-archive>📦 ${t('归档')}</button>
          </div>`}
        </div>`).join('')}
    </div>
    ${archived.length ? `<details class="ms-archive">
      <summary>📦 ${t('归档区（{n}）', { n: archived.length })} · <span class="muted">${t('可在此恢复或彻底删除')}</span></summary>
      <div class="vis-gallery">
        ${archived.map((img) => `
          <div class="vis-thumb" data-id="${esc(img.id)}" data-url="${esc(img.url)}">
            <img src="${esc(img.url)}" loading="lazy" alt="">
            <div class="vt-acts">
              <button data-restore>${t('恢复')}</button>
              <button data-del>${t('删除')}</button>
            </div>
          </div>`).join('')}
      </div>
    </details>` : ''}`;

  box.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { V.filter = b.dataset.filter; renderGallery(); });
  box.onclick = async (e) => {
    const thumb = e.target.closest('.vis-thumb');
    if (!thumb) return;
    const id = thumb.dataset.id;
    try {
      if (e.target.closest('[data-primary]')) { await api.images.setPrimary(id); toast(t('已设为主图')); return refresh(); }
      if (e.target.closest('[data-archive]')) { await api.images.archive(id, true); toast(t('已归档')); return refresh(); }
      if (e.target.closest('[data-restore]')) { await api.images.archive(id, false); toast(t('已恢复')); return refresh(); }
      if (e.target.closest('[data-del]')) {
        if (await confirmModal(t('彻底删除'), t('确定彻底删除这张图？此操作不可恢复。'))) { await api.images.remove(id); toast(t('已删除')); return refresh(); }
        return;
      }
    } catch (err) { return toast(t('操作失败：') + err.message, 3000); }
    lightbox(thumb.dataset.url);
  };
}

// ── 生成队列：跨对象 / 跨页面共享，逐个执行，完成后只刷新图库不打断编辑 ──
const queue = [];
let running = false;

function enqueue(task) {
  queue.push(task);
  renderQueue();
  runQueue();
}

async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const task = queue[0];
    task.running = true;
    renderQueue();
    try {
      const img = await api.images.generate(task.groupId, task.member, task.prompt, task.size, task.quality, task.kind, task.useRef);
      if (V.G?.id === task.groupId) {
        if (img.isPrimary) V.G.images.forEach((i) => { if (i.member === task.member) i.isPrimary = false; });
        V.G.images.unshift({ ...img, archived: false });
        V.onChange?.(V.G);
        if (live()) refreshViews();
      }
      toast(t('{label}已生成', { label: task.label }));
    } catch (e) {
      toast(t('生成失败：') + e.message, 4000);
    }
    queue.shift();
    renderQueue();
  }
  running = false;
}

function renderQueue() {
  const box = V.el && $('#vh-queue', V.el);
  if (!box) return;
  const mine = queue.filter((q) => q.groupId === V.G?.id);
  box.innerHTML = mine.length ? `<div class="ms-queue-head">${t('生成队列')} · ${mine.length}</div>
    <div class="ms-queue-list">${mine.map((task) => `
      <span class="ms-queue-item${task.running ? ' running' : ''}">
        ${task.running ? '<span class="spinner"></span>' : '⏳'} ${esc(task.label)}
        ${task.running ? '' : `<button class="ms-queue-rm" data-unqueue="${queue.indexOf(task)}" title="${t('移除')}">×</button>`}
      </span>`).join('')}</div>` : '';
  box.querySelectorAll('[data-unqueue]').forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.unqueue);
    if (queue[i] && !queue[i].running) queue.splice(i, 1);
    renderQueue();
  });
}

// ── 文件读取 ──
function readImage(file, onData) {
  if (file.size > 15 * 1024 * 1024) return toast(t('图片超过 15MB'));
  const reader = new FileReader();
  reader.onload = () => onData(reader.result);
  reader.readAsDataURL(file);
}

function pickImage(onData) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
  inp.onchange = () => inp.files[0] && readImage(inp.files[0], onData);
  inp.click();
}

// 角色参考选择器：从该成员未归档的图中选一张作参考（=设为主图），或上传新图
function openRefPicker(codename) {
  const G = V.G;
  const member = (G.data.members || []).find((m) => m.codename === codename);
  const mc = member?.color || G.data.concept.mainColor;
  const imgs = G.images.filter((i) => i.member === codename && !i.archived);

  const grid = imgs.length
    ? `<div class="refpick-grid">${imgs.map((i) => `
        <div class="refpick${i.isPrimary ? ' on' : ''}" data-pick="${i.isPrimary ? '' : esc(i.id)}">
          <img src="${esc(i.url)}" loading="lazy" alt="">
          ${i.isPrimary ? `<span class="refpick-tag">${t('参考中')}</span>` : `<span class="refpick-set">${t('设为参考')}</span>`}
        </div>`).join('')}</div>`
    : `<p class="muted" style="padding:8px 0">${t('{name} 还没有任何图像——先在下方上传，或回成员视图生成。', { name: esc(codename) })}</p>`;

  modal(`<h3>${esc(codename)} · ${t('角色参考')}</h3>
    <p class="sub" style="margin-bottom:14px">${t('选中的图会作为生成<b>团体海报</b>时喂给 AI 的角色形象（即该成员主图）。')}</p>
    ${grid}
    <div class="m-foot">
      <button class="btn btn-ghost" data-up>↑ ${t('上传新参考图')}</button>
      <button class="btn btn-primary" data-close>${t('完成')}</button>
    </div>`, {
    onMount: (mask, close) => {
      mask.querySelector('.modal').style.setProperty('--mc', mc);
      mask.querySelectorAll('.refpick[data-pick]').forEach((c) => {
        if (!c.dataset.pick) return;
        c.onclick = async () => {
          try { await api.images.setPrimary(c.dataset.pick); close(); await refresh(); }
          catch (e) { toast(t('操作失败：') + e.message, 3000); }
        };
      });
      mask.querySelector('[data-close]').onclick = close;
      mask.querySelector('[data-up]').onclick = () => pickImage(async (dataUrl) => {
        try {
          const img = await api.images.upload(G.id, codename, dataUrl);
          await api.images.setPrimary(img.id);
          toast(t('已上传并设为参考图'));
          close(); await refresh();
        } catch (e) { toast(t('上传失败：') + e.message, 3000); }
      });
    },
  });
}
