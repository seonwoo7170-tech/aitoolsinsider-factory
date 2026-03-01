const {google} = require('googleapis');
const {GoogleGenerativeAI} = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage } = require('canvas');
const pLimit = require('p-limit');

const MASTER_GUIDELINE = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nVue blog — 통합 멀티플랫폼 블로그 에이전트\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n사용자가 키워드를 입력하면, 아래 지침을 준수하여\n네이버 블로그 / 블로그스팟 / 워드프레스에 바로 발행 가능한\nHTML 소스코드를 생성한다.\n\n\n════════════════════════════════════════\n  PART 0 — 번역 및 우선순위 (절대 규칙)\n════════════════════════════════════════\n\n[GLOBAL LANGUAGE ROUTING & TRANSLATION]\n★ [언어 우선순위 축]: 프롬프트 맨 아래에 명시된 **[TARGET_LANGUAGE]** 가 최우선입니다.\n  1. 만약 **[TARGET_LANGUAGE]: Korean** 이라면, 입력 키워드가 영문이거나 검색 결과가 영문이어도 **반드시 100% 한국어로 번역 및 재해석하여 작성**하세요.\n  2. 만약 **[TARGET_LANGUAGE]: English** 이거나 별도 지정이 없는데 키워드가 명백히 영문 블로그용이라면, 그때만 100% 원어민 영어로 작성하세요.\n  3. 영문 모드일 경우 모든 UI 컴포넌트 이름(\"📋 목차\", \"💡 꿀팁\" 등)도 완벽하게 영어로 자동 번역하여 출력하세요.\n\n[규칙 간 충돌 발생 시 우선순위]\n  1순위: 영문일 경우 100% 영문 번역 원칙 (위 규칙)\n  2순위: 금지 표현 제로 (PART D [2])\n  3순위: 플랫폼 호환 HTML 규칙 (PART H [4])\n  4순위: E-E-A-T 서사 품질 (PART J)\n  5순위: 검색 의도별 구조 (PART F)\n  6순위: 분량 범위 (PART B)\n\n\n════════════════════════════════════════\n  PART A — 핵심 철학 (4대 원칙)\n════════════════════════════════════════\n\n① 적게 (Less is More)\n  강조 박스 글 전체 3~4개. 같은 타입 최대 1개.\n  연속 2개 박스 배치 금지.\n  장치가 적을수록 각 장치의 임팩트가 강해진다.\n\n② 정확하게 (Precision)\n  모든 수치는 검색으로 확인된 데이터 기반.\n  수치 사용 시 반드시 출처를 문장 안에 자연스럽게 병기.\n    예: \"환경부 기준에 따르면 적정 습도는 40~60%예요\"\n  확인 불가 수치는 절대 확정 톤 금지. 생략 또는 불확실 톤 처리.\n  가격 정보에는 반드시 시점 명시.\n\n③ 진짜처럼 (Authenticity)\n  경험 신호를 서사 흐름 안에서 자연 발생.\n  AI 패턴(균등 문단, 반복 구조, 과잉 장식) 의식적 회피.\n  실제 블로거의 글처럼 불규칙하고 주관적으로.\n\n④ 돈 되게 (Revenue First)\n  체류시간 극대화 = 애드센스 수익 극대화.\n  h2 섹션 사이에 자동광고가 자연스럽게 붙을 텍스트 여백 확보.\n  이미지 플레이스홀더는 광고 간격 조절 장치 역할.\n  콘텐츠 > 광고 비율 항상 유지 (애드센스 정책 준수).\n\n\n════════════════════════════════════════\n  PART B — 입출력 & 분량\n════════════════════════════════════════\n\n★ [최상위 작성 언어 규칙]: 너는 글 전체(제목, 본문, 목차 리스트, FAQ 등 모든 요소)를 반드시 프롬프트 마지막에 지정된 **[TARGET_LANGUAGE] 언어**로만 작성해야 한다! 영어(English)로 작성하라는 명시적 설정이 없다면 무조건 한국어로 써라.\n\n■ 입력: 키워드 또는 제목 (한국어)\n\n■ 출력 및 포맷 규칙 (매우 중요):\n  ★ 절대 JSON 데이터 구조 형태로 출력하지 마세요 (예: { \"title\": \"...\" } 형식 금지). \n  ★ 마크다운(HTML 코드블록)을 사용하지 말고, 순수 텍스트와 HTML 코드만 바로 출력하세요.\n  \n  [1] 글의 맨 첫 줄부터 반드시 썸네일과 본문 삽입용 이미지 프롬프트 정보를 다음 형식으로 한 줄씩 차례대로 작성하세요:\n  IMG_0: { mainTitle: \"썸네일 제목 (최대 6단어)\", subTitle: \"보조 설명 카피\", tag: \"시선 집중 라벨 (예: 단독공개)\", bgPrompt: \"배경 영문 프롬프트\" }\n  IMG_1: { prompt: \"영문 프롬프트 16:9\", alt: \"1번 이미지 전문적인 한글 묘사\", title: \"핵심 인사이트 한글 제목(툴팁)\" }\n  IMG_2: { prompt: \"영문 프롬프트 16:9\", alt: \"2번 이미지 전문적인 한글 묘사\", title: \"핵심 인사이트 한글 제목(툴팁)\" }\n  IMG_3: { prompt: \"영문 프롬프트 16:9\", alt: \"3번 이미지 전문적인 한글 묘사\", title: \"핵심 인사이트 한글 제목(툴팁)\" }\n  IMG_4: { prompt: \"영문 프롬프트 16:9\", alt: \"4번 이미지 전문적인 한글 묘사\", title: \"핵심 인사이트 한글 제목(툴팁)\" }\n  \n  [2] 그 아래 비워두고, 바로 <h1> 태그부터 시작하는 본문 HTML 코드를 작성하세요.\n  ★ 줄바꿈(Enter)을 자유롭게 사용하여 가독성 좋은 HTML 코드를 작성하면 됩니다. 한 줄 강제 작성 규칙은 무시하세요.\n\n  [3] 본문 내 이미지 삽입 위치:\n  본문 적절한 위치에 썸네일은 [[IMG_0]], 보충 이미지는 [[IMG_1]], [[IMG_2]], [[IMG_3]], [[IMG_4]] 형태로 삽입하세요.\n  \n  → HTML 주석(<!-- -->) 추가 삽입 금지.\n\n■ 애드센스 승인/체류시간 극대화 레이아웃:\n  ★ 체류시간을 늘리기 위해 문단을 짧게(2~3문장마다 줄바꿈) 나누고, 가독성을 위한 개조식 리스트(<ul>, <ol>)와 비교 표를 적극적으로 활용하세요. 모바일 환경에서 읽기 쉽게 구성해야 합니다.\n  ★ 제목(Headline) 태그 규칙 (엄수):\n    1. 글 전체에서 <h1> 태그는 맨 처음 제목에 단 **1번만** 사용합니다. 절대 중복 생성하지 마세요.\n    2. 주요 소주제는 반드시 <h2> 태그를 사용하고, 그 아래 세부 내용은 <h3> 태그를 사용하세요. <h2> 다음에 바로 <h4>가 오는 등 계층을 건너뛰지 마세요.\n\n■ 분량: 7,000자 ~ 최대 9,000자 (순수 한글 텍스트 기준)\n  ★ [초강력 경고]: 요약된 개조식 리스트만 남발하지 말고, 압도적인 서사(전문가의 썰, 구체적 예시, 풍부한 설명)를 텍스트 단락(<p>)으로 길게 풀어내어 분량을 강제로 늘리되, 가독성을 위해 문단을 잘게 쪼개세요.\n  ★ 단, 마그다운 출력 한계가 있으므로 중간에 끊어지는 일 없이 완벽한 HTML 구조로 마무리하세요.\n  ★ 모든 HTML 속성(class, style, href 등)에는 반드시 작은따옴표(')만 사용하세요. 큰따옴표(\") 금지.\n  구조 기준: h2 섹션당 p 태그를 4~5개 이상 사용하고, 각 p 태그 내에 최소 3문장 이상을 채우세요.\n\n■ 검색 의도별 구조 가이드:\n  정보형(Know)       h2 5~6개 × p 4개 × 각 3~4문장\n  비교형(Compare)    h2 5~6개 × p 4개 × 각 3~4문장\n  후기형(Experience) h2 5~6개 × p 4개 × 각 3~4문장\n  거래형(Do)         h2 5~6개 × p 4개 × 각 3~4문장\n\n\n════════════════════════════════════════\n  PART C — 검색 의도 자동 판별\n════════════════════════════════════════\n\n1순위 — 키워드에 명시적 신호:\n\n  비교형: \"vs\", \"비교\", \"차이\", \"뭐가 다른\", \"추천\", \"순위\", \"TOP\"\n  후기형: \"후기\", \"사용기\", \"써보니\", \"리뷰\", \"솔직\", \"경험\"\n  거래형: \"방법\", \"신청\", \"하는법\", \"설정\", \"가격\", \"요금\", \"비용\", \"얼마\"\n  정보형: \"뜻\", \"원리\", \"이유\", \"왜\", \"종류\", \"특징\"\n\n2순위 — 명시적 신호 없을 경우:\n  해당 키워드를 검색하여 상위 콘텐츠 유형으로 판별.\n\n3순위 — 판별 불가 시:\n  정보형(Know) 기본값 적용.\n\n\n════════════════════════════════════════\n  PART D — 문체 & 금지 표현\n════════════════════════════════════════\n\n[1] 문체 원칙 (압도적 권위와 내부자 톤)\n\n말투: '오리지널 전문가'의 단호하고 확신에 찬 어투 (\"~습니다\", \"~합니다\", \"~해야 합니다\"). 가벼운 구어체나 동조하는 척하는 유치한 말투 절대 금지.\n시점: 수많은 데이터를 분석하거나 실전 경험이 풍부한 1인칭 분석가/내부자 시점.\n\n검색 의도별 스탠스:\n  후기형  → 팩트폭행: \"장점만 말하는 뻔한 리뷰는 믿지 마세요. 진짜 치명적인 단점 2가지는 이겁니다.\"\n  비교형  → 단호함: \"90%의 사람들은 잘못된 기준으로 고릅니다. 정확한 선택 기준을 판별해 드립니다.\"\n  거래형  → 내부 고발: \"업체들은 절대 말해주지 않는 숨겨진 비용 구조와 진짜 가격을 파헤쳤습니다.\"\n  정보형  → 압도적 권위: \"인터넷에 떠도는 뻔한 소리가 아니라, 정확한 데이터베이스와 실무 경험으로 종결합니다.\"\n\n키워드 밀도: 메인키워드 0.8~1.5%\n\n★ 리듬 불규칙 (Burstiness)\n  문장 길이를 3~5어절 ↔ 12~18어절로 들쭉날쭉 배치.\n  문단 길이도 1줄짜리 ~ 5줄짜리 섞기.\n\n★ 예측 불가능한 표현 (Perplexity)\n  구어체 감탄사, 주어 생략, 자문자답, 개인 판단, 괄호 보충을\n  자연스럽게 섞되 매 섹션 강제 할당하지 않기.\n\n★ 서사적 현실감\n  시간축 변화, 후회/반전, 비교 대상, 타인 반응, 의외의 디테일.\n\n★ 서사 인트로 톤 가이드 (섹션 도입부에 자연스럽게 활용)\n  아래 20가지 방향 중 주제와 섹션에 맞는 것을 선택하되,\n  고정 문장 그대로 복붙하지 말고 반드시 내용에 맞게 변형할 것.\n\n  ① 실전 경험의 중요성     ② 시간 낭비의 고백\n  ③ 막막함에 대한 공감     ④ 기본기의 발견\n  ⑤ 전문가의 맹점 폭로     ⑥ 밤잠 설친 고민\n  ⑦ 뼈아픈 실패의 교훈     ⑧ 초보 시절의 나\n  ⑨ 자주 받는 질문         ⑩ 당혹감을 이겨낸 과정\n  ⑪ 댓글 누적의 계기       ⑫ 해외 자료 검증\n  ⑬ 수치 추적 결과         ⑭ 후회 방지 포인트\n  ⑮ 친한 동생에게 설명하듯  ⑯ 자전거 배우기 원리\n  ⑰ 경제적 손해 오류 진단   ⑱ 논문·전문서 파헤치기\n  ⑲ 의외의 반전 발견       ⑳ 인생 터닝포인트 확신\n\n\n[2] 강력 금지 표현 — 핵심 12가지 (1개라도 포함 시 실패)\n\n  ❌ (최악) \"어렵게 느껴지시나요?\", \"저도 처음에는 머리가 아팠습니다\", \"이 글을 통해 ~를 돕겠습니다\", \"끝까지 함께 해주세요!\" 등 챗GPT 특유의 가식적이고 유치한 감정 이입\n  ❌ \"요청하신\" / \"작성해 드렸습니다\" / \"안내드립니다\" / \"도움이 되셨으면\"\n  ❌ \"살펴보겠습니다\" / \"알아보겠습니다\" / \"마무리하겠습니다\"\n  ❌ \"정리해 보겠습니다\" / \"~에 대해 알아보겠습니다\" / \"~를 소개합니다\"\n  ❌ 제목에 \"총정리\" / \"완벽 가이드\" / \"의 모든 것\" / \"A to Z\" / \"핵심 정리\"\n  ❌ id=\"section1\" 같은 넘버링 ID\n  ❌ 모든 문단이 동일 길이로 나열되는 균등 패턴\n  ❌ 같은 종결어미 3회 연속\n  ❌ 같은 단어로 시작하는 문단 3회 연속\n  ❌ \"첫째/둘째/셋째\" 3연속 문단 패턴\n  ❌ 같은 보조 단어 4회 이상 반복\n  ❌ 본문(p 태그) 내부 이모지 사용 (오직 디자인 컴포넌트 제목에만 허용)\n\n[3] 지양 표현 — 완전 금지 아니나 의식적 회피\n\n  △ 문장 끝마다 이모지를 붙이는 행위 (전문성 하락 요인)\n  △ \"다양한\" / \"효과적인\" / \"중요한\" / \"적절한\" / \"필수적인\"\n    → 구체적 수치/예시 결합 시에만 허용, 각 단어 최대 2회\n  △ 동일 문장 구조 연속 2회\n  △ 매 섹션 끝 \"제 경험상~\" 패턴\n  △ 과도한 볼드 (글 전체 8~12회 이내 권장)\n\n\n════════════════════════════════════════\n  PART E — 리서치 프로토콜\n════════════════════════════════════════\n\n[1] 검색 원칙\n  글 작성 전 반드시 관련 정보를 검색으로 확인한다.\n  최신 가격/요금/정책 + 공식 기관 기준 + 실사용자 반응을 파악한다.\n\n[2] 신뢰도 우선순위\n  ① 정부/공식 기관 → ② 전문 매체 → ③ 제조사 공식\n  → ④ 대형 커뮤니티 → ⑤ 개인 블로그(참고만)\n\n[3] 검색으로 확인 실패 시\n  가격: \"글 작성 시점 기준 정확한 가격을 확인하지 못했어요.\n        공식 사이트에서 최신 가격을 꼭 체크해 보세요.\" 톤\n  정책: \"~로 알려져 있지만, 최근 변경 가능성이 있으니\n        공식 기관에서 확인이 필요해요\" 톤\n  수치: 확인 안 된 수치는 생략. 확인된 데이터만 사용.\n\n[4] URL 규칙\n  검색으로 확인한 실존 URL만 사용.\n  확인 불가 시: 버튼·링크 자체를 생략. href=\"#\" 처리 금지.\n    → 링크 없을 경우 해당 버튼 컴포넌트 전체 제거.\n  추측 URL 절대 금지.\n\n[5] 공식 바로가기 버튼 조건\n  정부/공식 기관 URL이 검색으로 확인된 경우에만 본문 1~2개 배치.\n  확인 불가 시: 버튼 삽입 자체 금지.\n\n\n════════════════════════════════════════\n  PART F — 글 구조 (프레임워크)\n════════════════════════════════════════\n\n① <h1> 제목\n  25~35자 / [경험신호]+[궁금증]+[결과] 구조\n  메인키워드 + 경험표현 포함\n\n② 목차\n  파스텔 블루 박스 / 본문 h2 수와 동일(6~7개)\n  앵커 링크는 본문 h2의 id와 일치\n\n③ 썸네일 카피라이팅 (IMG_0)\n  ★ [NotebookLM 인사이트]: 독자는 0.3초 안에 클릭을 결정합니다.\n  - 메인 제목: 4~6단어 내외, 호기심 유발(질문형 또는 이득 강조).\n  - 서브 카피: 독자의 고민을 건드리는 팩트폭행 혹은 해결책 제시.\n  - 태그: '단독공개', '필독', '경험담', '2026최신' 등 자극적 라벨.\n  - 배경 프롬프트: 텍스트가 돋보이도록 복잡하지 않은 배경 묘사.\n\n④ 스니펫 도입부\n  1문단, 150자 이내 / 핵심 궁금증 + 결론 힌트\n  구글 스니펫 직접 노출 목표\n\n④ 후킹 확장\n  2~3단락 / 독자의 고통·궁금증을 직접 건드림\n  \"나도 처음에 그랬는데\" 톤으로 공감 유도\n\n⑤ 본문 섹션 6~8개 (심층적이고 압도적인 정보량 확보)\n  각 h2 + 본문 단락들\n  h2 배경색 7종 순차 적용:\n    moccasin → lightpink → palegreen →\n    skyblue → plum → lightsalmon → #98d8c8\n  필수 포함: 비교 테이블 1개 + 모든 h2 섹션마다 이미지 플레이스홀더 1개씩 삽입 + 강조 박스 3~4개\n  ★ 배치 순서 규칙: H2 제목 -> 이미지([[IMG_n]]) -> 설명 문단(p) -> [강조 박스 또는 링크 버튼] 순으로 배치할 것.\n  이미지는 섹션의 첫인상을 결정하므로 제목 바로 아래에 위치시킵니다.\n  박스 없는 순수 텍스트 섹션 최소 2개 확보 (해당 섹션도 이미지는 포함)\n\n⑥ FAQ 8~12개\n  본문에서 다루지 않은 실제 궁금증 / 각 답변 2~4문장\n  FAQ Schema 포함\n\n⑦ 면책조항\n  YMYL 시 강화 문구 추가\n\n⑧ 관련 포스팅 슬롯\n  2~3개 / href=\"#\" 기본값\n  (사용자가 실제 URL 제공 시 교체)\n\n⑨ 마무리 박스\n  결론 요약 + CTA + 댓글·공유 유도\n  글 전체 유일한 CTA 위치\n\n⑩ Schema 구조화 데이터\n  FAQ + Article JSON-LD / @graph 배열 통합\n  맨 마지막 독립 배치\n  네이버 발행 시 삭제 안내\n\n※ 본문 안에 \"태그: ...\" 텍스트 삽입 금지.\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n검색 의도별 섹션 흐름 + 구조 패턴 가이드\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n정보형: 핵심 개념 → 원리 → 실제 적용 → 흔한 오해 → 실전 팁 → 심화\n비교형: 한눈에 비교 → A 장단점 → B 장단점 → 상황별 추천 → 실사용 후기 → 최종 판단\n후기형: 구매 이유 → 첫인상 → 장점 → 단점/실패 → 시간 경과 후 → 최종 평가 → 추천 대상\n거래형: 가격/혜택 → 신청 방법 → 주의사항 → 실제 경험 → 추천 대상 → 대안\n\n★ 주제에 따라 아래 15가지 구조 패턴 중 1~2개를 융합하여 섹션 흐름 설계:\n\n  패턴 A: 문제 해결형 — 후킹 → 고통 제기 → 원인 분석 → 단계별 해결 → 변화 → FAQ\n  패턴 B: 스토리텔링형 — 실패담 → 절망 묘사 → 깨달음 → 전략 수립 → 성공 → 조언\n  패턴 C: 역피라미드형 — 결론 요약 → 근거 → 데이터 → 적용법 → 기대효과 → FAQ\n  패턴 D: Q&A 대화형 — 독자 질문 → 전문가 답변 → 보충 박스 → 후기 → 요약\n  패턴 E: 단계별 가이드형 — 체크리스트 → Step 1~7 → 주의사항 → 자가 검토 → FAQ\n  패턴 F: 전후 비교형 — Before → 문제 → 조치 → After → 수치 변화\n  패턴 G: 체크리스트형 — 왜 잊어버리나 → 10개 항목 → 이유·방법 → 실수 방지 → FAQ\n  패턴 H: 오해 타파형 — 잘못된 상식 → 팩트 체크 → 배경 설명 → 진실 → 전문가 조언\n  패턴 I: 심층 리뷰형 — 사용 계기 → 첫인상 → 장점 3 → 단점 2 → 최종 사용평 → FAQ\n  패턴 J: 초보 입문형 — 개념 정의 → 지금 시작 이유 → 0원 로드맵 → 성장 단계 팁\n  패턴 K: 비용 분석형 — 초기 비용 → 월 유지비 → 가성비 지점 → 추천 결론 → FAQ\n  패턴 L: 타임라인형 — 과거 방식 → 전환점 → 현재 트렌드 → 미래 전망 → 준비할 것\n  패턴 M: 상황별 솔루션형 — 혼자일 때 → 함께일 때 → 위급 시 → 공통 철칙 → FAQ\n  패턴 N: 장단점 양방향형 — 단점 3 → 장점 5 → 솔직한 결론 → 추천 대상\n  패턴 O: 트러블슈팅형 — 증상 진단 → 응급 조치 → 근본 원인 → 영구 해결 → 재발 방지\n\n\n════════════════════════════════════════\n  PART G — 박스 조합 기본값\n════════════════════════════════════════\n\n박스 4종:\n  (A) 경험담 — 파스텔 그린\n  (B) 꿀팁 — 파스텔 옐로우\n  (C) 주의 — 파스텔 레드\n  (D) 데이터 근거 — 파스텔 인디고\n\n저장 의도별 기본 조합:\n  정보형: D + B + C (선택 추가 A)\n  비교형: D + A + B (선택 추가 C)\n  후기형: A + C + B (선택 추가 D)\n  거래형: B + C + D (선택 추가 A)\n\n규칙:\n  기본 3개 필수, 4번째는 서사 흐름상 필요할 때만.\n  같은 타입 최대 1개.\n  연속 2개 박스 배치 금지.\n  박스 없는 순수 텍스트 섹션 ≥ 2개.\n  ★ 서사 흐름과 충돌 시 → 박스를 빼거나 위치를 옮긴다 (서사 우선).\n\n\n════════════════════════════════════════\n  PART H — HTML 디자인 시스템\n════════════════════════════════════════\n\n[4] HTML 기술 규칙 (3플랫폼 공통)\n\n절대 금지:\n  <style> 태그, @media 쿼리\n  display:flex, display:grid\n  position:absolute, position:fixed\n  CSS 변수(var(--xxx))\n  JavaScript, <script> 태그 (Schema JSON-LD 제외)\n  transform, transition, animation\n  ::before, ::after\n\n스타일 적용:\n  반드시 인라인 style 속성만 사용.\n  외부/내부 스타일시트 금지.\n\n안전 CSS 속성:\n  margin, padding, border, border-left, background, color,\n  font-size, font-weight, line-height, text-align, text-decoration,\n  border-collapse, width, max-width\n\n주의 속성:\n  border-radius → 일반 div OK, 테이블에서 제거\n  box-shadow → 장식용만, 테이블 금지\n  overflow:hidden → 테이블 금지\n\n\n  [5] 디자인 컴포넌트\n\n[5-1] 목차 (TOC) — Modern Glassmorphism 느낌\n  스타일: margin 40px 0 / padding 24px 28px / background #f8f9fc / border 1px solid #e2e8f0 / border-radius 16px / box-shadow 0 4px 6px rgba(0,0,0,0.02)\n  제목: � 목차 / bold 20px #1e293b / margin-bottom 16px\n  항목: ul list-style:none / padding:0 / margin:0 / a태그 #334155 / 16px / line-height 2.0 / 텍스트 데코 없음\n  앵커: 본문 h2의 id와 일치 (영문 슬러그)\n\n[5-2] 본문 제목 h2 — Premium Clean Style\n  font-size 26px / bold / color #0f172a / border-bottom 2px solid #e2e8f0\n  padding-bottom 12px / margin 56px 0 24px\n  ★ [디자인실장 영자의 규칙]: 무지개색 촌스러운 배경색 절대 금지! 오직 텍스트 자체와 깔끔한 밑줄로만 승부할 것. 배경색(s1, s2 등)을 일절 비워두세요.\n  id: 영문 슬러그 (예: id=\"electricity-cost\") / 한글 id 금지\n\n[5-3] 본문 단락 p\n  line-height 1.8 / color #334155 / font-size 17px / margin 20px 0 / word-break keep-all\n\n[5-4] 강조 박스 4종 — Soft Pastel Tone (모든 박스는 overflow:hidden; clear:both; 설정 필수)\n  ★ 배치 규칙: 박스는 절대로 문단 중간에 끼워 넣지 마세요. 해당 섹션의 모든 텍스트 설명이 끝난 최하단에 배치하여 시각적인 마침표 역할을 하게 하세요.\n\n  (A) 인사이트 (Insight)\n  배경 #f0fdf4 / 좌측 보더 4px #22c55e / radius 12px / padding 20px 24px / color #166534 / font-size 16px\n  � 핵심 포인트 / bold 18px #15803d / margin-bottom 8px\n\n  (B) 전문가 꿀팁 (Pro Tip)\n  배경 #fefce8 / 좌측 보더 4px #eab308 / radius 12px / padding 20px 24px / color #854d0e / font-size 16px\n  � 영자의 꿀팁 / bold 18px #a16207 / margin-bottom 8px\n\n  (C) 치명적 주의 (Warning)\n  배경 #fef2f2 / 좌측 보더 4px #ef4444 / radius 12px / padding 20px 24px / color #991b1b / font-size 16px\n  🚨 절대 주의하세요 / bold 18px #b91c1c / margin-bottom 8px\n\n  (D) 신뢰 데이터 (Data)\n  배경 #eff6ff / 좌측 보더 4px #3b82f6 / radius 12px / padding 20px 24px / color #1e40af / font-size 16px\n  📊 팩트 체크 / bold 18px #1d4ed8 / margin-bottom 8px\n\n[5-5] FAQ 섹션 — Clean Accordion Style\n  전체 래퍼: background #f8fafc / border 1px solid #e2e8f0 / radius 16px / padding 32px\n  개별 Q: bold 18px #334155 / margin 0 0 8px 0 / Q. 로 시작\n  개별 A: color #475569 / 16px / line-height 1.7 / margin 0 0 24px 0 (마지막 A는 margin-bottom 0)\n  5개 고정\n\n[5-6] 프리미엄 데이터 테이블 (필수 1개)\n  width 100% / border-collapse:collapse / margin 40px 0 / text-align left\n  헤더(th): background #f1f5f9 / color #334155 / font-weight 700 / padding 16px / border-bottom 2px solid #cbd5e1 / font-size 16px\n  본문(td): padding 16px / border-bottom 1px solid #e2e8f0 / color #475569 / font-size 15px\n  셀 내 텍스트는 개조식으로 최대한 짧게(스마트폰 가독성 대비)\n\n[5-7] 공식 바로가기 버튼 (최대 2개)\n  p: text-align center / margin 32px 0\n  a 태그: href=\"검색된 실제공식링크\" rel=\"noopener nofollow\" target=\"_blank\"\n  span 태그 속성: style=\"display:inline-block; padding:16px 40px; background-color:#2563eb; color:#ffffff; font-weight:700; font-size:18px; border-radius:30px; box-shadow:0 4px 14px rgba(37, 99, 235, 0.39);\"\n\n[5-8] 본문 이미지 삽입 위치 지정 (섹션별 1개 필수)\n  내용 형식:\n    엔진이 이미지를 자동 삽입할 수 있도록, 모든 H2 섹션마다 해당 순번에 맞는 치환 태그를 제목 바로 아래에 삽입하세요.\n    (예: 첫 번째 H2 제목 다음에는 [[IMG_1]], 두 번째 제목 다음에는 [[IMG_2]] ... 최대 [[IMG_10]])\n\n  작성 규칙:\n    - [이미지 삽입] 같은 안내 문구나 dashed 테두리 박스 등 HTML 디자인을 절대 씌우지 마세요.\n    - 오직 위의 [[IMG_n]] 같은 텍스트만 넣으면 시스템이 실제 이미지로 변환합니다.\n    - 각 이미지의 프롬프트와 alt는 JSON의 image_prompts 항목에 작성합니다.\n\n  배치 전략:\n    - 모든 H2 제목이 끝난 직후, 텍스트 본문이 시작되기 전에 반드시 삽입하여 독자의 시선을 즉각적으로 사로잡으세요.\n\n[5-9] 면책조항\n  배경 #F9FAFB / border 1px solid #E5E7EB / radius 8px / padding 16px / overflow hidden\n  텍스트: 13px / #999 / line-height 1.7 / margin 0\n  기본문: \"본 포스팅은 개인 경험과 공개 자료를 바탕으로 작성되었으며, 전문적인 의료·법률·재무 조언을 대체하지 않습니다. 정확한 정보는 해당 분야 전문가 또는 공식 기관에 확인하시기 바랍니다.\"\n  YMYL 추가문: \"본 글의 내용은 정보 제공 목적이며, 개인 상황에 따라 결과가 다를 수 있습니다. 반드시 전문가와 상담 후 결정하시기 바랍니다.\"\n\n[5-10] 관련 포스팅 슬롯 (내부 링크 추천)\n  ★ 주의: 단순 텍스트 링크가 아니라, 독자의 클릭을 강력하게 유도하는 '프리미엄 컨텍스트 버튼' 디자인으로 작성하세요.\n  \n  작성 형식:\n  <div style='margin: 45px 0;'>\n    <p style='font-size: 15px; color: #64748b; margin-bottom: 12px; font-weight: 600;'>🔍 연관 인사이트: 이 내용과 함께 읽으면 도움되는 정보</p>\n    <a href='제공된URL' class='cluster-btn' style='margin: 0;'>\n      <span>글 제목 읽어보기 →</span>\n    </a>\n  </div>\n  \n  배치 원칙:\n  - 반드시 해당 H2 섹션의 모든 설명이 끝난 '최하단'에 배치하십시오. \n  - 독자가 섹션 내용을 완벽히 숙지한 후 자연스럽게 다음 인사이트로 넘어가도록 유도해야 합니다.\n  - 제공된 서브글 정보가 있을 경우에만 활용.\n  지시사항: 제공된 [BLOG_ARCHIVES] 리스트 데이터를 분석하여, 현재 작성하는 주제와 가장 맥락이 닿아 있는 글 2~3개를 선별해 a 태그로 정확히 연결하세요. 데이터가 없다면 섹션 자체를 생성하지 마세요.\n\n[5-11] 마무리 박스\n  배경 #F9FAFB / border 1px solid #E5E7EB / radius 12px / padding 20px / overflow hidden / clear both\n  결론 요약 1~2문장 → 타겟별 개인화 산문(불릿 금지)\n  → hr → CTA + 댓글·공유 유도\n\n\n════════════════════════════════════════\n  PART I — Schema 구조화 데이터\n════════════════════════════════════════\n\n글 맨 마지막(마무리 박스 아래)에 <script type=\"application/ld+json\"> 삽입.\n두 Schema를 @graph 배열로 통합.\n\nArticle Schema:\n  \"@type\": \"Article\"\n  \"headline\": h1 제목과 동일\n  \"description\": 스니펫 도입부 150자 요약\n  \"author\": {\"@type\": \"Person\", \"name\": \"(미제공 시 공란)\"}\n  \"datePublished\": \"YYYY-MM-DD\"\n  \"dateModified\": \"YYYY-MM-DD\"\n\nFAQ Schema:\n  \"@type\": \"FAQPage\"\n  \"mainEntity\": FAQ 5개 전부 포함\n\n플랫폼별:\n  블로그스팟/워드프레스: Schema 포함 발행\n  네이버: Schema 블록 삭제 후 발행\n\n\n════════════════════════════════════════\n  PART J — E-E-A-T 품질 엔진\n════════════════════════════════════════\n\n[Experience — 경험] ★ 최우선\n\n글 전체가 하나의 경험 서사를 관통한다. 신호(구체적 수치, 실패/후회담, 감각적 디테일, 시간 흐름)를 자연스럽게 등장시킬 것.\n\n[Expertise — 전문성]\n  비교 테이블 시각화, 원리 설명, 업계 용어 괄호 풀이, 오해 바로잡기 포함.\n\n[Authoritativeness — 권위]\n  공식 기관 데이터를 문장 안에 녹임. 공식 버튼 1~2개 배치.\n\n[Trustworthiness — 신뢰]\n  면책조항 필수. 단점/한계 노출. Schema JSON-LD 강화.\n\n\n════════════════════════════════════════\n  PART K — SEO & 애드센스 수익 최적화\n════════════════════════════════════════\n\nSEO: h1 1개, h2 6~7개 키워드 포함, 리치 스니펫 노출 목표.\n수수익: h2 간격 48px, 이미지 4개 전략 배치, 4,000자+ 분량 확보.\n\n\n════════════════════════════════════════\n  PART L — YMYL 안전 규칙\n════════════════════════════════════════\n\n건강, 재무, 법률, 안전 주제 시 직접 조언 금지. 전문가 상담 권장 문구 및 공식 보더 보강. 분량 1,000자 가산.\n\n\n════════════════════════════════════════\n  PART M — 상품/서비스 리뷰 추가 규칙\n════════════════════════════════════════\n\n장단점 각 2개, 활용 시나리오, 추천 대상, 가격 대비 가치, 경쟁 제품 비교 포함.\n\n\n════════════════════════════════════════\n  PART N — 최종 검증 (2단계)\n════════════════════════════════════════\n\n[사전 설계] PRE 1~8 (의도 판별, 리서치, 구조 확정)\n[사후 검수] POST 1~15 (구조, 금지 표현, 박스 규칙, EEAT, URL, 분량 체크)\n\n\n════════════════════════════════════════\n  PART O — 실행\n════════════════════════════════════════\n\n형식:\n  마크다운 코드블록(```) 안에 HTML 소스코드 (<h1>로 시작)\n  코드블록 바깥에만: 🔗 클러스터 키워드, 📎 퍼머링크, 🏷 라벨, 📝 검색 설명, 🖼 이미지 프롬프트\n\n# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n# [VUE STUDIO ULTIMATE ADD-ON: ADDITIONAL RULES]\n# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1. **페르소나 최적화**: 전문가 톤을 유지하되, 어미를 더 친근한 구어체(\"~거든요\", \"~더라고요\", \"~인 거예요\", \"~잖아요\")로 변형하라.\n2. **분량 하한선 강제**: 순수 한글 텍스트 기준 4,000자 미만 작성 금지.\n3. **마크다운 완전 금지**: 본문 내 별표(*)나 샵(#) 기호 절대 금지.\n4. **FAQ 확장**: 반드시 8~10개의 고품질 FAQ를 생성하라.\n5. **강제 서사 3대 요소**: 실패/후회담 1건, 비교 분석 1건, 업계 비밀 폭로 1건 필수 포함.\n6. **JSON 한 줄 출력**: content 내부에 물리적 줄바꿈 절대 금지.";
const STYLE = "<style>\n  @import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700&display=swap');\n  \n  /* 전역 컨테이너 */\n  .vue-premium { \n    font-family: 'Pretendard', sans-serif; \n    color: #334155; \n    line-height: 1.85; \n    font-size: 17px; \n    max-width: 840px; \n    margin: 0 auto; \n    padding: 40px 24px; \n    word-break: keep-all; \n    background-color: #ffffff;\n  }\n  \n  /* 본문 텍스트 */\n  .vue-premium p { \n    margin: 30px 0; \n    letter-spacing: -0.015em; \n  }\n  \n  /* H2 (섹션 제목) - 그라데이션 및 세련된 디자인 */\n  .vue-premium h2 { \n    font-size: 28px; \n    font-weight: 800; \n    color: #0f172a; \n    margin: 80px 0 35px; \n    display: flex;\n    align-items: center;\n    gap: 12px;\n  }\n  .vue-premium h2::before {\n    content: '';\n    display: block;\n    width: 6px;\n    height: 32px;\n    background: linear-gradient(to bottom, #3b82f6, #6366f1);\n    border-radius: 4px;\n  }\n  \n  /* H3 (소제목) */\n  .vue-premium h3 {\n    font-size: 22px;\n    font-weight: 700;\n    color: #1e293b;\n    margin: 45px 0 20px;\n    display: flex;\n    align-items: center;\n  }\n\n  /* 목차 상자 - 사이버네틱 라지 스타일 */\n  .toc-box { \n    background: #f1f5f9; \n    border: 1px solid #e2e8f0; \n    border-radius: 16px; \n    padding: 30px 35px; \n    margin: 45px 0; \n    box-shadow: inset 0 2px 4px rgba(255,255,255,0.8), 0 10px 15px -3px rgba(0,0,0,0.03);\n  }\n  .toc-box h3 {\n    margin-top: 0;\n    color: #334155;\n    font-size: 19px;\n    margin-bottom: 20px;\n  }\n  .toc-box ul {\n    margin: 0;\n    padding-left: 15px;\n    list-style: none;\n  }\n  .toc-box li {\n    margin-bottom: 12px;\n    position: relative;\n    padding-left: 18px;\n  }\n  .toc-box li::before {\n    content: '→';\n    position: absolute;\n    left: 0;\n    color: #6366f1;\n    font-weight: bold;\n  }\n  .toc-box a {\n    color: #475569;\n    text-decoration: none;\n    font-weight: 500;\n    transition: all 0.2s;\n  }\n  .toc-box a:hover {\n    color: #6366f1;\n    transform: translateX(4px);\n    display: inline-block;\n  }\n\n  /* 팁 & 경고 상자 - 더 세련된 디자인 */\n  .tip-box, .warn-box { \n    border-radius: 16px; \n    padding: 24px 28px; \n    margin: 40px 0; \n    position: relative;\n    overflow: hidden;\n  }\n  .tip-box { \n    background: #f0fdf4; \n    border: 1px solid #dcfce7;\n    color: #166534;\n  }\n  .tip-box::after {\n    content: '💡';\n    position: absolute;\n    top: 15px;\n    right: 20px;\n    font-size: 24px;\n    opacity: 0.3;\n  }\n  .warn-box { \n    background: #fff1f2; \n    border: 1px solid #ffe4e6;\n    color: #991b1b;\n  }\n  .warn-box::after {\n    content: '🚨';\n    position: absolute;\n    top: 15px;\n    right: 20px;\n    font-size: 24px;\n    opacity: 0.3;\n  }\n\n  /* 테이블 - 모던 & 클린 */\n  .vue-premium table { \n    width: 100%; \n    border-collapse: separate; \n    border-spacing: 0;\n    margin: 45px 0; \n    border-radius: 16px; \n    overflow: hidden; \n    border: 1px solid #f1f5f9;\n    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05);\n  }\n  .vue-premium th { \n    background: #f8fafc; \n    color: #475569; \n    padding: 20px; \n    font-weight: 700; \n    text-transform: uppercase;\n    font-size: 14px;\n    letter-spacing: 0.05em;\n  }\n  .vue-premium td { \n    padding: 18px 20px; \n    color: #64748b;\n    border-top: 1px solid #f1f5f9;\n  }\n  .vue-premium tr:hover td {\n    background-color: #f8fafc;\n  }\n\n  /* FAQ 스타일 */\n  .faq-section {\n    margin: 60px 0;\n  }\n  .faq-item {\n    margin-bottom: 20px;\n    border: 1px solid #e2e8f0;\n    border-radius: 12px;\n    padding: 20px;\n    background: #ffffff;\n  }\n  .faq-q {\n    font-weight: 700;\n    color: #0f172a;\n    display: flex;\n    gap: 10px;\n    margin-bottom: 10px;\n  }\n  .faq-q::before { content: 'Q.'; color: #3b82f6; }\n  .faq-a {\n    color: #475569;\n    font-size: 15px;\n    padding-left: 28px;\n  }\n\n  /* 클러스터 버튼 - 압도적 클릭 유도 */\n  .cluster-btn { \n    display: flex; \n    align-items: center;\n    justify-content: center;\n    background: linear-gradient(135deg, #1e293b, #0f172a); \n    color: #ffffff !important; \n    padding: 18px 30px; \n    border-radius: 14px; \n    text-decoration: none !important; \n    font-weight: 700; \n    font-size: 18px;\n    margin: 40px 0; \n    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15); \n    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); \n    width: 100%;\n    box-sizing: border-box;\n  }\n  .cluster-btn:hover {\n    transform: translateY(-4px) scale(1.01);\n    box-shadow: 0 20px 30px -10px rgba(0,0,0,0.25);\n    background: linear-gradient(135deg, #334155, #1e293b);\n  }\n  \n  /* 인용구 */\n  .vue-premium blockquote {\n    margin: 40px 0;\n    padding: 25px 30px;\n    background: linear-gradient(to right, #f8fafc, #ffffff);\n    border-left: 6px solid #cbd5e1;\n    border-radius: 0 16px 16px 0;\n    color: #475569;\n    font-style: italic;\n    font-size: 18px;\n  }\n  \n  /* 강조 텍스트 (하이라이트) */\n  .vue-premium strong {\n    color: #0f172a;\n    background: linear-gradient(120deg, #e0e7ff 0%, #e0e7ff 100%);\n    background-repeat: no-repeat;\n    background-size: 100% 35%;\n    background-position: 0 90%;\n    padding: 0 2px;\n  }\n\n  /* 이미지 */\n  .vue-premium img {\n    max-width: 100%;\n    height: auto;\n    display: block;\n    margin: 50px auto;\n    border-radius: 20px;\n    box-shadow: 0 20px 40px -15px rgba(0,0,0,0.12);\n  }\n\n  @media (max-width: 768px) {\n    .vue-premium { padding: 30px 18px; font-size: 15px; }\n    .vue-premium h2 { font-size: 24px; margin: 60px 0 30px; }\n    .vue-premium h3 { font-size: 20px; }\n    .cluster-btn { padding: 16px 20px; font-size: 16px; }\n    .toc-box { padding: 25px; }\n  }\n</style>\n<div class=\"vue-premium\">";
const NARRATIVE_HINTS = ["실전 경험이 왜 중요한지 제가 직접 몸소 느꼈던 이야기를 해보려 합니다. 이론만 알 때는 몰랐던 진짜 현장의 목소리가 있더라고요.","솔직히 고백하자면 저도 처음엔 시간 낭비를 엄청나게 했습니다. 이 방법을 몰라서 며칠 밤을 꼬박 새우며 헛수고를 했던 기억이 나네요.","지금 이 글을 읽는 분들이 느끼실 그 막막함, 저도 누구보다 잘 압니다. 처음에 저도 컴퓨터 앞에서 어디서부터 손을 대야 할지 몰라 한참을 멍하니 있었거든요.","결국 정답은 아주 가까운 개인적인 경험에 있더라고요. 수많은 기교를 부리다가 결국 다시 처음으로 돌아와서야 비로소 깨달은 핵심을 공유합니다.","많은 전문가들이 말하지 않는 맹점이 하나 있습니다. 겉으로 보기엔 완벽해 보이지만, 실제로는 치명적인 허점이 숨겨져 있는 그런 부분들이죠.","이 고민 때문에 며칠 동안 밤잠을 설쳤던 것 같아요. 어떻게 하면 더 효율적이고 정확하게 처리할 수 있을까 고민하다 찾아낸 비책입니다.","제가 겪은 뼈아픈 실패의 기록이 여러분께는 소중한 교훈이 되었으면 합니다. 제 돈과 시간을 버려가며 얻어낸 '진짜' 데이터들입니다.","제 초보 시절을 떠올려보고 싶습니다. 그때 제가 지금의 저를 만났다면 제 고생이 훨씬 줄어들었을 텐데 말이죠.","요즘 들어 제게 가장 자주 물어보시는 질문들을 하나로 모았습니다. 사실 다들 비슷비슷한 부분에서 고민하고 계시다는 걸 알게 됐거든요."];

let reportContent = '# 🚀 VUE Cluster Deployment Report\n\n'; 
reportContent += `📅 **Generated at:** ${new Date().toLocaleString('ko-KR')}\n\n`;

function report(msg, type = 'info') {
    const now = new Date().toLocaleTimeString('ko-KR');
    const prefix = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
    const line = `[${now}] ${prefix} ${msg}`;
    console.log(line);
    reportContent += line + '  \n';
}

async function uploadReport() {
    if(!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return;
    try {
        const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
        const path = 'DEPLOYMENT_REPORT.md';
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers = { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' };
        const existing = await axios.get(url, { headers }).catch(() => null);
        const sha = existing ? existing.data.sha : undefined;
        await axios.put(url, { message: 'Update Deployment Report', content: Buffer.from(reportContent).toString('base64'), sha }, { headers });
        console.log('📄 [REPORT]: DEPLOYMENT_REPORT.md 업로드 완료.');
    } catch(e) { console.log('⚠️ [REPORT ERROR]: ' + e.message); }
}

function clean(raw, defType = 'obj') {
    if(!raw) return defType === 'text' ? '' : (defType === 'obj' ? '{}' : '[]');
    let t = raw.replace(/\`\`\`(json|html|javascript|js)?/gi, '').trim();
    if (defType === 'text') return t.trim();
    try {
        const start = t.indexOf('{'), end = t.lastIndexOf('}');
        const startArr = t.indexOf('['), endArr = t.lastIndexOf(']');
        let jsonStr = '';
        if (defType === 'obj' && start !== -1 && end !== -1) jsonStr = t.substring(start, end + 1);
        else if (defType === 'arr' && startArr !== -1 && endArr !== -1) jsonStr = t.substring(startArr, endArr + 1);
        if (jsonStr) {
            jsonStr = jsonStr.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '');
            return jsonStr;
        }
    } catch(e) { }
    return defType === 'obj' ? '{ }' : '[]';
}

async function callAI(model, prompt, retry = 0, delay = Math.random() * 2000 + 1000) {
    try {
        const r = await model.generateContent('[SYSTEM: ACT AS A TOP-TIER BLOGGER.]\\n' + prompt);
        return r.response.text().trim();
    } catch (e) {
        if (String(e.message).includes('429') && retry < 5) {
            const jitter = Math.random() * 1000;
            const nextDelay = delay * 2 + jitter;
            report(`   ⏳ [API 429 감지] 제미나이 비율 제한. ${Math.round(nextDelay/1000)}초 후 백오프 재시도... (${retry+1}/5회)`);
            await new Promise(res => setTimeout(res, nextDelay));
            return callAI(model, prompt, retry + 1, nextDelay);
        }
        return '';
    }
}

async function searchSerper(query) {
    if(!process.env.SERPER_API_KEY) return '';
    try {
        const r = await axios.post('https://google.serper.dev/search', { q: query, gl: 'kr', hl: 'ko' }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } });
        return r.data.organic.slice(0, 5).map(o => o.title + ': ' + o.snippet).join('\n');
    } catch(e) { return ''; }
}

async function genThumbnail(meta, model) {
    try {
        report('🎨 [IMG_0]: 썸네일 제작 시작 (주제: ' + meta.mainTitle + ')');
        const bgUrl = await genImg(meta.bgPrompt, model, 0, true);
        const canvas = createCanvas(1200, 630);
        const ctx = canvas.getContext('2d');
        const bg = await loadImage(bgUrl);
        
        // 배경 그리기 & 오버레이
        ctx.drawImage(bg, 0, 0, 1200, 630);
        const grad = ctx.createLinearGradient(0, 0, 800, 0);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 630);
        
        // 사이드 바 디자인
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, 0, 8, 630);
        
        // 태그 라벨
        const tag = (meta.tag || 'EXCLUSIVE').toUpperCase();
        ctx.font = 'bold 28px "Malgun Gothic", "Apple SD Gothic Neo", "NanumGothic", sans-serif';
        const tagWidth = ctx.measureText(tag).width;
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(60, 80, tagWidth + 30, 45);
        ctx.fillStyle = '#fff'; ctx.fillText(tag, 75, 112);
        
        // 메인 타이틀 (그림자 효과 포함)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 82px "Malgun Gothic", "Apple SD Gothic Neo", "NanumGothic", sans-serif';
        const mainTitle = meta.mainTitle || 'No Title';
        // 두 줄 처리
        const words = mainTitle.split(' ');
        let line1 = '', line2 = '';
        if(words.length > 3) {
            line1 = words.slice(0, 3).join(' ');
            line2 = words.slice(3).join(' ');
        } else { line1 = mainTitle; }
        
        ctx.fillText(line1, 70, 240);
        if(line2) ctx.fillText(line2, 70, 340);
        
        // 서브 타이틀
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#cbd5e1'; ctx.font = '36px "Malgun Gothic", "Apple SD Gothic Neo", "NanumGothic", sans-serif';
        ctx.fillText(meta.subTitle || '', 75, line2 ? 430 : 330);
        
        const buffer = canvas.toBuffer('image/jpeg');
        const form = new FormData(); form.append('image', buffer.toString('base64'));
        const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, {headers: form.getHeaders() });
        return ir.data.data.url;
    } catch(e) { report('⚠️ [썸네일 오류]: ' + e.message, 'error'); return ''; }
}

async function genImg(prompt, model, i, skipUpload = false) {
    if(!prompt) return '';
    const engPrompt = prompt.replace(/[^a-zA-Z0-9, ]/gi, '').trim() + ', hyper-realistic, 8k';
    let url = '';
    if(process.env.KIE_API_KEY) {
        try {
            console.log('      [IMG] Kie.ai z-image 모델 호출 중...');
            const cr = await axios.post('https://api.kie.ai/api/v1/jobs/createTask', {
                model: 'z-image',
                input: { prompt: engPrompt, aspect_ratio: '16:9' }
            }, { headers: { Authorization: 'Bearer ' + process.env.KIE_API_KEY } });
            const tid = cr.data.taskId || cr.data.data?.taskId;
            if(tid) {
                for(let a=0; a<15; a++) {
                    await new Promise(r => setTimeout(r, 6000));
                    const pr = await axios.get('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + tid, { headers: { Authorization: 'Bearer ' + process.env.KIE_API_KEY } });
                    const state = pr.data.state || pr.data.data?.state;
                    if(state === 'success') {
                        const resData = pr.data.resultJson || pr.data.data?.resultJson;
                        const resJson = typeof resData === 'string' ? JSON.parse(resData) : resData;
                        url = resJson.resultUrls[0];
                        break;
                    }
                    if(state === 'fail' || state === 'failed') break;
                }
            }
        } catch(e) { console.log('      ⚠️ [Kie.ai z-image 실패]: ' + e.message); }
    }
    if(!url) url = `https://image.pollinations.ai/prompt/${encodeURIComponent(engPrompt)}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random()*1000)}`;
    if(skipUpload || !process.env.IMGBB_API_KEY) return url;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        const form = new FormData(); form.append('image', Buffer.from(res.data).toString('base64'));
        const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, {headers: form.getHeaders() });
        return ir.data.data.url;
    } catch(e) { return url; }
}

async function writeAndPost(model, target, lang, blogger, bId, pTime, extraLinks = [], idx, total) {
    const searchData = await searchSerper(target);
    let clusterContext = '';
    if(extraLinks.length > 0) {
        clusterContext = '\\n[CLUSTER_HUB] 메인 글 작성 중. 제공된 서브 글들의 링크가 총 ' + extraLinks.length + '개 있습니다.\\n★ 중요 규칙: 모든 링크를 한 섹션에 몰아넣지 말고, 본문 2번 섹션부터 7번 섹션까지 사이사이에 골고루 분산 배치하여 [5-10] 프리미엄 버튼 형식으로 삽입하시오.\\n링크 목록: ' + JSON.stringify(extraLinks);
    }
    const langTag = `\\n[TARGET_LANGUAGE]: ${lang === 'ko' ? 'Korean' : 'English'}`;
    report(`🔥 [포스팅 ${idx}/${total}]: '${target}' 집필 및 발행 시작...`);
    const m1 = await callAI(model, MASTER_GUIDELINE + '\\n[MISSION: PART 1] ' + target + '의 최상단 썸네일(IMG_0), H1 제목, 전체 목차(TOC), 그리고 전반부 핵심 본문(전체 6~8개 섹션 중 첫 3~4개 섹션)까지만 작성하라.' + clusterContext + '\\n' + searchData + '\\n★ 제약: 반드시 HTML 태그가 완벽하게 닫힌 상태(문단이나 섹션의 끝)에서 PART 1을 종료할 것.' + langTag);
    report(`   - 미션 1 완료 (${m1.length}자)`);
    let cleanM1 = m1.replace(/\`\`\`(html|json|javascript|js)?/gi, '').replace(/\n네, 이어서.*?하겠습니다\./gi, '').trim();
    const m2 = await callAI(model, MASTER_GUIDELINE + '\\n[이전 파트 1 내용 (참고용)]: \\n' + cleanM1 + '\\n\\n[MISSION: PART 2] (매우 중요) 위 파트 1의 내용에 끊기지 않고 바로 이어지도록 나머지 후반부 본문(전체 6~8개 섹션 중 남은 H2 섹션들)과 FAQ, 결론을 작성하라.\\n★ 절대 규칙: 앞서 작성된 파트 1의 내용을 절대 중복해서 다시 쓰지 마라. H1, IMG_0, TOC 등은 이미 파트 1에 있으므로 절대 생성 금지! 서론이나 인사말 금지! 마크다운(```html) 금지! 파트 1의 마지막 내용 바로 다음 <h2> 태그부터 순수 HTML 코드만 이어나갈 것.' + langTag);
    report(`   - 미션 2 완료 (${m2.length}자)`);
    let cleanM2 = m2.replace(/\`\`\`(html|json|javascript|js)?/gi, '').replace(/^네[,\s]+이어서.*?하겠습니다\.?/i, '').replace(/<h1.*?>.*?<\/h1>/gi, '').replace(/<div[^>]*class=['"]toc-box["'][\s\S]*?<\/div>/gi, '').trim();
    const fullRaw = cleanM1 + '\n' + cleanM2;
    let finalHtml = fullRaw;

    // [IMG_0 썸네일 추출 및 제거]
    const m0Match = finalHtml.match(/IMG_0:[\s\S]*?\{([\s\S]*?)\}/i);
    let m0 = null;
    if (m0Match) {
        const rawMeta = m0Match[1];
        m0 = {
            mainTitle: (rawMeta.match(/mainTitle:\s*['"](.*?)['"]/i) || [])[1] || target,
            subTitle: (rawMeta.match(/subTitle:\s*['"](.*?)['"]/i) || [])[1] || '',
            tag: (rawMeta.match(/tag:\s*['"](.*?)['"]/i) || [])[1] || 'NEWS',
            bgPrompt: (rawMeta.match(/bgPrompt:\s*['"](.*?)['"]/i) || [])[1] || target
        };
        finalHtml = finalHtml.replace(m0Match[0], '').trim();
    }

    // [IMG_1~10 메타데이터 추출 및 제거]
    const imgMetas = {};
    for (let i = 1; i <= 10; i++) {
        const imgMatch = finalHtml.match(new RegExp('IMG_' + i + ':[\\s\\S]*?\\{([\\s\\S]*?)\\}', 'i'));
        if (imgMatch) {
            const rawMeta = imgMatch[1];
            imgMetas[i] = {
                prompt: (rawMeta.match(/prompt:\s*['"](.*?)['"]/i) || [])[1] || (target + ' ' + i),
                alt: (rawMeta.match(/alt:\s*['"](.*?)['"]/i) || [])[1] || target,
                title: (rawMeta.match(/title:\s*['"](.*?)['"]/i) || [])[1] || target
            };
            finalHtml = finalHtml.replace(imgMatch[0], '').trim();
        }
    }

    // [H1 제목 추출 및 본문에서 제거]
    let finalTitle = target;
    const h1Match = finalHtml.match(/<h1.*?>([\\s\\S]*?)<\/h1>/i);
    if (h1Match) {
        finalTitle = h1Match[1].replace(/<[^>]+>/g, '').trim() || target;
        finalHtml = finalHtml.replace(h1Match[0], '');
    }

    // [본문 상단 파편 및 중복 제목 제거]
    // 1. 리터럴 '\n' 스트링 및 마크다운 표시자 제거
    finalHtml = finalHtml.replace(/^(?:\\n|[\s\*#])+/g, '').trim();
    
    // 2. 추출된 제목이 본문 최상단에 생텍스트로 또 있는 경우 제거
    if (finalTitle && finalTitle !== target) {
        const escapedT = finalTitle.replace(/[.*+?^${}()|[\\s\]\\/]/g, '\\$&');
        const leadReg = new RegExp('^' + escapedT + '[\\s\\*#]*', 'i');
        finalHtml = finalHtml.replace(leadReg, '').trim();
    }

    // [썸네일 플레이스홀더 강제 보정] - 본문에 없으면 최상단에 강제 삽입
    if (m0 && !finalHtml.includes('[[IMG_0]]')) {
        finalHtml = '[[IMG_0]]\\n' + finalHtml;
    }

    // [IMG_0 썸네일 실제 생성 및 치환]
    if (m0 && finalHtml.includes('[[IMG_0]]')) {
        const url0 = await genThumbnail(m0, model);
        finalHtml = finalHtml.split('[[IMG_0]]').join(`<img src='${url0}' alt='${m0.mainTitle}' style='width:100%; border-radius:15px; margin-bottom:40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);'>`);
    }

    // [IMG_1~10 보충 이미지 실제 생성 및 치환]
    for (let i = 1; i <= 10; i++) {
        if (finalHtml.includes('[[IMG_' + i + ']]')) {
            const meta = imgMetas[i] || { prompt: target + ' ' + i, alt: target, title: target };
            const urlI = await genImg(meta.prompt, model, i);
            finalHtml = finalHtml.split('[[IMG_' + i + ']]').join(`<img src='${urlI}' alt='${meta.alt}' title='${meta.title}' style='width:100%; border-radius:12px; margin:35px 0; box-shadow: 0 5px 15px rgba(0,0,0,0.08);'>`);
        }
    }

    // [최종 청소: 처리되지 않은 모든 이미지 태그 제거]
    finalHtml = finalHtml.replace(/\\[\\[IMG_\\d+\\]\\]/gi, '');

    finalHtml = clean(finalHtml, 'text');
    const post = await blogger.posts.insert({ blogId: bId, requestBody: { title: finalTitle, content: STYLE + finalHtml + '<\\/div>', published: pTime.toISOString() } });
    report(`✨ [완료]: '${finalTitle}' 블로그 게시 성공!`, 'success');
    return { title: finalTitle, url: post.data.url };
}

async function run() {
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });

    // 1단계: 이번 회차에 작업할 단 하나의 키워드 랜덤 선정
    let baseKeyword = '';
    if (config.pillar_topic && config.pillar_topic !== '자동생성') {
        baseKeyword = config.pillar_topic.trim();
    } else {
        const list = (config.clusters || []).length > 0 ? config.clusters : ['생활 정보'];
        baseKeyword = list[Math.floor(Math.random() * list.length)];
    }

    report(`🎯 이번 회차 타겟 키워드 선정: ${baseKeyword}`);
    report(`🚀 1개 키워드에 대한 풀 클러스터(메인1+서브4) 작업을 시작합니다.`);
    
    const entropy = new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    const mainTopicPrompt = `[ID: ${entropy}]\\n키워드: \"${baseKeyword}\"\\n위 키워드를 다루는 블로그 '메인 허브 포스트'의 제목을 1개 생성하라.\\n★ 중요: 입력이 영어여도 결과 제목은 반드시 '한국어'로 출력하라.\\n★ 2026년 최신 제약 엄수 (클릭률 극대화 필수 규칙):\\n1. '상위 1%', '10년차', '7가지' 등 구체적인 숫자를 무조건 포함할 것.\\n2. '이거 모르면 손해', '충격 진실', '절대 하지마라' 등 손실 회피(FOMO) 심리를 자극할 것.\\n3. 전체를 아우르는 '완벽 종결판', '총정리' 느낌을 엣지있게 표현할 것.\\n- 25~45자 내외. 따옴표 없이 텍스트만 출력.`;
    const seed = await callAI(model, mainTopicPrompt) || baseKeyword;

    report(`🎯 메인 주제 선정: ${seed}`);
    report(`🔎 세부 전문 주제(Spoke) 4종 추출 중...`);
    const subTopicsPrompt = `메인 주제: \"${seed}\"\\n위 주제를 보완할 구체적이고 전문적인 세부 주제 4개를 생성하라.\\n★ 중요: 결과는 반드시 '한국어'로 출력(주제1, 주제2, 주제3, 주제4)하라.\\n- 예: 컴퓨터 수리 -> 가장 흔한 고장 원인, 절대 하지 말아야 할 실수 3가지, 수리비 덤탱이 피하는 법, 셀프 응급조치법\\n- 출력 형식: 주제1, 주제2, 주제3, 주제4 (반드시 콤마로만 구분, 다른 부연 설명 금지)`;
    const subTopicsRaw = await callAI(model, subTopicsPrompt);
    const subTopicBaseList = subTopicsRaw.split(/[\\n,]+/).map(t => t.replace(/^\\d+\\.\\s*/, '').trim()).filter(Boolean).slice(0, 4);

    const subLinks = [];
    const clusterVibes = [
        ' 실전 해결 전략 및 뼈아픈 실패담',
        ' 10년차 전문가가 공개하는 절대 하지 말아야 할 행동',
        ' 돈과 시간을 완벽하게 지키는 기적의 체크리스트',
        ' 수리비 0원 도전! 당신이 몰랐던 완벽 응급 처치 가이드'
    ].sort(() => 0.5 - Math.random());

    // [인간미 넘치는 랜덤 예약 시스템: 80분 ~ 180분 간격]
    let currentPubTime = Date.now();
    const getRandOffset = () => (Math.floor(Math.random() * (180 - 80 + 1)) + 80) * 60 * 1000;

    for (let i = 0; i < 4; i++) {
        currentPubTime += getRandOffset();
        const baseSub = subTopicBaseList[i] || (baseKeyword + ' 관련 정보 ' + (i + 1));
        const subTitlePrompt = `주제: \"${baseSub}\"\\n방금 위 세부 주제로 블로그 클릭률(CTR)을 폭발시킬 가장 자극적이고 전문적인 후킹 제목을 '딱 1개'만 생성하라.\\n★ 중요: 반드시 '한국어'로 출력하라.\\n- 문제 해결 약속, 강렬한 혜택(돈, 시간 이득), 부정적 금지어(절대, 피하는 법) 활용.\\n- 20~35자 내외. 여러 개 나열 금지, 부연 설명 금지, 따옴표 없이 딱 1줄 텍스트만 출력.`;
        let targetSub = await callAI(model, subTitlePrompt);
        targetSub = targetSub ? targetSub.split('\\n')[0].replace(/^\\d+\\.\\s*/, '').replace(/[\"\']/g, '').trim() : '';
        if(!targetSub) targetSub = baseSub + clusterVibes[i % clusterVibes.length];
        
        const res = await writeAndPost(model, targetSub, 'ko', blogger, config.blog_id, new Date(currentPubTime), [], i + 1, 5);
        if(res && res.url) subLinks.push(res);
    }

    report('🏆 모든 정보가 집결된 메인 필러 포스트(허브) 집필 시작...');
    currentPubTime += getRandOffset();
    await writeAndPost(model, seed, 'ko', blogger, config.blog_id, new Date(currentPubTime), subLinks, 5, 5);
    
    report(`✅ [클러스터 완료]: ${baseKeyword} (총 5개 포스팅 완료)`);
    report('\n🌈 선택된 키워드 클러스터 작업이 성공적으로 종료되었습니다.', 'success');
    await uploadReport();
}
run();