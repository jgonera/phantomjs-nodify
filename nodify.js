if (typeof nodify !== 'string') {
  console.error("Global variable `nodify` not set or not a string!");
  phantom.exit(1);
}

var global = window, process;

(function() {
  // common stuff
  
  var fs = require('fs');
  
  function dirname(path) {
    return path.replace(/\/[^\/]*\/?$/, '');
  };
  
  function basename(path) {
    return path.replace(/.*\//, '');
  };
  
  function joinPath() {
    var args = Array.prototype.slice.call(arguments);
    return args.join(fs.separator);
  };
  
  var rootPath = fs.absolute(phantom.libraryPath);
  var nodifyPath = joinPath(rootPath, dirname(nodify));
  var sourceIds = {};
  nodify = {};

  function getErrorMessage(e, withMessage) {
    withMessage = typeof withMessage === 'undefined' ? true : withMessage;
    return (e.fileName || sourceIds[e.sourceId]) + ':' + e.line +
      (withMessage ? ' ' + e : '');
  };

  // patches
  
  // TODO: remove when PhantomJS has full module support
  function patchRequire() {
    var phantomRequire = nodify.__orig__require = require;
    var requireDir = rootPath;
    
    require = function(path) {
      var i, dir, paths = [], fileGuesses = [], file, code, fn;
      var fileGuesses = []
      var paths = global.module['paths'].slice(0);
      var oldRequireDir = requireDir;
      var module = { exports: {} };

      if (path === 'fs' || path === 'webpage' || path === 'webserver') {
        return phantomRequire(path);
      } else {
        if (path[0] === '.') {
          paths.push(fs.absolute(joinPath(requireDir, path)));
        } else if (path[0] === '/') {
          paths.push(fs.absolute(path));
        } else {
          // Look in default modules path.
          paths.push(joinPath(nodifyPath, 'modules', path));
        }
        
        for (i = 0; i < paths.length; ++i) {
          guess_path = paths[i]
          var files = [
            guess_path,
            guess_path + '.js',
            joinPath(guess_path, path),
            joinPath(guess_path, path + '.js'),
            joinPath(guess_path, 'index.js'),
            joinPath(guess_path, 'lib', basename(guess_path) + '.js')
          ]

          if (nodify._user_coffee) {
            files.push.apply(files, [
              paths[i] + '.coffee',
              joinPath(paths[i], 'index.coffee'),
              joinPath(paths[i], 'lib', basename(paths[i]) + '.coffee')
              ]);
          }

          fileGuesses.push.apply(fileGuesses, files);
        };
        
        file = null;
        for (i = 0; i < fileGuesses.length && !file; ++i) {
          if (fs.isFile(fileGuesses[i])) {
            file = fileGuesses[i];
          }
        };
        if (!file) {
          throw new Error(
            "\nCan't find module " + path + " in:\n" +
            fileGuesses.join('\n') +
            "\n\nGlobal paths:\n" +
            global.module['paths'].join('\n') +
            "\n\nExtended paths:\n" +
            paths.join('\n')
            );
        }
        
        if (file in global.module.cache) {
          return global.module.cache[file].exports;
        }

        requireDir = dirname(file);
        
        code = fs.read(file);
        if (file.match(/\.coffee$/)) {
          try {
            code = CoffeeScript.compile(code);
          } catch (e) {
            e.fileName = file;
            throw e;
          }
        }
        // a trick to associate Error's sourceId with file
        code += ";throw new Error('__sourceId__');";
        try {
          fn = new Function('module', 'exports', code);
          fn(module, module.exports);
        } catch (e) {
          //console.log(e.sourceId + ':' + file);
          if (!sourceIds.hasOwnProperty(e.sourceId)) {
            sourceIds[e.sourceId] = file;
          }
          if (e.message !== '__sourceId__') {
            throw e;
          }
        }
        
        requireDir = oldRequireDir;
        global.module.cache[file] = module;
        
        return module.exports;
      }
    };
  };
  
  // process
  function addProcess() {
    var EventEmitter = require('events').EventEmitter;
    process = new EventEmitter;
    process.env = {};
    process.nextTick = function(fn) { fn() };
    process.exit = function(status) {
      process.emit('exit');
      phantom.exit(status);
    };
    process.stdout = {
      write: function(string) { fs.write("/dev/stdout", string, "w"); }
    };
    process.stderr = {
      write: function(string) { fs.write("/dev/stderr", string, "w"); }
    };
    process.argv = ['nodify', phantom.scriptName].concat(phantom.args);
    
    process.cwd = function() { return fs.workingDirectory;};

    process.version = '0.0.0'
    process.versions = {'node': process.version}

    var phantomSetTimeout = nodify.__orig__setTimeout = setTimeout;
    setTimeout = function(fn, delay) {
      return phantomSetTimeout(function() {
        try {
          fn();
        } catch (e) {
          process.emit('uncaughtException', e);
        }
      }, delay);
    };
  };
  
  // make errors in event listeners propagate to uncaughtException
  function patchEvents() {
    var EventEmitter = require('events').EventEmitter;
    
    var eventEmitterEmit = EventEmitter.prototype.emit;
    EventEmitter.prototype.emit = function() {
      try {
        return eventEmitterEmit.apply(this, arguments);
      } catch (e) {
        process.emit('uncaughtException', e);
      }
    }
  }; 
  
  // better console
  function patchConsole() {
    var util = require('util');
    ['log', 'error', 'debug', 'warn', 'info'].forEach(function(fn) {
      var fn_ = '__orig__' + fn;
      console[fn_] = console[fn];
      console[fn] = function() {
        console[fn_](util.format.apply(this, arguments));
      };
    });
  };
  
  // dummy stack trace
  // TODO: remove when PhantomJS gets JS engine upgrade
  function addErrorStack() {
    Object.defineProperty(Error.prototype, 'stack', {
      set: function(string) { this._stack = string; },
      get: function() {
        if (this._stack) {
          return this._stack;
        } else if (this.fileName || this.sourceId) {
          return this.toString() + '\nat ' + getErrorMessage(this, false);
        }
        return this.toString() + '\nat unknown';
      },
      configurable: true,
      enumerable: true
    });
  };

  // Function.bind
  // TODO: remove when PhantomJS gets JS engine upgrade
  function addFunctionBind() {
    if (!Function.prototype.bind) {
      Function.prototype.bind = function (oThis) {
        if (typeof this !== "function") {
          // closest thing possible to the ECMAScript 5 internal IsCallable function
          throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable"); 
        } 
        
        var aArgs = Array.prototype.slice.call(arguments, 1), 
          fToBind = this, 
          fNOP = function () {},
          fBound = function () {
            return fToBind.apply(this instanceof fNOP 
                                   ? this 
                                   : oThis || window, 
                                 aArgs.concat(Array.prototype.slice.call(arguments)));
          };
        
        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();
        
        return fBound;
      };
    }
  };
  
  // dummy Buffer
  function patchGlobal() {
    global.Buffer = {
      isBuffer: function() { return false; }
    };

    global.__dirname = fs.workingDirectory;

    global.module = {
      'paths': [],
      'cache': {}
    }
  };

  // nodify
  patchGlobal();  
  patchRequire();
  addProcess();
  patchEvents();
  patchConsole();
  addErrorStack();
  addFunctionBind();
  
  nodify.run = function(fn) {
    try {
      fn();
    } catch(e) {
      console.error(getErrorMessage(e));
      phantom.exit(1);
    }
  };

  nodify.enable_coffee_script = function() {
    phantom.injectJs(joinPath(nodifyPath, 'coffee-script.js'));
    nodify._user_coffee = true;
  };
  
}());

