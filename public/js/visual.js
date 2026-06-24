// 视觉车间 — 编辑部版式（2026-06）
// 布局：主体选择条 → 主图 hero + 生成控制 → 图库
import { api } from './api.js';
import { $, esc, toast, modal, confirmModal, segmented } from './ui.js';
import { appConfig } from './main.js';

let target = '__poster__';

export function renderVisualTab(el, G, reload) {
  const members = G.data.members || [];
  if (target !== '__poster__' && !members.some((m) => m.codename === target)) target = '__poster__';

  const slots = [
    { t: '__poster__', label: '团体海报', sub: '封面主视觉', color: G.data.concept.mainColor },
    ...members.map((m) => ({ t: m.codename, label: m.codename, sub: m.archetype || '', color: m.color })),
  ];

  el.innerHTML = `<div class="ppl-shell">
    <aside class="ppl-rail">
      <div class="rail-label">视觉对象</div>
      ${slots.map((s) => {
        const photo = G.images.find((i) =>
          s.t === '__poster__' ? (i.member === '' && i.isPrimary) : (i.member === s.t && i.isPrimary)
        );
        const active = target === s.t;
        return `<button class="rail-item${active ? ' active' : ''}" data-t="${esc(s.t)}" style="--mc:${esc(s.color)}">
          <span class="rail-thumb">${photo
            ? `<img src="${esc(photo.url)}" alt="">`
            : `<span class="rail-ph">${s.t === '__poster__' ? '✦' : esc(s.label.slice(0, 1))}</span>`}</span>
          <span class="rail-txt"><span class="rail-name">${esc(s.label)}</span><span class="rail-arch">${esc(s.sub)}</span></span>
        </button>`;
      }).join('')}
    </aside>
    <section class="ppl-main" id="vis-panel"></section>
  </div>`;

  el.querySelectorAll('.rail-item').forEach((btn) => {
    btn.onclick = () => { target = btn.dataset.t; renderVisualTab(el, G, reload); };
  });

  renderPanel($('#vis-panel', el), G, reload);
}

