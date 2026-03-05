// Extract and run just the JavaScript from the HTML file
const fs = require('fs');
const html = fs.readFileSync('./PlanForge_Advisor_Panel_V3_MASTER.html', 'utf8');

// Extract the main script block
// Find the first <script> (not <script src=...>) and the last </script> before </body>
const startTag = '\n<script>\n';
const startIdx = html.indexOf(startTag);
if (startIdx === -1) { console.error('Could not find main <script> tag'); process.exit(2); }
const jsStart = startIdx + startTag.length;
// Find the last </script> in the file
const lastScriptEnd = html.lastIndexOf('</script>');
if (lastScriptEnd === -1) { console.error('Could not find closing </script> tag'); process.exit(2); }
const jsBlock = html.substring(jsStart, lastScriptEnd);

let js = jsBlock;

// Stub DOM/browser APIs that the compute engine doesn't need
// Do NOT redeclare state variables — the HTML script declares them with let/const
const stubs = `
  var document = {
    getElementById: function(id) { return { value: '0', textContent: '', innerHTML: '', style: {display:''}, className: '', querySelector: function(){return null;}, closest: function(){return null;}, classList: {toggle:function(){},remove:function(){},add:function(){},contains:function(){return false;}} }; },
    querySelectorAll: function() { return []; },
    createElement: function(tag) { return { style:{}, innerHTML:'', className:'', textContent:'', appendChild:function(){return this;}, setAttribute:function(){}, addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}}, children:[], click:function(){} }; },
    querySelector: function() { return null; },
    body: { appendChild:function(){}, removeChild:function(){} },
    addEventListener: function(){},
    createTextNode: function(t){ return {textContent:t}; },
  };
  var window = { addEventListener: function(){}, open: function(){}, location: {href:''} };
  var alert = function(msg){ console.log('ALERT: ' + msg); };
  var confirm = function(){ return true; };
  var URL = { createObjectURL: function(){ return ''; }, revokeObjectURL: function(){} };
  var Blob = function(parts, opts){ this.parts = parts; };
  var HTMLElement = function(){};
  var FileReader = function(){ this.readAsText = function(){}; this.onload = null; };
  var DOMParser = function(){ this.parseFromString = function(){ return { querySelectorAll: function(){ return []; } }; }; };
`;

// Create a function context and evaluate
const vm = require('vm');
const context = vm.createContext({
  console, Math, JSON, Set, Object, Array, parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout,
  Date, Number, String, Boolean, Map, WeakMap, Symbol, Error, TypeError, RangeError, ReferenceError,
  RegExp, Promise, Proxy, Reflect, Uint8Array, ArrayBuffer, encodeURIComponent, decodeURIComponent,
  NaN, Infinity, undefined,
});

try {
  vm.runInContext(stubs + js, context, { filename: 'advisor-panel.js', timeout: 30000 });
  const result = vm.runInContext('runTestSuite()', context, { timeout: 30000 });
  console.log('\nFinal:', JSON.stringify(result));
  process.exit(result.failed > 0 ? 1 : 0);
} catch(e) {
  console.error('Error:', e.message);
  // Show line context
  if (e.stack) {
    const lineMatch = e.stack.match(/advisor-panel\.js:(\d+)/);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1]);
      const lines = (stubs + js).split('\n');
      console.error(`Near line ${lineNum}:`);
      for (let i = Math.max(0, lineNum-3); i < Math.min(lines.length, lineNum+3); i++) {
        console.error(`  ${i+1}: ${lines[i]}`);
      }
    }
  }
  process.exit(2);
}
