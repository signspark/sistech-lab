/* =====================================================================
   SISTECH LAB · 기본 뼈대 (lab-core.js) · v1.0 (2026-10-10)
   목적: SISTECH EARTH를 건드리지 않고 새 기능을 가볍게 실험 → 검증된 것만 EARTH로 옮김
   EARTH 호환 전역 (실험 코드가 EARTH addon과 같은 이름을 쓰도록):
     Cesium · viewer · scene · camera · globe · handler · $ · toast · fmtKm
     STATE{mode,cat,on,measure,point,sse,tsAlpha,quality,stage} · PROJECTS · TILESET_BASE · ensureTileset
     MENUS{site,earth} · renderCats() · renderSub() · toggleLayer(id,force) · updateSrc() · closeAllPanels()
     setMode(m) · flyToProject(id) · cycleQuality() · cycleOpacity() · #card/#cardTitle/#cardBody/#cardClose · #settings · #hudSrc
   EARTH와 다른 점: EARTH 모드(지구·위성·날씨 레이어) 없음 · SITE 전용 · 실험은 exp/*.js 파일 하나씩 (?exp=이름)
   ===================================================================== */
window.__initialHash = location.hash;
const LAB_VERSION = '1.0';
const $ = s => document.querySelector(s);
const toast = (m, ms=2600) => { const t=$('#toast'); t.textContent=m; t.classList.add('open'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('open'), ms); };
const fmtKm = m => m>=1e6 ? (m/1e6).toFixed(1)+'천 km' : m>=1000 ? (m/1000).toFixed(m<1e4?1:0)+' km' : Math.round(m)+' m';

/* ---------- 프로젝트 (SISTECH 3D 모델 · EARTH와 동일) ---------- */
const PROJECTS = [
  { id:'incheon1', name:'인천', desc:'인천 전체 3D 모델', lat:37.4561, lon:126.7052, area:'인천광역시', tsId:'incheon_01' },
  { id:'busan1', name:'부산', desc:'부산 마린시티·해운대 3D 모델', lat:35.1565, lon:129.1455, area:'부산 해운대구', tsId:'busan_01' },
  { id:'bundang1', name:'분당', desc:'분당 신도시 3D 모델', lat:37.3826, lon:127.1189, area:'성남시 분당구', tsId:'bundang_01' },
  { id:'goyang1', name:'고양', desc:'고양시 3D 모델', lat:37.6584, lon:126.8320, area:'고양시', tsId:'goyang_01' },
];
// 3D-View 타일 서버는 signspark.github.io 출처의 요청만 받음 → LAB도 signspark.github.io 아래에서만 3D 타일이 보임
const TILESET_BASE = 'https://3dview.sistech3d.com/api/tileset/project/';

/* ---------- Cesium 초기화 ---------- */
Cesium.Ion.defaultAccessToken = undefined;
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const VW_KEY = '57C7018D-1A36-4873-99CD-A2272BD3040E'; // 브이월드 키 · signspark.github.io 도메인 전용
const creditBox = document.createElement('div'); creditBox.style.display='none'; document.body.appendChild(creditBox);
const viewer = new Cesium.Viewer('cesium', {
  baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({ url: ESRI, maximumLevel: 19, credit: 'Esri, Maxar, Earthstar Geographics' })),
  animation:false, timeline:false, geocoder:false, homeButton:false, sceneModePicker:false, baseLayerPicker:false,
  navigationHelpButton:false, fullscreenButton:false, infoBox:false, selectionIndicator:false, creditContainer: creditBox,
});
const scene = viewer.scene, camera = viewer.camera, globe = scene.globe;
globe.enableLighting = false; globe.showGroundAtmosphere = true; scene.skyAtmosphere.show = true;
globe.baseColor = Cesium.Color.fromCssColorString('#06224A');
scene.screenSpaceCameraController.minimumZoomDistance = 2;
viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
// 지형: Esri World Elevation (키 불필요, EARTH와 동일)
Cesium.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer')
  .then(tp => { viewer.terrainProvider = tp; globe.depthTestAgainstTerrain = false; STATE.terrain = true; updateSrc(); }).catch(e => toast('지형 로드 실패: '+e.message));

