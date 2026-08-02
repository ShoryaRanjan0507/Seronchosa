const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
let wss;

try {
  wss = new WebSocket.Server({ server });
} catch (e) {
  wss = null;
}

const PORT = process.env.PORT || 3000;

let pollState = {
  status: 'idle',
  votes: {
    prosecution: 0,
    defense: 0
  },
  winner: null,
  names: {
    defense: 'Defense',
    prosecution: 'Prosecution'
  }
};

let votedSessions = new Set();
let votedIPs = new Set();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const VOTE_URL = `http://${LOCAL_IP}:${PORT}/vote.html`;

let qrCodeDataURL = '';
QRCode.toDataURL(VOTE_URL, { margin: 2, scale: 8 }, (err, url) => {
  if (!err) {
    qrCodeDataURL = url;
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

function getFullState() {
  return {
    ...pollState,
    voteUrl: VOTE_URL,
    localIp: LOCAL_IP,
    qrCode: qrCodeDataURL
  };
}

function broadcast(data) {
  if (data.type === 'state') {
    data.state = getFullState();
  }
  const message = JSON.stringify(data);
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

app.get('/api/state', (req, res) => {
  res.json(getFullState());
});

app.post('/api/admin/start', (req, res) => {
  pollState.status = 'active';
  broadcast({ type: 'state', state: getFullState() });
  res.json({ success: true, state: getFullState() });
});

app.post('/api/admin/end', (req, res) => {
  pollState.status = 'ended';
  const { prosecution, defense } = pollState.votes;
  if (prosecution > defense) {
    pollState.winner = 'prosecution';
  } else if (defense > prosecution) {
    pollState.winner = 'defense';
  } else {
    pollState.winner = 'draw';
  }
  broadcast({ type: 'state', state: getFullState() });
  res.json({ success: true, state: getFullState() });
});

app.post('/api/admin/reset', (req, res) => {
  pollState.status = 'idle';
  pollState.votes.prosecution = 0;
  pollState.votes.defense = 0;
  pollState.winner = null;
  pollState.names.defense = 'Defense';
  pollState.names.prosecution = 'Prosecution';
  votedSessions.clear();
  votedIPs.clear();
  broadcast({ type: 'state', state: getFullState() });
  res.json({ success: true, state: getFullState() });
});

app.post('/api/admin/names', (req, res) => {
  const { defense, prosecution } = req.body;
  if (defense) pollState.names.defense = defense;
  if (prosecution) pollState.names.prosecution = prosecution;
  broadcast({ type: 'state', state: getFullState() });
  res.json({ success: true, state: getFullState() });
});

app.post('/api/vote', (req, res) => {
  const { side, sessionId } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;

  if (pollState.status !== 'active') {
    return res.status(400).json({ error: 'Voting is not active!' });
  }

  if (!side || (side !== 'prosecution' && side !== 'defense')) {
    return res.status(400).json({ error: 'Invalid side!' });
  }

  if (votedSessions.has(sessionId)) {
    return res.status(400).json({ error: 'You have already voted!' });
  }

  pollState.votes[side]++;
  votedSessions.add(sessionId);
  votedIPs.add(clientIP);

  broadcast({
    type: 'vote_cast',
    votes: pollState.votes,
    side: side
  });

  res.json({ success: true, votes: pollState.votes });
});

if (wss) {
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'state', state: getFullState() }));
  });
}

if (require.main === module || process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
