/* ---------- 실험: 클릭 지점 물 방류 침수 시뮬레이션 (exp/flood-burst.js) ----------
   지도를 클릭하면 그 지점에서 수만 톤의 물이 터져(저수지·물탱크 붕괴 / 급속 유입 / 집중호우)
   3D 모델 표면(DSM)을 따라 높은 곳에서 낮은 곳으로 흘러가는 2차원 침수 계산.
   계산: 국부관성 천수방정식 (Bates·Horritt·Fewtrell 2010, LISFLOOD-FP 방식) + 반음해 마찰 + 질량 보존 제한
   지형: 클릭 지점 주변을 위에서 수직으로 내려다본 정사(직교) 화면의 깊이 버퍼를 한 번에 읽어 격자 높이로 사용
   규칙은 sample-pin.js 와 같음 (IIFE · window.__FBURST 하나만 내보냄 · toggleLayer 체인 · 클릭 체인 · 끌 때 정리)
*/
(function(){
  const C = Cesium;
  const G = 9.81, HMIN = 1e-3, WET = 0.02, FR_MAX = 1.0, ALPHA = 0.5, TANK_H = 6, SIM_MAX = 7200;
  const FB = {
    on:false, phase:'idle',
    opt:{ mode:'burst', vol:30000, rain:100, dom:800, cell:4, n:0.035, speed:30, view:'depth' },
    grid:null, sim:null, prim:null, oldPrim:null, ents:[], raf:0, lastNow:0, lastDraw:0, drawMs:0, stats:null, wallStart:0
  };
  const $q = s => document.querySelector(s);
  const fmtT = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s/60), r = s%60; return m>=60 ? Math.floor(m/60)+'시간 '+(m%60)+'분' : m+'분 '+String(r).padStart(2,'0')+'초'; };
  const fmtA = a => a>=1e6 ? (a/1e6).toFixed(2)+' ㎢' : a>=1e4 ? (a/1e4).toFixed(1)+' ha' : Math.round(a).toLocaleString()+' ㎡';
  const fmtV = v => v>=1e4 ? (v/1e4).toFixed(1)+'만 ㎥' : Math.round(v).toLocaleString()+' ㎥';
  const tonName = v => v>=1e4 ? (v/1e4)+'만 톤' : (v/1e3)+'천 톤';

  /* ---------- 메뉴: 분석 분류 맨 위 ---------- */
  const an = MENUS.site.find(c=>c.id==='analysis');
  if(an && !an.items.some(i=>i.id==='fburst')) an.items.unshift({ id:'fburst', q:'여기서 물이 터지면 어디까지 잠기나', name:'물 방류 침수 시뮬레이션 (클릭 지점)', src:'저수지·물탱크 붕괴 / 급속 유입 / 집중호우 · 3D 모델 표면 위 2차원 흐름', type:'layer' });
  try{ renderCats(); renderSub(); }catch(e){}

  /* ---------- 패널 ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #fbPanel{position:fixed;right:14px;top:72px;width:350px;max-height:calc(100vh - 150px);z-index:22;display:none;flex-direction:column;overflow:hidden}
  #fbPanel.open{display:flex}
  #fbPanel .hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}
  #fbPanel .hd h2{margin:0;font-size:15px;font-weight:700;flex:1;line-height:1.3}
  #fbPanel .hd h2 small{display:block;font-weight:400;color:var(--text-dim);font-size:12px}
  #fbPanel .hd button{color:var(--text-dim);font-size:18px}
  #fbPanel .body{overflow:auto;padding:4px 14px 12px}
  #fbPanel .row{font-size:12px;padding:6px 0}
  #fbPanel .row>span{color:var(--text-dim);white-space:nowrap}
  #fbPanel .seg button{padding:4px 8px}
  #fbStatus{margin:10px 0 6px;padding:8px 10px;border-radius:var(--r-sm);background:rgba(3,18,42,.6);border:1px solid var(--line);font-size:13px;line-height:1.45}
  #fbStatus b{color:var(--lime-bright)}
  #fbProg{height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden;display:none}
  #fbProg i{display:block;height:100%;width:0;background:var(--lime)}
  #fbBtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0}
  #fbBtns button{padding:8px 4px;border-radius:var(--r-sm);border:1px solid var(--line-strong);font-size:12px;font-weight:700}
  #fbBtns button:hover{border-color:var(--lime);color:#fff}
  #fbBtns button:disabled{opacity:.4;cursor:not-allowed}
  #fbCards{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 4px}
  #fbCards div{padding:7px 9px;border-radius:var(--r-sm);background:rgba(3,18,42,.55);border:1px solid var(--line)}
  #fbCards small{display:block;font-size:10.5px;color:var(--text-dim)}
  #fbCards b{font-size:14px;color:#fff;font-variant-numeric:tabular-nums}
  #fbLegend{margin:8px 0 4px;font-size:11px;color:var(--text-dim)}
  #fbLegend .bar{height:9px;border-radius:5px;margin:4px 0 2px}
  #fbLegend .ticks{display:flex;justify-content:space-between}
  #fbPanel details{margin-top:8px;font-size:12px;line-height:1.6;color:var(--text)}
  #fbPanel details summary{cursor:pointer;color:var(--lime-bright);font-weight:700;padding:4px 0}
  #fbPanel details code{font-family:Consolas,monospace;font-size:11.5px;color:#fff;background:rgba(255,255,255,.06);padding:1px 4px;border-radius:4px}
  #fbPanel .lim{font-size:11px;color:var(--text-dim);line-height:1.55;margin-top:8px;border-top:1px solid var(--line);padding-top:8px}
  #fbTip{position:fixed;z-index:40;pointer-events:none;display:none;padding:6px 9px;font-size:12px;line-height:1.45;border-radius:8px;background:rgba(3,18,42,.92);border:1px solid var(--line-strong);color:var(--text);white-space:nowrap}
  #fbTip b{color:var(--lime-bright)}`;
  document.head.appendChild(css);

  const seg = (key, items) => `<div class="seg" data-k="${key}">`+items.map(([v,l])=>`<button data-v="${v}">${l}</button>`).join('')+`</div>`;
  const panel = document.createElement('aside');
  panel.id = 'fbPanel'; panel.className = 'panel';
  panel.innerHTML = `
  <div class="hd"><h2>물 방류 침수 시뮬레이션<small>클릭한 지점에서 물이 터져 낮은 곳으로 흐름</small></h2><button id="fbClose" aria-label="닫기">✕</button></div>
  <div class="body">
    <div id="fbStatus">지도(3D 모델)를 클릭하면 그 지점에서 <b>${tonName(FB.opt.vol)}</b>의 물이 터집니다.<div id="fbProg"><i></i></div></div>
    <div class="row"><span>방식</span>${seg('mode',[['burst','붕괴'],['inflow','급속 유입'],['rain','집중호우']])}</div>
    <div class="row" id="fbRowVol"><span>물량</span>${seg('vol',[[5000,'5천'],[10000,'1만'],[30000,'3만'],[50000,'5만'],[100000,'10만 톤']])}</div>
    <div class="row" id="fbRowRain" style="display:none"><span>강우</span>${seg('rain',[[50,'50'],[100,'100'],[200,'200 mm/h']])}</div>
    <div class="row"><span>계산 영역</span>${seg('dom',[[400,'400'],[800,'800'],[1200,'1200 m']])}</div>
    <div class="row"><span>격자</span>${seg('cell',[[2,'2'],[4,'4'],[6,'6 m']])}</div>
    <div class="row"><span>지표 거칠기</span>${seg('n',[[0.015,'포장'],[0.035,'보통'],[0.06,'수풀']])}</div>
    <div class="row"><span>재생 속도</span>${seg('speed',[[1,'×1'],[10,'×10'],[30,'×30'],[60,'×60'],[0,'최대']])}</div>
    <div class="row"><span>색 표시</span>${seg('view',[['depth','수심'],['speed','유속'],['arrival','도달 시간']])}</div>
    <div id="fbBtns"><button id="fbPause" disabled>일시정지</button><button id="fbRerun" disabled>같은 곳 다시</button><button id="fbClear" disabled>지우기</button></div>
    <div id="fbCards">
      <div><small>경과 시간 (현실)</small><b id="fbcT">—</b></div>
      <div><small>방류된 물</small><b id="fbcVin">—</b></div>
      <div><small>침수 면적 (10 cm 이상)</small><b id="fbcA">—</b></div>
      <div><small>50 cm 이상 면적</small><b id="fbcA5">—</b></div>
      <div><small>최대 수심</small><b id="fbcH">—</b></div>
      <div><small>최대 유속</small><b id="fbcU">—</b></div>
      <div><small>도달 거리 (5 cm 이상)</small><b id="fbcR">—</b></div>
      <div><small>영역 밖으로 흘러나감</small><b id="fbcOut">—</b></div>
      <div><small>질량 보존 오차</small><b id="fbcM">—</b></div>
      <div><small>계산 격자 · 단계</small><b id="fbcS">—</b></div>
    </div>
    <div id="fbLegend"></div>
    <details><summary>계산식 보기 (국부관성 천수방정식)</summary>
      <div>· 수면고 <code>η = z + h</code> (z 지반·건물 높이, h 수심)</div>
      <div>· 연속식 <code>∂h/∂t + ∂qx/∂x + ∂qy/∂y = R</code></div>
      <div>· 운동량 (이송항 생략) <code>∂q/∂t + g·h·∂η/∂x + g·n²·|q|·q / h^(7/3) = 0</code></div>
      <div>· 이산식 (격자 경계마다, 마찰 반음해)<br><code>q⁺ = [q − g·h_f·Δt·(η_j − η_i)/Δx] / [1 + g·Δt·n²·|q| / h_f^(7/3)]</code></div>
      <div>· 흐름 깊이 <code>h_f = max(η_i, η_j) − max(z_i, z_j)</code> (h_f ≤ 1 mm면 q = 0)</div>
      <div>· 수심 갱신 <code>h⁺ = h + Δt/Δx · (Σq_in − Σq_out)</code></div>
      <div>· 시간 간격 <code>Δt = 0.5·Δx / √(g·h_max)</code> (CFL 조건, 최대 2초)</div>
      <div>· 안정화: 프루드수 상한 <code>|q| ≤ h_f·√(g·h_f)</code>, 한 셀이 내보내는 물 ≤ 가진 물 (질량 보존)</div>
      <div>· 영역 끝: 열린 경계 <code>q = h^(5/3)·√S₀ / n</code> (S₀ ≥ 0.5%)</div>
      <div>· 붕괴: 반경 <code>r = √(V / (π·6 m))</code> 안을 수평 수면으로 채움 (부피 = V 정확히)</div>
      <div>· 급속 유입: 삼각형 수문곡선 10분, 첨두 <code>Qp = 2V/T</code> (3분 20초에 최대)</div>
      <div>· 집중호우: 강우강도 i (mm/h) × 30분, 영역 전체 균일</div>
      <div>· g = 9.81 m/s², n = 맨닝 조도계수 (포장 0.015 · 보통 0.035 · 수풀 0.06)</div>
    </details>
    <div class="lim">한계: 3D 모델 표면을 지형으로 쓰므로 가로수·차량·지붕 처마도 벽처럼 물을 막습니다. 하수관로·빗물받이 배수, 땅속 침투, 증발은 넣지 않았습니다. 국부관성식은 급경사·도수(물이 뛰는 구간)에서 유속을 다소 낮게 냅니다. 3D 모델 바깥은 지형(Esri) 높이라 경계에서 단차가 생길 수 있습니다.</div>
  </div>`;
  document.body.appendChild(panel);
  const tip = document.createElement('div'); tip.id = 'fbTip'; document.body.appendChild(tip);

  function syncSeg(){
    panel.querySelectorAll('.seg').forEach(s => { const k = s.dataset.k; s.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(FB.opt[k])===b.dataset.v)); });
    $q('#fbRowVol').style.display = FB.opt.mode==='rain' ? 'none' : '';
    $q('#fbRowRain').style.display = FB.opt.mode==='rain' ? '' : 'none';
    legend();
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('.seg button'); if(!b) return;
    const k = b.parentElement.dataset.k, v = b.dataset.v;
    FB.opt[k] = isNaN(+v) ? v : +v; syncSeg();
    if(k==='view'){ draw(true); return; }
    if(k==='speed') return;
    if(FB.phase==='idle') setStatus(idleMsg());
    else toast(k==='dom'||k==='cell' ? '영역·격자 변경은 [같은 곳 다시] 또는 새로 클릭할 때 적용' : '[같은 곳 다시]를 누르면 새 조건으로 다시 계산', 2200);
  });
  $q('#fbClose').onclick = () => toggleLayer('fburst', false);
  $q('#fbPause').onclick = () => { if(FB.phase==='running'){ FB.phase='paused'; } else if(FB.phase==='paused'){ FB.phase='running'; FB.lastNow=performance.now(); } updButtons(); };
  $q('#fbRerun').onclick = () => { if(FB.grid) burst(FB.grid.origin); };
  $q('#fbClear').onclick = () => { clearAll(); setStatus(idleMsg()); };

  function idleMsg(){ return FB.opt.mode==='rain' ? `지도를 클릭하면 그 지점을 중심으로 <b>${FB.opt.dom} m</b> 영역에 시간당 <b>${FB.opt.rain} mm</b> 집중호우를 30분간 뿌립니다.` : `지도(3D 모델)를 클릭하면 그 지점에서 <b>${tonName(FB.opt.vol)}</b>의 물이 ${FB.opt.mode==='burst'?'한꺼번에 터집니다 (저수지·물탱크 붕괴)':'10분 동안 쏟아집니다 (급속 유입)'}.`; }
  function setStatus(html, prog){ const s = $q('#fbStatus'); s.innerHTML = html + '<div id="fbProg"><i></i></div>'; const p = $q('#fbProg'); if(prog!=null){ p.style.display='block'; p.firstChild.style.width = Math.round(prog*100)+'%'; } }
  function updButtons(){
    const has = !!FB.sim;
    $q('#fbPause').disabled = !(FB.phase==='running'||FB.phase==='paused');
    $q('#fbPause').textContent = FB.phase==='paused' ? '재개' : '일시정지';
    $q('#fbRerun').disabled = !FB.grid || FB.phase==='reading';
    $q('#fbClear').disabled = !(has||FB.grid) || FB.phase==='reading';
  }

  /* ---------- 색 ---------- */
  const RAMP = {
    depth:{ stops:[[0.02,[170,235,255,.42]],[0.1,[100,195,250,.55]],[0.5,[45,135,235,.68]],[1,[25,85,205,.78]],[2,[40,45,165,.85]],[4,[85,25,125,.9]]], ticks:['2 cm','10 cm','50 cm','1 m','2 m','4 m+'], key:'수심' },
    speed:{ stops:[[0,[70,200,255,.5]],[0.5,[80,220,130,.65]],[1.5,[245,225,60,.75]],[3,[250,130,40,.85]],[6,[230,40,40,.9]]], ticks:['0','0.5','1.5','3','6 m/s+'], key:'유속' },
    arrival:{ stops:[[0,[235,45,45,.8]],[0.5,[250,140,40,.78]],[1,[245,220,60,.75]],[3,[90,210,120,.72]],[6,[60,170,240,.7]],[12,[125,110,230,.7]]], ticks:['0','30초','1분','3분','6분','12분+'], key:'처음 10 cm 잠긴 시각' },
  };
  function ramp(stops, v, out){
    let a = stops[0], b = stops[stops.length-1];
    if(v<=a[0]){ b=a; } else if(v>=b[0]){ a=b; } else { for(let i=1;i<stops.length;i++) if(v<=stops[i][0]){ a=stops[i-1]; b=stops[i]; break; } }
    const t = a===b ? 0 : (v-a[0])/(b[0]-a[0]);
    for(let i=0;i<4;i++) out[i] = a[1][i] + (b[1][i]-a[1][i])*t;
    return out;
  }
  function legend(){
    const R = RAMP[FB.opt.view]; const g = R.stops.map((s,i)=>`rgba(${s[1][0]},${s[1][1]},${s[1][2]},${Math.min(1,s[1][3]+.15)}) ${Math.round(i/(R.stops.length-1)*100)}%`).join(',');
    $q('#fbLegend').innerHTML = `${R.key}<div class="bar" style="background:linear-gradient(90deg,${g})"></div><div class="ticks">${R.ticks.map(t=>`<span>${t}</span>`).join('')}</div>`;
  }

  /* ---------- 지형(DSM) 읽기: 정사 화면 깊이 버퍼를 한 번에 ---------- */
  function patchDepth(on){
    const pd = scene._view && scene._view.pickDepths && scene._view.pickDepths[0];
    let proto = pd ? Object.getPrototypeOf(pd) : FB._pdProto;
    if(!proto || !proto.getDepth) return false;
    FB._pdProto = proto;
    if(on){
      if(!proto.__fbOrig) proto.__fbOrig = proto.getDepth;
      FB._frame = (FB._frame||0) + 1;
      const frame = FB._frame;
      proto.getDepth = function(ctx, x, y){
        if(!this.framebuffer) return undefined;
        let c = this.__fbc;
        if(!c || c.frame!==frame){ const W = ctx.drawingBufferWidth, H = ctx.drawingBufferHeight; c = this.__fbc = { frame, W, H, px: ctx.readPixels({ x:0, y:0, width:W, height:H, framebuffer:this.framebuffer }) }; }
        x|=0; y|=0; if(x<0||y<0||x>=c.W||y>=c.H) return undefined;
        const i = (y*c.W+x)*4, p = c.px; return (p[i] + p[i+1]/255 + p[i+2]/65025 + p[i+3]/16581375)/255;
      };
    } else if(proto.__fbOrig){ proto.getDepth = proto.__fbOrig; scene._view.pickDepths.forEach(d=>{ delete d.__fbc; }); }
    return true;
  }
  const w2w = (C.SceneTransforms.worldToWindowCoordinates || C.SceneTransforms.wgs84ToWindowCoordinates).bind(C.SceneTransforms);
  const sleep = ms => new Promise(r=>setTimeout(r, ms));

  async function readDSM(origin, dom, dx){
    const nx = Math.round(dom/dx), ny = nx, N = nx*ny;
    const enu = C.Transforms.eastNorthUpToFixedFrame(origin);
    const inv = C.Matrix4.inverseTransformation(enu, new C.Matrix4());
    const save = { pos:camera.position.clone(), dir:camera.direction.clone(), up:camera.up.clone(), fr:camera.frustum.clone() };
    const ssc = scene.screenSpaceCameraController, prevIn = ssc.enableInputs; ssc.enableInputs = false;
    if(FB.prim) FB.prim.show = false; for(const e of FB.ents) e.show = false;
    const top = C.Matrix4.multiplyByPoint(enu, new C.Cartesian3(0,0,1500), new C.Cartesian3());
    const down = C.Matrix4.multiplyByPointAsVector(enu, new C.Cartesian3(0,0,-1), new C.Cartesian3());
    const north = C.Matrix4.multiplyByPointAsVector(enu, new C.Cartesian3(0,1,0), new C.Cartesian3());
    const W = scene.canvas.clientWidth, H = scene.canvas.clientHeight, asp = W/H;
    const width = dom*1.1*Math.max(1, asp);
    camera.switchToOrthographicFrustum();
    const setCam = () => { camera.setView({ destination:top, orientation:{ direction:down, up:north } }); camera.frustum.width = width; };
    const t0 = performance.now(); let stable = 0;
    try{
      while(performance.now()-t0 < 30000){
        setCam(); scene.render();
        const tsOk = PROJECTS.every(p => !p.ts || !p.ts.show || p.ts.tilesLoaded);
        if(tsOk && globe.tilesLoaded){ if(++stable>=4 && performance.now()-t0>1500) break; } else stable = 0;
        setStatus(`지형 읽는 중 · 3D 모델 타일 불러오는 중 (${((performance.now()-t0)/1000).toFixed(0)}초)`, Math.min(.6, (performance.now()-t0)/15000));
        await sleep(150);
      }
      setCam(); scene.render();
      patchDepth(true);
      const z = new Float64Array(N); let miss = 0;
      const lp = new C.Cartesian3(), wp = new C.Cartesian3(), win = new C.Cartesian2(), pp = new C.Cartesian3(), lc = new C.Cartesian3();
      for(let j=0;j<ny;j++){
        for(let i=0;i<nx;i++){
          lp.x = (i-(nx-1)/2)*dx; lp.y = (j-(ny-1)/2)*dx; lp.z = 0;
          C.Matrix4.multiplyByPoint(enu, lp, wp);
          const w = w2w(scene, wp, win); let p = w && scene.pickPosition(w, pp);
          if(p){ C.Matrix4.multiplyByPoint(inv, p, lc); z[j*nx+i] = lc.z; } else { z[j*nx+i] = NaN; miss++; }
        }
      }
      patchDepth(false);
      // 빈 칸 채우기 (이웃 평균)
      for(let pass=0; pass<200 && miss>0; pass++){
        let fixed = 0;
        for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const k=j*nx+i; if(!isNaN(z[k])) continue; let s=0,c=0;
          if(i>0&&!isNaN(z[k-1])){s+=z[k-1];c++;} if(i<nx-1&&!isNaN(z[k+1])){s+=z[k+1];c++;} if(j>0&&!isNaN(z[k-nx])){s+=z[k-nx];c++;} if(j<ny-1&&!isNaN(z[k+nx])){s+=z[k+nx];c++;}
          if(c){ z[k]=s/c; fixed++; } }
        miss -= fixed; if(!fixed) break;
      }
      if(miss>0) for(let k=0;k<N;k++) if(isNaN(z[k])) z[k]=0;
      let zmin=Infinity, zmax=-Infinity; for(let k=0;k<N;k++){ if(z[k]<zmin) zmin=z[k]; if(z[k]>zmax) zmax=z[k]; }
      return { nx, ny, N, dx, dom, enu, m:C.Matrix4.toArray(enu), inv, origin:C.Cartesian3.clone(origin), z, zmin, zmax, readMs: performance.now()-t0 };
    } finally {
      patchDepth(false);
      camera.frustum = save.fr;
      camera.setView({ destination:save.pos, orientation:{ direction:save.dir, up:save.up } });
      ssc.enableInputs = prevIn;
      if(FB.prim) FB.prim.show = true; for(const e of FB.ents) e.show = true;
      scene.requestRender && scene.requestRender();
    }
  }

  /* ---------- 계산 준비 ---------- */
  function initSim(){
    const g = FB.grid, { nx, ny, N, dx, z } = g, o = FB.opt;
    const S = { t:0, steps:0, vin:0, vout:0, h:new Float64Array(N), qx:new Float64Array((nx+1)*ny), qy:new Float64Array(nx*(ny+1)), fac:new Float64Array(N), out:new Float64Array(N), arr:new Float32Array(N).fill(-1), src:[], srcInfo:'' , mode:o.mode, vol:o.vol, rain:o.rain, n:o.n };
    const ci = (nx-1)/2, cj = (ny-1)/2;
    const cellsWithin = r => { const a=[]; const R=Math.ceil(r/dx)+1; for(let j=Math.max(0,Math.floor(cj-R)); j<=Math.min(ny-1,Math.ceil(cj+R)); j++) for(let i=Math.max(0,Math.floor(ci-R)); i<=Math.min(nx-1,Math.ceil(ci+R)); i++){ const x=(i-ci)*dx, y=(j-cj)*dx; if(x*x+y*y<=r*r) a.push(j*nx+i); } if(!a.length) a.push(Math.round(cj)*nx+Math.round(ci)); return a; };
    if(o.mode==='burst'){
      const r = Math.max(dx*1.5, Math.sqrt(o.vol/(Math.PI*TANK_H)));
      const cells = cellsWithin(r);
      let lo = Math.min(...cells.map(k=>z[k])), hi = lo + o.vol/(cells.length*dx*dx) + (Math.max(...cells.map(k=>z[k]))-lo) + 1;
      const volAt = L => { let v=0; for(const k of cells) if(L>z[k]) v += (L-z[k])*dx*dx; return v; };
      for(let it=0; it<80; it++){ const mid=(lo+hi)/2; if(volAt(mid) < o.vol) lo=mid; else hi=mid; }
      const L = (lo+hi)/2; let v=0; for(const k of cells) if(L>z[k]){ S.h[k] = L-z[k]; v += S.h[k]*dx*dx; }
      const sc = o.vol/v; for(const k of cells) S.h[k] *= sc;
      S.vin = o.vol; S.srcInfo = `반경 ${r.toFixed(0)} m 저수지 (수면 높이 약 ${(L - Math.min(...cells.map(k=>z[k]))).toFixed(1)} m)`;
    } else if(o.mode==='inflow'){
      S.src = cellsWithin(Math.max(2*dx, 8)); S.T = 600; S.Qp = 2*o.vol/S.T; S.srcInfo = `10분간 쏟아짐 · 최대 ${Math.round(S.Qp)} ㎥/s`;
    } else {
      S.rainRate = o.rain/1000/3600; S.rainDur = 1800; S.srcInfo = `시간당 ${o.rain} mm × 30분 · 총 ${fmtV(S.rainRate*S.rainDur*N*dx*dx)}`;
    }
    FB.sim = S;
  }

  /* ---------- 한 단계 계산 (국부관성) ---------- */
  function step(){
    const g = FB.grid, S = FB.sim, { nx, ny, N, dx, z } = g, { h, qx, qy, fac, out, arr } = S;
    const n2 = S.n*S.n;
    let hmax = 0; for(let k=0;k<N;k++) if(h[k]>hmax) hmax = h[k];
    let dt = hmax>0.01 ? Math.min(2, ALPHA*dx/Math.sqrt(G*hmax)) : 2;
    // 외부 유입
    let add = 0;
    if(S.mode==='inflow' && S.t < S.T){ const tp=S.T/3, Q = S.t<tp ? S.Qp*S.t/tp : S.Qp*(S.T-S.t)/(S.T-tp); const dv = Math.max(0,Q)*dt; const dh = dv/(S.src.length*dx*dx); for(const k of S.src) h[k]+=dh; add = dv; dt = Math.min(dt, 1); }
    else if(S.mode==='rain' && S.t < S.rainDur){ const dh = S.rainRate*dt; for(let k=0;k<N;k++) h[k]+=dh; add = dh*N*dx*dx; }
    S.vin += add;
    const nx1 = nx+1;
    // x 방향 경계 유량
    for(let j=0;j<ny;j++){
      const row = j*nx, frow = j*nx1;
      for(let i=1;i<nx;i++){
        const k1=row+i-1, k2=k1+1; if(h[k1]<=HMIN && h[k2]<=HMIN){ qx[frow+i]=0; continue; } const e1=z[k1]+h[k1], e2=z[k2]+h[k2];
        const hf = (e1>e2?e1:e2) - (z[k1]>z[k2]?z[k1]:z[k2]); const f = frow+i;
        if(hf<=HMIN){ qx[f]=0; continue; }
        let q = qx[f]; q = (q - G*hf*dt*(e2-e1)/dx) / (1 + G*dt*n2*Math.abs(q)/(hf*hf*Math.cbrt(hf)));
        const qm = hf*Math.sqrt(G*hf)*FR_MAX; qx[f] = q>qm ? qm : q<-qm ? -qm : q;
      }
      // 열린 경계 (왼쪽 / 오른쪽)
      { const k=row, hh=h[k]; const s0=Math.max(0.005,(z[k+1]-z[k])/dx); qx[frow] = hh>HMIN ? -Math.min(Math.pow(hh,5/3)*Math.sqrt(s0)/S.n, hh*Math.sqrt(G*hh)) : 0; }
      { const k=row+nx-1, hh=h[k]; const s0=Math.max(0.005,(z[k-1]-z[k])/dx); qx[frow+nx] = hh>HMIN ? Math.min(Math.pow(hh,5/3)*Math.sqrt(s0)/S.n, hh*Math.sqrt(G*hh)) : 0; }
    }
    // y 방향
    for(let j=1;j<ny;j++){
      const f0 = j*nx;
      for(let i=0;i<nx;i++){
        const k1=(j-1)*nx+i, k2=k1+nx; if(h[k1]<=HMIN && h[k2]<=HMIN){ qy[f0+i]=0; continue; } const e1=z[k1]+h[k1], e2=z[k2]+h[k2];
        const hf = (e1>e2?e1:e2) - (z[k1]>z[k2]?z[k1]:z[k2]); const f = f0+i;
        if(hf<=HMIN){ qy[f]=0; continue; }
        let q = qy[f]; q = (q - G*hf*dt*(e2-e1)/dx) / (1 + G*dt*n2*Math.abs(q)/(hf*hf*Math.cbrt(hf)));
        const qm = hf*Math.sqrt(G*hf)*FR_MAX; qy[f] = q>qm ? qm : q<-qm ? -qm : q;
      }
    }
    for(let i=0;i<nx;i++){
      { const k=i, hh=h[k]; const s0=Math.max(0.005,(z[k+nx]-z[k])/dx); qy[i] = hh>HMIN ? -Math.min(Math.pow(hh,5/3)*Math.sqrt(s0)/S.n, hh*Math.sqrt(G*hh)) : 0; }
      { const k=(ny-1)*nx+i, hh=h[k]; const s0=Math.max(0.005,(z[k-nx]-z[k])/dx); qy[ny*nx+i] = hh>HMIN ? Math.min(Math.pow(hh,5/3)*Math.sqrt(s0)/S.n, hh*Math.sqrt(G*hh)) : 0; }
    }
    // 질량 보존 제한: 셀이 내보내는 물 ≤ 가진 물
    out.fill(0);
    for(let j=0;j<ny;j++){ const row=j*nx, frow=j*nx1; for(let i=0;i<=nx;i++){ const q=qx[frow+i]; if(q>0){ if(i>0) out[row+i-1]+=q; } else if(q<0){ if(i<nx) out[row+i]-=q; } } }
    for(let j=0;j<=ny;j++){ const f0=j*nx; for(let i=0;i<nx;i++){ const q=qy[f0+i]; if(q>0){ if(j>0) out[(j-1)*nx+i]+=q; } else if(q<0){ if(j<ny) out[j*nx+i]-=q; } } }
    for(let k=0;k<N;k++){ const o=out[k]*dt; fac[k] = o>h[k]*dx ? (o>0 ? h[k]*dx/o : 0) : 1; }
    const c = dt/dx; let vout = 0;
    for(let j=0;j<ny;j++){ const row=j*nx, frow=j*nx1; for(let i=0;i<=nx;i++){ const f=frow+i; let q=qx[f]; if(q===0) continue;
      if(q>0){ if(i>0) q*=fac[row+i-1]; } else { if(i<nx) q*=fac[row+i]; }
      qx[f]=q; if(i>0) h[row+i-1]-=q*c; else vout += -q*dt*dx; if(i<nx) h[row+i]+=q*c; else vout += q*dt*dx; } }
    for(let j=0;j<=ny;j++){ const f0=j*nx; for(let i=0;i<nx;i++){ const f=f0+i; let q=qy[f]; if(q===0) continue;
      if(q>0){ if(j>0) q*=fac[(j-1)*nx+i]; } else { if(j<ny) q*=fac[j*nx+i]; }
      qy[f]=q; if(j>0) h[(j-1)*nx+i]-=q*c; else vout += -q*dt*dx; if(j<ny) h[j*nx+i]+=q*c; else vout += q*dt*dx; } }
    S.vout += vout;
    S.t += dt; S.steps++;
    for(let k=0;k<N;k++){ if(h[k]<0) h[k]=0; if(arr[k]<0 && h[k]>0.1) arr[k]=S.t; }
  }

  /* ---------- 통계 ---------- */
  function cellSpeed(k, i, j){
    const g=FB.grid, S=FB.sim, nx=g.nx, h=S.h[k]; if(h<0.1) return 0;
    const ux = (S.qx[j*(nx+1)+i] + S.qx[j*(nx+1)+i+1])/2, uy = (S.qy[j*nx+i] + S.qy[(j+1)*nx+i])/2;
    return Math.sqrt(ux*ux+uy*uy)/h;
  }
  function stats(){
    const g=FB.grid, S=FB.sim, { nx, ny, N, dx } = g; const ci=(nx-1)/2, cj=(ny-1)/2;
    let a1=0, a5=0, hm=0, um=0, r2=0, vs=0;
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const k=j*nx+i, h=S.h[k]; vs+=h; if(h<0.05) continue;
      const x=(i-ci), y=(j-cj), d2=x*x+y*y; if(d2>r2) r2=d2; if(h>0.1) a1++; if(h>0.5) a5++; if(h>hm) hm=h; const u=cellSpeed(k,i,j); if(u>um) um=u; }
    vs *= dx*dx;
    const err = S.vin>0 ? (vs + S.vout - S.vin)/S.vin*100 : 0;
    FB.stats = { a1:a1*dx*dx, a5:a5*dx*dx, hm, um, reach:Math.sqrt(r2)*dx, vs, err };
    $q('#fbcT').textContent = fmtT(S.t);
    $q('#fbcVin').textContent = fmtV(S.vin);
    $q('#fbcA').textContent = fmtA(FB.stats.a1);
    $q('#fbcA5').textContent = fmtA(FB.stats.a5);
    $q('#fbcH').textContent = hm.toFixed(2)+' m';
    $q('#fbcU').textContent = um.toFixed(1)+' m/s';
    $q('#fbcR').textContent = Math.round(FB.stats.reach)+' m';
    $q('#fbcOut').textContent = fmtV(S.vout);
    $q('#fbcM').textContent = (Math.abs(err)<0.01?'0.00':err.toFixed(2))+' %';
    $q('#fbcS').textContent = `${nx}×${ny} · ${S.steps.toLocaleString()}`;
  }

  /* ---------- 물 표면 그리기 ---------- */
  const VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;