/* ---------- 배경 영상: 국내 브이월드 + 국외 Esri (EARTH addon 48 방식) ---------- */
const BASE = { src:'vworld', layers:[] };
function setBasemap(src){
  BASE.src = src;
  if(src==='vworld' && !BASE.layers.length){
    [[124.5,33.9,130.0,38.7],[126.0,33.0,127.0,33.9],[130.0,37.0,132.0,38.0]].forEach(r => {
      BASE.layers.push(viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url:'https://api.vworld.kr/req/wmts/1.0.0/'+VW_KEY+'/Satellite/{z}/{y}/{x}.jpeg', minimumLevel:6, maximumLevel:19, rectangle:Cesium.Rectangle.fromDegrees(...r), credit:'브이월드(국토교통부)' }), 1));
    });
  }
  BASE.layers.forEach(l => l.show = src==='vworld');
  try{ localStorage.setItem('lab.basemap', src); }catch(e){}
  document.querySelectorAll('#segBase button').forEach(b => b.classList.toggle('on', b.dataset.v===src));
  updateSrc();
}

/* ---------- 상태 · 메뉴 ---------- */
const STATE = { mode:'site', cat:'model', on:new Set(['imagery','tiles']), stage:'site', measure:null, point:null, data:{}, sse:16, tsAlpha:1, quality:'중' };
const I = {
  model:'<svg viewBox="0 0 24 24"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
  lab:'<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/><path d="M7 15h10"/></svg>',
  analysis:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  export:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
};
const MENUS = {
  site: [
    { id:'model', name:'3D 모델', icon:I.model, projects:true, items:[
      { id:'tiles', q:'드론 3D 모델 보기', name:'3D Tiles (SISTECH)', src:'3dview.sistech3d.com 타일셋 · 화면 중심 20 km 안 가까운 2곳 자동 로드 · 40 km 밖 해제', type:'layer' },
      { id:'quality', q:'화질을 바꾸려면', name:'화질 (저 → 중 → 고)', src:'maximumScreenSpaceError 32 · 16 · 6', type:'action', run:()=>cycleQuality() },
      { id:'opacity', q:'모델을 반투명하게', name:'투명도 (100 → 70 → 40%)', src:'', type:'action', run:()=>cycleOpacity() },
    ]},
    { id:'lab', name:'실험', icon:I.lab, items:[] },          // exp/index.json 목록 (켜면 주소 ?exp= 로 다시 불러옴)
    { id:'analysis', name:'분석', icon:I.analysis, items:[] }, // EARTH addon이 분석 항목을 넣는 자리 (호환용)
    { id:'export', name:'내보내기', icon:I.export, items:[
      { id:'png', q:'화면을 저장', name:'PNG 저장', src:'현재 화면', type:'action', run:()=>savePng() },
      { id:'link', q:'지금 화면 주소 복사', name:'화면 주소 복사', src:'위치·켜진 실험 포함', type:'action', run:()=>copyLink() },
    ]},
  ],
  earth: [],
};
MENUS.earth = MENUS.site; // EARTH 모드는 없음 (addon이 MENUS.earth를 참조해도 오류 없게)

