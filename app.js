'use strict';
/* Nire App-a — secciones Aurrekontua y Kotxe
   Todo el texto visible está en euskera. Los datos se guardan solo en este dispositivo (IndexedDB). */

const BERTSIOA = '0.3.0';
const ATALAK = [
  { id: 'aurrekontua', ikonoa: '💰', izena: 'Aurrekontua' },
  { id: 'kotxe', ikonoa: '🚗', izena: 'Kotxe' },
  { id: 'zorrak', ikonoa: '🔁', izena: 'Zorrak', laster: true }
];
const HIL = ['urtarrila', 'otsaila', 'martxoa', 'apirila', 'maiatza', 'ekaina', 'uztaila', 'abuztua', 'iraila', 'urria', 'azaroa', 'abendua'];
const HIL_LAB = ['Urt', 'Ots', 'Mar', 'Api', 'Mai', 'Eka', 'Uzt', 'Abu', 'Ira', 'Urr', 'Aza', 'Abe'];
const KOLOREAK = ['#0F6E56', '#5DCAA5', '#378ADD', '#EF9F27', '#D85A30', '#D4537E', '#7F77DD', '#888780', '#639922', '#BA7517', '#185FA5', '#993556'];
const IKONOAK = ['🏠', '🛒', '🚗', '⚡', '🎉', '❤️', '📺', '📦', '🍽️', '👕', '✈️', '🎁', '📚', '🐾', '💊', '🏋️', '☕', '📱', '🧾', '💡'];

const $ = s => document.querySelector(s);

