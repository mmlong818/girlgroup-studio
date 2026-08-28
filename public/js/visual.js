// 视觉车间 — 编辑部版式（2026-06）
// 布局：主体选择条 → 主图 hero + 生成控制 → 图库
import { api } from './api.js';
import { $, esc, toast, modal, confirmModal, segmented, lightbox } from './ui.js';
import { appConfig } from './main.js';
import { memberPresets, posterPresets } from './style-presets.js';
import { refsFor } from './member-studio.js';
import { t } from './i18n.js';

let target = '__poster__';

export function renderVisualTab(el, G, reload) {
  const members = G.data.members || [];
  if (target !== '__poster__' && !members.some((m) => m.codename === target)) target = '__poster__';

  const slots = [
    { t: '__poster__', label: t('团体海报'), sub: t('封面主视觉'), color: G.data.concept.mainColor },
    ...members.map((m) => ({ t: m.codename, label: m.codename, sub: m.archetype || '', color: m.color })),
  ];

  el.innerHTML = `<div class="ppl-shell">
    <aside class="ppl-rail">
      <div class="rail-label">${t('视觉对象')}</div>
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
  const allImgs = G.images.filter((i) => i.member === (isPoster ? '' : target));
  const imgs = allImgs.filter((i) => !i.archived);
  const archivedImgs = allImgs.filter((i) => i.archived);
  const primary = imgs.find((i) => i.isPrimary);
  const refs = m ? refsFor(G, m) : [];
  const genOK = appConfig.imageGen;
  const mc = m?.color || G.data.concept.mainColor;

  // 风格模板（style-presets.js，提炼自 awesome-gpt-image-2 提示词库）
  const presets = m ? memberPresets(m, G) : posterPresets(G);

  const defaultP = isPoster
    ? (() => {
        const n = G.data.members.length;
        const idea = G.data.operations?.posterIdeas?.[0]?.desc;
        return idea
          ? `${idea}，正好 ${n} 人，画面只有这 ${n} 个角色`
          : presets[0]?.prompt || '';
      })()
    : presets[0]?.prompt || '';

  const subjectLabel = isPoster ? t('团体海报') : esc(m.codename);
  const subjectSub = isPoster ? t('封面主视觉') + ' · GROUP POSTER' : `${esc(m.archetype || '')}${m.ageFeel ? '　·　' + esc(m.ageFeel) : ''}`;

  // 海报角色参考
  const refStrip = isPoster ? (() => {
    const refs = (G.data.members || []).map((mm) => {
      const p = G.images.find((i) => i.member === mm.codename && i.isPrimary);
      return { codename: mm.codename, color: mm.color, url: p?.url };
    });
    return `<div class="vis-refs">
      <div class="vis-refs-head">
        <span class="vis-refs-label">${t('角色参考')}</span>
        <span class="muted" style="font-size:11.5px">${t('生成海报时喂给 AI 的角色形象 · 点卡片可换图')}</span>
      </div>
      <div class="vis-ref-list">
        ${refs.map((r) => `<button class="vis-ref-card${r.url ? '' : ' empty'}" data-ref-member="${esc(r.codename)}" style="--mc:${esc(r.color)}">
          <div class="vis-ref-thumb">${r.url ? `<img src="${esc(r.url)}" alt="">` : `<span>＋</span>`}</div>
          <span class="vis-ref-name">${esc(r.codename)}</span>
          <span class="vis-ref-hint">${r.url ? t('换图') : t('选图')}</span>
        </div>`).join('')}
      </div>
    </div>`;
  })() : '';

  el.innerHTML = `
    <div class="vis-stage" style="--mc:${esc(mc)}">
      <div class="ed-topline">
        <span class="ed-kicker">STARFORM / VISUAL</span>
        <span class="ed-index">${isPoster ? t('团体海报') : esc(m.codename)}　·　${t('{n} 张', { n: imgs.length })}</span>
      </div>

      <div class="vis-layout">
        <figure class="vis-hero">
          ${primary
            ? `<img src="${esc(primary.url)}" alt="">`
            : `<div class="vis-hero-ph"><span>✦</span><p>${t('还没有主图<br>生成或上传后设为主图')}</p></div>`}
        </figure>

        <div class="vis-control">
          <div class="ed-en">${isPoster ? 'GROUP POSTER' : t('主图设定')}</div>
          <h2 class="vis-subject">${subjectLabel}</h2>
          <div class="vis-subject-sub">${subjectSub}</div>
          <div class="ed-rule"></div>

          ${refStrip}

          ${presets.length ? `<div class="vis-presets">
            <span class="vis-presets-label">${isPoster ? t('海报模板') : t('造型预设')}</span>
            ${presets.map((p) => `<button class="vis-preset-chip" data-prompt="${esc(p.prompt)}"${p.size ? ` data-size="${esc(p.size)}"` : ''}>${esc(p.label)}</button>`).join('')}
          </div>` : ''}

          <div class="ms-prompt-box">
            <div class="ms-prompt-head">
              <span class="ms-prompt-label">${t('生成提示词（点上方模板自动填充，可自由修改）')}</span>
              <button type="button" class="chip-mini" id="vs-ai-prompt">🪄 ${t('AI 创作提示词')}</button>
            </div>
            <textarea id="vs-prompt" rows="5">${esc(defaultP)}</textarea>
          </div>

          <div class="vis-opt-row">
            <span class="vis-opt-label">${t('尺寸')}</span>
            ${segmented('vs-size', [
              { value: '1024x1536', label: t('竖版') },
              { value: '1536x1024', label: t('横版') },
              { value: '1024x1024', label: t('方形') },
            ], isPoster ? '1536x1024' : '1024x1536')}
          </div>
          <div class="vis-opt-row">
            <span class="vis-opt-label">${t('质量')}</span>
            ${segmented('vs-quality', [
              { value: 'medium', label: t('标准') },
              { value: 'high', label: t('高清') },
              { value: 'low', label: t('草图') },
            ], 'medium')}
          </div>
          ${!isPoster && refs.length ? `<div class="vis-opt-row">
            <label class="ms-ref-toggle"><input type="checkbox" id="vs-useref" checked>
              ${refs.map((r) => `<img src="${esc(r.url)}" alt="">`).join('')}
              <span>${t('以主图与造型设定图为角色参考（{n} 张）', { n: refs.length })}</span></label>
          </div>` : ''}
          <div class="vis-gen-row">
            <button class="btn btn-primary" id="vs-gen" ${genOK ? '' : 'disabled'}>✦ ${t('AI 生成')}</button>
            <button class="btn btn-ghost" id="vs-upload">↑ ${isPoster ? t('上传海报') : t('上传主图')}</button>
          </div>

          ${!genOK ? `<p class="muted" style="color:var(--err);font-size:12.5px;margin-top:8px">${t('未配置 OPENAI_API_KEY，AI 生成不可用')}</p>` : ''}

          <div class="drop-zone vis-drop" id="vs-drop">${t('拖入图片，或点「上传」选择文件（PNG / JPG / WebP ≤ 15MB）')}</div>
        </div>
      </div>

      ${imgs.length || archivedImgs.length ? `<div class="vis-gallery-section">
        <div class="ed-sub-kicker">${t('图库')} · ${t('{n} 张', { n: imgs.length })}</div>
        <div class="vis-gallery">
          ${imgs.map((img) => `
            <div class="vis-thumb${img.isPrimary ? ' primary' : ''}" data-id="${esc(img.id)}" data-url="${esc(img.url)}">
              <img src="${esc(img.url)}" loading="lazy" alt="">
              ${img.isPrimary ? `<span class="vt-tag">${t('主图')}</span>` : ''}
              <div class="vt-acts">
                ${img.isPrimary ? '' : `<button data-primary>${t('设为主图')}</button>`}
                ${img.isPrimary ? '' : `<button data-archive>📦 ${t('归档')}</button>`}
              </div>
            </div>`).join('')}
        </div>
        ${archivedImgs.length ? `<details class="ms-archive">
          <summary>📦 ${t('归档区（{n}）', { n: archivedImgs.length })} · <span class="muted">${t('可在此恢复或彻底删除')}</span></summary>
          <div class="vis-gallery">
            ${archivedImgs.map((img) => `
              <div class="vis-thumb" data-id="${esc(img.id)}" data-url="${esc(img.url)}">
                <img src="${esc(img.url)}" loading="lazy" alt="">
                <div class="vt-acts">
                  <button data-restore>${t('恢复')}</button>
                  <button data-del>${t('删除')}</button>
                </div>
              </div>`).join('')}
          </div>
        </details>` : ''}
      </div>` : ''}
    </div>`;

  // 角色参考：点卡片选/换参考图（即该成员主图）
  el.querySelectorAll('[data-ref-member]').forEach((card) => {
    card.onclick = () => openRefPicker(G, card.dataset.refMember, reload);
  });

  // 风格模板：填入提示词，并切到该模板推荐画幅
  el.querySelectorAll('.vis-preset-chip').forEach((chip) => {
    chip.onclick = () => {
      const ta = $('#vs-prompt', el);
      if (ta) ta.value = chip.dataset.prompt;
      if (chip.dataset.size) {
        el.querySelector(`[data-seg="vs-size"] .seg-opt[data-val="${chip.dataset.size}"]`)?.click();
      }
    };
  });

  // AI 创作提示词：把当前文本框内容作草稿，交给文字模型按档案重写
  const aiBtn = $('#vs-ai-prompt', el);
  if (aiBtn) aiBtn.onclick = async () => {
    const ta = $('#vs-prompt', el);
    if (!ta) return;
    const draft = ta.value.trim() || defaultP;
    aiBtn.disabled = true;
    aiBtn.innerHTML = `<span class="spinner"></span> ${t('AI 创作中…')}`;
    try {
      const pick = (mm) => ({
        codename: mm.codename, archetype: mm.archetype, appearance: mm.appearance,
        fashion: mm.fashion, stageOutfit: mm.stageOutfit, color: mm.color,
      });
      const r = await api.stage('imagePrompt', {
        member: isPoster ? (G.data.members || []).map(pick) : pick(m),
        concept: `《${G.data.concept.name}》${G.data.concept.concept || ''}（气质：${G.data.concept.vibe || ''}；视觉：${G.data.concept.visualStyle || ''}）`,
        task: isPoster ? t('团体海报') : `${t('成员造型')} · ${m.codename}`,
        hint: '',
        draft,
      });
      ta.value = r.prompt;
    } catch (e) {
      toast(t('AI 创作失败，已使用本地模板：') + e.message, 3500);
    }
    aiBtn.disabled = false;
    aiBtn.innerHTML = `🪄 ${t('AI 创作提示词')}`;
  };

  // AI 生成
  $('#vs-gen', el).onclick = async () => {
    const btn = $('#vs-gen', el);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    const prompt = ($('#vs-prompt', el)?.value || defaultP).trim();
    const useRef = isPoster ? undefined : refs.length > 0 && ($('#vs-useref', el)?.checked ?? true);
    try {
      await api.images.generate(G.id, isPoster ? '' : target, prompt,
        $('#vs-size', el).value, $('#vs-quality', el).value, undefined, useRef);
      toast(t('生成完成'));
      await reload();
    } catch (e) {
      toast(t('生成失败：') + e.message, 4000);
      btn.disabled = false;
      btn.textContent = '✦ ' + t('AI 生成');
    }
  };

  // 上传
  const uploadFile = (file) => {
    if (file.size > 15 * 1024 * 1024) return toast(t('图片超过 15MB'));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.images.upload(G.id, isPoster ? '' : target, reader.result);
        toast(t('上传成功'));
        await reload();
      } catch (e) { toast(t('上传失败：') + e.message, 3000); }
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

  // 图库操作（含归档区）
  el.querySelector('.vis-gallery-section')?.addEventListener('click', async (e) => {
    const thumb = e.target.closest('.vis-thumb');
    if (!thumb) return;
    try {
      if (e.target.closest('[data-primary]')) { await api.images.setPrimary(thumb.dataset.id); toast(t('已设为主图')); return reload(); }
      if (e.target.closest('[data-archive]')) { await api.images.archive(thumb.dataset.id, true); toast(t('已归档')); return reload(); }
      if (e.target.closest('[data-restore]')) { await api.images.archive(thumb.dataset.id, false); toast(t('已恢复')); return reload(); }
      if (e.target.closest('[data-del]')) {
        if (await confirmModal(t('彻底删除'), t('确定彻底删除这张图？此操作不可恢复。'))) { await api.images.remove(thumb.dataset.id); return reload(); }
        return;
      }
    } catch (err) { return toast(t('操作失败：') + err.message, 3000); }
    lightbox(thumb.dataset.url);
  });

  // 主图点击放大
  if (primary) el.querySelector('.vis-hero img')?.addEventListener('click', () => lightbox(primary.url));
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
        c.onclick = async () => { await api.images.setPrimary(c.dataset.pick); close(); await reload(); };
      });
      mask.querySelector('[data-close]').onclick = close;
      mask.querySelector('[data-up]').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
        inp.onchange = () => {
          const file = inp.files[0];
          if (!file) return;
          if (file.size > 15 * 1024 * 1024) return toast(t('图片超过 15MB'));
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const img = await api.images.upload(G.id, codename, reader.result);
              await api.images.setPrimary(img.id);
              toast(t('已上传并设为参考图'));
              close(); await reload();
            } catch (e) { toast(t('上传失败：') + e.message, 3000); }
          };
          reader.readAsDataURL(file);
        };
        inp.click();
      };
    },
  });
}
