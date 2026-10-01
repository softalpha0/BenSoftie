# Swarm Conductor (MVP)

Twelve tiny drones, no controller. Your hand is the remote.
Guide the swarm into glowing beacons to light them up before the 90-second round ends.
Built for the Gaming track of the Meta VR Start Developer Competition 2026.

| Gesture | Command | What the drones do |
| --- | --- | --- |
| Open hand | Gather | Hover in a ring over your palm |
| Point | Go there | Fly to where your index finger aims |
| Index and middle finger out | Orbit | Circle your fingertips |
| Pinch (thumb on index tip) | Carry | Bunch up at your fingertips and follow them |
| Fist | Hold | Freeze in place |

A beacon lights up when 4 drones stay inside its ring for a moment.

## Try it

From the repository root (not this folder, because it shares code with `../palm-pals`):

```bash
npx serve .
```

Then open `http://localhost:3000/swarm-conductor/`.

- **Watch demo** plays a scripted hand, no camera needed. You can also add `?demo` to the address.
- **Play with webcam** uses your laptop camera.
- **Play in passthrough (Quest)** needs the page on HTTPS (for example GitHub Pages) and hand tracking turned on in the Quest settings. The drones fly in the space in front of you, within arm's reach.

## Files

- `gestures.js` turns 21 hand points into a command. Reuses `../palm-pals/hands.js`.
- `swarm.js` handles the drones, beacons, scoring and round timer.
- `main.js` handles webcam mode, Quest mode and the demo.
- `tests/` checks gesture detection: `npm test` from this folder.

## Not in the MVP yet

Sound (rotor hum, beacon chimes), levels and obstacles, two-hand commands, drones that bounce off your real furniture, and a native Quest build.
