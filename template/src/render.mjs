/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
import { html, raw, nl2br, inlineLinks, underscoreToSpace, escapeHtml } from './dom.mjs';
import { __ } from './locales/locale.mjs';
import { bodySample } from './schema.mjs';

const COPY_ATTRS = () => raw(html`data-prismjs-copy="${__('Copy')}" data-prismjs-copy-error="${__('Press Ctrl+C to copy')}" data-prismjs-copy-success="${__('copied!')}"`);

function nestObject (row) {
  return raw('&nbsp;&nbsp;'.repeat(row.depth || 0) + escapeHtml(row.key));
}

export function reformat (source, type) {
  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(String(source).trim()), null, '    ');
    } catch (e) {
      return source;
    }
  }
  return source;
}

export function setInputType (type) {
  switch (type) {
    case 'File':
    case 'Email':
    case 'Color':
    case 'Number':
    case 'Date':
      return type[0].toLowerCase() + type.substring(1);
    case 'Boolean':
      return 'checkbox';
    default:
      return 'text';
  }
}

export function hasTypeInFields (fields) {
  return Object.keys(fields || {}).some(name => fields[name].some(item => item.type));
}

export function renderSidenav (nav) {
  return html`
<nav id="scrollingNav" class="col-sm-3 col-lg-2 sidebar-offcanvas">
  <div class="nav-toggle visible-xs">
    <button type="button" class="btn btn-link" data-toggle="offcanvas">
        <span class="sr-only">${__('Toggle navigation')}</span>
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
    </button>
  </div>
  <div class="sidenav-search">
    <input class="form-control search" data-action="filter-search" type="text" placeholder="${__('Filter...')}">
    <span class="search-reset">x</span>
  </div>
  <ul class="sidenav nav nav-list list">
  ${nav.filter(item => item.title).map(item => {
    if (item.isHeader && item.isFixed) {
      return html`<li class="nav-fixed nav-header navbar-btn nav-list-item" data-group="${item.group}"><a href="#api-${item.group}" data-name="show-api-${item.group}" class="show-api api-${item.group}-init">${underscoreToSpace(item.title)}</a></li>`;
    }
    if (item.isHeader) {
      return html`<li class="nav-header nav-list-item" data-group="${item.group}"><a href="#api-${item.group}" data-group="show-api-${item.group}" class="show-group api-${item.group}-init">${underscoreToSpace(item.title)}</a></li>`;
    }
    return html`<li class="${item.hidden ? 'hide' : ''}" data-group="${item.group}" data-name="${item.name}" data-version="${item.version}">
          <a href="#api-${item.group}-${item.name}" title="${item.url}" data-group="show-api-${item.group}" data-name="show-api-${item.group}-${item.name}" class="nav-list-item show-api api-${item.group}-${item.name}-init">${item.title}<div class="nav-list-url-item hide">${item.url}</div></a>
        </li>`;
  })}
  </ul>
</nav>`;
}

export function renderProject (project) {
  const template = project.template || {};
  return html`
  <div class="pull-left">
    <h1>${project.name}</h1>
    ${project.description ? html`<h2>${raw(nl2br(project.description))}</h2>` : ''}
  </div>
  <div class="pull-right">
    ${template.withCompare
      ? html`<div class="btn-group">
      <button id="version" class="btn btn-lg btn-default dropdown-toggle" data-toggle="dropdown">
        <strong>${project.version}</strong>&nbsp;<span class="caret"></span>
      </button>
      <ul id="versions" class="dropdown-menu open-left">
        <li><a id="compareAllWithPredecessor" href="#">${__('Compare all with predecessor')}</a></li>
        <li class="divider"></li>
        <li class="disabled"><a href="#">${__('show up to version:')}</a></li>
      ${(project.versions || []).map(version => html`<li class="version"><a href="#">${version}</a></li>`)}
      </ul>
    </div>`
      : html`<div id="version" class="well well-sm">
      <strong>${project.version}</strong>
    </div>`}
  </div>
  <div class="clearfix"></div>`;
}

export function renderHeader (header) {
  if (!header || !header.content) { return raw(''); }
  return html`<div id="api-_header" class="show-api-article show-api-_-article">${raw(header.content)}</div>`;
}

export function renderFooter (footer) {
  if (!footer || !footer.content) { return raw(''); }
  return html`<div id="api-_footer" class="show-api-article show-api-_-article">${raw(footer.content)}</div>`;
}

