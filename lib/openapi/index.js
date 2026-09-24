/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
const semver = require('semver');
const { buildOperation } = require('./operation');

const OPENAPI_VERSION = '3.2.0';

const silent = { verbose: function () {}, warn: function () {}, debug: function () {} };

function validVersion (version) {
  return typeof version === 'string' && semver.valid(version) ? version : null;
}

function compareDesc (a, b) {
  return semver.rcompare(a, b);
}

// Newest definition of each endpoint that is not above the wanted version
function selectBlocks (blocks, version) {
  const seen = {};
  const selected = [];
  blocks.forEach(block => {
    const key = block.group + '\u0000' + block.name;
    if (seen[key]) { return; }
    if (semver.lte(block.version, version)) {
      seen[key] = true;
      selected.push(block);
    }
  });
  return selected;
}

function sortGroups (groups, titles, order) {
  const sorted = groups.slice().sort();
  if (!order || !order.length) { return sorted; }
  const result = [];
  order.forEach(sortKey => {
    sorted.forEach(name => {
      if (titles[name] === sortKey && result.indexOf(name) === -1) { result.push(name); }
    });
  });
  sorted.forEach(name => {
    if (result.indexOf(name) === -1) { result.push(name); }
  });
  return result;
}

function buildTags (blocks, project) {
  const titles = {};
  const descriptions = {};
  blocks.forEach(block => {
    if (!(block.group in titles)) {
      titles[block.group] = (block.groupTitle || block.group).replace(/_/g, ' ');
      descriptions[block.group] = block.groupDescription;
    }
  });
  return sortGroups(Object.keys(titles), titles, project.order).map(name => {
    const tag = { name: name };
    if (titles[name] !== name) { tag.summary = titles[name]; }
    if (descriptions[name]) { tag.description = descriptions[name]; }
    return tag;
  });
}

function buildServers (project) {
  const servers = [];
  if (project.url) { servers.push({ url: project.url }); }
  const sample = project.sampleUrl;
  if (typeof sample === 'string' && sample) {
    if (sample === project.url) {
      servers[0]['x-apidoc-sample-request'] = true;
    } else {
      servers.push({ url: sample, description: 'Sample request server', 'x-apidoc-sample-request': true });
    }
  } else if (sample === true) {
    servers.push({ url: '/', description: 'Sample request server', 'x-apidoc-sample-request': true });
  }
  return servers;
}

function buildInfo (project, version) {
  const info = { title: project.name || 'API', version: version };
  if (project.description) { info.summary = project.description; }
  if (project.header && project.header.content) { info.description = project.header.content; }
  return info;
}

function describe (operation) {
  return `${operation.tags[0]} ${operation.operationId} (${operation['x-apidoc-version']})`;
}

// OpenAPI allows one operation per method and path in a document
function placeOperation (paths, entry, version, log) {
  if (!paths[entry.path]) { paths[entry.path] = {}; }
  let item = paths[entry.path];
  let key = entry.method;
  if (!entry.standard) {
    if (!item.additionalOperations) { item.additionalOperations = {}; }
    item = item.additionalOperations;
    key = entry.method.toUpperCase();
  }
  if (item[key]) {
    log.verbose(`${entry.method.toUpperCase()} ${entry.path} is defined twice for version ${version}, keeping ${describe(item[key])} and leaving out ${describe(entry.operation)}`);
    return false;
  }
  item[key] = entry.operation;
  return true;
}

function buildDocument (blocks, project, version, log) {
  const selected = selectBlocks(blocks, version);
  const document = {
    openapi: OPENAPI_VERSION,
    info: buildInfo(project, version),
  };
  const servers = buildServers(project);
  if (servers.length) { document.servers = servers; }
  const tags = buildTags(selected, project);
  if (tags.length) { document.tags = tags; }
  document.paths = {};
  const placed = [];
  selected.forEach(block => {
    const entry = buildOperation(block, project);
    if (placeOperation(document.paths, entry, version, log)) { placed.push(block); }
  });
  if (project.header && project.header.title) {
    document['x-apidoc-header'] = { title: project.header.title };
  }
  if (project.footer && project.footer.content) {
    const footer = { content: project.footer.content };
    if (project.footer.title) { footer.title = project.footer.title; }
    document['x-apidoc-footer'] = footer;
  }
  return { document: document, blocks: placed };
}

// Parsed blocks and project info in, one document per known version out
function build (blocks, project, options) {
  const log = options && options.log ? options.log : silent;
  const defaultVersion = validVersion(project.defaultVersion) || '0.0.0';
  const seenBlocks = {};
  const usable = blocks.filter(block => {
    if (!block.type) {
      log.verbose(`@api ${block.url || ''} in group ${block.group} has no HTTP method and is not part of the OpenAPI output`);
      return false;
    }
    return true;
  }).map(block => {
    return Object.assign({}, block, { version: validVersion(block.version) || defaultVersion });
  }).filter(block => {
    const key = block.group + '\u0000' + block.name + '\u0000' + block.version;
    if (seenBlocks[key]) {
      log.verbose(`${block.group} ${block.name} is defined twice for version ${block.version}, keeping the first definition`);
      return false;
    }
    seenBlocks[key] = true;
    return true;
  });

  const versionSet = {};
  usable.forEach(block => { versionSet[block.version] = true; });
  const projectVersion = validVersion(project.version);
  if (projectVersion) { versionSet[projectVersion] = true; }
  const versions = Object.keys(versionSet).sort(compareDesc);
  if (!versions.length) { versions.push(projectVersion || defaultVersion); }
  const mainVersion = projectVersion && versionSet[projectVersion] ? projectVersion : versions[0];

  const documents = {};
  const included = {};
  versions.forEach(version => {
    const built = buildDocument(usable, project, version, log);
    documents[version] = built.document;
    if (version === mainVersion) {
      built.blocks.forEach(block => { included[block.group + '\u0000' + block.name + '\u0000' + block.version] = true; });
    }
  });

  const seen = {};
  const history = [];
  usable.forEach(block => {
    const key = block.group + '\u0000' + block.name + '\u0000' + block.version;
    if (included[key] || seen[key]) { return; }
    seen[key] = true;
    const entry = buildOperation(block, project);
    history.push({ path: entry.path, method: entry.method, operation: entry.operation });
  });

  return {
    version: mainVersion,
    versions: versions,
    document: documents[mainVersion],
    documents: documents,
    history: history,
  };
}

module.exports = {
  build: build,
  OPENAPI_VERSION: OPENAPI_VERSION,
};
