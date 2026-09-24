/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */

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

const identity = value => value;

export function primaryType (schema) {
  if (!schema) { return undefined; }
  if (Array.isArray(schema.type)) {
    return schema.type.filter(t => t !== 'null')[0];
  }
  return schema.type;
}

export function displayType (schema) {
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

export function displaySize (schema) {
  if (!schema) { return undefined; }
  if (schema['x-apidoc-size']) { return schema['x-apidoc-size']; }
  const keys = SIZE_KEYS[primaryType(schema)];
  if (!keys) { return undefined; }
  const min = schema[keys[0]];
  const max = schema[keys[1]];
  if (min === undefined && max === undefined) { return undefined; }
  return (min === undefined ? '' : min) + '..' + (max === undefined ? '' : max);
}

// Children of an array live on its items schema
function childNode (schema, resolve) {
  const type = primaryType(schema);
  if (type === 'array') { return resolve(schema.items) || {}; }
  return schema;
}

export function propertiesOf (schema, resolve) {
  if (!schema) { return undefined; }
  return childNode(schema, resolve || identity).properties;
}

function enumOf (schema, resolve) {
  if (schema.enum) { return schema.enum; }
  const child = childNode(schema, resolve);
  return child !== schema && child.enum ? child.enum : undefined;
}

function displayValue (value) {
  if (value === undefined || value === null) { return undefined; }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// Form names follow the classic scheme, only top level lists carry []
function makeRow (key, schema, context) {
  const type = primaryType(schema);
  const isArray = type === 'array';
  const field = context.prefix ? context.prefix + '.' + key : key;
  const bracket = context.bracket ? context.bracket + '[' + key + ']' : isArray ? key + '[]' : key;
  return {
    field: field,
    key: key,
    depth: context.depth,
    type: displayType(schema),
    optional: context.optional,
    description: context.description !== undefined ? context.description : schema.description,
    defaultValue: displayValue(schema.default),
    size: displaySize(schema),
    allowedValues: enumOf(schema, context.resolve),
    isArray: isArray,
    isObject: Boolean(propertiesOf(schema, context.resolve)),
    bracket: bracket,
    childBracket: isArray && context.bracket ? bracket + '[]' : bracket,
    group: context.group || schema['x-apidoc-group'],
    schema: schema,
  };
}

function walk (schema, context, rows) {
  const resolve = context.resolve;
  const node = childNode(schema, resolve);
  const props = node.properties || {};
  const required = node.required || [];
  Object.keys(props).forEach(key => {
    const child = resolve(props[key]) || {};
    const row = makeRow(key, child, {
      resolve: resolve,
      prefix: context.prefix,
      bracket: context.bracket,
      depth: context.depth,
      optional: required.indexOf(key) === -1,
      group: context.group,
    });
    rows.push(row);
    if (row.isObject) {
      walk(child, {
        resolve: resolve,
        prefix: row.field,
        bracket: row.childBracket,
        depth: context.depth + 1,
        group: row.group,
      }, rows);
    }
  });
  return rows;
}

// Flattens a schema tree into table rows with nesting depth
export function schemaRows (schema, options) {
  const opts = options || {};
  if (!schema) { return []; }
  return walk(schema, {
    resolve: opts.resolve || identity,
    prefix: opts.prefix || '',
    bracket: opts.bracket || '',
    depth: opts.depth || 0,
    group: opts.group,
  }, []);
}

// A parameter is its own first row followed by any nested fields
export function parameterRows (parameter, options) {
  const opts = options || {};
  const resolve = opts.resolve || identity;
  const schema = resolve(parameter.schema) || {};
  const row = makeRow(parameter.name, schema, {
    resolve: resolve,
    prefix: '',
    bracket: '',
    depth: 0,
    optional: !parameter.required || parameter['x-apidoc-optional'] === true,
    description: parameter.description !== undefined ? parameter.description : schema.description,
    group: parameter['x-apidoc-group'],
  });
  const rows = [row];
  if (row.isObject) {
    walk(schema, { resolve: resolve, prefix: row.field, bracket: row.childBracket, depth: 1, group: row.group }, rows);
  }
  return rows;
}

function today () {
  const language = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return new Date().toLocaleDateString(language);
}

export function sampleValue (schema, resolve) {
  const res = resolve || identity;
  const node = res(schema) || {};
  const type = primaryType(node);
  if (type === 'array') {
    const items = res(node.items) || {};
    const props = items.properties || {};
    return Object.keys(props).length ? [sampleValue(items, res)] : [];
  }
  if (type === 'object' || node.properties) {
    const out = {};
    const props = node.properties || {};
    Object.keys(props).forEach(key => {
      const value = sampleValue(props[key], res);
      if (value !== undefined) { out[key] = value; }
    });
    return out;
  }
  const hasDefault = node.default !== undefined && node.default !== null;
  if (type === 'string') {
    if (node.format === 'binary') { return undefined; }
    if (hasDefault) { return String(node.default); }
    return node.format === 'date' ? today() : '';
  }
  if (type === 'boolean') { return node.default === true; }
  if (type === 'number' || type === 'integer') { return hasDefault ? Number(node.default) : 0; }
  return hasDefault ? node.default : undefined;
}

export function beautify (value) {
  return JSON.stringify(value, null, 4);
}

// A lone optional array property means the body itself is a list
export function bodySample (schema, resolve) {
  let value = sampleValue(schema, resolve);
  const node = (resolve || identity)(schema) || {};
  const keys = Object.keys(value || {});
  const required = node.required || [];
  if (keys.length === 1 && required.indexOf(keys[0]) === -1 && Array.isArray(value[keys[0]])) {
    value = value[keys[0]];
  }
  return beautify(value);
}