export function renderGenerator (project) {
  const generator = project.generator;
  if (!project.template || !project.template.withGenerator || !generator) { return raw(''); }
  return html`
      <div>
        <p class="text-muted">
          ${__('Generated with')} <a href="${generator.url}">${generator.name}</a> ${generator.version} - ${generator.time}
        </p>
      </div>`;
}

export function renderSection (fields) {
  return html`
  <section id="api-${fields.group}" class="show-api-group show-api-${fields.group}-group ${fields.aloneDisplay ? ' hide' : ''}">
    <h1 class="color-primary font-weight-bold">${underscoreToSpace(fields.title)}</h1>
    ${fields.description ? html`<p>${raw(nl2br(fields.description))}</p>` : ''}
    ${fields.articles.map(item => html`
      <div id="api-${item.group}-${item.name}" class="show-api-article show-api-${item.group}-article show-api-${item.group}-${item.name}-article ${fields.aloneDisplay ? ' hide' : ''}">
        ${raw(item.article)}
      </div>`)}
  </section>`;
}

function renderExampleTabs (examples, prefix, id, reformatJson) {
  if (!examples || !examples.length) { return raw(''); }
  return html`
      <ul class="nav nav-tabs nav-tabs-examples" role="tablist">
        ${examples.map((example, index) => html`
          <li${index === 0 ? raw(' class="active"') : ''}>
            <a href="#${prefix}-${id}-${index}" role="tab" data-toggle="tab">${example.title}</a>
          </li>`)}
      </ul>

      <div class="tab-content">
      ${examples.map((example, index) => html`
        <div class="tab-pane${index === 0 ? ' active' : ''}" id="${prefix}-${id}-${index}">
          <pre data-type="${example.type}" ${COPY_ATTRS()}><code class="language-${example.type}">${reformatJson ? reformat(example.content, example.type) : example.content}</code></pre>
        </div>`)}
      </div>`;
}

function renderRowDetails (row) {
  return html`
            ${raw(nl2br(row.description))}
            ${row.defaultValue ? html`<p class="default-value">${__('Default value:')} <code>${raw(row.defaultValue)}</code></p>` : ''}
            ${row.size ? html`<p class="type-size">${__('Size range:')} <code>${raw(row.size)}</code></p>` : ''}
            ${row.allowedValues && row.allowedValues.length
              ? html`<p class="type-size">${__('Allowed values:')}
              ${row.allowedValues.map((value, index) => html`<code>${raw(String(value))}</code>${index < row.allowedValues.length - 1 ? ', ' : ''}`)}
              </p>`
              : ''}`;
}

function renderOptionalLabel (row, template) {
  if (row.optional) {
    return html`<span class="label optional">${__('optional')}</span>`;
  }
  if (template && template.showRequiredLabels) {
    return html`<span class="label required">${__('required')}</span>`;
  }
  return raw('');
}

function renderTable (rows, options) {
  const hasType = options.hasType;
  return html`
      <table>
        <thead>
          <tr>
          <th style="width: 30%">${options.col1 ? __(options.col1) : __('Field')}</th>
            ${hasType ? html`<th style="width: 10%">${__('Type')}</th>` : ''}
            <th style="width: ${hasType ? '60%' : '70%'}">${__('Description')}</th>
          </tr>
        </thead>
        <tbody>
        ${rows.map(row => html`
          <tr>
            <td class="code">
            ${nestObject(row)}
              ${renderOptionalLabel(row, options.template)}
            </td>
            ${hasType ? html`<td class="code">${raw(row.type)}</td>` : ''}
            <td>${renderRowDetails(row)}
            </td>
          </tr>`)}
        </tbody>
      </table>`;
}

// Grouped tables for header, parameter, success and error sections
export function renderParamBlock (params, options) {
  if (!params) { return raw(''); }
  const fields = params.fields || {};
  return html`
    ${Object.keys(fields).map(group => html`
      <h2>${__(group)}</h2>
      ${renderTable(fields[group], { hasType: options.hasType, col1: options.col1, template: options.template })}`)}
    ${renderExampleTabs(params.examples, options.section + '-examples', options.id, true)}`;
}

export function renderQueryBlock (rows, options) {
  if (!rows || !rows.length) { return raw(''); }
  return html`
    <h2>${__('Query Parameter(s)')}</h2>
    ${renderTable(rows, { hasType: true, template: options.template })}`;
}

export function renderBodyBlock (rows, options) {
  if (!rows || !rows.length) { return raw(''); }
  return html`
    <h2>${__('Request Body')}</h2>
    ${renderTable(rows, { hasType: true, template: options.template })}`;
}

