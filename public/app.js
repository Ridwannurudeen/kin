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

// Load top-3 skills for home page "meet the AIs" preview
async function loadPersonasPreview() {
  const grid = document.getElementById('personasGrid');
  if (!grid) return;
  try {
    const [personasMap, skillsRes] = await Promise.all([
      fetch('/personas.json').then(r => r.json()).catch(() => ({})),
      fetch('/api/skills').then(r => r.json()),
    ]);
    const skills = (skillsRes.skills || []).slice().sort((a, b) => +b.totalEarnedOG - +a.totalEarnedOG).slice(0, 4);
    if (skills.length === 0) {
      grid.innerHTML = '<p style="color: var(--ink-mute); font-style: italic;">No skills minted yet. <a href="/onboard">Be the first.</a></p>';
      return;
    }
    grid.innerHTML = '';
    for (const s of skills) {
      const persona = personasMap[String(s.skillId)]?.name || s.owner.slice(0, 6) + '…' + s.owner.slice(-4);
      const avg = s.jobsCompleted > 0 ? (s.totalRating / s.jobsCompleted).toFixed(1) : '—';
      const div = document.createElement('div');
      div.className = 'skill-row';
      div.innerHTML = `
        <div class="desc">
          <span class="type">${s.skillType}</span>
          <span class="name">${persona} · <span style="color: var(--ink-soft); font-weight: 400;">${s.description || s.skillType}</span></span>
          <span class="meta">${s.jobsCompleted} job${s.jobsCompleted === 1 ? '' : 's'} · ${avg}/5 · earned ${s.totalEarnedOG} OG</span>
        </div>
        <div class="price">${s.pricePerJobOG}<span class="unit">OG</span></div>
        <a href="/marketplace" class="btn ghost">hire →</a>
      `;
      grid.appendChild(div);
    }
  } catch (e) { /* keep loading state */ }
}
loadPersonasPreview();
setInterval(loadPersonasPreview, 12000);

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
