/**
 * Module dependencies.
 */
var program = require('commander')
  , path = require('path')
  , resolve = path.resolve
  , mocha = require('./mocha/mocha.js')
  , utils = mocha.utils
  , reporters = mocha.reporters
  , interfaces = mocha.interfaces
  , Context = mocha.Context
  , Runner = mocha.Runner
  , Suite = mocha.Suite
  , fs = require('fs')
  , join = path.join
  , cwd = process.cwd();

/**
 * Files.
 */

var files = [];

/**
 * Images.
 */

var images = {
    fail: __dirname + '/../images/error.png'
  , pass: __dirname + '/../images/ok.png'
};

// options

program
  .version(mocha.version)
  .usage('[debug] [options] [files]')
  .option('-r, --require <name>', 'require the given module')
  .option('-R, --reporter <name>', 'specify the reporter to use', 'dot')
  .option('-u, --ui <name>', 'specify user-interface (bdd|tdd|exports)', 'bdd')
  .option('-g, --grep <pattern>', 'only run tests matching <pattern>')
  .option('-t, --timeout <ms>', 'set test-case timeout in milliseconds [2000]')
  .option('-s, --slow <ms>', '"slow" test threshold in milliseconds [75]', parseInt)
  .option('-w, --watch', 'watch files for changes')
  .option('-c, --colors', 'force enabling of colors')
  .option('-C, --no-colors', 'force disabling of colors')
  .option('-G, --growl', 'enable growl notification support')
  .option('-d, --debug', "enable node's debugger, synonym for node --debug")
  .option('-b, --bail', "bail after first test failure")
  .option('--debug-brk', "enable node's debugger breaking on the first line")
  .option('--globals <names>', 'allow the given comma-delimited global [names]', list, [])
  .option('--ignore-leaks', 'ignore global variable leaks')
  .option('--interfaces', 'display available interfaces')
  .option('--reporters', 'display available reporters')

program.name = 'mocha';

// --reporters

program.on('reporters', function(){
  console.log();
  console.log('    dot - dot matrix');
  console.log('    doc - html documentation');
  console.log('    spec - hierarchical spec list');
  console.log('    json - single json object');
  console.log('    progress - progress bar');
  console.log('    list - spec-style listing');
  console.log('    tap - test-anything-protocol');
  console.log('    landing - unicode landing strip');
  console.log('    xunit - xunit reportert');
  console.log('    teamcity - teamcity ci support');
  console.log('    html-cov - HTML test coverage');
  console.log('    json-cov - JSON test coverage');
  console.log('    json-stream - newline delimited json events');
  console.log();
  process.exit();
});

// --interfaces

program.on('interfaces', function(){
  console.log('');
  console.log('    bdd');
  console.log('    tdd');
  console.log('    qunit');
  console.log('    exports');
  console.log('');
  process.exit();
});

// -r, --require

//module.paths.push(cwd, join(cwd, 'node_modules'));

program.on('require', function(mod){
  var abs = path.existsSync(mod)
    || path.existsSync(mod + '.js');

  if (abs) mod = join(cwd, mod);
  require(mod);
});

// mocha.opts support

try {
  var opts = fs.readFileSync('test/mocha.opts', 'utf8')
    .trim()
    .split(/\s+/);

  process.argv = process.argv
    .slice(0, 2)
    .concat(opts.concat(process.argv.slice(2)));
} catch (err) {
  // ignore
}

// parse args

program.parse(process.argv);

// infinite stack traces

Error.stackTraceLimit = Infinity; // TODO: config

// reporter

var suite = new Suite('', new Context)
  , Base = require('./mocha/reporters/base')
  , Reporter = require('./mocha/reporters/' + program.reporter)
  , ui = interfaces[program.ui](suite);

// --no-colors

if (!program.colors) Base.useColors = false;

// --colors

if (~process.argv.indexOf('--colors') ||
    ~process.argv.indexOf('-c')) {
  Base.useColors = true;
}

// --slow <ms>

if (program.slow) Base.slow = program.slow;

// --timeout

if (program.timeout) suite.timeout(program.timeout);

// --bail

suite.bail(program.bail);