function renderCats(){
  const cats = MENUS.site;
  const el = $('#cats');
  el.innerHTML = `<div class="hd"><span>LAB</span></div>` +
    cats.map(c=>{ const n = c.items.filter(i=>STATE.on.has(i.id)).length; return `<button class="cat ${STATE.cat===c.id?'on':''}" data-cat="${c.id}">${c.icon}<span class="n">${c.name}${n?`<span class="cnt">${n}</span>`:''}</span></button>`; }).join('') +
    `<div class="quick"><button data-q="me">내 위치</button><button data-q="home">인천으로</button></div>`;
  el.querySelectorAll('.cat').forEach(b=>b.onclick=()=>{ STATE.cat = STATE.cat===b.dataset.cat?null:b.dataset.cat; renderCats(); renderSub(); });
  el.querySelectorAll('.quick button').forEach(b=>b.onclick=()=>{ if(b.dataset.q==='home') flyToProject('incheon1'); else goMyLocation(); });
}
function renderSub(){
  const cat = MENUS.site.find(c=>c.id===STATE.cat);
  const sub = $('#sub');
  if(!cat){ sub.classList.remove('open'); return; }
  sub.classList.add('open');
  $('#subTitle').textContent = cat.name;
  const only = $('#onlyOn').checked;
  let html = '';
  if(cat.projects) html += `<div class="note">SISTECH 3D 모델 · 클릭하면 현장으로 이동</div>` + PROJECTS.map(p=>`<button class="proj" data-p="${p.id}"><span class="pin"></span><span><b>${p.name}</b> <small style="color:var(--text-dim)">${tsStatus(p)}</small></span></button>`).join('');
  if(cat.id==='lab') html += `<div class="note">실험은 파일 하나씩 (exp/*.js) · 누르면 그 실험을 켜고 페이지를 다시 불러옵니다 · 지금 켜진 실험: <b>${LAB.loaded.length? LAB.loaded.join(', ') : '없음'}</b></div>`;
  const items = cat.items.filter(i=>!only || STATE.on.has(i.id));
  html += items.map(i=>{
    const on = STATE.on.has(i.id);
    const cls = ['item', i.type, on?'on':''].join(' ');
    const badge = i.type==='soon'?'<span class="badge">준비 중</span>': i.locked?'<span class="badge">기본</span>':'';
    return `<button class="${cls}" data-i="${i.id}" title="${i.q||''}"><span class="ind"></span><span class="t"><b>${i.name}</b><span>${i.q||''}</span>${i.src?`<span class="src">${i.src}</span>`:''}</span>${badge}</button>`;
  }).join('');
  if(cat.id==='lab' && !cat.items.length) html += `<div class="note">exp/index.json에 등록된 실험이 없습니다</div>`;
  $('#subList').innerHTML = html;
  $('#subCount').textContent = `${cat.items.filter(i=>STATE.on.has(i.id)).length} / ${cat.items.length} 켜짐`;
  sub.querySelectorAll('.proj').forEach(b=>b.onclick=()=>flyToProject(b.dataset.p));
  sub.querySelectorAll('.item').forEach(b=>b.onclick=()=>{
    const it = cat.items.find(x=>x.id===b.dataset.i); if(!it) return;
    if(it.type==='soon') return toast(`"${it.name}" 준비 중`);
    if(it.type==='action') return it.run && it.run();
    if(it.locked) return toast('기본 항목은 끌 수 없습니다');
    toggleLayer(it.id);
  });
}
$('#subBack').onclick = ()=>{ STATE.cat=null; renderCats(); renderSub(); };
$('#onlyOn').onchange = renderSub;

/* ---------- 레이어 토글 (실험 addon은 EARTH처럼 감싸서 확장: const _t = toggleLayer; toggleLayer = async function(id, force){ ... return _t.apply(this, arguments); }) ---------- */
async function toggleLayer(id, force){
  const want = force!==undefined ? force : !STATE.on.has(id);
  if(want) STATE.on.add(id); else STATE.on.delete(id);
  if(id==='tiles'){ for(const p of PROJECTS) if(p.ts) p.ts.show = want; if(want) autoLoadTileset(); }
  renderCats(); renderSub(); updateSrc(); saveHash();
}

