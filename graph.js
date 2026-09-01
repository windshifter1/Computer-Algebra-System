(function () {
  "use strict";

  var CONSTS = { "π": Math.PI, pi: Math.PI, e: Math.E };
  var FUNCS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    arcsin: Math.asin,
    arccos: Math.acos,
    arctan: Math.atan,
    ln: Math.log,
    log: Math.log10,
    abs: Math.abs,
  };

  function collectVars(node, out) {
    if (node === undefined || node === null || node === "") return;
    if (!Array.isArray(node)) {
      if (typeof node === "string" && isNaN(node) && !CONSTS[node] && node !== "i") out[node] = 1;
      return;
    }
    for (var i = 1; i < node.length; i++) collectVars(node[i], out);
  }

  function evalAst(node, env) {
    if (node === undefined || node === null || node === "") return NaN;
    if (!Array.isArray(node)) {
      if (typeof node === "number") return node;
      if (CONSTS[node] !== undefined) return CONSTS[node];
      if (node === "i") return NaN;
      if (node !== "" && !isNaN(node)) return Number(node);
      if (Object.prototype.hasOwnProperty.call(env, node)) return env[node];
      return NaN;
    }
    var op = node[0];
    var a, b, s, p, i;
    if (op === "+") {
      s = 0;
      for (i = 1; i < node.length; i++) s += evalAst(node[i], env);
      return s;
    }
    if (op === "*") {
      p = 1;
      for (i = 1; i < node.length; i++) p *= evalAst(node[i], env);
      return p;
    }
    if (op === "/") {
      b = evalAst(node[2], env);
      return b === 0 ? NaN : evalAst(node[1], env) / b;
    }
    if (op === "^") {
      a = evalAst(node[1], env);
      b = evalAst(node[2], env);
      if (a < 0 && Math.abs(b - Math.round(b)) > 1e-10) return NaN;
      return Math.pow(a, b);
    }
    if (op === "-") return -evalAst(node[1], env);
    if (op === "=") return evalAst(node[1], env) - evalAst(node[2], env);
    if (FUNCS[op]) return FUNCS[op](evalAst(node[1], env));
    return NaN;
  }

  function isPlainVar(n) {
    return typeof n === "string" && isNaN(n) && !CONSTS[n] && n !== "i";
  }

  function containsVar(node, name) {
    if (!Array.isArray(node)) return node === name;
    for (var i = 1; i < node.length; i++) if (containsVar(node[i], name)) return true;
    return false;
  }

  function classify(ast, vars) {
    var mode = "explicit";
    var rhs = ast;
    var dependent = null;
    if (Array.isArray(ast) && ast[0] === "=") {
      if (isPlainVar(ast[1]) && !containsVar(ast[2], ast[1])) {
        dependent = ast[1];
        rhs = ast[2];
      } else if (isPlainVar(ast[2]) && !containsVar(ast[1], ast[2])) {
        dependent = ast[2];
        rhs = ast[1];
      } else {
        mode = "implicit";
        rhs = ast;
      }
    }
    var xAxis = vars.indexOf("x") >= 0 ? "x" : vars[0];
    var yAxis = vars.indexOf("y") >= 0 && vars.indexOf("y") !== vars.indexOf(xAxis) ? "y" : null;
    if (!yAxis) {
      for (var i = 0; i < vars.length; i++) {
        if (vars[i] !== xAxis) {
          yAxis = vars[i];
          break;
        }
      }
    }
    if (!yAxis) yAxis = "y";
    if (mode === "explicit" && dependent) {
      if (dependent === "x") {
        xAxis = "x";
        yAxis = vars.indexOf("y") >= 0 ? "y" : yAxis;
      } else {
        yAxis = dependent;
        xAxis = vars.indexOf("x") >= 0 && vars.indexOf("x") !== vars.indexOf(dependent) ? "x" : xAxis;
        if (xAxis === yAxis) {
          for (i = 0; i < vars.length; i++) {
            if (vars[i] !== yAxis) {
              xAxis = vars[i];
              break;
            }
          }
        }
      }
    } else if (mode === "explicit" && !dependent) {
      dependent = yAxis === xAxis ? "y" : yAxis;
      yAxis = dependent;
    }
    var independent = dependent === xAxis ? yAxis : xAxis;
    var params = vars.filter(function (v) {
      return v !== xAxis && v !== yAxis;
    });
    return {
      mode: mode,
      xAxis: xAxis,
      yAxis: yAxis,
      dependent: dependent || yAxis,
      independent: independent,
      rhs: rhs,
      params: params,
    };
  }

  function loadPayload() {
    var id = new URLSearchParams(location.search).get("g");
    if (!id) return null;
    try {
      return JSON.parse(localStorage.getItem("cas-graph-" + id));
    } catch (e) {
      return null;
    }
  }

  var payload = loadPayload();
  var canvas = document.getElementById("plot");
  var ctx = canvas.getContext("2d");
  var panel = document.getElementById("panel");
  var view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
  var values = {};
  var spec = null;
  var ast = null;

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function wx(px) {
    return view.xmin + (px / canvas.clientWidth) * (view.xmax - view.xmin);
  }
  function wy(py) {
    return view.ymax - (py / canvas.clientHeight) * (view.ymax - view.ymin);
  }
  function sx(x) {
    return ((x - view.xmin) / (view.xmax - view.xmin)) * canvas.clientWidth;
  }
  function sy(y) {
    return ((view.ymax - y) / (view.ymax - view.ymin)) * canvas.clientHeight;
  }

  function envWith(extra) {
    var env = {};
    Object.keys(values).forEach(function (k) { env[k] = values[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { env[k] = extra[k]; });
    return env;
  }

  function drawGrid() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.fillStyle = "#f7f8fb";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e4e8f0";
    ctx.lineWidth = 1;
    var step = niceStep((view.xmax - view.xmin) / 8);
    ctx.beginPath();
    for (var x = Math.ceil(view.xmin / step) * step; x <= view.xmax; x += step) {
      ctx.moveTo(sx(x), 0);
      ctx.lineTo(sx(x), h);
    }
    for (var y = Math.ceil(view.ymin / step) * step; y <= view.ymax; y += step) {
      ctx.moveTo(0, sy(y));
      ctx.lineTo(w, sy(y));
    }
    ctx.stroke();
    ctx.strokeStyle = "#8b93a3";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(sx(0), 0);
    ctx.lineTo(sx(0), h);
    ctx.moveTo(0, sy(0));
    ctx.lineTo(w, sy(0));
    ctx.stroke();
    ctx.fillStyle = "#5c6573";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(spec ? spec.xAxis : "x", w - 16, sy(0) - 6);
    ctx.fillText(spec ? spec.yAxis : "y", sx(0) + 6, 14);
  }

  function niceStep(raw) {
    var exp = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
    var n = raw / exp;
    var f = n >= 5 ? 5 : n >= 2 ? 2 : 1;
    return f * exp;
  }

  function drawExplicit() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var sampleAlongX = spec.dependent !== spec.xAxis;
    var n = Math.max(240, sampleAlongX ? w : h);
    ctx.strokeStyle = "#1e4fd7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i <= n; i++) {
      var extra = {};
      var t, fv, xs, ys;
      if (sampleAlongX) {
        t = wx((i / n) * w);
        extra[spec.independent] = t;
        fv = evalAst(spec.rhs, envWith(extra));
        if (!isFinite(fv)) {
          started = false;
          continue;
        }
        xs = sx(t);
        ys = sy(fv);
      } else {
        t = wy((i / n) * h);
        extra[spec.independent] = t;
        fv = evalAst(spec.rhs, envWith(extra));
        if (!isFinite(fv)) {
          started = false;
          continue;
        }
        xs = sx(fv);
        ys = sy(t);
      }
      if (!started) {
        ctx.moveTo(xs, ys);
        started = true;
      } else ctx.lineTo(xs, ys);
    }
    ctx.stroke();
  }

  function drawImplicit() {
    var cols = 160;
    var rows = 160;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var grid = [];
    var r, c, extra;
    for (r = 0; r <= rows; r++) {
      grid[r] = [];
      for (c = 0; c <= cols; c++) {
        extra = {};
        extra[spec.xAxis] = wx((c / cols) * w);
        extra[spec.yAxis] = wy((r / rows) * h);
        grid[r][c] = evalAst(spec.rhs, envWith(extra));
      }
    }
    function lerp(a, b, fa, fb) {
      var d = fb - fa;
      if (Math.abs(d) < 1e-12) return (a + b) / 2;
      return a + (-fa / d) * (b - a);
    }
    function crosses(a, b) {
      return isFinite(a) && isFinite(b) && (a > 0) !== (b > 0);
    }
    ctx.strokeStyle = "#1e4fd7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var f00 = grid[r][c];
        var f10 = grid[r][c + 1];
        var f01 = grid[r + 1][c];
        var f11 = grid[r + 1][c + 1];
        var x0 = wx((c / cols) * w);
        var x1 = wx(((c + 1) / cols) * w);
        var y0 = wy((r / rows) * h);
        var y1 = wy(((r + 1) / rows) * h);
        var pts = [];
        if (crosses(f00, f10)) pts.push([lerp(x0, x1, f00, f10), y0]);
        if (crosses(f10, f11)) pts.push([x1, lerp(y0, y1, f10, f11)]);
        if (crosses(f01, f11)) pts.push([lerp(x0, x1, f01, f11), y1]);
        if (crosses(f00, f01)) pts.push([x0, lerp(y0, y1, f00, f01)]);
        if (pts.length >= 2) {
          ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
          ctx.lineTo(sx(pts[1][0]), sy(pts[1][1]));
        }
      }
    }
    ctx.stroke();
  }

  function draw() {
    drawGrid();
    if (!spec || !ast) {
      ctx.fillStyle = "#5c6573";
      ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("No graphable equation loaded.", 24, 40);
      return;
    }
    if (spec.mode === "explicit") drawExplicit();
    else drawImplicit();
  }

  function buildPanel() {
    document.getElementById("panel-eq").textContent = payload && payload.flat ? payload.flat : "";
    var box = document.getElementById("panel-sliders");
    box.innerHTML = "";
    if (!spec || !spec.params.length) {
      var empty = document.createElement("div");
      empty.className = "g-empty";
      empty.textContent = spec ? "No extra variables to set." : "Nothing to graph.";
      box.appendChild(empty);
      return;
    }
    spec.params.forEach(function (name) {
      var row = document.createElement("div");
      row.className = "g-row";
      var lab = document.createElement("span");
      lab.textContent = name;
      var range = document.createElement("input");
      range.type = "range";
      range.min = "-10";
      range.max = "10";
      range.step = "0.01";
      range.value = String(values[name]);
      var num = document.createElement("input");
      num.type = "number";
      num.step = "0.01";
      num.value = String(values[name]);
      function apply(v) {
        if (!isFinite(v)) return;
        values[name] = v;
        range.value = String(v);
        num.value = String(v);
        if (v < Number(range.min)) range.min = String(Math.floor(v - 5));
        if (v > Number(range.max)) range.max = String(Math.ceil(v + 5));
        draw();
      }
      range.addEventListener("input", function () { apply(Number(range.value)); });
      num.addEventListener("change", function () { apply(Number(num.value)); });
      row.appendChild(lab);
      row.appendChild(range);
      row.appendChild(num);
      box.appendChild(row);
    });
  }

  function bindPanelDrag() {
    var bar = document.getElementById("panel-bar");
    bar.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var start = { x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
      function move(ev) {
        panel.style.left = Math.max(0, start.left + (ev.clientX - start.x)) + "px";
        panel.style.top = Math.max(0, start.top + (ev.clientY - start.y)) + "px";
        panel.style.right = "auto";
      }
      function up() {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
      }
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });
  }

  function bindPlotNav() {
    var drag = null;
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, xmin: view.xmin, xmax: view.xmax, ymin: view.ymin, ymax: view.ymax };
      canvas.classList.add("is-panning");
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x) / canvas.clientWidth * (drag.xmax - drag.xmin);
      var dy = (e.clientY - drag.y) / canvas.clientHeight * (drag.ymax - drag.ymin);
      view.xmin = drag.xmin - dx;
      view.xmax = drag.xmax - dx;
      view.ymin = drag.ymin + dy;
      view.ymax = drag.ymax + dy;
      draw();
    });
    canvas.addEventListener("pointerup", function () {
      drag = null;
      canvas.classList.remove("is-panning");
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var factor = e.deltaY < 0 ? 0.85 : 1.15;
      var x = wx(e.offsetX);
      var y = wy(e.offsetY);
      view.xmin = x + (view.xmin - x) * factor;
      view.xmax = x + (view.xmax - x) * factor;
      view.ymin = y + (view.ymin - y) * factor;
      view.ymax = y + (view.ymax - y) * factor;
      draw();
    }, { passive: false });
    canvas.addEventListener("dblclick", function () {
      view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
      draw();
    });
  }

  if (payload && payload.ast) {
    ast = payload.ast;
    var varMap = {};
    collectVars(ast, varMap);
    var vars = Object.keys(varMap);
    spec = classify(ast, vars);
    spec.params.forEach(function (name) { values[name] = 1; });
  }

  bindPanelDrag();
  bindPlotNav();
  buildPanel();
  window.addEventListener("resize", resize);
  resize();
})();
