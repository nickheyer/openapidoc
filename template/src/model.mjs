/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
import semver from 'semver';
import { schemaRows, parameterRows } from './schema.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

const LANG_BY_MEDIA = {
  'application/json': 'json',
  'application/xml': 'xml',
  'text/html': 'html',
};

const PATH_ITEM_KEYS = ['summary', 'description', 'servers', 'parameters', 'additionalOperations', '$ref'];

export function makeResolver (spec) {
  return function resolve (value) {
    let current = value;
    let guard = 0;
    while (current && typeof current === 'object' && typeof current.$ref === 'string' && current.$ref.indexOf('#/') === 0 && guard < 16) {
      const parts = current.$ref.slice(2).split('/').map(part => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'));
      let node = spec;
      parts.forEach(part => { node = node ? node[part] : undefined; });
      if (!node) { return current; }
      current = node;
      guard += 1;
    }
    return current;
  };
}

// Mirrors the cleanup the apidoc worker applies to group names
function sanitizeGroup (name) {
  return String(name).replace(/\s+/g, '_').replace(/[()#?&"'<>/\\]/g, '');
}

function nameFromPath (method, path) {
  let name = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  (path.match(/\w+/g) || []).forEach(part => {
    name += part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });
  return name;
}

function joinUrl (base, path) {
  if (!base) { return path; }
  return base.replace(/\/+$/, '') + path;
}

function pickMedia (content) {
  const keys = Object.keys(content || {});
  if (!keys.length) { return undefined; }
  return keys.indexOf('application/json') !== -1 ? 'application/json' : keys[0];
}

function codeSamples (op) {
  return op['x-codeSamples'] || op['x-code-samples'] || [];
}

function toExample (sample) {
  return { title: sample.label || sample.lang || '', content: sample.source || '', type: sample.lang || 'text' };
}

function listOrUndefined (list) {
  return list && list.length ? list : undefined;
}

function groupRows (rows, defaultGroup) {
  const fields = {};
  rows.forEach(row => {
    const group = row.group || defaultGroup;
    if (!fields[group]) { fields[group] = []; }
    fields[group].push(row);
  });
  return rows.length ? fields : undefined;
}

function sectionOrUndefined (fields, examples) {
  if (!fields && !examples) { return undefined; }
  const section = {};
  if (fields) { section.fields = fields; }
  if (examples) { section.examples = examples; }
  return section;
}

function parameterSections (op, pathItem, resolve) {
  const params = (pathItem.parameters || []).concat(op.parameters || []).map(resolve).filter(Boolean);
  const header = [];
  const parameter = [];
  const query = [];
  params.forEach(param => {
    const rows = parameterRows(param, { resolve: resolve });
    const group = param['x-apidoc-group'];
    if (param.in === 'header') {
      rows.forEach(row => { row.group = row.group || group || 'Header'; });
      header.push.apply(header, rows);
    } else if (param.in === 'query' && !group) {
      query.push.apply(query, rows);
    } else {
      rows.forEach(row => { row.group = row.group || group || 'Parameter'; });
      parameter.push.apply(parameter, rows);
    }
  });
  return {
    header: sectionOrUndefined(groupRows(header, 'Header'), sectionExamples(op, 'header')),
    parameter: sectionOrUndefined(groupRows(parameter, 'Parameter'), sectionExamples(op, 'parameter')),
    query: listOrUndefined(query),
  };
}

function sectionExamples (op, section) {
  return listOrUndefined(codeSamples(op).filter(sample => sample['x-apidoc-section'] === section).map(toExample));
}

function bodySection (op, resolve) {
  const body = resolve(op.requestBody);
  if (!body || !body.content) { return undefined; }
  const media = pickMedia(body.content);
  const schema = resolve(body.content[media].schema);
  if (!schema) { return undefined; }
  const rows = schemaRows(schema, { resolve: resolve });
  if (!rows.length) { return undefined; }
  return { rows: rows, schema: schema, media: media };
}

function formatValue (value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 4);
}

function formatExample (example) {
  let body = '';
  if (example.serializedValue !== undefined) {
    body = String(example.serializedValue);
  } else if (example.dataValue !== undefined) {
    body = formatValue(example.dataValue);
  } else if (example.value !== undefined) {
    body = formatValue(example.value);
  }
  const status = example['x-apidoc-status-line'];
  return status ? status + '\n' + body : body;
}

// Wildcard classes come before their numeric codes, default goes last
function codeOrder (code) {
  if (code === 'default') { return Infinity; }
  const wildcard = /^([1-5])XX$/i.exec(code);
  if (wildcard) { return Number(wildcard[1]) * 100 - 0.5; }
  const numeric = Number(code);
  return Number.isFinite(numeric) ? numeric : Infinity - 1;
}

function responseSections (op, resolve) {
  const success = { rows: [], examples: [] };
  const error = { rows: [], examples: [] };
  const responses = op.responses || {};
  Object.keys(responses).sort((a, b) => codeOrder(a) - codeOrder(b)).forEach(code => {
    const response = resolve(responses[code]);
    if (!response) { return; }
    const target = /^[123]/.test(code) ? success : error;
    const content = response.content || {};
    const media = pickMedia(content);
    if (media && content[media].schema) {
      const rows = schemaRows(resolve(content[media].schema), { resolve: resolve, group: undefined });
      rows.forEach(row => { row.group = row.group || response.description || code; });
      target.rows.push.apply(target.rows, rows);
    }
    Object.keys(content).forEach(mediaType => {
      const item = content[mediaType];
      const lang = LANG_BY_MEDIA[mediaType] || 'text';
      const examples = item.examples || {};
      Object.keys(examples).forEach(key => {
        const example = resolve(examples[key]) || {};
        target.examples.push({ title: example.summary || key, content: formatExample(example), type: lang });
      });
      if (item.example !== undefined) {
        target.examples.push({ title: response.description || code, content: formatValue(item.example), type: lang });
      }
    });
  });
  return {
    success: sectionOrUndefined(groupRows(success.rows, 'Success'), listOrUndefined(success.examples)),
    error: sectionOrUndefined(groupRows(error.rows, 'Error'), listOrUndefined(error.examples)),
  };
}

function sampleRequestUrl (op, path, sampleServer) {
  const flag = op['x-apidoc-sample-request'];
  if (flag === false) { return undefined; }
  if (typeof flag === 'string') { return flag; }
  if (sampleServer) { return joinUrl(sampleServer.url === '/' ? '' : sampleServer.url, path); }
  return undefined;
}

function toEntry (context, path, method, op, pathItem) {
  const resolve = context.resolve;
  const tags = op.tags && op.tags.length ? op.tags : ['default'];
  const group = sanitizeGroup(tags[0]);
  const tag = context.tags[tags[0]] || context.tags[group] || {};
  const name = op.operationId || nameFromPath(method, path);
  const version = op['x-apidoc-version'] || context.version;
  const base = op.servers && op.servers[0] && op.servers[0].url ? op.servers[0].url : context.displayBase;
  const params = parameterSections(op, pathItem, resolve);
  const responses = responseSections(op, resolve);
  const body = bodySection(op, resolve);
  const entry = {
    id: (group + '-' + name + '-' + version).replace(/\./g, '_'),
    group: group,
    groupTitle: tag.summary || tag['x-displayName'] || group,
    groupDescription: tag.description,
    name: name,
    version: version,
    type: method,
    url: joinUrl(base, path),
    path: path,
    title: op.summary || '',
    description: op.description,
    deprecated: op.deprecated ? { content: op['x-apidoc-deprecated'] } : undefined,
    permission: listOrUndefined(op['x-apidoc-permission']),
    examples: listOrUndefined(codeSamples(op).filter(sample => !sample['x-apidoc-section']).map(toExample)),
    header: params.header,
    parameter: params.parameter,
    query: params.query,
    body: body ? body.rows : undefined,
    bodySchema: body ? body.schema : undefined,
    success: responses.success,
    error: responses.error,
    sampleRequest: sampleRequestUrl(op, path, context.sampleServer),
    operation: op,
  };
  return entry;
}

function eachOperation (spec, history, visit) {
  const paths = spec.paths || {};
  Object.keys(paths).forEach(path => {
    const item = paths[path] || {};
    METHODS.forEach(method => {
      if (item[method]) { visit(path, method, item[method], item); }
    });
    const extra = item.additionalOperations || {};
    Object.keys(extra).forEach(method => visit(path, method.toLowerCase(), extra[method], item));
    Object.keys(item).forEach(key => {
      if (METHODS.indexOf(key) === -1 && PATH_ITEM_KEYS.indexOf(key) === -1 && key.indexOf('x-') !== 0 && item[key] && typeof item[key] === 'object' && item[key].responses) {
        visit(path, key.toLowerCase(), item[key], item);
      }
    });
  });
  (history || []).forEach(entry => visit(entry.path, entry.method, entry.operation, {}));
}

export function buildEntries (spec, history) {
  const servers = spec.servers || [];
  const displayServer = servers.filter(server => !server['x-apidoc-sample-request'])[0];
  const tags = {};
  (spec.tags || []).forEach(tag => { tags[tag.name] = tag; });
  const context = {
    resolve: makeResolver(spec),
    tags: tags,
    version: spec.info && spec.info.version ? spec.info.version : '0.0.0',
    displayBase: displayServer ? displayServer.url : '',
    sampleServer: servers.filter(server => server['x-apidoc-sample-request'])[0],
  };
  const entries = [];
  eachOperation(spec, history, (path, method, op, pathItem) => {
    entries.push(toEntry(context, path, method, op, pathItem));
  });
  return entries;
}

function compareVersions (a, b) {
  const va = semver.valid(a);
  const vb = semver.valid(b);
  if (va && vb) { return semver.rcompare(va, vb); }
  return a < b ? 1 : a > b ? -1 : 0;
}

// Sorts titles then applies the project order list, like the classic template
function sortByOrder (elements, order, splitBy) {
  const results = [];
  order.forEach(name => {
    elements.forEach(element => {
      const parts = element.split(splitBy);
      if ((parts[0] === name || parts[1] === name) && results.indexOf(element) === -1) { results.push(element); }
    });
  });
  elements.forEach(element => {
    if (results.indexOf(element) === -1) { results.push(element); }
  });
  return results;
}

function sortGroupsByOrder (groups, titles, order) {
  const results = [];
  order.forEach(sortKey => {
    groups.forEach(name => {
      if (titles[name].replace(/_/g, ' ') === sortKey && results.indexOf(name) === -1) { results.push(name); }
    });
  });
  groups.forEach(name => {
    if (results.indexOf(name) === -1) { results.push(name); }
  });
  return results;
}

export function buildModel (spec, history, config) {
  const project = config || {};
  const entries = buildEntries(spec, history);

  const byGroup = {};
  entries.forEach(entry => {
    if (!byGroup[entry.group]) { byGroup[entry.group] = {}; }
    if (!byGroup[entry.group][entry.name]) { byGroup[entry.group][entry.name] = []; }
    byGroup[entry.group][entry.name].push(entry);
  });

  const ordered = [];
  Object.keys(byGroup).forEach(group => {
    const names = byGroup[group];
    let titles = [];
    Object.keys(names).forEach(name => {
      names[name].sort((a, b) => compareVersions(a.version, b.version));
      const title = names[name][0].title;
      if (title) { titles.push(title.toLowerCase() + '#~#' + name); }
    });
    titles.sort();
    if (project.order) { titles = sortByOrder(titles, project.order, '#~#'); }
    titles.forEach(key => {
      names[key.split('#~#')[1]].forEach(entry => ordered.push(entry));
    });
  });

  const groupTitles = {};
  const groupDescriptions = {};
  ordered.forEach(entry => {
    groupTitles[entry.group] = entry.groupTitle || entry.group;
    if (entry.groupDescription) { groupDescriptions[entry.group] = entry.groupDescription; }
  });
  const tagOrder = (spec.tags || []).map(tag => sanitizeGroup(tag.name)).filter(name => groupTitles[name]);
  let groups = tagOrder.concat(Object.keys(groupTitles).filter(name => tagOrder.indexOf(name) === -1).sort());
  if (project.order) { groups = sortGroupsByOrder(groups, groupTitles, project.order); }

  const versionSet = {};
  ordered.forEach(entry => { versionSet[entry.version] = true; });
  if (project.version) { versionSet[project.version] = true; }
  const versions = Object.keys(versionSet).sort(compareVersions);

  return {
    entries: ordered,
    byGroupAndName: byGroup,
    groups: groups.map(name => ({ name: name, title: groupTitles[name], description: groupDescriptions[name] })),
    versions: versions,
  };
}