/* ---------- 3D Tiles (EARTH와 동일한 로더 + 메모리 관리 addon 20 방식) ---------- */
const TS = { LOAD_KM:20, UNLOAD_KM:40, MAX_ACTIVE:2, CACHE:256*1024*1024 };
async function ensureTileset(p){
  if(!p.tsId || p.ts || p.tsLoading) return p.ts;
  p.tsLoading = true; toast(`${p.name} 3D 모델 불러오는 중…`); renderSub();
  try{
    const ts = await Cesium.Cesium3DTileset.fromUrl(`${TILESET_BASE}${p.tsId}/tileset.json`, { maximumScreenSpaceError: STATE.sse, skipLevelOfDetail: true, dynamicScreenSpaceError: true, cacheBytes: TS.CACHE, maximumCacheOverflowBytes: TS.CACHE, foveatedScreenSpaceError: true });
    p.ts = ts; scene.primitives.add(ts); ts.show = STATE.on.has('tiles'); applyTsStyle(ts);
    toast(`${p.name} 3D 모델 로드 완료`); updateSrc();
  }catch(e){ toast(`${p.name} 3D 모델 로드 실패: ${e.message}`, 5000); }
  p.tsLoading = false; renderSub(); return p.ts;
}
function applyTsStyle(ts){ ts.style = new Cesium.Cesium3DTileStyle({ color: `color('white', ${STATE.tsAlpha})` }); ts.maximumScreenSpaceError = STATE.sse; }
function viewCenter(){ const c = new Cesium.Cartesian2(scene.canvas.clientWidth/2, scene.canvas.clientHeight/2); const ray = camera.getPickRay(c); const p = ray && globe.pick(ray, scene); const ct = p ? Cesium.Cartographic.fromCartesian(p) : camera.positionCartographic; return { lat:Cesium.Math.toDegrees(ct.latitude), lon:Cesium.Math.toDegrees(ct.longitude) }; }
const distKm = (p, c) => { const R=6371, dLa=(p.lat-c.lat)*Math.PI/180, dLo=(p.lon-c.lon)*Math.PI/180; const a=Math.sin(dLa/2)**2+Math.cos(p.lat*Math.PI/180)*Math.cos(c.lat*Math.PI/180)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(a)); };
function unload(p){ if(!p.ts) return; try{ scene.primitives.remove(p.ts); }catch(e){} p.ts = null; }
function autoLoadTileset(){
  if(!STATE.on.has('tiles')) return;
  const ctr = viewCenter(), h = camera.positionCartographic.height; let active = 0;
  for(const { p, d } of PROJECTS.map(p=>({ p, d:distKm(p, ctr) })).sort((a,b)=>a.d-b.d)){
    if(d > TS.UNLOAD_KM){ unload(p); continue; }
    const want = h <= 120000 && d <= TS.LOAD_KM && active < TS.MAX_ACTIVE;
    if(want){ active++; if(!p.ts) ensureTileset(p); else p.ts.show = true; } else if(p.ts) p.ts.show = false;
  }
}
function tsStatus(p){ if(p.tsLoading) return '불러오는 중…'; if(p.ts && p.ts.show) return '표시 중 · '+Math.round(p.ts.totalMemoryUsageInBytes/1048576)+' MB'; if(p.ts) return '대기'; return ''; }
function cycleQuality(){ const seq = [['저',32],['중',16],['고',6]]; const i = seq.findIndex(s=>s[0]===STATE.quality); const n = seq[(i+1)%seq.length]; STATE.quality=n[0]; STATE.sse=n[1]; for(const p of PROJECTS) if(p.ts) p.ts.maximumScreenSpaceError = n[1]; toast(`3D 모델 화질: ${n[0]} (SSE ${n[1]})`); updateHud(); }
function cycleOpacity(){ const seq=[1,.7,.4]; STATE.tsAlpha = seq[(seq.indexOf(STATE.tsAlpha)+1)%seq.length]; for(const p of PROJECTS) if(p.ts) applyTsStyle(p.ts); toast(`3D 모델 투명도: ${Math.round(STATE.tsAlpha*100)}%`); }

