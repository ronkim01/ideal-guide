# 2026-08-10 개발팀 결과물

# 일본어몰(valluat.com/ja) 기술 요건 점검 — 개발팀 산출물

> **결론 먼저**
> 1. 다국어 구조는 **서브폴더 `valluat.com/ja/`** 가 1순위. 단, 현 솔루션이 Cafe24/메이크샵이면 멀티샵 구조상 **`jp.valluat.com` 서브도메인**으로 강제될 가능성이 높음 → **오늘 안에 스택 판별 스크립트 실행으로 확정**.
> 2. 결제는 **JCB 카드 + PayPay + 콤비니 + Paidy(후불)** 4종이 필수. 한국 법인 상태에서 이 4종을 한 번에 붙일 수 있는 현실적 PSP는 **KOMOJU(1순위) / Eximbay(백업)**. Stripe·GMO·SBPS는 **일본 법인 필요**라 2단계 과제.
> 3. **가죽 핸드백은 일본 소액수입 면세(1만엔 이하) 대상에서 제외**되는 품목군이며 관세율도 높음 → **DDP(관세·소비세 선결제) 배송 필수**. 이 항목이 자체몰 직판 손익의 최대 변수.
> 4. 예상 기간: **Track A(기존 솔루션 멀티샵) 4~6주 / Track B(Shopify 별도몰) 6~10주 / Track C(풀커스텀) 12~16주**.
> ⚠️ 세율·수수료·솔루션 스펙은 벤더 공식 견적/세관 품목분류로 **반드시 재확인**(본 문서 §4 RFI 참조).

---

# 1. 제작물

## 1-1. 스택 판별 스크립트 (오늘 즉시 실행 → 모든 분기의 전제)

현 valluat.com이 무엇으로 돌아가는지에 따라 아래 모든 요건의 난이도가 2~3배 차이납니다. 아래 스크립트를 실행해 **오늘 오전 중 확정**하십시오.

**`stack-detect.mjs`** (Node 18+, 의존성 없음)

```js
// 사용법: node stack-detect.mjs https://valluat.com
// 목적: 커머스 솔루션/CDN/다국어 처리 방식/기존 hreflang 유무를 1분 안에 판별
const url = process.argv[2] || 'https://valluat.com';

const SIGS = [
  ['Cafe24',      /cafe24|ec-cube-cafe24|\.cafe24\.com|CAFE24|EC_SHOP_ID/i],
  ['Shopify',     /cdn\.shopify\.com|Shopify\.theme|shopify-features/i],
  ['MakeShop',    /makeshop\.co\.kr|makeshop\.kr/i],
  ['Godomall',    /godomall|godo\.co\.kr/i],
  ['Imweb',       /imweb\.me|imweb-/i],
  ['NHN Commerce',/nhn-commerce|shopby/i],
  ['WooCommerce', /woocommerce|wp-content/i],
  ['Next.js',     /_next\/static/i],
];

const PAY = [
  ['Inicis', /inicis/i], ['KCP', /kcp\.co\.kr|payplus/i], ['Toss', /tosspayments/i],
  ['NicePay', /nicepay/i], ['PayPal', /paypal/i], ['Eximbay', /eximbay/i], ['KOMOJU', /komoju/i],
];

const paths = ['/', '/robots.txt', '/sitemap.xml', '/ja', '/ja/', '/jp/', '/en/'];

const get = async (p) => {
  try {
    const r = await fetch(new URL(p, url), { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 valluat-audit' } });
    const body = r.status < 400 ? (await r.text()).slice(0, 400000) : '';
    return { p, status: r.status, loc: r.headers.get('location'), server: r.headers.get('server'),
             powered: r.headers.get('x-powered-by'), setCookie: (r.headers.get('set-cookie') || '').slice(0, 120), body };
  } catch (e) { return { p, status: 'ERR', err: e.message, body: '' }; }
};

const res = await Promise.all(paths.map(get));
const home = res[0];

console.log('=== 1) 응답 요약 ===');
res.forEach(r => console.log(`${r.p.padEnd(12)} ${String(r.status).padEnd(5)} ${r.loc ? '→ ' + r.loc : ''}`));

console.log('\n=== 2) 헤더 ===');
console.log('server:', home.server, '| x-powered-by:', home.powered, '| cookie:', home.setCookie);

console.log('\n=== 3) 커머스 솔루션 추정 ===');
SIGS.forEach(([n, re]) => re.test(home.body) && console.log('  ✔', n));

console.log('\n=== 4) 결제 모듈 흔적 ===');
PAY.forEach(([n, re]) => re.test(home.body) && console.log('  ✔', n));

console.log('\n=== 5) 다국어/SEO 현황 ===');
const hreflang = [...home.body.matchAll(/hreflang=["']([^"']+)["']/gi)].map(m => m[1]);
console.log('  hreflang:', hreflang.length ? hreflang.join(', ') : '없음(신규 구축 필요)');
console.log('  canonical:', (home.body.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/i) || [])[1] || '없음');
console.log('  lang속성:', (home.body.match(/<html[^>]*lang=["']([^"']+)/i) || [])[1] || '없음');
console.log('  og:locale:', (home.body.match(/og:locale["'][^>]*content=["']([^"']+)/i) || [])[1] || '없음');
console.log('  /ja 경로 존재:', res.find(r => r.p === '/ja/')?.status);
console.log('  통화표시 JPY 흔적:', /JPY|¥|円/.test(home.body));
```

