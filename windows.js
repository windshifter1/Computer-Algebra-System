(function () {
  "use strict";

  const STORAGE_KEY = "cas-windows-v3";
  const MIN_PCT = { w: 18, h: 20 };
  const SNAP = {
    left: { x: 0, y: 0, w: 50, h: 100, label: "Left 50%" },
    right: { x: 50, y: 0, w: 50, h: 100, label: "Right 50%" },
    top: { x: 0, y: 0, w: 100, h: 50, label: "Top 50%" },
    bottom: { x: 0, y: 50, w: 100, h: 50, label: "Bottom 50%" },
    tl: { x: 0, y: 0, w: 50, h: 50, label: "Top-left 50×50" },
    tr: { x: 50, y: 0, w: 50, h: 50, label: "Top-right 50×50" },
    bl: { x: 0, y: 50, w: 50, h: 50, label: "Bottom-left 50×50" },
    br: { x: 50, y: 50, w: 50, h: 50, label: "Bottom-right 50×50" },
    float: { x: 22, y: 16, w: 42, h: 55, label: "Float" },
  };
  const COMPLEMENT = {
    left: { x: 50, y: 0, w: 50, h: 100 },
    right: { x: 0, y: 0, w: 50, h: 100 },
    top: { x: 0, y: 50, w: 100, h: 50 },
    bottom: { x: 0, y: 0, w: 100, h: 50 },
    tl: { x: 50, y: 0, w: 50, h: 100 },
    tr: { x: 0, y: 0, w: 50, h: 100 },
    bl: { x: 50, y: 0, w: 50, h: 100 },
    br: { x: 0, y: 0, w: 50, h: 100 },
  };

  let state = {
    nextTab: 1,
    nextGroup: 1,
    tabs: [],
    groups: {},
    focusedGroupId: null,
    zTop: 20,
  };

  const els = {};
  const frames = new Map();
  const groupEls = new Map();
  let dragging = null;
  let ignoreNextClick = false;
  let overlayOn = true;

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

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function roundPct(n) {
    return Math.round(n * 10) / 10;
  }

  function stageSize() {
    const r = els.windows.getBoundingClientRect();
    return { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top };
  }

  function pointerPct(clientX, clientY) {
    const s = stageSize();
    return {
      x: clamp(((clientX - s.left) / s.w) * 100, 0, 100),
      y: clamp(((clientY - s.top) / s.h) * 100, 0, 100),
    };
  }

  function normalizeRect(r) {
    const next = {
      x: roundPct(clamp(r.x, 0, 100)),
      y: roundPct(clamp(r.y, 0, 100)),
      w: roundPct(clamp(r.w, MIN_PCT.w, 100)),
      h: roundPct(clamp(r.h, MIN_PCT.h, 100)),
    };
    if (next.x + next.w > 100) next.x = roundPct(100 - next.w);
    if (next.y + next.h > 100) next.y = roundPct(100 - next.h);
    next.x = clamp(next.x, 0, 100 - next.w);
    next.y = clamp(next.y, 0, 100 - next.h);
    return next;
  }

  function sameRect(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  function groupByRect(rect) {
    return Object.keys(state.groups).find(function (id) {
      return sameRect(state.groups[id], rect);
    });
  }

  function fmtRect(r) {
    return r.x + "%, " + r.y + "%  ·  " + r.w + "×" + r.h + "%";
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function migrateOld() {
    try {
      const raw = localStorage.getItem("cas-windows-v2");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tabs) || !parsed.tabs.length) return false;
      const stage = { w: window.innerWidth - 16, h: window.innerHeight - 16 };
      state.tabs = parsed.tabs;
      state.nextTab = parsed.nextTab || 1;
      state.nextGroup = parsed.nextGroup || 1;
      state.focusedGroupId = parsed.focusedGroupId || null;
      state.zTop = parsed.zTop || 20;
      state.groups = {};
      const docks = (parsed.dockIds || []).filter(function (id) {
        return parsed.groups && parsed.groups[id] && parsed.groups[id].kind === "dock";
      });
      Object.keys(parsed.groups || {}).forEach(function (id) {
        const src = parsed.groups[id];
        const g = { id: id, kind: src.kind || "dock", activeId: src.activeId, z: src.z || 1 };
        if (src.kind === "popup") {
          const rect = normalizeRect({
            x: ((src.x || 0) / stage.w) * 100,
            y: ((src.y || 0) / stage.h) * 100,
            w: ((src.width || 560) / stage.w) * 100,
            h: ((src.height || 440) / stage.h) * 100,
          });
          g.x = rect.x;
          g.y = rect.y;
          g.w = rect.w;
          g.h = rect.h;
        } else if (docks.length === 2 && docks[0] === id) {
          Object.assign(g, parsed.dockOrientation === "vertical" ? { x: 0, y: 0, w: 100, h: 50 } : { x: 0, y: 0, w: 50, h: 100 });
        } else if (docks.length === 2 && docks[1] === id) {
          Object.assign(g, parsed.dockOrientation === "vertical" ? { x: 0, y: 50, w: 100, h: 50 } : { x: 50, y: 0, w: 50, h: 100 });
        } else {
          Object.assign(g, { x: 0, y: 0, w: 100, h: 100 });
        }
        state.groups[id] = g;
      });
      prune();
      return state.tabs.length > 0;
    } catch (e) {
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return migrateOld();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return false;
      state = parsed;
      if (!state.groups) state.groups = {};
      if (!state.zTop) state.zTop = 20;
      Object.keys(state.groups).forEach(function (id) {
        const g = state.groups[id];
        const rect = normalizeRect({
          x: g.x == null ? 0 : g.x,
          y: g.y == null ? 0 : g.y,
          w: g.w == null ? 100 : g.w,
          h: g.h == null ? 100 : g.h,
        });
        g.x = rect.x;
        g.y = rect.y;
        g.w = rect.w;
        g.h = rect.h;
      });
      prune();
      return state.tabs.length > 0;
    } catch (e) {
      return false;
    }
  }

  function prune() {
    let maxT = 0;
    let maxG = 0;
    const ids = Object.keys(state.groups);
    state.tabs.forEach(function (t) {
      const n = parseInt(String(t.id).replace(/\D/g, ""), 10);
      if (n > maxT) maxT = n;
      if (!state.groups[t.groupId]) t.groupId = ids[0];
    });
    ids.forEach(function (id) {
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
    Object.keys(state.groups).forEach(function (id) {
      const g = state.groups[id];
      const tabs = tabsIn(id);
      if (tabs.length && !tabs.some(function (t) {
        return t.id === g.activeId;
      })) {
        g.activeId = tabs[0].id;
      }
    });
    if (!state.focusedGroupId || !state.groups[state.focusedGroupId]) {
      state.focusedGroupId = Object.keys(state.groups)[0] || null;
    }
  }

  function createGroup(kind, rect) {
    const g = { id: groupUid(), kind: kind || "dock", activeId: null, z: 1 };
    const next = normalizeRect(rect || (kind === "popup" ? SNAP.float : { x: 0, y: 0, w: 100, h: 100 }));
    g.x = next.x;
    g.y = next.y;
    g.w = next.w;
    g.h = next.h;
    if (kind === "popup") g.z = ++state.zTop;
    state.groups[g.id] = g;
    return g;
  }

  function removeGroup(gid) {
    delete state.groups[gid];
    const el = groupEls.get(gid);
    if (el) {
      el.remove();
      groupEls.delete(gid);
    }
    if (state.focusedGroupId === gid) {
      state.focusedGroupId = Object.keys(state.groups)[0] || null;
    }
  }

  function getOrCreateFrame(tab) {
    let iframe = frames.get(tab.id);
    if (iframe) return iframe;
    iframe = document.createElement("iframe");
    iframe.className = "wm-frame is-hidden";
    iframe.dataset.windowId = tab.id;
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

    const badge = document.createElement("div");
    badge.className = "wm-pct-badge";

    strip.appendChild(tabs);
    strip.appendChild(add);

    const body = document.createElement("div");
    body.className = "wm-body";

    const resize = document.createElement("div");
    resize.className = "wm-resize";

    group.appendChild(strip);
    group.appendChild(body);
    group.appendChild(resize);
    group.appendChild(badge);

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
    const scroll = tabsEl.scrollLeft;
    tabsEl.replaceChildren(frag);
    tabsEl.scrollLeft = scroll;
  }

  function renderGroupBody(gid) {
    const rec = state.groups[gid];
    const group = ensureGroupEl(gid);
    const body = group.querySelector(".wm-body");
    const list = tabsIn(gid);
    const tab = rec.activeId ? getTab(rec.activeId) : list[0];
    if (!tab) return;
    rec.activeId = tab.id;
    list.forEach(function (t) {
      const iframe = getOrCreateFrame(t);
      if (iframe.parentNode !== body) body.appendChild(iframe);
      const on = t.id === tab.id;
      iframe.classList.toggle("is-active", on);
      iframe.classList.toggle("is-hidden", !on);
    });
  }

  function syncChildren(parent, nodes) {
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (parent.children[i] !== nodes[i]) {
        parent.insertBefore(nodes[i], parent.children[i] || null);
      }
    }
    while (parent.children.length > nodes.length) {
      parent.removeChild(parent.lastChild);
    }
  }

  function applyRect(el, g) {
    const tiled = g.kind !== "popup";
    const gap = tiled ? 8 : 0;
    const leftGap = tiled && g.x > 0.5 ? gap / 2 : 0;
    const topGap = tiled && g.y > 0.5 ? gap / 2 : 0;
    const rightGap = tiled && g.x + g.w < 99.5 ? gap / 2 : 0;
    const bottomGap = tiled && g.y + g.h < 99.5 ? gap / 2 : 0;
    el.style.left = leftGap ? "calc(" + g.x + "% + " + leftGap + "px)" : g.x + "%";
    el.style.top = topGap ? "calc(" + g.y + "% + " + topGap + "px)" : g.y + "%";
    el.style.width = leftGap + rightGap ? "calc(" + g.w + "% - " + (leftGap + rightGap) + "px)" : g.w + "%";
    el.style.height = topGap + bottomGap ? "calc(" + g.h + "% - " + (topGap + bottomGap) + "px)" : g.h + "%";
    el.style.zIndex = String(g.kind === "popup" ? g.z : 1);
  }

  function styleGroup(gid) {
    const rec = state.groups[gid];
    const group = ensureGroupEl(gid);
    group.classList.toggle("is-focused", gid === state.focusedGroupId);
    group.classList.toggle("wm-popup", rec.kind === "popup");
    group.classList.toggle("is-top", rec.kind === "popup" && rec.z === state.zTop);
    applyRect(group, rec);
    const badge = group.querySelector(".wm-pct-badge");
    if (badge) badge.textContent = fmtRect(rec);
  }

  function render() {
    const ids = Object.keys(state.groups).sort(function (a, b) {
      const az = state.groups[a].kind === "popup" ? state.groups[a].z : 0;
      const bz = state.groups[b].kind === "popup" ? state.groups[b].z : 0;
      return az - bz;
    });
    if (!ids.length) {
      let empty = els.windows.querySelector(":scope > .wm-empty");
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "wm-empty";
        empty.textContent = "No windows. Press + to open one.";
      }
      syncChildren(els.windows, [empty]);
    } else {
      const nodes = ids.map(function (gid) {
        styleGroup(gid);
        renderGroupTabs(gid);
        renderGroupBody(gid);
        return ensureGroupEl(gid);
      });
      syncChildren(els.windows, nodes);
    }
    updateHud();
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
      if (!el) return;
      el.classList.toggle("is-focused", id === gid);
      el.classList.toggle("is-top", state.groups[id].kind === "popup" && id === gid);
      if (state.groups[id].kind === "popup") el.style.zIndex = String(state.groups[id].z);
    });
    updateHud();
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
      const g = createGroup("dock", { x: 0, y: 0, w: 100, h: 100 });
      gid = g.id;
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
    if (!gid || !state.groups[gid]) gid = Object.keys(state.groups)[0];
    if (!gid || !state.groups[gid]) {
      const g = createGroup("dock", { x: 0, y: 0, w: 100, h: 100 });
      gid = g.id;
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
        const g = createGroup("dock", { x: 0, y: 0, w: 100, h: 100 });
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

  function applySnap(tabId, zoneName, pointer) {
    const tab = getTab(tabId);
    if (!tab) return;
    const src = tab.groupId;
    if (zoneName === "float") {
      const p = pointer || { x: 50, y: 40 };
      const rect = normalizeRect({
        x: p.x - SNAP.float.w / 2,
        y: p.y - 8,
        w: SNAP.float.w,
        h: SNAP.float.h,
      });
      if (state.groups[src] && tabsIn(src).length === 1) {
        Object.assign(state.groups[src], rect, { kind: "popup", z: ++state.zTop });
        state.focusedGroupId = src;
        render();
        return;
      }
      const g = createGroup("popup", rect);
      tab.groupId = g.id;
      g.activeId = tab.id;
      const left = tabsIn(src);
      if (!left.length) removeGroup(src);
      else if (state.groups[src].activeId === tabId) state.groups[src].activeId = left[0].id;
      state.focusedGroupId = g.id;
      render();
      return;
    }
    const rect = SNAP[zoneName];
    if (!rect) return;
    const existing = groupByRect(rect);
    if (existing && existing !== src) {
      moveTabToGroup(tabId, existing);
      return;
    }
    if (state.groups[src] && tabsIn(src).length === 1) {
      Object.assign(state.groups[src], { x: rect.x, y: rect.y, w: rect.w, h: rect.h, kind: "dock", z: 1 });
      state.focusedGroupId = src;
      render();
      return;
    }
    const g = createGroup("dock", rect);
    tab.groupId = g.id;
    g.activeId = tab.id;
    const left = tabsIn(src);
    if (!left.length) removeGroup(src);
    else {
      if (state.groups[src].activeId === tabId) state.groups[src].activeId = left[0].id;
      if (state.groups[src].w === 100 && state.groups[src].h === 100 && COMPLEMENT[zoneName]) {
        Object.assign(state.groups[src], COMPLEMENT[zoneName]);
      }
    }
    state.focusedGroupId = g.id;
    render();
  }

  function zoneFromPct(px, py) {
    if (px < 18) return py < 22 ? "tl" : py > 78 ? "bl" : "left";
    if (px > 82) return py < 22 ? "tr" : py > 78 ? "br" : "right";
    if (py < 16) return "top";
    if (py > 84) return "bottom";
    return "float";
  }

  function groupAtPoint(x, y) {
    const nodes = document.querySelectorAll(".wm-group");
    for (let i = nodes.length - 1; i >= 0; i--) {
      const rect = nodes[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return nodes[i];
    }
    return null;
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
      pointer: pointerPct(x, y),
    };
    tabEl.classList.add("is-dragging");
    document.body.classList.add("is-dragging-tab");
    els.ghost.textContent = tabEl.querySelector(".wm-tab-title").textContent;
    els.ghost.classList.add("is-visible");
    els.catcher.classList.add("is-visible");
    els.zones.classList.add("is-visible");
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

    const pct = pointerPct(x, y);
    dragging.pointer = pct;
    const groupEl = groupAtPoint(x, y);
    dragging.hoverGroupId = groupEl ? groupEl.dataset.groupId : null;
    dragging.overTabId = null;
    dragging.zone = null;
    dragging.mode = null;

    if (groupEl) {
      const strip = groupEl.querySelector(".wm-tabstrip");
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
        setSnapPreview(null, "Drop on tab strip · " + roundPct(pct.x) + "%, " + roundPct(pct.y) + "%");
        highlightZone(null);
        return;
      }
    }

    dragging.mode = "snap";
    dragging.zone = zoneFromPct(pct.x, pct.y);
    const snap = SNAP[dragging.zone];
    highlightZone(dragging.zone);
    if (dragging.zone === "float") {
      const live = normalizeRect({
        x: pct.x - SNAP.float.w / 2,
        y: pct.y - 8,
        w: SNAP.float.w,
        h: SNAP.float.h,
      });
      setSnapPreview(live, "Float at " + fmtRect(live));
    } else {
      setSnapPreview(snap, snap.label + " · " + fmtRect(snap));
    }
  }

  function finishDrag() {
    const d = dragging;
    dragging = null;
    document.body.classList.remove("is-dragging-tab");
    els.ghost.classList.remove("is-visible");
    els.catcher.classList.remove("is-visible");
    els.zones.classList.remove("is-visible");
    setSnapPreview(null);
    highlightZone(null);
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
    if (d.mode === "snap" && d.zone) applySnap(d.id, d.zone, d.pointer);
    updateHud();
  }

  function startPopupMove(e, gid) {
    const g = state.groups[gid];
    if (!g || g.kind !== "popup") return;
    e.preventDefault();
    focusGroup(gid);
    const start = pointerPct(e.clientX, e.clientY);
    const origin = { x: g.x, y: g.y };
    const target = e.currentTarget;
    function onMove(ev) {
      const now = pointerPct(ev.clientX, ev.clientY);
      const next = normalizeRect({
        x: origin.x + (now.x - start.x),
        y: origin.y + (now.y - start.y),
        w: g.w,
        h: g.h,
      });
      g.x = next.x;
      g.y = next.y;
      const el = groupEls.get(gid);
      if (el) {
        applyRect(el, g);
        const badge = el.querySelector(".wm-pct-badge");
        if (badge) badge.textContent = fmtRect(g);
      }
      setHud("move  " + fmtRect(g));
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      updateHud();
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
    if (!g) return;
    e.preventDefault();
    focusGroup(gid);
    const start = pointerPct(e.clientX, e.clientY);
    const origin = { w: g.w, h: g.h };
    const target = e.currentTarget;
    function onMove(ev) {
      const now = pointerPct(ev.clientX, ev.clientY);
      const next = normalizeRect({
        x: g.x,
        y: g.y,
        w: origin.w + (now.x - start.x),
        h: origin.h + (now.y - start.y),
      });
      g.w = next.w;
      g.h = next.h;
      const el = groupEls.get(gid);
      if (el) {
        applyRect(el, g);
        const badge = el.querySelector(".wm-pct-badge");
        if (badge) badge.textContent = fmtRect(g);
      }
      setHud("resize  " + fmtRect(g));
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      updateHud();
      save();
    }
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function buildGrid() {
    const grid = els.grid;
    grid.innerHTML = "";
    for (let i = 1; i < 10; i++) {
      const v = document.createElement("div");
      v.className = "wm-pct-line is-v" + (i === 5 ? " is-major" : "");
      v.style.left = i * 10 + "%";
      const vl = document.createElement("span");
      vl.className = "wm-pct-line-label";
      vl.textContent = i * 10 + "%";
      v.appendChild(vl);
      grid.appendChild(v);
      const h = document.createElement("div");
      h.className = "wm-pct-line is-h" + (i === 5 ? " is-major" : "");
      h.style.top = i * 10 + "%";
      const hl = document.createElement("span");
      hl.className = "wm-pct-line-label is-h";
      hl.textContent = i * 10 + "%";
      h.appendChild(hl);
      grid.appendChild(h);
    }
    Object.keys(SNAP).forEach(function (name) {
      if (name === "float") return;
      const r = SNAP[name];
      const z = document.createElement("div");
      z.className = "wm-pct-zone";
      z.dataset.zone = name;
      z.style.left = r.x + "%";
      z.style.top = r.y + "%";
      z.style.width = r.w + "%";
      z.style.height = r.h + "%";
      z.innerHTML = "<span>" + r.label + "</span>";
      els.zones.appendChild(z);
    });
    const f = document.createElement("div");
    f.className = "wm-pct-zone is-float";
    f.dataset.zone = "float";
    f.style.left = "18%";
    f.style.top = "16%";
    f.style.width = "64%";
    f.style.height = "68%";
    f.innerHTML = "<span>Float (center)</span>";
    els.zones.appendChild(f);
  }

  function highlightZone(name) {
    els.zones.querySelectorAll(".wm-pct-zone").forEach(function (el) {
      el.classList.toggle("is-active", !!name && el.dataset.zone === name);
    });
  }

  function setSnapPreview(rect, text) {
    if (!rect) {
      els.snap.hidden = true;
      if (text) setHud(text);
      else updateHud();
      return;
    }
    els.snap.hidden = false;
    els.snap.style.left = rect.x + "%";
    els.snap.style.top = rect.y + "%";
    els.snap.style.width = rect.w + "%";
    els.snap.style.height = rect.h + "%";
    els.snap.textContent = text || fmtRect(rect);
    setHud(text || fmtRect(rect));
  }

  function setHud(text) {
    if (els.hudText) els.hudText.textContent = text;
  }

  function updateHud() {
    const g = state.focusedGroupId && state.groups[state.focusedGroupId];
    if (!g) {
      setHud("percent layout · drag a tab to snap");
      return;
    }
    setHud((g.kind === "popup" ? "popup  " : "tiled  ") + fmtRect(g));
  }

  function setOverlay(on) {
    overlayOn = on;
    els.overlay.classList.toggle("is-on", on);
    els.toggle.classList.toggle("is-on", on);
  }

  function boot() {
    els.stage = document.getElementById("wm-stage");
    els.windows = document.getElementById("wm-windows");
    els.overlay = document.getElementById("wm-pct-overlay");
    els.grid = document.getElementById("wm-pct-grid");
    els.zones = document.getElementById("wm-pct-zones");
    els.snap = document.getElementById("wm-pct-snap");
    els.catcher = document.getElementById("wm-drop-catcher");
    els.ghost = document.getElementById("wm-drag-ghost");
    els.hudText = document.getElementById("wm-pct-hud-text");
    els.toggle = document.getElementById("wm-pct-toggle");

    buildGrid();
    setOverlay(true);
    els.toggle.addEventListener("click", function () {
      setOverlay(!overlayOn);
    });

    window.addEventListener("message", function (e) {
      if (!e.data || e.data.type !== "cas-open-graph" || !e.data.id) return;
      addGraphTab(e.data.id, e.data.title || "Graph");
    });

    window.addEventListener("resize", function () {
      Object.keys(state.groups).forEach(function (id) {
        const el = groupEls.get(id);
        if (el) applyRect(el, state.groups[id]);
      });
    });

    if (!load()) {
      const g = createGroup("dock", { x: 0, y: 0, w: 100, h: 100 });
      state.tabs = [{ id: tabUid(), title: "Window 1", groupId: g.id }];
      g.activeId = state.tabs[0].id;
      state.focusedGroupId = g.id;
    }
    if (!Object.keys(state.groups).length) {
      const g = createGroup("dock", { x: 0, y: 0, w: 100, h: 100 });
      addTab(g.id);
      return;
    }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
