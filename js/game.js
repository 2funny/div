let state = null;
let activeTab = "inventory";
let selectedTile = null;

const $ = (id) => document.getElementById(id);

// Random and ID helpers used by map generation, loot, and item creation.
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(list) {
  return list[rand(0, list.length - 1)];
}

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Create a new persistent hero state and enter the first floor.
function startGame(classId) {
  const cls = CLASSES[classId];
  state = {
    classId,
    floor: 1,
    level: 1,
    xp: 0,
    xpNext: 24,
    gold: 30,
    hp: cls.hp,
    maxHp: cls.hp,
    mp: cls.mp,
    maxMp: cls.mp,
    stats: { ...cls.stats },
    statPoints: 0,
    inventory: [
      potion("小型生命药水", "hp", 40),
      potion("小型法力药水", "mp", 25)
    ],
    materials: { "强化石": 1, "魔尘": 0 },
    runes: { "火焰1": 1, "守护1": 1 },
    equipment: starterEquipment(classId),
    map: null,
    player: { x: 1, y: 1 },
    currentEnemy: null,
    log: []
  };
  state.hp = effectiveMaxHp();
  state.mp = effectiveMaxMp();
  generateFloor();
  log(`你作为${cls.name}踏入了符文地牢。`);
  saveGame(false);
  render();
}

// Build the first equipment set for the chosen class.
function starterEquipment(classId) {
  const weapon = classId === "mage"
    ? item("学徒法杖", "weapon", "普通", { mag: 4 })
    : classId === "ranger"
      ? item("短弓", "weapon", "普通", { atk: 4, spd: 1 })
      : item("铁剑", "weapon", "普通", { atk: 5 });
  return {
    weapon,
    armor: item("旧皮甲", "armor", "普通", { def: 3, hp: 12 }),
    boots: null,
    ring: null,
    amulet: null
  };
}

// Factory for consumable item entries.
function potion(name, kind, amount) {
  return { id: uid(), kind: "potion", name, effect: kind, amount };
}

// Factory for equipment entries.
function item(name, slot, quality, stats, runeSlots = 0, runes = []) {
  return { id: uid(), kind: "equip", name, slot, quality, stats, runeSlots, runes, level: 0 };
}

// Resolve the visual and gameplay theme for a floor number.
function themeForFloor(floor) {
  return THEMES.find((theme) => theme.floors.includes(floor)) || THEMES[0];
}

// Generate a semi-random 9x9 floor with guaranteed path to the portal.
function generateFloor() {
  const size = 9;
  const theme = themeForFloor(state.floor);
  const map = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({
      x, y,
      terrain: x === 0 || y === 0 || x === size - 1 || y === size - 1 ? "wall" : "floor",
      object: null,
      seen: false,
      visible: false
    }))
  );

  if (state.floor === 10) {
    for (let y = 2; y < 7; y++) {
      for (let x = 2; x < 7; x++) map[y][x].terrain = "floor";
    }
    map[4][4].object = makeEnemy(true);
    map[2][2].object = { type: "altar" };
    map[2][6].object = { type: "forge" };
  } else {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if ((x === 1 && y === 1) || (x === size - 2 && y === size - 2)) continue;
        map[y][x].terrain = Math.random() < theme.wallRate ? "wall" : "floor";
      }
    }
    carvePath(map, 1, 1, size - 2, size - 2);
    scatter(map, "monster", 5 + Math.floor(state.floor / 2));
    scatter(map, "chest", 2);
    scatter(map, "trap", state.floor >= 4 ? 2 : 1);
    scatter(map, "altar", 1);
    if (state.floor % 3 === 1) scatter(map, "shop", 1);
    if (state.floor % 3 === 2) scatter(map, "forge", 1);
    map[size - 2][size - 2].object = { type: "portal" };
  }

  state.player = { x: 1, y: 1 };
  state.map = { size, theme: theme.id, cells: map };
  updateVisibility();
}

// Carve a simple guaranteed route so random walls cannot soft-lock the floor.
function carvePath(map, sx, sy, tx, ty) {
  let x = sx;
  let y = sy;
  while (x !== tx || y !== ty) {
    map[y][x].terrain = "floor";
    if (x !== tx && (y === ty || Math.random() > .45)) x += Math.sign(tx - x);
    else if (y !== ty) y += Math.sign(ty - y);
  }
  map[ty][tx].terrain = "floor";
}

