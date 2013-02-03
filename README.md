phantomjs-nodify
================

Set of scripts that make [PhantomJS](http://www.phantomjs.org/) environment
more similar to [Node.js](http://nodejs.org/).
I implemented what I needed for my scripts. Feel free to fork and add more.

Implemented features:

* ~~Module support mostly compatible with CommonJS and Node.js, i.e. `require()`
  works not only for PhantomJS built-in modules. Most of the functionality from
  [Node.js Modules](http://nodejs.org/api/modules.html) (up to
  [The `module` Object](http://nodejs.org/api/modules.html#modules_the_module_object))
  should work.~~ Merged into PhantomJS since PhantomJS 1.7.
* ~~Exceptions thrown from required files are properly reported (with file name
  and line number). Line number for `.coffee` files may not be accurate.~~
  Merged into PhantomJS since PhantomJS 1.7.
* Global `process` object (some basic functionality + emits `uncaughtException`
  on exceptions that occur inside `setTimeout` blocks).
* `console` with string formatting (e.g. `console.log('hello %s', 'world')`).
* Some Node.js modules (see `lib/modules` dir).
* Other minor tweaks.

Some code taken from [Node.js](http://nodejs.org/).
Uses [Mocha](http://visionmedia.github.com/mocha/) + [Chai](http://chaijs.com/)
for testing.


How to use
----------

Clone:

    git clone git://github.com/jgonera/phantomjs-nodify.git

Require in your PhantomJS script at the very first line:

```js
require('phantomjs-nodify');
```


### Stubbing `require()`

*This feature no longer depends on phantomjs-nodify. Since PhantomJS 1.7 it is
available in PhantomJS itself, but remains an undocumented secret ;)*

Since commit PhantomJS 1.7 you can stub required modules in the given module
context which helps porting Node.js libraries. For example, let's say you have
a module file `a.js` in the same directory as your main script. You require
this module in the main script (`require('./a')`). Then, `a.js` contains:

```js
require.stub('zlib', {
  createGzip: function() { ... }
});

var something = require('some_node.js_module_that_requires_zlib');
```

Now `require('zlib')` will return the object with the `createGzip` function in
`a.js` and in every module required by it, but not in parent modules (in this
case `require('zlib')` will throw a "Cannot find module" exception in the main
script).

This is especially useful when trying to require libraries written for Node.js
which require modules not included in phantomjs-nodify.


Running tests
-------------

If you fork and add something, please write tests for it.
You can run the tests after fetching the necessary submodules:

    git submodule init
    git submodule update
    make test

