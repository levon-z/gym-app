'use strict';
// Gym: a workout app for the iPhone's home screen. Everything is saved on the phone (localStorage) and the app works offline
// (sw.js keeps a copy). Pages: Vandaag, Schema's, Oefeningen, Voortgang; a workout opens the full-screen dial (FORM look).

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'gym-app-v2';
const fresh = () => ({ v: 2, rest: 90, sound: true, awake: true, plans: EXAMPLE_PLANS(), custom: [], active: null, history: [], next: 0 });
let S = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 2 ? s : fresh(); } catch { return fresh(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Opslaan lukte niet: is je opslag vol?'); } };
const ALL = () => LIBRARY.concat(S.custom);
const exOf = id => ALL().find(e => e.id === id) || { id, name: 'Oefening', group: 'core', equip: 'body', how: '', tip: '' };
const kgTxt = kg => String(Math.round(kg * 10) / 10).replace('.', ',');
const mmss = sec => { sec = Math.max(0, Math.ceil(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
const restTxt = sec => sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min` : `${sec} sec`;
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const monday = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
const dateTxt = ts => new Date(ts).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const repsWord = ex => ex.type === 'time' ? 'Sec' : ex.type === 'cardio' ? 'Min' : 'Reps';
const itemTxt = (ex, it) => ex.type === 'cardio' ? `${it.sets} × ${it.reps} min` : ex.type === 'time' ? `${it.sets} × ${it.reps} sec` : `${it.sets} × ${it.reps}${it.kg ? ` · ${kgTxt(it.kg)} kg` : ' · eigen gewicht'}`;
const setTxt = (ex, x) => ex.type === 'cardio' ? `${x.reps} min` : ex.type === 'time' ? `${x.reps} sec` : x.kg ? `${kgTxt(x.kg)} × ${x.reps}` : `${x.reps}×`;
const volOf = s => s.items.reduce((n, it) => exOf(it.ex).type ? n : n + it.sets.reduce((m, x) => m + x.kg * x.reps, 0), 0);
const setsOf = s => s.items.reduce((n, it) => n + it.sets.length, 0);
const minsOf = s => Math.max(1, Math.round((s.ended - s.started) / 60000));
const volTxt = v => v >= 10000 ? `${(v / 1000).toFixed(1).replace('.', ',')} ton` : `${Math.round(v).toLocaleString('nl-NL')} kg`;
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1900); }

// dot-matrix digits (5×7), like the numbers in the design
const GLYPH = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'], ',': ['00', '00', '00', '00', '00', '01', '10'], '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ' ': ['00', '00', '00', '00', '00', '00', '00']
};
function dots(str, cell) {
  let x = 0; const out = [];
  for (const ch of String(str)) {
    const g = GLYPH[ch] || GLYPH[' '], w = g[0].length;
    g.forEach((row, r) => [...row].forEach((on, c) => { if (on === '1') out.push(`<circle cx="${(x + c * cell + cell / 2).toFixed(1)}" cy="${(r * cell + cell / 2).toFixed(1)}" r="${(cell * 0.37).toFixed(2)}"/>`); }));
    x += (w + 1) * cell;
  }
  const W = Math.max(cell, x - cell), H = 7 * cell;
  return `<svg class="dm" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g fill="currentColor">${out.join('')}</g></svg><span class="sr">${esc(str)}</span>`;
}

// small line icons
const IC = {
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  check: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',
  skip: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 6 6-6 6M13 6l6 6-6 6"/></svg>',
  next: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  flag: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h11l-2 4 2 4H5"/></svg>',
  up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/></svg>',
};
const TABS = [
  ['home', 'Vandaag', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>'],
  ['plans', 'Schema’s', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>'],
  ['library', 'Oefeningen', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12"/></svg>'],
  ['progress', 'Voortgang', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'],
];

// ---------- numbers about you ----------
function records() { // your best set per exercise, and when each record was set
  const best = {}, events = [];
  for (const s of [...S.history].sort((a, b) => a.started - b.started)) for (const it of s.items) {
    if (exOf(it.ex).type) continue;
    for (const x of it.sets) { const b = best[it.ex]; if (x.kg > 0 && (!b || x.kg > b.kg || (x.kg === b.kg && x.reps > b.reps))) { best[it.ex] = { kg: x.kg, reps: x.reps, at: s.started }; events.push({ ex: it.ex, kg: x.kg, reps: x.reps, at: s.started }); } }
  }
  return { best, events };
}
const e1rm = (kg, reps) => kg * (1 + reps / 30); // a guess of the most you could lift once (Epley)
function weekStreak() { // weeks in a row with at least one workout (this week counts once you trained)
  const weeks = new Set(S.history.map(s => monday(s.started))); let w = monday(Date.now()), n = 0;
  if (!weeks.has(w)) w -= 7 * 86400000;
  while (weeks.has(w)) { n++; w -= 7 * 86400000; } return n;
}
const planSets = p => p.items.reduce((n, it) => n + it.sets, 0);
const planMins = p => Math.round(p.items.reduce((n, it) => n + it.sets * (40 + it.rest), 0) / 60);
const planGroups = p => [...new Set(p.items.map(it => GROUPS[exOf(it.ex).group]))];

// ---------- pages ----------
let route = { page: 'home' }, stack = [];
function nav(page, p = {}) { stack.push(route); route = { page, ...p }; draw(true); }
function back() { route = stack.pop() || { page: 'home' }; draw(true); }
function tab(page) { stack = []; route = { page }; draw(true); }
function draw(anim = false) {
  const v = $('view'), top = v.scrollTop;
  v.innerHTML = (PAGES[route.page] || PAGES.home)();
  if (anim) { v.scrollTop = 0; v.classList.remove('in'); void v.offsetWidth; v.classList.add('in'); } else v.scrollTop = top;
  const cur = ['plan'].includes(route.page) ? 'plans' : route.page === 'exercise' ? 'library' : route.page;
  $('tabs').innerHTML = TABS.map(([id, label, icon]) => `<button class="${id === cur ? 'on' : ''}" data-act="tab" data-id="${id}" aria-label="${label}">${icon}${label}</button>`).join('');
  const a = S.active;
  $('resume').innerHTML = a ? `<div class="resume"><div class="w"><b>${esc(a.name)}</b><span>Training bezig · ${a.items.reduce((n, it) => n + it.log.length, 0)} sets · ${Math.max(1, Math.round((Date.now() - a.started) / 60000))} min</span></div><button data-act="openWo">Ga verder</button></div>` : '';
  if (route.page === 'library') libList();
}
const head = (title, sub = '', right = '', backBtn = false) => `<div class="head">${backBtn ? `<button class="icon-btn" data-act="back" aria-label="Terug">${IC.back}</button>` : ''}<div class="w"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;

const PAGES = {
  home() {
    const h = new Date().getHours(), hi = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
    const today = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    let hero;
    if (S.active) {
      const a = S.active, done = a.items.reduce((n, it) => n + it.log.length, 0), all = a.items.reduce((n, it) => n + it.sets, 0);
      hero = `<div class="hero">${heroDeco()}<div class="k">Training bezig</div><h3>${esc(a.name)}</h3><p>${done} van ${all} sets · ${Math.max(1, Math.round((Date.now() - a.started) / 60000))} min</p><button class="big-btn" data-act="openWo">${IC.play}Ga verder</button></div>`;
    } else if (S.plans.length) {
      const p = S.plans[S.next % S.plans.length];
      hero = `<div class="hero">${heroDeco()}<div class="k">Volgende training</div><h3>${esc(p.name)}</h3><p>${p.items.length} oefeningen · ${planSets(p)} sets · ± ${planMins(p)} min</p>
        <div class="chips">${planGroups(p).map(g => `<span class="chip">${g}</span>`).join('')}</div>
        <div style="display:flex;gap:8px"><button class="big-btn" data-act="start" data-id="${p.id}">${IC.play}Start</button><button class="big-btn soft" data-act="tab" data-id="plans">Ander schema</button></div></div>`;
    } else hero = `<div class="hero"><div class="k">Nog geen schema</div><h3>Maak je eerste schema</h3><p>Kies je oefeningen, sets en gewichten.</p><button class="big-btn" data-act="newPlan">${IC.plus}Nieuw schema</button></div>`;
    const wk = monday(Date.now()), trained = new Set(S.history.map(s => dayKey(s.started))), todayKey = dayKey(Date.now());
    const week = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((d, i) => { const ts = wk + i * 86400000, k = dayKey(ts), date = new Date(ts).getDate();
      return `<div class="${trained.has(k) ? 'done' : ''} ${k === todayKey ? 'today' : ''}"><i>${trained.has(k) ? '✓' : date}</i>${d}</div>`; }).join('');
    const thisWeek = S.history.filter(s => s.started >= wk), wSets = thisWeek.reduce((n, s) => n + setsOf(s), 0), wVol = thisWeek.reduce((n, s) => n + volOf(s), 0);
    const recent = S.history.slice(0, 3).map(sessionRow).join('');
    const rec = records().events.slice(-4).reverse().map(e => `<button class="row" data-act="exercise" data-id="${e.ex}"><span class="ico" style="background:rgba(255,217,138,.18);color:var(--gold)">★</span><div class="w"><b>${esc(exOf(e.ex).name)}</b><span>${dateTxt(e.at)}</span></div><span class="badge gold">${kgTxt(e.kg)} × ${e.reps}</span></button>`).join('');
    return `${head(hi, today.charAt(0).toUpperCase() + today.slice(1), `<button class="icon-btn" data-act="settings" aria-label="Instellingen">${IC.gear}</button>`)}
      ${hero}
      ${standalone() ? '' : `<button class="row" data-act="install" style="margin-top:12px"><span class="ico">${IC.share}</span><div class="w"><b>Zet me op je beginscherm</b><span>Dan is het een echte app, ook zonder internet</span></div><span class="chev">›</span></button>`}
      <div class="sec"><h2>Deze week</h2></div>
      <div class="card week">${week}</div>
      <div class="stats" style="margin-top:8px">
        <div class="stat">${dots(String(thisWeek.length), 4.6)}<span>trainingen</span></div>
        <div class="stat">${dots(String(wSets), 4.6)}<span>sets</span></div>
        <div class="stat">${dots(wVol >= 10000 ? (wVol / 1000).toFixed(1).replace('.', ',') : String(Math.round(wVol)), wVol >= 10000 ? 4.6 : String(Math.round(wVol)).length >= 4 ? 3.4 : 4.6)}<span>${wVol >= 10000 ? 'ton getild' : 'kg getild'}</span></div>
      </div>
      <div class="sec"><h2>Laatste trainingen</h2>${S.history.length > 3 ? '<button data-act="tab" data-id="progress">Alles</button>' : ''}</div>
      <div class="list">${recent || '<div class="card empty">Je eerste training komt hier te staan.</div>'}</div>
      ${rec ? `<div class="sec"><h2>Nieuwe records</h2></div><div class="list">${rec}</div>` : ''}`;
  },

  plans() {
    const rows = S.plans.map(p => `<button class="row" data-act="plan" data-id="${p.id}"><span class="ico">${esc(p.name.trim().charAt(0).toUpperCase())}</span><div class="w"><b>${esc(p.name)}</b><span>${p.items.length} oefeningen · ${planSets(p)} sets · ± ${planMins(p)} min</span></div><span class="chev">›</span></button>`).join('');
    return `${head('Schema’s', 'Kies een training, of pas er een aan', `<button class="icon-btn" data-act="newPlan" aria-label="Nieuw schema">${IC.plus}</button>`)}
      <div class="list">${rows || '<div class="card empty">Nog geen schema’s. Tik op + om er een te maken.</div>'}</div>
      <p class="note">Dit zijn voorbeeldschema’s om mee te beginnen. Pas de gewichten aan naar wat jij tilt: na elke training onthoudt de app je laatste gewicht.</p>`;
  },

  plan() {
    const p = S.plans.find(x => x.id === route.id); if (!p) { route = { page: 'plans' }; return PAGES.plans(); }
    const rows = p.items.map((it, i) => { const ex = exOf(it.ex);
      return `<button class="row" data-act="editItem" data-i="${i}"><span class="ico">${i + 1}</span><div class="w"><b>${esc(ex.name)}</b><span>${itemTxt(ex, it)} · rust ${restTxt(it.rest)}</span></div><span class="chev">›</span></button>`; }).join('');
    const isActive = S.active && S.active.pid === p.id;
    return `${head(p.name, `${p.items.length} oefeningen · ${planSets(p)} sets · ± ${planMins(p)} min`, `<button class="icon-btn" data-act="renamePlan" aria-label="Naam wijzigen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>`, true)}
      <button class="big-btn full" data-act="${isActive ? 'openWo' : 'start'}" data-id="${p.id}">${IC.play}${isActive ? 'Ga verder met deze training' : 'Start training'}</button>
      <div class="sec"><h2>Oefeningen</h2><button data-act="pickForPlan">+ Toevoegen</button></div>
      <div class="list">${rows || '<div class="card empty">Nog geen oefeningen. Voeg er een toe.</div>'}</div>
      <div class="btns" style="margin-top:22px"><button class="big-btn danger full" data-act="deletePlan">Schema verwijderen</button></div>`;
  },

  library() {
    return `${head('Oefeningen', `${ALL().length} oefeningen met uitleg`, `<button class="icon-btn" data-act="newExercise" aria-label="Eigen oefening">${IC.plus}</button>`)}
      <input class="search" id="q" type="search" placeholder="Zoek een oefening" value="${esc(libQ)}" autocomplete="off">
      <div class="scroller" style="margin-top:10px">${[['', 'Alles'], ...Object.entries(GROUPS)].map(([k, l]) => `<button class="chip ${libG === k ? 'on' : ''}" data-act="libGroup" data-id="${k}">${l}</button>`).join('')}</div>
      <div id="libList"></div>`;
  },

  exercise() {
    const ex = exOf(route.id), { best } = records(), b = best[ex.id];
    const sessions = S.history.filter(s => s.items.some(it => it.ex === ex.id)).sort((a, z) => a.started - z.started);
    const tops = sessions.map(s => ({ at: s.started, kg: Math.max(...s.items.find(it => it.ex === ex.id).sets.map(x => ex.type ? x.reps : x.kg)) }));
    const lastFew = sessions.slice(-5).reverse().map(s => { const it = s.items.find(x => x.ex === ex.id);
      return `<button class="row" data-act="session" data-id="${s.id}"><div class="w"><b>${dateTxt(s.started)}</b><span>${it.sets.map(x => setTxt(ex, x)).join('  ·  ')}</span></div></button>`; }).join('');
    return `${head(ex.name, '', '', true)}
      <div class="chips" style="margin:-8px 2px 14px"><span class="chip">${GROUPS[ex.group]}</span><span class="chip">${EQUIP[ex.equip] || ''}</span>${ex.custom ? '<span class="chip">Eigen oefening</span>' : ''}</div>
      ${ex.how ? `<div class="card how">${esc(ex.how)}${ex.tip ? `<div class="tip"><b>Tip</b> · ${esc(ex.tip)}</div>` : ''}</div>` : ''}
      ${ex.type ? '' : `<div class="sec"><h2>Jouw record</h2></div><div class="pr">
        <div class="stat">${dots(b ? kgTxt(b.kg) : '0', 4.4)}<span>kg${b ? ` × ${b.reps}` : ''}</span></div>
        <div class="stat">${dots(b ? kgTxt(Math.round(e1rm(b.kg, b.reps))) : '0', 4.4)}<span>max 1× (geschat)</span></div>
        <div class="stat">${dots(String(sessions.length), 4.4)}<span>keer gedaan</span></div></div>`}
      ${tops.length > 1 ? `<div class="card chart" style="margin-top:8px"><div class="t"><b>${ex.type ? 'Langste set' : 'Zwaarste set'}</b><span>${ex.type === 'time' ? 'sec' : ex.type === 'cardio' ? 'min' : 'kg'} per training</span></div>${lineChart(tops.slice(-12))}</div>` : ''}
      <div class="btns two" style="margin-top:16px"><button class="big-btn soft" data-act="addToPlan" data-id="${ex.id}">${IC.plus}In schema</button>${S.active ? `<button class="big-btn" data-act="addToActive" data-id="${ex.id}">${IC.plus}In training</button>` : `<button class="big-btn" data-act="quickStart" data-id="${ex.id}">${IC.play}Nu doen</button>`}</div>
      ${lastFew ? `<div class="sec"><h2>Laatste keren</h2></div><div class="list">${lastFew}</div>` : ''}
      ${ex.custom ? '<div class="btns"><button class="big-btn danger full" data-act="deleteExercise">Oefening verwijderen</button></div>' : ''}`;
  },

  progress() {
    const total = S.history.length, vol = S.history.reduce((n, s) => n + volOf(s), 0), { best } = records();
    const recs = Object.entries(best).sort((a, z) => z[1].at - a[1].at).slice(0, 10).map(([id, b]) => `<button class="row" data-act="exercise" data-id="${id}"><div class="w"><b>${esc(exOf(id).name)}</b><span>${dateTxt(b.at)} · max 1× ± ${kgTxt(Math.round(e1rm(b.kg, b.reps)))} kg</span></div><span class="badge gold">${kgTxt(b.kg)} × ${b.reps}</span></button>`).join('');
    return `${head('Voortgang', total ? `${total} trainingen sinds ${dateTxt(Math.min(...S.history.map(s => s.started)))}` : 'Train en je ziet hier hoe je sterker wordt')}
      <div class="stats">
        <div class="stat">${dots(String(total), 4.6)}<span>trainingen</span></div>
        <div class="stat">${dots((vol / 1000).toFixed(1).replace('.', ','), 4.6)}<span>ton getild</span></div>
        <div class="stat">${dots(String(weekStreak()), 4.6)}<span>weken op rij</span></div>
      </div>
      <div class="card chart" style="margin-top:8px"><div class="t"><b>Per week</b><span>kg getild</span></div>${weekChart()}</div>
      <div class="card chart" style="margin-top:8px"><div class="t"><b>Kalender</b><span>laatste 12 weken</span></div>${calendar()}</div>
      ${recs ? `<div class="sec"><h2>Records</h2></div><div class="list">${recs}</div>` : ''}
      <div class="sec"><h2>Alle trainingen</h2></div>
      <div class="list">${S.history.map(sessionRow).join('') || '<div class="card empty">Nog geen trainingen. Start er een op Vandaag.</div>'}</div>`;
  },
};
const sessionRow = s => `<button class="row" data-act="session" data-id="${s.id}"><span class="ico">${new Date(s.started).getDate()}</span><div class="w"><b>${esc(s.name)}</b><span>${dateTxt(s.started)} · ${setsOf(s)} sets · ${minsOf(s)} min</span></div><span class="badge">${volTxt(volOf(s))}</span></button>`;
const heroDeco = () => `<svg class="deco" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => { const a = -Math.PI * 0.95 + i * 0.075, r1 = 150, r2 = i % 5 === 0 ? 132 : 140, cx = 220, cy = 220;
  return `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" stroke="#fff" stroke-opacity="${i % 5 === 0 ? .8 : .45}" stroke-width="${i % 5 === 0 ? 2 : 1.3}" stroke-linecap="round"/>`; }).join('')}<circle cx="${220 + 150 * Math.cos(-Math.PI * 0.95 + 21 * 0.075)}" cy="${220 + 150 * Math.sin(-Math.PI * 0.95 + 21 * 0.075)}" r="5" fill="#fff"/></svg>`;

// the exercise list (redrawn on its own while you type, so the keyboard stays open)
let libQ = '', libG = '';
function libList() {
  const box = $('libList'); if (!box) return;
  const { best } = records(), q = libQ.trim().toLowerCase();
  const found = ALL().filter(e => (!libG || e.group === libG) && (!q || e.name.toLowerCase().includes(q) || GROUPS[e.group].toLowerCase().includes(q)));
  const groups = Object.keys(GROUPS).filter(g => found.some(e => e.group === g));
  box.innerHTML = groups.map(g => `<div class="sec"><h2>${GROUPS[g]}</h2></div><div class="list">${found.filter(e => e.group === g).map(e => { const b = best[e.id];
    return `<button class="row" data-act="exercise" data-id="${e.id}"><div class="w"><b>${esc(e.name)}</b><span>${EQUIP[e.equip] || ''}${e.custom ? ' · eigen' : ''}</span></div>${b ? `<span class="badge gold">${kgTxt(b.kg)} kg</span>` : '<span class="chev">›</span>'}</button>`; }).join('')}</div>`).join('')
    || '<div class="card empty" style="margin-top:14px">Niets gevonden. Tik op + om hem zelf toe te voegen.</div>';
}

// ---------- charts ----------
function weekChart() {
  const w0 = monday(Date.now()), weeks = Array.from({ length: 8 }, (_, i) => w0 - (7 - i) * 7 * 86400000);
  const vals = weeks.map(w => S.history.filter(s => s.started >= w && s.started < w + 7 * 86400000).reduce((n, s) => n + volOf(s), 0));
  const max = Math.max(1, ...vals), W = 320, H = 150, bw = 26, gap = (W - bw * 8) / 7;
  const bars = vals.map((v, i) => { const h = v ? Math.max(6, (v / max) * 104) : 4, x = i * (bw + gap), y = 116 - h, now = i === 7;
    const label = new Date(weeks[i]).getDate() + '/' + (new Date(weeks[i]).getMonth() + 1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="8" fill="#fff" fill-opacity="${now ? 0.95 : v ? 0.42 : 0.12}"/>
      ${v && (now || v === max) ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 't' : Math.round(v)}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="136" text-anchor="middle" font-size="10" fill="#fff" fill-opacity=".5">${label}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kilo’s per week, de laatste 8 weken">${bars}</svg>`;
}
function calendar() {
  const end = monday(Date.now()) + 7 * 86400000, start = end - 12 * 7 * 86400000, per = {};
  for (const s of S.history) if (s.started >= start) per[dayKey(s.started)] = (per[dayKey(s.started)] || 0) + volOf(s) + 1;
  const max = Math.max(1, ...Object.values(per)), c = 21, g = 4.6, W = 12 * (c + g), H = 7 * (c + g) + 16, today = dayKey(Date.now());
  let cells = '';
  for (let w = 0; w < 12; w++) for (let d = 0; d < 7; d++) {
    const ts = start + (w * 7 + d) * 86400000, k = dayKey(ts), v = per[k], future = ts > Date.now();
    cells += `<rect x="${w * (c + g)}" y="${d * (c + g)}" width="${c}" height="${c}" rx="6" fill="#fff" fill-opacity="${future ? 0.03 : v ? 0.35 + 0.6 * v / max : 0.09}" ${k === today ? 'stroke="#fff" stroke-width="1.6"' : ''}/>`;
  }
  const months = [...Array(12)].map((_, w) => { const d = new Date(start + w * 7 * 86400000); return d.getDate() <= 7 ? `<text x="${w * (c + g)}" y="${H - 2}" font-size="10" fill="#fff" fill-opacity=".5">${d.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')}</text>` : ''; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dagen dat je trainde, de laatste 12 weken">${cells}${months}</svg>`;
}
function lineChart(pts) {
  const W = 320, H = 140, min = Math.min(...pts.map(p => p.kg)), max = Math.max(...pts.map(p => p.kg)), span = Math.max(1, max - min);
  const X = i => 14 + i * ((W - 28) / Math.max(1, pts.length - 1)), Y = v => 104 - ((v - min) / span) * 84;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.kg).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Je zwaarste set per training"><defs><linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${X(pts.length - 1).toFixed(1)} 114 L${X(0).toFixed(1)} 114 Z" fill="url(#lf)"/><path d="${line}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3}" fill="#fff"/>`).join('')}
    <text x="${X(pts.length - 1).toFixed(1)}" y="${(Y(pts[pts.length - 1].kg) - 10).toFixed(1)}" text-anchor="end" font-size="12" font-weight="700" fill="#fff">${kgTxt(pts[pts.length - 1].kg)}</text>
    <text x="14" y="134" font-size="10" fill="#fff" fill-opacity=".5">${dateTxt(pts[0].at)}</text><text x="${W - 14}" y="134" text-anchor="end" font-size="10" fill="#fff" fill-opacity=".5">${dateTxt(pts[pts.length - 1].at)}</text></svg>`;
}

// ---------- sheets ----------
function sheet(html, wire) {
  const sh = $('sheet'), sc = $('scrim');
  sh.innerHTML = `<div class="grab"></div>${html}`; sh.hidden = false; sc.hidden = false; sh.scrollTop = 0;
  requestAnimationFrame(() => { sh.classList.add('on'); sc.classList.add('on'); });
  wire?.(sh);
}
function closeSheet() { const sh = $('sheet'), sc = $('scrim'); sh.classList.remove('on'); sc.classList.remove('on'); setTimeout(() => { if (!sh.classList.contains('on')) { sh.hidden = true; sc.hidden = true; } }, 320); }
// a row of − value + buttons; returns html, the sheet wires them with stepper()
const stepRow = (key, title, sub, val) => `<div class="step"><div class="w"><b>${title}</b><span>${sub}</span></div><button data-step="${key}" data-d="-1" aria-label="Minder">−</button><span class="v" id="v-${key}">${val}</span><button data-step="${key}" data-d="1" aria-label="Meer">+</button></div>`;
function stepper(sh, obj, rules, onChange) { // rules: key → [step, min, max, format]
  sh.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.step, [step, lo, hi, f] = rules[k];
    obj[k] = Math.max(lo, Math.min(hi, Math.round((obj[k] + step * Number(b.dataset.d)) * 10) / 10));
    sh.querySelector('#v-' + k).textContent = f(obj[k]); save(); onChange?.();
  }));
}
const rulesFor = ex => ({ sets: [1, 1, 10, v => v], reps: ex.type === 'time' ? [5, 5, 600, v => v + ' s'] : ex.type === 'cardio' ? [1, 1, 180, v => v + ' min'] : [1, 1, 100, v => v],
  kg: [2.5, 0, 500, v => kgTxt(v)], rest: [15, 15, 600, v => restTxt(v)] });

function sessionSheet(id) {
  const s = S.history.find(x => x.id === id); if (!s) return;
  sheet(`<h2>${esc(s.name)}</h2><p class="sub">${new Date(s.started).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} · ${new Date(s.started).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</p>
    <div class="sum"><div><b>${setsOf(s)}</b><span>sets</span></div><div><b>${volTxt(volOf(s)).replace(' kg', '')}</b><span>${volOf(s) >= 10000 ? 'getild' : 'kg getild'}</span></div><div><b>${minsOf(s)}</b><span>minuten</span></div></div>
    ${s.items.map(it => { const ex = exOf(it.ex); return `<h3>${esc(ex.name)}</h3><div class="chips">${it.sets.map((x, i) => `<span class="chip">${i + 1}. ${setTxt(ex, x)}</span>`).join('')}</div>`; }).join('')}
    <div class="btns"><button class="big-btn danger full" id="delS">Training verwijderen</button></div>`, sh => {
    sh.querySelector('#delS').addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Zeker weten? Tik nog een keer'; return; }
      S.history = S.history.filter(x => x.id !== id); save(); closeSheet(); draw(); toast('Training verwijderd'); });
  });
}
function itemSheet(i) {
  const p = S.plans.find(x => x.id === route.id), it = p.items[i], ex = exOf(it.ex), word = ex.type === 'time' ? 'Seconden' : ex.type === 'cardio' ? 'Minuten' : 'Herhalingen';
  sheet(`<h2>${esc(ex.name)}</h2><p class="sub">${GROUPS[ex.group]} · ${EQUIP[ex.equip] || ''}</p>
    ${stepRow('sets', 'Sets', 'hoe vaak', it.sets)}${stepRow('reps', word, ex.type ? 'per set' : 'per set', rulesFor(ex).reps[3](it.reps))}
    ${ex.type === 'cardio' ? '' : stepRow('kg', 'Gewicht', 'kg, stappen van 2,5', kgTxt(it.kg))}${stepRow('rest', 'Rust', 'tussen de sets', restTxt(it.rest))}
    <div class="btns two"><button class="big-btn soft" id="mUp" ${i === 0 ? 'disabled style="opacity:.4"' : ''}>${IC.up}Omhoog</button><button class="big-btn soft" id="mDown" ${i === p.items.length - 1 ? 'disabled style="opacity:.4"' : ''}>${IC.down}Omlaag</button></div>
    <div class="btns two"><button class="big-btn danger" id="mDel">Verwijderen</button><button class="big-btn" id="mOk">Klaar</button></div>`, sh => {
    stepper(sh, it, rulesFor(ex), () => draw());
    const moveBy = d => { const j = i + d; [p.items[i], p.items[j]] = [p.items[j], p.items[i]]; save(); closeSheet(); draw(); };
    sh.querySelector('#mUp').addEventListener('click', () => i > 0 && moveBy(-1));
    sh.querySelector('#mDown').addEventListener('click', () => i < p.items.length - 1 && moveBy(1));
    sh.querySelector('#mDel').addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Zeker?'; return; } p.items.splice(i, 1); save(); closeSheet(); draw(); });
    sh.querySelector('#mOk').addEventListener('click', closeSheet);
  });
}
// pick exercises from the library, for a plan or for the workout you are doing
function pickerSheet(onPick, title) {
  let q = '', g = '';
  const list = () => { const ql = q.trim().toLowerCase(); return ALL().filter(e => (!g || e.group === g) && (!ql || e.name.toLowerCase().includes(ql))).slice(0, 80)
    .map(e => `<button class="row" data-pick="${e.id}"><div class="w"><b>${esc(e.name)}</b><span>${GROUPS[e.group]} · ${EQUIP[e.equip] || ''}</span></div><span class="chev">+</span></button>`).join('') || '<div class="card empty">Niets gevonden.</div>'; };
  sheet(`<h2>${title}</h2><p class="sub">Tik om toe te voegen. Je kunt er meer kiezen.</p><input class="search" id="pq" type="search" placeholder="Zoek een oefening" autocomplete="off">
    <div class="scroller" style="margin-top:10px">${[['', 'Alles'], ...Object.entries(GROUPS)].map(([k, l]) => `<button class="chip ${k === '' ? 'on' : ''}" data-pg="${k}">${l}</button>`).join('')}</div>
    <div class="list" id="pl" style="margin-top:10px">${list()}</div><div class="btns"><button class="big-btn full" id="pOk">Klaar</button></div>`, sh => {
    const redraw = () => { sh.querySelector('#pl').innerHTML = list(); };
    sh.querySelector('#pq').addEventListener('input', e => { q = e.target.value; redraw(); });
    sh.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { g = b.dataset.pg; sh.querySelectorAll('[data-pg]').forEach(x => x.classList.toggle('on', x === b)); redraw(); }));
    sh.querySelector('#pl').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; onPick(b.dataset.pick); b.querySelector('.chev').textContent = '✓'; toast(`${exOf(b.dataset.pick).name} toegevoegd`); });
    sh.querySelector('#pOk').addEventListener('click', closeSheet);
  });
}
const defaultItem = id => { const ex = exOf(id); return ex.type === 'time' ? { ex: id, sets: 3, reps: 45, kg: 0, rest: 60 } : ex.type === 'cardio' ? { ex: id, sets: 1, reps: 15, kg: 0, rest: 60 } : { ex: id, sets: 3, reps: 10, kg: ex.equip === 'body' ? 0 : 20, rest: 90 }; };
function nameSheet(title, value, button, onDone) {
  sheet(`<h2>${title}</h2><form id="nf" style="margin-top:12px"><input class="field" id="nv" maxlength="40" value="${esc(value)}" placeholder="Bijvoorbeeld: Push day" autocomplete="off"><div class="btns"><button class="big-btn full" type="submit">${button}</button></div></form>`, sh => {
    const f = sh.querySelector('#nv'); setTimeout(() => f.focus(), 350);
    sh.querySelector('#nf').addEventListener('submit', e => { e.preventDefault(); const v = f.value.trim(); if (!v) { toast('Geef het een naam'); return; } onDone(v); });
  });
}
function newExerciseSheet() {
  let group = 'chest', equip = 'machine';
  sheet(`<h2>Eigen oefening</h2><p class="sub">Staat jouw oefening er niet bij? Maak hem zelf.</p><form id="ef"><input class="field" id="en" maxlength="40" placeholder="Naam van de oefening" autocomplete="off">
    <h3>Spiergroep</h3><div class="chips">${Object.entries(GROUPS).map(([k, l]) => `<button type="button" class="chip ${k === group ? 'on' : ''}" data-g="${k}">${l}</button>`).join('')}</div>
    <h3>Met</h3><div class="chips">${Object.entries(EQUIP).map(([k, l]) => `<button type="button" class="chip ${k === equip ? 'on' : ''}" data-e="${k}">${l}</button>`).join('')}</div>
    <div class="btns"><button class="big-btn full" type="submit">Toevoegen</button></div></form>`, sh => {
    sh.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { group = b.dataset.g; sh.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b)); }));
    sh.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => { equip = b.dataset.e; sh.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', x === b)); }));
    sh.querySelector('#ef').addEventListener('submit', e => { e.preventDefault(); const name = sh.querySelector('#en').value.trim(); if (!name) { toast('Geef hem een naam'); return; }
      const ex = { id: 'c' + Date.now().toString(36), name, group, equip, how: '', tip: '', custom: true, type: group === 'cardio' ? 'cardio' : undefined };
      S.custom.push(ex); save(); closeSheet(); nav('exercise', { id: ex.id }); toast(`${name} toegevoegd`); });
  });
}
function settingsSheet() {
  sheet(`<h2>Instellingen</h2>
    ${stepRow('rest', 'Standaard rust', 'voor nieuwe oefeningen', restTxt(S.rest))}
    <div class="list" style="margin-top:12px">
      <button class="row" id="sSound"><div class="w"><b>Piepjes na de rust</b><span>Drie korte piepjes als je weer moet</span></div><span class="badge ${S.sound ? 'ok' : ''}">${S.sound ? 'Aan' : 'Uit'}</span></button>
      <button class="row" id="sAwake"><div class="w"><b>Scherm blijft aan</b><span>Tijdens een training</span></div><span class="badge ${S.awake ? 'ok' : ''}">${S.awake ? 'Aan' : 'Uit'}</span></button>
      <button class="row" data-act="install"><div class="w"><b>Op je beginscherm zetten</b><span>Zo wordt het een echte app</span></div><span class="chev">›</span></button>
    </div>
    <h3>Back-up</h3><p class="sub" style="margin:0 2px 8px">Alles staat alleen op deze telefoon. Kopieer een back-up en bewaar hem in je notities, dan raak je niets kwijt.</p>
    <div class="btns two" style="margin-top:0"><button class="big-btn soft" id="sCopy">Kopieer back-up</button><button class="big-btn soft" id="sPaste">Zet back-up terug</button></div>
    <div id="sBox"></div>
    <div class="btns"><button class="big-btn danger full" id="sReset">Alles wissen</button></div>
    <p class="note">De look is geïnspireerd op het FORM strength training app-concept van Sujon Hossain.</p>`, sh => {
    const restObj = { rest: S.rest }; stepper(sh, restObj, { rest: [15, 15, 600, restTxt] }, () => { S.rest = restObj.rest; save(); });
    const flip = (id, key) => sh.querySelector(id).addEventListener('click', e => { S[key] = !S[key]; save(); const b = e.currentTarget.querySelector('.badge'); b.textContent = S[key] ? 'Aan' : 'Uit'; b.classList.toggle('ok', S[key]); });
    flip('#sSound', 'sound'); flip('#sAwake', 'awake');
    sh.querySelector('#sCopy').addEventListener('click', async () => { const text = JSON.stringify(S);
      try { await navigator.clipboard.writeText(text); toast('Back-up gekopieerd: plak hem in je Notities'); }
      catch { sh.querySelector('#sBox').innerHTML = `<textarea class="field" style="margin-top:10px" readonly>${esc(text)}</textarea>`; const t = sh.querySelector('#sBox textarea'); t.focus(); t.select(); toast('Selecteer en kopieer de tekst'); } });
    sh.querySelector('#sPaste').addEventListener('click', () => {
      sh.querySelector('#sBox').innerHTML = `<textarea class="field" id="sIn" style="margin-top:10px" placeholder="Plak hier je back-up"></textarea><div class="btns"><button class="big-btn full" id="sLoad">Terugzetten</button></div>`;
      sh.querySelector('#sLoad').addEventListener('click', () => { try { const s = JSON.parse(sh.querySelector('#sIn').value); if (!s || s.v !== 2 || !Array.isArray(s.history)) throw 0; S = s; save(); closeSheet(); tab('home'); toast('Back-up teruggezet'); } catch { toast('Dat is geen geldige back-up'); } });
    });
    sh.querySelector('#sReset').addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Echt alles wissen? Tik nog een keer'; return; }
      S = fresh(); save(); closeSheet(); stopWorkoutScreen(); tab('home'); toast('Alles gewist'); });
  });
}
function installSheet() {
  sheet(`<h2>Op je beginscherm</h2><p class="sub">Eén keer doen. Daarna is het een app met een eigen icoon die ook zonder internet werkt.</p>
    <div class="list">
      <div class="row"><span class="ico">1</span><div class="w"><b>Open deze pagina in Safari</b><span>Niet in Instagram of een andere app</span></div></div>
      <div class="row"><span class="ico">2</span><div class="w"><b>Tik op Delen</b><span>Het vierkantje met het pijltje omhoog</span></div></div>
      <div class="row"><span class="ico">3</span><div class="w"><b>Kies ‘Zet op beginscherm’</b><span>Scroll een stukje naar beneden</span></div></div>
      <div class="row"><span class="ico">4</span><div class="w"><b>Tik op ‘Voeg toe’</b><span>Open de app voortaan via het icoon</span></div></div>
    </div><p class="note">Let op: de app op je beginscherm bewaart zijn eigen trainingen. Gebruik dus steeds het icoon, niet de pagina in Safari.</p>
    <div class="btns"><button class="big-btn full" data-act="close">Oké</button></div>`);
}

