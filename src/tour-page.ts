/* eslint-disable @typescript-eslint/ban-ts-comment */
// Moved verbatim from untyped inline page scripts; strict null checks would need many code changes.
// @ts-nocheck
// Shared inline-script helpers for the two Tour de France pages (2026/tdf.html and 2027/tdf.html).
// Like race-page.ts this compiles to a classic script: nothing here runs at load time; every
// function reads page-level globals (stages, RESULTS, RIDERS, lang, ...) declared by the page's
// inline <script> (see globals.d.ts), so it must be loaded after race-page.js and before that script.

/* ---------- STATIC TEXT (header/tabs/footer) ---------- */
function applyStaticText() {
  document.getElementById('backLinkText').textContent = t('backToTours');
  document.getElementById('eyebrow').textContent = t('eyebrow');
  document.getElementById('subDesc').textContent = t('subDesc');
  document.getElementById('tabStages').textContent = t('tabStages');
  document.getElementById('tabResults').textContent = t('tabResults');
  document.getElementById('tabTeams').textContent = t('tabTeams');
  document.getElementById('rankSelectLabel').textContent = t('rankShowLabel');
  document.getElementById('stageListHeader').textContent = t('stageListHeader');
  document.getElementById('disclaimerLabel').textContent = t('disclaimerLabel');
  document.getElementById('disclaimerText').textContent = t('disclaimer');
  document.getElementById('sourcesTitle').textContent = t('sourcesTitle');
  document.getElementById('sourcesBody').innerHTML = t('sourcesBody');
  document.getElementById('footerNote').textContent = t('footerNote');
}

function initStageMap(stage) {
  initStageMapCommon(stage, STAGE_COORDS);
}