function renderPanel(el, G, reload) {
  const isPoster = target === '__poster__';
  const m = isPoster ? null : (G.data.members || []).find((x) => x.codename === target);
  const imgs = G.images.filter((i) => i.member === (isPoster ? '' : target));
  const primary = imgs.find((i) => i.isPrimary);
  const genOK = appConfig.imageGen;
  const mc = m?.color || G.data.concept.mainColor;

  // 成员造型预设（中文提示词，从角色设定描述拼出）
  const ap = m?.appearance || {};
  const look = m ? [ap.face, ap.hair, ap.eyes].filter(Boolean).join('，') : '';
  const presets = m ? [
    { key: 'base',  label: '基础立绘', prompt: `${m.codename}，${look}，日常穿搭：${m.fashion || ''}，全身立绘，时尚插画风格，纯白背景，超精细` },
    { key: 'stage', label: '舞台造型', prompt: `${m.codename}，${look}，舞台造型：${m.stageOutfit || m.fashion || ''}，全身，演出舞台，时尚插画风格，纯白背景，超精细` },
    { key: 'daily', label: '日常造型', prompt: `${m.codename}，${look}，日常造型：${m.fashion || ''}，全身，时尚插画风格，纯白背景，超精细` },
  ] : [];

  const defaultP = isPoster
    ? (() => {
        const n = G.data.members.length;
        const c = G.data.concept;
        const base = G.data.operations?.posterIdeas?.[0]?.desc
          || `虚拟偶像团体《${c.name}》团体海报，${c.visualStyle || ''}，全体成员同框，戏剧化光影，官方主视觉，超精细`;
        return `${base}，正好 ${n} 人，画面只有这 ${n} 个角色`;
      })()
    : presets[0]?.prompt || '';

  const subjectLabel = isPoster ? '团体海报' : esc(m.codename);
  const subjectSub = isPoster ? '封面主视觉 · GROUP POSTER' : `${esc(m.archetype || '')}${m.ageFeel ? '　·　' + esc(m.ageFeel) : ''}`;

  // 海报角色参考
  const refStrip = isPoster ? (() => {
    const refs = (G.data.members || []).map((mm) => {
      const p = G.images.find((i) => i.member === mm.codename && i.isPrimary);
      return { codename: mm.codename, color: mm.color, url: p?.url };
    });
    return `<div class="vis-refs">
      <div class="vis-refs-head">
        <span class="vis-refs-label">角色参考</span>
        <span class="muted" style="font-size:11.5px">生成海报时喂给 AI 的角色形象 · 点卡片可换图</span>
      </div>
      <div class="vis-ref-list">
        ${refs.map((r) => `<button class="vis-ref-card${r.url ? '' : ' empty'}" data-ref-member="${esc(r.codename)}" style="--mc:${esc(r.color)}">
          <div class="vis-ref-thumb">${r.url ? `<img src="${esc(r.url)}" alt="">` : `<span>＋</span>`}</div>
          <span class="vis-ref-name">${esc(r.codename)}</span>
          <span class="vis-ref-hint">${r.url ? '换图' : '选图'}</span>
        </div>`).join('')}
      </div>
    </div>`;
  })() : '';

  el.innerHTML = `
    <div class="vis-stage" style="--mc:${esc(mc)}">
      <div class="ed-topline">
        <span class="ed-kicker">STARFORM / VISUAL</span>
        <span class="ed-index">${isPoster ? '团体海报' : esc(m.codename)}　·　${imgs.length} 张</span>
      </div>

      <div class="vis-layout">
        <figure class="vis-hero">
          ${primary
            ? `<img src="${esc(primary.url)}" alt="">`
            : `<div class="vis-hero-ph"><span>✦</span><p>还没有主图<br>生成或上传后设为主图</p></div>`}
        </figure>

        <div class="vis-control">
          <div class="ed-en">${isPoster ? 'GROUP POSTER' : '主图设定'}</div>
          <h2 class="vis-subject">${subjectLabel}</h2>
          <div class="vis-subject-sub">${subjectSub}</div>
          <div class="ed-rule"></div>

          ${refStrip}

          ${m ? `<div class="vis-presets">
            <span class="vis-presets-label">造型预设</span>
            ${presets.map((p) => `<button class="vis-preset-chip" data-prompt="${esc(p.prompt)}">${esc(p.label)}</button>`).join('')}
          </div>` : ''}

          <details class="vis-prompt-detail">
            <summary>自定义提示词</summary>
            <textarea id="vs-prompt" rows="4">${esc(defaultP)}</textarea>
          </details>

          <div class="vis-opt-row">
            <span class="vis-opt-label">尺寸</span>
            ${segmented('vs-size', [
              { value: '1024x1536', label: '竖版' },
              { value: '1536x1024', label: '横版' },
              { value: '1024x1024', label: '方形' },
            ], isPoster ? '1536x1024' : '1024x1536')}
          </div>
          <div class="vis-opt-row">
            <span class="vis-opt-label">质量</span>
            ${segmented('vs-quality', [
              { value: 'medium', label: '标准' },
              { value: 'high', label: '高清' },
              { value: 'low', label: '草图' },
            ], 'medium')}
          </div>
          <div class="vis-gen-row">
            <button class="btn btn-primary" id="vs-gen" ${genOK ? '' : 'disabled'}>✦ AI 生成</button>
            <button class="btn btn-ghost" id="vs-upload">↑ ${isPoster ? '上传海报' : '上传主图'}</button>
          </div>

          ${!genOK ? `<p class="muted" style="color:var(--err);font-size:12.5px;margin-top:8px">未配置 OPENAI_API_KEY，AI 生成不可用</p>` : ''}

          <div class="drop-zone vis-drop" id="vs-drop">拖入图片，或点「上传」选择文件（PNG / JPG / WebP ≤ 15MB）</div>
        </div>
      </div>

      ${imgs.length ? `<div class="vis-gallery-section">
        <div class="ed-sub-kicker">图库 · ${imgs.length} 张</div>
        <div class="vis-gallery">
          ${imgs.map((img) => `
            <div class="vis-thumb${img.isPrimary ? ' primary' : ''}" data-id="${esc(img.id)}" data-url="${esc(img.url)}">
              <img src="${esc(img.url)}" loading="lazy" alt="">
              ${img.isPrimary ? '<span class="vt-tag">主图</span>' : ''}
              <div class="vt-acts">
                ${img.isPrimary ? '' : '<button data-primary>设为主图</button>'}
                <button data-del>删除</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`;

  // 角色参考：点卡片选/换参考图（即该成员主图）
  el.querySelectorAll('[data-ref-member]').forEach((card) => {
    card.onclick = () => openRefPicker(G, card.dataset.refMember, reload);
  });

  // 造型预设
  el.querySelectorAll('.vis-preset-chip').forEach((chip) => {
    chip.onclick = () => {
      const ta = $('#vs-prompt', el);
      if (ta) ta.value = chip.dataset.prompt;
      const d = el.querySelector('.vis-prompt-detail');
      if (d) d.open = true;
    };
  });

  // AI 生成
  $('#vs-gen', el).onclick = async () => {
    const btn = $('#vs-gen', el);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    const prompt = ($('#vs-prompt', el)?.value || defaultP).trim();
    try {
      await api.images.generate(G.id, isPoster ? '' : target, prompt,
        $('#vs-size', el).value, $('#vs-quality', el).value);
      toast('生成完成');
      await reload();
    } catch (e) {
      toast('生成失败：' + e.message, 4000);
      btn.disabled = false;
      btn.textContent = '✦ AI 生成';
    }
  };

  // 上传
  const uploadFile = (file) => {
    if (file.size > 15 * 1024 * 1024) return toast('图片超过 15MB');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.images.upload(G.id, isPoster ? '' : target, reader.result);
        toast('上传成功');
        await reload();
      } catch (e) { toast('上传失败：' + e.message, 3000); }
    };
    reader.readAsDataURL(file);
  };
  const pickFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
    inp.onchange = () => inp.files[0] && uploadFile(inp.files[0]);
    inp.click();
  };
  $('#vs-upload', el).onclick = pickFile;
  const drop = $('#vs-drop', el);
  drop.onclick = pickFile;
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); };

  // 图库操作
  el.querySelector('.vis-gallery')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.vis-thumb');
    if (!t) return;
    if (e.target.closest('[data-primary]')) { await api.images.setPrimary(t.dataset.id); toast('已设为主图'); return reload(); }
    if (e.target.closest('[data-del]')) {
      if (await confirmModal('删除图片', '确定删除吗？')) { await api.images.remove(t.dataset.id); return reload(); }
      return;
    }
    modal(`<img src="${esc(t.dataset.url)}" style="width:100%;border-radius:12px" alt="">`);
  });
}

