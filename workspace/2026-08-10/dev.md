# 2026-08-10 개발팀 결과물

# 자사몰 전환율·재구매 개선 — 9월 성수기 대응 실행안 (2026-08-10 착수)

> **전제 제거 원칙**: 이 문서의 모든 산출물은 **커머스 스택(Cafe24 / Shopify / Makeshop / 자체)에 종속되지 않도록** 설계했다.
> 스택 판별 결과가 바뀌어도 달라지는 것은 "**코드를 어디에 붙이냐**" 한 줄뿐이고, 코드·계측·대시보드·카카오 흐름은 그대로 동작한다.
> 그래도 Step 0(5분)은 **문서 읽기 전에 먼저 실행**한다. 결과를 §0.3 표에 기입해야 배포 경로가 확정된다.

---

## 0. Step 0 — 스택/계측 판별 (5분, 착수 즉시 실행)

### 0.1 브라우저 콘솔 스크립트 (`tools/stack-probe.js`)

valluat.com **마리백 상세페이지**를 크롬(모바일 에뮬레이션 iPhone 12 Pro)으로 열고 F12 → 콘솔에 붙여넣기.

```js
/* VALLUAT stack probe v1 — 결과를 dev 문서 §0.3에 기입 */
(() => {
  const h = document.documentElement.innerHTML;
  const has = k => h.indexOf(k) > -1;
  const stack =
    (window.Shopify || has('cdn.shopify.com')) ? 'Shopify' :
    (has('/web/upload/') || has('EC_ENGINE') || has('cafe24')) ? 'Cafe24' :
    has('makeshop') ? 'Makeshop' :
    has('imweb') ? 'Imweb' :
    has('godomall') || has('NHN') ? 'Godomall' : '자체/기타';

  const imgs = [...document.images];
  const big = imgs.filter(i => i.naturalHeight > 1500);
  const lazy = imgs.filter(i => i.loading === 'lazy');
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  const imgBytes = res.filter(r => r.initiatorType === 'img')
                      .reduce((a, r) => a + (r.transferSize || 0), 0);

  const out = {
    '스택': stack,
    'GTM 설치': !!window.google_tag_manager,
    'GTM ID': Object.keys(window.google_tag_manager || {}).filter(k=>k.startsWith('GTM')).join(',') || '-',
    'GA4 gtag': typeof window.gtag === 'function',
    'dataLayer 이벤트수': Array.isArray(window.dataLayer) ? window.dataLayer.length : '없음',
    '메타픽셀': !!window.fbq,
    '카카오SDK': !!window.Kakao,
    '리뷰앱': has('crema') ? 'CREMA' : has('reviewmoa') ? '리뷰모아' : has('snapreview') ? '스냅리뷰' : has('judge.me') ? 'Judge.me' : '미확인',
    'jQuery': window.jQuery ? jQuery.fn.jquery : '없음',
    '이미지 총개수': imgs.length,
    '세로1500px초과 이미지': big.length,
    'lazy 적용 이미지': lazy.length + '/' + imgs.length,
    '이미지 전송량(KB)': Math.round(imgBytes / 1024),
    'DOM 로드(ms)': Math.round(nav.domContentLoadedEventEnd || 0),
    '전체 로드(ms)': Math.round(nav.loadEventEnd || 0),
    'WebP/AVIF 사용': res.some(r => /\.(webp|avif)/.test(r.name)),
    '상세영역 후보': ['#prdDetail','#detail','.detail_page','.xans-product-detail','[data-detail]','.product__description']
        .filter(s => document.querySelector(s)).join(' | ') || '수동확인필요'
  };
  console.table(out);

  new PerformanceObserver(l => {
    const e = l.getEntries().pop();
    console.log('%cLCP(ms):', 'color:#c00;font-weight:bold', Math.round(e.startTime), e.element);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
})();
```

### 0.2 터미널 1줄 (서버 응답/캐시 확인)

```bash
curl -sI -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" https://valluat.com/ \
  | egrep -i 'server|x-powered|cache-control|content-encoding|cf-|via'
```

### 0.3 판별 결과 기입표 (**개발 담당자가 오늘 채운다**)

| 항목 | 값 | 확정 시각 |
|---|---|---|
| 커머스 스택 | ( ) | |
| GTM 컨테이너 ID | ( ) | |
| GA4 측정 ID | ( ) | |
| 상세영역 셀렉터 | ( ) | |
| 리뷰 솔루션 | ( ) | |
| 모바일 LCP / 이미지 전송량 | ( )ms / ( )KB | |

### 0.4 판별 결과별 "붙이는 위치"만 달라진다 (그 외 전부 동일)

| 스택 | 공통 스크립트 삽입 위치 | 배포 방식 |
|---|---|---|
| Cafe24 | 쇼핑몰 설정 → 디자인 → HTML 소스(공통 레이아웃 `</head>` 직전) 또는 스마트배너/외부스크립트 | 스킨 복사본에서 작업 → 미리보기 → 적용 |
| Shopify | `theme.liquid` `</head>` 직전 (테마 복제본) | 테마 복제 → 미리보기 URL QA → 게시 |
| Makeshop/Godo | 디자인 관리 → 공통 HEAD | 백업 후 저장 |
| 자체/기타 | 프론트 레이아웃 템플릿 `</head>` | Git PR |

> **원칙: 모든 개선 코드는 GTM 컨테이너 1개로 배포한다.** 스택 관리자 화면에는 **GTM 스니펫만** 넣고, DEV-1~3 코드는 GTM 태그로 관리 → 개발자 없이 즉시 롤백 가능(9월 트래픽 급증 구간에서 이게 가장 중요).
> GTM이 없다면(§0.3에서 미설치로 나오면) **오늘 최우선 작업 = GTM 설치**로 순서를 바꾼다.

---

## 1. 우선순위 확정

