import '@testing-library/jest-dom';

// Backstage bundles style-inject, so the module mock cannot intercept it.
// Ignore CSS text insertion to prevent JSDOM stylesheet parser noise.
if (typeof HTMLStyleElement !== 'undefined') {
  const appendChild = HTMLStyleElement.prototype.appendChild;
  HTMLStyleElement.prototype.appendChild = function appendStyleText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node;
    return appendChild.call(this, node);
  };
}

// Increase default timeout for async tests (Node 20 is slower than Node 22)
jest.setTimeout(15000);