out vec4 v_color;
void main(){ vec4 p = czm_computePosition(); v_color = color; gl_Position = czm_modelViewProjectionRelativeToEye * p; }`;
  const FS = `
in vec4 v_color;
void main(){ out_FragColor = v_color; }`;
  const appearance = () => new C.Appearance({ translucent:true, closed:false, vertexShaderSource:VS, fragmentShaderSource:FS, renderState: C.Appearance.getDefaultRenderState(true, false, { cull:{ enabled:false } }) });

  function draw(force){
    const g=FB.grid, S=FB.sim; if(!g||!S) return;
    const t0 = performance.now();
    const { nx, ny, dx, m } = g, h=S.h, z=g.z, N1=(nx+1)*(ny+1), nx1=nx+1;
    const se = FB._se && FB._se.length===N1 ? FB._se : (FB._se = new Float64Array(N1)), sv = FB._sv && FB._sv.length===N1 ? FB._sv : (FB._sv = new Float64Array(N1)), sc = FB._sc && FB._sc.length===N1 ? FB._sc : (FB._sc = new Uint8Array(N1)), vi = FB._vi && FB._vi.length===N1 ? FB._vi : (FB._vi = new Int32Array(N1));
    se.fill(0); sv.fill(0); sc.fill(0); vi.fill(-1);
    const view = FB.opt.view; let wet = 0;
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const k=j*nx+i, hh=h[k]; if(hh<WET) continue; wet++;
      const e = z[k]+hh; const val = view==='depth' ? hh : view==='speed' ? cellSpeed(k,i,j) : (S.arr[k]>=0 ? S.arr[k]/60 : 999);
      const n0=j*nx1+i; for(const n of [n0, n0+1, n0+nx1, n0+nx1+1]){ se[n]+=e; sv[n]+= (val===999 ? 0 : val); sc[n]++; } }
    const old = FB.prim;
    if(!wet){ if(old){ scene.primitives.remove(old); FB.prim=null; } return; }
    let nv=0; for(let n=0;n<N1;n++) if(sc[n]) vi[n]=nv++;
    const pos = new Float64Array(nv*3), col = new Uint8Array(nv*4), idx = new Uint32Array(wet*6), rgba=[0,0,0,0];
    const stops = RAMP[view].stops, cx=(nx)/2, cy=(ny)/2;
    for(let j=0;j<=ny;j++) for(let i=0;i<=nx;i++){ const n=j*nx1+i, v=vi[n]; if(v<0) continue;
      const x=(i-cx)*dx, y=(j-cy)*dx, zz=se[n]/sc[n]+0.06;
      pos[v*3] = m[0]*x+m[4]*y+m[8]*zz+m[12]; pos[v*3+1] = m[1]*x+m[5]*y+m[9]*zz+m[13]; pos[v*3+2] = m[2]*x+m[6]*y+m[10]*zz+m[14];
      ramp(stops, sv[n]/sc[n], rgba); col[v*4]=rgba[0]; col[v*4+1]=rgba[1]; col[v*4+2]=rgba[2]; col[v*4+3]=Math.round(rgba[3]*255); }
    let t=0; for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const k=j*nx+i; if(h[k]<WET) continue; const n0=j*nx1+i, a=vi[n0], b=vi[n0+1], c=vi[n0+nx1+1], d=vi[n0+nx1]; idx[t++]=a; idx[t++]=b; idx[t++]=c; idx[t++]=a; idx[t++]=c; idx[t++]=d; }
    const geom = new C.Geometry({ attributes:{ position:new C.GeometryAttribute({ componentDatatype:C.ComponentDatatype.DOUBLE, componentsPerAttribute:3, values:pos }), color:new C.GeometryAttribute({ componentDatatype:C.ComponentDatatype.UNSIGNED_BYTE, componentsPerAttribute:4, normalize:true, values:col }) }, indices:idx, primitiveType:C.PrimitiveType.TRIANGLES, boundingSphere:C.BoundingSphere.fromVertices(pos) });
    const prim = new C.Primitive({ geometryInstances:new C.GeometryInstance({ geometry:geom }), appearance:appearance(), asynchronous:false, compressVertices:false, vertexCacheOptimize:false, allowPicking:false, releaseGeometryInstances:true });
    scene.primitives.add(prim); FB.prim = prim;
    if(old) scene.primitives.remove(old);
    scene.requestRender && scene.requestRender();
    FB.drawMs = performance.now()-t0;
  }

  /* ---------- 진행 루프 ---------- */
  function tick(now){
    FB.raf = requestAnimationFrame(tick);
    if(!FB.sim || FB.phase!=='running') return;
    const el = now-FB.lastNow, wall = Math.min(1.2, el/1000); FB.lastNow = now;
    const sp = FB.opt.speed, target = sp>0 ? FB.sim.t + wall*sp : Infinity;
    const t0 = performance.now();
    const budget = Math.min(400, Math.max(12, el*0.45));
    while(FB.sim.t < target && performance.now()-t0 < budget) step();
    if(FB.sim.t >= SIM_MAX){ FB.phase='paused'; updButtons(); toast('2시간(현실 시간) 계산을 마쳤습니다', 3000); }
    const drawEvery = Math.max(300, FB.drawMs*6);
    if(now-FB.lastDraw > drawEvery){ FB.lastDraw = now; stats(); draw(); statusRun(); }
  }
  function statusRun(){
    const S=FB.sim, st=FB.stats||{}; const real = (performance.now()-FB.wallStart)/1000;
    setStatus(`<b>${S.mode==='rain'?'집중호우':tonName(S.vol)+(S.mode==='burst'?' 붕괴':' 급속 유입')}</b> · ${S.srcInfo}<br>현실 ${fmtT(S.t)} 경과 · 화면 ${fmtT(real)} (×${(S.t/Math.max(real,0.1)).toFixed(0)}) ${FB.phase==='paused'?'· <b>일시정지</b>':''}`);
  }

  /* ---------- 클릭 → 방류 ---------- */
  function clearAll(){
    if(FB.prim){ scene.primitives.remove(FB.prim); FB.prim=null; }
    for(const e of FB.ents) viewer.entities.remove(e); FB.ents=[];
    FB.sim=null; FB.grid=null; FB.phase='idle'; tip.style.display='none';
    ['fbcT','fbcVin','fbcA','fbcA5','fbcH','fbcU','fbcR','fbcOut','fbcM','fbcS'].forEach(id=>{ const el=$q('#'+id); if(el) el.textContent='—'; });
    updButtons(); scene.requestRender && scene.requestRender();
  }
  function markers(origin){
    for(const e of FB.ents) viewer.entities.remove(e); FB.ents=[];
    const g=FB.grid, o=FB.opt;
    FB.ents.push(viewer.entities.add({ position:origin, point:{ pixelSize:13, color:C.Color.fromCssColorString('#3FC7FF'), outlineColor:C.Color.WHITE, outlineWidth:2, disableDepthTestDistance:Number.POSITIVE_INFINITY },
      label:{ text: o.mode==='rain' ? `집중호우 ${o.rain} mm/h` : `방류 ${tonName(o.vol)}`, font:'700 13px Inter, "Noto Sans KR", sans-serif', fillColor:C.Color.WHITE, outlineColor:C.Color.fromCssColorString('#03122A'), outlineWidth:4, style:C.LabelStyle.FILL_AND_OUTLINE, pixelOffset:new C.Cartesian2(0,-20), disableDepthTestDistance:Number.POSITIVE_INFINITY } }));
    const half = g.nx*g.dx/2, pts=[[-half,-half],[half,-half],[half,half],[-half,half],[-half,-half]].map(([x,y])=>C.Matrix4.multiplyByPoint(g.enu, new C.Cartesian3(x,y,0), new C.Cartesian3()));
    FB.ents.push(viewer.entities.add({ polyline:{ positions:pts, width:2, clampToGround:true, material:new C.PolylineDashMaterialProperty({ color:C.Color.fromCssColorString('#BFE33A').withAlpha(.85), dashLength:16 }) } }));
  }
  async function burst(origin){
    if(FB.phase==='reading') return;
    const o = FB.opt;
    FB.phase='reading'; updButtons();
    if(FB.prim){ scene.primitives.remove(FB.prim); FB.prim=null; }
    FB.sim=null;
    try{
      const same = FB.grid && FB.grid.dom===o.dom && FB.grid.dx===o.cell && C.Cartesian3.distance(FB.grid.origin, origin)<0.5;
      if(!same){ setStatus('지형 읽는 중 · 클릭 지점 위에서 수직으로 내려다보며 3D 모델 높이를 격자로 읽습니다', 0.05); FB.grid = await readDSM(origin, o.dom, o.cell); }
      markers(FB.grid.origin);
      initSim(); FB.phase='running'; FB.lastNow=performance.now(); FB.wallStart=performance.now(); FB.lastDraw=0;
      const g=FB.grid; toast(`지형 ${g.nx}×${g.ny} 격자 (${g.dx} m) ${same?'재사용':'읽기 '+(g.readMs/1000).toFixed(1)+'초'} · 높이 ${g.zmin.toFixed(1)}~${g.zmax.toFixed(1)} m`, 3500);
      stats(); draw(); statusRun();
    }catch(e){ FB.phase='idle'; setStatus('지형 읽기 실패: '+e.message); console.error(e); }
    updButtons();
  }

  const _prevClick = handler.getInputAction(C.ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(e => {
    if(!FB.on) return _prevClick && _prevClick(e);
    if(FB.phase==='reading') return;
    let p = null; if(scene.pickPositionSupported) p = scene.pickPosition(e.position);
    if(!p){ const ray = camera.getPickRay(e.position); p = ray && globe.pick(ray, scene); }
    if(!p) return;
    burst(p);
  }, C.ScreenSpaceEventType.LEFT_CLICK);

  const _prevMove = handler.getInputAction(C.ScreenSpaceEventType.MOUSE_MOVE);
  let lastMove = 0;
  handler.setInputAction(e => {
    if(_prevMove) _prevMove(e);
    if(!FB.on || !FB.sim || FB.phase==='reading'){ tip.style.display='none'; return; }
    const now = performance.now(); if(now-lastMove<80) return; lastMove = now;
    const p = scene.pickPosition(e.endPosition); if(!p){ tip.style.display='none'; return; }
    const g=FB.grid, S=FB.sim, l = C.Matrix4.multiplyByPoint(g.inv, p, new C.Cartesian3());
    const i = Math.round(l.x/g.dx + (g.nx-1)/2), j = Math.round(l.y/g.dx + (g.ny-1)/2);
    if(i<0||j<0||i>=g.nx||j>=g.ny){ tip.style.display='none'; return; }
    const k=j*g.nx+i, h=S.h[k];
    tip.innerHTML = `수심 <b>${h<0.005?'0':h<0.1?(h*100).toFixed(0)+' cm':h.toFixed(2)+' m'}</b> · 유속 <b>${cellSpeed(k,i,j).toFixed(1)} m/s</b><br>처음 10 cm 잠긴 시각 <b>${S.arr[k]>=0?fmtT(S.arr[k]):'아직'}</b> · 방류점에서 ${Math.round(Math.hypot(l.x,l.y))} m`;
    const r = scene.canvas.getBoundingClientRect(); tip.style.left = (r.left+e.endPosition.x+14)+'px'; tip.style.top = (r.top+e.endPosition.y+14)+'px'; tip.style.display='block';
  }, C.ScreenSpaceEventType.MOUSE_MOVE);

  /* ---------- 켜기/끄기 ---------- */
  function on(){ FB.on = true; panel.classList.add('open'); syncSeg(); setStatus(idleMsg()); updButtons(); viewer.canvas.style.cursor='crosshair'; if(!FB.raf) FB.raf = requestAnimationFrame(tick); toast('물 방류 시뮬레이션 켜짐 · 3D 모델을 클릭하세요', 2500); }
  function off(){ FB.on = false; clearAll(); panel.classList.remove('open'); viewer.canvas.style.cursor=''; if(FB.raf){ cancelAnimationFrame(FB.raf); FB.raf=0; } patchDepth(false); FB._se=FB._sv=FB._sc=FB._vi=null; }
  const _t = toggleLayer;
  toggleLayer = async function(id, force){
    if(id === 'fburst'){ const want = force!==undefined ? force : !STATE.on.has('fburst'); if(want){ STATE.on.add('fburst'); on(); } else { STATE.on.delete('fburst'); off(); } try{ renderCats(); renderSub(); updateSrc(); }catch(e){} return; }
    return _t.apply(this, arguments);
  };

  window.__FBURST = { FB, step, draw, stats, burst, readDSM, version:'0.1' };
})();
