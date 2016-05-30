define([], function() {
    var GameEvent = function(data){
        this.event = {};
        for (var key in data){
            if (data.hasOwnProperty(key)){
                switch (key){
                    case 'user':
                        this.user = data.user;
                        break;
                    case 'nextPlayer':
                        this.nextPlayer = data.nextPlayer;
                        break;
                    case 'type':
                        this.event.type = data.type;
                        break;
                    case 'action':
                        if (data.action == 'timeout') {
                            this.event.type = data.action;
                        }
                        break;
                    case 'userTime':
                        this.userTime = data[key];
                        break;
                    case 'userTurnTime':
                        this.userTurnTime = data[key];
                        break;
                    default:
                        this.event[key] = data[key];
                }
            }
        }
    };
    return GameEvent;
});