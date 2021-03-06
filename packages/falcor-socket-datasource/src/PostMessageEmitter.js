export class PostMessageEmitter {
    constructor(source, sink,
                targetOrigin = '*',
                event = 'falcor-operation',
                cancel = 'cancel-falcor-operation') {
        this.sink = sink;
        this.event = event;
        this.cancel = cancel;
        this.source = source;
        this.listeners = {};
        this.targetOrigin = targetOrigin;
        this.onPostMessage = this.onPostMessage.bind(this);
        source.addEventListener('message', this.onPostMessage);
    }
    onPostMessage(event = {}) {
        const { data = {} } = event;
        const { targetOrigin } = this;
        const { type, ...rest } = data;
        if (!type || (
            targetOrigin !== '*' &&
            targetOrigin !== event.origin)) {
            return;
        }
        if (~type.indexOf(this.event) || ~type.indexOf(this.cancel)) {
            const { listeners } = this, handlers = listeners[type];
            handlers && handlers.slice(0).forEach(
                (handler) => handler && handler(rest));
        }
    }
    on(eventName, handler) {
        const { listeners } = this;
        const handlers = listeners[eventName] || (
                         listeners[eventName] = []);
        const handlerIndex = handlers.indexOf(handler);
        if (handlerIndex === -1) {
            handlers.push(handler);
        }
    }
    off(...args) {
        return this.removeListener(...args);
    }
    removeListener(eventName, handler) {
        const { listeners } = this;
        const handlers = listeners[eventName];
        const handlerIndex = handlers &&
            handlers.indexOf(handler) || -1;
        ~handlerIndex && handlers.splice(handlerIndex, 1);
        if (handlers && handlers.length === 0) {
            delete listeners[eventName];
        }
    }
    emit(eventName, data) {
        this.sink && this.sink.postMessage({
            type: eventName, ...data
        }, this.targetOrigin || '*');
    }
    dispose() {
        const { source } = this;
        this.sink = null;
        this.target = null;
        this.source = null;
        this.listeners = null;
        source && source.removeEventListener('message', this.onPostMessage);
    }
}
