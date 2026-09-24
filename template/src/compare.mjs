/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
import { html, raw, nl2br, underscoreToSpace, escapeHtml } from './dom.mjs';
import { __ } from './locales/locale.mjs';
import DiffMatchPatch from './diff_match_patch.mjs';
import { renderSampleRequest } from './render.mjs';

const COPY_ATTRS = () => raw(html`data-prismjs-copy="${__('Copy')}" data-prismjs-copy-error="${__('Press Ctrl+C to copy')}" data-prismjs-copy-success="${__('copied!')}"`);

export function showDiff (source, compare, mode) {
  if (source === compare) { return source === undefined || source === null ? '' : String(source); }
  if (!source) { return String(compare); }
  if (!compare) { return String(source); }
  const dmp = new DiffMatchPatch();
  if (mode === 'code') {
    return dmp.diffPrettyCode(dmp.diffLineMode(String(compare), String(source)));
  }
  const diffs = dmp.diffMain(String(compare), String(source));
  dmp.diffCleanupSemantic(diffs);
  let ds = dmp.diffPrettyHtml(diffs).replace(/&para;/gm, '');
  if (mode === 'nl2br') { ds = nl2br(ds); }
  return ds;
}

// Pairs entries of two lists by a key, marking additions and removals
export function pairBy (key, source, compare) {
  const list = [];
  let index = 0;
  (source || []).forEach(sourceEntry => {
    let found = false;
    (compare || []).forEach(compareEntry => {
      if (sourceEntry[key] === compareEntry[key]) {
        list.push({ typeSame: true, source: sourceEntry, compare: compareEntry, index: index });
        found = true;
        index += 1;
      }
    });
    if (!found) {
      list.push({ typeIns: true, source: sourceEntry, index: index });
      index += 1;
    }
  });
  (compare || []).forEach(compareEntry => {
    const found = (source || []).some(sourceEntry => sourceEntry[key] === compareEntry[key]);
    if (!found) {
      list.push({ typeDel: true, compare: compareEntry, index: index });
      index += 1;
    }
  });
  if (list.length) { list[list.length - 1]._last = true; }
  return list;
}

function pairKeys (source, compare) {
  const toList = obj => Object.keys(obj || {}).map(key => ({ key: key, value: obj[key] }));
  return pairBy('key', toList(source), toList(compare));
}

function nestObject (row) {
  return raw('&nbsp;&nbsp;'.repeat(row.depth || 0) + escapeHtml(row.key));
}

function renderPermissionButton (entry) {
  if (!entry.title) { return raw(''); }
  return html`<button type="button" class="btn btn-info btn-xs" data-title="${entry.title}" data-content="${nl2br(entry.description)}" data-html="true" data-toggle="popover" data-placement="right" data-trigger="hover">
            <span class="glyphicon glyphicon-info-sign" aria-hidden="true"></span>
          </button>`;
}

function renderComparePermission (article, compare) {
  const pairs = pairBy('name', article.permission, compare.permission);
  if (!pairs.length) { return raw(''); }
  return html`
  <p>
  ${__('Permission:')}
  ${pairs.map(pair => {
    const entry = pair.source || pair.compare;
    const name = pair.typeIns ? html`<ins>${entry.name}</ins>` : pair.typeDel ? html`<del>${entry.name}</del>` : html`${entry.name}`;
    return html`${name}
        ${renderPermissionButton(entry)}${entry.title && !pair._last ? ', ' : ''}`;
  })}
  </p>`;
}