**판별 결과 → 분기 표**

| 판별 결과 | 다국어 구조 실현 가능성 | 권장 Track |
|---|---|---|
| Cafe24 | 멀티샵(글로벌몰) = **서브도메인/별도도메인**만 가능, `/ja/` 불가 가능성 큼 | **A** (jp.valluat.com) |
| MakeShop / 고도몰 | 글로벌 기능 제한적, 커스텀 다수 | A 또는 B |
| Shopify | Markets 기능으로 `/ja/` 서브폴더 네이티브 지원 | **B**(최적) |
| Next.js/자체개발 | i18n 라우팅으로 `/ja/` 자유 구현 | **C** |

---

## 1-2. 다국어 구조 3안 비교 & 채택안

| 구분 | ① 서브폴더 `valluat.com/ja/` | ② 서브도메인 `jp.valluat.com` | ③ ccTLD `valluat.jp` |
|---|---|---|---|
| SEO 도메인 권위 | **본체 권위 100% 승계(최강)** | 부분 승계 | 승계 없음(0부터) |
| 일본 현지 신뢰도 | 보통 | 보통 | **최상(.jp 선호)** |
| 구축 난이도 | 솔루션 의존(높을 수 있음) | **낮음(멀티샵 표준)** | 낮음(별도몰) |
| 운영비 | 낮음 | 낮음 | 도메인+SSL+운영 이중화 |
| 통계/광고 픽셀 | 통합 용이 | 도메인 분리로 크로스도메인 설정 필요 | 완전 분리 |
| 결제/배송 분리 | 어려움(같은 체크아웃) | **쉬움** | 쉬움 |
| 결론 | 자체개발/Shopify일 때 1순위 | **Cafe24류일 때 현실적 1순위** | 3단계(연 매출 5억엔↑ 시) |

**채택안**: 기술 판별 결과에 따라 ①(Shopify/자체개발) 또는 ②(Cafe24/메이크샵).
③ `valluat.jp` 도메인은 **오늘 방어적으로 선점만** 해두고 실제 운영은 유보 (연 3~5만원, ROI 명확).

**공통 URL 규칙 (외주 전달용 확정 스펙)**

```
/ja/                       일본어 홈
/ja/products/{handle}      상품 상세 (handle은 영문 슬러그 공통, 언어별 title만 분리)
/ja/collections/{handle}   카테고리
/ja/pages/tokushoho        特定商取引法に基づく表記 (일본 법정 필수)
/ja/pages/privacy          プライバシーポリシー
/ja/pages/shipping         配送・関税について
/ja/pages/returns          返品・交換
언어 협상: 자동 리다이렉트 금지(SEO 페널티/UX 저하) → 배너 제안 방식만 허용
```

## 1-3. 다국어 SEO 헤드 스니펫 & 언어 스위처

**`head-ja.html`** — 모든 `/ja/` 페이지 `<head>`에 삽입

```html
<!-- ① 언어 선언 : <html lang="ja"> 로 변경 필수 -->
<link rel="canonical" href="https://valluat.com/ja/products/{{handle}}" />

<!-- ② hreflang 상호 참조 : 한국어 페이지에도 반드시 역방향 태그를 넣을 것 -->
<link rel="alternate" hreflang="ko-KR" href="https://valluat.com/products/{{handle}}" />
<link rel="alternate" hreflang="ja-JP" href="https://valluat.com/ja/products/{{handle}}" />
<link rel="alternate" hreflang="x-default" href="https://valluat.com/products/{{handle}}" />

<!-- ③ OG (일본 SNS/LINE 공유 대응) -->
<meta property="og:locale" content="ja_JP" />
<meta property="og:locale:alternate" content="ko_KR" />
<meta property="og:site_name" content="VALLUAT（ヴァリュエット）" />

<!-- ④ 상품 구조화 데이터 : 엔화·재고·배송비 명시 (구글 쇼핑 무료 리스팅 대응) -->
<script type="application/ld+json">
{
  "@context":"https://schema.org","@type":"Product",
  "name":"{{name_ja}}","brand":{"@type":"Brand","name":"VALLUAT"},
  "image":["{{image1}}"],"description":"{{desc_ja}}",
  "offers":{"@type":"Offer","priceCurrency":"JPY","price":"{{price_jpy}}",
    "availability":"https://schema.org/InStock",
    "url":"https://valluat.com/ja/products/{{handle}}",
    "shippingDetails":{"@type":"OfferShippingDetails",
      "shippingRate":{"@type":"MonetaryAmount","value":"{{ship_jpy}}","currency":"JPY"},
      "shippingDestination":{"@type":"DefinedRegion","addressCountry":"JP"},
      "deliveryTime":{"@type":"ShippingDeliveryTime",
        "handlingTime":{"@type":"QuantitativeValue","minValue":1,"maxValue":2,"unitCode":"DAY"},
        "transitTime":{"@type":"QuantitativeValue","minValue":3,"maxValue":6,"unitCode":"DAY"}}},
    "hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy",
      "applicableCountry":"JP","returnPolicyCategory":"https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays":7,"returnMethod":"https://schema.org/ReturnByMail",
      "returnFees":"https://schema.org/ReturnShippingFees"}}
}
</script>
```

