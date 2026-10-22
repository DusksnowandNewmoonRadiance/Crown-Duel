/* 网页胜率测试：所有模拟都在 Worker 中执行，不影响正在浏览的页面。 */
(()=>{
"use strict";
const C=window.DuelCards,$=s=>document.querySelector(s),esc=v=>CardView.esc(String(v));
const heroes=Object.keys(C.PROFILES).filter(h=>!(window.DuelDiy&&window.DuelDiy.isDiy(h))),deckChoices={};
let worker=null,completed=0,total=0,resultData=null;

function deckOptions(hero,selected){
  const presets=C.presets(hero)||{};
  return `<option value="random">随机预设</option><option value="默认">默认卡组</option>`+
    Object.keys(presets).map(name=>`<option value="${esc(name)}"${name===selected?" selected":""}>${esc(name)}</option>`).join("");
}
function fillDeck(el,hero){
  const old=el.value;
  el.innerHTML=deckOptions(hero,old);
  if([...el.options].some(o=>o.value===old))el.value=old;
}
function renderDeckGrid(){
  const mode=$("#wrMode").value;
  $("#wrDeckGridWrap").hidden=mode==="match";
  if(mode==="match")return;
  $("#wrDeckGrid").innerHTML=heroes.map(hero=>`<label>${esc(hero)}<select data-deck-hero="${esc(hero)}">${deckOptions(hero,deckChoices[hero])}</select></label>`).join("");
  $("#wrDeckGrid").querySelectorAll("select").forEach(el=>{
    el.value=deckChoices[el.dataset.deckHero]||"random";
    el.disabled=!!worker;
  });
}
function update(){
  const mode=$("#wrMode").value;
  $("#wrHeroAField").hidden=mode==="all";
  $("#wrHeroBField").hidden=mode!=="match";
  $("#wrDeckAField").hidden=mode!=="match";
  $("#wrDeckBField").hidden=mode!=="match";
  $("#wrHeroAField").firstChild.textContent=mode==="hero"?"测试卡牌师":"卡牌师 A";
  fillDeck($("#wrDeckA"),$("#wrHeroA").value);
  fillDeck($("#wrDeckB"),$("#wrHeroB").value);
  renderDeckGrid();
  const n=Number($("#wrGames").value)||0,pairs=mode==="all"?heroes.length*(heroes.length-1)/2:mode==="hero"?heroes.length-1:1;
  $("#wrEstimate").textContent=`预计 ${pairs} 组对阵，共 ${pairs*n} 局；在当前浏览器本地计算。胜率按胜局加半个平局计算。`;
}
function controls(running){
  $("#scrWinrate").querySelectorAll("select,input").forEach(el=>el.disabled=running);
  $("#wrStart").disabled=running;$("#wrCancel").disabled=!running;
}
function stop(message){
  if(worker){worker.terminate();worker=null;controls(false);}
  if(message)$("#wrProgress").textContent=message;
}
function statCard(key,s){
  const metrics=[
    ["对局 / 胜局 / 平局",`${s.games} / ${s.wins} / ${s.draws}`],["平均回合",s.avgTurns],["单位峰值",s.maxBoard],["最低血量",s.minHp],
    ["英雄伤害",s.heroDmg],["单位伤害",s.unitDmg],["每回合出伤",s.damagePerTurn],
    ["胜利回合",s.winTurnAvg===null?"—":`${s.winTurnAvg}（${s.winTurnMin}～${s.winTurnMax}）`],
    ["火炮峰值",s.gunPeak],["饱和次数",s.sat],["饱和累计火炮",s.satGuns],["范围伤害次数",s.aoeCnt],
    ["废料手牌峰值",s.scrapPeak],["转化次数",s.conv]
  ];
  const diagnostics=[
    ["消耗单位前漏攻",s.wastePreSac],["超人打脸",s.supermanFace],["超人解场",s.supermanBoard],
    ["燃烧弹未收残血",s.firebombNoFin],["登船战场面不足",s.boardingThin],
    ["范围伤害出手过晚",s.aoeLate],["策反被规则拦截",s.rebelBlocked]
  ];
  const rows=s.cards.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.games}</td><td>${c.plays}</td><td>${c.winRate}%</td><td>${c.damage}</td><td>${c.damagePerUse}</td></tr>`).join("");
  return `<details class="winrate-detail"><summary><b>${esc(key==="A"||key==="B"?`${key} · ${s.hero}`:s.hero)}</b><span>${s.winRate}% · ${s.wins}/${s.games} 胜</span></summary>
    <div class="winrate-metrics">${metrics.map(([label,value])=>`<div><small>${esc(label)}</small><b>${esc(value)}</b></div>`).join("")}</div>
    <h4>AI 行为诊断</h4><p class="winrate-diagnostics">${diagnostics.map(([label,value])=>`${esc(label)} ${value} 次`).join(" · ")}</p>
    <h4>卡牌统计</h4><p class="muted small">卡牌胜率指打出过该卡的对局胜率；每次出伤按打出次数与单位攻击次数计算。</p>
    ${rows?`<div class="winrate-table-wrap"><table><thead><tr><th>卡牌</th><th>出现局数</th><th>打出次数</th><th>胜率</th><th>总伤</th><th>每次出伤</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">没有达到最低样本局数的卡牌。</p>`}</details>`;
}
function matrix(pairs){
  const byPair=new Map(pairs.map(p=>[[p.a,p.b].sort().join("|"),p]));
  return `<h3>胜率矩阵</h3><p class="muted small">行卡牌师对列卡牌师；双方交替先后手时更适合比较。</p><div class="winrate-table-wrap"><table><thead><tr><th>卡牌师</th>${heroes.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${heroes.map(a=>`<tr><th>${esc(a)}</th>${heroes.map(b=>{if(a===b)return"<td>—</td>";const p=byPair.get([a,b].sort().join("|"));return`<td>${p?(p.a===a?p.rateA:p.rateB)+"%":"—"}</td>`;}).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function chartName(key,s){return key==="A"||key==="B"?`${key} · ${s.hero}`:s.hero;}
function lineChart(points,games,name){
  const x=g=>50+(games===1?260:(g-1)/Math.max(1,games-1)*520);
  const y=r=>205-r*1.7;
  const coords=points.map(p=>`${x(p.game).toFixed(1)},${y(p.winRate).toFixed(1)}`).join(" ");
  const last=points[points.length-1];
  return `<svg class="winrate-line" viewBox="0 0 600 240" role="img" aria-label="${esc(name)}胜率走势，${games}局后为${last.winRate}%">
    ${[0,25,50,75,100].map(v=>`<line x1="50" y1="${y(v)}" x2="570" y2="${y(v)}" class="winrate-grid"/><text x="43" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join("")}
    <polyline points="${coords}" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(last.game)}" cy="${y(last.winRate)}" r="5" fill="var(--gold2)"><title>第 ${last.game} 局：${last.winRate}%</title></circle>
    <text x="50" y="232">1 局</text><text x="570" y="232" text-anchor="end">${games} 局</text>
  </svg>`;
}
function updateCharts(key){
  const result=resultData;if(!result||!result.stats[key])return;
  const s=result.stats[key],name=chartName(key,s),losses=s.games-s.wins-s.draws;
  const winPct=s.wins/s.games*100,lossPct=losses/s.games*100;
  const ranking=Object.entries(result.stats).sort((a,b)=>b[1].winRate-a[1].winRate);
  const rows=ranking.map(([id,item])=>`<button type="button" class="winrate-bar-row${id===key?" active":""}" data-wr-focus="${esc(id)}" aria-label="查看${esc(chartName(id,item))}，胜率${item.winRate}%">
    <span>${esc(chartName(id,item))}</span><span class="winrate-bar-track"><span style="width:${item.winRate}%"></span></span><b>${item.winRate}%</b><small>${item.games} 局</small></button>`).join("");
  $("#wrChartFocus").value=key;
  $("#wrChartBody").innerHTML=`<div class="winrate-chart-grid">
    <section class="winrate-chart-panel"><h4>胜负构成</h4><div class="winrate-pie-wrap">
      <div class="winrate-pie" role="img" aria-label="${esc(name)}：胜${s.wins}局、负${losses}局、平${s.draws}局" style="background:conic-gradient(var(--green) 0 ${winPct}%,var(--red) ${winPct}% ${winPct+lossPct}%,var(--blue) ${winPct+lossPct}% 100%)"><span>${s.winRate}%<small>胜率</small></span></div>
      <div class="winrate-pie-legend"><div><i class="win"></i>胜 <b>${s.wins}</b></div><div><i class="loss"></i>负 <b>${losses}</b></div><div><i class="draw"></i>平 <b>${s.draws}</b></div></div>
    </div><p class="muted small">胜率按胜局加半个平局计算。</p></section>
    <section class="winrate-chart-panel"><h4>卡牌师胜率比较</h4><div class="winrate-bars">${rows}</div></section>
    <section class="winrate-chart-panel winrate-chart-wide"><h4>胜率走势 · ${esc(name)}</h4>${lineChart(result.history[key],s.games,name)}<p class="muted small">横轴为累计对局数，纵轴为累计胜率；最多显示约 200 个采样点。</p></section>
  </div>`;
}
function render(result){
  resultData=result;
  const {mode,pairs,stats,presets,total,gamesPerPair}=result;
  const pairRows=pairs.map(p=>`<tr><td>${esc(p.a)}</td><td>${esc(p.b)}</td><td><b>${p.rateA}%</b></td><td>${p.rateB}%</td><td>${p.winsA} : ${p.winsB}</td><td>${p.draws}</td></tr>`).join("");
  const presetRows=presets.sort((a,b)=>a.hero.localeCompare(b.hero,"zh")||a.preset.localeCompare(b.preset,"zh")||a.foe.localeCompare(b.foe,"zh"))
    .map(p=>`<tr><td>${esc(p.hero)}</td><td>${esc(p.preset)}</td><td>${esc(p.foe)}</td><td>${p.games}</td><td>${p.wins}</td><td>${p.draws}</td><td>${p.winRate}%</td></tr>`).join("");
  const ranking=Object.entries(stats).sort((a,b)=>b[1].winRate-a[1].winRate);
  const focus=mode==="match"?"A":mode==="hero"?pairs[0].a:ranking[0][0];
  $("#wrResults").innerHTML=`<h2>测试结果</h2><p class="muted">${pairs.length} 组对阵 · ${total} 局 · 每组 ${gamesPerPair} 局</p>
    <div class="winrate-chart-heading"><h3>图表总览</h3><label>查看卡牌师 <select id="wrChartFocus">${ranking.map(([key,s])=>`<option value="${esc(key)}">${esc(chartName(key,s))}</option>`).join("")}</select></label></div><div id="wrChartBody"></div>
    ${mode==="all"?matrix(pairs):""}
    <h3>对阵详情</h3><div class="winrate-table-wrap"><table><thead><tr><th>A</th><th>B</th><th>A 胜率</th><th>B 胜率</th><th>胜局 A : B</th><th>平局</th></tr></thead><tbody>${pairRows}</tbody></table></div>
    <h3>实际卡组胜率</h3><div class="winrate-table-wrap"><table><thead><tr><th>卡牌师</th><th>卡组</th><th>对手</th><th>局数</th><th>胜局</th><th>平局</th><th>胜率</th></tr></thead><tbody>${presetRows}</tbody></table></div>
    <h3>综合统计与卡牌分析</h3>${ranking.map(([key,s])=>statCard(key,s)).join("")}`;
  updateCharts(focus);
  $("#wrResults").scrollTop=0;
}
function start(){
  if(worker)return;
  const games=Number($("#wrGames").value),minSample=Number($("#wrMinSample").value);
  if(!Number.isInteger(games)||games<1||games>1000||!Number.isInteger(minSample)||minSample<1||minSample>1000){
    $("#wrProgress").textContent="局数和最低样本局数都必须是 1～1000 的整数。";return;
  }
  const mode=$("#wrMode").value;
  const options={mode,games,minSample,heroA:$("#wrHeroA").value,heroB:$("#wrHeroB").value,
    deckA:$("#wrDeckA").value,deckB:$("#wrDeckB").value,decks:{...deckChoices},
    aiA:$("#wrAiA").value,aiB:$("#wrAiB").value,first:$("#wrFirst").value};
  try{worker=new Worker("js/winrate-worker.js");}catch(e){$("#wrProgress").textContent="当前浏览器无法启动胜率测试："+e.message;return;}
  completed=0;total=0;controls(true);
  resultData=null;
  $("#wrResults").innerHTML='<div class="empty">正在模拟对局…</div>';
  $("#wrProgress").textContent="正在准备测试…";
  worker.onmessage=({data})=>{
    if(data.type==="progress"){
      completed=data.done;total=data.total;
      $("#wrProgress").textContent=`已完成 ${data.done}/${data.total} 局（${Math.round(data.done/data.total*100)}%） · ${data.a} 对 ${data.b}`;
    }else if(data.type==="done"){
      render(data.result);stop(`测试完成，共 ${data.result.total} 局。`);
    }else if(data.type==="error")stop("测试失败："+data.message);
  };
  worker.onerror=e=>stop("测试失败："+(e.message||"工作线程错误"));
  worker.postMessage({type:"start",options});
}
function open(){
  if(!$("#wrHeroA").options.length){
    const choices=heroes.map(h=>`<option value="${esc(h)}">${esc(h)}</option>`).join("");
    $("#wrHeroA").innerHTML=choices;$("#wrHeroB").innerHTML=choices;
    $("#wrHeroA").value=heroes[0];$("#wrHeroB").value=heroes[1]||heroes[0];
  }
  update();
}
$("#wrMode").addEventListener("change",update);
$("#wrHeroA").addEventListener("change",update);
$("#wrHeroB").addEventListener("change",update);
$("#wrGames").addEventListener("input",update);
$("#wrDeckGrid").addEventListener("change",e=>{if(e.target.matches("[data-deck-hero]"))deckChoices[e.target.dataset.deckHero]=e.target.value;});
$("#wrStart").addEventListener("click",start);
$("#wrCancel").addEventListener("click",()=>stop(`已停止测试，完成 ${completed}/${total} 局。`));
$("#wrResults").addEventListener("change",e=>{if(e.target.id==="wrChartFocus")updateCharts(e.target.value);});
$("#wrResults").addEventListener("click",e=>{const row=e.target.closest("[data-wr-focus]");if(row)updateCharts(row.dataset.wrFocus);});
window.WinrateUI={open,stop};
})();
