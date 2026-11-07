/*
 * Sound effects built with the Web Audio API. No audio files, no network.
 * Exposes window.SoundFX.
 */
(function (root) {
  'use strict';

  var ctx = null;
  var muted = false;
  try { muted = root.localStorage.getItem('ludo-muted') === '1'; } catch (e) { /* storage blocked */ }

  function audio() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // A short pitched tone with a quick fade in and out.
  function tone(freq, dur, o) {
    o = o || {};
    if (muted) return;
    var c = audio();
    if (!c) return;
    var t0 = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    var vol = o.vol || 0.2;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // A short filtered noise burst, used as a dice "clack".
  function clack(delay, vol) {
    if (muted) return;
    var c = audio();
    if (!c) return;
    var len = Math.floor(c.sampleRate * 0.035);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 900;
    f.Q.value = 1.2;
    var g = c.createGain();
    g.gain.value = vol || 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(c.currentTime + (delay || 0));
  }

  var FX = {
    unlock: function () { audio(); },
    roll: function () {
      for (var i = 0; i < 10; i++) clack(i * 0.075, 0.5);
    },
    move: function () {
      tone(640, 0.08, { type: 'triangle', vol: 0.16 });
    },
    capture: function () {
      tone(520, 0.35, { type: 'sawtooth', vol: 0.1, slideTo: 110 });
      clack(0, 0.8);
    },
    home: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.1 });
      });
    },
    win: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) {
        tone(f, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.12 });
      });
    },
    invalid: function () {
      tone(190, 0.16, { type: 'square', vol: 0.07 });
    },
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      try { root.localStorage.setItem('ludo-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      return muted;
    }
  };

  root.SoundFX = FX;
})(window);
