/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */

class Raw {
  constructor (value) {
    this.value = value === null || value === undefined ? '' : String(value);
  }

  toString () {
    return this.value;
  }
}

export function escapeHtml (value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function raw (value) {
  return new Raw(value);
}

function render (value) {
  if (value instanceof Raw) { return value.value; }
  if (Array.isArray(value)) { return value.map(render).join(''); }
  if (value === false || value === null || value === undefined) { return ''; }
  return escapeHtml(value);
}

// Interpolations are escaped unless wrapped with raw()
export function html (strings, ...values) {
  let out = '';
  strings.forEach((part, index) => {
    out += part;
    if (index < values.length) { out += render(values[index]); }
  });
  return new Raw(out);
}

export function qs (selector, root) {
  return (root || document).querySelector(selector);
}

export function qsa (selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

export function on (root, type, selector, handler) {
  root.addEventListener(type, event => {
    let node = event.target;
    while (node && node !== root) {
      if (node.matches && node.matches(selector)) {
        handler.call(node, event, node);
        return;
      }
      node = node.parentNode;
    }
  });
}

export function nodesFrom (markup) {
  const template = document.createElement('template');
  template.innerHTML = String(markup).trim();
  return template.content;
}

export function nl2br (text) {
  return ('' + (text === null || text === undefined ? '' : text)).replace(/(?:^|<\/pre>)[^]*?(?:<pre>|$)/g, m => {
    return m.replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br>$2');
  });
}

// Turns apidoc inline links like (#Group:Name) into anchors
export function inlineLinks (text) {
  if (!text) { return text; }
  return String(text).replace(/((\[(.*?)\])?\(#)((.+?):(.+?))(\))/mg, (match, p1, p2, p3, p4, p5, p6) => {
    const link = p3 || p5 + '/' + p6;
    return '<a href="#api-' + p5 + '-' + p6 + '">' + link + '</a>';
  });
}

export function underscoreToSpace (text) {
  return String(text === null || text === undefined ? '' : text).replace(/(_+)/g, ' ');
}

export function idSafe (text) {
  return String(text).replace(/\./g, '_');
}

export function isVisible (element) {
  return Boolean(element && element.offsetParent !== null);
}
