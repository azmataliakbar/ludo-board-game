# Ludo Board Game

A colourful, ad-free Ludo for 1 to 4 players, built with plain HTML, CSS and JavaScript.
No libraries, no network calls, no tracking.

## Play

Open `index.html` in any modern browser. No server is needed.

- **Setup:** pick 1 to 4 players. Each seat can be Human, Computer, or Off.
  - 1 player: you against 3 computers.
  - 2 players: red and yellow, opposite each other.
  - 3 or 4 players: local hot-seat play.
- **Roll:** click **Roll dice** or press **Space**.
- **Move:** if you have one legal move, it is played automatically. Otherwise click a glowing token.
- **Rules:**
  - A 6 brings a token out of its yard onto its start square.
  - Landing on an opponent's token on a normal square sends it back to its yard.
  - Start squares and the square 8 steps after each start are safe.
  - Rolling a 6, capturing, or reaching home gives you another roll.
  - Three 6s in a row lose the turn.
  - An exact roll is needed to reach the centre.
  - Players are ranked in the order they finish.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure: setup screen, board, panel, winner overlay |
| `css/style.css` | Board, token, dice, and layout styles |
| `js/logic.js` | Rules engine: board geometry, moves, captures, turn helpers, computer AI, fair dice |
| `js/sound.js` | Sound effects generated with the Web Audio API |
| `js/game.js` | UI: rendering, animations, turn flow |
| `tests/logic.test.js` | Rules tests (run with Node) |

## Math

- The board is a 15 x 15 grid. Each token has a progress value from 0 to 57:
  - 0 is the yard.
  - 1 to 51 are the shared track.
  - 52 to 56 are the home column.
  - 57 is the centre.
- Track positions use modular arithmetic on 52 squares, so each colour's path wraps around the board.
- Dice use `crypto.getRandomValues` with rejection sampling. Values that would make some faces more likely than others are discarded, so each face is exactly 1/6.

## Tests

```bash
node --test tests/logic.test.js
```

The tests cover the board geometry (52-square track, 225 cells with no overlaps), yard exits, exact finishes, captures, safe squares, ranking, and dice fairness.
