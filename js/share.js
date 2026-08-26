// ============================================================
// share.js — 결과 공유 링크 인코딩/디코딩 + 공유 액션
// 서버 저장 없이 URL 자체에 결과 데이터를 담는다 (LZ-String 압축).
//
// [수정 이력] compressToEncodedURIComponent()가 만드는 문자열에는 '+','$'가
// 섞여있는데, 이걸 URLSearchParams.set()에 넣으면 application/x-www-form-urlencoded
// 규칙 때문에 '+'→%2B, '$'→%24 로 다시 인코딩되면서 URL이 불필요하게 부풀었음
// (카톡 링크 미리보기가 실패하는 원인이 됨). base64 → base64url(-,_,패딩 제거)로
// 바꿔서 URLSearchParams가 손댈 문자가 아예 없도록 수정.
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

export function buildShareUrl(paramKey, dataObj) {
  const url = new URL(window.location.href.split('?')[0]);
  url.searchParams.set(paramKey, encodeShareData(dataObj));
  return url.toString();
}

// ---- 통합 공유 함수 (일반 브라우저 → 카톡 인앱(SDK) → 클립보드 순 폴백) ----
export async function shareResult({ title, description, imageUrl, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ url });
      return;
    } catch (err) {
      return; // 사용자가 취소한 경우도 여기로 옴 — 추가 폴백 시도 안 함
    }
  }
  if (window.Kakao && Kakao.isInitialized()) {
    try {
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: { title, description, imageUrl, link: { mobileWebUrl: url, webUrl: url } }
      });
      return;
    } catch (err) {
      // 아래 클립보드 폴백으로 이어짐
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert('링크가 복사되었습니다! 친구에게 붙여넣기 해보세요.');
  } catch (err) {}
}
