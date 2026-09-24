/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */
import { qs, qsa, on } from './dom.mjs';

function closeDropdowns (except) {
  qsa('.btn-group.open, .dropdown.open').forEach(group => {
    if (group !== except) { group.classList.remove('open'); }
  });
}

export function initDropdowns () {
  document.addEventListener('click', event => {
    const toggle = event.target.closest ? event.target.closest('[data-toggle="dropdown"]') : null;
    if (toggle) {
      event.preventDefault();
      const group = toggle.parentNode;
      closeDropdowns(group);
      group.classList.toggle('open');
      return;
    }
    closeDropdowns();
  });
}

export function showTab (link) {
  const item = link.closest('li');
  const list = link.closest('ul');
  if (!list) { return; }
  qsa('li', list).forEach(li => li.classList.remove('active'));
  if (item) { item.classList.add('active'); }
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (target && target.parentNode) {
    Array.prototype.slice.call(target.parentNode.children).forEach(pane => pane.classList.remove('active'));
    target.classList.add('active');
  }
}

export function initTabs () {
  on(document, 'click', '[data-toggle="tab"]', (event, link) => {
    event.preventDefault();
    showTab(link);
  });
}

export function showFirstTabs (root) {
  qsa('.nav-tabs-examples', root).forEach(list => {
    const first = qs('a', list);
    if (first) { showTab(first); }
  });
}

let popover = null;

function hidePopover () {
  if (popover) {
    popover.remove();
    popover = null;
  }
}

function showPopover (button) {
  hidePopover();
  const element = document.createElement('div');
  element.className = 'popover right fade in';
  element.setAttribute('role', 'tooltip');
  element.innerHTML = '<div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div>';
  qs('.popover-title', element).textContent = button.getAttribute('data-title') || '';
  qs('.popover-content', element).innerHTML = button.getAttribute('data-content') || '';
  element.style.display = 'block';
  element.style.position = 'absolute';
  document.body.appendChild(element);
  const rect = button.getBoundingClientRect();
  const top = rect.top + window.pageYOffset + rect.height / 2 - element.offsetHeight / 2;
  const left = rect.left + window.pageXOffset + rect.width;
  element.style.top = Math.max(0, top) + 'px';
  element.style.left = left + 'px';
  popover = element;
}

export function initPopovers () {
  document.addEventListener('mouseover', event => {
    const button = event.target.closest ? event.target.closest('[data-toggle="popover"]') : null;
    if (button && (!popover || popover.dataset.owner !== button.id)) {
      showPopover(button);
    }
  });
  document.addEventListener('mouseout', event => {
    const button = event.target.closest ? event.target.closest('[data-toggle="popover"]') : null;
    if (button) {
      const related = event.relatedTarget;
      if (!related || !button.contains(related)) { hidePopover(); }
    }
  });
  on(document, 'click', '[data-toggle="popover"]', event => event.preventDefault());
}

export function initOffcanvas () {
  on(document, 'click', '[data-toggle="offcanvas"]', () => {
    const row = qs('.row-offcanvas');
    if (row) { row.classList.toggle('active'); }
  });
}

// Highlights the sidenav entry whose target was scrolled past last
export function createScrollSpy (nav, offset) {
  let targets = [];
  let queued = false;

  function refresh () {
    targets = qsa('a[href^="#"]', nav).map(link => {
      if (link.offsetParent === null) { return null; }
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target || target.offsetParent === null) { return null; }
      return { link: link, top: target.getBoundingClientRect().top + window.pageYOffset };
    }).filter(Boolean).sort((a, b) => a.top - b.top);
    process();
  }

  function process () {
    const scrollTop = window.pageYOffset + (offset || 10);
    let active = null;
    for (let i = 0; i < targets.length; i += 1) {
      if (targets[i].top <= scrollTop) {
        active = targets[i];
      } else {
        break;
      }
    }
    const atBottom = window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2;
    if (atBottom && targets.length) { active = targets[targets.length - 1]; }
    qsa('li.active', nav).forEach(li => li.classList.remove('active'));
    if (active) {
      const li = active.link.closest('li');
      if (li) { li.classList.add('active'); }
    }
  }

  window.addEventListener('scroll', () => {
    if (queued) { return; }
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      process();
    });
  });
  window.addEventListener('resize', refresh);

  return { refresh: refresh };
}
