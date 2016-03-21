define(['EE'], function(EE) {
    'use strict';

    var Socket = function(opts){
        opts = opts || {};
        this.port = opts.port||'8080';
        this.domain = opts.domain || document.domain;
        if (this.domain.substr(0,4) == 'www.'){
            this.domain = this.domain.substr(4);
        }
        this.game = opts.game||"test";
        this.prefix = 'ws/';
        this.url = opts.url || this.game;
        this.https = opts.https || false;
        if (this.domain == "test.logic-games.spb.ru") this.domain = "logic-games.spb.ru";
        if (this.domain != 'logic-games.spb.ru') this.https = false;
        this.protocol = (this.https?'wss':'ws');
        this.connectionCount = 0;

        this.isConnecting = true;
        this.isConnected = false;
        this.reconnectTimeout = null;
        this.timeOutInterval = 100000
    };

    Socket.prototype  = new EE();


    Socket.prototype.init = function(){
        var self = this;
        this.isConnecting = true;
        this.isConnected = false;
        this.timeConnection = this.timeLastMessage = Date.now();
        this.connectionCount++;

        try{
            //// TODO: test config, remove this
            //if (window.location.hostname == "test.logic-games.spb.ru" && this.url != "domino"){
            //    this.ws = new WebSocket (this.protocol + '://' + this.domain + '/' + this.prefix + this.url);
            //}
            //else
                this.ws = new WebSocket (this.protocol + '://' + this.domain + ':' + this.port+'/' + this.url);

            this.ws.onclose = function (code, message) {
                console.log('socket;', 'ws closed', code, message);
                if (self.isConnected) self.onDisconnect();
            };

            this.ws.onerror = function (error) {
                self.onError(error);
            };

            this.ws.onmessage = function (data, flags) {
                clearTimeout(self.reconnectTimeout);
                self.reconnectTimeout = setTimeout(function(){
                    if (Date.now() - self.timeLastMessage >= self.timeOutInterval){
                        console.log('socket;', 'ws timeout', Date.now() - self.timeLastMessage);
                        self.ws.close();
                        self.onDisconnect();
                    }
                }, self.timeOutInterval);
                self.timeLastMessage = Date.now();

                if (data.data == 'ping') {
                    self.ws.send('pong');
                    return;
                }
                console.log('socket;', 'ws message', data, flags);
                try{
                    data = JSON.parse(data.data)
                } catch (e) {
                    console.log('socket;', 'ws wrong data in message', e);
                    return;
                }

                self.onMessage(data);
            };

            this.ws.onopen = function () {
                console.log('socket;', new Date(), 'ws open');
                self.onConnect();
            };

        } catch (error) {
            console.log('socket;', 'ws open error');
            this.onError(error);
        }


    };

    Socket.prototype.onError = function(error){
        console.log('socket;', 'ws error', error);
        if (this.isConnecting){
            this.isConnecting = false;
            console.log('socket;', "ws connection failed!");
            this.onConnectionFailed();
        }
    };


    Socket.prototype.onConnect = function(){
        this.isConnected = true;
        this.connectionCount = 0;
        this.emit("connection");
    };


    Socket.prototype.onDisconnect = function(){
        this.isConnected = false;
        this.emit("disconnection");
    };


    Socket.prototype.onMessage = function(data){
        this.emit("message", data);
    };


    Socket.prototype.onConnectionFailed = function(){
        this.isConnecting = false;
        this.isConnected = false;
        this.emit("failed");
    };


    Socket.prototype.send = function (data) {
        try{
            data = JSON.stringify(data);
        } catch (error){
            console.warn('socket;', "json stringify err", data, error);
            return;
        }
        this.ws.send(data);
    };

    return Socket;
});