| 순위 | 작업 | 왜 이 순서인가 | 배포일 |
|---|---|---|---|
| **P0** | 퍼널 계측 세팅 (§3) | 안 하면 나머지 3건의 효과를 9월에 판단 불가. 광고비 10억 트랜치 게이트의 근거 데이터 | **8/18 가동** |
| **P1** | DEV-1 모바일 로딩 최적화 | 전 상품·전 트래픽에 적용, 리스크 최저, CPM 상승기에 LCP 1초 = 이탈 직결 | **8/18(마리백)→8/20(전체)** |
| **P2** | DEV-3 스티키 구매바 + 옵션 마찰 제거 | PDP→장바구니 전환의 최대 누수 지점. 구현 난이도 대비 효과 최대 | **8/25** |
| **P3** | DEV-2 퍼스트뷰 전환 블록(셀럽컷·실착·리뷰) | 브랜드 자산(셀럽 300명)을 첫 화면에서 쓰는 구조 변경. QA 범위가 넓어 후순위 | **8/27** |
| **P4** | 카카오채널·회원 전환 흐름 (§4) | 재구매 자산화. 9월 트래픽이 들어오기 전 반드시 켜져 있어야 함 | **8/29** |
| — | **코드 프리즈** | 9월 성수기 중 무배포 원칙 (긴급 롤백만 허용) | **8/31 18:00** |

---

## 2. 제작물 A — 마리백 PDP 전환 개선 3건

### 2.0 진단 (전형적 국내 여성 패션 PDP 패턴 기준 + Step 0 실측으로 확정)

| 진단 항목 | 흔한 현상 | 전환 손실 가설 | 대응 |
|---|---|---|---|
| 모바일 로딩 | 상세 이미지 20~40장, 장당 1~3MB, 전부 즉시 로드 | LCP 4초↑ → 광고 유입 이탈 20~30% (모바일 3초 초과 시 이탈 급증) | DEV-1 |
| 셀럽 착용컷 | 상세 중하단에 배치, 스크롤 5,000px 아래 | 브랜드 최대 자산이 첫 화면에서 안 보임 | DEV-2 |
| 사이즈·실착 | 이미지 안에 텍스트로만 존재 → 검색·복사 불가, 모델 키/소지품 정보 부재 | "얼마나 들어가나?" 미해소 → 이탈 or CS 문의 | DEV-2 |
| 리뷰 | 상세 최하단, 평점 요약 없음 | "가격 대비 퀄리티" 라는 최강 소셜프루프가 구매 결정 시점에 안 보임 | DEV-2 |
| 구매 버튼 | 스크롤 내리면 화면 밖으로 사라짐, 옵션 미선택 시 무반응 | 구매 의향 최고점(리뷰/셀럽컷 본 직후)에 버튼 없음 | DEV-3 |

---

### 2.1 DEV-1 — 모바일 상세 로딩 최적화 (배포 8/18)

**변경 전**: 상세 이미지 전량 즉시 로드, `width/height` 미지정(레이아웃 시프트), 원본 JPG.
**변경 후**: 첫 화면 이미지 1장만 우선 로드 + 나머지 지연 로드 + 상세 접기("상세정보 더보기") + 사이즈 속성 강제.

`gtm/tag-dev1-lazy.html` (GTM → 맞춤 HTML 태그, 트리거: All Pages / PDP만)

```html
<script>
(function () {
  if (!/\/product\//.test(location.pathname) && !document.querySelector('#prdDetail,.xans-product-detail,.product__description')) return;

  var DETAIL = document.querySelector('#prdDetail, .xans-product-detail, .detail_page, .product__description, [data-detail]');
  if (!DETAIL) return;

  /* 1) 상세 이미지 지연 로드 + CLS 방지 */
  var imgs = DETAIL.querySelectorAll('img');
  Array.prototype.forEach.call(imgs, function (img, i) {
    if (i > 0) { img.loading = 'lazy'; img.decoding = 'async'; }
    else { img.setAttribute('fetchpriority', 'high'); }
    if (!img.getAttribute('width') && img.naturalWidth) {
      img.setAttribute('width', img.naturalWidth);
      img.setAttribute('height', img.naturalHeight);
    }
    img.style.maxWidth = '100%'; img.style.height = 'auto';
  });

  /* 2) 상세 접기 — 모바일에서 초기 렌더 높이를 2,000px로 제한 */
  if (window.innerWidth <= 820 && DETAIL.scrollHeight > 3000) {
    var FOLD = 2000;
    DETAIL.style.cssText += 'max-height:' + FOLD + 'px;overflow:hidden;position:relative;';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vl-more';
    btn.innerHTML = '상세정보 더보기 <span>▾</span>';
    btn.style.cssText = 'display:block;width:calc(100% - 32px);margin:-52px 16px 24px;position:relative;z-index:5;' +
      'padding:14px 0;background:#fff;border:1px solid #111;border-radius:2px;font-size:14px;letter-spacing:.02em;cursor:pointer;';
    var fade = document.createElement('div');
    fade.style.cssText = 'position:relative;height:80px;margin-top:-80px;z-index:4;' +
      'background:linear-gradient(rgba(255,255,255,0),#fff);';
    DETAIL.parentNode.insertBefore(fade, DETAIL.nextSibling);
    DETAIL.parentNode.insertBefore(btn, fade.nextSibling);
    btn.addEventListener('click', function () {
      DETAIL.style.maxHeight = 'none';
      btn.remove(); fade.remove();
      window.dataLayer.push({ event: 'vl_detail_expand' });
    });
  }

  /* 3) 이미지 리소스 힌트 */
  var hero = document.querySelector('.xans-product-image img, .product__media img, .thumb img');
  if (hero && hero.src) {
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'image'; l.href = hero.src; l.setAttribute('fetchpriority','high');
    document.head.appendChild(l);
  }
})();
</script>
```

**병행(디자인/운영팀 작업, 8/13~8/15)**
- 마리백 상세 이미지 원본을 **WebP(품질 80), 가로 1080px, 세로 2000px 단위로 분할** 재업로드 → 목표: 상세 총 전송량 **8MB → 2.5MB 이하**
- 상세 상단 3장 안에 "사이즈·실착·소재" 정보가 텍스트로도 들어가게(§2.2 스펙카드와 중복 허용)

