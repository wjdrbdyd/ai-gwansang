// ============================================================
// dom-utils.js — 생년월일(텍스트 자동포맷) / 시진 드롭다운 + 화면 전환 공용 유틸
//
// [2026-08-26 변경 1] 생년월일 입력을 연/월/일 select 3개 → 텍스트 인풋 1개로 전환.
// 모바일에서 select는 숫자 키패드 타이핑이 안 되고 OS 휠피커만 뜨는 플랫폼 제약 때문.
// inputmode="numeric" 텍스트 인풋 + 자동 포맷("19940815" → "1994.08.15")으로 통일.
//
// [2026-08-26 변경 2] showView()에 브라우저 히스토리 연동 추가.
// 기존엔 DOM만 갈아끼워서 모바일 뒤로가기 누르면 히스토리 스택이 비어있어
// 바로 앱이 종료됐음. pushState로 화면 전환마다 히스토리에 쌓고, popstate로
// 뒤로가기를 화면 전환으로 매핑.
// ============================================================

function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

// ---- 생년월일: 자동 포맷 텍스트 인풋 ----
export function bindAutoFormatDateInput(id) {
  const el = document.getElementById(id);
  if (!el) return;

  function format(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = digits.slice(0, 4) + '.' + digits.slice(4);
    if (digits.length > 6) out = digits.slice(0, 4) + '.' + digits.slice(4, 6) + '.' + digits.slice(6);
    return out;
  }

  el.addEventListener('input', () => {
    const cursorWasAtEnd = el.selectionEnd === el.value.length;
    el.value = format(el.value);
    if (cursorWasAtEnd) el.setSelectionRange(el.value.length, el.value.length);
    el.classList.remove('input-error');
  });

  el.addEventListener('blur', () => {
    if (el.value && !getDateValue(id)) {
      el.classList.add('input-error');
    }
  });
}

// 완성되고 유효한 날짜면 'YYYY-MM-DD', 아니면 '' (미완성 입력 = 아직 값 없음으로 취급)
export function getDateValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  const digits = el.value.replace(/\D/g, '');
  if (digits.length !== 8) return '';

  const year = parseInt(digits.slice(0, 4), 10);
  const month = parseInt(digits.slice(4, 6), 10);
  const day = parseInt(digits.slice(6, 8), 10);

  const currentYear = new Date().getFullYear();
  if (year < 1920 || year > currentYear) return '';
  if (month < 1 || month > 12) return '';
  if (day < 1 || day > daysInMonth(year, month)) return '';

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function resetDateValue(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.classList.remove('input-error');
}

// ---- 태어난 시각(시진) select — 기존 그대로 유지 ----
export const SIJIN_OPTIONS = [
  '자시 (23시~01시)', '축시 (01시~03시)', '인시 (03시~05시)', '묘시 (05시~07시)',
  '진시 (07시~09시)', '사시 (09시~11시)', '오시 (11시~13시)', '미시 (13시~15시)',
  '신시 (15시~17시)', '유시 (17시~19시)', '술시 (19시~21시)', '해시 (21시~23시)'
];

export function populateSijinSelect(id) {
  const sel = document.getElementById(id);
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '모름 / 선택 안 함';
  sel.appendChild(blank);
  SIJIN_OPTIONS.forEach((label) => {
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

// ---- 화면(뷰) 전환 + 히스토리 연동 ----
export const VIEWS = [
  'home-view',
  'gwansang-upload-view',
  'gunghap-form-view',
  'saju-form-view',
  'loading-view',
  'result-view'
];

// pushHistory=false로 호출하면 히스토리에 새로 안 쌓음 (popstate로 뒤로가기 처리할 때 사용)
export function showView(id, pushHistory = true) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(v);
    if (!el) return;
    if (v === id) {
      el.style.display = 'block';
      el.classList.add('show');
    } else {
      el.style.display = 'none';
      el.classList.remove('show');
    }
  });
  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.classList.remove('show');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (pushHistory) {
    const current = history.state;
    if (!current || current.view !== id) {
      history.pushState({ view: id }, '', window.location.pathname + window.location.search);
    }
  }
}
