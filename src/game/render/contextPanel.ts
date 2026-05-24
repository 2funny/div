export function battleContextMarkup(ctx: {
  enemy: any;
  risk: any;
  turn: any;
  renderSkillActionButtons: () => string;
  renderLoreShortcut: () => string;
}) {
  const { enemy, risk, turn } = ctx;
  const locked = turn.locked;
  const disabled = locked ? `disabled title="${turn.disabledTitle}"` : "";
  return {
    title: `${enemy.name} ${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp}`,
    body: `
      <div class="item-row"><div>一键战斗评估<small>${locked ? turn.title : `${risk.label}，胜率估算 ${Math.round(risk.score * 100)}%`}</small></div><button type="button" ${disabled} onclick="autoBattle()">一键战斗</button></div>
      <button type="button" ${disabled} onclick="attackEnemy('attack')">普通攻击</button>
      ${ctx.renderSkillActionButtons()}
      <button type="button" ${disabled} onclick="attackEnemy('defend')">防御</button>
      ${ctx.renderLoreShortcut()}
    `
  };
}

export function objectContextMarkup(type: string, tutorial: string, loreShortcut: string) {
  if (type === "shop") {
    return {
      title: "商人",
      body: `
      ${tutorial}
      <div class="tile-info">商人会打开交易窗口，可购买补给、售出装备；装备分解也在商人交易窗口里。</div>
      <button type="button" onclick="openMerchant()">和商人交谈</button>
      ${loreShortcut}
    `
    };
  }
  if (type === "forge") {
    return {
      title: "合成台",
      body: `
      ${tutorial}
      <div class="tile-info">合成台用于强化已装备的装备。消耗金币和强化石，不在商人或祭坛处强化。</div>
      <button type="button" onclick="openForge()">打开合成台</button>
      ${loreShortcut}
    `
    };
  }
  return null;
}

export function explorationContextMarkup(tutorial: string, selected: string, loreShortcut: string) {
  return {
    title: "行动",
    body: `
      ${tutorial}
      ${selected ? `<div class="tile-info">${selected}</div>` : ""}
      <p>点击相邻格或使用方向键移动。探索宝箱、祭坛、商人和传送门。</p>
      ${loreShortcut}
    `
  };
}