**성공 기준**: 모바일 LCP **4.0s → 2.5s 이하**, 상세 전송량 60%↓, PDP 이탈률 −5%p.

---

### 2.2 DEV-2 — 퍼스트뷰 전환 블록 (셀럽컷 + 실착 스펙 + 리뷰 요약) (배포 8/27)

**변경 전**: 상품 이미지 → 가격 → 옵션 → (5,000px 아래) 셀럽컷/리뷰
**변경 후**: 옵션 바로 위에 **① 셀럽 착용 배지+캐러셀 ② 실착 스펙 카드 ③ 리뷰 평점 요약** 3단 블록 삽입 (첫 스크롤 1.5회 이내)

`gtm/tag-dev2-firstview.html`

```html
<style>
.vl-fv{margin:20px 0 8px;font-family:inherit;-webkit-font-smoothing:antialiased}
.vl-fv *{box-sizing:border-box}
.vl-celeb-h{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;letter-spacing:.01em;color:#111}
.vl-celeb-h b{font-weight:600}
.vl-badge{background:#111;color:#fff;font-size:11px;padding:3px 7px;border-radius:2px;letter-spacing:.03em}
.vl-celeb{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:6px}
.vl-celeb::-webkit-scrollbar{display:none}
.vl-celeb figure{flex:0 0 108px;scroll-snap-align:start;margin:0}
.vl-celeb img{width:108px;height:144px;object-fit:cover;border-radius:2px;display:block;background:#f3f3f3}
.vl-celeb figcaption{font-size:11px;color:#666;margin-top:5px;text-align:center;letter-spacing:0}
.vl-spec{margin:16px 0 0;border:1px solid #e9e9e9;border-radius:3px;padding:14px 14px 10px}
.vl-spec dl{display:grid;grid-template-columns:76px 1fr;gap:7px 10px;margin:0;font-size:13px;line-height:1.45}
.vl-spec dt{color:#8a8a8a}
.vl-spec dd{margin:0;color:#111}
.vl-spec .vl-fit{margin:12px 0 0;padding-top:11px;border-top:1px solid #f0f0f0;font-size:12.5px;color:#444;line-height:1.5}
.vl-spec .vl-fit b{color:#111;font-weight:600}
.vl-rev{margin:12px 0 0;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fafafa;border-radius:3px;cursor:pointer}
.vl-rev .st{font-size:14px;letter-spacing:1px;color:#111}
.vl-rev .sc{font-size:14px;font-weight:600}
.vl-rev .cnt{font-size:12px;color:#777;margin-left:auto;text-decoration:underline}
.vl-rev .kw{font-size:12px;color:#555}
@media(min-width:821px){.vl-celeb figure{flex:0 0 132px}.vl-celeb img{width:132px;height:176px}}
</style>

<script>
(function () {
  /* ===== 운영팀이 관리하는 데이터 (마리백) ===== */
  var DATA = {
    productKeys: ['mari', '마리'],                 // URL/타이틀에 이 문자열 포함 시 적용
    celebCount: 300,
    celebs: [
      { name: '기은세',  img: 'https://valluat.com/web/upload/celeb/mari_kes.webp' },
      { name: '김고은',  img: 'https://valluat.com/web/upload/celeb/mari_kge.webp' },
      { name: '정채연',  img: 'https://valluat.com/web/upload/celeb/mari_jcy.webp' },
      { name: '크리스탈', img: 'https://valluat.com/web/upload/celeb/mari_krs.webp' }
    ],
    spec: {
      '사이즈': 'W 24 × H 16 × D 9 cm (스트랩 최대 118cm)',
      '무게': '390g',
      '소재': '소가죽 (내부 스웨이드)',
      '수납': '스마트폰 · 반지갑 · 립 · 카드 · 키',
      '착장': '숄더 / 크로스 / 토트 3way'
    },
    fit: '모델 <b>163cm</b> 착용컷 기준. A4는 들어가지 않으며 <b>15인치 노트북 불가</b>, 소개팅·하객룩에 맞춘 미니 사이즈입니다.',
    review: { score: 4.8, count: 12480, keywords: '가격 대비 퀄리티 · 하객룩 · 생각보다 넉넉해요' }
  };
  /* ============================================ */

  var url = (location.pathname + location.search + document.title).toLowerCase();
  if (!DATA.productKeys.some(function (k) { return url.indexOf(k) > -1; })) return;

  var anchor = document.querySelector('.xans-product-option, .product-form__buttons, [data-option-area], .prd-option, #totalProducts');
  if (!anchor) return;
  if (document.querySelector('.vl-fv')) return;

  var wrap = document.createElement('div');
  wrap.className = 'vl-fv';
  wrap.innerHTML =
    '<div class="vl-celeb-h"><span class="vl-badge">CELEB</span>' +
      '<b>누적 ' + DATA.celebCount + '인+</b> 연예인 착용</div>' +
    '<div class="vl-celeb">' +
      DATA.celebs.map(function (c) {
        return '<figure><img src="' + c.img + '" alt="' + c.name + ' 착용" loading="lazy" decoding="async" width="108" height="144"><figcaption>' + c.name + '</figcaption></figure>';
      }).join('') +
    '</div>' +
    '<div class="vl-spec"><dl>' +
      Object.keys(DATA.spec).map(function (k) { return '<dt>' + k + '</dt><dd>' + DATA.spec[k] + '</dd>'; }).join('') +
    '</dl><p class="vl-fit">' + DATA.fit + '</p></div>' +
    '<div class="vl-rev" id="vlRev">' +
      '<span class="st">★★★★★</span><span class="sc">' + DATA.review.score.toFixed(1) + '</span>' +
      '<span class="kw">' + DATA.review.keywords + '</span>' +
      '<span class="cnt">리뷰 ' + DATA.review.count.toLocaleString() + '개</span>' +
    '</div>';

  anchor.parentNode.insertBefore(wrap, anchor);

  /* 리뷰 요약 클릭 → 리뷰 영역으로 스크롤 */
  document.getElementById('vlRev').addEventListener('click', function () {
    var r = document.querySelector('#prdReview, .xans-product-review, #crema-reviews, [data-review-area]');
    if (r) r.scrollIntoView({ behavior: 'smooth' });
    window.dataLayer.push({ event: 'vl_review_summary_click' });
  });

  /* 셀럽 캐러셀 스와이프 계측 */
  var c = wrap.querySelector('.vl-celeb'), fired = false;
  c.addEventListener('scroll', function () {
    if (!fired) { fired = true; window.dataLayer.push({ event: 'vl_celeb_swipe' }); }
  }, { passive: true });

  /* 블록 노출 계측 */
  new IntersectionObserver(function (e, o) {
    if (e[0].isIntersecting) { window.dataLayer.push({ event: 'vl_firstview_view' }); o.disconnect(); }
  }, { threshold: 0.4 }).observe(wrap);
})();
</script>
```

