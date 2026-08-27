// 模型 API 绑定设置 — 文字 / 图像两套
import { api } from './api.js';
import { $, esc, toast, modal, segmented } from './ui.js';
import { t } from './i18n.js';

export async function openSettings() {
  let s;
  try { s = await api.settings.get(); }
  catch (e) { return toast(t('读取设置失败：') + e.message, 3000); }
  const t8 = s.text, i8 = s.image;

  modal(`<h3>${t('模型 API 绑定')}</h3>
    <p class="sub" style="margin-bottom:18px">${t('文字与图像各绑定一个 OpenAI 兼容的模型 API，保存后即时生效，无需重启。')}</p>

    <div class="set-sec">
      <div class="set-sec-head"><span class="set-ico">✍️</span><b>${t('文字模型')}</b><span class="muted">${t('选题 / 文案 / 脚本等全部文字生成')}</span></div>
      <div class="set-presets">${t('快速填充：')}
        <button class="chip-mini" data-fill-text="glm-5.2">${t('智谱 GLM-5.2')}</button>
        <button class="chip-mini" data-fill-text="glm-4.6">${t('GLM-4.6（更快）')}</button>
      </div>
      <label class="field"><span class="field-label">${t('API 端点')} <small>${t('（OpenAI 兼容 base URL）')}</small></span>
        <input id="set-t-base" type="text" value="${esc(t8.baseUrl)}" placeholder="https://open.bigmodel.cn/api/paas/v4"></label>
      <div class="field-row">
        <label class="field"><span class="field-label">${t('模型 ID')} <button type="button" class="chip-mini" data-fetch="text">🔄 ${t('拉取最新模型')}</button></span>
          <input id="set-t-model" type="text" value="${esc(t8.modelId)}" placeholder="glm-5.2"></label>
        <label class="field"><span class="field-label">${t('思维模式')}</span>
          ${segmented('set-t-think', [{ value: 'off', label: t('关闭（更快）') }, { value: 'on', label: t('开启（更强推理）') }], t8.thinking ? 'on' : 'off')}</label>
      </div>
      <div class="model-pick" data-pick="text" hidden></div>
      <label class="field"><span class="field-label">API Key</span>
        <input id="set-t-key" type="password" autocomplete="off" placeholder="${t8.hasKey ? t('已设置 ·· 留空则不修改') : t('粘贴 API Key')}"></label>
    </div>

    <div class="set-sec">
      <div class="set-sec-head"><span class="set-ico">🎨</span><b>${t('图像模型')}</b><span class="muted">${t('成员形象 / 海报等 AI 生图')}</span></div>
      <label class="field"><span class="field-label">${t('API 端点')} <small>${t('（OpenAI 兼容 base URL）')}</small></span>
        <input id="set-i-base" type="text" value="${esc(i8.baseUrl)}" placeholder="https://api.openai.com/v1"></label>
      <label class="field"><span class="field-label">${t('模型 ID')} <button type="button" class="chip-mini" data-fetch="image">🔄 ${t('拉取最新模型')}</button></span>
        <input id="set-i-model" type="text" value="${esc(i8.modelId)}" placeholder="gpt-image-2"></label>
      <div class="model-pick" data-pick="image" hidden></div>
      <label class="field"><span class="field-label">API Key</span>
        <input id="set-i-key" type="password" autocomplete="off" placeholder="${i8.hasKey ? t('已设置 ·· 留空则不修改') : t('粘贴 API Key')}"></label>
    </div>

    <div class="m-foot">
      <button class="btn btn-ghost" data-x>${t('取消')}</button>
      <button class="btn btn-primary" data-ok>${t('保存绑定')}</button>
    </div>`,
    { onMount: (mask, close) => {
      mask.querySelectorAll('[data-fill-text]').forEach((b) => b.onclick = () => {
        $('#set-t-base', mask).value = 'https://open.bigmodel.cn/api/paas/v4';
        $('#set-t-model', mask).value = b.dataset.fillText;
      });

      // 拉取远端模型列表 — 只展示供挑选，是否更新由用户点选 + 保存决定
      const FIELD = {
        text: { base: '#set-t-base', model: '#set-t-model', key: '#set-t-key' },
        image: { base: '#set-i-base', model: '#set-i-model', key: '#set-i-key' },
      };
      mask.querySelectorAll('[data-fetch]').forEach((btn) => btn.onclick = async () => {
        const kind = btn.dataset.fetch;
        const f = FIELD[kind];
        const pick = $(`[data-pick="${kind}"]`, mask);
        btn.disabled = true;
        const origLabel = btn.textContent;
        btn.textContent = t('拉取中…');
        try {
          const models = await api.settings.models({
            kind,
            baseUrl: $(f.base, mask).value,
            apiKey: $(f.key, mask).value,
          });
          if (!models.length) {
            pick.hidden = false;
            pick.innerHTML = `<span class="muted">${t('远端未返回任何模型')}</span>`;
            return;
          }
          const current = $(f.model, mask).value.trim();
          pick.hidden = false;
          pick.innerHTML = `<div class="model-pick-head">${t('远端共 {n} 个模型，点击填入（保存后才生效）：', { n: models.length })}</div>
            <div class="model-pick-list">${models.map((m) => `<button type="button" class="chip-mini${m === current ? ' on' : ''}" data-model="${esc(m)}">${esc(m)}</button>`).join('')}</div>`;
          pick.querySelectorAll('[data-model]').forEach((c) => c.onclick = () => {
            $(f.model, mask).value = c.dataset.model;
            pick.querySelectorAll('[data-model]').forEach((x) => x.classList.toggle('on', x === c));
          });
        } catch (e) {
          toast(t('拉取失败：') + e.message, 3500);
        } finally {
          btn.disabled = false;
          btn.textContent = origLabel;
        }
      });

      $('[data-x]', mask).onclick = close;
      $('[data-ok]', mask).onclick = async () => {
        const patch = {
          text: {
            baseUrl: $('#set-t-base', mask).value,
            modelId: $('#set-t-model', mask).value,
            thinking: $('#set-t-think', mask).value === 'on',
            apiKey: $('#set-t-key', mask).value,
          },
          image: {
            baseUrl: $('#set-i-base', mask).value,
            modelId: $('#set-i-model', mask).value,
            apiKey: $('#set-i-key', mask).value,
          },
        };
        try {
          await api.settings.save(patch);
          toast(t('模型绑定已保存，即时生效 ✅'));
          close();
        } catch (e) { toast(t('保存失败：') + e.message, 3000); }
      };
    } });
}
