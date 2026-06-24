// 主题切换器：切 <html data-theme>，记 localStorage
(function () {
  const THEMES = [
    ['', '默认 · 浅'], ['graphite', 'Graphite'], ['pulse', 'Pulse'], ['studio', 'Studio'],
    ['amethyst', 'Amethyst'], ['futuristic', 'Futuristic'], ['cosmic', 'Cosmic'], ['neon', 'Neon'],
    ['paper', 'Paper'], ['vibrant', 'Vibrant'],
  ];
  function getStorage() {
    try {
      const s = window.localStorage;
      const k = '__starform_theme_test__';
      s.setItem(k, '1');
      s.removeItem(k);
      return s;
    } catch {
      return null;
    }
  }
  const storage = getStorage();
  const saved = storage?.getItem('od-theme') || '';
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  function mount() {
    if (document.getElementById('theme-switch')) return;
    const box = document.createElement('div');
    box.id = 'theme-switch';
    box.innerHTML = '<label>设计系统</label><select>' +
      THEMES.map(([v, l]) => `<option value="${v}"${v === saved ? ' selected' : ''}>${l}</option>`).join('') +
      '</select>';
    document.body.appendChild(box);
    box.querySelector('select')?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (v) document.documentElement.setAttribute('data-theme', v);
      else document.documentElement.removeAttribute('data-theme');
      try { storage?.setItem('od-theme', v); } catch { /* storage may be disabled */ }
    });
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
