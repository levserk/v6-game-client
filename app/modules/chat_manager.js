define(['EE', 'translit', 'antimat'], function(EE, translit) {
    'use strict';
    var ChatManager = function (client) {
        this.client = client;
        this.first = {};
        this.last = {};
        this.fullLoaded = {};
        this.messages = {};
        this.current = client.game;
        this.currentType = 'public';
        this.MSG_COUNT = 20;
        this.MSG_INTERVBAL = 1500;

        client.on('login', this.onLogin.bind(this));
        client.on('relogin', this.onLogin.bind(this));

        client.gameManager.on('game_start', function(room){
            if (this.client.opts.showSpectators){
                this.openDialog(room.id, 'room', true);
            }
            if (!room.isPlayer) return;
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.openDialog(room.players[i].userId, room.players[i].userName);
                }
            }
        }.bind(this));

        client.gameManager.on('game_leave', function(room){
            if (this.client.opts.showSpectators){
                this.closeDialog(room.id, 'room');
            }
            if (!room.isPlayer) return;
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.closeDialog(room.players[i].userId);
                }
            }
        }.bind(this));

        client.on('disconnected', function () {});
    };

    ChatManager.prototype = new EE();

    ChatManager.prototype.initMessage = function (message, player, mode) {
        if (message.userData[mode]) message.rank = message.userData[mode].rank;
        if (!message.rank || message.rank < 1) message.rank = '—';
        if (message.target == player.userId) // is private message, set target sender
        {
            message.target = message.userId;
        }

        if (message.admin) {
            message.rank = '';
            message.userId = 0;
            message.userName = 'Админ'
        }

        if (this.client.lang != 'ru'){
            message.userName = translit(message.userName);
            message.text = translit(message.text);
        }

        message.date = new Date(message.time);
        var h = message.date.getHours();
        var m = message.date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        message.t = h + ':' + m;
        message.d = message.date.getDate() + ' ' + this.client.locale['chat']['months'][message.date.getMonth()] + ' ' + message.date.getFullYear();
        return message;
    };

    ChatManager.prototype.onLogin = function() {
        this.first = {};
        this.last = {};
        this.fullLoaded = {};
        this.messages = {};
        this.current = this.client.game;
        this.client.viewsManager.v6ChatView.setPublicTab(this.client.game);
        this.loadMessages();
    };

    ChatManager.prototype.onMessage = function (message) {
        var data = message.data, player = this.client.getPlayer(), i, cache;
        console.log('chat_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                message = this.initMessage(data, player, this.client.currentMode);
                if (!this.first[message.target]) this.first[message.target] = message;

                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                cache.push(message);
                if (cache.length>100) cache.shift();

                this.emit('message', message);
                this.last[message.target] = message;

                if (this.client.getUser(message.target) && message.target != this.current &&
                    !this.client.gameManager.inGame()){
                    this.openDialog(message.userId, message.userName);
                }
                break;
            case 'load':
                if (!data || !data.length || data.length < 1) {
                    this.fullLoaded[this.current] = true;
                    this.emit('load', null);
                    return;
                }
                message = this.initMessage(data[0], player, this.client.currentMode);
                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                for (i = 0; i < data.length; i++){
                   this.onMessageLoad(this.initMessage(data[i], player, this.client.currentMode), cache);
                }
                break;
            case 'ban':
                this.ban = message.data;
                this.emit('show_ban', message.data);
                break;
        }
    };


    ChatManager.prototype.sendMessage = function (text, target, type, admin){
        if (this.ban){
            this.emit('show_ban', this.ban);
            return;
        }
        text = text.trim();

        if (typeof text != "string" || !text.length){
            return;
        }

        if (window.containsMat(text)){
            console.warn('chat_manager; censored text', text);
            return;
        }
        if (this.lastMessageTime &&  Date.now() - this.lastMessageTime < this.MSG_INTERVBAL ){
            console.warn('chat_manager; many messages in the same time');
            return
        }
        text = text.replace(/слава.*укра[иiії]н[иеіiї]/gim, "Слава СССР");
        text = text.replace(/героям.*слава/gim, "Вам Слава");
        this.lastMessageTime = Date.now();
        var message = {
            text: text
        };
        if (type == 'private' && target && this.client.getUser(target)){

        } else {

        }
        if (admin) message.admin = true;
        if (!target) message.target = this.current;
        type = type || this.currentType;
        if (type == 'private' && message.target && !this.client.getUser(message.target)){
            console.log('chat_manager;', 'send message user offline', text, message, target, type, admin);
            return;
        }
        console.log('chat_manager;', 'send message', text, target, type, admin);
        this.client.send('chat_manager', 'message', 'server', message);
    };


    ChatManager.prototype.loadMessages = function (count, time, target, type) {
        type = type || this.currentType;
        if (this.fullLoaded[this.current]){
            console.log('chat_manager;', 'all messages loaded!', count, time, this.first);
            this.emit('load', null);
            return;
        }
        count = count || this.MSG_COUNT;
        if (!target) target = this.current;
        time = time || (this.first[target]?this.first[target].time:null);
        console.log('chat_manager;', 'loading messages', count, time, this.first, type);
        var rq = {
            count: count,
            time: time,
            target: target,
            sender: this.client.getPlayer().userId,
            type: type
        };
        if (this.client.opts.apiEnable) {
            this.client.get('chat/'+this.client.game+'/messages', rq, function(data){
                this.onMessage({
                    type: 'load',
                    data: data
                })
            }.bind(this))
        } else {
            this.client.send('chat_manager', 'load', 'server', rq);
        }
    };


    ChatManager.prototype.onMessageLoad = function(message, cache){
        if (cache && cache.length<100) cache.unshift(message);
        if (!this.client.settings.blacklist[message.userId]) {
            if (!this.first[message.target]) this.first[message.target] = message;
            if (!this.last[message.target]) this.last[message.target] = message;
            this.emit('load', message);
            this.first[message.target] = message;
        }
    };


    ChatManager.prototype.openDialog = function(userId, userName, room){
        this.current = userId;
        if (room) {
            this.currentType = 'room';
            this.emit('open_dialog', { roomId: userId });
        }
        else {
            this.currentType = 'private';
            this.emit('open_dialog', { userId: userId, userName: userName });
        }
        this.loadCachedMessages(userId);
    };


    ChatManager.prototype.closeDialog = function (target){
        this.currentType = 'public';
        this.emit('close_dialog', target || this.current);
        this.loadCachedMessages(this.client.game);
    };


    ChatManager.prototype.loadCachedMessages = function (target, type){
        this.current = target;
        this.currentType = type || this.currentType;
        this.first[target] = this.last[target] = null;
        if (this.messages[target] && this.messages[target].length>0){ // load cached messages;
            for (var i = this.messages[target].length - 1; i >= 0; i-- ){
                this.onMessageLoad(this.messages[target][i]);
            }
        }
        if (this.messages[target] && this.messages[target].length > 0
            && this.messages[target].length < this.MSG_COUNT) {
            this.loadMessages(this.MSG_COUNT, this.messages[target][0].time, target);
        }  else this.loadMessages(this.MSG_COUNT, null, target);
    };


    ChatManager.prototype.addUserToBlackList = function(user){
        if (user.userId == this.client.getPlayer().userId) return;
        var blacklist = this.client.settings.blacklist;
        if (blacklist[user.userId]){
            console.warn('chat_manager;', 'addUserToBlackList', 'user ', user, 'already in list');
            return;
        }
        blacklist[user.userId] = {
            userId: user.userId,
            userName: user.userName,
            time: Date.now()
        };
        this.client._onSettingsChanged({property: 'blacklist', value: blacklist});
    };

    ChatManager.prototype.removeUserFromBlackList = function(userId){
        var blacklist = this.client.settings.blacklist;
        if (blacklist[userId]){
            delete blacklist[userId];
            this.client._onSettingsChanged({property: 'blacklist', value: blacklist});
            return;
        }
        console.warn('chat_manager;', 'removeUserFromBlackList', 'userId ', userId, 'not in list');
    };


    ChatManager.prototype.banUser = function(userId, days, reason) {
        console.log('chat_manager;', 'banUser', userId, days, reason);
        this.client.send('chat_manager', 'ban', 'server', {userId:userId, days:days, reason:reason});
    };

    ChatManager.prototype.deleteMessage = function(time) {
        console.log('chat_manager;', 'deleteMessage', time);
        this.client.send('chat_manager', 'delete', 'server', {time:time});
    };

    return ChatManager;
});