/* ---------- 카메라 이동 ---------- */
function flyToProject(id){ const p = PROJECTS.find(x=>x.id===id); if(!p) return; camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat-0.0105, 900), orientation:{ heading:0, pitch:Cesium.Math.toRadians(-40), roll:0 }, duration: 2.4 }); }
function goMyLocation(){ if(!navigator.geolocation) return toast('이 브라우저는 위치를 지원하지 않습니다'); toast('내 위치 확인 중…'); navigator.geolocation.getCurrentPosition(pos=>camera.flyTo({ destination:Cesium.Cartesian3.fromDegrees(pos.coords.longitude, pos.coords.latitude-0.006, 600), orientation:{ heading:0, pitch:Cesium.Math.toRadians(-40), roll:0 }, duration:2.2 }), e=>toast('위치 확인 실패: '+e.message)); }
function setMode(m){ STATE.mode = 'site'; if(m==='earth') toast('LAB은 SITE 전용입니다 (EARTH 모드 없음)'); renderCats(); renderSub(); }

/* ---------- 카드 · 패널 ---------- */
$('#cardClose').onclick = ()=>{ $('#card').classList.remove('open'); STATE.point=null; };
function closeAllPanels(){ $('#card').classList.remove('open'); STATE.point = null; $('#settings').classList.remove('open'); STATE.cat = null; $('#sub').classList.remove('open'); }
function showPointCard(lat, lon, h){ STATE.point = { lat, lon }; $('#cardTitle').innerHTML = '지점<small>'+lat.toFixed(6)+', '+lon.toFixed(6)+'</small>'; $('#cardBody').innerHTML = `<div class="sec"><div class="kv"><div>위도<b>${lat.toFixed(7)}</b></div><div>경도<b>${lon.toFixed(7)}</b></div><div>높이(타원체고)<b>${h!=null? h.toFixed(2)+' m':'-'}</b></div></div><div class="meta">기본 클릭 카드 · 실험이 클릭을 쓰면 실험 동작이 우선합니다</div></div>`; $('#card').classList.add('open'); }

