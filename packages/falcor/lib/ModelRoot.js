var hasOwn = require("./support/hasOwn");
var isFunction = require("./support/isFunction");
var toJSONWithHashCodes = require("./get/toJSONWithHashCodes");

function ModelRoot(o, topLevelModel) {

    var options = o || {};

    this.version = 0;
    this.syncRefCount = 0;
    this.expired = options.expired || [];
    this.unsafeMode = options.unsafeMode || false;
    this.cache = {};
    this.topLevelModel = topLevelModel;

    if (isFunction(options.comparator)) {
        this.comparator = options.comparator;
    }

    if (options.JSONWithHashCodes === true) {
        this.branchSelector = toJSONWithHashCodes;
    } else if (isFunction(options.branchSelector)) {
        this.branchSelector = options.branchSelector;
    }

    if (isFunction(options.errorSelector)) {
        this.errorSelector = options.errorSelector;
    }

    if (isFunction(options.branchSelector)) {
        this.branchSelector = options.branchSelector;
    }

    if (isFunction(options.onChange)) {
        this.onChange = options.onChange;
    }

    if (isFunction(options.onChangesCompleted)) {
        this.onChangesCompleted = options.onChangesCompleted;
    }
}

ModelRoot.prototype.errorSelector = function errorSelector(x, y) {
    return y;
};

ModelRoot.prototype.comparator = function comparator(cacheNode, messageNode) {
    if (hasOwn(cacheNode, "value") && hasOwn(messageNode, "value")) {
        // They are the same only if the following fields are the same.
        return cacheNode.value === messageNode.value &&
            cacheNode.$type === messageNode.$type &&
            cacheNode.$expires === messageNode.$expires;
    }
    return cacheNode === messageNode;
};

module.exports = ModelRoot;