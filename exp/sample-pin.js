/* ---------- 예시 실험: 지점 핀 찍기 (exp/sample-pin.js) ----------
   새 실험을 만들 때 이 파일을 복사해서 시작하세요. EARTH addon과 같은 방식으로 작성되어 있어
   나중에 SISTECH EARTH index.html 끝에 <script> 블록으로 거의 그대로 옮길 수 있습니다.
   규칙
   1) 전체를 즉시 실행 함수 (function(){ ... })(); 로 감쌈 · 전역 이름은 window.__이름 하나만 내보냄
   2) 메뉴: MENUS.site 의 기존 분류(analysis 등)에 항목을 넣거나 새 분류를 추가 → renderCats(); renderSub();
   3) 켜기/끄기: toggleLayer를 감싸서 자기 id만 처리, 나머지는 이전 함수로 넘김 (EARTH와 같은 체인 방식)
   4) 클릭: handler.getInputAction()으로 이전 동작을 받아 두고, 내 기능이 꺼져 있으면 이전 동작을 호출
   5) 끌 때 만든 개체·이벤트를 모두 정리 (메모리)
*/
(function(){
  const C = Cesium;
  const PIN = { on:false, ents:[] };

  /* 메뉴: 분석 분류 맨 위 */
  const an = MENUS.site.find(c=>c.id==='analysis');
  if(an && !an.items.some(i=>i.id==='pin')) an.items.unshift({ id:'pin', q:'지도를 눌러 핀을 꽂아 보기', name:'지점 핀 찍기 (예시 실험)', src:'클릭한 3D 모델·지형 표면에 핀 · 끄면 모두 지움', type:'layer' });
  try{ renderCats(); renderSub(); }catch(e){}

  /* 클릭 */
  const _prevClick = handler.getInputAction(C.ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(e => {
    if(!PIN.on) return _prevClick && _prevClick(e);
    let p = null; if(C.defined(scene.pick(e.position)) && scene.pickPositionSupported) p = scene.pickPosition(e.position);
    if(!p){ const ray = camera.getPickRay(e.position); p = ray && globe.pick(ray, scene); }
    if(!p) return;
    const c = C.Cartographic.fromCartesian(p);
    PIN.ents.push(viewer.entities.add({ position: p, point:{ pixelSize:12, color:C.Color.fromCssColorString('#BFE33A'), outlineColor:C.Color.fromCssColorString('#03122A'), outlineWidth:2, disableDepthTestDistance:Number.POSITIVE_INFINITY },
      label:{ text:'#'+(PIN.ents.length+1)+' '+c.height.toFixed(1)+' m', font:'600 12px Inter, "Noto Sans KR", sans-serif', fillColor:C.Color.WHITE, outlineColor:C.Color.fromCssColorString('#03122A'), outlineWidth:4, style:C.LabelStyle.FILL_AND_OUTLINE, pixelOffset:new C.Cartesian2(0,-16), disableDepthTestDistance:Number.POSITIVE_INFINITY } }));
    toast('핀 '+PIN.ents.length+'개 · '+C.Math.toDegrees(c.latitude).toFixed(6)+', '+C.Math.toDegrees(c.longitude).toFixed(6), 1500);
  }, C.ScreenSpaceEventType.LEFT_CLICK);

  /* 켜기/끄기 */
  function on(){ PIN.on = true; viewer.canvas.style.cursor = 'crosshair'; toast('지점 핀 찍기 켜짐 · 지도를 누르세요', 2000); }
  function off(){ PIN.on = false; for(const e of PIN.ents) viewer.entities.remove(e); PIN.ents = []; viewer.canvas.style.cursor = ''; }
  const _t = toggleLayer;
  toggleLayer = async function(id, force){
    if(id === 'pin'){ const want = force!==undefined ? force : !STATE.on.has('pin'); if(want){ STATE.on.add('pin'); on(); } else { STATE.on.delete('pin'); off(); } try{ renderCats(); renderSub(); updateSrc(); }catch(e){} return; }
    return _t.apply(this, arguments);
  };

  window.__PIN = { PIN, version:'0.1' };
})();
