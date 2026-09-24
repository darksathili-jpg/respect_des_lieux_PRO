(() => {
  'use strict';

  const THEME_VERSION = '5.2.1';
  const MASTER_SIGNATURE = 'watteau-v5.2.1';
  const FIDELITY_SIGNATURE = 'master-dashboard-2026-09-24';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ASSETS = Object.freeze({
    logo: 'data:image/webp;base64,UklGRlzP...' ,
    hero: 'data:image/webp;base64,UklGR...' 
  });

  const ICONS = Object.freeze({
    app: '<path d="M5 21V8l7-5 7 5v13M9 21v-6h6v6M3 21h18M8 8h.01M12 8h.01M16 8h.01"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>',
    alert: '<path d="M4 13v-2l11-5v12L4 13Zm0 0v5m11-7 4-2v6l-4-2M7 14v5"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L3 18l3 3 8.7-9.3Z"/>',
    chart: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/><path d="M2 20h20"/>',
    building: '<path d="M4 21V9l8-5 8 5v12M2 21h20M8 21v-8h8v8M8 10h.01M12 10h.01M16 10h.01"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M4.9 7.5 3.5 5.8l2.3-2.3 1.7 1.4A8 8 0 0 1 10 3.8L10.3 2h3.4l.3 1.8a8 8 0 0 1 2.5 1.1l1.7-1.4 2.3 2.3-1.4 1.7a8 8 0 0 1 1.1 2.5l1.8.3v3.4l-1.8.3a8 8 0 0 1-1.1 2.5l1.4 1.7-2.3 2.3-1.7-1.4A8 8 0 0 1 14 20.2l-.3 1.8h-3.4l-.3-1.8a8 8 0 0 1-2.5-1.1l-1.7 1.4-2.3-2.3 1.4-1.7A8 8 0 0 1 3.8 14L2 13.7v-3.4l1.8-.3a8 8 0 0 1 1.1-2.5Z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.3-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6m1 3c2.5.5 4 2.4 4 5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    leaf: '<path d="M20 4C12 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16Z"/><path d="M4 21c3-5 7-8 12-10"/>',
    graduate: '<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 3 9 3 12 0v-5M22 9v6"/>',
    book: '<path d="M4 5h6a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4z"/><path d="M20 5h-6a3 3 0 0 0-3 3v11a3 3 0 0 1 3-3h6z"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M8 14c-2-1-3-3-3-5a7 7 0 0 1 14 0c0 2-1 4-3 5-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
    more: '<circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>'
  });

  const svg = (name, cls = 'ui-icon') =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.app}</svg>`;

  function injectStyles() {
    if ($('#rdl-theme-v521')) return;
    const style = document.createElement('style');
    style.id = 'rdl-theme-v521';
    style.textContent = `
      :root{
        --wat-navy:#173c58;
        --wat-navy-deep:#12334c;
        --wat-navy-ink:#123957;
        --wat-red:#8b1e24;
        --wat-terra:#cf684e;
        --wat-coral:#dc6d55;
        --wat-cream:#fbf7f2;
        --wat-paper:#fffefa;
        --wat-line:#eadfd6;
        --wat-soft:#f6f1eb;
        --wat-blue:#0d6fd2;
        --wat-green:#12963f;
        --wat-orange:#ef8a00;
        --wat-text:#103b5c;
        --wat-muted:#6e8295;
        --bg:#f8f4ef;
        --surface:#fffefa;
        --surface2:#fbf8f4;
        --ink:#173c58;
        --muted:#708397;
        --border:#e8dfd8;
        --accent:#c83f33;
        --green:#2f9b61;
        --amber:#d98a2b;
        --red:#c64039;
        --radius:14px;
        --shadow:0 6px 20px rgba(53,62,68,.08);
      }
      *{box-sizing:border-box}
      html{background:var(--wat-cream)}
      body{background:var(--wat-cream)!important;color:var(--wat-text);font-family:"Segoe UI Variable","Segoe UI",Arial,sans-serif;overflow-x:hidden}
      .ui-icon{display:block;width:24px!important;height:24px!important;max-width:24px!important;max-height:24px!important;min-width:24px!important;min-height:24px!important;overflow:visible}
      .shell{min-height:100vh;grid-template-columns:clamp(285px,24.3vw,352px) minmax(0,1fr)!important;background:var(--wat-cream)}
      .sidebar{position:sticky;top:0;height:100vh!important;min-height:700px;padding:0!important;gap:0!important;overflow:hidden!important;background:linear-gradient(180deg,#1f4664 0%,#173f5d 46%,#173f5d 100%)!important;box-shadow:none!important;color:#fff;z-index:20}
      .brand{display:block!important;padding:0!important;border:0!important}
      .rdl-app-name{height:76px;display:flex;align-items:center;gap:14px;padding:0 24px;border-bottom:1px solid rgba(255,255,255,.09);font-size:18px;font-weight:650;letter-spacing:-.01em;color:#fff}
      .rdl-app-name .ui-icon{width:30px!important;height:30px!important;max-width:30px!important;max-height:30px!important;min-width:30px!important;min-height:30px!important}
      .rdl-logo-shot{height:257px;background-image:url("${ASSETS.logo}");background-repeat:no-repeat;background-position:center;background-size:100% auto}
      .sidebar nav{display:flex;flex-direction:column;gap:0!important;margin:0!important}
      .sidebar .nav{position:relative;display:flex!important;align-items:center;gap:20px;width:100%;min-height:74px;padding:0 34px!important;border-radius:0!important;border:0!important;background:transparent!important;color:#fff!important;font-size:21px!important;font-weight:430!important;text-align:left;transition:background .15s ease}
      .sidebar .nav .ui-icon{width:30px!important;height:30px!important;max-width:30px!important;max-height:30px!important;min-width:30px!important;min-height:30px!important;stroke-width:1.8}
      .sidebar .nav:hover{transform:none!important;background:rgba(255,255,255,.045)!important}
      .sidebar .nav.active{background:linear-gradient(90deg,#c83d35 0%,#db7054 100%)!important;color:#fff!important;box-shadow:none!important;font-weight:620!important}
      .sidebar .nav.active::after{display:none!important}
      .local-seal{position:absolute!important;left:0;right:0;bottom:0;margin:0!important;padding:0!important;height:218px!important;border:0!important;border-radius:0!important;background:transparent!important;display:block!important}
      .rdl-sidebar-slogan{position:absolute;left:29px;right:20px;bottom:54px;color:#fff;transform:rotate(-4deg);font-family:"Segoe Script","Segoe Print","Bradley Hand",cursive;font-size:24px;line-height:1.35;font-style:italic;font-weight:400}
      .rdl-sidebar-slogan::after{content:"";display:block;width:130px;height:2px;background:#fff;margin:12px 0 0 35px;transform:rotate(-8deg);opacity:.95}
      .main{min-width:0;background:var(--wat-cream)!important}
      .topbar{height:76px!important;padding:0 26px!important;background:#fffefa!important;border-bottom:1px solid #eee6df!important;box-shadow:none!important;display:flex!important;justify-content:flex-end!important;align-items:center!important;position:sticky;top:0;z-index:15}
      .topbar::after{display:none!important}
      .rdl-hidden-title{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}
      .rdl-user{display:flex;align-items:center;gap:12px;margin-right:30px;color:var(--wat-text)}
      .rdl-user-icon{color:#c62828;width:34px;height:34px}
      .rdl-user-icon .ui-icon{width:34px!important;height:34px!important;max-width:34px!important;max-height:34px!important;min-width:34px!important;min-height:34px!important}
      .rdl-user strong,.rdl-user small{display:block}
      .rdl-user strong{font-size:16px;line-height:1.1}
      .rdl-user small{font-size:12px;color:#718398;margin-top:3px}
      .rdl-more{width:42px;height:42px;border:0;background:transparent;color:#6f8598;border-radius:10px;display:grid;place-items:center;padding:0}
      .rdl-more:hover{background:#f6f1ec}
      .rdl-more .ui-icon{width:20px!important;height:20px!important;max-width:20px!important;max-height:20px!important;min-width:20px!important;min-height:20px!important}
      .rdl-utility-menu{position:absolute;right:24px;top:66px;z-index:40;min-width:240px;padding:10px;background:#fff;border:1px solid #e9e0d8;border-radius:14px;box-shadow:0 16px 44px rgba(32,45,55,.17);display:none;flex-direction:column;gap:7px}
      .rdl-utility-menu.open{display:flex}
      .rdl-utility-menu .btn,.rdl-utility-menu .health{width:100%;justify-content:flex-start;text-align:left;margin:0}
      .rdl-utility-menu .health{display:block}
      .btn{border-radius:10px!important}
      .btn.primary{background:linear-gradient(135deg,#c94439,#a92f2d)!important;color:#fff!important;box-shadow:0 6px 16px rgba(169,47,45,.17)!important}
      .btn.secondary{background:#fff!important;border-color:#e5dcd4!important;color:var(--wat-text)!important}
      .health.ok{background:#e6f5ea!important;color:#27734a!important}.health.neutral{background:#eef2f5!important;color:#5f7383!important}.health.ko{background:#fae9e8!important;color:#91383c!important}
      .view{padding:24px 28px 42px!important}
      #view-dashboard{padding:0 24px 26px!important;background:#fbf8f4}
      #view-dashboard .hero{height:auto!important;min-height:0!important;aspect-ratio:1096 / 314;margin:0 -24px 18px!important;border:0!important;border-radius:0!important;padding:0!important;background-image:url("${ASSETS.hero}")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:cover!important;box-shadow:none!important;color:transparent!important}
      #view-dashboard .hero>*{display:none!important}
      #view-dashboard .kpis{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important;margin:0 0 20px!important}
      #view-dashboard .kpi{min-height:158px!important;padding:26px 18px!important;border:1px solid #eee5de!important;border-radius:13px!important;background:#fffefa!important;box-shadow:0 5px 18px rgba(41,49,55,.065)!important;display:grid!important;grid-template-columns:58px 1fr!important;grid-template-rows:auto auto!important;column-gap:14px!important;align-content:center!important;color:var(--wat-text)!important;overflow:hidden!important}
      #view-dashboard .kpi::after{display:none!important}
      .rdl-kpi-icon{grid-row:1 / span 2;display:grid;place-items:center;align-self:center;width:58px;height:58px}
      .rdl-kpi-icon .ui-icon{width:52px!important;height:52px!important;max-width:52px!important;max-height:52px!important;min-width:52px!important;min-height:52px!important;stroke-width:1.7}
      .rdl-kpi-red{color:#cb1e22}.rdl-kpi-blue{color:#0870ce}.rdl-kpi-green{color:#069732}.rdl-kpi-cyan{color:#1388c7}
      #view-dashboard .kpi strong{grid-column:2;display:block!important;margin:0!important;font-size:43px!important;line-height:1!important;color:#103d60!important;font-weight:760!important}
      #view-dashboard .kpi .rdl-kpi-label{grid-column:2;font-size:16px!important;line-height:1.35!important;color:#123e61!important;margin-top:10px;text-transform:none!important;letter-spacing:0!important;font-weight:430!important}
      .rdl-kpi-hidden{display:none!important}
      #view-dashboard>.grid.two{display:grid!important;grid-template-columns:minmax(0,1.1fr) minmax(0,.95fr)!important;gap:16px!important}
      #view-dashboard>.grid.two>.panel{padding:0!important;border:1px solid #ece4dd!important;border-radius:13px!important;background:#fffefa!important;box-shadow:0 5px 18px rgba(41,49,55,.065)!important;overflow:hidden!important;min-height:370px}
      #view-dashboard .panel-head{min-height:72px;padding:0 22px!important;margin:0!important;border-bottom:1px solid #eee6df!important;display:flex;align-items:center}
      #view-dashboard .panel-head h3{font-size:22px!important;color:#103d60!important;letter-spacing:-.02em}
      #view-dashboard .text-btn{font-size:15px!important;color:#1d638e!important}
      #view-dashboard .stack{padding:0 22px!important;gap:0!important}
      #view-dashboard .recent-item{display:grid!important;grid-template-columns:46px minmax(0,1fr) auto!important;gap:14px!important;align-items:center!important;min-height:72px!important;padding:10px 0!important;border-bottom:1px solid #ece4dd!important}
      #view-dashboard .recent-item:last-child{border-bottom:0!important}
      #view-dashboard .recent-num{display:none!important}
      .rdl-recent-icon{width:40px;height:40px;display:grid;place-items:center}
      .rdl-recent-icon .ui-icon{width:34px!important;height:34px!important;max-width:34px!important;max-height:34px!important;min-width:34px!important;min-height:34px!important}
      .rdl-recent-icon.book{color:#ed2027}.rdl-recent-icon.bulb{color:#f39a00}.rdl-recent-icon.trash{color:#0b74d3}.rdl-recent-icon.window{color:#ed4b1e}
      #view-dashboard .recent-main strong{font-size:15px!important;color:#173f61!important;font-weight:680!important}
      #view-dashboard .recent-main small{font-size:12px!important;color:#7890a3!important;margin-top:5px!important}
      #view-dashboard .badge{font-size:12px!important;padding:7px 14px!important;border-radius:999px!important}
      #view-dashboard .badge.open{background:#fde3df!important;color:#d33131!important}
      #view-dashboard .badge.closed{background:#def4dc!important;color:#218136!important}
      .rdl-engagement{height:100%;position:relative;padding:0 22px 20px;overflow:hidden}
      .rdl-engagement::after{content:"";position:absolute;right:-35px;top:70px;width:230px;height:260px;opacity:.10;background-image:url("${ASSETS.logo}");background-size:245px auto;background-repeat:no-repeat;background-position:top center;filter:sepia(.4)}
      .rdl-engagement h3{height:72px;margin:0 -22px 0;padding:0 22px;display:flex;align-items:center;border-bottom:1px solid #eee6df;font-size:22px;color:#103d60;letter-spacing:-.02em}
      .rdl-engagement blockquote{position:relative;z-index:2;margin:30px 0 26px;font-family:Georgia,"Times New Roman",serif;font-style:italic;color:#173f61;font-size:23px;line-height:1.45;max-width:86%}
      .rdl-engagement blockquote::before{content:"“";color:#d8d8d8;font-size:54px;line-height:0;vertical-align:-18px;margin-right:8px}
      .rdl-engagement-rule{width:62px;height:4px;border-radius:4px;background:#c51f24;margin-bottom:28px;position:relative;z-index:2}
      .rdl-values{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);border-top:0}
      .rdl-value{text-align:center;padding:0 13px;color:#153f60;font-size:13px;line-height:1.4;border-right:1px solid #e9e0d8}
      .rdl-value:last-child{border-right:0}
      .rdl-value .ui-icon{width:40px!important;height:40px!important;max-width:40px!important;max-height:40px!important;min-width:40px!important;min-height:40px!important;margin:0 auto 10px;color:#c61d22}
      .rdl-dashboard-hidden{display:none!important}
      .panel{background:#fffefa!important;border-color:#e8dfd8!important;box-shadow:0 5px 18px rgba(41,49,55,.055)!important}
      .panel h3,.topbar h1{color:#173f61}
      .search{background:#fff!important}
      .table-wrap{background:#fff;border-color:#e6ddd5!important}
      th{background:#f8f4ef!important;color:#6b8193!important}
      tbody tr:hover{background:#fff9f4!important}
      .mini{border-color:#e3d9d1!important;color:#173f61!important;border-radius:8px!important}
      .masked{background:#edf2f4!important;color:#6f8394!important}
      dialog{border-radius:16px!important}
      .toast{background:#173f61!important}
      [data-rdl-parity="v5.2.1"]{border-color:#e4d9cf!important;background:#fffdfa!important}
      @media(max-width:1200px){
        .shell{grid-template-columns:260px minmax(0,1fr)!important}
        .rdl-logo-shot{height:200px;background-size:100% auto}
        .sidebar .nav{min-height:62px;font-size:17px!important;padding:0 24px!important;gap:15px}
        .rdl-sidebar-slogan{font-size:20px;bottom:35px}
        #view-dashboard .kpi{grid-template-columns:46px 1fr!important;padding:20px 14px!important}
        .rdl-kpi-icon{width:46px;height:46px}
        .rdl-kpi-icon .ui-icon{width:42px!important;height:42px!important;max-width:42px!important;max-height:42px!important;min-width:42px!important;min-height:42px!important}
        #view-dashboard .kpi strong{font-size:34px!important}
        #view-dashboard .kpi .rdl-kpi-label{font-size:13px!important}
      }
      @media(max-width:1050px){
        .shell{grid-template-columns:220px minmax(0,1fr)!important}
        .rdl-app-name{padding:0 14px;font-size:14px}
        .rdl-logo-shot{height:165px}
        .sidebar .nav{min-height:56px;font-size:14px!important;padding:0 16px!important}
        .local-seal{display:none!important}
        #view-dashboard .kpis{grid-template-columns:repeat(2,1fr)!important}
        #view-dashboard>.grid.two{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(style);
  }

  function decorateBrand() {
    const brand = $('.brand');
    if (!brand) return;
    brand.innerHTML = `
      <div class="rdl-app-name">${svg('app')}<span>Respect des Lieux PRO</span></div>
      <div class="rdl-logo-shot" role="img" aria-label="Lycée Watteau Valenciennes"></div>`;
    const seal = $('.local-seal');
    if (seal) seal.innerHTML = `<div class="rdl-sidebar-slogan">Des lieux respectés<br>pour mieux apprendre</div>`;
  }

  function decorateNavigation() {
    const config = [
      ['dashboard','home','Accueil'],['signalements','alert','Signalements'],['reparations','tool','Interventions'],
      ['confidentialite','chart','Suivi'],['systeme','building','Établissement'],['sauvegardes','settings','Paramètres']
    ];
    for (const [view, iconName, label] of config) {
      const button = $(`.nav[data-view="${view}"]`);
      if (!button) continue;
      button.innerHTML = `${svg(iconName)}<span>${label}</span>`;
      button.setAttribute('aria-label', label);
    }
  }

  function decorateTopbar() {
    const topbar = $('.topbar');
    if (!topbar || topbar.dataset.rdlFidelity === '1') return;
    topbar.dataset.rdlFidelity = '1';
    const titleWrap = topbar.firstElementChild;
    if (titleWrap) titleWrap.classList.add('rdl-hidden-title');
    const actions = $('.top-actions', topbar);
    if (!actions) return;
    const user = document.createElement('div');
    user.className = 'rdl-user';
    user.innerHTML = `<span class="rdl-user-icon">${svg('users')}</span><div><strong>Personnel</strong><small>Session locale</small></div>`;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'rdl-more';
    more.setAttribute('aria-label','Ouvrir les actions rapides');
    more.setAttribute('aria-expanded','false');
    more.innerHTML = svg('more');
    actions.classList.add('rdl-utility-menu');
    topbar.insertBefore(user, actions);
    topbar.insertBefore(more, actions);
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = actions.classList.toggle('open');
      more.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!actions.contains(event.target) && event.target !== more) {
        actions.classList.remove('open');
        more.setAttribute('aria-expanded','false');
      }
    });
  }

  function buildKpis() {
    const cards = $$('#view-dashboard .kpi');
    if (cards.length !== 4 || cards[0].dataset.rdlFidelity === '1') return;
    cards.forEach((card) => card.dataset.rdlFidelity = '1');
    cards[0].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-red">${svg('users')}</span><strong id="kpi-total">0</strong><div class="rdl-kpi-label">Signalements<br>en attente</div>`;
    cards[1].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-blue">${svg('tool')}</span><strong id="kpi-repairs">0</strong><div class="rdl-kpi-label">Interventions<br>en cours</div>`;
    cards[2].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-green">${svg('check')}</span><strong id="rdl-kpi-resolved">0</strong><div class="rdl-kpi-label">Résolus<br>ce mois-ci</div><span class="rdl-kpi-hidden" id="kpi-open">0</span>`;
    cards[3].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-cyan">${svg('users')}</span><strong>100%</strong><div class="rdl-kpi-label">Mobilisés pour un<br>lycée plus propre</div><span class="rdl-kpi-hidden" id="kpi-photos">0</span><small class="rdl-kpi-hidden" id="kpi-photo-size">0 Mo</small>`;
  }

  function buildHero() {
    const hero = $('#view-dashboard .hero');
    if (!hero) return;
    hero.setAttribute('aria-label','Bonjour ! Ensemble, prenons soin de notre lycée. Un cadre serein pour tous.');
    hero.dataset.rdlFidelityHero = 'master';
  }

  function engagementPanel() {
    const grid = $('#view-dashboard > .grid.two');
    if (!grid) return;
    const panels = $$(':scope > .panel', grid);
    if (panels.length < 2) return;
    const panel = panels[1];
    if (panel.dataset.rdlEngagement === '1') return;
    panel.dataset.rdlEngagement = '1';
    panel.innerHTML = `<div class="rdl-engagement"><h3>Notre engagement</h3><blockquote>Un environnement respecté<br>favorise la réussite de chacun.</blockquote><div class="rdl-engagement-rule"></div><div class="rdl-values"><div class="rdl-value">${svg('leaf')}<span>Un lycée<br>plus propre</span></div><div class="rdl-value">${svg('users')}<span>Une communauté<br>responsable</span></div><div class="rdl-value">${svg('graduate')}<span>Des réussites<br>durables</span></div></div><div class="rdl-dashboard-hidden" aria-hidden="true"><span id="fact-db"></span><span id="fact-integrity"></span><span id="fact-version"></span><span id="fact-retention"></span></div></div>`;
  }

  function recentIconName(text) {
    const t = String(text || '').toLowerCase();
    if (/éclair|eclair|lumi|ampoul/.test(t)) return 'bulb';
    if (/toilet|propret|déchet|dechet|poubell/.test(t)) return 'trash';
    if (/vitr|fenê|fene|vitre/.test(t)) return 'window';
    return 'book';
  }

  function decorateRecent() {
    const list = $('#recent-list');
    if (!list) return;
    $$('.recent-item', list).forEach((row) => {
      if (row.querySelector('.rdl-recent-icon')) return;
      const main = $('.recent-main', row);
      const strong = $('strong', main);
      const small = $('small', main);
      const smallText = small?.textContent || '';
      const parts = smallText.split('·').map((s) => s.trim()).filter(Boolean);
      const type = parts.length > 1 ? parts.slice(1).join(' · ') : '';
      if (strong && type && !strong.textContent.includes(type)) strong.textContent = `${strong.textContent} - ${type}`;
      if (small && parts.length) small.textContent = parts[0];
      const iconName = recentIconName(type || strong?.textContent);
      const icon = document.createElement('span');
      icon.className = `rdl-recent-icon ${iconName}`;
      icon.innerHTML = svg(iconName);
      row.prepend(icon);
    });
  }

  function refreshDerivedKpis() {
    let signals = [];
    let repairs = [];
    try {
      if (typeof state !== 'undefined') {
        signals = Array.isArray(state.signalements) ? state.signalements : [];
        repairs = Array.isArray(state.reparations) ? state.reparations : [];
      }
    } catch {}
    const currentMonth = new Date().toISOString().slice(0,7);
    const resolved = signals.filter((s) => {
      const status = String(s.statut || '').toLowerCase();
      if (!(status === 'clos' || status === 'résolu' || status === 'resolu')) return false;
      const stamp = String(s.closed_at || s.updated_at || s.date || '');
      return !stamp || stamp.slice(0,7) === currentMonth;
    }).length;
    const inProgress = repairs.filter((r) => {
      const status = String(r.statut || '').toLowerCase();
      return !['terminée','terminee','annulée','annulee'].includes(status);
    }).length;
    const resolvedNode = $('#rdl-kpi-resolved');
    if (resolvedNode) resolvedNode.textContent = String(resolved);
    const repairsNode = $('#kpi-repairs');
    if (repairsNode && repairs.length) repairsNode.textContent = String(inProgress);
  }

  function installObservers() {
    const recent = $('#recent-list');
    if (recent) new MutationObserver(() => { decorateRecent(); refreshDerivedKpis(); }).observe(recent,{childList:true,subtree:true});
    const signalBody = $('#signalements-body');
    if (signalBody) new MutationObserver(refreshDerivedKpis).observe(signalBody,{childList:true,subtree:true});
  }

  function signature() {
    document.documentElement.dataset.rdlTheme = THEME_VERSION;
    document.documentElement.dataset.rdlFidelity = FIDELITY_SIGNATURE;
    let node = $('[data-rdl-theme-signature]');
    if (!node) { node = document.createElement('i'); node.hidden = true; document.body.appendChild(node); }
    node.dataset.rdlThemeSignature = MASTER_SIGNATURE;
    node.dataset.rdlFidelitySignature = FIDELITY_SIGNATURE;
  }

  function init() {
    injectStyles();decorateBrand();decorateNavigation();decorateTopbar();buildHero();buildKpis();engagementPanel();decorateRecent();refreshDerivedKpis();installObservers();signature();
    setTimeout(() => { decorateRecent(); refreshDerivedKpis(); }, 250);
    setTimeout(() => { decorateRecent(); refreshDerivedKpis(); }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();