// files

var files = program.args
  , re = /\.js$/;

// coffee-script support

try {
  require('coffee-script');
  re = /\.(js|coffee)$/;
} catch (err) {
  // ignore
}

// default files to test/*.{js,coffee}

if (!files.length) {
  console.log('Please specify at lease one testing file or path.');
  process.exit(1);
}

// try to walk the directory
files = flatten(files.map(walk_folder));

// resolve

files = files.map(function(path){
  return resolve(path);
});

// --watch

if (program.watch) {
  console.log();
  hideCursor();
  process.on('SIGINT', function(){
    showCursor();
    console.log('\n');
    process.exit();
  });

  var frames = [
      '  \033[96m◜ \033[90mwatching\033[0m'
    , '  \033[96m◠ \033[90mwatching\033[0m'
    , '  \033[96m◝ \033[90mwatching\033[0m'
    , '  \033[96m◞ \033[90mwatching\033[0m'
    , '  \033[96m◡ \033[90mwatching\033[0m'
    , '  \033[96m◟ \033[90mwatching\033[0m'
  ];

  play(frames);

  var watchFiles = utils.files(cwd);

  function purge() {
    watchFiles.forEach(function(file){
      delete require.cache[file];
    });
  }

  utils.watch(watchFiles, function(){
    purge();
    stop()
    suite = suite.clone();
    ui = interfaces[program.ui](suite);
    load(files, function(){
      run(suite, function(){
        play(frames);
      });
    });
  });

  return;
}

// load

load(files, function(){
  run(suite, process.exit);
});

// require test files before
// running the root suite

function load(files, fn) {
  var pending = files.length;
  files.forEach(function(file){
    suite.emit('pre-require', global, file);
    suite.emit('require', require(file), file);
    suite.emit('post-require', global, file);
    --pending || fn();
  });
}

// run the given suite

function run(suite, fn) {
  suite.emit('run');
  var runner = new Runner(suite);
  var reporter = new Reporter(runner);
  runner.globals(program.globals);
  if (program.ignoreLeaks) runner.ignoreLeaks = true;
  if (program.grep) runner.grep(new RegExp(program.grep));
  if (program.growl) growl(runner, reporter);
  runner.run(fn);
}

// enable growl notifications

function growl(runner, reporter) {
  var notify = require('growl');

  runner.on('end', function(){
    var stats = reporter.stats;
    if (stats.failures) {
      var msg = stats.failures + ' of ' + runner.total + ' tests failed';
      notify(msg, { title: 'Failed', image: images.fail });
    } else {
      notify(stats.passes + ' tests passed in ' + stats.duration + 'ms', {
          title: 'Passed'
        , image: images.pass
      });
    }
  });
}

/**
 * Parse list.
 */

function list(str) {
  return str.split(/ *, */);
}

/**
 * Hide the cursor.
 */

function hideCursor(){
  process.stdout.write('\033[?25l');
};

/**
 * Show the cursor.
 */

function showCursor(){
  process.stdout.write('\033[?25h');
};

/**
 * Stop play()ing.
 */

function stop() {
  process.stdout.write('\033[2K');
  clearInterval(play.timer);
}

/**
 * Play the given array of strings.
 */

function play(arr, interval) {
  var len = arr.length
    , interval = interval || 100
    , i = 0;

  play.timer = setInterval(function(){
    var str = arr[i++ % len];
    process.stdout.write('\r' + str);
  }, interval);
}

/**
 * FS scanner for test suites
 */

function walk_folder(path) {
  if (!fs.isDirectory(path)) {
    return path;
  } else {
    files = fs.list(path);

    // Don't go into current and parent folder.
    files = files.filter(function(file) {
      return !(['.', '..'].indexOf(file) > -1);
    });

    files = files.map(function(file) {
      file_path = join(path, file)
      if (fs.isDirectory(file_path)){
        return walk_folder(file_path);
      } else {
        return file_path;
      }
    });
    return files;
  }
};

function flatten(arr){
  return arr.reduce(function(acc, val){
    return acc.concat(val.constructor === Array ? flatten(val) : val);
  },[]);
}