// Place monsters or map objects on empty floor cells.
function scatter(map, type, count) {
  let placed = 0;
  while (placed < count) {
    const x = rand(1, 7);
    const y = rand(1, 7);
    const cell = map[y][x];
    if (cell.terrain === "floor" && !cell.object && !(x === 1 && y === 1)) {
      cell.object = type === "monster" ? makeEnemy(Math.random() < .14) : { type };
      placed++;
    }
  }
}

// Create monster stats scaled by floor and elite/boss status.
function makeEnemy(eliteOrBoss = false) {
  const floor = state.floor;
  const boss = floor === 10;
  const names = floor < 4
    ? ["史莱姆", "洞穴鼠", "骷髅兵"]
    : floor < 7
      ? ["矿洞蝙蝠", "诅咒矿工", "石像守卫"]
      : ["冰霜狼", "寒冰法徒", "冰晶魔像"];
  const elite = eliteOrBoss && !boss;
  const base = 18 + floor * 8;
  return {
    type: boss ? "boss" : elite ? "elite" : "monster",
    name: boss ? "符文守王" : elite ? `精英${choice(names)}` : choice(names),
    hp: boss ? 260 : elite ? base * 1.8 : base,
    maxHp: boss ? 260 : elite ? base * 1.8 : base,
    atk: boss ? 30 : 7 + floor * 3 + (elite ? 7 : 0),
    def: boss ? 18 : 3 + floor + (elite ? 4 : 0),
    xp: boss ? 160 : 12 + floor * 6 + (elite ? 18 : 0),
    gold: boss ? 220 : rand(8, 16) + floor * 2 + (elite ? 18 : 0)
  };
}

// Mark cells near the player as currently visible and permanently seen.
function updateVisibility() {
  for (const row of state.map.cells) {
    for (const cell of row) {
      const dist = Math.abs(cell.x - state.player.x) + Math.abs(cell.y - state.player.y);
      cell.visible = dist <= 3;
      if (cell.visible) cell.seen = true;
    }
  }
}

// Move the player by one tile and resolve the destination cell.
function move(dx, dy) {
  if (state.currentEnemy) return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  const cell = state.map.cells[ny]?.[nx];
  if (!cell || cell.terrain === "wall") {
    log("冰冷的墙壁挡住了去路。");
    render();
    return;
  }
  state.player = { x: nx, y: ny };
  selectedTile = null;
  updateVisibility();
  resolveCell(cell);
  render();
}

// Trigger the object on the player's current tile.
function resolveCell(cell) {
  if (!cell.object) return;
  const obj = cell.object;
  if (["monster", "elite", "boss"].includes(obj.type)) {
    state.currentEnemy = obj;
    log(`遭遇${obj.name}。`);
    return;
  }
  if (obj.type === "chest") {
    openChest(cell);
  } else if (obj.type === "trap") {
    const damage = rand(8, 14) + state.floor * 2;
    state.hp = Math.max(1, state.hp - damage);
    cell.object = null;
    log(`触发陷阱，受到 ${damage} 点伤害。`);
  } else if (obj.type === "altar") {
    useAltar(cell);
  } else if (obj.type === "portal") {
    nextFloor();
  }
}

// Resolve chest rewards: equipment, rune, or materials/gold.
function openChest(cell) {
  const roll = Math.random();
  if (roll < .42) {
    const loot = randomEquipment();
    state.inventory.push(loot);
    log(`打开宝箱，获得${loot.name}。`);
  } else if (roll < .72) {
    const rune = choice(RUNES) + "1";
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    log(`打开宝箱，获得${rune}符文。`);
  } else {
    state.materials["强化石"] = (state.materials["强化石"] || 0) + 1;
    state.gold += rand(15, 40);
    log("打开宝箱，获得金币和强化石。");
  }
  cell.object = null;
}

