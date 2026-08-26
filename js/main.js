// ============================================================
// main.js — 앱 진입점. 세 기능(관상/궁합/오늘의 운세) 설정을 한 곳에서
// 관리하고, 폼 입력 → API 호출 → 결과 렌더링 → 공유까지 연결한다.
// ============================================================

import {
  bindAutoFormatDateInput, getDateValue, resetDateValue,
  populateSijinSelect, showView
} from './dom-utils.js';
import { encodeShareData, decodeShareData, buildShareUrl, shareResult } from './share.js';
import { analyzeFace, analyzeCompatibility, analyzeFortune } from './api.js';
import { renderResult } from './render.js';

const SITE_ORIGIN = 'https://ai-gwansang-one.vercel.app';
const OG_IMAGE = SITE_ORIGIN + '/og-image.png';

// ---- 기능별 설정 (여기 하나만 보면 각 기능이 어떻게 동작하는지 알 수 있게 통합) ----
const TYPE_CONFIG = {
  gwansang: {
    shareParam: 'r',
    formViewId: 'gwansang-upload-view',
    scoreLabel: '오늘의 총운',
    stickerLines: ['감정', '완료'],
    loadingMessages: [
      '이목구비를 살피는 중...', '눈매의 기운을 읽는 중...', '코끝의 재물운을 보는 중...',
      '입가의 인복을 살피는 중...', '관상학 고서를 뒤적이는 중...', '오늘의 총운을 계산하는 중...'
    ],
    shareTitleFallback: 'AI 관상소',
    shareDescription: '내 관상 결과는? 재미로 보는 AI 관상소 🔮',
    switchLabel: '🔮 관상'
  },
  gunghap: {
    shareParam: 'c',
    formViewId: 'gunghap-form-view',
    scoreLabel: '궁합 지수',
    stickerLines: ['궁합', '인장'],
    loadingMessages: [
      '두 사람의 사주를 대조하는 중...', '오행의 상생상극을 살피는 중...', '띠 궁합을 가늠하는 중...',
      '사주명리 고서를 뒤적이는 중...', '케미를 계산하는 중...'
    ],
    shareTitleFallback: 'AI 관상소',
    shareDescription: '우리 사주 궁합은 몇 점일까? 재미로 보는 AI 관상소 💕',
    switchLabel: '💕 궁합'
  },
  unse: {
    shareParam: 'u',
    formViewId: 'saju-form-view',
    scoreLabel: '오늘의 총운',
    stickerLines: ['오늘의', '운세'],
    loadingMessages: [
      '오늘의 일진을 살피는 중...', '오행의 흐름을 읽는 중...', '재물운을 계산하는 중...',
      '연애운을 가늠하는 중...', '행운 아이템을 찾는 중...'
    ],
    shareTitleFallback: 'AI 관상소',
    shareDescription: '오늘 내 운세는? 재미로 보는 AI 관상소 🌟',
    switchLabel: '🌟 오늘의 운세'
  }
};

// 결과 화면 상태(공유 URL 등) — render*Result 함수들이 최상단 실행 시점에도 안전하게
// 참조할 수 있도록 파일 앞쪽에 선언 (아래쪽에 두면 TDZ 문제로 공유링크 최초 진입 시
// 렌더링이 조용히 실패하는 버그가 있었음 — 2026-08-26 이력 참고)
let resultCtx = { type: null, shareUrl: window.location.href };

let loadingInterval = null;
function startLoading(type) {
  const el = document.getElementById('loading-txt');
  const messages = TYPE_CONFIG[type].loadingMessages;
  let idx = 0;
  el.textContent = messages[0];
  loadingInterval = setInterval(() => {
    idx = (idx + 1) % messages.length;
    el.textContent = messages[idx];
  }, 1400);
  showView('loading-view');
}
function stopLoading() {
  clearInterval(loadingInterval);
}

function showError(message, backToViewId) {
  stopLoading();
  const errorBox = document.getElementById('error-box');
  errorBox.textContent = '감정 도중 문제가 발생했습니다: ' + message + ' (다시 시도해주세요)';
  errorBox.classList.add('show');
  showView(backToViewId);
}

