# SISTECH LAB

SISTECH EARTH(https://signspark.github.io/sistech-earth/)를 건드리지 않고 새 3D 기능을 시험하는 실험실입니다.
검증된 기능만 EARTH로 옮깁니다.

- 주소: https://signspark.github.io/sistech-lab/
- 실험 켜기: `?exp=이름` (여러 개는 `?exp=a,b`) 또는 왼쪽 메뉴 › 실험
- 3D 타일 서버는 `signspark.github.io` 출처의 요청만 받으므로 이 저장소는 반드시 signspark 계정의 GitHub Pages로 운영합니다.

## 파일 구조

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 틀 (EARTH 디자인 그대로) |
| `lab-core.js` | 기본 뼈대: Cesium · 3D 타일 4곳 자동 로드 · 브이월드/Esri 배경 · 지형 · 메뉴 · 카드 · 저사양 최적화 · 실험 불러오기 |
| `exp/index.json` | 실험 목록 (메뉴 › 실험에 표시) |
| `exp/<이름>.js` | 실험 하나 = 파일 하나 |
| `exp/sample-pin.js` | 새 실험을 만들 때 복사하는 예시 |

## EARTH 호환 전역 (실험 코드가 그대로 쓰는 이름)

`Cesium` `viewer` `scene` `camera` `globe` `handler` `$` `toast` `fmtKm`
`STATE` `PROJECTS` `TILESET_BASE` `ensureTileset` `MENUS` `renderCats()` `renderSub()`
`toggleLayer(id, force)` `updateSrc()` `closeAllPanels()` `setMode()` `flyToProject()`
`#card` `#cardTitle` `#cardBody` `#cardClose` `#settings` `#hudSrc` `#toast`

EARTH에 없는 LAB 전용: `window.LAB` (불러온 실험 목록), `window.PERF` (저사양 최적화 상태)

## 실험 작성 규칙 (EARTH로 옮기기 쉽게)

1. 전체를 `(function(){ ... })();`로 감싸고 전역은 `window.__이름` 하나만 내보냄
2. 메뉴는 `MENUS.site`의 분류(`analysis`, `export` 등)에 항목 추가 후 `renderCats(); renderSub();`
3. 켜기/끄기는 `toggleLayer`를 감싸서 자기 id만 처리하고 나머지는 이전 함수로 넘김
4. 클릭은 `handler.getInputAction()`으로 이전 동작을 받아 두고, 내 기능이 꺼져 있으면 이전 동작 호출
5. 끌 때 만든 개체·이벤트·캐시를 모두 정리 (저사양 PC 메모리)
6. 외부 라이브러리는 필요할 때만 불러옴 (처음 화면을 가볍게)
