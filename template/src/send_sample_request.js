/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Authors:
 * Peter Rottmann <rottmann@inveris.de>
 * Nicolas CARPi @ Deltablot
 * Copyright (c) 2013 inveris OHG
 * Licensed under the MIT license.
 */
import UrlProcessor from './sampreq_url_processor';
import { qs, qsa, on, isVisible } from './dom.mjs';

// Prism is the syntax highlighting lib
import Prism from 'prismjs';
// json language
import 'prismjs/components/prism-json';

export function initSampleRequest () {
  on(document, 'click', '.sample-request-send', (event, button) => {
    event.preventDefault();
    const root = button.closest('article');
    if (root) { sendSampleRequest(root, button.dataset.type); }
  });

  on(document, 'click', '.sample-request-clear', (event, button) => {
    event.preventDefault();
    const root = button.closest('article');
    if (root) { clearSampleRequest(root); }
  });

  on(document, 'focusin', '.form-control', (event, input) => input.classList.remove('border-danger'));
  on(document, 'change', '.form-control', (event, input) => input.classList.remove('border-danger'));
}

// Converts path params in the {param} format to the accepted :param format, used before inserting the URL params.
export function convertPathParams (url) {
  return url.replace(/{(.+?)}/g, ':$1');
}

/**
 * Transforms https://example.org/:path/:id in https://example.org/some-path/42
 * Based on query parameters collected
 * @return string
 */
function getHydratedUrl (root, queryParameters) {
  const dryUrl = qs('.sample-request-url', root).value;
  const UrlProc = new UrlProcessor();
  return UrlProc.hydrate(convertPathParams(dryUrl), queryParameters);
}

/**
 * Grab the values from the different inputs
 *
 * @return {
 *   "header": { "name": "some-name", "value": "some-value" },
 *   "query": { "name": "some-name", "value": "some-value" },
 *   "body": { "name": "some-name", "value": "some-value" },
 * }
 */
function collectValues (root) {
  const parameters = { header: {}, query: {}, body: {} };
  ['header', 'query', 'body'].forEach(family => {
    qsa(`[data-family="${family}"]`, root).filter(isVisible).forEach(el => {
      const name = el.dataset.name;
      let value = el.value;
      if (el.type === 'checkbox') {
        if (!el.checked) { return; }
        value = 'on';
      }
      if (!value && !el.dataset.optional && el.type !== 'checkbox') {
        el.classList.add('border-danger');
        return;
      }
      if (value === '' && el.dataset.optional) { return; }
      parameters[family][name] = value;
    });
  });
  const bodyJson = qs('[data-family="body-json"]', root);
  if (bodyJson && isVisible(bodyJson)) {
    parameters.body = bodyJson.value;
    parameters.header['Content-Type'] = 'application/json';
  } else {
    parameters.header['Content-Type'] = 'multipart/form-data';
  }
  return parameters;
}

function prettyResponse (text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 4);
  } catch (e) {
    return text;
  }
}

function sendSampleRequest (root, method) {
  const parameters = collectValues(root);
  const url = getHydratedUrl(root, parameters.query);
  const request = { method: method.toUpperCase(), headers: parameters.header };

  if (parameters.header['Content-Type'] === 'application/json') {
    request.body = parameters.body;
  } else {
    // form-data is flat, use json for nested structures
    const formData = new FormData();
    Object.keys(parameters.body).forEach(name => formData.append(name, parameters.body[name]));
    request.body = formData;
    // let the browser generate the multipart boundary
    delete request.headers['Content-Type'];
  }
  if (request.method === 'GET' || request.method === 'HEAD') { delete request.body; }

  const responseBox = qs('.sample-request-response', root);
  const output = qs('.sample-request-response-json', root);
  responseBox.hidden = false;
  responseBox.style.opacity = '1';
  output.textContent = 'Loading...';

  fetch(url, request).then(response => {
    return response.text().then(text => {
      if (response.ok) {
        output.textContent = prettyResponse(text);
      } else {
        let message = 'Error ' + response.status + ': ' + response.statusText;
        if (text) { message += '\n' + prettyResponse(text); }
        output.textContent = message;
      }
      Prism.highlightAll();
    });
  }).catch(error => {
    output.textContent = 'Error 0: ' + (error && error.message ? error.message : 'request failed');
    Prism.highlightAll();
  });
}

function clearSampleRequest (root) {
  const output = qs('.sample-request-response-json', root);
  const responseBox = qs('.sample-request-response', root);
  if (output) { output.textContent = ''; }
  if (responseBox) { responseBox.hidden = true; }

  // placeholder is the name of the input if there are no default value
  qsa('.sample-request-input', root).forEach(el => {
    if (el.type === 'checkbox') {
      el.checked = el.defaultChecked;
      return;
    }
    el.value = el.placeholder !== el.dataset.name ? el.placeholder : '';
  });

  const urlElement = qs('.sample-request-url', root);
  if (urlElement) { urlElement.value = urlElement.defaultValue; }
}
