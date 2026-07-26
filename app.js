// Cymor Pitch — frontend app logic (vanilla JS, no build step)

const views = {
  home: document.getElementById('view-home'),
  dashboard: document.getElementById('view-dashboard'),
  match: document.getElementById('view-match'),
  tracker: document.getElementById('view-tracker')
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-view="${name}"]`);
  if (activeLink) activeLink.classList.add('active');
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    showView(view);
    if (view === 'dashboard') loadFixtures('PL');
  });
});

document.getElementById('cta-start').addEventListener('click', () => {
  showView('dashboard');
  loadFixtures('PL');
});

document.getElementById('back-to-fixtures').addEventListener('click', () => showView('dashboard'));

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadFixtures(tab.dataset.comp);
  });
});

async function loadFixtures(competitionCode) {
  const list = document.getElementById('fixtures-list');
  list.innerHTML = '<p class="empty-state">Loading fixtures…</p>';

  try {
    const res = await fetch(`/api/fixtures/competition/${competitionCode}`);
    const data = await res.json();

    if (!data.matches || data.matches.length === 0) {
      list.innerHTML = '<p class="empty-state">No fixtures found in the next 14 days for this competition.</p>';
      return;
    }

    list.innerHTML = '';
    data.matches.forEach(m => {
      const card = document.createElement('div');
      card.className = 'fixture-card';
      const date = new Date(m.utcDate);
      card.innerHTML = `
        <div>
          <div class="fixture-teams">${m.homeTeam.name} vs ${m.awayTeam.name}</div>
          <div class="fixture-meta">${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div class="fixture-meta">Analyze &rarr;</div>
      `;
      card.addEventListener('click', () => openMatchAnalysis(m));
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Could not load fixtures. Check the server's FOOTBALL_DATA_API_KEY is set. (${err.message})</p>`;
  }
}

async function openMatchAnalysis(match) {
  showView('match');
  const container = document.getElementById('match-analysis-content');
  container.innerHTML = '<p class="empty-state">Building deep analysis…</p>';

  try {
    const res = await fetch(`/api/analysis/${match.id}?homeTeamId=${match.homeTeam.id}&awayTeamId=${match.awayTeam.id}`);
    const p = await res.json();

    if (p.error) {
      container.innerHTML = `<p class="empty-state">${p.error}: ${p.detail || ''}</p>`;
      return;
    }

    container.innerHTML = `
      <h2 class="section-title">${match.homeTeam.name} vs ${match.awayTeam.name}</h2>
      <p style="margin-bottom:16px;"><span class="confidence-badge">CONFIDENCE ${p.confidence}%</span></p>

      <div class="analysis-grid">
        <div class="panel">
          <h3>Match Result</h3>
          ${probBar('Home Win', p.matchResult.homeWin)}
          ${probBar('Draw', p.matchResult.draw)}
          ${probBar('Away Win', p.matchResult.awayWin)}
        </div>

        <div class="panel">
          <h3>Expected Goals</h3>
          <div class="stat-row"><span>Home xG</span><span>${p.expectedGoals.home}</span></div>
          <div class="stat-row"><span>Away xG</span><span>${p.expectedGoals.away}</span></div>
          <div class="stat-row"><span>Total xG</span><span>${p.expectedGoals.total}</span></div>
          <div class="stat-row"><span>BTTS</span><span>${p.btts}%</span></div>
        </div>

        <div class="panel">
          <h3>Corners &amp; Cards</h3>
          <div class="stat-row"><span>Total corners</span><span>${p.corners.total}</span></div>
          <div class="stat-row"><span>Home / Away split</span><span>${p.corners.homeShare} / ${p.corners.awayShare}</span></div>
          <div class="stat-row"><span>Yellow cards</span><span>${p.cards.yellows}</span></div>
          <div class="stat-row"><span>Red cards</span><span>${p.cards.reds}</span></div>
        </div>

        <div class="panel">
          <h3>Most Likely Scorelines</h3>
          <div class="score-grid">
            ${p.correctScores.map(s => `
              <div class="score-pill">
                <div class="score">${s.score}</div>
                <div class="prob">${s.probability}%</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Analysis failed to load. (${err.message})</p>`;
  }
}

function probBar(label, value) {
  return `
    <div class="prob-bar-row">
      <div class="prob-bar-label"><span>${label}</span><span>${value}%</span></div>
      <div class="prob-bar-track"><div class="prob-bar-fill" style="width:${value}%"></div></div>
    </div>
  `;
}