> 운영 담당: `DATA` 객체만 수정하면 상품별 확장 가능. 셀럽 이미지는 **초상권 사용 범위 확인된 컷만** 사용(마케팅팀 확인 후 반영).

**성공 기준**: PDP → `add_to_cart` 전환율 **+8% 이상**(A/B 기준), 리뷰 영역 도달률 +15%p.

---

### 2.3 DEV-3 — 스티키 구매바 + 옵션 마찰 제거 (배포 8/25)

**변경 전**: 스크롤 시 구매 버튼 소실, 옵션 미선택 상태로 버튼 누르면 alert 또는 무반응 → 이탈.
**변경 후**: 화면 하단 고정 구매바(가격+장바구니+바로구매) 상시 노출, 옵션 미선택 시 **옵션 영역으로 스크롤 + 하이라이트**, 무료배송/오늘출발 넛지 표기.

`gtm/tag-dev3-stickybar.html`

```html
<style>
.vl-sticky{position:fixed;left:0;right:0;bottom:0;z-index:9990;background:#fff;
  border-top:1px solid #ececec;padding:9px 12px calc(9px + env(safe-area-inset-bottom));
  display:flex;align-items:center;gap:8px;transform:translateY(110%);transition:transform .22s ease;
  box-shadow:0 -2px 14px rgba(0,0,0,.06)}
.vl-sticky.on{transform:none}
.vl-sticky .p{flex:1;min-width:0;line-height:1.25}
.vl-sticky .p .nm{font-size:11.5px;color:#888;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vl-sticky .p .pr{font-size:15px;font-weight:700;color:#111}
.vl-sticky .p .dl{font-size:11px;color:#c0392b;margin-left:5px;font-weight:500}
.vl-sticky button{border:0;border-radius:2px;font-size:14px;font-weight:600;padding:13px 0;cursor:pointer;letter-spacing:.01em}
.vl-sticky .cart{width:88px;background:#f2f2f2;color:#111}
.vl-sticky .buy{width:118px;background:#111;color:#fff}
.vl-optflash{animation:vlFlash 1.1s ease 2;border-radius:3px}
@keyframes vlFlash{0%,100%{box-shadow:0 0 0 0 rgba(17,17,17,0)}50%{box-shadow:0 0 0 3px rgba(17,17,17,.18)}}
@media(min-width:821px){.vl-sticky{display:none}}
</style>

<script>
(function () {
  var OPT  = document.querySelector('.xans-product-option, [data-option-area], .prd-option, .product-form__variants');
  var CART = document.querySelector('a[href*="basket"], .btnBasket, [name="basket"], button[name="add"], #btnBasket');
  var BUY  = document.querySelector('.btnBuy, [name="order"], a[href*="order"], #btnBuy');
  if (!CART) return;
  if (document.querySelector('.vl-sticky')) return;

  var nameEl  = document.querySelector('.xans-product-detail h2, .product__title, [data-prd-name], h1');
  var priceEl = document.querySelector('#span_product_price_text, .product__price, [data-prd-price], .price');
  var prdName = nameEl ? nameEl.textContent.trim().slice(0, 28) : '상품';
  var prdPrice = priceEl ? priceEl.textContent.trim() : '';

  /* 배송 컷오프 넛지: 평일 14시 이전이면 오늘출발 */
  var now = new Date(), d = now.getDay(), h = now.getHours();
  var ship = (d >= 1 && d <= 5 && h < 14) ? '오늘 출발 마감 ' + (13 - h) + '시간 ' + (60 - now.getMinutes()) + '분' : '무료배송';

  var bar = document.createElement('div');
  bar.className = 'vl-sticky';
  bar.innerHTML =
    '<div class="p"><span class="nm">' + prdName + '</span>' +
    '<span class="pr">' + prdPrice + '</span><span class="dl">' + ship + '</span></div>' +
    '<button type="button" class="cart">장바구니</button>' +
    '<button type="button" class="buy">바로구매</button>';
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '72px';

  /* 옵션 선택 여부 판정 */
  function optionSelected() {
    if (!OPT) return true;
    var sels = OPT.querySelectorAll('select');
    if (sels.length) {
      return Array.prototype.every.call(sels, function (s) { return s.selectedIndex > 0 && s.value && s.value !== '*' && s.value !== '**'; });
    }
    return !!OPT.querySelector('input:checked, .selected, [aria-selected="true"]') ||
           !!document.querySelector('.xans-product-addquantity li, .product-option-list li');
  }
  function nudgeOption() {
    if (!OPT) return;
    OPT.scrollIntoView({ behavior: 'smooth', block: 'center' });
    OPT.classList.add('vl-optflash');
    setTimeout(function () { OPT.classList.remove('vl-optflash'); }, 2400);
    window.dataLayer.push({ event: 'vl_option_required' });   // ★ 옵션 미선택 이탈 추적
  }

  function act(kind, orig) {
    return function () {
      window.dataLayer.push({ event: 'vl_sticky_click', vl_action: kind });
      if (!optionSelected()) { nudgeOption(); return; }
      if (orig) { orig.click(); }
    };
  }
  bar.querySelector('.cart').addEventListener('click', act('cart', CART));
  bar.querySelector('.buy').addEventListener('click', act('buy', BUY || CART));

  /* 400px 이상 스크롤 시 노출 */
  var shown = false;
  window.addEventListener('scroll', function () {
    var on = window.scrollY > 400;
    if (on !== bar.classList.contains('on')) bar.classList.toggle('on', on);
    if (on && !shown) { shown = true; window.dataLayer.push({ event: 'vl_sticky_view' }); }
  }, { passive: true });

  /* 원본 버튼에서도 옵션 미선택 감지 */
  if (OPT) {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('a[href*="basket"], .btnBasket, [name="basket"], .btnBuy, [name="order"]');
      if (t && !optionSelected()) { window.dataLayer.push({ event: 'vl_option_required', vl_src: 'origin_btn' }); }
    }, true);
  }
})();
</script>
```