**`geo-suggest.js`** — 자동 리다이렉트 금지, 배너 제안 방식 (전환율·SEO 동시 보호)

```js
/* 일본 방문자에게 일본어몰을 "제안"만 한다. 강제 이동 금지(구글 크롤 차단 위험 + 이탈 유발) */
(function () {
  var KEY = 'vl_locale_pref';
  if (location.pathname.indexOf('/ja') === 0) return;          // 이미 일본어몰
  if (localStorage.getItem(KEY)) return;                        // 이미 선택함
  var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  var lang = (navigator.language || '').toLowerCase();
  var isJP = tz === 'Asia/Tokyo' || lang.indexOf('ja') === 0;
  if (!isJP) return;

  var target = location.origin + '/ja' + location.pathname;     // 대응 페이지 매핑
  var el = document.createElement('div');
  el.setAttribute('role', 'dialog');
  el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#111;color:#fff;'
    + 'padding:14px 16px;display:flex;gap:12px;align-items:center;justify-content:center;'
    + 'font:14px/1.5 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
  el.innerHTML = '<span>日本からのアクセスですか？日本語・円表示のページをご覧いただけます。</span>'
    + '<button id="vl-go" style="background:#fff;color:#111;border:0;padding:8px 16px;border-radius:2px;font-weight:600">日本語サイトへ</button>'
    + '<button id="vl-no" style="background:transparent;color:#aaa;border:0;padding:8px">閉じる</button>';
  document.body.appendChild(el);
  document.getElementById('vl-go').onclick = function () {
    localStorage.setItem(KEY, 'ja');
    if (window.gtag) gtag('event', 'locale_banner_accept', { locale: 'ja' });
    location.href = target;
  };
  document.getElementById('vl-no').onclick = function () {
    localStorage.setItem(KEY, 'ko');
    el.remove();
  };
})();
```

**`price-jpy.js`** — 엔화 가격 라운딩 규칙 (환율 변동 시 가격 재계산 자동화)

```js
/* KRW → JPY 소비자가 산출. 환율 리스크 버퍼 + 일본 EC 관행(끝자리 800/900) 반영 */
export function toJpyPrice(krw, { fx = 0.107, buffer = 1.12, ddpRate = 0.13 } = {}) {
  // fx: 100원당 엔 환산율(예: 1 KRW = 0.107 JPY) → 운영 시 주 1회 갱신
  // buffer: 환변동+PG수수료+결제취소 리스크 12%
  // ddpRate: 관세+소비세 선반영률(가죽가방 기준, §1-5 참조)
  const raw = krw * fx * buffer * (1 + ddpRate);
  const base = Math.ceil(raw / 100) * 100;          // 100엔 단위 절상
  return base - 100 + 80;                            // 끝자리 80엔(예: 12,880) — 일본 관행
}
// 예: 129,000원 → toJpyPrice(129000) ≈ ¥18,780
```

## 1-4. 엔화 결제수단 요건 (핵심 병목)

**필수 탑재 우선순위**

| 순위 | 수단 | 왜 필요한가 | 미탑재 시 리스크 |
|---|---|---|---|
| 1 | **크레딧카드(JCB 필수 포함)** | 일본 EC 결제의 과반. JCB는 일본 발행 카드 상당 비중, VISA/Master만 붙이면 결제 실패·이탈 | 결제 시도 이탈 대량 발생 |
| 2 | **PayPay** | 일본 QR결제 1위, 20~30대 여성 침투율 높음(타깃 일치) | 젊은 층 전환 손실 |
| 3 | **콤비니 결제** | 카드 미보유/카드 노출 기피층. 편의점 선불 → 미성년·학생 포함 | 특정 세그먼트 통째로 이탈 |
| 4 | **Paidy / NP後払い (후불)** | 고단가(2~4만엔) 가방에서 심리적 장벽 완화 | AOV 상승 기회 손실 |
| 5 | Amazon Pay / 라쿠텐페이 | 주소 자동입력 → 폼 이탈 감소 | 2단계 과제 |

**PSP 후보 비교 (한국 법인 상태 기준)**