// ---------- the workout: start, log sets, rest, finish ----------
function startPlan(pid) {
  const p = S.plans.find(x => x.id === pid); if (!p) return;
  if (S.active) { if (S.active.pid !== pid) toast('Je andere training loopt nog: maak die eerst af'); openWorkout(); return; }
  if (!p.items.length) { toast('Voeg eerst een oefening toe'); return; }
  S.active = { pid, name: p.name, started: Date.now(), cur: 0, restEnd: 0, items: p.items.map(it => ({ ...it, log: [] })) };
  save(); openWorkout();
}
function quickStart(exId) { // one exercise, right now
  S.active = { pid: null, name: exOf(exId).name, started: Date.now(), cur: 0, restEnd: 0, items: [{ ...defaultItem(exId), log: [] }] };
  save(); openWorkout();
}
const A = () => S.active, curItem = () => A().items[Math.min(A().cur, A().items.length - 1)];
function openWorkout() { closeSheet(); $('appScreen').hidden = true; $('woScreen').hidden = false; drawRuler(); woRender(); keepAwake(true); }
function stopWorkoutScreen() { $('woScreen').hidden = true; $('appScreen').hidden = false; keepAwake(false); }
function woBack() { stopWorkoutScreen(); draw(); }

// the dial: an arc from the top left down to the button, its ticks light up as the sets get done
function geometry() {
  const r = $('main').getBoundingClientRect(), W = r.width, H = r.height;
  const Sx = 0.1 * W, Sy = 0.06 * H, Ex = W - 100, Ey = H - 56, a1 = -4 * Math.PI / 180;
  let lo = 50, hi = 4000;
  for (let i = 0; i < 50; i++) { const R = (lo + hi) / 2, cx = Ex - R * Math.cos(a1), cy = Ey - R * Math.sin(a1); if (Math.hypot(Sx - cx, Sy - cy) > R) lo = R; else hi = R; }
  const R = (lo + hi) / 2, cx = Ex - R * Math.cos(a1), cy = Ey - R * Math.sin(a1);
  return { W, H, R, cx, cy, a0: Math.atan2(Sy - cy, Sx - cx), a1 };
}
function drawDial() {
  const g = geometry(), it = curItem(), ex = exOf(it.ex), part = it.sets ? Math.min(1, it.log.length / it.sets) : 0, at = (a, r) => [g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)];
  if (g.W < 10) return;
  const svg = $('dial'); svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
  const n = 60, ticks = [];
  for (let i = 0; i <= n; i++) {
    const a = g.a0 + (g.a1 - g.a0) * i / n, major = i % 6 === 0, len = major ? 18 : 9, lit = i / n <= part + 1e-6;
    const [x1, y1] = at(a, g.R - 6), [x2, y2] = at(a, g.R - 6 - len);
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#fff" stroke-opacity="${lit ? 0.95 : major ? 0.42 : 0.26}" stroke-width="${major ? 1.8 : 1.2}" stroke-linecap="round"/>`);
  }
  const arc = r => { const [x0, y0] = at(g.a0, r), [x1, y1] = at(g.a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const [kx, ky] = at(g.a0 + (g.a1 - g.a0) * part, g.R);
  svg.innerHTML = `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <path d="${arc(g.R + 14)}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.4" stroke-dasharray="1 7" stroke-linecap="round"/>
    <path d="${arc(g.R)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>${ticks.join('')}
    <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="11" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/>
    <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="5" fill="#fff" filter="url(#glow)"/><circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="4" fill="#fff"/>`;
  const k = Math.min(it.sets, 8), d = it.log.length, ri = g.R - Math.min(130, g.W * 0.31);
  $('sets').innerHTML = Array.from({ length: k }, (_, j) => {
    const f = k === 1 ? 0.35 : 0.2 + 0.44 * j / (k - 1), [x, y] = at(g.a0 + (g.a1 - g.a0) * f, ri), cls = j < d ? 'ok' : j === d ? 'now' : 'up';
    return `<span class="set ${cls}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px"><i></i>Set ${j + 1}${j < d ? ` <em>${setTxt(ex, it.log[j])}</em>` : ''}</span>`;
  }).join('');
}
// the rest ruler: one tick per 5 seconds; drag it to change how long you rest
const STEP = 5, GAP = 10, MAXS = 600;
function drawRuler() {
  const n = MAXS / STEP, t = [];
  for (let i = 0; i <= n; i++) { const major = i % 6 === 0, h = major ? 22 : 11; t.push(`<line x1="${i * GAP + 0.5}" y1="${28 - h}" x2="${i * GAP + 0.5}" y2="28" stroke="#fff" stroke-opacity="${major ? 0.7 : 0.35}" stroke-width="${major ? 1.6 : 1.2}" stroke-linecap="round"/>`); }
  const svg = $('rulerSvg'); svg.setAttribute('width', n * GAP + 2); svg.setAttribute('viewBox', `0 0 ${n * GAP + 2} 46`); svg.innerHTML = t.join('');
}
const placeRuler = sec => { $('rulerSvg').style.transform = `translateX(${($('ruler').clientWidth / 2 - sec / STEP * GAP).toFixed(1)}px)`; };

function woRender() {
  if (!A()) return;
  const it = curItem(), ex = exOf(it.ex), all = A().items.reduce((n, x) => n + x.sets, 0), done = A().items.reduce((n, x) => n + Math.min(x.sets, x.log.length), 0);
  $('woTitle').firstChild.textContent = A().name;
  if (ex.type === 'cardio') { $('kg').innerHTML = dots(String(it.reps), 8.5); $('kgUnit').textContent = 'min'; }
  else { $('kg').innerHTML = dots(kgTxt(it.kg), String(kgTxt(it.kg)).length > 3 ? 7 : 8.5); $('kgUnit').textContent = it.kg ? 'kg' : 'kg extra'; }
  $('exName').textContent = ex.name; $('exPos').textContent = `${Math.min(A().cur, A().items.length - 1) + 1}/${A().items.length}`;
  $('reps').innerHTML = dots(String(ex.type === 'cardio' ? it.sets : it.reps), 8.5); $('repsLbl').textContent = ex.type === 'cardio' ? 'Keer' : repsWord(ex);
  $('pct').innerHTML = dots(`${all ? Math.round(done / all * 100) : 0}%`, 5.5);
  drawDial(); woGoButton(); woTick();
}
function woGoButton() {
  const it = curItem(), d = it.log.length, last = A().cur >= A().items.length - 1, b = $('goBtn');
  let label, kind, soft = false;
  if (A().restEnd > Date.now()) { label = 'Rust<br>overslaan'; kind = 'skip'; soft = true; }
  else if (d < it.sets) { label = `Set ${d + 1}<br>klaar`; kind = 'check'; }
  else if (!last) { label = 'Volgende<br>oefening'; kind = 'next'; }
  else { label = 'Training<br>afronden'; kind = 'flag'; }
  $('goLabel').innerHTML = label; b.innerHTML = IC[kind]; b.classList.toggle('soft', soft); b.dataset.kind = kind; b.setAttribute('aria-label', label.replace('<br>', ' '));
}
function woTick() {
  if (!A() || $('woScreen').hidden) return;
  const it = curItem(), clock = $('clock'), left = (A().restEnd - Date.now()) / 1000;
  $('woClock').textContent = `${Math.max(1, Math.round((Date.now() - A().started) / 60000))} min · ${A().items.reduce((n, x) => n + x.log.length, 0)} sets`;
  if (A().restEnd && left <= 0) { restOver(); return; }
  if (left > 0) { clock.innerHTML = dots(mmss(left), 8); clock.style.opacity = 1; placeRuler(left); $('restLbl').innerHTML = 'Rusttimer'; }
  else { clock.innerHTML = dots(mmss(it.rest), 8); clock.style.opacity = .55; placeRuler(it.rest); $('restLbl').innerHTML = it.log.length >= it.sets ? '<em>Oefening klaar</em>' : 'Rusttimer'; }
}
setInterval(woTick, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { woTick(); if (S.active && !$('woScreen').hidden) keepAwake(true); } });