// Generate equipment loot with slot, quality, stat, and rune-slot rolls.
function randomEquipment() {
  const slot = choice(SLOTS);
  const quality = qualityRoll();
  const prefix = { weapon: "符刻", armor: "守望", boots: "疾行", ring: "秘银", amulet: "星纹" }[slot];
  const main = slot === "weapon" ? (Math.random() < .5 ? "atk" : "mag")
    : slot === "armor" ? "def"
      : slot === "boots" ? "spd"
        : slot === "ring" ? "luk" : "res";
  const bonus = qualityBonus(quality) + state.floor;
  const stats = { [main]: bonus };
  if (slot === "armor") stats.hp = 8 + state.floor * 3;
  return item(`${quality}${prefix}${SLOT_NAMES[slot]}`, slot, quality, stats, quality === "普通" ? 0 : quality === "优秀" ? 1 : 2);
}

// Roll item quality, lightly affected by luck.
function qualityRoll() {
  const r = Math.random() + state.stats.luk * .004;
  if (r > .96) return "传说";
  if (r > .86) return "史诗";
  if (r > .68) return "稀有";
  if (r > .38) return "优秀";
  return "普通";
}

// Convert item quality into its base stat budget.
function qualityBonus(quality) {
  return { 普通: 3, 优秀: 5, 稀有: 8, 史诗: 11, 传说: 15 }[quality];
}

// Consume an altar tile and restore part of player resources.
function useAltar(cell) {
  const heal = Math.floor(state.maxHp * .28);
  state.hp = Math.min(state.maxHp, state.hp + heal);
  state.mp = Math.min(state.maxMp, state.mp + 14);
  cell.object = null;
  log(`符文祭坛恢复了 ${heal} 点生命和少量法力。`);
}

// Advance to the next floor and refresh a small amount of resources.
function nextFloor() {
  if (state.floor >= 10) return;
  state.floor++;
  generateFloor();
  state.hp = Math.min(state.maxHp, state.hp + 20);
  state.mp = Math.min(state.maxMp, state.mp + 12);
  log(`进入第 ${state.floor} 层。`);
  saveGame(false);
}

// Combine base attributes, equipment, upgrades, and runes.
function totals() {
  const total = { ...state.stats, hp: 0, mp: 0 };
  for (const eq of Object.values(state.equipment)) {
    if (!eq) continue;
    for (const [key, value] of Object.entries(eq.stats)) total[key] = (total[key] || 0) + value + eq.level;
    for (const rune of eq.runes) applyRune(total, rune);
  }
  return total;
}

// Current maximum HP after equipment bonuses.
function effectiveMaxHp() {
  return state.maxHp + (totals().hp || 0);
}

// Current maximum MP after equipment bonuses.
function effectiveMaxMp() {
  return state.maxMp + (totals().mp || 0);
}

// Apply rune bonuses into the derived stat object.
function applyRune(total, rune) {
  if (rune.startsWith("火焰")) total.atk += 2;
  if (rune.startsWith("寒冰")) total.res += 2;
  if (rune.startsWith("雷霆")) total.mag += 2;
  if (rune.startsWith("吸血")) total.luk += 1;
  if (rune.startsWith("守护")) total.def += 2;
  if (rune.startsWith("迅捷")) total.spd += 2;
}

// Resolve one player combat action and then the enemy response.
function attackEnemy(mode, skill = null) {
  const enemy = state.currentEnemy;
  const t = totals();
  let result = "";
  if (mode === "attack") {
    result = dealDamage(enemy, Math.max(2, t.atk - enemy.def * .35), "普通攻击");
  } else if (mode === "skill") {
    if (state.mp < skill.mp) {
      log("法力不足。");
      render();
      return;
    }
    state.mp -= skill.mp;
    result = castSkill(enemy, skill, t);
  } else if (mode === "defend") {
    const block = 7 + t.def;
    state._guard = block;
    result = `你进入防御姿态，准备抵挡 ${block} 点伤害。`;
  }
  log(result);
  if (enemy.hp <= 0) {
    winBattle(enemy);
  } else {
    enemyTurn(enemy);
  }
  render();
}

// Apply damage with critical chance and return a combat log line.
function dealDamage(enemy, amount, label) {
  const crit = Math.random() < (0.06 + totals().luk * .008);
  const damage = Math.max(1, Math.round(amount * (crit ? 1.7 : 1)));
  enemy.hp -= damage;
  return `${label}${crit ? "暴击" : ""}，造成 ${damage} 点伤害。`;
}

