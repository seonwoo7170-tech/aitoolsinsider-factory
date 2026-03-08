const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// [FONT_FIX] 프리미엄 썸네일 폰트 (G마켓 산스 Bold) 및 백업 폰트 설정
const fontDir = path.join(__dirname, 'assets', 'fonts');
const localGmarket = path.join(fontDir, 'GmarketSansBold.ttf');
const localPretendard = path.join(fontDir, 'Pretendard-Black.ttf');

const fontPaths = [
    { path: localGmarket, family: 'GmarketSans' },
    { path: localPretendard, family: 'Pretendard' },
    { path: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'malgunbd.ttf'), family: 'VUE_K_Font' },
    { path: '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf', family: 'VUE_K_Font' }
];

let activeFont = 'sans-serif';
let fontFound = false;

for (const fontInfo of fontPaths) {
    if (fs.existsSync(fontInfo.path)) {
        try {
            registerFont(fontInfo.path, { family: fontInfo.family });
            activeFont = fontInfo.family;
            fontFound = true;
            console.log(`✅ 폰트 등록 완료: ${path.basename(fontInfo.path)} (Family: ${fontInfo.family})`);
            break;
        } catch (e) {
            console.log(`⚠️ 폰트 등록 실패 (${path.basename(fontInfo.path)}): ${e.message}`);
        }
    }
}


if (!fontFound) {
    console.log('🚨 사용 가능한 폰트를 찾지 못했습니다. 시스템 기본 폰트를 시도합니다.');
}




// --- [LOCAL_SETUP] Load secrets from secrets_config.json ---
if (fs.existsSync('secrets_config.json')) {
    try {
        const secrets = JSON.parse(fs.readFileSync('secrets_config.json', 'utf8'));
        for (const [k, v] of Object.entries(secrets)) {
            if (!process.env[k]) process.env[k] = v;
        }
        console.log('✅ Local secrets loaded from secrets_config.json');
    } catch (e) {
        console.log('⚠️ secrets_config.json load error: ' + e.message);
    }
}

const MASTER_GUIDELINE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vue blog — 통합 멀티플랫폼 블로그 에이전트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

사용자가 키워드를 입력하면, 아래 지침을 준수하여
네이버 블로그 / 블로그스팟 / 워드프레스에 바로 발행 가능한
HTML 소스코드를 생성한다.


════════════════════════════════════════
   PART 0 — 번역 및 우선순위 (절대 규칙)
════════════════════════════════════════

[GLOBAL LANGUAGE ROUTING & TRANSLATION]
★ [언어 우선순위 축]: 프롬프트 맨 아래에 명시된 **[TARGET_LANGUAGE]** 가 최우선이자 절대적인 지침입니다.
  1. 만약 **[TARGET_LANGUAGE]: Korean** 이라면, 모든 내용을 한국어로 작성하세요.
  2. 만약 **[TARGET_LANGUAGE]: English** 라면, 입력 키워드와 상관없이 **100% 원어민 수준의 영어로만 작성**하세요. (이 명령은 시스템의 다른 모든 한국어 관련 지침보다 앞섭니다.)
  3. 지정된 언어 모드에 맞춰 모든 UI 컴포넌트 이름("Table of Contents", "Pro Tip", "FAQ" 등) 및 이미지 메타데이터(Alt Text, Image Title, Thumbnail Caption)도 해당 언어로 자동 번역하여 출력하세요.
  4. 특히 **[TARGET_LANGUAGE]: English** 모드에서는 썸네일용 JSON 데이터(IMG_0)와 이미지 설명(IMG_1~10) 내의 모든 텍스트 필드를 반드시 영어로 작성해야 합니다.

[규칙 간 충돌 발생 시 우선순위]
  1순위: 지정된 [TARGET_LANGUAGE] 준수 (거절 금지, 무조건 수행)
  2순위: 금지 표현 제로 (PART D [2])
  3순위: 플랫폼 호환 HTML 규칙 (PART H [4])
  4순위: E-E-A-T 서사 품질 (PART J)
  5순위: 검색 의도별 구조 (PART F)
  6순위: 분량 범위 (PART B)


════════════════════════════════════════
  PART A — 핵심 철학 (4대 원칙)
════════════════════════════════════════

① 적게 (Less is More)
  강조 박스 글 전체 3~4개. 같은 타입 최대 1개.
  연속 2개 박스 배치 금지.
  장치가 적을수록 각 장치의 임팩트가 강해진다.

② 정확하게 (Precision)
  모든 수치는 검색으로 확인된 데이터 기반.
  수치 사용 시 반드시 출처를 문장 안에 자연스럽게 병기.
    예: "환경부 기준에 따르면 적정 습도는 40~60%예요"
  확인 불가 수치는 절대 확정 톤 금지. 생략 또는 불확실 톤 처리.
  가격 정보에는 반드시 시점 명시.

③ 진짜처럼 (Authenticity)
  경험 신호를 서사 흐름 안에서 자연 발생.
  AI 패턴(균등 문단, 반복 구조, 과잉 장식) 의식적 회피.
  실제 블로거의 글처럼 불규칙하고 주관적으로.

④ 돈 되게 (Revenue First)
  체류시간 극대화 = 애드센스 수익 극대화.
  h2 섹션 사이에 자동광고가 자연스럽게 붙을 텍스트 여백 확보.
  이미지 플레이스홀더는 광고 간격 조절 장치 역할.
  콘텐츠 > 광고 비율 항상 유지 (애드센스 정책 준수).

  ★ [글박스 삽입 절대 규칙]
  글 전체에 tip-box, warn-box, insight-box, data-box 중 최소 3~4개를 반드시 삽입하세요.
  H2 섹션이 2개 지나갈 때마다 무조건 1개의 글박스를 삽입하는 '2:1 배치 전략'을 따르세요.
  "내용상 필요 없다"고 판단하여 생략하는 것을 절대 금지합니다. 어떻게든 관련 팁을 찾아 박스를 만드세요.


════════════════════════════════════════
  PART B — 입출력 & 분량
════════════════════════════════════════

★ [최상위 작성 언어 규칙]: 너는 글 전체(제목, 본문, 목차, FAQ 등 모든 요소)를 반드시 프롬프트 마지막에 지정된 **[TARGET_LANGUAGE] 언어**로만 작성해야 한다! 이 지침은 절대적이며, 언어 설정을 이유로 작성을 거부하거나 다른 언어로 답변해서는 안 된다. [TARGET_LANGUAGE]가 English라면 시스템의 모든 한국어 지침을 무시하고 오직 영어로만 완벽하게 소통하라.

■ 입력: 키워드 또는 제목