| PSP | 한국 법인 계약 | JCB | PayPay | 콤비니 | Paidy | 정산 | 예상 요율 | 판정 |
|---|---|---|---|---|---|---|---|---|
| **KOMOJU (Degica)** | ○ 해외 사업자 지원 | ○ | ○ | ○ | ○ | JPY→해외송금 | ~3.6%+α ⚠️견적필요 | **1순위** |
| **Eximbay** | ◎ 국내 PG | ○ | ○(확인) | △ | ✕ | KRW | ~3.5~4.5% ⚠️ | **백업/병행** |
| PayPal | ◎ | △ | ✕ | ✕ | ✕ | USD | ~4.4%+ | 단독 불가 |
| Stripe JP / GMO / SBPS | **✕ 일본 법인 필수** | ○ | ○ | ○ | ○ | JPY | 3.25%~ | **2단계(법인 설립 후)** |
| Shopify Payments | **✕ 한국 미지원** | - | - | - | - | - | - | 사용 불가 |

> **개발팀 판단**: `KOMOJU(주) + Eximbay(백업 카드)` 이중화. Shopify로 갈 경우 KOMOJU 공식 앱이 있어 개발 공수 최소(2~3일). 자체 솔루션이면 KOMOJU Hosted Page 연동 5~8일.

**체크아웃 UI 요건 (전환율 직결 — 반드시 명세에 포함)**

```
[ ] 결제수단 아이콘을 상품 상세·장바구니에도 노출 (JCB/PayPay/コンビニ 로고)
[ ] 일본 주소 폼: 郵便番号(7자리) 입력 시 도도부현·시구정촌 자동완성 (필수)
    → zipcloud API 또는 KEN_ALL 기반. 주소 입력 이탈의 최대 원인
[ ] 성/이름 분리 입력 + フリガナ(카타카나) 필드 (일본 배송 표준)
[ ] 전화번호 형식 검증: 0X0-XXXX-XXXX
[ ] 가격 표기: 総額表示(세금 포함) 원칙 + "関税・消費税込み(DDP)" 명시
[ ] 배송 예정일 명시: "ご注文から4〜7営業日でお届け"
[ ] 게스트 체크아웃 허용 (회원가입 강제 금지)
```

**우편번호 자동완성 스니펫**