// Execute class skill effects such as shield, poison, burn, or double shot.
function castSkill(enemy, skill, t) {
  if (skill.type === "guard") {
    state._guard = 12 + t.def;
    enemy.hp -= Math.round(t.atk * skill.power);
    return `格挡反击，造成 ${Math.round(t.atk * skill.power)} 点伤害。`;
  }
  if (skill.type === "shield") {
    state._guard = 18 + t.mag;
    return `奥术护盾展开，抵挡 ${state._guard} 点伤害。`;
  }
  if (skill.type === "evade") {
    state._evade = true;
    return "你拉开距离，下回合更容易闪避。";
  }
  if (skill.type === "double") {
    const d1 = dealDamage(enemy, t.atk * skill.power, "第一箭");
    const d2 = dealDamage(enemy, t.atk * skill.power, "第二箭");
    return `${d1} ${d2}`;
  }
  const base = skill.scale === "mag" ? t.mag : t.atk;
  const text = dealDamage(enemy, base * skill.power + state.floor * 2, skill.name);
  if (["burn", "poison"].includes(skill.type)) enemy.hp -= 5 + state.floor;
  if (skill.type === "weaken") enemy.atk = Math.max(1, enemy.atk - 3);
  if (skill.type === "slow") enemy.atk = Math.max(1, enemy.atk - 2);
  return text;
}

// Resolve one enemy attack turn, including dodge and guard mitigation.
function enemyTurn(enemy) {
  const t = totals();
  const dodge = Math.random() < (t.spd * .006 + (state._evade ? .35 : .04));
  state._evade = false;
  if (dodge) {
    log(`${enemy.name}的攻击落空。`);
    return;
  }
  let damage = Math.max(1, Math.round(enemy.atk - t.def * .42));
  if (state._guard) {
    damage = Math.max(0, damage - state._guard);
    state._guard = 0;
  }
  state.hp -= damage;
  log(`${enemy.name}反击，造成 ${damage} 点伤害。`);
  if (state.hp <= 0) death();
}

// Finish combat, award rewards, clear the enemy tile, and check boss win.
function winBattle(enemy) {
  state.gold += enemy.gold;
  state.xp += enemy.xp;
  log(`击败${enemy.name}，获得 ${enemy.xp} 经验和 ${enemy.gold} 金币。`);
  const cell = state.map.cells[state.player.y][state.player.x];
  cell.object = null;
  state.currentEnemy = null;
  maybeDrop(enemy);
  while (state.xp >= state.xpNext) levelUp();
  if (enemy.type === "boss") {
    showModal("通关", "<p>符文守王倒下了，地牢深处的王座重新安静下来。第一版到这里通关。</p>", [
      { text: "继续整理装备", action: closeModal }
    ]);
  }
}

// Roll post-combat equipment and rune drops.
function maybeDrop(enemy) {
  if (Math.random() < .42 || enemy.type !== "monster") {
    const loot = randomEquipment();
    state.inventory.push(loot);
    log(`${enemy.name}掉落了${loot.name}。`);
  }
  if (Math.random() < .35) {
    const rune = choice(RUNES) + "1";
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    log(`获得${rune}符文。`);
  }
}

// Increase level, grant stat point, and refresh resources.
function levelUp() {
  state.xp -= state.xpNext;
  state.level++;
  state.xpNext = Math.round(state.xpNext * 1.28 + 12);
  state.statPoints++;
  state.maxHp += 8;
  state.maxMp += 4;
  state.hp = state.maxHp;
  state.mp = state.maxMp;
  log(`升级到 Lv.${state.level}，获得 1 点属性点。`);
}

// Handle defeat without deleting the save: reset to floor entrance with penalty.
function death() {
  state.hp = Math.ceil(state.maxHp * .55);
  state.mp = Math.ceil(state.maxMp * .45);
  state.gold = Math.max(0, state.gold - Math.ceil(state.gold * .15));
  state.currentEnemy = null;
  generateFloor();
  log("你被击倒，被传送回本层入口，损失了少量金币。");
}

// Fast-resolve lower-risk battles using the same combat actions.
function autoBattle() {
  const enemy = state.currentEnemy;
  const risk = battleRisk(enemy);
  if (risk.score < .55) {
    log("风险过高，建议手动战斗。");
    render();
    return;
  }
  let rounds = 0;
  while (state.currentEnemy && state.hp > 0 && rounds < 30) {
    const bestSkill = CLASSES[state.classId].skills.find((skill) => state.mp >= skill.mp && skill.type !== "evade");
    attackEnemy(bestSkill ? "skill" : "attack", bestSkill || null);
    rounds++;
  }
}

