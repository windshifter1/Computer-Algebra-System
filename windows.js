(function () {
  "use strict";

  const STORAGE_KEY = "cas-windows-v1";
  const DEFAULT_POPUP = { width: 560, height: 440 };
  const MIN_POPUP = { width: 280, height: 200 };
  const ZONE_EDGE = 0.28;

  let state = {
    nextId: 1,
    tabs: [],
    activeId: null,
    dock: { primary: null, secondary: null, orientation: "horizontal" },
    popups: {},
    zTop: 20,
  };

  const els = {};
  let ignoreNextClick = false;

  function uid() {
    return "w" + state.nextId++;
  }

  function getTab(id) {
    return state.tabs.find(function (t) {
      return t.id === id;
    });
  }

  function tabIds() {
    return new Set(
      state.tabs.map(function (t) {
        return t.id;
      })
    );
  }

  function isDocked(id) {
    return state.dock.primary === id || state.dock.secondary === id;
  }

  function isPopup(id) {
    return !!state.popups[id];
  }

  function isOnStage(id) {
    return isDocked(id) || isPopup(id);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return false;
      state = parsed;
      if (!state.dock) {
        state.dock = { primary: null, secondary: null, orientation: "horizontal" };
      }
      if (!state.popups) state.popups = {};
      if (!state.zTop) state.zTop = 20;
      pruneState();
      return state.tabs.length > 0;
    } catch (e) {
      return false;
    }
  }

  function pruneState() {
    const ids = tabIds();
    let max = 0;
    state.tabs.forEach(function (t) {
      const n = parseInt(String(t.id).replace(/\D/g, ""), 10);
      if (n > max) max = n;
      if (!t.title) t.title = "Window " + n;
    });
    if (!state.nextId || state.nextId <= max) state.nextId = max + 1;
    if (!ids.has(state.activeId)) {
      state.activeId = state.tabs[0] ? state.tabs[0].id : null;
    }
    if (!ids.has(state.dock.primary)) state.dock.primary = null;
    if (!ids.has(state.dock.secondary)) state.dock.secondary = null;
    if (state.dock.primary && state.dock.primary === state.dock.secondary) {
      state.dock.secondary = null;
    }
    Object.keys(state.popups).forEach(function (id) {
      if (!ids.has(id) || isDocked(id)) delete state.popups[id];
    });
  }

  function detachFromDock(id) {
    if (state.dock.primary === id) {
      state.dock.primary = state.dock.secondary;
      state.dock.secondary = null;
    } else if (state.dock.secondary === id) {
      state.dock.secondary = null;
    }
  }

  function undock(id) {
    detachFromDock(id);
    delete state.popups[id];
  }

  function createShell(id) {
    const rec = getTab(id);
    const titleText = rec ? rec.title : "Window";
    const shell = document.createElement("div");
    shell.dataset.windowId = id;

    const chrome = document.createElement("div");
    chrome.className = "wm-chrome";

    const title = document.createElement("span");
    title.className = "wm-chrome-title";
    title.textContent = titleText;

    const ret = document.createElement("button");
    ret.type = "button";
    ret.className = "wm-chrome-btn wm-return";
    ret.title = "Return this window to the tab strip";
    ret.innerHTML = "↩ <span>Return to tabs</span>";
    ret.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      returnToTabs(id);
    });

    chrome.appendChild(title);
    chrome.appendChild(ret);

    const iframe = document.createElement("iframe");
    iframe.className = "wm-frame";
    iframe.src = "Algebra.html";
    iframe.title = titleText;
    iframe.addEventListener("load", function () {
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.documentElement) {
          doc.documentElement.classList.add("cas-embedded");
        }
      } catch (err) {}
    });

    const resize = document.createElement("div");
    resize.className = "wm-resize";
    resize.hidden = true;

    shell.appendChild(chrome);
    shell.appendChild(iframe);
    shell.appendChild(resize);

    chrome.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      if (shell.classList.contains("wm-popup")) startPopupMove(e, id);
      else focusWindow(id);
    });

    resize.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      startPopupResize(e, id);
    });

    shell.addEventListener("pointerdown", function () {
      if (shell.classList.contains("wm-popup")) bringPopupToFront(id);
      else focusWindow(id);
    });

    shells.set(id, shell);
    return shell;
  }

  function restyleShell(id, mode) {
    const shell = shells.get(id) || createShell(id);
    const rec = getTab(id);
    const titleEl = shell.querySelector(".wm-chrome-title");
    const iframe = shell.querySelector("iframe");
    if (rec) {
      if (titleEl) titleEl.textContent = rec.title;
      if (iframe) iframe.title = rec.title;
    }
    const resize = shell.querySelector(".wm-resize");
    if (mode === "popup") {
      const p = state.popups[id];
      shell.className = "wm-popup";
      shell.style.left = p.x + "px";
      shell.style.top = p.y + "px";
      shell.style.width = p.width + "px";
      shell.style.height = p.height + "px";
      shell.style.zIndex = String(p.z);
      if (resize) resize.hidden = false;
    } else {
      shell.className = "wm-pane";
      shell.style.left = "";
      shell.style.top = "";
      shell.style.width = "";
      shell.style.height = "";
      shell.style.zIndex = "";
      if (resize) resize.hidden = true;
    }
    return shell;
  }

  function destroyShell(id) {
    const shell = shells.get(id);
    if (shell) {
      const iframe = shell.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
      shell.remove();
      shells.delete(id);
    }
  }

  function topPopupId() {
    let best = null;
    let z = -Infinity;
    Object.keys(state.popups).forEach(function (id) {
      const p = state.popups[id];
      if (p.z > z) {
        z = p.z;
        best = id;
      }
    });
    return best;
  }

  function renderTabs() {
    const frag = document.createDocumentFragment();
    state.tabs.forEach(function (tab) {
      const btn = document.createElement("div");
      btn.className = "wm-tab";
      btn.dataset.windowId = tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.id === state.activeId ? "true" : "false");
      btn.tabIndex = 0;
      if (tab.id === state.activeId) btn.classList.add("is-active");
      if (isDocked(tab.id)) btn.classList.add("is-docked");
      if (isPopup(tab.id)) btn.classList.add("is-popup");

      const label = document.createElement("span");
      label.className = "wm-tab-title";
      label.textContent = tab.title;
      btn.appendChild(label);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "wm-tab-close";
      close.title = "Close " + tab.title;
      close.setAttribute("aria-label", "Close " + tab.title);
      close.textContent = "×";
      btn.appendChild(close);

      frag.appendChild(btn);
    });
    els.tabs.replaceChildren(frag);
  }

  function renderLayout() {
    const d = state.dock;
    const split = !!(d.primary && d.secondary);
    els.dock.classList.toggle("is-horizontal", split && d.orientation === "horizontal");
    els.dock.classList.toggle("is-vertical", split && d.orientation === "vertical");
    els.dock.classList.toggle("is-empty", !d.primary);

    const onStage = new Set();
    els.dock.replaceChildren();
    if (!d.primary) {
      const empty = document.createElement("p");
      empty.className = "wm-empty";
      empty.innerHTML =
        "The workspace is empty. Click a tab, or press <strong>+</strong> to open a window.";
      els.dock.appendChild(empty);
    } else {
      const a = restyleShell(d.primary, "dock");
      a.classList.toggle("is-solo", !d.secondary);
      a.classList.toggle("is-focused", state.activeId === d.primary);
      els.dock.appendChild(a);
      onStage.add(d.primary);
      if (d.secondary) {
        const b = restyleShell(d.secondary, "dock");
        b.classList.toggle("is-solo", false);
        b.classList.toggle("is-focused", state.activeId === d.secondary);
        els.dock.appendChild(b);
        onStage.add(d.secondary);
      }
    }

    const popupIds = Object.keys(state.popups).sort(function (a, b) {
      return state.popups[a].z - state.popups[b].z;
    });
    const top = topPopupId();
    const popupShells = popupIds.map(function (id) {
      const shell = restyleShell(id, "popup");
      shell.classList.toggle("is-top", id === top);
      onStage.add(id);
      return shell;
    });
    els.popups.replaceChildren.apply(els.popups, popupShells);

    state.tabs.forEach(function (t) {
      if (!onStage.has(t.id) && shells.has(t.id)) {
        els.pool.appendChild(shells.get(t.id));
      }
    });
  }

  function render() {
    renderTabs();
    renderLayout();
    save();
  }

  function updateFocusClasses() {
    document.querySelectorAll(".wm-pane, .wm-popup").forEach(function (el) {
      const id = el.dataset.windowId;
      el.classList.toggle("is-focused", id === state.activeId && el.classList.contains("wm-pane"));
      el.classList.toggle("is-top", el.classList.contains("wm-popup") && id === topPopupId());
    });
    renderTabs();
    save();
  }

  function focusWindow(id) {
    if (!id) return;
    state.activeId = id;
    updateFocusClasses();
  }

  function addWindow() {
    const rec = { id: uid(), title: "Window " + (state.nextId - 1) };
    state.tabs.push(rec);
    state.activeId = rec.id;
    delete state.popups[rec.id];
    state.dock.primary = rec.id;
    state.dock.secondary = null;
    render();
  }

  function selectWindow(id) {
    if (!id) return;
    const prev = state.activeId;
    state.activeId = id;
    if (isPopup(id)) {
      bringPopupToFront(id);
      return;
    }
    if (isDocked(id)) {
      updateFocusClasses();
      return;
    }
    delete state.popups[id];
    if (state.dock.secondary && state.dock.secondary === prev) {
      state.dock.secondary = id;
    } else if (state.dock.primary && state.dock.secondary && state.dock.primary === prev) {
      state.dock.primary = id;
    } else {
      state.dock.primary = id;
      if (state.dock.secondary === id) state.dock.secondary = null;
    }
    render();
  }

  function closeWindow(id) {
    const idx = state.tabs.findIndex(function (t) {
      return t.id === id;
    });
    if (idx < 0) return;
    state.tabs.splice(idx, 1);
    undock(id);
    destroyShell(id);
    if (state.tabs.length === 0) {
      state.activeId = null;
      state.dock.primary = null;
      state.dock.secondary = null;
      state.popups = {};
      render();
      return;
    }
    if (state.activeId === id) {
      const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
      state.activeId = next.id;
      if (!isOnStage(state.activeId)) state.dock.primary = state.activeId;
    }
    render();
  }

  function returnToTabs(id) {
    const wasActive = state.activeId === id;
    undock(id);
    if (wasActive) {
      state.activeId = state.dock.primary || (state.tabs[0] && state.tabs[0].id);
    }
    render();
  }

  function reorderTab(fromId, toId, placeAfter) {
    if (fromId === toId) return;
    const fromIdx = state.tabs.findIndex(function (t) {
      return t.id === fromId;
    });
    if (fromIdx < 0) return;
    const moved = state.tabs.splice(fromIdx, 1)[0];
    let insertAt = state.tabs.findIndex(function (t) {
      return t.id === toId;
    });
    if (insertAt < 0) {
      state.tabs.splice(fromIdx, 0, moved);
      return;
    }
    if (placeAfter) insertAt += 1;
    state.tabs.splice(insertAt, 0, moved);
    renderTabs();
    save();
  }

  function zoneFromPoint(clientX, clientY) {
    const rect = els.stage.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const left = x < ZONE_EDGE;
    const right = x > 1 - ZONE_EDGE;
    const top = y < ZONE_EDGE;
    const bottom = y > 1 - ZONE_EDGE;
    if (left && !top && !bottom) return "left";
    if (right && !top && !bottom) return "right";
    if (top && !left && !right) return "top";
    if (bottom && !left && !right) return "bottom";
    if ((left || right) && (top || bottom)) {
      if (Math.min(x, 1 - x) < Math.min(y, 1 - y)) return x < 0.5 ? "left" : "right";
      return y < 0.5 ? "top" : "bottom";
    }
    return "center";
  }

  function showPreview(zone) {
    const overStage = !!(dragging && dragging.canDock && !dragging.overTabId);
    els.preview.classList.toggle("is-visible", overStage);
    els.preview.querySelectorAll(".wm-preview-zone").forEach(function (el) {
      el.classList.toggle("is-active", overStage && el.getAttribute("data-zone") === zone);
    });
  }

  function applyDock(id, zone) {
    if (!zone) return;
    if (zone === "center") {
      openAsPopup(id);
      return;
    }
    delete state.popups[id];
    detachFromDock(id);
    const horiz = zone === "left" || zone === "right";
    state.dock.orientation = horiz ? "horizontal" : "vertical";
    const first = zone === "left" || zone === "top";
    if (!state.dock.primary) {
      state.dock.primary = id;
      state.dock.secondary = null;
    } else if (first) {
      state.dock.secondary = state.dock.primary;
      state.dock.primary = id;
    } else {
      state.dock.secondary = id;
    }
    render();
  }

  function openAsPopup(id) {
    detachFromDock(id);
    const stage = els.stage.getBoundingClientRect();
    const width = Math.min(
      DEFAULT_POPUP.width,
      Math.max(MIN_POPUP.width, Math.floor(stage.width * 0.45))
    );
    const height = Math.min(
      DEFAULT_POPUP.height,
      Math.max(MIN_POPUP.height, Math.floor(stage.height * 0.55))
    );
    const count = Object.keys(state.popups).length;
    state.zTop += 1;
    state.popups[id] = {
      x: Math.max(16, Math.floor((stage.width - width) / 2) + count * 28),
      y: Math.max(16, Math.floor((stage.height - height) / 2) + count * 28),
      width: width,
      height: height,
      z: state.zTop,
    };
    state.activeId = id;
    render();
  }

  function bringPopupToFront(id) {
    if (!state.popups[id]) return;
    state.zTop += 1;
    state.popups[id].z = state.zTop;
    const el = shells.get(id);
    if (el) el.style.zIndex = String(state.zTop);
    state.activeId = id;
    document.querySelectorAll(".wm-popup").forEach(function (p) {
      p.classList.toggle("is-top", p.dataset.windowId === id);
    });
    renderTabs();
    save();
  }

  function clampPopup(p) {
    const stage = els.stage.getBoundingClientRect();
    p.width = Math.max(MIN_POPUP.width, p.width);
    p.height = Math.max(MIN_POPUP.height, p.height);
    p.x = Math.min(Math.max(-p.width + 80, p.x), Math.max(0, stage.width - 80));
    p.y = Math.min(Math.max(0, p.y), Math.max(0, stage.height - 36));
  }

  function startPopupMove(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    bringPopupToFront(id);
    const p = state.popups[id];
    const shell = shells.get(id);
    if (!p || !shell) return;
    const start = { x: e.clientX, y: e.clientY, left: p.x, top: p.y };
    const target = e.currentTarget;
    function onMove(ev) {
      p.x = start.left + (ev.clientX - start.x);
      p.y = start.top + (ev.clientY - start.y);
      clampPopup(p);
      shell.style.left = p.x + "px";
      shell.style.top = p.y + "px";
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      save();
    }
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function startPopupResize(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    bringPopupToFront(id);
    const p = state.popups[id];
    const shell = shells.get(id);
    if (!p || !shell) return;
    const start = { x: e.clientX, y: e.clientY, w: p.width, h: p.height };
    const target = e.currentTarget;
    function onMove(ev) {
      p.width = start.w + (ev.clientX - start.x);
      p.height = start.h + (ev.clientY - start.y);
      clampPopup(p);
      shell.style.width = p.width + "px";
      shell.style.height = p.height + "px";
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      save();
    }
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function beginTabDrag(tabEl, clientX, clientY) {
    const id = tabEl.dataset.windowId;
    dragging = {
      id: id,
      canDock: id !== state.activeId,
      overTabId: null,
      placeAfter: false,
      zone: null,
      suppressClick: true,
    };
    tabEl.classList.add("is-dragging");
    document.body.classList.add("is-dragging-tab");
    els.ghost.textContent = tabEl.querySelector(".wm-tab-title").textContent;
    els.ghost.classList.add("is-visible");
    moveGhost(clientX, clientY);
    if (dragging.canDock) els.catcher.classList.add("is-visible");
    updateTabDrag(clientX, clientY);
  }

  function moveGhost(x, y) {
    els.ghost.style.left = x + 14 + "px";
    els.ghost.style.top = y + 12 + "px";
  }

  function clearTabDropMarks() {
    els.tabs.querySelectorAll(".wm-tab").forEach(function (t) {
      t.classList.remove("drop-before", "drop-after");
    });
  }

  function tabAtPoint(clientX, clientY) {
    const tabs = els.tabs.querySelectorAll(".wm-tab");
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const rect = tab.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return tab;
      }
    }
    return null;
  }

  function updateTabDrag(clientX, clientY) {
    if (!dragging) return;
    moveGhost(clientX, clientY);
    clearTabDropMarks();
    const tab = tabAtPoint(clientX, clientY);
    if (tab && tab.dataset.windowId !== dragging.id) {
      const rect = tab.getBoundingClientRect();
      dragging.placeAfter = clientX > rect.left + rect.width / 2;
      dragging.overTabId = tab.dataset.windowId;
      tab.classList.add(dragging.placeAfter ? "drop-after" : "drop-before");
      dragging.zone = null;
      showPreview(null);
      return;
    }
    dragging.overTabId = null;
    if (dragging.canDock) {
      dragging.zone = zoneFromPoint(clientX, clientY);
      showPreview(dragging.zone);
    } else {
      dragging.zone = null;
      showPreview(null);
    }
  }

  function finishDrag() {
    const d = dragging;
    dragging = null;
    document.body.classList.remove("is-dragging-tab");
    els.ghost.classList.remove("is-visible");
    els.catcher.classList.remove("is-visible");
    els.preview.classList.remove("is-visible");
    els.preview.querySelectorAll(".wm-preview-zone").forEach(function (el) {
      el.classList.remove("is-active");
    });
    clearTabDropMarks();
    els.tabs.querySelectorAll(".wm-tab").forEach(function (t) {
      t.classList.remove("is-dragging");
    });
    if (!d) return;
    ignoreNextClick = true;
    if (d.overTabId) {
      reorderTab(d.id, d.overTabId, d.placeAfter);
      return;
    }
    if (d.zone && d.canDock) applyDock(d.id, d.zone);
  }

  function initDom() {
    els.tabs = document.getElementById("wm-tabs");
    els.stage = document.getElementById("wm-stage");
    els.dock = document.getElementById("wm-dock");
    els.popups = document.getElementById("wm-popups");
    els.preview = document.getElementById("wm-dock-preview");
    els.catcher = document.getElementById("wm-drop-catcher");
    els.pool = document.getElementById("wm-pool");
    els.ghost = document.getElementById("wm-drag-ghost");

    document.getElementById("wm-add-window").addEventListener("click", addWindow);

    els.tabs.addEventListener("click", function (e) {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const close = e.target.closest(".wm-tab-close");
      const tab = e.target.closest(".wm-tab");
      if (!tab) return;
      if (close) {
        e.preventDefault();
        e.stopPropagation();
        closeWindow(tab.dataset.windowId);
        return;
      }
      selectWindow(tab.dataset.windowId);
    });

    els.tabs.addEventListener("keydown", function (e) {
      const tab = e.target.closest(".wm-tab");
      if (!tab || e.target.closest(".wm-tab-close")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectWindow(tab.dataset.windowId);
      }
    });

    els.tabs.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".wm-tab-close")) return;
      const tab = e.target.closest(".wm-tab");
      if (!tab) return;
      const pointerId = e.pointerId;
      const start = { x: e.clientX, y: e.clientY, tab: tab, started: false };
      function onMove(ev) {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!start.started) {
          if (dx * dx + dy * dy < 36) return;
          start.started = true;
          beginTabDrag(start.tab, ev.clientX, ev.clientY);
        }
        updateTabDrag(ev.clientX, ev.clientY);
      }
      function onUp() {
        tab.removeEventListener("pointermove", onMove);
        tab.removeEventListener("pointerup", onUp);
        tab.removeEventListener("pointercancel", onUp);
        try {
          tab.releasePointerCapture(pointerId);
        } catch (err) {}
        if (start.started) finishDrag();
      }
      try {
        tab.setPointerCapture(pointerId);
      } catch (err) {}
      tab.addEventListener("pointermove", onMove);
      tab.addEventListener("pointerup", onUp);
      tab.addEventListener("pointercancel", onUp);
    });

    window.addEventListener("resize", function () {
      Object.keys(state.popups).forEach(function (id) {
        clampPopup(state.popups[id]);
        const shell = shells.get(id);
        if (!shell) return;
        const p = state.popups[id];
        shell.style.left = p.x + "px";
        shell.style.top = p.y + "px";
        shell.style.width = p.width + "px";
        shell.style.height = p.height + "px";
      });
      save();
    });
  }

  function boot() {
    initDom();
    if (!load()) {
      const first = { id: uid(), title: "Window 1" };
      state.tabs = [first];
      state.activeId = first.id;
      state.dock.primary = first.id;
    }
    if (!state.dock.primary && state.activeId && !isPopup(state.activeId)) {
      state.dock.primary = state.activeId;
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
