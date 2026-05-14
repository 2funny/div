import "./styles.css";
import { bindEvents } from "./ui/bindEvents";
import { exposeRuntime, render, renderStartScreen, updateSoundButton } from "./game";

exposeRuntime();
bindEvents();

renderStartScreen();
updateSoundButton();
render();
document.body.classList.add("app-ready");
requestAnimationFrame(() => {
  document.body.classList.remove("app-booting");
});
