var gets = require("./../../get");
var mergeInto = require("./mergeInto");
var collapse = require("@graphistry/falcor-path-utils").collapse;
var getWithPathsAsPathMap = gets.getWithPathsAsPathMap;
var getWithPathsAsJSONGraph = gets.getWithPathsAsJSONGraph;

/**
 * Checks cache for the paths and reports if in progressive mode.  If
 * there are missing paths then return the cache hit results.
 *
 * @param {Model} model - The model that the request was made with.
 * @param {Array} requestedMissingPaths -
 * @param {Boolean} progressive -
 * @param {Boolean} isJSONG -
 * @param {Function} onNext -
 * @param {Function} onError -
 * @param {Function} onCompleted -
 * @param {Object} seed - The state of the output
 * @private
 */
module.exports = function checkCacheAndReport(model, requestedPaths, observer,
                                              progressive, isJSONG, seed,
                                              errors, recycleJSON) {

    var recycledJSONSeed, f_meta, originalHashCode;
    var originalSeed, isSeedImmutable = progressive && !isJSONG && seed;
    var shouldRecycleJSONSeed = !isJSONG && !progressive && recycleJSON;

    // If we request paths as JSON in progressive mode, ensure each progressive
    // valueNode is immutable. If not in progressive mode, we can write into the
    // same JSON tree until the request is completed.
    if (isSeedImmutable) {
        originalSeed = seed[0];
        seed[0] = {};
    } else if (shouldRecycleJSONSeed && seed[0] && (
               recycledJSONSeed = seed[0].json) && (
               f_meta = recycledJSONSeed[ƒ_meta])) {
        originalHashCode = f_meta["$code"];
    }

    // checks the cache for the data.
    var results;
    if (isJSONG) {
        results = getWithPathsAsJSONGraph(model, requestedPaths, seed);
    } else {
        results = getWithPathsAsPathMap(model, requestedPaths, seed, !recycleJSON);
    }

    // We must communicate critical errors from get that are critical
    // errors such as bound path is broken or this is a JSONGraph request
    // with a bound path.
    if (results.criticalError) {
        observer.onError(results.criticalError);
        return null;
    }

    var hasValues = results.hasValue;
    var valueNode = results.values[0];
    var hasValueOverall = Boolean(valueNode && valueNode.json || valueNode.jsonGraph);

    // We are done when there are no missing paths or the model does not
    // have a dataSource to continue on fetching from.
    var completed = !results.requestedMissingPaths ||
                    !results.requestedMissingPaths.length ||
                    !model._source;

    // Copy the errors into the total errors array.
    if (results.errors) {
        var errs = results.errors;
        var errorsLength = errors.length;
        for (var i = 0, len = errs.length; i < len; ++i, ++errorsLength) {
            errors[errorsLength] = errs[i];
        }
    }

    // If the valueNode should be immutable, merge the previous valueNode into
    // the one that was just created.
    if (isSeedImmutable && originalSeed) {
        valueNode = mergeInto(valueNode, originalSeed);
    }

    // If there are values to report, then report.
    // Which are under two conditions:
    // 1.  This request for data yielded at least one value (hasValue) and  the
    // request is progressive
    //
    // 2.  The request if finished and the json key off
    // the valueNode has a value.
    if (hasValues && progressive || hasValueOverall && completed) {
        try {
            if (isJSONG && valueNode) {
                var jsonGraphPaths = valueNode.paths;
                if (jsonGraphPaths && jsonGraphPaths.length > 0) {
                    valueNode.paths = collapse(jsonGraphPaths);
                }
            }
            ++model._root.syncRefCount;
            observer.onNext(valueNode);
        } catch (e) {
            throw e;
        } finally {
            --model._root.syncRefCount;
        }
    }

    // if there are missing paths, then lets return them.
    if (completed) {
        if (errors.length) {
            observer.onError(errors);
        } else {
            observer.onCompleted();
        }

        return null;
    }

    if (shouldRecycleJSONSeed && seed[0] && (
        recycledJSONSeed = seed[0].json) && (
        f_meta = recycledJSONSeed[ƒ_meta])) {
        f_meta["$code"] = originalHashCode;
    }

    // Return the results object.
    return results;
};
