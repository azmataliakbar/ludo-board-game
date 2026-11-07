/*
 * Ludo rules engine. Pure logic: no DOM, no randomness except the injected
 * random source. Works in the browser (window.LudoLogic) and in Node (require).
 *
 * Board: 15 x 15 grid, coordinates are [row, col].
 * Progress per token: 0 = in yard, 1..51 = shared track (51 squares),
 *                     52..56 = own home column, 57 = finished (centre).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LudoLogic = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['red', 'green', 'yellow', 'blue'];
  // Index into TRACK where each colour's progress 1 square sits.
  var START = { red: 1, green: 14, yellow: 27, blue: 40 };
  var TRACK_LEN = 52;
  var TRACK_STEPS = 51;   // progress 1..51 uses the shared track
  var HOME_FIRST = 52;    // progress 52..56 are the home column
  var FINISH = 57;        // progress 57 = centre
  var BOARD_SIZE = 15;
  var CENTRE = [7, 7];

  // The 52 shared track squares, clockwise.
  var TRACK = [];
  (function buildTrack() {
    var add = function (r, c) { TRACK.push([r, c]); };
    var c, r;
    for (c = 0; c <= 5; c++) add(6, c);
    for (r = 5; r >= 0; r--) add(r, 6);
    add(0, 7); add(0, 8);
    for (r = 1; r <= 5; r++) add(r, 8);
    for (c = 9; c <= 14; c++) add(6, c);
    add(7, 14); add(8, 14);
    for (c = 13; c >= 9; c--) add(8, c);
    for (r = 9; r <= 14; r++) add(r, 8);
    add(14, 7); add(14, 6);
    for (r = 13; r >= 9; r--) add(r, 6);
    for (c = 5; c >= 0; c--) add(8, c);
    add(7, 0);
  })();

  // Home columns, progress 52..56 in order (first entry is next to the track).
  var HOME = {
    red:    [1, 2, 3, 4, 5].map(function (c) { return [7, c]; }),
    green:  [1, 2, 3, 4, 5].map(function (r) { return [r, 7]; }),
    yellow: [13, 12, 11, 10, 9].map(function (c) { return [7, c]; }),
    blue:   [13, 12, 11, 10, 9].map(function (r) { return [r, 7]; })
  };

  // Yards: 6x6 corner blocks. Token slots are the four inner cells.
  var YARD_ORIGIN = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
  var YARD_SPOTS = [[1, 1], [1, 4], [4, 1], [4, 4]];

  // Safe squares: each colour's start square and the square 8 steps after it.
  var SAFE = new Set();
  COLORS.forEach(function (col) {
    SAFE.add(START[col]);
    SAFE.add((START[col] + 8) % TRACK_LEN);
  });

  function yardCoord(color, tokenIndex) {
    var o = YARD_ORIGIN[color];
    var s = YARD_SPOTS[tokenIndex];
    return [o[0] + s[0], o[1] + s[1]];
  }

  // Where a token with this progress sits.
  function positionOf(color, progress) {
    if (progress <= 0) return { zone: 'yard' };
    if (progress <= TRACK_STEPS) {
      var idx = (START[color] + progress - 1) % TRACK_LEN;
      return { zone: 'track', idx: idx, coord: TRACK[idx] };
    }
    if (progress < FINISH) {
      return { zone: 'home', coord: HOME[color][progress - HOME_FIRST] };
    }
    return { zone: 'finish', coord: CENTRE };
  }

  // Token indices that may legally move with this roll.
  // A token leaves the yard only on a 6, and must not overshoot the centre.
  function legalTokens(tokens, dice) {
    var out = [];
    tokens.forEach(function (p, i) {
      if (p === 0) {
        if (dice === 6) out.push(i);
      } else if (p + dice <= FINISH) {
        out.push(i);
      }
    });
    return out;
  }

  function createGame(seats) {
    return {
      players: seats.map(function (s) {
        return { color: s.color, human: !!s.human, tokens: [0, 0, 0, 0], rank: null };
      }),
      turn: 0,
      nextRank: 1
    };
  }

  function activeCount(game) {
    return game.players.filter(function (p) { return p.rank === null; }).length;
  }

  function isOver(game) {
    return activeCount(game) === 0;
  }

  // Next player (clockwise) who has not finished. Returns `from` if nobody else is left.
  function nextPlayer(game, from) {
    var n = game.players.length;
    for (var k = 1; k <= n; k++) {
      var i = (from + k) % n;
      if (game.players[i].rank === null) return i;
    }
    return from;
  }

  function markFinished(game, pi) {
    var p = game.players[pi];
    if (p.rank === null && p.tokens.every(function (t) { return t === FINISH; })) {
      p.rank = game.nextRank++;
    }
    // In a multi-player game the last unfinished player is ranked automatically.
    if (game.players.length > 1 && activeCount(game) === 1) {
      game.players.find(function (q) { return q.rank === null; }).rank = game.nextRank++;
    }
  }

  // Applies a move. Assumes the move is legal (throws otherwise).
  // Returns { from, to, captured: [{player, token}], finished, enteredHome }.
  function moveToken(game, pi, t, dice) {
    var player = game.players[pi];
    var from = player.tokens[t];
    if (!((from === 0 && dice === 6) || (from > 0 && from + dice <= FINISH))) {
      throw new Error('illegal move');
    }
    var to = from === 0 ? 1 : from + dice;
    player.tokens[t] = to;

    var captured = [];
    var pos = positionOf(player.color, to);
    if (pos.zone === 'track' && !SAFE.has(pos.idx)) {
      game.players.forEach(function (other, oi) {
        if (oi === pi) return;
        other.tokens.forEach(function (q, ti) {
          if (q >= 1 && q <= TRACK_STEPS && positionOf(other.color, q).idx === pos.idx) {
            other.tokens[ti] = 0;
            captured.push({ player: oi, token: ti });
          }
        });
      });
    }

    markFinished(game, pi);
    return {
      from: from,
      to: to,
      captured: captured,
      finished: to === FINISH,
      enteredHome: to >= HOME_FIRST
    };
  }

  // Simple computer player: prefers captures, leaving the yard, reaching home.
  function chooseComputerMove(game, pi, dice) {
    var player = game.players[pi];
    var options = legalTokens(player.tokens, dice);
    if (!options.length) return null;

    var best = options[0];
    var bestScore = -Infinity;
    options.forEach(function (t) {
      var from = player.tokens[t];
      var to = from === 0 ? 1 : from + dice;
      var pos = positionOf(player.color, to);
      var score = 0;

      if (from === 0) score += 40;
      if (pos.zone === 'track') {
        if (SAFE.has(pos.idx)) {
          score += 15;
        } else {
          game.players.forEach(function (other, oi) {
            if (oi === pi) return;
            other.tokens.forEach(function (q) {
              if (q >= 1 && q <= TRACK_STEPS && positionOf(other.color, q).idx === pos.idx) {
                score += 100;
              }
            });
          });
        }
      }
      if (to >= HOME_FIRST) score += 60;
      if (to === FINISH) score += 100;
      score += to / 10;

      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    });
    return best;
  }

  // Unbiased die from a uint32 source: values >= limit are rejected so every face is equally likely.
  function unbiasedDie(randomUint32) {
    var limit = Math.floor(0x100000000 / 6) * 6;
    var x;
    do {
      x = randomUint32();
    } while (x >= limit);
    return (x % 6) + 1;
  }

  function cryptoUint32() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0];
    }
    return Math.floor(Math.random() * 0x100000000);
  }

  return {
    COLORS: COLORS,
    START: START,
    TRACK: TRACK,
    TRACK_LEN: TRACK_LEN,
    TRACK_STEPS: TRACK_STEPS,
    HOME: HOME,
    HOME_FIRST: HOME_FIRST,
    FINISH: FINISH,
    BOARD_SIZE: BOARD_SIZE,
    CENTRE: CENTRE,
    YARD_ORIGIN: YARD_ORIGIN,
    YARD_SPOTS: YARD_SPOTS,
    SAFE: SAFE,
    yardCoord: yardCoord,
    positionOf: positionOf,
    legalTokens: legalTokens,
    createGame: createGame,
    activeCount: activeCount,
    isOver: isOver,
    nextPlayer: nextPlayer,
    moveToken: moveToken,
    chooseComputerMove: chooseComputerMove,
    unbiasedDie: unbiasedDie,
    cryptoUint32: cryptoUint32
  };
});
