function createElementStub() {
  return {
    innerHTML: "",
    textContent: "",
    disabled: false,
    value: "",
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
      removeProperty(name) {
        delete this[name];
      }
    },
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    remove() {},
    focus() {},
    scrollIntoView() {}
  };
}

function createDocumentStub() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElementStub());
      return elements.get(id);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return createElementStub();
    },
    addEventListener() {}
  };
}

function createTestContext(assert, storage = {}) {
  const document = createDocumentStub();
  const context = {
    assert,
    console,
    document,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
      setItem: (key, value) => { storage[key] = String(value); },
      removeItem: (key) => { delete storage[key]; }
    },
    window: {
      crypto: { randomUUID: () => "test-id" },
      setTimeout,
      clearTimeout
    }
  };
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  context.getElement = (id) => document.getElementById(id);
  context.modalState = () => ({
    title: document.getElementById("modalTitle").textContent,
    body: document.getElementById("modalBody").innerHTML,
    actions: context.window._modalActions || []
  });
  return context;
}

module.exports = { createTestContext };
