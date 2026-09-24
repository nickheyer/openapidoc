/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
const STATUS_LINE = /^\s*(HTTP\/\d(?:\.\d)?\s+(\d{3})[^\n]*)\n?/;

const MEDIA = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  text: 'text/plain',
};

// Splits an authored HTTP dump into status and body
function parseHttpExample (content) {
  const text = content || '';
  const match = STATUS_LINE.exec(text);
  if (!match) { return { body: text }; }
  return {
    statusLine: match[1].trim(),
    code: match[2],
    body: text.slice(match[0].length),
  };
}

function exampleValue (body) {
  const trimmed = (body || '').trim();
  if (trimmed) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      return trimmed;
    }
  }
  return trimmed;
}

function mediaTypeFor (type) {
  return MEDIA[String(type || '').toLowerCase()] || 'text/plain';
}

function exampleObject (example) {
  const parsed = parseHttpExample(example.content);
  const result = { value: exampleValue(parsed.body) };
  if (example.title) { result.summary = example.title; }
  if (parsed.statusLine) { result['x-apidoc-status-line'] = parsed.statusLine; }
  return { code: parsed.code, example: result };
}

module.exports = {
  parseHttpExample: parseHttpExample,
  exampleValue: exampleValue,
  mediaTypeFor: mediaTypeFor,
  exampleObject: exampleObject,
};
