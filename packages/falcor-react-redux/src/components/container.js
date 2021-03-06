import invariant from 'invariant';
import React, { PropTypes, Children } from 'react';
import hoistStatics from 'recompose/hoistStatics';
import shallowEqual from 'recompose/shallowEqual';
import wrapDisplayName from 'recompose/wrapDisplayName';
import fetchDataUntilSettled from '../utils/fetchDataUntilSettled';

import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs/Observable';

import 'rxjs/add/observable/of';
import 'rxjs/add/operator/takeLast';
import 'rxjs/add/operator/switchMap';

const defaultMapFragmentToProps = (data) => data;
const defaultMapDispatchToProps = (dispatch, props, falcor) => ({});
const defaultMergeProps = (stateProps, dispatchProps, parentProps) => ({
    ...parentProps, ...stateProps, ...dispatchProps
});

export { container };
export default container;

function container(fragmentDesc, ...rest) {

    invariant(fragmentDesc && (
              'function' === typeof fragmentDesc || (
              'object'   === typeof fragmentDesc &&
              'function' === typeof fragmentDesc.fragment)),
`Attempted to create a Falcor container component without a fragment.
Falcor containers must be created with a fragment function, or an Object with a "fragment" function.`);

    let renderErrors = false,
        renderLoading = false,
        fragment, mapFragment,
        mapDispatch, mapFragmentAndProps;

    if ('object' !== typeof fragmentDesc) {
        fragment = fragmentDesc;
        mapFragment = rest[0];
        mapDispatch = rest[1];
        mapFragmentAndProps = rest[2];
    } else {
        fragment = fragmentDesc.fragment;
        mapFragment = fragmentDesc.mapFragment;
        renderErrors = fragmentDesc.renderErrors;
        renderLoading = fragmentDesc.renderLoading;
        mapFragmentAndProps = fragmentDesc.mapFragmentAndProps;
        mapDispatch = fragmentDesc.mapDispatch || fragmentDesc.dispatchers;
    }

    mapFragment = mapFragment || defaultMapFragmentToProps;
    mapDispatch = mapDispatch || defaultMapDispatchToProps;
    mapFragmentAndProps = mapFragmentAndProps || defaultMergeProps;

    if ('function' !== typeof mapDispatch) {
        if (mapDispatch && 'object' !== typeof mapDispatch) {
            mapDispatch = defaultMapDispatchToProps;
        } else {
            mapDispatch = bindActionCreators(mapDispatch);
        }
    }

    return hoistStatics((Component) => class Container extends FalcorContainer {
        static fragment = fragment;
        static fragments = fragments;
        static load = fetchEachPropUpdate;
        static contextTypes = contextTypes;
        static childContextTypes = contextTypes;
        static displayName = wrapDisplayName(Component, 'Container');
        constructor(props, context) {
            super(props, context);
            this.fragment = fragment;
            this.Component = Component;
            this.mapFragment = mapFragment;
            this.renderErrors = renderErrors;
            this.renderLoading = renderLoading;
            this.dispatchers = mapDispatch(this);
            this.mapFragmentAndProps = mapFragmentAndProps;
        }
    });
}

const fragments = function(items) {
    if (!items || 'object' !== typeof items) {
        return `{ length }`;
    }
    let index = -1, query = 'length';
    const length = Math.max(0, items.length) || 0;
    while (++index < length) {
        query = `${
        query},
 ${     index}: ${this.fragment(items[index])}`;
    }
    return `{ ${query} }`;
}

function bindActionCreators(actionCreators) {
    return function mapDispatch(container) {
        return Object.keys(actionCreators).reduce((dispatchers, key) => {
            const actionCreator = actionCreators[key];
            dispatchers[key] = (...args) => {
                const { falcor, dispatch } = container.state;
                if (falcor) {
                    return dispatch({ falcor, ...actionCreator(...args) });
                }
            };
            return dispatchers;
        }, {});
    }
}

function tryDeref({ data, falcor }) {
    return !data || !falcor ?
        falcor :
        falcor._hasValidParentReference() ?
        falcor.deref(data) : null;
}

function fetchEachPropUpdate(update) {

    invariant(
        update.fragment || (update.fragment = this.fragment),
        `Attempted to fetch without a fragment definition`
    );

    if (!(update.falcor = tryDeref(update))) {
        return Observable.of(update);
    } else if (update.renderLoading === true) {
        return fetchDataUntilSettled(update);
    } else {
        return fetchDataUntilSettled(update).takeLast(1);
    }
}

function mergeEachPropUpdate(
    { props, falcor, dispatch },
    { data, error, version, loading }
) {
    const hash = data && data.$__hash;
    const status = data && data.$__status;
    loading = status === 'pending';
    return {
        hash, props, falcor, dispatch,
        data, error, loading, version
    };
}

