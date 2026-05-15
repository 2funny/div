# AGENTS.md

## Project

Rune Dungeon is a Vite + TypeScript browser RPG. The game is mostly plain DOM, CSS, and Web Audio. Prefer small, local changes that follow the existing runtime split.

## User Rules

- Keep files UTF-8 without BOM.
- Chinese UI copy is expected.
- When adding or modifying code, pay attention to code quality, existing project conventions, and clear responsibility boundaries between modules. Avoid putting dictionaries, domain rules, rendering, persistence, or runtime orchestration into the wrong layer.
- If Java files are added later: entity classes need Swagger annotations, Lombok `@Data @AllArgsConstructor @NoArgsConstructor`, author `zhoubh`.
- Enum classes should contain `value` and `name` fields and provide lookup by `value`.

## Main Files

- `src/main.ts`: app entry.
- `index.html`: static DOM shell.
- `src/styles.css`: layout, panels, map tiles, weather, special floor visuals.
- `src/game/runtime.ts`: top-level game runtime composition and exported browser handlers.
- `src/game/render/`: main UI rendering, map rendering, battle UI, side panels, modals, weather canvas.
- `src/game/audio/`: sound toggle, sound effects, dungeon BGM, battle BGM, profiles, and low-level Web Audio helpers.
- `src/game/constants/`: classes, assets, equipment labels, system constants, themes, floor effects.
- `src/game/equipment/`: equipment factories, starter gear, weapon rules, and equipment name dictionaries.
- `src/game/floor/`: floor generation, map generation, map geometry, rooms, special floor terrain.
- `src/game/interaction/`: movement, visibility, and tile interactions.
- `src/game/combat/`: combat actions, combat resolution, enemy affixes, and battle FX state.
- `src/game/inventoryRuntime.ts`: inventory, equipment, shop, forge, item use.
- `src/game/quest/`: quest state, quest rewards, quest definitions, and lore.
- `src/game/save/`: save slots, save keys, save index, and persistence.
- `src/ui/dom.ts`: `byId` and `requiredById`.
- `src/ui/bindEvents.ts`: static event binding and global input handlers.
- `tests/*.test.js`: Node-based behavior tests using the Vite test harness build.

## Common Change Points

- Weather visuals: `.map-stage.effect-rain`, `.effect-snow`, `.effect-lava` in `src/styles.css`.
- Lava/snow/rain tile treatment: `.lava`, `.effect-snow .floor`, `.effect-rain .floor`, `.effect-lava .floor` in `src/styles.css`.
- BGM: `scheduleDungeonMotif()` and `scheduleBattlePulse()` in `src/game/audio/audioRuntime.ts`.
- Short sound effects: `src/game/audio/audioProfiles.ts`.
- Map tile HTML: `renderMap()` in `src/game/render/renderRuntime.ts`.
- Battle screen: `renderBattleView()` and `renderBattleCommandPanel()` in `src/game/render/renderRuntime.ts`.
- Floor effect definitions: `FLOOR_EFFECTS` in `src/game/constants/world.ts`.
- Floor effect generation/application: `chooseFloorEffect()` and effect terrain helpers in `src/game/floor/floorRuntime.ts`.

## DOM Rules

- Use `requiredById` only for static elements that must exist in `index.html`.
- For elements created dynamically during render, use `document.getElementById()` or `byId()` and create them when missing.
- Avoid inline assumptions that a render-only element already exists. `requiredById` throws immediately when missing.

## Style Guidance

- Keep UI dense and game-focused, not landing-page-like.
- Avoid obvious repeated stripe patterns for weather or terrain effects; prefer layered gradients, particles, texture, and subtle motion.
- Avoid UI text explaining controls unless it is part of existing game copy.
- Do not add decorative SVGs when CSS, existing assets, or generated bitmap assets are better suited.

## Verification

Run after meaningful changes:

```bash
npm run build
```

Run broader behavior checks when touching map generation, inventory, combat, saves, or exported runtime handlers:

```bash
npm test
```

For browser-only bugs, useful user-provided data:

- Console error with full stack trace.
- Reproduction steps.
- Relevant `state` fields only, not the whole object unless needed.
- Failed Network request URL/status/response with secrets removed.
- Screenshot for layout/visual bugs.

## Cautions

- The working tree may contain unrelated user changes. Do not revert them.
- `dist/` is build output; usually do not edit it directly.
- `node_modules/` is present; do not modify vendored dependencies.
- Watch for mojibake in older text, but do not rewrite unrelated content just to clean it up.
