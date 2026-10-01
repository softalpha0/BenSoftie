# Palm Pals (MVP)

A hands-first puppet show for the Meta VR Start Developer Competition 2026.
Make a pose and a felt character appears on your real hand.

| Pose | Character |
| --- | --- |
| Sock puppet: fingers on top, thumb below. Open and close to talk | Grumble the dragon |
| Hand hanging down, fingers loose | Chef Ink the octopus |
| Index and middle finger out, ring and pinky curled | Courier Crab |
| Fingers spread wide, pointing up | The Five (a head on each fingertip) |
| Fist | Pause (the character curls up) |

It runs in two places from the same code:

- **Laptop webcam**: puppets drawn over your hand on screen. Good for building and testing.
- **Meta Quest browser**: passthrough AR with hand tracking. This is the real target.

## Run it on your computer

The camera only works on `localhost` or HTTPS, so open it through a local server rather than double-clicking the file.

```bash
cd palm-pals
npx serve .
```

Then open the address it prints (usually http://localhost:3000).

- `index.html` is the app. Click **Try with webcam**.
- `gallery.html` shows all four characters on a stand-in hand, no camera needed.
- Press **D** in the app to see the pose numbers (handy for tuning the thresholds in `hands.js`).

## Run it on a Quest

The headset needs an HTTPS address. The easiest way is GitHub Pages:

1. On GitHub, open the repo's **Settings → Pages** and publish from the branch that has this folder.
2. On the Quest, turn on hand tracking (**Settings → Movement tracking → Hand tracking**).
3. Open `https://<your-username>.github.io/<repo>/palm-pals/` in the Quest browser and tap **Enter passthrough (Quest)**.
4. Put the controllers down and hold your hands up.

## Files

- `hands.js` turns 21 hand points into a pose. Shared by both modes, and has no dependencies.
- `puppets.js` builds the felt characters from the hand points with three.js.
- `main.js` handles webcam mode (MediaPipe hand tracking), Quest mode (WebXR) and the optional voice input.
- `demo-hands.js` makes fake hands in each pose for the tests and the gallery.
- `tests/` checks the pose logic: `npm test` (needs Node 20+).

## What's not in the MVP yet

Recording a clip, per-character voice pitch, unlockable hats, a guided 10-minute episode, and a native Quest build.
