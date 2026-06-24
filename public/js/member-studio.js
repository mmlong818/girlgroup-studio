// 成员形象工坊 — 容貌 / 妆造 / 服饰 / 动态 / 杂志大片
// 两种用法：renderMemberStudioTab(el, G) 嵌入运营中心
import { api } from './api.js';
import { $, esc, toast, confirmModal } from './ui.js';

// ── 内容类型 ──────────────────────────────────────────────────────
export const CATS = [
  {
    id: 'portrait', label: '容貌写真',
    desc: '人像 / 半身 / 侧脸，呈现角色核心气质',
    styles: ['日系清新', '韩系精致', '古典端庄', '中性帅气'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `${style} style Korean idol portrait photography. Character: ${m.appearance || `${m.codename}, ${m.archetype} archetype`}. Vibe: ${g.vibe || 'youthful'}. Accent color: ${m.color}. Soft studio lighting, film grain.${hint ? ' ' + hint : ''}`,
  },
  {
    id: 'makeup', label: '妆造设计',
    desc: '聚焦面部的美妆特写，展示不同妆容风格',
    styles: ['清透裸妆', '复古红唇', '舞台浓妆', '创意个性'],
    size: '1024x1024',
    prompt: (m, g, style, hint) =>
      `${style} Korean idol makeup look, close-up beauty portrait. Character: ${m.appearance || m.codename}. Group vibe: ${g.vibe || 'fresh'}. Color palette: ${m.color}. Flawless skin, beauty magazine quality.${hint ? ' ' + hint : ''}`,
  },
  {
    id: 'outfit', label: '服饰造型',
    desc: '全身造型，演出服 / 街拍 / 制服等场景',
    styles: ['演出舞台服', '街拍日常风', '制服学院风', '杂志高定'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `Full body ${style} fashion photography. Korean idol: ${m.appearance || m.codename}, ${m.archetype} type. Concept: ${g.concept || g.name}. Color accent ${m.color}. Clean background, editorial quality.${hint ? ' ' + hint : ''}`,
  },
  {
    id: 'dynamic', label: '动态写真',
    desc: '抓住动作瞬间：舞台高光 / 奔跑 / 日常',
    styles: ['舞台高光', '奔跑跳跃', '封面 Pose', '日常温柔'],
    size: '1536x1024',
    prompt: (m, g, style, hint) =>
      `${style} dynamic action photography, K-pop idol. Character: ${m.appearance || m.codename}, ${m.archetype} archetype. Cinematic lighting. Concept: ${g.concept || g.name}. Color ${m.color}.${hint ? ' ' + hint : ''}`,
  },
  {
    id: 'editorial', label: '杂志大片',
    desc: '高时尚感编辑风格，适合海报与宣传物料',
    styles: ['封面故事', '时尚大片', '概念艺术', '全身时装'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `${style} magazine editorial photography, Korean high fashion. Idol: ${m.appearance || m.codename}. Color scheme: ${m.color}. Group aesthetic: ${g.vibe || g.concept || g.name}. Art-directed, luxury.${hint ? ' ' + hint : ''}`,
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
        <p class="sub">选择成员，生成容貌写真 · 妆造设计 · 服饰造型 · 动态写真 · 杂志大片</p>
      </div>
      <div class="ms-member-grid">
        ${members.map((m) => {
          const photo = G.images.find((i) => i.member === m.codename && i.isPrimary);
          const count = G.images.filter((i) => i.member === m.codename && CATS.map((c) => c.id).includes(i.kind)).length;
          return `<button class="ms-member-card" data-codename="${esc(m.codename)}" style="--mc:${esc(m.color)}">
            <div class="ms-mc-photo">
              ${photo ? `<img src="${esc(photo.url)}" alt="">` : `<span class="ms-mc-sym">${esc(m.codename.slice(0, 2))}</span>`}
            </div>
            <span class="ms-mc-enter">进入创作间</span>
            <div class="ms-mc-body">
              <div class="ms-mc-name"><span class="ms-mc-color"></span>${esc(m.codename)}</div>
              <div class="ms-mc-meta">${esc(m.archetype || '')}</div>
              ${count ? `<div class="ms-mc-count">${count} 张图像</div>` : ''}
            </div>
          </button>`;
        }).join('')}
      </div>
    </div>`;

  el.querySelectorAll('.ms-member-card').forEach((btn) => {
    btn.onclick = () => renderInlineStudio(el, G, btn.dataset.codename);
  });
}

// ── 单成员创作间（inline） ────────────────────────────────────────
function renderInlineStudio(el, G, codename) {
  const M = (G.data.members || []).find((m) => m.codename === codename);
  if (!M) return;

  let activeCat = CATS[0].id;
  let generating = false;

  function render() {
    const photo = G.images.find((i) => i.member === M.codename && i.isPrimary);
    el.innerHTML = `
      <div class="ms-tab-wrap">
        <div class="ms-inline-header" style="--mc:${esc(M.color)}">
          <div class="ms-inline-top">
            <button class="btn btn-ghost btn-sm" id="ms-back">← 所有成员</button>
            <div class="ms-inline-photo">
              ${photo ? `<img src="${esc(photo.url)}" alt="">` : `<span>${esc(M.codename.slice(0,2))}</span>`}
            </div>
            <div>
              <div style="font-weight:800;font-size:17px;color:var(--ink)">${esc(M.codename)}</div>
              <div class="muted" style="font-size:12px">${esc(M.archetype || '')}${M.ageFeel ? ' · ' + esc(M.ageFeel) : ''}</div>
            </div>
          </div>
          <nav class="ms-inline-cats">
            ${CATS.map((cat) => {
              const n = G.images.filter((i) => i.member === M.codename && i.kind === cat.id).length;
              return `<button class="ms-cat-btn${cat.id === activeCat ? ' active' : ''}" data-cat="${esc(cat.id)}" style="--mc:${esc(M.color)}">
                ${esc(cat.label)}${n ? ` <span class="ms-cat-count">${n}</span>` : ''}
              </button>`;
            }).join('')}
          </nav>
        </div>
        <div id="ms-studio-body"></div>
      </div>`;

    $('#ms-back', el).onclick = () => renderMemberStudioTab(el, G);
    el.querySelectorAll('.ms-cat-btn').forEach((btn) => {
      btn.onclick = () => { activeCat = btn.dataset.cat; render(); };
    });

    renderCatPanel($('#ms-studio-body', el), G, M, activeCat, () => generating, (v) => { generating = v; }, render);
  }

  render();
}

function renderCatPanel(el, G, M, catId, isGenerating, setGenerating, rerender) {
  const cat = CATS.find((c) => c.id === catId);
  const imgs = G.images.filter((i) => i.member === M.codename && i.kind === catId);
  const busy = isGenerating();

  el.innerHTML = `
    <div class="card ms-gen-panel">
      <div class="ms-gen-head">
        <strong>${esc(cat.label)}</strong>
        <span class="muted">${esc(cat.desc)}</span>
      </div>
      <div class="ms-style-row">
        ${cat.styles.map((s) => `<button class="ms-style-chip${busy ? ' disabled' : ''}" data-style="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>
      <div class="ms-gen-row">
        <input id="ms-hint" type="text" placeholder="附加要求（可选）" ${busy ? 'disabled' : ''}>
        <button class="btn btn-primary" id="ms-gen-btn" ${busy ? 'disabled' : ''}>
          ${busy ? '<span class="spinner"></span> 生成中…' : '生成图像'}
        </button>
      </div>
    </div>
    <div class="ms-gallery">
      ${imgs.length
        ? imgs.map(imgCard).join('')
        : `<div class="ms-empty">选好风格后点「生成图像」，图像将展示在这里</div>`}
    </div>`;

  let selectedStyle = cat.styles[0];
  el.querySelectorAll('.ms-style-chip').forEach((chip) => {
    if (chip.dataset.style === selectedStyle) chip.classList.add('on');
    chip.onclick = () => {
      if (isGenerating()) return;
      el.querySelectorAll('.ms-style-chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      selectedStyle = chip.dataset.style;
    };
  });

  $('#ms-gen-btn', el).onclick = async () => {
    if (isGenerating()) return;
    setGenerating(true);
    rerender();
    const hint = document.getElementById('ms-hint')?.value.trim() || '';
    const prompt = cat.prompt(M, G.data.concept, selectedStyle, hint);
    try {
      const img = await api.images.generate(G.id, M.codename, prompt, cat.size, 'standard', cat.id);
      G.images.unshift({ ...img });
      toast(`${cat.label}已生成`);
    } catch (e) {
      toast('生成失败：' + e.message, 3500);
    }
    setGenerating(false);
    rerender();
  };

  el.querySelectorAll('[data-set-primary]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.images.setPrimary(btn.dataset.setPrimary);
        G.images.forEach((i) => {
          if (i.member === M.codename) i.isPrimary = i.id === btn.dataset.setPrimary;
        });
        toast('已设为主图');
        rerender();
      } catch (e) { toast('操作失败', 2500); }
    };
  });

  el.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!await confirmModal('确定删除这张图？')) return;
      try {
        await api.images.remove(btn.dataset.del);
        G.images = G.images.filter((i) => i.id !== btn.dataset.del);
        toast('已删除');
        rerender();
      } catch (e) { toast('删除失败', 2500); }
    };
  });
}

function imgCard(img) {
  return `
    <div class="ms-img-card${img.isPrimary ? ' is-primary' : ''}" data-id="${esc(img.id)}">
      <img src="${esc(img.url)}" alt="" loading="lazy">
      <div class="ms-img-acts">
        ${!img.isPrimary ? `<button class="btn btn-sm" data-set-primary="${esc(img.id)}">设为主图</button>` : '<span class="ms-primary-tag">主图</span>'}
        <button class="btn btn-sm btn-danger" data-del="${esc(img.id)}">删除</button>
      </div>
    </div>`;
}