// Estimate battle risk from player and enemy power.
function battleRisk(enemy) {
  const t = totals();
  const heroPower = state.hp + state.mp * .35 + t.atk * 7 + t.mag * 6 + t.def * 6 + t.spd * 4;
  const enemyPower = enemy.hp + enemy.atk * 10 + enemy.def * 7;
  const score = heroPower / (heroPower + enemyPower);
  const label = score >= .75 ? "碾压" : score >= .64 ? "优势" : score >= .55 ? "均势" : score >= .42 ? "危险" : "致命";
  return { score, label };
}

// Spend one pending stat point on a base attribute.
function addStat(key) {
  if (state.statPoints <= 0) return;
  state.stats[key]++;
  state.statPoints--;
  if (key === "def") state.maxHp += 4;
  if (key === "res") state.maxMp += 3;
  render();
}

// Equip an inventory item and return the old item to the bag.
function equipItem(id) {
  const index = state.inventory.findIndex((entry) => entry.id === id);
  const entry = state.inventory[index];
  if (!entry || entry.kind !== "equip") return;
  const old = state.equipment[entry.slot];
  state.equipment[entry.slot] = entry;
  state.inventory.splice(index, 1);
  if (old) state.inventory.push(old);
  log(`装备了${entry.name}。`);
  render();
}

// Use a consumable potion from the inventory.
function useItem(id) {
  const index = state.inventory.findIndex((entry) => entry.id === id);
  const entry = state.inventory[index];
  if (!entry || entry.kind !== "potion") return;
  if (entry.effect === "hp") state.hp = Math.min(state.maxHp, state.hp + entry.amount);
  if (entry.effect === "mp") state.mp = Math.min(state.maxMp, state.mp + entry.amount);
  state.inventory.splice(index, 1);
  log(`使用${entry.name}。`);
  render();
}

// Combine three same-type runes into the next tier.
function craftRune(name) {
  if ((state.runes[name] || 0) < 3) return;
  const level = Number(name.slice(-1));
  const base = name.slice(0, -1);
  state.runes[name] -= 3;
  const next = base + (level + 1);
  state.runes[next] = (state.runes[next] || 0) + 1;
  log(`合成${next}符文。`);
  render();
}

// Upgrade an equipped item with gold and strengthening material.
function enhance(slot) {
  const eq = state.equipment[slot];
  if (!eq || (state.materials["强化石"] || 0) <= 0 || state.gold < 20) return;
  state.materials["强化石"]--;
  state.gold -= 20;
  eq.level++;
  log(`${eq.name}强化到 +${eq.level}。`);
  render();
}

// Buy basic consumables from the merchant tile.
function buy(kind) {
  if (kind === "hp" && state.gold >= 25) {
    state.gold -= 25;
    state.inventory.push(potion("小型生命药水", "hp", 40));
    log("购买小型生命药水。");
  }
  if (kind === "mp" && state.gold >= 25) {
    state.gold -= 25;
    state.inventory.push(potion("小型法力药水", "mp", 25));
    log("购买小型法力药水。");
  }
  render();
}

// Render the initial class selection cards.
function renderClassSelect() {
  $("classSelect").innerHTML = Object.entries(CLASSES).map(([id, cls]) => `
    <article class="class-card">
      <h2>${cls.name}</h2>
      <p>${cls.desc}</p>
      <ul>${cls.skills.map((skill) => `<li>${skill.name}：${skill.desc}</li>`).join("")}</ul>
      <button type="button" onclick="startGame('${id}')">选择${cls.name}</button>
    </article>
  `).join("");
}

