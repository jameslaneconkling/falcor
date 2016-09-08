var checkCacheAndReport = require("./checkCacheAndReport");
var MaxRetryExceededError = require("./../../errors/MaxRetryExceededError");
var collectLru = require("./../../lru/collect");
var getSize = require("./../../support/getSize");
var AssignableDisposable = require("./../AssignableDisposable");
var InvalidSourceError = require("../../errors/InvalidSourceError");
var isFunction = require("./../../support/isFunction");

/**
 * The get request cycle for checking the cache and reporting
 * values.  If there are missing paths then the async request cycle to
 * the data source is performed until all paths are resolved or max
 * requests are made.
 * @param {GetResponse} getResponse -
 * @param {Model} model - The model that the request was made with.
 * @param {Object} results -
 * @param {Function} onNext -
 * @param {Function} onError -
 * @param {Function} onCompleted -
 * @private
 */
module.exports = function getRequestCycle(getResponse, model, results, observer,
                                          errors, count, initialCacheVersion) {
    // we have exceeded the maximum retry limit.
    if (count === 10) {
        throw new MaxRetryExceededError();
    }

    var requestQueue = model._request;
    var requestedMissingPaths = results.requestedMissingPaths;
    var optimizedMissingPaths = results.optimizedMissingPaths;
    var disposable = new AssignableDisposable();

    // We need to prepend the bound path to all requested missing paths and
    // pass those into the requestQueue.
    var boundRequestedMissingPaths = [];
    var boundPath = model._path;
    if (boundPath.length) {
        for (var i = 0, len = requestedMissingPaths.length; i < len; ++i) {
            boundRequestedMissingPaths[i] =
                fastCat(boundPath, requestedMissingPaths[i]);
        }
    }

    // No bound path, no array copy and concat.
    else {
        boundRequestedMissingPaths = requestedMissingPaths;
    }

    var currentRequestDisposable = requestQueue.
        get(boundRequestedMissingPaths, optimizedMissingPaths, function(err) {

            if (err instanceof InvalidSourceError) {
                observer.onError(err);
                return;
            }

            // Once the request queue finishes, check the cache and bail if
            // we can.
            var nextResults = checkCacheAndReport(model, requestedMissingPaths,
                                                  observer,
                                                  getResponse.isProgressive,
                                                  getResponse.isJSONGraph,
                                                  results.values, errors);

            // If there are missing paths coming back form checkCacheAndReport
            // the its reported from the core cache check method.
            if (nextResults) {

                // update the which disposable to use.
                disposable.currentDisposable =
                    getRequestCycle(getResponse, model, nextResults, observer,
                                    errors, count + 1, initialCacheVersion);
            }

            // We have finished.  Since we went to the dataSource, we must
            // collect on the cache.
            else {

                var modelRoot = model._root;
                var modelCache = modelRoot.cache;
                var currentVersion = modelCache.ツversion;

                collectLru(modelRoot, modelRoot.expired, getSize(modelCache),
                        model._maxSize, model._collectRatio, currentVersion);

                var rootOnChangesCompletedHandler = modelRoot.onChangesCompleted;

                if (initialCacheVersion !== currentVersion && (
                    modelRoot.syncRefCount <= 0) &&
                    isFunction(rootOnChangesCompletedHandler)) {
                    rootOnChangesCompletedHandler.call(modelRoot.topLevelModel);
                }
            }

        });
    disposable.currentDisposable = currentRequestDisposable;
    return disposable;
};

function fastCat(arr1, arr2) {
    var a = [], i, len, j;
    for (i = 0, len = arr1.length; i < len; i++) {
        a[i] = arr1[i];
    }
    for (j = 0, len = arr2.length; j < len; j++) {
        a[i++] = arr2[j];
    }
    return a;
}