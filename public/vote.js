let socket;
const sessionId = window.getSessionId();
let pollingTimer = null;

const votingInterface = document.getElementById('votingInterface');
const lockScreen = document.getElementById('lockScreen');
const mobileWinnerPanel = document.getElementById('mobileWinnerPanel');

const btnVoteDefense = document.getElementById('btnVoteDefense');
const btnVoteProsecution = document.getElementById('btnVoteProsecution');
const audioToggle = document.getElementById('audioToggle');

const objectionBubble = document.getElementById('objectionBubble');
const bubbleText = document.getElementById('bubbleText');

const mobileVerdictStamp = document.getElementById('mobileVerdictStamp');
const mobileWinnerName = document.getElementById('mobileWinnerName');
const mobileWinnerCounts = document.getElementById('mobileWinnerCounts');
const lockStatusMsg = document.getElementById('lockStatusMsg');
const defenseRoleTitle = document.getElementById('defenseRoleTitle');
const prosecutionRoleTitle = document.getElementById('prosecutionRoleTitle');

let audioEnabled = false;
audioToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  audioEnabled = !audioEnabled;
  if (audioEnabled) {
    window.audio.init();
    audioToggle.textContent = '🔊 SFX ON';
    audioToggle.style.borderColor = 'var(--gold)';
    window.audio.playBeep();
  } else {
    audioToggle.textContent = '🔇 SFX OFF';
    audioToggle.style.borderColor = 'var(--border-color)';
  }
  window.audio.isMuted = !audioEnabled;
});

document.body.addEventListener('click', () => {
  if (audioEnabled) {
    window.audio.init();
  }
}, { once: true });

function checkLocalVote() {
  return localStorage.getItem('courtroom_has_voted');
}

function connectWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'state') {
        handleStateChange(data.state);
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
      handleStateChange(state);
    }
  } catch (e) {}
}

function handleStateChange(state) {
  const hasVoted = checkLocalVote();
  
  if (state.names) {
    if (defenseRoleTitle) defenseRoleTitle.textContent = state.names.defense;
    if (prosecutionRoleTitle) prosecutionRoleTitle.textContent = state.names.prosecution;
  }
  
  if (state.status === 'idle') {
    localStorage.removeItem('courtroom_has_voted');
    votingInterface.style.display = 'none';
    mobileWinnerPanel.classList.remove('active');
    lockScreen.classList.add('active');
    lockStatusMsg.textContent = 'AWAITING PROCEEDINGS';
    document.querySelector('.spinner-court').style.display = 'block';
    document.querySelector('.lock-submsg').textContent = 'The court has not opened the poll yet. Stand by for the Judge...';
  } 
  else if (state.status === 'active') {
    if (hasVoted) {
      votingInterface.style.display = 'none';
      mobileWinnerPanel.classList.remove('active');
      lockScreen.classList.add('active');
      lockStatusMsg.textContent = 'PLEA RECORDED';
      document.querySelector('.spinner-court').style.display = 'block';
      document.querySelector('.lock-submsg').textContent = 'Deliberations are in progress. Awaiting the final verdict...';
    } else {
      lockScreen.classList.remove('active');
      mobileWinnerPanel.classList.remove('active');
      votingInterface.style.display = 'flex';
    }
  } 
  else if (state.status === 'ended') {
    votingInterface.style.display = 'none';
    lockScreen.classList.remove('active');
    mobileWinnerPanel.classList.add('active');
    
    const defName = state.names ? state.names.defense : 'Defense';
    const prosName = state.names ? state.names.prosecution : 'Prosecution';

    let effectiveWinner = state.winner;
    if (effectiveWinner === 'draw') {
      effectiveWinner = state.lastVotedSide || 'defense';
    }

    if (effectiveWinner === 'prosecution') {
      mobileVerdictStamp.textContent = 'GUILTY';
      mobileVerdictStamp.className = 'verdict-stamp verdict-guilty';
      mobileWinnerName.textContent = `${prosName.toUpperCase()} WINS!`;
      mobileWinnerName.style.color = 'var(--prosecution-text)';
    } else {
      mobileVerdictStamp.textContent = 'NOT GUILTY';
      mobileVerdictStamp.className = 'verdict-stamp verdict-notguilty';
      mobileWinnerName.textContent = `${defName.toUpperCase()} WINS!`;
      mobileWinnerName.style.color = 'var(--defense-text)';
    }
    
    const def = state.votes.defense;
    const pros = state.votes.prosecution;
    mobileWinnerCounts.textContent = `${defName.toUpperCase()}: ${def} VOTES | ${prosName.toUpperCase()}: ${pros} VOTES`;
    
    document.body.classList.add('shake-anim');
    if (audioEnabled) {
      window.audio.playGavelSlam();
      setTimeout(() => {
        window.audio.playVictoryFanfare();
      }, 550);
    }
    setTimeout(() => {
      document.body.classList.remove('shake-anim');
    }, 400);
  }
}

async function castVote(side) {
  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        side: side,
        sessionId: sessionId
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      localStorage.setItem('courtroom_has_voted', side);
      
      const shouts = ['OBJECTION!', 'HOLD IT!', 'TAKE THAT!'];
      const randomShout = shouts[Math.floor(Math.random() * shouts.length)];
      bubbleText.textContent = randomShout;
      bubbleText.style.color = side === 'defense' ? '#ff3c00' : '#7e17c2';
      
      objectionBubble.classList.add('active');
      if (audioEnabled) {
        window.audio.playObjection();
      }
      
      document.body.classList.add('shake-anim');
      
      setTimeout(() => {
        objectionBubble.classList.remove('active');
        document.body.classList.remove('shake-anim');
        
        votingInterface.style.display = 'none';
        lockScreen.classList.add('active');
        lockStatusMsg.textContent = 'PLEA RECORDED';
        document.querySelector('.spinner-court').style.display = 'block';
        document.querySelector('.lock-submsg').textContent = 'Deliberations are in progress. Awaiting the final verdict...';
      }, 800);
      
    } else {
      alert(data.error || 'Vote could not be processed!');
    }
  } catch (error) {
    alert('Network error, please check Wi-Fi connection!');
  }
}

btnVoteDefense.addEventListener('click', () => castVote('defense'));
btnVoteProsecution.addEventListener('click', () => castVote('prosecution'));

connectWebSocket();
