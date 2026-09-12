let SNAP = {};
const snapReady = (async()=>{ const r = await fetch("data.json"); SNAP = await r.json(); })();
// Dashboard v2 — vanilla SPA (no framework, no build)
const $ = (s, el=document) => el.querySelector(s);
const EMOJI = {breakout_success:"✅",partial_success:"🟢",no_move:"🟡",failed_breakout:"🔴",invalidated:"❌",failed:"🔴"};
let DATES = [], PERF = [];

async function api(p){ await snapReady; return SNAP[typeof p==="string"?p:p()]; }

function nav(view){
  document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active", a.dataset.v===view));
  VIEWS[view]();
}

async function init(){
  [DATES, PERF] = await Promise.all([api("/api/dates"), api("/api/perf")]);
  $("#dateSel").innerHTML = DATES.map(d=>`<option>${d}</option>`).join("") || "<option>—</option>";
  nav("today");
}

const VIEWS = {
  async backtest(){
    const b = await api("/api/backtest");
    if(b.error){ $("#main").innerHTML = `<h2>Backtest</h2><div class="card"><p class="muted">${b.error}</p></div>`; return; }
    const tbl = t => t.length ? `<div class="card"><table><tr><th>Group</th><th>N</th><th>Win %</th><th>Avg Move</th></tr>${t.map(r=>`<tr><td>${r.label}</td><td>${r.n}</td><td class="${r.win_rate>50?"good":"bad"}">${r.win_rate}%</td><td>${r.avg_move>0?"+":""}${r.avg_move}%</td></tr>`).join("")}</table></div>` : "";
    const oc = Object.entries(b.outcomes).map(([k,v])=>`${k.replace(/_/g," ")}: <b>${v}</b>`).join(" · ");
    $("#main").innerHTML = `<h2>Backtest — ${b.config.sample} stocks × ${b.config.replay_days} din</h2>
      <div class="stats">
        <div class="stat"><div class="v">${b.total_trades}</div><div class="l">Trades</div></div>
        <div class="stat"><div class="v ${b.win_rate>50?"good":"bad"}">${b.win_rate}%</div><div class="l">Win Rate</div></div>
        <div class="stat"><div class="v">${b.direction_accuracy}%</div><div class="l">Direction</div></div>
        <div class="stat"><div class="v ${b.avg_move>0?"good":"bad"}">${b.avg_move>0?"+":""}${b.avg_move}%</div><div class="l">Avg Move</div></div>
      </div>
      <div class="card"><p>${oc}</p><p class="muted">Key insight: conf 90+ = real edge (60.8% win, +0.69% avg). Middle bands noise hai. ⭐ Edge tag pick table me.</p></div>
      ${tbl(b.by_confidence_band)}${tbl(b.by_setup)}${tbl(b.by_sector.slice(0,8))}`;
  },
  async strategies(){
    const s = await api("/api/strategy-stats");
    if(s.error){ $("#main").innerHTML = `<h2>Strategy Lab</h2><div class="card"><p class="muted">${s.error} — roz shaam ko evaluator chalega, phir yahan win-rates dikhenge: kaunsa setup kab kaam karta hai.</p></div>`; return; }
    const tbl = t => t.length ? `<div class="card"><table><tr><th>${t[0].label!==undefined?"Group":"x"}</th><th>N</th><th>Win %</th><th>Avg Move</th></tr>${t.map(r=>`<tr><td>${r.label}</td><td>${r.n}</td><td class="${r.win_rate>50?"good":"bad"}">${r.win_rate}%</td><td>${r.avg_move>0?"+":""}${r.avg_move}%</td></tr>`).join("")}</table></div>` : "";
    $("#main").innerHTML = `<h2>Strategy Lab — kya kaam kar raha hai</h2>
      <div class="stats">${["total","overall_win_rate"].map(k=>`<div class="stat"><div class="v">${k==="total"?s.total:s.overall_win_rate+"%"}</div><div class="l">${k==="total"?"Trades":"Win Rate"}</div></div>`).join("")}</div>
      ${tbl(s.by_setup)}${tbl(s.by_pattern_flag)}${tbl(s.by_fundamental_band)}${tbl(s.by_confidence_band)}${tbl(s.by_market_regime)}${tbl(s.by_global_ctx)}${tbl(s.by_sector)}`;
  },
  async today(){
    const p = await api("/api/pred");
    if(!p){ $("#main").innerHTML = `<div class="card"><h2>Aaj koi prediction nahi</h2><p class="muted">Subah 7:00 AM cron chalega. (Dashboard test: dateSel se purani prediction dekho.)</p></div>`; return; }
    const live = await api("/api/live").catch(()=>[]);
    const lm = {}; (live||[]).forEach(l=>lm[l.symbol]=l);
    $("#main").innerHTML = predHTML(p, p.date, false, lm);
    bindExpand();
    clearTimeout(window._lt);
    window._lt = setTimeout(()=>{ if(document.querySelector('nav a[data-v=today].active')) VIEWS.today(); }, 30000); // 30s live refresh
  },
  async compare(){
    const d = $("#dateSel").value;
    if(!d){ $("#main").innerHTML = `<div class="card">Koi prediction available nahi.</div>`; return; }
    const p = await api("/api/pred/"+d);
    $("#main").innerHTML = p ? predHTML(p, d, true) : "No data";
    bindExpand();
  },
  async history(){
    const rows = await Promise.all(DATES.slice(0,30).map(async d=>{
      const p = await api("/api/pred/"+d);
      const ok = p.results.filter(x=>x.outcome&&["breakout_success","partial_success"].includes(x.outcome)).length;
      const n = p.results.length;
      return `<tr class="expandable" data-d="${d}"><td><a href="#" onclick="event.preventDefault();showDate('${d}')">${d}</a></td>
        <td>${p.picks.length}</td><td>${p.global_context.score}</td><td>${p.market_regime.score}</td>
        <td>${ok}/${n}</td><td>${ok&&n?(ok/n*100).toFixed(0):"—"}%</td></tr>`;
    }));
    $("#main").innerHTML = `<h2>History</h2><div class="card"><table>
      <tr><th>Date</th><th>Picks</th><th>Global</th><th>Market</th><th>Success</th><th>Rate</th></tr>${rows.join("")}</table></div>`;
  },
  async performance(){
    if(!PERF.length){ $("#main").innerHTML = `<h2>Performance</h2><div class="card"><p class="muted">Abhi koi evaluated prediction nahi. Roz shaam 4:30 PM pe data banega.</p></div>`; return; }
    const n = PERF.length;
    const ok = PERF.filter(x=>["breakout_success","partial_success"].includes(x.outcome)).length;
    const dirOk = PERF.filter(x=>x.direction_correct).length;
    const avgMove = (PERF.reduce((s,x)=>s+x.pct_move,0)/n).toFixed(2);
    const avgConf = (PERF.reduce((s,x)=>s+x.confidence,0)/n).toFixed(0);
    const by = key => PERF.reduce((m,x)=>{const k=x[key];(m[k]=m[k]||[]).push(x);return m},{});
    const bucket = x => x.confidence>=90?"90-100":x.confidence>=80?"80-89":x.confidence>=70?"70-79":x.confidence>=60?"60-69":"<60";
    PERF.forEach(x=>x.bucket=bucket(x));
    const table = (title, key) => {
      const m = by(key);
      const rows = Object.keys(m).sort().map(k=>{
        const xs=m[k], s=xs.filter(x=>["breakout_success","partial_success"].includes(x.outcome)).length;
        return `<tr><td>${k}</td><td>${xs.length}</td><td>${(s/xs.length*100).toFixed(0)}%</td>
        <td style="width:35%"><div class="bar"><div class="${s/xs.length>0.5?"good":"bad"}" style="width:${s/xs.length*100}%"></div></div></td></tr>`;
      }).join("");
      return `<h3>${title}</h3><div class="card"><table><tr><th>${key}</th><th>N</th><th>Success</th><th></th></tr>${rows}</table></div>`;
    };
    const recent = PERF.slice(-30).reverse().map(x=>`<tr><td>${x.date}</td><td>${x.symbol}</td><td>${x.confidence}</td>
      <td class="${x.pct_move>0?"good":"bad"}">${x.pct_move>0?"+":""}${x.pct_move}%</td><td>${EMOJI[x.outcome]||""} ${x.outcome}</td></tr>`).join("");
    $("#main").innerHTML = `<h2>Performance</h2>
    <div class="grid">
      <div class="stat"><div class="v">${n}</div><div class="l">Total Evaluated</div></div>
      <div class="stat"><div class="v good">${ok} (${(ok/n*100).toFixed(0)}%)</div><div class="l">Successful</div></div>
      <div class="stat"><div class="v">${dirOk? (dirOk/n*100).toFixed(0)+"%":"—"}</div><div class="l">Direction Correct</div></div>
      <div class="stat"><div class="v">${avgMove>0?"+":""}${avgMove}%</div><div class="l">Avg Move</div></div>
      <div class="stat"><div class="v">${avgConf}</div><div class="l">Avg Confidence</div></div>
    </div>
    ${table("By Confidence","bucket")}${table("By Setup","setup")}${table("By Sector","sector")}
    <h3>Recent Trades</h3><div class="card"><table><tr><th>Date</th><th>Symbol</th><th>Conf</th><th>Move</th><th>Outcome</th></tr>${recent}</table></div>`;
  },
  async news(){
    const d = $("#dateSel").value || DATES[0];
    if(!d){ $("#main").innerHTML = "<div class=card>No data.</div>"; return; }
    const p = await api("/api/pred/"+d);
    if(!p || !p.news_snapshot){ $("#main").innerHTML = "<div class=card>News snapshot nahi mila.</div>"; return; }
    const ns = p.news_snapshot;
    $("#main").innerHTML = `<h2>News Freeze — ${d}</h2><p class="muted">7:00 AM snapshot, prediction ke waqt jo dekha tha wahi. (§22)</p>
    <h3>NSE Filings (${ns.nse_filings.length})</h3><div class="card">${ns.nse_filings.map(f=>
      `<div class="newsitem"><span class="tag">${f.feed.replace("_"," ")}</span> ${f.title} <span class="muted mono">${f.published}</span></div>`).join("")}</div>
    <h3>Global Headlines (${ns.global_headlines.length})</h3><div class="card">${ns.global_headlines.map(f=>
      `<div class="newsitem"><span class="tag">${f.topic.replace("_"," ")}</span> ${f.title} <span class="muted mono">${f.published}</span></div>`).join("")}</div>
    ${ns.pick_alerts.length?`<h3>Pick Alerts</h3><div class="card">${ns.pick_alerts.map(a=>
      `<div class="newsitem"><b>${a.symbol}</b><ul style="margin:4px 0 0 16px">${a.headlines.map(h=>`<li>${h}</li>`).join("")}</ul></div>`).join("")}</div>`:""}`;
  }
};

