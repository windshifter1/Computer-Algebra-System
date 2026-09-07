(function () {
  "use strict";

  var CONSTS = { "π": Math.PI, pi: Math.PI, e: Math.E };

  function safeTan(x) {
    if (!isFinite(x)) return NaN;
    // Math.tan(π/2) is a huge finite number, not NaN/Infinity.
    var halfTurns = x / Math.PI - 0.5;
    if (Math.abs(halfTurns - Math.round(halfTurns)) < 1e-8) return NaN;
    var t = Math.tan(x);
    return isFinite(t) ? t : NaN;
  }

  function safeLog(fn) {
    return function (x) {
      if (!(x > 0) || !isFinite(x)) return NaN;
      var v = fn(x);
      return isFinite(v) ? v : NaN;
    };
  }

  var FUNCS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: safeTan,
    arcsin: Math.asin,
    arccos: Math.acos,
    arctan: Math.atan,
    ln: safeLog(Math.log),
    log: safeLog(Math.log10),
    abs: Math.abs,
    sqrt: Math.sqrt,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sign: Math.sign,
  };

  var LATEX_FUNCS = {
    sin: "\\sin",
    cos: "\\cos",
    tan: "\\tan",
    arcsin: "\\arcsin",
    arccos: "\\arccos",
    arctan: "\\arctan",
    ln: "\\ln",
    log: "\\log_{10}",
    sqrt: "\\sqrt",
    exp: "\\exp",
  };

  function latexAtom(n) {
    if (n === "π" || n === "pi") return "\\pi";
    if (n === "e") return "e";
    if (typeof n === "string") {
      var u = n.indexOf("_");
      if (u > 0) return n.substring(0, u + 1) + "{" + n.substring(u + 1) + "}";
    }
    return String(n);
  }

  function astToLatex(node) {
    if (node === undefined || node === null || node === "") return "";
    if (!Array.isArray(node)) return latexAtom(node);
    var op = node[0];
    var i, s, a;
    if (op === "+") {
      s = "";
      for (i = 1; i < node.length; i++) {
        s += astToLatex(node[i]);
        if (i < node.length - 1) s += "+";
      }
      return s.replace(/\+-/g, "-");
    }
    if (op === "-") {
      a = astToLatex(node[1]);
      if (Array.isArray(node[1]) && node[1][0] === "+") return "-\\left(" + a + "\\right)";
      return "-" + a;
    }
    if (op === "*") {
      s = "";
      for (i = 1; i < node.length; i++) {
        a = astToLatex(node[i]);
        if (
          Array.isArray(node[i]) &&
          (node[i][0] === "+" || (node[i][0] === "-" && Array.isArray(node[i][1]) && node[i][1][0] === "-"))
        ) {
          a = "\\left(" + a + "\\right)";
        }
        s += a;
        if (i < node.length - 1 && !Array.isArray(node[i]) && !isNaN(node[i]) && !Array.isArray(node[i + 1]) && !isNaN(node[i + 1])) {
          s += "\\times ";
        }
      }
      return s;
    }
    if (op === "/") return "\\frac{" + astToLatex(node[1]) + "}{" + astToLatex(node[2]) + "}";
    if (op === "^") {
      a = astToLatex(node[1]);
      if (Array.isArray(node[1]) && node[1][0] !== "abs" && !LATEX_FUNCS[node[1][0]]) {
        a = "\\left(" + a + "\\right)";
      }
      return "{" + a + "}^{" + astToLatex(node[2]) + "}";
    }
    if (op === "=") {
      s = "";
      for (i = 1; i < node.length; i++) {
        s += astToLatex(node[i]);
        if (i < node.length - 1) s += "=";
      }
      return s;
    }
    if (op === "abs") return "\\left|" + astToLatex(node[1]) + "\\right|";
    if (op === "sqrt") return "\\sqrt{" + astToLatex(node[1]) + "}";
    if (LATEX_FUNCS[op]) return LATEX_FUNCS[op] + "\\left(" + astToLatex(node[1]) + "\\right)";
    return "";
  }

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
      a = evalAst(node[1], env);
      b = evalAst(node[2], env);
      if (!isFinite(a) || !isFinite(b) || b === 0) return NaN;
      // Near a vertical asymptote the denominator can be tiny but nonzero;
      // treat those samples as undefined so the curve does not bridge the hole.
      if (Math.abs(b) < 1e-12 * Math.max(1, Math.abs(a))) return NaN;
      p = a / b;
      return isFinite(p) ? p : NaN;
    }
    if (op === "^") {
      a = evalAst(node[1], env);
      b = evalAst(node[2], env);
      if (!isFinite(a) || !isFinite(b)) return NaN;
      if (a < 0 && Math.abs(b - Math.round(b)) > 1e-10) return NaN;
      if (b < 0 && Math.abs(a) < 1e-12) return NaN;
      p = Math.pow(a, b);
      return isFinite(p) ? p : NaN;
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

  function likelyPoleJump(y1, y2, lo, hi) {
    if (!isFinite(y1) || !isFinite(y2)) return true;
    var span = hi - lo;
    if (!(span > 0)) return false;
    var opposite = y1 > 0 !== y2 > 0;
    var bothFar = Math.abs(y1) > span * 0.5 && Math.abs(y2) > span * 0.5;
    return opposite && bothFar && Math.abs(y1 - y2) > span * 0.75;
  }

  function mixEnv(env1, env2, u) {
    var env = {};
    var k;
    for (k in env1) {
      if (typeof env1[k] === "number" && typeof env2[k] === "number") {
        env[k] = env1[k] + (env2[k] - env1[k]) * u;
      } else {
        env[k] = env1[k];
      }
    }
    return env;
  }

  function denomTouchesZero(d1, d2, node, env1, env2) {
    if (!isFinite(d1) || !isFinite(d2) || d1 === 0 || d2 === 0) return true;
    if (d1 > 0 !== d2 > 0) return true;
    var us = [0.2, 0.4, 0.5, 0.6, 0.8];
    var i, d, mag;
    var endMin = Math.min(Math.abs(d1), Math.abs(d2));
    var endMax = Math.max(Math.abs(d1), Math.abs(d2));
    for (i = 0; i < us.length; i++) {
      d = evalAst(node, mixEnv(env1, env2, us[i]));
      if (!isFinite(d) || d === 0) return true;
      if (d > 0 !== d1 > 0) return true;
      mag = Math.abs(d);
      if (mag < endMin * 0.25 && mag < endMax * 0.05) return true;
    }
    return false;
  }

  function straddlesZero(a, b) {
    if (!isFinite(a) || !isFinite(b)) return true;
    if (a === 0 || b === 0) return true;
    return a > 0 !== b > 0;
  }

  function crossesTanPole(a, b) {
    if (!isFinite(a) || !isFinite(b)) return true;
    var n1 = a / Math.PI - 0.5;
    var n2 = b / Math.PI - 0.5;
    if (Math.abs(n1 - Math.round(n1)) < 1e-12) return true;
    if (Math.abs(n2 - Math.round(n2)) < 1e-12) return true;
    return Math.floor(n1) !== Math.floor(n2);
  }

  function nodeHasSingularity(node, env1, env2) {
    if (!Array.isArray(node)) return false;
    var i;
    for (i = 1; i < node.length; i++) {
      if (nodeHasSingularity(node[i], env1, env2)) return true;
    }
    var op = node[0];
    if (op === "/") return denomTouchesZero(evalAst(node[2], env1), evalAst(node[2], env2), node[2], env1, env2);
    if (op === "^") {
      var e1 = evalAst(node[2], env1);
      var e2 = evalAst(node[2], env2);
      var negative = e1 < 0 || e2 < 0;
      var nonInt =
        (isFinite(e1) && Math.abs(e1 - Math.round(e1)) > 1e-10) ||
        (isFinite(e2) && Math.abs(e2 - Math.round(e2)) > 1e-10);
      if (negative || nonInt) {
        return denomTouchesZero(evalAst(node[1], env1), evalAst(node[1], env2), node[1], env1, env2);
      }
      return false;
    }
    if (op === "tan") return crossesTanPole(evalAst(node[1], env1), evalAst(node[1], env2));
    if (op === "ln" || op === "log") {
      var arg = node[1];
      if (Array.isArray(arg) && arg[0] === "abs") {
        return denomTouchesZero(evalAst(arg[1], env1), evalAst(arg[1], env2), arg[1], env1, env2);
      }
      var a1 = evalAst(arg, env1);
      var a2 = evalAst(arg, env2);
      return !(a1 > 0) || !(a2 > 0);
    }
    if (op === "sqrt") {
      var s1 = evalAst(node[1], env1);
      var s2 = evalAst(node[1], env2);
      return !(s1 >= 0) || !(s2 >= 0);
    }
    if (op === "arcsin" || op === "arccos") {
      var r1 = evalAst(node[1], env1);
      var r2 = evalAst(node[1], env2);
      return !(Math.abs(r1) <= 1) || !(Math.abs(r2) <= 1);
    }
    if (op === "floor" || op === "ceil") {
      var f1 = evalAst(node[1], env1);
      var f2 = evalAst(node[1], env2);
      if (!isFinite(f1) || !isFinite(f2)) return true;
      return Math.floor(f1) !== Math.floor(f2);
    }
    if (op === "round") {
      var g1 = evalAst(node[1], env1);
      var g2 = evalAst(node[1], env2);
      if (!isFinite(g1) || !isFinite(g2)) return true;
      return Math.round(g1) !== Math.round(g2);
    }
    if (op === "sign") return straddlesZero(evalAst(node[1], env1), evalAst(node[1], env2));
    return false;
  }

  function hasSingularityBetween(node, name, t1, t2) {
    var extra1 = {};
    var extra2 = {};
    extra1[name] = t1;
    extra2[name] = t2;
    return nodeHasSingularity(node, envWith(extra1), envWith(extra2));
  }

  function lerpT(t1, y1, t2, y2, y) {
    if (y2 === y1) return t1;
    return t1 + (t2 - t1) * ((y - y1) / (y2 - y1));
  }

  function clipSegToY(t1, y1, t2, y2, lo, hi) {
    if (!isFinite(t1) || !isFinite(t2) || !isFinite(y1) || !isFinite(y2)) return null;
    var aT = t1;
    var aY = y1;
    var bT = t2;
    var bY = y2;
    function code(y) {
      return (y < lo ? 1 : 0) | (y > hi ? 2 : 0);
    }
    var c1 = code(aY);
    var c2 = code(bY);
    var g = 0;
    var c;
    var y;
    var t;
    while (g++ < 8) {
      if (!(c1 | c2)) return [{ t: aT, y: aY }, { t: bT, y: bY }];
      if (c1 & c2) return null;
      // Opposite sides of the window in one step is a pole-like jump, not a
      // curve through the view. Subdivision should already have placed
      // in-window samples if the function is merely steep.
      if ((c1 | c2) === 3) return null;
      c = c1 || c2;
      y = c & 1 ? lo : hi;
      t = lerpT(aT, aY, bT, bY, y);
      if (c === c1) {
        aT = t;
        aY = y;
        c1 = code(aY);
      } else {
        bT = t;
        bY = y;
        c2 = code(bY);
      }
    }
    return null;
  }

  function evalIndep(name, t) {
    var extra = {};
    extra[name] = t;
    return evalAst(spec.rhs, envWith(extra));
  }

  function pairBroken(a, b, name, lo, hi) {
    if (!isFinite(a.y) || !isFinite(b.y)) return true;
    if (hasSingularityBetween(spec.rhs, name, a.t, b.t)) return true;
    return likelyPoleJump(a.y, b.y, lo, hi);
  }

  function approachDefined(t0, y0, tGoal, name, lo, hi) {
    var t = t0;
    var y = y0;
    var limit = tGoal;
    var k, mid, ym;
    for (k = 0; k < 20; k++) {
      mid = t + (limit - t) / 2;
      ym = evalIndep(name, mid);
      if (pairBroken({ t: t, y: y }, { t: mid, y: ym }, name, lo, hi)) limit = mid;
      else {
        t = mid;
        y = ym;
      }
    }
    return { t: t, y: y };
  }

  function sameSideOutside(y1, y2, lo, hi) {
    return (y1 > hi && y2 > hi) || (y1 < lo && y2 < lo);
  }

  function drawExplicit() {
    var s = size();
    var sampleAlongX = spec.dependent !== spec.xAxis;
    var n = Math.max(800, sampleAlongX ? s.w * 3 : s.h * 3);
    var depLo = sampleAlongX ? view.ymin : view.xmin;
    var depHi = sampleAlongX ? view.ymax : view.xmax;
    var span = depHi - depLo;
    var indepName = spec.independent;
    var indepSpan = sampleAlongX ? view.xmax - view.xmin : view.ymax - view.ymin;
    var minDt = indepSpan / Math.max(s.w, s.h, 1) / 8;
    var pts = [];
    var i, extra, t, a, b, clipped, xy, p;

    function sampleAt(tt) {
      extra = {};
      extra[indepName] = tt;
      return { t: tt, y: evalAst(spec.rhs, envWith(extra)) };
    }

    for (i = 0; i <= n; i++) {
      t = sampleAlongX ? wx((i / n) * s.w) : wy((i / n) * s.h);
      pts.push(sampleAt(t));
    }

    function shouldSplit(p1, p2) {
      if (!(Math.abs(p2.t - p1.t) > minDt)) return false;
      if (!isFinite(p1.y) || !isFinite(p2.y)) return true;
      if (sameSideOutside(p1.y, p2.y, depLo, depHi)) return false;
      if (hasSingularityBetween(spec.rhs, indepName, p1.t, p2.t)) return true;
      if (likelyPoleJump(p1.y, p2.y, depLo, depHi)) return true;
      return Math.abs(p1.y - p2.y) > span * 0.12;
    }

    var pass, next, inserted;
    for (pass = 0; pass < 8; pass++) {
      next = [pts[0]];
      inserted = 0;
      for (i = 1; i < pts.length; i++) {
        a = next[next.length - 1];
        b = pts[i];
        if (inserted + pts.length < 14000 && shouldSplit(a, b)) {
          next.push(sampleAt((a.t + b.t) / 2));
          inserted++;
        }
        next.push(b);
      }
      pts = next;
      if (!inserted) break;
    }

    function toXY(pt) {
      if (sampleAlongX) return { x: sx(pt.t), y: sy(pt.y) };
      return { x: sx(pt.y), y: sy(pt.t) };
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    var pen = null;

    function lineDraw(pt) {
      xy = toXY(pt);
      if (!pen) ctx.moveTo(xy.x, xy.y);
      else ctx.lineTo(xy.x, xy.y);
      pen = xy;
    }

    function lift() {
      pen = null;
    }

    function emitClip(p1, p2) {
      clipped = clipSegToY(p1.t, p1.y, p2.t, p2.y, depLo, depHi);
      if (!clipped) {
        lift();
        return;
      }
      xy = toXY(clipped[0]);
      var xy2 = toXY(clipped[1]);
      var dxPx = Math.abs(xy2.x - xy.x);
      var dyPx = Math.abs(xy2.y - xy.y);
      if (dxPx < 2.2 && dyPx > 32) {
        var yA = clipped[0].y;
        var yB = clipped[1].y;
        var nearEdge =
          depHi - Math.max(yA, yB) < span * 0.12 || Math.min(yA, yB) - depLo < span * 0.12;
        if (!(nearEdge && Math.abs(yA - yB) < span * 0.22)) {
          lift();
          return;
        }
      }
      lineDraw(clipped[0]);
      lineDraw(clipped[1]);
    }

    for (i = 1; i < pts.length; i++) {
      a = pts[i - 1];
      b = pts[i];
      if (pairBroken(a, b, indepName, depLo, depHi)) {
        if (isFinite(a.y)) {
          p = approachDefined(a.t, a.y, b.t, indepName, depLo, depHi);
          emitClip(a, p);
        }
        lift();
        if (isFinite(b.y)) {
          p = approachDefined(b.t, b.y, a.t, indepName, depLo, depHi);
          emitClip(p, b);
        }
        continue;
      }
      emitClip(a, b);
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

  function typesetEquation(el) {
    if (!el) return;
    function go() {
      if (window.MathJax && MathJax.typesetPromise) {
        try {
          if (MathJax.typesetClear) MathJax.typesetClear([el]);
        } catch (err) {}
        MathJax.typesetPromise([el]).catch(function () {});
        return;
      }
      if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise.then(go).catch(function () {});
        return;
      }
      setTimeout(go, 40);
    }
    go();
  }

  function renderPanelEquation() {
    var el = document.getElementById("panel-eq");
    if (!el) return;
    var latex = payload && payload.latex ? payload.latex : astToLatex(payload && payload.ast);
    var flat = payload && payload.flat ? payload.flat : "";
    if (latex) {
      el.innerHTML = "\\(" + latex + "\\)";
      typesetEquation(el);
    } else {
      el.textContent = flat;
    }
  }

  function buildSliders() {
    renderPanelEquation();
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
      var initial = 1;
      if (payload.values && isFinite(Number(payload.values[name]))) {
        initial = Number(payload.values[name]);
      }
      values[name] = initial;
      ranges[name] = defaultRange();
      values[name] = snapValue(name, values[name]);
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
