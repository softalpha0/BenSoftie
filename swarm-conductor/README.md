# Swarm Conductor

Twenty-four drones. No controller. Your hand is the baton.
Guide the swarm through the night sky to paint giant light-show shapes. Every drone that
locks into the shape plays a note, so each shape plays a little melody, and every finished
shape spins and ends in fireworks.
Built for the Gaming track of the Meta VR Start Developer Competition 2026.

## The show

Five acts, each a shape made of glowing slots: **Star → Heart → Infinity → Smile → Galaxy**.
Fly the swarm through a slot and the nearest drone locks in. Fill every slot to finish the act.

| Gesture | Command | What the drones do | Paints slots? |
| --- | --- | --- | --- |
| Point | Go there | Fly to where your index finger aims | Yes |
| Pinch | Carry | Bunch up at your fingertips and follow them | Yes |
| Two fingers | Orbit | Circle your fingertips | Yes |
| Open hand | Gather | Come home and hover over your palm | No |
| Fist | Hold | Freeze in place | No |

## Three ways to play

- **Conduct in your room (Quest):** the show happens in passthrough, about an arm's length in front of you, with your real hands. A small scoreboard floats above the stage.
- **Conduct with your webcam:** the show plays over a miniature night city, and a hologram copy of your hand appears on stage.
- **Watch the show:** a scripted hand plays through the acts. The landing page also runs this live behind the menu.

## Run it

From the repository root (the game shares hand-tracking code with `../palm-pals`):

```bash
npx serve .
```

Then open `http://localhost:3000/swarm-conductor/`. The address `?demo` jumps straight into the show.

On a Quest the page needs HTTPS, for example GitHub Pages. Turn on hand tracking in the Quest settings, open the page in the Quest browser, and tap **Conduct in your room**.

## How it's built

Plain WebXR and three.js, the same stack the Immersive Web SDK (IWSDK) is built on. Nothing needs installing or building.

- `gestures.js` turns 21 hand points into a command. Reuses `../palm-pals/hands.js`.
- `drones.js` has the quadcopter model, flight behaviour (banking, spacing, light trails) and the swarm commands.
- `show.js` has the five shapes, the lock-in slots, the finale spin and the fireworks.
- `sound.js` synthesises every sound live: rotor hum, a note per drone, finale chords, firework pops.
- `world.js` has the night city, stars and the hologram hand.
- `main.js` handles input (webcam, headset, scripted demo), the HUD and rendering with bloom.
- `tests/` checks gesture detection: `npm test` from this folder.
