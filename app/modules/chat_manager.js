define(['EE'], function(EE) {
    'use strict';

    var ChatManager = function (client) {
        this.client = client;
        this.first = null;
        this.last = null;
        this.loading = true;
        this.messages = [];
        client.on('login', this.loadMessages.bind(this));
    };

    ChatManager.prototype = new EE();


    ChatManager.initMessage = function(message){
        for (var i in message.userData){
            message.rank = message.userData[i].rank;
            if (!message.rank || message.rank < 1) message.rank = '—';
        }
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
        var data = message.data, player = this.client.getPlayer(), i;
        console.log('chat_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                message = ChatManager.initMessage(data);
                if (!this.first) this.first = message;
                if (!this.last) this.last = message;
                this.messages.push(message);
                if (this.messages.length>100)this.messages.shift();
                this.emit('message', message);
                this.last = message;
                break;
            case 'load':
                if (!data.length) {
                    this.loading = false;
                    this.emit('load', null);
                }
                message = null;
                for (i = data.length-1; i >= 0; i--){
                    message = ChatManager.initMessage(data[i]);
                    if (this.messages.length<100)this.messages.unshift(message);
                    if (!this.first) this.first = message;
                    if (!this.last) this.last = message;
                    this.emit('load', message);
                    this.first = message;
                }
                break;
        }
    };

    ChatManager.prototype.sendMessage = function (text, target, admin){
        var message = {
            text: text
        };
        if (admin) message.admin = true;
        this.client.send('chat_manager', 'message', 'server', message);
    };


    ChatManager.prototype.loadMessages = function (count, time, target) {
        if (!target && !this.loading){
            console.log('chat_manager;', 'all messages loaded!', count, time, this.first);
            return;
        }
        count = count || 10;
        time = time || (this.first?this.first.time:null);
        console.log('chat_manager;', 'loading messages', count, time, this.first);
        setTimeout(function() { this.client.send('chat_manager', 'load', 'server', {count:count, time:time}); }.bind(this), 500);
    };

    ChatManager.prototype.loadCachedMessages = function (){
        if (this.messages.length>0){
            this.first = this.messages[0];
            this.last = this.messages[this.messages.length-1];
            return this.messages;
        } else return null;
    };

    return ChatManager;
});