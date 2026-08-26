// ============================================================
// render.js — 관상 / 궁합 / 오늘의 운세 결과를 하나의 #result-view에
// 공통으로 그리는 렌더러. 세 기능이 형태(제목+features+점수+총평)가
// 동일해서 뷰/함수를 하나로 통합함 (리팩토링 목적).
// ============================================================

export function renderResult({
  photoSrc = null,
  placeholderIcon = '🔮',
  placeholderNote = '',
  namesLine = null,
  title,
  subText,
  features = [],
  scoreLabel,
  score,
  summaryText,
  stickerLines = ['감정', '완료']
}) {
  const imgEl = document.getElementById('result-img');
  const placeholderEl = document.getElementById('result-img-placeholder');

  if (photoSrc) {
    imgEl.src = photoSrc;
    imgEl.style.display = '';
    placeholderEl.style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    placeholderEl.textContent = placeholderIcon;
    placeholderEl.style.display = 'flex';
  }

  const namesEl = document.getElementById('result-names');
  if (namesLine) {
    namesEl.textContent = namesLine;
    namesEl.style.display = 'block';
  } else {
    namesEl.style.display = 'none';
  }

  document.getElementById('result-title').textContent = title || '결과 없음';
  document.getElementById('result-sub').textContent = subText || '';
  if (placeholderNote) document.getElementById('result-sub').textContent += ` · ${placeholderNote}`;

  document.getElementById('fortune-score-label').textContent = scoreLabel || '점수';
  document.getElementById('fortune-score').textContent = score || '-';
  document.getElementById('fortune-text').textContent = summaryText || '';
  document.getElementById('fortune-sticker').innerHTML = stickerLines.join('<br>');

  const container = document.getElementById('features-container');
  container.innerHTML = '';
  const accents = ['var(--holo-1)', 'var(--holo-2)', 'var(--holo-3)', 'var(--holo-4)'];
  features.forEach((f, i) => {
    const block = document.createElement('div');
    block.className = 'feature-block';
    block.style.setProperty('--f-accent', accents[i % accents.length]);
    block.style.opacity = '0';
    block.style.transform = 'translateY(8px)';
    block.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    block.innerHTML = `<div class="feature-label">${f.emoji || '✨'} ${f.part || ''}</div><div class="feature-text">${f.text || ''}</div>`;
    container.appendChild(block);
    setTimeout(() => { block.style.opacity = '1'; block.style.transform = 'translateY(0)'; }, 120 * i + 80);
  });
}