/* ---------- Base de datos local (IndexedDB, un único registro con todo el estado) ---------- */
const DB = {
  _db: null,
  ireki() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      const r = indexedDB.open('nire-app-a', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async lortu(k) {
    const db = await this.ireki();
    return new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  },
  async gorde(k, v) {
    const db = await this.ireki();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
};

/* ---------- Utilidades ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = n => Math.round(n * 100) / 100;
const batu = l => round2(l.reduce((a, x) => a + x.amount, 0));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const gaur = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const hk = data => data.slice(0, 7); // clave de mes "2026-11"
function eur(n, dec = 2) {
  return round2(n).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €';
}
const eurL = n => Number.isInteger(round2(n)) ? eur(n, 0) : eur(n, 2); // sin decimales si es entero
function zenbakia(s) {
  if (s == null) return NaN;
  s = String(s).trim().replace(/\s|€/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s);
}
const zenbStr = n => (n == null || isNaN(n) || n === 0) ? '' : (Number.isInteger(round2(n)) ? String(round2(n)) : round2(n).toFixed(2).replace('.', ','));
function mugitu(hil, d) {
  const [y, m] = hil.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
const zbk = (n, dec = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const osoa = s => parseInt(String(s ?? '').replace(/\D/g, ''), 10); // kilómetros: solo dígitos ("84.320" -> 84320)
const hilIzena = hil => { const [y, m] = hil.split('-').map(Number); return `${y}ko ${HIL[m - 1]}`; };
const egunLab = d => { const [, m, e] = d.split('-').map(Number); return `${HIL_LAB[m - 1]} ${e}`; };

/* ---------- Estado ---------- */
let S = null;               // todos los datos
let hil = hk(gaur());       // mes visible
let atala = (() => { try { return localStorage.getItem('atala') || 'aurrekontua'; } catch (e) { return 'aurrekontua'; } })();

function hasierakoa() {
  const t = [['Etxebizitza', '🏠'], ['Janaria', '🛒'], ['Kotxea', '🚗'], ['Hornidurak', '⚡'], ['Aisialdia', '🎉'], ['Osasuna', '❤️'], ['Harpidetzak', '📺'], ['Besteak', '📦']];
  return {
    v: 1,
    created: hk(gaur()), // mes en que se empezó a usar: antes de él no hay previsto
    groups: t.map(([name, icon], i) => ({ id: uid(), name, icon, planned: 0, color: KOLOREAK[i], archived: false })),
    plans: {},       // { "2026-11": { idTalde: cantidad } } -> previsto solo para ese mes
    expenses: [],    // { id, name, amount, date, gid, src?: 'kotxe', rid?: id del repostaje }
    incomes: [],     // { id, name, amount, date }
    refuels: [],     // { id, date, price, paid, odo, eid: id del gasto vinculado }
    settings: {}     // { kotxeGid: grupo al que van los repostajes }
  };
}
/* Añade lo que falte de versiones anteriores sin tocar los datos existentes */
function osatu(d) {
  if (!d.plans) d.plans = {};
  if (!Array.isArray(d.refuels)) d.refuels = [];
  if (!d.settings) d.settings = {};
  return d;
}
const gorde = () => DB.gorde('egoera', S);
const taldea = id => S.groups.find(g => g.id === id);
const taldeaSlug = s => s ? S.groups.find(g => !g.archived && slug(g.name) === slug(s)) : null;
const aurreikusia = (g, h) => (S.plans[h] && S.plans[h][g.id] != null) ? S.plans[h][g.id] : g.planned;
const hilekoGastuak = h => S.expenses.filter(e => hk(e.date) === h);
const hilekoSarrerak = h => S.incomes.filter(i => hk(i.date) === h);
const errealaTaldea = (g, h) => batu(S.expenses.filter(e => e.gid === g.id && hk(e.date) === h));
const taldeIkusgaiak = h => S.groups.filter(g => !g.archived || S.expenses.some(e => e.gid === g.id && hk(e.date) === h));
const lehenetsitakoData = () => hil === hk(gaur()) ? gaur() : hil + '-01';

/* ---------- Secciones ---------- */
function aldatuAtala(a) {
  atala = a;
  try { localStorage.setItem('atala', a); } catch (e) { /* sin acceso */ }
  render();
  window.scrollTo(0, 0);
}
const ekintzaNagusia = () => atala === 'kotxe' ? kargaOrria() : gastuOrria();

function render() {
  const at = ATALAK.find(a => a.id === atala && !a.laster) || ATALAK[0];
  atala = at.id;
  $('#izenburua').textContent = at.izena;
  $('#hilabetea').textContent = hilIzena(hil);
  $('#v-aurrekontua').hidden = atala !== 'aurrekontua';
  $('#v-kotxe').hidden = atala !== 'kotxe';
  $('#gehitu-goian').textContent = atala === 'kotxe' ? '⛽ Erregai-karga' : '+ Gastua';
  $('#fab').textContent = atala === 'kotxe' ? '⛽ Karga' : '+ Gastua';
  document.querySelectorAll('[data-atala]').forEach(b => b.classList.toggle('on', b.dataset.atala === atala));
  if (atala === 'kotxe') renderKotxe(); else renderAurrekontua();
}

function menuaOrria() {
  irekiOrria(
    goiburua('Nire App-a') +
    `<nav class="menua">${ATALAK.map(a => `<button ${a.laster ? 'disabled' : `data-atala="${a.id}"`} class="${a.id === atala ? 'on' : ''}">
        <span>${a.ikonoa}</span><span>${a.izena}${a.laster ? ' <small>laster</small>' : ''}</span></button>`).join('')}
      <button data-ezarpenak><span>⚙️</span><span>Ezarpenak</span></button></nav>`
  );
}

/* ---------- Kotxe: cálculos ---------- */
/* Grupo de Aurrekontua al que van los repostajes: el de Ezarpenak, si no "Kotxea"; con sortu=true lo crea si no existe */
function kotxeTaldea(sortu) {
  let g = S.settings.kotxeGid && taldea(S.settings.kotxeGid);
  if (!g || g.archived) g = S.groups.find(x => !x.archived && slug(x.name) === 'kotxea');
  if (!g && sortu) {
    g = { id: uid(), name: 'Kotxea', icon: '🚗', planned: 0, color: KOLOREAK[S.groups.length % KOLOREAK.length], archived: false };
    S.groups.push(g);
  }
  return g || null;
}

/* Cargas ordenadas por cuentakilómetros, con litros, km desde la anterior y consumo (siempre se llena el depósito) */
function kotxeKalkuluak() {
  const l = S.refuels.slice().sort((a, b) => a.odo - b.odo).map((r, i, arr) => {
    const litroak = r.paid / r.price;
    const km = i > 0 ? r.odo - arr[i - 1].odo : null;
    return Object.assign({}, r, { litroak, km, kons: km > 0 ? litroak / km * 100 : null });
  });
  const kd = l.filter(x => x.kons != null);
  const sumL = kd.reduce((a, x) => a + x.litroak, 0), sumKm = kd.reduce((a, x) => a + x.km, 0), sumE = kd.reduce((a, x) => a + x.paid, 0);
  return { l, batez: sumKm ? sumL / sumKm * 100 : null, kmKostua: sumKm ? sumE / sumKm : null };
}

/* Comprueba que el cuentakilómetros encaja con las fechas de las demás cargas */
function kargaErrorea(r, id) {
  if (!(r.price > 0)) return 'Idatzi litroaren prezio zuzena.';
  if (!(r.paid > 0)) return 'Idatzi ordaindutako zenbateko zuzena.';
  if (!(r.odo > 0)) return 'Idatzi kilometro-kontagailuaren balioa.';
  const besteak = S.refuels.filter(x => x.id !== id);
  if (besteak.some(x => x.odo === r.odo)) return 'Kontagailuaren balio hori dagoeneko badago.';
  if (besteak.some(x => (x.date < r.date && x.odo > r.odo) || (x.date > r.date && x.odo < r.odo)))
    return 'Kontagailua ez dator bat beste kargen datekin.';
  return '';
}

/* Guarda la carga y crea o actualiza el gasto vinculado en Aurrekontua */
function gordeKargaDatuak(r, datuak) {
  Object.assign(r, datuak);
  if (!S.refuels.includes(r)) S.refuels.push(r);
  let e = r.eid && S.expenses.find(x => x.id === r.eid);
  if (!e) {
    e = { id: uid(), name: 'Gasolina', gid: kotxeTaldea(true).id, src: 'kotxe', rid: r.id };
    S.expenses.push(e);
    r.eid = e.id;
  }
  e.amount = round2(r.paid); e.date = r.date;
  return e;
}
function ezabatuKarga(id) {
  const r = S.refuels.find(x => x.id === id);
  S.refuels = S.refuels.filter(x => x.id !== id);
  S.expenses = S.expenses.filter(e => !(r && e.id === r.eid) && e.rid !== id);
}

/* ---------- Kotxe: pantalla ---------- */
function renderKotxe() {
  const { l, batez, kmKostua } = kotxeKalkuluak();
  const azkena = l[l.length - 1], aurrekoa = l[l.length - 2];
  const hilekoak = l.filter(r => hk(r.date) === hil);
  const urtekoak = l.filter(r => r.date.slice(0, 4) === hil.slice(0, 4));
  const g = kotxeTaldea(false);

  $('#k-kontsumoa').innerHTML = batez != null ? `${zbk(batez, 2)} <small>L/100km</small>` : '—';
  $('#k-km').innerHTML = azkena ? `${zbk(azkena.odo)} <small>km</small>` : '—';
  $('#k-hilgastua').textContent = eurL(batu(hilekoak.map(r => ({ amount: r.paid }))));
  $('#k-hilgastua-azpi').textContent = `Aurrekontua › ${g ? g.name : 'Kotxea'}`;
  $('#k-prezioa').innerHTML = azkena ? `${zbk(azkena.price, 3)} <small>€/L</small>` : '—';
  const pa = $('#k-prezioa-azpi');
  if (azkena && aurrekoa) {
    const d = azkena.price - aurrekoa.price;
    pa.textContent = Math.abs(d) < 0.0005 ? 'Aurrekoaren berdina' : `${d < 0 ? '↓' : '↑'} ${zbk(Math.abs(d), 3)} € aurrekoarekiko`;
    pa.className = 'azpi' + (d < -0.0005 ? ' merkea' : d > 0.0005 ? ' garestia' : '');
  } else { pa.textContent = ''; pa.className = 'azpi'; }

  $('#kargak').innerHTML = l.length ? l.slice().reverse().map(r => {
    const kl = r.kons == null || batez == null ? '' : r.kons <= batez ? 'kons-ona' : 'kons-txarra';
    return `<button class="karga" data-karga="${r.id}">
      <span><b>${egunLab(r.date)}</b><small>${zbk(r.odo)} km · ${zbk(r.litroak, 2)} L · ${zbk(r.price, 3)} €/L</small></span>
      <span class="esk"><b>${eur(r.paid)}</b><small class="${kl}">${r.kons != null ? zbk(r.kons, 2) + ' L/100km' : 'Lehen karga'}</small></span></button>`;
  }).join('') : '<p class="hutsa">Gehitu zure lehen erregai-karga. Lehenengoak abiapuntu gisa balio du; kontsumoa bigarrenetik aurrera kalkulatzen da.</p>';

  const hilKm = hilekoak.reduce((a, r) => a + (r.km || 0), 0);
  $('#k-estat').innerHTML = l.length ? `
    <div>Urteko gastua<b>${eurL(batu(urtekoak.map(r => ({ amount: r.paid }))))}</b></div>
    <div>Kostua km-ko<b>${kmKostua != null ? zbk(kmKostua, 3) + ' €' : '—'}</b></div>
    <div>Hileko km<b>${zbk(hilKm)} km</b></div>` : '';

  const kd = l.filter(r => r.kons != null).slice(-8);
  $('#g-kontsumoa').innerHTML = lerroGrafikoa(kd.map(r => ({ v: r.kons, d: r.date })), { kolorea: '#0F6E56', dec: 2, batez });
  $('#g-prezioa').innerHTML = lerroGrafikoa(l.slice(-8).map(r => ({ v: r.price, d: r.date })), { kolorea: '#BA7517', dec: 3 });
}

/* Gráfico de línea sencillo en SVG; opcionalmente con la media como línea discontinua */
function lerroGrafikoa(pts, { kolorea, dec, batez }) {
  if (!pts.length) return '<p class="hutsa">Datu gehiago behar dira grafikorako.</p>';
  const x0 = 22, x1 = 298, y0 = 18, y1 = 80;
  const balioak = pts.map(p => p.v).concat(batez != null ? [batez] : []);
  let min = Math.min(...balioak), max = Math.max(...balioak);
  const tartea = Math.max(max - min, max * 0.02, 0.01);
  min -= tartea * 0.15; max += tartea * 0.15;
  const X = i => pts.length === 1 ? (x0 + x1) / 2 : x0 + i * (x1 - x0) / (pts.length - 1);
  const Y = v => y1 - (v - min) / (max - min) * (y1 - y0);
  const azk = pts.length - 1;
  let s = '';
  if (batez != null) {
    s += `<line x1="${x0}" x2="${x1}" y1="${Y(batez)}" y2="${Y(batez)}" stroke="#9FE1CB" stroke-dasharray="4 4"/>
      <text x="${x0 - 8}" y="${Y(batez) + 12}">batez bestekoa ${zbk(batez, dec)}</text>`;
  }
  s += `<polyline fill="none" stroke="${kolorea}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p, i) => `${X(i)},${Y(p.v)}`).join(' ')}"/>`;
  s += pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i === azk ? 4 : 3}" fill="${kolorea}"/>`).join('');
  s += `<text x="${X(azk)}" y="${Y(pts[azk].v) - 8}" text-anchor="middle" style="fill:#1E2321;font-weight:600">${zbk(pts[azk].v, dec)}</text>`;
  s += `<text x="${X(0)}" y="104" text-anchor="middle">${egunLab(pts[0].d)}</text>`;
  if (azk > 0) s += `<text x="${X(azk)}" y="104" text-anchor="middle">${egunLab(pts[azk].d)}</text>`;
  return `<svg viewBox="0 0 320 108" class="lerro-grafikoa">${s}</svg>`;
}

/* ---------- Aurrekontua: pantalla ---------- */
function renderAurrekontua() {
  const gs = taldeIkusgaiak(hil);
  const sar = batu(hilekoSarrerak(hil));
  const gas = batu(hilekoGastuak(hil));
  const sob = round2(sar - gas);

  const kg = S.refuels.length ? kotxeTaldea(false) : null;
  $('#k-sarrerak').textContent = eurL(sar);
  $('#k-gastuak').textContent = eurL(gas);
  $('#k-soberakina').textContent = eurL(sob);
  $('#k-soberakina').classList.toggle('neg', sob < 0);

  $('#taldeak').innerHTML = gs.length ? gs.map(g => {
    const p = aurreikusia(g, hil), r = errealaTaldea(g, hil);
    const pct = p > 0 ? Math.min(100, r / p * 100) : 0;
    const over = p > 0 && r > p;
    return `<button class="taldea" data-taldea="${g.id}">
      <span class="ik">${g.icon}</span><span>${esc(g.name)}${kg && kg.id === g.id ? '<span class="etiketa">Kotxe</span>' : ''}</span>
      <span class="zk${over ? ' gainditua' : ''}">${eurL(r)} / ${p > 0 ? eurL(p) : '—'}</span>
      <span class="barra"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></span></button>`;
  }).join('') : '<p class="hutsa">Sortu zure lehen gastu-taldea.</p>';

  $('#donut').innerHTML = donut(gs.map(g => ({ n: g.name, c: g.color, v: errealaTaldea(g, hil) })).filter(x => x.v > 0), gas);
  $('#barrak').innerHTML = barrak();
}

function donut(items, total) {
  if (!total) return '<p class="hutsa">Hilabete honetan ez dago gasturik.</p>';
  items.sort((a, b) => b.v - a.v);
  let off = 0;
  const seg = items.map(it => {
    const p = it.v / total * 100;
    const s = `<circle cx="50" cy="50" r="38" pathLength="100" stroke="${it.c}" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${-off}"/>`;
    off += p;
    return s;
  }).join('');
  const leg = items.map(it => `<div><span><span class="puntua" style="background:${it.c}"></span>${esc(it.n)}</span><span>${Math.round(it.v / total * 100)}%</span></div>`).join('');
  return `<div class="donut-bilgarria">
    <svg viewBox="0 0 100 100" class="donut"><g transform="rotate(-90 50 50)" fill="none" stroke-width="15">${seg}</g>
      <text x="50" y="50" text-anchor="middle" font-size="11" font-weight="600" fill="#1E2321">${eurL(total)}</text>
      <text x="50" y="61" text-anchor="middle" font-size="6.5" fill="#5F6662">gastatuta</text></svg>
    <div class="legenda-zerr">${leg}</div></div>`;
}

function barrak() {
  const hilak = [-5, -4, -3, -2, -1, 0].map(d => mugitu(hil, d));
  const dat = hilak.map(h => ({
    h,
    p: h < (S.created || h) ? 0 : round2(taldeIkusgaiak(h).reduce((a, g) => a + aurreikusia(g, h), 0)),
    r: batu(hilekoGastuak(h))
  }));
  const max = Math.max(1, ...dat.map(d => Math.max(d.p, d.r)));
  const bars = dat.map((d, i) => {
    const x = i * 50 + 9, hp = d.p / max * 88, hr = d.r / max * 88;
    const m = Number(d.h.slice(5)) - 1;
    const kolorea = d.r > d.p && d.p > 0 ? '#E24B4A' : '#0F6E56';
    return `<rect x="${x}" y="${100 - hp}" width="14" height="${hp}" rx="2" fill="#9FE1CB"/>
      <rect x="${x + 17}" y="${100 - hr}" width="14" height="${hr}" rx="2" fill="${kolorea}"/>
      <text x="${x + 15.5}" y="114" text-anchor="middle" font-size="10" fill="${d.h === hil ? '#1E2321' : '#8E9490'}" font-weight="${d.h === hil ? 600 : 400}">${HIL_LAB[m]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 300 118" class="barrak"><line x1="0" x2="300" y1="100.5" y2="100.5" stroke="#E2E5E1"/>${bars}</svg>`;
}

/* ---------- Hojas (pop-ups estilo iOS) ---------- */
const goiburua = t => `<div class="orri-goiburua"><h2>${t}</h2><button class="x" data-itxi aria-label="Itxi">×</button></div>`;

function irekiOrria(html, onMount) {
  const o = $('#orria');
  o.querySelector('.edukia').innerHTML = html;
  o.querySelector('.xafla').scrollTop = 0;
  o.hidden = false;
  void o.offsetWidth; // fuerza el repintado para que la animación de entrada funcione
  o.classList.add('ireki');
  if (onMount) onMount(o);
}
function itxiOrria() {
  const o = $('#orria');
  if (o.hidden) return;
  o.classList.remove('ireki');
  if (document.activeElement) document.activeElement.blur();
  setTimeout(() => { o.hidden = true; o.querySelector('.edukia').innerHTML = ''; }, 280);
}
function errorea(id, testua) { const e = $(id); if (e) e.textContent = testua; }

function gastuZerrenda(iragazkia, max) {
  const l = hilekoGastuak(hil).filter(iragazkia).sort((a, b) => b.date.localeCompare(a.date)).slice(0, max || 999);
  if (!l.length) return '<p class="hutsa">Oraindik ez dago gasturik.</p>';
  return l.map(e => {
    const g = taldea(e.gid);
    return `<div class="lerroa"><span>${g ? g.icon : ''} ${esc(e.name)}${e.src === 'kotxe' ? '<span class="etiketa">Kotxe</span>' : ''}<small>${egunLab(e.date)}</small></span>
      <span>${eur(e.amount)}<button class="ezab" data-ezab-gastua="${e.id}" aria-label="Ezabatu">×</button></span></div>`;
  }).join('');
}

/* Gastu berria */
function gastuOrria(aurre = {}) {
  const gs = S.groups.filter(g => !g.archived);
  let hautatua = aurre.gid || null;
  irekiOrria(
    goiburua('Gastu berria') +
    `<label>Zenbatekoa<input id="g-zenb" class="handia" type="text" inputmode="decimal" placeholder="0,00" value="${zenbStr(aurre.amount)}"></label>
     <label>Izena<input id="g-izena" type="text" autocomplete="off" placeholder="Mercadona" value="${esc(aurre.name || '')}"></label>
     <div class="lbl">Taldea</div>
     <div class="txipak">${gs.map(g => `<button type="button" class="txipa${g.id === hautatua ? ' on' : ''}" data-gid="${g.id}">${g.icon} ${esc(g.name)}</button>`).join('')}</div>
     <label>Data<input id="g-data" type="date" value="${aurre.date || lehenetsitakoData()}"></label>
     <p class="errorea" id="g-err"></p>
     <button class="btn-nagusia" id="g-gorde">Gorde gastua</button>
     <div class="lbl" style="margin-top:16px">Hilabeteko azken gastuak</div>
     <div>${gastuZerrenda(() => true, 8)}</div>`,
    o => {
      o.querySelectorAll('.txipa').forEach(b => b.onclick = () => {
        hautatua = b.dataset.gid;
        o.querySelectorAll('.txipa').forEach(x => x.classList.toggle('on', x === b));
        errorea('#g-err', '');
      });
      $('#g-gorde').onclick = async () => {
        const amount = zenbakia($('#g-zenb').value);
        const date = $('#g-data').value || gaur();
        if (!(amount > 0)) return errorea('#g-err', 'Idatzi zenbateko zuzena.');
        if (!hautatua) return errorea('#g-err', 'Aukeratu talde bat.');
        const name = $('#g-izena').value.trim() || taldea(hautatua).name;
        S.expenses.push({ id: uid(), name, amount: round2(amount), date, gid: hautatua });
        await gorde();
        hil = hk(date);
        itxiOrria(); render(); toast('Gastua gordeta');
      };
    }
  );
}

/* Diru-sarrerak */
function sarrerakOrria(aurre = {}) {
  const l = hilekoSarrerak(hil).sort((a, b) => b.date.localeCompare(a.date));
  const zerr = l.length ? l.map(i => `<div class="lerroa"><span>${esc(i.name)}<small>${egunLab(i.date)}</small></span>
      <span>${eur(i.amount)}<button class="ezab" data-ezab-sarrera="${i.id}" aria-label="Ezabatu">×</button></span></div>`).join('')
    : '<p class="hutsa">Hilabete honetan ez dago diru-sarrerarik.</p>';
  const mm = Number(hil.slice(5)) - 1;
  irekiOrria(
    goiburua(`${HIL[mm][0].toUpperCase() + HIL[mm].slice(1).replace(/a$/, '')}ko diru-sarrerak`) +
    `<div style="margin-bottom:14px">${zerr}</div>
     <div class="lbl">Gehitu diru-sarrera</div>
     <label>Zenbatekoa<input id="s-zenb" class="handia" type="text" inputmode="decimal" placeholder="0,00" value="${zenbStr(aurre.amount)}"></label>
     <label>Izena<input id="s-izena" type="text" autocomplete="off" placeholder="Soldata" value="${esc(aurre.name || '')}"></label>
     <label>Data<input id="s-data" type="date" value="${lehenetsitakoData()}"></label>
     <p class="errorea" id="s-err"></p>
     <button class="btn-nagusia" id="s-gorde">Gehitu diru-sarrera</button>`,
    () => {
      $('#s-gorde').onclick = async () => {
        const amount = zenbakia($('#s-zenb').value);
        const date = $('#s-data').value || gaur();
        if (!(amount > 0)) return errorea('#s-err', 'Idatzi zenbateko zuzena.');
        S.incomes.push({ id: uid(), name: $('#s-izena').value.trim() || 'Diru-sarrera', amount: round2(amount), date });
        await gorde();
        hil = hk(date);
        render(); sarrerakOrria(); toast('Diru-sarrera gordeta');
      };
    }
  );
}

/* Grupo nuevo / editar */
function taldeOrria(g) {
  const berria = !g;
  let ikonoa = g ? g.icon : IKONOAK[7];
  irekiOrria(
    goiburua(berria ? 'Talde berria' : `${g.icon} ${esc(g.name)}`) +
    `<label>Izena<input id="t-izena" type="text" autocomplete="off" value="${g ? esc(g.name) : ''}" placeholder="Janaria"></label>
     <div class="lbl">Ikonoa</div>
     <div class="ikonoak">${IKONOAK.map(i => `<button type="button" class="ikonoa${i === ikonoa ? ' on' : ''}">${i}</button>`).join('')}</div>
     <label>Hileko aurreikusitako gastua<input id="t-aurr" type="text" inputmode="decimal" placeholder="0,00" value="${g ? zenbStr(aurreikusia(g, hil)) : ''}"></label>
     ${berria ? '' : `<label class="check"><input type="checkbox" id="t-hil"> ${hilIzena(hil)}rako bakarrik</label>`}
     <p class="errorea" id="t-err"></p>
     <button class="btn-nagusia" id="t-gorde">Gorde</button>
     ${berria ? '' : `<div class="lbl" style="margin-top:16px">Talde honetako gastuak (${hilIzena(hil)})</div>
       <div>${gastuZerrenda(e => e.gid === g.id)}</div>
       <button class="btn-arriskua" id="t-ezabatu">Taldea ezabatu</button>`}`,
    o => {
      o.querySelectorAll('.ikonoa').forEach(b => b.onclick = () => {
        ikonoa = b.textContent;
        o.querySelectorAll('.ikonoa').forEach(x => x.classList.toggle('on', x === b));
      });
      $('#t-gorde').onclick = async () => {
        const name = $('#t-izena').value.trim();
        const v = $('#t-aurr').value.trim() === '' ? 0 : zenbakia($('#t-aurr').value);
        if (!name) return errorea('#t-err', 'Idatzi izen bat.');
        if (isNaN(v) || v < 0) return errorea('#t-err', 'Idatzi zenbateko zuzena.');
        if (berria) {
          S.groups.push({ id: uid(), name, icon: ikonoa, planned: round2(v), color: KOLOREAK[S.groups.length % KOLOREAK.length], archived: false });
        } else {
          g.name = name; g.icon = ikonoa;
          if ($('#t-hil').checked) {
            (S.plans[hil] = S.plans[hil] || {})[g.id] = round2(v);
          } else {
            g.planned = round2(v);
            if (S.plans[hil]) delete S.plans[hil][g.id];
          }
        }
        await gorde(); itxiOrria(); render(); toast('Taldea gordeta');
      };
      const ez = $('#t-ezabatu');
      if (ez) ez.onclick = async () => {
        if (!confirm(`"${g.name}" taldea ezabatu? Lehengo gastuak ez dira ezabatuko.`)) return;
        g.archived = true;
        await gorde(); itxiOrria(); render(); toast('Taldea ezabatuta');
      };
    }
  );
}

/* Erregai-karga berria / editar */
function kargaOrria(r, aurre = {}) {
  const berria = !r;
  const d = r || aurre;
  const prezioStr = n => n > 0 ? zbk(n, 3).replace(/\./g, '') : '';
  const g = kotxeTaldea(false);
  irekiOrria(
    goiburua(berria ? 'Erregai-karga berria' : `Karga · ${egunLab(r.date)}`) +
    `<label>Data<input id="k-data" type="date" value="${d.date || lehenetsitakoData()}"></label>
     <div class="bi-zutabe">
       <label>Litroaren prezioa (€/L)<input id="k-prezioa-in" type="text" inputmode="decimal" placeholder="1,519" value="${prezioStr(d.price)}"></label>
       <label>Ordaindutakoa (€)<input id="k-ordaindua" class="handia" type="text" inputmode="decimal" placeholder="0,00" value="${zenbStr(d.paid)}"></label>
     </div>
     <label>Kilometro-kontagailua (km)<input id="k-odo" type="text" inputmode="numeric" placeholder="84320" value="${d.odo ? d.odo : ''}"></label>
     <div class="kalkulua" id="k-kalk"></div>
     <p class="lotura">🔗 Gastua hemen gehituko da: Aurrekontua › <b>${g ? `${g.icon} ${esc(g.name)}` : '🚗 Kotxea'}</b></p>
     <p class="errorea" id="k-err"></p>
     <button class="btn-nagusia" id="k-gorde">Gorde karga</button>
     ${berria ? '' : '<button class="btn-arriskua" id="k-ezabatu">Karga ezabatu</button>'}`,
    () => {
      const irakurri = () => ({
        date: $('#k-data').value || gaur(),
        price: zenbakia($('#k-prezioa-in').value),
        paid: zenbakia($('#k-ordaindua').value),
        odo: osoa($('#k-odo').value)
      });
      const kalkulatu = () => {
        const x = irakurri();
        const litroak = x.price > 0 && x.paid > 0 ? x.paid / x.price : null;
        const aurrekoa = x.odo > 0 ? S.refuels.filter(o => o.id !== (r && r.id) && o.odo < x.odo).sort((a, b) => b.odo - a.odo)[0] : null;
        const km = aurrekoa ? x.odo - aurrekoa.odo : null;
        const kons = litroak && km > 0 ? litroak / km * 100 : null;
        $('#k-kalk').innerHTML = `<div><span>Litroak</span><b>${litroak ? zbk(litroak, 2) + ' L' : '—'}</b></div>
          <div><span>Egindako km</span><b>${km ? zbk(km) + ' km' : '—'}</b></div>
          <div><span>Kontsumoa</span><b>${kons ? zbk(kons, 2) + ' L/100km' : (x.odo > 0 && !aurrekoa ? 'Lehen karga' : '—')}</b></div>`;
      };
      ['#k-data', '#k-prezioa-in', '#k-ordaindua', '#k-odo'].forEach(id => $(id).addEventListener('input', kalkulatu));
      kalkulatu();
      $('#k-gorde').onclick = async () => {
        const x = irakurri();
        const err = kargaErrorea(x, r && r.id);
        if (err) return errorea('#k-err', err);
        gordeKargaDatuak(r || { id: uid() }, { date: x.date, price: Math.round(x.price * 1000) / 1000, paid: round2(x.paid), odo: x.odo });
        await gorde();
        hil = hk(x.date);
        itxiOrria(); render(); toast(berria ? 'Karga gordeta' : 'Karga eguneratuta');
      };
      const ez = $('#k-ezabatu');
      if (ez) ez.onclick = async () => {
        if (!confirm('Karga hau ezabatu? Aurrekontuko gastua ere ezabatuko da.')) return;
        ezabatuKarga(r.id);
        await gorde(); itxiOrria(); render(); toast('Karga ezabatuta');
      };
    }
  );
}

/* Ajustes: instrucciones para Atajos, diagnóstico y copia de seguridad */
function ezarpenakOrria() {
  const irekiUrl = `webapp://${location.host}${location.pathname}`;
  const gs = S.groups.filter(g => !g.archived);
  const modua = (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? 'App instalatua' : 'Nabigatzailea';
  const hist = irekierak();
  const kg = kotxeTaldea(false);
  irekiOrria(
    goiburua('Ezarpenak') +
    `<div class="lbl">Atajoak</div>
     <div class="oharra">iOS-ek ez dio app-ari estekako daturik pasatzen. Horregatik, atajoak datuak <b>arbelean kopiatzen</b> ditu eta app-a irekitzen du. Gero, app-an <b>"📋 Itsatsi atajotik"</b> eta <b>"Pegar"</b> sakatu, eta gastua gordeta geratzen da.</div>
     <div class="esteka-lerroa"><span><b>App-a irekitzeko esteka</b><br><code>${esc(irekiUrl)}</code></span>
       <button class="kopiatu" data-kopiatu="${esc(irekiUrl)}">Kopiatu</button></div>
     <div class="esteka-lerroa"><span><b>Arbeleko testuaren formatua</b><br><code>NIREAPP|gastua|taldea|zenbatekoa|izena</code><br><code>NIREAPP|sarrera|zenbatekoa|izena</code><br><code>NIREAPP|karga|prezioa|ordaindua|km</code></span></div>
     <div class="lbl" style="margin-top:12px">Taldeen kodeak</div>
     ${gs.map(g => `<div class="esteka-lerroa"><span>${g.icon} ${esc(g.name)}</span>
        <span><code>${slug(g.name)}</code><button class="kopiatu" data-kopiatu="${slug(g.name)}">Kopiatu</button></span></div>`).join('')}
     <div class="lbl" style="margin-top:16px">Kotxe</div>
     <div class="hutsa" style="margin-top:0">Erregai-kargen gastuak talde honetara doaz (aurrerantzean):</div>
     <div class="txipak" id="e-kotxe">${gs.map(g => `<button type="button" class="txipa${kg && g.id === kg.id ? ' on' : ''}" data-kotxe-gid="${g.id}">${g.icon} ${esc(g.name)}</button>`).join('')}</div>
     <div class="lbl" style="margin-top:16px">Diagnostikoa</div>
     <div class="diag">Modua: ${modua}<br><b>Azken irekierak:</b><br>${hist.length ? hist.map(esc).join('<br>') : '—'}</div>
     <button class="btn-bigarren" id="e-itsatsi">Arbeletik itsatsi</button>
     <div class="lbl" style="margin-top:16px">Segurtasun-kopia</div>
     <button class="btn-bigarren" id="e-esportatu">Esportatu datuak (JSON)</button>
     <label class="btn-bigarren" style="color:var(--text);font-size:15px">Inportatu datuak<input id="e-inportatu" type="file" accept="application/json,.json" hidden></label>
     <p class="hutsa" style="text-align:center">Nire App-a · ${BERTSIOA} bertsioa</p>`,
    o => {
      o.querySelectorAll('[data-kotxe-gid]').forEach(b => b.onclick = async () => {
        S.settings.kotxeGid = b.dataset.kotxeGid;
        o.querySelectorAll('[data-kotxe-gid]').forEach(x => x.classList.toggle('on', x === b));
        await gorde(); render(); toast('Gordeta');
      });
      $('#e-itsatsi').onclick = itsatsi;
      $('#e-esportatu').onclick = esportatu;
      $('#e-inportatu').onchange = inportatu;
    }
  );
}

function itsatsiOrria() {
  irekiOrria(
    goiburua('Atajoko datuak') +
    `<p class="hutsa">Sakatu botoia eta gero "Pegar" iPhoneak eskatzen duenean.</p>
     <button class="btn-nagusia" id="i-itsatsi">Arbeletik itsatsi</button>`,
    () => { $('#i-itsatsi').onclick = itsatsi; }
  );
}

/* Formato del portapapeles: NIREAPP|gastua|<taldea>|<zenbatekoa>|<izena>  ·  NIREAPP|sarrera|<zenbatekoa>|<izena>
   Si los datos son completos se guardan directamente (con "Desegin" para deshacer);
   si falta algo (grupo desconocido, importe no válido) se abre la hoja rellena para completarlo. */
async function itsatsi() {
  ezkutatuPilula();
  let t = '';
  try { t = (await navigator.clipboard.readText()).trim(); } catch (e) { return toast('Ezin izan da arbela irakurri'); }
  const p = t.split('|').map(x => x.trim());
  if ((p[0] || '').toUpperCase() !== 'NIREAPP') return toast('Arbelean ez dago atajoko daturik');
  const mota = (p[1] || '').toLowerCase();

  if (mota === 'karga') {
    const x = { date: gaur(), price: zenbakia(p[2]), paid: zenbakia(p[3]), odo: osoa(p[4]) };
    if (atala !== 'kotxe') aldatuAtala('kotxe');
    if (kargaErrorea(x)) return kargaOrria(null, x);
    if (bikoiztua(t) && !confirm('Karga hau duela gutxi itsatsi duzu. Berriro gorde?')) return;
    const r = { id: uid() };
    gordeKargaDatuak(r, { date: x.date, price: Math.round(x.price * 1000) / 1000, paid: round2(x.paid), odo: x.odo });
    await gorde(); gogoratuItsatsia(t);
    hil = hk(x.date); render();
    toast(`Gordeta: ⛽ ${eur(r.paid)}`, 'Desegin', async () => {
      ezabatuKarga(r.id);
      await gorde(); render(); toast('Desegina');
    });
    return;
  }
  if (atala !== 'aurrekontua') aldatuAtala('aurrekontua');
  if (mota === 'gastua') {
    const g = taldeaSlug(p[2]), amount = zenbakia(p[3]), name = p[4] || '';
    if (!g || !(amount > 0)) return gastuOrria({ gid: g && g.id, amount, name });
    if (bikoiztua(t) && !confirm('Gastu hau duela gutxi itsatsi duzu. Berriro gorde?')) return;
    const e = { id: uid(), name: name || g.name, amount: round2(amount), date: gaur(), gid: g.id };
    S.expenses.push(e);
    await gorde(); gogoratuItsatsia(t);
    hil = hk(e.date); render();
    toast(`Gordeta: ${eur(e.amount)} · ${g.icon} ${g.name}`, 'Desegin', async () => {
      S.expenses = S.expenses.filter(x => x.id !== e.id);
      await gorde(); render(); toast('Desegina');
    });
  } else if (mota === 'sarrera') {
    const amount = zenbakia(p[2]), name = p[3] || 'Diru-sarrera';
    if (!(amount > 0)) return sarrerakOrria({ name });
    if (bikoiztua(t) && !confirm('Diru-sarrera hau duela gutxi itsatsi duzu. Berriro gorde?')) return;
    const i = { id: uid(), name, amount: round2(amount), date: gaur() };
    S.incomes.push(i);
    await gorde(); gogoratuItsatsia(t);
    hil = hk(i.date); render();
    toast(`Gordeta: ${eur(i.amount)} · ${name}`, 'Desegin', async () => {
      S.incomes = S.incomes.filter(x => x.id !== i.id);
      await gorde(); render(); toast('Desegina');
    });
  } else toast('Datu mota ezezaguna');
}

/* Evita guardar dos veces lo mismo si se pega el mismo texto en menos de 30 minutos */
function bikoiztua(t) {
  try {
    const a = JSON.parse(localStorage.getItem('azken-itsatsia') || 'null');
    return !!a && a.t === t && Date.now() - a.ts < 30 * 60 * 1000;
  } catch (e) { return false; }
}
function gogoratuItsatsia(t) {
  try { localStorage.setItem('azken-itsatsia', JSON.stringify({ t, ts: Date.now() })); } catch (e) { /* sin acceso */ }
}

/* Botón flotante "Itsatsi atajotik": aparece 20 s cada vez que se abre la app o vuelve a primer plano */
let pilulaTimer;
function erakutsiPilula() {
  if (!(navigator.clipboard && navigator.clipboard.readText)) return;
  $('#itsatsi-pilula').hidden = false;
  clearTimeout(pilulaTimer);
  pilulaTimer = setTimeout(ezkutatuPilula, 20000);
}
function ezkutatuPilula() { $('#itsatsi-pilula').hidden = true; clearTimeout(pilulaTimer); }

/* Enlaces, en dos formatos (iOS puede descartar uno de ellos):
   #gastu-berria?taldea=janaria&zenbatekoa=12.50&izena=Mercadona
   ?e=gastu-berria&taldea=janaria&zenbatekoa=12.50&izena=Mercadona
   Acciones: gastu-berria · diru-sarrera · itsatsi */
function kudeatuEsteka() {
  let ekintza, p;
  const h = location.hash.slice(1);
  const bilaketa = new URLSearchParams(location.search);
  if (h) {
    const [e, q] = h.split('?');
    ekintza = e; p = new URLSearchParams(q || '');
  } else if (bilaketa.has('e')) {
    ekintza = bilaketa.get('e'); p = bilaketa;
  } else return;
  history.replaceState(null, '', location.pathname);
  if (ekintza === 'gastu-berria') {
    gastuOrria({
      gid: (taldeaSlug(p.get('taldea')) || {}).id,
      amount: p.has('zenbatekoa') ? zenbakia(p.get('zenbatekoa')) : undefined,
      name: p.get('izena') || ''
    });
  } else if (ekintza === 'diru-sarrera') {
    sarrerakOrria({ amount: p.has('zenbatekoa') ? zenbakia(p.get('zenbatekoa')) : undefined, name: p.get('izena') || '' });
  } else if (ekintza === 'itsatsi') {
    itsatsiOrria();
  }
}

/* Diagnóstico: guarda las últimas 8 veces que la app se abrió o volvió a primer plano, con la dirección recibida */
function erregistratuIrekiera(mota) {
  try {
    const l = JSON.parse(localStorage.getItem('irekierak') || '[]');
    l.unshift(`${new Date().toLocaleTimeString('es-ES')} · ${mota} · ${location.href.replace(location.origin, '')}`);
    localStorage.setItem('irekierak', JSON.stringify(l.slice(0, 8)));
  } catch (e) { /* sin acceso */ }
}
function irekierak() {
  try { return JSON.parse(localStorage.getItem('irekierak') || '[]'); } catch (e) { return []; }
}

/* Copia de seguridad (de momento sin cifrar) */
function esportatu() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nire-app-a-${gaur()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function inportatu(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.groups) || !Array.isArray(d.expenses) || !Array.isArray(d.incomes)) throw new Error();
      if (!confirm('Datu guztiak fitxategiko datuekin ordeztu?')) return;
      S = osatu(Object.assign(hasierakoa(), d));
      await gorde(); itxiOrria(); render(); toast('Datuak inportatuta');
    } catch (e) { toast('Fitxategia ez da zuzena'); }
  };
  r.readAsText(f);
}

let toastTimer;
/* Aviso breve abajo; opcionalmente con un botón (p. ej. "Desegin") */
function toast(t, botoia, ekintza) {
  const el = $('#toast');
  el.textContent = t;
  if (botoia) {
    const b = document.createElement('button');
    b.textContent = botoia;
    b.onclick = () => { el.classList.remove('ikusi'); ekintza(); };
    el.appendChild(b);
  }
  el.classList.add('ikusi');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('ikusi'), botoia ? 6000 : 2200);
}

