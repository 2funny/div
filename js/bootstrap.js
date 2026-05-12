// Keyboard movement uses arrows or WASD while a game is active.
document.addEventListener("keydown", (event) => {
  initAudio();
  const modalOpen = !$("modal").classList.contains("hidden");
  if (modalOpen && event.key === " ") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (!state) return;
  const key = event.key.toLowerCase();
  const movement = {
    arrowup: [0, -1],
    w: [0, -1],
    arrowdown: [0, 1],
    s: [0, 1],
    arrowleft: [-1, 0],
    a: [-1, 0],
    arrowright: [1, 0],
    d: [1, 0]
  }[key];
  if (movement) {
    event.preventDefault();
    move(movement[0], movement[1]);
  }
});

$("modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeModal();
});

// Prevent persistent focus/caret artifacts after clicking game UI controls.
document.addEventListener("pointerup", (event) => {
  initAudio();
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
$("soundBtn").addEventListener("click", (event) => {
  toggleAudio();
  event.currentTarget.blur();
});
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
updateSoundButton();
render();