let audio = null, lock = null;
function beep(times = 3) {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.02;
    for (let i = 0; i < times; i++) { const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.22; o.frequency.value = i === times - 1 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.18); }
  } catch {}
}
async function keepAwake(on) { try { if (on && S.awake && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } if (!on && lock) { await lock.release(); lock = null; } } catch { lock = null; } }

function woGo() {
  const it = curItem(), kind = $('goBtn').dataset.kind;
  if (S.sound) beep(0); // unlocks sound on the iPhone (it may only start after a tap)
  if (kind === 'skip') { A().restEnd = 0; save(); afterRest(); return; }
  if (kind === 'check') {
    it.log.push({ kg: exOf(it.ex).type === 'cardio' ? 0 : it.kg, reps: it.reps, at: Date.now() });
    const more = it.log.length < it.sets || A().cur < A().items.length - 1;
    if (more) A().restEnd = Date.now() + it.rest * 1000;
    save(); toast(it.log.length < it.sets ? `Set ${it.log.length} klaar · rust ${mmss(it.rest)}` : `${exOf(it.ex).name} klaar`);
    woRender(); return;
  }
  if (kind === 'next') { move(1); return; }
  if (kind === 'flag') finishSheet();
}
function restOver() {
  A().restEnd = 0; save();
  if (S.sound) beep(3); try { navigator.vibrate?.([200, 100, 200]); } catch {}
  const r = $('rest'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
  const it = curItem(); toast(it.log.length < it.sets ? `Go! Set ${it.log.length + 1}` : 'Rust voorbij: volgende oefening');
  afterRest();
}
function afterRest() { const it = curItem(); if (it.log.length >= it.sets && A().cur < A().items.length - 1) move(1); else woRender(); }
function move(dir) {
  const next = A().cur + dir; if (next < 0 || next >= A().items.length) return;
  const st = $('stage'); st.classList.add(dir > 0 ? 'out-l' : 'out-r');
  setTimeout(() => { A().cur = next; save(); woRender(); st.classList.remove('out-l', 'out-r'); st.classList.add(dir > 0 ? 'out-r' : 'out-l'); void st.offsetWidth; st.classList.remove('out-l', 'out-r'); }, 160);
}
function woAdjust() {
  const it = curItem(), ex = exOf(it.ex), rules = rulesFor(ex), word = ex.type === 'time' ? 'Seconden' : ex.type === 'cardio' ? 'Minuten' : 'Herhalingen';
  sheet(`<h2>${esc(ex.name)}</h2><p class="sub">Voor je volgende set</p>
    ${ex.type === 'cardio' ? '' : `<div class="step"><div class="w"><b>Gewicht</b><span>kg · tik op het getal om te typen</span></div><button data-step="kg" data-d="-1" aria-label="Minder">−</button><input class="v" id="v-kg" inputmode="decimal" value="${kgTxt(it.kg)}" style="width:84px;background:none;border:0;outline:none"><button data-step="kg" data-d="1" aria-label="Meer">+</button></div>`}
    ${stepRow('reps', word, 'per set', rules.reps[3](it.reps))}${stepRow('sets', 'Sets', 'voor deze oefening', it.sets)}${stepRow('rest', 'Rust', 'tussen de sets', restTxt(it.rest))}
    ${ex.how ? `<div class="card how" style="margin-top:12px;font-size:15px">${esc(ex.how)}</div>` : ''}
    <div class="btns"><button class="big-btn full" data-act="close">Klaar</button></div>`, sh => {
    const kgIn = sh.querySelector('#v-kg');
    sh.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.step, [step, lo, hi, f] = rules[k];
      it[k] = Math.max(lo, Math.min(hi, Math.round((it[k] + step * Number(b.dataset.d)) * 10) / 10));
      const el = sh.querySelector('#v-' + k); if (el.tagName === 'INPUT') el.value = f(it[k]); else el.textContent = f(it[k]); save(); woRender(); }));
    kgIn?.addEventListener('change', () => { const v = parseFloat(kgIn.value.replace(',', '.')); if (!isNaN(v)) { it.kg = Math.max(0, Math.min(500, Math.round(v * 10) / 10)); save(); woRender(); } kgIn.value = kgTxt(it.kg); });
  });
}
function woMenu() {
  const a = A(), list = a.items.map((it, i) => { const ex = exOf(it.ex);
    return `<button class="row" data-goto="${i}" ${i === a.cur ? 'style="box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.6)"' : ''}><span class="ico">${i + 1}</span><div class="w"><b>${esc(ex.name)}</b><span>${itemTxt(ex, it)}</span></div><span class="badge ${it.log.length >= it.sets ? 'ok' : ''}">${it.log.length}/${it.sets}</span></button>`; }).join('');
  sheet(`<h2>${esc(a.name)}</h2><p class="sub">Tik op een oefening om erheen te gaan</p><div class="list">${list}</div>
    <div class="btns two"><button class="big-btn soft" id="wAdd">${IC.plus}Oefening</button><button class="big-btn soft" id="wUndo">Laatste set terug</button></div>
    <div class="btns"><button class="big-btn full" id="wFinish">${IC.flag}Training afronden</button><button class="big-btn danger full" id="wQuit">Stoppen zonder opslaan</button></div>`, sh => {
    sh.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { a.cur = Number(b.dataset.goto); a.restEnd = 0; save(); closeSheet(); woRender(); }));
    sh.querySelector('#wAdd').addEventListener('click', () => pickerSheet(id => { a.items.push({ ...defaultItem(id), rest: S.rest, log: [] }); save(); woRender(); }, 'Oefening toevoegen'));
    sh.querySelector('#wUndo').addEventListener('click', () => { const it = curItem(); if (!it.log.length) { toast('Nog geen set bij deze oefening'); return; } it.log.pop(); a.restEnd = 0; save(); closeSheet(); woRender(); toast('Laatste set weggehaald'); });
    sh.querySelector('#wFinish').addEventListener('click', finishSheet);
    sh.querySelector('#wQuit').addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Zeker? Je sets gaan verloren'; return; }
      S.active = null; save(); closeSheet(); stopWorkoutScreen(); tab('home'); toast('Training gestopt'); });
  });
}
function finishSheet() {
  const a = A(), items = a.items.filter(it => it.log.length).map(it => ({ ex: it.ex, sets: it.log.map(x => ({ kg: x.kg, reps: x.reps })) }));
  if (!items.length) { sheet(`<h2>Nog geen sets</h2><p class="sub">Tik op de witte knop als een set klaar is. Stoppen zonder opslaan kan via ⋯.</p><div class="btns"><button class="big-btn full" data-act="close">Verder trainen</button></div>`); return; }
  const s = { id: 's' + Date.now().toString(36), pid: a.pid, name: a.name, started: a.started, ended: Date.now(), items };
  const before = records().best, newRecs = [];
  for (const it of items) { if (exOf(it.ex).type) continue; const top = it.sets.reduce((m, x) => (!m || x.kg > m.kg || (x.kg === m.kg && x.reps > m.reps) ? x : m), null), b = before[it.ex];
    if (top && top.kg > 0 && (!b || top.kg > b.kg || (top.kg === b.kg && top.reps > b.reps))) newRecs.push({ ex: it.ex, ...top }); }
  sheet(`<h2>${esc(a.name)} klaar</h2><p class="sub">Goed gedaan. Dit heb je gedaan:</p>
    <div class="sum"><div><b>${setsOf(s)}</b><span>sets</span></div><div><b>${volTxt(volOf(s)).replace(' kg', '')}</b><span>${volOf(s) >= 10000 ? 'getild' : 'kg getild'}</span></div><div><b>${minsOf(s)}</b><span>minuten</span></div></div>
    ${newRecs.length ? `<h3>Nieuwe records</h3><div class="list">${newRecs.map(r => `<div class="row"><span class="ico" style="background:rgba(255,217,138,.18);color:var(--gold)">★</span><div class="w"><b>${esc(exOf(r.ex).name)}</b><span>Je zwaarste set ooit</span></div><span class="badge gold">${kgTxt(r.kg)} × ${r.reps}</span></div>`).join('')}</div>` : ''}
    <div class="btns"><button class="big-btn full" id="fSave">Opslaan</button><button class="big-btn soft full" data-act="close">Nog even verder</button></div>`, sh => {
    sh.querySelector('#fSave').addEventListener('click', () => {
      S.history.unshift(s);
      const plan = S.plans.find(p => p.id === a.pid); // next time: start with what you lifted today
      if (plan) { for (const it of a.items) { const last = it.log[it.log.length - 1], t = plan.items.find(x => x.ex === it.ex); if (last && t && !exOf(it.ex).type) { t.kg = last.kg; t.reps = last.reps; } }
        S.next = (S.plans.indexOf(plan) + 1) % S.plans.length; }
      S.active = null; save(); closeSheet(); stopWorkoutScreen(); tab('home'); toast(newRecs.length ? `Opgeslagen · ${newRecs.length} nieuw${newRecs.length > 1 ? 'e records' : ' record'}` : 'Opgeslagen. Lekker bezig');
    });
  });
}