function renderCompareExamples (source, compare, prefix, id) {
  const pairs = pairBy('title', source, compare);
  if (!pairs.length) { return raw(''); }
  return html`
    <ul class="nav nav-tabs nav-tabs-examples" role="tablist">
    ${pairs.map(pair => {
      const active = pair.index === 0 ? raw(' class="active"') : '';
      if (pair.typeSame) {
        return html`<li${active}><a href="#${prefix}-${id}-${pair.index}" role="tab" data-toggle="tab">${raw(showDiff(pair.source.title, pair.compare.title))}</a></li>`;
      }
      if (pair.typeIns) {
        return html`<li${active}><a href="#${prefix}-${id}-${pair.index}" role="tab" data-toggle="tab"><ins>${pair.source.title}</ins></a></li>`;
      }
      return html`<li${active}><a href="#${prefix}-${id}-${pair.index}" role="tab" data-toggle="tab"><del>${pair.compare.title}</del></a></li>`;
    })}
    </ul>

    <div class="tab-content">
    ${pairs.map(pair => {
      const active = pair.index === 0 ? ' active' : '';
      if (pair.typeSame) {
        return html`<div class="tab-pane${active}" id="${prefix}-${id}-${pair.index}">
          <pre data-type="${pair.source.type}" ${COPY_ATTRS()}><code class="language-diff-${pair.source.type} diff-highlight">${raw(escapeHtml(showDiff(pair.source.content, pair.compare.content, 'code')))}</code></pre>
        </div>`;
      }
      const entry = pair.source || pair.compare;
      return html`<div class="tab-pane${active}" id="${prefix}-${id}-${pair.index}">
          <pre data-type="${entry.type}" ${COPY_ATTRS()}><code class="language-${entry.type}">${entry.content}</code></pre>
        </div>`;
    })}
    </div>`;
}

function renderOptional (pair) {
  const source = pair.source;
  const compare = pair.compare;
  if (pair.typeSame) {
    if (source.optional) {
      return compare.optional
        ? html` <span class="label label-optional">${__('optional')}</span>`
        : html` <span class="label label-optional label-ins">${__('optional')}</span>`;
    }
    return compare.optional ? html` <span class="label label-optional label-del">${__('optional')}</span>` : raw('');
  }
  if (pair.typeIns) {
    return source.optional ? html` <span class="label label-optional label-ins">${__('optional')}</span>` : raw('');
  }
  return compare.optional ? html` <span class="label label-optional label-del">${__('optional')}</span>` : raw('');
}

function renderCompareRows (source, compare, hasType) {
  const pairs = pairBy('field', source, compare);
  return html`
  <tbody>
    ${pairs.map(pair => {
      if (pair.typeSame) {
        const s = pair.source;
        const c = pair.compare;
        let typeCell = raw('');
        if (s.type && c.type) {
          typeCell = html`<td>${raw(showDiff(s.type, c.type))}</td>`;
        } else if (s.type || c.type) {
          typeCell = html`<td>${raw(s.type || c.type)}</td>`;
        } else if (hasType) {
          typeCell = html`<td></td>`;
        }
        return html`
        <tr>
          <td class="code">
            ${nestObject(s)}
            ${renderOptional(pair)}
          </td>
          ${typeCell}
          <td>
            ${raw(showDiff(s.description, c.description, 'nl2br'))}
            ${s.defaultValue ? html`<p class="default-value">${__('Default value:')} <code>${raw(showDiff(s.defaultValue, c.defaultValue))}</code></p>` : ''}
          </td>
        </tr>`;
      }
      const row = pair.source || pair.compare;
      const cssClass = pair.typeIns ? 'ins' : 'del';
      return html`
        <tr class="${cssClass}">
          <td class="code">
            ${nestObject(row)}
            ${renderOptional(pair)}
          </td>
          ${row.type ? html`<td>${raw(row.type)}</td>` : hasType ? html`<td></td>` : ''}
          <td>
            ${raw(nl2br(row.description))}
            ${row.defaultValue ? html`<p class="default-value">${__('Default value:')} <code>${raw(row.defaultValue)}</code></p>` : ''}
          </td>
        </tr>`;
    })}
  </tbody>`;
}

function renderTableHead (hasType, col1) {
  return html`
        <thead>
          <tr>
            <th style="width: 30%">${col1 ? __(col1) : __('Field')}</th>
            ${hasType ? html`<th style="width: 10%">${__('Type')}</th>` : ''}
            <th style="width: ${hasType ? '60%' : '70%'}">${__('Description')}</th>
          </tr>
        </thead>`;
}

