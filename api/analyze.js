// ============================================================
// api/analyze.js — Vercel Serverless Function
// 관상(이미지 기반) + 사주 궁합(생년월일 2인) + 오늘의 운세(생년월일 1인) 라우팅
// Gemini 우선 호출, 실패 시에만 Claude로 자동 폴백
// ============================================================
// 필요 환경변수:
//   ANTHROPIC_API_KEY - console.anthropic.com
//   GEMINI_API_KEY    - aistudio.google.com/apikey
//
// 요청 body:
//   { type: 'gwansang', base64Image, mediaType, optionalInfo? }
//   { type: 'gunghap',  personA: {name, birthdate, birthtime}, personB: {...} }
//   { type: 'unse',     person: {name, birthdate, birthtime} }
// ============================================================

// import { kv } from '@vercel/kv'; // 하루 카운터 정확히 세려면 연결 권장

const DAILY_LIMIT = 50;
let fallbackCounter = { date: '', count: 0 };

const GWANSANG_SYSTEM_PROMPT = `너는 전통 관상가 컨셉의 유머러스한 캐릭터야. 업로드된 얼굴 사진을 실제 관상학 이론의 부위별 해석 틀에 빗대어 풀이하되, 과장되고 웃긴 엔터테인먼트 톤으로 작성해.
규칙:
- 절대 진지한 예측이나 실제 성격/미래 진단으로 오해되지 않게, 항상 과장되고 유쾌한 톤 유지 (오락 목적의 창작임을 전제)
- 실제 관상학의 부위별 해석 틀을 참고해서 그럴듯하게 풀이할 것:
  이마=초년운·관운·지혜 / 눈썹=형제운·인복 / 눈=총명함·마음씨 / 코=재물운·중년운 / 입·입술=식복·애정운 / 턱=말년운·안정감
- 결과는 항상 좋게만 몰아가지 말고, 과장된 행운·황당한 불운·엉뚱한 반전 등 다양한 톤을 예측 불가능하게 섞어서 작성
- 단, "불운"도 귀엽고 웃긴 소소한 해프닝 수준으로만(예: 지갑 어디 뒀는지 까먹을 상, 라면 먹다 국물 흘릴 상) — 외모 평가, 성격 비하, 진짜 기분 상할 수 있는 표현은 절대 금지. 나이/인종/성별 추측도 금지
- 반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이, 코드블록 마크다운 없이):
{
  "title": "이 사람을 한마디로 표현하는 재밌는 별명",
  "features": [
    {"part": "이마", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"},
    {"part": "눈", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"},
    {"part": "코", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"},
    {"part": "입", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"}
  ],
  "fortune_score": "0~100 사이 숫자 + '점'",
  "fortune_text": "오늘의 총운 2~3문장"
}`;

const GUNGHAP_SYSTEM_PROMPT = `너는 전통 사주명리가 컨셉의 유머러스한 캐릭터야. 두 사람의 생년월일(및 태어난 시각, 있는 경우)을 바탕으로 실제 사주명리학 개념(오행 상생상극, 십이지 띠 궁합, 음양 조화 등)에 빗대어 재미있는 궁합 풀이를 작성해.
규칙:
- 절대 진지한 예측이나 실제 관계 진단으로 오해되지 않게, 항상 과장되고 유쾌한 톤 유지 (오락 목적의 창작임을 전제)
- 오행(목화토금수) 상생상극, 십이지 띠 궁합, 음양 조화 같은 실제 사주 개념을 그럴듯하게 활용
- 궁합 지수는 항상 높게만 몰아가지 말고, 아주 좋음부터 애매한 케미까지 다양하게 예측 불가능하게 작성 (단, 0점대의 극단적으로 부정적인 결과는 피하고 최소한의 재미 요소는 남길 것)
- "다툼 포인트"도 귀엽고 웃긴 소소한 수준으로만 — 인신공격, 진짜 기분 상할 표현은 절대 금지
- 반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이, 코드블록 마크다운 없이):
{
  "title": "이 커플/케미를 한마디로 표현하는 재밌는 별명",
  "features": [
    {"part": "케미 포인트", "emoji": "이모지", "text": "잘 맞는 부분 2문장 내외"},
    {"part": "다툼 포인트", "emoji": "이모지", "text": "귀엽게 부딪힐 수 있는 부분 2문장 내외"},
    {"part": "궁합 조언", "emoji": "이모지", "text": "재밌는 조언 2문장 내외"}
  ],
  "compatibility_score": "0~100 사이 숫자 + '점'",
  "summary": "종합 궁합평 2~3문장"
}`;

