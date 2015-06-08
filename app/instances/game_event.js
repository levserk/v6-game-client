define([], function() {
    var GameEvent = function(data){
        this.event = {};
        for (var key in data){
            if (data.hasOwnProperty(key)){
                switch (key){
                    case 'user':
                        this.user = data.user;
                        break;
                    case 'type':
                        this.event.type = data.type;
                        break;
                    case 'action':
                        if (data.action == 'timeout') {
                            data.type = data.action;
                        }
                        break;
                    default:
                        this.event[key] = data[key];
                }
            }
        }
    };
    return GameEvent;
});