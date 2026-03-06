import { useState, useMemo, useEffect, useCallback } from "react";


// ── PostHog config ───────────────────────────────────────────────────────────
// PostHog proxy via Cloudflare Worker (handles auth server-side)
const PH_WORKER_URL = "https://muddy-shape-ae45.theo-f92.workers.dev/";



// Route a raw [date, url, count] row into the correct partner bucket
function routeRow(url, partnerKeys, partnerConfig) {
  if (!url) return null; // unattributed — no URL to route by
  for (const pk of partnerKeys) {
    if (url.includes(partnerConfig[pk].urlPattern)) return pk;
  }
  return null;
}

// Parse PostHog query results into per-partner lp_url arrays
// Returns { sisc: [[date, url, count], ...], rrd: [...], ... }
function parsePhResults(results, partnerKeys, partnerConfig) {
  const out = {};
  partnerKeys.forEach(pk => { out[pk] = []; });
  (results || []).forEach(([date, url, count]) => {
    const pk = routeRow(url, partnerKeys, partnerConfig);
    if (pk) out[pk].push([date, url || "", Number(count)]);
  });
  return out;
}

// ── Partner configuration ────────────────────────────────────────────────────
// Each partner defines:
//   label        : display name
//   urlPattern   : path segment used to filter valid LP URLs
//   utmSource    : expected utm_source value(s) for this partner
const PARTNER_CONFIG = {
  sisc: {
    label: "SISC",
    urlPattern: "/partner/sisc",
    utmSources: ["sisc", "sisc_2"],
    channelRules: (med, camp, yr) => {
      if (yr >= 2025) {
        if (med === "airbo_1") return "Airbo 1";
        if (med === "airbo") return "Airbo";
        if (med === "dm_0") return "DM 0";
        if (med === "dm_1a") return "DM 1a";
        if (med === "dm_1b") return "DM 1b";
        if (med === "dm_1") return "DM 1";
        if (med === "dm_2") return "DM 2";
        if (med === "email_1NOR" || med === "email_1nor") return "Email 1 NOR";
        if (med === "email_1") return "Email 1";
        if (med === "email_2") return "Email 2";
        if (med === "email_3") return "Email 3";
        if (med === "ooh") return "OOH";
        if (med === "webinar") return "Webinar";
        if (med === "onsite" || med === "flyer") return "Onsite";
        if (med === "vendor") return "Vendor";
        if (med === "email" && camp === "benefits_preso") return "Email BenPreso";
        if (med === "email") return "Email (legacy)";
        if (med === "direct_mail") return "Direct Mail (legacy)";
        if (med === "print") return "Print";
      }
      if (yr === 2024) {
        if (med === "email") return "Email";
        if (med === "direct_mail" && camp === "teaser") return "DM Teaser";
        if (med === "direct_mail") return "DM Launch";
        if (med === "onsite" || med === "flyer") return "Onsite";
        if (med === "vendor") return "Vendor";
        if (med === "print") return "Print";
      }
      return null;
    },
    utmPatterns: {
      "sched:Airbo":                { top: "utm_source=sisc_2&utm_medium=airbo", extras: 2 },
      "sched:Airbo 1":              { top: "utm_source=sisc_2&utm_medium=airbo_1&utm_campaign=general", extras: 0 },
      "sched:DM 0":                 { top: "utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general", extras: 0 },
      "sched:DM 1a":                { top: "utm_source=sisc_2&utm_medium=dm_1a&utm_campaign=general", extras: 0 },
      "sched:DM 2":                 { top: "utm_source=sisc_2&utm_medium=dm_2&utm_campaign=general", extras: 0 },
      "sched:DM Launch":            { top: "utm_source=sisc&utm_medium=direct_mail&utm_campaign=launch", extras: 0 },
      "sched:DM Teaser":            { top: "utm_source=sisc&utm_medium=direct_mail&utm_campaign=teaser", extras: 0 },
      "sched:Direct Mail (legacy)": { top: "utm_source=sisc&utm_medium=direct_mail&utm_campaign=launch", extras: 1 },
      "sched:Email":                { top: "utm_source=sisc&utm_medium=email&utm_campaign=launch", extras: 0 },
      "sched:Email (legacy)":       { top: "utm_source=sisc&utm_medium=email&utm_campaign=launch", extras: 0 },
      "sched:Email 1":              { top: "utm_source=sisc_2&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "sched:Email 1 NOR":          { top: "utm_source=sisc_2&utm_medium=email_1NOR&utm_campaign=general", extras: 0 },
      "sched:Email 2":              { top: "utm_source=sisc_2&utm_medium=email_2&utm_campaign=targeted", extras: 0 },
      "sched:Email 3":              { top: "utm_source=sisc_2&utm_medium=email_3&utm_campaign=general", extras: 0 },
      "sched:OOH":                  { top: "utm_source=sisc_2&utm_medium=ooh", extras: 0 },
      "sched:Onsite":               { top: "utm_source=sisc&utm_medium=onsite&utm_campaign=launch", extras: 1 },
      "sched:Print":                { top: "utm_source=sisc&utm_medium=print&utm_campaign=launch", extras: 0 },
      "sched:Webinar":              { top: "utm_source=sisc&utm_medium=webinar&utm_campaign=launch", extras: 0 },
      "comp:Airbo":                 { top: "utm_source=sisc_2&utm_medium=airbo", extras: 1 },
      "comp:Airbo 1":               { top: "utm_source=sisc_2&utm_medium=airbo_1&utm_campaign=general", extras: 0 },
      "comp:DM 0":                  { top: "utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general", extras: 0 },
      "comp:DM 1a":                 { top: "utm_source=sisc_2&utm_medium=dm_1a&utm_campaign=general", extras: 0 },
      "comp:DM Launch":             { top: "utm_source=sisc&utm_medium=direct_mail&utm_campaign=launch", extras: 0 },
      "comp:DM Teaser":             { top: "utm_source=sisc&utm_medium=direct_mail&utm_campaign=teaser", extras: 0 },
      "comp:Direct Mail (legacy)":  { top: "utm_source=sisc&utm_medium=direct_mail&utm_campaign=launch", extras: 1 },
      "comp:Email":                 { top: "utm_source=sisc&utm_medium=email&utm_campaign=launch", extras: 0 },
      "comp:Email (legacy)":        { top: "utm_source=sisc&utm_medium=email&utm_campaign=launch", extras: 0 },
      "comp:Email 1":               { top: "utm_source=sisc_2&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "comp:Email 1 NOR":           { top: "utm_source=sisc_2&utm_medium=email_1NOR&utm_campaign=general", extras: 0 },
      "comp:Email 2":               { top: "utm_source=sisc_2&utm_medium=email_2&utm_campaign=targeted", extras: 0 },
      "comp:OOH":                   { top: "utm_source=sisc_2&utm_medium=ooh", extras: 0 },
      "comp:Onsite":                { top: "utm_source=sisc&utm_medium=onsite&utm_campaign=launch", extras: 1 },
      "comp:Webinar":               { top: "utm_source=sisc&utm_medium=webinar&utm_campaign=launch", extras: 0 },
    },
  },

  rrd: {
    label: "RRD",
    urlPattern: "/partner/rrd",
    utmSources: ["rrd_1"],
    channelRules: (med, camp, yr) => {
      if (med === "dm_1a") return "DM 1a";
      if (med === "dm_1b") return "DM 1b";
      if (med === "dm_2")  return "DM 2";
      if (med === "dm_3")  return "DM 3";
      if (med === "email_0") return "Email 0";
      if (med === "email_1") return "Email 1";
      if (med === "email_2") return "Email 2";
      if (med === "email_3") return "Email 3";
      if (med === "email_4") return "Email 4";
      return null;
    },
    utmPatterns: {
      "sched:DM 1a":   { top: "utm_source=rrd_1&utm_medium=dm_1a&utm_campaign=general", extras: 0 },
      "sched:DM 1b":   { top: "utm_source=rrd_1&utm_medium=dm_1b&utm_campaign=general", extras: 0 },
      "sched:DM 2":    { top: "utm_source=rrd_1&utm_medium=dm_2&utm_campaign=general", extras: 0 },
      "sched:DM 3":    { top: "utm_source=rrd_1&utm_medium=dm_3&utm_campaign=targeted", extras: 0 },
      "sched:Email 0": { top: "utm_source=rrd_1&utm_medium=email_0&utm_campaign=targeted", extras: 0 },
      "sched:Email 1": { top: "utm_source=rrd_1&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "sched:Email 2": { top: "utm_source=rrd_1&utm_medium=email_2&utm_campaign=targeted", extras: 0 },
      "sched:Email 3": { top: "utm_source=rrd_1&utm_medium=email_3&utm_campaign=general", extras: 0 },
      "sched:Email 4": { top: "utm_source=rrd_1&utm_medium=email_4&utm_campaign=targeted", extras: 0 },
      "comp:DM 1a":    { top: "utm_source=rrd_1&utm_medium=dm_1a&utm_campaign=general", extras: 0 },
      "comp:DM 1b":    { top: "utm_source=rrd_1&utm_medium=dm_1b&utm_campaign=general", extras: 0 },
      "comp:DM 2":     { top: "utm_source=rrd_1&utm_medium=dm_2&utm_campaign=general", extras: 0 },
      "comp:DM 3":     { top: "utm_source=rrd_1&utm_medium=dm_3&utm_campaign=targeted", extras: 0 },
      "comp:Email 0":  { top: "utm_source=rrd_1&utm_medium=email_0&utm_campaign=targeted", extras: 0 },
      "comp:Email 1":  { top: "utm_source=rrd_1&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "comp:Email 2":  { top: "utm_source=rrd_1&utm_medium=email_2&utm_campaign=targeted", extras: 0 },
    },
  },

  momentum: {
    label: "Momentum",
    urlPattern: "/partner/momentum",
    utmSources: ["momentum", "momentum_1", "momentum_2"],
    channelRules: (med, camp, yr) => {
      if (med === "dm_1a") return "DM 1a";
      if (med === "dm_1b") return "DM 1b";
      if (med === "dm_1")  return "DM 1";
      if (med === "direct_mail") {
        const c = camp || "";
        const content = "";  // utm_content not available in channelRules sig — use camp
        return "Direct Mail";
      }
      if (med === "email_1") return "Email 1";
      if (med === "email_2") return "Email 2";
      if (med === "email")   return "Email";
      if (med === "oe")      return "OE";
      return null;
    },
    utmPatterns: {
      "sched:DM 1a":     { top: "utm_source=momentum_2&utm_medium=dm_1a&utm_campaign=general", extras: 0 },
      "sched:DM 1b":     { top: "utm_source=momentum_2&utm_medium=dm_1b&utm_campaign=general", extras: 0 },
      "sched:DM 1":      { top: "utm_source=momentum_2&utm_medium=dm_1&utm_campaign=general", extras: 0 },
      "sched:Direct Mail": { top: "utm_source=momentum&utm_medium=direct_mail&utm_campaign=launch", extras: 1 },
      "sched:Email 1":   { top: "utm_source=momentum_2&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "sched:Email 2":   { top: "utm_source=momentum_2&utm_medium=email_2&utm_campaign=general", extras: 0 },
      "sched:Email":     { top: "utm_source=momentum&utm_medium=email&utm_campaign=launch", extras: 1 },
      "sched:OE":        { top: "utm_source=momentum_1&utm_medium=oe", extras: 0 },
      "comp:DM 1a":      { top: "utm_source=momentum_2&utm_medium=dm_1a&utm_campaign=general", extras: 0 },
      "comp:DM 1b":      { top: "utm_source=momentum_2&utm_medium=dm_1b&utm_campaign=general", extras: 0 },
      "comp:DM 1":       { top: "utm_source=momentum_2&utm_medium=dm_1&utm_campaign=general", extras: 0 },
      "comp:Direct Mail": { top: "utm_source=momentum&utm_medium=direct_mail&utm_campaign=launch", extras: 1 },
      "comp:Email 1":    { top: "utm_source=momentum_2&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "comp:Email":      { top: "utm_source=momentum&utm_medium=email&utm_campaign=launch", extras: 1 },
    },
  },

  hp: {
    label: "HP",
    urlPattern: "/partner/hp",
    utmSources: ["hp", "hp_2", "alight"],
    channelRules: (med, camp, yr, src) => {
      // Alight banner (src=alight, any medium)
      if (src === "alight") return "Alight Banner";
      // hp_2 style (newer campaign naming)
      if (med === "email_1") return "Email 1";
      if (med === "email_2") return "Email 2";
      if (med === "email_3") return "Email 3";
      if (med === "email_4") return "Email 4";
      if (med === "email_5") return "Email 5";
      if (med === "email_6") return "Email 6";
      if (med === "email_7") return "Email 7";
      if (med === "email_8") return "Email 8";
      // hp legacy style
      if (med === "email" && camp === "teaser") return "Email 0";
      if (med === "email")       return "Email";
      if (med === "direct_mail") return "Direct Mail";
      if (med === "webinar")     return "Webinar";
      if (med === "banner")      return "Alight Banner";
      return null;
    },
    utmPatterns: {
      "sched:Email 1":      { top: "utm_source=hp_2&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "sched:Email":        { top: "utm_source=hp&utm_medium=email&utm_campaign=launch", extras: 3 },
      "sched:Email 0":      { top: "utm_source=hp&utm_medium=email&utm_campaign=teaser", extras: 0 },
      "sched:Direct Mail":  { top: "utm_source=hp&utm_medium=direct_mail&utm_campaign=launch", extras: 4 },
      "sched:Webinar":      { top: "utm_source=hp&utm_medium=webinar&utm_campaign=launch", extras: 0 },
      "sched:Alight Banner":{ top: "utm_source=alight&utm_medium=banner", extras: 0 },
      "comp:Email 1":       { top: "utm_source=hp_2&utm_medium=email_1&utm_campaign=general", extras: 0 },
      "comp:Email":         { top: "utm_source=hp&utm_medium=email&utm_campaign=launch", extras: 3 },
      "comp:Email 0":       { top: "utm_source=hp&utm_medium=email&utm_campaign=teaser", extras: 0 },
      "comp:Direct Mail":   { top: "utm_source=hp&utm_medium=direct_mail&utm_campaign=launch", extras: 4 },
      "comp:Webinar":       { top: "utm_source=hp&utm_medium=webinar&utm_campaign=launch", extras: 0 },
      "comp:Alight Banner": { top: "utm_source=alight&utm_medium=banner", extras: 0 },
    },
  },
};

const PARTNER_KEYS = Object.keys(PARTNER_CONFIG);



// ── Channel extraction from clean URL ────────────────────────────────────────
// Returns: 'DM' | 'Email' | 'Airbo' | 'Webinar' | 'Onsite' | 'Other'
function channelFromUrl(cleanedUrl) {
  if (!cleanedUrl || cleanedUrl === 'Unattributed') return 'Other';
  try {
    const qs = cleanedUrl.includes('?') ? cleanedUrl.split('?')[1] : '';
    const p = new URLSearchParams(qs);
    const med = (p.get('utm_medium') || '').toLowerCase();
    if (med.startsWith('dm') || med.startsWith('direct_mail')) return 'DM';
    if (med.startsWith('email')) return 'Email';
    if (med.startsWith('airbo')) return 'Airbo';
    if (med === 'webinar') return 'Webinar';
    if (med === 'onsite' || med === 'flyer') return 'Onsite';
    if (med === 'ooh') return 'OOH';
    if (med === 'print') return 'Print';
    return 'Other';
  } catch { return 'Other'; }
}

// ── Clean URL: strip vgo_ee and noise, keep path + utm_* params only ────────
function cleanUrl(raw) {
  if (!raw) return "Unattributed";
  try {
    const urlObj = new URL(raw.startsWith("http") ? raw : "https://x.com" + raw);
    const utmParams = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
    const kept = utmParams.filter(k => urlObj.searchParams.get(k))
                          .map(k => `${k}=${urlObj.searchParams.get(k)}`);
    return kept.length > 0
      ? urlObj.pathname + "?" + kept.join("&")
      : "Unattributed";
  } catch { return "Unattributed"; }
}

// ── Build touchpoints ────────────────────────────────────────────────────────
// Groups by CLEAN URL (one row per distinct URL after stripping noise params).
// urlRows: [date, raw_url, count]  — all sources now use this format
// launchDates: map of cleanUrl -> earliest LP visit date for that URL
function buildTouchpoints(urlRows, yr, launchDates) {
  // First pass: bucket all rows by cleanUrl regardless of year
  const all = {};
  (urlRows || []).forEach(([ds, url, n]) => {
    const key = cleanUrl(url);
    if (!all[key]) all[key] = {};
    all[key][ds] = (all[key][ds] || 0) + n;
  });

  // Determine launch date per URL, then filter to only URLs whose launch year matches yr
  const m = {};
  Object.entries(all).forEach(([urlKey, dm]) => {
    const dates = Object.keys(dm).sort();
    const ld = (launchDates && launchDates[urlKey]) || dates[0];
    if (parseInt(ld.slice(0, 4), 10) !== yr) return; // filter by launch year
    m[urlKey] = { dm, ld };
  });

  return Object.entries(m).map(([urlKey, { dm, ld }]) => {
    const dates = Object.keys(dm).sort();
    const L = new Date(ld + "T00:00:00");
    const tot = Object.values(dm).reduce((a, b) => a + b, 0);
    const daily = [];
    dates.forEach(ds => {
      const i = Math.round((new Date(ds + "T00:00:00") - L) / 864e5);
      if (i >= 0) daily[i] = (daily[i] || 0) + dm[ds];
    });
    for (let i = 0; i < daily.length; i++) if (!daily[i]) daily[i] = 0;
    let c = 0;
    const crv = daily.map(v => { c += v; return { d: v, c, p: +(c / tot * 100).toFixed(1) }; });
    const wk = [];
    for (let w = 0; w * 7 < crv.length; w++) {
      const sl = crv.slice(w * 7, (w + 1) * 7);
      const e = sl.reduce((a, d) => a + d.d, 0), last = sl[sl.length - 1];
      wk.push({ week: w + 1, e, c: last.c, p: last.p });
    }
    const f = t => { const r = wk.find(w => w.p >= t); return r ? r.week : null; };
    const channel = channelFromUrl(urlKey);
    return { name: urlKey, url: urlKey, yr, ld, tot, crv, wk, w50: f(50), w80: f(80), w90: f(90), channel };
  }).sort((a, b) => b.tot - a.tot);
}

// ── Simplified channel bucket: DM / Email / Airbo / Other ────────────────────
function simplifyChannel(ch) {
  if (ch === "DM") return "DM";
  if (ch === "Email") return "Email";
  if (ch === "Airbo") return "Airbo";
  return "Other";
}

// ── Build channel-level heatmap rows (weighted average approach) ─────────────
// For each channel, computes each URL's individual wk-by-wk % distribution,
// then takes a weighted average across all URLs weighted by enrollment count.
// This gives "typical enrollment velocity for this channel" independent of
// launch sequencing between touchpoints.
// launchDates: cleanUrl -> "YYYY-MM-DD"
function buildChannelHeatmap(urlRows, yr, launchDates) {
  // Step 1: bucket all data by (channel, cleanUrl)
  const byChannelUrl = {};
  (urlRows || []).forEach(([ds, url, n]) => {
    if (parseInt(ds.slice(0, 4), 10) !== yr) return;
    const cu = cleanUrl(url);
    const ch = simplifyChannel(channelFromUrl(cu));
    const key = ch + "||" + cu;
    if (!byChannelUrl[key]) byChannelUrl[key] = { ch, cu, dates: {} };
    byChannelUrl[key].dates[ds] = (byChannelUrl[key].dates[ds] || 0) + n;
  });

  // Step 2: for each (channel, url), build its individual week distribution
  // using the same logic as buildTouchpoints
  const urlCurves = Object.values(byChannelUrl).map(({ ch, cu, dates }) => {
    const allDates = Object.keys(dates).sort();
    if (!allDates.length) return null;
    // Use LP launch date if available in this year, else earliest activity date
    let ld = launchDates?.[cu];
    if (!ld || parseInt(ld.slice(0, 4), 10) !== yr) ld = allDates[0];
    const L = new Date(ld + "T00:00:00");
    const tot = Object.values(dates).reduce((a, b) => a + b, 0);
    const daily = [];
    allDates.forEach(ds => {
      const i = Math.round((new Date(ds + "T00:00:00") - L) / 864e5);
      if (i >= 0) daily[i] = (daily[i] || 0) + dates[ds];
    });
    for (let i = 0; i < daily.length; i++) if (!daily[i]) daily[i] = 0;
    let c = 0;
    const crv = daily.map(v => { c += v; return { d: v, c, p: +(c / tot * 100).toFixed(1) }; });
    const wk = [];
    for (let w = 0; w * 7 < crv.length; w++) {
      const sl = crv.slice(w * 7, (w + 1) * 7);
      const e = sl.reduce((a, d) => a + d.d, 0), last = sl[sl.length - 1];
      wk.push({ week: w + 1, e, c: last.c, p: last.p });
    }
    return { ch, cu, ld, tot, wk };
  }).filter(Boolean);

  // Step 3: group URL curves by channel, then compute weighted average wk distribution
  const byChannel = {};
  urlCurves.forEach(u => {
    if (!byChannel[u.ch]) byChannel[u.ch] = { urls: [], tot: 0, earliestLd: u.ld };
    byChannel[u.ch].urls.push(u);
    byChannel[u.ch].tot += u.tot;
    if (u.ld < byChannel[u.ch].earliestLd) byChannel[u.ch].earliestLd = u.ld;
  });

  return Object.entries(byChannel).map(([ch, { urls, tot, earliestLd }]) => {
    // Find max weeks across all URLs
    const maxWk = Math.max(...urls.map(u => u.wk.length));
    // Weighted average: for each week slot, sum(url_weekly_count) / channel_total
    // This gives the true average % of channel total arriving in each week
    const wk = Array.from({ length: maxWk }, (_, i) => {
      const e = urls.reduce((sum, u) => sum + (u.wk[i] ? u.wk[i].e : 0), 0);
      return { week: i + 1, e };
    });
    // Compute cumulative % from the aggregated weekly counts
    let c = 0;
    wk.forEach(w => { c += w.e; w.c = c; w.p = +(c / tot * 100).toFixed(1); });
    return { channel: ch, label: ch, ld: earliestLd, tot, wk };
  }).filter(Boolean).sort((a, b) => b.tot - a.tot);
}

// ── Placeholder data ─────────────────────────────────────────────────────────
// Structure: PARTNER_DATA[partnerKey][source] = rows
// source is "lp" | "lp_url" | "sched" | "comp"
// "lp"     : [date, channel, count]  — pre-aggregated LP visits
// "lp_url" : [date, url, count]      — raw URL LP visits (2026+ preferred format)
// "sched"  : [date, channel, count]
// "comp"   : [date, channel, count]

// Placeholder data — all in [date, url, count] format matching live PostHog shape
// Replaced by live PostHog data on fetch; shown while loading or on error
const PARTNER_DATA = {
  sisc: {
    lp_url:    [
      ["2026-01-20","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general",25],
      ["2026-01-22","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=airbo_1&utm_campaign=general",8],
      ["2026-02-03","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=email_1&utm_campaign=general",45],
      ["2026-02-10","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_1a&utm_campaign=general",60],
      ["2026-02-17","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=email_1NOR&utm_campaign=general",20],
    ],
    sched_url: [
      ["2026-01-22","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general",12],
      ["2026-01-27","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general",9],
      ["2026-02-03","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=email_1&utm_campaign=general",8],
      ["2026-02-10","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_1a&utm_campaign=general",15],
      ["2026-02-17","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=email_1NOR&utm_campaign=general",6],
    ],
    comp_url:  [
      ["2026-01-28","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general",5],
      ["2026-02-09","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_0&utm_campaign=general",16],
      ["2026-02-17","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=email_1&utm_campaign=general",9],
      ["2026-02-24","https://www.welltheory.com/partner/sisc?utm_source=sisc_2&utm_medium=dm_1a&utm_campaign=general",6],
    ],
  },
  rrd: {
    lp_url:    [
      ["2026-02-01","https://www.welltheory.com/partner/rrd?utm_source=rrd_1&utm_medium=email_1&utm_campaign=general",30],
      ["2026-02-08","https://www.welltheory.com/partner/rrd?utm_source=rrd_1&utm_medium=dm_1a&utm_campaign=general",40],
    ],
    sched_url: [
      ["2026-02-03","https://www.welltheory.com/partner/rrd?utm_source=rrd_1&utm_medium=email_1&utm_campaign=general",10],
      ["2026-02-10","https://www.welltheory.com/partner/rrd?utm_source=rrd_1&utm_medium=dm_1a&utm_campaign=general",18],
    ],
    comp_url:  [
      ["2026-02-10","https://www.welltheory.com/partner/rrd?utm_source=rrd_1&utm_medium=email_1&utm_campaign=general",6],
      ["2026-02-17","https://www.welltheory.com/partner/rrd?utm_source=rrd_1&utm_medium=dm_1a&utm_campaign=general",12],
    ],
  },
  momentum: {
    lp_url:    [
      ["2026-02-05","https://www.welltheory.com/partner/momentum?utm_source=momentum_2&utm_medium=dm_1&utm_campaign=general",35],
      ["2026-02-12","https://www.welltheory.com/partner/momentum?utm_source=momentum&utm_medium=email&utm_campaign=launch&utm_content=email_3",10],
    ],
    sched_url: [
      ["2026-02-07","https://www.welltheory.com/partner/momentum?utm_source=momentum_2&utm_medium=dm_1&utm_campaign=general",14],
      ["2026-02-14","https://www.welltheory.com/partner/momentum?utm_source=momentum&utm_medium=email&utm_campaign=launch&utm_content=email_3",4],
    ],
    comp_url:  [
      ["2026-02-14","https://www.welltheory.com/partner/momentum?utm_source=momentum_2&utm_medium=dm_1&utm_campaign=general",9],
      ["2026-02-21","https://www.welltheory.com/partner/momentum?utm_source=momentum&utm_medium=email&utm_campaign=launch&utm_content=email_3",3],
    ],
  },
  hp: {
    lp_url:    [
      ["2026-02-10","https://www.welltheory.com/partner/hp?utm_source=hp&utm_medium=direct_mail&utm_campaign=launch&utm_content=ellen_letter_1",50],
      ["2026-02-10","https://www.welltheory.com/partner/hp?utm_source=alight&utm_medium=banner",25],
      ["2026-02-17","https://www.welltheory.com/partner/hp?utm_source=hp&utm_medium=email&utm_campaign=launch&utm_content=email_1",15],
    ],
    sched_url: [
      ["2026-02-12","https://www.welltheory.com/partner/hp?utm_source=hp&utm_medium=direct_mail&utm_campaign=launch&utm_content=ellen_letter_1",20],
      ["2026-02-12","https://www.welltheory.com/partner/hp?utm_source=alight&utm_medium=banner",8],
      ["2026-02-19","https://www.welltheory.com/partner/hp?utm_source=hp&utm_medium=email&utm_campaign=launch&utm_content=email_1",6],
    ],
    comp_url:  [
      ["2026-02-19","https://www.welltheory.com/partner/hp?utm_source=hp&utm_medium=direct_mail&utm_campaign=launch&utm_content=ellen_letter_1",14],
      ["2026-02-19","https://www.welltheory.com/partner/hp?utm_source=alight&utm_medium=banner",5],
      ["2026-02-26","https://www.welltheory.com/partner/hp?utm_source=hp&utm_medium=email&utm_campaign=launch&utm_content=email_1",4],
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getLaunchDates(partnerKey, data = PARTNER_DATA) {
  const data2 = data[partnerKey];
  if (!data2) return {};
  const m = {};
  // Key by cleanUrl so launch date anchor matches the URL-grouped touchpoints
  const process = (ds, url) => {
    const key = cleanUrl(url);
    if (!m[key] || ds < m[key]) m[key] = ds;
  };
  // lp_url has raw URLs — use directly
  (data2.lp_url || []).forEach(([ds, url]) => process(ds, url));
  // lp pre-agg rows have no URL — skip (can't anchor by URL without one)
  return m;
}



// ── Component ────────────────────────────────────────────────────────────────
export default function App() {
  const [partner, setPartner] = useState("sisc");
  const [yr, setYr] = useState(2025);
  const [source, setSource] = useState("sched");

  // phData mirrors PARTNER_DATA shape but lp_url is overwritten by PostHog live data
  const [phData, setPhData] = useState(PARTNER_DATA);
  const [phStatus, setPhStatus] = useState("idle"); // "idle" | "loading" | "ok" | "error"

  // ── Storage adapter ─────────────────────────────────────────────────────────
  // Swap load()/save() when going team-wide (Supabase, Vercel KV, etc.)
  // Async interface is backend-ready from day one.
  const OVERRIDES_KEY = "wt:launchDateOverrides";
  const storage = useMemo(() => ({
    async load(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    async save(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { console.error("Storage save failed:", e); }
    },
  }), []);

  // User-editable launch date overrides: { [cleanUrl]: "YYYY-MM-DD" }
  const [launchDateOverrides, setLaunchDateOverrides] = useState({});
  // Inline edit state
  const [editingUrl, setEditingUrl] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Load persisted overrides on mount
  useEffect(() => {
    storage.load(OVERRIDES_KEY).then(parsed => {
      if (parsed && typeof parsed === "object") setLaunchDateOverrides(parsed);
    });
  }, [storage]);

  const updateOverrides = useCallback((updater) => {
    setLaunchDateOverrides(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      storage.save(OVERRIDES_KEY, next);
      return next;
    });
  }, [storage]);

  const fetchFromPostHog = useCallback(async () => {
    setPhStatus("loading");
    try {
      // Fire all three queries in parallel
      const fetchQuery = async (queryType) => {
        const res = await fetch(PH_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queryType }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Worker ${queryType} ${res.status}: ${errText.slice(0, 200)}`);
        }
        return res.json();
      };

      const [lpJson, schedJson, compJson] = await Promise.all([
        fetchQuery("lp"),
        fetchQuery("sched"),
        fetchQuery("comp"),
      ]);

      const lpByPartner    = parsePhResults(lpJson.results,    PARTNER_KEYS, PARTNER_CONFIG);
      const schedByPartner = parsePhResults(schedJson.results, PARTNER_KEYS, PARTNER_CONFIG);
      const compByPartner  = parsePhResults(compJson.results,  PARTNER_KEYS, PARTNER_CONFIG);

      setPhData(prev => {
        const next = { ...prev };
        PARTNER_KEYS.forEach(pk => {
          next[pk] = {
            ...prev[pk],
            lp_url:    lpByPartner[pk]    || [],
            sched_url: schedByPartner[pk] || [],  // raw [date, url, count] from PostHog join
            comp_url:  compByPartner[pk]  || [],  // raw [date, url, count] from PostHog join
          };
        });
        return next;
      });
      setPhStatus("ok");
    } catch (e) {
      console.error("PostHog fetch failed:", e);
      setPhStatus("error");
    }
  }, []);

  useEffect(() => { fetchFromPostHog(); }, [fetchFromPostHog]);

  const launchDates = useMemo(() => {
    const base = getLaunchDates(partner, phData);
    // Apply user overrides on top of auto-detected dates
    return { ...base, ...launchDateOverrides };
  }, [partner, phData, launchDateOverrides]);

  const touchpoints = useMemo(() => {
    // All sources now use [date, url, count] format — pick the right array
    let urlRows;
    if (source === "lp") {
      urlRows = phData[partner]?.lp_url || [];
    } else {
      const urlKey = source + "_url"; // sched_url or comp_url
      urlRows = phData[partner]?.[urlKey] || [];
    }
    return buildTouchpoints(urlRows, yr, launchDates);
  }, [partner, source, yr, launchDates, phData]);


  const [viewMode, setViewMode] = useState("by-url"); // "by-url" | "by-channel" | "bob"

  // Helper to get urlRows for a given partner + source
  const getUrlRows = useCallback((pk, src) => {
    if (src === "lp") return phData[pk]?.lp_url || [];
    return phData[pk]?.[src + "_url"] || [];
  }, [phData]);

  // Channel heatmap — aggregated by DM/Email/Airbo/Other for current partner
  const channelHeatmap = useMemo(() => {
    return buildChannelHeatmap(getUrlRows(partner, source), yr, launchDates);
  }, [partner, source, yr, launchDates, getUrlRows]);

  // BoB heatmap — aggregated by DM/Email/Airbo/Other across ALL partners
  const bobHeatmap = useMemo(() => {
    // Collect all urlRows across all partners, compute per-partner launch dates
    const allRows = [];
    const allLaunchDates = {};
    PARTNER_KEYS.forEach(pk => {
      const rows = getUrlRows(pk, source);
      rows.forEach(r => allRows.push(r));
      const ld = getLaunchDates(pk, phData);
      Object.assign(allLaunchDates, ld);
    });
    // Apply user overrides
    Object.assign(allLaunchDates, launchDateOverrides);
    return buildChannelHeatmap(allRows, yr, allLaunchDates);
  }, [source, yr, launchDateOverrides, getUrlRows, phData]);

  const partnerLabel = PARTNER_CONFIG[partner]?.label;
  const srcLabel = source === "sched" ? "Scheduled" : "Completed";

  const btnStyle = (active, color = "#4f86f7") => ({
    padding: "5px 12px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer", fontSize: 13,
    background: active ? color : "#fff", color: active ? "#fff" : "#333",
  });
  const divider = <div style={{ width: 1, background: "#ddd", alignSelf: "stretch" }} />;

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, background: "#f8f9fa", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: "#222" }}>
          Enrollment Touchpoint Lifecycle — {partnerLabel} · {srcLabel}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {phStatus === "loading" && <span style={{ fontSize: 11, color: "#888" }}>⟳ Loading PostHog…</span>}
          {phStatus === "ok"      && <span style={{ fontSize: 11, color: "#2e7d32" }}>● Live</span>}
          {phStatus === "error"   && <span style={{ fontSize: 11, color: "#c62828" }}>● PostHog error</span>}
          {phStatus === "idle"    && <span style={{ fontSize: 11, color: "#bbb" }}>○ Placeholder data</span>}
          {phStatus !== "loading" && (
            <button onClick={fetchFromPostHog} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>

        {/* Partner selector — hidden when BoB is active */}
        {viewMode !== "bob" && PARTNER_KEYS.map(k => (
          <button key={k} onClick={() => setPartner(k)} style={btnStyle(partner === k, "#1a73e8")}>
            {PARTNER_CONFIG[k].label}
          </button>
        ))}
        {viewMode !== "bob" && divider}

        {/* Source */}
        {[["sched","Scheduled"],["comp","Completed"]].map(([v, l]) => (
          <button key={v} onClick={() => setSource(v)} style={btnStyle(source === v, "#4f86f7")}>{l}</button>
        ))}

        {divider}

        {/* Year */}
        {[2024, 2025, 2026].map(y => (
          <button key={y} onClick={() => setYr(y)} style={btnStyle(yr === y, "#333")}>{y}</button>
        ))}

        {divider}

        {/* View mode */}
        {[["by-url","By URL"],["by-channel","By Channel"],["bob","BoB"]].map(([v, l]) => (
          <button key={v} onClick={() => setViewMode(v)} style={btnStyle(viewMode === v, "#5c6bc0")}>{l}</button>
        ))}

      </div>

      {/* ── Shared channel heatmap renderer (used by By Channel + BoB) ── */}
      {(viewMode === "by-channel" || viewMode === "bob") && (() => {
        const rows = viewMode === "bob" ? bobHeatmap : channelHeatmap;
        const PILL = {
          DM:    { bg: "#e8f0fe", text: "#1a56cc" },
          Email: { bg: "#e6f4ea", text: "#1e7e34" },
          Airbo: { bg: "#fce8ff", text: "#8b00cc" },
          Other: { bg: "#f5f5f5", text: "#888" },
        };
        const title = viewMode === "bob"
          ? `All Partners (BoB) · ${srcLabel} · ${yr}`
          : `${partnerLabel} · ${srcLabel} · ${yr}`;
        return (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
              {title} — each row = one channel, day-0 = earliest launch date in that channel
            </div>
            <table style={{ borderCollapse: "collapse", fontSize: 12, background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.08)", minWidth: "100%" }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Channel</th>
                  <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>TOTAL</th>
                  {[1,2,3,4,5,6,7,8].map(w => (
                    <th key={w} style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap", minWidth: 62 }}>WK {w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.channel} style={{ background: i % 2 ? "#fafafa" : "#fff" }}>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: (PILL[r.channel] || PILL.Other).bg,
                        color: (PILL[r.channel] || PILL.Other).text }}>
                        {r.channel}
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px", fontWeight: 700, textAlign: "right" }}>{r.tot.toLocaleString()}</td>
                    {[1,2,3,4,5,6,7,8].map(w => {
                      const wkEntry = r.wk[w - 1];
                      const vol = wkEntry ? wkEntry.e : 0;
                      const prevCum = w > 1 && r.wk[w - 2] ? r.wk[w - 2].p : 0;
                      const thisPct = wkEntry ? +(wkEntry.p - prevCum).toFixed(1) : 0;
                      const intensity = Math.min(thisPct / 50, 1);
                      const bg = vol > 0 ? `rgba(79,134,247,${0.08 + intensity * 0.72})` : "transparent";
                      const textColor = intensity > 0.55 ? "#fff" : "#222";
                      return (
                        <td key={w} style={{ padding: "4px 6px", textAlign: "center", background: bg }}>
                          {vol > 0 ? (
                            <>
                              <div style={{ fontWeight: 600, color: textColor, fontSize: 12 }}>{vol.toLocaleString()}</div>
                              <div style={{ fontSize: 10, color: intensity > 0.45 ? "rgba(255,255,255,0.82)" : "#888", marginTop: 1 }}>{thisPct.toFixed(0)}%</div>
                            </>
                          ) : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
              Launch date = earliest LP visit across all URLs in that channel. Heatmap intensity = % of channel total in that week.
            </p>
          </div>
        );
      })()}

      {viewMode === "by-url" && <>
      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.08)", minWidth: "100%" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Channel</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap", minWidth: 280 }}>URL</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Launch Date</th>
              <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>TOTAL</th>
              {[1,2,3,4,5,6,7,8].map(w => (
                <th key={w} style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid #ddd", whiteSpace: "nowrap", minWidth: 62 }}>WK {w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {touchpoints.map((t, i) => {
              return (
                <tr key={t.url} style={{ background: i % 2 ? "#fafafa" : "#fff" }}>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    {(() => {
                      const colors = {
                        DM:      { bg: "#e8f0fe", text: "#1a56cc" },
                        Email:   { bg: "#e6f4ea", text: "#1e7e34" },
                        Airbo:   { bg: "#fce8ff", text: "#8b00cc" },
                        Webinar: { bg: "#fff3e0", text: "#e65100" },
                        Onsite:  { bg: "#f0f0f0", text: "#444" },
                        OOH:     { bg: "#fdf3e3", text: "#996600" },
                        Print:   { bg: "#f5f5f5", text: "#555" },
                        Other:   { bg: "#f5f5f5", text: "#888" },
                      };
                      const c = colors[t.channel] || colors.Other;
                      return (
                        <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>
                          {t.channel}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "6px 10px", color: "#333", fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", maxWidth: 380 }}>
                    {t.url}
                  </td>
                  <td style={{ padding: "4px 6px", color: "#555", whiteSpace: "nowrap", minWidth: 120 }}>
                    {editingUrl === t.url ? (
                      <input
                        type="date"
                        value={editingValue}
                        autoFocus
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => {
                          if (editingValue && /^\d{4}-\d{2}-\d{2}$/.test(editingValue)) {
                            updateOverrides(prev => ({ ...prev, [t.url]: editingValue }));
                          }
                          setEditingUrl(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            if (editingValue && /^\d{4}-\d{2}-\d{2}$/.test(editingValue)) {
                              updateOverrides(prev => ({ ...prev, [t.url]: editingValue }));
                            }
                            setEditingUrl(null);
                          }
                          if (e.key === "Escape") setEditingUrl(null);
                        }}
                        style={{ fontSize: 12, padding: "2px 4px", borderRadius: 4, border: "1px solid #4f86f7", outline: "none", width: 130 }}
                      />
                    ) : (
                      <span
                        title="Click to edit launch date"
                        onClick={() => { setEditingUrl(t.url); setEditingValue(t.ld); }}
                        style={{
                          cursor: "text",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "1px solid transparent",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#cce0ff"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}
                      >
                        {t.ld}
                        {launchDateOverrides[t.url] && (
                          <span title="Date manually overridden" style={{ fontSize: 9, color: "#4f86f7", fontWeight: 700, letterSpacing: 0.5 }}>✎</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px 10px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{t.tot.toLocaleString()}</td>
                  {[1,2,3,4,5,6,7,8].map(w => {
                    const wkEntry = t.wk[w - 1];
                    const vol = wkEntry ? wkEntry.e : 0;
                    const prevCum = w > 1 && t.wk[w - 2] ? t.wk[w - 2].p : 0;
                    const thisPct = wkEntry ? +(wkEntry.p - prevCum).toFixed(1) : 0;
                    const intensity = Math.min(thisPct / 50, 1);
                    const bg = vol > 0 ? `rgba(79,134,247,${0.08 + intensity * 0.72})` : "transparent";
                    const textColor = intensity > 0.55 ? "#fff" : "#222";
                    return (
                      <td key={w} style={{ padding: "4px 6px", textAlign: "center", background: bg }}>
                        {vol > 0 ? (
                          <>
                            <div style={{ fontWeight: 600, color: textColor, fontSize: 12 }}>{vol.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: intensity > 0.45 ? "rgba(255,255,255,0.82)" : "#888", marginTop: 1 }}>{thisPct.toFixed(0)}%</div>
                          </>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <p style={{ fontSize: 11, color: "#999", margin: 0 }}>
          Launch date = first LP visit for that URL. <strong style={{ color: "#666" }}>Click any date to override it.</strong> Heatmap = % of URL total in that week. Each row = one distinct clean URL.
        </p>
        {Object.keys(launchDateOverrides).length > 0 && (
          <button
            onClick={() => updateOverrides({})}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #f5a623", background: "#fffbf0", color: "#b07000", cursor: "pointer", whiteSpace: "nowrap", marginLeft: 12 }}
          >
            Reset {Object.keys(launchDateOverrides).length} override{Object.keys(launchDateOverrides).length > 1 ? "s" : ""}
          </button>
        )}
      </div>
      </>}
    </div>
  );
}
