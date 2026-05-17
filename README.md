# Flip 7 True MCTS Device Version

This version runs the strategy engine on your device in a Web Worker.

## What is different?

- The UI still runs in `app.js`.
- Heavy calculations run in `mcts-worker.js`.
- Your phone/browser simulates thousands of possible futures without freezing the screen.
- No Firebase and no server are required.

## Strategy Engine

The worker estimates:
- HIT vs STAY
- win chance for each move
- bust risk
- future turns
- opponent behavior
- action-card approximations
- game score and target score

## Settings

In the setup menu:
- Strategy engine: True MCTS on this device
- MCTS speed:
  - Fast, about 250 ms
  - Balanced, about 500 ms
  - Deep, about 1 second
  - Very deep, about 2 seconds

## Running

Upload all files to GitHub Pages.

Required files:
- `index.html`
- `style.css`
- `app.js`
- `mcts-worker.js`
- `cards/`

## Note

This is intentionally time-limited. Instead of trying to calculate every possible future exactly, it simulates as many futures as it can within the selected time budget.
