// Home page — load live stats from contract
async function loadStats() {
  try {
    const r = await fetch('/api/stats').then(r => r.json());
    if (r.error) return;
    document.getElementById('totalSkills').textContent = r.totalSkills;
    document.getElementById('totalJobs').textContent = r.totalJobs;
    document.getElementById('totalEarned').textContent = (+r.totalEarnedOG).toFixed(3);
    document.getElementById('liveSkills').textContent = r.totalSkills;
    document.getElementById('liveJobs').textContent = r.totalJobs;
    document.getElementById('contractLink').textContent = r.contract.slice(0, 8) + '…' + r.contract.slice(-6);
    document.getElementById('contractLink').href = `https://chainscan.0g.ai/address/${r.contract}`;
    document.getElementById('recentJob').textContent = r.recentJob || 'no jobs yet';
  } catch {}
}
loadStats();
setInterval(loadStats, 12000);
