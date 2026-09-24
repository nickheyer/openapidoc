/** openapidoc template main.js */

import semver from 'semver';

// Prism is the syntax highlighting lib
import Prism from 'prismjs';
// languages highlighted by Prism
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-python';
import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
import 'prismjs/plugins/diff-highlight/prism-diff-highlight';

import { initSampleRequest } from './send_sample_request.js';
import { __, setLanguage } from './locales/locale.mjs';
import { buildModel } from './model.mjs';
import { qs, qsa, on, nodesFrom } from './dom.mjs';
import { initDropdowns, initTabs, initPopovers, initOffcanvas, showFirstTabs, createScrollSpy } from './ui.mjs';
import * as render from './render.mjs';
import { renderCompareArticle } from './compare.mjs';

document.addEventListener('DOMContentLoaded', () => {
  init();
  initSampleRequest();
  Prism.highlightAll();
});

function readJson (id) {
  const element = document.getElementById(id);
  if (!element) { return null; }
  try {
    return JSON.parse(element.textContent);
  } catch (e) {
    return null;
  }
}

function append (target, markup) {
  target.appendChild(nodesFrom(markup));
}

function init () {
  // the OpenAPI document and the project settings are inlined by the writer
  const spec = readJson('openapidoc-spec') || { openapi: '3.2.0', info: { title: 'API', version: '0.0.0' }, paths: {} };
  const history = readJson('openapidoc-history') || [];
  const apiProject = readJson('openapidoc-config') || {};

  const defaultTemplateOptions = {
    aloneDisplay: false,
    showRequiredLabels: false,
    withGenerator: true,
    withCompare: true,
  };
  apiProject.template = Object.assign(defaultTemplateOptions, apiProject.template || {});

  if (apiProject.template.forceLanguage) { setLanguage(apiProject.template.forceLanguage); }

  const info = spec.info || {};
  if (!apiProject.name) { apiProject.name = info.title; }
  if (!apiProject.version && info.version) { apiProject.version = info.version; }
  if (!apiProject.description && info.summary) { apiProject.description = info.summary; }
  if (!apiProject.header && info.description) {
    apiProject.header = { title: spec['x-apidoc-header'] ? spec['x-apidoc-header'].title : undefined, content: info.description };
  }
  if (!apiProject.footer && spec['x-apidoc-footer']) { apiProject.footer = spec['x-apidoc-footer']; }

  const model = buildModel(spec, history, apiProject);
  const api = model.entries;
  const apiByGroupAndName = model.byGroupAndName;
  const apiGroups = model.groups.map(group => group.name);
  const apiGroupTitles = {};
  const apiGroupDescriptions = {};
  model.groups.forEach(group => {
    apiGroupTitles[group.name] = group.title;
    apiGroupDescriptions[group.name] = group.description;
  });
  const apiVersions = model.versions;

  initDropdowns();
  initTabs();
  initPopovers();
  initOffcanvas();

  //
  // create Navigationlist
  //
  const nav = [];
  apiGroups.forEach(group => {
    nav.push({ group: group, isHeader: true, title: apiGroupTitles[group] });
    let oldName = '';
    api.forEach(entry => {
      if (entry.group === group) {
        nav.push({
          title: entry.title,
          group: group,
          hidden: oldName === entry.name,
          name: entry.name,
          type: entry.type,
          version: entry.version,
          url: entry.path,
        });
        oldName = entry.name;
      }
    });
  });

  /**
   * Add navigation items by analyzing the HTML content and searching for h1 and h2 tags
   * @return boolean true if any good-looking (i.e. with a group identifier) <h1> tag was found
   */
  function addNav (nav, content, index) {
    let foundLevel1 = false;
    if (!content) { return foundLevel1; }
    const topics = content.match(/<h(1|2).*?>(.+?)<\/h(1|2)>/gi);
    if (topics) {
      topics.forEach(entry => {
        const level = entry.substring(2, 3);
        const title = entry.replace(/<.+?>/g, '');
        const entryTags = entry.match(/id="api-([^-]+)(?:-(.+))?"/);
        const group = entryTags ? entryTags[1] : null;
        const name = entryTags ? entryTags[2] : null;
        if (level === '1' && title && group) {
          nav.splice(index, 0, { group: group, isHeader: true, title: title, isFixed: true });
          index++;
          foundLevel1 = true;
        }
        if (level === '2' && title && group && name) {
          nav.splice(index, 0, { group: group, name: name, isHeader: false, title: title, isFixed: false, version: '1.0' });
          index++;
        }
      });
    }
    return foundLevel1;
  }

  if (apiProject.header) {
    const foundLevel1 = addNav(nav, apiProject.header.content, 0);
    if (!foundLevel1) {
      nav.unshift({ group: '_header', isHeader: true, title: apiProject.header.title == null ? __('General') : apiProject.header.title, isFixed: true });
    }
  }

  if (apiProject.footer) {
    const lastNavIndex = nav.length;
    const foundLevel1 = addNav(nav, apiProject.footer.content, nav.length);
    if (!foundLevel1 && apiProject.footer.title != null) {
      nav.splice(lastNavIndex, 0, { group: '_footer', isHeader: true, title: apiProject.footer.title, isFixed: true });
    }
  }

  // render pagetitle
  document.title = apiProject.title ? apiProject.title : 'apiDoc: ' + apiProject.name + ' - ' + apiProject.version;

  // remove loader
  const loader = qs('#loader');
  if (loader) { loader.remove(); }

  append(qs('#sidenav'), render.renderSidenav(nav));
  append(qs('#generator'), render.renderGenerator(apiProject));
  apiProject.versions = apiVersions;
  append(qs('#project'), render.renderProject(apiProject));

  if (apiProject.header) { append(qs('#header'), render.renderHeader(apiProject.header)); }
  if (apiProject.footer) {
    append(qs('#footer'), render.renderFooter(apiProject.footer));
    if (apiProject.template.aloneDisplay) {
      const footer = document.getElementById('api-_footer');
      if (footer) { footer.classList.add('hide'); }
    }
  }

  //
  // Render Sections and Articles
  //
  const articleVersions = {};
  let content = '';
  apiGroups.forEach(groupEntry => {
    const articles = [];
    let oldName = '';
    articleVersions[groupEntry] = {};

    api.forEach(entry => {
      if (groupEntry !== entry.group) { return; }
      if (!articleVersions[groupEntry][entry.name]) {
        articleVersions[groupEntry][entry.name] = apiByGroupAndName[groupEntry][entry.name].map(item => item.version);
      }
      const fields = {
        article: entry,
        hidden: oldName === entry.name,
        versions: articleVersions[groupEntry][entry.name],
      };
      addArticleSettings(fields, entry);
      articles.push({ article: render.renderArticle(fields).toString(), group: entry.group, name: entry.name });
      oldName = entry.name;
    });

    content += render.renderSection({
      group: groupEntry,
      title: apiGroupTitles[groupEntry] || groupEntry,
      description: apiGroupDescriptions[groupEntry] || '',
      articles: articles,
      aloneDisplay: apiProject.template.aloneDisplay,
    }).toString();
  });
  append(qs('#sections'), content);

  let scrollSpy = null;
  if (!apiProject.template.aloneDisplay) {
    scrollSpy = createScrollSpy(qs('#scrollingNav'), 10);
  }

  // Content-Scroll on Navigation click.
  on(qs('#sidenav'), 'click', '.sidenav a', function (event, link) {
    event.preventDefault();
    const id = link.getAttribute('href');
    if (apiProject.template.aloneDisplay) {
      const active = qs('.sidenav > li.active');
      if (active) { active.classList.remove('active'); }
      link.parentNode.classList.add('active');
    } else {
      const el = qs(id);
      if (el) { window.scrollTo({ top: el.offsetTop, behavior: 'smooth' }); }
    }
    window.location.hash = id;
  });

  function hasTypeInFields (fields) {
    return render.hasTypeInFields(fields);
  }

  /**
   * On Template changes, recall plugins.
   */
  function initDynamic () {
    const version = qs('#version strong').textContent;
    qsa('#sidenav li').forEach(li => li.classList.remove('is-new'));
    if (apiProject.template.withCompare) {
      qsa(`#sidenav li[data-version="${version}"]`).forEach(li => {
        const group = li.dataset.group;
        const name = li.dataset.name;
        const siblings = qsa(`#sidenav li[data-group="${group}"][data-name="${name}"]`);
        const index = siblings.indexOf(li);
        if (siblings.length === 1 || index === siblings.length - 1) { li.classList.add('is-new'); }
      });
    }

    showFirstTabs(document);

    if (scrollSpy) { scrollSpy.refresh(); }

    if (apiProject.template.aloneDisplay) {
      const hashVal = decodeURI(window.location.hash);
      if (hashVal != null && hashVal.length !== 0) {
        const selected = qs('#version').textContent.trim();
        const el = qs(`li .${hashVal.slice(1)}-init`);
        const elVersioned = qs(`li[data-version="${selected}"] .show-api.${hashVal.slice(1)}-init`);
        const targetEl = elVersioned || el;
        if (targetEl) { targetEl.click(); }
      }
    }
  }

  // switch content-type for body inputs (json or form-data)
  on(document, 'change', '.sample-request-content-type-switch', (event, select) => {
    const jsonInput = document.getElementById('sample-request-body-json-input-' + select.dataset.id);
    const formInput = document.getElementById('sample-request-body-form-input-' + select.dataset.id);
    const useForm = select.value === 'body-form-data';
    if (jsonInput) { jsonInput.hidden = useForm; }
    if (formInput) { formInput.hidden = !useForm; }
  });

  if (apiProject.template.aloneDisplay) {
    on(document, 'click', '.show-group', (event, link) => {
      const group = link.getAttribute('data-group').replace(/^show-api-/, '');
      qsa('.show-api-group').forEach(el => el.classList.add('hide'));
      qsa(`.show-api-${group}-group`).forEach(el => el.classList.remove('hide'));
      qsa('.show-api-article').forEach(el => el.classList.add('hide'));
      qsa(`.show-api-${group}-article`).forEach(el => el.classList.remove('hide'));
    });

    on(document, 'click', '.show-api', (event, link) => {
      const id = link.getAttribute('href').substring(1);
      const selectedVersion = qs('#version').textContent.trim();
      const apiName = `.${link.dataset.name}-article`;
      const apiNameVersioned = `[id="${id}-${selectedVersion}"]`;
      const apiGroup = `.${link.dataset.group}-group`;

      qsa('.show-api-group').forEach(el => el.classList.add('hide'));
      qsa(apiGroup).forEach(el => el.classList.remove('hide'));
      qsa('.show-api-article').forEach(el => el.classList.add('hide'));

      let targetEl = qsa(apiName);
      const versioned = qs(apiNameVersioned);
      if (versioned) { targetEl = [versioned.parentNode]; }
      targetEl.forEach(el => el.classList.remove('hide'));

      if (id.match(/_(header|footer)/)) {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('hide'); }
      }
    });
  }

  //
  // Change Main Version
  //
  function setMainVersion (selectedVersion) {
    if (typeof selectedVersion === 'undefined') {
      selectedVersion = qs('#version strong').textContent;
    } else {
      qs('#version strong').textContent = selectedVersion;
    }

    // hide all
    qsa('article').forEach(el => el.classList.add('hide'));
    qsa('#sidenav li:not(.nav-fixed)').forEach(el => el.classList.add('hide'));

    // show 1st equal or lower Version of each entry
    const shown = {};
    qsa('article[data-version]').forEach(el => {
      const group = el.dataset.group;
      const name = el.dataset.name;
      const version = el.dataset.version;
      const id = group + name;

      if (!shown[id] && versionLte(version, selectedVersion)) {
        shown[id] = true;
        el.classList.remove('hide');
        const navItem = qs(`#sidenav li[data-group="${group}"][data-name="${name}"][data-version="${version}"]`);
        if (navItem) { navItem.classList.remove('hide'); }
        const navHeader = qs(`#sidenav li.nav-header[data-group="${group}"]`);
        if (navHeader) { navHeader.classList.remove('hide'); }
      }
    });

    // hide groups without any visible article
    apiGroups.forEach(group => {
      const section = document.getElementById('api-' + group);
      if (!section) { return; }
      section.classList.remove('hide');
      const visible = qsa('article', section).some(el => el.offsetParent !== null);
      if (!visible) { section.classList.add('hide'); }
    });
  }

  function versionLte (a, b) {
    if (semver.valid(a) && semver.valid(b)) { return semver.lte(a, b); }
    return a <= b;
  }

  setMainVersion();

  on(qs('#project'), 'click', '#versions li.version a', function (event, link) {
    event.preventDefault();
    setMainVersion(link.textContent);
    initDynamic();
  });

  // compare all article with their predecessor
  on(qs('#project'), 'click', '#compareAllWithPredecessor', changeAllVersionCompareTo);

  // change version of an article
  on(qs('#sections'), 'click', 'article .versions li.version a', changeVersionCompareTo);

  // compare url-parameter
  function urlParam (name) {
    const results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
    return results && results[1] ? results[1] : null;
  }

  if (urlParam('compare')) {
    changeAllVersionCompareTo(new Event('click'));
  }

  // Quick jump on page load to hash position, after version and compare are settled
  if (window.location.hash) {
    const id = decodeURI(window.location.hash);
    const target = id.length > 1 ? qs(id) : null;
    if (target) { window.scrollTo(0, target.getBoundingClientRect().top + window.pageYOffset); }
  }

  /**
   * Set initial focus to search input
   */
  const searchInput = qs('#scrollingNav .sidenav-search input.search');
  if (searchInput) { searchInput.focus(); }

  /**
   * Filter search with a delay to prevent issues with very large projects hogging the browser event loop during the search
   */
  on(qs('#sidenav'), 'keyup', '[data-action="filter-search"]', resetableTimeout(event => {
    const query = event.currentTarget ? event.currentTarget.value.toLowerCase() : qs('[data-action="filter-search"]').value.toLowerCase();
    qsa('.sidenav a.nav-list-item').forEach(el => {
      el.style.display = el.textContent.toLowerCase().indexOf(query) > -1 ? '' : 'none';
    });
  }, 200));

  on(qs('#sidenav'), 'click', 'span.search-reset', () => {
    const input = qs('#scrollingNav .sidenav-search input.search');
    input.value = '';
    input.focus();
    qsa('.sidenav a.nav-list-item').forEach(el => { el.style.display = ''; });
  });

  function resetableTimeout (callback, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(callback.bind(this, ...args), delay || 0);
    };
  }

  function findEntry (group, name, version) {
    return apiByGroupAndName[group][name].filter(entry => entry.version === version)[0];
  }

  /**
   * Change version of an article to compare it to an other version.
   */
  function changeVersionCompareTo (event, link) {
    event.preventDefault();

    const root = link.closest('article');
    const selectedVersion = link.textContent;
    const button = qs('.version', root);
    const currentVersion = qs('strong', button).textContent;
    qs('strong', button).textContent = selectedVersion;

    const group = root.dataset.group;
    const name = root.dataset.name;
    const version = root.dataset.version;
    const compareVersion = root.dataset.compareVersion;

    if (compareVersion === selectedVersion) { return; }
    if (!compareVersion && version === selectedVersion) { return; }

    if ((compareVersion && articleVersions[group][name][0] === selectedVersion) || version === selectedVersion) { // eslint-disable-line no-extra-parens
      resetArticle(group, name, version);
    } else {
      const sourceEntry = findEntry(group, name, version) || {};
      const compareEntry = findEntry(group, name, selectedVersion) || {};

      const fields = {
        article: sourceEntry,
        compare: compareEntry,
        versions: articleVersions[group][name],
      };
      fields.id = (sourceEntry.group + '-' + sourceEntry.name + '-' + sourceEntry.version).replace(/\./g, '_');

      ['header', 'parameter', 'error', 'success'].forEach(section => {
        const key = '_hasTypeIn' + section.charAt(0).toUpperCase() + section.slice(1) + 'Fields';
        fields[key] = Boolean(sourceEntry[section] && hasTypeInFields(sourceEntry[section].fields)) ||
          Boolean(compareEntry[section] && hasTypeInFields(compareEntry[section].fields));
      });

      root.insertAdjacentHTML('afterend', renderCompareArticle(fields).toString());

      const navItem = qs(`#sidenav li[data-group="${group}"][data-name="${name}"][data-version="${currentVersion}"]`);
      if (navItem) { navItem.classList.add('has-modifications'); }

      root.remove();
    }

    initDynamic();
    Prism.highlightAll();
  }

  /**
   * Compare all currently selected Versions with their predecessor.
   */
  function changeAllVersionCompareTo (event) {
    event.preventDefault();
    qsa('article:not(.hide) .versions').forEach(list => {
      const root = list.closest('article');
      const currentVersion = root.dataset.version;
      let found = null;
      qsa('li.version a', list).forEach(link => {
        if (link.textContent < currentVersion && !found) { found = link; }
      });
      if (found) { found.click(); }
    });
  }

  /**
   * Add article settings.
   */
  function addArticleSettings (fields, entry) {
    fields.id = (fields.article.group + '-' + fields.article.name + '-' + fields.article.version).replace(/\./g, '_');
    ['header', 'parameter', 'error', 'success'].forEach(section => {
      if (entry[section] && entry[section].fields) {
        fields['_hasTypeIn' + section.charAt(0).toUpperCase() + section.slice(1) + 'Fields'] = hasTypeInFields(entry[section].fields);
      }
    });
    fields.template = apiProject.template;
  }

  /**
   * Render original Article and remove the current visible Article.
   */
  function resetArticle (group, name, version) {
    const root = qsa(`article[data-group="${group}"][data-name="${name}"]`).filter(el => !el.classList.contains('hide'))[0];
    const entry = findEntry(group, name, version);
    const fields = { article: entry, versions: articleVersions[group][name] };
    addArticleSettings(fields, entry);

    root.insertAdjacentHTML('afterend', render.renderArticle(fields).toString());

    const navItem = qs(`#sidenav li[data-group="${group}"][data-name="${name}"][data-version="${version}"]`);
    if (navItem) { navItem.classList.remove('has-modifications'); }

    root.remove();
  }

  initDynamic();
}
