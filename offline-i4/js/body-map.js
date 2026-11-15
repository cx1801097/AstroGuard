/* ============================================================
   CREW CHECK — body-map.js
   Schematic astronaut figure with clickable system hotspots.
   Pure inline SVG so it works offline and stays crisp.
   ============================================================ */
window.CC_BODYMAP = (function () {
  'use strict';

  var D = window.CC_DATA;

  function statusClass(status) {
    if (status === 'NO-GO') return 'is-nogo';
    if (status === 'CAUTION') return 'is-caution';
    return 'is-go';
  }

  /**
   * @param {HTMLElement} host
   * @param {Object} opts { systems: {id:{status,severity,findings}}, selected, onSelect }
   */
  function render(host, opts) {
    opts = opts || {};
    var systems = opts.systems || {};
    var selected = opts.selected;

    var fig = [
      '<svg viewBox="0 0 320 520" class="body-svg" role="img" aria-label="Human body systems map">',

      /* helmet */
      '<circle cx="160" cy="74" r="41" class="fig-shell"/>',
      '<path d="M126 62 A 41 41 0 0 1 194 62" class="fig-visor"/>',
      '<line x1="160" y1="115" x2="160" y2="124" class="fig-limb"/>',

      /* torso */
      '<path d="M118 128 Q160 112 202 128 L196 262 Q160 278 124 262 Z" class="fig-fill"/>',

      /* arms */
      '<path d="M120 140 L100 196 L94 246" class="fig-limb" stroke-width="15"/>',
      '<path d="M200 140 L220 196 L226 246" class="fig-limb" stroke-width="15"/>',

      /* legs */
      '<path d="M146 268 L141 360 L136 466" class="fig-limb" stroke-width="19"/>',
      '<path d="M174 268 L179 360 L184 466" class="fig-limb" stroke-width="19"/>',

      /* feet */
      '<path d="M136 470 L128 486" class="fig-limb" stroke-width="13"/>',
      '<path d="M184 470 L192 486" class="fig-limb" stroke-width="13"/>',

      /* scan sweep */
      '<line x1="60" y1="160" x2="260" y2="160" class="fig-scan"/>',
      '</svg>'
    ].join('');

    var dots = D.SYSTEMS.map(function (sys) {
      var st = systems[sys.id] || { status: 'GO', severity: 0 };
      var label = sys.name + ' — ' + st.status + ' (' + st.severity + '/100)';
      var cls = 'hotspot ' + statusClass(st.status) + (sys.id === selected ? ' is-selected' : '');
      return '<g class="' + cls + '" data-system="' + sys.id + '" tabindex="0" role="button" aria-label="' + label + '">' +
        '<circle cx="' + sys.dot.x + '" cy="' + sys.dot.y + '" r="17" class="hotspot-halo"/>' +
        '<circle cx="' + sys.dot.x + '" cy="' + sys.dot.y + '" r="8.5" class="hotspot-core"/>' +
        '<title>' + label + '</title></g>';
    }).join('');

    /* re-inject only the dots so the figure doesn't re-animate on
       every keystroke */
    if (!host.querySelector('.body-svg')) {
      host.innerHTML = fig;
    }
    var existing = host.querySelector('.body-dots');
    if (!existing) {
      existing = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      existing.setAttribute('class', 'body-dots');
      host.querySelector('.body-svg').appendChild(existing);
    }
    existing.innerHTML = dots;

    Array.prototype.forEach.call(host.querySelectorAll('.hotspot'), function (node) {
      var id = node.getAttribute('data-system');
      node.addEventListener('click', function () { if (opts.onSelect) opts.onSelect(id); });
      node.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          if (opts.onSelect) opts.onSelect(id);
        }
      });
    });
  }

  return { render: render };
})();