const UNSE_SYSTEM_PROMPT = `너는 전통 사주명리가 컨셉의 유머러스한 캐릭터야. 한 사람의 생년월일(및 태어난 시각, 있는 경우)과 오늘 날짜를 바탕으로, 실제 사주명리학 개념(오행, 십이지 띠, 일진 등)에 빗대어 "오늘 하루"의 운세를 재미있게 풀이해.
규칙:
- 절대 진지한 예측이나 실제 미래 진단으로 오해되지 않게, 항상 과장되고 유쾌한 톤 유지 (오락 목적의 창작임을 전제)
- 오행(목화토금수), 십이지 띠, 일진 같은 실제 사주 개념을 그럴듯하게 활용
- 총운은 항상 좋게만 몰아가지 말고, 과장된 행운·귀엽고 웃긴 소소한 불운·엉뚱한 반전 등을 예측 불가능하게 섞어서 작성
- "불운"도 귀엽고 웃긴 소소한 해프닝 수준으로만 — 외모 평가, 성격 비하, 진짜 기분 상할 수 있는 표현은 절대 금지. 나이/인종/성별 추측도 금지
- 반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이, 코드블록 마크다운 없이):
{
  "title": "오늘 이 사람의 하루를 한마디로 표현하는 재밌는 별명",
  "features": [
    {"part": "총운", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"},
    {"part": "재물운", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"},
    {"part": "연애운", "emoji": "이모지", "text": "재밌는 풀이 2문장 내외"},
    {"part": "행운 아이템", "emoji": "이모지", "text": "오늘의 행운 아이템/컬러와 이유 2문장 내외"}
  ],
  "fortune_score": "0~100 사이 숫자 + '점'",
  "fortune_text": "오늘의 총평 2~3문장"
}`;

function parseJsonLoose(text) {
  return JSON.parse(text.trim().replace(/```json|```/g, '').trim());
}

function buildGwansangUserText(optionalInfo) {
  const base = '이 사진 속 인물의 관상을 재미있게 봐줘. JSON으로만 답해.';
  if (!optionalInfo) return base;
  const { name, birthdate, birthtime, birthplace } = optionalInfo;
  if (!name && !birthdate && !birthtime && !birthplace) return base;
  return base + `\n\n참고로 다음 정보도 함께 제공됨(있는 항목만 반영): 이름=${name || '미상'}, 생년월일=${birthdate || '미상'}, 태어난시각=${birthtime || '미상'}, 태어난장소=${birthplace || '미상'}. 생년월일이 있다면 사주(오행/십이지) 개념도 살짝 곁들여줘.`;
}

function buildGunghapUserText(personA, personB) {
  return `사람A: 이름=${personA.name}, 생년월일=${personA.birthdate}, 태어난시각=${personA.birthtime || '미상'}
사람B: 이름=${personB.name}, 생년월일=${personB.birthdate}, 태어난시각=${personB.birthtime || '미상'}
이 두 사람의 사주 궁합을 재미있게 봐줘. JSON으로만 답해.`;
}

function buildUnseUserText(person) {
  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  return `오늘 날짜(한국 기준): ${today}
이 사람의 정보: 이름=${person.name || '미상'}, 생년월일=${person.birthdate}, 태어난시각=${person.birthtime || '미상'}
이 사람의 오늘 하루 운세를 재미있게 봐줘. JSON으로만 답해.`;
}

