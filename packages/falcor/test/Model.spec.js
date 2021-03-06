var Rx = require('rx');
var rxjs = require('rxjs');

var falcor = require('../falcor.js');
var Model = require('../falcor.js').Model;
var fromPath = require('@graphistry/falcor-path-syntax').fromPath;
var fromPaths = require('@graphistry/falcor-path-syntax').fromPathsOrPathValues;

Model.ref = require('@graphistry/falcor-json-graph').ref;
Model.atom = require('@graphistry/falcor-json-graph').atom;
Model.error = require('@graphistry/falcor-json-graph').error;

var modelGet = Model.prototype.get;
var modelSet = Model.prototype.set;
var modelCall = Model.prototype.call;
var modelPreload = Model.prototype.preload;
var modelGetValue = Model.prototype.getValue;
var modelSetValue = Model.prototype.setValue;
var modelInvalidate = Model.prototype.invalidate;
var modelGetVersion = Model.prototype.getVersion;

Model.prototype.get = function() {
    return modelGet.apply(this, fromPaths(Array.prototype.slice.call(arguments)));
};

Model.prototype.set = function() {
    return modelSet.apply(this, fromPaths(Array.prototype.slice.call(arguments)));
};

Model.prototype.call = function(fnPath, fnArgs, refPaths, thisPaths) {
    fnPath = fromPath(fnPath);
    refPaths = refPaths && fromPaths([].concat(refPaths)) || [];
    thisPaths = thisPaths && fromPaths([].concat(thisPaths)) || [];
    return modelCall.call(this, fnPath, fnArgs, refPaths, thisPaths);
};

Model.prototype.invalidate = function() {
    return modelInvalidate.apply(this, fromPaths(Array.prototype.slice.call(arguments)));
};

Model.prototype.getVersion = function() {
    return modelGetVersion.apply(this, fromPaths(Array.prototype.slice.call(arguments)));
};

Model.prototype.preload = function() {
    return modelPreload.apply(this, fromPaths(Array.prototype.slice.call(arguments)));
};

Model.prototype.getValue = function() {
    return modelGetValue.apply(this, fromPaths(Array.prototype.slice.call(arguments)));
};

Model.prototype.setValue = function(path, value) {
    if (typeof path === 'string') {
        path = fromPath(path);
    }
    return modelSetValue.call(this, path, value);
};

var testRunner = require('./testRunner');
var chai = require('chai');
var expect = chai.expect;
var $ref = require('./../lib/types/ref');
var $error = require('./../lib/types/error');
var $atom = require('./../lib/types/atom');
global.toObservable = require('./toObs');

describe('Model', function() {

    it('should construct a new Model', function() {
        new Model();
    });

    it('should construct a new Model when calling the falcor module function', function() {
        expect(falcor() instanceof Model).to.equal(true);
    });

    xit('should have access to static helper methods.', function() {
        var ref = ['a', 'b', 'c'];
        var err = {ohhh: 'no!'};

        var out = Model.ref(ref);
        testRunner.compare({$type: $ref, value: ref}, out);

        out = Model.ref('a.b.c');
        testRunner.compare({$type: $ref, value: ref}, out);

        out = Model.error(err);
        testRunner.compare({$type: $error, value: err}, out);

        out = Model.atom(1337);
        testRunner.compare({$type: $atom, value: 1337}, out);
    });

    it('unsubscribing should cancel DataSource request.', function(done) {
        var onNextCalled = 0,
            onErrorCalled = 0,
            onCompletedCalled = 0,
            unusubscribeCalled = 0,
            dataSourceGetCalled = 0;

        var model = new Model({
            cache: {
                list: {
                    0: { name: 'test' }
                }
            },
            source: {
                get: function() {
                    return {
                        subscribe: function(observerOrOnNext, onError, onCompleted) {
                            dataSourceGetCalled++;
                            var handle = setTimeout(function() {
                                var response = {
                                    jsonGraph: {
                                        list: {
                                            1: { name: 'another test' }
                                        }
                                    },
                                    paths: ['list', 1, 'name']
                                };

                                if (typeof observerOrOnNext === 'function') {
                                    observerOrOnNext(response);
                                    onCompleted();
                                }
                                else {
                                    observerOrOnNext.onNext(response);
                                    observerOrOnNext.onCompleted();
                                }
                            });

                            return {
                                dispose: function() {
                                    unusubscribeCalled++;
                                    clearTimeout(handle);
                                }
                            }
                        }
                    }
                }
            }
        });

        var subscription = model.get('list[0,1].name').
            subscribe(
                function(value) {
                    onNextCalled++;
                },
                function(error) {
                    onErrorCalled++;
                },
                function() {
                    onCompletedCalled++;
                });

        subscription.dispose();

        expect(dataSourceGetCalled, 'dataSource.get should have been called').to.equal(1);
        expect(!onNextCalled, 'onNext should not be called').to.be.ok;
        expect(unusubscribeCalled, 'unusubscribe should have been called').to.equal(1);
        expect(!onErrorCalled, 'onError should not be called').to.be.ok;
        expect(!onCompletedCalled, 'onCompleted should not be called').to.be.ok;

        done();
    });

    it('Supports RxJS 5 Observables and Schedulers.', function(done) {

        var Observable = rxjs.Observable;
        var Scheduler = rxjs.Scheduler.async;
        var onNextCalled = 0,
            scheduleCalled = 0,
            onCompletedCalled = 0,
            unusubscribeCalled = 0,
            dataSourceGetCalled = 0;

        var model = new Model({
            scheduler: {
                schedule: function() {
                    scheduleCalled++;
                    return Scheduler.schedule.apply(Scheduler, arguments);
                }
            },
            cache: {
                list: {
                    0: { name: 'test' }
                }
            },
            source: {
                get: function() {
                    return {
                        subscribe: function(observerOrOnNext, onError, onCompleted) {
                            dataSourceGetCalled++;
                            var handle = setTimeout(function() {
                                var response = {
                                    jsonGraph: {
                                        list: {
                                            1: { name: 'another test' }
                                        }
                                    },
                                    paths: [['list', 1, 'name']]
                                };

                                if (typeof observerOrOnNext === 'function') {
                                    observerOrOnNext(response);
                                    onCompleted();
                                }
                                else {
                                    observerOrOnNext.onNext(response);
                                    observerOrOnNext.onCompleted();
                                }
                            });

                            return {
                                unsubscribe: function() {
                                    unusubscribeCalled++;
                                    clearTimeout(handle);
                                }
                            }
                        }
                    }
                }
            }
        });

        Observable
            .from(modelGet.call(model, fromPath('list[0,1].name')))
            .do(function(value) { onNextCalled++; }, null, function() {
                expect(onNextCalled, 'onNext should have been called').to.equal(1);
                expect(scheduleCalled, 'scheduleCalled should have been called').to.equal(1);
                expect(unusubscribeCalled, 'unusubscribe should have been called').to.equal(1);
                expect(dataSourceGetCalled, 'dataSource.get should have been called').to.equal(1);
            })
            .subscribe(null, done, done);
    });

    describe('JSON-Graph Specification', function() {
        require('./get-core');

        describe('#set', function() {
            require('./set')();
        });

        describe('#invalidate', function() {
            require('./invalidate')();
        });
    });

    require('./lru');
    require('./hardlink');
    require('./falcor');
    require('./internal');

});
