/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
const schemaBuilder = require('./schema');
const examples = require('./examples');

const STANDARD_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

const DEFAULT_GROUP = { path: 'Parameter', query: 'Query', header: 'Header' };

const JSON_MEDIA = 'application/json';

function parseUrl (rawUrl) {
  let url = rawUrl || '';
  let origin;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      origin = parsed.origin;
      url = parsed.pathname + parsed.search;
    } catch (e) {
      origin = undefined;
    }
  }
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) { url = url.slice(0, queryIndex); }
  const pathParams = [];
  const path = url.replace(/:(\w+)\??/g, (match, name) => {
    pathParams.push(name);
    return '{' + name + '}';
  });
  return {
    origin: origin,
    path: path.charAt(0) === '/' ? path : '/' + path,
    pathParams: pathParams,
  };
}

// Description belongs on the parameter, everything else stays in schema
function toParameter (name, schema, location, required, group) {
  const parameter = { name: name, in: location };
  if (schema.description) {
    parameter.description = schema.description;
    delete schema.description;
  }
  parameter.required = location === 'path' ? true : required;
  parameter.schema = schema;
  if (group && group !== DEFAULT_GROUP[location]) {
    parameter['x-apidoc-group'] = group;
  }
  if (location === 'path' && !required) {
    parameter['x-apidoc-optional'] = true;
  }
  return parameter;
}

function groupedFields (section) {
  const result = [];
  const fields = section && section.fields ? section.fields : {};
  Object.keys(fields).forEach(group => {
    result.push({ group: group, fields: fields[group] });
  });
  return result;
}

function collectParameters (block, pathParams) {
  const parameters = [];

  groupedFields(block.header).forEach(entry => {
    const tree = schemaBuilder.buildTree(entry.fields);
    Object.keys(tree.properties).forEach(name => {
      const required = Boolean(tree.required && tree.required.indexOf(name) !== -1);
      parameters.push(toParameter(name, tree.properties[name], 'header', required, entry.group));
    });
  });

  groupedFields(block.parameter).forEach(entry => {
    const tree = schemaBuilder.buildTree(entry.fields);
    Object.keys(tree.properties).forEach(name => {
      const isPath = pathParams.indexOf(name) !== -1;
      const required = Boolean(tree.required && tree.required.indexOf(name) !== -1);
      parameters.push(toParameter(name, tree.properties[name], isPath ? 'path' : 'query', required, entry.group));
    });
  });

  if (block.query && block.query.length) {
    const byGroup = {};
    block.query.forEach(field => {
      const group = field.group || 'Query';
      if (!byGroup[group]) { byGroup[group] = []; }
      byGroup[group].push(field);
    });
    Object.keys(byGroup).forEach(group => {
      const tree = schemaBuilder.buildTree(byGroup[group]);
      Object.keys(tree.properties).forEach(name => {
        const required = Boolean(tree.required && tree.required.indexOf(name) !== -1);
        parameters.push(toParameter(name, tree.properties[name], 'query', required, group));
      });
    });
  }

  return parameters;
}

function requestBody (block) {
  if (!block.body || !block.body.length) { return undefined; }
  const schema = schemaBuilder.objectSchema(block.body);
  const media = schemaBuilder.hasBinary(schema) ? 'multipart/form-data' : JSON_MEDIA;
  const body = { content: {} };
  body.content[media] = { schema: schema };
  if (schema.required && schema.required.length) { body.required = true; }
  return body;
}

// Matches a status code or class such as 4xx inside a group title
function responseCode (group, kind) {
  const match = /(?:^|\D)([1-5])(\d\d|xx)(?!\d)/i.exec(group);
  if (match) { return match[1] + match[2].toUpperCase(); }
  return kind === 'success' ? '200' : 'default';
}

function ensureResponse (responses, code, description) {
  if (!responses[code]) {
    responses[code] = { description: description };
  }
  return responses[code];
}

function ensureMedia (response, media) {
  if (!response.content) { response.content = {}; }
  if (!response.content[media]) { response.content[media] = {}; }
  return response.content[media];
}

function addResponseFields (responses, section, kind) {
  groupedFields(section).forEach(entry => {
    const code = responseCode(entry.group, kind);
    const response = ensureResponse(responses, code, entry.group);
    const media = ensureMedia(response, JSON_MEDIA);
    const tree = schemaBuilder.buildTree(entry.fields);
    if (!media.schema) { media.schema = { type: 'object', properties: {} }; }
    const schema = media.schema;
    const foreignGroup = response.description !== entry.group;
    Object.keys(tree.properties).forEach(name => {
      const property = tree.properties[name];
      if (foreignGroup) { property['x-apidoc-group'] = entry.group; }
      schema.properties[name] = property;
    });
    if (tree.required) {
      schema.required = (schema.required || []).concat(tree.required.filter(name => {
        return !schema.required || schema.required.indexOf(name) === -1;
      }));
    }
  });
}