const contextTypes = {
    falcor: PropTypes.object,
    dispatch: PropTypes.func,
};

class FalcorContainer extends React.Component {
    constructor(componentProps, context) {

        super(componentProps, context);

        const { falcor } = context;
        const { data, ...props } = componentProps;

        this.propsStream = new Subject();
        this.propsAction = this.propsStream.switchMap(
            fetchEachPropUpdate, mergeEachPropUpdate
        );

        this.state = {
            data, props,
            dispatch: context.dispatch,
            falcor: tryDeref({ data, falcor })
        };
    }
    getChildContext() {
        const { falcor, dispatch } = this.state;
        return { falcor, dispatch };
    }
    shouldComponentUpdate(nextProps, nextState, nextContext) {

        const { renderLoading,
                props: currProps = {},
                state: currState = {} } = this;

        if (renderLoading === true && currState.loading !== nextState.loading) {
            this.traceShouldUpdate('loading', currState.loading, '->', nextState.loading);
            return true;
        } else if (currState.version !== nextState.version) {
            this.traceShouldUpdate('version', currState.version, '->', nextState.version);
            return true;
        } else if (currState.error !== nextState.error) {
            this.traceShouldUpdate('error', currState.error, '->', nextState.error);
            return true;
        } else if (currState.hash !== nextState.hash) {
            this.traceShouldUpdate('hash', currState.hash, '->', nextState.hash);
            return true;
        }

        const { data: currData, style: currStyle = {}, ...restCurrProps } = currProps;
        const { data: nextData, style: nextStyle = currStyle, ...restNextProps } = nextProps;

        if (!shallowEqual(currData, nextData)) {
            this.traceShouldUpdate('data', currData, '->', nextData);
            return true;
        } else if (!shallowEqual(currStyle, nextStyle)) {
            this.traceShouldUpdate('style', currStyle, '->', nextStyle);
            return true;
        } else if (!shallowEqual(restCurrProps, restNextProps)) {
            this.traceShouldUpdate('props', restCurrProps, '->', restNextProps);
            return true;
        }

        this.traceShouldUpdate(false, currProps, '->', nextProps);

        return false;
    }
    componentWillReceiveProps(nextProps, nextContext) {
        // Receive new props from the owner
        const { data, ...props } = nextProps;
        this.propsStream.next({
            data, props,
            fragment: this.fragment,
            falcor: nextContext.falcor,
            version: this.state.version,
            dispatch: nextContext.dispatch,
            renderLoading: this.renderLoading
        });
    }
    componentWillMount() {
        const { data, ...props } = this.props;
        // Subscribe to child prop changes so we know when to re-render
        this.propsSubscription = this.propsAction.subscribe(this.setState.bind(this));
        this.propsStream.next({
            data, props,
            fragment: this.fragment,
            falcor: this.context.falcor,
            version: this.state.version,
            dispatch: this.context.dispatch,
            renderLoading: this.renderLoading
        });
    }
    componentWillUpdate(nextProps, nextState) {
        this.traceWillUpdate(nextState.loading || false, nextProps, nextState);
    }
    traceShouldUpdate(...message) {
        if (!global['__trace_container_diffs__']) {
            return;
        }
        console.log('should update:', this.inspect(), ...message);
    }
    traceWillUpdate(...message) {
        if (!global['__trace_container_updates__']) {
            return;
        }
        console.log('  will update:', this.inspect(), ...message);
    }
    inspect(...message) {
        const { state = {} } = this;
        const { falcor } = state;
        return falcor && falcor.inspect() || `{ v: -1, p: [] }`;
    }
    componentWillUnmount() {
        // Clean-up subscription before un-mounting
        this.propsSubscription.unsubscribe();
        this.propsSubscription = undefined;
        this.propsStream = undefined;
        this.propsAction = undefined;
        this.fragment = null;
        this.Component = null;
        this.dispatchers = null;
        this.mapDispatch = null;
        this.mapFragment = null;
        this.renderLoading = null;
        this.mergeFragmentAndProps = null;
    }
    render() {

        const { renderErrors, renderLoading,
                mapFragment, mapFragmentAndProps,
                Component, dispatchers, state } = this;

        if (!Component) {
            return null;
        }

        const { data, props, error, falcor } = state;
        const mappedFragment = mapFragment(data || [], props, falcor);
        const allMergedProps = mapFragmentAndProps(mappedFragment, dispatchers, props);

        if (error && renderErrors === true) {
            allMergedProps.error = error;
        }

        if (renderLoading === true) {
            allMergedProps.loading = state.loading || false;
        }

        return React.createElement(Component, allMergedProps);
    }
}