// Render the full UI from current state and persist the snapshot.
function render() {
  if (!state) {
    $("classSelect").classList.remove("hidden");
    $("gameView").classList.add("hidden");
    return;
  }
  if (!state.map?.cells?.length) generateFloor();
  state.hp = Math.min(state.hp, effectiveMaxHp());
  state.mp = Math.min(state.mp, effectiveMaxMp());
  $("classSelect").classList.add("hidden");
  $("gameView").classList.remove("hidden");
  renderHero();
  renderMap();
  renderMinimap();
  renderLegend();
  renderContext();
  renderTab();
  renderLog();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

// Render player portrait, bars, stats, and stat-point controls.
function renderHero() {
  const cls = CLASSES[state.classId];
  const t = totals();
  const hpMax = effectiveMaxHp();
  const mpMax = effectiveMaxMp();
  $("heroAvatar").innerHTML = imageTag(assetForClass(state.classId), cls.name);
  $("heroName").textContent = `${cls.name} Lv.${state.level}`;
  $("hpText").textContent = `${state.hp}/${hpMax}`;
  $("mpText").textContent = `${state.mp}/${mpMax}`;
  $("xpText").textContent = `${state.xp}/${state.xpNext}`;
  $("hpBar").style.width = `${Math.max(0, Math.min(100, state.hp / hpMax * 100))}%`;
  $("mpBar").style.width = `${Math.max(0, Math.min(100, state.mp / mpMax * 100))}%`;
  $("xpBar").style.width = `${Math.max(0, Math.min(100, state.xp / state.xpNext * 100))}%`;
  $("statPoints").textContent = state.statPoints;
  $("goldText").textContent = state.gold;
  $("statsGrid").innerHTML = Object.entries(STAT_NAMES).map(([key, name]) => `
    <div class="stat">
      <span>${name} ${t[key]}</span>
      <button type="button" ${state.statPoints ? "" : "disabled"} onclick="addStat('${key}')">+</button>
    </div>
  `).join("");
}

// Render the main dungeon map tiles.
function renderMap() {
  const theme = themeForFloor(state.floor);
  $("floorText").textContent = `第 ${state.floor} 层`;
  $("themeText").textContent = theme.name;
  const map = $("map");
  map.className = `map ${theme.colorClass}`;
  map.style.setProperty("--size", state.map.size);
  const cells = [];
  for (const row of state.map.cells) {
    for (const cell of row) {
      if (!cell.seen) {
        cells.push(`<button class="tile unseen" type="button" aria-label="未知"></button>`);
        continue;
      }
      const fog = cell.visible ? "" : " fog";
      const terrain = cell.terrain === "wall" ? "wall" : "floor";
      const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
      const isSelected = selectedTile?.x === cell.x && selectedTile?.y === cell.y;
      const isAdjacent = Math.abs(cell.x - state.player.x) + Math.abs(cell.y - state.player.y) === 1;
      const tileSprite = isPlayer ? sprite("player", assetForClass(state.classId), CLASSES[state.classId].name)
        : cell.visible && cell.object ? objectSprite(cell.object) : "";
      const objectBadge = cell.visible && cell.object ? badgeForObject(cell.object.type) : "";
      const label = tileLabel(cell, isPlayer);
      const hint = cell.visible ? `<span class="tile-hint">${label}</span>` : "";
      const flags = [
        terrain,
        fog,
        isPlayer ? " current" : "",
        isAdjacent && cell.terrain !== "wall" ? " reachable" : "",
        isSelected ? " selected" : ""
      ].join("");
      cells.push(`<button class="tile ${flags}" type="button" title="${label}" aria-label="${label}" onclick="clickTile(${cell.x},${cell.y})">${tileSprite}${objectBadge}${hint}</button>`);
    }
  }
  map.innerHTML = cells.join("");
}

// Render compact floor overview in the top-right minimap.
function renderMinimap() {
  const minimap = $("minimap");
  minimap.style.setProperty("--size", state.map.size);
  minimap.innerHTML = state.map.cells.flatMap((row) => row.map((cell) => {
    const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
    const classes = [
      "mini-cell",
      cell.seen ? "seen" : "unknown",
      cell.terrain === "wall" ? "wall" : "floor",
      cell.object ? `obj-${cell.object.type}` : "",
      isPlayer ? "player" : ""
    ].join(" ");
    return `<span class="${classes}" title="${tileLabel(cell, isPlayer)}"></span>`;
  })).join("");
}

// Render always-visible icon meanings under the map.
function renderLegend() {
  $("legend").innerHTML = LEGEND_ITEMS.map(([type, label, desc]) => {
    const src = type === "player" ? assetForClass(state.classId) : ASSETS[type];
    return `
      <div class="legend-item" title="${desc}">
        <img src="${src}" alt="${label}" draggable="false">
        <span>${label}</span>
      </div>
    `;
  }).join("");
}

// Convert a map object into its sprite markup.
function objectSprite(obj) {
  const map = {
    monster: ["monster", ASSETS.monster, "怪物"],
    elite: ["elite", ASSETS.elite, "精英怪"],
    boss: ["boss", ASSETS.boss, "Boss"],
    chest: ["chest", ASSETS.chest, "宝箱"],
    altar: ["altar", ASSETS.altar, "祭坛"],
    forge: ["forge", ASSETS.forge, "合成台"],
    shop: ["shop", ASSETS.shop, "商人"],
    trap: ["trap", ASSETS.trap, "陷阱"],
    portal: ["portal", ASSETS.portal, "传送门"]
  };
  const [cls, src, alt] = map[obj.type] || ["monster", ASSETS.monster, "怪物"];
  return sprite(cls, src, alt);
}

// Add short visual labels to map objects.
function badgeForObject(type) {
  const labels = {
    monster: "怪",
    elite: "精",
    boss: "王",
    chest: "箱",
    altar: "坛",
    forge: "锻",
    shop: "商",
    trap: "陷",
    portal: "门"
  };
  return labels[type] ? `<span class="tile-badge badge-${type}">${labels[type]}</span>` : "";
}

// Human-readable description for a map cell.
function tileLabel(cell, isPlayer = false) {
  if (!cell.seen) return "未知区域";
  if (isPlayer) return `你的位置：${CLASSES[state.classId].name}`;
  if (cell.terrain === "wall") return "墙壁：无法通行";
  if (!cell.object) return "地面：可通行";
  const labels = {
    monster: "普通怪物：接触后进入战斗",
    elite: "精英怪：更危险，掉落更好",
    boss: "Boss：本层首领",
    chest: "宝箱：可能获得装备、符文或金币",
    altar: "符文祭坛：恢复生命和法力",
    forge: "合成台：强化装备或合成符文",
    shop: "商人：购买药水和补给",
    trap: "陷阱：触发后受到伤害",
    portal: "传送门：进入下一层"
  };
  return labels[cell.object.type] || "未知物体";
}

// Description of the most recently selected map tile.
function selectedTileText() {
  if (!selectedTile || !state?.map) return "";
  const cell = state.map.cells[selectedTile.y]?.[selectedTile.x];
  if (!cell || !cell.seen) return "";
  const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
  return tileLabel(cell, isPlayer);
}

// Resolve the player sprite for the chosen class.
function assetForClass(classId) {
  if (classId === "mage") return ASSETS.mage;
  if (classId === "ranger") return ASSETS.ranger;
  return ASSETS.warrior;
}

// Shared image markup helper for map and panel sprites.
function imageTag(src, alt) {
  return `<img src="${src}" alt="${alt}" draggable="false">`;
}

// Wrap an image with object-specific classes for styling.
function sprite(cls, src, alt) {
  return `<span class="sprite ${cls}">${imageTag(src, alt)}</span>`;
}

// Select a tile, moving if it is adjacent to the player.
function clickTile(x, y) {
  selectedTile = { x, y };
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy);
  else render();
}

