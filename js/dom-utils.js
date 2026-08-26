// ============================================================
// dom-utils.js — 생년월일/시진 드롭다운 + 화면 전환 공용 유틸
// ============================================================

export function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function populateYMDSelect(prefix) {
  const ySel = document.getElementById(prefix + '-y');
  const mSel = document.getElementById(prefix + '-m');
  const dSel = document.getElementById(prefix + '-d');
  const currentYear = new Date().getFullYear();

  for (let y = currentYear; y >= 1920; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '년';
    ySel.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m + '월';
    mSel.appendChild(opt);
  }
  function refreshDays() {
    const prevValue = dSel.value;
    const maxDay = daysInMonth(parseInt(ySel.value), parseInt(mSel.value));
    dSel.innerHTML = '<option value="">일</option>';
    for (let d = 1; d <= maxDay; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d + '일';
      dSel.appendChild(opt);
    }
    if (prevValue && parseInt(prevValue) <= maxDay) dSel.value = prevValue;
  }
  refreshDays();
  ySel.addEventListener('change', refreshDays);
  mSel.addEventListener('change', refreshDays);
}

export function getYMDValue(prefix) {
  const y = document.getElementById(prefix + '-y').value;
  const m = document.getElementById(prefix + '-m').value;
  const d = document.getElementById(prefix + '-d').value;
  if (!y || !m || !d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function resetYMDValue(prefix) {
  ['-y', '-m', '-d'].forEach((suffix) => {
    document.getElementById(prefix + suffix).value = '';
  });
}

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

// ---- 화면(뷰) 전환 ----
export const VIEWS = [
  'home-view',
  'gwansang-upload-view',
  'gunghap-form-view',
  'saju-form-view',
  'loading-view',
  'result-view'
];

export function showView(id) {
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
}
