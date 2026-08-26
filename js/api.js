// ============================================================
// api.js — /api/analyze 프록시 호출 래퍼 (관상 / 궁합 / 오늘의 운세)
// ============================================================

async function postAnalyze(body) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || ('API 응답 오류 (' + response.status + ')'));
  }
  return response.json();
}

export function analyzeFace(base64Image, mediaType, optionalInfo) {
  const hasOptional = optionalInfo && (optionalInfo.name || optionalInfo.birthdate || optionalInfo.birthtime || optionalInfo.birthplace);
  return postAnalyze({
    type: 'gwansang',
    base64Image,
    mediaType,
    optionalInfo: hasOptional ? optionalInfo : undefined
  });
}

export function analyzeCompatibility(personA, personB) {
  return postAnalyze({ type: 'gunghap', personA, personB });
}

export function analyzeFortune(person) {
  return postAnalyze({ type: 'unse', person });
}