// 角色参考选择器：从该成员已有图像中选一张作参考（=设为主图），或上传新图
function openRefPicker(G, codename, reload) {
  const member = (G.data.members || []).find((m) => m.codename === codename);
  const mc = member?.color || G.data.concept.mainColor;
  const imgs = G.images.filter((i) => i.member === codename);

  const grid = imgs.length
    ? `<div class="refpick-grid">${imgs.map((i) => `
        <div class="refpick${i.isPrimary ? ' on' : ''}" data-id="${esc(i.id)}" data-pick="${i.isPrimary ? '' : esc(i.id)}">
          <img src="${esc(i.url)}" loading="lazy" alt="">
          ${i.isPrimary ? '<span class="refpick-tag">参考中</span>' : '<span class="refpick-set">设为参考</span>'}
        </div>`).join('')}</div>`
    : `<p class="muted" style="padding:8px 0">${esc(codename)} 还没有任何图像——先在下方上传，或回成员视图生成。</p>`;

  modal(`<h3>${esc(codename)} · 角色参考</h3>
    <p class="sub" style="margin-bottom:14px">选中的图会作为生成<b>团体海报</b>时喂给 AI 的角色形象（即该成员主图）。</p>
    ${grid}
    <div class="m-foot">
      <button class="btn btn-ghost" data-up>↑ 上传新参考图</button>
      <button class="btn btn-primary" data-close>完成</button>
    </div>`, {
    onMount: (mask, close) => {
      mask.querySelector('.modal').style.setProperty('--mc', mc);
      mask.querySelectorAll('.refpick[data-pick]').forEach((c) => {
        if (!c.dataset.pick) return;
        c.onclick = async () => { await api.images.setPrimary(c.dataset.pick); close(); await reload(); };
      });
      mask.querySelector('[data-close]').onclick = close;
      mask.querySelector('[data-up]').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
        inp.onchange = () => {
          const file = inp.files[0];
          if (!file) return;
          if (file.size > 15 * 1024 * 1024) return toast('图片超过 15MB');
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const img = await api.images.upload(G.id, codename, reader.result);
              await api.images.setPrimary(img.id);
              toast('已上传并设为参考图');
              close(); await reload();
            } catch (e) { toast('上传失败：' + e.message, 3000); }
          };
          reader.readAsDataURL(file);
        };
        inp.click();
      };
    },
  });
}
