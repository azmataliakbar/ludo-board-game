'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

test('track has 52 unique squares and each step is adjacent', () => {
  assert.equal(L.TRACK.length, 52);
  assert.equal(new Set(L.TRACK.map(String)).size, 52);
  let diagonal = 0;
  for (let i = 0; i < 52; i++) {
    const [r1, c1] = L.TRACK[i];
    const [r2, c2] = L.TRACK[(i + 1) % 52];
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    assert.ok(dr <= 1 && dc <= 1 && dr + dc > 0, `bad step at ${i}`);
    if (dr === 1 && dc === 1) diagonal++;
  }
  // The track turns diagonally at the four inner corners of the cross.
  assert.equal(diagonal, 4);
});

test('every one of the 225 board cells belongs to exactly one area', () => {
  const cells = new Set();
  const add = ([r, c]) => cells.add(r + ',' + c);
  L.TRACK.forEach(add);
  L.COLORS.forEach((col) => L.HOME[col].forEach(add));
  for (let r = 6; r <= 8; r++) for (let c = 6; c <= 8; c++) add([r, c]);
  L.COLORS.forEach((col) => {
    const [r0, c0] = L.YARD_ORIGIN[col];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) add([r0 + r, c0 + c]);
  });
  assert.equal(cells.size, 225);
});

test('each colour starts on its own square and enters home from the right side', () => {
  assert.deepEqual(L.positionOf('red', 1).coord, [6, 1]);
  assert.deepEqual(L.positionOf('green', 1).coord, [1, 8]);
  assert.deepEqual(L.positionOf('yellow', 1).coord, [8, 13]);
  assert.deepEqual(L.positionOf('blue', 1).coord, [13, 6]);
  // Last track square before each home column.
  assert.deepEqual(L.positionOf('red', 51).coord, [7, 0]);
  assert.deepEqual(L.positionOf('green', 51).coord, [0, 7]);
  assert.deepEqual(L.positionOf('yellow', 51).coord, [7, 14]);
  assert.deepEqual(L.positionOf('blue', 51).coord, [14, 7]);
});

test('a token leaves the yard only with a 6', () => {
  assert.deepEqual(L.legalTokens([0, 0, 0, 0], 5), []);
  assert.deepEqual(L.legalTokens([0, 0, 0, 0], 6), [0, 1, 2, 3]);
  assert.deepEqual(L.legalTokens([0, 1, 0, 0], 6), [0, 1, 2, 3]);
});

test('an exact roll is needed to finish', () => {
  assert.deepEqual(L.legalTokens([55], 2), [0]);
  assert.deepEqual(L.legalTokens([55], 3), []);
  assert.deepEqual(L.legalTokens([57], 1), []);
});

test('leaving the yard puts the token on its start square', () => {
  const game = L.createGame([{ color: 'red', human: true }, { color: 'green', human: true }]);
  const ev = L.moveToken(game, 0, 0, 6);
  assert.equal(ev.to, 1);
  assert.deepEqual(L.positionOf('red', game.players[0].tokens[0]).coord, [6, 1]);
});

test('landing on an opponent on a normal square captures it', () => {
  const game = L.createGame([{ color: 'red', human: true }, { color: 'green', human: true }]);
  // Red progress 5 is track index 5. Green progress 44 is also index 5.
  game.players[0].tokens[0] = 4;
  game.players[1].tokens[0] = 44;
  const ev = L.moveToken(game, 0, 0, 1);
  assert.equal(ev.captured.length, 1);
  assert.equal(game.players[1].tokens[0], 0);
});

test('a safe square protects the opponent from capture', () => {
  const game = L.createGame([{ color: 'red', human: true }, { color: 'green', human: true }]);
  // Index 9 is safe (red start 1 + 8). Green progress 48 is index 9.
  game.players[0].tokens[0] = 8;
  game.players[1].tokens[0] = 48;
  const ev = L.moveToken(game, 0, 0, 1);
  assert.equal(ev.captured.length, 0);
  assert.equal(game.players[1].tokens[0], 48);
});

test('an illegal move throws', () => {
  const game = L.createGame([{ color: 'red', human: true }]);
  assert.throws(() => L.moveToken(game, 0, 0, 3));
});

test('the game ranks players in finish order and ends with one left', () => {
  const game = L.createGame([
    { color: 'red', human: true },
    { color: 'green', human: false },
    { color: 'blue', human: false }
  ]);
  game.players[0].tokens = [56, 57, 57, 57];
  L.moveToken(game, 0, 0, 1);
  assert.equal(game.players[0].rank, 1);
  assert.equal(L.isOver(game), false);
  game.players[1].tokens = [56, 57, 57, 57];
  L.moveToken(game, 1, 0, 1);
  assert.equal(game.players[1].rank, 2);
  assert.equal(game.players[2].rank, 3);
  assert.equal(L.isOver(game), true);
});

test('a solo game ends when the single player finishes all four tokens', () => {
  const game = L.createGame([{ color: 'red', human: true }]);
  game.players[0].tokens = [57, 57, 57, 56];
  L.moveToken(game, 0, 3, 1);
  assert.equal(game.players[0].rank, 1);
  assert.equal(L.isOver(game), true);
});

test('next player skips finished players', () => {
  const game = L.createGame([
    { color: 'red', human: true },
    { color: 'green', human: true },
    { color: 'blue', human: true }
  ]);
  game.players[1].rank = 1;
  assert.equal(L.nextPlayer(game, 0), 2);
});

test('computer prefers a capture over other moves', () => {
  const game = L.createGame([{ color: 'red', human: true }, { color: 'green', human: false }]);
  game.players[0].tokens = [4, 20, 0, 0];
  game.players[1].tokens = [44, 0, 0, 0];
  assert.equal(L.chooseComputerMove(game, 0, 1), 0);
});

test('unbiasedDie maps the random source onto 1..6', () => {
  assert.equal(L.unbiasedDie(() => 0), 1);
  assert.equal(L.unbiasedDie(() => 5), 6);
  assert.equal(L.unbiasedDie(() => 11), 6);
});

test('unbiasedDie rejects values above the unbiased range', () => {
  const values = [0xffffffff, 0xfffffffe, 2];
  let i = 0;
  assert.equal(L.unbiasedDie(() => values[i++]), 3);
});

test('dice faces are roughly uniform', () => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const n = 60000;
  for (let i = 0; i < n; i++) counts[L.unbiasedDie(L.cryptoUint32)]++;
  for (let f = 1; f <= 6; f++) {
    assert.ok(Math.abs(counts[f] - n / 6) < n / 6 * 0.05, `face ${f}: ${counts[f]}`);
  }
});
