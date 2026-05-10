// Home page — animate counter from current → target over 700ms
function animateCounter(el, target, decimals = 0, duration = 700) {
  if (!el) return;
  const start = parseFloat(el.textContent) || 0;
  if (start === target) { el.textContent = decimals ? target.toFixed(decimals) : target; return; }
  const startTs = performance.now();
  function step(t) {
    const p = Math.min(1, (t - startTs) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = start + (target - start) * eased;
    el.textContent = decimals ? v.toFixed(decimals) : Math.round(v);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

let firstLoad = true;
async function loadStats() {
  try {
    const r = await fetch('/api/stats').then(r => r.json());
    if (r.error) return;
    animateCounter(document.getElementById('totalSkills'), r.totalSkills, 0);
    animateCounter(document.getElementById('totalJobs'), r.totalJobs, 0);
    animateCounter(document.getElementById('totalEarned'), +r.totalEarnedOG, 3);
    const ls = document.getElementById('liveSkills'); if (ls) ls.textContent = r.totalSkills;
    const lj = document.getElementById('liveJobs'); if (lj) lj.textContent = r.totalJobs;
    const cl = document.getElementById('contractLink');
    if (cl) {
      cl.textContent = r.contract.slice(0, 8) + '…' + r.contract.slice(-6);
      cl.href = `https://chainscan.0g.ai/address/${r.contract}`;
    }
    const rj = document.getElementById('recentJob'); if (rj) rj.textContent = r.recentJob || 'no jobs yet';
    firstLoad = false;
  } catch {}
}
loadStats();
setInterval(loadStats, 12000);
