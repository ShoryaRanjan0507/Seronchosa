let socket;
let currentStatus = 'idle';
let pollingTimer = null;
let lastKnownVotes = { defense: 0, prosecution: 0 };

const statusIndicator = document.getElementById('statusIndicator');
const defenseCount = document.getElementById('defenseCount');
const prosecutionCount = document.getElementById('prosecutionCount');
const defensePercent = document.getElementById('defensePercent');
const prosecutionPercent = document.getElementById('prosecutionPercent');
const defenseBar = document.getElementById('defenseBar');
const prosecutionBar = document.getElementById('prosecutionBar');
const qrImage = document.getElementById('qrImage');
const voteLink = document.getElementById('voteLink');

const btnStart = document.getElementById('btnStart');
const btnEnd = document.getElementById('btnEnd');
const btnReset = document.getElementById('btnReset');
const audioToggle = document.getElementById('audioToggle');

const defensePanel = document.getElementById('defensePanel');
const prosecutionPanel = document.getElementById('prosecutionPanel');
const defenseTitle = document.getElementById('defenseTitle');
const prosecutionTitle = document.getElementById('prosecutionTitle');

let latestState = null;

const objectionBubble = document.getElementById('objectionBubble');
const bubbleText = document.getElementById('bubbleText');
const winnerOverlay = document.getElementById('winnerOverlay');
const verdictStamp = document.getElementById('verdictStamp');
const winnerName = document.getElementById('winnerName');
const winnerCounts = document.getElementById('winnerCounts');
const btnCloseVerdict = document.getElementById('btnCloseVerdict');

let audioEnabled = false;
audioToggle.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  if (audioEnabled) {
    window.audio.init();
    audioToggle.textContent = '🔊 SOUND ON';
    audioToggle.style.borderColor = 'var(--gold)';
    window.audio.playBeep();
  } else {
    audioToggle.textContent = '🔇 SOUND OFF';
    audioToggle.style.borderColor = 'var(--border-color)';
  }
  window.audio.isMuted = !audioEnabled;
});

document.body.addEventListener('click', () => {
  if (audioEnabled) {
    window.audio.init();
  }
}, { once: true });

function connectWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      statusIndicator.textContent = 'CONNECTED';
      statusIndicator.className = 'status-text';
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'state') {
        updateUI(data.state);
      } else if (data.type === 'vote_cast') {
        handleIncomingVote(data.side, data.votes);
      }
    };

    socket.onclose = () => {
      startPollingFallback();
    };

    socket.onerror = () => {
      startPollingFallback();
    };
  } catch (e) {
    startPollingFallback();
  }
}

function startPollingFallback() {
  statusIndicator.textContent = 'CONNECTED (POLLING)';
  statusIndicator.className = 'status-text';
  if (!pollingTimer) {
    fetchStatePolling();
    pollingTimer = setInterval(fetchStatePolling, 1500);
  }
}

async function fetchStatePolling() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const state = await res.json();
      if (lastKnownVotes.defense !== state.votes.defense) {
        handleIncomingVote('defense', state.votes);
      } else if (lastKnownVotes.prosecution !== state.votes.prosecution) {
        handleIncomingVote('prosecution', state.votes);
      } else {
        updateUI(state);
      }
    }
  } catch (e) {}
}

function updateUI(state) {
  latestState = state;
  currentStatus = state.status;
  
  const defVotes = state.votes.defense;
  const prosVotes = state.votes.prosecution;
  lastKnownVotes = { defense: defVotes, prosecution: prosVotes };
  
  const total = defVotes + prosVotes;
  
  defenseCount.textContent = defVotes;
  prosecutionCount.textContent = prosVotes;
  
  let defPct = 50;
  let prosPct = 50;
  if (total > 0) {
    defPct = Math.round((defVotes / total) * 100);
    prosPct = 100 - defPct;
  }
  
  defensePercent.textContent = `${defPct}%`;
  prosecutionPercent.textContent = `${prosPct}%`;
  defenseBar.style.width = `${defPct}%`;
  prosecutionBar.style.width = `${prosPct}%`;
  
  if (state.qrCode) qrImage.src = state.qrCode;
  if (state.voteUrl) voteLink.textContent = state.voteUrl;

  if (state.names) {
    if (document.activeElement !== defenseTitle) {
      defenseTitle.textContent = state.names.defense;
    }
    if (document.activeElement !== prosecutionTitle) {
      prosecutionTitle.textContent = state.names.prosecution;
    }
  }

  if (state.status === 'idle') {
    statusIndicator.textContent = pollingTimer ? 'COURT IN SESSION (POLLING)' : 'COURT IN SESSION';
    statusIndicator.className = 'status-text';
    btnStart.disabled = false;
    btnEnd.disabled = true;
    btnReset.disabled = true;
    winnerOverlay.classList.remove('active');
  } else if (state.status === 'active') {
    statusIndicator.textContent = pollingTimer ? 'ACTIVE VOTING (POLLING)' : 'ACTIVE VOTING';
    statusIndicator.className = 'status-text status-active';
    btnStart.disabled = true;
    btnEnd.disabled = false;
    btnReset.disabled = false;
    winnerOverlay.classList.remove('active');
  } else if (state.status === 'ended') {
    statusIndicator.textContent = 'VERDICT REACHED';
    statusIndicator.className = 'status-text status-ended';
    btnStart.disabled = true;
    btnEnd.disabled = true;
    btnReset.disabled = false;
    displayVerdict(state.winner, defVotes, prosVotes);
  }
}