```js
// 郵便番号 → 住所 자동입력 (zipcloud, 무료/키 불필요) ⚠️ SLA 없음. 트래픽 커지면 자체 KEN_ALL DB로 교체
document.querySelector('#zip').addEventListener('blur', async (e) => {
  const zip = e.target.value.replace(/[^0-9]/g, '');
  if (zip.length !== 7) return;
  const r = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`).then(r => r.json());
  const a = r.results && r.results[0];
  if (!a) return;
  document.querySelector('#pref').value = a.address1;                 // 都道府県
  document.querySelector('#city').value = a.address2 + a.address3;    // 市区町村・町域
  document.querySelector('#addr1').focus();
});
```

## 1-5. 해외배송 · 관세 요건 ★손익 최대 변수

**⚠️ 가장 중요한 발견 — 담당자에게 반드시 전달**
일본의 소액수입 면세(과세가격 1만엔 이하) 제도에는 **혁제(가죽) 가방·신발 등 제외 품목**이 있고, 가죽 핸드백은 관세율도 높은 품목군입니다. 즉 **벨류엣 상품은 저단가여도 면세 혜택을 기대할 수 없습니다.**
→ **DUTY 미포함(DDU) 배송 시 고객이 수령 시점에 세금 청구를 받고 수취거부·클레임이 폭증**합니다. **DDP(관세·소비세 판매자 선부담, 가격에 반영) 정책이 사실상 필수.**

| 항목 | 요건 | 담당/확인처 |
|---|---|---|
| HS 코드 확정 | 4202.21(가죽), 4202.22(합성/직물), 4202.31 등 소재별 분류 | 관세사 ⚠️필수 |
| 관세율 | 소재·원산지별 상이. **한국산이면 RCEP 협정세율 적용 가능성** → 원산지증명(자율발급)으로 세율 인하 검토 | 관세사 |
| 원산지 | **국내생산 / 중국생산 SKU를 분리 관리**해야 세율·증빙이 갈림 | 생산팀+개발(상품 필드) |
| 소비세 10% | 수입 시 과세. DDP면 판매가에 선반영 | 재무 |
| JCT 등록 | **직배송(개인수입) 방식이면 원칙적으로 불요**. 일본 현지 재고/3PL 보유 시 과세사업자 등록 필요 | 세무 ⚠️ |

**배송 옵션 매트릭스**

| 방식 | 리드타임 | 비용대 | DDP | 반품 | 적용 단계 |
|---|---|---|---|---|---|
| EMS / K-Packet (우체국) | 3~6일 | 저 | △ | 어려움 | **1단계 기본** |
| DHL / FedEx Express | 2~3일 | 고 | ○(DDP 기능 표준) | 가능 | 1단계 프리미엄/고단가 |
| 국내 포워더 통합배송(합포장 통관) | 4~7일 | 중 | ○ | 중 | 물량 증가 시 |
| 일본 현지 3PL 선적 후 야마토/사가와 | **1~2일** | 중(초기투자 큼) | 불필요(국내거래) | **용이** | **2~3단계** |

**배송비 정책안 (전환율 기준으로 설계)**

```
¥20,000 이상 구매 → 送料無料 (AOV 상향 유도, 가방 단가 고려 시 대부분 해당)
¥20,000 미만     → 一律 ¥1,200
반품: 상품 도착 후 7일 이내, 반품 배송비 고객 부담(¥3,000 정액) — 特商法 표기 필수
초기 불량/오배송: 전액 당사 부담
※ 반품 물류비가 크므로 "상세 사이즈·실측 컷·착용 컷"으로 반품률 선제 억제 (디자인팀 협업)
```

## 1-6. 상품 데이터 일본어 필드 — 난이도 판정 **중(中)**

**난이도 결론**: 필드 추가 자체는 쉬움(솔루션 다국어 필드 or 커스텀 컬럼). **진짜 비용은 번역 품질·SEO 키워드 매핑·운영 프로세스**에 있음. 신규 상품 등록 플로우에 일본어 입력 단계를 넣지 않으면 3개월 내 반드시 무너집니다.

**`ja_product_fields.csv` 컬럼 스펙 (MD팀/외주 번역가 배포용)**

| 컬럼 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `sku` | ● | 기존 SKU (조인 키) | VL-2601-BK |
| `handle` | ● | URL 슬러그(언어 공통, 영문) | mini-tote-lena |
| `name_ja` | ● | 상품명. **일본 검색 키워드 포함** | レナ ミニトートバッグ |
| `subtitle_ja` | ○ | 한 줄 소구 | お呼ばれ・デートに |
| `desc_ja` | ● | 상세 설명(HTML 허용) | — |
| `material_ja` | ● | 素材 (관세 분류와 연동) | 牛革 / 合成皮革 |
| `size_ja` | ● | W○○ × H○○ × D○○ cm 표기 | W24×H18×D9cm |
| `weight_g` | ● | 배송비·통관용 실중량 | 520 |
| `color_ja` | ● | ブラック / アイボリー 등 | ブラック |
| `care_ja` | ○ | お手入れ方法 | — |
| `price_jpy` | ● | §1-3 라운딩 규칙 적용가 | 18780 |
| `hs_code` | ● | 관세 분류 | 4202.21 |
| `origin_country` | ● | KR / CN (RCEP 판단) | KR |
| `keywords_ja` | ● | JP SEO 키워드(콤마) | 結婚式 バッグ,お呼ばれ,二次会 |
| `celeb_ja` | ○ | 셀럽 착용 표기(브랜드 자산) | ○○さん着用 |

**JP 키워드 매핑 표 (브랜드 포지셔닝 직역 금지 — 마케팅팀 공유용)**

| 한국어 컨셉 | ❌ 직역 | ✅ 일본 실검색어 |
|---|---|---|
| 하객룩 가방 | ゲストルックバッグ | **結婚式 バッグ / お呼ばれバッグ / 二次会 バッグ** |
| 소개팅룩 | お見合いルック | **デートコーデ / モテ服** |
| 출근룩 | 出勤ルック | **オフィスカジュアル / 通勤バッグ** |
| 데일리백 | デイリーバッグ | **普段使い バッグ** |
| 미니백 | ミニバッグ | **ミニバッグ / スマホショルダー** |

**번역 파이프라인 (품질 대비 비용 최적)**
```
1차: DeepL API 자동 번역 (전 SKU 일괄, 1일)
2차: 일본어 네이티브 감수 — 상품명/서브타이틀/키워드만 (전환에 직결되는 부분에 예산 집중)
3차: 용어집(glossary) 고정 → 이후 신상품은 1차+용어집만으로 처리
※ 상세 설명 본문은 1차 번역 + 이미지 내 텍스트(일본어 상세컷)로 보완 → 디자인팀 협업
```

## 1-7. 일본 법정 필수 페이지 (미비 시 광고 거절·행정 리스크)

**`/ja/pages/tokushoho` — 特定商取引法に基づく表記 (필수, 미게시 시 위법)**

```
販売業者：            （주）벨류엣 법인명 로마자/한자 표기
運営責任者：          대표자명
所在地：              대한민국 서울특별시 ... （한국 주소 그대로 기재 가능）
電話番号：            +82-XX-XXXX-XXXX（受付時間 平日10:00-17:00 KST）
メールアドレス：      jp@valluat.com
販売価格：            各商品ページに表示（関税・消費税込み／送料別途）
商品代金以外の必要料金： 送料 ¥1,200（¥20,000以上のご購入で無料）／返品時の送料
支払方法：            クレジットカード(JCB/VISA/Master/AMEX)、PayPay、コンビニ決済、Paidy
支払時期：            ご注文時（コンビニ決済は発行後3日以内のお支払い）
引渡time期：           ご注文確認後4〜7営業日以内に発送（韓国からの国際発送）
返品・交換：          商品到着後7日以内。お客様都合の返品は返送料 ¥3,000 のご負担。
                     未使用・タグ付き・付属品完備に限ります。
                     不良品・誤配送は当社負担で交換いたします。