function systemPromptFor(type) {
  if (type === 'gwansang') return GWANSANG_SYSTEM_PROMPT;
  if (type === 'gunghap') return GUNGHAP_SYSTEM_PROMPT;
  return UNSE_SYSTEM_PROMPT;
}

function userTextFor(payload) {
  if (payload.type === 'gwansang') return buildGwansangUserText(payload.optionalInfo);
  if (payload.type === 'gunghap') return buildGunghapUserText(payload.personA, payload.personB);
  return buildUnseUserText(payload.person);
}

// ---------------- Claude 호출 ----------------
async function callClaude(payload) {
  const messages = payload.type === 'gwansang'
    ? [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: payload.mediaType, data: payload.base64Image } },
          { type: 'text', text: userTextFor(payload) }
        ]
      }]
    : [{ role: 'user', content: userTextFor(payload) }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: systemPromptFor(payload.type),
      messages
    })
  });

  if (!response.ok) throw new Error('Claude API 오류: ' + response.status + ' ' + (await response.text()));
  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude 응답에 텍스트 블록 없음');
  return parseJsonLoose(textBlock.text);
}

// ---------------- Gemini 호출 ----------------
async function callGemini(payload) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const parts = payload.type === 'gwansang'
    ? [
        { inline_data: { mime_type: payload.mediaType, data: payload.base64Image } },
        { text: userTextFor(payload) }
      ]
    : [{ text: userTextFor(payload) }];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPromptFor(payload.type) }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { response_mime_type: 'application/json' }
    })
  });

  if (!response.ok) throw new Error('Gemini API 오류: ' + response.status + ' ' + (await response.text()));
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답 구조 이상: ' + JSON.stringify(data));
  return parseJsonLoose(text);
}

// ---------------- 핸들러 ----------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const today = new Date().toISOString().slice(0, 10);

  // ---- 하루 사용량 체크 (KV 사용 시 아래 두 줄로 교체) ----
  // let count = await kv.get(`usage:${today}`) || 0;
  // if (count >= DAILY_LIMIT) return res.status(429).json({ error: '오늘의 감정 횟수가 마감되었습니다. 내일 다시 찾아주세요 🙏' });

  if (fallbackCounter.date !== today) fallbackCounter = { date: today, count: 0 };
  if (fallbackCounter.count >= DAILY_LIMIT) {
    return res.status(429).json({ error: '오늘의 감정 횟수가 마감되었습니다. 내일 다시 찾아주세요 🙏' });
  }

  const payload = req.body || {};
  if (!['gwansang', 'gunghap', 'unse'].includes(payload.type)) {
    return res.status(400).json({ error: '알 수 없는 요청 타입입니다' });
  }
  if (payload.type === 'gwansang' && (!payload.base64Image || !payload.mediaType)) {
    return res.status(400).json({ error: '이미지 데이터가 없습니다' });
  }
  if (payload.type === 'gunghap' && (!payload.personA?.birthdate || !payload.personB?.birthdate)) {
    return res.status(400).json({ error: '생년월일 정보가 없습니다' });
  }
  if (payload.type === 'unse' && !payload.person?.birthdate) {
    return res.status(400).json({ error: '생년월일 정보가 없습니다' });
  }

  try {
    let result;
    let usedProvider = 'gemini';
    try {
      result = await callGemini(payload);
    } catch (primaryErr) {
      console.error('gemini 실패, claude로 폴백:', primaryErr.message);
      usedProvider = 'claude';
      result = await callClaude(payload);
    }

    // await kv.set(`usage:${today}`, count + 1, { ex: 60 * 60 * 24 }); // KV 버전
    fallbackCounter.count += 1;

    result._provider = usedProvider;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: '서버 오류가 발생했습니다', detail: err.message });
  }
}
