/*
 * Ludo UI controller: setup screen, board rendering, turn flow and animations.
 * All rules live in logic.js.
 */
(function () {
  'use strict';

  var L = window.LudoLogic;
  var FX = window.SoundFX;

  var NAMES = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
  var SEAT_LABEL = { H: 'Human', C: 'Computer', O: 'Off' };
  var SEAT_NEXT = { H: 'C', C: 'O', O: 'H' };
  // Seat codes in colour order (red, green, yellow, blue).
  var PRESETS = { 1: 'HCCC', 2: 'HOHO', 3: 'HHHO', 4: 'HHHH' };
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // Small offsets so tokens sharing a square stay visible.
  var OFFSETS = [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]];
  var TOKEN_PCT = 5.4;
  var BOARD = 15;

  var $ = function (sel) { return document.querySelector(sel); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var key = function (r, c) { return r + ',' + c; };
  var boardEl = $('#board');

  var state = {
    seats: 'HCCC'.split(''),   // seat codes per colour
    game: null,
    tokenEls: [],             // [player][token] -> button element
    override: null,           // {p, t, progress} while a token is animating
    phase: 'idle',            // idle | roll | move | busy | over
    sixes: 0,
    legal: [],
    dice: 0
  };

  // ---------- setup screen ----------

  function renderSetup() {
    var humans = state.seats.filter(function (s) { return s === 'H'; }).length;
    document.querySelectorAll('[data-count]').forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-count')) === humans);
    });
    var rows = $('#seat-rows');
    rows.innerHTML = '';
    L.COLORS.forEach(function (col, i) {
      var code = state.seats[i];
      var btn = document.createElement('button');
      btn.className = 'seat seat-' + col + ' code-' + code;
      btn.innerHTML = '<span class="chip"></span><span class="seat-name">' + NAMES[col] +
        '</span><em>' + SEAT_LABEL[code] + '</em>';
      btn.addEventListener('click', function () {
        state.seats[i] = SEAT_NEXT[code];
        renderSetup();
      });
      rows.appendChild(btn);
    });
    var active = state.seats.filter(function (s) { return s !== 'O'; }).length;
    $('#start-btn').disabled = active < 2;
  }

  document.querySelectorAll('[data-count]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.seats = PRESETS[Number(b.getAttribute('data-count'))].split('');
      renderSetup();
    });
  });

  // ---------- board ----------

  function place(el, r, c, h, w) {
    el.style.left = (c * 100 / BOARD) + '%';
    el.style.top = (r * 100 / BOARD) + '%';
    el.style.width = (w * 100 / BOARD) + '%';
    el.style.height = (h * 100 / BOARD) + '%';
  }

  function buildBoard() {
    boardEl.querySelectorAll('.cell, .yard, .centre').forEach(function (n) { n.remove(); });

    var track = new Map();
    L.TRACK.forEach(function (rc, i) { track.set(key(rc[0], rc[1]), i); });
    var home = new Map();
    L.COLORS.forEach(function (col) {
      L.HOME[col].forEach(function (rc) { home.set(key(rc[0], rc[1]), col); });
    });
    var starts = new Map();
    L.COLORS.forEach(function (col) {
      var rc = L.TRACK[L.START[col]];
      starts.set(key(rc[0], rc[1]), col);
    });

    for (var r = 0; r < BOARD; r++) {
      for (var c = 0; c < BOARD; c++) {
        var k = key(r, c);
        var cls;
        if (track.has(k)) {
          cls = 'cell track';
          if (starts.has(k)) cls += ' start s-' + starts.get(k);
          else if (L.SAFE.has(track.get(k))) cls += ' safe';
        } else if (home.has(k)) {
          cls = 'cell home h-' + home.get(k);
        } else {
          continue;
        }
        var d = document.createElement('div');
        d.className = cls;
        d.style.gridRow = String(r + 1);
        d.style.gridColumn = String(c + 1);
        boardEl.appendChild(d);
      }
    }

    L.COLORS.forEach(function (col) {
      var o = L.YARD_ORIGIN[col];
      var yard = document.createElement('div');
      yard.className = 'yard y-' + col;
      place(yard, o[0], o[1], 6, 6);
      boardEl.appendChild(yard);
      L.YARD_SPOTS.forEach(function (sp) {
        var slot = document.createElement('div');
        slot.className = 'slot';
        place(slot, o[0] + sp[0], o[1] + sp[1], 1, 1);
        boardEl.appendChild(slot);
      });
    });

    var centre = document.createElement('div');
    centre.className = 'centre';
    place(centre, 6, 6, 3, 3);
    boardEl.appendChild(centre);
  }

  function buildTokens() {
    boardEl.querySelectorAll('.token').forEach(function (n) { n.remove(); });
    state.tokenEls = [];
    state.game.players.forEach(function (p, pi) {
      state.tokenEls[pi] = [];
      for (var t = 0; t < 4; t++) {
        var el = document.createElement('button');
        el.className = 'token t-' + p.color;
        el.setAttribute('aria-label', NAMES[p.color] + ' token ' + (t + 1));
        el.addEventListener('click', (function (pi2, t2) {
          return function () { onToken(pi2, t2); };
        })(pi, t));
        boardEl.appendChild(el);
        state.tokenEls[pi][t] = el;
      }
    });
  }

  function progressOf(pi, t) {
    var o = state.override;
    if (o && o.p === pi && o.t === t) return o.progress;
    return state.game.players[pi].tokens[t];
  }

  function renderAll() {
    var items = [];
    state.game.players.forEach(function (p, pi) {
      for (var t = 0; t < 4; t++) {
        var pos = L.positionOf(p.color, progressOf(pi, t));
        var inYard = pos.zone === 'yard';
        items.push({
          pi: pi, t: t, inYard: inYard,
          coord: inYard ? L.yardCoord(p.color, t) : pos.coord
        });
      }
    });

    // Group tokens that share a square so they can be offset.
    var groups = {};
    items.forEach(function (it) {
      if (it.inYard) return;
      var k = key(it.coord[0], it.coord[1]);
      (groups[k] = groups[k] || []).push(it);
    });

    items.forEach(function (it) {
      var off = [0, 0];
      if (!it.inYard) {
        var g = groups[key(it.coord[0], it.coord[1])];
        if (g.length > 1) off = OFFSETS[g.indexOf(it) % 4];
      }
      var x = (it.coord[1] + 0.5) * 100 / BOARD + off[0];
      var y = (it.coord[0] + 0.5) * 100 / BOARD + off[1];
      var el = state.tokenEls[it.pi][it.t];
      el.style.left = 'calc(' + x + '% - ' + (TOKEN_PCT / 2) + '%)';
      el.style.top = 'calc(' + y + '% - ' + (TOKEN_PCT / 2) + '%)';
    });
    updateMovable();
  }

  function updateMovable() {
    updateTurnIndicator();
    var current = state.game ? state.game.turn : -1;
    state.tokenEls.forEach(function (row, pi) {
      row.forEach(function (el, t) {
        el.classList.toggle('movable',
          state.phase === 'move' && pi === current && state.legal.indexOf(t) !== -1);
      });
    });
  }

  // ---------- dice ----------

  function showFace(n) {
    var die = $('#die');
    die.innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var s = document.createElement('span');
      s.className = 'pip' + (PIPS[n].indexOf(i) !== -1 ? ' on' : '');
      die.appendChild(s);
    }
  }

  function animateDie(value) {
    return new Promise(function (resolve) {
      var die = $('#die');
      die.classList.remove('rolling');
      void die.offsetWidth; // restart the CSS animation
      die.classList.add('rolling');
      FX.roll();
      var iv = setInterval(function () {
        showFace(1 + Math.floor(Math.random() * 6));
      }, 80);
      setTimeout(function () {
        clearInterval(iv);
        die.classList.remove('rolling');
        showFace(value);
        resolve();
      }, 900);
    });
  }

  // ---------- messages and panel ----------

  function msg(text) {
    $('#msg').textContent = text;
  }

  function renderPanel() {
    var list = $('#players');
    list.innerHTML = '';
    state.game.players.forEach(function (p, pi) {
      var li = document.createElement('li');
      var done = p.tokens.filter(function (t) { return t === L.FINISH; }).length;
      li.className = 'pl p-' + p.color + (pi === state.game.turn && state.phase !== 'over' ? ' active' : '');
      li.innerHTML = '<span class="dot"></span><strong>' + NAMES[p.color] + '</strong>' +
        '<small>' + (p.human ? 'Player' : 'Computer') + '</small>' +
        '<span class="done">' + done + '/4 home</span>' +
        (p.rank ? '<span class="rank">#' + p.rank + '</span>' : '');
      list.appendChild(li);
    });
    updateTurnIndicator();
  }

  // ---------- turn indicator (banner, board glow, active yard, dice ring) ----------

  function updateTurnIndicator() {
    if (!state.game) return;
    var p = currentPlayer();
    var color = state.phase === 'over' ? null : p.color;
    var kind;
    if (state.phase === 'over') kind = 'Game over';
    else if (state.phase === 'roll') kind = p.human ? 'Your roll: tap Roll or press Space' : 'Computer is rolling';
    else if (state.phase === 'move') kind = 'Tap a glowing token';
    else kind = 'Moving...';

    $('#turn-banner').className = 'turn-banner' + (color ? ' c-' + color : '');
    $('#turn-text').textContent = color ? NAMES[color] + "'s turn" : 'Game over';
    $('#turn-kind').textContent = kind;
    $('.dice-card').className = 'card dice-card' + (color ? ' c-' + color : '');

    boardEl.dataset.turn = color || '';
    boardEl.querySelectorAll('.yard').forEach(function (y) {
      y.classList.toggle('turn', !!color && y.classList.contains('y-' + color));
    });
  }

  // ---------- turn flow ----------

  function currentPlayer() {
    return state.game.players[state.game.turn];
  }

  function beginTurn() {
    var p = currentPlayer();
    state.phase = 'roll';
    renderPanel();
    if (p.human) {
      $('#roll-btn').disabled = false;
      msg(NAMES[p.color] + ': roll the dice');
    } else {
      $('#roll-btn').disabled = true;
      msg(NAMES[p.color] + ' (computer) is rolling');
      setTimeout(rollNow, 500);
    }
  }

  function endTurn(extra) {
    var g = state.game;
    if (L.isOver(g)) return showWinner();
    if (!extra || currentPlayer().rank !== null) {
      g.turn = L.nextPlayer(g, g.turn);
    }
    beginTurn();
  }

  async function rollNow() {
    if (state.phase !== 'roll') return;
    state.phase = 'busy';
    $('#roll-btn').disabled = true;
    updateTurnIndicator();
    var value = L.unbiasedDie(L.cryptoUint32);
    await animateDie(value);
    await handleRoll(value);
  }

  async function handleRoll(v) {
    var pi = state.game.turn;
    var p = state.game.players[pi];
    state.dice = v;
    state.sixes = v === 6 ? state.sixes + 1 : 0;

    if (state.sixes === 3) {
      msg(NAMES[p.color] + ' rolled three 6s in a row. Turn lost.');
      FX.invalid();
      state.sixes = 0;
      return endTurn(false);
    }

    var legal = L.legalTokens(p.tokens, v);
    if (!legal.length) {
      msg(NAMES[p.color] + ' rolled a ' + v + ': no moves');
      FX.invalid();
      await wait(600);
      return endTurn(false);
    }

    if (legal.length === 1) {
      return performMove(pi, legal[0], v);
    }

    if (!p.human) {
      await wait(400);
      return performMove(pi, L.chooseComputerMove(state.game, pi, v), v);
    }

    state.phase = 'move';
    state.legal = legal;
    updateMovable();
    msg(NAMES[p.color] + ' rolled a ' + v + ': pick a token');
  }

  function onToken(pi, t) {
    if (state.phase !== 'move') return;
    if (pi !== state.game.turn) return;
    if (state.legal.indexOf(t) === -1) return;
    performMove(pi, t, state.dice);
  }

  async function performMove(pi, t, v) {
    state.phase = 'busy';
    state.legal = [];
    updateMovable();

    var g = state.game;
    var p = g.players[pi];
    var from = p.tokens[t];
    var to = from === 0 ? 1 : from + v;

    // Animate square by square. The real state changes once at the end.
    for (var s = from === 0 ? 1 : from + 1; s <= to; s++) {
      state.override = { p: pi, t: t, progress: s };
      renderAll();
      FX.move();
      await wait(from === 0 ? 220 : 150);
    }
    state.override = null;

    var ev = L.moveToken(g, pi, t, v);
    renderAll();
    renderPanel();

    var parts = [NAMES[p.color] + ' moved ' + v];
    if (ev.captured.length) {
      FX.capture();
      var names = ev.captured.map(function (c) { return NAMES[g.players[c.player].color]; });
      parts.push('captured ' + names.join(', ') + '!');
    }
    if (ev.finished) {
      FX.home();
      parts.push('a token reached home!');
    } else if (ev.enteredHome) {
      FX.move();
    }
    msg(parts.join(' '));

    await wait(150);
    if (L.isOver(g)) return showWinner();
    var extra = v === 6 || ev.captured.length > 0 || ev.finished;
    endTurn(extra);
  }

  // ---------- game lifecycle ----------

  function showSetup() {
    state.game = null;
    state.phase = 'idle';
    $('#winner').hidden = true;
    $('#game').hidden = true;
    $('#setup').hidden = false;
    renderSetup();
  }

  function startGame() {
    var seats = [];
    L.COLORS.forEach(function (col, i) {
      if (state.seats[i] !== 'O') seats.push({ color: col, human: state.seats[i] === 'H' });
    });
    state.game = L.createGame(seats);
    state.override = null;
    state.sixes = 0;
    state.legal = [];
    buildBoard();
    buildTokens();
    renderAll();
    $('#setup').hidden = true;
    $('#game').hidden = false;
    $('#winner').hidden = true;
    FX.unlock();
    msg('Game started. ' + NAMES[currentPlayer().color] + ' goes first.');
    beginTurn();
  }

  function showWinner() {
    state.phase = 'over';
    $('#roll-btn').disabled = true;
    renderPanel();
    var list = $('#ranking');
    list.innerHTML = '';
    state.game.players.slice().sort(function (a, b) { return a.rank - b.rank; }).forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'p-' + p.color;
      li.textContent = '#' + p.rank + '  ' + NAMES[p.color] + (p.human ? '' : ' (computer)');
      list.appendChild(li);
    });
    $('#winner').hidden = false;
    FX.win();
  }

  // ---------- wiring ----------

  $('#start-btn').addEventListener('click', startGame);
  $('#roll-btn').addEventListener('click', function () {
    if (state.phase === 'roll' && currentPlayer().human) rollNow();
  });
  $('#new-btn').addEventListener('click', showSetup);
  $('#again-btn').addEventListener('click', showSetup);

  var muteBtn = $('#mute-btn');
  muteBtn.textContent = FX.isMuted() ? 'Sound off' : 'Sound on';
  muteBtn.addEventListener('click', function () {
    muteBtn.textContent = FX.toggleMute() ? 'Sound off' : 'Sound on';
  });

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && state.phase === 'roll' && currentPlayer() && currentPlayer().human) {
      e.preventDefault();
      rollNow();
    }
  });

  showFace(1);
  renderSetup();
})();
