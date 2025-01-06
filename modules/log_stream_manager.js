const WebSocket = require('ws');
const EventEmitter = require('events');
require('dotenv').config();

const CRCON_WS_URL = process.env.CRCON_WS_URL;
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;

class LogStreamManager extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.reconnectDelay = 5000; // 5 seconds
        this.subscriptions = new Map(); // Holds actions and their last_seen_id
    }

    connect() {
        const url = CRCON_WS_URL;
        const headers = {
            Authorization: `Bearer ${CRCON_API_TOKEN}`,
        };

        this.ws = new WebSocket(url, { headers });

        this.ws.on('open', () => {
            console.log('🧩 Connected to CRCON WebSocket log stream.');
            this.isConnected = true;
            this.sendFilterCriteria(); // Send initial filter criteria
        });

        this.ws.on('message', (message) => {
            this.handleLogMessage(message);
        });

        this.ws.on('close', () => {
            console.log('🧩 Connection to CRCON WebSocket closed.');
            this.isConnected = false;
            setTimeout(() => this.connect(), this.reconnectDelay); // Reconnect
        });

        this.ws.on('error', (error) => {
            console.error('🧩 Error with CRCON WebSocket connection:', error);
        });
    }

    sendFilterCriteria() {
        if (this.isConnected) {
            const actions = Array.from(this.subscriptions.keys());
            const filterCriteria = {
                last_seen_id: null, // Let each subscription handle its own `last_seen_id`
                actions,
            };

            this.ws.send(JSON.stringify(filterCriteria), (err) => {
                if (err) {
                    console.error('🧩 Failed to send filter criteria:', err);
                } else {
                    console.log('🧩 Sent filter criteria:', filterCriteria);
                }
            });
        }
    }

    handleLogMessage(message) {
        try {
            const data = JSON.parse(message);

            if (data.logs && data.logs.length > 0) {
                for (const log of data.logs) {
                    const action = log.log.action;
                    const subscription = this.subscriptions.get(action);

                    if (subscription) {
                        // Emit log if it's new
                        if (!subscription.lastSeenId || log.id > subscription.lastSeenId) {
                            this.emit(action, log); // Emit log for this specific action
                            subscription.lastSeenId = log.id; // Update last_seen_id for the action
                        }
                    }
                }
            } else if (data.error) {
                console.error('🧩 CRCON Log Stream Error:', data.error);
            }
        } catch (error) {
            console.error('🧩 Failed to process log message:', error);
        }
    }

    subscribe(action) {
        if (!this.subscriptions.has(action)) {
            this.subscriptions.set(action, { lastSeenId: null }); // Initialize subscription
        }
        if (this.isConnected) {
            this.sendFilterCriteria();
        }
    }

    unsubscribe(action) {
        if (this.subscriptions.has(action)) {
            this.subscriptions.delete(action);
        }
        if (this.isConnected) {
            this.sendFilterCriteria();
        }
    }
}

const logStreamManager = new LogStreamManager();
logStreamManager.connect();

module.exports = {
    LogStreamManager, // Export the class for testing
    logStreamManager, // Export the instance for application use
};