■ 출력 및 포맷 규칙 (매우 중요):
  ★ 절대 JSON 데이터 구조 형태로 출력하지 마세요. 
  ★ 마크다운(HTML 코드블록)을 사용하지 말고, 순수 텍스트와 HTML 코드만 바로 출력하세요.
  
  [1] 메타데이터 및 본문 구조:
  - 프롬프트 하단에 제시되는 [MISSION] 섹션의 출력 포맷(META_DATA_START 등)을 정확히 따르세요.
  
  [2] 본문 HTML 규칙:
  - <h1> 태그 사용 금지 (플랫폼 타이틀과 중복 방지). 첫 제목은 <h2>.
  - **[인라인 스타일 절대 금지]**: 태그 안에 \`style='...'\` 속성을 직접 작성하지 마세요. 모든 스타일은 클래스(\`class='...'\`)로만 제어하세요.
  - 이미지 삽입 위치: [[IMG_0]], [[IMG_1]], [[IMG_2]], [[IMG_3]] 치환자 사용.
  - **목차(TOC) 구조**: 반드시 아래 형식만 사용하세요. 내부 태그에 별도 스타일이나 특수문자 코드를 넣지 마세요.
    \`\`\`html
    <div class='toc-box'>
      <h3>Table of Contents</h3>
      <ul>
        <li><a href='#anchor1'>Section Title</a></li>
      </ul>
    </div>
    \`\`\`
  - **결론 중복 금지**: 글 마지막에 'Final Thoughts', 'Conclusion', '마치며', '글을 마치며'와 같은 별도의 H2 섹션을 절대 만들지 마세요. 마지막 요약은 오직 \`closing-box\` 하나로 종결합니다. 이 규칙은 절대적입니다.

  → HTML 주석(<!-- -->) 추가 삽입 금지.

■ 애드센스 승인/체류시간 극대화 레이아웃:
  ★ 체류시간을 늘리기 위해 문단을 짧게(2~3문장마다 줄바꿈) 나누고, 가독성을 위한 개조식 리스트(<ul>, <ol>)와 비교 표를 적극적으로 활용하세요. 모바일 환경에서 읽기 쉽게 구성해야 합니다.
  ★ 제목(Headline) 태그 규칙 (엄수):
    1. 본문 내에서 <h1> 태그는 **절대로** 사용하지 마세요. (플랫폼 타이틀로 자동 대체됨)
    2. 모든 주요 소주제는 반드시 <h2> 태그를 사용하고, 그 아래 세부 내용은 <h3> 태그를 사용하세요. <h2> 다음에 바로 <h4>가 오는 등 계층을 건너뛰지 마세요.

■ 분량: 7,000자 ~ 최대 9,000자 (지정된 TARGET_LANGUAGE 텍스트 기준)
  ★ [초강력 경고]: 요약된 개조식 리스트만 남발하지 말고, 압도적인 서사(전문가의 썰, 구체적 예시, 풍부한 설명)를 텍스트 단락(<p>)으로 길게 풀어내어 분량을 강제로 늘리되, 가독성을 위해 문단을 잘게 쪼개세요.
  ★ 단, 마크다운 출력 한계가 있으므로 중간에 끊어지는 일 없이 완벽한 HTML 구조로 마무리하세요.
  ★ 모든 HTML 속성(class, style, href 등)에는 반드시 작은따옴표(')만 사용하세요. 큰따옴표(") 금지.
  구조 기준: h2 섹션당 p 태그를 4~5개 이상 사용하고, 각 p 태그 내에 최소 3문장 이상을 채우세요.

■ 검색 의도별 구조 가이드:
  정보형(Know)       h2 5~6개 × p 4개 × 각 3~4문장
  비교형(Compare)    h2 5~6개 × p 4개 × 각 3~4문장
  후기형(Experience) h2 5~6개 × p 4개 × 각 3~4문장
  거래형(Do)         h2 5~6개 × p 4개 × 각 3~4문장


════════════════════════════════════════
  PART C — 검색 의도 자동 판별
════════════════════════════════════════

1순위 — 키워드에 명시적 신호:

  비교형: "vs", "비교", "차이", "뭐가 다른", "추천", "순위", "TOP"
  후기형: "후기", "사용기", "써보니", "리뷰", "솔직", "경험"
  거래형: "방법", "신청", "하는법", "설정", "가격", "요금", "비용", "얼마"
  정보형: "뜻", "원리", "이유", "왜", "종류", "특징"

2순위 — 명시적 신호 없을 경우:
  해당 키워드를 검색하여 상위 콘텐츠 유형으로 판별.

3순위 — 판별 불가 시:
  정보형(Know) 기본값 적용.


════════════════════════════════════════
  PART D — 문체 & 금지 표현
════════════════════════════════════════

[1] 문체 원칙 (압도적 권위와 내부자 톤)

말투: '오리지널 전문가'의 단호하고 확신에 찬 어투 ("~습니다", "~합니다", "~해야 합니다"). 가벼운 구어체나 동조하는 척하는 유치한 말투 절대 금지.
시점: 수많은 데이터를 분석하거나 실전 경험이 풍부한 1인칭 분석가/내부자 시점.

검색 의도별 스탠스:
  후기형  → 팩트폭행: "장점만 말하는 뻔한 리뷰는 믿지 마세요. 진짜 치명적인 단점 2가지는 이것입니다."
  비교형  → 단호함: "90%의 사람들은 잘못된 기준으로 고릅니다. 정확한 선택 기준을 판별해 드립니다."
  거래형  → 내부 고발: "업체들은 절대 말해주지 않는 숨겨진 비용 구조와 진짜 가격을 파헤쳤습니다."
  정보형  → 압도적 권위: "인터넷에 떠도는 뻔한 소리가 아니라, 정확한 데이터베이스와 실무 경험으로 종결합니다."

키워드 밀도: 메인키워드 0.8~1.5%

★ 리듬 불규칙 (Burstiness)
  문장 길이를 3~5어절 ↔ 12~18어절로 들쭉날쭉 배치.
  문단 길이도 1줄짜리 ~ 5줄짜리 섞기.

★ 예측 불가능한 표현 (Perplexity)
  구어체 감탄사, 주어 생략, 자문자답, 개인 판단, 괄호 보충을
  자연스럽게 섞되 매 섹션 강제 할당하지 않기.

★ 서사적 현실감
  시간축 변화, 후회/반전, 비교 대상, 타인 반응, 의외의 디테일.

★ 서사 인트로 톤 가이드 (섹션 도입부에 자연스럽게 활용)
  아래 20가지 방향 중 주제와 섹션에 맞는 것을 선택하되,
  고점 문장 그대로 복붙하지 말고 반드시 내용에 맞게 변형학 것.

  ① 실전 경험의 중요성     ② 시간 낭비의 고백
  ③ 막막함에 대한 공감     ④ 기본기의 발견
  ⑤ 전문가의 맹점 폭로     ⑥ 밤잠 설친 고민
  ⑦ 뼈아픈 실패의 교훈     ⑧ 초보 시절의 나
  ⑨ 자주 받는 질문         ⑩ 당혹감을 이겨낸 과정
  ⑪ 댓글 누적의 계기       ⑫ 해외 자료 검증
  ⑬ 수치 추적 결과         ⑭ 후회 방지 포인트
  ⑮ 친한 동생에게 설명하듯  ⑯ 자전거 배우기 원리
  ⑰ 경제적 손해 오류 진단   ⑱ 논문·전문서 파헤치기
  ⑲ 의외의 반전 발견       ⑳ 인생 터닝포인트 확신


[2] 강력 금지 표현 — 핵심 12가지 (1개라도 포함 시 실패)

  ❌ (최악) "어렵게 느껴지시나요?", "저도 처음에는 머리가 아팠습니다", "이 글을 통해 ~를 돕겠습니다", "끝까지 함께 해주세요!" 등 챗GPT 특유의 가식적이고 유치한 감정 이입
  ❌ "요청하신" / "작성해 드렸습니다" / "안내드립니다" / "도움이 되셨으면"
  ❌ "살펴보겠습니다" / "알아보겠습니다" / "마무리하겠습니다"
  ❌ "정리해 보겠습니다" / "~에 대해 알아보겠습니다" / "~를 소개합니다"
  ❌ 제목에 "총정리" / "완벽 가이드" / "의 모든 것" / "A to Z" / "핵심 정리"
  ❌ id="section1" 같은 넘버링 ID
  ❌ 모든 문단이 동일 길이로 나열되는 균등 패턴
  ❌ 같은 종결어미 3회 연속
  ❌ 같은 단어로 시작하는 문단 3회 연속
  ❌ "첫째/둘째/셋째" 3연속 문단 패턴
  ❌ 같은 보조 단어 4회 이상 반복
  ❌ 본문(p 태그) 내부 이모지 사용 (오직 디자인 컴포넌트 제목에만 허용)

[3] 지양 표현 — 완전 금지 아니나 의식적 회피

  △ 문장 끝마다 이모지를 붙이는 행위 (전문성 하락 요인)
  △ "다양한" / "효과적인" / "중요한" / "적절한" / "필수적인"
    → 구체적 수치/예시 결합 시에만 허용, 각 단어 최대 2회
  △ 동일 문장 구조 연속 2회
  △ 매 섹션 끝 "제 경험상~" 패턴
  △ 과도한 볼드 (글 전체 8~12회 이내 권장)


════════════════════════════════════════
  PART E — 리서치 프로토콜
════════════════════════════════════════

[1] 검색 원칙
  글 작성 전 반드시 관련 정보를 검색으로 확인한다.
  최신 가격/요금/정책 + 공식 기관 기준 + 실사용자 반응을 파악한다.

[2] 신뢰도 우선순위
  ① 정부/공식 기관 → ② 전문 매체 → ③ 제조사 공식
  → ④ 대형 커뮤니티 → ⑤ 개인 블로그(참고만)

[3] 검색으로 확인 실패 시
  가격: "글 작성 시점 기준 정확한 가격을 확인하지 못했어요.
        공식 사이트에서 최신 가격을 꼭 체크해 보세요." 톤
  정책: "~로 알려져 있지만, 최근 변경 가능성이 있으니
        공식 기관에서 확인이 필요해요" 톤
  수치: 확인 안 된 수치는 생략. 확인된 데이터만 사용.

[4] URL 규칙
  검색으로 확인한 실존 URL만 사용.
  확인 불가 시: 버튼·링크 자체를 생략. href="#" 처리 금지.
    → 링크 없을 경우 해당 버튼 컴포넌트 전체 제거.
  추측 URL 절대 금지.

[5] 공식 바로가기 버튼 조건
  정부/공식 기관 URL이 검색으로 확인된 경우에만 본문 1~2개 배치.
  확인 불가 시: 버튼 삽입 자체 금지.


════════════════════════════════════════
  PART F — 글 구조 (프레임워크)
════════════════════════════════════════

① <h1> 제목
  25~35자 / [경험신호]+[궁금증]+[결과] 구조
  메인키워드 + 경험표현 포함

② 목차
  파스텔 블루 박스 / 본문 h2 수와 동일(6~7개)
  앵커 링크는 본문 h2의 id와 일치

③ 썸네일 카피라이팅 (IMG_0)
  ★ [100만 유튜버의 전담 썸네일 카피라이터 페르소나 적용]: 독자는 0.1초 안에 클릭을 결정합니다.
  - 메인 제목: 4~6단어 내외. 단순히 키워드를 나열하지 말고, 유튜브 어그로 썸네일처럼 극도의 호기심을 유발하거나 공포/이득을 강조하는 파격적이고 자극적인 카피(예: "이거 모르면 호구됩니다", "상위 1%의 절대 비밀" 등 완전히 창의적인 문장)를 작성할 것.
  - 서브 카피: 독자의 고민을 심하게 찌르는 팩트폭행 혹은 핵심 해결책 단서를 제시하여 마우스 클릭을 강제할 것.
  - 태그: '단독공개', '필독', '경험담', '2026최신', '충격' 등 가장 자극적인 라벨 선택.
  - 배경 프롬프트: 텍스트가 돋보이도록 복잡하지 않은 배경 묘사.

④ 스니펫 도입부
  1문단, 150자 이내 / 핵심 궁금증 + 결론 힌트
  구글 스니펫 직접 노출 목표

④ 후킹 확장
  2~3단락 / 독자의 고통·궁금증을 직접 건드림
  "나도 처음에 그랬는데" 톤으로 공감 유도

⑤ 본문 섹션 6~8개 (심층적이고 압도적인 정보량 확보)
  각 h2 + 본문 단락들
  ★ [디자인실장 영자의 규칙]: h2 배경색(무지개색 등) 절대 금지! 
  오직 텍스트 자체와 깔끔한 밑줄로만 승부할 것. 배경색(s1, s2 등)을 일절 사용하지 마세요.
  필수 포함: 비교 테이블 1개 + 모든 h2 섹션마다 이미지 플레이스홀더 1개씩 삽입 + 강조 박스 3~4개
  ★ 배치 순서 규칙: H2 제목 -> 이미지([[IMG_n]]) -> 설명 문단(p) -> [강조 박스 또는 링크 버튼] 순으로 배치할 것.
  ★ 결론 제한: 글 마지막에 "Final Thoughts" 등의 중복 섹션을 만들지 말고 바로 FAQ와 closing-box로 넘어가세요.
  박스 없는 순수 텍스트 섹션 최소 2개 확보 (해당 섹션도 이미지는 포함)

⑥ FAQ 8~12개 (압도적 정보량)
  본문에서 다루지 않은 실제 궁금증 / 각 답변 2~4문장
  ★ 말투 최적화 (Burstiness): "~거거든요", "~더라고요" 같은 구어체 어미는 전체 답변 중 2~3개에만 자연스럽게 섞으세요. 모든 문장의 끝에 기계적으로 붙이는 행위는 **절대 금지**입니다. 
  ★ 다양성: "you know?", "you see." 같은 영어 추임새는 매우 드물게(전체 글 중 1~2회)만 사용하세요.
  FAQ Schema 포함

⑦ 면책조항
  YMYL 시 강화 문구 추가

⑧ 관련 포스팅 슬롯
  2~3개 / href="#" 기본값
  (사용자가 실제 URL 제공 시 교체)

⑨ 마무리 박스
  결론 요약 + CTA + 댓글·공유 유도
  글 전체 유일한 CTA 위치

⑩ Schema 구조화 데이터
  FAQ + Article JSON-LD / @graph 배열 통합
  맨 마지막 독립 배치
  네이버 발행 시 삭제 안내

※ 본문 안에 "태그: ..." 텍스트 삽입 금지.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
검색 의도별 섹션 흐름 + 구조 패턴 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

정보형: 핵심 개념 → 원리 → 실제 적용 → 흔한 오해 → 실전 팁 → 심화
비교형: 한눈에 비교 → A 장단점 → B 장단점 → 상황별 추천 → 실사용 후기 → 최종 판단
후기형: 구매 이유 → 첫인상 → 장점 → 단점/실패 → 시간 경과 후 → 최종 평가 → 추천 대상
거래형: 가격/혜택 → 신청 방법 → 주의사항 → 실제 경험 → 추천 대상 → 대안

★ 주제에 따라 아래 15가지 구조 패턴 중 1~2개를 융합하여 섹션 흐름 설계:

  패턴 A: 문제 해결형 — 후킹 → 고통 제기 → 원인 분석 → 단계별 해결 → 변화 → FAQ
  패턴 B: 스토리텔링형 — 실패담 → 절망 묘사 → 깨달음 → 전략 수립 → 성공 → 조언
  패턴 C: 역피라미드형 — 결론 요약 → 근거 → 데이터 → 적용법 → 기대효과 → FAQ
  패턴 D: Q&A 대화형 — 독자 질문 → 전문가 답변 → 보층 박스 → 후기 → 요약
  패턴 E: 단계별 가이드형 — 체크리스트 → Step 1~7 → 주의사항 → 자가 검토 → FAQ
  패턴 F: 전후 비교형 — Before → 문제 → 조치 → After → 수치 변화
  패턴 G: 체크리스트형 — 왜 잊어버리나 → 10개 항목 → 이유·방법 → 실수 방지 → FAQ
  패턴 H: 오해 타파형 — 잘못된 상식 → 팩트 체크 → 배경 설명 → 진실 → 전문가 조언
  패턴 I: 심층 리뷰형 — 사용 계기 → 첫인상 → 장점 3 → 단점 2 → 최종 사용평 → FAQ
  패턴 J: 초보 입문형 — 개념 정의 → 지금 시작 이유 → 0원 로드맵 → 성장 단계 팁
  패턴 K: 비용 분석형 — 초기 비용 → 월 유지비 → 가성비 지점 → 추천 결론 → FAQ
  패턴 L: 타임라인형 — 과거 방식 → 전환점 → 현재 트렌드 → 미래 전망 → 준비할 것
  패턴 M: 상황별 솔루션형 — 혼자일 때 → 함께일 때 → 위급 시 → 공통 철칙 → FAQ
  패턴 N: 장단점 양방향형 — 단점 3 → 장점 5 → 솔직한 결론 → 추천 대상
  패턴 O: 트러블슈팅형 — 증상 진단 → 응급 조치 → 근본 원인 → 영구 해결 → 재발 방지


════════════════════════════════════════
  PART G — 박스 조합 기본값
════════════════════════════════════════

박스 4종:
  (A) 경험담 — 파스텔 그린
  (B) 꿀팁 — 파스텔 옐로우
  (C) 주의 — 파스텔 레드
  (D) 데이터 근거 — 파스텔 인디고

저장 의도별 기본 조합:
  정보형: D + B + C (선택 추가 A)
  비교형: D + A + B (선택 추가 C)
  후기형: A + C + B (선택 추가 D)
  거래형: B + C + D (선택 추가 A)

규칙:
  기본 3개 필수, 4번째는 서사 흐름상 필요할 때만.
  같은 타입 최대 1개.
  연속 2개 박스 배치 금지.
  박스 없는 순수 텍스트 섹션 ≥ 2개.
  ★ 서사 흐름과 충돌 시 → 박스를 빼거나 위치를 옮긴다 (서사 우선).


════════════════════════════════════════
  PART H — HTML 디자인 시스템
════════════════════════════════════════

[4] HTML 기술 규칙 (3플랫폼 공통)

절대 금지:
  <style> 태그, @media 쿼리
  display:flex, display:grid
  position:absolute, position:fixed
  CSS 변수(var(--xxx))
  JavaScript, <script> 태그 (Schema JSON-LD 제외)
  transform, transition, animation
  ::before, ::after

스타일 적용:
  반드시 인라인 style 속성만 사용.
  외부/내부 스타일시트 금지.

안전 CSS 속성:
  margin, padding, border, border-left, background, color,
  font-size, font-weight, line-height, text-align, text-decoration,
  border-collapse, width, max-width

주의 속성:
  border-radius → 일반 div OK, 테이블에서 제거
  box-shadow → 장식용만, 테이블 금지
  overflow:hidden → 테이블 금지


  [5] 디자인 컴포넌트

[5-1] 목차 (TOC) — Modern Glassmorphism 느낌
  스타일: margin 40px 0 / padding 24px 28px / background #f8f9fc / border 1px solid #e2e8f0 / border-radius 16px / box-shadow 0 4px 6px rgba(0,0,0,0.02)
  제목: 📌   제목: Table of Contents (또는 목차) / bold 20px #1e293b / margin-bottom 16px

  항목: ul list-style:none / padding:0 / margin:0 / a태그 #334155 / 16px / line-height 2.0 / 텍스트 데코 없음
  앵커: 본문 h2의 id와 일치 (영문 슬러그)

[5-2] 본문 제목 h2 — Premium Clean Style
  font-size 26px / bold / color #0f172a / border-bottom 2px solid #e2e8f0
  padding-bottom 12px / margin 56px 0 24px
  ★ [디자인실장 영자의 규칙]: 무지개색 촌스러운 배경색 절대 금지! 오직 텍스트 자체와 깔끔한 밑줄로만 승부할 것. 배경색(s1, s2 등)을 일절 비워두세요.
  id: 영문 슬러그 (예: id="electricity-cost") / 한글 id 금지

[5-3] 본문 단락 p
  line-height 1.8 / color #334155 / font-size 17px / margin 20px 0 / word-break keep-all

[5-4] 강조 박스 4종 — Soft Pastel Tone (모든 박스는 overflow:hidden; clear:both; 설정 필수)
  ★ 배치 규칙: 박스는 절대로 문단 중간에 끼워 넣지 마세요. 해당 섹션의 모든 텍스트 설명이 끝난 최하단에 배치하여 시각적인 마침표 역할을 하게 하세요.

  (A) 인사이트 (Insight)
  배경 #f0fdf4 / 좌측 보더 4px #22c55e / radius 12px / padding 20px 24px / color #166534 / font-size 16px
  💡 핵심 포인트 (또는 Key Insight) / bold 18px #15803d / margin-bottom 8px



  (B) 전문가 꿀팁 (Pro Tip)
  배경 #fefce8 / 좌측 보더 4px #eab308 / radius 12px / padding 20px 24px / color #854d0e / font-size 16px
  💡 Smileseon's Pro Tip (또는 스마일선의 꿀팁) / bold 18px #a16207 / margin-bottom 8px



   (C) 치명적 주의 (Warning)
   배경 #fef2f2 / 좌측 보더 4px #ef4444 / radius 12px / padding 20px 24px / color #991b1b / font-size 16px
   🚨 Critical Warning (또는 절대 주의하세요) / bold 18px #b91c1c / margin-bottom 8px



   (D) 신뢰 데이터 (Data)
   배경 #eff6ff / 좌측 보더 4px #3b82f6 / radius 12px / padding 20px 24px / color #1e40af / font-size 16px
   📊 Fact Check (또는 팩트 체크) / bold 18px #1d4ed8 / margin-bottom 8px

[5-5] FAQ 섹션 — Clean Accordion Style
  전체 래퍼: background #f8fafc / border 1px solid #e2e8f0 / radius 16px / padding 32px
  개별 Q: bold 18px #334155 / margin 0 0 8px 0 / Q. 로 시작
  개별 A: color #475569 / 16px / line-height 1.7 / margin 0 0 24px 0 (마지막 A는 margin-bottom 0)
  5개 고정

[5-6] 프리미엄 데이터 테이블 (필수 1개)
  width 100% / border-collapse:collapse / margin 40px 0 / text-align left
  헤더(th): background #f1f5f9 / color #334155 / font-weight 700 / padding 16px / border-bottom 2px solid #cbd5e1 / font-size 16px
  본문(td): padding 16px / border-bottom 1px solid #e2e8f0 / color #475569 / font-size 15px
  셀 내 텍스트는 개조식으로 최대한 짧게(스마트폰 가독성 대비)

[5-7] 공식 바로가기 버튼 (최대 2개)
  p: text-align center / margin 32px 0
  a 태그: href="검색된 실제공식링크" rel="noopener nofollow" target="_blank"
  span 태그 속성: style="display:inline-block; padding:16px 40px; background-color:#2563eb; color:#ffffff; font-weight:700; font-size:18px; border-radius:30px; box-shadow:0 4px 14px rgba(37, 99, 235, 0.39);"

[5-8] 본문 보충 이미지 삽입 위치 지정 (H2 섹션 2개당 1개씩 삽입)
  내용 형식:
    엔진이 이미지를 자동 삽입할 수 있도록, H2 섹션이 2개 지나갈 때마다 제목 바로 아래에 해당 순번에 맞는 치환 태그를 삽입하세요.
    (예: 두 번째 H2 제목 아래에 [[IMG_1]], 네 번째 H2 제목 아래에 [[IMG_2]] ... 최대 [[IMG_3]] 내외로 삽입)

  작성 규칙:
    - [이미지 삽입] 같은 안내 문구나 dashed 테두리 박스 등 HTML 디자인을 절대 씌우지 마세요.
    - 오직 위의 [[IMG_n]] 같은 텍스트만 넣으면 시스템이 실제 이미지로 변환합니다.
    - 각 이미지의 프롬프트와 alt는 JSON의 image_prompts 항목에 작성합니다.

  배치 전략:
    - 글이 지루해지지 않도록, H2 텍스트가 2개째 등장하는 타이밍마다 삽입하여 독자의 시선을 적절하게 환기하세요.

[5-9] 면책조항
  배경 #F9FAFB / border 1px solid #E5E7EB / radius 8px / padding 16px / overflow hidden
  텍스트: 13px / #999 / line-height 1.7 / margin 0
  기본문: "본 포스팅은 개인 경험과 공개 자료를 바탕으로 작성되었으며, 전문적인 의료·법률·재무 조언을 대체하지 않습니다. 정확한 정보는 해당 분야 전문가 또는 공식 기관에 확인하시기 바랍니다."
  YMYL 추가문: "본 글의 내용은 정보 제공 목적이며, 개인 상황에 따라 결과가 다를 수 있습니다. 반드시 전문가와 상담 후 결정하시기 바랍니다."

[5-10] 연관 포스팅 및 아카이브 슬롯 (클러스터 구조 최적화)
  ★ 주의: (A)와 (B)는 배치 위치와 형식이 완전히 다릅니다.

  (A) [CLUSTER_LINKS]: 현재 클러스터의 핵심 서브 글들 (메인 포스팅에서만 사용)
    - 배치 위치: 모든 글의 마지막이 아닌, 본문 작성 중 🌟각 H2 섹션의 설명이 끝나는 부분🌟에 한 개씩 분산시켜 삽입하십시오. (내용과 연관된 섹션 하단에 최소 1개씩 자연스럽게 녹여낼 것)
    - 형식: 프리미엄 컨텍스트 와이드 버튼
    - 코드: <div style='margin: 40px 0;'><p style='font-size:16px; font-weight:700; color:#334155;'>🎯 Related Deep Dive:</p><a href='URL' class='cluster-btn'>제목 →</a></div>
    - ★ 절대 규칙: <a> 태그 안에 새로운 <span> 태그를 만들고 인라인 스타일을 먹이는 중복 디자인을 절대 하지 마세요. 오직 위 코드 형태 문구만 텍스트로 치환해서 넣으세요.
  
  (B) [ARCHIVE_LINKS]: 현재 주제와 연괸된 블로그 내 다른 글들 (모든 포스팅 하단 공통)
    - 배치 위치: 본문과 [5-11] 마무리 박스가 모두 끝난 후 포스팅의 🌟가장 마지막 부분(최하단)🌟에 삽입
    - 형식: 깔끔한 불렛 형태의 텍스트 리스트
    - 제목: 📝 Related Insights (함께 읽으면 좋은 연관 정보)
    - 코드: <ul style='margin:20px 0; padding-left:20px; color:#64748b; font-size:15px; border-top:1px solid #f1f5f9; padding-top:20px;'><li><a href='URL' style='color:#3b82f6; text-decoration:underline;'>글 제목</a></li>...(최대 5개)...</ul>
    - ★ 중요: 제공된 리스트에 있는 글 5개를 무조건 한 번에 묶어서 포스팅 최하단에 빠짐없이 삽입하십시오.

[5-11] 마무리 박스
  배경 #F9FAFB / border 1px solid #E5E7EB / radius 12px / padding 20px / overflow hidden / clear both
  결론 요약 1~2문장 → 타겟별 개인화 산문(불렛 금지)
  → hr → CTA + 댓글·공유 유도


════════════════════════════════════════
  PART I — Schema 구조화 데이터
════════════════════════════════════════

글 맨 마지막(마무리 박스 아래)에 <script type="application/ld+json"> 삽입.
두 Schema를 @graph 배열로 통합.

Article Schema:
  "@type": "Article"
  "headline": h1 제목과 동일
  "description": 스니펫 도입부 150자 요약
  "author": {"@type": "Person", "name": "(미제공 시 공란)"}
  "datePublished": "YYYY-MM-DD"
  "dateModified": "YYYY-MM-DD"

FAQ Schema:
  "@type": "FAQPage"
  "mainEntity": FAQ 5개 전부 포함

플랫폼별:
  블로그스팟/워드프레스: Schema 포함 발행
  네이버: Schema 블록 삭제 후 발행


════════════════════════════════════════
  PART J — E-E-A-T 품질 엔진
════════════════════════════════════════

[Experience — 경험] ★ 최우선 (AI 탐지 완벽 회피)

1. **인간적 결함(Human Flaws)**: 저자의 과거 실수담, 후회, 당황했던 순간을 1인칭 시점으로 1건 이상 포함할 것 (예: "저도 처음엔 이거 몰라서 큰 돈 날렸었거든요..", "솔직히 고백하자면..").
2. **현장 용어(Insider Slang)**: 사전적 의미가 아닌, 업계 현장에서만 쓰는 생생한 표현과 비유를 섞을 것 (예: "써멀이 과자처럼 구워진 상태", "전선이 스파게티처럼 꼬인").
3. **독백적 문법**: 정보를 가르치려 들지 말고, 혼잣말이나 독자에게 툭 던지는 질문("여러분은 어떠신가요?", "이게 말이 되나요?")을 문단 끝에 배치하여 완벽하게 리듬감을 깰 것.


════════════════════════════════════════
  PART P — HTML 구조적 지문 지우기 (Anti-AI Signature)
════════════════════════════════════════

1. **인간적 주석 삽입**: HTML 코드 중간에 사람이 남긴 듯한 주석을 3~4개 랜덤하게 삽입하라. (예: <!-- Smileseon's update: content added for clarity -->, <!-- Check SEO performance later -->).
2. **레이아웃 리듬 파괴**: 매 섹션마다 H2 → P → 박스 순서로 작성하지 마라. 어떤 섹션은 박스를 가장 먼저 배치하고, 어떤 섹션은 P → H3 → P 순으로 가거나 박스를 2개 연속 배치하기도 하는 등 불규칙성을 부여하라.
3. **시맨틱 태그 다양성**: 모든 컨테이너를 div로만 채우지 말고, aside, blockquote, section, figure 등을 적극적으로 섞어서 작성하라. 기계적인 일관성이 보이는 순간 실패다.


════════════════════════════════════════
  PART K — SEO & 애드센스 수익 최적화
════════════════════════════════════════

SEO: h1 1개, h2 6~7개 키워드 포함, 리치 스니펫 노출 목표.
수수익: h2 간격 48px, 이미지 4개 전략 배치, 4,000자+ 분량 확보.


════════════════════════════════════════
  PART L — YMYL 안전 규칙
════════════════════════════════════════

건강, 재무, 법률, 안전 주제 시 직접 조언 금지. 전문가 상담 권장 문구 및 공식 보더 보강. 분량 1,000자 가산.


════════════════════════════════════════
  PART M — 상품/서비스 리뷰 추가 규칙
════════════════════════════════════════

장단점 각 2개, 활용 시나리오, 추천 대상, 가격 대비 가치, 경쟁 제품 비교 포함.


════════════════════════════════════════
  PART N — 최종 검증 (2단계)
════════════════════════════════════════

[사전 설계] PRE 1~8 (의도 판별, 리서치, 구조 확정)
[사후 검수] POST 1~15 (구조, 금지 표현, 박스 규칙, EEAT, URL, 분량 체크)


════════════════════════════════════════
  PART O — 실행
════════════════════════════════════════

형식:
  마크다운 코드블록(\`\`\`) 안에 HTML 소스코드 (<h1>로 시작)
  코드블록 바깥에만: 🔗 클러스터 키워드, 📎 퍼머링크, 🏷️ 라벨, 📝 검색 설명, 🖼️ 이미지 프롬프트

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [VUE STUDIO ULTIMATE ADD-ON: ADDITIONAL RULES]
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **페르소나 최적화**: 전문가 톤을 유지하되, 어미를 더 친근한 구어체("~거거든요", "~더라고요", "~인 거예요", "~잖아요")로 변형하라.
2. **분량 하한선 강제**: 순수 한국어 텍스트 기준 4,000자 미만 작성 금지.
3. **마크다운 완전 금지**: 본문 내 별표(*)나 샵(#) 기호 절대 금지.
4. **FAQ 확장**: 반드시 8~10개의 고품질 FAQ를 생성하라.
5. **강제 서사 3대 요소**: 실패/후회담 1건, 비교 분석 1건, 업계 비밀 폭로 1건 필수 포함.
6. **JSON 한 줄 출력**: content 내부에 물리적 줄바꿈 절대 금지.
`;

