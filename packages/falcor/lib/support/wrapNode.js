var now = require("./../support/now");
var expiresNow = require("../values/expires-now");

var atomSize = 50;

var clone = require("./../support/clone");
var isArray = Array.isArray;
var getSize = require("./../support/getSize");
var getExpires = require("./../support/getExpires");
var atomType = require("./../types/atom");

module.exports = function wrapNode(nodeArg, typeArg, value) {

    var size = 0;
    var node = nodeArg;
    var type = typeArg;

    if (type) {
        var modelCreated = node[ƒ_wrapped_value];
        node = clone(node);
        size = getSize(node);
        node.$type = type;
        node[ƒ_prev] = undefined;
        node[ƒ_next] = undefined;
        node[ƒ_wrapped_value] = modelCreated || false;
    } else {
        node = { $type: atomType, value: value };
        node[ƒ_prev] = undefined;
        node[ƒ_next] = undefined;
        node[ƒ_wrapped_value] = true;
    }

    if (value == null) {
        size = atomSize + 1;
    } else if (size == null || size <= 0) {
        switch (typeof value) {
            case "object":
                if (isArray(value)) {
                    size = atomSize + value.length;
                } else {
                    size = atomSize + 1;
                }
                break;
            case "string":
                size = atomSize + value.length;
                break;
            default:
                size = atomSize + 1;
                break;
        }
    }

    var expires = getExpires(node);

    if (typeof expires === "number" && expires < expiresNow) {
        node.$expires = now() + (expires * -1);
    }

    node.$size = size;

    return node;
};