function displayVerdict(winner, defVotes, prosVotes) {
  const defName = latestState && latestState.names ? latestState.names.defense : 'Defense';
  const prosName = latestState && latestState.names ? latestState.names.prosecution : 'Prosecution';

  if (winner === 'prosecution') {
    verdictStamp.textContent = 'GUILTY';
    verdictStamp.className = 'verdict-stamp verdict-guilty';
    winnerName.textContent = `${prosName.toUpperCase()} WINS!`;
    winnerName.style.color = 'var(--prosecution-text)';
  } else if (winner === 'defense') {
    verdictStamp.textContent = 'NOT GUILTY';
    verdictStamp.className = 'verdict-stamp verdict-notguilty';
    winnerName.textContent = `${defName.toUpperCase()} WINS!`;
    winnerName.style.color = 'var(--defense-text)';
  } else {
    verdictStamp.textContent = 'MISTRIAL';
    verdictStamp.className = 'verdict-stamp verdict-draw';
    winnerName.textContent = 'TIE / MISTRIAL';
    winnerName.style.color = 'var(--gold)';
  }

  winnerCounts.textContent = `${defName.toUpperCase()}: ${defVotes} VOTES | ${prosName.toUpperCase()}: ${prosVotes} VOTES`;
  
  setTimeout(() => {
    winnerOverlay.classList.add('active');
    if (audioEnabled) {
      window.audio.playGavelSlam();
      setTimeout(() => {
        window.audio.playVictoryFanfare();
      }, 550);
    }
    document.body.classList.add('shake-anim');
    setTimeout(() => {
      document.body.classList.remove('shake-anim');
    }, 400);
  }, 300);
}

function handleIncomingVote(side, votes) {
  const defVotes = votes.defense;
  const prosVotes = votes.prosecution;
  lastKnownVotes = { defense: defVotes, prosecution: prosVotes };
  
  const total = defVotes + prosVotes;
  
  defenseCount.textContent = defVotes;
  prosecutionCount.textContent = prosVotes;
  
  let defPct = 50;
  let prosPct = 50;
  if (total > 0) {
    defPct = Math.round((defVotes / total) * 100);
    prosPct = 100 - defPct;
  }
  
  defensePercent.textContent = `${defPct}%`;
  prosecutionPercent.textContent = `${prosPct}%`;
  defenseBar.style.width = `${defPct}%`;
  prosecutionBar.style.width = `${prosPct}%`;

  const activePanel = side === 'defense' ? defensePanel : prosecutionPanel;
  activePanel.classList.add('active-vote');
  setTimeout(() => {
    activePanel.classList.remove('active-vote');
  }, 600);

  const shouts = ['OBJECTION!', 'HOLD IT!', 'TAKE THAT!'];
  const randomShout = shouts[Math.floor(Math.random() * shouts.length)];
  bubbleText.textContent = randomShout;
  
  if (side === 'defense') {
    bubbleText.style.color = '#ff3c00';
  } else {
    bubbleText.style.color = '#7e17c2';
  }
  
  objectionBubble.classList.add('active');
  
  if (audioEnabled) {
    window.audio.playObjection();
  }

  document.body.classList.add('shake-anim');
  
  setTimeout(() => {
    objectionBubble.classList.remove('active');
  }, 800);

  setTimeout(() => {
    document.body.classList.remove('shake-anim');
  }, 400);
}

async function postAdminCommand(endpoint) {
  try {
    const response = await fetch(`/api/admin/${endpoint}`, { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      updateUI(data.state);
    }
  } catch (error) {}
}

btnStart.addEventListener('click', () => {
  postAdminCommand('start');
  if (audioEnabled) window.audio.playBeep();
});

btnEnd.addEventListener('click', () => {
  postAdminCommand('end');
});

btnReset.addEventListener('click', () => {
  postAdminCommand('reset');
  if (audioEnabled) window.audio.playBeep();
});

btnCloseVerdict.addEventListener('click', () => {
  winnerOverlay.classList.remove('active');
});

async function saveBenchesNames() {
  const defText = defenseTitle.textContent.trim() || 'Defense';
  const prosText = prosecutionTitle.textContent.trim() || 'Prosecution';
  try {
    const response = await fetch('/api/admin/names', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ defense: defText, prosecution: prosText })
    });
    const data = await response.json();
    if (data.success) {
      updateUI(data.state);
    }
  } catch (error) {}
}

function handleNameEditKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
  }
}

defenseTitle.addEventListener('blur', saveBenchesNames);
defenseTitle.addEventListener('keydown', handleNameEditKeydown);
prosecutionTitle.addEventListener('blur', saveBenchesNames);
prosecutionTitle.addEventListener('keydown', handleNameEditKeydown);

connectWebSocket();