// Render context-sensitive actions: battle, shop, forge, or movement help.
function renderContext() {
  const enemy = state.currentEnemy;
  if (enemy) {
    const risk = battleRisk(enemy);
    $("contextTitle").textContent = `${enemy.name} ${Math.ceil(enemy.hp)}/${enemy.maxHp}`;
    $("contextBody").innerHTML = `
      <div class="item-row"><div>一键战斗评估<small>${risk.label}，胜率估算 ${Math.round(risk.score * 100)}%</small></div><button type="button" onclick="autoBattle()">一键战斗</button></div>
      <button type="button" onclick="attackEnemy('attack')">普通攻击</button>
      ${CLASSES[state.classId].skills.map((skill) => `<button type="button" onclick="attackEnemy('skill', CLASSES[state.classId].skills.find(s => s.id === '${skill.id}'))">${skill.name} - ${skill.mp} MP</button>`).join("")}
      <button type="button" onclick="attackEnemy('defend')">防御</button>
    `;
    return;
  }
  const cell = state.map.cells[state.player.y][state.player.x];
  if (cell.object?.type === "shop") {
    $("contextTitle").textContent = "商人";
    $("contextBody").innerHTML = `
      <button type="button" onclick="buy('hp')">购买生命药水 25 金币</button>
      <button type="button" onclick="buy('mp')">购买法力药水 25 金币</button>
    `;
  } else if (cell.object?.type === "forge") {
    $("contextTitle").textContent = "合成台";
    $("contextBody").innerHTML = `<p>可以在合成页强化装备或合成符文。</p>`;
  } else {
    $("contextTitle").textContent = "行动";
    const selected = selectedTileText();
    $("contextBody").innerHTML = `
      ${selected ? `<div class="tile-info">${selected}</div>` : ""}
      <p>点击相邻格或使用方向键移动。探索宝箱、祭坛、商人和传送门。</p>
    `;
  }
}