// swipe left and right between exercises; drag the ruler to change the rest
(() => { let x0 = null, y0 = 0; const m = $('main');
  m.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; });
  m.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { A().restEnd = 0; move(dx < 0 ? 1 : -1); } });
  m.addEventListener('pointercancel', () => { x0 = null; });
})();
(() => { const r = $('ruler'); let start = null;
  r.addEventListener('pointerdown', e => { if (!A() || A().restEnd > Date.now()) return; start = { x: e.clientX, v: curItem().rest }; r.setPointerCapture(e.pointerId); });
  r.addEventListener('pointermove', e => { if (!start) return; curItem().rest = Math.max(15, Math.min(MAXS, start.v - (e.clientX - start.x) / GAP * STEP)); woTick(); });
  const end = () => { if (!start) return; start = null; curItem().rest = Math.round(curItem().rest / STEP) * STEP; save(); woTick(); };
  r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
})();

// ---------- taps ----------
const ACT = {
  tab: el => tab(el.dataset.id), back, close: closeSheet,
  plan: el => nav('plan', { id: el.dataset.id }), exercise: el => nav('exercise', { id: el.dataset.id }),
  session: el => sessionSheet(el.dataset.id), settings: settingsSheet, install: installSheet,
  start: el => startPlan(el.dataset.id), openWo: openWorkout, quickStart: el => quickStart(el.dataset.id),
  libGroup: el => { libG = el.dataset.id; document.querySelectorAll('[data-act="libGroup"]').forEach(b => b.classList.toggle('on', b === el)); libList(); },
  newPlan: () => nameSheet('Nieuw schema', '', 'Maken', name => { const p = { id: 'p' + Date.now().toString(36), name, items: [] }; S.plans.push(p); save(); closeSheet(); nav('plan', { id: p.id }); }),
  renamePlan: () => { const p = S.plans.find(x => x.id === route.id); nameSheet('Naam wijzigen', p.name, 'Opslaan', name => { p.name = name; save(); closeSheet(); draw(); }); },
  deletePlan: el => { if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = 'Zeker weten? Tik nog een keer'; return; } S.plans = S.plans.filter(p => p.id !== route.id); S.next = 0; save(); back(); toast('Schema verwijderd'); },
  editItem: el => itemSheet(Number(el.dataset.i)),
  pickForPlan: () => { const p = S.plans.find(x => x.id === route.id); pickerSheet(id => { p.items.push({ ...defaultItem(id), rest: S.rest }); save(); draw(); }, 'Oefening toevoegen'); },
  addToPlan: el => { const id = el.dataset.id;
    sheet(`<h2>In welk schema?</h2><div class="list" style="margin-top:12px">${S.plans.map(p => `<button class="row" data-p="${p.id}"><div class="w"><b>${esc(p.name)}</b><span>${p.items.length} oefeningen</span></div><span class="chev">+</span></button>`).join('')}</div>`, sh => {
      sh.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { S.plans.find(p => p.id === b.dataset.p).items.push({ ...defaultItem(id), rest: S.rest }); save(); closeSheet(); toast(`Toegevoegd aan ${S.plans.find(p => p.id === b.dataset.p).name}`); }));
    }); },
  addToActive: el => { A().items.push({ ...defaultItem(el.dataset.id), rest: S.rest, log: [] }); A().cur = A().items.length - 1; save(); openWorkout(); },
  newExercise: newExerciseSheet,
  deleteExercise: el => { if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = 'Zeker weten? Tik nog een keer'; return; } S.custom = S.custom.filter(e => e.id !== route.id); save(); back(); },
  woBack, woMenu, woAdjust, woGo,
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el) return; const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); f(el, e); } });
document.addEventListener('input', e => { if (e.target.id === 'q') { libQ = e.target.value; libList(); } });
addEventListener('resize', () => { if (S.active && !$('woScreen').hidden) woRender(); });

// ---------- start ----------
try { navigator.storage?.persist?.(); } catch {}
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
draw(true);
if (S.active) openWorkout();
document.fonts?.ready.then(() => { draw(); if (S.active && !$('woScreen').hidden) woRender(); });
