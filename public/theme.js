// Light/dark theme toggle for Hunt.
// Loaded synchronously in <head> so the stored preference is applied before
// the body paints (no flash). Dark is the default; only an explicit toggle
// switches to light. Choice persists in localStorage across pages.
(function () {
  var KEY = "hunt-theme";
  var root = document.documentElement;

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function current() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }
  function render(theme) {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    var toLight = theme !== "light";
    btn.textContent = theme === "light" ? "☀" : "☾";
    btn.setAttribute(
      "aria-label",
      toLight ? "Switch to light theme" : "Switch to dark theme",
    );
    btn.setAttribute(
      "title",
      toLight ? "Switch to light theme" : "Switch to dark theme",
    );
  }
  function apply(theme) {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {}
    render(theme);
  }

  // Apply stored preference immediately — runs in <head>, before body paint.
  var pref = stored();
  if (pref === "light" || pref === "dark") root.dataset.theme = pref;

  // Wire the toggle button once the DOM is ready.
  function wire() {
    render(current());
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", function () {
        apply(current() === "light" ? "dark" : "light");
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
