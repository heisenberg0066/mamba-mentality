/* Offline prayer-time calculation (PrayTimes.org algorithm, re-implemented). Pure, no DOM. */
const MM_PRAYER_METHODS = {
  MWL:     { name: 'Muslim World League', fajr: 18, isha: 17 },
  ISNA:    { name: 'ISNA (North America)', fajr: 15, isha: 15 },
  Egypt:   { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
  Makkah:  { name: 'Umm al-Qura, Makkah', fajr: 18.5, ishaMin: 90 },
  Karachi: { name: 'Univ. of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
  Tehran:  { name: 'Inst. of Geophysics, Tehran', fajr: 17.7, isha: 14, maghrib: 4.5 },
  Jafari:  { name: 'Shia Ithna-Ashari (Jafari)', fajr: 16, isha: 14, maghrib: 4 }
};
const MM_PRAYER_IDS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const MM_STOCKHOLM = { lat: 59.3293, lng: 18.0686, tz: 'Europe/Stockholm' };

const _d2r = (d) => (d * Math.PI) / 180, _r2d = (r) => (r * 180) / Math.PI;
const _sin = (d) => Math.sin(_d2r(d)), _cos = (d) => Math.cos(_d2r(d)), _tan = (d) => Math.tan(_d2r(d));
const _asin = (x) => _r2d(Math.asin(x)), _acos = (x) => _r2d(Math.acos(x)), _atan2 = (y, x) => _r2d(Math.atan2(y, x));
const _acot = (x) => _r2d(Math.atan(1 / x));
const _fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

function _julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function _sunPos(jd) {
  const D = jd - 2451545.0;
  const g = _fix(357.529 + 0.98560028 * D, 360), q = _fix(280.459 + 0.98564736 * D, 360);
  const L = _fix(q + 1.915 * _sin(g) + 0.020 * _sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = _atan2(_cos(e) * _sin(L), _cos(L)) / 15;
  return { decl: _asin(_sin(e) * _sin(L)), eqt: q / 15 - _fix(RA, 24) };
}

/**
 * Returns UTC hours (may be NaN before high-lat adjustment) → then Date objects.
 * opts: { method, asr: 'standard'|'hanafi', highLat: 'AngleBased'|'OneSeventh'|'NightMiddle'|'None', offsets: {fajr..isha minutes} }
 */
function mmComputePrayerTimes(dateStr, opts, loc) {
  const o = opts || {}; const L = loc || MM_STOCKHOLM;
  const m = MM_PRAYER_METHODS[o.method] || MM_PRAYER_METHODS.MWL;
  const asrFactor = o.asr === 'hanafi' ? 2 : 1;
  const hl = o.highLat || 'AngleBased';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const jDate = _julian(y, mo, d) - L.lng / (15 * 24);
  const lat = L.lat;
  const midDay = (t) => _fix(12 - _sunPos(jDate + t).eqt, 24);
  const angleTime = (angle, t, ccw) => {
    const decl = _sunPos(jDate + t).decl; const noon = midDay(t);
    const T = _acos((-_sin(angle) - _sin(decl) * _sin(lat)) / (_cos(decl) * _cos(lat))) / 15;
    return noon + (ccw ? -T : T);
  };
  const asrTime = (f, t) => { const decl = _sunPos(jDate + t).decl; return angleTime(-_acot(f + _tan(Math.abs(lat - decl))), t); };

  let tm = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    const p = (k) => (isNaN(tm[k]) ? { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 }[k] : tm[k]) / 24;
    tm = {
      fajr: angleTime(m.fajr, p('fajr'), true),
      sunrise: angleTime(0.833, p('sunrise'), true),
      dhuhr: midDay(p('dhuhr')),
      asr: asrTime(asrFactor, p('asr')),
      sunset: angleTime(0.833, p('sunset')),
      maghrib: m.maghrib ? angleTime(m.maghrib, p('maghrib')) : angleTime(0.833, p('maghrib')),
      isha: m.ishaMin ? NaN : angleTime(m.isha, p('isha'))
    };
  }
  // to UTC hours
  Object.keys(tm).forEach((k) => { tm[k] -= L.lng / 15; });
  if (m.ishaMin) tm.isha = tm.maghrib + m.ishaMin / 60;

  // high-latitude adjustment
  const night = _fix(tm.sunrise - tm.sunset, 24);
  const portion = (angle) => (hl === 'AngleBased' ? angle / 60 : hl === 'OneSeventh' ? 1 / 7 : 0.5) * night;
  if (hl !== 'None') {
    const fp = portion(m.fajr);
    const fd = _fix(tm.sunrise - tm.fajr, 24);
    if (isNaN(tm.fajr) || fd > fp) tm.fajr = tm.sunrise - fp;
    if (!m.ishaMin) {
      const ip = portion(m.isha);
      const id = _fix(tm.isha - tm.sunset, 24);
      if (isNaN(tm.isha) || id > ip) tm.isha = tm.sunset + ip;
    }
  }
  const off = o.offsets || {};
  const base = Date.UTC(y, mo - 1, d);
  const out = {};
  ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((k) => {
    if (isNaN(tm[k])) { out[k] = null; return; }
    out[k] = new Date(base + Math.round((tm[k] * 60 + (Number(off[k]) || 0)) * 60000));
  });
  return out;
}

const _mmTzFmt = {};
function mmLocalHM(date, tz) {
  if (!date) return null;
  const z = tz || MM_STOCKHOLM.tz;
  _mmTzFmt[z] = _mmTzFmt[z] || new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return _mmTzFmt[z].format(new Date(date.getTime() + 30000)); // round to nearest minute
}
/** [{id, time:'HH:MM'}] for the 5 daily prayers, local Stockholm time. */
function mmPrayerList(dateStr, opts) {
  const r = mmComputePrayerTimes(dateStr, opts);
  return MM_PRAYER_IDS.map((id) => ({ id, key: 'prayer' + id[0].toUpperCase() + id.slice(1), time: mmLocalHM(r[id]) })).filter((p) => p.time);
}
if (typeof module !== 'undefined') module.exports = { mmComputePrayerTimes, mmPrayerList, mmLocalHM, MM_PRAYER_METHODS };