// ============================================================
// 생년월일 인풋 / 시진 드롭다운 초기화
// ============================================================
['opt-birthdate', 'g-birthdate-a', 'g-birthdate-b', 's-birthdate'].forEach(bindAutoFormatDateInput);
['opt-birthtime', 'g-birthtime-a', 'g-birthtime-b', 's-birthtime'].forEach(populateSijinSelect);

// ============================================================
// 홈 / 네비게이션
// ============================================================
document.getElementById('topbar-brand').addEventListener('click', () => showView('home-view'));
document.getElementById('topbar-home').addEventListener('click', () => showView('home-view'));
document.getElementById('nav-gwansang').addEventListener('click', () => showView('gwansang-upload-view'));
document.getElementById('nav-gunghap').addEventListener('click', () => showView('gunghap-form-view'));
document.getElementById('nav-saju').addEventListener('click', () => showView('saju-form-view'));
document.querySelectorAll('[data-back="home"]').forEach((el) => {
  el.addEventListener('click', () => showView('home-view'));
});
[document.getElementById('nav-gwansang'), document.getElementById('nav-gunghap'), document.getElementById('nav-saju')].forEach((el) => {
  el.setAttribute('tabindex', '0');
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
});

// 최초 진입 화면을 히스토리에 기록 (뒤로가기 매핑의 기준점)
// 해시(#r=...)는 반드시 유지해야 함 — 지우면 아래 checkSharedLinkAndRender()가 공유 데이터를 못 읽음
history.replaceState({ view: 'home-view' }, '', window.location.pathname + window.location.search + window.location.hash);

// [2026-08-26] 무조건 홈 화면부터 그린 뒤 나중에 공유 결과로 바꿔치기하면, 그 사이
// 짧게라도 홈 화면이 눈에 보이는 깜빡임이 생김. 공유 링크 여부를 먼저 확인해서
// 성공하면 바로 결과 화면으로, 아니면 홈 화면으로 — 한 번에 맞는 화면만 그리도록 함.
// (checkSharedLinkAndRender는 함수 선언이라 파일 아래쪽에 있어도 호이스팅으로 여기서
// 바로 호출 가능하지만, resultCtx는 let이라 반드시 위쪽에서 먼저 선언돼 있어야 함)
const renderedFromShareLink = checkSharedLinkAndRender();
if (!renderedFromShareLink) {
  showView('home-view', false);
}

// 모바일/브라우저 뒤로가기 → 화면 전환으로 매핑 (기존엔 히스토리가 안 쌓여서 뒤로가기 누르면 앱이 바로 종료됐음)
window.addEventListener('popstate', (e) => {
  const view = e.state?.view || 'home-view';
  showView(view, false);
});
window.addEventListener('hashchange', checkSharedLinkAndRender);

// ============================================================
// 결과 화면 공용: 공유 URL 상태 + 하단 액션(공유/다시하기/처음으로/기능전환)
// ============================================================
function wireResultActions() {
  document.getElementById('share-btn').onclick = () => {
    const cfg = TYPE_CONFIG[resultCtx.type];
    shareResult({
      title: document.getElementById('result-title').textContent || cfg.shareTitleFallback,
      description: cfg.shareDescription,
      imageUrl: OG_IMAGE,
      url: resultCtx.shareUrl
    });
  };

  document.getElementById('retry-btn').onclick = () => {
    history.replaceState({ view: TYPE_CONFIG[resultCtx.type].formViewId }, '', window.location.pathname);
    if (resultCtx.type === 'gwansang') resetGwansangForm();
    if (resultCtx.type === 'gunghap') resetGunghapForm();
    if (resultCtx.type === 'unse') resetSajuForm();
    showView(TYPE_CONFIG[resultCtx.type].formViewId, false);
  };

  document.getElementById('home-from-result-btn').onclick = () => {
    history.replaceState({ view: 'home-view' }, '', window.location.pathname);
    showView('home-view', false);
  };

  const switchRow = document.getElementById('switch-row');
  switchRow.innerHTML = '';
  Object.keys(TYPE_CONFIG).forEach((type) => {
    if (type === resultCtx.type) return;
    const chip = document.createElement('div');
    chip.className = 'switch-chip';
    chip.textContent = TYPE_CONFIG[type].switchLabel;
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.addEventListener('click', () => {
      history.replaceState({ view: TYPE_CONFIG[type].formViewId }, '', window.location.pathname);
      showView(TYPE_CONFIG[type].formViewId, false);
    });
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); } });
    switchRow.appendChild(chip);
  });
}