// Render the currently selected side-panel tab.
function renderTab() {
  if (activeTab === "inventory") renderInventory();
  if (activeTab === "equipment") renderEquipment();
  if (activeTab === "craft") renderCraft();
}

// Render inventory rows and item action buttons.
function renderInventory() {
  $("tabBody").innerHTML = state.inventory.length ? state.inventory.map((entry) => {
    if (entry.kind === "potion") {
      return `<div class="item-row"><div>${entry.name}<small>恢复 ${entry.amount}</small></div><button type="button" onclick="useItem('${entry.id}')">使用</button></div>`;
    }
    return `<div class="item-row"><div>${entry.name}<small>${SLOT_NAMES[entry.slot]} ${statsText(entry)}</small></div><button type="button" onclick="equipItem('${entry.id}')">装备</button></div>`;
  }).join("") : `<p>背包为空。</p>`;
}

// Render equipped items and enhancement controls.
function renderEquipment() {
  $("tabBody").innerHTML = SLOTS.map((slot) => {
    const eq = state.equipment[slot];
    return `<div class="item-row"><div>${SLOT_NAMES[slot]}<small>${eq ? `${eq.name} +${eq.level} ${statsText(eq)}` : "未装备"}</small></div><button type="button" ${eq ? "" : "disabled"} onclick="enhance('${slot}')">强化</button></div>`;
  }).join("");
}

// Render materials, rune inventory, and rune-combine controls.
function renderCraft() {
  const runes = Object.entries(state.runes).filter(([, count]) => count > 0);
  $("tabBody").innerHTML = `
    <div class="item-row"><div>材料<small>强化石 ${state.materials["强化石"] || 0}，魔尘 ${state.materials["魔尘"] || 0}</small></div></div>
    ${runes.length ? runes.map(([name, count]) => `<div class="item-row"><div>${name}符文<small>数量 ${count}，3 合 1 升级</small></div><button type="button" ${count >= 3 ? "" : "disabled"} onclick="craftRune('${name}')">合成</button></div>`).join("") : "<p>暂无符文。</p>"}
  `;
}

// Format an equipment stat summary.
function statsText(eq) {
  return Object.entries(eq.stats).map(([key, value]) => `${STAT_NAMES[key] || key}+${value}`).join(" ");
}

// Render newest adventure log entries.
function renderLog() {
  $("log").innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
}

// Add one message to the bounded adventure log.
function log(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 80);
}

// Save the complete game state into localStorage.
function saveGame(show = true) {
  if (!state) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (show) {
    log("游戏已保存。");
    render();
  }
}

// Restore saved state from localStorage if available.
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  state = JSON.parse(raw);
  if (!state.map?.cells?.length) generateFloor();
  updateVisibility();
  return true;
}

// Display a modal with caller-provided actions.
function showModal(title, body, actions) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modalActions").innerHTML = actions.map((action, index) => `<button type="button" onclick="modalAction(${index})">${action.text}</button>`).join("");
  window._modalActions = actions;
  $("modal").classList.remove("hidden");
}

// Dispatch a modal button action by index.
function modalAction(index) {
  window._modalActions[index].action();
}

// Hide the current modal.
function closeModal() {
  $("modal").classList.add("hidden");
}

// Confirm before clearing localStorage and returning to class select.
function newGamePrompt() {
  showModal("新游戏", "<p>这会覆盖当前浏览器存档。确定要重新开始吗？</p>", [
    { text: "取消", action: closeModal },
    { text: "重新开始", action: () => { localStorage.removeItem(SAVE_KEY); state = null; closeModal(); render(); } }
  ]);
}