function renderCompareParamBlock (source, compare, options) {
  if (!source && !compare) { return raw(''); }
  const sourceFields = source ? source.fields : undefined;
  const compareFields = compare ? compare.fields : undefined;
  const pairs = pairKeys(sourceFields, compareFields);
  return html`
    ${pairs.map(pair => {
      if (pair.typeSame) {
        return html`
        <h2>${__(pair.source.key)}</h2>
        <table>
        ${renderTableHead(options.hasType, options.col1)}
        ${renderCompareRows(pair.source.value, pair.compare.value, options.hasType)}
        </table>`;
      }
      if (pair.typeIns) {
        return html`
        <h2><ins>${__(pair.source.key)}</ins></h2>
        <table class="ins">
        ${renderTableHead(options.hasType, options.col1)}
        ${renderCompareRows(pair.source.value, pair.source.value, options.hasType)}
        </table>`;
      }
      return html`
        <h2><del>${__(pair.compare.key)}</del></h2>
        <table class="del">
        ${renderTableHead(options.hasType, options.col1)}
        ${renderCompareRows(pair.compare.value, pair.compare.value, options.hasType)}
        </table>`;
    })}
    ${renderCompareExamples(source ? source.examples : undefined, compare ? compare.examples : undefined, options.section + '-compare-examples', options.id)}`;
}

function renderCompareList (source, compare, title) {
  if (!source && !compare) { return raw(''); }
  return html`
    <h2>${__(title)}</h2>
    <table class="table table-hover">
      ${renderTableHead(true)}
      ${renderCompareRows(source, compare, true)}
    </table>`;
}

export function renderCompareArticle (fields) {
  const article = fields.article;
  const compare = fields.compare;
  const id = fields.id;
  return html`
  <article id="api-${article.group}-${article.name}-${article.version}" ${fields.hidden ? raw('class="hide"') : ''} data-group="${article.group}" data-name="${article.name}" data-version="${article.version}" data-compare-version="${compare.version}">
    <div class="pull-left">
      <h1>${underscoreToSpace(article.groupTitle)} | ${raw(showDiff(article.title, compare.title))}</h1>
    </div>

    <div class="pull-right">
      <div class="btn-group">
        <button class="btn btn-success" disabled>
          <strong>${article.version}</strong> ${__('compared to')}
        </button>
        <button class="version btn btn-danger dropdown-toggle" data-toggle="dropdown">
          <strong>${compare.version}</strong>&nbsp;<span class="caret"></span>
        </button>
        <ul class="versions dropdown-menu open-left">
          <li class="disabled"><a href="#">${__('compare changes to:')}</a></li>
          <li class="divider"></li>
        ${fields.versions.map(version => html`<li class="version"><a href="#">${version}</a></li>`)}
        </ul>
      </div>
    </div>
    <div class="clearfix"></div>

    ${article.description
      ? html`<p>${raw(showDiff(article.description, compare.description, 'nl2br'))}</p>`
      : compare.description ? html`<p>${raw(showDiff('', compare.description, 'nl2br'))}</p>` : ''}

    <span class="method meth-${String(compare.type).toLowerCase()}">${compare.type}</span>
    <pre data-type="${String(article.type).toLowerCase()}" ${COPY_ATTRS()} class="language-html">${raw(showDiff(article.url, compare.url))}</pre>

    ${renderComparePermission(article, compare)}

    ${renderCompareExamples(article.examples, compare.examples, 'compare-examples', id)}

    ${renderCompareParamBlock(article.header, compare.header, { hasType: fields._hasTypeInHeaderFields, section: 'header', id: id })}
    ${renderCompareParamBlock(article.parameter, compare.parameter, { hasType: fields._hasTypeInParameterFields, section: 'parameter', id: id })}
    ${renderCompareList(article.query, compare.query, 'Query Parameter(s)')}
    ${renderCompareList(article.body, compare.body, 'Request Body')}
    ${renderCompareParamBlock(article.success, compare.success, { hasType: fields._hasTypeInSuccessFields, section: 'success', id: id })}
    ${renderCompareParamBlock(article.error, compare.error, { hasType: fields._hasTypeInErrorFields, col1: 'Name', section: 'error', id: id })}

    ${renderSampleRequest(article, id)}
  </article>`;
}