**성공 기준**: `add_to_cart` 발생률 **+10%**, `vl_option_required` 이벤트가 세션의 8% 초과 시 → 옵션 UI 자체를 9월 후 재설계 대상으로 등록.

---

## 3. 제작물 B — 단계별 이탈률 측정 세팅 (P0, 8/18 가동)

### 3.1 퍼널 정의 (매일 아침 이 6줄만 보면 어디서 새는지 보인다)

| # | 단계 | 이벤트 | 정의 | 8월 기준선 | 9월 경보선 |
|---|---|---|---|---|---|
| 1 | 광고 유입 | `session_start` (source=meta) | 랜딩 진입 세션 | 기입 | — |
| 2 | 랜딩 유효 | `vl_engaged` | 10초 체류 or 25% 스크롤 | 기입 | 전일 대비 −10%p |
| 3 | 상품 조회 | `view_item` | PDP 진입 | 기입 | −10%p |
| 4 | 구매의향 | `vl_firstview_view` / `vl_sticky_view` | 전환블록·구매바 노출 | 기입 | — |
| 5 | 장바구니 | `add_to_cart` | | 기입 | **−15% 시 즉시 확인** |
| 6 | 결제시작 | `begin_checkout` | | 기입 | −15% |
| 7 | 구매 | `purchase` | | 기입 | −15% |

**추가 진단 이벤트**: `vl_option_required`(옵션 마찰), `vl_detail_expand`(상세 더보기), `vl_review_summary_click`, `vl_celeb_swipe`, `vl_kakao_add`, `vl_signup_click`, `vl_lcp`(성능).

### 3.2 공통 계측 태그 `gtm/tag-funnel-core.html`

```html
<script>
(function () {
  window.dataLayer = window.dataLayer || [];
  var dl = window.dataLayer;

  /* A. 유효 세션(랜딩 이탈 분리) */
  var engaged = false;
  function fireEngaged(reason) {
    if (engaged) return; engaged = true;
    dl.push({ event: 'vl_engaged', vl_reason: reason, vl_page: location.pathname });
  }
  setTimeout(function () { fireEngaged('10s'); }, 10000);
  window.addEventListener('scroll', function () {
    if ((window.scrollY + innerHeight) / document.body.scrollHeight > 0.25) fireEngaged('scroll25');
  }, { passive: true });

  /* B. 성능(LCP) — 어느 디바이스/네트워크에서 느린지 매일 확인 */
  try {
    new PerformanceObserver(function (l) {
      var e = l.getEntries().pop();
      dl.push({
        event: 'vl_lcp',
        vl_lcp_ms: Math.round(e.startTime),
        vl_bucket: e.startTime < 2500 ? 'good' : e.startTime < 4000 ? 'ni' : 'poor',
        vl_conn: (navigator.connection && navigator.connection.effectiveType) || 'na'
      });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  /* C. 이탈 지점 기록 (마지막 본 섹션) */
  window.addEventListener('pagehide', function () {
    dl.push({ event: 'vl_exit', vl_depth: Math.round((window.scrollY + innerHeight) / document.body.scrollHeight * 100) });
  });
})();
</script>
```

### 3.3 GA4 이커머스 데이터레이어 (스택 무관 — 페이지 유형별 push)

```html
<!-- PDP: 상품 상세에 삽입 (스택 변수는 §0.3 결과에 맞춰 치환) -->
<script>
window.dataLayer = window.dataLayer || [];
dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'view_item',
  ecommerce: {
    currency: 'KRW',
    value: {{상품가격}},
    items: [{ item_id: '{{상품코드}}', item_name: '{{상품명}}', price: {{상품가격}}, quantity: 1 }]
  }
});
</script>

<!-- 주문완료 페이지 -->
<script>
dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'purchase',
  vl_is_member: '{{회원여부:member|guest}}',
  vl_is_first: '{{첫구매여부:1|0}}',
  ecommerce: {
    transaction_id: '{{주문번호}}',
    value: {{결제금액}}, currency: 'KRW', shipping: {{배송비}},
    items: [{ item_id: '{{상품코드}}', item_name: '{{상품명}}', price: {{상품가격}}, quantity: {{수량}} }]
  }
});
</script>
```

> `add_to_cart` / `begin_checkout`이 스택에서 직접 push 불가하면, **DEV-3 스티키바 클릭 + 장바구니/주문서 페이지뷰**로 대체 정의(정의만 문서에 고정하면 추세 판단에는 충분).

### 3.4 대시보드 항목 정의 (Looker Studio, `dash/funnel-daily`)

