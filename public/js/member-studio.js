// 成员形象工坊 — 容貌 / 妆造 / 服饰 / 动态 / 杂志大片
// 两种用法：renderMemberStudioTab(el, G) 嵌入运营中心
import { api } from './api.js';
import { $, esc, toast, confirmModal, lightbox } from './ui.js';
import { t } from './i18n.js';
import { ART_STYLES, styleSuffix } from './style-presets.js';

function appearanceText(member) {
  const appearance = member.appearance;
  if (typeof appearance === 'string' && appearance.trim()) return appearance.trim();
  if (appearance && typeof appearance === 'object') {
    const details = [appearance.face, appearance.hair, appearance.eyes, appearance.body]
      .filter((value) => typeof value === 'string' && value.trim());
    if (details.length) return details.join(', ');
  }
  return `${member.codename}, ${member.archetype || 'idol'} archetype`;
}

// 造型设定资料（三视图 / 表情表 / 服装设定 / 姿态表）— 角色一致性锁定前置，
// 网格/编号/面板约束提炼自 awesome-gpt-image-2 的角色设定表技法
function designPrompt(m, g, style, hint) {
  const base = appearanceText(m);
  const outfit = m.fashion || 'casual idol outfit';
  const stage = m.stageOutfit || outfit;
  const anchor = `[CHARACTER LOCK — same character in every panel: face, hairstyle, body proportions and outfit details must stay identical. Character: ${base}.]`;
  const P = {
    '三视图': `Character turnaround reference sheet, exactly three full-body views side by side: FRONT, SIDE, BACK, each labeled. Neutral standing pose, identical height and proportions across all three views. Outfit: ${outfit}. ${anchor} Clean white background, flat even lighting, subtle floor shadow, professional production art quality. No perspective distortion, no extra characters, no background props.`,
    '表情表': `Character expression sheet, 3x3 grid of nine head-and-shoulders portraits separated by thin divider lines, each panel labeled in small text: neutral, smile, laugh, angry, sad, surprised, shy, smug, crying. ${anchor} Same camera angle and framing in every panel — only the facial expression changes. Clean white background, anime production reference style.`,
    '服装设定': `Character costume design sheet: the same character shown in three full-body outfits side by side — daily wear (${outfit}), stage costume (${stage}), practice wear. Thin callout lines with short notes pointing to key accessories and fabric details. ${anchor} Clean white background, fashion design reference quality. No extra characters.`,
    '姿态表': `Character pose reference sheet, 2x3 grid of six full-body poses with panel numbers 1-6: standing idle, walking, signature dance move, sitting, waving to fans, jumping. Consistent outfit: ${outfit}. ${anchor} Clean white background, dynamic but readable silhouettes, animation reference quality.`,
  };
  return `${P[style] || P['三视图']} Color accent: ${m.color}.${hint ? ' ' + hint : ''}`;
}

// ── 提示词骨架：锁定区 + 自由区 ──────────────────────────────────
// 锁定：美术风格、面部特征、体型比例（必须与参考图一致）
// 自由：姿态、服饰、表情、环境、光线、氛围（按本次需求自由发挥）
function lockBlock(m) {
  const ap = m.appearance || {};
  const face = [ap.face, ap.hair, ap.eyes].filter(Boolean).join('; ');
  const body = [ap.body, m.heightFeel].filter(Boolean).join('; ');
  return `[CHARACTER LOCK — these must stay EXACTLY consistent with the reference images and NEVER change: `
    + `facial features (${face || 'as shown in the reference images'}); `
    + `body type and proportions (${body || 'as shown in the reference images'}); `
    + `and one consistent art style throughout.]`;
}
function freeBlock(intent, hint) {
  return `[CREATIVE FREEDOM — pose, expression, outfit styling, environment, background, lighting and mood are yours to design freely, as long as they serve this request:] `
    + `${intent}${hint ? `. Extra request: ${hint}` : ''}`;
}