```
> ⚠️ 실제 게시 전 **법무·세무 검토 필수**. 상기는 개발용 필드 구조 초안입니다.

**추가 필수 항목**
- `プライバシーポリシー` : 개인정보 **국외(한국) 이전** 사실 명시 — 일본 개인정보보호법 대응
- **外部送信規律 표기** : 전기통신사업법 개정에 따라 Meta 픽셀·GA 등 **제3자 송신 정보를 고지**해야 함. Cookie 배너 + 외부송신 안내 페이지 필요 ⚠️ (한국 사이트에 없는 항목, 누락 빈발)
- **景品表示法** : 이중가격(정가/할인가) 표시, "最高" "No.1" 등 최상급 표현 규제 → **한국몰 카피 직역 시 위반 위험**. 마케팅팀에 전달 필요.

## 1-8. 작업 범위 · 예상 기간 · 필요 외부 솔루션

**WBS (Track A: 기존 솔루션 멀티샵 기준, 총 4~6주)**

| 주차 | 작업 | 담당 | 산출물 |
|---|---|---|---|
| W0 (오늘) | 스택 판별 스크립트 실행, 벤더 RFI 발송(§4), `valluat.jp` 선점 | 개발 | 분기 확정 |
| W1 | 멀티샵/서브도메인 개설, JPY 통화 설정, 도메인·SSL, 디자인 스킨 이식 | 개발+솔루션사 | 스테이징(noindex) |
| W1~2 | KOMOJU 심사 신청(**리드타임 2~4주, 최장 병목 → W1에 반드시 착수**) | 개발+재무 | PSP 계정 |
| W2 | 상품 데이터 일본어 필드 생성 + DeepL 1차 번역(전 SKU) | 개발+MD | ja CSV |
| W2~3 | 네이티브 감수(상품명/키워드), 상세 이미지 일본어 버전 상위 30 SKU | MD+디자인 | 확정 카피 |
| W3 | 결제 연동(카드/PayPay/콤비니/Paidy), 우편번호 자동완성, 체크아웃 QA | 개발 | 결제 동작 |
| W3 | 배송·관세 정책 확정(관세사 자문), DDP 계약, 배송비 테이블 | 물류+관세사 | 정책 문서 |
| W4 | 법정 페이지 3종, hreflang/구조화데이터, GA4·Meta 픽셀 JP 분리 | 개발 | SEO/계측 |
| W4 | 통합 QA(§2), 소액 실결제 테스트, 실배송 1건 테스트 | 전원 | QA 리포트 |
| W5 | 소프트 오픈(제한 트래픽), 지표 모니터링 | 마케팅 | 오픈 |
| W6 | 개선 반영, 광고 본격 집행 | 전원 | — |

**Track별 기간·공수**

| Track | 조건 | 기간 | 개발 공수 | 초기 비용(추정) ⚠️ |
|---|---|---|---|---|
| **A. 기존 솔루션 멀티샵** | Cafe24/메이크샵 | **4~6주** | 0.5~1인 | 500~1,500만원 |
| **B. Shopify 별도몰** | 신규 구축, KOMOJU 앱 | **6~10주** | 1~1.5인 | 1,500~3,500만원 |
| **C. 풀커스텀** | 자체개발 스택 | **12~16주** | 2인+ | 5,000만원~ |

**필요 외부 솔루션 목록**

| 구분 | 솔루션 | 용도 | 비용대 ⚠️ | 필수도 |
|---|---|---|---|---|
| 결제 | **KOMOJU** | JCB/PayPay/콤비니/Paidy 통합 | 요율 ~3.6% | ★필수 |
| 결제 백업 | Eximbay | 카드 이중화 | 요율 ~4% | ★권장 |
| 번역 | DeepL API Pro | 1차 대량 번역 | 월 3만원~ | ★필수 |
| 번역감수 | 네이티브 프리랜서/에이전시 | 상품명·카피 | SKU당 5천~1.5만원 | ★필수 |
| 배송 | EMS + DHL(DDP) 계약 | 국제배송 | 건당 | ★필수 |
| 통관 | 관세사 자문 | HS/RCEP 원산지 | 월 자문료 | ★필수 |
| 주소 | zipcloud → KEN_ALL 자체DB | 우편번호 자동완성 | 무료 | ★필수 |
| 법무 | 일본 EC 법무 검토 | 特商法·景表法·외부송신 | 1회 | ★필수 |
| 리뷰 | Judge.me / 자체 | JP 리뷰 수집 | 월 3만원~ | 권장 |
| CS | 챗봇+일본어 CS(외주) | 시차·언어 대응 | 월 | 권장 |

---

# 2. 테스트

## 2-1. 릴리스 게이트 체크리스트 (전부 ✔ 이전 오픈 금지)

**A. 다국어/SEO**
- [ ] `/ja/` 전 페이지 `<html lang="ja">`
- [ ] hreflang **양방향** 설정(한국어 페이지 → 일본어 페이지 역참조 포함)
- [ ] canonical이 자기 자신을 가리킴(한국어 페이지로 잘못 지정 X)
- [ ] 자동 리다이렉트 없음 (Googlebot 접근 시 정상 노출)
- [ ] `robots.txt`에 `/ja/` 차단 없음, sitemap에 `/ja/` URL 포함
- [ ] 구조화 데이터 `priceCurrency: JPY` — [Rich Results Test] 오류 0

**B. 결제 (스테이징 → 프로덕션 소액 실결제)**
- [ ] JCB 테스트카드 승인 성공 → **실카드 ¥100 상품으로 실결제 1건**
- [ ] VISA / Master / AMEX 각 1건
- [ ] **3D Secure(본인인증) 화면 정상 표시 및 통과**
- [ ] PayPay: 실제 일본 계정으로 앱 전환 → 복귀 → 주문 생성 확인
- [ ] 콤비니: 결제번호 발행 → 미결제 시 자동 주문취소 배치 동작
- [ ] Paidy: 승인 → 주문 생성 → 취소 플로우
- [ ] **결제 취소·부분환불** 각 1건 (환불 반영 기간 안내 문구 확인)
- [ ] 결제 실패 시 일본어 에러 메시지 노출(영어 raw 메시지 노출 금지)

**C. 체크아웃 UX (전환율)**
- [ ] 우편번호 7자리 입력 → 주소 자동완성 3케이스(도쿄/오사카/홋카이도)
- [ ] フリガナ 필드 검증, 성/이름 분리
- [ ] 게스트 결제 가능
- [ ] **모바일(iOS Safari / Android Chrome) 실기기 전 과정 완주** — 일본 트래픽 대부분 모바일
- [ ] 상품 상세 → 결제 완료까지 **3탭 이내**
- [ ] LCP 2.5초 이내(일본 네트워크 기준 — WebPageTest Tokyo 노드로 측정)

**D. 물류·세무**
- [ ] 실제 일본 주소로 **테스트 발송 1건** → 통관·배송·추적번호 조회까지 완주
- [ ] DDP 적용 시 **수취인에게 추가 청구 없음** 확인 (이것이 가장 중요)
- [ ] 반품 1건 실행 → 환불 완료까지 소요일 측정

**E. 법무/계측**
- [ ] 特商法 페이지 게시 및 푸터 링크
- [ ] 쿠키/외부송신 배너 표시
- [ ] GA4에 `/ja/` 트래픽 별도 세그먼트 수집, 구매 이벤트 `currency: JPY`
- [ ] Meta 픽셀 JP 도메인 인증(서브도메인일 경우 별도 인증 필요)

## 2-2. QA 시나리오 (담당자에게 그대로 전달)

```
S1. 일본 IP(VPN Tokyo) + iPhone Safari + 일본어 OS
    → valluat.com 접속 → 배너 노출 → "日本語サイトへ" → /ja/ 이동 확인