function predHTML(p, d, withResults, lm={}){
  window._lastPred = p;  // drawCharts isko detail rows me use karta hai
  const resMap = {}; (p.results||[]).forEach(r=>resMap[r.symbol]=r);
  const liveTxt = s => !lm[s] ? "" : lm[s].error ? `<div class="muted">⚠️</div>` :
    `<div><b>₹${lm[s].price}</b></div><div class="${lm[s].chg_pct>0?"good":"bad"}">${lm[s].chg_pct>0?"+":""}${lm[s].chg_pct}% vs morning</div><div class="muted">${lm[s].day_chg_pct>0?"+":""}${lm[s].day_chg_pct}% today</div>${lm[s].near_bo?'<div class="tag">⚡ breakout!</div>':""}<div class="muted" style="font-size:10px">${lm[s].ts} IST · yfinance ~15m delayed</div>`;
  const FLAG_TXT = {tight_range:"Tight consolidation (range <10%)", higher_highs:"Higher highs (20d)", vol_dryup:"Volume dry-up (accumulation)", near_range_top:"Closing near range top"};
  const WMAX = {tech:20,volume:15,momentum:15,rs:10,market:10,proximity:10,rr:10,pattern:10,fundamental:15,news:5};
  const rows = p.picks.map((pick,i)=>{
    const ev = withResults ? resMap[pick.symbol] : null;
    const mv = ev ? `<td class="${ev.pct_move>0?"good":"bad"}">${ev.pct_move>0?"+":""}${ev.pct_move}%</td><td>${EMOJI[ev.outcome]||""} ${ev.outcome}</td>` : "";
    const sb = pick.score_breakdown || {};
    const sbRows = Object.keys(WMAX).filter(k=>sb[k]!==undefined).map(k=>{
      const pct = Math.min(100, sb[k]/WMAX[k]*100);
      return `<div class="sbrow"><span class="lbl">${k}</span><div class="bar"><div class="${pct>50?"good":"bad"}" style="width:${pct}%"></div></div><span class="num">${sb[k]}/${WMAX[k]}</span></div>`;
    }).join("");
    const f = pick.fundamentals || {};
    const fund = f.score!==undefined ? `<div class="kv"><span>PE</span><b>${f.pe??"—"}</b></div><div class="kv"><span>ROE</span><b>${f.roe!==null&&f.roe!==undefined?(f.roe*100).toFixed(0)+"%":"—"}</b></div><div class="kv"><span>Debt/Eq</span><b>${f.de??"—"}</b></div><div class="kv"><span>EPS growth</span><b>${f.earnings_growth!==null&&f.earnings_growth!==undefined?(f.earnings_growth*100).toFixed(0)+"%":"—"}</b></div><div class="kv"><span>Fund score</span><b>${f.score}/15</b></div>${f.note?`<div class="muted">${f.note}</div>`:""}` : "<div class='muted'>Fundamentals is scan me nahi the (purana format)</div>";
    const flags = (pick.pattern_flags||[]).map(fl=>`<span class="tag">${FLAG_TXT[fl]||fl}</span>`).join(" ") || "<span class='muted'>—</span>";
    return `<tr class="expandable" data-i="${i}"><td>${i+1}</td>
      <td><b>${pick.symbol}</b><div class="muted">${pick.sector}</div></td>
      <td>₹${pick.price}</td><td>₹${pick.breakout_level}</td><td>₹${pick.target}</td><td>₹${pick.invalidation}</td>
      ${Object.keys(lm).length?"<td>"+liveTxt(pick.symbol)+"</td>":""}
      <td>${pick.confidence>=90?'<span class="tag" title="Backtest: 60.8% win rate @ conf 90+">⭐ Edge</span> ':''}<b>${pick.confidence}</b></td>${mv}
      <td><a class="tvlink" href="https://www.tradingview.com/chart/?symbol=NSE:${pick.symbol}" target="_blank" title="TradingView me chart kholo">📈 Chart</a></td></tr>
      <tr class="detailrow"><td colspan="10" style="padding:0"><div class="detail" id="det-${i}">
        <div class="dgrid">
          <div><h4>📌 Strategy & Pattern</h4>
            <div class="kv"><span>Setup</span><b>${pick.setup}</b></div>
            <div class="kv"><span>Pattern score</span><b>${sb.pattern??pick.pattern??"—"}/10</b></div>
            <div>Flags: ${flags}</div>
            <div class="kv"><span>RSI</span><b>${pick.rsi}</b></div>
            <div class="kv"><span>Vol vs 20d avg</span><b>${pick.vol_ratio?pick.vol_ratio+"x":"—"}</b></div>
            <div class="kv"><span>% from 52w high</span><b>${pick.pct_from_52h}%</b></div>
            <div class="kv"><span>R:R</span><b>${pick.rr}</b></div>
            ${ev?`<div class="kv"><span>Result</span><b>${EMOJI[ev.outcome]||""} ${ev.outcome} (${ev.pct_move>0?"+":""}${ev.pct_move}%)</b></div>`:""}
          </div>
          <div><h4>💰 Fundamentals</h4>${fund}</div>
          <div><h4>🧮 Score Breakdown (${pick.confidence}/100)</h4>${sbRows||"<div class='muted'>—</div>"}</div>
        </div>
        <div style="margin-top:12px">
          <h4>📈 ${pick.symbol} — Strategy on Chart (hamara data, ~15m delayed)</h4>
          <div class="tvchart" id="lwc-${i}"></div>
          <div class="chartlegend">${pick.pattern_flags&&pick.pattern_flags.length?pick.pattern_flags.map(f=>`<span class="tag">${FLAG_TXT[f]||f}</span>`).join(""):"<span class='muted'>no pattern flags</span>"} <span class="tag">${pick.setup}</span></div>
        </div>
      </div></td></tr>`;
  }).join("");
  const g = p.global_context, m = p.market_regime;
  return `<h1>${d} ${withResults?"— Prediction vs Reality":""}</h1>
  <div class="card"><b>Global:</b> ${g.score}/100 <span class="tag">${g.regime}</span> ${g.labels.join(" · ")}<br>
  <b>Market:</b> ${m.score}/100 <span class="tag">${m.regime}</span> · NIFTY 1d ${p.nifty_chg_1d}%<br>
  <span class="muted">${p.scanned}/${p.universe} scanned · ${p.scan_timestamp} · completeness ${p.data_completeness_pct||"—"}%</span></div>
  <div class="card"><table><tr><th>#</th><th>Stock</th><th>Price</th><th>Breakout</th><th>Target</th><th>Invalid</th>
  ${Object.keys(lm).length?"<th>🔴 Live</th>":""}
  <th>Conf</th>
  ${withResults?"<th>Move</th><th>Outcome</th>":""}<th>Info</th></tr>${rows}</table></div>`;
}

