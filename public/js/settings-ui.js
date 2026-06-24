// 模型 API 绑定设置 — 文字 / 图像两套
import { api } from './api.js';
import { $, esc, toast, modal, segmented } from './ui.js';

export async function openSettings() {
  let s;
  try { s = await api.settings.get(); }
  catch (e) { return toast('读取设置失败：' + e.message, 3000); }
  const t = s.text, i = s.image;

  modal(`<h3>模型 API 绑定</h3>
    <p class="sub" style="margin-bottom:18px">文字与图像各绑定一个 OpenAI 兼容的模型 API，保存后即时生效，无需重启。</p>

    <div class="set-sec">
      <div class="set-sec-head"><span class="set-ico">✍️</span><b>文字模型</b><span class="muted">选题 / 文案 / 脚本等全部文字生成</span></div>
      <div class="set-presets">快速填充：
        <button class="chip-mini" data-fill-text="glm-5.2">智谱 GLM-5.2</button>
        <button class="chip-mini" data-fill-text="glm-4.6">GLM-4.6（更快）</button>
      </div>
      <label class="field"><span class="field-label">API 端点 <small>（OpenAI 兼容 base URL）</small></span>
        <input id="set-t-base" type="text" value="${esc(t.baseUrl)}" placeholder="https://open.bigmodel.cn/api/paas/v4"></label>
      <div class="field-row">
        <label class="field"><span class="field-label">模型 ID</span>
          <input id="set-t-model" type="text" value="${esc(t.modelId)}" placeholder="glm-5.2"></label>
        <label class="field"><span class="field-label">思维模式</span>
          ${segmented('set-t-think', [{ value: 'off', label: '关闭（更快）' }, { value: 'on', label: '开启（更强推理）' }], t.thinking ? 'on' : 'off')}</label>
      </div>
      <label class="field"><span class="field-label">API Key</span>
        <input id="set-t-key" type="password" autocomplete="off" placeholder="${t.hasKey ? '已设置 ·· 留空则不修改' : '粘贴 API Key'}"></label>
    </div>

    <div class="set-sec">
      <div class="set-sec-head"><span class="set-ico">🎨</span><b>图像模型</b><span class="muted">成员形象 / 海报等 AI 生图</span></div>
      <label class="field"><span class="field-label">API 端点 <small>（OpenAI 兼容 base URL）</small></span>
        <input id="set-i-base" type="text" value="${esc(i.baseUrl)}" placeholder="https://api.openai.com/v1"></label>
      <label class="field"><span class="field-label">模型 ID</span>
        <input id="set-i-model" type="text" value="${esc(i.modelId)}" placeholder="gpt-image-2"></label>
      <label class="field"><span class="field-label">API Key</span>
        <input id="set-i-key" type="password" autocomplete="off" placeholder="${i.hasKey ? '已设置 ·· 留空则不修改' : '粘贴 API Key'}"></label>
    </div>

    <div class="m-foot">
      <button class="btn btn-ghost" data-x>取消</button>
      <button class="btn btn-primary" data-ok>保存绑定</button>
    </div>`,
    { onMount: (mask, close) => {
      mask.querySelectorAll('[data-fill-text]').forEach((b) => b.onclick = () => {
        $('#set-t-base', mask).value = 'https://open.bigmodel.cn/api/paas/v4';
        $('#set-t-model', mask).value = b.dataset.fillText;
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
          toast('模型绑定已保存，即时生效 ✅');
          close();
        } catch (e) { toast('保存失败：' + e.message, 3000); }
      };
    } });
}
