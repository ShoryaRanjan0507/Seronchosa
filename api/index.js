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
  lastVotedSide: null,
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

function getVoteUrl(req) {
  if (req && req.headers && req.headers.host) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    return `${protocol}://${req.headers.host}/vote.html`;
  }
  return `http://${LOCAL_IP}:${PORT}/vote.html`;
}

async function getFullState(req) {
  const voteUrl = getVoteUrl(req);
  let qrCode = '';
  try {
    qrCode = await QRCode.toDataURL(voteUrl, { margin: 2, scale: 8 });
  } catch (e) {}

  return {
    ...pollState,
    voteUrl: voteUrl,
    localIp: LOCAL_IP,
    qrCode: qrCode
  };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

async function broadcast(data, req) {
  if (data.type === 'state') {
    data.state = await getFullState(req);
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

app.get('/api/state', async (req, res) => {
  const state = await getFullState(req);
  res.json(state);
});

app.post('/api/sync', async (req, res) => {
  const { votes, status } = req.body || {};
  if (pollState.status === 'active' && votes) {
    if (typeof votes.defense === 'number') {
      pollState.votes.defense = Math.max(pollState.votes.defense, votes.defense);
    }
    if (typeof votes.prosecution === 'number') {
      pollState.votes.prosecution = Math.max(pollState.votes.prosecution, votes.prosecution);
    }
  }
  const state = await getFullState(req);
  res.json({ success: true, state });
});

app.post('/api/admin/start', async (req, res) => {
  pollState.status = 'active';
  const state = await getFullState(req);
  broadcast({ type: 'state', state });
  res.json({ success: true, state });
});

app.post('/api/admin/end', async (req, res) => {
  pollState.status = 'ended';
  const { prosecution, defense } = pollState.votes;
  if (prosecution > defense) {
    pollState.winner = 'prosecution';
  } else if (defense > prosecution) {
    pollState.winner = 'defense';
  } else {
    pollState.winner = pollState.lastVotedSide || 'defense';
  }
  const state = await getFullState(req);
  broadcast({ type: 'state', state });
  res.json({ success: true, state });
});

app.post('/api/admin/reset', async (req, res) => {
  pollState.status = 'idle';
  pollState.votes.prosecution = 0;
  pollState.votes.defense = 0;
  pollState.winner = null;
  pollState.lastVotedSide = null;
  pollState.names = {
    defense: 'Defense',
    prosecution: 'Prosecution'
  };
  votedSessions.clear();
  votedIPs.clear();
  const state = await getFullState(req);
  broadcast({ type: 'state', state });
  res.json({ success: true, state });
});

app.post('/api/admin/names', async (req, res) => {
  const { defense, prosecution } = req.body;
  if (defense) pollState.names.defense = defense;
  if (prosecution) pollState.names.prosecution = prosecution;
  const state = await getFullState(req);
  broadcast({ type: 'state', state });
  res.json({ success: true, state });
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
  pollState.lastVotedSide = side;
  votedSessions.add(sessionId);
  votedIPs.add(clientIP);

  broadcast({
    type: 'vote_cast',
    votes: pollState.votes,
    side: side,
    lastVotedSide: side
  }, req);

  res.json({ success: true, votes: pollState.votes });
});

if (wss) {
  wss.on('connection', async (ws) => {
    const state = await getFullState();
    ws.send(JSON.stringify({ type: 'state', state }));
  });
}

if (require.main === module || process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
