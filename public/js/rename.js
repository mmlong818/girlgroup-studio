// 🪄 AI 起名 — 一次 8 个候选，可提要求、可换一批
import { api } from './api.js';
import { $, $$, esc, modal } from './ui.js';

export function openRename({ kind, context, current, gender = '', target = '', existing = [], onPick }) {
  modal(`<h3>🪄 AI 起名 · ${esc(kind)}</h3>
    <p class="muted" style="margin-bottom:4px">当前：${esc(current)}　点击候选名选中，不满意可换一批。</p>
    <div id="rn-list" class="rn-grid">
      <div style="grid-column:1/-1;text-align:center;padding:24px 0"><span class="spinner"></span> 正在起名…</div>
    </div>
    <label class="field" style="margin:12px 0 0">
      <input id="rn-hint" type="text" placeholder="（可选）起名要求，例如：要有古风感 / 两个字 / 带'星'字">
    </label>
    <div class="m-foot">
      <button class="btn btn-ghost" data-x>取消</button>
      <button class="btn btn-ghost" data-more disabled>🎲 再来一批</button>
      <button class="btn btn-primary" data-ok disabled>✔ 就用这个</button>
    </div>`,
    { onMount: (mask, close) => {
      let chosen = null;
      const list = $('#rn-list', mask);
      const okBtn = $('[data-ok]', mask);
      const moreBtn = $('[data-more]', mask);

      const run = async () => {
        chosen = null;
        okBtn.disabled = true;
        moreBtn.disabled = true;
        list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px 0"><span class="spinner"></span> 正在起名…</div>`;
        try {
          const r = await api.stage('names', {
            kind, context, current, gender, target, existing,
            hint: $('#rn-hint', mask).value.trim(),
          });
          list.innerHTML = (r.options || []).map((o) => `
            <div class="rn-item" data-name="${esc(o.name)}">
              <b>${esc(o.name)}</b><span>${esc(o.reason)}</span>
            </div>`).join('');
          $$('.rn-item', mask).forEach((el) => el.onclick = () => {
            $$('.rn-item', mask).forEach((x) => x.classList.toggle('on', x === el));
            chosen = el.dataset.name;
            okBtn.disabled = false;
          });
        } catch (e) {
          list.innerHTML = `<p style="grid-column:1/-1;color:var(--err)">起名失败：${esc(e.message)}</p>`;
        }
        moreBtn.disabled = false;
      };

      $('[data-x]', mask).onclick = close;
      moreBtn.onclick = run;
      okBtn.onclick = () => { if (chosen) { close(); onPick(chosen); } };
      run();
    } });
}
