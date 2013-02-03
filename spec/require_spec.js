describe("require()", function() {
  it("loads native PhantomJS modules", function() {
    should.exist(require('webpage').create);
    should.exist(require('fs').separator);
    should.exist(require('webserver').create);
    require('system').platform.should.equal('phantomjs');
  });

  it("loads phantomjs-nodify modules", function() {
    should.exist(require('assert').AssertionError);
    should.exist(require('events').EventEmitter);
    should.exist(require('http').STATUS_CODES);
    should.exist(require('path').dirname);
    should.exist(require('tty').isatty);
    should.exist(require('util').inspect);
  });
});