// ── 内容类型 ──────────────────────────────────────────────────────
export const CATS = [
  {
    id: 'design', label: '造型设定',
    desc: '角色设定资料：三视图 / 表情表 / 服装设定 / 姿态表',
    styles: ['三视图', '表情表', '服装设定', '姿态表'],
    size: '1536x1024',
    sizeByStyle: { '表情表': '1024x1024' },
    prompt: designPrompt,
  },
  {
    id: 'portrait', label: '容貌写真',
    desc: '人像 / 半身 / 侧脸，呈现角色核心气质',
    styles: ['日系清新', '韩系精致', '古典端庄', '中性帅气'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `Idol portrait of ${m.codename}. ${lockBlock(m)} ${freeBlock(`${style} portrait, head-and-shoulders to half body, magazine quality. Group vibe: ${g.vibe || 'youthful'}. Accent color ${m.color}`, hint)}`,
  },
  {
    id: 'makeup', label: '妆造设计',
    desc: '聚焦面部的美妆特写，展示不同妆容风格',
    styles: ['清透裸妆', '复古红唇', '舞台浓妆', '创意个性'],
    size: '1024x1024',
    prompt: (m, g, style, hint) =>
      `Beauty close-up of idol ${m.codename}, focused on makeup design. ${lockBlock(m)} ${freeBlock(`${style} makeup look, beauty-magazine quality. Design the makeup, expression, hair styling detail and backdrop freely around palette ${m.color}. Group vibe: ${g.vibe || 'fresh'}`, hint)}`,
  },
  {
    id: 'outfit', label: '服饰造型',
    desc: '全身造型，演出服 / 街拍 / 制服等场景',
    styles: ['演出舞台服', '街拍日常风', '制服学院风', '杂志高定'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `Full-body fashion look of idol ${m.codename}. ${lockBlock(m)} ${freeBlock(`outfit direction: ${style} — design the garments, accessories, pose, setting and lighting freely (wardrobe inspiration, optional: ${m.fashion || 'stylist decides'}). Concept: ${g.concept || g.name}. Accent color ${m.color}. Editorial quality`, hint)}`,
  },
  {
    id: 'dynamic', label: '动态写真',
    desc: '抓住动作瞬间：舞台高光 / 奔跑 / 日常',
    styles: ['舞台高光', '奔跑跳跃', '封面 Pose', '日常温柔'],
    size: '1536x1024',
    prompt: (m, g, style, hint) =>
      `Dynamic action shot of idol ${m.codename}. ${lockBlock(m)} ${freeBlock(`the moment: ${style} — choreograph the motion, expression, outfit, environment and cinematic lighting freely. Concept: ${g.concept || g.name}. Accent color ${m.color}`, hint)}`,
  },
  {
    id: 'editorial', label: '杂志大片',
    desc: '高时尚感编辑风格，适合海报与宣传物料',
    styles: ['封面故事', '时尚大片', '概念艺术', '全身时装'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `High-fashion magazine editorial of idol ${m.codename}. ${lockBlock(m)} ${freeBlock(`editorial theme: ${style} — art-direct the styling, pose, expression, set design, atmosphere and lighting freely, luxury quality. Group aesthetic: ${g.vibe || g.concept || g.name}. Color scheme around ${m.color}`, hint)}`,
  },
];

// ── 嵌入运营中心的入口 ────────────────────────────────────────────
export function renderMemberStudioTab(el, G) {
  // 展示成员选择网格
  const members = G.data.members || [];
  el.innerHTML = `
    <div class="ms-tab-wrap">
      <div style="padding:0 0 12px">
        <div class="en-label">MEMBER STUDIO</div>
        <p class="sub">${t('选择成员，生成造型设定 · 容貌写真 · 妆造设计 · 服饰造型 · 动态写真 · 杂志大片')}</p>
      </div>
      <div class="ms-member-grid">
        ${members.map((m) => {
          const photo = G.images.find((i) => i.member === m.codename && i.isPrimary);
          const count = G.images.filter((i) => i.member === m.codename && !i.archived && CATS.map((c) => c.id).includes(i.kind)).length;
          return `<button class="ms-member-card" data-codename="${esc(m.codename)}" style="--mc:${esc(m.color)}">
            <div class="ms-mc-photo">
              ${photo ? `<img src="${esc(photo.url)}" alt="">` : `<span class="ms-mc-sym">${esc(m.codename.slice(0, 2))}</span>`}
            </div>
            <span class="ms-mc-enter">${t('进入创作间')}</span>
            <div class="ms-mc-body">
              <div class="ms-mc-name"><span class="ms-mc-color"></span>${esc(m.codename)}</div>
              <div class="ms-mc-meta">${esc(t(m.archetype || ''))}</div>
              ${count ? `<div class="ms-mc-count">${t('{count} 张图像', { count })}</div>` : ''}
            </div>
          </button>`;
        }).join('')}
      </div>
    </div>`;

  el.querySelectorAll('.ms-member-card').forEach((btn) => {
    btn.onclick = () => renderInlineStudio(el, G, btn.dataset.codename);
  });
}

// ── 角色参考图：主图 + 最新造型设定图（与服务端规则一致，最多 4 张） ──
export function refsFor(G, M) {
  const mine = G.images.filter((i) => i.member === M.codename && !i.archived);
  const picked = mine.filter((i) => i.kind === 'design').slice(0, 3);
  const primary = mine.find((i) => i.isPrimary);
  if (primary && !picked.some((i) => i.id === primary.id)) picked.unshift(primary);
  return picked.slice(0, 4);
}

// ── 生成队列：点击即入队，逐个执行，完成后只刷新图库不打断编辑 ──
const genQueue = [];
let queueRunning = false;
let onQueueChange = null;   // 当前面板的队列条刷新回调
let onTaskDone = null;      // 当前面板的图库刷新回调

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (genQueue.length) {
    const task = genQueue[0];
    task.running = true;
    onQueueChange?.();
    try {
      const img = await api.images.generate(task.G.id, task.codename, task.prompt, task.size, 'medium', task.catId, task.useRef);
      task.G.images.unshift({ ...img });
      toast(t('{label}已生成', { label: task.label }));
    } catch (e) {
      toast(t('生成失败：') + e.message, 3500);
    }
    genQueue.shift();
    onQueueChange?.();
    onTaskDone?.(task);
  }
  queueRunning = false;
}

function queueHTML() {
  if (!genQueue.length) return '';
  return `<div class="ms-queue-head">${t('生成队列')} · ${genQueue.length}</div>
    <div class="ms-queue-list">${genQueue.map((task, i) => `
      <span class="ms-queue-item${task.running ? ' running' : ''}">
        ${task.running ? '<span class="spinner"></span>' : '⏳'} ${esc(task.codename)} · ${esc(task.label)}
        ${task.running ? '' : `<button class="ms-queue-rm" data-unqueue="${i}" title="${t('移除')}">×</button>`}
      </span>`).join('')}</div>`;
}

function bindQueue(el) {
  const box = $('#ms-queue', el);
  if (!box) return;
  box.innerHTML = queueHTML();
  box.querySelectorAll('[data-unqueue]').forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.unqueue);
    if (!genQueue[i]?.running) genQueue.splice(i, 1);
    bindQueue(el);
  });
}

