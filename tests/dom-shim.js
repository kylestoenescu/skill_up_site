/* A tiny DOM good enough to run the real js/quiz.js in node. */
function matchesSimple(el, sel) {
  // supports: tag, .class, [attr], [attr="val"], :checked, and combinations
  let rest = sel.trim();
  let checked = false;
  if (rest.endsWith(":checked")) { checked = true; rest = rest.slice(0, -8); }
  const attrs = [];
  rest = rest.replace(/\[([\w-]+)(?:="([^"]*)")?\]/g, (m, k, v) => { attrs.push([k, v]); return ""; });
  const classes = [];
  rest = rest.replace(/\.([\w-]+)/g, (m, c) => { classes.push(c); return ""; });
  const tag = rest.trim();

  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (checked && !el.checked) return false;
  for (const c of classes) if (!el.classList.contains(c)) return false;
  for (const [k, v] of attrs) {
    const present = k === "type" ? el.type !== undefined
      : k.startsWith("data-") ? el.dataset[dataKey(k)] !== undefined || el.attrs[k] !== undefined
      : el.attrs[k] !== undefined;
    if (v === undefined) { if (!present) return false; continue; }
    if (k === "type") { if (el.type !== v) return false; continue; }
    if (k.startsWith("data-")) { if (el.dataset[dataKey(k)] !== v) return false; continue; }
    if (el.attrs[k] !== v) return false;
  }
  return true;
}

function dataKey(attr) {
  return attr.slice(5).replace(/-(\w)/g, (m, x) => x.toUpperCase());
}

/* Supports descendant combinators, e.g. "nav a". */
function matches(el, sel) {
  const parts = sel.trim().split(/\s+(?![^\[]*\])/);
  if (!matchesSimple(el, parts[parts.length - 1])) return false;
  let node = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (node) {
      if (matchesSimple(node, parts[i])) { found = true; node = node.parentNode; break; }
      node = node.parentNode;
    }
    if (!found) return false;
  }
  return true;
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this._text = "";
    this._listeners = {};
    const set = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      contains: (c) => set.has(c),
      _set: set
    };
  }
  set className(v) { this.classList._set.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  get className() { return [...this.classList._set].join(" "); }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  scrollIntoView() {}
  focus() {}
  click() { this._fire("click"); }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  _fire(type, extra) {
    const ev = Object.assign({ type, preventDefault() {}, target: this }, extra);
    (this._listeners[type] || []).forEach((fn) => fn.call(this, ev));
  }
  _all() { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  querySelectorAll(sel) { return this._all().filter((el) => matches(el, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let n = this; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; }
}

function makeDocument() {
  const body = new El("body");
  return {
    body,
    createElement: (tag) => new El(tag),
    createTextNode: (t) => { const n = new El("#text"); n.textContent = t; return n; },
    getElementById: (id) => body._all().find((el) => el.attrs.id === id) || null,
    addEventListener() {},
    readyState: "complete",
    _El: El
  };
}
module.exports = { El, makeDocument };