// ============================================================
// 1) 관상 (사진 기반)
// ============================================================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewWrap = document.getElementById('preview-wrap');
const previewImg = document.getElementById('preview-img');
const analyzeBtn = document.getElementById('analyze-btn');

let base64Image = null;
let mediaType = null;

function checkGwansangReady() {
  analyzeBtn.disabled = !(base64Image && document.getElementById('consent-gwansang').checked);
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  mediaType = file.type;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    base64Image = e.target.result.split(',')[1];
    dropZone.style.display = 'none';
    previewWrap.classList.add('show');
    checkGwansangReady();
  };
  reader.readAsDataURL(file);
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });
document.getElementById('consent-gwansang').addEventListener('change', checkGwansangReady);
document.getElementById('change-photo-link').addEventListener('click', () => {
  dropZone.style.display = 'block';
  previewWrap.classList.remove('show');
  fileInput.value = '';
  base64Image = null;
  analyzeBtn.disabled = true;
  fileInput.click();
});
document.getElementById('optional-toggle').addEventListener('click', function () {
  const fields = document.getElementById('optional-fields');
  fields.classList.toggle('show');
  this.textContent = fields.classList.contains('show')
    ? '- 생년월일 정보 접기'
    : '+ 생년월일 추가로 입력하기 (선택, 더 자세히 봐드려요)';
});

function resetGwansangForm() {
  dropZone.style.display = 'block';
  previewWrap.classList.remove('show');
  fileInput.value = '';
  base64Image = null;
  analyzeBtn.disabled = true;
  document.getElementById('optional-fields').classList.remove('show');
  document.getElementById('consent-gwansang').checked = false;
  ['opt-name', 'opt-birthtime', 'opt-birthplace'].forEach((id) => { document.getElementById(id).value = ''; });
  resetDateValue('opt-birthdate');
}

function renderGwansangResult(result, sharedFromLink) {
  resultCtx.type = 'gwansang';
  const cfg = TYPE_CONFIG.gwansang;

  if (sharedFromLink) {
    renderResult({
      photoSrc: null,
      placeholderIcon: '🔮',
      placeholderNote: '공유된 링크 · 원본 사진은 포함되지 않습니다',
      title: result.title,
      subText: 'AI 관상소 감정 결과',
      features: result.features,
      scoreLabel: cfg.scoreLabel,
      score: result.fortune_score,
      summaryText: result.fortune_text,
      stickerLines: cfg.stickerLines
    });
    resultCtx.shareUrl = window.location.href;
  } else {
    renderResult({
      photoSrc: previewImg.src,
      title: result.title,
      subText: 'AI 관상소 감정 결과',
      features: result.features,
      scoreLabel: cfg.scoreLabel,
      score: result.fortune_score,
      summaryText: result.fortune_text,
      stickerLines: cfg.stickerLines
    });
    const shareData = {
      t: result.title || '', f: (result.features || []).map((x) => ({ p: x.part, e: x.emoji, x: x.text })),
      s: result.fortune_score || '', ft: result.fortune_text || ''
    };
    resultCtx.shareUrl = buildShareUrl('r', shareData);
  }
  wireResultActions();
  showView('result-view');
}

analyzeBtn.addEventListener('click', async () => {
  if (!base64Image) return;
  const optionalInfo = {
    name: document.getElementById('opt-name').value.trim(),
    birthdate: getDateValue('opt-birthdate'),
    birthtime: document.getElementById('opt-birthtime').value,
    birthplace: document.getElementById('opt-birthplace').value.trim()
  };
  startLoading('gwansang');
  try {
    const result = await analyzeFace(base64Image, mediaType, optionalInfo);
    stopLoading();
    renderGwansangResult(result, false);
  } catch (err) {
    showError(err.message, 'gwansang-upload-view');
  }
});

