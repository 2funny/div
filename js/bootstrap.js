// Keyboard movement uses arrows or WASD while a game is active.
document.addEventListener("keydown", (event) => {
  if (!state) return;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") move(0, -1);
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") move(0, 1);
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") move(-1, 0);
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") move(1, 0);
});

// Prevent persistent focus/caret artifacts after clicking game UI controls.
document.addEventListener("pointerup", (event) => {
  const target = event.target.closest("button");
  if (target) target.blur();
});

// Direction buttons mirror keyboard movement for mouse/touch users.
document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    const dir = button.dataset.move;
    if (dir === "up") move(0, -1);
    if (dir === "down") move(0, 1);
    if (dir === "left") move(-1, 0);
    if (dir === "right") move(1, 0);
    button.blur();
  });
});

// Side panel tabs switch between inventory and skills.
document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    renderTab();
    button.blur();
  });
});

// Top-level save/new-game controls.
$("saveBtn").addEventListener("click", (event) => {
  saveGame(true);
  event.currentTarget.blur();
});
$("newGameBtn").addEventListener("click", (event) => {
  if (state) newGamePrompt();
  else renderClassSelect();
  event.currentTarget.blur();
});

// Initial boot always stops at the title screen. The player chooses whether to continue.
renderStartScreen();
render();
