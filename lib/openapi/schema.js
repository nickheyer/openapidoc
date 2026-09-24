/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
const types = require('./types');

function fieldSchema (field) {
  const schema = types.schemaForType(field.type);
  if (field.description) { schema.description = field.description; }
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    schema.default = types.coerceValue(field.defaultValue, schema);
  }
  if (field.allowedValues && field.allowedValues.length) {
    types.applyEnum(schema, field.allowedValues);
  }
  if (field.size) { types.applySize(schema, field.size); }
  return schema;
}

// Children of an array field live on its items schema
function containerOf (schema) {
  let target = schema;
  if (types.primaryType(schema) === 'array') {
    if (!schema.items) { schema.items = {}; }
    target = schema.items;
  }
  if (!target.properties) {
    target.properties = {};
    if (!target.type) { target.type = 'object'; }
  }
  return target;
}

function addRequired (container, key) {
  if (!container.required) { container.required = []; }
  if (container.required.indexOf(key) === -1) { container.required.push(key); }
}

// Nests dot notation fields using the parent links the parser resolved
function buildTree (fields) {
  const root = { properties: {} };
  const nodes = {};
  fields.forEach(field => {
    const schema = fieldSchema(field);
    let container = root;
    let key = field.field;
    const parent = field.parentNode && nodes[field.parentNode.path];
    if (parent) {
      container = containerOf(parent);
      key = field.field.substring(field.parentNode.path.length + 1);
    }
    container.properties[key] = schema;
    if (!field.optional) { addRequired(container, key); }
    nodes[field.field] = schema;
  });
  return root;
}

function objectSchema (fields) {
  const tree = buildTree(fields);
  const schema = { type: 'object', properties: tree.properties };
  if (tree.required) { schema.required = tree.required; }
  return schema;
}

function hasBinary (schema) {
  if (!schema || typeof schema !== 'object') { return false; }
  if (schema.format === 'binary') { return true; }
  if (schema.items && hasBinary(schema.items)) { return true; }
  const props = schema.properties || {};
  return Object.keys(props).some(key => hasBinary(props[key]));
}

module.exports = {
  fieldSchema: fieldSchema,
  buildTree: buildTree,
  objectSchema: objectSchema,
  hasBinary: hasBinary,
};
