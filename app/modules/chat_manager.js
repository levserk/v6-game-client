define(['EE'], function(EE) {
    'use strict';
    var ChatManager = function (client) {
        this.client = client;
        this.first = {};
        this.last = {};
        this.fullLoaded = {};
        this.messages = {};
        this.current = client.game;
        this.MSG_COUNT = 10;

        client.on('login', this.loadMessages.bind(this));

        client.gameManager.on('game_start', function(room){
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.openDialog(room.players[i].userId, room.players[i].userName);
                }
            }
        }.bind(this));

        client.gameManager.on('game_leave', function(room){
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.closeDialog(room.players[i].userId);
                }
            }
        }.bind(this));
    };

    ChatManager.prototype = new EE();


    ChatManager.initMessage = function(message, player){
        for (var i in message.userData){
            message.rank = message.userData[i].rank;
            if (!message.rank || message.rank < 1) message.rank = '—';
        }
        if (message.target == player.userId) // is private message, set target sender
            message.target = message.userId;

        if (message.admin) {
            message.rank = '';
            message.userId = 0;
            message.userName = 'Админ'
        }

        message.date = new Date(message.time);
        var h = message.date.getHours();
        var m = message.date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        message.t =  h + ':' + m;
        message.d = message.date.getDate() + ' ' + ChatManager.months[message.date.getMonth()] + ' ' + message.date.getFullYear();
        return message;
    };

    ChatManager.months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Сентября', 'Октября', 'Ноября', 'Декабря'];


    ChatManager.prototype.onMessage = function (message) {
        var data = message.data, player = this.client.getPlayer(), i, cache;
        console.log('chat_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                message = ChatManager.initMessage(data, player);
                if (!this.first[message.target]) this.first[message.target] = message;

                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                cache.push(message);
                if (cache.length>100) cache.shift();

                this.emit('message', message);
                this.last[message.target] = message;

                if (message.target != this.client.game && message.target != this.current) this.openDialog(message.userId, message.userName);
                break;
            case 'load':
                if (!data.length || data.length<1) {
                    this.fullLoaded[this.current] = true;
                    this.emit('load', null);
                    return;
                }
                message = ChatManager.initMessage(data[0], player);
                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                for (i = 0; i < data.length; i++){
                   this.onMessageLoad(ChatManager.initMessage(data[i], player), cache);
                }
                break;
            case 'ban':
                this.ban = message.data;
                this.emit('show_ban', message.data);
                break;
        }
    };


    ChatManager.prototype.sendMessage = function (text, target, admin){
        if (this.ban){
            this.emit('show_ban', this.ban);
            return;
        }
        var message = {
            text: text
        };
        if (admin) message.admin = true;
        if (!target) message.target = this.current;
        this.client.send('chat_manager', 'message', 'server', message);
    };


    ChatManager.prototype.loadMessages = function (count, time, target) {
        if (this.fullLoaded[this.current]){
            console.log('chat_manager;', 'all messages loaded!', count, time, this.first);
            this.emit('load', null);
            return;
        }
        count = count || this.MSG_COUNT;
        if (!target) target = this.current;
        time = time || (this.first[target]?this.first[target].time:null);
        console.log('chat_manager;', 'loading messages', count, time, this.first);
       this.client.send('chat_manager', 'load', 'server', {count:count, time:time, target:target});
    };


    ChatManager.prototype.onMessageLoad = function(message, cache){
        if (cache && cache.length<100) cache.unshift(message);
        if (!this.first[message.target]) this.first[message.target] = message;
        if (!this.last[message.target]) this.last[message.target] = message;
        this.emit('load', message);
        this.first[message.target] = message;
    };


    ChatManager.prototype.openDialog = function(userId, userName){
        this.current = userId;
        this.emit('open_dialog', {userId: userId, userName:userName});
        this.loadCachedMessages(userId);
    };


    ChatManager.prototype.closeDialog = function (target){
        this.emit('close_dialog', target || this.current);
        this.loadCachedMessages(this.client.game);
    };


    ChatManager.prototype.loadCachedMessages = function (target){
        this.current = target;
        this.first[target] = this.last[target] = null;
        if (this.messages[target] && this.messages[target].length>0){ // load cached messages;
            for (var i = this.messages[target].length - 1; i >= 0; i-- ){
                this.onMessageLoad(this.messages[target][i]);
            }
        }
        if (this.messages[target] && this.messages[target].length > 0
            && this.messages[target].length < this.MSG_COUNT) {
            this.loadMessages(this.MSG_COUNT, this.messages[target][0], target);
        }  else this.loadMessages(this.MSG_COUNT, null, target);
    };


    ChatManager.prototype.banUser = function(userId, days, reason) {
        console.log('log;', 'ChatManager.banUser', userId, days, reason);
        this.client.send('chat_manager', 'ban', 'server', {userId:userId, days:days, reason:reason});
    };

    return ChatManager;
});