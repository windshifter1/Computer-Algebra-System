(function () {
  "use strict";

  const STORAGE_KEY = "cas-windows-v3";
  const MIN_PCT = { w: 18, h: 20 };
  const CUT = 25;
  const SNAP = {
    left: { x: 0, y: 0, w: 50, h: 100, label: "Left 50%" },
    right: { x: 50, y: 0, w: 50, h: 100, label: "Right 50%" },
    top: { x: 0, y: 0, w: 100, h: 50, label: "Top 50%" },
    bottom: { x: 0, y: 50, w: 100, h: 50, label: "Bottom 50%" },
    float: { x: 22, y: 16, w: 42, h: 55, label: "Float" },
  };
  const COMPLEMENT = {
    left: { x: 50, y: 0, w: 50, h: 100 },
    right: { x: 0, y: 0, w: 50, h: 100 },
    top: { x: 0, y: 50, w: 100, h: 50 },
    bottom: { x: 0, y: 0, w: 100, h: 50 },
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
  let snapKind = null;

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
      x: ((clientX - s.left) / s.w) * 100,
      y: ((clientY - s.top) / s.h) * 100,
    };
  }

  function sizeRect(r) {
    return {
      x: roundPct(r.x),
      y: roundPct(r.y),
      w: roundPct(clamp(r.w, MIN_PCT.w, 100)),
      h: roundPct(clamp(r.h, MIN_PCT.h, 100)),
    };
  }

  function floatRectAt(px, py) {
    return sizeRect({
      x: px - SNAP.float.w / 2,
      y: py - 8,
      w: SNAP.float.w,
      h: SNAP.float.h,
    });
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
          const rect = sizeRect({
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
        const fit = g.kind === "popup" ? sizeRect : normalizeRect;
        const rect = fit({
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
    const fallback = kind === "popup" ? SNAP.float : { x: 0, y: 0, w: 100, h: 100 };
    const next = (kind === "popup" ? sizeRect : normalizeRect)(rect || fallback);
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
      const rect = tabEl.getBoundingClientRect();
      const start = {
        x: e.clientX,
        y: e.clientY,
        started: false,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        originLeft: rect.left,
        pointerId: pointerId,
      };
      function onMove(ev) {
        if (ev.pointerId !== pointerId) return;
        if (ev.buttons === 0) {
          onUp(ev);
          return;
        }
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!start.started) {
          if (dx * dx + dy * dy < 36) return;
          start.started = true;
          beginTabDrag(tabEl, ev.clientX, ev.clientY, start);
        }
        queueTabDrag(ev.clientX, ev.clientY);
      }
      function onUp(ev) {
        if (ev && ev.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onUp, true);
        try {
          tabEl.releasePointerCapture(pointerId);
        } catch (err) {}
        try {
          els.catcher.releasePointerCapture(pointerId);
        } catch (err) {}
        if (start.started) {
          updateTabDrag(ev.clientX, ev.clientY);
          finishDrag();
        }
      }
      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("pointercancel", onUp, true);
      try {
        tabEl.setPointerCapture(pointerId);
      } catch (err) {}
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
    if (dragging) return;
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
      const rect = floatRectAt(p.x, p.y);
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
    const x = clamp(px, 0, 99.999);
    const y = clamp(py, 0, 99.999);
    const inner = 100 - CUT;
    if (x >= CUT && x <= inner && y >= CUT && y <= inner) return "float";
    if (y <= Math.min(x, 100 - x)) return "top";
    if (y >= Math.max(x, 100 - x)) return "bottom";
    if (x <= Math.min(y, 100 - y)) return "left";
    if (x >= Math.max(y, 100 - y)) return "right";
    return "float";
  }

  function queueTabDrag(x, y) {
    if (!dragging) return;
    dragging.pendingX = x;
    dragging.pendingY = y;
    if (dragging.raf) return;
    dragging.raf = requestAnimationFrame(function () {
      dragging.raf = 0;
      if (!dragging) return;
      updateTabDrag(dragging.pendingX, dragging.pendingY);
    });
  }

  function makePlaceholder(width) {
    const ph = document.createElement("div");
    ph.className = "wm-tab-ph";
    ph.style.width = width + "px";
    return ph;
  }

  function flipChildren(container, mutate) {
    const nodes = Array.prototype.slice.call(container.children);
    const first = new Map();
    nodes.forEach(function (el) {
      first.set(el, el.getBoundingClientRect());
    });
    mutate();
    nodes.forEach(function (el) {
      if (!el.isConnected || (dragging && el === dragging.tabEl)) return;
      const a = first.get(el);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      if (Math.abs(dx) < 1) return;
      el.style.transition = "none";
      el.style.transform = "translateX(" + dx + "px)";
      el.getBoundingClientRect();
      el.style.transition = "transform 160ms ease";
      el.style.transform = "";
    });
  }

  function movePlaceholder(tabsEl, clientX) {
    const ph = dragging.placeholder;
    if (!ph || !tabsEl) return;
    if (ph.parentNode && ph.parentNode !== tabsEl) {
      const prev = ph.parentNode;
      flipChildren(prev, function () {
        ph.remove();
      });
    }
    if (ph.parentNode !== tabsEl) {
      ph.style.width = dragging.tabWidth + "px";
      tabsEl.appendChild(ph);
    } else {
      ph.style.width = dragging.tabWidth + "px";
    }
    const kids = Array.prototype.filter.call(tabsEl.children, function (el) {
      return el !== ph && el.classList.contains("wm-tab");
    });
    let before = null;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) {
        before = kids[i];
        break;
      }
    }
    if (ph.nextSibling === before) return;
    flipChildren(tabsEl, function () {
      tabsEl.insertBefore(ph, before);
    });
  }

  function stripHit(node, strip) {
    const r = strip.getBoundingClientRect();
    return {
      gid: node.dataset.groupId,
      tabsEl: node.querySelector(".wm-tabs"),
      stripEl: strip,
      stripTop: r.top,
    };
  }

  function pointInRect(x, y, r, padX, padY) {
    return x >= r.left - padX && x <= r.right + padX && y >= r.top - padY && y <= r.bottom + padY;
  }

  function stripAtPoint(x, y) {
    const groups = Array.prototype.map.call(document.querySelectorAll(".wm-group"), function (node, order) {
      return { node: node, order: order, z: parseInt(node.style.zIndex, 10) || 1 };
    });
    groups.sort(function (a, b) {
      if (b.z !== a.z) return b.z - a.z;
      return b.order - a.order;
    });
    const sticky = dragging && dragging.mode === "strip" && dragging.hoverGroupId;
    const padY = sticky ? 18 : 10;
    for (let i = 0; i < groups.length; i++) {
      const node = groups[i].node;
      const strip = node.querySelector(".wm-tabstrip");
      if (!strip) continue;
      const stripBox = strip.getBoundingClientRect();
      if (pointInRect(x, y, stripBox, 6, padY)) return stripHit(node, strip);
      if (pointInRect(x, y, node.getBoundingClientRect(), 0, 0)) return null;
    }
    return null;
  }

  function highlightStrip(gid) {
    document.querySelectorAll(".wm-tabstrip").forEach(function (el) {
      const on = !!(gid && el.parentNode && el.parentNode.dataset.groupId === gid);
      el.classList.toggle("drop-into", on);
    });
  }

  function positionGhost(x, y, lockTop) {
    els.ghost.style.left = x - dragging.grabX + "px";
    els.ghost.style.top = (lockTop != null ? lockTop : y - dragging.grabY) + "px";
  }

  function slideSoloTab(x) {
    const tabEl = dragging.tabEl;
    const tabsEl = dragging.tabsEl;
    const parent = tabsEl.getBoundingClientRect();
    const raw = x - dragging.grabX - dragging.originLeft;
    const minT = parent.left - dragging.originLeft;
    const maxT = Math.max(minT, parent.right - dragging.tabWidth - dragging.originLeft);
    let t = raw;
    if (t < minT) t = minT + (t - minT) * 0.3;
    else if (t > maxT) t = maxT + (t - maxT) * 0.3;
    tabEl.style.transform = "translateX(" + t + "px)";
  }

  function bounceTabHome(tabEl) {
    if (!tabEl) return;
    tabEl.style.transition = "transform 0.18s ease";
    tabEl.style.transform = "translateX(0)";
    window.setTimeout(function () {
      tabEl.style.transition = "";
      tabEl.style.transform = "";
    }, 200);
  }

  function orderedIdsFromStrip(tabsEl, dragId) {
    const ids = [];
    Array.prototype.forEach.call(tabsEl.children, function (node) {
      if (node.classList.contains("wm-tab-ph")) ids.push(dragId);
      else if (node.classList.contains("wm-tab") && node.dataset.windowId !== dragId) {
        ids.push(node.dataset.windowId);
      }
    });
    if (ids.indexOf(dragId) < 0) ids.push(dragId);
    return ids;
  }

  function setGroupTabOrder(gid, orderedIds) {
    const tab = getTab(dragging.id);
    const picked = [];
    orderedIds.forEach(function (id) {
      const t = getTab(id);
      if (!t) return;
      t.groupId = gid;
      picked.push(t);
    });
    const result = [];
    let inserted = false;
    state.tabs.forEach(function (t) {
      if (t.id === dragging.id || t.groupId === gid) {
        if (!inserted) {
          picked.forEach(function (p) {
            result.push(p);
          });
          inserted = true;
        }
        return;
      }
      result.push(t);
    });
    if (!inserted) {
      picked.forEach(function (p) {
        result.push(p);
      });
    }
    state.tabs = result;
    if (tab && state.groups[gid]) state.groups[gid].activeId = tab.id;
    const src = dragging.groupId;
    if (src && src !== gid && state.groups[src] && !tabsIn(src).length) removeGroup(src);
  }

  function beginTabDrag(tabEl, x, y, start) {
    const tab = getTab(tabEl.dataset.windowId);
    const gid = tab.groupId;
    const r = tabEl.getBoundingClientRect();
    const canExtract = state.tabs.length > 1;
    const ph = makePlaceholder(r.width);
    const tabsEl = tabEl.parentNode;
    const next = tabEl.nextSibling;
    dragging = {
      id: tab.id,
      groupId: gid,
      tabEl: tabEl,
      tabsEl: tabsEl,
      placeholder: ph,
      canExtract: canExtract,
      grabX: start.grabX,
      grabY: start.grabY,
      originLeft: start.originLeft,
      tabWidth: r.width,
      pointerId: start.pointerId,
      hoverGroupId: gid,
      zone: null,
      mode: "strip",
      pointer: pointerPct(x, y),
      raf: 0,
      pendingX: x,
      pendingY: y,
    };
    document.body.classList.add("is-dragging-tab");
    if (!canExtract) {
      tabEl.classList.add("is-sliding");
      tabsEl.classList.add("is-sliding-tabs");
      updateTabDrag(x, y);
      return;
    }
    tabEl.classList.add("is-dragging");
    if (next) tabsEl.insertBefore(ph, next);
    else tabsEl.appendChild(ph);
    els.ghost.textContent = tabEl.querySelector(".wm-tab-title").textContent;
    els.ghost.style.width = r.width + "px";
    els.ghost.classList.add("is-visible");
    els.catcher.classList.add("is-visible");
    els.overlay.classList.add("is-dragging");
    try {
      els.catcher.setPointerCapture(start.pointerId);
    } catch (err) {}
    positionGhost(x, y, r.top);
    updateTabDrag(x, y);
  }

  function updateTabDrag(x, y) {
    if (!dragging) return;
    const pct = pointerPct(x, y);
    dragging.pointer = pct;

    if (!dragging.canExtract) {
      slideSoloTab(x);
      setHud("move tab");
      return;
    }

    const strip = stripAtPoint(x, y);
    if (strip) {
      dragging.mode = "strip";
      dragging.hoverGroupId = strip.gid;
      dragging.zone = null;
      positionGhost(x, y, strip.stripTop);
      movePlaceholder(strip.tabsEl, x);
      highlightZone(null);
      highlightStrip(strip.gid);
      setSnapPreview(null);
      setHud("drop on tab strip");
      return;
    }

    dragging.mode = "snap";
    dragging.hoverGroupId = null;
    highlightStrip(null);
    dragging.zone = zoneFromPct(pct.x, pct.y);
    positionGhost(x, y);
    if (dragging.placeholder) dragging.placeholder.style.width = "0px";
    highlightZone(dragging.zone);
    if (dragging.zone === "float") {
      const live = floatRectAt(pct.x, pct.y);
      setSnapPreview(live, "Float");
    } else {
      const snap = SNAP[dragging.zone];
      setSnapPreview(snap, snap.label);
    }
  }

  function finishDrag() {
    const d = dragging;
    if (!d) return;
    if (d.raf) {
      cancelAnimationFrame(d.raf);
      d.raf = 0;
    }
    if (d.pendingX != null) updateTabDrag(d.pendingX, d.pendingY);
    ignoreNextClick = true;

    if (!d.canExtract) {
      bounceTabHome(d.tabEl);
      d.tabEl.classList.remove("is-sliding");
      if (d.tabsEl) d.tabsEl.classList.remove("is-sliding-tabs");
      document.body.classList.remove("is-dragging-tab");
      dragging = null;
      return;
    }

    const stripIds =
      d.mode === "strip" && d.placeholder && d.placeholder.parentNode
        ? orderedIdsFromStrip(d.placeholder.parentNode, d.id)
        : null;

    if (d.mode === "strip" && d.hoverGroupId && state.groups[d.hoverGroupId] && stripIds) {
      setGroupTabOrder(d.hoverGroupId, stripIds);
    } else if (d.mode === "snap" && d.zone) {
      applySnap(d.id, d.zone, d.pointer);
    }

    if (d.placeholder && d.placeholder.parentNode) d.placeholder.remove();
    d.tabEl.classList.remove("is-drag-follow", "is-sliding", "is-dragging");
    d.tabEl.style.transform = "";
    els.ghost.classList.remove("is-visible");
    els.ghost.style.width = "";
    document.body.classList.remove("is-dragging-tab");
    els.catcher.classList.remove("is-visible");
    els.overlay.classList.remove("is-dragging");
    setSnapPreview(null);
    highlightZone(null);
    highlightStrip(null);
    dragging = null;
    render();
  }

  function startPopupMove(e, gid) {
    const g = state.groups[gid];
    if (!g || g.kind !== "popup") return;
    e.preventDefault();
    focusGroup(gid);
    const start = { x: e.clientX, y: e.clientY };
    const origin = { x: g.x, y: g.y };
    const stage = stageSize();
    const target = e.currentTarget;
    function onMove(ev) {
      g.x = roundPct(origin.x + ((ev.clientX - start.x) / stage.w) * 100);
      g.y = roundPct(origin.y + ((ev.clientY - start.y) / stage.h) * 100);
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
    const start = { x: e.clientX, y: e.clientY };
    const origin = { w: g.w, h: g.h };
    const stage = stageSize();
    const target = e.currentTarget;
    function onMove(ev) {
      const next = sizeRect({
        x: g.x,
        y: g.y,
        w: origin.w + ((ev.clientX - start.x) / stage.w) * 100,
        h: origin.h + ((ev.clientY - start.y) / stage.h) * 100,
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

  function svgEl(name, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  function buildOverlay() {
    const svg = els.split;
    const labels = els.labels;
    svg.replaceChildren();
    labels.replaceChildren();
    const inner = 100 - CUT;
    const polys = [
      { zone: "top", points: "0,0 100,0 " + inner + "," + CUT + " " + CUT + "," + CUT },
      { zone: "bottom", points: "0,100 100,100 " + inner + "," + inner + " " + CUT + "," + inner },
      { zone: "left", points: "0,0 0,100 " + CUT + "," + inner + " " + CUT + "," + CUT },
      { zone: "right", points: "100,0 100,100 " + inner + "," + inner + " " + inner + "," + CUT },
    ];
    polys.forEach(function (p) {
      svg.appendChild(svgEl("polygon", { class: "wm-x-zone", "data-zone": p.zone, points: p.points }));
    });
    svg.appendChild(
      svgEl("rect", {
        class: "wm-x-zone is-float",
        "data-zone": "float",
        x: String(CUT),
        y: String(CUT),
        width: String(inner - CUT),
        height: String(inner - CUT),
      })
    );
    svg.appendChild(svgEl("line", { class: "wm-x-diag", x1: "0", y1: "0", x2: "100", y2: "100" }));
    svg.appendChild(svgEl("line", { class: "wm-x-diag", x1: "100", y1: "0", x2: "0", y2: "100" }));
    svg.appendChild(
      svgEl("rect", {
        class: "wm-x-inner",
        x: String(CUT),
        y: String(CUT),
        width: String(inner - CUT),
        height: String(inner - CUT),
      })
    );

    [
      { zone: "top", text: "Top 50%", x: 50, y: CUT / 2 },
      { zone: "bottom", text: "Bottom 50%", x: 50, y: 100 - CUT / 2 },
      { zone: "left", text: "Left 50%", x: CUT / 2, y: 50 },
      { zone: "right", text: "Right 50%", x: 100 - CUT / 2, y: 50 },
      { zone: "float", text: "Float", x: 50, y: 50 },
    ].forEach(function (l) {
      const el = document.createElement("div");
      el.className = "wm-x-label" + (l.zone === "float" ? " is-float" : "");
      el.dataset.zone = l.zone;
      el.textContent = l.text;
      el.style.left = l.x + "%";
      el.style.top = l.y + "%";
      labels.appendChild(el);
    });
  }

  function highlightZone(name) {
    els.split.querySelectorAll(".wm-x-zone").forEach(function (el) {
      el.classList.toggle("is-active", !!name && el.getAttribute("data-zone") === name);
    });
    els.labels.querySelectorAll(".wm-x-label").forEach(function (el) {
      el.classList.toggle("is-active", !!name && el.dataset.zone === name);
    });
  }

  function setSnapPreview(rect, text) {
    if (!rect) {
      els.snap.classList.remove("is-visible", "is-instant");
      snapKind = null;
      if (text) setHud(text);
      else updateHud();
      return;
    }
    const isFloat = !!(text && text.indexOf("Float") === 0);
    const kind = isFloat ? "float" : text || "dock";
    const appearing = !els.snap.classList.contains("is-visible");
    const followFloat = isFloat && snapKind === "float" && !appearing;
    els.snap.classList.toggle("is-instant", appearing || followFloat);
    const s = stageSize();
    els.snap.style.left = s.left + (rect.x / 100) * s.w + "px";
    els.snap.style.top = s.top + (rect.y / 100) * s.h + "px";
    els.snap.style.width = (rect.w / 100) * s.w + "px";
    els.snap.style.height = (rect.h / 100) * s.h + "px";
    els.snap.classList.add("is-visible");
    els.snap.classList.toggle("is-float", isFloat);
    els.snap.textContent = "";
    snapKind = kind;
    setHud(text ? text + "  ·  " + fmtRect(rect) : fmtRect(rect));
  }

  function setHud(text) {
    if (els.hudText) els.hudText.textContent = text;
  }

  function updateHud() {
    const g = state.focusedGroupId && state.groups[state.focusedGroupId];
    if (!g) {
      setHud("X-split · drag a tab to snap");
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
    els.split = document.getElementById("wm-x-split");
    els.labels = document.getElementById("wm-x-labels");
    els.snap = document.getElementById("wm-pct-snap");
    els.catcher = document.getElementById("wm-drop-catcher");
    els.ghost = document.getElementById("wm-drag-ghost");
    els.hudText = document.getElementById("wm-pct-hud-text");
    els.toggle = document.getElementById("wm-pct-toggle");

    buildOverlay();
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