async function loadResults() {
  try {
    const resp = await fetch(RESULTS_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    ['gc', 'points', 'mountains', 'youth', 'teams'].forEach((k) => {
      if (data[k] && Array.isArray(data[k].rows)) RESULTS[k].rows = data[k].rows;
    });
    if (data.stageResults && typeof data.stageResults === 'object') {
      RESULTS.stageResults = data.stageResults;
    }
    if (Array.isArray(data.stageWinners)) {
      data.stageWinners.forEach((w) => {
        const row = RESULTS.stageWinners.find((s) => s.n === w.n);
        if (row && w.winner) row.winner = w.winner;
      });
    }
    if (data.updated) RESULTS.updated = data.updated;
    if (data.afterStage) RESULTS.afterStage = data.afterStage;
    renderResults();
  } catch (e) {
    /* No automatic data available — show the built-in state. */
  }
}

async function loadRiders() {
  try {
    const resp = await fetch(RIDERS_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    if (data && Array.isArray(data.teams)) RIDERS = data;
    renderRiders();
  } catch (e) {
    /* No start list available — the view keeps showing t('teamsEmpty'). */
  }
}

async function loadWeather() {
  try {
    const resp = await fetch(WEATHER_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    if (data && data.stages) WEATHER = data;
    renderStageList();
    renderPanel(stages[activeIdx]);
  } catch (e) {
    /* No weather data available — the panel keeps showing t('wxNoData'). */
  }
}

function renderAll() {
  applyStaticText();
  updateLangButtons();
  renderTopStats();
  renderStageList();
  renderPanel(stages[activeIdx]);
  renderResults();
  renderRiders();
  syncStageListHeight();
}

function renderGeneralRankings() {
  const grid = document.getElementById('resultsGrid');
  const anyData = CLASS_KEYS.some((k) => RESULTS[k].rows.length > 0);
  let statusHTML = '';

  if (!anyData) {
    statusHTML = `<div class="status-card">${t('resultsEmpty')}</div>`;
  } else if (RESULTS.updated) {
    statusHTML = `<div class="status-card">${t('resultsStatus')(RESULTS.updated, RESULTS.afterStage)}</div>`;
  }

  let cardsHTML = '';
  CLASS_KEYS.forEach((key, i) => {
    const c = t('classifications')[key];
    const rows = RESULTS[key].rows;
    const expanded = !!expandState[key];
    const shown = expanded ? rows : rows.slice(0, 10);

    let body;
    if (!rows.length) {
      body = `<p class="empty-cls">${t('classEmpty')}</p>`;
    } else {
      body = `<table class="results"><tbody>${shown.map(resultRowHTML).join('')}</tbody></table>`;
      if (rows.length > 10) {
        body += `<button class="expander" data-cls="${key}">${expanded ? t('expandLess') : t('expandMore')(rows.length)}</button>`;
      }
    }

    cardsHTML += `<div class="cls-card" style="${cardBorderStyle(i, CLASS_KEYS.length)}">
      <div class="cls-head">
        <span class="names"><span class="name">${c.name}</span><span class="fr">${c.fr}</span></span>
        <span class="swatch" style="background:${JERSEY[key]}"></span>
      </div>
      <div class="cls-body">${body}</div>
    </div>`;
  });

  const ridden = RESULTS.stageWinners.filter((s) => s.winner);
  const winnersHTML = `<div class="stagewins-block">
    <span style="display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-3)">
      <h3>${t('stageWinnersTitle')}</h3>
      <span class="stagewins-meta">${t('stageWinnersFr')(ridden.length)}</span>
    </span>
    <table class="winners"><tbody>${RESULTS.stageWinners
      .map((s) => {
        const spd = stageAvgSpeed(s.n);
        return `<tr>
        <td class="n">${s.n}</td>
        <td class="route">${s.route}</td>
        <td class="winner">${s.winner || '—'}</td>
        <td class="speed">${spd ? fmtSpeed(spd) : '—'}</td>
      </tr>`;
      })
      .join('')}</tbody></table>
  </div>`;

  const allWd = [];
  RESULTS.stageWinners.forEach((s) => {
    const sr = RESULTS.stageResults[s.n];
    (sr && Array.isArray(sr.withdrawals) ? sr.withdrawals : []).forEach((w) =>
      allWd.push(Object.assign({ stage: s.n }, w)),
    );
  });
  const wdBody = !allWd.length
    ? `<p class="empty-cls">${t('noWithdrawalsRace')}</p>`
    : `<table class="results"><tbody>${allWd
        .map(
          (w) => `
        <tr>
          <td class="pos">${w.stage}</td>
          <td class="rider"><span class="rname">${w.rider}</span>${w.team ? `<span class="rteam">${w.team}</span>` : ''}</td>
          <td class="val">${t('withdrawalReasons')[w.reason] || w.reason}</td>
        </tr>`,
        )
        .join('')}</tbody></table>`;
  const withdrawalsHTML = `<div class="stagewins-block">
    <span style="display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-3)">
      <h3>${t('allWithdrawalsTitle')}</h3>
      <span class="stagewins-meta">${t('allWithdrawalsFr')(allWd.length)}</span>
    </span>
    ${wdBody}
  </div>`;

  grid.innerHTML =
    statusHTML + `<div class="clsgrid">${cardsHTML}</div>` + winnersHTML + withdrawalsHTML;
  bindExpanders(grid);
}

function renderProfile(stage) {
  const W = 900,
    H = 250,
    padL = 30,
    padR = 16,
    padT = 22,
    padB = 30;
  const { d, plotH } = buildPath(stage.profile, stage.km, W, H, padL, padR, padT, padB);
  const baseY = padT + plotH;

  let svg = `<svg class="profile" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t('profileAria')(stage.n)}">`;

  for (let g = 0; g <= 4; g++) {
    const gy = padT + (plotH * g) / 4;
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--color-neutral-300)" stroke-width="1"/>`;
  }
  const step = stage.km > 150 ? 50 : stage.km > 60 ? 20 : 5;
  for (let k = 0; k <= stage.km + 0.01; k += step) {
    const kx = xForKm(k, stage.km, W, padL, padR);
    svg += `<line x1="${kx}" y1="${padT}" x2="${kx}" y2="${baseY}" stroke="var(--color-neutral-200)" stroke-width="1"/>`;
    svg += `<text x="${kx}" y="${H - 10}" font-family="Archivo, sans-serif" font-size="11" font-weight="600" fill="var(--color-neutral-600)" text-anchor="middle">${Math.round(k)}</text>`;
  }

  (stage.climbs || []).forEach((c) => {
    const x1 = xForKm(Math.max(0, c.km - c.len), stage.km, W, padL, padR);
    const x2 = xForKm(c.km, stage.km, W, padL, padR);
    const col = CAT_COLOR[c.cat] || CAT_COLOR.C1;
    svg += `<rect x="${x1}" y="${padT}" width="${Math.max(2, x2 - x1)}" height="${plotH}" fill="${col}" opacity="0.18"/>`;
    svg += `<line x1="${x2}" y1="${padT}" x2="${x2}" y2="${baseY}" stroke="${col}" stroke-width="2"/>`;
    svg += `<rect x="${x2 - 4}" y="${padT - 12}" width="8" height="8" fill="${col}"/>`;
  });

  svg += `<path d="${d} L ${xForKm(stage.km, stage.km, W, padL, padR)},${baseY} L ${padL},${baseY} Z" fill="var(--color-text)" opacity="0.1"/>`;
  svg += `<path d="${d}" fill="none" stroke="var(--color-text)" stroke-width="2.5" stroke-linejoin="round"/>`;

  (stage.sprints || []).forEach((s) => {
    const sx = xForKm(s.km, stage.km, W, padL, padR);
    const top = padT + plotH * 0.28;
    svg += `<line x1="${sx}" y1="${top}" x2="${sx}" y2="${baseY}" stroke="var(--color-accent)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    svg += `<path d="M ${sx} ${top} L ${sx + 14} ${top + 5} L ${sx} ${top + 10} Z" fill="var(--color-accent)"/>`;
  });

  svg += `<line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="var(--color-text)" stroke-width="2"/>`;
  svg += `</svg>`;
  return svg;
}

function renderRankSelect() {
  const sel = document.getElementById('rankStageSelect');
  const ridden = riddenStages();
  const valid = rankView === 'general' || ridden.some((s) => String(s.n) === String(rankView));
  if (!valid) rankView = 'general';

  let opts = `<option value="general">${t('rankGeneral')}</option>`;
  ridden.forEach((s) => {
    opts += `<option value="${s.n}">${t('rankStageOpt')(s.n, s.route)}</option>`;
  });
  sel.innerHTML = opts;
  sel.value = String(rankView);
}

function renderResults() {
  renderRankSelect();
  document.getElementById('resultsStatusLine').textContent = RESULTS.updated
    ? fmtUpdated(RESULTS.updated)
    : '';
  if (rankView === 'general') renderGeneralRankings();
  else renderStageResult(rankView);
}

function renderRiders() {
  const grid = document.getElementById('teamsGrid');
  if (!RIDERS || !Array.isArray(RIDERS.teams) || !RIDERS.teams.length) {
    grid.innerHTML = `<div class="status-card">${t('teamsEmpty')}</div>`;
    return;
  }

  const out = RIDERS.riderCount - RIDERS.finishers;
  const statusHTML = `<div class="teamsstatus">${t('teamsStatus')(RIDERS.riderCount, RIDERS.teamCount, RIDERS.finishers, out)}</div>`;

  const cardsHTML = RIDERS.teams
    .map((team, i) => {
      const nameHTML = team.url
        ? `<a class="team-link" href="${esc(team.url)}" target="_blank" rel="noopener">${esc(team.name)}</a>`
        : `<span class="team-link">${esc(team.name)}</span>`;
      const sub = team.gcPos
        ? t('teamClsLine')(team.gcPos, team.gcGap || team.gcVal)
        : t('teamClsNone');
      return `<div class="team-card" style="${cardBorderStyle(i, RIDERS.teams.length)}">
      <div class="team-head">
        <span class="team-rank${team.gcPos === 1 ? ' first' : ''}">${team.gcPos || '–'}</span>
        <span class="team-meta">${nameHTML}<span class="team-clsline">${sub}</span></span>
      </div>
      <table class="riders">
        <thead><tr>
          <th>${t('colBib')}</th><th>${t('colRider')}</th>
          <th>${t('colGcPos')}</th><th>${t('colGcTime')}</th>
        </tr></thead>
        <tbody>${team.riders.map(riderRowHTML).join('')}</tbody>
      </table>
    </div>`;
    })
    .join('');

  grid.innerHTML = statusHTML + `<div class="clsgrid">${cardsHTML}</div>`;
}

function renderStageList() {
  const stagelayout = document.querySelector('.stagelayout');
  const panel = document.getElementById('panel');
  if (panel && stagelayout && listEl.contains(panel)) stagelayout.appendChild(panel);
  listEl.innerHTML = '';
  stages.forEach((s, idx) => {
    const li = document.createElement('li');
    li.className = 'stage-item';
    if (s.n === 'lepo') {
      const div = document.createElement('div');
      div.className = 'rest-row';
      const restNum = s.labelKey === 'rest1' ? 1 : 2;
      div.textContent = `${fmtDate(s.dateIso)} · ${t('restDayLabel')} ${restNum}`;
      li.appendChild(div);
      listEl.appendChild(li);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'stage-btn';
    btn.dataset.idx = idx;
    if (idx === activeIdx) btn.classList.add('active');
    const listWx = wxFor(s.n);
    btn.innerHTML = `
      <span class="num">${String(s.n).padStart(2, '0')}</span>
      <span class="btn-text">
        <span class="btn-route">${s.start} → ${s.finish}</span>
        <span class="btn-meta">${fmtDate(s.dateIso)} · ${fmtKm(s.km)} · ${t('typeLabels')[s.type]}</span>
      </span>
      <span class="btn-wx">${listWx ? `${listWx.start.temp}° → ${listWx.finish.temp}°` : ''}</span>`;
    btn.addEventListener('click', () => selectStage(idx));
    li.appendChild(btn);
    listEl.appendChild(li);
  });
  positionPanel();
}

function renderStageResult(n) {
  const grid = document.getElementById('resultsGrid');
  const sr = RESULTS.stageResults[n] || {};
  const rows = Array.isArray(sr.rows) ? sr.rows : [];
  const meta = RESULTS.stageWinners.find((s) => String(s.n) === String(n));
  const route = meta ? meta.route : '';

  const mainBody = rows.length
    ? stageStatTable(rows, '__stage')
    : `<p class="empty-cls">${t('stageResultEmpty')}</p>`;
  const spd = stageAvgSpeed(n);
  const sub = route + (spd ? ` · ${t('avgSpeed')(fmtSpeed(spd))}` : '');
  const mainHTML = `<div class="cls-card" style="border-bottom:2px solid var(--color-divider)">
    <div class="cls-head">
      <span class="names"><span class="name">${t('stageResultTitle')(n)}</span><span class="fr">${sub}</span></span>
      <span class="swatch" style="background:${AUX_SWATCH.winners}"></span>
    </div>
    <div class="cls-body">${mainBody}</div>
  </div>`;

  let cardsHTML = '';
  if (rows.length) {
    const cards = [];
    STAGE_STAT_KEYS.forEach((key) => {
      const c = t('stageStats')[key];
      const data = Array.isArray(sr[key]) ? sr[key] : [];
      let body;
      if (key === 'points' || key === 'mountains') {
        body = !data.length
          ? `<p class="empty-cls">${t('stageStatEmpty')}</p>`
          : data
              .map(
                (sec, i) =>
                  (sec.label ? `<div class="sec-label">${sec.label}</div>` : '') +
                  stageStatTable(sec.rows || [], `__stage_${key}_${i}`),
              )
              .join('');
      } else {
        body = stageStatTable(data, '__stage_' + key);
      }
      cards.push({ name: c.name, fr: c.fr, swatch: JERSEY[key], body });
    });

    const cc = t('stageStats').combative;
    const comb = sr.combative;
    const combBody =
      comb && comb.rider
        ? `<table class="results"><tbody>${resultRowHTML({ pos: 1, rider: comb.rider, team: comb.team, nat: comb.nat, val: '' })}</tbody></table>`
        : `<p class="empty-cls">${t('stageStatEmpty')}</p>`;
    cards.push({ name: cc.name, fr: cc.fr, swatch: AUX_SWATCH.combative, body: combBody });

    const wt = t('stageStats').withdrawals;
    const wd = Array.isArray(sr.withdrawals) ? sr.withdrawals : [];
    const wBody = !wd.length
      ? `<p class="empty-cls">${t('noWithdrawals')}</p>`
      : `<table class="results"><tbody>${wd
          .map(
            (w) => `
          <tr>
            <td class="pos">${w.bib}</td>
            <td class="rider"><span class="rname">${w.rider}</span>${w.team ? `<span class="rteam">${w.team}</span>` : ''}</td>
            <td class="val">${t('withdrawalReasons')[w.reason] || w.reason}</td>
          </tr>`,
          )
          .join('')}</tbody></table>`;
    cards.push({ name: wt.name, fr: wt.fr, swatch: AUX_SWATCH.withdrawals, body: wBody });

    cardsHTML = cards
      .map(
        (c, i) => `<div class="cls-card" style="${cardBorderStyle(i, cards.length)}">
      <div class="cls-head">
        <span class="names"><span class="name">${c.name}</span><span class="fr">${c.fr}</span></span>
        <span class="swatch" style="background:${c.swatch}"></span>
      </div>
      <div class="cls-body">${c.body}</div>
    </div>`,
      )
      .join('');
  }

  grid.innerHTML = mainHTML + (cardsHTML ? `<div class="clsgrid">${cardsHTML}</div>` : '');
  bindExpanders(grid);
}

/* ---------- TOP STATS ---------- */
function renderTopStats() {
  document.getElementById('topstats').innerHTML = `
    <div class="statcell"><span class="label">${t('statDistance')}</span><span class="value">${t('statDistanceVal')}</span></div>
    <div class="statcell"><span class="label">${t('statGain')}</span><span class="value">${t('statGainVal')}</span></div>
    <div class="statcell"><span class="label">${t('statStages')}</span><span class="value">${t('statStagesVal')}</span></div>
    <div class="statcell"><span class="label">${t('statRestDays')}</span><span class="value">${t('statRestDaysVal')}</span></div>
    <div class="statcell"><span class="label">${t('statMountainFinish')}</span><span class="value">${t('statMountainFinishVal')}</span></div>
  `;
}

function resultRowHTML(r) {
  return `
    <tr class="${r.pos <= 3 ? 'podium' : ''}">
      <td class="pos">${r.pos}</td>
      <td class="rider"><span class="rname">${r.rider}</span>${r.team ? `<span class="rteam">${r.team}${r.nat ? ' · ' + r.nat : ''}</span>` : ''}</td>
      <td class="val">${r.gap !== undefined && r.pos > 1 ? r.gap : r.val}</td>
    </tr>`;
}

function selectStage(idx) {
  activeIdx = idx;
  document
    .querySelectorAll('.stage-btn')
    .forEach((b) => b.classList.toggle('active', +b.dataset.idx === idx));
  const activeBtn = document.querySelector(`.stage-btn[data-idx="${idx}"]`);
  if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest' });
  renderPanel(stages[idx]);
  positionPanel();
  syncStageListHeight();
}

function setLang(newLang) {
  if (newLang !== 'fi' && newLang !== 'en' && newLang !== 'fr') return;
  lang = newLang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  renderAll();
}

function syncStageListHeight() {
  const list = document.querySelector('.stagerail');
  const panel = document.getElementById('panel');
  const stagesView = document.getElementById('view-etapit');
  if (!list || !panel || !stagesView) return;
  if (window.innerWidth <= 980 || !stagesView.classList.contains('active')) {
    list.style.height = '';
    return;
  }
  list.style.height = panel.offsetHeight + 'px';
}