S2. /ja/ 홈 → 인기 상품 → 사이즈/소재 일본어 확인 → 카트 → 결제(JCB)
    → 주문 확인 메일이 일본어로 수신되는지 확인 ★누락 빈발 항목
S3. 콤비니 결제 선택 → 결제번호 메일 수신 → 미결제 3일 경과 → 자동취소 확인
S4. 결제 완료 후 주문조회(비회원) → 배송 추적번호 확인
S5. 반품 신청 폼 → 안내 메일 → 환불 처리
※ 모든 자동발송 메일/SMS 템플릿의 일본어 번역 여부를 별도 체크(개발 초기 최다 누락)
```

---

# 3. 배포안

## 3-1. 오늘(D-Day) 실행 항목 — 회사 목표 직결

| 시각 | 작업 | 담당 | 산출 |
|---|---|---|---|
| 오전 | `stack-detect.mjs` 실행 → 솔루션·다국어 가능 구조 확정 | 개발 | 분기 확정 리포트 |
| 오전 | `valluat.jp` 도메인 선점 | 개발 | 도메인 확보 |
| 오후 | KOMOJU / Eximbay **RFI 발송**(§4) — 심사 리드타임이 최장 병목 | 개발+재무 | 회신 대기 |
| 오후 | 솔루션사(Cafe24 등)에 글로벌몰 스펙 문의 발송 | 개발 | 회신 대기 |
| 오후 | 관세사에 HS 4202 대표 3개 SKU 품목분류·RCEP 적용 질의 | 물류 | 세율 확정 근거 |

> **대표실 보고 포인트**: 플랫폼(지그재그JP/라쿠텐/Qoo10 등) 입점 판단 시, **자체몰 직판의 진짜 비용은 결제 연동이 아니라 "가죽가방 관세·DDP 물류"** 라는 점. 1단계 플랫폼 입점으로 수요 검증 → 2단계 자체몰이 타당하다는 근거가 됩니다.

## 3-2. 배포 단계

```
[Stage 1] 스테이징 구축 (W1~W4)
  - 서브도메인 stg-jp.valluat.com, Basic Auth + robots noindex 필수
  - PSP는 반드시 샌드박스 키 사용
