(function () {
  "use strict";

  const STORAGE_KEY = "cas-windows-v2";
  const DEFAULT_POPUP = { width: 560, height: 440 };
  const MIN_POPUP = { width: 280, height: 200 };
  const ZONE_EDGE = 0.28;

  let state = {
    nextTab: 1,
    nextGroup: 1,
    tabs: [],
    groups: {},
    dockIds: [],
    dockOrientation: "horizontal",
    focusedGroupId: null,
    zTop: 20,
  };

  const els = {};
  const frames = new Map();
  const groupEls = new Map();
  let dragging = null;
  let ignoreNextClick = false;

  function tabUid() {
    return "w" + state.nextTab++;
  }

  function groupUid() {
    return "g" + state.nextGroup++;
  }

  function getTab(id) {
    return state.tabs.find(function (t) {
      return t.id === id;
    });
  }

  function tabsIn(gid) {
    return state.tabs.filter(function (t) {
      return t.groupId === gid;
    });
  }

  function dockGroups() {
    return state.dockIds.filter(function (id) {
      return state.groups[id] && state.groups[id].kind === "dock";
    });
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
      if (!state.groups) state.groups = {};
      if (!state.dockIds) state.dockIds = [];
      if (!state.zTop) state.zTop = 20;
      prune();
      return state.tabs.length > 0;
    } catch (e) {
      return false;
    }
  }

  function prune() {
    let maxT = 0;
    let maxG = 0;
    state.tabs.forEach(function (t) {
      const n = parseInt(String(t.id).replace(/\D/g, ""), 10);
      if (n > maxT) maxT = n;
      if (!state.groups[t.groupId]) t.groupId = state.dockIds[0] || Object.keys(state.groups)[0];
    });
    Object.keys(state.groups).forEach(function (id) {
      const n = parseInt(String(id).replace(/\D/g, ""), 10);
      if (n > maxG) maxG = n;
    });
    if (!state.nextTab || state.nextTab <= maxT) state.nextTab = maxT + 1;
    if (!state.nextGroup || state.nextGroup <= maxG) state.nextGroup = maxG + 1;
    state.tabs = state.tabs.filter(function (t) {
      return t.groupId && state.groups[t.groupId];
    });
    Object.keys(state.groups).forEach(function (id) {
      if (!tabsIn(id).length) delete state.groups[id];
    });
    state.dockIds = (state.dockIds || []).filter(function (id) {
      return state.groups[id] && state.groups[id].kind === "dock";
    });
    Object.keys(state.groups).forEach(function (id) {
      const g = state.groups[id];
      const tabs = tabsIn(id);
      if (tabs.length && !tabs.some(function (t) { return t.id === g.activeId; })) {
        g.activeId = tabs[0].id;
      }
    });
    if (!state.focusedGroupId || !state.groups[state.focusedGroupId]) {
      state.focusedGroupId = state.dockIds[0] || Object.keys(state.groups)[0] || null;
    }
  }

  function createGroup(kind) {
    const g = { id: groupUid(), kind: kind, activeId: null };
    if (kind === "popup") {
      g.x = 48;
      g.y = 48;
      g.width = DEFAULT_POPUP.width;
      g.height = DEFAULT_POPUP.height;
      g.z = ++state.zTop;
    }
    state.groups[g.id] = g;
    return g;
  }

  function removeGroup(gid) {
    delete state.groups[gid];
    state.dockIds = state.dockIds.filter(function (id) {
      return id !== gid;
    });
    const el = groupEls.get(gid);
    if (el) {
      el.remove();
      groupEls.delete(gid);
    }
    if (state.focusedGroupId === gid) {
      state.focusedGroupId = state.dockIds[0] || Object.keys(state.groups)[0] || null;
    }
  }

  function getOrCreateFrame(tab) {
    let iframe = frames.get(tab.id);
    if (iframe) return iframe;
    iframe = document.createElement("iframe");
    iframe.className = "wm-frame";
    iframe.src =
      tab.kind === "graph" && tab.graphId
        ? "Graph.html?g=" + encodeURIComponent(tab.graphId)
        : "Algebra.html";
    iframe.title = tab.title;
    iframe.addEventListener("load", function () {
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.documentElement) doc.documentElement.classList.add("cas-embedded");
      } catch (err) {}
    });
    frames.set(tab.id, iframe);
    return iframe;
  }

  function destroyFrame(id) {
    const iframe = frames.get(id);
    if (iframe) {
      iframe.src = "about:blank";
      iframe.remove();
      frames.delete(id);
    }
  }

  function ensureGroupEl(gid) {
    let group = groupEls.get(gid);
    if (group) return group;
    const rec = state.groups[gid];
    group = document.createElement("div");
    group.className = "wm-group";
    group.dataset.groupId = gid;

    const strip = document.createElement("div");
    strip.className = "wm-tabstrip";

    const tabs = document.createElement("div");
    tabs.className = "wm-tabs";
    tabs.setAttribute("role", "tablist");

    const add = document.createElement("button");
    add.type = "button";
    add.className = "wm-add";
    add.title = "New tab";
    add.setAttribute("aria-label", "New tab");
    add.textContent = "+";
    add.addEventListener("click", function (e) {
      e.stopPropagation();
      addTab(gid);
    });

    strip.appendChild(tabs);
    strip.appendChild(add);

    const body = document.createElement("div");
    body.className = "wm-body";

    const resize = document.createElement("div");
    resize.className = "wm-resize";
    resize.hidden = true;

    group.appendChild(strip);
    group.appendChild(body);
    group.appendChild(resize);

    group.addEventListener("pointerdown", function () {
      focusGroup(gid);
    });

    strip.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".wm-tab") || e.target.closest(".wm-add") || e.target.closest(".wm-tab-close")) return;
      if (rec.kind === "popup") startPopupMove(e, gid);
    });

    resize.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      startPopupResize(e, gid);
    });

    tabs.addEventListener("click", function (e) {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const close = e.target.closest(".wm-tab-close");
      const tabEl = e.target.closest(".wm-tab");
      if (!tabEl) return;
      if (close) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(tabEl.dataset.windowId);
        return;
      }
      selectTab(tabEl.dataset.windowId);
    });

    tabs.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".wm-tab-close")) return;
      const tabEl = e.target.closest(".wm-tab");
      if (!tabEl) return;
      const pointerId = e.pointerId;
      const start = { x: e.clientX, y: e.clientY, started: false };
      function onMove(ev) {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!start.started) {
          if (dx * dx + dy * dy < 36) return;
          start.started = true;
          beginTabDrag(tabEl, ev.clientX, ev.clientY);
        }
        updateTabDrag(ev.clientX, ev.clientY);
      }
      function onUp() {
        tabEl.removeEventListener("pointermove", onMove);
        tabEl.removeEventListener("pointerup", onUp);
        tabEl.removeEventListener("pointercancel", onUp);
        try {
          tabEl.releasePointerCapture(pointerId);
        } catch (err) {}
        if (start.started) finishDrag();
      }
      try {
        tabEl.setPointerCapture(pointerId);
      } catch (err) {}
      tabEl.addEventListener("pointermove", onMove);
      tabEl.addEventListener("pointerup", onUp);
      tabEl.addEventListener("pointercancel", onUp);
    });

    groupEls.set(gid, group);
    return group;
  }

  function renderGroupTabs(gid) {
    const group = ensureGroupEl(gid);
    const tabsEl = group.querySelector(".wm-tabs");
    const rec = state.groups[gid];
    const frag = document.createDocumentFragment();
    tabsIn(gid).forEach(function (tab) {
      const el = document.createElement("div");
      el.className = "wm-tab" + (tab.id === rec.activeId ? " is-active" : "");
      el.dataset.windowId = tab.id;
      el.setAttribute("role", "tab");
      el.tabIndex = 0;
      const title = document.createElement("span");
      title.className = "wm-tab-title";
      title.textContent = tab.title;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "wm-tab-close";
      close.title = "Close " + tab.title;
      close.textContent = "×";
      el.appendChild(title);
      el.appendChild(close);
      frag.appendChild(el);
    });
    tabsEl.replaceChildren(frag);
  }

  function renderGroupBody(gid) {
    const rec = state.groups[gid];
    const group = ensureGroupEl(gid);
    const body = group.querySelector(".wm-body");
    const tab = rec.activeId ? getTab(rec.activeId) : tabsIn(gid)[0];
    if (!tab) {
      body.replaceChildren();
      return;
    }
    rec.activeId = tab.id;
    const iframe = getOrCreateFrame(tab);
    if (iframe.parentNode !== body) body.replaceChildren(iframe);
  }

  function styleGroup(gid) {
    const rec = state.groups[gid];
    const group = ensureGroupEl(gid);
    group.classList.toggle("is-focused", gid === state.focusedGroupId);
    group.classList.toggle("wm-popup", rec.kind === "popup");
    group.classList.toggle("is-top", rec.kind === "popup" && rec.z === state.zTop);
    const resize = group.querySelector(".wm-resize");
    if (rec.kind === "popup") {
      group.style.left = rec.x + "px";
      group.style.top = rec.y + "px";
      group.style.width = rec.width + "px";
      group.style.height = rec.height + "px";
      group.style.zIndex = String(rec.z);
      if (resize) resize.hidden = false;
    } else {
      group.style.left = "";
      group.style.top = "";
      group.style.width = "";
      group.style.height = "";
      group.style.zIndex = "";
      if (resize) resize.hidden = true;
    }
  }

  function render() {
    const docks = dockGroups();
    els.dock.classList.toggle("is-horizontal", docks.length === 2 && state.dockOrientation === "horizontal");
    els.dock.classList.toggle("is-vertical", docks.length === 2 && state.dockOrientation === "vertical");
    els.dock.classList.toggle("is-empty", docks.length === 0);

    if (!docks.length) {
      const empty = document.createElement("p");
      empty.className = "wm-empty";
      empty.innerHTML = "No docked pane. Floats stay as popups, or press <strong>+</strong> in a popup.";
      els.dock.replaceChildren(empty);
    } else {
      const nodes = docks.map(function (gid) {
        const group = ensureGroupEl(gid);
        group.classList.toggle("is-solo", docks.length === 1);
        styleGroup(gid);
        renderGroupTabs(gid);
        renderGroupBody(gid);
        return group;
      });
      els.dock.replaceChildren.apply(els.dock, nodes);
    }

    const popupIds = Object.keys(state.groups)
      .filter(function (id) {
        return state.groups[id].kind === "popup";
      })
      .sort(function (a, b) {
        return state.groups[a].z - state.groups[b].z;
      });
    const popupNodes = popupIds.map(function (gid) {
      const group = ensureGroupEl(gid);
      styleGroup(gid);
      renderGroupTabs(gid);
      renderGroupBody(gid);
      return group;
    });
    els.popups.replaceChildren.apply(els.popups, popupNodes);

    state.tabs.forEach(function (tab) {
      const iframe = frames.get(tab.id);
      const g = state.groups[tab.groupId];
      if (iframe && g && g.activeId !== tab.id && iframe.parentNode !== els.pool) {
        els.pool.appendChild(iframe);
      }
    });
    save();
  }

  function focusGroup(gid) {
    if (!state.groups[gid]) return;
    state.focusedGroupId = gid;
    if (state.groups[gid].kind === "popup") {
      state.groups[gid].z = ++state.zTop;
    }
    Object.keys(state.groups).forEach(function (id) {
      const el = groupEls.get(id);
      if (el) {
        el.classList.toggle("is-focused", id === gid);
        el.classList.toggle("is-top", state.groups[id].kind === "popup" && id === gid);
        if (state.groups[id].kind === "popup") el.style.zIndex = String(state.groups[id].z);
      }
    });
    save();
  }

  function selectTab(id) {
    const tab = getTab(id);
    if (!tab) return;
    const g = state.groups[tab.groupId];
    g.activeId = id;
    focusGroup(tab.groupId);
    render();
  }

  function addTab(gid) {
    if (!state.groups[gid]) {
      const g = createGroup("dock");
      gid = g.id;
      state.dockIds = [gid];
    }
    const tab = {
      id: tabUid(),
      title: "Window " + (state.nextTab - 1),
      groupId: gid,
    };
    state.tabs.push(tab);
    state.groups[gid].activeId = tab.id;
    state.focusedGroupId = gid;
    render();
  }

  function addGraphTab(graphId, title) {
    let gid = state.focusedGroupId;
    if (!gid || !state.groups[gid]) gid = state.dockIds[0];
    if (!gid || !state.groups[gid]) {
      const g = createGroup("dock");
      gid = g.id;
      state.dockIds = [gid];
    }
    const tab = {
      id: tabUid(),
      title: title || "Graph",
      groupId: gid,
      kind: "graph",
      graphId: graphId,
    };
    state.tabs.push(tab);
    state.groups[gid].activeId = tab.id;
    state.focusedGroupId = gid;
    render();
  }

  function closeTab(id) {
    const idx = state.tabs.findIndex(function (t) {
      return t.id === id;
    });
    if (idx < 0) return;
    const tab = state.tabs[idx];
    const gid = tab.groupId;
    state.tabs.splice(idx, 1);
    destroyFrame(id);
    const remaining = tabsIn(gid);
    if (!remaining.length) {
      removeGroup(gid);
      if (!state.tabs.length) {
        const g = createGroup("dock");
        state.dockIds = [g.id];
        addTab(g.id);
        return;
      }
    } else if (state.groups[gid] && state.groups[gid].activeId === id) {
      state.groups[gid].activeId = remaining[0].id;
    }
    render();
  }

  function moveTabToGroup(tabId, gid, beforeId, placeAfter) {
    const tab = getTab(tabId);
    if (!tab || !state.groups[gid]) return;
    const src = tab.groupId;
    tab.groupId = gid;
    if (src !== gid) {
      const srcTabs = tabsIn(src);
      if (state.groups[src]) {
        if (!srcTabs.length) removeGroup(src);
        else if (state.groups[src].activeId === tabId) state.groups[src].activeId = srcTabs[0].id;
      }
      state.groups[gid].activeId = tabId;
    }
    const without = state.tabs.filter(function (t) {
      return t.id !== tabId;
    });
    if (beforeId) {
      let at = without.findIndex(function (t) {
        return t.id === beforeId;
      });
      if (at < 0) without.push(tab);
      else {
        if (placeAfter) at += 1;
        without.splice(at, 0, tab);
      }
      state.tabs = without;
    } else if (src !== gid) {
      state.tabs = without.concat([tab]);
    }
    state.focusedGroupId = gid;
    render();
  }

  function canSplitFrom(tabId) {
    const tab = getTab(tabId);
    if (!tab || !state.groups[tab.groupId]) return false;
    if (tabsIn(tab.groupId).length > 1) return true;
    if (state.groups[tab.groupId].kind === "popup" && dockGroups().length >= 1) return true;
    return dockGroups().length > 1;
  }

  function splitTab(tabId, zone, hoverGroupId) {
    const tab = getTab(tabId);
    if (!tab) return;
    if (zone === "center") {
      toPopup(tabId);
      return;
    }
    if (zone === "pane" && hoverGroupId) {
      moveTabToGroup(tabId, hoverGroupId);
      return;
    }
    const docks = dockGroups();
    if (docks.length >= 2) {
      const target = hoverGroupId && state.groups[hoverGroupId] && state.groups[hoverGroupId].kind === "dock"
        ? hoverGroupId
        : (zone === "left" || zone === "top" ? docks[0] : docks[1]);
      moveTabToGroup(tabId, target);
      if (zone === "left" || zone === "right") state.dockOrientation = "horizontal";
      if (zone === "top" || zone === "bottom") state.dockOrientation = "vertical";
      render();
      return;
    }
    if (!canSplitFrom(tabId)) return;
    const src = tab.groupId;
    const g = createGroup("dock");
    tab.groupId = g.id;
    g.activeId = tab.id;
    const left = tabsIn(src);
    if (!left.length) removeGroup(src);
    else if (state.groups[src] && state.groups[src].activeId === tabId) {
      state.groups[src].activeId = left[0].id;
    }
    const other = state.groups[src] ? src : docks.filter(function (id) { return id !== g.id; })[0];
    if (zone === "left" || zone === "top") state.dockIds = [g.id, other].filter(Boolean);
    else state.dockIds = [other, g.id].filter(Boolean);
    state.dockOrientation = zone === "left" || zone === "right" ? "horizontal" : "vertical";
    state.focusedGroupId = g.id;
    render();
  }

  function toPopup(tabId) {
    const tab = getTab(tabId);
    if (!tab) return;
    const src = tab.groupId;
    if (state.groups[src] && state.groups[src].kind === "popup" && tabsIn(src).length === 1) {
      focusGroup(src);
      return;
    }
    const g = createGroup("popup");
    const stage = els.stage.getBoundingClientRect();
    const count = Object.keys(state.groups).filter(function (id) {
      return state.groups[id].kind === "popup";
    }).length;
    g.width = Math.min(DEFAULT_POPUP.width, Math.max(MIN_POPUP.width, Math.floor(stage.width * 0.45)));
    g.height = Math.min(DEFAULT_POPUP.height, Math.max(MIN_POPUP.height, Math.floor(stage.height * 0.55)));
    g.x = Math.max(16, Math.floor((stage.width - g.width) / 2) + (count - 1) * 28);
    g.y = Math.max(16, Math.floor((stage.height - g.height) / 2) + (count - 1) * 28);
    tab.groupId = g.id;
    g.activeId = tab.id;
    const left = tabsIn(src);
    if (!left.length) removeGroup(src);
    else if (state.groups[src].activeId === tabId) state.groups[src].activeId = left[0].id;
    state.focusedGroupId = g.id;
    render();
  }

  function groupAtPoint(x, y) {
    const nodes = document.querySelectorAll(".wm-group");
    for (let i = nodes.length - 1; i >= 0; i--) {
      const rect = nodes[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return nodes[i];
    }
    return null;
  }

  function zoneInRect(x, y, rect) {
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const px = (x - rect.left) / rect.width;
    const py = (y - rect.top) / rect.height;
    const left = px < ZONE_EDGE;
    const right = px > 1 - ZONE_EDGE;
    const top = py < ZONE_EDGE;
    const bottom = py > 1 - ZONE_EDGE;
    if (left && !top && !bottom) return "left";
    if (right && !top && !bottom) return "right";
    if (top && !left && !right) return "top";
    if (bottom && !left && !right) return "bottom";
    if ((left || right) && (top || bottom)) {
      if (Math.min(px, 1 - px) < Math.min(py, 1 - py)) return px < 0.5 ? "left" : "right";
      return py < 0.5 ? "top" : "bottom";
    }
    return "center";
  }

  function positionPreview(rect) {
    const stage = els.stage.getBoundingClientRect();
    els.preview.style.left = rect.left - stage.left + "px";
    els.preview.style.top = rect.top - stage.top + "px";
    els.preview.style.width = rect.width + "px";
    els.preview.style.height = rect.height + "px";
  }

  function showPreview(mode, zone) {
    els.preview.classList.toggle("is-visible", !!mode);
    els.preview.classList.toggle("is-split", mode === "split");
    els.preview.classList.toggle("is-move", mode === "move");
    els.preview.querySelectorAll(".wm-preview-zone").forEach(function (el) {
      el.classList.toggle("is-active", !!zone && el.getAttribute("data-zone") === zone);
    });
  }

  function beginTabDrag(tabEl, x, y) {
    dragging = {
      id: tabEl.dataset.windowId,
      groupId: getTab(tabEl.dataset.windowId).groupId,
      overTabId: null,
      placeAfter: false,
      hoverGroupId: null,
      zone: null,
      mode: null,
    };
    tabEl.classList.add("is-dragging");
    document.body.classList.add("is-dragging-tab");
    els.ghost.textContent = tabEl.querySelector(".wm-tab-title").textContent;
    els.ghost.classList.add("is-visible");
    els.catcher.classList.add("is-visible");
    els.ghost.style.left = x + 14 + "px";
    els.ghost.style.top = y + 12 + "px";
    updateTabDrag(x, y);
  }

  function updateTabDrag(x, y) {
    if (!dragging) return;
    els.ghost.style.left = x + 14 + "px";
    els.ghost.style.top = y + 12 + "px";
    document.querySelectorAll(".wm-tab").forEach(function (t) {
      t.classList.remove("drop-before", "drop-after");
    });
    document.querySelectorAll(".wm-tabstrip").forEach(function (s) {
      s.classList.remove("drop-into");
    });

    const groupEl = groupAtPoint(x, y);
    dragging.hoverGroupId = groupEl ? groupEl.dataset.groupId : null;
    dragging.overTabId = null;
    dragging.zone = null;
    dragging.mode = null;

    if (groupEl) {
      const strip = groupEl.querySelector(".wm-tabstrip");
      const body = groupEl.querySelector(".wm-body");
      const stripRect = strip.getBoundingClientRect();
      if (x >= stripRect.left && x <= stripRect.right && y >= stripRect.top && y <= stripRect.bottom) {
        const tabs = strip.querySelectorAll(".wm-tab");
        let hit = null;
        for (let i = 0; i < tabs.length; i++) {
          if (tabs[i].dataset.windowId === dragging.id) continue;
          const r = tabs[i].getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            hit = tabs[i];
            dragging.placeAfter = x > r.left + r.width / 2;
            break;
          }
        }
        dragging.mode = "strip";
        dragging.hoverGroupId = groupEl.dataset.groupId;
        if (hit) {
          dragging.overTabId = hit.dataset.windowId;
          hit.classList.add(dragging.placeAfter ? "drop-after" : "drop-before");
        } else {
          strip.classList.add("drop-into");
        }
        showPreview(null);
        return;
      }
      const bodyRect = body.getBoundingClientRect();
      positionPreview(groupEl.getBoundingClientRect());
      const docks = dockGroups();
      const hoverG = state.groups[groupEl.dataset.groupId];
      if (hoverG && hoverG.kind === "dock" && docks.length === 1) {
        const fromHere = dragging.groupId === hoverG.id;
        if (!fromHere || tabsIn(dragging.groupId).length > 1) {
          dragging.mode = "split";
          dragging.zone = zoneInRect(x, y, bodyRect);
          showPreview("split", dragging.zone);
          return;
        }
      }
      dragging.mode = "move";
      const z = zoneInRect(x, y, bodyRect);
      dragging.zone = z === "center" ? "center" : "pane";
      showPreview("move", dragging.zone);
      return;
    }
    showPreview(null);
  }

  function finishDrag() {
    const d = dragging;
    dragging = null;
    document.body.classList.remove("is-dragging-tab");
    els.ghost.classList.remove("is-visible");
    els.catcher.classList.remove("is-visible");
    showPreview(null);
    document.querySelectorAll(".wm-tab").forEach(function (t) {
      t.classList.remove("is-dragging", "drop-before", "drop-after");
    });
    document.querySelectorAll(".wm-tabstrip").forEach(function (s) {
      s.classList.remove("drop-into");
    });
    if (!d) return;
    ignoreNextClick = true;
    if (d.mode === "strip" && d.hoverGroupId) {
      moveTabToGroup(d.id, d.hoverGroupId, d.overTabId, d.placeAfter);
      return;
    }
    if (d.mode === "split" && d.zone) {
      splitTab(d.id, d.zone, d.hoverGroupId);
      return;
    }
    if (d.mode === "move" && d.zone) {
      splitTab(d.id, d.zone, d.hoverGroupId);
    }
  }

  function startPopupMove(e, gid) {
    const g = state.groups[gid];
    if (!g || g.kind !== "popup") return;
    e.preventDefault();
    focusGroup(gid);
    const start = { x: e.clientX, y: e.clientY, left: g.x, top: g.y };
    const target = e.currentTarget;
    function onMove(ev) {
      g.x = Math.max(0, start.left + (ev.clientX - start.x));
      g.y = Math.max(0, start.top + (ev.clientY - start.y));
      const el = groupEls.get(gid);
      if (el) {
        el.style.left = g.x + "px";
        el.style.top = g.y + "px";
      }
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      save();
    }
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function startPopupResize(e, gid) {
    const g = state.groups[gid];
    if (!g || g.kind !== "popup") return;
    e.preventDefault();
    focusGroup(gid);
    const start = { x: e.clientX, y: e.clientY, w: g.width, h: g.height };
    const target = e.currentTarget;
    function onMove(ev) {
      g.width = Math.max(MIN_POPUP.width, start.w + (ev.clientX - start.x));
      g.height = Math.max(MIN_POPUP.height, start.h + (ev.clientY - start.y));
      const el = groupEls.get(gid);
      if (el) {
        el.style.width = g.width + "px";
        el.style.height = g.height + "px";
      }
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      save();
    }
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function boot() {
    els.stage = document.getElementById("wm-stage");
    els.dock = document.getElementById("wm-dock");
    els.popups = document.getElementById("wm-popups");
    els.preview = document.getElementById("wm-dock-preview");
    els.catcher = document.getElementById("wm-drop-catcher");
    els.pool = document.getElementById("wm-pool");
    els.ghost = document.getElementById("wm-drag-ghost");

    window.addEventListener("message", function (e) {
      if (!e.data || e.data.type !== "cas-open-graph" || !e.data.id) return;
      addGraphTab(e.data.id, e.data.title || "Graph");
    });

    if (!load()) {
      const g = createGroup("dock");
      state.dockIds = [g.id];
      state.tabs = [{ id: tabUid(), title: "Window 1", groupId: g.id }];
      g.activeId = state.tabs[0].id;
      state.focusedGroupId = g.id;
    }
    if (!dockGroups().length && !Object.keys(state.groups).length) {
      const g = createGroup("dock");
      state.dockIds = [g.id];
      addTab(g.id);
      return;
    }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
