var isArray = Array.isArray;
var Subject = require('./Subject');
var Subscriber = require('./Subscriber');
var Subscription = require('./Subscription');
var InvalidSourceError = require('../errors/InvalidSourceError');

var setJSONGraphs = require('../cache/set/setJSONGraphs');
var setPathValues = require('../cache/set/setPathValues');
var invalidatePaths = require('../cache/invalidate/invalidatePathSets');

var toPaths = require('@graphistry/falcor-path-utils/lib/toPaths');
var toCollapseMap = require('@graphistry/falcor-path-utils/lib/toCollapseMap');
var toCollapseTrees = require('@graphistry/falcor-path-utils/lib/toCollapseTrees');
var hasIntersection = require('@graphistry/falcor-path-utils/lib/hasIntersection');

module.exports = Request;

function Request(type, queue, source, scheduler) {
    Subject.call(this, [], queue);
    this.trees = [];
    this.type = type;
    this.data = null;
    this.active = false;
    this.responded = false;
    this.paths = null;
    this.requested = [];
    this.optimized = [];
    this.disposable = null;
    this.dataSource = source;
    this.scheduler = scheduler;
}

Request.prototype = Object.create(Subject.prototype);

Request.prototype.next =
Request.prototype.onNext = function(env) {

    var queue = this.parent;

    if (!queue) {
        return;
    }

    this.responded = true;
    /*
    if (this.responded === false) {
        this.responded = true;
        // Remove this request from the request queue as soon as we get
        // at least one response back. This ensures we won't be the target
        // of in-flight batch requests.
        queue.remove(this);
    }
    */

    var changed = false;
    var jsonGraph = env.jsonGraph;
    var boundPath = this.boundPath;
    var modelRoot = queue.modelRoot;
    var invalidated = env.invalidated;
    var paths = env.paths || this.paths;
    var requested = this.requested.slice(0);
    var observers = this.observers.slice(0);
    var rootChangeHandler = modelRoot.onChange;

    // Run invalidations first.
    if (invalidated && invalidated.length) {
        changed = invalidatePaths({ _root: modelRoot, _path: [] }, invalidated, false);
    }

    if (paths && paths.length && !(!jsonGraph || typeof jsonGraph !== 'object')) {
        var results = setJSONGraphs(
            { _root: modelRoot },
            [{ paths: paths, jsonGraph: jsonGraph }],
            modelRoot.errorSelector, modelRoot.comparator, false
        );
        paths = results[0];
        changed = changed || results[2];
    }

    if (changed && rootChangeHandler) {
        rootChangeHandler.call(modelRoot.topLevelModel);
    }

    observers.forEach(function(observer, index) {
        observer.onNext({
            type: 'get', paths: requested[index] ||
                filterPathsBoundTo(boundPath, paths)
        });
    });
}

Request.prototype.error =
Request.prototype.onError = function(error) {

    var queue = this.parent;

    if (!queue) {
        return;
    }

    if (this.responded === false) {
        this.responded = true;
        // Remove this request from the request queue as soon as we get
        // at least one response back. This ensures we won't be the target
        // of in-flight batch requests.
        queue.remove(this);
    }

    error = error || {};

    // Converts errors to object we can insert into the cache.
    error = !(error instanceof Error) ?
        // if it's $type error, use it raw
        error.$type === $error && error ||
        // Otherwise make it an error
        { $type: $error, value: error } :
        // If it's instanceof Error, pluck error.message
        { $type: $error, value: { message: error.message }};

    var modelRoot = queue.modelRoot;

    var errorPathValues = toPaths(toCollapseTrees(
        this.requested.reduce(function(collapseMap, paths) {
            return toCollapseMap(paths, collapseMap);
        }, {})
    ))
    .map(function(path) { return { path: path, value: error }; });

    if (errorPathValues.length) {
        setPathValues(
            { _root: modelRoot, _path: [] },
            errorPathValues,
            modelRoot.errorSelector,
            modelRoot.comparator,
            false
        );
    }

    Subject.prototype.onError.call(this, error);
}

Request.prototype.complete =
Request.prototype.onCompleted = function() {
    if (this.responded === false) {
        this.onNext({});
    }
    Subject.prototype.onCompleted.call(this);
}

Request.prototype.remove = function(subscription) {
    var index = this.subscriptions.indexOf(subscription);
    if (~index) {
        this.trees.splice(index, 1);
        this.requested.splice(index, 1);
        this.optimized.splice(index, 1);
        this.observers.splice(index, 1);
        this.subscriptions.splice(index, 1);
    }
    if (this.subscriptions.length === 0) {
        this.dispose();
    }
    return this;
}

