(function (global) {
  "use strict";

  function casIsGraphable(eq) {
    if (eq === undefined || eq === "" || eq === null) return false;
    if (Array.isArray(eq) && eq.length === 0) return false;
    return true;
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