/* ---------- 클릭 · 마우스 (실험 addon은 EARTH처럼 handler.getInputAction()으로 이전 동작을 받아 감싸기) ---------- */
const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(e=>{
  let p = null; const picked = scene.pick(e.position);
  if(Cesium.defined(picked) && scene.pickPositionSupported) p = scene.pickPosition(e.position);
  if(!p){ const ray = camera.getPickRay(e.position); p = ray && globe.pick(ray, scene); }
  if(!p) return; const c = Cesium.Cartographic.fromCartesian(p);
  showPointCard(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude), c.height);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
handler.setInputAction(e=>{
  const ray = camera.getPickRay(e.endPosition); const p = ray && globe.pick(ray, scene);
  if(p){ const c = Cesium.Cartographic.fromCartesian(p); $('#hudCursor').innerHTML = '커서 <b>'+Cesium.Math.toDegrees(c.latitude).toFixed(5)+', '+Cesium.Math.toDegrees(c.longitude).toFixed(5)+'</b>'; }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

/* ---------- HUD · 출처 ---------- */
function updateSrc(){
  const parts = [BASE.src==='vworld' ? '<b>브이월드</b>(국토교통부) · <b>Esri</b>(국외) 영상' : '<b>Esri World Imagery</b> 영상'];
  const loaded = PROJECTS.filter(p=>p.ts && p.ts.show).map(p=>p.name); if(loaded.length) parts.push(`<b>SISTECH 3D Tiles</b> ${loaded.join(', ')} (DRONE)`);
  parts.push(STATE.terrain ? 'Esri World Elevation 지형' : '지형 불러오는 중');
  if(LAB.loaded.length) parts.push('실험: '+LAB.loaded.join(', '));
  $('#hudSrc').innerHTML = '출처: ' + parts.join(' · ') + ' · SISTECH LAB (실험용)';
}
function updateHud(){
  const h = camera.positionCartographic.height; $('#hudAlt').textContent = fmtKm(h);
  const mem = PROJECTS.reduce((s,p)=>s+(p.ts? p.ts.totalMemoryUsageInBytes : 0), 0)/1048576;
  $('#hudMem').textContent = Math.round(mem)+' MB'; $('#hudQ').textContent = STATE.quality;
  if(STATE.cat==='model') { const el = document.querySelectorAll('#subList .proj small'); PROJECTS.forEach((p,i)=>{ if(el[i]) el[i].textContent = tsStatus(p); }); }
}
camera.percentageChanged = 0.05;
camera.changed.addEventListener(()=>{ updateHud(); });
camera.moveEnd.addEventListener(()=>{ autoLoadTileset(); updateHud(); updateSrc(); saveHash(); });
setInterval(()=>{ updateHud(); }, 2000);

/* ---------- 주소 (#at=위도,경도,고도,방위,기울기 · EARTH와 같은 형식) ---------- */
function saveHash(){ const c = camera.positionCartographic; const at = [Cesium.Math.toDegrees(c.latitude).toFixed(5), Cesium.Math.toDegrees(c.longitude).toFixed(5), Math.round(c.height), Math.round(Cesium.Math.toDegrees(camera.heading)), Math.round(Cesium.Math.toDegrees(camera.pitch))].join(',');
  history.replaceState(null, '', location.pathname + location.search + '#at=' + at); }
function loadHash(){ const m = (window.__initialHash||'').match(/at=([-\d.]+),([-\d.]+),([-\d.]+),?([-\d.]*),?([-\d.]*)/); if(!m) return false;
  camera.setView({ destination: Cesium.Cartesian3.fromDegrees(+m[2], +m[1], +m[3]), orientation:{ heading:Cesium.Math.toRadians(+m[4]||0), pitch:Cesium.Math.toRadians(m[5]!==''? +m[5] : -40), roll:0 } }); return true; }

/* ---------- 내보내기 ---------- */
function savePng(){ scene.render(); const a = document.createElement('a'); a.href = scene.canvas.toDataURL('image/png'); a.download = 'SISTECH_LAB_'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'')+'.png'; a.click(); }
function copyLink(){ saveHash(); navigator.clipboard.writeText(location.href).then(()=>toast('화면 주소를 복사했습니다'), ()=>toast(location.href, 6000)); }

/* ---------- 설정 ---------- */
$('#btnSettings').onclick = ()=>{ $('#settings').classList.toggle('open'); };
document.querySelectorAll('#segBase button').forEach(b => b.onclick = ()=>setBasemap(b.dataset.v));

/* ---------- 저사양(내장 그래픽) 최적화 · EARTH addon 58과 같은 방식 ---------- */
const PERF = (()=>{
  let renderer = ''; try{ const gl = scene.context._gl; const ext = gl.getExtension('WEBGL_debug_renderer_info'); renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }catch(e){}
  const integrated = /Android|iPhone|iPad/i.test(navigator.userAgent) || /Intel|Iris|UHD|HD Graphics|Mali|Adreno|PowerVR|Apple GPU|SwiftShader|llvmpipe|Basic Render|Radeon\(TM\) Graphics/i.test(renderer);
  const P = { on: (localStorage.getItem('lab.perf') || (integrated ? 'on' : 'off')) === 'on', integrated, renderer, idle:false, last:performance.now(), moving:false, fps:null };
  const apply = () => { globe.maximumScreenSpaceError = P.on ? 4 : 2; document.querySelectorAll('#segPerf button').forEach(b => b.classList.toggle('on', (b.dataset.v==='on')===P.on)); };
  const setIdle = v => { if(P.idle===v) return; P.idle = v; viewer.targetFrameRate = v ? 6 : undefined; };
  const wake = () => { P.last = performance.now(); setIdle(false); };
  const busy = () => !viewer.useDefaultRenderLoop || P.moving || [...document.querySelectorAll('video')].some(v=>!v.paused && !v.ended && v.readyState>2) || PROJECTS.some(p=>p.ts && p.ts.show && !p.ts.tilesLoaded) || (window.LAB && LAB.busy && LAB.busy());
  ['pointerdown','pointermove','wheel','keydown','touchstart'].forEach(t => window.addEventListener(t, wake, { passive:true, capture:true }));
  camera.moveStart.addEventListener(()=>{ P.moving = true; wake(); }); camera.moveEnd.addEventListener(()=>{ P.moving = false; P.last = performance.now(); });
  setInterval(()=>{ if(!P.on){ setIdle(false); return; } if(busy()){ P.last = performance.now(); setIdle(false); return; } if(performance.now()-P.last > 8000) setIdle(true); }, 1000);
  let fr = 0; scene.postRender.addEventListener(()=>fr++); setInterval(()=>{ P.fps = fr/2; fr = 0; const el = $('#hudFps'); if(el) el.textContent = P.idle ? '대기' : P.fps.toFixed(0); }, 2000);
  document.querySelectorAll('#segPerf button').forEach(b => b.onclick = ()=>{ P.on = b.dataset.v==='on'; try{ localStorage.setItem('lab.perf', P.on?'on':'off'); }catch(e){} apply(); wake(); });
  P.wake = wake; apply(); return P;
})();

/* ---------- 실험 불러오기 (?exp=이름1,이름2 → exp/이름.js 를 순서대로) ---------- */
const LAB = { version:LAB_VERSION, loaded:[], failed:[], list:[], busy:null };
LAB.wanted = (new URLSearchParams(location.search).get('exp') || '').split(',').map(s=>s.trim()).filter(s=>/^[\w\-가-힣]+$/.test(s));
LAB.open = names => { const u = new URL(location.href); if(names.length) u.searchParams.set('exp', names.join(',')); else u.searchParams.delete('exp'); saveHash(); u.hash = location.hash; location.href = u.toString(); };
async function loadExperiments(){
  try{ const r = await fetch('exp/index.json?v='+Date.now()); if(r.ok){ LAB.list = (await r.json()).experiments || []; } }catch(e){}
  const cat = MENUS.site.find(c=>c.id==='lab');
  cat.items = LAB.list.map(x => ({ id:'exp:'+x.id, q:x.desc||'', name:x.name+(LAB.wanted.includes(x.id)?' · 켜짐':''), src:'exp/'+x.id+'.js'+(x.status? ' · '+x.status:''), type:'action', run:()=>{ const s = new Set(LAB.wanted); s.has(x.id) ? s.delete(x.id) : s.add(x.id); LAB.open([...s]); } }));
  if(LAB.wanted.length) cat.items.push({ id:'exp:none', q:'모든 실험 끄고 기본 뼈대만', name:'실험 모두 끄기', src:'', type:'action', run:()=>LAB.open([]) });
  for(const name of LAB.wanted){
    await new Promise(res => { const s = document.createElement('script'); s.src = 'exp/'+name+'.js?v='+Date.now(); s.onload = ()=>{ LAB.loaded.push(name); res(); }; s.onerror = ()=>{ LAB.failed.push(name); toast('실험 파일을 찾지 못했습니다: exp/'+name+'.js', 4000); res(); }; document.body.appendChild(s); });
  }
  try{ renderCats(); renderSub(); }catch(e){}
  updateSrc();
  if(LAB.loaded.length) toast('실험 켜짐: '+LAB.loaded.join(', '), 2500);
}

/* ---------- 시작 ---------- */
let savedBase = 'vworld'; try{ savedBase = localStorage.getItem('lab.basemap') || 'vworld'; }catch(e){}
setBasemap(savedBase);
if(!loadHash()) camera.setView({ destination: Cesium.Cartesian3.fromDegrees(126.6395, 37.3825, 700), orientation:{ heading:Cesium.Math.toRadians(20), pitch:Cesium.Math.toRadians(-38), roll:0 } }); // 기본: 송도 센트럴파크
renderCats(); renderSub(); updateSrc(); updateHud();
setTimeout(autoLoadTileset, 300);
loadExperiments();
window.LAB = LAB; window.PERF = PERF;