Request.prototype.dispose =
Request.prototype.unsubscribe = function () {
    this.trees = [];
    this.data = null;
    this.paths = null;
    this.active = false;
    this.boundPath = null;
    this.requested = [];
    this.optimized = [];
    var queue = this.parent;
    if (queue) {
        this.parent = null;
        queue.remove(this);
    }
    var disposable = this.disposable;
    if (disposable) {
        this.disposable = null;
        if (disposable.dispose) {
            disposable.dispose();
        } else if (disposable.unsubscribe) {
            disposable.unsubscribe();
        }
    }
    Subject.prototype.dispose.call(this);
}

Request.prototype.connect = function() {
    if (!this.active && !this.disposable) {
        var scheduledDisposable = this.scheduler.schedule(flush.bind(this));
        if (!this.disposable) {
            this.disposable = scheduledDisposable;
        }
    }
    return this;
}

Request.prototype.batch = function(requested, optimized,
                                   requestedComplements,
                                   optimizedComplements) {
    if (this.active) {
        var requestedIntersection = [];
        var optimizedIntersection = [];
        if (findIntersections(this.trees,
                              requested, optimized,
                              requestedComplements,
                              optimizedComplements,
                              requestedIntersection,
                              optimizedIntersection)) {
            this.requested.push(requestedIntersection);
            this.optimized.push(optimizedIntersection);
            this.trees.push(toCollapseTrees(toCollapseMap(
                optimizedIntersection
            )));
            return this;
        }
        return null;
    }
    this.trees.push({});
    this.requested.push(requested);
    this.optimized.push(optimized);
    return this;
}

function flush() {

    var obs, paths = this.paths = toPaths(toCollapseTrees(
        this.optimized.reduce(function(collapseMap, paths) {
            return toCollapseMap(paths, collapseMap);
        }, {})
    ));

    this.trees = this.optimized.map(function(paths) {
        return toCollapseTrees(toCollapseMap(paths));
    });

    this.active = true;

    try {
        switch (this.type) {
            case 'get':
                obs = this.dataSource.get(paths);
                break;
            case 'set':
                obs = this.dataSource.set({ paths: paths, jsonGraph: this.data });
                break;
            case 'call':
                obs = this.dataSource.call.apply(this.dataSource, this.data);
                break;
        }
        this.disposable = obs.subscribe(this);
    } catch (e) {
        this.disposable = {};
        Subject.prototype.onError.call(this, new InvalidSourceError(e));
    }
}
function findIntersections(trees,
                           requested, optimized,
                           requestedComplements,
                           optimizedComplements,
                           requestedIntersection,
                           optimizedIntersection) {

    var index = -1;
    var complementIndex = -1;
    var reqComplementsIdx = -1;
    var intersectionIndex = -1;
    var reqIntersectionIdx = -1;
    var treesLength = trees.length;
    var optTotal = optimized.length;
    var reqTotal = requested.length - 1;

    toNextPath:
    while (++index < optTotal) {

        var treesIndex = -1;
        var path = optimized[index];
        var pathLen = path.length;

        while (++treesIndex < treesLength) {
            var tree = trees[treesIndex];
            var subTree = tree[pathLen];
            if (subTree && hasIntersection(subTree, path, 0, pathLen)) {
                optimizedIntersection[++intersectionIndex] = path;
                if (reqIntersectionIdx < reqTotal) {
                    requestedIntersection[++reqIntersectionIdx] = requested[
                        index < reqTotal ? index : reqTotal
                    ];
                }
                continue toNextPath;
            }
        }

        optimizedComplements[++complementIndex] = path;
        if (reqComplementsIdx < reqTotal) {
            requestedComplements[++reqComplementsIdx] = requested[
                index < reqTotal ? index : reqTotal
            ];
        }
    }

    return ~intersectionIndex;
}

function filterPathsBoundTo(boundPath, paths) {

    var boundLength;

    if (!boundPath || (boundLength = boundPath.length) === 0) {
        return paths;
    }

    var filtered = [], filteredIndex = -1, keyIndex;
    var path, pathsIndex = -1, pathsCount = paths.length;

    outer: while (++pathsIndex < pathsCount) {
        path = paths[pathsIndex];
        if (path.length > boundLength) {
            keyIndex = 0;
            do {
                if (path[keyIndex] !== boundPath[keyIndex]) {
                    continue outer;
                }
            } while (++keyIndex < boundLength);
            filtered[++filteredIndex] = path.slice(boundLength);
        }
    }

    return filtered;
}