function firstCode (responses, kind) {
  return Object.keys(responses).filter(code => {
    const success = /^[123]/.test(code);
    return kind === 'success' ? success : !success;
  })[0];
}

function addResponseExamples (responses, section, kind) {
  const list = section && section.examples ? section.examples : [];
  list.forEach((example, index) => {
    const parsed = examples.exampleObject(example);
    let code = parsed.code;
    if (!code) { code = firstCode(responses, kind) || (kind === 'success' ? '200' : 'default'); }
    const description = parsed.example['x-apidoc-status-line'] ? parsed.example['x-apidoc-status-line'].replace(/^HTTP\/\S+\s+\d{3}\s*/, '') : '';
    const response = ensureResponse(responses, code, description || 'Response');
    const media = ensureMedia(response, examples.mediaTypeFor(example.type));
    if (!media.examples) { media.examples = {}; }
    let key = example.title || 'example-' + (index + 1);
    while (media.examples[key]) { key += '-' + (index + 1); }
    media.examples[key] = parsed.example;
  });
}

function buildResponses (block) {
  const responses = {};
  addResponseFields(responses, block.success, 'success');
  addResponseFields(responses, block.error, 'error');
  addResponseExamples(responses, block.success, 'success');
  addResponseExamples(responses, block.error, 'error');
  return Object.keys(responses).length ? responses : undefined;
}

function codeSamples (block) {
  const samples = [];
  const push = (list, section) => {
    (list || []).forEach(example => {
      const sample = { lang: example.type, label: example.title, source: example.content };
      if (section) { sample['x-apidoc-section'] = section; }
      samples.push(sample);
    });
  };
  push(block.examples);
  push(block.header && block.header.examples, 'header');
  push(block.parameter && block.parameter.examples, 'parameter');
  return samples.length ? samples : undefined;
}

function permission (block) {
  if (!block.permission || !block.permission.length) { return undefined; }
  return block.permission.map(entry => {
    const result = { name: entry.name };
    if (entry.title) { result.title = entry.title; }
    if (entry.description) { result.description = entry.description; }
    return result;
  });
}

// Only an explicit override or an opt out needs recording
function sampleRequest (block, project) {
  const sampleUrl = project.sampleUrl;
  if (block.sampleRequest && block.sampleRequest.length) {
    const url = block.sampleRequest[0].url;
    const implied = (typeof sampleUrl === 'string' ? sampleUrl : '') + (block.url || '');
    return url === implied ? undefined : url;
  }
  return sampleUrl ? false : undefined;
}

function buildOperation (block, project) {
  const parsed = parseUrl(block.url);
  const method = String(block.type || '').toLowerCase();
  const operation = {};

  operation.operationId = block.name;
  if (block.title) { operation.summary = block.title; }
  if (block.description) { operation.description = block.description; }
  operation.tags = [block.group];
  if (block.deprecated) {
    operation.deprecated = true;
    if (block.deprecated.content) { operation['x-apidoc-deprecated'] = block.deprecated.content; }
  }
  if (block.private) { operation['x-internal'] = true; }
  operation['x-apidoc-version'] = block.version;

  const permissions = permission(block);
  if (permissions) { operation['x-apidoc-permission'] = permissions; }

  const parameters = collectParameters(block, parsed.pathParams);
  if (parameters.length) { operation.parameters = parameters; }

  const body = requestBody(block);
  if (body) { operation.requestBody = body; }

  const responses = buildResponses(block);
  if (responses) { operation.responses = responses; }

  const samples = codeSamples(block);
  if (samples) { operation['x-codeSamples'] = samples; }

  if (parsed.origin) { operation.servers = [{ url: parsed.origin }]; }

  const sample = sampleRequest(block, project);
  if (sample !== undefined) { operation['x-apidoc-sample-request'] = sample; }

  return {
    path: parsed.path,
    method: method,
    standard: STANDARD_METHODS.indexOf(method) !== -1,
    operation: operation,
  };
}

module.exports = {
  buildOperation: buildOperation,
  parseUrl: parseUrl,
  responseCode: responseCode,
  STANDARD_METHODS: STANDARD_METHODS,
};
