var fs = require('fs');

// FIXME: remove when require.stub() supports lazy-loading
global.process = {};

function addModules() {
  // FIXME: change to fs.list() when require.stub() supports lazy-loading
  [
    'util.js',
    'tty.js',
    'http.js',
    'events.js',
    'path.js',
    'assert.js',
  ].forEach(function(fileName) {
    var path = './modules/' + fileName;
    require.stub(fileName.match(/^[^.]+/)[0], require(path));
    global.require.stub(fileName.match(/^[^.]+/)[0], require(path));
  });
}

// process
function addProcess() {
  var EventEmitter = require('events').EventEmitter;
  var path = require('path');
  var process = global.process = new EventEmitter;
  var rootPath = fs.absolute(phantom.libraryPath);

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
  process.argv = ['nodify'].concat(require('system').args);
  process.argv[1] = path.join(rootPath, path.basename(require('system').args[0]));
  process.cwd = function() {
    return rootPath;
  };
  
  var phantomSetTimeout = setTimeout;
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

// Function.bind
// source: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/bind
// TODO: remove when PhantomJS gets JS engine upgrade
function addFunctionBind() {
  if (!Function.prototype.bind) {
    Function.prototype.bind = function (oThis) {
      if (typeof this !== "function") {
        // closest thing possible to the ECMAScript 5 internal IsCallable function
        throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
      }

      var aArgs = Array.prototype.slice.call(arguments, 1);
      var fToBind = this, fNOP = function () {};
      var fBound = function () {
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
function addBuffer() {
  global.Buffer = {
    isBuffer: function() { return false; }
  };
};

// nodify
addModules();
addProcess();
patchEvents();
patchConsole();
addFunctionBind();
addBuffer();