function renderSelect (row, family) {
  return html`
                  <div class="input-group-addon sample-request-select">
                    <select class="form-control" data-name="${row.bracket}" data-family="${family}" ${row.optional ? raw('data-optional="true"') : ''}>
                      <option value="" class="empty">&lt;${__('No value')}&gt;</option>
                      ${row.allowedValues.map(value => html`<option ${String(row.defaultValue) === String(value) ? raw('selected ') : ''}value="${String(value).replace(/"/g, '')}">${String(value).replace(/"/g, '')}</option>`)}
                    </select>
                  </div>
                  <input class="invisible">`;
}

function renderInput (row, family, cssClass) {
  const type = setInputType(row.type);
  const isBoolean = row.type === 'Boolean';
  const defaultValue = row.defaultValue || '';
  return html`
                  <div class="sample-request-input-${row.type || 'String'}-container"><div>
                  <input id="sample-request-${family}-field-${row.field}"
                    class="${isBoolean ? '' : 'form-control'} ${cssClass}"
                    type="${type}"
                    value="${isBoolean ? '' : defaultValue}"
                    ${isBoolean && defaultValue === 'true' ? raw('checked') : ''}
                    placeholder="${defaultValue}"
                    data-name="${row.bracket}"
                    data-family="${family}"
                    ${row.optional ? raw('data-optional="true"') : ''}>
                  </div></div>`;
}

function renderFieldInputs (rows, family, cssClass, options) {
  const opts = options || {};
  return rows.filter(row => !row.isObject && (!row.type || row.type.indexOf('Object') !== 0)).map(row => html`
              <div class="form-group">
                <label class="col-md-3 control-label" for="sample-request-${family}-field-${row.field}">${row.field}${opts.showOptional && row.optional ? html` (${__('optional')})` : ''}</label>
                <div class="input-group${opts.wide ? ' col-md-6' : ''}">
                  <div class="input-group-addon">${raw(row.type)}</div>
                  ${row.allowedValues && row.allowedValues.length ? renderSelect(row, family) : renderInput(row, family, cssClass)}
                </div>
              </div>`);
}

export function renderSampleRequest (article, id) {
  if (!article.sampleRequest) { return raw(''); }
  const headerRows = [];
  Object.keys(article.header && article.header.fields ? article.header.fields : {}).forEach(group => {
    headerRows.push.apply(headerRows, article.header.fields[group]);
  });
  const paramRows = [];
  Object.keys(article.parameter && article.parameter.fields ? article.parameter.fields : {}).forEach(group => {
    paramRows.push.apply(paramRows, article.parameter.fields[group]);
  });
  return html`
    <div class="well">
      <h3>${__('Send a Sample Request')}</h3>
      <form class="form-horizontal">
        <fieldset>
          <div class="form-group">
            <label class="col-md-3 control-label" for="${id}-sample-request-url">URL</label>
            <div class="input-group">
              <span class="input-group-addon">${__('url')}</span>
              <input id="${id}-sample-request-url" type="url" class="form-control sample-request-url" value="${article.sampleRequest}" />
            </div>
          </div>

      ${headerRows.length
        ? html`
          <h3>${__('Headers')}</h3>
            <div class="${id}-sample-request-header-fields">
              ${headerRows.map(row => html`
              <div class="form-group">
                <label class="col-md-3 control-label" for="sample-request-header-field-${row.field}">${row.field}</label>
                <div class="input-group">
                  <span class="input-group-addon">${raw(row.type)}</span>
                  <input type="text" id="sample-request-header-field-${row.field}"
                    class="form-control sample-request-input"
                    value="${row.defaultValue || ''}"
                    placeholder="${row.defaultValue || row.field}"
                    data-family="header"
                    data-name="${row.field}"
                    ${row.optional ? raw('data-optional="true"') : ''}>
                </div>
              </div>`)}
            </div>`
        : ''}

      ${paramRows.length
        ? html`
          <h3>${__('Parameters')}</h3>
            <div class="${id}-sample-request-param-fields">
              ${renderFieldInputs(paramRows, 'query', 'sample-request-param sample-request-input')}
            </div>`
        : ''}

      ${article.query && article.query.length
        ? html`
        <h3>${__('Query Parameters')}</h3>
        <div class="${id}-sample-request-query-fields">
          ${renderFieldInputs(article.query, 'query', 'sample-request-input', { showOptional: true, wide: true })}
        </div>`
        : ''}

      ${article.body && article.body.length
        ? html`
        <h3>${__('Body')}</h3>

        <div class="col-md-3">
          <label for="body-content-type-${id}">${__('Content-Type')}</label>
          <select id="body-content-type-${id}" data-id="${id}" class="sample-request-content-type-switch form-control">
            <option value="body-json" selected>json</option>
            <option value="body-form-data">form-data</option>
          </select>
        </div>

        <div class="col-md-9" id="sample-request-body-json-input-${id}">
          <div class="form-group">
            <div class="input-group">
              <div class="input-group-addon">json</div>
              <textarea class="form-control sample-request-input" rows="6"
                data-family="body-json"
                data-name="body"
                data-content-type="json">${bodySample(article.bodySchema)}</textarea>
            </div>
          </div>
        </div>

        <div hidden class="col-md-9" id="sample-request-body-form-input-${id}">
          ${renderFieldInputs(article.body, 'body', 'sample-request-input')}
        </div>`
        : ''}

          <div class="form-group">
            <div class="controls pull-right">
              <button class="btn btn-primary bg-primary sample-request-send" data-type="${article.type}">${__('Send')}</button>
              <button class="btn btn-danger bg-red sample-request-clear" data-type="${article.type}">${__('Reset')}</button>
            </div>
          </div>
          <div class="form-group sample-request-response" hidden>
            <h3>
              ${__('Response')}
              <button class="btn btn-default btn-xs pull-right sample-request-clear">X</button>
            </h3>
            <pre data-type="json" ${COPY_ATTRS()}><code class="language-json sample-request-response-json"></code></pre>
          </div>
        </fieldset>
      </form>
    </div>`;
}

