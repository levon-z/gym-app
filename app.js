'use strict';
// Gym: a workout app for the iPhone's home screen. Everything is saved on the phone (localStorage) and the app works offline
// (sw.js keeps a copy). You put your own day together (tap a muscle, pick exercises); the app advises sets, reps and rest,
// shows on a body which muscles are still recovering, and logs every set on the full-screen dial (the FORM look).

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'gym-app-v2', H = 3600000, DAY = 86400000;
const restDefaults = () => Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.rest]));
const fresh = () => ({ v: 3, sound: true, awake: true, rest: restDefaults(), recover: { ...RECOVERY }, plans: [], custom: [], active: null, history: [], draft: { items: [], groups: [] }, lastKg: {} });
function loadState() {
  let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!s) return fresh();
  if (s.v === 2) { // the first version: drop its ready-made plans, keep everything you did
    const lastKg = {}; for (const h of [...(s.history || [])].reverse()) for (const it of h.items) { const x = it.sets[it.sets.length - 1]; if (x?.kg) lastKg[it.ex] = x.kg; }
    s = { ...fresh(), sound: s.sound ?? true, awake: s.awake ?? true, plans: (s.plans || []).filter(p => !EXAMPLE_IDS.has(p.id)), custom: s.custom || [], history: s.history || [], active: s.active || null, lastKg };
  }
  if (s.v !== 3) return fresh();
  s.rest = { ...restDefaults(), ...(s.rest || {}) }; s.recover = { ...RECOVERY, ...(s.recover || {}) }; s.draft ||= { items: [], groups: [] }; s.draft.groups ||= []; s.lastKg ||= {};
  return s;
}
let S = loadState();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Opslaan lukte niet: is je opslag vol?'); } };
const ALL = () => LIBRARY.concat(S.custom);
const exOf = id => ALL().find(e => e.id === id) || { id, name: 'Oefening', group: 'core', equip: 'body', how: '', tip: '' };
const kgTxt = kg => String(Math.round(kg * 10) / 10).replace('.', ',');
const mmss = sec => { sec = Math.max(0, Math.ceil(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
const restTxt = sec => sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min` : `${sec} sec`;
const hoursTxt = ms => { const h = Math.ceil(ms / H); return h >= 24 ? `${Math.floor(h / 24)} d${h % 24 ? ' ' + (h % 24) + ' u' : ''}` : `${h} u`; };
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
// what the app advises for an exercise: sets, reps and rest by its kind, and the weight you used last time
function defaultItem(id) {
  const ex = exOf(id), k = kindOf(ex), K = KINDS[k];
  if (ex.type === 'time') return { ex: id, sets: 3, reps: 45, kg: 0, rest: S.rest.core };
  if (k === 'cardio') return { ex: id, sets: 1, reps: K.reps, kg: 0, rest: S.rest.cardio };
  return { ex: id, sets: K.sets, reps: K.reps, kg: S.lastKg[id] ?? (ex.equip === 'body' ? 0 : ex.equip === 'db' ? 10 : 20), rest: S.rest[k] };
}

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
  const W = Math.max(cell, x - cell), Hh = 7 * cell;
  return `<svg class="dm" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" aria-hidden="true"><g fill="currentColor">${out.join('')}</g></svg><span class="sr">${esc(str)}</span>`;
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
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const TABS = [
  ['home', 'Vandaag', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>'],
  ['days', 'Mijn dagen', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'],
  ['library', 'Oefeningen', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12"/></svg>'],
  ['progress', 'Voortgang', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'],
];

// ---------- your muscles: how tired each group still is ----------
// A workout tires every group it trained (big lifts also tire their helpers, for half). The more sets, the longer it takes:
// 6 sets or more = the full recovery time from Settings, fewer sets = shorter (at least half of it).
function groupSets(items, logged) { // muscle group → sets (helpers count half)
  const n = {};
  for (const it of items) {
    const ex = exOf(it.ex), sets = logged ? it.log.length : it.sets.length; if (!sets) continue;
    n[ex.group] = (n[ex.group] || 0) + sets;
    for (const g of SECONDARY[ex.id] || []) n[g] = (n[g] || 0) + sets / 2;
  }
  return n;
}
function fatigue(now = Date.now()) { // group → { left (ms), frac (1 = just trained, 0 = recovered) }
  const out = {}, add = (sets, ended) => {
    for (const [g, n] of Object.entries(sets)) {
      const total = (S.recover[g] || 48) * H * (0.5 + 0.5 * Math.min(1, n / 6)), left = ended + total - now;
      if (left > 0 && (!out[g] || left > out[g].left)) out[g] = { left, frac: Math.min(1, left / total) };
    }
  };
  for (const s of S.history) if (now - s.ended < 8 * DAY) add(groupSets(s.items, false), s.ended);
  if (S.active) add(groupSets(S.active.items, true), now); // the workout you are doing now counts too
  return out;
}
const mix = (a, b, k) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; };
const tiredColour = f => f > 0.5 ? mix('#ff9f43', '#ff4d5e', (f - 0.5) / 0.5) : mix('#ffd166', '#ff9f43', f / 0.5);
// a body, front and back, its muscles coloured by how tired they are (or picked, in the day builder)
const BODY = {
  front: [
    ['shoulders', 'e', 36, 46, 9, 8], ['shoulders', 'e', 84, 46, 9, 8],
    ['chest', 'p', 'M40 44 Q50 37 58 41 L58 62 Q48 66 40 57 Z'], ['chest', 'p', 'M80 44 Q70 37 62 41 L62 62 Q72 66 80 57 Z'],
    ['biceps', 'e', 31, 67, 6, 12], ['biceps', 'e', 89, 67, 6, 12],
    ['core', 'p', 'M48 66 Q60 62 72 66 L71 104 Q60 109 49 104 Z'],
    ['quads', 'e', 51, 146, 9.5, 26], ['quads', 'e', 69, 146, 9.5, 26],
    ['calves', 'e', 51, 202, 6.5, 17], ['calves', 'e', 69, 202, 6.5, 17],
  ],
  back: [
    ['back', 'p', 'M47 33 L60 28 L73 33 L81 43 L60 52 L39 43 Z'],
    ['shoulders', 'e', 36, 46, 9, 8], ['shoulders', 'e', 84, 46, 9, 8],
    ['back', 'p', 'M42 50 L58 54 L58 84 Q48 82 44 72 Z'], ['back', 'p', 'M78 50 L62 54 L62 84 Q72 82 76 72 Z'],
    ['triceps', 'e', 31, 67, 6, 12], ['triceps', 'e', 89, 67, 6, 12],
    ['back', 'p', 'M50 86 L70 86 L70 104 Q60 108 50 104 Z'],
    ['hams', 'e', 52, 117, 10, 10], ['hams', 'e', 68, 117, 10, 10],
    ['hams', 'e', 51, 150, 9, 21], ['hams', 'e', 69, 150, 9, 21],
    ['calves', 'e', 51, 199, 7, 16], ['calves', 'e', 69, 199, 7, 16],
  ],
};
const SKIN = [['e', 60, 17, 11, 13], ['r', 55, 28, 10, 9], ['e', 27, 92, 5, 13], ['e', 93, 92, 5, 13], ['e', 25, 110, 4, 4.5], ['e', 95, 110, 4, 4.5],
  ['p', 'M47 105 L73 105 L71 126 L49 126 Z'], ['e', 51, 175, 5.5, 5], ['e', 69, 175, 5.5, 5], ['e', 50, 225, 7, 4], ['e', 70, 225, 7, 4]];
function bodySvg({ tired = {}, picked = null, clickable = false } = {}) {
  const draw = (kind, a, b, c, d, attrs) => kind === 'e' ? `<ellipse cx="${a}" cy="${b}" rx="${c}" ry="${d}" ${attrs}/>` : kind === 'r' ? `<rect x="${a}" y="${b}" width="${c}" height="${d}" rx="3" ${attrs}/>` : `<path d="${a}" ${attrs}/>`;
  const view = (name, ox) => {
    const skin = SKIN.map(([k, a, b, c, d]) => draw(k, a, b, c, d, 'fill="url(#skin)"')).join('');
    const muscles = BODY[name].map(([g, k, a, b, c, d]) => {
      const t = tired[g], on = picked?.has(g), fill = on ? '#ffffff' : t ? tiredColour(t.frac) : 'rgba(255,255,255,.17)';
      const glow = (on || t) ? ' filter="url(#mglow)"' : '';
      return `<g${clickable ? ` data-act="pickGroup" data-id="${g}" style="cursor:pointer"` : ''}>${draw(k, a, b, c, d, `fill="${fill}"${glow}`)}${draw(k, a, b, c, d, 'fill="url(#shine)"')}</g>`;
    }).join('');
    return `<g transform="translate(${ox} 0)">${skin}${muscles}<text x="60" y="246" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff" fill-opacity=".45" letter-spacing=".08em">${name === 'front' ? 'VOOR' : 'ACHTER'}</text></g>`;
  };
  return `<svg class="body" viewBox="0 0 260 252" role="img" aria-label="Je lichaam, voor en achter">
    <defs><radialGradient id="shine" cx=".32" cy=".25" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".09"/></linearGradient>
    <filter id="mglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="60" cy="232" rx="34" ry="5" fill="url(#floor)"/><ellipse cx="200" cy="232" rx="34" ry="5" fill="url(#floor)"/>
    ${view('front', 0)}${view('back', 140)}</svg>`;
}

// ---------- numbers about you ----------
function records() {
  const best = {}, events = [];
  for (const s of [...S.history].sort((a, b) => a.started - b.started)) for (const it of s.items) {
    if (exOf(it.ex).type) continue;
    for (const x of it.sets) { const b = best[it.ex]; if (x.kg > 0 && (!b || x.kg > b.kg || (x.kg === b.kg && x.reps > b.reps))) { best[it.ex] = { kg: x.kg, reps: x.reps, at: s.started }; events.push({ ex: it.ex, kg: x.kg, reps: x.reps, at: s.started }); } }
  }
  return { best, events };
}
const e1rm = (kg, reps) => kg * (1 + reps / 30);
function weekStreak() {
  const weeks = new Set(S.history.map(s => monday(s.started))); let w = monday(Date.now()), n = 0;
  if (!weeks.has(w)) w -= 7 * DAY;
  while (weeks.has(w)) { n++; w -= 7 * DAY; } return n;
}
const planSets = p => p.items.reduce((n, it) => n + it.sets, 0);
const planMins = p => Math.round(p.items.reduce((n, it) => n + it.sets * (40 + it.rest), 0) / 60);
const planGroups = p => [...new Set(p.items.map(it => exOf(it.ex).group))];

// ---------- pages ----------
let route = { page: 'home' }, stack = [];
function nav(page, p = {}) { stack.push(route); route = { page, ...p }; draw(true); }
function back() { route = stack.pop() || { page: 'home' }; draw(true); }
function tab(page) { stack = []; route = { page }; draw(true); }
function draw(anim = false) {
  const v = $('view'), top = v.scrollTop;
  v.innerHTML = (PAGES[route.page] || PAGES.home)();
  if (anim) { v.scrollTop = 0; v.classList.remove('in'); void v.offsetWidth; v.classList.add('in'); } else v.scrollTop = top;
  const cur = route.page === 'plan' ? 'days' : route.page === 'build' ? 'home' : route.page === 'exercise' ? 'library' : route.page;
  $('tabs').innerHTML = TABS.map(([id, label, icon]) => `<button class="${id === cur ? 'on' : ''}" data-act="tab" data-id="${id}" aria-label="${label}">${icon}${label}</button>`).join('');
  const a = S.active;
  $('resume').innerHTML = a && route.page !== 'build' ? `<div class="resume"><div class="w"><b>${esc(a.name)}</b><span>Training bezig · ${a.items.reduce((n, it) => n + it.log.length, 0)} sets · ${Math.max(1, Math.round((Date.now() - a.started) / 60000))} min</span></div><button data-act="openWo">Ga verder</button></div>` : '';
  if (route.page === 'library') libList();
}
const head = (title, sub = '', right = '', backBtn = false) => `<div class="head">${backBtn ? `<button class="icon-btn" data-act="back" aria-label="Terug">${IC.back}</button>` : ''}<div class="w"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
const groupChips = groups => groups.map(g => `<span class="chip">${GROUPS[g]}</span>`).join('');

const PAGES = {
  home() {
    const h = new Date().getHours(), hi = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
    const today = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    let hero;
    if (S.active) {
      const a = S.active, done = a.items.reduce((n, it) => n + it.log.length, 0), all = a.items.reduce((n, it) => n + it.sets, 0);
      hero = `<div class="hero">${heroDeco()}<div class="k">Training bezig</div><h3>${esc(a.name)}</h3><p>${done} van ${all} sets · ${Math.max(1, Math.round((Date.now() - a.started) / 60000))} min</p><button class="big-btn" data-act="openWo">${IC.play}Ga verder</button></div>`;
    } else {
      const days = S.plans.slice(0, 6).map(p => `<button class="chip" data-act="start" data-id="${p.id}">${esc(p.name)}</button>`).join('');
      hero = `<div class="hero">${heroDeco()}<div class="k">Vandaag</div><h3>Wat train je?</h3><p>Tik op je spieren en kies je oefeningen. De app zegt hoeveel sets, herhalingen en rust.</p>
        <button class="big-btn" data-act="build">${IC.plus}Stel je training samen</button>
        ${days ? `<p style="margin:14px 0 8px">Of start een dag van jou:</p><div class="chips">${days}</div>` : ''}</div>`;
    }
    const tired = fatigue(), sorted = Object.entries(tired).sort((a, z) => z[1].left - a[1].left);
    const list = sorted.length ? sorted.map(([g, t]) => `<div class="rec"><i style="background:${tiredColour(t.frac)}"></i><b>${GROUPS[g]}</b><span>nog ${hoursTxt(t.left)}</span></div>`).join('')
      : '<p class="fresh">Alles is hersteld. Klaar om te trainen.</p>';
    const wk = monday(Date.now()), trained = new Set(S.history.map(s => dayKey(s.started))), todayKey = dayKey(Date.now());
    const week = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((d, i) => { const ts = wk + i * DAY, k = dayKey(ts), date = new Date(ts).getDate();
      return `<div class="${trained.has(k) ? 'done' : ''} ${k === todayKey ? 'today' : ''}"><i>${trained.has(k) ? '✓' : date}</i>${d}</div>`; }).join('');
    const thisWeek = S.history.filter(s => s.started >= wk), wSets = thisWeek.reduce((n, s) => n + setsOf(s), 0), wVol = thisWeek.reduce((n, s) => n + volOf(s), 0);
    const volStr = wVol >= 10000 ? (wVol / 1000).toFixed(1).replace('.', ',') : String(Math.round(wVol));
    const rec = records().events.slice(-3).reverse().map(e => `<button class="row" data-act="exercise" data-id="${e.ex}"><span class="ico" style="background:rgba(255,217,138,.18);color:var(--gold)">★</span><div class="w"><b>${esc(exOf(e.ex).name)}</b><span>${dateTxt(e.at)}</span></div><span class="badge gold">${kgTxt(e.kg)} × ${e.reps}</span></button>`).join('');
    return `${head(hi, today.charAt(0).toUpperCase() + today.slice(1), `<button class="icon-btn" data-act="settings" aria-label="Instellingen">${IC.gear}</button>`)}
      ${hero}
      ${standalone() ? '' : `<button class="row" data-act="install" style="margin-top:12px"><span class="ico">${IC.share}</span><div class="w"><b>Zet me op je beginscherm</b><span>Dan is het een echte app, ook zonder internet</span></div><span class="chev">›</span></button>`}
      <div class="sec"><h2>Je spieren</h2><button data-act="recoverSettings">Hersteltijden</button></div>
      <div class="card bodycard">${bodySvg({ tired })}<div class="recs">${list}</div>
        <div class="legend"><span><i style="background:#ff4d5e"></i>net getraind</span><span><i style="background:#ffd166"></i>bijna hersteld</span><span><i style="background:rgba(255,255,255,.3)"></i>hersteld</span></div></div>
      <div class="sec"><h2>Deze week</h2></div>
      <div class="card week">${week}</div>
      <div class="stats" style="margin-top:8px">
        <div class="stat">${dots(String(thisWeek.length), 4.6)}<span>trainingen</span></div>
        <div class="stat">${dots(String(wSets), 4.6)}<span>sets</span></div>
        <div class="stat">${dots(volStr, volStr.length >= 4 ? 3.4 : 4.6)}<span>${wVol >= 10000 ? 'ton getild' : 'kg getild'}</span></div>
      </div>
      ${S.history.length ? `<div class="sec"><h2>Laatste trainingen</h2><button data-act="tab" data-id="progress">Alles</button></div><div class="list">${S.history.slice(0, 3).map(sessionRow).join('')}</div>` : ''}
      ${rec ? `<div class="sec"><h2>Nieuwe records</h2></div><div class="list">${rec}</div>` : ''}`;
  },

  // put a day together: tap muscles on the body (or the chips), pick exercises, start or keep it as a day
  build() {
    const tired = fatigue(), picked = new Set(S.draft.groups || []), draft = S.draft.items;
    const lists = [...picked].map(g => { const t = tired[g];
      const rows = ALL().filter(e => e.group === g).map(e => { const inDay = draft.some(it => it.ex === e.id), d = defaultItem(e.id);
        return `<button class="row" data-act="toggleDraft" data-id="${e.id}"><div class="w"><b>${esc(e.name)}</b><span>${EQUIP[e.equip] || ''} · ${itemTxt(e, d)} · rust ${restTxt(d.rest)}</span></div><span class="addmark ${inDay ? 'on' : ''}">${inDay ? '✓' : '+'}</span></button>`; }).join('');
      return `<div class="sec"><h2>${GROUPS[g]}</h2>${t ? `<span class="warn">nog ${hoursTxt(t.left)} herstel</span>` : '<span class="okmark">hersteld</span>'}</div><div class="list">${rows}</div>`; }).join('');
    const mine = draft.map((it, i) => { const ex = exOf(it.ex);
      return `<div class="row"><span class="ico">${i + 1}</span><button class="w" data-act="editDraft" data-i="${i}"><b>${esc(ex.name)}</b><span>${itemTxt(ex, it)} · rust ${restTxt(it.rest)}</span></button><button class="x" data-act="dropDraft" data-i="${i}" aria-label="Weghalen">${IC.x}</button></div>`; }).join('');
    return `${head('Je training', 'Tik op de spieren die je wilt trainen', '', true)}
      <div class="card bodycard pick">${bodySvg({ tired, picked, clickable: true })}</div>
      <div class="scroller" style="margin-top:10px">${Object.entries(GROUPS).map(([k, l]) => `<button class="chip ${picked.has(k) ? 'on' : ''}" data-act="pickGroup" data-id="${k}">${l}</button>`).join('')}</div>
      ${draft.length ? `<div class="sec"><h2>Jouw training · ${draft.length}</h2><button data-act="clearDraft">Leegmaken</button></div><div class="list">${mine}</div>` : ''}
      ${lists || '<div class="card empty" style="margin-top:14px">Tik op een spier op het lichaam, of kies hierboven een spiergroep. Dan zie je de oefeningen.</div>'}
      <div class="dock"><button class="big-btn soft" data-act="saveDraft" ${draft.length ? '' : 'disabled'}>Bewaar als dag</button><button class="big-btn" data-act="startDraft" ${draft.length ? '' : 'disabled'}>${IC.play}Start${draft.length ? ` · ${draft.length}` : ''}</button></div>`;
  },

  days() {
    const rows = S.plans.map(p => `<button class="row" data-act="plan" data-id="${p.id}"><span class="ico">${esc(p.name.trim().charAt(0).toUpperCase())}</span><div class="w"><b>${esc(p.name)}</b><span>${p.items.length} oefeningen · ${planSets(p)} sets · ± ${planMins(p)} min</span></div><span class="chev">›</span></button>`).join('');
    return `${head('Mijn dagen', 'Trainingen die je zelf hebt samengesteld', `<button class="icon-btn" data-act="build" aria-label="Nieuwe dag">${IC.plus}</button>`)}
      <div class="list">${rows || `<div class="card empty">Nog geen dagen. Stel een training samen en tik op <b>Bewaar als dag</b>. Dan staat hij hier, klaar om te starten.</div>`}</div>
      <div class="btns"><button class="big-btn full" data-act="build">${IC.plus}Nieuwe dag samenstellen</button></div>`;
  },

  plan() {
    const p = S.plans.find(x => x.id === route.id); if (!p) { route = { page: 'days' }; return PAGES.days(); }
    const rows = p.items.map((it, i) => { const ex = exOf(it.ex);
      return `<button class="row" data-act="editItem" data-i="${i}"><span class="ico">${i + 1}</span><div class="w"><b>${esc(ex.name)}</b><span>${itemTxt(ex, it)} · rust ${restTxt(it.rest)}</span></div><span class="chev">›</span></button>`; }).join('');
    const isActive = S.active && S.active.pid === p.id;
    return `${head(p.name, `${p.items.length} oefeningen · ${planSets(p)} sets · ± ${planMins(p)} min`, `<button class="icon-btn" data-act="renamePlan" aria-label="Naam wijzigen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>`, true)}
      <div class="chips" style="margin:-6px 2px 14px">${groupChips(planGroups(p))}</div>
      <button class="big-btn full" data-act="${isActive ? 'openWo' : 'start'}" data-id="${p.id}">${IC.play}${isActive ? 'Ga verder met deze training' : 'Start training'}</button>
      <div class="sec"><h2>Oefeningen</h2><button data-act="pickForPlan">+ Toevoegen</button></div>
      <div class="list">${rows || '<div class="card empty">Nog geen oefeningen. Voeg er een toe.</div>'}</div>
      <div class="btns" style="margin-top:22px"><button class="big-btn danger full" data-act="deletePlan">Dag verwijderen</button></div>`;
  },

  library() {
    return `${head('Oefeningen', `${ALL().length} oefeningen met uitleg`, `<button class="icon-btn" data-act="newExercise" aria-label="Eigen oefening">${IC.plus}</button>`)}
      <input class="search" id="q" type="search" placeholder="Zoek een oefening" value="${esc(libQ)}" autocomplete="off">
      <div class="scroller" style="margin-top:10px">${[['', 'Alles'], ...Object.entries(GROUPS)].map(([k, l]) => `<button class="chip ${libG === k ? 'on' : ''}" data-act="libGroup" data-id="${k}">${l}</button>`).join('')}</div>
      <div id="libList"></div>`;
  },

  exercise() {
    const ex = exOf(route.id), { best } = records(), b = best[ex.id], K = KINDS[kindOf(ex)], d = defaultItem(ex.id);
    const sessions = S.history.filter(s => s.items.some(it => it.ex === ex.id)).sort((a, z) => a.started - z.started);
    const tops = sessions.map(s => ({ at: s.started, kg: Math.max(...s.items.find(it => it.ex === ex.id).sets.map(x => ex.type ? x.reps : x.kg)) }));
    const lastFew = sessions.slice(-5).reverse().map(s => { const it = s.items.find(x => x.ex === ex.id);
      return `<button class="row" data-act="session" data-id="${s.id}"><div class="w"><b>${dateTxt(s.started)}</b><span>${it.sets.map(x => setTxt(ex, x)).join('  ·  ')}</span></div></button>`; }).join('');
    const helpers = SECONDARY[ex.id] || [];
    return `${head(ex.name, '', '', true)}
      <div class="chips" style="margin:-8px 2px 14px"><span class="chip">${GROUPS[ex.group]}</span><span class="chip">${EQUIP[ex.equip] || ''}</span><span class="chip">${K.label}</span>${ex.custom ? '<span class="chip">Eigen oefening</span>' : ''}</div>
      ${ex.how ? `<div class="card how">${esc(ex.how)}${ex.tip ? `<div class="tip"><b>Tip</b> · ${esc(ex.tip)}</div>` : ''}</div>` : ''}
      <div class="card how advice"><b>Advies</b> · ${itemTxt(ex, d).replace(' · eigen gewicht', '')}, ${restTxt(d.rest)} rust tussen de sets.${helpers.length ? ` Traint ook je ${helpers.map(g => GROUPS[g].toLowerCase()).join(' en ')}.` : ''}</div>
      ${ex.type ? '' : `<div class="sec"><h2>Jouw record</h2></div><div class="pr">
        <div class="stat">${dots(b ? kgTxt(b.kg) : '0', 4.4)}<span>kg${b ? ` × ${b.reps}` : ''}</span></div>
        <div class="stat">${dots(b ? kgTxt(Math.round(e1rm(b.kg, b.reps))) : '0', 4.4)}<span>max 1× (geschat)</span></div>
        <div class="stat">${dots(String(sessions.length), 4.4)}<span>keer gedaan</span></div></div>`}
      ${tops.length > 1 ? `<div class="card chart" style="margin-top:8px"><div class="t"><b>${ex.type ? 'Langste set' : 'Zwaarste set'}</b><span>${ex.type === 'time' ? 'sec' : ex.type === 'cardio' ? 'min' : 'kg'} per training</span></div>${lineChart(tops.slice(-12))}</div>` : ''}
      <div class="btns two" style="margin-top:16px"><button class="big-btn soft" data-act="addToPlan" data-id="${ex.id}">${IC.plus}Toevoegen</button>${S.active ? `<button class="big-btn" data-act="addToActive" data-id="${ex.id}">${IC.plus}In training</button>` : `<button class="big-btn" data-act="quickStart" data-id="${ex.id}">${IC.play}Nu doen</button>`}</div>
      ${lastFew ? `<div class="sec"><h2>Laatste keren</h2></div><div class="list">${lastFew}</div>` : ''}
      ${ex.custom ? '<div class="btns"><button class="big-btn danger full" data-act="deleteExercise">Oefening verwijderen</button></div>' : ''}`;
  },

  progress() {
    const total = S.history.length, vol = S.history.reduce((n, s) => n + volOf(s), 0), { best } = records();
    const wk = monday(Date.now()), per = {}; for (const s of S.history.filter(x => x.started >= wk)) for (const [g, n] of Object.entries(groupSets(s.items, false))) per[g] = (per[g] || 0) + n;
    const maxSets = Math.max(20, ...Object.values(per));
    const bars = Object.keys(GROUPS).filter(g => g !== 'cardio').map(g => `<div class="gbar"><span>${GROUPS[g]}</span><i><s style="width:${Math.min(100, (per[g] || 0) / maxSets * 100)}%"></s></i><b>${Math.round(per[g] || 0)}</b></div>`).join('');
    const recs = Object.entries(best).sort((a, z) => z[1].at - a[1].at).slice(0, 10).map(([id, b]) => `<button class="row" data-act="exercise" data-id="${id}"><div class="w"><b>${esc(exOf(id).name)}</b><span>${dateTxt(b.at)} · max 1× ± ${kgTxt(Math.round(e1rm(b.kg, b.reps)))} kg</span></div><span class="badge gold">${kgTxt(b.kg)} × ${b.reps}</span></button>`).join('');
    return `${head('Voortgang', total ? `${total} trainingen sinds ${dateTxt(Math.min(...S.history.map(s => s.started)))}` : 'Train en je ziet hier hoe je sterker wordt')}
      <div class="stats">
        <div class="stat">${dots(String(total), 4.6)}<span>trainingen</span></div>
        <div class="stat">${dots((vol / 1000).toFixed(1).replace('.', ','), 4.6)}<span>ton getild</span></div>
        <div class="stat">${dots(String(weekStreak()), 4.6)}<span>weken op rij</span></div>
      </div>
      <div class="card chart" style="margin-top:8px"><div class="t"><b>Sets per spier</b><span>deze week · 10 tot 20 is goed</span></div><div class="gbars">${bars}</div></div>
      <div class="card chart" style="margin-top:8px"><div class="t"><b>Per week</b><span>kg getild</span></div>${weekChart()}</div>
      <div class="card chart" style="margin-top:8px"><div class="t"><b>Kalender</b><span>laatste 12 weken</span></div>${calendar()}</div>
      ${recs ? `<div class="sec"><h2>Records</h2></div><div class="list">${recs}</div>` : ''}
      <div class="sec"><h2>Alle trainingen</h2></div>
      <div class="list">${S.history.map(sessionRow).join('') || '<div class="card empty">Nog geen trainingen. Stel er een samen op Vandaag.</div>'}</div>`;
  },
};
const sessionRow = s => `<button class="row" data-act="session" data-id="${s.id}"><span class="ico">${new Date(s.started).getDate()}</span><div class="w"><b>${esc(s.name)}</b><span>${dateTxt(s.started)} · ${setsOf(s)} sets · ${minsOf(s)} min</span></div><span class="badge">${volTxt(volOf(s))}</span></button>`;
const heroDeco = () => `<svg class="deco" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => { const a = -Math.PI * 0.95 + i * 0.075, r1 = 150, r2 = i % 5 === 0 ? 132 : 140, cx = 220, cy = 220;
  return `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" stroke="#fff" stroke-opacity="${i % 5 === 0 ? .8 : .45}" stroke-width="${i % 5 === 0 ? 2 : 1.3}" stroke-linecap="round"/>`; }).join('')}<circle cx="${220 + 150 * Math.cos(-Math.PI * 0.95 + 21 * 0.075)}" cy="${220 + 150 * Math.sin(-Math.PI * 0.95 + 21 * 0.075)}" r="5" fill="#fff"/></svg>`;

let libQ = '', libG = '';
function libList() {
  const box = $('libList'); if (!box) return;
  const { best } = records(), q = libQ.trim().toLowerCase();
  const found = ALL().filter(e => (!libG || e.group === libG) && (!q || e.name.toLowerCase().includes(q) || GROUPS[e.group].toLowerCase().includes(q)));
  const groups = Object.keys(GROUPS).filter(g => found.some(e => e.group === g));
  box.innerHTML = groups.map(g => `<div class="sec"><h2>${GROUPS[g]}</h2></div><div class="list">${found.filter(e => e.group === g).map(e => { const b = best[e.id];
    return `<button class="row" data-act="exercise" data-id="${e.id}"><div class="w"><b>${esc(e.name)}</b><span>${EQUIP[e.equip] || ''} · ${KINDS[kindOf(e)].label.toLowerCase()}${e.custom ? ' · eigen' : ''}</span></div>${b ? `<span class="badge gold">${kgTxt(b.kg)} kg</span>` : '<span class="chev">›</span>'}</button>`; }).join('')}</div>`).join('')
    || '<div class="card empty" style="margin-top:14px">Niets gevonden. Tik op + om hem zelf toe te voegen.</div>';
}

// ---------- charts ----------
function weekChart() {
  const w0 = monday(Date.now()), weeks = Array.from({ length: 8 }, (_, i) => w0 - (7 - i) * 7 * DAY);
  const vals = weeks.map(w => S.history.filter(s => s.started >= w && s.started < w + 7 * DAY).reduce((n, s) => n + volOf(s), 0));
  const max = Math.max(1, ...vals), W = 320, Hh = 150, bw = 26, gap = (W - bw * 8) / 7;
  const bars = vals.map((v, i) => { const h = v ? Math.max(6, (v / max) * 104) : 4, x = i * (bw + gap), y = 116 - h, now = i === 7;
    const label = new Date(weeks[i]).getDate() + '/' + (new Date(weeks[i]).getMonth() + 1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="8" fill="#fff" fill-opacity="${now ? 0.95 : v ? 0.42 : 0.12}"/>
      ${v && (now || v === max) ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 't' : Math.round(v)}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="136" text-anchor="middle" font-size="10" fill="#fff" fill-opacity=".5">${label}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Kilo’s per week, de laatste 8 weken">${bars}</svg>`;
}
function calendar() {
  const end = monday(Date.now()) + 7 * DAY, start = end - 12 * 7 * DAY, per = {};
  for (const s of S.history) if (s.started >= start) per[dayKey(s.started)] = (per[dayKey(s.started)] || 0) + volOf(s) + 1;
  const max = Math.max(1, ...Object.values(per)), c = 21, g = 4.6, W = 12 * (c + g), Hh = 7 * (c + g) + 16, today = dayKey(Date.now());
  let cells = '';
  for (let w = 0; w < 12; w++) for (let d = 0; d < 7; d++) {
    const ts = start + (w * 7 + d) * DAY, k = dayKey(ts), v = per[k], future = ts > Date.now();
    cells += `<rect x="${w * (c + g)}" y="${d * (c + g)}" width="${c}" height="${c}" rx="6" fill="#fff" fill-opacity="${future ? 0.03 : v ? 0.35 + 0.6 * v / max : 0.09}" ${k === today ? 'stroke="#fff" stroke-width="1.6"' : ''}/>`;
  }
  const months = [...Array(12)].map((_, w) => { const d = new Date(start + w * 7 * DAY); return d.getDate() <= 7 ? `<text x="${w * (c + g)}" y="${Hh - 2}" font-size="10" fill="#fff" fill-opacity=".5">${d.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')}</text>` : ''; }).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Dagen dat je trainde, de laatste 12 weken">${cells}${months}</svg>`;
}
function lineChart(pts) {
  const W = 320, Hh = 140, min = Math.min(...pts.map(p => p.kg)), max = Math.max(...pts.map(p => p.kg)), span = Math.max(1, max - min);
  const X = i => 14 + i * ((W - 28) / Math.max(1, pts.length - 1)), Y = v => 104 - ((v - min) / span) * 84;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.kg).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Je zwaarste set per training"><defs><linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
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
const stepRow = (key, title, sub, val) => `<div class="step"><div class="w"><b>${title}</b><span>${sub}</span></div><button data-step="${key}" data-d="-1" aria-label="Minder">−</button><span class="v" id="v-${key}">${val}</span><button data-step="${key}" data-d="1" aria-label="Meer">+</button></div>`;
function stepper(sh, obj, rules, onChange) {
  sh.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.step; if (!rules[k]) return; const [step, lo, hi, f] = rules[k];
    obj[k] = Math.max(lo, Math.min(hi, Math.round((obj[k] + step * Number(b.dataset.d)) * 10) / 10));
    const el = sh.querySelector('#v-' + k); if (el.tagName === 'INPUT') el.value = f(obj[k]); else el.textContent = f(obj[k]); save(); onChange?.();
  }));
}
const rulesFor = ex => ({ sets: [1, 1, 10, v => v], reps: ex.type === 'time' ? [5, 5, 600, v => v + ' s'] : ex.type === 'cardio' ? [1, 1, 180, v => v + ' min'] : [1, 1, 100, v => v],
  kg: [2.5, 0, 500, v => kgTxt(v)], rest: [15, 15, 600, v => restTxt(v)] });