/* ---------- Eventos ---------- */
function lotuEkintzak() {
  $('#aurrekoa').onclick = () => { hil = mugitu(hil, -1); render(); };
  $('#hurrengoa').onclick = () => { hil = mugitu(hil, 1); render(); };
  $('#t-sarrerak').onclick = () => sarrerakOrria();
  $('#t-gastuak').onclick = () => gastuOrria();
  $('#fab').onclick = ekintzaNagusia;
  $('#gehitu-goian').onclick = ekintzaNagusia;
  $('#talde-berria').onclick = () => taldeOrria(null);
  $('#menua').onclick = menuaOrria;
  $('#orria .atzealdea').onclick = itxiOrria;

  document.addEventListener('click', async ev => {
    const t = ev.target;
    if (t.closest('[data-itxi]')) return itxiOrria();
    const at = t.closest('[data-atala]');
    if (at) { itxiOrria(); return aldatuAtala(at.dataset.atala); }
    if (t.closest('[data-ezarpenak]')) return ezarpenakOrria();
    const kb = t.closest('[data-karga]');
    if (kb) return kargaOrria(S.refuels.find(r => r.id === kb.dataset.karga));
    const tb = t.closest('[data-taldea]');
    if (tb) return taldeOrria(taldea(tb.dataset.taldea));
    const k = t.closest('[data-kopiatu]');
    if (k) {
      try { await navigator.clipboard.writeText(k.dataset.kopiatu); toast('Kopiatuta'); } catch (e) { toast('Ezin izan da kopiatu'); }
      return;
    }
    const eg = t.closest('[data-ezab-gastua]');
    if (eg) {
      const e = S.expenses.find(x => x.id === eg.dataset.ezabGastua);
      if (e && e.src === 'kotxe') {
        if (!confirm('Gastu hau Kotxe ataleko erregai-karga bati lotuta dago. Karga ere ezabatu?')) return;
        ezabatuKarga(e.rid);
      } else if (!confirm('Gastu hau ezabatu?')) return;
      S.expenses = S.expenses.filter(x => x.id !== eg.dataset.ezabGastua);
      await gorde(); eg.closest('.lerroa').remove(); render(); toast('Gastua ezabatuta');
      return;
    }
    const es = t.closest('[data-ezab-sarrera]');
    if (es) {
      if (!confirm('Diru-sarrera hau ezabatu?')) return;
      S.incomes = S.incomes.filter(i => i.id !== es.dataset.ezabSarrera);
      await gorde(); es.closest('.lerroa').remove(); render(); toast('Diru-sarrera ezabatuta');
    }
  });

  // Cerrar la hoja deslizando hacia abajo desde el asa o el título
  const x = $('.xafla');
  let y0 = null, dy = 0;
  x.addEventListener('touchstart', e => {
    if (!e.target.closest('.heldulekua, .orri-goiburua')) return;
    y0 = e.touches[0].clientY; dy = 0; x.style.transition = 'none';
  }, { passive: true });
  x.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    x.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  x.addEventListener('touchend', () => {
    if (y0 == null) return;
    x.style.transition = ''; x.style.transform = '';
    if (dy > 90) itxiOrria();
    y0 = null;
  });

  window.addEventListener('hashchange', () => { erregistratuIrekiera('hash'); kudeatuEsteka(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { erregistratuIrekiera('itzuli'); erakutsiPilula(); }
  });
  $('#itsatsi-pilula').onclick = itsatsi;
  window.addEventListener('pageshow', ev => { if (ev.persisted) { erregistratuIrekiera('pageshow'); kudeatuEsteka(); } });
}

/* ---------- Arranque ---------- */
(async function hasi() {
  erregistratuIrekiera('abiatu');
  try {
    S = await DB.lortu('egoera');
  } catch (e) {
    console.error(e);
  }
  if (!S) { S = hasierakoa(); await gorde().catch(() => {}); }
  osatu(S);
  if (!S.created) {
    const hilak = S.expenses.concat(S.incomes).map(x => hk(x.date)).sort();
    S.created = hilak[0] || hk(gaur());
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  lotuEkintzak();
  render();
  kudeatuEsteka();
  erakutsiPilula();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
