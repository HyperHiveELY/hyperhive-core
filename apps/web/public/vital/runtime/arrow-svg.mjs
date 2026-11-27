// Rebuild editable arrow art from SVG geometry. The exported template embeds this result as markup.
const namespace = 'http://www.w3.org/2000/svg';
const shapes = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const numbers = new Set(['viewBox','d','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','points','stroke-width','opacity','fill-opacity','stroke-opacity']);

export function arrowSvg(input) {
  if (!input || typeof DOMParser === 'undefined') return '';
  const parsed = new DOMParser().parseFromString(input, 'image/svg+xml');
  const source = parsed.documentElement;
  if (source.localName !== 'svg' || parsed.doctype || parsed.querySelector('parsererror')) return '';
  const output = document.implementation.createDocument(namespace, 'svg', null);
  function copy(from, to) {
    for (const {name, value} of from.attributes) {
      const geometry = numbers.has(name) && /^[\d\s.,+%A-Za-z-]+$/.test(value);
      const color = ['fill','stroke','color'].includes(name) && /^(?:#[a-f\d]{3,8}|[a-z]+)$/i.test(value);
      const mode = ['stroke-linejoin','stroke-linecap','fill-rule','clip-rule'].includes(name) && /^[a-z]+$/.test(value);
      if (geometry || color || mode) to.setAttribute(name, value);
    }
    for (const node of from.children) {
      if (!shapes.has(node.localName) || (node.namespaceURI && node.namespaceURI !== namespace)) continue;
      const shape = output.createElementNS(namespace, node.localName);
      copy(node, shape);
      to.appendChild(shape);
    }
  }
  const root = output.documentElement;
  copy(source, root);
  if (!root.hasAttribute('viewBox')) {
    const dimension = name => /^(\d+(?:\.\d+)?)(?:px)?$/.exec(root.getAttribute(name) || '')?.[1];
    const width = dimension('width'), height = dimension('height');
    if (width && height) root.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  }
  root.setAttribute('width','100%');
  root.setAttribute('height','100%');
  return new XMLSerializer().serializeToString(root);
}
