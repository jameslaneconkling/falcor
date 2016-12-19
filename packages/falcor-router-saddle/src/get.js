const typeofNumber = 'number';
const typeofObject = 'object';
const isArray = Array.isArray;
const slice = Array.prototype.slice;

import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/observable/defer';
import 'rxjs/add/observable/empty';

function defaultPropsResolver(routerInstance) {
    const { request  = {} } = routerInstance;
    const { query = {} } = request;
    return query;
}

function defaultLoader(requestedIds) {
    return Observable.empty();
}

export function get(options = {}) {

    const lists = options.lists || [];
    const loader = options.loader || defaultLoader;
    const getInitialProps = options.getInitialProps || defaultPropsResolver;

    return function getHandler(requestedPathSet) {

        const context = { ...getInitialProps(this) };

        let listName, index = -1, count = lists.length;

        while (++index < count) {
            listName = lists[index];
            context[`${listName}Ids`] = [].concat(
                requestedPathSet[1 + (index * 2)]
            );
        }

        const suffix = slice.call(requestedPathSet, count * 2);
        const loaded = suffix.reduce((source, keys, index) => source.mergeMap(
                ({ context, rest }) => keysetToKeysList(keys),
                ({ context, rest }, key) => ({
                    context, rest: {
                        ...rest,
                        [index]: key,
                        length: index + 1
                    }
                })
            ),
            Observable
                .defer(() => loader(context))
                .map((context) => ({ context, rest: { length: 0 } }))
        );

        return loaded.mergeMap(expandValues(lists));
    }
}

function expandValues(lists) {

    return function innerExpandValues({ context, rest }) {

        context = context || {};

        const vals = [], path = [];
        let index = -1, count = lists.length,
            key, type, pathId = -1, valsId = -1,
            value = context[lists[count - 1]] || context;

        while (++index < count) {
            key = lists[index];
            path[++pathId] = `${key}sById`;
            path[++pathId] = context[key].id;
        }

        index = 0;
        count = rest.length;

        do {
            if (value === undefined) {
                break;
            } else if (index === count || !value || typeofObject !== typeof value) {
                vals[++valsId] = { value, path };
                break;
            } else if (type = value.$type) {
                vals[++valsId] = { value, path };
                break;
            }
            key = rest[index];
            value = value[key];
            path[++pathId] = key;
        } while (++index <= count);

        return vals;
    }
}

function keysetToKeysList(keys) {
    if (!keys || typeofObject !== typeof keys) {
        return [keys];
    } else if (isArray(keys)) {
        return keys;
    }
    let rangeEnd = keys.to;
    let rangeStart = keys.from || 0;
    if (typeofNumber !== typeof rangeEnd) {
        rangeEnd = rangeStart + (keys.length || 0) - 1;
    }
    return Array.from(
        {length: rangeEnd - rangeStart},
        (x, index) => index + rangeStart
    );
}
