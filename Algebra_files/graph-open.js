(function (global) {
  "use strict";

  var BLOCKED = { diff: 1, int: 1 };
  var CONST_NAMES = { "π": 1, pi: 1, e: 1, i: 1 };

  function walk(node, onNode) {
    if (Array.isArray(node)) {
      onNode(node);
      for (var i = 1; i < node.length; i++) walk(node[i], onNode);
    }
  }

  function collectVars(node, out) {
    if (node === undefined || node === null || node === "") return;
    if (!Array.isArray(node)) {
      if (typeof node === "string" && isNaN(node) && !CONST_NAMES[node]) out[node] = 1;
      return;
    }
    for (var i = 1; i < node.length; i++) collectVars(node[i], out);
  }

  function casIsGraphable(eq) {
    if (eq === undefined || eq === "" || eq === null) return false;
    var blocked = false;
    if (Array.isArray(eq)) {
      walk(eq, function (n) {
        if (BLOCKED[n[0]]) blocked = true;
      });
    } else if (typeof eq === "string") {
      if (!isNaN(eq) || CONST_NAMES[eq]) return false;
    } else {
      return false;
    }
    if (blocked) return false;
    var vars = {};
    collectVars(eq, vars);
    return Object.keys(vars).length > 0;
  }

  function casOpenGraph(eq) {
    if (!casIsGraphable(eq)) return;
    var id = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var flat = typeof printflat === "function" ? printflat(eq) : String(eq);
    var latex = typeof printlatex === "function" ? printlatex(eq) : flat;
    var payload = { id: id, ast: eq, flat: flat, latex: latex, title: "Graph" };
    try {
      localStorage.setItem("cas-graph-" + id, JSON.stringify(payload));
    } catch (e) {}
    var msg = { type: "cas-open-graph", id: id, title: "Graph" };
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    } else {
      window.open("Graph.html?g=" + encodeURIComponent(id), "_blank");
    }
  }

  function casPushGraphMenu(THIS, optionstext, options, menu) {
    if (!casIsGraphable(THIS.equation)) return;
    optionstext.push('<p class="op-graph">Graph Equation</p>');
    options.push(function () {
      if (typeof tempdisableallclick === "function") tempdisableallclick();
      casOpenGraph(THIS.equation);
      if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    });
  }

  global.casIsGraphable = casIsGraphable;
  global.casOpenGraph = casOpenGraph;
  global.casPushGraphMenu = casPushGraphMenu;
})(window);
