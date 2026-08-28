// 文字生成 — OpenAI 兼容（默认绑定智谱 GLM-5.2，思维模式可关）
import { getText } from './settings.mjs';

export async function callGLM(messages, { temperature = 0.85, model } = {}) {
  const cfg = getText();
  const base = (cfg.baseUrl || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
  const body = {
    model: model || cfg.modelId || 'glm-5.2',
    temperature,
    max_tokens: 16000,
    messages,
  };
  // 智谱 GLM：thinking.type=disabled 关闭思维链，大幅降延迟
  if (cfg.thinking === false) body.thinking = { type: 'disabled' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  const doFetch = () => fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  try {
    let res = await doFetch();
    if (!res.ok) {
      const errText = await res.text();
      // glm-5.3 等"始终思考"模型不接受 disabled：自动降级为最低思考档重试
      if (res.status === 400 && body.thinking?.type === 'disabled' && /1210|不支持关闭思考/.test(errText)) {
        body.thinking = { type: 'enabled', effort: 'low' };
        res = await doFetch();
        if (!res.ok) throw new Error(`GLM API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      } else {
        throw new Error(`GLM API ${res.status}: ${errText.slice(0, 300)}`);
      }
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// 容错提取 JSON（模型可能带围栏或前后缀文字）
export function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('未找到 JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function runJSON(system, user, opts = {}) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callGLM(messages, opts);
    try {
      return extractJSON(text);
    } catch (e) {
      lastErr = e;
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: '你刚才的输出不是合法 JSON，请重新输出，只输出一个合法的 JSON 对象，不要任何其它文字。' });
    }
  }
  throw new Error(`JSON 解析失败: ${lastErr.message}`);
}