function bindExpand(){
  document.querySelectorAll(".expandable").forEach(tr=>{
    tr.onclick = ()=>{
      const d = tr.nextElementSibling && tr.nextElementSibling.querySelector(".detail");
      if(d){
        d.classList.toggle("open");
        if(d.classList.contains("open")) drawCharts(d);
      }
    };
  });
}

const LWC_SRC = "/static/lwc.js";  // vendored locally — CDN down/blocked = blank charts; 160KB one-time
let _lwcLoaded = null;
function loadLWC(){  // TV ka 35KB open-source lib, ek hi baar load hota hai
  _lwcLoaded ||= new Promise((ok, no)=>{ const s = document.createElement("script");
    s.src = LWC_SRC; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  return _lwcLoaded;
}

async function drawCharts(d){
  const boxes = [...d.querySelectorAll(".tvchart")];
  for(const box of boxes){
    if(box._done) continue; box._done = 1;
    const i = box.id.split("-")[1], p = window._lastPred;
    const pick = p && p.picks && p.picks[i]; if(!pick) continue;
    await renderChart(box, pick, box.dataset.tf || "1d");
    // TF toggle — 1D thesis vs 15m entry
    const tfs = document.createElement("div");
    tfs.className = "tftoggle";
    tfs.innerHTML = `<button class="tfbtn" data-tf="1d">1D · pattern</button><button class="tfbtn" data-tf="1h">1H</button><button class="tfbtn" data-tf="30m">30m</button><button class="tfbtn" data-tf="15m">15m</button>`;
    tfs.querySelectorAll(".tfbtn").forEach(b => b.onclick = async () => {
      tfs.querySelectorAll(".tfbtn").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      box.innerHTML = ""; box._done = 0; box.dataset.tf = b.dataset.tf;
      await renderChart(box, pick, b.dataset.tf);
    });
    box.parentElement.insertBefore(tfs, box);
    const first = tfs.querySelector('[data-tf="1d"]'); if(first) first.classList.add("on");
  }
}

async function renderChart(box, pick, tf){
  const cd = await api("/api/chart?symbol="+encodeURIComponent(pick.symbol)+"&tf="+tf).catch(()=>null);
  if(!cd || cd.error || !cd.bars || !cd.bars.length){ box.innerHTML = "<div class='muted' style='padding:20px'>chart data nahi mila</div>"; return; }
  try{
    await loadLWC();
    const intraday = cd.tf === "15m";
    const ch = LightweightCharts.createChart(box, {height: 430, layout:{background:{type:"solid",color:"transparent"},textColor:"#999"},
      grid:{vertLines:{color:"rgba(255,255,255,.05)"},horzLines:{color:"rgba(255,255,255,.05)"}},
      rightPriceScale:{borderColor:"rgba(255,255,255,.1)"}, timeScale:{borderColor:"rgba(255,255,255,.1)", timeVisible: intraday, secondsVisible: false}});
    const ser = ch.addCandlestickSeries({upColor:"#26a69a",downColor:"#ef5350",wickUpColor:"#26a69a",wickDownColor:"#ef5350",borderVisible:false});
    ser.setData(cd.bars);
    // SMA overlays — daily thesis me hi meaningful; 15m pe skip (noise + clutter)
    if(!intraday){
      const smaCfg = [["sma20","#d29922","SMA20"],["sma50","#a371f7","SMA50"],["sma200","#8b949e","SMA200"]];
      for(const [k,col,t] of smaCfg)
        ch.addLineSeries({color:col,lineWidth:1,title:t}).setData(
          cd.bars.filter(b=>b[k]!=null).map(b=>({time:b.time,value:b[k]})));
    }
    // volume pane
    const vol = ch.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:"vol",title:"Vol"});
    ch.priceScale("vol").applyOptions({scaleMargins:{top:.82,bottom:0}});
    vol.setData(cd.bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?"rgba(38,166,154,.5)":"rgba(239,83,80,.5)"})));
    // pattern markers: R=touch, L=swing low, H=swing high
    (cd.markers||[]).length && ser.setMarkers(cd.markers);
    const pat = cd.pattern||{};
    if(pat.state === "BREAKOUT" || pat.state === "FAILED" || pat.state === "READY" || pat.state === "FORMING"){
      // strategy levels — frozen pick se; overlapping support/invalid + resist/breakout dedupe
      const lv2 = (price, color, title) => ser.createPriceLine({price, color, lineWidth: 2,
        axisLabelVisible: true, title, lineStyle: LightweightCharts.LineStyle.Solid});
      lv2(pick.breakout_level, "#58a6ff", "Breakout ₹"+pick.breakout_level);
      lv2(pick.target, "#26a69a", "Target ₹"+pick.target);
      lv2(pick.invalidation, "#ef5350", "Invalid ₹"+pick.invalidation);
    }
    ch.timeScale().fitContent();
    // pattern name badge — detection engine ka naam, chart header me
    const wrap = box.parentElement;
    const hdr = wrap.querySelector("h4");
    if(hdr && pat.name){ hdr.dataset.named = 1;
      hdr.innerHTML = `📈 ${pick.symbol} — <b>${pat.name}</b> (${pat.state}, Q:${pat.quality}) <span class="muted" style="font-weight:400">${tf.toUpperCase()} view${intraday?", strategy levels from daily":" · ~15m delayed"}</span>`;
    }
    wrap.querySelector(".chartlegend") && !wrap.querySelector(".chartlegend").dataset.named && wrap.querySelector(".chartlegend").insertAdjacentHTML("beforeend",
      ` <span class="tag" style="border-color:${pat.state==="BREAKOUT"?"#26a69a":pat.state==="FAILED"?"#ef5350":"#d29922"}">${pat.state}</span>`+
      (pat.asc_triangle?` <span class="tag">▲ Asc Triangle</span>`:"")+
      ` <span class="tag">Q:${pat.quality}</span>`), wrap.querySelector(".chartlegend").dataset.named = 1;
    box._chart = ch;  // ponytail: no resize observer — re-open re-renders
  }catch(e){ box.innerHTML = "<div class='muted' style='padding:20px'>chart lib load fail — internet check karo</div>"; }
}

async function showDate(d){
  const p = await api("/api/pred/"+d);
  $("#dateSel").value = d;
  $("#main").innerHTML = p ? predHTML(p, d, true) : "No data";
  bindExpand();
}
window.showDate = showDate;

$("#dateSel").onchange = ()=>{ if(location.hash==="#news") VIEWS.news(); };
init();