**상단 스코어카드(전일 vs 7일평균)**
| 지표 | 산식 | 소스 |
|---|---|---|
| 세션 | GA4 sessions | GA4 |
| 유효세션률 | vl_engaged / sessions | GA4 |
| PDP 조회율 | view_item 세션 / sessions | GA4 |
| **장바구니 전환율** | add_to_cart 세션 / view_item 세션 | GA4 |
| **결제시작률** | begin_checkout / add_to_cart | GA4 |
| **결제완료율** | purchase / begin_checkout | GA4 |
| 전체 CVR | purchase 세션 / sessions | GA4 |
| AOV / 매출 | value 합 / purchase | GA4 |
| 모바일 LCP p75 | vl_lcp p75 | GA4 |
| 옵션마찰률 | vl_option_required / view_item | GA4 |
| 신규회원 전환율 | vl_signup_done / purchase(guest) | GA4 |
| 카카오채널 추가율 | vl_kakao_add / purchase | GA4 |

**분해 축(필수)**: 디바이스(모바일/PC) · 유입(메타/자연/카카오) · 랜딩 URL · 광고 소재(utm_content) · 상품(마리백 vs 기타)
**하단 표**: 소재별 `세션 → PDP → 장바구니 → 구매 + 구간 이탈률` (광고팀이 소재 끄고 켜는 근거로 그대로 사용)

### 3.5 매일 09:00 자동 알림 `apps-script/funnel-alert.gs`

```javascript
/** GA4 Data API → Slack. 트리거: 매일 09:00 */
const PROP = 'properties/000000000';                 // GA4 속성 ID
const HOOK = PropertiesService.getScriptProperties().getProperty('SLACK_HOOK'); // ★ 코드에 직접 넣지 말 것

function dailyFunnelAlert() {
  const y = ymd(-1), base = range(-8, -2);           // 어제 vs 직전 7일
  const cur = fetchFunnel(y, y), prev = fetchFunnel(base.s, base.e);
  const steps = ['session_start','view_item','add_to_cart','begin_checkout','purchase'];

  let msg = `*[VALLUAT 퍼널 ${y}]*\n`;
  steps.forEach((k, i) => {
    const c = cur[k] || 0, p = (prev[k] || 0) / 7;
    const diff = p ? ((c - p) / p * 100) : 0;
    const conv = i > 0 && cur[steps[i-1]] ? (c / cur[steps[i-1]] * 100).toFixed(1) + '%' : '-';
    const flag = diff <= -15 ? ' :rotating_light:' : diff <= -8 ? ' :warning:' : '';
    msg += `${k}: ${c.toLocaleString()} (전환 ${conv}, 7일평균 대비 ${diff.toFixed(0)}%)${flag}\n`;
  });
  UrlFetchApp.fetch(HOOK, { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ text: msg }) });
}

function fetchFunnel(s, e) {
  const res = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: s, endDate: e }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }]
  }, PROP);
  const o = {};
  (res.rows || []).forEach(r => o[r.dimensionValues[0].value] = Number(r.metricValues[0].value));
  return o;
}
function ymd(d){const t=new Date();t.setDate(t.getDate()+d);return Utilities.formatDate(t,'Asia/Seoul','yyyy-MM-dd');}
function range(a,b){return {s:ymd(a), e:ymd(b)};}
```

> Slack Webhook은 **Apps Script 속성(Script Properties)에 저장**. 코드/문서/깃에 절대 하드코딩 금지.

---

## 4. 제작물 C — 첫 구매 고객 → 카카오채널 + 회원 전환 흐름 (배포 8/29)

### 4.1 흐름 (구현 1개, 접점 1곳 = 주문완료 페이지)

```
[비회원/첫구매] 결제 완료
  → 주문완료 페이지 상단에 "혜택 카드" 노출
      ① [카카오톡 채널 추가하기] 원탭  → 즉시 쿠폰코드 노출 + 복사 + GA4 vl_kakao_add
      ② [3초 회원가입] (주문정보 자동연동 링크) → 적립금 안내 + GA4 vl_signup_click/done
  → 배송완료 D+7: 채널 친구 대상 재구매 메시지 (마케팅팀 운영, 개발은 세그먼트 이벤트만 제공)
```

### 4.2 `gtm/tag-kakao-firstbuy.html` (트리거: 주문완료 페이지)

