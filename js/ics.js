/* iCalendar (RFC 5545) generator — pure functions, no DOM */
const MM_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Stockholm', 'X-LIC-LOCATION:Europe/Stockholm',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets (UTF-8 safe). */
function icsFold(line) {
  const enc = (str) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str).length : Buffer.byteLength(str));
  if (enc(line) <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (enc(cur + ch) > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i ? ' ' + l : l)).join('\r\n');
}

function icsHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function icsLocal(dateStr, hm) {
  return dateStr.replace(/-/g, '') + 'T' + hm.replace(':', '') + '00';
}

function icsUtcStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * events: [{ date:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM' ('00:00' = midnight next day),
 *            id, title, description, url, category }]
 */
function mmBuildIcs(events, opts) {
  const o = opts || {};
  const stamp = icsUtcStamp(o.now || new Date());
  const addDay = (ds) => {
    const [y, m, d] = ds.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + 1));
    return x.toISOString().slice(0, 10);
  };
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mamba Mentality//Planner v2//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(o.calName || 'Mamba Mentality'),
    'X-WR-TIMEZONE:Europe/Stockholm',
    ...MM_VTIMEZONE
  ];
  events.forEach((ev) => {
    const endDate = ev.end <= ev.start ? addDay(ev.date) : ev.date; // 00:00 or wrap → next day
    const uid = `${ev.date.replace(/-/g, '')}-${ev.id}-${icsHash(ev.date + ev.id + ev.start)}@mamba-mentality.app`;
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid);
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART;TZID=Europe/Stockholm:' + icsLocal(ev.date, ev.start));
    lines.push('DTEND;TZID=Europe/Stockholm:' + icsLocal(endDate, ev.end));
    lines.push('SUMMARY:' + icsEscape(ev.title));
    if (ev.description) lines.push('DESCRIPTION:' + icsEscape(ev.description));
    if (ev.url) lines.push('URL:' + ev.url.replace(/[\r\n]/g, ''));
    if (ev.category) lines.push('CATEGORIES:' + icsEscape(ev.category));
    lines.push('TRANSP:' + (ev.transparent ? 'TRANSPARENT' : 'OPAQUE'));
    if (ev.alarmMin != null && ev.alarmMin >= 0) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY',
        'TRIGGER:' + (ev.alarmMin > 0 ? '-PT' + ev.alarmMin + 'M' : 'PT0M'),
        'DESCRIPTION:' + icsEscape(ev.alarmText || ev.title), 'END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

if (typeof module !== 'undefined') module.exports = { mmBuildIcs, icsFold, icsEscape };
