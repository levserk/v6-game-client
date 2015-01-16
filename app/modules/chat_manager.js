define(['EE'], function(EE) {
    'use strict';

    var ChatManager = function (client) {
        this.client = client;
    };

    ChatManager.prototype = new EE();


    ChatManager.getTime = function(message){
        message.date = new Date(message.time);
        var h = message.date.getHours();
        var m = message.date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        message.t =  h + ':' + m;
        message.d = message.date.getDay() + ' ' + ChatManager.months[message.date.getMonth()-1] + ' ' + message.date.getYear();
        return message;
    };

    ChatManager.months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Сентября', 'Октября', 'Ноября', 'Декабря'];


    ChatManager.prototype.onMessage = function (message) {
        var data = message.data, player = this.client.getPlayer(), i;
        console.log('chat_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                for (i in data.userData){
                    data.rank = data.userData[i].rank;
                    if (!data.rank || data.rank < 1) data.rank = '—';
                }
                if (data.admin) {
                    data.rank = '';
                    data.userId = 0;
                    data.userName = 'Админ'
                }
                this.emit('message', ChatManager.getTime(data));
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

    return ChatManager;
});