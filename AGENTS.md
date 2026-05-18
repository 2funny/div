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
- `src/game/types/`: core state, map, item, combat, quest, and UI types.
- `src/game/random.ts`: injectable/seeded gameplay randomness helpers.
- `src/game/render/`: main UI rendering, map rendering, battle UI, side panels, modals, weather canvas.
- `src/game/audio/`: sound toggle, sound effects, dungeon BGM, battle BGM, profiles, and low-level Web Audio helpers.
- `src/game/constants/`: classes, assets, equipment labels, system constants, themes, floor effects.
- `src/game/equipment/`: equipment factories, starter gear, weapon rules, equipment scoring, and equipment name dictionaries.
- `src/game/floor/`: floor generation, map generation, map geometry, rooms, special floor terrain.
- `src/game/interaction/`: movement, visibility, and tile interactions.
- `src/game/combat/`: combat actions, combat resolution, elements, enemy affixes, and battle FX state.
- `src/game/inventory/`: inventory, equipment actions, shop, forge, item use.
- `src/game/quest/`: quest state, quest rewards, quest definitions, and lore.
- `src/game/save/`: save slots, save keys, save index, and persistence.
- `src/ui/dom.ts`: `byId` and `requiredById`.
- `src/ui/bindEvents.ts`: static event binding and global input handlers.
- `tests/*.test.js`: Node-based behavior tests using the Vite test harness build.

## Runtime Rules

- Do not reintroduce `// @ts-nocheck` in `src/game`; fix local types instead.
- Use `src/game/random.ts` for gameplay randomness so tests can inject deterministic RNG.
- Escape save/user/state-controlled text with `escapeHtml()` from `src/game/render/html.ts` before placing it in `innerHTML`.
- `floorStates` is a bounded floor cache, not permanent world history; keep save-size changes deliberate.
- Save slots currently use `SAVE_SLOT_LIMIT = 8`.

## Combat Rules

- Normal attack damage is centralized in combat: `damage = atk * 1 - enemy.def * 0.45`.
- Do not add `spd` to normal attack damage.
- Critical chance is `0.06 + luk * 0.008`; critical multiplier is `1.7`.
- Luck only affects critical chance unless a future design explicitly changes that.
- Speed affects turn order, normal-attack combo chance, ranger follow-up chance, and dodge (`baseDodge + spd * 0.005`).
- Skills spend MP and use turn-based cooldowns stored in `state.skillCooldowns`.
- Skill-triggered combos should be extra effects such as an additional normal attack or element/status bonus; they should not recursively cast the same skill.
- Keep element interactions and enemy defense mitigation in the shared combat path instead of duplicating damage formulas in class definitions.

## Common Change Points

- Weather visuals: `.map-stage.effect-rain`, `.effect-snow`, `.effect-lava` in `src/styles.css`.
- Lava/snow/rain tile treatment: `.lava`, `.effect-snow .floor`, `.effect-rain .floor`, `.effect-lava .floor` in `src/styles.css`.
- BGM: `scheduleDungeonMotif()` and `scheduleBattlePulse()` in `src/game/audio/audioRuntime.ts`.
- Short sound effects: `src/game/audio/audioProfiles.ts`.
- Map tile HTML: `renderMap()` in `src/game/render/renderRuntime.ts`.
- Battle screen: `renderBattleView()` and `renderBattleCommandPanel()` in `src/game/render/renderRuntime.ts`.
- Combat formula, ranger combo, skill MP/cooldowns: `src/game/combat/combatRuntime.ts` and `src/game/constants/classes.ts`.
- Floor effect definitions: `FLOOR_EFFECTS` in `src/game/constants/world.ts`.
- Floor effect generation/application: `chooseFloorEffect()` and effect terrain helpers in `src/game/floor/floorRuntime.ts`.
- Save compatibility and floor cache compaction: `src/game/save/saveRuntime.ts`.

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

Run coverage summary when changing CI/testing or after broad gameplay work:

```bash
npm run test:coverage
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