// ── 单成员创作间（inline） ────────────────────────────────────────
function renderInlineStudio(el, G, codename) {
  const M = (G.data.members || []).find((m) => m.codename === codename);
  if (!M) return;

  let activeCat = CATS[0].id;

  function render() {
    const photo = G.images.find((i) => i.member === M.codename && i.isPrimary);
    el.innerHTML = `
      <div class="ms-tab-wrap">
        <div class="ms-inline-header" style="--mc:${esc(M.color)}">
          <div class="ms-inline-top">
            <button class="btn btn-ghost btn-sm" id="ms-back">← ${t('所有成员')}</button>
            <div class="ms-inline-photo">
              ${photo ? `<img src="${esc(photo.url)}" alt="">` : `<span>${esc(M.codename.slice(0,2))}</span>`}
            </div>
            <div>
              <div style="font-weight:800;font-size:17px;color:var(--ink)">${esc(M.codename)}</div>
              <div class="muted" style="font-size:12px">${esc(t(M.archetype || ''))}${M.ageFeel ? ' · ' + esc(M.ageFeel) : ''}</div>
            </div>
          </div>
          <nav class="ms-inline-cats">
            ${CATS.map((cat) => {
              const n = G.images.filter((i) => i.member === M.codename && i.kind === cat.id && !i.archived).length;
              return `<button class="ms-cat-btn${cat.id === activeCat ? ' active' : ''}" data-cat="${esc(cat.id)}" style="--mc:${esc(M.color)}">
                ${esc(t(cat.label))}${n ? ` <span class="ms-cat-count">${n}</span>` : ''}
              </button>`;
            }).join('')}
          </nav>
          <div class="ms-style-lock">
            <span class="ms-lock-label" title="${t('锁定后，本企划所有生成将强制统一画风，并严格跟随参考图画风')}">🎨 ${t('画风锁定')}</span>
            <button class="chip-mini${!G.data.artStyle ? ' on' : ''}" data-artstyle="">${t('跟随原图（默认）')}</button>
            ${ART_STYLES.map((a) => `<button class="chip-mini${G.data.artStyle === a.key ? ' on' : ''}" data-artstyle="${esc(a.key)}">${esc(t(a.label))}</button>`).join('')}
          </div>
        </div>
        <div id="ms-studio-body"></div>
      </div>`;

    $('#ms-back', el).onclick = () => renderMemberStudioTab(el, G);
    el.querySelectorAll('.ms-cat-btn').forEach((btn) => {
      btn.onclick = () => { activeCat = btn.dataset.cat; render(); };
    });

    // 画风锁定：企划级设置，保存后全部生成提示词统一注入
    el.querySelectorAll('[data-artstyle]').forEach((b) => b.onclick = async () => {
      const v = b.dataset.artstyle;
      if ((G.data.artStyle || '') === v) return;
      if (v) G.data.artStyle = v; else delete G.data.artStyle;
      try {
        await api.groups.update(G.id, G.data);
        toast(v
          ? t('画风已锁定：{label}', { label: t(ART_STYLES.find((a) => a.key === v).label) })
          : t('已解除画风锁定'));
      } catch (e) { toast(t('保存失败：') + e.message, 3000); }
      render();
    });

    renderCatPanel($('#ms-studio-body', el), G, M, activeCat, render);
  }

  render();
}

