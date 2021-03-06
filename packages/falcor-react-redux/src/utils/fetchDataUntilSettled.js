import { errorMessage } from 'pegjs-util';
import memoizeQueryies from './memoizeQueryies';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/expand';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/empty';

const memoizedQuerySyntax = memoizeQueryies(100);

export default function fetchDataUntilSettled({
    data, props, falcor, version, fragment
}) {

    const memo = {
        query: null, loading: true,
        data, props, falcor, version, fragment,
    };
    memo.mapNext = handleNext(memo, falcor);
    memo.catchError = handleError(memo, falcor);

    return Observable.of(memo).expand(_fetchDataUntilSettled);
}

function _fetchDataUntilSettled(memo) {
    if (memo.loading === false) {
        return Observable.empty();
    }
    const { query, falcor, fragment } = memo;
    if (query !== (memo.query = fragment(memo.data || {}, memo.props))) {
        const { ast, error } = memoizedQuerySyntax(memo.query);
        if (error) {
            if (typeof console !== 'undefined' && typeof console.error === 'function') {
                console.error(errorMessage(error));
                console.error(`Error parsing query: ${memo.query}`);
            }
            memo.error = error;
            memo.version = falcor.getVersion();
        } else {
            return Observable
                .from(falcor.get(ast).progressively())
                .map(memo.mapNext).catch(memo.catchError);
        }
    }
    memo.loading = false;
    return Observable.of(memo);
}

function handleNext(memo, falcor) {
    return function mapNext({ json: data }) {
        memo.data = data;
        memo.loading = true;
        memo.version = falcor.getVersion();
        return memo;
    }
}

function handleError(memo, falcor) {
    return function catchError(error) {
        memo.error = error;
        memo.loading = false;
        memo.version = falcor.getVersion();
        return Observable.of(memo);
    };
}
