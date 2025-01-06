const { LogStreamManager } = require('../modules/log_stream_manager'); // Import the class
jest.mock('ws', () => {
    const EventEmitter = require('events');
    return class WebSocketMock extends EventEmitter {
        constructor(url, options) {
            super();
            this.url = url;
            this.options = options;
        }
        send(message, callback) {
            this.emit('send', message);
            if (callback) callback();
        }
        close() {
            this.emit('close');
        }
    };
});

describe('LogStreamManager', () => {
    let logStreamManager;

    beforeEach(() => {
        logStreamManager = new LogStreamManager();
    });

    afterEach(() => {
        logStreamManager = null;
    });

    test('should initialize with no subscriptions', () => {
        expect(logStreamManager.subscriptions.size).toBe(0);
    });

    test('should connect to WebSocket and send filter criteria', () => {
        logStreamManager.connect();

        const ws = logStreamManager.ws;
        const filterCriteria = JSON.stringify({
            last_seen_id: null,
            actions: [],
        });

        ws.on('send', (message) => {
            expect(message).toBe(filterCriteria);
        });

        ws.emit('open');
    });

    test('should allow subscribing to actions', () => {
        logStreamManager.subscribe('KILL');
        logStreamManager.subscribe('TEAM KILL');

        expect(logStreamManager.subscriptions.size).toBe(2);
        expect(logStreamManager.subscriptions.has('KILL')).toBe(true);
        expect(logStreamManager.subscriptions.has('TEAM KILL')).toBe(true);
    });

    test('should emit logs for subscribed actions', () => {
        logStreamManager.subscribe('KILL');

        const mockLog = {
            id: '1234-0',
            log: {
                action: 'KILL',
                player: 'Player1',
                steam_id_64_1: '76561198000000000',
            },
        };

        const logHandler = jest.fn();
        logStreamManager.on('KILL', logHandler);

        logStreamManager.handleLogMessage(
            JSON.stringify({
                logs: [mockLog],
            })
        );

        expect(logHandler).toHaveBeenCalledWith(mockLog);
    });

    test('should update last_seen_id for each action', () => {
        logStreamManager.subscribe('KILL');

        const mockLog = {
            id: '1234-0',
            log: {
                action: 'KILL',
                player: 'Player1',
            },
        };

        logStreamManager.handleLogMessage(
            JSON.stringify({
                logs: [mockLog],
            })
        );

        const subscription = logStreamManager.subscriptions.get('KILL');
        expect(subscription.lastSeenId).toBe('1234-0');
    });

    test('should not emit logs for unsubscribed actions', () => {
        logStreamManager.subscribe('KILL');

        const mockLog = {
            id: '1234-0',
            log: {
                action: 'TEAM KILL',
                player: 'Player2',
            },
        };

        const logHandler = jest.fn();
        logStreamManager.on('TEAM KILL', logHandler);

        logStreamManager.handleLogMessage(
            JSON.stringify({
                logs: [mockLog],
            })
        );

        expect(logHandler).not.toHaveBeenCalled();
    });

    test('should handle WebSocket close and attempt reconnect', (done) => {
        jest.useFakeTimers();
        logStreamManager.connect();

        const reconnectSpy = jest.spyOn(logStreamManager, 'connect');
        logStreamManager.ws.emit('close');

        expect(reconnectSpy).not.toHaveBeenCalled(); // Not called immediately
        jest.advanceTimersByTime(5000); // Simulate reconnect delay
        expect(reconnectSpy).toHaveBeenCalled();

        jest.useRealTimers();
        done();
    });

    test('should handle WebSocket errors gracefully', () => {
        logStreamManager.connect();

        const error = new Error('Test WebSocket Error');
        logStreamManager.ws.emit('error', error);

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        logStreamManager.ws.emit('error', error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('🧩 Error with CRCON WebSocket connection:', error);

        consoleErrorSpy.mockRestore();
    });
});
