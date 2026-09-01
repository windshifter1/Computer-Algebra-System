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
    sqrt: Math.sqrt,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sign: Math.sign,
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
    var i;
    if (!yAxis) {
      for (i = 0; i < vars.length; i++) {
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

  function niceStep(raw) {
    var mag = Math.abs(raw);
    if (!isFinite(mag) || mag === 0) mag = 1;
    var exp = Math.pow(10, Math.floor(Math.log10(mag)));
    var n = mag / exp;
    var f = n >= 5 ? 5 : n >= 2 ? 2 : 1;
    return f * exp;
  }

  function minorStep(step) {
    if (!(step > 0)) return step;
    var lead = step / Math.pow(10, Math.floor(Math.log10(step)));
    return step / (Math.abs(lead - 5) < 1e-9 ? 5 : 2);
  }

  function eachTick(min, max, step, fn) {
    if (!(step > 0) || !isFinite(min) || !isFinite(max)) return;
    var start = Math.floor(min / step) * step;
    if (!isFinite(start)) return;
    var i, v;
    for (v = start, i = 0; v <= max + step * 0.5 && i < 250; v += step, i++) fn(v);
  }

  function formatTick(v, step) {
    if (!isFinite(v)) return "";
    if (!(step > 0) || !isFinite(step)) step = 1;
    if (Math.abs(v) < step * 1e-9) v = 0;
    var av = Math.abs(v);
    if (av !== 0 && (av >= 1e4 || av < 1e-3)) {
      return v.toExponential(0).replace("e+", "e");
    }
    var log = Math.log10(step);
    var decimals = Math.max(0, -Math.floor(log) + (step / Math.pow(10, Math.floor(log)) < 2 ? 1 : 0));
    decimals = Math.min(6, decimals);
    var s = v.toFixed(decimals);
    if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
    return s === "-0" ? "0" : s;
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
  var editEl = document.getElementById("edit");
  var coordsEl = document.getElementById("coords");
  var scaleEl = document.getElementById("scale");
  var view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
  var values = {};
  var ranges = {};
  var spec = null;
  var ast = null;
  var lineColor = "#1e4fd7";
  var cursor = null;
  var MIN_SPAN = 1e-8;
  var MAX_SPAN = 1e8;

  function defaultRange() {
    return { min: -10, max: 10, stepped: false, step: 1 };
  }

  function ensureRange(name) {
    if (!ranges[name]) ranges[name] = defaultRange();
    var r = ranges[name];
    if (!isFinite(r.min)) r.min = -10;
    if (!isFinite(r.max)) r.max = 10;
    if (r.min === r.max) r.max = r.min + 1;
    if (r.min > r.max) {
      var t = r.min;
      r.min = r.max;
      r.max = t;
    }
    if (typeof r.stepped !== "boolean") r.stepped = false;
    if (!(r.step > 0) || !isFinite(r.step)) r.step = 1;
    return r;
  }

  function snapValue(name, v) {
    var r = ensureRange(name);
    if (r.stepped && r.step > 0) {
      v = r.min + Math.round((v - r.min) / r.step) * r.step;
      var places = Math.min(8, Math.max(0, -Math.floor(Math.log10(r.step)) + 2));
      v = Number(v.toFixed(places));
    }
    if (v < r.min) v = r.min;
    if (v > r.max) v = r.max;
    return v;
  }

  function sliderStepAttr(name) {
    var r = ensureRange(name);
    return r.stepped && r.step > 0 ? String(r.step) : "0.01";
  }

  function size() {
    return { w: canvas.clientWidth, h: canvas.clientHeight };
  }

  function enforceAspect() {
    var s = size();
    if (s.w < 1 || s.h < 1) return;
    var cx = (view.xmin + view.xmax) / 2;
    var cy = (view.ymin + view.ymax) / 2;
    var spanX = view.xmax - view.xmin;
    if (!isFinite(spanX) || spanX <= 0) spanX = 20;
    if (spanX < MIN_SPAN) spanX = MIN_SPAN;
    if (spanX > MAX_SPAN) spanX = MAX_SPAN;
    var spanY = spanX * (s.h / s.w);
    view.xmin = cx - spanX / 2;
    view.xmax = cx + spanX / 2;
    view.ymin = cy - spanY / 2;
    view.ymax = cy + spanY / 2;
  }

  function wx(px) {
    return view.xmin + (px / size().w) * (view.xmax - view.xmin);
  }
  function wy(py) {
    return view.ymax - (py / size().h) * (view.ymax - view.ymin);
  }
  function sx(x) {
    return ((x - view.xmin) / (view.xmax - view.xmin)) * size().w;
  }
  function sy(y) {
    return ((view.ymax - y) / (view.ymax - view.ymin)) * size().h;
  }

  function envWith(extra) {
    var env = {};
    Object.keys(values).forEach(function (k) {
      env[k] = values[k];
    });
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        env[k] = extra[k];
      });
    }
    return env;
  }

  function axisX() {
    var s = size();
    return Math.min(s.w - 28, Math.max(28, sx(0)));
  }
  function axisY() {
    var s = size();
    return Math.min(s.h - 22, Math.max(18, sy(0)));
  }

  function currentTickStep() {
    var target = Math.max(4, Math.min(12, Math.floor(size().w / 72)));
    return niceStep((view.xmax - view.xmin) / target);
  }

  function drawGrid() {
    var s = size();
    var w = s.w;
    var h = s.h;
    ctx.fillStyle = "#f7f8fb";
    ctx.fillRect(0, 0, w, h);

    var step = currentTickStep();
    var minor = minorStep(step);
    var ax = axisX();
    var ay = axisY();
    var px, py, label;

    ctx.strokeStyle = "#edf0f5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    eachTick(view.xmin, view.xmax, minor, function (x) {
      px = sx(x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    });
    eachTick(view.ymin, view.ymax, minor, function (y) {
      py = sy(y);
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    });
    ctx.stroke();

    ctx.strokeStyle = "#d5dbe6";
    ctx.beginPath();
    eachTick(view.xmin, view.xmax, step, function (x) {
      px = sx(x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    });
    eachTick(view.ymin, view.ymax, step, function (y) {
      py = sy(y);
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    });
    ctx.stroke();

    ctx.strokeStyle = "#3d4654";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, ay);
    ctx.lineTo(w, ay);
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, h);
    ctx.stroke();

    ctx.fillStyle = "#3d4654";
    ctx.beginPath();
    ctx.moveTo(w - 1, ay);
    ctx.lineTo(w - 9, ay - 5);
    ctx.lineTo(w - 9, ay + 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ax, 1);
    ctx.lineTo(ax - 5, 9);
    ctx.lineTo(ax + 5, 9);
    ctx.closePath();
    ctx.fill();

    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#3d4654";
    eachTick(view.xmin, view.xmax, step, function (x) {
      if (Math.abs(x) < step * 0.25) return;
      px = sx(x);
      ctx.strokeStyle = "#3d4654";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, ay - 5);
      ctx.lineTo(px, ay + 5);
      ctx.stroke();
      label = formatTick(x, step);
      ctx.fillStyle = "#3d4654";
      ctx.textAlign = "center";
      ctx.textBaseline = ay > h - 28 ? "bottom" : "top";
      ctx.fillText(label, px, ay > h - 28 ? ay - 8 : ay + 8);
    });
    eachTick(view.ymin, view.ymax, step, function (y) {
      if (Math.abs(y) < step * 0.25) return;
      py = sy(y);
      ctx.strokeStyle = "#3d4654";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - 5, py);
      ctx.lineTo(ax + 5, py);
      ctx.stroke();
      label = formatTick(y, step);
      ctx.fillStyle = "#3d4654";
      ctx.textAlign = ax < 64 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(label, ax < 64 ? ax + 8 : ax - 8, py);
    });

    if (scaleEl) scaleEl.textContent = "tick = " + formatTick(step, step);

    ctx.fillStyle = "#1e4fd7";
    ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(spec ? spec.xAxis : "x", w - 14, ay - 10);
    ctx.textAlign = ax < 64 ? "left" : "left";
    ctx.textBaseline = "top";
    ctx.fillText(spec ? spec.yAxis : "y", ax + 10, 8);

    if (view.xmin < 0 && view.xmax > 0 && view.ymin < 0 && view.ymax > 0) {
      ctx.fillStyle = "#5c6573";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("0", ax - 6, ay + 6);
    }

    if (cursor) {
      ctx.strokeStyle = "rgba(30, 79, 215, 0.35)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cursor.px, 0);
      ctx.lineTo(cursor.px, h);
      ctx.moveTo(0, cursor.py);
      ctx.lineTo(w, cursor.py);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawExplicit() {
    var s = size();
    var sampleAlongX = spec.dependent !== spec.xAxis;
    var n = Math.max(400, sampleAlongX ? s.w * 2 : s.h * 2);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    var started = false;
    var i, extra, t, fv, xs, ys;
    for (i = 0; i <= n; i++) {
      extra = {};
      if (sampleAlongX) {
        t = wx((i / n) * s.w);
        extra[spec.independent] = t;
        fv = evalAst(spec.rhs, envWith(extra));
        if (!isFinite(fv)) {
          started = false;
          continue;
        }
        xs = sx(t);
        ys = sy(fv);
      } else {
        t = wy((i / n) * s.h);
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
    var cols = 180;
    var rows = 180;
    var s = size();
    var grid = [];
    var r, c, extra;
    for (r = 0; r <= rows; r++) {
      grid[r] = [];
      for (c = 0; c <= cols; c++) {
        extra = {};
        extra[spec.xAxis] = wx((c / cols) * s.w);
        extra[spec.yAxis] = wy((r / rows) * s.h);
        grid[r][c] = evalAst(spec.rhs, envWith(extra));
      }
    }
    function lerp(a, b, fa, fb) {
      var d = fb - fa;
      if (Math.abs(d) < 1e-12) return (a + b) / 2;
      return a + (-fa / d) * (b - a);
    }
    function crosses(a, b) {
      return isFinite(a) && isFinite(b) && a > 0 !== b > 0;
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var f00 = grid[r][c];
        var f10 = grid[r][c + 1];
        var f01 = grid[r + 1][c];
        var f11 = grid[r + 1][c + 1];
        var x0 = wx((c / cols) * s.w);
        var x1 = wx(((c + 1) / cols) * s.w);
        var y0 = wy((r / rows) * s.h);
        var y1 = wy(((r + 1) / rows) * s.h);
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

  function updateCoords() {
    if (!cursor) {
      coordsEl.textContent = (spec ? spec.xAxis : "x") + ": —   " + (spec ? spec.yAxis : "y") + ": —";
      return;
    }
    var xn = spec ? spec.xAxis : "x";
    var yn = spec ? spec.yAxis : "y";
    var text = xn + ": " + formatTick(cursor.x, (view.xmax - view.xmin) / 20) + "   " + yn + ": " + formatTick(cursor.y, (view.ymax - view.ymin) / 20);
    if (spec && spec.mode === "explicit" && spec.dependent !== spec.xAxis) {
      var extra = {};
      extra[spec.independent] = cursor.x;
      var fv = evalAst(spec.rhs, envWith(extra));
      if (isFinite(fv)) text += "   " + spec.dependent + ": " + formatTick(fv, (view.ymax - view.ymin) / 20);
    }
    coordsEl.textContent = text;
  }

  function draw() {
    enforceAspect();
    drawGrid();
    if (!spec || !ast) {
      ctx.fillStyle = "#5c6573";
      ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("No graphable equation loaded.", 24, 40);
      updateCoords();
      return;
    }
    if (spec.mode === "explicit") drawExplicit();
    else drawImplicit();
    updateCoords();
  }

  function zoomAt(px, py, factor) {
    var x = wx(px);
    var y = wy(py);
    var nextMin = x + (view.xmin - x) * factor;
    var nextMax = x + (view.xmax - x) * factor;
    var span = nextMax - nextMin;
    if (span < MIN_SPAN || span > MAX_SPAN) return;
    view.xmin = nextMin;
    view.xmax = nextMax;
    view.ymin = y + (view.ymin - y) * factor;
    view.ymax = y + (view.ymax - y) * factor;
    draw();
  }

  function resetView() {
    view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    draw();
  }

  function parseOptionalNumber(raw) {
    if (raw == null) return NaN;
    raw = String(raw).trim();
    if (raw === "") return NaN;
    var n = Number(raw);
    return isFinite(n) ? n : NaN;
  }

  function fitOriginAndValue(xv, yv) {
    var xs = [0];
    var ys = [0];
    if (isFinite(xv)) xs.push(xv);
    if (isFinite(yv)) ys.push(yv);
    if (xs.length === 1 && ys.length === 1) return;
    var xmin = Math.min.apply(null, xs);
    var xmax = Math.max.apply(null, xs);
    var ymin = Math.min.apply(null, ys);
    var ymax = Math.max.apply(null, ys);
    var padX = Math.max((xmax - xmin) * 0.15, Math.abs(xmax - xmin) * 0.08, 1);
    var padY = Math.max((ymax - ymin) * 0.15, Math.abs(ymax - ymin) * 0.08, 1);
    xmin -= padX;
    xmax += padX;
    ymin -= padY;
    ymax += padY;
    var cx = (xmin + xmax) / 2;
    var cy = (ymin + ymax) / 2;
    var spanX = xmax - xmin;
    var spanY = ymax - ymin;
    var s = size();
    var needX = spanY * (s.w / s.h);
    var needY = spanX * (s.h / s.w);
    if (needX > spanX) {
      xmin = cx - needX / 2;
      xmax = cx + needX / 2;
    } else {
      ymin = cy - needY / 2;
      ymax = cy + needY / 2;
    }
    view.xmin = xmin;
    view.xmax = xmax;
    view.ymin = ymin;
    view.ymax = ymax;
    draw();
  }

  function buildSliders() {
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
      if (!ranges[name]) ranges[name] = defaultRange();
      ensureRange(name);
      var row = document.createElement("div");
      row.className = "g-row";
      var lab = document.createElement("span");
      lab.textContent = name;
      var range = document.createElement("input");
      range.type = "range";
      range.min = String(ranges[name].min);
      range.max = String(ranges[name].max);
      range.step = sliderStepAttr(name);
      range.value = String(values[name]);
      var num = document.createElement("input");
      num.type = "number";
      num.step = ranges[name].stepped ? String(ranges[name].step) : "any";
      num.value = String(values[name]);
      function apply(v) {
        if (!isFinite(v)) return;
        v = snapValue(name, v);
        values[name] = v;
        range.min = String(ranges[name].min);
        range.max = String(ranges[name].max);
        range.step = sliderStepAttr(name);
        range.value = String(v);
        num.step = ranges[name].stepped ? String(ranges[name].step) : "any";
        num.value = String(v);
        draw();
      }
      range.addEventListener("input", function () {
        apply(Number(range.value));
      });
      num.addEventListener("change", function () {
        apply(Number(num.value));
      });
      row.appendChild(lab);
      row.appendChild(range);
      row.appendChild(num);
      box.appendChild(row);
    });
  }

  function buildRangeEditor() {
    var box = document.getElementById("edit-ranges");
    box.innerHTML = "";
    if (!spec || !spec.params.length) {
      box.innerHTML = '<div class="g-empty">No variable sliders.</div>';
      return;
    }
    spec.params.forEach(function (name) {
      ensureRange(name);
      var block = document.createElement("div");
      block.className = "range-block";
      var row = document.createElement("div");
      row.className = "range-row";
      var lab = document.createElement("span");
      lab.textContent = name;
      var min = document.createElement("input");
      min.type = "number";
      min.step = "any";
      min.value = String(ranges[name].min);
      min.placeholder = "min";
      min.title = "Minimum";
      var max = document.createElement("input");
      max.type = "number";
      max.step = "any";
      max.value = String(ranges[name].max);
      max.placeholder = "max";
      max.title = "Maximum";
      var stepRow = document.createElement("div");
      stepRow.className = "step-row";
      var toggleLab = document.createElement("label");
      var toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = ranges[name].stepped;
      toggleLab.appendChild(toggle);
      toggleLab.appendChild(document.createTextNode("Stepped"));
      var stepAmt = document.createElement("input");
      stepAmt.type = "number";
      stepAmt.step = "any";
      stepAmt.min = "0";
      stepAmt.value = String(ranges[name].step);
      stepAmt.placeholder = "step";
      stepAmt.title = "Step amount";
      stepAmt.disabled = !ranges[name].stepped;
      function applyRange() {
        var a = Number(min.value);
        var b = Number(max.value);
        var st = Number(stepAmt.value);
        if (!isFinite(a) || !isFinite(b) || a === b) return;
        ranges[name].min = Math.min(a, b);
        ranges[name].max = Math.max(a, b);
        ranges[name].stepped = toggle.checked;
        if (isFinite(st) && st > 0) ranges[name].step = st;
        ensureRange(name);
        values[name] = snapValue(name, values[name]);
        stepAmt.disabled = !ranges[name].stepped;
        buildSliders();
        draw();
      }
      min.addEventListener("change", applyRange);
      max.addEventListener("change", applyRange);
      toggle.addEventListener("change", applyRange);
      stepAmt.addEventListener("change", applyRange);
      row.appendChild(lab);
      row.appendChild(min);
      row.appendChild(max);
      stepRow.appendChild(toggleLab);
      stepRow.appendChild(stepAmt);
      block.appendChild(row);
      block.appendChild(stepRow);
      box.appendChild(block);
    });
  }

  function bindDrag(el, bar) {
    bar.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;
      var start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      function move(ev) {
        el.style.left = Math.max(0, start.left + (ev.clientX - start.x)) + "px";
        el.style.top = Math.max(0, start.top + (ev.clientY - start.y)) + "px";
        el.style.right = "auto";
      }
      function up() {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
      }
      try {
        bar.setPointerCapture(e.pointerId);
      } catch (err) {}
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });
  }

  function bindPlotNav() {
    var drag = null;
    var pointers = {};

    function pointerCount() {
      return Object.keys(pointers).length;
    }

    function pinchDist() {
      var ids = Object.keys(pointers);
      if (ids.length < 2) return 0;
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy) || 1;
    }

    function pinchCenter() {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      var rect = canvas.getBoundingClientRect();
      pointers[e.pointerId] = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      if (pointerCount() >= 2) {
        drag = { pinch: true, dist: pinchDist() };
        canvas.classList.remove("is-panning");
        return;
      }
      drag = {
        x: e.clientX,
        y: e.clientY,
        xmin: view.xmin,
        xmax: view.xmax,
        ymin: view.ymin,
        ymax: view.ymax,
      };
      canvas.classList.add("is-panning");
    });
    canvas.addEventListener("pointermove", function (e) {
      var rect = canvas.getBoundingClientRect();
      var px = e.clientX - rect.left;
      var py = e.clientY - rect.top;
      cursor = { px: px, py: py, x: wx(px), y: wy(py) };
      if (pointers[e.pointerId]) {
        pointers[e.pointerId] = { x: px, y: py };
      }
      if (drag && drag.pinch && pointerCount() >= 2) {
        var dist = pinchDist();
        var factor = drag.dist / dist;
        if (isFinite(factor) && factor > 0) {
          var c = pinchCenter();
          drag.dist = dist;
          zoomAt(c.x, c.y, factor);
          return;
        }
      }
      if (drag && !drag.pinch) {
        var dw = size().w;
        var dh = size().h;
        var dx = ((e.clientX - drag.x) / dw) * (drag.xmax - drag.xmin);
        var dy = ((e.clientY - drag.y) / dh) * (drag.ymax - drag.ymin);
        view.xmin = drag.xmin - dx;
        view.xmax = drag.xmax - dx;
        view.ymin = drag.ymin + dy;
        view.ymax = drag.ymax + dy;
      }
      draw();
    });
    function endPointer(e) {
      delete pointers[e.pointerId];
      if (pointerCount() < 2) {
        drag = null;
        canvas.classList.remove("is-panning");
      }
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", function (e) {
      if (drag) return;
      cursor = null;
      updateCoords();
      draw();
    });
    canvas.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 0.82 : 1.22);
      },
      { passive: false }
    );
    canvas.addEventListener("dblclick", resetView);
  }

  function bindTools() {
    document.getElementById("zoom-in").addEventListener("click", function () {
      zoomAt(size().w / 2, size().h / 2, 0.8);
    });
    document.getElementById("zoom-out").addEventListener("click", function () {
      zoomAt(size().w / 2, size().h / 2, 1.25);
    });
    document.getElementById("zoom-home").addEventListener("click", resetView);
    document.getElementById("panel-edit").addEventListener("click", function (e) {
      e.stopPropagation();
      document.getElementById("edit-color").value = lineColor;
      editEl.hidden = false;
      buildRangeEditor();
    });
    document.getElementById("edit-close").addEventListener("click", function () {
      editEl.hidden = true;
    });
    document.getElementById("edit-color").addEventListener("input", function (e) {
      lineColor = e.target.value;
      draw();
    });
    document.getElementById("fit-go").addEventListener("click", function () {
      var xv = parseOptionalNumber(document.getElementById("fit-x").value);
      var yv = parseOptionalNumber(document.getElementById("fit-y").value);
      fitOriginAndValue(xv, yv);
    });
    ["fit-x", "fit-y"].forEach(function (id) {
      document.getElementById(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") document.getElementById("fit-go").click();
      });
    });
    window.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.key === "+" || e.key === "=") zoomAt(size().w / 2, size().h / 2, 0.8);
      if (e.key === "-" || e.key === "_") zoomAt(size().w / 2, size().h / 2, 1.25);
      if (e.key === "0") resetView();
      var pan = (view.xmax - view.xmin) * 0.1;
      if (e.key === "ArrowLeft") {
        view.xmin -= pan;
        view.xmax -= pan;
        draw();
      }
      if (e.key === "ArrowRight") {
        view.xmin += pan;
        view.xmax += pan;
        draw();
      }
      if (e.key === "ArrowUp") {
        view.ymin += pan;
        view.ymax += pan;
        draw();
      }
      if (e.key === "ArrowDown") {
        view.ymin -= pan;
        view.ymax -= pan;
        draw();
      }
    });
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  if (payload && payload.ast) {
    ast = payload.ast;
    var varMap = {};
    collectVars(ast, varMap);
    var vars = Object.keys(varMap);
    spec = classify(ast, vars);
    spec.params.forEach(function (name) {
      values[name] = 1;
      ranges[name] = defaultRange();
    });
  }

  bindDrag(panel, document.getElementById("panel-bar"));
  bindDrag(editEl, document.getElementById("edit-bar"));
  bindPlotNav();
  bindTools();
  buildSliders();
  window.addEventListener("resize", resize);
  resize();
})();