function renderPermission (permission) {
  if (!permission || !permission.length) { return raw(''); }
  return html`
      <p>
        ${__('Permission:')}
        ${permission.map(entry => html`
          ${entry.name}
          ${entry.title
            ? html`<button type="button" class="btn btn-info btn-xs" data-title="${entry.title}" data-content="${nl2br(entry.description)}" data-html="true" data-toggle="popover" data-placement="right" data-trigger="hover">
              <span class="glyphicon glyphicon-info-sign" aria-hidden="true"></span>
          </button>`
            : ''}`)}
      </p>`;
}

export function renderVersionDropdown (article, versions, label) {
  return html`
      <div class="btn-group">
        <button class="version btn btn-default dropdown-toggle" data-toggle="dropdown">
          <strong>${article.version}</strong>&nbsp;<span class="caret"></span>
        </button>
        <ul class="versions dropdown-menu open-left">
          <li class="disabled"><a href="#">${label}</a></li>
        ${versions.map(version => html`<li class="version"><a href="#">${version}</a></li>`)}
        </ul>
      </div>`;
}

export function renderArticle (fields) {
  const article = fields.article;
  const template = fields.template || {};
  const id = fields.id;
  return html`
  <article id="api-${article.group}-${article.name}-${article.version}" ${fields.hidden ? raw('class="hide"') : ''} data-group="${article.group}" data-name="${article.name}" data-version="${article.version}">
    <div class="pull-left">
      <h1><span class="color-primary">${underscoreToSpace(article.groupTitle)}</span>${article.title ? html` <span class="text-muted">|</span> ${article.title}` : ''}</h1>
    </div>
    ${template.withCompare
      ? html`<div class="pull-right">
      ${renderVersionDropdown(article, fields.versions, __('compare changes to:'))}
    </div>`
      : ''}
    <div class="clearfix"></div>

    ${article.deprecated
      ? html`<p class="deprecated"><span>${__('DEPRECATED')}</span>
        ${raw(inlineLinks(article.deprecated.content))}
      </p>`
      : ''}

    ${article.description ? html`<p>${raw(nl2br(article.description))}</p>` : ''}
    <span class="method meth-${String(article.type).toLowerCase()}">${article.type}</span>
    <pre data-type="${String(article.type).toLowerCase()}" ${COPY_ATTRS()}><code class="language-http">${article.url}</code></pre>

    ${renderPermission(article.permission)}

    ${renderExampleTabs(article.examples, 'examples', id, false)}

    ${renderParamBlock(article.header, { hasType: fields._hasTypeInHeaderFields, section: 'header', id: id, template: template })}
    ${renderParamBlock(article.parameter, { hasType: fields._hasTypeInParameterFields, section: 'parameter', id: id, template: template })}
    ${renderQueryBlock(article.query, { template: template })}
    ${renderBodyBlock(article.body, { template: template })}
    ${renderParamBlock(article.success, { hasType: fields._hasTypeInSuccessFields, section: 'success', id: id, template: template })}
    ${renderParamBlock(article.error, { hasType: fields._hasTypeInErrorFields, col1: 'Name', section: 'error', id: id, template: template })}

    ${renderSampleRequest(article, id)}
  </article>`;
}