```html
<script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
        integrity="sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4" crossorigin="anonymous"></script>
<style>
.vl-cvt{margin:16px auto;max-width:640px;border:1px solid #ececec;border-radius:4px;overflow:hidden;font-family:inherit}
.vl-cvt .hd{background:#111;color:#fff;padding:13px 16px;font-size:14px;letter-spacing:.01em}
.vl-cvt .bd{padding:16px}
.vl-cvt .row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #f2f2f2}
.vl-cvt .row:last-child{border-bottom:0}
.vl-cvt .tx{flex:1;font-size:13px;line-height:1.5;color:#333}
.vl-cvt .tx b{display:block;font-size:14px;color:#111;margin-bottom:3px;font-weight:600}
.vl-cvt button,.vl-cvt a.btn{border:0;border-radius:2px;padding:11px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block}
.vl-cvt .k{background:#FEE500;color:#191600}
.vl-cvt .s{background:#111;color:#fff}
.vl-cvt .cp{margin-top:10px;padding:11px;background:#FFFBE6;border:1px dashed #E0C200;border-radius:3px;font-size:13px;text-align:center;display:none}
.vl-cvt .cp code{font-size:15px;font-weight:700;letter-spacing:1px}
</style>

<script>
(function () {
  var KAKAO_JS_KEY   = '{{KAKAO_JS_KEY}}';      // 공개용 JavaScript 키 (REST/Admin 키 절대 금지)
  var CHANNEL_ID     = '_xxxxxx';               // 카카오 채널 공개 ID
  var COUPON_CODE    = 'VLFRIEND10';            // 채널추가 리워드 쿠폰 (10% / 30일)
  var SIGNUP_URL     = '/member/join.html';     // 스택별 회원가입 URL (§0.3 결과로 확정)

  if (window.Kakao && !Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY);

  var anchor = document.querySelector('.xans-order-result, .order-complete, #orderComplete, main') || document.body;
  var box = document.createElement('div');
  box.className = 'vl-cvt';
  box.innerHTML =
    '<div class="hd">주문이 완료되었습니다 · 다음 구매 혜택 받기</div>' +
    '<div class="bd">' +
      '<div class="row"><div class="tx"><b>카카오톡 채널 추가하고 10% 쿠폰</b>' +
        '배송 알림과 신상·셀럽 착용 소식을 톡으로 먼저 받아보세요.</div>' +
        '<button type="button" class="k" id="vlKakao">채널 추가</button></div>' +
      '<div class="cp" id="vlCoupon">쿠폰코드 <code>' + COUPON_CODE + '</code> ' +
        '<button type="button" id="vlCopy" style="background:#111;color:#fff;padding:5px 9px;font-size:11px;margin-left:6px">복사</button></div>' +
      '<div class="row"><div class="tx"><b>회원가입하고 적립금 3,000원</b>' +
        '주문조회·재구매가 간편해지고 적립금은 다음 구매에 바로 사용됩니다.</div>' +
        '<a class="btn s" id="vlSignup" href="' + SIGNUP_URL + '">3초 가입</a></div>' +
    '</div>';
  anchor.insertBefore(box, anchor.firstChild);

  document.getElementById('vlKakao').addEventListener('click', function () {
    window.dataLayer.push({ event: 'vl_kakao_add_click' });
    try { Kakao.Channel.addChannel({ channelPublicId: CHANNEL_ID }); }
    catch (e) { window.open('https://pf.kakao.com/' + CHANNEL_ID + '/friend', '_blank'); }
    document.getElementById('vlCoupon').style.display = 'block';
    window.dataLayer.push({ event: 'vl_kakao_add' });
  });
  document.getElementById('vlCopy').addEventListener('click', function () {
    navigator.clipboard.writeText('VLFRIEND10'.replace('VLFRIEND10', arguments.length ? 'VLFRIEND10' : 'VLFRIEND10'));
    this.textContent = '복사됨';
  });
  document.getElementById('vlSignup').addEventListener('click', function () {
    window.dataLayer.push({ event: 'vl_signup_click' });
  });

  new IntersectionObserver(function (e, o) {
    if (e[0].isIntersecting) { window.dataLayer.push({ event: 'vl_cvt_module_view' }); o.disconnect(); }
  }, { threshold: 0.5 }).observe(box);
})();
</script>
```

### 4.3 병행 준비 (개발 외 담당)

| 항목 | 담당 | 기한 |
|---|---|---|
| 카카오 채널 "친구추가 리워드" 쿠폰(10%/30일) 발행 | 마케팅 | 8/27 |
| 회원가입 적립금 3,000원 정책 등록 | 운영 | 8/27 |
| 카카오 개발자 콘솔 → 플랫폼에 `valluat.com` 도메인 등록 (JS키 도용 차단) | 개발 | 8/28 |
| 배송 D+7 친구톡 시나리오 | 마케팅 | 9/5 (범위 외, 훅만 제공) |

**성공 기준**: 첫 구매자 중 채널 추가율 **25%↑**, 비회원 주문의 회원 전환율 **15%↑**.

---

## 5. 테스트

### 5.1 배포 전 QA 체크리스트 (각 태그 공통)

- [ ] GTM **미리보기(Preview) 모드**에서 대상 페이지 3종(메인/PDP/주문완료) 정상 동작
- [ ] iOS Safari(iPhone SE·15), Android Chrome(Galaxy S 계열), PC Chrome/Edge — **최소 5디바이스**
- [ ] 콘솔 에러 0건 (`Uncaught` 검색)
- [ ] 기존 스크립트 충돌 없음: 장바구니 담기 / 옵션 선택 / 쿠폰 적용 / 결제 진입 **직접 클릭 테스트**
- [ ] 리뷰앱·채팅상담·플로팅 배너와 **z-index 겹침 없음**(스티키바가 채널톡 버튼 가리지 않는지)
- [ ] 광고 픽셀(fbq) 이벤트 정상 발화 — Meta Pixel Helper로 확인
- [ ] 저속 네트워크(Chrome DevTools Slow 4G)에서 스티키바가 3초 내 노출

### 5.2 항목별 테스트 절차

**DEV-1 (로딩)**
1. PageSpeed Insights 모바일: 마리백 PDP, 배포 전/후 각 3회 측정 → 중앙값 기록
2. 합격선: **LCP ≤ 2.5s, CLS ≤ 0.1, 이미지 전송량 ≤ 2.5MB**
3. "상세정보 더보기" 클릭 후 이미지 전량 정상 표시(잘림·공백 없음)

**DEV-2 (퍼스트뷰)**
1. 셀럽 이미지 4장 로드, 가로 스와이프 동작, 캡션 정렬
2. 리뷰 요약 클릭 → 리뷰 영역 정확히 스크롤
3. 스펙 데이터가 실제 마리백 실측치와 일치하는지 **운영팀 크로스체크**(오정보는 반품 유발)

**DEV-3 (스티키바)**
1. 옵션 미선택 상태에서 [바로구매] → 옵션 영역 스크롤 + 하이라이트 + `vl_option_required` 발화
2. 옵션 선택 후 [장바구니] → 실제 장바구니에 담김(수량/옵션 일치)
3. PC 화면(821px↑)에서는 미노출

**계측**
1. GA4 **DebugView**에서 7개 이벤트 실시간 확인
2. **테스트 결제 1건**(최소금액 상품) 실행 → `purchase` 파라미터(transaction_id/value/items) 정확 검증
3. 중복 발화 확인: 새로고침 시 `purchase` **재발화 안 됨** (주문번호 sessionStorage 가드 필요 시 추가)

**카카오 흐름**
1. 채널 미추가 계정으로 [채널 추가] → 카카오 레이어 정상, 추가 후 채널 친구 수 +1
2. 쿠폰코드 노출·복사 동작, 해당 코드로 결제 시 10% 할인 실제 적용
3. 이미 친구인 계정에서 눌러도 오류 없음
4. 카카오 콘솔 도메인 등록 전/후 동작 확인(등록 전 오류 → fallback `pf.kakao.com` 새 창 동작 확인)