// ============================================================
// 2) 사주 궁합 (2인, 생년월일 기반)
// ============================================================
const analyzeCoupleBtn = document.getElementById('analyze-couple-btn');

function checkGunghapReady() {
  const bdA = getDateValue('g-birthdate-a');
  const bdB = getDateValue('g-birthdate-b');
  const consented = document.getElementById('consent-gunghap').checked;
  analyzeCoupleBtn.disabled = !(bdA && bdB && consented);
}
['g-birthdate-a', 'g-birthdate-b'].forEach((id) => {
  document.getElementById(id).addEventListener('input', checkGunghapReady);
});
document.getElementById('consent-gunghap').addEventListener('change', checkGunghapReady);

function resetGunghapForm() {
  ['g-name-a', 'g-birthtime-a', 'g-name-b', 'g-birthtime-b'].forEach((id) => { document.getElementById(id).value = ''; });
  resetDateValue('g-birthdate-a');
  resetDateValue('g-birthdate-b');
  document.getElementById('consent-gunghap').checked = false;
  analyzeCoupleBtn.disabled = true;
}

function renderGunghapResult(result, personA, personB) {
  resultCtx.type = 'gunghap';
  const cfg = TYPE_CONFIG.gunghap;
  renderResult({
    photoSrc: null,
    placeholderIcon: '💕',
    namesLine: `${personA.name} 💕 ${personB.name}`,
    title: result.title,
    subText: 'AI 관상소 사주 궁합 감정 결과',
    features: result.features,
    scoreLabel: cfg.scoreLabel,
    score: result.compatibility_score,
    summaryText: result.summary,
    stickerLines: cfg.stickerLines
  });
  const shareData = {
    pa: personA.name, pb: personB.name, t: result.title || '',
    f: (result.features || []).map((x) => ({ p: x.part, e: x.emoji, x: x.text })),
    s: result.compatibility_score || '', sm: result.summary || ''
  };
  resultCtx.shareUrl = buildShareUrl('c', shareData);
  wireResultActions();
  showView('result-view');
}

analyzeCoupleBtn.addEventListener('click', async () => {
  const personA = {
    name: document.getElementById('g-name-a').value.trim() || '나',
    birthdate: getDateValue('g-birthdate-a'),
    birthtime: document.getElementById('g-birthtime-a').value
  };
  const personB = {
    name: document.getElementById('g-name-b').value.trim() || '상대방',
    birthdate: getDateValue('g-birthdate-b'),
    birthtime: document.getElementById('g-birthtime-b').value
  };
  if (!personA.birthdate || !personB.birthdate) return;
  startLoading('gunghap');
  try {
    const result = await analyzeCompatibility(personA, personB);
    stopLoading();
    renderGunghapResult(result, personA, personB);
  } catch (err) {
    showError(err.message, 'gunghap-form-view');
  }
});

// ============================================================
// 3) 오늘의 운세 (1인, 생년월일 기반)
// ============================================================
const analyzeSajuBtn = document.getElementById('analyze-saju-btn');

function checkSajuReady() {
  const bd = getDateValue('s-birthdate');
  const consented = document.getElementById('consent-saju').checked;
  analyzeSajuBtn.disabled = !(bd && consented);
}
document.getElementById('s-birthdate').addEventListener('input', checkSajuReady);
document.getElementById('consent-saju').addEventListener('change', checkSajuReady);

function resetSajuForm() {
  document.getElementById('s-name').value = '';
  document.getElementById('s-birthtime').value = '';
  resetDateValue('s-birthdate');
  document.getElementById('consent-saju').checked = false;
  analyzeSajuBtn.disabled = true;
}

