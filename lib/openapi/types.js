/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */

// Schema fragments for the type names apidoc documents
const KNOWN = {
  string: { type: 'string' },
  number: { type: 'number' },
  integer: { type: 'integer' },
  boolean: { type: 'boolean' },
  object: { type: 'object' },
  date: { type: 'string', format: 'date' },
  datetime: { type: 'string', format: 'date-time' },
  file: { type: 'string', format: 'binary' },
  email: { type: 'string', format: 'email' },
  uuid: { type: 'string', format: 'uuid' },
  url: { type: 'string', format: 'uri' },
};

const DISPLAY = {
  string: 'String',
  number: 'Number',
  integer: 'Integer',
  boolean: 'Boolean',
  object: 'Object',
  array: 'Array',
  'string/date': 'Date',
  'string/date-time': 'DateTime',
  'string/binary': 'File',
  'string/email': 'Email',
  'string/uuid': 'Uuid',
  'string/uri': 'Url',
};

const SIZE_KEYS = {
  string: ['minLength', 'maxLength'],
  number: ['minimum', 'maximum'],
  integer: ['minimum', 'maximum'],
  array: ['minItems', 'maxItems'],
};

function primaryType (schema) {
  if (Array.isArray(schema.type)) {
    return schema.type.filter(t => t !== 'null')[0];
  }
  return schema.type;
}

// Keeps the authored spelling when it cannot be rebuilt from the schema
function schemaForType (typeString) {
  if (!typeString) { return {}; }
  let base = String(typeString).trim();
  let depth = 0;
  while (base.endsWith('[]')) {
    base = base.slice(0, -2);
    depth += 1;
  }
  const known = KNOWN[base.toLowerCase()];
  let schema = known ? Object.assign({}, known) : {};
  for (let i = 0; i < depth; i += 1) {
    schema = { type: 'array', items: schema };
  }
  if (displayType(schema) !== typeString) {
    schema['x-apidoc-type'] = typeString;
  }
  return schema;
}

function displayType (schema) {
  if (!schema) { return undefined; }
  if (schema['x-apidoc-type']) { return schema['x-apidoc-type']; }
  const type = primaryType(schema);
  if (type === 'array') {
    const inner = displayType(schema.items);
    return inner ? inner + '[]' : 'Array';
  }
  if (!type) { return undefined; }
  return DISPLAY[type + '/' + schema.format] || DISPLAY[type] || type;
}

function coerceValue (value, schema) {
  if (value === undefined || value === null) { return value; }
  const type = primaryType(schema);
  if (type === 'number' || type === 'integer') {
    const n = Number(value);
    return value !== '' && Number.isFinite(n) ? n : value;
  }
  if (type === 'boolean') {
    if (value === true || value === 'true') { return true; }
    if (value === false || value === 'false') { return false; }
    return value;
  }
  if ((type === 'array' || type === 'object') && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

function stripQuotes (value) {
  const s = String(value);
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if (first === last && (first === '"' || first === '\'')) {
      return s.slice(1, -1);
    }
  }
  return s;
}

// Ranges apply to the element type for arrays of values
function applyEnum (schema, allowedValues) {
  const target = primaryType(schema) === 'array' && schema.items ? schema.items : schema;
  target.enum = allowedValues.map(v => coerceValue(stripQuotes(v), target));
}

function applySize (schema, size) {
  const match = /^\s*(\d*)\s*(?:\.\.|-)\s*(\d*)\s*$/.exec(size);
  const keys = SIZE_KEYS[primaryType(schema)];
  const empty = match && match[1] === '' && match[2] === '';
  if (!match || !keys || empty) {
    schema['x-apidoc-size'] = size;
    return;
  }
  if (match[1] !== '') { schema[keys[0]] = Number(match[1]); }
  if (match[2] !== '') { schema[keys[1]] = Number(match[2]); }
  if (displaySize(schema) !== size) {
    schema['x-apidoc-size'] = size;
  }
}

function displaySize (schema) {
  if (!schema) { return undefined; }
  if (schema['x-apidoc-size']) { return schema['x-apidoc-size']; }
  const keys = SIZE_KEYS[primaryType(schema)];
  if (!keys) { return undefined; }
  const min = schema[keys[0]];
  const max = schema[keys[1]];
  if (min === undefined && max === undefined) { return undefined; }
  return (min === undefined ? '' : min) + '..' + (max === undefined ? '' : max);
}

module.exports = {
  schemaForType: schemaForType,
  displayType: displayType,
  coerceValue: coerceValue,
  applyEnum: applyEnum,
  applySize: applySize,
  displaySize: displaySize,
  primaryType: primaryType,
};
