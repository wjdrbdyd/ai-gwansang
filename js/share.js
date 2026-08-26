// ============================================================
// share.js — 결과 공유 링크 인코딩/디코딩 + 공유 액션
// 서버 저장 없이 URL 자체에 결과 데이터를 담는다 (LZ-String 압축).
//
// [수정 이력 1] compressToEncodedURIComponent()가 만드는 문자열에는 '+','$'가
// 섞여있는데, 이걸 URLSearchParams.set()에 넣으면 application/x-www-form-urlencoded
// 규칙 때문에 '+'→%2B, '$'→%24 로 다시 인코딩되면서 URL이 불필요하게 부풀었음
// (카톡 링크 미리보기가 실패하는 원인이 됨). base64 → base64url(-,_,패딩 제거)로
// 바꿔서 URLSearchParams가 손댈 문자가 아예 없도록 수정.
//
// [수정 이력 2, 2026-08-26] 카카오 공유 SDK 분기 제거.
// Kakao.init()에 실제 발급받은 앱 키가 아니라 placeholder('YOUR_KAKAO_JS_KEY')가
// 들어있는 상태였음 → Kakao.isInitialized()는 true를 반환하지만 실제
// Kakao.Share.sendDefault() 호출 시 카카오 서버가 미등록 키로 거부 → 카카오 웹뷰
// 안에서 "요청실패" 에러가 사용자에게 그대로 노출됨. try/catch로도 못 잡히는
// 비동기 실패라 조용히 폴백되지도 않음. 실제 앱 키 등록 전까지는 SDK 자체를
// 아예 안 타도록 제거하고, navigator.share 미지원 시 클립보드 폴백으로 바로 감.
// ============================================================

export function encodeShareData(obj) {
  const json = JSON.stringify(obj);
  const b64 = LZString.compressToBase64(json);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShareData(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const json = LZString.decompressFromBase64(b64);
  if (!json) throw new Error('공유 데이터를 해석할 수 없습니다');
  return JSON.parse(json);
}

// [수정 이력 3, 2026-08-26] 공유 링크를 쿼리스트링(?r=...)에서 URL 해시(#r=...)로 전환.
// 이유: LZ-String 압축 결과가 결과 내용(제목+features 4개+총평)에 비례해서 커지다
// 보니 URL이 1500~2000자를 넘는 경우가 생겼고, 카카오톡 링크 미리보기 크롤러가
// 너무 길고 복잡한 URL은 카드 생성을 포기하고 텍스트로만 표시하는 문제가 있었음.
// 해시(#) 뒤 값은 브라우저 스펙상 서버로 전송되지 않기 때문에, 카카오 크롤러는
// 항상 짧고 고정된 URL(https://.../)만 보게 되어 길이 문제가 원천적으로 사라짐.
// 부수 효과로 og:url 메타 태그와 실제 크롤링 URL이 항상 정확히 일치하게 됨.
// 결과를 받은 사람의 브라우저에서는 클라이언트 JS가 location.hash를 읽어 그대로
// 복원하므로 콘텐츠 요약/축약 없이 원본 결과 그대로 공유됨(서버 저장 여전히 없음).
export function buildShareUrl(paramKey, dataObj) {
  const url = new URL(window.location.href.split('?')[0].split('#')[0]);
  url.hash = `${paramKey}=${encodeShareData(dataObj)}`;
  return url.toString();
}

// ---- 통합 공유 함수 (일반 브라우저 OS 공유시트 → 클립보드 순 폴백) ----
export async function shareResult({ title, description, imageUrl, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ url });
      return;
    } catch (err) {
      return; // 사용자가 취소한 경우도 여기로 옴 — 추가 폴백 시도 안 함
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert('링크가 복사되었습니다! 친구에게 붙여넣기 해보세요.');
  } catch (err) {}
}