function renderSajuResult(result, person) {
  resultCtx.type = 'unse';
  const cfg = TYPE_CONFIG.unse;
  renderResult({
    photoSrc: null,
    placeholderIcon: '🌟',
    namesLine: person.name ? `${person.name}님의 오늘 운세` : '오늘의 운세',
    title: result.title,
    subText: 'AI 관상소 오늘의 운세',
    features: result.features,
    scoreLabel: cfg.scoreLabel,
    score: result.fortune_score,
    summaryText: result.fortune_text,
    stickerLines: cfg.stickerLines
  });
  const shareData = {
    pn: person.name || '', t: result.title || '',
    f: (result.features || []).map((x) => ({ p: x.part, e: x.emoji, x: x.text })),
    s: result.fortune_score || '', ft: result.fortune_text || ''
  };
  resultCtx.shareUrl = buildShareUrl('u', shareData);
  wireResultActions();
  showView('result-view');
}

analyzeSajuBtn.addEventListener('click', async () => {
  const person = {
    name: document.getElementById('s-name').value.trim(),
    birthdate: getDateValue('s-birthdate'),
    birthtime: document.getElementById('s-birthtime').value
  };
  if (!person.birthdate) return;
  startLoading('unse');
  try {
    const result = await analyzeFortune(person);
    stopLoading();
    renderSajuResult(result, person);
  } catch (err) {
    showError(err.message, 'saju-form-view');
  }
});

// ============================================================
// 공유된 링크로 접속한 경우, 결과를 바로 표시 (요청사항 #2 연계:
// 이 경우에도 상단바로 홈 이동 + 결과 화면 하단 스위치 칩으로 다른 기능 이동 가능)
//
// 함수 선언(function ... {})이라 호이스팅되므로, 실제 정의 위치는 파일 아래쪽이어도
// 파일 위쪽(약 110번째 줄 근처)의 최초 실행 흐름에서 바로 호출 가능함.
// 성공적으로 렌더링했으면 true, 공유 데이터가 없거나 해석 실패하면 false를 반환 —
// 호출부에서 이 값을 보고 "실패 시에만 홈 화면 표시"하도록 분기함 (깜빡임 방지).
//
// [2026-08-26 버그 수정] 처음엔 이 블록이 파일 위쪽, resultCtx가 선언되기 전에
// 있어서 renderGwansangResult() 내부의 `resultCtx.type = ...`가 TDZ(Temporal Dead
// Zone) ReferenceError를 던졌고, 이게 바로 아래 try/catch에 조용히 삼켜지면서
// "완전히 새 탭에서 공유 링크로 처음 들어가면 결과가 전혀 안 보이는" 버그가 있었음.
// resultCtx 선언을 파일 위쪽으로 옮겨서 해결 (checkSharedLinkAndRender 자체는
// 함수 선언이라 원래도 호이스팅 문제는 없었음).
// ============================================================
function checkSharedLinkAndRender() {
  // 해시(#r=...) 우선 확인 (신규 방식). 구버전에 뿌려진 링크(?r=...)도 하위호환으로 계속 읽어줌.
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const searchParams = new URLSearchParams(window.location.search);
  const hasHashData = hashParams.has('r') || hashParams.has('c') || hashParams.has('u');
  const params = hasHashData ? hashParams : searchParams;
  try {
    if (params.has('r')) {
      const data = decodeShareData(params.get('r'));
      renderGwansangResult({
        title: data.t,
        features: (data.f || []).map((x) => ({ part: x.p, emoji: x.e, text: x.x })),
        fortune_score: data.s,
        fortune_text: data.ft
      }, true);
      return true;
    } else if (params.has('c')) {
      const data = decodeShareData(params.get('c'));
      renderGunghapResult({
        title: data.t,
        features: (data.f || []).map((x) => ({ part: x.p, emoji: x.e, text: x.x })),
        compatibility_score: data.s,
        summary: data.sm
      }, { name: data.pa }, { name: data.pb });
      return true;
    } else if (params.has('u')) {
      const data = decodeShareData(params.get('u'));
      renderSajuResult({
        title: data.t,
        features: (data.f || []).map((x) => ({ part: x.p, emoji: x.e, text: x.x })),
        fortune_score: data.s,
        fortune_text: data.ft
      }, { name: data.pn });
      return true;
    }
  } catch (err) {
    // 링크가 손상됐거나(구버전 링크 등) 해석 불가하면 조용히 홈 화면 유지
  }
  return false;
}
