// @ts-nocheck
export function createModalRuntime({ $, initAudio, resetStatDraft }) {
  function showModal(title, body, actions) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    $("modalActions").innerHTML = actions.map((action, index) => `<button type="button" onclick="modalAction(${index})">${action.text}</button>`).join("");
    window._modalActions = actions;
    $("modal").classList.remove("hidden");
  }

  function showEvent(title, body, actionText = "确定") {
    showModal(title, body, [
      { text: actionText, action: closeModal }
    ]);
  }

  function showToast(message, duration = 2600) {
    const toast = $("toast");
    toast.innerHTML = message;
    toast.classList.add("show");
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }

  function showConfirm(title, body, confirmText, onConfirm) {
    showModal(title, body, [
      { text: "取消", action: closeModal },
      { text: confirmText, action: () => { closeModal(); onConfirm(); } }
    ]);
  }

  function modalAction(index) {
    initAudio();
    window._modalActions[index].action();
  }

  function closeModal() {
    $("modal").classList.add("hidden");
    window._modalActions = [];
    resetStatDraft();
  }

  return {
    closeModal,
    modalAction,
    showConfirm,
    showEvent,
    showModal,
    showToast
  };
}
