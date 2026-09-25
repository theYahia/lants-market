// Info-icon tooltips. Fixed-positioned so overflow:hidden/auto never clips them.
const tip = document.createElement('div');
tip.id = 'tip';
document.body.appendChild(tip);

function show(el) {
  const text = el.getAttribute('data-tip');
  if (!text) return;
  tip.textContent = text;
  tip.classList.add('show');
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  
  // Position under the icon, centred
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
  
  // Try below first
  let top = r.bottom + 6;
  
  // Flip above if it would overflow the bottom
  if (top + t.height > window.innerHeight - 8) {
    top = r.top - t.height - 6;
  }
  
  // Clamp top position too
  top = Math.max(8, top);
  
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

function hide() { 
  tip.classList.remove('show'); 
}

function bind() {
  for (const el of document.querySelectorAll('.info[data-tip]')) {
    if (el.dataset.tipBound) continue;
    el.dataset.tipBound = '1';
    el.addEventListener('mouseenter', () => show(el));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', hide);
    el.addEventListener('click', (e) => e.stopPropagation()); // don't trigger th sort
  }
}

bind();

// Watch for dynamically added elements
new MutationObserver(bind).observe(document.body, { 
  childList: true, 
  subtree: true 
});