[Stage 2] 프로덕션 배포 (W4)
  - 프로덕션 배포 시점에도 /ja/ 는 noindex 유지
  - 내부 인원만 접근하여 소액 실결제 테스트 (§2-1 B)
[Stage 3] 소프트 오픈 (W5)
  - noindex 해제, sitemap 제출
  - 일 광고비 상한 설정하고 소규모 Meta 트래픽 유입 → 결제 완주율 모니터링
  - 첫 실주문 10건은 배송·통관 전수 추적
[Stage 4] 본격 오픈 (W6~)
  - 광고 확대, 플랫폼 입점 채널과 가격 정합성 점검(가격 역전 금지)
[Rollback]
  - 결제 오류율 > 5% 또는 통관 지연 발생 시 → /ja/ 를 "준비중" 랜딩 + 이메일 수집 폼으로 즉시 전환
  - 롤백 스위치는 단일 플래그(feature flag)로 구현할 것
```

## 3-3. 보안 · 리스크 명시 (필독)

| 리스크 | 내용 | 대응 |
|---|---|---|
| **PG 시크릿 키 노출** | KOMOJU secret key를 프론트엔드/테마 코드에 넣으면 즉시 침해 | **반드시 서버 환경변수**. 프론트는 public key만. 리포지토리 커밋 금지, `.env` gitignore |
| **PCI 범위 확대** | 카드번호를 자체 폼에서 직접 수집하면 PCI-DSS 부담 급증 | **Hosted Page / iframe(SAQ-A) 방식만 사용**. 자체 카드 폼 개발 금지 |
| **개인정보 국외이전** | 일본 고객 정보를 한국 서버에 저장 → 고지·동의 필요 | 프라이버시 정책에 이전국·목적·항목 명시, 체크박스 동의 |
| **외부송신 규율** | Meta 픽셀/GA 미고지 시 일본 전기통신사업법 저촉 소지 | 쿠키 배너 + 외부송신 안내 페이지 게시 |
| **DDU 배송** | 고객이 수령 시 세금 청구 → 수취거부·CS 폭증·리뷰 훼손 | **DDP 고정. 정책상 DDU 금지** |
| **가격 역전** | 플랫폼 입점가 < 자체몰가 시 자체몰 무력화 | 가격 정합성 룰 사전 확정(마케팅팀 협의) |
| **테스트 결제 데이터** | 실카드 테스트 후 데이터 방치 | 테스트 주문은 태그로 격리, 정산 전 제외 처리 |

---

# 4. 부록 — 오늘 발송할 벤더 질의서(RFI)

**A. PSP(KOMOJU / Eximbay)에게**
```
1. 한국 법인(일본 법인 없음)이 계약 가능한가? 필요 서류와 심사 소요 기간은?
2. JCB / PayPay / コンビニ / Paidy 각각 지원 여부와 개별 수수료율은?
3. 정산 통화·주기, 해외 송금 수수료, 최소 정산금액은?
4. 3D Secure 2.0 지원 여부, 일본어 결제 화면 제공 여부는?
5. 연동 방식(Hosted Page / API / Shopify앱)과 샌드박스 제공 여부는?
6. 월 거래액 5천만원 / 3억원 구간의 요율 테이블은?
7. 결제 취소·부분환불·분쟁(chargeback) 처리 절차는?
```

**B. 커머스 솔루션사에게**
```
1. 일본어몰을 서브폴더(valluat.com/ja/)로 운영 가능한가? 불가하면 가능한 구조는?
2. 언어별 상품 필드(상품명/설명/소재/사이즈) 분리 저장을 지원하는가? API로 일괄 업로드 가능한가?
3. JPY 통화 표시·결제 지원 범위와, 외부 PG(KOMOJU) 연동 가능 여부는?
4. hreflang / 언어별 canonical / 언어별 sitemap 자동 생성을 지원하는가?
5. 언어별 주문 확인 메일·SMS 템플릿 분리가 가능한가?
6. 일본 우편번호 주소 자동완성 및 フリガナ 필드 커스텀이 가능한가?
7. 구축 비용·기간 견적과, 위 항목 중 커스텀 개발이 필요한 항목 목록은?
```

**C. 관세사에게**
```
1. 대표 SKU 3종(가죽/합성피혁/직물)의 일본 수입 시 HS 코드와 적용 관세율은?
2. 가죽 핸드백의 소액수입 면세 제외 여부와, 1만엔 이하 주문 시 실제 부담 세액은?
3. 한국산 SKU에 RCEP 협정세율 적용이 가능한가? 원산지증명 발급 절차와 비용은?
4. 중국 생산 SKU를 한국에서 재수출할 경우의 원산지 판정과 세율은?
5. DDP 배송 시 관세·소비세 선납 실무 절차(EMS vs DHL)는?
6. 일본 현지 3PL 재고 보유 시 IOR(수입자) 및 JCT 과세사업자 등록 요건은?
```