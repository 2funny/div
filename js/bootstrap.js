// 游戏运行时绑定键盘移动：方向键和 WASD 都会移动角色。
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

// 点击游戏按钮后主动移除焦点，避免按钮长期显示焦点或文本光标残留。
document.addEventListener("pointerup", (event) => {
  initAudio();
  const target = event.target.closest("button");
  if (target) target.blur();
});

// 方向按钮复用键盘移动逻辑，方便鼠标和触屏玩家操作。
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

// 侧边栏标签用于切换背包、技能和任务视图。
document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    renderTab();
    button.blur();
  });
});

// 顶部控制区绑定声音、保存和新游戏入口。
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

// 初始启动停留在开始界面，由玩家选择继续存档或创建新角色。
renderStartScreen();
updateSoundButton();
render();