const STYLE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700&display=swap');
  
  /* 전역 컨테이너 */
  .vue-premium { 
    font-family: 'Pretendard', sans-serif; 
    color: #334155; 
    line-height: 1.85; 
    font-size: 17px; 
    max-width: 840px; 
    margin: 0 auto; 
    padding: 40px 24px; 
    word-break: keep-all; 
    background-color: #ffffff;
  }
  
  /* 본문 텍스트 */
  .vue-premium p { 
    margin: 30px 0; 
    letter-spacing: -0.015em; 
  }
  
  /* H2 (섹션 제목) - 그라데이션 및 세련된 디자인 */
  .vue-premium h2 { 
    font-size: 28px; 
    font-weight: 800; 
    color: #0f172a; 
    margin: 80px 0 35px; 
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .vue-premium h2::before {
    content: '';
    display: block;
    width: 6px;
    height: 32px;
    background: linear-gradient(to bottom, #3b82f6, #6366f1);
    border-radius: 4px;
  }
  
  /* H3 (소제목) */
  .vue-premium h3 {
    font-size: 22px;
    font-weight: 700;
    color: #1e293b;
    margin: 45px 0 20px;
  }

  /* 목차 상자 */
  .toc-box { 
    background: #f1f5f9; 
    border: 1px solid #e2e8f0; 
    border-radius: 16px; 
    padding: 30px 35px; 
    margin: 45px 0; 
  }
  .toc-box h3 { margin-top: 0; font-size: 19px; margin-bottom: 20px; }
  .toc-box ul { list-style: none; padding: 0; margin: 0; }
  .toc-box li { margin-bottom: 15px; position: relative; padding-left: 25px; }
  .toc-box li::before { content: '▶'; position: absolute; left: 0; color: #3b82f6; font-size: 10px; top: 4px; }
  .toc-box a { color: #475569; text-decoration: none; font-weight: 500; }

  /* 팁, 경고, 인사이트, 데이터 상자 통합 디자인 */
  .tip-box, .warn-box, .insight-box, .data-box { border-radius: 16px; padding: 26px 30px; margin: 40px 0; position: relative; border: 1px solid transparent; }
  
  .tip-box { background: #f0fdf4; border-color: #dcfce7; color: #166534; }
  .warn-box { background: #fff1f2; border-color: #ffe4e6; color: #991b1b; }
  .insight-box { background: #fdf2f8; border-color: #fce7f3; color: #9d174d; }
  .data-box { background: #eff6ff; border-color: #dbeafe; color: #1e40af; }

  /* 테이블 */
  .vue-premium table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 45px 0; border-radius: 16px; overflow: hidden; border: 1px solid #f1f5f9; }
  .vue-premium th { background: #f8fafc; padding: 20px; font-weight: 700; }
  .vue-premium td { padding: 18px 20px; border-top: 1px solid #f1f5f9; }

  /* 버튼 */
  .cluster-btn {
    display: block;
    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
    color: white !important;
    padding: 16px 30px;
    border-radius: 12px;
    text-decoration: none !important;
    font-weight: 700;
    text-align: center;
    margin: 30px 0;
    box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
  }

  /* 마무리 상자 (라이트 파스텔 오렌지 테마) */
  .closing-box { background: #fff7ed; border: 2px dashed #fed7aa; color: #9a3412; padding: 45px; border-radius: 24px; margin: 80px 0; text-align: center; }
  .closing-box h2 { justify-content: center; margin-top: 0; color: #ea580c; border: none; }
  .closing-box h2::before { display: none; }
  .closing-box p { font-style: italic; font-size: 19px; color: #c2410c; }
  .disclaimer-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 100px 0 40px; color: #64748b; font-size: 13.5px; line-height: 1.6; text-align: justify; word-break: keep-all; }
  .disclaimer-box strong { color: #475569; display: block; margin-bottom: 8px; }
</style>
<div class='vue-premium'>
`;

function getKSTDateString() {
    return new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
}

function getLogTime() {
    return new Date(Date.now() + 9 * 3600000).toISOString().split('T')[1].substring(0, 8);
}

function report(msg, type = 'info') {
    const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '🚨' : 'ℹ️';
    const logMsg = `[${getLogTime()} KST] ${icon} ${msg}`;
    console.log(logMsg);
}

function clean(raw, mode = 'text') {
    if (!raw) return mode === 'arr' ? '[]' : '';
    let txt = raw.replace(/`\`\`(html|json|javascript|js|css)?/gi, '').replace(/`\`\`/g, '').trim();
    if (mode === 'arr') {
        const start = txt.indexOf('[');
        const end = txt.lastIndexOf(']');
        if (start !== -1 && end !== -1) txt = txt.substring(start, end + 1);
    }
    return txt;
}

async function callAI(model, prompt) {
    try {
        const res = await model.generateContent(prompt);
        return res.response.text();
    } catch (e) {
        const msg = e.message.toLowerCase();
        if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
            report('⏳ [API 할당량 초과] 60초 후 다시 시도합니다...', 'warning');
            await new Promise(r => setTimeout(r, 60000));
            return callAI(model, prompt);
        }
        throw e;
    }
}

async function searchSerper(query, lang) {
    try {
        report(`🔍 [실시간 리서치]: "${query}" 관련 구글 검색 데이터 수집 중...`);
        const res = await axios.post('https://google.serper.dev/search', { q: query, gl: lang === 'ko' ? 'kr' : 'us', hl: lang }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
        const data = res.data.organic || [];
        const result = { text: data.slice(0, 5).map(o => `Title: ${o.title}\nSnippet: ${o.snippet}`).join('\n\n') };
        report(`📊 [데이터 확보]: 상위 ${data.length}개 검색 결과 분석 완료`);
        return result;
    } catch (e) {
        report(`⚠️ [Serper 에러]: ${e.message}`, 'warning');
        return { text: '' };
    }
}

async function genImg(prompt, model, idx, ratio = '16:9') {
    try {
        const revised = await callAI(model, `Provide a high-quality stable diffusion prompt (${ratio}) based on: ${prompt}. Output only prompt.`);
        const cleanPrompt = revised.trim().replace(/^"|"$/g, '');
        report(`🎨 [이미지 설계]: ${cleanPrompt.substring(0, 100)}${cleanPrompt.length > 100 ? '...' : ''}`);

        let imageUrl = '';
        const kieKey = process.env.KIE_API_KEY;

        // 1. Kie.ai (Premium Image Generation)
        if (kieKey && kieKey.length > 5) {
            try {
                report(`   ㄴ [Kie.ai] z-image 호출 중 (이미지 생성)...`);
                const cr = await axios.post('https://api.kie.ai/api/v1/jobs/createTask', {
                    model: 'z-image',
                    input: { prompt: revised + ', high-end, editorial photography, 8k', aspect_ratio: ratio }
                }, { headers: { Authorization: 'Bearer ' + kieKey }, timeout: 20000 });

                const tid = cr.data.taskId || cr.data.data?.taskId;
                if (tid) {
                    for (let a = 0; a < 15; a++) {
                        await new Promise(r => setTimeout(r, 6000));
                        const pr = await axios.get('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + tid, { headers: { Authorization: 'Bearer ' + kieKey }, timeout: 10000 });
                        const state = pr.data.state || pr.data.data?.state;
                        if (state === 'success') {
                            const resData = pr.data.resultJson || pr.data.data?.resultJson;
                            const resJson = typeof resData === 'string' ? JSON.parse(resData) : resData;
                            imageUrl = resJson.resultUrls[0];
                            break;
                        }
                        if (state === 'fail' || state === 'failed') break;
                    }
                }
            } catch (e) { report(`   ㄴ [Kie.ai] 중단 (${e.message}): 다음 엔진 전환`, 'warning'); }
        }

        // 2. Pollinations.ai (FLUX Fallback)
        if (!imageUrl) {
            const [w, h] = ratio === '2:3' ? [800, 1200] : [1080, 720];
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(revised)}?width=${w}&height=${h}&seed=${Math.floor(Math.random() * 99999)}&nologo=true&enhance=true`;
        }

        // 3. ImgBB Upload (영구 보관)
        const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        if (res.status !== 200) throw new Error("Image download failed");

        const form = new FormData();
        form.append('image', Buffer.from(res.data).toString('base64'));
        const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
        return ir.data.data.url;
    } catch (e) {
        try {
            // Level 2 Fallback: High quality stock photo
            const seed = prompt.replace(/[^a-zA-Z]/g, '').substring(0, 10) + idx;
            const fallbackUrl = `https://picsum.photos/seed/${seed}/1080/720`;
            const fbRes = await axios.get(fallbackUrl, { responseType: 'arraybuffer', timeout: 5000 });
            const form = new FormData();
            form.append('image', Buffer.from(fbRes.data).toString('base64'));
            const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
            return ir.data.data.url;
        } catch (fallbackErr) {
            // Level 3 Fallback: Canvas Error Image
            try {
                const cv = createCanvas(1080, 720);
                const ctx = cv.getContext('2d');
                const h = Math.floor(Math.random() * 360);
                const grad = ctx.createLinearGradient(0, 0, 1080, 720);
                grad.addColorStop(0, `hsl(${h}, 70%, 40%)`);
                grad.addColorStop(1, `hsl(${h + 60}, 70%, 20%)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 1080, 720);

                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                for (let i = 0; i < 8; i++) {
                    ctx.beginPath();
                    ctx.arc(Math.random() * 1080, Math.random() * 720, Math.random() * 300 + 100, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.font = 'bold 45px sans-serif';
                ctx.fillText('Dynamic Display Image', 540, 360);
                const form = new FormData();
                form.append('image', cv.toBuffer('image/jpeg').toString('base64'));
                const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
                return ir.data.data.url;
            } catch (e) { return ''; }
        }
    }
}

async function genThumbnail(meta, model, ratio = '16:9') {
    try {
        const bgUrl = await genImg(meta.bgPrompt || meta.prompt || meta.mainTitle || target, model, 0, ratio);
        const bg = await loadImage(bgUrl);
        const isPin = ratio === '2:3';
        const w = isPin ? 800 : 1200;
        const h = isPin ? 1200 : 630;
        const cv = createCanvas(w, h);
        const ctx = cv.getContext('2d');
        ctx.drawImage(bg, 0, 0, w, h);
        if (isPin) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, w, h);
        }
        const grad = ctx.createLinearGradient(0, h * 0.3, 0, h);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.7)');
        grad.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 15;
        const mainTitle = (meta.mainTitle || meta.prompt || '').trim();
        const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(mainTitle);
        let fontSize = isPin ? (isKorean ? 68 : 58) : 60;
        ctx.font = `bold ${fontSize}px "${activeFont}", "Malgun Gothic", "NanumGothic", "Arial", sans-serif`;

        let lines = [];
        let maxLineW = w * 0.82;
        if (isKorean) {
            let currentLine = '';
            for (let char of mainTitle) {
                let testLine = currentLine + char;
                if (ctx.measureText(testLine).width > maxLineW) {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);
        } else {
            let words = mainTitle.split(' ');
            let currentLine = '';
            for (let word of words) {
                let testLine = currentLine + word + ' ';
                if (ctx.measureText(testLine).width > maxLineW) {
                    lines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine.trim());
        }

        if (lines.length > 4) {
            fontSize = Math.floor(fontSize * 0.8);
        }
        ctx.font = `bold ${fontSize}px "${activeFont}", "Malgun Gothic", "NanumGothic", sans-serif`;

        const totalH = lines.length * (fontSize + 18);
        let y = isPin ? (h * 0.8) - (totalH / 2) : (h * 0.55) - (totalH / 2);
        for (let l of lines) {
            ctx.fillText(l, w / 2, y);
            y += fontSize + 18;
        }

        // [ATTRIBUTION_FIX] 하단 라벨 추가
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold 28px "${activeFont}", sans-serif`;
        ctx.fillText('designed by smileseon', w / 2, h * 0.9);

        const form = new FormData();
        form.append('image', cv.toBuffer('image/jpeg').toString('base64'));
        const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
        return ir.data.data.url;
    } catch (e) {
        return await genImg(meta.mainTitle || meta.prompt, model, 0, ratio);
    }
}




async function writeAndPost(model, target, lang, blogger, bId, pTime, extraLinks = [], idx, total, persona = '') {
    const { text: searchData } = await searchSerper(target, lang);
    let pillarContext = '';

    if (extraLinks.length > 0) {
        const isKo = lang === 'ko';
        const btnText = isKo ? "▶ 관련 가이드 자세히 보기" : "▶ Read More Guide";
        const links = extraLinks.map((l, idx) => `[서브글 ${idx + 1}] 제목: ${l.title}\n[복사해서 본문에 넣을 HTML 코드]:\n<div style='margin: 40px 0;'><p style='font-size:16px; font-weight:700; color:#334155;'>🎯 Related Deep Dive:</p><a href='${l.url}' class='cluster-btn'>${l.title} ${btnText}</a></div>`).join('\n\n');

        const contextPrompt = isKo
            ? `[INTERNAL_LINK_PUNITIVE_MISSION]: 이 포스팅은 메인 허브(Pillar) 글입니다. 
            ★ 절대 규칙: 아래 제공된 ${extraLinks.length}개의 <서브글> 리스트를 기반으로, 본문 중간중간 관련된 내용이 나올 때 해당 서브글로 이동하는 버튼을 **반드시 각각 하나씩** 삽입하세요.
            ⚠️ 엉뚱한 링크를 만들지 마세요! 아래 리스트에 있는 **[복사해서 본문에 넣을 HTML 코드]**를 1글자도 바꾸지 말고 그대로 복사해서 배치만 하세요.`
            : `[INTERNAL_LINK_PUNITIVE_MISSION]: This is a Pillar post. 
            ★ STRICT RULE: You must insert exactly ${extraLinks.length} buttons in the article body linking to the provided sub-articles.
            ⚠️ DO NOT generate your own links! Simply COPY AND PASTE the exact **[복사해서 본문에 넣을 HTML 코드]** provided below into appropriate related sections of your content.`;
        pillarContext = `\n${contextPrompt}\n\n[서브글 목록 및 주입용 코드]\n${links}`;
    }

    const personaTag = persona ? `\n[SPECIFIC_PERSONA]: ${persona}` : '';
    const langTag = `\n[TARGET_LANGUAGE]: ${lang === 'ko' ? 'Korean' : 'English'}${personaTag}`;
    report(`🔥 [${idx}/${total}] 집필 시작: ${target}`);
    report(`💻 [AI 프롬프트 생성 중]: 리서치 데이터 ${searchData.length}자 포함...`);

    const h1Instruction = lang === 'ko'
        ? "<h1>(10년차 SEO 전문가의 구글 상단 노출을 위한 롱테일 키워드 제목)</h1>"
        : "<h1>(SEO Optimized Long-tail Keyword Title for Google Ranking)</h1>";

    const metaTitles = lang === 'ko'

        ? { thumb: "썸네일용 매력적인 짧은 한글 제목", pin: "핀터레스트용 세로형 매력적인 한글 제목" }
        : { thumb: "Short, eye-catching English title for thumbnail", pin: "Viral English title for Pinterest vertical pin" };

    // MISSION 분량 확보를 위한 강력한 지침 추가
    const m1Prompt = MASTER_GUIDELINE + `
[MISSION: FULL POST GENERATION] 
정확히 아래 포맷에 맞춰서 한 번에 모든 글을 작성해야 합니다. 절대 포맷을 어기지 마세요.
전체 글 분량은 6,000자~8,000자 이상 확보하도록 상세하게 풀어 쓰세요. 특히, 짧게 넘어가지 말고 본문의 섹션별 설명을 매우 길게 늘려야 합니다.

[필수 디자인 컴포넌트 - 반드시 본문에 포함하세요]:
★ 배치 전략:
    - 글이 지루해지지 않도록, H2 텍스트가 2개째 등장하는 타이밍마다 삽입하여 독자의 시선을 적절하게 환기하세요.
    - **[Time Awareness]**: Today's date is ${getKSTDateString()}. Always write based on the latest available information as of today. If referencing years, focus on the current year and future trends.

(A) 인사이트 박스 → <div class='insight-box'><strong>💡 Key Insight</strong><br>핵심 포인트 내용</div> — 최소 2개
(B) 전문가 꿀팁 → <div class='tip-box'><strong>💡 Smileseon's Pro Tip</strong><br>꿀팁 내용</div> — 최소 2개
(C) 면책 조항 (Disclaimer): 반드시 글의 최하단에 위치시키고 레이블을 강조하세요.
(D) 치명적 주의 → <div class='warn-box'><strong>🚨 Critical Warning</strong><br>주의 내용</div> — 최소 1개
(E) 신뢰 데이터 → <div class='data-box'><strong>📊 Fact Check</strong><br>팩트 체크 내용</div> — 최소 2개
(F) 마무리 박스 → <div class='closing-box'><h2>최종 마무리</h2><p>핵심 요약</p></div> — 글 맨 마지막에 반드시 1개
(G) 각 섹션에 가능하면 <table> 포함 (4열x4행 이상의 비교 데이터)
(H) FAQ 섹션에 최소 8~10개의 Q&A 포함

[META_DATA_START]
{
  "IMG_0": { "mainTitle": "${metaTitles.thumb}", "bgPrompt": "썸네일 배경 이미지 묘사 영문 프롬프트" },
  "IMG_1": { "prompt": "본문 첫번째 이미지 묘사 영문 프롬프트" },
  "IMG_2": { "prompt": "본문 두번째 이미지 묘사 영문 프롬프트" },
  "IMG_3": { "prompt": "본문 세번째 이미지 묘사 영문 프롬프트" },
  "IMG_PINTEREST": { "mainTitle": "${metaTitles.pin}", "prompt": "Pinterest 전용 세로형(2:3) 고퀄리티 이미지 묘사 영문 프롬프트" }
}
[META_DATA_END]


[CONTENT_START]
${h1Instruction}
<div class='toc-box'>
  <h3>Table of Contents</h3>
  <ul>
    <li><a href='#section-1'>첫번째 섹션 제목</a></li>
    <li><a href='#section-2'>두번째 섹션 제목</a></li>
  </ul>
</div>
<h2 id='section-1'>첫번째 섹션</h2>
<p>본문 내용...</p>
<div class='insight-box'><strong>💡 Key Insight</strong><br>인사이트 내용</div>
[[IMG_1]]
<h2 id='section-2'>두번째 섹션</h2>
<p>본문 내용...</p>
<div class='tip-box'><strong>💡 Smileseon's Pro Tip</strong><br>꿀팁 내용</div>
<h2>세번째 섹션</h2>
<p>본문 내용...</p>
<div class='data-box'><strong>📊 Fact Check</strong><br>데이터 내용</div>
[[IMG_2]]
<h2>네번째 섹션</h2>
<p>본문 내용...</p>
<div class='warn-box'><strong>🚨 Critical Warning</strong><br>주의 내용</div>
[[IMG_3]]
... 끝까지 (8~10개의 FAQ, closing-box 마무리 포함)
<div class='closing-box'><h2>최종 마무리</h2><p>핵심 요약</p></div>
[CONTENT_END]

★ 경고: 본문 내에 이미지 삽입부에는 절대로 <img src=...> 태그를 쓰지 말고, 오직 [[IMG_1]], [[IMG_2]], [[IMG_3]] 과 같은 치환자만 적으세요.
${target}
${searchData}
${pillarContext}
${langTag}`;

    const m1 = await callAI(model, m1Prompt);

    let finalHtml = '';
    let m0 = null;
    const imgMetas = {};

    // === 메타데이터 파싱 (신규 포맷 + 레거시 포맷 모두 지원) ===
    try {
        const metaMatch = m1.match(/\[META_DATA_START\]([\s\S]*?)\[META_DATA_END\]/i);
        if (metaMatch) {
            const cleanJsonStr = metaMatch[1].replace(/```json/i, '').replace(/```/g, '').trim();
            const metaJson = JSON.parse(cleanJsonStr);
            if (metaJson.IMG_0) m0 = metaJson.IMG_0;
            if (metaJson.IMG_1) imgMetas[1] = metaJson.IMG_1;
            if (metaJson.IMG_2) imgMetas[2] = metaJson.IMG_2;
            if (metaJson.IMG_3) imgMetas[3] = metaJson.IMG_3;
            if (metaJson.IMG_PINTEREST) imgMetas['P'] = metaJson.IMG_PINTEREST;
        }
    } catch (e) { report('⚠️ 신규 메타 파싱 실패, 레거시 파싱 시도', 'warning'); }

    // 레거시 포맷 파싱 (IMG_0: { mainTitle: "...", bgPrompt: "..." })
    if (!m0) {
        const legacyRegex = /IMG_(\d+):\s*\{([^}]*)\}/gi;
        let lm;
        while ((lm = legacyRegex.exec(m1)) !== null) {
            const i = Number(lm[1]), raw = lm[2];
            if (i === 0) m0 = { mainTitle: (raw.match(/mainTitle:\s*['"](.*?)['"]/i) || [])[1] || target, bgPrompt: (raw.match(/bgPrompt:\s*['"](.*?)['"]/i) || raw.match(/prompt:\s*['"](.*?)['"]/i) || [])[1] || target };
            else imgMetas[i] = { prompt: (raw.match(/prompt:\s*['"](.*?)['"]/i) || [])[1] || target };
        }
    }

    if (!m0) m0 = { mainTitle: target, bgPrompt: 'Abstract premium background' };

    // === 본문 추출 ===
    const contentMatch = m1.match(/\[CONTENT_START\]([\s\S]*?)\[CONTENT_END\]/i);
    if (contentMatch) {
        finalHtml = contentMatch[1].trim();
    } else {
        const metaEndIdx = m1.indexOf('[META_DATA_END]');
        finalHtml = metaEndIdx !== -1 ? m1.substring(metaEndIdx + 15).trim() : clean(m1, 'text');
    }

    // === 본문에서 메타데이터 잔여물 완전 제거 (최강 정규식) ===
    finalHtml = finalHtml.replace(/\[META_DATA_START\][\s\S]*?\[META_DATA_END\]/gi, '');
    finalHtml = finalHtml.replace(/\[CONTENT_START\]/gi, '').replace(/\[CONTENT_END\]/gi, '');
    finalHtml = finalHtml.replace(/IMG_\d+\s*[:=]\s*\{[\s\S]*?\}/gi, '');
    finalHtml = finalHtml.replace(/\{\s*"IMG_\d+"[\s\S]*?\}/g, '');
    finalHtml = finalHtml.replace(/```json[\s\S]*?```/gi, '');
    finalHtml = finalHtml.replace(/^\s*text\s*$/gm, '');

    // [MARKDOWN_TO_HTML] 마크다운 **강조** 문법을 HTML 태그로 변환시켜 깨짐 현상 방지 (더욱 강력한 정규식 적용)
    finalHtml = finalHtml.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');

    finalHtml = finalHtml.trim();

    let finalTitle = target;
    const h1Match = finalHtml.match(/<h1.*?>([\s\S]*?)<\/h1>/i);
    if (h1Match) finalTitle = h1Match[1].replace(/<[^>]+>/g, '').trim();
    finalHtml = finalHtml.replace(/<h1.*?>[\s\S]*?<\/h1>/gi, '').trim();

    if (m0) {
        const url0 = await genThumbnail(m0, model);
        finalHtml = `<img src='${url0}' alt='${m0.mainTitle}' style='width:100%; border-radius:15px; margin-bottom:40px;'>` + finalHtml.replace(/\s*\[\[IMG_0\]\]\s*/gi, '');
    }
    for (let i = 1; i <= 3; i++) {
        const reg = new RegExp(`\\s*\\[\\[IMG_${i}\\]\\]\\s*`, 'gi');
        if (reg.test(finalHtml)) {
            const urlI = await genImg((imgMetas[i] || {}).prompt || target, model, i);
            finalHtml = finalHtml.replace(reg, `<div style='text-align:center; margin:35px 0;'><img src='${urlI}' alt='${target}' style='width:100%; border-radius:12px;'></div>`);
        } else {
            // 만약 치환자가 없다면 H2 태그 위에 강제로 이미지를 주입
            const urlI = await genImg((imgMetas[i] || {}).prompt || target, model, i);
            let injected = false;
            let count = 0;
            finalHtml = finalHtml.replace(/<h2/gi, (match) => {
                count++;
                if (count === (i * 2)) {
                    injected = true;
                    return `<div style='text-align:center; margin:35px 0;'><img src='${urlI}' alt='${target}' style='width:100%; border-radius:12px;'></div>\n<h2`;
                }
                return match;
            });
        }
    }

    // === [IMG_PINTEREST] 처리 (2:3 수직 이미지 - 최상단 히든 썸네일) ===
    let urlPin = '';
    try {
        const pinMeta = imgMetas['P'] || { mainTitle: target, bgPrompt: target + " premium vertical pinterest style infographic 2026" };
        if (!pinMeta.mainTitle) pinMeta.mainTitle = target; // [TITLE_STABILITY] 영문 prompt가 제목으로 쓰이는 것 방지
        urlPin = await genThumbnail(pinMeta, model, '2:3');

        const pinHtml = `<div style='display:none;'><img src='${urlPin}' alt='Pinterest Optimized - ${target}'></div>\n`;
        // 무조건 최상단에 히든으로 삽입 (기존 치환자는 제거)
        finalHtml = pinHtml + finalHtml.replace(/\[\[IMG_PINTEREST\]\]/gi, '');
    } catch (pinErr) {
        report('⚠️ 핀터레스트 썸네일 생성 실패: ' + pinErr.message, 'warning');
    }

    // === [LINK_STABILITY] 메인글 하단에 서브글 링크 목록 자동 생성 (안전장치) ===
    if (extraLinks.length > 0) {
        const isKo = lang === 'ko';
        const sectionTitle = isKo ? "🔗 함께 읽으면 좋은 관련 가이드" : "🔗 Recommended Related Guides";
        let linkListHtml = `\n<div class='related-posts-box' style='margin-top:50px; padding:30px; background:rgba(99,102,241,0.05); border-left:5px solid #6366f1; border-radius:15px;'>`;
        linkListHtml += `<h3 style='margin-top:0; color:#6366f1;'>${sectionTitle}</h3><ul style='list-style:none; padding:0; margin:0;'>`;

        extraLinks.forEach(link => {
            linkListHtml += `<li style='margin:15px 0; padding-bottom:10px; border-bottom:1px solid rgba(0,0,0,0.05);'>
                <a href='${link.url}' style='text-decoration:none; font-weight:bold; color:#1e40af; display:block; transition:all 0.3s;'>
                    • ${link.title} <span style='color:#6366f1; font-size:0.8em; margin-left:10px;'>기사 보기 →</span>
                </a>
            </li>`;
        });
        linkListHtml += `</ul></div>\n`;

        // 본문 마지막에 관련 글 섹션 강제 결합
        finalHtml += linkListHtml;
    }

    // [CRITICAL FIX]: Remove redundant hardcoded disclaimer here because AI will generate it based on Master Guideline.
    const isFuture = pTime.getTime() > Date.now() + 60000;
    const reqBody = {
        title: finalTitle,
        content: STYLE + finalHtml + '</div>',
        published: pTime.toISOString()
    };
    // [SCHEDULE_STABILITY]: 시간이 미래라면 구글 블로그 API 스펙에 맞춰 명시적으로 SCHEDULED 상태를 던집니다.
    if (isFuture) reqBody.status = 'SCHEDULED';

    const res = await blogger.posts.insert({ blogId: bId, isDraft: false, requestBody: reqBody });
    report(`🖋️ [포스팅 성공]: "${finalTitle}"`, 'success');
    report(`🔗 [URL]: ${res.data.url}`);
    return { title: finalTitle, url: res.data.url };
}

async function run() {
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });

    report(`⚙️ 설정을 로드했습니다. (언어: ${config.blog_lang}, 모드: ${config.post_mode})`);
    report(`🚀 [TEST MODE]: daily_count(${config.daily_count}) 제한을 무시하고 즉시 실행합니다. (Unlimited Mode Enabled)`);

    report('🛡️ [Turbo Full-Mode]: 프리미엄 클러스터 구축 시작');


    let baseKeyword = config.pillar_topic || 'PC Hardware';
    const categories = {
        "1": { name: "PC Repair & Maintenance", query: "PC repair maintenance tips guide 2026", persona: "15년 경력의 베테랑 PC 정비사" },
        "2": { name: "Latest Hardware & Parts", query: "latest PC components hardware news 2026", persona: "하드웨어 벤치마크 전문 리뷰어" },
        "3": { name: "Gaming & Peripherals", query: "best gaming gear peripherals trends 2026", persona: "프로게이머 출신의 게이밍 기어 전문가" },
        "4": { name: "AI & Future Technology", query: "future AI technology trends 2026", persona: "실리콘밸리 기술 전략가이자 미래학자" },
        "5": { name: "Coding & Software", query: "programming software development trends 2026", persona: "풀스택 시니어 소프트웨어 엔지니어" },
        "6": { name: "Cooking & Recipes", query: "trending food recipes cooking tips 2026", persona: "미쉐린 가이드 스타일의 요리 연구가" },
        "7": { name: "Fashion & Beauty", query: "latest fashion beauty style trends 2026", persona: "글로벌 패션 에디터이자 스타일 디렉터" },
        "8": { name: "Health & Medical", query: "health wellness medical insights 2026", persona: "전문 헬스 케어 어드바이저" },
        "9": { name: "Global News & Issues", query: "global news world issue summary 2026", persona: "국제 정세 전문 시사 평론가" },
        "10": { name: "Finance & Stock", query: "finance stock market investment trends 2026", persona: "월스트리트 출신 투자 칼럼니스트" },
        "11": { name: "Travel & Adventure", query: "world travel destination adventure 2026", persona: "럭셔리 트래블 작가이자 탐험가" },
        "12": { name: "Home & Interior", query: "modern home interior design furniture 2026", persona: "하이엔드 공간 디자이너" }
    };

    if (baseKeyword === '자동생성') {
        const targetCats = config.target_categories || ["1"];
        let selectedCatKey;

        if (targetCats.includes("ALL")) {
            const keys = Object.keys(categories);
            selectedCatKey = keys[Math.floor(Math.random() * keys.length)];
            report(`🌐 [ALL 모드]: 전체 카테고리 중 랜덤 선정 (${categories[selectedCatKey].name})`);
        } else {
            selectedCatKey = targetCats[Math.floor(Math.random() * targetCats.length)];
            report(`📂 [복수 카테고리]: 선택된 목록 중 선정 (${categories[selectedCatKey].name})`);
        }

        const currentCat = categories[selectedCatKey];
        report(`🔍 [실시간 트렌드 분석]: ${currentCat.name} 분야의 이슈 파악...`);

        const trendSource = await searchSerper(currentCat.query, config.blog_lang);
        const pool = config.clusters || [];

        const selectionPrompt = `You are an elite trend analyst. 
        Date: ${getKSTDateString()}
        Category: ${currentCat.name}
        Persona: ${currentCat.persona}
        
        [Real-time News]:
        ${trendSource.text}
        
        [Keyword Pool]:
        ${pool.slice(0, 50).join(', ')}
        
        ★ MISSION: Select the best keyword from the pool OR create a new one based on trends.
        Output only the final keyword.`;

        const selectionRes = await callAI(model, selectionPrompt);
        baseKeyword = selectionRes.trim().replace(/^"|"$/g, '');
        config.selected_persona = currentCat.persona;
        report(`🎯 최종 전략 주제 확정: [ ${baseKeyword} ]`);
    } else {
        report(`📌 고정 키워드 사용: ${baseKeyword}`);
        config.selected_persona = ''; // 고정 키워드 시에는 페르소나 명시 안 함(기본값 사용)
    }

    // 1단계: 세부 주제 추출 (강력한 SEO 전략 + 페르소나 적용)
    const langName = config.blog_lang === 'ko' ? 'Korean' : 'English';
    const personaTag = config.selected_persona ? `\n[SPECIFIC_PERSONA]: ${config.selected_persona}` : '';

    const clusterPrompt = `You are a 10-year veteran blog Google SEO expert specializing in Topic Clusters.${personaTag}
    Today's date is ${getKSTDateString()}. 
    Niche: '${baseKeyword}'
    
    ★ MISSION: Create 5 high-performing blog post titles (1 Pillar + 4 Spokes) in ${langName} that dominate Google Search.
    
    [IMPORTANT: PERSONA VOICE]:
    - Use the vocabulary, tone, and perspective of the [SPECIFIC_PERSONA] defined above.
    - If the persona is an engineer, be technical and precise. If a chef, be sensory and authoritative.
    
    [SEO STRATEGIES TO APPLY]:
    1. **Recency (2026)**: Include '2026' naturally to trigger freshness.
    2. **Title Variety**: **DO NOT** use the same structure for all titles. Mix styles: Curiosity, Expert Opinion, Question-Based, Case Study, and 1-2 occasional Listicles.
    3. **Powerful Benefits**: Mention a specific, visceral benefit suited to your persona.
    4. **No Generic Fillers**: Avoid repetitive hooks like "Ultimate Guide". Use unique, persona-driven authority hooks.
    5. **No Numbered Heading**: NEVER use "1.", "2." in titles.
    
    Output ONLY a JSON array of 5 titles string.`;
    const clusterRes = await callAI(model, clusterPrompt);
    let list = JSON.parse(clean(clusterRes, 'arr'));

    // [Safety Fix] AI가 ["A", "B"] 대신 [{"title":"A"}, {"title":"B"}] 형태로 줄 경우 처리
    if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'object') {
        list = list.map(item => item.title || item.topic || item.headline || Object.values(item)[0]);
    }

    report(`📜 [생성된 클러스터 구조]:`);
    list.forEach((t, i) => report(`   ${i === 0 ? '🏆 Pillar' : '🎈 Spoke ' + i}: ${t}`));

    const pillarTitle = list[0]; const spokes = list.slice(1);
    const subLinks = [];

    // [Time Optimization] 스케줄 기준 시간 설정 및 절대 예약 시간 체계 (UTC 기준)
    let currentTime = new Date();
    // [해결] 엔진 구동 시간을 넉넉히 감안하여, '무조건 첫 글부터 미래'로 지정되게 15분 뒤로 기본 세팅
    currentTime.setMinutes(currentTime.getMinutes() + 15);

    if (config.schedule_time) {
        const [sh, sm] = config.schedule_time.split(':');
        const kstHour = parseInt(sh);
        const kstMin = parseInt(sm);
        const utcHour = kstHour - 9; // KST → UTC 변환

        // 오늘 날짜 기준으로 스케줄 시간(UTC) 생성
        const now = new Date();
        let scheduled = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
            utcHour < 0 ? utcHour + 24 : utcHour, kstMin, 0, 0
        ));
        // utcHour가 음수면 하루 전 날짜가 되므로 보정 불필요 (Date.UTC가 알아서 처리)
        // 단, KST 00:00~08:59는 UTC 기준 전날이므로 날짜 보정
        if (utcHour < 0) {
            // 이미 Date.UTC에서 24를 더했으므로, 실제로는 "오늘 KST = 어제 UTC" 케이스
            // scheduled는 오늘 UTC로 잡혔지만, 실제 KST로는 내일이 될 수 있음
        }

        // 이미 과거 시간이면 내일로 예약
        if (scheduled.getTime() < Date.now()) {
            scheduled.setUTCDate(scheduled.getUTCDate() + 1);
        }

        currentTime = scheduled;
        report(`📅 [스케줄] config.schedule_time=${config.schedule_time} KST → UTC 예약시간: ${scheduled.toISOString()} (KST: ${new Date(scheduled.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)})`);
    }

    // 2단계: Spoke(서브 글) 먼저 작성 - 실제 URL 확보
    for (let i = 0; i < spokes.length; i++) {
        // [핵심] 각 글 발행 이후 간격: 최소 80분에서 최대 120분 사이 랜덤
        if (config.random_delay) {
            let delay = 0;
            if (i > 0) {
                delay = Math.floor(Math.random() * 41) + 80; // 80 ~ 120 랜덤
                currentTime.setMinutes(currentTime.getMinutes() + delay);
            }
            report(`🎲 [Spoke ${i + 1}] ${delay === 0 ? '첫 글 (기본15분 대기)' : delay + '분 뒤'} 시간 지정: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
        } else {
            // 랜덤 사용 안 할 시 20분 간격
            if (i > 0) currentTime.setMinutes(currentTime.getMinutes() + 20);
            report(`⏰ [Spoke ${i + 1}] 20분 간격 예약 지정시간: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
        }

        const pTime = new Date(currentTime.getTime());
        const sRes = await writeAndPost(model, spokes[i], config.blog_lang, blogger, config.blog_id, pTime, [], i + 1, 5, config.selected_persona);
        if (sRes) subLinks.push(sRes);
        await new Promise(r => setTimeout(r, 30000));
    }

    // 3단계: Pillar(메인 글) 마지막 작성
    report(`🎯 최종 메인 허브(Pillar) 글 작성: ${pillarTitle}`);
    if (config.random_delay) {
        const finalDelay = Math.floor(Math.random() * 41) + 80; // 똑같이 80~120분 랜덤
        currentTime.setMinutes(currentTime.getMinutes() + finalDelay);
        report(`🎲 [Pillar] ${finalDelay}분 최종 지연 예약: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
    } else {
        currentTime.setMinutes(currentTime.getMinutes() + 20);
        report(`⏰ [Pillar] 최종 블로그 예약 지정시간: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
    }

    const pillarTime = new Date(currentTime.getTime());
    await writeAndPost(model, pillarTitle, config.blog_lang, blogger, config.blog_id, pillarTime, subLinks, 5, 5, config.selected_persona);
    report('🌈 프리미엄 클러스터 전략 완료!', 'success');
}
run().catch(e => { report(e.message, 'error'); process.exit(1); });