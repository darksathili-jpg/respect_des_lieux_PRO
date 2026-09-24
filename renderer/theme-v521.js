(() => {
  'use strict';

  const THEME_VERSION = '5.2.1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const icon = (name) => {
    const paths = {
      home: '<path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z"/>',
      alert: '<path d="M4 13v-2l11-5v12L4 13Zm0 0v5m11-7 4-2v6l-4-2M7 14v5"/>',
      tool: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L3 18l3 3 8.7-9.3Z"/>',
      chart: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/>',
      db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5m-16 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      shield: '<path d="M12 2 20 5v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z"/><path d="m8.7 12 2.1 2.1 4.5-4.5"/>',
      settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M4.9 7.5 3.5 5.8l2.3-2.3 1.7 1.4A8 8 0 0 1 10 3.8L10.3 2h3.4l.3 1.8a8 8 0 0 1 2.5 1.1l1.7-1.4 2.3 2.3-1.4 1.7a8 8 0 0 1 1.1 2.5l1.8.3v3.4l-1.8.3a8 8 0 0 1-1.1 2.5l1.4 1.7-2.3 2.3-1.7-1.4A8 8 0 0 1 14 20.2l-.3 1.8h-3.4l-.3-1.8a8 8 0 0 1-2.5-1.1l-1.7 1.4-2.3-2.3 1.4-1.7A8 8 0 0 1 3.8 14L2 13.7v-3.4l1.8-.3a8 8 0 0 1 1.1-2.5Z"/>',
      users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.3-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6m1 3c2.5.5 4 2.4 4 5"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
      photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 16-5-5-7 7"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>'
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.home}</svg>`;
  };

  function injectThemeStyles() {
    if ($('#rdl-theme-v521')) return;
    const style = document.createElement('style');
    style.id = 'rdl-theme-v521';
    style.textContent = String.raw`
      :root{
        --wat-red:#8b1e24;
        --wat-red-2:#a93535;
        --wat-terra:#c76549;
        --wat-cream:#f4e6d9;
        --wat-cream-2:#fbf6f0;
        --wat-blue:#203f5a;
        --wat-blue-2:#2f5977;
        --wat-pearl:#d7d7db;
        --wat-paper:#fffdf9;
        --wat-green:#2f8a62;
        --wat-amber:#c57926;
        --wat-shadow:0 18px 48px rgba(37,48,60,.10);
        --wat-shadow-soft:0 8px 24px rgba(37,48,60,.07);
        --bg:#f4f0eb;
        --surface:#fffdf9;
        --surface2:#f8f3ee;
        --ink:#17324a;
        --muted:#6d7882;
        --border:#e7ddd3;
        --accent:var(--wat-red);
        --accent2:#f4ded9;
        --green:var(--wat-green);
        --amber:var(--wat-amber);
        --red:var(--wat-red);
        --shadow:var(--wat-shadow-soft);
        --radius:18px;
      }
      html,body{background:
        radial-gradient(circle at 78% -10%,rgba(199,101,73,.11),transparent 32%),
        linear-gradient(180deg,#faf7f2 0%,#f2eee9 100%);color:var(--ink);font-family:"Segoe UI Variable","Aptos",Segoe UI,Arial,sans-serif}
      body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;background-image:linear-gradient(rgba(32,63,90,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(32,63,90,.018) 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(to bottom,black,transparent 68%)}
      .shell{grid-template-columns:272px minmax(0,1fr)}
      .sidebar{background:linear-gradient(180deg,#173a55 0%,#102e46 62%,#0c283d 100%);padding:20px 14px 18px;gap:18px;box-shadow:14px 0 40px rgba(16,46,70,.12);overflow:hidden}
      .sidebar::before{content:"";position:absolute;left:-70px;bottom:-48px;width:330px;height:270px;opacity:.12;background:radial-gradient(ellipse at center,rgba(255,255,255,.45),transparent 60%);pointer-events:none}
      .brand{position:relative;display:block;padding:0 7px 18px;border-bottom:1px solid rgba(255,255,255,.14)}
      .watteau-lockup{display:grid;grid-template-columns:62px 1fr;align-items:center;gap:12px}
      .watteau-emblem{width:62px;height:70px;color:#fff;filter:drop-shadow(0 4px 12px rgba(0,0,0,.13))}
      .watteau-copy strong{display:block;font-size:16px;line-height:1.05;color:#fff;letter-spacing:-.015em}
      .watteau-copy em{display:block;margin-top:4px;color:#f4d9d2;font-family:Georgia,"Times New Roman",serif;font-size:18px;font-style:italic;line-height:1}
      .watteau-copy span{display:block;margin-top:7px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#a9bdcb}
      nav{gap:5px}
      .nav{position:relative;display:flex;align-items:center;gap:12px;padding:12px 13px;border-radius:12px;color:#d8e3ea;font-size:13px;font-weight:650;transition:background .16s ease,color .16s ease,transform .16s ease}
      .nav .ui-icon{width:20px;height:20px;flex:0 0 auto;opacity:.93}
      .nav:hover{background:rgba(255,255,255,.07);color:#fff;transform:translateX(2px)}
      .nav.active{background:linear-gradient(90deg,#a53435,#c8664c);color:#fff;box-shadow:0 9px 22px rgba(121,29,32,.26),inset 0 1px 0 rgba(255,255,255,.18)}
      .nav.active::after{content:"";position:absolute;right:10px;width:5px;height:5px;border-radius:50%;background:#fff;opacity:.78}
      .local-seal{position:relative;margin-top:auto;border-color:rgba(255,255,255,.13);background:rgba(255,255,255,.055);border-radius:14px;padding:13px 12px}
      .local-seal .dot{background:#67c790;box-shadow:0 0 0 4px rgba(103,199,144,.14)}
      .local-seal strong{color:#fff}.local-seal small{color:#abc0ce;line-height:1.45}
      .main{background:transparent}
      .topbar{height:94px;padding:15px 28px;background:rgba(255,253,249,.90);border-bottom:1px solid rgba(139,30,36,.10);box-shadow:0 4px 20px rgba(65,45,35,.035);backdrop-filter:blur(18px)}
      .topbar::after{content:"";position:absolute;left:28px;bottom:-1px;width:72px;height:2px;background:linear-gradient(90deg,var(--wat-red),var(--wat-terra));border-radius:999px}
      .topbar h1{font-size:25px;letter-spacing:-.025em;color:var(--wat-blue);font-weight:780}
      .eyebrow{color:#8a6d62;letter-spacing:.16em;font-size:9px}
      .top-actions{gap:8px}
      .btn{border-radius:11px;padding:9px 13px;font-weight:750;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
      .btn:hover{transform:translateY(-1px)}
      .btn.primary{background:linear-gradient(135deg,#9f292c,#7f171d);box-shadow:0 7px 18px rgba(139,30,36,.22)}
      .btn.primary:hover{background:linear-gradient(135deg,#ab3436,#861c22)}
      .btn.secondary{background:#fffaf5;border-color:#dfd5cc;color:var(--wat-blue)}
      .btn.secondary:hover{background:#f7efe8}
      .btn.privacy-active{background:#fff1dd;border-color:#e6c38c;color:#81551e}
      .health{border:1px solid transparent}.health.ok{background:#e8f5ec;color:#237049;border-color:#d2ebdc}.health.neutral{background:#edf2f5;color:#5d7080;border-color:#e0e7eb}.health.ko{background:#fae7e7;color:#912f35;border-color:#f1cdcf}
      .view{padding:26px 28px 44px}
      .hero{position:relative;min-height:225px;border-radius:24px;padding:32px 34px;background:
        linear-gradient(102deg,rgba(255,253,249,.98) 0%,rgba(255,248,241,.94) 55%,rgba(247,228,214,.82) 100%);color:var(--wat-blue);border:1px solid rgba(139,30,36,.10);box-shadow:var(--wat-shadow);overflow:hidden}
      .hero::before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 0 60%,rgba(139,30,36,.06) 60% 61%,transparent 61% 70%,rgba(47,89,119,.05) 70% 71%,transparent 71%);pointer-events:none}
      .hero-copy{position:relative;z-index:2;max-width:720px}
      .hero h2{font-size:36px;line-height:1.08;margin:8px 0 12px;letter-spacing:-.035em;color:var(--wat-blue);font-weight:800}
      .hero h2 .accent-word{color:var(--wat-red)}
      .hero p:not(.eyebrow){max-width:650px;color:#61707b;line-height:1.7;font-size:14px}
      .hero .eyebrow{color:var(--wat-red)}
      .hero-badge{position:relative;z-index:2;border:1px solid rgba(139,30,36,.18);background:rgba(255,253,249,.76);color:var(--wat-red);padding:16px 20px;border-radius:16px;box-shadow:0 8px 28px rgba(65,45,35,.08);backdrop-filter:blur(10px)}
      .hero-badge strong{font-size:21px;color:var(--wat-blue)}
      .hero-art{position:absolute;right:90px;bottom:-8px;width:320px;height:190px;opacity:.16;color:var(--wat-red);pointer-events:none}
      .hero-art svg{width:100%;height:100%}
      .hero-quote{position:absolute;right:34px;top:28px;color:var(--wat-blue);font-family:Georgia,"Times New Roman",serif;font-style:italic;font-size:13px;opacity:.7;z-index:2}
      .kpis{gap:15px;margin:18px 0}
      .kpi{position:relative;min-height:118px;border-radius:17px;padding:18px 18px 17px 62px;border:1px solid #eadfd5;background:rgba(255,253,249,.96);box-shadow:var(--wat-shadow-soft);overflow:hidden}
      .kpi::after{content:"";position:absolute;right:-22px;bottom:-35px;width:100px;height:100px;border-radius:50%;background:currentColor;opacity:.035}
      .kpi-icon{position:absolute;left:17px;top:18px;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:#f5e4df;color:var(--wat-red)}
      .kpi-icon .ui-icon{width:19px;height:19px}
      .kpi:nth-child(2) .kpi-icon{background:#e7f0f7;color:#2b6e9f}.kpi:nth-child(3) .kpi-icon{background:#e5f3ea;color:#2e8a5d}.kpi:nth-child(4) .kpi-icon{background:#fff0dd;color:#bb6f1c}
      .kpi span{font-size:10px;color:#796f69}.kpi strong{font-size:31px;color:var(--wat-blue);margin:5px 0 2px}.kpi small{color:#9a8c83}
      .grid.two{gap:18px}
      .panel{border-radius:18px;border-color:#e7ddd3;background:rgba(255,253,249,.96);box-shadow:var(--wat-shadow-soft);padding:19px}
      .panel-head{padding-bottom:10px;border-bottom:1px solid #f0e7df;margin-bottom:13px}.panel h3{font-size:16px;color:var(--wat-blue);letter-spacing:-.015em}.panel-copy{color:#756e69}
      .text-btn{color:var(--wat-red)}
      .recent-item{border-bottom-color:#efe5dd;border-radius:10px;padding:11px 8px;transition:background .15s ease,transform .15s ease}.recent-item:hover{background:#fbf4ef;transform:translateX(2px)}.recent-num{color:var(--wat-red)}
      .facts div{border-bottom-color:#eee4dc}.facts dt{color:#8c7a70}.facts dd{color:#465866}
      .search{border-color:#ded3ca;background:#fffdf9;border-radius:11px}.search:focus{border-color:#c76b5d;box-shadow:0 0 0 3px rgba(199,101,73,.12)}
      .table-wrap{border-color:#e6dcd3;border-radius:14px;background:#fffdfa}table{font-size:12px}th{background:#f6f0ea;color:#766f69;border-bottom-color:#e4d7ce;padding:11px 12px}td{padding:12px;border-bottom-color:#f0e7df}tbody tr:hover{background:#fcf5f0}
      .badge{background:#edf0f2;color:#526575}.badge.open{background:#fff0de;color:#9a5c16}.badge.closed{background:#e6f3e9;color:#2b724d}
      .mini{border-color:#e0d4cb;background:#fffaf6;color:var(--wat-blue)}.mini:hover{background:#f7eee7}.mini.fiche{border-color:#e1b7b3;background:#fbe9e7;color:#8d2629}.mini.fiche:hover{background:#f5dcda}
      .large-action{border-top:3px solid rgba(139,30,36,.78)}.large-action .icon{background:#f4dfda;color:var(--wat-red)}
      .notice.warning{background:#fff6e7;border-color:#edd4a8;color:#76501d}.notice.danger{background:#fae8e8;border-color:#e9c3c5;color:#832e33}
      .checklist li{border-bottom-color:#eee4dc}.checklist li::before{color:var(--wat-green)}
      .lifecycle-badge.future{background:#e9f1f7;color:#3f6784}.lifecycle-badge.soon{background:#fff0dc;color:#93601e}.lifecycle-badge.due{background:#f9e6e7;color:#942e34}
      dialog{border-radius:20px;background:#fffdf9;box-shadow:0 30px 100px rgba(32,35,40,.28)}dialog::backdrop{background:rgba(18,37,52,.60);backdrop-filter:blur(5px)}.dialog-card{background:#fffdf9}.dialog-card header{border-bottom-color:#eadfd6}.dialog-card footer{border-top-color:#eadfd6}.close{background:#f4ece6;color:#725d52}
      .form-grid input,.form-grid select,.form-grid textarea,.retention-form input[type=number],.retention-form input[type=text]{border-color:#ded3ca;background:#fffdf9}.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus,.retention-form input:focus{border-color:#c76549;box-shadow:0 0 0 3px rgba(199,101,73,.12)}
      .toast{background:#18384f;border:1px solid rgba(255,255,255,.09);box-shadow:0 16px 40px rgba(16,46,70,.24)}.toast.error{background:#8b1e24}
      .values-ribbon{margin-top:18px;display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e8ddd4;border-radius:16px;overflow:hidden;background:rgba(255,253,249,.86);box-shadow:0 6px 18px rgba(65,45,35,.04)}
      .value-item{padding:15px 18px;display:flex;align-items:center;gap:11px;border-right:1px solid #eee4dc}.value-item:last-child{border-right:0}.value-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:var(--wat-red);background:#f6e4df}.value-icon .ui-icon{width:17px;height:17px}.value-item strong{display:block;color:var(--wat-blue);font-size:11px;letter-spacing:.12em;text-transform:uppercase}.value-item small{display:block;margin-top:2px;color:#9a887d;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
      .theme-signature{position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden}
      @media(max-width:1250px){.shell{grid-template-columns:230px 1fr}.hero-art{right:20px;opacity:.10}.hero-quote{display:none}.values-ribbon{grid-template-columns:1fr 1fr}.value-item:nth-child(2){border-right:0}.value-item:nth-child(-n+2){border-bottom:1px solid #eee4dc}}
      @media(max-width:1100px){.shell{grid-template-columns:210px 1fr}.watteau-lockup{grid-template-columns:48px 1fr}.watteau-emblem{width:48px;height:58px}.watteau-copy em{font-size:15px}.hero{min-height:200px}.hero h2{font-size:30px}}
    `;
    document.head.appendChild(style);
  }

  function watteauEmblemSvg() {
    return `<svg class="watteau-emblem" viewBox="0 0 72 82" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 61h54" stroke="currentColor" stroke-width="1.6" opacity=".5"/>
      <path d="M13 58V35l11-6 10 5v24M34 58V27l13-7 12 7v31" stroke="currentColor" stroke-width="2"/>
      <path d="M24 29V15h10v19M22 15h14M24 12h10M27 7h4v5" stroke="currentColor" stroke-width="2"/>
      <path d="M18 41h4v6h-4zm0 10h4v7h-4zm10-10h4v6h-4zm10-7h4v7h-4zm0 11h4v7h-4zm9-13h5v8h-5zm0 12h5v8h-5z" fill="currentColor" opacity=".82"/>
      <path d="M6 64c18-5 42-5 60 0" stroke="#d7775f" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }

  function decorateBrand() {
    const brand = $('.brand');
    if (!brand || brand.dataset.watteauReady) return;
    brand.dataset.watteauReady = 'true';
    brand.innerHTML = `<div class="watteau-lockup">${watteauEmblemSvg()}<div class="watteau-copy"><strong>Respect des Lieux PRO</strong><em>Watteau</em><span>Valenciennes · local</span></div></div>`;

    const navMap = [
      ['dashboard','Accueil','home'],
      ['signalements','Signalements','alert'],
      ['reparations','Interventions','tool'],
      ['sauvegardes','Sauvegardes','db'],
      ['confidentialite','Protection des données','shield'],
      ['systeme','Système local','settings']
    ];
    navMap.forEach(([view,label,iconName]) => {
      const button = $(`.nav[data-view="${view}"]`);
      if (!button) return;
      button.innerHTML = `${icon(iconName)}<span>${label}</span>`;
    });

    const seal = $('.local-seal');
    if (seal) seal.innerHTML = '<span class="dot"></span><div><strong>Données protégées</strong><small>SQLite local · réseau métier bloqué</small></div>';
  }

  function decorateHero() {
    const hero = $('#view-dashboard .hero');
    if (!hero || hero.dataset.watteauReady) return;
    hero.dataset.watteauReady = 'true';
    const textBox = hero.firstElementChild;
    if (textBox) {
      textBox.classList.add('hero-copy');
      const eyebrow = $('.eyebrow', textBox);
      const title = $('h2', textBox);
      const copy = $('p:not(.eyebrow)', textBox);
      if (eyebrow) eyebrow.textContent = 'V5.2.1 · Parity & UX Gate';
      if (title) title.innerHTML = 'Des lieux <span class="accent-word">respectés</span> pour mieux apprendre.';
      if (copy) copy.textContent = 'Une application locale pensée pour suivre les signalements avec clarté, préserver les données et accompagner les actions quotidiennes de l’établissement.';
    }
    const badge = $('.hero-badge', hero);
    if (badge) badge.innerHTML = 'DONNÉES<br><strong>100 % LOCALES</strong>';
    hero.insertAdjacentHTML('beforeend', `<div class="hero-art">${watteauEmblemSvg().replace('class="watteau-emblem"','')}</div><div class="hero-quote">« Un cadre serein pour tous »</div>`);
  }

  function decorateKpis() {
    const names = ['users','alert','tool','photo'];
    $$('#view-dashboard .kpi').forEach((card,index) => {
      if (card.querySelector('.kpi-icon')) return;
      card.insertAdjacentHTML('afterbegin', `<span class="kpi-icon">${icon(names[index] || 'check')}</span>`);
    });
  }

  function addValuesRibbon() {
    const dashboard = $('#view-dashboard');
    if (!dashboard || $('.values-ribbon', dashboard)) return;
    const ribbon = document.createElement('section');
    ribbon.className = 'values-ribbon';
    const items = [
      ['shield','Respect','des lieux'],
      ['users','Bien-vivre','ensemble'],
      ['check','Engagement','durable'],
      ['home','Réussite','pour tous']
    ];
    ribbon.innerHTML = items.map(([ico,title,sub]) => `<div class="value-item"><span class="value-icon">${icon(ico)}</span><div><strong>${title}</strong><small>${sub}</small></div></div>`).join('');
    dashboard.appendChild(ribbon);
  }

  function improveTopbar() {
    const eyebrow = $('.topbar .eyebrow');
    if (eyebrow) eyebrow.textContent = 'Lycée Watteau · Valenciennes';
    const topbar = $('.topbar');
    if (topbar) topbar.dataset.theme = THEME_VERSION;
  }

  function installTheme() {
    if (document.documentElement.dataset.rdlTheme === THEME_VERSION) return;
    document.documentElement.dataset.rdlTheme = THEME_VERSION;
    document.documentElement.classList.add('theme-watteau');
    injectThemeStyles();
    decorateBrand();
    decorateHero();
    decorateKpis();
    addValuesRibbon();
    improveTopbar();
    const marker = document.createElement('span');
    marker.className = 'theme-signature';
    marker.dataset.rdlThemeSignature = 'watteau-v5.2.1';
    marker.textContent = 'Watteau V5.2.1';
    document.body.appendChild(marker);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installTheme, { once: true });
  } else {
    installTheme();
  }
})();