### 5.3 효과 판정 (A/B)

- **대상**: DEV-2, DEV-3 → GTM 내장 50/50 분기 또는 GA4 사용자 속성 `vl_variant` 로 구분
- **기간**: 8/25~8/31 (최소 7일, 각 군 **주문 200건 이상** 확보 시 판정)
- **판정 지표**: `add_to_cart / view_item`, `purchase / view_item`
- **판정 규칙**: 개선률 **+5% 이상 & p<0.1** → 9/1 전량 적용 / **−3% 이하** → 즉시 롤백 후 원인 기록
- DEV-1은 A/B 없이 전량 적용(성능은 A/B 대상이 아님), 사전/사후 7일 비교로 기록만.

---

## 6. 배포안

### 6.1 일정

| 날짜 | 작업 | 담당 | 산출/게이트 |
|---|---|---|---|
| **8/11(화)** | Step 0 판별 실행 + §0.3 표 확정, GTM 컨테이너 확보·설치 | 개발 | **게이트: GTM 없으면 이날 설치 완료가 최우선** |
| 8/12~8/14 | DEV-1 개발 + 마리백 상세 이미지 WebP 재가공 | 개발/디자인 | 스테이징 검증 |
| 8/13~8/15 | 퍼널 이벤트 태그·GA4 전환 설정·Looker 대시보드 제작 | 개발 | DebugView 검증 통과 |
| **8/18(월)** | **DEV-1 마리백 단독 배포 + 대시보드 가동** | 개발 | LCP ≤2.5s 확인 후 진행 |
| 8/20(수) | DEV-1 전 상품 확대 | 개발 | 24h 무장애 확인 후 |
| 8/19~8/22 | DEV-3 개발/QA | 개발 | |
| **8/25(월)** | **DEV-3 배포 (A/B 50%)** | 개발 | |
| 8/22~8/26 | DEV-2 개발/QA + 스펙 데이터 검수 | 개발/운영 | 운영팀 실측 승인 |
| **8/27(수)** | **DEV-2 배포 (A/B 50%)** | 개발 | |
| 8/26~8/28 | 카카오 채널·쿠폰·적립금 세팅, 도메인 등록 | 개발/마케팅 | |
| **8/29(금)** | **카카오·회원 전환 모듈 배포** | 개발 | 테스트 결제 통과 후 |
| 8/31(일) 18:00 | **A/B 판정 → 승자 전량 적용 → 코드 프리즈** | 개발 | 이후 무배포 |
| 9/1~ | 매일 09:00 퍼널 알림 확인, 경보 시 당일 대응 | 개발+마케팅 | |

### 6.2 배포 절차 (모든 태그 공통)

1. GTM 작업공간(Workspace)을 **작업별로 분리** 생성 (`dev1-lazy`, `dev3-sticky` …)
2. 태그 등록 → **미리보기 모드**로 실제 도메인 QA (§5.1 체크리스트 전체)
3. 버전 생성 시 **설명에 변경내용·롤백사유 기준 기입**
4. **평일 오전 10~11시 배포**(트래픽 저점, 대응 인력 상주). 금요일 오후·주말 배포 금지
5. 배포 후 **30분간 실시간 모니터링**: GA4 실시간 `purchase`, 콘솔 에러, CS 문의 유입
6. 배포 로그를 `deploy-log.md`에 1줄 기록 (일시/버전/담당/롤백여부)

### 6.3 롤백 기준 (하나라도 해당 시 즉시 이전 버전 게시 — 1분 내 복구)

- 결제/장바구니 오류 문의 **1건이라도** 접수
- 실시간 `purchase` 이벤트가 직전 동시간대 대비 **30% 이상 급감**
- 콘솔 JS 에러가 신규 발생
- Meta 픽셀 이벤트 누락

> 롤백 = GTM → 이전 버전 → [게시]. 스택 관리자 화면 수정 없음 → **비개발자도 가능**(운영팀에 절차 공유).

### 6.4 리스크·보안 명시

| 리스크 | 대응 |
|---|---|
| **카카오 JS 키 노출** | JS 키는 공개용이나 **반드시 카카오 콘솔에 valluat.com 도메인 등록**. REST API 키·Admin 키는 프론트에 절대 금지. 알림톡 발송은 서버(또는 발송 대행사) 경유만 |
| **Slack Webhook / GA4 API 자격증명** | Apps Script Script Properties에 보관. 문서·깃·GTM에 하드코딩 금지 |
| **셀럽 이미지 초상권** | 마케팅팀이 사용 허용 컷만 전달. 미확인 컷은 DEV-2 배포 대상에서 제외 |
| **스펙 오정보** | 사이즈/무게/수납은 운영팀 실측 서명 후 반영 (오정보 = 반품·CS 비용) |
| **GTM 단일 장애점** | 9월 성수기 중 GTM 계정 접근 권한을 **개발 1명 + 대표실 1명** 이중화 |
| **개인정보** | 데이터레이어에 이름·연락처·주소 **절대 push 금지**. 주문번호는 GA4 transaction_id 용도로만 |
| **A/B 중 광고 성과 혼선** | 마케팅팀에 A/B 기간(8/25~8/31) 사전 공유, 소재 성과 판단 시 변수 고려 |

### 6.5 오늘(8/10) 즉시 실행 3가지

1. **Step 0 스크립트 실행** → §0.3 표 채우고 팀 공유 (개발, 30분 내)
2. GTM 컨테이너 유무 확인 → 없으면 계정 생성 + 스택 관리자 화면에 스니펫 삽입 요청 (개발)
3. 마케팅팀에 요청 발송: 마리백 셀럽 착용컷 4장(사용 허가분) + 채널 리워드 쿠폰 발행 (개발 → 마케팅)