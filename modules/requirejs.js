// Lightweight implementation of Require.js AMD methods
// to make it work in a PhantomJS Node-ish environment
// You can map existin modules to requirejs_modules
// Ex.: 
//   `requirejs_modules['jquery'] = jQuery;`

// Require.js modules cache
exports.requirejs_modules = {};

// Make Require.js#requirejs work
exports.requirejs = function(deps, callback) {

  // Load any deps if needed
  deps.map(function(depName){
    if (!(depName in requirejs_modules)) {
      // Force a path search, don't look for module
      require('../' + depName);
    }
  });

  // Map deps to modules
  deps = deps.map(function(depName){
    if (depName in requirejs_modules) {
      return requirejs_modules[depName];
    }  
  });

  // If there's a callback, execute and return
  if (typeof(callback) !== 'undefined') {
    return callback.apply(null, deps);
  }

  // Else, just return deps
  return deps;
};

// Make Require.js#define work
exports.define = function(module, deps, returnValue) {
  // If module was loaded already, return it
  if (module in requirejs_modules)
    return requirejs_modules[module];

  // Try to load module by loading deps and executing callback
  requirejs_modules[module] = requirejs(deps, returnValue);
  // Return loaded module
  return requirejs_modules[module];
};