function renderCatPanel(el, G, M, catId, rerender) {
  const cat = CATS.find((c) => c.id === catId);
  const refs = refsFor(G, M);
  // 组合最终提示词：模板 + 画风锁定后缀（含跟随参考图画风指令）
  const compose = (style, hint) => cat.prompt(M, G.data.concept, style, hint) + styleSuffix(G, { hasRefs: refs.length > 0 });

  el.innerHTML = `
    <div class="card ms-gen-panel">
      <div class="ms-gen-head">
        <strong>${esc(t(cat.label))}</strong>
        <span class="muted">${esc(t(cat.desc))}</span>
      </div>
      <div class="ms-step-label">① ${t('第 1 步 · 选择风格与要求')}</div>
      <div class="ms-style-row">
        ${cat.styles.map((s) => `<button class="ms-style-chip" data-style="${esc(s)}">${esc(t(s))}</button>`).join('')}
      </div>
      <div class="ms-gen-row">
        <input id="ms-hint" type="text" placeholder="${t('附加要求（可选）')}">
        <button class="btn btn-ghost" id="ms-compose">📝 ${t('生成提示词')}</button>
      </div>
      <div class="ms-ref-row">
        ${refs.length
          ? `<label class="ms-ref-toggle">
              <input type="checkbox" id="ms-useref" checked>
              ${refs.map((r) => `<img src="${esc(r.url)}" alt="">`).join('')}
              <span>${t('以主图与造型设定图为角色参考（{n} 张）', { n: refs.length })}</span>
            </label>`
          : `<span class="ms-ref-none">💡 ${t('还没有参考图——先在「造型设定」出三视图，或把一张图设为主图，之后生成会自动携带参考保持角色一致')}</span>`}
      </div>
      <div class="ms-step-label">② ${t('第 2 步 · 确认提示词并生图')}</div>
      <div class="ms-prompt-box">
        <div class="ms-prompt-head">
          <span class="ms-prompt-label">${t('提示词可自由修改，生图将严格使用此文本')}</span>
        </div>
        <textarea id="ms-prompt" rows="5">${esc(compose(cat.styles[0], ''))}</textarea>
      </div>
      <div class="ms-gen-actions">
        <button class="btn btn-primary" id="ms-gen-btn">✦ ${t('加入生成队列')}</button>
      </div>
      <div class="ms-queue" id="ms-queue"></div>
    </div>
    <div class="ms-gallery" id="ms-gallery"></div>`;

  let selectedStyle = cat.styles[0];

  // 两步流：第 1 步改选项只做标记提醒，点「生成提示词」调用文字模型按角色档案动态创作
  // （本地模板只作草稿骨架与失败兜底）；第 2 步生图严格用文本框内容
  const promptTa = $('#ms-prompt', el);
  const composeBtn = $('#ms-compose', el);
  const markStale = () => composeBtn?.classList.add('attn');
  const doCompose = async () => {
    if (!promptTa) return;
    const hint = $('#ms-hint', el)?.value.trim() || '';
    const draft = compose(selectedStyle, hint);
    composeBtn.disabled = true;
    composeBtn.innerHTML = `<span class="spinner"></span> ${t('AI 创作中…')}`;
    try {
      const r = await api.stage('imagePrompt', {
        member: {
          codename: M.codename, archetype: M.archetype, personality: M.personality,
          appearance: M.appearance, fashion: M.fashion, stageOutfit: M.stageOutfit,
          accessories: M.accessories, color: M.color, contrast: M.contrast,
        },
        concept: `《${G.data.concept.name}》${G.data.concept.concept || ''}（气质：${G.data.concept.vibe || ''}；视觉：${G.data.concept.visualStyle || ''}）`,
        task: `${t(cat.label)} / ${t(selectedStyle)}`,
        hint,
        draft,
      });
      let out = r.prompt;
      const suf = styleSuffix(G, { hasRefs: refs.length > 0 });
      if (suf && !/ART STYLE LOCK/i.test(out)) out += suf;
      promptTa.value = out;
    } catch (e) {
      promptTa.value = draft;
      toast(t('AI 创作失败，已使用本地模板：') + e.message, 3500);
    }
    composeBtn.disabled = false;
    composeBtn.innerHTML = `📝 ${t('生成提示词')}`;
    composeBtn.classList.remove('attn');
  };
  if (composeBtn) composeBtn.onclick = doCompose;
  const hintInput = $('#ms-hint', el);
  if (hintInput) hintInput.oninput = markStale;
  $('#ms-useref', el)?.addEventListener('change', markStale);

  el.querySelectorAll('.ms-style-chip').forEach((chip) => {
    if (chip.dataset.style === selectedStyle) chip.classList.add('on');
    chip.onclick = () => {
      el.querySelectorAll('.ms-style-chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      selectedStyle = chip.dataset.style;
      markStale();
    };
  });

  // 入队即返回，可连续排多个风格；队列逐个执行
  $('#ms-gen-btn', el).onclick = () => {
    const prompt = promptTa?.value.trim() || compose(selectedStyle, $('#ms-hint', el)?.value.trim() || '');
    const useRef = refs.length > 0 && ($('#ms-useref', el)?.checked ?? true);
    const label = `${t(cat.label)} · ${t(selectedStyle)}`;
    genQueue.push({
      G, codename: M.codename, catId: cat.id, prompt, useRef, label,
      size: cat.sizeByStyle?.[selectedStyle] || cat.size,
    });
    bindQueue(el);
    toast(t('已加入队列：{label}', { label }));
    runQueue();
  };

  renderGallery(el, G, M, catId, rerender);
  bindQueue(el);

  // 队列回调只更新受影响区域，不打断当前编辑
  onQueueChange = () => { if (el.isConnected) bindQueue(el); };
  onTaskDone = (task) => {
    if (!el.isConnected) return;
    if (task.codename === M.codename && task.catId === catId) renderGallery(el, G, M, catId, rerender);
  };
}

function renderGallery(el, G, M, catId, rerender) {
  const box = $('#ms-gallery', el);
  if (!box) return;
  const all = G.images.filter((i) => i.member === M.codename && i.kind === catId);
  const active = all.filter((i) => !i.archived);
  const archived = all.filter((i) => i.archived);

  box.innerHTML = `
    ${active.length
      ? active.map((img) => imgCard(img, false)).join('')
      : `<div class="ms-empty">${t('完成上方两步后，图像将展示在这里')}</div>`}
    ${archived.length ? `<details class="ms-archive">
      <summary>📦 ${t('归档区（{n}）', { n: archived.length })} · <span class="muted">${t('可在此恢复或彻底删除')}</span></summary>
      <div class="ms-archive-list">${archived.map((img) => imgCard(img, true)).join('')}</div>
    </details>` : ''}`;

  box.querySelectorAll('.ms-img-card img').forEach((im) => {
    im.onclick = () => lightbox(im.src);
  });

  box.querySelectorAll('[data-set-primary]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.images.setPrimary(btn.dataset.setPrimary);
        G.images.forEach((i) => {
          if (i.member === M.codename) i.isPrimary = i.id === btn.dataset.setPrimary;
        });
        toast(t('已设为主图'));
        rerender();
      } catch (e) { toast(t('操作失败'), 2500); }
    };
  });

  // 归档 / 恢复（软删除层）
  box.querySelectorAll('[data-archive]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.images.archive(btn.dataset.archive, true);
        const img = G.images.find((i) => i.id === btn.dataset.archive);
        if (img) img.archived = true;
        toast(t('已归档'));
        rerender();
      } catch (e) { toast(t('操作失败：') + e.message, 3000); }
    };
  });
  box.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.images.archive(btn.dataset.restore, false);
        const img = G.images.find((i) => i.id === btn.dataset.restore);
        if (img) img.archived = false;
        toast(t('已恢复'));
        rerender();
      } catch (e) { toast(t('操作失败：') + e.message, 3000); }
    };
  });

  // 彻底删除：只出现在归档区
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!await confirmModal(t('彻底删除'), t('确定彻底删除这张图？此操作不可恢复。'))) return;
      try {
        await api.images.remove(btn.dataset.del);
        G.images = G.images.filter((i) => i.id !== btn.dataset.del);
        toast(t('已删除'));
        rerender();
      } catch (e) { toast(t('删除失败'), 2500); }
    };
  });
}

function imgCard(img, inArchive) {
  return `
    <div class="ms-img-card${img.isPrimary ? ' is-primary' : ''}${inArchive ? ' is-archived' : ''}" data-id="${esc(img.id)}">
      <img src="${esc(img.url)}" alt="" loading="lazy">
      <div class="ms-img-acts">
        ${inArchive
          ? `<button class="btn btn-sm" data-restore="${esc(img.id)}">${t('恢复')}</button>
             <button class="btn btn-sm btn-danger" data-del="${esc(img.id)}">${t('删除')}</button>`
          : `${!img.isPrimary ? `<button class="btn btn-sm" data-set-primary="${esc(img.id)}">${t('设为主图')}</button>` : `<span class="ms-primary-tag">${t('主图')}</span>`}
             ${!img.isPrimary ? `<button class="btn btn-sm" data-archive="${esc(img.id)}" title="${t('归档后可在归档区删除')}">📦 ${t('归档')}</button>` : ''}`}
      </div>
    </div>`;
}
