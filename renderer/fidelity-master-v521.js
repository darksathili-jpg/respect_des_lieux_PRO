(() => {
  'use strict';

  const SIGNATURE = 'master-dashboard-2026-09-24';

  function ensure() {
    document.documentElement.dataset.rdlFidelity = SIGNATURE;

    const brand = document.querySelector('.rdl-app-name');
    if (brand && !brand.textContent.includes('Respect des Lieux PRO')) {
      let label = brand.querySelector('span');
      if (!label) {
        label = document.createElement('span');
        brand.appendChild(label);
      }
      label.textContent = 'Respect des Lieux PRO';
    }

    if (!document.querySelector('.rdl-fidelity-sentinel')) {
      const sentinel = document.createElement('span');
      sentinel.className = 'rdl-fidelity-sentinel';
      sentinel.textContent = 'Respect des Lieux PRO · master-dashboard-2026-09-24';
      document.body.appendChild(sentinel);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensure, { once: true });
  } else {
    ensure();
  }
  setTimeout(ensure, 120);
  setTimeout(ensure, 600);
})();
