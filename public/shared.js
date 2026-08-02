class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBeep() {
    if (this.isMuted) return;
    this.init();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(650, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playObjection() {
    if (this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    
    const oscSlam = this.ctx.createOscillator();
    const gainSlam = this.ctx.createGain();
    
    oscSlam.type = 'sine';
    oscSlam.frequency.setValueAtTime(150, now);
    oscSlam.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    
    gainSlam.gain.setValueAtTime(0.6, now);
    gainSlam.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    oscSlam.connect(gainSlam);
    gainSlam.connect(this.ctx.destination);
    
    oscSlam.start(now);
    oscSlam.stop(now + 0.4);

    const oscClank1 = this.ctx.createOscillator();
    const oscClank2 = this.ctx.createOscillator();
    const gainClank = this.ctx.createGain();

    oscClank1.type = 'triangle';
    oscClank1.frequency.setValueAtTime(880, now);
    oscClank2.type = 'square';
    oscClank2.frequency.setValueAtTime(932.33, now);

    gainClank.gain.setValueAtTime(0.15, now);
    gainClank.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    oscClank1.connect(gainClank);
    oscClank2.connect(gainClank);
    gainClank.connect(this.ctx.destination);

    oscClank1.start(now);
    oscClank2.start(now);
    oscClank1.stop(now + 0.25);
    oscClank2.stop(now + 0.25);
    
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start(now);
    noise.stop(now + 0.2);
  }

  playGavelSlam() {
    if (this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const delays = [0, 0.15, 0.3];
    
    delays.forEach(delay => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now + delay);
      osc.frequency.exponentialRampToValueAtTime(30, now + delay + 0.12);
      
      gain.gain.setValueAtTime(0.5, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });
  }

  playVictoryFanfare() {
    if (this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const notes = [
      { f: 261.63, t: 0.0, d: 0.1 },
      { f: 329.63, t: 0.1, d: 0.1 },
      { f: 392.00, t: 0.2, d: 0.1 },
      { f: 523.25, t: 0.3, d: 0.15 },
      { f: 659.25, t: 0.45, d: 0.15 },
      { f: 783.99, t: 0.6, d: 0.2 },
      { f: 1046.50, t: 0.8, d: 0.8 }
    ];

    notes.forEach(note => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'square';
      osc1.frequency.setValueAtTime(note.f, now + note.t);
      
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(note.f * 1.005, now + note.t);

      gain.gain.setValueAtTime(0.08, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now + note.t);
      osc2.start(now + note.t);
      osc1.stop(now + note.t + note.d);
      osc2.stop(now + note.t + note.d);
    });
  }
}

function getSessionId() {
  let session = localStorage.getItem('courtroom_session_id');
  if (!session) {
    session = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    localStorage.setItem('courtroom_session_id', session);
  }
  return session;
}

window.audio = new AudioManager();
window.getSessionId = getSessionId;