function sessionSheet(id) {
  const s = S.history.find(x => x.id === id); if (!s) return;
  sheet(`<h2>${esc(s.name)}</h2><p class="sub">${new Date(s.started).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} · ${new Date(s.started).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</p>
    <div class="sum"><div><b>${setsOf(s)}</b><span>sets</span></div><div><b>${volTxt(volOf(s)).replace(' kg', '')}</b><span>${volOf(s) >= 10000 ? 'getild' : 'kg getild'}</span></div><div><b>${minsOf(s)}</b><span>minuten</span></div></div>
    ${s.items.map(it => { const ex = exOf(it.ex); return `<h3>${esc(ex.name)}</h3><div class="chips">${it.sets.map((x, i) => `<span class="chip">${i + 1}. ${setTxt(ex, x)}</span>`).join('')}</div>`; }).join('')}
    <div class="btns"><button class="big-btn soft full" id="again">${IC.plus}Bewaar als dag</button><button class="big-btn danger full" id="delS">Training verwijderen</button></div>`, sh => {
    sh.querySelector('#again').addEventListener('click', () => nameSheet('Bewaar als dag', s.name, 'Bewaren', name => { S.plans.push({ id: 'p' + Date.now().toString(36), name, items: s.items.map(it => { const d = defaultItem(it.ex), last = it.sets[it.sets.length - 1]; return { ...d, sets: it.sets.length, reps: last.reps, kg: last.kg }; }) }); save(); closeSheet(); toast(`${name} staat bij Mijn dagen`); }));
    sh.querySelector('#delS').addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Zeker weten? Tik nog een keer'; return; }
      S.history = S.history.filter(x => x.id !== id); save(); closeSheet(); draw(); toast('Training verwijderd'); });
  });
}
// change one exercise of a day (or of the training you are putting together)
function itemSheet(list, i, after) {
  const it = list[i], ex = exOf(it.ex), word = ex.type === 'time' ? 'Seconden' : ex.type === 'cardio' ? 'Minuten' : 'Herhalingen';
  sheet(`<h2>${esc(ex.name)}</h2><p class="sub">${GROUPS[ex.group]} · ${EQUIP[ex.equip] || ''} · advies ${restTxt(S.rest[kindOf(ex)])} rust</p>
    ${stepRow('sets', 'Sets', 'hoe vaak', it.sets)}${stepRow('reps', word, 'per set', rulesFor(ex).reps[3](it.reps))}
    ${ex.type === 'cardio' ? '' : stepRow('kg', 'Gewicht', 'kg, stappen van 2,5', kgTxt(it.kg))}${stepRow('rest', 'Rust', 'tussen de sets', restTxt(it.rest))}
    <div class="btns two"><button class="big-btn soft" id="mUp" ${i === 0 ? 'disabled' : ''}>${IC.up}Omhoog</button><button class="big-btn soft" id="mDown" ${i === list.length - 1 ? 'disabled' : ''}>${IC.down}Omlaag</button></div>
    <div class="btns two"><button class="big-btn danger" id="mDel">Weghalen</button><button class="big-btn" id="mOk">Klaar</button></div>`, sh => {
    stepper(sh, it, rulesFor(ex), after);
    const moveBy = d => { const j = i + d; [list[i], list[j]] = [list[j], list[i]]; save(); closeSheet(); after(); };
    sh.querySelector('#mUp').addEventListener('click', () => i > 0 && moveBy(-1));
    sh.querySelector('#mDown').addEventListener('click', () => i < list.length - 1 && moveBy(1));
    sh.querySelector('#mDel').addEventListener('click', () => { list.splice(i, 1); save(); closeSheet(); after(); });
    sh.querySelector('#mOk').addEventListener('click', closeSheet);
  });
}
function pickerSheet(onPick, title) {
  let q = '', g = '';
  const list = () => { const ql = q.trim().toLowerCase(); return ALL().filter(e => (!g || e.group === g) && (!ql || e.name.toLowerCase().includes(ql))).slice(0, 90)
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
function nameSheet(title, value, button, onDone) {
  sheet(`<h2>${title}</h2><form id="nf" style="margin-top:12px"><input class="field" id="nv" maxlength="40" value="${esc(value)}" placeholder="Bijvoorbeeld: Borst & triceps" autocomplete="off"><div class="btns"><button class="big-btn full" type="submit">${button}</button></div></form>`, sh => {
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
  sheet(`<h2>Instellingen</h2><p class="sub">De app geeft advies. Hier pas je het aan naar hoe jij traint.</p>
    <h3>Rust tussen de sets</h3>
    ${Object.entries(KINDS).filter(([k]) => k !== 'cardio').map(([k, K]) => stepRow(k, K.label, K.sub, restTxt(S.rest[k]))).join('')}
    <div class="list" style="margin-top:12px">
      <button class="row" id="sRec"><div class="w"><b>Hersteltijd per spier</b><span>Hoe lang een spier rood blijft na een training</span></div><span class="chev">›</span></button>
      <button class="row" id="sSound"><div class="w"><b>Piepjes na de rust</b><span>Drie korte piepjes als je weer moet</span></div><span class="badge ${S.sound ? 'ok' : ''}">${S.sound ? 'Aan' : 'Uit'}</span></button>
      <button class="row" id="sAwake"><div class="w"><b>Scherm blijft aan</b><span>Tijdens een training</span></div><span class="badge ${S.awake ? 'ok' : ''}">${S.awake ? 'Aan' : 'Uit'}</span></button>
      <button class="row" data-act="install"><div class="w"><b>Op je beginscherm zetten</b><span>Zo wordt het een echte app</span></div><span class="chev">›</span></button>
    </div>
    <h3>Back-up</h3><p class="sub" style="margin:0 2px 8px">Alles staat alleen op deze telefoon. Kopieer een back-up en bewaar hem in je Notities, dan raak je niets kwijt.</p>
    <div class="btns two" style="margin-top:0"><button class="big-btn soft" id="sCopy">Kopieer back-up</button><button class="big-btn soft" id="sPaste">Zet terug</button></div>
    <div id="sBox"></div>
    <div class="btns"><button class="big-btn danger full" id="sReset">Alles wissen</button></div>
    <p class="note">De look is geïnspireerd op het FORM strength training app-concept van Sujon Hossain. De rust- en hersteltijden zijn een advies, geen medische regel: luister ook naar je lichaam.</p>`, sh => {
    stepper(sh, S.rest, Object.fromEntries(Object.keys(KINDS).map(k => [k, [15, 15, 600, restTxt]])));
    sh.querySelector('#sRec').addEventListener('click', recoverSheet);
    const flip = (id, key) => sh.querySelector(id).addEventListener('click', e => { S[key] = !S[key]; save(); const b = e.currentTarget.querySelector('.badge'); b.textContent = S[key] ? 'Aan' : 'Uit'; b.classList.toggle('ok', S[key]); });
    flip('#sSound', 'sound'); flip('#sAwake', 'awake');
    sh.querySelector('#sCopy').addEventListener('click', async () => { const text = JSON.stringify(S);
      try { await navigator.clipboard.writeText(text); toast('Back-up gekopieerd: plak hem in je Notities'); }
      catch { sh.querySelector('#sBox').innerHTML = `<textarea class="field" style="margin-top:10px" readonly>${esc(text)}</textarea>`; const t = sh.querySelector('#sBox textarea'); t.focus(); t.select(); toast('Selecteer en kopieer de tekst'); } });
    sh.querySelector('#sPaste').addEventListener('click', () => {
      sh.querySelector('#sBox').innerHTML = `<textarea class="field" id="sIn" style="margin-top:10px" placeholder="Plak hier je back-up"></textarea><div class="btns"><button class="big-btn full" id="sLoad">Terugzetten</button></div>`;
      sh.querySelector('#sLoad').addEventListener('click', () => { try { const s = JSON.parse(sh.querySelector('#sIn').value); if (!s || ![2, 3].includes(s.v) || !Array.isArray(s.history)) throw 0;
        localStorage.setItem(KEY, JSON.stringify(s)); S = loadState(); save(); closeSheet(); tab('home'); toast('Back-up teruggezet'); } catch { toast('Dat is geen geldige back-up'); } });
    });
    sh.querySelector('#sReset').addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Echt alles wissen? Tik nog een keer'; return; }
      S = fresh(); save(); closeSheet(); stopWorkoutScreen(); tab('home'); toast('Alles gewist'); });
  });
}
function recoverSheet() {
  sheet(`<h2>Hersteltijd</h2><p class="sub">Na een volle training (6 sets of meer) blijft een spier zo lang gekleurd. Minder sets: korter.</p>
    ${Object.entries(GROUPS).filter(([g]) => g !== 'cardio').map(([g, l]) => stepRow(g, l, `advies ${RECOVERY[g]} uur`, S.recover[g] + ' uur')).join('')}
    <div class="btns two"><button class="big-btn soft" id="rReset">Advies terug</button><button class="big-btn" data-act="close">Klaar</button></div>`, sh => {
    stepper(sh, S.recover, Object.fromEntries(Object.keys(GROUPS).map(g => [g, [6, 12, 168, v => v + ' uur']])), () => draw());
    sh.querySelector('#rReset').addEventListener('click', () => { S.recover = { ...RECOVERY }; save(); draw(); recoverSheet(); });
  });
}
function installSheet() {
  sheet(`<h2>Op je beginscherm</h2><p class="sub">Eén keer doen. Daarna is het een app met een eigen icoon die ook zonder internet werkt.</p>
    <div class="list">
      <div class="row"><span class="ico">1</span><div class="w"><b>Open deze pagina in Safari</b><span>Niet in Instagram of een andere app</span></div></div>
      <div class="row"><span class="ico">2</span><div class="w"><b>Tik op Delen</b><span>Het vierkantje met het pijltje omhoog</span></div></div>
      <div class="row"><span class="ico">3</span><div class="w"><b>Kies ‘Zet op beginscherm’</b><span>Scroll een stukje naar beneden</span></div></div>
      <div class="row"><span class="ico">4</span><div class="w"><b>Tik op ‘Voeg toe’</b><span>Open de app voortaan via het icoon</span></div></div>
    </div><p class="note">De app op je beginscherm bewaart zijn eigen trainingen. Gebruik dus steeds het icoon, niet de pagina in Safari.</p>
    <div class="btns"><button class="big-btn full" data-act="close">Oké</button></div>`);
}

// ---------- the workout: start, log sets, rest, finish ----------
function begin(name, pid, items) {
  if (S.active) { toast('Je andere training loopt nog: maak die eerst af'); openWorkout(); return; }
  if (!items.length) { toast('Voeg eerst een oefening toe'); return; }
  S.active = { pid, name, started: Date.now(), cur: 0, restEnd: 0, items: items.map(it => ({ ...it, log: [] })) };
  save(); openWorkout();
}
function startPlan(pid) { const p = S.plans.find(x => x.id === pid); if (!p) return; if (S.active?.pid === pid) { openWorkout(); return; } begin(p.name, pid, p.items); }
function quickStart(exId) { begin(exOf(exId).name, null, [defaultItem(exId)]); }
const draftName = () => { const g = [...new Set(S.draft.items.map(it => exOf(it.ex).group))].map(x => GROUPS[x]); return g.length ? g.slice(0, 3).join(' & ') : 'Training'; };
const A = () => S.active, curItem = () => A().items[Math.min(A().cur, A().items.length - 1)];
function openWorkout() { closeSheet(); adj = null; $('appScreen').hidden = true; $('woScreen').hidden = false; drawRuler(); woRender(); keepAwake(true); }
function stopWorkoutScreen() { $('woScreen').hidden = true; $('appScreen').hidden = false; adj = null; keepAwake(false); }
function woBack() { stopWorkoutScreen(); draw(); }

// The dial. Normally it fills up as your sets get done. Tap the kilos (or the reps) and it turns into a scale:
// slide along the arc to set the number, every tick is one step (2.5 kg or 1 rep).
let adj = null; // { key: 'kg' | 'reps', start, step, min, max }
function geometry() {
  const r = $('main').getBoundingClientRect(), W = r.width, Hh = r.height;
  const Sx = 0.1 * W, Sy = 0.06 * Hh, Ex = W - 100, Ey = Hh - 56, a1 = -4 * Math.PI / 180;
  let lo = 50, hi = 4000;
  for (let i = 0; i < 50; i++) { const R = (lo + hi) / 2, cx = Ex - R * Math.cos(a1), cy = Ey - R * Math.sin(a1); if (Math.hypot(Sx - cx, Sy - cy) > R) lo = R; else hi = R; }
  const R = (lo + hi) / 2, cx = Ex - R * Math.cos(a1), cy = Ey - R * Math.sin(a1);
  return { W, H: Hh, R, cx, cy, a0: Math.atan2(Sy - cy, Sx - cx), a1 };
}
const TICKS = 60;
function drawDial() {
  const g = geometry(), it = curItem(), ex = exOf(it.ex), at = (a, r) => [g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)];
  if (g.W < 10) return;
  const svg = $('dial'); svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
  const pos = adj ? Math.max(0, Math.min(TICKS, TICKS / 2 + (it[adj.key] - adj.start) / adj.step)) / TICKS : (it.sets ? Math.min(1, it.log.length / it.sets) : 0);
  const ticks = [], labels = [];
  for (let i = 0; i <= TICKS; i++) {
    const a = g.a0 + (g.a1 - g.a0) * i / TICKS, major = i % 6 === 0, len = major ? 18 : 9, near = adj && Math.abs(i / TICKS - pos) < 0.0001;
    const lit = adj ? Math.abs(i / TICKS - pos) <= 6 / TICKS : i / TICKS <= pos + 1e-6;
    const [x1, y1] = at(a, g.R - 6), [x2, y2] = at(a, g.R - 6 - (near ? 26 : len));
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#fff" stroke-opacity="${near ? 1 : lit ? 0.95 : major ? 0.42 : 0.26}" stroke-width="${near ? 2.6 : major ? 1.8 : 1.2}" stroke-linecap="round"/>`);
    if (adj && major && i < TICKS) { const v = Math.round((adj.start + (i - TICKS / 2) * adj.step) * 10) / 10; if (v >= adj.min && v <= adj.max) { const [lx, ly] = at(a, g.R - 46);
      labels.push(`<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#fff" fill-opacity="${Math.abs(i / TICKS - pos) < 0.05 ? 1 : 0.5}">${adj.key === 'kg' ? kgTxt(v) : v}</text>`); } }
  }
  const arc = r => { const [x0, y0] = at(g.a0, r), [x1, y1] = at(g.a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const [kx, ky] = at(g.a0 + (g.a1 - g.a0) * pos, g.R);
  svg.innerHTML = `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <path d="${arc(g.R + 14)}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.4" stroke-dasharray="1 7" stroke-linecap="round"/>
    <path d="${arc(g.R)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>${ticks.join('')}${labels.join('')}
    <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${adj ? 15 : 11}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>
    <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${adj ? 7 : 5}" fill="#fff" filter="url(#glow)"/><circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${adj ? 6 : 4}" fill="#fff"/>`;
  if (adj) { const [hx, hy] = at(g.a0 + (g.a1 - g.a0) * 0.4, g.R - Math.min(150, g.W * 0.36)); $('sets').innerHTML = `<span class="adjhint" style="left:${Math.max(16, hx - 30).toFixed(0)}px;top:${hy.toFixed(0)}px">Sleep langs de boog<br><small>${adj.key === 'kg' ? 'elk streepje is 2,5 kg' : adj.step === 5 ? 'elk streepje is 5 seconden' : adj.key === 'reps' && ex.type === 'cardio' ? 'elk streepje is 1 minuut' : 'elk streepje is 1 herhaling'}</small></span>`; return; }
  const k = Math.min(it.sets, 8), d = it.log.length, ri = g.R - Math.min(130, g.W * 0.31);
  $('sets').innerHTML = Array.from({ length: k }, (_, j) => {
    const f = k === 1 ? 0.35 : 0.2 + 0.44 * j / (k - 1), [x, y] = at(g.a0 + (g.a1 - g.a0) * f, ri), cls = j < d ? 'ok' : j === d ? 'now' : 'up';
    return `<span class="set ${cls}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px"><i></i>Set ${j + 1}${j < d ? ` <em>${setTxt(ex, it.log[j])}</em>` : ''}</span>`;
  }).join('');
}
function startAdjust(key) {
  const it = curItem(), ex = exOf(it.ex);
  if (ex.type === 'cardio' && key === 'kg') key = 'reps';
  if (adj?.key === key) { adj = null; woRender(); return; }
  const step = key === 'kg' ? 2.5 : ex.type === 'time' ? 5 : 1, min = key === 'kg' ? 0 : step, max = key === 'kg' ? 500 : ex.type === 'time' ? 600 : 100;
  adj = { key, start: it[key], step, min, max };
  if (A().restEnd > Date.now()) { A().restEnd = 0; save(); } // no rest timer while you set the numbers
  woRender();
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
  document.querySelector('.weight').classList.toggle('adj', adj?.key === 'kg' || (adj?.key === 'reps' && ex.type === 'cardio'));
  document.querySelector('.reps').classList.toggle('adj', adj?.key === 'reps' && ex.type !== 'cardio');
  drawDial(); woGoButton(); woTick();
}
function woGoButton() {
  const it = curItem(), d = it.log.length, last = A().cur >= A().items.length - 1, b = $('goBtn');
  let label, kind, soft = false;
  if (adj) { label = 'Klaar met<br>aanpassen'; kind = 'check'; b.dataset.mode = 'adj'; }
  else if (A().restEnd > Date.now()) { label = 'Rust<br>overslaan'; kind = 'skip'; soft = true; }
  else if (d < it.sets) { label = `Set ${d + 1}<br>klaar`; kind = 'check'; }
  else if (!last) { label = 'Volgende<br>oefening'; kind = 'next'; }
  else { label = 'Training<br>afronden'; kind = 'flag'; }
  if (!adj) delete b.dataset.mode;
  $('goLabel').innerHTML = label; b.innerHTML = IC[kind]; b.classList.toggle('soft', soft); b.dataset.kind = kind; b.setAttribute('aria-label', label.replace('<br>', ' '));
}
function woTick() {
  if (!A() || $('woScreen').hidden) return;
  const it = curItem(), clock = $('clock'), left = (A().restEnd - Date.now()) / 1000;
  $('woClock').textContent = `${Math.max(1, Math.round((Date.now() - A().started) / 60000))} min · ${A().items.reduce((n, x) => n + x.log.length, 0)} sets`;
  if (A().restEnd && left <= 0) { restOver(); return; }
  if (left > 0) { clock.innerHTML = dots(mmss(left), 8); clock.style.opacity = 1; placeRuler(left); $('restLbl').innerHTML = 'Rusttimer'; }
  else { clock.innerHTML = dots(mmss(it.rest), 8); clock.style.opacity = .55; placeRuler(it.rest); $('restLbl').innerHTML = it.log.length >= it.sets ? '<em>Oefening klaar</em>' : `Rusttimer · advies ${restTxt(S.rest[kindOf(exOf(it.ex))])}`; }
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
  const it = curItem(), b = $('goBtn'), kind = b.dataset.kind;
  if (S.sound) beep(0); // unlocks sound on the iPhone (it may only start after a tap)
  if (b.dataset.mode === 'adj') { adj = null; save(); woRender(); return; }
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
  adj = null;
  const st = $('stage'); st.classList.add(dir > 0 ? 'out-l' : 'out-r');
  setTimeout(() => { A().cur = next; save(); woRender(); st.classList.remove('out-l', 'out-r'); st.classList.add(dir > 0 ? 'out-r' : 'out-l'); void st.offsetWidth; st.classList.remove('out-l', 'out-r'); }, 160);
}
function woExact() { // type the exact numbers (the dial is the quick way)
  const it = curItem(), ex = exOf(it.ex), rules = rulesFor(ex), word = ex.type === 'time' ? 'Seconden' : ex.type === 'cardio' ? 'Minuten' : 'Herhalingen';
  sheet(`<h2>${esc(ex.name)}</h2><p class="sub">Voor je volgende set</p>
    ${ex.type === 'cardio' ? '' : `<div class="step"><div class="w"><b>Gewicht</b><span>kg · tik op het getal om te typen</span></div><button data-step="kg" data-d="-1" aria-label="Minder">−</button><input class="v" id="v-kg" inputmode="decimal" value="${kgTxt(it.kg)}" style="width:84px;background:none;border:0;outline:none"><button data-step="kg" data-d="1" aria-label="Meer">+</button></div>`}
    ${stepRow('reps', word, 'per set', rules.reps[3](it.reps))}${stepRow('sets', 'Sets', 'voor deze oefening', it.sets)}${stepRow('rest', 'Rust', `advies ${restTxt(S.rest[kindOf(ex)])}`, restTxt(it.rest))}
    ${ex.how ? `<div class="card how" style="margin-top:12px;font-size:15px">${esc(ex.how)}${ex.tip ? `<div class="tip"><b>Tip</b> · ${esc(ex.tip)}</div>` : ''}</div>` : ''}
    <div class="btns"><button class="big-btn full" data-act="close">Klaar</button></div>`, sh => {
    stepper(sh, it, rules, woRender);
    const kgIn = sh.querySelector('#v-kg');
    kgIn?.addEventListener('change', () => { const v = parseFloat(kgIn.value.replace(',', '.')); if (!isNaN(v)) { it.kg = Math.max(0, Math.min(500, Math.round(v * 10) / 10)); save(); woRender(); } kgIn.value = kgTxt(it.kg); });
  });
}
function woMenu() {
  const a = A(), list = a.items.map((it, i) => { const ex = exOf(it.ex);
    return `<button class="row" data-goto="${i}" ${i === a.cur ? 'style="box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.6)"' : ''}><span class="ico">${i + 1}</span><div class="w"><b>${esc(ex.name)}</b><span>${itemTxt(ex, it)}</span></div><span class="badge ${it.log.length >= it.sets ? 'ok' : ''}">${it.log.length}/${it.sets}</span></button>`; }).join('');
  sheet(`<h2>${esc(a.name)}</h2><p class="sub">Tik op een oefening om erheen te gaan</p><div class="list">${list}</div>
    <div class="btns two"><button class="big-btn soft" id="wAdd">${IC.plus}Oefening</button><button class="big-btn soft" id="wExact">Getallen typen</button></div>
    <div class="btns two"><button class="big-btn soft" id="wUndo">Laatste set terug</button><button class="big-btn soft" id="wInfo">Uitleg</button></div>
    <div class="btns"><button class="big-btn full" id="wFinish">${IC.flag}Training afronden</button><button class="big-btn danger full" id="wQuit">Stoppen zonder opslaan</button></div>`, sh => {
    sh.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { a.cur = Number(b.dataset.goto); a.restEnd = 0; adj = null; save(); closeSheet(); woRender(); }));
    sh.querySelector('#wAdd').addEventListener('click', () => pickerSheet(id => { a.items.push({ ...defaultItem(id), log: [] }); save(); woRender(); }, 'Oefening toevoegen'));
    sh.querySelector('#wExact').addEventListener('click', woExact);
    sh.querySelector('#wInfo').addEventListener('click', woExact);
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
  const trained = Object.keys(groupSets(items, false)).filter(g => g !== 'cardio');
  sheet(`<h2>${esc(a.name)} klaar</h2><p class="sub">Goed gedaan. Dit heb je gedaan:</p>
    <div class="sum"><div><b>${setsOf(s)}</b><span>sets</span></div><div><b>${volTxt(volOf(s)).replace(' kg', '')}</b><span>${volOf(s) >= 10000 ? 'getild' : 'kg getild'}</span></div><div><b>${minsOf(s)}</b><span>minuten</span></div></div>
    ${trained.length ? `<p class="sub" style="margin-top:12px">Getraind: ${trained.map(g => GROUPS[g].toLowerCase()).join(', ')}. Die kleuren nu rood op je lichaam tot ze hersteld zijn.</p>` : ''}
    ${newRecs.length ? `<h3>Nieuwe records</h3><div class="list">${newRecs.map(r => `<div class="row"><span class="ico" style="background:rgba(255,217,138,.18);color:var(--gold)">★</span><div class="w"><b>${esc(exOf(r.ex).name)}</b><span>Je zwaarste set ooit</span></div><span class="badge gold">${kgTxt(r.kg)} × ${r.reps}</span></div>`).join('')}</div>` : ''}
    <div class="btns"><button class="big-btn full" id="fSave">Opslaan</button>${a.pid ? '' : '<button class="big-btn soft full" id="fKeep">Opslaan en bewaar als dag</button>'}<button class="big-btn soft full" data-act="close">Nog even verder</button></div>`, sh => {
    const done = keepDay => {
      S.history.unshift(s);
      for (const it of a.items) { const last = it.log[it.log.length - 1]; if (last && !exOf(it.ex).type && last.kg) S.lastKg[it.ex] = last.kg; } // next time: start with what you lifted today
      const plan = S.plans.find(p => p.id === a.pid);
      if (plan) for (const it of a.items) { const last = it.log[it.log.length - 1], t = plan.items.find(x => x.ex === it.ex); if (last && t && !exOf(it.ex).type) { t.kg = last.kg; t.reps = last.reps; } }
      if (keepDay) S.plans.push({ id: 'p' + Date.now().toString(36), name: keepDay, items: a.items.map(({ log, ...it }) => ({ ...it, kg: log.length ? log[log.length - 1].kg : it.kg })) });
      if (!a.pid) S.draft = { items: [], groups: [] };
      S.active = null; save(); closeSheet(); stopWorkoutScreen(); tab('home'); toast(newRecs.length ? `Opgeslagen · ${newRecs.length} nieuw${newRecs.length > 1 ? 'e records' : ' record'}` : 'Opgeslagen. Lekker bezig');
    };
    sh.querySelector('#fSave').addEventListener('click', () => done(null));
    sh.querySelector('#fKeep')?.addEventListener('click', () => nameSheet('Bewaar als dag', a.name, 'Opslaan', name => done(name)));
  });
}

// swipe between exercises; while adjusting, slide along the arc; drag the ruler to change the rest
(() => { let x0 = null, y0 = 0, sliding = false; const m = $('main');
  const slide = e => { // the knob follows your finger along the arc
    const g = geometry(), r = m.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, it = curItem();
    const a = Math.atan2(y - g.cy, x - g.cx), f = Math.max(0, Math.min(1, (a - g.a0) / (g.a1 - g.a0))), i = Math.round(f * TICKS);
    const v = Math.max(adj.min, Math.min(adj.max, Math.round((adj.start + (i - TICKS / 2) * adj.step) * 10) / 10));
    if (v !== it[adj.key]) { it[adj.key] = v; woRender(); }
  };
  m.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; if (adj) { sliding = true; m.setPointerCapture(e.pointerId); slide(e); return; } x0 = e.clientX; y0 = e.clientY; });
  m.addEventListener('pointermove', e => { if (sliding) slide(e); });
  m.addEventListener('pointerup', e => { if (sliding) { sliding = false; save(); return; } if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { A().restEnd = 0; move(dx < 0 ? 1 : -1); } });
  m.addEventListener('pointercancel', () => { x0 = null; sliding = false; });
})();
(() => { const r = $('ruler'); let start = null;
  r.addEventListener('pointerdown', e => { if (!A() || A().restEnd > Date.now()) return; start = { x: e.clientX, v: curItem().rest }; r.setPointerCapture(e.pointerId); });
  r.addEventListener('pointermove', e => { if (!start) return; curItem().rest = Math.max(15, Math.min(MAXS, start.v - (e.clientX - start.x) / GAP * STEP)); woTick(); });
  const end = () => { if (!start) return; start = null; curItem().rest = Math.round(curItem().rest / STEP) * STEP; save(); woTick(); };
  r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
})();

// ---------- taps ----------
const refresh = () => draw();
const ACT = {
  tab: el => tab(el.dataset.id), back, close: closeSheet,
  plan: el => nav('plan', { id: el.dataset.id }), exercise: el => nav('exercise', { id: el.dataset.id }),
  session: el => sessionSheet(el.dataset.id), settings: settingsSheet, install: installSheet, recoverSettings: recoverSheet,
  start: el => startPlan(el.dataset.id), openWo: openWorkout, quickStart: el => quickStart(el.dataset.id),
  build: () => { if (route.page !== 'build') nav('build'); },
  pickGroup: el => { const g = el.dataset.id, set = new Set(S.draft.groups || []); set.has(g) ? set.delete(g) : set.add(g); S.draft.groups = [...set]; save(); draw(); },
  toggleDraft: el => { const id = el.dataset.id, i = S.draft.items.findIndex(it => it.ex === id); if (i >= 0) S.draft.items.splice(i, 1); else { S.draft.items.push(defaultItem(id)); toast(`${exOf(id).name} erbij`); } save(); draw(); },
  dropDraft: el => { S.draft.items.splice(Number(el.dataset.i), 1); save(); draw(); },
  editDraft: el => itemSheet(S.draft.items, Number(el.dataset.i), refresh),
  clearDraft: () => { S.draft = { items: [], groups: [] }; save(); draw(); },
  startDraft: () => { if (!S.draft.items.length) return; begin(draftName(), null, S.draft.items); },
  saveDraft: () => { if (!S.draft.items.length) return; nameSheet('Bewaar als dag', draftName(), 'Bewaren', name => { const p = { id: 'p' + Date.now().toString(36), name, items: S.draft.items.map(it => ({ ...it })) }; S.plans.push(p); S.draft = { items: [], groups: [] }; save(); closeSheet(); stack = []; route = { page: 'days' }; draw(true); toast(`${name} staat bij Mijn dagen`); }); },
  libGroup: el => { libG = el.dataset.id; document.querySelectorAll('[data-act="libGroup"]').forEach(b => b.classList.toggle('on', b === el)); libList(); },
  renamePlan: () => { const p = S.plans.find(x => x.id === route.id); nameSheet('Naam wijzigen', p.name, 'Opslaan', name => { p.name = name; save(); closeSheet(); draw(); }); },
  deletePlan: el => { if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = 'Zeker weten? Tik nog een keer'; return; } S.plans = S.plans.filter(p => p.id !== route.id); save(); back(); toast('Dag verwijderd'); },
  editItem: el => itemSheet(S.plans.find(x => x.id === route.id).items, Number(el.dataset.i), refresh),
  pickForPlan: () => { const p = S.plans.find(x => x.id === route.id); pickerSheet(id => { p.items.push(defaultItem(id)); save(); draw(); }, 'Oefening toevoegen'); },
  addToPlan: el => { const id = el.dataset.id;
    sheet(`<h2>Waar wil je hem bij?</h2><div class="list" style="margin-top:12px"><button class="row" data-d="draft"><div class="w"><b>Training die je nu samenstelt</b><span>${S.draft.items.length} oefeningen</span></div><span class="chev">+</span></button>${S.plans.map(p => `<button class="row" data-p="${p.id}"><div class="w"><b>${esc(p.name)}</b><span>${p.items.length} oefeningen</span></div><span class="chev">+</span></button>`).join('')}</div>`, sh => {
      sh.querySelector('[data-d]').addEventListener('click', () => { S.draft.items.push(defaultItem(id)); const g = exOf(id).group; if (!S.draft.groups.includes(g)) S.draft.groups.push(g); save(); closeSheet(); toast('Toegevoegd aan je training'); });
      sh.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { const p = S.plans.find(x => x.id === b.dataset.p); p.items.push(defaultItem(id)); save(); closeSheet(); toast(`Toegevoegd aan ${p.name}`); }));
    }); },
  addToActive: el => { A().items.push({ ...defaultItem(el.dataset.id), log: [] }); A().cur = A().items.length - 1; save(); openWorkout(); },
  newExercise: newExerciseSheet,
  deleteExercise: el => { if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = 'Zeker weten? Tik nog een keer'; return; } S.custom = S.custom.filter(e => e.id !== route.id); save(); back(); },
  woBack, woMenu, woGo, adjKg: () => startAdjust('kg'), adjReps: () => startAdjust('reps'),
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el) return; const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); f(el, e); } });
document.addEventListener('input', e => { if (e.target.id === 'q') { libQ = e.target.value; libList(); } });
addEventListener('resize', () => { if (S.active && !$('woScreen').hidden) woRender(); });

// ---------- start ----------
try { navigator.storage?.persist?.(); } catch {}
if ('serviceWorker' in navigator) {
  const had = Boolean(navigator.serviceWorker.controller);
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !S.active) location.reload(); }); // a new version: show it right away
}
draw(true);
if (S.active) openWorkout();
document.fonts?.ready.then(() => { draw(); if (S.active && !$('woScreen').hidden) woRender(); });
